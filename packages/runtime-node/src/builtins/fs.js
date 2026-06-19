import { resolvePath } from "../../../fs/src/path-utils.js";
import { Readable, Writable } from "./stream.js";

export class Dirent {
  constructor(name, type = "file") {
    this.name = name;
    this.parentPath = undefined;
    this.path = undefined;
    this.#type = type;
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
}

class StatFs {
  constructor(path) {
    this.type = 0x6f70656e;
    this.bsize = 4096;
    this.blocks = 1024 * 1024;
    this.bfree = 1024 * 1024;
    this.bavail = 1024 * 1024;
    this.files = 1024 * 1024;
    this.ffree = 1024 * 1024;
    this.path = path;
  }
}

const FS_CONSTANTS = {
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

function wrapCallback(fn) {
  return (...args) => {
    const callback = args.at(-1);
    const hasCallback = typeof callback === "function";
    queueMicrotask(() => {
      try {
        const result = fn(...args.slice(0, hasCallback ? -1 : undefined));
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

export function createFsBuiltin({ kernel, process }) {
  const resolve = (path) => resolvePath(process.cwd(), path);
  let nextFd = 100;
  const descriptors = new Map();

  const descriptorFor = (fd, operation) => {
    const descriptor = descriptors.get(fd);
    if (!descriptor) {
      throw Object.assign(new Error(`EBADF: bad file descriptor, ${operation}`), { code: "EBADF" });
    }
    return descriptor;
  };

  const toDirent = (entry) => {
    const type = entry.isDirectory?.()
      ? "directory"
      : entry.isSymbolicLink?.()
        ? "symlink"
        : "file";
    return new Dirent(entry.name, type);
  };

  const readdirWithDirents = (path, options = {}) => {
    const resolved = resolve(path);
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
      throw Object.assign(new RangeError("The value of \"len\" is out of range"), { code: "ERR_OUT_OF_RANGE" });
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
    chmod: async (_mode) => {}
  });

  class Dir {
    constructor(path) {
      this.path = resolve(path);
      this.#entries = readdirWithDirents(this.path);
    }

    #entries;
    #index = 0;
    #closed = false;

    readSync() {
      if (this.#closed) {
        throw Object.assign(new Error(`Directory handle was closed`), { code: "ERR_DIR_CLOSED" });
      }
      return this.#entries[this.#index++] ?? null;
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
      this.#closed = true;
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

  const copyTreeSync = (source, destination, options = {}) => {
    const sourcePath = resolve(source);
    const destinationPath = resolve(destination);
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
    readFileSync: (path, options) => kernel.fs.readFileSync(resolve(path), options),
    writeFileSync: (path, data, options) => kernel.fs.writeFileSync(resolve(path), data, options),
    appendFileSync: (path, data, options) => kernel.fs.appendFileSync(resolve(path), data, options),
    existsSync: (path) => kernel.fs.existsSync(resolve(path)),
    accessSync: (path) => {
      kernel.fs.statSync(resolve(path));
    },
    statSync: (path) => kernel.fs.statSync(resolve(path)),
    lstatSync: (path) => kernel.fs.lstatSync(resolve(path)),
    statfsSync: (path, options = {}) => {
      const resolved = resolve(path);
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
    utimesSync: (path, atime, mtime) => kernel.fs.utimesSync(resolve(path), atime, mtime),
    readdirSync: (path, options) => {
      if (options && typeof options === "object" && options.withFileTypes) return readdirWithDirents(path, options);
      return kernel.fs.readdirSync(resolve(path), options);
    },
    mkdirSync: (path, options) => kernel.fs.mkdirSync(resolve(path), options),
    rmSync: (path, options) => kernel.fs.rmSync(resolve(path), options),
    rmdirSync: (path, options) => kernel.fs.rmdirSync(resolve(path), options),
    unlinkSync: (path) => kernel.fs.unlinkSync(resolve(path)),
    truncateSync: (path, length = 0) => truncateResolvedFile(resolve(path), length),
    renameSync: (oldPath, newPath) => kernel.fs.renameSync(resolve(oldPath), resolve(newPath)),
    copyFileSync: (source, destination) => kernel.fs.copyFileSync(resolve(source), resolve(destination)),
    cpSync: (source, destination, options) => copyTreeSync(source, destination, options),
    chmodSync: () => {},
    realpathSync: (path) => kernel.fs.realpathSync(resolve(path)),
    readlinkSync: (path) => kernel.fs.readlinkSync(resolve(path)),
    symlinkSync: (target, path) => kernel.fs.symlinkSync(target, resolve(path)),
    openSync: (path, flags = "r") => {
      const resolved = resolve(path);
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
      const readPosition = position === null || position === undefined ? descriptor.position : Number(position);
      const bytes = source.subarray(readPosition, readPosition + Number(length));
      target.set(bytes, Number(offset));
      if (position === null || position === undefined) descriptor.position = readPosition + bytes.byteLength;
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
        const resolved = resolve(candidate);
        if (kernel.fs.existsSync(resolved)) continue;
        kernel.fs.mkdirSync(resolved);
        return candidate.startsWith("/") ? resolved : candidate;
      }
      throw Object.assign(new Error(`EEXIST: too many temporary directories match prefix '${base}'`), { code: "EEXIST" });
    },
    opendirSync: (path) => new Dir(path),
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
    unwatchFile: () => {},
    createReadStream: (path, options = {}) => {
      const stream = new Readable();
      queueMicrotask(() => {
        try {
          stream.push(kernel.fs.readFileSync(resolve(path), options.encoding ? { encoding: options.encoding } : undefined));
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
