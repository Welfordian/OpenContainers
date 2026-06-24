export const EVENT_TARGET_LISTENERS_SYMBOL = Symbol.for("opencontainers.eventTarget.listeners");
export const EVENT_TARGET_MAX_LISTENERS_SYMBOL = Symbol.for("opencontainers.eventTarget.maxListeners");
export const EVENT_EMITTER_SHAPE_MODE_SYMBOL = Symbol("shapeMode");
export const EVENT_EMITTER_CAPTURE_SYMBOL = Symbol("kCapture");
let defaultMaxListeners = 10;
let globalCaptureRejections = false;
let nextAsyncResourceId = 1;
const eventMaps = new WeakMap();

export const errorMonitor = Symbol("events.errorMonitor");
export const captureRejectionSymbol = Symbol.for("nodejs.rejection");
const kMaxEventTargetListeners = Symbol("events.maxEventTargetListeners");
const kMaxEventTargetListenersWarned = Symbol("events.maxEventTargetListenersWarned");

export class EventEmitter {
  constructor(options) {
    const captureRejections = typeof options === "object" && options !== null
      ? options.captureRejections
      : undefined;
    init.call(this, { captureRejections: Boolean(captureRejections) });
  }

  setMaxListeners(count) {
    this._maxListeners = validateMaxListeners(count);
    return this;
  }

  getMaxListeners() {
    return this._maxListeners ?? defaultMaxListeners;
  }

  on(eventName, listener) {
    return addListener(this, eventName, listener, false);
  }

  addListener(eventName, listener) {
    return addListener(this, eventName, listener, false);
  }

  prependListener(eventName, listener) {
    return addListener(this, eventName, listener, true);
  }

  once(eventName, listener) {
    validateEventListener(listener);
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      listener.apply(this, args);
    };
    wrapped.listener = listener;
    return this.on(eventName, wrapped);
  }

  prependOnceListener(eventName, listener) {
    validateEventListener(listener);
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      listener.apply(this, args);
    };
    wrapped.listener = listener;
    return this.prependListener(eventName, wrapped);
  }

  off(eventName, listener) {
    return removeListener(this, eventName, listener);
  }

  removeListener(eventName, listener) {
    return removeListener(this, eventName, listener);
  }

  removeAllListeners(eventName) {
    const events = eventMap(this);
    if (eventName === undefined) {
      const eventNames = [...events.keys()].filter((name) => name !== "removeListener");
      for (const name of eventNames) removeAllListenersForEvent(this, name);
      events.delete("removeListener");
    } else {
      removeAllListenersForEvent(this, eventName);
    }
    return this;
  }

  emit(eventName, ...args) {
    const events = eventMap(this);
    if (eventName === "error") {
      const monitorListeners = [...(events.get(errorMonitor) ?? [])];
      for (const listener of monitorListeners) callListener(this, listener, eventName, args, false);
    }

    const listeners = [...(events.get(eventName) ?? [])];
    if (!listeners.length && eventName === "error") {
      const error = args[0] instanceof Error ? args[0] : createUnhandledError(args[0]);
      if (this.domain && this.domain !== this && typeof this.domain.emit === "function") {
        this.domain.emit("error", error);
        return true;
      }
      throw error;
    }
    const captureRejections = shouldCaptureRejections(this, eventName);
    for (const listener of listeners) callListener(this, listener, eventName, args, captureRejections);
    return listeners.length > 0;
  }

  listenerCount(eventName, listener) {
    const listeners = eventMap(this).get(eventName) ?? [];
    if (listener === undefined) return listeners.length;
    return listeners.filter((item) => item === listener || item.listener === listener).length;
  }

  listeners(eventName) {
    return (eventMap(this).get(eventName) ?? []).map((listener) => listener.listener ?? listener);
  }

  rawListeners(eventName) {
    return [...(eventMap(this).get(eventName) ?? [])];
  }

  eventNames() {
    return [...eventMap(this).keys()];
  }
}

