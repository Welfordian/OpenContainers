import { EventEmitter } from "./events.js";

export class Stream extends EventEmitter {
  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.on("end", () => destination.end?.());
    return destination;
  }

  unpipe() {
    return this;
  }
}

export class Readable extends Stream {
  constructor(options = {}) {
    super();
    this.readable = true;
    this.destroyed = false;
    this.readableEncoding = options.encoding ?? null;
    this._opencontainersReadableBuffer = [];
    this._opencontainersReadableEnded = false;
    this._opencontainersReadableEndEmitted = false;
    this._opencontainersReadableFlowing = false;
  }

  push(chunk) {
    if (chunk === null) {
      this._opencontainersReadableEnded = true;
      this.#flushReadable();
      return false;
    }
    if (this.listenerCount("data")) this.emit("data", chunk);
    else if (this._opencontainersReadableFlowing) {}
    else this._opencontainersReadableBuffer.push(chunk);
    return true;
  }

  read() {
    if (this._opencontainersReadableBuffer.length) return this._opencontainersReadableBuffer.shift();
    if (this._opencontainersReadableEnded) return null;
    return null;
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
    this._opencontainersReadableFlowing = false;
    return this;
  }

  resume() {
    this._opencontainersReadableFlowing = true;
    queueMicrotask(() => this.#flushReadable());
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

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        const buffered = this.read();
        if (buffered !== null) return Promise.resolve({ value: buffered, done: false });
        if (this._opencontainersReadableEnded) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => {
          const cleanup = () => {
            this.off("data", onData);
            this.off("end", onEnd);
            this.off("error", onError);
          };
          const onData = (chunk) => {
            cleanup();
            resolve({ value: chunk, done: false });
          };
          const onEnd = () => {
            cleanup();
            resolve({ value: undefined, done: true });
          };
          const onError = (error) => {
            cleanup();
            reject(error);
          };
          this.once("data", onData);
          this.once("end", onEnd);
          this.once("error", onError);
          queueMicrotask(() => this.#flushReadable());
        });
      },
      return: () => {
        this.destroy();
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }

  #flushReadable() {
    while (this._opencontainersReadableBuffer.length && (this.listenerCount("data") || this._opencontainersReadableFlowing)) {
      const chunk = this._opencontainersReadableBuffer.shift();
      if (this.listenerCount("data")) this.emit("data", chunk);
    }
    if (this._opencontainersReadableEnded && !this._opencontainersReadableEndEmitted && this._opencontainersReadableBuffer.length === 0) {
      this._opencontainersReadableEndEmitted = true;
      this.emit("end");
      this.emit("close");
    }
  }
}

Readable.from = function from(iterable, options = {}) {
  const readable = new Readable(options);
  const isSingleChunk = typeof iterable === "string" || iterable instanceof Uint8Array || iterable instanceof ArrayBuffer || ArrayBuffer.isView(iterable);
  const isSyncIterable = iterable && typeof iterable[Symbol.iterator] === "function";
  if (isSingleChunk || isSyncIterable) {
    try {
      if (isSingleChunk) {
        readable.push(iterable);
      } else {
        for (const chunk of iterable) readable.push(chunk);
      }
      readable.push(null);
    } catch (error) {
      readable.destroy(error);
    }
    return readable;
  }
  queueMicrotask(async () => {
    try {
      for await (const chunk of iterable ?? []) readable.push(chunk);
      readable.push(null);
    } catch (error) {
      readable.destroy(error);
    }
  });
  return readable;
};

Readable.fromWeb = function fromWeb(webStream, options = {}) {
  return Readable.from(readWebStream(webStream), options);
};

Readable.toWeb = function toWeb(readable) {
  return new ReadableStream({
    start(controller) {
      readable.on("data", chunk => controller.enqueue(chunk));
      readable.once("end", () => controller.close());
      readable.once("error", error => controller.error(error));
    }
  });
};

Readable.isDisturbed = function isDisturbed() {
  return false;
};

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

Writable.fromWeb = function fromWeb(webStream) {
  const writer = webStream.getWriter();
  return new Writable({
    write(chunk) {
      writer.write(chunk);
    }
  });
};

Writable.toWeb = function toWeb(writable) {
  return new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => {
        writable.write(chunk, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    close() {
      writable.end();
    },
    abort(error) {
      writable.destroy(error);
    }
  });
};

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

Duplex.from = function from(source) {
  if (source instanceof Duplex) return source;
  if (source instanceof Readable) {
    const duplex = new Duplex();
    source.on("data", chunk => duplex.push(chunk));
    source.once("end", () => duplex.push(null));
    return duplex;
  }
  return Readable.from(source);
};

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

export function PassThrough(options = {}) {
  Transform.call(this, options);
}

PassThrough.prototype = Object.create(Transform.prototype);
PassThrough.prototype.constructor = PassThrough;
PassThrough.prototype._transform = function passThroughTransform(chunk, _encoding, callback) {
  callback(null, chunk);
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

export function finishedCallback(stream, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") {
    throw new TypeError("The callback argument must be a function");
  }
  finished(stream).then(() => cb(), cb);
  return stream;
}

export function pipelinePromise(...args) {
  return new Promise((resolve, reject) => {
    pipeline(...args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function finished(stream) {
  return new Promise((resolve, reject) => {
    if (!stream || typeof stream.once !== "function") {
      reject(new TypeError("stream.finished requires a stream"));
      return;
    }

    let settled = false;
    const cleanup = () => {
      stream.off?.("error", onError);
      stream.off?.("finish", onDone);
      stream.off?.("end", onDone);
      stream.off?.("close", onDone);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onError = (error) => settle(reject, error);
    const onDone = () => settle(resolve);

    stream.once("error", onError);
    stream.once("finish", onDone);
    stream.once("end", onDone);
    stream.once("close", onDone);
  });
}

async function* readWebStream(webStream) {
  const reader = webStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

Stream.Stream = Stream;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
Stream.pipeline = pipeline;
Stream.finished = finishedCallback;
Stream.isReadable = value => Boolean(value?.readable);
Stream.isWritable = value => Boolean(value?.writable);
Stream.isErrored = value => Boolean(value?.errored);
Stream.isDestroyed = value => Boolean(value?.destroyed);
Stream.Readable.from = Readable.from;
Stream.Readable.fromWeb = Readable.fromWeb;
Stream.Readable.toWeb = Readable.toWeb;
Stream.Readable.isDisturbed = Readable.isDisturbed;
Stream.Writable.fromWeb = Writable.fromWeb;
Stream.Writable.toWeb = Writable.toWeb;
Stream.Duplex.from = Duplex.from;

export const promises = {
  pipeline: pipelinePromise,
  finished
};
Stream.promises = promises;

export default Stream;
