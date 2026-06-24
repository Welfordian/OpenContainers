import { EventEmitter } from "./events.js";
import { Readable, Writable } from "./stream.js";

let nextThreadId = 1;
const SHARE_ENV = Symbol.for("nodejs.worker_threads.SHARE_ENV");
const MESSAGE_PORT_INTERNAL = Symbol("opencontainers.worker_threads.MessagePort.internal");
const VM_CONTEXT_SYMBOL = Symbol.for("opencontainers.vm.context");
const environmentData = new Map();
const markedUncloneable = new WeakSet();
const markedUntransferable = new WeakSet();
const broadcastChannels = new Map();
const DEFAULT_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxYoungGenerationSizeMb: -1,
  maxOldGenerationSizeMb: -1,
  codeRangeSizeMb: -1,
  stackSizeMb: 4
});
const WORKER_RESOURCE_LIMIT_KEYS = Object.freeze(Object.keys(DEFAULT_WORKER_RESOURCE_LIMITS));

export function createWorkerThreadsBuiltin({ process, workerContext = null, runWorkerSource }) {
  const isMainThread = !workerContext;

  function RuntimeMessagePort(options = {}) {
    return Reflect.construct(MessagePort, [options], new.target ?? RuntimeMessagePort);
  }
  Object.setPrototypeOf(RuntimeMessagePort, MessagePort);
  RuntimeMessagePort.prototype = Object.create(MessagePort.prototype, {
    constructor: {
      configurable: true,
      writable: true,
      value: RuntimeMessagePort
    }
  });

  function RuntimeMessageChannel() {
    if (!new.target) {
      throw Object.assign(new TypeError("Cannot call constructor without `new`"), {
        code: "ERR_CONSTRUCT_CALL_REQUIRED"
      });
    }
    return Reflect.construct(MessageChannel, [{ process, Port: RuntimeMessagePort }], new.target);
  }
  Object.setPrototypeOf(RuntimeMessageChannel, MessageChannel);
  RuntimeMessageChannel.prototype = Object.create(MessageChannel.prototype, {
    constructor: {
      configurable: true,
      writable: true,
      value: RuntimeMessageChannel
    }
  });

  class RuntimeBroadcastChannel extends BroadcastChannel {
    constructor(name) {
      super(name, { process });
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
      this.#threadId = nextThreadId++;
      this.#createdAt = Date.now();
      this.#resourceLimits = normalizeWorkerResourceLimits(options.resourceLimits);
      const stdin = createWorkerInput(options.stdin);
      this.#publicStdin = stdin.parent;
      this.#publicStdout = new Readable();
      this.#publicStderr = new Readable();
      this.performance = { eventLoopUtilization: () => ({ idle: 0, active: 0, utilization: 0 }) };
      this.#threadName = normalizeWorkerName(options.name);
      this.#specifier = specifier;
      this.#options = options;
      this.#workerData = cloneMessage(options.workerData, options.transferList, { transferListMode: "worker" });
      this.#parentPort = new RuntimeMessagePort({ process, [MESSAGE_PORT_INTERNAL]: true });
      this.#workerPort = new RuntimeMessagePort({ process, [MESSAGE_PORT_INTERNAL]: true });
      this.#parentPort.__opencontainersSetPeer(this.#workerPort);
      this.#workerPort.__opencontainersSetPeer(this.#parentPort);
      this.#parentPort.on("message", (message) => this.emit("message", message));
      this.#parentPort.on("messageerror", (error) => {
        if (this.listenerCount("messageerror") > 0) this.emit("messageerror", error);
      });
      this.#abortController = typeof AbortController === "function" ? new AbortController() : null;
      this.#stdin = stdin.worker;
      this.#stdout = createWorkerOutput(this.#publicStdout, process?.stdout, { inherit: !options.stdout });
      this.#stderr = createWorkerOutput(this.#publicStderr, process?.stderr, { inherit: !options.stderr });
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
    #workerData;
    #resourceLimits;
    #threadId = 0;
    #threadName = "";
    #publicStdin = null;
    #publicStdout = null;
    #publicStderr = null;
    #abortController;
    #stdin;
    #stdout;
    #stderr;
    #disposeExitHook;
    #exited = false;
    #terminated = false;
    #exitCode = null;
    #refed = false;
    #createdAt = 0;

    postMessage(message = undefined, transferList = undefined) {
      if (this.#exited || this.#terminated) return false;
      this.#parentPort.postMessage(message, transferList);
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

    get threadId() {
      return this.#threadId;
    }

    get threadName() {
      return this.#threadName;
    }

    get stdin() {
      return this.#publicStdin;
    }

    get stdout() {
      return this.#publicStdout;
    }

    get stderr() {
      return this.#publicStderr;
    }

    get resourceLimits() {
      return { ...this.#resourceLimits };
    }

    getHeapSnapshot(options) {
      validateWorkerObjectOptions("options", options);
      return this.#ifNotRunning() ?? Promise.resolve(createWorkerHeapSnapshotStream());
    }

    getHeapStatistics() {
      return this.#ifNotRunning() ?? Promise.resolve(createWorkerHeapStatistics());
    }

    cpuUsage(prev) {
      validateWorkerCpuUsagePrevious(prev);
      const usage = this.#cpuUsageSnapshot();
      if (prev === undefined) return this.#ifNotRunning() ?? Promise.resolve(usage);
      return this.#ifNotRunning() ?? Promise.resolve({
        user: Math.max(0, usage.user - prev.user),
        system: Math.max(0, usage.system - prev.system)
      });
    }

    startCpuProfile(options) {
      validateWorkerObjectOptions("options", options);
      return this.#ifNotRunning() ?? Promise.resolve(new WorkerCPUProfileHandle());
    }

    startHeapProfile(options) {
      validateWorkerObjectOptions("options", options);
      return this.#ifNotRunning() ?? Promise.resolve(new WorkerHeapProfileHandle());
    }

    async #start() {
      if (this.#terminated || this.#exited) return;
      this.emit("online");
      try {
        const env = normalizeWorkerEnv(this.#options.env, process?.env ?? {});
        await runWorkerSource(this.#specifier, {
          argv: normalizeWorkerArgv(this.#options.argv),
          eval: this.#options.eval === true,
          env,
          filename: this.threadName ? `[worker ${this.threadName}].js` : `[worker ${this.threadId}].js`,
          name: this.threadName,
          parentPort: this.#workerPort,
          signal: this.#abortController?.signal,
          stdin: this.#stdin,
          stdout: this.#stdout,
          stderr: this.#stderr,
          resourceLimits: this.resourceLimits,
          threadId: this.threadId,
          type: this.#options.type,
          workerData: this.#workerData
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
      this.#resourceLimits = {};
      this.#workerPort.close();
      this.stdin?.destroy?.();
      this.stdout.push(null);
      this.stderr.push(null);
      this.#disposeExitHook?.();
      this.#disposeExitHook = null;
      if (this.#refed) {
        this.#refed = false;
        process?.__opencontainersUnref?.();
      }
      this.emit("exit", this.#exitCode);
    }

    #ifNotRunning() {
      return this.#exited || this.#terminated
        ? Promise.reject(createWorkerNotRunningError())
        : null;
    }

    #cpuUsageSnapshot() {
      const elapsedMicroseconds = Math.max(0, Math.floor((Date.now() - this.#createdAt) * 1000));
      return {
        user: elapsedMicroseconds,
        system: 0
      };
    }
  }

  function markAsUncloneable(value) {
    if (typeof value === "object" && value !== null) markedUncloneable.add(value);
  }

  function markAsUntransferable(value) {
    if (isObjectLike(value)) markedUntransferable.add(value);
  }

  function isMarkedAsUntransferable(value) {
    return isObjectLike(value) ? markedUntransferable.has(value) : false;
  }

  function setEnvironmentData(key, value) {
    environmentData.set(key, cloneMessage(value));
  }

  function getEnvironmentData(key) {
    return cloneMessage(environmentData.get(key));
  }

  const builtin = {
    isInternalThread: false,
    isMainThread,
    MessagePort: RuntimeMessagePort,
    MessageChannel: RuntimeMessageChannel,
    markAsUncloneable,
    markAsUntransferable,
    isMarkedAsUntransferable,
    moveMessagePortToContext(...args) {
      const [port, context] = args;
      validateMessagePortArgument(port);
      validateVmContextArgument(context);
      return new ContextMessagePort(port.__opencontainersTransfer());
    },
    receiveMessageOnPort,
    resourceLimits: workerContext ? { ...(workerContext.resourceLimits ?? {}) } : {},
    postMessageToThread,
    threadId: workerContext?.threadId ?? 0,
    threadName: workerContext?.name ?? "",
    SHARE_ENV,
    Worker,
    parentPort: workerContext?.parentPort ?? null,
    workerData: workerContext ? workerContext.workerData : null,
    BroadcastChannel: RuntimeBroadcastChannel,
    setEnvironmentData,
    getEnvironmentData,
    locks: new LockManager()
  };
  alignWorkerThreadsMetadata(builtin);
  return builtin;
}

function createWorkerOutput(stream, parentStream, { inherit }) {
  if (inherit) stream.resume();
  const output = {
    write(chunk) {
      stream.push(chunk);
      if (inherit) parentStream?.write?.(chunk);
    }
  };
  markWorkerStdio(output);
  return output;
}

function createWorkerInput(enabled) {
  let ended = false;
  const worker = enabled ? new Readable() : new Readable({
    read() {
      if (ended) return;
      ended = true;
      this.push(null);
    }
  });
  markWorkerStdio(worker);
  if (!enabled) {
    return { parent: null, worker };
  }
  const parent = new Writable({
    write(chunk, _encoding, callback) {
      worker.push(chunk);
      callback();
    },
    final(callback) {
      worker.push(null);
      callback();
    },
    destroy(error) {
      if (error) worker.destroy(error);
      else worker.push(null);
    }
  });
  markWorkerStdio(parent);
  return { parent, worker };
}

function markWorkerStdio(stream) {
  Object.defineProperty(stream, "__opencontainersWorkerStdio", {
    configurable: true,
    value: true
  });
}

class WorkerCPUProfileHandle {
  #stopped = false;

  stop() {
    this.#stopped = true;
    return Promise.resolve(JSON.stringify({
      nodes: [
        {
          id: 1,
          hitCount: 0,
          callFrame: {
            functionName: "(root)",
            scriptId: 0,
            url: "",
            lineNumber: -1,
            columnNumber: -1
          },
          children: []
        }
      ],
      startTime: 0,
      endTime: 0,
      samples: [],
      timeDeltas: []
    }));
  }

  [Symbol.dispose]() {
    if (!this.#stopped) void this.stop();
  }
}

class WorkerHeapProfileHandle {
  #stopped = false;

  stop() {
    this.#stopped = true;
    return Promise.resolve(JSON.stringify({
      samples: [],
      head: {
        selfSize: 0,
        id: 1,
        callFrame: {
          scriptId: 0,
          lineNumber: -1,
          columnNumber: -1,
          functionName: "(root)",
          url: ""
        },
        children: []
      }
    }));
  }

  [Symbol.dispose]() {
    if (!this.#stopped) void this.stop();
  }
}

alignWorkerProfileHandleMetadata();

function alignWorkerProfileHandleMetadata() {
  Object.defineProperty(WorkerCPUProfileHandle, "name", {
    configurable: true,
    value: "CPUProfileHandle"
  });
  Object.defineProperty(WorkerCPUProfileHandle, "length", {
    configurable: true,
    value: 2
  });
  Object.defineProperty(WorkerHeapProfileHandle, "name", {
    configurable: true,
    value: "HeapProfileHandle"
  });
  Object.defineProperty(WorkerHeapProfileHandle, "length", {
    configurable: true,
    value: 1
  });
}

function createWorkerHeapSnapshotStream() {
  return Readable.from([JSON.stringify({
    snapshot: {
      meta: {},
      node_count: 0,
      edge_count: 0,
      trace_function_count: 0
    },
    nodes: [],
    edges: [],
    strings: []
  })]);
}

function createWorkerHeapStatistics() {
  return {
    total_heap_size: 32 * 1024 * 1024,
    total_heap_size_executable: 0,
    total_physical_size: 32 * 1024 * 1024,
    total_available_size: 256 * 1024 * 1024,
    used_heap_size: 8 * 1024 * 1024,
    heap_size_limit: 256 * 1024 * 1024,
    malloced_memory: 0,
    peak_malloced_memory: 0,
    does_zap_garbage: 0,
    number_of_native_contexts: 1,
    number_of_detached_contexts: 0,
    total_global_handles_size: 0,
    used_global_handles_size: 0,
    external_memory: 0,
    total_allocated_bytes: 8 * 1024 * 1024
  };
}

function validateWorkerObjectOptions(name, options) {
  if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) {
    throw createInvalidArgTypeError(name, "object", options);
  }
}

function validateWorkerCpuUsagePrevious(prev) {
  if (prev === undefined) return;
  if (prev === null || typeof prev !== "object" || Array.isArray(prev)) {
    throw createInvalidArgTypeError("prev", "object", prev);
  }
  if (typeof prev.user !== "number") {
    throw createInvalidPropertyTypeError("prev.user", "number", prev.user);
  }
  if (typeof prev.system !== "number") {
    throw createInvalidPropertyTypeError("prev.system", "number", prev.system);
  }
}

function createWorkerNotRunningError() {
  return Object.assign(new Error("Worker instance not running"), {
    code: "ERR_WORKER_NOT_RUNNING"
  });
}

function createInvalidArgTypeError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidPropertyTypeError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" property must be of type ${expected}. Received ${describeReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function describeReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string (${JSON.stringify(value).replaceAll('"', "'")})`;
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  if (typeof value === "function") return `function ${value.name || "<anonymous>"}`;
  if (typeof value === "object") {
    if (Array.isArray(value)) return "an instance of Array";
    if (value.constructor && value.constructor !== Object) return `an instance of ${value.constructor.name}`;
  }
  return `type ${typeof value} (${String(value)})`;
}

function alignWorkerThreadsMetadata(builtin) {
  Object.defineProperty(builtin.BroadcastChannel, "name", { configurable: true, value: "BroadcastChannel" });
  Object.defineProperty(builtin.MessageChannel, "name", { configurable: true, value: "MessageChannel" });
  Object.defineProperty(builtin.MessagePort, "name", { configurable: true, value: "MessagePort" });
  mirrorPrototypeDescriptors(builtin.MessagePort.prototype, MessagePort.prototype, [
    ["postMessage", true],
    ["start", true],
    ["ref", true],
    ["unref", true],
    ["hasRef", true],
    ["onmessage", true],
    ["onmessageerror", true],
    ["close", true]
  ]);
  ensureFunctionOwnPrototype(builtin.MessagePort.prototype.hasRef);
  ensureFunctionOwnPrototype(builtin.MessagePort.prototype.close);
  ensureAccessorFunctionOwnPrototypes(builtin.MessagePort.prototype, "onmessage");
  ensureAccessorFunctionOwnPrototypes(builtin.MessagePort.prototype, "onmessageerror");
  reorderOwnProperties(builtin.MessagePort.prototype, [
    "postMessage",
    "start",
    "constructor",
    "ref",
    "unref",
    "hasRef",
    "onmessage",
    "onmessageerror",
    "close"
  ]);
  mirrorPrototypeDescriptors(builtin.BroadcastChannel.prototype, BroadcastChannel.prototype, [
    ["name", true],
    ["close", true],
    ["postMessage", true],
    ["ref", false],
    ["unref", false],
    ["onmessage", true],
    ["onmessageerror", true]
  ]);
  ensureAccessorFunctionOwnPrototypes(builtin.BroadcastChannel.prototype, "onmessage");
  ensureAccessorFunctionOwnPrototypes(builtin.BroadcastChannel.prototype, "onmessageerror");
  makePrototypePropertiesEnumerable(LockManager.prototype, ["request", "query"]);
}

function mirrorPrototypeDescriptors(targetPrototype, sourcePrototype, entries) {
  for (const [name, enumerable] of entries) {
    const descriptor = Object.getOwnPropertyDescriptor(sourcePrototype, name);
    if (!descriptor) continue;
    Object.defineProperty(targetPrototype, name, {
      ...descriptor,
      configurable: true,
      enumerable
    });
  }
}

function reorderOwnProperties(target, names) {
  const descriptors = new Map();
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor) descriptors.set(name, descriptor);
  }
  for (const name of descriptors.keys()) {
    delete target[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(target, name, descriptor);
  }
}

function ensureAccessorFunctionOwnPrototypes(prototype, name) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  ensureFunctionOwnPrototype(descriptor?.get);
  ensureFunctionOwnPrototype(descriptor?.set);
}

function ensureFunctionOwnPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    value: prototype,
    writable: true
  });
}

function makePrototypePropertiesEnumerable(prototype, names) {
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) continue;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      configurable: true,
      enumerable: true
    });
  }
}

