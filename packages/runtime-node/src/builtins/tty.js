import { EventEmitter } from "./events.js";
import { Writable } from "./stream.js";

export function isatty(fd) {
  return Number.isInteger(fd) && [0, 1, 2].includes(fd);
}

export class ReadStream extends EventEmitter {
  constructor(fd, options) {
    super();
    validateFd(fd);
    this.fd = fd;
    this.isTTY = isatty(fd);
    this.isRaw = false;
  }

  setRawMode(value) {
    this.isRaw = Boolean(value);
    return this;
  }
}

export class WriteStream extends Writable {
  constructor(fd) {
    super({
      write(_chunk, _encoding, callback) {
        callback?.();
      }
    });
    validateFd(fd);
    this.fd = fd;
    this.isTTY = isatty(fd);
    this.columns = 80;
    this.rows = 24;
  }

  clearLine(direction, callback) {
    const mode = direction < 0 ? 1 : direction > 0 ? 0 : 2;
    return writeControlSequence(this, `\x1b[${mode}K`, callback);
  }

  clearScreenDown(callback) {
    return writeControlSequence(this, "\x1b[0J", callback);
  }

  cursorTo(x, y, callback) {
    const cb = typeof y === "function" ? y : callback;
    if (typeof x !== "number") {
      queueMicrotask(() => cb?.());
      return true;
    }
    if (Number.isNaN(x)) throw invalidCursorArgument("x", x);
    if (typeof y === "number") {
      if (Number.isNaN(y)) throw invalidCursorArgument("y", y);
      const row = y;
      const column = x;
      return writeControlSequence(this, `\x1b[${row + 1};${column + 1}H`, cb);
    }
    const column = x;
    return writeControlSequence(this, `\x1b[${column + 1}G`, cb);
  }

  moveCursor(dx, dy, callback) {
    let sequence = "";
    const deltaY = Number(dy) || 0;
    const deltaX = Number(dx) || 0;
    if (deltaX < 0) sequence += `\x1b[${Math.abs(deltaX)}D`;
    if (deltaX > 0) sequence += `\x1b[${deltaX}C`;
    if (deltaY < 0) sequence += `\x1b[${Math.abs(deltaY)}A`;
    if (deltaY > 0) sequence += `\x1b[${deltaY}B`;
    return writeControlSequence(this, sequence, callback);
  }

  getWindowSize() {
    return [this.columns, this.rows];
  }

  _refreshSize() {
    this.emit("resize");
  }

  getColorDepth() {
    return colorDepthFromEnv(arguments[0]);
  }

  hasColors(count, env) {
    if (typeof count === "object" && count !== null) {
      env = count;
      count = undefined;
    }

    const requiredColors = count === undefined && arguments.length <= 1 ? 16 : validateColorCount(count);
    return 2 ** this.getColorDepth(env) >= requiredColors;
  }
}

function writeControlSequence(stream, sequence, callback) {
  validateCallbackArgument(callback);
  if (!sequence) {
    callback?.();
    return true;
  }
  return stream.write(sequence, callback);
}

function validateFd(fd) {
  if (Number.isInteger(fd) && fd >= 0) return;
  const error = new RangeError(`"fd" must be a positive integer: ${fd}`);
  error.code = "ERR_INVALID_FD";
  throw error;
}

function invalidCursorArgument(name, value) {
  return Object.assign(new TypeError(`The argument '${name}' is invalid. Received ${value}`), {
    code: "ERR_INVALID_ARG_VALUE"
  });
}

function colorDepthFromEnv(env) {
  if (env === undefined) return 24;

  if (env.FORCE_COLOR !== undefined) {
    const forceColor = String(env.FORCE_COLOR).toLowerCase();
    if (forceColor === "0" || forceColor === "false") return 1;
    if (forceColor === "2") return 8;
    if (forceColor === "3") return 24;
    return 4;
  }

  if (env.NODE_DISABLE_COLORS !== undefined || env.NO_COLOR !== undefined || env.TERM === "dumb") {
    return 1;
  }

  if (env.TMUX !== undefined) return 24;

  const termProgram = String(env.TERM_PROGRAM ?? "");
  if (termProgram === "MacTerm") {
    return 24;
  }
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") return 8;

  const colorTerm = String(env.COLORTERM ?? "").toLowerCase();
  if (colorTerm === "truecolor" || colorTerm === "24bit") return 24;

  const term = String(env.TERM ?? "").toLowerCase();
  if (term.includes("256color")) return 8;
  if (/(ansi|color|cygwin|linux|screen|tmux|vt100|xterm)/.test(term)) return 4;

  return 1;
}

function validateColorCount(count) {
  if (typeof count !== "number") {
    const error = new TypeError(`The "count" argument must be of type number. Received ${formatReceivedValue(count)}`);
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
  }
  if (!Number.isInteger(count)) {
    const error = new RangeError(`The value of "count" is out of range. It must be an integer. Received ${count}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  if (count < 2 || count > Number.MAX_SAFE_INTEGER) {
    const error = new RangeError(`The value of "count" is out of range. It must be >= 2 && <= ${Number.MAX_SAFE_INTEGER}. Received ${count}`);
    error.code = "ERR_OUT_OF_RANGE";
    throw error;
  }
  return count;
}

function validateCallbackArgument(callback) {
  if (callback === undefined || typeof callback === "function") return;
  const error = new TypeError(`The "callback" argument must be of type function. Received ${formatReceivedValue(callback)}`);
  error.code = "ERR_INVALID_ARG_TYPE";
  throw error;
}

function formatReceivedValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "boolean") return `type boolean (${value})`;
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

export default {
  isatty,
  ReadStream,
  WriteStream
};

Object.defineProperty(WriteStream.prototype, "isTTY", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: true
});

for (const [prototype, names] of [
  [ReadStream.prototype, ["setRawMode"]],
  [
    WriteStream.prototype,
    [
      "clearLine",
      "clearScreenDown",
      "cursorTo",
      "moveCursor",
      "getWindowSize",
      "_refreshSize",
      "getColorDepth",
      "hasColors"
    ]
  ]
]) {
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor) {
      if (
        name === "setRawMode"
        || name === "clearLine"
        || name === "clearScreenDown"
        || name === "cursorTo"
        || name === "moveCursor"
        || name === "getWindowSize"
        || name === "_refreshSize"
      ) {
        Object.defineProperty(descriptor.value, "name", {
          configurable: true,
          value: ""
        });
      }
      ensureFunctionOwnPrototype(descriptor.value);
      Object.defineProperty(prototype, name, { ...descriptor, enumerable: true });
    }
  }
}

reorderPrototype(WriteStream.prototype, [
  "constructor",
  "isTTY",
  "getColorDepth",
  "hasColors",
  "_refreshSize",
  "cursorTo",
  "moveCursor",
  "clearLine",
  "clearScreenDown",
  "getWindowSize"
]);

function reorderPrototype(prototype, names) {
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

function ensureFunctionOwnPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    value: prototype,
    writable: true
  });
}
