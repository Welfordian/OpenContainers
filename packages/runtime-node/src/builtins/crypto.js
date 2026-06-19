import { RuntimeBuffer } from "./buffer.js";

const encoder = new TextEncoder();
const AES_BLOCK_SIZE = 16;
export const KEY_OBJECT_BRAND = Symbol.for("opencontainers.crypto.KeyObject");

export function createCryptoBuiltin({ process }) {
  const randomBytes = (size, callback) => {
    const bytes = new Uint8Array(size);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    const buffer = RuntimeBuffer.from(bytes);
    if (typeof callback === "function") {
      process.__opencontainersAddRef?.();
      queueMicrotask(() => {
        try {
          if (process.__opencontainersIsAlive?.() !== false) callback(null, buffer);
        } catch (error) {
          process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
          process.exitCode = 1;
        } finally {
          process.__opencontainersUnref?.();
        }
      });
      return undefined;
    }
    return buffer;
  };

  const randomInt = (min, max, callback) => {
    if (typeof max === "function") {
      callback = max;
      max = min;
      min = 0;
    }
    const lower = Number(min ?? 0);
    const upper = Number(max);
    const run = () => randomInteger(lower, upper);
    if (typeof callback === "function") {
      process.__opencontainersAddRef?.();
      queueMicrotask(() => {
        try {
          callback(null, run());
        } catch (error) {
          process.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
          process.exitCode = 1;
        } finally {
          process.__opencontainersUnref?.();
        }
      });
      return undefined;
    }
    return run();
  };

  return {
    randomUUID: () => globalThis.crypto?.randomUUID?.() ?? fallbackRandomUUID(),
    randomBytes,
    randomInt,
    getHashes: () => ["sha1", "sha256", "sha384", "sha512"],
    getCiphers: () => ["aes-128-cbc", "aes-192-cbc", "aes-256-cbc"],
    createHash: (algorithm) => createHash(algorithm),
    createHmac: (algorithm, key) => createHmac(algorithm, key),
    createCipheriv: (algorithm, key, iv) => createCipheriv(algorithm, key, iv),
    createDecipheriv: (algorithm, key, iv) => createDecipheriv(algorithm, key, iv),
    createSecretKey: (key) => new KeyObject("secret", toBytes(key)),
    timingSafeEqual,
    randomFillSync,
    randomFill,
    KeyObject,
    webcrypto: globalThis.crypto,
    subtle: globalThis.crypto?.subtle,
    constants: {
      OPENSSL_VERSION_NUMBER: 0,
      SSL_OP_NO_TLSv1: 0,
      SSL_OP_NO_TLSv1_1: 0,
      SSL_OP_NO_TLSv1_2: 0,
      SSL_OP_NO_TLSv1_3: 0
    }
  };
}

function createHash(algorithm) {
  const normalized = normalizeHashAlgorithm(algorithm);
  const chunks = [];
  const hash = {
    update(chunk, inputEncoding) {
      chunks.push(toBytes(chunk, inputEncoding));
      return this;
    },
    digest(outputEncoding) {
      const input = concatBytes(chunks);
      if (normalized === "sha1") return encodeOutput(sha1(input), outputEncoding);
      if (normalized === "sha256") return encodeOutput(sha256(input), outputEncoding);
      if (normalized === "sha384") return encodeOutput(sha512(input, "sha384"), outputEncoding);
      if (normalized === "sha512") return encodeOutput(sha512(input), outputEncoding);
      throw Object.assign(new Error(`Digest method not supported: ${algorithm}`), {
        code: "ERR_OSSL_EVP_UNSUPPORTED",
      });
    },
    copy() {
      const copy = createHash(normalized);
      for (const chunk of chunks) copy.update(chunk);
      return copy;
    }
  };
  return hash;
}

function createHmac(algorithm, key) {
  const normalized = normalizeHashAlgorithm(algorithm);
  const blockSize = normalized === "sha384" || normalized === "sha512" ? 128 : 64;
  let keyBytes = toBytes(key);
  if (keyBytes.length > blockSize) keyBytes = createHash(normalized).update(keyBytes).digest();

  const paddedKey = RuntimeBuffer.alloc(blockSize);
  paddedKey.set(keyBytes.subarray(0, blockSize));
  const innerPad = RuntimeBuffer.alloc(blockSize);
  const outerPad = RuntimeBuffer.alloc(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    innerPad[index] = paddedKey[index] ^ 0x36;
    outerPad[index] = paddedKey[index] ^ 0x5c;
  }

  const chunks = [];
  return {
    update(chunk, inputEncoding) {
      chunks.push(toBytes(chunk, inputEncoding));
      return this;
    },
    digest(outputEncoding) {
      const inner = createHash(normalized)
        .update(innerPad)
        .update(concatBytes(chunks))
        .digest();
      return createHash(normalized)
        .update(outerPad)
        .update(inner)
        .digest(outputEncoding);
    },
  };
}