function createEventEmitterAsyncResourceClass(AsyncResourceClass) {
  class RuntimeEventEmitterAsyncResource extends EventEmitter {
    #asyncResource;

    constructor(options) {
      let normalized;
      if (typeof options === "string") {
        normalized = { name: options };
      } else if (typeof options === "function") {
        normalized = { name: options.name || "" };
      } else {
        normalized = options && typeof options === "object" ? { ...options } : {};
      }
      validateAsyncResourceName(normalized.name);
      const triggerAsyncId = validateTriggerAsyncId(normalized);
      super(normalized);
      this.#asyncResource = AsyncResourceClass
        ? new AsyncResourceClass(normalized.name, { triggerAsyncId })
        : createPlainAsyncResource(triggerAsyncId);
    }

    get asyncId() {
      return this.#asyncResource.asyncId();
    }

    get triggerAsyncId() {
      return this.#asyncResource.triggerAsyncId();
    }

    get asyncResource() {
      return this.#asyncResource;
    }

    emit(eventName, ...args) {
      const asyncResource = this.#asyncResource;
      if (typeof asyncResource.runInAsyncScope === "function") {
        return asyncResource.runInAsyncScope(EventEmitter.prototype.emit, this, eventName, ...args);
      }
      return super.emit(eventName, ...args);
    }

    emitDestroy() {
      this.#asyncResource.emitDestroy();
      return undefined;
    }
  }

  Object.defineProperty(RuntimeEventEmitterAsyncResource, "name", {
    configurable: true,
    value: "EventEmitterAsyncResource"
  });
  Object.defineProperty(RuntimeEventEmitterAsyncResource, "length", {
    configurable: true,
    value: 0
  });
  reorderProperties(RuntimeEventEmitterAsyncResource.prototype, [
    "emit",
    "emitDestroy",
    "asyncId",
    "triggerAsyncId",
    "asyncResource"
  ]);
  return RuntimeEventEmitterAsyncResource;
}

function createPlainAsyncResource(triggerAsyncId) {
  const asyncId = nextAsyncResourceId++;
  return {
    asyncId: () => asyncId,
    triggerAsyncId: () => triggerAsyncId,
    emitDestroy: () => undefined
  };
}

export const EventEmitterAsyncResource = createEventEmitterAsyncResourceClass();

export function once(emitter, eventName, options = {}) {
  const isEventTarget = isEventTargetLike(emitter);
  if (!emitter || (typeof emitter.once !== "function" && !isEventTarget)) {
    return Promise.reject(new TypeError("emitter.once is not a function"));
  }
  const signal = options?.signal;
  if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      removeEventSourceListener(emitter, eventName, onEvent);
      if (!isEventTarget && eventName !== "error") emitter.removeListener?.("error", onError);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onEvent = (...args) => {
      cleanup();
      resolve(args);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError(signal.reason));
    };

    if (isEventTarget) emitter.addEventListener(eventName, onEvent, { once: true });
    else {
      emitter.once(eventName, onEvent);
      if (eventName !== "error") emitter.once("error", onError);
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function on(emitter, eventName, options = {}) {
  const isEventTarget = isEventTargetLike(emitter);
  if (!emitter || (typeof emitter.on !== "function" && !isEventTarget)) {
    throw new TypeError("emitter.on is not a function");
  }
  const signal = options?.signal;
  const closeEvents = normalizeCloseEvents(options?.close);
  const queue = [];
  const waiters = [];
  let finished = false;
  let failure = null;

  const settleNext = () => {
    const waiter = waiters.shift();
    if (!waiter) return;
    if (queue.length) {
      waiter.resolve({ value: queue.shift(), done: false });
    } else if (failure) {
      waiter.reject(failure);
    } else if (finished) {
      waiter.resolve({ value: undefined, done: true });
    } else {
      waiters.unshift(waiter);
    }
  };

  const cleanup = () => {
    removeEventSourceListener(emitter, eventName, onEvent);
    if (!isEventTarget && eventName !== "error") emitter.removeListener?.("error", onError);
    for (const closeEvent of closeEvents) removeEventSourceListener(emitter, closeEvent, onClose);
    signal?.removeEventListener?.("abort", onAbort);
  };

  const finish = (error) => {
    if (finished || failure) return;
    if (error) failure = error;
    else finished = true;
    cleanup();
    while (waiters.length) settleNext();
  };

  const onEvent = (...args) => {
    queue.push(args);
    settleNext();
  };
  const onError = (error) => finish(error);
  const onAbort = () => finish(createAbortError(signal.reason));
  const onClose = () => finish();

  if (signal?.aborted) finish(createAbortError(signal.reason));
  else {
    addEventSourceListener(emitter, eventName, onEvent);
    if (!isEventTarget && eventName !== "error") emitter.once("error", onError);
    for (const closeEvent of closeEvents) addEventSourceListener(emitter, closeEvent, onClose, { once: true });
    signal?.addEventListener?.("abort", onAbort, { once: true });
  }

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
      if (failure) return Promise.reject(failure);
      if (finished) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    return() {
      finished = true;
      cleanup();
      while (waiters.length) settleNext();
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(error) {
      finish(error);
      return Promise.reject(error);
    }
  };
}

function isEventTargetLike(value) {
  return typeof value?.addEventListener === "function"
    && typeof value?.removeEventListener === "function";
}

function addEventSourceListener(source, eventName, listener, options) {
  if (isEventTargetLike(source)) source.addEventListener(eventName, listener, options);
  else source.on(eventName, listener);
}

function removeEventSourceListener(source, eventName, listener) {
  if (isEventTargetLike(source)) source.removeEventListener(eventName, listener);
  else source.removeListener?.(eventName, listener);
}

function eventMap(target) {
  let events = eventMaps.get(target);
  if (!events) {
    events = new Map();
    eventMaps.set(target, events);
    ensureEventEmitterState(target);
  }
  return events;
}

function init(options) {
  eventMaps.set(this, new Map());
  Object.defineProperty(this, "_events", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: Object.create(null)
  });
  Object.defineProperty(this, "_eventsCount", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: 0
  });
  Object.defineProperty(this, "_maxListeners", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: this._maxListeners
  });
  this[EVENT_EMITTER_SHAPE_MODE_SYMBOL] = false;
  this[EVENT_EMITTER_CAPTURE_SYMBOL] = Boolean(options?.captureRejections);
}