export class BroadcastChannel extends EventEmitter {
  constructor(name, { process } = {}) {
    super();
    this.#name = String(name);
    this.#process = process;
    const channels = broadcastChannels.get(this.#name) ?? new Set();
    channels.add(this);
    broadcastChannels.set(this.#name, channels);
  }

  #name;
  #onmessage = null;
  #onmessageerror = null;
  #process = null;
  #closed = false;
  #listenerWrappers = new Map();

  get name() {
    return this.#name;
  }

  get onmessage() {
    return this.#onmessage;
  }

  set onmessage(listener) {
    this.#onmessage = listener;
  }

  get onmessageerror() {
    return this.#onmessageerror;
  }

  set onmessageerror(listener) {
    this.#onmessageerror = listener;
  }

  postMessage(message) {
    if (this.#closed) {
      throw Object.assign(new Error("BroadcastChannel is closed."), {
        name: "InvalidStateError"
      });
    }
    let cloned;
    try {
      cloned = cloneMessage(message);
    } catch (error) {
      this.#dispatchMessageError(error);
      return;
    }

    const recipients = [...(broadcastChannels.get(this.name) ?? [])]
      .filter((channel) => channel !== this && !channel.#closed);
    this.#process?.__opencontainersAddRef?.();
    queueMicrotask(() => {
      try {
        for (const recipient of recipients) recipient.#dispatchMessage(cloneMessage(cloned));
      } finally {
        this.#process?.__opencontainersUnref?.();
      }
    });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    const channels = broadcastChannels.get(this.name);
    channels?.delete(this);
    if (channels?.size === 0) broadcastChannels.delete(this.name);
    this.emit("close");
  }

  addEventListener(type, listener) {
    if (typeof listener === "function") {
      this.on(type, listener);
    } else if (typeof listener?.handleEvent === "function") {
      const wrapper = (event) => listener.handleEvent(event);
      this.#listenerWrappers.set(listener, wrapper);
      this.on(type, wrapper);
    }
  }

  removeEventListener(type, listener) {
    const wrapper = this.#listenerWrappers.get(listener);
    this.off(type, wrapper ?? listener);
    if (wrapper) this.#listenerWrappers.delete(listener);
  }

  dispatchEvent(event) {
    this.emit(event?.type, event);
    return true;
  }

  ref() {
    return this;
  }

  unref() {
    return this;
  }

  #dispatchMessage(data) {
    const event = { type: "message", data, target: this, currentTarget: this };
    this.#emitEvent("message", event);
    if (typeof this.onmessage === "function") this.onmessage.call(this, event);
  }

  #dispatchMessageError(error) {
    const event = { type: "messageerror", data: error, target: this, currentTarget: this };
    this.#emitEvent("messageerror", event);
    if (typeof this.onmessageerror === "function") this.onmessageerror.call(this, event);
  }

  #emitEvent(type, event) {
    for (const listener of this.listeners(type)) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent?.(event);
    }
  }
}

