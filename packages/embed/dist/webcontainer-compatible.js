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
function dirname(input) {
  const normalized = normalizePath(input);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized.startsWith("/") ? "/" : ".";
  return normalized.slice(0, index);
}
function basename(input) {
  const normalized = normalizePath(input);
  if (normalized === "/") return "/";
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
  var _a2;
  if (!parts.length) return ".";
  const first = String((_a2 = parts[0]) != null ? _a2 : "");
  const joined = parts.filter((part) => part !== void 0 && part !== null && part !== "").join("/");
  return normalizePath(first.startsWith("/") ? joined : joined || ".");
}
function relativePath(from, to) {
  const fromParts = normalizePath(from).split("/").filter(Boolean);
  const toParts = normalizePath(to).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/") || ".";
}
function isInsidePath(parent, child) {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent.replace(/\/$/, "")}/`);
}

// packages/runtime-node/src/builtins/events.js
var EVENTS_SYMBOL = /* @__PURE__ */ Symbol.for("opencontainers.events");
var EventEmitter = class {
  constructor() {
    eventMap(this);
  }
  setMaxListeners(count) {
    this._maxListeners = Number(count);
    return this;
  }
  getMaxListeners() {
    var _a2;
    return (_a2 = this._maxListeners) != null ? _a2 : 10;
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
    if (eventName === void 0) events.clear();
    else events.delete(eventName);
    return this;
  }
  emit(eventName, ...args) {
    var _a2, _b;
    const listeners = [...(_a2 = eventMap(this).get(eventName)) != null ? _a2 : []];
    if (!listeners.length && eventName === "error") {
      const error = args[0] instanceof Error ? args[0] : new Error(String((_b = args[0]) != null ? _b : "Unhandled error event"));
      throw error;
    }
    for (const listener of listeners) listener(...args);
    return listeners.length > 0;
  }
  listenerCount(eventName) {
    var _a2;
    return ((_a2 = eventMap(this).get(eventName)) != null ? _a2 : []).length;
  }
  listeners(eventName) {
    var _a2;
    return ((_a2 = eventMap(this).get(eventName)) != null ? _a2 : []).map((listener) => {
      var _a3;
      return (_a3 = listener.listener) != null ? _a3 : listener;
    });
  }
  rawListeners(eventName) {
    var _a2;
    return [...(_a2 = eventMap(this).get(eventName)) != null ? _a2 : []];
  }
  eventNames() {
    return [...eventMap(this).keys()];
  }
};
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
  var _a2;
  if (typeof listener !== "function") {
    throw new TypeError("listener must be a function");
  }
  const events = eventMap(target);
  const listeners = (_a2 = events.get(eventName)) != null ? _a2 : [];
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
var _VirtualFileSystem_instances, now_fn, createNode_fn, createDirectory_fn, touch_fn, lookup_fn, requireParent_fn, emit_fn;
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
    var _a2;
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
        this.writeFileSync(path, typeof value === "string" ? value : (_a2 = value == null ? void 0 : value.content) != null ? _a2 : "");
      }
    }
  }
  watchedPaths() {
    var _a2;
    return [...(_a2 = this.watchers.listenersByPath) != null ? _a2 : []];
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
    return this.statSync(path);
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
    const encoding = typeof options === "string" ? options : options == null ? void 0 : options.encoding;
    const data = new Uint8Array(node.data);
    return encoding ? textDecoder.decode(data) : data;
  }
  writeFileSync(path, data, options = {}) {
    const normalized = normalizePath(path);
    const parent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, normalized);
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
    let node = this.nodes.get(normalized);
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
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, normalized);
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
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    const node = __privateMethod(this, _VirtualFileSystem_instances, lookup_fn).call(this, from);
    __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, to);
    const entries = [...this.nodes.entries()].filter(([path]) => path === from || isInsidePath(from, path));
    entries.sort((a, b) => a[0].length - b[0].length);
    for (const [path, entry] of entries) {
      const movedPath = path === from ? to : `${to}${path.slice(from.length)}`;
      this.nodes.delete(path);
      entry.path = movedPath;
      this.nodes.set(movedPath, entry);
    }
    const oldParent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, from);
    const newParent = __privateMethod(this, _VirtualFileSystem_instances, requireParent_fn).call(this, to);
    oldParent.children.delete(basename(from));
    newParent.children.add(basename(to));
    __privateMethod(this, _VirtualFileSystem_instances, touch_fn).call(this, node);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", from);
    __privateMethod(this, _VirtualFileSystem_instances, emit_fn).call(this, "rename", to);
  }
  copyFileSync(source, destination) {
    const data = this.readFileSync(source);
    this.writeFileSync(destination, data);
  }
  watch(path, optionsOrListener, maybeListener) {
    var _a2, _b;
    const normalized = normalizePath(path);
    const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
    if (!listener) throw new TypeError("watch listener is required");
    (_b = (_a2 = this.watchers).listenersByPath) != null ? _b : _a2.listenersByPath = /* @__PURE__ */ new Set();
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
        cb == null ? void 0 : cb(null);
      } catch (error) {
        cb == null ? void 0 : cb(error);
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
    mode: type === "directory" ? 16877 : 33188,
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
lookup_fn = function(path) {
  const normalized = normalizePath(path);
  const node = this.nodes.get(normalized);
  if (!node) throw new VirtualFileSystemError("ENOENT", normalized, "no such file or directory");
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
  var _a2;
  return (_a2 = packageAdapters[packageName]) != null ? _a2 : null;
}
function materializeAdapterFiles(fs, adapter) {
  var _a2;
  for (const [path, source] of Object.entries((_a2 = adapter.files) != null ? _a2 : {})) {
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
    var _a2;
    const tarball = (_a2 = metadata.dist) == null ? void 0 : _a2.tarball;
    if (!tarball) throw new Error(`No tarball URL for ${packageName}@${version}`);
    const compressed = await fetchPackageBytes(tarball, packageName, version);
    try {
      const tarBytes = await packageTarBytes(compressed, metadata, { packageName, version, tarball });
      return extractTarFiles(tarBytes);
    } catch (error) {
      if ((error == null ? void 0 : error.code) !== "ERR_OPENCONTAINERS_NPM_INTEGRITY") throw error;
      const retryBytes = await fetchPackageBytes(tarball, packageName, version, { cache: "reload" });
      const tarBytes = await packageTarBytes(retryBytes, metadata, { packageName, version, tarball, allowIntegrityMismatchArchive: true });
      return extractTarFiles(tarBytes);
    }
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
  var _a2;
  if ((_a2 = metadata.dist) == null ? void 0 : _a2.integrity) {
    try {
      await verifyIntegrity(bytes, metadata.dist.integrity);
    } catch (error) {
      if ((error == null ? void 0 : error.code) === "ERR_OPENCONTAINERS_NPM_INTEGRITY" && packageArchiveMatches(bytes, details)) {
        return bytes;
      }
      if ((error == null ? void 0 : error.code) === "ERR_OPENCONTAINERS_NPM_INTEGRITY" && details.allowIntegrityMismatchArchive) {
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
  var _a2, _b;
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if ((_b = (_a2 = globalThis.process) == null ? void 0 : _a2.versions) == null ? void 0 : _b.node) {
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
  var _a2;
  if (!looksLikeTarArchive(bytes)) return false;
  try {
    const files = extractTarFiles(bytes);
    const manifest = JSON.parse(new TextDecoder().decode((_a2 = files["package.json"]) != null ? _a2 : new Uint8Array()));
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
  var _a2, _b, _c;
  const versions = Object.keys((_a2 = metadata.versions) != null ? _a2 : {});
  if (!versions.length) throw new Error(`No versions available for ${metadata.name}`);
  const requestedRange = String(range || "latest").trim();
  const taggedVersion = (_b = metadata["dist-tags"]) == null ? void 0 : _b[requestedRange];
  if (taggedVersion && metadata.versions[taggedVersion]) return taggedVersion;
  if (requestedRange === "latest" || requestedRange === "*") {
    const latest = (_c = metadata["dist-tags"]) == null ? void 0 : _c.latest;
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
  var _a2, _b, _c, _d;
  if (!version) return null;
  return {
    major: (_a2 = version.major) != null ? _a2 : 0,
    minor: (_b = version.minor) != null ? _b : 0,
    patch: (_c = version.patch) != null ? _c : 0,
    prerelease: (_d = version.prerelease) != null ? _d : ""
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
    var _a2, _b, _c;
    const manifestPath = resolvePath(cwd, "package.json");
    const manifest = this.kernel.fs.existsSync(manifestPath) ? JSON.parse(this.kernel.fs.readFileSync(manifestPath, "utf8")) : { scripts: {}, dependencies: {}, devDependencies: {} };
    if (packages.length) {
      for (const spec of packages) {
        const { name, range } = parsePackageSpec(spec);
        const target = saveDev ? "devDependencies" : "dependencies";
        (_a2 = manifest[target]) != null ? _a2 : manifest[target] = {};
        manifest[target][name] = range != null ? range : "latest";
      }
      this.kernel.fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}
`);
    }
    const dependencies = {
      ...(_b = manifest.dependencies) != null ? _b : {},
      ...saveDev ? (_c = manifest.devDependencies) != null ? _c : {} : {}
    };
    for (const [name, range] of Object.entries(dependencies)) {
      await this.installPackage({ cwd, name, range, descriptor });
    }
    this.writeLockfile(cwd);
  }
  async installPackage({ cwd, name, range = "latest", descriptor }) {
    var _a2;
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
    for (const [dependencyName, dependencyRange] of Object.entries((_a2 = packageMetadata.dependencies) != null ? _a2 : {})) {
      await this.installPackage({ cwd, name: dependencyName, range: dependencyRange, descriptor });
    }
    this.linkBins({ cwd, name, packageRoot, packageMetadata, adapter });
    await this.runLifecycleScripts({ name, version, packageRoot, packageMetadata, descriptor, adapter });
  }
  applyAdapter({ name, version, packageRoot, packageMetadata, adapter, descriptor }) {
    var _a2, _b;
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
      (_b = (_a2 = descriptor == null ? void 0 : descriptor.stdout) == null ? void 0 : _a2.write) == null ? void 0 : _b.call(_a2, `adapted ${name}@${version} -> ${adapter.replaceModule}
`);
    }
  }
  linkBins({ cwd, name, packageRoot, packageMetadata, adapter }) {
    var _a2;
    const bin = (_a2 = adapter == null ? void 0 : adapter.replaceBin) != null ? _a2 : packageMetadata.bin;
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
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const scripts = (_a2 = packageMetadata.scripts) != null ? _a2 : {};
    const lifecycleOrder = ["preinstall", "install", "postinstall", "prepare"];
    const enabledScripts = lifecycleOrder.filter((scriptName) => scripts[scriptName]);
    if (!enabledScripts.length) return;
    if ((adapter == null ? void 0 : adapter.postInstall) === "skip") {
      (_d = (_b = descriptor == null ? void 0 : descriptor.stderr) == null ? void 0 : _b.write) == null ? void 0 : _d.call(_b, `skipped install scripts for ${name}@${version}; adapter ${(_c = adapter.replaceModule) != null ? _c : "configured"} replaces native package behavior
`);
      return;
    }
    if (!this.kernel.allowInstallScripts) {
      (_f = (_e = descriptor == null ? void 0 : descriptor.stderr) == null ? void 0 : _e.write) == null ? void 0 : _f.call(_e, `skipped install scripts for ${name}@${version}; permission disabled
`);
      return;
    }
    for (const scriptName of enabledScripts) {
      (_h = (_g = descriptor == null ? void 0 : descriptor.stdout) == null ? void 0 : _g.write) == null ? void 0 : _h.call(_g, `${name}@${version} ${scriptName}: ${scripts[scriptName]}
`);
      const child = this.kernel.spawn("sh", ["-c", scripts[scriptName]], {
        cwd: packageRoot,
        env: {
          ...(_i = descriptor == null ? void 0 : descriptor.env) != null ? _i : {},
          npm_lifecycle_event: scriptName,
          npm_package_name: name,
          npm_package_version: version
        },
        projectId: (_j = descriptor == null ? void 0 : descriptor.projectId) != null ? _j : "default",
        parentPid: descriptor == null ? void 0 : descriptor.pid
      });
      child.stdout.on("data", (chunk) => {
        var _a3, _b2;
        return (_b2 = (_a3 = descriptor == null ? void 0 : descriptor.stdout) == null ? void 0 : _a3.write) == null ? void 0 : _b2.call(_a3, chunk);
      });
      child.stderr.on("data", (chunk) => {
        var _a3, _b2;
        return (_b2 = (_a3 = descriptor == null ? void 0 : descriptor.stderr) == null ? void 0 : _a3.write) == null ? void 0 : _b2.call(_a3, chunk);
      });
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
var NpmCommand = class {
  constructor({ kernel, registryClient }) {
    this.kernel = kernel;
    this.installer = new NpmInstaller({ kernel, registryClient });
  }
  async run(args, descriptor) {
    var _a2, _b;
    const [command = "--version", ...rest] = args;
    if (command === "--version" || command === "-v") {
      descriptor.stdout.write("opencontainers-npm/0.1.0\n");
      return 0;
    }
    if (command === "install" || command === "i") {
      const saveDev = rest.includes("--save-dev") || rest.includes("-D");
      const packages = rest.filter((arg) => !arg.startsWith("-"));
      await this.installer.install({ cwd: descriptor.cwd, packages, saveDev, descriptor });
      descriptor.stdout.write("installed\n");
      return 0;
    }
    if (command === "run") {
      const scriptName = rest[0];
      if (!scriptName) throw new Error("npm run requires a script name");
      const manifest = JSON.parse(this.kernel.fs.readFileSync(`${descriptor.cwd}/package.json`, "utf8"));
      const script = (_a2 = manifest.scripts) == null ? void 0 : _a2[scriptName];
      if (!script) throw new Error(`Missing script: ${scriptName}`);
      return this.kernel.shell.run(script, {
        cwd: descriptor.cwd,
        env: {
          ...descriptor.env,
          npm_lifecycle_event: scriptName,
          PATH: `${descriptor.cwd}/node_modules/.bin:${(_b = descriptor.env.PATH) != null ? _b : ""}`
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
  }
};

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
    var _a2, _b;
    let cwd = (_a2 = options.cwd) != null ? _a2 : "/workspace";
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
      cwd = (_b = result.cwd) != null ? _b : cwd;
      if (operator === null) break;
    }
    return lastStatus;
  }
  async runPipeline(commandLine, options) {
    var _a2, _b, _c, _d, _e, _f;
    const pipeline2 = parsePipeline(commandLine);
    let stdin = (_a2 = options.stdin) != null ? _a2 : "";
    let lastResult = { status: 0, cwd: options.cwd };
    for (let index = 0; index < pipeline2.segments.length; index++) {
      const segment = this.prepareSegment(pipeline2.segments[index], options.cwd);
      if (!segment.command) continue;
      const isLast = index === pipeline2.segments.length - 1;
      const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
      const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
      const stdout = isLast && !stdoutRedirect ? (_b = options.stdout) != null ? _b : new MemoryStream() : new MemoryStream();
      const stderr = isLast && !stderrRedirect ? (_c = options.stderr) != null ? _c : new MemoryStream() : new MemoryStream();
      const env = { ...(_d = options.env) != null ? _d : {}, ...segment.env };
      lastResult = await this.runCommand(segment.command, segment.args, {
        ...options,
        cwd: (_e = lastResult.cwd) != null ? _e : options.cwd,
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
        cwd: (_f = lastResult.cwd) != null ? _f : options.cwd
      });
      stdin = typeof stdout.toString === "function" ? stdout.toString() : "";
    }
    return lastResult;
  }
  async runCommand(command, args, options) {
    const builtin = this.shellBuiltin(command);
    if (builtin) return builtin(args, options);
    const child = this.kernel.spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      projectId: options.projectId,
      parentPid: options.parentPid
    });
    child.stdout.on("data", (chunk) => {
      var _a2;
      return (_a2 = options.stdout) == null ? void 0 : _a2.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      var _a2;
      return (_a2 = options.stderr) == null ? void 0 : _a2.write(chunk);
    });
    const result = await child.completed;
    return { status: result.status, cwd: options.cwd };
  }
  runSync(commandLine, options = {}) {
    var _a2, _b;
    let cwd = (_a2 = options.cwd) != null ? _a2 : "/workspace";
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
      cwd = (_b = result.cwd) != null ? _b : cwd;
    }
    return lastStatus;
  }
  runPipelineSync(commandLine, options) {
    var _a2, _b, _c, _d, _e, _f;
    const pipeline2 = parsePipeline(commandLine);
    let stdin = (_a2 = options.stdin) != null ? _a2 : "";
    let lastResult = { status: 0, cwd: options.cwd };
    for (let index = 0; index < pipeline2.segments.length; index++) {
      const segment = this.prepareSegment(pipeline2.segments[index], options.cwd);
      if (!segment.command) continue;
      const isLast = index === pipeline2.segments.length - 1;
      const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
      const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
      const stdout = isLast && !stdoutRedirect ? (_b = options.stdout) != null ? _b : new MemoryStream() : new MemoryStream();
      const stderr = isLast && !stderrRedirect ? (_c = options.stderr) != null ? _c : new MemoryStream() : new MemoryStream();
      const env = { ...(_d = options.env) != null ? _d : {}, ...segment.env };
      lastResult = this.runCommandSync(segment.command, segment.args, {
        ...options,
        cwd: (_e = lastResult.cwd) != null ? _e : options.cwd,
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
        cwd: (_f = lastResult.cwd) != null ? _f : options.cwd
      });
      stdin = typeof stdout.toString === "function" ? stdout.toString() : "";
    }
    return lastResult;
  }
  runCommandSync(command, args, options) {
    var _a2, _b;
    const builtin = this.shellBuiltin(command);
    if (builtin) {
      return this.syncShellBuiltin(command, args, options);
    }
    const result = this.kernel.spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      projectId: options.projectId,
      parentPid: options.parentPid
    });
    (_a2 = options.stdout) == null ? void 0 : _a2.write(result.stdout);
    (_b = options.stderr) == null ? void 0 : _b.write(result.stderr);
    return { status: result.status, cwd: options.cwd };
  }
  syncShellBuiltin(command, args, options) {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    const fs = this.kernel.fs;
    const resolve = (cwd, path) => resolvePath(cwd, path);
    switch (command) {
      case "cd": {
        const target = resolve(options.cwd, (_a2 = args[0]) != null ? _a2 : "/workspace");
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
        return { status: 0, cwd: target };
      }
      case "pwd":
        (_b = options.stdout) == null ? void 0 : _b.write(`${options.cwd}
`);
        return { status: 0, cwd: options.cwd };
      case "ls": {
        const target = resolve(options.cwd, (_c = args[0]) != null ? _c : ".");
        (_d = options.stdout) == null ? void 0 : _d.write(`${fs.readdirSync(target).join("\n")}
`);
        return { status: 0, cwd: options.cwd };
      }
      case "cat":
        if (!args.length) (_f = options.stdout) == null ? void 0 : _f.write((_e = options.stdin) != null ? _e : "");
        else for (const path of args) (_g = options.stdout) == null ? void 0 : _g.write(fs.readFileSync(resolve(options.cwd, path), "utf8"));
        return { status: 0, cwd: options.cwd };
      case "echo":
        (_h = options.stdout) == null ? void 0 : _h.write(`${args.join(" ")}
`);
        return { status: 0, cwd: options.cwd };
      case "mkdir": {
        const recursive = args.includes("-p");
        for (const path of args.filter((arg) => arg !== "-p")) fs.mkdirSync(resolve(options.cwd, path), { recursive });
        return { status: 0, cwd: options.cwd };
      }
      case "rm": {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const force = args.includes("-f") || args.includes("-rf") || args.includes("-fr");
        for (const path of args.filter((arg) => !arg.startsWith("-"))) fs.rmSync(resolve(options.cwd, path), { recursive, force });
        return { status: 0, cwd: options.cwd };
      }
      case "cp":
        fs.copyFileSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      case "mv":
        fs.renameSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      case "which": {
        for (const commandName of args) {
          const shim = resolve(options.cwd, `node_modules/.bin/${commandName}`);
          if (fs.existsSync(shim)) (_i = options.stdout) == null ? void 0 : _i.write(`${shim}
`);
          else if (["node", "npm", "sh"].includes(commandName)) (_j = options.stdout) == null ? void 0 : _j.write(`/bin/${commandName}
`);
        }
        return { status: 0, cwd: options.cwd };
      }
      case "env":
        for (const [key, value] of Object.entries((_k = options.env) != null ? _k : {})) (_l = options.stdout) == null ? void 0 : _l.write(`${key}=${value}
`);
        return { status: 0, cwd: options.cwd };
      case "clear":
        (_m = options.stdout) == null ? void 0 : _m.write("\x1Bc");
        return { status: 0, cwd: options.cwd };
      default:
        throw new Error(`No synchronous shell builtin: ${command}`);
    }
  }
  shellBuiltin(command) {
    const fs = this.kernel.fs;
    const resolve = (cwd, path) => resolvePath(cwd, path);
    const builtins = {
      cd: async (args, options) => {
        var _a2;
        const target = resolve(options.cwd, (_a2 = args[0]) != null ? _a2 : "/workspace");
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
        return { status: 0, cwd: target };
      },
      pwd: async (_args, options) => {
        var _a2;
        (_a2 = options.stdout) == null ? void 0 : _a2.write(`${options.cwd}
`);
        return { status: 0, cwd: options.cwd };
      },
      ls: async (args, options) => {
        var _a2, _b;
        const target = resolve(options.cwd, (_a2 = args[0]) != null ? _a2 : ".");
        (_b = options.stdout) == null ? void 0 : _b.write(`${fs.readdirSync(target).join("\n")}
`);
        return { status: 0, cwd: options.cwd };
      },
      cat: async (args, options) => {
        var _a2, _b, _c;
        if (!args.length) (_b = options.stdout) == null ? void 0 : _b.write((_a2 = options.stdin) != null ? _a2 : "");
        else for (const path of args) (_c = options.stdout) == null ? void 0 : _c.write(fs.readFileSync(resolve(options.cwd, path), "utf8"));
        return { status: 0, cwd: options.cwd };
      },
      echo: async (args, options) => {
        var _a2;
        (_a2 = options.stdout) == null ? void 0 : _a2.write(`${args.join(" ")}
`);
        return { status: 0, cwd: options.cwd };
      },
      mkdir: async (args, options) => {
        const recursive = args.includes("-p");
        for (const path of args.filter((arg) => arg !== "-p")) fs.mkdirSync(resolve(options.cwd, path), { recursive });
        return { status: 0, cwd: options.cwd };
      },
      rm: async (args, options) => {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const force = args.includes("-f") || args.includes("-rf") || args.includes("-fr");
        for (const path of args.filter((arg) => !arg.startsWith("-"))) fs.rmSync(resolve(options.cwd, path), { recursive, force });
        return { status: 0, cwd: options.cwd };
      },
      cp: async (args, options) => {
        fs.copyFileSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      },
      mv: async (args, options) => {
        fs.renameSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      },
      which: async (args, options) => {
        var _a2, _b;
        for (const commandName of args) {
          const shim = resolve(options.cwd, `node_modules/.bin/${commandName}`);
          if (fs.existsSync(shim)) (_a2 = options.stdout) == null ? void 0 : _a2.write(`${shim}
`);
          else if (["node", "npm", "sh"].includes(commandName)) (_b = options.stdout) == null ? void 0 : _b.write(`/bin/${commandName}
`);
        }
        return { status: 0, cwd: options.cwd };
      },
      env: async (_args, options) => {
        var _a2, _b;
        for (const [key, value] of Object.entries((_a2 = options.env) != null ? _a2 : {})) (_b = options.stdout) == null ? void 0 : _b.write(`${key}=${value}
`);
        return { status: 0, cwd: options.cwd };
      },
      clear: async (_args, options) => {
        var _a2;
        (_a2 = options.stdout) == null ? void 0 : _a2.write("\x1Bc");
        return { status: 0, cwd: options.cwd };
      }
    };
    return builtins[command];
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
    else if (stdout instanceof MemoryStream) stdinTarget == null ? void 0 : stdinTarget.write(stdout.toString());
    if (stderrRedirect) this.writeRedirect(stderrRedirect, stderr.toString(), cwd);
    else if (stderr instanceof MemoryStream) stderrTarget == null ? void 0 : stderrTarget.write(stderr.toString());
  }
  writeRedirect(redirect, data, cwd) {
    const target = resolvePath(cwd, redirect.target);
    if (redirect.append && this.kernel.fs.existsSync(target)) {
      this.kernel.fs.appendFileSync(target, data);
    } else {
      this.kernel.fs.writeFileSync(target, data);
    }
  }
  expandGlobs(args, cwd) {
    return args.flatMap((arg) => {
      if (!/[*?]/.test(arg)) return [arg];
      const resolved = resolvePath(cwd, arg);
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
      callback == null ? void 0 : callback(error);
      this.emit("error", error);
      return false;
    }
    const payload = typeof chunk === "string" ? chunk : new Uint8Array(chunk);
    const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    this.bytesWritten += byteLength;
    queueMicrotask(() => {
      var _a2;
      __privateMethod(_a2 = __privateGet(this, _peer), _VirtualNetSocket_instances, receive_fn).call(_a2, payload);
      callback == null ? void 0 : callback();
    });
    return true;
  }
  end(chunk, encoding, callback) {
    if (chunk !== void 0) this.write(chunk, encoding);
    this.readyState = "readOnly";
    queueMicrotask(() => {
      var _a2;
      (_a2 = __privateGet(this, _peer)) == null ? void 0 : _a2.emit("end");
      this.destroy();
      callback == null ? void 0 : callback();
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
var _OpenContainersBuffer_instances, fillString_fn;
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
    return new _OpenContainersBuffer(value != null ? value : 0);
  }
  static alloc(size, fill = 0, encoding = "utf8") {
    var _a2;
    const buffer = new _OpenContainersBuffer(size);
    if (typeof fill === "string") __privateMethod(_a2 = buffer, _OpenContainersBuffer_instances, fillString_fn).call(_a2, fill, encoding);
    else buffer.fill(fill);
    return buffer;
  }
  static allocUnsafe(size) {
    return new _OpenContainersBuffer(size);
  }
  static allocUnsafeSlow(size) {
    return _OpenContainersBuffer.allocUnsafe(size);
  }
  static concat(chunks, totalLength) {
    const size = totalLength != null ? totalLength : chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
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
  static byteLength(value, encoding) {
    return _OpenContainersBuffer.from(value, encoding).byteLength;
  }
  static isBuffer(value) {
    return value instanceof Uint8Array;
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
    const writable = Math.min(length != null ? length : bytes.length, bytes.length, this.length - offset);
    this.set(bytes.subarray(0, Math.max(0, writable)), offset);
    return Math.max(0, writable);
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
};
_OpenContainersBuffer_instances = new WeakSet();
fillString_fn = function(value, encoding) {
  const bytes = _OpenContainersBuffer.from(value, encoding);
  if (!bytes.length) return;
  for (let offset = 0; offset < this.length; offset += bytes.length) {
    this.set(bytes.subarray(0, Math.min(bytes.length, this.length - offset)), offset);
  }
};
var OpenContainersBuffer = _OpenContainersBuffer;
OpenContainersBuffer.poolSize = 8192;
var _a;
var RuntimeBuffer = (_a = globalThis.Buffer) != null ? _a : OpenContainersBuffer;
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = RuntimeBuffer;
function bytesToBase642(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.slice(index, index + 32768));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  throw new Error("base64 encoding is unavailable in this runtime");
}
function base64ToBytes(value) {
  const normalized = String(value).replace(/\s+/g, "");
  if (typeof atob === "function") {
    const binary = atob(normalized);
    const bytes = new OpenContainersBuffer(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return new OpenContainersBuffer(globalThis.Buffer.from(normalized, "base64"));
  }
  throw new Error("base64 decoding is unavailable in this runtime");
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
    var _a2;
    const projectId = (_a2 = request.projectId) != null ? _a2 : "default";
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
    this.on("end", () => {
      var _a2;
      return (_a2 = destination.end) == null ? void 0 : _a2.call(destination);
    });
    return destination;
  }
};
var _Readable_instances, flushReadable_fn;
var Readable = class extends Stream {
  constructor() {
    super();
    __privateAdd(this, _Readable_instances);
    this.readable = true;
    this.destroyed = false;
    this._opencontainersReadableBuffer = [];
    this._opencontainersReadableEnded = false;
    this._opencontainersReadableEndEmitted = false;
  }
  push(chunk) {
    if (chunk === null) {
      this._opencontainersReadableEnded = true;
      __privateMethod(this, _Readable_instances, flushReadable_fn).call(this);
      return false;
    }
    if (this.listenerCount("data")) this.emit("data", chunk);
    else this._opencontainersReadableBuffer.push(chunk);
    return true;
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
    this.on("end", () => {
      var _a2;
      return (_a2 = destination.end) == null ? void 0 : _a2.call(destination);
    });
    return destination;
  }
  pause() {
    return this;
  }
  resume() {
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
};
_Readable_instances = new WeakSet();
flushReadable_fn = function() {
  while (this._opencontainersReadableBuffer.length && this.listenerCount("data")) {
    this.emit("data", this._opencontainersReadableBuffer.shift());
  }
  if (this._opencontainersReadableEnded && !this._opencontainersReadableEndEmitted && this._opencontainersReadableBuffer.length === 0) {
    this._opencontainersReadableEndEmitted = true;
    this.emit("end");
    this.emit("close");
  }
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
      callback == null ? void 0 : callback();
      return true;
    } catch (error) {
      callback == null ? void 0 : callback(error);
      this.emit("error", error);
      return false;
    }
  }
  end(chunk, encoding, callback) {
    if (chunk !== void 0) this.write(chunk, encoding);
    this.emit("finish");
    this.emit("close");
    callback == null ? void 0 : callback();
  }
  destroy(error) {
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
  }
};
_write = new WeakMap();
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
    callback == null ? void 0 : callback();
    return true;
  }
  end(chunk, encoding, callback) {
    if (chunk !== void 0) this.write(chunk, encoding);
    this.emit("finish");
    this.emit("end");
    this.emit("close");
    callback == null ? void 0 : callback();
  }
};
_write2 = new WeakMap();
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
      callback == null ? void 0 : callback(error);
      this.emit("error", error);
      return;
    }
    if (output !== void 0 && output !== null) this.push(output);
    callback == null ? void 0 : callback();
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
    callback == null ? void 0 : callback();
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
          callback == null ? void 0 : callback(error);
          return;
        }
        if (output !== void 0 && output !== null) this.push(output);
        finish();
      });
    } catch (error) {
      this.emit("error", error);
      callback == null ? void 0 : callback(error);
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
function pipeline(...args) {
  var _a2, _b, _c, _d, _e;
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
    (_a2 = stream == null ? void 0 : stream.once) == null ? void 0 : _a2.call(stream, "error", finish);
  }
  for (let index = 0; index < streams.length - 1; index++) {
    (_c = (_b = streams[index]) == null ? void 0 : _b.pipe) == null ? void 0 : _c.call(_b, streams[index + 1]);
  }
  const last = streams.at(-1);
  (_d = last == null ? void 0 : last.once) == null ? void 0 : _d.call(last, "finish", () => finish());
  (_e = last == null ? void 0 : last.once) == null ? void 0 : _e.call(last, "close", () => finish());
  return last;
}
Stream.Stream = Stream;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.pipeline = pipeline;
var stream_default = Stream;

