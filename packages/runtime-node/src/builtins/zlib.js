import { RuntimeBuffer } from "./buffer.js";
import { Transform } from "./stream.js";

const BROTLI_FALLBACK_MAGIC = new Uint8Array([0x4f, 0x43, 0x42, 0x52, 0x00]);
const ZLIB_TOP_LEVEL_CONSTANT_NAMES = [
  "Z_NO_FLUSH",
  "Z_PARTIAL_FLUSH",
  "Z_SYNC_FLUSH",
  "Z_FULL_FLUSH",
  "Z_FINISH",
  "Z_BLOCK",
  "Z_OK",
  "Z_STREAM_END",
  "Z_NEED_DICT",
  "Z_ERRNO",
  "Z_STREAM_ERROR",
  "Z_DATA_ERROR",
  "Z_MEM_ERROR",
  "Z_BUF_ERROR",
  "Z_VERSION_ERROR",
  "Z_NO_COMPRESSION",
  "Z_BEST_SPEED",
  "Z_BEST_COMPRESSION",
  "Z_DEFAULT_COMPRESSION",
  "Z_FILTERED",
  "Z_HUFFMAN_ONLY",
  "Z_RLE",
  "Z_FIXED",
  "Z_DEFAULT_STRATEGY",
  "ZLIB_VERNUM",
  "DEFLATE",
  "INFLATE",
  "GZIP",
  "GUNZIP",
  "DEFLATERAW",
  "INFLATERAW",
  "UNZIP",
  "ZSTD_DECOMPRESS",
  "ZSTD_COMPRESS",
  "Z_MIN_WINDOWBITS",
  "Z_MAX_WINDOWBITS",
  "Z_DEFAULT_WINDOWBITS",
  "Z_MIN_CHUNK",
  "Z_MAX_CHUNK",
  "Z_DEFAULT_CHUNK",
  "Z_MIN_MEMLEVEL",
  "Z_MAX_MEMLEVEL",
  "Z_DEFAULT_MEMLEVEL",
  "Z_MIN_LEVEL",
  "Z_MAX_LEVEL",
  "Z_DEFAULT_LEVEL",
  "ZSTD_e_continue",
  "ZSTD_e_flush",
  "ZSTD_e_end",
  "ZSTD_fast",
  "ZSTD_dfast",
  "ZSTD_greedy",
  "ZSTD_lazy",
  "ZSTD_lazy2",
  "ZSTD_btlazy2",
  "ZSTD_btopt",
  "ZSTD_btultra",
  "ZSTD_btultra2",
  "ZSTD_c_compressionLevel",
  "ZSTD_c_windowLog",
  "ZSTD_c_hashLog",
  "ZSTD_c_chainLog",
  "ZSTD_c_searchLog",
  "ZSTD_c_minMatch",
  "ZSTD_c_targetLength",
  "ZSTD_c_strategy",
  "ZSTD_c_enableLongDistanceMatching",
  "ZSTD_c_ldmHashLog",
  "ZSTD_c_ldmMinMatch",
  "ZSTD_c_ldmBucketSizeLog",
  "ZSTD_c_ldmHashRateLog",
  "ZSTD_c_contentSizeFlag",
  "ZSTD_c_checksumFlag",
  "ZSTD_c_dictIDFlag",
  "ZSTD_c_nbWorkers",
  "ZSTD_c_jobSize",
  "ZSTD_c_overlapLog",
  "ZSTD_d_windowLogMax",
  "ZSTD_CLEVEL_DEFAULT",
  "ZSTD_error_no_error",
  "ZSTD_error_GENERIC",
  "ZSTD_error_prefix_unknown",
  "ZSTD_error_version_unsupported",
  "ZSTD_error_frameParameter_unsupported",
  "ZSTD_error_frameParameter_windowTooLarge",
  "ZSTD_error_corruption_detected",
  "ZSTD_error_checksum_wrong",
  "ZSTD_error_literals_headerWrong",
  "ZSTD_error_dictionary_corrupted",
  "ZSTD_error_dictionary_wrong",
  "ZSTD_error_dictionaryCreation_failed",
  "ZSTD_error_parameter_unsupported",
  "ZSTD_error_parameter_combination_unsupported",
  "ZSTD_error_parameter_outOfBound",
  "ZSTD_error_tableLog_tooLarge",
  "ZSTD_error_maxSymbolValue_tooLarge",
  "ZSTD_error_maxSymbolValue_tooSmall",
  "ZSTD_error_stabilityCondition_notRespected",
  "ZSTD_error_stage_wrong",
  "ZSTD_error_init_missing",
  "ZSTD_error_memory_allocation",
  "ZSTD_error_workSpace_tooSmall",
  "ZSTD_error_dstSize_tooSmall",
  "ZSTD_error_srcSize_wrong",
  "ZSTD_error_dstBuffer_null",
  "ZSTD_error_noForwardProgress_destFull",
  "ZSTD_error_noForwardProgress_inputEmpty",
];