export class MessagePort extends EventEmitter {
  constructor(options = {}) {
    if (options?.[MESSAGE_PORT_INTERNAL] !== true) {
      throw Object.assign(new TypeError("Constructor cannot be called"), {
        code: "ERR_CONSTRUCT_CALL_INVALID"
      });
    }
    super();
    const { process } = options;
    this.#process = process;
  }

  #process = null;
  #peer = null;
  #closed = false;
  #queue = [];
  #onmessage = null;
  #onmessageerror = null;
  #refed = false;

  get onmessage() {
    return this.#onmessage;
  }

  set onmessage(listener) {
    this.#onmessage = listener;
  }

  get onmessageerror() {
    return this.#onmessageerror;
  }

  set onmessageerror(listener) {
    this.#onmessageerror = listener;
  }

  postMessage(message = undefined, transferList = undefined) {
    if (this.#closed || !this.#peer || this.#peer.#closed) return;
    const record = this.#peer.__opencontainersQueueMessage(message, transferList);
    this.#process?.__opencontainersAddRef?.();
    queueMicrotask(() => {
      try {
        if (this.#peer && !this.#peer.#closed) this.#peer.#dispatchQueuedMessage(record);
      } finally {
        this.#process?.__opencontainersUnref?.();
      }
    });
  }

  start() {
    return this;
  }

  close(callback) {
    if (this.#closed) return;
    this.#closed = true;
    this.emit("close");
  }

  ref() {
    this.#refed = true;
  }

  unref() {
    this.#refed = false;
  }

  hasRef() {
    return this.#refed;
  }

  __opencontainersSetPeer(peer) {
    this.#peer = peer;
  }

  __opencontainersIsDetached() {
    return this.#closed || !this.#peer;
  }

  __opencontainersTransfer() {
    if (this.__opencontainersIsDetached()) {
      throw createDataCloneError("MessagePort in transfer list is already detached");
    }
    const transferred = new this.constructor({ process: this.#process, [MESSAGE_PORT_INTERNAL]: true });
    transferred.#peer = this.#peer;
    transferred.#queue = this.#queue;
    transferred.#refed = this.#refed;
    if (this.#peer?.#peer === this) this.#peer.#peer = transferred;
    this.#peer = null;
    this.#queue = [];
    this.#closed = true;
    this.#refed = false;
    queueMicrotask(() => this.emit("close"));
    return transferred;
  }

  __opencontainersQueueMessage(message, transferList = undefined) {
    const record = { message: cloneMessage(message, transferList, { transferListMode: "message" }) };
    this.#queue.push(record);
    return record;
  }

  __opencontainersReceiveMessage() {
    if (this.#queue.length === 0) return undefined;
    return { message: this.#queue.shift().message };
  }

  #dispatchQueuedMessage(record) {
    const index = this.#queue.indexOf(record);
    if (index === -1) return;
    this.#queue.splice(index, 1);
    this.#dispatchMessage(record.message);
  }

  #dispatchMessage(message) {
    this.emit("message", message);
    if (typeof this.onmessage === "function") {
      this.onmessage.call(this, { data: message, target: this, currentTarget: this });
    }
  }
}

class ContextMessagePortHandle {
  constructor(port) {
    contextMessagePortTargets.set(this, port);
  }

  close() {
    return contextMessagePortTargets.get(this).close();
  }

  hasRef() {
    return contextMessagePortTargets.get(this).hasRef();
  }

  ref() {
    return contextMessagePortTargets.get(this).ref();
  }

  unref() {
    return contextMessagePortTargets.get(this).unref();
  }
}

const contextMessagePortTargets = new WeakMap();

class ContextMessagePort extends ContextMessagePortHandle {
  postMessage(message = undefined, transferList = undefined) {
    return contextMessagePortTargets.get(this).postMessage(message, transferList);
  }

  start() {
    contextMessagePortTargets.get(this).start();
    return this;
  }
}
Object.defineProperty(ContextMessagePort, "name", { configurable: true, value: "MessagePort" });
makePrototypePropertiesEnumerable(ContextMessagePort.prototype, ["postMessage", "start"]);
makePrototypePropertiesEnumerable(ContextMessagePortHandle.prototype, ["close", "hasRef", "ref", "unref"]);
reorderOwnProperties(ContextMessagePort.prototype, ["postMessage", "start", "constructor"]);
reorderOwnProperties(ContextMessagePortHandle.prototype, ["close", "hasRef", "ref", "unref", "constructor"]);

export class MessageChannel {
  constructor({ process, Port = MessagePort } = {}) {
    this.port1 = new Port({ process, [MESSAGE_PORT_INTERNAL]: true });
    this.port2 = new Port({ process, [MESSAGE_PORT_INTERNAL]: true });
    this.port1.__opencontainersSetPeer(this.port2);
    this.port2.__opencontainersSetPeer(this.port1);
  }
}

class LockManager {
  #held = [];
  #pending = [];
  #queue = Promise.resolve();

  request(name, options, callback = undefined) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (arguments.length < 3) {
      callback = options;
      options = {};
    }
    if (typeof callback !== "function") {
      return Promise.reject(createInvalidLockCallbackError(callback));
    }

    const normalizedName = String(name);
    const mode = options?.mode === "shared" ? "shared" : "exclusive";
    const ifAvailable = options?.ifAvailable === true;
    const lock = { name: normalizedName, mode };

    if (ifAvailable && this.#held.some((held) => held.name === normalizedName)) {
      return Promise.resolve(callback(null));
    }

    const requestRecord = { name: normalizedName, mode, clientId: undefined };
    this.#pending.push(requestRecord);
    const run = async () => {
      this.#pending = this.#pending.filter((record) => record !== requestRecord);
      this.#held.push(requestRecord);
      try {
        return await callback(lock);
      } finally {
        this.#held = this.#held.filter((record) => record !== requestRecord);
      }
    };
    const result = this.#queue.then(run, run);
    this.#queue = result.catch(() => {});
    return result;
  }

  async query() {
    return {
      held: this.#held.map((lock) => ({ ...lock })),
      pending: this.#pending.map((lock) => ({ ...lock }))
    };
  }
}

async function postMessageToThread(threadId, value, transferList, timeout) {
  validatePostMessageToThreadTimeout(timeout);
  throw Object.assign(new Error("Cannot find the destination thread or listener"), {
    code: "ERR_WORKER_MESSAGING_FAILED"
  });
}

function validatePostMessageToThreadTimeout(timeout) {
  if (timeout === undefined) return;
  if (typeof timeout !== "number") {
    throw createInvalidPostMessageTimeoutTypeError(timeout);
  }
  if (Number.isNaN(timeout) || timeout < 0) {
    throw createInvalidPostMessageTimeoutRangeError(timeout);
  }
  if (timeout === 0) {
    throw Object.assign(new Error("Sending a message to another thread timed out"), {
      code: "ERR_WORKER_MESSAGING_TIMEOUT"
    });
  }
}

function createInvalidPostMessageTimeoutTypeError(value) {
  return Object.assign(new TypeError(`The "timeout" argument must be of type number. Received ${describeWorkerThreadsReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidPostMessageTimeoutRangeError(value) {
  return Object.assign(new RangeError(`The value of "timeout" is out of range. It must be >= 0. Received ${String(value)}`), {
    code: "ERR_OUT_OF_RANGE"
  });
}

function createInvalidLockCallbackError(value) {
  return Object.assign(new TypeError(`The "callback" argument must be of type function. Received ${describeWorkerThreadsReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function describeWorkerThreadsReceived(value) {
  if (value && typeof value === "object" && value.constructor === Object) return "an instance of Object";
  return describeReceived(value);
}

function receiveMessageOnPort(port) {
  validateMessagePortArgument(port);
  const target = port instanceof ContextMessagePort ? contextMessagePortTargets.get(port) : port;
  return target.__opencontainersReceiveMessage();
}

function validateMessagePortArgument(port) {
  if (!(port instanceof MessagePort) && !(port instanceof ContextMessagePort)) {
    throw Object.assign(new TypeError("The \"port\" argument must be a MessagePort instance"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
}

function validateVmContextArgument(context) {
  if (!context?.[VM_CONTEXT_SYMBOL]) {
    throw Object.assign(new TypeError("Invalid context argument"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
}

function isObjectLike(value) {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function normalizeWorkerArgv(argv) {
  if (argv === undefined) return [];
  if (!Array.isArray(argv)) {
    throw Object.assign(new TypeError("The \"options.argv\" property must be an array"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return argv.map((value) => String(value));
}

function normalizeWorkerEnv(env, parentEnv) {
  if (env === SHARE_ENV) return parentEnv;
  if (env === undefined) return { ...parentEnv };
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    throw Object.assign(new TypeError("The \"options.env\" property must be an object or worker_threads.SHARE_ENV"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  const normalized = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function normalizeWorkerResourceLimits(resourceLimits) {
  const normalized = { ...DEFAULT_WORKER_RESOURCE_LIMITS };
  if (!resourceLimits || (typeof resourceLimits !== "object" && typeof resourceLimits !== "function")) {
    return normalized;
  }
  for (const key of WORKER_RESOURCE_LIMIT_KEYS) {
    if (typeof resourceLimits[key] === "number") normalized[key] = resourceLimits[key];
  }
  return normalized;
}

function normalizeWorkerName(name) {
  return name === undefined ? "" : String(name);
}

function cloneMessage(value, transferList = undefined, { transferListMode = "clone" } = {}) {
  const transfer = normalizeTransferList(transferList, transferListMode);
  if (value === undefined && transfer === undefined) return undefined;
  if (typeof structuredClone !== "function") return value;
  if (transfer === undefined) {
    assertMessagePortsListed(value, new Set());
    return structuredClone(value);
  }
  validateTransferList(transfer);
  const messagePortTransfers = transfer.filter((item) => item instanceof MessagePort);
  assertMessagePortsListed(value, new Set(messagePortTransfers));
  if (messagePortTransfers.length > 0) {
    return cloneMessageWithTransferList(value, transfer);
  }
  return structuredClone(value, { transfer });
}

function cloneMessageWithTransferList(value, transferList) {
  const transferred = new Map();
  for (const item of transferList) {
    if (isArrayBuffer(item)) {
      transferred.set(item, structuredClone(item, { transfer: [item] }));
    } else if (item instanceof MessagePort) {
      transferred.set(item, item.__opencontainersTransfer());
    }
  }
  return cloneMessageValue(value, transferred, new Map());
}

function cloneMessageValue(value, transferred, seen) {
  if (value instanceof MessagePort) {
    if (!transferred.has(value)) {
      throw createDataCloneError("Object that needs transfer was found in message but not listed in transferList");
    }
    return transferred.get(value);
  }
  if (isArrayBuffer(value) && transferred.has(value)) return transferred.get(value);
  if (!isObjectLike(value)) return value;
  assertCloneableMarkedValue(value);
  if (seen.has(value)) return seen.get(value);
  if (ArrayBuffer.isView(value)) {
    if (transferred.has(value.buffer)) {
      return new value.constructor(transferred.get(value.buffer), value.byteOffset, value.length);
    }
    return structuredClone(value);
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    for (const [key, entryValue] of value) {
      clone.set(cloneMessageValue(key, transferred, seen), cloneMessageValue(entryValue, transferred, seen));
    }
    return clone;
  }
  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    for (const entryValue of value) clone.add(cloneMessageValue(entryValue, transferred, seen));
    return clone;
  }
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const [key, entryValue] of Object.entries(value)) {
    clone[key] = cloneMessageValue(entryValue, transferred, seen);
  }
  return clone;
}

function assertMessagePortsListed(value, listed, seen = new Set()) {
  if (value instanceof MessagePort && !listed.has(value)) {
    throw createDataCloneError("Object that needs transfer was found in message but not listed in transferList");
  }
  if (!isObjectLike(value) || seen.has(value)) return;
  assertCloneableMarkedValue(value);
  seen.add(value);
  if (ArrayBuffer.isView(value) || isArrayBuffer(value) || value instanceof Date || value instanceof RegExp) return;
  if (value instanceof Map) {
    for (const [key, entryValue] of value) {
      assertMessagePortsListed(key, listed, seen);
      assertMessagePortsListed(entryValue, listed, seen);
    }
    return;
  }
  if (value instanceof Set) {
    for (const entryValue of value) assertMessagePortsListed(entryValue, listed, seen);
    return;
  }
  for (const entryValue of Object.values(value)) assertMessagePortsListed(entryValue, listed, seen);
}

function assertCloneableMarkedValue(value) {
  if (isMarkedUncloneableUnsupportedObject(value)) {
    throw createDataCloneError("Cannot clone object of unsupported type.");
  }
}

function isMarkedUncloneableUnsupportedObject(value) {
  if (typeof value !== "object" || value === null || !markedUncloneable.has(value)) return false;
  if (
    Array.isArray(value) ||
    ArrayBuffer.isView(value) ||
    isArrayBuffer(value) ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Promise ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof MessagePort
  ) {
    return false;
  }
  return true;
}

function normalizeTransferList(transferList, mode = "clone") {
  if (transferList === undefined || transferList === null) return undefined;
  if (Array.isArray(transferList)) return transferList;
  if (typeof transferList?.[Symbol.iterator] === "function" && typeof transferList !== "string") return [...transferList];
  if (mode === "message" && (typeof transferList !== "object" || typeof transferList === "string")) {
    throw createInvalidTransferListError();
  }
  if (mode === "worker" && typeof transferList === "string") return [...transferList];
  return undefined;
}

function validateTransferList(transferList) {
  const seen = new Set();
  for (const item of transferList) {
    if (item instanceof MessagePort) {
      if (seen.has(item)) throw createDataCloneError("Transfer list contains duplicate MessagePort");
      if (item.__opencontainersIsDetached()) throw createDataCloneError("MessagePort in transfer list is already detached");
      if (markedUntransferable.has(item)) throw createDataCloneError("Cannot transfer object of unsupported type.");
      seen.add(item);
      continue;
    }
    if (!isArrayBuffer(item)) {
      throw createDataCloneError("Found invalid value in transferList.");
    }
    if (isDetachedArrayBuffer(item) || markedUntransferable.has(item)) {
      throw createDataCloneError("Cannot transfer object of unsupported type.");
    }
    if (seen.has(item)) throw createDataCloneError("Transfer list contains duplicate ArrayBuffer");
    seen.add(item);
  }
}

function isArrayBuffer(value) {
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function isDetachedArrayBuffer(value) {
  try {
    new Uint8Array(value);
    return false;
  } catch {
    return true;
  }
}

function createDataCloneError(message) {
  if (typeof DOMException === "function") return new DOMException(message, "DataCloneError");
  const error = new Error(message);
  error.name = "DataCloneError";
  error.code = 25;
  return error;
}

function createInvalidTransferListError() {
  return Object.assign(new TypeError("Optional transferList argument must be an iterable"), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}