function ensureEventEmitterState(target) {
  if (!Object.hasOwn(target, "_events")) {
    Object.defineProperty(target, "_events", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: Object.create(null)
    });
  }
  if (!Object.hasOwn(target, "_eventsCount")) {
    Object.defineProperty(target, "_eventsCount", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 0
    });
  }
  if (!Object.hasOwn(target, "_maxListeners")) {
    Object.defineProperty(target, "_maxListeners", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined
    });
  }
  if (!Object.hasOwn(target, EVENT_EMITTER_SHAPE_MODE_SYMBOL)) target[EVENT_EMITTER_SHAPE_MODE_SYMBOL] = false;
  if (!Object.hasOwn(target, EVENT_EMITTER_CAPTURE_SYMBOL)) target[EVENT_EMITTER_CAPTURE_SYMBOL] = false;
}

function syncEventEmitterState(target, events) {
  ensureEventEmitterState(target);
  const state = Object.create(null);
  for (const [eventName, listeners] of events) {
    if (!listeners.length) continue;
    state[eventName] = listeners.length === 1 ? listeners[0] : [...listeners];
  }
  target._events = state;
  target._eventsCount = events.size;
}

function addListener(target, eventName, listener, prepend) {
  validateEventListener(listener);
  if (eventName !== "newListener") {
    target.emit?.("newListener", eventName, listener.listener ?? listener);
  }
  const events = eventMap(target);
  const listeners = events.get(eventName) ?? [];
  if (prepend) listeners.unshift(listener);
  else listeners.push(listener);
  events.set(eventName, listeners);
  syncEventEmitterState(target, events);
  return target;
}

function removeListener(target, eventName, listener) {
  validateEventListener(listener);
  const events = eventMap(target);
  const listeners = events.get(eventName);
  if (!listeners) return target;
  let removed = null;
  const filtered = [];
  for (let index = listeners.length - 1; index >= 0; index--) {
    const item = listeners[index];
    if (!removed && (item === listener || item.listener === listener)) {
      removed = item;
      continue;
    }
    filtered.unshift(item);
  }
  if (filtered.length) events.set(eventName, filtered);
  else events.delete(eventName);
  syncEventEmitterState(target, events);
  if (removed && eventName !== "removeListener") {
    target.emit?.("removeListener", eventName, removed.listener ?? removed);
  }
  return target;
}

function removeAllListenersForEvent(target, eventName) {
  const events = eventMap(target);
  const listeners = events.get(eventName);
  if (!listeners?.length) return;
  events.delete(eventName);
  syncEventEmitterState(target, events);
  if (eventName === "removeListener") return;
  for (let index = listeners.length - 1; index >= 0; index--) {
    const listener = listeners[index];
    target.emit?.("removeListener", eventName, listener.listener ?? listener);
  }
  return target;
}

function callListener(target, listener, eventName, args, captureRejections) {
  const result = listener.apply(target, args);
  if (!captureRejections || !result || typeof result.then !== "function") return;
  result.then(undefined, (error) => handleCapturedRejection(target, error, eventName, args));
}

