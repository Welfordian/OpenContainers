import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { basename, dirname, isInsidePath, normalizePath, relativePath, resolvePath } from "./path-utils.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class VirtualFileSystemError extends Error {
  constructor(code, path, message = code) {
    super(`${code}: ${message}${path ? `, '${path}'` : ""}`);
    this.name = "VirtualFileSystemError";
    this.code = code;
    this.path = path;
  }
}

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFCHR = 0o020000;
const S_IFBLK = 0o060000;
const S_IFIFO = 0o010000;
const S_IFLNK = 0o120000;
const S_IFSOCK = 0o140000;

const statsDateCache = new WeakMap();
const statsInstantCache = new WeakMap();
const statsInstantSource = new WeakMap();

function StatsBase(dev, mode, nlink, uid, gid, rdev, blksize, ino, size, blocks) {}

function Stats(
  dev,
  mode,
  nlink,
  uid,
  gid,
  rdev,
  blksize,
  ino,
  size,
  blocks,
  atimeSec,
  atimeNsec,
  mtimeSec,
  mtimeNsec,
  ctimeSec,
  ctimeNsec,
  birthtimeSec,
  birthtimeNsec
) {
  this.dev = dev;
  this.mode = mode;
  this.nlink = nlink;
  this.uid = uid;
  this.gid = gid;
  this.rdev = rdev;
  this.blksize = blksize;
  this.ino = ino;
  this.size = size;
  this.blocks = blocks;
  this.atimeMs = timeSpecToMs(atimeSec, atimeNsec);
  this.mtimeMs = timeSpecToMs(mtimeSec, mtimeNsec);
  this.ctimeMs = timeSpecToMs(ctimeSec, ctimeNsec);
  this.birthtimeMs = timeSpecToMs(birthtimeSec, birthtimeNsec);
  statsInstantSource.set(this, {
    atime: { ms: this.atimeMs, ns: timeSpecToNs(atimeSec, atimeNsec) },
    mtime: { ms: this.mtimeMs, ns: timeSpecToNs(mtimeSec, mtimeNsec) },
    ctime: { ms: this.ctimeMs, ns: timeSpecToNs(ctimeSec, ctimeNsec) },
    birthtime: { ms: this.birthtimeMs, ns: timeSpecToNs(birthtimeSec, birthtimeNsec) }
  });
}

Object.setPrototypeOf(Stats.prototype, StatsBase.prototype);

for (const [name, msName] of [
  ["atime", "atimeMs"],
  ["mtime", "mtimeMs"],
  ["ctime", "ctimeMs"],
  ["birthtime", "birthtimeMs"]
]) {
  Object.defineProperty(Stats.prototype, name, {
    configurable: true,
    enumerable: true,
    get() {
      return getStatsCachedValue(statsDateCache, this, name, () => new Date(Number(this[msName] ?? 0)));
    },
    set(value) {
      setStatsCachedValue(statsDateCache, this, name, value);
    }
  });
}

for (const [name, msName] of [
  ["atimeInstant", "atimeMs"],
  ["mtimeInstant", "mtimeMs"],
  ["ctimeInstant", "ctimeMs"],
  ["birthtimeInstant", "birthtimeMs"]
]) {
  Object.defineProperty(Stats.prototype, name, {
    configurable: true,
    enumerable: true,
    get() {
      return getStatsCachedValue(statsInstantCache, this, name, () => createStatsInstant(this, name.replace("Instant", ""), msName));
    },
    set(value) {
      setStatsCachedValue(statsInstantCache, this, name, value);
    }
  });
}

Stats.prototype._checkModeProperty = function(mode) {
  if (typeof this.mode === "bigint") return (this.mode & BigInt(S_IFMT)) === BigInt(mode);
  return (this.mode & S_IFMT) === mode;
};

StatsBase.prototype.isDirectory = function() {
  return this._checkModeProperty(S_IFDIR);
};

StatsBase.prototype.isFile = function() {
  return this._checkModeProperty(S_IFREG);
};

StatsBase.prototype.isBlockDevice = function() {
  return this._checkModeProperty(S_IFBLK);
};

StatsBase.prototype.isCharacterDevice = function() {
  return this._checkModeProperty(S_IFCHR);
};

StatsBase.prototype.isSymbolicLink = function() {
  return this._checkModeProperty(S_IFLNK);
};

