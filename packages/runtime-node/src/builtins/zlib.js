import { RuntimeBuffer } from "./buffer.js";

const BROTLI_FALLBACK_MAGIC = new Uint8Array([0x4f, 0x43, 0x42, 0x52, 0x00]);

export function createZlibBuiltin({ process } = {}) {
  const promises = createPromisesApi();
  const callbackApi = {
    gzip: callbackify(promises.gzip, process),
    gunzip: callbackify(promises.gunzip, process),
    deflate: callbackify(promises.deflate, process),
    inflate: callbackify(promises.inflate, process),
    brotliCompress: callbackify(promises.brotliCompress, process),
    brotliDecompress: callbackify(promises.brotliDecompress, process),
  };
  const builtin = {
    ...callbackApi,
    ...createSyncApi(),
    promises,
    createGzip: () => unsupportedStream("createGzip"),
    createGunzip: () => unsupportedStream("createGunzip"),
    createDeflate: () => unsupportedStream("createDeflate"),
    createInflate: () => unsupportedStream("createInflate"),
    createBrotliCompress: () => unsupportedStream("createBrotliCompress"),
    createBrotliDecompress: () => unsupportedStream("createBrotliDecompress"),
  };
  builtin.default = builtin;
  return builtin;
}

function createPromisesApi() {
  const promises = {
    gzip: (input) => compress("gzip", input),
    gunzip: (input) => decompress("gzip", input),
    deflate: (input) => compress("deflate", input),
    inflate: (input) => decompress("deflate", input),
    brotliCompress: (input) => brotliCompress(input),
    brotliDecompress: (input) => brotliDecompress(input),
  };
  promises.default = promises;
  return promises;
}

function createSyncApi() {
  return {
    gzipSync: () => unsupportedSync("gzipSync"),
    gunzipSync: () => unsupportedSync("gunzipSync"),
    deflateSync: () => unsupportedSync("deflateSync"),
    inflateSync: () => unsupportedSync("inflateSync"),
    brotliCompressSync: (input) => encodeBrotliFallback(toBytes(input)),
    brotliDecompressSync: (input) => decodeBrotliFallback(toBytes(input)),
  };
}

async function compress(format, input) {
  const host = await hostZlib();
  if (host?.[format]) return promisifyHost(host[format], input);
  if (typeof CompressionStream !== "function") throw unsupportedCompression(format);
  return transformBytes(input, new CompressionStream(format));
}

async function decompress(format, input) {
  const host = await hostZlib();
  const fn = host?.[format === "gzip" ? "gunzip" : "inflate"];
  if (fn) return promisifyHost(fn, input);
  if (typeof DecompressionStream !== "function") throw unsupportedCompression(format);
  return transformBytes(input, new DecompressionStream(format));
}

async function brotliCompress(input) {
  const host = await hostZlib();
  if (host?.brotliCompress) return promisifyHost(host.brotliCompress, input);
  return encodeBrotliFallback(toBytes(input));
}

async function brotliDecompress(input) {
  const bytes = toBytes(input);
  const host = await hostZlib();
  if (host?.brotliDecompress) return promisifyHost(host.brotliDecompress, bytes);
  return decodeBrotliFallback(bytes);
}

async function transformBytes(input, transformStream) {
  const bytes = toBytes(input);
  const stream = new Blob([bytes]).stream().pipeThrough(transformStream);
  return RuntimeBuffer.from(new Uint8Array(await new Response(stream).arrayBuffer()));
}

function callbackify(fn, process) {
  return (input, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    if (typeof cb !== "function") throw new TypeError("Callback must be a function");
    process?.__opencontainersAddRef?.();
    fn(input, typeof options === "function" ? undefined : options)
      .then((value) => cb(null, value), (error) => cb(error))
      .finally(() => process?.__opencontainersUnref?.());
  };
}

function promisifyHost(fn, input, options) {
  return new Promise((resolve, reject) => {
    const callback = (error, result) => error ? reject(error) : resolve(RuntimeBuffer.from(result));
    if (options === undefined) fn(toBytes(input), callback);
    else fn(toBytes(input), options, callback);
  });
}

let hostZlibPromise;

function hostZlib() {
  if (typeof globalThis.process?.versions?.node !== "string") return Promise.resolve(null);
  hostZlibPromise ??= Function("specifier", "return import(specifier)")("node:zlib")
    .catch(() => null);
  return hostZlibPromise;
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
