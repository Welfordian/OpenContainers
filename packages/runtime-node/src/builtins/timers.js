let nextTimerId = 1;

export function createTimerApi({ process, asyncContextManager } = {}) {
  const mockTimers = new OpenContainersMockTimers({ process, asyncContextManager });

  function setTimeoutCompat(callback, delay = 0, ...args) {
    validateTimerCallback(callback);
    if (mockTimers.isApiEnabled("setTimeout")) {
      return mockTimers.setTimer({ kind: "timeout", callback, args, delay });
    }
    const handle = new OpenContainersTimerHandle({ kind: "timeout", process, asyncContextManager, callback, args, delay });
    handle.start();
    return handle;
  }

  function setIntervalCompat(callback, delay = 0, ...args) {
    validateTimerCallback(callback);
    if (mockTimers.isApiEnabled("setInterval")) {
      return mockTimers.setTimer({ kind: "interval", callback, args, delay, repeat: true });
    }
    const handle = new OpenContainersTimerHandle({ kind: "interval", process, asyncContextManager, callback, args, delay, repeat: true });
    handle.start();
    return handle;
  }

  function setImmediateCompat(callback, ...args) {
    validateTimerCallback(callback);
    if (mockTimers.isApiEnabled("setImmediate")) {
      return mockTimers.setTimer({ kind: "immediate", callback, args, delay: 0 });
    }
    const handle = new OpenContainersTimerHandle({ kind: "immediate", process, asyncContextManager, callback, args, delay: 0 });
    handle.start();
    return handle;
  }

  const clearTimer = (handle) => {
    if (handle?.__opencontainersMockTimer) {
      handle.close();
      return;
    }
    if (handle instanceof OpenContainersTimerHandle) {
      handle.close();
      return;
    }
    globalThis.clearTimeout(handle);
    globalThis.clearInterval(handle);
  };
  function clearTimeout(handle) {
    return clearTimer(handle);
  }
  function clearImmediate(handle) {
    return clearTimer(handle);
  }
  function clearInterval(handle) {
    return clearTimer(handle);
  }

  const timersPromisesSetTimeout = function setTimeout(delay = 1, value, options) {
    return new Promise((resolve, reject) => {
      const normalized = normalizeTimerPromiseOptions(options);
      const signal = normalized.signal;
      if (signal?.aborted) {
        reject(createAbortError(signal.reason));
        return;
      }
      const handle = setTimeoutCompat(() => {
        cleanup();
        resolve(value);
      }, delay);
      if (normalized.ref === false) handle?.unref?.();
      const onAbort = () => {
        clearTimer(handle);
        cleanup();
        reject(createAbortError(signal.reason));
      };
      const cleanup = () => {
        signal?.removeEventListener?.("abort", onAbort);
      };
      signal?.addEventListener?.("abort", onAbort, { once: true });
    });
  };

  const timersPromisesSetImmediate = function setImmediate(value, options) {
    return new Promise((resolve, reject) => {
      const normalized = normalizeTimerPromiseOptions(options);
      const signal = normalized.signal;
      if (signal?.aborted) {
        reject(createAbortError(signal.reason));
        return;
      }
      const handle = setImmediateCompat(() => {
        cleanup();
        resolve(value);
      });
      if (normalized.ref === false) handle?.unref?.();
      const onAbort = () => {
        clearTimer(handle);
        cleanup();
        reject(createAbortError(signal.reason));
      };
      const cleanup = () => {
        signal?.removeEventListener?.("abort", onAbort);
      };
      signal?.addEventListener?.("abort", onAbort, { once: true });
    });
  };

  const timersPromisesSetInterval = async function* timersPromisesSetInterval(delay = 1, value, options) {
    const normalized = normalizeTimerPromiseOptions(options);
    while (true) {
      await timersPromisesSetTimeout(delay, undefined, normalized);
      if (normalized.signal?.aborted) throw createAbortError(normalized.signal.reason);
      yield value;
    }
  };

  const scheduler = createScheduler(timersPromisesSetTimeout, timersPromisesSetImmediate);

  const promisesBuiltin = {
    setTimeout: timersPromisesSetTimeout,
    setImmediate: timersPromisesSetImmediate,
    setInterval: timersPromisesSetInterval,
    scheduler,
  };
  alignFunctionMetadata(setTimeoutCompat, "setTimeout", 2);
  alignFunctionMetadata(setIntervalCompat, "setInterval", 2);
  alignFunctionMetadata(setImmediateCompat, "setImmediate", 1);
  alignFunctionMetadata(timersPromisesSetTimeout, "setTimeout", 2);
  alignFunctionMetadata(timersPromisesSetImmediate, "setImmediate", 1);
  alignFunctionMetadata(timersPromisesSetInterval, "setInterval", 2);
  const builtin = {
    setTimeout: setTimeoutCompat,
    clearTimeout,
    setImmediate: setImmediateCompat,
    clearImmediate,
    setInterval: setIntervalCompat,
    clearInterval
  };
  Object.defineProperty(builtin, "promises", {
    configurable: true,
    enumerable: true,
    get: createAccessorGetter("get", function() {
      return promisesBuiltin;
    })
  });

  return {
    clearImmediate,
    clearInterval,
    clearTimeout,
    setImmediate: setImmediateCompat,
    setInterval: setIntervalCompat,
    setTimeout: setTimeoutCompat,
    Date: mockTimers.Date,
    mockTimers,
    builtin,
    promisesBuiltin
  };
}

