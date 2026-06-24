import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

const matrix = JSON.parse(readFileSync(new URL("../docs/compat/nodejs.json", import.meta.url), "utf8"));
const generatedDocs = readFileSync(new URL("../docs/compat/nodejs.md", import.meta.url), "utf8");
const unsupportedDocs = readFileSync(new URL("../docs/compat/unsupported.md", import.meta.url), "utf8");
const STATUSES = new Set(["full", "partial", "stubbed", "blocked", "missing"]);

test("compatibility matrix rows are complete and documented", () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.ok(Array.isArray(matrix.modules));
  assert.ok(Array.isArray(matrix.globals));

  for (const row of [...matrix.modules, ...matrix.globals]) {
    assert.ok(row.specifier || row.name, "row needs a specifier or name");
    assert.ok(STATUSES.has(row.targetStatus), `${row.specifier ?? row.name} has invalid targetStatus`);
    assert.ok(STATUSES.has(row.currentStatus), `${row.specifier ?? row.name} has invalid currentStatus`);
    assert.ok(row.owner, `${row.specifier ?? row.name} is missing an owner`);
    assert.ok(row.test, `${row.specifier ?? row.name} is missing a test reference`);
    assert.ok(Object.hasOwn(row, "limitation"), `${row.specifier ?? row.name} is missing limitation text`);

    if (row.currentStatus === "full") {
      assert.ok(row.probe, `${row.specifier ?? row.name} is marked full but has no behavioral probe`);
    }
  }

  for (const row of matrix.modules) {
    assert.ok(generatedDocs.includes(`\`${row.specifier}\``), `generated docs missing ${row.specifier}`);
    if (row.unsupported) {
      assert.ok(unsupportedDocs.includes(`\`${row.specifier}\``), `unsupported docs missing ${row.specifier}`);
      assert.ok(unsupportedDocs.includes(`\`${row.unsupported.code}\``), `unsupported docs missing ${row.unsupported.code}`);
    }
  }
  for (const row of matrix.globals) {
    assert.ok(generatedDocs.includes(`\`${row.name}\``), `generated docs missing ${row.name}`);
  }
});

test("all tracked core modules resolve inside OpenContainers", async () => {
  const kernel = new Kernel();
  const source = [
    "const modules = " + JSON.stringify(matrix.modules.map((row) => row.specifier)) + ";",
    "for (const specifier of modules) {",
    "  const value = require(specifier);",
    "  if (value == null) throw new Error(`${specifier} resolved to ${value}`);",
    "}",
    "console.log(`resolved:${modules.length}`);"
  ].join("\n");

  const result = await kernel.run("node", ["-e", source], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), new RegExp(`resolved:${matrix.modules.length}`));
});

test("full module/global probes execute inside OpenContainers", async () => {
  const moduleProbes = matrix.modules
    .filter((row) => row.probe)
    .map((row) => ({ id: row.specifier, code: row.probe }));
  const globalProbes = matrix.globals
    .filter((row) => row.probe)
    .map((row) => ({ id: row.name, code: row.probe }));
  const kernel = new Kernel();
  const source = [
    "const moduleProbes = [];",
    ...moduleProbes.map((probe) => `moduleProbes.push({ id: ${JSON.stringify(probe.id)}, run: async () => { ${probe.code}; } });`),
    "const globalProbes = [];",
    ...globalProbes.map((probe) => `globalProbes.push({ id: ${JSON.stringify(probe.id)}, run: async () => { if (!(${probe.code})) throw new Error('global probe returned false'); } });`),
    "for (const probe of [...moduleProbes, ...globalProbes]) {",
    "  try {",
    "    await probe.run();",
    "  } catch (error) {",
    "    error.message = `${probe.id}: ${error.message}`;",
    "    throw error;",
    "  }",
    "}",
    "console.log(`probes:${moduleProbes.length + globalProbes.length}`);"
  ].join("\n");

  kernel.fs.writeFileSync("/workspace/compat-probes.mjs", source);
  const result = await kernel.run("node", ["compat-probes.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), new RegExp(`probes:${moduleProbes.length + globalProbes.length}`));
});

test("blocked and unsupported module APIs throw stable OpenContainers errors", async () => {
  const unsupported = matrix.modules
    .filter((row) => row.unsupported)
    .map((row) => ({
      id: row.specifier,
      probe: row.unsupported.probe,
      code: row.unsupported.code
    }));
  const kernel = new Kernel();
  const source = [
    "const unsupported = " + JSON.stringify(unsupported) + ";",
    "for (const row of unsupported) {",
    "  try {",
    "    eval(row.probe);",
    "    throw new Error(`Expected ${row.id} to throw ${row.code}`);",
    "  } catch (error) {",
    "    if (error.code !== row.code) {",
    "      throw new Error(`${row.id} threw ${error.code || error.name}, expected ${row.code}: ${error.message}`);",
    "    }",
    "  }",
    "}",
    "console.log(`unsupported:${unsupported.length}`);"
  ].join("\n");

  const result = await kernel.run("node", ["-e", source], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), new RegExp(`unsupported:${unsupported.length}`));
});