StatsBase.prototype.isFIFO = function() {
  return this._checkModeProperty(S_IFIFO);
};

StatsBase.prototype.isSocket = function() {
  return this._checkModeProperty(S_IFSOCK);
};

export { Stats as VirtualStats };

function createVirtualStats(node) {
  const size = node.type === "file" ? node.data.byteLength : node.type === "symlink" ? String(node.target).length : 0;
  const atime = msToTimeSpec(node.atimeMs);
  const mtime = msToTimeSpec(node.mtimeMs);
  const ctime = msToTimeSpec(node.ctimeMs);
  const birthtime = msToTimeSpec(node.birthtimeMs);
  return new Stats(
    0,
    node.mode,
    node.nlink ?? 1,
    node.uid ?? 1000,
    node.gid ?? 1000,
    0,
    4096,
    node.id,
    size,
    Math.ceil(size / 512),
    atime.seconds,
    atime.nanoseconds,
    mtime.seconds,
    mtime.nanoseconds,
    ctime.seconds,
    ctime.nanoseconds,
    birthtime.seconds,
    birthtime.nanoseconds
  );
}

function getStatsCachedValue(cache, stats, name, createValue) {
  let values = cache.get(stats);
  if (!values) {
    values = Object.create(null);
    cache.set(stats, values);
  }
  if (!Object.hasOwn(values, name)) values[name] = createValue();
  return values[name];
}

function setStatsCachedValue(cache, stats, name, value) {
  let values = cache.get(stats);
  if (!values) {
    values = Object.create(null);
    cache.set(stats, values);
  }
  values[name] = value;
}

function createStatsInstant(stats, name, msName) {
  const source = statsInstantSource.get(stats)?.[name];
  const milliseconds = Number(stats[msName] ?? 0);
  const nanoseconds = source && Object.is(Number(source.ms), milliseconds) ? source.ns : msToNs(milliseconds);
  return globalThis.Temporal?.Instant?.fromEpochNanoseconds?.(nanoseconds);
}

function timeSpecToMs(seconds = 0, nanoseconds = 0) {
  return Number(seconds ?? 0) * 1000 + Number(nanoseconds ?? 0) / 1_000_000;
}

function timeSpecToNs(seconds = 0, nanoseconds = 0) {
  return BigInt(Math.trunc(Number(seconds ?? 0))) * 1_000_000_000n + BigInt(Math.trunc(Number(nanoseconds ?? 0)));
}

function msToTimeSpec(milliseconds) {
  const value = Number(milliseconds ?? 0);
  const seconds = Math.trunc(value / 1000);
  return {
    seconds,
    nanoseconds: Math.trunc((value - seconds * 1000) * 1_000_000)
  };
}

function msToNs(milliseconds) {
  return BigInt(Math.trunc(Number(milliseconds) * 1_000_000));
}

function optionEncoding(options) {
  if (typeof options === "string") return options;
  return options?.encoding;
}

