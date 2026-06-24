const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class OpenContainersBuffer extends Uint8Array {
  static from(value, encoding = "utf8", length) {
    if (value instanceof ArrayBuffer) {
      const offset = typeof encoding === "number" ? encoding : 0;
      return new OpenContainersBuffer(value.slice(offset, length === undefined ? value.byteLength : offset + length));
    }
    if (ArrayBuffer.isView(value)) {
      return new OpenContainersBuffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (Array.isArray(value)) return new OpenContainersBuffer(value);
    if (typeof value === "string") {
      const normalizedEncoding = normalizeEncoding(encoding);
      if (normalizedEncoding === "hex") {
        const bytes = new OpenContainersBuffer(Math.ceil(value.length / 2));
        for (let index = 0; index < bytes.length; index++) {
          bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
        }
        return bytes;
      }
      if (normalizedEncoding === "base64") return base64ToBytes(value);
      if (normalizedEncoding === "latin1") {
        const bytes = new OpenContainersBuffer(value.length);
        for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 0xff;
        return bytes;
      }
      return new OpenContainersBuffer(encoder.encode(value));
    }
    return new OpenContainersBuffer(value ?? 0);
  }

  static alloc(size, fill = 0, encoding = "utf8") {
    const buffer = new OpenContainersBuffer(size);
    buffer.fill(fill, 0, size, encoding);
    return buffer;
  }

  static allocUnsafe(size) {
    return new OpenContainersBuffer(size);
  }

  static allocUnsafeSlow(size) {
    return OpenContainersBuffer.allocUnsafe(size);
  }

  static concat(chunks, totalLength) {
    const size = totalLength ?? chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const buffer = new OpenContainersBuffer(size);
    let offset = 0;
    for (const chunk of chunks) {
      const bytes = OpenContainersBuffer.from(chunk);
      buffer.set(bytes.subarray(0, Math.max(0, size - offset)), offset);
      offset += bytes.byteLength;
      if (offset >= size) break;
    }
    return buffer;
  }

  static compare(left, right) {
    return OpenContainersBuffer.from(left).compare(right);
  }

  static byteLength(value, encoding) {
    return OpenContainersBuffer.from(value, encoding).byteLength;
  }

  static isBuffer(value) {
    return value instanceof Uint8Array;
  }

  static isEncoding(encoding) {
    return isKnownEncoding(encoding);
  }

  toString(encoding = "utf8", start = 0, end = this.length) {
    const bytes = this.subarray(start, end);
    const normalizedEncoding = normalizeEncoding(encoding);
    if (normalizedEncoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (normalizedEncoding === "base64") return bytesToBase64(bytes);
    if (normalizedEncoding === "latin1") return [...bytes].map(byte => String.fromCharCode(byte)).join("");
    return decoder.decode(bytes);
  }

  write(string, offset = 0, length, encoding = "utf8") {
    if (typeof offset === "string") {
      encoding = offset;
      offset = 0;
      length = undefined;
    } else if (typeof length === "string") {
      encoding = length;
      length = undefined;
    }

    const bytes = OpenContainersBuffer.from(String(string), encoding);
    const writable = Math.min(length ?? bytes.length, bytes.length, this.length - offset);
    this.set(bytes.subarray(0, Math.max(0, writable)), offset);
    return Math.max(0, writable);
  }

  fill(value = 0, start = 0, end = this.length, encoding = "utf8") {
    const rangeStart = normalizeRangeIndex(start, this.length);
    const rangeEnd = normalizeRangeIndex(end, this.length);
    if (rangeEnd <= rangeStart) return this;

    if (typeof value === "string" || Array.isArray(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = OpenContainersBuffer.from(value, encoding);
      this.#fillBytes(bytes, rangeStart, rangeEnd);
      return this;
    }

    return super.fill(Number(value) & 0xff, rangeStart, rangeEnd);
  }

  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    const slice = this.subarray(sourceStart, sourceEnd);
    const writable = Math.min(slice.length, target.length - targetStart);
    target.set(slice.subarray(0, Math.max(0, writable)), targetStart);
    return Math.max(0, writable);
  }

  equals(other) {
    const bytes = OpenContainersBuffer.from(other);
    if (bytes.length !== this.length) return false;
    return this.every((byte, index) => byte === bytes[index]);
  }

  compare(other) {
    const bytes = OpenContainersBuffer.from(other);
    const length = Math.min(this.length, bytes.length);
    for (let index = 0; index < length; index++) {
      if (this[index] !== bytes[index]) return this[index] < bytes[index] ? -1 : 1;
    }
    if (this.length === bytes.length) return 0;
    return this.length < bytes.length ? -1 : 1;
  }

  includes(value, byteOffset = 0, encoding) {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }

  indexOf(value, byteOffset = 0, encoding) {
    const needle = normalizeSearchValue(value, encoding);
    const start = normalizeSearchOffset(byteOffset, this.length);
    if (needle.length === 0) return Math.min(start, this.length);
    for (let index = start; index <= this.length - needle.length; index++) {
      let matched = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
        if (this[index + needleIndex] !== needle[needleIndex]) {
          matched = false;
          break;
        }
      }
      if (matched) return index;
    }
    return -1;
  }

  lastIndexOf(value, byteOffset = this.length - 1, encoding) {
    const needle = normalizeSearchValue(value, encoding);
    let start = normalizeSearchOffset(byteOffset, this.length);
    if (needle.length === 0) return Math.min(start, this.length);
    start = Math.min(start, this.length - needle.length);
    for (let index = start; index >= 0; index--) {
      let matched = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
        if (this[index + needleIndex] !== needle[needleIndex]) {
          matched = false;
          break;
        }
      }
      if (matched) return index;
    }
    return -1;
  }

  toJSON() {
    return {
      type: "Buffer",
      data: Array.from(this)
    };
  }

  readUInt8(offset = 0) {
    return this[offset];
  }

  writeUInt8(value, offset = 0) {
    this[offset] = value & 0xff;
    return offset + 1;
  }

  readInt8(offset = 0) {
    const value = this.readUInt8(offset);
    return value & 0x80 ? value - 0x100 : value;
  }

  writeInt8(value, offset = 0) {
    return this.writeUInt8(value, offset);
  }

  readUInt16BE(offset = 0) {
    return (this[offset] << 8) | this[offset + 1];
  }

  readUInt16LE(offset = 0) {
    return this[offset] | (this[offset + 1] << 8);
  }

  writeUInt16BE(value, offset = 0) {
    this[offset] = (value >>> 8) & 0xff;
    this[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeUInt16LE(value, offset = 0) {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >>> 8) & 0xff;
    return offset + 2;
  }

  readInt16BE(offset = 0) {
    const value = this.readUInt16BE(offset);
    return value & 0x8000 ? value - 0x10000 : value;
  }

  readInt16LE(offset = 0) {
    const value = this.readUInt16LE(offset);
    return value & 0x8000 ? value - 0x10000 : value;
  }

  writeInt16BE(value, offset = 0) {
    return this.writeUInt16BE(value, offset);
  }

  writeInt16LE(value, offset = 0) {
    return this.writeUInt16LE(value, offset);
  }

  readUInt32BE(offset = 0) {
    return ((this[offset] * 0x1000000) + ((this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3])) >>> 0;
  }

  readUInt32LE(offset = 0) {
    return (this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] * 0x1000000)) >>> 0;
  }

  writeUInt32BE(value, offset = 0) {
    this[offset] = (value >>> 24) & 0xff;
    this[offset + 1] = (value >>> 16) & 0xff;
    this[offset + 2] = (value >>> 8) & 0xff;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }

  writeUInt32LE(value, offset = 0) {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >>> 8) & 0xff;
    this[offset + 2] = (value >>> 16) & 0xff;
    this[offset + 3] = (value >>> 24) & 0xff;
    return offset + 4;
  }

  readInt32BE(offset = 0) {
    const value = this.readUInt32BE(offset);
    return value > 0x7fffffff ? value - 0x100000000 : value;
  }

  readInt32LE(offset = 0) {
    const value = this.readUInt32LE(offset);
    return value > 0x7fffffff ? value - 0x100000000 : value;
  }

  writeInt32BE(value, offset = 0) {
    return this.writeUInt32BE(value, offset);
  }

  writeInt32LE(value, offset = 0) {
    return this.writeUInt32LE(value, offset);
  }

  readUIntBE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let value = 0;
    for (let index = 0; index < length; index++) value = value * 0x100 + this[offset + index];
    return value;
  }

  readUIntLE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let value = 0;
    let multiplier = 1;
    for (let index = 0; index < length; index++) {
      value += this[offset + index] * multiplier;
      multiplier *= 0x100;
    }
    return value;
  }

  writeUIntBE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let current = checkUnsignedInteger(value, length);
    for (let index = length - 1; index >= 0; index--) {
      this[offset + index] = current & 0xff;
      current = Math.floor(current / 0x100);
    }
    return offset + length;
  }

  writeUIntLE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    checkBounds(this, offset, length);
    let current = checkUnsignedInteger(value, length);
    for (let index = 0; index < length; index++) {
      this[offset + index] = current & 0xff;
      current = Math.floor(current / 0x100);
    }
    return offset + length;
  }

  readIntBE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const value = this.readUIntBE(offset, length);
    const sign = 2 ** (8 * length - 1);
    return value >= sign ? value - (sign * 2) : value;
  }

  readIntLE(offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const value = this.readUIntLE(offset, length);
    const sign = 2 ** (8 * length - 1);
    return value >= sign ? value - (sign * 2) : value;
  }

  writeIntBE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const current = checkSignedInteger(value, length);
    return this.writeUIntBE(current < 0 ? current + (2 ** (8 * length)) : current, offset, length);
  }

  writeIntLE(value, offset = 0, byteLength = 0) {
    const length = normalizeIntegerByteLength(byteLength);
    const current = checkSignedInteger(value, length);
    return this.writeUIntLE(current < 0 ? current + (2 ** (8 * length)) : current, offset, length);
  }

  readFloatBE(offset = 0) {
    checkBounds(this, offset, 4);
    return dataViewFor(this).getFloat32(offset, false);
  }

  readFloatLE(offset = 0) {
    checkBounds(this, offset, 4);
    return dataViewFor(this).getFloat32(offset, true);
  }

  writeFloatBE(value, offset = 0) {
    checkBounds(this, offset, 4);
    dataViewFor(this).setFloat32(offset, Number(value), false);
    return offset + 4;
  }

  writeFloatLE(value, offset = 0) {
    checkBounds(this, offset, 4);
    dataViewFor(this).setFloat32(offset, Number(value), true);
    return offset + 4;
  }

  readDoubleBE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getFloat64(offset, false);
  }

  readDoubleLE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getFloat64(offset, true);
  }

  writeDoubleBE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setFloat64(offset, Number(value), false);
    return offset + 8;
  }

  writeDoubleLE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setFloat64(offset, Number(value), true);
    return offset + 8;
  }

  readBigUInt64BE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigUint64(offset, false);
  }

  readBigUInt64LE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigUint64(offset, true);
  }

  readBigUint64BE(offset = 0) {
    return this.readBigUInt64BE(offset);
  }

  readBigUint64LE(offset = 0) {
    return this.readBigUInt64LE(offset);
  }

  writeBigUInt64BE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigUint64(offset, checkUnsignedBigInt(value), false);
    return offset + 8;
  }

  writeBigUInt64LE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigUint64(offset, checkUnsignedBigInt(value), true);
    return offset + 8;
  }

  writeBigUint64BE(value, offset = 0) {
    return this.writeBigUInt64BE(value, offset);
  }

  writeBigUint64LE(value, offset = 0) {
    return this.writeBigUInt64LE(value, offset);
  }

  readBigInt64BE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigInt64(offset, false);
  }

  readBigInt64LE(offset = 0) {
    checkBounds(this, offset, 8);
    return dataViewFor(this).getBigInt64(offset, true);
  }

  writeBigInt64BE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigInt64(offset, checkSignedBigInt(value), false);
    return offset + 8;
  }

  writeBigInt64LE(value, offset = 0) {
    checkBounds(this, offset, 8);
    dataViewFor(this).setBigInt64(offset, checkSignedBigInt(value), true);
    return offset + 8;
  }

  readUint8(offset = 0) {
    return this.readUInt8(offset);
  }

  readUint16BE(offset = 0) {
    return this.readUInt16BE(offset);
  }

  readUint16LE(offset = 0) {
    return this.readUInt16LE(offset);
  }

  readUint32BE(offset = 0) {
    return this.readUInt32BE(offset);
  }

  readUint32LE(offset = 0) {
    return this.readUInt32LE(offset);
  }

  readUintBE(offset = 0, byteLength = 0) {
    return this.readUIntBE(offset, byteLength);
  }

  readUintLE(offset = 0, byteLength = 0) {
    return this.readUIntLE(offset, byteLength);
  }

  writeUint8(value, offset = 0) {
    return this.writeUInt8(value, offset);
  }

  writeUint16BE(value, offset = 0) {
    return this.writeUInt16BE(value, offset);
  }

  writeUint16LE(value, offset = 0) {
    return this.writeUInt16LE(value, offset);
  }

  writeUint32BE(value, offset = 0) {
    return this.writeUInt32BE(value, offset);
  }

  writeUint32LE(value, offset = 0) {
    return this.writeUInt32LE(value, offset);
  }

  writeUintBE(value, offset = 0, byteLength = 0) {
    return this.writeUIntBE(value, offset, byteLength);
  }

  writeUintLE(value, offset = 0, byteLength = 0) {
    return this.writeUIntLE(value, offset, byteLength);
  }

  swap16() {
    return swapBytes(this, 2);
  }

  swap32() {
    return swapBytes(this, 4);
  }

  swap64() {
    return swapBytes(this, 8);
  }

  #fillBytes(bytes, start, end) {
    if (!bytes.length) return;
    for (let offset = start; offset < end; offset += bytes.length) {
      this.set(bytes.subarray(0, Math.min(bytes.length, end - offset)), offset);
    }
  }
}

