import { dirname, isInsidePath, joinPath, normalizePath, resolvePath } from "../../fs/src/path-utils.js";
import { createFsBuiltin } from "./builtins/fs.js";
import pathBuiltin from "./builtins/path.js";
import eventsBuiltin, { createEventsBuiltin, EVENT_TARGET_LISTENERS_SYMBOL } from "./builtins/events.js";
import streamBuiltin, { promises as streamPromisesBuiltin } from "./builtins/stream.js";
import stringDecoderBuiltin from "./builtins/string_decoder.js";
import ttyBuiltin from "./builtins/tty.js";
import readlineBuiltin from "./builtins/readline.js";
import { createProcessBuiltin, installProcessDomainAccessor, OPENCONTAINERS_VERSIONS } from "./builtins/process.js";
import { createBrowserExternalFetchOptions, createHttpBuiltin, createHttpsBuiltin, isExternalNetworkAllowed } from "./builtins/http.js";
import { createHttp2Builtin } from "./builtins/http2.js";
import { createNetBuiltin } from "./builtins/net.js";
import { createDgramBuiltin } from "./builtins/dgram.js";
import { createDnsBuiltin } from "./builtins/dns.js";
import { createTlsBuiltin } from "./builtins/tls.js";
import { createChildProcessBuiltin } from "./builtins/child_process.js";
import { createClusterBuiltin } from "./builtins/cluster.js";
import { createCryptoBuiltin as createNodeCryptoBuiltin, DEFAULT_CORE_CIPHER_LIST, KEY_OBJECT_BRAND, OPENSSL_CONSTANTS } from "./builtins/crypto.js";
import { createVmBuiltin } from "./builtins/vm.js";
import { createZlibBuiltin } from "./builtins/zlib.js";
import { createAsyncContextManager, createAsyncHooksBuiltin } from "./builtins/async_hooks.js";
import bufferBuiltin, { RuntimeBuffer, atob as bufferAtob, btoa as bufferBtoa } from "./builtins/buffer.js";
import { createTimerApi } from "./builtins/timers.js";
import { createWorkerThreadsBuiltin } from "./builtins/worker_threads.js";
import { looksLikeEsm, transformEsmToCjs } from "./esm-transform.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const hostStructuredClone = globalThis.structuredClone;
const UTIL_PROMISIFY_CUSTOM = Symbol.for("nodejs.util.promisify.custom");
const UTIL_INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");
const PERFORMANCE_OBSERVER_MAYBE_BUFFER = Symbol("kMaybeBuffer");
const PERFORMANCE_OBSERVER_DISPATCH = Symbol("kDispatch");

const CORE_MODULES = Object.freeze([
  "_http_agent",
  "_http_client",
  "_http_common",
  "_http_incoming",
  "_http_outgoing",
  "_http_server",
  "_tls_common",
  "_tls_wrap",
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "inspector/promises",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "readline/promises",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
  "sea",
  "sqlite",
  "test",
  "test/reporters"
]);

const NODE_PREFIX_ONLY_CORE_MODULES = new Set([
  "sea",
  "sqlite",
  "test",
  "test/reporters"
]);

const CORE_MODULE_SET = new Set(CORE_MODULES);

const BUILTIN_MODULES = Object.freeze(CORE_MODULES.map((name) => (
  NODE_PREFIX_ONLY_CORE_MODULES.has(name) ? `node:${name}` : name
)));

const MODULE_EXPORT_ORDER = Object.freeze([
  "_cache",
  "_pathCache",
  "_extensions",
  "globalPaths",
  "isBuiltin",
  "_findPath",
  "_nodeModulePaths",
  "_resolveLookupPaths",
  "_load",
  "_resolveFilename",
  "createRequire",
  "_initPaths",
  "_preloadModules",
  "syncBuiltinESMExports",
  "Module",
  "registerHooks",
  "builtinModules",
  "runMain",
  "register",
  "constants",
  "enableCompileCache",
  "findPackageJSON",
  "flushCompileCache",
  "getCompileCacheDir",
  "stripTypeScriptTypes",
  "findSourceMap",
  "SourceMap",
  "getSourceMapsSupport",
  "setSourceMapsSupport"
]);

function isBuiltinSpecifier(specifier) {
  if (typeof specifier !== "string") return false;
  const raw = specifier;
  const hasNodePrefix = raw.startsWith("node:");
  const normalized = hasNodePrefix ? raw.slice(5) : raw;
  if (!CORE_MODULE_SET.has(normalized)) return false;
  if (NODE_PREFIX_ONLY_CORE_MODULES.has(normalized)) return hasNodePrefix;
  return true;
}

const MODULE_EXTENSIONS = {
  ".js": (module, filename) => {
    module._compile(module.__opencontainersReadSource(filename), filename);
  },
  ".json": (module, filename) => {
    module.exports = JSON.parse(module.__opencontainersReadSource(filename));
  },
  ".node": () => {
    throw Object.assign(new Error("Native addons are not supported in OpenContainers"), {
      code: "ERR_OPENCONTAINERS_NATIVE_ADDON_UNSUPPORTED"
    });
  }
};

const COMMONJS_HOOK_CONDITIONS = Object.freeze(["require", "node", "node-addons", "module-sync"]);
const IMPORT_HOOK_CONDITIONS = Object.freeze(["node", "import", "module-sync", "node-addons"]);
const moduleHookNextResults = new WeakSet();

export class ModuleResolutionError extends Error {
  constructor(specifier, fromPath) {
    super(`Cannot find module '${specifier}' from '${fromPath}'`);
    this.code = "MODULE_NOT_FOUND";
    this.specifier = specifier;
    this.fromPath = fromPath;
  }
}

function createUnknownBuiltinModuleError(specifier) {
  return Object.assign(new Error(`No such built-in module: ${specifier}`), {
    code: "ERR_UNKNOWN_BUILTIN_MODULE"
  });
}

function defineRuntimeGlobalAccessor(target, name, initialValue, {
  enumerable = false,
  getterName = "get",
  setterName = "set"
} = {}) {
  let currentValue = initialValue;
  const getter = function get() {
    return currentValue;
  };
  const setter = function set(value) {
    currentValue = value;
  };
  Object.defineProperty(getter, "name", { configurable: true, value: getterName });
  Object.defineProperty(setter, "name", { configurable: true, value: setterName });
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable,
    get: getter,
    set: setter
  });
}

export class PackagePathNotExportedError extends Error {
  constructor(packageName, subpath) {
    super(`Package subpath '${subpath}' is not defined by "exports" in ${packageName}`);
    this.name = "Error [ERR_PACKAGE_PATH_NOT_EXPORTED]";
    this.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
    this.packageName = packageName;
    this.subpath = subpath;
  }
}

export class PackageImportNotDefinedError extends Error {
  constructor(specifier, fromPath) {
    super(`Package import specifier '${specifier}' is not defined in package ${fromPath}`);
    this.name = "Error [ERR_PACKAGE_IMPORT_NOT_DEFINED]";
    this.code = "ERR_PACKAGE_IMPORT_NOT_DEFINED";
    this.specifier = specifier;
    this.fromPath = fromPath;
  }
}

export class InvalidPackageTargetError extends Error {
  constructor(packageName, subpath, target) {
    super(`Invalid "exports" target '${target}' defined for '${subpath}' in package ${packageName}`);
    this.name = "Error [ERR_INVALID_PACKAGE_TARGET]";
    this.code = "ERR_INVALID_PACKAGE_TARGET";
    this.packageName = packageName;
    this.subpath = subpath;
    this.target = target;
  }
}

export class InvalidPackageConfigError extends Error {
  constructor(packagePath) {
    super(`Invalid package config ${packagePath}. "exports" cannot contain some keys starting with '.' and some not. The exports object must either be an object of package subpath keys or an object of main entry condition name keys only.`);
    this.name = "Error [ERR_INVALID_PACKAGE_CONFIG]";
    this.code = "ERR_INVALID_PACKAGE_CONFIG";
    this.packagePath = packagePath;
  }
}

class OpenContainersEvent {
  constructor(type, init = {}) {
    this.type = String(type);
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.composed = Boolean(init.composed);
    this.defaultPrevented = false;
    this.eventPhase = 0;
    this.isTrusted = false;
    this.returnValue = true;
    this.timeStamp = Date.now();
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
      this.returnValue = false;
    }
  }

  stopImmediatePropagation() {}

  stopPropagation() {}

  composedPath() {
    return [];
  }
}

class OpenContainersEventTarget {
  constructor() {
    Object.defineProperty(this, EVENT_TARGET_LISTENERS_SYMBOL, {
      configurable: true,
      value: new Map()
    });
  }

  addEventListener(type, listener, options) {
    if (typeof listener !== "function" && typeof listener?.handleEvent !== "function") return;
    const key = String(type);
    const capture = normalizeEventListenerCapture(options);
    const listeners = this[EVENT_TARGET_LISTENERS_SYMBOL].get(key) ?? [];
    if (listeners.some((entry) => entry.listener === listener && entry.capture === capture)) return;
    listeners.push({
      capture,
      listener,
      once: normalizeEventListenerOnce(options)
    });
    this[EVENT_TARGET_LISTENERS_SYMBOL].set(key, listeners);
  }

  removeEventListener(type, listener, options) {
    const key = String(type);
    const listeners = this[EVENT_TARGET_LISTENERS_SYMBOL].get(key);
    if (!listeners) return;
    const capture = normalizeEventListenerCapture(options);
    const index = listeners.findIndex((entry) => entry.listener === listener && entry.capture === capture);
    if (index !== -1) listeners.splice(index, 1);
    if (listeners.length === 0) this[EVENT_TARGET_LISTENERS_SYMBOL].delete(key);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== "string") {
      throw new TypeError("Event object missing type");
    }
    defineEventDispatchTarget(event, this);
    const listeners = [...(this[EVENT_TARGET_LISTENERS_SYMBOL].get(event.type) ?? [])];
    for (const entry of listeners) {
      if (!hasEventListenerEntry(this, event.type, entry)) continue;
      if (entry.once) this.removeEventListener(event.type, entry.listener, { capture: entry.capture });
      if (typeof entry.listener === "function") entry.listener.call(this, event);
      else entry.listener.handleEvent(event);
    }
    return !event.defaultPrevented;
  }
}

Object.defineProperty(OpenContainersEventTarget, "name", {
  configurable: true,
  value: "EventTarget"
});

function normalizeEventListenerCapture(options) {
  if (typeof options === "boolean") return options;
  return Boolean(options?.capture);
}

function normalizeEventListenerOnce(options) {
  if (!options || typeof options === "boolean") return false;
  return Boolean(options.once);
}

function hasEventListenerEntry(target, type, selected) {
  const listeners = target[EVENT_TARGET_LISTENERS_SYMBOL].get(type) ?? [];
  return listeners.some((entry) => entry.listener === selected.listener && entry.capture === selected.capture);
}

function defineEventDispatchTarget(event, target) {
  for (const property of ["target", "currentTarget", "srcElement"]) {
    try {
      Object.defineProperty(event, property, {
        configurable: true,
        value: target
      });
    } catch {}
  }
}

function createOpenContainersCustomEvent(BaseEvent) {
  return class OpenContainersCustomEvent extends BaseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail ?? null;
    }
  };
}

function createOpenContainersMessageEvent(BaseEvent) {
  return class OpenContainersMessageEvent extends BaseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.data = init.data ?? null;
      this.origin = init.origin ?? "";
      this.lastEventId = init.lastEventId ?? "";
      this.source = init.source ?? null;
      this.ports = Array.isArray(init.ports) ? [...init.ports] : [];
    }
  };
}

const DOM_EXCEPTION_CONSTANTS = Object.freeze([
  ["INDEX_SIZE_ERR", "IndexSizeError", 1],
  ["DOMSTRING_SIZE_ERR", "DOMStringSizeError", 2],
  ["HIERARCHY_REQUEST_ERR", "HierarchyRequestError", 3],
  ["WRONG_DOCUMENT_ERR", "WrongDocumentError", 4],
  ["INVALID_CHARACTER_ERR", "InvalidCharacterError", 5],
  ["NO_DATA_ALLOWED_ERR", "NoDataAllowedError", 6],
  ["NO_MODIFICATION_ALLOWED_ERR", "NoModificationAllowedError", 7],
  ["NOT_FOUND_ERR", "NotFoundError", 8],
  ["NOT_SUPPORTED_ERR", "NotSupportedError", 9],
  ["INUSE_ATTRIBUTE_ERR", "InUseAttributeError", 10],
  ["INVALID_STATE_ERR", "InvalidStateError", 11],
  ["SYNTAX_ERR", "SyntaxError", 12],
  ["INVALID_MODIFICATION_ERR", "InvalidModificationError", 13],
  ["NAMESPACE_ERR", "NamespaceError", 14],
  ["INVALID_ACCESS_ERR", "InvalidAccessError", 15],
  ["VALIDATION_ERR", "ValidationError", 16],
  ["TYPE_MISMATCH_ERR", "TypeMismatchError", 17],
  ["SECURITY_ERR", "SecurityError", 18],
  ["NETWORK_ERR", "NetworkError", 19],
  ["ABORT_ERR", "AbortError", 20],
  ["URL_MISMATCH_ERR", "URLMismatchError", 21],
  ["QUOTA_EXCEEDED_ERR", "QuotaExceededError", 22],
  ["TIMEOUT_ERR", "TimeoutError", 23],
  ["INVALID_NODE_TYPE_ERR", "InvalidNodeTypeError", 24],
  ["DATA_CLONE_ERR", "DataCloneError", 25]
]);

const DOM_EXCEPTION_CODES = new Map(DOM_EXCEPTION_CONSTANTS.map(([, name, code]) => [name, code]));

class OpenContainersDOMException extends Error {
  #name;
  #message;

  constructor(message = "", name = "Error") {
    super(String(message));
    this.#name = String(name);
    this.#message = String(message);
    delete this.message;
  }

  get name() {
    return this.#name;
  }

  get message() {
    return this.#message;
  }

  get code() {
    return DOM_EXCEPTION_CODES.get(this.#name) ?? 0;
  }
}

Object.defineProperty(OpenContainersDOMException, "name", {
  configurable: true,
  value: "DOMException"
});

for (const [constant, , code] of DOM_EXCEPTION_CONSTANTS) {
  Object.defineProperty(OpenContainersDOMException, constant, {
    enumerable: true,
    value: code
  });
  Object.defineProperty(OpenContainersDOMException.prototype, constant, {
    enumerable: true,
    value: code
  });
}

for (const property of ["name", "message", "code"]) {
  const descriptor = Object.getOwnPropertyDescriptor(OpenContainersDOMException.prototype, property);
  Object.defineProperty(OpenContainersDOMException.prototype, property, {
    ...descriptor,
    enumerable: true
  });
}

Object.defineProperty(OpenContainersDOMException.prototype, Symbol.toStringTag, {
  configurable: true,
  value: "DOMException"
});

const OPENCONTAINERS_BROADCAST_CHANNELS = new Map();

class OpenContainersBroadcastChannel extends OpenContainersEventTarget {
  #closed = false;

  constructor(name) {
    super();
    this.name = String(name);
    this.onmessage = null;
    this.onmessageerror = null;
    const channels = OPENCONTAINERS_BROADCAST_CHANNELS.get(this.name) ?? new Set();
    channels.add(this);
    OPENCONTAINERS_BROADCAST_CHANNELS.set(this.name, channels);
  }

  postMessage(message) {
    if (this.#closed) {
      throw new OpenContainersDOMException("BroadcastChannel is closed.", "InvalidStateError");
    }

    let messageData;
    try {
      messageData = globalThis.structuredClone?.(message) ?? structuredCloneFallback(message);
    } catch (error) {
      this.#dispatchMessageError(error);
      return;
    }

    const channels = OPENCONTAINERS_BROADCAST_CHANNELS.get(this.name) ?? new Set();
    const recipients = [...channels].filter((channel) => channel !== this && !channel.#closed);
    const BaseEvent = globalThis.Event ?? OpenContainersEvent;
    const MessageEventCtor = globalThis.MessageEvent ?? createOpenContainersMessageEvent(BaseEvent);
    const schedule = typeof globalThis.queueMicrotask === "function"
      ? globalThis.queueMicrotask.bind(globalThis)
      : (task) => Promise.resolve().then(task);

    for (const recipient of recipients) {
      const data = globalThis.structuredClone?.(messageData) ?? structuredCloneFallback(messageData);
      schedule(() => recipient.#dispatchMessage(data, MessageEventCtor));
    }
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    const channels = OPENCONTAINERS_BROADCAST_CHANNELS.get(this.name);
    channels?.delete(this);
    if (channels?.size === 0) OPENCONTAINERS_BROADCAST_CHANNELS.delete(this.name);
  }

  #dispatchMessage(data, MessageEventCtor) {
    if (this.#closed) return;
    const event = new MessageEventCtor("message", {
      data,
      origin: "opencontainers://"
    });
    try {
      if (typeof this.onmessage === "function") this.onmessage.call(this, event);
      this.dispatchEvent(event);
    } catch {
      // Browser event handlers report async listener errors to the host page.
      // OpenContainers keeps user-code listener errors inside the virtual runtime boundary.
    }
  }

  #dispatchMessageError(error) {
    const BaseEvent = globalThis.Event ?? OpenContainersEvent;
    const MessageEventCtor = globalThis.MessageEvent ?? createOpenContainersMessageEvent(BaseEvent);
    const event = new MessageEventCtor("messageerror", {
      data: error,
      origin: "opencontainers://"
    });
    if (typeof this.onmessageerror === "function") this.onmessageerror.call(this, event);
    this.dispatchEvent(event);
  }
}

class OpenContainersByteLengthQueuingStrategy {
  constructor(init = {}) {
    this.highWaterMark = Number(init.highWaterMark);
  }

  size(chunk) {
    return Number(chunk?.byteLength ?? chunk?.length ?? 1);
  }
}

class OpenContainersCountQueuingStrategy {
  constructor(init = {}) {
    this.highWaterMark = Number(init.highWaterMark);
  }

  size() {
    return 1;
  }
}

class OpenContainersReadableStreamDefaultController {
  constructor(stream) {
    this.#stream = stream;
  }

  #stream;

  get desiredSize() {
    return this.#stream.__desiredSize();
  }

  close() {
    this.#stream.__close();
  }

  enqueue(chunk) {
    this.#stream.__enqueue(chunk);
  }

  error(error) {
    this.#stream.__error(error);
  }
}

class OpenContainersReadableStreamBYOBRequest {
  constructor(controller, view = undefined) {
    this.#controller = controller;
    this.view = view;
  }

  #controller;
  #responded = false;

  respond(bytesWritten) {
    this.#assertUnresponded();
    this.#responded = true;
    this.#controller.__respondByob(bytesWritten, this.view);
  }

  respondWithNewView(view) {
    this.#assertUnresponded();
    this.#responded = true;
    this.view = view;
    this.#controller.__respondByob(view?.byteLength ?? 0, view);
  }

  #assertUnresponded() {
    if (this.#responded) {
      throw Object.assign(new TypeError("BYOB request has already been responded to"), {
        code: "ERR_INVALID_STATE"
      });
    }
  }
}

class OpenContainersReadableByteStreamController extends OpenContainersReadableStreamDefaultController {
  constructor(stream) {
    super(stream);
    this.#stream = stream;
  }

  #byobRequest = null;
  #stream;

  get byobRequest() {
    return this.#byobRequest;
  }

  __clearByobRequest() {
    this.#byobRequest = null;
  }

  __respondByob(bytesWritten, view) {
    this.#stream.__respondByob(bytesWritten, view);
  }

  __setByobRequest(view) {
    this.#byobRequest = new OpenContainersReadableStreamBYOBRequest(this, view);
  }
}

class OpenContainersReadableStreamDefaultReader {
  constructor(stream) {
    if (stream.locked) {
      throw Object.assign(new TypeError("ReadableStream is locked"), {
        code: "ERR_INVALID_STATE"
      });
    }
    this.#stream = stream;
    stream.__lock();
    this.closed = stream.__closedPromise;
  }

  #stream;

  cancel(reason) {
    return this.#stream?.cancel(reason) ?? Promise.resolve();
  }

  read() {
    if (!this.#stream) {
      return Promise.reject(Object.assign(new TypeError("Reader has been released"), {
        code: "ERR_INVALID_STATE"
      }));
    }
    return this.#stream.__read();
  }

  releaseLock() {
    this.#stream?.__unlock();
    this.#stream = null;
  }
}

class OpenContainersReadableStreamBYOBReader extends OpenContainersReadableStreamDefaultReader {
  constructor(stream) {
    if (!stream.__isByteStream()) {
      throw Object.assign(new TypeError("Cannot get a BYOB reader for a non-byte stream"), {
        code: "ERR_INVALID_STATE"
      });
    }
    super(stream);
    this.#byteStream = stream;
  }

  #byteStream;

  async read(view) {
    if (!this.#byteStream) {
      return Promise.reject(Object.assign(new TypeError("Reader has been released"), {
        code: "ERR_INVALID_STATE"
      }));
    }
    return this.#byteStream.__readInto(view);
  }

  releaseLock() {
    this.#byteStream = null;
    super.releaseLock();
  }
}

class OpenContainersReadableStream {
  constructor(source = {}, strategy = {}) {
    this.#source = source ?? {};
    this.#isByteStream = this.#source.type === "bytes";
    const normalizedStrategy = strategy ?? {};
    this.#highWaterMark = normalizeReadableStreamHighWaterMark(
      normalizedStrategy.highWaterMark,
      this.#isByteStream ? 0 : 1
    );
    this.#sizeAlgorithm = typeof normalizedStrategy.size === "function"
      ? normalizedStrategy.size
      : (chunk) => this.#isByteStream ? readableByteStreamChunkSize(chunk) : 1;
    this.#controller = this.#isByteStream
      ? new OpenContainersReadableByteStreamController(this)
      : new OpenContainersReadableStreamDefaultController(this);
    Promise.resolve(this.#source.start?.(this.#controller)).catch((error) => this.__error(error));
  }

  #closed = false;
  #closedReject;
  #closedResolve;
  #controller;
  #errored = null;
  #highWaterMark = 1;
  #isByteStream = false;
  #locked = false;
  #pendingByob = null;
  #pulling = false;
  #queue = [];
  #queueTotalSize = 0;
  #readWaiters = [];
  #sizeAlgorithm;
  #source;

  __closedPromise = new Promise((resolve, reject) => {
    this.#closedResolve = resolve;
    this.#closedReject = reject;
  });

  get locked() {
    return this.#locked;
  }

  cancel(reason) {
    if (!this.#closed) this.__close();
    if (typeof this.#source.cancel === "function") {
      return Promise.resolve(this.#source.cancel(reason));
    }
    return Promise.resolve();
  }

  getReader(options = {}) {
    return options?.mode === "byob"
      ? new OpenContainersReadableStreamBYOBReader(this)
      : new OpenContainersReadableStreamDefaultReader(this);
  }

  pipeThrough(transform, options) {
    this.pipeTo(transform.writable, options).catch(() => {});
    return transform.readable;
  }

  async pipeTo(writable) {
    const reader = this.getReader();
    const writer = writable.getWriter();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (error) {
      await writer.abort?.(error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  tee() {
    const chunks = [];
    const first = new OpenContainersReadableStream({
      start: async (controller) => {
        for await (const chunk of this) {
          chunks.push(chunk);
          controller.enqueue(chunk);
        }
        controller.close();
      }
    });
    const second = new OpenContainersReadableStream({
      start: async (controller) => {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      }
    });
    return [first, second];
  }

  [Symbol.asyncIterator]() {
    const reader = this.getReader();
    return {
      async next() {
        return reader.read();
      },
      async return() {
        reader.releaseLock();
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }

  __close() {
    if (this.#closed || this.#errored) return;
    this.#closed = true;
    this.#closedResolve?.();
    if (this.#pendingByob) {
      this.#pendingByob.resolve({ done: true, value: undefined });
      this.#clearPendingByob();
    }
    while (this.#readWaiters.length) {
      this.#readWaiters.shift().resolve({ done: true, value: undefined });
    }
  }

  __enqueue(chunk) {
    if (this.#closed || this.#errored) {
      throw Object.assign(new TypeError("ReadableStream is closed"), {
        code: "ERR_INVALID_STATE"
      });
    }
    if (this.#pendingByob) {
      this.#resolvePendingByobFromChunk(chunk);
      return;
    }
    const waiter = this.#readWaiters.shift();
    if (waiter) waiter.resolve({ done: false, value: chunk });
    else this.#enqueueChunk(chunk);
  }

  __error(error) {
    if (this.#closed || this.#errored) return;
    this.#errored = error;
    this.#closedReject?.(error);
    if (this.#pendingByob) {
      this.#pendingByob.reject(error);
      this.#clearPendingByob();
    }
    while (this.#readWaiters.length) {
      this.#readWaiters.shift().reject(error);
    }
  }

  __desiredSize() {
    return this.#highWaterMark - this.#queueTotalSize;
  }

  __isByteStream() {
    return this.#isByteStream;
  }

  __lock() {
    this.#locked = true;
  }

  __unlock() {
    this.#locked = false;
  }

  async __read() {
    if (this.#queue.length) return { done: false, value: this.#dequeueChunk() };
    if (this.#errored) throw this.#errored;
    if (this.#closed) return { done: true, value: undefined };
    await this.#pull();
    if (this.#queue.length) return { done: false, value: this.#dequeueChunk() };
    if (this.#errored) throw this.#errored;
    if (this.#closed) return { done: true, value: undefined };
    return new Promise((resolve, reject) => this.#readWaiters.push({ resolve, reject }));
  }

  async __readInto(view) {
    this.#assertByobView(view);
    if (this.#queue.length) return this.#readIntoView(view, this.#dequeueChunk());
    if (this.#errored) throw this.#errored;
    if (this.#closed) return { done: true, value: undefined };

    return new Promise((resolve, reject) => {
      this.#pendingByob = { view, resolve, reject };
      this.#controller.__setByobRequest(view);
      Promise.resolve(this.#pull())
        .then(() => {
          if (!this.#pendingByob) return;
          if (this.#queue.length) {
            this.#resolvePendingByobFromChunk(this.#dequeueChunk());
            return;
          }
          if (this.#errored) {
            reject(this.#errored);
            this.#clearPendingByob();
            return;
          }
          if (this.#closed) {
            resolve({ done: true, value: undefined });
            this.#clearPendingByob();
          }
        })
        .catch((error) => {
          if (this.#pendingByob) {
            reject(error);
            this.#clearPendingByob();
          }
        });
    });
  }

  __respondByob(bytesWritten, view) {
    if (!this.#pendingByob) return;
    const targetView = view ?? this.#pendingByob.view;
    this.#assertByobView(targetView);
    const byteLength = Number(bytesWritten);
    if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > targetView.byteLength) {
      throw Object.assign(new RangeError("Invalid BYOB byte length"), {
        code: "ERR_INVALID_ARG_VALUE"
      });
    }
    this.#pendingByob.resolve({
      done: false,
      value: sliceByobView(targetView, byteLength)
    });
    this.#clearPendingByob();
  }

  async #pull() {
    if (this.#pulling || typeof this.#source.pull !== "function") return;
    this.#pulling = true;
    try {
      await this.#source.pull(this.#controller);
    } catch (error) {
      this.__error(error);
    } finally {
      this.#pulling = false;
    }
  }

  #assertByobView(view) {
    if (!ArrayBuffer.isView(view)) {
      throw Object.assign(new TypeError("BYOB read requires an ArrayBuffer view"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    if (view.byteLength === 0) {
      throw Object.assign(new TypeError("BYOB read view must not be empty"), {
        code: "ERR_INVALID_STATE"
      });
    }
  }

  #clearPendingByob() {
    this.#pendingByob = null;
    this.#controller.__clearByobRequest?.();
  }

  #dequeueChunk() {
    const record = this.#queue.shift();
    if (!record) return undefined;
    this.#queueTotalSize = Math.max(0, this.#queueTotalSize - record.size);
    return record.chunk;
  }

  #enqueueChunk(chunk, front = false) {
    const record = {
      chunk,
      size: this.#sizeForChunk(chunk)
    };
    this.#queueTotalSize += record.size;
    if (front) this.#queue.unshift(record);
    else this.#queue.push(record);
  }

  #readIntoView(view, chunk) {
    const source = chunk instanceof Uint8Array ? chunk : new Uint8Array(RuntimeBuffer.from(chunk));
    const target = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const length = Math.min(source.byteLength, target.byteLength);
    target.set(source.subarray(0, length));
    if (source.byteLength > length) this.#enqueueChunk(source.subarray(length), true);
    return {
      done: false,
      value: sliceByobView(view, length)
    };
  }

  #sizeForChunk(chunk) {
    const size = Number(this.#sizeAlgorithm(chunk));
    return Number.isFinite(size) && size >= 0 ? size : 0;
  }

  #resolvePendingByobFromChunk(chunk) {
    const pending = this.#pendingByob;
    if (!pending) return;
    try {
      pending.resolve(this.#readIntoView(pending.view, chunk));
    } catch (error) {
      pending.reject(error);
    } finally {
      this.#clearPendingByob();
    }
  }
}

function normalizeReadableStreamHighWaterMark(value, fallback) {
  if (value === undefined) return fallback;
  const highWaterMark = Number(value);
  return Number.isFinite(highWaterMark) && highWaterMark >= 0 ? highWaterMark : fallback;
}

function readableByteStreamChunkSize(chunk) {
  return Number(chunk?.byteLength ?? chunk?.length ?? 1);
}

function sliceByobView(view, byteLength) {
  const source = view instanceof DataView
    ? new Uint8Array(view.buffer, view.byteOffset, byteLength)
    : new Uint8Array(view.buffer, view.byteOffset, byteLength);
  const detachedCopy = new Uint8Array(byteLength);
  detachedCopy.set(source);
  detachByobBuffer(view.buffer);

  if (view instanceof DataView) {
    return new DataView(detachedCopy.buffer, 0, byteLength);
  }
  if (typeof view.constructor === "function" && view.constructor.BYTES_PER_ELEMENT && byteLength % view.constructor.BYTES_PER_ELEMENT === 0) {
    return new view.constructor(detachedCopy.buffer, 0, byteLength / view.constructor.BYTES_PER_ELEMENT);
  }
  return detachedCopy;
}

function detachByobBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return;
  if (buffer.byteLength === 0 || typeof hostStructuredClone !== "function") return;
  try {
    hostStructuredClone(buffer, { transfer: [buffer] });
  } catch {
    // Older browsers may lack transferable structuredClone; keep the bytes readable.
  }
}

class OpenContainersWritableStreamDefaultController {
  constructor(stream) {
    this.#stream = stream;
  }

  #stream;

  error(error) {
    this.#stream.__error(error);
  }
}

class OpenContainersWritableStreamDefaultWriter {
  constructor(stream) {
    if (stream.locked) {
      throw Object.assign(new TypeError("WritableStream is locked"), {
        code: "ERR_INVALID_STATE"
      });
    }
    this.#stream = stream;
    stream.__lock();
    this.ready = Promise.resolve();
    this.closed = stream.__closedPromise;
  }

  #stream;

  abort(reason) {
    return this.#stream?.abort(reason) ?? Promise.resolve();
  }

  close() {
    return this.#stream?.__close() ?? Promise.resolve();
  }

  releaseLock() {
    this.#stream?.__unlock();
    this.#stream = null;
  }

  write(chunk) {
    if (!this.#stream) {
      return Promise.reject(Object.assign(new TypeError("Writer has been released"), {
        code: "ERR_INVALID_STATE"
      }));
    }
    return this.#stream.__write(chunk);
  }
}

class OpenContainersWritableStream {
  constructor(sink = {}) {
    this.#sink = sink ?? {};
    this.#controller = new OpenContainersWritableStreamDefaultController(this);
    this.#ready = Promise.resolve(this.#sink.start?.(this.#controller));
  }

  #closed = false;
  #closedReject;
  #closedResolve;
  #controller;
  #errored = null;
  #locked = false;
  #ready;
  #sink;

  __closedPromise = new Promise((resolve, reject) => {
    this.#closedResolve = resolve;
    this.#closedReject = reject;
  });

  get locked() {
    return this.#locked;
  }

  abort(reason) {
    this.__error(reason);
    return Promise.resolve(this.#sink.abort?.(reason));
  }

  getWriter() {
    return new OpenContainersWritableStreamDefaultWriter(this);
  }

  __error(error) {
    if (this.#closed || this.#errored) return;
    this.#errored = error;
    this.#closedReject?.(error);
  }

  __lock() {
    this.#locked = true;
  }

  __unlock() {
    this.#locked = false;
  }

  async __close() {
    await this.#ready;
    if (this.#closed) return;
    if (this.#errored) throw this.#errored;
    await this.#sink.close?.();
    this.#closed = true;
    this.#closedResolve?.();
  }

  async __write(chunk) {
    await this.#ready;
    if (this.#errored) throw this.#errored;
    if (this.#closed) {
      throw Object.assign(new TypeError("WritableStream is closed"), {
        code: "ERR_INVALID_STATE"
      });
    }
    await this.#sink.write?.(chunk, this.#controller);
  }
}

class OpenContainersTransformStreamDefaultController {
  constructor(readableController) {
    this.#readableController = readableController;
  }

  #readableController;

  get desiredSize() {
    return this.#readableController.desiredSize;
  }

  enqueue(chunk) {
    this.#readableController.enqueue(chunk);
  }

  error(error) {
    this.#readableController.error(error);
  }

  terminate() {
    this.#readableController.close();
  }
}

class OpenContainersTransformStream {
  constructor(transformer = {}) {
    let controller;
    this.readable = new OpenContainersReadableStream({
      start(readableController) {
        controller = new OpenContainersTransformStreamDefaultController(readableController);
      }
    });
    this.writable = new OpenContainersWritableStream({
      start: () => transformer.start?.(controller),
      write: (chunk) => transformer.transform ? transformer.transform(chunk, controller) : controller.enqueue(chunk),
      close: async () => {
        await transformer.flush?.(controller);
        controller.terminate();
      },
      abort: (reason) => controller.error(reason)
    });
  }
}

alignWebStreamConstructorMetadata();

function alignWebStreamConstructorMetadata() {
  const metadata = new Map([
    [OpenContainersReadableStream, ["ReadableStream", 0]],
    [OpenContainersReadableStreamDefaultReader, ["ReadableStreamDefaultReader", 1]],
    [OpenContainersReadableStreamBYOBReader, ["ReadableStreamBYOBReader", 1]],
    [OpenContainersReadableStreamBYOBRequest, ["ReadableStreamBYOBRequest", 0]],
    [OpenContainersReadableByteStreamController, ["ReadableByteStreamController", 0]],
    [OpenContainersReadableStreamDefaultController, ["ReadableStreamDefaultController", 0]],
    [OpenContainersTransformStream, ["TransformStream", 0]],
    [OpenContainersTransformStreamDefaultController, ["TransformStreamDefaultController", 0]],
    [OpenContainersWritableStream, ["WritableStream", 0]],
    [OpenContainersWritableStreamDefaultWriter, ["WritableStreamDefaultWriter", 1]],
    [OpenContainersWritableStreamDefaultController, ["WritableStreamDefaultController", 0]]
  ]);
  for (const [constructor, [name, length]] of metadata) {
    Object.defineProperty(constructor, "name", {
      configurable: true,
      value: name
    });
    Object.defineProperty(constructor, "length", {
      configurable: true,
      value: length
    });
  }
}

function getWebStreamConstructors() {
  return {
    ReadableStream: globalThis.ReadableStream ?? OpenContainersReadableStream,
    ReadableStreamDefaultReader: globalThis.ReadableStreamDefaultReader ?? OpenContainersReadableStreamDefaultReader,
    ReadableStreamBYOBReader: globalThis.ReadableStreamBYOBReader ?? OpenContainersReadableStreamBYOBReader,
    ReadableStreamBYOBRequest: globalThis.ReadableStreamBYOBRequest ?? OpenContainersReadableStreamBYOBRequest,
    ReadableByteStreamController: globalThis.ReadableByteStreamController ?? OpenContainersReadableByteStreamController,
    ReadableStreamDefaultController: globalThis.ReadableStreamDefaultController ?? OpenContainersReadableStreamDefaultController,
    TransformStream: globalThis.TransformStream ?? OpenContainersTransformStream,
    TransformStreamDefaultController: globalThis.TransformStreamDefaultController ?? OpenContainersTransformStreamDefaultController,
    WritableStream: globalThis.WritableStream ?? OpenContainersWritableStream,
    WritableStreamDefaultWriter: globalThis.WritableStreamDefaultWriter ?? OpenContainersWritableStreamDefaultWriter,
    WritableStreamDefaultController: globalThis.WritableStreamDefaultController ?? OpenContainersWritableStreamDefaultController,
  };
}

class OpenContainersTextEncoderStream {
  constructor() {
    const encoder = new TextEncoder();
    const { TransformStream } = getWebStreamConstructors();
    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(String(chunk)));
      }
    });
    this.encoding = "utf-8";
    this.readable = transform.readable;
    this.writable = transform.writable;
  }
}

class OpenContainersTextDecoderStream {
  constructor(label = "utf-8", options = {}) {
    const decoder = new TextDecoder(label, options);
    const { TransformStream } = getWebStreamConstructors();
    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(decoder.decode(chunk, { stream: true }));
      },
      flush(controller) {
        const tail = decoder.decode();
        if (tail) controller.enqueue(tail);
      }
    });
    this.encoding = decoder.encoding;
    this.fatal = decoder.fatal;
    this.ignoreBOM = decoder.ignoreBOM;
    this.readable = transform.readable;
    this.writable = transform.writable;
  }
}

const OPENCONTAINERS_PERFORMANCE_INTERNAL = Symbol("OpenContainersPerformanceInternal");
const OPENCONTAINERS_PERFORMANCE_ENTRY_STATE = new WeakMap();
const OPENCONTAINERS_PERFORMANCE_DETAIL = new WeakMap();
const OPENCONTAINERS_PERFORMANCE_NODE_TIMING_STATE = new WeakMap();
const OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE = new WeakMap();

function createIllegalConstructorError() {
  return Object.assign(new TypeError("Illegal constructor"), {
    code: "ERR_ILLEGAL_CONSTRUCTOR"
  });
}

class OpenContainersPerformanceEntry {
  constructor({ name = "", entryType = "", startTime = 0, duration = 0 } = {}, token) {
    if (token !== OPENCONTAINERS_PERFORMANCE_INTERNAL) throw createIllegalConstructorError();
    OPENCONTAINERS_PERFORMANCE_ENTRY_STATE.set(this, {
      name: String(name),
      entryType: String(entryType),
      startTime: Number(startTime),
      duration: Number(duration)
    });
  }

  get name() {
    return OPENCONTAINERS_PERFORMANCE_ENTRY_STATE.get(this)?.name ?? "";
  }

  get entryType() {
    return OPENCONTAINERS_PERFORMANCE_ENTRY_STATE.get(this)?.entryType ?? "";
  }

  get startTime() {
    return OPENCONTAINERS_PERFORMANCE_ENTRY_STATE.get(this)?.startTime ?? 0;
  }

  get duration() {
    return OPENCONTAINERS_PERFORMANCE_ENTRY_STATE.get(this)?.duration ?? 0;
  }

  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration
    };
  }
}

class OpenContainersPerformanceMark extends OpenContainersPerformanceEntry {
  constructor(name, options = {}) {
    super({
      name,
      entryType: "mark",
      startTime: options.startTime ?? 0,
      duration: 0
    }, OPENCONTAINERS_PERFORMANCE_INTERNAL);
    OPENCONTAINERS_PERFORMANCE_DETAIL.set(this, options.detail ?? null);
  }

  get detail() {
    return OPENCONTAINERS_PERFORMANCE_DETAIL.get(this) ?? null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      detail: this.detail
    };
  }
}

class OpenContainersPerformanceMeasure extends OpenContainersPerformanceEntry {
  constructor(name, startTime = 0, duration = 0, detail = null, token) {
    if (token !== OPENCONTAINERS_PERFORMANCE_INTERNAL) throw createIllegalConstructorError();
    super({ name, entryType: "measure", startTime, duration }, token);
    OPENCONTAINERS_PERFORMANCE_DETAIL.set(this, detail);
  }

  get detail() {
    return OPENCONTAINERS_PERFORMANCE_DETAIL.get(this) ?? null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      detail: this.detail
    };
  }
}

class OpenContainersPerformanceFunctionEntry extends OpenContainersPerformanceEntry {
  constructor(name, startTime = 0, duration = 0, detail = []) {
    super({ name, entryType: "function", startTime, duration }, OPENCONTAINERS_PERFORMANCE_INTERNAL);
    this.detail = detail;
  }
}

class OpenContainersPerformanceNodeTiming extends OpenContainersPerformanceEntry {
  constructor(performance = null) {
    const now = typeof performance?.now === "function" ? () => performance.now() : performanceNow;
    super({
      name: "node",
      entryType: "node",
      startTime: 0,
      duration: now()
    }, OPENCONTAINERS_PERFORMANCE_INTERNAL);
    OPENCONTAINERS_PERFORMANCE_NODE_TIMING_STATE.set(this, {
      bootstrapComplete: now(),
      environment: 0,
      idleTime: 0,
      loopExit: -1,
      loopStart: -1,
      nodeStart: 0,
      now,
      uvMetricsInfo: {
        events: 0,
        eventsWaiting: 0,
        loopCount: 0
      },
      v8Start: 0
    });
    Object.defineProperties(this, {
      name: {
        configurable: true,
        enumerable: true,
        value: "node",
        writable: false
      },
      entryType: {
        configurable: true,
        enumerable: true,
        value: "node",
        writable: false
      },
      startTime: {
        configurable: true,
        enumerable: true,
        value: 0,
        writable: false
      },
      duration: createPerformanceNodeTimingAccessor("duration", "now"),
      nodeStart: createPerformanceNodeTimingAccessor("nodeStart"),
      v8Start: createPerformanceNodeTimingAccessor("v8Start"),
      environment: createPerformanceNodeTimingAccessor("environment"),
      loopStart: createPerformanceNodeTimingAccessor("loopStart"),
      loopExit: createPerformanceNodeTimingAccessor("loopExit"),
      bootstrapComplete: createPerformanceNodeTimingAccessor("bootstrapComplete"),
      idleTime: createPerformanceNodeTimingAccessor("idleTime", "loopIdleTime"),
      uvMetricsInfo: createPerformanceNodeTimingAccessor("uvMetricsInfo")
    });
  }

  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      nodeStart: this.nodeStart,
      v8Start: this.v8Start,
      bootstrapComplete: this.bootstrapComplete,
      environment: this.environment,
      loopStart: this.loopStart,
      loopExit: this.loopExit,
      idleTime: this.idleTime
    };
  }
}

function createPerformanceNodeTimingAccessor(name, getterName = "get") {
  const descriptor = Object.getOwnPropertyDescriptor({
    get value() {
      const state = OPENCONTAINERS_PERFORMANCE_NODE_TIMING_STATE.get(this);
      if (!state) return undefined;
      if (name === "duration") return state.now();
      if (name === "uvMetricsInfo") return { ...state.uvMetricsInfo };
      return state[name];
    }
  }, "value");
  Object.defineProperty(descriptor.get, "name", {
    configurable: true,
    value: getterName
  });
  return {
    configurable: true,
    enumerable: true,
    get: descriptor.get
  };
}

class OpenContainersPerformanceResourceTiming extends OpenContainersPerformanceEntry {
  constructor(options = {}, token) {
    if (token !== OPENCONTAINERS_PERFORMANCE_INTERNAL) throw createIllegalConstructorError();
    super({
      name: options.name,
      entryType: "resource",
      startTime: options.startTime,
      duration: options.duration
    }, token);
    OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.set(this, {
      initiatorType: options.initiatorType,
      workerStart: options.workerStart,
      redirectStart: options.redirectStart,
      redirectEnd: options.redirectEnd,
      fetchStart: options.fetchStart,
      domainLookupStart: options.domainLookupStart,
      domainLookupEnd: options.domainLookupEnd,
      connectStart: options.connectStart,
      connectEnd: options.connectEnd,
      secureConnectionStart: options.secureConnectionStart,
      nextHopProtocol: options.nextHopProtocol,
      requestStart: options.requestStart,
      responseStart: options.responseStart,
      responseEnd: options.responseEnd,
      encodedBodySize: options.encodedBodySize,
      decodedBodySize: options.decodedBodySize,
      transferSize: options.transferSize,
      deliveryType: options.deliveryType,
      responseStatus: options.responseStatus
    });
  }

  get name() {
    return super.name;
  }

  get startTime() {
    return super.startTime;
  }

  get duration() {
    return super.duration;
  }

  get initiatorType() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.initiatorType;
  }

  get workerStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.workerStart;
  }

  get redirectStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.redirectStart;
  }

  get redirectEnd() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.redirectEnd;
  }

  get fetchStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.fetchStart;
  }

  get domainLookupStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.domainLookupStart;
  }

  get domainLookupEnd() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.domainLookupEnd;
  }

  get connectStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.connectStart;
  }

  get connectEnd() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.connectEnd;
  }

  get secureConnectionStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.secureConnectionStart;
  }

  get nextHopProtocol() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.nextHopProtocol;
  }

  get requestStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.requestStart;
  }

  get responseStart() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.responseStart;
  }

  get responseEnd() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.responseEnd;
  }

  get encodedBodySize() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.encodedBodySize;
  }

  get decodedBodySize() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.decodedBodySize;
  }

  get transferSize() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.transferSize;
  }

  get deliveryType() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.deliveryType;
  }

  get responseStatus() {
    return OPENCONTAINERS_PERFORMANCE_RESOURCE_STATE.get(this)?.responseStatus;
  }

  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      initiatorType: this.initiatorType,
      nextHopProtocol: this.nextHopProtocol,
      workerStart: this.workerStart,
      redirectStart: this.redirectStart,
      redirectEnd: this.redirectEnd,
      fetchStart: this.fetchStart,
      domainLookupStart: this.domainLookupStart,
      domainLookupEnd: this.domainLookupEnd,
      connectStart: this.connectStart,
      connectEnd: this.connectEnd,
      secureConnectionStart: this.secureConnectionStart,
      requestStart: this.requestStart,
      responseStart: this.responseStart,
      responseEnd: this.responseEnd,
      transferSize: this.transferSize,
      encodedBodySize: this.encodedBodySize,
      decodedBodySize: this.decodedBodySize,
      deliveryType: this.deliveryType,
      responseStatus: this.responseStatus
    };
  }
}

const OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_LIST_ENTRIES = new WeakMap();

class OpenContainersPerformanceObserverEntryList {
  constructor(entries = [], token) {
    if (token !== OPENCONTAINERS_PERFORMANCE_INTERNAL) throw createIllegalConstructorError();
    OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_LIST_ENTRIES.set(this, entries);
  }

  getEntries() {
    return [...getPerformanceObserverEntryListEntries(this)];
  }

  getEntriesByName(name, type) {
    return getPerformanceObserverEntryListEntries(this).filter((entry) => entry.name === name && (type === undefined || entry.entryType === type));
  }

  getEntriesByType(type) {
    return getPerformanceObserverEntryListEntries(this).filter((entry) => entry.entryType === type);
  }
}

const OPENCONTAINERS_PERFORMANCE_ENTRIES = [];
const OPENCONTAINERS_PERFORMANCE_OBSERVERS = new Set();
let openContainersPerformanceResourceTimingBufferSize = 250;
let openContainersPerformanceResourceTimingBufferFullScheduled = false;
let openContainersPerformanceResourceTimingBufferTarget = null;
const OPENCONTAINERS_HISTOGRAM_EMPTY_MIN = 9223372036854776000;
const OPENCONTAINERS_HISTOGRAM_EMPTY_MIN_BIGINT = 9223372036854775807n;
const OPENCONTAINERS_PERFORMANCE_OBSERVER_CALLBACK = new WeakMap();
const OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_TYPES = new WeakMap();
const OPENCONTAINERS_PERFORMANCE_OBSERVER_RECORDS = new WeakMap();
const OPENCONTAINERS_PERFORMANCE_OBSERVER_SCHEDULED = new WeakMap();

class OpenContainersPerformanceObserver {
  static get supportedEntryTypes() {
    return ["dns", "function", "gc", "http", "http2", "mark", "measure", "net", "quic", "resource"];
  }

  constructor(callback) {
    if (typeof callback !== "function") throw createInvalidArgTypeError("callback", "function", callback);
    OPENCONTAINERS_PERFORMANCE_OBSERVER_CALLBACK.set(this, callback);
    OPENCONTAINERS_PERFORMANCE_OBSERVER_RECORDS.set(this, []);
    OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_TYPES.set(this, new Set());
    OPENCONTAINERS_PERFORMANCE_OBSERVER_SCHEDULED.set(this, false);
  }

  observe(options = {}) {
    const entryTypes = normalizePerformanceObserverEntryTypes(options);
    OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_TYPES.set(this, entryTypes);
    OPENCONTAINERS_PERFORMANCE_OBSERVERS.add(this);

    if (options?.buffered) {
      const records = getPerformanceObserverRecords(this);
      for (const entry of OPENCONTAINERS_PERFORMANCE_ENTRIES) {
        if (performanceObserverAccepts(this, entry)) records.push(entry);
      }
      schedulePerformanceObserver(this);
    }
  }

  disconnect() {
    OPENCONTAINERS_PERFORMANCE_OBSERVER_RECORDS.set(this, []);
    OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_TYPES.set(this, new Set());
    OPENCONTAINERS_PERFORMANCE_OBSERVER_SCHEDULED.set(this, false);
    OPENCONTAINERS_PERFORMANCE_OBSERVERS.delete(this);
  }

  takeRecords() {
    const records = getPerformanceObserverRecords(this);
    OPENCONTAINERS_PERFORMANCE_OBSERVER_RECORDS.set(this, []);
    return records;
  }
}

function getPerformanceObserverEntryListEntries(list) {
  return OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_LIST_ENTRIES.get(list) ?? [];
}

function getPerformanceObserverRecords(observer) {
  return OPENCONTAINERS_PERFORMANCE_OBSERVER_RECORDS.get(observer) ?? [];
}

function performanceObserverAccepts(observer, entry) {
  return OPENCONTAINERS_PERFORMANCE_OBSERVER_ENTRY_TYPES.get(observer)?.has(entry.entryType) ?? false;
}

function enqueuePerformanceObserver(observer, entry) {
  getPerformanceObserverRecords(observer).push(entry);
  schedulePerformanceObserver(observer);
}

function schedulePerformanceObserver(observer) {
  if (OPENCONTAINERS_PERFORMANCE_OBSERVER_SCHEDULED.get(observer) || getPerformanceObserverRecords(observer).length === 0) return;
  OPENCONTAINERS_PERFORMANCE_OBSERVER_SCHEDULED.set(observer, true);
  queueMicrotask(() => {
    OPENCONTAINERS_PERFORMANCE_OBSERVER_SCHEDULED.set(observer, false);
    const records = observer.takeRecords();
    if (records.length === 0) return;
    OPENCONTAINERS_PERFORMANCE_OBSERVER_CALLBACK.get(observer)?.(new OpenContainersPerformanceObserverEntryList(records, OPENCONTAINERS_PERFORMANCE_INTERNAL), observer);
  });
}

const PERF_HOOKS_PERFORMANCE_STATE = new WeakMap();
let defaultPerfHooksPerformance = null;

function PerfHooksPerformance() {
  throw createIllegalConstructorError();
}

Object.defineProperty(PerfHooksPerformance, "name", {
  configurable: true,
  value: "Performance"
});
Object.defineProperty(PerfHooksPerformance, "prototype", {
  writable: false
});

alignPerformanceConstructorMetadata();
alignPerformancePrototypeMetadata();

function alignPerformanceConstructorMetadata() {
  const metadata = new Map([
    [OpenContainersPerformanceEntry, ["PerformanceEntry", 0]],
    [OpenContainersPerformanceMark, ["PerformanceMark", 1]],
    [OpenContainersPerformanceMeasure, ["PerformanceMeasure", 0]],
    [OpenContainersPerformanceNodeTiming, ["PerformanceNodeTiming", 0]],
    [OpenContainersPerformanceObserver, ["PerformanceObserver", 1]],
    [OpenContainersPerformanceObserverEntryList, ["PerformanceObserverEntryList", 0]],
    [OpenContainersPerformanceResourceTiming, ["PerformanceResourceTiming", 0]]
  ]);
  for (const [constructor, [name, length]] of metadata) {
    Object.defineProperty(constructor, "name", {
      configurable: true,
      value: name
    });
    Object.defineProperty(constructor, "length", {
      configurable: true,
      value: length
    });
  }
}

function alignPerformancePrototypeMetadata() {
  defineEnumerablePrototypeAccessors(OpenContainersPerformanceEntry.prototype, [
    "name",
    "entryType",
    "startTime",
    "duration"
  ]);
  defineEnumerablePrototypeMethods(OpenContainersPerformanceEntry.prototype, [
    ["toJSON"]
  ]);
  defineEnumerablePrototypeAccessors(OpenContainersPerformanceMark.prototype, [
    "detail"
  ]);
  defineEnumerablePrototypeAccessors(OpenContainersPerformanceMeasure.prototype, [
    "detail"
  ]);
  defineEnumerablePrototypeAccessors(OpenContainersPerformanceResourceTiming.prototype, [
    "initiatorType",
    "workerStart",
    "redirectStart",
    "redirectEnd",
    "fetchStart",
    "domainLookupStart",
    "domainLookupEnd",
    "connectStart",
    "connectEnd",
    "secureConnectionStart",
    "nextHopProtocol",
    "requestStart",
    "responseStart",
    "responseEnd",
    "encodedBodySize",
    "decodedBodySize",
    "transferSize",
    "deliveryType",
    "responseStatus"
  ]);
  defineEnumerablePrototypeMethods(OpenContainersPerformanceResourceTiming.prototype, [
    ["toJSON"]
  ]);
  defineEnumerablePrototypeMethods(OpenContainersPerformanceObserver.prototype, [
    ["observe"],
    ["disconnect"],
    ["takeRecords"]
  ]);
  defineEnumerablePrototypeMethods(OpenContainersPerformanceObserverEntryList.prototype, [
    ["getEntries"],
    ["getEntriesByType"],
    ["getEntriesByName", 1]
  ]);
  definePerfHooksPerformancePrototypeMetadata();
  definePerfHooksSymbolMetadata();
}

function definePerfHooksSymbolMetadata() {
  const performanceCustomInspect = {
    [UTIL_INSPECT_CUSTOM](_depth, options) {
      const inspect = arguments[2];
      return `Performance ${inspect({ nodeTiming: this.nodeTiming, timeOrigin: this.timeOrigin }, options)}`;
    }
  }[UTIL_INSPECT_CUSTOM];
  const observerMaybeBuffer = {
    [PERFORMANCE_OBSERVER_MAYBE_BUFFER](_entry) {}
  }[PERFORMANCE_OBSERVER_MAYBE_BUFFER];
  const observerDispatch = {
    [PERFORMANCE_OBSERVER_DISPATCH]() {}
  }[PERFORMANCE_OBSERVER_DISPATCH];
  const observerCustomInspect = {
    [UTIL_INSPECT_CUSTOM](_depth, _options) {
      return "PerformanceObserver { connected: false, pending: false, entryTypes: [], buffer: [] }";
    }
  }[UTIL_INSPECT_CUSTOM];
  Object.defineProperties(PerfHooksPerformance.prototype, {
    [UTIL_INSPECT_CUSTOM]: {
      configurable: true,
      enumerable: false,
      writable: true,
      value: performanceCustomInspect
    },
    [Symbol.toStringTag]: {
      configurable: true,
      enumerable: false,
      writable: false,
      value: "Performance"
    }
  });
  Object.defineProperties(OpenContainersPerformanceObserver.prototype, {
    [PERFORMANCE_OBSERVER_MAYBE_BUFFER]: {
      configurable: true,
      enumerable: false,
      writable: true,
      value: observerMaybeBuffer
    },
    [PERFORMANCE_OBSERVER_DISPATCH]: {
      configurable: true,
      enumerable: false,
      writable: true,
      value: observerDispatch
    },
    [UTIL_INSPECT_CUSTOM]: {
      configurable: true,
      enumerable: false,
      writable: true,
      value: observerCustomInspect
    },
    [Symbol.toStringTag]: {
      configurable: true,
      enumerable: false,
      writable: false,
      value: "PerformanceObserver"
    }
  });
}

function defineEnumerablePrototypeAccessors(prototype, names) {
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) continue;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      enumerable: true
    });
  }
}

function defineEnumerablePrototypeMethods(prototype, methods) {
  const descriptors = methods.map(([name, length]) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    return [name, { ...descriptor, enumerable: true }, length];
  });
  for (const [name] of descriptors) {
    delete prototype[name];
  }
  for (const [name, descriptor, length] of descriptors) {
    Object.defineProperty(prototype, name, descriptor);
    if (length !== undefined) {
      Object.defineProperty(prototype[name], "length", {
        configurable: true,
        value: length
      });
    }
  }
}

function definePerfHooksPerformancePrototypeMetadata() {
  const enumerableMethods = {
    clearMarks(name = undefined) {
      removePerformanceEntries(OPENCONTAINERS_PERFORMANCE_ENTRIES, "mark", name);
    },
    clearMeasures(name = undefined) {
      removePerformanceEntries(OPENCONTAINERS_PERFORMANCE_ENTRIES, "measure", name);
    },
    clearResourceTimings() {
      removePerformanceEntries(OPENCONTAINERS_PERFORMANCE_ENTRIES, "resource");
      openContainersPerformanceResourceTimingBufferFullScheduled = false;
    },
    getEntries() {
      return [...OPENCONTAINERS_PERFORMANCE_ENTRIES];
    },
    getEntriesByName(name, type = undefined) {
      return OPENCONTAINERS_PERFORMANCE_ENTRIES.filter((entry) => entry.name === name && (type === undefined || entry.entryType === type));
    },
    getEntriesByType(type) {
      return OPENCONTAINERS_PERFORMANCE_ENTRIES.filter((entry) => entry.entryType === type);
    },
    mark(name, options = {}) {
      return createPerformanceMarkEntry(OPENCONTAINERS_PERFORMANCE_ENTRIES, () => this.now(), arguments.length, name, options);
    },
    measure(name, startOrOptions = undefined, endMark = undefined) {
      return createPerformanceMeasureEntry(OPENCONTAINERS_PERFORMANCE_ENTRIES, () => this.now(), arguments.length, name, startOrOptions, endMark);
    },
    now() {
      const { nowSource } = getPerfHooksPerformanceState(this);
      return nowSource.now.call(nowSource);
    },
    setResourceTimingBufferSize(maxSize) {
      openContainersPerformanceResourceTimingBufferSize = normalizeResourceTimingBufferSize(maxSize);
    },
    toJSON() {
      return {
        nodeTiming: this.nodeTiming,
        timeOrigin: this.timeOrigin,
        eventLoopUtilization: this.eventLoopUtilization()
      };
    }
  };
  const timeOriginAccessor = Object.getOwnPropertyDescriptor({
    get timeOrigin() {
      return getPerfHooksPerformanceState(this).timeOrigin;
    }
  }, "timeOrigin");
  Object.defineProperties(PerfHooksPerformance.prototype, {
    constructor: {
      configurable: true,
      enumerable: false,
      writable: true,
      value: PerfHooksPerformance
    },
    clearMarks: createPerformancePrototypeValueDescriptor(enumerableMethods.clearMarks, true),
    clearMeasures: createPerformancePrototypeValueDescriptor(enumerableMethods.clearMeasures, true),
    clearResourceTimings: createPerformancePrototypeValueDescriptor(enumerableMethods.clearResourceTimings, true),
    getEntries: createPerformancePrototypeValueDescriptor(enumerableMethods.getEntries, true),
    getEntriesByName: createPerformancePrototypeValueDescriptor(enumerableMethods.getEntriesByName, true),
    getEntriesByType: createPerformancePrototypeValueDescriptor(enumerableMethods.getEntriesByType, true),
    mark: createPerformancePrototypeValueDescriptor(enumerableMethods.mark, true),
    measure: createPerformancePrototypeValueDescriptor(enumerableMethods.measure, true),
    now: createPerformancePrototypeValueDescriptor(enumerableMethods.now, true),
    setResourceTimingBufferSize: createPerformancePrototypeValueDescriptor(enumerableMethods.setResourceTimingBufferSize, true),
    timeOrigin: {
      configurable: true,
      enumerable: true,
      get: timeOriginAccessor.get
    },
    toJSON: createPerformancePrototypeValueDescriptor(enumerableMethods.toJSON, true),
    eventLoopUtilization: createPerformancePrototypeValueDescriptor(performanceEventLoopUtilization, false),
    nodeTiming: createPerformancePrototypeValueDescriptor(undefined, false),
    markResourceTiming: createPerformancePrototypeValueDescriptor(performanceMarkResourceTiming, false),
    timerify: createPerformancePrototypeValueDescriptor(timerify, false),
    onresourcetimingbufferfull: {
      configurable: true,
      enumerable: true,
      get: performanceGetResourceTimingBufferFull,
      set: performanceSetResourceTimingBufferFull
    }
  });
}

function createPerformancePrototypeValueDescriptor(value, enumerable) {
  return {
    configurable: true,
    enumerable,
    writable: true,
    value
  };
}

function getPerfHooksPerformanceState(performance) {
  const state = PERF_HOOKS_PERFORMANCE_STATE.get(performance);
  if (!state) {
    throw Object.assign(new TypeError('Value of "this" must be of type Performance'), {
      code: "ERR_INVALID_THIS"
    });
  }
  return state;
}

function performanceEventLoopUtilization(previous, comparison) {
  const state = PERF_HOOKS_PERFORMANCE_STATE.get(this)
    ?? PERF_HOOKS_PERFORMANCE_STATE.get(this?.performance)
    ?? PERF_HOOKS_PERFORMANCE_STATE.get(defaultPerfHooksPerformance);
  if (!state) return getPerfHooksPerformanceState(this).eventLoopUtilization(previous, comparison);
  return state.eventLoopUtilization(previous, comparison);
}

Object.defineProperty(performanceEventLoopUtilization, "name", {
  configurable: true,
  value: "eventLoopUtilization"
});

function performanceMarkResourceTiming(timingInfo, requestedUrl, initiatorType, _global, cacheMode, _bodyInfo, responseStatus, deliveryType = "") {
  const resourceTiming = createPerformanceResourceTimingEntry({
    timingInfo,
    requestedUrl,
    initiatorType,
    cacheMode,
    responseStatus,
    deliveryType
  });
  recordPerformanceEntry(resourceTiming, this);
  return resourceTiming;
}

Object.defineProperty(performanceMarkResourceTiming, "name", {
  configurable: true,
  value: "markResourceTiming"
});

function performanceGetResourceTimingBufferFull() {
  return getPerfHooksPerformanceState(this).resourceTimingBufferFullHandler;
}

Object.defineProperty(performanceGetResourceTimingBufferFull, "name", {
  configurable: true,
  value: "get onresourcetimingbufferfull"
});

function performanceSetResourceTimingBufferFull(handler) {
  getPerfHooksPerformanceState(this).resourceTimingBufferFullHandler = handler;
}

Object.defineProperty(performanceSetResourceTimingBufferFull, "name", {
  configurable: true,
  value: "set onresourcetimingbufferfull"
});

const OPENCONTAINERS_HISTOGRAM_VALUES = new WeakMap();
const OPENCONTAINERS_HISTOGRAM_LAST_RECORD_TIME = new WeakMap();
const OPENCONTAINERS_ELD_STATE = new WeakMap();

class OpenContainersHistogramReadout {
  constructor() {
    resetHistogramState(this);
  }

  get count() {
    return histogramValues(this).length;
  }

  get countBigInt() {
    return BigInt(this.count);
  }

  get min() {
    const values = histogramValues(this);
    return values.length ? Math.min(...values) : OPENCONTAINERS_HISTOGRAM_EMPTY_MIN;
  }

  get minBigInt() {
    return this.count ? BigInt(this.min) : OPENCONTAINERS_HISTOGRAM_EMPTY_MIN_BIGINT;
  }

  get max() {
    const values = histogramValues(this);
    return values.length ? Math.max(...values) : 0;
  }

  get maxBigInt() {
    return BigInt(this.max);
  }

  get mean() {
    const values = histogramValues(this);
    if (!values.length) return Number.NaN;
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  get exceeds() {
    return 0;
  }

  get exceedsBigInt() {
    return 0n;
  }

  get stddev() {
    const values = histogramValues(this);
    if (!values.length) return Number.NaN;
    const mean = this.mean;
    const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  get percentiles() {
    const values = histogramValues(this);
    const percentiles = new Map();
    if (!values.length) {
      percentiles.set(100, 0);
      return percentiles;
    }
    percentiles.set(0, this.percentile(0));
    percentiles.set(50, this.percentile(50));
    percentiles.set(75, this.percentile(75));
    if (values.length > 2) percentiles.set(87.5, this.percentile(87.5));
    percentiles.set(100, this.percentile(100));
    return percentiles;
  }

  get percentilesBigInt() {
    return new Map([...this.percentiles].map(([key, value]) => [key, BigInt(value)]));
  }

  reset() {
    resetHistogramState(this);
  }

  percentile(percentile) {
    const values = histogramValues(this);
    if (!values.length) return 0;
    const normalized = Number(percentile);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
      throw Object.assign(new RangeError("percentile must be between 0 and 100"), {
        code: "ERR_OUT_OF_RANGE"
      });
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.ceil((normalized / 100) * sorted.length) - 1);
    return sorted[Math.max(0, index)];
  }

  percentileBigInt(percentile) {
    return BigInt(this.percentile(percentile));
  }

  toJSON() {
    return {
      count: this.count,
      min: this.min,
      max: this.max,
      mean: this.mean,
      exceeds: this.exceeds,
      stddev: this.stddev,
      percentiles: Object.fromEntries([...this.percentiles].map(([key, value]) => [String(key), value])),
    };
  }
}

class ELDHistogram extends OpenContainersHistogramReadout {
  constructor(options = {}) {
    super();
    OPENCONTAINERS_ELD_STATE.set(this, {
      enabled: false,
      expected: 0,
      resolution: options.resolution ?? 10,
      timer: undefined
    });
  }

  enable() {
    const state = OPENCONTAINERS_ELD_STATE.get(this);
    if (state.enabled) return false;
    state.enabled = true;
    OPENCONTAINERS_HISTOGRAM_LAST_RECORD_TIME.set(this, performanceNow());
    scheduleEventLoopDelaySample(this, state);
    return true;
  }

  disable() {
    const state = OPENCONTAINERS_ELD_STATE.get(this);
    if (!state.enabled) return false;
    state.enabled = false;
    if (state.timer !== undefined) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    return true;
  }
}

class OpenContainersHistogram extends OpenContainersHistogramReadout {
  constructor() {
    super();
    Object.defineProperty(this, "constructor", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: OpenContainersHistogram
    });
  }

  record(value) {
    if (typeof value !== "number" && typeof value !== "bigint") {
      throw Object.assign(new TypeError("histogram value must be a number or bigint"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 1 || Math.trunc(normalized) !== normalized) {
      throw Object.assign(new RangeError("histogram value must be a positive integer"), {
        code: "ERR_OUT_OF_RANGE"
      });
    }
    histogramValues(this).push(Math.trunc(normalized));
  }

  recordDelta() {
    const now = performanceNow();
    const previous = OPENCONTAINERS_HISTOGRAM_LAST_RECORD_TIME.get(this) ?? now;
    OPENCONTAINERS_HISTOGRAM_LAST_RECORD_TIME.set(this, now);
    this.record(Math.max(1, Math.round((now - previous) * 1e6)));
  }

  add(other) {
    if (!(other instanceof OpenContainersHistogram)) {
      throw Object.assign(new TypeError("histogram argument must be a Histogram"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    histogramValues(this).push(...histogramValues(other));
  }
}

alignHistogramMetadata();

function alignHistogramMetadata() {
  Object.defineProperty(OpenContainersHistogramReadout, "name", {
    configurable: true,
    value: "Histogram"
  });
  Object.defineProperty(OpenContainersHistogram, "name", {
    configurable: true,
    value: "RecordableHistogram"
  });
  reorderHistogramPrototype(OpenContainersHistogramReadout.prototype, [
    "constructor",
    "count",
    "countBigInt",
    "min",
    "minBigInt",
    "max",
    "maxBigInt",
    "mean",
    "exceeds",
    "exceedsBigInt",
    "stddev",
    "percentile",
    "percentileBigInt",
    "percentiles",
    "percentilesBigInt",
    "reset",
    "toJSON"
  ]);
  const eventLoopDelayDispose = {
    [Symbol.dispose]() {
      this.disable();
    }
  }[Symbol.dispose];
  Object.defineProperty(ELDHistogram.prototype, Symbol.dispose, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: eventLoopDelayDispose
  });
}

function reorderHistogramPrototype(prototype, names) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(prototype, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete prototype[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(prototype, name, descriptor);
  }
}

function histogramValues(histogram) {
  let values = OPENCONTAINERS_HISTOGRAM_VALUES.get(histogram);
  if (!values) {
    values = [];
    OPENCONTAINERS_HISTOGRAM_VALUES.set(histogram, values);
  }
  return values;
}

function resetHistogramState(histogram) {
  OPENCONTAINERS_HISTOGRAM_VALUES.set(histogram, []);
  OPENCONTAINERS_HISTOGRAM_LAST_RECORD_TIME.set(histogram, undefined);
}

function scheduleEventLoopDelaySample(histogram, state) {
  state.expected = performanceNow() + state.resolution;
  state.timer = setTimeout(() => {
    if (!state.enabled) return;
    const now = performanceNow();
    const delay = Math.max(0, Math.trunc((now - state.expected) * 1_000_000));
    histogramValues(histogram).push(delay);
    scheduleEventLoopDelaySample(histogram, state);
  }, state.resolution);
  state.timer?.unref?.();
}

function createRuntimePerformance() {
  const origin = Date.now();
  const entries = OPENCONTAINERS_PERFORMANCE_ENTRIES;
  const performance = {
    timeOrigin: origin,
    now: () => Date.now() - origin,
    mark(name, options = {}) {
      return createPerformanceMarkEntry(entries, () => performance.now(), arguments.length, name, options);
    },
    measure(name, startOrOptions = undefined, endMark = undefined) {
      return createPerformanceMeasureEntry(entries, () => performance.now(), arguments.length, name, startOrOptions, endMark);
    },
    getEntries: () => [...entries],
    getEntriesByName: (name, type) => entries.filter((entry) => entry.name === name && (type === undefined || entry.entryType === type)),
    getEntriesByType: (type) => entries.filter((entry) => entry.entryType === type),
    clearMarks(name) {
      removePerformanceEntries(entries, "mark", name);
    },
    clearMeasures(name) {
      removePerformanceEntries(entries, "measure", name);
    },
    eventLoopUtilization: createEventLoopUtilization(origin)
  };
  return performance;
}

function createPerfHooksPerformance() {
  resetPerfHooksProcessState();
  const base = globalThis.performance ?? createRuntimePerformance();
  const fallback = createRuntimePerformance();
  const performance = Object.create(PerfHooksPerformance.prototype);
  const timeOrigin = Number(base.timeOrigin ?? fallback.timeOrigin);
  const nowSource = typeof base.now === "function" ? base : fallback;
  const state = {
    eventLoopUtilization: createEventLoopUtilization(timeOrigin),
    nodeTiming: null,
    nowSource,
    resourceTimingBufferFullHandler: null,
    timeOrigin
  };
  PERF_HOOKS_PERFORMANCE_STATE.set(performance, state);
  defaultPerfHooksPerformance = performance;
  state.nodeTiming = createPerformanceNodeTiming(performance);
  Object.defineProperty(PerfHooksPerformance.prototype, "nodeTiming", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: state.nodeTiming
  });
  openContainersPerformanceResourceTimingBufferTarget = performance;
  return performance;
}

function resetPerfHooksProcessState() {
  OPENCONTAINERS_PERFORMANCE_ENTRIES.length = 0;
  OPENCONTAINERS_PERFORMANCE_OBSERVERS.clear();
  openContainersPerformanceResourceTimingBufferSize = 250;
  openContainersPerformanceResourceTimingBufferFullScheduled = false;
  openContainersPerformanceResourceTimingBufferTarget = null;
}

function definePerformanceShimProperty(performance, name, value) {
  Object.defineProperty(performance, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value
  });
}

function createEventLoopUtilization(origin = Date.now()) {
  const baseline = Number.isFinite(Number(origin)) ? Number(origin) : Date.now();
  return function eventLoopUtilization(previous, comparison) {
    const active = Math.max(0, Date.now() - baseline);
    const current = { idle: 0, active, utilization: active > 0 ? 1 : 0 };
    if (previous && typeof previous === "object" && comparison && typeof comparison === "object") {
      return createEventLoopUtilizationDelta(previous, comparison);
    }
    if (previous && typeof previous === "object") {
      return createEventLoopUtilizationDelta(current, previous);
    }
    return current;
  };
}

function createEventLoopUtilizationDelta(current, previous) {
  const idle = Number(current.idle ?? 0) - Number(previous.idle ?? 0);
  const active = Number(current.active ?? 0) - Number(previous.active ?? 0);
  const total = idle + active;
  return {
    idle,
    active,
    utilization: total === 0 ? 0 : active / total
  };
}

function createPerformanceNodeTiming(performance) {
  return new OpenContainersPerformanceNodeTiming(performance);
}

function normalizePerformanceObserverEntryTypes(options = {}) {
  if (options === null || typeof options !== "object") {
    throw createInvalidArgTypeError("options", "object", options);
  }
  if (options.type !== undefined && options.entryTypes !== undefined) {
    throw createPerformanceObserverEntryTypesConflictError(options.entryTypes);
  }
  if (options.entryTypes !== undefined && !Array.isArray(options.entryTypes)) {
    throw createPerformanceObserverEntryTypesTypeError(options.entryTypes);
  }
  if (Array.isArray(options.entryTypes)) {
    const entryTypes = options.entryTypes.map((entryType) => String(entryType));
    return new Set(entryTypes.filter((entryType) => OpenContainersPerformanceObserver.supportedEntryTypes.includes(entryType)));
  }
  if (options.type !== undefined) {
    const entryType = String(options.type);
    return new Set(OpenContainersPerformanceObserver.supportedEntryTypes.includes(entryType) ? [entryType] : []);
  }
  throw Object.assign(new TypeError('The "options.entryTypes" and "options.type" arguments must be specified'), {
    code: "ERR_MISSING_ARGS"
  });
}

function createPerformanceObserverEntryTypesTypeError(value) {
  const received = typeof value === "string"
    ? `type string (${formatInvalidReceived(value)})`
    : describeReceived(value);
  const error = new TypeError(`The "options.entryTypes" property must be string[]. Received ${received}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createPerformanceObserverEntryTypesConflictError(value) {
  const received = Array.isArray(value)
    ? `[ ${value.map((entry) => formatInvalidReceived(entry)).join(", ")} ]`
    : formatInvalidReceived(value);
  const error = new TypeError(`The property 'options.entryTypes' options.entryTypes can not set with options.type together. Received ${received}`);
  error.code = "ERR_INVALID_ARG_VALUE";
  return error;
}

function createPerformanceResourceTimingEntry({ timingInfo, requestedUrl, initiatorType, cacheMode, responseStatus, deliveryType }) {
  const timing = timingInfo && typeof timingInfo === "object" ? timingInfo : {};
  const connectionTiming = timing.finalConnectionTimingInfo && typeof timing.finalConnectionTimingInfo === "object"
    ? timing.finalConnectionTimingInfo
    : {};
  const startTime = numberOrUndefined(timing.startTime);
  const responseEnd = numberOrUndefined(timing.endTime ?? timing.responseEnd);
  const encodedBodySize = numberOrUndefined(timing.encodedBodySize);
  const decodedBodySize = numberOrUndefined(timing.decodedBodySize);
  const transferSize = String(cacheMode ?? "") === "local" ? 0 : encodedBodySize + 300;
  return new OpenContainersPerformanceResourceTiming({
    name: String(requestedUrl),
    startTime,
    duration: responseEnd - startTime,
    initiatorType: initiatorType === undefined ? undefined : String(initiatorType),
    workerStart: numberOrUndefined(timing.finalServiceWorkerStartTime ?? timing.workerStart),
    redirectStart: numberOrUndefined(timing.redirectStartTime ?? timing.redirectStart),
    redirectEnd: numberOrUndefined(timing.redirectEndTime ?? timing.redirectEnd),
    fetchStart: numberOrUndefined(timing.postRedirectStartTime ?? timing.fetchStart),
    domainLookupStart: numberOrUndefined(connectionTiming.domainLookupStartTime ?? timing.domainLookupStart),
    domainLookupEnd: numberOrUndefined(connectionTiming.domainLookupEndTime ?? timing.domainLookupEnd),
    connectStart: numberOrUndefined(connectionTiming.connectionStartTime ?? timing.connectStart),
    connectEnd: numberOrUndefined(connectionTiming.connectionEndTime ?? timing.connectEnd),
    secureConnectionStart: numberOrUndefined(connectionTiming.secureConnectionStartTime ?? timing.secureConnectionStart),
    nextHopProtocol: connectionTiming.ALPNNegotiatedProtocol === undefined ? undefined : String(connectionTiming.ALPNNegotiatedProtocol),
    requestStart: numberOrUndefined(timing.finalNetworkRequestStartTime ?? timing.requestStart),
    responseStart: numberOrUndefined(timing.finalNetworkResponseStartTime ?? timing.responseStart),
    responseEnd,
    encodedBodySize,
    decodedBodySize,
    transferSize,
    deliveryType: deliveryType === undefined ? "" : String(deliveryType),
    responseStatus: Number(responseStatus ?? 0)
  }, OPENCONTAINERS_PERFORMANCE_INTERNAL);
}

function numberOrUndefined(value) {
  return value === undefined ? undefined : Number(value);
}

function normalizeResourceTimingBufferSize(value) {
  if (value === undefined) {
    throw Object.assign(new TypeError('The "maxSize" argument must be specified'), {
      code: "ERR_MISSING_ARGS"
    });
  }
  return Number(value) >>> 0;
}

function shouldRecordPerformanceEntry(entry, performance = undefined) {
  if (entry.entryType !== "resource") return true;
  const resourceCount = OPENCONTAINERS_PERFORMANCE_ENTRIES.reduce((count, current) => (
    current.entryType === "resource" ? count + 1 : count
  ), 0);
  if (resourceCount < openContainersPerformanceResourceTimingBufferSize) return true;
  schedulePerformanceResourceTimingBufferFull(performance);
  return false;
}

function schedulePerformanceResourceTimingBufferFull(performance = undefined) {
  if (openContainersPerformanceResourceTimingBufferFullScheduled) return;
  openContainersPerformanceResourceTimingBufferFullScheduled = true;
  queueMicrotask(() => {
    openContainersPerformanceResourceTimingBufferFullScheduled = false;
    const target = performance ?? openContainersPerformanceResourceTimingBufferTarget;
    const handler = target?.onresourcetimingbufferfull;
    if (typeof handler === "function") handler.call(target);
  });
}

function recordPerformanceEntry(entry, performance = undefined) {
  if (!shouldRecordPerformanceEntry(entry, performance)) return;
  OPENCONTAINERS_PERFORMANCE_ENTRIES.push(entry);
  for (const observer of OPENCONTAINERS_PERFORMANCE_OBSERVERS) {
    if (performanceObserverAccepts(observer, entry)) enqueuePerformanceObserver(observer, entry);
  }
}

function recordPerformanceFunctionEntry(name, startTime, duration, detail, histogram) {
  const entry = new OpenContainersPerformanceFunctionEntry(name, startTime, duration, detail);
  recordPerformanceEntry(entry);
  if (histogram !== undefined) {
    histogram.record(Math.max(1, Math.round(duration * 1e6)));
  }
}

function normalizeTimerifyOptions(options = {}) {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw createInvalidArgTypeError("options", "object", options);
  }
  const histogram = options.histogram;
  if (histogram !== undefined && typeof histogram?.record !== "function") {
    throw Object.assign(new TypeError("options.histogram must be a Histogram"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return { histogram };
}

function createPerformanceMarkEntry(entries, now, argumentCount, name, options = {}) {
  if (argumentCount === 0) throw createPerformanceMissingNameError();
  const normalizedOptions = normalizePerformanceMarkOptions(options, now);
  const mark = new OpenContainersPerformanceMark(name, normalizedOptions);
  recordPerformanceEntry(mark);
  return mark;
}

function createPerformanceMeasureEntry(entries, now, argumentCount, name, startOrOptions = undefined, endMark = undefined) {
  if (argumentCount === 0) throw createPerformanceMissingNameError();
  if (typeof name !== "string") throw createInvalidArgTypeError("name", "string", name);
  const { startTime, endTime, detail } = normalizePerformanceMeasureTiming(entries, now, startOrOptions, endMark, argumentCount);
  const measure = new OpenContainersPerformanceMeasure(name, startTime, Math.max(0, endTime - startTime), detail, OPENCONTAINERS_PERFORMANCE_INTERNAL);
  recordPerformanceEntry(measure);
  return measure;
}

function normalizePerformanceMarkOptions(options, now) {
  if (options === undefined || options === null) {
    return { startTime: now(), detail: null };
  }
  if (typeof options !== "object") throw createInvalidArgTypeError("options", "object", options);
  return {
    ...options,
    startTime: normalizeOptionalPerformanceTimestamp(options.startTime, now(), "startTime"),
    detail: options.detail ?? null
  };
}

function normalizePerformanceMeasureTiming(entries, now, startOrOptions, endMark, argumentCount) {
  if (startOrOptions && typeof startOrOptions === "object") {
    return normalizePerformanceMeasureOptions(entries, now, startOrOptions);
  }
  return {
    startTime: resolvePerformanceMeasureStart(entries, startOrOptions),
    endTime: resolvePerformanceMeasureEnd(entries, argumentCount >= 3 ? endMark : undefined, now()),
    detail: null
  };
}

function normalizePerformanceMeasureOptions(entries, now, options) {
  const hasStart = Object.hasOwn(options, "start");
  const hasEnd = Object.hasOwn(options, "end");
  const hasDuration = Object.hasOwn(options, "duration");
  if (hasStart && hasEnd && hasDuration) throw createPerformanceMeasureInvalidOptionsError();

  let startTime = hasStart ? resolvePerformanceMeasurePoint(entries, options.start) : 0;
  let endTime = hasEnd ? resolvePerformanceMeasurePoint(entries, options.end) : now();

  if (hasDuration && (hasStart || hasEnd)) {
    const duration = normalizePerformanceTimestamp(options.duration, "duration");
    if (hasStart && !hasEnd) endTime = startTime + duration;
    else if (!hasStart && hasEnd) startTime = endTime - duration;
  }

  return {
    startTime,
    endTime,
    detail: options.detail ?? null
  };
}

function resolvePerformanceMeasureStart(entries, value) {
  if (typeof value === "string") return resolvePerformanceMarkTime(entries, value);
  return 0;
}

function resolvePerformanceMeasureEnd(entries, value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return normalizePerformanceTimestamp(value, "endMark");
  if (typeof value === "string") return resolvePerformanceMarkTime(entries, value);
  return fallback;
}

function resolvePerformanceMeasurePoint(entries, value) {
  if (typeof value === "number") return normalizePerformanceTimestamp(value, "timestamp");
  return resolvePerformanceMarkTime(entries, String(value));
}

function resolvePerformanceMarkTime(entries, name) {
  const match = [...entries].reverse().find((entry) => entry.entryType === "mark" && entry.name === name);
  if (!match) throw createPerformanceMarkNotSetError(name);
  return match.startTime;
}

function normalizeOptionalPerformanceTimestamp(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  return normalizePerformanceTimestamp(value, name);
}

function normalizePerformanceTimestamp(value, name) {
  if (typeof value !== "number") throw createInvalidArgTypeError(name, "number", value);
  if (value < 0) throw createPerformanceInvalidTimestampError(value);
  return value;
}

function createPerformanceMissingNameError() {
  const error = new TypeError('The "name" argument must be specified');
  error.code = "ERR_MISSING_ARGS";
  return error;
}

function createPerformanceInvalidTimestampError(value) {
  const error = new TypeError(`${value} is not a valid timestamp`);
  error.code = "ERR_PERFORMANCE_INVALID_TIMESTAMP";
  return error;
}

function createPerformanceMeasureInvalidOptionsError() {
  const error = new TypeError("Must not have options.start, options.end, and options.duration specified");
  error.code = "ERR_PERFORMANCE_MEASURE_INVALID_OPTIONS";
  return error;
}

function createPerformanceMarkNotSetError(name) {
  const error = new SyntaxError(`The "${name}" performance mark has not been set`);
  error.code = 12;
  return error;
}

function removePerformanceEntries(entries, type, name) {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index].entryType === type && (name === undefined || entries[index].name === name)) {
      entries.splice(index, 1);
    }
  }
}

function structuredCloneFallback(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return value;
  return JSON.parse(JSON.stringify(value));
}

function stripTypeScriptTypes(source, options = {}) {
  if (typeof source !== "string") {
    throw createInvalidArgTypeError("code", "string", source);
  }
  if (options === null || typeof options !== "object") {
    throw createInvalidArgTypeError("options", "object", options);
  }
  const mode = options.mode ?? "strip";
  if (mode !== "strip") {
    throw Object.assign(new TypeError(`The property 'options.mode' must be one of: 'strip'. Received ${formatInvalidReceived(mode)}`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
  const sourceUrl = options.sourceUrl;
  if (sourceUrl !== undefined && typeof sourceUrl !== "string") {
    throw createInvalidArgTypeError("options.sourceUrl", "string", sourceUrl);
  }
  let output = source;
  if (/\benum\s+[A-Za-z_$][\w$]*\s*\{/.test(output)) {
    throw Object.assign(new SyntaxError("TypeScript enum is not supported in strip-only mode"), {
      code: "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX"
    });
  }
  output = output.replace(/\binterface\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[^{]+)?\s*\{[^}]*\}\s*/gs, replaceWithSpaces);
  output = output.replace(/\btype\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*=\s*[^;\n]+;?/g, replaceWithSpaces);
  output = output.replace(/(?<=\b[A-Za-z_$][\w$]*)\s*:\s*[^=;,\)\{\}\n]+(?=\s*[,)=;])/g, replaceWithSpaces);
  output = output.replace(/\s+as\s+[A-Za-z_$][\w$<>,\s\[\]\|&.]*/g, replaceWithSpaces);
  output = output.replace(/import\s+type\s+[^;\n]+;?/g, replaceWithSpaces);
  output = output.replace(/export\s+type\s+[^;\n]+;?/g, replaceWithSpaces);
  if (sourceUrl !== undefined) {
    output += `\n\n//# sourceURL=${sourceUrl}`;
  }
  return output;
}

class ModuleHooks {
  #active = true;

  constructor(hooks, load) {
    if (hooks === undefined || hooks === null) {
      throw new TypeError(`Cannot destructure property 'resolve' of 'hooks' as it is ${hooks}.`);
    }
    const resolve = hooks.resolve;
    load = hooks.load;
    if (resolve !== undefined && typeof resolve !== "function") {
      throw createInvalidArgTypeError("hooks.resolve", "function", resolve);
    }
    if (load !== undefined && typeof load !== "function") {
      throw createInvalidArgTypeError("hooks.load", "function", load);
    }
    Object.defineProperties(this, {
      resolve: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: resolve
      },
      load: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: load
      }
    });
  }

  static isActive(handle) {
    return handle instanceof ModuleHooks && handle.#active === true;
  }

  deregister() {
    this.#active = false;
  }
}

function parseRegisteredLoaderDataUrl(specifier) {
  const rawSpecifier = String(specifier);
  if (!rawSpecifier.startsWith("data:")) return null;
  const commaIndex = rawSpecifier.indexOf(",");
  if (commaIndex === -1) throw createUnknownModuleFormatError(null, rawSpecifier);
  const metadata = rawSpecifier.slice(5, commaIndex).toLowerCase();
  const mediaType = metadata.split(";")[0] || null;
  if (!isSupportedRegisteredLoaderMediaType(mediaType)) {
    throw createUnknownModuleFormatError(mediaType, rawSpecifier);
  }
  const payload = rawSpecifier.slice(commaIndex + 1);
  const source = metadata.split(";").includes("base64")
    ? RuntimeBuffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
  return {
    filename: rawSpecifier,
    source
  };
}

function isSupportedRegisteredLoaderMediaType(mediaType) {
  return mediaType === "text/javascript"
    || mediaType === "application/javascript"
    || mediaType === "text/ecmascript"
    || mediaType === "application/ecmascript";
}

function normalizeRegisteredLoaderSource(source) {
  return String(source)
    .replace(/\bexport\s+async\s+function\s+(resolve|load)\s*\(/g, "export function $1(")
    .replace(/}\s+export\s+function\s+(resolve|load)\s*\(/g, "}\nexport function $1(");
}

function normalizeModuleRegisterParentURL(parentURLOrOptions) {
  const parentURL = parentURLOrOptions
    && typeof parentURLOrOptions === "object"
    && !isURLObject(parentURLOrOptions)
    ? parentURLOrOptions.parentURL
    : parentURLOrOptions;
  if (parentURL === undefined) return undefined;
  if (isURLObject(parentURL)) return String(parentURL.href);
  return String(parentURL);
}

function normalizeModuleRegisterParentFilename(parentURL) {
  if (parentURL === undefined) return undefined;
  if (String(parentURL).startsWith("file://")) return fileUrlToPath(parentURL);
  if (String(parentURL).startsWith("/")) return normalizePath(parentURL);
  return undefined;
}

function replaceWithSpaces(value) {
  return String(value).replace(/[^\n\r]/g, " ");
}

function validateCommonJsRequireId(id) {
  if (typeof id !== "string") throw createInvalidArgTypeError("id", "string", id);
}

function validateCommonJsRequest(request) {
  if (typeof request !== "string") throw createInvalidArgTypeError("request", "string", request);
}

function isCommonJsRelativeRequest(request) {
  return request === "." || request === ".." || request.startsWith("./") || request.startsWith("../");
}

export class ModuleLoader {
  constructor({ kernel, descriptor, console }) {
    this.kernel = kernel;
    this.descriptor = descriptor;
    this.console = console;
    this.cache = new Map();
    this.coreModules = new Map();
    this.cacheObject = null;
    this.mainModule = null;
    this.mainFilename = null;
    this.runtimeGlobalObject = null;
    this.asyncContextManager = createAsyncContextManager();
    this.moduleHooks = [];
  }

  setMain(filename) {
    this.mainFilename = normalizePath(filename);
  }

  createRequire(parentFilename = `${this.descriptor.cwd}/[repl].js`, parentModule = null) {
    const loader = this;
    const require = (specifier) => {
      validateCommonJsRequireId(specifier);
      return loader.require(specifier, parentFilename, parentModule);
    };
    require.resolve = function resolve(specifier, options) {
      validateCommonJsRequest(specifier);
      return loader.resolve(specifier, parentFilename, { mode: "require", resolveOptions: options });
    };
    require.resolve.paths = function paths(specifier) {
      validateCommonJsRequest(specifier);
      if (loader.isCoreModule(specifier)) return null;
      const parentDirectory = dirname(parentFilename || `${loader.descriptor.cwd}/[repl].js`);
      if (isCommonJsRelativeRequest(specifier)) return [parentDirectory];
      return [
        ...loader.nodeModulePaths(parentDirectory),
        ...createModuleGlobalPaths(loader.process)
      ];
    };
    require.cache = this.requireCache;
    require.extensions = MODULE_EXTENSIONS;
    require.main = this.mainModule;
    return require;
  }

  get requireCache() {
    if (!this.cacheObject) {
      this.cacheObject = new Proxy(Object.create(null), {
        get: (_target, property) => {
          if (property === Symbol.toStringTag) return "Object";
          if (property === Symbol.iterator) return this.cache[Symbol.iterator].bind(this.cache);
          if (typeof property === "string" && this.cache.has(property)) return this.cache.get(property);
          return undefined;
        },
        set: (_target, property, value) => {
          if (typeof property === "string") {
            this.cache.set(property, value);
            return true;
          }
          return false;
        },
        deleteProperty: (_target, property) => {
          if (typeof property === "string") return this.cache.delete(property);
          return false;
        },
        has: (_target, property) => typeof property === "string" && this.cache.has(property),
        ownKeys: () => [...this.cache.keys()],
        getOwnPropertyDescriptor: (_target, property) => {
          if (typeof property === "string" && this.cache.has(property)) {
            return {
              configurable: true,
              enumerable: true,
              writable: true,
              value: this.cache.get(property)
            };
          }
          return undefined;
        }
      });
    }
    return this.cacheObject;
  }

  getActiveModuleHooks() {
    return this.moduleHooks.filter((hook) => ModuleHooks.isActive(hook) && (
      typeof hook.resolve === "function" || typeof hook.load === "function"
    ));
  }

  registerModuleLoader(specifier, parentURLOrOptions) {
    const loaderSource = this.resolveRegisteredLoaderSource(String(specifier), parentURLOrOptions);
    if (!loaderSource) return;
    const hooks = this.compileRegisteredModuleHooks(loaderSource.source, loaderSource.filename);
    if (typeof hooks.resolve !== "function" && typeof hooks.load !== "function") return;
    this.moduleHooks.push(new ModuleHooks(hooks));
  }

  resolveRegisteredLoaderSource(specifier, parentURLOrOptions) {
    const dataUrlSource = parseRegisteredLoaderDataUrl(specifier);
    if (dataUrlSource) return dataUrlSource;
    if (this.isCoreModule(specifier)) return null;

    const parentURL = normalizeModuleRegisterParentURL(parentURLOrOptions);
    const parentFilename = normalizeModuleRegisterParentFilename(parentURL);
    if (!parentFilename) {
      throw createModuleRegisterUnsupportedResolveRequestError(specifier, parentURL ?? "data:");
    }
    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename, { mode: "import" });
    return {
      filename: resolved,
      source: this.readModuleSource(resolved)
    };
  }

  compileRegisteredModuleHooks(source, filename) {
    const loaderSource = normalizeRegisteredLoaderSource(source);
    const shouldTransform = String(filename).endsWith(".mjs") || looksLikeEsm(loaderSource);
    const executableSource = stripHashbang(shouldTransform
      ? transformEsmToCjs(loaderSource, { filename })
      : loaderSource);
    const moduleFilename = isCommonJsHookFileLikeUrl(filename)
      ? commonJsHookCacheKeyFromUrl(filename)
      : `${this.descriptor.cwd}/[module-register].mjs`;
    const module = {
      exports: {}
    };
    const localRequire = this.createRequire(moduleFilename);
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
      "__opencontainersModuleNamespace",
      "fetch",
      "__opencontainersDynamicImport",
      "__opencontainersImportMetaResolve",
      `with (__opencontainersGlobals) {\n${executableSource}\n}\n//# sourceURL=opencontainers-register://${encodeURIComponent(String(filename))}`
    );
    wrapped.call(
      module.exports,
      module.exports,
      localRequire,
      module,
      moduleFilename,
      dirname(moduleFilename),
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
      createModuleNamespace,
      this.fetch,
      (childSpecifier) => this.dynamicImport(childSpecifier, moduleFilename),
      (childSpecifier) => this.importMetaResolve(childSpecifier, moduleFilename)
    );
    const exported = module.exports;
    return {
      resolve: exported?.resolve,
      load: exported?.load
    };
  }

  require(specifier, parentFilename, parentModule = null) {
    const request = stripResourceQuery(String(specifier));
    const activeHooks = this.getActiveModuleHooks();
    if (activeHooks.length === 0) {
      const core = this.loadCoreModule(specifier);
      if (core) return core;

      const resolved = this.resolve(request, parentFilename, { mode: "require" });
      return this.loadCommonJsModule({ cacheKey: resolved, url: pathToFileUrl(resolved), isFileLike: true }, parentModule);
    }

    const resolution = this.resolveCommonJsWithHooks(request, parentFilename, activeHooks);
    if (this.cache.has(resolution.cacheKey)) {
      const cached = this.cache.get(resolution.cacheKey);
      this.addChildModule(parentModule, cached);
      return cached.exports;
    }

    const loadResult = activeHooks.some((hook) => typeof hook.load === "function")
      ? this.loadCommonJsWithHooks(resolution, activeHooks)
      : null;
    if (resolution.isBuiltin && !loadResult?.hasSource) {
      const core = this.loadCoreModule(resolution.builtinSpecifier);
      if (core) return core;
    }

    return this.loadCommonJsModule(resolution, parentModule, loadResult);
  }

  loadCommonJsModule(resolution, parentModule = null, loadResult = null) {
    const resolved = resolution.cacheKey;
    if (this.cache.has(resolved)) {
      const cached = this.cache.get(resolved);
      this.addChildModule(parentModule, cached);
      return cached.exports;
    }

    const module = this.createCommonJsModule(resolved, parentModule);
    this.cache.set(resolved, module);
    this.addChildModule(parentModule, module);
    const extension = moduleExtensionForPath(resolved);
    const extensionHandler = MODULE_EXTENSIONS[extension];
    try {
      if (loadResult?.hasSource) {
        if (loadResult.format === "json") module.exports = JSON.parse(loadResult.source);
        else if (loadResult.format === "commonjs" || loadResult.format === undefined) {
          this.compileCommonJsModule(module, loadResult.source, resolved);
        } else {
          throw createUnsupportedModuleHookFormatError(loadResult.format);
        }
      } else if (!resolution.isFileLike) {
        throw new ModuleResolutionError(resolution.url, resolution.parentFilename ?? this.descriptor.cwd);
      } else if (extensionHandler) extensionHandler(module, resolved);
      else this.compileCommonJsModule(module, this.readModuleSource(resolved), resolved);
      module.loaded = true;
      return module.exports;
    } catch (error) {
      this.cache.delete(resolved);
      throw error;
    }
  }

  resolveCommonJsWithHooks(specifier, parentFilename, activeHooks) {
    const hooks = [...activeHooks].reverse();
    const initialContext = createCommonJsResolveHookContext({
      parentURL: pathToFileUrl(parentFilename || `${this.descriptor.cwd}/[repl].js`)
    });
    const dispatch = (index, currentSpecifier, currentContext) => {
      for (let cursor = index; cursor < hooks.length; cursor++) {
        const hook = hooks[cursor];
        if (typeof hook.resolve !== "function") continue;
        const nextResolve = (nextSpecifier = currentSpecifier, nextContext = currentContext) => (
          dispatch(cursor + 1, String(nextSpecifier), normalizeCommonJsResolveHookContext(nextContext, currentContext))
        );
        const result = hook.resolve(currentSpecifier, currentContext, nextResolve);
        validateCommonJsResolveHookResult(result);
        return result;
      }
      return markModuleHookNextResult(this.defaultCommonJsResolveResult(currentSpecifier, parentFilename, currentContext));
    };
    return this.createCommonJsResolutionFromHookResult(dispatch(0, specifier, initialContext), parentFilename);
  }

  defaultCommonJsResolveResult(specifier, parentFilename, context) {
    if (this.isCoreModule(specifier)) {
      return {
        url: canonicalBuiltinUrl(specifier),
        format: "builtin",
        importAttributes: normalizeCommonJsHookImportAttributes(context.importAttributes)
      };
    }
    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename, { mode: "require" });
    const url = pathToFileUrl(resolved);
    return {
      url,
      format: inferCommonJsHookFormat(url),
      importAttributes: normalizeCommonJsHookImportAttributes(context.importAttributes)
    };
  }

  createCommonJsResolutionFromHookResult(result, parentFilename) {
    validateCommonJsResolveHookResult(result);
    const url = result.url;
    const isBuiltin = url.startsWith("node:") && this.isCoreModule(url);
    return {
      url,
      cacheKey: commonJsHookCacheKeyFromUrl(url),
      format: result.format ?? inferCommonJsHookFormat(url),
      isBuiltin,
      isFileLike: isCommonJsHookFileLikeUrl(url),
      builtinSpecifier: isBuiltin ? url : null,
      parentFilename,
      importAttributes: normalizeCommonJsHookImportAttributes(result.importAttributes)
    };
  }

  loadCommonJsWithHooks(resolution, activeHooks) {
    const hooks = [...activeHooks].reverse();
    const initialContext = createCommonJsLoadHookContext(resolution);
    const dispatch = (index, currentUrl, currentContext) => {
      for (let cursor = index; cursor < hooks.length; cursor++) {
        const hook = hooks[cursor];
        if (typeof hook.load !== "function") continue;
        const nextLoad = (nextUrl = currentUrl, nextContext = currentContext) => (
          dispatch(cursor + 1, String(nextUrl), normalizeCommonJsLoadHookContext(nextContext, currentContext))
        );
        const result = hook.load(currentUrl, currentContext, nextLoad);
        validateCommonJsLoadHookResult(result);
        return result;
      }
      return markModuleHookNextResult(this.defaultCommonJsLoadResult(currentUrl, currentContext));
    };
    return normalizeCommonJsLoadHookResult(dispatch(0, resolution.url, initialContext), resolution);
  }

  defaultCommonJsLoadResult(url, context) {
    const format = context.format ?? inferCommonJsHookFormat(url);
    const result = {
      format,
      importAttributes: normalizeCommonJsHookImportAttributes(context.importAttributes)
    };
    if ((format === "commonjs" || format === "json") && isCommonJsHookFileLikeUrl(url)) {
      result.source = this.readModuleSource(commonJsHookCacheKeyFromUrl(url));
    }
    return result;
  }

  resolveImportWithHooks(specifier, parentFilename, activeHooks) {
    const hooks = [...activeHooks].reverse();
    const initialContext = createImportResolveHookContext({
      parentURL: pathToFileUrl(parentFilename || `${this.descriptor.cwd}/[repl].js`)
    });
    const dispatch = (index, currentSpecifier, currentContext) => {
      for (let cursor = index; cursor < hooks.length; cursor++) {
        const hook = hooks[cursor];
        if (typeof hook.resolve !== "function") continue;
        const nextResolve = (nextSpecifier = currentSpecifier, nextContext = currentContext) => (
          dispatch(cursor + 1, String(nextSpecifier), normalizeImportResolveHookContext(nextContext, currentContext))
        );
        const result = hook.resolve(currentSpecifier, currentContext, nextResolve);
        validateCommonJsResolveHookResult(result);
        return result;
      }
      return markModuleHookNextResult(this.defaultImportResolveResult(currentSpecifier, parentFilename, currentContext));
    };
    return this.createImportResolutionFromHookResult(dispatch(0, specifier, initialContext), parentFilename);
  }

  defaultImportResolveResult(specifier, parentFilename, context) {
    if (this.isCoreModule(specifier)) {
      return {
        url: canonicalBuiltinUrl(specifier),
        format: "builtin",
        importAttributes: normalizeCommonJsHookImportAttributes(context.importAttributes)
      };
    }
    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename, { mode: "import" });
    const url = pathToFileUrl(resolved);
    return {
      url,
      format: inferImportHookFormat(url),
      importAttributes: normalizeCommonJsHookImportAttributes(context.importAttributes)
    };
  }

  createImportResolutionFromHookResult(result, parentFilename) {
    validateCommonJsResolveHookResult(result);
    const url = result.url;
    const isBuiltin = url.startsWith("node:") && this.isCoreModule(url);
    return {
      url,
      cacheKey: commonJsHookCacheKeyFromUrl(url),
      format: result.format ?? inferImportHookFormat(url),
      isBuiltin,
      isFileLike: isCommonJsHookFileLikeUrl(url),
      builtinSpecifier: isBuiltin ? url : null,
      parentFilename,
      importAttributes: normalizeCommonJsHookImportAttributes(result.importAttributes)
    };
  }

  loadImportWithHooks(resolution, activeHooks) {
    const hooks = [...activeHooks].reverse();
    const initialContext = createImportLoadHookContext(resolution);
    const dispatch = (index, currentUrl, currentContext) => {
      for (let cursor = index; cursor < hooks.length; cursor++) {
        const hook = hooks[cursor];
        if (typeof hook.load !== "function") continue;
        const nextLoad = (nextUrl = currentUrl, nextContext = currentContext) => (
          dispatch(cursor + 1, String(nextUrl), normalizeImportLoadHookContext(nextContext, currentContext))
        );
        const result = hook.load(currentUrl, currentContext, nextLoad);
        validateImportLoadHookResult(result);
        return result;
      }
      return markModuleHookNextResult(this.defaultImportLoadResult(currentUrl, currentContext));
    };
    return normalizeImportLoadHookResult(dispatch(0, resolution.url, initialContext), resolution);
  }

  defaultImportLoadResult(url, context) {
    const format = context.format ?? inferImportHookFormat(url);
    const result = {
      format,
      importAttributes: normalizeCommonJsHookImportAttributes(context.importAttributes)
    };
    if ((format === "module" || format === "commonjs" || format === "json") && isCommonJsHookFileLikeUrl(url)) {
      result.source = this.readModuleSource(commonJsHookCacheKeyFromUrl(url));
    }
    return result;
  }

  compileCommonJsModule(module, source, filename = module.filename) {
    const resolved = normalizePath(filename);
    const executableSource = stripHashbang(this.shouldTransformEsm(resolved, source)
      ? transformEsmToCjs(source, { filename: resolved })
      : source);
    const localRequire = Object.prototype.hasOwnProperty.call(module, "require") && typeof module.require === "function"
      ? module.require
      : this.createRequire(resolved, module);
    module.require = localRequire;
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
      "__opencontainersModuleNamespace",
      "fetch",
      "__opencontainersDynamicImport",
      "__opencontainersImportMetaResolve",
      `with (__opencontainersGlobals) {\n${executableSource}\n}\n//# sourceURL=opencontainers://${resolved}`
    );
    wrapped.call(
      module.exports,
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
      createModuleNamespace,
      this.fetch,
      (specifier) => this.dynamicImport(specifier, resolved),
      (specifier) => this.importMetaResolve(specifier, resolved)
    );
    return module.exports;
  }

  async import(specifier, parentFilename, parentModule = null) {
    const activeHooks = this.getActiveModuleHooks();
    if (activeHooks.length === 0) {
      const core = this.loadCoreModule(specifier);
      if (core) return core;

      const resolved = this.resolve(stripResourceQuery(specifier), parentFilename, { mode: "import" });
      return this.loadImportModule({
        url: pathToFileUrl(resolved),
        cacheKey: resolved,
        format: inferImportHookFormat(pathToFileUrl(resolved)),
        isBuiltin: false,
        isFileLike: true,
        builtinSpecifier: null,
        parentFilename,
        importAttributes: {}
      }, parentModule);
    }

    const resolution = this.resolveImportWithHooks(String(specifier), parentFilename, activeHooks);
    if (resolution.isBuiltin && !activeHooks.some((hook) => typeof hook.load === "function")) {
      const core = this.loadCoreModule(resolution.builtinSpecifier);
      if (core) return core;
    }
    const loadResult = activeHooks.some((hook) => typeof hook.load === "function")
      ? this.loadImportWithHooks(resolution, activeHooks)
      : null;
    if (resolution.isBuiltin && !loadResult?.hasSource) {
      const core = this.loadCoreModule(resolution.builtinSpecifier);
      if (core) return core;
    }
    return this.loadImportModule(resolution, parentModule, loadResult);
  }

  async loadImportModule(resolution, parentModule = null, loadResult = null) {
    const resolved = resolution.cacheKey;
    if (this.cache.has(resolved)) {
      const cached = this.cache.get(resolved);
      this.addChildModule(parentModule, cached);
      return cached.exports;
    }

    const format = loadResult?.format ?? resolution.format;
    if (format === "json") {
      const module = this.createCommonJsModule(resolved, parentModule, { setProcessMain: false });
      this.cache.set(resolved, module);
      try {
        module.exports = JSON.parse(loadResult?.hasSource ? loadResult.source : this.kernel.fs.readFileSync(resolved, "utf8"));
        module.loaded = true;
        this.addChildModule(parentModule, module);
        return module.exports;
      } catch (error) {
        this.cache.delete(resolved);
        throw error;
      }
    }
    if (format !== "module" && format !== "commonjs" && format !== undefined) {
      throw createUnsupportedModuleHookFormatError(format);
    }
    if (!loadResult?.hasSource && !resolution.isFileLike) {
      throw new ModuleResolutionError(resolution.url, resolution.parentFilename ?? this.descriptor.cwd);
    }

    const source = loadResult?.hasSource ? loadResult.source : this.readModuleSource(resolved);
    const isEsmModule = this.shouldTransformEsm(resolved, source) || (loadResult?.hasSource && format === "module");
    const executableSource = stripHashbang(isEsmModule
      ? transformEsmToCjs(source, {
        filename: resolved,
        staticImportHelper: "__opencontainersStaticImport",
        awaitStaticImports: true
      })
      : source);
    const module = this.createCommonJsModule(resolved, parentModule, { setProcessMain: !isEsmModule });
    this.cache.set(resolved, module);
    this.addChildModule(parentModule, module);
    const localRequire = this.createRequire(resolved, module);
    module.require = localRequire;
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
      "__opencontainersStaticImport",
      "__opencontainersModuleNamespace",
      "fetch",
      "__opencontainersDynamicImport",
      "__opencontainersImportMetaResolve",
      `return (async () => {\nwith (__opencontainersGlobals) {\n${executableSource}\n}\n})();\n//# sourceURL=opencontainers://${resolved}`
    );
    try {
      await wrapped.call(
        module.exports,
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
        (childSpecifier) => this.import(childSpecifier, resolved, module),
        createModuleNamespace,
        this.fetch,
        (childSpecifier) => this.dynamicImport(childSpecifier, resolved),
        (childSpecifier) => this.importMetaResolve(childSpecifier, resolved)
      );
      module.loaded = true;
      return module.exports;
    } catch (error) {
      this.cache.delete(resolved);
      throw error;
    }
  }

  createCommonJsModule(filename, parentModule = null, { setProcessMain = true } = {}) {
    const normalized = normalizePath(filename);
    const module = {
      id: this.mainFilename === normalized ? "." : normalized,
      path: dirname(normalized),
      filename: normalized,
      exports: {},
      parent: parentModule,
      children: [],
      loaded: false,
      paths: this.nodeModulePaths(dirname(normalized)),
      require: null
    };
    Object.defineProperties(module, {
      _compile: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: (content, compileFilename = normalized) => this.compileCommonJsModule(module, String(content), compileFilename)
      },
      __opencontainersReadSource: {
        configurable: true,
        enumerable: false,
        writable: false,
        value: (sourceFilename = normalized) => this.readModuleSource(normalizePath(sourceFilename))
      }
    });
    if (setProcessMain && this.mainFilename === normalized && !this.mainModule) {
      this.mainModule = module;
      this.process.mainModule = module;
    }
    return module;
  }

  addChildModule(parentModule, childModule) {
    if (!parentModule || !childModule || !Array.isArray(parentModule.children)) return;
    if (!parentModule.children.includes(childModule)) parentModule.children.push(childModule);
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

  #fsBuiltin;

  #utilBuiltin;

  #perfHooksBuiltin;

  #testBuiltin;

  get perfHooksBuiltin() {
    if (!this.#perfHooksBuiltin) this.#perfHooksBuiltin = createPerfHooksBuiltin();
    return this.#perfHooksBuiltin;
  }

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
      const globals = Object.create(null);
      const RuntimeFunction = createRuntimeFunction(globals);
      const RuntimeEvent = globalThis.Event ?? OpenContainersEvent;
      const RuntimePerformance = this.perfHooksBuiltin.performance;
      const webStreams = getWebStreamConstructors();
      Object.assign(globals, {
        Function: RuntimeFunction,
        process: this.process,
        console: this.console,
        Buffer: RuntimeBuffer,
        setTimeout: this.timers.setTimeout,
        clearTimeout: this.timers.clearTimeout,
        setInterval: this.timers.setInterval,
        clearInterval: this.timers.clearInterval,
        setImmediate: this.timers.setImmediate,
        clearImmediate: this.timers.clearImmediate,
        Date: this.timers.Date,
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
        atob: globalThis.atob?.bind(globalThis) ?? bufferAtob,
        btoa: globalThis.btoa?.bind(globalThis) ?? bufferBtoa,
        Atomics: globalThis.Atomics,
        WebAssembly: globalThis.WebAssembly,
        TextEncoder: globalThis.TextEncoder,
        TextDecoder: globalThis.TextDecoder,
        TextEncoderStream: globalThis.TextEncoderStream ?? OpenContainersTextEncoderStream,
        TextDecoderStream: globalThis.TextDecoderStream ?? OpenContainersTextDecoderStream,
        AbortController: globalThis.AbortController,
        AbortSignal: globalThis.AbortSignal,
        Event: RuntimeEvent,
        EventTarget: OpenContainersEventTarget,
        CustomEvent: globalThis.CustomEvent ?? createOpenContainersCustomEvent(RuntimeEvent),
        DOMException: globalThis.DOMException ?? OpenContainersDOMException,
        Blob: globalThis.Blob,
        FormData: globalThis.FormData,
        Headers: globalThis.Headers,
        Request: globalThis.Request,
        Response: globalThis.Response,
        ByteLengthQueuingStrategy: globalThis.ByteLengthQueuingStrategy ?? OpenContainersByteLengthQueuingStrategy,
        CountQueuingStrategy: globalThis.CountQueuingStrategy ?? OpenContainersCountQueuingStrategy,
        CompressionStream: globalThis.CompressionStream,
        DecompressionStream: globalThis.DecompressionStream,
        Crypto: globalThis.Crypto,
        SubtleCrypto: globalThis.SubtleCrypto,
        CryptoKey: globalThis.CryptoKey,
        ReadableStream: webStreams.ReadableStream,
        ReadableByteStreamController: webStreams.ReadableByteStreamController,
        ReadableStreamBYOBReader: webStreams.ReadableStreamBYOBReader,
        ReadableStreamBYOBRequest: webStreams.ReadableStreamBYOBRequest,
        ReadableStreamDefaultController: webStreams.ReadableStreamDefaultController,
        ReadableStreamDefaultReader: webStreams.ReadableStreamDefaultReader,
        TransformStream: webStreams.TransformStream,
        TransformStreamDefaultController: webStreams.TransformStreamDefaultController,
        WritableStream: webStreams.WritableStream,
        WritableStreamDefaultController: webStreams.WritableStreamDefaultController,
        WritableStreamDefaultWriter: webStreams.WritableStreamDefaultWriter,
        Performance: PerfHooksPerformance,
        PerformanceEntry: OpenContainersPerformanceEntry,
        PerformanceMark: OpenContainersPerformanceMark,
        PerformanceMeasure: OpenContainersPerformanceMeasure,
        PerformanceObserver: OpenContainersPerformanceObserver,
        PerformanceObserverEntryList: OpenContainersPerformanceObserverEntryList,
        PerformanceResourceTiming: OpenContainersPerformanceResourceTiming,
        performance: RuntimePerformance,
        structuredClone: globalThis.structuredClone?.bind(globalThis) ?? structuredCloneFallback,
        crypto: globalThis.crypto,
        MessageChannel: this.workerThreads.MessageChannel,
        MessageEvent: globalThis.MessageEvent ?? createOpenContainersMessageEvent(RuntimeEvent),
        MessagePort: this.workerThreads.MessagePort,
        BroadcastChannel: globalThis.BroadcastChannel ?? OpenContainersBroadcastChannel,
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
      });
      for (const name of ["atob", "btoa", "structuredClone"]) {
        if (typeof globals[name] === "function") {
          Object.defineProperty(globals[name], "name", {
            configurable: true,
            value: name
          });
        }
      }
      for (const name of [
        "AbortController",
        "AbortSignal",
        "Atomics",
        "Blob",
        "BroadcastChannel",
        "ByteLengthQueuingStrategy",
        "CompressionStream",
        "console",
        "CountQueuingStrategy",
        "Crypto",
        "CryptoKey",
        "CustomEvent",
        "DecompressionStream",
        "DOMException",
        "Event",
        "EventTarget",
        "FormData",
        "Headers",
        "MessageChannel",
        "MessageEvent",
        "MessagePort",
        "PerformanceEntry",
        "PerformanceMark",
        "PerformanceMeasure",
        "PerformanceObserver",
        "PerformanceObserverEntryList",
        "PerformanceResourceTiming",
        "ReadableByteStreamController",
        "ReadableStream",
        "ReadableStreamBYOBReader",
        "ReadableStreamBYOBRequest",
        "ReadableStreamDefaultController",
        "ReadableStreamDefaultReader",
        "Request",
        "Response",
        "SubtleCrypto",
        "TextDecoder",
        "TextDecoderStream",
        "TextEncoder",
        "TextEncoderStream",
        "TransformStream",
        "TransformStreamDefaultController",
        "URL",
        "URLSearchParams",
        "WebAssembly",
        "WritableStream",
        "WritableStreamDefaultController",
        "WritableStreamDefaultWriter"
      ]) {
        Object.defineProperty(globals, name, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: globals[name]
        });
      }
      globals.global = globals;
      globals.globalThis = globals;
      Object.defineProperty(globals, "globalThis", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: globals
      });
      defineRuntimeGlobalAccessor(globals, "Buffer", globals.Buffer);
      defineRuntimeGlobalAccessor(globals, "process", globals.process);
      defineRuntimeGlobalAccessor(globals, "performance", globals.performance, {
        enumerable: true,
        getterName: "get performance",
        setterName: "set performance"
      });
      this.runtimeGlobalObject = globals;
    }
    return this.runtimeGlobalObject;
  }

  loadCoreModule(specifier) {
    const rawSpecifier = String(specifier);
    const normalized = rawSpecifier.startsWith("node:") ? rawSpecifier.slice(5) : rawSpecifier;
    if (!this.isCoreModule(rawSpecifier)) {
      if (rawSpecifier.startsWith("node:")) throw createUnknownBuiltinModuleError(rawSpecifier);
      return null;
    }
    const canonical = normalized === "sys" ? "util" : normalized;
    if (!this.coreModules.has(canonical)) {
      const value = this.instantiateCoreModule(canonical);
      this.coreModules.set(canonical, value);
    }
    const value = this.coreModules.get(canonical);
    if (normalized !== canonical) this.coreModules.set(normalized, value);
    return value;
  }

  isCoreModule(specifier) {
    return isBuiltinSpecifier(specifier);
  }

  instantiateCoreModule(name) {
    if (name === "assert") return assertBuiltin;
    if (name === "assert/strict") return assertStrictBuiltin;
    if (name === "fs") return this.createFsBuiltin();
    if (name === "fs/promises") return this.createFsBuiltin().promises;
    if (name === "path") return pathBuiltin;
    if (name === "path/posix") return pathBuiltin.posix;
    if (name === "path/win32") return pathBuiltin.win32;
    if (name === "process") return this.process;
    if (name === "console") return createConsoleBuiltin(this.console);
    if (name === "cluster") return createClusterBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "dgram") return createDgramBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "domain") {
      installProcessDomainAccessor(this.process, () => domainBuiltin.active);
      return domainBuiltin;
    }
    if (name === "events") return createEventsBuiltin({ AsyncResource: this.loadCoreModule("async_hooks").AsyncResource });
    if (name === "stream") return streamBuiltin;
    if (name === "stream/consumers") return streamConsumersBuiltin;
    if (name === "stream/promises") return streamPromisesBuiltin;
    if (name === "stream/web") return createStreamWebBuiltin();
    if (name === "string_decoder") return stringDecoderBuiltin;
    if (name === "tty") return ttyBuiltin;
    if (name === "readline") return readlineBuiltin;
    if (name === "readline/promises") return readlineBuiltin.promises;
    if (name === "buffer") return bufferBuiltin;
    if (name === "child_process") return createChildProcessBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "constants") {
      const cryptoBuiltin = this.coreModules.get("crypto");
      const cryptoHasDefaultCipherList = Boolean(cryptoBuiltin && Object.hasOwn(cryptoBuiltin.constants, "defaultCipherList"));
      const tlsLoaded = this.coreModules.has("tls") || this.coreModules.has("_tls_common") || this.coreModules.has("_tls_wrap") || this.coreModules.has("https");
      return getConstantsBuiltin({
        includeDefaultCipherList: cryptoHasDefaultCipherList || tlsLoaded,
        defaultCipherList: cryptoHasDefaultCipherList ? cryptoBuiltin.constants.defaultCipherList : DEFAULT_CORE_CIPHER_LIST
      });
    }
    if (name === "_http_agent") return createHttpAgentBuiltin(this.loadCoreModule("http"));
    if (name === "_http_client") return createHttpClientBuiltin(this.loadCoreModule("http"));
    if (name === "_http_common") return createHttpCommonBuiltin(this.loadCoreModule("http"));
    if (name === "_http_incoming") return createHttpIncomingBuiltin(this.loadCoreModule("http"));
    if (name === "_http_outgoing") return createHttpOutgoingBuiltin(this.loadCoreModule("http"));
    if (name === "_http_server") return createHttpServerBuiltin(this.loadCoreModule("http"));
    if (name === "http") return createHttpBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "https") return createHttpsBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "http2") return createHttp2Builtin({ kernel: this.kernel, process: this.process });
    if (name === "inspector") return createInspectorBuiltin({ globals: this.runtimeGlobals });
    if (name === "inspector/promises") return createInspectorPromisesBuiltin({ globals: this.runtimeGlobals });
    if (name === "net") return createNetBuiltin({ kernel: this.kernel, process: this.process });
    if (name === "dns") return this.createDnsBuiltin();
    if (name === "dns/promises") return this.createDnsBuiltin().promises;
    if (name === "module") return this.createModuleBuiltin();
    if (name === "os") return osBuiltin;
    if (name === "url") return createUrlBuiltin({ process: this.process });
    if (name === "sys") return this.loadCoreModule("util");
    if (name === "util") return this.createUtilBuiltin();
    if (name === "util/types") return this.createUtilBuiltin().types;
    if (name === "perf_hooks") return this.perfHooksBuiltin;
    if (name === "punycode") return punycodeBuiltin;
    if (name === "querystring") return querystringBuiltin;
    if (name === "repl") return createReplBuiltin({ globals: this.runtimeGlobals });
    if (name === "crypto") return this.createCryptoBuiltin();
    if (name === "diagnostics_channel") return diagnosticsChannelBuiltin;
    if (name === "v8") return v8Builtin;
    if (name === "vm") return createVmBuiltin({ globals: this.runtimeGlobals });
    if (name === "zlib") return this.createZlibBuiltin();
    if (name === "async_hooks") return createAsyncHooksBuiltin({ asyncContextManager: this.asyncContextManager });
    if (name === "timers") return this.timers.builtin;
    if (name === "timers/promises") return this.timers.promisesBuiltin;
    if (name === "test") return this.createTestBuiltin();
    if (name === "test/reporters") return testReportersBuiltin;
    if (name === "tls") return createTlsBuiltin();
    if (name === "_tls_common") return createTlsCommonBuiltin(this.loadCoreModule("tls"));
    if (name === "_tls_wrap") return createTlsWrapBuiltin(this.loadCoreModule("tls"));
    if (name === "trace_events") return traceEventsBuiltin;
    if (name === "sea") return seaBuiltin;
    if (name === "sqlite") return sqliteBuiltin;
    if (name === "wasi") return createWasiBuiltin({ descriptor: this.descriptor, kernel: this.kernel });
    if (name === "worker_threads") return this.workerThreads;
    throw new Error(`Unsupported core module: ${name}`);
  }

  promisify(fn) {
    if (typeof fn !== "function") {
      throw createInvalidArgTypeError("original", "function", fn);
    }
    const custom = fn?.[UTIL_PROMISIFY_CUSTOM];
    if (custom !== undefined) {
      if (typeof custom !== "function") throw createInvalidPromisifyCustomError(custom);
      return markPromisified(custom);
    }
    const promisified = function (...args) {
      return new Promise((resolve, reject) => {
        fn.call(this, ...args, (error, ...values) => {
          if (error) reject(error);
          else resolve(values[0]);
        });
      });
    };
    Object.defineProperty(promisified, "name", { configurable: true, value: fn.name });
    Object.defineProperty(promisified, "length", { configurable: true, value: fn.length });
    return markPromisified(promisified);
  }

  dynamicImport(specifier, parentFilename) {
    this.process.__opencontainersAddRef?.();
    const promise = Promise.resolve()
      .then(() => this.import(specifier, parentFilename))
      .then((exports) => createModuleNamespace(exports, specifier));
    promise.then(
      () => queueMicrotask(() => this.process.__opencontainersUnref?.()),
      () => queueMicrotask(() => this.process.__opencontainersUnref?.())
    );
    return promise;
  }

  importMetaResolve(specifier, parentFilename) {
    const normalized = String(specifier).replace(/^node:/, "");
    if (this.isCoreModule(specifier)) return `node:${normalized}`;
    return pathToFileUrl(this.resolve(stripResourceQuery(String(specifier)), parentFilename, { mode: "import" }));
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
      argv: [this.process?.execPath ?? "node", options.filename ?? "[worker].js", ...(options.argv ?? [])],
      env: options.env ?? { ...this.descriptor.env },
      status: "running",
      stdin: options.stdin ?? this.descriptor.stdin,
      stdout: options.stdout ?? this.descriptor.stdout,
      stderr: options.stderr ?? this.descriptor.stderr,
      projectId: this.descriptor.projectId,
      workerContext: {
        parentPort: options.parentPort,
        name: options.name ?? "",
        resourceLimits: options.resourceLimits ?? {},
        threadId: options.threadId,
        workerData: options.workerData
      }
    };
    const workerLoader = new ModuleLoader({
      kernel: this.kernel,
      descriptor: workerDescriptor,
      console: createDescriptorConsole(workerDescriptor)
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
      ? transformEsmToCjs(source, {
        filename,
        staticImportHelper: "__opencontainersStaticImport",
        awaitStaticImports: true
      })
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
      "__opencontainersStaticImport",
      "__opencontainersModuleNamespace",
      "fetch",
      "__opencontainersDynamicImport",
      "__opencontainersImportMetaResolve",
      `return (async () => {\nwith (__opencontainersGlobals) {\n${executableSource}\n}\n})();\n//# sourceURL=opencontainers://${filename}`
    );
    await wrapped.call(
      module.exports,
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
      (specifier) => this.import(specifier, filename, module),
      createModuleNamespace,
      this.fetch,
      (specifier) => this.dynamicImport(specifier, filename),
      (specifier) => this.importMetaResolve(specifier, filename)
    );
    return module.exports;
  }

  createCryptoBuiltin() {
    return createNodeCryptoBuiltin({ process: this.process });
  }

  createFsBuiltin() {
    if (!this.#fsBuiltin) this.#fsBuiltin = createFsBuiltin({ kernel: this.kernel, process: this.process });
    return this.#fsBuiltin;
  }

  createDnsBuiltin() {
    if (!this.dnsBuiltin) this.dnsBuiltin = createDnsBuiltin();
    return this.dnsBuiltin;
  }

  createZlibBuiltin() {
    return createZlibBuiltin({ process: this.process });
  }

  createUtilBuiltin() {
    if (!this.#utilBuiltin) {
      this.#utilBuiltin = createUtilBuiltin({ console: this.console, process: this.process, promisify: this.promisify });
    }
    return this.#utilBuiltin;
  }

  createTestBuiltin() {
    if (!this.#testBuiltin) {
      this.#testBuiltin = createTestBuiltin({ mockTimers: this.timers.mockTimers });
    }
    return this.#testBuiltin;
  }

  createModuleBuiltin() {
    const builtinModules = [...BUILTIN_MODULES];
    const loader = this;
    function createRequire(filename) {
      return loader.createRequire(normalizeCreateRequireFilename(filename));
    }
    const isBuiltin = { isBuiltin(specifier) {
      return isBuiltinSpecifier(specifier);
    } }.isBuiltin;
    const compileCacheStatus = Object.freeze(Object.assign(Object.create(null), {
      FAILED: 0,
      ENABLED: 1,
      ALREADY_ENABLED: 2,
      DISABLED: 3
    }));
    let compileCacheDirectory = undefined;
    let moduleWrapper = ["(function (exports, require, module, __filename, __dirname) { ", "\n});"];
    let sourceMapsSupport = {
      enabled: false,
      nodeModules: false,
      generatedCode: false
    };
    const sourceMapBase64Values = new Map(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").map((char, index) => [char, index])
    );
    const sourceMapMappingsSymbol = Symbol("kMappings");
    function decodeSourceMapVlq(segment) {
      const values = [];
      let value = 0;
      let shift = 0;
      for (const char of segment) {
        const digit = sourceMapBase64Values.get(char);
        if (digit === undefined) return [];
        const continuation = (digit & 32) !== 0;
        value += (digit & 31) << shift;
        if (continuation) {
          shift += 5;
          continue;
        }
        const negative = (value & 1) === 1;
        values.push((negative ? -1 : 1) * (value >> 1));
        value = 0;
        shift = 0;
      }
      return shift === 0 ? values : [];
    }
    function parseSourceMapMappings(payload) {
      const mappings = typeof payload?.mappings === "string" ? payload.mappings : "";
      const sources = Array.isArray(payload?.sources) ? payload.sources : [];
      const names = Array.isArray(payload?.names) ? payload.names : [];
      const entries = [];
      let sourceIndex = 0;
      let originalLine = 0;
      let originalColumn = 0;
      let nameIndex = 0;
      const lines = mappings.split(";");
      for (let generatedLine = 0; generatedLine < lines.length; generatedLine += 1) {
        let generatedColumn = 0;
        for (const segment of lines[generatedLine].split(",")) {
          if (!segment) continue;
          const fields = decodeSourceMapVlq(segment);
          if (fields.length === 0) continue;
          generatedColumn += fields[0];
          if (fields.length < 4) {
            entries.push({ generatedLine, generatedColumn });
            continue;
          }
          sourceIndex += fields[1];
          originalLine += fields[2];
          originalColumn += fields[3];
          const entry = {
            generatedLine,
            generatedColumn,
            originalSource: sources[sourceIndex],
            originalLine,
            originalColumn
          };
          if (fields.length >= 5) {
            nameIndex += fields[4];
          }
          if (names[nameIndex] !== undefined) entry.name = names[nameIndex];
          entries.push(entry);
        }
      }
      return entries;
    }
    function formatSourceMapMappings(entries) {
      return entries.map((entry) => {
        if (!Object.hasOwn(entry, "originalSource")) {
          return [entry.generatedLine, entry.generatedColumn];
        }
        return [
          entry.generatedLine,
          entry.generatedColumn,
          entry.originalSource,
          entry.originalLine,
          entry.originalColumn,
          entry.name
        ];
      });
    }
    function findSourceMapEntry(entries, lineOffset, columnOffset) {
      if (!Number.isFinite(lineOffset) || !Number.isFinite(columnOffset) || lineOffset < 0 || columnOffset < 0) return undefined;
      let selected;
      for (const entry of entries) {
        if (entry.generatedLine > lineOffset) break;
        if (entry.generatedLine === lineOffset && entry.generatedColumn > columnOffset) break;
        selected = entry;
      }
      return selected;
    }
    function cloneSourceMapEntry(entry) {
      if (!entry) return {};
      const result = {
        generatedLine: entry.generatedLine,
        generatedColumn: entry.generatedColumn
      };
      if (Object.hasOwn(entry, "originalSource")) {
        result.originalSource = entry.originalSource;
        result.originalLine = entry.originalLine;
        result.originalColumn = entry.originalColumn;
        if (Object.hasOwn(entry, "name")) result.name = entry.name;
      }
      return result;
    }
    function createSourceMapOrigin(entry, lineNumber, columnNumber) {
      if (!entry || !Object.hasOwn(entry, "originalSource")) return {};
      const generatedLine = lineNumber - 1;
      const lineDelta = Math.max(0, generatedLine - entry.generatedLine);
      const columnDelta = lineDelta === 0 ? Math.max(0, columnNumber - entry.generatedColumn) : columnNumber;
      if (entry.originalLine === 0 && entry.originalColumn === 0 && lineDelta === 0 && columnDelta === 0) return {};
      const result = {};
      if (Object.hasOwn(entry, "name")) result.name = entry.name;
      result.fileName = entry.originalSource;
      result.lineNumber = entry.originalLine + 1 + lineDelta;
      result.columnNumber = entry.originalColumn + columnDelta;
      return result;
    }
    const moduleParentSymbol = Symbol("opencontainers.module.parent");
    function OpenContainersModule(id = "", parent = null) {
      this.id = id;
      this.path = dirname(id || "/workspace");
      this.exports = {};
      this.filename = id;
      this.loaded = false;
      this.parent = parent;
      this.children = [];
      this.paths = loader.nodeModulePaths(this.path);
      Object.defineProperty(this, "__opencontainersReadSource", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: (sourceFilename = this.filename) => loader.readModuleSource(normalizePath(sourceFilename))
      });
    }
    Object.defineProperty(OpenContainersModule, "name", {
      configurable: true,
      value: "Module"
    });
    Object.defineProperties(OpenContainersModule.prototype, {
      constructor: {
        enumerable: false,
        configurable: false,
        get: function get() {
          return OpenContainersModule;
        }
      },
      isPreloading: {
        enumerable: false,
        configurable: false,
        get() {
          return false;
        }
      },
      parent: {
        enumerable: false,
        configurable: false,
        get: function deprecated() {
          return this[moduleParentSymbol];
        },
        set: function deprecated(value) {
          Object.defineProperty(this, moduleParentSymbol, {
            configurable: true,
            writable: true,
            value: value ?? undefined
          });
        }
      },
      load: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: function(filename) {
          const resolved = normalizePath(filename);
          this.filename = resolved;
          this.path = dirname(resolved);
          this.paths = loader.nodeModulePaths(this.path);
          const extension = moduleExtensionForPath(resolved);
          const extensionHandler = MODULE_EXTENSIONS[extension];
          if (extensionHandler) extensionHandler(this, resolved);
          else loader.compileCommonJsModule(this, loader.readModuleSource(resolved), resolved);
          this.loaded = true;
        }
      },
      require: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: function(specifier) {
          validateCommonJsRequireId(specifier);
          const receiver = this ?? {};
          const parentFilename = receiver.filename || receiver.id || `${loader.descriptor.cwd}/[repl].js`;
          const parentModule = (receiver && typeof receiver === "object") ? receiver : null;
          return loader.require(specifier, parentFilename, parentModule);
        }
      },
      _compile: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: function(content, filename, format) {
          return loader.compileCommonJsModule(this, String(content), filename ?? this.filename);
        }
      }
    });
    for (const name of ["load", "require", "_compile"]) {
      Object.defineProperty(OpenContainersModule.prototype[name], "name", {
        configurable: true,
        value: ""
      });
    }

    let moduleStat = function stat(path) {
      try {
        const stats = loader.kernel.fs.statSync(fileUrlToPath(String(path?.href ?? path)));
        if (stats.isFile?.()) return 0;
        if (stats.isDirectory?.()) return 1;
        return -2;
      } catch {
        return -2;
      }
    };
    let moduleReadPackage = (requestPath) => {
      const pjsonPath = joinPath(fileUrlToPath(String(requestPath?.href ?? requestPath)), "package.json");
      const fallback = { type: "none", exists: false, pjsonPath };
      try {
        const parsed = JSON.parse(loader.kernel.fs.readFileSync(pjsonPath, "utf8"));
        return {
          ...(parsed.name !== undefined ? { name: parsed.name } : {}),
          ...(parsed.main !== undefined ? { main: parsed.main } : {}),
          type: parsed.type ?? "none",
          ...(parsed.exports !== undefined ? { exports: parsed.exports } : {}),
          ...(parsed.imports !== undefined ? { imports: parsed.imports } : {}),
          exists: true,
          pjsonPath
        };
      } catch {
        return fallback;
      }
    };
    Object.defineProperty(moduleReadPackage, "name", {
      configurable: true,
      value: "_readPackage"
    });
    let moduleWrap = function wrap(source) {
      return `${moduleWrapper[0]}${source}${moduleWrapper[1]}`;
    };
    Object.defineProperty(OpenContainersModule, "_stat", {
      enumerable: false,
      configurable: true,
      get() {
        return moduleStat;
      },
      set(value) {
        moduleStat = value;
      }
    });
    const initializeGlobalPaths = () => {
      OpenContainersModule.globalPaths.length = 0;
      OpenContainersModule.globalPaths.push(...createModuleGlobalPaths(loader.process));
    };
    OpenContainersModule._cache = this.requireCache;
    OpenContainersModule._pathCache = Object.create(null);
    OpenContainersModule._extensions = MODULE_EXTENSIONS;
    OpenContainersModule.globalPaths = [];
    initializeGlobalPaths();
    Object.defineProperty(OpenContainersModule, "wrap", {
      configurable: false,
      enumerable: false,
      get: () => moduleWrap,
      set: (value) => {
        moduleWrap = value;
      }
    });
    Object.defineProperty(OpenContainersModule, "wrapper", {
      configurable: false,
      enumerable: false,
      get: () => moduleWrapper,
      set: (value) => {
        moduleWrapper = value;
      }
    });
    OpenContainersModule.isBuiltin = isBuiltin;
    Object.defineProperty(OpenContainersModule, "_readPackage", {
      enumerable: false,
      configurable: true,
      get() {
        return moduleReadPackage;
      },
      set(value) {
        moduleReadPackage = value;
      }
    });
    OpenContainersModule._findPath = function(request, paths, isMain) {
      paths ??= [];
      for (const candidate of Array.isArray(paths) ? paths : []) {
        try {
          return loader.resolve(request, joinPath(candidate, "[module].js"), { mode: "require" });
        } catch {}
      }
      return false;
    };
    OpenContainersModule._nodeModulePaths = function(from) {
      return loader.nodeModulePaths(from);
    };
    OpenContainersModule._resolveLookupPaths = function(request, parent) {
      parent ??= null;
      if (OpenContainersModule.isBuiltin(request)) return null;
      const parentFilename = parent?.filename ?? parent?.id ?? `${loader.descriptor.cwd}/[repl].js`;
      return loader.nodeModulePaths(dirname(parentFilename));
    };
    OpenContainersModule._load = function(request, parent, isMain) {
      parent ??= null;
      const parentFilename = parent?.filename ?? parent?.id ?? `${loader.descriptor.cwd}/[repl].js`;
      return loader.require(request, parentFilename, parent);
    };
    OpenContainersModule._resolveFilename = function(request, parent, isMain, options) {
      parent ??= null;
      const parentFilename = parent?.filename ?? parent?.id ?? `${loader.descriptor.cwd}/[repl].js`;
      return loader.resolve(request, parentFilename, { mode: "require", resolveOptions: options });
    };
    for (const name of ["_findPath", "_nodeModulePaths", "_resolveLookupPaths", "_load", "_resolveFilename"]) {
      Object.defineProperty(OpenContainersModule[name], "name", {
        configurable: true,
        value: ""
      });
    }
    OpenContainersModule.createRequire = createRequire;
    OpenContainersModule._initPaths = function() {
      initializeGlobalPaths();
    };
    OpenContainersModule._preloadModules = function(requests) {};
    for (const name of ["_initPaths", "_preloadModules"]) {
      Object.defineProperty(OpenContainersModule[name], "name", {
        configurable: true,
        value: ""
      });
    }
    OpenContainersModule.syncBuiltinESMExports = function syncBuiltinESMExports() {
      syncBuiltinModuleNamespaceExports();
    };
    OpenContainersModule.Module = OpenContainersModule;
    OpenContainersModule.registerHooks = function registerHooks(hooks) {
      const handle = new ModuleHooks(hooks);
      loader.moduleHooks.push(handle);
      return handle;
    };
    OpenContainersModule.builtinModules = builtinModules;
    OpenContainersModule.runMain = function executeUserEntryPoint() {};
    OpenContainersModule.register = function register(specifier) {
      loader.registerModuleLoader(specifier, arguments[1]);
    };
    OpenContainersModule.constants = Object.freeze(Object.assign(Object.create(null), { compileCacheStatus }));
    OpenContainersModule.enableCompileCache = function enableCompileCache(cacheDir) {
      if (cacheDir === null || (cacheDir !== undefined && typeof cacheDir !== "string" && typeof cacheDir !== "object")) {
        throw Object.assign(new TypeError("cacheDir should be a string"), {
          code: "ERR_INVALID_ARG_TYPE"
        });
      }
      const directory = resolvePath(loader.descriptor.cwd, cacheDir === undefined || typeof cacheDir === "object" ? "/tmp/opencontainers-compile-cache" : cacheDir);
      const status = compileCacheDirectory ? compileCacheStatus.ALREADY_ENABLED : compileCacheStatus.ENABLED;
      compileCacheDirectory ??= directory;
      return { status, directory: compileCacheDirectory };
    };
    OpenContainersModule.findPackageJSON = function findPackageJSON(specifier, base = `${loader.descriptor.cwd}/[repl].js`) {
      if (arguments.length === 0) throw createFindPackageJsonMissingSpecifierError();
      if (typeof specifier === "symbol") throw createFindPackageJsonInvalidArgTypeError("specifier", "string", specifier);
      const basePath = normalizeFindPackageJsonBase(base, `${loader.descriptor.cwd}/[repl].js`);
      const specifierString = String(specifier);
      if (OpenContainersModule.isBuiltin(specifierString)) return undefined;
      let resolved;
      try {
        resolved = loader.resolve(specifierString, basePath, { mode: "require" });
      } catch (error) {
        if (error instanceof ModuleResolutionError) {
          resolved = findPackageJsonPathFallback(loader, specifierString, basePath);
          if (resolved) return loader.findPackageJsonForPath(resolved);
          throw createFindPackageJsonModuleNotFoundError(specifierString, basePath);
        }
        throw error;
      }
      return loader.findPackageJsonForPath(resolved);
    };
    const flushCompileCache = () => {};
    Object.defineProperty(flushCompileCache, "name", { configurable: true, value: "flushCompileCache" });
    OpenContainersModule.flushCompileCache = flushCompileCache;
    OpenContainersModule.getCompileCacheDir = function getCompileCacheDir() {
      return compileCacheDirectory;
    };
    OpenContainersModule.stripTypeScriptTypes = stripTypeScriptTypes;
    OpenContainersModule.findSourceMap = function findSourceMap(source) {
      return undefined;
    };
    OpenContainersModule.SourceMap = class SourceMap {
      #payload;

      constructor(payload) {
        this.#payload = payload === undefined ? {} : payload;
      }

      get payload() {
        return this.#payload;
      }

      get lineLengths() {
        return undefined;
      }

      get [sourceMapMappingsSymbol]() {
        return formatSourceMapMappings(parseSourceMapMappings(this.#payload));
      }

      findEntry(lineOffset, columnOffset) {
        return cloneSourceMapEntry(findSourceMapEntry(parseSourceMapMappings(this.#payload), lineOffset, columnOffset));
      }

      findOrigin(lineNumber, columnNumber) {
        if (!Number.isFinite(lineNumber) || !Number.isFinite(columnNumber) || lineNumber <= 0 || columnNumber < 0) return {};
        const entry = findSourceMapEntry(parseSourceMapMappings(this.#payload), lineNumber - 1, columnNumber);
        return createSourceMapOrigin(entry, lineNumber, columnNumber);
      }
    };
    OpenContainersModule.getSourceMapsSupport = function getSourceMapsSupport() {
      return { ...sourceMapsSupport };
    };
    OpenContainersModule.setSourceMapsSupport = function setSourceMapsSupport(enabledOrOptions) {
      if (enabledOrOptions === undefined) enabledOrOptions = true;
      if (typeof enabledOrOptions === "boolean") {
        sourceMapsSupport = {
          ...sourceMapsSupport,
          enabled: enabledOrOptions
        };
        return;
      }
      if (enabledOrOptions && typeof enabledOrOptions === "object") {
        sourceMapsSupport = {
          enabled: Boolean(enabledOrOptions.enabled ?? sourceMapsSupport.enabled),
          nodeModules: Boolean(enabledOrOptions.nodeModules ?? sourceMapsSupport.nodeModules),
          generatedCode: Boolean(enabledOrOptions.generatedCode ?? sourceMapsSupport.generatedCode)
        };
      }
    };
    return OpenContainersModule;
  }

  findPackageJsonForPath(path) {
    let current = normalizePath(String(path || this.descriptor.cwd));
    try {
      const stats = this.kernel.fs.statSync(current);
      if (!stats.isDirectory?.()) current = dirname(current);
    } catch {
      current = dirname(current);
    }
    while (current && current !== ".") {
      const candidate = joinPath(current, "package.json");
      if (this.kernel.fs.existsSync(candidate)) return candidate;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }

  resolve(specifier, parentFilename, options = {}) {
    if (this.loadCoreModule(specifier)) return specifier;
    specifier = fileUrlToPath(stripResourceQuery(specifier));
    const parentDirectory = parentFilename ? dirname(parentFilename) : this.descriptor.cwd;
    const mode = options.mode ?? "require";
    const explicitLookupPaths = normalizeResolveOptionsPaths(options.resolveOptions, this.descriptor.cwd);

    if (specifier.startsWith("#")) {
      return this.resolvePackageImport(specifier, parentDirectory, parentFilename, { mode });
    }

    if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
      return this.resolveAsFileOrDirectory(resolvePath(parentDirectory, specifier), specifier, parentFilename, { mode });
    }

    return this.resolveNodeModule(specifier, parentDirectory, parentFilename, {
      mode,
      lookupPaths: explicitLookupPaths
    });
  }

  resolveAsFileOrDirectory(basePath, specifier, parentFilename, options = {}) {
    for (const candidate of this.fileCandidates(basePath)) {
      if (this.kernel.fs.existsSync(candidate) && this.kernel.fs.statSync(candidate).isFile()) return candidate;
    }
    if (this.kernel.fs.existsSync(basePath) && this.kernel.fs.statSync(basePath).isDirectory()) {
      const packagePath = joinPath(basePath, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
        const entry = this.packageEntry(pkg, ".", {
          packageName: pkg.name ?? basePath,
          packageRoot: basePath,
          mode: options.mode
        });
        if (entry) {
          try {
            return this.resolveAsFileOrDirectory(joinPath(basePath, entry), specifier, parentFilename, options);
          } catch (error) {
            if (!(error instanceof ModuleResolutionError)) throw error;
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

  resolveNodeModule(specifier, parentDirectory, parentFilename, options = {}) {
    const packageParts = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2)
      : [specifier.split("/")[0]];
    const packageName = packageParts.join("/");
    const packageSubpath = specifier.slice(packageName.length).replace(/^\//, "");
    const selfReference = this.resolvePackageSelfReference(packageName, packageSubpath, parentDirectory, parentFilename, options);
    if (selfReference) return selfReference;

    const startingDirectories = options.lookupPaths ?? [parentDirectory];
    const visited = new Set();
    for (const startingDirectory of startingDirectories) {
      let current = normalizePath(startingDirectory);
      while (true) {
        if (!visited.has(current)) {
          visited.add(current);
          const packageRoot = joinPath(current, "node_modules", packageName);
          if (this.kernel.fs.existsSync(packageRoot)) {
            const packagePath = joinPath(packageRoot, "package.json");
            if (this.kernel.fs.existsSync(packagePath)) {
              const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
              const exportTarget = this.packageEntry(pkg, packageSubpath ? `./${packageSubpath}` : ".", {
                packageName,
                packageRoot,
                mode: options.mode
              });
              if (exportTarget) {
                return this.resolveAsFileOrDirectory(joinPath(packageRoot, exportTarget), specifier, parentFilename, options);
              }
            }
            const target = packageSubpath ? joinPath(packageRoot, packageSubpath) : packageRoot;
            return this.resolveAsFileOrDirectory(target, specifier, parentFilename, options);
          }
        }
        if (current === "/") break;
        current = dirname(current);
      }
    }
    if (options.lookupPaths === undefined) {
      for (const globalPath of createModuleGlobalPaths(this.process)) {
        const packageRoot = joinPath(globalPath, packageName);
        if (!this.kernel.fs.existsSync(packageRoot)) continue;
        const packagePath = joinPath(packageRoot, "package.json");
        if (this.kernel.fs.existsSync(packagePath)) {
          const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
          const exportTarget = this.packageEntry(pkg, packageSubpath ? `./${packageSubpath}` : ".", {
            packageName,
            packageRoot,
            mode: options.mode
          });
          if (exportTarget) {
            return this.resolveAsFileOrDirectory(joinPath(packageRoot, exportTarget), specifier, parentFilename, options);
          }
        }
        const target = packageSubpath ? joinPath(packageRoot, packageSubpath) : packageRoot;
        return this.resolveAsFileOrDirectory(target, specifier, parentFilename, options);
      }
    }
    throw new ModuleResolutionError(specifier, parentFilename);
  }

  resolvePackageSelfReference(packageName, packageSubpath, parentDirectory, parentFilename, options = {}) {
    const scope = this.findPackageScope(parentDirectory);
    if (!scope || scope.pkg.name !== packageName || !Object.prototype.hasOwnProperty.call(scope.pkg, "exports")) {
      return undefined;
    }
    const exportTarget = this.packageEntry(scope.pkg, packageSubpath ? `./${packageSubpath}` : ".", {
      packageName,
      packageRoot: scope.root,
      mode: options.mode
    });
    if (!exportTarget) return undefined;
    return this.resolveAsFileOrDirectory(joinPath(scope.root, exportTarget), packageName, parentFilename, options);
  }

  findPackageScope(directory) {
    let current = normalizePath(directory || this.descriptor.cwd);
    while (true) {
      const packagePath = joinPath(current, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        return {
          root: current,
          pkg: JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"))
        };
      }
      const parent = dirname(current);
      if (current === "/" || parent === current) return undefined;
      current = parent;
    }
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

  resolvePackageImport(specifier, parentDirectory, parentFilename, options = {}) {
    let current = normalizePath(parentDirectory);
    while (true) {
      const packagePath = joinPath(current, "package.json");
      if (this.kernel.fs.existsSync(packagePath)) {
        try {
          const pkg = JSON.parse(this.kernel.fs.readFileSync(packagePath, "utf8"));
          const importsMap = pkg.imports;
          if (importsMap && typeof importsMap === "object") {
            const match = this.packageMapEntry(importsMap, specifier);
            if (match.found) {
              const target = this.resolvePackageExportTarget(match.value, {
                packageName: pkg.name ?? current,
                packageRoot: current,
                subpath: specifier,
                imports: true,
                mode: options.mode
              });
              if (target) return this.resolvePackageImportTarget(target, current, specifier, parentFilename, options);
            }
          }
        } catch (error) {
          if (error instanceof ModuleResolutionError || isPackageResolutionError(error)) throw error;
        }
        throw new PackageImportNotDefinedError(specifier, current);
      }
      if (current === "/") break;
      current = dirname(current);
    }
    throw new PackageImportNotDefinedError(specifier, parentFilename);
  }

  resolvePackageImportTarget(target, packageRoot, specifier, parentFilename, options = {}) {
    if (target.startsWith("./") || target.startsWith("../")) {
      return this.resolveAsFileOrDirectory(joinPath(packageRoot, target), specifier, parentFilename, options);
    }
    if (target.startsWith("/")) {
      return this.resolveAsFileOrDirectory(target, specifier, parentFilename, options);
    }
    return this.resolve(target, joinPath(packageRoot, "package.json"), options);
  }

  packageEntry(pkg, subpath = ".", options = {}) {
    const packageName = options.packageName ?? pkg.name ?? "(anonymous package)";
    const packageRoot = options.packageRoot;
    if (Object.prototype.hasOwnProperty.call(pkg, "exports")) {
      if (typeof pkg.exports === "string") {
        if (subpath !== ".") throw new PackagePathNotExportedError(packageName, subpath);
        return this.resolvePackageExportTarget(pkg.exports, {
          packageName,
          packageRoot,
          subpath,
          mode: options.mode
        });
      }
      if (pkg.exports && typeof pkg.exports === "object") {
        this.validatePackageExportsMap(pkg.exports, options);
        const match = this.packageExportsEntry(pkg.exports, subpath);
        if (match.found) {
          const resolved = this.resolvePackageExportTarget(match.value, {
            packageName,
            packageRoot,
            subpath,
            mode: options.mode
          });
          if (resolved) return resolved;
        }
      }
      throw new PackagePathNotExportedError(packageName, subpath);
    }
    if (subpath !== ".") return null;
    return pkg.main ?? pkg.module ?? "index.js";
  }

  packageExportsEntry(exportsMap, subpath) {
    if (subpath === "." && this.isConditionalExportObject(exportsMap)) {
      return { found: true, value: exportsMap };
    }
    return this.packageMapEntry(exportsMap, subpath);
  }

  validatePackageExportsMap(exportsMap, options = {}) {
    const keys = Object.keys(exportsMap);
    const hasSubpathKeys = keys.some((key) => key.startsWith("."));
    const hasConditionKeys = keys.some((key) => !key.startsWith("."));
    if (!hasSubpathKeys || !hasConditionKeys) return;
    const packagePath = options.packageRoot
      ? joinPath(options.packageRoot, "package.json")
      : `${options.packageName ?? "(anonymous package)"}/package.json`;
    throw new InvalidPackageConfigError(packagePath);
  }

  packageMapEntry(exportsMap, subpath) {
    if (Object.prototype.hasOwnProperty.call(exportsMap, subpath)) {
      return { found: true, value: exportsMap[subpath] };
    }
    const patterns = [];
    for (const [key, value] of Object.entries(exportsMap)) {
      if (!key.includes("*")) continue;
      const [prefix, suffix] = key.split("*");
      if (subpath.startsWith(prefix) && subpath.endsWith(suffix ?? "")) {
        const wildcard = subpath.slice(prefix.length, subpath.length - (suffix ?? "").length);
        patterns.push({
          key,
          prefix,
          suffix: suffix ?? "",
          value,
          wildcard
        });
      }
    }
    patterns.sort((left, right) => (
      right.prefix.length - left.prefix.length
      || right.suffix.length - left.suffix.length
      || right.key.length - left.key.length
    ));
    const match = patterns[0];
    if (!match) return { found: false, value: undefined };
    return {
      found: true,
      value: this.replacePackageExportWildcard(match.value, match.wildcard)
    };
  }

  replacePackageExportWildcard(value, wildcard) {
    if (typeof value === "string") return value.replaceAll("*", wildcard);
    if (Array.isArray(value)) {
      return value.map((entry) => this.replacePackageExportWildcard(entry, wildcard));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        this.replacePackageExportWildcard(entry, wildcard)
      ]));
    }
    return value;
  }

  resolvePackageExportTarget(target, options = {}) {
    if (!target) return null;
    if (typeof target === "string") {
      if (options.imports) {
        this.validatePackageImportTarget(target, options);
      } else {
        this.validatePackageExportTarget(target, options);
      }
      return target;
    }
    if (Array.isArray(target)) {
      for (const item of target) {
        const resolved = this.resolvePackageExportTarget(item, options);
        if (resolved) return resolved;
      }
      return null;
    }
    if (typeof target === "object") {
      const conditions = new Set(packageExportConditions(options.mode));
      for (const [condition, value] of Object.entries(target)) {
        if (conditions.has(condition)) {
          const resolved = this.resolvePackageExportTarget(value, options);
          if (resolved) return resolved;
        }
      }
      if (Object.prototype.hasOwnProperty.call(target, "browser")) {
        const resolved = this.resolvePackageExportTarget(target.browser, options);
        if (resolved) return resolved;
      }
    }
    return null;
  }

  validatePackageExportTarget(target, options = {}) {
    if (!target.startsWith("./")) {
      throw new InvalidPackageTargetError(options.packageName ?? "(anonymous package)", options.subpath ?? ".", target);
    }
    const segments = target.slice(2).split("/");
    if (segments.includes("node_modules")) {
      throw new InvalidPackageTargetError(options.packageName ?? "(anonymous package)", options.subpath ?? ".", target);
    }
    if (!options.packageRoot) return;
    const resolved = joinPath(options.packageRoot, target);
    if (!isInsidePath(options.packageRoot, resolved)) {
      throw new InvalidPackageTargetError(options.packageName ?? "(anonymous package)", options.subpath ?? ".", target);
    }
  }

  validatePackageImportTarget(target, options = {}) {
    if (!target.startsWith(".") && !target.startsWith("/")) return;
    this.validatePackageExportTarget(target, options);
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
      const parent = dirname(current);
      if (current === "/" || parent === current) return undefined;
      current = parent;
    }
  }
}

function stripResourceQuery(specifier) {
  const value = String(specifier);
  if (value.startsWith("#")) return value;
  return value.replace(/[?#].*$/, "");
}

function moduleExtensionForPath(filename) {
  const basename = String(filename).slice(String(filename).lastIndexOf("/") + 1);
  const index = basename.lastIndexOf(".");
  if (index <= 0) return ".js";
  const extension = basename.slice(index);
  if (extension === ".cjs" || extension === ".mjs") return ".js";
  return extension;
}

function createModuleGlobalPaths(process) {
  const paths = [];
  const nodePath = process?.env?.NODE_PATH;
  if (nodePath) {
    for (const entry of String(nodePath).split(":")) {
      if (entry) paths.push(normalizePath(entry));
    }
  }
  const home = process?.env?.HOME;
  if (home) {
    paths.push(joinPath(normalizePath(home), ".node_modules"));
    paths.push(joinPath(normalizePath(home), ".node_libraries"));
  }
  paths.push(joinPath(moduleInstallPrefix(process?.execPath), "lib/node"));
  return [...new Set(paths)];
}

function moduleInstallPrefix(execPath) {
  const normalized = normalizePath(execPath || "/usr/local/bin/node");
  const binaryDir = dirname(normalized);
  return dirname(binaryDir || "/usr/local/bin");
}

function stripHashbang(source) {
  return String(source).replace(/^#![^\n\r]*(?:\r?\n|$)/, "");
}

function fileUrlToPath(specifier, options = undefined) {
  if (!String(specifier).startsWith("file://")) return specifier;
  try {
    const url = new URL(String(specifier));
    return fileURLToPathString(url, options);
  } catch {
    return specifier.replace(/^file:\/\//, "");
  }
}

function createInvalidCreateRequireFilenameError(filename) {
  const error = new TypeError(`The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received ${formatInvalidReceived(filename)}`);
  error.code = "ERR_INVALID_ARG_VALUE";
  return error;
}

function normalizeResolveOptionsPaths(options, cwd) {
  if (options === null || typeof options !== "object" || !Object.hasOwn(options, "paths")) return undefined;
  const paths = options.paths;
  if (paths === undefined) return undefined;
  if (!Array.isArray(paths)) throw createInvalidResolveOptionsPathsError(paths);
  return paths.map((entry, index) => {
    if (typeof entry !== "string") throw createInvalidArgTypeError(`paths[${index}]`, "string", entry);
    return entry.startsWith("/") ? normalizePath(entry) : resolvePath(cwd, entry);
  });
}

function createInvalidResolveOptionsPathsError(paths) {
  const error = new TypeError(`The property 'options.paths' is invalid. Received ${formatResolveOptionsPathsReceived(paths)}`);
  error.code = "ERR_INVALID_ARG_VALUE";
  return error;
}

function formatResolveOptionsPathsReceived(value) {
  if (typeof value === "string") return `'${value}'`;
  if (value && typeof value === "object" && value.constructor === Object && Object.keys(value).length === 0) return "{}";
  return String(value);
}

function createFindPackageJsonMissingSpecifierError() {
  const error = new TypeError("The \"specifier\" argument must be specified");
  error.code = "ERR_MISSING_ARGS";
  return error;
}

function createFindPackageJsonInvalidArgTypeError(name, expected, value) {
  const error = new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createFindPackageJsonModuleNotFoundError(specifier, basePath) {
  const error = new Error(`Cannot find package '${specifier}' imported from ${basePath}`);
  error.code = "ERR_MODULE_NOT_FOUND";
  return error;
}

function findPackageJsonPathFallback(loader, specifier, basePath) {
  const pathSpecifier = fileUrlToPath(specifier);
  if (
    pathSpecifier !== "." &&
    pathSpecifier !== ".." &&
    !pathSpecifier.startsWith("./") &&
    !pathSpecifier.startsWith("../") &&
    !pathSpecifier.startsWith("/")
  ) {
    return undefined;
  }
  const resolvedPath = pathSpecifier.startsWith("/")
    ? pathSpecifier
    : resolvePath(dirname(basePath), pathSpecifier);
  return loader.kernel.fs.existsSync(resolvedPath) ? resolvedPath : undefined;
}

function normalizeFindPackageJsonBase(base, defaultBase) {
  if (base === undefined) return defaultBase;
  if (isURLObject(base)) return fileURLToPathString(base);
  if (typeof base !== "string") throw createFindPackageJsonInvalidArgTypeError("base", "string", base);
  return fileUrlToPath(base);
}

function isURLObject(value) {
  return value instanceof URL;
}

function localFileUrlPath(url, received) {
  if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) {
    throw createInvalidCreateRequireFilenameError(received);
  }
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    throw createInvalidCreateRequireFilenameError(received);
  }
}

function normalizeCreateRequireFilename(filename) {
  if (isURLObject(filename)) {
    return localFileUrlPath(filename, filename);
  }
  if (typeof filename !== "string") {
    throw createInvalidCreateRequireFilenameError(filename);
  }
  if (filename.startsWith("file:")) {
    try {
      return localFileUrlPath(new URL(filename), filename);
    } catch (error) {
      if (error?.code === "ERR_INVALID_ARG_VALUE") throw error;
      throw createInvalidCreateRequireFilenameError(filename);
    }
  }
  if (!filename.startsWith("/")) {
    throw createInvalidCreateRequireFilenameError(filename);
  }
  return filename;
}

function pathToFileUrl(path) {
  return `file://${String(path).split("/").map((part, index) => (
    index === 0 ? "" : encodeURIComponent(part)
  )).join("/")}`;
}

function normalizeFileUrlWindowsOption(options) {
  return Boolean(options && typeof options === "object" && options.windows != null && options.windows);
}

function createInvalidFileUrlHostError(windows = false) {
  const suffix = windows ? "on windows" : "on linux";
  return Object.assign(new TypeError(`File URL host must be "localhost" or empty ${suffix}`), {
    code: "ERR_INVALID_FILE_URL_HOST"
  });
}

function createInvalidFileUrlPathError(message) {
  return Object.assign(new TypeError(message), {
    code: "ERR_INVALID_FILE_URL_PATH"
  });
}

function hasEncodedSlash(pathname) {
  return /%2f/i.test(pathname);
}

function hasEncodedWindowsSeparator(pathname) {
  return /%2f|%5c/i.test(pathname);
}

function fileURLToPathString(specifier, options = undefined) {
  const url = specifier instanceof URL ? specifier : new URL(String(specifier));
  if (url.protocol !== "file:") {
    throw Object.assign(new TypeError("The URL must be of scheme file"), {
      code: "ERR_INVALID_URL_SCHEME"
    });
  }
  const windows = normalizeFileUrlWindowsOption(options);
  if (windows) {
    if (hasEncodedWindowsSeparator(url.pathname)) {
      throw createInvalidFileUrlPathError("File URL path must not include encoded \\ or / characters");
    }
    return decodeWindowsFileUrlPath(url);
  }
  if (url.hostname && url.hostname !== "localhost") throw createInvalidFileUrlHostError(false);
  if (hasEncodedSlash(url.pathname)) {
    throw createInvalidFileUrlPathError("File URL path must not include encoded / characters");
  }
  return decodeURIComponent(url.pathname);
}

function decodeWindowsFileUrlPath(url) {
  if (url.hostname && url.hostname !== "localhost") {
    return `\\\\${url.hostname}${decodeURIComponent(url.pathname).replace(/\//g, "\\")}`;
  }
  const pathname = decodeURIComponent(url.pathname);
  const driveMatch = /^\/([a-zA-Z])[:|](\/.*)?$/.exec(pathname);
  if (!driveMatch) {
    throw createInvalidFileUrlPathError("File URL path must be absolute");
  }
  return `${driveMatch[1]}:${(driveMatch[2] ?? "").replace(/\//g, "\\")}`;
}

function pathToFileUrlWithOptions(path, options = undefined, cwd = "/workspace") {
  const source = String(path);
  if (!normalizeFileUrlWindowsOption(options)) {
    const absolutePath = source.startsWith("/") ? source : resolvePath(cwd, source);
    return new URL(`file://${encodeURI(absolutePath).replace(/#/g, "%23").replace(/\?/g, "%3F")}`);
  }
  const normalized = source.replace(/\\/g, "/");
  const uncMatch = /^\/\/([^/]+)\/([^/]+)(\/.*)?$/.exec(normalized);
  if (uncMatch) {
    const [, host, share, rest = ""] = uncMatch;
    const pathname = [share, ...rest.split("/").filter(Boolean)]
      .map(encodeURIComponent)
      .join("/");
    return new URL(`file://${host}/${pathname}`);
  }
  const driveAbsolute = /^([a-zA-Z]):[\/|](.*)$/.exec(normalized);
  if (driveAbsolute) {
    const [, drive, rest] = driveAbsolute;
    const pathname = rest.split("/").map(encodeURIComponent).join("/");
    return new URL(`file:///${drive}:/${pathname}`);
  }
  const driveRelative = /^([a-zA-Z]):(.*)$/.exec(normalized);
  if (driveRelative) {
    const [, drive, rest] = driveRelative;
    const resolved = resolvePath(cwd, rest || ".");
    return new URL(`file:///${drive}:${encodePosixFileUrlPath(resolved)}`);
  }
  const absolutePath = normalized.startsWith("/") ? normalized : resolvePath(cwd, normalized);
  return new URL(`file://${encodePosixFileUrlPath(absolutePath)}`);
}

function encodePosixFileUrlPath(pathname) {
  return String(pathname).split("/").map((part, index) => (
    index === 0 ? "" : encodeURIComponent(part)
  )).join("/");
}

function canonicalBuiltinUrl(specifier) {
  const rawSpecifier = String(specifier);
  const normalized = rawSpecifier.startsWith("node:") ? rawSpecifier.slice(5) : rawSpecifier;
  return `node:${normalized}`;
}

function markModuleHookNextResult(result) {
  if (result && typeof result === "object") moduleHookNextResults.add(result);
  return result;
}

function isModuleHookNextResult(result) {
  return Boolean(result && typeof result === "object" && moduleHookNextResults.has(result));
}

function normalizeCommonJsHookImportAttributes(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeCommonJsHookConditions(value) {
  return Array.isArray(value) ? [...value] : [...COMMONJS_HOOK_CONDITIONS];
}

function normalizeImportHookConditions(value) {
  return Array.isArray(value) ? [...value] : [...IMPORT_HOOK_CONDITIONS];
}

function createCommonJsResolveHookContext(overrides = {}) {
  return {
    parentURL: String(overrides.parentURL ?? ""),
    importAttributes: normalizeCommonJsHookImportAttributes(overrides.importAttributes),
    conditions: normalizeCommonJsHookConditions(overrides.conditions)
  };
}

function normalizeCommonJsResolveHookContext(context, fallback) {
  const source = context && typeof context === "object" ? context : fallback;
  return createCommonJsResolveHookContext({
    parentURL: source.parentURL ?? fallback.parentURL,
    importAttributes: source.importAttributes ?? fallback.importAttributes,
    conditions: source.conditions ?? fallback.conditions
  });
}

function createImportResolveHookContext(overrides = {}) {
  return {
    parentURL: String(overrides.parentURL ?? ""),
    importAttributes: normalizeCommonJsHookImportAttributes(overrides.importAttributes),
    conditions: normalizeImportHookConditions(overrides.conditions)
  };
}

function normalizeImportResolveHookContext(context, fallback) {
  const source = context && typeof context === "object" ? context : fallback;
  return createImportResolveHookContext({
    parentURL: source.parentURL ?? fallback.parentURL,
    importAttributes: source.importAttributes ?? fallback.importAttributes,
    conditions: source.conditions ?? fallback.conditions
  });
}

function createCommonJsLoadHookContext(resolution) {
  return {
    format: resolution.format,
    importAttributes: normalizeCommonJsHookImportAttributes(resolution.importAttributes),
    conditions: [...COMMONJS_HOOK_CONDITIONS]
  };
}

function normalizeCommonJsLoadHookContext(context, fallback) {
  const source = context && typeof context === "object" ? context : fallback;
  return {
    format: source.format ?? fallback.format,
    importAttributes: normalizeCommonJsHookImportAttributes(source.importAttributes ?? fallback.importAttributes),
    conditions: normalizeCommonJsHookConditions(source.conditions ?? fallback.conditions)
  };
}

function createImportLoadHookContext(resolution) {
  return {
    format: resolution.format,
    importAttributes: normalizeCommonJsHookImportAttributes(resolution.importAttributes),
    conditions: [...IMPORT_HOOK_CONDITIONS]
  };
}

function normalizeImportLoadHookContext(context, fallback) {
  const source = context && typeof context === "object" ? context : fallback;
  return {
    format: source.format ?? fallback.format,
    importAttributes: normalizeCommonJsHookImportAttributes(source.importAttributes ?? fallback.importAttributes),
    conditions: normalizeImportHookConditions(source.conditions ?? fallback.conditions)
  };
}

function inferCommonJsHookFormat(url) {
  const specifier = String(url);
  if (specifier.startsWith("node:")) return "builtin";
  if (!isCommonJsHookFileLikeUrl(specifier)) return undefined;
  const path = commonJsHookCacheKeyFromUrl(specifier);
  const extension = moduleExtensionForPath(path);
  if (extension === ".json") return "json";
  if (extension === ".node") return "addon";
  return "commonjs";
}

function inferImportHookFormat(url) {
  const specifier = String(url);
  if (specifier.startsWith("node:")) return "builtin";
  if (!isCommonJsHookFileLikeUrl(specifier)) return undefined;
  const path = commonJsHookCacheKeyFromUrl(specifier);
  const extension = moduleExtensionForPath(path);
  if (extension === ".json") return "json";
  if (extension === ".node") return "addon";
  if (extension === ".cjs") return "commonjs";
  return "module";
}

function isCommonJsHookFileLikeUrl(url) {
  const specifier = String(url);
  return specifier.startsWith("file://") || specifier.startsWith("/");
}

function commonJsHookCacheKeyFromUrl(url) {
  const specifier = String(url);
  return normalizePath(specifier.startsWith("file://") ? fileUrlToPath(specifier) : specifier);
}

function validateCommonJsResolveHookResult(result) {
  if (!result || typeof result !== "object") {
    throw createInvalidReturnPropertyValueError("resolve", "an object", result);
  }
  if (!isModuleHookNextResult(result) && result.shortCircuit !== true) {
    throw createInvalidReturnPropertyValueError("shortCircuit", "true", result.shortCircuit);
  }
  if (typeof result.url !== "string") {
    throw createInvalidReturnPropertyValueError("url", "a string", result.url);
  }
}

function validateCommonJsLoadHookResult(result) {
  if (!result || typeof result !== "object") {
    throw createInvalidReturnPropertyValueError("load", "an object", result);
  }
  if (!isModuleHookNextResult(result) && result.shortCircuit !== true) {
    throw createInvalidReturnPropertyValueError("shortCircuit", "true", result.shortCircuit);
  }
  if (!isModuleHookNextResult(result) && result.format === "commonjs" && result.source == null) {
    throw createInvalidReturnPropertyValueError("source", "a string or binary source", result.source);
  }
}

function validateImportLoadHookResult(result) {
  if (!result || typeof result !== "object") {
    throw createInvalidReturnPropertyValueError("load", "an object", result);
  }
  if (!isModuleHookNextResult(result) && result.shortCircuit !== true) {
    throw createInvalidReturnPropertyValueError("shortCircuit", "true", result.shortCircuit);
  }
  if (!isModuleHookNextResult(result) && (result.format === "module" || result.format === "commonjs" || result.format === "json") && result.source == null) {
    throw createInvalidReturnPropertyValueError("source", "a string or binary source", result.source);
  }
}

function normalizeCommonJsLoadHookResult(result, resolution) {
  validateCommonJsLoadHookResult(result);
  const hasSource = Object.prototype.hasOwnProperty.call(result, "source");
  return {
    format: result.format ?? resolution.format,
    hasSource,
    source: hasSource ? commonJsHookSourceToString(result.source) : undefined
  };
}

function normalizeImportLoadHookResult(result, resolution) {
  validateImportLoadHookResult(result);
  const hasSource = Object.prototype.hasOwnProperty.call(result, "source");
  return {
    format: result.format ?? resolution.format,
    hasSource,
    source: hasSource ? commonJsHookSourceToString(result.source) : undefined
  };
}

function commonJsHookSourceToString(source) {
  if (source == null) {
    throw createInvalidReturnPropertyValueError("source", "a string or binary source", source);
  }
  if (typeof source === "string") return source;
  if (source instanceof ArrayBuffer) return textDecoder.decode(new Uint8Array(source));
  if (ArrayBuffer.isView(source)) {
    return textDecoder.decode(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }
  throw createInvalidReturnPropertyValueError("source", "a string or binary source", source);
}

function isPackageResolutionError(error) {
  return error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
    || error?.code === "ERR_PACKAGE_IMPORT_NOT_DEFINED"
    || error?.code === "ERR_INVALID_PACKAGE_TARGET"
    || error?.code === "ERR_INVALID_PACKAGE_CONFIG";
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

const LINUX_ERRNO_CONSTANTS = Object.freeze({
  EPERM: 1,
  ENOENT: 2,
  ESRCH: 3,
  EINTR: 4,
  EIO: 5,
  ENXIO: 6,
  E2BIG: 7,
  ENOEXEC: 8,
  EBADF: 9,
  ECHILD: 10,
  EAGAIN: 11,
  EWOULDBLOCK: 11,
  ENOMEM: 12,
  EACCES: 13,
  EFAULT: 14,
  EBUSY: 16,
  EEXIST: 17,
  EXDEV: 18,
  ENODEV: 19,
  ENOTDIR: 20,
  EISDIR: 21,
  EINVAL: 22,
  ENFILE: 23,
  EMFILE: 24,
  ENOTTY: 25,
  ETXTBSY: 26,
  EFBIG: 27,
  ENOSPC: 28,
  ESPIPE: 29,
  EROFS: 30,
  EMLINK: 31,
  EPIPE: 32,
  EDOM: 33,
  ERANGE: 34,
  EDEADLK: 35,
  ENAMETOOLONG: 36,
  ENOLCK: 37,
  ENOSYS: 38,
  ENOTEMPTY: 39,
  ELOOP: 40,
  ENOMSG: 42,
  EIDRM: 43,
  ENOSTR: 60,
  ENODATA: 61,
  ETIME: 62,
  ENOSR: 63,
  ENOLINK: 67,
  EPROTO: 71,
  EMULTIHOP: 72,
  EBADMSG: 74,
  EOVERFLOW: 75,
  EILSEQ: 84,
  ENOTSOCK: 88,
  EDESTADDRREQ: 89,
  EMSGSIZE: 90,
  EPROTOTYPE: 91,
  ENOPROTOOPT: 92,
  EPROTONOSUPPORT: 93,
  ENOTSUP: 95,
  EOPNOTSUPP: 95,
  EAFNOSUPPORT: 97,
  EADDRINUSE: 98,
  EADDRNOTAVAIL: 99,
  ENETDOWN: 100,
  ENETUNREACH: 101,
  ENETRESET: 102,
  ECONNABORTED: 103,
  ECONNRESET: 104,
  ENOBUFS: 105,
  EISCONN: 106,
  ENOTCONN: 107,
  ETIMEDOUT: 110,
  ECONNREFUSED: 111,
  EHOSTUNREACH: 113,
  EALREADY: 114,
  EINPROGRESS: 115,
  ESTALE: 116,
  EDQUOT: 122,
  ECANCELED: 125
});

const TOP_LEVEL_ERRNO_CONSTANT_NAMES = Object.freeze([
  "E2BIG",
  "EACCES",
  "EADDRINUSE",
  "EADDRNOTAVAIL",
  "EAFNOSUPPORT",
  "EAGAIN",
  "EALREADY",
  "EBADF",
  "EBADMSG",
  "EBUSY",
  "ECANCELED",
  "ECHILD",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EDEADLK",
  "EDESTADDRREQ",
  "EDOM",
  "EDQUOT",
  "EEXIST",
  "EFAULT",
  "EFBIG",
  "EHOSTUNREACH",
  "EIDRM",
  "EILSEQ",
  "EINPROGRESS",
  "EINTR",
  "EINVAL",
  "EIO",
  "EISCONN",
  "EISDIR",
  "ELOOP",
  "EMFILE",
  "EMLINK",
  "EMSGSIZE",
  "EMULTIHOP",
  "ENAMETOOLONG",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ENFILE",
  "ENOBUFS",
  "ENODATA",
  "ENODEV",
  "ENOENT",
  "ENOEXEC",
  "ENOLCK",
  "ENOLINK",
  "ENOMEM",
  "ENOMSG",
  "ENOPROTOOPT",
  "ENOSPC",
  "ENOSR",
  "ENOSTR",
  "ENOSYS",
  "ENOTCONN",
  "ENOTDIR",
  "ENOTEMPTY",
  "ENOTSOCK",
  "ENOTSUP",
  "ENOTTY",
  "ENXIO",
  "EOPNOTSUPP",
  "EOVERFLOW",
  "EPERM",
  "EPIPE",
  "EPROTO",
  "EPROTONOSUPPORT",
  "EPROTOTYPE",
  "ERANGE",
  "EROFS",
  "ESPIPE",
  "ESRCH",
  "ESTALE",
  "ETIME",
  "ETIMEDOUT",
  "ETXTBSY",
  "EWOULDBLOCK",
  "EXDEV"
]);

const TOP_LEVEL_ERRNO_CONSTANTS = Object.freeze(Object.fromEntries(
  TOP_LEVEL_ERRNO_CONSTANT_NAMES.map((name) => [name, LINUX_ERRNO_CONSTANTS[name]])
));

const LINUX_SIGNALS = new Map([
  ["SIGHUP", 1],
  ["SIGINT", 2],
  ["SIGQUIT", 3],
  ["SIGILL", 4],
  ["SIGTRAP", 5],
  ["SIGABRT", 6],
  ["SIGIOT", 6],
  ["SIGBUS", 7],
  ["SIGFPE", 8],
  ["SIGKILL", 9],
  ["SIGUSR1", 10],
  ["SIGSEGV", 11],
  ["SIGUSR2", 12],
  ["SIGPIPE", 13],
  ["SIGALRM", 14],
  ["SIGTERM", 15],
  ["SIGCHLD", 17],
  ["SIGCONT", 18],
  ["SIGSTOP", 19],
  ["SIGTSTP", 20],
  ["SIGTTIN", 21],
  ["SIGTTOU", 22],
  ["SIGURG", 23],
  ["SIGXCPU", 24],
  ["SIGXFSZ", 25],
  ["SIGVTALRM", 26],
  ["SIGPROF", 27],
  ["SIGWINCH", 28],
  ["SIGIO", 29],
  ["SIGINFO", 29],
  ["SIGPOLL", 29],
  ["SIGPWR", 30],
  ["SIGSYS", 31]
]);

const TOP_LEVEL_CONSTANT_SIGNALS = new Map(
  [...LINUX_SIGNALS].filter(([name]) => name !== "SIGPOLL" && name !== "SIGPWR")
);

const MIME_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MIME_PARAMS_PARSE_TOKEN = Symbol("opencontainers.mimeParamsParse");

class MIMEParams {
  constructor(init = "", parseToken = undefined) {
    this.#map = new Map();
    if (parseToken === MIME_PARAMS_PARSE_TOKEN) {
      this.#parse(init);
    }
  }

  get(name) {
    MIMEParams.#requireReceiver(this);
    return this.#map.get(normalizeMimeParameterName(name)) ?? null;
  }

  has(name) {
    MIMEParams.#requireReceiver(this);
    return this.#map.has(normalizeMimeParameterName(name));
  }

  set(name, value) {
    MIMEParams.#requireReceiver(this);
    this.#map.set(normalizeMimeParameterName(name), String(value));
  }

  delete(name) {
    MIMEParams.#requireReceiver(this);
    this.#map.delete(normalizeMimeParameterName(name));
  }

  *entries() {
    MIMEParams.#requireReceiver(this);
    yield* this.#map.entries();
  }

  *keys() {
    MIMEParams.#requireReceiver(this);
    yield* this.#map.keys();
  }

  *values() {
    MIMEParams.#requireReceiver(this);
    yield* this.#map.values();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  toString() {
    MIMEParams.#requireReceiver(this);
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

  static #requireReceiver(value) {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function") ||
      !(#map in value)
    ) {
      throw new TypeError("Receiver must be an instance of class MIMEParams");
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
    this.#params = new MIMEParams(parameterParts.join(";"), MIME_PARAMS_PARSE_TOKEN);
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

  get essence() {
    return `${this.type}/${this.subtype}`;
  }

  get params() {
    return this.#params;
  }

  toString() {
    const params = this.params.toString();
    return params ? `${this.essence};${params}` : this.essence;
  }

  #type;
  #subtype;
  #params;
}

alignMimePrototypeMetadata();

function alignMimePrototypeMetadata() {
  Object.defineProperty(MIMEParams.prototype, Symbol.iterator, {
    configurable: true,
    writable: true,
    value: MIMEParams.prototype.entries
  });
  Object.defineProperty(MIMEParams.prototype, "toJSON", {
    configurable: true,
    writable: true,
    value: MIMEParams.prototype.toString
  });
  Object.defineProperty(MIMEType.prototype, "toJSON", {
    configurable: true,
    writable: true,
    value: MIMEType.prototype.toString
  });
  reorderPrototypeProperties(MIMEParams.prototype, [
    "constructor",
    "delete",
    "get",
    "has",
    "set",
    "entries",
    "keys",
    "values",
    "toString",
    "toJSON"
  ]);
  reorderPrototypeProperties(MIMEType.prototype, [
    "constructor",
    "type",
    "subtype",
    "essence",
    "params",
    "toString",
    "toJSON"
  ]);
}

function reorderPrototypeProperties(prototype, names) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(prototype, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete prototype[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(prototype, name, descriptor);
  }
}

const ANSI_STYLES = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  faint: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  blink: [5, 25],
  inverse: [7, 27],
  swapColors: [7, 27],
  swapcolors: [7, 27],
  hidden: [8, 28],
  conceal: [8, 28],
  strikethrough: [9, 29],
  crossedout: [9, 29],
  strikeThrough: [9, 29],
  crossedOut: [9, 29],
  doubleunderline: [21, 24],
  doubleUnderline: [21, 24],
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],
  blackBright: [90, 39],
  redBright: [91, 39],
  greenBright: [92, 39],
  yellowBright: [93, 39],
  blueBright: [94, 39],
  magentaBright: [95, 39],
  cyanBright: [96, 39],
  whiteBright: [97, 39],
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],
  framed: [51, 54],
  overlined: [53, 55],
  bgGray: [100, 49],
  bgGrey: [100, 49],
  bgBlackBright: [100, 49],
  bgRedBright: [101, 49],
  bgGreenBright: [102, 49],
  bgYellowBright: [103, 49],
  bgBlueBright: [104, 49],
  bgMagentaBright: [105, 49],
  bgCyanBright: [106, 49],
  bgWhiteBright: [107, 49]
};

const INSPECT_COLOR_NAMES = [
  "reset",
  "bold",
  "dim",
  "italic",
  "underline",
  "blink",
  "inverse",
  "hidden",
  "strikethrough",
  "doubleunderline",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "bgBlack",
  "bgRed",
  "bgGreen",
  "bgYellow",
  "bgBlue",
  "bgMagenta",
  "bgCyan",
  "bgWhite",
  "framed",
  "overlined",
  "gray",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
  "bgGray",
  "bgRedBright",
  "bgGreenBright",
  "bgYellowBright",
  "bgBlueBright",
  "bgMagentaBright",
  "bgCyanBright",
  "bgWhiteBright"
];

const INSPECT_COLOR_ALIASES = {
  grey: "gray",
  blackBright: "gray",
  bgGrey: "bgGray",
  bgBlackBright: "bgGray",
  faint: "dim",
  crossedout: "strikethrough",
  strikeThrough: "strikethrough",
  crossedOut: "strikethrough",
  conceal: "hidden",
  swapColors: "inverse",
  swapcolors: "inverse",
  doubleUnderline: "doubleunderline"
};

const INSPECT_STYLE_TO_ANSI = {
  bigint: "yellow",
  boolean: "yellow",
  date: "magenta",
  module: "underline",
  name: "cyan",
  null: "bold",
  number: "yellow",
  regexp: "red",
  special: "cyan",
  string: "green",
  symbol: "green",
  undefined: "gray"
};

const INSPECT_DEFAULT_OPTIONS = Object.freeze({
  showHidden: false,
  depth: 2,
  colors: false,
  customInspect: true,
  showProxy: false,
  maxArrayLength: 100,
  maxStringLength: 10000,
  breakLength: 80,
  compact: 3,
  sorted: false,
  getters: false,
  numericSeparator: false
});

const MODULE_NAMESPACE_OBJECTS = new WeakSet();
const BUILTIN_MODULE_NAMESPACE_RECORDS = new Set();
let inspectDefaultOptions = null;

function createFalsyValueRejection(reason) {
  const error = new Error("Promise was rejected with falsy value");
  error.code = "ERR_FALSY_VALUE_REJECTION";
  error.reason = reason;
  return error;
}

function createInvalidPromisifyCustomError(value) {
  const error = new TypeError(`The "util.promisify.custom" property must be of type function. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function markPromisified(fn) {
  Object.defineProperty(fn, UTIL_PROMISIFY_CUSTOM, {
    enumerable: false,
    configurable: true,
    writable: false,
    value: fn
  });
  return fn;
}

function transferableAbortController() {
  return new AbortController();
}

function transferableAbortSignal(signal) {
  return signal;
}

function isAbortSignal(value) {
  if (typeof AbortSignal === "function" && value instanceof AbortSignal) return true;
  return false;
}

function isAbortedResource(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function createInvalidAbortedSignalError() {
  const error = new TypeError("signal is not of type AbortSignal.");
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createInvalidAbortedResourceError(value) {
  const error = new TypeError(`The "resource" argument must be of type object. Received ${describeAbortedResourceReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function describeAbortedResourceReceived(value) {
  if (typeof value === "string" || typeof value === "symbol") {
    return `type ${typeof value} (${formatInvalidReceived(value)})`;
  }
  return describeReceived(value);
}

function createUtilBuiltin({ console, process, promisify }) {
  const abortedResourceRegistry = typeof FinalizationRegistry === "function"
    ? new FinalizationRegistry(({ signal, listener }) => signal.removeEventListener("abort", listener))
    : null;

  const aborted = async function aborted(signal, resource) {
    if (!isAbortSignal(signal)) {
      return Promise.reject(createInvalidAbortedSignalError());
    }
    if (!isAbortedResource(resource)) {
      return Promise.reject(createInvalidAbortedResourceError(resource));
    }
    if (signal?.aborted) return undefined;
    return new Promise((resolve) => {
      const unregisterToken = {};
      const listener = (event) => {
        abortedResourceRegistry?.unregister(unregisterToken);
        resolve(event);
      };
      abortedResourceRegistry?.register(resource, { signal, listener }, unregisterToken);
      signal.addEventListener("abort", listener, { once: true });
    });
  };
  const isDeepStrictEqualExport = (left, right, options) => isDeepStrictEqual(left, right, options);
  const toUSVStringExport = (value) => toUSVString(value);

  function callbackify(fn) {
    if (typeof fn !== "function") {
      const error = new TypeError(`The "original" argument must be of type function. Received ${describeReceived(fn)}`);
      error.code = "ERR_INVALID_ARG_TYPE";
      throw error;
    }
    const callbackified = function (...args) {
      const callback = args.pop();
      if (typeof callback !== "function") {
        const error = new TypeError(`The last argument must be of type function. Received ${describeReceived(callback)}`);
        error.code = "ERR_INVALID_ARG_TYPE";
        throw error;
      }
      Promise.resolve()
        .then(() => fn.call(this, ...args))
        .then(
          value => callback(null, value),
          error => callback(error || createFalsyValueRejection(error))
        );
    };
    Object.defineProperty(callbackified, "name", {
      configurable: true,
      value: `${fn.name || ""}Callbackified`
    });
    Object.defineProperty(callbackified, "length", {
      configurable: true,
      value: fn.length + 1
    });
    return callbackified;
  }

  function debuglog(section, callback) {
    const debug = createDebugLogger(section, process);
    if (typeof callback === "function") {
      queueMicrotask(() => callback(createDebugLogger(section, process, {
        name: (enabled) => enabled ? "debug" : "noop"
      })));
    }
    return debug;
  }

  function deprecate(fn, message, code) {
    let warned = false;
    const deprecated = function (...args) {
      if (!warned) {
        warned = true;
        process?.emitWarning?.(message, "DeprecationWarning", code);
      }
      return fn.apply(this, args);
    };
    Object.defineProperty(deprecated, "name", { configurable: true, value: "deprecated" });
    Object.defineProperty(deprecated, "length", { configurable: true, value: fn.length });
    return deprecated;
  }

  function formatWithOptions(options, ...args) {
    return formatWithInspectOptions(options, ...args);
  }

  function _extend(target, source) {
    if (source == null) return target;
    for (const key of Object.keys(Object(source))) {
      target[key] = source[key];
    }
    return target;
  }

  function inherits(constructor, superConstructor) {
    if (typeof constructor !== "function") {
      throw createInvalidArgTypeError("ctor", "function", constructor);
    }
    if (typeof superConstructor !== "function") {
      throw createInvalidArgTypeError("superCtor", "function", superConstructor);
    }
    if (superConstructor.prototype == null) {
      throw createInvalidArgTypeError("superCtor.prototype", "object", superConstructor.prototype);
    }
    constructor.super_ = superConstructor;
    Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
  }

  function isArray(value) {
    return Array.isArray(value);
  }

  function promisifyExport(fn) {
    return promisify(fn);
  }

  function styleTextExport(format, text, options = {}) {
    return styleText(format, text, options, process);
  }

  function getSystemErrorName(errorNumber) {
    return systemErrorEntry(errorNumber)[0];
  }

  function getSystemErrorMessage(errorNumber) {
    return systemErrorEntry(errorNumber)[1];
  }

  function getSystemErrorMap() {
    return new Map(SYSTEM_ERRORS);
  }

  function _errnoException(errorNumber, syscall, original) {
    return createErrnoException(errorNumber, syscall, original);
  }

  function _exceptionWithHostPort(errorNumber, syscall, address, port, additional) {
    return createHostPortException(errorNumber, syscall, address, port, additional);
  }

  function setTraceSigInt() {}

  const deprecatedExtend = deprecate(
    _extend,
    "The `util._extend` API is deprecated. Please use Object.assign() instead.",
    "DEP0060"
  );

  const util = {
    _errnoException,
    _exceptionWithHostPort,
    _extend: deprecatedExtend,
    callbackify,
    convertProcessSignalToExitCode,
    debug: debuglog,
    debuglog,
    deprecate,
    format,
    styleText: styleTextExport,
    formatWithOptions,
    getCallSites,
    getSystemErrorMap,
    getSystemErrorName,
    getSystemErrorMessage,
    inherits,
    inspect,
    isArray,
    isDeepStrictEqual: isDeepStrictEqualExport,
    promisify: promisifyExport,
    stripVTControlCharacters,
    toUSVString: toUSVStringExport,
    get transferableAbortSignal() {
      return transferableAbortSignal;
    },
    get transferableAbortController() {
      return transferableAbortController;
    },
    get aborted() {
      return aborted;
    },
    types: {
      isArgumentsObject: value => tagOf(value) === "[object Arguments]",
      isArrayBuffer: value => hasArrayBufferBrand(value),
      isAsyncFunction: value => tagOf(value) === "[object AsyncFunction]",
      isBigIntObject: value => hasBoxedBrand(value, BigInt.prototype),
      isBooleanObject: value => hasBoxedBrand(value, Boolean.prototype),
      isDate: value => hasDateBrand(value),
      isExternal: () => false,
      isGeneratorFunction: value => tagOf(value) === "[object GeneratorFunction]",
      isGeneratorObject: value => tagOf(value) === "[object Generator]",
      isMap: value => hasMapBrand(value),
      isMapIterator: value => tagOf(value) === "[object Map Iterator]",
      isModuleNamespaceObject: value => MODULE_NAMESPACE_OBJECTS.has(value),
      isNativeError: value => NATIVE_ERROR_TAGS.has(tagOf(value)),
      isNumberObject: value => hasBoxedBrand(value, Number.prototype),
      isPromise: value => hasPromiseBrand(value),
      isProxy: () => false,
      isRegExp: value => hasRegExpBrand(value),
      isSet: value => hasSetBrand(value),
      isSetIterator: value => tagOf(value) === "[object Set Iterator]",
      isSharedArrayBuffer: value => hasSharedArrayBufferBrand(value),
      isStringObject: value => hasBoxedBrand(value, String.prototype),
      isSymbolObject: value => hasBoxedBrand(value, Symbol.prototype),
      isWeakMap: value => hasWeakMapBrand(value),
      isWeakSet: value => hasWeakSetBrand(value),
      isAnyArrayBuffer: value => hasArrayBufferBrand(value) || hasSharedArrayBufferBrand(value),
      isBoxedPrimitive: value => (
        hasBoxedBrand(value, BigInt.prototype)
        || hasBoxedBrand(value, Boolean.prototype)
        || hasBoxedBrand(value, Number.prototype)
        || hasBoxedBrand(value, String.prototype)
        || hasBoxedBrand(value, Symbol.prototype)
      ),
      isArrayBufferView: value => ArrayBuffer.isView(value),
      isDataView: function isDataView(value) { return hasDataViewBrand(value); },
      isTypedArray: function isTypedArray(value) { return ArrayBuffer.isView(value) && !hasDataViewBrand(value); },
      isUint8Array: function isUint8Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Uint8Array]"; },
      isUint8ClampedArray: function isUint8ClampedArray(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Uint8ClampedArray]"; },
      isUint16Array: function isUint16Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Uint16Array]"; },
      isUint32Array: function isUint32Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Uint32Array]"; },
      isInt8Array: function isInt8Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Int8Array]"; },
      isInt16Array: function isInt16Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Int16Array]"; },
      isInt32Array: function isInt32Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Int32Array]"; },
      isFloat16Array: function isFloat16Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Float16Array]"; },
      isFloat32Array: function isFloat32Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Float32Array]"; },
      isFloat64Array: function isFloat64Array(value) { return ArrayBuffer.isView(value) && tagOf(value) === "[object Float64Array]"; },
      isBigInt64Array: function isBigInt64Array(value) { return tagOf(value) === "[object BigInt64Array]"; },
      isBigUint64Array: function isBigUint64Array(value) { return tagOf(value) === "[object BigUint64Array]"; },
      isKeyObject: value => Boolean(value?.[KEY_OBJECT_BRAND]),
      isCryptoKey: value => tagOf(value) === "[object CryptoKey]" || (typeof CryptoKey !== "undefined" && value instanceof CryptoKey)
    },
    parseEnv,
    parseArgs(config = {}) {
      return parseArgs(config, process);
    },
    TextDecoder: globalThis.TextDecoder,
    TextEncoder: globalThis.TextEncoder,
    MIMEType,
    MIMEParams,
    diff,
    setTraceSigInt
  };
  util.promisify.custom = UTIL_PROMISIFY_CUSTOM;
  util.inspect.custom = UTIL_INSPECT_CUSTOM;
  configureInspectDefaultOptions();
  util.inspect.colors = createInspectColors();
  util.inspect.styles = { ...INSPECT_STYLE_TO_ANSI };
  alignUtilFunctionMetadata(util);
  alignUtilTypesFunctionMetadata(util.types);
  return util;
}

function createInspectColors() {
  const colors = {};
  for (const name of INSPECT_COLOR_NAMES) {
    Object.defineProperty(colors, name, {
      configurable: true,
      enumerable: true,
      value: ANSI_STYLES[name].slice(),
      writable: true
    });
  }
  for (const [alias, target] of Object.entries(INSPECT_COLOR_ALIASES)) {
    Object.defineProperty(colors, alias, {
      configurable: true,
      enumerable: false,
      get() {
        return colors[target];
      },
      set(value) {
        colors[target] = value;
      }
    });
  }
  return colors;
}

function createInspectDefaultOptions() {
  return Object.seal({ ...INSPECT_DEFAULT_OPTIONS });
}

function resetInspectDefaultOptions() {
  if (!inspectDefaultOptions) {
    inspectDefaultOptions = createInspectDefaultOptions();
    return;
  }
  Object.assign(inspectDefaultOptions, INSPECT_DEFAULT_OPTIONS);
}

function configureInspectDefaultOptions() {
  resetInspectDefaultOptions();
  const descriptor = Object.getOwnPropertyDescriptor(inspect, "defaultOptions");
  if (descriptor?.get && descriptor?.set) return;
  Object.defineProperty(inspect, "defaultOptions", {
    enumerable: false,
    configurable: false,
    get() {
      return inspectDefaultOptions;
    },
    set(options) {
      setInspectDefaultOptions(options);
    }
  });
}

function setInspectDefaultOptions(options) {
  if (options === null || typeof options !== "object") {
    throw createInvalidArgTypeError("options", "object", options);
  }
  if (!inspectDefaultOptions) inspectDefaultOptions = createInspectDefaultOptions();
  Object.assign(inspectDefaultOptions, options);
}

function alignUtilFunctionMetadata(util) {
  const metadata = {
    _errnoException: ["_errnoException", 0],
    _exceptionWithHostPort: ["_exceptionWithHostPort", 0],
    _extend: ["deprecated", 2],
    aborted: ["aborted", 2],
    callbackify: ["callbackify", 1],
    debug: ["debuglog", 2],
    debuglog: ["debuglog", 2],
    deprecate: ["deprecate", 3],
    format: ["format", 0],
    formatWithOptions: ["formatWithOptions", 1],
    getSystemErrorMap: ["getSystemErrorMap", 0],
    getSystemErrorName: ["getSystemErrorName", 1],
    getSystemErrorMessage: ["getSystemErrorMessage", 1],
    inherits: ["inherits", 2],
    inspect: ["inspect", 2],
    isArray: ["deprecated", 1],
    isDeepStrictEqual: ["isDeepStrictEqual", 3],
    promisify: ["promisify", 1],
    setTraceSigInt: ["setTraceSigInt", 1],
    stripVTControlCharacters: ["stripVTControlCharacters", 1],
    styleText: ["styleText", 3],
    toUSVString: ["toUSVString", 1]
  };
  const prototypeKeys = new Set([
    "_errnoException",
    "_exceptionWithHostPort",
    "_extend",
    "callbackify",
    "debug",
    "debuglog",
    "deprecate",
    "format",
    "formatWithOptions",
    "getCallSites",
    "getSystemErrorMap",
    "getSystemErrorName",
    "getSystemErrorMessage",
    "inherits",
    "inspect",
    "isArray",
    "promisify",
    "setTraceSigInt",
    "stripVTControlCharacters",
    "styleText"
  ]);
  for (const [key, [name, length]] of Object.entries(metadata)) {
    const fn = util[key];
    if (typeof fn !== "function") continue;
    Object.defineProperty(fn, "name", { configurable: true, value: name });
    Object.defineProperty(fn, "length", { configurable: true, value: length });
    if (prototypeKeys.has(key)) ensureOwnFunctionPrototype(fn);
  }
}

function ensureOwnFunctionPrototype(fn) {
  if (Object.hasOwn(fn, "prototype")) return;
  Object.defineProperty(fn, "prototype", {
    enumerable: false,
    configurable: false,
    writable: true,
    value: {}
  });
}

function alignUtilTypesFunctionMetadata(types) {
  const metadata = {
    isAnyArrayBuffer: ["", 0],
    isArgumentsObject: ["", 0],
    isArrayBuffer: ["", 0],
    isArrayBufferView: ["isView", 1],
    isAsyncFunction: ["", 0],
    isBigInt64Array: ["isBigInt64Array", 1],
    isBigIntObject: ["", 0],
    isBigUint64Array: ["isBigUint64Array", 1],
    isBooleanObject: ["", 0],
    isBoxedPrimitive: ["", 0],
    isCryptoKey: ["value", 1],
    isDataView: ["isDataView", 1],
    isDate: ["", 0],
    isExternal: ["", 0],
    isFloat16Array: ["isFloat16Array", 1],
    isFloat32Array: ["isFloat32Array", 1],
    isFloat64Array: ["isFloat64Array", 1],
    isGeneratorFunction: ["", 0],
    isGeneratorObject: ["", 0],
    isInt16Array: ["isInt16Array", 1],
    isInt32Array: ["isInt32Array", 1],
    isInt8Array: ["isInt8Array", 1],
    isKeyObject: ["value", 1],
    isMap: ["", 0],
    isMapIterator: ["", 0],
    isModuleNamespaceObject: ["", 0],
    isNativeError: ["", 0],
    isNumberObject: ["", 0],
    isPromise: ["", 0],
    isProxy: ["", 0],
    isRegExp: ["", 0],
    isSet: ["", 0],
    isSetIterator: ["", 0],
    isSharedArrayBuffer: ["", 0],
    isStringObject: ["", 0],
    isSymbolObject: ["", 0],
    isTypedArray: ["isTypedArray", 1],
    isUint16Array: ["isUint16Array", 1],
    isUint32Array: ["isUint32Array", 1],
    isUint8Array: ["isUint8Array", 1],
    isUint8ClampedArray: ["isUint8ClampedArray", 1],
    isWeakMap: ["", 0],
    isWeakSet: ["", 0]
  };
  for (const [key, [name, length]] of Object.entries(metadata)) {
    const fn = types[key];
    if (typeof fn !== "function") continue;
    Object.defineProperty(fn, "name", { configurable: true, value: name });
    Object.defineProperty(fn, "length", { configurable: true, value: length });
  }
  for (const key of ["isCryptoKey", "isKeyObject"]) {
    const descriptor = Object.getOwnPropertyDescriptor(types, key);
    if (descriptor) {
      Object.defineProperty(types, key, {
        ...descriptor,
        configurable: false,
        writable: false
      });
    }
  }
}

function createModuleNamespace(exports, specifier = undefined) {
  if (MODULE_NAMESPACE_OBJECTS.has(exports)) return exports;
  const source = Object(exports);
  const keys = Object.keys(source);
  if (!Object.prototype.hasOwnProperty.call(source, "default")) keys.push("default");
  keys.sort();
  const keySet = new Set(keys);
  const snapshot = typeof specifier === "string" && isBuiltinSpecifier(specifier);
  const record = {
    keySet,
    keys,
    originalExports: exports,
    snapshot,
    source,
    values: Object.create(null)
  };
  if (snapshot) syncModuleNamespaceRecord(record);
  const target = Object.create(null);
  for (const key of keys) {
    Object.defineProperty(target, key, {
      configurable: false,
      enumerable: true,
      value: undefined,
      writable: true
    });
  }
  Object.defineProperty(target, Symbol.toStringTag, {
    configurable: false,
    value: "Module"
  });
  Object.preventExtensions(target);

  const namespace = new Proxy(target, {
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    get(object, key, receiver) {
      if (keySet.has(key)) return getModuleNamespaceRecordValue(record, key);
      return Reflect.get(object, key, receiver);
    },
    getOwnPropertyDescriptor(object, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !keySet.has(key)) return descriptor;
      return {
        configurable: false,
        enumerable: true,
        value: getModuleNamespaceRecordValue(record, key),
        writable: true
      };
    },
    set() {
      return false;
    },
    setPrototypeOf() {
      return false;
    }
  });
  MODULE_NAMESPACE_OBJECTS.add(namespace);
  if (snapshot) BUILTIN_MODULE_NAMESPACE_RECORDS.add(record);
  return namespace;
}

function getModuleNamespaceRecordValue(record, key) {
  if (record.snapshot) return record.values[key];
  return getModuleNamespaceValue(record.source, key, record.originalExports);
}

function syncBuiltinModuleNamespaceExports() {
  for (const record of BUILTIN_MODULE_NAMESPACE_RECORDS) syncModuleNamespaceRecord(record);
}

function syncModuleNamespaceRecord(record) {
  for (const key of record.keys) {
    record.values[key] = getModuleNamespaceValue(record.source, key, record.originalExports);
  }
}

function getModuleNamespaceValue(source, key, originalExports) {
  if (key === "default" && !Object.prototype.hasOwnProperty.call(source, "default")) {
    return originalExports;
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (descriptor?.get || descriptor?.set) {
    return descriptor.get ? descriptor.get.call(source) : undefined;
  }
  return source[key];
}

function systemErrorEntry(errorNumber) {
  if (typeof errorNumber !== "number") {
    throw createInvalidArgTypeError("err", "number", errorNumber);
  }
  if (!Number.isInteger(errorNumber) || errorNumber >= 0) {
    throw Object.assign(new RangeError(`The value of "err" is out of range. It must be a negative integer. Received ${errorNumber}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return SYSTEM_ERRORS.get(errorNumber) ?? [`Unknown system error ${errorNumber}`, `Unknown system error ${errorNumber}`];
}

function convertProcessSignalToExitCode(signalCode) {
  const signalNumber = LINUX_SIGNALS.get(signalCode);
  if (signalNumber === undefined) {
    const expected = [...LINUX_SIGNALS.keys()].map((signal) => `'${signal}'`).join(", ");
    const error = new TypeError(`The argument 'signalCode' must be one of: ${expected}. Received ${formatInvalidReceived(signalCode)}`);
    error.code = "ERR_INVALID_ARG_VALUE";
    throw error;
  }
  return 128 + signalNumber;
}

function parseEnv(content) {
  if (typeof content !== "string") {
    const error = new TypeError(`The "content" argument must be of type string. Received ${describeReceived(content)}`);
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
  }

  const parsed = Object.create(null);
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].trimStart();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!key) continue;

    let value = line.slice(equalsIndex + 1).trimStart();
    if (value.startsWith("'") || value.startsWith("\"")) {
      const quote = value[0];
      let body = value.slice(1);
      while (closingEnvQuoteIndex(body, quote) === -1 && index < lines.length - 1) {
        index++;
        body += `\n${lines[index]}`;
      }
      const closeIndex = closingEnvQuoteIndex(body, quote);
      const quoted = closeIndex === -1 ? value : body.slice(0, closeIndex);
      parsed[key] = quote === "\"" ? unescapeNodeEnvDoubleQuotedValue(quoted) : quoted;
      continue;
    }

    parsed[key] = stripNodeEnvComment(value).trimEnd();
  }
  return parsed;
}

function createErrnoException(errorNumber, syscall, original) {
  const normalized = Number(errorNumber);
  const [code] = systemErrorEntry(normalized);
  const error = new Error(`${syscall ?? "syscall"} ${code}${original === undefined ? "" : ` ${original}`}`);
  error.errno = normalized;
  error.code = code;
  error.syscall = syscall;
  return error;
}

function createHostPortException(errorNumber, syscall, address, port, additional) {
  const normalized = Number(errorNumber);
  const [code] = systemErrorEntry(normalized);
  const suffix = additional === undefined ? "" : ` - Local (${additional})`;
  const error = new Error(`${syscall ?? "syscall"} ${code} ${address}:${port}${suffix}`);
  error.errno = normalized;
  error.code = code;
  error.syscall = syscall;
  error.address = address;
  error.port = port;
  return error;
}

function stripNodeEnvComment(value) {
  const commentIndex = value.indexOf("#");
  return commentIndex === -1 ? value : value.slice(0, commentIndex);
}

function closingEnvQuoteIndex(value, quote) {
  return value.indexOf(quote);
}

function unescapeNodeEnvDoubleQuotedValue(value) {
  return value.replace(/\\([nr])/g, (_, escaped) => escaped === "n" ? "\n" : "\r");
}

function describeReceived(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "function") return `function ${value.name || ""}`;
  if (typeof value === "object" && value?.constructor?.name) return `an instance of ${value.constructor.name}`;
  return `type ${typeof value}${typeof value === "number" ? ` (${value})` : ""}`;
}

function formatInvalidReceived(value) {
  return typeof value === "string" ? `'${value}'` : String(value);
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

function isDeepEqual(left, right) {
  return deepEqualValues(left, right, new WeakMap());
}

function partialDeepStrictEqualValues(actual, expected, seen) {
  if (Object.is(actual, expected)) return true;
  if (typeof actual !== "object" || actual === null || typeof expected !== "object" || expected === null) return false;

  const seenExpected = seen.get(actual);
  if (seenExpected) return seenExpected === expected;
  seen.set(actual, expected);

  if (actual instanceof Date || expected instanceof Date) return actual instanceof Date && expected instanceof Date && Object.is(actual.getTime(), expected.getTime());
  if (actual instanceof RegExp || expected instanceof RegExp) return actual instanceof RegExp && expected instanceof RegExp && String(actual) === String(expected);
  if (ArrayBuffer.isView(actual) || ArrayBuffer.isView(expected)) {
    if (!ArrayBuffer.isView(actual) || !ArrayBuffer.isView(expected) || actual.byteLength < expected.byteLength) return false;
    const actualBytes = new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength);
    const expectedBytes = new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength);
    return expectedBytes.every((byte, index) => actualBytes[index] === byte);
  }
  if (actual instanceof Map || expected instanceof Map) {
    if (!(actual instanceof Map) || !(expected instanceof Map)) return false;
    for (const [key, value] of expected) {
      if (!actual.has(key) || !partialDeepStrictEqualValues(actual.get(key), value, seen)) return false;
    }
    return true;
  }
  if (actual instanceof Set || expected instanceof Set) {
    if (!(actual instanceof Set) || !(expected instanceof Set)) return false;
    for (const value of expected) {
      let matched = false;
      for (const candidate of actual) {
        if (partialDeepStrictEqualValues(candidate, value, seen)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  }

  for (const key of Reflect.ownKeys(expected)) {
    if (!Object.prototype.propertyIsEnumerable.call(expected, key)) continue;
    if (!Object.prototype.propertyIsEnumerable.call(actual, key)) return false;
    if (!partialDeepStrictEqualValues(actual[key], expected[key], seen)) return false;
  }
  return true;
}

function deepEqualValues(left, right, seen) {
  if (Object.is(left, right) || left == right) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;

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
      if (!right.has(key) || !deepEqualValues(value, right.get(key), seen)) return false;
    }
    return true;
  }
  if (left instanceof Set || right instanceof Set) {
    if (!(left instanceof Set) || !(right instanceof Set) || left.size !== right.size) return false;
    for (const value of left) {
      let matched = false;
      for (const candidate of right) {
        if (deepEqualValues(value, candidate, seen)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  }

  const leftKeys = Reflect.ownKeys(left).filter((key) => Object.prototype.propertyIsEnumerable.call(left, key));
  const rightKeys = Reflect.ownKeys(right).filter((key) => Object.prototype.propertyIsEnumerable.call(right, key));
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.propertyIsEnumerable.call(right, key)) return false;
    if (!deepEqualValues(left[key], right[key], seen)) return false;
  }
  return true;
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

function createDescriptorConsole(descriptor) {
  const timers = new Map();
  const counts = new Map();
  let groupDepth = 0;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const write = (stream, args) => {
    stream.write(`${" ".repeat(groupDepth * 2)}${formatConsoleArgs(args)}\n`);
  };
  return {
    log: (...args) => write(descriptor.stdout, args),
    info: (...args) => write(descriptor.stdout, args),
    debug: (...args) => write(descriptor.stdout, args),
    warn: (...args) => write(descriptor.stderr, args),
    error: (...args) => write(descriptor.stderr, args),
    dir: (value) => write(descriptor.stdout, [value]),
    trace: (...args) => write(descriptor.stderr, [`Trace: ${formatConsoleArgs(args)}`]),
    assert: (value, ...args) => {
      if (!value) write(descriptor.stderr, [args.length ? formatConsoleArgs(args) : "Assertion failed"]);
    },
    clear: () => descriptor.stdout.write("\x1b[1;1H\x1b[0J"),
    count: (label = "default") => {
      const key = String(label);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      write(descriptor.stdout, [`${key}: ${count}`]);
    },
    countReset: (label = "default") => {
      const key = String(label);
      if (!counts.delete(key)) write(descriptor.stderr, [`Count for '${key}' does not exist`]);
    },
    group: (...label) => {
      if (label.length) write(descriptor.stdout, label);
      groupDepth++;
    },
    groupCollapsed: (...label) => {
      if (label.length) write(descriptor.stdout, label);
      groupDepth++;
    },
    groupEnd: () => {
      if (groupDepth > 0) groupDepth--;
    },
    time: (label = "default") => timers.set(String(label), now()),
    timeLog: (label = "default", ...args) => {
      const key = String(label);
      const start = timers.get(key);
      if (start === undefined) {
        write(descriptor.stderr, [`No such label '${key}' for console.timeLog()`]);
        return;
      }
      write(descriptor.stdout, [`${key}: ${(now() - start).toFixed(3)}ms`, ...args]);
    },
    timeEnd: (label = "default") => {
      const key = String(label);
      const start = timers.get(key);
      if (start === undefined) {
        write(descriptor.stderr, [`No such label '${key}' for console.timeEnd()`]);
        return;
      }
      timers.delete(key);
      write(descriptor.stdout, [`${key}: ${(now() - start).toFixed(3)}ms`]);
    },
    table: (value) => write(descriptor.stdout, [value]),
    timeStamp: () => {},
    profile: () => {},
    profileEnd: () => {}
  };
}

function createConsoleBuiltin(console) {
  class Console {
    constructor(stdout = console, stderr = stdout, ignoreErrors = true) {
      const options = normalizeConsoleOptions(stdout, stderr, ignoreErrors, console);
      stdout = options.stdout;
      stderr = options.stderr;
      this.stdout = stdout;
      this.stderr = stderr;
      this.#ignoreErrors = options.ignoreErrors;
      this.#inspectOptions = options.inspectOptions;
      this.#groupIndentation = options.groupIndentation;
    }

    log(...args) {
      this.#write(this.stdout, "log", args);
    }

    info(...args) {
      this.#write(this.stdout, "info", args);
    }

    debug(...args) {
      this.log(...args);
    }

    warn(...args) {
      this.#write(this.stderr, "warn", args);
    }

    error(...args) {
      this.#write(this.stderr, "error", args);
    }

    dir(value, options) {
      this.#write(this.stdout, "log", [inspect(value, this.#mergedInspectOptions(options))]);
    }

    dirxml(...args) {
      this.log(...args);
    }

    trace(...args) {
      this.error(`Trace: ${format(...args)}`);
    }

    assert(value, ...args) {
      if (!value) this.error(args.length ? format(...args) : "Assertion failed");
    }

    clear() {
      if (typeof this.stdout?.write === "function") this.stdout.write("\x1b[1;1H\x1b[0J");
      else this.stdout?.clear?.();
    }

    count(label = "default") {
      const key = String(label);
      const count = (this.#counts.get(key) ?? 0) + 1;
      this.#counts.set(key, count);
      this.log(`${key}: ${count}`);
    }

    countReset(label = "default") {
      const key = String(label);
      if (!this.#counts.delete(key)) this.warn(`Count for '${key}' does not exist`);
    }

    group(...label) {
      if (label.length) this.log(...label);
      this.#groupDepth++;
    }

    groupCollapsed(...label) {
      this.group(...label);
    }

    groupEnd() {
      if (this.#groupDepth > 0) this.#groupDepth--;
    }

    time(label = "default") {
      this.#timers.set(String(label), performanceNow());
    }

    timeLog(label = "default", ...args) {
      const key = String(label);
      const start = this.#timers.get(key);
      if (start === undefined) {
        this.warn(`No such label '${key}' for console.timeLog()`);
        return;
      }
      this.log(`${key}: ${(performanceNow() - start).toFixed(3)}ms`, ...args);
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

    table(tabularData) {
      this.#write(this.stdout, "log", [inspect(tabularData, this.#mergedInspectOptions({ compact: false }))]);
    }

    timeStamp() {}
    profile() {}
    profileEnd() {}

    #write(target, method, args) {
      writeConsole(target, method, args, {
        prefix: " ".repeat(this.#groupDepth * this.#groupIndentation),
        ignoreErrors: this.#ignoreErrors,
        inspectOptions: this.#inspectOptions
      });
    }

    #mergedInspectOptions(options) {
      return { ...this.#inspectOptions, ...(options ?? {}) };
    }

    #timers = new Map();
    #counts = new Map();
    #groupDepth = 0;
    #groupIndentation = 2;
    #ignoreErrors = true;
    #inspectOptions = {};
  }

  const consolePrototype = Console.prototype;
  const prototypeMethods = {
    log: consolePrototype.log,
    info: consolePrototype.info,
    debug: consolePrototype.debug,
    warn: consolePrototype.warn,
    error: consolePrototype.error,
    dir: consolePrototype.dir,
    time: consolePrototype.time,
    timeEnd: consolePrototype.timeEnd,
    timeLog: consolePrototype.timeLog,
    trace: function trace(...args) {
      this.error(`Trace: ${format(...args)}`);
    },
    assert: consolePrototype.assert,
    clear: consolePrototype.clear,
    count: consolePrototype.count,
    countReset: consolePrototype.countReset,
    group: consolePrototype.group,
    groupEnd: consolePrototype.groupEnd,
    table: consolePrototype.table
  };
  Object.defineProperty(prototypeMethods.table, "length", {
    configurable: true,
    value: 2
  });
  for (const name of Object.getOwnPropertyNames(consolePrototype)) {
    if (name !== "constructor") delete consolePrototype[name];
  }
  for (const [name, value] of [
    ["log", prototypeMethods.log],
    ["info", prototypeMethods.info],
    ["debug", prototypeMethods.debug],
    ["warn", prototypeMethods.warn],
    ["error", prototypeMethods.error],
    ["dir", prototypeMethods.dir],
    ["time", prototypeMethods.time],
    ["timeEnd", prototypeMethods.timeEnd],
    ["timeLog", prototypeMethods.timeLog],
    ["trace", prototypeMethods.trace],
    ["assert", prototypeMethods.assert],
    ["clear", prototypeMethods.clear],
    ["count", prototypeMethods.count],
    ["countReset", prototypeMethods.countReset],
    ["group", prototypeMethods.group],
    ["groupEnd", prototypeMethods.groupEnd],
    ["table", prototypeMethods.table],
    ["dirxml", prototypeMethods.log],
    ["groupCollapsed", prototypeMethods.group]
  ]) {
    Object.defineProperty(consolePrototype, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }

  const defaultConsole = new Console(console, console);
  Object.defineProperty(Console, "length", { configurable: true, value: 1 });
  const builtin = {};
  for (const method of [
    "log",
    "info",
    "debug",
    "warn",
    "error",
    "dir",
    "time",
    "timeEnd",
    "timeLog",
    "trace",
    "assert",
    "clear",
    "count",
    "countReset",
    "group",
    "groupEnd",
    "table",
    "dirxml",
    "groupCollapsed"
  ]) {
    const wrapper = (...args) => {
      const consoleMethod = defaultConsole[method];
      if (typeof consoleMethod === "function") return consoleMethod.apply(defaultConsole, args);
    };
    Object.defineProperty(wrapper, "name", { configurable: true, value: method });
    builtin[method] = wrapper;
  }
  for (const [name, value] of [
    ["_stdoutErrorHandler", (error) => {
      if (!builtin._ignoreErrors) throw error;
    }],
    ["_stderrErrorHandler", (error) => {
      if (!builtin._ignoreErrors) throw error;
    }],
    ["_ignoreErrors", true],
    ["_times", new Map()]
  ]) {
    if (typeof value === "function") {
      Object.defineProperty(value, "name", { configurable: true, value: "" });
    }
    Object.defineProperty(builtin, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value
    });
  }
  builtin.Console = Console;
  for (const method of ["profile", "profileEnd", "timeStamp"]) {
    const wrapper = (...args) => {
      const consoleMethod = defaultConsole[method];
      if (typeof consoleMethod === "function") return consoleMethod.apply(defaultConsole, args);
    };
    Object.defineProperty(wrapper, "name", { configurable: true, value: method });
    builtin[method] = wrapper;
  }
  builtin.context = function context() {
    const contextConsole = new Console(console, console);
    const context = {};
    for (const method of [
      "dir",
      "dirXml",
      "dirxml",
      "table",
      "groupEnd",
      "clear",
      "count",
      "countReset",
      "timeStamp",
      "profile",
      "profileEnd",
      "debug",
      "error",
      "info",
      "log",
      "warn",
      "trace",
      "group",
      "groupCollapsed",
      "assert",
      "time",
      "timeLog",
      "timeEnd",
      "timeStamp"
    ]) {
      context[method] = (...args) => {
        const consoleMethod = contextConsole[method === "dirXml" ? "dirxml" : method];
        if (typeof consoleMethod === "function") return consoleMethod.apply(contextConsole, args);
      };
    }
    return context;
  };
  Object.defineProperty(builtin.context, "length", { configurable: true, value: 1 });
  builtin.createTask = function createTask() {
    return {
      run(callback) {
        if (typeof callback !== "function") throw new Error("First argument must be a function.");
        return callback();
      }
    };
  };
  let builtinStdout = defaultConsole.stdout;
  let builtinStderr = defaultConsole.stderr;
  Object.defineProperty(builtin, "_stdout", {
    configurable: true,
    enumerable: false,
    get() {
      return builtinStdout;
    },
    set(value) {
      builtinStdout = value;
      defaultConsole.stdout = value;
    }
  });
  Object.defineProperty(builtin, "_stderr", {
    configurable: true,
    enumerable: false,
    get() {
      return builtinStderr;
    },
    set(value) {
      builtinStderr = value;
      defaultConsole.stderr = value;
    }
  });
  return builtin;
}

function normalizeConsoleOptions(stdout, stderr, ignoreErrors, fallbackConsole) {
  const options = stdout && typeof stdout === "object" && stdout.stdout ? stdout : null;
  if (options) {
    stdout = options.stdout;
    stderr = options.stderr ?? stdout;
    ignoreErrors = options.ignoreErrors ?? true;
  }
  stdout ??= fallbackConsole;
  stderr ??= stdout;

  const normalized = {
    stdout,
    stderr,
    ignoreErrors: ignoreErrors !== false,
    groupIndentation: 2,
    inspectOptions: {}
  };

  if (options) {
    normalized.groupIndentation = Number.isFinite(options.groupIndentation)
      ? Math.max(0, Math.trunc(options.groupIndentation))
      : 2;
    normalized.inspectOptions = { ...(options.inspectOptions ?? {}) };
    if (normalized.inspectOptions.colors === undefined && options.colorMode !== undefined) {
      normalized.inspectOptions.colors = options.colorMode === true;
    }
  }

  return normalized;
}

function writeConsole(target, method, args, options = {}) {
  const line = `${options.prefix ?? ""}${formatConsoleArgs(args, options.inspectOptions)}\n`;
  try {
    if (typeof target?.write === "function") {
      target.write(line);
      return;
    }
    target?.[method]?.(line.trimEnd());
  } catch (error) {
    if (!options.ignoreErrors) throw error;
  }
}

function formatConsoleArgs(args, inspectOptions = undefined) {
  return args.length ? formatWithInspectOptions(inspectOptions, ...args) : "";
}

function formatConsoleValue(value, options = undefined) {
  return typeof value === "string" ? value : inspect(value, options);
}

function tagOf(value) {
  return Object.prototype.toString.call(value);
}

const NATIVE_ERROR_TAGS = new Set([
  "[object Error]",
  "[object EvalError]",
  "[object RangeError]",
  "[object ReferenceError]",
  "[object SyntaxError]",
  "[object TypeError]",
  "[object URIError]",
  "[object AggregateError]",
  "[object DOMException]"
]);

const DATA_VIEW_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(DataView.prototype, "byteLength")?.get;

function hasArrayBufferBrand(value) {
  try {
    ArrayBuffer.prototype.slice.call(value, 0, 0);
    return true;
  } catch {
    return false;
  }
}

function hasSharedArrayBufferBrand(value) {
  if (typeof SharedArrayBuffer === "undefined") return false;
  try {
    SharedArrayBuffer.prototype.slice.call(value, 0, 0);
    return true;
  } catch {
    return false;
  }
}

function hasDataViewBrand(value) {
  if (!DATA_VIEW_BYTE_LENGTH_GETTER) return value instanceof DataView;
  try {
    DATA_VIEW_BYTE_LENGTH_GETTER.call(value);
    return true;
  } catch {
    return false;
  }
}

function hasMapBrand(value) {
  try {
    Map.prototype.has.call(value, undefined);
    return true;
  } catch {
    return false;
  }
}

function hasSetBrand(value) {
  try {
    Set.prototype.has.call(value, undefined);
    return true;
  } catch {
    return false;
  }
}

function hasWeakMapBrand(value) {
  try {
    WeakMap.prototype.has.call(value, {});
    return true;
  } catch {
    return false;
  }
}

function hasWeakSetBrand(value) {
  try {
    WeakSet.prototype.has.call(value, {});
    return true;
  } catch {
    return false;
  }
}

function hasDateBrand(value) {
  try {
    Date.prototype.getTime.call(value);
    return true;
  } catch {
    return false;
  }
}

function hasRegExpBrand(value) {
  try {
    RegExp.prototype.exec.call(value, "");
    return true;
  } catch {
    return false;
  }
}

function hasPromiseBrand(value) {
  try {
    Promise.prototype.then.call(value, undefined, undefined);
    return true;
  } catch {
    return false;
  }
}

function hasBoxedBrand(value, prototype) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  try {
    prototype.valueOf.call(value);
    return true;
  } catch {
    return false;
  }
}

function format(first, ...args) {
  return formatWithInspectOptions(undefined, first, ...args);
}

function formatWithInspectOptions(inspectOptions, first, ...args) {
  if (typeof first !== "string") {
    return [first, ...args].map(value => formatConsoleValue(value, inspectOptions)).join(" ");
  }

  let index = 0;
  const formatted = first.replace(/%[sdifjoOc%]/g, token => {
    if (token === "%%") return "%";
    if (index >= args.length) return token;
    const value = args[index++];
    if (token === "%s") return formatStringSpecifier(value, inspectOptions);
    if (token === "%d") return formatNumberSpecifier(value);
    if (token === "%i") return formatIntegerSpecifier(value);
    if (token === "%f") return formatFloatSpecifier(value);
    if (token === "%c") return "";
    if (token === "%j") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        if (isCircularJsonError(error)) return "[Circular]";
        throw error;
      }
    }
    if (token === "%o") return inspect(value, { ...inspectOptions, depth: 4, showHidden: true, showProxy: true });
    return inspect(value, inspectOptions);
  });

  const rest = args.slice(index).map(value => formatConsoleValue(value, inspectOptions));
  return rest.length ? `${formatted} ${rest.join(" ")}` : formatted;
}

function formatStringSpecifier(value, inspectOptions) {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "number" && Object.is(value, -0)) return "-0";
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    return inspect(value, inspectOptions);
  }
  return String(value);
}

function formatNumberSpecifier(value) {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return "NaN";
  const number = Number(value);
  return Object.is(number, -0) ? "-0" : String(number);
}

function formatIntegerSpecifier(value) {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return "NaN";
  return String(Number.parseInt(value, 10));
}

function formatFloatSpecifier(value) {
  if (typeof value === "symbol") return "NaN";
  return String(Number.parseFloat(value));
}

function isCircularJsonError(error) {
  return error instanceof TypeError && /circular|cyclic/i.test(error.message);
}

function inspect(value, options = {}) {
  const defaultOptions = inspect.defaultOptions ?? {};
  const normalizedOptions = {
    breakLength: options?.breakLength ?? defaultOptions.breakLength ?? 80,
    colors: Boolean(options?.colors ?? defaultOptions.colors),
    compact: options?.compact ?? defaultOptions.compact ?? 3,
    customInspect: options?.customInspect ?? defaultOptions.customInspect ?? true,
    getters: options?.getters ?? defaultOptions.getters ?? false,
    depth: normalizeInspectDepth(options?.depth ?? defaultOptions.depth),
    maxArrayLength: normalizeInspectLimit(options?.maxArrayLength ?? defaultOptions.maxArrayLength, 100),
    maxStringLength: normalizeInspectLimit(options?.maxStringLength ?? defaultOptions.maxStringLength, 10000),
    numericSeparator: Boolean(options?.numericSeparator ?? defaultOptions.numericSeparator),
    quoteStrings: options?.quoteStrings !== false,
    showHidden: Boolean(options?.showHidden ?? defaultOptions.showHidden),
    showProxy: Boolean(options?.showProxy ?? defaultOptions.showProxy),
    sorted: options?.sorted ?? defaultOptions.sorted ?? false
  };
  return inspectValue(value, normalizedOptions, createInspectContext(), 0);
}

function createInspectContext() {
  return {
    circularRefs: new WeakSet(),
    nextRef: 1,
    seen: new Map()
  };
}

function normalizeInspectDepth(depth) {
  if (depth === null) return Number.POSITIVE_INFINITY;
  if (depth === undefined) return 2;
  const numeric = Number(depth);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 2;
}

function normalizeInspectLimit(value, fallback) {
  if (value === null) return Number.POSITIVE_INFINITY;
  if (value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function inspectValue(value, options, context, depth) {
  if (value === null) return colorizeInspect("null", "null", options);
  if (value === undefined) return colorizeInspect("undefined", "undefined", options);
  if (typeof value === "string") return colorizeInspect(options.quoteStrings ? quoteInspectString(value, options) : truncateInspectString(value, options), "string", options);
  if (typeof value === "number") return colorizeInspect(formatInspectNumeric(value, options), "number", options);
  if (typeof value === "boolean") return colorizeInspect(String(value), "boolean", options);
  if (typeof value === "bigint") return colorizeInspect(`${formatInspectNumeric(value, options)}n`, "bigint", options);
  if (typeof value === "symbol") return colorizeInspect(String(value), "symbol", options);
  if (typeof value === "function") return colorizeInspect(`[Function${value.name ? `: ${value.name}` : ""}]`, "special", options);
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (value instanceof Date) return colorizeInspect(Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString(), "date", options);
  if (value instanceof RegExp) return colorizeInspect(String(value), "regexp", options);

  if (typeof value !== "object") return String(value);
  if (context.seen.has(value)) {
    const seenEntry = context.seen.get(value);
    seenEntry.id ??= context.nextRef++;
    context.circularRefs.add(value);
    return `[Circular *${seenEntry.id}]`;
  }

  if (options.customInspect) {
    const customInspect = value?.[UTIL_INSPECT_CUSTOM];
    if (typeof customInspect === "function" && customInspect !== inspect) {
      const customResult = customInspect.call(value, options.depth - depth, options, (innerValue, innerOptions = {}) => {
        return inspect(innerValue, { ...options, ...innerOptions });
      });
      return typeof customResult === "string"
        ? customResult
        : inspectValue(customResult, { ...options, customInspect: false }, context, depth);
    }
  }

  if (depth > options.depth) {
    if (Array.isArray(value)) return "[Array]";
    if (value instanceof Map) return "[Map]";
    if (value instanceof Set) return "[Set]";
    return "[Object]";
  }

  const seenEntry = { id: undefined };
  context.seen.set(value, seenEntry);
  try {
    const formatted = (() => {
      if (Array.isArray(value)) return inspectArray(value, options, context, depth);
      if (value instanceof Map) return inspectMap(value, options, context, depth);
      if (value instanceof Set) return inspectSet(value, options, context, depth);
      if (ArrayBuffer.isView(value)) return inspectArrayBufferView(value, options, context, depth);
      if (value instanceof ArrayBuffer) return `ArrayBuffer { byteLength: ${value.byteLength} }`;
      return inspectObject(value, options, context, depth);
    })();
    return context.circularRefs.has(value) && seenEntry.id !== undefined
      ? `<ref *${seenEntry.id}> ${formatted}`
      : formatted;
  } finally {
    context.seen.delete(value);
  }
}

function inspectArray(value, options, context, depth) {
  const limit = Math.min(value.length, options.maxArrayLength);
  const items = value.slice(0, limit).map(item => inspectValue(item, options, context, depth + 1));
  if (limit < value.length) items.push(formatInspectRemaining(value.length - limit, "item"));
  return `[ ${items.join(", ")} ]`;
}

function inspectMap(value, options, context, depth) {
  const items = [];
  for (const [key, entryValue] of value) {
    items.push(`${inspectValue(key, options, context, depth + 1)} => ${inspectValue(entryValue, options, context, depth + 1)}`);
  }
  sortInspectEntries(items, options);
  return `Map(${value.size}) { ${items.join(", ")} }`;
}

function inspectSet(value, options, context, depth) {
  const items = [];
  for (const entryValue of value) {
    items.push(inspectValue(entryValue, options, context, depth + 1));
  }
  sortInspectEntries(items, options);
  return `Set(${value.size}) { ${items.join(", ")} }`;
}

function inspectArrayBufferView(value, options, context, depth) {
  if (value instanceof DataView) {
    return `DataView { byteLength: ${value.byteLength}, byteOffset: ${value.byteOffset} }`;
  }
  const constructorName = value.constructor?.name ?? "TypedArray";
  if (constructorName === "OpenContainersBuffer" || constructorName === "Buffer") {
    const bytes = Array.from(value.slice(0, 50), byte => byte.toString(16).padStart(2, "0"));
    const suffix = value.length > 50 ? " ..." : "";
    return `<Buffer ${bytes.join(" ")}${suffix}>`;
  }
  const limit = Math.min(value.length, options.maxArrayLength);
  const items = Array.from(value.slice(0, limit), item => inspectValue(item, options, context, depth + 1));
  if (limit < value.length) items.push(formatInspectRemaining(value.length - limit, "item"));
  return `${constructorName}(${value.length}) [ ${items.join(", ")} ]`;
}

function inspectObject(value, options, context, depth) {
  const entries = [];
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    const enumerable = descriptor.enumerable;
    if (!enumerable && !options.showHidden) continue;
    const inspectedValue = isAccessorDescriptor(descriptor)
      ? inspectAccessorDescriptor(descriptor, options, context, depth)
      : inspectValue(descriptor.value, options, context, depth + 1);
    entries.push(`${formatInspectKey(key, !enumerable)}: ${inspectedValue}`);
  }
  sortInspectEntries(entries, options);
  return `{ ${entries.join(", ")} }`;
}

function isAccessorDescriptor(descriptor) {
  return typeof descriptor.get === "function" || typeof descriptor.set === "function";
}

function inspectAccessorDescriptor(descriptor, options, context, depth) {
  const label = typeof descriptor.get === "function" && typeof descriptor.set === "function"
    ? "Getter/Setter"
    : typeof descriptor.get === "function"
      ? "Getter"
      : "Setter";
  if (!shouldInspectGetter(descriptor, options)) return `[${label}]`;
  try {
    const value = descriptor.get();
    return `[${label}: ${inspectValue(value, options, context, depth + 1)}]`;
  } catch (error) {
    return `[${label}: <Inspection threw (${error?.stack ?? error})>]`;
  }
}

function shouldInspectGetter(descriptor, options) {
  if (typeof descriptor.get !== "function") return false;
  if (options.getters === true) return true;
  if (options.getters === "get") return typeof descriptor.set !== "function";
  if (options.getters === "set") return typeof descriptor.set === "function";
  return false;
}

function sortInspectEntries(entries, options) {
  if (options.sorted) entries.sort(typeof options.sorted === "function" ? options.sorted : undefined);
}

function formatInspectRemaining(count, noun) {
  return `... ${count} more ${noun}${count === 1 ? "" : "s"}`;
}

function formatInspectKey(key, hidden = false) {
  if (typeof key === "symbol") return hidden ? `[${String(key)}]` : String(key);
  if (hidden) return `[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : quoteInspectString(key);
}

function quoteInspectString(value, options = {}) {
  const { text, remaining } = truncateInspectStringParts(value, options);
  const quoted = `'${text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}'`;
  return remaining > 0 ? `${quoted}... ${remaining} more character${remaining === 1 ? "" : "s"}` : quoted;
}

function truncateInspectString(value, options = {}) {
  const { text, remaining } = truncateInspectStringParts(value, options);
  return remaining > 0 ? `${text}... ${remaining} more character${remaining === 1 ? "" : "s"}` : text;
}

function truncateInspectStringParts(value, options = {}) {
  const string = String(value);
  const limit = options.maxStringLength ?? Number.POSITIVE_INFINITY;
  if (string.length <= limit) return { text: string, remaining: 0 };
  return {
    text: string.slice(0, limit),
    remaining: string.length - limit
  };
}

function formatInspectNumeric(value, options) {
  const string = String(value);
  if (!options.numericSeparator || !/^-?\d+(?:\.\d+)?$/.test(string)) return string;
  const sign = string.startsWith("-") ? "-" : "";
  const unsigned = sign ? string.slice(1) : string;
  const [integer, fraction] = unsigned.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
  return `${sign}${fraction === undefined ? grouped : `${grouped}.${fraction}`}`;
}

function colorizeInspect(value, styleName, options) {
  if (!options?.colors) return value;
  const style = INSPECT_STYLE_TO_ANSI[styleName];
  return style ? applyAnsiStyle(style, value) : value;
}

function applyAnsiStyle(styleName, value) {
  const style = ANSI_STYLES[styleName];
  if (!style) return String(value);
  const [open, close] = style;
  return `\x1b[${open}m${value}\x1b[${close}m`;
}

function styleText(format, text, options = {}, process = undefined) {
  const styles = Array.isArray(format) ? format : [format];
  const string = String(text);
  const validateStream = options?.validateStream !== false;
  const stream = options?.stream ?? process?.stdout;
  if (validateStream && !streamSupportsColors(stream)) return string;

  let output = string;
  for (let index = styles.length - 1; index >= 0; index -= 1) {
    const style = String(styles[index]);
    if (!ANSI_STYLES[style]) {
      if (validateStream) {
        throw Object.assign(new TypeError(`Invalid style: ${style}`), { code: "ERR_INVALID_ARG_VALUE" });
      }
      continue;
    }
    output = applyAnsiStyle(style, output);
  }
  return output;
}

function streamSupportsColors(stream) {
  if (!stream) return false;
  if (typeof stream.hasColors === "function") return Boolean(stream.hasColors());
  if (typeof stream.getColorDepth === "function") return Number(stream.getColorDepth()) > 1;
  return Boolean(stream.isTTY);
}

function createDebugLogger(section, process = undefined, options = {}) {
  const normalized = String(section ?? "").toUpperCase();
  const pattern = String(process?.env?.NODE_DEBUG ?? "");
  const enabled = debugSectionEnabled(normalized, pattern);
  const debug = (...args) => {
    if (!enabled) return;
    const message = format(...args);
    const line = `${normalized} ${process?.pid ?? 0}: ${message}\n`;
    if (typeof process?.stderr?.write === "function") process.stderr.write(line);
    else process?.stderr?.emit?.("data", line);
  };
  const name = typeof options.name === "function" ? options.name(enabled) : options.name ?? "logger";
  Object.defineProperty(debug, "name", { configurable: true, value: name });
  Object.defineProperty(debug, "enabled", {
    enumerable: true,
    configurable: true,
    get: () => enabled
  });
  return debug;
}

function diff(actual, expected) {
  if (typeof actual !== "string") {
    throw createInvalidArgTypeError("actual", "string", actual);
  }
  if (typeof expected !== "string") {
    throw createInvalidArgTypeError("expected", "string", expected);
  }
  if (actual === expected) return [];

  let prefixLength = 0;
  while (prefixLength < actual.length && prefixLength < expected.length && actual[prefixLength] === expected[prefixLength]) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    suffixLength < actual.length - prefixLength
    && suffixLength < expected.length - prefixLength
    && actual[actual.length - 1 - suffixLength] === expected[expected.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }

  const changes = [];
  if (prefixLength > 0) changes.push([0, actual.slice(0, prefixLength)]);
  const removed = actual.slice(prefixLength, actual.length - suffixLength);
  const added = expected.slice(prefixLength, expected.length - suffixLength);
  if (removed) changes.push([1, removed]);
  if (added) changes.push([-1, added]);
  if (suffixLength > 0) changes.push([0, actual.slice(actual.length - suffixLength)]);
  return changes;
}

function getCallSites(options = {}) {
  const stack = new Error().stack ?? "";
  const frames = stack.split("\n").slice(2);
  const sourceMaps = options?.sourceMap === true;
  return frames.map((frame, index) => {
    const parsed = parseStackFrame(frame.trim());
    return {
      functionName: parsed.functionName,
      scriptName: parsed.scriptName,
      scriptId: String(index),
      lineNumber: parsed.lineNumber,
      columnNumber: parsed.columnNumber,
      line: parsed.lineNumber,
      column: parsed.columnNumber,
      sourceMap: sourceMaps ? null : undefined
    };
  });
}

function parseStackFrame(frame) {
  const withFunction = frame.match(/^at\s+(.*?)\s+\((.*):(\d+):(\d+)\)$/);
  if (withFunction) {
    return {
      functionName: withFunction[1] === "async" ? "" : withFunction[1],
      scriptName: withFunction[2],
      lineNumber: Number(withFunction[3]),
      columnNumber: Number(withFunction[4])
    };
  }
  const withoutFunction = frame.match(/^at\s+(.*):(\d+):(\d+)$/);
  if (withoutFunction) {
    return {
      functionName: "",
      scriptName: withoutFunction[1],
      lineNumber: Number(withoutFunction[2]),
      columnNumber: Number(withoutFunction[3])
    };
  }
  return {
    functionName: "",
    scriptName: "",
    lineNumber: 0,
    columnNumber: 0
  };
}

function createInvalidArgTypeError(name, expected, value) {
  const error = new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createInvalidArgInstanceError(name, expected, value) {
  const error = new TypeError(`The "${name}" argument must be an instance of ${expected}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createInvalidPropertyTypeError(name, expected, value) {
  const error = new TypeError(`The "${name}" property must be of type ${expected}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createInvalidReturnPropertyValueError(name, expected, value) {
  const error = new TypeError(`The "${name}" loader hook property must be ${expected}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_RETURN_PROPERTY_VALUE";
  return error;
}

function createUnsupportedModuleHookFormatError(format) {
  const error = new TypeError(`OpenContainers cannot require module hook format ${String(format)}`);
  error.code = "ERR_OPENCONTAINERS_MODULE_HOOK_FORMAT_UNSUPPORTED";
  return error;
}

function createUnknownModuleFormatError(format, specifier) {
  const error = new RangeError(`Unknown module format: ${format ?? "null"} for URL ${specifier}`);
  error.code = "ERR_UNKNOWN_MODULE_FORMAT";
  return error;
}

function createModuleRegisterUnsupportedResolveRequestError(specifier, parentURL) {
  const error = new TypeError(`Failed to resolve module specifier "${specifier}" from "${parentURL}": Invalid relative URL or base scheme is not hierarchical.`);
  error.code = "ERR_UNSUPPORTED_RESOLVE_REQUEST";
  return error;
}

function debugSectionEnabled(section, pattern) {
  if (!section || !pattern) return false;
  const sections = pattern
    .split(/[\s,]+/)
    .map(part => part.trim().toUpperCase())
    .filter(Boolean);
  return sections.some((entry) => {
    if (entry === "*") return true;
    const expression = `^${entry.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*")}$`;
    return new RegExp(expression).test(section);
  });
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

function parseArgs(config = {}, process = undefined) {
  const defaultArgsStart = process?.__opencontainersArgvParseStart ?? 2;
  const args = [...(config.args ?? process?.argv?.slice(defaultArgsStart) ?? [])].map(String);
  const options = config.options ?? {};
  const strict = config.strict !== false;
  const allowPositionals = config.allowPositionals ?? !strict;
  const tokensEnabled = Boolean(config.tokens);
  const values = Object.create(null);
  const positionals = [];
  const tokens = [];
  const shortToLong = new Map();

  for (const [name, option] of Object.entries(options)) {
    validateParseArgsOption(name, option);
    if (Object.prototype.hasOwnProperty.call(option, "default")) values[name] = option.default;
    if (option.short) shortToLong.set(option.short, name);
  }

  const setOption = (name, value, rawName, inlineValue = undefined, argIndex = tokens.length) => {
    const option = options[name];
    if (!option) {
      if (strict) throw Object.assign(new TypeError(`Unknown option '${rawName}'`), { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" });
      values[name] = value;
      if (tokensEnabled) {
        tokens.push({
          kind: "option",
          name,
          rawName,
          index: argIndex,
          value: value === true ? undefined : value,
          inlineValue: value === true ? undefined : inlineValue
        });
      }
      return;
    }
    if (option.type === "boolean" && value !== true && value !== false) {
      throw Object.assign(new TypeError(`Option '${rawName}' does not take an argument`), {
        code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
      });
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
        index: argIndex,
        value: option.type === "boolean" ? undefined : parsedValue,
        inlineValue
      });
    }
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      if (tokensEnabled) tokens.push({ kind: "option-terminator", index });
      for (let positionalIndex = index + 1; positionalIndex < args.length; positionalIndex += 1) {
        pushPositional(args[positionalIndex], positionalIndex);
      }
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const argIndex = index;
      const equalsIndex = arg.indexOf("=");
      const name = equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
      const option = options[name];
      if (option?.type === "boolean") {
        if (equalsIndex !== -1) {
          throw Object.assign(new TypeError(`Option '--${name}' does not take an argument`), {
            code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
          });
        }
        setOption(name, true, `--${name}`, undefined, argIndex);
      } else {
        if (!option) {
          if (equalsIndex === -1) setOption(name, true, `--${name}`, undefined, argIndex);
          else setOption(name, arg.slice(equalsIndex + 1), `--${name}`, true, argIndex);
          continue;
        }
        const value = equalsIndex === -1 ? args[index + 1] : arg.slice(equalsIndex + 1);
        if (value === undefined) throw createParseArgsMissingValueError(`--${name}`, true);
        if (equalsIndex === -1 && value.startsWith("-")) throw createParseArgsAmbiguousValueError(`--${name}`);
        if (equalsIndex === -1) index += 1;
        setOption(name, value, `--${name}`, equalsIndex !== -1, argIndex);
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const argIndex = index;
      const flags = arg.slice(1);
      for (let flagIndex = 0; flagIndex < flags.length; flagIndex += 1) {
        const short = flags[flagIndex];
        const name = shortToLong.get(short) ?? short;
        const option = options[name];
        if (option?.type === "string") {
          const rest = flags.slice(flagIndex + 1);
          const value = rest || args[index + 1];
          if (value === undefined) throw createParseArgsMissingValueError(`-${short}`, true);
          if (!rest && value.startsWith("-")) throw createParseArgsAmbiguousValueError(`-${short}`);
          if (!rest) index += 1;
          setOption(name, value, `-${short}`, Boolean(rest), argIndex);
          break;
        }
        setOption(name, true, `-${short}`, undefined, argIndex);
      }
      continue;
    }
    pushPositional(arg, index);
  }

  for (const [name, option] of Object.entries(options)) {
    if (option.multiple && Object.prototype.hasOwnProperty.call(option, "default") && values[name] === undefined) values[name] = option.default;
  }

  return tokensEnabled ? { values, positionals, tokens } : { values, positionals };

  function pushPositional(value, argIndex = tokens.length) {
    if (!allowPositionals) {
      throw Object.assign(new TypeError(`Unexpected argument '${value}'`), { code: "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL" });
    }
    positionals.push(value);
    if (tokensEnabled) tokens.push({ kind: "positional", index: argIndex, value });
  }
}

function validateParseArgsOption(name, option) {
  const type = option?.type;
  if (type !== "string" && type !== "boolean") {
    throw Object.assign(new TypeError(`The "options.${name}.type" property must be ('string|boolean'). Received ${describeReceived(type)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (Object.prototype.hasOwnProperty.call(option, "short")) {
    if (typeof option.short !== "string") {
      throw createInvalidArgTypeError(`options.${name}.short`, "string", option.short);
    }
    if (option.short.length !== 1) {
      throw Object.assign(new TypeError(`The property 'options.${name}.short' must be a single character. Received ${formatInvalidReceived(option.short)}`), {
        code: "ERR_INVALID_ARG_VALUE"
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(option, "multiple") && typeof option.multiple !== "boolean") {
    throw createInvalidArgTypeError(`options.${name}.multiple`, "boolean", option.multiple);
  }
}

function createParseArgsMissingValueError(rawName, long = false) {
  return Object.assign(new TypeError(`Option '${rawName}${long ? " <value>" : ""}' argument missing`), {
    code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
  });
}

function createParseArgsAmbiguousValueError(rawName) {
  return Object.assign(new TypeError(`Option '${rawName}' argument is ambiguous.`), {
    code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
  });
}

const querystringBuiltin = {
  unescapeBuffer: querystringUnescapeBuffer,
  unescape: qsUnescape,
  escape: qsEscape,
  stringify: querystringStringify,
  encode: querystringStringify,
  parse: querystringParse,
  decode: querystringParse
};
for (const [fn, name, length] of [
  [querystringParse, "parse", 4],
  [querystringStringify, "stringify", 4],
  [qsEscape, "qsEscape", 1],
  [qsUnescape, "qsUnescape", 2],
  [querystringUnescapeBuffer, "unescapeBuffer", 2]
]) {
  Object.defineProperty(fn, "name", { configurable: true, value: name });
  Object.defineProperty(fn, "length", { configurable: true, value: length });
}

const streamConsumersBuiltin = {
  arrayBuffer: async (stream) => {
    const buffer = await consumeToBuffer(stream);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  },
  blob: async (stream) => new Blob([await consumeToBuffer(stream)]),
  buffer,
  bytes: async (stream) => {
    const buffer = await consumeToBuffer(stream);
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  },
  text: async (stream) => (await consumeToBuffer(stream)).toString("utf8"),
  json: async (stream) => JSON.parse((await consumeToBuffer(stream)).toString("utf8"))
};

async function buffer(stream) {
  return consumeToBuffer(stream);
}

async function consumeToBuffer(stream) {
  if (stream === undefined || stream === null) {
    throw new TypeError(`Cannot read properties of ${stream} (reading 'Symbol(Symbol.asyncIterator)')`);
  }
  if (typeof stream?.then === "function") return consumeToBuffer(await stream);
  if (typeof Blob !== "undefined" && stream instanceof Blob) return RuntimeBuffer.from(await stream.arrayBuffer());
  if (typeof stream?.arrayBuffer === "function" && typeof stream?.getReader !== "function") return RuntimeBuffer.from(await stream.arrayBuffer());
  if (typeof stream === "string" || stream instanceof Uint8Array || stream instanceof ArrayBuffer || ArrayBuffer.isView(stream)) return chunkToBuffer(stream);

  const chunks = [];
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value !== undefined) chunks.push(chunkToBuffer(value));
    }
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream) chunks.push(chunkToBuffer(chunk));
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream[Symbol.iterator] === "function") {
    for (const chunk of stream) chunks.push(chunkToBuffer(chunk));
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream.on === "function") {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        stream.off?.("data", onData);
        stream.off?.("error", onError);
        stream.off?.("end", onDone);
        stream.off?.("close", onDone);
      };
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const onData = chunk => chunks.push(chunkToBuffer(chunk));
      const onError = error => settle(reject, error);
      const onDone = () => settle(resolve, RuntimeBuffer.concat(chunks));
      stream.on("data", onData);
      stream.once?.("error", onError);
      stream.once?.("end", onDone);
      stream.once?.("close", onDone);
      stream.resume?.();
    });
  }
  throw new TypeError("stream is not async iterable");
}

function chunkToBuffer(chunk) {
  if (chunk === undefined || chunk === null) return RuntimeBuffer.alloc(0);
  if (typeof chunk === "string") return RuntimeBuffer.from(chunk);
  if (chunk instanceof ArrayBuffer) return RuntimeBuffer.from(chunk);
  if (ArrayBuffer.isView(chunk)) return RuntimeBuffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return RuntimeBuffer.from(String(chunk));
}

function createStreamWebBuiltin() {
  const streams = getWebStreamConstructors();
  const builtin = {
    ...streams,
    ByteLengthQueuingStrategy: globalThis.ByteLengthQueuingStrategy ?? OpenContainersByteLengthQueuingStrategy,
    CountQueuingStrategy: globalThis.CountQueuingStrategy ?? OpenContainersCountQueuingStrategy,
    TextEncoderStream: globalThis.TextEncoderStream ?? OpenContainersTextEncoderStream,
    TextDecoderStream: globalThis.TextDecoderStream ?? OpenContainersTextDecoderStream,
    CompressionStream: globalThis.CompressionStream,
    DecompressionStream: globalThis.DecompressionStream
  };
  return builtin;
}

function createPerfHooksBuiltin() {
  const performance = createPerfHooksPerformance();
  const constants = createPerfHooksConstants();
  const builtin = {
    Performance: PerfHooksPerformance,
    PerformanceEntry: OpenContainersPerformanceEntry,
    PerformanceMark: OpenContainersPerformanceMark,
    PerformanceMeasure: OpenContainersPerformanceMeasure,
    PerformanceObserver: OpenContainersPerformanceObserver,
    PerformanceObserverEntryList: OpenContainersPerformanceObserverEntryList,
    PerformanceResourceTiming: OpenContainersPerformanceResourceTiming,
    monitorEventLoopDelay,
    eventLoopUtilization: performance.eventLoopUtilization,
    timerify: performance.timerify,
    createHistogram,
    performance,
    constants
  };
  Object.defineProperty(builtin, "constants", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: constants
  });
  return builtin;
}

function monitorEventLoopDelay(options = undefined) {
  validatePerfHooksOptions("options", options);
  validatePerfHooksIntegerOption("options.resolution", options?.resolution, 1, Number.MAX_SAFE_INTEGER);
  return new ELDHistogram(options);
}

function timerify(fn, options = {}) {
  if (typeof fn !== "function") {
    throw Object.assign(new TypeError("fn must be a function"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  const histogram = normalizeTimerifyOptions(options).histogram;
  const timerified = function timerified(...args) {
    const startTime = performanceNow();
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).finally(() => {
          recordPerformanceFunctionEntry(fn.name || "anonymous", startTime, performanceNow() - startTime, args, histogram);
        });
      }
      recordPerformanceFunctionEntry(fn.name || "anonymous", startTime, performanceNow() - startTime, args, histogram);
      return result;
    } catch (error) {
      recordPerformanceFunctionEntry(fn.name || "anonymous", startTime, performanceNow() - startTime, args, histogram);
      throw error;
    }
  };
  try {
    Object.defineProperty(timerified, "name", {
      configurable: true,
      value: `timerified ${fn.name || ""}`.trim()
    });
    Object.defineProperty(timerified, "length", {
      configurable: true,
      value: fn.length
    });
  } catch {
    // Function metadata is best-effort in browser runtimes.
  }
  return timerified;
}

function createHistogram(options = undefined) {
  validatePerfHooksOptions("options", options);
  validatePerfHooksIntegerOption("options.lowest", options?.lowest, 1, Number.MAX_SAFE_INTEGER);
  const lowest = Number.isInteger(options?.lowest) ? options.lowest : 1;
  validatePerfHooksIntegerOption("options.highest", options?.highest, lowest * 2, Number.MAX_SAFE_INTEGER);
  validatePerfHooksIntegerOption("options.figures", options?.figures, 1, 5);
  return new OpenContainersHistogram();
}

function validatePerfHooksOptions(name, value) {
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
    throw createInvalidArgTypeError(name, "object", value);
  }
}

function validatePerfHooksIntegerOption(name, value, min, max) {
  if (value === undefined) return;
  if (typeof value !== "number") {
    throw createInvalidPropertyTypeError(name, "number", value);
  }
  if (!Number.isInteger(value)) {
    const error = new RangeError(`The value of "${name}" is out of range. It must be an integer. Received ${value}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  if (value < min || value > max) {
    const error = new RangeError(`The value of "${name}" is out of range. It must be >= ${min} && <= ${max}. Received ${value}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
}

function createPerfHooksConstants() {
  const constants = {};
  for (const [name, value] of Object.entries({
    NODE_PERFORMANCE_GC_MAJOR: 4,
    NODE_PERFORMANCE_GC_MINOR: 1,
    NODE_PERFORMANCE_GC_INCREMENTAL: 8,
    NODE_PERFORMANCE_GC_WEAKCB: 16,
    NODE_PERFORMANCE_GC_FLAGS_NO: 0,
    NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED: 2,
    NODE_PERFORMANCE_GC_FLAGS_FORCED: 4,
    NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING: 8,
    NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE: 16,
    NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY: 32,
    NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE: 64
  })) {
    Object.defineProperty(constants, name, {
      configurable: false,
      enumerable: true,
      writable: false,
      value
    });
  }
  for (const [name, value] of Object.entries({
    NODE_PERFORMANCE_ENTRY_TYPE_GC: 0,
    NODE_PERFORMANCE_ENTRY_TYPE_HTTP: 1,
    NODE_PERFORMANCE_ENTRY_TYPE_HTTP2: 2,
    NODE_PERFORMANCE_ENTRY_TYPE_NET: 3,
    NODE_PERFORMANCE_ENTRY_TYPE_DNS: 4,
    NODE_PERFORMANCE_ENTRY_TYPE_QUIC: 5,
    NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP: 0,
    NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN: 1,
    NODE_PERFORMANCE_MILESTONE_ENVIRONMENT: 2,
    NODE_PERFORMANCE_MILESTONE_NODE_START: 3,
    NODE_PERFORMANCE_MILESTONE_V8_START: 4,
    NODE_PERFORMANCE_MILESTONE_LOOP_START: 5,
    NODE_PERFORMANCE_MILESTONE_LOOP_EXIT: 6,
    NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE: 7
  })) {
    Object.defineProperty(constants, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value
    });
  }
  return constants;
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

const punycodeBuiltin = {
  version: "2.1.0",
  ucs2: {
    decode: ucs2Decode,
    encode: ucs2Encode
  },
  decode: punycodeDecode,
  encode: punycodeEncode,
  toASCII: function toASCII(domain) {
    return domain
      .split(PUNYCODE_DOMAIN_SEPARATOR_PATTERN)
      .map(label => /^[\x00-\x7F]*$/.test(label) ? label : `xn--${punycodeEncode(label)}`)
      .join(".");
  },
  toUnicode: function toUnicode(domain) {
    return domain
      .split(PUNYCODE_DOMAIN_SEPARATOR_PATTERN)
      .map(label => label.toLowerCase().startsWith("xn--") ? punycodeDecode(label.slice(4)) : label)
      .join(".");
  }
};
for (const [fn, name] of [
  [punycodeBuiltin.decode, "decode"],
  [punycodeBuiltin.encode, "encode"],
  [punycodeBuiltin.ucs2.decode, "ucs2decode"],
  [punycodeBuiltin.ucs2.encode, "ucs2encode"]
]) {
  Object.defineProperty(fn, "name", { configurable: true, value: name });
}

const domainStack = [];

function createDomain() {
  return new domainBuiltin.Domain();
}

const domainBuiltin = {
  _stack: domainStack,
  Domain: class Domain extends eventsBuiltin {
    constructor() {
      super();
      Object.defineProperty(this, "domain", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: null
      });
      this.members = [];
    }

    add(emitter) {
      const previousDomain = emitter.domain;
      if (previousDomain && previousDomain !== this) previousDomain.remove(emitter);
      if (!this.members.includes(emitter)) {
        this.members.push(emitter);
        Object.defineProperty(emitter, "domain", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: this
        });
      }
    }

    remove(emitter) {
      this.members = this.members.filter(member => member !== emitter);
      emitter.domain = null;
    }

    bind(callback) {
      const domain = this;
      return function runBound(...args) {
        domain.enter();
        try {
          return callback.apply(this, args);
        } catch (error) {
          domain.emit("error", error);
        } finally {
          domain.exit();
        }
      };
    }

    intercept(callback) {
      const domain = this;
      return function runIntercepted(...callbackArgs) {
        const [error, ...args] = callbackArgs;
        domain.enter();
        if (error) {
          try {
            domain.emit("error", error);
          } finally {
            domain.exit();
          }
          return;
        }
        try {
          return callback.apply(this, args);
        } finally {
          domain.exit();
        }
      };
    }

    run(callback, ...args) {
      return this.bind(callback)(...args);
    }

    enter() {
      domainStack.push(this);
      domainBuiltin.active = this;
      return this;
    }

    exit() {
      const index = domainStack.lastIndexOf(this);
      if (index !== -1) {
        domainStack.splice(index);
        domainBuiltin.active = domainStack[domainStack.length - 1];
      }
      return this;
    }

    dispose() {
      this.removeAllListeners();
      for (const member of [...this.members]) this.remove(member);
      this.members = [];
      this.exit();
    }
  },
  createDomain,
  create: createDomain,
  active: null
};

function alignDomainPrototypeMetadata() {
  const prototype = domainBuiltin.Domain.prototype;
  const metadata = {
    members: { value: undefined },
    _errorHandler: { value(error) { return false; }, length: 1 },
    enter: { length: 0 },
    exit: { length: 0 },
    add: { length: 1 },
    remove: { length: 1 },
    run: { length: 1 },
    intercept: { length: 1 },
    bind: { length: 1 }
  };
  const values = {};
  for (const [name, options] of Object.entries(metadata)) {
    values[name] = options.value ?? Object.getOwnPropertyDescriptor(prototype, name)?.value;
  }
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name !== "constructor") delete prototype[name];
  }

  for (const [name, options] of Object.entries(metadata)) {
    let value = values[name];
    if (typeof value === "function") {
      if (!Object.hasOwn(value, "prototype")) {
        const original = value;
        value = function (...args) {
          return original.apply(this, args);
        };
      }
      Object.defineProperty(value, "name", { configurable: true, value: "" });
      Object.defineProperty(value, "length", { configurable: true, value: options.length });
    }
    Object.defineProperty(prototype, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }
}

alignDomainPrototypeMetadata();

const PUNYCODE_BASE = 36;
const PUNYCODE_TMIN = 1;
const PUNYCODE_TMAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;
const PUNYCODE_DELIMITER = "-";
const PUNYCODE_DOMAIN_SEPARATOR_PATTERN = /[\x2E\u3002\uFF0E\uFF61]/;

function ucs2Decode(string) {
  const output = [];
  const input = string;
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
  return String.fromCodePoint(...codePoints);
}

function punycodeDecode(input) {
  const output = [];
  const basic = input.lastIndexOf(PUNYCODE_DELIMITER);
  let index = 0;
  let n = PUNYCODE_INITIAL_N;
  let i = 0;
  let bias = PUNYCODE_INITIAL_BIAS;

  if (basic > -1) {
    for (let offset = 0; offset < basic; offset += 1) {
      output.push(input.charCodeAt(offset));
    }
    index = basic + 1;
  }

  while (index < input.length) {
    const oldi = i;
    let weight = 1;
    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      if (index >= input.length) throw new RangeError("Invalid input");
      const digit = punycodeBasicToDigit(input.charCodeAt(index++));
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

function arch() {
  return "x64";
}

const availableParallelism = () => 1;

function cpus() {
  return [{ model: "OpenContainers Virtual CPU", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }];
}

function endianness() {
  return "LE";
}

const freemem = () => 256 * 1024 * 1024;

function getPriority(pid) {
    validateOsPid(pid);
    return 0;
}

function homedir() {
  return "/home/opencontainers";
}

function hostname() {
  return "opencontainers";
}

function loadavg() {
  return [0, 0, 0];
}

function networkInterfaces() {
  return {
    lo: [
      {
        address: "127.0.0.1",
        netmask: "255.0.0.0",
        family: "IPv4",
        mac: "00:00:00:00:00:00",
        internal: true,
        cidr: "127.0.0.1/8"
      },
      {
        address: "::1",
        netmask: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
        family: "IPv6",
        mac: "00:00:00:00:00:00",
        internal: true,
        cidr: "::1/128",
        scopeid: 0
      }
    ]
  };
}

function platform() {
  return "linux";
}

const release = () => "6.6.0-opencontainers";

function setPriority(pid, priority) {
    if (priority === undefined) {
      priority = pid;
      pid = 0;
    }
    validateOsPid(pid);
    validateOsPriority(priority);
}

function tmpdir() {
  return "/tmp";
}

const totalmem = () => 256 * 1024 * 1024;

const type = () => "Linux";

function userInfo(options) {
  return createOsUserInfo(options);
}

function uptime() {
  return Math.floor(globalThis.performance?.now?.() ? globalThis.performance.now() / 1000 : 0);
}

const version = () => "#1 OpenContainers Virtual Linux";

const machine = () => "x86_64";

const osBuiltin = {};
Object.defineProperties(osBuiltin, {
  arch: { enumerable: true, configurable: true, writable: true, value: arch },
  availableParallelism: { enumerable: true, configurable: true, writable: true, value: availableParallelism },
  cpus: { enumerable: true, configurable: true, writable: true, value: cpus },
  endianness: { enumerable: true, configurable: true, writable: true, value: endianness },
  freemem: { enumerable: true, configurable: true, writable: true, value: freemem },
  getPriority: { enumerable: true, configurable: true, writable: true, value: getPriority },
  homedir: { enumerable: true, configurable: true, writable: true, value: homedir },
  hostname: { enumerable: true, configurable: true, writable: true, value: hostname },
  loadavg: { enumerable: true, configurable: true, writable: true, value: loadavg },
  networkInterfaces: { enumerable: true, configurable: true, writable: true, value: networkInterfaces },
  platform: { enumerable: true, configurable: true, writable: true, value: platform },
  release: { enumerable: true, configurable: true, writable: true, value: release },
  setPriority: { enumerable: true, configurable: true, writable: true, value: setPriority },
  tmpdir: { enumerable: true, configurable: true, writable: true, value: tmpdir },
  totalmem: { enumerable: true, configurable: true, writable: true, value: totalmem },
  type: { enumerable: true, configurable: true, writable: true, value: type },
  userInfo: { enumerable: true, configurable: true, writable: true, value: userInfo },
  uptime: { enumerable: true, configurable: true, writable: true, value: uptime },
  version: { enumerable: true, configurable: true, writable: true, value: version },
  machine: { enumerable: true, configurable: true, writable: true, value: machine },
  constants: { enumerable: true, configurable: false, writable: false, value: createOsConstants() },
  EOL: { enumerable: true, configurable: true, writable: false, value: "\n" },
  devNull: { enumerable: true, configurable: true, writable: false, value: "/dev/null" }
});
alignOsFunctionMetadata();

function alignOsFunctionMetadata() {
  for (const [fn, name] of [
    [availableParallelism, ""],
    [freemem, ""],
    [homedir, "wrappedFn"],
    [hostname, "wrappedFn"],
    [release, "getOSRelease"],
    [totalmem, ""],
    [type, "getOSType"],
    [uptime, "wrappedFn"],
    [version, "getOSVersion"],
    [machine, "getMachine"]
  ]) {
    Object.defineProperty(fn, "name", {
      configurable: true,
      value: name
    });
  }
}

function validateOsPid(pid) {
  if (pid === undefined) return 0;
  if (typeof pid !== "number") throw createInvalidArgTypeError("pid", "number", pid);
  if (!Number.isInteger(pid)) {
    throw Object.assign(new RangeError(`The value of "pid" is out of range. It must be an integer. Received ${pid}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return pid;
}

function validateOsPriority(priority) {
  if (typeof priority !== "number") throw createInvalidArgTypeError("priority", "number", priority);
  if (!Number.isInteger(priority) || priority < -20 || priority > 19) {
    throw Object.assign(new RangeError(`The value of "priority" is out of range. It must be >= -20 && <= 19. Received ${priority}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return priority;
}

function createOsUserInfo(options = {}) {
  const info = {
    uid: 1000,
    gid: 1000,
    username: "opencontainers",
    homedir: "/home/opencontainers",
    shell: "/bin/sh"
  };

  const encoding = String(options?.encoding ?? "utf8");
  if (encoding.toLowerCase() !== "buffer") {
    if (!RuntimeBuffer.isEncoding?.(encoding)) return info;
    return {
      uid: info.uid,
      gid: info.gid,
      username: RuntimeBuffer.from(info.username).toString(encoding),
      homedir: RuntimeBuffer.from(info.homedir).toString(encoding),
      shell: RuntimeBuffer.from(info.shell).toString(encoding)
    };
  }
  return {
    uid: info.uid,
    gid: info.gid,
    username: RuntimeBuffer.from(info.username),
    homedir: RuntimeBuffer.from(info.homedir),
    shell: RuntimeBuffer.from(info.shell)
  };
}

function createOsConstants() {
  const constants = Object.create(null);
  const dlopen = createReadOnlyNullPrototypeObject({
    RTLD_LAZY: 1,
    RTLD_NOW: 2,
    RTLD_GLOBAL: 8,
    RTLD_LOCAL: 4
  });
  const errno = createReadOnlyNullPrototypeObject(TOP_LEVEL_ERRNO_CONSTANTS);
  const signals = Object.freeze(createReadOnlyNullPrototypeObject(Object.fromEntries(LINUX_SIGNALS)));
  const priority = createReadOnlyNullPrototypeObject({
    PRIORITY_LOW: 19,
    PRIORITY_BELOW_NORMAL: 10,
    PRIORITY_NORMAL: 0,
    PRIORITY_ABOVE_NORMAL: -7,
    PRIORITY_HIGH: -14,
    PRIORITY_HIGHEST: -20
  });
  Object.defineProperties(constants, {
    UV_UDP_REUSEADDR: { enumerable: true, configurable: false, writable: false, value: 4 },
    dlopen: { enumerable: true, configurable: true, writable: true, value: dlopen },
    errno: { enumerable: true, configurable: true, writable: true, value: errno },
    signals: { enumerable: true, configurable: true, writable: true, value: signals },
    priority: { enumerable: true, configurable: true, writable: true, value: priority }
  });
  return constants;
}

function createReadOnlyNullPrototypeObject(values) {
  const object = Object.create(null);
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(object, name, {
      enumerable: true,
      configurable: false,
      writable: false,
      value
    });
  }
  return object;
}

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = "";
}

alignUrlPrototypeMetadata();

function alignUrlPrototypeMetadata() {
  const methods = {
    parse: function parse(input, parseQueryString, slashesDenoteHost) {
      Object.assign(this, parseUrl(
        input,
        parseQueryString === undefined ? false : parseQueryString,
        slashesDenoteHost === undefined ? false : slashesDenoteHost
      ));
      return this;
    },
    format: function format() {
      return formatUrl(this);
    },
    resolve: function resolve(relative) {
      return resolveUrl(this.format(), relative);
    },
    resolveObject: function resolveObject(relative) {
      return resolveObjectUrl(this.format(), relative);
    },
    parseHost: function parseHost() {
      const hostPattern = /:[0-9]*$/;
      let host = this.host;
      let port = hostPattern.exec(host);
      if (port) {
        port = port[0];
        if (port !== ":") this.port = port.slice(1);
        host = host.slice(0, host.length - port.length);
      }
      if (host) this.hostname = host;
    }
  };
  for (const [name, value] of Object.entries(methods)) {
    Object.defineProperty(Url.prototype, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  }
}

function createUrlBuiltin({ process } = {}) {
  const pathToFileURL = function pathToFileURL(path, options) {
    if (typeof path !== "string") throw createInvalidArgTypeError("path", "string", path);
    return pathToFileUrlWithOptions(path, options, process?.cwd?.() ?? "/workspace");
  };
  const fileURLToPath = function fileURLToPath(path, options) {
    return fileURLToPathString(normalizeFileUrlPathInput(path), options);
  };
  const urlBuiltin = {};
  Object.defineProperties(urlBuiltin, {
    Url: { enumerable: true, configurable: true, writable: true, value: Url },
    parse: { enumerable: true, configurable: true, writable: true, value: parseUrl },
    resolve: { enumerable: true, configurable: true, writable: true, value: resolveUrl },
    resolveObject: { enumerable: true, configurable: true, writable: true, value: resolveObjectUrl },
    format: { enumerable: true, configurable: true, writable: true, value: formatUrl },
    URL: { enumerable: true, configurable: true, writable: true, value: URL },
    URLPattern: { enumerable: true, configurable: true, writable: true, value: globalThis.URLPattern },
    URLSearchParams: { enumerable: true, configurable: true, writable: true, value: URLSearchParams },
    domainToASCII: { enumerable: true, configurable: true, writable: true, value: domainToASCII },
    domainToUnicode: { enumerable: true, configurable: true, writable: true, value: domainToUnicode },
    pathToFileURL: { enumerable: true, configurable: true, writable: true, value: pathToFileURL },
    fileURLToPath: { enumerable: true, configurable: true, writable: true, value: fileURLToPath },
    fileURLToPathBuffer: { enumerable: true, configurable: true, writable: true, value: fileURLToPathBuffer },
    urlToHttpOptions: { enumerable: true, configurable: true, writable: true, value: urlToHttpOptions }
  });
  for (const [fn, name, length] of [
    [urlBuiltin.fileURLToPath, "fileURLToPath", 1],
    [urlBuiltin.format, "urlFormat", 2],
    [urlBuiltin.parse, "urlParse", 3],
    [urlBuiltin.pathToFileURL, "pathToFileURL", 2],
    [urlBuiltin.resolve, "urlResolve", 2],
    [urlBuiltin.resolveObject, "urlResolveObject", 2]
  ]) {
    Object.defineProperty(fn, "name", { configurable: true, value: name });
    Object.defineProperty(fn, "length", { configurable: true, value: length });
  }
  return urlBuiltin;
}

function formatUrl(input, options = {}) {
  if (input instanceof URL) {
    const url = new URL(input.href);
    if (options.auth === false) {
      url.username = "";
      url.password = "";
    }
    if (options.fragment === false) url.hash = "";
    if (options.search === false) url.search = "";
    if (options.unicode === true && url.hostname) {
      const unicodeHostname = domainToUnicode(url.hostname);
      if (unicodeHostname) return url.href.replace(url.hostname, unicodeHostname);
    }
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
  if (typeof input !== "string") throw createInvalidArgTypeError("url", "string", input);
  const source = input;
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
  return toUrlObject({
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
  });
}

function parseRelativeUrl(source, parseQueryString = false) {
  const hashIndex = source.indexOf("#");
  const withoutHash = hashIndex === -1 ? source : source.slice(0, hashIndex);
  const hash = hashIndex === -1 ? null : source.slice(hashIndex);
  const searchIndex = withoutHash.indexOf("?");
  const pathname = searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex);
  const search = searchIndex === -1 ? null : withoutHash.slice(searchIndex);
  return toUrlObject({
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
  });
}

function resolveUrl(from, to) {
  try {
    return new URL(String(to), String(from)).href;
  } catch {
    if (String(from).startsWith("/")) {
      try {
        const resolved = new URL(String(to), `resolve://opencontainers.local${String(from)}`);
        return `${resolved.pathname}${resolved.search}${resolved.hash}`;
      } catch {
        // Fall through to Node's legacy behavior for unresolvable inputs.
      }
    }
    return String(to);
  }
}

function resolveObjectUrl(from, to) {
  return parseUrl(resolveUrl(from, to));
}

function toUrlObject(properties) {
  return Object.assign(new Url(), properties);
}

function fileURLToPathBuffer(specifier, options = undefined) {
  const source = normalizeFileUrlPathInput(specifier);
  if (!source.startsWith("file://")) {
    throw Object.assign(new TypeError("The URL must be of scheme file"), {
      code: "ERR_INVALID_URL_SCHEME"
    });
  }
  try {
    const url = new URL(source);
    return fileURLToPathBufferValue(url, options);
  } catch (error) {
    if (error?.code) throw error;
    return querystringUnescapeBuffer(source.replace(/^file:\/\//, ""));
  }
}

function normalizeFileUrlPathInput(path) {
  if (typeof path === "string") return path;
  if (path instanceof URL) return path.href;
  throw createInvalidArgTypeError("path", "string or an instance of URL", path);
}

function fileURLToPathBufferValue(url, options = undefined) {
  const windows = normalizeFileUrlWindowsOption(options);
  if (!windows) {
    if (url.hostname && url.hostname !== "localhost") throw createInvalidFileUrlHostError(false);
    return querystringUnescapeBuffer(url.pathname);
  }
  const pathname = querystringUnescapeBuffer(url.pathname);
  if (url.hostname && url.hostname !== "localhost") {
    return bufferFromAsciiPath(`\\\\${url.hostname}`.split("").map((char) => char.charCodeAt(0)), pathname, true);
  }
  const bytes = Array.from(pathname);
  if (bytes[0] !== 0x2f || !isWindowsDriveByte(bytes[1]) || (bytes[2] !== 0x3a && bytes[2] !== 0x7c)) {
    throw createInvalidFileUrlPathError("File URL path must be absolute");
  }
  return RuntimeBuffer.from(bytes.slice(1).map((byte) => byte === 0x2f ? 0x5c : byte));
}

function bufferFromAsciiPath(prefixBytes, pathBuffer, convertSlash) {
  const bytes = [...prefixBytes];
  for (const byte of pathBuffer) bytes.push(convertSlash && byte === 0x2f ? 0x5c : byte);
  return RuntimeBuffer.from(bytes);
}

function isWindowsDriveByte(byte) {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

function urlToHttpOptions(input) {
  if (input === null || typeof input !== "object") {
    const received = typeof input === "string"
      ? `type string (${formatInvalidReceived(input)})`
      : describeReceived(input);
    throw Object.assign(new TypeError(`The "url" argument must be of type object. Received ${received}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  const isUrlObject = input instanceof URL;
  const options = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (Object.prototype.propertyIsEnumerable.call(input, key)) {
      options[key] = input[key];
    }
  }
  const pathname = input.pathname ?? "";
  const search = input.search ?? "";
  Object.assign(options, {
    protocol: input.protocol,
    hostname: stripUrlHttpOptionHostname(input.hostname),
    hash: input.hash,
    search,
    pathname: input.pathname,
    path: `${pathname}${search}`,
    href: input.href
  });
  if (input.port || !isUrlObject) options.port = Number(input.port);
  if (input.username || input.password) {
    options.auth = `${decodeURIComponent(input.username)}:${decodeURIComponent(input.password)}`;
  }
  return options;
}

function stripUrlHttpOptionHostname(hostname) {
  return typeof hostname === "string" && hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function domainToASCII(domain) {
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return "";
  }
}

function domainToUnicode(domain) {
  const ascii = domainToASCII(domain);
  if (!ascii) return "";
  return ascii.split(".").map((label) => {
    if (!label.startsWith("xn--")) return label;
    try {
      return punycodeDecode(label.slice(4));
    } catch {
      return "";
    }
  }).join(".");
}

const {
  defaultCoreCipherList: topLevelDefaultCoreCipherList,
  ...TOP_LEVEL_OPENSSL_CONSTANTS
} = OPENSSL_CONSTANTS;

const constantsBuiltin = Object.freeze({
  RTLD_LAZY: 1,
  RTLD_NOW: 2,
  RTLD_GLOBAL: 8,
  RTLD_LOCAL: 4,
  ...TOP_LEVEL_ERRNO_CONSTANTS,
  PRIORITY_LOW: 19,
  PRIORITY_BELOW_NORMAL: 10,
  PRIORITY_NORMAL: 0,
  PRIORITY_ABOVE_NORMAL: -7,
  PRIORITY_HIGH: -14,
  PRIORITY_HIGHEST: -20,
  ...Object.fromEntries(TOP_LEVEL_CONSTANT_SIGNALS),
  UV_FS_SYMLINK_DIR: 1,
  UV_FS_SYMLINK_JUNCTION: 2,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  UV_DIRENT_UNKNOWN: 0,
  UV_DIRENT_FILE: 1,
  UV_DIRENT_DIR: 2,
  UV_DIRENT_LINK: 3,
  UV_DIRENT_FIFO: 4,
  UV_DIRENT_SOCKET: 5,
  UV_DIRENT_CHAR: 6,
  UV_DIRENT_BLOCK: 7,
  S_IFMT: 0o170000,
  S_IFREG: 0o100000,
  S_IFDIR: 0o040000,
  S_IFCHR: 0o020000,
  S_IFBLK: 0o060000,
  S_IFIFO: 0o010000,
  S_IFLNK: 0o120000,
  S_IFSOCK: 0o140000,
  O_CREAT: 0o100,
  O_EXCL: 0o200,
  UV_FS_O_FILEMAP: 0,
  O_NOCTTY: 0o400,
  O_TRUNC: 0o1000,
  O_APPEND: 0o2000,
  O_DIRECTORY: 0o200000,
  O_NOFOLLOW: 0o400000,
  O_SYNC: 0o4010000,
  O_DSYNC: 0o10000,
  O_SYMLINK: 0o10000000,
  O_NONBLOCK: 0o4000,
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
  S_IXOTH: 0o001,
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  UV_FS_COPYFILE_EXCL: 1,
  COPYFILE_EXCL: 1,
  UV_FS_COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE: 2,
  UV_FS_COPYFILE_FICLONE_FORCE: 4,
  COPYFILE_FICLONE_FORCE: 4,
  ...TOP_LEVEL_OPENSSL_CONSTANTS,
  ENGINE_METHOD_RSA: 1,
  ENGINE_METHOD_DSA: 2,
  ENGINE_METHOD_DH: 4,
  ENGINE_METHOD_RAND: 8,
  ENGINE_METHOD_EC: 2048,
  ENGINE_METHOD_CIPHERS: 64,
  ENGINE_METHOD_DIGESTS: 128,
  ENGINE_METHOD_PKEY_METHS: 512,
  ENGINE_METHOD_PKEY_ASN1_METHS: 1024,
  ENGINE_METHOD_ALL: 65535,
  ENGINE_METHOD_NONE: 0,
  DH_CHECK_P_NOT_SAFE_PRIME: 2,
  DH_CHECK_P_NOT_PRIME: 1,
  DH_UNABLE_TO_CHECK_GENERATOR: 4,
  DH_NOT_SUITABLE_GENERATOR: 8,
  RSA_PKCS1_PADDING: 1,
  RSA_NO_PADDING: 3,
  RSA_PKCS1_OAEP_PADDING: 4,
  RSA_X931_PADDING: 5,
  RSA_PKCS1_PSS_PADDING: 6,
  RSA_PSS_SALTLEN_DIGEST: -1,
  RSA_PSS_SALTLEN_MAX_SIGN: -2,
  RSA_PSS_SALTLEN_AUTO: -2,
  defaultCoreCipherList: topLevelDefaultCoreCipherList,
  TLS1_VERSION: 769,
  TLS1_1_VERSION: 770,
  TLS1_2_VERSION: 771,
  TLS1_3_VERSION: 772,
  POINT_CONVERSION_COMPRESSED: 2,
  POINT_CONVERSION_UNCOMPRESSED: 4,
  POINT_CONVERSION_HYBRID: 6
});

function getConstantsBuiltin({ includeDefaultCipherList = false, defaultCipherList } = {}) {
  return Object.freeze({
    ...constantsBuiltin,
    ...(includeDefaultCipherList ? { defaultCipherList } : {})
  });
}

function querystringParse(source, separator, equals, options) {
  const result = Object.create(null);
  const text = String(source || "");
  if (!text) return result;
  const delimiter = separator == null ? "&" : separator;
  const assignment = equals == null ? "=" : equals;
  const decoder = typeof options?.decodeURIComponent === "function"
    ? options.decodeURIComponent
    : decodeURIComponent;
  const maxKeys = options?.maxKeys === undefined ? 1000 : Number(options.maxKeys);
  const pairs = text.split(delimiter);
  const limitedPairs = maxKeys > 0 ? pairs.slice(0, maxKeys) : pairs;
  for (const pair of limitedPairs) {
    if (!pair) continue;
    const index = pair.indexOf(assignment);
    const rawKey = index === -1 ? pair : pair.slice(0, index);
    const rawValue = index === -1 ? "" : pair.slice(index + assignment.length);
    const key = decodeQueryComponent(rawKey, decoder);
    const value = decodeQueryComponent(rawValue, decoder);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function querystringStringify(object, separator, equals, options) {
  if (object === null || typeof object !== "object") return "";
  const delimiter = separator == null ? "&" : separator;
  const assignment = equals == null ? "=" : equals;
  const encoder = typeof options?.encodeURIComponent === "function"
    ? options.encodeURIComponent
    : encodeURIComponent;
  return Object.entries(object ?? {})
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map(item => `${encoder(String(key))}${assignment}${encoder(normalizeQuerystringValue(item))}`);
    })
    .join(delimiter);
}

function normalizeQuerystringValue(value) {
  if (value === null || value === undefined) return "";
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
      return String(value);
    default:
      return "";
  }
}

function qsEscape(source) {
  return encodeURIComponent(source);
}

function qsUnescape(source, decodeSpaces) {
  return querystringUnescapeBuffer(source, false).toString();
}

function querystringUnescapeBuffer(source, decodeSpaces) {
  const input = String(source ?? "");
  const bytes = [];
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "+" && decodeSpaces) {
      bytes.push(0x20);
      continue;
    }
    if (char === "%" && index + 2 < input.length) {
      const hex = input.slice(index + 1, index + 3);
      if (/^[\da-f]{2}$/i.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }
    const encoded = new TextEncoder().encode(char);
    for (const byte of encoded) bytes.push(byte);
  }
  return RuntimeBuffer.from(bytes);
}

function decodeQueryComponent(value, decoder = decodeURIComponent) {
  const source = String(value);
  const encoded = decoder === decodeURIComponent
    ? source.replace(/\+/g, " ")
    : source.replace(/\+/g, "%20");
  try {
    return decoder(encoded);
  } catch (_) {
    return querystringUnescapeBuffer(source, true).toString();
  }
}

class AssertionError extends Error {
  constructor(options) {
    if (options === undefined || options === null || typeof options !== "object") {
      throw Object.assign(new TypeError(`The "options" argument must be of type object. Received ${options === null ? "null" : typeof options}`), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    const { message, actual, expected, operator } = options;
    const hasCustomMessage = typeof message === "string" && message.length > 0;
    super(hasCustomMessage ? message : `${actual} ${operator} ${expected}`);
    this.generatedMessage = !hasCustomMessage;
    Object.defineProperty(this, "name", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: "AssertionError"
    });
    this.code = "ERR_ASSERTION";
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
    this.diff = "simple";
  }

  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

const ASSERT_EXPORT_ORDER = [
  "AssertionError",
  "ok",
  "fail",
  "equal",
  "notEqual",
  "deepEqual",
  "notDeepEqual",
  "deepStrictEqual",
  "notDeepStrictEqual",
  "strictEqual",
  "notStrictEqual",
  "partialDeepStrictEqual",
  "match",
  "doesNotMatch",
  "throws",
  "rejects",
  "doesNotThrow",
  "doesNotReject",
  "ifError",
  "strict",
  "Assert"
];

const STRICT_ASSERT_EXPORT_ORDER = [
  "AssertionError",
  "ok",
  "fail",
  "equal",
  "notEqual",
  "deepEqual",
  "notDeepEqual",
  "deepStrictEqual",
  "notDeepStrictEqual",
  "strictEqual",
  "notStrictEqual",
  "partialDeepStrictEqual",
  "match",
  "doesNotMatch",
  "throws",
  "rejects",
  "doesNotThrow",
  "doesNotReject",
  "ifError",
  "Assert",
  "strict"
];

function assert(value, message) {
  return ok(value, message);
}
Object.defineProperty(assert, "length", {
  configurable: true,
  value: 0
});

function ok(...args) {
  const [value, message] = args;
  if (!value) {
    throw new AssertionError({
      message,
      actual: value,
      expected: true,
      operator: "=="
    });
  }
}

class Assert {
  constructor(options) {
    const strict = options?.strict !== false;
    this.AssertionError = AssertionError;
    if (strict) {
      this.equal = strictEqual;
      this.deepEqual = deepStrictEqual;
      this.notEqual = notStrictEqual;
      this.notDeepEqual = notDeepStrictEqual;
    }
  }

  ok(...args) { return ok(...args); }
  strictEqual(actual, expected, ...rest) { return strictEqual(actual, expected, rest[0]); }
  notStrictEqual(actual, expected, ...rest) { return notStrictEqual(actual, expected, rest[0]); }
  deepStrictEqual(actual, expected, ...rest) { return deepStrictEqual(actual, expected, rest[0]); }
  notDeepStrictEqual(actual, expected, ...rest) { return notDeepStrictEqual(actual, expected, rest[0]); }
  partialDeepStrictEqual(actual, expected, ...rest) { return partialDeepStrictEqual(actual, expected, rest[0]); }
  fail(message) { return fail(message); }
  throws(fn, ...rest) { return throws(fn, rest[0], rest[1]); }
  doesNotThrow(fn, ...rest) { return doesNotThrow(fn, rest[0], rest[1]); }
  rejects(promiseOrFn, ...rest) { return rejects(promiseOrFn, rest[0], rest[1]); }
  doesNotReject(promiseOrFn, ...rest) { return doesNotReject(promiseOrFn, rest[0], rest[1]); }
  match(string, regexp, ...rest) { return match(string, regexp, rest[0]); }
  doesNotMatch(string, regexp, ...rest) { return doesNotMatch(string, regexp, rest[0]); }
  ifError(value) { return ifError(value); }
}

assert.AssertionError = AssertionError;
assert.Assert = Assert;
assert.ok = ok;
function equal(actual, expected, ...rest) {
  const message = rest[0];
  if (actual != expected) throw new AssertionError({ message, actual, expected, operator: "==" });
}
assert.equal = equal;
function notEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (actual == expected) throw new AssertionError({ message, actual, expected, operator: "!=" });
}
assert.notEqual = notEqual;
function strictEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (actual !== expected) throw new AssertionError({ message, actual, expected, operator: "===" });
}
assert.strictEqual = strictEqual;
function notStrictEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (actual === expected) throw new AssertionError({ message, actual, expected, operator: "!==" });
}
assert.notStrictEqual = notStrictEqual;
function deepStrictEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (!isDeepStrictEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: "deepStrictEqual" });
  }
}
assert.deepStrictEqual = deepStrictEqual;
function deepEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (!isDeepEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: "deepEqual" });
  }
}
assert.deepEqual = deepEqual;
function notDeepStrictEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (isDeepStrictEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: "notDeepStrictEqual" });
  }
}
assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (isDeepEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: "notDeepEqual" });
  }
}
assert.notDeepEqual = notDeepEqual;
function partialDeepStrictEqual(actual, expected, ...rest) {
  const message = rest[0];
  if (!partialDeepStrictEqualValues(actual, expected, new WeakMap())) {
    throw new AssertionError({ message, actual, expected, operator: "partialDeepStrictEqual" });
  }
}
assert.partialDeepStrictEqual = partialDeepStrictEqual;
function fail(message) {
  if (message === undefined) message = "Failed";
  throw new AssertionError({ message, operator: "fail" });
}
assert.fail = fail;
function throws(fn, ...rest) {
  const [expected, message] = rest;
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
}
assert.throws = throws;
function doesNotThrow(fn, ...rest) {
  const [expected, message] = rest;
  const normalized = normalizeExpectedAssertion(expected, message);
  try {
    fn();
  } catch (error) {
    if (expectedErrorMatches(error, normalized.expected)) {
      throw new AssertionError({ message: normalized.message, actual: error, expected: undefined, operator: "doesNotThrow" });
    }
    throw error;
  }
}
assert.doesNotThrow = doesNotThrow;
async function rejects(promiseOrFn, ...rest) {
  const [expected, message] = rest;
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
}
assert.rejects = rejects;
async function doesNotReject(promiseOrFn, ...rest) {
  const [expected, message] = rest;
  const normalized = normalizeExpectedAssertion(expected, message);
  try {
    await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    if (expectedErrorMatches(error, normalized.expected)) {
      throw new AssertionError({ message: normalized.message, actual: error, expected: undefined, operator: "doesNotReject" });
    }
    throw error;
  }
}
assert.doesNotReject = doesNotReject;
function match(string, regexp, ...rest) {
  const message = rest[0];
  if (!(regexp instanceof RegExp)) throw new TypeError("The regexp argument must be a RegExp");
  if (typeof string !== "string") {
    throw new AssertionError({
      message: message ?? `The "string" argument must be of type string. Received ${describeReceived(string)}`,
      actual: string,
      expected: regexp,
      operator: "match"
    });
  }
  if (!regexp.test(String(string))) {
    throw new AssertionError({ message, actual: string, expected: regexp, operator: "match" });
  }
}
assert.match = match;
function doesNotMatch(string, regexp, ...rest) {
  const message = rest[0];
  if (!(regexp instanceof RegExp)) throw new TypeError("The regexp argument must be a RegExp");
  if (typeof string !== "string") {
    throw new AssertionError({
      message: message ?? `The "string" argument must be of type string. Received ${describeReceived(string)}`,
      actual: string,
      expected: regexp,
      operator: "doesNotMatch"
    });
  }
  if (regexp.test(String(string))) {
    throw new AssertionError({ message, actual: string, expected: regexp, operator: "doesNotMatch" });
  }
}
assert.doesNotMatch = doesNotMatch;
function ifError(value) {
  if (value !== null && value !== undefined) {
    throw new AssertionError({
      message: value?.message ?? String(value),
      actual: value,
      expected: null,
      operator: "ifError"
    });
  }
}
assert.ifError = ifError;
alignAssertPrototypeMetadata();
const assertStrictBuiltin = createStrictAssertBuiltin(assert);
assert.strict = assertStrictBuiltin;
reorderEnumerableProperties(assert, ASSERT_EXPORT_ORDER);
reorderEnumerableProperties(assertStrictBuiltin, STRICT_ASSERT_EXPORT_ORDER);

const assertBuiltin = assert;

function createStrictAssertBuiltin(baseAssert) {
  function strict(...args) {
    return baseAssert.ok(...args);
  }
  Object.assign(strict, baseAssert, {
    ok: baseAssert.ok,
    equal: baseAssert.strictEqual,
    deepEqual: baseAssert.deepStrictEqual,
    notEqual: baseAssert.notStrictEqual,
    notDeepEqual: baseAssert.notDeepStrictEqual
  });
  strict.strict = strict;
  return strict;
}

function alignAssertPrototypeMetadata() {
  const methods = [
    ["fail", fail],
    ["ok", ok],
    ["equal", equal],
    ["notEqual", notEqual],
    ["deepEqual", deepEqual],
    ["notDeepEqual", notDeepEqual],
    ["deepStrictEqual", deepStrictEqual],
    ["notDeepStrictEqual", notDeepStrictEqual],
    ["strictEqual", strictEqual],
    ["notStrictEqual", notStrictEqual],
    ["partialDeepStrictEqual", partialDeepStrictEqual],
    ["throws", throws],
    ["rejects", rejects],
    ["doesNotThrow", doesNotThrow],
    ["doesNotReject", doesNotReject],
    ["ifError", ifError],
    ["match", match],
    ["doesNotMatch", doesNotMatch]
  ];
  for (const [key, value] of methods) {
    delete Assert.prototype[key];
    Object.defineProperty(Assert.prototype, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }
}

function reorderEnumerableProperties(target, keys) {
  const descriptors = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor?.enumerable) descriptors.push([key, descriptor]);
  }
  for (const [key] of descriptors) delete target[key];
  for (const [key, descriptor] of descriptors) Object.defineProperty(target, key, descriptor);
}

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
let diagnosticsChannelIndex = 0;

function validateDiagnosticsSubscriber(callback) {
  if (typeof callback !== "function") {
    throw createInvalidArgTypeError("subscription", "function", callback);
  }
}

function isDiagnosticsChannelName(value) {
  return typeof value === "string" || typeof value === "symbol";
}

function validateDiagnosticsChannelName(value) {
  if (isDiagnosticsChannelName(value)) return value;
  const error = new TypeError(`The "channel" argument must be one of type string or symbol. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  throw error;
}

function diagnosticsTracingName(name, event) {
  return `tracing:${String(name)}:${event}`;
}

function diagnosticsChannelFromMapEntry(value, name) {
  if (value instanceof Channel) return value;
  throw createInvalidArgTypeError(name, "Channel", value);
}

function diagnosticsInvoke(callback, thisArg, args) {
  return callback.apply(thisArg, args);
}

function reorderDiagnosticsPrototypeProperties(prototype, names, lengthOverrides = {}) {
  const descriptors = names.map((name) => [name, Object.getOwnPropertyDescriptor(prototype, name)]);
  for (const [name] of descriptors) delete prototype[name];
  for (const [name, descriptor] of descriptors) {
    if (!descriptor) continue;
    Object.defineProperty(prototype, name, descriptor);
    if (Object.hasOwn(lengthOverrides, name) && "value" in descriptor && typeof descriptor.value === "function") {
      Object.defineProperty(descriptor.value, "length", {
        configurable: true,
        value: lengthOverrides[name]
      });
    }
  }
}

function defineDiagnosticsChannelPrototypeOrder() {
  reorderDiagnosticsPrototypeProperties(Channel.prototype, [
    "constructor",
    "subscribe",
    "unsubscribe",
    "bindStore",
    "unbindStore",
    "hasSubscribers",
    "publish",
    "runStores",
    "withStoreScope"
  ], {
    unsubscribe: 0,
    unbindStore: 0
  });
  reorderDiagnosticsPrototypeProperties(BoundedChannel.prototype, [
    "constructor",
    "hasSubscribers",
    "subscribe",
    "unsubscribe",
    "withScope",
    "run"
  ]);
}

class Channel {
  constructor(name, index = diagnosticsChannelIndex++) {
    this._subscribers = new Set();
    this._stores = new Map();
    this.name = name;
    this._index = index;
  }

  get hasSubscribers() {
    return this._subscribers.size > 0;
  }

  publish() {
    const message = arguments[0];
    for (const subscriber of [...this._subscribers]) subscriber(message, this.name);
  }

  subscribe(callback) {
    validateDiagnosticsSubscriber(callback);
    this._subscribers.add(callback);
  }

  unsubscribe(callback) {
    return this._subscribers.delete(callback);
  }

  bindStore(store, transform) {
    this._stores.set(store, typeof transform === "function" ? transform : (value) => value);
  }

  unbindStore(store) {
    return this._stores.delete(store);
  }

  runStores(context, callback, thisArg, ...args) {
    return diagnosticsInvoke(callback, thisArg, args);
  }

  withStoreScope() {
    const callback = arguments[1];
    const thisArg = arguments[2];
    const args = Array.prototype.slice.call(arguments, 3);
    return diagnosticsInvoke(callback, thisArg, args);
  }
}

class BoundedChannel {
  constructor(name) {
    Object.defineProperties(this, {
      start: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(name, "start"))
      },
      end: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(name, "end"))
      }
    });
  }

  get hasSubscribers() {
    return Boolean(this.start?.hasSubscribers || this.end?.hasSubscribers);
  }

  subscribe(subscription) {
    const start = subscription.start;
    const end = subscription.end;
    if (typeof start === "function") this.start.subscribe(start);
    if (typeof end === "function") this.end.subscribe(end);
  }

  unsubscribe(subscription) {
    const start = subscription.start;
    const end = subscription.end;
    const startRemoved = typeof start === "function" ? this.start.unsubscribe(start) : false;
    const endRemoved = typeof end === "function" ? this.end.unsubscribe(end) : false;
    return startRemoved || endRemoved;
  }

  run(context, callback, thisArg, ...args) {
    this.start.publish(context);
    try {
      return diagnosticsInvoke(callback, thisArg, args);
    } finally {
      this.end.publish(context);
    }
  }

  withScope() {
    const context = arguments[0];
    const callback = arguments[1];
    const thisArg = arguments[2];
    const args = Array.prototype.slice.call(arguments, 3);
    return this.run(context, callback, thisArg, ...args);
  }
}

defineDiagnosticsChannelPrototypeOrder();

const tracingChannelInternals = new WeakMap();

class TracingChannel {
  constructor(nameOrChannels) {
    const channels = typeof nameOrChannels === "object" && nameOrChannels !== null
      ? {
          start: diagnosticsChannelFromMapEntry(nameOrChannels.start, "nameOrChannels.start"),
          end: diagnosticsChannelFromMapEntry(nameOrChannels.end, "nameOrChannels.end"),
          asyncStart: diagnosticsChannelFromMapEntry(nameOrChannels.asyncStart, "nameOrChannels.asyncStart"),
          asyncEnd: diagnosticsChannelFromMapEntry(nameOrChannels.asyncEnd, "nameOrChannels.asyncEnd"),
          error: diagnosticsChannelFromMapEntry(nameOrChannels.error, "nameOrChannels.error")
        }
      : {
          start: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(nameOrChannels, "start")),
          end: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(nameOrChannels, "end")),
          asyncStart: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(nameOrChannels, "asyncStart")),
          asyncEnd: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(nameOrChannels, "asyncEnd")),
          error: diagnosticsChannelBuiltin.channel(diagnosticsTracingName(nameOrChannels, "error"))
        };
    tracingChannelInternals.set(this, channels);
    Object.defineProperty(this, "error", {
      enumerable: false,
      configurable: false,
      writable: false,
      value: channels.error
    });
  }

  get start() {
    return tracingChannelInternals.get(this)?.start;
  }

  get end() {
    return tracingChannelInternals.get(this)?.end;
  }

  get asyncStart() {
    return tracingChannelInternals.get(this)?.asyncStart;
  }

  get asyncEnd() {
    return tracingChannelInternals.get(this)?.asyncEnd;
  }

  get hasSubscribers() {
    return Boolean(
      this.start?.hasSubscribers ||
      this.end?.hasSubscribers ||
      this.asyncStart?.hasSubscribers ||
      this.asyncEnd?.hasSubscribers ||
      this.error?.hasSubscribers
    );
  }

  subscribe(subscription) {
    const start = subscription.start;
    const end = subscription.end;
    const asyncStart = subscription.asyncStart;
    const asyncEnd = subscription.asyncEnd;
    const error = subscription.error;
    if (typeof start === "function") this.start?.subscribe(start);
    if (typeof end === "function") this.end?.subscribe(end);
    if (typeof asyncStart === "function") this.asyncStart?.subscribe(asyncStart);
    if (typeof asyncEnd === "function") this.asyncEnd?.subscribe(asyncEnd);
    if (typeof error === "function") this.error?.subscribe(error);
  }

  unsubscribe(subscription) {
    const results = [
      typeof subscription.start === "function" ? this.start?.unsubscribe(subscription.start) : false,
      typeof subscription.end === "function" ? this.end?.unsubscribe(subscription.end) : false,
      typeof subscription.asyncStart === "function" ? this.asyncStart?.unsubscribe(subscription.asyncStart) : false,
      typeof subscription.asyncEnd === "function" ? this.asyncEnd?.unsubscribe(subscription.asyncEnd) : false,
      typeof subscription.error === "function" ? this.error?.unsubscribe(subscription.error) : false
    ];
    return results.some(Boolean);
  }

  traceSync(callback, context = {}, thisArg, ...args) {
    this.start?.publish(context);
    try {
      const result = diagnosticsInvoke(callback, thisArg, args);
      context.result = result;
      return result;
    } catch (error) {
      context.error = error;
      this.error?.publish(context);
      throw error;
    } finally {
      this.end?.publish(context);
    }
  }

  tracePromise(callback, context = {}, thisArg, ...args) {
    this.start?.publish(context);
    let result;
    try {
      result = diagnosticsInvoke(callback, thisArg, args);
    } catch (error) {
      context.error = error;
      this.error?.publish(context);
      throw error;
    } finally {
      this.end?.publish(context);
    }
    return Promise.resolve(result).then(
      (value) => {
        context.result = value;
        this.asyncStart?.publish(context);
        this.asyncEnd?.publish(context);
        return value;
      },
      (error) => {
        context.error = error;
        this.error?.publish(context);
        this.asyncStart?.publish(context);
        this.asyncEnd?.publish(context);
        throw error;
      }
    );
  }

  traceCallback(callback, position = -1, context = {}, thisArg, ...args) {
    const callArgs = [...args];
    const callbackIndex = position < 0 ? callArgs.length + position : position;
    const original = callArgs[callbackIndex];
    if (typeof original === "function") {
      callArgs[callbackIndex] = (...callbackArgs) => {
        const error = callbackArgs[0] instanceof Error ? callbackArgs[0] : null;
        if (error) {
          context.error = error;
        } else {
          context.result = callbackArgs[1];
        }
        if (error) this.error?.publish(context);
        this.asyncStart?.publish(context);
        try {
          return original(...callbackArgs);
        } finally {
          this.asyncEnd?.publish(context);
        }
      };
    }
    this.start?.publish(context);
    try {
      return diagnosticsInvoke(callback, thisArg, callArgs);
    } finally {
      this.end?.publish(context);
    }
  }
}

function channel(name) {
  const key = validateDiagnosticsChannelName(name);
  if (!diagnosticsChannels.has(key)) {
    diagnosticsChannels.set(key, new Channel(key));
  }
  return diagnosticsChannels.get(key);
}

function boundedChannel(name) {
  return new BoundedChannel(name);
}

function hasSubscribers(name) {
  if (!isDiagnosticsChannelName(name)) return false;
  return diagnosticsChannelBuiltin.channel(name).hasSubscribers;
}

function subscribe(name, callback) {
  diagnosticsChannelBuiltin.channel(name).subscribe(callback);
}

function unsubscribe(name, callback) {
  return diagnosticsChannelBuiltin.channel(name).unsubscribe(callback);
}

function tracingChannel(name) {
  return new TracingChannel(name);
}

const diagnosticsChannelBuiltin = {};
Object.defineProperties(diagnosticsChannelBuiltin, {
  channel: { enumerable: true, configurable: true, writable: true, value: channel },
  hasSubscribers: { enumerable: true, configurable: true, writable: true, value: hasSubscribers },
  subscribe: { enumerable: true, configurable: true, writable: true, value: subscribe },
  tracingChannel: { enumerable: true, configurable: true, writable: true, value: tracingChannel },
  unsubscribe: { enumerable: true, configurable: true, writable: true, value: unsubscribe },
  boundedChannel: { enumerable: true, configurable: true, writable: true, value: boundedChannel },
  Channel: { enumerable: true, configurable: true, writable: true, value: Channel },
  BoundedChannel: { enumerable: true, configurable: true, writable: true, value: BoundedChannel }
});

class OpenContainersV8Serializer {
  constructor() {
    this._entries = [];
    this._transferredArrayBuffers = new Map();
  }

  writeHeader() {
    this._entries.push({ type: "header" });
  }

  writeValue(value) {
    this._entries.push({ type: "value", value: encodeV8SerializedValue(value, new Map()) });
  }

  releaseBuffer() {
    if (this._entries.length === 0) return RuntimeBuffer.from("");
    const entries = this._entries;
    this._entries = [];
    return RuntimeBuffer.from(JSON.stringify({
      __openContainersV8Serializer: 1,
      entries
    }));
  }

  transferArrayBuffer(id, arrayBuffer) {
    validateV8TransferArrayBuffer(arrayBuffer, false);
    this._transferredArrayBuffers.set(id, arrayBuffer);
  }

  writeUint32(value) {
    this._entries.push({ type: "uint32", value: Number(value) >>> 0 });
  }

  writeUint64(hi, lo) {
    this._entries.push({ type: "uint64", value: [Number(hi) >>> 0, Number(lo) >>> 0] });
  }

  writeDouble(value) {
    this._entries.push({ type: "double", value: Number(value) });
  }

  writeRawBytes(buffer) {
    validateV8RawBytes(buffer);
    this._entries.push({ type: "raw", value: RuntimeBuffer.from(buffer).toString("base64") });
  }

  _setTreatArrayBufferViewsAsHostObjects() {}

  _getDataCloneError(message) {
    return new Error(String(message));
  }
}

class OpenContainersV8Deserializer {
  constructor(buffer) {
    validateV8SerializedBuffer(buffer);
    const decoded = parseV8SerializerBuffer(buffer);
    this._entries = decoded.entries;
    this._index = 0;
    this._transferredArrayBuffers = new Map();
  }

  readHeader() {
    const entry = this._entries[this._index];
    if (entry?.type === "header") {
      this._index++;
      return true;
    }
    return false;
  }

  readValue() {
    const entry = nextV8DeserializerEntry(this, "value");
    return decodeV8SerializedValue(entry.value, []);
  }

  getWireFormatVersion() {
    return 15;
  }

  transferArrayBuffer(id, arrayBuffer) {
    validateV8TransferArrayBuffer(arrayBuffer, true);
    this._transferredArrayBuffers.set(id, arrayBuffer);
  }

  readUint32() {
    return nextV8DeserializerEntry(this, "uint32").value;
  }

  readUint64() {
    return nextV8DeserializerEntry(this, "uint64").value;
  }

  readDouble() {
    return nextV8DeserializerEntry(this, "double").value;
  }

  _readRawBytes(length) {
    return this.readRawBytes(length);
  }

  readRawBytes(length) {
    if (length !== undefined && Number(length) < 0) {
      throw new Error("ReadRawBytes() failed");
    }
    const bytes = RuntimeBuffer.from(nextV8DeserializerEntry(this, "raw").value, "base64");
    return length === undefined ? bytes : bytes.subarray(0, length);
  }
}

function nextV8DeserializerEntry(deserializer, expectedType) {
  const entry = deserializer._entries[deserializer._index++];
  if (!entry || entry.type !== expectedType) {
    throw new Error(`Unable to deserialize ${expectedType} from OpenContainers v8 buffer`);
  }
  return entry;
}

class OpenContainersV8DefaultSerializer extends OpenContainersV8Serializer {
  _writeHostObject() {
    throw new Error("Host objects cannot be serialized by OpenContainers v8 Serializer");
  }
}

class OpenContainersV8DefaultDeserializer extends OpenContainersV8Deserializer {
  _readHostObject() {
    throw new Error("Host objects cannot be deserialized by OpenContainers v8 Deserializer");
  }
}

function readRawBytes(length) {
  if (length !== undefined && Number(length) < 0) {
    throw new Error("ReadRawBytes() failed");
  }
  const bytes = RuntimeBuffer.from(nextV8DeserializerEntry(this, "raw").value, "base64");
  return length === undefined ? bytes : bytes.subarray(0, length);
}

Object.defineProperty(OpenContainersV8Serializer.prototype, "_getDataCloneError", {
  configurable: true,
  enumerable: false,
  writable: true,
  value: Error
});
Object.defineProperty(OpenContainersV8Deserializer.prototype, "readRawBytes", {
  configurable: true,
  enumerable: false,
  writable: true,
  value: readRawBytes
});

class OpenContainersV8GCProfiler {
  #started = false;
  #startTime = 0;

  start() {
    this.#started = true;
    this.#startTime = Date.now();
    return undefined;
  }

  stop() {
    const startTime = this.#started ? this.#startTime : Date.now();
    this.#started = false;
    return {
      version: 1,
      startTime,
      statistics: [],
      endTime: Date.now()
    };
  }

  [Symbol.dispose]() {
    this.stop();
  }
}

alignV8ConstructorMetadata();

function alignV8ConstructorMetadata() {
  const names = new Map([
    [OpenContainersV8Serializer, "Serializer"],
    [OpenContainersV8Deserializer, "Deserializer"],
    [OpenContainersV8DefaultSerializer, "DefaultSerializer"],
    [OpenContainersV8DefaultDeserializer, "DefaultDeserializer"],
    [OpenContainersV8GCProfiler, "GCProfiler"]
  ]);
  for (const [constructor, name] of names) {
    Object.defineProperty(constructor, "name", {
      configurable: true,
      value: name
    });
  }
  alignV8PrototypeMetadata();
}

function alignV8PrototypeMetadata() {
  reorderV8Prototype(OpenContainersV8Serializer.prototype, [
    "writeHeader",
    "writeValue",
    "releaseBuffer",
    "transferArrayBuffer",
    "writeUint32",
    "writeUint64",
    "writeDouble",
    "writeRawBytes",
    "_setTreatArrayBufferViewsAsHostObjects",
    "constructor",
    "_getDataCloneError"
  ], {
    writeHeader: { length: 0, enumerable: true },
    writeValue: { length: 0, enumerable: true },
    releaseBuffer: { length: 0, enumerable: true },
    transferArrayBuffer: { length: 0, enumerable: true },
    writeUint32: { length: 0, enumerable: true },
    writeUint64: { length: 0, enumerable: true },
    writeDouble: { length: 0, enumerable: true },
    writeRawBytes: { length: 0, enumerable: true },
    _setTreatArrayBufferViewsAsHostObjects: { length: 0, enumerable: true },
    constructor: { enumerable: false },
    _getDataCloneError: { valueName: "Error", length: 1, enumerable: true }
  });

  reorderV8Prototype(OpenContainersV8Deserializer.prototype, [
    "readHeader",
    "readValue",
    "getWireFormatVersion",
    "transferArrayBuffer",
    "readUint32",
    "readUint64",
    "readDouble",
    "_readRawBytes",
    "constructor",
    "readRawBytes"
  ], {
    readHeader: { length: 0, enumerable: true },
    readValue: { length: 0, enumerable: true },
    getWireFormatVersion: { length: 0, enumerable: true },
    transferArrayBuffer: { length: 0, enumerable: true },
    readUint32: { length: 0, enumerable: true },
    readUint64: { length: 0, enumerable: true },
    readDouble: { length: 0, enumerable: true },
    _readRawBytes: { length: 0, enumerable: true },
    constructor: { enumerable: false },
    readRawBytes: { length: 1, enumerable: true }
  });

  setV8FunctionMetadata(OpenContainersV8DefaultSerializer.prototype, "_writeHostObject", { length: 1, enumerable: false });
}

function reorderV8Prototype(prototype, names, metadata) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(prototype, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete prototype[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(prototype, name, v8FunctionDescriptor(name, descriptor, metadata[name] ?? {}));
  }
}

function setV8FunctionMetadata(target, name, metadata) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  if (!descriptor) return;
  Object.defineProperty(target, name, v8FunctionDescriptor(name, descriptor, metadata));
}

function v8FunctionDescriptor(_name, descriptor, { valueName, length, enumerable }) {
  if (typeof descriptor.value === "function") {
    if (valueName !== undefined) {
      Object.defineProperty(descriptor.value, "name", {
        configurable: true,
        value: valueName
      });
    }
    if (length !== undefined) {
      Object.defineProperty(descriptor.value, "length", {
        configurable: true,
        value: length
      });
    }
  }
  return {
    ...descriptor,
    enumerable: enumerable ?? descriptor.enumerable
  };
}

class OpenContainersV8CPUProfileHandle {
  #stopped = false;

  stop() {
    this.#stopped = true;
    return JSON.stringify({
      nodes: [
        {
          id: 1,
          hitCount: 0,
          callFrame: {
            functionName: "(root)",
            scriptId: 0,
            url: "",
            lineNumber: -1,
            columnNumber: -1
          },
          children: []
        }
      ],
      startTime: 0,
      endTime: 0,
      samples: [],
      timeDeltas: []
    });
  }

  [Symbol.dispose]() {
    if (!this.#stopped) this.stop();
  }
}

class OpenContainersV8HeapProfileHandle {
  #stopped = false;

  stop() {
    this.#stopped = true;
    return JSON.stringify({
      samples: [],
      head: {
        selfSize: 0,
        id: 1,
        callFrame: {
          scriptId: 0,
          lineNumber: -1,
          columnNumber: -1,
          functionName: "(root)",
          url: ""
        },
        children: []
      }
    });
  }

  [Symbol.dispose]() {
    if (!this.#stopped) this.stop();
  }
}

alignV8ProfileHandleMetadata();

function alignV8ProfileHandleMetadata() {
  Object.defineProperty(OpenContainersV8CPUProfileHandle, "name", {
    configurable: true,
    value: "SyncCPUProfileHandle"
  });
  Object.defineProperty(OpenContainersV8CPUProfileHandle, "length", {
    configurable: true,
    value: 1
  });
  Object.defineProperty(OpenContainersV8HeapProfileHandle, "name", {
    configurable: true,
    value: "SyncHeapProfileHandle"
  });
  Object.defineProperty(OpenContainersV8HeapProfileHandle, "length", {
    configurable: true,
    value: 0
  });
}

const OPENCONTAINERS_V8_CACHED_DATA_VERSION_TAG = createOpenContainersV8CachedDataVersionTag();

function createOpenContainersV8CachedDataVersionTag() {
  const source = [
    "opencontainers-v8-cached-data",
    OPENCONTAINERS_VERSIONS.node,
    OPENCONTAINERS_VERSIONS.v8,
    OPENCONTAINERS_VERSIONS.modules,
    OPENCONTAINERS_VERSIONS.napi,
    OPENCONTAINERS_VERSIONS.opencontainers
  ].join(":");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x4f433831;
}

const v8Builtin = {
  cachedDataVersionTag() {
    return OPENCONTAINERS_V8_CACHED_DATA_VERSION_TAG;
  },
  getHeapSnapshot,
  getHeapStatistics,
  getHeapSpaceStatistics,
  getHeapCodeStatistics,
  getCppHeapStatistics,
  setFlagsFromString,
  Serializer: OpenContainersV8Serializer,
  Deserializer: OpenContainersV8Deserializer,
  DefaultSerializer: OpenContainersV8DefaultSerializer,
  DefaultDeserializer: OpenContainersV8DefaultDeserializer,
  deserialize,
  takeCoverage() {},
  stopCoverage() {},
  serialize,
  writeHeapSnapshot,
  promiseHooks: {
    createHook,
    onInit(callback) {
      validateV8PromiseHook("initHook", callback);
      return createV8BoundPromiseHookStop();
    },
    onBefore(callback) {
      validateV8PromiseHook("beforeHook", callback);
      return createV8BoundPromiseHookStop();
    },
    onAfter(callback) {
      validateV8PromiseHook("afterHook", callback);
      return createV8BoundPromiseHookStop();
    },
    onSettled(callback) {
      validateV8PromiseHook("settledHook", callback);
      return createV8BoundPromiseHookStop();
    },
  },
  queryObjects,
  startupSnapshot: {
    addDeserializeCallback,
    addSerializeCallback,
    setDeserializeMainFunction,
    isBuildingSnapshot
  },
  setHeapSnapshotNearHeapLimit,
  GCProfiler: OpenContainersV8GCProfiler,
  isStringOneByteRepresentation,
  startCpuProfile,
  startHeapProfile
};
alignV8BuiltinMetadata();

function getHeapSnapshot(options) {
  validateV8ObjectOptions("options", options);
  throw unsupportedCoreOperation("v8", "getHeapSnapshot");
}

function getHeapStatistics() {
  return {
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
    number_of_detached_contexts: 0,
    total_global_handles_size: 0,
    used_global_handles_size: 0,
    external_memory: 0,
    total_allocated_bytes: 8 * 1024 * 1024
  };
}

function getHeapSpaceStatistics() {
  return [
    "read_only_space",
    "old_space",
    "code_space",
    "map_space",
    "large_object_space",
    "code_large_object_space",
    "new_large_object_space",
    "new_space"
  ].map((spaceName) => ({
    space_name: spaceName,
    space_size: 0,
    space_used_size: 0,
    space_available_size: 0,
    physical_space_size: 0
  }));
}

function getHeapCodeStatistics() {
  return {
    code_and_metadata_size: 0,
    bytecode_and_metadata_size: 0,
    external_script_source_size: 0,
    cpu_profiler_metadata_size: 0
  };
}

function getCppHeapStatistics() {
  const statistics = Object.create(null);
  statistics.committed_size_bytes = 0;
  statistics.resident_size_bytes = 0;
  statistics.used_size_bytes = 0;
  statistics.space_statistics = [
    "NormalPageSpace0",
    "NormalPageSpace1",
    "NormalPageSpace2",
    "NormalPageSpace3",
    "LargePageSpace"
  ].map(createCppHeapSpaceStatistics);
  statistics.type_names = ["OpenContainers / VirtualRuntime"];
  statistics.detail_level = "detailed";
  return statistics;
}

function createCppHeapSpaceStatistics(name) {
  const statistics = Object.create(null);
  statistics.name = name;
  statistics.committed_size_bytes = 0;
  statistics.resident_size_bytes = 0;
  statistics.used_size_bytes = 0;
  statistics.page_stats = [];
  statistics.free_list_stats = createCppHeapFreeListStatistics(name === "LargePageSpace" ? 0 : 17);
  return statistics;
}

function createCppHeapFreeListStatistics(length) {
  const statistics = Object.create(null);
  statistics.bucket_size = Array.from({ length }, () => 0);
  statistics.free_count = Array.from({ length }, () => 0);
  statistics.free_size = Array.from({ length }, () => 0);
  return statistics;
}

function setFlagsFromString(flags) {
  if (typeof flags !== "string") throw createInvalidArgTypeError("flags", "string", flags);
}

function deserialize(buffer) {
  validateV8SerializedBuffer(buffer);
  try {
    return decodeV8SerializedValue(JSON.parse(RuntimeBuffer.from(buffer).toString("utf8")), []);
  } catch {
    throw createV8DeserializeError();
  }
}

function serialize(value) {
  return RuntimeBuffer.from(JSON.stringify(encodeV8SerializedValue(value, new Map())));
}

function writeHeapSnapshot(filename, options) {
  validateV8HeapSnapshotPath(filename);
  validateV8ObjectOptions("options", options);
  throw unsupportedCoreOperation("v8", "writeHeapSnapshot");
}

function queryObjects(constructor) {
  if (typeof constructor !== "function") {
    throw createInvalidArgTypeError("constructor", "function", constructor);
  }
  return 0;
}

function setHeapSnapshotNearHeapLimit(limit) {
  if (typeof limit !== "number") {
    throw createInvalidArgTypeError("limit", "number", limit);
  }
  validateV8HeapSnapshotNearHeapLimit(limit);
  throw unsupportedCoreOperation("v8", "setHeapSnapshotNearHeapLimit");
}

function validateV8HeapSnapshotNearHeapLimit(limit) {
  if (!Number.isInteger(limit)) {
    throw Object.assign(
      new RangeError(`The value of "limit" is out of range. It must be an integer. Received ${limit}`),
      { code: "ERR_OUT_OF_RANGE" }
    );
  }
  if (limit < 1 || limit > 4294967295) {
    throw Object.assign(
      new RangeError(`The value of "limit" is out of range. It must be >= 1 && <= 4294967295. Received ${limit}`),
      { code: "ERR_OUT_OF_RANGE" }
    );
  }
}

function isStringOneByteRepresentation(value) {
  if (typeof value !== "string") {
    throw createInvalidArgTypeError("content", "string", value);
  }
  return /^[\u0000-\u00ff]*$/.test(String(value));
}

function startCpuProfile(options) {
  if (options !== undefined && (options === null || typeof options !== "object")) {
    throw createInvalidArgTypeError("options", "object", options);
  }
  return new OpenContainersV8CPUProfileHandle();
}

function startHeapProfile(options) {
  if (options !== undefined && (options === null || typeof options !== "object")) {
    throw createInvalidArgTypeError("options", "object", options);
  }
  return new OpenContainersV8HeapProfileHandle();
}

function createHook(hooks = {}) {
  const { init, before, after, settled } = hooks;
  validateV8PromiseHook("initHook", init);
  validateV8PromiseHook("beforeHook", before);
  validateV8PromiseHook("afterHook", after);
  validateV8PromiseHook("settledHook", settled);
  return createV8PromiseHookStop();
}

function addDeserializeCallback(callback, data) {
  throw createNotBuildingSnapshotError();
}

function addSerializeCallback(callback, data) {
  throw createNotBuildingSnapshotError();
}

function setDeserializeMainFunction(callback, data) {
  throw createNotBuildingSnapshotError();
}

function isBuildingSnapshot() {
  return false;
}

function validateV8PromiseHook(name, callback) {
  if (callback !== undefined && typeof callback !== "function") {
    throw createInvalidArgTypeError(name, "function", callback);
  }
}

function validateV8SerializedBuffer(buffer) {
  if (!ArrayBuffer.isView(buffer)) {
    throw createInvalidArgTypeError("buffer", "a TypedArray or a DataView", buffer);
  }
}

function validateV8RawBytes(source) {
  if (!ArrayBuffer.isView(source)) {
    throw createInvalidArgTypeError("source", "a TypedArray or a DataView", source);
  }
}

function validateV8TransferArrayBuffer(arrayBuffer, allowShared) {
  const sharedOk = allowShared && typeof SharedArrayBuffer === "function" && arrayBuffer instanceof SharedArrayBuffer;
  if (!(arrayBuffer instanceof ArrayBuffer) && !sharedOk) {
    throw createInvalidArgTypeError("arrayBuffer", allowShared ? "ArrayBuffer or SharedArrayBuffer" : "ArrayBuffer", arrayBuffer);
  }
}

function validateV8ObjectOptions(name, options) {
  if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) {
    throw createInvalidArgTypeError(name, "object", options);
  }
}

function validateV8HeapSnapshotPath(filename) {
  if (filename === undefined || typeof filename === "string" || filename instanceof URL) return;
  if (ArrayBuffer.isView(filename) && !hasDataViewBrand(filename)) return;
  throw createInvalidArgTypeError("path", "string or an instance of Buffer or URL", filename);
}

function createV8DeserializeError() {
  return new Error("Unable to deserialize cloned data due to invalid or unsupported version.");
}

function createV8PromiseHookStop() {
  return function() {};
}

function createV8BoundPromiseHookStop() {
  function stop() {}
  return stop.bind(undefined);
}

function alignV8BuiltinMetadata() {
  for (const name of ["onInit", "onBefore", "onAfter", "onSettled"]) {
    setV8FunctionMetadata(v8Builtin.promiseHooks, name, {
      valueName: "",
      length: 1
    });
  }
}

function createInspectorBuiltin({ globals }) {
  const remoteObjects = new Map();
  const profilerState = {
    started: false,
    startTime: 0
  };
  let nextObjectId = 1;

  function inspectorOpen() {
    throw unsupportedCoreOperation("inspector", "open");
  }

  const _debugEnd = {
    _debugEnd() {}
  }._debugEnd;

  const url = {
    url() {
      return undefined;
    }
  }.url;

  function inspectorWaitForDebugger() {
    throw unsupportedCoreOperation("inspector", "waitForDebugger");
  }

  class Session extends eventsBuiltin {
    #connected = false;

    constructor() {
      super();
    }

    connect() {
      if (this.#connected) {
        throw Object.assign(new Error("The inspector session is already connected"), {
          code: "ERR_INSPECTOR_ALREADY_CONNECTED"
        });
      }
      this.#connected = true;
    }

    connectToMainThread() {
      throw Object.assign(new Error("Current thread is not a worker"), {
        code: "ERR_INSPECTOR_NOT_WORKER"
      });
    }

    post(method, paramsOrCallback, maybeCallback) {
      if (typeof method !== "string") {
        throw createInvalidArgTypeError("method", "string", method);
      }
      const callback = typeof paramsOrCallback === "function" ? paramsOrCallback : maybeCallback;
      validateInspectorCallback(callback);
      const params = typeof paramsOrCallback === "function" ? undefined : paramsOrCallback;
      if (params !== undefined && params !== null && typeof params !== "object") {
        throw createInvalidArgTypeError("params", "object", params);
      }
      if (!this.#connected) {
        throw Object.assign(new Error("Session is not connected"), {
          code: "ERR_INSPECTOR_NOT_CONNECTED"
        });
      }

      try {
        const result = handleInspectorCommand(method, params, {
          globals,
          profilerState,
          remoteObjects,
          nextObjectIdRef: () => nextObjectId++
        });
        if (isPromiseLike(result)) {
          result.then(
            (resolved) => callback?.(null, resolved),
            (error) => callback?.(error)
          );
          return;
        }
        callback?.(null, result);
      } catch (error) {
        callback?.(error);
      }
    }

    disconnect() {
      this.#connected = false;
    }
  }

  Object.defineProperty(inspectorOpen, "length", { configurable: true, value: 3 });

  const inspector = {
    open: inspectorOpen,
    close: _debugEnd,
    url,
    waitForDebugger: inspectorWaitForDebugger,
    console: createInspectorConsoleNamespace(),
    Session,
    Network: createNoopMethodMap([
      "requestWillBeSent",
      "responseReceived",
      "loadingFinished",
      "loadingFailed",
      "dataSent",
      "dataReceived",
      "webSocketCreated",
      "webSocketClosed",
      "webSocketHandshakeResponseReceived"
    ], { length: 1 }),
    NetworkResources: createNoopMethodMap([
      ["put", 2, { constructable: true }]
    ]),
    DOMStorage: createNoopMethodMap([
      "domStorageItemAdded",
      "domStorageItemRemoved",
      "domStorageItemUpdated",
      "domStorageItemsCleared",
      "registerStorage"
    ], { length: 1 })
  };
  return inspector;
}

function validateInspectorCallback(callback) {
  if (callback && typeof callback !== "function") {
    throw createInvalidArgTypeError("callback", "function", callback);
  }
}

function createInspectorPromisesBuiltin({ globals }) {
  const callbackInspector = createInspectorBuiltin({ globals });
  const { Session: CallbackSession } = callbackInspector;
  class Session extends CallbackSession {}

  function post(method, params, callback) {
    return new Promise((resolve, reject) => {
      try {
        validateInspectorCallback(callback);
      } catch (error) {
        reject(error);
        return;
      }
      if (typeof params === "function") {
        reject(createInvalidArgTypeError("params", "object", params));
        return;
      }
      try {
        CallbackSession.prototype.post.call(this, method, params, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  Object.defineProperty(Session.prototype, "post", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: post
  });
  return {
    open: callbackInspector.open,
    close: callbackInspector.close,
    url: callbackInspector.url,
    waitForDebugger: callbackInspector.waitForDebugger,
    console: callbackInspector.console,
    Session,
    Network: callbackInspector.Network,
    NetworkResources: callbackInspector.NetworkResources,
    DOMStorage: callbackInspector.DOMStorage
  };
}

function createHttpAgentBuiltin(http) {
  return {
    Agent: http.Agent,
    globalAgent: http.globalAgent
  };
}

function createHttpClientBuiltin(http) {
  return {
    ClientRequest: http.ClientRequest
  };
}

function createHttpIncomingBuiltin(http) {
  return withOwnFunctionPrototypes({
    IncomingMessage: http.IncomingMessage,
    readStart(socket) {
      socket?.resume?.();
    },
    readStop(socket) {
      socket?.pause?.();
    }
  }, ["readStart", "readStop"]);
}

class InternalHTTPParser {
  constructor(type) {
    this.type = type;
  }

  initialize(...args) {
    const [type] = args;
    this.type = type;
  }

  execute(...args) {
    const [buffer] = args;
    return buffer?.byteLength ?? buffer?.length ?? 0;
  }

  finish() {
    return 0;
  }

  close() {}
  free() {}
  pause() {}
  resume() {}
  consume() {}
  unconsume() {}
  remove() {}

  getCurrentBuffer() {
    return RuntimeBuffer.alloc(0);
  }
}

Object.defineProperty(InternalHTTPParser, "name", { configurable: true, value: "HTTPParser" });
Object.defineProperty(InternalHTTPParser, "length", { configurable: true, value: 0 });
const HTTP_PARSER_PROTOTYPE_METHODS = ["close", "free", "remove", "execute", "finish", "initialize", "pause", "resume", "consume", "unconsume", "getCurrentBuffer"];
const httpParserConstructorDescriptor = Object.getOwnPropertyDescriptor(InternalHTTPParser.prototype, "constructor");
const httpParserPrototypeDescriptors = [];
for (const name of HTTP_PARSER_PROTOTYPE_METHODS) {
  const descriptor = Object.getOwnPropertyDescriptor(InternalHTTPParser.prototype, name);
  if (descriptor) httpParserPrototypeDescriptors.push([name, { ...descriptor, enumerable: true }]);
}
if (httpParserConstructorDescriptor) delete InternalHTTPParser.prototype.constructor;
for (const [name] of httpParserPrototypeDescriptors) delete InternalHTTPParser.prototype[name];
for (const [name, descriptor] of httpParserPrototypeDescriptors) Object.defineProperty(InternalHTTPParser.prototype, name, descriptor);
if (httpParserConstructorDescriptor) Object.defineProperty(InternalHTTPParser.prototype, "constructor", httpParserConstructorDescriptor);

Object.assign(InternalHTTPParser, {
  REQUEST: 1,
  RESPONSE: 2,
  kOnMessageBegin: 0,
  kOnHeaders: 1,
  kOnHeadersComplete: 2,
  kOnBody: 3,
  kOnMessageComplete: 4,
  kOnExecute: 5,
  kOnTimeout: 6,
  kLenientNone: 0,
  kLenientHeaders: 1,
  kLenientChunkedLength: 2,
  kLenientKeepAlive: 4,
  kLenientTransferEncoding: 8,
  kLenientVersion: 16,
  kLenientDataAfterClose: 32,
  kLenientOptionalLFAfterCR: 64,
  kLenientOptionalCRLFAfterChunk: 128,
  kLenientOptionalCRBeforeLF: 256,
  kLenientSpacesAfterChunkSize: 512,
  kLenientHeaderValueRelaxed: 1024,
  kLenientAll: 2047
});

function createHttpCommonBuiltin(http) {
  const parsers = {
    name: "parsers",
    alloc() {
      return new InternalHTTPParser(InternalHTTPParser.REQUEST);
    },
    free() {}
  };
  return withOwnFunctionPrototypes({
    _checkInvalidHeaderChar: checkInvalidHeaderChar,
    _checkIsHttpToken: checkIsHttpToken,
    chunkExpression: /(?:^|\W)chunked(?:$|\W)/i,
    continueExpression: /(?:^|\W)100-continue(?:$|\W)/i,
    CRLF: "\r\n",
    freeParser(parser, _requests, _socket) {
      parser?.free?.();
    },
    methods: http.METHODS,
    parsers,
    kIncomingMessage: Symbol("IncomingMessage"),
    HTTPParser: InternalHTTPParser,
    isLenient: () => false,
    calculateLenientFlags(_insecureHTTPParser, _options) {
      return 0;
    },
    prepareError(error, _parser, _rawPacket) {
      return error;
    },
    kSkipPendingData: Symbol("SkipPendingData")
  }, ["freeParser", "isLenient", "calculateLenientFlags", "prepareError"]);
}

function createHttpOutgoingBuiltin(http) {
  return withOwnFunctionPrototypes({
    kHighWaterMark: Symbol("kHighWaterMark"),
    kUniqueHeaders: Symbol("kUniqueHeaders"),
    parseUniqueHeadersOption(value) {
      return Array.isArray(value) ? new Set(value.map((entry) => String(entry).toLowerCase())) : null;
    },
    validateHeaderName: http.validateHeaderName,
    validateHeaderValue: http.validateHeaderValue,
    OutgoingMessage: http.OutgoingMessage
  }, ["parseUniqueHeadersOption"]);
}

function createHttpServerBuiltin(http) {
  return withOwnFunctionPrototypes({
    STATUS_CODES: http.STATUS_CODES,
    Server: http.Server,
    ServerResponse: http.ServerResponse,
    setupConnectionsTracking() {},
    storeHTTPOptions(options) {
      return options;
    },
    _connectionListener: http._connectionListener,
    kServerResponse: Symbol("ServerResponse"),
    httpServerPreClose(server) {
      server?.closeIdleConnections?.();
    },
    kConnectionsCheckingInterval: Symbol("http.server.connectionsCheckingInterval")
  }, ["setupConnectionsTracking", "storeHTTPOptions", "httpServerPreClose"]);
}

function checkIsHttpToken(value) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(String(value));
}

function checkInvalidHeaderChar(value) {
  return /[\u0000-\u0008\u000a-\u001f\u007f]/.test(String(value));
}

function createTlsCommonBuiltin(tls) {
  return withOwnFunctionPrototypes({
    SecureContext: tls.SecureContext,
    createSecureContext: tls.createSecureContext,
    translatePeerCertificate(cert) {
      return cert ?? {};
    }
  }, ["translatePeerCertificate"]);
}

function createTlsWrapBuiltin(tls) {
  return {
    TLSSocket: tls.TLSSocket,
    Server: tls.Server,
    createServer: tls.createServer,
    connect: tls.connect
  };
}

function withOwnFunctionPrototypes(namespace, names) {
  for (const name of names) defineOwnFunctionPrototype(namespace[name]);
  return namespace;
}

function defineOwnFunctionPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    configurable: false,
    enumerable: false,
    writable: true,
    value: prototype
  });
}

function createNoopMethodMap(entries, defaults = {}) {
  return Object.fromEntries(entries.map((entry) => {
    const [name, length, options] = Array.isArray(entry)
      ? entry
      : [entry, defaults.length ?? 0, defaults];
    return [name, createNoopMethod(name, {
      ...defaults,
      ...options,
      length: length ?? options?.length ?? defaults.length ?? 0
    })];
  }));
}

function createNoopMethod(name, { length = 0, constructable = false } = {}) {
  const method = constructable ? function noopMethod() {} : () => {};
  Object.defineProperty(method, "name", {
    configurable: true,
    value: name
  });
  Object.defineProperty(method, "length", {
    configurable: true,
    value: length
  });
  return method;
}

function createInspectorConsoleNamespace() {
  const namespace = createNoopMethodMap([
    "debug",
    "error",
    "info",
    "log",
    "warn",
    "dir",
    "dirxml",
    "table",
    "trace",
    "group",
    "groupCollapsed",
    "groupEnd",
    "clear",
    "count",
    "countReset",
    "assert",
    "profile",
    "profileEnd",
    "time",
    "timeLog",
    "timeEnd",
    "timeStamp",
    ["context", 1]
  ]);
  Object.defineProperty(namespace, Symbol.toStringTag, {
    configurable: true,
    enumerable: false,
    value: "console",
    writable: false
  });
  return namespace;
}

function handleInspectorCommand(method, params, state) {
  switch (method) {
    case "Runtime.enable":
    case "Runtime.disable":
    case "Debugger.disable":
    case "Profiler.enable":
    case "Profiler.disable":
    case "HeapProfiler.enable":
    case "HeapProfiler.disable":
    case "Console.enable":
    case "Console.disable":
    case "Log.enable":
    case "Log.disable":
      return {};
    case "Debugger.enable":
      return { debuggerId: "opencontainers" };
    case "Profiler.start":
      state.profilerState.started = true;
      state.profilerState.startTime = currentInspectorTimestamp();
      return {};
    case "Profiler.stop":
      return { profile: createInspectorCpuProfile(state.profilerState) };
    case "Schema.getDomains":
      return {
        domains: [
          { name: "Runtime", version: "1.3" },
          { name: "Debugger", version: "1.3" },
          { name: "Profiler", version: "1.3" },
          { name: "HeapProfiler", version: "1.3" },
          { name: "Console", version: "1.2" },
          { name: "Log", version: "1.2" }
        ]
      };
    case "Runtime.getIsolateId":
      return { id: "opencontainers" };
    case "Runtime.evaluate":
      return evaluateInspectorRuntimeExpression(params, state);
    case "Runtime.getProperties":
      return getInspectorRuntimeProperties(params, state);
    case "Runtime.releaseObject":
      releaseInspectorRuntimeObject(params, state);
      return {};
    case "Runtime.releaseObjectGroup":
      validateInspectorObjectGroupParams(params);
      for (const [objectId, entry] of state.remoteObjects) {
        if (entry.objectGroup === params.objectGroup) state.remoteObjects.delete(objectId);
      }
      return {};
    default:
      throw createInspectorCommandError(method);
  }
}

function currentInspectorTimestamp() {
  return Math.trunc((globalThis.performance?.now?.() ?? Date.now()) * 1000);
}

function createInspectorCpuProfile(profilerState) {
  const startTime = profilerState.started ? profilerState.startTime : currentInspectorTimestamp();
  const endTime = currentInspectorTimestamp();
  profilerState.started = false;
  return {
    nodes: [
      {
        id: 1,
        callFrame: {
          functionName: "(root)",
          scriptId: "0",
          url: "",
          lineNumber: -1,
          columnNumber: -1
        },
        hitCount: 0,
        children: []
      }
    ],
    startTime,
    endTime: Math.max(startTime, endTime),
    samples: [],
    timeDeltas: []
  };
}

function evaluateInspectorRuntimeExpression(params, state) {
  if (!isInspectorParamsObject(params) || typeof params.expression !== "string") {
    throw createInspectorInvalidParamsError();
  }
  if (params.returnByValue !== undefined && typeof params.returnByValue !== "boolean") {
    throw createInspectorInvalidParamsError();
  }
  if (params.awaitPromise !== undefined && typeof params.awaitPromise !== "boolean") {
    throw createInspectorInvalidParamsError();
  }
  if (params.objectGroup !== undefined && typeof params.objectGroup !== "string") {
    throw createInspectorInvalidParamsError();
  }
  try {
    const source = params.expression;
    const evaluator = state.globals.Function(`return eval(${JSON.stringify(source)});`);
    const value = evaluator.call(state.globals);
    if (params.awaitPromise && isPromiseLike(value)) {
      return Promise.resolve(value).then((resolved) => ({
        result: createInspectorRemoteObject(resolved, params, state)
      }), (error) => createInspectorExceptionResult(error, params, state));
    }
    return { result: createInspectorRemoteObject(value, params, state) };
  } catch (error) {
    return createInspectorExceptionResult(error, params, state);
  }
}

function getInspectorRuntimeProperties(params, state) {
  if (!isInspectorObjectIdParams(params)) {
    throw createInspectorInvalidParamsError();
  }
  const entry = state.remoteObjects.get(params.objectId);
  if (!entry) throw createInspectorInvalidRemoteObjectIdError();
  const ownProperties = Object.getOwnPropertyNames(entry.value)
    .map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(entry.value, name);
      return {
        name,
        configurable: Boolean(descriptor?.configurable),
        enumerable: Boolean(descriptor?.enumerable),
        writable: Boolean(descriptor && "writable" in descriptor ? descriptor.writable : false),
        value: descriptor && "value" in descriptor
          ? createInspectorRemoteObject(descriptor.value, params, state)
          : undefined,
        get: typeof descriptor?.get === "function" ? createInspectorRemoteObject(descriptor.get, params, state) : undefined,
        set: typeof descriptor?.set === "function" ? createInspectorRemoteObject(descriptor.set, params, state) : undefined
      };
    });
  return { result: ownProperties, internalProperties: [] };
}

function releaseInspectorRuntimeObject(params, state) {
  if (!isInspectorObjectIdParams(params)) {
    throw createInspectorInvalidParamsError();
  }
  if (!state.remoteObjects.has(params.objectId)) {
    throw createInspectorInvalidRemoteObjectIdError();
  }
  state.remoteObjects.delete(params.objectId);
}

function validateInspectorObjectGroupParams(params) {
  if (!isInspectorParamsObject(params) || typeof params.objectGroup !== "string") {
    throw createInspectorInvalidParamsError();
  }
}

function isInspectorObjectIdParams(params) {
  return isInspectorParamsObject(params) && typeof params.objectId === "string";
}

function isInspectorParamsObject(params) {
  return params !== null && typeof params === "object" && !Array.isArray(params);
}

function createInspectorRemoteObject(value, params, state) {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "object", subtype: "null", value: null };
  if (typeof value === "boolean" || typeof value === "string") {
    return { type: typeof value, value, description: String(value) };
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { type: "number", unserializableValue: "NaN", description: "NaN" };
    if (value === Infinity) return { type: "number", unserializableValue: "Infinity", description: "Infinity" };
    if (value === -Infinity) return { type: "number", unserializableValue: "-Infinity", description: "-Infinity" };
    if (Object.is(value, -0)) return { type: "number", unserializableValue: "-0", description: "0" };
    return { type: "number", value, description: String(value) };
  }
  if (typeof value === "bigint") {
    return { type: "bigint", unserializableValue: `${value}n`, description: String(value) };
  }
  if (typeof value === "symbol") {
    return { type: "symbol", description: String(value), objectId: storeInspectorRemoteObject(value, params, state) };
  }
  if (typeof value === "function") {
    return {
      type: "function",
      className: "Function",
      description: value.name ? `function ${value.name}()` : "function()",
      objectId: storeInspectorRemoteObject(value, params, state)
    };
  }
  if (params.returnByValue) {
    try {
      return { type: "object", value: cloneInspectorValue(value) };
    } catch {
      // Fall through to a remote object when the value is not structured-cloneable.
    }
  }
  const subtype = value instanceof Error
    ? "error"
    : Array.isArray(value)
      ? "array"
      : value instanceof Date
        ? "date"
        : undefined;
  const className = value?.constructor?.name || (Array.isArray(value) ? "Array" : "Object");
  return {
    type: "object",
    ...(subtype ? { subtype } : {}),
    className,
    description: describeInspectorObject(value, subtype, className),
    objectId: storeInspectorRemoteObject(value, params, state)
  };
}

function createInspectorExceptionResult(error, params, state) {
  const remote = createInspectorRemoteObject(error, params, state);
  return {
    result: remote,
    exceptionDetails: {
      exceptionId: 1,
      text: "Uncaught",
      lineNumber: 0,
      columnNumber: 0,
      exception: remote
    }
  };
}

function cloneInspectorValue(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function describeInspectorObject(value, subtype, className) {
  if (subtype === "error") return String(value.stack ?? value.message ?? value);
  if (subtype === "array") return `Array(${value.length})`;
  if (subtype === "date") return value.toISOString();
  return className;
}

function storeInspectorRemoteObject(value, params, state) {
  const objectId = `opencontainers:${state.nextObjectIdRef()}`;
  state.remoteObjects.set(objectId, {
    value,
    objectGroup: params.objectGroup
  });
  return objectId;
}

function createInspectorCommandError(method) {
  return createInspectorProtocolError(-32601, `'${method}' wasn't found`);
}

function createInspectorInvalidParamsError() {
  return createInspectorProtocolError(-32602, "Invalid parameters");
}

function createInspectorInvalidRemoteObjectIdError() {
  return createInspectorProtocolError(-32000, "Invalid remote object id");
}

function createInspectorProtocolError(protocolCode, message) {
  return Object.assign(new Error(`Inspector error ${protocolCode}: ${message}`), {
    code: "ERR_INSPECTOR_COMMAND"
  });
}

async function openContainersTest(nameOrOptionsOrFn, optionsOrFn, maybeFn) {
  const { name, options, fn } = normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn);
  const context = createTestContext(name);
  if (options.skip) {
    context.skip(options.skip);
    return context;
  }
  if (options.todo) {
    context.todo(options.todo);
    return context;
  }
  if (typeof fn !== "function") return context;
  return fn(context);
}

function normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn) {
  if (typeof nameOrOptionsOrFn === "string") {
    if (typeof optionsOrFn === "function") {
      return { name: nameOrOptionsOrFn, options: {}, fn: optionsOrFn };
    }
    return {
      name: nameOrOptionsOrFn,
      options: optionsOrFn && typeof optionsOrFn === "object" ? optionsOrFn : {},
      fn: maybeFn
    };
  }
  if (typeof nameOrOptionsOrFn === "function") {
    return { name: "", options: {}, fn: nameOrOptionsOrFn };
  }
  if (nameOrOptionsOrFn && typeof nameOrOptionsOrFn === "object") {
    return {
      name: "",
      options: nameOrOptionsOrFn,
      fn: typeof optionsOrFn === "function" ? optionsOrFn : maybeFn
    };
  }
  return { name: "", options: {}, fn: maybeFn };
}

function createTestContext(name, testRunner = openContainersTest) {
  const context = {
    name,
    signal: new AbortController().signal,
    assert: createTestContextAssert(),
    skipped: false,
    todoMessage: false,
    diagnostic() {},
    plan() {},
    skip(message = true) {
      context.skipped = message;
    },
    todo(message = true) {
      context.todoMessage = message;
    },
    test: testRunner
  };
  return context;
}

const TEST_CONTEXT_ASSERT_ORDER = [
  "deepEqual",
  "deepStrictEqual",
  "doesNotMatch",
  "doesNotReject",
  "doesNotThrow",
  "equal",
  "fail",
  "ifError",
  "match",
  "notDeepEqual",
  "notDeepStrictEqual",
  "notEqual",
  "notStrictEqual",
  "partialDeepStrictEqual",
  "rejects",
  "strictEqual",
  "throws",
  "snapshot",
  "fileSnapshot",
  "ok"
];

function createTestContextAssert() {
  const testAssert = Object.create(null);
  for (const name of TEST_CONTEXT_ASSERT_ORDER) {
    const value = createTestContextAssertFunction(name);
    Object.defineProperty(testAssert, name, {
      enumerable: true,
      configurable: true,
      writable: true,
      value
    });
  }
  return testAssert;
}

function createTestContextAssertFunction(name) {
  if (name === "ok") return ok;
  if (name === "snapshot") return createNamedTestAssertFunction(() => {
    throw createTestSnapshotInvalidStateError("Invalid snapshot filename.");
  });
  if (name === "fileSnapshot") return createNamedTestAssertFunction((value, filename) => {
    if (typeof filename !== "string") throw createInvalidArgTypeError("path", "string", filename);
    const snapshotPath = filename === undefined ? "undefined" : String(filename);
    throw createTestSnapshotInvalidStateError(`Cannot read snapshot file '${snapshotPath}.' Missing snapshots can be generated by rerunning the command with the --test-update-snapshots flag.`);
  });
  return createNamedTestAssertFunction((...args) => assert[name](...args));
}

function createNamedTestAssertFunction(implementation) {
  const fn = (...args) => implementation(...args);
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: ""
  });
  return fn;
}

function createTestSnapshotInvalidStateError(message) {
  const error = new Error(`Invalid state: ${message}`);
  error.code = "ERR_INVALID_STATE";
  return error;
}

function createSkippedTest(nameOrOptionsOrFn, optionsOrFn, maybeFn) {
  const { name, options } = normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn);
  const context = createTestContext(name);
  context.skip(options.skip ?? true);
  return Promise.resolve(context);
}

function createTodoTest(nameOrOptionsOrFn, optionsOrFn, maybeFn) {
  const { name, options } = normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn);
  const context = createTestContext(name);
  context.todo(options.todo ?? true);
  return Promise.resolve(context);
}

class TestsStream extends streamBuiltin.Readable {
  constructor(options = {}) {
    super({
      highWaterMark: Number.MAX_SAFE_INTEGER,
      objectMode: true,
      ...(options ?? {})
    });
  }

  _read() {}

  fail(nesting, location, testNumber, name, duration, error, directive, details, line) {
    this.enqueue("test:fail", { nesting, location, testNumber, name, duration, error, directive, details, line });
  }

  ok(nesting, location, testNumber, name, duration, error, directive, details, line) {
    this.enqueue("test:pass", { nesting, location, testNumber, name, duration, error, directive, details, line });
  }

  complete(nesting, location, testNumber, name, duration, error, directive, details, line) {
    this.enqueue("test:complete", { nesting, location, testNumber, name, duration, error, directive, details, line });
  }

  plan(nesting, count, line) {
    this.enqueue("test:plan", { nesting, count, line });
  }

  getSkip() {
    return undefined;
  }

  getTodo() {
    return undefined;
  }

  getXFail() {
    return undefined;
  }

  enqueue(type, data, nesting, location, testNumber, details, line) {
    const event = { type, data: data ?? {}, nesting, location, testNumber, details, line };
    this.emit(type, event.data);
    this.push(event);
  }

  dequeue(type, data, nesting, location, testNumber, details, line) {
    this.enqueue(type, data, nesting, location, testNumber, details, line);
  }

  start(nesting, location, testNumber, name, details, line) {
    this.enqueue("test:start", { nesting, location, testNumber, name, details, line });
  }

  diagnostic(nesting, message, line) {
    this.enqueue("test:diagnostic", { nesting, message, line });
  }

  coverage(nesting, summary, line) {
    this.enqueue("test:coverage", { nesting, summary, line });
  }

  summary(nesting, counts, duration, success, line) {
    this.enqueue("test:summary", { nesting, counts, duration, success, line });
  }

  interrupted(reason) {
    this.enqueue("test:interrupted", { reason });
  }

  end() {
    this.push(null);
  }
}

function createTestRunResult() {
  return new TestsStream();
}

function testReporterEventType(event) {
  return String(event?.type ?? "");
}

function testReporterEventData(event) {
  return event?.data && typeof event.data === "object" ? event.data : {};
}

function testReporterName(event) {
  const data = testReporterEventData(event);
  return String(data.name ?? event?.name ?? "unnamed");
}

function testReporterMessage(event) {
  const data = testReporterEventData(event);
  const error = data.error ?? event?.error;
  return String(data.message ?? error?.message ?? event?.message ?? "");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function* tapReporter(source) {
  let count = 0;
  yield "TAP version 13\n";
  for await (const event of source ?? []) {
    const type = testReporterEventType(event);
    if (type === "test:pass" || type === "test:fail" || type === "test:skip" || type === "test:todo") {
      count += 1;
      const directive = type === "test:skip"
        ? " # SKIP"
        : type === "test:todo"
          ? " # TODO"
          : "";
      yield `${type === "test:fail" ? "not ok" : "ok"} ${count} - ${testReporterName(event)}${directive}\n`;
    } else if (type === "test:diagnostic") {
      yield `# ${testReporterMessage(event)}\n`;
    } else if (type === "test:stderr" || type === "test:stdout") {
      yield testReporterMessage(event);
    }
  }
  if (count) yield `1..${count}\n`;
}

async function* dot(source) {
  for await (const event of source ?? []) {
    const type = testReporterEventType(event);
    if (type === "test:pass") yield ".";
    else if (type === "test:fail") yield "X";
    else if (type === "test:skip") yield ",";
    else if (type === "test:todo") yield "T";
  }
  yield "\n";
}

async function* junitReporter(source) {
  const cases = [];
  let failures = 0;
  for await (const event of source ?? []) {
    const type = testReporterEventType(event);
    if (type !== "test:pass" && type !== "test:fail" && type !== "test:skip" && type !== "test:todo") continue;
    if (type === "test:fail") failures += 1;
    cases.push({ type, name: testReporterName(event), message: testReporterMessage(event) });
  }
  yield `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite tests="${cases.length}" failures="${failures}">\n`;
  for (const entry of cases) {
    yield `  <testcase name="${escapeXml(entry.name)}">`;
    if (entry.type === "test:fail") yield `<failure message="${escapeXml(entry.message)}" />`;
    else if (entry.type === "test:skip" || entry.type === "test:todo") yield "<skipped />";
    yield "</testcase>\n";
  }
  yield "</testsuite>\n";
}

const REPORTER_ASYNC_QUEUE = Symbol("opencontainers.reporter.asyncQueue");
const REPORTER_ASYNC_WAITERS = Symbol("opencontainers.reporter.asyncWaiters");
const REPORTER_ASYNC_DONE = Symbol("opencontainers.reporter.asyncDone");
const REPORTER_ASYNC_ERROR = Symbol("opencontainers.reporter.asyncError");
const REPORTER_FORMAT_EVENT = Symbol("opencontainers.reporter.formatEvent");
const REPORTER_FLUSH = Symbol("opencontainers.reporter.flush");

class ReporterTransform extends streamBuiltin.Transform {
  [Symbol.asyncIterator]() {
    return createReporterAsyncIterator(this);
  }
}

class SpecReporter extends ReporterTransform {
  _transform(event, _encoding, callback) {
    reporterTransformEvent(this, event, callback);
  }

  _flush(callback) {
    reporterFlush(this, callback);
  }
}

class LcovReporter extends ReporterTransform {
  constructor(options) {
    super(options);
  }

  _transform(event, _encoding, callback) {
    reporterTransformEvent(this, event, callback);
  }
}

function initializeReporterTransform(transform) {
  transform[REPORTER_ASYNC_QUEUE] = [];
  transform[REPORTER_ASYNC_WAITERS] = [];
  transform[REPORTER_ASYNC_DONE] = false;
  transform[REPORTER_ASYNC_ERROR] = null;
  transform._readableState ??= {
    objectMode: transform.readableObjectMode,
    highWaterMark: transform.readableHighWaterMark
  };
  transform._writableState ??= {
    objectMode: transform.writableObjectMode,
    highWaterMark: transform.writableHighWaterMark
  };
  const originalPush = transform.push;
  transform.push = function push(chunk, ...args) {
    if (chunk !== null && chunk !== undefined) enqueueReporterAsyncChunk(this, chunk);
    return originalPush.call(this, chunk, ...args);
  };
  transform.once("end", () => finishReporterAsyncIterator(transform));
  transform.once("close", () => finishReporterAsyncIterator(transform));
  transform.once("error", (error) => failReporterAsyncIterator(transform, error));
}

function enqueueReporterAsyncChunk(transform, chunk) {
  const waiter = transform[REPORTER_ASYNC_WAITERS]?.shift();
  if (waiter) waiter.resolve({ value: chunk, done: false });
  else transform[REPORTER_ASYNC_QUEUE]?.push(chunk);
}

function finishReporterAsyncIterator(transform) {
  if (transform[REPORTER_ASYNC_DONE]) return;
  transform[REPORTER_ASYNC_DONE] = true;
  for (const waiter of transform[REPORTER_ASYNC_WAITERS]?.splice(0) ?? []) {
    waiter.resolve({ value: undefined, done: true });
  }
}

function failReporterAsyncIterator(transform, error) {
  transform[REPORTER_ASYNC_ERROR] = error;
  for (const waiter of transform[REPORTER_ASYNC_WAITERS]?.splice(0) ?? []) {
    waiter.reject(error);
  }
}

function createReporterAsyncIterator(transform) {
  return {
    next() {
      const queue = transform[REPORTER_ASYNC_QUEUE] ?? [];
      if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
      if (transform[REPORTER_ASYNC_ERROR]) return Promise.reject(transform[REPORTER_ASYNC_ERROR]);
      if (transform[REPORTER_ASYNC_DONE]) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve, reject) => {
        transform[REPORTER_ASYNC_WAITERS].push({ resolve, reject });
      });
    },
    return() {
      finishReporterAsyncIterator(transform);
      return Promise.resolve({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}

function createReporterTransform(formatEvent, flush, ReporterClass = streamBuiltin.Transform) {
  const transform = new ReporterClass({ writableObjectMode: true });
  if (transform instanceof ReporterTransform) {
    Object.defineProperties(transform, {
      [REPORTER_FORMAT_EVENT]: {
        configurable: true,
        value: formatEvent,
        writable: true
      },
      [REPORTER_FLUSH]: {
        configurable: true,
        value: flush,
        writable: true
      }
    });
    initializeReporterTransform(transform);
  } else {
    transform._transform = (event, _encoding, callback) => reporterTransformWithFormatter(transform, formatEvent, event, callback);
    if (typeof flush === "function") transform._flush = (callback) => reporterFlushWithFormatter(transform, flush, callback);
  }
  return transform;
}

function reporterTransformEvent(transform, event, callback) {
  reporterTransformWithFormatter(transform, transform[REPORTER_FORMAT_EVENT], event, callback);
}

function reporterTransformWithFormatter(transform, formatEvent, event, callback) {
  try {
    const formatted = formatEvent?.(event);
    if (formatted !== undefined && formatted !== "") transform.push(formatted);
    callback();
  } catch (error) {
    callback(error);
  }
}

function reporterFlush(transform, callback) {
  const flush = transform[REPORTER_FLUSH];
  if (typeof flush !== "function") {
    callback();
    return;
  }
  reporterFlushWithFormatter(transform, flush, callback);
}

function reporterFlushWithFormatter(transform, flush, callback) {
  try {
    const formatted = flush();
    if (formatted !== undefined && formatted !== "") transform.push(formatted);
    callback();
  } catch (error) {
    callback(error);
  }
}

function createSpecReporter() {
  return createReporterTransform((event) => {
    const type = testReporterEventType(event);
    if (type === "test:pass") return `ok ${testReporterName(event)}\n`;
    if (type === "test:fail") return `not ok ${testReporterName(event)}\n`;
    if (type === "test:skip") return `skip ${testReporterName(event)}\n`;
    if (type === "test:todo") return `todo ${testReporterName(event)}\n`;
    if (type === "test:diagnostic") return `# ${testReporterMessage(event)}\n`;
    return "";
  }, undefined, SpecReporter);
}

function createLcovReporter() {
  return createReporterTransform((event) => {
    const type = testReporterEventType(event);
    if (type === "test:coverage" || type === "test:coverage-summary") {
      return String(event?.data?.lcov ?? "");
    }
    return "";
  }, () => "", LcovReporter);
}

const testReportersBuiltin = {};
Object.defineProperties(testReportersBuiltin, {
  dot: {
    enumerable: true,
    configurable: true,
    get() {
      return dot;
    }
  },
  junit: {
    enumerable: true,
    configurable: true,
    get() {
      return junitReporter;
    }
  },
  spec: {
    enumerable: true,
    configurable: true,
    writable: false,
    value: function value() {
      return createSpecReporter();
    }
  },
  tap: {
    enumerable: true,
    configurable: true,
    get() {
      return tapReporter;
    }
  },
  lcov: {
    enumerable: true,
    configurable: true,
    writable: false,
    value: function value() {
      return createLcovReporter();
    }
  }
});

function createTestSuiteScope(name, parent = null) {
  return {
    name,
    parent,
    entries: [],
    before: [],
    after: [],
    beforeEach: [],
    afterEach: []
  };
}

function testSuiteChain(suite) {
  const chain = [];
  let current = suite;
  while (current) {
    chain.unshift(current);
    current = current.parent;
  }
  return chain;
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

let activeTestContext;

async function runTestHook(fn, context) {
  const previousContext = activeTestContext;
  activeTestContext = context;
  try {
    const result = fn(context);
    if (isPromiseLike(result)) return await result;
    return result;
  } finally {
    activeTestContext = previousContext;
  }
}

async function runTestCase(normalized, suiteChain, rootTestRunner) {
  const childTest = (nameOrOptionsOrFn, optionsOrFn, maybeFn) =>
    runTestCase(normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn), suiteChain, rootTestRunner);
  const context = createTestContext(normalized.name, childTest);
  if (normalized.options.skip) {
    context.skip(normalized.options.skip);
    return context;
  }
  if (normalized.options.todo) {
    context.todo(normalized.options.todo);
    return context;
  }
  if (typeof normalized.fn !== "function") return context;

  const beforeEachHooks = suiteChain.flatMap((suite) => suite.beforeEach);
  const afterEachHooks = suiteChain.flatMap((suite) => suite.afterEach).reverse();
  for (const hook of beforeEachHooks) await runTestHook(hook, context);
  try {
    return await runTestHook(normalized.fn, context);
  } finally {
    for (const hook of afterEachHooks) await runTestHook(hook, context);
  }
}

async function runTestSuite(suite, rootTestRunner) {
  const chain = testSuiteChain(suite);
  const context = createTestContext(suite.name, rootTestRunner);
  for (const hook of suite.before) await runTestHook(hook, context);
  try {
    for (const entry of suite.entries) {
      if (entry.type === "suite") await runTestSuite(entry.suite, rootTestRunner);
      else await runTestCase(entry.normalized, chain, rootTestRunner);
    }
  } finally {
    for (const hook of suite.after) await runTestHook(hook, context);
  }
  return context;
}

const mockFunctionContextState = new WeakMap();
const mockFunctionContextMethods = {
  get calls() {
    return mockFunctionContextState.get(this)?.calls.slice() ?? [];
  },
  callCount() {
    return mockFunctionContextState.get(this)?.calls.length ?? 0;
  },
  mockImplementation(nextImplementation) {
    const state = mockFunctionContextState.get(this);
    validateMockImplementation(nextImplementation);
    if (state) state.currentImplementation = nextImplementation;
    return undefined;
  },
  mockImplementationOnce(nextImplementation, onCall) {
    const state = mockFunctionContextState.get(this);
    validateMockImplementation(nextImplementation);
    const callIndex = normalizeMockOnCall(onCall, state?.calls.length ?? 0);
    state?.onceImplementations.set(callIndex, nextImplementation);
    return undefined;
  },
  restore() {
    const state = mockFunctionContextState.get(this);
    if (!state) return undefined;
    state.onceImplementations.clear();
    state.currentImplementation = state.defaultImplementation;
    state.restoreTarget?.();
    return undefined;
  },
  resetCalls() {
    const state = mockFunctionContextState.get(this);
    if (state) state.calls.length = 0;
    return undefined;
  }
};
const mockFunctionContextPrototype = {};
Object.defineProperties(mockFunctionContextPrototype, {
  constructor: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function MockFunctionContext(_mockFn, _implementation, _options) {}
  },
  calls: {
    enumerable: false,
    configurable: true,
    get: Object.getOwnPropertyDescriptor(mockFunctionContextMethods, "calls").get
  },
  callCount: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockFunctionContextMethods.callCount
  },
  mockImplementation: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockFunctionContextMethods.mockImplementation
  },
  mockImplementationOnce: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockFunctionContextMethods.mockImplementationOnce
  },
  restore: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockFunctionContextMethods.restore
  },
  resetCalls: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockFunctionContextMethods.resetCalls
  }
});

const mockPropertyContextState = new WeakMap();
const mockPropertyContextMethods = {
  get accesses() {
    return mockPropertyContextState.get(this)?.accesses.slice() ?? [];
  },
  accessCount() {
    return mockPropertyContextState.get(this)?.accesses.length ?? 0;
  },
  mockImplementation(nextValue) {
    const state = mockPropertyContextState.get(this);
    if (state) setMockPropertyValue(state, nextValue);
    return undefined;
  },
  mockImplementationOnce(nextValue, onAccess) {
    const state = mockPropertyContextState.get(this);
    const accessIndex = normalizeMockOnAccess(onAccess, state?.accesses.length ?? 0);
    state?.onceValues.set(accessIndex, nextValue);
    return undefined;
  },
  resetAccesses() {
    const state = mockPropertyContextState.get(this);
    if (state) state.accesses.length = 0;
    return undefined;
  },
  restore() {
    const state = mockPropertyContextState.get(this);
    state?.restore?.();
    return undefined;
  }
};
const mockPropertyContextPrototype = {};
Object.defineProperties(mockPropertyContextPrototype, {
  constructor: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function MockPropertyContext(_mock, _implementation, _options) {}
  },
  accesses: {
    enumerable: false,
    configurable: true,
    get: Object.getOwnPropertyDescriptor(mockPropertyContextMethods, "accesses").get
  },
  accessCount: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockPropertyContextMethods.accessCount
  },
  mockImplementation: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockPropertyContextMethods.mockImplementation
  },
  mockImplementationOnce: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockPropertyContextMethods.mockImplementationOnce
  },
  resetAccesses: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockPropertyContextMethods.resetAccesses
  },
  restore: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: mockPropertyContextMethods.restore
  }
});

function createMockFunction(originalImplementation = () => undefined, implementationOrOptions, maybeOptions) {
  if (typeof originalImplementation !== "function") {
    throw createMockInvalidArgType("implementation", "function", originalImplementation);
  }
  const { implementation, options } = normalizeMockImplementationOptions(
    originalImplementation,
    implementationOrOptions,
    maybeOptions
  );
  const mockFn = function mockFn(...args) {
    const state = mockFunctionContextState.get(mockContext);
    const callIndex = state.calls.length;
    const call = {
      arguments: args,
      error: undefined,
      result: undefined,
      stack: new Error(),
      target: undefined,
      this: this
    };
    state.calls.push(call);
    try {
      const selectedImplementation = state.onceImplementations.has(callIndex)
        ? state.onceImplementations.get(callIndex)
        : state.currentImplementation;
      state.onceImplementations.delete(callIndex);
      const result = selectedImplementation.apply(this, args);
      call.result = result;
      maybeFinalizeMockFunctionTimes(state);
      return result;
    } catch (error) {
      call.error = error;
      maybeFinalizeMockFunctionTimes(state);
      throw error;
    }
  };
  const mockContext = Object.create(mockFunctionContextPrototype);
  mockFunctionContextState.set(mockContext, {
    calls: [],
    defaultImplementation: originalImplementation,
    currentImplementation: implementation,
    onceImplementations: new Map(),
    mockFn,
    times: options.times,
    restoreTarget: undefined
  });
  mockFn.mock = mockContext;
  Object.defineProperty(mockFn, "name", {
    configurable: true,
    value: implementation.name
  });
  Object.defineProperty(mockFn, "length", {
    configurable: true,
    value: implementation.length
  });
  return mockFn;
}
Object.defineProperty(createMockFunction, "name", {
  configurable: true,
  value: "fn"
});

function setMockFunctionRestore(mockFn, restoreTarget) {
  const state = mockFunctionContextState.get(mockFn?.mock);
  if (state) state.restoreTarget = restoreTarget;
}

function validateMockImplementation(implementation) {
  if (typeof implementation !== "function") {
    throw createMockInvalidArgType("implementation", "function", implementation);
  }
}

function normalizeMockImplementationOptions(originalImplementation, implementationOrOptions, maybeOptions) {
  let implementation = originalImplementation;
  let options = maybeOptions;
  if (typeof implementationOrOptions === "function") {
    implementation = implementationOrOptions;
  } else if (implementationOrOptions !== undefined) {
    if (isPlainObjectLike(implementationOrOptions) && maybeOptions === undefined) {
      options = implementationOrOptions;
    } else {
      throw createMockInvalidArgType("implementation", "function", implementationOrOptions);
    }
  }
  return {
    implementation,
    options: normalizeMockOptions(options)
  };
}

function normalizeMockOptions(options) {
  if (options === undefined) return {};
  if (!isPlainObjectLike(options)) throw createMockInvalidArgType("options", "object", options);
  if (!Object.hasOwn(options, "times") || options.times === undefined) return {};
  const { times } = options;
  if (typeof times !== "number") throw createMockInvalidPropertyType("options.times", "number", times);
  if (!Number.isInteger(times)) {
    const error = new RangeError(`The value of "options.times" is out of range. It must be an integer. Received ${times}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  if (times < 1 || times > Number.MAX_SAFE_INTEGER) {
    const error = new RangeError(`The value of "options.times" is out of range. It must be >= 1 && <= ${Number.MAX_SAFE_INTEGER}. Received ${times}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  return { times };
}

function maybeFinalizeMockFunctionTimes(state) {
  if (state.times === undefined || state.calls.length < state.times) return;
  state.times = undefined;
  state.onceImplementations.clear();
  state.currentImplementation = state.defaultImplementation;
  state.restoreTarget?.();
}

function normalizeMockOnCall(onCall, fallback) {
  if (onCall === undefined || onCall === null) return fallback;
  if (typeof onCall !== "number") throw createMockInvalidArgType("onCall", "number", onCall);
  if (!Number.isInteger(onCall)) {
    const error = new RangeError(`The value of "onCall" is out of range. It must be an integer. Received ${onCall}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  if (onCall < fallback || onCall > Number.MAX_SAFE_INTEGER) {
    const error = new RangeError(`The value of "onCall" is out of range. It must be >= ${fallback} && <= ${Number.MAX_SAFE_INTEGER}. Received ${onCall}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  return onCall;
}

function normalizeMockOnAccess(onAccess, fallback) {
  if (onAccess === undefined || onAccess === null) return fallback;
  if (typeof onAccess !== "number") throw createMockOnAccessInvalidArgType(onAccess);
  if (!Number.isInteger(onAccess)) {
    const error = new RangeError(`The value of "onAccess" is out of range. It must be an integer. Received ${onAccess}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  if (onAccess < fallback || onAccess > Number.MAX_SAFE_INTEGER) {
    const error = new RangeError(`The value of "onAccess" is out of range. It must be >= ${fallback} && <= ${Number.MAX_SAFE_INTEGER}. Received ${onAccess}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  return onAccess;
}

function selectMockPropertyValue(state, fallbackValue) {
  const accessIndex = state.accesses.length;
  const selectedValue = state.onceValues.has(accessIndex)
    ? state.onceValues.get(accessIndex)
    : fallbackValue;
  state.onceValues.delete(accessIndex);
  return selectedValue;
}

function recordMockPropertyAccess(state, type, value) {
  state.accesses.push({
    type,
    value,
    stack: new Error()
  });
}

function getMockPropertyValue(state) {
  const selectedValue = selectMockPropertyValue(state, state.currentValue);
  recordMockPropertyAccess(state, "get", selectedValue);
  return selectedValue;
}

function setMockPropertyValue(state, nextValue) {
  const selectedValue = selectMockPropertyValue(state, nextValue);
  state.currentValue = selectedValue;
  recordMockPropertyAccess(state, "set", selectedValue);
  return undefined;
}

function createMockInvalidArgType(name, expected, value) {
  const error = new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createMockInvalidPropertyType(name, expected, value) {
  const error = new TypeError(`The "${name}" property must be of type ${expected}. Received ${describeMockOnAccessReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createMockOnAccessInvalidArgType(value) {
  const error = new TypeError(`The "onAccess" argument must be of type number. Received ${describeMockOnAccessReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function describeMockOnAccessReceived(value) {
  switch (typeof value) {
    case "string":
      return `type string (${formatInvalidReceived(value)})`;
    case "bigint":
      return `type bigint (${value}n)`;
    case "symbol":
      return `type symbol (${String(value)})`;
    case "boolean":
      return `type boolean (${value})`;
    case "function":
      return `function ${value.name ?? ""}`;
    default:
      return describeReceived(value);
  }
}

function createMockInvalidMethodError(methodName, value) {
  const error = new TypeError(`The argument '${String(methodName)}' must be a method. Received ${value === undefined ? "undefined" : format(value)}`);
  error.code = "ERR_INVALID_ARG_VALUE";
  return error;
}

function createMockInvalidPropertyError(propertyName) {
  const error = new TypeError(`The argument 'propertyName' is not a property of the object. Received ${String(propertyName)}`);
  error.code = "ERR_INVALID_ARG_VALUE";
  return error;
}

function findPropertyDescriptor(object, propertyName) {
  let current = object;
  while (current !== null && current !== undefined) {
    const descriptor = Object.getOwnPropertyDescriptor(current, propertyName);
    if (descriptor) return { owner: current, descriptor };
    current = Object.getPrototypeOf(current);
  }
  return { owner: object, descriptor: undefined };
}

const skippedTest = createSkippedTest;
const todoTest = createTodoTest;
Object.assign(openContainersTest, {
  only: openContainersTest,
  skip: skippedTest,
  todo: todoTest
});
Object.assign(skippedTest, {
  only: skippedTest,
  skip: skippedTest,
  todo: todoTest
});
Object.assign(todoTest, {
  only: todoTest,
  skip: skippedTest,
  todo: todoTest
});

function createTestBuiltin({ mockTimers } = {}) {
  const rootSuite = createTestSuiteScope("");
  let activeSuite = rootSuite;

  const test = (nameOrOptionsOrFn, optionsOrFn, maybeFn) => {
    return runTestInScope(nameOrOptionsOrFn, optionsOrFn, maybeFn);
  };
  Object.defineProperty(test, "name", {
    configurable: true,
    value: "test"
  });
  const runTestInScope = function runTestInScope(nameOrOptionsOrFn, optionsOrFn, maybeFn) {
    const normalized = normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn);
    if (activeSuite !== rootSuite) {
      const context = createTestContext(normalized.name, test);
      if (normalized.options.skip) context.skip(normalized.options.skip);
      if (normalized.options.todo) context.todo(normalized.options.todo);
      activeSuite.entries.push({
        type: "test",
        normalized,
        context
      });
      return Promise.resolve(context);
    }
    return runTestCase(normalized, [rootSuite], test);
  };
  const describe = (nameOrOptionsOrFn, optionsOrFn, maybeFn) => {
    const normalized = normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, maybeFn);
    const suite = createTestSuiteScope(normalized.name, activeSuite);
    const context = createTestContext(normalized.name, test);
    if (normalized.options.skip) {
      context.skip(normalized.options.skip);
      return Promise.resolve(context);
    }
    if (normalized.options.todo) {
      context.todo(normalized.options.todo);
      return Promise.resolve(context);
    }

    const parentSuite = activeSuite;
    parentSuite.entries.push({
      type: "suite",
      suite,
      context
    });
    activeSuite = suite;
    let bodyResult;
    try {
      if (typeof normalized.fn === "function") bodyResult = normalized.fn(context);
    } finally {
      activeSuite = parentSuite;
    }

    const runCollectedSuite = async () => {
      if (isPromiseLike(bodyResult)) await bodyResult;
      if (parentSuite === rootSuite) return runTestSuite(suite, test);
      return context;
    };
    return runCollectedSuite();
  };
  Object.defineProperty(describe, "name", {
    configurable: true,
    value: "test"
  });
  const createModifier = (implementation) => {
    const modifier = (nameOrOptionsOrFn, optionsOrFn, maybeFn) => implementation(nameOrOptionsOrFn, optionsOrFn, maybeFn);
    Object.defineProperty(modifier, "name", {
      configurable: true,
      value: ""
    });
    return modifier;
  };
  const onlyTest = createModifier(runTestInScope);
  const skippedTestCallable = createModifier(createSkippedTest);
  const todoTestCallable = createModifier(createTodoTest);
  const expectFailureTest = createModifier(runTestInScope);
  Object.assign(describe, {
    expectFailure: createModifier(describe),
    skip: createModifier(createSkippedTest),
    todo: createModifier(createTodoTest),
    only: createModifier(describe)
  });
  const registerHook = (kind) => {
    const hook = (nameOrOptionsOrFn, optionsOrFn, ...rest) => {
      const { fn } = normalizeTestArguments(nameOrOptionsOrFn, optionsOrFn, rest[0]);
      if (typeof fn === "function") activeSuite[kind].push(fn);
      return Promise.resolve(createTestContext("", test));
    };
    Object.defineProperty(hook, "name", {
      configurable: true,
      value: ""
    });
    return hook;
  };
  const activeMockRestorers = new Set();
  const restoreAllMocks = () => {
    for (const restore of [...activeMockRestorers]) restore();
  };
  const timersPrototype = {};
  Object.defineProperties(timersPrototype, {
    constructor: {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function MockTimers() {}
    },
    enable: {
      configurable: true,
      writable: true,
      value: function enable() {
        mockTimers?.enable(arguments[0]);
      }
    },
    reset: {
      configurable: true,
      writable: true,
      value: function reset() {
        mockTimers?.reset();
      }
    },
    tick: {
      configurable: true,
      writable: true,
      value: function tick() {
        const milliseconds = arguments.length ? arguments[0] : 0;
        mockTimers?.tick(milliseconds);
      }
    },
    runAll: {
      configurable: true,
      writable: true,
      value: function runAll() {
        mockTimers?.runAll();
      }
    },
    setTime: {
      configurable: true,
      writable: true,
      value: function setTime() {
        mockTimers?.setTime(arguments[0]);
      }
    }
  });
  const timers = Object.create(timersPrototype);
  const getMockTimers = Object.getOwnPropertyDescriptor({
    get timers() {
      return timers;
    }
  }, "timers").get;
  const mockMethods = {
    fn(...args) {
      return createMockFunction(...args);
    },
    method(object, methodName) {
      if ((typeof object !== "object" && typeof object !== "function") || object === null) {
        throw createMockInvalidArgType("object", "object", object);
      }
      if (typeof methodName !== "string" && typeof methodName !== "symbol") {
        throw createMockInvalidArgType("methodName", "string or symbol", methodName);
      }
      const original = object[methodName];
      if (typeof original !== "function") {
        throw createMockInvalidMethodError(methodName, original);
      }
      const originalImplementation = original;
      const { implementation, options } = normalizeMockImplementationOptions(
        originalImplementation,
        arguments[2],
        arguments[3]
      );
      const replacement = createMockFunction(originalImplementation, implementation, options);
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        object[methodName] = original;
        activeMockRestorers.delete(restore);
      };
      object[methodName] = replacement;
      setMockFunctionRestore(replacement, () => {
        replacement.mock.mockImplementation(originalImplementation);
        restore();
      });
      activeMockRestorers.add(restore);
      return replacement;
    },
    getter(object, methodName) {
      if ((typeof object !== "object" && typeof object !== "function") || object === null) {
        throw createMockInvalidArgType("object", "object", object);
      }
      if (typeof methodName !== "string" && typeof methodName !== "symbol") {
        throw createMockInvalidArgType("methodName", "string or symbol", methodName);
      }
      const { descriptor } = findPropertyDescriptor(object, methodName);
      if (typeof descriptor?.get !== "function") {
        throw createMockInvalidMethodError(methodName, descriptor?.get);
      }
      const originalDescriptor = Object.getOwnPropertyDescriptor(object, methodName);
      const { implementation, options } = normalizeMockImplementationOptions(
        descriptor.get,
        arguments[2],
        arguments[3]
      );
      const replacement = createMockFunction(descriptor.get, implementation, options);
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (originalDescriptor) Object.defineProperty(object, methodName, originalDescriptor);
        else delete object[methodName];
        activeMockRestorers.delete(restore);
      };
      Object.defineProperty(object, methodName, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: replacement,
        set: descriptor.set
      });
      setMockFunctionRestore(replacement, () => {
        replacement.mock.mockImplementation(descriptor.get);
        restore();
      });
      activeMockRestorers.add(restore);
      return replacement;
    },
    setter(object, methodName) {
      if ((typeof object !== "object" && typeof object !== "function") || object === null) {
        throw createMockInvalidArgType("object", "object", object);
      }
      if (typeof methodName !== "string" && typeof methodName !== "symbol") {
        throw createMockInvalidArgType("methodName", "string or symbol", methodName);
      }
      const { descriptor } = findPropertyDescriptor(object, methodName);
      if (typeof descriptor?.set !== "function") {
        throw createMockInvalidMethodError(methodName, descriptor?.set);
      }
      const originalDescriptor = Object.getOwnPropertyDescriptor(object, methodName);
      const { implementation, options } = normalizeMockImplementationOptions(
        descriptor.set,
        arguments[2],
        arguments[3]
      );
      const replacement = createMockFunction(descriptor.set, implementation, options);
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (originalDescriptor) Object.defineProperty(object, methodName, originalDescriptor);
        else delete object[methodName];
        activeMockRestorers.delete(restore);
      };
      Object.defineProperty(object, methodName, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: replacement
      });
      setMockFunctionRestore(replacement, () => {
        replacement.mock.mockImplementation(descriptor.set);
        restore();
      });
      activeMockRestorers.add(restore);
      return replacement;
    },
    property(object, propertyName, value) {
      if ((typeof object !== "object" && typeof object !== "function") || object === null) {
        throw createMockInvalidArgType("object", "object", object);
      }
      if (typeof propertyName !== "string" && typeof propertyName !== "symbol") {
        throw createMockInvalidArgType("propertyName", "string or symbol", propertyName);
      }
      const originalDescriptor = Object.getOwnPropertyDescriptor(object, propertyName);
      if (!originalDescriptor) {
        throw createMockInvalidPropertyError(propertyName);
      }

      let restored = false;
      let state;
      const restore = () => {
        if (restored) return;
        restored = true;
        Object.defineProperty(object, propertyName, originalDescriptor);
        activeMockRestorers.delete(restore);
      };
      const mockContext = Object.create(mockPropertyContextPrototype);
      state = {
        accesses: [],
        currentValue: value,
        onceValues: new Map(),
        restore
      };
      mockPropertyContextState.set(mockContext, state);
      const setter = mockPropertyContextMethods.mockImplementation.bind(mockContext);
      Object.defineProperty(object, propertyName, {
        configurable: true,
        enumerable: originalDescriptor.enumerable,
        get() {
          return getMockPropertyValue(state);
        },
        set: setter
      });
      const context = {};
      Object.defineProperty(context, propertyName, {
        configurable: true,
        enumerable: true,
        get() {
          return object[propertyName];
        },
        set: setter
      });
      activeMockRestorers.add(restore);
      return new Proxy(context, {
        get(target, property, receiver) {
          if (property === "mock") return mockContext;
          return Reflect.get(target, property, receiver);
        },
        has(target, property) {
          if (property === "mock") return false;
          return Reflect.has(target, property);
        },
        getOwnPropertyDescriptor(target, property) {
          if (property === "mock") return undefined;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
        ownKeys(target) {
          return Reflect.ownKeys(target).filter((property) => property !== "mock");
        }
      });
    },
    reset() {
      return restoreAllMocks();
    },
    restoreAll() {
      return restoreAllMocks();
    }
  };
  const mockPrototype = {};
  Object.defineProperties(mockPrototype, {
    constructor: {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function MockTracker() {}
    },
    timers: {
      enumerable: false,
      configurable: true,
      get: getMockTimers
    },
    fn: {
      configurable: true,
      writable: true,
      value: mockMethods.fn
    },
    method: {
      configurable: true,
      writable: true,
      value: mockMethods.method
    },
    getter: {
      configurable: true,
      writable: true,
      value: mockMethods.getter
    },
    setter: {
      configurable: true,
      writable: true,
      value: mockMethods.setter
    },
    property: {
      configurable: true,
      writable: true,
      value: mockMethods.property
    },
    reset: {
      configurable: true,
      writable: true,
      value: mockMethods.reset
    },
    restoreAll: {
      configurable: true,
      writable: true,
      value: mockMethods.restoreAll
    }
  });
  const mock = Object.create(mockPrototype);
  Object.defineProperty(createTestRunResult, "name", {
    configurable: true,
    value: "run"
  });
  function getTestContext() {
    return activeTestContext;
  }
  const snapshot = Object.create(null);
  Object.defineProperties(snapshot, {
    setDefaultSnapshotSerializers: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function setDefaultSnapshotSerializers(serializers) {
        if (!Array.isArray(serializers)) throw createInvalidArgInstanceError("serializers", "Array", serializers);
        serializers.forEach((serializer, index) => {
          if (typeof serializer !== "function") {
            throw createInvalidArgTypeError(`serializers[${index}]`, "function", serializer);
          }
        });
      }
    },
    setResolveSnapshotPath: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function setResolveSnapshotPath(fn) {
        if (typeof fn !== "function") throw createInvalidArgTypeError("fn", "function", fn);
      }
    }
  });
  const testAssert = Object.create(null);
  Object.defineProperty(testAssert, "register", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function register(name, fn) {
      if (typeof name !== "string") throw createInvalidArgTypeError("name", "string", name);
      if (typeof fn !== "function") throw createInvalidArgTypeError("fn", "function", fn);
    }
  });
  const mockGetter = createNamedAccessorGetter(() => mock);
  const snapshotGetter = createNamedAccessorGetter(() => snapshot);
  const assertGetter = createNamedAccessorGetter(() => testAssert);
  Object.assign(test, {
    expectFailure: expectFailureTest,
    skip: skippedTestCallable,
    todo: todoTestCallable,
    only: onlyTest,
    after: registerHook("after"),
    afterEach: registerHook("afterEach"),
    before: registerHook("before"),
    beforeEach: registerHook("beforeEach"),
    describe,
    getTestContext,
    it: test,
    run: createTestRunResult,
    suite: describe,
    test
  });
  Object.defineProperties(test, {
    mock: {
      configurable: true,
      enumerable: true,
      get: mockGetter
    },
    snapshot: {
      configurable: true,
      enumerable: true,
      get: snapshotGetter
    },
    assert: {
      configurable: true,
      enumerable: true,
      get: assertGetter
    }
  });
  return test;
}

function createNamedAccessorGetter(readValue) {
  Object.defineProperty(readValue, "name", {
    configurable: true,
    value: "get"
  });
  return readValue;
}

const SQLITE_CONSTANT_VALUES = {
  SQLITE_CHANGESET_OMIT: 0,
  SQLITE_CHANGESET_REPLACE: 1,
  SQLITE_CHANGESET_ABORT: 2,
  SQLITE_CHANGESET_DATA: 1,
  SQLITE_CHANGESET_NOTFOUND: 2,
  SQLITE_CHANGESET_CONFLICT: 3,
  SQLITE_CHANGESET_CONSTRAINT: 4,
  SQLITE_CHANGESET_FOREIGN_KEY: 5,
  SQLITE_OK: 0,
  SQLITE_DENY: 1,
  SQLITE_IGNORE: 2,
  SQLITE_CREATE_INDEX: 1,
  SQLITE_CREATE_TABLE: 2,
  SQLITE_CREATE_TEMP_INDEX: 3,
  SQLITE_CREATE_TEMP_TABLE: 4,
  SQLITE_CREATE_TEMP_TRIGGER: 5,
  SQLITE_CREATE_TEMP_VIEW: 6,
  SQLITE_CREATE_TRIGGER: 7,
  SQLITE_CREATE_VIEW: 8,
  SQLITE_DELETE: 9,
  SQLITE_DROP_INDEX: 10,
  SQLITE_DROP_TABLE: 11,
  SQLITE_DROP_TEMP_INDEX: 12,
  SQLITE_DROP_TEMP_TABLE: 13,
  SQLITE_DROP_TEMP_TRIGGER: 14,
  SQLITE_DROP_TEMP_VIEW: 15,
  SQLITE_DROP_TRIGGER: 16,
  SQLITE_DROP_VIEW: 17,
  SQLITE_INSERT: 18,
  SQLITE_PRAGMA: 19,
  SQLITE_READ: 20,
  SQLITE_SELECT: 21,
  SQLITE_TRANSACTION: 22,
  SQLITE_UPDATE: 23,
  SQLITE_ATTACH: 24,
  SQLITE_DETACH: 25,
  SQLITE_ALTER_TABLE: 26,
  SQLITE_REINDEX: 27,
  SQLITE_ANALYZE: 28,
  SQLITE_CREATE_VTABLE: 29,
  SQLITE_DROP_VTABLE: 30,
  SQLITE_FUNCTION: 31,
  SQLITE_SAVEPOINT: 32,
  SQLITE_COPY: 0,
  SQLITE_RECURSIVE: 33,
};
const SQLITE_CONSTANTS = {};
for (const [key, value] of Object.entries(SQLITE_CONSTANT_VALUES)) {
  Object.defineProperty(SQLITE_CONSTANTS, key, {
    enumerable: true,
    configurable: false,
    writable: false,
    value
  });
}

function seaErrorToString() {
  return `${this.name} [${this.code}]: ${this.message}`;
}

const SEA_ERROR_PROTOTYPE = Object.create(Error.prototype, {
  toString: {
    configurable: true,
    writable: true,
    value: seaErrorToString
  }
});

const SEA_TYPE_ERROR_PROTOTYPE = Object.create(TypeError.prototype, {
  toString: {
    configurable: true,
    writable: true,
    value: seaErrorToString
  }
});

function createSeaUnavailableError() {
  const error = new Error("Operation cannot be invoked when not in a single-executable application");
  error.code = "ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION";
  Object.setPrototypeOf(error, SEA_ERROR_PROTOTYPE);
  return error;
}

const seaBuiltin = {
  isSea() {
    return false;
  },
  getAsset,
  getRawAsset,
  getAssetAsBlob,
  getAssetKeys
};

function getAsset(key, encoding) {
  validateSeaAssetKey(key);
  validateSeaAssetEncoding(encoding);
  throw createSeaUnavailableError();
}

function getRawAsset(key) {
  validateSeaAssetKey(key);
  throw createSeaUnavailableError();
}

function getAssetAsBlob(key, options) {
  validateSeaAssetKey(key);
  throw createSeaUnavailableError();
}

function getAssetKeys() {
  throw createSeaUnavailableError();
}

function validateSeaAssetKey(key) {
  if (typeof key !== "string") {
    throw createSeaInvalidStringArgumentError("key", key);
  }
}

function validateSeaAssetEncoding(encoding) {
  if (encoding !== undefined && typeof encoding !== "string") {
    throw createSeaInvalidStringArgumentError("encoding", encoding);
  }
}

function createSeaInvalidStringArgumentError(name, value) {
  const error = new TypeError(`The "${name}" argument must be of type string. Received ${describeSeaReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  Object.setPrototypeOf(error, SEA_TYPE_ERROR_PROTOTYPE);
  return error;
}

function describeSeaReceived(value) {
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  if (typeof value === "boolean") return `type boolean (${value})`;
  if (typeof value === "bigint") return `type bigint (${value}n)`;
  return describeReceived(value);
}

const SQLITE_DATABASE_STATES = new WeakMap();
const SQLITE_TAG_STORE_STATES = new WeakMap();

const SQLITE_DATABASE_LIMITS = {
  length: 1000000000,
  sqlLength: 1000000000,
  column: 2000,
  exprDepth: 1000,
  compoundSelect: 500,
  vdbeOp: 250000000,
  functionArg: 1000,
  attach: 10,
  likePatternLength: 50000,
  variableNumber: 32766,
  triggerDepth: 1000
};

function DatabaseSync(path, options) {
  if (!new.target) throw createSqliteConstructCallRequiredError();
  const location = validateSqliteDatabasePath(path);
  const normalizedOptions = arguments.length > 1
    ? validateSqliteDatabaseOptions(options)
    : { open: true };
  const state = {
    open: normalizedOptions.open,
    location,
    limits: { ...SQLITE_DATABASE_LIMITS }
  };
  SQLITE_DATABASE_STATES.set(this, state);
  Object.defineProperties(this, {
    isOpen: {
      enumerable: true,
      configurable: false,
      get: createSqliteDatabaseGetter(function() {
        return SQLITE_DATABASE_STATES.get(this)?.open === true;
      })
    },
    isTransaction: {
      enumerable: true,
      configurable: false,
      get: createSqliteDatabaseGetter(function() {
        return false;
      })
    },
    limits: {
      enumerable: true,
      configurable: false,
      get: createSqliteDatabaseGetter(function() {
        const currentState = SQLITE_DATABASE_STATES.get(this);
        validateSqliteDatabaseOpen(currentState);
        return currentState.limits;
      })
    }
  });
}
Object.defineProperty(DatabaseSync, "length", {
  configurable: true,
  value: 0
});

function Session() {
  throw createSqliteIllegalConstructorError();
}

function StatementSync() {
  throw createSqliteIllegalConstructorError();
}

function SQLTagStore() {
  throw createSqliteIllegalConstructorError();
}

function createSqliteConstructCallRequiredError() {
  const error = new TypeError("Cannot call constructor without `new`");
  error.code = "ERR_CONSTRUCT_CALL_REQUIRED";
  return error;
}

function createSqliteIllegalConstructorError() {
  const error = new Error("Illegal constructor");
  error.code = "ERR_ILLEGAL_CONSTRUCTOR";
  return error;
}

const sqliteDatabaseMethods = {
  open() {
    const state = SQLITE_DATABASE_STATES.get(this);
    if (state?.open) throw createSqliteInvalidStateError("database is already open");
    if (state) state.open = true;
  },
  close() {
    const state = SQLITE_DATABASE_STATES.get(this);
    validateSqliteDatabaseOpen(state);
    state.open = false;
  },
  prepare() {
    validateSqliteDatabaseStringArgument("sql", arguments[0]);
    throw unsupportedCoreOperation("sqlite", "DatabaseSync.prepare");
  },
  exec() {
    validateSqliteDatabaseStringArgument("sql", arguments[0]);
    throw unsupportedCoreOperation("sqlite", "DatabaseSync.exec");
  },
  createTagStore() {
    const state = SQLITE_DATABASE_STATES.get(this);
    validateSqliteDatabaseOpen(state);
    const tagStore = Object.create(SQLTagStore.prototype);
    SQLITE_TAG_STORE_STATES.set(tagStore, {
      database: this,
      databaseState: state,
      capacity: 1000,
      size: 0
    });
    Object.defineProperties(tagStore, {
      capacity: {
        enumerable: true,
        configurable: false,
        get: createSqliteTagStoreGetter("capacity")
      },
      db: {
        enumerable: true,
        configurable: false,
        get: createSqliteTagStoreGetter("database")
      },
      size: {
        enumerable: true,
        configurable: false,
        get: createSqliteTagStoreGetter("size")
      }
    });
    return tagStore;
  },
  location() {
    const state = SQLITE_DATABASE_STATES.get(this);
    validateSqliteDatabaseOpen(state);
    if (arguments.length > 0 && arguments[0] !== undefined && typeof arguments[0] !== "string") {
      throw createSqliteInvalidArgumentError('The "dbName" argument must be a string.');
    }
    if (arguments[0] === "temp") return null;
    return state.location;
  },
  applyChangeset() {
    const state = SQLITE_DATABASE_STATES.get(this);
    validateSqliteDatabaseOpen(state);
    validateSqliteDatabaseUint8ArrayArgument("changeset", arguments[0]);
    validateSqliteApplyChangesetOptions(arguments[1]);
    if (arguments[0].byteLength === 0) return true;
    throw unsupportedCoreOperation("sqlite", "DatabaseSync.applyChangeset");
  },
  deserialize() {
    validateSqliteDatabaseUint8ArrayArgument("buffer", arguments[0]);
    throw unsupportedCoreOperation("sqlite", "DatabaseSync.deserialize");
  },
  setAuthorizer() {
    const callback = arguments[0];
    if (callback !== null && typeof callback !== "function") {
      throw createSqliteInvalidArgumentError('The "callback" argument must be a function or null.');
    }
    throw unsupportedCoreOperation("sqlite", "DatabaseSync.setAuthorizer");
  }
};

const sqliteDatabaseSymbolDispose = {
  [Symbol.dispose]() {
    const state = SQLITE_DATABASE_STATES.get(this);
    if (state) state.open = false;
  }
}[Symbol.dispose];
Object.defineProperty(sqliteDatabaseSymbolDispose, "name", {
  configurable: true,
  value: ""
});

defineSqlitePrototypeStubs(DatabaseSync, [
  "open",
  "close",
  "prepare",
  "exec",
  "function",
  "createTagStore",
  "location",
  "aggregate",
  "createSession",
  "applyChangeset",
  "enableLoadExtension",
  "enableDefensive",
  "loadExtension",
  "serialize",
  "deserialize",
  "setAuthorizer"
], sqliteDatabaseMethods);
defineSqlitePrototypeStubs(StatementSync, [
  "iterate",
  "all",
  "get",
  "run",
  "columns",
  "setAllowBareNamedParameters",
  "setAllowUnknownNamedParameters",
  "setReadBigInts",
  "setReturnArrays"
]);
defineSqlitePrototypeStubs(Session, [
  "changeset",
  "patchset",
  "close"
]);
defineSqlitePrototypeStubs(SQLTagStore, [
  "get",
  "all",
  "iterate",
  "run",
  "clear"
], {
  get: sqliteTagStoreUnsupportedMethod("get"),
  all: sqliteTagStoreUnsupportedMethod("all"),
  iterate: sqliteTagStoreUnsupportedMethod("iterate"),
  run: sqliteTagStoreUnsupportedMethod("run"),
  clear() {
    return undefined;
  }
});
defineSqliteSymbolDisposeStub(DatabaseSync, sqliteDatabaseSymbolDispose);
defineSqliteSymbolDisposeStub(Session);

const sqliteBuiltin = {
  DatabaseSync,
  StatementSync,
  Session,
  constants: SQLITE_CONSTANTS,
  backup
};

function backup(source, destination, options = undefined) {
  if ((typeof source !== "object" && typeof source !== "function") || source === null) {
    throw createSqliteInvalidArgumentError('The "sourceDb" argument must be an object.');
  }
  const state = SQLITE_DATABASE_STATES.get(source);
  if (state) validateSqliteDatabaseOpen(state);
  validateSqliteDatabasePath(destination);
  validateSqliteBackupOptions(options);
  return Promise.reject(unsupportedCoreOperation("sqlite", "backup"));
}

function defineSqlitePrototypeStubs(ctor, names, overrides = undefined) {
  const constructorDescriptor = Object.getOwnPropertyDescriptor(ctor.prototype, "constructor");
  delete ctor.prototype.constructor;
  for (const name of names) {
    const stub = overrides?.[name] ?? (() => {
      throw unsupportedCoreOperation("sqlite", `${ctor.name}.${name}`);
    });
    Object.defineProperty(stub, "name", {
      configurable: true,
      value: name
    });
    Object.defineProperty(ctor.prototype, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: stub
    });
  }
  Object.defineProperty(ctor.prototype, "constructor", constructorDescriptor);
}

function defineSqliteSymbolDisposeStub(ctor, override = undefined) {
  const stub = override ?? (() => {
    throw unsupportedCoreOperation("sqlite", `${ctor.name}.${String(Symbol.dispose)}`);
  });
  Object.defineProperty(stub, "name", {
    configurable: true,
    value: ""
  });
  Object.defineProperty(ctor.prototype, Symbol.dispose, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: stub
  });
}

function validateSqliteDatabasePath(path) {
  if (path instanceof URL) {
    if (path.protocol !== "file:") throw createSqliteInvalidUrlSchemeError();
    return normalizeSqliteDatabaseLocation(fileUrlToPath(String(path)));
  }
  if (typeof path === "string") {
    if (!path.includes("\0")) return normalizeSqliteDatabaseLocation(path);
    throw createSqliteInvalidPathError();
  }
  if (path instanceof Uint8Array) {
    if (!path.includes(0)) return normalizeSqliteDatabaseLocation(new TextDecoder().decode(path));
    throw createSqliteInvalidPathError();
  }
  throw createSqliteInvalidPathError();
}

function normalizeSqliteDatabaseLocation(path) {
  if (path === ":memory:") return null;
  return String(path).startsWith("/")
    ? normalizePath(String(path))
    : resolvePath("/workspace", String(path));
}

function validateSqliteDatabaseOptions(options) {
  if ((typeof options !== "object" && typeof options !== "function") || options === null) {
    throw createSqliteInvalidArgumentError('The "options" argument must be an object.');
  }
  for (const name of ["open", "readOnly", "enableForeignKeyConstraints", "allowExtension"]) {
    const value = options[name];
    if (value !== undefined && typeof value !== "boolean") {
      throw createSqliteInvalidArgumentError(`The "options.${name}" argument must be a boolean.`);
    }
  }
  return { open: options.open !== false };
}

function validateSqliteDatabaseOpen(state) {
  if (!state?.open) throw createSqliteInvalidStateError("database is not open");
}

function validateSqliteDatabaseStringArgument(name, value) {
  if (typeof value !== "string") {
    throw createSqliteInvalidArgumentError(`The "${name}" argument must be a string.`);
  }
}

function validateSqliteDatabaseUint8ArrayArgument(name, value) {
  if (!(value instanceof Uint8Array)) {
    throw createSqliteInvalidArgumentError(`The "${name}" argument must be a Uint8Array.`);
  }
}

function validateSqliteApplyChangesetOptions(options) {
  if (options === undefined) return;
  if ((typeof options !== "object" && typeof options !== "function") || options === null) {
    throw createSqliteInvalidArgumentError('The "options" argument must be an object.');
  }
  if ("filter" in options && typeof options.filter !== "function") {
    throw createSqliteInvalidArgumentError('The "options.filter" argument must be a function.');
  }
  if (options.onConflict !== undefined && typeof options.onConflict !== "function") {
    throw createSqliteInvalidArgumentError('The "options.onConflict" argument must be a function.');
  }
}

function validateSqliteBackupOptions(options) {
  if (options === undefined) return;
  if ((typeof options !== "object" && typeof options !== "function") || options === null) {
    throw createSqliteInvalidArgumentError('The "options" argument must be an object.');
  }
  if (options.rate !== undefined && !Number.isInteger(options.rate)) {
    throw createSqliteInvalidArgumentError('The "options.rate" argument must be an integer.');
  }
  if (options.progress !== undefined && typeof options.progress !== "function") {
    throw createSqliteInvalidArgumentError('The "options.progress" argument must be a function.');
  }
}

function createSqliteTagStoreGetter(name) {
  const getter = function sqliteTagStoreGetter() {
    return SQLITE_TAG_STORE_STATES.get(this)?.[name];
  };
  Object.defineProperty(getter, "name", {
    configurable: true,
    value: ""
  });
  return getter;
}

function createSqliteDatabaseGetter(implementation) {
  const descriptor = Object.getOwnPropertyDescriptor({
    get value() {
      return implementation.call(this);
    }
  }, "value");
  Object.defineProperty(descriptor.get, "name", {
    configurable: true,
    value: ""
  });
  return descriptor.get;
}

function sqliteTagStoreUnsupportedMethod(name) {
  return {
    [name]() {
      const state = SQLITE_TAG_STORE_STATES.get(this);
      validateSqliteDatabaseOpen(state?.databaseState);
      if (!Array.isArray(arguments[0])) {
        throw createSqliteInvalidArgumentError("First argument must be an array of strings (template literal).");
      }
      throw unsupportedCoreOperation("sqlite", `SQLTagStore.${name}`);
    }
  }[name];
}

function createSqliteInvalidPathError() {
  return createSqliteInvalidArgumentError('The "path" argument must be a string, Uint8Array, or URL without null bytes.');
}

function createSqliteInvalidUrlSchemeError() {
  const error = new TypeError("The URL must be of scheme file:");
  error.code = "ERR_INVALID_URL_SCHEME";
  return error;
}

function createSqliteInvalidArgumentError(message) {
  const error = new TypeError(message);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createSqliteInvalidStateError(message) {
  const error = new Error(message);
  error.code = "ERR_INVALID_STATE";
  return error;
}

const REPL_MODE_SLOPPY = Symbol("repl-sloppy");
const REPL_MODE_STRICT = Symbol("repl-strict");
const AsyncFunction = Object.getPrototypeOf(async function openContainersAsyncFunction() {}).constructor;

class Recoverable extends SyntaxError {
  constructor(error) {
    super();
    this.err = error;
  }
}

function defaultReplEval(code, context, _filename, callback) {
  const source = String(code ?? "");
  try {
    const keys = Object.keys(context ?? {});
    const values = keys.map((key) => context[key]);
    const declarationName = findReplDeclarationName(source);
    if (declarationName) {
      try {
        new Function(source);
      } catch (error) {
        callback(isRecoverableReplError(error, source) ? new Recoverable(error) : error);
        return;
      }
      const fn = new Function(...keys, `${source}\nreturn ${declarationName};`);
      context[declarationName] = fn(...values);
      callback(null, undefined);
      return;
    }
    const fn = new Function(...keys, `return eval(${JSON.stringify(source)});`);
    callback(null, fn(...values));
  } catch (error) {
    callback(isRecoverableReplError(error, source) ? new Recoverable(error) : error);
  }
}

function findReplDeclarationName(source) {
  const trimmed = String(source ?? "").trim();
  const match = trimmed.match(/^(?:(?:async\s+)?function(?:\s*\*)?|class|var|let|const)\s+([A-Za-z_$][\w$]*)\b/);
  return match?.[1] ?? null;
}

function isRecoverableReplError(error, source = "") {
  return error instanceof SyntaxError && (
    /Unexpected end of input/.test(error.message) ||
    isPotentiallyIncompleteReplSource(source)
  );
}

function isPotentiallyIncompleteReplSource(source) {
  const state = getReplDelimiterState(source);
  if (!state.invalidClose && state.openCount > 0) return true;
  return /(?:[+\-*/%&|^!~?:=<>.,]|\b(?:await|case|catch|class|do|else|finally|for|function|if|return|switch|throw|try|while|yield))\s*$/.test(String(source ?? ""));
}

function getReplDelimiterState(source) {
  const stack = [];
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  const input = String(source ?? "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index++;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      stack.push(char);
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      const open = stack.pop();
      if ((char === ")" && open !== "(") || (char === "]" && open !== "[") || (char === "}" && open !== "{")) {
        return { invalidClose: true, openCount: stack.length };
      }
    }
  }
  return { invalidClose: false, openCount: stack.length + (quote || blockComment ? 1 : 0) };
}

const REPL_WRITER_DEFAULT_OPTIONS = {
  showHidden: false,
  depth: 2,
  colors: false,
  customInspect: true,
  showProxy: true,
  maxArrayLength: 100,
  maxStringLength: 10000,
  breakLength: 80,
  compact: 3,
  sorted: false,
  getters: false,
  numericSeparator: false
};

function createDefaultReplWriter() {
  const defaultReplWriter = (value) => {
    return inspect(value, defaultReplWriter.options);
  };
  Object.defineProperty(defaultReplWriter, "options", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { ...REPL_WRITER_DEFAULT_OPTIONS }
  });
  Object.defineProperty(defaultReplWriter, "name", {
    configurable: true,
    value: "writer"
  });
  return defaultReplWriter;
}

function createDefaultReplCommands() {
  return {
    break: {
      help: "Sometimes you get stuck, this gets you out",
      action() {
        this.clearBufferedCommand();
        this.displayPrompt();
      }
    },
	    clear: {
	      help: "Break, and also clear the local context",
	      action() {
	        this.clearBufferedCommand();
	        if (!this.useGlobal) this.context = {};
	        this.output?.write?.("Clearing context...\n");
	        this.displayPrompt();
	      }
	    },
    exit: {
      help: "Exit the REPL",
      action() {
        this.close();
      }
    },
    help: {
      help: "Print this help message",
      action() {
        const lines = Object.keys(this.commands)
          .sort()
          .map((keyword) => `.${keyword}\t${this.commands[keyword].help ?? ""}`);
        this.output?.write?.(`${lines.join("\n")}\n`);
        this.displayPrompt();
      }
    },
    save: {
      help: "Save all evaluated commands in this REPL session to a file",
      action(filename = "") {
        this.output?.write?.(`.save is not available in this embedded REPL${filename ? `: ${filename}` : ""}\n`);
        this.displayPrompt();
      }
    },
    load: {
      help: "Load JS from a file into the REPL session",
      action(filename = "") {
        this.output?.write?.(`.load is not available in this embedded REPL${filename ? `: ${filename}` : ""}\n`);
        this.displayPrompt();
      }
    }
  };
}

function normalizeReplCommand(command) {
  if (typeof command === "function") {
    return { help: "", action: command };
  }
  if (!command || typeof command.action !== "function") {
    throw createInvalidArgTypeError("cmd.action", "function", command?.action);
  }
  return {
    ...command,
    help: command.help ?? "",
    action: command.action
  };
}

function isValidReplSyntax(code) {
  const source = String(code ?? "");
  try {
    new Function(source);
    return true;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }

  try {
    new AsyncFunction(source);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

function normalizeReplOptions(args, globals) {
  const [options, stream, evalFn, useGlobal, ignoreUndefined, replMode] = args;
  const normalized = typeof options === "string"
    ? {
        prompt: options,
        input: stream,
        output: stream,
        eval: evalFn,
        useGlobal,
        ignoreUndefined,
        replMode
    }
    : { ...(options ?? {}) };
  const useGlobalContext = Boolean(normalized.useGlobal);
  if (normalized.breakEvalOnSigint && normalized.eval !== undefined) {
    throw Object.assign(new TypeError('Cannot specify both "breakEvalOnSigint" and "eval" for REPL'), {
      code: "ERR_INVALID_REPL_EVAL_CONFIG"
    });
  }
  return {
    ...normalized,
    breakEvalOnSigint: Boolean(normalized.breakEvalOnSigint),
    context: useGlobalContext ? globals : (normalized.context ?? {}),
    ignoreUndefined: Boolean(normalized.ignoreUndefined),
    replMode: normalized.replMode ?? REPL_MODE_SLOPPY,
    terminal: Boolean(normalized.terminal),
    useColors: Boolean(normalized.useColors),
    useGlobal: useGlobalContext
  };
}

function createReplBuiltin({ globals }) {
  const defaultReplWriter = createDefaultReplWriter();
  function start(...args) {
    return new replBuiltin.REPLServer(...args);
  }

  const replBuiltin = {
    REPL_MODE_SLOPPY,
    REPL_MODE_STRICT,
    Recoverable,
    writer: defaultReplWriter,
    isValidSyntax: isValidReplSyntax,
    REPLServer: class REPLServer extends eventsBuiltin {
      constructor(...args) {
        const normalized = normalizeReplOptions(args, globals);
        super();
        this.input = normalized.input;
        this.output = normalized.output;
        this._prompt = normalized.prompt ?? "> ";
        this._initialPrompt = this._prompt;
        this.context = normalized.context;
        this.eval = normalized.eval ?? defaultReplEval;
        this.writer = normalized.writer ?? defaultReplWriter;
        this.completer = normalized.completer;
        this.useColors = normalized.useColors;
        this.useGlobal = normalized.useGlobal;
        this.terminal = normalized.terminal;
        this.ignoreUndefined = normalized.ignoreUndefined;
        this.replMode = normalized.replMode;
        this.breakEvalOnSigint = normalized.breakEvalOnSigint;
        this.commands = Object.assign(Object.create(null), createDefaultReplCommands());
        this.history = [];
        this.line = "";
	        this.closed = false;
	        this._inputBuffer = "";
	        this._bufferedCommand = "";
	        this._onInputData = (chunk) => handleReplInputData(this, chunk);
        this.input?.on?.("data", this._onInputData);
        this.displayPrompt();
      }

      setPrompt(prompt) {
        this._prompt = String(prompt);
      }

      defineCommand(keyword, command) {
        this.commands[String(keyword)] = normalizeReplCommand(command);
        return this;
      }

      displayPrompt(preserveCursor = false) {
        if (this.closed) return;
        if (!preserveCursor) this.output?.write?.(this._prompt);
      }

      createContext() {
        return {};
      }

      resetContext() {
        this.context = this.useGlobal ? globals : this.createContext();
        return this.context;
      }

      complete(line, callback) {
        const prefix = String(line ?? "");
        const commandMatches = Object.keys(this.commands)
          .map((keyword) => `.${keyword}`)
          .filter((keyword) => keyword.startsWith(prefix));
        const contextMatches = Object.keys(this.context ?? {})
          .filter((keyword) => keyword.startsWith(prefix));
        const matches = [...commandMatches, ...contextMatches].sort();
        const result = [matches.length ? matches : [prefix], prefix];
        if (typeof callback === "function") {
          callback(null, result);
          return;
        }
        return result;
      }

      completeOnEditorMode(line, callback) {
        return this.complete(line, callback);
      }

	      clearBufferedCommand() {
	        this.line = "";
	        this._bufferedCommand = "";
	        this._prompt = this._initialPrompt;
	        return this;
	      }

      _handleError(error) {
        handleReplError(this, error);
      }

      setupHistory(historyPath, callback) {
        this.historyPath = historyPath;
        if (typeof callback === "function") callback(null, this);
        return this;
      }

      close() {
        if (this.closed) return this;
        this.closed = true;
        this.input?.off?.("data", this._onInputData);
        this.input?.removeListener?.("data", this._onInputData);
        this.emit("exit");
        return this;
      }
    },
    start
  };

  Object.setPrototypeOf(replBuiltin.REPLServer.prototype, replInterfacePrototype);
  let replBuiltinModules = BUILTIN_MODULES.filter((name) => !name.startsWith("_") && !name.startsWith("node:"));
  const getReplBuiltinModules = () => replBuiltinModules;
  const setReplBuiltinModules = (value) => {
    replBuiltinModules = value;
  };
  Object.defineProperty(getReplBuiltinModules, "name", {
    configurable: true,
    value: ""
  });
  Object.defineProperty(setReplBuiltinModules, "name", {
    configurable: true,
    value: ""
  });
  Object.defineProperties(replBuiltin, {
    _builtinLibs: {
      configurable: true,
      get: getReplBuiltinModules,
      set: setReplBuiltinModules
    },
    builtinModules: {
      configurable: true,
      get: getReplBuiltinModules,
      set: setReplBuiltinModules
    }
  });
  Object.defineProperty(replBuiltin.REPLServer, "length", {
    configurable: true,
    value: 6
  });
  Object.defineProperty(replBuiltin.start, "length", {
    configurable: true,
    value: 6
  });
  Object.defineProperty(replBuiltin.isValidSyntax, "name", {
    configurable: true,
    value: "isValidSyntax"
  });
  reorderReplBuiltinProperties(replBuiltin);
  for (const [name, length] of Object.entries({
    complete: 0,
    completeOnEditorMode: 1,
    displayPrompt: 1,
    setupHistory: 0,
    prompt: 1
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(replBuiltin.REPLServer.prototype, name);
    if (descriptor?.value) {
      Object.defineProperty(descriptor.value, "length", { configurable: true, value: length });
    }
  }
  alignReplServerPrototypeMetadata(replBuiltin);
  return replBuiltin;
}

function replPrompt(preserveCursor = false) {
  this.displayPrompt(preserveCursor);
}

function handleReplInputData(server, chunk) {
  if (server.closed) return;
  server._inputBuffer += String(chunk);
  let newlineIndex = server._inputBuffer.search(/\r?\n/);
  while (newlineIndex !== -1) {
    const line = server._inputBuffer.slice(0, newlineIndex);
    server._inputBuffer = server._inputBuffer.slice(newlineIndex + (server._inputBuffer[newlineIndex] === "\r" && server._inputBuffer[newlineIndex + 1] === "\n" ? 2 : 1));
    evaluateReplLine(server, line);
    newlineIndex = server._inputBuffer.search(/\r?\n/);
  }
}

function evaluateReplLine(server, line) {
  const source = String(line ?? "");
  server.line = source;
  const trimmed = source.trim();
  if (!trimmed && !server._bufferedCommand) {
    server.displayPrompt();
    return;
  }

  if (trimmed.startsWith(".")) {
    const [, keyword = "", rest = ""] = trimmed.match(/^\.([^\s]+)(?:\s+(.*))?$/) ?? [];
    const command = server.commands[keyword];
    if (!command) {
      server.output?.write?.(`Invalid REPL keyword: ${trimmed}\n`);
      server.displayPrompt();
      return;
    }
    command.action.call(server, rest);
    return;
  }

  const evalSource = `${server._bufferedCommand}${source}\n`;
  server.eval(evalSource, server.context, "repl", (error, result) => {
    if (error) {
      if (error instanceof Recoverable) {
        server._bufferedCommand = evalSource;
        server._prompt = "| ";
        server.displayPrompt();
        return;
      }
      server.clearBufferedCommand();
      server._handleError(error);
    } else {
      if (server.terminal) server.history.push(evalSource.replace(/\n$/, ""));
      server.last = result;
      server.clearBufferedCommand();
      if (!(server.ignoreUndefined && result === undefined)) {
        server.output?.write?.(`${server.writer(result)}\n`);
      }
      server.displayPrompt();
    }
  });
}

function handleReplError(server, error) {
  server.lastError = error;
  server.output?.write?.(`${error?.stack ?? error}\n`);
  server.clearBufferedCommand();
  server.displayPrompt();
}

const replInterfacePrototype = Object.create(eventsBuiltin.prototype, {
  prompt: {
    configurable: true,
    writable: true,
    value: replPrompt
  }
});
Object.defineProperty(replPrompt, "length", {
  configurable: true,
  value: 1
});

function reorderReplBuiltinProperties(replBuiltin) {
  const descriptors = [
    "start",
    "writer",
    "REPLServer",
    "REPL_MODE_SLOPPY",
    "REPL_MODE_STRICT",
    "Recoverable",
    "isValidSyntax",
    "builtinModules",
    "_builtinLibs"
  ].map((name) => [name, Object.getOwnPropertyDescriptor(replBuiltin, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete replBuiltin[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(replBuiltin, name, descriptor);
  }
}

function alignReplServerPrototypeMetadata(replBuiltin) {
  const nativeOrder = [
    "constructor",
    "setupHistory",
    "clearBufferedCommand",
    "_handleError",
    "close",
    "createContext",
    "resetContext",
    "displayPrompt",
    "setPrompt",
    "complete",
    "completeOnEditorMode",
    "defineCommand"
  ];
  const descriptors = new Map(nativeOrder.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(replBuiltin.REPLServer.prototype, name)
  ]));
  for (const name of Object.getOwnPropertyNames(replBuiltin.REPLServer.prototype)) {
    delete replBuiltin.REPLServer.prototype[name];
  }
  for (const name of nativeOrder) {
    const descriptor = descriptors.get(name);
    if (descriptor) Object.defineProperty(replBuiltin.REPLServer.prototype, name, descriptor);
  }
}

const enabledTraceCategories = new Map();

class Tracing {
  #categories;
  #enabledCategories;
  #enabled = false;

  constructor({ categories, enabledCategories }) {
    this.#categories = categories;
    this.#enabledCategories = enabledCategories;
  }

  get categories() {
    return this.#categories;
  }

  get enabled() {
    return this.#enabled;
  }

  enable() {
    if (this.#enabled) return;
    this.#enabled = true;
    for (const category of this.#enabledCategories) {
      enabledTraceCategories.set(category, (enabledTraceCategories.get(category) ?? 0) + 1);
    }
  }

  disable() {
    if (!this.#enabled) return;
    this.#enabled = false;
    for (const category of this.#enabledCategories) {
      const count = (enabledTraceCategories.get(category) ?? 0) - 1;
      if (count > 0) enabledTraceCategories.set(category, count);
      else enabledTraceCategories.delete(category);
    }
  }
}

function createTracing(options) {
  if (!isPlainObjectLike(options)) {
    throw createTraceEventInvalidOptionsError(options);
  }
  return new Tracing(normalizeTraceCategories(options.categories));
}

const traceEventsBuiltin = {
  createTracing,
  getEnabledCategories: () => {
    const categories = [...enabledTraceCategories.keys()].sort();
    return categories.length ? categories.join(",") : undefined;
  }
};
reorderTraceEventsPrototype();
defineTraceEventsSymbolMetadata();

function reorderTraceEventsPrototype() {
  const descriptors = ["enable", "disable", "enabled", "categories"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(Tracing.prototype, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete Tracing.prototype[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(Tracing.prototype, name, descriptor);
  }
}

function defineTraceEventsSymbolMetadata() {
  const traceEventsCustomInspect = {
    [UTIL_INSPECT_CUSTOM](_depth, _options) {
      const escapedCategories = String(this.categories).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return `Tracing { enabled: ${this.enabled}, categories: '${escapedCategories}' }`;
    }
  }[UTIL_INSPECT_CUSTOM];
  Object.defineProperty(Tracing.prototype, UTIL_INSPECT_CUSTOM, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: traceEventsCustomInspect
  });
}

function createWasiBuiltin({ descriptor, kernel }) {
  const output = {
    stdin: descriptor?.stdin,
    stdout: descriptor?.stdout,
    stderr: descriptor?.stderr
  };
  class WASI {
    #started = false;
    #importNamespace = "wasi_snapshot_preview1";
    #returnOnExit = true;
    #procExitCode = 0;
    #memory = null;
    #importState = null;

    constructor(options) {
      if (options !== undefined && !isPlainObjectLike(options)) {
        throw createInvalidArgTypeError("options", "object", options);
      }

      const normalized = options ?? {};
      if (typeof normalized.version !== "string") {
        throw createInvalidWasiPropertyTypeError("options.version", "string", normalized.version);
      }
      if (normalized.version !== "preview1" && normalized.version !== "unstable") {
        const error = new TypeError(`The property 'options.version' unsupported WASI version. Received ${formatInvalidReceived(normalized.version)}`);
        error.code = "ERR_INVALID_ARG_VALUE";
        throw error;
      }
      if (normalized.args !== undefined && !Array.isArray(normalized.args)) {
        throw createInvalidWasiPropertyTypeError("options.args", "Array", normalized.args, { instance: true });
      }
      if (normalized.env !== undefined && !isPlainObjectLike(normalized.env)) {
        throw createInvalidWasiPropertyTypeError("options.env", "object", normalized.env);
      }
      if (normalized.preopens !== undefined && !isPlainObjectLike(normalized.preopens)) {
        throw createInvalidWasiPropertyTypeError("options.preopens", "object", normalized.preopens);
      }
      validateWasiBooleanOption("returnOnExit", normalized.returnOnExit);
      validateWasiFileDescriptorOption("stdin", normalized.stdin);
      validateWasiFileDescriptorOption("stdout", normalized.stdout);
      validateWasiFileDescriptorOption("stderr", normalized.stderr);

      this.#importNamespace = normalized.version === "unstable" ? "wasi_unstable" : "wasi_snapshot_preview1";
      this.#returnOnExit = normalized.returnOnExit ?? true;
      const preopens = normalizeWasiPreopens(normalized.preopens ?? {});
      this.#importState = {
        args: normalizeWasiStringArray(normalized.args ?? []),
        env: normalizeWasiEnv(normalized.env ?? {}),
        preopens,
        openFiles: new Map(),
        nextFd: preopens.length + 3,
        stdin: normalized.stdin ?? 0,
        stdinOffset: 0,
        stdout: normalized.stdout ?? 1,
        stderr: normalized.stderr ?? 2,
        output,
        kernel,
        getMemory: () => this.#memory,
        procExit: (exitCode) => this.#handleProcExit(exitCode)
      };
      this.wasiImport = createWasiImportObject(this.#importState);
    }

    getImportObject() {
      return {
        [this.#importNamespace]: this.wasiImport
      };
    }

    initialize(instance) {
      this.#assertNotStarted();
      const exports = validateWasiInstance(instance);
      if (exports._start !== undefined) {
        throw createInvalidWasiPropertyTypeError("instance.exports._start", "undefined", exports._start);
      }
      if (exports._initialize !== undefined && typeof exports._initialize !== "function") {
        throw createInvalidWasiPropertyTypeError("instance.exports._initialize", "function", exports._initialize);
      }
      this.#bindMemory(exports.memory);
      this.#started = true;
      if (typeof exports._initialize === "function") {
        exports._initialize();
      }
      return undefined;
    }

    finalizeBindings(instance) {
      this.#assertNotStarted();
      const exports = validateWasiInstance(instance);
      this.#bindMemory(exports.memory);
      this.#started = true;
      return undefined;
    }

    start(instance) {
      this.#assertNotStarted();
      const exports = validateWasiInstance(instance);
      if (typeof exports._start !== "function") {
        throw createInvalidWasiPropertyTypeError("instance.exports._start", "function", exports._start);
      }
      this.#bindMemory(exports.memory);
      this.#started = true;
      try {
        exports._start();
      } catch (error) {
        if (error === WASI_PROC_EXIT && this.#returnOnExit) {
          return this.#procExitCode;
        }
        throw error;
      }
      return 0;
    }

    #handleProcExit(exitCode) {
      this.#procExitCode = Number(exitCode) >>> 0;
      throw WASI_PROC_EXIT;
    }

    #bindMemory(memory) {
      this.#memory = memory;
    }

    #assertNotStarted() {
      if (!this.#started) return;
      const error = new Error("WASI instance has already started");
      error.code = "ERR_WASI_ALREADY_STARTED";
      throw error;
    }
  }
  const wasiBuiltin = { WASI };
  Object.defineProperty(wasiBuiltin.WASI, "length", {
    configurable: true,
    value: 0
  });
  reorderWasiPrototype(wasiBuiltin.WASI);
  return wasiBuiltin;
}

function reorderWasiPrototype(WASI) {
  const descriptors = ["finalizeBindings", "start", "initialize", "getImportObject"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(WASI.prototype, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete WASI.prototype[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(WASI.prototype, name, descriptor);
  }
}

function parseV8SerializerBuffer(buffer) {
  const parsed = JSON.parse(RuntimeBuffer.from(buffer).toString("utf8"));
  if (parsed?.__openContainersV8Serializer === 1 && Array.isArray(parsed.entries)) {
    return parsed;
  }
  return {
    __openContainersV8Serializer: 1,
    entries: [
      { type: "header" },
      { type: "value", value: parsed }
    ]
  };
}

function createNotBuildingSnapshotError() {
  const error = new Error("Operation cannot be invoked when not building startup snapshot");
  error.code = "ERR_NOT_BUILDING_SNAPSHOT";
  return error;
}

function encodeV8SerializedValue(value, seen) {
  if (value === undefined) return { __ocV8Type: "undefined" };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return encodeV8Number(value);
  if (typeof value === "bigint") return { __ocV8Type: "bigint", value: value.toString() };
  if (typeof value === "function" || typeof value === "symbol") {
    throw new Error(`${String(value)} could not be cloned.`);
  }
  if (hasSharedArrayBufferBrand(value)) {
    throw new Error("#<SharedArrayBuffer> could not be cloned.");
  }

  if (seen.has(value)) return { __ocV8Ref: seen.get(value) };
  const id = seen.size;
  seen.set(value, id);

  if (value instanceof Date) return { __ocV8Type: "Date", id, value: value.toISOString() };
  if (value instanceof RegExp) return { __ocV8Type: "RegExp", id, source: value.source, flags: value.flags };
  if (value instanceof ArrayBuffer) {
    return { __ocV8Type: "ArrayBuffer", id, data: RuntimeBuffer.from(value).toString("base64") };
  }
  if (ArrayBuffer.isView(value)) {
    return encodeV8ArrayBufferView(value, id);
  }
  if (value instanceof Map) {
    return {
      __ocV8Type: "Map",
      id,
      entries: [...value.entries()].map(([key, entryValue]) => [
        encodeV8SerializedValue(key, seen),
        encodeV8SerializedValue(entryValue, seen)
      ])
    };
  }
  if (value instanceof Set) {
    return {
      __ocV8Type: "Set",
      id,
      values: [...value.values()].map(entryValue => encodeV8SerializedValue(entryValue, seen))
    };
  }
  if (value instanceof Error) {
    return {
      __ocV8Type: "Error",
      id,
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (Array.isArray(value)) {
    return {
      __ocV8Type: "Array",
      id,
      values: value.map(entryValue => encodeV8SerializedValue(entryValue, seen))
    };
  }

  return {
    __ocV8Type: "Object",
    id,
    properties: Object.entries(value).map(([key, entryValue]) => [
      key,
      encodeV8SerializedValue(entryValue, seen)
    ])
  };
}

function encodeV8Number(value) {
  if (Number.isNaN(value)) return { __ocV8Type: "Number", value: "NaN" };
  if (value === Infinity) return { __ocV8Type: "Number", value: "Infinity" };
  if (value === -Infinity) return { __ocV8Type: "Number", value: "-Infinity" };
  if (Object.is(value, -0)) return { __ocV8Type: "Number", value: "-0" };
  return value;
}

function encodeV8ArrayBufferView(value, id) {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const constructorName = value.constructor?.name ?? "Uint8Array";
  return {
    __ocV8Type: constructorName === "OpenContainersBuffer" || constructorName === "Buffer" ? "Buffer" : constructorName,
    id,
    data: RuntimeBuffer.from(bytes).toString("base64"),
    byteOffset: 0,
    byteLength: value.byteLength
  };
}

function decodeV8SerializedValue(node, refs) {
  if (node === null || typeof node === "string" || typeof node === "boolean") return node;
  if (typeof node === "number") return node;
  if (!node || typeof node !== "object") return node;
  if (Object.prototype.hasOwnProperty.call(node, "__ocV8Ref")) return refs[node.__ocV8Ref];

  switch (node.__ocV8Type) {
    case "undefined":
      return undefined;
    case "Number":
      return decodeV8Number(node.value);
    case "bigint":
      return BigInt(node.value);
    case "Date": {
      const value = new Date(node.value);
      refs[node.id] = value;
      return value;
    }
    case "RegExp": {
      const value = new RegExp(node.source, node.flags);
      refs[node.id] = value;
      return value;
    }
    case "ArrayBuffer": {
      const bytes = RuntimeBuffer.from(node.data, "base64");
      const value = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      refs[node.id] = value;
      return value;
    }
    case "Buffer": {
      const value = RuntimeBuffer.from(node.data, "base64");
      refs[node.id] = value;
      return value;
    }
    case "DataView": {
      const bytes = RuntimeBuffer.from(node.data, "base64");
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const value = new DataView(buffer);
      refs[node.id] = value;
      return value;
    }
    case "Int8Array":
    case "Uint8Array":
    case "Uint8ClampedArray":
    case "Int16Array":
    case "Uint16Array":
    case "Int32Array":
    case "Uint32Array":
    case "Float32Array":
    case "Float64Array":
    case "BigInt64Array":
    case "BigUint64Array":
      return decodeV8TypedArray(node, refs);
    case "Map": {
      const value = new Map();
      refs[node.id] = value;
      for (const [key, entryValue] of node.entries) {
        value.set(decodeV8SerializedValue(key, refs), decodeV8SerializedValue(entryValue, refs));
      }
      return value;
    }
    case "Set": {
      const value = new Set();
      refs[node.id] = value;
      for (const entryValue of node.values) value.add(decodeV8SerializedValue(entryValue, refs));
      return value;
    }
    case "Error": {
      const ErrorCtor = globalThis[node.name] instanceof Function ? globalThis[node.name] : Error;
      const value = new ErrorCtor(node.message);
      value.name = node.name;
      if (node.stack) value.stack = node.stack;
      refs[node.id] = value;
      return value;
    }
    case "Array": {
      const value = [];
      refs[node.id] = value;
      value.push(...node.values.map(entryValue => decodeV8SerializedValue(entryValue, refs)));
      return value;
    }
    case "Object": {
      const value = {};
      refs[node.id] = value;
      for (const [key, entryValue] of node.properties) value[key] = decodeV8SerializedValue(entryValue, refs);
      return value;
    }
    default:
      return node;
  }
}

function decodeV8Number(value) {
  if (value === "NaN") return NaN;
  if (value === "Infinity") return Infinity;
  if (value === "-Infinity") return -Infinity;
  if (value === "-0") return -0;
  return Number(value);
}

function decodeV8TypedArray(node, refs) {
  const bytes = RuntimeBuffer.from(node.data, "base64");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const Constructor = globalThis[node.__ocV8Type];
  const value = new Constructor(buffer);
  refs[node.id] = value;
  return value;
}
function unsupportedCoreOperation(moduleName, operation) {
  return Object.assign(new Error(`node:${moduleName} ${operation} is not supported in OpenContainers V1`), {
    code: `ERR_OPENCONTAINERS_${moduleName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_UNSUPPORTED`
  });
}

function isPlainObjectLike(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createInvalidWasiPropertyTypeError(name, expected, value, options = {}) {
  const expectedText = options.instance ? `an instance of ${expected}` : `of type ${expected}`;
  const error = new TypeError(`The "${name}" property must be ${expectedText}. Received ${describeReceived(value)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  return error;
}

function createWasiNotStartedError() {
  const error = new Error("wasi.start() has not been called");
  error.code = "ERR_WASI_NOT_STARTED";
  return error;
}

const WASI_FILE_DESCRIPTOR_MAX = 2147483647;

function validateWasiBooleanOption(name, value) {
  if (value !== undefined && typeof value !== "boolean") {
    throw createInvalidWasiPropertyTypeError(`options.${name}`, "boolean", value);
  }
}

function validateWasiFileDescriptorOption(name, value) {
  if (value === undefined) return;
  if (typeof value !== "number") {
    throw createInvalidWasiPropertyTypeError(`options.${name}`, "number", value);
  }
  if (!Number.isInteger(value)) {
    const error = new RangeError(`The value of "options.${name}" is out of range. It must be an integer. Received ${value}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  if (value < 0 || value > WASI_FILE_DESCRIPTOR_MAX) {
    const error = new RangeError(`The value of "options.${name}" is out of range. It must be >= 0 && <= ${WASI_FILE_DESCRIPTOR_MAX}. Received ${value}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
}

function normalizeWasiStringArray(value) {
  return Array.from(value, (entry) => String(entry));
}

function normalizeWasiEnv(value) {
  return Object.entries(value).map(([key, entry]) => `${String(key)}=${String(entry)}`);
}

function normalizeWasiPreopens(value) {
  return Object.entries(value).map(([path, target], index) => ({
    fd: index + 3,
    path: String(path),
    root: normalizePath(String(target))
  }));
}

function validateWasiInstance(instance) {
  if ((typeof instance !== "object" && typeof instance !== "function") || instance === null) {
    throw createInvalidArgTypeError("instance", "object", instance);
  }
  if ((typeof instance.exports !== "object" && typeof instance.exports !== "function") || instance.exports === null) {
    throw createInvalidArgTypeError("instance.exports", "object", instance.exports);
  }
  const Memory = globalThis.WebAssembly?.Memory;
  if (typeof Memory !== "function" || !(instance.exports.memory instanceof Memory)) {
    throw createInvalidWasiPropertyTypeError("instance.exports.memory", "WebAssembly.Memory", instance.exports.memory, { instance: true });
  }
  return instance.exports;
}

const WASI_ESUCCESS = 0;
const WASI_EACCES = 2;
const WASI_EBADF = 8;
const WASI_EINVAL = 28;
const WASI_EISDIR = 31;
const WASI_ENOENT = 44;
const WASI_ENOTCAPABLE = 76;
const WASI_ENOTDIR = 54;
const WASI_ENAMETOOLONG = 42;
const WASI_EMEMORY = 61;
const WASI_ENOSYS = 52;
const WASI_PROC_EXIT = Symbol("kExitCode");

const WASI_IMPORT_NAMES = [
  "args_get",
  "args_sizes_get",
  "clock_res_get",
  "clock_time_get",
  "environ_get",
  "environ_sizes_get",
  "fd_advise",
  "fd_allocate",
  "fd_close",
  "fd_datasync",
  "fd_fdstat_get",
  "fd_fdstat_set_flags",
  "fd_fdstat_set_rights",
  "fd_filestat_get",
  "fd_filestat_set_size",
  "fd_filestat_set_times",
  "fd_pread",
  "fd_prestat_get",
  "fd_prestat_dir_name",
  "fd_pwrite",
  "fd_read",
  "fd_readdir",
  "fd_renumber",
  "fd_seek",
  "fd_sync",
  "fd_tell",
  "fd_write",
  "path_create_directory",
  "path_filestat_get",
  "path_filestat_set_times",
  "path_link",
  "path_open",
  "path_readlink",
  "path_remove_directory",
  "path_rename",
  "path_symlink",
  "path_unlink_file",
  "poll_oneoff",
  "proc_exit",
  "proc_raise",
  "random_get",
  "sched_yield",
  "sock_accept",
  "sock_recv",
  "sock_send",
  "sock_shutdown"
];

const WASI_IMPORT_METADATA = Object.freeze({
  args_get: [2, "bound args_get"],
  args_sizes_get: [2, "bound args_sizes_get"],
  clock_res_get: [2, "bound clock_res_get"],
  clock_time_get: [3, "bound clock_time_get"],
  environ_get: [2, "bound environ_get"],
  environ_sizes_get: [2, "bound environ_sizes_get"],
  fd_advise: [4, "bound fd_advise"],
  fd_allocate: [3, "bound fd_allocate"],
  fd_close: [1, "bound fd_close"],
  fd_datasync: [1, "bound fd_datasync"],
  fd_fdstat_get: [2, "bound fd_fdstat_get"],
  fd_fdstat_set_flags: [2, "bound fd_fdstat_set_flags"],
  fd_fdstat_set_rights: [3, "bound fd_fdstat_set_rights"],
  fd_filestat_get: [2, "bound fd_filestat_get"],
  fd_filestat_set_size: [2, "bound fd_filestat_set_size"],
  fd_filestat_set_times: [4, "bound fd_filestat_set_times"],
  fd_pread: [5, "bound fd_pread"],
  fd_prestat_get: [2, "bound fd_prestat_get"],
  fd_prestat_dir_name: [3, "bound fd_prestat_dir_name"],
  fd_pwrite: [5, "bound fd_pwrite"],
  fd_read: [4, "bound fd_read"],
  fd_readdir: [5, "bound fd_readdir"],
  fd_renumber: [2, "bound fd_renumber"],
  fd_seek: [4, "bound fd_seek"],
  fd_sync: [1, "bound fd_sync"],
  fd_tell: [2, "bound fd_tell"],
  fd_write: [4, "bound fd_write"],
  path_create_directory: [3, "bound path_create_directory"],
  path_filestat_get: [5, "bound path_filestat_get"],
  path_filestat_set_times: [7, "bound path_filestat_set_times"],
  path_link: [7, "bound path_link"],
  path_open: [9, "bound path_open"],
  path_readlink: [6, "bound path_readlink"],
  path_remove_directory: [3, "bound path_remove_directory"],
  path_rename: [6, "bound path_rename"],
  path_symlink: [5, "bound path_symlink"],
  path_unlink_file: [3, "bound path_unlink_file"],
  poll_oneoff: [4, "bound poll_oneoff"],
  proc_exit: [1, "bound wasiReturnOnProcExit"],
  proc_raise: [1, "bound proc_raise"],
  random_get: [2, "bound random_get"],
  sched_yield: [0, "bound sched_yield"],
  sock_accept: [3, "bound sock_accept"],
  sock_recv: [6, "bound sock_recv"],
  sock_send: [5, "bound sock_send"],
  sock_shutdown: [2, "bound sock_shutdown"]
});

const WASI_IMPORT_PROTOTYPE = createWasiImportPrototype();

function createWasiImportObject(state) {
  const wasiImport = Object.create(WASI_IMPORT_PROTOTYPE);
  for (const name of WASI_IMPORT_NAMES) {
    wasiImport[name] = createWasiImportStub(name, state);
  }
  return wasiImport;
}

function createWasiImportPrototype() {
  const prototype = {};
  for (const name of WASI_IMPORT_NAMES) {
    prototype[name] = createWasiImportPrototypeStub(name);
  }
  function constructor() {}
  Object.defineProperty(constructor, "name", {
    configurable: true,
    value: "WASI"
  });
  Object.defineProperty(constructor, "length", {
    configurable: true,
    value: 0
  });
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: constructor
  });
  return prototype;
}

function createWasiImportPrototypeStub(importName) {
  const [length] = WASI_IMPORT_METADATA[importName] ?? [0];
  const stub = () => WASI_ENOSYS;
  Object.defineProperty(stub, "length", {
    configurable: true,
    value: length
  });
  Object.defineProperty(stub, "name", {
    configurable: true,
    value: importName
  });
  return stub;
}

function createWasiImportStub(importName, state) {
  const [length, functionName] = WASI_IMPORT_METADATA[importName] ?? [0, `bound ${importName}`];
  const stub = (...args) => {
    if (importName === "proc_exit" && typeof state?.procExit === "function") {
      return state.procExit(args[0]);
    }
    if (!state?.getMemory?.()) {
      throw createWasiNotStartedError();
    }
    switch (importName) {
      case "args_sizes_get":
        return wasiWriteStringVectorSizes(state, state.args, args[0], args[1]);
      case "args_get":
        return wasiWriteStringVector(state, state.args, args[0], args[1]);
      case "environ_sizes_get":
        return wasiWriteStringVectorSizes(state, state.env, args[0], args[1]);
      case "environ_get":
        return wasiWriteStringVector(state, state.env, args[0], args[1]);
      case "clock_res_get":
        return wasiClockResGet(state, args[0], args[1]);
      case "clock_time_get":
        return wasiClockTimeGet(state, args[0], args[1], args[2]);
      case "random_get":
        return wasiRandomGet(state, args[0], args[1]);
      case "sched_yield":
        return WASI_ESUCCESS;
      case "fd_fdstat_get":
        return wasiFdFdstatGet(state, args[0], args[1]);
      case "fd_close":
        return wasiFdClose(state, args[0]);
      case "fd_read":
        return wasiFdRead(state, args[0], args[1], args[2], args[3]);
      case "fd_prestat_get":
        return wasiFdPrestatGet(state, args[0], args[1]);
      case "fd_prestat_dir_name":
        return wasiFdPrestatDirName(state, args[0], args[1], args[2]);
      case "fd_write":
        return wasiFdWrite(state, args[0], args[1], args[2], args[3]);
      case "path_open":
        return wasiPathOpen(state, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8]);
      case "sock_send":
        return WASI_EINVAL;
      default:
        return WASI_ENOSYS;
    }
  };
  Object.defineProperty(stub, "length", {
    configurable: true,
    value: length
  });
  Object.defineProperty(stub, "name", {
    configurable: true,
    value: functionName
  });
  return stub;
}

function getWasiMemoryView(state) {
  const memory = state?.getMemory?.();
  if (!memory?.buffer) throw createWasiNotStartedError();
  return new DataView(memory.buffer);
}

function getWasiMemoryBytes(state) {
  const memory = state?.getMemory?.();
  if (!memory?.buffer) throw createWasiNotStartedError();
  return new Uint8Array(memory.buffer);
}

function wasiWriteStringVectorSizes(state, values, countPtr, byteSizePtr) {
  const view = getWasiMemoryView(state);
  if (!view) return WASI_ENOSYS;
  try {
    const countOffset = toWasiPointer(countPtr);
    const byteSizeOffset = toWasiPointer(byteSizePtr);
    if (!isWasiRangeInBounds(view.byteLength, countOffset, 4) || !isWasiRangeInBounds(view.byteLength, byteSizeOffset, 4)) {
      return WASI_EMEMORY;
    }
    view.setUint32(countOffset, values.length, true);
    view.setUint32(byteSizeOffset, encodedWasiByteLength(values), true);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function wasiWriteStringVector(state, values, vectorPtr, dataPtr) {
  const view = getWasiMemoryView(state);
  const bytes = getWasiMemoryBytes(state);
  if (!view || !bytes) return WASI_ENOSYS;
  try {
    let offset = toWasiPointer(dataPtr);
    let pointerOffset = toWasiPointer(vectorPtr);
    const entries = values.map((value) => textEncoder.encode(value));
    for (const encoded of entries) {
      if (!isWasiRangeInBounds(view.byteLength, pointerOffset, 4) || !isWasiRangeInBounds(bytes.byteLength, offset, encoded.byteLength + 1)) {
        return WASI_EMEMORY;
      }
      pointerOffset += 4;
      offset += encoded.byteLength + 1;
    }
    offset = toWasiPointer(dataPtr);
    pointerOffset = toWasiPointer(vectorPtr);
    for (const encoded of entries) {
      view.setUint32(pointerOffset, offset, true);
      bytes.set(encoded, offset);
      bytes[offset + encoded.byteLength] = 0;
      pointerOffset += 4;
      offset += encoded.byteLength + 1;
    }
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function encodedWasiByteLength(values) {
  let total = 0;
  for (const value of values) total += textEncoder.encode(value).byteLength + 1;
  return total;
}

function wasiClockResGet(state, clockId, resolutionPtr) {
  if (!isValidWasiClockId(clockId)) return WASI_EINVAL;
  return wasiWriteUint64(state, resolutionPtr, 1_000_000n);
}

function wasiClockTimeGet(state, clockId, precision, timePtr) {
  if (!isValidWasiClockId(clockId) || typeof precision !== "bigint") return WASI_EINVAL;
  const now = Number(clockId) === 0
    ? BigInt(Date.now()) * 1_000_000n
    : BigInt(Math.floor((globalThis.performance?.now?.() ?? Date.now()) * 1_000_000));
  return wasiWriteUint64(state, timePtr, now);
}

function wasiWriteUint64(state, pointer, value) {
  const view = getWasiMemoryView(state);
  try {
    const offset = toWasiPointer(pointer);
    if (!isWasiRangeInBounds(view.byteLength, offset, 8)) return WASI_EMEMORY;
    view.setBigUint64(offset, BigInt(value), true);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function wasiRandomGet(state, bufferPtr, length) {
  const bytes = getWasiMemoryBytes(state);
  try {
    const start = toWasiPointer(bufferPtr);
    const byteLength = toWasiPointer(length);
    if (!isWasiRangeInBounds(bytes.byteLength, start, byteLength)) return WASI_EMEMORY;
    const target = bytes.subarray(start, start + byteLength);
    fillWasiRandomBytes(target);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function fillWasiRandomBytes(target) {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    for (let offset = 0; offset < target.byteLength; offset += 65536) {
      crypto.getRandomValues(target.subarray(offset, Math.min(target.byteLength, offset + 65536)));
    }
    return;
  }
  for (let index = 0; index < target.byteLength; index += 1) {
    target[index] = Math.floor(Math.random() * 256);
  }
}

const WASI_FDSTAT_SIZE = 24;
const WASI_FILETYPE_DIRECTORY = 3;
const WASI_FILETYPE_REGULAR_FILE = 4;
const WASI_FILETYPE_SOCKET_STREAM = 6;
const WASI_STDIO_INPUT_RIGHTS_BASE = 0x08e001ffn;
const WASI_STDIO_OUTPUT_RIGHTS_BASE = 0x3820004an;
const WASI_STDIO_OUTPUT_RIGHTS_INHERITING = 0x3fffffffn;
const WASI_PREOPEN_RIGHTS_BASE = 0x0fbffe98n;
const WASI_PREOPEN_RIGHTS_INHERITING = 0x0fffffffn;
const WASI_FILE_READ_RIGHTS_BASE = 0x00200026n;

function wasiFdFdstatGet(state, fd, statPtr) {
  const numericFd = normalizeWasiFdValue(fd);
  if (numericFd === null) return WASI_EINVAL;
  const kind = resolveWasiFdstatKind(state, numericFd);
  if (!kind) return WASI_EBADF;
  const view = getWasiMemoryView(state);
  try {
    const offset = toWasiPointer(statPtr);
    if (!isWasiRangeInBounds(view.byteLength, offset, WASI_FDSTAT_SIZE)) return WASI_EMEMORY;
    switch (kind) {
      case "stdin":
        writeWasiFdstat(view, offset, WASI_FILETYPE_REGULAR_FILE, 0, WASI_STDIO_INPUT_RIGHTS_BASE, 0n);
        break;
      case "file":
        writeWasiFdstat(view, offset, WASI_FILETYPE_REGULAR_FILE, 0, WASI_FILE_READ_RIGHTS_BASE, 0n);
        break;
      case "stdout":
      case "stderr":
        writeWasiFdstat(view, offset, WASI_FILETYPE_SOCKET_STREAM, 5, WASI_STDIO_OUTPUT_RIGHTS_BASE, WASI_STDIO_OUTPUT_RIGHTS_INHERITING);
        break;
      case "preopen":
        writeWasiFdstat(view, offset, WASI_FILETYPE_DIRECTORY, 0, WASI_PREOPEN_RIGHTS_BASE, WASI_PREOPEN_RIGHTS_INHERITING);
        break;
      default:
        return WASI_EBADF;
    }
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function writeWasiFdstat(view, offset, fileType, flags, rightsBase, rightsInheriting) {
  view.setUint8(offset, fileType);
  view.setUint16(offset + 2, flags, true);
  view.setBigUint64(offset + 8, rightsBase, true);
  view.setBigUint64(offset + 16, rightsInheriting, true);
}

function resolveWasiFdstatKind(state, numericFd) {
  if (numericFd === state?.stdin) return "stdin";
  if (numericFd === state?.stdout) return "stdout";
  if (numericFd === state?.stderr) return "stderr";
  if (resolveWasiPreopen(state, numericFd)) return "preopen";
  if (resolveWasiOpenFile(state, numericFd)) return "file";
  return null;
}

function normalizeWasiFdValue(fd) {
  return typeof fd === "number" && Number.isInteger(fd) && fd >= 0 && fd <= 0xffffffff ? fd : null;
}

function wasiFdRead(state, fd, iovsPtr, iovsLength, bytesReadPtr) {
  const bytes = getWasiMemoryBytes(state);
  const view = getWasiMemoryView(state);
  const source = resolveWasiReadSource(state, fd);
  if (!source) return WASI_EBADF;
  try {
    const input = source.toBuffer?.() ?? RuntimeBuffer.from(source.toString?.() ?? "");
    let read = 0;
    const count = toWasiPointer(iovsLength);
    let offset = toWasiPointer(iovsPtr);
    const readOffset = toWasiPointer(bytesReadPtr);
    if (!isWasiRangeInBounds(view.byteLength, offset, count * 8)) return WASI_EMEMORY;
    if (!isWasiRangeInBounds(view.byteLength, readOffset, 4)) return WASI_EMEMORY;
    for (let index = 0; index < count; index += 1) {
      const pointer = view.getUint32(offset, true);
      const length = view.getUint32(offset + 4, true);
      if (!isWasiRangeInBounds(bytes.byteLength, pointer, length)) return WASI_EMEMORY;
      const sourceOffset = source.getOffset();
      const available = Math.max(0, input.byteLength - sourceOffset);
      const chunkLength = Math.min(length, available);
      if (chunkLength > 0) {
        bytes.set(input.subarray(sourceOffset, sourceOffset + chunkLength), pointer);
        source.setOffset(sourceOffset + chunkLength);
        read += chunkLength;
      }
      offset += 8;
      if (chunkLength < length) break;
    }
    view.setUint32(readOffset, read, true);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function wasiFdClose(state, fd) {
  const numericFd = normalizeWasiFdValue(fd);
  if (numericFd === null) return WASI_EINVAL;
  if (!resolveWasiOpenFile(state, numericFd)) return WASI_EBADF;
  state.openFiles.delete(numericFd);
  return WASI_ESUCCESS;
}

function wasiFdPrestatGet(state, fd, prestatPtr) {
  const preopen = resolveWasiPreopen(state, fd);
  if (!preopen) return isWasiStdioFd(state, fd) ? WASI_EINVAL : WASI_EBADF;
  const view = getWasiMemoryView(state);
  try {
    const offset = toWasiPointer(prestatPtr);
    if (!isWasiRangeInBounds(view.byteLength, offset, 8)) return WASI_EMEMORY;
    view.setUint8(offset, 0);
    view.setUint8(offset + 1, 0);
    view.setUint8(offset + 2, 0);
    view.setUint8(offset + 3, 0);
    view.setUint32(offset + 4, textEncoder.encode(preopen.path).byteLength, true);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function wasiFdPrestatDirName(state, fd, pathPtr, pathLength) {
  const preopen = resolveWasiPreopen(state, fd);
  if (!preopen) return isWasiStdioFd(state, fd) ? WASI_EINVAL : WASI_EBADF;
  const bytes = getWasiMemoryBytes(state);
  try {
    const offset = toWasiPointer(pathPtr);
    const length = toWasiPointer(pathLength);
    const encoded = textEncoder.encode(preopen.path);
    if (length < encoded.byteLength) return WASI_ENAMETOOLONG;
    if (!isWasiRangeInBounds(bytes.byteLength, offset, encoded.byteLength)) return WASI_EMEMORY;
    bytes.set(encoded, offset);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function wasiFdWrite(state, fd, iovsPtr, iovsLength, bytesWrittenPtr) {
  const bytes = getWasiMemoryBytes(state);
  const view = getWasiMemoryView(state);
  const stream = resolveWasiWriteStream(state, fd);
  if (!stream) return WASI_EBADF;
  try {
    let written = 0;
    const chunks = [];
    const count = toWasiPointer(iovsLength);
    let offset = toWasiPointer(iovsPtr);
    if (!isWasiRangeInBounds(view.byteLength, offset, count * 8)) return WASI_EMEMORY;
    for (let index = 0; index < count; index += 1) {
      const pointer = view.getUint32(offset, true);
      const length = view.getUint32(offset + 4, true);
      if (!isWasiRangeInBounds(bytes.byteLength, pointer, length)) return WASI_EMEMORY;
      const chunk = bytes.subarray(pointer, pointer + length);
      chunks.push(chunk);
      written += length;
      offset += 8;
    }
    const writtenOffset = toWasiPointer(bytesWrittenPtr);
    if (!isWasiRangeInBounds(view.byteLength, writtenOffset, 4)) return WASI_EMEMORY;
    if (chunks.length) {
      stream.write(RuntimeBuffer.concat(chunks.map((chunk) => RuntimeBuffer.from(chunk))));
    }
    view.setUint32(writtenOffset, written, true);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function wasiPathOpen(state, dirfd, _dirflags, pathPtr, pathLength, oflags, _rightsBase, _rightsInheriting, _fdflags, openedFdPtr) {
  const preopen = resolveWasiPreopen(state, dirfd);
  if (!preopen) return isWasiStdioFd(state, dirfd) ? WASI_ENOTCAPABLE : WASI_EBADF;
  const bytes = getWasiMemoryBytes(state);
  const view = getWasiMemoryView(state);
  try {
    const pathOffset = toWasiPointer(pathPtr);
    const byteLength = toWasiPointer(pathLength);
    const openedFdOffset = toWasiPointer(openedFdPtr);
    if (!isWasiRangeInBounds(bytes.byteLength, pathOffset, byteLength)) return WASI_EMEMORY;
    if (!isWasiRangeInBounds(view.byteLength, openedFdOffset, 4)) return WASI_EMEMORY;
    if (Number(oflags) !== 0) return WASI_ENOSYS;
    const pathText = textDecoder.decode(bytes.subarray(pathOffset, pathOffset + byteLength));
    const resolved = resolveWasiPreopenTarget(preopen, pathText);
    if (resolved.error) return resolved.error;
    if (typeof state.kernel?.fs?.readFileSync !== "function") return WASI_ENOSYS;
    let data;
    try {
      data = state.kernel?.fs?.readFileSync(resolved.path);
    } catch (error) {
      return mapWasiFileSystemError(error);
    }
    const fd = allocateWasiFileDescriptor(state, {
      path: resolved.path,
      data: RuntimeBuffer.from(data),
      offset: 0
    });
    view.setUint32(openedFdOffset, fd, true);
    return WASI_ESUCCESS;
  } catch {
    return WASI_EMEMORY;
  }
}

function resolveWasiPreopenTarget(preopen, pathText) {
  if (typeof pathText !== "string" || pathText.startsWith("/")) return { error: WASI_EINVAL };
  const relative = normalizePath(pathText || ".");
  const target = joinPath(preopen.root, relative);
  if (!isInsidePath(preopen.root, target)) return { error: WASI_ENOTCAPABLE };
  return { path: target };
}

function allocateWasiFileDescriptor(state, file) {
  let fd = state.nextFd;
  while (isWasiStdioFd(state, fd) || resolveWasiPreopen(state, fd) || state.openFiles.has(fd)) fd += 1;
  state.nextFd = fd + 1;
  state.openFiles.set(fd, file);
  return fd;
}

function mapWasiFileSystemError(error) {
  switch (error?.code) {
    case "ENOENT":
      return WASI_ENOENT;
    case "EISDIR":
      return WASI_EISDIR;
    case "ENOTDIR":
      return WASI_ENOTDIR;
    case "EACCES":
    case "EPERM":
      return WASI_EACCES;
    default:
      return WASI_EINVAL;
  }
}

function resolveWasiReadSource(state, fd) {
  const numericFd = Number(fd);
  if (numericFd === state?.stdin) {
    const stream = state.output?.stdin;
    if (!stream) return null;
    return {
      toBuffer: () => stream.toBuffer?.() ?? RuntimeBuffer.from(stream.toString?.() ?? ""),
      getOffset: () => state.stdinOffset,
      setOffset: (offset) => { state.stdinOffset = offset; }
    };
  }
  const file = resolveWasiOpenFile(state, numericFd);
  if (file) {
    return {
      toBuffer: () => file.data,
      getOffset: () => file.offset,
      setOffset: (offset) => { file.offset = offset; }
    };
  }
  return null;
}

function resolveWasiOpenFile(state, fd) {
  const numericFd = Number(fd);
  return state?.openFiles?.get(numericFd) ?? null;
}

function resolveWasiPreopen(state, fd) {
  const numericFd = Number(fd);
  return state?.preopens?.find((entry) => entry.fd === numericFd) ?? null;
}

function isWasiStdioFd(state, fd) {
  const numericFd = Number(fd);
  return numericFd === state?.stdin || numericFd === state?.stdout || numericFd === state?.stderr;
}

function resolveWasiWriteStream(state, fd) {
  const numericFd = Number(fd);
  if (numericFd === state?.stdout) return state.output?.stdout;
  if (numericFd === state?.stderr) return state.output?.stderr;
  return null;
}

function toWasiPointer(value) {
  return Number(value) >>> 0;
}

function isValidWasiClockId(clockId) {
  const value = Number(clockId);
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function isWasiRangeInBounds(byteLength, offset, size) {
  return Number.isInteger(offset) && Number.isInteger(size) && offset >= 0 && size >= 0 && offset < byteLength && offset + size <= byteLength;
}

function normalizeTraceCategories(categories) {
  if (!Array.isArray(categories)) {
    const received = describeTraceEventReceived(categories);
    throw createTraceEventTypeError(`The "options.categories" property must be an instance of Array. Received ${received}`, "ERR_INVALID_ARG_TYPE");
  }
  if (!categories.length) {
    throw createTraceEventTypeError("At least one category is required", "ERR_TRACE_EVENTS_CATEGORY_REQUIRED");
  }
  for (let index = 0; index < categories.length; index += 1) {
    if (typeof categories[index] !== "string") {
      throw createTraceEventTypeError(`The "options.categories[${index}]" property must be of type string. Received ${describeTraceEventReceived(categories[index])}`, "ERR_INVALID_ARG_TYPE");
    }
  }
  return {
    categories: categories.join(","),
    enabledCategories: categories.filter(Boolean)
  };
}

function describeTraceEventReceived(value) {
  if (typeof value === "string") return `type string (${formatInvalidReceived(value)})`;
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  if (typeof value === "boolean") return `type boolean (${value})`;
  if (typeof value === "function") return value.name ? `function ${value.name}` : "function";
  if (typeof value === "bigint") return `type bigint (${value}n)`;
  return describeReceived(value);
}

const TRACE_EVENT_TYPE_ERROR_PROTOTYPE = Object.create(TypeError.prototype, {
  toString: {
    configurable: true,
    writable: true,
    value: function toString() {
      return `${this.name} [${this.code}]: ${this.message}`;
    }
  }
});

function createTraceEventTypeError(message, code) {
  const error = new TypeError(message);
  error.code = code;
  Object.setPrototypeOf(error, TRACE_EVENT_TYPE_ERROR_PROTOTYPE);
  return error;
}

function createTraceEventInvalidOptionsError(value) {
  return createTraceEventTypeError(`The "options" argument must be of type object. Received ${describeTraceEventReceived(value)}`, "ERR_INVALID_ARG_TYPE");
}

function createRuntimeFunction(globals) {
  const NativeFunction = Function;

  function RuntimeFunction(...args) {
    const body = String(args.length ? args.pop() : "");
    const params = args.map((arg) => String(arg));
    const paramList = params.join(",");
    const factory = NativeFunction(
      "__opencontainersGlobals",
      "__opencontainersHostGlobal",
      `return function anonymous(${paramList}) {
        const __opencontainersReceiver = this === undefined || this === __opencontainersHostGlobal
          ? __opencontainersGlobals
          : this;
        return (function anonymous(${paramList}) {
          with (__opencontainersGlobals) {
            ${body}
          }
        }).apply(__opencontainersReceiver, arguments);
      };`
    );
    return factory(globals, globalThis);
  }

  Object.defineProperties(RuntimeFunction, {
    name: { value: "Function", configurable: true },
    constructor: { value: RuntimeFunction, configurable: true, writable: true }
  });
  RuntimeFunction.prototype = Object.create(Function.prototype, {
    constructor: { value: RuntimeFunction, configurable: true, writable: true }
  });

  return RuntimeFunction;
}

function packageExportConditions(mode = "require") {
  if (mode === "import") return ["node", "import", "default"];
  if (mode === "require") return ["node", "require", "default"];
  return ["node", "import", "require", "default"];
}

function createRuntimeFetch({ kernel, process }) {
  return async function fetch(input, init = {}) {
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
