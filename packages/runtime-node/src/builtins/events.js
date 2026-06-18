const EVENTS_SYMBOL = Symbol.for("opencontainers.events");

export class EventEmitter {
  constructor() {
    eventMap(this);
  }

  setMaxListeners(count) {
    this._maxListeners = Number(count);
    return this;
  }

  getMaxListeners() {
    return this._maxListeners ?? 10;
  }

  on(eventName, listener) {
    return this.addListener(eventName, listener);
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
    return this.removeListener(eventName, listener);
  }

  removeListener(eventName, listener) {
    const events = eventMap(this);
    const listeners = events.get(eventName);
    if (!listeners) return this;
    const filtered = listeners.filter((item) => item !== listener && item.listener !== listener);
    if (filtered.length) events.set(eventName, filtered);
    else events.delete(eventName);
    return this;
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

EventEmitter.EventEmitter = EventEmitter;

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

export default EventEmitter;