OpenContainersBuffer.poolSize = 8192;

const BUFFER_STATIC_METHODS = {
  from: OpenContainersBuffer.from.bind(OpenContainersBuffer),
  alloc: OpenContainersBuffer.alloc.bind(OpenContainersBuffer),
  allocUnsafe: OpenContainersBuffer.allocUnsafe.bind(OpenContainersBuffer),
  allocUnsafeSlow: OpenContainersBuffer.allocUnsafeSlow.bind(OpenContainersBuffer),
  concat: OpenContainersBuffer.concat.bind(OpenContainersBuffer),
  compare: OpenContainersBuffer.compare.bind(OpenContainersBuffer),
  byteLength: OpenContainersBuffer.byteLength.bind(OpenContainersBuffer),
  isBuffer: OpenContainersBuffer.isBuffer.bind(OpenContainersBuffer),
  isEncoding: OpenContainersBuffer.isEncoding.bind(OpenContainersBuffer)
};

installBufferStatics(OpenContainersBuffer, BUFFER_STATIC_METHODS, { overwrite: true, enumerable: true });

export const RuntimeBuffer = globalThis.Buffer ?? OpenContainersBuffer;
installBufferStatics(RuntimeBuffer, BUFFER_STATIC_METHODS, {
  enumerable: RuntimeBuffer === OpenContainersBuffer || typeof globalThis.process?.versions?.node !== "string"
});
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = RuntimeBuffer;

