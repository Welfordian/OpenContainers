let nextAsyncId = 1;

export function createAsyncContextManager() {
  let currentContext = new Map();

  const manager = {
    snapshot() {
      return currentContext;
    },

    getStore(storage) {
      return currentContext.get(storage);
    },

    enterWith(storage, store) {
      const context = new Map(currentContext);
      context.set(storage, store);
      currentContext = context;
    },

    disable(storage) {
      if (!currentContext.has(storage)) return;
      const context = new Map(currentContext);
      context.delete(storage);
      currentContext = context;
    },

    run(storage, store, callback, args = []) {
      const context = new Map(currentContext);
      context.set(storage, store);
      return manager.runWithContext(context, callback, args);
    },

    exit(storage, callback, args = []) {
      const context = new Map(currentContext);
      context.delete(storage);
      return manager.runWithContext(context, callback, args);
    },

    bind(callback, thisArg = undefined) {
      if (typeof callback !== "function") {
        throw new TypeError("callback must be a function");
      }
      const context = currentContext;
      return (...args) => manager.runWithContext(context, () => callback.apply(thisArg, args));
    },

    runWithContext(context, callback, args = []) {
      if (typeof callback !== "function") {
        throw new TypeError("callback must be a function");
      }
      const previousContext = currentContext;
      currentContext = context;
      let result;
      try {
        result = callback(...args);
      } catch (error) {
        currentContext = previousContext;
        throw error;
      }
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).finally(() => {
          if (currentContext === context) currentContext = previousContext;
        });
      }
      currentContext = previousContext;
      return result;
    },
  };

  return manager;
}

export function createAsyncHooksBuiltin({ asyncContextManager }) {
  class AsyncLocalStorage {
    disable() {
      asyncContextManager.disable(this);
    }

    enterWith(store) {
      asyncContextManager.enterWith(this, store);
    }

    getStore() {
      return asyncContextManager.getStore(this);
    }

    run(store, callback, ...args) {
      return asyncContextManager.run(this, store, callback, args);
    }

    exit(callback, ...args) {
      return asyncContextManager.exit(this, callback, args);
    }

    static bind(callback) {
      return asyncContextManager.bind(callback);
    }

    static snapshot() {
      const context = asyncContextManager.snapshot();
      return (callback, ...args) => asyncContextManager.runWithContext(context, callback, args);
    }
  }

  class AsyncResource {
    constructor(type = "AsyncResource") {
      this.type = String(type);
      this.context = asyncContextManager.snapshot();
      this.id = nextAsyncId++;
      this.triggerId = 0;
    }

    asyncId() {
      return this.id;
    }

    triggerAsyncId() {
      return this.triggerId;
    }

    runInAsyncScope(callback, thisArg, ...args) {
      return asyncContextManager.runWithContext(this.context, () => callback.apply(thisArg, args));
    }

    bind(callback, thisArg) {
      return (...args) => this.runInAsyncScope(callback, thisArg, ...args);
    }

    emitDestroy() {
      return this;
    }
  }

  const builtin = {
    AsyncLocalStorage,
    AsyncResource,
    createHook: () => ({
      enable() {
        return this;
      },
      disable() {
        return this;
      },
    }),
    executionAsyncId: () => 0,
    executionAsyncResource: () => ({}),
    triggerAsyncId: () => 0,
  };
  builtin.default = builtin;
  return builtin;
}
