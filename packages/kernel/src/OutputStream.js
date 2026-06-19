import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { RuntimeBuffer } from "../../runtime-node/src/builtins/buffer.js";

export class OutputStream extends EventEmitter {
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
}
