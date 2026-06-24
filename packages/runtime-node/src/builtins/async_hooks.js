let nextAsyncId = 1;

const rootAsyncResource = Object.freeze({
  type: "ROOT",
  asyncId: () => 0,
  triggerAsyncId: () => 0
});

const asyncWrapProviders = Object.freeze(Object.assign(Object.create(null), {
  NONE: 0,
  DIRHANDLE: 1,
  DNSCHANNEL: 2,
  ELDHISTOGRAM: 3,
  FILEHANDLE: 4,
  FILEHANDLECLOSEREQ: 5,
  BLOBREADER: 6,
  FSEVENTWRAP: 7,
  FSREQCALLBACK: 8,
  FSREQPROMISE: 9,
  GETADDRINFOREQWRAP: 10,
  GETNAMEINFOREQWRAP: 11,
  HEAPSNAPSHOT: 12,
  HTTP2SESSION: 13,
  HTTP2STREAM: 14,
  HTTP2PING: 15,
  HTTP2SETTINGS: 16,
  HTTPINCOMINGMESSAGE: 17,
  HTTPCLIENTREQUEST: 18,
  LOCKS: 19,
  JSSTREAM: 20,
  JSUDPWRAP: 21,
  MESSAGEPORT: 22,
  PIPECONNECTWRAP: 23,
  PIPESERVERWRAP: 24,
  PIPEWRAP: 25,
  PROCESSWRAP: 26,
  PROMISE: 27,
  QUERYWRAP: 28,
  QUIC_ENDPOINT: 29,
  QUIC_LOGSTREAM: 30,
  QUIC_SESSION: 31,
  QUIC_STREAM: 32,
  QUIC_UDP: 33,
  SHUTDOWNWRAP: 34,
  SIGNALWRAP: 35,
  STATWATCHER: 36,
  STREAMPIPE: 37,
  TCPCONNECTWRAP: 38,
  TCPSERVERWRAP: 39,
  TCPWRAP: 40,
  TTYWRAP: 41,
  UDPSENDWRAP: 42,
  UDPWRAP: 43,
  SIGINTWATCHDOG: 44,
  WORKER: 45,
  WORKERCPUPROFILE: 46,
  WORKERCPUUSAGE: 47,
  WORKERHEAPPROFILE: 48,
  WORKERHEAPSNAPSHOT: 49,
  WORKERHEAPSTATISTICS: 50,
  WRITEWRAP: 51,
  ZLIB: 52,
  CHECKPRIMEREQUEST: 53,
  PBKDF2REQUEST: 54,
  KEYPAIRGENREQUEST: 55,
  KEYGENREQUEST: 56,
  KEYEXPORTREQUEST: 57,
  ARGON2REQUEST: 58,
  CIPHERREQUEST: 59,
  DERIVEBITSREQUEST: 60,
  HASHREQUEST: 61,
  RANDOMBYTESREQUEST: 62,
  RANDOMPRIMEREQUEST: 63,
  SCRYPTREQUEST: 64,
  SIGNREQUEST: 65,
  TLSWRAP: 66,
  VERIFYREQUEST: 67
}));

