import { EventEmitter } from "./builtins/events.js";
import { NodeRuntime } from "./NodeRuntime.js";

export class ProcessWorkerHost extends EventEmitter {
  constructor({ kernel, postMessage = () => {} } = {}) {
    super();
    this.kernel = kernel;
    this.postMessage = postMessage;
    this.descriptor = null;
    this.runtime = null;
    this.running = null;
  }

  async handleMessage(message) {
    if (!message || typeof message !== "object") return;
    try {
      switch (message.type) {
        case "boot":
          this.boot(message.descriptor);
          this.reply(message.id, { ok: true, pid: this.descriptor.pid });
          break;
        case "run":
          await this.run(message.id, message.args ?? this.descriptor.argv.slice(1));
          break;
        case "signal":
          this.signal(message.signal ?? "SIGTERM");
          this.reply(message.id, { ok: true });
          break;
        default:
          throw new Error(`Unknown process worker message: ${message.type}`);
      }
    } catch (error) {
      this.reply(message.id, { ok: false, error: serializeError(error) });
    }
  }

  boot(descriptor) {
    if (!this.kernel) {
      throw Object.assign(new Error("ProcessWorkerHost requires a kernel binding before boot"), {
        code: "ERR_WELFORD_PROCESS_WORKER_KERNEL_MISSING"
      });
    }
    this.descriptor = {
      ...descriptor,
      env: { ...(descriptor.env ?? {}) },
      stdout: this.stream("stdout"),
      stderr: this.stream("stderr"),
      stdin: this.stream("stdin"),
      status: "starting"
    };
    this.runtime = new NodeRuntime({ kernel: this.kernel, descriptor: this.descriptor });
  }

  async run(id, args) {
    if (!this.runtime) throw new Error("Process worker has not booted");
    this.descriptor.status = "running";
    this.running = this.runtime.execute(args);
    let status = await this.running;
    if ((status ?? 0) === 0 && this.shouldStayAlive()) {
      status = await new Promise((resolve) => {
        this.descriptor.onIdle = () => {
          if (!this.shouldStayAlive()) {
            this.descriptor.onIdle = null;
            resolve(status ?? 0);
          }
        };
      });
    }
    this.descriptor.status = "exited";
    this.postMessage({ type: "exit", requestId: id, pid: this.descriptor.pid, status });
    this.reply(id, { ok: true, status });
  }

  shouldStayAlive() {
    return Boolean(
      this.kernel?.portManager?.hasPid?.(this.descriptor.pid)
      || this.kernel?.net?.hasPid?.(this.descriptor.pid)
      || this.descriptor.refCount > 0
    );
  }

  signal(signal) {
    if (!this.descriptor) return;
    this.descriptor.status = "killed";
    this.postMessage({ type: "signal", pid: this.descriptor.pid, signal });
  }

  stream(name) {
    return {
      write: (chunk) => {
        this.postMessage({
          type: "stream",
          pid: this.descriptor?.pid,
          stream: name,
          chunk: typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
        });
      }
    };
  }

  reply(requestId, payload) {
    this.postMessage({
      type: "reply",
      requestId,
      payload
    });
  }
}

export function serializeError(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack
  };
}