const kScheduler = Symbol("kScheduler");

function createScheduler(setTimeoutPromise, setImmediatePromise) {
  class Scheduler {
    constructor() {
      this[kScheduler] = true;
    }

    yield() {
      return setImmediatePromise();
    }

    wait(delay, options) {
      return setTimeoutPromise(delay, undefined, options);
    }
  }

  return new Scheduler();
}

function alignFunctionMetadata(fn, name, length) {
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
  Object.defineProperty(fn, "length", {
    configurable: true,
    value: length
  });
}

function createAccessorGetter(name, implementation) {
  const descriptor = Object.getOwnPropertyDescriptor({
    get value() {
      return implementation.call(this);
    }
  }, "value");
  Object.defineProperty(descriptor.get, "name", {
    configurable: true,
    value: name
  });
  return descriptor.get;
}

function normalizeTimerPromiseOptions(options = {}) {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object") {
    throw Object.assign(new TypeError(`The "options" argument must be of type object. Received ${options === null ? "null" : `type ${typeof options}`}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (options.signal !== undefined && !isAbortSignal(options.signal)) {
    throw createInvalidTimerPromiseOptionError("options.signal", "an instance of AbortSignal", options.signal);
  }
  if (options.ref !== undefined && typeof options.ref !== "boolean") {
    throw createInvalidTimerPromiseOptionError("options.ref", "of type boolean", options.ref);
  }
  return options;
}

function isAbortSignal(value) {
  return typeof AbortSignal === "function" && value instanceof AbortSignal;
}

function createInvalidTimerPromiseOptionError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" property must be ${expected}. Received ${formatTimerPromiseOptionValue(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function formatTimerPromiseOptionValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `type ${typeof value} (${String(value)})`;
  }
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

function validateTimerCallback(callback) {
  if (typeof callback === "function") return;
  throw Object.assign(new TypeError(`The "callback" argument must be of type function. Received ${formatReceivedValue(callback)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function formatReceivedValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `type ${typeof value} (${String(value)})`;
  }
  if (typeof value === "string") return `type string ('${value}')`;
  return `type ${typeof value}`;
}

function createAbortError(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  error.cause = reason;
  return error;
}

class OpenContainersMockTimers {
  constructor({ process, asyncContextManager } = {}) {
    this.process = process;
    this.asyncContextManager = asyncContextManager;
    this.enabled = false;
    this.apis = new Set();
    this.now = Date.now();
    this.handles = new Map();
    const state = this;
    this.Date = class OpenContainersMockDate extends Date {
      constructor(...args) {
        if (args.length === 0 && state.isApiEnabled("Date")) super(state.now);
        else super(...args);
      }

      static now() {
        return state.isApiEnabled("Date") ? state.now : Date.now();
      }

      static parse(value) {
        return Date.parse(value);
      }

      static UTC(...args) {
        return Date.UTC(...args);
      }
    };
  }

  enable(options = {}) {
    const normalized = normalizeMockTimerOptions(options);
    this.reset();
    this.enabled = true;
    this.apis = new Set(normalized.apis);
    this.now = normalized.now;
  }

  reset() {
    for (const handle of this.handles.values()) handle.close();
    this.handles.clear();
    this.enabled = false;
    this.apis = new Set();
    this.now = Date.now();
  }

  isApiEnabled(api) {
    return this.enabled && (this.apis.size === 0 || this.apis.has(api));
  }

  setTimer(options) {
    const handle = new OpenContainersMockTimerHandle({
      ...options,
      process: this.process,
      asyncContextManager: this.asyncContextManager,
      now: this.now,
      owner: this
    });
    this.handles.set(handle.id, handle);
    return handle;
  }

  tick(milliseconds = 0) {
    const amount = Number(milliseconds);
    if (!Number.isFinite(amount)) return;
    this.setTime(this.now + Math.max(0, amount));
  }

  setTime(now) {
    const nextNow = normalizeMockTimerNow(now);
    this.now = nextNow;
    this.fireDueTimers();
  }

  runAll() {
    let guard = 0;
    while (this.handles.size > 0) {
      if (guard++ > 10000) {
        throw Object.assign(new Error("Aborting after running 10000 mock timers, assuming an infinite loop"), {
          code: "ERR_OPENCONTAINERS_MOCK_TIMER_LOOP"
        });
      }
      const next = this.nextDueHandle();
      if (!next) break;
      this.now = Math.max(this.now, next.dueTime);
      next.fire();
    }
  }

  fireDueTimers() {
    let guard = 0;
    while (true) {
      const due = [...this.handles.values()]
        .filter((handle) => handle.active && handle.dueTime <= this.now)
        .sort((a, b) => a.dueTime - b.dueTime || a.id - b.id)[0];
      if (!due) break;
      if (guard++ > 10000) {
        throw Object.assign(new Error("Aborting after running 10000 mock timers, assuming an infinite loop"), {
          code: "ERR_OPENCONTAINERS_MOCK_TIMER_LOOP"
        });
      }
      due.fire();
    }
  }

  nextDueHandle() {
    return [...this.handles.values()]
      .filter((handle) => handle.active)
      .sort((a, b) => a.dueTime - b.dueTime || a.id - b.id)[0];
  }

  delete(handle) {
    this.handles.delete(handle.id);
  }
}

class OpenContainersMockTimerHandle {
  constructor({ kind, owner, process, asyncContextManager, callback, args = [], delay = 0, repeat = false, now }) {
    this.__opencontainersMockTimer = true;
    this.kind = kind;
    this.owner = owner;
    this.process = process;
    this.asyncContextManager = asyncContextManager;
    this.asyncContext = asyncContextManager?.snapshot();
    this.callback = typeof callback === "function" ? callback : () => {};
    this.args = args;
    this.delay = Math.max(0, Number(delay) || 0);
    this.repeat = repeat;
    this.id = nextTimerId++;
    this.active = true;
    this.refed = true;
    this.dueTime = Number(now) + this.delay;
  }

  fire() {
    if (!this.active) return;
    if (!this.repeat) this.close();
    try {
      const run = () => this.callback(...this.args);
      const result = this.asyncContextManager
        ? this.asyncContextManager.runWithContext(this.asyncContext, run)
        : run();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
          this.process.exitCode = 1;
          this.close();
        });
      }
    } catch (error) {
      this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
      this.process.exitCode = 1;
      this.close();
      return;
    }
    if (this.repeat && this.active) {
      this.dueTime = this.owner.now + Math.max(1, this.delay);
    }
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.owner.delete(this);
  }

  ref() {
    this.refed = true;
    return this;
  }

  unref() {
    this.refed = false;
    return this;
  }

  hasRef() {
    return this.refed;
  }

  refresh() {
    if (this.active) this.dueTime = this.owner.now + this.delay;
    return this;
  }

  [Symbol.toPrimitive]() {
    return this.id;
  }

  [Symbol.dispose]() {
    this.close();
  }
}

