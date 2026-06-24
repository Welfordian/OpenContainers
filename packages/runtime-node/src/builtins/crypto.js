import { RuntimeBuffer } from "./buffer.js";
import { Writable } from "./stream.js";

const encoder = new TextEncoder();
const AES_BLOCK_SIZE = 16;
const MAX_RANDOM_BYTES = 2 ** 31 - 1;
const MAX_RANDOM_INT_RANGE = 2 ** 48 - 1;
export const KEY_OBJECT_BRAND = Symbol.for("opencontainers.crypto.KeyObject");
export const DEFAULT_CORE_CIPHER_LIST = "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA";
export const OPENSSL_CONSTANTS = Object.freeze({
  OPENSSL_VERSION_NUMBER: 810549344,
  SSL_OP_ALL: 2147485776,
  SSL_OP_ALLOW_NO_DHE_KEX: 1024,
  SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: 262144,
  SSL_OP_CIPHER_SERVER_PREFERENCE: 4194304,
  SSL_OP_CISCO_ANYCONNECT: 32768,
  SSL_OP_COOKIE_EXCHANGE: 8192,
  SSL_OP_CRYPTOPRO_TLSEXT_BUG: 2147483648,
  SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS: 2048,
  SSL_OP_LEGACY_SERVER_CONNECT: 4,
  SSL_OP_NO_COMPRESSION: 131072,
  SSL_OP_NO_ENCRYPT_THEN_MAC: 524288,
  SSL_OP_NO_QUERY_MTU: 4096,
  SSL_OP_NO_RENEGOTIATION: 1073741824,
  SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION: 65536,
  SSL_OP_NO_SSLv2: 0,
  SSL_OP_NO_SSLv3: 33554432,
  SSL_OP_NO_TICKET: 16384,
  SSL_OP_NO_TLSv1: 67108864,
  SSL_OP_NO_TLSv1_1: 268435456,
  SSL_OP_NO_TLSv1_2: 134217728,
  SSL_OP_NO_TLSv1_3: 536870912,
  SSL_OP_PRIORITIZE_CHACHA: 2097152,
  SSL_OP_TLS_ROLLBACK_BUG: 8388608,
  defaultCoreCipherList: DEFAULT_CORE_CIPHER_LIST,
});

const CRYPTO_HASHES = Object.freeze([
  "RSA-MD5",
  "RSA-RIPEMD160",
  "RSA-SHA1",
  "RSA-SHA1-2",
  "RSA-SHA224",
  "RSA-SHA256",
  "RSA-SHA3-224",
  "RSA-SHA3-256",
  "RSA-SHA3-384",
  "RSA-SHA3-512",
  "RSA-SHA384",
  "RSA-SHA512",
  "RSA-SHA512/224",
  "RSA-SHA512/256",
  "RSA-SM3",
  "blake2b512",
  "blake2s256",
  "id-rsassa-pkcs1-v1_5-with-sha3-224",
  "id-rsassa-pkcs1-v1_5-with-sha3-256",
  "id-rsassa-pkcs1-v1_5-with-sha3-384",
  "id-rsassa-pkcs1-v1_5-with-sha3-512",
  "md5",
  "md5-sha1",
  "md5WithRSAEncryption",
  "ripemd",
  "ripemd160",
  "ripemd160WithRSA",
  "rmd160",
  "sha1",
  "sha1WithRSAEncryption",
  "sha224",
  "sha224WithRSAEncryption",
  "sha256",
  "sha256WithRSAEncryption",
  "sha3-224",
  "sha3-256",
  "sha3-384",
  "sha3-512",
  "sha384",
  "sha384WithRSAEncryption",
  "sha512",
  "sha512-224",
  "sha512-224WithRSAEncryption",
  "sha512-256",
  "sha512-256WithRSAEncryption",
  "sha512WithRSAEncryption",
  "shake128",
  "shake256",
  "sm3",
  "sm3WithRSAEncryption",
  "ssl3-md5",
  "ssl3-sha1"
]);

const CRYPTO_CURVES = Object.freeze([
  "Oakley-EC2N-3",
  "Oakley-EC2N-4",
  "SM2",
  "brainpoolP160r1",
  "brainpoolP160t1",
  "brainpoolP192r1",
  "brainpoolP192t1",
  "brainpoolP224r1",
  "brainpoolP224t1",
  "brainpoolP256r1",
  "brainpoolP256t1",
  "brainpoolP320r1",
  "brainpoolP320t1",
  "brainpoolP384r1",
  "brainpoolP384t1",
  "brainpoolP512r1",
  "brainpoolP512t1",
  "c2pnb163v1",
  "c2pnb163v2",
  "c2pnb163v3",
  "c2pnb176v1",
  "c2pnb208w1",
  "c2pnb272w1",
  "c2pnb304w1",
  "c2pnb368w1",
  "c2tnb191v1",
  "c2tnb191v2",
  "c2tnb191v3",
  "c2tnb239v1",
  "c2tnb239v2",
  "c2tnb239v3",
  "c2tnb359v1",
  "c2tnb431r1",
  "prime192v1",
  "prime192v2",
  "prime192v3",
  "prime239v1",
  "prime239v2",
  "prime239v3",
  "prime256v1",
  "secp112r1",
  "secp112r2",
  "secp128r1",
  "secp128r2",
  "secp160k1",
  "secp160r1",
  "secp160r2",
  "secp192k1",
  "secp224k1",
  "secp224r1",
  "secp256k1",
  "secp384r1",
  "secp521r1",
  "sect113r1",
  "sect113r2",
  "sect131r1",
  "sect131r2",
  "sect163k1",
  "sect163r1",
  "sect163r2",
  "sect193r1",
  "sect193r2",
  "sect233k1",
  "sect233r1",
  "sect239k1",
  "sect283k1",
  "sect283r1",
  "sect409k1",
  "sect409r1",
  "sect571k1",
  "sect571r1",
  "wap-wsg-idm-ecid-wtls1",
  "wap-wsg-idm-ecid-wtls10",
  "wap-wsg-idm-ecid-wtls11",
  "wap-wsg-idm-ecid-wtls12",
  "wap-wsg-idm-ecid-wtls3",
  "wap-wsg-idm-ecid-wtls4",
  "wap-wsg-idm-ecid-wtls5",
  "wap-wsg-idm-ecid-wtls6",
  "wap-wsg-idm-ecid-wtls7",
  "wap-wsg-idm-ecid-wtls8",
  "wap-wsg-idm-ecid-wtls9"
]);

const CRYPTO_CONSTANTS = createReadonlyConstants({
  ...OPENSSL_CONSTANTS,
  RSA_PKCS1_PADDING: 1,
  RSA_NO_PADDING: 3,
  RSA_PKCS1_OAEP_PADDING: 4,
  RSA_X931_PADDING: 5,
  RSA_PKCS1_PSS_PADDING: 6,
  RSA_PSS_SALTLEN_DIGEST: -1,
  RSA_PSS_SALTLEN_MAX_SIGN: -2,
  RSA_PSS_SALTLEN_AUTO: -2,
  TLS1_VERSION: 769,
  TLS1_1_VERSION: 770,
  TLS1_2_VERSION: 771,
  TLS1_3_VERSION: 772,
  DH_CHECK_P_NOT_SAFE_PRIME: 2,
  DH_CHECK_P_NOT_PRIME: 1,
  DH_UNABLE_TO_CHECK_GENERATOR: 4,
  DH_NOT_SUITABLE_GENERATOR: 8,
  POINT_CONVERSION_COMPRESSED: 2,
  POINT_CONVERSION_UNCOMPRESSED: 4,
  POINT_CONVERSION_HYBRID: 6,
  ENGINE_METHOD_RSA: 1,
  ENGINE_METHOD_DSA: 2,
  ENGINE_METHOD_DH: 4,
  ENGINE_METHOD_RAND: 8,
  ENGINE_METHOD_CIPHERS: 64,
  ENGINE_METHOD_DIGESTS: 128,
  ENGINE_METHOD_PKEY_METHS: 512,
  ENGINE_METHOD_PKEY_ASN1_METHS: 1024,
  ENGINE_METHOD_EC: 2048,
  ENGINE_METHOD_ALL: 65535,
  ENGINE_METHOD_NONE: 0,
});
Object.defineProperty(CRYPTO_CONSTANTS, "defaultCipherList", {
  enumerable: true,
  configurable: true,
  get() {
    return DEFAULT_CORE_CIPHER_LIST;
  },
  set(value) {
    Object.defineProperty(CRYPTO_CONSTANTS, "defaultCipherList", {
      enumerable: true,
      configurable: true,
      writable: true,
      value
    });
  },
});

