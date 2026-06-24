import { EventEmitter, captureRejectionSymbol } from "./events.js";
import { RuntimeBuffer } from "./buffer.js";
import { StringDecoder } from "./string_decoder.js";

let defaultBinaryHighWaterMark = 64 * 1024;
let defaultObjectHighWaterMark = 16;

export function Stream() {
  if (new.target) {
    const instance = Reflect.construct(EventEmitter, [], new.target);
    EventEmitter.init.call(instance);
    return instance;
  }
  EventEmitter.init.call(this);
}

Object.setPrototypeOf(Stream, EventEmitter);
Stream.prototype = Object.create(EventEmitter.prototype, {
  constructor: {
    configurable: true,
    writable: true,
    value: Stream
  }
});

Stream.prototype.pipe = function pipe(destination) {
  return pipeStream(this, destination, arguments[1]);
};

Object.defineProperty(Stream.prototype.pipe, "name", {
  configurable: true,
  value: ""
});
Object.defineProperty(Stream.prototype.pipe, "length", {
  configurable: true,
  value: 2
});
Stream.prototype.eventNames = function eventNames() {
  return EventEmitter.prototype.eventNames.call(this);
};

function ReadableState(options, stream, _isDuplex) {
  options = options ?? {};
  const objectMode = Boolean(options.objectMode ?? options.readableObjectMode);
  Object.defineProperties(this, {
    _opencontainersObjectMode: {
      configurable: true,
      writable: true,
      value: objectMode
    },
    _opencontainersStream: {
      configurable: true,
      writable: true,
      value: stream ?? null
    },
    _opencontainersEnded: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersEndEmitted: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersReading: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersConstructed: {
      configurable: true,
      writable: true,
      value: true
    },
    _opencontainersSync: {
      configurable: true,
      writable: true,
      value: true
    },
    _opencontainersNeedReadable: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersEmittedReadable: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersReadableListening: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersResumeScheduled: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersErrorEmitted: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersEmitClose: {
      configurable: true,
      writable: true,
      value: true
    },
    _opencontainersAutoDestroy: {
      configurable: true,
      writable: true,
      value: true
    },
    _opencontainersDestroyed: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersClosed: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersCloseEmitted: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersMultiAwaitDrain: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersReadingMore: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersDataEmitted: {
      configurable: true,
      writable: true,
      value: false
    },
    _opencontainersErrored: {
      configurable: true,
      writable: true,
      value: null
    },
    _opencontainersDefaultEncoding: {
      configurable: true,
      writable: true,
      value: "utf8"
    },
    _opencontainersDecoder: {
      configurable: true,
      writable: true,
      value: null
    },
    _opencontainersEncoding: {
      configurable: true,
      writable: true,
      value: options.encoding ?? null
    },
    _opencontainersFlowing: {
      configurable: true,
      writable: true,
      value: null
    },
    _opencontainersPaused: {
      configurable: true,
      writable: true,
      value: false
    }
  });
  this.highWaterMark = options.readableHighWaterMark ?? options.highWaterMark ?? getDefaultHighWaterMark(objectMode);
  this.buffer = [];
  this.bufferIndex = 0;
  this.length = 0;
  this.pipes = [];
  this.awaitDrainWriters = null;
}

const readableStateAccessors = [
  ["objectMode", "_opencontainersObjectMode"],
  ["ended", "_opencontainersEnded"],
  ["endEmitted", "_opencontainersEndEmitted"],
  ["reading", "_opencontainersReading"],
  ["constructed", "_opencontainersConstructed"],
  ["sync", "_opencontainersSync"],
  ["needReadable", "_opencontainersNeedReadable"],
  ["emittedReadable", "_opencontainersEmittedReadable"],
  ["readableListening", "_opencontainersReadableListening"],
  ["resumeScheduled", "_opencontainersResumeScheduled"],
  ["errorEmitted", "_opencontainersErrorEmitted"],
  ["emitClose", "_opencontainersEmitClose"],
  ["autoDestroy", "_opencontainersAutoDestroy"],
  ["destroyed", "_opencontainersDestroyed"],
  ["closed", "_opencontainersClosed"],
  ["closeEmitted", "_opencontainersCloseEmitted"],
  ["multiAwaitDrain", "_opencontainersMultiAwaitDrain"],
  ["readingMore", "_opencontainersReadingMore"],
  ["dataEmitted", "_opencontainersDataEmitted"],
  ["errored", "_opencontainersErrored"],
  ["defaultEncoding", "_opencontainersDefaultEncoding"],
  ["decoder", "_opencontainersDecoder"],
  ["encoding", "_opencontainersEncoding"],
  ["flowing", "_opencontainersFlowing"],
  ["pipesCount", null],
  ["paused", "_opencontainersPaused"]
];

for (const [name, storage] of readableStateAccessors) {
  const descriptor = {
    configurable: false,
    get() {
      if (name === "pipesCount") return Array.isArray(this.pipes) ? this.pipes.length : 0;
      return this[storage];
    }
  };
  if (name !== "pipesCount") {
    descriptor.set = function(value) {
      this[storage] = value;
    };
  }
  Object.defineProperty(ReadableState.prototype, name, descriptor);
}

for (const name of readableStateAccessors.map(([name]) => name)) {
  const descriptor = Object.getOwnPropertyDescriptor(ReadableState.prototype, name);
  Object.defineProperty(descriptor.get, "name", {
    configurable: true,
    value: "get"
  });
  if (descriptor.set) {
    Object.defineProperty(descriptor.set, "name", {
      configurable: true,
      value: "set"
    });
  }
}

function fromList(n, state) {
  if (!state || !Array.isArray(state.buffer) || state.buffer.length === 0) return null;
  if (state.objectMode) return state.buffer.shift();
  if (!n || n >= state.length) return fromListTakeAll(state);

  const first = state.buffer[0];
  if (first == null) return null;
  const firstLength = chunkLength(first);
  if (n < firstLength) {
    const chunk = sliceChunk(first, 0, n);
    state.buffer[0] = sliceChunk(first, n);
    return chunk;
  }
  if (n === firstLength) return state.buffer.shift();

  const chunks = [];
  let remaining = n;
  while (remaining > 0 && state.buffer.length) {
    const chunk = state.buffer[0];
    const length = chunkLength(chunk);
    if (remaining < length) {
      chunks.push(sliceChunk(chunk, 0, remaining));
      state.buffer[0] = sliceChunk(chunk, remaining);
      remaining = 0;
    } else {
      chunks.push(state.buffer.shift());
      remaining -= length;
    }
  }
  return joinChunks(chunks, n);
}

function fromListTakeAll(state) {
  const chunks = state.buffer.splice(0);
  return joinChunks(chunks, state.length);
}

function chunkLength(chunk) {
  if (typeof chunk === "string") return chunk.length;
  if (chunk?.byteLength !== undefined) return chunk.byteLength;
  if (chunk?.length !== undefined) return chunk.length;
  return 1;
}

function sliceChunk(chunk, start, end) {
  return typeof chunk?.slice === "function" ? chunk.slice(start, end) : chunk;
}

function joinChunks(chunks, totalLength) {
  if (chunks.length === 0) return null;
  if (chunks.length === 1) return chunks[0];
  if (typeof chunks[0] === "string") return chunks.join("");
  if (ArrayBuffer.isView(chunks[0]) || chunks[0] instanceof ArrayBuffer) {
    return RuntimeBuffer.concat(chunks, totalLength);
  }
  return chunks;
}

export class Readable extends Stream {
  constructor(options = {}) {
    super();
    this._opencontainersReadable = true;
    this._opencontainersDestroyed = false;
    this._opencontainersClosed = false;
    this._opencontainersErrored = null;
    this._opencontainersReadableAborted = false;
    this._opencontainersReadableDidRead = false;
    this._opencontainersReadableEndedPublic = false;
    this._opencontainersReadableEncoding = options.encoding ?? null;
    this._opencontainersReadableFlowingPublic = null;
    this._opencontainersReadableHighWaterMark = options.highWaterMark ?? getDefaultHighWaterMark(options.objectMode);
    this._opencontainersReadableObjectMode = Boolean(options.objectMode);
    this._opencontainersReadableBuffer = [];
    this._readableState = new ReadableState(options, this, false);
    this._opencontainersReadableDecoder = null;
    this._opencontainersReadableDecoderEnded = false;
    this._opencontainersReadableDisturbed = false;
    this._opencontainersReadableEnded = false;
    this._opencontainersReadableEndEmitted = false;
    this._opencontainersReadableFlowing = false;
    this._opencontainersReadablePaused = false;
    this._opencontainersReadableReading = false;
    this._opencontainersReadableDestroyHook = null;
    if (typeof options.read === "function") this._read = options.read;
    if (options.encoding !== undefined) setReadableEncoding(this, options.encoding);
    updateReadableState(this);
  }

  _read(_size) {}

  push(chunk, _encoding) {
    this._opencontainersReadableReading = false;
    if (chunk === null) {
      this._opencontainersReadableEnded = true;
      updateReadableState(this);
      this.#flushReadable();
      return false;
    }
    if (this.listenerCount("data") && !this._opencontainersReadablePaused) {
      const decoded = decodeReadableChunk(this, chunk);
      if (decoded !== "") {
        this._opencontainersReadableDisturbed = true;
        this.emit("data", decoded);
      }
    }
    else if (this._opencontainersReadableFlowing && !this._opencontainersReadablePaused) {}
    else {
      const decoded = decodeReadableChunk(this, chunk);
      if (decoded !== "") this._opencontainersReadableBuffer.push(decoded);
    }
    updateReadableState(this);
    return true;
  }

