import { basename, dirname, joinPath, normalizePath, resolvePath } from "../../fs/src/path-utils.js";
import { createFsBuiltin } from "./builtins/fs.js";
import pathBuiltin from "./builtins/path.js";
import eventsBuiltin from "./builtins/events.js";
import streamBuiltin, { promises as streamPromisesBuiltin } from "./builtins/stream.js";
import stringDecoderBuiltin from "./builtins/string_decoder.js";
import ttyBuiltin from "./builtins/tty.js";
import readlineBuiltin from "./builtins/readline.js";
import { createProcessBuiltin } from "./builtins/process.js";
import { createBrowserExternalFetchOptions, createHttpBuiltin, createHttpsBuiltin, isExternalNetworkAllowed } from "./builtins/http.js";
import { createNetBuiltin } from "./builtins/net.js";
import { createDnsBuiltin } from "./builtins/dns.js";
import { createChildProcessBuiltin } from "./builtins/child_process.js";
import { createCryptoBuiltin as createNodeCryptoBuiltin, KEY_OBJECT_BRAND } from "./builtins/crypto.js";
import { createVmBuiltin } from "./builtins/vm.js";
import { createZlibBuiltin } from "./builtins/zlib.js";
import { createAsyncContextManager, createAsyncHooksBuiltin } from "./builtins/async_hooks.js";
import bufferBuiltin, { RuntimeBuffer } from "./builtins/buffer.js";
import { createTimerApi } from "./builtins/timers.js";
import { createWorkerThreadsBuiltin } from "./builtins/worker_threads.js";
import { looksLikeEsm, transformEsmToCjs } from "./esm-transform.js";

const textDecoder = new TextDecoder();

const CORE_MODULES = Object.freeze([
  "assert",
  "assert/strict",
  "fs",
  "fs/promises",
  "path",
  "path/posix",
  "path/win32",
  "process",
  "console",
  "cluster",
  "dgram",
  "domain",
  "events",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "buffer",
  "child_process",
  "constants",
  "http",
  "https",
  "http2",
  "inspector",
  "net",
  "dns",
  "dns/promises",
  "module",
  "os",
  "url",
  "util",
  "util/types",
  "perf_hooks",
  "punycode",
  "querystring",
  "repl",
  "crypto",
  "diagnostics_channel",
  "v8",
  "vm",
  "zlib",
  "zlib/promises",
  "async_hooks",
  "tty",
  "readline",
  "readline/promises",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "wasi",
  "worker_threads"
]);

const MODULE_EXTENSIONS = Object.freeze({
  ".js": () => {},
  ".json": () => {},
  ".node": () => {
    throw Object.assign(new Error("Native addons are not supported in OpenContainers"), {
      code: "ERR_OPENCONTAINERS_NATIVE_ADDON_UNSUPPORTED"
    });
  }
});

export class ModuleResolutionError extends Error {
  constructor(specifier, fromPath) {
    super(`Cannot find module '${specifier}' from '${fromPath}'`);
    this.code = "MODULE_NOT_FOUND";
    this.specifier = specifier;
    this.fromPath = fromPath;
  }
}

export class ModuleLoader {
  constructor({ kernel, descriptor, console }) {
    this.kernel = kernel;
    this.descriptor = descriptor;
    this.console = console;
    this.cache = new Map();
    this.coreModules = new Map();
    this.runtimeGlobalObject = null;
    this.asyncContextManager = createAsyncContextManager();
  }

  createRequire(parentFilename = `${this.descriptor.cwd}/[repl].js`) {
    const require = (specifier) => this.require(specifier, parentFilename);
    require.resolve = (specifier) => this.resolve(specifier, parentFilename);
    require.resolve.paths = (specifier) => {
      const normalized = String(specifier).replace(/^node:/, "");
      if (this.isCoreModule(normalized)) return null;
      return this.nodeModulePaths(dirname(parentFilename || `${this.descriptor.cwd}/[repl].js`));
    };
    require.cache = this.cache;
    require.extensions = MODULE_EXTENSIONS;
    require.main = null;
    return require;
  }

  require(specifier, parentFilename) {
    const core = this.loadCoreModule(specifier);
    if (core) return core;

    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename);
    if (this.cache.has(resolved)) return this.cache.get(resolved).exports;

    if (resolved.endsWith(".json")) {
      const module = { id: resolved, filename: resolved, exports: {} };
      this.cache.set(resolved, module);
      module.exports = JSON.parse(this.kernel.fs.readFileSync(resolved, "utf8"));
      return module.exports;
    }

