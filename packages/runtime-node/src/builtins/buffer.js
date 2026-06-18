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
    if (typeof fill === "string") buffer.#fillString(fill, encoding);
    else buffer.fill(fill);
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

  static byteLength(value, encoding) {
    return OpenContainersBuffer.from(value, encoding).byteLength;
  }

  static isBuffer(value) {
    return value instanceof Uint8Array;
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

  #fillString(value, encoding) {
    const bytes = OpenContainersBuffer.from(value, encoding);
    if (!bytes.length) return;
    for (let offset = 0; offset < this.length; offset += bytes.length) {
      this.set(bytes.subarray(0, Math.min(bytes.length, this.length - offset)), offset);
    }
  }
}

OpenContainersBuffer.poolSize = 8192;

export const RuntimeBuffer = globalThis.Buffer ?? OpenContainersBuffer;
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = RuntimeBuffer;

export default {
  Buffer: RuntimeBuffer,
  OpenContainersBuffer
};

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  throw new Error("base64 encoding is unavailable in this runtime");
}

function base64ToBytes(value) {
  const normalized = String(value).replace(/\s+/g, "");
  if (typeof atob === "function") {
    const binary = atob(normalized);
    const bytes = new OpenContainersBuffer(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  if (globalThis.Buffer && globalThis.Buffer !== OpenContainersBuffer) {
    return new OpenContainersBuffer(globalThis.Buffer.from(normalized, "base64"));
  }
  throw new Error("base64 decoding is unavailable in this runtime");
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