export let INSPECT_MAX_BYTES = 50;
export const kMaxLength = Number.MAX_SAFE_INTEGER;
export const kStringMaxLength = 0x1fffffe8;
export const constants = createBufferConstants();

const BLOB_CHUNKS = Symbol("opencontainers.blobChunks");
const OBJECT_URL_REGISTRY = new Map();
let objectUrlCounter = 0;
let objectUrlRegistryInstalled = false;

function normalizeBlobParts(parts) {
  const chunks = [];
  for (const part of parts) {
    if (part instanceof ArrayBuffer || ArrayBuffer.isView(part) || Array.isArray(part)) {
      chunks.push(OpenContainersBuffer.from(part));
      continue;
    }
    if (part instanceof OpenContainersBlobFallback) {
      chunks.push(...part[BLOB_CHUNKS]);
      continue;
    }
    chunks.push(OpenContainersBuffer.from(String(part)));
  }
  return chunks;
}

class OpenContainersBlobFallback {
  constructor(parts = [], options = {}) {
    this[BLOB_CHUNKS] = normalizeBlobParts(parts);
    this.type = String(options.type ?? "").toLowerCase();
    this.size = this[BLOB_CHUNKS].reduce((total, part) => total + part.byteLength, 0);
  }

  async text() {
    return OpenContainersBuffer.concat(this[BLOB_CHUNKS]).toString();
  }