    const source = this.readModuleSource(resolved);
    const executableSource = stripHashbang(this.shouldTransformEsm(resolved, source)
      ? transformEsmToCjs(source, { filename: resolved })
      : source);
    const module = { id: resolved, filename: resolved, exports: {} };
    this.cache.set(resolved, module);
    const localRequire = this.createRequire(resolved);
    const wrapped = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "console",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "__opencontainersGlobals",
      "__opencontainersRequire",
      "fetch",
      "__opencontainersDynamicImport",
      `with (__opencontainersGlobals) {\n${executableSource}\n}\n//# sourceURL=opencontainers://${resolved}`
    );
    wrapped(
      module.exports,
      localRequire,
      module,
      resolved,
      dirname(resolved),
      this.process,
      this.console,
      this.timers.setTimeout,
      this.timers.clearTimeout,
      this.timers.setInterval,
      this.timers.clearInterval,
      this.timers.setImmediate,
      this.timers.clearImmediate,
      this.runtimeGlobals,
      localRequire,
      this.fetch,
      (specifier) => this.dynamicImport(specifier, resolved)
    );
    return module.exports;
  }

  async import(specifier, parentFilename) {
    const core = this.loadCoreModule(specifier);
    if (core) return core;

    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename);
    if (this.cache.has(resolved)) return this.cache.get(resolved).exports;

    if (resolved.endsWith(".json")) {
      const module = { id: resolved, filename: resolved, exports: {} };
      this.cache.set(resolved, module);
      module.exports = JSON.parse(this.kernel.fs.readFileSync(resolved, "utf8"));
      return module.exports;
    }

    const source = this.readModuleSource(resolved);
    const executableSource = stripHashbang(this.shouldTransformEsm(resolved, source)
      ? transformEsmToCjs(source, { filename: resolved })
      : source);
    const module = { id: resolved, filename: resolved, exports: {} };
    this.cache.set(resolved, module);
    const localRequire = this.createRequire(resolved);
    const wrapped = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "console",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "__opencontainersGlobals",
      "__opencontainersRequire",
      "fetch",
      "__opencontainersDynamicImport",
      `return (async () => {\nwith (__opencontainersGlobals) {\n${executableSource}\n}\n})();\n//# sourceURL=opencontainers://${resolved}`
    );
    await wrapped(
      module.exports,
      localRequire,
      module,
      resolved,
      dirname(resolved),
      this.process,
      this.console,
      this.timers.setTimeout,
      this.timers.clearTimeout,
      this.timers.setInterval,
      this.timers.clearInterval,
      this.timers.setImmediate,
      this.timers.clearImmediate,
      this.runtimeGlobals,
      localRequire,
      this.fetch,
      (childSpecifier) => this.dynamicImport(childSpecifier, resolved)
    );
    return module.exports;
  }

  get process() {
    if (!this.#process) {
      this.#process = createProcessBuiltin({
        descriptor: this.descriptor,
        kernel: this.kernel,
        asyncContextManager: this.asyncContextManager,
        getBuiltinModule: (specifier) => this.loadCoreModule(specifier)
      });
    }
    return this.#process;
  }

  #process;

  get fetch() {
    if (!this.#fetch) this.#fetch = createRuntimeFetch({ kernel: this.kernel, process: this.process });
    return this.#fetch;
  }

  #fetch;

  get timers() {
    if (!this.#timers) {
      this.#timers = createTimerApi({
        process: this.process,
        asyncContextManager: this.asyncContextManager
      });
    }
    return this.#timers;
  }

  #timers;

  get workerThreads() {
    if (!this.#workerThreads) {
      this.#workerThreads = createWorkerThreadsBuiltin({
        process: this.process,
        workerContext: this.descriptor.workerContext,
        runWorkerSource: (specifier, options) => this.runWorkerSource(specifier, options)
      });
    }
    return this.#workerThreads;
  }

  #workerThreads;

  get runtimeGlobals() {
    if (!this.runtimeGlobalObject) {
      const globals = {
        process: this.process,
        console: this.console,
        Buffer: RuntimeBuffer,
        setTimeout: this.timers.setTimeout,
        clearTimeout: this.timers.clearTimeout,
        setInterval: this.timers.setInterval,
        clearInterval: this.timers.clearInterval,
        setImmediate: this.timers.setImmediate,
        clearImmediate: this.timers.clearImmediate,
        queueMicrotask: (callback) => {
          const wrapped = this.asyncContextManager.bind(callback);
          const schedule = typeof globalThis.queueMicrotask === "function"
            ? globalThis.queueMicrotask.bind(globalThis)
            : (task) => Promise.resolve().then(task);
          schedule(() => {
            try {
              wrapped();
            } catch (error) {
              this.process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
              this.process.exitCode = 1;
            }
          });
        },
        fetch: this.fetch,
        URL: globalThis.URL,
        URLSearchParams: globalThis.URLSearchParams,
        TextEncoder: globalThis.TextEncoder,
        TextDecoder: globalThis.TextDecoder,
        AbortController: globalThis.AbortController,
        AbortSignal: globalThis.AbortSignal,
        Event: globalThis.Event,
        EventTarget: globalThis.EventTarget,
        Blob: globalThis.Blob,
        FormData: globalThis.FormData,
        Headers: globalThis.Headers,
        Request: globalThis.Request,
        Response: globalThis.Response,
        structuredClone: globalThis.structuredClone?.bind(globalThis),
        crypto: globalThis.crypto,
        MessageChannel: this.workerThreads.MessageChannel,
        MessagePort: this.workerThreads.MessagePort,
        BroadcastChannel: globalThis.BroadcastChannel,
        alert: undefined,
        confirm: undefined,
        prompt: undefined,
        open: undefined,
        close: undefined,
        window: undefined,
        document: undefined,
        location: undefined,
        history: undefined,
        localStorage: undefined,
        sessionStorage: undefined,
        indexedDB: undefined,
        navigator: undefined,
        parent: undefined,
        top: undefined,
        self: undefined
      };
      globals.global = globals;
      globals.globalThis = globals;
      this.runtimeGlobalObject = globals;
    }
    return this.runtimeGlobalObject;
  }

  loadCoreModule(specifier) {
    const normalized = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    if (!this.isCoreModule(normalized)) return null;
    if (!this.coreModules.has(normalized)) {
      const value = this.instantiateCoreModule(normalized);
      this.coreModules.set(normalized, value);
    }
    return this.coreModules.get(normalized);
  }

  isCoreModule(name) {
    return CORE_MODULES.includes(name);
  }

  instantiateCoreModule(name) {
    if (name === "assert" || name === "assert/strict") return assertBuiltin;
    if (name === "fs") return createFsBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "fs/promises") return createFsBuiltin({ kernel: this.kernel, process: this.process }).promises;
    if (name === "path") return pathBuiltin;
    if (name === "path/posix") return pathBuiltin.posix;
    if (name === "path/win32") return pathBuiltin.win32;
    if (name === "process") return this.process;
    if (name === "console") return createConsoleBuiltin(this.console);
    if (name === "cluster") return clusterBuiltin;
    if (name === "dgram") return dgramBuiltin;
    if (name === "domain") return domainBuiltin;
    if (name === "events") return eventsBuiltin;
    if (name === "stream") return streamBuiltin;
    if (name === "stream/consumers") return streamConsumersBuiltin;
    if (name === "stream/promises") return streamPromisesBuiltin;
    if (name === "stream/web") return streamWebBuiltin;
    if (name === "string_decoder") return stringDecoderBuiltin;
    if (name === "tty") return ttyBuiltin;
    if (name === "readline") return readlineBuiltin;
    if (name === "readline/promises") return readlineBuiltin.promises;
    if (name === "buffer") return bufferBuiltin;
    if (name === "child_process") return createChildProcessBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "constants") return constantsBuiltin;
    if (name === "http") return createHttpBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "https") return createHttpsBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "http2") return http2Builtin;
    if (name === "inspector") return inspectorBuiltin;
    if (name === "net") return createNetBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "dns") return this.createDnsBuiltin();
    if (name === "dns/promises") return this.createDnsBuiltin().promises;
    if (name === "module") return this.createModuleBuiltin();
    if (name === "os") return osBuiltin;
    if (name === "url") return urlBuiltin;
    if (name === "util") return createUtilBuiltin({ console: this.console, promisify: this.promisify });
    if (name === "util/types") return createUtilBuiltin({ console: this.console, promisify: this.promisify }).types;
    if (name === "perf_hooks") return perfHooksBuiltin;
    if (name === "punycode") return punycodeBuiltin;
    if (name === "querystring") return querystringBuiltin;
    if (name === "repl") return replBuiltin;
    if (name === "crypto") return this.createCryptoBuiltin();
    if (name === "diagnostics_channel") return diagnosticsChannelBuiltin;
    if (name === "v8") return v8Builtin;
    if (name === "vm") return createVmBuiltin({ globals: this.runtimeGlobals });
    if (name === "zlib") return this.createZlibBuiltin();
    if (name === "zlib/promises") return this.createZlibBuiltin().promises;
    if (name === "async_hooks") return createAsyncHooksBuiltin({ asyncContextManager: this.asyncContextManager });
    if (name === "timers") return this.timers.builtin;
    if (name === "timers/promises") return this.timers.promisesBuiltin;
    if (name === "tls") return tlsBuiltin;
    if (name === "trace_events") return traceEventsBuiltin;
    if (name === "wasi") return wasiBuiltin;
    if (name === "worker_threads") return this.workerThreads;
    throw new Error(`Unsupported core module: ${name}`);
  }

  promisify(fn) {
    const custom = fn?.[Symbol.for("nodejs.util.promisify.custom")];
    if (typeof custom === "function") return custom;
    return (...args) => new Promise((resolve, reject) => {
      fn(...args, (error, ...values) => {
        if (error) reject(error);
        else resolve(values.length > 1 ? values : values[0]);
      });
    });
  }

  dynamicImport(specifier, parentFilename) {
    this.process.__opencontainersAddRef?.();
    const promise = Promise.resolve().then(() => this.import(specifier, parentFilename));
    promise.finally(() => queueMicrotask(() => this.process.__opencontainersUnref?.()));
    return promise;
  }

  readModuleSource(resolved) {
    const overrides = this.runtimeGlobalObject?.__opencontainersSourceOverrides;
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, resolved)) {
      return String(overrides[resolved] ?? "");
    }
    return this.kernel.fs.readFileSync(resolved, "utf8");
  }

  async runWorkerSource(specifier, options = {}) {
    const workerDescriptor = {
      pid: this.descriptor.pid,
      ppid: this.descriptor.pid,
      cwd: this.descriptor.cwd,
      argv: ["node", options.filename ?? "[worker].js"],
      env: { ...this.descriptor.env },
      status: "running",
      stdin: this.descriptor.stdin,
      stdout: this.descriptor.stdout,
      stderr: this.descriptor.stderr,
      projectId: this.descriptor.projectId,
      workerContext: {
        parentPort: options.parentPort,
        threadId: options.threadId,
        workerData: options.workerData
      }
    };
    const workerLoader = new ModuleLoader({
      kernel: this.kernel,
      descriptor: workerDescriptor,
      console: this.console
    });
    try {
      if (options.signal?.aborted) return;
      if (options.eval) {
        const filename = resolvePath(this.descriptor.cwd, options.filename ?? `[worker-${options.threadId ?? "eval"}].js`);
        await workerLoader.evaluateWorkerSource(String(specifier ?? ""), filename, { type: options.type });
      } else {
        const parentFilename = resolvePath(this.descriptor.cwd, "[worker-entry].js");
        const filename = workerLoader.resolve(String(specifier), parentFilename);
        await workerLoader.import(filename, parentFilename);
      }
      await waitForWorkerIdle(workerDescriptor, options.signal);
    } finally {
      workerDescriptor.status = options.signal?.aborted ? "killed" : "exited";
      cleanupWorkerDescriptor(workerDescriptor);
    }
  }

  async evaluateWorkerSource(source, filename, { type } = {}) {
    const executableSource = type === "module" || looksLikeEsm(source)
      ? transformEsmToCjs(source, { filename })
      : source;
    const module = { id: filename, filename, exports: {} };
    const require = this.createRequire(filename);
    const wrapped = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "console",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "__opencontainersGlobals",
      "__opencontainersRequire",
      "fetch",
      "__opencontainersDynamicImport",
      `return (async () => {\nwith (__opencontainersGlobals) {\n${executableSource}\n}\n})();\n//# sourceURL=opencontainers://${filename}`
    );
    await wrapped(
      module.exports,
      require,
      module,
      filename,
      dirname(filename),
      this.process,
      this.console,
      this.timers.setTimeout,
      this.timers.clearTimeout,
      this.timers.setInterval,
      this.timers.clearInterval,
      this.timers.setImmediate,
      this.timers.clearImmediate,
      this.runtimeGlobals,
      require,
      this.fetch,
      (specifier) => this.dynamicImport(specifier, filename)
    );
    return module.exports;
  }

  createCryptoBuiltin() {
    return createNodeCryptoBuiltin({ process: this.process });
  }

  createDnsBuiltin() {
    return createDnsBuiltin();
  }

  createZlibBuiltin() {
    return createZlibBuiltin({ process: this.process });
  }

  createModuleBuiltin() {
    const createRequire = (filename) => this.createRequire(fileUrlToPath(String(filename?.href ?? filename ?? `${this.descriptor.cwd}/[repl].js`)));
    const builtinModules = [...CORE_MODULES];
    const loader = this;
    function OpenContainersModule(id = "", parent = null) {
      this.id = id;
      this.path = dirname(id || "/workspace");
      this.exports = {};
      this.filename = id;
      this.loaded = false;
      this.parent = parent;
      this.children = [];
      this.paths = loader.nodeModulePaths(this.path);
    }

    OpenContainersModule.Module = OpenContainersModule;
    OpenContainersModule.builtinModules = builtinModules;
    OpenContainersModule.createRequire = createRequire;
    OpenContainersModule.isBuiltin = (specifier) => CORE_MODULES.includes(String(specifier).replace(/^node:/, ""));
    OpenContainersModule._cache = this.cache;
    OpenContainersModule._extensions = MODULE_EXTENSIONS;
    OpenContainersModule._builtinLibs = builtinModules;
    OpenContainersModule._resolveFilename = (request, parent = null) => {
      const parentFilename = parent?.filename ?? parent?.id ?? `${this.descriptor.cwd}/[repl].js`;
      return this.resolve(request, parentFilename);
    };
    OpenContainersModule._load = (request, parent = null) => {
      const parentFilename = parent?.filename ?? parent?.id ?? `${this.descriptor.cwd}/[repl].js`;
      return this.require(request, parentFilename);
    };
    OpenContainersModule._nodeModulePaths = (from) => this.nodeModulePaths(from);
    OpenContainersModule.wrap = (source) => `(function (exports, require, module, __filename, __dirname) { ${source}\n});`;
    OpenContainersModule.syncBuiltinESMExports = () => {};
    OpenContainersModule.findSourceMap = () => undefined;
    OpenContainersModule.register = () => {};
    OpenContainersModule.globalPaths = ["/workspace/node_modules", "/node_modules"];
    OpenContainersModule.default = OpenContainersModule;
    return OpenContainersModule;
  }

  resolve(specifier, parentFilename) {
    if (this.loadCoreModule(specifier)) return specifier;
    specifier = fileUrlToPath(stripResourceQuery(specifier));
    const parentDirectory = parentFilename ? dirname(parentFilename) : this.descriptor.cwd;

    if (specifier.startsWith("#")) {
      return this.resolvePackageImport(specifier, parentDirectory, parentFilename);
    }

    if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
      return this.resolveAsFileOrDirectory(resolvePath(parentDirectory, specifier), specifier, parentFilename);
    }

    return this.resolveNodeModule(specifier, parentDirectory, parentFilename);
  }

  resolveAsFileOrDirectory(basePath, specifier, parentFilename) {
    for (const candidate of this.fileCandidates(basePath)) {
      if (this.kernel.fs.existsSync(candidate) && this.kernel.fs.statSync(candidate).isFile()) return candidate;
    }
    if (this.kernel.fs.existsSync(basePath) && this.kernel.fs.statSync(basePath).isDirectory()) {
      const packagePath = joinPath(basePath, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
        const entry = this.packageEntry(pkg, ".");
        if (entry) {
          try {
            return this.resolveAsFileOrDirectory(joinPath(basePath, entry), specifier, parentFilename);
          } catch {
            // Fall through to index candidates.
          }
        }
      }
      for (const candidate of this.fileCandidates(joinPath(basePath, "index"))) {
        if (this.kernel.fs.existsSync(candidate) && this.kernel.fs.statSync(candidate).isFile()) return candidate;
      }
    }
    throw new ModuleResolutionError(specifier, parentFilename);
  }

  fileCandidates(basePath) {
    const normalized = normalizePath(basePath);
    if (/\.[cm]?js$|\.json$/.test(normalized)) return [normalized];
    return [normalized, `${normalized}.js`, `${normalized}.cjs`, `${normalized}.mjs`, `${normalized}.json`];
  }

  resolveNodeModule(specifier, parentDirectory, parentFilename) {
    const packageParts = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2)
      : [specifier.split("/")[0]];
    const packageName = packageParts.join("/");
    const packageSubpath = specifier.slice(packageName.length).replace(/^\//, "");

    let current = normalizePath(parentDirectory);
    while (true) {
      const packageRoot = joinPath(current, "node_modules", packageName);
      if (this.kernel.fs.existsSync(packageRoot)) {
        const packagePath = joinPath(packageRoot, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
        const exportTarget = this.packageEntry(pkg, packageSubpath ? `./${packageSubpath}` : ".");
        if (exportTarget) {
          return this.resolveAsFileOrDirectory(joinPath(packageRoot, exportTarget), specifier, parentFilename);
          }
        }
        const target = packageSubpath ? joinPath(packageRoot, packageSubpath) : packageRoot;
        return this.resolveAsFileOrDirectory(target, specifier, parentFilename);
      }
      if (current === "/") break;
      current = dirname(current);
    }
    throw new ModuleResolutionError(specifier, parentFilename);
  }

  nodeModulePaths(from) {
    const paths = [];
    let current = normalizePath(from || this.descriptor.cwd);
    if (!current.startsWith("/")) current = resolvePath(this.descriptor.cwd, current);
    while (true) {
      paths.push(joinPath(current, "node_modules"));
      if (current === "/") break;
      current = dirname(current);
    }
    return [...new Set(paths)];
  }

  resolvePackageImport(specifier, parentDirectory, parentFilename) {
    let current = normalizePath(parentDirectory);
    while (true) {
      const packagePath = joinPath(current, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        try {
          const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
          const importsMap = pkg.imports;
          if (importsMap && typeof importsMap === "object") {
            const exact = importsMap[specifier];
            const matched = exact ?? this.matchPackageExportPattern(importsMap, specifier);
            const target = this.resolvePackageExportTarget(matched);
            if (target) return this.resolvePackageImportTarget(target, current, specifier, parentFilename);
          }
        } catch (error) {
          if (error instanceof ModuleResolutionError) throw error;
        }
      }
      if (current === "/") break;
      current = dirname(current);
    }
    throw new ModuleResolutionError(specifier, parentFilename);
  }

  resolvePackageImportTarget(target, packageRoot, specifier, parentFilename) {
    if (target.startsWith("./") || target.startsWith("../")) {
      return this.resolveAsFileOrDirectory(joinPath(packageRoot, target), specifier, parentFilename);
    }
    if (target.startsWith("/")) {
      return this.resolveAsFileOrDirectory(target, specifier, parentFilename);
    }
    return this.resolve(target, joinPath(packageRoot, "package.json"));
  }

  packageEntry(pkg, subpath = ".") {
    if (typeof pkg.exports === "string") return subpath === "." ? pkg.exports : null;
    if (pkg.exports && typeof pkg.exports === "object") {
      const exact = pkg.exports[subpath]
        ?? (subpath === "." ? pkg.exports["."] : undefined)
        ?? (subpath === "." && this.isConditionalExportObject(pkg.exports) ? pkg.exports : undefined);
      const matched = exact ?? this.matchPackageExportPattern(pkg.exports, subpath);
      const resolved = this.resolvePackageExportTarget(matched);
      if (resolved) return resolved;
      if (subpath !== ".") return null;
    }
    if (subpath !== ".") return null;
    return pkg.main ?? pkg.module ?? "index.js";
  }

  matchPackageExportPattern(exportsMap, subpath) {
    for (const [key, value] of Object.entries(exportsMap)) {
      if (!key.includes("*")) continue;
      const [prefix, suffix] = key.split("*");
      if (subpath.startsWith(prefix) && subpath.endsWith(suffix ?? "")) {
        const wildcard = subpath.slice(prefix.length, subpath.length - (suffix ?? "").length);
        return this.replacePackageExportWildcard(value, wildcard);
      }
    }
    return null;
  }

  replacePackageExportWildcard(value, wildcard) {
    if (typeof value === "string") return value.replaceAll("*", wildcard);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        this.replacePackageExportWildcard(entry, wildcard)
      ]));
    }
    return value;
  }

  resolvePackageExportTarget(target) {
    if (!target) return null;
    if (typeof target === "string") return target;
    if (Array.isArray(target)) {
      for (const item of target) {
        const resolved = this.resolvePackageExportTarget(item);
        if (resolved) return resolved;
      }
      return null;
    }
    if (typeof target === "object") {
      for (const condition of ["require", "import", "node", "default", "browser"]) {
        if (condition in target) {
          const resolved = this.resolvePackageExportTarget(target[condition]);
          if (resolved) return resolved;
        }
      }
    }
    return null;
  }

  isConditionalExportObject(value) {
    return value && typeof value === "object" && Object.keys(value).some((key) => ["browser", "require", "import", "node", "default"].includes(key));
  }

  shouldTransformEsm(filename, source) {
    if (filename.endsWith(".mjs")) return true;
    if (filename.endsWith(".cjs")) return false;
    if (looksLikeEsm(source)) return true;
    const packageType = this.nearestPackageType(dirname(filename));
    return packageType === "module";
  }

  nearestPackageType(directory) {
    let current = normalizePath(directory);
    while (true) {
      const packagePath = joinPath(current, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        try {
          return JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8")).type;
        } catch {
          return undefined;
        }
      }
      if (current === "/") return undefined;
      current = dirname(current);
    }
  }
}