const ZLIB_DEFAULT_CHUNK = 16 * 1024;
const ZLIB_DEFAULT_MAX_OUTPUT_LENGTH = Number.MAX_SAFE_INTEGER;
const CLASSIC_ZLIB_KIND_METADATA = {
  deflate: 1,
  inflate: 2,
  gzip: 3,
  gunzip: 4,
  deflateRaw: 5,
  inflateRaw: 6,
  unzip: 7,
};
const ZLIB_HANDLE_NAMES = {
  deflate: "Zlib",
  inflate: "Zlib",
  gzip: "Zlib",
  gunzip: "Zlib",
  deflateRaw: "Zlib",
  inflateRaw: "Zlib",
  unzip: "Zlib",
  brotliCompress: "BrotliEncoder",
  brotliDecompress: "BrotliDecoder",
  zstdCompress: "ZstdCompress",
  zstdDecompress: "ZstdDecompress",
};
const zlibHandleConstructors = new Map();

export function createZlibBuiltin({ process } = {}) {
  const promises = createPromisesApi();
  const constants = createConstants();
  const codes = createCodes();
  const callbackApi = {
    gzip: callbackify(promises.gzip, process, "gzip"),
    gunzip: callbackify(promises.gunzip, process, "gunzip"),
    deflate: callbackify(promises.deflate, process, "deflate"),
    inflate: callbackify(promises.inflate, process, "inflate"),
    deflateRaw: callbackify(promises.deflateRaw, process, "deflateRaw"),
    inflateRaw: callbackify(promises.inflateRaw, process, "inflateRaw"),
    unzip: callbackify(promises.unzip, process, "unzip"),
    brotliCompress: callbackify(promises.brotliCompress, process),
    brotliDecompress: callbackify(promises.brotliDecompress, process),
    zstdCompress: callbackify(promises.zstdCompress, process),
    zstdDecompress: callbackify(promises.zstdDecompress, process),
  };
  const syncApi = createSyncApi();
  const builtin = {
    crc32,
    Deflate: createCallableZlibTransformConstructor("Deflate", promises.deflate, process, "deflate"),
    Inflate: createCallableZlibTransformConstructor("Inflate", promises.inflate, process, "inflate"),
    Gzip: createCallableZlibTransformConstructor("Gzip", promises.gzip, process, "gzip"),
    Gunzip: createCallableZlibTransformConstructor("Gunzip", promises.gunzip, process, "gunzip"),
    DeflateRaw: createCallableZlibTransformConstructor("DeflateRaw", promises.deflateRaw, process, "deflateRaw"),
    InflateRaw: createCallableZlibTransformConstructor("InflateRaw", promises.inflateRaw, process, "inflateRaw"),
    Unzip: createCallableZlibTransformConstructor("Unzip", promises.unzip, process, "unzip"),
    BrotliCompress: createCallableZlibTransformConstructor("BrotliCompress", promises.brotliCompress, process, undefined, "brotliCompress"),
    BrotliDecompress: createCallableZlibTransformConstructor("BrotliDecompress", promises.brotliDecompress, process, undefined, "brotliDecompress"),
    ZstdCompress: class ZstdCompress extends ZlibTransform {
      constructor(options) {
        super(promises.zstdCompress, process, options, undefined, "zstdCompress");
      }
    },
    ZstdDecompress: class ZstdDecompress extends ZlibTransform {
      constructor(options) {
        super(promises.zstdDecompress, process, options, undefined, "zstdDecompress");
      }
    },
    deflate: callbackApi.deflate,
    deflateSync: syncApi.deflateSync,
    gzip: callbackApi.gzip,
    gzipSync: syncApi.gzipSync,
    deflateRaw: callbackApi.deflateRaw,
    deflateRawSync: syncApi.deflateRawSync,
    unzip: callbackApi.unzip,
    unzipSync: syncApi.unzipSync,
    inflate: callbackApi.inflate,
    inflateSync: syncApi.inflateSync,
    gunzip: callbackApi.gunzip,
    gunzipSync: syncApi.gunzipSync,
    inflateRaw: callbackApi.inflateRaw,
    inflateRawSync: syncApi.inflateRawSync,
    brotliCompress: callbackApi.brotliCompress,
    brotliCompressSync: syncApi.brotliCompressSync,
    brotliDecompress: callbackApi.brotliDecompress,
    brotliDecompressSync: syncApi.brotliDecompressSync,
    zstdCompress: callbackApi.zstdCompress,
    zstdCompressSync: syncApi.zstdCompressSync,
    zstdDecompress: callbackApi.zstdDecompress,
    zstdDecompressSync: syncApi.zstdDecompressSync,
  };
  builtin.createDeflate = createZlibFactory(builtin.Deflate);
  builtin.createInflate = createZlibFactory(builtin.Inflate);
  builtin.createDeflateRaw = createZlibFactory(builtin.DeflateRaw);
  builtin.createInflateRaw = createZlibFactory(builtin.InflateRaw);
  builtin.createGzip = createZlibFactory(builtin.Gzip);
  builtin.createGunzip = createZlibFactory(builtin.Gunzip);
  builtin.createUnzip = createZlibFactory(builtin.Unzip);
  builtin.createBrotliCompress = createZlibFactory(builtin.BrotliCompress);
  builtin.createBrotliDecompress = createZlibFactory(builtin.BrotliDecompress);
  builtin.createZstdCompress = createZlibFactory(builtin.ZstdCompress);
  builtin.createZstdDecompress = createZlibFactory(builtin.ZstdDecompress);
  alignZlibTransformPrototypeHierarchy(builtin);
  defineReadonlyValue(builtin, "constants", constants, { configurable: false });
  defineReadonlyValue(builtin, "codes", codes, { configurable: false });
  for (const name of [
    "createDeflate",
    "createInflate",
    "createDeflateRaw",
    "createInflateRaw",
    "createGzip",
    "createGunzip",
    "createUnzip",
    "createBrotliCompress",
    "createBrotliDecompress",
    "createZstdCompress",
    "createZstdDecompress",
  ]) {
    defineReadonlyValue(builtin, name, builtin[name], { configurable: true });
  }
  defineTopLevelZlibConstants(builtin, constants);
  return builtin;
}