  async arrayBuffer() {
    const bytes = OpenContainersBuffer.concat(this[BLOB_CHUNKS]);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  slice(start = 0, end = this.size, type = "") {
    const rangeStart = normalizeRangeIndex(start, this.size);
    const rangeEnd = normalizeRangeIndex(end, this.size);
    const bytes = OpenContainersBuffer.concat(this[BLOB_CHUNKS]).subarray(rangeStart, rangeEnd);
    return new OpenContainersBlobFallback([bytes], { type });
  }

  stream() {
    if (typeof ReadableStream !== "function") {
      throw new Error("ReadableStream is unavailable in this runtime");
    }
    const chunks = [...this[BLOB_CHUNKS]];
    return new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      }
    });
  }

}

export const Blob = globalThis.Blob ?? OpenContainersBlobFallback;

export const File = globalThis.File ?? class OpenContainersFile extends Blob {
  constructor(parts = [], name = "", options = {}) {
    super(parts, options);
    this.name = String(name);
    this.lastModified = Number(options.lastModified ?? Date.now());
  }
};

installObjectUrlRegistry();

export function atob(value) {
  return bytesToBinaryString(base64ToBytes(String(value)));
}

export function btoa(value) {
  return bytesToBase64(binaryStringToBytes(String(value)));
}

