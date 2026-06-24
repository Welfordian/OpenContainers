import { EventEmitter } from "./events.js";
import { DEFAULT_CORE_CIPHER_LIST, X509Certificate } from "./crypto.js";
import { RuntimeBuffer } from "./buffer.js";

const TLS_SERVER_DATA = Symbol("opencontainers.tls.serverData");
const TLS_REINITIALIZE_HANDLE = Symbol("kReinitializeHandle");
const TLS_SERVER_REJECTION = Symbol("nodejs.rejection");
const TLS_TICKET_KEYS_LENGTH = 48;
const secureContextCertificates = new WeakMap();
const rootCertificates = [];
let defaultCACertificates = rootCertificates;
const TLS_CIPHERS = [
  "aes128-gcm-sha256",
  "aes128-sha",
  "aes128-sha256",
  "aes256-gcm-sha384",
  "aes256-sha",
  "aes256-sha256",
  "dhe-psk-aes128-cbc-sha",
  "dhe-psk-aes128-cbc-sha256",
  "dhe-psk-aes128-gcm-sha256",
  "dhe-psk-aes256-cbc-sha",
  "dhe-psk-aes256-cbc-sha384",
  "dhe-psk-aes256-gcm-sha384",
  "dhe-psk-chacha20-poly1305",
  "dhe-rsa-aes128-gcm-sha256",
  "dhe-rsa-aes128-sha",
  "dhe-rsa-aes128-sha256",
  "dhe-rsa-aes256-gcm-sha384",
  "dhe-rsa-aes256-sha",
  "dhe-rsa-aes256-sha256",
  "dhe-rsa-chacha20-poly1305",
  "ecdhe-ecdsa-aes128-gcm-sha256",
  "ecdhe-ecdsa-aes128-sha",
  "ecdhe-ecdsa-aes128-sha256",
  "ecdhe-ecdsa-aes256-gcm-sha384",
  "ecdhe-ecdsa-aes256-sha",
  "ecdhe-ecdsa-aes256-sha384",
  "ecdhe-ecdsa-chacha20-poly1305",
  "ecdhe-psk-aes128-cbc-sha",
  "ecdhe-psk-aes128-cbc-sha256",
  "ecdhe-psk-aes256-cbc-sha",
  "ecdhe-psk-aes256-cbc-sha384",
  "ecdhe-psk-chacha20-poly1305",
  "ecdhe-rsa-aes128-gcm-sha256",
  "ecdhe-rsa-aes128-sha",
  "ecdhe-rsa-aes128-sha256",
  "ecdhe-rsa-aes256-gcm-sha384",
  "ecdhe-rsa-aes256-sha",
  "ecdhe-rsa-aes256-sha384",
  "ecdhe-rsa-chacha20-poly1305",
  "psk-aes128-cbc-sha",
  "psk-aes128-cbc-sha256",
  "psk-aes128-gcm-sha256",
  "psk-aes256-cbc-sha",
  "psk-aes256-cbc-sha384",
  "psk-aes256-gcm-sha384",
  "psk-chacha20-poly1305",
  "rsa-psk-aes128-cbc-sha",
  "rsa-psk-aes128-cbc-sha256",
  "rsa-psk-aes128-gcm-sha256",
  "rsa-psk-aes256-cbc-sha",
  "rsa-psk-aes256-cbc-sha384",
  "rsa-psk-aes256-gcm-sha384",
  "rsa-psk-chacha20-poly1305",
  "srp-aes-128-cbc-sha",
  "srp-aes-256-cbc-sha",
  "srp-rsa-aes-128-cbc-sha",
  "srp-rsa-aes-256-cbc-sha",
  "tls_aes_128_ccm_8_sha256",
  "tls_aes_128_ccm_sha256",
  "tls_aes_128_gcm_sha256",
  "tls_aes_256_gcm_sha384",
  "tls_chacha20_poly1305_sha256"
];

