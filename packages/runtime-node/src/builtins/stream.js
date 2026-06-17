import { EventEmitter } from "./events.js";

export class Stream extends EventEmitter {
  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.on("end", () => destination.end?.());
    return destination;
  }
}

export class Readable extends Stream {
  constructor() {
    super();
    this.readable = true;
    this.destroyed = false;
  }

  push(chunk) {
    if (chunk === null) {
      this.emit("end");
      this.emit("close");
      return false;
    }
    this.emit("data", chunk);
    return true;
  }

  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.on("end", () => destination.end?.());
    return destination;
  }

  destroy(error) {
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
  }
}

export class Writable extends Stream {
  constructor({ write } = {}) {
    super();
    this.writable = true;
    this.destroyed = false;
    this.#write = write;
  }

  #write;

  write(chunk, encoding, callback) {
    try {
      this.#write?.(chunk, encoding);
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
    if (chunk !== undefined) this.write(chunk, encoding);
    this.emit("finish");
    this.emit("close");
    callback?.();
  }

  destroy(error) {
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
  }
}

export class Duplex extends Readable {
  constructor(options = {}) {
    super();
    this.writable = true;
    this.#write = options.write;
  }

  #write;

  write(chunk, encoding, callback) {
    this.#write?.(chunk, encoding);
    this.emit("data", chunk);
    callback?.();
    return true;
  }

  end(chunk, encoding, callback) {
    if (chunk !== undefined) this.write(chunk, encoding);
    this.emit("finish");
    this.emit("end");
    this.emit("close");
    callback?.();
  }
}

Stream.Stream = Stream;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;

export default Stream;
