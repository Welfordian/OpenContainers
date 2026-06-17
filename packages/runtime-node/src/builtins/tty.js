import { EventEmitter } from "./events.js";
import { Writable } from "./stream.js";

export function isatty(fd) {
  return [0, 1, 2].includes(Number(fd));
}

export class ReadStream extends EventEmitter {
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
}

export class WriteStream extends Writable {
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
}

export default {
  isatty,
  ReadStream,
  WriteStream
};
