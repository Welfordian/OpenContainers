import { EventEmitter } from "./events.js";
import { Readable, Writable } from "./stream.js";
import { RuntimeBuffer } from "./buffer.js";

function normalizeSpawnArgs(args, options) {
  if (Array.isArray(args)) return { args, options: options ?? {} };
  if (args === undefined || args === null) return { args: [], options: {} };
  if (typeof args === "object") return { args: [], options: args };
  return { args: [String(args)], options: options ?? {} };
}

function normalizeStdio(stdio) {
  if (Array.isArray(stdio)) {
    return [
      stdio[0] ?? "pipe",
      stdio[1] ?? "pipe",
      stdio[2] ?? "pipe"
    ];
  }
  if (stdio === "inherit") return ["inherit", "inherit", "inherit"];
  if (stdio === "ignore") return ["ignore", "ignore", "ignore"];
  return ["pipe", "pipe", "pipe"];
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(text)) return text;
  if (text === "") return "''";
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function normalizeShellSpawn(command, args, options) {
  if (!options.shell) return { command, args, options };
  const shellCommand = args.length
    ? [command, ...args].map(shellQuote).join(" ")
    : String(command);
  const shell = typeof options.shell === "string" ? options.shell : "sh";
  return {
    command: shell,
    args: ["-c", shellCommand],
    options: { ...options, shell: false }
  };
}

