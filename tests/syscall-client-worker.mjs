import { parentPort, workerData } from "node:worker_threads";
import { SyscallMailbox } from "../packages/runtime-node/src/syscall-mailbox.js";

const mailbox = new SyscallMailbox(workerData.buffer);

try {
  const value = mailbox.submitSync(workerData.request);
  parentPort.postMessage({ ok: true, value });
} catch (error) {
  parentPort.postMessage({ ok: false, error: { message: error.message, code: error.code } });
}
