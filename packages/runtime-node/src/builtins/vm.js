import { RuntimeBuffer } from "./buffer.js";
import { transformEsmToCjs } from "../esm-transform.js";

const CONTEXT_SYMBOL = Symbol.for("opencontainers.vm.context");
const SCOPE_PASSTHROUGH_BINDINGS = new Set([
  "__opencontainersDynamicImport",
  "__opencontainersImportMetaResolve",
  "__opencontainersRequire",
  "exports",
]);
const CONTEXT_GLOBAL_BINDINGS = new Set([
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "Atomics",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DataView",
  "Date",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float32Array",
  "Float64Array",
  "Infinity",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Intl",
  "JSON",
  "Map",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Set",
  "SharedArrayBuffer",
  "String",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Uint8Array",
  "Uint8ClampedArray",
  "Uint16Array",
  "Uint32Array",
  "WeakMap",
  "WeakRef",
  "WeakSet",
  "WebAssembly",
  "console",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "unescape",
  "undefined",
]);

export function createVmBuiltin({ globals = {} } = {}) {
  const VM_MODULE_STATES = new WeakMap();

  class Script {
    constructor(code, options = {}) {
      const normalizedOptions = normalizeOptions(options);
      this.code = String(code);
      this.filename = normalizeFilename(normalizedOptions);

      if (normalizedOptions.cachedData !== undefined) {
        validateCachedData(normalizedOptions.cachedData, "options.cachedData");
        this.cachedDataRejected = false;
      }

      if (normalizedOptions.produceCachedData) {
        this.cachedDataProduced = true;
        this.cachedData = this.createCachedData();
      }
    }

    createCachedData() {
      return createSyntheticCachedData(this.code, this.filename);
    }

    runInContext(context, options = {}) {
      validateContext(context);
      return runSourceInContext(this.code, context, {
        filename: normalizeFilename(options, this.filename),
        globals: createContextGlobals(globals),
      });
    }

    runInNewContext(sandbox = {}, options = {}) {
      return runSourceInContext(this.code, createContext(sandbox), {
        filename: normalizeFilename(options, this.filename),
        globals: createContextGlobals(globals),
      });
    }

    runInThisContext(options = {}) {
      return runSourceInContext(this.code, globals, {
        filename: normalizeFilename(options, this.filename),
        globals,
      });
    }
  }

  class Module {
    constructor(options) {
      const { context = createContext({}), identifier = "vm:module" } = options ?? {};
      VM_MODULE_STATES.set(this, {
        type: "module",
        context: isContext(context) ? context : createContext(context),
        identifier: String(identifier),
        status: "unlinked",
        error: undefined,
        namespace: undefined,
        dependencySpecifiers: []
      });
    }

    get identifier() {
      return getVmModuleState(this).identifier;
    }

    get context() {
      return getVmModuleState(this).context;
    }

    get namespace() {
      const state = getVmModuleState(this);
      if (state.namespace === undefined && (state.status === "unlinked" || state.status === "linking")) {
        throw createVmModuleStatusError("must not be unlinked or linking");
      }
      return state.namespace;
    }

    get status() {
      return getVmModuleState(this).status;
    }

    get error() {
      const state = getVmModuleState(this);
      if (state.status !== "errored") throw createVmModuleStatusError("must be errored");
      return state.error;
    }

    async link(linker) {
      const state = getVmModuleState(this);
      if (state.type === "source") return linkSourceTextModule(this, linker);
      if (state.type === "synthetic") return linkSyntheticModule(this, linker);
      state.status = "linked";
      return undefined;
    }

    async evaluate() {
      const state = getVmModuleState(this);
      if (state.type === "source") return evaluateSourceTextModule(this);
      if (state.type === "synthetic") return evaluateSyntheticModule(this);
      state.status = "evaluated";
      return { status: "evaluated" };
    }
  }

  class SyntheticModule extends Module {
    constructor(exportNames, evaluateCallback, options = {}) {
      if (!Array.isArray(exportNames) || !exportNames.every((name) => typeof name === "string")) {
        throw Object.assign(new TypeError("The \"exportNames\" argument must be an array of strings"), {
          code: "ERR_INVALID_ARG_TYPE"
        });
      }
      if (typeof evaluateCallback !== "function") {
        throw Object.assign(new TypeError("The \"evaluateCallback\" argument must be of type function"), {
          code: "ERR_INVALID_ARG_TYPE"
        });
      }
      super({
        context: options.context ?? createContext({}),
        identifier: options.identifier ?? "vm:synthetic-module"
      });
      const state = getVmModuleState(this);
      state.type = "synthetic";
      state.status = "linked";
      state.evaluateCallback = evaluateCallback;
      state.exportNames = [...new Set(exportNames)];
      state.exports = Object.create(null);
      for (const name of state.exportNames) state.exports[name] = undefined;
      state.namespace = createModuleNamespace(state.exports);
    }

    async link(linker = undefined) {
      return linkSyntheticModule(this, linker);
    }

    setExport(name, value) {
      const state = getVmModuleState(this, "synthetic");
      if (!state.exportNames.includes(name)) {
        throw Object.assign(new Error(`Export ${JSON.stringify(name)} is not defined in module`), {
          code: "ERR_VM_MODULE_NOT_MODULE"
        });
      }
      state.exports[name] = value;
    }
  }

  class SourceTextModule extends Module {
    constructor(code, options = {}) {
      super({
        context: options.context ?? createContext({}),
        identifier: options.identifier ?? options.filename ?? "vm:source-text-module"
      });
      const state = getVmModuleState(this);
      state.type = "source";
      state.dependencies = new Map();
      state.source = String(code);
      state.initializeImportMeta = typeof options.initializeImportMeta === "function"
        ? options.initializeImportMeta
        : undefined;
      state.importModuleDynamically = typeof options.importModuleDynamically === "function"
        ? options.importModuleDynamically
        : undefined;
      state.dependencySpecifiers = extractModuleSpecifiers(state.source);
      state.moduleRequests = state.dependencySpecifiers.map((specifier) => createModuleRequest(specifier));
    }

    linkRequests(modules) {
      const state = getVmModuleState(this, "source");
      if (!Array.isArray(modules) || modules.length !== state.moduleRequests.length) {
        throw Object.assign(new Error(`Expected ${state.moduleRequests.length} modules, got ${Array.isArray(modules) ? modules.length : 0}`), {
          code: "ERR_MODULE_LINK_MISMATCH"
        });
      }
      state.dependencies.clear();
      for (const [index, request] of state.moduleRequests.entries()) {
        const dependency = modules[index];
        validateLinkedModule(dependency, request.specifier);
        state.dependencies.set(request.specifier, dependency);
      }
    }

    instantiate() {
      const state = getVmModuleState(this, "source");
      if (state.status === "unlinked") state.status = "linked";
    }

    get dependencySpecifiers() {
      return [...getVmModuleState(this, "source").dependencySpecifiers];
    }

    get moduleRequests() {
      return getVmModuleState(this, "source").moduleRequests.map(cloneModuleRequest);
    }

    get status() {
      return getVmModuleState(this, "source").status;
    }

    get error() {
      const state = getVmModuleState(this, "source");
      if (state.status !== "errored") throw createVmModuleStatusError("must be errored");
      return state.error;
    }

    hasAsyncGraph() {
      const state = getVmModuleState(this, "source");
      if (state.status === "unlinked" || state.status === "linking") {
        throw createVmModuleStatusError("must be instantiated");
      }
      return false;
    }

    hasTopLevelAwait() {
      return /\bawait\b/.test(getVmModuleState(this, "source").source);
    }

    createCachedData() {
      const state = getVmModuleState(this, "source");
      return createSyntheticCachedData(state.source, state.identifier);
    }
  }

  function getVmModuleState(module, type = undefined) {
    const state = VM_MODULE_STATES.get(module);
    if (!state || (type !== undefined && state.type !== type)) {
      throw Object.assign(new Error("Invalid vm.Module object"), {
        code: "ERR_VM_MODULE_NOT_MODULE"
      });
    }
    return state;
  }

  function createModuleRequest(specifier) {
    return {
      specifier,
      attributes: {},
      phase: "evaluation"
    };
  }

  function cloneModuleRequest(request) {
    return {
      specifier: request.specifier,
      attributes: { ...request.attributes },
      phase: request.phase
    };
  }

  function createVmModuleStatusError(message) {
    return Object.assign(new Error(`Module status ${message}`), {
      code: "ERR_VM_MODULE_STATUS"
    });
  }

  async function linkSyntheticModule(module, linker = undefined) {
    if (linker !== undefined && typeof linker !== "function") {
      throw Object.assign(new TypeError("The \"linker\" argument must be of type function"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    const state = getVmModuleState(module, "synthetic");
    if (state.status === "unlinked") state.status = "linked";
    return undefined;
  }

  async function evaluateSyntheticModule(module) {
    const state = getVmModuleState(module, "synthetic");
    if (state.status === "unlinked") await linkSyntheticModule(module);
    if (state.status === "evaluated") return { status: "evaluated" };
    state.status = "evaluating";
    try {
      await state.evaluateCallback.call(module);
      state.status = "evaluated";
      return { status: "evaluated" };
    } catch (error) {
      state.status = "errored";
      state.error = error;
      throw error;
    }
  }

  async function linkSourceTextModule(module, linker) {
    const state = getVmModuleState(module, "source");
    if (state.status !== "unlinked") return undefined;
    if (typeof linker !== "function") {
      throw Object.assign(new TypeError("The \"linker\" argument must be of type function"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }

    state.status = "linking";
    try {
      for (const specifier of state.dependencySpecifiers) {
        const dependency = await linker(specifier, module);
        validateLinkedModule(dependency, specifier);
        if (dependency.status === "unlinked" && typeof dependency.link === "function") {
          await dependency.link(linker);
        }
        state.dependencies.set(specifier, dependency);
      }
      state.status = "linked";
      return undefined;
    } catch (error) {
      state.status = "errored";
      state.error = error;
      throw error;
    }
  }

  async function evaluateSourceTextModule(module) {
    const state = getVmModuleState(module, "source");
    if (state.status === "unlinked") throw createVmModuleStatusError("must not be unlinked before evaluate()");
    if (state.status === "evaluated") return { status: "evaluated" };

    state.status = "evaluating";
    try {
      for (const dependency of state.dependencies.values()) {
        if (dependency.status !== "evaluated" && typeof dependency.evaluate === "function") {
          await dependency.evaluate();
        }
      }

      const exports = Object.create(null);
      const transformed = transformEsmToCjs(state.source, { filename: state.identifier });
      const importMeta = {
        url: `opencontainers://${state.identifier}`,
        filename: state.identifier,
        dirname: dirname(state.identifier),
        resolve: (specifier) => String(specifier),
      };
      state.initializeImportMeta?.(importMeta, module);

      const scope = createScope(state.context, {
        ...globals,
        import: undefined,
        importMeta,
      });
      const execute = new Function(
        "scope",
        "exports",
        "__opencontainersRequire",
        "__opencontainersDynamicImport",
        "__opencontainersImportMetaResolve",
        `with (scope) {\nreturn (async () => {\n${transformed}\n})();\n}`
      );
      await execute(
        scope,
        exports,
        (specifier) => requireLinkedModule(module, specifier),
        (specifier) => dynamicImportForModule(module, specifier),
        (specifier) => importMeta.resolve(specifier)
      );
      state.namespace = createModuleNamespace(exports);
      state.status = "evaluated";
      return { status: "evaluated" };
    } catch (error) {
      state.status = "errored";
      state.error = error;
      throw error;
    }
  }

  function requireLinkedModule(module, specifier) {
    const state = getVmModuleState(module, "source");
    const dependency = state.dependencies.get(String(specifier));
    if (!dependency) {
      throw Object.assign(new Error(`Cannot find linked module ${specifier}`), {
        code: "ERR_VM_MODULE_LINK_FAILURE"
      });
    }
    return dependency.namespace;
  }

  async function dynamicImportForModule(module, specifier) {
    const state = getVmModuleState(module, "source");
    if (typeof state.importModuleDynamically !== "function") {
      throw Object.assign(new Error(`Dynamic import is not configured for ${specifier}`), {
        code: "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING"
      });
    }
    const dependency = await state.importModuleDynamically(specifier, module);
    validateLinkedModule(dependency, specifier);
    if (dependency.status !== "evaluated" && typeof dependency.evaluate === "function") {
      await dependency.evaluate();
    }
    return dependency.namespace;
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

  function runInContext(code, context, options) {
    return new Script(code, options).runInContext(context, options);
  }

  function runInNewContext(code, sandbox, options) {
    return new Script(code, options).runInNewContext(sandbox, options);
  }

  function runInThisContext(code, options) {
    return new Script(code, options).runInThisContext(options);
  }

  function compileFunction(code, params, options = {}) {
    params ??= [];
    if (!Array.isArray(params)) {
      throw new TypeError("params must be an array");
    }
    const normalizedOptions = normalizeOptions(options);
    if (normalizedOptions.cachedData !== undefined) {
      validateCachedData(normalizedOptions.cachedData, "options.cachedData");
    }

    const context = normalizedOptions.parsingContext ? validateContext(normalizedOptions.parsingContext) : globals;
    const scopeGlobals = normalizedOptions.parsingContext ? createContextGlobals(globals) : globals;
    const wrapped = runSourceInContext(`(function (${params.join(",")}) {\n${String(code)}\n})`, context, {
      filename: normalizeFilename(normalizedOptions),
      globals: scopeGlobals,
    });
    if (normalizedOptions.cachedData !== undefined) {
      wrapped.cachedDataRejected = false;
    }
    if (normalizedOptions.produceCachedData) {
      wrapped.cachedData = createSyntheticCachedData(code, normalizeFilename(normalizedOptions));
    }
    return wrapped;
  }

  function measureMemory() {
    const browserMemory = globalThis.performance?.memory;
    const used = Number(browserMemory?.usedJSHeapSize ?? 0);
    const limit = Number(browserMemory?.jsHeapSizeLimit ?? browserMemory?.totalJSHeapSize ?? used);
    return Promise.resolve({
      total: {
        jsMemoryEstimate: used,
        jsMemoryRange: [used, Math.max(used, limit)]
      },
      WebAssembly: {
        code: 0,
        metadata: 0
      }
    });
  }

  function createScript(code, options) {
    return new Script(code, options);
  }

  const builtin = {
    Script,
    createContext,
    createScript,
    runInContext,
    runInNewContext,
    runInThisContext,
    isContext,
    compileFunction,
    measureMemory,
    constants: Object.freeze({
      USE_MAIN_CONTEXT_DEFAULT_LOADER: Symbol.for("vm_dynamic_import_main_context_default"),
      DONT_CONTEXTIFY: Symbol.for("vm_context_no_contextify")
    }),
    Module,
    SourceTextModule,
    SyntheticModule,
  };
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
  return wrapped.call(context, scope);
}

function createScope(context, globals) {
  return new Proxy(Object.create(null), {
    has(_target, key) {
      if (key === Symbol.unscopables) return false;
      if (key === "eval") return false;
      if (SCOPE_PASSTHROUGH_BINDINGS.has(key)) return false;
      return true;
    },
    get(_target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key in context) return context[key];
      if (key in globals) return globals[key];
      if (key === "Function") return createContextFunction(context, globals);
      return getContextGlobal(key);
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

function createContextGlobals(globals = {}) {
  const contextGlobals = Object.create(null);
  if ("console" in globals) contextGlobals.console = globals.console;
  return contextGlobals;
}

function getContextGlobal(key) {
  if (!CONTEXT_GLOBAL_BINDINGS.has(key)) return undefined;
  return globalThis[key];
}

function createContextFunction(context, globals) {
  return function Function(...args) {
    const body = args.length === 0 ? "" : String(args.pop());
    const params = args.map(String).join(",");
    const fn = runSourceInContext(`(function anonymous(${params}) {\n${body}\n})`, context, {
      filename: "vm-function.js",
      globals,
    });
    return function contextFunction(...callArgs) {
      const thisArg = this === globalThis || this === undefined ? context : this;
      return fn.apply(thisArg, callArgs);
    };
  };
}

function dirname(input) {
  const value = String(input);
  const index = value.lastIndexOf("/");
  return index <= 0 ? "/" : value.slice(0, index);
}

function normalizeFilename(options, fallback = "vm.js") {
  if (typeof options === "string") return options;
  return options?.filename ?? fallback;
}

function normalizeOptions(options) {
  if (options === undefined || options === null) return {};
  if (typeof options === "string") return { filename: options };
  if (typeof options !== "object") {
    throw Object.assign(new TypeError("The \"options\" argument must be of type object"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return options;
}

function validateCachedData(value, propertyName) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return;
  throw Object.assign(new TypeError(`The "${propertyName}" property must be an instance of Buffer, TypedArray, or DataView.`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createSyntheticCachedData(source, filename) {
  const payload = JSON.stringify({
    version: 1,
    filename,
    length: String(source).length
  });
  return RuntimeBuffer.from(`opencontainers-vm-cache\0${payload}`);
}

function createModuleNamespace(exports) {
  const namespace = Object.create(null);
  for (const key of Reflect.ownKeys(exports)) {
    if (key === "__esModule") continue;
    Object.defineProperty(namespace, key, {
      enumerable: true,
      configurable: false,
      get: () => exports[key],
    });
  }
  Object.defineProperty(namespace, Symbol.toStringTag, {
    configurable: false,
    value: "Module",
  });
  return Object.freeze(namespace);
}

function extractModuleSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /^\s*import\s+["']([^"']+)["']/gm,
    /^\s*import\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/gm,
    /^\s*export\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/gm,
  ];
  for (const pattern of patterns) {
    for (const match of String(source).matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function validateLinkedModule(module, specifier) {
  if (!module || typeof module !== "object" || typeof module.evaluate !== "function") {
    throw Object.assign(new TypeError(`Linker for ${specifier} must return a vm.Module`), {
      code: "ERR_VM_MODULE_NOT_MODULE"
    });
  }
}
