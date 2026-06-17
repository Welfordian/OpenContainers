import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(root, "fixtures");
const manifestFiles = new Set(["commands.json", "expected-output.json", "preview-assertions.json"]);

test("fixture suite validates Express, npm, child_process, fs.watch, WebSocket, and Vite-shaped workflows", async (t) => {
  const registry = JSON.parse(await readFile(path.join(fixturesRoot, "_registry.json"), "utf8"));
  const fixtureNames = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const fixtureName of fixtureNames) {
    await t.test(fixtureName, async () => {
      const output = await runFixture(fixtureName, registry);
      assert.ok(output);
    });
  }
});

async function runFixture(fixtureName, registry) {
  const fixtureDir = path.join(fixturesRoot, fixtureName);
  const commands = JSON.parse(await readFile(path.join(fixtureDir, "commands.json"), "utf8"));
  const expected = JSON.parse(await readFile(path.join(fixtureDir, "expected-output.json"), "utf8"));
  const preview = JSON.parse(await readFile(path.join(fixtureDir, "preview-assertions.json"), "utf8"));
  const projectId = `fixture-${fixtureName}`;
  const kernel = new Kernel({
    registryClient: new MemoryRegistryClient(registry)
  });
  await copyFixtureFiles(kernel, fixtureDir);

  let output = "";
  const detachedProcesses = [];
  for (const command of commands) {
    if (command.detached) {
      const process = kernel.spawn("sh", ["-c", command.command], {
        cwd: "/workspace",
        projectId
      });
      process.stdout.on("data", (chunk) => { output += String(chunk); });
      process.stderr.on("data", (chunk) => { output += String(chunk); });
      detachedProcesses.push(process);
      await new Promise((resolve) => setTimeout(resolve, 5));
    } else {
      const result = await kernel.run("sh", ["-c", command.command], {
        cwd: "/workspace",
        projectId
      });
      output += result.stdout.toString();
      output += result.stderr.toString();
      assert.equal(result.status, 0, `${fixtureName}: ${command.command}\n${output}`);
    }
  }

  if ((expected.contains ?? []).length) {
    try {
      await eventually(() => expected.contains.every((expectedText) => output.includes(expectedText)));
    } catch (error) {
      assert.fail(`${fixtureName} timed out waiting for expected output\n${output}`);
    }
  }
  for (const expectedText of expected.contains ?? []) {
    assert.match(output, new RegExp(escapeRegExp(expectedText)), `${fixtureName} output should include ${expectedText}\n${output}`);
  }

  if (preview) await assertPreview(kernel, preview);
  for (const process of detachedProcesses) process.kill("SIGTERM");
  return output || "ok";
}

async function assertPreview(kernel, preview) {
  await eventually(async () => {
    const response = await kernel.dispatchHttpRequest({
      projectId: preview.projectId,
      port: preview.port,
      method: "GET",
      url: preview.path,
      headers: []
    });
    return response.status === preview.status && String(Buffer.from(response.body ?? "").toString()).includes(preview.bodyContains);
  });

  if (preview.webSocket) {
    const socket = kernel.connectWebSocket({
      projectId: preview.projectId,
      port: preview.port,
      path: preview.webSocket.path
    });
    const messages = [];
    socket.addEventListener("message", (event) => messages.push(event.data));
    await new Promise((resolve) => socket.addEventListener("open", resolve));
    socket.send(preview.webSocket.send);
    await eventually(() => preview.webSocket.messages.every((message) => messages.includes(message)));
  }
}

async function copyFixtureFiles(kernel, fixtureDir, relative = "") {
  for (const entry of await readdir(path.join(fixtureDir, relative), { withFileTypes: true })) {
    const relativePath = path.join(relative, entry.name);
    const source = path.join(fixtureDir, relativePath);
    if (entry.isDirectory()) {
      await copyFixtureFiles(kernel, fixtureDir, relativePath);
      continue;
    }
    if (!relative && manifestFiles.has(entry.name)) continue;
    const target = `/workspace/${relativePath.split(path.sep).join("/")}`;
    kernel.fs.mkdirSync(path.posix.dirname(target), { recursive: true });
    kernel.fs.writeFileSync(target, await readFile(source));
  }
}

async function eventually(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for fixture condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
