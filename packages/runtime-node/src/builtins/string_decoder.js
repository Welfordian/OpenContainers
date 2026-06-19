export class StringDecoder {
  constructor(encoding = "utf8") {
    this.encoding = normalizeEncoding(encoding);
    this.pending = new Uint8Array();
    this.decoder = new TextDecoder(this.encoding === "utf16le" ? "utf-16le" : "utf-8");
  }

  write(buffer) {
    const bytes = toBytes(buffer);
    const data = concatBytes(this.pending, bytes);
    this.pending = new Uint8Array();
    return decodeBytes(data, this.encoding, this.decoder, { stream: true });
  }

  end(buffer) {
    const bytes = buffer === undefined ? this.pending : concatBytes(this.pending, toBytes(buffer));
    this.pending = new Uint8Array();
    return decodeBytes(bytes, this.encoding, this.decoder, { stream: false });
  }
}

function normalizeEncoding(encoding) {
  const normalized = String(encoding || "utf8").toLowerCase().replace(/[-_]/g, "");
  if (normalized === "utf8" || normalized === "utf") return "utf8";
  if (normalized === "utf16le" || normalized === "ucs2") return "utf16le";
  if (normalized === "base64") return "base64";
  if (normalized === "hex") return "hex";
  if (normalized === "latin1" || normalized === "binary") return "latin1";
  return "utf8";
}

function toBytes(value) {
  if (value === undefined || value === null) return new Uint8Array();
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}

function concatBytes(left, right) {
  if (!left.byteLength) return right;
  if (!right.byteLength) return left;
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left);
  merged.set(right, left.byteLength);
  return merged;
}

function decodeBytes(bytes, encoding, decoder, options) {
  if (encoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (encoding === "base64") return bytesToBase64(bytes);
  if (encoding === "latin1") return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return decoder.decode(bytes, options);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  throw new Error("base64 encoding is unavailable");
}

export default {
  StringDecoder
};
