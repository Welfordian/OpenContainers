import { EventEmitter, EVENT_EMITTER_CAPTURE_SYMBOL, EVENT_EMITTER_SHAPE_MODE_SYMBOL } from "./events.js";
import { Readable, Writable } from "./stream.js";

const SCHED_NONE = 1;
const SCHED_RR = 2;

export function createClusterBuiltin({ kernel, process }) {
  const isWorker = Boolean(process.env.NODE_UNIQUE_ID);
  const cluster = new EventEmitter();
  EventEmitter.init.call(cluster);
  cluster[EVENT_EMITTER_SHAPE_MODE_SYMBOL] = false;
  cluster[EVENT_EMITTER_CAPTURE_SYMBOL] = false;
  const workers = {};
  let nextWorkerId = 1;
  let settings = {};

  Object.assign(cluster, {
    isWorker,
    isMaster: !isWorker,
    isPrimary: !isWorker,
    Worker,
    workers,
    settings,
    SCHED_NONE,
    SCHED_RR,
    schedulingPolicy: SCHED_RR
  });

  if (isWorker) {
    cluster.worker = createCurrentWorker(process);
  }

  cluster.setupPrimary = function (options) {
    settings = normalizeSettings(process, options, settings);
    cluster.settings = settings;
    return cluster;
  };
  cluster.setupMaster = cluster.setupPrimary;

  cluster.fork = function (env) {
    if (cluster.isWorker) {
      throw Object.assign(new Error("cluster.fork() can only be called from the primary process"), {
        code: "ERR_OPENCONTAINERS_CLUSTER_WORKER_FORK"
      });
    }

    const activeSettings = normalizeSettings(process, {}, settings);
    settings = activeSettings;
    cluster.settings = activeSettings;

    if (!activeSettings.exec || activeSettings.exec === "[eval].js") {
      throw Object.assign(new Error("cluster.fork() requires a script entrypoint in OpenContainers"), {
        code: "ERR_OPENCONTAINERS_CLUSTER_EXEC_UNAVAILABLE"
      });
    }

    const id = nextWorkerId++;
    const workerEnv = {
      ...process.env,
      ...(env ?? {}),
      NODE_UNIQUE_ID: String(id),
      OPENCONTAINERS_CLUSTER_PRIMARY_PID: String(process.pid)
    };
    process.__opencontainersAddRef?.();
    const virtualProcess = kernel.spawn("node", [activeSettings.exec, ...(activeSettings.args ?? [])], {
      cwd: process.cwd(),
      env: workerEnv,
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      parentPid: process.pid
    });
    const worker = createPrimaryWorker({
      id,
      virtualProcess,
      parentProcess: process,
      silent: Boolean(activeSettings.silent)
    });
    workers[id] = worker;
    cluster.emit("fork", worker);

    queueMicrotask(() => {
      if (!worker.isDead()) {
        worker.emit("online");
        cluster.emit("online", worker);
      }
    });

    virtualProcess.on("exit", (code, signal) => {
      delete workers[id];
      worker.exitedAfterDisconnect = worker.exitedAfterDisconnect || Boolean(worker._opencontainersDisconnecting);
      worker.emit("exit", code, signal);
      cluster.emit("exit", worker, code, signal);
      process.__opencontainersUnref?.();
    });
    virtualProcess.on("error", (error) => {
      worker.emit("error", error);
      cluster.emit("error", error);
      process.__opencontainersUnref?.();
    });

    return worker;
  };

  cluster.disconnect = function (callback) {
    const activeWorkers = Object.values(workers);
    if (activeWorkers.length === 0) {
      queueMicrotask(() => callback?.());
      return;
    }
    let remaining = activeWorkers.length;
    const done = () => {
      remaining--;
      if (remaining === 0) callback?.();
    };
    for (const worker of activeWorkers) {
      worker.once("exit", done);
      worker.disconnect();
    }
  };

  return cluster;
}

class WorkerImpl extends EventEmitter {
  constructor(options) {
    super();
    const normalized = options ?? {};
    this._events = Object.create(null);
    this._eventsCount = 0;
    this._maxListeners = undefined;
    this.exitedAfterDisconnect = normalized.exitedAfterDisconnect;
    this.state = normalized.state ?? "none";
    this.id = normalized.id ?? 0;
    if (normalized.process !== undefined) this.process = normalized.process;
    if (normalized.disconnecting) defineWorkerInternal(this, "_opencontainersDisconnecting", true);
  }

  kill(signal = "SIGTERM") {
    if (typeof this._opencontainersKill === "function") return this._opencontainersKill(signal);
    this.process?.kill?.(signal);
    return this;
  }

  send() {
    if (typeof this._opencontainersSend === "function") return this._opencontainersSend(...arguments);
    throw unsupportedIpcError();
  }

  isDead() {
    return Boolean(this.state === "dead" || this.process?.exitCode != null);
  }

