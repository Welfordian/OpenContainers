export class EventEmitter {
  #events = new Map();

  on(eventName, listener) {
    return this.addListener(eventName, listener);
  }

  addListener(eventName, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    const listeners = this.#events.get(eventName) ?? [];
    listeners.push(listener);
    this.#events.set(eventName, listeners);
    return this;
  }

  once(eventName, listener) {
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      listener(...args);
    };
    wrapped.listener = listener;
    return this.on(eventName, wrapped);
  }

  off(eventName, listener) {
    return this.removeListener(eventName, listener);
  }

  removeListener(eventName, listener) {
    const listeners = this.#events.get(eventName);
    if (!listeners) return this;
    const filtered = listeners.filter((item) => item !== listener && item.listener !== listener);
    if (filtered.length) this.#events.set(eventName, filtered);
    else this.#events.delete(eventName);
    return this;
  }

  removeAllListeners(eventName) {
    if (eventName === undefined) this.#events.clear();
    else this.#events.delete(eventName);
    return this;
  }

  emit(eventName, ...args) {
    const listeners = [...(this.#events.get(eventName) ?? [])];
    if (!listeners.length && eventName === "error") {
      const error = args[0] instanceof Error ? args[0] : new Error(String(args[0] ?? "Unhandled error event"));
      throw error;
    }
    for (const listener of listeners) listener(...args);
    return listeners.length > 0;
  }

  listenerCount(eventName) {
    return (this.#events.get(eventName) ?? []).length;
  }

  listeners(eventName) {
    return [...(this.#events.get(eventName) ?? [])];
  }
}

export default {
  EventEmitter
};
