import { EventEmitter } from "./events.js";

let nextThreadId = 1;

export function createWorkerThreadsBuiltin({ process, workerContext = null, runWorkerSource }) {
  const isMainThread = !workerContext;

  class RuntimeMessagePort extends MessagePort {
    constructor() {
      super({ process });
    }
  }

  class RuntimeMessageChannel extends MessageChannel {
    constructor() {
      super({ process });
    }
  }

  class Worker extends EventEmitter {
    constructor(specifier, options = {}) {
      super();
      if (typeof runWorkerSource !== "function") {
        throw Object.assign(new Error("node:worker_threads is unavailable in this runtime"), {
          code: "ERR_OPENCONTAINERS_WORKER_THREADS_UNAVAILABLE"
        });
      }
      this.threadId = nextThreadId++;
      this.resourceLimits = options.resourceLimits ?? {};
      this.stdin = null;
      this.stdout = null;
      this.stderr = null;
      this.performance = { eventLoopUtilization: () => ({ idle: 0, active: 0, utilization: 0 }) };
      this.#specifier = specifier;
      this.#options = options;
      this.#parentPort = new RuntimeMessagePort();
      this.#workerPort = new RuntimeMessagePort();
      this.#parentPort.__opencontainersSetPeer(this.#workerPort);
      this.#workerPort.__opencontainersSetPeer(this.#parentPort);
      this.#parentPort.on("message", (message) => this.emit("message", message));
      this.#parentPort.on("messageerror", (error) => {
        if (this.listenerCount("messageerror") > 0) this.emit("messageerror", error);
      });
      this.#abortController = typeof AbortController === "function" ? new AbortController() : null;
      this.#refed = true;
      process?.__opencontainersAddRef?.();
      this.#disposeExitHook = process?.__opencontainersOnExit?.(() => {
        this.#forceTerminate(1);
      });
      queueMicrotask(() => this.#start());
    }

    #specifier;
    #options;
    #parentPort;
    #workerPort;
    #abortController;
    #disposeExitHook;
    #exited = false;
    #terminated = false;
    #exitCode = null;
    #refed = false;

    postMessage(message) {
      if (this.#exited || this.#terminated) return false;
      this.#parentPort.postMessage(message);
      return true;
    }

    terminate() {
      if (this.#exited) return Promise.resolve(this.#exitCode ?? 0);
      this.#forceTerminate(1);
      return Promise.resolve(this.#exitCode ?? 1);
    }

    ref() {
      if (!this.#refed && !this.#exited) {
        this.#refed = true;
        process?.__opencontainersAddRef?.();
      }
      return this;
    }

    unref() {
      if (this.#refed) {
        this.#refed = false;
        process?.__opencontainersUnref?.();
      }
      return this;
    }

    async #start() {
      if (this.#terminated || this.#exited) return;
      this.emit("online");
      try {
        await runWorkerSource(this.#specifier, {
          eval: this.#options.eval === true,
          filename: this.#options.name ? `[worker ${this.#options.name}].js` : `[worker ${this.threadId}].js`,
          parentPort: this.#workerPort,
          signal: this.#abortController?.signal,
          threadId: this.threadId,
          type: this.#options.type,
          workerData: cloneMessage(this.#options.workerData)
        });
        if (!this.#terminated) this.#finish(0);
      } catch (error) {
        if (this.#terminated) return;
        if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") {
          this.#finish(error.exitCode ?? 0);
          return;
        }
        this.#emitWorkerError(error);
        this.#finish(1);
      }
    }

    #emitWorkerError(error) {
      if (this.listenerCount("error") > 0) {
        try {
          this.emit("error", error);
        } catch (emitError) {
          process?.stderr?.write?.(`${emitError?.stack ?? emitError?.message ?? emitError}\n`);
        }
        return;
      }
      process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
    }

    #forceTerminate(code) {
      if (this.#exited) return;
      this.#terminated = true;
      this.#abortController?.abort?.();
      this.#parentPort.close();
      this.#workerPort.close();
      this.#finish(code);
    }

    #finish(code) {
      if (this.#exited) return;
      this.#exited = true;
      this.#exitCode = Number(code) || 0;
      this.#workerPort.close();
      this.#disposeExitHook?.();
      this.#disposeExitHook = null;
      if (this.#refed) {
        this.#refed = false;
        process?.__opencontainersUnref?.();
      }
      this.emit("exit", this.#exitCode);
    }
  }

  const builtin = {
    Worker,
    MessageChannel: RuntimeMessageChannel,
    MessagePort: RuntimeMessagePort,
    isMainThread,
    parentPort: workerContext?.parentPort ?? null,
    receiveMessageOnPort,
    resourceLimits: {},
    SHARE_ENV: Symbol.for("opencontainers.worker_threads.SHARE_ENV"),
    threadId: workerContext?.threadId ?? 0,
    workerData: workerContext?.workerData,
    markAsUntransferable() {},
    moveMessagePortToContext(port) {
      return port;
    }
  };
  return builtin;
}

export class MessagePort extends EventEmitter {
  constructor({ process } = {}) {
    super();
    this.#process = process;
  }

  #process = null;
  #peer = null;
  #closed = false;
  #queue = [];
  onmessage = null;
  onmessageerror = null;

  postMessage(message) {
    if (this.#closed || !this.#peer || this.#peer.#closed) return;
    const cloned = cloneMessage(message);
    this.#process?.__opencontainersAddRef?.();
    queueMicrotask(() => {
      try {
        if (this.#peer && !this.#peer.#closed) this.#peer.#dispatchMessage(cloned);
      } finally {
        this.#process?.__opencontainersUnref?.();
      }
    });
  }

  start() {
    return this;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.emit("close");
  }

  ref() {
    return this;
  }

  unref() {
    return this;
  }

  __opencontainersSetPeer(peer) {
    this.#peer = peer;
  }

  __opencontainersQueueMessage(message) {
    this.#queue.push(cloneMessage(message));
  }

  __opencontainersReceiveMessage() {
    return this.#queue.length ? { message: this.#queue.shift() } : undefined;
  }

  #dispatchMessage(message) {
    this.emit("message", message);
    if (typeof this.onmessage === "function") {
      this.onmessage.call(this, { data: message, target: this, currentTarget: this });
    }
  }
}

export class MessageChannel {
  constructor({ process } = {}) {
    this.port1 = new MessagePort({ process });
    this.port2 = new MessagePort({ process });
    this.port1.__opencontainersSetPeer(this.port2);
    this.port2.__opencontainersSetPeer(this.port1);
  }
}

function receiveMessageOnPort(port) {
  return port?.__opencontainersReceiveMessage?.();
}

function cloneMessage(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone !== "function") return value;
  try {
    return structuredClone(value);
  } catch (_) {
    return value;
  }
}
