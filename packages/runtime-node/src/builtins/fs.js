import { basename, dirname, joinPath, normalizePath, relativePath, resolvePath } from "../../../fs/src/path-utils.js";
import { RuntimeBuffer } from "./buffer.js";
import { EventEmitter } from "./events.js";
import { Readable, Writable } from "./stream.js";

const DIRENT_TYPE = Symbol("type");

export class Dirent {
  constructor(name, type = undefined, parentPath = undefined) {
    this.name = name;
    this.parentPath = parentPath;
    this[DIRENT_TYPE] = type;
  }

  isDirectory() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_DIR;
  }

  isFile() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_FILE;
  }

  isBlockDevice() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_BLOCK;
  }

  isCharacterDevice() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_CHAR;
  }

  isSymbolicLink() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_LINK;
  }

  isFIFO() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_FIFO;
  }

  isSocket() {
    return this[DIRENT_TYPE] === FS_CONSTANTS.UV_DIRENT_SOCKET;
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

class FSWatcher extends EventEmitter {
  #acquireRef;
  #closed = false;
  #rawWatcher;
  #releaseRef = null;

  constructor(rawWatcher, acquireRef, { persistent = true } = {}) {
    super();
    this.#rawWatcher = rawWatcher;
    this.#acquireRef = acquireRef;
    if (persistent) this.ref();
  }

  close() {
    if (this.#closed) return this;
    this.#closed = true;
    try {
      this.#rawWatcher?.close?.();
    } finally {
      this.unref();
      this.emit("close");
    }
    return this;
  }

  ref() {
    if (!this.#closed && !this.#releaseRef) {
      this.#releaseRef = this.#acquireRef?.() ?? null;
    }
    return this;
  }

  unref() {
    this.#releaseRef?.();
    this.#releaseRef = null;
    return this;
  }
}

const FS_CONSTANTS = {
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
  COPYFILE_FICLONE_FORCE: 4
};

const FS_EXPORT_ORDER = Object.freeze([
  "appendFile",
  "appendFileSync",
  "access",
  "accessSync",
  "chown",
  "chownSync",
  "chmod",
  "chmodSync",
  "close",
  "closeSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createReadStream",
  "createWriteStream",
  "exists",
  "existsSync",
  "fchown",
  "fchownSync",
  "fchmod",
  "fchmodSync",
  "fdatasync",
  "fdatasyncSync",
  "fstat",
  "fstatSync",
  "fsync",
  "fsyncSync",
  "ftruncate",
  "ftruncateSync",
  "futimes",
  "futimesSync",
  "glob",
  "globSync",
  "lchown",
  "lchownSync",
  "lchmod",
  "lchmodSync",
  "link",
  "linkSync",
  "lstat",
  "lstatSync",
  "lutimes",
  "lutimesSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "mkdtempDisposableSync",
  "open",
  "openSync",
  "openAsBlob",
  "readdir",
  "readdirSync",
  "read",
  "readSync",
  "readv",
  "readvSync",
  "readFile",
  "readFileSync",
  "readlink",
  "readlinkSync",
  "realpath",
  "realpathSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "stat",
  "statfs",
  "statSync",
  "statfsSync",
  "symlink",
  "symlinkSync",
  "truncate",
  "truncateSync",
  "unwatchFile",
  "unlink",
  "unlinkSync",
  "utimes",
  "utimesSync",
  "watch",
  "watchFile",
  "writeFile",
  "writeFileSync",
  "write",
  "writeSync",
  "writev",
  "writevSync",
  "Dirent",
  "Stats",
  "ReadStream",
  "WriteStream",
  "FileReadStream",
  "FileWriteStream",
  "Utf8Stream",
  "_toUnixTimestamp",
  "Dir",
  "opendir",
  "opendirSync",
  "constants",
  "promises"
]);

const FS_HELPER_PROTOTYPE_EXCLUDED_EXPORTS = new Set([
  "Dirent",
  "Stats",
  "ReadStream",
  "WriteStream",
  "FileReadStream",
  "FileWriteStream",
  "Utf8Stream",
  "Dir",
  "constants",
  "promises"
]);

Object.setPrototypeOf(FS_CONSTANTS, null);
for (const [key, value] of Object.entries(FS_CONSTANTS)) {
  Object.defineProperty(FS_CONSTANTS, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false
  });
}

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

function toFsPath(input) {
  if (input instanceof URL || isFileUrlLikePathObject(input)) {
    if (input.protocol !== "file:") {
      throw Object.assign(new TypeError("The URL must be of scheme file"), { code: "ERR_INVALID_URL_SCHEME" });
    }
    if (!(input instanceof URL) && typeof input.hostname !== "string") {
      throw Object.assign(new TypeError('File URL host must be "localhost" or empty on linux'), {
        code: "ERR_INVALID_FILE_URL_HOST"
      });
    }
    if (input.hostname && input.hostname !== "localhost") {
      throw Object.assign(new TypeError('File URL host must be "localhost" or empty on linux'), {
        code: "ERR_INVALID_FILE_URL_HOST"
      });
    }
    if (/%2f/i.test(input.pathname)) {
      throw Object.assign(new TypeError("File URL path must not include encoded / characters"), {
        code: "ERR_INVALID_FILE_URL_PATH"
      });
    }
    return decodeURIComponent(input.pathname || "/");
  }
  if (input && typeof input === "object" && !RuntimeBuffer.isBuffer?.(input)) {
    throw invalidArgType("path", "string or an instance of Buffer or URL", input);
  }
  return input;
}

function isFileUrlLikePathObject(input) {
  return input
    && typeof input === "object"
    && !(input instanceof URL)
    && typeof input.href === "string"
    && typeof input.protocol === "string"
    && typeof input.pathname === "string";
}

function toBigIntStats(stats, options = {}) {
  if (!options || typeof options !== "object" || !options.bigint) return stats;
  stats.atimeNs = msToNs(stats.atimeMs);
  stats.mtimeNs = msToNs(stats.mtimeMs);
  stats.ctimeNs = msToNs(stats.ctimeMs);
  stats.birthtimeNs = msToNs(stats.birthtimeMs);
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "number") stats[key] = BigInt(Math.trunc(value));
  }
  return stats;
}

function msToNs(milliseconds) {
  return BigInt(Math.trunc(Number(milliseconds) * 1_000_000));
}

function createFsError(code, message, extra = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code, ...extra });
}

function createAbortError(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function isFileDescriptor(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function optionEncoding(options) {
  if (typeof options === "string") return options;
  if (options && typeof options === "object") return options.encoding;
  return undefined;
}

function encodePathResult(path, options) {
  const encoding = optionEncoding(options);
  if (encoding === "buffer") return RuntimeBuffer.from(String(path));
  if (encoding) return RuntimeBuffer.from(String(path)).toString(encoding);
  return path;
}

function formatReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an instance of Array";
  if (typeof value === "object") return `an instance of ${value?.constructor?.name ?? "Object"}`;
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "function") return value.name ? `function ${value.name}` : "function";
  return `type ${typeof value} (${String(value)})`;
}

