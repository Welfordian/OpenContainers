var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});

// packages/fs/src/path-utils.js
function normalizePath(input) {
  if (input === void 0 || input === null || input === "") return ".";
  const absolute = String(input).startsWith("/");
  const segments = [];
  for (const part of String(input).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!absolute) {
        segments.push("..");
      }
      continue;
    }
    segments.push(part);
  }
  const joined = segments.join("/");
  if (absolute) return `/${joined}`.replace(/\/+$/, "") || "/";
  return joined || ".";
}
function resolvePath(cwd, input = ".") {
  if (String(input).startsWith("/")) return normalizePath(input);
  return normalizePath(`${cwd || "/"}/${input}`);
}
function expandHomePath(input = ".", home = "/workspace") {
  const value = String(input);
  if (value === "~") return normalizePath(home);
  if (value.startsWith("~/")) return normalizePath(`${home}/${value.slice(2)}`);
  return value;
}
function resolveShellPath(cwd, input = ".", home = "/workspace") {
  return resolvePath(cwd, expandHomePath(input, home));
}
function dirname(input) {
  const normalized = normalizePath(input);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized.startsWith("/") ? "/" : ".";
  return normalized.slice(0, index);
}
function basename(input) {
  const normalized = normalizePath(input);
  if (normalized === "/") return "";
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}
function extname(input) {
  const base = basename(input);
  const index = base.lastIndexOf(".");
  if (index <= 0) return "";
  return base.slice(index);
}
function joinPath(...parts) {
  if (!parts.length) return ".";
  const first = String(parts[0] ?? "");
  const joined = parts.filter((part) => part !== void 0 && part !== null && part !== "").join("/");
  return normalizePath(first.startsWith("/") ? joined : joined || ".");
}
function relativePath(from3, to) {
  const fromParts = normalizePath(from3).split("/").filter(Boolean);
  const toParts = normalizePath(to).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/");
}
function isInsidePath(parent, child) {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent.replace(/\/$/, "")}/`);
}

// packages/runtime-node/src/builtins/events.js
var EVENTS_SYMBOL = /* @__PURE__ */ Symbol.for("opencontainers.events");
var defaultMaxListeners = 10;
var EventEmitter = class {
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
    if (eventName === void 0) events.clear();
    else events.delete(eventName);
    return this;
  }
  emit(eventName, ...args) {
    const listeners = [...eventMap(this).get(eventName) ?? []];
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
    return [...eventMap(this).get(eventName) ?? []];
  }
  eventNames() {
    return [...eventMap(this).keys()];
  }
};
function once(emitter, eventName, options = {}) {
  if (!emitter || typeof emitter.once !== "function") {
    return Promise.reject(new TypeError("emitter.once is not a function"));
  }
  const signal = options?.signal;
  if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));
  return new Promise((resolve2, reject) => {
    const cleanup = () => {
      emitter.removeListener?.(eventName, onEvent);
      if (eventName !== "error") emitter.removeListener?.("error", onError);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onEvent = (...args) => {
      cleanup();
      resolve2(args);
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
function on(emitter, eventName, options = {}) {
  if (!emitter || typeof emitter.on !== "function") {
    throw new TypeError("emitter.on is not a function");
  }
  const signal = options?.signal;
  const queue = [];
  const waiters = [];
  let finished2 = false;
  let failure = null;
  const settleNext = () => {
    const waiter = waiters.shift();
    if (!waiter) return;
    if (queue.length) {
      waiter.resolve({ value: queue.shift(), done: false });
    } else if (failure) {
      waiter.reject(failure);
    } else if (finished2) {
      waiter.resolve({ value: void 0, done: true });
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
    if (finished2 || failure) return;
    if (error) failure = error;
    else finished2 = true;
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
      if (finished2) return Promise.resolve({ value: void 0, done: true });
      return new Promise((resolve2, reject) => waiters.push({ resolve: resolve2, reject }));
    },
    return() {
      finished2 = true;
      cleanup();
      while (waiters.length) settleNext();
      return Promise.resolve({ value: void 0, done: true });
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
      value: /* @__PURE__ */ new Map()
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
  if (reason !== void 0) error.cause = reason;
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
    return { [Symbol.dispose]: () => {
    } };
  }
  signal.addEventListener?.("abort", listener, { once: true });
  return {
    [Symbol.dispose]: () => signal.removeEventListener?.("abort", listener),
    dispose: () => signal.removeEventListener?.("abort", listener)
  };
}
var events_default = EventEmitter;

// packages/fs/src/VirtualFileSystem.js
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var VirtualFileSystemError = class extends Error {
  constructor(code, path, message = code) {
    super(`${code}: ${message}${path ? `, '${path}'` : ""}`);
    this.name = "VirtualFileSystemError";
    this.code = code;
    this.path = path;
  }
};
var _type;
var VirtualStats = class {
  constructor(node) {
    __privateAdd(this, _type);
    this.dev = 0;
    this.ino = node.id;
    this.mode = node.mode;
    this.nlink = 1;
    this.uid = 0;
    this.gid = 0;
    this.rdev = 0;
    this.size = node.type === "file" ? node.data.byteLength : 0;
    this.blksize = 4096;
    this.blocks = Math.ceil(this.size / 512);
    this.atimeMs = node.atimeMs;
    this.mtimeMs = node.mtimeMs;
    this.ctimeMs = node.ctimeMs;
    this.birthtimeMs = node.birthtimeMs;
    this.atime = new Date(this.atimeMs);
    this.mtime = new Date(this.mtimeMs);
    this.ctime = new Date(this.ctimeMs);
    this.birthtime = new Date(this.birthtimeMs);
    __privateSet(this, _type, node.type);
  }
  isFile() {
    return __privateGet(this, _type) === "file";
  }
  isDirectory() {
    return __privateGet(this, _type) === "directory";
  }
  isSymbolicLink() {
    return __privateGet(this, _type) === "symlink";
  }
  isSocket() {
    return false;
  }
  isFIFO() {
    return false;
  }
  isCharacterDevice() {
    return false;
  }
  isBlockDevice() {
    return false;
  }
};
_type = new WeakMap();
var _VirtualFileSystem_instances, now_fn, createNode_fn, createDirectory_fn, touch_fn, timeToMs_fn, symlinkTargetPath_fn, lookup_fn, requireParent_fn, emit_fn;
var VirtualFileSystem = class {
  constructor({ files = {}, cwd = "/workspace" } = {}) {
    __privateAdd(this, _VirtualFileSystem_instances);
    __publicField(this, "promises", {
      readFile: async (path, options) => this.readFileSync(path, options),
      writeFile: async (path, data, options) => this.writeFileSync(path, data, options),
      appendFile: async (path, data, options) => this.appendFileSync(path, data, options),
      mkdir: async (path, options) => this.mkdirSync(path, options),
      readdir: async (path, options) => this.readdirSync(path, options),
      stat: async (path) => this.statSync(path),
      lstat: async (path) => this.lstatSync(path),
      rm: async (path, options) => this.rmSync(path, options),
      rename: async (oldPath, newPath) => this.renameSync(oldPath, newPath),
      copyFile: async (source, destination) => this.copyFileSync(source, destination),
      unlink: async (path) => this.unlinkSync(path)
    });
    this.nodes = /* @__PURE__ */ new Map();
    this.nextInode = 1;
    this.watchers = new EventEmitter();
    this.cwd = normalizePath(cwd);
    __privateMethod(this, _VirtualFileSystem_instances, createDirectory_fn).call(this, "/");
    this.mkdirSync(this.cwd, { recursive: true });
    for (const [path, value] of Object.entries(files)) {
      if (value && typeof value === "object" && value.type === "directory") {
        this.mkdirSync(path, { recursive: true });
      } else {
        this.writeFileSync(path, typeof value === "string" ? value : value?.content ?? "");
      }
    }
  }
  watchedPaths() {
    return [...this.watchers.listenersByPath ?? []];
  }
  resolve(cwd, path) {
    return resolvePath(cwd || this.cwd, path);
  }
  chdir(path) {
    const normalized = this.resolve(this.cwd, path);
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, normalized);
    if (node.type !== "directory") throw new VirtualFileSystemError("ENOTDIR", normalized, "not a directory");
    this.cwd = normalized;
  }
  existsSync(path) {
    return this.nodes.has(normalizePath(path));
  }
  statSync(path) {
    return new VirtualStats(__privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, path));
  }
  lstatSync(path) {
    return new VirtualStats(__privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, path, { followSymlinks: false }));
  }
  realpathSync(path) {
    const normalized = normalizePath(path);
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, normalized, { followSymlinks: false });
    if (node.type !== "symlink") return normalized;
    return this.realpathSync(__privateMethod(this, _VirtualFileSystem_instances, symlinkTargetPath_fn).call(this, normalized, node.target));
  }
  readlinkSync(path) {
    const normalized = normalizePath(path);
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, normalized, { followSymlinks: false });
    if (node.type !== "symlink") throw new VirtualFileSystemError("EINVAL", normalized, "invalid argument");
    return node.target;
  }
  symlinkSync(target, path) {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) throw new VirtualFileSystemError("EEXIST", normalized, "file already exists");
    const parent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, normalized);
    const node = __privateMethod(this, _VirtualFileSystem_instances, createNode_fn).call(this, "symlink", normalized, { target: String(target), mode: 41471 });
    this.nodes.set(normalized, node);
    parent.children.add(basename(normalized));
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, parent);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", normalized);
  }
  utimesSync(path, atime, mtime) {
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, path);
    node.atimeMs = __privateMethod(this, _VirtualFileSystem_instances, timeToMs_fn).call(this, atime);
    node.mtimeMs = __privateMethod(this, _VirtualFileSystem_instances, timeToMs_fn).call(this, mtime);
    node.ctimeMs = __privateMethod(this, _VirtualFileSystem_instances, now_fn).call(this);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "change", path);
  }
  mkdirSync(path, options = {}) {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) {
      const existing = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, normalized);
      if (existing.type !== "directory") throw new VirtualFileSystemError("EEXIST", normalized, "file already exists");
      return;
    }
    const parentPath = dirname(normalized);
    if (!this.nodes.has(parentPath)) {
      if (!options.recursive) throw new VirtualFileSystemError("ENOENT", parentPath, "parent does not exist");
      this.mkdirSync(parentPath, { recursive: true });
    }
    const parent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, normalized);
    const node = __privateMethod(this, _VirtualFileSystem_instances, createDirectory_fn).call(this, normalized);
    parent.children.add(basename(normalized));
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, parent);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", normalized);
    return node;
  }
  readdirSync(path, options = {}) {
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, path);
    if (node.type !== "directory") throw new VirtualFileSystemError("ENOTDIR", path, "not a directory");
    const names = [...node.children].sort();
    if (!options.withFileTypes) return names;
    return names.map((name) => {
      const child = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, `${normalizePath(path)}/${name}`);
      return {
        name,
        isFile: () => child.type === "file",
        isDirectory: () => child.type === "directory",
        isSymbolicLink: () => child.type === "symlink"
      };
    });
  }
  readFileSync(path, options) {
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, path);
    if (node.type !== "file") throw new VirtualFileSystemError("EISDIR", path, "illegal operation on a directory");
    node.atimeMs = __privateMethod(this, _VirtualFileSystem_instances, now_fn).call(this);
    const encoding = typeof options === "string" ? options : options?.encoding;
    const data = new Uint8Array(node.data);
    return encoding ? textDecoder.decode(data) : data;
  }
  writeFileSync(path, data, options = {}) {
    const normalized = normalizePath(path);
    const parent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, normalized);
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
    let node = this.nodes.get(normalized);
    if (node?.type === "symlink") {
      this.writeFileSync(__privateMethod(this, _VirtualFileSystem_instances, symlinkTargetPath_fn).call(this, normalized, node.target), data, options);
      return;
    }
    if (node && node.type !== "file") {
      throw new VirtualFileSystemError("EISDIR", normalized, "illegal operation on a directory");
    }
    if (!node) {
      node = __privateMethod(this, _VirtualFileSystem_instances, createNode_fn).call(this, "file", normalized, { data: new Uint8Array(), mode: 33188 });
      this.nodes.set(normalized, node);
      parent.children.add(basename(normalized));
    }
    node.data = new Uint8Array(bytes);
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, node);
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, parent);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "change", normalized);
  }
  appendFileSync(path, data, options = {}) {
    const existing = this.existsSync(path) ? this.readFileSync(path) : new Uint8Array();
    const next = typeof data === "string" ? textEncoder.encode(data) : new Uint8Array(data);
    const merged = new Uint8Array(existing.byteLength + next.byteLength);
    merged.set(existing);
    merged.set(next, existing.byteLength);
    this.writeFileSync(path, merged, options);
  }
  rmSync(path, options = {}) {
    const normalized = normalizePath(path);
    if (!this.nodes.has(normalized)) {
      if (options.force) return;
      throw new VirtualFileSystemError("ENOENT", normalized, "no such file or directory");
    }
    if (normalized === "/") throw new VirtualFileSystemError("EBUSY", normalized, "cannot remove root");
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, normalized, { followSymlinks: false });
    if (node.type === "directory" && node.children.size && !options.recursive) {
      throw new VirtualFileSystemError("ENOTEMPTY", normalized, "directory not empty");
    }
    if (node.type === "directory") {
      for (const child of [...node.children]) this.rmSync(`${normalized}/${child}`, { recursive: true, force: true });
    }
    const parent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, normalized);
    parent.children.delete(basename(normalized));
    this.nodes.delete(normalized);
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, parent);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", normalized);
  }
  rmdirSync(path, options = {}) {
    this.rmSync(path, options);
  }
  unlinkSync(path) {
    this.rmSync(path);
  }
  renameSync(oldPath, newPath) {
    const from3 = normalizePath(oldPath);
    const to = normalizePath(newPath);
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, from3, { followSymlinks: false });
    __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, to);
    const entries = [...this.nodes.entries()].filter(([path]) => path === from3 || isInsidePath(from3, path));
    entries.sort((a, b) => a[0].length - b[0].length);
    for (const [path, entry] of entries) {
      const movedPath = path === from3 ? to : `${to}${path.slice(from3.length)}`;
      this.nodes.delete(path);
      entry.path = movedPath;
      this.nodes.set(movedPath, entry);
    }
    const oldParent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, from3);
    const newParent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, to);
    oldParent.children.delete(basename(from3));
    newParent.children.add(basename(to));
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, node);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", from3);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", to);
  }
  copyFileSync(source, destination) {
    const data = this.readFileSync(source);
    this.writeFileSync(destination, data);
  }
  watch(path, optionsOrListener, maybeListener) {
    var _a2;
    const normalized = normalizePath(path);
    const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
    if (!listener) throw new TypeError("watch listener is required");
    (_a2 = this.watchers).listenersByPath ?? (_a2.listenersByPath = /* @__PURE__ */ new Set());
    this.watchers.listenersByPath.add(normalized);
    const eventName = `change:${normalized}`;
    this.watchers.on(eventName, listener);
    return {
      close: () => {
        this.watchers.off(eventName, listener);
        if (!this.watchers.listenerCount(eventName)) this.watchers.listenersByPath.delete(normalized);
      },
      on: () => this
    };
  }
  readFile(path, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    queueMicrotask(() => {
      try {
        cb(null, this.readFileSync(path, options));
      } catch (error) {
        cb(error);
      }
    });
  }
  writeFile(path, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    queueMicrotask(() => {
      try {
        this.writeFileSync(path, data, options);
        cb?.(null);
      } catch (error) {
        cb?.(error);
      }
    });
  }
};
_VirtualFileSystem_instances = new WeakSet();
now_fn = function() {
  return Date.now();
};
createNode_fn = function(type, path, extra = {}) {
  const now = __privateMethod(this, _VirtualFileSystem_instances, now_fn).call(this);
  return {
    id: this.nextInode++,
    type,
    path,
    mode: type === "directory" ? 16877 : type === "symlink" ? 41471 : 33188,
    atimeMs: now,
    mtimeMs: now,
    ctimeMs: now,
    birthtimeMs: now,
    ...extra
  };
};
createDirectory_fn = function(path) {
  const normalized = normalizePath(path);
  const node = __privateMethod(this, _VirtualFileSystem_instances, createNode_fn).call(this, "directory", normalized, { children: /* @__PURE__ */ new Set(), mode: 16877 });
  this.nodes.set(normalized, node);
  return node;
};
touch_fn = function(node) {
  const now = __privateMethod(this, _VirtualFileSystem_instances, now_fn).call(this);
  node.mtimeMs = now;
  node.ctimeMs = now;
};
timeToMs_fn = function(value) {
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Invalid time value");
  return number * 1e3;
};
symlinkTargetPath_fn = function(linkPath, target) {
  return normalizePath(String(target).startsWith("/") ? target : `${dirname(linkPath)}/${target}`);
};
lookup_fn = function(path, { followSymlinks = true } = {}, seen = /* @__PURE__ */ new Set()) {
  const normalized = normalizePath(path);
  const node = this.nodes.get(normalized);
  if (!node) throw new VirtualFileSystemError("ENOENT", normalized, "no such file or directory");
  if (followSymlinks && node.type === "symlink") {
    if (seen.has(normalized)) throw new VirtualFileSystemError("ELOOP", normalized, "too many symbolic links encountered");
    seen.add(normalized);
    return __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, __privateMethod(this, _VirtualFileSystem_instances, symlinkTargetPath_fn).call(this, normalized, node.target), { followSymlinks }, seen);
  }
  return node;
};
requireParent_fn = function(path) {
  const parentPath = dirname(path);
  const parent = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, parentPath);
  if (parent.type !== "directory") {
    throw new VirtualFileSystemError("ENOTDIR", parentPath, "not a directory");
  }
  return parent;
};
emit_fn = function(eventType, path) {
  const normalized = normalizePath(path);
  this.watchers.emit("change", eventType, normalized);
  for (const watchedPath of this.watchedPaths()) {
    if (normalized === watchedPath || isInsidePath(watchedPath, normalized)) {
      this.watchers.emit(`change:${watchedPath}`, eventType, basename(normalized));
    }
  }
};

// packages/npm/src/npm-bootstrapper.js
var DEFAULT_NPM_VERSION = "11.17.0";
var DEFAULT_NPM_PACKAGE_ROOT = `/home/opencontainers/.opencontainers/npm/npm-${DEFAULT_NPM_VERSION}`;
var _NpmBootstrapper_instances, isInstalled_fn, entrypoints_fn, writePackage_fn, writeRunnerFiles_fn, pacoteExtractPatchSource_fn;
var NpmBootstrapper = class {
  constructor({
    kernel,
    registryClient,
    version = DEFAULT_NPM_VERSION,
    packageRoot = `/home/opencontainers/.opencontainers/npm/npm-${version}`
  }) {
    __privateAdd(this, _NpmBootstrapper_instances);
    this.kernel = kernel;
    this.registryClient = registryClient;
    this.version = version;
    this.packageRoot = packageRoot;
    this.bootstrapped = null;
  }
  async ensure() {
    if (this.bootstrapped && __privateMethod(this, _NpmBootstrapper_instances, isInstalled_fn).call(this)) return this.bootstrapped;
    if (__privateMethod(this, _NpmBootstrapper_instances, isInstalled_fn).call(this)) {
      __privateMethod(this, _NpmBootstrapper_instances, writeRunnerFiles_fn).call(this);
      this.bootstrapped = __privateMethod(this, _NpmBootstrapper_instances, entrypoints_fn).call(this);
      return this.bootstrapped;
    }
    if (!this.registryClient) {
      throw new Error("npm CLI bootstrap requires an npm registry client");
    }
    const metadata = await this.registryClient.metadata("npm");
    const packageMetadata = metadata.versions?.[this.version];
    if (!packageMetadata) {
      throw new Error(`Pinned npm version ${this.version} was not found in the registry metadata`);
    }
    const files = await this.registryClient.packageFiles("npm", this.version, packageMetadata);
    __privateMethod(this, _NpmBootstrapper_instances, writePackage_fn).call(this, files);
    __privateMethod(this, _NpmBootstrapper_instances, writeRunnerFiles_fn).call(this);
    this.bootstrapped = __privateMethod(this, _NpmBootstrapper_instances, entrypoints_fn).call(this);
    return this.bootstrapped;
  }
};
_NpmBootstrapper_instances = new WeakSet();
isInstalled_fn = function() {
  const manifestPath = joinPath(this.packageRoot, "package.json");
  if (!this.kernel.fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(this.kernel.fs.readFileSync(manifestPath, "utf8"));
    return manifest.name === "npm" && manifest.version === this.version;
  } catch {
    return false;
  }
};
entrypoints_fn = function() {
  return {
    version: this.version,
    root: this.packageRoot,
    npmCli: joinPath(this.packageRoot, "bin/npm-cli.js"),
    npxCli: joinPath(this.packageRoot, "bin/npx-cli.js"),
    npmRunner: joinPath(this.packageRoot, ".opencontainers/npm-runner.mjs"),
    npxRunner: joinPath(this.packageRoot, ".opencontainers/npx-runner.mjs")
  };
};
writePackage_fn = function(files) {
  this.kernel.fs.mkdirSync(this.packageRoot, { recursive: true });
  for (const [relativePath2, value] of Object.entries(files)) {
    const targetPath = joinPath(this.packageRoot, relativePath2);
    this.kernel.fs.mkdirSync(joinPath(targetPath, ".."), { recursive: true });
    this.kernel.fs.writeFileSync(targetPath, value);
  }
};
writeRunnerFiles_fn = function() {
  const runnerDir = joinPath(this.packageRoot, ".opencontainers");
  this.kernel.fs.mkdirSync(runnerDir, { recursive: true });
  const pacotePatchPath = joinPath(runnerDir, "pacote-extract-patch.cjs");
  this.kernel.fs.writeFileSync(pacotePatchPath, __privateMethod(this, _NpmBootstrapper_instances, pacoteExtractPatchSource_fn).call(this));
  this.kernel.fs.writeFileSync(joinPath(runnerDir, "npm-runner.mjs"), [
    `require(${JSON.stringify(pacotePatchPath)});`,
    "patchNpmProcessExit();",
    `const cli = require(${JSON.stringify(joinPath(this.packageRoot, "lib/cli.js"))});`,
    `process.argv[1] = ${JSON.stringify(joinPath(this.packageRoot, "bin/npm-cli.js"))};`,
    "await cli(process);",
    "",
    "function patchNpmProcessExit() {",
    "  process.exit = (code = undefined) => {",
    "    const exitCode = Number(code ?? process.exitCode ?? 0) || 0;",
    "    process.exitCode = exitCode;",
    "    process.emit('exit', exitCode);",
    "  };",
    "}",
    ""
  ].join("\n"));
  this.kernel.fs.writeFileSync(joinPath(runnerDir, "npx-runner.mjs"), [
    `require(${JSON.stringify(pacotePatchPath)});`,
    "patchNpmProcessExit();",
    `const cli = require(${JSON.stringify(joinPath(this.packageRoot, "lib/cli.js"))});`,
    `process.argv[1] = ${JSON.stringify(joinPath(this.packageRoot, "bin/npm-cli.js"))};`,
    "process.argv.splice(2, 0, 'exec');",
    "await cli(process);",
    "",
    "function patchNpmProcessExit() {",
    "  process.exit = (code = undefined) => {",
    "    const exitCode = Number(code ?? process.exitCode ?? 0) || 0;",
    "    process.exitCode = exitCode;",
    "    process.emit('exit', exitCode);",
    "  };",
    "}",
    ""
  ].join("\n"));
};
pacoteExtractPatchSource_fn = function() {
  const pacotePath = joinPath(this.packageRoot, "node_modules/pacote/lib/index.js");
  return `
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const pacote = require(${JSON.stringify(pacotePath)});

if (!pacote.__opencontainersPatchedExtract) {
  const originalExtract = pacote.extract;
  pacote.extract = async function openContainersExtract(spec, destination, options = {}) {
    const resolved = options.resolved || await pacote.resolve(spec, options);
    if (!resolved || !/^https?:\\/\\//i.test(resolved)) {
      return originalExtract.call(this, spec, destination, options);
    }

    const compressedOrTar = await fetchBytes(resolved);
    const archiveBytes = await archiveBytesForInstall(compressedOrTar, options.integrity);
    const files = extractTarFiles(archiveBytes);

    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
      const target = safeJoin(destination, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  };
  Object.defineProperty(pacote, "__opencontainersPatchedExtract", {
    value: true,
    enumerable: false,
  });
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`npm tarball request failed for \${url}: \${response.status}\`);
  }
  return Buffer.from(new Uint8Array(await response.arrayBuffer()));
}

async function archiveBytesForInstall(bytes, integrity) {
  if (integrity) {
    try {
      verifyIntegrity(bytes, String(integrity));
    } catch (error) {
      if (looksLikeTarArchive(bytes)) return bytes;
      throw error;
    }
  }
  if (looksLikeTarArchive(bytes)) return bytes;
  return gunzip(bytes);
}

function verifyIntegrity(bytes, integrity) {
  const checks = String(integrity || "")
    .trim()
    .split(/\\s+/)
    .map(parseIntegrityToken)
    .filter(Boolean);
  if (!checks.length) return;

  for (const { algorithm, expected } of checks) {
    const normalized = normalizeDigestAlgorithm(algorithm);
    if (!normalized) continue;
    const actual = crypto.createHash(normalized).update(bytes).digest("base64");
    if (normalizeIntegrityDigest(actual) === normalizeIntegrityDigest(expected)) return;
  }

  throw Object.assign(new Error("npm tarball integrity check failed"), {
    code: "ERR_OPENCONTAINERS_NPM_INTEGRITY",
  });
}

function parseIntegrityToken(token) {
  const match = String(token).match(/^([a-z0-9]+)-(.+)$/i);
  return match ? { algorithm: match[1], expected: match[2] } : null;
}

function normalizeDigestAlgorithm(algorithm) {
  const normalized = String(algorithm || "").toLowerCase();
  if (normalized === "sha1") return "sha1";
  if (normalized === "sha256") return "sha256";
  if (normalized === "sha384") return "sha384";
  if (normalized === "sha512") return "sha512";
  return "";
}

function normalizeIntegrityDigest(value) {
  return String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");
}

function gunzip(bytes) {
  return new Promise((resolve, reject) => {
    zlib.gunzip(bytes, (error, result) => {
      if (error) reject(error);
      else resolve(Buffer.from(result));
    });
  });
}

function extractTarFiles(bytes) {
  const files = {};
  let offset = 0;
  let pendingLongPath = "";

  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = readTarString(header, 0, 100);
    const size = Number.parseInt(readTarString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readTarString(header, 345, 155);
    const rawName = pendingLongPath || (prefix ? \`\${prefix}/\${name}\` : name);
    const fullName = normalizeTarPath(rawName);
    pendingLongPath = "";

    offset += 512;
    const content = bytes.subarray(offset, offset + size);

    if (type === "L") {
      pendingLongPath = readTarString(content, 0, content.byteLength);
    } else if (type === "0" || type === "\\0") {
      files[fullName] = Buffer.from(content);
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return stripCommonPackageRoot(files);
}

function looksLikeTarArchive(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 512) return false;
  const name = readTarString(bytes, 0, 100);
  if (!name) return false;
  const checksumText = readTarString(bytes, 148, 8).trim().replace(/\\0.*$/, "");
  const expected = Number.parseInt(checksumText || "0", 8);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  let actual = 0;
  for (let index = 0; index < 512; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : bytes[index];
  }
  return actual === expected;
}

function stripCommonPackageRoot(files) {
  if (files["package.json"]) return files;
  const roots = new Set();
  for (const path of Object.keys(files)) {
    const [root, rest] = path.split(/\\/(.+)/, 2);
    if (root && rest) roots.add(root);
  }
  if (roots.size !== 1) return files;
  const [root] = roots;
  const stripped = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith(\`\${root}/\`)) stripped[path.slice(root.length + 1)] = content;
  }
  return stripped;
}

function normalizeTarPath(value) {
  return String(value || "")
    .replace(/\\0.*$/, "")
    .replace(/\\\\/g, "/")
    .replace(/^\\/+/, "")
    .replace(/^\\.\\//, "");
}

function readTarString(bytes, start, length) {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end));
}

function safeJoin(root, relativePath) {
  const normalized = normalizeTarPath(relativePath);
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error(\`Unsafe tar entry path: \${relativePath}\`);
  }
  const target = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(\`\${resolvedRoot}/\`)) {
    throw new Error(\`Unsafe tar entry path: \${relativePath}\`);
  }
  return target;
}
`;
};

// packages/adapters/src/registry.js
var packageAdapters = {
  esbuild: {
    replaceBin: {
      esbuild: "/__adapters__/esbuild-wasm/bin.js"
    },
    replaceModule: "/__adapters__/esbuild-wasm/index.js",
    postInstall: "skip",
    files: {
      "/__adapters__/esbuild-wasm/index.js": `
        function transformSync(source, options = {}) {
          return { code: String(source), map: options.sourcemap ? '' : null, warnings: [], errors: [] };
        }
        async function transform(source, options = {}) {
          return transformSync(source, options);
        }
        function buildSync() {
          return { outputFiles: [], warnings: [], errors: [] };
        }
        async function build() {
          return buildSync();
        }
        module.exports = {
          version: 'opencontainers-esbuild-wasm-adapter',
          transform,
          transformSync,
          build,
          buildSync,
          formatMessages: async (messages) => messages.map(String),
          formatMessagesSync: (messages) => messages.map(String)
        };
      `,
      "/__adapters__/esbuild-wasm/bin.js": `
        const esbuild = require('./index.js');
        const args = process.argv.slice(2);
        if (args.includes('--version')) {
          console.log(esbuild.version);
        } else {
          console.log('opencontainers esbuild adapter');
        }
      `
    }
  },
  fsevents: {
    replaceModule: "/__adapters__/fsevents/noop.js",
    postInstall: "skip",
    files: {
      "/__adapters__/fsevents/noop.js": `
        module.exports = {
          watch() {
            return { close() {} };
          }
        };
      `
    }
  },
  sharp: {
    replaceModule: "/__adapters__/sharp/unsupported.js",
    postInstall: "skip",
    files: {
      "/__adapters__/sharp/unsupported.js": `
        function sharpUnsupported() {
          const error = new Error('sharp uses native image processing bindings and is not supported in OpenContainers V1');
          error.code = 'ERR_OPENCONTAINERS_NATIVE_MODULE_UNSUPPORTED';
          throw error;
        }
        module.exports = sharpUnsupported;
      `
    }
  }
};
function adapterForPackage(packageName) {
  return packageAdapters[packageName] ?? null;
}
function materializeAdapterFiles(fs, adapter) {
  for (const [path, source] of Object.entries(adapter.files ?? {})) {
    const directory = path.slice(0, path.lastIndexOf("/")) || "/";
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path, normalizeAdapterSource(source));
  }
}
function normalizeAdapterSource(source) {
  return `${source.trim().replace(/^ {8}/gm, "")}
`;
}

// packages/npm/src/registry-client.js
var RegistryClient = class {
  constructor({ registryUrl = "https://registry.npmjs.org" } = {}) {
    this.registryUrl = registryUrl.replace(/\/$/, "");
  }
  async metadata(packageName) {
    const response = await fetch(`${this.registryUrl}/${encodeURIComponent(packageName).replace(/^%40/, "@")}`);
    if (!response.ok) {
      throw new Error(`npm metadata request failed for ${packageName}: ${response.status}`);
    }
    return response.json();
  }
  async packageFiles(packageName, version, metadata) {
    const tarball = metadata.dist?.tarball;
    if (!tarball) throw new Error(`No tarball URL for ${packageName}@${version}`);
    const compressed = await fetchPackageBytes(tarball, packageName, version);
    try {
      const tarBytes = await packageTarBytes(compressed, metadata, { packageName, version, tarball });
      return extractTarFiles(tarBytes);
    } catch (error) {
      if (error?.code !== "ERR_OPENCONTAINERS_NPM_INTEGRITY") throw error;
      const retryBytes = await fetchPackageBytes(tarball, packageName, version, { cache: "reload" });
      const tarBytes = await packageTarBytes(retryBytes, metadata, { packageName, version, tarball, allowIntegrityMismatchArchive: true });
      return extractTarFiles(tarBytes);
    }
  }
};
var MemoryRegistryClient = class {
  constructor(packages = {}) {
    this.packages = packages;
  }
  async metadata(packageName) {
    const entry = this.packages[packageName];
    if (!entry) throw new Error(`No test registry entry for ${packageName}`);
    return {
      name: packageName,
      "dist-tags": { latest: Object.keys(entry.versions).at(-1), ...entry.distTags ?? {} },
      versions: Object.fromEntries(Object.entries(entry.versions).map(([version, data]) => [
        version,
        {
          name: packageName,
          version,
          dependencies: data.dependencies ?? {},
          scripts: data.scripts ?? {},
          bin: data.bin,
          main: data.main,
          exports: data.exports,
          dist: {
            integrity: `memory-${packageName}-${version}`,
            tarball: `memory:${packageName}@${version}`
          }
        }
      ]))
    };
  }
  async packageFiles(packageName, version) {
    const files = this.packages[packageName]?.versions?.[version]?.files;
    if (!files) throw new Error(`No files for ${packageName}@${version}`);
    return files;
  }
};
async function fetchPackageBytes(tarball, packageName, version, init = void 0) {
  const response = await fetch(tarball, init);
  if (!response.ok) {
    throw new Error(`npm tarball request failed for ${packageName}@${version}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
async function packageTarBytes(bytes, metadata, details) {
  if (metadata.dist?.integrity) {
    try {
      await verifyIntegrity(bytes, metadata.dist.integrity);
    } catch (error) {
      if (error?.code === "ERR_OPENCONTAINERS_NPM_INTEGRITY" && packageArchiveMatches(bytes, details)) {
        return bytes;
      }
      if (error?.code === "ERR_OPENCONTAINERS_NPM_INTEGRITY" && details.allowIntegrityMismatchArchive) {
        const tarBytes = await maybeDecompressGzip(bytes);
        if (packageArchiveMatches(tarBytes, details)) return tarBytes;
      }
      throw enrichIntegrityError(error, bytes, details);
    }
  }
  if (looksLikeTarArchive(bytes)) return bytes;
  return decompressGzip(bytes);
}
async function verifyIntegrity(bytes, integrity) {
  const checks = String(integrity || "").trim().split(/\s+/).map(parseIntegrityToken).filter(Boolean);
  if (!checks.length) return;
  const attempts = [];
  for (const { algorithm, expected } of checks) {
    const digestAlgorithm = normalizeDigestAlgorithm(algorithm);
    if (!digestAlgorithm) continue;
    const digest = new Uint8Array(await crypto.subtle.digest(digestAlgorithm, bytes));
    const actual = bytesToBase64(digest);
    attempts.push({ algorithm, expected, actual });
    if (normalizeIntegrityDigest(actual) === normalizeIntegrityDigest(expected)) return;
  }
  throw Object.assign(new Error("npm tarball integrity check failed"), {
    code: "ERR_OPENCONTAINERS_NPM_INTEGRITY",
    expected: checks.map((check) => `${check.algorithm}-${check.expected}`).join(" "),
    actual: attempts.map((attempt) => `${attempt.algorithm}-${attempt.actual}`).join(" ")
  });
}
function enrichIntegrityError(error, bytes, details) {
  if (!error || typeof error !== "object") return error;
  return Object.assign(new Error([
    `npm tarball integrity check failed for ${details.packageName}@${details.version}`,
    `tarball: ${details.tarball}`,
    `bytes: ${bytes.byteLength}`,
    `signature: ${byteSignature(bytes)}`,
    error.expected ? `expected: ${error.expected}` : "",
    error.actual ? `actual: ${error.actual}` : ""
  ].filter(Boolean).join("\n")), {
    code: "ERR_OPENCONTAINERS_NPM_INTEGRITY",
    packageName: details.packageName,
    version: details.version,
    tarball: details.tarball,
    bytesLength: bytes.byteLength,
    bodySignature: byteSignature(bytes),
    expected: error.expected,
    actual: error.actual,
    cause: error
  });
}
function parseIntegrityToken(token) {
  const match = String(token).match(/^([a-z0-9]+)-(.+)$/i);
  if (!match) return null;
  return { algorithm: match[1], expected: match[2] };
}
function normalizeDigestAlgorithm(algorithm) {
  const normalized = String(algorithm || "").toLowerCase();
  if (normalized === "sha1") return "SHA-1";
  if (normalized === "sha256") return "SHA-256";
  if (normalized === "sha384") return "SHA-384";
  if (normalized === "sha512") return "SHA-512";
  return "";
}
function normalizeIntegrityDigest(value) {
  return String(value || "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
}
async function decompressGzip(bytes) {
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (globalThis.process?.versions?.node) {
    const importNodeModule = Function("specifier", "return import(specifier)");
    const { gunzipSync } = await importNodeModule("node:zlib");
    return new Uint8Array(gunzipSync(bytes));
  }
  throw Object.assign(new Error("gzip decompression is unavailable in this browser"), {
    code: "ERR_OPENCONTAINERS_GZIP_UNAVAILABLE"
  });
}
async function maybeDecompressGzip(bytes) {
  try {
    return await decompressGzip(bytes);
  } catch (_) {
    return null;
  }
}
function extractTarFiles(bytes) {
  const files = {};
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const size = Number.parseInt(readTarString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readTarString(header, 345, 155);
    const fullName = normalizeTarPath(prefix ? `${prefix}/${name}` : name);
    offset += 512;
    const content = bytes.slice(offset, offset + size);
    if (type === "0" || type === "\0") {
      files[fullName] = content;
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return stripCommonPackageRoot(files);
}
function packageArchiveMatches(bytes, details) {
  if (!looksLikeTarArchive(bytes)) return false;
  try {
    const files = extractTarFiles(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files["package.json"] ?? new Uint8Array()));
    return manifest.name === details.packageName && manifest.version === details.version;
  } catch (_) {
    return false;
  }
}
function looksLikeTarArchive(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 512) return false;
  const name = readTarString(bytes, 0, 100);
  if (!name) return false;
  const checksumText = readTarString(bytes, 148, 8).trim().replace(/\0.*$/, "");
  const expected = Number.parseInt(checksumText || "0", 8);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  let actual = 0;
  for (let index = 0; index < 512; index++) {
    actual += index >= 148 && index < 156 ? 32 : bytes[index];
  }
  return actual === expected;
}
function normalizeTarPath(path) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}
function readTarString(bytes, start, length) {
  const slice = bytes.slice(start, start + length);
  const end2 = slice.indexOf(0);
  return new TextDecoder().decode(end2 === -1 ? slice : slice.slice(0, end2));
}
function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.slice(index, index + 32768));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  throw new Error("base64 encoding is unavailable in this runtime");
}
function byteSignature(bytes) {
  return [...bytes.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
function stripCommonPackageRoot(files) {
  if (files["package.json"]) return files;
  const roots = /* @__PURE__ */ new Set();
  for (const path of Object.keys(files)) {
    const [root2, rest] = path.split(/\/(.+)/, 2);
    if (!root2 || !rest) return files;
    roots.add(root2);
  }
  if (roots.size !== 1) return files;
  const [root] = roots;
  if (!files[`${root}/package.json`]) return files;
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [
    path.slice(root.length + 1),
    content
  ]));
}

// packages/npm/src/semver.js
function selectVersion(metadata, range = "latest") {
  const versions = Object.keys(metadata.versions ?? {});
  if (!versions.length) throw new Error(`No versions available for ${metadata.name}`);
  const requestedRange = String(range || "latest").trim();
  const taggedVersion = metadata["dist-tags"]?.[requestedRange];
  if (taggedVersion && metadata.versions[taggedVersion]) return taggedVersion;
  if (requestedRange === "latest" || requestedRange === "*") {
    const latest = metadata["dist-tags"]?.latest;
    if (latest && metadata.versions[latest]) return latest;
  }
  if (metadata.versions[requestedRange]) return requestedRange;
  const compatible = versions.filter((version) => Boolean(parseVersion(version))).sort(compareVersions).filter((version) => satisfiesRange(version, requestedRange));
  if (compatible.length) return compatible.at(-1);
  throw new Error(`Cannot resolve ${metadata.name}@${range}`);
}
function satisfiesRange(version, range) {
  const normalizedRange = String(range || "*").trim().replace(/,/g, " ").replace(/\s+/g, " ").replace(/([<>=~^])\s+/g, "$1");
  if (!normalizedRange || normalizedRange === "*" || /^[xX]$/.test(normalizedRange)) return true;
  return normalizedRange.split(/\s*\|\|\s*/).some((rangePart) => satisfiesRangePart(version, rangePart));
}
function satisfiesRangePart(version, rangePart) {
  const hyphenMatch = rangePart.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (hyphenMatch) {
    return satisfiesComparator(version, ">=", hyphenMatch[1]) && satisfiesComparator(version, "<=", hyphenMatch[2]);
  }
  return rangePart.split(/\s+/).filter(Boolean).every((token) => satisfiesToken(version, token));
}
function satisfiesToken(version, token) {
  if (token === "*" || /^[xX]$/.test(token)) return true;
  if (token.startsWith("^")) return satisfiesCaret(version, token.slice(1));
  if (token.startsWith("~")) return satisfiesTilde(version, token.slice(1));
  const match = token.match(/^(<=|>=|<|>|=)?(.+)$/);
  if (!match) return false;
  const [, comparator = "=", target] = match;
  if (comparator === "=" && isPartialVersion(target)) return satisfiesPartial(version, target);
  return satisfiesComparator(version, comparator, target);
}
function satisfiesComparator(version, comparator, target) {
  const versionParts = parseVersion(version);
  const targetParts = parseVersion(target, { partial: true });
  if (!versionParts || !targetParts) return false;
  const comparison = compareParsedVersions(versionParts, completeVersion(targetParts));
  if (comparator === "<") return comparison < 0;
  if (comparator === "<=") return comparison <= 0;
  if (comparator === ">") return comparison > 0;
  if (comparator === ">=") return comparison >= 0;
  return comparison === 0;
}
function satisfiesPartial(version, target) {
  const versionParts = parseVersion(version);
  const targetParts = parseVersion(target, { partial: true });
  if (!versionParts || !targetParts) return false;
  if (targetParts.major !== null && versionParts.major !== targetParts.major) return false;
  if (targetParts.minor !== null && versionParts.minor !== targetParts.minor) return false;
  if (targetParts.patch !== null && versionParts.patch !== targetParts.patch) return false;
  if (targetParts.prerelease && versionParts.prerelease !== targetParts.prerelease) return false;
  return true;
}
function satisfiesCaret(version, target) {
  const lower = completeVersion(parseVersion(target, { partial: true }));
  if (!lower) return false;
  let upper;
  if (lower.major > 0) upper = { ...lower, major: lower.major + 1, minor: 0, patch: 0, prerelease: "" };
  else if (lower.minor > 0) upper = { ...lower, minor: lower.minor + 1, patch: 0, prerelease: "" };
  else upper = { ...lower, patch: lower.patch + 1, prerelease: "" };
  return compareVersions(version, formatVersion(lower)) >= 0 && compareVersions(version, formatVersion(upper)) < 0;
}
function satisfiesTilde(version, target) {
  const parsed = parseVersion(target, { partial: true });
  const lower = completeVersion(parsed);
  if (!lower) return false;
  const upper = parsed.minor === null ? { ...lower, major: lower.major + 1, minor: 0, patch: 0, prerelease: "" } : { ...lower, minor: lower.minor + 1, patch: 0, prerelease: "" };
  return compareVersions(version, formatVersion(lower)) >= 0 && compareVersions(version, formatVersion(upper)) < 0;
}
function isPartialVersion(version) {
  return /^\s*v?\d+(?:\.(?:\d+|[xX*]))?(?:\.(?:\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?\s*$/.test(String(version || ""));
}
function parseVersion(version, { partial = false } = {}) {
  const value = String(version || "").trim().replace(/^v/, "");
  const match = value.match(/^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  const [, major, minor, patch, prerelease = ""] = match;
  const parsePart = (part, required) => {
    if (part === void 0) return required || !partial ? 0 : null;
    if (part === "x" || part === "X" || part === "*") return partial ? null : 0;
    return Number(part);
  };
  return {
    major: parsePart(major, true),
    minor: parsePart(minor, false),
    patch: parsePart(patch, false),
    prerelease
  };
}
function completeVersion(version) {
  if (!version) return null;
  return {
    major: version.major ?? 0,
    minor: version.minor ?? 0,
    patch: version.patch ?? 0,
    prerelease: version.prerelease ?? ""
  };
}
function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ""}`;
}
function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return String(left).localeCompare(String(right));
  return compareParsedVersions(leftParts, rightParts);
}
function compareParsedVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    const delta = left[key] - right[key];
    if (delta) return delta;
  }
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && !right.prerelease) return 0;
  return comparePrerelease(left.prerelease, right.prerelease);
}
function comparePrerelease(left, right) {
  const leftParts = String(left).split(".");
  const rightParts = String(right).split(".");
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === void 0) return -1;
    if (rightPart === void 0) return 1;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
    if (leftNumber !== null && rightNumber === null) return -1;
    if (leftNumber === null && rightNumber !== null) return 1;
    const comparison = leftPart.localeCompare(rightPart);
    if (comparison) return comparison;
  }
  return 0;
}

// packages/npm/src/installer.js
var NpmInstaller = class {
  constructor({ kernel, registryClient = new RegistryClient() }) {
    this.kernel = kernel;
    this.registryClient = registryClient;
    this.installed = /* @__PURE__ */ new Set();
  }
  async install({ cwd = "/workspace", packages = [], saveDev = false, descriptor } = {}) {
    const manifestPath = resolvePath(cwd, "package.json");
    const manifest = this.kernel.fs.existsSync(manifestPath) ? JSON.parse(this.kernel.fs.readFileSync(manifestPath, "utf8")) : { scripts: {}, dependencies: {}, devDependencies: {} };
    if (packages.length) {
      for (const spec of packages) {
        const { name, range } = parsePackageSpec(spec);
        const target = saveDev ? "devDependencies" : "dependencies";
        manifest[target] ?? (manifest[target] = {});
        manifest[target][name] = range ?? "latest";
      }
      this.kernel.fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}
`);
    }
    const dependencies = {
      ...manifest.dependencies ?? {},
      ...saveDev ? manifest.devDependencies ?? {} : {}
    };
    for (const [name, range] of Object.entries(dependencies)) {
      await this.installPackage({ cwd, name, range, descriptor });
    }
    this.writeLockfile(cwd);
  }
  async installPackage({ cwd, name, range = "latest", descriptor }) {
    const metadata = await this.registryClient.metadata(name);
    const version = selectVersion(metadata, range);
    const key = `${name}@${version}`;
    if (this.installed.has(key)) return;
    this.installed.add(key);
    const packageMetadata = metadata.versions[version];
    const adapter = adapterForPackage(name);
    const packageRoot = joinPath(cwd, "node_modules", name);
    this.kernel.fs.mkdirSync(packageRoot, { recursive: true });
    const files = await this.registryClient.packageFiles(name, version, packageMetadata);
    for (const [filePath, content] of Object.entries(files)) {
      const target = joinPath(packageRoot, filePath);
      this.kernel.fs.mkdirSync(dirname(target), { recursive: true });
      this.kernel.fs.writeFileSync(target, content);
    }
    if (adapter) {
      this.applyAdapter({ name, version, packageRoot, packageMetadata, adapter, descriptor });
    } else if (!this.kernel.fs.existsSync(joinPath(packageRoot, "package.json"))) {
      this.kernel.fs.writeFileSync(joinPath(packageRoot, "package.json"), `${JSON.stringify(packageMetadata, null, 2)}
`);
    }
    for (const [dependencyName, dependencyRange] of Object.entries(packageMetadata.dependencies ?? {})) {
      await this.installPackage({ cwd, name: dependencyName, range: dependencyRange, descriptor });
    }
    this.linkBins({ cwd, name, packageRoot, packageMetadata, adapter });
    await this.runLifecycleScripts({ name, version, packageRoot, packageMetadata, descriptor, adapter });
  }
  applyAdapter({ name, version, packageRoot, packageMetadata, adapter, descriptor }) {
    materializeAdapterFiles(this.kernel.fs, adapter);
    if (adapter.replaceModule) {
      this.kernel.fs.writeFileSync(joinPath(packageRoot, "index.js"), `module.exports = require(${JSON.stringify(adapter.replaceModule)});
`);
      this.kernel.fs.writeFileSync(joinPath(packageRoot, "package.json"), `${JSON.stringify({
        name,
        version,
        main: "index.js",
        opencontainersAdapter: adapter.replaceModule,
        originalPackage: {
          main: packageMetadata.main,
          exports: packageMetadata.exports
        }
      }, null, 2)}
`);
      descriptor?.stdout?.write?.(`adapted ${name}@${version} -> ${adapter.replaceModule}
`);
    }
  }
  linkBins({ cwd, name, packageRoot, packageMetadata, adapter }) {
    const bin = adapter?.replaceBin ?? packageMetadata.bin;
    if (!bin) return;
    const binEntries = typeof bin === "string" ? [[name, bin]] : Object.entries(bin);
    const binRoot = joinPath(cwd, "node_modules/.bin");
    this.kernel.fs.mkdirSync(binRoot, { recursive: true });
    for (const [binName, target] of binEntries) {
      this.kernel.fs.writeFileSync(joinPath(binRoot, binName), `${JSON.stringify({
        type: "node-bin",
        package: name,
        target: String(target).startsWith("/") ? target : joinPath(packageRoot, target)
      }, null, 2)}
`);
    }
  }
  writeLockfile(cwd) {
    this.kernel.fs.writeFileSync(resolvePath(cwd, "package-lock.opencontainers.json"), `${JSON.stringify({
      lockfileVersion: 1,
      packages: [...this.installed].sort()
    }, null, 2)}
`);
  }
  async runLifecycleScripts({ name, version, packageRoot, packageMetadata, descriptor, adapter }) {
    const scripts = packageMetadata.scripts ?? {};
    const lifecycleOrder = ["preinstall", "install", "postinstall", "prepare"];
    const enabledScripts = lifecycleOrder.filter((scriptName) => scripts[scriptName]);
    if (!enabledScripts.length) return;
    if (adapter?.postInstall === "skip") {
      descriptor?.stderr?.write?.(`skipped install scripts for ${name}@${version}; adapter ${adapter.replaceModule ?? "configured"} replaces native package behavior
`);
      return;
    }
    if (!this.kernel.allowInstallScripts) {
      descriptor?.stderr?.write?.(`skipped install scripts for ${name}@${version}; permission disabled
`);
      return;
    }
    for (const scriptName of enabledScripts) {
      descriptor?.stdout?.write?.(`${name}@${version} ${scriptName}: ${scripts[scriptName]}
`);
      const child = this.kernel.spawn("sh", ["-c", scripts[scriptName]], {
        cwd: packageRoot,
        env: {
          ...descriptor?.env ?? {},
          npm_lifecycle_event: scriptName,
          npm_package_name: name,
          npm_package_version: version
        },
        projectId: descriptor?.projectId ?? "default",
        parentPid: descriptor?.pid
      });
      child.stdout.on("data", (chunk) => descriptor?.stdout?.write?.(chunk));
      child.stderr.on("data", (chunk) => descriptor?.stderr?.write?.(chunk));
      const result = await child.completed;
      if (result.status !== 0) {
        throw Object.assign(new Error(`${name}@${version} ${scriptName} failed`), {
          code: "ERR_OPENCONTAINERS_NPM_LIFECYCLE_FAILED",
          status: result.status
        });
      }
    }
  }
};
function parsePackageSpec(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("@");
    const name2 = `@${parts[1]}`;
    return { name: name2, range: parts[2] };
  }
  const [name, range] = spec.split("@");
  return { name, range };
}

// packages/npm/src/npm-command.js
var _NpmCommand_instances, runLegacy_fn;
var NpmCommand = class {
  constructor({ kernel, registryClient = new RegistryClient() }) {
    __privateAdd(this, _NpmCommand_instances);
    this.kernel = kernel;
    this.registryClient = registryClient;
    this.bootstrapper = new NpmBootstrapper({ kernel, registryClient });
    this.legacyInstaller = new NpmInstaller({ kernel, registryClient });
  }
  async run(args, descriptor, { command = "npm" } = {}) {
    if (this.registryClient instanceof MemoryRegistryClient) {
      return __privateMethod(this, _NpmCommand_instances, runLegacy_fn).call(this, command === "npx" ? ["exec", ...args] : args, descriptor);
    }
    const entrypoints = await this.bootstrapper.ensure();
    const cliPath = command === "npx" ? entrypoints.npxRunner : entrypoints.npmRunner;
    const child = this.kernel.spawn("node", [cliPath, ...args], {
      cwd: descriptor.cwd,
      env: {
        ...descriptor.env,
        INIT_CWD: descriptor.cwd,
        npm_execpath: entrypoints.npmCli,
        npm_node_execpath: "/bin/node",
        npm_config_cache: descriptor.env.npm_config_cache ?? "/home/opencontainers/.npm",
        npm_config_audit: descriptor.env.npm_config_audit ?? "false",
        npm_config_fund: descriptor.env.npm_config_fund ?? "false",
        npm_config_update_notifier: descriptor.env.npm_config_update_notifier ?? "false",
        OPENCONTAINERS_NPM_CLI: "1"
      },
      projectId: descriptor.projectId,
      parentPid: descriptor.pid,
      externalNetworkAllowlist: ["registry.npmjs.org"]
    });
    child.stdout.on("data", (chunk) => descriptor.stdout.write(chunk));
    child.stderr.on("data", (chunk) => descriptor.stderr.write(chunk));
    const result = await child.completed;
    return result.status;
  }
};
_NpmCommand_instances = new WeakSet();
runLegacy_fn = async function(args, descriptor) {
  const [command = "--version", ...rest] = args;
  if (command === "--version" || command === "-v") {
    descriptor.stdout.write("opencontainers-npm/0.1.0\n");
    return 0;
  }
  if (command === "install" || command === "i") {
    const saveDev = rest.includes("--save-dev") || rest.includes("-D");
    const packages = rest.filter((arg) => !arg.startsWith("-"));
    await this.legacyInstaller.install({ cwd: descriptor.cwd, packages, saveDev, descriptor });
    descriptor.stdout.write("installed\n");
    return 0;
  }
  if (command === "run") {
    const scriptName = rest[0];
    if (!scriptName) throw new Error("npm run requires a script name");
    const manifest = JSON.parse(this.kernel.fs.readFileSync(`${descriptor.cwd}/package.json`, "utf8"));
    const script = manifest.scripts?.[scriptName];
    if (!script) throw new Error(`Missing script: ${scriptName}`);
    return this.kernel.shell.run(script, {
      cwd: descriptor.cwd,
      env: {
        ...descriptor.env,
        npm_lifecycle_event: scriptName,
        PATH: `${descriptor.cwd}/node_modules/.bin:${descriptor.env.PATH ?? ""}`
      },
      stdout: descriptor.stdout,
      stderr: descriptor.stderr,
      projectId: descriptor.projectId,
      parentPid: descriptor.pid
    });
  }
  if (command === "exec") {
    const [bin, ...binArgs] = rest;
    const child = this.kernel.spawn(bin, binArgs, {
      cwd: descriptor.cwd,
      env: descriptor.env,
      projectId: descriptor.projectId,
      parentPid: descriptor.pid
    });
    child.stdout.on("data", (chunk) => descriptor.stdout.write(chunk));
    child.stderr.on("data", (chunk) => descriptor.stderr.write(chunk));
    const result = await child.completed;
    return result.status;
  }
  if (command === "ls") {
    const nodeModules = `${descriptor.cwd}/node_modules`;
    const names = this.kernel.fs.existsSync(nodeModules) ? this.kernel.fs.readdirSync(nodeModules) : [];
    descriptor.stdout.write(`${names.join("\n")}
`);
    return 0;
  }
  throw new Error(`Unsupported npm command: ${command}`);
};

// packages/shell/src/commands.js
var textDecoder2 = new TextDecoder();
var COMMAND_REGISTRY = /* @__PURE__ */ new Map();
function defineCommand(names, definition) {
  for (const name of Array.isArray(names) ? names : [names]) {
    COMMAND_REGISTRY.set(name, { name, ...definition });
  }
}
function registerDefaultCommandBuiltins(kernel) {
  for (const [name, definition] of COMMAND_REGISTRY) {
    kernel.commandBuiltins.set(name, definition);
  }
}
async function runCommandBuiltin(commandOrDefinition, args, context) {
  const definition = resolveDefinition(commandOrDefinition, context);
  const result = await definition.run(args, commandContext(context));
  return normalizeCommandResult(result, context.cwd);
}
function runCommandBuiltinSync(commandOrDefinition, args, context) {
  const definition = resolveDefinition(commandOrDefinition, context);
  if (definition.sync === false || definition.interactive) {
    throw Object.assign(new Error(`Command ${definition.name} cannot run synchronously`), {
      code: "ERR_OPENCONTAINERS_SYNC_COMMAND_UNSUPPORTED"
    });
  }
  const run = definition.runSync ?? definition.run;
  const result = run(args, commandContext(context));
  if (result && typeof result.then === "function") {
    throw Object.assign(new Error(`Command ${definition.name} cannot run synchronously`), {
      code: "ERR_OPENCONTAINERS_SYNC_COMMAND_UNSUPPORTED"
    });
  }
  return normalizeCommandResult(result, context.cwd);
}
function commandContext(context) {
  return {
    ...context,
    fs: context.fs ?? context.kernel?.fs,
    cwd: context.cwd ?? context.descriptor?.cwd ?? "/workspace",
    env: context.env ?? context.descriptor?.env ?? {},
    stdout: context.stdout ?? context.descriptor?.stdout,
    stderr: context.stderr ?? context.descriptor?.stderr,
    stdin: context.stdin ?? "",
    projectId: context.projectId ?? context.descriptor?.projectId ?? "default",
    parentPid: context.parentPid ?? context.descriptor?.pid,
    descriptor: context.descriptor
  };
}
function resolveDefinition(commandOrDefinition, context) {
  if (typeof commandOrDefinition === "string") {
    const definition = context.kernel?.commandBuiltins.get(commandOrDefinition) ?? COMMAND_REGISTRY.get(commandOrDefinition);
    if (!definition) throw Object.assign(new Error(`Unsupported command: ${commandOrDefinition}`), { code: "ENOENT" });
    return definition;
  }
  return commandOrDefinition;
}
function normalizeCommandResult(result, fallbackCwd) {
  if (typeof result === "number") return { status: result, cwd: fallbackCwd };
  if (!result) return { status: 0, cwd: fallbackCwd };
  return {
    status: result.status ?? 0,
    cwd: result.cwd ?? fallbackCwd
  };
}
function ok(cwd) {
  return { status: 0, cwd };
}
function fail(ctx, command, message, status = 1) {
  ctx.stderr?.write(`${command}: ${message}
`);
  return { status, cwd: ctx.cwd };
}
function resolve(ctx, path = ".") {
  return resolveShellPath(ctx.cwd, path);
}
function parseFlags(args, supported, { stopAtFirstNonFlag = true } = {}) {
  const flags = /* @__PURE__ */ new Set();
  const values = [];
  let stop = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!stop && arg === "--") {
      stop = true;
      continue;
    }
    if (!stop && arg.startsWith("-") && arg !== "-") {
      for (const flag of arg.slice(1)) {
        if (!supported.has(flag)) return { error: `unsupported option -- ${flag}` };
        flags.add(flag);
      }
      continue;
    }
    values.push(arg);
    if (stopAtFirstNonFlag) stop = true;
  }
  return { flags, values };
}
function statMode(stats) {
  if (stats.isDirectory()) return "d";
  if (stats.isSymbolicLink()) return "l";
  return "-";
}
function formatPermissions(mode) {
  const bits = [
    256,
    128,
    64,
    32,
    16,
    8,
    4,
    2,
    1
  ];
  const chars = ["r", "w", "x", "r", "w", "x", "r", "w", "x"];
  return bits.map((bit, index) => mode & bit ? chars[index] : "-").join("");
}
function readTextFile(ctx, path) {
  return ctx.fs.readFileSync(path, "utf8");
}
function writeTextFile(ctx, path, value) {
  ctx.fs.writeFileSync(path, value);
}
function isBinaryText(value) {
  return String(value).includes("\0");
}
function readInputOrFiles(ctx, args) {
  if (!args.length) return [{ path: null, text: String(ctx.stdin ?? "") }];
  return args.map((arg) => {
    const path = resolve(ctx, arg);
    return { path, displayPath: arg, text: readTextFile(ctx, path) };
  });
}
function copyRecursive(ctx, source, destination) {
  const stat = ctx.fs.statSync(source);
  if (stat.isDirectory()) {
    ctx.fs.mkdirSync(destination, { recursive: true });
    for (const child of ctx.fs.readdirSync(source)) {
      copyRecursive(ctx, `${source}/${child}`, `${destination}/${child}`);
    }
    return;
  }
  ctx.fs.copyFileSync(source, destination);
}
function walk(ctx, root, callback) {
  callback(root);
  let stats;
  try {
    stats = ctx.fs.statSync(root);
  } catch {
    return;
  }
  if (!stats.isDirectory()) return;
  for (const name of ctx.fs.readdirSync(root)) {
    walk(ctx, `${root}/${name}`, callback);
  }
}
function commandExists(ctx, command) {
  if (["node", "npm", "npx", "sh"].includes(command)) return `/bin/${command}`;
  if (ctx.kernel?.commandBuiltins.has(command)) return command;
  for (const entry of String(ctx.env?.PATH ?? "").split(":")) {
    if (!entry) continue;
    const candidate = resolvePath(ctx.cwd, `${entry}/${command}`);
    if (ctx.fs.existsSync(candidate)) return candidate;
  }
  const local = resolvePath(ctx.cwd, `node_modules/.bin/${command}`);
  if (ctx.fs.existsSync(local)) return local;
  const workspace = `/workspace/node_modules/.bin/${command}`;
  if (ctx.fs.existsSync(workspace)) return workspace;
  return null;
}
defineCommand("clear", {
  run: (_args, ctx) => {
    ctx.stdout?.write("\x1B[2J\x1B[H");
    return ok(ctx.cwd);
  }
});
defineCommand("pwd", {
  run: (_args, ctx) => {
    ctx.stdout?.write(`${ctx.cwd}
`);
    return ok(ctx.cwd);
  }
});
defineCommand("cd", {
  run: (args, ctx) => {
    if (args.length > 1) return fail(ctx, "cd", "too many arguments");
    const target = resolve(ctx, args[0] ?? "/workspace");
    const stats = ctx.fs.statSync(target);
    if (!stats.isDirectory()) return fail(ctx, "cd", `${target} is not a directory`);
    return { status: 0, cwd: target };
  }
});
defineCommand("ls", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["a", "l", "R"]));
    if (parsed.error) return fail(ctx, "ls", parsed.error, 2);
    const targets = parsed.values.length ? parsed.values : ["."];
    const output = [];
    const listOne = (displayTarget, target, heading) => {
      const stats = ctx.fs.statSync(target);
      if (!stats.isDirectory()) {
        output.push(parsed.flags.has("l") ? formatLongListing(ctx, target, basename(target), stats) : displayTarget);
        return;
      }
      if (heading) output.push(`${displayTarget}:`);
      const names = ctx.fs.readdirSync(target).filter((name) => parsed.flags.has("a") || !name.startsWith("."));
      for (const name of names) {
        const childPath = `${target === "/" ? "" : target}/${name}`;
        const childStats = ctx.fs.lstatSync(childPath);
        output.push(parsed.flags.has("l") ? formatLongListing(ctx, childPath, name, childStats) : name);
      }
      if (!parsed.flags.has("R")) return;
      for (const name of names) {
        const childPath = `${target === "/" ? "" : target}/${name}`;
        if (ctx.fs.statSync(childPath).isDirectory()) {
          output.push("");
          listOne(`${displayTarget.replace(/\/$/, "")}/${name}`, childPath, true);
        }
      }
    };
    try {
      for (let index = 0; index < targets.length; index++) {
        if (index > 0) output.push("");
        listOne(targets[index], resolve(ctx, targets[index]), targets.length > 1 || parsed.flags.has("R"));
      }
      if (output.length) ctx.stdout?.write(`${output.join("\n")}
`);
      return ok(ctx.cwd);
    } catch (error) {
      return fail(ctx, "ls", error.message ?? String(error));
    }
  }
});
function formatLongListing(ctx, path, name, stats) {
  const type = statMode(stats);
  const perms = formatPermissions(stats.mode);
  const size = String(stats.size).padStart(6, " ");
  const date = stats.mtime.toISOString().slice(0, 16).replace("T", " ");
  let display = name;
  if (stats.isSymbolicLink()) {
    try {
      display += ` -> ${ctx.fs.readlinkSync(path)}`;
    } catch {
    }
  }
  return `${type}${perms} 1 user user ${size} ${date} ${display}`;
}
defineCommand("cat", {
  run: (args, ctx) => {
    try {
      for (const entry of readInputOrFiles(ctx, args)) ctx.stdout?.write(entry.text);
      return ok(ctx.cwd);
    } catch (error) {
      return fail(ctx, "cat", error.message ?? String(error));
    }
  }
});
defineCommand("echo", {
  run: (args, ctx) => {
    ctx.stdout?.write(`${args.join(" ")}
`);
    return ok(ctx.cwd);
  }
});
defineCommand("printf", {
  run: (args, ctx) => {
    if (!args.length) return ok(ctx.cwd);
    let index = 1;
    const formatted = String(args[0]).replace(/%(%|s|d|j)/g, (_match, token) => {
      if (token === "%") return "%";
      const value = args[index++] ?? "";
      if (token === "d") return String(Number(value) || 0);
      if (token === "j") return JSON.stringify(value);
      return String(value);
    }).replace(/\\n/g, "\n").replace(/\\t/g, "	");
    ctx.stdout?.write(formatted);
    return ok(ctx.cwd);
  }
});
defineCommand("env", {
  run: (args, ctx) => {
    if (args.length) return fail(ctx, "env", "running commands through env is not supported yet", 2);
    for (const [key, value] of Object.entries(ctx.env ?? {}).sort()) ctx.stdout?.write(`${key}=${value}
`);
    return ok(ctx.cwd);
  }
});
defineCommand("which", {
  run: (args, ctx) => {
    let status = 0;
    for (const command of args) {
      const found = commandExists(ctx, command);
      if (found) ctx.stdout?.write(`${found}
`);
      else status = 1;
    }
    return { status, cwd: ctx.cwd };
  }
});
defineCommand("command", {
  run: (args, ctx) => {
    if (args[0] !== "-v" || args.length < 2) return fail(ctx, "command", "only command -v is supported", 2);
    return COMMAND_REGISTRY.get("which").run(args.slice(1), ctx);
  }
});
defineCommand("true", {
  run: (_args, ctx) => ok(ctx.cwd)
});
defineCommand("false", {
  run: (_args, ctx) => ({ status: 1, cwd: ctx.cwd })
});
defineCommand("exit", {
  run: (args, ctx) => ({ status: shellExitStatus(args[0]), cwd: ctx.cwd })
});
defineCommand("touch", {
  run: (args, ctx) => {
    if (!args.length) return fail(ctx, "touch", "missing file operand", 1);
    for (const arg of args) {
      const path = resolve(ctx, arg);
      if (ctx.fs.existsSync(path)) {
        const data = ctx.fs.readFileSync(path);
        ctx.fs.writeFileSync(path, data);
      } else {
        ctx.fs.writeFileSync(path, "");
      }
    }
    return ok(ctx.cwd);
  }
});
defineCommand("mkdir", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["p"]));
    if (parsed.error) return fail(ctx, "mkdir", parsed.error, 2);
    if (!parsed.values.length) return fail(ctx, "mkdir", "missing operand");
    for (const arg of parsed.values) ctx.fs.mkdirSync(resolve(ctx, arg), { recursive: parsed.flags.has("p") });
    return ok(ctx.cwd);
  }
});
defineCommand("rmdir", {
  run: (args, ctx) => {
    if (!args.length) return fail(ctx, "rmdir", "missing operand");
    for (const arg of args) ctx.fs.rmdirSync(resolve(ctx, arg));
    return ok(ctx.cwd);
  }
});
defineCommand("rm", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["r", "R", "f"]));
    if (parsed.error) return fail(ctx, "rm", parsed.error, 2);
    if (!parsed.values.length && !parsed.flags.has("f")) return fail(ctx, "rm", "missing operand");
    for (const arg of parsed.values) {
      ctx.fs.rmSync(resolve(ctx, arg), {
        recursive: parsed.flags.has("r") || parsed.flags.has("R"),
        force: parsed.flags.has("f")
      });
    }
    return ok(ctx.cwd);
  }
});
defineCommand("cp", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["r", "R"]));
    if (parsed.error) return fail(ctx, "cp", parsed.error, 2);
    if (parsed.values.length < 2) return fail(ctx, "cp", "missing file operand");
    const sources = parsed.values.slice(0, -1);
    const rawDestination = parsed.values.at(-1);
    const destination = resolve(ctx, rawDestination);
    const destinationIsDirectory = ctx.fs.existsSync(destination) && ctx.fs.statSync(destination).isDirectory();
    if (sources.length > 1 && !destinationIsDirectory) return fail(ctx, "cp", "target is not a directory");
    for (const sourceArg of sources) {
      const source = resolve(ctx, sourceArg);
      const sourceStats = ctx.fs.statSync(source);
      if (sourceStats.isDirectory() && !(parsed.flags.has("r") || parsed.flags.has("R"))) return fail(ctx, "cp", `${sourceArg}: omitting directory`);
      const target = destinationIsDirectory ? `${destination}/${basename(source)}` : destination;
      if (sourceStats.isDirectory()) copyRecursive(ctx, source, target);
      else ctx.fs.copyFileSync(source, target);
    }
    return ok(ctx.cwd);
  }
});
defineCommand("mv", {
  run: (args, ctx) => {
    if (args.length < 2) return fail(ctx, "mv", "missing file operand");
    const sources = args.slice(0, -1);
    const destination = resolve(ctx, args.at(-1));
    const destinationIsDirectory = ctx.fs.existsSync(destination) && ctx.fs.statSync(destination).isDirectory();
    if (sources.length > 1 && !destinationIsDirectory) return fail(ctx, "mv", "target is not a directory");
    for (const sourceArg of sources) {
      const source = resolve(ctx, sourceArg);
      const target = destinationIsDirectory ? `${destination}/${basename(source)}` : destination;
      ctx.fs.renameSync(source, target);
    }
    return ok(ctx.cwd);
  }
});
defineCommand("ln", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["s"]));
    if (parsed.error) return fail(ctx, "ln", parsed.error, 2);
    if (!parsed.flags.has("s")) return fail(ctx, "ln", "hard links are not supported; use -s", 2);
    if (parsed.values.length !== 2) return fail(ctx, "ln", "usage: ln -s target link_name", 2);
    ctx.fs.symlinkSync(parsed.values[0], resolve(ctx, parsed.values[1]));
    return ok(ctx.cwd);
  }
});
defineCommand("chmod", {
  run: (args, ctx) => {
    if (args.length < 2) return fail(ctx, "chmod", "missing operand");
    const mode = Number.parseInt(args[0], 8);
    if (!Number.isFinite(mode)) return fail(ctx, "chmod", "only octal modes are supported", 2);
    for (const arg of args.slice(1)) {
      const path = resolve(ctx, arg);
      const node = ctx.fs.nodes?.get(normalizePath(path));
      if (!node) ctx.fs.statSync(path);
      else node.mode = node.mode & 61440 | mode & 4095;
    }
    return ok(ctx.cwd);
  }
});
defineCommand("stat", {
  run: (args, ctx) => {
    if (!args.length) return fail(ctx, "stat", "missing operand");
    for (const arg of args) {
      const path = resolve(ctx, arg);
      const stats = ctx.fs.lstatSync(path);
      ctx.stdout?.write(`  File: ${arg}
  Size: ${stats.size}	Mode: ${(stats.mode & 4095).toString(8)}
Modify: ${stats.mtime.toISOString()}
`);
    }
    return ok(ctx.cwd);
  }
});
defineCommand("basename", {
  run: (args, ctx) => {
    ctx.stdout?.write(`${basename(args[0] ?? "")}
`);
    return ok(ctx.cwd);
  }
});
defineCommand("dirname", {
  run: (args, ctx) => {
    ctx.stdout?.write(`${dirname(args[0] ?? ".")}
`);
    return ok(ctx.cwd);
  }
});
defineCommand("date", {
  run: (_args, ctx) => {
    ctx.stdout?.write(`${(/* @__PURE__ */ new Date()).toString()}
`);
    return ok(ctx.cwd);
  }
});
defineCommand("sleep", {
  sync: false,
  run: async (args, ctx) => {
    const seconds = Number(args[0] ?? 1);
    if (!Number.isFinite(seconds) || seconds < 0) return fail(ctx, "sleep", "invalid time interval", 1);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, seconds * 1e3));
    return ok(ctx.cwd);
  }
});
defineCommand("head", {
  run: (args, ctx) => headTail(args, ctx, "head")
});
defineCommand("tail", {
  run: (args, ctx) => headTail(args, ctx, "tail")
});
function headTail(args, ctx, command) {
  let count = 10;
  const rest = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "-n") {
      count = Number(args[++index]);
      if (!Number.isFinite(count)) return fail(ctx, command, "invalid line count", 2);
      continue;
    }
    if (args[index].startsWith("-n")) {
      count = Number(args[index].slice(2));
      if (!Number.isFinite(count)) return fail(ctx, command, "invalid line count", 2);
      continue;
    }
    if (args[index].startsWith("-")) return fail(ctx, command, `unsupported option -- ${args[index].slice(1)}`, 2);
    rest.push(args[index]);
  }
  const entries = readInputOrFiles(ctx, rest);
  for (const entry of entries) {
    const lines = entry.text.split(/\r?\n/);
    const selected = command === "head" ? lines.slice(0, count) : lines.slice(Math.max(0, lines.length - count));
    ctx.stdout?.write(selected.join("\n"));
    if (!selected.at(-1)?.endsWith("\n")) ctx.stdout?.write("\n");
  }
  return ok(ctx.cwd);
}
defineCommand("wc", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["l", "w", "c"]));
    if (parsed.error) return fail(ctx, "wc", parsed.error, 2);
    const all = !parsed.flags.size;
    const entries = readInputOrFiles(ctx, parsed.values);
    for (const entry of entries) {
      const bytes = new TextEncoder().encode(entry.text).byteLength;
      const lines = entry.text ? entry.text.split("\n").length - (entry.text.endsWith("\n") ? 0 : 1) : 0;
      const words = entry.text.trim() ? entry.text.trim().split(/\s+/).length : 0;
      const parts = [];
      if (all || parsed.flags.has("l")) parts.push(String(lines).padStart(7, " "));
      if (all || parsed.flags.has("w")) parts.push(String(words).padStart(7, " "));
      if (all || parsed.flags.has("c")) parts.push(String(bytes).padStart(7, " "));
      if (entry.displayPath) parts.push(` ${entry.displayPath}`);
      ctx.stdout?.write(`${parts.join("")}
`);
    }
    return ok(ctx.cwd);
  }
});
defineCommand("grep", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["i", "n", "r", "R"]));
    if (parsed.error) return fail(ctx, "grep", parsed.error, 2);
    const [pattern, ...paths] = parsed.values;
    if (!pattern) return fail(ctx, "grep", "missing pattern");
    const flags = parsed.flags.has("i") ? "i" : "";
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const targets = paths.length ? paths.map((path) => resolve(ctx, path)) : [null];
    let matched = false;
    const grepFile = (path, label) => {
      const text = path ? readTextFile(ctx, path) : String(ctx.stdin ?? "");
      text.split(/\r?\n/).forEach((line, index) => {
        if (!regex.test(line)) return;
        matched = true;
        const prefix = [];
        if (paths.length > 1 || parsed.flags.has("r") || parsed.flags.has("R")) prefix.push(label);
        if (parsed.flags.has("n")) prefix.push(String(index + 1));
        ctx.stdout?.write(`${prefix.length ? `${prefix.join(":")}:` : ""}${line}
`);
      });
    };
    for (const target of targets) {
      if (target && ctx.fs.statSync(target).isDirectory()) {
        if (!(parsed.flags.has("r") || parsed.flags.has("R"))) return fail(ctx, "grep", `${target}: is a directory`);
        walk(ctx, target, (path) => {
          if (ctx.fs.statSync(path).isFile()) grepFile(path, path);
        });
      } else {
        grepFile(target, target ?? "");
      }
    }
    return { status: matched ? 0 : 1, cwd: ctx.cwd };
  }
});
defineCommand("find", {
  run: (args, ctx) => {
    let roots = [];
    let namePattern = null;
    let type = null;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "-name") namePattern = args[++index];
      else if (arg === "-type") type = args[++index];
      else if (arg.startsWith("-")) return fail(ctx, "find", `unsupported option ${arg}`, 2);
      else roots.push(arg);
    }
    if (!roots.length) roots = ["."];
    if (type && !["f", "d", "l"].includes(type)) return fail(ctx, "find", `unsupported type ${type}`, 2);
    const matcher = namePattern ? globPattern(namePattern) : null;
    for (const root of roots) {
      const resolvedRoot = resolve(ctx, root);
      walk(ctx, resolvedRoot, (path) => {
        const stats = ctx.fs.lstatSync(path);
        if (type === "f" && !stats.isFile()) return;
        if (type === "d" && !stats.isDirectory()) return;
        if (type === "l" && !stats.isSymbolicLink()) return;
        if (matcher && !matcher.test(basename(path))) return;
        ctx.stdout?.write(`${formatFindPath(root, resolvedRoot, path)}
`);
      });
    }
    return ok(ctx.cwd);
  }
});
function formatFindPath(root, resolvedRoot, path) {
  if (root.startsWith("/")) return path;
  const base = root.replace(/\/+$/, "") || ".";
  if (path === resolvedRoot) return base;
  const suffix = path.slice(resolvedRoot.length).replace(/^\/+/, "");
  return base === "." ? `./${suffix}` : `${base}/${suffix}`;
}
defineCommand("sort", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, /* @__PURE__ */ new Set(["r"]));
    if (parsed.error) return fail(ctx, "sort", parsed.error, 2);
    const text = readInputOrFiles(ctx, parsed.values).map((entry) => entry.text).join("");
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    lines.sort();
    if (parsed.flags.has("r")) lines.reverse();
    ctx.stdout?.write(`${lines.join("\n")}${lines.length ? "\n" : ""}`);
    return ok(ctx.cwd);
  }
});
defineCommand("uniq", {
  run: (args, ctx) => {
    if (args.some((arg) => arg.startsWith("-"))) return fail(ctx, "uniq", "flags are not supported yet", 2);
    const text = readInputOrFiles(ctx, args).map((entry) => entry.text).join("");
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    let previous;
    for (const line of lines) {
      if (line === previous) continue;
      previous = line;
      ctx.stdout?.write(`${line}
`);
    }
    return ok(ctx.cwd);
  }
});
defineCommand(["less", "more"], {
  interactive: true,
  rawTerminal: true,
  sync: false,
  run: (args, ctx) => runPager(args, ctx)
});
defineCommand(["vi", "vim"], {
  interactive: true,
  rawTerminal: true,
  sync: false,
  run: (args, ctx) => runVi(args, ctx)
});
defineCommand("nano", {
  interactive: true,
  rawTerminal: true,
  sync: false,
  run: (args, ctx) => runNano(args, ctx)
});
function globPattern(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function shellExitStatus(value) {
  if (value === void 0) return 0;
  const status = Number(value);
  if (!Number.isFinite(status)) return 2;
  return (Math.trunc(status) % 256 + 256) % 256;
}
function decodeChunk(chunk) {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return textDecoder2.decode(chunk);
  return String(chunk);
}
function terminalSize(ctx) {
  const cols = Number(ctx.descriptor?.env?.COLUMNS ?? ctx.env?.COLUMNS ?? 80);
  const rows = Number(ctx.descriptor?.env?.LINES ?? ctx.env?.LINES ?? 24);
  return {
    cols: Number.isFinite(cols) ? Math.max(20, cols) : 80,
    rows: Number.isFinite(rows) ? Math.max(8, rows) : 24
  };
}
function writeScreen(ctx, value) {
  ctx.stdout?.write(value);
}
function move(row, col) {
  return `\x1B[${row};${col}H`;
}
function clearScreen() {
  return "\x1B[2J\x1B[H";
}
function enterAltScreen() {
  return "\x1B[?1049h\x1B[?25l";
}
function leaveAltScreen() {
  return "\x1B[?25h\x1B[?1049l";
}
function inverse(text) {
  return `\x1B[7m${text}\x1B[0m`;
}
function truncate(value, width) {
  const chars = Array.from(String(value));
  if (chars.length <= width) return String(value).padEnd(width, " ");
  return `${chars.slice(0, Math.max(0, width - 1)).join("")}\u2026`;
}
function parseTerminalKeys(data) {
  const keys = [];
  for (let index = 0; index < data.length; index++) {
    const char = data[index];
    if (char === "\x1B") {
      const seq3 = data.slice(index, index + 3);
      if (["\x1B[A", "\x1B[B", "\x1B[C", "\x1B[D"].includes(seq3)) {
        keys.push({ type: "escape", value: seq3 });
        index += 2;
        continue;
      }
      keys.push({ type: "escape", value: "\x1B" });
      continue;
    }
    keys.push({ type: "char", value: char });
  }
  return keys;
}
function addCleanup(ctx, cleanup) {
  var _a2;
  (_a2 = ctx.descriptor).cleanupTasks ?? (_a2.cleanupTasks = /* @__PURE__ */ new Set());
  ctx.descriptor.cleanupTasks.add(cleanup);
}
function loadEditableFile(ctx, fileArg) {
  const path = fileArg ? resolve(ctx, fileArg) : null;
  let text = "";
  if (path && ctx.fs.existsSync(path)) {
    text = readTextFile(ctx, path);
    if (isBinaryText(text)) throw new Error(`${fileArg}: binary file not supported`);
  }
  return {
    path,
    name: fileArg ?? "[No Name]",
    lines: text.length ? text.replace(/\r\n/g, "\n").split("\n") : [""]
  };
}
function saveEditableFile(ctx, state) {
  if (!state.path) throw new Error("no file name");
  writeTextFile(ctx, state.path, state.lines.join("\n"));
  state.original = state.lines.join("\n");
  state.dirty = false;
}
function runPager(args, ctx) {
  const files = readInputOrFiles(ctx, args);
  const text = files.map((entry) => entry.text).join("");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let offset = 0;
  let resolved = false;
  return new Promise((resolvePager) => {
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      ctx.descriptor?.stdin?.off?.("data", onData);
      writeScreen(ctx, leaveAltScreen());
      resolvePager(ok(ctx.cwd));
    };
    const redraw = () => {
      const { cols, rows } = terminalSize(ctx);
      const pageRows = Math.max(1, rows - 1);
      const visible = lines.slice(offset, offset + pageRows);
      let screen = enterAltScreen() + clearScreen();
      visible.forEach((line, index) => {
        screen += move(index + 1, 1) + truncate(line, cols);
      });
      const percent = lines.length <= pageRows ? "All" : `${Math.min(100, Math.round((offset + pageRows) / lines.length * 100))}%`;
      screen += move(rows, 1) + inverse(truncate(` ${args[0] ?? ""} ${percent} - q to quit `, cols));
      writeScreen(ctx, screen);
    };
    const onData = (chunk) => {
      for (const key of parseTerminalKeys(decodeChunk(chunk))) {
        if (key.value === "q" || key.value === "") return cleanup();
        if (key.value === " " || key.value === "\x1B[B" || key.value === "j") offset = Math.min(Math.max(0, lines.length - 1), offset + 1);
        if (key.value === "b" || key.value === "\x1B[A" || key.value === "k") offset = Math.max(0, offset - 1);
      }
      redraw();
    };
    addCleanup(ctx, cleanup);
    ctx.descriptor?.stdin?.on?.("data", onData);
    redraw();
  });
}
function runVi(args, ctx) {
  let state;
  try {
    state = loadEditableFile(ctx, args[0]);
  } catch (error) {
    ctx.stderr?.write(`vi: ${error.message ?? error}
`);
    return 1;
  }
  state.original = state.lines.join("\n");
  state.dirty = false;
  state.row = 0;
  state.col = 0;
  state.mode = "normal";
  state.command = "";
  state.undo = null;
  let pending = "";
  let message = "";
  let resolved = false;
  return new Promise((resolveVi) => {
    const snapshot = () => {
      state.undo = {
        lines: [...state.lines],
        row: state.row,
        col: state.col
      };
    };
    const markDirty = () => {
      state.dirty = state.lines.join("\n") !== state.original;
    };
    const clamp = () => {
      state.row = Math.max(0, Math.min(state.row, state.lines.length - 1));
      state.col = Math.max(0, Math.min(state.col, state.lines[state.row].length));
    };
    const redraw = () => {
      const { cols, rows } = terminalSize(ctx);
      const bodyRows = Math.max(1, rows - 2);
      const top = Math.max(0, Math.min(state.row, Math.max(0, state.lines.length - bodyRows)));
      let screen = enterAltScreen() + clearScreen();
      for (let index = 0; index < bodyRows; index++) {
        const line = state.lines[top + index];
        screen += move(index + 1, 1) + truncate(line ?? "~", cols);
      }
      const status = `${state.mode === "insert" ? "-- INSERT --" : state.name}${state.dirty ? " [+]" : ""}`;
      screen += move(rows - 1, 1) + inverse(truncate(` ${status}`, cols));
      screen += move(rows, 1) + truncate(state.mode === "command" ? `:${state.command}` : message, cols);
      screen += move(state.row - top + 1, state.col + 1);
      writeScreen(ctx, `${screen}\x1B[?25h`);
    };
    const finish = (status = 0) => {
      if (resolved) return;
      resolved = true;
      ctx.descriptor?.stdin?.off?.("data", onData);
      writeScreen(ctx, leaveAltScreen());
      resolveVi({ status, cwd: ctx.cwd });
    };
    const insertText = (value) => {
      snapshot();
      const line = state.lines[state.row];
      state.lines[state.row] = `${line.slice(0, state.col)}${value}${line.slice(state.col)}`;
      state.col += Array.from(value).length;
      markDirty();
    };
    const insertNewLine = () => {
      snapshot();
      const line = state.lines[state.row];
      state.lines.splice(state.row + 1, 0, line.slice(state.col));
      state.lines[state.row] = line.slice(0, state.col);
      state.row++;
      state.col = 0;
      markDirty();
    };
    const runCommand = () => {
      const command = state.command.trim();
      state.command = "";
      state.mode = "normal";
      try {
        if (command === "w") {
          saveEditableFile(ctx, state);
          message = `"${state.name}" written`;
        } else if (command === "q") {
          if (state.dirty) message = "No write since last change (add ! to override)";
          else finish(0);
        } else if (command === "q!") {
          finish(0);
        } else if (command === "wq" || command === "x") {
          saveEditableFile(ctx, state);
          finish(0);
        } else {
          message = `Not an editor command: ${command}`;
        }
      } catch (error) {
        message = error.message ?? String(error);
      }
    };
    const onNormalKey = (key) => {
      message = "";
      if (pending === "d" && key.value === "d") {
        snapshot();
        state.lines.splice(state.row, 1);
        if (!state.lines.length) state.lines.push("");
        state.col = 0;
        pending = "";
        markDirty();
        clamp();
        return;
      }
      pending = "";
      switch (key.value) {
        case "i":
          state.mode = "insert";
          return;
        case "a":
          state.col = Math.min(state.lines[state.row].length, state.col + 1);
          state.mode = "insert";
          return;
        case "o":
          snapshot();
          state.lines.splice(state.row + 1, 0, "");
          state.row++;
          state.col = 0;
          state.mode = "insert";
          markDirty();
          return;
        case "O":
          snapshot();
          state.lines.splice(state.row, 0, "");
          state.col = 0;
          state.mode = "insert";
          markDirty();
          return;
        case "x":
          if (state.lines[state.row].length) {
            snapshot();
            const line = state.lines[state.row];
            state.lines[state.row] = `${line.slice(0, state.col)}${line.slice(state.col + 1)}`;
            markDirty();
          }
          return;
        case "d":
          pending = "d";
          return;
        case "u":
          if (state.undo) {
            state.lines = [...state.undo.lines];
            state.row = state.undo.row;
            state.col = state.undo.col;
            markDirty();
          }
          return;
        case ":":
          state.mode = "command";
          state.command = "";
          return;
        case "h":
        case "\x1B[D":
          state.col--;
          break;
        case "l":
        case "\x1B[C":
          state.col++;
          break;
        case "j":
        case "\x1B[B":
          state.row++;
          break;
        case "k":
        case "\x1B[A":
          state.row--;
          break;
        case "0":
          state.col = 0;
          break;
        case "$":
          state.col = state.lines[state.row].length;
          break;
      }
      clamp();
    };
    const onData = (chunk) => {
      for (const key of parseTerminalKeys(decodeChunk(chunk))) {
        if (key.value === "") return finish(130);
        if (state.mode === "command") {
          if (key.value === "\r" || key.value === "\n") runCommand();
          else if (key.value === "\x7F" || key.value === "\b") state.command = state.command.slice(0, -1);
          else if (key.value === "\x1B") state.mode = "normal";
          else if (key.type === "char") state.command += key.value;
          continue;
        }
        if (state.mode === "insert") {
          if (key.value === "\x1B") state.mode = "normal";
          else if (key.value === "\r" || key.value === "\n") insertNewLine();
          else if (key.value === "\x7F" || key.value === "\b") {
            if (state.col > 0) {
              snapshot();
              const line = state.lines[state.row];
              state.lines[state.row] = `${line.slice(0, state.col - 1)}${line.slice(state.col)}`;
              state.col--;
              markDirty();
            }
          } else if (key.type === "char" && key.value >= " ") insertText(key.value);
          continue;
        }
        onNormalKey(key);
      }
      redraw();
    };
    addCleanup(ctx, finish);
    ctx.descriptor?.stdin?.on?.("data", onData);
    redraw();
  });
}
function runNano(args, ctx) {
  let state;
  try {
    state = loadEditableFile(ctx, args[0]);
  } catch (error) {
    ctx.stderr?.write(`nano: ${error.message ?? error}
`);
    return 1;
  }
  state.original = state.lines.join("\n");
  state.dirty = false;
  state.row = 0;
  state.col = 0;
  let cutBuffer = "";
  let prompt = null;
  let message = "";
  let resolved = false;
  return new Promise((resolveNano) => {
    const markDirty = () => {
      state.dirty = state.lines.join("\n") !== state.original;
    };
    const clamp = () => {
      state.row = Math.max(0, Math.min(state.row, state.lines.length - 1));
      state.col = Math.max(0, Math.min(state.col, state.lines[state.row].length));
    };
    const redraw = () => {
      const { cols, rows } = terminalSize(ctx);
      const bodyRows = Math.max(1, rows - 3);
      const top = Math.max(0, Math.min(state.row, Math.max(0, state.lines.length - bodyRows)));
      let screen = enterAltScreen() + clearScreen();
      screen += move(1, 1) + inverse(truncate(`  OpenContainers nano  ${state.name}${state.dirty ? " *" : ""}`, cols));
      for (let index = 0; index < bodyRows; index++) {
        const line = state.lines[top + index] ?? "";
        screen += move(index + 2, 1) + truncate(line, cols);
      }
      const footer = prompt ? `${prompt.label}${prompt.value}` : "^O Write Out   ^X Exit   ^K Cut   ^U Paste   ^W Search";
      screen += move(rows - 1, 1) + inverse(truncate(` ${footer}`, cols));
      screen += move(rows, 1) + truncate(message, cols);
      screen += move(state.row - top + 2, state.col + 1);
      writeScreen(ctx, `${screen}\x1B[?25h`);
    };
    const finish = (status = 0) => {
      if (resolved) return;
      resolved = true;
      ctx.descriptor?.stdin?.off?.("data", onData);
      ctx.descriptor?.terminal?.off?.("resize", onResize);
      writeScreen(ctx, leaveAltScreen());
      resolveNano({ status, cwd: ctx.cwd });
    };
    const save = (pathArg = state.name) => {
      const target = state.path ?? resolve(ctx, pathArg);
      state.path = target;
      state.name = pathArg;
      saveEditableFile(ctx, state);
      message = `Wrote ${state.name}`;
    };
    const insert = (value) => {
      const line = state.lines[state.row];
      state.lines[state.row] = `${line.slice(0, state.col)}${value}${line.slice(state.col)}`;
      state.col += Array.from(value).length;
      markDirty();
    };
    const newline = () => {
      const line = state.lines[state.row];
      state.lines.splice(state.row + 1, 0, line.slice(state.col));
      state.lines[state.row] = line.slice(0, state.col);
      state.row++;
      state.col = 0;
      markDirty();
    };
    const backspace = () => {
      if (state.col > 0) {
        const line = state.lines[state.row];
        state.lines[state.row] = `${line.slice(0, state.col - 1)}${line.slice(state.col)}`;
        state.col--;
        markDirty();
      } else if (state.row > 0) {
        const previousLength = state.lines[state.row - 1].length;
        state.lines[state.row - 1] += state.lines[state.row];
        state.lines.splice(state.row, 1);
        state.row--;
        state.col = previousLength;
        markDirty();
      }
    };
    const search = (needle) => {
      for (let row = state.row; row < state.lines.length; row++) {
        const col = state.lines[row].indexOf(needle, row === state.row ? state.col + 1 : 0);
        if (col !== -1) {
          state.row = row;
          state.col = col;
          return;
        }
      }
      message = `"${needle}" not found`;
    };
    const onData = (chunk) => {
      for (const key of parseTerminalKeys(decodeChunk(chunk))) {
        message = "";
        if (prompt) {
          if (key.value === "\r" || key.value === "\n") {
            const active = prompt;
            prompt = null;
            if (active.kind === "save") save(active.value || state.name);
            if (active.kind === "search") search(active.value);
          } else if (key.value === "\x1B") {
            prompt = null;
          } else if (key.value === "\x7F" || key.value === "\b") {
            prompt.value = prompt.value.slice(0, -1);
          } else if (key.type === "char" && key.value >= " ") {
            prompt.value += key.value;
          }
          continue;
        }
        if (key.value === "") {
          if (state.dirty) {
            message = "Modified buffer; press Ctrl+O to save or Ctrl+X again to exit";
            state.dirty = false;
          } else {
            finish(0);
            return;
          }
          continue;
        }
        if (key.value === "") {
          prompt = { kind: "save", label: "File Name to Write: ", value: state.path ? state.name : "" };
          continue;
        }
        if (key.value === "\v") {
          cutBuffer = state.lines.splice(state.row, 1)[0] ?? "";
          if (!state.lines.length) state.lines.push("");
          clamp();
          markDirty();
          continue;
        }
        if (key.value === "") {
          state.lines.splice(state.row, 0, cutBuffer);
          markDirty();
          continue;
        }
        if (key.value === "") {
          prompt = { kind: "search", label: "Search: ", value: "" };
          continue;
        }
        if (key.value === "") return finish(130);
        if (key.value === "\x1B[A") state.row--;
        else if (key.value === "\x1B[B") state.row++;
        else if (key.value === "\x1B[D") state.col--;
        else if (key.value === "\x1B[C") state.col++;
        else if (key.value === "\r" || key.value === "\n") newline();
        else if (key.value === "\x7F" || key.value === "\b") backspace();
        else if (key.type === "char" && key.value >= " ") insert(key.value);
        clamp();
      }
      if (!resolved) redraw();
    };
    const onResize = () => {
      if (!resolved) redraw();
    };
    addCleanup(ctx, finish);
    ctx.descriptor?.stdin?.on?.("data", onData);
    ctx.descriptor?.terminal?.on?.("resize", onResize);
    redraw();
  });
}

// packages/shell/src/parser.js
function tokenize(commandLine) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const push2 = () => {
    if (current !== "") {
      tokens.push(current);
      current = "";
    }
  };
  for (const char of commandLine) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      push2();
      continue;
    }
    current += char;
  }
  push2();
  if (quote) throw new Error(`Unterminated ${quote} quote`);
  return tokens;
}
function splitCommands(commandLine) {
  const commands = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const push2 = (operator) => {
    const value = current.trim();
    if (value) commands.push({ command: value, operator });
    current = "";
  };
  for (let index = 0; index < commandLine.length; index++) {
    const char = commandLine[index];
    const next = commandLine[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "&" && next === "&") {
      push2("&&");
      index++;
      continue;
    }
    if (char === "|" && next === "|") {
      push2("||");
      index++;
      continue;
    }
    if (char === ";") {
      push2(";");
      continue;
    }
    current += char;
  }
  push2(null);
  return commands;
}
function splitPipeline(commandLine) {
  const segments = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const push2 = () => {
    const value = current.trim();
    if (value) segments.push(value);
    current = "";
  };
  for (let index = 0; index < commandLine.length; index++) {
    const char = commandLine[index];
    const next = commandLine[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "|" && next !== "|") {
      push2();
      continue;
    }
    current += char;
  }
  push2();
  return segments;
}
function parsePipeline(commandLine) {
  return {
    segments: splitPipeline(commandLine).map(parsePipelineSegment)
  };
}
function parsePipelineSegment(segment) {
  const tokens = tokenize(segment);
  const redirects = [];
  const args = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if ([">", ">>", "2>", "2>>"].includes(token)) {
      redirects.push({
        fd: token.startsWith("2") ? 2 : 1,
        append: token.endsWith(">>"),
        target: tokens[++index]
      });
      continue;
    }
    if (/^(2?>>|2?>).+/.test(token)) {
      const match = token.match(/^(2?>>|2?>)(.+)$/);
      redirects.push({
        fd: match[1].startsWith("2") ? 2 : 1,
        append: match[1].endsWith(">>"),
        target: match[2]
      });
      continue;
    }
    args.push(token);
  }
  return {
    tokens: args,
    redirects
  };
}

// packages/shell/src/runner.js
var ShellRunner = class {
  constructor({ kernel }) {
    this.kernel = kernel;
  }
  async run(commandLine, options = {}) {
    let cwd = options.cwd ?? "/workspace";
    let lastStatus = 0;
    const commands = splitCommands(commandLine);
    for (let index = 0; index < commands.length; index++) {
      const { command, operator } = commands[index];
      if (index > 0) {
        const previousOperator = commands[index - 1].operator;
        if (previousOperator === "&&" && lastStatus !== 0) continue;
        if (previousOperator === "||" && lastStatus === 0) continue;
      }
      const result = await this.runPipeline(command, {
        ...options,
        cwd
      });
      lastStatus = result.status;
      cwd = result.cwd ?? cwd;
      if (operator === null) break;
    }
    return lastStatus;
  }
  async runPipeline(commandLine, options) {
    const pipeline2 = parsePipeline(commandLine);
    let stdin = options.stdin ?? "";
    let lastResult = { status: 0, cwd: options.cwd };
    for (let index = 0; index < pipeline2.segments.length; index++) {
      const segment = this.prepareSegment(pipeline2.segments[index], options.cwd);
      if (!segment.command) continue;
      const isLast = index === pipeline2.segments.length - 1;
      const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
      const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
      const stdout = isLast && !stdoutRedirect ? options.stdout ?? new MemoryStream() : new MemoryStream();
      const stderr = isLast && !stderrRedirect ? options.stderr ?? new MemoryStream() : new MemoryStream();
      const env = { ...options.env ?? {}, ...segment.env };
      lastResult = await this.runCommand(segment.command, segment.args, {
        ...options,
        cwd: lastResult.cwd ?? options.cwd,
        env,
        stdin,
        stdout,
        stderr
      });
      this.flushSegmentOutput({
        segment,
        stdout,
        stderr,
        stdinTarget: isLast ? options.stdout : null,
        stderrTarget: isLast ? options.stderr : null,
        cwd: lastResult.cwd ?? options.cwd
      });
      stdin = typeof stdout.toString === "function" ? stdout.toString() : "";
    }
    return lastResult;
  }
  async runCommand(command, args, options) {
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) {
      return runCommandBuiltin(builtin, args, {
        kernel: this.kernel,
        cwd: options.cwd,
        env: options.env,
        stdin: options.stdin,
        stdout: options.stdout,
        stderr: options.stderr,
        projectId: options.projectId,
        parentPid: options.parentPid
      });
    }
    const child = this.kernel.spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      projectId: options.projectId,
      parentPid: options.parentPid
    });
    child.stdout.on("data", (chunk) => options.stdout?.write(chunk));
    child.stderr.on("data", (chunk) => options.stderr?.write(chunk));
    const result = await child.completed;
    return { status: result.status, cwd: options.cwd };
  }
  runSync(commandLine, options = {}) {
    let cwd = options.cwd ?? "/workspace";
    let lastStatus = 0;
    const commands = splitCommands(commandLine);
    for (let index = 0; index < commands.length; index++) {
      const { command } = commands[index];
      if (index > 0) {
        const previousOperator = commands[index - 1].operator;
        if (previousOperator === "&&" && lastStatus !== 0) continue;
        if (previousOperator === "||" && lastStatus === 0) continue;
      }
      const result = this.runPipelineSync(command, {
        ...options,
        cwd
      });
      lastStatus = result.status;
      cwd = result.cwd ?? cwd;
    }
    return lastStatus;
  }
  runPipelineSync(commandLine, options) {
    const pipeline2 = parsePipeline(commandLine);
    let stdin = options.stdin ?? "";
    let lastResult = { status: 0, cwd: options.cwd };
    for (let index = 0; index < pipeline2.segments.length; index++) {
      const segment = this.prepareSegment(pipeline2.segments[index], options.cwd);
      if (!segment.command) continue;
      const isLast = index === pipeline2.segments.length - 1;
      const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
      const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
      const stdout = isLast && !stdoutRedirect ? options.stdout ?? new MemoryStream() : new MemoryStream();
      const stderr = isLast && !stderrRedirect ? options.stderr ?? new MemoryStream() : new MemoryStream();
      const env = { ...options.env ?? {}, ...segment.env };
      lastResult = this.runCommandSync(segment.command, segment.args, {
        ...options,
        cwd: lastResult.cwd ?? options.cwd,
        env,
        stdin,
        stdout,
        stderr
      });
      this.flushSegmentOutput({
        segment,
        stdout,
        stderr,
        stdinTarget: isLast ? options.stdout : null,
        stderrTarget: isLast ? options.stderr : null,
        cwd: lastResult.cwd ?? options.cwd
      });
      stdin = typeof stdout.toString === "function" ? stdout.toString() : "";
    }
    return lastResult;
  }
  runCommandSync(command, args, options) {
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) {
      return runCommandBuiltinSync(builtin, args, {
        kernel: this.kernel,
        cwd: options.cwd,
        env: options.env,
        stdin: options.stdin,
        stdout: options.stdout,
        stderr: options.stderr,
        projectId: options.projectId,
        parentPid: options.parentPid
      });
    }
    const result = this.kernel.spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      projectId: options.projectId,
      parentPid: options.parentPid
    });
    options.stdout?.write(result.stdout);
    options.stderr?.write(result.stderr);
    return { status: result.status, cwd: options.cwd };
  }
  prepareSegment(segment, cwd) {
    const tokens = [...segment.tokens];
    const env = {};
    let index = 0;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
      const [key, ...rest] = tokens[index].split("=");
      env[key] = rest.join("=");
      index++;
    }
    return {
      env,
      command: tokens[index],
      args: this.expandGlobs(tokens.slice(index + 1), cwd),
      redirects: segment.redirects
    };
  }
  flushSegmentOutput({ segment, stdout, stderr, stdinTarget, stderrTarget, cwd }) {
    const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
    const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
    if (stdoutRedirect) this.writeRedirect(stdoutRedirect, stdout.toString(), cwd);
    else if (stdout instanceof MemoryStream) stdinTarget?.write(stdout.toString());
    if (stderrRedirect) this.writeRedirect(stderrRedirect, stderr.toString(), cwd);
    else if (stderr instanceof MemoryStream) stderrTarget?.write(stderr.toString());
  }
  writeRedirect(redirect, data, cwd) {
    const target = resolveShellPath(cwd, redirect.target);
    if (redirect.append && this.kernel.fs.existsSync(target)) {
      this.kernel.fs.appendFileSync(target, data);
    } else {
      this.kernel.fs.writeFileSync(target, data);
    }
  }
  expandGlobs(args, cwd) {
    return args.flatMap((arg) => {
      if (!/[*?]/.test(arg)) return [arg];
      const resolved = resolveShellPath(cwd, arg);
      const directory = dirname(resolved);
      const pattern = resolved.slice(directory.length === 1 ? 1 : directory.length + 1);
      if (!this.kernel.fs.existsSync(directory) || !this.kernel.fs.statSync(directory).isDirectory()) return [arg];
      const regex = globToRegex(pattern);
      const matches = this.kernel.fs.readdirSync(directory).filter((name) => regex.test(name)).sort().map((name) => directory === cwd ? name : `${directory}/${name}`);
      return matches.length ? matches : [arg];
    });
  }
};
var MemoryStream = class {
  constructor() {
    this.chunks = [];
  }
  write(chunk) {
    this.chunks.push(typeof chunk === "string" ? chunk : String(chunk));
  }
  toString() {
    return this.chunks.join("");
  }
};
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

// packages/kernel/src/NetManager.js
var _encoding, _peer, _VirtualNetSocket_instances, receive_fn;
var VirtualNetSocket = class extends EventEmitter {
  constructor({ localAddress = "127.0.0.1", localPort = 0, remoteAddress = "127.0.0.1", remotePort = 0 } = {}) {
    super();
    __privateAdd(this, _VirtualNetSocket_instances);
    __privateAdd(this, _encoding);
    __privateAdd(this, _peer);
    this.localAddress = localAddress;
    this.localPort = localPort;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.readyState = "opening";
    this.destroyed = false;
    this.writable = true;
    this.readable = true;
    this.bytesRead = 0;
    this.bytesWritten = 0;
    __privateSet(this, _encoding, null);
  }
  attach(peer) {
    __privateSet(this, _peer, peer);
  }
  open() {
    if (this.destroyed) return;
    this.readyState = "open";
    this.emit("connect");
    this.emit("ready");
  }
  setEncoding(encoding) {
    __privateSet(this, _encoding, encoding);
    return this;
  }
  write(chunk, encoding, callback) {
    if (this.destroyed || !__privateGet(this, _peer) || __privateGet(this, _peer).destroyed) {
      const error = Object.assign(new Error("Socket is closed"), { code: "ERR_STREAM_DESTROYED" });
      callback?.(error);
      this.emit("error", error);
      return false;
    }
    const payload = typeof chunk === "string" ? chunk : new Uint8Array(chunk);
    const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    this.bytesWritten += byteLength;
    queueMicrotask(() => {
      var _a2;
      __privateMethod(_a2 = __privateGet(this, _peer), _VirtualNetSocket_instances, receive_fn).call(_a2, payload);
      callback?.();
    });
    return true;
  }
  end(chunk, encoding, callback) {
    if (chunk !== void 0) this.write(chunk, encoding);
    this.readyState = "readOnly";
    queueMicrotask(() => {
      __privateGet(this, _peer)?.emit("end");
      this.destroy();
      callback?.();
    });
  }
  destroy(error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.readyState = "closed";
    if (error) this.emit("error", error);
    this.emit("close", Boolean(error));
    return this;
  }
  pause() {
    return this;
  }
  resume() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setKeepAlive() {
    return this;
  }
  address() {
    return { address: this.localAddress, family: "IPv4", port: this.localPort };
  }
};
_encoding = new WeakMap();
_peer = new WeakMap();
_VirtualNetSocket_instances = new WeakSet();
receive_fn = function(payload) {
  if (this.destroyed) return;
  const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
  this.bytesRead += byteLength;
  const data = __privateGet(this, _encoding) && payload instanceof Uint8Array ? new TextDecoder().decode(payload) : payload;
  this.emit("data", data);
};
var _NetManager_instances, key_fn;
var NetManager = class {
  constructor() {
    __privateAdd(this, _NetManager_instances);
    this.listeners = /* @__PURE__ */ new Map();
    this.nextEphemeralPort = 43e3;
  }
  listen({ projectId = "default", pid, port = 0, host = "0.0.0.0", connectionListener }) {
    const assignedPort = Number(port) || this.nextEphemeralPort++;
    const key = __privateMethod(this, _NetManager_instances, key_fn).call(this, projectId, assignedPort);
    if (this.listeners.has(key)) {
      throw Object.assign(new Error(`Port ${assignedPort} is already in use for project ${projectId}`), {
        code: "EADDRINUSE"
      });
    }
    this.listeners.set(key, { projectId, pid, port: assignedPort, host, connectionListener });
    return assignedPort;
  }
  connect({ projectId = "default", port, host = "127.0.0.1" }) {
    if (!isLoopbackHost(host)) {
      throw Object.assign(new Error(`Raw TCP to ${host}:${port} is not supported in OpenContainers V1`), {
        code: "ERR_OPENCONTAINERS_RAW_TCP_UNSUPPORTED"
      });
    }
    const listener = this.listeners.get(__privateMethod(this, _NetManager_instances, key_fn).call(this, projectId, Number(port)));
    if (!listener) {
      throw Object.assign(new Error(`No virtual TCP server is listening on ${projectId}:${port}`), {
        code: "ECONNREFUSED"
      });
    }
    const client = new VirtualNetSocket({
      localAddress: "127.0.0.1",
      localPort: this.nextEphemeralPort++,
      remoteAddress: host,
      remotePort: Number(port)
    });
    const server = new VirtualNetSocket({
      localAddress: listener.host === "0.0.0.0" ? "127.0.0.1" : listener.host,
      localPort: Number(port),
      remoteAddress: "127.0.0.1",
      remotePort: client.localPort
    });
    client.attach(server);
    server.attach(client);
    queueMicrotask(() => {
      listener.connectionListener(server);
      server.open();
      client.open();
    });
    return client;
  }
  unregisterForPid(pid) {
    for (const [key, entry] of this.listeners.entries()) {
      if (entry.pid === pid) this.listeners.delete(key);
    }
  }
  hasPid(pid) {
    for (const entry of this.listeners.values()) {
      if (entry.pid === pid) return true;
    }
    return false;
  }
};
_NetManager_instances = new WeakSet();
key_fn = function(projectId, port) {
  return `${projectId}:${port}`;
};
function isLoopbackHost(host = "127.0.0.1") {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(String(host));
}

// packages/runtime-node/src/builtins/buffer.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var _OpenContainersBuffer_instances, fillBytes_fn;
var _OpenContainersBuffer = class _OpenContainersBuffer extends Uint8Array {
  constructor() {
    super(...arguments);
    __privateAdd(this, _OpenContainersBuffer_instances);
  }
  static from(value, encoding = "utf8", length) {
    if (value instanceof ArrayBuffer) {
      const offset = typeof encoding === "number" ? encoding : 0;
      return new _OpenContainersBuffer(value.slice(offset, length === void 0 ? value.byteLength : offset + length));
    }
    if (ArrayBuffer.isView(value)) {
      return new _OpenContainersBuffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (Array.isArray(value)) return new _OpenContainersBuffer(value);
    if (typeof value === "string") {
      const normalizedEncoding = normalizeEncoding(encoding);
      if (normalizedEncoding === "hex") {
        const bytes = new _OpenContainersBuffer(Math.ceil(value.length / 2));
        for (let index = 0; index < bytes.length; index++) {
          bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
        }
        return bytes;
      }
      if (normalizedEncoding === "base64") return base64ToBytes(value);
      if (normalizedEncoding === "latin1") {
        const bytes = new _OpenContainersBuffer(value.length);
        for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 255;
        return bytes;
      }
      return new _OpenContainersBuffer(encoder.encode(value));
    }
    return new _OpenContainersBuffer(value ?? 0);
  }
  static alloc(size, fill = 0, encoding = "utf8") {
    const buffer = new _OpenContainersBuffer(size);
    buffer.fill(fill, 0, size, encoding);
    return buffer;
  }
  static allocUnsafe(size) {
    return new _OpenContainersBuffer(size);
  }
  static allocUnsafeSlow(size) {
    return _OpenContainersBuffer.allocUnsafe(size);
  }
  static concat(chunks, totalLength) {
    const size = totalLength ?? chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const buffer = new _OpenContainersBuffer(size);
    let offset = 0;
    for (const chunk of chunks) {
      const bytes = _OpenContainersBuffer.from(chunk);
      buffer.set(bytes.subarray(0, Math.max(0, size - offset)), offset);
      offset += bytes.byteLength;
      if (offset >= size) break;
    }
    return buffer;
  }
  static compare(left, right) {
    return _OpenContainersBuffer.from(left).compare(right);
  }
  static byteLength(value, encoding) {
    return _OpenContainersBuffer.from(value, encoding).byteLength;
  }
  static isBuffer(value) {
    return value instanceof Uint8Array;
  }
  static isEncoding(encoding) {
    return isKnownEncoding(encoding);
  }
  toString(encoding = "utf8", start = 0, end2 = this.length) {
    const bytes = this.subarray(start, end2);
    const normalizedEncoding = normalizeEncoding(encoding);
    if (normalizedEncoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (normalizedEncoding === "base64") return bytesToBase642(bytes);
    if (normalizedEncoding === "latin1") return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
    return decoder.decode(bytes);
  }
  write(string, offset = 0, length, encoding = "utf8") {
    if (typeof offset === "string") {
      encoding = offset;
      offset = 0;
      length = void 0;
    } else if (typeof length === "string") {
      encoding = length;
      length = void 0;
    }
    const bytes = _OpenContainersBuffer.from(String(string), encoding);
    const writable = Math.min(length ?? bytes.length, bytes.length, this.length - offset);
    this.set(bytes.subarray(0, Math.max(0, writable)), offset);
    return Math.max(0, writable);
  }
  fill(value = 0, start = 0, end2 = this.length, encoding = "utf8") {
    const rangeStart = normalizeRangeIndex(start, this.length);
    const rangeEnd = normalizeRangeIndex(end2, this.length);
    if (rangeEnd <= rangeStart) return this;
    if (typeof value === "string" || Array.isArray(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = _OpenContainersBuffer.from(value, encoding);
      __privateMethod(this, _OpenContainersBuffer_instances, fillBytes_fn).call(this, bytes, rangeStart, rangeEnd);
      return this;
    }
    return super.fill(Number(value) & 255, rangeStart, rangeEnd);
  }
  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    const slice = this.subarray(sourceStart, sourceEnd);
    const writable = Math.min(slice.length, target.length - targetStart);
    target.set(slice.subarray(0, Math.max(0, writable)), targetStart);
    return Math.max(0, writable);
  }
  equals(other) {
    const bytes = _OpenContainersBuffer.from(other);
    if (bytes.length !== this.length) return false;
    return this.every((byte, index) => byte === bytes[index]);
  }
  compare(other) {
    const bytes = _OpenContainersBuffer.from(other);
    const length = Math.min(this.length, bytes.length);
    for (let index = 0; index < length; index++) {
      if (this[index] !== bytes[index]) return this[index] < bytes[index] ? -1 : 1;
    }
    if (this.length === bytes.length) return 0;
    return this.length < bytes.length ? -1 : 1;
  }
  includes(value, byteOffset = 0, encoding) {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }
  indexOf(value, byteOffset = 0, encoding) {
    const needle = normalizeSearchValue(value, encoding);
    const start = normalizeSearchOffset(byteOffset, this.length);
    if (needle.length === 0) return Math.min(start, this.length);
    for (let index = start; index <= this.length - needle.length; index++) {
      let matched = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
        if (this[index + needleIndex] !== needle[needleIndex]) {
          matched = false;
          break;
        }
      }
      if (matched) return index;
    }
    return -1;
  }
  lastIndexOf(value, byteOffset = this.length - 1, encoding) {
    const needle = normalizeSearchValue(value, encoding);
    let start = normalizeSearchOffset(byteOffset, this.length);
    if (needle.length === 0) return Math.min(start, this.length);
    start = Math.min(start, this.length - needle.length);
    for (let index = start; index >= 0; index--) {
      let matched = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
        if (this[index + needleIndex] !== needle[needleIndex]) {
          matched = false;
          break;
        }
      }
      if (matched) return index;
    }
    return -1;
  }
  toJSON() {
    return {
      type: "Buffer",
      data: Array.from(this)
    };
  }
  readUInt8(offset = 0) {
    return this[offset];
  }
  writeUInt8(value, offset = 0) {
    this[offset] = value & 255;
    return offset + 1;
  }
  readInt8(offset = 0) {
    const value = this.readUInt8(offset);
    return value & 128 ? value - 256 : value;
  }
  writeInt8(value, offset = 0) {
    return this.writeUInt8(value, offset);
  }
  readUInt16BE(offset = 0) {
    return this[offset] << 8 | this[offset + 1];
  }
  readUInt16LE(offset = 0) {
    return this[offset] | this[offset + 1] << 8;
  }
  writeUInt16BE(value, offset = 0) {
    this[offset] = value >>> 8 & 255;
    this[offset + 1] = value & 255;
    return offset + 2;
  }
  writeUInt16LE(value, offset = 0) {
    this[offset] = value & 255;
    this[offset + 1] = value >>> 8 & 255;
    return offset + 2;
  }
  readInt16BE(offset = 0) {
    const value = this.readUInt16BE(offset);
    return value & 32768 ? value - 65536 : value;
  }
  readInt16LE(offset = 0) {
    const value = this.readUInt16LE(offset);
    return value & 32768 ? value - 65536 : value;
  }
  writeInt16BE(value, offset = 0) {
    return this.writeUInt16BE(value, offset);
  }
  writeInt16LE(value, offset = 0) {
    return this.writeUInt16LE(value, offset);
  }
  readUInt32BE(offset = 0) {
    return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]) >>> 0;
  }
  readUInt32LE(offset = 0) {
    return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] * 16777216) >>> 0;
  }
  writeUInt32BE(value, offset = 0) {
    this[offset] = value >>> 24 & 255;
    this[offset + 1] = value >>> 16 & 255;
    this[offset + 2] = value >>> 8 & 255;
    this[offset + 3] = value & 255;
    return offset + 4;
  }
  writeUInt32LE(value, offset = 0) {
    this[offset] = value & 255;
    this[offset + 1] = value >>> 8 & 255;
    this[offset + 2] = value >>> 16 & 255;
    this[offset + 3] = value >>> 24 & 255;
    return offset + 4;
  }
  readInt32BE(offset = 0) {
    const value = this.readUInt32BE(offset);
    return value > 2147483647 ? value - 4294967296 : value;
  }
  readInt32LE(offset = 0) {
    const value = this.readUInt32LE(offset);
    return value > 2147483647 ? value - 4294967296 : value;
  }
  writeInt32BE(value, offset = 0) {
    return this.writeUInt32BE(value, offset);
  }
  writeInt32LE(value, offset = 0) {
    return this.writeUInt32LE(value, offset);
  }
  readUIntBE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let value = 0;
    for (let index = 0; index < length; index++) value = value * 256 + this[offset + index];
    return value;
  }
  readUIntLE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let value = 0;
    let multiplier = 1;
    for (let index = 0; index < length; index++) {
      value += this[offset + index] * multiplier;
      multiplier *= 256;
    }
    return value;
  }
  writeUIntBE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let current = checkUnsignedInteger(value, length);
    for (let index = length - 1; index >= 0; index--) {
      this[offset + index] = current & 255;
      current = Math.floor(current / 256);
    }
    return offset + length;
  }
  writeUIntLE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let current = checkUnsignedInteger(value, length);
    for (let index = 0; index < length; index++) {
      this[offset + index] = current & 255;
      current = Math.floor(current / 256);
    }
    return offset + length;
  }
  readIntBE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const value = this.readUIntBE(offset, length);
    const sign = 2 ** (8 * length - 1);
    return value >= sign ? value - sign * 2 : value;
  }
  readIntLE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const value = this.readUIntLE(offset, length);
    const sign = 2 ** (8 * length - 1);
    return value >= sign ? value - sign * 2 : value;
  }
  writeIntBE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const current = checkSignedInteger(value, length);
    return this.writeUIntBE(current < 0 ? current + 2 ** (8 * length) : current, offset, length);
  }
  writeIntLE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const current = checkSignedInteger(value, length);
    return this.writeUIntLE(current < 0 ? current + 2 ** (8 * length) : current, offset, length);
  }
  readFloatBE(offset = 0) {
    checkBounds(this, offset, 4);
    return dataViewFor(this).getFloat32(offset, false);
  }
  readFloatLE(offset = 0) {
    checkBounds(this, offset, 4);
    return dataViewFor(this).getFloat32(offset, true);
  }
  writeFloatBE(value, offset = 0) {
    checkBounds(this, offset, 4);
    dataViewFor(this).setFloat32(offset, Number(value), false);
    return offset + 4;
  }
  writeFloatLE(value, offset = 0) {
    checkBounds(this, offset, 4);
    dataViewFor(this).setFloat32(offset, Number(value), true);
    return offset + 4;
  }
  readDoubleBE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getFloat64(offset, false);
  }
  readDoubleLE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getFloat64(offset, true);
  }
  writeDoubleBE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setFloat64(offset, Number(value), false);
    return offset + 8;
  }
  writeDoubleLE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setFloat64(offset, Number(value), true);
    return offset + 8;
  }
  readBigUInt64BE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigUint64(offset, false);
  }
  readBigUInt64LE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigUint64(offset, true);
  }
  readBigUint64BE(offset = 0) {
    return this.readBigUInt64BE(offset);
  }
  readBigUint64LE(offset = 0) {
    return this.readBigUInt64LE(offset);
  }
  writeBigUInt64BE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigUint64(offset, checkUnsignedBigInt(value), false);
    return offset + 8;
  }
  writeBigUInt64LE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigUint64(offset, checkUnsignedBigInt(value), true);
    return offset + 8;
  }
  writeBigUint64BE(value, offset = 0) {
    return this.writeBigUInt64BE(value, offset);
  }
  writeBigUint64LE(value, offset = 0) {
    return this.writeBigUInt64LE(value, offset);
  }
  readBigInt64BE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigInt64(offset, false);
  }
  readBigInt64LE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigInt64(offset, true);
  }
  writeBigInt64BE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigInt64(offset, checkSignedBigInt(value), false);
    return offset + 8;
  }
  writeBigInt64LE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigInt64(offset, checkSignedBigInt(value), true);
    return offset + 8;
  }
  readUint8(offset = 0) {
    return this.readUInt8(offset);
  }
  readUint16BE(offset = 0) {
    return this.readUInt16BE(offset);
  }
  readUint16LE(offset = 0) {
    return this.readUInt16LE(offset);
  }
  readUint32BE(offset = 0) {
    return this.readUInt32BE(offset);
  }
  readUint32LE(offset = 0) {
    return this.readUInt32LE(offset);
  }
  readUintBE(offset = 0, byteLength = 0) {
    return this.readUIntBE(offset, byteLength);
  }
  readUintLE(offset = 0, byteLength = 0) {
    return this.readUIntLE(offset, byteLength);
  }
  writeUint8(value, offset = 0) {
    return this.writeUInt8(value, offset);
  }
  writeUint16BE(value, offset = 0) {
    return this.writeUInt16BE(value, offset);
  }
  writeUint16LE(value, offset = 0) {
    return this.writeUInt16LE(value, offset);
  }
  writeUint32BE(value, offset = 0) {
    return this.writeUInt32BE(value, offset);
  }
  writeUint32LE(value, offset = 0) {
    return this.writeUInt32LE(value, offset);
  }
  writeUintBE(value, offset = 0, byteLength = 0) {
    return this.writeUIntBE(value, offset, byteLength);
  }
  writeUintLE(value, offset = 0, byteLength = 0) {
    return this.writeUIntLE(value, offset, byteLength);
  }
  swap16() {
    return swapBytes(this, 2);
  }
  swap32() {
    return swapBytes(this, 4);
  }
  swap64() {
    return swapBytes(this, 8);
  }
};
_OpenContainersBuffer_instances = new WeakSet();
fillBytes_fn = function(bytes, start, end2) {
  if (!bytes.length) return;
  for (let offset = start; offset < end2; offset += bytes.length) {
    this.set(bytes.subarray(0, Math.min(bytes.length, end2 - offset)), offset);
  }
};
var OpenContainersBuffer = _OpenContainersBuffer;
OpenContainersBuffer.poolSize = 8192;
var BUFFER_STATIC_METHODS = {
  from: OpenContainersBuffer.from.bind(OpenContainersBuffer),
  alloc: OpenContainersBuffer.alloc.bind(OpenContainersBuffer),
  allocUnsafe: OpenContainersBuffer.allocUnsafe.bind(OpenContainersBuffer),
  allocUnsafeSlow: OpenContainersBuffer.allocUnsafeSlow.bind(OpenContainersBuffer),
  concat: OpenContainersBuffer.concat.bind(OpenContainersBuffer),
  compare: OpenContainersBuffer.compare.bind(OpenContainersBuffer),
  byteLength: OpenContainersBuffer.byteLength.bind(OpenContainersBuffer),
  isBuffer: OpenContainersBuffer.isBuffer.bind(OpenContainersBuffer),
  isEncoding: OpenContainersBuffer.isEncoding.bind(OpenContainersBuffer)
};
installBufferStatics(OpenContainersBuffer, BUFFER_STATIC_METHODS, { overwrite: true, enumerable: true });
var RuntimeBuffer = globalThis.Buffer ?? OpenContainersBuffer;
installBufferStatics(RuntimeBuffer, BUFFER_STATIC_METHODS, {
  enumerable: RuntimeBuffer === OpenContainersBuffer || typeof globalThis.process?.versions?.node !== "string"
});
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = RuntimeBuffer;
var INSPECT_MAX_BYTES = 50;
var kMaxLength = 2147483647;
var kStringMaxLength = 536870888;
var constants = {
  MAX_LENGTH: kMaxLength,
  MAX_STRING_LENGTH: kStringMaxLength
};
var BLOB_CHUNKS = /* @__PURE__ */ Symbol("opencontainers.blobChunks");
function normalizeBlobParts(parts) {
  const chunks = [];
  for (const part of parts) {
    if (part instanceof ArrayBuffer || ArrayBuffer.isView(part) || Array.isArray(part)) {
      chunks.push(OpenContainersBuffer.from(part));
      continue;
    }
    if (part instanceof OpenContainersBlobFallback) {
      chunks.push(...part[BLOB_CHUNKS]);
      continue;
    }
    chunks.push(OpenContainersBuffer.from(String(part)));
  }
  return chunks;
}
var OpenContainersBlobFallback = class _OpenContainersBlobFallback {
  constructor(parts = [], options = {}) {
    this[BLOB_CHUNKS] = normalizeBlobParts(parts);
    this.type = String(options.type ?? "").toLowerCase();
    this.size = this[BLOB_CHUNKS].reduce((total, part) => total + part.byteLength, 0);
  }
  async text() {
    return OpenContainersBuffer.concat(this[BLOB_CHUNKS]).toString();
  }
  async arrayBuffer() {
    const bytes = OpenContainersBuffer.concat(this[BLOB_CHUNKS]);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  slice(start = 0, end2 = this.size, type = "") {
    const rangeStart = normalizeRangeIndex(start, this.size);
    const rangeEnd = normalizeRangeIndex(end2, this.size);
    const bytes = OpenContainersBuffer.concat(this[BLOB_CHUNKS]).subarray(rangeStart, rangeEnd);
    return new _OpenContainersBlobFallback([bytes], { type });
  }
  stream() {
    if (typeof ReadableStream !== "function") {
      throw new Error("ReadableStream is unavailable in this runtime");
    }
    const chunks = [...this[BLOB_CHUNKS]];
    return new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      }
    });
  }
};
var Blob2 = globalThis.Blob ?? OpenContainersBlobFallback;
var File = globalThis.File ?? class OpenContainersFile extends Blob2 {
  constructor(parts = [], name = "", options = {}) {
    super(parts, options);
    this.name = String(name);
    this.lastModified = Number(options.lastModified ?? Date.now());
  }
};
function atob(value) {
  return bytesToBinaryString(base64ToBytes(String(value)));
}
function btoa2(value) {
  return bytesToBase642(binaryStringToBytes(String(value)));
}
function isAscii(input) {
  return OpenContainersBuffer.from(input).every((byte) => byte <= 127);
}
function isUtf8(_input) {
  return true;
}
function transcode(source, _fromEncoding, toEncoding) {
  return RuntimeBuffer.from(RuntimeBuffer.from(source).toString(), toEncoding);
}
var bufferBuiltin = {
  Buffer: RuntimeBuffer,
  SlowBuffer: RuntimeBuffer.alloc,
  Blob: Blob2,
  File,
  atob,
  btoa: btoa2,
  constants,
  INSPECT_MAX_BYTES,
  kMaxLength,
  kStringMaxLength,
  isAscii,
  isUtf8,
  transcode,
  OpenContainersBuffer
};
bufferBuiltin.default = bufferBuiltin;
var buffer_default = bufferBuiltin;
function bytesToBase642(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.slice(index, index + 32768));
  }
  if (typeof globalThis.btoa === "function") return globalThis.btoa(binary);
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  throw new Error("base64 encoding is unavailable in this runtime");
}
function base64ToBytes(value) {
  const normalized = String(value).replace(/\s+/g, "");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(normalized);
    const bytes = new OpenContainersBuffer(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return new OpenContainersBuffer(globalThis.Buffer.from(normalized, "base64"));
  }
  throw new Error("base64 decoding is unavailable in this runtime");
}
function bytesToBinaryString(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.slice(index, index + 32768));
  }
  return binary;
}
function binaryStringToBytes(value) {
  const bytes = new OpenContainersBuffer(value.length);
  for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 255;
  return bytes;
}
function normalizeEncoding(encoding = "utf8") {
  const value = String(encoding || "utf8").toLowerCase().replace(/[-_]/g, "");
  if (value === "utf8" || value === "utf") return "utf8";
  if (value === "ucs2" || value === "utf16le") return "utf8";
  if (value === "ascii" || value === "binary" || value === "latin1") return "latin1";
  if (value === "base64" || value === "base64url") return "base64";
  if (value === "hex") return "hex";
  return "utf8";
}
function isKnownEncoding(encoding) {
  const value = String(encoding || "").toLowerCase().replace(/[-_]/g, "");
  return ["utf8", "utf", "ucs2", "utf16le", "ascii", "binary", "latin1", "base64", "base64url", "hex"].includes(value);
}
function normalizeSearchValue(value, encoding) {
  if (typeof value === "number") return OpenContainersBuffer.from([value & 255]);
  return OpenContainersBuffer.from(value, encoding);
}
function normalizeSearchOffset(offset, length) {
  const value = Number(offset);
  if (!Number.isFinite(value)) return value < 0 ? 0 : length;
  if (value < 0) return Math.max(0, length + Math.trunc(value));
  return Math.min(Math.trunc(value), length);
}
function normalizeRangeIndex(offset, length) {
  const value = Number(offset);
  if (!Number.isFinite(value)) return value < 0 ? 0 : length;
  if (value < 0) return Math.max(0, length + Math.trunc(value));
  return Math.min(Math.max(0, Math.trunc(value)), length);
}
function normalizeIntegerByteLength(byteLength) {
  const length = Number(byteLength);
  if (!Number.isInteger(length) || length < 1 || length > 6) {
    throw new RangeError("byteLength must be an integer between 1 and 6");
  }
  return length;
}
function checkBounds(buffer, offset, byteLength) {
  const normalizedOffset = Number(offset);
  if (!Number.isInteger(normalizedOffset) || normalizedOffset < 0 || normalizedOffset + byteLength > buffer.length) {
    throw new RangeError("Index out of range");
  }
}
function checkUnsignedInteger(value, byteLength) {
  const number = Number(value);
  const max = 2 ** (8 * byteLength);
  if (!Number.isInteger(number) || number < 0 || number >= max) {
    throw new RangeError(`value must be >= 0 and < ${max}`);
  }
  return number;
}
function checkSignedInteger(value, byteLength) {
  const number = Number(value);
  const limit = 2 ** (8 * byteLength - 1);
  if (!Number.isInteger(number) || number < -limit || number >= limit) {
    throw new RangeError(`value must be >= ${-limit} and < ${limit}`);
  }
  return number;
}
function checkUnsignedBigInt(value) {
  const bigint = BigInt(value);
  const max = (1n << 64n) - 1n;
  if (bigint < 0n || bigint > max) {
    throw new RangeError(`value must be >= 0n and <= ${max}n`);
  }
  return bigint;
}
function checkSignedBigInt(value) {
  const bigint = BigInt(value);
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (bigint < min || bigint > max) {
    throw new RangeError(`value must be >= ${min}n and <= ${max}n`);
  }
  return bigint;
}
function dataViewFor(buffer) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
function swapBytes(buffer, size) {
  if (buffer.length % size !== 0) {
    throw new RangeError(`Buffer size must be a multiple of ${size}`);
  }
  for (let offset = 0; offset < buffer.length; offset += size) {
    for (let index = 0; index < size / 2; index++) {
      const left = offset + index;
      const right = offset + size - index - 1;
      const value = buffer[left];
      buffer[left] = buffer[right];
      buffer[right] = value;
    }
  }
  return buffer;
}
function installBufferStatics(target, methods, { overwrite = false, enumerable = false } = {}) {
  for (const [method, implementation] of Object.entries(methods)) {
    const current = target?.[method];
    if (overwrite || typeof current !== "function") {
      Object.defineProperty(target, method, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: implementation
      });
      continue;
    }
    if (!enumerable) continue;
    const descriptor = Object.getOwnPropertyDescriptor(target, method);
    if (!descriptor || descriptor.enumerable || descriptor.configurable === false) continue;
    Object.defineProperty(target, method, {
      ...descriptor,
      enumerable: true
    });
  }
}

// packages/kernel/src/PortManager.js
var _PortManager_instances, key_fn2;
var PortManager = class extends EventEmitter {
  constructor() {
    super();
    __privateAdd(this, _PortManager_instances);
    this.ports = /* @__PURE__ */ new Map();
    this.nextEphemeralPort = 49152;
  }
  register({ projectId = "default", pid, port = 0, host = "0.0.0.0", handler }) {
    const assignedPort = Number(port) || this.nextEphemeralPort++;
    const key = __privateMethod(this, _PortManager_instances, key_fn2).call(this, projectId, assignedPort);
    if (this.ports.has(key)) {
      throw Object.assign(new Error(`Port ${assignedPort} is already in use for project ${projectId}`), {
        code: "EADDRINUSE"
      });
    }
    const entry = { projectId, pid, port: assignedPort, host, handler };
    this.ports.set(key, entry);
    this.emit("register", entry);
    return assignedPort;
  }
  unregister(projectId, port) {
    const key = __privateMethod(this, _PortManager_instances, key_fn2).call(this, projectId, port);
    const entry = this.ports.get(key);
    if (!entry) return;
    this.ports.delete(key);
    this.emit("unregister", entry);
  }
  unregisterForPid(pid) {
    for (const [key, entry] of this.ports) {
      if (entry.pid === pid) {
        this.ports.delete(key);
        this.emit("unregister", entry);
      }
    }
  }
  get(projectId, port) {
    return this.ports.get(__privateMethod(this, _PortManager_instances, key_fn2).call(this, projectId, port));
  }
  list(projectId = "default") {
    return [...this.ports.values()].filter((entry) => entry.projectId === projectId).map(({ projectId: projectId2, pid, port, host }) => ({ projectId: projectId2, pid, port, host }));
  }
  hasPid(pid) {
    for (const entry of this.ports.values()) {
      if (entry.pid === pid) return true;
    }
    return false;
  }
  async dispatch(request) {
    const projectId = request.projectId ?? "default";
    const port = request.port;
    const entry = this.ports.get(__privateMethod(this, _PortManager_instances, key_fn2).call(this, projectId, port));
    if (!entry) {
      return {
        status: 502,
        statusText: "Bad Gateway",
        headers: [["content-type", "text/plain"]],
        body: RuntimeBuffer.from(`No virtual server is listening on ${projectId}:${port}`)
      };
    }
    return entry.handler(request);
  }
};
_PortManager_instances = new WeakSet();
key_fn2 = function(projectId, port) {
  return `${projectId}:${port}`;
};

// packages/runtime-node/src/builtins/stream.js
var Stream = class extends EventEmitter {
  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.on("end", () => destination.end?.());
    return destination;
  }
  unpipe() {
    return this;
  }
};
var _Readable_instances, flushReadable_fn;
var Readable = class extends Stream {
  constructor(options = {}) {
    super();
    __privateAdd(this, _Readable_instances);
    this.readable = true;
    this.destroyed = false;
    this.readableEncoding = options.encoding ?? null;
    this._opencontainersReadableBuffer = [];
    this._opencontainersReadableEnded = false;
    this._opencontainersReadableEndEmitted = false;
    this._opencontainersReadableFlowing = false;
  }
  push(chunk) {
    if (chunk === null) {
      this._opencontainersReadableEnded = true;
      __privateMethod(this, _Readable_instances, flushReadable_fn).call(this);
      return false;
    }
    if (this.listenerCount("data")) this.emit("data", chunk);
    else if (this._opencontainersReadableFlowing) {
    } else this._opencontainersReadableBuffer.push(chunk);
    return true;
  }
  read() {
    if (this._opencontainersReadableBuffer.length) return this._opencontainersReadableBuffer.shift();
    if (this._opencontainersReadableEnded) return null;
    return null;
  }
  on(eventName, listener) {
    return this.addListener(eventName, listener);
  }
  addListener(eventName, listener) {
    super.addListener(eventName, listener);
    if (eventName === "data" || eventName === "end") {
      queueMicrotask(() => __privateMethod(this, _Readable_instances, flushReadable_fn).call(this));
    }
    return this;
  }
  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.on("end", () => destination.end?.());
    return destination;
  }
  pause() {
    this._opencontainersReadableFlowing = false;
    return this;
  }
  resume() {
    this._opencontainersReadableFlowing = true;
    queueMicrotask(() => __privateMethod(this, _Readable_instances, flushReadable_fn).call(this));
    return this;
  }
  setEncoding() {
    return this;
  }
  destroy(error) {
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        const buffered = this.read();
        if (buffered !== null) return Promise.resolve({ value: buffered, done: false });
        if (this._opencontainersReadableEnded) return Promise.resolve({ value: void 0, done: true });
        return new Promise((resolve2, reject) => {
          const cleanup = () => {
            this.off("data", onData);
            this.off("end", onEnd);
            this.off("error", onError);
          };
          const onData = (chunk) => {
            cleanup();
            resolve2({ value: chunk, done: false });
          };
          const onEnd = () => {
            cleanup();
            resolve2({ value: void 0, done: true });
          };
          const onError = (error) => {
            cleanup();
            reject(error);
          };
          this.once("data", onData);
          this.once("end", onEnd);
          this.once("error", onError);
          queueMicrotask(() => __privateMethod(this, _Readable_instances, flushReadable_fn).call(this));
        });
      },
      return: () => {
        this.destroy();
        return Promise.resolve({ value: void 0, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
};
_Readable_instances = new WeakSet();
flushReadable_fn = function() {
  while (this._opencontainersReadableBuffer.length && (this.listenerCount("data") || this._opencontainersReadableFlowing)) {
    const chunk = this._opencontainersReadableBuffer.shift();
    if (this.listenerCount("data")) this.emit("data", chunk);
  }
  if (this._opencontainersReadableEnded && !this._opencontainersReadableEndEmitted && this._opencontainersReadableBuffer.length === 0) {
    this._opencontainersReadableEndEmitted = true;
    this.emit("end");
    this.emit("close");
  }
};
Readable.from = function from(iterable, options = {}) {
  const readable = new Readable(options);
  const isSingleChunk = typeof iterable === "string" || iterable instanceof Uint8Array || iterable instanceof ArrayBuffer || ArrayBuffer.isView(iterable);
  const isSyncIterable = iterable && typeof iterable[Symbol.iterator] === "function";
  if (isSingleChunk || isSyncIterable) {
    try {
      if (isSingleChunk) {
        readable.push(iterable);
      } else {
        for (const chunk of iterable) readable.push(chunk);
      }
      readable.push(null);
    } catch (error) {
      readable.destroy(error);
    }
    return readable;
  }
  queueMicrotask(async () => {
    try {
      for await (const chunk of iterable ?? []) readable.push(chunk);
      readable.push(null);
    } catch (error) {
      readable.destroy(error);
    }
  });
  return readable;
};
Readable.fromWeb = function fromWeb(webStream, options = {}) {
  return Readable.from(readWebStream(webStream), options);
};
Readable.toWeb = function toWeb(readable) {
  return new ReadableStream({
    start(controller) {
      readable.on("data", (chunk) => controller.enqueue(chunk));
      readable.once("end", () => controller.close());
      readable.once("error", (error) => controller.error(error));
    }
  });
};
Readable.isDisturbed = function isDisturbed() {
  return false;
};
var _write;
var Writable = class extends Stream {
  constructor({ write: write2 } = {}) {
    super();
    __privateAdd(this, _write);
    this.writable = true;
    this.destroyed = false;
    __privateSet(this, _write, write2);
  }
  write(chunk, encoding, callback) {
    var _a2;
    try {
      (_a2 = __privateGet(this, _write)) == null ? void 0 : _a2.call(this, chunk, encoding);
      this.emit("data", chunk);
      callback?.();
      return true;
    } catch (error) {
      callback?.(error);
      this.emit("error", error);
      return false;
    }
  }
  end(chunk, encoding, callback) {
    if (chunk !== void 0) this.write(chunk, encoding);
    this.emit("finish");
    this.emit("close");
    callback?.();
  }
  destroy(error) {
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
  }
};
_write = new WeakMap();
Writable.fromWeb = function fromWeb2(webStream) {
  const writer = webStream.getWriter();
  return new Writable({
    write(chunk) {
      writer.write(chunk);
    }
  });
};
Writable.toWeb = function toWeb2(writable) {
  return new WritableStream({
    write(chunk) {
      return new Promise((resolve2, reject) => {
        writable.write(chunk, (error) => {
          if (error) reject(error);
          else resolve2();
        });
      });
    },
    close() {
      writable.end();
    },
    abort(error) {
      writable.destroy(error);
    }
  });
};
var _write2;
var Duplex = class extends Readable {
  constructor(options = {}) {
    super();
    __privateAdd(this, _write2);
    this.writable = true;
    __privateSet(this, _write2, options.write);
  }
  write(chunk, encoding, callback) {
    var _a2;
    (_a2 = __privateGet(this, _write2)) == null ? void 0 : _a2.call(this, chunk, encoding);
    this.emit("data", chunk);
    callback?.();
    return true;
  }
  end(chunk, encoding, callback) {
    if (chunk !== void 0) this.write(chunk, encoding);
    this.emit("finish");
    this.emit("end");
    this.emit("close");
    callback?.();
  }
};
_write2 = new WeakMap();
Duplex.from = function from2(source) {
  if (source instanceof Duplex) return source;
  if (source instanceof Readable) {
    const duplex = new Duplex();
    source.on("data", (chunk) => duplex.push(chunk));
    source.once("end", () => duplex.push(null));
    return duplex;
  }
  return Readable.from(source);
};
function Transform(options = {}) {
  this.readable = true;
  this.writable = true;
  this.destroyed = false;
  this._opencontainersTransformOptions = options;
}
Transform.prototype = Object.create(Stream.prototype);
Transform.prototype.constructor = Transform;
Transform.prototype.push = function push(chunk) {
  if (chunk === null) {
    this.emit("end");
    this.emit("close");
    return false;
  }
  this.emit("data", chunk);
  return true;
};
Transform.prototype.write = function write(chunk, encoding, callback) {
  const done = (error, output) => {
    if (error) {
      callback?.(error);
      this.emit("error", error);
      return;
    }
    if (output !== void 0 && output !== null) this.push(output);
    callback?.();
  };
  try {
    if (typeof this._transform === "function") {
      this._transform(chunk, typeof encoding === "string" ? encoding : "buffer", done);
    } else {
      this.push(chunk);
      done();
    }
    return true;
  } catch (error) {
    done(error);
    return false;
  }
};
Transform.prototype.end = function end(chunk, encoding, callback) {
  const finish = () => {
    this.emit("finish");
    this.emit("end");
    this.emit("close");
    callback?.();
  };
  const flush = () => {
    if (typeof this._flush !== "function") {
      finish();
      return;
    }
    try {
      this._flush((error, output) => {
        if (error) {
          this.emit("error", error);
          callback?.(error);
          return;
        }
        if (output !== void 0 && output !== null) this.push(output);
        finish();
      });
    } catch (error) {
      this.emit("error", error);
      callback?.(error);
    }
  };
  if (chunk !== void 0) this.write(chunk, encoding, flush);
  else flush();
};
Transform.prototype.destroy = function destroy(error) {
  this.destroyed = true;
  if (error) this.emit("error", error);
  this.emit("close");
};
Transform.prototype.setEncoding = function setEncoding() {
  return this;
};
function PassThrough(options = {}) {
  Transform.call(this, options);
}
PassThrough.prototype = Object.create(Transform.prototype);
PassThrough.prototype.constructor = PassThrough;
PassThrough.prototype._transform = function passThroughTransform(chunk, _encoding2, callback) {
  callback(null, chunk);
};
function pipeline(...args) {
  const callback = typeof args.at(-1) === "function" ? args.pop() : () => {
  };
  const streams = args.flat();
  if (streams.length === 0) {
    queueMicrotask(() => callback());
    return void 0;
  }
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    callback(error);
  };
  for (const stream of streams) {
    stream?.once?.("error", finish);
  }
  for (let index = 0; index < streams.length - 1; index++) {
    streams[index]?.pipe?.(streams[index + 1]);
  }
  const last = streams.at(-1);
  last?.once?.("finish", () => finish());
  last?.once?.("close", () => finish());
  return last;
}
function finishedCallback(stream, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") {
    throw new TypeError("The callback argument must be a function");
  }
  finished(stream).then(() => cb(), cb);
  return stream;
}
function pipelinePromise(...args) {
  return new Promise((resolve2, reject) => {
    pipeline(...args, (error) => {
      if (error) reject(error);
      else resolve2();
    });
  });
}
function finished(stream) {
  return new Promise((resolve2, reject) => {
    if (!stream || typeof stream.once !== "function") {
      reject(new TypeError("stream.finished requires a stream"));
      return;
    }
    let settled = false;
    const cleanup = () => {
      stream.off?.("error", onError);
      stream.off?.("finish", onDone);
      stream.off?.("end", onDone);
      stream.off?.("close", onDone);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onError = (error) => settle(reject, error);
    const onDone = () => settle(resolve2);
    stream.once("error", onError);
    stream.once("finish", onDone);
    stream.once("end", onDone);
    stream.once("close", onDone);
  });
}
async function* readWebStream(webStream) {
  const reader = webStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}
Stream.Stream = Stream;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
Stream.pipeline = pipeline;
Stream.finished = finishedCallback;
Stream.isReadable = (value) => Boolean(value?.readable);
Stream.isWritable = (value) => Boolean(value?.writable);
Stream.isErrored = (value) => Boolean(value?.errored);
Stream.isDestroyed = (value) => Boolean(value?.destroyed);
Stream.Readable.from = Readable.from;
Stream.Readable.fromWeb = Readable.fromWeb;
Stream.Readable.toWeb = Readable.toWeb;
Stream.Readable.isDisturbed = Readable.isDisturbed;
Stream.Writable.fromWeb = Writable.fromWeb;
Stream.Writable.toWeb = Writable.toWeb;
Stream.Duplex.from = Duplex.from;
var promises = {
  pipeline: pipelinePromise,
  finished
};
Stream.promises = promises;
var stream_default = Stream;

// packages/runtime-node/src/builtins/fs.js
var _type2;
var Dirent = class {
  constructor(name, type = "file") {
    __privateAdd(this, _type2);
    this.name = name;
    this.parentPath = void 0;
    this.path = void 0;
    __privateSet(this, _type2, type);
  }
  isFile() {
    return __privateGet(this, _type2) === "file";
  }
  isDirectory() {
    return __privateGet(this, _type2) === "directory";
  }
  isSymbolicLink() {
    return __privateGet(this, _type2) === "symlink";
  }
  isBlockDevice() {
    return false;
  }
  isCharacterDevice() {
    return false;
  }
  isFIFO() {
    return false;
  }
  isSocket() {
    return false;
  }
};
_type2 = new WeakMap();
var StatFs = class {
  constructor(path) {
    this.type = 1869636974;
    this.bsize = 4096;
    this.blocks = 1024 * 1024;
    this.bfree = 1024 * 1024;
    this.bavail = 1024 * 1024;
    this.files = 1024 * 1024;
    this.ffree = 1024 * 1024;
    this.path = path;
  }
};
var FS_CONSTANTS = {
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
  O_CREAT: 64,
  O_EXCL: 128,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_DIRECTORY: 65536,
  O_NOFOLLOW: 131072,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFCHR: 8192,
  S_IFBLK: 24576,
  S_IFIFO: 4096,
  S_IFLNK: 40960,
  S_IFSOCK: 49152,
  S_IRWXU: 448,
  S_IRUSR: 256,
  S_IWUSR: 128,
  S_IXUSR: 64,
  S_IRWXG: 56,
  S_IRGRP: 32,
  S_IWGRP: 16,
  S_IXGRP: 8,
  S_IRWXO: 7,
  S_IROTH: 4,
  S_IWOTH: 2,
  S_IXOTH: 1
};
function wrapCallback(fn) {
  return (...args) => {
    const callback = args.at(-1);
    const hasCallback = typeof callback === "function";
    queueMicrotask(() => {
      try {
        const result = fn(...args.slice(0, hasCallback ? -1 : void 0));
        if (hasCallback) callback(null, result);
      } catch (error) {
        if (hasCallback) callback(error);
        else throw error;
      }
    });
  };
}
function randomSuffix(length = 6) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < length; index++) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}
function createFsBuiltin({ kernel, process }) {
  var _entries, _index, _closed2;
  const resolve2 = (path) => resolvePath(process.cwd(), path);
  let nextFd = 100;
  const descriptors = /* @__PURE__ */ new Map();
  const descriptorFor = (fd, operation) => {
    const descriptor = descriptors.get(fd);
    if (!descriptor) {
      throw Object.assign(new Error(`EBADF: bad file descriptor, ${operation}`), { code: "EBADF" });
    }
    return descriptor;
  };
  const toDirent = (entry) => {
    const type = entry.isDirectory?.() ? "directory" : entry.isSymbolicLink?.() ? "symlink" : "file";
    return new Dirent(entry.name, type);
  };
  const readdirWithDirents = (path, options = {}) => {
    const resolved = resolve2(path);
    const entries = kernel.fs.readdirSync(resolved, { ...options, withFileTypes: true }).map(toDirent);
    for (const entry of entries) {
      entry.parentPath = resolved;
      entry.path = resolved;
    }
    return entries;
  };
  const truncateResolvedFile = (resolved, length = 0) => {
    const targetLength = Number(length ?? 0);
    if (!Number.isFinite(targetLength) || targetLength < 0) {
      throw Object.assign(new RangeError('The value of "len" is out of range'), { code: "ERR_OUT_OF_RANGE" });
    }
    const existing = kernel.fs.existsSync(resolved) ? kernel.fs.readFileSync(resolved) : new Uint8Array();
    const output = new Uint8Array(targetLength);
    output.set(existing.subarray(0, Math.min(existing.byteLength, output.byteLength)));
    kernel.fs.writeFileSync(resolved, output);
  };
  const createFileHandle = (fd) => ({
    fd,
    read: async (buffer, offset = 0, length = buffer?.byteLength ?? 0, position = null) => ({
      bytesRead: fs.readSync(fd, buffer, offset, length, position),
      buffer
    }),
    write: async (buffer, offset = 0, length = buffer?.byteLength ?? 0, position = null) => ({
      bytesWritten: fs.writeSync(fd, buffer, offset, length, position),
      buffer
    }),
    readFile: async (options) => fs.readFileSync(descriptorFor(fd, "readFile").path, options),
    writeFile: async (data, options) => fs.writeFileSync(descriptorFor(fd, "writeFile").path, data, options),
    appendFile: async (data, options) => fs.appendFileSync(descriptorFor(fd, "appendFile").path, data, options),
    truncate: async (length = 0) => fs.ftruncateSync(fd, length),
    close: async () => fs.closeSync(fd),
    stat: async () => kernel.fs.statSync(descriptorFor(fd, "stat").path),
    chmod: async (_mode) => {
    }
  });
  class Dir {
    constructor(path) {
      __privateAdd(this, _entries);
      __privateAdd(this, _index, 0);
      __privateAdd(this, _closed2, false);
      this.path = resolve2(path);
      __privateSet(this, _entries, readdirWithDirents(this.path));
    }
    readSync() {
      if (__privateGet(this, _closed2)) {
        throw Object.assign(new Error(`Directory handle was closed`), { code: "ERR_DIR_CLOSED" });
      }
      return __privateGet(this, _entries)[__privateWrapper(this, _index)._++] ?? null;
    }
    read(callback) {
      if (typeof callback === "function") {
        queueMicrotask(() => {
          try {
            callback(null, this.readSync());
          } catch (error) {
            callback(error);
          }
        });
        return;
      }
      return Promise.resolve().then(() => this.readSync());
    }
    closeSync() {
      __privateSet(this, _closed2, true);
    }
    close(callback) {
      if (typeof callback === "function") {
        queueMicrotask(() => {
          this.closeSync();
          callback(null);
        });
        return;
      }
      return Promise.resolve().then(() => this.closeSync());
    }
    async *[Symbol.asyncIterator]() {
      while (true) {
        const entry = this.readSync();
        if (!entry) break;
        yield entry;
      }
    }
  }
  _entries = new WeakMap();
  _index = new WeakMap();
  _closed2 = new WeakMap();
  const copyTreeSync = (source, destination, options = {}) => {
    const sourcePath = resolve2(source);
    const destinationPath = resolve2(destination);
    const sourceStats = kernel.fs.lstatSync(sourcePath);
    if (sourceStats.isDirectory()) {
      if (!options.recursive) {
        throw Object.assign(new Error(`EISDIR: illegal operation on a directory, copyfile '${sourcePath}' -> '${destinationPath}'`), {
          code: "EISDIR",
          path: sourcePath,
          dest: destinationPath
        });
      }
      kernel.fs.mkdirSync(destinationPath, { recursive: true });
      for (const entry of kernel.fs.readdirSync(sourcePath)) {
        copyTreeSync(`${sourcePath}/${entry}`, `${destinationPath}/${entry}`, options);
      }
      return;
    }
    if (kernel.fs.existsSync(destinationPath) && options.errorOnExist) {
      throw Object.assign(new Error(`EEXIST: file already exists, copyfile '${sourcePath}' -> '${destinationPath}'`), {
        code: "EEXIST",
        path: destinationPath
      });
    }
    if (!kernel.fs.existsSync(destinationPath) || options.force !== false) {
      kernel.fs.copyFileSync(sourcePath, destinationPath);
    }
  };
  const fs = {
    readFileSync: (path, options) => kernel.fs.readFileSync(resolve2(path), options),
    writeFileSync: (path, data, options) => kernel.fs.writeFileSync(resolve2(path), data, options),
    appendFileSync: (path, data, options) => kernel.fs.appendFileSync(resolve2(path), data, options),
    existsSync: (path) => kernel.fs.existsSync(resolve2(path)),
    accessSync: (path) => {
      kernel.fs.statSync(resolve2(path));
    },
    statSync: (path) => kernel.fs.statSync(resolve2(path)),
    lstatSync: (path) => kernel.fs.lstatSync(resolve2(path)),
    statfsSync: (path, options = {}) => {
      const resolved = resolve2(path);
      kernel.fs.statSync(resolved);
      const stats = new StatFs(resolved);
      if (options && typeof options === "object" && options.bigint) {
        return Object.fromEntries(Object.entries(stats).map(([key, value]) => [
          key,
          typeof value === "number" ? BigInt(value) : value
        ]));
      }
      return stats;
    },
    utimesSync: (path, atime, mtime) => kernel.fs.utimesSync(resolve2(path), atime, mtime),
    readdirSync: (path, options) => {
      if (options && typeof options === "object" && options.withFileTypes) return readdirWithDirents(path, options);
      return kernel.fs.readdirSync(resolve2(path), options);
    },
    mkdirSync: (path, options) => kernel.fs.mkdirSync(resolve2(path), options),
    rmSync: (path, options) => kernel.fs.rmSync(resolve2(path), options),
    rmdirSync: (path, options) => kernel.fs.rmdirSync(resolve2(path), options),
    unlinkSync: (path) => kernel.fs.unlinkSync(resolve2(path)),
    truncateSync: (path, length = 0) => truncateResolvedFile(resolve2(path), length),
    renameSync: (oldPath, newPath) => kernel.fs.renameSync(resolve2(oldPath), resolve2(newPath)),
    copyFileSync: (source, destination) => kernel.fs.copyFileSync(resolve2(source), resolve2(destination)),
    cpSync: (source, destination, options) => copyTreeSync(source, destination, options),
    chmodSync: () => {
    },
    realpathSync: (path) => kernel.fs.realpathSync(resolve2(path)),
    readlinkSync: (path) => kernel.fs.readlinkSync(resolve2(path)),
    symlinkSync: (target, path) => kernel.fs.symlinkSync(target, resolve2(path)),
    openSync: (path, flags = "r") => {
      const resolved = resolve2(path);
      const stringFlags = String(flags);
      if (stringFlags.includes("w")) {
        kernel.fs.writeFileSync(resolved, new Uint8Array());
      } else if (stringFlags.includes("a")) {
        if (!kernel.fs.existsSync(resolved)) kernel.fs.writeFileSync(resolved, new Uint8Array());
      } else {
        kernel.fs.statSync(resolved);
      }
      const fd = nextFd++;
      descriptors.set(fd, { path: resolved, flags: stringFlags, position: stringFlags.includes("a") ? kernel.fs.readFileSync(resolved).byteLength : 0 });
      return fd;
    },
    closeSync: (fd) => {
      descriptors.delete(fd);
    },
    readSync: (fd, buffer, offset = 0, length = buffer?.byteLength ?? 0, position = null) => {
      const descriptor = descriptorFor(fd, "read");
      const target = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const source = kernel.fs.readFileSync(descriptor.path);
      const readPosition = position === null || position === void 0 ? descriptor.position : Number(position);
      const bytes = source.subarray(readPosition, readPosition + Number(length));
      target.set(bytes, Number(offset));
      if (position === null || position === void 0) descriptor.position = readPosition + bytes.byteLength;
      return bytes.byteLength;
    },
    writeSync: (fd, data, offsetOrPosition, lengthOrEncoding, position) => {
      const descriptor = descriptorFor(fd, "write");
      let bytes;
      let writePosition = position;
      if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
        writePosition = typeof offsetOrPosition === "number" ? offsetOrPosition : descriptor.position;
      } else {
        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
        const offset = Number(offsetOrPosition ?? 0);
        const length = Number(lengthOrEncoding ?? buffer.byteLength - offset);
        bytes = buffer.subarray(offset, offset + length);
        writePosition = typeof position === "number" ? position : descriptor.position;
      }
      const existing = kernel.fs.existsSync(descriptor.path) ? kernel.fs.readFileSync(descriptor.path) : new Uint8Array();
      const targetPosition = descriptor.flags.includes("a") ? existing.byteLength : Number(writePosition ?? descriptor.position ?? 0);
      const output = new Uint8Array(Math.max(existing.byteLength, targetPosition + bytes.byteLength));
      output.set(existing.subarray(0, Math.min(existing.byteLength, output.byteLength)));
      output.set(bytes, targetPosition);
      kernel.fs.writeFileSync(descriptor.path, output);
      descriptor.position = targetPosition + bytes.byteLength;
      return bytes.byteLength;
    },
    ftruncateSync: (fd, length = 0) => truncateResolvedFile(descriptorFor(fd, "ftruncate").path, length),
    mkdtempSync: (prefix) => {
      const base = String(prefix ?? "");
      for (let attempt = 0; attempt < 100; attempt++) {
        const suffix = randomSuffix();
        const candidate = `${base}${suffix}`;
        const resolved = resolve2(candidate);
        if (kernel.fs.existsSync(resolved)) continue;
        kernel.fs.mkdirSync(resolved);
        return candidate.startsWith("/") ? resolved : candidate;
      }
      throw Object.assign(new Error(`EEXIST: too many temporary directories match prefix '${base}'`), { code: "EEXIST" });
    },
    opendirSync: (path) => new Dir(path),
    watch: (path, options, listener) => kernel.fs.watch(resolve2(path), options, listener),
    watchFile: (path, options, listener) => {
      const resolved = resolve2(path);
      const callback = typeof options === "function" ? options : listener;
      if (typeof callback !== "function") throw new TypeError("watchFile listener is required");
      let previous = kernel.fs.existsSync(resolved) ? kernel.fs.statSync(resolved) : null;
      return kernel.fs.watch(resolved, () => {
        const current = kernel.fs.existsSync(resolved) ? kernel.fs.statSync(resolved) : null;
        callback(current, previous);
        previous = current;
      });
    },
    unwatchFile: () => {
    },
    createReadStream: (path, options = {}) => {
      const stream = new Readable();
      queueMicrotask(() => {
        try {
          stream.push(kernel.fs.readFileSync(resolve2(path), options.encoding ? { encoding: options.encoding } : void 0));
          stream.push(null);
        } catch (error) {
          stream.emit("error", error);
          stream.destroy(error);
        }
      });
      return stream;
    },
    createWriteStream: (path, options = {}) => {
      const chunks = [];
      const stream = new Writable({
        write: (chunk) => {
          chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
        }
      });
      const finish = () => {
        const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (options.flags === "a") kernel.fs.appendFileSync(resolve2(path), data);
        else kernel.fs.writeFileSync(resolve2(path), data);
      };
      stream.once("finish", finish);
      return stream;
    },
    constants: FS_CONSTANTS
  };
  Object.assign(fs, FS_CONSTANTS);
  fs.Dirent = Dirent;
  fs.Dir = Dir;
  fs.Stats = kernel.fs.statSync("/").constructor;
  fs.StatFs = StatFs;
  fs.readFile = wrapCallback((path, options) => fs.readFileSync(path, options));
  fs.writeFile = wrapCallback((path, data, options) => fs.writeFileSync(path, data, options));
  fs.appendFile = wrapCallback((path, data, options) => fs.appendFileSync(path, data, options));
  fs.readdir = wrapCallback((path, options) => fs.readdirSync(path, options));
  fs.access = wrapCallback((path) => fs.accessSync(path));
  fs.stat = wrapCallback((path) => fs.statSync(path));
  fs.lstat = wrapCallback((path) => fs.lstatSync(path));
  fs.statfs = wrapCallback((path, options) => fs.statfsSync(path, options));
  fs.utimes = wrapCallback((path, atime, mtime) => fs.utimesSync(path, atime, mtime));
  fs.mkdir = wrapCallback((path, options) => fs.mkdirSync(path, options));
  fs.rm = wrapCallback((path, options) => fs.rmSync(path, options));
  fs.rmdir = wrapCallback((path, options) => fs.rmdirSync(path, options));
  fs.unlink = wrapCallback((path) => fs.unlinkSync(path));
  fs.rename = wrapCallback((oldPath, newPath) => fs.renameSync(oldPath, newPath));
  fs.copyFile = wrapCallback((source, destination) => fs.copyFileSync(source, destination));
  fs.cp = wrapCallback((source, destination, options) => fs.cpSync(source, destination, options));
  fs.chmod = wrapCallback((path, mode) => fs.chmodSync(path, mode));
  fs.realpath = wrapCallback((path) => fs.realpathSync(path));
  fs.realpath.native = fs.realpath;
  fs.open = wrapCallback((path, flags, mode) => fs.openSync(path, flags, mode));
  fs.close = wrapCallback((fd) => fs.closeSync(fd));
  fs.read = wrapCallback((fd, buffer, offset, length, position) => fs.readSync(fd, buffer, offset, length, position));
  fs.write = wrapCallback((fd, data, offset, length, position) => fs.writeSync(fd, data, offset, length, position));
  fs.truncate = wrapCallback((path, length) => fs.truncateSync(path, length));
  fs.ftruncate = wrapCallback((fd, length) => fs.ftruncateSync(fd, length));
  fs.mkdtemp = wrapCallback((prefix) => fs.mkdtempSync(prefix));
  fs.opendir = wrapCallback((path) => fs.opendirSync(path));
  fs.readlink = wrapCallback((path) => fs.readlinkSync(path));
  fs.symlink = wrapCallback((target, path) => fs.symlinkSync(target, path));
  fs.readlinkSync.native = fs.readlinkSync;
  fs.realpathSync.native = fs.realpathSync;
  fs.promises = {
    readFile: async (path, options) => fs.readFileSync(path, options),
    writeFile: async (path, data, options) => fs.writeFileSync(path, data, options),
    appendFile: async (path, data, options) => fs.appendFileSync(path, data, options),
    exists: async (path) => fs.existsSync(path),
    access: async (path) => fs.accessSync(path),
    stat: async (path) => fs.statSync(path),
    lstat: async (path) => fs.lstatSync(path),
    statfs: async (path, options) => fs.statfsSync(path, options),
    utimes: async (path, atime, mtime) => fs.utimesSync(path, atime, mtime),
    readdir: async (path, options) => fs.readdirSync(path, options),
    mkdir: async (path, options) => fs.mkdirSync(path, options),
    rm: async (path, options) => fs.rmSync(path, options),
    rmdir: async (path, options) => fs.rmdirSync(path, options),
    rename: async (oldPath, newPath) => fs.renameSync(oldPath, newPath),
    copyFile: async (source, destination) => fs.copyFileSync(source, destination),
    cp: async (source, destination, options) => fs.cpSync(source, destination, options),
    chmod: async (path, mode) => fs.chmodSync(path, mode),
    realpath: async (path) => fs.realpathSync(path),
    readlink: async (path) => fs.readlinkSync(path),
    symlink: async (target, path) => fs.symlinkSync(target, path),
    truncate: async (path, length) => fs.truncateSync(path, length),
    ftruncate: async (fd, length) => fs.ftruncateSync(fd, length),
    mkdtemp: async (prefix) => fs.mkdtempSync(prefix),
    opendir: async (path) => fs.opendirSync(path),
    open: async (path, flags, mode) => {
      const fd = fs.openSync(path, flags, mode);
      return createFileHandle(fd);
    },
    unlink: async (path) => fs.unlinkSync(path)
  };
  fs.promises.realpath.native = fs.promises.realpath;
  return fs;
}

// packages/runtime-node/src/builtins/path.js
var sep = "/";
var delimiter = ":";
var parsePath = (path) => {
  const normalized = normalizePath(path);
  const dir = dirname(normalized);
  const base = basename(normalized);
  const ext = extname(base);
  return {
    root: normalized.startsWith("/") ? "/" : "",
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base
  };
};
var formatPath = (pathObject = {}) => {
  const dir = pathObject.dir || pathObject.root || "";
  const base = pathObject.base || `${pathObject.name || ""}${pathObject.ext || ""}`;
  if (!dir) return base;
  if (dir === "/") return `/${base}`;
  return `${dir}/${base}`;
};
var posix = {
  sep,
  delimiter,
  normalize: normalizePath,
  join: (...parts) => normalizePath(joinPath(...parts)),
  resolve: (...parts) => {
    let resolved = "";
    for (const part of parts) {
      if (String(part).startsWith("/")) resolved = String(part);
      else resolved = `${resolved || "/"}/${part}`;
    }
    return normalizePath(resolved || "/");
  },
  dirname,
  basename,
  extname,
  isAbsolute: (path) => String(path).startsWith("/"),
  relative: relativePath,
  toNamespacedPath: (path) => path,
  parse: parsePath,
  format: formatPath,
  matchesGlob: (path, pattern) => matchesGlob(path, pattern)
};
var win32 = {
  ...posix,
  sep: "\\",
  delimiter: ";",
  isAbsolute: (path) => /^[a-z]:[\\/]/i.test(String(path)) || /^[\\/]{2}/.test(String(path))
};
var path_default = {
  ...posix,
  posix,
  win32
};
function matchesGlob(path, pattern) {
  const source = String(path);
  const regex = globToRegExp(String(pattern));
  return regex.test(source);
}
function globToRegExp(pattern) {
  let output = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*") {
      if (next === "*") {
        output += ".*";
        index += 1;
      } else {
        output += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      output += "[^/]";
      continue;
    }
    if (char === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close > index + 1) {
        output += pattern.slice(index, close + 1);
        index = close;
        continue;
      }
    }
    output += escapeRegExp(char);
  }
  output += "$";
  return new RegExp(output);
}
function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

// packages/runtime-node/src/builtins/string_decoder.js
var StringDecoder = class {
  constructor(encoding = "utf8") {
    this.encoding = normalizeEncoding2(encoding);
    this.pending = new Uint8Array();
    this.decoder = new TextDecoder(this.encoding === "utf16le" ? "utf-16le" : "utf-8");
  }
  write(buffer) {
    const bytes = toBytes(buffer);
    const data = concatBytes(this.pending, bytes);
    this.pending = new Uint8Array();
    return decodeBytes(data, this.encoding, this.decoder, { stream: true });
  }
  end(buffer) {
    const bytes = buffer === void 0 ? this.pending : concatBytes(this.pending, toBytes(buffer));
    this.pending = new Uint8Array();
    return decodeBytes(bytes, this.encoding, this.decoder, { stream: false });
  }
};
function normalizeEncoding2(encoding) {
  const normalized = String(encoding || "utf8").toLowerCase().replace(/[-_]/g, "");
  if (normalized === "utf8" || normalized === "utf") return "utf8";
  if (normalized === "utf16le" || normalized === "ucs2") return "utf16le";
  if (normalized === "base64") return "base64";
  if (normalized === "hex") return "hex";
  if (normalized === "latin1" || normalized === "binary") return "latin1";
  return "utf8";
}
function toBytes(value) {
  if (value === void 0 || value === null) return new Uint8Array();
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}
function concatBytes(left, right) {
  if (!left.byteLength) return right;
  if (!right.byteLength) return left;
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left);
  merged.set(right, left.byteLength);
  return merged;
}
function decodeBytes(bytes, encoding, decoder2, options) {
  if (encoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (encoding === "base64") return bytesToBase643(bytes);
  if (encoding === "latin1") return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return decoder2.decode(bytes, options);
}
function bytesToBase643(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.slice(index, index + 32768));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  throw new Error("base64 encoding is unavailable");
}
var string_decoder_default = {
  StringDecoder
};

// packages/runtime-node/src/builtins/tty.js
function isatty(fd) {
  return [0, 1, 2].includes(Number(fd));
}
var ReadStream = class extends EventEmitter {
  constructor(fd = 0) {
    super();
    this.fd = fd;
    this.isTTY = isatty(fd);
    this.isRaw = false;
  }
  setRawMode(value) {
    this.isRaw = Boolean(value);
    return this;
  }
};
var WriteStream = class extends Writable {
  constructor(fd = 1) {
    super();
    this.fd = fd;
    this.isTTY = isatty(fd);
    this.columns = 80;
    this.rows = 24;
  }
  clearLine(direction = 0, callback) {
    callback?.();
    return true;
  }
  clearScreenDown(callback) {
    callback?.();
    return true;
  }
  cursorTo(x, y, callback) {
    if (typeof y === "function") y();
    else callback?.();
    return true;
  }
  moveCursor(dx, dy, callback) {
    callback?.();
    return true;
  }
  getColorDepth() {
    return 24;
  }
  hasColors() {
    return true;
  }
};
var tty_default = {
  isatty,
  ReadStream,
  WriteStream
};

// packages/runtime-node/src/builtins/readline.js
var _prompt, _question, _questionRefed, _onInputData, _Interface_instances, refQuestion_fn, unrefQuestion_fn;
var Interface = class extends EventEmitter {
  constructor(options = {}) {
    super();
    __privateAdd(this, _Interface_instances);
    __privateAdd(this, _prompt);
    __privateAdd(this, _question);
    __privateAdd(this, _questionRefed);
    __privateAdd(this, _onInputData);
    this.input = options.input;
    this.output = options.output;
    this.terminal = Boolean(options.terminal);
    this.closed = false;
    this.line = "";
    __privateSet(this, _prompt, options.prompt ?? "> ");
    __privateSet(this, _question, null);
    __privateSet(this, _questionRefed, false);
    __privateSet(this, _onInputData, (chunk) => this.write(chunk));
    this.input?.on?.("data", __privateGet(this, _onInputData));
  }
  setPrompt(prompt) {
    __privateSet(this, _prompt, String(prompt));
  }
  getPrompt() {
    return __privateGet(this, _prompt);
  }
  prompt() {
    this.output?.write?.(__privateGet(this, _prompt));
  }
  question(query, callback) {
    __privateMethod(this, _Interface_instances, refQuestion_fn).call(this);
    __privateSet(this, _question, callback);
    this.output?.write?.(query);
  }
  write(data) {
    const text = typeof data === "string" ? data : data?.toString?.() ?? String(data);
    for (const char of text) {
      if (char === "\r") continue;
      if (char === "\n") {
        const line = this.line;
        this.line = "";
        if (__privateGet(this, _question)) {
          const callback = __privateGet(this, _question);
          __privateSet(this, _question, null);
          __privateMethod(this, _Interface_instances, unrefQuestion_fn).call(this);
          callback(line);
        }
        this.emit("line", line);
      } else {
        this.line += char;
      }
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    __privateSet(this, _question, null);
    __privateMethod(this, _Interface_instances, unrefQuestion_fn).call(this);
    this.input?.off?.("data", __privateGet(this, _onInputData));
    this.input?.removeListener?.("data", __privateGet(this, _onInputData));
    this.emit("close");
  }
  pause() {
    return this;
  }
  resume() {
    return this;
  }
};
_prompt = new WeakMap();
_question = new WeakMap();
_questionRefed = new WeakMap();
_onInputData = new WeakMap();
_Interface_instances = new WeakSet();
refQuestion_fn = function() {
  if (__privateGet(this, _questionRefed)) return;
  this.input?.__opencontainersProcess?.__opencontainersAddRef?.();
  __privateSet(this, _questionRefed, true);
};
unrefQuestion_fn = function() {
  if (!__privateGet(this, _questionRefed)) return;
  __privateSet(this, _questionRefed, false);
  this.input?.__opencontainersProcess?.__opencontainersUnref?.();
};
function createInterface(options) {
  return new Interface(options);
}
var PromisesInterface = class extends Interface {
  question(query, options = {}) {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(createAbortError2(signal.reason));
    return new Promise((resolve2, reject) => {
      const cleanup = () => {
        signal?.removeEventListener?.("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(createAbortError2(signal.reason));
      };
      signal?.addEventListener?.("abort", onAbort, { once: true });
      super.question(query, (answer) => {
        cleanup();
        resolve2(answer);
      });
    });
  }
};
function createPromisesInterface(options) {
  return new PromisesInterface(options);
}
function clearLine(stream, direction, callback) {
  return stream?.clearLine?.(direction, callback) ?? true;
}
function clearScreenDown(stream, callback) {
  return stream?.clearScreenDown?.(callback) ?? true;
}
function cursorTo(stream, x, y, callback) {
  return stream?.cursorTo?.(x, y, callback) ?? true;
}
function moveCursor(stream, dx, dy, callback) {
  return stream?.moveCursor?.(dx, dy, callback) ?? true;
}
var promises2 = {
  Interface: PromisesInterface,
  createInterface: createPromisesInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor
};
var readlineBuiltin = {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
  promises: promises2
};
var readline_default = readlineBuiltin;
function createAbortError2(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (reason !== void 0) error.cause = reason;
  return error;
}

// packages/runtime-node/src/builtins/process.js
var OPENCONTAINERS_NODE_VERSION = "26.0.0";
var OPENCONTAINERS_PROCESS_VERSION = `v${OPENCONTAINERS_NODE_VERSION}`;
var OPENCONTAINERS_V8_VERSION = "14.3.127.18-node.10";
var OPENCONTAINERS_VERSIONS = {
  node: OPENCONTAINERS_NODE_VERSION,
  v8: OPENCONTAINERS_V8_VERSION,
  modules: "144",
  napi: "10",
  opencontainers: "0.1.0"
};
function createProcessBuiltin({ descriptor, kernel, asyncContextManager, getBuiltinModule }) {
  const proc = new EventEmitter();
  const startNs = nowNs();
  proc.pid = descriptor.pid;
  proc.ppid = descriptor.ppid ?? 0;
  Object.defineProperty(proc, "__opencontainersNetworkAllowlist", {
    value: Object.freeze([...descriptor.externalNetworkAllowlist ?? []]),
    enumerable: false
  });
  proc.argv = [...descriptor.argv];
  proc.argv0 = descriptor.argv?.[0] ?? "node";
  proc.execPath = "/bin/node";
  proc.execArgv = [];
  proc.env = descriptor.env;
  proc.platform = "opencontainers";
  proc.arch = "wasm";
  proc.title = "node";
  proc.version = OPENCONTAINERS_PROCESS_VERSION;
  proc.versions = { ...OPENCONTAINERS_VERSIONS };
  proc.release = {
    name: "node",
    sourceUrl: "https://nodejs.org/download/release/",
    headersUrl: "https://nodejs.org/download/release/"
  };
  proc.config = Object.freeze({
    variables: Object.freeze({}),
    target_defaults: Object.freeze({})
  });
  proc.features = Object.freeze({
    inspector: false,
    debug: false,
    uv: false,
    ipv6: true,
    tls: true,
    cached_builtins: false
  });
  proc.allowedNodeEnvironmentFlags = /* @__PURE__ */ new Set();
  Object.defineProperty(proc, "exitCode", {
    get: () => descriptor.exitCode,
    set: (code) => {
      descriptor.exitCode = Number(code) || 0;
    }
  });
  proc.stdin = descriptor.stdin;
  proc.stdout = descriptor.stdout;
  proc.stderr = descriptor.stderr;
  markProcessStream(proc.stdin, proc, 0);
  markProcessStream(proc.stdout, proc, 1);
  markProcessStream(proc.stderr, proc, 2);
  proc.cwd = () => descriptor.cwd;
  proc.chdir = (path) => {
    descriptor.cwd = kernel.resolvePath(descriptor.cwd, path);
    kernel.fs.statSync(descriptor.cwd);
  };
  let umaskValue = 18;
  proc.umask = (mask) => {
    const previous = umaskValue;
    if (mask !== void 0) umaskValue = Number(mask);
    return previous;
  };
  proc.getuid = () => 1e3;
  proc.getgid = () => 1e3;
  proc.geteuid = () => 1e3;
  proc.getegid = () => 1e3;
  proc.exit = (code = void 0) => {
    const exitCode = Number(code ?? descriptor.exitCode ?? 0) || 0;
    descriptor.exitCode = exitCode;
    proc.emit("exit", exitCode);
    throw Object.assign(new Error(`Process exited with code ${code}`), {
      code: "OPENCONTAINERS_PROCESS_EXIT",
      exitCode
    });
  };
  proc.nextTick = (callback, ...args) => {
    const wrapped = asyncContextManager?.bind(callback) ?? callback;
    queueMicrotask(() => wrapped(...args));
  };
  proc.kill = (pid, signal = "SIGTERM") => kernel.kill(pid, signal);
  proc.emitWarning = (warning) => descriptor.stderr.write(`${warning}
`);
  proc.uptime = () => Number(nowNs() - startNs) / 1e9;
  proc.hrtime = (previous) => {
    const elapsed = nowNs() - startNs;
    let seconds = elapsed / 1000000000n;
    let nanoseconds = elapsed % 1000000000n;
    if (Array.isArray(previous)) {
      const previousSeconds = BigInt(Number(previous[0] ?? 0));
      const previousNanoseconds = BigInt(Number(previous[1] ?? 0));
      const diff = elapsed - (previousSeconds * 1000000000n + previousNanoseconds);
      seconds = diff / 1000000000n;
      nanoseconds = diff % 1000000000n;
      if (nanoseconds < 0n) {
        seconds -= 1n;
        nanoseconds += 1000000000n;
      }
    }
    return [Number(seconds), Number(nanoseconds)];
  };
  proc.hrtime.bigint = () => nowNs() - startNs;
  proc.memoryUsage = () => {
    const browserMemory = globalThis.performance?.memory;
    const heapTotal = Number(browserMemory?.totalJSHeapSize ?? 0);
    const heapUsed = Number(browserMemory?.usedJSHeapSize ?? 0);
    const rss = Number(browserMemory?.jsHeapSizeLimit ?? heapTotal ?? 0);
    return {
      rss,
      heapTotal,
      heapUsed,
      external: 0,
      arrayBuffers: 0
    };
  };
  proc.memoryUsage.rss = () => proc.memoryUsage().rss;
  proc.cpuUsage = (previous) => {
    const usage = { user: Math.floor(proc.uptime() * 1e6), system: 0 };
    if (previous && typeof previous === "object") {
      return {
        user: usage.user - Number(previous.user ?? 0),
        system: usage.system - Number(previous.system ?? 0)
      };
    }
    return usage;
  };
  proc.resourceUsage = () => ({
    userCPUTime: proc.cpuUsage().user,
    systemCPUTime: proc.cpuUsage().system,
    maxRSS: Math.ceil(proc.memoryUsage().rss / 1024),
    sharedMemorySize: 0,
    unsharedDataSize: 0,
    unsharedStackSize: 0,
    minorPageFault: 0,
    majorPageFault: 0,
    swappedOut: 0,
    fsRead: 0,
    fsWrite: 0,
    ipcSent: 0,
    ipcReceived: 0,
    signalsCount: 0,
    voluntaryContextSwitches: 0,
    involuntaryContextSwitches: 0
  });
  proc.getBuiltinModule = (specifier) => {
    if (typeof getBuiltinModule !== "function") return void 0;
    return getBuiltinModule(String(specifier)) ?? void 0;
  };
  proc.report = {
    directory: "",
    filename: "",
    compact: false,
    signal: "SIGUSR2",
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport(error) {
      return {
        header: {
          reportVersion: 5,
          event: error ? "JavaScript API" : "JavaScript API",
          trigger: "GetReport",
          filename: this.filename,
          dumpEventTime: (/* @__PURE__ */ new Date()).toISOString(),
          processId: proc.pid,
          cwd: proc.cwd(),
          commandLine: [...proc.argv],
          nodejsVersion: proc.version,
          opencontainersVersion: proc.versions.opencontainers
        },
        javascriptStack: error ? { message: error.message, stack: String(error.stack ?? error.message ?? error) } : { message: "", stack: "" },
        javascriptHeap: proc.memoryUsage(),
        resourceUsage: proc.resourceUsage(),
        environmentVariables: { ...proc.env },
        sharedObjects: []
      };
    },
    writeReport(filename) {
      const target = filename || `report.${Date.now()}.${proc.pid}.json`;
      kernel.fs.writeFileSync(kernel.resolvePath(proc.cwd(), target), JSON.stringify(this.getReport(), null, 2));
      return target;
    }
  };
  descriptor.refCount ?? (descriptor.refCount = 0);
  descriptor.cleanupTasks ?? (descriptor.cleanupTasks = /* @__PURE__ */ new Set());
  proc.__opencontainersAddRef = () => {
    descriptor.refCount++;
  };
  proc.__opencontainersUnref = () => {
    descriptor.refCount = Math.max(0, descriptor.refCount - 1);
    if (descriptor.refCount === 0) {
      queueMicrotask(() => {
        if (descriptor.refCount === 0) descriptor.onIdle?.();
      });
    }
  };
  proc.__opencontainersOnExit = (cleanup) => {
    descriptor.cleanupTasks.add(cleanup);
    return () => descriptor.cleanupTasks.delete(cleanup);
  };
  proc.__opencontainersIsAlive = () => descriptor.status !== "exited" && descriptor.status !== "killed";
  return proc;
}
function nowNs() {
  if (typeof globalThis.performance?.now === "function") {
    return BigInt(Math.floor(globalThis.performance.now() * 1e6));
  }
  return BigInt(Date.now()) * 1000000n;
}
function markProcessStream(stream, process, fd) {
  if (!stream || typeof stream !== "object") return;
  stream.fd ?? (stream.fd = fd);
  stream.isTTY ?? (stream.isTTY = true);
  stream.columns ?? (stream.columns = 80);
  stream.rows ?? (stream.rows = 24);
  if (fd === 0) {
    stream.isRaw ?? (stream.isRaw = false);
    stream.setRawMode ?? (stream.setRawMode = (value) => {
      stream.isRaw = Boolean(value);
      return stream;
    });
  }
  stream.__opencontainersProcess = process;
}

// packages/runtime-node/src/builtins/http.js
var METHODS = [
  "ACL",
  "BIND",
  "CHECKOUT",
  "CONNECT",
  "COPY",
  "DELETE",
  "GET",
  "HEAD",
  "LINK",
  "LOCK",
  "M-SEARCH",
  "MERGE",
  "MKACTIVITY",
  "MKCALENDAR",
  "MKCOL",
  "MOVE",
  "NOTIFY",
  "OPTIONS",
  "PATCH",
  "POST",
  "PROPFIND",
  "PROPPATCH",
  "PURGE",
  "PUT",
  "QUERY",
  "REBIND",
  "REPORT",
  "SEARCH",
  "SOURCE",
  "SUBSCRIBE",
  "TRACE",
  "UNBIND",
  "UNLINK",
  "UNLOCK",
  "UNSUBSCRIBE"
];
var STATUS_CODES = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  409: "Conflict",
  413: "Payload Too Large",
  418: "I'm a Teapot",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable"
};
var IncomingMessage = class extends Readable {
  constructor(request) {
    super();
    this.method = request.method;
    this.url = request.url;
    this.headers = Object.fromEntries(request.headers ?? []);
    this.rawHeaders = [...request.headers ?? []].flatMap(([name, value]) => [String(name), String(value)]);
    this.trailers = {};
    this.rawTrailers = [];
    this.statusCode = request.statusCode;
    this.statusMessage = request.statusMessage;
    if (request.body && !this.headers["content-length"]) {
      const bytes = typeof request.body === "string" ? new TextEncoder().encode(request.body) : new Uint8Array(request.body);
      this.headers["content-length"] = String(bytes.byteLength);
    }
    this.socket = {
      remoteAddress: "127.0.0.1",
      remotePort: 0,
      localAddress: "127.0.0.1",
      localPort: request.port,
      encrypted: false
    };
    this.connection = this.socket;
    if (request.body) queueMicrotask(() => {
      this.push(typeof request.body === "string" ? request.body : RuntimeBuffer.from(request.body));
      this.push(null);
    });
  }
};
var _kernel, _process, _callback, _chunks, _ended, _aborted, _unrefQueued, _ClientRequest_instances, dispatch_fn, queueUnref_fn, dispatchVirtual_fn, dispatchExternal_fn;
var ClientRequest = class extends Writable {
  constructor({ kernel, process, secureDefault, options, callback }) {
    const chunks = [];
    super({
      write: (chunk) => {
        chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      }
    });
    __privateAdd(this, _ClientRequest_instances);
    __privateAdd(this, _kernel);
    __privateAdd(this, _process);
    __privateAdd(this, _callback);
    __privateAdd(this, _chunks);
    __privateAdd(this, _ended, false);
    __privateAdd(this, _aborted, false);
    __privateAdd(this, _unrefQueued, false);
    this.method = options.method ?? "GET";
    this.path = `${options.pathname ?? "/"}${options.search ?? ""}`;
    this.host = options.hostname ?? options.host ?? "localhost";
    this.port = Number(options.port ?? (secureDefault ? 443 : 80));
    this.protocol = options.protocol ?? (secureDefault ? "https:" : "http:");
    this.headers = normalizeHeaders(options.headers ?? {});
    __privateSet(this, _kernel, kernel);
    __privateSet(this, _process, process);
    __privateSet(this, _callback, callback);
    __privateSet(this, _chunks, chunks);
    process.__opencontainersAddRef?.();
  }
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
  }
  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }
  removeHeader(name) {
    delete this.headers[String(name).toLowerCase()];
  }
  end(chunk, encoding, callback) {
    if (__privateGet(this, _ended)) return;
    if (chunk !== void 0) this.write(chunk, encoding);
    __privateSet(this, _ended, true);
    super.end(void 0, void 0, callback);
    queueMicrotask(() => __privateMethod(this, _ClientRequest_instances, dispatch_fn).call(this));
  }
  abort() {
    return this.destroy(Object.assign(new Error("Request aborted"), { code: "ECONNRESET" }));
  }
  destroy(error) {
    if (__privateGet(this, _aborted)) return this;
    __privateSet(this, _aborted, true);
    this.destroyed = true;
    this.emit("abort");
    if (error) {
      try {
        this.emit("error", error);
      } catch (emitError) {
        reportVirtualError(__privateGet(this, _process), emitError);
      }
    }
    this.emit("close");
    __privateMethod(this, _ClientRequest_instances, queueUnref_fn).call(this);
    return this;
  }
};
_kernel = new WeakMap();
_process = new WeakMap();
_callback = new WeakMap();
_chunks = new WeakMap();
_ended = new WeakMap();
_aborted = new WeakMap();
_unrefQueued = new WeakMap();
_ClientRequest_instances = new WeakSet();
dispatch_fn = async function() {
  var _a2;
  if (__privateGet(this, _aborted)) return;
  try {
    const body = concatChunks(__privateGet(this, _chunks));
    const response = isVirtualLocalhost(this.host) ? await __privateMethod(this, _ClientRequest_instances, dispatchVirtual_fn).call(this, body) : await __privateMethod(this, _ClientRequest_instances, dispatchExternal_fn).call(this, body);
    if (__privateGet(this, _aborted)) return;
    const incoming = new IncomingMessage({
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: response.headers,
      body: normalizeResponseBody(response.body)
    });
    (_a2 = __privateGet(this, _callback)) == null ? void 0 : _a2.call(this, incoming);
    this.emit("response", incoming);
  } catch (error) {
    try {
      this.emit("error", error);
    } catch (emitError) {
      reportVirtualError(__privateGet(this, _process), emitError);
    }
  } finally {
    __privateMethod(this, _ClientRequest_instances, queueUnref_fn).call(this);
  }
};
queueUnref_fn = function() {
  if (__privateGet(this, _unrefQueued)) return;
  __privateSet(this, _unrefQueued, true);
  queueMicrotask(() => __privateGet(this, _process).__opencontainersUnref?.());
};
dispatchVirtual_fn = async function(body) {
  return __privateGet(this, _kernel).dispatchHttpRequest({
    id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2),
    projectId: __privateGet(this, _process).env.OPENCONTAINERS_PROJECT_ID ?? "default",
    port: this.port,
    method: this.method,
    url: this.path,
    headers: Object.entries(this.headers),
    body
  });
};
dispatchExternal_fn = async function(body) {
  const url = `${this.protocol}//${this.host}${this.port && !isDefaultPort(this.protocol, this.port) ? `:${this.port}` : ""}${this.path}`;
  const requestUrl = new URL(url);
  if (isHostPageOrigin(requestUrl)) {
    throw Object.assign(new Error(`Host application request blocked: ${requestUrl.href}`), {
      code: "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED"
    });
  }
  if (!isExternalNetworkAllowed(__privateGet(this, _kernel), __privateGet(this, _process), requestUrl)) {
    throw Object.assign(new Error(`External network request blocked: ${requestUrl.href}`), {
      code: "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED"
    });
  }
  const response = await fetch(requestUrl.href, createBrowserExternalFetchOptions(requestUrl, {
    method: this.method,
    headers: this.headers,
    body: body.byteLength ? body : void 0
  }));
  return {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeExternalResponseHeaders(response.headers),
    body: new Uint8Array(await response.arrayBuffer())
  };
};
var Agent = class extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.requests = {};
    this.sockets = {};
    this.freeSockets = {};
    this.keepAlive = Boolean(options.keepAlive);
    this.maxSockets = options.maxSockets ?? Infinity;
    this.maxFreeSockets = options.maxFreeSockets ?? 256;
  }
  addRequest() {
  }
  destroy() {
    this.emit("free");
  }
};
var globalAgent = new Agent();
var _chunks2, _resolveResponse, _ended2;
var ServerResponse = class extends Writable {
  constructor(resolveResponse) {
    const chunks = [];
    super({
      write: (chunk) => {
        chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      }
    });
    __privateAdd(this, _chunks2);
    __privateAdd(this, _resolveResponse);
    __privateAdd(this, _ended2, false);
    this.statusCode = 200;
    this.statusMessage = "OK";
    this.headers = /* @__PURE__ */ new Map();
    this.headersSent = false;
    this.writableEnded = false;
    this.finished = false;
    __privateSet(this, _chunks2, chunks);
    __privateSet(this, _resolveResponse, resolveResponse);
  }
  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
  }
  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }
  removeHeader(name) {
    this.headers.delete(String(name).toLowerCase());
  }
  hasHeader(name) {
    return this.headers.has(String(name).toLowerCase());
  }
  getHeaders() {
    return Object.fromEntries(this.headers.entries());
  }
  writeHead(statusCode, statusMessageOrHeaders, headers) {
    this.statusCode = statusCode;
    if (typeof statusMessageOrHeaders === "string") {
      this.statusMessage = statusMessageOrHeaders;
      for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value);
    } else {
      for (const [name, value] of Object.entries(statusMessageOrHeaders ?? {})) this.setHeader(name, value);
    }
    return this;
  }
  end(chunk, encoding, callback) {
    if (__privateGet(this, _ended2)) return;
    if (chunk !== void 0) this.write(chunk, encoding);
    __privateSet(this, _ended2, true);
    this.headersSent = true;
    this.writableEnded = true;
    this.finished = true;
    const size = __privateGet(this, _chunks2).reduce((total, part) => total + part.byteLength, 0);
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunkPart of __privateGet(this, _chunks2)) {
      body.set(chunkPart, offset);
      offset += chunkPart.byteLength;
    }
    __privateGet(this, _resolveResponse).call(this, {
      status: this.statusCode,
      statusText: this.statusMessage,
      headers: [...this.headers.entries()],
      body
    });
    super.end(void 0, void 0, callback);
  }
};
_chunks2 = new WeakMap();
_resolveResponse = new WeakMap();
_ended2 = new WeakMap();
function createHttpBuiltin({ kernel, process }) {
  const request = createRequestFactory({ kernel, process, secureDefault: false });
  return {
    IncomingMessage,
    ServerResponse,
    ClientRequest,
    Agent,
    globalAgent,
    METHODS,
    STATUS_CODES,
    createServer(listener) {
      const server = new EventEmitter();
      if (listener) server.on("request", listener);
      server.listening = false;
      server.listen = (port = 0, hostOrCallback, maybeCallback) => {
        const callback = typeof hostOrCallback === "function" ? hostOrCallback : maybeCallback;
        const host = typeof hostOrCallback === "string" ? hostOrCallback : "0.0.0.0";
        const projectId = process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
        const assignedPort = kernel.registerPort({
          projectId,
          pid: process.pid,
          port,
          host,
          handler: (request2) => dispatchServerRequest({ server, process, request: request2 })
        });
        try {
          kernel.listenNet({
            projectId,
            pid: process.pid,
            port: assignedPort,
            host,
            connectionListener: (socket) => {
              handleHttpSocketConnection({
                server,
                process,
                socket,
                port: assignedPort
              });
            }
          });
        } catch (error) {
          kernel.portManager?.unregister(projectId, assignedPort);
          throw error;
        }
        kernel.registerWebSocketServer({
          projectId,
          port: assignedPort,
          handler: (socket, request2) => {
            const req = new IncomingMessage({
              method: "GET",
              url: request2.path,
              headers: [["upgrade", "websocket"]]
            });
            try {
              if (server.listenerCount("upgrade")) {
                server.emit("upgrade", req, socket, RuntimeBuffer.alloc(0));
              } else {
                server.emit("websocket", socket, req);
              }
            } catch (error) {
              reportVirtualError(process, error);
              socket.close?.(1011, "Unhandled virtual server error");
            }
          }
        });
        server.listening = true;
        server.address = () => ({ address: host, family: "IPv4", port: assignedPort });
        callback?.();
        server.emit("listening");
        return server;
      };
      server.close = (callback) => {
        kernel.unregisterPortsForPid(process.pid);
        server.listening = false;
        callback?.();
        server.emit("close");
      };
      return server;
    },
    request,
    get: (...args) => {
      const req = request(...args);
      req.end();
      return req;
    }
  };
}
function createHttpsBuiltin({ kernel, process }) {
  const request = createRequestFactory({ kernel, process, secureDefault: true });
  return {
    Agent,
    globalAgent,
    METHODS,
    STATUS_CODES,
    request,
    get: (...args) => {
      const req = request(...args);
      req.end();
      return req;
    }
  };
}
function dispatchServerRequest({ server, process, request }) {
  return new Promise((resolve2) => {
    const req = new IncomingMessage(request);
    const res = new ServerResponse(resolve2);
    try {
      server.emit("request", req, res);
    } catch (error) {
      reportVirtualError(process, error);
      if (!res.writableEnded) resolve2(virtualServerErrorResponse(error));
    }
  });
}
function handleHttpSocketConnection({ server, process, socket, port }) {
  const chunks = [];
  const onData = (chunk) => {
    chunks.push(toBuffer(chunk));
    const buffered = RuntimeBuffer.concat(chunks);
    const headerEnd = findHttpHeaderEnd(buffered);
    if (headerEnd < 0) return;
    const headText = buffered.subarray(0, headerEnd).toString();
    const parsed = parseHttpRequestHead(headText);
    if (!parsed) {
      socket.off?.("data", onData);
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const bodyStart = headerEnd + 4;
    const availableBody = buffered.subarray(bodyStart);
    const contentLength = Number(parsed.headers.get("content-length") ?? 0) || 0;
    const isUpgrade = isUpgradeRequest(parsed.headers);
    if (!isUpgrade && availableBody.byteLength < contentLength) return;
    socket.off?.("data", onData);
    const req = new IncomingMessage({
      method: parsed.method,
      url: parsed.url,
      headers: [...parsed.headers.entries()],
      body: contentLength ? availableBody.subarray(0, contentLength) : void 0,
      port
    });
    req.socket = socket;
    req.connection = socket;
    if (isUpgrade) {
      if (!server.listenerCount("upgrade")) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      try {
        server.emit("upgrade", req, socket, RuntimeBuffer.from(availableBody));
      } catch (error) {
        reportVirtualError(process, error);
        try {
          socket.end();
        } catch (_) {
          socket.destroy?.();
        }
      }
      return;
    }
    dispatchServerRequest({
      server,
      process,
      request: {
        method: parsed.method,
        url: parsed.url,
        headers: [...parsed.headers.entries()],
        body: contentLength ? availableBody.subarray(0, contentLength) : void 0,
        port
      }
    }).then((response) => {
      writeHttpSocketResponse(socket, response);
    }, (error) => {
      reportVirtualError(process, error);
      writeHttpSocketResponse(socket, virtualServerErrorResponse(error));
    });
  };
  socket.on("data", onData);
}
function createRequestFactory({ kernel, process, secureDefault }) {
  return (...args) => {
    const { options, callback } = normalizeRequestArgs(args, secureDefault);
    return new ClientRequest({ kernel, process, secureDefault, options, callback });
  };
}
function normalizeRequestArgs(args, secureDefault) {
  let options = {};
  let callback = args.find((arg) => typeof arg === "function");
  const first = args[0];
  const second = args[1];
  if (typeof first === "string" || first instanceof URL) {
    const url = new URL(first);
    options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search
    };
    if (second && typeof second === "object") options = { ...options, ...second };
  } else if (first && typeof first === "object") {
    options = { ...first };
  }
  options.protocol ?? (options.protocol = secureDefault ? "https:" : "http:");
  options.hostname ?? (options.hostname = options.host ?? "localhost");
  options.pathname ?? (options.pathname = options.path?.split("?")[0] ?? "/");
  options.search ?? (options.search = options.path?.includes("?") ? `?${options.path.split("?").slice(1).join("?")}` : "");
  return { options, callback };
}
function normalizeHeaders(headers) {
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
}
function normalizeExternalResponseHeaders(headers) {
  const normalized = [];
  for (const [name, value] of headers.entries()) {
    const lowerName = String(name).toLowerCase();
    if (lowerName === "content-encoding" || lowerName === "content-length") continue;
    normalized.push([lowerName, value]);
  }
  return normalized;
}
function createBrowserExternalFetchOptions(url, { method = "GET", headers, body } = {}) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const options = {
    method: normalizedMethod,
    headers: normalizeBrowserExternalRequestHeaders(url, headers, normalizedMethod),
    credentials: "omit",
    redirect: "follow"
  };
  if (body !== void 0 && normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    options.body = body;
  }
  return options;
}
function normalizeBrowserExternalRequestHeaders(url, headers, method) {
  if (!isNpmRegistryHost(url.hostname)) return headers ?? {};
  const normalized = [];
  for (const [rawName, rawValue] of requestHeaderEntries(headers)) {
    const name = String(rawName).toLowerCase();
    const value = String(rawValue);
    if (name === "accept" || name === "accept-language" || name === "content-language") {
      normalized.push([name, value]);
      continue;
    }
    if (name === "content-type" && method !== "GET" && method !== "HEAD" && isCorsSafelistedContentType(value)) {
      normalized.push([name, value]);
      continue;
    }
    if (name === "range" && isCorsSafelistedRange(value)) {
      normalized.push([name, value]);
    }
  }
  if (!normalized.some(([name]) => name === "accept")) {
    normalized.push(["accept", "*/*"]);
  }
  return normalized;
}
function requestHeaderEntries(headers) {
  if (!headers) return [];
  if (typeof Headers !== "undefined" && headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers.map(([name, value]) => [name, value]);
  return Object.entries(headers);
}
function isNpmRegistryHost(hostname) {
  return String(hostname || "").toLowerCase() === "registry.npmjs.org";
}
function isCorsSafelistedContentType(value) {
  const type = String(value || "").split(";")[0].trim().toLowerCase();
  return type === "application/x-www-form-urlencoded" || type === "multipart/form-data" || type === "text/plain";
}
function isCorsSafelistedRange(value) {
  return /^bytes=\d*-\d*$/i.test(String(value || "").trim());
}
function concatChunks(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
function normalizeResponseBody(body) {
  if (!body) return void 0;
  if (body instanceof Uint8Array) return body;
  if (typeof body === "string") return new TextEncoder().encode(body);
  return new Uint8Array(body);
}
function toBuffer(chunk) {
  if (chunk instanceof Uint8Array) return RuntimeBuffer.from(chunk);
  return RuntimeBuffer.from(String(chunk));
}
function findHttpHeaderEnd(buffer) {
  for (let index = 0; index <= buffer.byteLength - 4; index++) {
    if (buffer[index] === 13 && buffer[index + 1] === 10 && buffer[index + 2] === 13 && buffer[index + 3] === 10) {
      return index;
    }
  }
  return -1;
}
function parseHttpRequestHead(text) {
  const lines = text.split("\r\n");
  const [method, url] = String(lines.shift() ?? "").split(/\s+/);
  if (!method || !url) return null;
  const headers = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(name)) headers.set(name, `${headers.get(name)}, ${value}`);
    else headers.set(name, value);
  }
  return { method, url, headers };
}
function isUpgradeRequest(headers) {
  const connection = headers.get("connection") ?? "";
  return Boolean(headers.get("upgrade")) && connection.toLowerCase().split(",").some((part) => part.trim() === "upgrade");
}
function writeHttpSocketResponse(socket, response) {
  const status = response.status ?? 200;
  const statusText = response.statusText ?? STATUS_CODES[status] ?? "OK";
  const body = normalizeResponseBody(response.body) ?? RuntimeBuffer.alloc(0);
  const headers = new Map(response.headers ?? []);
  if (!headers.has("content-length")) headers.set("content-length", String(body.byteLength));
  if (!headers.has("connection")) headers.set("connection", "close");
  const headerText = [
    `HTTP/1.1 ${status} ${statusText}`,
    ...[...headers.entries()].map(([name, value]) => `${name}: ${value}`),
    "",
    ""
  ].join("\r\n");
  socket.write(headerText);
  if (body.byteLength) socket.write(body);
  socket.end();
}
function reportVirtualError(process, error) {
  try {
    process.stderr?.write?.(`${formatErrorForDiagnostics(error)}
`);
  } catch (_) {
  }
  process.exitCode = 1;
}
function virtualServerErrorResponse(error) {
  const message = error?.message ?? String(error);
  return {
    status: 500,
    statusText: "Internal Server Error",
    headers: [
      ["content-type", "text/plain; charset=utf-8"],
      ["x-opencontainers-error", "unhandled-virtual-server-error"]
    ],
    body: new TextEncoder().encode(`Unhandled virtual server error: ${message}
`)
  };
}
function formatErrorForDiagnostics(error) {
  return error?.stack ?? error?.message ?? String(error);
}
function isVirtualLocalhost(host) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(String(host));
}
function isDefaultPort(protocol, port) {
  return protocol === "http:" && Number(port) === 80 || protocol === "https:" && Number(port) === 443;
}
function isExternalNetworkAllowed(kernel, process, url) {
  if (kernel.allowExternalNetwork === true) return true;
  const hostname = String(url.hostname || "").toLowerCase();
  return (process?.__opencontainersNetworkAllowlist ?? []).some((allowedHost) => {
    if (!allowedHost) return false;
    if (allowedHost.startsWith(".")) return hostname.endsWith(allowedHost);
    return hostname === allowedHost;
  });
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

// packages/runtime-node/src/builtins/net.js
function createNetBuiltin({ kernel, process }) {
  var _connectionListener, _address;
  class Server extends EventEmitter {
    constructor(connectionListener) {
      super();
      __privateAdd(this, _connectionListener);
      __privateAdd(this, _address, null);
      this.listening = false;
      this.connections = 0;
      __privateSet(this, _connectionListener, connectionListener);
    }
    listen(...args) {
      const options = normalizeListenArgs(args);
      const assignedPort = kernel.listenNet({
        projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
        pid: process.pid,
        port: options.port,
        host: options.host,
        connectionListener: (socket) => {
          var _a2;
          this.connections++;
          (_a2 = __privateGet(this, _connectionListener)) == null ? void 0 : _a2.call(this, socket);
          this.emit("connection", socket);
          socket.on("close", () => {
            this.connections = Math.max(0, this.connections - 1);
          });
        }
      });
      __privateSet(this, _address, {
        address: options.host === "0.0.0.0" ? "127.0.0.1" : options.host,
        family: "IPv4",
        port: assignedPort
      });
      this.listening = true;
      options.callback?.();
      this.emit("listening");
      return this;
    }
    close(callback) {
      kernel.unregisterPortsForPid(process.pid);
      this.listening = false;
      callback?.();
      this.emit("close");
      return this;
    }
    address() {
      return __privateGet(this, _address);
    }
    getConnections(callback) {
      callback(null, this.connections);
    }
  }
  _connectionListener = new WeakMap();
  _address = new WeakMap();
  const connect = (...args) => {
    const options = normalizeConnectArgs(args);
    const socket = kernel.connectNet({
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      port: options.port,
      host: options.host
    });
    process.__opencontainersAddRef?.();
    socket.once("close", () => process.__opencontainersUnref?.());
    options.callback && socket.once("connect", options.callback);
    return socket;
  };
  return {
    Server,
    Socket: VirtualNetSocket,
    createServer: (optionsOrListener, maybeListener) => {
      const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
      return new Server(listener);
    },
    connect,
    createConnection: connect,
    isIP,
    isIPv4: (host) => isIP(host) === 4,
    isIPv6: (host) => isIP(host) === 6,
    isLoopbackHost
  };
}
function normalizeListenArgs(args) {
  let port = 0;
  let host = "0.0.0.0";
  let callback;
  if (typeof args[0] === "object") {
    port = args[0].port ?? 0;
    host = args[0].host ?? host;
    callback = args[1];
  } else {
    port = args[0] ?? 0;
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: Number(port), host, callback };
}
function normalizeConnectArgs(args) {
  let port;
  let host = "127.0.0.1";
  let callback;
  if (typeof args[0] === "object") {
    port = args[0].port;
    host = args[0].host ?? args[0].hostname ?? host;
    callback = args[1];
  } else {
    port = args[0];
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: Number(port), host, callback };
}
function isIP(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 4;
  if (String(host).includes(":")) return 6;
  return 0;
}

// packages/runtime-node/src/builtins/dns.js
var LOOPBACK_V4 = "127.0.0.1";
var LOOPBACK_V6 = "::1";
function createDnsBuiltin() {
  const promises3 = {
    lookup: (hostname, options) => Promise.resolve(lookupSync(hostname, options)),
    resolve: (hostname, rrtype = "A") => Promise.resolve(resolveSync(hostname, rrtype)),
    resolve4: (hostname) => Promise.resolve(resolveAddressSync(hostname, 4)),
    resolve6: (hostname) => Promise.resolve(resolveAddressSync(hostname, 6)),
    reverse: (ip) => Promise.resolve(reverseSync(ip))
  };
  return {
    lookup: callbackifyLookup,
    resolve: callbackifyResolve,
    resolve4: callbackifyResolve4,
    resolve6: callbackifyResolve6,
    reverse: callbackifyReverse,
    promises: promises3,
    ADDRCONFIG: 32,
    V4MAPPED: 8
  };
}
function callbackifyLookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  queueMicrotask(() => {
    try {
      const result = lookupSync(hostname, typeof options === "function" ? void 0 : options);
      if (Array.isArray(result)) cb(null, result);
      else cb(null, result.address, result.family);
    } catch (error) {
      cb(error);
    }
  });
}
function callbackifyResolve(hostname, rrtype, callback) {
  const cb = typeof rrtype === "function" ? rrtype : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  queueMicrotask(() => {
    try {
      cb(null, resolveSync(hostname, typeof rrtype === "function" ? "A" : rrtype));
    } catch (error) {
      cb(error);
    }
  });
}
function callbackifyResolve4(hostname, callback) {
  callbackifyResolve(hostname, "A", callback);
}
function callbackifyResolve6(hostname, callback) {
  callbackifyResolve(hostname, "AAAA", callback);
}
function callbackifyReverse(ip, callback) {
  if (typeof callback !== "function") throw new TypeError("Callback must be a function");
  queueMicrotask(() => {
    try {
      callback(null, reverseSync(ip));
    } catch (error) {
      callback(error);
    }
  });
}
function lookupSync(hostname, options) {
  const normalized = normalizeHost(hostname);
  const family = normalizeFamily(options);
  const all = Boolean(typeof options === "object" && options?.all);
  const records = localRecords(normalized).filter((record) => !family || record.family === family);
  if (!records.length) throw dnsNotFound(hostname);
  return all ? records.map((record) => ({ ...record })) : { ...records[0] };
}
function resolveSync(hostname, rrtype = "A") {
  const type = String(rrtype || "A").toUpperCase();
  if (type === "A") return resolveAddressSync(hostname, 4);
  if (type === "AAAA") return resolveAddressSync(hostname, 6);
  if (type === "ANY") return localRecords(normalizeHost(hostname)).map((record) => ({
    address: record.address,
    family: record.family
  }));
  throw Object.assign(new Error(`query ${type} ENODATA ${hostname}`), {
    code: "ENODATA",
    errno: "ENODATA",
    syscall: "query",
    hostname
  });
}
function resolveAddressSync(hostname, family) {
  const records = localRecords(normalizeHost(hostname)).filter((record) => record.family === family);
  if (!records.length) throw dnsNotFound(hostname);
  return records.map((record) => record.address);
}
function reverseSync(ip) {
  const normalized = normalizeHost(ip);
  if (normalized === LOOPBACK_V4 || normalized === LOOPBACK_V6) return ["localhost"];
  throw dnsNotFound(ip, "getHostByAddr");
}
function localRecords(hostname) {
  if (hostname === "localhost" || hostname === LOOPBACK_V4 || hostname === "0.0.0.0") {
    return [{ address: LOOPBACK_V4, family: 4 }];
  }
  if (hostname === LOOPBACK_V6 || hostname === "[::1]") {
    return [{ address: LOOPBACK_V6, family: 6 }];
  }
  return [];
}
function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase();
}
function normalizeFamily(options) {
  if (typeof options === "number") return options;
  if (typeof options === "object" && options?.family) return Number(options.family);
  return 0;
}
function dnsNotFound(hostname, syscall = "getaddrinfo") {
  return Object.assign(new Error(`${syscall} ENOTFOUND ${hostname}`), {
    code: "ENOTFOUND",
    errno: "ENOTFOUND",
    syscall,
    hostname
  });
}

// packages/runtime-node/src/builtins/child_process.js
function normalizeStdio(stdio) {
  if (Array.isArray(stdio)) {
    return [
      stdio[0] ?? "pipe",
      stdio[1] ?? "pipe",
      stdio[2] ?? "pipe"
    ];
  }
  if (stdio === "inherit") return ["inherit", "inherit", "inherit"];
  if (stdio === "ignore") return ["ignore", "ignore", "ignore"];
  return ["pipe", "pipe", "pipe"];
}
function childHandleFromVirtualProcess(virtualProcess, { parentProcess, stdio = "pipe" } = {}) {
  const [stdinMode, stdoutMode, stderrMode] = normalizeStdio(stdio);
  const child = new EventEmitter();
  child.pid = virtualProcess.pid;
  child.stdin = stdinMode === "pipe" ? new Writable({ write: (chunk) => virtualProcess.stdin.write(chunk) }) : null;
  child.stdout = stdoutMode === "pipe" ? new Readable() : null;
  child.stderr = stderrMode === "pipe" ? new Readable() : null;
  virtualProcess.stdout.on("data", (chunk) => {
    if (stdoutMode === "inherit") parentProcess?.stdout?.write(chunk);
    child.stdout?.push(chunk);
  });
  virtualProcess.stderr.on("data", (chunk) => {
    if (stderrMode === "inherit") parentProcess?.stderr?.write(chunk);
    child.stderr?.push(chunk);
  });
  virtualProcess.on("exit", (code, signal) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.stdout?.push(null);
    child.stderr?.push(null);
    child.emit("exit", code, signal);
    child.emit("close", code, signal);
  });
  virtualProcess.on("error", (error) => child.emit("error", error));
  child.kill = (signal = "SIGTERM") => virtualProcess.kill(signal);
  return child;
}
function createChildProcessBuiltin({ kernel, process }) {
  const spawn = (command, args = [], options = {}) => {
    if (kernel.allowChildProcesses === false) {
      throw Object.assign(new Error("Child process spawning is disabled for this project"), {
        code: "ERR_OPENCONTAINERS_CHILD_PROCESS_PERMISSION"
      });
    }
    process.__opencontainersAddRef?.();
    const virtualProcess = kernel.spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env ?? {} },
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      parentPid: process.pid
    });
    const child = childHandleFromVirtualProcess(virtualProcess, {
      parentProcess: process,
      stdio: options.stdio
    });
    child.on("close", () => process.__opencontainersUnref?.());
    child.on("error", () => process.__opencontainersUnref?.());
    return child;
  };
  const exec = (command, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const child = spawn("sh", ["-c", command], typeof options === "object" ? options : {});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      const error = code === 0 ? null : Object.assign(new Error(`Command failed: ${command}`), { code });
      cb?.(error, stdout, stderr);
    });
    return child;
  };
  const spawnSync = (command, args = [], options = {}) => kernel.spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env ?? {} },
    projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
    parentPid: process.pid
  });
  const execSync = (command, options = {}) => {
    const result = spawnSync("sh", ["-c", command], options);
    if (result.status !== 0) {
      throw Object.assign(new Error(`Command failed: ${command}`), result);
    }
    return options.encoding ? result.stdout.toString(options.encoding) : result.stdout;
  };
  const fork = (modulePath, args = [], options = {}) => spawn("node", [modulePath, ...args], options);
  return {
    spawn,
    exec,
    execFile: (file, args, options, callback) => {
      const child = spawn(file, args, options);
      callback && child.on("close", (code) => callback(code ? Object.assign(new Error(`Command failed: ${file}`), { code }) : null));
      return child;
    },
    fork,
    spawnSync,
    execSync
  };
}

// packages/runtime-node/src/builtins/crypto.js
var encoder2 = new TextEncoder();
var AES_BLOCK_SIZE = 16;
var KEY_OBJECT_BRAND = /* @__PURE__ */ Symbol.for("opencontainers.crypto.KeyObject");
function createCryptoBuiltin({ process }) {
  const randomBytes = (size, callback) => {
    const bytes = new Uint8Array(size);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    const buffer = RuntimeBuffer.from(bytes);
    if (typeof callback === "function") {
      process.__opencontainersAddRef?.();
      queueMicrotask(() => {
        try {
          if (process.__opencontainersIsAlive?.() !== false) callback(null, buffer);
        } catch (error) {
          process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}
`);
          process.exitCode = 1;
        } finally {
          process.__opencontainersUnref?.();
        }
      });
      return void 0;
    }
    return buffer;
  };
  const randomInt = (min, max, callback) => {
    if (typeof max === "function") {
      callback = max;
      max = min;
      min = 0;
    }
    const lower = Number(min ?? 0);
    const upper = Number(max);
    const run = () => randomInteger(lower, upper);
    if (typeof callback === "function") {
      process.__opencontainersAddRef?.();
      queueMicrotask(() => {
        try {
          callback(null, run());
        } catch (error) {
          process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}
`);
          process.exitCode = 1;
        } finally {
          process.__opencontainersUnref?.();
        }
      });
      return void 0;
    }
    return run();
  };
  return {
    randomUUID: () => globalThis.crypto?.randomUUID?.() ?? fallbackRandomUUID(),
    randomBytes,
    randomInt,
    getHashes: () => ["sha1", "sha256", "sha384", "sha512"],
    getCiphers: () => ["aes-128-cbc", "aes-192-cbc", "aes-256-cbc"],
    createHash: (algorithm) => createHash(algorithm),
    createHmac: (algorithm, key) => createHmac(algorithm, key),
    createCipheriv: (algorithm, key, iv) => createCipheriv(algorithm, key, iv),
    createDecipheriv: (algorithm, key, iv) => createDecipheriv(algorithm, key, iv),
    createSecretKey: (key) => new KeyObject("secret", toBytes2(key)),
    timingSafeEqual,
    randomFillSync,
    randomFill,
    KeyObject,
    webcrypto: globalThis.crypto,
    subtle: globalThis.crypto?.subtle,
    constants: {
      OPENSSL_VERSION_NUMBER: 0,
      SSL_OP_NO_TLSv1: 0,
      SSL_OP_NO_TLSv1_1: 0,
      SSL_OP_NO_TLSv1_2: 0,
      SSL_OP_NO_TLSv1_3: 0
    }
  };
}
function createHash(algorithm) {
  const normalized = normalizeHashAlgorithm(algorithm);
  const chunks = [];
  const hash = {
    update(chunk, inputEncoding) {
      chunks.push(toBytes2(chunk, inputEncoding));
      return this;
    },
    digest(outputEncoding) {
      const input = concatBytes2(chunks);
      if (normalized === "sha1") return encodeOutput(sha1(input), outputEncoding);
      if (normalized === "sha256") return encodeOutput(sha256(input), outputEncoding);
      if (normalized === "sha384") return encodeOutput(sha512(input, "sha384"), outputEncoding);
      if (normalized === "sha512") return encodeOutput(sha512(input), outputEncoding);
      throw Object.assign(new Error(`Digest method not supported: ${algorithm}`), {
        code: "ERR_OSSL_EVP_UNSUPPORTED"
      });
    },
    copy() {
      const copy = createHash(normalized);
      for (const chunk of chunks) copy.update(chunk);
      return copy;
    }
  };
  return hash;
}
function createHmac(algorithm, key) {
  const normalized = normalizeHashAlgorithm(algorithm);
  const blockSize = normalized === "sha384" || normalized === "sha512" ? 128 : 64;
  let keyBytes = toBytes2(key);
  if (keyBytes.length > blockSize) keyBytes = createHash(normalized).update(keyBytes).digest();
  const paddedKey = RuntimeBuffer.alloc(blockSize);
  paddedKey.set(keyBytes.subarray(0, blockSize));
  const innerPad = RuntimeBuffer.alloc(blockSize);
  const outerPad = RuntimeBuffer.alloc(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    innerPad[index] = paddedKey[index] ^ 54;
    outerPad[index] = paddedKey[index] ^ 92;
  }
  const chunks = [];
  return {
    update(chunk, inputEncoding) {
      chunks.push(toBytes2(chunk, inputEncoding));
      return this;
    },
    digest(outputEncoding) {
      const inner = createHash(normalized).update(innerPad).update(concatBytes2(chunks)).digest();
      return createHash(normalized).update(outerPad).update(inner).digest(outputEncoding);
    }
  };
}
function createCipheriv(algorithm, key, iv) {
  const context = createAesCbcContext(algorithm, key, iv);
  const chunks = [];
  let finalized = false;
  let autoPadding = true;
  return {
    update(data, inputEncoding, outputEncoding) {
      if (finalized) throw new Error("Cipher already finalized");
      chunks.push(toBytes2(data, inputEncoding));
      return encodeOutput(RuntimeBuffer.alloc(0), outputEncoding);
    },
    final(outputEncoding) {
      if (finalized) throw new Error("Cipher already finalized");
      finalized = true;
      const input = autoPadding ? addPkcs7Padding(concatBytes2(chunks)) : concatBytes2(chunks);
      if (input.length % AES_BLOCK_SIZE !== 0) {
        throw Object.assign(new Error("wrong final block length"), { code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" });
      }
      return encodeOutput(aesCbcCrypt(input, context, true), outputEncoding);
    },
    setAutoPadding(value = true) {
      autoPadding = Boolean(value);
      return this;
    }
  };
}
function createDecipheriv(algorithm, key, iv) {
  const context = createAesCbcContext(algorithm, key, iv);
  const chunks = [];
  let finalized = false;
  let autoPadding = true;
  return {
    update(data, inputEncoding, outputEncoding) {
      if (finalized) throw new Error("Decipher already finalized");
      chunks.push(toBytes2(data, inputEncoding));
      return encodeOutput(RuntimeBuffer.alloc(0), outputEncoding);
    },
    final(outputEncoding) {
      if (finalized) throw new Error("Decipher already finalized");
      finalized = true;
      const input = concatBytes2(chunks);
      if (input.length % AES_BLOCK_SIZE !== 0) {
        throw Object.assign(new Error("wrong final block length"), { code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" });
      }
      const decrypted = aesCbcCrypt(input, context, false);
      return encodeOutput(autoPadding ? removePkcs7Padding(decrypted) : decrypted, outputEncoding);
    },
    setAutoPadding(value = true) {
      autoPadding = Boolean(value);
      return this;
    }
  };
}
function createAesCbcContext(algorithm, key, iv) {
  const match = String(algorithm || "").toLowerCase().match(/^aes-(128|192|256)-cbc$/);
  if (!match) {
    throw Object.assign(new Error(`Unknown cipher: ${algorithm}`), {
      code: "ERR_CRYPTO_UNKNOWN_CIPHER"
    });
  }
  const keyBytes = key instanceof KeyObject ? key.export() : toBytes2(key);
  const ivBytes = toBytes2(iv);
  const expectedKeyLength = Number(match[1]) / 8;
  if (keyBytes.length !== expectedKeyLength) {
    throw Object.assign(new Error("Invalid key length"), { code: "ERR_CRYPTO_INVALID_KEYLEN" });
  }
  if (ivBytes.length !== AES_BLOCK_SIZE) {
    throw Object.assign(new Error("Invalid initialization vector"), { code: "ERR_CRYPTO_INVALID_IV" });
  }
  return {
    cipher: new AesCipher(keyBytes),
    iv: RuntimeBuffer.from(ivBytes)
  };
}
var _bytes;
var KeyObject = class {
  constructor(type, bytes) {
    __privateAdd(this, _bytes);
    this.type = type;
    this.symmetricKeySize = bytes.byteLength;
    __privateSet(this, _bytes, RuntimeBuffer.from(bytes));
    Object.defineProperty(this, KEY_OBJECT_BRAND, {
      value: true,
      enumerable: false
    });
  }
  export(options = {}) {
    if (this.type !== "secret") {
      throw Object.assign(new Error("Only secret keys are supported"), { code: "ERR_CRYPTO_UNSUPPORTED_OPERATION" });
    }
    if (options?.format && options.format !== "buffer") {
      throw Object.assign(new Error(`Unsupported key format: ${options.format}`), { code: "ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE" });
    }
    return RuntimeBuffer.from(__privateGet(this, _bytes));
  }
};
_bytes = new WeakMap();
function aesCbcCrypt(input, context, encrypt) {
  const output = RuntimeBuffer.alloc(input.length);
  let previous = RuntimeBuffer.from(context.iv);
  for (let offset = 0; offset < input.length; offset += AES_BLOCK_SIZE) {
    const block = input.subarray(offset, offset + AES_BLOCK_SIZE);
    if (encrypt) {
      const xored = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
      for (let index = 0; index < AES_BLOCK_SIZE; index += 1) xored[index] = block[index] ^ previous[index];
      const encrypted = context.cipher.encryptBlock(xored);
      output.set(encrypted, offset);
      previous = encrypted;
    } else {
      const decrypted = context.cipher.decryptBlock(block);
      for (let index = 0; index < AES_BLOCK_SIZE; index += 1) output[offset + index] = decrypted[index] ^ previous[index];
      previous = RuntimeBuffer.from(block);
    }
  }
  return output;
}
function addPkcs7Padding(input) {
  const padLength = AES_BLOCK_SIZE - (input.length % AES_BLOCK_SIZE || 0);
  const output = RuntimeBuffer.alloc(input.length + padLength);
  output.set(input);
  output.fill(padLength, input.length);
  return output;
}
function removePkcs7Padding(input) {
  if (!input.length) throw Object.assign(new Error("bad decrypt"), { code: "ERR_OSSL_BAD_DECRYPT" });
  const padLength = input[input.length - 1];
  if (padLength < 1 || padLength > AES_BLOCK_SIZE || padLength > input.length) {
    throw Object.assign(new Error("bad decrypt"), { code: "ERR_OSSL_BAD_DECRYPT" });
  }
  for (let index = input.length - padLength; index < input.length; index += 1) {
    if (input[index] !== padLength) throw Object.assign(new Error("bad decrypt"), { code: "ERR_OSSL_BAD_DECRYPT" });
  }
  return input.subarray(0, input.length - padLength);
}
function normalizeHashAlgorithm(algorithm) {
  return String(algorithm || "").toLowerCase().replace(/-/g, "");
}
function toBytes2(value, encoding) {
  if (value === void 0 || value === null) return RuntimeBuffer.alloc(0);
  if (typeof value === "string") return RuntimeBuffer.from(value, encoding || "utf8");
  return RuntimeBuffer.from(value);
}
function concatBytes2(chunks) {
  return RuntimeBuffer.concat(chunks.map((chunk) => RuntimeBuffer.from(chunk)));
}
function encodeOutput(bytes, encoding) {
  const buffer = RuntimeBuffer.from(bytes);
  return encoding ? buffer.toString(encoding) : buffer;
}
function timingSafeEqual(left, right) {
  const leftBytes = toBytes2(left);
  const rightBytes = toBytes2(right);
  if (leftBytes.length !== rightBytes.length) {
    throw Object.assign(new Error("Input buffers must have the same byte length"), {
      code: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH"
    });
  }
  let result = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    result |= leftBytes[index] ^ rightBytes[index];
  }
  return result === 0;
}
function randomInteger(min, max) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
    throw Object.assign(new RangeError("The range must be a safe integer range with max > min"), { code: "ERR_OUT_OF_RANGE" });
  }
  const range = max - min;
  const bytes = randomBytesForNumber();
  const value = bytes.reduce((total, byte) => total * 256 + byte, 0);
  return min + value % range;
}
function randomBytesForNumber() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes];
}
function randomFillSync(buffer, offset = 0, size = buffer.byteLength - offset) {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const start = Number(offset ?? 0);
  const length = Number(size ?? view.byteLength - start);
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  view.set(bytes, start);
  return buffer;
}
function randomFill(buffer, offset, size, callback) {
  if (typeof offset === "function") {
    callback = offset;
    offset = 0;
    size = void 0;
  } else if (typeof size === "function") {
    callback = size;
    size = void 0;
  }
  if (typeof callback !== "function") {
    return Promise.resolve().then(() => randomFillSync(buffer, offset, size));
  }
  queueMicrotask(() => {
    try {
      callback(null, randomFillSync(buffer, offset, size));
    } catch (error) {
      callback(error);
    }
  });
  return void 0;
}
function fallbackRandomUUID() {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
var SHA256_K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
function sha256(input) {
  const messageLength = input.length;
  const bitLengthHigh = Math.floor(messageLength / 536870912);
  const bitLengthLow = messageLength << 3 >>> 0;
  const paddedLength = messageLength + 9 + 63 >> 6 << 6;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[messageLength] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh);
  view.setUint32(paddedLength - 4, bitLengthLow);
  let h0 = 1779033703;
  let h1 = 3144134277;
  let h2 = 1013904242;
  let h3 = 2773480762;
  let h4 = 1359893119;
  let h5 = 2600822924;
  let h6 = 528734635;
  let h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(w[index - 15], 7) ^ rotr(w[index - 15], 18) ^ w[index - 15] >>> 3;
      const s1 = rotr(w[index - 2], 17) ^ rotr(w[index - 2], 19) ^ w[index - 2] >>> 10;
      w[index] = w[index - 16] + s0 + w[index - 7] + s1 >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = h + s1 + ch + SHA256_K[index] + w[index] >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = s0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const output = RuntimeBuffer.alloc(32);
  const outputView = new DataView(output.buffer, output.byteOffset, output.byteLength);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => outputView.setUint32(index * 4, value));
  return output;
}
function sha1(input) {
  const messageLength = input.length;
  const bitLengthHigh = Math.floor(messageLength / 536870912);
  const bitLengthLow = messageLength << 3 >>> 0;
  const paddedLength = messageLength + 9 + 63 >> 6 << 6;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[messageLength] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh);
  view.setUint32(paddedLength - 4, bitLengthLow);
  let h0 = 1732584193;
  let h1 = 4023233417;
  let h2 = 2562383102;
  let h3 = 271733878;
  let h4 = 3285377520;
  const w = new Uint32Array(80);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 80; index += 1) {
      w[index] = rotl(w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16], 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = b & c | ~b & d;
        k = 1518500249;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 1859775393;
      } else if (index < 60) {
        f = b & c | b & d | c & d;
        k = 2400959708;
      } else {
        f = b ^ c ^ d;
        k = 3395469782;
      }
      const temp = rotl(a, 5) + f + e + k + w[index] >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
  }
  return words32ToBytes([h0, h1, h2, h3, h4]);
}
function sha512(input, variant = "sha512") {
  const is384 = variant === "sha384";
  const messageLength = BigInt(input.length);
  const bitLength = messageLength * 8n;
  const paddedLength = Number((messageLength + 17n + 127n) / 128n * 128n);
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 128;
  const view = new DataView(data.buffer);
  view.setBigUint64(paddedLength - 16, 0n);
  view.setBigUint64(paddedLength - 8, bitLength);
  let digestWords = is384 ? [
    0xcbbb9d5dc1059ed8n,
    0x629a292a367cd507n,
    0x9159015a3070dd17n,
    0x152fecd8f70e5939n,
    0x67332667ffc00b31n,
    0x8eb44a8768581511n,
    0xdb0c2e0d64f98fa7n,
    0x47b5481dbefa4fa4n
  ] : [
    0x6a09e667f3bcc908n,
    0xbb67ae8584caa73bn,
    0x3c6ef372fe94f82bn,
    0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n,
    0x9b05688c2b3e6c1fn,
    0x1f83d9abfb41bd6bn,
    0x5be0cd19137e2179n
  ];
  const w = new Array(80).fill(0n);
  for (let offset = 0; offset < data.length; offset += 128) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getBigUint64(offset + index * 8);
    }
    for (let index = 16; index < 80; index += 1) {
      const s0 = rotr64(w[index - 15], 1n) ^ rotr64(w[index - 15], 8n) ^ w[index - 15] >> 7n;
      const s1 = rotr64(w[index - 2], 19n) ^ rotr64(w[index - 2], 61n) ^ w[index - 2] >> 6n;
      w[index] = add64(w[index - 16], s0, w[index - 7], s1);
    }
    let [a, b, c, d, e, f, g, h] = digestWords;
    for (let index = 0; index < 80; index += 1) {
      const s1 = rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n);
      const ch = e & f ^ ~e & g;
      const temp1 = add64(h, s1, ch, SHA512_K[index], w[index]);
      const s0 = rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = add64(s0, maj);
      h = g;
      g = f;
      f = e;
      e = add64(d, temp1);
      d = c;
      c = b;
      b = a;
      a = add64(temp1, temp2);
    }
    digestWords = [
      add64(digestWords[0], a),
      add64(digestWords[1], b),
      add64(digestWords[2], c),
      add64(digestWords[3], d),
      add64(digestWords[4], e),
      add64(digestWords[5], f),
      add64(digestWords[6], g),
      add64(digestWords[7], h)
    ];
  }
  return words64ToBytes(is384 ? digestWords.slice(0, 6) : digestWords);
}
function words32ToBytes(words) {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setUint32(index * 4, word));
  return bytes;
}
function words64ToBytes(words) {
  const bytes = new Uint8Array(words.length * 8);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setBigUint64(index * 8, word));
  return bytes;
}
function add64(...values) {
  let total = 0n;
  for (const value of values) total = total + value & UINT64_MASK;
  return total;
}
function rotr64(value, shift) {
  return (value >> shift | value << 64n - shift) & UINT64_MASK;
}
function rotr(value, shift) {
  return value >>> shift | value << 32 - shift;
}
function rotl(value, shift) {
  return (value << shift | value >>> 32 - shift) >>> 0;
}
var UINT64_MASK = 0xffffffffffffffffn;
var SHA512_K = [
  0x428a2f98d728ae22n,
  0x7137449123ef65cdn,
  0xb5c0fbcfec4d3b2fn,
  0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n,
  0x59f111f1b605d019n,
  0x923f82a4af194f9bn,
  0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n,
  0x12835b0145706fben,
  0x243185be4ee4b28cn,
  0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn,
  0x80deb1fe3b1696b1n,
  0x9bdc06a725c71235n,
  0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n,
  0xefbe4786384f25e3n,
  0x0fc19dc68b8cd5b5n,
  0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n,
  0x4a7484aa6ea6e483n,
  0x5cb0a9dcbd41fbd4n,
  0x76f988da831153b5n,
  0x983e5152ee66dfabn,
  0xa831c66d2db43210n,
  0xb00327c898fb213fn,
  0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n,
  0xd5a79147930aa725n,
  0x06ca6351e003826fn,
  0x142929670a0e6e70n,
  0x27b70a8546d22ffcn,
  0x2e1b21385c26c926n,
  0x4d2c6dfc5ac42aedn,
  0x53380d139d95b3dfn,
  0x650a73548baf63den,
  0x766a0abb3c77b2a8n,
  0x81c2c92e47edaee6n,
  0x92722c851482353bn,
  0xa2bfe8a14cf10364n,
  0xa81a664bbc423001n,
  0xc24b8b70d0f89791n,
  0xc76c51a30654be30n,
  0xd192e819d6ef5218n,
  0xd69906245565a910n,
  0xf40e35855771202an,
  0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n,
  0x1e376c085141ab53n,
  0x2748774cdf8eeb99n,
  0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n,
  0x4ed8aa4ae3418acbn,
  0x5b9cca4f7763e373n,
  0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn,
  0x78a5636f43172f60n,
  0x84c87814a1f0ab72n,
  0x8cc702081a6439ecn,
  0x90befffa23631e28n,
  0xa4506cebde82bde9n,
  0xbef9a3f7b2c67915n,
  0xc67178f2e372532bn,
  0xca273eceea26619cn,
  0xd186b8c721c0c207n,
  0xeada7dd6cde0eb1en,
  0xf57d4f7fee6ed178n,
  0x06f067aa72176fban,
  0x0a637dc5a2c898a6n,
  0x113f9804bef90daen,
  0x1b710b35131c471bn,
  0x28db77f523047d84n,
  0x32caab7b40c72493n,
  0x3c9ebe0a15c9bebcn,
  0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n,
  0x597f299cfc657e2an,
  0x5fcb6fab3ad6faecn,
  0x6c44198c4a475817n
];
var AesCipher = class {
  constructor(key) {
    this.rounds = key.length / 4 + 6;
    this.roundKeys = expandAesKey(key, this.rounds);
  }
  encryptBlock(block) {
    const state = RuntimeBuffer.from(block);
    addRoundKey(state, this.roundKeys, 0);
    for (let round = 1; round < this.rounds; round += 1) {
      subBytes(state);
      shiftRows(state);
      mixColumns(state);
      addRoundKey(state, this.roundKeys, round);
    }
    subBytes(state);
    shiftRows(state);
    addRoundKey(state, this.roundKeys, this.rounds);
    return state;
  }
  decryptBlock(block) {
    const state = RuntimeBuffer.from(block);
    addRoundKey(state, this.roundKeys, this.rounds);
    for (let round = this.rounds - 1; round > 0; round -= 1) {
      invShiftRows(state);
      invSubBytes(state);
      addRoundKey(state, this.roundKeys, round);
      invMixColumns(state);
    }
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, this.roundKeys, 0);
    return state;
  }
};
function expandAesKey(key, rounds) {
  const words = [];
  const keyWords = key.length / 4;
  const totalWords = 4 * (rounds + 1);
  for (let index = 0; index < keyWords; index += 1) {
    words[index] = [
      key[index * 4],
      key[index * 4 + 1],
      key[index * 4 + 2],
      key[index * 4 + 3]
    ];
  }
  for (let index = keyWords; index < totalWords; index += 1) {
    let temp = [...words[index - 1]];
    if (index % keyWords === 0) {
      temp = subWord(rotWord(temp));
      temp[0] ^= AES_RCON[index / keyWords];
    } else if (keyWords > 6 && index % keyWords === 4) {
      temp = subWord(temp);
    }
    words[index] = words[index - keyWords].map((byte, byteIndex) => byte ^ temp[byteIndex]);
  }
  const roundKeys = RuntimeBuffer.alloc(totalWords * 4);
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    roundKeys.set(words[wordIndex], wordIndex * 4);
  }
  return roundKeys;
}
function addRoundKey(state, roundKeys, round) {
  const offset = round * AES_BLOCK_SIZE;
  for (let index = 0; index < AES_BLOCK_SIZE; index += 1) state[index] ^= roundKeys[offset + index];
}
function subBytes(state) {
  for (let index = 0; index < state.length; index += 1) state[index] = AES_SBOX[state[index]];
}
function invSubBytes(state) {
  for (let index = 0; index < state.length; index += 1) state[index] = AES_INV_SBOX[state[index]];
}
function shiftRows(state) {
  const copy = RuntimeBuffer.from(state);
  for (let row = 1; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      state[column * 4 + row] = copy[(column + row) % 4 * 4 + row];
    }
  }
}
function invShiftRows(state) {
  const copy = RuntimeBuffer.from(state);
  for (let row = 1; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      state[column * 4 + row] = copy[(column - row + 4) % 4 * 4 + row];
    }
  }
}
function mixColumns(state) {
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const a0 = state[offset];
    const a1 = state[offset + 1];
    const a2 = state[offset + 2];
    const a3 = state[offset + 3];
    state[offset] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
    state[offset + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
    state[offset + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
    state[offset + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
  }
}
function invMixColumns(state) {
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const a0 = state[offset];
    const a1 = state[offset + 1];
    const a2 = state[offset + 2];
    const a3 = state[offset + 3];
    state[offset] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    state[offset + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    state[offset + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    state[offset + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}
function rotWord(word) {
  return [word[1], word[2], word[3], word[0]];
}
function subWord(word) {
  return word.map((byte) => AES_SBOX[byte]);
}
function gmul(left, right) {
  let product = 0;
  let a = left;
  let b = right;
  while (b) {
    if (b & 1) product ^= a;
    a = xtime(a);
    b >>= 1;
  }
  return product;
}
function xtime(value) {
  return (value << 1 ^ (value & 128 ? 27 : 0)) & 255;
}
var AES_RCON = [
  0,
  1,
  2,
  4,
  8,
  16,
  32,
  64,
  128,
  27,
  54,
  108,
  216,
  171,
  77
];
var AES_SBOX = [
  99,
  124,
  119,
  123,
  242,
  107,
  111,
  197,
  48,
  1,
  103,
  43,
  254,
  215,
  171,
  118,
  202,
  130,
  201,
  125,
  250,
  89,
  71,
  240,
  173,
  212,
  162,
  175,
  156,
  164,
  114,
  192,
  183,
  253,
  147,
  38,
  54,
  63,
  247,
  204,
  52,
  165,
  229,
  241,
  113,
  216,
  49,
  21,
  4,
  199,
  35,
  195,
  24,
  150,
  5,
  154,
  7,
  18,
  128,
  226,
  235,
  39,
  178,
  117,
  9,
  131,
  44,
  26,
  27,
  110,
  90,
  160,
  82,
  59,
  214,
  179,
  41,
  227,
  47,
  132,
  83,
  209,
  0,
  237,
  32,
  252,
  177,
  91,
  106,
  203,
  190,
  57,
  74,
  76,
  88,
  207,
  208,
  239,
  170,
  251,
  67,
  77,
  51,
  133,
  69,
  249,
  2,
  127,
  80,
  60,
  159,
  168,
  81,
  163,
  64,
  143,
  146,
  157,
  56,
  245,
  188,
  182,
  218,
  33,
  16,
  255,
  243,
  210,
  205,
  12,
  19,
  236,
  95,
  151,
  68,
  23,
  196,
  167,
  126,
  61,
  100,
  93,
  25,
  115,
  96,
  129,
  79,
  220,
  34,
  42,
  144,
  136,
  70,
  238,
  184,
  20,
  222,
  94,
  11,
  219,
  224,
  50,
  58,
  10,
  73,
  6,
  36,
  92,
  194,
  211,
  172,
  98,
  145,
  149,
  228,
  121,
  231,
  200,
  55,
  109,
  141,
  213,
  78,
  169,
  108,
  86,
  244,
  234,
  101,
  122,
  174,
  8,
  186,
  120,
  37,
  46,
  28,
  166,
  180,
  198,
  232,
  221,
  116,
  31,
  75,
  189,
  139,
  138,
  112,
  62,
  181,
  102,
  72,
  3,
  246,
  14,
  97,
  53,
  87,
  185,
  134,
  193,
  29,
  158,
  225,
  248,
  152,
  17,
  105,
  217,
  142,
  148,
  155,
  30,
  135,
  233,
  206,
  85,
  40,
  223,
  140,
  161,
  137,
  13,
  191,
  230,
  66,
  104,
  65,
  153,
  45,
  15,
  176,
  84,
  187,
  22
];
var AES_INV_SBOX = (() => {
  const inverse2 = new Array(256);
  for (let index = 0; index < AES_SBOX.length; index += 1) inverse2[AES_SBOX[index]] = index;
  return inverse2;
})();

// packages/runtime-node/src/builtins/vm.js
var CONTEXT_SYMBOL = /* @__PURE__ */ Symbol.for("opencontainers.vm.context");
function createVmBuiltin({ globals = {} } = {}) {
  class Script {
    constructor(code, options = {}) {
      this.code = String(code);
      this.filename = normalizeFilename(options);
    }
    runInContext(context, options = {}) {
      validateContext(context);
      return runSourceInContext(this.code, context, {
        filename: normalizeFilename(options, this.filename),
        globals
      });
    }
    runInNewContext(sandbox = {}, options = {}) {
      return runSourceInContext(this.code, createContext(sandbox), {
        filename: normalizeFilename(options, this.filename),
        globals
      });
    }
    runInThisContext(options = {}) {
      return runSourceInContext(this.code, globals, {
        filename: normalizeFilename(options, this.filename),
        globals
      });
    }
  }
  function createContext(sandbox = {}) {
    if (sandbox === null || typeof sandbox !== "object" && typeof sandbox !== "function") {
      throw new TypeError("The sandbox must be an object");
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, "global")) {
      Object.defineProperty(sandbox, "global", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sandbox
      });
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, "globalThis")) {
      Object.defineProperty(sandbox, "globalThis", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sandbox
      });
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, "self")) {
      Object.defineProperty(sandbox, "self", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sandbox
      });
    }
    if (!Object.prototype.hasOwnProperty.call(sandbox, CONTEXT_SYMBOL)) {
      Object.defineProperty(sandbox, CONTEXT_SYMBOL, {
        configurable: true,
        enumerable: false,
        value: true
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
    const wrapped = runSourceInContext(`(function (${params.join(",")}) {
${String(code)}
})`, context, {
      filename: normalizeFilename(options),
      globals
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
    compileFunction
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
  const sourceWithUrl = `${String(source)}
//# sourceURL=opencontainers://${filename}`;
  const wrapped = new Function(
    "scope",
    `with (scope) {
return eval(${JSON.stringify(sourceWithUrl)});
}`
  );
  return wrapped(scope);
}
function createScope(context, globals) {
  return new Proxy(/* @__PURE__ */ Object.create(null), {
    has(_target, key) {
      if (key === Symbol.unscopables) return false;
      if (key === "eval") return false;
      return true;
    },
    get(_target, key) {
      if (key === Symbol.unscopables) return void 0;
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
          value: globals[key]
        };
      }
      return void 0;
    },
    ownKeys() {
      return [.../* @__PURE__ */ new Set([...Reflect.ownKeys(globals), ...Reflect.ownKeys(context)])];
    }
  });
}
function normalizeFilename(options, fallback = "vm.js") {
  if (typeof options === "string") return options;
  return options?.filename ?? fallback;
}

// packages/runtime-node/src/builtins/zlib.js
var BROTLI_FALLBACK_MAGIC = new Uint8Array([79, 67, 66, 82, 0]);
function createZlibBuiltin({ process } = {}) {
  const promises3 = createPromisesApi();
  const callbackApi = {
    gzip: callbackify(promises3.gzip, process),
    gunzip: callbackify(promises3.gunzip, process),
    deflate: callbackify(promises3.deflate, process),
    inflate: callbackify(promises3.inflate, process),
    brotliCompress: callbackify(promises3.brotliCompress, process),
    brotliDecompress: callbackify(promises3.brotliDecompress, process)
  };
  const builtin = {
    ...callbackApi,
    ...createSyncApi(),
    promises: promises3,
    createGzip: () => unsupportedStream("createGzip"),
    createGunzip: () => unsupportedStream("createGunzip"),
    createDeflate: () => unsupportedStream("createDeflate"),
    createInflate: () => unsupportedStream("createInflate"),
    createBrotliCompress: () => unsupportedStream("createBrotliCompress"),
    createBrotliDecompress: () => unsupportedStream("createBrotliDecompress")
  };
  builtin.default = builtin;
  return builtin;
}
function createPromisesApi() {
  const promises3 = {
    gzip: (input) => compress("gzip", input),
    gunzip: (input) => decompress("gzip", input),
    deflate: (input) => compress("deflate", input),
    inflate: (input) => decompress("deflate", input),
    brotliCompress: (input) => brotliCompress(input),
    brotliDecompress: (input) => brotliDecompress(input)
  };
  promises3.default = promises3;
  return promises3;
}
function createSyncApi() {
  return {
    gzipSync: () => unsupportedSync("gzipSync"),
    gunzipSync: () => unsupportedSync("gunzipSync"),
    deflateSync: () => unsupportedSync("deflateSync"),
    inflateSync: () => unsupportedSync("inflateSync"),
    brotliCompressSync: (input) => encodeBrotliFallback(toBytes3(input)),
    brotliDecompressSync: (input) => decodeBrotliFallback(toBytes3(input))
  };
}
async function compress(format2, input) {
  const host = await hostZlib();
  if (host?.[format2]) return promisifyHost(host[format2], input);
  if (typeof CompressionStream !== "function") throw unsupportedCompression(format2);
  return transformBytes(input, new CompressionStream(format2));
}
async function decompress(format2, input) {
  const host = await hostZlib();
  const fn = host?.[format2 === "gzip" ? "gunzip" : "inflate"];
  if (fn) return promisifyHost(fn, input);
  if (typeof DecompressionStream !== "function") throw unsupportedCompression(format2);
  return transformBytes(input, new DecompressionStream(format2));
}
async function brotliCompress(input) {
  const host = await hostZlib();
  if (host?.brotliCompress) return promisifyHost(host.brotliCompress, input);
  return encodeBrotliFallback(toBytes3(input));
}
async function brotliDecompress(input) {
  const bytes = toBytes3(input);
  const host = await hostZlib();
  if (host?.brotliDecompress) return promisifyHost(host.brotliDecompress, bytes);
  return decodeBrotliFallback(bytes);
}
async function transformBytes(input, transformStream) {
  const bytes = toBytes3(input);
  const stream = new Blob([bytes]).stream().pipeThrough(transformStream);
  return RuntimeBuffer.from(new Uint8Array(await new Response(stream).arrayBuffer()));
}
function callbackify(fn, process) {
  return (input, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    if (typeof cb !== "function") throw new TypeError("Callback must be a function");
    process?.__opencontainersAddRef?.();
    fn(input, typeof options === "function" ? void 0 : options).then((value) => cb(null, value), (error) => cb(error)).finally(() => process?.__opencontainersUnref?.());
  };
}
function promisifyHost(fn, input, options) {
  return new Promise((resolve2, reject) => {
    const callback = (error, result) => error ? reject(error) : resolve2(RuntimeBuffer.from(result));
    if (options === void 0) fn(toBytes3(input), callback);
    else fn(toBytes3(input), options, callback);
  });
}
var hostZlibPromise;
function hostZlib() {
  if (typeof globalThis.process?.versions?.node !== "string") return Promise.resolve(null);
  hostZlibPromise ?? (hostZlibPromise = Function("specifier", "return import(specifier)")("node:zlib").catch(() => null));
  return hostZlibPromise;
}
function toBytes3(input) {
  return RuntimeBuffer.from(input);
}
function encodeBrotliFallback(bytes) {
  const output = RuntimeBuffer.alloc(BROTLI_FALLBACK_MAGIC.length + bytes.length);
  output.set(BROTLI_FALLBACK_MAGIC, 0);
  output.set(bytes, BROTLI_FALLBACK_MAGIC.length);
  return output;
}
function decodeBrotliFallback(bytes) {
  for (let index = 0; index < BROTLI_FALLBACK_MAGIC.length; index++) {
    if (bytes[index] !== BROTLI_FALLBACK_MAGIC[index]) throw unsupportedBrotli();
  }
  return RuntimeBuffer.from(bytes.subarray(BROTLI_FALLBACK_MAGIC.length));
}
function unsupportedCompression(format2) {
  return Object.assign(new Error(`${format2} compression is not available in this browser`), {
    code: "ERR_OPENCONTAINERS_ZLIB_UNSUPPORTED"
  });
}
function unsupportedBrotli() {
  return Object.assign(new Error("Brotli is not available in this browser for externally-compressed payloads"), {
    code: "ERR_OPENCONTAINERS_BROTLI_UNSUPPORTED"
  });
}
function unsupportedSync(name) {
  throw Object.assign(new Error(`${name} is not available in the browser runtime`), {
    code: "ERR_OPENCONTAINERS_ZLIB_SYNC_UNSUPPORTED"
  });
}
function unsupportedStream(name) {
  throw Object.assign(new Error(`${name} streams are not implemented yet`), {
    code: "ERR_OPENCONTAINERS_ZLIB_STREAM_UNSUPPORTED"
  });
}

// packages/runtime-node/src/builtins/async_hooks.js
var nextAsyncId = 1;
function createAsyncContextManager() {
  let currentContext = /* @__PURE__ */ new Map();
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
    bind(callback, thisArg = void 0) {
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
    }
  };
  return manager;
}
function createAsyncHooksBuiltin({ asyncContextManager }) {
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
      }
    }),
    executionAsyncId: () => 0,
    executionAsyncResource: () => ({}),
    triggerAsyncId: () => 0
  };
  builtin.default = builtin;
  return builtin;
}

// packages/runtime-node/src/builtins/timers.js
var nextTimerId = 1;
function createTimerApi({ process, asyncContextManager } = {}) {
  const setTimeoutCompat = (callback, delay = 0, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "timeout", process, asyncContextManager, callback, args, delay });
    handle.start();
    return handle;
  };
  const setIntervalCompat = (callback, delay = 0, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "interval", process, asyncContextManager, callback, args, delay, repeat: true });
    handle.start();
    return handle;
  };
  const setImmediateCompat = (callback, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "immediate", process, asyncContextManager, callback, args, delay: 0 });
    handle.start();
    return handle;
  };
  const clearTimer = (handle) => {
    if (handle instanceof OpenContainersTimerHandle) {
      handle.close();
      return;
    }
    globalThis.clearTimeout(handle);
    globalThis.clearInterval(handle);
  };
  return {
    clearImmediate: clearTimer,
    clearInterval: clearTimer,
    clearTimeout: clearTimer,
    setImmediate: setImmediateCompat,
    setInterval: setIntervalCompat,
    setTimeout: setTimeoutCompat,
    builtin: {
      clearImmediate: clearTimer,
      clearInterval: clearTimer,
      clearTimeout: clearTimer,
      setImmediate: setImmediateCompat,
      setInterval: setIntervalCompat,
      setTimeout: setTimeoutCompat
    },
    promisesBuiltin: {
      setImmediate: (value) => new Promise((resolve2) => setImmediateCompat(() => resolve2(value))),
      setInterval: async function* timersPromisesSetInterval(delay = 1, value) {
        while (true) {
          await new Promise((resolve2) => setTimeoutCompat(resolve2, delay));
          yield value;
        }
      },
      setTimeout: (delay = 1, value) => new Promise((resolve2) => setTimeoutCompat(() => resolve2(value), delay))
    }
  };
}
var OpenContainersTimerHandle = class {
  constructor({ kind, process, asyncContextManager, callback, args = [], delay = 0, repeat = false }) {
    this.kind = kind;
    this.process = process;
    this.asyncContextManager = asyncContextManager;
    this.asyncContext = asyncContextManager?.snapshot();
    this.callback = typeof callback === "function" ? callback : () => {
    };
    this.args = args;
    this.delay = Number(delay) || 0;
    this.repeat = repeat;
    this.id = nextTimerId++;
    this.active = true;
    this.refed = true;
    this.refreshedDuringCallback = false;
    this.process?.__opencontainersAddRef?.();
    this.disposeExitHook = this.process?.__opencontainersOnExit?.(() => this.close({ releaseRef: false }));
  }
  start() {
    if (this.kind === "interval") this.nativeHandle = globalThis.setInterval(() => this.fire(), this.delay);
    else this.nativeHandle = globalThis.setTimeout(() => this.fire(), this.delay);
  }
  clearNativeHandle() {
    if (this.kind === "interval") globalThis.clearInterval(this.nativeHandle);
    else globalThis.clearTimeout(this.nativeHandle);
    this.nativeHandle = null;
  }
  fire() {
    if (!this.active) return;
    if (this.process?.__opencontainersIsAlive?.() === false) {
      this.close();
      return;
    }
    this.refreshedDuringCallback = false;
    try {
      const run = () => this.callback(...this.args);
      const result = this.asyncContextManager ? this.asyncContextManager.runWithContext(this.asyncContext, run) : run();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}
`);
          this.process.exitCode = 1;
          this.close();
        });
      }
    } catch (error) {
      this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}
`);
      this.process.exitCode = 1;
      this.close();
      return;
    }
    if (!this.repeat && !this.refreshedDuringCallback) this.close();
  }
  close({ releaseRef = true } = {}) {
    if (!this.active) return;
    this.active = false;
    this.clearNativeHandle();
    this.disposeExitHook?.();
    this.disposeExitHook = null;
    if (releaseRef && this.refed) {
      this.refed = false;
      this.process?.__opencontainersUnref?.();
    }
  }
  ref() {
    if (this.active && !this.refed) {
      this.refed = true;
      this.process?.__opencontainersAddRef?.();
    }
    return this;
  }
  unref() {
    if (this.active && this.refed) {
      this.refed = false;
      this.process?.__opencontainersUnref?.();
    }
    return this;
  }
  hasRef() {
    return this.refed;
  }
  refresh() {
    if (!this.active) return this;
    this.refreshedDuringCallback = true;
    this.clearNativeHandle();
    this.start();
    return this;
  }
  [Symbol.toPrimitive]() {
    return this.id;
  }
};

// packages/runtime-node/src/builtins/worker_threads.js
var nextThreadId = 1;
function createWorkerThreadsBuiltin({ process, workerContext = null, runWorkerSource }) {
  var _specifier, _options, _parentPort, _workerPort, _abortController, _disposeExitHook, _exited, _terminated, _exitCode, _refed, _Worker_instances, start_fn, emitWorkerError_fn, forceTerminate_fn, finish_fn;
  const isMainThread = !workerContext;
  class RuntimeMessagePort extends MessagePort {
    constructor() {
      super({ process });
    }
  }
  class RuntimeMessageChannel extends MessageChannel2 {
    constructor() {
      super({ process });
    }
  }
  class Worker2 extends EventEmitter {
    constructor(specifier, options = {}) {
      super();
      __privateAdd(this, _Worker_instances);
      __privateAdd(this, _specifier);
      __privateAdd(this, _options);
      __privateAdd(this, _parentPort);
      __privateAdd(this, _workerPort);
      __privateAdd(this, _abortController);
      __privateAdd(this, _disposeExitHook);
      __privateAdd(this, _exited, false);
      __privateAdd(this, _terminated, false);
      __privateAdd(this, _exitCode, null);
      __privateAdd(this, _refed, false);
      if (typeof runWorkerSource !== "function") {
        throw Object.assign(new Error("node:worker_threads is unavailable in this runtime"), {
          code: "ERR_OPENCONTAINERS_WORKER_THREADS_UNAVAILABLE"
        });
      }
      this.threadId = nextThreadId++;
      this.resourceLimits = options.resourceLimits ?? {};
      this.stdin = null;
      this.stdout = null;
      this.stderr = null;
      this.performance = { eventLoopUtilization: () => ({ idle: 0, active: 0, utilization: 0 }) };
      __privateSet(this, _specifier, specifier);
      __privateSet(this, _options, options);
      __privateSet(this, _parentPort, new RuntimeMessagePort());
      __privateSet(this, _workerPort, new RuntimeMessagePort());
      __privateGet(this, _parentPort).__opencontainersSetPeer(__privateGet(this, _workerPort));
      __privateGet(this, _workerPort).__opencontainersSetPeer(__privateGet(this, _parentPort));
      __privateGet(this, _parentPort).on("message", (message) => this.emit("message", message));
      __privateGet(this, _parentPort).on("messageerror", (error) => {
        if (this.listenerCount("messageerror") > 0) this.emit("messageerror", error);
      });
      __privateSet(this, _abortController, typeof AbortController === "function" ? new AbortController() : null);
      __privateSet(this, _refed, true);
      process?.__opencontainersAddRef?.();
      __privateSet(this, _disposeExitHook, process?.__opencontainersOnExit?.(() => {
        __privateMethod(this, _Worker_instances, forceTerminate_fn).call(this, 1);
      }));
      queueMicrotask(() => __privateMethod(this, _Worker_instances, start_fn).call(this));
    }
    postMessage(message) {
      if (__privateGet(this, _exited) || __privateGet(this, _terminated)) return false;
      __privateGet(this, _parentPort).postMessage(message);
      return true;
    }
    terminate() {
      if (__privateGet(this, _exited)) return Promise.resolve(__privateGet(this, _exitCode) ?? 0);
      __privateMethod(this, _Worker_instances, forceTerminate_fn).call(this, 1);
      return Promise.resolve(__privateGet(this, _exitCode) ?? 1);
    }
    ref() {
      if (!__privateGet(this, _refed) && !__privateGet(this, _exited)) {
        __privateSet(this, _refed, true);
        process?.__opencontainersAddRef?.();
      }
      return this;
    }
    unref() {
      if (__privateGet(this, _refed)) {
        __privateSet(this, _refed, false);
        process?.__opencontainersUnref?.();
      }
      return this;
    }
  }
  _specifier = new WeakMap();
  _options = new WeakMap();
  _parentPort = new WeakMap();
  _workerPort = new WeakMap();
  _abortController = new WeakMap();
  _disposeExitHook = new WeakMap();
  _exited = new WeakMap();
  _terminated = new WeakMap();
  _exitCode = new WeakMap();
  _refed = new WeakMap();
  _Worker_instances = new WeakSet();
  start_fn = async function() {
    if (__privateGet(this, _terminated) || __privateGet(this, _exited)) return;
    this.emit("online");
    try {
      await runWorkerSource(__privateGet(this, _specifier), {
        eval: __privateGet(this, _options).eval === true,
        filename: __privateGet(this, _options).name ? `[worker ${__privateGet(this, _options).name}].js` : `[worker ${this.threadId}].js`,
        parentPort: __privateGet(this, _workerPort),
        signal: __privateGet(this, _abortController)?.signal,
        threadId: this.threadId,
        type: __privateGet(this, _options).type,
        workerData: cloneMessage(__privateGet(this, _options).workerData)
      });
      if (!__privateGet(this, _terminated)) __privateMethod(this, _Worker_instances, finish_fn).call(this, 0);
    } catch (error) {
      if (__privateGet(this, _terminated)) return;
      if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") {
        __privateMethod(this, _Worker_instances, finish_fn).call(this, error.exitCode ?? 0);
        return;
      }
      __privateMethod(this, _Worker_instances, emitWorkerError_fn).call(this, error);
      __privateMethod(this, _Worker_instances, finish_fn).call(this, 1);
    }
  };
  emitWorkerError_fn = function(error) {
    if (this.listenerCount("error") > 0) {
      try {
        this.emit("error", error);
      } catch (emitError) {
        process?.stderr?.write?.(`${emitError?.stack ?? emitError?.message ?? emitError}
`);
      }
      return;
    }
    process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}
`);
  };
  forceTerminate_fn = function(code) {
    if (__privateGet(this, _exited)) return;
    __privateSet(this, _terminated, true);
    __privateGet(this, _abortController)?.abort?.();
    __privateGet(this, _parentPort).close();
    __privateGet(this, _workerPort).close();
    __privateMethod(this, _Worker_instances, finish_fn).call(this, code);
  };
  finish_fn = function(code) {
    var _a2;
    if (__privateGet(this, _exited)) return;
    __privateSet(this, _exited, true);
    __privateSet(this, _exitCode, Number(code) || 0);
    __privateGet(this, _workerPort).close();
    (_a2 = __privateGet(this, _disposeExitHook)) == null ? void 0 : _a2.call(this);
    __privateSet(this, _disposeExitHook, null);
    if (__privateGet(this, _refed)) {
      __privateSet(this, _refed, false);
      process?.__opencontainersUnref?.();
    }
    this.emit("exit", __privateGet(this, _exitCode));
  };
  const builtin = {
    Worker: Worker2,
    MessageChannel: RuntimeMessageChannel,
    MessagePort: RuntimeMessagePort,
    isMainThread,
    parentPort: workerContext?.parentPort ?? null,
    receiveMessageOnPort,
    resourceLimits: {},
    SHARE_ENV: /* @__PURE__ */ Symbol.for("opencontainers.worker_threads.SHARE_ENV"),
    threadId: workerContext?.threadId ?? 0,
    workerData: workerContext?.workerData,
    markAsUntransferable() {
    },
    moveMessagePortToContext(port) {
      return port;
    }
  };
  return builtin;
}
var _process2, _peer2, _closed, _queue, _MessagePort_instances, dispatchMessage_fn;
var MessagePort = class extends EventEmitter {
  constructor({ process } = {}) {
    super();
    __privateAdd(this, _MessagePort_instances);
    __privateAdd(this, _process2, null);
    __privateAdd(this, _peer2, null);
    __privateAdd(this, _closed, false);
    __privateAdd(this, _queue, []);
    __publicField(this, "onmessage", null);
    __publicField(this, "onmessageerror", null);
    __privateSet(this, _process2, process);
  }
  postMessage(message) {
    if (__privateGet(this, _closed) || !__privateGet(this, _peer2) || __privateGet(__privateGet(this, _peer2), _closed)) return;
    const cloned = cloneMessage(message);
    __privateGet(this, _process2)?.__opencontainersAddRef?.();
    queueMicrotask(() => {
      var _a2;
      try {
        if (__privateGet(this, _peer2) && !__privateGet(__privateGet(this, _peer2), _closed)) __privateMethod(_a2 = __privateGet(this, _peer2), _MessagePort_instances, dispatchMessage_fn).call(_a2, cloned);
      } finally {
        __privateGet(this, _process2)?.__opencontainersUnref?.();
      }
    });
  }
  start() {
    return this;
  }
  close() {
    if (__privateGet(this, _closed)) return;
    __privateSet(this, _closed, true);
    this.emit("close");
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
  __opencontainersSetPeer(peer) {
    __privateSet(this, _peer2, peer);
  }
  __opencontainersQueueMessage(message) {
    __privateGet(this, _queue).push(cloneMessage(message));
  }
  __opencontainersReceiveMessage() {
    return __privateGet(this, _queue).length ? { message: __privateGet(this, _queue).shift() } : void 0;
  }
};
_process2 = new WeakMap();
_peer2 = new WeakMap();
_closed = new WeakMap();
_queue = new WeakMap();
_MessagePort_instances = new WeakSet();
dispatchMessage_fn = function(message) {
  this.emit("message", message);
  if (typeof this.onmessage === "function") {
    this.onmessage.call(this, { data: message, target: this, currentTarget: this });
  }
};
var MessageChannel2 = class {
  constructor({ process } = {}) {
    this.port1 = new MessagePort({ process });
    this.port2 = new MessagePort({ process });
    this.port1.__opencontainersSetPeer(this.port2);
    this.port2.__opencontainersSetPeer(this.port1);
  }
};
function receiveMessageOnPort(port) {
  return port?.__opencontainersReceiveMessage?.();
}
function cloneMessage(value) {
  if (value === void 0) return void 0;
  if (typeof structuredClone !== "function") return value;
  try {
    return structuredClone(value);
  } catch (_) {
    return value;
  }
}

// packages/runtime-node/src/esm-transform.js
function transformEsmToCjs(source, { filename }) {
  const exportNames = /* @__PURE__ */ new Map();
  let transformed = source.replace(/\bimport\.meta\.url\b/g, JSON.stringify(`file://${filename}`));
  transformed = transformed.replace(/\bimport\s*\(([^)]+)\)/g, (_match, specifierExpression) => `__opencontainersDynamicImport(${specifierExpression})`);
  transformed = transformed.replace(/^\s*import\s+["']([^"']+)["'];?\s*$/gm, (_match, specifier) => {
    return `__opencontainersRequire(${JSON.stringify(specifier)});`;
  });
  transformed = transformed.replace(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, name, specifier) => {
    return `const ${name} = __opencontainersRequire(${JSON.stringify(specifier)});`;
  });
  transformed = transformed.replace(/^\s*import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, imports, specifier) => {
    return `const { ${normalizeImportBindings(imports)} } = __opencontainersRequire(${JSON.stringify(specifier)});`;
  });
  transformed = transformed.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s*,\s*{([^}]+)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, defaultName, imports, specifier) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});
const ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});
const { ${normalizeImportBindings(imports)} } = ${temp};`;
  });
  transformed = transformed.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, defaultName, specifier) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});
const ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});`;
  });
  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+default\s+function\s*([A-Za-z_$][\w$]*)?\s*\(/g, (_match, prefix, indent, name) => {
    if (name) {
      exportNames.set("default", name);
      return `${prefix}${indent}function ${name}(`;
    }
    exportNames.set("default", "__opencontainers_default_export");
    return `${prefix}${indent}function __opencontainers_default_export(`;
  });
  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+default\s+class\s*([A-Za-z_$][\w$]*)?\s*/g, (_match, prefix, indent, name) => {
    if (name) {
      exportNames.set("default", name);
      return `${prefix}${indent}class ${name} `;
    }
    exportNames.set("default", "__opencontainers_default_export");
    return `${prefix}${indent}class __opencontainers_default_export `;
  });
  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+default\s+([^;\n]+);?/g, (_match, prefix, indent, expression) => {
    return `${prefix}${indent}const __opencontainers_default_export = ${trimTrailingSemicolon(expression)};
${indent}exports.default = __opencontainers_default_export;
${indent}exports.__esModule = true;`;
  });
  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+(const|let|var)\s+([^;]+);?/g, (_match, prefix, indent, kind, declaration) => {
    const names = declaredVariableNames(declaration);
    for (const name of names) exportNames.set(name, name);
    return `${prefix}${indent}${kind} ${declaration};`;
  });
  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_match, prefix, indent, name) => {
    exportNames.set(name, name);
    return `${prefix}${indent}function ${name}(`;
  });
  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+class\s+([A-Za-z_$][\w$]*)\s*/g, (_match, prefix, indent, name) => {
    exportNames.set(name, name);
    return `${prefix}${indent}class ${name} `;
  });
  transformed = transformed.replace(/^\s*export\s+{([^}]*)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, exportsList, specifier) => {
    const temp = `__opencontainers_reexport_${Math.random().toString(16).slice(2)}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});
${normalizeExportList(exportsList).map(({ local, exported }) => `exports[${JSON.stringify(exported)}] = ${temp}[${JSON.stringify(local)}];`).join("\n")}`;
  });
  transformed = transformed.replace(/^\s*export\s+\*\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, specifier) => {
    const temp = `__opencontainers_reexport_all_${Math.random().toString(16).slice(2)}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});
for (const key of Object.keys(${temp})) if (key !== 'default' && key !== '__esModule') exports[key] = ${temp}[key];`;
  });
  transformed = transformed.replace(/^\s*export\s+{([^}]*)};?\s*$/gm, (_match, exportsList) => {
    return normalizeExportList(exportsList).map(({ local, exported }) => `exports[${JSON.stringify(exported)}] = ${local};`).join("\n");
  });
  if (exportNames.size) {
    transformed += "\nexports.__esModule = true;\n";
    for (const [exported, local] of exportNames.entries()) {
      transformed += `exports[${JSON.stringify(exported)}] = ${local};
`;
    }
  }
  return transformed;
}
function looksLikeEsm(source) {
  const strippedSource = stripCommentsForEsmDetection(source);
  return /(^|\n)\s*import\s+[\w*{"']|\bimport\s*\(|(^|\n)\s*export\s+/m.test(strippedSource);
}
function stripCommentsForEsmDetection(source) {
  let output = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "line-comment") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      output += char;
      if (char === "\\") {
        output += next ?? "";
        index += 1;
        continue;
      }
      if (state === "single" && char === "'" || state === "double" && char === '"' || state === "template" && char === "`") {
        state = "code";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
      continue;
    }
    if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
      continue;
    }
    if (char === "'") state = "single";
    else if (char === '"') state = "double";
    else if (char === "`") state = "template";
    output += char;
  }
  return output;
}
function normalizeImportBindings(imports) {
  return imports.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [imported, local] = part.split(/\s+as\s+/).map((value) => value.trim());
    return local ? `${imported}: ${local}` : imported;
  }).join(", ");
}
function normalizeExportList(exportsList) {
  return exportsList.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [local, exported] = part.split(/\s+as\s+/).map((value) => value.trim());
    return { local, exported: exported ?? local };
  });
}
function declaredVariableNames(declaration) {
  return declaration.split(",").map((part) => part.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1]).filter(Boolean);
}
function trimTrailingSemicolon(value) {
  return value.trim().replace(/;$/, "");
}

// packages/runtime-node/src/module-loader.js
var textDecoder3 = new TextDecoder();
var CORE_MODULES = Object.freeze([
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
var MODULE_EXTENSIONS = Object.freeze({
  ".js": () => {
  },
  ".json": () => {
  },
  ".node": () => {
    throw Object.assign(new Error("Native addons are not supported in OpenContainers"), {
      code: "ERR_OPENCONTAINERS_NATIVE_ADDON_UNSUPPORTED"
    });
  }
});
var ModuleResolutionError = class extends Error {
  constructor(specifier, fromPath) {
    super(`Cannot find module '${specifier}' from '${fromPath}'`);
    this.code = "MODULE_NOT_FOUND";
    this.specifier = specifier;
    this.fromPath = fromPath;
  }
};
var _process3, _fetch, _timers, _workerThreads;
var _ModuleLoader = class _ModuleLoader {
  constructor({ kernel, descriptor, console }) {
    __privateAdd(this, _process3);
    __privateAdd(this, _fetch);
    __privateAdd(this, _timers);
    __privateAdd(this, _workerThreads);
    this.kernel = kernel;
    this.descriptor = descriptor;
    this.console = console;
    this.cache = /* @__PURE__ */ new Map();
    this.coreModules = /* @__PURE__ */ new Map();
    this.runtimeGlobalObject = null;
    this.asyncContextManager = createAsyncContextManager();
  }
  createRequire(parentFilename = `${this.descriptor.cwd}/[repl].js`) {
    const require2 = (specifier) => this.require(specifier, parentFilename);
    require2.resolve = (specifier) => this.resolve(specifier, parentFilename);
    require2.resolve.paths = (specifier) => {
      const normalized = String(specifier).replace(/^node:/, "");
      if (this.isCoreModule(normalized)) return null;
      return this.nodeModulePaths(dirname(parentFilename || `${this.descriptor.cwd}/[repl].js`));
    };
    require2.cache = this.cache;
    require2.extensions = MODULE_EXTENSIONS;
    require2.main = null;
    return require2;
  }
  require(specifier, parentFilename) {
    const core = this.loadCoreModule(specifier);
    if (core) return core;
    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename);
    if (this.cache.has(resolved)) return this.cache.get(resolved).exports;
    if (resolved.endsWith(".json")) {
      const module2 = { id: resolved, filename: resolved, exports: {} };
      this.cache.set(resolved, module2);
      module2.exports = JSON.parse(this.kernel.fs.readFileSync(resolved, "utf8"));
      return module2.exports;
    }
    const source = this.readModuleSource(resolved);
    const executableSource = stripHashbang(this.shouldTransformEsm(resolved, source) ? transformEsmToCjs(source, { filename: resolved }) : source);
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
      `with (__opencontainersGlobals) {
${executableSource}
}
//# sourceURL=opencontainers://${resolved}`
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
      (specifier2) => this.dynamicImport(specifier2, resolved)
    );
    return module.exports;
  }
  async import(specifier, parentFilename) {
    const core = this.loadCoreModule(specifier);
    if (core) return core;
    const resolved = this.resolve(stripResourceQuery(specifier), parentFilename);
    if (this.cache.has(resolved)) return this.cache.get(resolved).exports;
    if (resolved.endsWith(".json")) {
      const module2 = { id: resolved, filename: resolved, exports: {} };
      this.cache.set(resolved, module2);
      module2.exports = JSON.parse(this.kernel.fs.readFileSync(resolved, "utf8"));
      return module2.exports;
    }
    const source = this.readModuleSource(resolved);
    const executableSource = stripHashbang(this.shouldTransformEsm(resolved, source) ? transformEsmToCjs(source, { filename: resolved }) : source);
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
      `return (async () => {
with (__opencontainersGlobals) {
${executableSource}
}
})();
//# sourceURL=opencontainers://${resolved}`
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
    if (!__privateGet(this, _process3)) {
      __privateSet(this, _process3, createProcessBuiltin({
        descriptor: this.descriptor,
        kernel: this.kernel,
        asyncContextManager: this.asyncContextManager,
        getBuiltinModule: (specifier) => this.loadCoreModule(specifier)
      }));
    }
    return __privateGet(this, _process3);
  }
  get fetch() {
    if (!__privateGet(this, _fetch)) __privateSet(this, _fetch, createRuntimeFetch({ kernel: this.kernel, process: this.process }));
    return __privateGet(this, _fetch);
  }
  get timers() {
    if (!__privateGet(this, _timers)) {
      __privateSet(this, _timers, createTimerApi({
        process: this.process,
        asyncContextManager: this.asyncContextManager
      }));
    }
    return __privateGet(this, _timers);
  }
  get workerThreads() {
    if (!__privateGet(this, _workerThreads)) {
      __privateSet(this, _workerThreads, createWorkerThreadsBuiltin({
        process: this.process,
        workerContext: this.descriptor.workerContext,
        runWorkerSource: (specifier, options) => this.runWorkerSource(specifier, options)
      }));
    }
    return __privateGet(this, _workerThreads);
  }
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
          const schedule = typeof globalThis.queueMicrotask === "function" ? globalThis.queueMicrotask.bind(globalThis) : (task) => Promise.resolve().then(task);
          schedule(() => {
            try {
              wrapped();
            } catch (error) {
              this.process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}
`);
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
        alert: void 0,
        confirm: void 0,
        prompt: void 0,
        open: void 0,
        close: void 0,
        window: void 0,
        document: void 0,
        location: void 0,
        history: void 0,
        localStorage: void 0,
        sessionStorage: void 0,
        indexedDB: void 0,
        navigator: void 0,
        parent: void 0,
        top: void 0,
        self: void 0
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
    if (name === "path") return path_default;
    if (name === "path/posix") return path_default.posix;
    if (name === "path/win32") return path_default.win32;
    if (name === "process") return this.process;
    if (name === "console") return createConsoleBuiltin(this.console);
    if (name === "cluster") return clusterBuiltin;
    if (name === "dgram") return dgramBuiltin;
    if (name === "domain") return domainBuiltin;
    if (name === "events") return events_default;
    if (name === "stream") return stream_default;
    if (name === "stream/consumers") return streamConsumersBuiltin;
    if (name === "stream/promises") return promises;
    if (name === "stream/web") return streamWebBuiltin;
    if (name === "string_decoder") return string_decoder_default;
    if (name === "tty") return tty_default;
    if (name === "readline") return readline_default;
    if (name === "readline/promises") return readline_default.promises;
    if (name === "buffer") return buffer_default;
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
    const custom = fn?.[/* @__PURE__ */ Symbol.for("nodejs.util.promisify.custom")];
    if (typeof custom === "function") return custom;
    return (...args) => new Promise((resolve2, reject) => {
      fn(...args, (error, ...values) => {
        if (error) reject(error);
        else resolve2(values.length > 1 ? values : values[0]);
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
    const workerLoader = new _ModuleLoader({
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
    const executableSource = type === "module" || looksLikeEsm(source) ? transformEsmToCjs(source, { filename }) : source;
    const module = { id: filename, filename, exports: {} };
    const require2 = this.createRequire(filename);
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
      `return (async () => {
with (__opencontainersGlobals) {
${executableSource}
}
})();
//# sourceURL=opencontainers://${filename}`
    );
    await wrapped(
      module.exports,
      require2,
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
      require2,
      this.fetch,
      (specifier) => this.dynamicImport(specifier, filename)
    );
    return module.exports;
  }
  createCryptoBuiltin() {
    return createCryptoBuiltin({ process: this.process });
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
    OpenContainersModule._nodeModulePaths = (from3) => this.nodeModulePaths(from3);
    OpenContainersModule.wrap = (source) => `(function (exports, require, module, __filename, __dirname) { ${source}
});`;
    OpenContainersModule.syncBuiltinESMExports = () => {
    };
    OpenContainersModule.findSourceMap = () => void 0;
    OpenContainersModule.register = () => {
    };
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
    const packageParts = specifier.startsWith("@") ? specifier.split("/").slice(0, 2) : [specifier.split("/")[0]];
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
  nodeModulePaths(from3) {
    const paths = [];
    let current = normalizePath(from3 || this.descriptor.cwd);
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
      const exact = pkg.exports[subpath] ?? (subpath === "." ? pkg.exports["."] : void 0) ?? (subpath === "." && this.isConditionalExportObject(pkg.exports) ? pkg.exports : void 0);
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
          return void 0;
        }
      }
      if (current === "/") return void 0;
      current = dirname(current);
    }
  }
};
_process3 = new WeakMap();
_fetch = new WeakMap();
_timers = new WeakMap();
_workerThreads = new WeakMap();
var ModuleLoader = _ModuleLoader;
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
  return new Promise((resolve2) => {
    const previousOnIdle = descriptor.onIdle;
    const finish = () => {
      if (descriptor.onIdle === onIdle) descriptor.onIdle = previousOnIdle;
      signal?.removeEventListener?.("abort", finish);
      resolve2();
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
  const cleanupTasks = [...descriptor.cleanupTasks ?? []];
  descriptor.cleanupTasks?.clear();
  descriptor.refCount = 0;
  descriptor.onIdle = null;
  for (const cleanup of cleanupTasks) {
    try {
      cleanup();
    } catch (_) {
    }
  }
}
var SYSTEM_ERRORS = /* @__PURE__ */ new Map([
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
var MIME_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
var _MIMEParams_instances, parse_fn, _map;
var MIMEParams = class {
  constructor(init = "") {
    __privateAdd(this, _MIMEParams_instances);
    __privateAdd(this, _map);
    __privateSet(this, _map, /* @__PURE__ */ new Map());
    if (typeof init === "string") {
      __privateMethod(this, _MIMEParams_instances, parse_fn).call(this, init);
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
    return __privateGet(this, _map).get(normalizeMimeParameterName(name)) ?? null;
  }
  has(name) {
    return __privateGet(this, _map).has(normalizeMimeParameterName(name));
  }
  set(name, value) {
    __privateGet(this, _map).set(normalizeMimeParameterName(name), String(value));
  }
  delete(name) {
    __privateGet(this, _map).delete(normalizeMimeParameterName(name));
  }
  entries() {
    return __privateGet(this, _map).entries();
  }
  keys() {
    return __privateGet(this, _map).keys();
  }
  values() {
    return __privateGet(this, _map).values();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  toString() {
    return [...__privateGet(this, _map)].map(([name, value]) => `${name}=${formatMimeParameterValue(value)}`).join(";");
  }
};
_MIMEParams_instances = new WeakSet();
parse_fn = function(input) {
  for (const part of String(input).split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const name = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    this.set(name, unquoteMimeParameterValue(value));
  }
};
_map = new WeakMap();
var _type3, _subtype;
var MIMEType = class {
  constructor(input) {
    __privateAdd(this, _type3);
    __privateAdd(this, _subtype);
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
    return __privateGet(this, _type3);
  }
  set type(value) {
    __privateSet(this, _type3, normalizeMimeTypePart(value, "type"));
  }
  get subtype() {
    return __privateGet(this, _subtype);
  }
  set subtype(value) {
    __privateSet(this, _subtype, normalizeMimeTypePart(value, "subtype"));
  }
  toString() {
    const params = this.params.toString();
    return params ? `${this.essence};${params}` : this.essence;
  }
};
_type3 = new WeakMap();
_subtype = new WeakMap();
function createUtilBuiltin({ console, promisify }) {
  const util = {
    aborted(signal) {
      if (signal?.aborted) return Promise.resolve();
      return new Promise((resolve2) => {
        signal?.addEventListener?.("abort", resolve2, { once: true });
      });
    },
    callbackify(fn) {
      return (...args) => {
        const callback = args.pop();
        Promise.resolve().then(() => fn(...args)).then(
          (value) => callback(null, value),
          (error) => callback(error)
        );
      };
    },
    debuglog() {
      return () => {
      };
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
      isArrayBuffer: (value) => value instanceof ArrayBuffer,
      isArrayBufferView: (value) => ArrayBuffer.isView(value),
      isAnyArrayBuffer: (value) => value instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer,
      isArgumentsObject: (value) => tagOf(value) === "[object Arguments]",
      isAsyncFunction: (value) => value?.constructor?.name === "AsyncFunction",
      isBoxedPrimitive: (value) => value instanceof String || value instanceof Number || value instanceof Boolean || tagOf(value) === "[object BigInt]" || tagOf(value) === "[object Symbol]",
      isDate: (value) => value instanceof Date,
      isDataView: (value) => value instanceof DataView,
      isExternal: () => false,
      isGeneratorFunction: (value) => value?.constructor?.name === "GeneratorFunction",
      isKeyObject: (value) => Boolean(value?.[KEY_OBJECT_BRAND]),
      isMap: (value) => value instanceof Map,
      isMapIterator: (value) => tagOf(value) === "[object Map Iterator]",
      isModuleNamespaceObject: (value) => tagOf(value) === "[object Module]",
      isNativeError: (value) => value instanceof Error,
      isPromise: (value) => value && typeof value.then === "function",
      isProxy: () => false,
      isRegExp: (value) => value instanceof RegExp,
      isSet: (value) => value instanceof Set,
      isSetIterator: (value) => tagOf(value) === "[object Set Iterator]",
      isSharedArrayBuffer: (value) => typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer,
      isTypedArray: (value) => ArrayBuffer.isView(value) && !(value instanceof DataView),
      isUint8Array: (value) => value instanceof Uint8Array,
      isWeakMap: (value) => value instanceof WeakMap,
      isWeakSet: (value) => value instanceof WeakSet
    }
  };
  util.promisify.custom = /* @__PURE__ */ Symbol.for("nodejs.util.promisify.custom");
  util.inspect.custom = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
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
  return `"${string.replace(/["\\]/g, (match) => `\\${match}`)}"`;
}
function unquoteMimeParameterValue(value) {
  const string = String(value);
  if (string.length >= 2 && string[0] === '"' && string[string.length - 1] === '"') {
    return string.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return string;
}
function isDeepStrictEqual(left, right) {
  return deepStrictEqualValues(left, right, /* @__PURE__ */ new WeakMap());
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
  var _timers2;
  class Console {
    constructor(stdout = console, stderr = stdout) {
      __privateAdd(this, _timers2, /* @__PURE__ */ new Map());
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
      __privateGet(this, _timers2).set(String(label), performanceNow());
    }
    timeEnd(label = "default") {
      const key = String(label);
      const start = __privateGet(this, _timers2).get(key);
      if (start === void 0) {
        this.warn(`No such label '${key}' for console.timeEnd()`);
        return;
      }
      __privateGet(this, _timers2).delete(key);
      this.log(`${key}: ${(performanceNow() - start).toFixed(3)}ms`);
    }
  }
  _timers2 = new WeakMap();
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
    target.write(`${args.map((value) => typeof value === "string" ? value : inspect(value)).join(" ")}
`);
    return;
  }
  target?.[method]?.(...args);
}
function tagOf(value) {
  return Object.prototype.toString.call(value);
}
function format(first, ...args) {
  if (typeof first !== "string") {
    return [first, ...args].map((value) => inspect(value)).join(" ");
  }
  let index = 0;
  const formatted = first.replace(/%[sdifjoO%]/g, (token) => {
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
  const rest = args.slice(index).map((value) => inspect(value));
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
    if (code >= 55296 && code <= 56319) {
      const next = input.charCodeAt(index + 1);
      if (next >= 56320 && next <= 57343) {
        output += input[index] + input[index + 1];
        index += 1;
      } else {
        output += "\uFFFD";
      }
      continue;
    }
    if (code >= 56320 && code <= 57343) {
      output += "\uFFFD";
      continue;
    }
    output += input[index];
  }
  return output;
}
function parseArgs(config = {}) {
  const args = [...config.args ?? []].map(String);
  const options = config.options ?? {};
  const strict = config.strict !== false;
  const allowPositionals = config.allowPositionals !== false;
  const tokensEnabled = Boolean(config.tokens);
  const values = /* @__PURE__ */ Object.create(null);
  const positionals = [];
  const tokens = [];
  const shortToLong = /* @__PURE__ */ new Map();
  for (const [name, option] of Object.entries(options)) {
    if (Object.prototype.hasOwnProperty.call(option, "default")) values[name] = option.default;
    if (option.short) shortToLong.set(option.short, name);
  }
  const setOption = (name, value, rawName, inlineValue = void 0) => {
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
        value: option.type === "boolean" ? void 0 : parsedValue,
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
        setOption(name, equalsIndex === -1 ? true : arg.slice(equalsIndex + 1) !== "false", `--${name}`, equalsIndex === -1 ? void 0 : arg.slice(equalsIndex + 1));
      } else {
        const value = equalsIndex === -1 ? args[++index] : arg.slice(equalsIndex + 1);
        if (value === void 0) throw Object.assign(new TypeError(`Option '${name}' argument missing`), { code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" });
        setOption(name, value, `--${name}`, equalsIndex === -1 ? void 0 : value);
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
          if (value === void 0) throw Object.assign(new TypeError(`Option '${short}' argument missing`), { code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" });
          setOption(name, value, `-${short}`, rest || void 0);
          break;
        }
        setOption(name, true, `-${short}`);
      }
      continue;
    }
    pushPositional(arg);
  }
  for (const [name, option] of Object.entries(options)) {
    if (option.multiple && values[name] === void 0) values[name] = [];
    else if (option.type === "boolean" && values[name] === void 0) values[name] = false;
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
var querystringBuiltin = {
  decode: querystringParse,
  encode: querystringStringify,
  escape: encodeURIComponent,
  parse: querystringParse,
  stringify: querystringStringify,
  unescape: decodeURIComponent
};
var streamConsumersBuiltin = {
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
  if (stream === void 0 || stream === null) return RuntimeBuffer.alloc(0);
  if (typeof stream === "string" || stream instanceof Uint8Array || stream instanceof ArrayBuffer || ArrayBuffer.isView(stream)) {
    return RuntimeBuffer.from(stream);
  }
  const chunks = [];
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value !== void 0) chunks.push(RuntimeBuffer.from(value));
    }
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream) chunks.push(RuntimeBuffer.from(chunk));
    return RuntimeBuffer.concat(chunks);
  }
  if (typeof stream.on === "function") {
    return new Promise((resolve2, reject) => {
      stream.on("data", (chunk) => chunks.push(RuntimeBuffer.from(chunk)));
      stream.once?.("error", reject);
      stream.once?.("end", () => resolve2(RuntimeBuffer.concat(chunks)));
      stream.once?.("close", () => resolve2(RuntimeBuffer.concat(chunks)));
    });
  }
  return RuntimeBuffer.from(String(stream));
}
var streamWebBuiltin = {
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
var perfHooksBuiltin = {
  performance: globalThis.performance ?? {
    timeOrigin: Date.now(),
    now: () => Date.now()
  },
  PerformanceObserver: globalThis.PerformanceObserver ?? class PerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
    }
    disconnect() {
    }
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
      enable() {
      },
      disable() {
      },
      reset() {
      },
      min: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      percentile: () => 0,
      percentiles: /* @__PURE__ */ new Map()
    };
  },
  createHistogram() {
    return {
      record() {
      },
      reset() {
      },
      min: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      percentile: () => 0,
      percentiles: /* @__PURE__ */ new Map()
    };
  },
  timerify(fn) {
    return function timerified(...args) {
      return fn.apply(this, args);
    };
  }
};
var _a;
(_a = perfHooksBuiltin.performance).eventLoopUtilization ?? (_a.eventLoopUtilization = () => ({ idle: 0, active: 0, utilization: 0 }));
perfHooksBuiltin.default = perfHooksBuiltin;
function performanceNow() {
  return perfHooksBuiltin.performance?.now?.() ?? Date.now();
}
var punycodeBuiltin = {
  version: "2.3.1-opencontainers",
  ucs2: {
    decode: ucs2Decode,
    encode: ucs2Encode
  },
  decode: punycodeDecode,
  encode: punycodeEncode,
  toASCII(domain) {
    return String(domain ?? "").split(".").map((label) => /^[\x00-\x7F]*$/.test(label) ? label : `xn--${punycodeEncode(label)}`).join(".");
  },
  toUnicode(domain) {
    return String(domain ?? "").split(".").map((label) => label.toLowerCase().startsWith("xn--") ? punycodeDecode(label.slice(4)) : label).join(".");
  }
};
punycodeBuiltin.default = punycodeBuiltin;
var domainBuiltin = {
  Domain: class Domain extends events_default {
    constructor() {
      super();
      this.members = [];
    }
    add(emitter) {
      if (emitter && !this.members.includes(emitter)) this.members.push(emitter);
      return emitter;
    }
    remove(emitter) {
      this.members = this.members.filter((member) => member !== emitter);
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
    enter() {
    }
    exit() {
    }
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
var clusterBuiltin = {
  isMaster: true,
  isPrimary: true,
  isWorker: false,
  workers: {},
  settings: {},
  setupMaster() {
  },
  setupPrimary() {
  },
  fork() {
    throw Object.assign(new Error("node:cluster is not supported in OpenContainers V1"), {
      code: "ERR_OPENCONTAINERS_CLUSTER_UNSUPPORTED"
    });
  }
};
clusterBuiltin.default = clusterBuiltin;
var dgramBuiltin = {
  createSocket() {
    throw Object.assign(new Error("node:dgram UDP sockets are not supported in OpenContainers V1"), {
      code: "ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED"
    });
  },
  Socket: class Socket extends events_default {
  }
};
dgramBuiltin.default = dgramBuiltin;
var PUNYCODE_BASE = 36;
var PUNYCODE_TMIN = 1;
var PUNYCODE_TMAX = 26;
var PUNYCODE_SKEW = 38;
var PUNYCODE_DAMP = 700;
var PUNYCODE_INITIAL_BIAS = 72;
var PUNYCODE_INITIAL_N = 128;
var PUNYCODE_DELIMITER = "-";
function ucs2Decode(string) {
  const output = [];
  const input = String(string ?? "");
  for (let index = 0; index < input.length; index += 1) {
    const value = input.charCodeAt(index);
    if (value >= 55296 && value <= 56319 && index + 1 < input.length) {
      const extra = input.charCodeAt(index + 1);
      if ((extra & 64512) === 56320) {
        output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
        index += 1;
        continue;
      }
    }
    output.push(value);
  }
  return output;
}
function ucs2Encode(codePoints) {
  return [...codePoints ?? []].map((value) => {
    const codePoint = Number(value);
    if (codePoint <= 65535) return String.fromCharCode(codePoint);
    const adjusted = codePoint - 65536;
    return String.fromCharCode((adjusted >>> 10) + 55296, (adjusted & 1023) + 56320);
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
    if (codePoint < 128) output.push(String.fromCharCode(codePoint));
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
          output.push(punycodeDigitToBasic(t + (q - t) % (PUNYCODE_BASE - t)));
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
  while (delta > (PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX >> 1) {
    delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta / (delta + PUNYCODE_SKEW));
}
function punycodeBasicToDigit(codePoint) {
  if (codePoint >= 48 && codePoint <= 57) return codePoint - 22;
  if (codePoint >= 65 && codePoint <= 90) return codePoint - 65;
  if (codePoint >= 97 && codePoint <= 122) return codePoint - 97;
  return PUNYCODE_BASE;
}
function punycodeDigitToBasic(digit) {
  return String.fromCharCode(digit + 22 + 75 * (digit < 26));
}
var osBuiltin = {
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
  setPriority: () => {
  },
  tmpdir: () => "/tmp",
  totalmem: () => 256 * 1024 * 1024,
  type: () => "OpenContainers",
  uptime: () => Math.floor(globalThis.performance?.now?.() ? globalThis.performance.now() / 1e3 : 0),
  userInfo: () => ({
    uid: 1e3,
    gid: 1e3,
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
var urlBuiltin = {
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
    query: parseQueryString ? querystringParse(search?.slice(1) ?? "") : search ? search.slice(1) : null,
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
    query: parseQueryString ? querystringParse(search?.slice(1) ?? "") : search ? search.slice(1) : null,
    pathname: pathname || null,
    path: `${pathname}${search ?? ""}` || null,
    href: source
  };
}
function resolveUrl(from3, to) {
  try {
    return new URL(String(to), String(from3)).href;
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
    port: url.port || void 0,
    auth: url.username || url.password ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : void 0,
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
var constantsBuiltin = {
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
  O_CREAT: 64,
  O_EXCL: 128,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_DIRECTORY: 65536,
  O_NOFOLLOW: 131072,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFCHR: 8192,
  S_IFBLK: 24576,
  S_IFIFO: 4096,
  S_IFLNK: 40960,
  S_IFSOCK: 49152,
  S_IRWXU: 448,
  S_IRUSR: 256,
  S_IWUSR: 128,
  S_IXUSR: 64,
  S_IRWXG: 56,
  S_IRGRP: 32,
  S_IWGRP: 16,
  S_IXGRP: 8,
  S_IRWXO: 7,
  S_IROTH: 4,
  S_IWOTH: 2,
  S_IXOTH: 1
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
  return Object.entries(object ?? {}).flatMap(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => `${encodeURIComponent(key)}${equals}${encodeURIComponent(item ?? "")}`);
  }).join(separator);
}
function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch (_) {
    return String(value);
  }
}
var TLSSocket = class {
};
var AssertionError = class extends Error {
  constructor({ message, actual, expected, operator } = {}) {
    super(message ?? `Expected ${actual} ${operator ?? "to equal"} ${expected}`);
    this.name = "AssertionError";
    this.code = "ERR_ASSERTION";
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
  }
};
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
      throw new AssertionError({ message: normalized.message, actual: error, expected: void 0, operator: "doesNotThrow" });
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
      throw new AssertionError({ message: normalized.message, actual: error, expected: void 0, operator: "doesNotReject" });
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
  if (value !== null && value !== void 0) {
    throw new AssertionError({
      message: value?.message ?? String(value),
      actual: value,
      expected: null,
      operator: "ifError"
    });
  }
};
assert.strict = assert;
var assertBuiltin = assert;
function normalizeExpectedAssertion(expected, message) {
  if (typeof expected === "string" && message === void 0) {
    return { expected: void 0, message: expected };
  }
  return { expected, message };
}
function expectedErrorMatches(error, expected) {
  if (expected === void 0) return true;
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
var diagnosticsChannels = /* @__PURE__ */ new Map();
var diagnosticsChannelBuiltin = {
  channel(name) {
    const key = String(name);
    if (!diagnosticsChannels.has(key)) {
      const subscribers = /* @__PURE__ */ new Set();
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
var http2Builtin = {
  constants: {
    HTTP2_HEADER_LOCATION: "location",
    HTTP2_HEADER_CONTENT_TYPE: "content-type",
    HTTP2_HEADER_USER_AGENT: "user-agent",
    HTTP_STATUS_REQUEST_TIMEOUT: 408,
    HTTP_STATUS_TOO_MANY_REQUESTS: 429,
    HTTP_STATUS_INTERNAL_SERVER_ERROR: 500
  }
};
var v8Builtin = {
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
var tlsBuiltin = {
  TLSSocket,
  connect() {
    throw Object.assign(new Error("node:tls client sockets are not supported in OpenContainers V1"), {
      code: "ERR_OPENCONTAINERS_TLS_UNSUPPORTED"
    });
  },
  createSecureContext: () => ({}),
  rootCertificates: []
};
var inspectorBuiltin = {
  console: {},
  url: () => void 0,
  open() {
    throw unsupportedCoreOperation("inspector", "open");
  },
  close() {
  },
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
    disconnect() {
    }
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
var replBuiltin = {
  REPLServer: class REPLServer {
  },
  start() {
    throw unsupportedCoreOperation("repl", "start");
  },
  recoverable(error) {
    return Boolean(error && /Unexpected end of input|missing/i.test(String(error.message ?? error)));
  }
};
var traceEventsBuiltin = {
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
var wasiBuiltin = {
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
    if (isHostPageOrigin2(url)) {
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
  const body = method === "GET" || method === "HEAD" ? void 0 : init.body ?? input?.body;
  return {
    url,
    method,
    headers,
    body: body === void 0 ? void 0 : bodyToUint8Array(body)
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
function isHostPageOrigin2(url) {
  const origin = globalThis.location?.origin;
  if (!origin || origin === "null") return false;
  try {
    return url.origin === new URL(origin).origin;
  } catch (_) {
    return false;
  }
}

// packages/runtime-node/src/NodeRuntime.js
var NodeRuntime = class {
  constructor({ kernel, descriptor }) {
    this.kernel = kernel;
    this.descriptor = descriptor;
    this.console = this.createConsole();
    this.loader = new ModuleLoader({ kernel, descriptor, console: this.console });
  }
  createConsole() {
    const write2 = (stream, args) => {
      stream.write(`${args.map(formatConsoleValue).join(" ")}
`);
    };
    return {
      log: (...args) => write2(this.descriptor.stdout, args),
      info: (...args) => write2(this.descriptor.stdout, args),
      warn: (...args) => write2(this.descriptor.stderr, args),
      error: (...args) => write2(this.descriptor.stderr, args)
    };
  }
  async execute(args) {
    try {
      if (args[0] === "-e") {
        const source = args[1] ?? "";
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }
      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
      await this.loader.import(filename, `${dirname(filename)}/[entry].js`);
      return this.loader.process.exitCode ?? 0;
    } catch (error) {
      if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") return error.exitCode;
      this.descriptor.stderr.write(`${error.stack ?? error.message ?? error}
`);
      return 1;
    }
  }
  executeSync(args) {
    try {
      if (args[0] === "-e") {
        const source = args[1] ?? "";
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }
      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
      this.loader.require(filename, `${dirname(filename)}/[entry].js`);
      return 0;
    } catch (error) {
      if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") return error.exitCode;
      this.descriptor.stderr.write(`${error.stack ?? error.message ?? error}
`);
      return 1;
    }
  }
  executeSource(source, filename) {
    const module = { id: filename, filename, exports: {} };
    const require2 = this.loader.createRequire(filename);
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
      `with (__opencontainersGlobals) {
${source}
}
//# sourceURL=opencontainers://${filename}`
    );
    wrapped(
      module.exports,
      require2,
      module,
      filename,
      dirname(filename),
      this.loader.process,
      this.console,
      this.loader.timers.setTimeout,
      this.loader.timers.clearTimeout,
      this.loader.timers.setInterval,
      this.loader.timers.clearInterval,
      this.loader.timers.setImmediate,
      this.loader.timers.clearImmediate,
      this.loader.runtimeGlobals,
      this.loader.fetch,
      (specifier) => this.loader.dynamicImport(specifier, filename)
    );
    return module.exports;
  }
};
function formatConsoleValue(value) {
  if (typeof value === "string") return value;
  if (value === void 0) return "undefined";
  if (typeof value === "function") return `[Function${value.name ? `: ${value.name}` : ""}]`;
  if (typeof value === "symbol") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    const json = JSON.stringify(value);
    return json === void 0 ? String(value) : json;
  } catch (_) {
    return String(value);
  }
}

// packages/kernel/src/OutputStream.js
var OutputStream = class extends EventEmitter {
  constructor() {
    super();
    this.chunks = [];
  }
  write(chunk = "", encoding, callback) {
    const cb = typeof encoding === "function" ? encoding : callback;
    const bytes = typeof chunk === "string" ? RuntimeBuffer.from(chunk) : RuntimeBuffer.from(chunk);
    this.chunks.push(bytes);
    this.emit("data", bytes);
    cb?.();
    return true;
  }
  clearLine(_direction = 0, callback) {
    callback?.();
    return true;
  }
  clearScreenDown(callback) {
    callback?.();
    return true;
  }
  cursorTo(_x, y, callback) {
    if (typeof y === "function") y();
    else callback?.();
    return true;
  }
  moveCursor(_dx, _dy, callback) {
    callback?.();
    return true;
  }
  getColorDepth() {
    return 24;
  }
  hasColors() {
    return true;
  }
  toString(encoding = "utf8") {
    return RuntimeBuffer.concat(this.chunks).toString(encoding);
  }
  toBuffer() {
    return RuntimeBuffer.concat(this.chunks);
  }
  clear() {
    this.chunks.length = 0;
  }
};

// packages/runtime-node/src/process-worker-host.js
var ProcessWorkerHost = class extends EventEmitter {
  constructor({ kernel, postMessage = () => {
  } } = {}) {
    super();
    this.kernel = kernel;
    this.postMessage = postMessage;
    this.descriptor = null;
    this.runtime = null;
    this.running = null;
  }
  async handleMessage(message) {
    if (!message || typeof message !== "object") return;
    try {
      switch (message.type) {
        case "boot":
          this.boot(message.descriptor);
          this.reply(message.id, { ok: true, pid: this.descriptor.pid });
          break;
        case "run":
          await this.run(message.id, message.args ?? this.descriptor.argv.slice(1));
          break;
        case "signal":
          this.signal(message.signal ?? "SIGTERM");
          this.reply(message.id, { ok: true });
          break;
        default:
          throw new Error(`Unknown process worker message: ${message.type}`);
      }
    } catch (error) {
      this.reply(message.id, { ok: false, error: serializeError(error) });
    }
  }
  boot(descriptor) {
    if (!this.kernel) {
      throw Object.assign(new Error("ProcessWorkerHost requires a kernel binding before boot"), {
        code: "ERR_OPENCONTAINERS_PROCESS_WORKER_KERNEL_MISSING"
      });
    }
    this.descriptor = {
      ...descriptor,
      env: { ...descriptor.env ?? {} },
      stdout: this.stream("stdout"),
      stderr: this.stream("stderr"),
      stdin: this.stream("stdin"),
      status: "starting"
    };
    this.runtime = new NodeRuntime({ kernel: this.kernel, descriptor: this.descriptor });
  }
  async run(id, args) {
    if (!this.runtime) throw new Error("Process worker has not booted");
    this.descriptor.status = "running";
    this.running = this.runtime.execute(args);
    let status = await this.running;
    if ((status ?? 0) === 0 && this.shouldStayAlive()) {
      status = await new Promise((resolve2) => {
        this.descriptor.onIdle = () => {
          if (!this.shouldStayAlive()) {
            this.descriptor.onIdle = null;
            resolve2(this.descriptor.exitCode ?? status ?? 0);
          }
        };
      });
    }
    status = this.descriptor.exitCode ?? status ?? 0;
    this.descriptor.status = "exited";
    this.runCleanupTasks();
    this.postMessage({ type: "exit", requestId: id, pid: this.descriptor.pid, status });
    this.reply(id, { ok: true, status });
  }
  shouldStayAlive() {
    return Boolean(
      this.kernel?.portManager?.hasPid?.(this.descriptor.pid) || this.kernel?.net?.hasPid?.(this.descriptor.pid) || this.descriptor.refCount > 0
    );
  }
  signal(signal) {
    if (!this.descriptor) return;
    this.descriptor.status = "killed";
    this.runCleanupTasks();
    this.postMessage({ type: "signal", pid: this.descriptor.pid, signal });
  }
  runCleanupTasks() {
    const cleanupTasks = [...this.descriptor?.cleanupTasks ?? []];
    this.descriptor?.cleanupTasks?.clear();
    for (const cleanup of cleanupTasks) {
      try {
        cleanup();
      } catch (_) {
      }
    }
  }
  stream(name) {
    return {
      write: (chunk) => {
        this.postMessage({
          type: "stream",
          pid: this.descriptor?.pid,
          stream: name,
          chunk: typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
        });
      }
    };
  }
  reply(requestId, payload) {
    this.postMessage({
      type: "reply",
      requestId,
      payload
    });
  }
};
function serializeError(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack
  };
}

// packages/kernel/src/ProcessWorkerBackend.js
var ProcessWorkerBackend = class {
  constructor({ kernel, workerFactory = createLocalProcessWorkerTransport } = {}) {
    this.kernel = kernel;
    this.workerFactory = workerFactory;
    this.nextRequestId = 1;
  }
  async run(process, args) {
    const transport = this.workerFactory({ kernel: this.kernel, process });
    const pending = /* @__PURE__ */ new Map();
    let exitStatus = null;
    transport.onMessage((message) => {
      if (message.type === "stream") {
        const target = message.stream === "stderr" ? process.stderr : process.stdout;
        target.write(message.chunk ?? "");
        return;
      }
      if (message.type === "exit") {
        exitStatus = message.status ?? 0;
        return;
      }
      if (message.type !== "reply") return;
      const resolver = pending.get(message.requestId);
      if (!resolver) return;
      pending.delete(message.requestId);
      if (message.payload?.ok === false) resolver.reject(deserializeError(message.payload.error));
      else resolver.resolve(message.payload);
    });
    const request = (type, payload = {}) => {
      const id = `process-worker-${this.nextRequestId++}`;
      return new Promise((resolve2, reject) => {
        pending.set(id, { resolve: resolve2, reject });
        transport.postMessage({ id, type, ...payload });
      });
    };
    try {
      await request("boot", { descriptor: serializeDescriptor(process.descriptor) });
      const result = await request("run", { args });
      return exitStatus ?? result.status ?? 0;
    } finally {
      transport.terminate?.();
    }
  }
};
function createLocalProcessWorkerTransport({ kernel }) {
  let listener = () => {
  };
  const host = new ProcessWorkerHost({
    kernel,
    postMessage: (message) => queueMicrotask(() => listener(message))
  });
  return {
    onMessage(callback) {
      listener = callback;
    },
    postMessage(message) {
      queueMicrotask(() => host.handleMessage(message));
    },
    terminate() {
    }
  };
}
function serializeDescriptor(descriptor) {
  return {
    pid: descriptor.pid,
    ppid: descriptor.ppid,
    cwd: descriptor.cwd,
    argv: descriptor.argv,
    env: descriptor.env,
    projectId: descriptor.projectId
  };
}
function deserializeError(error) {
  return Object.assign(new Error(error?.message ?? "Process worker request failed"), error ?? {});
}

// packages/kernel/src/VirtualProcess.js
var _resolveCompleted;
var VirtualProcess = class extends EventEmitter {
  constructor(descriptor) {
    super();
    __privateAdd(this, _resolveCompleted);
    this.pid = descriptor.pid;
    this.descriptor = descriptor;
    this.stdin = descriptor.stdin ?? new OutputStream();
    descriptor.stdin = this.stdin;
    this.stdout = descriptor.stdout;
    this.stderr = descriptor.stderr;
    this.exitCode = null;
    this.signalCode = null;
    this.completed = new Promise((resolve2) => {
      __privateSet(this, _resolveCompleted, resolve2);
    });
  }
  finish(code = 0, signal = null) {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.descriptor.status = "exited";
    const cleanupTasks = [...this.descriptor.cleanupTasks ?? []];
    this.descriptor.cleanupTasks?.clear();
    for (const cleanup of cleanupTasks) {
      try {
        cleanup();
      } catch (_) {
      }
    }
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
    __privateGet(this, _resolveCompleted).call(this, { pid: this.pid, status: code, signal, stdout: this.stdout.toBuffer(), stderr: this.stderr.toBuffer() });
  }
  fail(error) {
    this.stderr.write(`${error.stack ?? error.message ?? error}
`);
    if (this.listenerCount("error") > 0) this.emit("error", error);
    this.finish(1);
  }
  kill(signal = "SIGTERM") {
    this.descriptor.status = "killed";
    this.finish(signal === "SIGKILL" ? 137 : 143, signal);
  }
};
_resolveCompleted = new WeakMap();

// packages/kernel/src/ProcessManager.js
function normalizeEnv(env = {}) {
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== void 0 && value !== null).map(([key, value]) => [key, String(value)])
  );
}
function defaultEnv({ cwd, projectId }) {
  const pathEntries = [.../* @__PURE__ */ new Set([
    `${cwd}/node_modules/.bin`,
    "/workspace/node_modules/.bin",
    "/bin",
    "/usr/bin"
  ])];
  return {
    HOME: "/home/opencontainers",
    PATH: pathEntries.join(":"),
    PWD: cwd,
    SHELL: "/bin/sh",
    TERM: "xterm-256color",
    OPENCONTAINERS_PROJECT_ID: projectId
  };
}
var _ProcessManager_instances, run_fn, runSync_fn, commandCandidates_fn, resolveExecutable_fn, realpath_fn;
var ProcessManager = class {
  constructor({ kernel, processWorkerBackend, processWorkerFactory }) {
    __privateAdd(this, _ProcessManager_instances);
    this.kernel = kernel;
    this.nextPid = 100;
    this.processes = /* @__PURE__ */ new Map();
    this.processWorkerBackend = processWorkerBackend ?? (processWorkerFactory ? new ProcessWorkerBackend({ kernel, workerFactory: processWorkerFactory }) : null);
  }
  spawn(command, args = [], options = {}) {
    const descriptor = this.createDescriptor(command, args, options);
    const process = new VirtualProcess(descriptor);
    this.processes.set(process.pid, process);
    queueMicrotask(() => __privateMethod(this, _ProcessManager_instances, run_fn).call(this, process, command, args));
    return process;
  }
  spawnSync(command, args = [], options = {}) {
    const descriptor = this.createDescriptor(command, args, options);
    const process = new VirtualProcess(descriptor);
    this.processes.set(process.pid, process);
    try {
      const status = __privateMethod(this, _ProcessManager_instances, runSync_fn).call(this, process, command, args);
      process.finish(status ?? 0);
    } catch (error) {
      process.fail(error);
    }
    return {
      pid: process.pid,
      status: process.exitCode,
      signal: process.signalCode,
      stdout: process.stdout.toBuffer(),
      stderr: process.stderr.toBuffer()
    };
  }
  createDescriptor(command, args = [], options = {}) {
    var _a2;
    const cwd = options.cwd ?? "/workspace";
    const projectId = options.projectId ?? "default";
    const descriptor = {
      pid: this.nextPid++,
      ppid: options.parentPid,
      cwd,
      argv: [command, ...args],
      env: {
        ...defaultEnv({ cwd, projectId }),
        ...normalizeEnv(options.env)
      },
      status: "starting",
      stdin: new OutputStream(),
      stdout: new OutputStream(),
      stderr: new OutputStream(),
      projectId,
      terminal: options.terminal,
      externalNetworkAllowlist: [...options.externalNetworkAllowlist ?? []].map((host) => String(host).toLowerCase())
    };
    (_a2 = descriptor.env).OPENCONTAINERS_PROJECT_ID ?? (_a2.OPENCONTAINERS_PROJECT_ID = descriptor.projectId);
    return descriptor;
  }
  resolveCommand(command, cwd, env = {}) {
    if (command === "node") return { type: "node" };
    if (command === "npm" || command === "npx") return { type: "npm", command };
    if (command === "sh") return { type: "shell" };
    for (const candidate of __privateMethod(this, _ProcessManager_instances, commandCandidates_fn).call(this, command, cwd, env)) {
      const resolved = __privateMethod(this, _ProcessManager_instances, resolveExecutable_fn).call(this, candidate);
      if (resolved) return resolved;
    }
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) return { type: "builtin", definition: builtin };
    return { type: "unknown" };
  }
  kill(pid, signal) {
    const process = this.processes.get(pid);
    if (!process) return false;
    process.kill(signal);
    this.kernel.unregisterPortsForPid(pid);
    return true;
  }
  killTree(pid, signal) {
    const killed = /* @__PURE__ */ new Set();
    const killOne = (targetPid) => {
      if (killed.has(targetPid)) return;
      killed.add(targetPid);
      for (const process of this.processes.values()) {
        if (process.descriptor.ppid === targetPid) killOne(process.pid);
      }
      this.kill(targetPid, signal);
    };
    killOne(pid);
    return killed.size > 0;
  }
};
_ProcessManager_instances = new WeakSet();
run_fn = async function(process, command, args) {
  process.descriptor.status = "running";
  try {
    const resolved = this.resolveCommand(command, process.descriptor.cwd, process.descriptor.env);
    let status;
    if (resolved.type === "node" && this.processWorkerBackend && !process.descriptor.env.OPENCONTAINERS_DISABLE_PROCESS_WORKERS) {
      status = await this.processWorkerBackend.run(process, args);
    } else if (resolved.type === "node") {
      status = await new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).execute(args);
    } else if (resolved.type === "node-bin" && this.processWorkerBackend && !process.descriptor.env.OPENCONTAINERS_DISABLE_PROCESS_WORKERS) {
      status = await this.processWorkerBackend.run(process, [resolved.target, ...args]);
    } else if (resolved.type === "node-bin") {
      status = await new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).execute([resolved.target, ...args]);
    } else if (resolved.type === "npm") {
      status = await this.kernel.npmCommand.run(args, process.descriptor, { command });
    } else if (resolved.type === "shell") {
      const commandLine = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
      status = await this.kernel.shell.run(commandLine, {
        cwd: process.descriptor.cwd,
        env: process.descriptor.env,
        stdout: process.descriptor.stdout,
        stderr: process.descriptor.stderr,
        projectId: process.descriptor.projectId,
        parentPid: process.pid
      });
    } else if (resolved.type === "builtin") {
      const result = await runCommandBuiltin(resolved.definition, args, {
        kernel: this.kernel,
        descriptor: process.descriptor
      });
      status = result.status;
      if (result.cwd) {
        process.descriptor.cwd = result.cwd;
        process.descriptor.env.PWD = result.cwd;
      }
    } else {
      throw Object.assign(new Error(`Unsupported command: ${command}`), { code: "ENOENT" });
    }
    const finalStatus = () => process.descriptor.exitCode ?? status ?? 0;
    if ((status ?? 0) === 0 && (this.kernel.portManager.hasPid(process.pid) || this.kernel.net.hasPid(process.pid) || process.descriptor.refCount > 0)) {
      process.descriptor.status = "running";
      process.descriptor.onIdle = () => {
        if (!this.kernel.portManager.hasPid(process.pid) && !this.kernel.net.hasPid(process.pid) && process.descriptor.refCount === 0) {
          process.descriptor.onIdle = null;
          process.finish(finalStatus());
          this.kernel.unregisterPortsForPid(process.pid);
        }
      };
      return;
    }
    process.finish(finalStatus());
  } catch (error) {
    process.fail(error);
  } finally {
    if (process.exitCode !== null) this.kernel.unregisterPortsForPid(process.pid);
  }
};
runSync_fn = function(process, command, args) {
  process.descriptor.status = "running";
  const resolved = this.resolveCommand(command, process.descriptor.cwd, process.descriptor.env);
  if (resolved.type === "node") {
    return new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).executeSync(args);
  }
  if (resolved.type === "node-bin") {
    return new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).executeSync([resolved.target, ...args]);
  }
  if (resolved.type === "shell") {
    const commandLine = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
    return this.kernel.shell.runSync(commandLine, {
      cwd: process.descriptor.cwd,
      env: process.descriptor.env,
      stdout: process.descriptor.stdout,
      stderr: process.descriptor.stderr,
      projectId: process.descriptor.projectId,
      parentPid: process.pid
    });
  }
  if (resolved.type === "builtin") {
    const result = runCommandBuiltinSync(resolved.definition, args, {
      kernel: this.kernel,
      descriptor: process.descriptor
    });
    if (result.cwd) {
      process.descriptor.cwd = result.cwd;
      process.descriptor.env.PWD = result.cwd;
    }
    return result.status;
  }
  throw Object.assign(new Error(`Unsupported sync command: ${command}`), { code: "ENOENT" });
};
commandCandidates_fn = function(command, cwd, env) {
  const candidates = [];
  const add = (path) => {
    if (!path || candidates.includes(path)) return;
    candidates.push(path);
  };
  if (String(command).includes("/")) {
    add(resolvePath(cwd, command));
    return candidates;
  }
  for (const pathEntry of String(env.PATH || "").split(":")) {
    if (pathEntry) add(resolvePath(cwd, `${pathEntry}/${command}`));
  }
  add(resolvePath(cwd, `node_modules/.bin/${command}`));
  add(`/workspace/node_modules/.bin/${command}`);
  return candidates;
};
resolveExecutable_fn = function(path) {
  if (!this.kernel.fs.existsSync(path)) return null;
  let source = "";
  try {
    source = this.kernel.fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const trimmed = source.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const shim = JSON.parse(source);
      if (shim.type === "node-bin" && shim.target) return shim;
    } catch {
    }
  }
  const target = __privateMethod(this, _ProcessManager_instances, realpath_fn).call(this, path);
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.startsWith("#!") && /\bnode(?:\s|$)/.test(firstLine)) {
    return { type: "node-bin", target };
  }
  if (/\.(?:[cm]?js)$/i.test(target)) return { type: "node-bin", target };
  return null;
};
realpath_fn = function(path) {
  try {
    return this.kernel.fs.realpathSync(path);
  } catch {
    return path;
  }
};

// packages/kernel/src/PtyManager.js
function parsePtySimpleCommand(commandLine) {
  const commands = splitCommands(commandLine);
  if (commands.length !== 1 || commands[0].operator !== null) return null;
  const pipeline2 = parsePipeline(commands[0].command);
  if (pipeline2.segments.length !== 1) return null;
  const segment = pipeline2.segments[0];
  if (segment.redirects.length) return null;
  const tokens = [...segment.tokens];
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index++;
  const command = tokens[index];
  if (!command) return null;
  return {
    command,
    args: tokens.slice(index + 1)
  };
}
var PtySession = class extends EventEmitter {
  constructor({ id, kernel, cwd = "/workspace", env = {}, projectId = "default", cols = 80, rows = 24, interactive = false }) {
    super();
    this.id = id;
    this.kernel = kernel;
    this.cwd = cwd;
    this.env = {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      COLUMNS: String(cols),
      LINES: String(rows),
      ...env
    };
    this.projectId = projectId;
    this.inputBuffer = "";
    this.inputCursor = 0;
    this.history = [];
    this.historyIndex = null;
    this.foregroundPid = null;
    this.foregroundProcess = null;
    this.foregroundRawMode = false;
    this.closed = false;
    this.interactive = Boolean(interactive);
    this.started = false;
    this.lastCommand = Promise.resolve({ status: 0 });
  }
  start() {
    if (this.closed || this.started) return;
    this.started = true;
    if (this.interactive) this.emitPrompt();
  }
  write(data) {
    if (this.closed) return;
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    if (this.foregroundPid !== null && this.foregroundRawMode) {
      this.foregroundProcess?.stdin?.write?.(text);
      return;
    }
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "") {
        this.interrupt();
        continue;
      }
      if (char === "") {
        this.close();
        continue;
      }
      if (char === "\f") {
        this.emitData("\x1Bc");
        if (this.interactive) this.redrawInputLine();
        continue;
      }
      if (this.foregroundPid !== null) {
        this.forwardForegroundInput(char);
        continue;
      }
      if (char === "\x1B") {
        const sequence = readControlSequence(text, index);
        if (sequence) {
          this.handlePromptControlSequence(sequence.value);
          index += sequence.value.length - 1;
          continue;
        }
      }
      if (char === "\b" || char === "\x7F") {
        this.backspace();
        continue;
      }
      if (char === "	") {
        this.completeInput();
        continue;
      }
      if (char === "\r" || char === "\n") {
        const commandLine = this.inputBuffer.trim();
        this.inputBuffer = "";
        this.inputCursor = 0;
        this.historyIndex = null;
        this.emitData("\r\n");
        if (commandLine) {
          this.pushHistory(commandLine);
          this.runLine(commandLine);
        } else if (this.interactive) this.emitPrompt();
        continue;
      }
      this.insertInput(char);
    }
  }
  runLine(commandLine) {
    this.emit("commandstart", { commandLine, cwd: this.cwd });
    const localProcess = this.runLocalCommand(commandLine);
    if (localProcess) return localProcess;
    const simpleCommand = this.parseSimpleCommand(commandLine);
    const builtin = simpleCommand ? this.kernel.commandBuiltins.get(simpleCommand.command) : null;
    const process = simpleCommand ? this.kernel.spawn(simpleCommand.command, simpleCommand.args, {
      cwd: this.cwd,
      env: this.env,
      projectId: this.projectId,
      terminal: this
    }) : this.kernel.spawn("sh", ["-c", commandLine], {
      cwd: this.cwd,
      env: this.env,
      projectId: this.projectId,
      terminal: this
    });
    this.foregroundPid = process.pid;
    this.foregroundProcess = process;
    this.foregroundRawMode = Boolean(builtin?.rawTerminal);
    process.stdout.on("data", (chunk) => this.emitData(chunk));
    process.stderr.on("data", (chunk) => this.emitData(chunk));
    this.lastCommand = process.completed.then((result) => {
      if (this.foregroundPid === process.pid) this.foregroundPid = null;
      if (this.foregroundProcess === process) this.foregroundProcess = null;
      this.foregroundRawMode = false;
      if (process.descriptor.cwd && process.descriptor.cwd !== this.cwd) this.cwd = process.descriptor.cwd;
      if (result.signal) this.emitData(`\r
[${result.signal}]\r
`);
      if (this.interactive && !this.closed) this.emitPrompt();
      this.emit("commandend", { commandLine, cwd: this.cwd, result });
      return result;
    });
    return process;
  }
  parseSimpleCommand(commandLine) {
    try {
      return parsePtySimpleCommand(commandLine);
    } catch (_) {
      return null;
    }
  }
  runLocalCommand(commandLine) {
    let simpleCommand;
    try {
      simpleCommand = parsePtySimpleCommand(commandLine);
    } catch (_) {
      return null;
    }
    if (!simpleCommand) return null;
    if (simpleCommand.command === "cd") return this.changeDirectory(simpleCommand.args);
    if (simpleCommand.command === "exit") {
      this.close();
      return this.resolveLocalCommand(0);
    }
    return null;
  }
  changeDirectory(args) {
    if (args.length > 1) {
      this.emitData("cd: too many arguments\r\n");
      return this.resolveLocalCommand(1);
    }
    const target = resolveShellPath(this.cwd, args[0] ?? "/workspace");
    try {
      const stat = this.kernel.fs.statSync(target);
      if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
      this.cwd = target;
      return this.resolveLocalCommand(0);
    } catch (error) {
      this.emitData(`cd: ${error instanceof Error ? error.message : String(error)}\r
`);
      return this.resolveLocalCommand(1);
    }
  }
  resolveLocalCommand(status) {
    const result = { status, cwd: this.cwd };
    this.lastCommand = Promise.resolve(result).then((resolved) => {
      if (this.interactive && !this.closed) this.emitPrompt();
      this.emit("commandend", { cwd: this.cwd, result: resolved });
      return resolved;
    });
    return { pid: null, completed: this.lastCommand };
  }
  interrupt() {
    this.inputBuffer = "";
    this.inputCursor = 0;
    this.historyIndex = null;
    this.emitData("^C\r\n");
    if (this.foregroundPid !== null) {
      this.kernel.killTree(this.foregroundPid, "SIGINT");
      this.foregroundPid = null;
      this.foregroundProcess = null;
      this.foregroundRawMode = false;
      return;
    }
    if (this.interactive && !this.closed) this.emitPrompt();
  }
  resize({ cols, rows }) {
    if (cols) this.env.COLUMNS = String(cols);
    if (rows) this.env.LINES = String(rows);
    if (this.foregroundProcess?.descriptor?.env) {
      if (cols) this.foregroundProcess.descriptor.env.COLUMNS = String(cols);
      if (rows) this.foregroundProcess.descriptor.env.LINES = String(rows);
    }
    this.emit("resize", { cols: Number(this.env.COLUMNS), rows: Number(this.env.LINES) });
  }
  close() {
    if (this.closed) return;
    if (this.foregroundPid !== null) this.kernel.killTree(this.foregroundPid, "SIGHUP");
    this.foregroundProcess = null;
    this.foregroundRawMode = false;
    this.closed = true;
    this.emit("close");
  }
  async waitForIdle() {
    return this.lastCommand;
  }
  emitData(chunk) {
    this.emit("data", chunk);
  }
  forwardForegroundInput(char) {
    if (!this.foregroundProcess) return;
    if (char === "\r" || char === "\n") {
      this.emitData("\r\n");
      this.foregroundProcess.stdin?.write?.("\n");
      return;
    }
    if (char === "\b" || char === "\x7F") {
      this.emitData("\b \b");
      this.foregroundProcess.stdin?.write?.("\x7F");
      return;
    }
    this.emitData(char);
    this.foregroundProcess.stdin?.write?.(char);
  }
  setInputLine(value = "") {
    if (this.closed || this.foregroundPid !== null) return;
    this.inputBuffer = String(value);
    this.inputCursor = this.inputBuffer.length;
    this.emitData("\x1B[2K\r");
    this.redrawInputLine();
  }
  redrawInputLine() {
    if (this.closed) return;
    this.emitData("\x1B[2K\r");
    if (this.interactive) this.emitPrompt();
    if (this.inputBuffer) this.emitData(this.inputBuffer);
    const trailing = this.inputBuffer.length - this.inputCursor;
    if (trailing > 0) this.emitData(`\x1B[${trailing}D`);
  }
  insertInput(char) {
    if (char < " ") return;
    const chars = Array.from(this.inputBuffer);
    const insert = Array.from(char);
    chars.splice(this.inputCursor, 0, ...insert);
    this.inputBuffer = chars.join("");
    this.inputCursor += insert.length;
    this.redrawInputLine();
  }
  backspace() {
    if (!this.inputBuffer || this.inputCursor <= 0) return;
    const chars = Array.from(this.inputBuffer);
    chars.splice(this.inputCursor - 1, 1);
    this.inputBuffer = chars.join("");
    this.inputCursor--;
    this.redrawInputLine();
  }
  completeInput() {
    if (this.closed || this.foregroundPid !== null) return;
    const context = currentCompletionContext(this.inputBuffer, this.inputCursor);
    const result = context.isCommandPosition && !context.token.includes("/") ? this.completeCommand(context.token) : this.completePath(context.token);
    if (!result?.matches?.length) {
      this.emitData("\x07");
      return;
    }
    if (result.replacement !== void 0) {
      this.replaceInputRange(context.start, context.end, result.replacement);
      return;
    }
    this.emitCompletionList(result.matches);
  }
  completeCommand(prefix) {
    const matches = this.commandCompletionNames().filter((name) => name.startsWith(prefix)).sort((a, b) => a.localeCompare(b));
    return completionResult(prefix, matches, (name) => `${name} `);
  }
  commandCompletionNames() {
    const names = /* @__PURE__ */ new Set(["node", "npm", "npx", "sh"]);
    for (const name of this.kernel.commandBuiltins.keys()) names.add(name);
    const pathEntries = [
      ...String(this.env.PATH || "").split(":").filter(Boolean),
      `${this.cwd}/node_modules/.bin`,
      "/workspace/node_modules/.bin"
    ];
    for (const entry of pathEntries) {
      const directory = resolvePath(this.cwd, entry);
      let children = [];
      try {
        children = this.kernel.fs.readdirSync(directory);
      } catch {
        continue;
      }
      for (const name of children) names.add(name);
    }
    return [...names];
  }
  completePath(token) {
    const slashIndex = token.lastIndexOf("/");
    const directoryToken = slashIndex === -1 ? "." : token.slice(0, slashIndex) || "/";
    const namePrefix = slashIndex === -1 ? token : token.slice(slashIndex + 1);
    const displayPrefix = slashIndex === -1 ? "" : token.slice(0, slashIndex + 1);
    const directoryPath = resolveShellPath(this.cwd, directoryToken);
    let children = [];
    try {
      children = this.kernel.fs.readdirSync(directoryPath).filter((name) => name.startsWith(namePrefix)).filter((name) => namePrefix.startsWith(".") || !name.startsWith("."));
    } catch {
      return { matches: [] };
    }
    const matches = children.map((name) => {
      const childPath = `${directoryPath === "/" ? "" : directoryPath}/${name}`;
      let isDirectory = false;
      try {
        isDirectory = this.kernel.fs.statSync(childPath).isDirectory();
      } catch {
        isDirectory = false;
      }
      return {
        name,
        display: `${displayPrefix}${name}${isDirectory ? "/" : ""}`,
        replacement: `${displayPrefix}${name}${isDirectory ? "/" : " "}`
      };
    }).sort((a, b) => a.display.localeCompare(b.display));
    return completionResult(namePrefix, matches, (match) => match.replacement, (match) => match.display);
  }
  replaceInputRange(start, end2, replacement) {
    const chars = Array.from(this.inputBuffer);
    const insert = Array.from(replacement);
    chars.splice(start, end2 - start, ...insert);
    this.inputBuffer = chars.join("");
    this.inputCursor = start + insert.length;
    this.redrawInputLine();
  }
  emitCompletionList(matches) {
    this.emitData("\r\n");
    this.emitData(`${matches.join("  ")}\r
`);
    this.redrawInputLine();
  }
  deleteForward() {
    const chars = Array.from(this.inputBuffer);
    if (this.inputCursor >= chars.length) return;
    chars.splice(this.inputCursor, 1);
    this.inputBuffer = chars.join("");
    this.redrawInputLine();
  }
  moveInputCursor(delta) {
    const next = Math.max(0, Math.min(Array.from(this.inputBuffer).length, this.inputCursor + delta));
    if (next === this.inputCursor) return;
    this.inputCursor = next;
    this.emitData(delta < 0 ? "\x1B[D" : "\x1B[C");
  }
  handlePromptControlSequence(sequence) {
    if (sequence === "\x1B[A") {
      this.showHistory(-1);
      return;
    }
    if (sequence === "\x1B[B") {
      this.showHistory(1);
      return;
    }
    if (sequence === "\x1B[D") {
      this.moveInputCursor(-1);
      return;
    }
    if (sequence === "\x1B[C") {
      this.moveInputCursor(1);
      return;
    }
    if (sequence === "\x1B[H" || sequence === "\x1B[1~") {
      this.inputCursor = 0;
      this.redrawInputLine();
      return;
    }
    if (sequence === "\x1B[F" || sequence === "\x1B[4~") {
      this.inputCursor = Array.from(this.inputBuffer).length;
      this.redrawInputLine();
      return;
    }
    if (sequence === "\x1B[3~") {
      this.deleteForward();
    }
  }
  pushHistory(commandLine) {
    if (this.history.at(-1) !== commandLine) this.history.push(commandLine);
    if (this.history.length > 200) this.history.shift();
  }
  showHistory(direction) {
    if (!this.history.length) return;
    if (this.historyIndex === null) {
      this.historyIndex = direction < 0 ? this.history.length - 1 : null;
    } else {
      this.historyIndex += direction;
      if (this.historyIndex < 0) this.historyIndex = 0;
      if (this.historyIndex >= this.history.length) this.historyIndex = null;
    }
    this.setInputLine(this.historyIndex === null ? "" : this.history[this.historyIndex]);
  }
  emitPrompt() {
    this.emitData(`\x1B[36m${formatPtyCwd(this.cwd)}\x1B[0m \x1B[32m$\x1B[0m `);
  }
};
function readControlSequence(text, start) {
  if (text[start] !== "\x1B") return null;
  if (text[start + 1] !== "[") return { value: "\x1B" };
  let index = start + 2;
  while (index < text.length && /[0-9;?]/.test(text[index])) index++;
  if (index < text.length && /[A-Za-z~]/.test(text[index])) {
    return { value: text.slice(start, index + 1) };
  }
  return { value: "\x1B" };
}
function currentCompletionContext(inputBuffer, inputCursor) {
  const inputChars = Array.from(inputBuffer);
  const before = inputChars.slice(0, inputCursor).join("");
  const tokenStart = currentTokenStart(before);
  const token = before.slice(tokenStart);
  const segmentPrefix = currentCommandSegmentPrefix(before.slice(0, tokenStart));
  const priorTokens = safeTokenize(segmentPrefix);
  const isCommandPosition = priorTokens.every((part) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(part));
  return {
    token,
    start: Array.from(before.slice(0, tokenStart)).length,
    end: inputCursor,
    isCommandPosition
  };
}
function currentTokenStart(value) {
  let quote = null;
  let escaped = false;
  let start = 0;
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) start = index + 1;
  }
  return Array.from(chars.slice(0, start).join("")).length;
}
function currentCommandSegmentPrefix(value) {
  let quote = null;
  let escaped = false;
  let start = 0;
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ";" || char === "|") start = index + 1;
    if (char === "&" && chars[index + 1] === "&") {
      start = index + 2;
      index++;
    }
  }
  return chars.slice(start).join("").trim();
}
function safeTokenize(value) {
  try {
    return tokenize(value);
  } catch {
    return [];
  }
}
function completionResult(prefix, matches, replacementFor, displayFor = (value) => value) {
  if (!matches.length) return { matches: [] };
  if (matches.length === 1) {
    return {
      matches: [displayFor(matches[0])],
      replacement: replacementFor(matches[0])
    };
  }
  const names = matches.map((match) => typeof match === "string" ? match : match.name);
  const shared = commonPrefix(names);
  if (shared.length > prefix.length) {
    const first = matches[0];
    const replacementPrefix = typeof first === "string" ? "" : String(first.replacement).slice(0, String(first.replacement).lastIndexOf(first.name));
    return {
      matches: matches.map(displayFor),
      replacement: `${replacementPrefix}${shared}`
    };
  }
  return {
    matches: matches.map(displayFor)
  };
}
function commonPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}
var PtyManager = class {
  constructor({ kernel }) {
    this.kernel = kernel;
    this.nextId = 1;
    this.sessions = /* @__PURE__ */ new Map();
  }
  createSession(options = {}) {
    const session = new PtySession({
      id: `pty-${this.nextId++}`,
      kernel: this.kernel,
      ...options
    });
    this.sessions.set(session.id, session);
    session.on("close", () => this.sessions.delete(session.id));
    return session;
  }
  write(sessionId, data) {
    const session = this.requireSession(sessionId);
    session.write(data);
  }
  resize(sessionId, size) {
    this.requireSession(sessionId).resize(size);
  }
  close(sessionId) {
    this.requireSession(sessionId).close();
  }
  requireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown PTY session: ${sessionId}`);
    return session;
  }
};
function formatPtyCwd(cwd) {
  const value = String(cwd || "/workspace").replace(/\/+$/, "") || "/";
  if (value === "/workspace") return "~";
  if (value.startsWith("/workspace/")) return `~/${value.slice("/workspace/".length)}`;
  return value;
}

// packages/kernel/src/SyscallRouter.js
var SyscallRouter = class {
  constructor({ kernel }) {
    this.kernel = kernel;
  }
  async handle(request, descriptor = { cwd: "/workspace", env: {}, projectId: "default" }) {
    switch (request.op) {
      case "fs.readFileSync":
        return this.kernel.fs.readFileSync(resolvePath(descriptor.cwd, request.path), request.encoding);
      case "fs.writeFileSync":
        this.kernel.fs.writeFileSync(resolvePath(descriptor.cwd, request.path), request.data ?? "", request.options);
        return null;
      case "fs.statSync": {
        const stat = this.kernel.fs.statSync(resolvePath(descriptor.cwd, request.path));
        return {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory()
        };
      }
      case "process.spawn": {
        const child = this.kernel.spawn(request.command, request.args ?? [], {
          cwd: request.options?.cwd ?? descriptor.cwd,
          env: { ...descriptor.env, ...request.options?.env ?? {} },
          projectId: descriptor.projectId,
          parentPid: descriptor.pid
        });
        return { pid: child.pid };
      }
      case "http.dispatch":
        return this.kernel.dispatchHttpRequest(request.request);
      default:
        throw Object.assign(new Error(`Unsupported syscall: ${request.op}`), {
          code: "ERR_OPENCONTAINERS_UNKNOWN_SYSCALL"
        });
    }
  }
  async serveOnce(mailbox, descriptor) {
    const request = mailbox.waitForRequest();
    if (!request) return false;
    try {
      mailbox.respond(await this.handle(request, descriptor));
    } catch (error) {
      mailbox.respondError(error);
    }
    return true;
  }
};

// packages/kernel/src/WebSocketManager.js
var _VirtualWebSocketEndpoint_instances, emitDom_fn;
var _VirtualWebSocketEndpoint = class _VirtualWebSocketEndpoint extends EventEmitter {
  constructor({ protocol = "" } = {}) {
    super();
    __privateAdd(this, _VirtualWebSocketEndpoint_instances);
    this.protocol = protocol;
    this.readyState = _VirtualWebSocketEndpoint.CONNECTING;
    this.bufferedAmount = 0;
    this.binaryType = "arraybuffer";
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }
  attach(peer) {
    this.peer = peer;
  }
  open() {
    if (this.readyState !== _VirtualWebSocketEndpoint.CONNECTING) return;
    this.readyState = _VirtualWebSocketEndpoint.OPEN;
    __privateMethod(this, _VirtualWebSocketEndpoint_instances, emitDom_fn).call(this, "open", { type: "open" });
  }
  send(data) {
    if (this.readyState !== _VirtualWebSocketEndpoint.OPEN) {
      throw Object.assign(new Error("WebSocket is not open"), { code: "ERR_OPENCONTAINERS_WS_NOT_OPEN" });
    }
    queueMicrotask(() => {
      var _a2;
      if (this.peer?.readyState === _VirtualWebSocketEndpoint.OPEN) {
        __privateMethod(_a2 = this.peer, _VirtualWebSocketEndpoint_instances, emitDom_fn).call(_a2, "message", { type: "message", data });
      }
    });
  }
  close(code = 1e3, reason = "") {
    if (this.readyState === _VirtualWebSocketEndpoint.CLOSED) return;
    this.readyState = _VirtualWebSocketEndpoint.CLOSING;
    queueMicrotask(() => {
      this.readyState = _VirtualWebSocketEndpoint.CLOSED;
      __privateMethod(this, _VirtualWebSocketEndpoint_instances, emitDom_fn).call(this, "close", { type: "close", code, reason, wasClean: true });
      if (this.peer?.readyState !== _VirtualWebSocketEndpoint.CLOSED) {
        this.peer.close(code, reason);
      }
    });
  }
  addEventListener(type, listener) {
    this.on(type, listener);
  }
  removeEventListener(type, listener) {
    this.off(type, listener);
  }
};
_VirtualWebSocketEndpoint_instances = new WeakSet();
emitDom_fn = function(type, event) {
  this.emit(type, event);
  const handler = this[`on${type}`];
  if (typeof handler === "function") handler.call(this, event);
};
__publicField(_VirtualWebSocketEndpoint, "CONNECTING", 0);
__publicField(_VirtualWebSocketEndpoint, "OPEN", 1);
__publicField(_VirtualWebSocketEndpoint, "CLOSING", 2);
__publicField(_VirtualWebSocketEndpoint, "CLOSED", 3);
var VirtualWebSocketEndpoint = _VirtualWebSocketEndpoint;
var _WebSocketManager_instances, key_fn3;
var WebSocketManager = class {
  constructor() {
    __privateAdd(this, _WebSocketManager_instances);
    this.handlers = /* @__PURE__ */ new Map();
  }
  register({ projectId = "default", port, handler }) {
    if (!port) throw new Error("WebSocket registration requires a port");
    this.handlers.set(__privateMethod(this, _WebSocketManager_instances, key_fn3).call(this, projectId, port), handler);
  }
  unregister({ projectId = "default", port }) {
    this.handlers.delete(__privateMethod(this, _WebSocketManager_instances, key_fn3).call(this, projectId, port));
  }
  unregisterProjectPid(projectId, port) {
    this.unregister({ projectId, port });
  }
  connect({ projectId = "default", port, path = "/", protocols = [] } = {}) {
    const handler = this.handlers.get(__privateMethod(this, _WebSocketManager_instances, key_fn3).call(this, projectId, port));
    if (!handler) {
      throw Object.assign(new Error(`No virtual WebSocket server is listening on ${projectId}:${port}`), {
        code: "ERR_OPENCONTAINERS_WS_SERVER_MISSING"
      });
    }
    const protocol = Array.isArray(protocols) ? protocols[0] ?? "" : protocols ?? "";
    const client = new VirtualWebSocketEndpoint({ protocol });
    const server = new VirtualWebSocketEndpoint({ protocol });
    client.attach(server);
    server.attach(client);
    handler(server, { projectId, port, path, protocols });
    queueMicrotask(() => {
      client.open();
      server.open();
    });
    return client;
  }
};
_WebSocketManager_instances = new WeakSet();
key_fn3 = function(projectId, port) {
  return `${projectId}:${port}`;
};

// packages/kernel/src/Kernel.js
var Kernel = class {
  constructor({
    fs = new VirtualFileSystem(),
    registryClient,
    allowExternalNetwork = false,
    allowInstallScripts = false,
    allowChildProcesses = true,
    allowPersistentStorage = true,
    allowPopups = false,
    processWorkerFactory,
    processWorkerBackend
  } = {}) {
    this.fs = fs;
    this.allowExternalNetwork = allowExternalNetwork;
    this.allowInstallScripts = allowInstallScripts;
    this.allowChildProcesses = allowChildProcesses;
    this.allowPersistentStorage = allowPersistentStorage;
    this.allowPopups = allowPopups;
    this.commandBuiltins = /* @__PURE__ */ new Map();
    this.portManager = new PortManager();
    this.net = new NetManager();
    this.webSockets = new WebSocketManager();
    this.processManager = new ProcessManager({ kernel: this, processWorkerFactory, processWorkerBackend });
    this.pty = new PtyManager({ kernel: this });
    this.syscalls = new SyscallRouter({ kernel: this });
    this.shell = new ShellRunner({ kernel: this });
    this.npmCommand = new NpmCommand({ kernel: this, registryClient });
    this.registerDefaultBuiltins();
  }
  registerDefaultBuiltins() {
    registerDefaultCommandBuiltins(this);
  }
  resolvePath(cwd, path) {
    return resolvePath(cwd, path);
  }
  spawn(command, args = [], options = {}) {
    return this.processManager.spawn(command, args, options);
  }
  spawnSync(command, args = [], options = {}) {
    return this.processManager.spawnSync(command, args, options);
  }
  kill(pid, signal) {
    return this.processManager.kill(pid, signal);
  }
  killTree(pid, signal) {
    return this.processManager.killTree(pid, signal);
  }
  async run(command, args = [], options = {}) {
    const process = this.spawn(command, args, options);
    return process.completed;
  }
  registerPort(options) {
    return this.portManager.register(options);
  }
  listeningPorts(projectId = "default") {
    return this.portManager.list(projectId);
  }
  unregisterPortsForPid(pid) {
    for (const entry of this.portManager.ports.values()) {
      if (entry.pid === pid) {
        this.webSockets.unregister({ projectId: entry.projectId, port: entry.port });
      }
    }
    this.portManager.unregisterForPid(pid);
    this.net.unregisterForPid(pid);
    this.processManager.processes.get(pid)?.descriptor.onIdle?.();
  }
  dispatchHttpRequest(request) {
    return this.portManager.dispatch(request);
  }
  registerWebSocketServer(options) {
    return this.webSockets.register(options);
  }
  connectWebSocket(options) {
    return this.webSockets.connect(options);
  }
  listenNet(options) {
    return this.net.listen(options);
  }
  connectNet(options) {
    return this.net.connect(options);
  }
};

// packages/embed/src/webcontainer-compatible.js
var WORKSPACE_ROOT = "/workspace";
var textDecoder4 = new TextDecoder();
var _OpenContainer_instances, handlePortRegister_fn, handlePortUnregister_fn, previewUrl_fn, connectServiceWorker_fn, installServiceWorkerMessageListener_fn, reconnectServiceWorker_fn, connectServiceWorkerTarget_fn, handleServiceWorkerMessage_fn, writeWorkspaceFile_fn, clearWorkspacePreservingNodeModules_fn, emit_fn2;
var _OpenContainer = class _OpenContainer {
  constructor({
    projectId = "demo",
    previewBasePath = "/opencontainers/preview",
    serviceWorkerUrl = "/opencontainers-runtime-sw.js",
    registerServiceWorker = true,
    serviceWorkerControllerTimeoutMs = 5e3,
    kernel = new Kernel()
  } = {}) {
    __privateAdd(this, _OpenContainer_instances);
    this.projectId = projectId;
    this.previewBasePath = previewBasePath.replace(/\/$/, "");
    this.serviceWorkerUrl = serviceWorkerUrl;
    this.registerServiceWorker = registerServiceWorker;
    this.serviceWorkerControllerTimeoutMs = serviceWorkerControllerTimeoutMs;
    this.kernel = kernel;
    this.listeners = /* @__PURE__ */ new Map();
    this.processes = /* @__PURE__ */ new Set();
    this.serviceWorkerPort = null;
    this.serviceWorkerMessageListener = null;
    this.serviceWorkerReconnectPromise = null;
    this.fs = createFsFacade(this);
    this.kernel.portManager.on("register", (entry) => __privateMethod(this, _OpenContainer_instances, handlePortRegister_fn).call(this, entry));
    this.kernel.portManager.on("unregister", (entry) => __privateMethod(this, _OpenContainer_instances, handlePortUnregister_fn).call(this, entry));
  }
  static async boot(options = {}) {
    const container = new _OpenContainer(options);
    await container.boot();
    return container;
  }
  async boot() {
    if (this.registerServiceWorker) await __privateMethod(this, _OpenContainer_instances, connectServiceWorker_fn).call(this);
    return this;
  }
  on(eventName, listener) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, /* @__PURE__ */ new Set());
    this.listeners.get(eventName).add(listener);
    return () => this.listeners.get(eventName)?.delete(listener);
  }
  async mount(tree = {}) {
    __privateMethod(this, _OpenContainer_instances, clearWorkspacePreservingNodeModules_fn).call(this);
    const files = flattenWebContainerTree(tree);
    for (const [path, contents] of Object.entries(files)) {
      __privateMethod(this, _OpenContainer_instances, writeWorkspaceFile_fn).call(this, path, contents);
    }
  }
  async spawn(command, args = [], options = {}) {
    if (command === "node" && (args[0] === "-v" || args[0] === "--version")) {
      return syntheticProcess("v26.0.0-opencontainers\n");
    }
    const normalized = normalizeSpawn(command, args);
    const process = this.kernel.spawn(normalized.command, normalized.args, {
      cwd: WORKSPACE_ROOT,
      env: {
        OPENCONTAINERS_PROJECT_ID: this.projectId,
        ...options.env ?? {}
      },
      projectId: this.projectId
    });
    this.processes.add(process);
    process.completed.finally(() => this.processes.delete(process));
    return new OpenContainerProcess({ container: this, process });
  }
  teardown() {
    for (const process of [...this.processes]) {
      process.kill("SIGTERM");
    }
    this.processes.clear();
    this.serviceWorkerPort?.close?.();
    this.serviceWorkerPort = null;
    const serviceWorker = typeof navigator === "undefined" ? null : navigator.serviceWorker;
    if (serviceWorker && this.serviceWorkerMessageListener) {
      serviceWorker.removeEventListener?.("message", this.serviceWorkerMessageListener);
    }
    this.serviceWorkerMessageListener = null;
    this.serviceWorkerReconnectPromise = null;
    this.listeners.clear();
  }
  async dispatchPreviewRequest(request) {
    const preview = parsePreviewRequest(request, this.previewBasePath, this.projectId);
    const response = await this.kernel.dispatchHttpRequest({
      id: request.id ?? randomId(),
      projectId: preview.projectId ?? request.projectId ?? this.projectId,
      port: preview.port,
      method: request.method ?? "GET",
      url: `${preview.path}${preview.search}`,
      headers: request.headers ?? [],
      body: request.body
    });
    return {
      ...response,
      body: serializeBody(response.body)
    };
  }
};
_OpenContainer_instances = new WeakSet();
handlePortRegister_fn = function(entry) {
  if (entry.projectId !== this.projectId) return;
  const url = __privateMethod(this, _OpenContainer_instances, previewUrl_fn).call(this, entry.port);
  if (this.registerServiceWorker && !this.serviceWorkerPort) {
    __privateMethod(this, _OpenContainer_instances, emit_fn2).call(this, "error", new Error(`Server is listening on port ${entry.port}, but browser previews are not available because the OpenContainers preview Service Worker is not controlling this page. Reload the page and run again.`));
    return;
  }
  __privateMethod(this, _OpenContainer_instances, emit_fn2).call(this, "port", entry.port, "open", url);
  __privateMethod(this, _OpenContainer_instances, emit_fn2).call(this, "server-ready", entry.port, url);
};
handlePortUnregister_fn = function(entry) {
  if (entry.projectId !== this.projectId) return;
  __privateMethod(this, _OpenContainer_instances, emit_fn2).call(this, "port", entry.port, "close", __privateMethod(this, _OpenContainer_instances, previewUrl_fn).call(this, entry.port));
};
previewUrl_fn = function(port) {
  const path = `${this.previewBasePath}/${encodeURIComponent(this.projectId)}:${port}/`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return `https://run.opencontainers.local${path}`;
};
connectServiceWorker_fn = async function() {
  const serviceWorker = typeof navigator === "undefined" ? null : navigator.serviceWorker;
  if (!serviceWorker) return;
  const registration = await serviceWorker.register(this.serviceWorkerUrl, { scope: "/" });
  const readyRegistration = await serviceWorker.ready;
  __privateMethod(this, _OpenContainer_instances, installServiceWorkerMessageListener_fn).call(this, serviceWorker);
  const worker = await resolveServiceWorkerMessageTarget({
    serviceWorker,
    registration,
    readyRegistration,
    timeoutMs: this.serviceWorkerControllerTimeoutMs
  });
  if (!worker) {
    __privateMethod(this, _OpenContainer_instances, emit_fn2).call(this, "error", new Error("OpenContainers preview Service Worker is registered but no active worker is available yet. Reload the page and run again."));
    return;
  }
  __privateMethod(this, _OpenContainer_instances, connectServiceWorkerTarget_fn).call(this, worker);
};
installServiceWorkerMessageListener_fn = function(serviceWorker) {
  if (this.serviceWorkerMessageListener) return;
  this.serviceWorkerMessageListener = (event) => {
    if (event.data?.type !== "OPENCONTAINERS_REQUEST_KERNEL_CONNECTION") return;
    __privateMethod(this, _OpenContainer_instances, reconnectServiceWorker_fn).call(this).catch((error) => {
      __privateMethod(this, _OpenContainer_instances, emit_fn2).call(this, "error", error);
    });
  };
  serviceWorker.addEventListener?.("message", this.serviceWorkerMessageListener);
};
reconnectServiceWorker_fn = async function() {
  if (this.serviceWorkerReconnectPromise) return this.serviceWorkerReconnectPromise;
  this.serviceWorkerReconnectPromise = (async () => {
    const serviceWorker = typeof navigator === "undefined" ? null : navigator.serviceWorker;
    const worker = serviceWorker ? await resolveServiceWorkerMessageTarget({
      serviceWorker,
      timeoutMs: this.serviceWorkerControllerTimeoutMs
    }) : null;
    if (!worker) throw new Error("OpenContainers preview Service Worker requested a runtime reconnect, but this page is not controlled by a Service Worker. Reload the page and run again.");
    __privateMethod(this, _OpenContainer_instances, connectServiceWorkerTarget_fn).call(this, worker);
  })().finally(() => {
    this.serviceWorkerReconnectPromise = null;
  });
  return this.serviceWorkerReconnectPromise;
};
connectServiceWorkerTarget_fn = function(worker) {
  this.serviceWorkerPort?.close?.();
  const channel = new MessageChannel();
  channel.port2.onmessage = (event) => {
    __privateMethod(this, _OpenContainer_instances, handleServiceWorkerMessage_fn).call(this, event.data, channel.port2);
  };
  channel.port2.start?.();
  worker.postMessage({ type: "OPENCONTAINERS_CONNECT_KERNEL" }, [channel.port1]);
  this.serviceWorkerPort = channel.port2;
};
handleServiceWorkerMessage_fn = async function(message, port) {
  if (!message?.id || message.type !== "dispatchHttp") return;
  try {
    const response = await this.dispatchPreviewRequest(message.payload ?? {});
    port.postMessage({
      type: "reply",
      requestId: message.id,
      payload: { ok: true, response }
    });
  } catch (error) {
    port.postMessage({
      type: "reply",
      requestId: message.id,
      payload: { ok: false, error: serializeError2(error) }
    });
  }
};
writeWorkspaceFile_fn = function(filePath, contents) {
  const path = toWorkspacePath(filePath);
  this.kernel.fs.mkdirSync(dirname(path), { recursive: true });
  this.kernel.fs.writeFileSync(path, contents);
};
clearWorkspacePreservingNodeModules_fn = function() {
  const preserved = /* @__PURE__ */ new Set([
    `${WORKSPACE_ROOT}/node_modules`,
    `${WORKSPACE_ROOT}/package-lock.opencontainers.json`
  ]);
  for (const [path] of [...this.kernel.fs.nodes.entries()].sort((left, right) => right[0].length - left[0].length)) {
    if (path === WORKSPACE_ROOT || !path.startsWith(`${WORKSPACE_ROOT}/`)) continue;
    if ([...preserved].some((root) => path === root || path.startsWith(`${root}/`))) continue;
    this.kernel.fs.rmSync(path, { recursive: true, force: true });
  }
};
emit_fn2 = function(eventName, ...args) {
  for (const listener of this.listeners.get(eventName) ?? []) {
    try {
      listener(...args);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
};
var OpenContainer = _OpenContainer;
function waitForServiceWorkerController(serviceWorker, timeoutMs) {
  if (serviceWorker.controller) return Promise.resolve(serviceWorker.controller);
  return new Promise((resolve2) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      serviceWorker.removeEventListener?.("controllerchange", finish);
      resolve2(serviceWorker.controller ?? null);
    };
    serviceWorker.addEventListener?.("controllerchange", finish);
    timer = setTimeout(finish, timeoutMs);
  });
}
async function resolveServiceWorkerMessageTarget({
  serviceWorker,
  timeoutMs
}) {
  if (serviceWorker.controller) return serviceWorker.controller;
  return waitForServiceWorkerController(serviceWorker, timeoutMs);
}
var WebContainer = OpenContainer;
function flattenWebContainerTree(tree, prefix = "") {
  const files = {};
  for (const [name, entry] of Object.entries(tree ?? {})) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry?.file) {
      files[path] = entry.file.contents ?? "";
      continue;
    }
    if (entry?.directory) {
      Object.assign(files, flattenWebContainerTree(entry.directory, path));
    }
  }
  return files;
}
function parseOpenContainersPreviewUrl(url, previewBasePath = "/opencontainers/preview") {
  const parsed = new URL(url, "https://run.opencontainers.local");
  const base = previewBasePath.replace(/\/$/, "");
  const marker = `${base}/`;
  const markerIndex = parsed.pathname.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error(`Not a OpenContainers preview URL: ${parsed.pathname}`);
  const rest = parsed.pathname.slice(markerIndex + marker.length);
  const slashIndex = rest.indexOf("/");
  const projectSegment = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  const [projectPart, portPart] = decodeURIComponent(projectSegment).split(":");
  return {
    projectId: projectPart,
    port: Number(portPart),
    path: slashIndex === -1 ? "/" : rest.slice(slashIndex),
    search: parsed.search
  };
}
function parsePreviewRequest(request, previewBasePath, fallbackProjectId) {
  try {
    return parseOpenContainersPreviewUrl(request.url, previewBasePath);
  } catch (error) {
    const port = Number(request.port);
    if (!Number.isFinite(port) || port <= 0) throw error;
    const parsed = new URL(request.url || "/", "https://run.opencontainers.local");
    return {
      projectId: request.projectId ?? fallbackProjectId,
      port,
      path: parsed.pathname || "/",
      search: parsed.search
    };
  }
}
function createOpenContainersServiceWorkerScript({ previewBasePath = "/opencontainers/preview" } = {}) {
  return `
const previewBasePath = ${JSON.stringify(previewBasePath.replace(/\/$/, ""))};
let kernelPort = null;
let reconnectPromise = null;
const pending = new Map();
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if (event.data?.type === "OPENCONTAINERS_CONNECT_KERNEL" && event.ports?.[0]) {
    kernelPort = event.ports[0];
    kernelPort.onmessage = handleKernelMessage;
    kernelPort.start?.();
  }
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(previewBasePath + "/")) return;
  event.respondWith(handlePreviewFetch(event.request));
});
function handleKernelMessage(event) {
  const message = event.data;
  if (message?.type !== "reply") return;
  const pendingRequest = pending.get(message.requestId);
  if (!pendingRequest) return;
  pending.delete(message.requestId);
  pendingRequest.resolve(message.payload);
}
async function handlePreviewFetch(request) {
  if (!kernelPort) await requestRuntimeConnection();
  if (!kernelPort) return new Response("OpenContainers runtime is not connected", { status: 503 });
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : new Uint8Array(await request.arrayBuffer());
  const payload = await requestKernel("dispatchHttp", {
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body
  });
  if (!payload.ok) {
    return new Response(payload.error?.message || "OpenContainers preview request failed", { status: 500 });
  }
  const response = payload.response || {};
  const headers = new Headers(response.headers || []);
  return new Response(response.body || "", {
    status: response.status || 200,
    statusText: response.statusText || "OK",
    headers
  });
}
function requestKernel(type, payload) {
  const id = crypto.randomUUID?.() || Math.random().toString(16).slice(2);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out waiting for OpenContainers runtime"));
    }, 30000);
    pending.set(id, { resolve: value => {
      clearTimeout(timeout);
      resolve(value);
    }});
    kernelPort.postMessage({ id, type, payload });
  });
}
async function requestRuntimeConnection() {
  if (kernelPort) return kernelPort;
  if (!reconnectPromise) {
    reconnectPromise = requestRuntimeConnectionOnce().finally(() => {
      reconnectPromise = null;
    });
  }
  return reconnectPromise;
}
async function requestRuntimeConnectionOnce() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage?.({ type: "OPENCONTAINERS_REQUEST_KERNEL_CONNECTION" });
  }
  const deadline = Date.now() + 1500;
  while (!kernelPort && Date.now() < deadline) {
    await sleep(25);
  }
  return kernelPort;
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
`;
}
var _OpenContainerProcess_instances, createOutputStream_fn, createInputStream_fn;
var OpenContainerProcess = class {
  constructor({ container, process }) {
    __privateAdd(this, _OpenContainerProcess_instances);
    this.container = container;
    this.process = process;
    this.output = __privateMethod(this, _OpenContainerProcess_instances, createOutputStream_fn).call(this);
    this.input = __privateMethod(this, _OpenContainerProcess_instances, createInputStream_fn).call(this);
    this.exit = process.completed.then((result) => result.status);
  }
  kill(signal = "SIGTERM") {
    if (!this.container.kernel.killTree(this.process.pid, signal)) {
      this.process.kill(signal);
    }
  }
};
_OpenContainerProcess_instances = new WeakSet();
createOutputStream_fn = function() {
  const process = this.process;
  return new ReadableStream({
    start(controller) {
      const onData = (chunk) => controller.enqueue(decodeChunk2(chunk));
      process.stdout.on("data", onData);
      process.stderr.on("data", onData);
      process.completed.finally(() => {
        process.stdout.off?.("data", onData);
        process.stderr.off?.("data", onData);
        controller.close();
      });
    }
  });
};
createInputStream_fn = function() {
  const process = this.process;
  return new WritableStream({
    write(chunk) {
      process.stdin.write(chunk);
    }
  });
};
function syntheticProcess(output, exitCode = 0) {
  return {
    output: new ReadableStream({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      }
    }),
    exit: Promise.resolve(exitCode),
    kill() {
    }
  };
}
function createFsFacade(container) {
  return {
    mkdir: async (path, options = {}) => {
      container.kernel.fs.mkdirSync(toWorkspacePath(path), options);
    },
    writeFile: async (path, contents) => {
      const workspacePath = toWorkspacePath(path);
      container.kernel.fs.mkdirSync(dirname(workspacePath), { recursive: true });
      container.kernel.fs.writeFileSync(workspacePath, contents);
    },
    rm: async (path, options = {}) => {
      container.kernel.fs.rmSync(toWorkspacePath(path), { recursive: Boolean(options.recursive), force: Boolean(options.force) });
    },
    readFile: async (path, encoding) => container.kernel.fs.readFileSync(toWorkspacePath(path), encoding)
  };
}
function normalizeSpawn(command, args) {
  if (command !== "node") return { command, args };
  const filteredArgs = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--enable-source-maps") continue;
    if (arg === "--loader" || arg === "--require" || arg === "-r") {
      index++;
      continue;
    }
    filteredArgs.push(arg);
  }
  return { command, args: filteredArgs };
}
function toWorkspacePath(path) {
  return joinPath(WORKSPACE_ROOT, normalizePath(`/${String(path || "").replace(/^\/+/, "")}`));
}
function decodeChunk2(chunk) {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return textDecoder4.decode(chunk);
  if (ArrayBuffer.isView(chunk)) return textDecoder4.decode(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  return String(chunk);
}
function serializeBody(body) {
  if (body === void 0 || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return textDecoder4.decode(body);
  if (ArrayBuffer.isView(body)) return textDecoder4.decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  return String(body);
}
function serializeError2(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack
  };
}
function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);
}
export {
  OpenContainer,
  WebContainer,
  createOpenContainersServiceWorkerScript,
  flattenWebContainerTree,
  parseOpenContainersPreviewUrl
};