  unshift(chunk, _encoding) {
    this._opencontainersReadableReading = false;
    if (chunk === null) {
      this._opencontainersReadableEnded = true;
      updateReadableState(this);
      this.#flushReadable();
      return false;
    }
    const decoded = decodeReadableChunk(this, chunk);
    if (decoded !== "") this._opencontainersReadableBuffer.unshift(decoded);
    updateReadableState(this);
    if (this.listenerCount("data") && !this._opencontainersReadablePaused) {
      queueMicrotask(() => this.#flushReadable());
    }
    return this._opencontainersReadableBuffer.length < this.readableHighWaterMark;
  }

  read(size) {
    this._opencontainersReadableDisturbed = true;
    if (this._opencontainersReadableEnded) flushReadableDecoder(this);
    if (!this._opencontainersReadableBuffer.length && !this._opencontainersReadableEnded) {
      requestReadablePull(this, size);
      if (this._opencontainersReadableEnded) flushReadableDecoder(this);
    }
    if (this._opencontainersReadableBuffer.length) {
      const chunk = this._opencontainersReadableBuffer.shift();
      updateReadableState(this);
      return chunk;
    }
    if (this._opencontainersReadableEnded) {
      this._opencontainersReadableEndedPublic = true;
      updateReadableState(this);
      closeReadableStream(this);
      return null;
    }
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
    return pipeStream(this, destination, arguments[1]);
  }

  unpipe(destination) {
    return unpipeStream(this, destination);
  }

  pause() {
    this._opencontainersReadableFlowing = false;
    this._opencontainersReadableFlowingPublic = false;
    if (!this._opencontainersReadablePaused) {
      this._opencontainersReadablePaused = true;
      updateReadableState(this);
      this.emit("pause");
    }
    return this;
  }

  resume() {
    if (this._opencontainersReadablePaused) {
      this._opencontainersReadablePaused = false;
      updateReadableState(this);
      this.emit("resume");
    }
    this._opencontainersReadableFlowing = true;
    this._opencontainersReadableFlowingPublic = true;
    updateReadableState(this);
    queueMicrotask(() => this.#flushReadable());
    return this;
  }

  isPaused() {
    return this._opencontainersReadablePaused;
  }

  setEncoding(encoding) {
    setReadableEncoding(this, encoding);
    return this;
  }

  wrap(stream) {
    if (!stream || typeof stream.on !== "function") return this;
    stream.on("data", (chunk) => {
      if (!this.push(chunk) && typeof stream.pause === "function") stream.pause();
    });
    stream.on("end", () => this.push(null));
    stream.on("error", (error) => this.destroy(error));
    return this;
  }

  destroy(error, callback) {
    if (this.destroyed) return this;
    if (typeof callback === "function") this.once("close", () => callback(error));
    let destroyError = error;
    const destroyHook = this._opencontainersReadableDestroyHook;
    this._opencontainersReadableDestroyHook = null;
    if (typeof destroyHook === "function") {
      try {
        const result = destroyHook.call(this, destroyError);
        if (result && typeof result.then === "function") result.catch(noopStreamError);
      } catch (hookError) {
        destroyError ??= hookError;
      }
    }
    this._opencontainersReadableReading = false;
    this._opencontainersDestroyed = true;
    this._opencontainersReadableAborted = Boolean(destroyError);
    this._opencontainersErrored = destroyError ?? null;
    updateReadableState(this);
    if (destroyError) this.emit("error", destroyError);
    closeStream(this);
    return this;
  }

  [Symbol.asyncIterator]() {
    return createReadableAsyncIterator(this);
  }

  #flushReadable() {
    if (this._opencontainersReadableEnded && !this._opencontainersReadableEndEmitted) flushReadableDecoder(this);
    while (!this._opencontainersReadablePaused && (this.listenerCount("data") || this._opencontainersReadableFlowing)) {
      if (!this._opencontainersReadableBuffer.length && !this._opencontainersReadableEnded) {
        requestReadablePull(this);
      }
      if (!this._opencontainersReadableBuffer.length) break;
      const chunk = this._opencontainersReadableBuffer.shift();
      updateReadableState(this);
      if (this.listenerCount("data")) {
        this._opencontainersReadableDisturbed = true;
        this.emit("data", chunk);
      }
    }
    if (this._opencontainersReadableEnded && !this._opencontainersReadableEndEmitted && this._opencontainersReadableBuffer.length === 0) {
      this._opencontainersReadableEndEmitted = true;
      this._opencontainersReadableEndedPublic = true;
      updateReadableState(this);
      this.emit("end");
      closeReadableStream(this);
    }
  }
}

Object.defineProperty(Readable.prototype, "iterator", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: function(options) {
    return createReadableAsyncIterator(this, options);
  }
});

Readable.prototype.compose = function compose(stream, options) {
  if (typeof stream === "function") {
    return Readable.from(stream(this, options), options);
  }
  return Stream.compose(this, stream);
};

function setReadableEncoding(stream, encoding) {
  const decoder = new StringDecoder(encoding);
  stream._opencontainersReadableDecoder = decoder;
  stream._opencontainersReadableDecoderEnded = false;
  stream._opencontainersReadableEncoding = decoder.encoding;
  if (stream._readableState) stream._readableState.encoding = decoder.encoding;
  if (!stream._opencontainersReadableBuffer?.length) return;
  const decoded = [];
  for (const chunk of stream._opencontainersReadableBuffer) {
    const value = decoder.write(chunk);
    if (value !== "") decoded.push(value);
  }
  stream._opencontainersReadableBuffer = decoded;
  if (stream._opencontainersReadableEnded) stream._opencontainersReadableDecoderEnded = true;
  updateReadableState(stream);
}

function decodeReadableChunk(stream, chunk) {
  if (!stream._opencontainersReadableDecoder || chunk === null) return chunk;
  return stream._opencontainersReadableDecoder.write(chunk);
}

function flushReadableDecoder(stream) {
  const decoder = stream._opencontainersReadableDecoder;
  if (!decoder || stream._opencontainersReadableDecoderEnded) return;
  const value = decoder.end();
  stream._opencontainersReadableDecoderEnded = true;
  if (value !== "") stream._opencontainersReadableBuffer.push(value);
  updateReadableState(stream);
}

function requestReadablePull(stream, size = stream.readableHighWaterMark) {
  if (
    !stream
    || stream.destroyed
    || stream._opencontainersReadableEnded
    || stream._opencontainersReadableReading
    || typeof stream._read !== "function"
  ) {
    return;
  }
  stream._opencontainersReadableReading = true;
  try {
    stream._read(normalizeReadablePullSize(size, stream.readableHighWaterMark));
  } catch (error) {
    stream._opencontainersReadableReading = false;
    stream.destroy(error);
  }
}

function normalizeReadablePullSize(size, fallback) {
  if (size === undefined || size === null) return fallback;
  const number = Number(size);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function createReadableFromOptions(options, isSingleChunk) {
  const normalized = options == null ? {} : { ...options };
  if (!Object.prototype.hasOwnProperty.call(normalized, "objectMode")) normalized.objectMode = true;
  if (!isSingleChunk && !Object.prototype.hasOwnProperty.call(normalized, "highWaterMark")) normalized.highWaterMark = 1;
  return normalized;
}

function updateReadableState(stream) {
  const state = stream?._readableState;
  if (!state) return;
  if (!(state instanceof ReadableState)) {
    state.length = stream.readableLength;
    state.ended = Boolean(stream._opencontainersReadableEnded);
    state.flowing = stream.readableFlowing;
    state.destroyed = Boolean(stream.destroyed);
    return;
  }
  state.buffer = stream._opencontainersReadableBuffer ?? state.buffer ?? [];
  state.length = stream.readableLength;
  state._opencontainersEnded = Boolean(stream._opencontainersReadableEnded);
  state._opencontainersEndEmitted = Boolean(stream._opencontainersReadableEndEmitted);
  state._opencontainersReading = Boolean(stream._opencontainersReadableReading);
  state._opencontainersDestroyed = Boolean(stream.destroyed);
  state._opencontainersClosed = Boolean(stream.closed);
  state._opencontainersErrorEmitted = Boolean(stream._opencontainersErrored);
  state._opencontainersErrored = stream._opencontainersErrored ?? null;
  state._opencontainersDecoder = stream._opencontainersReadableDecoder ?? null;
  state._opencontainersEncoding = stream.readableEncoding;
  state._opencontainersFlowing = stream.readableFlowing;
  state._opencontainersPaused = Boolean(stream._opencontainersReadablePaused);
}

Readable.ReadableState = ReadableState;
Readable._fromList = fromList;

Readable.from = function from(iterable, options = {}) {
  const isSingleChunk = typeof iterable === "string" || iterable instanceof RuntimeBuffer;
  const isSyncIterable = iterable && typeof iterable[Symbol.iterator] === "function";
  const isAsyncIterable = iterable && typeof iterable[Symbol.asyncIterator] === "function";
  if (!isSingleChunk && !isSyncIterable && !isAsyncIterable) {
    throw createInvalidInstanceError("iterable", "Iterable", iterable);
  }

  const readable = new Readable(createReadableFromOptions(options, isSingleChunk));
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
      for await (const chunk of iterable) readable.push(chunk);
      readable.push(null);
    } catch (error) {
      readable.destroy(error);
    }
  });
  return readable;
};

Readable.fromWeb = function fromWeb(webStream, options = {}) {
  validateWebStreamInstance("readableStream", webStream, "ReadableStream");
  const source = createWebReadableSource(webStream);
  const readable = Readable.from(source.iterable, options);
  readable._opencontainersReadableDestroyHook = source.cancel;
  return readable;
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

Readable.wrap = function(stream, options) {
  return new Readable(options ?? {}).wrap(stream);
};

function isReadableDisturbed(stream) {
  return Boolean(stream?._opencontainersReadableDisturbed || stream?.readableEnded || stream?.destroyed);
}

Readable.prototype.toArray = async function toArray(options = {}) {
  throwIfAborted(options?.signal);
  const values = [];
  for await (const chunk of this) {
    throwIfAborted(options?.signal);
    values.push(chunk);
  }
  return values;
};

Readable.prototype.forEach = async function forEach(fn, options = {}) {
  validateFunction(fn, "fn");
  const signalOptions = createReadableIteratorOptions(options);
  for await (const chunk of this) {
    throwIfAborted(signalOptions.signal);
    await fn(chunk, signalOptions);
  }
};

Readable.prototype.map = function map(fn, options = {}) {
  validateFunction(fn, "fn");
  const source = this;
  const signalOptions = createReadableIteratorOptions(options);
  return Readable.from((async function* mapReadable() {
    for await (const chunk of source) {
      throwIfAborted(signalOptions.signal);
      yield await fn(chunk, signalOptions);
    }
  })(), options);
};

Readable.prototype.filter = function filter(fn, options = {}) {
  validateFunction(fn, "fn");
  const source = this;
  const signalOptions = createReadableIteratorOptions(options);
  return Readable.from((async function* filterReadable() {
    for await (const chunk of source) {
      throwIfAborted(signalOptions.signal);
      if (await fn(chunk, signalOptions)) yield chunk;
    }
  })(), options);
};

Readable.prototype.flatMap = function flatMap(fn, options = {}) {
  validateFunction(fn, "fn");
  const source = this;
  const signalOptions = createReadableIteratorOptions(options);
  return Readable.from((async function* flatMapReadable() {
    for await (const chunk of source) {
      throwIfAborted(signalOptions.signal);
      const value = await fn(chunk, signalOptions);
      if (isFlattenable(value)) {
        for await (const nested of value) yield nested;
      } else {
        yield value;
      }
    }
  })(), options);
};

Readable.prototype.find = async function find(fn, options = {}) {
  validateFunction(fn, "fn");
  const signalOptions = createReadableIteratorOptions(options);
  for await (const chunk of this) {
    throwIfAborted(signalOptions.signal);
    if (await fn(chunk, signalOptions)) return chunk;
  }
  return undefined;
};

Readable.prototype.some = async function some(fn, options = {}) {
  validateFunction(fn, "fn");
  const signalOptions = createReadableIteratorOptions(options);
  for await (const chunk of this) {
    throwIfAborted(signalOptions.signal);
    if (await fn(chunk, signalOptions)) return true;
  }
  return false;
};

Readable.prototype.every = async function every(fn, options = {}) {
  validateFunction(fn, "fn");
  const signalOptions = createReadableIteratorOptions(options);
  for await (const chunk of this) {
    throwIfAborted(signalOptions.signal);
    if (!await fn(chunk, signalOptions)) return false;
  }
  return true;
};

Readable.prototype.reduce = async function reduce(reducer, initialValue, options = {}) {
  validateFunction(reducer, "reducer");
  const hasInitialValue = arguments.length >= 2;
  const signalOptions = createReadableIteratorOptions(hasInitialValue ? options : initialValue);
  let accumulator = initialValue;
  let initialized = hasInitialValue;
  for await (const chunk of this) {
    throwIfAborted(signalOptions.signal);
    if (!initialized) {
      accumulator = chunk;
      initialized = true;
    } else {
      accumulator = await reducer(accumulator, chunk, signalOptions);
    }
  }
  if (!initialized) {
    throw Object.assign(new TypeError("Reduce of an empty stream requires an initial value"), {
      code: "ERR_MISSING_ARGS"
    });
  }
  return accumulator;
};

Readable.prototype.take = function take(number, options = {}) {
  validateNonNegativeNumber(number, "number");
  const source = this;
  const signalOptions = createReadableIteratorOptions(options);
  return Readable.from((async function* takeReadable() {
    let remaining = Math.trunc(number);
    if (remaining <= 0) {
      abortReadableEarly(source);
      return;
    }
    for await (const chunk of source) {
      throwIfAborted(signalOptions.signal);
      yield chunk;
      remaining--;
      if (remaining <= 0) {
        abortReadableEarly(source);
        break;
      }
    }
  })(), options);
};

Readable.prototype.drop = function drop(number, options = {}) {
  validateNonNegativeNumber(number, "number");
  const source = this;
  const signalOptions = createReadableIteratorOptions(options);
  return Readable.from((async function* dropReadable() {
    let remaining = Math.trunc(number);
    for await (const chunk of source) {
      throwIfAborted(signalOptions.signal);
      if (remaining > 0) {
        remaining--;
        continue;
      }
      yield chunk;
    }
  })(), options);
};

Readable.prototype._destroy = function(error, callback) {
  callback?.(error);
};

Readable.prototype._undestroy = function undestroy() {
  this._opencontainersDestroyed = false;
  this._opencontainersClosed = false;
  this._opencontainersErrored = null;
  this._opencontainersReadableAborted = false;
  this._opencontainersReadableEndedPublic = false;
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.closed = false;
    this._readableState.errorEmitted = false;
    this._readableState.errored = null;
  }
};

