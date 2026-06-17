import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { OutputStream } from "./OutputStream.js";

export class VirtualProcess extends EventEmitter {
  constructor(descriptor) {
    super();
    this.pid = descriptor.pid;
    this.descriptor = descriptor;
    this.stdin = new OutputStream();
    this.stdout = descriptor.stdout;
    this.stderr = descriptor.stderr;
    this.exitCode = null;
    this.signalCode = null;
    this.completed = new Promise((resolve) => {
      this.#resolveCompleted = resolve;
    });
  }

  #resolveCompleted;

  finish(code = 0, signal = null) {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.descriptor.status = "exited";
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
    this.#resolveCompleted({ pid: this.pid, status: code, signal, stdout: this.stdout.toBuffer(), stderr: this.stderr.toBuffer() });
  }

  fail(error) {
    this.stderr.write(`${error.stack ?? error.message ?? error}\n`);
    if (this.listenerCount("error") > 0) this.emit("error", error);
    this.finish(1);
  }

  kill(signal = "SIGTERM") {
    this.descriptor.status = "killed";
    this.finish(signal === "SIGKILL" ? 137 : 143, signal);
  }
}