// packages/runtime-node/src/builtins/fs.js
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
function createFsBuiltin({ kernel, process }) {
  const resolve = (path) => resolvePath(process.cwd(), path);
  const fs = {
    readFileSync: (path, options) => kernel.fs.readFileSync(resolve(path), options),
    writeFileSync: (path, data, options) => kernel.fs.writeFileSync(resolve(path), data, options),
    appendFileSync: (path, data, options) => kernel.fs.appendFileSync(resolve(path), data, options),
    existsSync: (path) => kernel.fs.existsSync(resolve(path)),
    statSync: (path) => kernel.fs.statSync(resolve(path)),
    lstatSync: (path) => kernel.fs.lstatSync(resolve(path)),
    readdirSync: (path, options) => kernel.fs.readdirSync(resolve(path), options),
    mkdirSync: (path, options) => kernel.fs.mkdirSync(resolve(path), options),
    rmSync: (path, options) => kernel.fs.rmSync(resolve(path), options),
    rmdirSync: (path, options) => kernel.fs.rmdirSync(resolve(path), options),
    unlinkSync: (path) => kernel.fs.unlinkSync(resolve(path)),
    renameSync: (oldPath, newPath) => kernel.fs.renameSync(resolve(oldPath), resolve(newPath)),
    copyFileSync: (source, destination) => kernel.fs.copyFileSync(resolve(source), resolve(destination)),
    watch: (path, options, listener) => kernel.fs.watch(resolve(path), options, listener),
    watchFile: (path, options, listener) => {
      const resolved = resolve(path);
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
          stream.push(kernel.fs.readFileSync(resolve(path), options.encoding ? { encoding: options.encoding } : void 0));
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
        if (options.flags === "a") kernel.fs.appendFileSync(resolve(path), data);
        else kernel.fs.writeFileSync(resolve(path), data);
      };
      stream.once("finish", finish);
      return stream;
    },
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1
    }
  };
  fs.readFile = wrapCallback((path, options) => fs.readFileSync(path, options));
  fs.writeFile = wrapCallback((path, data, options) => fs.writeFileSync(path, data, options));
  fs.appendFile = wrapCallback((path, data, options) => fs.appendFileSync(path, data, options));
  fs.readdir = wrapCallback((path, options) => fs.readdirSync(path, options));
  fs.stat = wrapCallback((path) => fs.statSync(path));
  fs.mkdir = wrapCallback((path, options) => fs.mkdirSync(path, options));
  fs.rm = wrapCallback((path, options) => fs.rmSync(path, options));
  fs.rename = wrapCallback((oldPath, newPath) => fs.renameSync(oldPath, newPath));
  fs.promises = {
    readFile: async (path, options) => fs.readFileSync(path, options),
    writeFile: async (path, data, options) => fs.writeFileSync(path, data, options),
    appendFile: async (path, data, options) => fs.appendFileSync(path, data, options),
    exists: async (path) => fs.existsSync(path),
    stat: async (path) => fs.statSync(path),
    lstat: async (path) => fs.lstatSync(path),
    readdir: async (path, options) => fs.readdirSync(path, options),
    mkdir: async (path, options) => fs.mkdirSync(path, options),
    rm: async (path, options) => fs.rmSync(path, options),
    rename: async (oldPath, newPath) => fs.renameSync(oldPath, newPath),
    copyFile: async (source, destination) => fs.copyFileSync(source, destination),
    unlink: async (path) => fs.unlinkSync(path)
  };
  return fs;
}

