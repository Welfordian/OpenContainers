import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { basename, dirname, isInsidePath, normalizePath, resolvePath } from "./path-utils.js";

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

export class VirtualStats {
  constructor(node) {
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
    this.#type = node.type;
  }

  #type;

  isFile() {
    return this.#type === "file";
  }

  isDirectory() {
    return this.#type === "directory";
  }

  isSymbolicLink() {
    return this.#type === "symlink";
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
      mode: type === "directory" ? 0o40755 : 0o100644,
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

  #lookup(path) {
    const normalized = normalizePath(path);
    const node = this.nodes.get(normalized);
    if (!node) throw new VirtualFileSystemError("ENOENT", normalized, "no such file or directory");
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
    for (const watchedPath of this.watchedPaths()) {
      if (normalized === watchedPath || isInsidePath(watchedPath, normalized)) {
        this.watchers.emit(`change:${watchedPath}`, eventType, basename(normalized));
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
    const node = this.#lookup(normalized);
    if (node.type !== "directory") throw new VirtualFileSystemError("ENOTDIR", normalized, "not a directory");
    this.cwd = normalized;
  }

  existsSync(path) {
    return this.nodes.has(normalizePath(path));
  }

  statSync(path) {
    return new VirtualStats(this.#lookup(path));
  }

  lstatSync(path) {
    return this.statSync(path);
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
    const encoding = typeof options === "string" ? options : options?.encoding;
    const data = new Uint8Array(node.data);
    return encoding ? textDecoder.decode(data) : data;
  }

  writeFileSync(path, data, options = {}) {
    const normalized = normalizePath(path);
    const parent = this.#requireParent(normalized);
    const bytes = typeof data === "string"
      ? textEncoder.encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

    let node = this.nodes.get(normalized);
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
    const node = this.#lookup(normalized);
    if (node.type === "directory" && node.children.size && !options.recursive) {
      throw new VirtualFileSystemError("ENOTEMPTY", normalized, "directory not empty");
    }
    if (node.type === "directory") {
      for (const child of [...node.children]) this.rmSync(`${normalized}/${child}`, { recursive: true, force: true });
    }
    const parent = this.#requireParent(normalized);
    parent.children.delete(basename(normalized));
    this.nodes.delete(normalized);
    this.#touch(parent);
    this.#emit("rename", normalized);
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
    const node = this.#lookup(from);
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
    this.watchers.listenersByPath ??= new Set();
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
    unlink: async (path) => this.unlinkSync(path)
  };
}
