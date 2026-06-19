import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("child_process.spawnSync and execSync run simple virtual commands synchronously", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { spawnSync, execSync } = require('child_process');
      const child = spawnSync('node', ['-e', "console.log('sync child')"]);
      console.log(child.status);
      console.log(child.stdout.toString().trim());
      console.log(execSync('echo sync shell').toString().trim());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "0\nsync child\nsync shell\n");
});

test("child_process.spawn inherits default env and preserves shell exit status", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/child-process.mjs", `
    import { spawn } from "node:child_process";

    console.log("env HOME:", process.env.HOME);
    console.log("env PATH:", process.env.PATH);

    if (!process.env.HOME) throw new Error("Expected HOME to be set");
    if (!process.env.PATH) throw new Error("Expected PATH to be set");

    const child = spawn("sh", ["-c", "echo child works && exit 7"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        REPL_TEST_VAR: "hello"
      }
    });

    child.stdout.on("data", (chunk) => {
      console.log("stdout:", chunk.toString().trim());
    });

    child.stderr.on("data", (chunk) => {
      console.error("stderr:", chunk.toString().trim());
    });

    const code = await new Promise((resolve) => {
      child.on("close", resolve);
    });

    console.log("child exit code:", code);

    if (code !== 7) {
      throw new Error(\`Expected exit code 7, got \${code}\`);
    }
  `);

  const result = await kernel.run("node", ["child-process.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), /env HOME: \/home\/opencontainers\n/);
  assert.match(result.stdout.toString(), /env PATH: .*\/workspace\/node_modules\/\.bin/);
  assert.match(result.stdout.toString(), /stdout: child works\n/);
  assert.match(result.stdout.toString(), /child exit code: 7\n/);
  assert.equal(result.stderr.toString(), "");
});

test("child_process.spawn forwards inherited stdout and stderr", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/inherit.mjs", `
    import { spawn } from "node:child_process";

    const child = spawn("node", ["-e", "console.log('inherited out'); console.error('inherited err')"], {
      stdio: "inherit"
    });

    const code = await new Promise((resolve) => child.on("close", resolve));
    console.log("child exit code:", code);
  `);

  const result = await kernel.run("node", ["inherit.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "inherited out\nchild exit code: 0\n");
  assert.equal(result.stderr.toString(), "inherited err\n");
});