export function createCryptoBuiltin({ process }) {
  function randomBytes(size, callback) {
    const normalizedSize = validateRandomBytesSize(size);
    if (callback !== undefined && typeof callback !== "function") {
      throw Object.assign(new TypeError("Callback must be a function"), {
        code: "ERR_INVALID_ARG_TYPE",
      });
    }
    const bytes = new Uint8Array(normalizedSize);
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
  }

  function randomInt(min, max, callback) {
    if (typeof max === "function") {
      callback = max;
      max = min;
      min = 0;
    } else if (max === undefined) {
      max = min;
      min = 0;
    }
    if (callback !== undefined && typeof callback !== "function") {
      throw createCryptoTypeError("The \"callback\" argument must be of type function", callback);
    }
    const lower = validateRandomIntSafeInteger(min, "min");
    const upper = validateRandomIntSafeInteger(max, "max");
    validateRandomIntRange(lower, upper);
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
  }

  function randomFill(buffer, offset, size, callback) {
    return randomFillWithProcess(buffer, offset, size, callback, process);
  }

  function randomUUID(options) {
    return globalThis.crypto?.randomUUID?.(options) ?? fallbackRandomUUID();
  }

  function randomUUIDv7(options) {
    return fallbackRandomUUIDv7(options);
  }

  function argon2(algorithm, parameters, callback) {
    return callbackUnsupportedCrypto("crypto.argon2", [algorithm, parameters, callback], process);
  }

  function argon2Sync(algorithm, parameters) {
    return throwUnsupportedCrypto("crypto.argon2Sync");
  }

  function encapsulate(key, callback) {
    return callbackUnsupportedCrypto("crypto.encapsulate", [key, callback], process);
  }

  function decapsulate(key, ciphertext, callback) {
    return callbackUnsupportedCrypto("crypto.decapsulate", [key, ciphertext, callback], process);
  }

  function hash(algorithm, data, outputEncoding) {
    return createHash(algorithm).update(data).digest(outputEncoding === undefined ? "hex" : outputEncoding);
  }

  function setEngine(id, flags) {
    validateSetEngineArguments(id, flags);
    throw Object.assign(new Error(`Engine "${id}" was not found`), {
      code: "ERR_CRYPTO_ENGINE_UNKNOWN",
    });
  }

  function getFips() {
    return 0;
  }

  function setFips(value) {
    if (value && value !== 0 && value !== false) {
      throw Object.assign(new Error("FIPS mode is not supported in OpenContainers"), {
        code: "ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
      });
    }
    return undefined;
  }

  function secureHeapUsed() {
    return { total: 0, used: 0, utilization: Number.NaN, min: 2 };
  }

  function checkPrime(candidate, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") {
      throw createCryptoTypeError("The \"callback\" argument must be of type function", callback);
    }
    const result = checkPrimeSync(candidate, options);
    scheduleCryptoCallback(process, callback, [undefined, result]);
    return undefined;
  }

  function checkPrimeSync(candidate, options = {}) {
    const { checks } = validateCheckPrimeOptions(options);
    return isProbablePrime(normalizePrimeInteger(candidate, "candidate"), checks);
  }

  function generatePrime(size, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") {
      throw createCryptoTypeError("The \"callback\" argument must be of type function", callback);
    }
    const prime = generatePrimeSync(size, options);
    scheduleCryptoCallback(process, callback, [undefined, prime]);
    return undefined;
  }

  function generatePrimeSync(size, options = {}) {
    const bits = validatePrimeSize(size);
    const primeOptions = validateGeneratePrimeOptions(options);
    const prime = generatePrimeInteger(bits, primeOptions);
    return primeOptions.bigint ? prime : primeIntegerToArrayBuffer(prime, bits);
  }

  const DeprecatedHash = createDeprecatedCryptoConstructor(Hash);
  const DeprecatedHmac = createDeprecatedCryptoConstructor(Hmac);

  const builtin = {
    argon2,
    argon2Sync,
    checkPrime,
    checkPrimeSync,
    createCipheriv: (algorithm, key, iv, options) => createCipheriv(algorithm, key, iv, options),
    createDecipheriv: (algorithm, key, iv, options) => createDecipheriv(algorithm, key, iv, options),
    createDiffieHellman: (...args) => new DiffieHellman(...args),
    createDiffieHellmanGroup: (name) => new DiffieHellmanGroup(name),
    createECDH: (curveName) => new ECDH(curveName),
    createHash: (algorithm) => createHash(algorithm),
    createHmac: (algorithm, key) => createHmac(algorithm, key),
    createPrivateKey: (key) => createAsymmetricKeyObject("private", key),
    createPublicKey: (key) => createAsymmetricKeyObject("public", key),
    createSecretKey: (key) => new KeyObject("secret", toBytes(key)),
    createSign: (algorithm) => new Sign(algorithm),
    createVerify: (algorithm) => new Verify(algorithm),
    diffieHellman: () => throwUnsupportedCrypto("crypto.diffieHellman"),
    generatePrime,
    generatePrimeSync,
    getCiphers: () => [
      "aes-128-cbc",
      "aes-192-cbc",
      "aes-256-cbc",
      "aes-128-ctr",
      "aes-192-ctr",
      "aes-256-ctr",
      "aes-128-gcm",
      "aes-192-gcm",
      "aes-256-gcm",
    ],
    getCipherInfo,
    getCurves: () => CRYPTO_CURVES.slice(),
    getDiffieHellman: (name) => new DiffieHellmanGroup(name),
    getHashes: () => CRYPTO_HASHES.slice(),
    hkdf: (digest, ikm, salt, info, keylen, callback) =>
      hkdf(digest, ikm, salt, info, keylen, callback, process),
    hkdfSync,
    pbkdf2: (password, salt, iterations, keylen, digest, callback) =>
      pbkdf2(password, salt, iterations, keylen, digest, callback, process),
    pbkdf2Sync,
    generateKeyPair: (...args) => callbackUnsupportedCrypto("crypto.generateKeyPair", args, process),
    generateKeyPairSync: () => throwUnsupportedCrypto("crypto.generateKeyPairSync"),
    generateKey: (...args) => callbackUnsupportedCrypto("crypto.generateKey", args, process),
    generateKeySync: () => throwUnsupportedCrypto("crypto.generateKeySync"),
    privateDecrypt: () => throwUnsupportedCrypto("crypto.privateDecrypt"),
    privateEncrypt: () => throwUnsupportedCrypto("crypto.privateEncrypt"),
    publicDecrypt: () => throwUnsupportedCrypto("crypto.publicDecrypt"),
    publicEncrypt: () => throwUnsupportedCrypto("crypto.publicEncrypt"),
    randomBytes,
    randomFill,
    randomFillSync,
    randomInt,
    randomUUID,
    randomUUIDv7,
    scrypt: (password, salt, keylen, options, callback) =>
      scrypt(password, salt, keylen, options, callback, process),
    scryptSync,
    sign: () => throwUnsupportedCrypto("crypto.sign"),
    setEngine,
    timingSafeEqual,
    getFips,
    setFips,
    verify: () => throwUnsupportedCrypto("crypto.verify"),
    hash,
    encapsulate,
    decapsulate,
    Certificate,
    Cipheriv,
    Decipheriv,
    DiffieHellman,
    DiffieHellmanGroup,
    ECDH,
    Hash: DeprecatedHash,
    Hmac: DeprecatedHmac,
    KeyObject,
    Sign,
    Verify,
    X509Certificate,
    secureHeapUsed,
  };

  Object.defineProperty(builtin, "fips", {
    enumerable: false,
    configurable: false,
    get: function deprecated() {
      return builtin.getFips();
    },
    set: function deprecated(value) {
      builtin.setFips(value);
    },
  });
  Object.defineProperty(builtin, "constants", {
    enumerable: true,
    configurable: false,
    writable: false,
    value: CRYPTO_CONSTANTS,
  });
  Object.defineProperty(builtin, "webcrypto", {
    enumerable: true,
    configurable: false,
    get: () => globalThis.crypto,
  });
  Object.defineProperty(builtin, "subtle", {
    enumerable: true,
    configurable: false,
    get: () => globalThis.crypto?.subtle,
  });
  Object.defineProperty(builtin, "getRandomValues", {
    enumerable: true,
    configurable: false,
    get: () => getRandomValues,
  });
  for (const alias of ["prng", "pseudoRandomBytes", "rng"]) {
    let value = randomBytes;
    Object.defineProperty(builtin, alias, {
      enumerable: false,
      configurable: true,
      get: () => value,
      set: (next) => {
        value = next;
      },
    });
  }

  alignCryptoExportMetadata(builtin);

  return builtin;
}

function validateRandomBytesSize(size) {
  if (typeof size !== "number") {
    throw Object.assign(new TypeError("The \"size\" argument must be of type number"), {
      code: "ERR_INVALID_ARG_TYPE",
    });
  }
  if (!Number.isFinite(size) || size < 0 || size > MAX_RANDOM_BYTES) {
    throw Object.assign(new RangeError("The value of \"size\" is out of range"), {
      code: "ERR_OUT_OF_RANGE",
    });
  }
  return Math.trunc(size);
}

function validateSetEngineArguments(id, flags) {
  if (typeof id !== "string") {
    throw createCryptoTypeError("The \"id\" argument must be of type string", id);
  }
  if (flags !== undefined && typeof flags !== "number") {
    throw createCryptoTypeError("The \"flags\" argument must be of type number", flags);
  }
}

function validateCheckPrimeOptions(options) {
  const normalized = validatePrimeOptionsObject(options);
  if (normalized.checks === undefined) return { checks: 0 };
  if (typeof normalized.checks !== "number") {
    throw createCryptoTypeError("The \"options.checks\" property must be of type number", normalized.checks);
  }
  if (!Number.isInteger(normalized.checks)) {
    throw createCryptoRangeError(`The value of "options.checks" is out of range. It must be an integer. Received ${formatCryptoNumber(normalized.checks)}`);
  }
  if (normalized.checks < 0 || normalized.checks > MAX_RANDOM_BYTES) {
    throw createCryptoRangeError(`The value of "options.checks" is out of range. It must be >= 0 && <= ${MAX_RANDOM_BYTES}. Received ${formatCryptoNumber(normalized.checks)}`);
  }
  return { checks: normalized.checks };
}

function validateGeneratePrimeOptions(options) {
  const normalized = validatePrimeOptionsObject(options);
  const primeOptions = {
    bigint: normalized.bigint === true,
    safe: normalized.safe === true,
    add: undefined,
    rem: undefined,
  };
  if (normalized.bigint !== undefined && typeof normalized.bigint !== "boolean") {
    throw createCryptoTypeError("The \"options.bigint\" property must be of type boolean", normalized.bigint);
  }
  if (normalized.safe !== undefined && typeof normalized.safe !== "boolean") {
    throw createCryptoTypeError("The \"options.safe\" property must be of type boolean", normalized.safe);
  }
  if (normalized.add !== undefined) {
    primeOptions.add = normalizePrimeInteger(normalized.add, "options.add");
    if (primeOptions.add === 0n) {
      throw Object.assign(new Error("error:01800067:bignum routines::div by zero"), {
        code: "ERR_OSSL_BN_DIV_BY_ZERO",
      });
    }
  }
  if (normalized.rem !== undefined) {
    primeOptions.rem = normalizePrimeInteger(normalized.rem, "options.rem");
  }
  if (primeOptions.add !== undefined) {
    if (primeOptions.rem === undefined) primeOptions.rem = primeOptions.safe ? 3n : 1n;
    if (primeOptions.rem >= primeOptions.add) {
      throw Object.assign(new RangeError("invalid options.rem"), {
        code: "ERR_OUT_OF_RANGE",
      });
    }
  }
  return primeOptions;
}

function validatePrimeOptionsObject(options) {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw createCryptoTypeError("The \"options\" argument must be of type object", options);
  }
  return options;
}

