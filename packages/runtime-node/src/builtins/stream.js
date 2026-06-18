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
    this._opencontainersReadableBuffer = [];
    this._opencontainersReadableEnded = false;
    this._opencontainersReadableEndEmitted = false;
  }

  push(chunk) {
    if (chunk === null) {
      this._opencontainersReadableEnded = true;
      this.#flushReadable();
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
      queueMicrotask(() => this.#flushReadable());
    }
    return this;
  }

  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.on("end", () => destination.end?.());
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

  #flushReadable() {
    while (this._opencontainersReadableBuffer.length && this.listenerCount("data")) {
      this.emit("data", this._opencontainersReadableBuffer.shift());
    }
    if (this._opencontainersReadableEnded && !this._opencontainersReadableEndEmitted && this._opencontainersReadableBuffer.length === 0) {
      this._opencontainersReadableEndEmitted = true;
      this.emit("end");
      this.emit("close");
    }
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

export function Transform(options = {}) {
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
      callback?.(error);
      this.emit("error", error);
      return;
    }
    if (output !== undefined && output !== null) this.push(output);
    callback?.();
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
    callback?.();
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
          callback?.(error);
          return;
        }
        if (output !== undefined && output !== null) this.push(output);
        finish();
      });
    } catch (error) {
      this.emit("error", error);
      callback?.(error);
    }
  };
  if (chunk !== undefined) this.write(chunk, encoding, flush);
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

export function pipeline(...args) {
  const callback = typeof args.at(-1) === "function" ? args.pop() : () => {};
  const streams = args.flat();
  if (streams.length === 0) {
    queueMicrotask(() => callback());
    return undefined;
  }

  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    callback(error);
  };

  for (const stream of streams) {
    stream?.once?.("error", finish);
  }
  for (let index = 0; index < streams.length - 1; index++) {
    streams[index]?.pipe?.(streams[index + 1]);
  }

  const last = streams.at(-1);
  last?.once?.("finish", () => finish());
  last?.once?.("close", () => finish());
  return last;
}

Stream.Stream = Stream;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.pipeline = pipeline;

export default Stream;