function stripResourceQuery(specifier) {
  const value = String(specifier);
  if (value.startsWith("#")) return value;
  return value.replace(/[?#].*$/, "");
}

function stripHashbang(source) {
  return String(source).replace(/^#![^\n\r]*(?:\r?\n|$)/, "");
}

function fileUrlToPath(specifier) {
  if (!String(specifier).startsWith("file://")) return specifier;
  try {
    const url = new URL(String(specifier));
    if (url.hostname && url.hostname !== "localhost") return specifier;
    return decodeURIComponent(url.pathname);
  } catch {
    return specifier.replace(/^file:\/\//, "");
  }
}

function waitForWorkerIdle(descriptor, signal) {
  if ((descriptor.refCount ?? 0) === 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const previousOnIdle = descriptor.onIdle;
    const finish = () => {
      if (descriptor.onIdle === onIdle) descriptor.onIdle = previousOnIdle;
      signal?.removeEventListener?.("abort", finish);
      resolve();
    };
    const onIdle = () => {
      previousOnIdle?.();
      if ((descriptor.refCount ?? 0) === 0) finish();
    };
    descriptor.onIdle = onIdle;
    signal?.addEventListener?.("abort", finish, { once: true });
  });
}

function cleanupWorkerDescriptor(descriptor) {
  const cleanupTasks = [...(descriptor.cleanupTasks ?? [])];
  descriptor.cleanupTasks?.clear();
  descriptor.refCount = 0;
  descriptor.onIdle = null;
  for (const cleanup of cleanupTasks) {
    try {
      cleanup();
    } catch (_) {}
  }
}

const SYSTEM_ERRORS = new Map([
  [-1, ["EPERM", "operation not permitted"]],
  [-2, ["ENOENT", "no such file or directory"]],
  [-5, ["EIO", "input/output error"]],
  [-9, ["EBADF", "bad file descriptor"]],
  [-11, ["EAGAIN", "resource temporarily unavailable"]],
  [-13, ["EACCES", "permission denied"]],
  [-17, ["EEXIST", "file already exists"]],
  [-20, ["ENOTDIR", "not a directory"]],
  [-21, ["EISDIR", "illegal operation on a directory"]],
  [-22, ["EINVAL", "invalid argument"]],
  [-28, ["ENOSPC", "no space left on device"]],
  [-39, ["ENOTEMPTY", "directory not empty"]],
  [-98, ["EADDRINUSE", "address already in use"]],
  [-111, ["ECONNREFUSED", "connection refused"]]
]);

const MIME_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

class MIMEParams {
  constructor(init = "") {
    this.#map = new Map();
    if (typeof init === "string") {
      this.#parse(init);
      return;
    }
    if (init && typeof init[Symbol.iterator] === "function") {
      for (const [name, value] of init) this.set(name, value);
      return;
    }
    if (init && typeof init === "object") {
      for (const [name, value] of Object.entries(init)) this.set(name, value);
    }
  }

  get(name) {
    return this.#map.get(normalizeMimeParameterName(name)) ?? null;
  }

  has(name) {
    return this.#map.has(normalizeMimeParameterName(name));
  }

  set(name, value) {
    this.#map.set(normalizeMimeParameterName(name), String(value));
  }

  delete(name) {
    this.#map.delete(normalizeMimeParameterName(name));
  }

  entries() {
    return this.#map.entries();
  }

  keys() {
    return this.#map.keys();
  }

  values() {
    return this.#map.values();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  toString() {
    return [...this.#map]
      .map(([name, value]) => `${name}=${formatMimeParameterValue(value)}`)
      .join(";");
  }

  #parse(input) {
    for (const part of String(input).split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;
      const name = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim();
      this.set(name, unquoteMimeParameterValue(value));
    }
  }

  #map;
}

class MIMEType {
  constructor(input) {
    const [essence, ...parameterParts] = String(input).split(";");
    const slashIndex = essence.indexOf("/");
    if (slashIndex <= 0 || slashIndex === essence.length - 1) {
      throw Object.assign(new TypeError("Invalid MIME type"), { code: "ERR_INVALID_MIME_SYNTAX" });
    }
    this.type = essence.slice(0, slashIndex).trim();
    this.subtype = essence.slice(slashIndex + 1).trim();
    this.params = new MIMEParams(parameterParts.join(";"));
  }

  get essence() {
    return `${this.type}/${this.subtype}`;
  }

  get type() {
    return this.#type;
  }

  set type(value) {
    this.#type = normalizeMimeTypePart(value, "type");
  }

  get subtype() {
    return this.#subtype;
  }

  set subtype(value) {
    this.#subtype = normalizeMimeTypePart(value, "subtype");
  }

  toString() {
    const params = this.params.toString();
    return params ? `${this.essence};${params}` : this.essence;
  }

  #type;
  #subtype;
}

function createUtilBuiltin({ console, promisify }) {
  const util = {
    aborted(signal) {
      if (signal?.aborted) return Promise.resolve();
      return new Promise((resolve) => {
        signal?.addEventListener?.("abort", resolve, { once: true });
      });
    },
    callbackify(fn) {
      return (...args) => {
        const callback = args.pop();
        Promise.resolve()
          .then(() => fn(...args))
          .then(
            value => callback(null, value),
            error => callback(error)
          );
      };
    },
    debuglog() {
      return () => {};
    },
    deprecate(fn, message, code) {
      let warned = false;
      return function deprecatedFunction(...args) {
        if (!warned) {
          warned = true;
          const warning = code ? `${code}: ${message}` : message;
          console?.warn?.(warning);
        }
        return fn.apply(this, args);
      };
    },
    format,
    formatWithOptions(_options, ...args) {
      return format(...args);
    },
    inherits(constructor, superConstructor) {
      if (typeof constructor !== "function" || typeof superConstructor !== "function") {
        throw new TypeError("The constructor and super constructor must be functions");
      }
      constructor.super_ = superConstructor;
      Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
    },
    inspect,
    isDeepStrictEqual,
    promisify,
    stripVTControlCharacters,
    getSystemErrorName(errorNumber) {
      return systemErrorEntry(errorNumber)[0];
    },
    getSystemErrorMessage(errorNumber) {
      return systemErrorEntry(errorNumber)[1];
    },
    getSystemErrorMap() {
      return new Map(SYSTEM_ERRORS);
    },
    transferableAbortController() {
      return new AbortController();
    },
    transferableAbortSignal(signal) {
      return signal;
    },
    toUSVString,
    parseArgs,
    MIMEType,
    MIMEParams,
    TextDecoder: globalThis.TextDecoder,
    TextEncoder: globalThis.TextEncoder,
    types: {
      isArrayBuffer: value => value instanceof ArrayBuffer,
      isArrayBufferView: value => ArrayBuffer.isView(value),
      isAnyArrayBuffer: value => value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer),
      isArgumentsObject: value => tagOf(value) === "[object Arguments]",
      isAsyncFunction: value => value?.constructor?.name === "AsyncFunction",
      isBoxedPrimitive: value => value instanceof String || value instanceof Number || value instanceof Boolean || tagOf(value) === "[object BigInt]" || tagOf(value) === "[object Symbol]",
      isDate: value => value instanceof Date,
      isDataView: value => value instanceof DataView,
      isExternal: () => false,
      isGeneratorFunction: value => value?.constructor?.name === "GeneratorFunction",
      isKeyObject: value => Boolean(value?.[KEY_OBJECT_BRAND]),
      isMap: value => value instanceof Map,
      isMapIterator: value => tagOf(value) === "[object Map Iterator]",
      isModuleNamespaceObject: value => tagOf(value) === "[object Module]",
      isNativeError: value => value instanceof Error,
      isPromise: value => value && typeof value.then === "function",
      isProxy: () => false,
      isRegExp: value => value instanceof RegExp,
      isSet: value => value instanceof Set,
      isSetIterator: value => tagOf(value) === "[object Set Iterator]",
      isSharedArrayBuffer: value => typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer,
      isTypedArray: value => ArrayBuffer.isView(value) && !(value instanceof DataView),
      isUint8Array: value => value instanceof Uint8Array,
      isWeakMap: value => value instanceof WeakMap,
      isWeakSet: value => value instanceof WeakSet
    }
  };
  util.promisify.custom = Symbol.for("nodejs.util.promisify.custom");
  util.inspect.custom = Symbol.for("nodejs.util.inspect.custom");
  return util;
}

function systemErrorEntry(errorNumber) {
  const normalized = Number(errorNumber);
  if (!Number.isInteger(normalized)) {
    throw new TypeError("The error number must be an integer");
  }
  const key = normalized > 0 ? -normalized : normalized;
  return SYSTEM_ERRORS.get(key) ?? [`Unknown system error ${normalized}`, `Unknown system error ${normalized}`];
}

function normalizeMimeTypePart(value, label) {
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !MIME_TOKEN_PATTERN.test(normalized)) {
    throw Object.assign(new TypeError(`Invalid MIME ${label}`), { code: "ERR_INVALID_MIME_SYNTAX" });
  }
  return normalized;
}

function normalizeMimeParameterName(name) {
  const normalized = String(name).trim().toLowerCase();
  if (!normalized || !MIME_TOKEN_PATTERN.test(normalized)) {
    throw Object.assign(new TypeError("Invalid MIME parameter name"), { code: "ERR_INVALID_MIME_SYNTAX" });
  }
  return normalized;
}

function formatMimeParameterValue(value) {
  const string = String(value);
  if (MIME_TOKEN_PATTERN.test(string)) return string;
  return `"${string.replace(/["\\]/g, match => `\\${match}`)}"`;
}

function unquoteMimeParameterValue(value) {
  const string = String(value);
  if (string.length >= 2 && string[0] === "\"" && string[string.length - 1] === "\"") {
    return string.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return string;
}

function isDeepStrictEqual(left, right) {
  return deepStrictEqualValues(left, right, new WeakMap());
}

function deepStrictEqualValues(left, right, seen) {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;

  const seenRight = seen.get(left);
  if (seenRight) return seenRight === right;
  seen.set(left, right);

  if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && Object.is(left.getTime(), right.getTime());
  if (left instanceof RegExp || right instanceof RegExp) return left instanceof RegExp && right instanceof RegExp && String(left) === String(right);
  if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
    if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right) || left.byteLength !== right.byteLength) return false;
    const leftBytes = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
    const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
    return leftBytes.every((byte, index) => byte === rightBytes[index]);
  }
  if (left instanceof Map || right instanceof Map) {
    if (!(left instanceof Map) || !(right instanceof Map) || left.size !== right.size) return false;
    for (const [key, value] of left) {
      if (!right.has(key) || !deepStrictEqualValues(value, right.get(key), seen)) return false;
    }
    return true;
  }
  if (left instanceof Set || right instanceof Set) {
    if (!(left instanceof Set) || !(right instanceof Set) || left.size !== right.size) return false;
    for (const value of left) {
      let matched = false;
      for (const candidate of right) {
        if (deepStrictEqualValues(value, candidate, seen)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  }

  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.propertyIsEnumerable.call(left, key)) continue;
    if (!Object.prototype.propertyIsEnumerable.call(right, key)) return false;
    if (!deepStrictEqualValues(left[key], right[key], seen)) return false;
  }
  return true;
}