  isConnected() {
    if (typeof this.process?.connected === "boolean") return this.process.connected;
    return Boolean(this.process && !this._opencontainersDisconnecting && !this.isDead());
  }

  disconnect() {
    if (typeof this._opencontainersDisconnect === "function") return this._opencontainersDisconnect();
    this.exitedAfterDisconnect = true;
    defineWorkerInternal(this, "_opencontainersDisconnecting", true);
    this.emit("disconnect");
    return this;
  }

  destroy(signal = "SIGTERM") {
    return this.kill(signal);
  }
}

export function Worker(options) {
  return Reflect.construct(WorkerImpl, [options], new.target ?? Worker);
}

Worker.prototype = WorkerImpl.prototype;
Object.defineProperty(Worker.prototype, "constructor", {
  configurable: true,
  value: Worker,
  writable: true
});

alignWorkerPrototypeMetadata();

function alignWorkerPrototypeMetadata() {
  const lengths = {
    kill: 0,
    send: 0,
    isDead: 0,
    isConnected: 0,
    disconnect: 0,
    destroy: 1
  };
  for (const [name, length] of Object.entries(lengths)) {
    const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    const original = descriptor.value;
    const wrapper = function (...args) {
      return original.apply(this, args);
    };
    Object.defineProperty(wrapper, "name", { configurable: true, value: "" });
    Object.defineProperty(wrapper, "length", { configurable: true, value: length });
    Object.defineProperty(Worker.prototype, name, {
      ...descriptor,
      value: wrapper,
      enumerable: true
    });
  }
}

function defineWorkerInternal(worker, name, value) {
  Object.defineProperty(worker, name, {
    configurable: true,
    writable: true,
    value
  });
}

function normalizeSettings(process, options = {}, previous = {}) {
  return {
    exec: previous.exec ?? process.argv[1],
    args: previous.args ?? process.argv.slice(2),
    execArgv: previous.execArgv ?? process.execArgv ?? [],
    silent: previous.silent ?? false,
    ...options
  };
}

function createCurrentWorker(process) {
  const worker = new Worker({
    id: Number(process.env.NODE_UNIQUE_ID),
    process,
    state: "online"
  });
  defineWorkerInternal(worker, "_opencontainersDisconnect", () => {
    worker.exitedAfterDisconnect = true;
    process.exit();
    return worker;
  });
  defineWorkerInternal(worker, "_opencontainersKill", (signal = "SIGTERM") => {
    process.kill(process.pid, signal);
    return worker;
  });
  defineWorkerInternal(worker, "_opencontainersSend", () => {
    throw unsupportedIpcError();
  });
  return worker;
}

function createPrimaryWorker({ id, virtualProcess, parentProcess, silent }) {
  const processHandle = new EventEmitter();
  const stdin = new Writable({ write: (chunk) => virtualProcess.stdin.write(chunk) });
  const stdout = new Readable();
  const stderr = new Readable();

  processHandle.pid = virtualProcess.pid;
  processHandle.connected = true;
  processHandle.stdin = stdin;
  processHandle.stdout = stdout;
  processHandle.stderr = stderr;
  processHandle.kill = (signal = "SIGTERM") => virtualProcess.kill(signal);

  const worker = new Worker({
    id,
    process: processHandle,
    state: "online"
  });
  defineWorkerInternal(worker, "_opencontainersDisconnect", () => {
    defineWorkerInternal(worker, "_opencontainersDisconnecting", true);
    worker.exitedAfterDisconnect = true;
    processHandle.connected = false;
    worker.emit("disconnect");
    virtualProcess.kill("SIGTERM");
    return worker;
  });
  defineWorkerInternal(worker, "_opencontainersKill", (signal = "SIGTERM") => {
    virtualProcess.kill(signal);
    return worker;
  });
  defineWorkerInternal(worker, "_opencontainersSend", () => {
    throw unsupportedIpcError();
  });

  virtualProcess.stdout.on("data", (chunk) => {
    stdout.push(chunk);
    if (!silent) parentProcess.stdout.write(chunk);
  });
  virtualProcess.stderr.on("data", (chunk) => {
    stderr.push(chunk);
    if (!silent) parentProcess.stderr.write(chunk);
  });
  virtualProcess.on("exit", (code, signal) => {
    processHandle.exitCode = code;
    processHandle.signalCode = signal;
    processHandle.connected = false;
    worker.state = "dead";
    stdout.push(null);
    stderr.push(null);
    processHandle.emit("exit", code, signal);
    processHandle.emit("close", code, signal);
  });
  virtualProcess.on("error", (error) => {
    processHandle.emit("error", error);
  });

  return worker;
}

function unsupportedIpcError() {
  return Object.assign(new Error("cluster IPC and handle passing are not supported in OpenContainers V1"), {
    code: "ERR_OPENCONTAINERS_CLUSTER_IPC_UNSUPPORTED"
  });
}