function createCallableZlibTransformConstructor(name, operation, process, kind, stateKind = kind) {
  const Constructor = function (options) {
    return Reflect.construct(ZlibTransform, [operation, process, options, kind, stateKind], new.target || Constructor);
  };
  Object.defineProperty(Constructor, "name", {
    configurable: true,
    value: name
  });
  return Constructor;
}

function alignZlibTransformPrototypeHierarchy(builtin) {
  const original = {
    _flush: ZlibTransform.prototype._flush,
    _transform: ZlibTransform.prototype._transform,
    close: ZlibTransform.prototype.close,
    flush: ZlibTransform.prototype.flush,
    params: ZlibTransform.prototype.params,
    reset: ZlibTransform.prototype.reset,
  };

  const zlibBasePrototype = Object.create(Object.getPrototypeOf(ZlibTransform.prototype));
  definePrototypeConstructor(zlibBasePrototype, "ZlibBase", 4);
  Object.defineProperty(zlibBasePrototype, "_closed", {
    configurable: true,
    enumerable: true,
    get: createZlibProbeMethod("get", 0, function getClosed() {
      return Boolean(this.destroyed || this.closed);
    })
  });
  defineZlibProbeMethod(zlibBasePrototype, "reset", 0, function reset() {
    return original.reset.call(this);
  });
  defineZlibProbeMethod(zlibBasePrototype, "_flush", 1, function _flush(callback) {
    return original._flush.call(this, callback);
  }, "");
  defineZlibProbeMethod(zlibBasePrototype, "_final", 1, function _final(callback) {
    return original._flush.call(this, callback);
  }, "");
  defineZlibProbeMethod(zlibBasePrototype, "flush", 2, function flush(kind, callback) {
    return original.flush.call(this, kind, callback);
  }, "");
  defineZlibProbeMethod(zlibBasePrototype, "close", 1, function close(callback) {
    return original.close.call(this, callback);
  }, "");
  defineZlibProbeMethod(zlibBasePrototype, "_destroy", 2, function _destroy(_error, callback) {
    this._handle = null;
    callback?.();
  }, "");
  defineZlibProbeMethod(zlibBasePrototype, "_transform", 3, function _transform(chunk, encoding, callback) {
    return original._transform.call(this, chunk, encoding, callback);
  }, "");
  defineZlibProbeMethod(zlibBasePrototype, "_processChunk", 3, function _processChunk(chunk, _flushFlag, callback) {
    if (typeof callback === "function") {
      return original._transform.call(this, chunk, undefined, callback);
    }
    this.bytesWritten += RuntimeBuffer.from(chunk).byteLength;
    return RuntimeBuffer.alloc(0);
  }, "");

  const zlibPrototype = Object.create(zlibBasePrototype);
  definePrototypeConstructor(zlibPrototype, "Zlib", 2);
  defineZlibProbeMethod(zlibPrototype, "params", 3, function params(level, strategy, callback) {
    return original.params.call(this, level, strategy, callback);
  });

  const brotliPrototype = Object.create(zlibPrototype);
  definePrototypeConstructor(brotliPrototype, "Brotli", 2);

  const zstdPrototype = Object.create(zlibBasePrototype);
  definePrototypeConstructor(zstdPrototype, "Zstd", 4);

  for (const name of ["Deflate", "Inflate", "Gzip", "Gunzip", "DeflateRaw", "InflateRaw", "Unzip"]) {
    Object.setPrototypeOf(builtin[name].prototype, zlibPrototype);
  }
  for (const name of ["BrotliCompress", "BrotliDecompress"]) {
    Object.setPrototypeOf(builtin[name].prototype, brotliPrototype);
  }
  for (const name of ["ZstdCompress", "ZstdDecompress"]) {
    Object.setPrototypeOf(builtin[name].prototype, zstdPrototype);
  }
}

