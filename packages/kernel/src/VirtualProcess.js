import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { OutputStream } from "./OutputStream.js";

const SIGNAL_NUMBERS = new Map([
  [1, "SIGHUP"],
  [2, "SIGINT"],
  [3, "SIGQUIT"],
  [6, "SIGABRT"],
  [9, "SIGKILL"],
  [14, "SIGALRM"],
  [15, "SIGTERM"]
]);

export class VirtualProcess extends EventEmitter {
  constructor(descriptor) {
    super();
    this.pid = descriptor.pid;
    this.descriptor = descriptor;
    this.stdin = descriptor.stdin ?? new OutputStream();
    descriptor.stdin = this.stdin;
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
    const cleanupTasks = [...(this.descriptor.cleanupTasks ?? [])];
    this.descriptor.cleanupTasks?.clear();
    for (const cleanup of cleanupTasks) {
      try {
        cleanup();
      } catch (_) {}
    }
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
    this.#resolveCompleted({ pid: this.pid, status: code, signal, stdout: this.stdout.toBuffer(), stderr: this.stderr.toBuffer() });
  }

  fail(error) {
    this.stderr.write(`${error.stack ?? error.message ?? error}\n`);
    if (this.listenerCount("error") > 0) this.emit("error", error);
    this.finish(1);
  }

  failToSpawn(error, code = -2) {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.signalCode = null;
    this.descriptor.status = "exited";
    if (this.listenerCount("error") > 0) this.emit("error", error);
    this.emit("spawn-failure-close", code, null);
    this.#resolveCompleted({
      pid: this.pid,
      status: code,
      signal: null,
      stdout: this.stdout.toBuffer(),
      stderr: this.stderr.toBuffer()
    });
  }

  kill(signal = "SIGTERM") {
    const normalizedSignal = normalizeVirtualSignal(signal);
    this.descriptor.status = "killed";
    this.finish(signalExitCode(normalizedSignal), normalizedSignal);
  }
}

function normalizeVirtualSignal(signal) {
  if (signal === undefined || signal === null) return "SIGTERM";
  if (typeof signal === "number" && SIGNAL_NUMBERS.has(signal)) return SIGNAL_NUMBERS.get(signal);
  return String(signal);
}

function signalExitCode(signal) {
  for (const [number, name] of SIGNAL_NUMBERS) {
    if (name === signal) return 128 + number;
  }
  return 143;
}