Readable.prototype.removeListener = function(eventName, listener) {
  return EventEmitter.prototype.removeListener.call(this, eventName, listener);
};

Readable.prototype.off = function(eventName, listener) {
  return EventEmitter.prototype.off.call(this, eventName, listener);
};

Readable.prototype.removeAllListeners = function(eventName) {
  return EventEmitter.prototype.removeAllListeners.call(this, eventName);
};

alignReadableLegacyMetadata();
alignReadableIteratorHelperMetadata();

function pipeStream(source, destination, options) {
  const entry = {
    active: true,
    awaitingDrain: false,
    onData: null,
    onDrain: null,
    onEnd: null
  };
  entry.onDrain = () => {
    if (!entry.active) return;
    entry.awaitingDrain = false;
    if (!hasPendingPipeDrain(source)) source.resume?.();
  };
  entry.onData = (chunk) => {
    if (!entry.active) return;
    const ready = destination.write(chunk);
    if (ready === false && !entry.awaitingDrain && typeof destination.once === "function") {
      entry.awaitingDrain = true;
      source.pause?.();
      destination.once("drain", entry.onDrain);
    }
  };
  entry.onEnd = () => {
    if (options?.end === false) return;
    destination.end?.();
  };
  source.on("data", entry.onData);
  source.on("end", entry.onEnd);
  const targets = ensurePipeTargets(source);
  const entries = targets.get(destination) ?? [];
  entries.push(entry);
  targets.set(destination, entries);
  source.resume?.();
  return destination;
}

function unpipeStream(source, destination) {
  const targets = source._opencontainersPipeTargets;
  if (!targets) return source;

  const selected = destination === undefined
    ? [...targets.entries()]
    : [[destination, targets.get(destination)]];

  let removedAny = false;
  for (const [target, entries] of selected) {
    if (!entries) continue;
    removedAny = true;
    for (const entry of entries) {
      const { onData, onDrain, onEnd } = entry;
      entry.active = false;
      entry.awaitingDrain = false;
      source.off?.("data", onData);
      source.off?.("end", onEnd);
      target.off?.("drain", onDrain);
    }
    targets.delete(target);
  }
  if (removedAny && targets.size === 0) source.pause?.();
  return source;
}

function ensurePipeTargets(source) {
  if (!source._opencontainersPipeTargets) {
    Object.defineProperty(source, "_opencontainersPipeTargets", {
      configurable: true,
      value: new Map()
    });
  }
  return source._opencontainersPipeTargets;
}

function hasPendingPipeDrain(source) {
  const targets = source._opencontainersPipeTargets;
  if (!targets) return false;
  for (const entries of targets.values()) {
    if (entries?.some((entry) => entry.active && entry.awaitingDrain)) return true;
  }
  return false;
}