function definePrototypeConstructor(prototype, name, length) {
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: createZlibProbeMethod(name, length, function constructor() {})
  });
}

function defineZlibProbeMethod(prototype, name, length, implementation, valueName = name) {
  Object.defineProperty(prototype, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: createZlibProbeMethod(valueName, length, implementation)
  });
}

function createZlibProbeMethod(name, length, implementation) {
  const method = function (...args) {
    return implementation.apply(this, args);
  };
  Object.defineProperty(method, "name", {
    configurable: true,
    value: name
  });
  Object.defineProperty(method, "length", {
    configurable: true,
    value: length
  });
  return method;
}

function createZlibFactory(TransformConstructor) {
  return function value(options) {
    return new TransformConstructor(options);
  };
}

function defineTopLevelZlibConstants(builtin, constants) {
  for (const name of ZLIB_TOP_LEVEL_CONSTANT_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(constants, name)) continue;
    Object.defineProperty(builtin, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: constants[name],
    });
  }
}

function defineReadonlyValue(target, name, value, { configurable }) {
  Object.defineProperty(target, name, {
    configurable,
    enumerable: true,
    writable: false,
    value,
  });
}

function createCodes() {
  return {
    0: "Z_OK",
    1: "Z_STREAM_END",
    2: "Z_NEED_DICT",
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    Z_VERSION_ERROR: -6,
    "-1": "Z_ERRNO",
    "-2": "Z_STREAM_ERROR",
    "-3": "Z_DATA_ERROR",
    "-4": "Z_MEM_ERROR",
    "-5": "Z_BUF_ERROR",
    "-6": "Z_VERSION_ERROR",
  };
}