function shouldCaptureRejections(target, eventName) {
  if (eventName === "error" || eventName === errorMonitor) return false;
  return Boolean(target.captureRejections ?? target[EVENT_EMITTER_CAPTURE_SYMBOL] ?? EventEmitter.captureRejections);
}

function handleCapturedRejection(target, error, eventName, args) {
  const handler = target[captureRejectionSymbol];
  if (typeof handler === "function") {
    handler.call(target, error, eventName, ...args);
    return;
  }
  target.emit("error", error);
}

Object.defineProperty(setMaxListeners, "name", {
  configurable: true,
  value: ""
});
Object.defineProperty(init, "name", {
  configurable: true,
  value: ""
});
Object.defineProperties(EventEmitter.prototype, {
  _events: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
  },
  _eventsCount: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: 0
  },
  _maxListeners: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
  }
});
Object.defineProperties(EventEmitter.prototype, {
  on: {
    ...Object.getOwnPropertyDescriptor(EventEmitter.prototype, "on"),
    value: EventEmitter.prototype.addListener
  },
  off: {
    ...Object.getOwnPropertyDescriptor(EventEmitter.prototype, "off"),
    value: EventEmitter.prototype.removeListener
  }
});
defineEventEmitterStatics();

export function createEventsBuiltin({ AsyncResource } = {}) {
  const RuntimeEventEmitterAsyncResource = createEventEmitterAsyncResourceClass(AsyncResource);
  let builtin;
  builtin = new Proxy(EventEmitter, {
    get(target, property, receiver) {
      if (property === "EventEmitter") return builtin;
      if (property === "EventEmitterAsyncResource") return RuntimeEventEmitterAsyncResource;
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      if (property === "EventEmitter") {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: builtin
        };
      }
      if (property === "EventEmitterAsyncResource") {
        return {
          configurable: true,
          enumerable: true,
          get: function lazyEventEmitterAsyncResource() {
            return RuntimeEventEmitterAsyncResource;
          },
          set: undefined
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    }
  });
  return builtin;
}

for (const key of [
  "setMaxListeners",
  "getMaxListeners",
  "emit",
  "addListener",
  "on",
  "prependListener",
  "once",
  "prependOnceListener",
  "removeListener",
  "off",
  "removeAllListeners",
  "listeners",
  "rawListeners",
  "listenerCount",
  "eventNames"
]) {
  const descriptor = Object.getOwnPropertyDescriptor(EventEmitter.prototype, key);
  if (descriptor) Object.defineProperty(EventEmitter.prototype, key, { ...descriptor, enumerable: true });
}

function createAbortError(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function normalizeCloseEvents(close) {
  if (close === undefined) return [];
  return Array.isArray(close) ? [...close] : [close];
}

function createUnhandledError(value) {
  const error = new Error(`Unhandled error. (${inspectErrorContext(value)})`);
  error.code = "ERR_UNHANDLED_ERROR";
  error.context = value;
  return error;
}

function inspectErrorContext(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getEventListeners(emitterOrTarget, eventName) {
  if (typeof emitterOrTarget?.listeners === "function") return emitterOrTarget.listeners(eventName);
  if (isEventTargetLike(emitterOrTarget)) return getEventTargetListeners(emitterOrTarget, eventName);
  throwInvalidEmitterOrTarget("emitter", emitterOrTarget);
}

function listenerCount(emitter, eventName) {
  if (isEventTargetLike(emitter)) return getEventTargetListeners(emitter, eventName).length;
  if (typeof emitter?.listenerCount === "function") return emitter.listenerCount(eventName);
  throwInvalidEmitterOrTarget("emitter", emitter);
}

function setMaxListeners(...args) {
  const [count, ...targets] = args;
  const value = validateMaxListeners(count);
  if (!targets.length) defaultMaxListeners = value;
  for (const target of targets) {
    if (typeof target?.setMaxListeners === "function") {
      target.setMaxListeners(value);
      continue;
    }
    if (isEventTargetLike(target)) {
      Object.defineProperty(target, EVENT_TARGET_MAX_LISTENERS_SYMBOL, {
        configurable: true,
        writable: true,
        value
      });
      continue;
    }
    throwInvalidEmitterOrTarget("eventTargets", target);
  }
}

function getMaxListeners(target) {
  if (typeof target?.getMaxListeners === "function") return target.getMaxListeners();
  if (isEventTargetLike(target)) return target[EVENT_TARGET_MAX_LISTENERS_SYMBOL] ?? defaultMaxListeners;
  throwInvalidEmitterOrTarget("emitter", target);
}

function addAbortListener(signal, listener) {
  validateAbortSignal(signal);
  validateEventListener(listener);
  if (signal.aborted) {
    queueMicrotask(() => listener());
    return { [Symbol.dispose]() {} };
  }
  signal.addEventListener?.("abort", listener, { once: true });
  return {
    [Symbol.dispose]() {
      signal.removeEventListener?.("abort", listener);
    }
  };
}

function validateAsyncResourceName(name) {
  if (typeof name === "string") return;
  throw Object.assign(new TypeError(`The "options.name" property must be of type string. Received ${describeReceived(name)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function validateTriggerAsyncId(options) {
  if (!Object.prototype.hasOwnProperty.call(options, "triggerAsyncId")) return 0;
  const value = options.triggerAsyncId;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < -1 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw Object.assign(new RangeError(`Invalid triggerAsyncId value: ${String(value)}`), {
      code: "ERR_INVALID_ASYNC_ID"
    });
  }
  return value;
}

function validateMaxListeners(count) {
  if (typeof count !== "number") {
    throw Object.assign(new TypeError(`The "n" argument must be of type number. Received type ${typeof count}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (Number.isNaN(count) || count < 0) {
    throw Object.assign(new RangeError(`The value of "n" is out of range. It must be a non-negative number. Received ${count}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return count;
}

function validateEventListener(listener) {
  if (typeof listener === "function") return;
  throw Object.assign(
    new TypeError(`The "listener" argument must be of type function. Received type ${typeof listener}${formatReceivedValue(listener)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function validateAbortSignal(signal) {
  if (typeof AbortSignal === "function" && signal instanceof AbortSignal) return;
  throw Object.assign(
    new TypeError(`The "signal" argument must be an instance of AbortSignal. Received ${describeReceived(signal)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function getEventTargetListeners(target, eventName) {
  const listeners = target?.[EVENT_TARGET_LISTENERS_SYMBOL]?.get?.(String(eventName));
  if (!Array.isArray(listeners)) return [];
  return listeners.map((entry) => entry.listener);
}

function throwInvalidEmitterOrTarget(name, value) {
  throw Object.assign(
    new TypeError(`The "${name}" argument must be an instance of EventEmitter or EventTarget. Received ${describeReceived(value)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function formatReceivedValue(value) {
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return ` (${String(value)})`;
  if (typeof value === "string") return ` ('${value}')`;
  return "";
}

function describeReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return `function ${value.name ?? ""}`;
  if (typeof value === "object" && value?.constructor?.name) return `an instance of ${value.constructor.name}`;
  return `type ${typeof value}${formatReceivedValue(value)}`;
}

function defineEventEmitterStatics() {
  for (const [key, value] of [
    ["addAbortListener", addAbortListener],
    ["once", once],
    ["on", on],
    ["getEventListeners", getEventListeners],
    ["getMaxListeners", getMaxListeners],
    ["listenerCount", listenerCount],
    ["EventEmitter", EventEmitter],
    ["usingDomains", false],
    ["captureRejectionSymbol", captureRejectionSymbol]
  ]) {
    Object.defineProperty(EventEmitter, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }

  Object.defineProperty(EventEmitter, "captureRejections", {
    enumerable: true,
    get: () => globalCaptureRejections,
    set: (value) => {
      globalCaptureRejections = Boolean(value);
    }
  });
  Object.defineProperty(EventEmitter, "EventEmitterAsyncResource", {
    configurable: true,
    enumerable: true,
    get: function lazyEventEmitterAsyncResource() {
      return EventEmitterAsyncResource;
    }
  });
  Object.defineProperty(EventEmitter, "errorMonitor", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: errorMonitor
  });
  Object.defineProperty(EventEmitter, "defaultMaxListeners", {
    enumerable: true,
    get: () => defaultMaxListeners,
    set: (value) => {
      defaultMaxListeners = validateMaxListeners(value);
    }
  });
  Object.defineProperty(EventEmitter, "kMaxEventTargetListeners", {
    value: kMaxEventTargetListeners
  });
  Object.defineProperty(EventEmitter, "kMaxEventTargetListenersWarned", {
    value: kMaxEventTargetListenersWarned
  });
  Object.defineProperty(EventEmitter, "setMaxListeners", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: setMaxListeners
  });
  Object.defineProperty(EventEmitter, "init", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: init
  });
}

function reorderProperties(target, names) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(target, name)])
    .filter(([, descriptor]) => descriptor?.configurable);
  for (const [name] of descriptors) {
    delete target[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(target, name, descriptor);
  }
}

export default EventEmitter;