function validatePrimeSize(size) {
  if (typeof size !== "number") {
    throw createCryptoTypeError("The \"size\" argument must be of type number", size);
  }
  if (!Number.isInteger(size)) {
    throw createCryptoRangeError(`The value of "size" is out of range. It must be an integer. Received ${formatCryptoNumber(size)}`);
  }
  if (size < 1 || size > MAX_RANDOM_BYTES) {
    throw createCryptoRangeError(`The value of "size" is out of range. It must be >= 1 && <= ${MAX_RANDOM_BYTES}. Received ${formatCryptoNumber(size)}`);
  }
  if (size === 1) {
    throw Object.assign(new Error("error:01800076:bignum routines::bits too small"), {
      code: "ERR_OSSL_BN_BITS_TOO_SMALL",
    });
  }
  return size;
}

function normalizePrimeInteger(value, name) {
  if (typeof value === "bigint") {
    if (value < 0n) throw createPrimeRangeError(name, `${value}n`);
    return value;
  }
  const bytes = normalizePrimeBytes(value, name);
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

function normalizePrimeBytes(value, name) {
  if (value instanceof ArrayBuffer || isSharedArrayBuffer(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  const subject = name.startsWith("options.") ? `The "${name}" property` : `The "${name}" argument`;
  throw createCryptoTypeError(`${subject} must be of type bigint or an instance of ArrayBuffer, TypedArray, Buffer, or DataView`, value);
}

function createPrimeRangeError(name, received) {
  throw createCryptoRangeError(`The value of "${name}" is out of range. It must be >= 0. Received ${received}`);
}

function isSharedArrayBuffer(value) {
  return typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer;
}

const SMALL_PRIME_NUMBERS = Object.freeze([
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37,
  41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97
]);

function isProbablePrime(candidate, checks = 0) {
  if (candidate < 2n) return false;
  for (const prime of SMALL_PRIME_NUMBERS) {
    const value = BigInt(prime);
    if (candidate === value) return true;
    if (candidate % value === 0n) return false;
  }

  let d = candidate - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1;
  }

  const rounds = checks > 0 ? checks : 16;
  for (let index = 0; index < rounds; index += 1) {
    let base = BigInt(SMALL_PRIME_NUMBERS[index % SMALL_PRIME_NUMBERS.length]);
    if (base >= candidate - 1n) base = 2n + (base % (candidate - 3n));
    let x = modPow(base, d, candidate);
    if (x === 1n || x === candidate - 1n) continue;
    let probablyPrime = false;
    for (let round = 1; round < s; round += 1) {
      x = (x * x) % candidate;
      if (x === candidate - 1n) {
        probablyPrime = true;
        break;
      }
    }
    if (!probablyPrime) return false;
  }
  return true;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  let value = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if ((power & 1n) === 1n) result = (result * value) % modulus;
    value = (value * value) % modulus;
    power >>= 1n;
  }
  return result;
}

function generatePrimeInteger(bits, options) {
  if (bits > 4096) {
    throw createUnsupportedCryptoError("crypto.generatePrimeSync for primes larger than 4096 bits");
  }
  if (bits <= 20) return scanPrimeInteger(bits, options);
  for (let attempt = 0; attempt < 65536; attempt += 1) {
    const candidate = randomPrimeCandidate(bits);
    if (primeMatchesOptions(candidate, options)) return candidate;
  }
  throw createUnsupportedCryptoError("crypto.generatePrimeSync");
}

function scanPrimeInteger(bits, options) {
  const lower = 1n << BigInt(bits - 1);
  const upper = (1n << BigInt(bits)) - 1n;
  const range = upper - lower + 1n;
  let candidate = lower + (randomPrimeCandidate(bits) % range);
  if ((candidate & 1n) === 0n) candidate += 1n;
  for (let scanned = 0n; scanned < range; scanned += 2n) {
    if (candidate > upper) candidate = lower | 1n;
    if (primeMatchesOptions(candidate, options)) return candidate;
    candidate += 2n;
  }
  throw createUnsupportedCryptoError("crypto.generatePrimeSync");
}

function randomPrimeCandidate(bits) {
  const byteLength = Math.ceil(bits / 8);
  const bytes = new Uint8Array(byteLength);
  randomFillSync(bytes);
  const excessBits = (byteLength * 8) - bits;
  bytes[0] &= 0xff >>> excessBits;
  bytes[0] |= 1 << (7 - excessBits);
  bytes[bytes.length - 1] |= 1;
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

function primeMatchesOptions(candidate, options) {
  if (options.add !== undefined && candidate % options.add !== options.rem) return false;
  if (!isProbablePrime(candidate)) return false;
  return !options.safe || isProbablePrime((candidate - 1n) / 2n);
}

function primeIntegerToArrayBuffer(value, bits) {
  const byteLength = Math.ceil(bits / 8);
  const bytes = new Uint8Array(byteLength);
  let remaining = value;
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes.buffer;
}

function scheduleCryptoCallback(process, callback, args) {
  process?.__opencontainersAddRef?.();
  queueMicrotask(() => {
    try {
      if (process?.__opencontainersIsAlive?.() !== false) callback(...args);
    } catch (error) {
      process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
      if (process) process.exitCode = 1;
    } finally {
      process?.__opencontainersUnref?.();
    }
  });
}

function alignCryptoExportMetadata(crypto) {
  const metadata = {
    checkPrime: { length: 1 },
    checkPrimeSync: { length: 1 },
    createCipheriv: { length: 4, ownPrototype: true },
    createDecipheriv: { length: 4, ownPrototype: true },
    createDiffieHellman: { length: 4, ownPrototype: true },
    createDiffieHellmanGroup: { length: 1, ownPrototype: true },
    createECDH: { length: 1, ownPrototype: true },
    createHash: { length: 2, ownPrototype: true },
    createHmac: { length: 3, ownPrototype: true },
    createPrivateKey: { length: 1, ownPrototype: true },
    createPublicKey: { length: 1, ownPrototype: true },
    createSecretKey: { length: 2, ownPrototype: true },
    createSign: { length: 2, ownPrototype: true },
    createVerify: { length: 2, ownPrototype: true },
    diffieHellman: { length: 2, ownPrototype: true },
    generatePrime: { length: 3 },
    generatePrimeSync: { length: 1 },
    generateKeyPair: { length: 3, ownPrototype: true },
    generateKeyPairSync: { length: 2, ownPrototype: true },
    generateKey: { length: 3, ownPrototype: true },
    generateKeySync: { length: 2, ownPrototype: true },
    privateDecrypt: { name: "", length: 2 },
    privateEncrypt: { name: "", length: 2 },
    publicDecrypt: { name: "", length: 2 },
    publicEncrypt: { name: "", length: 2 },
    randomUUID: { length: 1 },
    randomUUIDv7: { length: 1 },
    randomFillSync: { length: 1 },
    scrypt: { length: 4, ownPrototype: true },
    pbkdf2Sync: { length: 5 },
    sign: { name: "signOneShot", length: 4, ownPrototype: true },
    verify: { name: "verifyOneShot", length: 5, ownPrototype: true },
    getCiphers: { name: "", length: 0 },
    getCurves: { name: "", length: 0 },
    getHashes: { name: "", length: 0 },
    getDiffieHellman: { name: "createDiffieHellmanGroup", length: 1, ownPrototype: true },
    hkdf: { length: 6, ownPrototype: true },
    pbkdf2: { length: 6, ownPrototype: true },
    setEngine: { length: 2 },
    Cipheriv: { length: 4 },
    Decipheriv: { length: 4 },
    Hash: { name: "deprecated", length: 2 },
    Hmac: { name: "deprecated", length: 3 },
    Sign: { length: 2 },
    Verify: { length: 2 },
  };

  for (const [key, options] of Object.entries(metadata)) {
    const value = crypto[key];
    if (typeof value !== "function") continue;
    if (options.name !== undefined) {
      Object.defineProperty(value, "name", { configurable: true, value: options.name });
    }
    Object.defineProperty(value, "length", { configurable: true, value: options.length });
    if (options.ownPrototype) defineOwnFunctionPrototype(value);
  }
}

function defineOwnFunctionPrototype(fn) {
  if (Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn,
  });
  Object.defineProperty(fn, "prototype", {
    configurable: false,
    enumerable: false,
    writable: true,
    value: prototype,
  });
}

function createDeprecatedCryptoConstructor(Constructor) {
  function deprecated(...args) {
    if (new.target) return Reflect.construct(Constructor, args, new.target);
    return new Constructor(...args);
  }
  deprecated.prototype = Constructor.prototype;
  return deprecated;
}

function createReadonlyConstants(values) {
  const constants = {};
  Object.setPrototypeOf(constants, null);
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(constants, key, {
      enumerable: true,
      configurable: false,
      writable: false,
      value,
    });
  }
  return constants;
}

function createUnsupportedCryptoError(api) {
  return Object.assign(new Error(`${api} is not supported in OpenContainers`), {
    code: "ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
  });
}

function throwUnsupportedCrypto(api) {
  throw createUnsupportedCryptoError(api);
}

function callbackUnsupportedCrypto(api, args, process) {
  const callback = args[args.length - 1];
  const error = createUnsupportedCryptoError(api);
  if (typeof callback !== "function") throw error;
  process?.__opencontainersAddRef?.();
  queueMicrotask(() => {
    try {
      if (process?.__opencontainersIsAlive?.() !== false) callback(error);
    } finally {
      process?.__opencontainersUnref?.();
    }
  });
  return undefined;
}

class Hash {
  constructor(algorithm) {
    this.#algorithm = algorithm;
    this.#normalized = normalizeHashAlgorithm(algorithm);
    this.#chunks = [];
  }

  #algorithm;
  #normalized;
  #chunks;

  update(chunk, inputEncoding) {
    this.#chunks.push(toBytes(chunk, inputEncoding));
    return this;
  }

