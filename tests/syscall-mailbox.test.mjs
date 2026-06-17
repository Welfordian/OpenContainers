import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { SyscallMailbox } from "../packages/runtime-node/src/syscall-mailbox.js";

test("SharedArrayBuffer syscall mailbox supports blocking process-side fs calls", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/a.txt", "from syscall");
  const mailbox = SyscallMailbox.create();

  const worker = new Worker(new URL("./syscall-client-worker.mjs", import.meta.url), {
    workerData: {
      buffer: mailbox.buffer,
      request: { op: "fs.readFileSync", path: "a.txt", encoding: "utf8" }
    }
  });

  const served = await kernel.syscalls.serveOnce(mailbox, { cwd: "/workspace", env: {}, projectId: "demo" });
  assert.equal(served, true);
  const [message] = await once(worker, "message");
  assert.deepEqual(message, { ok: true, value: "from syscall" });
});
