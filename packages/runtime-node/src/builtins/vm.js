const CONTEXT_SYMBOL = Symbol.for("opencontainers.vm.context");

export function createVmBuiltin({ globals = {} } = {}) {
  class Script {
    constructor(code, options = {}) {
      this.code = String(code);
      this.filename = normalizeFilename(options);
    }

    runInContext(context, options = {}) {
      validateContext(context);
      return runSourceInContext(this.code, context, {
        filename: normalizeFilename(options, this.filename),
        globals,
      });
    }

    runInNewContext(sandbox = {}, options = {}) {
      return runSourceInContext(this.code, createContext(sandbox), {
        filename: normalizeFilename(options, this.filename),
        globals,
      });
    }

    runInThisContext(options = {}) {
      return runSourceInContext(this.code, globals, {
        filename: normalizeFilename(options, this.filename),
        globals,
      });
    }
  }

  function createContext(sandbox = {}) {
    if (sandbox === null || (typeof sandbox !== "object" && typeof sandbox !== "function")) {
      throw new TypeError("The sandbox must be an object");
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, "global")) {
      Object.defineProperty(sandbox, "global", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sandbox,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, "globalThis")) {
      Object.defineProperty(sandbox, "globalThis", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sandbox,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, "self")) {
      Object.defineProperty(sandbox, "self", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sandbox,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, CONTEXT_SYMBOL)) {
      Object.defineProperty(sandbox, CONTEXT_SYMBOL, {
        configurable: true,
        enumerable: false,
        value: true,
      });
    }
    return sandbox;
  }

  function isContext(value) {
    return Boolean(value?.[CONTEXT_SYMBOL]);
  }

  function runInContext(code, context, options = {}) {
    return new Script(code, options).runInContext(context, options);
  }

  function runInNewContext(code, sandbox = {}, options = {}) {
    return new Script(code, options).runInNewContext(sandbox, options);
  }

  function runInThisContext(code, options = {}) {
    return new Script(code, options).runInThisContext(options);
  }

  function compileFunction(code, params = [], options = {}) {
    if (!Array.isArray(params)) {
      throw new TypeError("params must be an array");
    }
    const context = options.parsingContext ? validateContext(options.parsingContext) : globals;
    const wrapped = runSourceInContext(`(function (${params.join(",")}) {\n${String(code)}\n})`, context, {
      filename: normalizeFilename(options),
      globals,
    });
    return wrapped;
  }

  const builtin = {
    Script,
    createContext,
    isContext,
    runInContext,
    runInNewContext,
    runInThisContext,
    createScript: (code, options) => new Script(code, options),
    compileFunction,
  };
  builtin.default = builtin;
  return builtin;
}

function validateContext(context) {
  if (!context?.[CONTEXT_SYMBOL]) {
    throw new TypeError("The contextifiedObject argument must be a vm.Context");
  }
  return context;
}

function runSourceInContext(source, context, { filename = "vm.js", globals = {} } = {}) {
  const scope = createScope(context, globals);
  const sourceWithUrl = `${String(source)}\n//# sourceURL=opencontainers://${filename}`;
  const wrapped = new Function(
    "scope",
    `with (scope) {\nreturn eval(${JSON.stringify(sourceWithUrl)});\n}`
  );
  return wrapped(scope);
}

function createScope(context, globals) {
  return new Proxy(Object.create(null), {
    has(_target, key) {
      if (key === Symbol.unscopables) return false;
      if (key === "eval") return false;
      return true;
    },
    get(_target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key in context) return context[key];
      if (key in globals) return globals[key];
      return globalThis[key];
    },
    set(_target, key, value) {
      context[key] = value;
      return true;
    },
    getOwnPropertyDescriptor(_target, key) {
      if (key in context) return Object.getOwnPropertyDescriptor(context, key);
      if (key in globals) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: globals[key],
        };
      }
      return undefined;
    },
    ownKeys() {
      return [...new Set([...Reflect.ownKeys(globals), ...Reflect.ownKeys(context)])];
    },
  });
}

function normalizeFilename(options, fallback = "vm.js") {
  if (typeof options === "string") return options;
  return options?.filename ?? fallback;
}