function createCipheriv(algorithm, key, iv) {
  const context = createAesCbcContext(algorithm, key, iv);
  const chunks = [];
  let finalized = false;
  let autoPadding = true;

  return {
    update(data, inputEncoding, outputEncoding) {
      if (finalized) throw new Error("Cipher already finalized");
      chunks.push(toBytes(data, inputEncoding));
      return encodeOutput(RuntimeBuffer.alloc(0), outputEncoding);
    },
    final(outputEncoding) {
      if (finalized) throw new Error("Cipher already finalized");
      finalized = true;
      const input = autoPadding ? addPkcs7Padding(concatBytes(chunks)) : concatBytes(chunks);
      if (input.length % AES_BLOCK_SIZE !== 0) {
        throw Object.assign(new Error("wrong final block length"), { code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" });
      }
      return encodeOutput(aesCbcCrypt(input, context, true), outputEncoding);
    },
    setAutoPadding(value = true) {
      autoPadding = Boolean(value);
      return this;
    },
  };
}

function createDecipheriv(algorithm, key, iv) {
  const context = createAesCbcContext(algorithm, key, iv);
  const chunks = [];
  let finalized = false;
  let autoPadding = true;

  return {
    update(data, inputEncoding, outputEncoding) {
      if (finalized) throw new Error("Decipher already finalized");
      chunks.push(toBytes(data, inputEncoding));
      return encodeOutput(RuntimeBuffer.alloc(0), outputEncoding);
    },
    final(outputEncoding) {
      if (finalized) throw new Error("Decipher already finalized");
      finalized = true;
      const input = concatBytes(chunks);
      if (input.length % AES_BLOCK_SIZE !== 0) {
        throw Object.assign(new Error("wrong final block length"), { code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" });
      }
      const decrypted = aesCbcCrypt(input, context, false);
      return encodeOutput(autoPadding ? removePkcs7Padding(decrypted) : decrypted, outputEncoding);
    },
    setAutoPadding(value = true) {
      autoPadding = Boolean(value);
      return this;
    },
  };
}

function createAesCbcContext(algorithm, key, iv) {
  const match = String(algorithm || "").toLowerCase().match(/^aes-(128|192|256)-cbc$/);
  if (!match) {
    throw Object.assign(new Error(`Unknown cipher: ${algorithm}`), {
      code: "ERR_CRYPTO_UNKNOWN_CIPHER",
    });
  }

  const keyBytes = key instanceof KeyObject ? key.export() : toBytes(key);
  const ivBytes = toBytes(iv);
  const expectedKeyLength = Number(match[1]) / 8;
  if (keyBytes.length !== expectedKeyLength) {
    throw Object.assign(new Error("Invalid key length"), { code: "ERR_CRYPTO_INVALID_KEYLEN" });
  }
  if (ivBytes.length !== AES_BLOCK_SIZE) {
    throw Object.assign(new Error("Invalid initialization vector"), { code: "ERR_CRYPTO_INVALID_IV" });
  }

  return {
    cipher: new AesCipher(keyBytes),
    iv: RuntimeBuffer.from(ivBytes),
  };
}

class KeyObject {
  constructor(type, bytes) {
    this.type = type;
    this.symmetricKeySize = bytes.byteLength;
    this.#bytes = RuntimeBuffer.from(bytes);
    Object.defineProperty(this, KEY_OBJECT_BRAND, {
      value: true,
      enumerable: false
    });
  }

  #bytes;

  export(options = {}) {
    if (this.type !== "secret") {
      throw Object.assign(new Error("Only secret keys are supported"), { code: "ERR_CRYPTO_UNSUPPORTED_OPERATION" });
    }
    if (options?.format && options.format !== "buffer") {
      throw Object.assign(new Error(`Unsupported key format: ${options.format}`), { code: "ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE" });
    }
    return RuntimeBuffer.from(this.#bytes);
  }
}

function aesCbcCrypt(input, context, encrypt) {
  const output = RuntimeBuffer.alloc(input.length);
  let previous = RuntimeBuffer.from(context.iv);

  for (let offset = 0; offset < input.length; offset += AES_BLOCK_SIZE) {
    const block = input.subarray(offset, offset + AES_BLOCK_SIZE);
    if (encrypt) {
      const xored = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
      for (let index = 0; index < AES_BLOCK_SIZE; index += 1) xored[index] = block[index] ^ previous[index];
      const encrypted = context.cipher.encryptBlock(xored);
      output.set(encrypted, offset);
      previous = encrypted;
    } else {
      const decrypted = context.cipher.decryptBlock(block);
      for (let index = 0; index < AES_BLOCK_SIZE; index += 1) output[offset + index] = decrypted[index] ^ previous[index];
      previous = RuntimeBuffer.from(block);
    }
  }

  return output;
}

function addPkcs7Padding(input) {
  const padLength = AES_BLOCK_SIZE - (input.length % AES_BLOCK_SIZE || 0);
  const output = RuntimeBuffer.alloc(input.length + padLength);
  output.set(input);
  output.fill(padLength, input.length);
  return output;
}

function removePkcs7Padding(input) {
  if (!input.length) throw Object.assign(new Error("bad decrypt"), { code: "ERR_OSSL_BAD_DECRYPT" });
  const padLength = input[input.length - 1];
  if (padLength < 1 || padLength > AES_BLOCK_SIZE || padLength > input.length) {
    throw Object.assign(new Error("bad decrypt"), { code: "ERR_OSSL_BAD_DECRYPT" });
  }
  for (let index = input.length - padLength; index < input.length; index += 1) {
    if (input[index] !== padLength) throw Object.assign(new Error("bad decrypt"), { code: "ERR_OSSL_BAD_DECRYPT" });
  }
  return input.subarray(0, input.length - padLength);
}

function normalizeHashAlgorithm(algorithm) {
  return String(algorithm || "").toLowerCase().replace(/-/g, "");
}

function toBytes(value, encoding) {
  if (value === undefined || value === null) return RuntimeBuffer.alloc(0);
  if (typeof value === "string") return RuntimeBuffer.from(value, encoding || "utf8");
  return RuntimeBuffer.from(value);
}

function concatBytes(chunks) {
  return RuntimeBuffer.concat(chunks.map(chunk => RuntimeBuffer.from(chunk)));
}

function encodeOutput(bytes, encoding) {
  const buffer = RuntimeBuffer.from(bytes);
  return encoding ? buffer.toString(encoding) : buffer;
}

function timingSafeEqual(left, right) {
  const leftBytes = toBytes(left);
  const rightBytes = toBytes(right);
  if (leftBytes.length !== rightBytes.length) {
    throw Object.assign(new Error("Input buffers must have the same byte length"), {
      code: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH"
    });
  }
  let result = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    result |= leftBytes[index] ^ rightBytes[index];
  }
  return result === 0;
}

function randomInteger(min, max) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
    throw Object.assign(new RangeError("The range must be a safe integer range with max > min"), { code: "ERR_OUT_OF_RANGE" });
  }
  const range = max - min;
  const bytes = randomBytesForNumber();
  const value = bytes.reduce((total, byte) => (total * 256) + byte, 0);
  return min + (value % range);
}

function randomBytesForNumber() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes];
}