function createReadableAsyncIterator(readable, options = {}) {
  const destroyOnReturn = options?.destroyOnReturn !== false;
  return {
    next: () => {
      const buffered = readable.read();
      if (buffered !== null) return Promise.resolve({ value: buffered, done: false });
      if (readable._opencontainersReadableEnded) {
        readable._opencontainersReadableEndedPublic = true;
        closeReadableStream(readable);
        return Promise.resolve({ value: undefined, done: true });
      }
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          readable.off("data", onData);
          readable.off("end", onEnd);
          readable.off("error", onError);
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
        readable.once("data", onData);
        readable.once("end", onEnd);
        readable.once("error", onError);
      });
    },
    return: () => {
      if (destroyOnReturn) {
        const suppressUnhandledError = typeof readable.listenerCount === "function" && readable.listenerCount("error") === 0;
        if (suppressUnhandledError) readable.once("error", noopStreamError);
        try {
          readable.destroy(createAbortError());
        } finally {
          if (suppressUnhandledError) readable.off?.("error", noopStreamError);
        }
      }
      return Promise.resolve({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}

function alignReadableLegacyMetadata() {
  const metadata = {
    _read: { name: "", length: 1, enumerable: true },
    _undestroy: { name: "undestroy", length: 0, enumerable: true },
    _destroy: { name: "", length: 2, enumerable: true },
    push: { name: "", length: 2, enumerable: true },
    unshift: { name: "", length: 2, enumerable: true },
    isPaused: { name: "", length: 0, enumerable: true },
    setEncoding: { name: "", length: 1, enumerable: true },
    read: { name: "", length: 1, enumerable: true },
    pipe: { name: "", length: 2, enumerable: true },
    unpipe: { name: "", length: 1, enumerable: true },
    on: { name: "on", length: 2, enumerable: true },
    addListener: { name: "addListener", length: 2, enumerable: true },
    removeListener: { name: "", length: 2, enumerable: true },
    off: { name: "", length: 2, enumerable: true },
    removeAllListeners: { name: "", length: 1, enumerable: true },
    resume: { name: "", length: 0, enumerable: true },
    pause: { name: "", length: 0, enumerable: true },
    wrap: { name: "", length: 1, enumerable: true },
    destroy: { name: "destroy", length: 2, enumerable: true }
  };

  for (const [name, options] of Object.entries(metadata)) {
    const descriptor = Object.getOwnPropertyDescriptor(Readable.prototype, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    ensureFunctionOwnPrototype(descriptor.value);
    Object.defineProperty(descriptor.value, "name", {
      configurable: true,
      value: options.name
    });
    Object.defineProperty(descriptor.value, "length", {
      configurable: true,
      value: options.length
    });
    Object.defineProperty(Readable.prototype, name, {
      ...descriptor,
      enumerable: options.enumerable
    });
  }
}

function alignReadableIteratorHelperMetadata() {
  const metadata = {
    iterator: { name: "", length: 1, enumerable: true },
    compose: { name: "compose", length: 2, enumerable: true },
    map: { length: 2, enumerable: false },
    filter: { length: 2, enumerable: false },
    flatMap: { length: 2, enumerable: false },
    drop: { length: 1, enumerable: false },
    take: { length: 1, enumerable: false },
    reduce: { length: 3, enumerable: false },
    toArray: { length: 1, enumerable: false },
    some: { length: 1, enumerable: false },
    find: { length: 2, enumerable: false },
    forEach: { length: 2, enumerable: false },
    every: { length: 1, enumerable: false }
  };

  for (const [name, options] of Object.entries(metadata)) {
    const descriptor = Object.getOwnPropertyDescriptor(Readable.prototype, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    if (options.name !== undefined) {
      Object.defineProperty(descriptor.value, "name", {
        configurable: true,
        value: options.name
      });
    }
    Object.defineProperty(descriptor.value, "length", {
      configurable: true,
      value: options.length
    });
    Object.defineProperty(Readable.prototype, name, {
      ...descriptor,
      enumerable: options.enumerable
    });
  }
}

export class Writable extends Stream {
  constructor({ write, final, destroy, highWaterMark, objectMode, emitClose = true } = {}) {
    super();
    this._opencontainersWritableBrand = true;
    this._opencontainersWritableBuffer = this.#writeBuffer;
    this._opencontainersWritable = true;
    this._opencontainersDestroyed = false;
    this._opencontainersClosed = false;
    this._opencontainersErrored = null;
    this._opencontainersWritableAborted = false;
    this._opencontainersWritableEndedPublic = false;
    this._opencontainersWritableFinished = false;
    this._opencontainersWritableCorked = 0;
    this._opencontainersWritableHighWaterMark = highWaterMark ?? getDefaultHighWaterMark(objectMode);
    this._opencontainersWritableLength = 0;
    this._opencontainersWritableObjectMode = Boolean(objectMode);
    this._opencontainersWritableNeedDrain = false;
    this._opencontainersEmitClose = emitClose;
    this.#write = write;
    this.#final = final;
    this.#destroyHook = destroy;
  }

  #write;
  #final;
  #destroyHook;
  #writeBuffer = [];
  #writing = false;
  #endCallbacks = [];
  #finalizing = false;
  #finalized = false;

  write(chunk, encoding, callback) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    try {
      if (this.destroyed || this.writableEnded) {
        throw Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
      }
      const entry = {
        chunk,
        encoding,
        callback,
        size: writableChunkSize(chunk, this.writableObjectMode)
      };
      this._opencontainersWritableLength += entry.size;
      const belowHighWaterMark = this.writableLength < this.writableHighWaterMark;
      if (!belowHighWaterMark) this._opencontainersWritableNeedDrain = true;
      if (this.writableCorked > 0 || this.#writing) this.#writeBuffer.push(entry);
      else this.#writeEntry(entry);
      return belowHighWaterMark;
    } catch (error) {
      callback?.(error);
      this.emit("error", error);
      return false;
    }
  }

  end(chunk, encoding, callback) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    if (chunk !== undefined) this.write(chunk, encoding);
    this._opencontainersWritableEndedPublic = true;
    if (callback) this.#endCallbacks.push(callback);
    this._opencontainersWritableCorked = 0;
    this.#flushWriteBuffer();
    this.#finishIfDrained();
    return this;
  }

  destroy(error) {
    if (this.destroyed) return this;
    let destroyError = error;
    if (this.#destroyHook) {
      try {
        const result = this.#destroyHook.call(this, destroyError);
        if (result && typeof result.then === "function") result.catch(() => {});
      } catch (hookError) {
        destroyError ??= hookError;
      }
    }
    this._opencontainersDestroyed = true;
    this._opencontainersErrored = destroyError ?? null;
    this._opencontainersWritableAborted = Boolean(destroyError);
    this.#writeBuffer.length = 0;
    this._opencontainersWritableLength = 0;
    this._opencontainersWritableNeedDrain = false;
    if (destroyError) this.emit("error", destroyError);
    closeStream(this, this._opencontainersEmitClose);
    return this;
  }

  cork() {
    this._opencontainersWritableCorked++;
  }

  uncork() {
    if (this.writableCorked > 0) this._opencontainersWritableCorked--;
    if (this.writableCorked === 0) this.#flushWriteBuffer();
  }

  setDefaultEncoding() {
    return this;
  }

  #writeEntry(entry) {
    this.#writing = true;
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      this._opencontainersWritableLength = Math.max(0, this.writableLength - entry.size);
      this.#writing = false;
      if (error) {
        entry.callback?.(error);
        this.emit("error", error);
      } else {
        this.emit("data", entry.chunk);
        entry.callback?.();
      }
      this.#flushWriteBuffer();
      if (!this.#writing && this.#writeBuffer.length === 0) {
        if (this.writableNeedDrain && this.writableLength < this.writableHighWaterMark) {
          this._opencontainersWritableNeedDrain = false;
          this.emit("drain");
        }
        this.#finishIfDrained();
      }
    };
    try {
      const handler = this.#write ?? this._write;
      if (!handler) {
        finish();
      } else if (handler.length >= 3) {
        handler.call(this, entry.chunk, entry.encoding, finish);
      } else if (handler.length === 2) {
        handler.call(this, entry.chunk, finish);
      } else {
        handler.call(this, entry.chunk);
        finish();
      }
    } catch (error) {
      finish(error);
    }
  }

  #flushWriteBuffer() {
    if (this.#writing || this.writableCorked > 0 || this.#writeBuffer.length === 0) return;
    this.#writeEntry(this.#writeBuffer.shift());
  }

  #finishIfDrained() {
    if (!this.writableEnded || this.writableFinished || this.#writing || this.#writeBuffer.length > 0) return;
    if (!this.#finalized) {
      if (this.#finalizing) return;
      if (this.#final) {
        this.#finalizing = true;
        let settled = false;
        const finishFinal = (error) => {
          if (settled) return;
          settled = true;
          this.#finalizing = false;
          this.#finalized = true;
          if (error) {
            this.destroy(error);
          } else {
            this.#finishIfDrained();
          }
        };
        try {
          const result = this.#final.length >= 1
            ? this.#final.call(this, finishFinal)
            : this.#final.call(this);
          if (result && typeof result.then === "function") result.then(() => finishFinal(), finishFinal);
          else if (this.#final.length < 1) finishFinal();
        } catch (error) {
          finishFinal(error);
        }
        return;
      }
      this.#finalized = true;
    }
    this._opencontainersWritableFinished = true;
    this.emit("finish");
    closeStream(this, this._opencontainersEmitClose);
    while (this.#endCallbacks.length) this.#endCallbacks.shift()?.();
  }
}

function nop() {}

function WritableState(options, stream, _isDuplex) {
  options = options ?? {};
  const objectMode = Boolean(options.objectMode ?? options.writableObjectMode);
  this.highWaterMark = options.writableHighWaterMark ?? options.highWaterMark ?? getDefaultHighWaterMark(objectMode);
  this.length = 0;
  this.corked = 0;
  this.onwrite = nop;
  this.writelen = 0;
  this.bufferedIndex = 0;
  this.pendingcb = 0;
  this._opencontainersObjectMode = objectMode;
  this._opencontainersFinalCalled = false;
  this._opencontainersNeedDrain = false;
  this._opencontainersEnding = false;
  this._opencontainersEnded = false;
  this._opencontainersFinished = false;
  this._opencontainersDestroyed = false;
  this._opencontainersDecodeStrings = options.decodeStrings !== false;
  this._opencontainersWriting = false;
  this._opencontainersSync = true;
  this._opencontainersBufferProcessing = false;
  this._opencontainersConstructed = true;
  this._opencontainersPrefinished = false;
  this._opencontainersErrorEmitted = false;
  this._opencontainersEmitClose = options.emitClose !== false;
  this._opencontainersAutoDestroy = true;
  this._opencontainersClosed = false;
  this._opencontainersCloseEmitted = false;
  this._opencontainersAllBuffers = true;
  this._opencontainersAllNoop = true;
  this._opencontainersErrored = null;
  this._opencontainersWritable = stream?.writable ?? true;
  this._opencontainersDefaultEncoding = options.defaultEncoding ?? "utf8";
  this._opencontainersWritecb = nop;
  this._opencontainersAfterWriteTickInfo = null;
  this._opencontainersBuffered = [];
  for (const key of Object.keys(this)) {
    if (key.startsWith("_opencontainers")) {
      Object.defineProperty(this, key, { enumerable: false });
    }
  }
}

const writableStateAccessors = [
  ["objectMode", "_opencontainersObjectMode"],
  ["finalCalled", "_opencontainersFinalCalled"],
  ["needDrain", "_opencontainersNeedDrain"],
  ["ending", "_opencontainersEnding"],
  ["ended", "_opencontainersEnded"],
  ["finished", "_opencontainersFinished"],
  ["destroyed", "_opencontainersDestroyed"],
  ["decodeStrings", "_opencontainersDecodeStrings"],
  ["writing", "_opencontainersWriting"],
  ["sync", "_opencontainersSync"],
  ["bufferProcessing", "_opencontainersBufferProcessing"],
  ["constructed", "_opencontainersConstructed"],
  ["prefinished", "_opencontainersPrefinished"],
  ["errorEmitted", "_opencontainersErrorEmitted"],
  ["emitClose", "_opencontainersEmitClose"],
  ["autoDestroy", "_opencontainersAutoDestroy"],
  ["closed", "_opencontainersClosed"],
  ["closeEmitted", "_opencontainersCloseEmitted"],
  ["allBuffers", "_opencontainersAllBuffers"],
  ["allNoop", "_opencontainersAllNoop"],
  ["errored", "_opencontainersErrored"],
  ["writable", "_opencontainersWritable"],
  ["defaultEncoding", "_opencontainersDefaultEncoding"],
  ["writecb", "_opencontainersWritecb"],
  ["afterWriteTickInfo", "_opencontainersAfterWriteTickInfo"],
  ["buffered", "_opencontainersBuffered"]
];

for (const [name, storage] of writableStateAccessors) {
  Object.defineProperty(WritableState.prototype, name, {
    configurable: false,
    get: function get() {
      return this[storage];
    },
    set: function set(value) {
      this[storage] = value;
    }
  });
}

Object.defineProperty(WritableState.prototype, "bufferedRequestCount", {
  configurable: false,
  get: function get() {
    return Array.isArray(this.buffered) ? Math.max(0, this.buffered.length - this.bufferedIndex) : 0;
  }
});

WritableState.prototype.getBuffer = function getBuffer() {
  return Array.isArray(this.buffered) ? this.buffered.slice(this.bufferedIndex) : [];
};

Writable.WritableState = WritableState;

Writable.fromWeb = function fromWeb(webStream) {
  validateWebStreamInstance("writableStream", webStream, "WritableStream");
  const writer = webStream.getWriter();
  return new Writable({
    write(chunk, _encoding, callback) {
      Promise.resolve(writer.write(chunk)).then(() => callback(), callback);
    },
    final(callback) {
      Promise.resolve(writer.close()).then(() => callback(), callback);
    },
    destroy(error) {
      if (!error) return;
      return writer.abort(error);
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

Writable.prototype.pipe = function() {
  const error = Object.assign(new Error("Cannot pipe, not readable"), {
    code: "ERR_STREAM_CANNOT_PIPE"
  });
  queueMicrotask(() => this.destroy(error));
};

Writable.prototype._write = function(chunk, encoding, callback) {
  if (typeof this._writev === "function") {
    return this._writev([{ chunk, encoding }], callback);
  }
  throw createMethodNotImplementedError("_write()");
};

Writable.prototype._destroy = function(error, callback) {
  callback?.(error);
};

Writable.prototype._undestroy = function undestroy() {
  this._opencontainersDestroyed = false;
  this._opencontainersClosed = false;
  this._opencontainersErrored = null;
  this._opencontainersWritableAborted = false;
  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.closed = false;
    this._writableState.errorEmitted = false;
    this._writableState.errored = null;
  }
};

Writable.prototype._writev = null;

Writable.prototype[captureRejectionSymbol] = function(error, eventName, ...args) {
  return this.destroy(error);
};
Object.defineProperty(Writable.prototype[captureRejectionSymbol], "name", {
  configurable: true,
  value: ""
});
Object.defineProperty(Writable.prototype[captureRejectionSymbol], "length", {
  configurable: true,
  value: 3
});

function isWritableDisturbed(writable) {
  return Boolean(writable?.writableEnded || writable?.destroyed);
}

function ensureFunctionOwnPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    enumerable: false,
    writable: true,
    value: prototype
  });
}

function alignWritableLegacyMetadata() {
  const metadata = {
    write: { name: "", length: 3, enumerable: true },
    pipe: { name: "", length: 0, enumerable: true },
    end: { name: "", length: 3, enumerable: true },
    destroy: { name: "", length: 2, enumerable: true },
    _write: { name: "", length: 3, enumerable: true },
    _undestroy: { name: "undestroy", length: 0, enumerable: true },
    _destroy: { name: "", length: 2, enumerable: true },
    cork: { name: "", length: 0, enumerable: true },
    uncork: { name: "", length: 0, enumerable: true },
    setDefaultEncoding: { name: "setDefaultEncoding", length: 1, enumerable: true }
  };

  for (const [name, options] of Object.entries(metadata)) {
    const descriptor = Object.getOwnPropertyDescriptor(Writable.prototype, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    ensureFunctionOwnPrototype(descriptor.value);
    Object.defineProperty(descriptor.value, "name", {
      configurable: true,
      value: options.name
    });
    Object.defineProperty(descriptor.value, "length", {
      configurable: true,
      value: options.length
    });
    Object.defineProperty(Writable.prototype, name, {
      ...descriptor,
      enumerable: options.enumerable
    });
  }
}

alignWritableLegacyMetadata();

Object.defineProperty(Writable, Symbol.hasInstance, {
  configurable: true,
  value(value) {
    if (this !== Writable) return Function.prototype[Symbol.hasInstance].call(this, value);
    return Boolean(value?._opencontainersWritableBrand);
  }
});

export class Duplex extends Readable {
  constructor(options = {}) {
    super(options);
    this._opencontainersWritableBrand = true;
    this._opencontainersWritable = true;
    this._opencontainersWritableAborted = false;
    this._opencontainersWritableEndedPublic = false;
    this._opencontainersWritableFinished = false;
    this._opencontainersWritableCorked = 0;
    this._opencontainersWritableHighWaterMark = options.writableHighWaterMark ?? options.highWaterMark ?? getDefaultHighWaterMark(options.objectMode ?? options.writableObjectMode);
    this._opencontainersWritableLength = 0;
    this._opencontainersWritableObjectMode = Boolean(options.objectMode ?? options.writableObjectMode);
    this._opencontainersWritableNeedDrain = false;
    this.#write = options.write;
  }

  #write;

  write(chunk, encoding, callback) {
    if (this.destroyed || this.writableEnded) {
      const error = Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
      callback?.(error);
      this.emit("error", error);
      return false;
    }
    this.#write?.(chunk, encoding);
    this.emit("data", chunk);
    callback?.();
    return true;
  }

  end(chunk, encoding, callback) {
    if (chunk !== undefined) this.write(chunk, encoding);
    this._opencontainersWritableEndedPublic = true;
    this._opencontainersWritableFinished = true;
    this.emit("finish");
    this._opencontainersReadableEndedPublic = true;
    this.emit("end");
    closeStream(this);
    callback?.();
    return this;
  }

  cork() {
    this._opencontainersWritableCorked++;
  }

  uncork() {
    if (this.writableCorked > 0) this._opencontainersWritableCorked--;
  }
}

Duplex.fromWeb = function fromWeb(pair, options = {}) {
  const webPair = pair === undefined ? {} : pair;
  if (webPair === null || (typeof webPair !== "object" && typeof webPair !== "function")) {
    throwInvalidWebStreamArgument("pair", "of type object", pair);
  }
  validateWebStreamInstance("pair.readable", webPair.readable, "ReadableStream", "property");
  validateWebStreamInstance("pair.writable", webPair.writable, "WritableStream", "property");
  const source = Readable.fromWeb(webPair.readable, options);
  const sink = Writable.fromWeb(webPair.writable);
  const duplex = new Duplex(options);
  source.on("data", chunk => duplex.push(chunk));
  source.once("end", () => duplex.push(null));
  source.once("error", error => duplex.destroy(error));
  duplex.write = (chunk, encoding, callback) => sink.write(chunk, encoding, callback);
  duplex.end = (chunk, encoding, callback) => {
    if (chunk !== undefined) duplex.write(chunk, encoding);
    sink.end();
    duplex._opencontainersWritableEndedPublic = true;
    duplex._opencontainersWritableFinished = true;
    duplex.emit("finish");
    callback?.();
    return duplex;
  };
  return duplex;
};

Duplex.toWeb = function toWeb(duplex) {
  return {
    readable: Readable.toWeb(duplex),
    writable: Writable.toWeb(duplex),
  };
};

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

Duplex.prototype.setDefaultEncoding = function setDefaultEncoding() {
  return this;
};

Duplex.prototype._write = Writable.prototype._write;
Duplex.prototype._writev = null;

Duplex.prototype.destroy = function(error) {
  if (this.destroyed) return this;
  this._opencontainersWritableAborted = Boolean(error);
  return Readable.prototype.destroy.call(this, error);
};

function alignDuplexWritableLegacyMetadata() {
  const metadata = {
    write: { name: "", length: 3, enumerable: true },
    end: { name: "", length: 3, enumerable: true },
    destroy: { name: "", length: 2, enumerable: true },
    cork: { name: "", length: 0, enumerable: true },
    uncork: { name: "", length: 0, enumerable: true },
    setDefaultEncoding: { name: "setDefaultEncoding", length: 1, enumerable: true },
    _write: { name: "", length: 3, enumerable: true }
  };

  for (const [name, options] of Object.entries(metadata)) {
    const descriptor = Object.getOwnPropertyDescriptor(Duplex.prototype, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    ensureFunctionOwnPrototype(descriptor.value);
    Object.defineProperty(descriptor.value, "name", {
      configurable: true,
      value: options.name
    });
    Object.defineProperty(descriptor.value, "length", {
      configurable: true,
      value: options.length
    });
    Object.defineProperty(Duplex.prototype, name, {
      ...descriptor,
      enumerable: options.enumerable
    });
  }

  Object.defineProperty(Duplex.prototype, "_writev", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: null
  });
}

alignDuplexWritableLegacyMetadata();

function isDuplexDisturbed(duplex) {
  return isReadableDisturbed(duplex) || isWritableDisturbed(duplex);
}

export function Transform(options = {}) {
  this._opencontainersWritableBrand = true;
  this._opencontainersReadable = true;
  this._opencontainersWritable = true;
  this._opencontainersDestroyed = false;
  this._opencontainersClosed = false;
  this._opencontainersErrored = null;
  this._opencontainersReadableAborted = false;
  this._opencontainersReadableDidRead = false;
  this._opencontainersReadableEncoding = options.encoding ?? null;
  this._opencontainersReadableEndedPublic = false;
  this._opencontainersReadableFlowingPublic = null;
  this._opencontainersReadableLength = 0;
  this._opencontainersWritableAborted = false;
  this._opencontainersWritableEndedPublic = false;
  this._opencontainersWritableFinished = false;
  this._opencontainersWritableCorked = 0;
  this._opencontainersReadableHighWaterMark = options.readableHighWaterMark ?? options.highWaterMark ?? getDefaultHighWaterMark(options.objectMode ?? options.readableObjectMode);
  this._opencontainersWritableHighWaterMark = options.writableHighWaterMark ?? options.highWaterMark ?? getDefaultHighWaterMark(options.objectMode ?? options.writableObjectMode);
  this._opencontainersReadableObjectMode = Boolean(options.objectMode ?? options.readableObjectMode);
  this._opencontainersWritableLength = 0;
  this._opencontainersWritableObjectMode = Boolean(options.objectMode ?? options.writableObjectMode);
  this._opencontainersWritableNeedDrain = false;
  this._readableState = {
    objectMode: this.readableObjectMode,
    highWaterMark: this.readableHighWaterMark,
    length: 0,
    ended: false,
    flowing: null,
    destroyed: false
  };
  this._writableState = {
    objectMode: this.writableObjectMode,
    highWaterMark: this.writableHighWaterMark,
    length: 0,
    ending: false,
    ended: false,
    finished: false,
    destroyed: false
  };
  this._opencontainersReadableBuffer = [];
  this._opencontainersReadableDecoder = null;
  this._opencontainersReadableDecoderEnded = false;
  this._opencontainersReadableDisturbed = false;
  this._opencontainersReadableEnded = false;
  this._opencontainersReadableEndEmitted = false;
  this._opencontainersReadableFlowing = false;
  this._opencontainersReadablePaused = false;
  this._opencontainersTransformOptions = options;
  if (options.encoding !== undefined) setReadableEncoding(this, options.encoding);
  if (typeof options.transform === "function") this._transform = options.transform;
  if (typeof options.flush === "function") this._flush = options.flush;
}

Object.setPrototypeOf(Transform, Duplex);
Transform.prototype = Object.create(Duplex.prototype);
Object.defineProperty(Transform.prototype, "constructor", {
  configurable: true,
  writable: true,
  value: Transform
});
Transform.prototype._final = function final(callback) {
  if (typeof this._flush !== "function" || this.destroyed) {
    callback?.();
    return;
  }
  this._flush((error, output) => {
    if (error) {
      callback?.(error);
      return;
    }
    if (output !== undefined && output !== null) this.push(output);
    callback?.();
  });
};
Transform.prototype._transform = function(chunk, encoding, callback) {
  throw createMethodNotImplementedError("_transform()");
};
Transform.prototype._write = function(chunk, encoding, callback) {
  this._transform(chunk, encoding, (error, output) => {
    if (error) {
      callback?.(error);
      return;
    }
    if (output !== undefined && output !== null) this.push(output);
    callback?.();
  });
};
Transform.prototype._read = function() {};
Transform.prototype.push = function push(chunk) {
  if (chunk === null) {
    this._opencontainersReadableEnded = true;
    this._opencontainersReadableEndedPublic = true;
    updateTransformReadableState(this);
    flushTransformReadable(this);
    return false;
  }
  if (this.listenerCount("data") && !this._opencontainersReadablePaused) {
    const decoded = decodeReadableChunk(this, chunk);
    if (decoded !== "") {
      this._opencontainersReadableDisturbed = true;
      this._opencontainersReadableDidRead = true;
      this.emit("data", decoded);
    }
  } else if (!this._opencontainersReadableFlowing || this._opencontainersReadablePaused) {
    const decoded = decodeReadableChunk(this, chunk);
    if (decoded !== "") this._opencontainersReadableBuffer.push(decoded);
    updateTransformReadableState(this);
  }
  return this._opencontainersReadableBuffer.length < this.readableHighWaterMark;
};
Transform.prototype.unshift = function unshift(chunk) {
  if (chunk === null) {
    this._opencontainersReadableEnded = true;
    this._opencontainersReadableEndedPublic = true;
    updateTransformReadableState(this);
    flushTransformReadable(this);
    return false;
  }
  const decoded = decodeReadableChunk(this, chunk);
  if (decoded !== "") this._opencontainersReadableBuffer.unshift(decoded);
  updateTransformReadableState(this);
  if (this.listenerCount("data") && !this._opencontainersReadablePaused) {
    queueMicrotask(() => flushTransformReadable(this));
  }
  return this._opencontainersReadableBuffer.length < this.readableHighWaterMark;
};
Transform.prototype.read = function read(_size) {
  this._opencontainersReadableDisturbed = true;
  this._opencontainersReadableDidRead = true;
  if (this._opencontainersReadableEnded) flushReadableDecoder(this);
  if (this._opencontainersReadableBuffer.length) {
    const chunk = this._opencontainersReadableBuffer.shift();
    updateTransformReadableState(this);
    return chunk;
  }
  if (this._opencontainersReadableEnded) {
    this._opencontainersReadableEndedPublic = true;
    updateTransformReadableState(this);
    closeReadableStream(this);
    return null;
  }
  return null;
};
Transform.prototype.pause = function pause() {
  this._opencontainersReadableFlowing = false;
  this._opencontainersReadableFlowingPublic = false;
  updateTransformReadableState(this);
  if (!this._opencontainersReadablePaused) {
    this._opencontainersReadablePaused = true;
    this.emit("pause");
  }
  return this;
};
Transform.prototype.resume = function resume() {
  if (this._opencontainersReadablePaused) {
    this._opencontainersReadablePaused = false;
    this.emit("resume");
  }
  this._opencontainersReadableFlowing = true;
  this._opencontainersReadableFlowingPublic = true;
  updateTransformReadableState(this);
  queueMicrotask(() => flushTransformReadable(this));
  return this;
};
Transform.prototype.isPaused = function isPaused() {
  return this._opencontainersReadablePaused;
};
Transform.prototype.on = function on(eventName, listener) {
  return this.addListener(eventName, listener);
};
Transform.prototype.addListener = function addListener(eventName, listener) {
  EventEmitter.prototype.addListener.call(this, eventName, listener);
  if (eventName === "data" || eventName === "end") {
    if (eventName === "data") this._opencontainersReadableFlowingPublic = true;
    updateTransformReadableState(this);
    queueMicrotask(() => flushTransformReadable(this));
  }
  return this;
};
Transform.prototype[Symbol.asyncIterator] = function() {
  return createReadableAsyncIterator(this);
};
Object.defineProperty(Transform.prototype, "iterator", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: function(options) {
    return createReadableAsyncIterator(this, options);
  }
});
Transform.prototype.compose = function compose(stream, options) {
  if (typeof stream === "function") {
    return Readable.from(stream(this, options), options);
  }
  return Stream.compose(this, stream);
};
Transform.prototype.write = function write(chunk, encoding, callback) {
  const chunkSize = writableChunkSize(chunk, this.writableObjectMode);
  this._opencontainersWritableLength += chunkSize;
  this._writableState.length = this.writableLength;
  if (this.writableLength >= this.writableHighWaterMark) this._opencontainersWritableNeedDrain = true;
  const done = (error, output) => {
    this._opencontainersWritableLength = Math.max(0, this.writableLength - chunkSize);
    this._writableState.length = this.writableLength;
    if (this.writableNeedDrain && this.writableLength < this.writableHighWaterMark) {
      this._opencontainersWritableNeedDrain = false;
      this.emit("drain");
    }
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
    this._writableState.ending = true;
    this._opencontainersWritableEndedPublic = true;
    this._writableState.ended = true;
    this._opencontainersWritableFinished = true;
    this._writableState.finished = true;
    this.emit("finish");
    this.push(null);
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
  return this;
};
Transform.prototype.destroy = function destroy(error) {
  if (this.destroyed) return this;
  if (Object.hasOwn(this, "_handle")) this._handle = null;
  this._opencontainersDestroyed = true;
  this._opencontainersReadableAborted = Boolean(error);
  this._opencontainersWritableAborted = Boolean(error);
  this._opencontainersErrored = error ?? null;
  this._readableState.destroyed = true;
  this._writableState.destroyed = true;
  if (error) this.emit("error", error);
  closeStream(this);
  return this;
};
Transform.prototype.setEncoding = function setEncoding(encoding) {
  setReadableEncoding(this, encoding);
  return this;
};
Transform.prototype.cork = function cork() {
  this._opencontainersWritableCorked++;
};
Transform.prototype.uncork = function uncork() {
  if (this.writableCorked > 0) this._opencontainersWritableCorked--;
};

function flushTransformReadable(stream) {
  if (stream._opencontainersReadableEnded && !stream._opencontainersReadableEndEmitted) flushReadableDecoder(stream);
  while (
    !stream._opencontainersReadablePaused
    && stream._opencontainersReadableBuffer.length
    && (stream.listenerCount("data") || stream._opencontainersReadableFlowing)
  ) {
    const chunk = stream._opencontainersReadableBuffer.shift();
    updateTransformReadableState(stream);
    if (stream.listenerCount("data")) {
      stream._opencontainersReadableDisturbed = true;
      stream._opencontainersReadableDidRead = true;
      stream.emit("data", chunk);
    }
  }
  if (
    stream._opencontainersReadableEnded
    && !stream._opencontainersReadableEndEmitted
    && stream._opencontainersReadableBuffer.length === 0
  ) {
    stream._opencontainersReadableEndEmitted = true;
    stream._opencontainersReadableEndedPublic = true;
    updateTransformReadableState(stream);
    stream.emit("end");
    closeReadableStream(stream);
  }
}

function updateTransformReadableState(stream) {
  stream._opencontainersReadableLength = stream._opencontainersReadableBuffer.length;
  stream._readableState.length = stream.readableLength;
  stream._readableState.ended = stream._opencontainersReadableEnded;
  stream._readableState.flowing = stream.readableFlowing;
  stream._readableState.destroyed = stream.destroyed;
}

export function PassThrough(options = {}) {
  Transform.call(this, options);
}

Object.setPrototypeOf(PassThrough, Transform);
PassThrough.prototype = Object.create(Transform.prototype);
Object.defineProperty(PassThrough.prototype, "constructor", {
  configurable: true,
  writable: true,
  value: PassThrough
});
PassThrough.prototype._transform = function passThroughTransform(chunk, _encoding, callback) {
  callback(null, chunk);
};
Object.defineProperty(PassThrough.prototype._transform, "name", {
  configurable: true,
  value: ""
});

export function pipeline(...args) {
  const callback = typeof args.at(-1) === "function" ? args.pop() : () => {};
  const { streams, options } = normalizePipelineArgs(args);
  if (streams.length === 0) {
    queueMicrotask(() => callback());
    return undefined;
  }

  let settled = false;
  let aborting = false;
  const cleanupCallbacks = [];
  const cleanup = () => {
    while (cleanupCallbacks.length) cleanupCallbacks.pop()?.();
  };
  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback(error, value);
  };
  const destroyPipelineStreams = (error) => {
    aborting = true;
    for (const stream of streams) {
      if (typeof stream?.destroy === "function") stream.destroy(error);
      else stream?.emit?.("error", error);
    }
    aborting = false;
  };
  const onAbort = () => {
    if (settled) return;
    const error = createAbortError(options.signal.reason);
    destroyPipelineStreams(error);
    finish(error);
  };
  const addOnce = (stream, eventName, listener) => {
    stream?.once?.(eventName, listener);
    cleanupCallbacks.push(() => stream?.off?.(eventName, listener));
  };

  for (const stream of streams) {
    addOnce(stream, "error", (error) => {
      if (!aborting) finish(error);
    });
  }
  if (options.signal) {
    if (options.signal.aborted) {
      onAbort();
      return streams.at(-1);
    }
    options.signal.addEventListener?.("abort", onAbort, { once: true });
      cleanupCallbacks.push(() => options.signal.removeEventListener?.("abort", onAbort));
  }

  if (shouldUseIterablePipeline(streams)) {
    runIterablePipeline(streams, options).then(
      (value) => finish(undefined, value),
      (error) => {
        destroyPipelineStreams(error);
        finish(error);
      }
    );
    return streams.at(-1);
  }

  for (let index = 0; index < streams.length - 1; index++) {
    streams[index]?.pipe?.(streams[index + 1]);
  }

  const last = streams.at(-1);
  const onLastDone = () => {
    if (!aborting) finish();
  };
  addOnce(last, "finish", onLastDone);
  addOnce(last, "close", onLastDone);
  return last;
}

export function finishedCallback(stream, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") {
    throw new TypeError("The callback argument must be a function");
  }
  finishedPromise(stream, typeof options === "function" ? undefined : options, false).then(() => cb(), cb);
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

export function compose(...args) {
  const streams = args.flat();
  if (streams.length === 0) {
    throw Object.assign(new TypeError("stream.compose requires at least one stream"), {
      code: "ERR_MISSING_ARGS"
    });
  }

  if (streams.length === 1) return Duplex.from(streams[0]);

  for (let index = 0; index < streams.length - 1; index++) {
    const source = streams[index];
    const destination = streams[index + 1];
    if (typeof source?.pipe !== "function" || typeof destination?.write !== "function") {
      throw Object.assign(new TypeError("stream.compose arguments must be streams"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    source.pipe(destination);
  }

  const first = streams[0];
  const last = streams.at(-1);
  const duplex = new Duplex();

  duplex.write = (chunk, encoding, callback) => {
    if (duplex.destroyed || duplex.writableEnded) {
      const error = Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
      callback?.(error);
      duplex.emit("error", error);
      return false;
    }
    try {
      const result = first.write(chunk, encoding, callback);
      return result !== false;
    } catch (error) {
      callback?.(error);
      duplex.destroy(error);
      return false;
    }
  };

  duplex.end = (chunk, encoding, callback) => {
    if (chunk !== undefined) duplex.write(chunk, encoding);
    duplex._opencontainersWritableEndedPublic = true;
    duplex._opencontainersWritableFinished = true;
    duplex.emit("finish");
    try {
      first.end?.();
      callback?.();
    } catch (error) {
      callback?.(error);
      duplex.destroy(error);
    }
    return duplex;
  };

  duplex.destroy = (error) => {
    if (duplex.destroyed) return duplex;
    duplex._opencontainersDestroyed = true;
    duplex._opencontainersErrored = error ?? null;
    duplex._opencontainersWritableAborted = Boolean(error);
    for (const stream of streams) {
      if (stream !== duplex) stream.destroy?.(error);
    }
    if (error) duplex.emit("error", error);
    duplex._opencontainersClosed = true;
    duplex.emit("close");
    return duplex;
  };

  for (const stream of streams) {
    stream?.once?.("error", (error) => duplex.destroy(error));
  }
  last.on?.("data", (chunk) => duplex.push(chunk));
  last.once?.("end", () => duplex.push(null));
  last.once?.("close", () => {
    if (!duplex.closed && duplex.readableEnded) {
      duplex._opencontainersClosed = true;
      duplex.emit("close");
    }
  });

  return duplex;
}

export function finished(stream, options) {
  return finishedPromise(stream, options, true);
}

function finishedPromise(stream, options, validateCleanup) {
  const normalizedOptions = options !== null && typeof options === "object" ? options : {};
  if (
    validateCleanup
    && Object.prototype.hasOwnProperty.call(normalizedOptions, "cleanup")
    && typeof normalizedOptions.cleanup !== "boolean"
  ) {
    throw createInvalidFinishedOptionError("cleanup", "boolean", normalizedOptions.cleanup);
  }
  return new Promise((resolve, reject) => {
    if (options !== undefined && options !== null && typeof options !== "object") {
      reject(createInvalidFinishedOptionError("options", "object", options));
      return;
    }
    if (!stream || typeof stream.once !== "function") {
      reject(new TypeError("stream.finished requires a stream"));
      return;
    }

    let settled = false;
    const shouldCleanup = normalizedOptions.cleanup === true;
    const cleanup = () => {
      stream.off?.("error", onError);
      stream.off?.("finish", onDone);
      stream.off?.("end", onDone);
      stream.off?.("close", onDone);
      normalizedOptions.signal?.removeEventListener?.("abort", onAbort);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (shouldCleanup) cleanup();
      callback(value);
    };
    const onError = (error) => settle(reject, error);
    const onDone = () => settle(resolve);
    const onAbort = () => settle(reject, createAbortError(normalizedOptions.signal.reason));

    stream.on?.("error", onError) ?? stream.once("error", onError);
    stream.on?.("finish", onDone) ?? stream.once("finish", onDone);
    stream.on?.("end", onDone) ?? stream.once("end", onDone);
    stream.on?.("close", onDone) ?? stream.once("close", onDone);
    if (normalizedOptions.signal) {
      if (normalizedOptions.signal.aborted) {
        onAbort();
        return;
      }
      normalizedOptions.signal.addEventListener?.("abort", onAbort, { once: true });
    }
    if (stream.closed || stream.writableFinished || stream.readableEnded || stream.destroyed) {
      queueMicrotask(onDone);
    }
  });
}

function normalizePipelineArgs(args) {
  const values = [...args];
  let options = {};
  if (isPipelineOptions(values.at(-1))) {
    options = values.pop();
  }
  const streams = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  return { streams, options };
}

function shouldUseIterablePipeline(streams) {
  return streams.some((stream) => typeof stream === "function")
    || (streams.length > 1 && isPipelineIterable(streams[0]) && typeof streams[0]?.pipe !== "function");
}

async function runIterablePipeline(streams, options) {
  let current = streams[0];
  for (let index = 1; index < streams.length; index++) {
    throwIfAborted(options.signal);
    const stage = streams[index];
    const isLast = index === streams.length - 1;

    if (typeof stage === "function") {
      const result = await resolvePipelineFunctionResult(stage(current, { signal: options.signal }));
      if (isLast) {
        if (isPipelineIterable(result)) {
          for await (const _chunk of result) throwIfAborted(options.signal);
          return undefined;
        }
        return result;
      }
      if (!isPipelineIterable(result)) throw createPipelineTypeError(result, "transform");
      current = result;
      continue;
    }

    if (isLast && isWritableLike(stage)) {
      await writeIterableToWritable(current, stage, options);
      return undefined;
    }

    throw createPipelineTypeError(stage, "stream");
  }

  return undefined;
}

async function resolvePipelineFunctionResult(result) {
  if (isPipelineIterable(result)) return result;
  return await result;
}

async function writeIterableToWritable(source, writable, options) {
  if (!isPipelineIterable(source)) throw createPipelineTypeError(source, "source");
  for await (const chunk of source) {
    throwIfAborted(options.signal);
    await writePipelineChunk(writable, chunk);
  }
  throwIfAborted(options.signal);
  if (options.end === false) return;
  await endPipelineWritable(writable);
}

function writePipelineChunk(writable, chunk) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      writable.off?.("error", onError);
      writable.off?.("drain", onDrain);
    };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => settle(error);
    const onDrain = () => settle();
    writable.once?.("error", onError);
    const ready = writable.write(chunk, (error) => settle(error));
    if (!settled && ready === false) writable.once?.("drain", onDrain);
  });
}

function endPipelineWritable(writable) {
  return new Promise((resolve, reject) => {
    if (writable.writableFinished || writable.closed || writable.destroyed) {
      resolve();
      return;
    }
    let settled = false;
    const cleanup = () => {
      writable.off?.("error", onError);
      writable.off?.("finish", onDone);
      writable.off?.("close", onDone);
    };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => settle(error);
    const onDone = () => settle();
    writable.once?.("error", onError);
    writable.once?.("finish", onDone);
    writable.once?.("close", onDone);
    if (typeof writable.end === "function") writable.end(undefined, undefined, (error) => settle(error));
    else settle();
    if (writable.writableFinished || writable.closed || writable.destroyed) queueMicrotask(onDone);
  });
}

function isPipelineIterable(value) {
  if (value == null) return false;
  return typeof value[Symbol.asyncIterator] === "function" || typeof value[Symbol.iterator] === "function";
}

function isWritableLike(value) {
  return Boolean(value && typeof value.write === "function");
}

function createPipelineTypeError(value, name) {
  return Object.assign(new TypeError(`The "${name}" argument must be a stream, iterable, or function. Received ${describeReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidFinishedOptionError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeOptionReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidInstanceError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be an instance of ${expected}. Received ${describeOptionReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createMethodNotImplementedError(method) {
  return Object.assign(new Error(`The ${method} method is not implemented`), {
    code: "ERR_METHOD_NOT_IMPLEMENTED"
  });
}

function isPipelineOptions(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.pipe === "function" || typeof value.write === "function" || typeof value.on === "function") return false;
  if (typeof value[Symbol.asyncIterator] === "function") return false;
  return Object.prototype.hasOwnProperty.call(value, "signal")
    || Object.prototype.hasOwnProperty.call(value, "end");
}

function isAbortSignal(value) {
  return typeof AbortSignal === "function" && value instanceof AbortSignal;
}

function isAbortSignalStream(value) {
  return value instanceof Stream || isReadableWebStream(value) || isWritableWebStream(value);
}

function isReadableWebStream(value) {
  return typeof ReadableStream === "function" && value instanceof ReadableStream;
}

function isWritableWebStream(value) {
  return typeof WritableStream === "function" && value instanceof WritableStream;
}

function isTransformWebStream(value) {
  return typeof TransformStream === "function" && value instanceof TransformStream;
}

export function addAbortSignal(signal, stream) {
  if (!isAbortSignal(signal)) throw createInvalidInstanceError("signal", "AbortSignal", signal);
  if (!isAbortSignalStream(stream)) {
    throw createInvalidInstanceError("stream", "ReadableStream, WritableStream, or Stream", stream);
  }
  const abort = () => {
    const error = createAbortError(signal.reason);
    if (typeof stream.destroy === "function") stream.destroy(error);
    else if (isReadableWebStream(stream)) stream.cancel?.(error)?.catch?.(noopStreamError);
    else if (isWritableWebStream(stream)) stream.abort?.(error)?.catch?.(noopStreamError);
    else stream.emit?.("error", error);
  };
  if (signal.aborted) abort();
  else signal.addEventListener?.("abort", abort, { once: true });
  return stream;
}

export function getDefaultHighWaterMark(objectMode) {
  return objectMode ? defaultObjectHighWaterMark : defaultBinaryHighWaterMark;
}

function writableChunkSize(chunk, objectMode) {
  if (objectMode) return 1;
  if (typeof chunk === "string") return RuntimeBuffer.byteLength(chunk);
  if (chunk instanceof ArrayBuffer) return chunk.byteLength;
  if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
  return RuntimeBuffer.byteLength(chunk);
}

export function setDefaultHighWaterMark(objectMode, value) {
  const highWaterMark = Number(value);
  if (!Number.isInteger(highWaterMark) || highWaterMark < 0) {
    throw Object.assign(new RangeError("The value of \"value\" is out of range. It must be a non-negative integer."), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  if (objectMode) defaultObjectHighWaterMark = highWaterMark;
  else defaultBinaryHighWaterMark = highWaterMark;
}

export function destroy(stream, error) {
  stream?.destroy?.(error);
}

export function _isUint8Array(value) {
  return value instanceof Uint8Array;
}

export const _isArrayBufferView = ArrayBuffer.isView;

export function _uint8ArrayToBuffer(value) {
  return RuntimeBuffer.from(value);
}

setFunctionName(destroy, "destroyer");
setFunctionName(_isUint8Array, "isUint8Array");
setFunctionName(finishedCallback, "eos");

function setFunctionName(fn, name) {
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
}

function createAbortError(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function closeStream(stream, emitClose = true) {
  const wasClosed = Boolean(stream.closed);
  stream._opencontainersDestroyed = true;
  stream._opencontainersClosed = true;
  updateReadableState(stream);
  if (emitClose && !wasClosed) stream.emit("close");
}

function closeReadableStream(stream) {
  if (stream.writable && !stream.writableEnded) return;
  closeStream(stream);
}

function abortReadableEarly(readable) {
  if (!readable || readable.destroyed || typeof readable.destroy !== "function") return;
  const suppressUnhandledError = typeof readable.listenerCount === "function" && readable.listenerCount("error") === 0;
  if (suppressUnhandledError) readable.once("error", noopStreamError);
  try {
    readable.destroy(createAbortError());
  } finally {
    if (suppressUnhandledError) readable.off?.("error", noopStreamError);
  }
}

function noopStreamError() {}

function createReadableIteratorOptions(options = {}) {
  return { signal: options?.signal };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw createAbortError(signal.reason);
}

function validateFunction(value, name) {
  if (typeof value === "function") return;
  throw Object.assign(new TypeError(`The "${name}" argument must be of type function. Received ${describeReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function validateNonNegativeNumber(value, name) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return;
  throw Object.assign(new RangeError(`The value of "${name}" is out of range. It must be >= 0. Received ${describeReceived(value)}`), {
    code: "ERR_OUT_OF_RANGE"
  });
}

function validateWebStreamInstance(name, value, constructorName, kind = "argument") {
  const constructor = globalThis[constructorName];
  if (typeof constructor === "function" && value instanceof constructor) return;
  throwInvalidWebStreamArgument(name, `an instance of ${constructorName}`, value, kind);
}

function throwInvalidWebStreamArgument(name, expected, value, kind = "argument") {
  const label = kind === "property" ? "property" : "argument";
  throw Object.assign(new TypeError(`The "${name}" ${label} must be ${expected}. Received ${describeWebStreamReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function describeWebStreamReceived(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "symbol") {
    return `type ${typeof value} (${String(value)})`;
  }
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

function describeReceived(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return `type number (${value})`;
  return `type ${typeof value}`;
}

function describeOptionReceived(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "symbol") {
    return `type ${typeof value} (${String(value)})`;
  }
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

function isFlattenable(value) {
  if (value == null || typeof value === "string") return false;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return false;
  return typeof value[Symbol.iterator] === "function" || typeof value[Symbol.asyncIterator] === "function";
}

function asyncDisposeStream(stream) {
  return new Promise((resolve) => {
    if (stream.closed || stream.destroyed) {
      resolve();
      return;
    }
    const cleanup = () => {
      stream.off?.("close", onClose);
      stream.off?.("error", onError);
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onError = () => {};
    stream.once?.("close", onClose);
    stream.on?.("error", onError);
    stream.destroy?.(createAbortError());
  });
}

function duplexPair(options) {
  const left = new Duplex();
  const right = new Duplex();

  const connect = (source, target) => {
    source.write = (chunk, encoding, callback) => {
      if (source.destroyed || source.writableEnded) {
        const error = Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
        callback?.(error);
        source.emit("error", error);
        return false;
      }
      target.push(chunk);
      callback?.();
      return true;
    };
    source.end = (chunk, encoding, callback) => {
      if (chunk !== undefined) source.write(chunk, encoding);
      source._opencontainersWritableEndedPublic = true;
      source._opencontainersWritableFinished = true;
      source.emit("finish");
      target.push(null);
      if (source.readableEnded) closeStream(source);
      callback?.();
      return source;
    };
  };

  connect(left, right);
  connect(right, left);
  return [left, right];
}

function createWebReadableSource(webStream) {
  const state = {
    cancelled: false,
    finished: false,
    reader: null
  };
  return {
    iterable: readWebStream(webStream, state),
    cancel(reason) {
      if (state.finished || state.cancelled) return undefined;
      state.cancelled = true;
      if (state.reader) return state.reader.cancel(reason);
      return webStream.cancel(reason);
    }
  };
}

async function* readWebStream(webStream, state) {
  const reader = webStream.getReader();
  state.reader = reader;
  try {
    while (true) {
      if (state.cancelled) return;
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    state.finished = true;
    if (state.reader === reader) state.reader = null;
    try {
      reader.releaseLock?.();
    } catch {}
  }
}

Stream.isDestroyed = isDestroyed;
Stream.isDisturbed = isDisturbed;
Stream.isErrored = isErrored;
Stream.isReadable = isReadable;
Stream.isWritable = isWritable;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
Stream.duplexPair = duplexPair;
Stream.pipeline = pipeline;
Stream.addAbortSignal = addAbortSignal;
Stream.finished = finishedCallback;
Stream.destroy = destroy;
Stream.compose = compose;
Stream.setDefaultHighWaterMark = setDefaultHighWaterMark;
Stream.getDefaultHighWaterMark = getDefaultHighWaterMark;
Object.defineProperty(Stream, "promises", {
  configurable: true,
  enumerable: true,
  get() {
    return promises;
  }
});
Stream.Stream = Stream;
Stream._isArrayBufferView = _isArrayBufferView;
Stream._isUint8Array = _isUint8Array;
Stream._uint8ArrayToBuffer = _uint8ArrayToBuffer;
Stream.Readable.from = Readable.from;
Stream.Readable.wrap = Readable.wrap;
Stream.Readable.fromWeb = Readable.fromWeb;
Stream.Readable.toWeb = Readable.toWeb;
Stream.Writable.fromWeb = Writable.fromWeb;
Stream.Writable.toWeb = Writable.toWeb;
Stream.Duplex.from = Duplex.from;
Stream.Duplex.fromWeb = Duplex.fromWeb;
Stream.Duplex.toWeb = Duplex.toWeb;

alignStaticStreamHelperMetadata();

function defineReadableStateAccessors(prototype) {
  defineStateAccessor(
    prototype,
    "readable",
    function() { return stateValue(this, "_opencontainersReadable", false); },
    function(value) { this._opencontainersReadable = value; }
  );
  defineStateAccessor(prototype, "readableDidRead", function() {
    return Boolean(stateValue(this, "_opencontainersReadableDidRead", false));
  });
  defineStateAccessor(prototype, "readableAborted", function() {
    return Boolean(stateValue(this, "_opencontainersReadableAborted", false));
  });
  defineStateAccessor(prototype, "readableHighWaterMark", function() {
    return stateValue(this, "_opencontainersReadableHighWaterMark", getDefaultHighWaterMark(false));
  });
  defineStateAccessor(prototype, "readableBuffer", function() {
    return stateValue(this, "_opencontainersReadableBuffer", []);
  });
  defineStateAccessor(
    prototype,
    "readableFlowing",
    function() { return stateValue(this, "_opencontainersReadableFlowingPublic", null); },
    function(value) { this._opencontainersReadableFlowingPublic = value; }
  );
  defineStateAccessor(prototype, "readableLength", function() {
    return stateValue(this, "_opencontainersReadableLength", this._opencontainersReadableBuffer?.length ?? 0);
  });
  defineStateAccessor(prototype, "readableObjectMode", function() {
    return Boolean(stateValue(this, "_opencontainersReadableObjectMode", false));
  });
  defineStateAccessor(prototype, "readableEncoding", function() {
    return stateValue(this, "_opencontainersReadableEncoding", null);
  });
  defineStateAccessor(prototype, "errored", function() {
    return stateValue(this, "_opencontainersErrored", null);
  });
  defineStateAccessor(prototype, "closed", function() {
    return Boolean(stateValue(this, "_opencontainersClosed", false));
  });
  defineStateAccessor(
    prototype,
    "destroyed",
    function() { return Boolean(stateValue(this, "_opencontainersDestroyed", false)); },
    function(value) { this._opencontainersDestroyed = value; }
  );
  defineStateAccessor(prototype, "readableEnded", function() {
    return Boolean(stateValue(this, "_opencontainersReadableEndedPublic", false));
  });
}

function defineWritableStateAccessors(prototype) {
  defineStateAccessor(prototype, "closed", function() {
    return Boolean(stateValue(this, "_opencontainersClosed", false));
  });
  defineStateAccessor(
    prototype,
    "destroyed",
    function() { return Boolean(stateValue(this, "_opencontainersDestroyed", false)); },
    function(value) { this._opencontainersDestroyed = value; }
  );
  defineStateAccessor(
    prototype,
    "writable",
    function() { return stateValue(this, "_opencontainersWritable", false); },
    function(value) { this._opencontainersWritable = value; }
  );
  defineWritableReadonlyStateAccessors(prototype);
}

function defineDuplexWritableStateAccessors(prototype) {
  defineStateAccessor(
    prototype,
    "writable",
    function() { return stateValue(this, "_opencontainersWritable", false); },
    function(value) { this._opencontainersWritable = value; }
  );
  defineStateAccessor(prototype, "writableHighWaterMark", function() {
    return stateValue(this, "_opencontainersWritableHighWaterMark", getDefaultHighWaterMark(false));
  });
  defineStateAccessor(prototype, "writableObjectMode", function() {
    return Boolean(stateValue(this, "_opencontainersWritableObjectMode", false));
  });
  defineStateAccessor(prototype, "writableBuffer", function() {
    return stateValue(this, "_opencontainersWritableBuffer", []);
  });
  defineStateAccessor(prototype, "writableLength", function() {
    return stateValue(this, "_opencontainersWritableLength", 0);
  });
  defineStateAccessor(prototype, "writableFinished", function() {
    return Boolean(stateValue(this, "_opencontainersWritableFinished", false));
  });
  defineStateAccessor(prototype, "writableCorked", function() {
    return stateValue(this, "_opencontainersWritableCorked", 0);
  });
  defineStateAccessor(prototype, "writableEnded", function() {
    return Boolean(stateValue(this, "_opencontainersWritableEndedPublic", false));
  });
  defineStateAccessor(prototype, "writableNeedDrain", function() {
    return Boolean(stateValue(this, "_opencontainersWritableNeedDrain", false));
  });
  defineStateAccessor(
    prototype,
    "destroyed",
    function() { return Boolean(stateValue(this, "_opencontainersDestroyed", false)); },
    function(value) { this._opencontainersDestroyed = value; }
  );
}

function defineWritableReadonlyStateAccessors(prototype) {
  defineStateAccessor(prototype, "writableFinished", function() {
    return Boolean(stateValue(this, "_opencontainersWritableFinished", false));
  });
  defineStateAccessor(prototype, "writableObjectMode", function() {
    return Boolean(stateValue(this, "_opencontainersWritableObjectMode", false));
  });
  defineStateAccessor(prototype, "writableBuffer", function() {
    return stateValue(this, "_opencontainersWritableBuffer", []);
  });
  defineStateAccessor(prototype, "writableEnded", function() {
    return Boolean(stateValue(this, "_opencontainersWritableEndedPublic", false));
  });
  defineStateAccessor(prototype, "writableNeedDrain", function() {
    return Boolean(stateValue(this, "_opencontainersWritableNeedDrain", false));
  });
  defineStateAccessor(prototype, "writableHighWaterMark", function() {
    return stateValue(this, "_opencontainersWritableHighWaterMark", getDefaultHighWaterMark(false));
  });
  defineStateAccessor(prototype, "writableCorked", function() {
    return stateValue(this, "_opencontainersWritableCorked", 0);
  });
  defineStateAccessor(prototype, "writableLength", function() {
    return stateValue(this, "_opencontainersWritableLength", 0);
  });
  defineStateAccessor(prototype, "errored", function() {
    return stateValue(this, "_opencontainersErrored", null);
  });
  defineStateAccessor(prototype, "writableAborted", function() {
    return Boolean(stateValue(this, "_opencontainersWritableAborted", false));
  });
}

function defineStateAccessor(prototype, name, get, set) {
  Object.defineProperty(get, "name", { configurable: true, value: "get" });
  if (set) Object.defineProperty(set, "name", { configurable: true, value: "set" });
  Object.defineProperty(prototype, name, {
    enumerable: false,
    configurable: false,
    get,
    ...(set ? { set } : {})
  });
}

function stateValue(instance, name, fallback) {
  return Object.hasOwn(instance, name) ? instance[name] : fallback;
}

function takePrototypeDescriptors(prototype, names) {
  const entries = [];
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) continue;
    if (descriptor.configurable) delete prototype[name];
    entries.push([name, descriptor]);
  }
  return entries;
}

function restorePrototypeDescriptors(prototype, entries) {
  for (const [name, descriptor] of entries) {
    if (!Object.hasOwn(prototype, name)) {
      Object.defineProperty(prototype, name, descriptor);
    }
  }
}

function reorderPrototypeProperties(prototype, names) {
  restorePrototypeDescriptors(prototype, takePrototypeDescriptors(prototype, names));
}

const writableTrailingDescriptors = takePrototypeDescriptors(Writable.prototype, [
  "destroy",
  "_undestroy",
  "_destroy"
]);

reorderPrototypeProperties(Writable.prototype, [
  "constructor",
  "pipe",
  "write",
  "cork",
  "uncork",
  "setDefaultEncoding",
  "_write",
  "_writev",
  "end"
]);

reorderPrototypeProperties(Duplex.prototype, [
  "constructor",
  "write",
  "cork",
  "uncork",
  "setDefaultEncoding",
  "_write",
  "_writev",
  "end",
  "destroy"
]);

for (const constructor of [Stream, Readable, Writable, Duplex, Transform, PassThrough]) {
  Object.defineProperty(constructor, "length", {
    configurable: true,
    value: 1
  });
}

defineReadableStateAccessors(Readable.prototype);
defineWritableStateAccessors(Writable.prototype);
defineDuplexWritableStateAccessors(Duplex.prototype);
restorePrototypeDescriptors(Writable.prototype, writableTrailingDescriptors);

const asyncDisposeMethods = {
  readable() { return asyncDisposeStream(this); },
  writable() { return asyncDisposeStream(this); }
};

for (const method of Object.values(asyncDisposeMethods)) {
  Object.defineProperty(method, "name", {
    configurable: true,
    value: ""
  });
}

delete Stream.prototype[Symbol.asyncDispose];
Object.defineProperty(Readable.prototype, Symbol.asyncDispose, {
  configurable: true,
  enumerable: true,
  writable: true,
  value: asyncDisposeMethods.readable
});
Object.defineProperty(Writable.prototype, Symbol.asyncDispose, {
  configurable: true,
  enumerable: true,
  writable: true,
  value: asyncDisposeMethods.writable
});
delete Duplex.prototype[Symbol.asyncDispose];
delete Transform.prototype[Symbol.asyncDispose];

function isReadable(value) {
  if (isReadableWebStream(value)) return true;
  if (isWritableWebStream(value) || isTransformWebStream(value)) return null;
  if (value instanceof Stream && "readable" in Object(value)) {
    return Boolean(value.readable && !value.destroyed && !value.errored && !value.readableEnded);
  }
  return value && "readable" in Object(value) ? false : null;
}

function isWritable(value) {
  if (isWritableWebStream(value)) return true;
  if (isReadableWebStream(value) || isTransformWebStream(value)) return null;
  if (value instanceof Stream && "writable" in Object(value)) {
    return Boolean(value.writable && !value.destroyed && !value.errored && !value.writableEnded);
  }
  return value && "writable" in Object(value) ? false : null;
}

function isErrored(value) {
  if (isReadableWebStream(value) || isWritableWebStream(value) || isTransformWebStream(value)) return false;
  if (value instanceof Stream) return Boolean(value.errored);
  return false;
}

function isDisturbed(value) {
  if (isReadableWebStream(value) || isWritableWebStream(value) || isTransformWebStream(value)) return false;
  return Boolean(value && value instanceof Stream && (
    isReadableDisturbed(value)
    || isWritableDisturbed(value)
    || isDuplexDisturbed(value)
  ));
}

function isDestroyed(value) {
  if (value instanceof Stream) return Boolean(value.destroyed);
  return null;
}

function alignStaticStreamHelperMetadata() {
  const metadata = [
    [Readable, "from", "", 2],
    [Readable, "fromWeb", "", 2],
    [Readable, "toWeb", "", 2],
    [Readable, "wrap", "", 2],
    [Writable, "fromWeb", "", 2],
    [Writable, "toWeb", "", 1],
    [Duplex, "from", "", 1],
    [Duplex, "fromWeb", "", 2],
    [Duplex, "toWeb", "", 2]
  ];

  for (const [constructor, name, functionName, length] of metadata) {
    const descriptor = Object.getOwnPropertyDescriptor(constructor, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    Object.defineProperty(descriptor.value, "name", {
      configurable: true,
      value: functionName
    });
    Object.defineProperty(descriptor.value, "length", {
      configurable: true,
      value: length
    });
  }
}

Object.defineProperty(pipelinePromise, "name", {
  configurable: true,
  value: "pipeline"
});
Object.defineProperty(finished, "length", {
  configurable: true,
  value: 2
});

export const promises = {
  finished,
  pipeline: pipelinePromise
};

export default Stream;
