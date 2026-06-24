import { RuntimeBuffer } from "./buffer.js";

const kNativeDecoder = Symbol("kNativeDecoder");
const decoderState = new WeakMap();
const encodingCodes = {
  ascii: 0,
  utf8: 1,
  base64: 2,
  utf16le: 3,
  latin1: 4,
  hex: 5,
  base64url: 7
};
const lastCharGetter = nameAccessorGetter(Object.getOwnPropertyDescriptor({
  get get() {
    return getDecoderState(this).nativeDecoder.subarray(0, 4);
  }
}, "get").get);
const lastNeedGetter = nameAccessorGetter(Object.getOwnPropertyDescriptor({
  get get() {
    return getDecoderState(this).nativeDecoder[4];
  }
}, "get").get);
const lastTotalGetter = nameAccessorGetter(Object.getOwnPropertyDescriptor({
  get get() {
    return getDecoderState(this).nativeDecoder[5];
  }
}, "get").get);

function nameAccessorGetter(fn) {
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: "get"
  });
  return fn;
}

export function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  this[kNativeDecoder] = RuntimeBuffer.alloc(7);
  this[kNativeDecoder][6] = encodingCodes[this.encoding] ?? 0;
  decoderState.set(this, {
    decoder: createTextDecoder(this.encoding),
    nativeDecoder: this[kNativeDecoder],
    pending: RuntimeBuffer.alloc(0)
  });
}

Object.defineProperty(StringDecoder, "length", {
  configurable: true,
  value: 1
});

Object.defineProperties(StringDecoder.prototype, {
  write: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function write(buffer) {
      if (typeof buffer === "string") return buffer;
      const state = getDecoderState(this);
      const bytes = toBytes(buffer);
      if (this.encoding === "base64" || this.encoding === "base64url") {
        const data = concatBytes(state.pending, bytes);
        const completeLength = data.byteLength - (data.byteLength % 3);
        const pending = data.slice(completeLength);
        updateBase64State(state, data, pending);
        return encodeBase64(data.slice(0, completeLength), this.encoding);
      }
      const previousPendingLength = state.pending.byteLength;
      const data = concatBytes(state.pending, bytes);
      const result = decodeBytes(bytes, this.encoding, state.decoder, { stream: true });
      updateTextState(state, this.encoding, data, previousPendingLength);
      return result;
    }
  },
  end: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function end(buffer) {
      const state = getDecoderState(this);
      if (this.encoding === "base64" || this.encoding === "base64url") {
        const bytes = buffer === undefined ? RuntimeBuffer.alloc(0) : toBytes(buffer);
        const data = concatBytes(state.pending, bytes);
        state.pending = RuntimeBuffer.alloc(0);
        setLastState(state, 0, 0);
        if (data.byteLength) copyLastChar(state, data.slice(0, Math.min(data.byteLength, 4)));
        return encodeBase64(data, this.encoding);
      }
      const result = buffer === undefined ? "" : StringDecoder.prototype.write.call(this, buffer);
      if (state.pending.byteLength > 0) {
        state.pending = RuntimeBuffer.alloc(0);
        setLastState(state, 0, 0);
        return result + decodeBytes(RuntimeBuffer.alloc(0), this.encoding, state.decoder, { stream: false });
      }
      return result;
    }
  },
  text: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function text(buffer, offset) {
      const state = getDecoderState(this);
      state.decoder = createTextDecoder(this.encoding);
      state.pending = RuntimeBuffer.alloc(0);
      setLastState(state, 0, 0);
      return StringDecoder.prototype.write.call(this, buffer.slice(offset));
    }
  },
  lastChar: {
    configurable: true,
    enumerable: true,
    get: lastCharGetter
  },
  lastNeed: {
    configurable: true,
    enumerable: true,
    get: lastNeedGetter
  },
  lastTotal: {
    configurable: true,
    enumerable: true,
    get: lastTotalGetter
  }
});

function getDecoderState(decoder) {
  const state = decoderState.get(decoder);
  if (!state) {
    throw Object.assign(new TypeError('Value of "this" must be of type StringDecoder'), {
      code: "ERR_INVALID_THIS"
    });
  }
  return state;
}

function normalizeEncoding(encoding) {
  const normalized = String(encoding || "utf8").toLowerCase().replace(/[-_]/g, "");
  if (normalized === "utf8" || normalized === "utf") return "utf8";
  if (normalized === "utf16le" || normalized === "ucs2") return "utf16le";
  if (normalized === "base64") return "base64";
  if (normalized === "base64url") return "base64url";
  if (normalized === "hex") return "hex";
  if (normalized === "ascii") return "ascii";
  if (normalized === "latin1" || normalized === "binary") return "latin1";
  const error = new TypeError(`Unknown encoding: ${encoding}`);
  error.code = "ERR_UNKNOWN_ENCODING";
  throw error;
}

