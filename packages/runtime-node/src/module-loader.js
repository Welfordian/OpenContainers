import { basename, dirname, joinPath, normalizePath, resolvePath } from "../../fs/src/path-utils.js";
import { createFsBuiltin } from "./builtins/fs.js";
import pathBuiltin from "./builtins/path.js";
import eventsBuiltin from "./builtins/events.js";
import streamBuiltin from "./builtins/stream.js";
import ttyBuiltin from "./builtins/tty.js";
import readlineBuiltin from "./builtins/readline.js";
import { createProcessBuiltin } from "./builtins/process.js";
import { createHttpBuiltin, createHttpsBuiltin } from "./builtins/http.js";
import { createNetBuiltin } from "./builtins/net.js";
import { createChildProcessBuiltin } from "./builtins/child_process.js";
import { RuntimeBuffer } from "./builtins/buffer.js";
import { createTimerApi } from "./builtins/timers.js";
import { createWorkerThreadsBuiltin } from "./builtins/worker_threads.js";
import { looksLikeEsm, transformEsmToCjs } from "./esm-transform.js";

const textDecoder = new TextDecoder();

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
  }

  createRequire(parentFilename = `${this.descriptor.cwd}/[repl].js`) {
    const require = (specifier) => this.require(specifier, parentFilename);
    require.resolve = (specifier) => this.resolve(specifier, parentFilename);
    require.cache = this.cache;
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

    const source = this.kernel.fs.readFileSync(resolved, "utf8");
    const executableSource = this.shouldTransformEsm(resolved, source)
      ? transformEsmToCjs(source, { filename: resolved })
      : source;
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

    const source = this.kernel.fs.readFileSync(resolved, "utf8");
    const executableSource = this.shouldTransformEsm(resolved, source)
      ? transformEsmToCjs(source, { filename: resolved })
      : source;
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
      this.fetch,
      (childSpecifier) => this.dynamicImport(childSpecifier, resolved)
    );
    return module.exports;
  }

  get process() {
    if (!this.#process) {
      this.#process = createProcessBuiltin({ descriptor: this.descriptor, kernel: this.kernel });
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
    if (!this.#timers) this.#timers = createTimerApi({ process: this.process });
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
    return {
      MessageChannel: this.workerThreads.MessageChannel,
      MessagePort: this.workerThreads.MessagePort
    };
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
    return [
      "fs",
      "fs/promises",
      "path",
      "process",
      "events",
      "stream",
      "buffer",
      "child_process",
      "http",
      "https",
      "net",
      "module",
      "os",
      "url",
      "util",
      "querystring",
      "crypto",
      "zlib",
      "tty",
      "readline",
      "timers",
      "timers/promises",
      "tls",
      "worker_threads"
    ].includes(name);
  }

  instantiateCoreModule(name) {
    if (name === "fs") return createFsBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "fs/promises") return createFsBuiltin({ kernel: this.kernel, process: this.process }).promises;
    if (name === "path") return pathBuiltin;
    if (name === "process") return this.process;
    if (name === "events") return eventsBuiltin;
    if (name === "stream") return streamBuiltin;
    if (name === "tty") return ttyBuiltin;
    if (name === "readline") return readlineBuiltin;
    if (name === "buffer") return { Buffer: RuntimeBuffer };
    if (name === "child_process") return createChildProcessBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "http") return createHttpBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "https") return createHttpsBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "net") return createNetBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "module") {
      return {
        createRequire: (filename) => this.createRequire(filename),
        builtinModules: [...this.coreModules.keys()]
      };
    }
    if (name === "os") {
      return {
        platform: () => "opencontainers",
        arch: () => "wasm",
        homedir: () => "/home/opencontainers",
        tmpdir: () => "/tmp",
        cpus: () => [{ model: "virtual", speed: 0 }],
        EOL: "\n"
      };
    }
    if (name === "url") return { URL, URLSearchParams, pathToFileURL: (path) => new URL(`file://${path}`) };
    if (name === "util") return createUtilBuiltin({ console: this.console, promisify: this.promisify });
    if (name === "querystring") return querystringBuiltin;
    if (name === "crypto") return this.createCryptoBuiltin();
    if (name === "zlib") return this.createZlibBuiltin();
    if (name === "timers") return this.timers.builtin;
    if (name === "timers/promises") return this.timers.promisesBuiltin;
    if (name === "tls") return tlsBuiltin;
    if (name === "worker_threads") return this.workerThreads;
    throw new Error(`Unsupported core module: ${name}`);
  }

  promisify(fn) {
    return (...args) => new Promise((resolve, reject) => {
      fn(...args, (error, value) => error ? reject(error) : resolve(value));
    });
  }

  dynamicImport(specifier, parentFilename) {
    this.process.__opencontainersAddRef?.();
    const promise = Promise.resolve().then(() => this.import(specifier, parentFilename));
    promise.finally(() => queueMicrotask(() => this.process.__opencontainersUnref?.()));
    return promise;
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
      this.fetch,
      (specifier) => this.dynamicImport(specifier, filename)
    );
    return module.exports;
  }

  createCryptoBuiltin() {
    const randomBytes = (size, callback) => {
      const bytes = new Uint8Array(size);
      globalThis.crypto?.getRandomValues?.(bytes);
      const buffer = RuntimeBuffer.from(bytes);
      if (typeof callback === "function") {
        this.process.__opencontainersAddRef?.();
        queueMicrotask(() => {
          try {
            if (this.process.__opencontainersIsAlive?.() !== false) callback(null, buffer);
          } catch (error) {
            this.process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
            this.process.exitCode = 1;
          } finally {
            this.process.__opencontainersUnref?.();
          }
        });
        return undefined;
      }
      return buffer;
    };
    return {
      randomUUID: () => globalThis.crypto?.randomUUID?.() ?? `opencontainers-${Math.random().toString(16).slice(2)}`,
      randomBytes,
      createHash: (algorithm) => {
        const chunks = [];
        return {
          update(chunk) {
            chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
            return this;
          },
          digest(encoding) {
            // Browser crypto hashing is async; this deterministic placeholder keeps sync APIs usable for early tooling tests.
            const total = chunks.reduce((sum, chunk) => sum + chunk.reduce((inner, byte) => (inner + byte) >>> 0, 0), 0);
            const pseudo = RuntimeBuffer.from(`${algorithm}:${total.toString(16).padStart(8, "0")}`);
            return encoding ? pseudo.toString(encoding) : pseudo;
          }
        };
      }
    };
  }

  createZlibBuiltin() {
    return {
      gzipSync: (input) => RuntimeBuffer.from(input),
      gunzipSync: (input) => RuntimeBuffer.from(input),
      createGzip: () => {
        throw Object.assign(new Error("zlib streams are not implemented yet"), { code: "ERR_OPENCONTAINERS_ZLIB_STREAM_UNSUPPORTED" });
      }
    };
  }

  resolve(specifier, parentFilename) {
    if (this.loadCoreModule(specifier)) return specifier;
    specifier = stripResourceQuery(specifier);
    const parentDirectory = parentFilename ? dirname(parentFilename) : this.descriptor.cwd;

    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
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
  return String(specifier).replace(/[?#].*$/, "");
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

function createUtilBuiltin({ console, promisify }) {
  const util = {
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
    inherits(constructor, superConstructor) {
      if (typeof constructor !== "function" || typeof superConstructor !== "function") {
        throw new TypeError("The constructor and super constructor must be functions");
      }
      constructor.super_ = superConstructor;
      Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
    },
    inspect,
    promisify,
    types: {
      isArrayBuffer: value => value instanceof ArrayBuffer,
      isAnyArrayBuffer: value => value instanceof ArrayBuffer || value instanceof SharedArrayBuffer,
      isAsyncFunction: value => value?.constructor?.name === "AsyncFunction",
      isDate: value => value instanceof Date,
      isMap: value => value instanceof Map,
      isNativeError: value => value instanceof Error,
      isPromise: value => value && typeof value.then === "function",
      isRegExp: value => value instanceof RegExp,
      isSet: value => value instanceof Set,
      isTypedArray: value => ArrayBuffer.isView(value) && !(value instanceof DataView),
      isUint8Array: value => value instanceof Uint8Array
    }
  };
  util.promisify.custom = Symbol.for("nodejs.util.promisify.custom");
  return util;
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

const querystringBuiltin = {
  decode: querystringParse,
  encode: querystringStringify,
  escape: encodeURIComponent,
  parse: querystringParse,
  stringify: querystringStringify,
  unescape: decodeURIComponent
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

    if (kernel.allowExternalNetwork !== true) {
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
      return await globalThis.fetch(input, init);
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