export function createAsyncContextManager() {
  let currentContext = new Map();
  let currentResource = rootAsyncResource;
  let currentAsyncId = 0;
  let currentTriggerAsyncId = 0;

  const manager = {
    snapshot() {
      return currentContext;
    },

    executionAsyncId() {
      return currentAsyncId;
    },

    executionAsyncResource() {
      return currentResource;
    },

    triggerAsyncId() {
      return currentTriggerAsyncId;
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

    withScope(storage, store) {
      const previousContext = currentContext;
      const context = new Map(currentContext);
      context.set(storage, store);
      currentContext = context;
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        if (currentContext === context) currentContext = previousContext;
      };
    },

    bind(callback, thisArg = undefined) {
      if (typeof callback !== "function") {
        throw createInvalidArgTypeError("fn", "function", callback);
      }
      const context = currentContext;
      const bound = function boundAsyncCallback(...args) {
        const receiver = thisArg === undefined ? this : thisArg;
        return manager.runWithContext(context, () => callback.apply(receiver, args));
      };
      Object.defineProperty(bound, "name", { configurable: true, value: "bound" });
      return bound;
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

    runWithResource(resource, context, callback, args = []) {
      if (typeof callback !== "function") {
        throw new TypeError("callback must be a function");
      }
      const previousContext = currentContext;
      const previousResource = currentResource;
      const previousAsyncId = currentAsyncId;
      const previousTriggerAsyncId = currentTriggerAsyncId;
      currentContext = context;
      currentResource = resource;
      currentAsyncId = resource.asyncId();
      currentTriggerAsyncId = resource.triggerAsyncId();
      let result;
      try {
        result = callback(...args);
      } catch (error) {
        currentContext = previousContext;
        currentResource = previousResource;
        currentAsyncId = previousAsyncId;
        currentTriggerAsyncId = previousTriggerAsyncId;
        throw error;
      }
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).finally(() => {
          if (currentContext === context) currentContext = previousContext;
          if (currentResource === resource) currentResource = previousResource;
          if (currentAsyncId === resource.asyncId()) currentAsyncId = previousAsyncId;
          if (currentTriggerAsyncId === resource.triggerAsyncId()) currentTriggerAsyncId = previousTriggerAsyncId;
        });
      }
      currentContext = previousContext;
      currentResource = previousResource;
      currentAsyncId = previousAsyncId;
      currentTriggerAsyncId = previousTriggerAsyncId;
      return result;
    },
  };

  return manager;
}