export function isAscii(input) {
  return normalizeBufferValidationInput(input).every(byte => byte <= 0x7f);
}

export function isUtf8(input) {
  const bytes = normalizeBufferValidationInput(input);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function transcode(source, _fromEncoding, toEncoding) {
  return RuntimeBuffer.from(RuntimeBuffer.from(source).toString(), toEncoding);
}

export function resolveObjectURL(id) {
  if (typeof id !== "string") return undefined;
  return OBJECT_URL_REGISTRY.get(id);
}

const bufferBuiltin = {
  Buffer: RuntimeBuffer,
  transcode,
  isUtf8,
  isAscii,
  kMaxLength,
  kStringMaxLength,
  btoa,
  atob,
  constants,
  INSPECT_MAX_BYTES,
  Blob,
  resolveObjectURL,
  File,
};

Object.defineProperty(bufferBuiltin, "constants", {
  enumerable: true,
  configurable: false,
  writable: false,
  value: constants
});
Object.defineProperty(bufferBuiltin, "INSPECT_MAX_BYTES", {
  enumerable: true,
  configurable: true,
  get() {
    return INSPECT_MAX_BYTES;
  },
  set(value) {
    INSPECT_MAX_BYTES = value;
  }
});

export default bufferBuiltin;

function createBufferConstants() {
  const values = {
    MAX_LENGTH: kMaxLength,
    MAX_STRING_LENGTH: kStringMaxLength
  };
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: false,
      writable: false,
      value
    });
  }
  return result;
}

function normalizeBufferValidationInput(input) {
  if (input instanceof ArrayBuffer || (typeof SharedArrayBuffer === "function" && input instanceof SharedArrayBuffer)) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input) && !(input instanceof DataView)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw createBufferInvalidInputError(input);
}