function normalizeMaxBuffer(options = {}) {
  if (options.maxBuffer === undefined) return 1024 * 1024;
  if (typeof options.maxBuffer !== "number") {
    throw Object.assign(new TypeError(`The "options.maxBuffer" property must be of type number. Received type ${typeof options.maxBuffer}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (Number.isNaN(options.maxBuffer) || options.maxBuffer < 0) {
    throw Object.assign(new RangeError(`The value of "options.maxBuffer" is out of range. It must be >= 0. Received ${options.maxBuffer}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return options.maxBuffer;
}

function normalizeKillSignal(signal = "SIGTERM") {
  if (signal === 9) return "SIGKILL";
  if (signal === 15) return "SIGTERM";
  return typeof signal === "string" ? signal : "SIGTERM";
}

function normalizeTimeout(options = {}) {
  const timeout = options.timeout ?? 0;
  if (typeof timeout !== "number") {
    throw Object.assign(new TypeError(`The "timeout" argument must be of type number. Received type ${typeof timeout}${formatTimeoutValue(timeout)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (!Number.isInteger(timeout)) {
    throw Object.assign(new RangeError(`The value of "timeout" is out of range. It must be an integer. Received ${timeout}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  if (timeout < 0 || timeout > Number.MAX_SAFE_INTEGER) {
    throw Object.assign(new RangeError(`The value of "timeout" is out of range. It must be >= 0 && <= ${Number.MAX_SAFE_INTEGER}. Received ${timeout}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return timeout;
}

function formatTimeoutValue(value) {
  if (typeof value === "string") return ` ('${value}')`;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return ` (${String(value)})`;
  return "";
}

function createMaxBufferError(command) {
  const error = new Error(`spawnSync ${command} ENOBUFS`);
  error.errno = -55;
  error.code = "ENOBUFS";
  error.syscall = `spawnSync ${command}`;
  return error;
}

function createSpawnSyncTimeoutError(command) {
  const error = new Error(`spawnSync ${command} ETIMEDOUT`);
  error.errno = -60;
  error.code = "ETIMEDOUT";
  error.syscall = `spawnSync ${command}`;
  return error;
}

function createSpawnSyncEnoentError(command, args = []) {
  const error = new Error(`spawnSync ${command} ENOENT`);
  error.errno = -2;
  error.code = "ENOENT";
  error.syscall = `spawnSync ${command}`;
  error.path = String(command);
  error.spawnargs = [...args];
  return error;
}

function createExecMaxBufferError(streamName, command) {
  const error = new RangeError(`${streamName} maxBuffer length exceeded`);
  error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
  error.cmd = command;
  return error;
}

function createExecExitError(command, code, signal, stderr) {
  const message = stderr ? `Command failed: ${command}\n${stderr}` : `Command failed: ${command}`;
  return Object.assign(new Error(message), {
    code,
    killed: signal !== null && signal !== undefined,
    signal: signal ?? null,
    cmd: command
  });
}

function validateAbortSignal(signal) {
  if (signal === undefined) return;
  const valid = (typeof signal === "object" || typeof signal === "function")
    && signal !== null
    && typeof signal.aborted === "boolean"
    && typeof signal.addEventListener === "function"
    && typeof signal.removeEventListener === "function";
  if (!valid) {
    const received = signal === null ? "null" : typeof signal;
    throw Object.assign(new TypeError(`The "options.signal" property must be an instance of AbortSignal. Received ${received}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
}

function createAbortError(cause) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (cause !== undefined) error.cause = cause;
  return error;
}

class ChildProcessImpl extends EventEmitter {
  constructor() {
    super();
    this._events = Object.create(null);
    this._eventsCount = 0;
    this._maxListeners = undefined;
    this._closesNeeded = 1;
    this._closesGot = 0;
    this.connected = false;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.spawnfile = null;
    this._handle = null;
  }
}

export function ChildProcess() {
  if (!new.target) {
    throw new TypeError("Cannot read properties of undefined (reading '_events')");
  }
  return Reflect.construct(ChildProcessImpl, [], new.target);
}

ChildProcess.prototype = ChildProcessImpl.prototype;
Object.defineProperty(ChildProcess.prototype, "constructor", {
  configurable: true,
  value: ChildProcess,
  writable: true
});

Object.defineProperties(ChildProcess.prototype, {
  spawn: {
    value: function spawn(_options) {
      throw Object.assign(new Error("ChildProcess.spawn is not directly supported in OpenContainers"), {
        code: "ERR_OPENCONTAINERS_CHILD_PROCESS_UNSUPPORTED"
      });
    },
    enumerable: true,
    configurable: true,
    writable: true
  },
  kill: {
    value: function kill(signal) {
      if (this.exitCode !== null || this.signalCode !== null || typeof this._handle?.kill !== "function") {
        return false;
      }
      this.killed = true;
      this._handle.kill(signal === undefined ? "SIGTERM" : signal);
      return true;
    },
    enumerable: true,
    configurable: true,
    writable: true
  },
  ref: {
    value: function ref() {},
    enumerable: true,
    configurable: true,
    writable: true
  },
  unref: {
    value: function unref() {},
    enumerable: true,
    configurable: true,
    writable: true
  }
});

if (typeof Symbol.dispose === "symbol") {
  const childProcessDispose = function() {
    this.kill();
  };
  Object.defineProperty(childProcessDispose, "name", {
    configurable: true,
    value: ""
  });
  Object.defineProperty(ChildProcess.prototype, Symbol.dispose, {
    value: childProcessDispose,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function childHandleFromVirtualProcess(virtualProcess, { parentProcess, stdio = "pipe", ipc = null, spawnfile = null, spawnargs = undefined } = {}) {
  const [stdinMode, stdoutMode, stderrMode] = normalizeStdio(stdio);
  const child = new ChildProcess();
  child.pid = virtualProcess.pid;
  child.spawnfile = spawnfile;
  child._handle = {
    kill(signal) {
      virtualProcess.kill(signal);
    }
  };
  if (Array.isArray(spawnargs)) child.spawnargs = [...spawnargs];
  child.stdin = stdinMode === "pipe"
    ? new Writable({ write: (chunk) => virtualProcess.stdin.write(chunk) })
    : null;
  child.stdout = stdoutMode === "pipe" ? new Readable() : null;
  child.stderr = stderrMode === "pipe" ? new Readable() : null;
  child.stdio = [child.stdin, child.stdout, child.stderr];

  virtualProcess.on("spawn", () => child.emit("spawn"));
  virtualProcess.stdout.on("data", (chunk) => {
    if (stdoutMode === "inherit") parentProcess?.stdout?.write(chunk);
    child.stdout?.push(chunk);
  });
  virtualProcess.stderr.on("data", (chunk) => {
    if (stderrMode === "inherit") parentProcess?.stderr?.write(chunk);
    child.stderr?.push(chunk);
  });
  virtualProcess.on("exit", (code, signal) => {
    const emitClose = () => {
      const childCode = signal ? null : code;
      child.exitCode = childCode;
      child.signalCode = signal;
      child._handle = null;
      child.stdout?.push(null);
      child.stderr?.push(null);
      child.emit("exit", childCode, signal);
      child.emit("close", childCode, signal);
    };
    if (ipc) queueMicrotask(emitClose);
    else emitClose();
  });
  virtualProcess.on("spawn-failure-close", (code, signal) => {
    child.exitCode = code;
    child.signalCode = signal;
    child._handle = null;
    child.stdout?.push(null);
    child.stderr?.push(null);
    child.emit("close", code, signal);
  });
  virtualProcess.on("error", (error) => child.emit("error", error));

  if (ipc) attachIpcToChild(child, virtualProcess, { parentProcess, ipc });
  return child;
}

function attachAbortSignalToChild(child, signal, killSignal = "SIGTERM") {
  validateAbortSignal(signal);
  if (signal === undefined) return;

  const normalizedKillSignal = normalizeKillSignal(killSignal);
  let handled = false;
  const cleanup = () => {
    signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    if (handled || child.exitCode !== null || child.signalCode !== null) return;
    handled = true;
    child.emit("error", createAbortError(signal.reason));
    child.kill(normalizedKillSignal);
  };

  signal.addEventListener("abort", onAbort, { once: true });
  child.once("close", cleanup);
  child.once("error", cleanup);
  if (signal.aborted) queueMicrotask(onAbort);
}

function attachTimeoutToChild(child, timeout, killSignal = "SIGTERM") {
  if (timeout <= 0) return;
  const normalizedKillSignal = normalizeKillSignal(killSignal);
  const timeoutId = globalThis.setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(normalizedKillSignal);
  }, timeout);
  const cleanup = () => globalThis.clearTimeout(timeoutId);
  child.once("close", cleanup);
  child.once("error", cleanup);
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function createChildProcessBuiltin({ kernel, process }) {
  const spawn = (command, args, options) => {
    if (kernel.allowChildProcesses === false) {
      throw Object.assign(new Error("Child process spawning is disabled for this project"), {
        code: "ERR_OPENCONTAINERS_CHILD_PROCESS_PERMISSION"
      });
    }
    let normalized = normalizeSpawnArgs(args, options);
    normalized = normalizeShellSpawn(command, normalized.args, normalized.options);
    validateAbortSignal(normalized.options.signal);
    const timeout = normalizeTimeout(normalized.options);
    process.__opencontainersAddRef?.();
    const virtualProcess = kernel.spawn(normalized.command, normalized.args, {
      cwd: normalized.options.cwd ?? process.cwd(),
      env: { ...process.env, ...(normalized.options.env ?? {}) },
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      parentPid: process.pid,
      ipc: normalized.options.ipc
    });
    const child = childHandleFromVirtualProcess(virtualProcess, {
      parentProcess: process,
      stdio: normalized.options.stdio,
      ipc: normalized.options.ipc,
      spawnfile: normalized.command,
      spawnargs: [normalized.command, ...normalized.args]
    });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      process.__opencontainersUnref?.();
    };
    child.once("close", release);
    attachTimeoutToChild(child, timeout, normalized.options.killSignal);
    attachAbortSignalToChild(child, normalized.options.signal, normalized.options.killSignal);
    return child;
  };

  const exec = (command, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const normalizedOptions = typeof options === "object" && options !== null ? options : {};
    const collectorOptions = normalizeAsyncExecOptions(normalizedOptions);
    const child = spawn("sh", ["-c", command], normalizedOptions);
    return collectAsyncExecOutput(child, {
      callback: cb,
      command: String(command),
      options: collectorOptions
    });
  };

  const spawnSync = (command, args, options) => {
    let normalized = normalizeSpawnArgs(args, options);
    normalized = normalizeShellSpawn(command, normalized.args, normalized.options);
    const timeout = normalizeTimeout(normalized.options);
    const startedAt = now();
    const result = kernel.spawnSync(normalized.command, normalized.args, {
      cwd: normalized.options.cwd ?? process.cwd(),
      env: { ...process.env, ...(normalized.options.env ?? {}) },
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      parentPid: process.pid,
      input: normalized.options.input
    });
    return normalizeSyncResult(result, normalized.options, normalized.command, {
      args: normalized.args,
      timedOut: timeout > 0 && now() - startedAt >= timeout
    });
  };

  const execSync = (command, options) => {
    const normalizedOptions = options ?? {};
    const result = spawnSync("sh", ["-c", command], normalizedOptions);
    if (result.error) {
      throw Object.assign(result.error, result);
    }
    if (result.status !== 0) {
      throw Object.assign(new Error(`Command failed: ${command}`), result);
    }
    return result.stdout;
  };

  const execFile = (file, args, options, callback) => {
    const normalized = normalizeExecFileArgs(args, options, callback);
    const collectorOptions = normalizeAsyncExecOptions(normalized.options);
    const child = spawn(file, normalized.args, normalized.options);
    return collectAsyncExecOutput(child, {
      callback: normalized.callback,
      command: formatExecCommand(file, normalized.args),
      options: collectorOptions
    });
  };

  const execFileSync = (file, args, options) => {
    const normalized = normalizeSpawnArgs(args, options);
    const result = spawnSync(file, normalized.args, normalized.options);
    if (result.error) {
      throw Object.assign(result.error, result);
    }
    if (result.status !== 0) {
      throw Object.assign(new Error(`Command failed: ${file}`), result);
    }
    return normalized.options.encoding && normalized.options.encoding !== "buffer"
      ? result.stdout.toString(normalized.options.encoding)
      : result.stdout;
  };

  const fork = (modulePath, args = [], options = {}) => {
    let normalizedArgs = args;
    let normalizedOptions = options;
    if (!Array.isArray(normalizedArgs)) {
      normalizedOptions = normalizedArgs ?? {};
      normalizedArgs = [];
    }
    const ipc = createIpcChannel();
    const forkOptions = {
      ...normalizedOptions,
      env: { ...process.env, ...(normalizedOptions.env ?? {}) },
      stdio: normalizedOptions.stdio ?? (normalizedOptions.silent ? "pipe" : ["pipe", "inherit", "inherit", "ipc"]),
      ipc
    };
    return spawn("node", [modulePath, ...normalizedArgs], forkOptions);
  };

  alignChildProcessHelperMetadata([
    spawn,
    spawnSync,
    exec,
    execFile,
    execFileSync,
    execSync,
    fork,
    _forkChild
  ]);

  return {
    _forkChild,
    ChildProcess,
    exec,
    execFile,
    execFileSync,
    execSync,
    fork,
    spawn,
    spawnSync
  };
}

function _forkChild(_fd, _serializationMode) {
  throw Object.assign(new Error("child_process._forkChild is not supported in OpenContainers"), {
    code: "ERR_OPENCONTAINERS_CHILD_PROCESS_UNSUPPORTED"
  });
}

function alignChildProcessHelperMetadata(functions) {
  for (const fn of functions) {
    ensureOwnFunctionPrototype(fn);
  }
}

function ensureOwnFunctionPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    enumerable: false,
    configurable: false,
    writable: true,
    value: prototype
  });
}

function normalizeExecFileArgs(args, options, callback) {
  if (typeof args === "function") {
    return { args: [], options: {}, callback: args };
  }
  if (Array.isArray(args)) {
    if (typeof options === "function") return { args, options: {}, callback: options };
    return { args, options: options ?? {}, callback };
  }
  if (typeof options === "function") return { args: [], options: args ?? {}, callback: options };
  return { args: [], options: args ?? {}, callback };
}

function normalizeAsyncExecOptions(options = {}) {
  const encoding = options.encoding === null || options.encoding === "buffer"
    ? "buffer"
    : options.encoding === undefined
      ? "utf8"
      : String(options.encoding);
  return {
    encoding,
    killSignal: normalizeKillSignal(options.killSignal),
    maxBuffer: normalizeMaxBuffer(options),
    timeout: normalizeTimeout(options)
  };
}

function formatExecCommand(file, args = []) {
  return [file, ...args].map((value) => String(value)).join(" ");
}

function collectAsyncExecOutput(child, { callback, command, options }) {
  const state = {
    callback,
    command,
    error: null,
    exceeded: false,
    finished: false,
    killSignal: options.killSignal,
    maxBuffer: options.maxBuffer,
    encoding: options.encoding,
    stdoutChunks: [],
    stderrChunks: [],
    stdoutLength: 0,
    stderrLength: 0
  };

  child.stdout?.on("data", (chunk) => appendAsyncExecChunk(child, state, "stdout", chunk));
  child.stderr?.on("data", (chunk) => appendAsyncExecChunk(child, state, "stderr", chunk));
  child.on("error", (error) => {
    if (error?.code === "ENOENT" && !Object.hasOwn(error, "cmd")) error.cmd = state.command;
    if (!state.error) state.error = error;
    if (error?.code === "ENOENT") finishAsyncExec(state, -2, null);
  });
  child.on("close", (code, signal) => finishAsyncExec(state, code, signal));
  return child;
}

function appendAsyncExecChunk(child, state, streamName, chunk) {
  if (state.exceeded) return;
  const buffer = RuntimeBuffer.from(chunk);
  const lengthKey = `${streamName}Length`;
  const chunksKey = `${streamName}Chunks`;
  const currentLength = state[lengthKey];
  const nextLength = currentLength + buffer.length;

  if (state.maxBuffer !== Infinity && nextLength > state.maxBuffer) {
    const remaining = Math.max(0, state.maxBuffer - currentLength);
    if (remaining > 0) state[chunksKey].push(buffer.subarray(0, remaining));
    state[lengthKey] += remaining;
    state.error = createExecMaxBufferError(streamName, state.command);
    state.exceeded = true;
    child.kill(state.killSignal);
    return;
  }

  state[chunksKey].push(buffer);
  state[lengthKey] = nextLength;
}

function finishAsyncExec(state, code, signal) {
  if (state.finished) return;
  state.finished = true;
  const stdout = finalizeAsyncExecOutput(state.stdoutChunks, state.encoding);
  const stderr = finalizeAsyncExecOutput(state.stderrChunks, state.encoding);
  const error = state.error ?? (code === 0 ? null : createExecExitError(state.command, code, signal, String(stderr)));
  state.callback?.(error, stdout, stderr);
}

function finalizeAsyncExecOutput(chunks, encoding) {
  const buffer = RuntimeBuffer.concat(chunks);
  return encoding === "buffer" ? buffer : buffer.toString(encoding);
}

function normalizeSyncResult(result, options = {}, command = "", { args = [], timedOut = false } = {}) {
  if (result.error?.code === "ENOENT") {
    const error = createSpawnSyncEnoentError(command, args);
    return {
      error,
      status: null,
      signal: null,
      output: null,
      pid: 0,
      stdout: undefined,
      stderr: undefined
    };
  }

  const encoding = options.encoding;
  const stdout = encoding && encoding !== "buffer" ? result.stdout.toString(encoding) : result.stdout;
  const stderr = encoding && encoding !== "buffer" ? result.stderr.toString(encoding) : result.stderr;
  const maxBuffer = normalizeMaxBuffer(options);
  const outputSize = result.stdout.length + result.stderr.length;
  const maxBufferExceeded = maxBuffer !== 0 && maxBuffer !== Infinity && outputSize > maxBuffer;
  const error = maxBufferExceeded
    ? createMaxBufferError(command)
    : timedOut
      ? createSpawnSyncTimeoutError(command)
      : result.status === 0
        ? undefined
        : result.error;
  return {
    ...result,
    status: maxBufferExceeded || timedOut ? null : result.status,
    signal: maxBufferExceeded || timedOut ? normalizeKillSignal(options.killSignal) : result.signal,
    stdout,
    stderr,
    output: [null, stdout, stderr],
    error
  };
}

function createIpcChannel() {
  return {
    connected: true,
    pendingToChild: [],
    deliverToChild: null,
    disconnectFromParent: null,
    disconnectFromChild: null,
    sendToParent: null
  };
}

function attachIpcToChild(child, virtualProcess, { parentProcess, ipc }) {
  let disconnected = false;
  const markDisconnected = () => {
    if (disconnected) return;
    disconnected = true;
    ipc.connected = false;
    child.connected = false;
    child.emit("disconnect");
  };
  const deliverWithRef = (callback) => {
    parentProcess?.__opencontainersAddRef?.();
    queueMicrotask(() => {
      try {
        callback();
      } finally {
        parentProcess?.__opencontainersUnref?.();
      }
    });
  };

  child.connected = true;
  child.channel = {
    ref() {
      return child;
    },
    unref() {
      return child;
    }
  };
  child.send = (message, sendHandle, options, callback) => {
    const sendArgs = normalizeIpcSendArgs(sendHandle, options, callback);
    if (sendArgs.error) {
      sendArgs.callback?.(sendArgs.error);
      throw sendArgs.error;
    }
    if (disconnected || !ipc.connected) {
      const error = createIpcClosedError();
      sendArgs.callback?.(error);
      return false;
    }
    const cloned = cloneIpcMessage(message);
    if (cloned.error) {
      sendArgs.callback?.(cloned.error);
      throw cloned.error;
    }
    deliverWithRef(() => {
      if (ipc.deliverToChild) ipc.deliverToChild(cloned.value);
      else ipc.pendingToChild.push(cloned.value);
      sendArgs.callback?.(null);
    });
    return true;
  };
  child.disconnect = () => {
    if (disconnected || !ipc.connected) return child;
    ipc.disconnectFromParent?.();
    markDisconnected();
    return child;
  };

  ipc.sendToParent = (message, callback) => {
    if (disconnected || !ipc.connected) {
      callback?.(createIpcClosedError());
      return false;
    }
    const cloned = cloneIpcMessage(message);
    if (cloned.error) {
      callback?.(cloned.error);
      return false;
    }
    deliverWithRef(() => {
      child.emit("message", cloned.value);
      callback?.(null);
    });
    return true;
  };
  ipc.disconnectFromChild = markDisconnected;

  virtualProcess.on("exit", markDisconnected);
  virtualProcess.on("error", markDisconnected);
}

function normalizeIpcSendArgs(sendHandle, options, callback) {
  let cb = callback;
  let handle = sendHandle;
  if (typeof handle === "function") {
    cb = handle;
    handle = undefined;
  } else if (typeof options === "function") {
    cb = options;
  }
  if (handle !== undefined && handle !== null) {
    return {
      callback: cb,
      error: Object.assign(new Error("IPC handle passing is not supported in OpenContainers V1"), {
        code: "ERR_OPENCONTAINERS_IPC_HANDLE_UNSUPPORTED"
      })
    };
  }
  return { callback: cb };
}

function createIpcClosedError() {
  return Object.assign(new Error("IPC channel is closed"), {
    code: "ERR_IPC_CHANNEL_CLOSED"
  });
}

function cloneIpcMessage(message) {
  if (typeof structuredClone === "function") {
    try {
      return { value: structuredClone(message) };
    } catch (error) {
      return {
        error: Object.assign(new Error(`IPC message could not be cloned: ${error?.message ?? error}`), {
          code: "ERR_OPENCONTAINERS_IPC_SERIALIZATION"
        })
      };
    }
  }
  try {
    return { value: message === undefined ? undefined : JSON.parse(JSON.stringify(message)) };
  } catch (error) {
    return {
      error: Object.assign(new Error(`IPC message could not be serialized: ${error?.message ?? error}`), {
        code: "ERR_OPENCONTAINERS_IPC_SERIALIZATION"
      })
    };
  }
}