export function createTlsBuiltin() {
  const tls = {
    CLIENT_RENEG_LIMIT: 3,
    CLIENT_RENEG_WINDOW: 600,
    DEFAULT_CIPHERS: DEFAULT_CORE_CIPHER_LIST,
    DEFAULT_ECDH_CURVE: "auto",
    DEFAULT_MIN_VERSION: "TLSv1.2",
    DEFAULT_MAX_VERSION: "TLSv1.3",
    getCiphers
  };
  Object.defineProperty(tls, "rootCertificates", {
    enumerable: true,
    configurable: false,
    get: cacheBundledRootCertificates
  });
  Object.assign(tls, {
    getCACertificates,
    setDefaultCACertificates,
    convertALPNProtocols,
    checkServerIdentity,
    createSecureContext,
    SecureContext,
    TLSSocket,
    Server,
    createServer,
    connect
  });
  return tls;
}

class SecureContextImpl {
  constructor(options = {}) {
    this.#certificate = normalizeCertificateOption(options?.cert);
    secureContextCertificates.set(this, this.#certificate);
    this.context = {
      getCertificate: () => this.#certificate?.raw ?? null
    };
    this.options = { ...(options ?? {}) };
  }

  #certificate;
}

export function SecureContext(options) {
  return Reflect.construct(SecureContextImpl, arguments, new.target || SecureContext);
}
Object.setPrototypeOf(SecureContext, SecureContextImpl);
SecureContext.prototype = SecureContextImpl.prototype;
Object.defineProperty(SecureContext.prototype, "constructor", {
  configurable: true,
  writable: true,
  value: SecureContext
});

class TLSSocketTransport extends EventEmitter {
  connect() {
    throw unsupportedTlsError("TLSSocket.connect");
  }

  destroy(error = null) {
    if (this.destroyed) return this;
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close", Boolean(error));
    return this;
  }

  end() {
    this.destroy();
    return this;
  }

  write() {
    throw unsupportedTlsError("TLSSocket.write");
  }

  setEncoding() {
    return this;
  }

  setTimeout(_timeout, callback) {
    if (typeof callback === "function") this.once("timeout", callback);
    return this;
  }

  setNoDelay() {
    return this;
  }

  setKeepAlive() {
    return this;
  }

  ref() {
    return this;
  }

  unref() {
    return this;
  }
}

class TLSSocketImpl extends TLSSocketTransport {
  constructor(socket = null, options = {}) {
    super();
    this.socket = socket;
    this.encrypted = true;
    this.authorized = false;
    this.authorizationError = null;
    this.alpnProtocol = false;
    this.servername = options.servername ?? options.host ?? null;
    this.destroyed = false;
    this.connecting = false;
    this.remoteAddress = socket?.remoteAddress;
    this.remotePort = socket?.remotePort;
    this.localAddress = socket?.localAddress;
    this.localPort = socket?.localPort;
    this.#certificate = normalizeCertificateOption(options.cert)
      ?? certificateFromSecureContext(options.secureContext);
    this.#peerCertificate = normalizeCertificateOption(options.peerCertificate ?? options.peerCert);
  }

  #certificate;
  #peerCertificate;

  disableRenegotiation() {
    return undefined;
  }

  _wrapHandle() {
    return undefined;
  }

  _destroySSL() {
    return undefined;
  }

  _init() {
    return undefined;
  }

  getCertificate() {
    return this.#certificate?.toLegacyObject() ?? {};
  }

