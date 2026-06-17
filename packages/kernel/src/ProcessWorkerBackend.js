import { ProcessWorkerHost } from "../../runtime-node/src/process-worker-host.js";

export class ProcessWorkerBackend {
  constructor({ kernel, workerFactory = createLocalProcessWorkerTransport } = {}) {
    this.kernel = kernel;
    this.workerFactory = workerFactory;
    this.nextRequestId = 1;
  }

  async run(process, args) {
    const transport = this.workerFactory({ kernel: this.kernel, process });
    const pending = new Map();
    let exitStatus = null;

    transport.onMessage((message) => {
      if (message.type === "stream") {
        const target = message.stream === "stderr" ? process.stderr : process.stdout;
        target.write(message.chunk ?? "");
        return;
      }
      if (message.type === "exit") {
        exitStatus = message.status ?? 0;
        return;
      }
      if (message.type !== "reply") return;
      const resolver = pending.get(message.requestId);
      if (!resolver) return;
      pending.delete(message.requestId);
      if (message.payload?.ok === false) resolver.reject(deserializeError(message.payload.error));
      else resolver.resolve(message.payload);
    });

    const request = (type, payload = {}) => {
      const id = `process-worker-${this.nextRequestId++}`;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        transport.postMessage({ id, type, ...payload });
      });
    };

    try {
      await request("boot", { descriptor: serializeDescriptor(process.descriptor) });
      const result = await request("run", { args });
      return exitStatus ?? result.status ?? 0;
    } finally {
      transport.terminate?.();
    }
  }
}

export function createLocalProcessWorkerTransport({ kernel }) {
  let listener = () => {};
  const host = new ProcessWorkerHost({
    kernel,
    postMessage: (message) => queueMicrotask(() => listener(message))
  });
  return {
    onMessage(callback) {
      listener = callback;
    },
    postMessage(message) {
      queueMicrotask(() => host.handleMessage(message));
    },
    terminate() {}
  };
}

export function createBrowserProcessWorkerTransport({ url = "/packages/runtime-node/src/process-worker.js" } = {}) {
  const worker = new Worker(url, { type: "module" });
  return {
    onMessage(callback) {
      worker.addEventListener("message", (event) => callback(event.data));
    },
    postMessage(message, transfer) {
      worker.postMessage(message, transfer ?? []);
    },
    terminate() {
      worker.terminate();
    }
  };
}

function serializeDescriptor(descriptor) {
  return {
    pid: descriptor.pid,
    ppid: descriptor.ppid,
    cwd: descriptor.cwd,
    argv: descriptor.argv,
    env: descriptor.env,
    projectId: descriptor.projectId
  };
}

function deserializeError(error) {
  return Object.assign(new Error(error?.message ?? "Process worker request failed"), error ?? {});
}