function normalizeMockTimerOptions(options = {}) {
  if (Array.isArray(options)) {
    return {
      apis: normalizeMockTimerApis(options),
      now: Date.now()
    };
  }
  if (options === null || typeof options !== "object") {
    return {
      apis: [],
      now: Date.now()
    };
  }
  return {
    apis: normalizeMockTimerApis(options.apis),
    now: normalizeMockTimerNow(options.now)
  };
}

function normalizeMockTimerApis(apis = []) {
  if (!Array.isArray(apis)) return [];
  return apis.map(String).filter((api) => ["Date", "setTimeout", "setInterval", "setImmediate"].includes(api));
}

function normalizeMockTimerNow(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number" && Number.isFinite(now)) return now;
  return Date.now();
}

class OpenContainersTimerHandle {
  constructor({ kind, process, asyncContextManager, callback, args = [], delay = 0, repeat = false }) {
    this.kind = kind;
    this.process = process;
    this.asyncContextManager = asyncContextManager;
    this.asyncContext = asyncContextManager?.snapshot();
    this.callback = typeof callback === "function" ? callback : () => {};
    this.args = args;
    this.delay = Number(delay) || 0;
    this.repeat = repeat;
    this.id = nextTimerId++;
    this.active = true;
    this.refed = true;
    this.refreshedDuringCallback = false;
    this.process?.__opencontainersAddRef?.();
    this.disposeExitHook = this.process?.__opencontainersOnExit?.(() => this.close({ releaseRef: false }));
  }