  getPeerCertificate(detailed = false) {
    if (!this.#peerCertificate) return {};
    const legacy = this.#peerCertificate.toLegacyObject();
    if (detailed && !legacy.issuerCertificate) legacy.issuerCertificate = legacy;
    return legacy;
  }

  getX509Certificate() {
    return this.#certificate;
  }

  getPeerX509Certificate() {
    return this.#peerCertificate;
  }

  setKeyCert(context) {
    this.#certificate = context instanceof SecureContext
      ? certificateFromSecureContext(context)
      : normalizeCertificateOption(context?.cert);
    return undefined;
  }

  setMaxSendFragment() {
    return false;
  }

  _handleTimeout() {
    this.emit("timeout");
    return undefined;
  }

  _emitTLSError(error) {
    if (error) this.emit("error", error);
    return undefined;
  }

  _tlsError(error) {
    if (error) this.emit("error", error);
    return undefined;
  }

  _releaseControl() {
    return undefined;
  }

  _finishInit() {
    return undefined;
  }

  _start() {
    return undefined;
  }

  setServername(name) {
    this.servername = name == null ? null : String(name);
    return undefined;
  }

  setSession(session) {
    this.session = session;
    return undefined;
  }

  getCipher() {
    return undefined;
  }

  getSharedSigalgs() {
    return [];
  }

  getEphemeralKeyInfo() {
    return {};
  }

  getFinished() {
    return undefined;
  }

  getPeerFinished() {
    return undefined;
  }

  getProtocol() {
    return "TLSv1.3";
  }

  getSession() {
    return undefined;
  }

  getTLSTicket() {
    return undefined;
  }

  isSessionReused() {
    return false;
  }

  enableTrace() {
    return undefined;
  }

  renegotiate(_options, callback) {
    const error = unsupportedTlsError("TLSSocket.renegotiate");
    if (typeof callback === "function") {
      callback(error);
      return false;
    }
    throw error;
  }

  exportKeyingMaterial() {
    throw unsupportedTlsError("TLSSocket.exportKeyingMaterial");
  }
}

export function TLSSocket(socket, options) {
  if (!new.target) throw new TypeError("this._wrapHandle is not a function");
  return Reflect.construct(TLSSocketImpl, arguments, new.target);
}
Object.setPrototypeOf(TLSSocket, TLSSocketImpl);
TLSSocket.prototype = TLSSocketImpl.prototype;
Object.defineProperty(TLSSocket.prototype, "constructor", {
  configurable: true,
  writable: true,
  value: TLSSocket
});

class TlsServerTransport extends EventEmitter {
  listen() {
    throw unsupportedTlsError("Server.listen");
  }

  close(callback) {
    this.listening = false;
    if (typeof callback === "function") queueMicrotask(callback);
    queueMicrotask(() => this.emit("close"));
    return this;
  }

  address() {
    return null;
  }
}

class ServerImpl extends TlsServerTransport {
  constructor(options = {}, secureConnectionListener = undefined) {
    super();
    this.options = options ?? {};
    this.listening = false;
    this.#ticketKeys = createInitialTicketKeys();
    if (typeof secureConnectionListener === "function") {
      this.on("secureConnection", secureConnectionListener);
    }
  }

  #ticketKeys;