class ZlibTransform extends Transform {
  constructor(operation, process, options = {}, kind, stateKind = kind) {
    validateClassicZlibOptions(options, kind);
    super(options);
    this.#operation = operation;
    this.#options = { ...options };
    this.#process = process;
    this.bytesWritten = 0;
    this.#level = options.level;
    this.#strategy = options.strategy;
    initializeNativeZlibState(this, options, stateKind);
  }

  #chunks = [];
  #flushedOutput = false;
  #level;
  #operation;
  #options;
  #process;
  #strategy;

  _transform(chunk, _encoding, callback) {
    const bytes = RuntimeBuffer.from(chunk);
    this.bytesWritten += bytes.byteLength;
    this.#chunks.push(bytes);
    callback();
  }

  _flush(callback) {
    this.#processBufferedChunks(callback);
  }

  flush(kind, callback) {
    if (kind !== undefined && typeof kind !== "function") validateFlushKind(kind);
    const cb = typeof kind === "function" ? kind : callback;
    this.#processBufferedChunks((error, output) => {
      if (error) {
        if (typeof cb === "function") cb(error);
        else this.emit("error", error);
        return;
      }
      if (output?.byteLength > 0) this.push(output);
      cb?.(null);
    });
    return undefined;
  }

  params(level, strategy, callback) {
    validateNumericArgument("level", level, -1, 9);
    validateNumericArgument("strategy", strategy, 0, 4);
    this.#level = level;
    this.#strategy = strategy;
    this._level = level;
    this._strategy = strategy;
    queueMicrotask(() => callback?.(null));
    return undefined;
  }

  #operationOptions() {
    const options = { ...this.#options };
    if (this.#level !== undefined) options.level = this.#level;
    if (this.#strategy !== undefined) options.strategy = this.#strategy;
    return Object.keys(options).length > 0 ? options : undefined;
  }

  reset() {
    this.#chunks = [];
    this.bytesWritten = 0;
    this.#flushedOutput = false;
    return undefined;
  }

  close(callback) {
    if (!this.destroyed) this.destroy();
    queueMicrotask(() => callback?.());
    return undefined;
  }

  #processBufferedChunks(callback) {
    if (this.#chunks.length === 0 && this.#flushedOutput) {
      queueMicrotask(() => callback(null, RuntimeBuffer.alloc(0)));
      return;
    }
    const input = RuntimeBuffer.concat(this.#chunks);
    this.#chunks = [];
    this.#process?.__opencontainersAddRef?.();
    this.#operation(input, this.#operationOptions())
      .then((output) => {
        const bytes = RuntimeBuffer.from(output);
        this.#flushedOutput = true;
        callback(null, bytes);
      }, callback)
      .finally(() => this.#process?.__opencontainersUnref?.());
  }
}

function initializeNativeZlibState(stream, options, stateKind) {
  const chunkSize = options?.chunkSize ?? ZLIB_DEFAULT_CHUNK;
  const handleName = ZLIB_HANDLE_NAMES[stateKind] ?? "Zlib";
  stream._writeState = new Uint32Array(2);
  stream.allowHalfOpen = true;
  stream._handle = createNativeZlibHandle(handleName);
  stream._outBuffer = RuntimeBuffer.alloc(chunkSize);
  stream._outOffset = 0;
  stream._chunkSize = chunkSize;
  stream._defaultFlushFlag = options?.flush ?? 0;
  stream._finishFlushFlag = options?.finishFlush ?? (isClassicZlibKind(stateKind) ? 4 : 2);
  stream._defaultFullFlushFlag = isClassicZlibKind(stateKind) ? 3 : 1;
  stream._info = options?.info;
  stream._maxOutputLength = options?.maxOutputLength ?? ZLIB_DEFAULT_MAX_OUTPUT_LENGTH;
  stream._rejectGarbageAfterEnd = false;
  if (isClassicZlibKind(stateKind)) {
    stream._level = options?.level ?? -1;
    stream._strategy = options?.strategy ?? 0;
    stream._mode = CLASSIC_ZLIB_KIND_METADATA[stateKind];
  }
}

function isClassicZlibKind(kind) {
  return Object.prototype.hasOwnProperty.call(CLASSIC_ZLIB_KIND_METADATA, kind);
}

function createNativeZlibHandle(name) {
  let Constructor = zlibHandleConstructors.get(name);
  if (!Constructor) {
    Constructor = function ZlibHandle() {};
    Object.defineProperty(Constructor, "name", {
      configurable: true,
      value: name
    });
    zlibHandleConstructors.set(name, Constructor);
  }
  return Object.create(Constructor.prototype);
}

function createPromisesApi() {
  const promises = {
    gzip: (input, options) => compress("gzip", input, options),
    gunzip: (input, options) => decompress("gzip", input, options),
    deflate: (input, options) => compress("deflate", input, options),
    inflate: (input, options) => decompress("deflate", input, options),
    deflateRaw: (input, options) => compress("deflate-raw", input, options),
    inflateRaw: (input, options) => decompress("deflate-raw", input, options),
    unzip: (input, options) => unzip(input, options),
    brotliCompress: (input, options) => brotliCompress(input, options),
    brotliDecompress: (input, options) => brotliDecompress(input, options),
    zstdCompress: (input, options) => zstdCompress(input, options),
    zstdDecompress: (input, options) => zstdDecompress(input, options),
  };
  return promises;
}

function createSyncApi() {
  return {
    gzipSync: createSyncWrapper("gzipSync"),
    gunzipSync: createSyncWrapper("gunzipSync"),
    deflateSync: createSyncWrapper("deflateSync"),
    inflateSync: createSyncWrapper("inflateSync"),
    deflateRawSync: createSyncWrapper("deflateRawSync"),
    inflateRawSync: createSyncWrapper("inflateRawSync"),
    unzipSync: createSyncWrapper("unzipSync"),
    brotliCompressSync: createSyncWrapper("brotliCompressSync", (input) => encodeBrotliFallback(toBytes(input))),
    brotliDecompressSync: createSyncWrapper("brotliDecompressSync", (input) => decodeBrotliFallback(toBytes(input))),
    zstdCompressSync: createSyncWrapper("zstdCompressSync", unsupportedZstd),
    zstdDecompressSync: createSyncWrapper("zstdDecompressSync", unsupportedZstd),
  };
}

function createSyncWrapper(name, fallback) {
  return function syncBufferWrapper(input, options) {
    return hostSync(name, input, options, typeof fallback === "function" ? () => fallback(input, options) : undefined);
  };
}

let crc32Table;

function crc32(data, value = 0) {
  const bytes = toCrc32Bytes(data);
  const seed = validateCrc32Seed(value);
  const table = crc32Table ??= createCrc32Table();
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let index = 0; index < bytes.byteLength; index++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte++) {
    let crc = byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[byte] = crc >>> 0;
  }
  return table;
}

function toCrc32Bytes(data) {
  if (
    typeof data !== "string" &&
    !(data instanceof Uint8Array) &&
    !ArrayBuffer.isView(data)
  ) {
    throw Object.assign(new TypeError(`The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView.`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (ArrayBuffer.isView(data) && !(data instanceof Uint8Array)) {
    return RuntimeBuffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return toBytes(data);
}

function validateCrc32Seed(value) {
  if (typeof value !== "number") {
    throw Object.assign(new TypeError(`The "value" argument must be of type number.`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw Object.assign(new RangeError(`The value of "value" is out of range.`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return value >>> 0;
}

async function compress(format, input, options) {
  const host = await hostZlib();
  const hostName = format === "deflate-raw" ? "deflateRaw" : format;
  if (host?.[hostName]) return promisifyHost(host[hostName], input, options);
  if (typeof CompressionStream !== "function") throw unsupportedCompression(format);
  return transformBytes(input, new CompressionStream(format));
}

async function decompress(format, input, options) {
  const host = await hostZlib();
  const fn = host?.[format === "gzip" ? "gunzip" : format === "deflate-raw" ? "inflateRaw" : "inflate"];
  if (fn) return promisifyHost(fn, input, options);
  if (typeof DecompressionStream !== "function") throw unsupportedCompression(format);
  return transformBytes(input, new DecompressionStream(format));
}

async function brotliCompress(input, options) {
  const host = await hostZlib();
  if (host?.brotliCompress) return promisifyHost(host.brotliCompress, input, options);
  return encodeBrotliFallback(toBytes(input));
}

async function brotliDecompress(input, options) {
  const bytes = toBytes(input);
  const host = await hostZlib();
  if (host?.brotliDecompress) return promisifyHost(host.brotliDecompress, bytes, options);
  return decodeBrotliFallback(bytes);
}

async function zstdCompress(input, options) {
  const host = await hostZlib();
  if (host?.zstdCompress) return promisifyHost(host.zstdCompress, input, options);
  return unsupportedZstd();
}

async function zstdDecompress(input, options) {
  const host = await hostZlib();
  if (host?.zstdDecompress) return promisifyHost(host.zstdDecompress, input, options);
  return unsupportedZstd();
}

async function unzip(input, options) {
  const bytes = toBytes(input);
  const host = await hostZlib();
  if (host?.unzip) return promisifyHost(host.unzip, bytes, options);
  if (looksLikeGzip(bytes)) return decompress("gzip", bytes, options);
  return decompress("deflate", bytes, options);
}

async function transformBytes(input, transformStream) {
  const bytes = toBytes(input);
  const stream = new Blob([bytes]).stream().pipeThrough(transformStream);
  return RuntimeBuffer.from(new Uint8Array(await new Response(stream).arrayBuffer()));
}

function callbackify(fn, process, kind) {
  return function asyncBufferWrapper(input, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const operationOptions = typeof options === "function" ? undefined : options;
    validateClassicZlibOptions(operationOptions, kind);
    if (typeof cb !== "function") {
      throw Object.assign(new TypeError(`The "callback" argument must be of type function. Received ${formatReceivedValue(cb)}`), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    process?.__opencontainersAddRef?.();
    fn(input, operationOptions)
      .then((value) => cb(null, value), (error) => cb(error))
      .finally(() => process?.__opencontainersUnref?.());
  };
}

function validateClassicZlibOptions(options, kind) {
  if (!kind || options === null || (typeof options !== "object" && typeof options !== "function")) return;
  validateNumericOption(options, "level", -1, 9);
  validateNumericOption(options, "memLevel", 1, 9);
  validateNumericOption(options, "strategy", 0, 4);
  validateNumericOption(options, "windowBits", kind === "gzip" ? 9 : 8, 15);
}

function validateNumericOption(options, name, min, max) {
  if (!Object.prototype.hasOwnProperty.call(options, name) || options[name] === undefined) return;
  const value = options[name];
  if (typeof value !== "number") {
    throw Object.assign(new TypeError(`The "options.${name}" property must be of type number. Received ${formatReceivedValue(value)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (value < min || value > max) {
    throw Object.assign(new RangeError(`The value of "options.${name}" is out of range. It must be >= ${min} and <= ${max}. Received ${String(value)}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
}

function validateNumericArgument(name, value, min, max) {
  if (typeof value !== "number") {
    throw Object.assign(new TypeError(`The "${name}" argument must be of type number. Received ${formatReceivedValue(value)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (value < min || value > max) {
    throw Object.assign(new RangeError(`The value of "${name}" is out of range. It must be >= ${min} and <= ${max}. Received ${String(value)}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
}

function validateFlushKind(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 5) return;
  throw Object.assign(new TypeError('The "chunk" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined'), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function formatReceivedValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  return `type ${typeof value}`;
}

function promisifyHost(fn, input, options) {
  return new Promise((resolve, reject) => {
    const callback = (error, result) => error ? reject(error) : resolve(RuntimeBuffer.from(result));
    if (options === undefined) fn(toBytes(input), callback);
    else fn(toBytes(input), options, callback);
  });
}

let hostZlibPromise;
let hostZlibSyncModule;

function hostZlib() {
  if (typeof globalThis.process?.versions?.node !== "string") return Promise.resolve(null);
  hostZlibPromise ??= Function("specifier", "return import(specifier)")("node:zlib")
    .catch(() => null);
  return hostZlibPromise;
}

function hostZlibSync() {
  if (typeof globalThis.process?.versions?.node !== "string") return null;
  if (hostZlibSyncModule !== undefined) return hostZlibSyncModule;
  try {
    hostZlibSyncModule = globalThis.process.getBuiltinModule?.("node:zlib") ?? null;
  } catch {
    hostZlibSyncModule = null;
  }
  return hostZlibSyncModule;
}

function hostSync(name, input, options, fallback) {
  const host = hostZlibSync();
  if (typeof host?.[name] === "function") {
    return RuntimeBuffer.from(host[name](toBytes(input), options));
  }
  if (typeof fallback === "function") return fallback();
  return unsupportedSync(name);
}

function toBytes(input) {
  return RuntimeBuffer.from(input);
}

function encodeBrotliFallback(bytes) {
  const output = RuntimeBuffer.alloc(BROTLI_FALLBACK_MAGIC.length + bytes.length);
  output.set(BROTLI_FALLBACK_MAGIC, 0);
  output.set(bytes, BROTLI_FALLBACK_MAGIC.length);
  return output;
}

function decodeBrotliFallback(bytes) {
  for (let index = 0; index < BROTLI_FALLBACK_MAGIC.length; index++) {
    if (bytes[index] !== BROTLI_FALLBACK_MAGIC[index]) throw unsupportedBrotli();
  }
  return RuntimeBuffer.from(bytes.subarray(BROTLI_FALLBACK_MAGIC.length));
}

function looksLikeGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function createConstants() {
  return Object.assign(Object.create(null), {
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    Z_VERSION_ERROR: -6,
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0,
    ZLIB_VERNUM: 0x1310,
    DEFLATE: 1,
    INFLATE: 2,
    GZIP: 3,
    GUNZIP: 4,
    DEFLATERAW: 5,
    INFLATERAW: 6,
    UNZIP: 7,
    BROTLI_DECODE: 8,
    BROTLI_ENCODE: 9,
    ZSTD_DECOMPRESS: 11,
    ZSTD_COMPRESS: 10,
    Z_MIN_WINDOWBITS: 8,
    Z_MAX_WINDOWBITS: 15,
    Z_DEFAULT_WINDOWBITS: 15,
    Z_MIN_CHUNK: 64,
    Z_MAX_CHUNK: Infinity,
    Z_DEFAULT_CHUNK: 16384,
    Z_MIN_MEMLEVEL: 1,
    Z_MAX_MEMLEVEL: 9,
    Z_DEFAULT_MEMLEVEL: 8,
    Z_MIN_LEVEL: -1,
    Z_MAX_LEVEL: 9,
    Z_DEFAULT_LEVEL: -1,
    BROTLI_OPERATION_PROCESS: 0,
    BROTLI_OPERATION_FLUSH: 1,
    BROTLI_OPERATION_FINISH: 2,
    BROTLI_OPERATION_EMIT_METADATA: 3,
    BROTLI_PARAM_MODE: 0,
    BROTLI_PARAM_QUALITY: 1,
    BROTLI_PARAM_LGWIN: 2,
    BROTLI_PARAM_LGBLOCK: 3,
    BROTLI_MODE_GENERIC: 0,
    BROTLI_MODE_TEXT: 1,
    BROTLI_MODE_FONT: 2,
    BROTLI_DEFAULT_QUALITY: 11,
    BROTLI_MIN_QUALITY: 0,
    BROTLI_MAX_QUALITY: 11,
    ...(hostZlibSync()?.constants ?? {}),
  });
}

function unsupportedCompression(format) {
  return Object.assign(new Error(`${format} compression is not available in this browser`), {
    code: "ERR_OPENCONTAINERS_ZLIB_UNSUPPORTED",
  });
}

function unsupportedBrotli() {
  return Object.assign(new Error("Brotli is not available in this browser for externally-compressed payloads"), {
    code: "ERR_OPENCONTAINERS_BROTLI_UNSUPPORTED",
  });
}

function unsupportedZstd() {
  throw Object.assign(new Error("Zstandard compression is not available in this browser runtime"), {
    code: "ERR_OPENCONTAINERS_ZSTD_UNSUPPORTED",
  });
}

function unsupportedSync(name) {
  throw Object.assign(new Error(`${name} is not available in the browser runtime`), {
    code: "ERR_OPENCONTAINERS_ZLIB_SYNC_UNSUPPORTED",
  });
}

function unsupportedStream(name) {
  throw Object.assign(new Error(`${name} streams are not implemented yet`), {
    code: "ERR_OPENCONTAINERS_ZLIB_STREAM_UNSUPPORTED",
  });
}
