const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class WelfordBuffer extends Uint8Array {
  static from(value, encoding = "utf8") {
    if (value instanceof ArrayBuffer) return new WelfordBuffer(value);
    if (ArrayBuffer.isView(value)) {
      return new WelfordBuffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (Array.isArray(value)) return new WelfordBuffer(value);
    if (typeof value === "string") {
      if (encoding === "hex") {
        const bytes = new WelfordBuffer(Math.ceil(value.length / 2));
        for (let index = 0; index < bytes.length; index++) {
          bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
        }
        return bytes;
      }
      return new WelfordBuffer(encoder.encode(value));
    }
    return new WelfordBuffer(value ?? 0);
  }

  static alloc(size, fill = 0) {
    const buffer = new WelfordBuffer(size);
    buffer.fill(fill);
    return buffer;
  }

  static concat(chunks) {
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const buffer = new WelfordBuffer(size);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return buffer;
  }

  static byteLength(value, encoding) {
    return WelfordBuffer.from(value, encoding).byteLength;
  }

  static isBuffer(value) {
    return value instanceof Uint8Array;
  }

  toString(encoding = "utf8") {
    if (encoding === "hex") return [...this].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return decoder.decode(this);
  }
}

export const RuntimeBuffer = globalThis.Buffer ?? WelfordBuffer;
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = RuntimeBuffer;

export default {
  Buffer: RuntimeBuffer,
  WelfordBuffer
};