function createConsoleBuiltin(console) {
  class Console {
    constructor(stdout = console, stderr = stdout) {
      this.stdout = stdout;
      this.stderr = stderr;
    }

    log(...args) {
      writeConsole(this.stdout, "log", args);
    }

    info(...args) {
      writeConsole(this.stdout, "info", args);
    }

    warn(...args) {
      writeConsole(this.stderr, "warn", args);
    }

    error(...args) {
      writeConsole(this.stderr, "error", args);
    }

    dir(value, options) {
      this.log(inspect(value, options));
    }

    trace(...args) {
      this.error(`Trace: ${format(...args)}`);
    }

    assert(value, ...args) {
      if (!value) this.error(args.length ? format(...args) : "Assertion failed");
    }

    time(label = "default") {
      this.#timers.set(String(label), performanceNow());
    }

    timeEnd(label = "default") {
      const key = String(label);
      const start = this.#timers.get(key);
      if (start === undefined) {
        this.warn(`No such label '${key}' for console.timeEnd()`);
        return;
      }
      this.#timers.delete(key);
      this.log(`${key}: ${(performanceNow() - start).toFixed(3)}ms`);
    }

    #timers = new Map();
  }

  const builtin = {
    Console,
    log: (...args) => console.log(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    dir: (value, options) => console.log(inspect(value, options)),
    trace: (...args) => console.error(`Trace: ${format(...args)}`),
    assert: (value, ...args) => {
      if (!value) console.error(args.length ? format(...args) : "Assertion failed");
    }
  };
  builtin.default = builtin;
  return builtin;
}

function writeConsole(target, method, args) {
  if (typeof target?.write === "function") {
    target.write(`${args.map(value => typeof value === "string" ? value : inspect(value)).join(" ")}\n`);
    return;
  }
  target?.[method]?.(...args);
}

function tagOf(value) {
  return Object.prototype.toString.call(value);
}

function format(first, ...args) {
  if (typeof first !== "string") {
    return [first, ...args].map(value => inspect(value)).join(" ");
  }

  let index = 0;
  const formatted = first.replace(/%[sdifjoO%]/g, token => {
    if (token === "%%") return "%";
    if (index >= args.length) return token;
    const value = args[index++];
    if (token === "%s") return String(value);
    if (token === "%d" || token === "%i") return Number.parseInt(value, 10).toString();
    if (token === "%f") return Number.parseFloat(value).toString();
    if (token === "%j") {
      try {
        return JSON.stringify(value);
      } catch (_) {
        return "[Circular]";
      }
    }
    return inspect(value);
  });

  const rest = args.slice(index).map(value => inspect(value));
  return rest.length ? `${formatted} ${rest.join(" ")}` : formatted;
}

function inspect(value, options = {}) {
  if (typeof value === "string") return value;
  if (typeof value === "function") return `[Function${value.name ? `: ${value.name}` : ""}]`;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, options?.compact === false ? 2 : 0);
  } catch (_) {
    return String(value);
  }
}

