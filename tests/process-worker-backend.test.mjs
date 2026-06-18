import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { createLocalProcessWorkerTransport } from "../packages/kernel/src/ProcessWorkerBackend.js";

test("ProcessManager can execute node commands through the process-worker backend", async () => {
  const kernel = new Kernel({
    processWorkerFactory: createLocalProcessWorkerTransport
  });

  const result = await kernel.run("node", ["-e", "console.log('worker backend')"], {
    cwd: "/workspace"
  });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "worker backend\n");
});

test("process-worker backend keeps parents alive for virtual child_process output", async () => {
  const kernel = new Kernel({
    processWorkerFactory: createLocalProcessWorkerTransport
  });

  const result = await kernel.run("node", [
    "-e",
    `
      const { spawn } = require('child_process');
      const child = spawn('node', ['-e', "console.log('child via worker backend')"], {
        env: { OPENCONTAINERS_DISABLE_PROCESS_WORKERS: '1' }
      });
      child.stdout.on('data', (chunk) => console.log(String(chunk).trim()));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "child via worker backend\n");
});
