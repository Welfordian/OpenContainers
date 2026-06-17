import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { RuntimeBuffer } from "../../runtime-node/src/builtins/buffer.js";

export class OutputStream extends EventEmitter {
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
}
