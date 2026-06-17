import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { ProcessWorkerHost } from "../packages/runtime-node/src/process-worker-host.js";

test("ProcessWorkerHost boots, runs NodeRuntime code, streams output, and reports exit", async () => {
  const kernel = new Kernel();
  const messages = [];
  const host = new ProcessWorkerHost({
    kernel,
    postMessage: (message) => messages.push(message)
  });

  await host.handleMessage({
    id: "boot",
    type: "boot",
    descriptor: {
      pid: 501,
      cwd: "/workspace",
      argv: ["node", "-e", "console.log('worker')"],
      env: { WELFORD_PROJECT_ID: "demo" }
    }
  });
  await host.handleMessage({
    id: "run",
    type: "run",
    args: ["-e", "console.log('worker')"]
  });

  assert.deepEqual(messages.find((message) => message.type === "reply" && message.requestId === "boot").payload, {
    ok: true,
    pid: 501
  });
  assert.equal(messages.find((message) => message.type === "stream" && message.stream === "stdout").chunk, "worker\n");
  assert.equal(messages.find((message) => message.type === "exit").status, 0);
  assert.equal(messages.find((message) => message.type === "reply" && message.requestId === "run").payload.status, 0);
});

test("ProcessWorkerHost reports a clear boot error without a kernel binding", async () => {
  const messages = [];
  const host = new ProcessWorkerHost({ postMessage: (message) => messages.push(message) });

  await host.handleMessage({
    id: "boot",
    type: "boot",
    descriptor: {
      pid: 502,
      cwd: "/workspace",
      argv: ["node", "-e", ""],
      env: {}
    }
  });

  const reply = messages.find((message) => message.type === "reply" && message.requestId === "boot");
  assert.equal(reply.payload.ok, false);
  assert.equal(reply.payload.error.code, "ERR_WELFORD_PROCESS_WORKER_KERNEL_MISSING");
});