function bytesToString(bytes, encoding) {
  if (!encoding || encoding === "utf8" || encoding === "utf-8") return textDecoder.decode(bytes);
  if (typeof globalThis.Buffer === "function") return globalThis.Buffer.from(bytes).toString(encoding);
  if (encoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (encoding === "base64" && typeof globalThis.btoa === "function") return globalThis.btoa(String.fromCharCode(...bytes));
  return textDecoder.decode(bytes);
}

function dataToBytes(data, options) {
  if (typeof data === "string") {
    const encoding = optionEncoding(options) ?? "utf8";
    if (encoding === "utf8" || encoding === "utf-8") return textEncoder.encode(data);
    if (typeof globalThis.Buffer === "function") return new Uint8Array(globalThis.Buffer.from(data, encoding));
    if (encoding === "hex") return hexToBytes(data);
    if (encoding === "base64" && typeof globalThis.atob === "function") return Uint8Array.from(globalThis.atob(data), (char) => char.charCodeAt(0));
    return textEncoder.encode(data);
  }
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

function hexToBytes(value) {
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export class VirtualFileSystem {
  constructor({ files = {}, cwd = "/workspace" } = {}) {
    this.nodes = new Map();
    this.nextInode = 1;
    this.watchers = new EventEmitter();
    this.cwd = normalizePath(cwd);
    this.#createDirectory("/");
    this.mkdirSync(this.cwd, { recursive: true });

    for (const [path, value] of Object.entries(files)) {
      if (value && typeof value === "object" && value.type === "directory") {
        this.mkdirSync(path, { recursive: true });
      } else {
        this.writeFileSync(path, typeof value === "string" ? value : value?.content ?? "");
      }
    }
  }

  #now() {
    return Date.now();
  }

  #createNode(type, path, extra = {}) {
    const now = this.#now();
    return {
      id: this.nextInode++,
      type,
      path,
      mode: type === "directory" ? 0o40755 : type === "symlink" ? 0o120777 : 0o100644,
      nlink: 1,
      uid: 1000,
      gid: 1000,
      atimeMs: now,
      mtimeMs: now,
      ctimeMs: now,
      birthtimeMs: now,
      ...extra
    };
  }

  #createDirectory(path) {
    const normalized = normalizePath(path);
    const node = this.#createNode("directory", normalized, { children: new Set(), mode: 0o40755 });
    this.nodes.set(normalized, node);
    return node;
  }

  #touch(node) {
    const now = this.#now();
    node.mtimeMs = now;
    node.ctimeMs = now;
  }

  #timeToMs(value) {
    if (value instanceof Date) return value.getTime();
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError("Invalid time value");
    return number * 1000;
  }

  #symlinkTargetPath(linkPath, target) {
    return normalizePath(String(target).startsWith("/") ? target : `${dirname(linkPath)}/${target}`);
  }

  #lookup(path, { followSymlinks = true } = {}, seen = new Set()) {
    const normalized = normalizePath(path);
    const node = this.nodes.get(normalized);
    if (!node) throw new VirtualFileSystemError("ENOENT", normalized, "no such file or directory");
    if (followSymlinks && node.type === "symlink") {
      if (seen.has(normalized)) throw new VirtualFileSystemError("ELOOP", normalized, "too many symbolic links encountered");
      seen.add(normalized);
      return this.#lookup(this.#symlinkTargetPath(normalized, node.target), { followSymlinks }, seen);
    }
    return node;
  }

  #requireParent(path) {
    const parentPath = dirname(path);
    const parent = this.#lookup(parentPath);
    if (parent.type !== "directory") {
      throw new VirtualFileSystemError("ENOTDIR", parentPath, "not a directory");
    }
    return parent;
  }

  #emit(eventType, path) {
    const normalized = normalizePath(path);
    this.watchers.emit("change", eventType, normalized);
    for (const watcher of this.watchers.watchEntries ?? []) {
      const filename = this.#watchFilename(watcher.path, normalized, watcher.recursive);
      if (filename !== null) {
        watcher.listener(eventType, filename);
      }
    }
  }

  #watchFilename(watchedPath, changedPath, recursive) {
    if (changedPath === watchedPath) return basename(changedPath);
    if (!isInsidePath(watchedPath, changedPath)) return null;
    const relative = relativePath(watchedPath, changedPath);
    if (!recursive && relative.includes("/")) return null;
    return recursive ? relative : basename(changedPath);
  }

  watchedPaths() {
    return [...this.watchers.listenersByPath ?? []];
  }

  resolve(cwd, path) {
    return resolvePath(cwd || this.cwd, path);
  }

  chdir(path) {
    const normalized = this.resolve(this.cwd, path);
    const node = this.#lookup(normalized);
    if (node.type !== "directory") throw new VirtualFileSystemError("ENOTDIR", normalized, "not a directory");
    this.cwd = normalized;
  }

  existsSync(path) {
    return this.nodes.has(normalizePath(path));
  }

  statSync(path) {
    return createVirtualStats(this.#lookup(path));
  }

  lstatSync(path) {
    return createVirtualStats(this.#lookup(path, { followSymlinks: false }));
  }

  realpathSync(path, seen = new Set()) {
    const normalized = normalizePath(path);
    const node = this.#lookup(normalized, { followSymlinks: false });
    if (node.type !== "symlink") return normalized;
    if (seen.has(normalized)) {
      throw new VirtualFileSystemError("ELOOP", normalized, "too many symbolic links encountered");
    }
    seen.add(normalized);
    return this.realpathSync(this.#symlinkTargetPath(normalized, node.target), seen);
  }

  readlinkSync(path) {
    const normalized = normalizePath(path);
    const node = this.#lookup(normalized, { followSymlinks: false });
    if (node.type !== "symlink") throw new VirtualFileSystemError("EINVAL", normalized, "invalid argument");
    return node.target;
  }

  symlinkSync(target, path) {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) throw new VirtualFileSystemError("EEXIST", normalized, "file already exists");
    const parent = this.#requireParent(normalized);
    const node = this.#createNode("symlink", normalized, { target: String(target), mode: 0o120777 });
    this.nodes.set(normalized, node);
    parent.children.add(basename(normalized));
    this.#touch(parent);
    this.#emit("rename", normalized);
  }

  utimesSync(path, atime, mtime) {
    this.#utimes(path, atime, mtime, { followSymlinks: true });
  }

  lutimesSync(path, atime, mtime) {
    this.#utimes(path, atime, mtime, { followSymlinks: false });
  }

  #utimes(path, atime, mtime, { followSymlinks }) {
    const node = this.#lookup(path, { followSymlinks });
    node.atimeMs = this.#timeToMs(atime);
    node.mtimeMs = this.#timeToMs(mtime);
    node.ctimeMs = this.#now();
    this.#emit("change", path);
  }

  chmodSync(path, mode, { followSymlinks = true } = {}) {
    const node = this.#lookup(path, { followSymlinks });
    const typeBits = node.mode & 0o170000;
    node.mode = typeBits | (Number(mode) & 0o7777);
    node.ctimeMs = this.#now();
    this.#emit("change", path);
  }

  chownSync(path, uid, gid, { followSymlinks = true } = {}) {
    const node = this.#lookup(path, { followSymlinks });
    node.uid = Number(uid);
    node.gid = Number(gid);
    node.ctimeMs = this.#now();
    this.#emit("change", path);
  }

  linkSync(existingPath, newPath) {
    const from = normalizePath(existingPath);
    const to = normalizePath(newPath);
    if (this.nodes.has(to)) throw new VirtualFileSystemError("EEXIST", to, "file already exists");
    const node = this.#lookup(from);
    if (node.type === "directory") throw new VirtualFileSystemError("EPERM", from, "operation not permitted");
    const parent = this.#requireParent(to);
    this.nodes.set(to, node);
    parent.children.add(basename(to));
    node.nlink = (node.nlink ?? 1) + 1;
    node.ctimeMs = this.#now();
    this.#touch(parent);
    this.#emit("rename", to);
  }

  mkdirSync(path, options = {}) {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) {
      const existing = this.#lookup(normalized);
      if (existing.type !== "directory") throw new VirtualFileSystemError("EEXIST", normalized, "file already exists");
      return;
    }

    const parentPath = dirname(normalized);
    if (!this.nodes.has(parentPath)) {
      if (!options.recursive) throw new VirtualFileSystemError("ENOENT", parentPath, "parent does not exist");
      this.mkdirSync(parentPath, { recursive: true });
    }

    const parent = this.#requireParent(normalized);
    const node = this.#createDirectory(normalized);
    parent.children.add(basename(normalized));
    this.#touch(parent);
    this.#emit("rename", normalized);
    return node;
  }

  readdirSync(path, options = {}) {
    const node = this.#lookup(path);
    if (node.type !== "directory") throw new VirtualFileSystemError("ENOTDIR", path, "not a directory");
    const names = [...node.children].sort();
    if (!options.withFileTypes) return names;
    return names.map((name) => {
      const child = this.#lookup(`${normalizePath(path)}/${name}`);
      return {
        name,
        isFile: () => child.type === "file",
        isDirectory: () => child.type === "directory",
        isSymbolicLink: () => child.type === "symlink"
      };
    });
  }

  readFileSync(path, options) {
    const node = this.#lookup(path);
    if (node.type !== "file") throw new VirtualFileSystemError("EISDIR", path, "illegal operation on a directory");
    node.atimeMs = this.#now();
    const encoding = optionEncoding(options);
    const data = new Uint8Array(node.data);
    return encoding ? bytesToString(data, encoding) : data;
  }

  writeFileSync(path, data, options = {}) {
    const normalized = normalizePath(path);
    const parent = this.#requireParent(normalized);
    const bytes = dataToBytes(data, options);

    let node = this.nodes.get(normalized);
    if (node?.type === "symlink") {
      this.writeFileSync(this.#symlinkTargetPath(normalized, node.target), data, options);
      return;
    }
    if (node && node.type !== "file") {
      throw new VirtualFileSystemError("EISDIR", normalized, "illegal operation on a directory");
    }
    if (!node) {
      node = this.#createNode("file", normalized, { data: new Uint8Array(), mode: 0o100644 });
      this.nodes.set(normalized, node);
      parent.children.add(basename(normalized));
    }
    node.data = new Uint8Array(bytes);
    this.#touch(node);
    this.#touch(parent);
    this.#emit("change", normalized);
  }

  appendFileSync(path, data, options = {}) {
    const existing = this.existsSync(path) ? this.readFileSync(path) : new Uint8Array();
    const next = dataToBytes(data, options);
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
    const node = this.#lookup(normalized, { followSymlinks: false });
    if (node.type === "directory" && node.children.size && !options.recursive) {
      throw new VirtualFileSystemError("ENOTEMPTY", normalized, "directory not empty");
    }
    if (node.type === "directory") {
      for (const child of [...node.children]) this.rmSync(`${normalized}/${child}`, { recursive: true, force: true });
    }
    const parent = this.#requireParent(normalized);
    parent.children.delete(basename(normalized));
    this.nodes.delete(normalized);
    if (node.nlink && node.nlink > 1) {
      node.nlink -= 1;
      node.ctimeMs = this.#now();
    }
    this.#touch(parent);
    this.#emit("rename", normalized);
  }

  rmdirSync(path, options = {}) {
    this.rmSync(path, options);
  }

  unlinkSync(path) {
    const normalized = normalizePath(path);
    const node = this.#lookup(normalized, { followSymlinks: false });
    if (node.type === "directory") {
      throw new VirtualFileSystemError("EPERM", normalized, "operation not permitted");
    }
    this.rmSync(normalized);
  }

  renameSync(oldPath, newPath) {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    const node = this.#lookup(from, { followSymlinks: false });
    this.#requireParent(to);
    const entries = [...this.nodes.entries()].filter(([path]) => path === from || isInsidePath(from, path));
    entries.sort((a, b) => a[0].length - b[0].length);
    for (const [path, entry] of entries) {
      const movedPath = path === from ? to : `${to}${path.slice(from.length)}`;
      this.nodes.delete(path);
      entry.path = movedPath;
      this.nodes.set(movedPath, entry);
    }
    const oldParent = this.#requireParent(from);
    const newParent = this.#requireParent(to);
    oldParent.children.delete(basename(from));
    newParent.children.add(basename(to));
    this.#touch(node);
    this.#emit("rename", from);
    this.#emit("rename", to);
  }

  copyFileSync(source, destination) {
    const data = this.readFileSync(source);
    this.writeFileSync(destination, data);
  }

  watch(path, optionsOrListener, maybeListener) {
    const normalized = normalizePath(path);
    const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
    if (!listener) throw new TypeError("watch listener is required");
    const options = typeof optionsOrListener === "object" && optionsOrListener !== null ? optionsOrListener : {};
    const entry = {
      listener,
      path: normalized,
      recursive: Boolean(options.recursive)
    };
    this.watchers.watchEntries ??= new Set();
    this.watchers.listenersByPath ??= new Set();
    this.watchers.watchEntries.add(entry);
    this.watchers.listenersByPath.add(normalized);
    return {
      close: () => {
        this.watchers.watchEntries.delete(entry);
        if (![...this.watchers.watchEntries].some((watcher) => watcher.path === normalized)) {
          this.watchers.listenersByPath.delete(normalized);
        }
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

  promises = {
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
    link: async (existingPath, newPath) => this.linkSync(existingPath, newPath),
    chmod: async (path, mode) => this.chmodSync(path, mode),
    chown: async (path, uid, gid) => this.chownSync(path, uid, gid),
    lchmod: async (path, mode) => this.chmodSync(path, mode, { followSymlinks: false }),
    lchown: async (path, uid, gid) => this.chownSync(path, uid, gid, { followSymlinks: false }),
    lutimes: async (path, atime, mtime) => this.lutimesSync(path, atime, mtime),
    unlink: async (path) => this.unlinkSync(path)
  };
}