  digest(outputEncoding) {
    const input = concatBytes(this.#chunks);
    if (this.#normalized === "md5") return encodeOutput(md5(input), outputEncoding);
    if (this.#normalized === "sha1") return encodeOutput(sha1(input), outputEncoding);
    if (this.#normalized === "sha256") return encodeOutput(sha256(input), outputEncoding);
    if (this.#normalized === "sha384") return encodeOutput(sha512(input, "sha384"), outputEncoding);
    if (this.#normalized === "sha512") return encodeOutput(sha512(input), outputEncoding);
    throw Object.assign(new Error(`Digest method not supported: ${this.#algorithm}`), {
      code: "ERR_OSSL_EVP_UNSUPPORTED",
    });
  }

  copy() {
    const copy = new Hash(this.#normalized);
    for (const chunk of this.#chunks) copy.update(chunk);
    return copy;
  }
}

class Hmac {
  constructor(algorithm, key) {
    if (key === undefined) {
      throw Object.assign(new TypeError("The \"key\" argument must be provided"), {
        code: "ERR_INVALID_ARG_TYPE",
      });
    }
    this.#normalized = normalizeHashAlgorithm(algorithm);
    const blockSize = this.#normalized === "sha384" || this.#normalized === "sha512" ? 128 : 64;
    let keyBytes = toBytes(key);
    if (keyBytes.length > blockSize) keyBytes = createHash(this.#normalized).update(keyBytes).digest();

    this.#innerPad = RuntimeBuffer.alloc(blockSize);
    this.#outerPad = RuntimeBuffer.alloc(blockSize);
    const paddedKey = RuntimeBuffer.alloc(blockSize);
    paddedKey.set(keyBytes.subarray(0, blockSize));
    for (let index = 0; index < blockSize; index += 1) {
      this.#innerPad[index] = paddedKey[index] ^ 0x36;
      this.#outerPad[index] = paddedKey[index] ^ 0x5c;
    }
    this.#chunks = [];
  }

  #normalized;
  #innerPad;
  #outerPad;
  #chunks;

  update(chunk, inputEncoding) {
    this.#chunks.push(toBytes(chunk, inputEncoding));
    return this;
  }

  digest(outputEncoding) {
    const inner = createHash(this.#normalized)
      .update(this.#innerPad)
      .update(concatBytes(this.#chunks))
      .digest();
    return createHash(this.#normalized)
      .update(this.#outerPad)
      .update(inner)
      .digest(outputEncoding);
  }
}

class Cipheriv {
  constructor(algorithm, key, iv, options = {}) {
    this.#context = createAesContext(algorithm, key, iv, options);
    this.#chunks = [];
    this.#aadChunks = [];
  }

  #context;
  #chunks;
  #aadChunks;
  #finalized = false;
  #autoPadding = true;
  #authTag = null;

  update(data, inputEncoding, outputEncoding) {
    if (this.#finalized) throw new Error("Cipher already finalized");
    this.#chunks.push(toBytes(data, inputEncoding));
    return encodeOutput(RuntimeBuffer.alloc(0), outputEncoding);
  }

  final(outputEncoding) {
    if (this.#finalized) throw new Error("Cipher already finalized");
    this.#finalized = true;
    const plaintext = concatBytes(this.#chunks);
    const input = this.#context.mode === "cbc" && this.#autoPadding ? addPkcs7Padding(plaintext) : plaintext;
    if (this.#context.mode === "cbc" && input.length % AES_BLOCK_SIZE !== 0) {
      throw Object.assign(new Error("wrong final block length"), { code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" });
    }
    if (this.#context.mode === "gcm") {
      const encrypted = aesGcmCrypt(input, this.#context);
      this.#authTag = gcmAuthTag(this.#context, concatBytes(this.#aadChunks), encrypted).subarray(0, this.#context.authTagLength);
      return encodeOutput(encrypted, outputEncoding);
    }
    return encodeOutput(this.#context.mode === "ctr" ? aesCtrCrypt(input, this.#context) : aesCbcCrypt(input, this.#context, true), outputEncoding);
  }

  setAutoPadding(value = true) {
    this.#autoPadding = Boolean(value);
    return this;
  }

  setAAD(data) {
    if (this.#finalized) throw new Error("Cipher already finalized");
    this.#aadChunks.push(toBytes(data));
    return this;
  }

  getAuthTag() {
    if (this.#context.mode !== "gcm") {
      throw Object.assign(new Error("Auth tag is only available for GCM mode"), { code: "ERR_CRYPTO_INVALID_STATE" });
    }
    if (!this.#authTag) {
      throw Object.assign(new Error("Invalid state for operation getAuthTag"), { code: "ERR_CRYPTO_INVALID_STATE" });
    }
    return RuntimeBuffer.from(this.#authTag);
  }
}

class Decipheriv {
  constructor(algorithm, key, iv, options = {}) {
    this.#context = createAesContext(algorithm, key, iv, options);
    this.#chunks = [];
    this.#aadChunks = [];
  }

  #context;
  #chunks;
  #aadChunks;
  #finalized = false;
  #autoPadding = true;
  #authTag = null;

  update(data, inputEncoding, outputEncoding) {
    if (this.#finalized) throw new Error("Decipher already finalized");
    this.#chunks.push(toBytes(data, inputEncoding));
    return encodeOutput(RuntimeBuffer.alloc(0), outputEncoding);
  }

  final(outputEncoding) {
    if (this.#finalized) throw new Error("Decipher already finalized");
    this.#finalized = true;
    const input = concatBytes(this.#chunks);
    if (this.#context.mode === "cbc" && input.length % AES_BLOCK_SIZE !== 0) {
      throw Object.assign(new Error("wrong final block length"), { code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" });
    }
    if (this.#context.mode === "gcm") {
      if (!this.#authTag) {
        throw Object.assign(new Error("Unsupported state or unable to authenticate data"), { code: "ERR_OSSL_BAD_DECRYPT" });
      }
      const expectedTag = gcmAuthTag(this.#context, concatBytes(this.#aadChunks), input).subarray(0, this.#authTag.length);
      if (!timingSafeEqual(expectedTag, this.#authTag)) {
        throw Object.assign(new Error("Unsupported state or unable to authenticate data"), { code: "ERR_OSSL_BAD_DECRYPT" });
      }
      return encodeOutput(aesGcmCrypt(input, this.#context), outputEncoding);
    }
    const decrypted = this.#context.mode === "ctr" ? aesCtrCrypt(input, this.#context) : aesCbcCrypt(input, this.#context, false);
    return encodeOutput(this.#context.mode === "cbc" && this.#autoPadding ? removePkcs7Padding(decrypted) : decrypted, outputEncoding);
  }

  setAutoPadding(value = true) {
    this.#autoPadding = Boolean(value);
    return this;
  }

  setAAD(data) {
    if (this.#finalized) throw new Error("Decipher already finalized");
    this.#aadChunks.push(toBytes(data));
    return this;
  }

  setAuthTag(tag) {
    if (this.#finalized) throw new Error("Decipher already finalized");
    this.#authTag = toBytes(tag);
    if (!this.#authTag.length || this.#authTag.length > AES_BLOCK_SIZE) {
      throw Object.assign(new Error("Invalid authentication tag length"), { code: "ERR_CRYPTO_INVALID_AUTH_TAG" });
    }
    return this;
  }
}

function createHash(algorithm) {
  return new Hash(algorithm);
}

function createHmac(algorithm, key) {
  return new Hmac(algorithm, key);
}

function createCipheriv(algorithm, key, iv, options = {}) {
  return new Cipheriv(algorithm, key, iv, options);
}

function createDecipheriv(algorithm, key, iv, options = {}) {
  return new Decipheriv(algorithm, key, iv, options);
}

function createAesContext(algorithm, key, iv, options = {}) {
  const match = String(algorithm || "").toLowerCase().match(/^aes-(128|192|256)-(cbc|ctr|gcm)$/);
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
  if (match[2] === "gcm" && ivBytes.length === 0) {
    throw Object.assign(new Error("Invalid initialization vector"), { code: "ERR_CRYPTO_INVALID_IV" });
  }
  if (match[2] !== "gcm" && ivBytes.length !== AES_BLOCK_SIZE) {
    throw Object.assign(new Error("Invalid initialization vector"), { code: "ERR_CRYPTO_INVALID_IV" });
  }
  const authTagLength = normalizeAuthTagLength(options?.authTagLength);

  return {
    cipher: new AesCipher(keyBytes),
    iv: RuntimeBuffer.from(ivBytes),
    mode: match[2],
    authTagLength,
  };
}

class KeyObject {
  constructor(type, bytes, options = {}) {
    this.type = type;
    this.symmetricKeySize = type === "secret" ? bytes.byteLength : undefined;
    this.asymmetricKeyType = options.asymmetricKeyType;
    this.asymmetricKeyDetails = options.asymmetricKeyDetails;
    this.#bytes = RuntimeBuffer.from(bytes);
    this.#pemLabel = options.pemLabel;
    Object.defineProperty(this, KEY_OBJECT_BRAND, {
      value: true,
      enumerable: false
    });
  }

  #bytes;
  #pemLabel;

  export(options = {}) {
    const format = options?.format;
    if (this.type === "secret") {
      if (format && format !== "buffer") {
        throw Object.assign(new Error(`Unsupported key format: ${format}`), { code: "ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE" });
      }
      return RuntimeBuffer.from(this.#bytes);
    }
    if (format === "pem") return pemEncode(this.#pemLabel ?? `${this.type.toUpperCase()} KEY`, this.#bytes);
    if (format && format !== "der" && format !== "buffer") {
      throw Object.assign(new Error(`Unsupported key format: ${options.format}`), { code: "ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE" });
    }
    return RuntimeBuffer.from(this.#bytes);
  }
}

function Certificate() {
  if (!new.target) return new Certificate();
}

Object.defineProperties(Certificate, {
  exportChallenge: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function exportChallenge(spkac, encoding) {
      return certificateExportChallenge(spkac, encoding);
    },
  },
  exportPublicKey: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function exportPublicKey(spkac, encoding) {
      return certificateExportPublicKey(spkac, encoding);
    },
  },
  verifySpkac: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function verifySpkac(spkac, encoding) {
      return certificateVerifySpkac(spkac, encoding);
    },
  },
});

Object.defineProperties(Certificate.prototype, {
  verifySpkac: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function verifySpkac(spkac, encoding) {
      return certificateVerifySpkac(spkac, encoding);
    },
  },
  exportPublicKey: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function exportPublicKey(spkac, encoding) {
      return certificateExportPublicKey(spkac, encoding);
    },
  },
  exportChallenge: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function exportChallenge(spkac, encoding) {
      return certificateExportChallenge(spkac, encoding);
    },
  },
});

function certificateExportChallenge(spkac) {
  normalizeCertificateSpkac(spkac);
  return "";
}

function certificateExportPublicKey(spkac) {
  normalizeCertificateSpkac(spkac);
  return "";
}

function certificateVerifySpkac(spkac) {
  const bytes = normalizeCertificateSpkac(spkac);
  return bytes.byteLength === 0 ? "" : false;
}

function normalizeCertificateSpkac(spkac) {
  if (typeof spkac === "string") return RuntimeBuffer.from(spkac);
  if (spkac instanceof ArrayBuffer) return new Uint8Array(spkac);
  if (ArrayBuffer.isView(spkac)) {
    return new Uint8Array(spkac.buffer, spkac.byteOffset, spkac.byteLength);
  }
  throw createCryptoTypeError('The "spkac" argument must be of type string or an instance of ArrayBuffer, Buffer, TypedArray, or DataView', spkac);
}

export class X509Certificate {
  constructor(buffer) {
    const raw = parsePemOrDer(buffer, "CERTIFICATE");
    const parsed = parseX509Certificate(raw);
    this.raw = RuntimeBuffer.from(raw);
    this.subject = parsed.subject;
    this.issuer = parsed.issuer;
    this.serialNumber = parsed.serialNumber;
    this.validFrom = parsed.validFrom;
    this.validTo = parsed.validTo;
    this.validFromDate = parsed.validFromDate;
    this.validToDate = parsed.validToDate;
    this.fingerprint = formatFingerprint("sha1", raw);
    this.fingerprint256 = formatFingerprint("sha256", raw);
    this.fingerprint512 = formatFingerprint("sha512", raw);
    this.ca = parsed.ca;
    this.subjectAltName = parsed.subjectAltName;
    this.infoAccess = undefined;
    this.keyUsage = undefined;
    this.publicKey = new KeyObject("public", parsed.publicKeyDer, {
      asymmetricKeyType: parsed.publicKeyType,
      pemLabel: "PUBLIC KEY",
    });
    this.#commonName = parsed.commonName;
    this.#altNames = parsed.altNames;
  }

  #commonName;
  #altNames;

  checkEmail(email) {
    const normalized = String(email);
    return this.#altNames.email.find(value => value.toLowerCase() === normalized.toLowerCase());
  }

  checkHost(name) {
    const normalized = String(name).toLowerCase();
    const matches = this.#altNames.dns.length ? this.#altNames.dns : (this.#commonName ? [this.#commonName] : []);
    return matches.find(value => matchCertificateHost(value, normalized));
  }

  checkIP(ip) {
    const normalized = String(ip);
    return this.#altNames.ip.find(value => value === normalized);
  }

  checkIssued(other) {
    return other instanceof X509Certificate && this.issuer === other.subject;
  }

  verify() {
    return throwUnsupportedCrypto("crypto.X509Certificate.verify");
  }

  toJSON() {
    return this.toString();
  }

  toLegacyObject() {
    return {
      subject: this.subject,
      issuer: this.issuer,
      subjectaltname: this.subjectAltName,
      infoAccess: this.infoAccess,
      ca: this.ca,
      modulus: undefined,
      bits: undefined,
      exponent: undefined,
      pubkey: RuntimeBuffer.from(this.publicKey.export()),
      valid_from: this.validFrom,
      valid_to: this.validTo,
      fingerprint: this.fingerprint,
      fingerprint256: this.fingerprint256,
      fingerprint512: this.fingerprint512,
      serialNumber: this.serialNumber,
      raw: RuntimeBuffer.from(this.raw),
    };
  }

  toString() {
    return pemEncode("CERTIFICATE", this.raw);
  }
}

class DiffieHellman {
  constructor(sizeOrKey, keyEncoding, generator, generatorEncoding) {
    this.sizeOrKey = sizeOrKey;
    this.keyEncoding = keyEncoding;
    this.generator = generator;
    this.generatorEncoding = generatorEncoding;
    this.verifyError = 0;
  }

  computeSecret() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.computeSecret");
  }

  generateKeys() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.generateKeys");
  }

  getGenerator() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.getGenerator");
  }

  getPrime() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.getPrime");
  }

  getPrivateKey() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.getPrivateKey");
  }

  getPublicKey() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.getPublicKey");
  }

  setPrivateKey() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.setPrivateKey");
  }

  setPublicKey() {
    return throwUnsupportedCrypto("crypto.DiffieHellman.setPublicKey");
  }
}

class DiffieHellmanGroup extends DiffieHellman {
  constructor(name) {
    super(name);
    this.name = name;
  }
}

class ECDH {
  constructor(curveName) {
    this.curveName = curveName;
  }

  computeSecret() {
    return throwUnsupportedCrypto("crypto.ECDH.computeSecret");
  }

  generateKeys() {
    return throwUnsupportedCrypto("crypto.ECDH.generateKeys");
  }

  getPrivateKey() {
    return throwUnsupportedCrypto("crypto.ECDH.getPrivateKey");
  }

  getPublicKey() {
    return throwUnsupportedCrypto("crypto.ECDH.getPublicKey");
  }

  setPrivateKey() {
    return throwUnsupportedCrypto("crypto.ECDH.setPrivateKey");
  }
}

class CryptoWritableProbe extends Writable {
  constructor() {
    super();
    this._opencontainersChunks = [];
  }

  update(data, inputEncoding) {
    this._opencontainersChunks.push(toBytes(data, inputEncoding));
    return this;
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    try {
      if (this.destroyed || this.writableEnded) {
        throw Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
      }
      this.update(chunk, encoding);
      callback?.();
      return true;
    } catch (error) {
      callback?.(error);
      this.emit("error", error);
      return false;
    }
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === "function") {
      callback = chunk;
      chunk = undefined;
      encoding = undefined;
    } else if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    if (chunk !== undefined) this.write(chunk, encoding);
    this._opencontainersWritableEndedPublic = true;
    this._opencontainersWritableFinished = true;
    this.emit("finish");
    if (this._opencontainersEmitClose) {
      this._opencontainersClosed = true;
      this.emit("close");
    }
    callback?.();
    return this;
  }
}

class Sign extends CryptoWritableProbe {
  constructor(algorithm) {
    super();
    this.algorithm = algorithm;
  }

  sign() {
    return throwUnsupportedCrypto("crypto.Sign.sign");
  }
}

class Verify extends CryptoWritableProbe {
  constructor(algorithm) {
    super();
    this.algorithm = algorithm;
  }

  verify() {
    return throwUnsupportedCrypto("crypto.Verify.verify");
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

function aesCtrCrypt(input, context) {
  const output = RuntimeBuffer.alloc(input.length);
  const counter = RuntimeBuffer.from(context.iv);

  for (let offset = 0; offset < input.length; offset += AES_BLOCK_SIZE) {
    const keyStream = context.cipher.encryptBlock(counter);
    const blockLength = Math.min(AES_BLOCK_SIZE, input.length - offset);
    for (let index = 0; index < blockLength; index += 1) {
      output[offset + index] = input[offset + index] ^ keyStream[index];
    }
    incrementCounter(counter);
  }

  return output;
}

function aesGcmCrypt(input, context) {
  const output = RuntimeBuffer.alloc(input.length);
  const counter = gcmInitialCounter(context);

  for (let offset = 0; offset < input.length; offset += AES_BLOCK_SIZE) {
    incrementGcmCounter(counter);
    const keyStream = context.cipher.encryptBlock(counter);
    const blockLength = Math.min(AES_BLOCK_SIZE, input.length - offset);
    for (let index = 0; index < blockLength; index += 1) {
      output[offset + index] = input[offset + index] ^ keyStream[index];
    }
  }

  return output;
}

function gcmAuthTag(context, aad, ciphertext) {
  const j0 = gcmInitialCounter(context);
  const s = gcmGhash(context, aad, ciphertext);
  const encryptedJ0 = context.cipher.encryptBlock(j0);
  const tag = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
  for (let index = 0; index < AES_BLOCK_SIZE; index += 1) tag[index] = encryptedJ0[index] ^ s[index];
  return tag;
}

function gcmInitialCounter(context) {
  if (context.iv.length === 12) {
    const counter = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
    counter.set(context.iv, 0);
    counter[15] = 1;
    return counter;
  }

  return gcmGhash(context, RuntimeBuffer.alloc(0), context.iv);
}

function gcmGhash(context, aad, ciphertext) {
  const h = context.cipher.encryptBlock(RuntimeBuffer.alloc(AES_BLOCK_SIZE));
  let y = RuntimeBuffer.alloc(AES_BLOCK_SIZE);

  for (const block of gcmBlocks(aad)) y = gcmMultiply(xorBlocks(y, block), h);
  for (const block of gcmBlocks(ciphertext)) y = gcmMultiply(xorBlocks(y, block), h);
  y = gcmMultiply(xorBlocks(y, gcmLengthBlock(aad.length, ciphertext.length)), h);

  return y;
}

function gcmBlocks(input) {
  const blocks = [];
  for (let offset = 0; offset < input.length; offset += AES_BLOCK_SIZE) {
    const block = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
    block.set(input.subarray(offset, Math.min(input.length, offset + AES_BLOCK_SIZE)));
    blocks.push(block);
  }
  return blocks;
}

function gcmLengthBlock(aadLength, ciphertextLength) {
  const block = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
  writeBigUInt64BE(block, BigInt(aadLength) * 8n, 0);
  writeBigUInt64BE(block, BigInt(ciphertextLength) * 8n, 8);
  return block;
}

function writeBigUInt64BE(buffer, value, offset) {
  let remaining = BigInt.asUintN(64, value);
  for (let index = offset + 7; index >= offset; index -= 1) {
    buffer[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function gcmMultiply(x, y) {
  const z = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
  const v = RuntimeBuffer.from(y);

  for (let bit = 0; bit < 128; bit += 1) {
    if (readGcmBit(x, bit)) xorInto(z, v);
    const leastSignificantBit = v[15] & 1;
    rightShiftBlock(v);
    if (leastSignificantBit) v[0] ^= 0xe1;
  }

  return z;
}

function readGcmBit(block, bit) {
  return (block[Math.floor(bit / 8)] & (0x80 >> (bit % 8))) !== 0;
}

function xorInto(target, source) {
  for (let index = 0; index < AES_BLOCK_SIZE; index += 1) target[index] ^= source[index];
}

function xorBlocks(left, right) {
  const output = RuntimeBuffer.alloc(AES_BLOCK_SIZE);
  for (let index = 0; index < AES_BLOCK_SIZE; index += 1) output[index] = left[index] ^ right[index];
  return output;
}

function rightShiftBlock(block) {
  let carry = 0;
  for (let index = 0; index < AES_BLOCK_SIZE; index += 1) {
    const nextCarry = block[index] & 1;
    block[index] = (block[index] >>> 1) | (carry << 7);
    carry = nextCarry;
  }
}

function incrementCounter(counter) {
  for (let index = counter.length - 1; index >= 0; index -= 1) {
    counter[index] = (counter[index] + 1) & 0xff;
    if (counter[index] !== 0) break;
  }
}

function incrementGcmCounter(counter) {
  for (let index = counter.length - 1; index >= counter.length - 4; index -= 1) {
    counter[index] = (counter[index] + 1) & 0xff;
    if (counter[index] !== 0) break;
  }
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

function normalizeAuthTagLength(value) {
  if (value === undefined) return AES_BLOCK_SIZE;
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 1 || length > AES_BLOCK_SIZE) {
    throw Object.assign(new Error("Invalid authentication tag length"), { code: "ERR_CRYPTO_INVALID_AUTH_TAG" });
  }
  return length;
}

function normalizeHashAlgorithm(algorithm) {
  return String(algorithm || "").toLowerCase().replace(/-/g, "");
}

function toBytes(value, encoding) {
  if (value === undefined || value === null) return RuntimeBuffer.alloc(0);
  if (value instanceof KeyObject) return value.export();
  if (typeof value === "string") return RuntimeBuffer.from(value, encoding || "utf8");
  return RuntimeBuffer.from(value);
}

function concatBytes(chunks) {
  return RuntimeBuffer.concat(chunks.map(chunk => RuntimeBuffer.from(chunk)));
}

function encodeOutput(bytes, encoding) {
  const buffer = RuntimeBuffer.from(bytes);
  return encoding === undefined || encoding === "buffer" ? buffer : buffer.toString(encoding);
}

const timingSafeEqual = {
  ""(...args) {
    const [left, right] = args;
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
}[""];

function createAsymmetricKeyObject(type, input) {
  if (input instanceof KeyObject) return input;
  const key = input && typeof input === "object" && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)
    ? input.key
    : input;
  const parsed = parseAsymmetricKey(key, type);
  return new KeyObject(type, parsed.bytes, {
    asymmetricKeyType: parsed.asymmetricKeyType,
    pemLabel: parsed.pemLabel,
  });
}

function parseAsymmetricKey(input, type) {
  const text = typeof input === "string" ? input : undefined;
  if (text) {
    const match = text.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/);
    if (!match) throw createPemNoStartLineError();
    const bytes = RuntimeBuffer.from(match[2].replace(/\s+/g, ""), "base64");
    return {
      bytes,
      pemLabel: match[1],
      asymmetricKeyType: detectAsymmetricKeyType(bytes, match[1]),
    };
  }
  const bytes = toBytes(input);
  if (!bytes.length) throw createPemNoStartLineError();
  return {
    bytes,
    pemLabel: `${type.toUpperCase()} KEY`,
    asymmetricKeyType: detectAsymmetricKeyType(bytes),
  };
}

function parsePemOrDer(input, expectedLabel) {
  if (typeof input === "string") {
    const match = input.match(new RegExp(`-----BEGIN ${expectedLabel}-----([\\s\\S]*?)-----END ${expectedLabel}-----`));
    if (!match) throw createPemNoStartLineError();
    return RuntimeBuffer.from(match[1].replace(/\s+/g, ""), "base64");
  }
  const bytes = toBytes(input);
  if (!bytes.length) throw createPemNoStartLineError();
  const text = bytes.toString("utf8");
  if (text.includes(`-----BEGIN ${expectedLabel}-----`)) return parsePemOrDer(text, expectedLabel);
  return bytes;
}

function createPemNoStartLineError() {
  return Object.assign(new Error("error:0480006C:PEM routines::no start line"), {
    code: "ERR_OSSL_PEM_NO_START_LINE",
  });
}

function pemEncode(label, bytes) {
  const base64 = RuntimeBuffer.from(bytes).toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function parseX509Certificate(raw) {
  const certificate = readDerNode(raw);
  if (certificate.tag !== 0x30) throw createPemNoStartLineError();
  const certificateParts = derChildren(certificate);
  const tbs = certificateParts[0];
  const fields = derChildren(tbs);
  let index = 0;
  if (fields[index]?.tag === 0xa0) index += 1;
  const serial = fields[index++];
  index += 1; // signature algorithm
  const issuerNode = fields[index++];
  const validityNode = fields[index++];
  const subjectNode = fields[index++];
  const publicKeyNode = fields[index++];

  const validity = parseValidity(validityNode);
  const extensions = parseCertificateExtensions(fields.slice(index));
  const subject = parseName(subjectNode);
  const issuer = parseName(issuerNode);
  return {
    subject: subject.text,
    issuer: issuer.text,
    serialNumber: integerHex(serial),
    validFrom: validity.validFrom,
    validTo: validity.validTo,
    validFromDate: validity.validFromDate,
    validToDate: validity.validToDate,
    publicKeyDer: publicKeyNode.raw,
    publicKeyType: detectSubjectPublicKeyType(publicKeyNode),
    ca: extensions.ca,
    subjectAltName: extensions.subjectAltName,
    altNames: extensions.altNames,
    commonName: subject.commonName,
  };
}

function readDerNode(bytes, offset = 0) {
  const startOffset = offset;
  const tag = bytes[offset++];
  if (tag === undefined) throw createPemNoStartLineError();
  let length = bytes[offset++];
  if (length & 0x80) {
    const byteCount = length & 0x7f;
    length = 0;
    for (let index = 0; index < byteCount; index += 1) length = (length << 8) | bytes[offset++];
  }
  const start = offset;
  const end = start + length;
  if (end > bytes.length) throw createPemNoStartLineError();
  return {
    tag,
    start,
    end,
    contentStart: start - startOffset,
    contentEnd: end - startOffset,
    value: bytes.subarray(start, end),
    raw: bytes.subarray(startOffset, end),
  };
}

function derChildren(node) {
  const children = [];
  let offset = node.contentStart;
  const end = node.contentEnd;
  const source = node.raw;
  while (offset < end) {
    const child = readDerNode(source, offset);
    children.push(child);
    offset = child.end;
  }
  return children;
}

function parseName(node) {
  const rows = [];
  let commonName;
  for (const setNode of derChildren(node)) {
    const attributes = [];
    for (const attributeNode of derChildren(setNode)) {
      const [oidNode, valueNode] = derChildren(attributeNode);
      const key = OID_NAMES[decodeOid(oidNode)] ?? decodeOid(oidNode);
      const value = decodeDerString(valueNode);
      if (key === "CN" && commonName === undefined) commonName = value;
      attributes.push(`${key}=${value}`);
    }
    if (attributes.length) rows.push(attributes.join(" + "));
  }
  return {
    text: rows.join("\n"),
    commonName,
  };
}

function parseValidity(node) {
  const [from, to] = derChildren(node).map(parseDerTime);
  return {
    validFrom: formatNodeDate(from),
    validTo: formatNodeDate(to),
    validFromDate: from,
    validToDate: to,
  };
}

function parseDerTime(node) {
  const value = node.value.toString("ascii");
  if (node.tag === 0x17) {
    const year = Number(value.slice(0, 2));
    return new Date(Date.UTC(year >= 50 ? 1900 + year : 2000 + year, Number(value.slice(2, 4)) - 1, Number(value.slice(4, 6)), Number(value.slice(6, 8)), Number(value.slice(8, 10)), Number(value.slice(10, 12))));
  }
  if (node.tag === 0x18) {
    return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)), Number(value.slice(8, 10)), Number(value.slice(10, 12)), Number(value.slice(12, 14))));
  }
  throw createPemNoStartLineError();
}

function formatNodeDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = value => String(value).padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} ${date.getUTCFullYear()} GMT`;
}

function parseCertificateExtensions(nodes) {
  const altNames = { dns: [], email: [], ip: [] };
  let ca = false;
  for (const wrapper of nodes) {
    if (wrapper.tag !== 0xa3) continue;
    const extensions = derChildren(derChildren(wrapper)[0] ?? wrapper);
    for (const extension of extensions) {
      const parts = derChildren(extension);
      const oid = decodeOid(parts[0]);
      const valueNode = parts.find(part => part.tag === 0x04);
      if (!valueNode) continue;
      if (oid === "2.5.29.19") {
        const constraints = derChildren(readDerNode(valueNode.value));
        ca = constraints.some(part => part.tag === 0x01 && part.value[0] !== 0);
      }
      if (oid === "2.5.29.17") parseSubjectAltName(valueNode.value, altNames);
    }
  }
  const subjectAltName = [
    ...altNames.dns.map(value => `DNS:${value}`),
    ...altNames.email.map(value => `email:${value}`),
    ...altNames.ip.map(value => `IP Address:${value}`),
  ].join(", ") || undefined;
  return { ca, subjectAltName, altNames };
}

function parseSubjectAltName(bytes, altNames) {
  const names = derChildren(readDerNode(bytes));
  for (const name of names) {
    const value = name.value.toString("utf8");
    if (name.tag === 0x82) altNames.dns.push(value);
    if (name.tag === 0x81) altNames.email.push(value);
    if (name.tag === 0x87) altNames.ip.push([...name.value].join("."));
  }
}

function decodeOid(node) {
  const bytes = node.value;
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (let index = 1; index < bytes.length; index += 1) {
    value = (value << 7) | (bytes[index] & 0x7f);
    if ((bytes[index] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function decodeDerString(node) {
  if (node.tag === 0x0c || node.tag === 0x13 || node.tag === 0x16 || node.tag === 0x14) return node.value.toString("utf8");
  if (node.tag === 0x1e) {
    let output = "";
    for (let index = 0; index < node.value.length; index += 2) {
      output += String.fromCharCode((node.value[index] << 8) | node.value[index + 1]);
    }
    return output;
  }
  return node.value.toString("hex");
}

function integerHex(node) {
  let hex = RuntimeBuffer.from(node.value).toString("hex").toUpperCase();
  while (hex.length > 2 && hex.startsWith("00")) hex = hex.slice(2);
  return hex || "00";
}

function detectSubjectPublicKeyType(node) {
  const algorithm = derChildren(derChildren(node)[0])[0];
  return ASYMMETRIC_KEY_OIDS[decodeOid(algorithm)] ?? undefined;
}

function detectAsymmetricKeyType(bytes, label = "") {
  try {
    if (label.includes("RSA")) return "rsa";
    const root = readDerNode(bytes);
    if (root.tag !== 0x30) return undefined;
    const parts = derChildren(root);
    const first = parts[0];
    if (first?.tag === 0x30) return ASYMMETRIC_KEY_OIDS[decodeOid(derChildren(first)[0])] ?? undefined;
    if (parts.some(part => part.tag === 0x02) && parts.length >= 8) return "rsa";
  } catch {
    return undefined;
  }
  return undefined;
}

function formatFingerprint(algorithm, bytes) {
  return RuntimeBuffer.from(createHash(algorithm).update(bytes).digest())
    .toString("hex")
    .toUpperCase()
    .match(/.{2}/g)
    .join(":");
}

function matchCertificateHost(pattern, host) {
  const normalized = String(pattern).toLowerCase();
  if (normalized === host) return pattern;
  if (!normalized.startsWith("*.")) return undefined;
  const suffix = normalized.slice(1);
  return host.endsWith(suffix) && host.slice(0, -suffix.length).indexOf(".") === -1 ? pattern : undefined;
}

const OID_NAMES = {
  "2.5.4.3": "CN",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "1.2.840.113549.1.9.1": "emailAddress",
};

const ASYMMETRIC_KEY_OIDS = {
  "1.2.840.113549.1.1.1": "rsa",
  "1.2.840.10045.2.1": "ec",
  "1.3.101.112": "ed25519",
  "1.3.101.113": "ed448",
};

function hkdf(digest, ikm, salt, info, keylen, callback, process) {
  if (typeof callback !== "function") {
    throw Object.assign(new TypeError("Callback must be a function"), {
      code: "ERR_INVALID_ARG_TYPE",
    });
  }
  process.__opencontainersAddRef?.();
  queueMicrotask(() => {
    try {
      if (process.__opencontainersIsAlive?.() !== false) {
        callback(null, hkdfSync(digest, ikm, salt, info, keylen));
      }
    } catch (error) {
      callback(error);
    } finally {
      process.__opencontainersUnref?.();
    }
  });
  return undefined;
}

function hkdfSync(digest, ikm, salt, info, keylen) {
  const normalized = normalizeHashAlgorithm(digest);
  const outputLength = validateNonNegativeInteger(keylen, "keylen");
  const ikmBytes = toBytes(ikm);
  const saltBytes = toBytes(salt);
  const infoBytes = toBytes(info);
  const hmacLength = createHmac(normalized, RuntimeBuffer.alloc(0)).update(RuntimeBuffer.alloc(0)).digest().length;
  if (outputLength > 255 * hmacLength) {
    throw Object.assign(new RangeError("keylen is too large"), { code: "ERR_OUT_OF_RANGE" });
  }
  const extractionSalt = saltBytes.length ? saltBytes : RuntimeBuffer.alloc(hmacLength);
  const pseudorandomKey = createHmac(normalized, extractionSalt).update(ikmBytes).digest();
  const output = RuntimeBuffer.alloc(outputLength);
  let previous = RuntimeBuffer.alloc(0);
  let offset = 0;
  let counter = 1;

  while (offset < outputLength) {
    previous = createHmac(normalized, pseudorandomKey)
      .update(previous)
      .update(infoBytes)
      .update(RuntimeBuffer.from([counter]))
      .digest();
    const chunk = previous.subarray(0, Math.min(previous.length, outputLength - offset));
    output.set(chunk, offset);
    offset += chunk.length;
    counter += 1;
  }

  return toArrayBuffer(output);
}

function pbkdf2(password, salt, iterations, keylen, digest, callback, process) {
  if (typeof digest === "function") {
    callback = digest;
    digest = "sha1";
  }
  if (typeof callback !== "function") {
    throw Object.assign(new TypeError("Callback must be a function"), {
      code: "ERR_INVALID_ARG_TYPE",
    });
  }
  process.__opencontainersAddRef?.();
  queueMicrotask(() => {
    try {
      if (process.__opencontainersIsAlive?.() !== false) {
        callback(null, pbkdf2Sync(password, salt, iterations, keylen, digest));
      }
    } catch (error) {
      callback(error);
    } finally {
      process.__opencontainersUnref?.();
    }
  });
  return undefined;
}

function pbkdf2Sync(password, salt, iterations, keylen, digest = "sha1") {
  const normalized = normalizeHashAlgorithm(digest);
  const iterationCount = validatePositiveInteger(iterations, "iterations");
  const outputLength = validatePositiveInteger(keylen, "keylen");
  const passwordBytes = toBytes(password);
  const saltBytes = toBytes(salt);
  const hmacLength = createHmac(normalized, passwordBytes).update(RuntimeBuffer.alloc(0)).digest().length;
  const blockCount = Math.ceil(outputLength / hmacLength);
  const output = RuntimeBuffer.alloc(blockCount * hmacLength);

  for (let block = 1; block <= blockCount; block += 1) {
    const blockIndex = RuntimeBuffer.alloc(4);
    blockIndex[0] = (block >>> 24) & 0xff;
    blockIndex[1] = (block >>> 16) & 0xff;
    blockIndex[2] = (block >>> 8) & 0xff;
    blockIndex[3] = block & 0xff;

    let u = createHmac(normalized, passwordBytes)
      .update(saltBytes)
      .update(blockIndex)
      .digest();
    const xor = RuntimeBuffer.from(u);

    for (let iteration = 1; iteration < iterationCount; iteration += 1) {
      u = createHmac(normalized, passwordBytes).update(u).digest();
      for (let index = 0; index < hmacLength; index += 1) {
        xor[index] ^= u[index];
      }
    }

    output.set(xor, (block - 1) * hmacLength);
  }

  return RuntimeBuffer.from(output.subarray(0, outputLength));
}

function scrypt(password, salt, keylen, options, callback, process) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  if (typeof callback !== "function") {
    throw Object.assign(new TypeError("Callback must be a function"), {
      code: "ERR_INVALID_ARG_TYPE",
    });
  }
  process.__opencontainersAddRef?.();
  queueMicrotask(() => {
    try {
      if (process.__opencontainersIsAlive?.() !== false) {
        callback(null, scryptSync(password, salt, keylen, options));
      }
    } catch (error) {
      callback(error);
    } finally {
      process.__opencontainersUnref?.();
    }
  });
  return undefined;
}

function scryptSync(password, salt, keylen, options = {}) {
  const params = normalizeScryptOptions(options);
  const outputLength = validatePositiveInteger(keylen, "keylen");
  const blockLength = 128 * params.r;
  const memoryNeeded = blockLength * params.N + blockLength * params.p;
  if (memoryNeeded > params.maxmem) throwInvalidScryptParams();

  const initial = RuntimeBuffer.from(pbkdf2Sync(password, salt, 1, params.p * blockLength, "sha256"));
  for (let index = 0; index < params.p; index += 1) {
    const start = index * blockLength;
    const mixed = scryptROMix(initial.subarray(start, start + blockLength), params.r, params.N);
    initial.set(mixed, start);
  }
  return pbkdf2Sync(password, initial, 1, outputLength, "sha256");
}

function normalizeScryptOptions(options = {}) {
  const normalized = options ?? {};
  const N = normalized.N ?? normalized.cost ?? 16384;
  const r = normalized.r ?? normalized.blockSize ?? 8;
  const p = normalized.p ?? normalized.parallelization ?? 1;
  const maxmem = normalized.maxmem ?? 32 * 1024 * 1024;
  const params = {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: Number(maxmem),
  };

  if (!Number.isSafeInteger(params.N) || params.N <= 1 || (params.N & (params.N - 1)) !== 0) {
    throwInvalidScryptParams();
  }
  if (!Number.isSafeInteger(params.r) || params.r <= 0) throwInvalidScryptParams();
  if (!Number.isSafeInteger(params.p) || params.p <= 0) throwInvalidScryptParams();
  if (!Number.isSafeInteger(params.maxmem) || params.maxmem <= 0) throwInvalidScryptParams();
  return params;
}

function throwInvalidScryptParams() {
  throw Object.assign(new RangeError("Invalid scrypt params"), {
    code: "ERR_CRYPTO_INVALID_SCRYPT_PARAMS",
  });
}

function scryptROMix(input, r, N) {
  let x = RuntimeBuffer.from(input);
  const v = new Array(N);

  for (let index = 0; index < N; index += 1) {
    v[index] = RuntimeBuffer.from(x);
    x = scryptBlockMix(x, r);
  }

  for (let index = 0; index < N; index += 1) {
    const j = scryptIntegerify(x, r) & (N - 1);
    x = scryptBlockMix(xorBuffers(x, v[j]), r);
  }

  return x;
}

function scryptBlockMix(input, r) {
  let x = RuntimeBuffer.from(input.subarray((2 * r - 1) * 64, 2 * r * 64));
  const y = new Array(2 * r);
  for (let index = 0; index < 2 * r; index += 1) {
    x = salsa208(xorBuffers(x, input.subarray(index * 64, (index + 1) * 64)));
    y[index] = x;
  }

  const output = RuntimeBuffer.alloc(input.length);
  for (let index = 0; index < r; index += 1) output.set(y[2 * index], index * 64);
  for (let index = 0; index < r; index += 1) output.set(y[2 * index + 1], (index + r) * 64);
  return output;
}

function scryptIntegerify(input, r) {
  const offset = (2 * r - 1) * 64;
  return input.readUInt32LE(offset);
}

function salsa208(input) {
  const original = new Uint32Array(16);
  const state = new Uint32Array(16);
  for (let index = 0; index < 16; index += 1) {
    original[index] = input.readUInt32LE(index * 4);
    state[index] = original[index];
  }

  for (let round = 0; round < 8; round += 2) {
    state[4] ^= rotateLeft((state[0] + state[12]) >>> 0, 7);
    state[8] ^= rotateLeft((state[4] + state[0]) >>> 0, 9);
    state[12] ^= rotateLeft((state[8] + state[4]) >>> 0, 13);
    state[0] ^= rotateLeft((state[12] + state[8]) >>> 0, 18);
    state[9] ^= rotateLeft((state[5] + state[1]) >>> 0, 7);
    state[13] ^= rotateLeft((state[9] + state[5]) >>> 0, 9);
    state[1] ^= rotateLeft((state[13] + state[9]) >>> 0, 13);
    state[5] ^= rotateLeft((state[1] + state[13]) >>> 0, 18);
    state[14] ^= rotateLeft((state[10] + state[6]) >>> 0, 7);
    state[2] ^= rotateLeft((state[14] + state[10]) >>> 0, 9);
    state[6] ^= rotateLeft((state[2] + state[14]) >>> 0, 13);
    state[10] ^= rotateLeft((state[6] + state[2]) >>> 0, 18);
    state[3] ^= rotateLeft((state[15] + state[11]) >>> 0, 7);
    state[7] ^= rotateLeft((state[3] + state[15]) >>> 0, 9);
    state[11] ^= rotateLeft((state[7] + state[3]) >>> 0, 13);
    state[15] ^= rotateLeft((state[11] + state[7]) >>> 0, 18);

    state[1] ^= rotateLeft((state[0] + state[3]) >>> 0, 7);
    state[2] ^= rotateLeft((state[1] + state[0]) >>> 0, 9);
    state[3] ^= rotateLeft((state[2] + state[1]) >>> 0, 13);
    state[0] ^= rotateLeft((state[3] + state[2]) >>> 0, 18);
    state[6] ^= rotateLeft((state[5] + state[4]) >>> 0, 7);
    state[7] ^= rotateLeft((state[6] + state[5]) >>> 0, 9);
    state[4] ^= rotateLeft((state[7] + state[6]) >>> 0, 13);
    state[5] ^= rotateLeft((state[4] + state[7]) >>> 0, 18);
    state[11] ^= rotateLeft((state[10] + state[9]) >>> 0, 7);
    state[8] ^= rotateLeft((state[11] + state[10]) >>> 0, 9);
    state[9] ^= rotateLeft((state[8] + state[11]) >>> 0, 13);
    state[10] ^= rotateLeft((state[9] + state[8]) >>> 0, 18);
    state[12] ^= rotateLeft((state[15] + state[14]) >>> 0, 7);
    state[13] ^= rotateLeft((state[12] + state[15]) >>> 0, 9);
    state[14] ^= rotateLeft((state[13] + state[12]) >>> 0, 13);
    state[15] ^= rotateLeft((state[14] + state[13]) >>> 0, 18);
  }

  const output = RuntimeBuffer.alloc(64);
  for (let index = 0; index < 16; index += 1) {
    output.writeUInt32LE((state[index] + original[index]) >>> 0, index * 4);
  }
  return output;
}

function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function xorBuffers(left, right) {
  const output = RuntimeBuffer.alloc(left.length);
  for (let index = 0; index < left.length; index += 1) output[index] = left[index] ^ right[index];
  return output;
}

function validatePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw Object.assign(new RangeError(`${name} must be a positive integer`), {
      code: "ERR_OUT_OF_RANGE",
    });
  }
  return number;
}

function validateNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw Object.assign(new RangeError(`${name} must be a non-negative integer`), {
      code: "ERR_OUT_OF_RANGE",
    });
  }
  return number;
}

function toArrayBuffer(bytes) {
  const copy = Uint8Array.from(bytes);
  return copy.buffer;
}

function getCipherInfo(algorithm, options = {}) {
  const match = String(algorithm || "").toLowerCase().match(/^aes-(128|192|256)-(cbc|ctr|gcm)$/);
  if (!match) return undefined;
  const keyLength = Number(match[1]) / 8;
  if (options?.keyLength !== undefined && Number(options.keyLength) !== keyLength) return undefined;
  const mode = match[2];
  const ivLength = mode === "gcm" ? 12 : AES_BLOCK_SIZE;
  if (options?.ivLength !== undefined && Number(options.ivLength) !== ivLength) return undefined;
  const nids = mode === "gcm"
    ? new Map([[16, 895], [24, 898], [32, 901]])
    : mode === "ctr"
      ? new Map([[16, 904], [24, 905], [32, 906]])
      : new Map([[16, 419], [24, 423], [32, 427]]);
  return Object.assign(Object.create(null), {
    mode,
    name: mode === "gcm" ? `id-aes${match[1]}-gcm` : `aes-${match[1]}-${mode}`,
    nid: nids.get(keyLength),
    keyLength,
    blockSize: mode === "cbc" ? AES_BLOCK_SIZE : 1,
    ivLength,
  });
}

function randomInteger(min, max) {
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

function randomFillSync(buffer, offset, size) {
  const view = validateRandomFillBuffer(buffer);
  const normalizedOffset = offset === undefined ? 0 : offset;
  const start = validateRandomFillNumber(normalizedOffset, "offset");
  const normalizedSize = size === undefined ? view.byteLength - Math.trunc(start) : size;
  const length = validateRandomFillNumber(normalizedSize, "size");
  validateRandomFillBounds(view, start, length);
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  view.set(bytes, Math.trunc(start));
  return buffer;
}

function randomFillWithProcess(buffer, offset, size, callback, process) {
  if (typeof offset === "function") {
    callback = offset;
    offset = 0;
    size = undefined;
  } else if (typeof size === "function") {
    callback = size;
    size = undefined;
  }
  validateRandomFillBuffer(buffer);
  if (offset !== undefined) validateRandomFillNumber(offset, "offset");
  const normalizedOffset = offset === undefined ? 0 : offset;
  const normalizedSize = size === undefined ? buffer.byteLength - Math.trunc(normalizedOffset) : size;
  validateRandomFillNumber(normalizedSize, "size");
  validateRandomFillBounds(normalizeRandomFillView(buffer), normalizedOffset, normalizedSize);
  if (typeof callback !== "function") {
    throw createCryptoTypeError("The \"callback\" argument must be of type function", callback);
  }
  process?.__opencontainersAddRef?.();
  scheduleRandomFillCallback(() => {
    let error = null;
    let filled;
    if (process?.__opencontainersIsAlive?.() !== false) {
      try {
        filled = randomFillSync(buffer, normalizedOffset, normalizedSize);
      } catch (fillError) {
        error = fillError;
      }
    }
    try {
      if (process?.__opencontainersIsAlive?.() !== false) callback(error, filled);
    } finally {
      process?.__opencontainersUnref?.();
    }
  });
  return undefined;
}

function scheduleRandomFillCallback(callback) {
  const schedule = typeof globalThis.setImmediate === "function"
    ? globalThis.setImmediate.bind(globalThis)
    : (fn) => setTimeout(fn, 0);
  schedule(() => schedule(callback));
}

function validateRandomIntSafeInteger(value, name) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw createCryptoTypeError(`The "${name}" argument must be a safe integer`, value);
}

function validateRandomIntRange(min, max) {
  if (max <= min) {
    throw createCryptoRangeError(`The value of "max" is out of range. It must be greater than the value of "min" (${formatCryptoNumber(min)}). Received ${formatCryptoNumber(max)}`);
  }
  const range = max - min;
  if (range > MAX_RANDOM_INT_RANGE) {
    throw createCryptoRangeError(`The value of "max - min" is out of range. It must be <= ${MAX_RANDOM_INT_RANGE}. Received ${formatCryptoNumber(range)}`);
  }
}

function validateRandomFillBuffer(buffer) {
  return normalizeRandomFillView(buffer);
}

function normalizeRandomFillView(buffer) {
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw createCryptoTypeError("The \"buf\" argument must be an instance of ArrayBuffer or ArrayBufferView", buffer);
}

function validateRandomFillNumber(value, name) {
  if (typeof value === "number") return value;
  throw createCryptoTypeError(`The "${name}" argument must be of type number`, value);
}

function validateRandomFillBounds(view, offset, size) {
  const start = Math.trunc(offset);
  const length = Math.trunc(size);
  if (!Number.isFinite(offset) || start < 0 || start > view.byteLength) {
    throw createCryptoRangeError(`The value of "offset" is out of range. It must be >= 0 && <= ${view.byteLength}. Received ${formatCryptoNumber(offset)}`);
  }
  if (!Number.isFinite(size) || length < 0 || length > MAX_RANDOM_BYTES) {
    throw createCryptoRangeError(`The value of "size" is out of range. It must be >= 0 && <= ${MAX_RANDOM_BYTES}. Received ${formatCryptoNumber(size)}`);
  }
  if (start + length > view.byteLength) {
    throw createCryptoRangeError(`The value of "size + offset" is out of range. It must be <= ${view.byteLength}. Received ${formatCryptoNumber(start + length)}`);
  }
}

function createCryptoTypeError(message, value) {
  return Object.assign(new TypeError(`${message}. Received ${describeCryptoReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE",
  });
}

function createCryptoRangeError(message) {
  return Object.assign(new RangeError(message), {
    code: "ERR_OUT_OF_RANGE",
  });
}

function describeCryptoReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "symbol") {
    return `type ${typeof value} (${String(value)})`;
  }
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

function formatCryptoNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const text = String(value);
  if (!Number.isInteger(value) || Math.abs(value) < 1000) return text;
  const sign = text.startsWith("-") ? "-" : "";
  const digits = sign ? text.slice(1) : text;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
}

function getRandomValues(typedArray) {
  if (!isIntegerTypedArray(typedArray)) {
    throw createDomException(
      "The data argument must be an integer-type TypedArray",
      "TypeMismatchError"
    );
  }
  if (typedArray.byteLength > 65536) {
    throw createDomException(
      "The requested length exceeds 65,536 bytes",
      "QuotaExceededError"
    );
  }
  const view = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  randomFillSync(view);
  return typedArray;
}

function isIntegerTypedArray(value) {
  return value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array ||
    value instanceof BigInt64Array ||
    value instanceof BigUint64Array;
}

function createDomException(message, name) {
  if (typeof DOMException === "function") return new DOMException(message, name);
  return Object.assign(new Error(message), { name });
}

function fallbackRandomUUID() {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function fallbackRandomUUIDv7() {
  const bytes = randomFillSync(new Uint8Array(16));
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

const MD5_SHIFT_AMOUNTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
);

function md5(input) {
  const bytes = RuntimeBuffer.from(input);
  const bitLength = BigInt(bytes.length) * 8n;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = RuntimeBuffer.alloc(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  writeUInt64LE(padded, bitLength, paddedLength - 8);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let index = 0; index < 16; index += 1) {
      words[index] = padded.readUInt32LE(offset + index * 4);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f;
      let g;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }

      const nextD = d;
      d = c;
      c = b;
      b = (b + rotateLeft((a + f + MD5_K[index] + words[g]) >>> 0, MD5_SHIFT_AMOUNTS[index])) >>> 0;
      a = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const output = RuntimeBuffer.alloc(16);
  output.writeUInt32LE(a0, 0);
  output.writeUInt32LE(b0, 4);
  output.writeUInt32LE(c0, 8);
  output.writeUInt32LE(d0, 12);
  return output;
}

function writeUInt64LE(buffer, value, offset) {
  let remaining = BigInt.asUintN(64, value);
  for (let index = 0; index < 8; index += 1) {
    buffer[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
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