  getTicketKeys() {
    return RuntimeBuffer.from(this.#ticketKeys);
  }

  setTicketKeys(keys) {
    this.#ticketKeys = normalizeTicketKeys(keys);
    return undefined;
  }

  setSecureContext(options = {}) {
    this.options = { ...this.options, ...(options ?? {}) };
    return this;
  }

  addContext(hostname, context) {
    this.contexts ??= new Map();
    this.contexts.set(String(hostname), context);
    return this;
  }

  _getServerData() {
    return this[TLS_SERVER_DATA];
  }

  _setServerData(data) {
    this[TLS_SERVER_DATA] = data;
    return undefined;
  }
}

export function Server(options, secureConnectionListener) {
  return Reflect.construct(ServerImpl, arguments, new.target || Server);
}
Object.setPrototypeOf(Server, ServerImpl);
Server.prototype = ServerImpl.prototype;
Object.defineProperty(Server.prototype, "constructor", {
  configurable: true,
  writable: true,
  value: Server
});

function connect(...args) {
  if (isMissingConnectTarget(args)) throw createMissingTlsConnectArgsError();
  throw unsupportedTlsError("connect");
}

function createServer(options, secureConnectionListener) {
  if (typeof options === "function") {
    return new Server({}, options);
  }
  return new Server(options, secureConnectionListener);
}

function createSecureContext(options) {
  return new SecureContext(options);
}

function convertALPNProtocols(protocols, out) {
  out.ALPNProtocols = normalizeALPNProtocols(protocols);
  return undefined;
}

function getCACertificates(type = "default") {
  switch (type) {
    case "default":
      return defaultCACertificates.slice();
    case "system":
    case "bundled":
    case "extra":
      return [];
    default:
      throw createInvalidArgValueError("type", type);
  }
}

const getCiphers = () => {
  return TLS_CIPHERS.slice();
};

function cacheBundledRootCertificates() {
  return rootCertificates;
}

function createInitialTicketKeys() {
  const keys = RuntimeBuffer.alloc(TLS_TICKET_KEYS_LENGTH);
  try {
    globalThis.crypto?.getRandomValues?.(keys);
  } catch {
    // Deterministic zeroes are still a valid probe value when browser crypto is absent.
  }
  return keys;
}

function normalizeTicketKeys(keys) {
  if (!ArrayBuffer.isView(keys)) throw createInvalidTicketKeysTypeError(keys);
  const normalized = RuntimeBuffer.from(keys);
  if (normalized.length !== TLS_TICKET_KEYS_LENGTH) throw createTicketKeysLengthError();
  return normalized;
}

function setDefaultCACertificates(certs) {
  if (!Array.isArray(certs)) {
    throw createInvalidArgTypeError("certs", "an instance of Array", certs);
  }
  defaultCACertificates = certs.map((cert) => normalizeCACertificate(cert));
  return undefined;
}

function checkServerIdentity(hostname, cert) {
  const host = String(hostname ?? "");
  const subjectAltName = cert?.subjectaltname;
  if (subjectAltName) {
    const entries = parseSubjectAltName(subjectAltName);
    const matched = isIpHost(host)
      ? entries.some((entry) => entry.type === "IP Address" && normalizeIp(entry.value) === normalizeIp(host))
      : entries.some((entry) => entry.type === "DNS" && dnsNameMatches(host, entry.value));
    if (matched) return undefined;
    return createCertAltNameError(host, cert, `Host: ${host}. is not in the cert's altnames: ${subjectAltName}`);
  }

  const commonNames = subjectCommonNames(cert?.subject);
  if (commonNames.length > 0 && !isIpHost(host)) {
    if (commonNames.some((name) => dnsNameMatches(host, name))) return undefined;
    return createCertAltNameError(host, cert, `Host: ${host}. is not cert's CN: ${commonNames.join(", ")}`);
  }

  return createCertAltNameError(host, cert, "Cert does not contain a DNS name");
}

function normalizeALPNProtocols(protocols) {
  if (protocols instanceof Uint8Array) return RuntimeBuffer.from(protocols);
  if (ArrayBuffer.isView(protocols)) {
    return RuntimeBuffer.from(protocols.buffer, protocols.byteOffset, protocols.byteLength);
  }
  if (protocols instanceof ArrayBuffer) return RuntimeBuffer.from(protocols);
  if (!Array.isArray(protocols)) {
    throw createInvalidArgTypeError("protocols", "an Array, Buffer, or TypedArray", protocols);
  }

  const chunks = [];
  let totalLength = 0;
  for (let index = 0; index < protocols.length; index += 1) {
    const protocol = protocols[index];
    if (typeof protocol !== "string") {
      throw createInvalidArgTypeError("string", "string", protocol);
    }
    const bytes = new TextEncoder().encode(protocol);
    if (bytes.length > 255) {
      throw Object.assign(new RangeError(`The byte length of the protocol at index ${index} exceeds the maximum length. It must be <= 255. Received ${bytes.length}`), {
        code: "ERR_OUT_OF_RANGE"
      });
    }
    chunks.push(bytes);
    totalLength += 1 + bytes.length;
  }

  const result = RuntimeBuffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result[offset] = chunk.length;
    offset += 1;
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function normalizeCACertificate(cert) {
  if (typeof cert === "string") return cert;
  if (cert instanceof Uint8Array) return cert.slice();
  if (ArrayBuffer.isView(cert)) {
    return new Uint8Array(cert.buffer, cert.byteOffset, cert.byteLength).slice();
  }
  if (cert instanceof ArrayBuffer) return new Uint8Array(cert).slice();
  throw createInvalidArgTypeError("certs", "an array of strings, Buffers, or TypedArrays", cert);
}

function normalizeCertificateOption(value) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof X509Certificate) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry === undefined || entry === null) continue;
      return normalizeCertificateOption(entry);
    }
    return undefined;
  }
  if (typeof value === "object" && !(value instanceof Uint8Array) && typeof value !== "string") {
    if (value.raw) return new X509Certificate(value.raw);
    if (value.cert) return normalizeCertificateOption(value.cert);
  }
  return new X509Certificate(value);
}