function createBufferInvalidInputError(input) {
  const received = input === null
    ? "null"
    : typeof input === "object"
      ? `an instance of ${input?.constructor?.name ?? "Object"}`
      : `type ${typeof input}`;
  return Object.assign(
    new TypeError(`The "input" argument must be an instance of ArrayBuffer, Buffer, or TypedArray. Received ${received}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function installObjectUrlRegistry() {
  if (objectUrlRegistryInstalled || typeof globalThis.URL !== "function") return;
  objectUrlRegistryInstalled = true;

  const originalCreateObjectURL = typeof globalThis.URL.createObjectURL === "function"
    ? globalThis.URL.createObjectURL.bind(globalThis.URL)
    : undefined;
  const originalRevokeObjectURL = typeof globalThis.URL.revokeObjectURL === "function"
    ? globalThis.URL.revokeObjectURL.bind(globalThis.URL)
    : undefined;

  globalThis.URL.createObjectURL = function createObjectURL(object) {
    const id = originalCreateObjectURL
      ? originalCreateObjectURL(object)
      : `blob:opencontainers:${++objectUrlCounter}`;
    if (object instanceof Blob) OBJECT_URL_REGISTRY.set(id, object);
    return id;
  };

  globalThis.URL.revokeObjectURL = function revokeObjectURL(id) {
    OBJECT_URL_REGISTRY.delete(String(id));
    if (originalRevokeObjectURL) return originalRevokeObjectURL(id);
    return undefined;
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  if (typeof globalThis.btoa === "function") return globalThis.btoa(binary);
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  throw new Error("base64 encoding is unavailable in this runtime");
}

function base64ToBytes(value) {
  const normalized = String(value).replace(/\s+/g, "");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(normalized);
    const bytes = new OpenContainersBuffer(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return new OpenContainersBuffer(globalThis.Buffer.from(normalized, "base64"));
  }
  throw new Error("base64 decoding is unavailable in this runtime");
}

function bytesToBinaryString(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return binary;
}

function binaryStringToBytes(value) {
  const bytes = new OpenContainersBuffer(value.length);
  for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function normalizeEncoding(encoding = "utf8") {
  const value = String(encoding || "utf8").toLowerCase().replace(/[-_]/g, "");
  if (value === "utf8" || value === "utf") return "utf8";
  if (value === "ucs2" || value === "utf16le") return "utf8";
  if (value === "ascii" || value === "binary" || value === "latin1") return "latin1";
  if (value === "base64" || value === "base64url") return "base64";
  if (value === "hex") return "hex";
  return "utf8";
}

function isKnownEncoding(encoding) {
  const value = String(encoding || "").toLowerCase().replace(/[-_]/g, "");
  return ["utf8", "utf", "ucs2", "utf16le", "ascii", "binary", "latin1", "base64", "base64url", "hex"].includes(value);
}

function normalizeSearchValue(value, encoding) {
  if (typeof value === "number") return OpenContainersBuffer.from([value & 0xff]);
  return OpenContainersBuffer.from(value, encoding);
}

function normalizeSearchOffset(offset, length) {
  const value = Number(offset);
  if (!Number.isFinite(value)) return value < 0 ? 0 : length;
  if (value < 0) return Math.max(0, length + Math.trunc(value));
  return Math.min(Math.trunc(value), length);
}

function normalizeRangeIndex(offset, length) {
  const value = Number(offset);
  if (!Number.isFinite(value)) return value < 0 ? 0 : length;
  if (value < 0) return Math.max(0, length + Math.trunc(value));
  return Math.min(Math.max(0, Math.trunc(value)), length);
}

function normalizeIntegerByteLength(byteLength) {
  const length = Number(byteLength);
  if (!Number.isInteger(length) || length < 1 || length > 6) {
    throw new RangeError("byteLength must be an integer between 1 and 6");
  }
  return length;
}

function checkBounds(buffer, offset, byteLength) {
  const normalizedOffset = Number(offset);
  if (!Number.isInteger(normalizedOffset) || normalizedOffset < 0 || normalizedOffset + byteLength > buffer.length) {
    throw new RangeError("Index out of range");
  }
}

function checkUnsignedInteger(value, byteLength) {
  const number = Number(value);
  const max = 2 ** (8 * byteLength);
  if (!Number.isInteger(number) || number < 0 || number >= max) {
    throw new RangeError(`value must be >= 0 and < ${max}`);
  }
  return number;
}

function checkSignedInteger(value, byteLength) {
  const number = Number(value);
  const limit = 2 ** (8 * byteLength - 1);
  if (!Number.isInteger(number) || number < -limit || number >= limit) {
    throw new RangeError(`value must be >= ${-limit} and < ${limit}`);
  }
  return number;
}

function checkUnsignedBigInt(value) {
  const bigint = BigInt(value);
  const max = (1n << 64n) - 1n;
  if (bigint < 0n || bigint > max) {
    throw new RangeError(`value must be >= 0n and <= ${max}n`);
  }
  return bigint;
}

function checkSignedBigInt(value) {
  const bigint = BigInt(value);
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (bigint < min || bigint > max) {
    throw new RangeError(`value must be >= ${min}n and <= ${max}n`);
  }
  return bigint;
}

function dataViewFor(buffer) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function swapBytes(buffer, size) {
  if (buffer.length % size !== 0) {
    throw new RangeError(`Buffer size must be a multiple of ${size}`);
  }
  for (let offset = 0; offset < buffer.length; offset += size) {
    for (let index = 0; index < size / 2; index++) {
      const left = offset + index;
      const right = offset + size - index - 1;
      const value = buffer[left];
      buffer[left] = buffer[right];
      buffer[right] = value;
    }
  }
  return buffer;
}

function installBufferStatics(target, methods, { overwrite = false, enumerable = false } = {}) {
  for (const [method, implementation] of Object.entries(methods)) {
    const current = target?.[method];
    if (overwrite || typeof current !== "function") {
      Object.defineProperty(target, method, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: implementation
      });
      continue;
    }

    if (!enumerable) continue;
    const descriptor = Object.getOwnPropertyDescriptor(target, method);
    if (!descriptor || descriptor.enumerable || descriptor.configurable === false) continue;
    Object.defineProperty(target, method, {
      ...descriptor,
      enumerable: true
    });
  }
}