// packages/runtime-node/src/builtins/path.js
var sep = "/";
var delimiter = ":";
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
  relative: relativePath
};
var path_default = {
  ...posix,
  posix
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
    callback == null ? void 0 : callback();
    return true;
  }
  clearScreenDown(callback) {
    callback == null ? void 0 : callback();
    return true;
  }
  cursorTo(x, y, callback) {
    if (typeof y === "function") y();
    else callback == null ? void 0 : callback();
    return true;
  }
  moveCursor(dx, dy, callback) {
    callback == null ? void 0 : callback();
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
var _prompt, _question;
var Interface = class extends EventEmitter {
  constructor(options = {}) {
    var _a2;
    super();
    __privateAdd(this, _prompt);
    __privateAdd(this, _question);
    this.input = options.input;
    this.output = options.output;
    this.terminal = Boolean(options.terminal);
    this.closed = false;
    this.line = "";
    __privateSet(this, _prompt, (_a2 = options.prompt) != null ? _a2 : "> ");
    __privateSet(this, _question, null);
  }
  setPrompt(prompt) {
    __privateSet(this, _prompt, String(prompt));
  }
  getPrompt() {
    return __privateGet(this, _prompt);
  }
  prompt() {
    var _a2, _b;
    (_b = (_a2 = this.output) == null ? void 0 : _a2.write) == null ? void 0 : _b.call(_a2, __privateGet(this, _prompt));
  }
  question(query, callback) {
    var _a2, _b;
    (_b = (_a2 = this.output) == null ? void 0 : _a2.write) == null ? void 0 : _b.call(_a2, query);
    __privateSet(this, _question, callback);
  }
  write(data) {
    const text = String(data);
    for (const char of text) {
      if (char === "\r") continue;
      if (char === "\n") {
        const line = this.line;
        this.line = "";
        if (__privateGet(this, _question)) {
          const callback = __privateGet(this, _question);
          __privateSet(this, _question, null);
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
function createInterface(options) {
  return new Interface(options);
}
function clearLine(stream, direction, callback) {
  var _a2, _b;
  return (_b = (_a2 = stream == null ? void 0 : stream.clearLine) == null ? void 0 : _a2.call(stream, direction, callback)) != null ? _b : true;
}
function clearScreenDown(stream, callback) {
  var _a2, _b;
  return (_b = (_a2 = stream == null ? void 0 : stream.clearScreenDown) == null ? void 0 : _a2.call(stream, callback)) != null ? _b : true;
}
function cursorTo(stream, x, y, callback) {
  var _a2, _b;
  return (_b = (_a2 = stream == null ? void 0 : stream.cursorTo) == null ? void 0 : _a2.call(stream, x, y, callback)) != null ? _b : true;
}
function moveCursor(stream, dx, dy, callback) {
  var _a2, _b;
  return (_b = (_a2 = stream == null ? void 0 : stream.moveCursor) == null ? void 0 : _a2.call(stream, dx, dy, callback)) != null ? _b : true;
}
var readline_default = {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor
};

// packages/runtime-node/src/builtins/process.js
var OPENCONTAINERS_NODE_VERSION = "26.0.0-opencontainers";
var OPENCONTAINERS_PROCESS_VERSION = `v${OPENCONTAINERS_NODE_VERSION}`;
var OPENCONTAINERS_V8_VERSION = "14.3.127.18-node.10";
var OPENCONTAINERS_VERSIONS = {
  node: OPENCONTAINERS_NODE_VERSION,
  v8: OPENCONTAINERS_V8_VERSION,
  modules: "144",
  napi: "10",
  opencontainers: "0.1.0"
};
function createProcessBuiltin({ descriptor, kernel }) {
  var _a2, _b, _c;
  const proc = new EventEmitter();
  proc.pid = descriptor.pid;
  proc.ppid = (_a2 = descriptor.ppid) != null ? _a2 : 0;
  proc.argv = [...descriptor.argv];
  proc.execPath = "/bin/node";
  proc.env = descriptor.env;
  proc.platform = "opencontainers";
  proc.arch = "wasm";
  proc.version = OPENCONTAINERS_PROCESS_VERSION;
  proc.versions = { ...OPENCONTAINERS_VERSIONS };
  Object.defineProperty(proc, "exitCode", {
    get: () => descriptor.exitCode,
    set: (code) => {
      descriptor.exitCode = Number(code) || 0;
    }
  });
  proc.stdin = descriptor.stdin;
  proc.stdout = descriptor.stdout;
  proc.stderr = descriptor.stderr;
  proc.cwd = () => descriptor.cwd;
  proc.chdir = (path) => {
    descriptor.cwd = kernel.resolvePath(descriptor.cwd, path);
    kernel.fs.statSync(descriptor.cwd);
  };
  proc.exit = (code = 0) => {
    throw Object.assign(new Error(`Process exited with code ${code}`), {
      code: "OPENCONTAINERS_PROCESS_EXIT",
      exitCode: Number(code) || 0
    });
  };
  proc.nextTick = (callback, ...args) => queueMicrotask(() => callback(...args));
  proc.kill = (pid, signal = "SIGTERM") => kernel.kill(pid, signal);
  proc.emitWarning = (warning) => descriptor.stderr.write(`${warning}
`);
  (_b = descriptor.refCount) != null ? _b : descriptor.refCount = 0;
  (_c = descriptor.cleanupTasks) != null ? _c : descriptor.cleanupTasks = /* @__PURE__ */ new Set();
  proc.__opencontainersAddRef = () => {
    descriptor.refCount++;
  };
  proc.__opencontainersUnref = () => {
    descriptor.refCount = Math.max(0, descriptor.refCount - 1);
    if (descriptor.refCount === 0) {
      queueMicrotask(() => {
        var _a3;
        if (descriptor.refCount === 0) (_a3 = descriptor.onIdle) == null ? void 0 : _a3.call(descriptor);
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
    var _a2;
    super();
    this.method = request.method;
    this.url = request.url;
    this.headers = Object.fromEntries((_a2 = request.headers) != null ? _a2 : []);
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
var _kernel, _process, _callback, _chunks, _ended, _ClientRequest_instances, dispatch_fn, dispatchVirtual_fn, dispatchExternal_fn;
var ClientRequest = class extends Writable {
  constructor({ kernel, process, secureDefault, options, callback }) {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
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
    this.method = (_a2 = options.method) != null ? _a2 : "GET";
    this.path = `${(_b = options.pathname) != null ? _b : "/"}${(_c = options.search) != null ? _c : ""}`;
    this.host = (_e = (_d = options.hostname) != null ? _d : options.host) != null ? _e : "localhost";
    this.port = Number((_f = options.port) != null ? _f : secureDefault ? 443 : 80);
    this.protocol = (_g = options.protocol) != null ? _g : secureDefault ? "https:" : "http:";
    this.headers = normalizeHeaders((_h = options.headers) != null ? _h : {});
    __privateSet(this, _kernel, kernel);
    __privateSet(this, _process, process);
    __privateSet(this, _callback, callback);
    __privateSet(this, _chunks, chunks);
    (_i = process.__opencontainersAddRef) == null ? void 0 : _i.call(process);
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
};
_kernel = new WeakMap();
_process = new WeakMap();
_callback = new WeakMap();
_chunks = new WeakMap();
_ended = new WeakMap();
_ClientRequest_instances = new WeakSet();
dispatch_fn = async function() {
  var _a2;
  try {
    const body = concatChunks(__privateGet(this, _chunks));
    const response = isVirtualLocalhost(this.host) ? await __privateMethod(this, _ClientRequest_instances, dispatchVirtual_fn).call(this, body) : await __privateMethod(this, _ClientRequest_instances, dispatchExternal_fn).call(this, body);
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
    queueMicrotask(() => {
      var _a3, _b;
      return (_b = (_a3 = __privateGet(this, _process)).__opencontainersUnref) == null ? void 0 : _b.call(_a3);
    });
  }
};
dispatchVirtual_fn = async function(body) {
  var _a2, _b, _c, _d;
  return __privateGet(this, _kernel).dispatchHttpRequest({
    id: (_c = (_b = (_a2 = globalThis.crypto) == null ? void 0 : _a2.randomUUID) == null ? void 0 : _b.call(_a2)) != null ? _c : Math.random().toString(16).slice(2),
    projectId: (_d = __privateGet(this, _process).env.OPENCONTAINERS_PROJECT_ID) != null ? _d : "default",
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
  if (__privateGet(this, _kernel).allowExternalNetwork !== true) {
    throw Object.assign(new Error(`External network request blocked: ${requestUrl.href}`), {
      code: "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED"
    });
  }
  const response = await fetch(requestUrl.href, {
    method: this.method,
    headers: this.headers,
    body: body.byteLength ? body : void 0
  });
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: new Uint8Array(await response.arrayBuffer())
  };
};
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
      for (const [name, value] of Object.entries(headers != null ? headers : {})) this.setHeader(name, value);
    } else {
      for (const [name, value] of Object.entries(statusMessageOrHeaders != null ? statusMessageOrHeaders : {})) this.setHeader(name, value);
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
    METHODS,
    STATUS_CODES,
    createServer(listener) {
      const server = new EventEmitter();
      if (listener) server.on("request", listener);
      server.listening = false;
      server.listen = (port = 0, hostOrCallback, maybeCallback) => {
        var _a2, _b;
        const callback = typeof hostOrCallback === "function" ? hostOrCallback : maybeCallback;
        const host = typeof hostOrCallback === "string" ? hostOrCallback : "0.0.0.0";
        const assignedPort = kernel.registerPort({
          projectId: (_a2 = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _a2 : "default",
          pid: process.pid,
          port,
          host,
          handler: async (request2) => new Promise((resolve) => {
            const req = new IncomingMessage(request2);
            const res = new ServerResponse(resolve);
            try {
              server.emit("request", req, res);
            } catch (error) {
              reportVirtualError(process, error);
              if (!res.writableEnded) resolve(virtualServerErrorResponse(error));
            }
          })
        });
        kernel.registerWebSocketServer({
          projectId: (_b = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _b : "default",
          port: assignedPort,
          handler: (socket, request2) => {
            var _a3;
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
              (_a3 = socket.close) == null ? void 0 : _a3.call(socket, 1011, "Unhandled virtual server error");
            }
          }
        });
        server.listening = true;
        server.address = () => ({ address: host, family: "IPv4", port: assignedPort });
        callback == null ? void 0 : callback();
        server.emit("listening");
        return server;
      };
      server.close = (callback) => {
        kernel.unregisterPortsForPid(process.pid);
        server.listening = false;
        callback == null ? void 0 : callback();
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
function createRequestFactory({ kernel, process, secureDefault }) {
  return (...args) => {
    const { options, callback } = normalizeRequestArgs(args, secureDefault);
    return new ClientRequest({ kernel, process, secureDefault, options, callback });
  };
}
function normalizeRequestArgs(args, secureDefault) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
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
  (_a2 = options.protocol) != null ? _a2 : options.protocol = secureDefault ? "https:" : "http:";
  (_c = options.hostname) != null ? _c : options.hostname = (_b = options.host) != null ? _b : "localhost";
  (_f = options.pathname) != null ? _f : options.pathname = (_e = (_d = options.path) == null ? void 0 : _d.split("?")[0]) != null ? _e : "/";
  (_h = options.search) != null ? _h : options.search = ((_g = options.path) == null ? void 0 : _g.includes("?")) ? `?${options.path.split("?").slice(1).join("?")}` : "";
  return { options, callback };
}
function normalizeHeaders(headers) {
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
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
function reportVirtualError(process, error) {
  var _a2, _b;
  try {
    (_b = (_a2 = process.stderr) == null ? void 0 : _a2.write) == null ? void 0 : _b.call(_a2, `${formatErrorForDiagnostics(error)}
`);
  } catch (_) {
  }
  process.exitCode = 1;
}
function virtualServerErrorResponse(error) {
  var _a2;
  const message = (_a2 = error == null ? void 0 : error.message) != null ? _a2 : String(error);
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
  var _a2, _b;
  return (_b = (_a2 = error == null ? void 0 : error.stack) != null ? _a2 : error == null ? void 0 : error.message) != null ? _b : String(error);
}
function isVirtualLocalhost(host) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(String(host));
}
function isDefaultPort(protocol, port) {
  return protocol === "http:" && Number(port) === 80 || protocol === "https:" && Number(port) === 443;
}
function isHostPageOrigin(url) {
  var _a2;
  const origin = (_a2 = globalThis.location) == null ? void 0 : _a2.origin;
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
      var _a2, _b;
      const options = normalizeListenArgs(args);
      const assignedPort = kernel.listenNet({
        projectId: (_a2 = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _a2 : "default",
        pid: process.pid,
        port: options.port,
        host: options.host,
        connectionListener: (socket) => {
          var _a3;
          this.connections++;
          (_a3 = __privateGet(this, _connectionListener)) == null ? void 0 : _a3.call(this, socket);
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
      (_b = options.callback) == null ? void 0 : _b.call(options);
      this.emit("listening");
      return this;
    }
    close(callback) {
      kernel.unregisterPortsForPid(process.pid);
      this.listening = false;
      callback == null ? void 0 : callback();
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
    var _a2, _b;
    const options = normalizeConnectArgs(args);
    const socket = kernel.connectNet({
      projectId: (_a2 = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _a2 : "default",
      port: options.port,
      host: options.host
    });
    (_b = process.__opencontainersAddRef) == null ? void 0 : _b.call(process);
    socket.once("close", () => {
      var _a3;
      return (_a3 = process.__opencontainersUnref) == null ? void 0 : _a3.call(process);
    });
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
  var _a2, _b, _c;
  let port = 0;
  let host = "0.0.0.0";
  let callback;
  if (typeof args[0] === "object") {
    port = (_a2 = args[0].port) != null ? _a2 : 0;
    host = (_b = args[0].host) != null ? _b : host;
    callback = args[1];
  } else {
    port = (_c = args[0]) != null ? _c : 0;
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: Number(port), host, callback };
}
function normalizeConnectArgs(args) {
  var _a2, _b;
  let port;
  let host = "127.0.0.1";
  let callback;
  if (typeof args[0] === "object") {
    port = args[0].port;
    host = (_b = (_a2 = args[0].host) != null ? _a2 : args[0].hostname) != null ? _b : host;
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

// packages/runtime-node/src/builtins/child_process.js
function childHandleFromVirtualProcess(virtualProcess) {
  const child = new EventEmitter();
  child.pid = virtualProcess.pid;
  child.stdin = new Writable({ write: (chunk) => virtualProcess.stdin.write(chunk) });
  child.stdout = new Readable();
  child.stderr = new Readable();
  virtualProcess.stdout.on("data", (chunk) => child.stdout.push(chunk));
  virtualProcess.stderr.on("data", (chunk) => child.stderr.push(chunk));
  virtualProcess.on("exit", (code, signal) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.stdout.push(null);
    child.stderr.push(null);
    child.emit("exit", code, signal);
    child.emit("close", code, signal);
  });
  virtualProcess.on("error", (error) => child.emit("error", error));
  child.kill = (signal = "SIGTERM") => virtualProcess.kill(signal);
  return child;
}
function createChildProcessBuiltin({ kernel, process }) {
  const spawn = (command, args = [], options = {}) => {
    var _a2, _b, _c, _d;
    if (kernel.allowChildProcesses === false) {
      throw Object.assign(new Error("Child process spawning is disabled for this project"), {
        code: "ERR_OPENCONTAINERS_CHILD_PROCESS_PERMISSION"
      });
    }
    (_a2 = process.__opencontainersAddRef) == null ? void 0 : _a2.call(process);
    const virtualProcess = kernel.spawn(command, args, {
      cwd: (_b = options.cwd) != null ? _b : process.cwd(),
      env: { ...process.env, ...(_c = options.env) != null ? _c : {} },
      projectId: (_d = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _d : "default",
      parentPid: process.pid
    });
    const child = childHandleFromVirtualProcess(virtualProcess);
    child.on("close", () => {
      var _a3;
      return (_a3 = process.__opencontainersUnref) == null ? void 0 : _a3.call(process);
    });
    child.on("error", () => {
      var _a3;
      return (_a3 = process.__opencontainersUnref) == null ? void 0 : _a3.call(process);
    });
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
      cb == null ? void 0 : cb(error, stdout, stderr);
    });
    return child;
  };
  const spawnSync = (command, args = [], options = {}) => {
    var _a2, _b, _c;
    return kernel.spawnSync(command, args, {
      cwd: (_a2 = options.cwd) != null ? _a2 : process.cwd(),
      env: { ...process.env, ...(_b = options.env) != null ? _b : {} },
      projectId: (_c = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _c : "default",
      parentPid: process.pid
    });
  };
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

// packages/runtime-node/src/builtins/timers.js
var nextTimerId = 1;
function createTimerApi({ process } = {}) {
  const setTimeoutCompat = (callback, delay = 0, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "timeout", process, callback, args, delay });
    handle.start();
    return handle;
  };
  const setIntervalCompat = (callback, delay = 0, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "interval", process, callback, args, delay, repeat: true });
    handle.start();
    return handle;
  };
  const setImmediateCompat = (callback, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "immediate", process, callback, args, delay: 0 });
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
      setImmediate: (value) => new Promise((resolve) => setImmediateCompat(() => resolve(value))),
      setInterval: async function* timersPromisesSetInterval(delay = 1, value) {
        while (true) {
          await new Promise((resolve) => setTimeoutCompat(resolve, delay));
          yield value;
        }
      },
      setTimeout: (delay = 1, value) => new Promise((resolve) => setTimeoutCompat(() => resolve(value), delay))
    }
  };
}
var OpenContainersTimerHandle = class {
  constructor({ kind, process, callback, args = [], delay = 0, repeat = false }) {
    var _a2, _b, _c, _d;
    this.kind = kind;
    this.process = process;
    this.callback = typeof callback === "function" ? callback : () => {
    };
    this.args = args;
    this.delay = Number(delay) || 0;
    this.repeat = repeat;
    this.id = nextTimerId++;
    this.active = true;
    this.refed = true;
    this.refreshedDuringCallback = false;
    (_b = (_a2 = this.process) == null ? void 0 : _a2.__opencontainersAddRef) == null ? void 0 : _b.call(_a2);
    this.disposeExitHook = (_d = (_c = this.process) == null ? void 0 : _c.__opencontainersOnExit) == null ? void 0 : _d.call(_c, () => this.close({ releaseRef: false }));
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
    var _a2, _b, _c, _d, _e, _f, _g;
    if (!this.active) return;
    if (((_b = (_a2 = this.process) == null ? void 0 : _a2.__opencontainersIsAlive) == null ? void 0 : _b.call(_a2)) === false) {
      this.close();
      return;
    }
    this.refreshedDuringCallback = false;
    try {
      this.callback(...this.args);
    } catch (error) {
      (_g = (_d = (_c = this.process) == null ? void 0 : _c.stderr) == null ? void 0 : _d.write) == null ? void 0 : _g.call(_d, `${(_f = (_e = error == null ? void 0 : error.stack) != null ? _e : error == null ? void 0 : error.message) != null ? _f : error}
`);
      this.process.exitCode = 1;
      this.close();
      return;
    }
    if (!this.repeat && !this.refreshedDuringCallback) this.close();
  }
  close({ releaseRef = true } = {}) {
    var _a2, _b, _c;
    if (!this.active) return;
    this.active = false;
    this.clearNativeHandle();
    (_a2 = this.disposeExitHook) == null ? void 0 : _a2.call(this);
    this.disposeExitHook = null;
    if (releaseRef && this.refed) {
      this.refed = false;
      (_c = (_b = this.process) == null ? void 0 : _b.__opencontainersUnref) == null ? void 0 : _c.call(_b);
    }
  }
  ref() {
    var _a2, _b;
    if (this.active && !this.refed) {
      this.refed = true;
      (_b = (_a2 = this.process) == null ? void 0 : _a2.__opencontainersAddRef) == null ? void 0 : _b.call(_a2);
    }
    return this;
  }
  unref() {
    var _a2, _b;
    if (this.active && this.refed) {
      this.refed = false;
      (_b = (_a2 = this.process) == null ? void 0 : _a2.__opencontainersUnref) == null ? void 0 : _b.call(_a2);
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
  var _specifier, _options, _parentPort, _workerPort, _abortController, _disposeExitHook, _exited, _terminated, _exitCode, _refed, _Worker_instances, start_fn, emitWorkerError_fn, forceTerminate_fn, finish_fn, _a2, _b;
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
      var _a3, _b2, _c;
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
      this.resourceLimits = (_a3 = options.resourceLimits) != null ? _a3 : {};
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
      (_b2 = process == null ? void 0 : process.__opencontainersAddRef) == null ? void 0 : _b2.call(process);
      __privateSet(this, _disposeExitHook, (_c = process == null ? void 0 : process.__opencontainersOnExit) == null ? void 0 : _c.call(process, () => {
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
      var _a3, _b2;
      if (__privateGet(this, _exited)) return Promise.resolve((_a3 = __privateGet(this, _exitCode)) != null ? _a3 : 0);
      __privateMethod(this, _Worker_instances, forceTerminate_fn).call(this, 1);
      return Promise.resolve((_b2 = __privateGet(this, _exitCode)) != null ? _b2 : 1);
    }
    ref() {
      var _a3;
      if (!__privateGet(this, _refed) && !__privateGet(this, _exited)) {
        __privateSet(this, _refed, true);
        (_a3 = process == null ? void 0 : process.__opencontainersAddRef) == null ? void 0 : _a3.call(process);
      }
      return this;
    }
    unref() {
      var _a3;
      if (__privateGet(this, _refed)) {
        __privateSet(this, _refed, false);
        (_a3 = process == null ? void 0 : process.__opencontainersUnref) == null ? void 0 : _a3.call(process);
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
    var _a3, _b2;
    if (__privateGet(this, _terminated) || __privateGet(this, _exited)) return;
    this.emit("online");
    try {
      await runWorkerSource(__privateGet(this, _specifier), {
        eval: __privateGet(this, _options).eval === true,
        filename: __privateGet(this, _options).name ? `[worker ${__privateGet(this, _options).name}].js` : `[worker ${this.threadId}].js`,
        parentPort: __privateGet(this, _workerPort),
        signal: (_a3 = __privateGet(this, _abortController)) == null ? void 0 : _a3.signal,
        threadId: this.threadId,
        type: __privateGet(this, _options).type,
        workerData: cloneMessage(__privateGet(this, _options).workerData)
      });
      if (!__privateGet(this, _terminated)) __privateMethod(this, _Worker_instances, finish_fn).call(this, 0);
    } catch (error) {
      if (__privateGet(this, _terminated)) return;
      if ((error == null ? void 0 : error.code) === "OPENCONTAINERS_PROCESS_EXIT") {
        __privateMethod(this, _Worker_instances, finish_fn).call(this, (_b2 = error.exitCode) != null ? _b2 : 0);
        return;
      }
      __privateMethod(this, _Worker_instances, emitWorkerError_fn).call(this, error);
      __privateMethod(this, _Worker_instances, finish_fn).call(this, 1);
    }
  };
  emitWorkerError_fn = function(error) {
    var _a3, _b2, _c, _d, _e, _f, _g, _h;
    if (this.listenerCount("error") > 0) {
      try {
        this.emit("error", error);
      } catch (emitError) {
        (_d = (_a3 = process == null ? void 0 : process.stderr) == null ? void 0 : _a3.write) == null ? void 0 : _d.call(_a3, `${(_c = (_b2 = emitError == null ? void 0 : emitError.stack) != null ? _b2 : emitError == null ? void 0 : emitError.message) != null ? _c : emitError}
`);
      }
      return;
    }
    (_h = (_e = process == null ? void 0 : process.stderr) == null ? void 0 : _e.write) == null ? void 0 : _h.call(_e, `${(_g = (_f = error == null ? void 0 : error.stack) != null ? _f : error == null ? void 0 : error.message) != null ? _g : error}
`);
  };
  forceTerminate_fn = function(code) {
    var _a3, _b2;
    if (__privateGet(this, _exited)) return;
    __privateSet(this, _terminated, true);
    (_b2 = (_a3 = __privateGet(this, _abortController)) == null ? void 0 : _a3.abort) == null ? void 0 : _b2.call(_a3);
    __privateGet(this, _parentPort).close();
    __privateGet(this, _workerPort).close();
    __privateMethod(this, _Worker_instances, finish_fn).call(this, code);
  };
  finish_fn = function(code) {
    var _a3, _b2;
    if (__privateGet(this, _exited)) return;
    __privateSet(this, _exited, true);
    __privateSet(this, _exitCode, Number(code) || 0);
    __privateGet(this, _workerPort).close();
    (_a3 = __privateGet(this, _disposeExitHook)) == null ? void 0 : _a3.call(this);
    __privateSet(this, _disposeExitHook, null);
    if (__privateGet(this, _refed)) {
      __privateSet(this, _refed, false);
      (_b2 = process == null ? void 0 : process.__opencontainersUnref) == null ? void 0 : _b2.call(process);
    }
    this.emit("exit", __privateGet(this, _exitCode));
  };
  const builtin = {
    Worker: Worker2,
    MessageChannel: RuntimeMessageChannel,
    MessagePort: RuntimeMessagePort,
    isMainThread,
    parentPort: (_a2 = workerContext == null ? void 0 : workerContext.parentPort) != null ? _a2 : null,
    receiveMessageOnPort,
    resourceLimits: {},
    SHARE_ENV: /* @__PURE__ */ Symbol.for("opencontainers.worker_threads.SHARE_ENV"),
    threadId: (_b = workerContext == null ? void 0 : workerContext.threadId) != null ? _b : 0,
    workerData: workerContext == null ? void 0 : workerContext.workerData,
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
    var _a2, _b;
    if (__privateGet(this, _closed) || !__privateGet(this, _peer2) || __privateGet(__privateGet(this, _peer2), _closed)) return;
    const cloned = cloneMessage(message);
    (_b = (_a2 = __privateGet(this, _process2)) == null ? void 0 : _a2.__opencontainersAddRef) == null ? void 0 : _b.call(_a2);
    queueMicrotask(() => {
      var _a3, _b2, _c;
      try {
        if (__privateGet(this, _peer2) && !__privateGet(__privateGet(this, _peer2), _closed)) __privateMethod(_a3 = __privateGet(this, _peer2), _MessagePort_instances, dispatchMessage_fn).call(_a3, cloned);
      } finally {
        (_c = (_b2 = __privateGet(this, _process2)) == null ? void 0 : _b2.__opencontainersUnref) == null ? void 0 : _c.call(_b2);
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
  var _a2;
  return (_a2 = port == null ? void 0 : port.__opencontainersReceiveMessage) == null ? void 0 : _a2.call(port);
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
    return `require(${JSON.stringify(specifier)});`;
  });
  transformed = transformed.replace(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, name, specifier) => {
    return `const ${name} = require(${JSON.stringify(specifier)});`;
  });
  transformed = transformed.replace(/^\s*import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, imports, specifier) => {
    return `const { ${normalizeImportBindings(imports)} } = require(${JSON.stringify(specifier)});`;
  });
  transformed = transformed.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s*,\s*{([^}]+)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, defaultName, imports, specifier) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return `const ${temp} = require(${JSON.stringify(specifier)});
const ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});
const { ${normalizeImportBindings(imports)} } = ${temp};`;
  });
  transformed = transformed.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, defaultName, specifier) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return `const ${temp} = require(${JSON.stringify(specifier)});
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
    return `const ${temp} = require(${JSON.stringify(specifier)});
${normalizeExportList(exportsList).map(({ local, exported }) => `exports[${JSON.stringify(exported)}] = ${temp}[${JSON.stringify(local)}];`).join("\n")}`;
  });
  transformed = transformed.replace(/^\s*export\s+\*\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, specifier) => {
    const temp = `__opencontainers_reexport_all_${Math.random().toString(16).slice(2)}`;
    return `const ${temp} = require(${JSON.stringify(specifier)});
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
        output += next != null ? next : "";
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
    return { local, exported: exported != null ? exported : local };
  });
}
function declaredVariableNames(declaration) {
  return declaration.split(",").map((part) => {
    var _a2;
    return (_a2 = part.trim().match(/^([A-Za-z_$][\w$]*)/)) == null ? void 0 : _a2[1];
  }).filter(Boolean);
}
function trimTrailingSemicolon(value) {
  return value.trim().replace(/;$/, "");
}

// packages/runtime-node/src/module-loader.js
var textDecoder2 = new TextDecoder();
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
  }
  createRequire(parentFilename = `${this.descriptor.cwd}/[repl].js`) {
    const require2 = (specifier) => this.require(specifier, parentFilename);
    require2.resolve = (specifier) => this.resolve(specifier, parentFilename);
    require2.cache = this.cache;
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
    const source = this.kernel.fs.readFileSync(resolved, "utf8");
    const executableSource = this.shouldTransformEsm(resolved, source) ? transformEsmToCjs(source, { filename: resolved }) : source;
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
    const source = this.kernel.fs.readFileSync(resolved, "utf8");
    const executableSource = this.shouldTransformEsm(resolved, source) ? transformEsmToCjs(source, { filename: resolved }) : source;
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
      this.fetch,
      (childSpecifier) => this.dynamicImport(childSpecifier, resolved)
    );
    return module.exports;
  }
  get process() {
    if (!__privateGet(this, _process3)) {
      __privateSet(this, _process3, createProcessBuiltin({ descriptor: this.descriptor, kernel: this.kernel }));
    }
    return __privateGet(this, _process3);
  }
  get fetch() {
    if (!__privateGet(this, _fetch)) __privateSet(this, _fetch, createRuntimeFetch({ kernel: this.kernel, process: this.process }));
    return __privateGet(this, _fetch);
  }
  get timers() {
    if (!__privateGet(this, _timers)) __privateSet(this, _timers, createTimerApi({ process: this.process }));
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
    if (name === "path") return path_default;
    if (name === "process") return this.process;
    if (name === "events") return events_default;
    if (name === "stream") return stream_default;
    if (name === "tty") return tty_default;
    if (name === "readline") return readline_default;
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
    var _a2, _b;
    (_b = (_a2 = this.process).__opencontainersAddRef) == null ? void 0 : _b.call(_a2);
    const promise = Promise.resolve().then(() => this.import(specifier, parentFilename));
    promise.finally(() => queueMicrotask(() => {
      var _a3, _b2;
      return (_b2 = (_a3 = this.process).__opencontainersUnref) == null ? void 0 : _b2.call(_a3);
    }));
    return promise;
  }
  async runWorkerSource(specifier, options = {}) {
    var _a2, _b, _c, _d, _e;
    const workerDescriptor = {
      pid: this.descriptor.pid,
      ppid: this.descriptor.pid,
      cwd: this.descriptor.cwd,
      argv: ["node", (_a2 = options.filename) != null ? _a2 : "[worker].js"],
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
      if ((_b = options.signal) == null ? void 0 : _b.aborted) return;
      if (options.eval) {
        const filename = resolvePath(this.descriptor.cwd, (_d = options.filename) != null ? _d : `[worker-${(_c = options.threadId) != null ? _c : "eval"}].js`);
        await workerLoader.evaluateWorkerSource(String(specifier != null ? specifier : ""), filename, { type: options.type });
      } else {
        const parentFilename = resolvePath(this.descriptor.cwd, "[worker-entry].js");
        const filename = workerLoader.resolve(String(specifier), parentFilename);
        await workerLoader.import(filename, parentFilename);
      }
      await waitForWorkerIdle(workerDescriptor, options.signal);
    } finally {
      workerDescriptor.status = ((_e = options.signal) == null ? void 0 : _e.aborted) ? "killed" : "exited";
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
      this.fetch,
      (specifier) => this.dynamicImport(specifier, filename)
    );
    return module.exports;
  }
  createCryptoBuiltin() {
    const randomBytes = (size, callback) => {
      var _a2, _b, _c, _d;
      const bytes = new Uint8Array(size);
      (_b = (_a2 = globalThis.crypto) == null ? void 0 : _a2.getRandomValues) == null ? void 0 : _b.call(_a2, bytes);
      const buffer = RuntimeBuffer.from(bytes);
      if (typeof callback === "function") {
        (_d = (_c = this.process).__opencontainersAddRef) == null ? void 0 : _d.call(_c);
        queueMicrotask(() => {
          var _a3, _b2, _c2, _d2, _e, _f, _g, _h;
          try {
            if (((_b2 = (_a3 = this.process).__opencontainersIsAlive) == null ? void 0 : _b2.call(_a3)) !== false) callback(null, buffer);
          } catch (error) {
            (_f = (_c2 = this.process.stderr) == null ? void 0 : _c2.write) == null ? void 0 : _f.call(_c2, `${(_e = (_d2 = error == null ? void 0 : error.stack) != null ? _d2 : error == null ? void 0 : error.message) != null ? _e : error}
`);
            this.process.exitCode = 1;
          } finally {
            (_h = (_g = this.process).__opencontainersUnref) == null ? void 0 : _h.call(_g);
          }
        });
        return void 0;
      }
      return buffer;
    };
    return {
      randomUUID: () => {
        var _a2, _b, _c;
        return (_c = (_b = (_a2 = globalThis.crypto) == null ? void 0 : _a2.randomUUID) == null ? void 0 : _b.call(_a2)) != null ? _c : `opencontainers-${Math.random().toString(16).slice(2)}`;
      },
      randomBytes,
      createHash: (algorithm) => {
        const chunks = [];
        return {
          update(chunk) {
            chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
            return this;
          },
          digest(encoding) {
            const total = chunks.reduce((sum, chunk) => sum + chunk.reduce((inner, byte) => inner + byte >>> 0, 0), 0);
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
          } catch (e) {
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
  packageEntry(pkg, subpath = ".") {
    var _a2, _b, _c, _d;
    if (typeof pkg.exports === "string") return subpath === "." ? pkg.exports : null;
    if (pkg.exports && typeof pkg.exports === "object") {
      const exact = (_b = (_a2 = pkg.exports[subpath]) != null ? _a2 : subpath === "." ? pkg.exports["."] : void 0) != null ? _b : subpath === "." && this.isConditionalExportObject(pkg.exports) ? pkg.exports : void 0;
      const matched = exact != null ? exact : this.matchPackageExportPattern(pkg.exports, subpath);
      const resolved = this.resolvePackageExportTarget(matched);
      if (resolved) return resolved;
      if (subpath !== ".") return null;
    }
    return (_d = (_c = pkg.main) != null ? _c : pkg.module) != null ? _d : "index.js";
  }
  matchPackageExportPattern(exportsMap, subpath) {
    for (const [key, value] of Object.entries(exportsMap)) {
      if (!key.includes("*")) continue;
      const [prefix, suffix] = key.split("*");
      if (subpath.startsWith(prefix) && subpath.endsWith(suffix != null ? suffix : "")) {
        const wildcard = subpath.slice(prefix.length, subpath.length - (suffix != null ? suffix : "").length);
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
        } catch (e) {
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
  return String(specifier).replace(/[?#].*$/, "");
}
function waitForWorkerIdle(descriptor, signal) {
  var _a2;
  if (((_a2 = descriptor.refCount) != null ? _a2 : 0) === 0 || (signal == null ? void 0 : signal.aborted)) return Promise.resolve();
  return new Promise((resolve) => {
    var _a3;
    const previousOnIdle = descriptor.onIdle;
    const finish = () => {
      var _a4;
      if (descriptor.onIdle === onIdle) descriptor.onIdle = previousOnIdle;
      (_a4 = signal == null ? void 0 : signal.removeEventListener) == null ? void 0 : _a4.call(signal, "abort", finish);
      resolve();
    };
    const onIdle = () => {
      var _a4;
      previousOnIdle == null ? void 0 : previousOnIdle();
      if (((_a4 = descriptor.refCount) != null ? _a4 : 0) === 0) finish();
    };
    descriptor.onIdle = onIdle;
    (_a3 = signal == null ? void 0 : signal.addEventListener) == null ? void 0 : _a3.call(signal, "abort", finish, { once: true });
  });
}
function cleanupWorkerDescriptor(descriptor) {
  var _a2, _b;
  const cleanupTasks = [...(_a2 = descriptor.cleanupTasks) != null ? _a2 : []];
  (_b = descriptor.cleanupTasks) == null ? void 0 : _b.clear();
  descriptor.refCount = 0;
  descriptor.onIdle = null;
  for (const cleanup of cleanupTasks) {
    try {
      cleanup();
    } catch (_) {
    }
  }
}
function createUtilBuiltin({ console, promisify }) {
  const util = {
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
        var _a2;
        if (!warned) {
          warned = true;
          const warning = code ? `${code}: ${message}` : message;
          (_a2 = console == null ? void 0 : console.warn) == null ? void 0 : _a2.call(console, warning);
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
      isArrayBuffer: (value) => value instanceof ArrayBuffer,
      isAnyArrayBuffer: (value) => value instanceof ArrayBuffer || value instanceof SharedArrayBuffer,
      isAsyncFunction: (value) => {
        var _a2;
        return ((_a2 = value == null ? void 0 : value.constructor) == null ? void 0 : _a2.name) === "AsyncFunction";
      },
      isDate: (value) => value instanceof Date,
      isMap: (value) => value instanceof Map,
      isNativeError: (value) => value instanceof Error,
      isPromise: (value) => value && typeof value.then === "function",
      isRegExp: (value) => value instanceof RegExp,
      isSet: (value) => value instanceof Set,
      isTypedArray: (value) => ArrayBuffer.isView(value) && !(value instanceof DataView),
      isUint8Array: (value) => value instanceof Uint8Array
    }
  };
  util.promisify.custom = /* @__PURE__ */ Symbol.for("nodejs.util.promisify.custom");
  return util;
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
  var _a2;
  if (typeof value === "string") return value;
  if (typeof value === "function") return `[Function${value.name ? `: ${value.name}` : ""}]`;
  if (value instanceof Error) return (_a2 = value.stack) != null ? _a2 : `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, (options == null ? void 0 : options.compact) === false ? 2 : 0);
  } catch (_) {
    return String(value);
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
  return Object.entries(object != null ? object : {}).flatMap(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => `${encodeURIComponent(key)}${equals}${encodeURIComponent(item != null ? item : "")}`);
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
function createRuntimeFetch({ kernel, process }) {
  return async function openContainersFetch(input, init = {}) {
    var _a2, _b, _c, _d, _e;
    const request = normalizeFetchRequest(input, init);
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      if (typeof globalThis.fetch !== "function") throw new Error(`Unsupported fetch protocol: ${url.protocol}`);
      return globalThis.fetch(input, init);
    }
    if (isVirtualFetchHost(url.hostname)) {
      const response = await kernel.dispatchHttpRequest({
        id: (_c = (_b = (_a2 = globalThis.crypto) == null ? void 0 : _a2.randomUUID) == null ? void 0 : _b.call(_a2)) != null ? _c : Math.random().toString(16).slice(2),
        projectId: (_d = process.env.OPENCONTAINERS_PROJECT_ID) != null ? _d : "default",
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
      throw Object.assign(new Error(`External fetch failed for ${url.href}: ${(_e = error == null ? void 0 : error.message) != null ? _e : error}. Browser CORS and network restrictions still apply in OpenContainers.`), {
        code: "ERR_OPENCONTAINERS_EXTERNAL_FETCH_FAILED",
        cause: error
      });
    }
  };
}
function normalizeFetchRequest(input, init = {}) {
  var _a2, _b, _c, _d;
  const url = typeof input === "string" || input instanceof URL ? String(input) : input == null ? void 0 : input.url;
  if (!url) throw new TypeError("fetch requires a URL");
  const method = String((_b = (_a2 = init.method) != null ? _a2 : input == null ? void 0 : input.method) != null ? _b : "GET").toUpperCase();
  const headers = normalizeFetchHeaders((_c = init.headers) != null ? _c : input == null ? void 0 : input.headers);
  const body = method === "GET" || method === "HEAD" ? void 0 : (_d = init.body) != null ? _d : input == null ? void 0 : input.body;
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
  var _a2, _b, _c, _d;
  return new Response((_a2 = response.body) != null ? _a2 : "", {
    status: (_b = response.status) != null ? _b : 200,
    statusText: (_c = response.statusText) != null ? _c : "OK",
    headers: (_d = response.headers) != null ? _d : []
  });
}
function isVirtualFetchHost(hostname) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(hostname);
}
function isHostPageOrigin2(url) {
  var _a2;
  const origin = (_a2 = globalThis.location) == null ? void 0 : _a2.origin;
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
      stream.write(`${args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ")}
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
    var _a2, _b, _c, _d;
    try {
      if (args[0] === "-e") {
        const source = (_a2 = args[1]) != null ? _a2 : "";
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }
      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
      this.descriptor.cwd = dirname(filename);
      await this.loader.import(filename, `${dirname(filename)}/[entry].js`);
      return (_b = this.loader.process.exitCode) != null ? _b : 0;
    } catch (error) {
      if ((error == null ? void 0 : error.code) === "OPENCONTAINERS_PROCESS_EXIT") return error.exitCode;
      this.descriptor.stderr.write(`${(_d = (_c = error.stack) != null ? _c : error.message) != null ? _d : error}
`);
      return 1;
    }
  }
  executeSync(args) {
    var _a2, _b, _c;
    try {
      if (args[0] === "-e") {
        const source = (_a2 = args[1]) != null ? _a2 : "";
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }
      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
      this.descriptor.cwd = dirname(filename);
      this.loader.require(filename, `${dirname(filename)}/[entry].js`);
      return 0;
    } catch (error) {
      if ((error == null ? void 0 : error.code) === "OPENCONTAINERS_PROCESS_EXIT") return error.exitCode;
      this.descriptor.stderr.write(`${(_c = (_b = error.stack) != null ? _b : error.message) != null ? _c : error}
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

// packages/kernel/src/OutputStream.js
var OutputStream = class extends EventEmitter {
  constructor() {
    super();
    this.chunks = [];
  }
  write(chunk) {
    const bytes = typeof chunk === "string" ? RuntimeBuffer.from(chunk) : RuntimeBuffer.from(chunk);
    this.chunks.push(bytes);
    this.emit("data", bytes);
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
    var _a2, _b;
    if (!message || typeof message !== "object") return;
    try {
      switch (message.type) {
        case "boot":
          this.boot(message.descriptor);
          this.reply(message.id, { ok: true, pid: this.descriptor.pid });
          break;
        case "run":
          await this.run(message.id, (_a2 = message.args) != null ? _a2 : this.descriptor.argv.slice(1));
          break;
        case "signal":
          this.signal((_b = message.signal) != null ? _b : "SIGTERM");
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
    var _a2;
    if (!this.kernel) {
      throw Object.assign(new Error("ProcessWorkerHost requires a kernel binding before boot"), {
        code: "ERR_OPENCONTAINERS_PROCESS_WORKER_KERNEL_MISSING"
      });
    }
    this.descriptor = {
      ...descriptor,
      env: { ...(_a2 = descriptor.env) != null ? _a2 : {} },
      stdout: this.stream("stdout"),
      stderr: this.stream("stderr"),
      stdin: this.stream("stdin"),
      status: "starting"
    };
    this.runtime = new NodeRuntime({ kernel: this.kernel, descriptor: this.descriptor });
  }
  async run(id, args) {
    var _a2, _b;
    if (!this.runtime) throw new Error("Process worker has not booted");
    this.descriptor.status = "running";
    this.running = this.runtime.execute(args);
    let status = await this.running;
    if ((status != null ? status : 0) === 0 && this.shouldStayAlive()) {
      status = await new Promise((resolve) => {
        this.descriptor.onIdle = () => {
          var _a3, _b2;
          if (!this.shouldStayAlive()) {
            this.descriptor.onIdle = null;
            resolve((_b2 = (_a3 = this.descriptor.exitCode) != null ? _a3 : status) != null ? _b2 : 0);
          }
        };
      });
    }
    status = (_b = (_a2 = this.descriptor.exitCode) != null ? _a2 : status) != null ? _b : 0;
    this.descriptor.status = "exited";
    this.runCleanupTasks();
    this.postMessage({ type: "exit", requestId: id, pid: this.descriptor.pid, status });
    this.reply(id, { ok: true, status });
  }
  shouldStayAlive() {
    var _a2, _b, _c, _d, _e, _f;
    return Boolean(
      ((_c = (_b = (_a2 = this.kernel) == null ? void 0 : _a2.portManager) == null ? void 0 : _b.hasPid) == null ? void 0 : _c.call(_b, this.descriptor.pid)) || ((_f = (_e = (_d = this.kernel) == null ? void 0 : _d.net) == null ? void 0 : _e.hasPid) == null ? void 0 : _f.call(_e, this.descriptor.pid)) || this.descriptor.refCount > 0
    );
  }
  signal(signal) {
    if (!this.descriptor) return;
    this.descriptor.status = "killed";
    this.runCleanupTasks();
    this.postMessage({ type: "signal", pid: this.descriptor.pid, signal });
  }
  runCleanupTasks() {
    var _a2, _b, _c, _d;
    const cleanupTasks = [...(_b = (_a2 = this.descriptor) == null ? void 0 : _a2.cleanupTasks) != null ? _b : []];
    (_d = (_c = this.descriptor) == null ? void 0 : _c.cleanupTasks) == null ? void 0 : _d.clear();
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
        var _a2;
        this.postMessage({
          type: "stream",
          pid: (_a2 = this.descriptor) == null ? void 0 : _a2.pid,
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
    var _a2, _b;
    const transport = this.workerFactory({ kernel: this.kernel, process });
    const pending = /* @__PURE__ */ new Map();
    let exitStatus = null;
    transport.onMessage((message) => {
      var _a3, _b2, _c;
      if (message.type === "stream") {
        const target = message.stream === "stderr" ? process.stderr : process.stdout;
        target.write((_a3 = message.chunk) != null ? _a3 : "");
        return;
      }
      if (message.type === "exit") {
        exitStatus = (_b2 = message.status) != null ? _b2 : 0;
        return;
      }
      if (message.type !== "reply") return;
      const resolver = pending.get(message.requestId);
      if (!resolver) return;
      pending.delete(message.requestId);
      if (((_c = message.payload) == null ? void 0 : _c.ok) === false) resolver.reject(deserializeError(message.payload.error));
      else resolver.resolve(message.payload);
    });
    const request = (type, payload = {}) => {
      const id = `process-worker-${this.nextRequestId++}`;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        transport.postMessage({ id, type, ...payload });
      });
    };
    try {
      await request("boot", { descriptor: serializeDescriptor(process.descriptor) });
      const result = await request("run", { args });
      return (_a2 = exitStatus != null ? exitStatus : result.status) != null ? _a2 : 0;
    } finally {
      (_b = transport.terminate) == null ? void 0 : _b.call(transport);
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
  var _a2;
  return Object.assign(new Error((_a2 = error == null ? void 0 : error.message) != null ? _a2 : "Process worker request failed"), error != null ? error : {});
}

// packages/kernel/src/VirtualProcess.js
var _resolveCompleted;
var VirtualProcess = class extends EventEmitter {
  constructor(descriptor) {
    super();
    __privateAdd(this, _resolveCompleted);
    this.pid = descriptor.pid;
    this.descriptor = descriptor;
    this.stdin = new OutputStream();
    this.stdout = descriptor.stdout;
    this.stderr = descriptor.stderr;
    this.exitCode = null;
    this.signalCode = null;
    this.completed = new Promise((resolve) => {
      __privateSet(this, _resolveCompleted, resolve);
    });
  }
  finish(code = 0, signal = null) {
    var _a2, _b;
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.descriptor.status = "exited";
    const cleanupTasks = [...(_a2 = this.descriptor.cleanupTasks) != null ? _a2 : []];
    (_b = this.descriptor.cleanupTasks) == null ? void 0 : _b.clear();
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
    var _a2, _b;
    this.stderr.write(`${(_b = (_a2 = error.stack) != null ? _a2 : error.message) != null ? _b : error}
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
var _ProcessManager_instances, run_fn, runSync_fn;
var ProcessManager = class {
  constructor({ kernel, processWorkerBackend, processWorkerFactory }) {
    __privateAdd(this, _ProcessManager_instances);
    this.kernel = kernel;
    this.nextPid = 100;
    this.processes = /* @__PURE__ */ new Map();
    this.processWorkerBackend = processWorkerBackend != null ? processWorkerBackend : processWorkerFactory ? new ProcessWorkerBackend({ kernel, workerFactory: processWorkerFactory }) : null;
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
      process.finish(status != null ? status : 0);
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
    var _a2, _b, _c, _d, _e;
    const descriptor = {
      pid: this.nextPid++,
      ppid: options.parentPid,
      cwd: (_a2 = options.cwd) != null ? _a2 : "/workspace",
      argv: [command, ...args],
      env: { ...(_b = options.env) != null ? _b : {} },
      status: "starting",
      stdin: new OutputStream(),
      stdout: new OutputStream(),
      stderr: new OutputStream(),
      projectId: (_c = options.projectId) != null ? _c : "default"
    };
    (_e = (_d = descriptor.env).OPENCONTAINERS_PROJECT_ID) != null ? _e : _d.OPENCONTAINERS_PROJECT_ID = descriptor.projectId;
    return descriptor;
  }
  resolveCommand(command, cwd) {
    if (command === "node") return { type: "node" };
    if (command === "npm" || command === "npx") return { type: "npm" };
    if (command === "sh") return { type: "shell" };
    const shimPath = resolvePath(cwd, `node_modules/.bin/${command}`);
    if (this.kernel.fs.existsSync(shimPath)) {
      const shim = JSON.parse(this.kernel.fs.readFileSync(shimPath, "utf8"));
      if (shim.type === "node-bin") return shim;
    }
    const binPath = `/workspace/node_modules/.bin/${command}`;
    if (this.kernel.fs.existsSync(binPath)) {
      const shim = JSON.parse(this.kernel.fs.readFileSync(binPath, "utf8"));
      if (shim.type === "node-bin") return shim;
    }
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) return { type: "builtin", run: builtin };
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
    const resolved = this.resolveCommand(command, process.descriptor.cwd);
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
      status = await this.kernel.npmCommand.run(args, process.descriptor);
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
      status = await resolved.run(args, process.descriptor);
    } else {
      throw Object.assign(new Error(`Unsupported command: ${command}`), { code: "ENOENT" });
    }
    const finalStatus = () => {
      var _a2, _b;
      return (_b = (_a2 = process.descriptor.exitCode) != null ? _a2 : status) != null ? _b : 0;
    };
    if ((status != null ? status : 0) === 0 && (this.kernel.portManager.hasPid(process.pid) || this.kernel.net.hasPid(process.pid) || process.descriptor.refCount > 0)) {
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
  const resolved = this.resolveCommand(command, process.descriptor.cwd);
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
    const result = resolved.run(args, process.descriptor);
    if (result && typeof result.then === "function") {
      throw Object.assign(new Error(`Command ${command} cannot run synchronously`), {
        code: "ERR_OPENCONTAINERS_SYNC_COMMAND_UNSUPPORTED"
      });
    }
    return result != null ? result : 0;
  }
  throw Object.assign(new Error(`Unsupported sync command: ${command}`), { code: "ENOENT" });
};

// packages/kernel/src/PtyManager.js
var PtySession = class extends EventEmitter {
  constructor({ id, kernel, cwd = "/workspace", env = {}, projectId = "default", cols = 80, rows = 24 }) {
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
    this.foregroundPid = null;
    this.closed = false;
    this.lastCommand = Promise.resolve({ status: 0 });
  }
  write(data) {
    if (this.closed) return;
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    for (const char of text) {
      if (char === "") {
        this.interrupt();
        continue;
      }
      if (char === "") {
        this.close();
        continue;
      }
      if (char === "\r" || char === "\n") {
        const commandLine = this.inputBuffer.trim();
        this.inputBuffer = "";
        this.emitData("\r\n");
        if (commandLine) this.runLine(commandLine);
        continue;
      }
      this.inputBuffer += char;
      this.emitData(char);
    }
  }
  runLine(commandLine) {
    const process = this.kernel.spawn("sh", ["-c", commandLine], {
      cwd: this.cwd,
      env: this.env,
      projectId: this.projectId
    });
    this.foregroundPid = process.pid;
    process.stdout.on("data", (chunk) => this.emitData(chunk));
    process.stderr.on("data", (chunk) => this.emitData(chunk));
    this.lastCommand = process.completed.then((result) => {
      if (this.foregroundPid === process.pid) this.foregroundPid = null;
      if (result.signal) this.emitData(`\r
[${result.signal}]\r
`);
      return result;
    });
    return process;
  }
  interrupt() {
    this.emitData("^C\r\n");
    if (this.foregroundPid !== null) {
      this.kernel.killTree(this.foregroundPid, "SIGINT");
      this.foregroundPid = null;
    }
  }
  resize({ cols, rows }) {
    if (cols) this.env.COLUMNS = String(cols);
    if (rows) this.env.LINES = String(rows);
    this.emit("resize", { cols: Number(this.env.COLUMNS), rows: Number(this.env.LINES) });
  }
  close() {
    if (this.closed) return;
    if (this.foregroundPid !== null) this.kernel.killTree(this.foregroundPid, "SIGHUP");
    this.closed = true;
    this.emit("close");
  }
  async waitForIdle() {
    return this.lastCommand;
  }
  emitData(chunk) {
    this.emit("data", chunk);
  }
};
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

// packages/kernel/src/SyscallRouter.js
var SyscallRouter = class {
  constructor({ kernel }) {
    this.kernel = kernel;
  }
  async handle(request, descriptor = { cwd: "/workspace", env: {}, projectId: "default" }) {
    var _a2, _b, _c, _d, _e, _f;
    switch (request.op) {
      case "fs.readFileSync":
        return this.kernel.fs.readFileSync(resolvePath(descriptor.cwd, request.path), request.encoding);
      case "fs.writeFileSync":
        this.kernel.fs.writeFileSync(resolvePath(descriptor.cwd, request.path), (_a2 = request.data) != null ? _a2 : "", request.options);
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
        const child = this.kernel.spawn(request.command, (_b = request.args) != null ? _b : [], {
          cwd: (_d = (_c = request.options) == null ? void 0 : _c.cwd) != null ? _d : descriptor.cwd,
          env: { ...descriptor.env, ...(_f = (_e = request.options) == null ? void 0 : _e.env) != null ? _f : {} },
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
      var _a2, _b;
      if (((_a2 = this.peer) == null ? void 0 : _a2.readyState) === _VirtualWebSocketEndpoint.OPEN) {
        __privateMethod(_b = this.peer, _VirtualWebSocketEndpoint_instances, emitDom_fn).call(_b, "message", { type: "message", data });
      }
    });
  }
  close(code = 1e3, reason = "") {
    if (this.readyState === _VirtualWebSocketEndpoint.CLOSED) return;
    this.readyState = _VirtualWebSocketEndpoint.CLOSING;
    queueMicrotask(() => {
      var _a2;
      this.readyState = _VirtualWebSocketEndpoint.CLOSED;
      __privateMethod(this, _VirtualWebSocketEndpoint_instances, emitDom_fn).call(this, "close", { type: "close", code, reason, wasClean: true });
      if (((_a2 = this.peer) == null ? void 0 : _a2.readyState) !== _VirtualWebSocketEndpoint.CLOSED) {
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
    var _a2;
    const handler = this.handlers.get(__privateMethod(this, _WebSocketManager_instances, key_fn3).call(this, projectId, port));
    if (!handler) {
      throw Object.assign(new Error(`No virtual WebSocket server is listening on ${projectId}:${port}`), {
        code: "ERR_OPENCONTAINERS_WS_SERVER_MISSING"
      });
    }
    const protocol = Array.isArray(protocols) ? (_a2 = protocols[0]) != null ? _a2 : "" : protocols != null ? protocols : "";
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
  constructor({ fs = new VirtualFileSystem(), registryClient, allowInstallScripts = false, processWorkerFactory, processWorkerBackend } = {}) {
    this.fs = fs;
    this.allowInstallScripts = allowInstallScripts;
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
    this.commandBuiltins.set("pwd", async (_args, descriptor) => {
      descriptor.stdout.write(`${descriptor.cwd}
`);
      return 0;
    });
    this.commandBuiltins.set("echo", async (args, descriptor) => {
      descriptor.stdout.write(`${args.join(" ")}
`);
      return 0;
    });
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
    var _a2, _b, _c;
    for (const entry of this.portManager.ports.values()) {
      if (entry.pid === pid) {
        this.webSockets.unregister({ projectId: entry.projectId, port: entry.port });
      }
    }
    this.portManager.unregisterForPid(pid);
    this.net.unregisterForPid(pid);
    (_c = (_a2 = this.processManager.processes.get(pid)) == null ? void 0 : (_b = _a2.descriptor).onIdle) == null ? void 0 : _c.call(_b);
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
var textDecoder3 = new TextDecoder();
var _OpenContainer_instances, handlePortRegister_fn, handlePortUnregister_fn, previewUrl_fn, connectServiceWorker_fn, handleServiceWorkerMessage_fn, writeWorkspaceFile_fn, clearWorkspacePreservingNodeModules_fn, emit_fn2;
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
    return () => {
      var _a2;
      return (_a2 = this.listeners.get(eventName)) == null ? void 0 : _a2.delete(listener);
    };
  }
  async mount(tree = {}) {
    __privateMethod(this, _OpenContainer_instances, clearWorkspacePreservingNodeModules_fn).call(this);
    const files = flattenWebContainerTree(tree);
    for (const [path, contents] of Object.entries(files)) {
      __privateMethod(this, _OpenContainer_instances, writeWorkspaceFile_fn).call(this, path, contents);
    }
  }
  async spawn(command, args = [], options = {}) {
    var _a2;
    if (command === "node" && (args[0] === "-v" || args[0] === "--version")) {
      return syntheticProcess("v26.0.0-opencontainers\n");
    }
    const normalized = normalizeSpawn(command, args);
    const process = this.kernel.spawn(normalized.command, normalized.args, {
      cwd: WORKSPACE_ROOT,
      env: {
        OPENCONTAINERS_PROJECT_ID: this.projectId,
        ...(_a2 = options.env) != null ? _a2 : {}
      },
      projectId: this.projectId
    });
    this.processes.add(process);
    process.completed.finally(() => this.processes.delete(process));
    return new OpenContainerProcess({ container: this, process });
  }
  teardown() {
    var _a2, _b;
    for (const process of [...this.processes]) {
      process.kill("SIGTERM");
    }
    this.processes.clear();
    (_b = (_a2 = this.serviceWorkerPort) == null ? void 0 : _a2.close) == null ? void 0 : _b.call(_a2);
    this.serviceWorkerPort = null;
    this.listeners.clear();
  }
  async dispatchPreviewRequest(request) {
    var _a2, _b, _c, _d, _e;
    const preview = parsePreviewRequest(request, this.previewBasePath, this.projectId);
    const response = await this.kernel.dispatchHttpRequest({
      id: (_a2 = request.id) != null ? _a2 : randomId(),
      projectId: (_c = (_b = preview.projectId) != null ? _b : request.projectId) != null ? _c : this.projectId,
      port: preview.port,
      method: (_d = request.method) != null ? _d : "GET",
      url: `${preview.path}${preview.search}`,
      headers: (_e = request.headers) != null ? _e : [],
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
  var _a2;
  const path = `${this.previewBasePath}/${encodeURIComponent(this.projectId)}:${port}/`;
  if (typeof window !== "undefined" && ((_a2 = window.location) == null ? void 0 : _a2.origin)) {
    return new URL(path, window.location.origin).toString();
  }
  return `https://run.opencontainers.local${path}`;
};
connectServiceWorker_fn = async function() {
  var _a2, _b;
  const serviceWorker = typeof navigator === "undefined" ? null : navigator.serviceWorker;
  if (!serviceWorker) return;
  const registration = await serviceWorker.register(this.serviceWorkerUrl, { scope: "/" });
  const readyRegistration = await serviceWorker.ready;
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
  const channel = new MessageChannel();
  channel.port2.onmessage = (event) => {
    __privateMethod(this, _OpenContainer_instances, handleServiceWorkerMessage_fn).call(this, event.data, channel.port2);
  };
  (_b = (_a2 = channel.port2).start) == null ? void 0 : _b.call(_a2);
  worker.postMessage({ type: "OPENCONTAINERS_CONNECT_KERNEL" }, [channel.port1]);
  this.serviceWorkerPort = channel.port2;
};
handleServiceWorkerMessage_fn = async function(message, port) {
  var _a2;
  if (!(message == null ? void 0 : message.id) || message.type !== "dispatchHttp") return;
  try {
    const response = await this.dispatchPreviewRequest((_a2 = message.payload) != null ? _a2 : {});
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
  var _a2;
  for (const listener of (_a2 = this.listeners.get(eventName)) != null ? _a2 : []) {
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
  return new Promise((resolve) => {
    var _a2;
    let settled = false;
    let timer = null;
    const finish = () => {
      var _a3, _b;
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      (_a3 = serviceWorker.removeEventListener) == null ? void 0 : _a3.call(serviceWorker, "controllerchange", finish);
      resolve((_b = serviceWorker.controller) != null ? _b : null);
    };
    (_a2 = serviceWorker.addEventListener) == null ? void 0 : _a2.call(serviceWorker, "controllerchange", finish);
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
  var _a2;
  const files = {};
  for (const [name, entry] of Object.entries(tree != null ? tree : {})) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry == null ? void 0 : entry.file) {
      files[path] = (_a2 = entry.file.contents) != null ? _a2 : "";
      continue;
    }
    if (entry == null ? void 0 : entry.directory) {
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
  var _a2;
  try {
    return parseOpenContainersPreviewUrl(request.url, previewBasePath);
  } catch (error) {
    const port = Number(request.port);
    if (!Number.isFinite(port) || port <= 0) throw error;
    const parsed = new URL(request.url || "/", "https://run.opencontainers.local");
    return {
      projectId: (_a2 = request.projectId) != null ? _a2 : fallbackProjectId,
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
`;
}
var _OpenContainerProcess_instances, createOutputStream_fn;
var OpenContainerProcess = class {
  constructor({ container, process }) {
    __privateAdd(this, _OpenContainerProcess_instances);
    this.container = container;
    this.process = process;
    this.output = __privateMethod(this, _OpenContainerProcess_instances, createOutputStream_fn).call(this);
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
      const onData = (chunk) => controller.enqueue(decodeChunk(chunk));
      process.stdout.on("data", onData);
      process.stderr.on("data", onData);
      process.completed.finally(() => {
        var _a2, _b, _c, _d;
        (_b = (_a2 = process.stdout).off) == null ? void 0 : _b.call(_a2, "data", onData);
        (_d = (_c = process.stderr).off) == null ? void 0 : _d.call(_c, "data", onData);
        controller.close();
      });
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
function decodeChunk(chunk) {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return textDecoder3.decode(chunk);
  if (ArrayBuffer.isView(chunk)) return textDecoder3.decode(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  return String(chunk);
}
function serializeBody(body) {
  if (body === void 0 || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return textDecoder3.decode(body);
  if (ArrayBuffer.isView(body)) return textDecoder3.decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
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
  var _a2, _b, _c;
  return (_c = (_b = (_a2 = globalThis.crypto) == null ? void 0 : _a2.randomUUID) == null ? void 0 : _b.call(_a2)) != null ? _c : Math.random().toString(16).slice(2);
}
export {
  WebContainer,
  OpenContainer,
  createOpenContainersServiceWorkerScript,
  flattenWebContainerTree,
  parseOpenContainersPreviewUrl
};