function randomFillSync(buffer, offset = 0, size = buffer.byteLength - offset) {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const start = Number(offset ?? 0);
  const length = Number(size ?? view.byteLength - start);
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  view.set(bytes, start);
  return buffer;
}

function randomFill(buffer, offset, size, callback) {
  if (typeof offset === "function") {
    callback = offset;
    offset = 0;
    size = undefined;
  } else if (typeof size === "function") {
    callback = size;
    size = undefined;
  }
  if (typeof callback !== "function") {
    return Promise.resolve().then(() => randomFillSync(buffer, offset, size));
  }
  queueMicrotask(() => {
    try {
      callback(null, randomFillSync(buffer, offset, size));
    } catch (error) {
      callback(error);
    }
  });
  return undefined;
}

function fallbackRandomUUID() {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(input) {
  const messageLength = input.length;
  const bitLengthHigh = Math.floor(messageLength / 0x20000000);
  const bitLengthLow = (messageLength << 3) >>> 0;
  const paddedLength = (((messageLength + 9 + 63) >> 6) << 6);
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[messageLength] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh);
  view.setUint32(paddedLength - 4, bitLengthLow);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(w[index - 15], 7) ^ rotr(w[index - 15], 18) ^ (w[index - 15] >>> 3);
      const s1 = rotr(w[index - 2], 17) ^ rotr(w[index - 2], 19) ^ (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index] + w[index]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const output = RuntimeBuffer.alloc(32);
  const outputView = new DataView(output.buffer, output.byteOffset, output.byteLength);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => outputView.setUint32(index * 4, value));
  return output;
}