function certificateFromSecureContext(context) {
  return context instanceof SecureContext ? secureContextCertificates.get(context) : undefined;
}

function parseCertString(value = "") {
  const result = {};
  for (const part of String(value).split(/\n|,/)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const parsedValue = part.slice(index + 1).trim();
    if (!key) continue;
    if (result[key] === undefined) result[key] = parsedValue;
    else if (Array.isArray(result[key])) result[key].push(parsedValue);
    else result[key] = [result[key], parsedValue];
  }
  return result;
}

function parseSubjectAltName(value = "") {
  const parts = [];
  let current = "";
  let quoted = false;
  for (const char of String(value)) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === "," && !quoted) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts
    .map((part) => {
      const index = part.indexOf(":");
      if (index <= 0) return null;
      return {
        type: part.slice(0, index).trim(),
        value: unquoteSanValue(part.slice(index + 1).trim())
      };
    })
    .filter(Boolean);
}

function unquoteSanValue(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function subjectCommonNames(subject) {
  if (!subject || typeof subject !== "object") return [];
  const cn = subject.CN;
  if (Array.isArray(cn)) return cn.map(String).filter(Boolean);
  return cn === undefined ? [] : [String(cn)].filter(Boolean);
}

function dnsNameMatches(hostname, pattern) {
  const host = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  const name = String(pattern ?? "").toLowerCase().replace(/\.$/, "");
  if (!host || !name) return false;
  if (!name.includes("*")) return host === name;
  if (!name.startsWith("*.")) return false;
  const suffix = name.slice(2);
  if (!host.endsWith(`.${suffix}`)) return false;
  const left = host.slice(0, -(suffix.length + 1));
  return left.length > 0 && !left.includes(".");
}

function isIpHost(hostname) {
  const host = String(hostname ?? "").replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function normalizeIp(value) {
  return String(value ?? "").replace(/^\[|\]$/g, "").toLowerCase();
}

function createCertAltNameError(host, cert, reason) {
  return Object.assign(new Error(`Hostname/IP does not match certificate's altnames: ${reason}`), {
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
    reason,
    host,
    cert
  });
}

function isMissingConnectTarget(args) {
  if (args.length === 0 || args[0] == null) return true;
  const first = args[0];
  if (typeof first === "object") {
    return first.port === undefined && first.path === undefined;
  }
  return false;
}

function createMissingTlsConnectArgsError() {
  return Object.assign(
    new TypeError('The "options" or "port" or "path" argument must be specified'),
    { code: "ERR_MISSING_ARGS" }
  );
}

function unsupportedTlsError(operation) {
  return Object.assign(new Error(`node:tls ${operation} is not supported in OpenContainers V1`), {
    code: "ERR_OPENCONTAINERS_TLS_UNSUPPORTED"
  });
}

function createInvalidTicketKeysTypeError(actual) {
  return Object.assign(
    new TypeError(`The "buffer" argument must be an instance of Buffer, TypedArray, or DataView. Received ${describeReceivedValue(actual)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function createTicketKeysLengthError() {
  return Object.assign(
    new Error(`Session ticket keys must be a ${TLS_TICKET_KEYS_LENGTH}-byte buffer
This is caused by either a bug in Node.js or incorrect usage of Node.js internals.
Please open an issue with this stack trace at https://github.com/nodejs/node/issues
`),
    { code: "ERR_INTERNAL_ASSERTION" }
  );
}

function createInvalidArgTypeError(name, expected, actual) {
  const type = actual === null ? "null" : typeof actual;
  return Object.assign(new TypeError(`The "${name}" argument must be ${expected}. Received ${type}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidArgValueError(name, value) {
  return Object.assign(new TypeError(`The argument '${name}' is invalid. Received ${JSON.stringify(value)}`), {
    code: "ERR_INVALID_ARG_VALUE"
  });
}

function describeReceivedValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return `type string ('${value}')`;
  if (type === "number" || type === "boolean" || type === "bigint") return `type ${type} (${String(value)})`;
  if (type === "symbol") return `type symbol (${String(value)})`;
  if (type === "function") return value.name ? `function ${value.name}` : "function";
  if (type === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${type}`;
}

function defineFunctionMetadata(target, name, { valueName, length, enumerable }) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  if (!descriptor || typeof descriptor.value !== "function") return;
  if (valueName !== undefined) {
    Object.defineProperty(descriptor.value, "name", {
      value: valueName,
      configurable: true
    });
  }
  if (length !== undefined) {
    Object.defineProperty(descriptor.value, "length", {
      value: length,
      configurable: true
    });
  }
  if (enumerable !== undefined && descriptor.enumerable !== enumerable) {
    Object.defineProperty(target, name, {
      ...descriptor,
      enumerable
    });
  }
}

function reorderProperties(target, names) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(target, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) {
    delete target[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(target, name, descriptor);
  }
}

function alignPrototypeMethodConstructors(target, names) {
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (!descriptor || typeof descriptor.value !== "function" || Object.hasOwn(descriptor.value, "prototype")) continue;
    const original = descriptor.value;
    const wrapper = function (...args) {
      return original.apply(this, args);
    };
    Object.defineProperty(wrapper, "name", {
      configurable: true,
      value: original.name
    });
    Object.defineProperty(wrapper, "length", {
      configurable: true,
      value: original.length
    });
    Object.defineProperty(target, name, {
      ...descriptor,
      value: wrapper
    });
  }
}

defineFunctionMetadata({ getCiphers }, "getCiphers", { valueName: "", length: 0 });
defineFunctionMetadata({ SecureContext }, "SecureContext", { length: 4 });
defineFunctionMetadata({ TLSSocket }, "TLSSocket", { length: 2 });
defineFunctionMetadata({ Server }, "Server", { length: 2 });

for (const [name, metadata] of Object.entries({
  disableRenegotiation: { length: 0 },
  _wrapHandle: { valueName: "", length: 3 },
  _destroySSL: { length: 0 },
  _init: { valueName: "", length: 2 },
  renegotiate: { valueName: "", length: 2 },
  exportKeyingMaterial: { valueName: "", length: 3 },
  setMaxSendFragment: { length: 1 },
  _handleTimeout: { valueName: "", length: 0 },
  _emitTLSError: { valueName: "", length: 1 },
  _tlsError: { valueName: "", length: 1 },
  _releaseControl: { valueName: "", length: 0 },
  _finishInit: { valueName: "", length: 0 },
  _start: { valueName: "", length: 0 },
  setServername: { valueName: "", length: 1 },
  setSession: { valueName: "", length: 1 },
  getPeerCertificate: { valueName: "", length: 1 },
  getCertificate: { valueName: "", length: 0 },
  getPeerX509Certificate: { valueName: "", length: 1 },
  getX509Certificate: { valueName: "", length: 0 },
  setKeyCert: { valueName: "", length: 1 },
  getCipher: { valueName: "socketMethodProxy", length: 0 },
  getSharedSigalgs: { valueName: "socketMethodProxy", length: 0 },
  getEphemeralKeyInfo: { valueName: "socketMethodProxy", length: 0 },
  getFinished: { valueName: "socketMethodProxy", length: 0 },
  getPeerFinished: { valueName: "socketMethodProxy", length: 0 },
  getProtocol: { valueName: "socketMethodProxy", length: 0 },
  getSession: { valueName: "socketMethodProxy", length: 0 },
  getTLSTicket: { valueName: "socketMethodProxy", length: 0 },
  isSessionReused: { valueName: "socketMethodProxy", length: 0 },
  enableTrace: { valueName: "socketMethodProxy", length: 0 }
})) {
  defineFunctionMetadata(TLSSocket.prototype, name, { ...metadata, enumerable: true });
}

Object.defineProperty(TLSSocket.prototype, TLS_REINITIALIZE_HANDLE, {
  enumerable: true,
  configurable: true,
  writable: true,
  value: function reinitializeHandle(handle) {
    return this._wrapHandle(handle);
  }
});

for (const [name, metadata] of Object.entries({
  setSecureContext: { valueName: "", length: 1 },
  _getServerData: { valueName: "", length: 0 },
  _setServerData: { valueName: "", length: 1 },
  getTicketKeys: { length: 0 },
  setTicketKeys: { length: 1 },
  addContext: { valueName: "", length: 2 }
})) {
  defineFunctionMetadata(Server.prototype, name, { ...metadata, enumerable: true });
}

Object.defineProperty(Server.prototype, TLS_SERVER_REJECTION, {
  enumerable: true,
  configurable: true,
  writable: true,
  value: function(error, event, value) {
    if (error) this.emit("error", error);
    return undefined;
  }
});
Object.defineProperty(Server.prototype[TLS_SERVER_REJECTION], "name", {
  configurable: true,
  value: ""
});

const TLS_SOCKET_PROTOTYPE_METHODS = [
  "disableRenegotiation",
  "_wrapHandle",
  "_destroySSL",
  "_init",
  "renegotiate",
  "exportKeyingMaterial",
  "setMaxSendFragment",
  "_handleTimeout",
  "_emitTLSError",
  "_tlsError",
  "_releaseControl",
  "_finishInit",
  "_start",
  "setServername",
  "setSession",
  "getPeerCertificate",
  "getCertificate",
  "getPeerX509Certificate",
  "getX509Certificate",
  "setKeyCert",
  "getCipher",
  "getSharedSigalgs",
  "getEphemeralKeyInfo",
  "getFinished",
  "getPeerFinished",
  "getProtocol",
  "getSession",
  "getTLSTicket",
  "isSessionReused",
  "enableTrace"
];
alignPrototypeMethodConstructors(TLSSocket.prototype, TLS_SOCKET_PROTOTYPE_METHODS);
reorderProperties(TLSSocket.prototype, TLS_SOCKET_PROTOTYPE_METHODS);

const TLS_SERVER_PROTOTYPE_METHODS = [
  "setSecureContext",
  "_getServerData",
  "_setServerData",
  "getTicketKeys",
  "setTicketKeys",
  "addContext"
];
alignPrototypeMethodConstructors(Server.prototype, TLS_SERVER_PROTOTYPE_METHODS);
reorderProperties(Server.prototype, TLS_SERVER_PROTOTYPE_METHODS);