function createTextDecoder(encoding) {
  if (encoding === "utf16le") return new TextDecoder("utf-16le");
  if (encoding === "utf8") return new TextDecoder("utf-8");
  return null;
}

function toBytes(value) {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw Object.assign(new TypeError('The "buf" argument must be an instance of Buffer, TypedArray, or DataView.'), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function concatBytes(left, right) {
  if (!left.byteLength) return right;
  if (!right.byteLength) return left;
  const merged = RuntimeBuffer.alloc(left.byteLength + right.byteLength);
  merged.set(left);
  merged.set(right, left.byteLength);
  return merged;
}

function decodeBytes(bytes, encoding, decoder, options) {
  if (encoding === "hex") return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (encoding === "base64" || encoding === "base64url") return encodeBase64(bytes, encoding);
  if (encoding === "ascii") return [...bytes].map((byte) => String.fromCharCode(byte & 0x7f)).join("");
  if (encoding === "latin1") return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return decoder.decode(bytes, options);
}

function encodeBase64(bytes, encoding) {
  if (!bytes.byteLength) return "";
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  let value;
  if (typeof btoa === "function") value = btoa(binary);
  else if (globalThis.Buffer) value = globalThis.Buffer.from(bytes).toString("base64");
  else throw new Error("base64 encoding is unavailable");
  if (encoding === "base64url") return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return value;
}

function updateBase64State(state, data, pending) {
  state.pending = RuntimeBuffer.from(pending);
  setLastState(state, pending.byteLength ? 3 - pending.byteLength : 0, pending.byteLength ? 3 : 0);
  if (pending.byteLength) {
    copyLastChar(state, pending);
  } else if (data.byteLength >= 3) {
    copyLastChar(state, data.slice(data.byteLength - 3));
  }
}

function updateTextState(state, encoding, data, previousPendingLength) {
  if (encoding === "utf16le") {
    const pendingLength = data.byteLength % 2;
    if (pendingLength) {
      const pending = data.slice(data.byteLength - 1);
      state.pending = RuntimeBuffer.from(pending);
      setLastState(state, 1, 2);
      copyLastChar(state, pending);
      return;
    }
    state.pending = RuntimeBuffer.alloc(0);
    setLastState(state, 0, 0);
    if (data.byteLength >= 2) copyLastChar(state, data.slice(data.byteLength - 2));
    return;
  }

  if (encoding !== "utf8") {
    state.pending = RuntimeBuffer.alloc(0);
    setLastState(state, 0, 0);
    return;
  }

  const pending = trailingIncompleteUtf8(data);
  if (pending.length > 0) {
    state.pending = RuntimeBuffer.from(data.slice(pending.start));
    setLastState(state, pending.total - pending.length, pending.total);
    copyLastChar(state, state.pending);
    return;
  }

  state.pending = RuntimeBuffer.alloc(0);
  setLastState(state, 0, 0);
  const complete = trailingCompleteUtf8(data);
  if (previousPendingLength > 0 || complete.length > 1) copyLastChar(state, data.slice(complete.start));
}

function trailingIncompleteUtf8(bytes) {
  const length = bytes.byteLength;
  const start = Math.max(0, length - 4);
  for (let index = length - 1; index >= start; index -= 1) {
    const byte = bytes[index];
    if ((byte & 0xc0) === 0x80) continue;
    const total = utf8SequenceLength(byte);
    if (total <= 1) return { start: length, length: 0, total: 0 };
    const available = length - index;
    if (available < total) return { start: index, length: available, total };
    return { start: length, length: 0, total: 0 };
  }
  return { start: length, length: 0, total: 0 };
}

function trailingCompleteUtf8(bytes) {
  const length = bytes.byteLength;
  if (!length) return { start: 0, length: 0 };
  const start = Math.max(0, length - 4);
  for (let index = length - 1; index >= start; index -= 1) {
    if ((bytes[index] & 0xc0) === 0x80) continue;
    const total = utf8SequenceLength(bytes[index]);
    if (total > 1 && index + total === length) return { start: index, length: total };
    return { start: length - 1, length: 1 };
  }
  return { start: length - 1, length: 1 };
}

function utf8SequenceLength(byte) {
  if ((byte & 0x80) === 0) return 1;
  if ((byte & 0xe0) === 0xc0) return 2;
  if ((byte & 0xf0) === 0xe0) return 3;
  if ((byte & 0xf8) === 0xf0) return 4;
  return 1;
}

function copyLastChar(state, bytes) {
  const lastChar = state.nativeDecoder.subarray(0, 4);
  lastChar.fill(0);
  lastChar.set(bytes.slice(0, Math.min(bytes.byteLength, lastChar.byteLength)));
}

function setLastState(state, lastNeed, lastTotal) {
  state.nativeDecoder[4] = lastNeed;
  state.nativeDecoder[5] = lastTotal;
}

export default {
  StringDecoder
};