function sha1(input) {
  const messageLength = input.length;
  const bitLengthHigh = Math.floor(messageLength / 0x20000000);
  const bitLengthLow = (messageLength << 3) >>> 0;
  const paddedLength = (((messageLength + 9 + 63) >> 6) << 6);
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[messageLength] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh);
  view.setUint32(paddedLength - 4, bitLengthLow);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 80; index += 1) {
      w[index] = rotl(w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[index]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return words32ToBytes([h0, h1, h2, h3, h4]);
}

function sha512(input, variant = "sha512") {
  const is384 = variant === "sha384";
  const messageLength = BigInt(input.length);
  const bitLength = messageLength * 8n;
  const paddedLength = Number(((messageLength + 17n + 127n) / 128n) * 128n);
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setBigUint64(paddedLength - 16, 0n);
  view.setBigUint64(paddedLength - 8, bitLength);

  let digestWords = is384
    ? [
        0xcbbb9d5dc1059ed8n, 0x629a292a367cd507n,
        0x9159015a3070dd17n, 0x152fecd8f70e5939n,
        0x67332667ffc00b31n, 0x8eb44a8768581511n,
        0xdb0c2e0d64f98fa7n, 0x47b5481dbefa4fa4n,
      ]
    : [
        0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn,
        0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
        0x510e527fade682d1n, 0x9b05688c2b3e6c1fn,
        0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
      ];
  const w = new Array(80).fill(0n);

  for (let offset = 0; offset < data.length; offset += 128) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getBigUint64(offset + index * 8);
    }
    for (let index = 16; index < 80; index += 1) {
      const s0 = rotr64(w[index - 15], 1n) ^ rotr64(w[index - 15], 8n) ^ (w[index - 15] >> 7n);
      const s1 = rotr64(w[index - 2], 19n) ^ rotr64(w[index - 2], 61n) ^ (w[index - 2] >> 6n);
      w[index] = add64(w[index - 16], s0, w[index - 7], s1);
    }

    let [a, b, c, d, e, f, g, h] = digestWords;
    for (let index = 0; index < 80; index += 1) {
      const s1 = rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = add64(h, s1, ch, SHA512_K[index], w[index]);
      const s0 = rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add64(s0, maj);
      h = g;
      g = f;
      f = e;
      e = add64(d, temp1);
      d = c;
      c = b;
      b = a;
      a = add64(temp1, temp2);
    }

    digestWords = [
      add64(digestWords[0], a), add64(digestWords[1], b),
      add64(digestWords[2], c), add64(digestWords[3], d),
      add64(digestWords[4], e), add64(digestWords[5], f),
      add64(digestWords[6], g), add64(digestWords[7], h),
    ];
  }

  return words64ToBytes(is384 ? digestWords.slice(0, 6) : digestWords);
}

function words32ToBytes(words) {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setUint32(index * 4, word));
  return bytes;
}

function words64ToBytes(words) {
  const bytes = new Uint8Array(words.length * 8);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setBigUint64(index * 8, word));
  return bytes;
}

function add64(...values) {
  let total = 0n;
  for (const value of values) total = (total + value) & UINT64_MASK;
  return total;
}

function rotr64(value, shift) {
  return ((value >> shift) | (value << (64n - shift))) & UINT64_MASK;
}

function rotr(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}

function rotl(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

const UINT64_MASK = 0xffffffffffffffffn;

const SHA512_K = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn,
  0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n,
  0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben,
  0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n,
  0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n,
  0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n,
  0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n,
  0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n,
  0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n,
  0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n,
  0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n,
  0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n,
  0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n,
  0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn,
  0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n,
  0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n,
  0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n,
  0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n,
  0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n,
  0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an,
  0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];