function invalidArgType(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be of type ${expected}. Received ${formatReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function invalidReturnValue(expected, name, value) {
  return Object.assign(new TypeError(`Expected ${expected} to be returned from the "${name}" function but got ${formatReceived(value)}.`), {
    code: "ERR_INVALID_RETURN_VALUE"
  });
}

function normalizeMkdtempPrefix(prefix) {
  const path = toFsPath(prefix);
  if (typeof path === "string") return path;
  if (ArrayBuffer.isView(path)) return RuntimeBuffer.from(path).toString();
  throw invalidArgType("prefix", "string or an instance of Buffer or URL", prefix);
}

function assertNotAborted(options) {
  const signal = options && typeof options === "object" ? options.signal : undefined;
  if (signal?.aborted) throw createAbortError(signal.reason);
}

function dataToBytes(data, options) {
  if (typeof data === "string") return RuntimeBuffer.from(data, optionEncoding(options) ?? "utf8");
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

function normalizeBufferIoOptions(buffer, offsetOrOptions, length, position) {
  const byteLength = buffer?.byteLength ?? 0;
  if (offsetOrOptions && typeof offsetOrOptions === "object") {
    const offset = Number(offsetOrOptions.offset ?? 0);
    return {
      offset,
      length: Number(offsetOrOptions.length ?? byteLength - offset),
      position: offsetOrOptions.position ?? null
    };
  }
  const offset = Number(offsetOrOptions ?? 0);
  return {
    offset,
    length: Number(length ?? byteLength - offset),
    position: position ?? null
  };
}

function decodeFileData(bytes, options) {
  const encoding = optionEncoding(options);
  return encoding ? RuntimeBuffer.from(bytes).toString(encoding) : bytes;
}

function normalizeIoVectors(buffers) {
  if (!Array.isArray(buffers)) {
    throw Object.assign(new TypeError("The \"buffers\" argument must be an array"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return buffers.map((buffer) => {
    if (buffer instanceof Uint8Array) return buffer;
    if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    throw Object.assign(new TypeError("Each buffer must be an ArrayBuffer view"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  });
}

function parseOpenFlags(flags = "r") {
  if (typeof flags === "number") {
    const writable = Boolean(flags & FS_CONSTANTS.O_WRONLY) || Boolean(flags & FS_CONSTANTS.O_RDWR);
    return {
      raw: flags,
      readable: !Boolean(flags & FS_CONSTANTS.O_WRONLY) || Boolean(flags & FS_CONSTANTS.O_RDWR),
      writable,
      append: Boolean(flags & FS_CONSTANTS.O_APPEND),
      create: Boolean(flags & FS_CONSTANTS.O_CREAT),
      exclusive: Boolean(flags & FS_CONSTANTS.O_EXCL),
      truncate: Boolean(flags & FS_CONSTANTS.O_TRUNC),
      directory: Boolean(flags & FS_CONSTANTS.O_DIRECTORY)
    };
  }

  const raw = String(flags);
  const normalized = raw.replace(/s/g, "");
  const exclusive = normalized.includes("x");
  switch (normalized.replace("x", "")) {
    case "r":
      return { raw, readable: true, writable: false, append: false, create: false, exclusive, truncate: false, directory: false };
    case "r+":
      return { raw, readable: true, writable: true, append: false, create: false, exclusive, truncate: false, directory: false };
    case "w":
      return { raw, readable: false, writable: true, append: false, create: true, exclusive, truncate: true, directory: false };
    case "w+":
      return { raw, readable: true, writable: true, append: false, create: true, exclusive, truncate: true, directory: false };
    case "a":
      return { raw, readable: false, writable: true, append: true, create: true, exclusive, truncate: false, directory: false };
    case "a+":
      return { raw, readable: true, writable: true, append: true, create: true, exclusive, truncate: false, directory: false };
    default:
      throw Object.assign(new TypeError(`Invalid flags '${raw}'`), { code: "ERR_INVALID_ARG_VALUE" });
  }
}

function escapeRegexChar(char) {
  return /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
}

function expandSimpleBraces(pattern) {
  const match = /\{([^{}]+)\}/.exec(pattern);
  if (!match) return [pattern];
  const [raw, body] = match;
  return body.split(",").flatMap((part) => expandSimpleBraces(
    `${pattern.slice(0, match.index)}${part}${pattern.slice(match.index + raw.length)}`
  ));
}

function globPatternToRegex(pattern) {
  const normalized = normalizePath(pattern).replace(/^\.\//, "");
  let output = "^";
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];
    if (char === "*" && next === "*" && afterNext === "/") {
      output += "(?:.*\\/)?";
      index += 2;
      continue;
    }
    if (char === "*" && next === "*") {
      output += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      output += "[^/]*";
      continue;
    }
    if (char === "?") {
      output += "[^/]";
      continue;
    }
    if (char === "[") {
      const end = normalized.indexOf("]", index + 1);
      if (end !== -1) {
        output += normalized.slice(index, end + 1);
        index = end;
        continue;
      }
    }
    output += escapeRegexChar(char);
  }
  return new RegExp(`${output}$`);
}

function patternAllowsHidden(pattern) {
  return normalizePath(pattern).split("/").some((part) => part.startsWith("."));
}

function normalizeWatchArgs(options, listener) {
  if (typeof options === "function") {
    return { options: { encoding: "utf8", persistent: true }, listener: options };
  }
  if (typeof options === "string") {
    return { options: { encoding: options, persistent: true }, listener };
  }
  return {
    options: {
      encoding: options?.encoding ?? "utf8",
      persistent: options?.persistent !== false,
      recursive: Boolean(options?.recursive)
    },
    listener
  };
}

function encodeWatchFilename(filename, encoding) {
  return encoding === "buffer" ? RuntimeBuffer.from(String(filename ?? "")) : filename;
}

function createDisposableTempDirectory(path, removeDirectory, { async = false } = {}) {
  const disposable = async ? Object.create(null) : {};
  const removeMethod = createDisposableTempRemove(removeDirectory);
  disposable.path = path;
  disposable.remove = removeMethod;
  if (async) {
    Object.defineProperty(disposable, Symbol.asyncDispose, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: createDisposableTempAsyncDispose(removeDirectory)
    });
  } else {
    Object.defineProperty(disposable, Symbol.dispose, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: createDisposableTempDispose(removeDirectory)
    });
  }
  return disposable;
}

function createDisposableTempRemove(removeDirectory) {
  return {
    remove() {
      return removeDirectory();
    }
  }.remove;
}

function createDisposableTempDispose(removeDirectory) {
  return {
    [Symbol.dispose]() {
      return removeDirectory();
    }
  }[Symbol.dispose];
}

function createDisposableTempAsyncDispose(removeDirectory) {
  return {
    async [Symbol.asyncDispose]() {
      await removeDirectory();
    }
  }[Symbol.asyncDispose];
}

function toUnixTimestamp(time) {
  if (time instanceof Date) return time.getTime() / 1000;
  if (typeof time === "number") {
    if (Number.isFinite(time)) return time < 0 ? Date.now() / 1000 : time;
    throw invalidTimestampError(time);
  }
  if (typeof time === "string" && time.trim() !== "") {
    const parsed = Number(time);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw invalidTimestampError(time);
}

function invalidTimestampError(time) {
  let received;
  if (time === undefined) received = "undefined";
  else if (time === null) received = "null";
  else if (Array.isArray(time)) received = "an instance of Array";
  else if (typeof time === "object") received = `an instance of ${time?.constructor?.name ?? "Object"}`;
  else received = `type ${typeof time} (${String(time)})`;
  return Object.assign(new TypeError(`The "time" argument must be an instance of Date or an Time in seconds. Received ${received}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

export function createFsBuiltin({ kernel, process }) {
  const resolve = (path) => resolvePath(process.cwd(), toFsPath(path));
  let nextFd = 100;
  let nextFileHandleAsyncId = 1;
  const descriptors = new Map();
  const fileWatchers = new Map();

  const validateOpenAsBlobArgs = (path, options) => {
    if (
      typeof path !== "string"
      && !(path instanceof URL)
      && !isFileUrlLikePathObject(path)
      && !RuntimeBuffer.isBuffer?.(path)
    ) {
      throw invalidArgType("path", "string or an instance of Buffer or URL", path);
    }
    if (options === null || (options !== undefined && (typeof options !== "object" || Array.isArray(options)))) {
      throw invalidArgType("options", "object", options);
    }
    if (options?.type !== undefined && options.type !== null && typeof options.type !== "string") {
      throw invalidArgType("options.type", "string", options.type);
    }
  };

  const descriptorFor = (fd, operation) => {
    const descriptor = descriptors.get(fd);
    if (!descriptor) {
      throw Object.assign(new Error(`EBADF: bad file descriptor, ${operation}`), { code: "EBADF" });
    }
    return descriptor;
  };

  const assertReadable = (descriptor) => {
    if (!descriptor.readable) throw createFsError("EBADF", "bad file descriptor, read");
  };

  const assertWritable = (descriptor) => {
    if (!descriptor.writable) throw createFsError("EBADF", "bad file descriptor, write");
  };

  const holdProcessRef = () => {
    let released = false;
    process.__opencontainersAddRef?.();
    return () => {
      if (released) return;
      released = true;
      process.__opencontainersUnref?.();
    };
  };

  const removeFileWatcherEntry = (entry) => {
    const entries = fileWatchers.get(entry.path);
    if (!entries?.has(entry)) return;
    entries.delete(entry);
    try {
      entry.watcher?.close?.();
    } finally {
      if (entries.size === 0) fileWatchers.delete(entry.path);
    }
  };

  class StatWatcher extends EventEmitter {
    #entry;

    constructor(entry) {
      super();
      this.#entry = entry;
    }

    close() {
      removeFileWatcherEntry(this.#entry);
      return this;
    }

    ref() {
      this.#entry.watcher?.ref?.();
      return this;
    }

    unref() {
      this.#entry.watcher?.unref?.();
      return this;
    }
  }

  class ReadStream extends Readable {
    constructor(path, options) {
      super(options ?? {});
      options ??= {};
      this.path = isFileDescriptor(path) || isFileDescriptor(options?.fd) ? undefined : path;
      this.fd = isFileDescriptor(options?.fd) ? options.fd : isFileDescriptor(path) ? path : null;
      this.flags = options?.flags ?? "r";
      this.mode = options?.mode ?? 0o666;
      this.start = options?.start;
      this.end = options?.end;
      this.#autoClose = options?.autoClose !== false;
      this.bytesRead = 0;
      this.#pending = true;
      this.#path = path;
      this.#options = options;
      this.#release = holdProcessRef();
      queueMicrotask(() => this.#readFile());
    }

    #autoClose = true;
    #options;
    #path;
    #pending = true;
    #release;

    get autoClose() {
      return this.#autoClose;
    }

    set autoClose(value) {
      this.#autoClose = Boolean(value);
    }

    _construct(callback) {
      callback?.();
    }

    _read(_size) {}

    _destroy(error, callback) {
      callback?.(error);
    }

    close(callback) {
      if (callback) this.once("close", callback);
      this.destroy();
      return this;
    }

    get pending() {
      return this.#pending;
    }

    #readFile() {
      if (this.destroyed) {
        this.#release();
        return;
      }
      try {
        const options = this.#options;
        const fd = isFileDescriptor(options?.fd) ? options.fd : isFileDescriptor(this.#path) ? this.#path : undefined;
        let bytes;
        let descriptor;
        if (isFileDescriptor(fd)) {
          this.fd = fd;
          descriptor = descriptorFor(fd, "ReadStream");
          assertReadable(descriptor);
          bytes = kernel.fs.readFileSync(descriptor.path);
        } else {
          bytes = kernel.fs.readFileSync(resolve(this.#path));
        }
        this.#pending = false;
        this.emit("ready");
        const start = options?.start === undefined || options?.start === null
          ? isFileDescriptor(fd)
            ? Number(descriptor.position ?? 0)
            : 0
          : Number(options.start);
        const end = options?.end === undefined || options?.end === null
          ? bytes.byteLength - 1
          : Number(options.end);
        const slice = start > end || start >= bytes.byteLength
          ? new Uint8Array()
          : bytes.subarray(Math.max(0, start), Math.min(bytes.byteLength, end + 1));
        this.bytesRead += slice.byteLength;
        if (slice.byteLength > 0) this.push(decodeFileData(slice, options));
        if (isFileDescriptor(fd) && options?.start === undefined) {
          descriptor.position = Math.min(bytes.byteLength, Math.max(0, end + 1));
        }
        this.push(null);
        if (isFileDescriptor(fd) && this.autoClose) fs.closeSync(fd);
      } catch (error) {
        this.destroy(error);
      } finally {
        this.#release();
      }
    }
  }

  class WriteStream extends Writable {
    constructor(path, options) {
      options ??= {};
      super(options && typeof options === "object" ? options : {});
      this.path = isFileDescriptor(path) || isFileDescriptor(options?.fd) ? undefined : path;
      this.fd = isFileDescriptor(options?.fd) ? options.fd : isFileDescriptor(path) ? path : fs.openSync(path, options?.flags ?? "w", options?.mode);
      this.flags = options?.flags ?? "w";
      this.mode = options?.mode ?? 0o666;
      this.start = options?.start;
      this.#autoClose = options?.autoClose !== false;
      this.bytesWritten = 0;
      this.#pending = false;
      const descriptor = descriptorFor(this.fd, "WriteStream");
      if (options?.start !== undefined && options?.start !== null && !descriptor.append) {
        descriptor.position = Number(options.start);
      }
      this.#release = holdProcessRef();
      this.once("finish", () => this.#finish());
      this.once("error", () => this.#finish());
      queueMicrotask(() => this.emit("ready"));
    }

    #autoClose = true;
    #finished = false;
    #pending = false;
    #release;

    get autoClose() {
      return this.#autoClose;
    }

    set autoClose(value) {
      this.#autoClose = Boolean(value);
    }

    _construct(callback) {
      callback?.();
    }

    _write(chunk, _encoding, callback) {
      try {
        const bytes = dataToBytes(chunk);
        fs.writeSync(this.fd, bytes, 0, bytes.byteLength, null);
        this.bytesWritten += bytes.byteLength;
        callback?.();
      } catch (error) {
        callback?.(error);
      }
    }

    _writev(chunks, callback) {
      try {
        for (const entry of chunks) {
          this._write(entry.chunk, entry.encoding, (error) => {
            if (error) throw error;
          });
        }
        callback?.();
      } catch (error) {
        callback?.(error);
      }
    }

    _destroy(error, callback) {
      callback?.(error);
    }

    close(callback) {
      if (callback) this.once("close", callback);
      if (!this.writableEnded) this.end();
      return this;
    }

    destroySoon(_a, _b, _c) {
      return this.end();
    }

    get pending() {
      return this.#pending;
    }

    #finish() {
      if (this.#finished) return;
      this.#finished = true;
      try {
        if (this.autoClose && isFileDescriptor(this.fd)) {
          fs.closeSync(this.fd);
          this.fd = null;
        }
      } finally {
        this.#release();
      }
    }
  }

  let readStreamConstructor = ReadStream;
  let writeStreamConstructor = WriteStream;
  let fileReadStreamConstructor = ReadStream;
  let fileWriteStreamConstructor = WriteStream;

  const createFSWatcher = (path, options, listener) => {
    const resolved = resolve(path);
    const { options: normalizedOptions, listener: callback } = normalizeWatchArgs(options, listener);
    let watcher;
    const rawWatcher = kernel.fs.watch(resolved, { recursive: normalizedOptions.recursive }, (eventType, filename) => {
      const encodedFilename = encodeWatchFilename(filename, normalizedOptions.encoding);
      watcher.emit("change", eventType, encodedFilename);
      callback?.(eventType, encodedFilename);
    });
    watcher = new FSWatcher(rawWatcher, holdProcessRef, {
      persistent: normalizedOptions.persistent
    });
    return watcher;
  };

	  class Utf8Stream extends Writable {
	    constructor(options = {}) {
	      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw Object.assign(new TypeError(`The "options" argument must be of type object. Received type ${typeof options}`), {
          code: "ERR_INVALID_ARG_TYPE"
        });
      }
      const fd = options.fd;
      if (typeof fd !== "number" && typeof fd !== "string") {
        throw Object.assign(new TypeError(`The "fd" argument must be one of type number or string. Received ${fd === undefined ? "undefined" : `type ${typeof fd}`}`), {
          code: "ERR_INVALID_ARG_TYPE"
        });
      }
      const numericFd = typeof fd === "number" ? fd : Number(fd);
      super({
        write: (chunk) => {
          if (Number.isInteger(numericFd) && descriptors.has(numericFd)) {
            fs.writeSync(numericFd, String(chunk));
          }
	        }
	      });
	      this.#fd = Number.isInteger(numericFd) ? numericFd : -1;
	      this.#file = options.file ?? null;
	      this.#mode = options.mode;
	      this.#minLength = options.minLength ?? 0;
	      this.#maxLength = options.maxLength ?? 0;
	      this.#writing = false;
	      this.#sync = Boolean(options.sync);
	      this.#fsync = Boolean(options.fsync);
	      this.#append = options.append !== false;
	      this.#periodicFlush = options.periodicFlush ?? 0;
	      this.#contentMode = options.contentMode ?? "utf8";
	      this.#mkdir = Boolean(options.mkdir);
	    }

	    #fd;
	    #file;
	    #mode;
	    #minLength;
	    #maxLength;
	    #writing;
	    #sync;
	    #fsync;
	    #append;
	    #periodicFlush;
	    #contentMode;
	    #mkdir;

	    write(chunk) {
	      this.#writing = true;
	      return super.write(chunk);
	    }

	    flush(...args) {
	      const callback = typeof args[0] === "function" ? args[0] : undefined;
	      callback?.();
	    }

	    flushSync() {
	      return undefined;
	    }

	    reopen(file) {
	      if (file !== undefined) this.#file = file;
	      if (this.#file === null || this.#file === undefined) {
	        throw Object.assign(new Error("Operation failed: Unable to reopen a file descriptor, you must pass a file to SonicBoom"), {
	          code: "ERR_OPERATION_FAILED"
	        });
	      }
	      return this;
	    }

	    end(...args) {
	      super.end(...args);
	      return undefined;
	    }

	    destroy(...args) {
	      super.destroy(...args);
	      return undefined;
	    }

	    get mode() {
	      return this.#mode;
	    }

	    get file() {
	      return this.#file;
	    }

	    get fd() {
	      return this.#fd;
	    }

	    get minLength() {
	      return this.#minLength;
	    }

	    get maxLength() {
	      return this.#maxLength;
	    }

	    get writing() {
	      return this.#writing;
	    }

	    get sync() {
	      return this.#sync;
	    }

	    get fsync() {
	      return this.#fsync;
	    }

	    get append() {
	      return this.#append;
	    }

	    get periodicFlush() {
	      return this.#periodicFlush;
	    }

	    get contentMode() {
	      return this.#contentMode;
	    }

	    get mkdir() {
	      return this.#mkdir;
	    }

	    [Symbol.dispose]() {
	      this.destroy();
	    }
	  }

  const watchIterator = async function* (path, options = {}) {
    const signal = options?.signal;
    if (signal?.aborted) throw createAbortError(signal.reason);

    const queue = [];
    const waiters = [];
    let failure = null;
    let finished = false;

    const settle = () => {
      const waiter = waiters.shift();
      if (!waiter) return;
      if (queue.length) waiter.resolve(queue.shift());
      else if (failure) waiter.reject(failure);
      else if (finished) waiter.resolve(null);
      else waiters.unshift(waiter);
    };

    const watcher = createFSWatcher(path, options, (eventType, filename) => {
      queue.push({ eventType, filename });
      settle();
    });

    const onAbort = () => {
      failure = createAbortError(signal.reason);
      watcher.close();
      while (waiters.length) settle();
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });

    try {
      while (!finished && !failure) {
        if (queue.length) {
          yield queue.shift();
          continue;
        }
        const next = await new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        if (next === null) break;
        yield next;
      }
      if (failure) throw failure;
    } finally {
      signal?.removeEventListener?.("abort", onAbort);
      watcher.close();
      finished = true;
    }
  };

  const toDirentType = (entry) => {
    if (entry.isDirectory?.()) return FS_CONSTANTS.UV_DIRENT_DIR;
    if (entry.isSymbolicLink?.()) return FS_CONSTANTS.UV_DIRENT_LINK;
    if (entry.isFIFO?.()) return FS_CONSTANTS.UV_DIRENT_FIFO;
    if (entry.isSocket?.()) return FS_CONSTANTS.UV_DIRENT_SOCKET;
    if (entry.isCharacterDevice?.()) return FS_CONSTANTS.UV_DIRENT_CHAR;
    if (entry.isBlockDevice?.()) return FS_CONSTANTS.UV_DIRENT_BLOCK;
    if (entry.isFile?.()) return FS_CONSTANTS.UV_DIRENT_FILE;
    return FS_CONSTANTS.UV_DIRENT_UNKNOWN;
  };

  const toDirent = (entry, options, parentPath = undefined) => {
    return new Dirent(encodePathResult(entry.name, options), toDirentType(entry), parentPath);
  };

  const makeDirent = (entry, parentPath, options) => {
    return toDirent(entry, options, parentPath);
  };

  const readdirRecursive = (path, options = {}, { withFileTypes = false } = {}) => {
    const resolved = resolve(path);
    const results = [];
    const pendingDirectories = [];
    const addEntry = (directory, relativeParent, entry) => {
      const relative = relativeParent ? joinPath(relativeParent, entry.name) : entry.name;
      if (withFileTypes) results.push(makeDirent(entry, directory, options));
      else results.push(encodePathResult(relative, options));
      if (entry.isDirectory?.()) pendingDirectories.push({
        directory: joinPath(directory, entry.name),
        relative
      });
    };

    for (const entry of kernel.fs.readdirSync(resolved, { withFileTypes: true })) {
      addEntry(resolved, "", entry);
    }
    for (let index = 0; index < pendingDirectories.length; index++) {
      const current = pendingDirectories[index];
      for (const entry of kernel.fs.readdirSync(current.directory, { withFileTypes: true })) {
        addEntry(current.directory, current.relative, entry);
      }
    }
    return results;
  };

  const readdirWithDirents = (path, options = {}) => {
    if (options?.recursive) return readdirRecursive(path, options, { withFileTypes: true });
    const resolved = resolve(path);
    return kernel.fs.readdirSync(resolved, { ...options, withFileTypes: true })
      .map((entry) => makeDirent(entry, resolved, options));
  };

  const readdirNames = (path, options = {}) => {
    if (options?.recursive) return readdirRecursive(path, options);
    const resolved = resolve(path);
    return kernel.fs.readdirSync(resolved, options).map((entry) => encodePathResult(entry, options));
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

  const accessSyncResolved = (resolved, mode = FS_CONSTANTS.F_OK) => {
    const stats = kernel.fs.statSync(resolved);
    const requested = Number(mode ?? FS_CONSTANTS.F_OK);
    if (requested === FS_CONSTANTS.F_OK) return;

    const uid = typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.();
    const gid = typeof process.getegid === "function" ? process.getegid() : process.getgid?.();
    const canAccess = (ownerBit, groupBit, otherBit) => {
      if (stats.uid === uid) return Boolean(stats.mode & ownerBit);
      if (stats.gid === gid) return Boolean(stats.mode & groupBit);
      return Boolean(stats.mode & otherBit);
    };

    if ((requested & FS_CONSTANTS.R_OK) && !canAccess(FS_CONSTANTS.S_IRUSR, FS_CONSTANTS.S_IRGRP, FS_CONSTANTS.S_IROTH)) {
      throw createFsError("EACCES", `permission denied, access '${resolved}'`, { path: resolved });
    }
    if ((requested & FS_CONSTANTS.W_OK) && !canAccess(FS_CONSTANTS.S_IWUSR, FS_CONSTANTS.S_IWGRP, FS_CONSTANTS.S_IWOTH)) {
      throw createFsError("EACCES", `permission denied, access '${resolved}'`, { path: resolved });
    }
    if ((requested & FS_CONSTANTS.X_OK) && !canAccess(FS_CONSTANTS.S_IXUSR, FS_CONSTANTS.S_IXGRP, FS_CONSTANTS.S_IXOTH)) {
      throw createFsError("EACCES", `permission denied, access '${resolved}'`, { path: resolved });
    }
  };

  const readFileDescriptorSync = (fd, options) => {
    const descriptor = descriptorFor(fd, "readFile");
    assertReadable(descriptor);
    const source = kernel.fs.readFileSync(descriptor.path);
    const start = Math.max(0, Number(descriptor.position ?? 0));
    const bytes = start >= source.byteLength ? new Uint8Array() : source.subarray(start);
    descriptor.position = source.byteLength;
    return decodeFileData(bytes, options);
  };

  const writeFileDescriptorSync = (fd, data, options) => {
    const bytes = dataToBytes(data, options);
    fs.writeSync(fd, bytes, 0, bytes.byteLength, null);
  };

  const createReadLinesIterator = async function* (fd, options = {}) {
    const encoding = optionEncoding(options) || "utf8";
    const text = fs.readFileSync(fd, { encoding });
    const lines = String(text).split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) yield line;
  };

  const createReadableWebStream = (fd, options = {}) => {
    if (typeof ReadableStream !== "function") {
      throw Object.assign(new Error("ReadableStream is not available in this environment"), {
        code: "ERR_OPENCONTAINERS_WEB_STREAM_UNAVAILABLE"
      });
    }
    let consumed = false;
    return new ReadableStream({
      pull(controller) {
        if (consumed) {
          controller.close();
          return;
        }
        consumed = true;
        const data = fs.readFileSync(fd);
        controller.enqueue(options.type === "bytes" ? data : data);
        controller.close();
      }
    });
  };

  class FileHandle extends EventEmitter {
    #closed = false;
    #asyncId;
    #fd;

    constructor(fd) {
      super();
      this.#fd = fd;
      this.#asyncId = nextFileHandleAsyncId++;
      const handle = this;
      this.close = async function close() {
        if (handle.#closed) return;
        const fd = handle.#fd;
        handle.#closed = true;
        handle.#fd = -1;
        fs.closeSync(fd);
      };
    }

    getAsyncId() {
      return this.#asyncId;
    }

    get fd() {
      return this.#fd;
    }

    async appendFile(data, options) {
      assertNotAborted(options);
      return fs.appendFileSync(this.#fd, data, options);
    }

    async chmod(mode) {
      return fs.fchmodSync(this.#fd, mode);
    }

    async chown(uid, gid) {
      return fs.fchownSync(this.#fd, uid, gid);
    }

    async datasync() {
      return fs.fdatasyncSync(this.#fd);
    }

    async sync() {
      return fs.fsyncSync(this.#fd);
    }

    async read(buffer, offset, length, position) {
      const options = normalizeBufferIoOptions(buffer, offset, length, position);
      return {
        bytesRead: fs.readSync(this.#fd, buffer, options.offset, options.length, options.position),
        buffer
      };
    }

    async readv(buffers, position) {
      return {
        bytesRead: fs.readvSync(this.#fd, buffers, position ?? null),
        buffers
      };
    }

    async readFile(options) {
      assertNotAborted(options);
      return fs.readFileSync(this.#fd, options);
    }

    readLines(options = {}) {
      return createReadLinesIterator(this.#fd, options);
    }

    async stat(options) {
      return toBigIntStats(kernel.fs.statSync(descriptorFor(this.#fd, "stat").path), options);
    }

    async truncate(length = 0) {
      return fs.ftruncateSync(this.#fd, length);
    }

    async utimes(atime, mtime) {
      return fs.futimesSync(this.#fd, atime, mtime);
    }

    async write(buffer, offset, length, position) {
      const options = typeof buffer === "string"
        ? { offset, length, position }
        : normalizeBufferIoOptions(buffer, offset, length, position);
      return {
        bytesWritten: fs.writeSync(this.#fd, buffer, options.offset, options.length, options.position),
        buffer
      };
    }

    async writev(buffers, position) {
      return {
        bytesWritten: fs.writevSync(this.#fd, buffers, position ?? null),
        buffers
      };
    }

    async writeFile(data, options) {
      assertNotAborted(options);
      return fs.writeFileSync(this.#fd, data, options);
    }

    readableWebStream(options = {}) {
      return createReadableWebStream(this.#fd, options);
    }

    createReadStream(options = {}) {
      return fs.createReadStream(null, { ...options, fd: this.#fd });
    }

    createWriteStream(options = {}) {
      return fs.createWriteStream(null, { ...options, fd: this.#fd });
    }

    async [Symbol.asyncDispose]() {
      await this.close();
    }
  }

  const createFileHandle = (fd) => new FileHandle(fd);

  class Dir {
    constructor(path, options = {}) {
      this.#path = resolve(path);
      this.#entries = readdirWithDirents(this.#path, options);
    }

    #path;
    #entries;
    #index = 0;
    #closed = false;

    get path() {
      return this.#path;
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

    readSync() {
      if (this.#closed) {
        throw Object.assign(new Error(`Directory handle was closed`), { code: "ERR_DIR_CLOSED" });
      }
      return this.#entries[this.#index++] ?? null;
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

    closeSync() {
      this.#closed = true;
    }

    async *entries() {
      while (true) {
        const entry = this.readSync();
        if (!entry) break;
        yield entry;
      }
    }
  }

  if (typeof Symbol.dispose === "symbol") {
    Object.defineProperty(Dir.prototype, Symbol.dispose, {
      configurable: true,
      value: {
        [Symbol.dispose]() {
          return this.closeSync();
        }
      }[Symbol.dispose],
      writable: true
    });
  }
  if (typeof Symbol.asyncDispose === "symbol") {
    Object.defineProperty(Dir.prototype, Symbol.asyncDispose, {
      configurable: true,
      value: {
        async [Symbol.asyncDispose]() {
          await this.close();
        }
      }[Symbol.asyncDispose],
      writable: true
    });
  }
  Object.defineProperty(Dir.prototype, Symbol.asyncIterator, {
    configurable: true,
    value: Dir.prototype.entries,
    writable: true
  });

  const copyTreeSync = (source, destination, options = {}) => {
    const sourceInput = String(toFsPath(source));
    const destinationInput = String(toFsPath(destination));
    const sourcePath = resolve(source);
    const destinationPath = resolve(destination);
    if (!shouldCopySync(options, sourceInput, destinationInput)) return;
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
        copyTreeSync(joinPath(sourceInput, entry), joinPath(destinationInput, entry), options);
      }
      return;
    }
    if (kernel.fs.existsSync(destinationPath) && options.errorOnExist && options.force === false) {
      throw Object.assign(new Error(`Target already exists: cp returned EEXIST (${destinationPath} already exists) ${destinationPath}`), {
        code: "ERR_FS_CP_EEXIST",
        errno: 17,
        syscall: "cp",
        path: destinationPath
      });
    }
    if (!kernel.fs.existsSync(destinationPath) || options.force !== false) {
      kernel.fs.copyFileSync(sourcePath, destinationPath);
      if (options.preserveTimestamps) {
        kernel.fs.utimesSync(destinationPath, sourceStats.atime, sourceStats.mtime);
      }
    }
  };

  const shouldCopySync = (options, sourcePath, destinationPath) => {
    if (typeof options?.filter !== "function") return true;
    const value = options.filter(sourcePath, destinationPath);
    if (value && typeof value.then === "function") throw invalidReturnValue("boolean", "filter", value);
    return Boolean(value);
  };

  const shouldCopyAsync = async (options, sourcePath, destinationPath) => {
    if (typeof options?.filter !== "function") return true;
    const value = await options.filter(sourcePath, destinationPath);
    return Boolean(value);
  };

  const copyTree = async (source, destination, options = {}) => {
    const sourceInput = String(toFsPath(source));
    const destinationInput = String(toFsPath(destination));
    const sourcePath = resolve(source);
    const destinationPath = resolve(destination);
    if (!await shouldCopyAsync(options, sourceInput, destinationInput)) return;
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
        await copyTree(joinPath(sourceInput, entry), joinPath(destinationInput, entry), options);
      }
      return;
    }
    if (kernel.fs.existsSync(destinationPath) && options.errorOnExist && options.force === false) {
      throw Object.assign(new Error(`Target already exists: cp returned EEXIST (${destinationPath} already exists) ${destinationPath}`), {
        code: "ERR_FS_CP_EEXIST",
        errno: 17,
        syscall: "cp",
        path: destinationPath
      });
    }
    if (!kernel.fs.existsSync(destinationPath) || options.force !== false) {
      kernel.fs.copyFileSync(sourcePath, destinationPath);
      if (options.preserveTimestamps) {
        kernel.fs.utimesSync(destinationPath, sourceStats.atime, sourceStats.mtime);
      }
    }
  };

  const makeGlobDirent = (absolutePath, rootPath, cwdOption) => {
      const entry = toDirent(kernel.fs.readdirSync(dirname(absolutePath), { withFileTypes: true })
        .find((candidate) => candidate.name === basename(absolutePath)));
    const parentRelative = relativePath(rootPath, dirname(absolutePath)) || ".";
    const cwdPath = cwdOption === undefined ? undefined : String(toFsPath(cwdOption) || ".");
    if (cwdPath === undefined) {
      entry.parentPath = parentRelative;
    } else if (cwdPath.startsWith("/")) {
      entry.parentPath = parentRelative === "." ? normalizePath(cwdPath) : joinPath(cwdPath, parentRelative);
    } else {
      entry.parentPath = parentRelative === "." ? normalizePath(cwdPath) : joinPath(cwdPath, parentRelative);
    }
    return entry;
  };

  const globSyncResolved = (patterns, options = {}) => {
    const patternList = (Array.isArray(patterns) ? patterns : [patterns])
      .flatMap((pattern) => expandSimpleBraces(String(toFsPath(pattern))));
    const cwdInput = options?.cwd === undefined ? "." : toFsPath(options.cwd);
    const rootPath = resolve(cwdInput);
    const compiledPatterns = patternList.map((pattern) => ({
      raw: pattern,
      regex: globPatternToRegex(pattern),
      hidden: patternAllowsHidden(pattern)
    }));
    const excludePatterns = Array.isArray(options?.exclude)
      ? options.exclude.flatMap((pattern) => expandSimpleBraces(String(toFsPath(pattern)))).map(globPatternToRegex)
      : [];
    const matches = [];
    const seen = new Set();

    const maybePush = (absolutePath) => {
      const relative = relativePath(rootPath, absolutePath) || ".";
      if (relative === ".") return;
      const segments = relative.split("/");
      const isHidden = segments.some((segment) => segment.startsWith("."));
      const matched = compiledPatterns.some((pattern) => {
        if (isHidden && !pattern.hidden) return false;
        return pattern.regex.test(relative);
      });
      if (!matched || seen.has(relative)) return;
      const dirent = options?.withFileTypes ? makeGlobDirent(absolutePath, rootPath, options?.cwd) : null;
      if (typeof options?.exclude === "function") {
        const value = options.withFileTypes ? dirent : relative;
        if (options.exclude(value)) return;
      }
      if (excludePatterns.some((regex) => regex.test(relative))) return;
      seen.add(relative);
      matches.push(options?.withFileTypes ? dirent : relative);
    };

    const walk = (directory) => {
      const entries = kernel.fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const absolutePath = joinPath(directory, entry.name);
        maybePush(absolutePath);
        if (entry.isDirectory()) walk(absolutePath);
      }
    };

    kernel.fs.statSync(rootPath);
    walk(rootPath);
    return matches;
  };

  const fs = {
    readFileSync: (path, options) => {
      if (isFileDescriptor(path)) return readFileDescriptorSync(path, options);
      return kernel.fs.readFileSync(resolve(path), options);
    },
    writeFileSync: (path, data, options) => {
      if (isFileDescriptor(path)) {
        writeFileDescriptorSync(path, data, options);
        return;
      }
      kernel.fs.writeFileSync(resolve(path), data, options);
    },
    appendFileSync: (path, data, options) => {
      if (isFileDescriptor(path)) {
        writeFileDescriptorSync(path, data, options);
        return;
      }
      kernel.fs.appendFileSync(resolve(path), data, options);
    },
    existsSync: (path) => kernel.fs.existsSync(resolve(path)),
    accessSync: (path, mode) => accessSyncResolved(resolve(path), mode),
    statSync: function statSync(path, options) {
      return toBigIntStats(kernel.fs.statSync(resolve(path)), options);
    },
    lstatSync: function lstatSync(path, options) {
      return toBigIntStats(kernel.fs.lstatSync(resolve(path)), options);
    },
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
    lutimesSync: (path, atime, mtime) => kernel.fs.lutimesSync(resolve(path), atime, mtime),
    readdirSync: (path, options) => {
      if (options && typeof options === "object" && options.withFileTypes) return readdirWithDirents(path, options);
      return readdirNames(path, options);
    },
    mkdirSync: (path, options) => kernel.fs.mkdirSync(resolve(path), options),
    rmSync: (path, options) => kernel.fs.rmSync(resolve(path), options),
    rmdirSync: (path, options) => kernel.fs.rmdirSync(resolve(path), options),
    unlinkSync: (path) => kernel.fs.unlinkSync(resolve(path)),
    truncateSync: function truncateSync(path, length = 0) {
      return truncateResolvedFile(resolve(path), length);
    },
    renameSync: (oldPath, newPath) => kernel.fs.renameSync(resolve(oldPath), resolve(newPath)),
    copyFileSync: function copyFileSync(source, destination, mode = 0) {
      const resolvedDestination = resolve(destination);
      if ((Number(mode) & FS_CONSTANTS.COPYFILE_EXCL) && kernel.fs.existsSync(resolvedDestination)) {
        throw createFsError("EEXIST", `file already exists, copyfile '${resolve(source)}' -> '${resolvedDestination}'`, {
          path: resolve(source),
          dest: resolvedDestination
        });
      }
      kernel.fs.copyFileSync(resolve(source), resolvedDestination);
    },
    cpSync: (source, destination, options) => copyTreeSync(source, destination, options),
    chmodSync: (path, mode) => kernel.fs.chmodSync(resolve(path), mode),
    chownSync: (path, uid, gid) => kernel.fs.chownSync(resolve(path), uid, gid),
    lchmodSync: (path, mode) => kernel.fs.chmodSync(resolve(path), mode, { followSymlinks: false }),
    lchownSync: (path, uid, gid) => kernel.fs.chownSync(resolve(path), uid, gid, { followSymlinks: false }),
    linkSync: (existingPath, newPath) => kernel.fs.linkSync(resolve(existingPath), resolve(newPath)),
    realpathSync: (path, options) => encodePathResult(kernel.fs.realpathSync(resolve(path)), options),
    readlinkSync: (path, options) => encodePathResult(kernel.fs.readlinkSync(resolve(path)), options),
    symlinkSync: function symlinkSync(target, path) {
      return kernel.fs.symlinkSync(target, resolve(path));
    },
    openSync: function openSync(path, flags = "r") {
      const resolved = resolve(path);
      const mode = parseOpenFlags(flags);
      if (mode.directory && mode.create) {
        throw createFsError("EINVAL", `invalid argument, open '${resolved}'`, { path: resolved });
      }
      if (mode.exclusive && mode.create && kernel.fs.existsSync(resolved)) {
        throw createFsError("EEXIST", `file already exists, open '${resolved}'`, { path: resolved });
      }
      if (mode.truncate) {
        kernel.fs.writeFileSync(resolved, new Uint8Array());
      } else if (mode.create) {
        if (!kernel.fs.existsSync(resolved)) kernel.fs.writeFileSync(resolved, new Uint8Array());
      } else {
        const stats = kernel.fs.statSync(resolved);
        if (mode.directory && !stats.isDirectory()) {
          throw createFsError("ENOTDIR", `not a directory, open '${resolved}'`, { path: resolved });
        }
      }
      const fd = nextFd++;
      descriptors.set(fd, {
        path: resolved,
        flags: mode.raw,
        readable: mode.readable,
        writable: mode.writable,
        append: mode.append,
        position: mode.append ? kernel.fs.readFileSync(resolved).byteLength : 0
      });
      return fd;
    },
    closeSync: (fd) => {
      descriptors.delete(fd);
    },
    readSync: function readSync(fd, buffer, offsetOrOptions = 0, length, position = null) {
      const descriptor = descriptorFor(fd, "read");
      assertReadable(descriptor);
      const target = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const options = normalizeBufferIoOptions(target, offsetOrOptions, length, position);
      const source = kernel.fs.readFileSync(descriptor.path);
      const readPosition = options.position === null || options.position === undefined ? descriptor.position : Number(options.position);
      const bytes = source.subarray(readPosition, readPosition + options.length);
      target.set(bytes, options.offset);
      if (options.position === null || options.position === undefined) descriptor.position = readPosition + bytes.byteLength;
      return bytes.byteLength;
    },
    writeSync: (fd, data, offsetOrPosition, lengthOrEncoding, position) => {
      const descriptor = descriptorFor(fd, "write");
      assertWritable(descriptor);
      let bytes;
      let writePosition = position;
      let positionalWrite = false;
      if (typeof data === "string") {
        const encoding = typeof lengthOrEncoding === "string" ? lengthOrEncoding : "utf8";
        bytes = dataToBytes(data, encoding);
        positionalWrite = typeof offsetOrPosition === "number";
        writePosition = typeof offsetOrPosition === "number" ? offsetOrPosition : descriptor.position;
      } else {
        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
        const options = normalizeBufferIoOptions(buffer, offsetOrPosition, lengthOrEncoding, position);
        bytes = buffer.subarray(options.offset, options.offset + options.length);
        positionalWrite = options.position !== null && options.position !== undefined;
        writePosition = positionalWrite ? Number(options.position) : descriptor.position;
      }
      const existing = kernel.fs.existsSync(descriptor.path) ? kernel.fs.readFileSync(descriptor.path) : new Uint8Array();
      const targetPosition = descriptor.append ? existing.byteLength : Number(writePosition ?? descriptor.position ?? 0);
      const output = new Uint8Array(Math.max(existing.byteLength, targetPosition + bytes.byteLength));
      output.set(existing.subarray(0, Math.min(existing.byteLength, output.byteLength)));
      output.set(bytes, targetPosition);
      kernel.fs.writeFileSync(descriptor.path, output);
      if (!positionalWrite || descriptor.append) descriptor.position = targetPosition + bytes.byteLength;
      return bytes.byteLength;
    },
    readvSync: function readvSync(fd, buffers, position = null) {
      const views = normalizeIoVectors(buffers);
      let bytesRead = 0;
      let readPosition = position === null || position === undefined ? null : Number(position);
      for (const buffer of views) {
        const count = fs.readSync(fd, buffer, 0, buffer.byteLength, readPosition);
        bytesRead += count;
        if (readPosition !== null) readPosition += count;
        if (count < buffer.byteLength) break;
      }
      return bytesRead;
    },
    writevSync: function writevSync(fd, buffers, position = null) {
      const views = normalizeIoVectors(buffers);
      let bytesWritten = 0;
      let writePosition = position === null || position === undefined ? null : Number(position);
      for (const buffer of views) {
        const count = fs.writeSync(fd, buffer, 0, buffer.byteLength, writePosition);
        bytesWritten += count;
        if (writePosition !== null) writePosition += count;
        if (count < buffer.byteLength) break;
      }
      return bytesWritten;
    },
    fstatSync: function fstatSync(fd, options) {
      return toBigIntStats(kernel.fs.statSync(descriptorFor(fd, "fstat").path), options);
    },
    ftruncateSync: (fd, length = 0) => truncateResolvedFile(descriptorFor(fd, "ftruncate").path, length),
    fchmodSync: (fd, mode) => kernel.fs.chmodSync(descriptorFor(fd, "fchmod").path, mode),
    fchownSync: (fd, uid, gid) => kernel.fs.chownSync(descriptorFor(fd, "fchown").path, uid, gid),
    futimesSync: (fd, atime, mtime) => kernel.fs.utimesSync(descriptorFor(fd, "futimes").path, atime, mtime),
    fsyncSync: (fd) => {
      descriptorFor(fd, "fsync");
    },
    fdatasyncSync: (fd) => {
      descriptorFor(fd, "fdatasync");
    },
    mkdtempSync: function mkdtempSync(prefix, options) {
      const base = normalizeMkdtempPrefix(prefix);
      for (let attempt = 0; attempt < 100; attempt++) {
        const suffix = randomSuffix();
        const candidate = `${base}${suffix}`;
        const resolved = resolve(candidate);
        if (kernel.fs.existsSync(resolved)) continue;
        kernel.fs.mkdirSync(resolved);
        return encodePathResult(candidate.startsWith("/") ? resolved : candidate, options);
      }
      throw Object.assign(new Error(`EEXIST: too many temporary directories match prefix '${base}'`), { code: "EEXIST" });
    },
    mkdtempDisposableSync: function mkdtempDisposableSync(prefix) {
      const path = fs.mkdtempSync(prefix);
      return createDisposableTempDirectory(path, () => fs.rmSync(path, { recursive: true, force: true }));
    },
    opendirSync: (path, options) => new Dir(path, options),
    globSync: function globSync(pattern, options = {}) {
      return globSyncResolved(pattern, options);
    },
    openAsBlob: function openAsBlob(path, options = {}) {
      if (typeof Blob !== "function") {
        return Promise.reject(Object.assign(new Error("Blob is not available in this environment"), {
          code: "ERR_OPENCONTAINERS_BLOB_UNAVAILABLE"
        }));
      }
      validateOpenAsBlobArgs(path, options);
      const type = options && typeof options === "object" && options.type !== undefined
        ? String(options.type)
        : "";
      return Promise.resolve(new Blob([fs.readFileSync(path)], { type }));
    },
    watch: (path, options, listener) => createFSWatcher(path, options, listener),
    _toUnixTimestamp: toUnixTimestamp,
    watchFile: (path, options, listener) => {
      const resolved = resolve(path);
      const callback = typeof options === "function" ? options : listener;
      if (typeof callback !== "function") throw new TypeError("watchFile listener is required");
      let previous = kernel.fs.existsSync(resolved) ? kernel.fs.statSync(resolved) : null;
      const rawWatcher = kernel.fs.watch(resolved, () => {
        const current = kernel.fs.existsSync(resolved) ? kernel.fs.statSync(resolved) : null;
        callback(current, previous);
        previous = current;
      });
      const entry = { listener: callback, watcher: rawWatcher, path: resolved };
      const entries = fileWatchers.get(resolved) ?? new Set();
      entries.add(entry);
      fileWatchers.set(resolved, entries);
      return new StatWatcher(entry);
    },
    unwatchFile: (path, listener) => {
      const resolved = resolve(path);
      const entries = fileWatchers.get(resolved);
      if (!entries) return;
      for (const entry of [...entries]) {
        if (typeof listener === "function" && entry.listener !== listener) continue;
        removeFileWatcherEntry(entry);
      }
    },
    createReadStream: function createReadStream(path, options) {
      return new readStreamConstructor(path, options);
    },
    createWriteStream: function createWriteStream(path, options) {
      return new writeStreamConstructor(path, options);
    },
    constants: FS_CONSTANTS
  };

  Object.defineProperty(fs, "constants", {
    configurable: true,
    enumerable: true,
    value: FS_CONSTANTS,
    writable: false
  });

  fs.Dirent = Dirent;
  fs.Dir = Dir;
  fs.Utf8Stream = Utf8Stream;
  fs.ReadStream = ReadStream;
  fs.WriteStream = WriteStream;
  fs.FileReadStream = ReadStream;
  fs.FileWriteStream = WriteStream;
  fs.Stats = createDeprecatedStatsConstructor(kernel.fs.statSync("/").constructor);
  alignFsStreamPrototypeMetadata(ReadStream, WriteStream);
  const readStreamAccessor = createNamedAccessor("ReadStream", () => readStreamConstructor, (value) => {
    readStreamConstructor = value;
  });
  const writeStreamAccessor = createNamedAccessor("WriteStream", () => writeStreamConstructor, (value) => {
    writeStreamConstructor = value;
  });
  const fileReadStreamAccessor = createNamedAccessor("FileReadStream", () => fileReadStreamConstructor, (value) => {
    fileReadStreamConstructor = value;
  });
  const fileWriteStreamAccessor = createNamedAccessor("FileWriteStream", () => fileWriteStreamConstructor, (value) => {
    fileWriteStreamConstructor = value;
  });
  const utf8StreamAccessor = createNamedAccessor("Utf8Stream", () => Utf8Stream);
  Object.defineProperties(fs, {
    ReadStream: {
      configurable: true,
      enumerable: true,
      get: readStreamAccessor.get,
      set: readStreamAccessor.set
    },
    WriteStream: {
      configurable: true,
      enumerable: true,
      get: writeStreamAccessor.get,
      set: writeStreamAccessor.set
    },
    FileReadStream: {
      configurable: true,
      enumerable: true,
      get: fileReadStreamAccessor.get,
      set: fileReadStreamAccessor.set
    },
    FileWriteStream: {
      configurable: true,
      enumerable: true,
      get: fileWriteStreamAccessor.get,
      set: fileWriteStreamAccessor.set
    },
    Utf8Stream: {
      configurable: true,
      enumerable: true,
      get: utf8StreamAccessor.get
    }
  });
  alignFsSyncFunctionMetadata(fs);

  fs.readFile = wrapCallback((path, options) => {
    assertNotAborted(options);
    return fs.readFileSync(path, options);
  });
  fs.writeFile = wrapCallback((path, data, options) => {
    assertNotAborted(options);
    return fs.writeFileSync(path, data, options);
  });
  fs.appendFile = wrapCallback((path, data, options) => {
    assertNotAborted(options);
    return fs.appendFileSync(path, data, options);
  });
  fs.readdir = wrapCallback((path, options) => fs.readdirSync(path, options));
  fs.access = wrapCallback((path, mode) => fs.accessSync(path, mode));
  fs.stat = wrapCallback((path, options) => fs.statSync(path, options));
  fs.lstat = wrapCallback((path, options) => fs.lstatSync(path, options));
  fs.statfs = wrapCallback((path, options) => fs.statfsSync(path, options));
  fs.utimes = wrapCallback((path, atime, mtime) => fs.utimesSync(path, atime, mtime));
  fs.lutimes = wrapCallback((path, atime, mtime) => fs.lutimesSync(path, atime, mtime));
  fs.mkdir = wrapCallback((path, options) => fs.mkdirSync(path, options));
  fs.rm = wrapCallback((path, options) => fs.rmSync(path, options));
  fs.rmdir = wrapCallback((path, options) => fs.rmdirSync(path, options));
  fs.unlink = wrapCallback((path) => fs.unlinkSync(path));
  fs.rename = wrapCallback((oldPath, newPath) => fs.renameSync(oldPath, newPath));
  fs.copyFile = wrapCallback((source, destination, mode) => fs.copyFileSync(source, destination, mode));
  fs.cp = function cp(source, destination, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") throw invalidArgType("cb", "function", callback);
    copyTree(source, destination, options).then(
      () => callback(null),
      (error) => callback(error)
    );
  };
  fs.chmod = wrapCallback((path, mode) => fs.chmodSync(path, mode));
  fs.chown = wrapCallback((path, uid, gid) => fs.chownSync(path, uid, gid));
  fs.lchmod = wrapCallback((path, mode) => fs.lchmodSync(path, mode));
  fs.lchown = wrapCallback((path, uid, gid) => fs.lchownSync(path, uid, gid));
  fs.link = wrapCallback((existingPath, newPath) => fs.linkSync(existingPath, newPath));
  fs.realpath = wrapCallback((path, options) => fs.realpathSync(path, options));
  fs.realpath.native = fs.realpath;
  fs.open = wrapCallback((path, flags, mode) => fs.openSync(path, flags, mode));
  fs.close = wrapCallback((fd) => fs.closeSync(fd));
  fs.read = function read(fd, buffer, offset, length, position, callback) {
    if (typeof offset === "function") {
      callback = offset;
      offset = undefined;
      length = undefined;
      position = undefined;
    } else if (typeof length === "function") {
      callback = length;
      length = undefined;
      position = undefined;
    } else if (typeof position === "function") {
      callback = position;
      position = undefined;
    }
    queueMicrotask(() => {
      try {
        const bytesRead = fs.readSync(fd, buffer, offset, length, position);
        callback?.(null, bytesRead, buffer);
      } catch (error) {
        callback?.(error);
      }
    });
  };
  fs.write = function write(fd, data, offset, length, position, callback) {
    if (typeof offset === "function") {
      callback = offset;
      offset = undefined;
      length = undefined;
      position = undefined;
    } else if (typeof length === "function") {
      callback = length;
      length = undefined;
      position = undefined;
    } else if (typeof position === "function") {
      callback = position;
      position = undefined;
    }
    queueMicrotask(() => {
      try {
        const bytesWritten = fs.writeSync(fd, data, offset, length, position);
        callback?.(null, bytesWritten, data);
      } catch (error) {
        callback?.(error);
      }
    });
  };
  fs.readv = (fd, buffers, position, callback) => {
    if (typeof position === "function") {
      callback = position;
      position = null;
    }
    queueMicrotask(() => {
      try {
        const bytesRead = fs.readvSync(fd, buffers, position);
        callback?.(null, bytesRead, buffers);
      } catch (error) {
        callback?.(error);
      }
    });
  };
  fs.writev = (fd, buffers, position, callback) => {
    if (typeof position === "function") {
      callback = position;
      position = null;
    }
    queueMicrotask(() => {
      try {
        const bytesWritten = fs.writevSync(fd, buffers, position);
        callback?.(null, bytesWritten, buffers);
      } catch (error) {
        callback?.(error);
      }
    });
  };
  fs.truncate = wrapCallback((path, length) => fs.truncateSync(path, length));
  fs.ftruncate = wrapCallback((fd, length) => fs.ftruncateSync(fd, length));
  fs.fstat = wrapCallback((fd, options) => fs.fstatSync(fd, options));
  fs.fchmod = wrapCallback((fd, mode) => fs.fchmodSync(fd, mode));
  fs.fchown = wrapCallback((fd, uid, gid) => fs.fchownSync(fd, uid, gid));
  fs.futimes = wrapCallback((fd, atime, mtime) => fs.futimesSync(fd, atime, mtime));
  fs.fsync = wrapCallback((fd) => fs.fsyncSync(fd));
  fs.fdatasync = wrapCallback((fd) => fs.fdatasyncSync(fd));
  fs.mkdtemp = function mkdtemp(prefix, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") throw invalidArgType("cb", "function", callback);
    queueMicrotask(() => {
      try {
        callback(null, fs.mkdtempSync(prefix, options));
      } catch (error) {
        callback(error);
      }
    });
  };
  fs.opendir = wrapCallback((path, options) => fs.opendirSync(path, options));
  fs.glob = wrapCallback((pattern, options) => fs.globSync(pattern, options));
  fs.readlink = wrapCallback((path, options) => fs.readlinkSync(path, options));
  fs.symlink = wrapCallback((target, path) => fs.symlinkSync(target, path));
  fs.exists = (path, callback) => {
    queueMicrotask(() => callback?.(fs.existsSync(path)));
  };
  fs.readlinkSync.native = fs.readlinkSync;
  fs.realpathSync.native = fs.realpathSync;
  alignFsCallbackFunctionMetadata(fs);
  alignFsHelperPrototypeMetadata(fs);

  const promises = {
    access: async (path, mode) => fs.accessSync(path, mode),
    copyFile: async (source, destination, mode) => fs.copyFileSync(source, destination, mode),
    cp: async (source, destination, options) => copyTree(source, destination, options),
    glob: async function* (pattern, options) {
      for (const match of fs.globSync(pattern, options)) yield match;
    },
    open: async (path, flags, mode) => {
      const fd = fs.openSync(path, flags, mode);
      return createFileHandle(fd);
    },
    opendir: function opendir(path, options) {
      return Promise.resolve().then(() => fs.opendirSync(path, options));
    },
    rename: async (oldPath, newPath) => fs.renameSync(oldPath, newPath),
    truncate: async (path, length) => fs.truncateSync(path, length),
    rm: async (path, options) => fs.rmSync(path, options),
    rmdir: async (path, options) => fs.rmdirSync(path, options),
    mkdir: async (path, options) => fs.mkdirSync(path, options),
    readdir: async (path, options) => fs.readdirSync(path, options),
    readlink: async (path, options) => fs.readlinkSync(path, options),
    symlink: async (target, path) => fs.symlinkSync(target, path),
    lstat: async (path, options) => fs.lstatSync(path, options),
    stat: async (path, options) => fs.statSync(path, options),
    statfs: async (path, options) => fs.statfsSync(path, options),
    link: async (existingPath, newPath) => fs.linkSync(existingPath, newPath),
    unlink: async (path) => fs.unlinkSync(path),
    chmod: async (path, mode) => fs.chmodSync(path, mode),
    lchmod: async (path, mode) => fs.lchmodSync(path, mode),
    lchown: async (path, uid, gid) => fs.lchownSync(path, uid, gid),
    chown: async (path, uid, gid) => fs.chownSync(path, uid, gid),
    utimes: async (path, atime, mtime) => fs.utimesSync(path, atime, mtime),
    lutimes: async (path, atime, mtime) => fs.lutimesSync(path, atime, mtime),
    realpath: async (path, options) => fs.realpathSync(path, options),
    mkdtemp: async (prefix, options) => fs.mkdtempSync(prefix, options),
    mkdtempDisposable: async (prefix) => {
      const path = fs.mkdtempSync(prefix);
      return createDisposableTempDirectory(path, async () => fs.promises.rm(path, { recursive: true, force: true }), { async: true });
    },
    writeFile: async (path, data, options) => {
      assertNotAborted(options);
      return fs.writeFileSync(path, data, options);
    },
    appendFile: async (path, data, options) => {
      assertNotAborted(options);
      return fs.appendFileSync(path, data, options);
    },
    readFile: async (path, options) => {
      assertNotAborted(options);
      return fs.readFileSync(path, options);
    },
    watch: watchIterator
  };
  Object.defineProperty(fs, "promises", {
    configurable: true,
    enumerable: true,
    get() {
      return promises;
    }
  });
  promises.constants = FS_CONSTANTS;
  promises.realpath.native = promises.realpath;
  alignFsPromisesFunctionMetadata(promises);
  reorderFsExports(fs);
  Object.defineProperty(fs, "constants", {
    configurable: false,
    enumerable: true,
    value: FS_CONSTANTS,
    writable: false
  });

  return fs;
}

function reorderFsExports(fs) {
  const descriptors = [];
  for (const key of FS_EXPORT_ORDER) {
    const descriptor = Object.getOwnPropertyDescriptor(fs, key);
    if (descriptor?.enumerable) descriptors.push([key, descriptor]);
  }
  for (const [key] of descriptors) delete fs[key];
  for (const [key, descriptor] of descriptors) Object.defineProperty(fs, key, descriptor);
}

function alignFsCallbackFunctionMetadata(fs) {
  const metadata = {
    readFile: { length: 3 },
    writeFile: { length: 4 },
    appendFile: { length: 4 },
    readdir: { length: 3 },
    access: { length: 3 },
    stat: { length: 1 },
    lstat: { length: 1 },
    statfs: { length: 1 },
    utimes: { length: 4 },
    lutimes: { length: 4 },
    mkdir: { length: 3 },
    rm: { length: 3 },
    rmdir: { length: 3 },
    unlink: { length: 2 },
    rename: { length: 3 },
    copyFile: { length: 4 },
    cp: { length: 4 },
    chmod: { length: 3 },
    chown: { length: 4 },
    lchmod: { length: 3 },
    lchown: { length: 4 },
    link: { length: 3 },
    realpath: { length: 3 },
    open: { length: 4 },
    close: { length: 1 },
    read: { length: 6 },
    write: { length: 6 },
    readv: { length: 4 },
    writev: { length: 4 },
    truncate: { length: 3 },
    ftruncate: { length: 1 },
    fstat: { length: 1 },
    fchmod: { length: 3 },
    fchown: { length: 4 },
    futimes: { length: 4 },
    fsync: { length: 2 },
    fdatasync: { length: 2 },
    mkdtemp: { length: 3 },
    opendir: { length: 3 },
    glob: { length: 3 },
    readlink: { length: 3 },
    symlink: { length: 4 },
    exists: { length: 2 }
  };

  for (const [key, options] of Object.entries(metadata)) {
    const fn = fs[key];
    if (typeof fn !== "function") continue;
    Object.defineProperty(fn, "name", { configurable: true, value: key });
    Object.defineProperty(fn, "length", { configurable: true, value: options.length });
  }
}

function createNamedAccessor(name, getter, setter) {
  Object.defineProperty(getter, "name", {
    configurable: true,
    value: `get ${name}`
  });
  if (setter) {
    Object.defineProperty(setter, "name", {
      configurable: true,
      value: `set ${name}`
    });
  }
  return { get: getter, set: setter };
}

function createDeprecatedStatsConstructor(StatsConstructor) {
  function deprecated(
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
    return new StatsConstructor(
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
    );
  }
  deprecated.prototype = StatsConstructor.prototype;
  return deprecated;
}

function alignFsSyncFunctionMetadata(fs) {
  const metadata = {
    copyFileSync: { length: 3 },
    createReadStream: { length: 2 },
    createWriteStream: { length: 2 },
    openSync: { length: 3 },
    readSync: { length: 5 },
    readvSync: { length: 3 },
    statSync: { length: 1 },
    lstatSync: { length: 1 },
    fstatSync: { length: 1 },
    truncateSync: { length: 2 },
    mkdtempSync: { length: 2 },
    mkdtempDisposableSync: { length: 2 },
    globSync: { length: 2 },
    writevSync: { length: 3 },
    symlinkSync: { length: 3 },
    Dirent: { length: 3 },
    Dir: { length: 3 }
  };

  for (const [key, options] of Object.entries(metadata)) {
    const fn = fs[key];
    if (typeof fn !== "function") continue;
    Object.defineProperty(fn, "length", { configurable: true, value: options.length });
  }
}

function alignFsHelperPrototypeMetadata(fs) {
  for (const key of FS_EXPORT_ORDER) {
    if (FS_HELPER_PROTOTYPE_EXCLUDED_EXPORTS.has(key)) continue;
    ensureFunctionOwnPrototype(fs[key]);
  }
}

function ensureFunctionOwnPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    value: fn,
    writable: true
  });
  Object.defineProperty(fn, "prototype", {
    value: prototype,
    writable: true
  });
}

function alignFsStreamPrototypeMetadata(ReadStream, WriteStream) {
  const metadata = [
    [ReadStream.prototype, {
      autoClose: { configurable: false },
      _construct: { enumerable: true, length: 1, name: "_construct" },
      _read: { enumerable: true, length: 1, name: "" },
      _destroy: { enumerable: true, length: 2, name: "" },
      close: { enumerable: true, length: 1, name: "" },
      pending: { configurable: true }
    }],
    [WriteStream.prototype, {
      autoClose: { configurable: false },
      _construct: { enumerable: true, length: 1, name: "_construct" },
      _write: { enumerable: true, length: 3, name: "" },
      _writev: { enumerable: true, length: 2, name: "" },
      _destroy: { enumerable: true, length: 2, name: "" },
      close: { enumerable: true, length: 1, name: "" },
      destroySoon: { enumerable: true, length: 3, name: "" },
      pending: { configurable: true }
    }]
  ];

  for (const [prototype, properties] of metadata) {
    for (const [key, options] of Object.entries(properties)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (!descriptor) continue;
      if (descriptor.value && typeof descriptor.value === "function") {
        Object.defineProperty(descriptor.value, "name", { configurable: true, value: options.name });
        Object.defineProperty(descriptor.value, "length", { configurable: true, value: options.length });
        ensureFunctionOwnPrototype(descriptor.value);
      }
      Object.defineProperty(prototype, key, {
        ...descriptor,
        configurable: options.configurable ?? descriptor.configurable,
        enumerable: options.enumerable ?? descriptor.enumerable
      });
    }
  }
}

function alignFsPromisesFunctionMetadata(promises) {
  const metadata = {
    access: { length: 1 },
    lstat: { length: 1 },
    mkdtemp: { length: 2 },
    mkdtempDisposable: { length: 2 },
    opendir: { length: 3 },
    readlink: { length: 2 },
    realpath: { length: 2 },
    stat: { length: 1 },
    statfs: { length: 1 },
    symlink: { length: 3 },
    truncate: { length: 1 },
    watch: { length: 1, name: "watch" }
  };

  for (const [key, options] of Object.entries(metadata)) {
    const fn = promises[key];
    if (typeof fn !== "function") continue;
    if (options.name !== undefined) {
      Object.defineProperty(fn, "name", { configurable: true, value: options.name });
    }
    Object.defineProperty(fn, "length", { configurable: true, value: options.length });
  }
}