function stripVTControlCharacters(value) {
  return String(value).replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
}

function toUSVString(value) {
  const input = String(value);
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += input[index] + input[index + 1];
        index += 1;
      } else {
        output += "\uFFFD";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\uFFFD";
      continue;
    }
    output += input[index];
  }
  return output;
}

function parseArgs(config = {}) {
  const args = [...(config.args ?? [])].map(String);
  const options = config.options ?? {};
  const strict = config.strict !== false;
  const allowPositionals = config.allowPositionals !== false;
  const tokensEnabled = Boolean(config.tokens);
  const values = Object.create(null);
  const positionals = [];
  const tokens = [];
  const shortToLong = new Map();

  for (const [name, option] of Object.entries(options)) {
    if (Object.prototype.hasOwnProperty.call(option, "default")) values[name] = option.default;
    if (option.short) shortToLong.set(option.short, name);
  }

  const setOption = (name, value, rawName, inlineValue = undefined) => {
    const option = options[name];
    if (!option) {
      if (strict) throw Object.assign(new TypeError(`Unknown option '${rawName}'`), { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" });
      values[name] = value;
      return;
    }
    const parsedValue = option.type === "boolean" ? Boolean(value) : String(value);
    if (option.multiple) {
      if (!Array.isArray(values[name])) values[name] = [];
      values[name].push(parsedValue);
    } else {
      values[name] = parsedValue;
    }
    if (tokensEnabled) {
      tokens.push({
        kind: "option",
        name,
        rawName,
        index: tokens.length,
        value: option.type === "boolean" ? undefined : parsedValue,
        inlineValue
      });
    }
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      for (const positional of args.slice(index + 1)) pushPositional(positional);
      break;
    }
    if (arg.startsWith("--no-")) {
      setOption(arg.slice(5), false, arg);
      continue;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const equalsIndex = arg.indexOf("=");
      const name = equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
      const option = options[name];
      if (option?.type === "boolean") {
        setOption(name, equalsIndex === -1 ? true : arg.slice(equalsIndex + 1) !== "false", `--${name}`, equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1));
      } else {
        const value = equalsIndex === -1 ? args[++index] : arg.slice(equalsIndex + 1);
        if (value === undefined) throw Object.assign(new TypeError(`Option '${name}' argument missing`), { code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" });
        setOption(name, value, `--${name}`, equalsIndex === -1 ? undefined : value);
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const flags = arg.slice(1);
      for (let flagIndex = 0; flagIndex < flags.length; flagIndex += 1) {
        const short = flags[flagIndex];
        const name = shortToLong.get(short) ?? short;
        const option = options[name];
        if (option?.type === "string") {
          const rest = flags.slice(flagIndex + 1);
          const value = rest || args[++index];
          if (value === undefined) throw Object.assign(new TypeError(`Option '${short}' argument missing`), { code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" });
          setOption(name, value, `-${short}`, rest || undefined);
          break;
        }
        setOption(name, true, `-${short}`);
      }
      continue;
    }
    pushPositional(arg);
  }

  for (const [name, option] of Object.entries(options)) {
    if (option.multiple && values[name] === undefined) values[name] = [];
    else if (option.type === "boolean" && values[name] === undefined) values[name] = false;
  }

  return tokensEnabled ? { values, positionals, tokens } : { values, positionals };

  function pushPositional(value) {
    if (!allowPositionals && strict) {
      throw Object.assign(new TypeError(`Unexpected argument '${value}'`), { code: "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL" });
    }
    positionals.push(value);
    if (tokensEnabled) tokens.push({ kind: "positional", index: tokens.length, value });
  }
}

const querystringBuiltin = {
  decode: querystringParse,
  encode: querystringStringify,
  escape: encodeURIComponent,
  parse: querystringParse,
  stringify: querystringStringify,
  unescape: decodeURIComponent
};

const streamConsumersBuiltin = {
  arrayBuffer: async (stream) => {
    const buffer = await consumeToBuffer(stream);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  },
  blob: async (stream) => new Blob([await consumeToBuffer(stream)]),
  buffer: consumeToBuffer,
  text: async (stream) => (await consumeToBuffer(stream)).toString("utf8"),
  json: async (stream) => JSON.parse((await consumeToBuffer(stream)).toString("utf8"))
};
streamConsumersBuiltin.default = streamConsumersBuiltin;

async function consumeToBuffer(stream) {
  if (stream === undefined || stream === null) return RuntimeBuffer.alloc(0);
  if (typeof stream === "string" || stream instanceof Uint8Array || stream instanceof ArrayBuffer || ArrayBuffer.isView(stream)) {
    return RuntimeBuffer.from(stream);
  }
  const chunks = [];
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value !== undefined) chunks.push(RuntimeBuffer.from(value));
    }
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream) chunks.push(RuntimeBuffer.from(chunk));
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream.on === "function") {
    return new Promise((resolve, reject) => {
      stream.on("data", chunk => chunks.push(RuntimeBuffer.from(chunk)));
      stream.once?.("error", reject);
      stream.once?.("end", () => resolve(RuntimeBuffer.concat(chunks)));
      stream.once?.("close", () => resolve(RuntimeBuffer.concat(chunks)));
    });
  }
  return RuntimeBuffer.from(String(stream));
}

const streamWebBuiltin = {
  ReadableStream: globalThis.ReadableStream,
  ReadableStreamDefaultReader: globalThis.ReadableStreamDefaultReader,
  ReadableStreamBYOBReader: globalThis.ReadableStreamBYOBReader,
  ReadableStreamBYOBRequest: globalThis.ReadableStreamBYOBRequest,
  ReadableByteStreamController: globalThis.ReadableByteStreamController,
  ReadableStreamDefaultController: globalThis.ReadableStreamDefaultController,
  TransformStream: globalThis.TransformStream,
  TransformStreamDefaultController: globalThis.TransformStreamDefaultController,
  WritableStream: globalThis.WritableStream,
  WritableStreamDefaultWriter: globalThis.WritableStreamDefaultWriter,
  WritableStreamDefaultController: globalThis.WritableStreamDefaultController,
  ByteLengthQueuingStrategy: globalThis.ByteLengthQueuingStrategy,
  CountQueuingStrategy: globalThis.CountQueuingStrategy,
  TextEncoderStream: globalThis.TextEncoderStream,
  TextDecoderStream: globalThis.TextDecoderStream,
  CompressionStream: globalThis.CompressionStream,
  DecompressionStream: globalThis.DecompressionStream
};
streamWebBuiltin.default = streamWebBuiltin;

const perfHooksBuiltin = {
  performance: globalThis.performance ?? {
    timeOrigin: Date.now(),
    now: () => Date.now()
  },
  PerformanceObserver: globalThis.PerformanceObserver ?? class PerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
  constants: {
    NODE_PERFORMANCE_GC_MAJOR: 4,
    NODE_PERFORMANCE_GC_MINOR: 1,
    NODE_PERFORMANCE_GC_INCREMENTAL: 8,
    NODE_PERFORMANCE_GC_WEAKCB: 16
  },
  monitorEventLoopDelay() {
    return {
      enable() {},
      disable() {},
      reset() {},
      min: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      percentile: () => 0,
      percentiles: new Map()
    };
  },
  createHistogram() {
    return {
      record() {},
      reset() {},
      min: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      percentile: () => 0,
      percentiles: new Map()
    };
  },
  timerify(fn) {
    return function timerified(...args) {
      return fn.apply(this, args);
    };
  }
};
perfHooksBuiltin.performance.eventLoopUtilization ??= () => ({ idle: 0, active: 0, utilization: 0 });
perfHooksBuiltin.default = perfHooksBuiltin;

function performanceNow() {
  return perfHooksBuiltin.performance?.now?.() ?? Date.now();
}

const punycodeBuiltin = {
  version: "2.3.1-opencontainers",
  ucs2: {
    decode: ucs2Decode,
    encode: ucs2Encode
  },
  decode: punycodeDecode,
  encode: punycodeEncode,
  toASCII(domain) {
    return String(domain ?? "")
      .split(".")
      .map(label => /^[\x00-\x7F]*$/.test(label) ? label : `xn--${punycodeEncode(label)}`)
      .join(".");
  },
  toUnicode(domain) {
    return String(domain ?? "")
      .split(".")
      .map(label => label.toLowerCase().startsWith("xn--") ? punycodeDecode(label.slice(4)) : label)
      .join(".");
  }
};
punycodeBuiltin.default = punycodeBuiltin;

const domainBuiltin = {
  Domain: class Domain extends eventsBuiltin {
    constructor() {
      super();
      this.members = [];
    }

    add(emitter) {
      if (emitter && !this.members.includes(emitter)) this.members.push(emitter);
      return emitter;
    }

    remove(emitter) {
      this.members = this.members.filter(member => member !== emitter);
      return emitter;
    }

    bind(callback) {
      return (...args) => {
        try {
          return callback(...args);
        } catch (error) {
          this.emit("error", error);
        }
      };
    }

    intercept(callback) {
      return (error, ...args) => {
        if (error) {
          this.emit("error", error);
          return;
        }
        return callback(...args);
      };
    }

    run(callback, ...args) {
      return this.bind(callback)(...args);
    }

    enter() {}
    exit() {}
    dispose() {
      this.removeAllListeners();
      this.members = [];
    }
  },
  create() {
    return new domainBuiltin.Domain();
  },
  get active() {
    return null;
  }
};
domainBuiltin.default = domainBuiltin;

const clusterBuiltin = {
  isMaster: true,
  isPrimary: true,
  isWorker: false,
  workers: {},
  settings: {},
  setupMaster() {},
  setupPrimary() {},
  fork() {
    throw Object.assign(new Error("node:cluster is not supported in OpenContainers V1"), {
      code: "ERR_OPENCONTAINERS_CLUSTER_UNSUPPORTED"
    });
  }
};
clusterBuiltin.default = clusterBuiltin;

const dgramBuiltin = {
  createSocket() {
    throw Object.assign(new Error("node:dgram UDP sockets are not supported in OpenContainers V1"), {
      code: "ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED"
    });
  },
  Socket: class Socket extends eventsBuiltin {}
};
dgramBuiltin.default = dgramBuiltin;

const PUNYCODE_BASE = 36;
const PUNYCODE_TMIN = 1;
const PUNYCODE_TMAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;
const PUNYCODE_DELIMITER = "-";

function ucs2Decode(string) {
  const output = [];
  const input = String(string ?? "");
  for (let index = 0; index < input.length; index += 1) {
    const value = input.charCodeAt(index);
    if (value >= 0xd800 && value <= 0xdbff && index + 1 < input.length) {
      const extra = input.charCodeAt(index + 1);
      if ((extra & 0xfc00) === 0xdc00) {
        output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
        index += 1;
        continue;
      }
    }
    output.push(value);
  }
  return output;
}

function ucs2Encode(codePoints) {
  return [...(codePoints ?? [])].map((value) => {
    const codePoint = Number(value);
    if (codePoint <= 0xffff) return String.fromCharCode(codePoint);
    const adjusted = codePoint - 0x10000;
    return String.fromCharCode((adjusted >>> 10) + 0xd800, (adjusted & 0x3ff) + 0xdc00);
  }).join("");
}

function punycodeDecode(input) {
  const source = String(input ?? "");
  const output = [];
  const basic = source.lastIndexOf(PUNYCODE_DELIMITER);
  let index = 0;
  let n = PUNYCODE_INITIAL_N;
  let i = 0;
  let bias = PUNYCODE_INITIAL_BIAS;

  if (basic > -1) {
    for (let offset = 0; offset < basic; offset += 1) {
      output.push(source.charCodeAt(offset));
    }
    index = basic + 1;
  }

  while (index < source.length) {
    const oldi = i;
    let weight = 1;
    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      if (index >= source.length) throw new RangeError("Invalid input");
      const digit = punycodeBasicToDigit(source.charCodeAt(index++));
      if (digit >= PUNYCODE_BASE) throw new RangeError("Invalid input");
      i += digit * weight;
      const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
      if (digit < t) break;
      weight *= PUNYCODE_BASE - t;
    }
    const length = output.length + 1;
    bias = punycodeAdapt(i - oldi, length, oldi === 0);
    n += Math.floor(i / length);
    i %= length;
    output.splice(i, 0, n);
    i += 1;
  }

  return ucs2Encode(output);
}