class AesCipher {
  constructor(key) {
    this.rounds = key.length / 4 + 6;
    this.roundKeys = expandAesKey(key, this.rounds);
  }

  encryptBlock(block) {
    const state = RuntimeBuffer.from(block);
    addRoundKey(state, this.roundKeys, 0);
    for (let round = 1; round < this.rounds; round += 1) {
      subBytes(state);
      shiftRows(state);
      mixColumns(state);
      addRoundKey(state, this.roundKeys, round);
    }
    subBytes(state);
    shiftRows(state);
    addRoundKey(state, this.roundKeys, this.rounds);
    return state;
  }

  decryptBlock(block) {
    const state = RuntimeBuffer.from(block);
    addRoundKey(state, this.roundKeys, this.rounds);
    for (let round = this.rounds - 1; round > 0; round -= 1) {
      invShiftRows(state);
      invSubBytes(state);
      addRoundKey(state, this.roundKeys, round);
      invMixColumns(state);
    }
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, this.roundKeys, 0);
    return state;
  }
}

function expandAesKey(key, rounds) {
  const words = [];
  const keyWords = key.length / 4;
  const totalWords = 4 * (rounds + 1);
  for (let index = 0; index < keyWords; index += 1) {
    words[index] = [
      key[index * 4],
      key[index * 4 + 1],
      key[index * 4 + 2],
      key[index * 4 + 3],
    ];
  }
  for (let index = keyWords; index < totalWords; index += 1) {
    let temp = [...words[index - 1]];
    if (index % keyWords === 0) {
      temp = subWord(rotWord(temp));
      temp[0] ^= AES_RCON[index / keyWords];
    } else if (keyWords > 6 && index % keyWords === 4) {
      temp = subWord(temp);
    }
    words[index] = words[index - keyWords].map((byte, byteIndex) => byte ^ temp[byteIndex]);
  }

  const roundKeys = RuntimeBuffer.alloc(totalWords * 4);
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    roundKeys.set(words[wordIndex], wordIndex * 4);
  }
  return roundKeys;
}

function addRoundKey(state, roundKeys, round) {
  const offset = round * AES_BLOCK_SIZE;
  for (let index = 0; index < AES_BLOCK_SIZE; index += 1) state[index] ^= roundKeys[offset + index];
}

function subBytes(state) {
  for (let index = 0; index < state.length; index += 1) state[index] = AES_SBOX[state[index]];
}

function invSubBytes(state) {
  for (let index = 0; index < state.length; index += 1) state[index] = AES_INV_SBOX[state[index]];
}

function shiftRows(state) {
  const copy = RuntimeBuffer.from(state);
  for (let row = 1; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      state[column * 4 + row] = copy[((column + row) % 4) * 4 + row];
    }
  }
}

function invShiftRows(state) {
  const copy = RuntimeBuffer.from(state);
  for (let row = 1; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      state[column * 4 + row] = copy[((column - row + 4) % 4) * 4 + row];
    }
  }
}

function mixColumns(state) {
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const a0 = state[offset];
    const a1 = state[offset + 1];
    const a2 = state[offset + 2];
    const a3 = state[offset + 3];
    state[offset] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
    state[offset + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
    state[offset + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
    state[offset + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
  }
}

function invMixColumns(state) {
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const a0 = state[offset];
    const a1 = state[offset + 1];
    const a2 = state[offset + 2];
    const a3 = state[offset + 3];
    state[offset] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    state[offset + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    state[offset + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    state[offset + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}

function rotWord(word) {
  return [word[1], word[2], word[3], word[0]];
}

function subWord(word) {
  return word.map(byte => AES_SBOX[byte]);
}

function gmul(left, right) {
  let product = 0;
  let a = left;
  let b = right;
  while (b) {
    if (b & 1) product ^= a;
    a = xtime(a);
    b >>= 1;
  }
  return product;
}

function xtime(value) {
  return ((value << 1) ^ ((value & 0x80) ? 0x1b : 0)) & 0xff;
}

const AES_RCON = [
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40,
  0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d,
];

const AES_SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

const AES_INV_SBOX = (() => {
  const inverse = new Array(256);
  for (let index = 0; index < AES_SBOX.length; index += 1) inverse[AES_SBOX[index]] = index;
  return inverse;
})();