export function createAsyncHooksBuiltin({ asyncContextManager }) {
  const hooks = new Set();
  const hookCallbacks = new WeakMap();
  const asyncLocalStorageNames = new WeakMap();
  const asyncLocalStorageDefaultValues = new WeakMap();

  function emitHook(kind, ...args) {
    for (const hook of [...hooks]) {
      const callback = hookCallbacks.get(hook)?.[kind];
      if (typeof callback === "function") callback(...args);
    }
  }

  class AsyncLocalStorage {
    constructor(options = {}) {
      if (options === null || typeof options !== "object") {
        throw Object.assign(
          new TypeError(`The "options" argument must be of type object. Received ${options === null ? "null" : `type ${typeof options}`}`),
          { code: "ERR_INVALID_ARG_TYPE" }
        );
      }
      asyncLocalStorageNames.set(this, options.name === undefined ? "" : String(options.name));
      asyncLocalStorageDefaultValues.set(this, options.defaultValue);
    }

    get name() {
      return asyncLocalStorageNames.get(this) ?? "";
    }

    disable() {
      asyncContextManager.disable(this);
    }

    enterWith(store) {
      asyncContextManager.enterWith(this, store);
    }

    run(store, callback, ...args) {
      return asyncContextManager.run(this, store, callback, args);
    }

    exit(callback, ...args) {
      return asyncContextManager.exit(this, callback, args);
    }

    getStore() {
      const store = asyncContextManager.getStore(this);
      return store === undefined ? asyncLocalStorageDefaultValues.get(this) : store;
    }

    withScope(store) {
      return new RunScope(asyncContextManager.withScope(this, store));
    }

    static bind(callback) {
      return asyncContextManager.bind(callback);
    }

    static snapshot() {
      const context = asyncContextManager.snapshot();
      return (callback, ...args) => asyncContextManager.runWithContext(context, callback, args);
    }
  }

  class RunScope {
    #dispose;

    constructor(dispose, resource) {
      this.#dispose = dispose;
    }

    dispose() {
      this.#dispose();
    }

    [Symbol.dispose]() {
      this.dispose();
    }
  }

  class AsyncResource {
    constructor(type, options = {}) {
      if (typeof type !== "string") {
        throw createInvalidArgTypeError("type", "string", type);
      }
      this.type = type;
      this.context = asyncContextManager.snapshot();
      this.id = nextAsyncId++;
      this.triggerId = normalizeTriggerAsyncId(options, asyncContextManager.executionAsyncId());
      this.destroyed = false;
      emitHook("init", this.id, this.type, this.triggerId, this);
    }

    runInAsyncScope(callback, thisArg, ...args) {
      emitHook("before", this.id);
      try {
        return asyncContextManager.runWithResource(this, this.context, () => callback.apply(thisArg, args));
      } finally {
        emitHook("after", this.id);
      }
    }

    emitDestroy() {
      if (!this.destroyed) {
        this.destroyed = true;
        emitHook("destroy", this.id);
      }
      return this;
    }

    asyncId() {
      return this.id;
    }

    triggerAsyncId() {
      return this.triggerId;
    }

    bind(callback, thisArg) {
      if (typeof callback !== "function") {
        throw createInvalidArgTypeError("fn", "function", callback);
      }
      const resource = this;
      const bound = function boundAsyncResourceCallback(...args) {
        const receiver = thisArg === undefined ? this : thisArg;
        return resource.runInAsyncScope(callback, receiver, ...args);
      };
      Object.defineProperty(bound, "name", { configurable: true, value: "bound" });
      bound.asyncResource = this;
      return bound;
    }

    static bind(callback, type, thisArg) {
      return new AsyncResource(type ?? "bound-anonymous-fn").bind(callback, thisArg);
    }
  }

  class AsyncHook {
    constructor(callbacks) {
      hookCallbacks.set(this, callbacks);
    }

    enable() {
      hooks.add(this);
      return this;
    }

    disable() {
      hooks.delete(this);
      return this;
    }
  }

  function createHook({ init, before, after, destroy, promiseResolve }) {
    const callbackBag = { init, before, after, destroy, promiseResolve };
    for (const [name, callback] of Object.entries(callbackBag)) {
      if (callback !== undefined && typeof callback !== "function") {
        throw Object.assign(new TypeError(`hook.${name} must be a function`), {
          code: "ERR_ASYNC_CALLBACK"
        });
      }
    }
    return new AsyncHook(callbackBag);
  }

  function executionAsyncId() {
    return asyncContextManager.executionAsyncId();
  }

  function triggerAsyncId() {
    return asyncContextManager.triggerAsyncId();
  }

  function executionAsyncResource() {
    return asyncContextManager.executionAsyncResource();
  }

  const asyncLocalStorageAccessor = {
    get AsyncLocalStorage() {
      return AsyncLocalStorage;
    }
  };
  const builtin = {};
  Object.defineProperty(builtin, "AsyncLocalStorage", {
    configurable: true,
    enumerable: true,
    get: Object.getOwnPropertyDescriptor(asyncLocalStorageAccessor, "AsyncLocalStorage").get
  });
  Object.assign(builtin, {
    createHook,
    executionAsyncId,
    triggerAsyncId,
    executionAsyncResource,
    asyncWrapProviders,
    AsyncResource
  });
  return builtin;
}

function normalizeTriggerAsyncId(options, fallback) {
  if (typeof options === "number") return validateTriggerAsyncId(options);
  if (options === null) {
    throw new TypeError("Cannot read properties of null (reading 'triggerAsyncId')");
  }
  if (options && typeof options === "object" && "triggerAsyncId" in options) {
    const triggerAsyncId = options.triggerAsyncId;
    if (triggerAsyncId === undefined) return Number(fallback) || 0;
    return validateTriggerAsyncId(triggerAsyncId);
  }
  return Number(fallback) || 0;
}

function validateTriggerAsyncId(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw Object.assign(new RangeError(`Invalid triggerAsyncId value: ${String(value)}`), {
      code: "ERR_INVALID_ASYNC_ID"
    });
  }
  return value;
}

function createInvalidArgTypeError(name, expected, value) {
  return Object.assign(
    new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeReceived(value)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function describeReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") return `type number (${value})`;
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "boolean") return `type boolean (${value})`;
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  if (typeof value === "function") return `function ${value.name || ""}`.trim();
  if (Array.isArray(value)) return "an instance of Array";
  if (typeof value === "object" && value.constructor && value.constructor !== Object) {
    return `an instance of ${value.constructor.name}`;
  }
  return `type ${typeof value}`;
}