function punycodeEncode(input) {
  const codePoints = ucs2Decode(input);
  const output = [];
  let n = PUNYCODE_INITIAL_N;
  let delta = 0;
  let bias = PUNYCODE_INITIAL_BIAS;

  for (const codePoint of codePoints) {
    if (codePoint < 0x80) output.push(String.fromCharCode(codePoint));
  }

  let handled = output.length;
  const basicLength = handled;
  if (basicLength) output.push(PUNYCODE_DELIMITER);

  while (handled < codePoints.length) {
    let m = Infinity;
    for (const codePoint of codePoints) {
      if (codePoint >= n && codePoint < m) m = codePoint;
    }
    delta += (m - n) * (handled + 1);
    n = m;

    for (const codePoint of codePoints) {
      if (codePoint < n) {
        delta += 1;
      } else if (codePoint === n) {
        let q = delta;
        for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
          const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
          if (q < t) break;
          output.push(punycodeDigitToBasic(t + ((q - t) % (PUNYCODE_BASE - t))));
          q = Math.floor((q - t) / (PUNYCODE_BASE - t));
        }
        output.push(punycodeDigitToBasic(q));
        bias = punycodeAdapt(delta, handled + 1, handled === basicLength);
        delta = 0;
        handled += 1;
      }
    }

    delta += 1;
    n += 1;
  }

  return output.join("");
}

function punycodeAdapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX) >> 1) {
    delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta) / (delta + PUNYCODE_SKEW));
}

function punycodeBasicToDigit(codePoint) {
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x16;
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41;
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61;
  return PUNYCODE_BASE;
}

function punycodeDigitToBasic(digit) {
  return String.fromCharCode(digit + 22 + 75 * (digit < 26));
}

