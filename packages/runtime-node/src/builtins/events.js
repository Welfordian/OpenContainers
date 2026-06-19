const EVENTS_SYMBOL = Symbol.for("opencontainers.events");
let defaultMaxListeners = 10;

export class EventEmitter {
  constructor() {
    eventMap(this);
  }

  setMaxListeners(count) {
    this._maxListeners = Number(count);
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
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      listener(...args);
    };
    wrapped.listener = listener;
    return this.on(eventName, wrapped);
  }

  prependOnceListener(eventName, listener) {
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      listener(...args);
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
    if (eventName === undefined) events.clear();
    else events.delete(eventName);
    return this;
  }

  emit(eventName, ...args) {
    const listeners = [...(eventMap(this).get(eventName) ?? [])];
    if (!listeners.length && eventName === "error") {
      const error = args[0] instanceof Error ? args[0] : new Error(String(args[0] ?? "Unhandled error event"));
      throw error;
    }
    for (const listener of listeners) listener(...args);
    return listeners.length > 0;
  }

  listenerCount(eventName) {
    return (eventMap(this).get(eventName) ?? []).length;
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

export function once(emitter, eventName, options = {}) {
  if (!emitter || typeof emitter.once !== "function") {
    return Promise.reject(new TypeError("emitter.once is not a function"));
  }
  const signal = options?.signal;
  if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      emitter.removeListener?.(eventName, onEvent);
      if (eventName !== "error") emitter.removeListener?.("error", onError);
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

    emitter.once(eventName, onEvent);
    if (eventName !== "error") emitter.once("error", onError);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function on(emitter, eventName, options = {}) {
  if (!emitter || typeof emitter.on !== "function") {
    throw new TypeError("emitter.on is not a function");
  }
  const signal = options?.signal;
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
    emitter.removeListener?.(eventName, onEvent);
    if (eventName !== "error") emitter.removeListener?.("error", onError);
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

  if (signal?.aborted) finish(createAbortError(signal.reason));
  else {
    emitter.on(eventName, onEvent);
    if (eventName !== "error") emitter.once("error", onError);
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

function eventMap(target) {
  if (!Object.prototype.hasOwnProperty.call(target, EVENTS_SYMBOL)) {
    Object.defineProperty(target, EVENTS_SYMBOL, {
      configurable: true,
      value: new Map()
    });
  }
  return target[EVENTS_SYMBOL];
}

function addListener(target, eventName, listener, prepend) {
  if (typeof listener !== "function") {
    throw new TypeError("listener must be a function");
  }
  const events = eventMap(target);
  const listeners = events.get(eventName) ?? [];
  if (prepend) listeners.unshift(listener);
  else listeners.push(listener);
  events.set(eventName, listeners);
  return target;
}

function removeListener(target, eventName, listener) {
  const events = eventMap(target);
  const listeners = events.get(eventName);
  if (!listeners) return target;
  const filtered = listeners.filter((item) => item !== listener && item.listener !== listener);
  if (filtered.length) events.set(eventName, filtered);
  else events.delete(eventName);
  return target;
}

EventEmitter.EventEmitter = EventEmitter;
EventEmitter.once = once;
EventEmitter.on = on;
EventEmitter.listenerCount = (emitter, eventName) => emitter?.listenerCount?.(eventName) ?? 0;
EventEmitter.getEventListeners = getEventListeners;
EventEmitter.setMaxListeners = setMaxListeners;
EventEmitter.getMaxListeners = getMaxListeners;
EventEmitter.addAbortListener = addAbortListener;
Object.defineProperty(EventEmitter, "defaultMaxListeners", {
  configurable: true,
  enumerable: true,
  get: () => defaultMaxListeners,
  set: (value) => {
    defaultMaxListeners = Number(value);
  }
});

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

function getEventListeners(emitterOrTarget, eventName) {
  if (typeof emitterOrTarget?.listeners === "function") return emitterOrTarget.listeners(eventName);
  return [];
}

function setMaxListeners(count, ...targets) {
  defaultMaxListeners = Number(count);
  for (const target of targets) target?.setMaxListeners?.(count);
}

function getMaxListeners(target) {
  return target?.getMaxListeners?.() ?? defaultMaxListeners;
}

function addAbortListener(signal, listener) {
  if (!signal || typeof listener !== "function") throw new TypeError("signal and listener are required");
  if (signal.aborted) {
    queueMicrotask(() => listener());
    return { [Symbol.dispose]: () => {} };
  }
  signal.addEventListener?.("abort", listener, { once: true });
  return {
    [Symbol.dispose]: () => signal.removeEventListener?.("abort", listener),
    dispose: () => signal.removeEventListener?.("abort", listener)
  };
}

export default EventEmitter;