  start() {
    if (this.kind === "interval") this.nativeHandle = globalThis.setInterval(() => this.fire(), this.delay);
    else this.nativeHandle = globalThis.setTimeout(() => this.fire(), this.delay);
  }

  clearNativeHandle() {
    if (this.kind === "interval") globalThis.clearInterval(this.nativeHandle);
    else globalThis.clearTimeout(this.nativeHandle);
    this.nativeHandle = null;
  }

  fire() {
    if (!this.active) return;
    if (this.process?.__opencontainersIsAlive?.() === false) {
      this.close();
      return;
    }
    this.refreshedDuringCallback = false;
    try {
      const run = () => this.callback(...this.args);
      const result = this.asyncContextManager
        ? this.asyncContextManager.runWithContext(this.asyncContext, run)
        : run();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
          this.process.exitCode = 1;
          this.close();
        });
      }
    } catch (error) {
      this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
      this.process.exitCode = 1;
      this.close();
      return;
    }
    if (!this.repeat && !this.refreshedDuringCallback) this.close();
  }

  close({ releaseRef = true } = {}) {
    if (!this.active) return;
    this.active = false;
    this.clearNativeHandle();
    this.disposeExitHook?.();
    this.disposeExitHook = null;
    if (releaseRef && this.refed) {
      this.refed = false;
      this.process?.__opencontainersUnref?.();
    }
  }

  ref() {
    if (this.active && !this.refed) {
      this.refed = true;
      this.process?.__opencontainersAddRef?.();
    }
    return this;
  }

  unref() {
    if (this.active && this.refed) {
      this.refed = false;
      this.process?.__opencontainersUnref?.();
    }
    return this;
  }

  hasRef() {
    return this.refed;
  }

  refresh() {
    if (!this.active) return this;
    this.refreshedDuringCallback = true;
    this.clearNativeHandle();
    this.start();
    return this;
  }

  [Symbol.toPrimitive]() {
    return this.id;
  }

  [Symbol.dispose]() {
    this.close();
  }
}