const osBuiltin = {
  EOL: "\n",
  devNull: "/dev/null",
  arch: () => "wasm",
  availableParallelism: () => 1,
  cpus: () => [{ model: "virtual", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
  endianness: () => "LE",
  freemem: () => 256 * 1024 * 1024,
  getPriority: () => 0,
  homedir: () => "/home/opencontainers",
  hostname: () => "opencontainers",
  loadavg: () => [0, 0, 0],
  machine: () => "wasm32",
  networkInterfaces: () => ({}),
  platform: () => "opencontainers",
  release: () => "26.0.0",
  setPriority: () => {},
  tmpdir: () => "/tmp",
  totalmem: () => 256 * 1024 * 1024,
  type: () => "OpenContainers",
  uptime: () => Math.floor(globalThis.performance?.now?.() ? globalThis.performance.now() / 1000 : 0),
  userInfo: () => ({
    uid: 1000,
    gid: 1000,
    username: "opencontainers",
    homedir: "/home/opencontainers",
    shell: "/bin/sh"
  }),
  version: () => "OpenContainers 26.0.0",
  constants: {
    errno: {
      EACCES: 13,
      EADDRINUSE: 98,
      EEXIST: 17,
      EISDIR: 21,
      EINVAL: 22,
      ENOENT: 2,
      ENOTDIR: 20,
      ENOTEMPTY: 39,
      EPERM: 1
    },
    signals: {
      SIGHUP: 1,
      SIGINT: 2,
      SIGKILL: 9,
      SIGTERM: 15
    }
  }
};

const urlBuiltin = {
  URL,
  URLSearchParams,
  fileURLToPath: fileUrlToPath,
  format: formatUrl,
  parse: parseUrl,
  resolve: resolveUrl,
  urlToHttpOptions,
  domainToASCII,
  domainToUnicode,
  pathToFileURL(path) {
    return new URL(`file://${encodeURI(String(path)).replace(/#/g, "%23").replace(/\?/g, "%3F")}`);
  }
};

function formatUrl(input, options = {}) {
  if (input instanceof URL) {
    const url = new URL(input.href);
    if (options.auth === false) {
      url.username = "";
      url.password = "";
    }
    if (options.fragment === false) url.hash = "";
    if (options.search === false) url.search = "";
    return url.href;
  }
  if (typeof input === "string") return input;
  const protocol = input.protocol ?? "";
  const auth = options.auth === false || !input.auth ? "" : `${input.auth}@`;
  const host = input.host ?? [input.hostname, input.port].filter(Boolean).join(":");
  const pathname = input.pathname ?? input.path?.split("?")[0] ?? "";
  const search = options.search === false ? "" : input.search ?? (input.query ? `?${querystringStringify(input.query)}` : "");
  const hash = options.fragment === false ? "" : input.hash ?? "";
  const slashes = input.slashes || protocol === "http:" || protocol === "https:" || protocol === "file:" ? "//" : "";
  return `${protocol}${slashes}${auth}${host}${pathname}${search}${hash}`;
}

function parseUrl(input, parseQueryString = false, slashesDenoteHost = false) {
  const source = String(input ?? "");
  let parsed;
  let strippedProtocol = false;
  try {
    parsed = new URL(source);
  } catch (_) {
    if (slashesDenoteHost && source.startsWith("//")) {
      try {
        parsed = new URL(`http:${source}`);
        strippedProtocol = true;
      } catch {
        return parseRelativeUrl(source, parseQueryString);
      }
    } else {
      return parseRelativeUrl(source, parseQueryString);
    }
  }

  const auth = [parsed.username, parsed.password].filter(Boolean).map(decodeURIComponent).join(":") || null;
  const search = parsed.search || null;
  const pathname = parsed.pathname || null;
  const host = parsed.host || null;
  const protocol = strippedProtocol ? null : parsed.protocol;
  return {
    protocol,
    slashes: true,
    auth,
    host,
    port: parsed.port || null,
    hostname: parsed.hostname || null,
    hash: parsed.hash || null,
    search,
    query: parseQueryString ? querystringParse(search?.slice(1) ?? "") : (search ? search.slice(1) : null),
    pathname,
    path: `${parsed.pathname}${parsed.search}` || null,
    href: strippedProtocol ? parsed.href.replace(/^http:/, "") : parsed.href
  };
}

function parseRelativeUrl(source, parseQueryString = false) {
  const hashIndex = source.indexOf("#");
  const withoutHash = hashIndex === -1 ? source : source.slice(0, hashIndex);
  const hash = hashIndex === -1 ? null : source.slice(hashIndex);
  const searchIndex = withoutHash.indexOf("?");
  const pathname = searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex);
  const search = searchIndex === -1 ? null : withoutHash.slice(searchIndex);
  return {
    protocol: null,
    slashes: null,
    auth: null,
    host: null,
    port: null,
    hostname: null,
    hash,
    search,
    query: parseQueryString ? querystringParse(search?.slice(1) ?? "") : (search ? search.slice(1) : null),
    pathname: pathname || null,
    path: `${pathname}${search ?? ""}` || null,
    href: source
  };
}

function resolveUrl(from, to) {
  try {
    return new URL(String(to), String(from)).href;
  } catch {
    return String(to);
  }
}

function urlToHttpOptions(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname}${url.search}`,
    href: url.href,
    port: url.port || undefined,
    auth: url.username || url.password ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : undefined,
    host: url.host
  };
}

function domainToASCII(domain) {
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return "";
  }
}

function domainToUnicode(domain) {
  return String(domain ?? "");
}

const constantsBuiltin = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGIOT: 6,
  SIGBUS: 7,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGSEGV: 11,
  SIGUSR2: 12,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  COPYFILE_EXCL: 1,
  COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE_FORCE: 4,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 0o100,
  O_EXCL: 0o200,
  O_NOCTTY: 0o400,
  O_TRUNC: 0o1000,
  O_APPEND: 0o2000,
  O_DIRECTORY: 0o200000,
  O_NOFOLLOW: 0o400000,
  S_IFMT: 0o170000,
  S_IFREG: 0o100000,
  S_IFDIR: 0o040000,
  S_IFCHR: 0o020000,
  S_IFBLK: 0o060000,
  S_IFIFO: 0o010000,
  S_IFLNK: 0o120000,
  S_IFSOCK: 0o140000,
  S_IRWXU: 0o700,
  S_IRUSR: 0o400,
  S_IWUSR: 0o200,
  S_IXUSR: 0o100,
  S_IRWXG: 0o070,
  S_IRGRP: 0o040,
  S_IWGRP: 0o020,
  S_IXGRP: 0o010,
  S_IRWXO: 0o007,
  S_IROTH: 0o004,
  S_IWOTH: 0o002,
  S_IXOTH: 0o001
};

function querystringParse(source, separator = "&", equals = "=") {
  const result = {};
  const text = String(source || "");
  if (!text) return result;
  for (const pair of text.split(separator)) {
    if (!pair) continue;
    const index = pair.indexOf(equals);
    const rawKey = index === -1 ? pair : pair.slice(0, index);
    const rawValue = index === -1 ? "" : pair.slice(index + equals.length);
    const key = decodeQueryComponent(rawKey);
    const value = decodeQueryComponent(rawValue);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function querystringStringify(object, separator = "&", equals = "=") {
  return Object.entries(object ?? {})
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map(item => `${encodeURIComponent(key)}${equals}${encodeURIComponent(item ?? "")}`);
    })
    .join(separator);
}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch (_) {
    return String(value);
  }
}

class TLSSocket {}

class AssertionError extends Error {
  constructor({ message, actual, expected, operator } = {}) {
    super(message ?? `Expected ${actual} ${operator ?? "to equal"} ${expected}`);
    this.name = "AssertionError";
    this.code = "ERR_ASSERTION";
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
  }
}

function assert(value, message) {
  if (!value) {
    throw new AssertionError({
      message,
      actual: value,
      expected: true,
      operator: "=="
    });
  }
}

assert.AssertionError = AssertionError;
assert.ok = assert;
assert.equal = (actual, expected, message) => {
  if (actual != expected) throw new AssertionError({ message, actual, expected, operator: "==" });
};
assert.notEqual = (actual, expected, message) => {
  if (actual == expected) throw new AssertionError({ message, actual, expected, operator: "!=" });
};
assert.strictEqual = (actual, expected, message) => {
  if (actual !== expected) throw new AssertionError({ message, actual, expected, operator: "===" });
};
assert.notStrictEqual = (actual, expected, message) => {
  if (actual === expected) throw new AssertionError({ message, actual, expected, operator: "!==" });
};
assert.deepStrictEqual = (actual, expected, message) => {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: "deepStrictEqual" });
  }
};
assert.deepEqual = assert.deepStrictEqual;
assert.notDeepStrictEqual = (actual, expected, message) => {
  if (isDeepStrictEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: "notDeepStrictEqual" });
  }
};
assert.notDeepEqual = assert.notDeepStrictEqual;
assert.fail = (message = "Failed") => {
  throw new AssertionError({ message, operator: "fail" });
};
assert.throws = (fn, expected, message) => {
  const normalized = normalizeExpectedAssertion(expected, message);
  try {
    fn();
  } catch (error) {
    if (!expectedErrorMatches(error, normalized.expected)) {
      throw new AssertionError({ message: normalized.message, actual: error, expected: normalized.expected, operator: "throws" });
    }
    return error;
  }
  throw new AssertionError({ message: normalized.message, expected: normalized.expected, operator: "throws" });
};
assert.doesNotThrow = (fn, expected, message) => {
  const normalized = normalizeExpectedAssertion(expected, message);
  try {
    fn();
  } catch (error) {
    if (expectedErrorMatches(error, normalized.expected)) {
      throw new AssertionError({ message: normalized.message, actual: error, expected: undefined, operator: "doesNotThrow" });
    }
    throw error;
  }
};
assert.rejects = async (promiseOrFn, expected, message) => {
  const normalized = normalizeExpectedAssertion(expected, message);
  try {
    await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    if (!expectedErrorMatches(error, normalized.expected)) {
      throw new AssertionError({ message: normalized.message, actual: error, expected: normalized.expected, operator: "rejects" });
    }
    return error;
  }
  throw new AssertionError({ message: normalized.message, expected: normalized.expected, operator: "rejects" });
};
assert.doesNotReject = async (promiseOrFn, expected, message) => {
  const normalized = normalizeExpectedAssertion(expected, message);
  try {
    await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    if (expectedErrorMatches(error, normalized.expected)) {
      throw new AssertionError({ message: normalized.message, actual: error, expected: undefined, operator: "doesNotReject" });
    }
    throw error;
  }
};
assert.match = (string, regexp, message) => {
  if (!(regexp instanceof RegExp)) throw new TypeError("The regexp argument must be a RegExp");
  if (!regexp.test(String(string))) {
    throw new AssertionError({ message, actual: string, expected: regexp, operator: "match" });
  }
};
assert.doesNotMatch = (string, regexp, message) => {
  if (!(regexp instanceof RegExp)) throw new TypeError("The regexp argument must be a RegExp");
  if (regexp.test(String(string))) {
    throw new AssertionError({ message, actual: string, expected: regexp, operator: "doesNotMatch" });
  }
};
assert.ifError = (value) => {
  if (value !== null && value !== undefined) {
    throw new AssertionError({
      message: value?.message ?? String(value),
      actual: value,
      expected: null,
      operator: "ifError"
    });
  }
};
assert.strict = assert;

const assertBuiltin = assert;

function normalizeExpectedAssertion(expected, message) {
  if (typeof expected === "string" && message === undefined) {
    return { expected: undefined, message: expected };
  }
  return { expected, message };
}

function expectedErrorMatches(error, expected) {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(String(error?.message ?? error));
  if (typeof expected === "function") {
    if (error instanceof expected) return true;
    if (expected.prototype instanceof Error || expected === Error) return false;
    return expected(error) === true;
  }
  if (expected && typeof expected === "object") {
    for (const [key, value] of Object.entries(expected)) {
      const actual = error?.[key];
      if (value instanceof RegExp) {
        if (!value.test(String(actual))) return false;
      } else if (!isDeepStrictEqual(actual, value)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

const diagnosticsChannels = new Map();

const diagnosticsChannelBuiltin = {
  channel(name) {
    const key = String(name);
    if (!diagnosticsChannels.has(key)) {
      const subscribers = new Set();
      diagnosticsChannels.set(key, {
        name: key,
        get hasSubscribers() {
          return subscribers.size > 0;
        },
        publish(message) {
          for (const subscriber of subscribers) subscriber(message, key);
        },
        subscribe(callback) {
          if (typeof callback === "function") subscribers.add(callback);
          return this;
        },
        unsubscribe(callback) {
          subscribers.delete(callback);
          return this;
        },
        bindStore() {
          return this;
        },
        runStores(_context, callback, ...args) {
          return callback(...args);
        }
      });
    }
    return diagnosticsChannels.get(key);
  },
  hasSubscribers(name) {
    return diagnosticsChannelBuiltin.channel(name).hasSubscribers;
  },
  subscribe(name, callback) {
    diagnosticsChannelBuiltin.channel(name).subscribe(callback);
  },
  unsubscribe(name, callback) {
    diagnosticsChannelBuiltin.channel(name).unsubscribe(callback);
  },
  tracingChannel(name) {
    return {
      start: diagnosticsChannelBuiltin.channel(`${name}:start`),
      end: diagnosticsChannelBuiltin.channel(`${name}:end`),
      asyncStart: diagnosticsChannelBuiltin.channel(`${name}:asyncStart`),
      asyncEnd: diagnosticsChannelBuiltin.channel(`${name}:asyncEnd`),
      error: diagnosticsChannelBuiltin.channel(`${name}:error`)
    };
  }
};

const http2Builtin = {
  constants: {
    HTTP2_HEADER_LOCATION: "location",
    HTTP2_HEADER_CONTENT_TYPE: "content-type",
    HTTP2_HEADER_USER_AGENT: "user-agent",
    HTTP_STATUS_REQUEST_TIMEOUT: 408,
    HTTP_STATUS_TOO_MANY_REQUESTS: 429,
    HTTP_STATUS_INTERNAL_SERVER_ERROR: 500
  }
};

const v8Builtin = {
  getHeapStatistics: () => ({
    total_heap_size: 32 * 1024 * 1024,
    total_heap_size_executable: 0,
    total_physical_size: 32 * 1024 * 1024,
    total_available_size: 256 * 1024 * 1024,
    used_heap_size: 8 * 1024 * 1024,
    heap_size_limit: 256 * 1024 * 1024,
    malloced_memory: 0,
    peak_malloced_memory: 0,
    does_zap_garbage: 0,
    number_of_native_contexts: 1,
    number_of_detached_contexts: 0
  }),
  serialize: (value) => RuntimeBuffer.from(JSON.stringify(value)),
  deserialize: (buffer) => JSON.parse(RuntimeBuffer.from(buffer).toString("utf8")),
  cachedDataVersionTag: () => 0
};

const tlsBuiltin = {
  TLSSocket,
  connect() {
    throw Object.assign(new Error("node:tls client sockets are not supported in OpenContainers V1"), {
      code: "ERR_OPENCONTAINERS_TLS_UNSUPPORTED"
    });
  },
  createSecureContext: () => ({}),
  rootCertificates: []
};

const inspectorBuiltin = {
  console: {},
  url: () => undefined,
  open() {
    throw unsupportedCoreOperation("inspector", "open");
  },
  close() {},
  waitForDebugger() {
    throw unsupportedCoreOperation("inspector", "waitForDebugger");
  },
  Session: class Session {
    connect() {
      throw unsupportedCoreOperation("inspector", "Session.connect");
    }

    connectToMainThread() {
      throw unsupportedCoreOperation("inspector", "Session.connectToMainThread");
    }

    post(_method, _params, callback) {
      const error = unsupportedCoreOperation("inspector", "Session.post");
      if (typeof callback === "function") {
        queueMicrotask(() => callback(error));
        return;
      }
      throw error;
    }

    disconnect() {}

    on() {
      return this;
    }

    once() {
      return this;
    }

    off() {
      return this;
    }

    emit() {
      return false;
    }
  }
};

const replBuiltin = {
  REPLServer: class REPLServer {},
  start() {
    throw unsupportedCoreOperation("repl", "start");
  },
  recoverable(error) {
    return Boolean(error && /Unexpected end of input|missing/i.test(String(error.message ?? error)));
  }
};

const traceEventsBuiltin = {
  createTracing() {
    return {
      categories: "",
      enabled: false,
      enable() {
        this.enabled = true;
      },
      disable() {
        this.enabled = false;
      }
    };
  },
  getEnabledCategories: () => ""
};

const wasiBuiltin = {
  WASI: class WASI {
    constructor() {
      throw unsupportedCoreOperation("wasi", "WASI");
    }
  }
};
inspectorBuiltin.default = inspectorBuiltin;
replBuiltin.default = replBuiltin;
traceEventsBuiltin.default = traceEventsBuiltin;
wasiBuiltin.default = wasiBuiltin;

function unsupportedCoreOperation(moduleName, operation) {
  return Object.assign(new Error(`node:${moduleName} ${operation} is not supported in OpenContainers V1`), {
    code: `ERR_OPENCONTAINERS_${moduleName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_UNSUPPORTED`
  });
}

function createRuntimeFetch({ kernel, process }) {
  return async function openContainersFetch(input, init = {}) {
    const request = normalizeFetchRequest(input, init);
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      if (typeof globalThis.fetch !== "function") throw new Error(`Unsupported fetch protocol: ${url.protocol}`);
      return globalThis.fetch(input, init);
    }

    if (isVirtualFetchHost(url.hostname)) {
      const response = await kernel.dispatchHttpRequest({
        id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2),
        projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
        port: Number(url.port) || 80,
        method: request.method,
        url: `${url.pathname}${url.search}`,
        headers: request.headers,
        body: request.body
      });
      return responseFromVirtual(response);
    }

    if (isHostPageOrigin(url)) {
      throw Object.assign(new Error(`Host application request blocked: ${url.href}`), {
        code: "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED"
      });
    }

    if (!isExternalNetworkAllowed(kernel, process, url)) {
      throw Object.assign(new Error(`External network request blocked: ${url.href}`), {
        code: "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED"
      });
    }

    if (typeof globalThis.fetch !== "function") {
      throw Object.assign(new Error("External fetch is unavailable in this browser runtime"), {
        code: "ERR_OPENCONTAINERS_EXTERNAL_FETCH_UNAVAILABLE"
      });
    }

    try {
      return await globalThis.fetch(url.href, createBrowserExternalFetchOptions(url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      }));
    } catch (error) {
      throw Object.assign(new Error(`External fetch failed for ${url.href}: ${error?.message ?? error}. Browser CORS and network restrictions still apply in OpenContainers.`), {
        code: "ERR_OPENCONTAINERS_EXTERNAL_FETCH_FAILED",
        cause: error
      });
    }
  };
}

function normalizeFetchRequest(input, init = {}) {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
  if (!url) throw new TypeError("fetch requires a URL");
  const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
  const headers = normalizeFetchHeaders(init.headers ?? input?.headers);
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : init.body ?? input?.body;
  return {
    url,
    method,
    headers,
    body: body === undefined ? undefined : bodyToUint8Array(body)
  };
}

function normalizeFetchHeaders(headers) {
  if (!headers) return [];
  if (typeof Headers !== "undefined" && headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers.map(([key, value]) => [String(key), String(value)]);
  return Object.entries(headers).map(([key, value]) => [key, String(value)]);
}

function bodyToUint8Array(body) {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof body === "string") return new TextEncoder().encode(body);
  return body;
}

function responseFromVirtual(response) {
  return new Response(response.body ?? "", {
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    headers: response.headers ?? []
  });
}

function isVirtualFetchHost(hostname) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(hostname);
}

function isHostPageOrigin(url) {
  const origin = globalThis.location?.origin;
  if (!origin || origin === "null") return false;
  try {
    return url.origin === new URL(origin).origin;
  } catch (_) {
    return false;
  }
}
