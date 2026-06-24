import { EventEmitter } from "./events.js";
import { Readable, Writable } from "./stream.js";
import { RuntimeBuffer } from "./buffer.js";

export const METHODS = [
  "ACL",
  "BIND",
  "CHECKOUT",
  "CONNECT",
  "COPY",
  "DELETE",
  "GET",
  "HEAD",
  "LINK",
  "LOCK",
  "M-SEARCH",
  "MERGE",
  "MKACTIVITY",
  "MKCALENDAR",
  "MKCOL",
  "MOVE",
  "NOTIFY",
  "OPTIONS",
  "PATCH",
  "POST",
  "PROPFIND",
  "PROPPATCH",
  "PURGE",
  "PUT",
  "QUERY",
  "REBIND",
  "REPORT",
  "SEARCH",
  "SOURCE",
  "SUBSCRIBE",
  "TRACE",
  "UNBIND",
  "UNLINK",
  "UNLOCK",
  "UNSUBSCRIBE"
];
export const STATUS_CODES = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a Teapot",
  421: "Misdirected Request",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  509: "Bandwidth Limit Exceeded",
  510: "Not Extended",
  511: "Network Authentication Required"
};

export class IncomingMessage extends Readable {
  constructor(request) {
    super();
    this._opencontainersAbortController = new AbortController();
    this.method = request.method;
    this.url = request.url;
    const incomingHeaders = headerEntries(request.headers);
    this.rawHeaders = rawIncomingHeaderLines(incomingHeaders);
    this.headers = collectIncomingHeaders(incomingHeaders);
    const trailers = normalizeTrailers(request.trailers, request.rawTrailers);
    this.trailers = trailers.trailers;
    this.rawTrailers = trailers.rawTrailers;
    this.statusCode = request.statusCode;
    this.statusMessage = request.statusMessage;
    const streamedBody = statusAllowsResponseBody(this.statusCode) ? request.bodyStream : null;
    const body = streamedBody ? null : (statusAllowsResponseBody(this.statusCode) ? normalizeIncomingMessageBody(request.body) : null);
    if (body && !this.headers["content-length"]) {
      this.headers["content-length"] = String(incomingMessageBodyLength(body));
    }
    this.socket = {
      remoteAddress: "127.0.0.1",
      remotePort: 0,
      localAddress: "127.0.0.1",
      localPort: request.port,
      encrypted: false,
      setTimeout() {
        return this;
      }
    };
    this.connection = this.socket;
    this.aborted = false;
    this.complete = false;
    this._dumped = false;
    if (streamedBody) {
      streamedBody.on("data", (chunk) => {
        if (!this._dumped) this.push(chunk);
      });
      streamedBody.on("end", () => {
        this.complete = true;
        this.push(null);
      });
      streamedBody.on("error", (error) => {
        this.destroy(error);
      });
    } else {
      queueMicrotask(() => {
        if (body) this.push(body);
        this.complete = true;
        this.push(null);
      });
    }
  }

  setTimeout(msecs, callback) {
    if (callback !== undefined) this.on("timeout", callback);
    this.socket?.setTimeout?.(msecs);
    return this;
  }

  _read(_size) {}

  _destroy(error, callback) {
    if (error) this.aborted = true;
    if (!this._opencontainersAbortController.signal.aborted) {
      this._opencontainersAbortController.abort(error);
    }
    callback?.(error);
  }

  _addHeaderLines(headers, n) {
    const rawHeaders = Array.isArray(headers) ? headers.map((value) => String(value)) : [];
    this.rawHeaders = rawHeaders;
    const limit = Number.isFinite(Number(n)) ? Math.min(Number(n), rawHeaders.length) : 0;
    if (limit > 0) {
      this.headers = {};
      this.headersDistinct = Object.create(null);
    }
    for (let index = 0; index < limit; index += 2) {
      const field = rawHeaders[index];
      const value = rawHeaders[index + 1];
      this._addHeaderLine(field, value, this.headers);
      this._addHeaderLineDistinct(field, value, this.headersDistinct);
    }
  }

  _addHeaderLine(field, value, dest) {
    addIncomingHeaderLine(field, value, dest);
  }

  _addHeaderLineDistinct(field, value, dest) {
    addIncomingHeaderLineDistinct(field, value, dest);
  }

  _dumpAndCloseReadable() {
    this._dump();
    this.push(null);
  }

  _dump() {
    this._dumped = true;
    this.resume?.();
    return undefined;
  }
}

export class ClientRequest extends Writable {
  constructor({ kernel, process, secureDefault, options, callback, defaultAgent = globalAgent }) {
    const chunks = [];
    let request;
    super({
      write: (chunk) => {
        request.#writeRequestChunk(chunk);
      }
    });
    request = this;
    this.method = options.method;
    this._opencontainersPath = `${options.pathname ?? "/"}${options.search ?? ""}`;
    this.host = options.hostname ?? options.host ?? "localhost";
    this.port = Number(options.port ?? (secureDefault ? 443 : 80));
    this.protocol = options.protocol ?? (secureDefault ? "https:" : "http:");
    this.headers = normalizeHeaders(options.headers ?? {});
    if (!Object.hasOwn(this.headers, "authorization") && options.auth !== undefined) {
      this.headers.authorization = `Basic ${RuntimeBuffer.from(String(options.auth)).toString("base64")}`;
    }
    if (!Object.hasOwn(this.headers, "host")) {
      this.headers.host = this.port && !isDefaultPort(this.protocol, this.port)
        ? `${this.host}:${this.port}`
        : this.host;
    }
    this.agent = options.agent ?? defaultAgent;
    this.socket = null;
    this.connection = null;
    this.reusedSocket = false;
    this._opencontainersWritableEndedPublic = false;
    this.finished = false;
    this.#kernel = kernel;
    this.#process = process;
    this.#callback = callback;
    this.#chunks = chunks;
    process.__opencontainersAddRef?.();
    queueMicrotask(() => this.#attachSocket(options));
  }

  #kernel;
  #process;
  #callback;
  #chunks;
  #bodyStream = null;
  #dispatchStarted = false;
  #ended = false;
  #aborted = false;
  #unrefQueued = false;
  #timeoutId = undefined;
  #deferredSocketOperations = [];

  #attachSocket(options) {
    if (this.#aborted || this.socket) return;
    const socket = createClientRequestSocket(this, options, this.agent);
    if (!socket) return;
    this.onSocket(socket);
  }

  get path() {
    return this._opencontainersPath;
  }

  set path(value) {
    this._opencontainersPath = String(value);
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
    return this;
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  removeHeader(name) {
    delete this.headers[String(name).toLowerCase()];
  }

  hasHeader(name) {
    return Object.hasOwn(this.headers, String(name).toLowerCase());
  }

  getHeaders() {
    return Object.assign(Object.create(null), this.headers);
  }

  getHeaderNames() {
    return Object.keys(this.headers);
  }

  flushHeaders() {
    this.headersSent = true;
  }

  setTimeout(timeout, callback) {
    if (typeof callback === "function") this.once("timeout", callback);
    if (this.#timeoutId !== undefined) clearTimeout(this.#timeoutId);
    const delay = Number(timeout);
    if (Number.isFinite(delay) && delay > 0) {
      this.#timeoutId = setTimeout(() => {
        this.#timeoutId = undefined;
        if (!this.#ended && !this.#aborted) this.emit("timeout");
      }, delay);
    }
    return this;
  }

  clearTimeout(callback) {
    if (typeof callback === "function") this.removeListener("timeout", callback);
    if (this.#timeoutId !== undefined) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = undefined;
    }
    this.#runSocketOperation((socket) => socket?.setTimeout?.(0));
    return undefined;
  }

  setNoDelay(noDelay) {
    this.#runSocketOperation((socket) => socket?.setNoDelay?.(noDelay ?? true));
    return undefined;
  }

  setSocketKeepAlive(enable, initialDelay) {
    this.#runSocketOperation((socket) => socket?.setKeepAlive?.(enable ?? true, initialDelay));
    return undefined;
  }

  _implicitHeader() {
    this.flushHeaders();
    return undefined;
  }

  _finish() {
    return undefined;
  }

  _deferToConnect(method, arguments_) {
    if (typeof method !== "function") return undefined;
    const args = Array.isArray(arguments_) ? arguments_ : [];
    if (this.socket && !this.socket.connecting) {
      method.apply(this, args);
    } else {
      this.once("socket", () => method.apply(this, args));
    }
    return undefined;
  }

  onSocket(socket, error) {
    if (error) {
      queueMicrotask(() => {
        if (!this.destroyed) this.emit("error", error);
      });
      return undefined;
    }
    if (!socket) return undefined;
    this.socket = socket;
    this.connection = socket;
    socket._httpMessage = this;
    this.emit("socket", socket);
    this.#flushDeferredSocketOperations(socket);
    return undefined;
  }

  end(chunk, encoding, callback) {
    if (this.#ended) return;
    if (chunk !== undefined) this.write(chunk, encoding);
    this.#ended = true;
    this._opencontainersWritableEndedPublic = true;
    this.finished = true;
    super.end(undefined, undefined, callback);
    queueMicrotask(() => {
      if (this.#isVirtualLocalhost()) {
        this.#startVirtualDispatch();
        this.#bodyStream?.end();
      } else {
        this.#dispatchBuffered();
      }
    });
  }

  abort() {
    this.aborted = true;
    this.destroy(Object.assign(new Error("Request aborted"), { code: "ECONNRESET" }));
    return undefined;
  }

  destroy(error) {
    if (this.#aborted) return this;
    this.#aborted = true;
    this.destroyed = true;
    this.#bodyStream?.destroy(error);
    if (this.#timeoutId !== undefined) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = undefined;
    }
    this.emit("abort");
    if (error) {
      try {
        this.emit("error", error);
      } catch (emitError) {
        reportVirtualError(this.#process, emitError);
      }
    }
    this.emit("close");
    this.#queueUnref();
    return this;
  }

  #writeRequestChunk(chunk) {
    const bodyChunk = RuntimeBuffer.from(chunk);
    this.#chunks.push(bodyChunk);
    if (bodyChunk.byteLength === 0) return;
    if (this.#isVirtualLocalhost()) {
      this.#startVirtualDispatch();
      this.#bodyStream?.write(bodyChunk);
    }
  }

  #isVirtualLocalhost() {
    return isVirtualLocalhost(this.host);
  }

  #startVirtualDispatch() {
    if (this.#dispatchStarted || this.#aborted) return;
    this.#dispatchStarted = true;
    this.#bodyStream = createVirtualRequestBodyStream();
    this.#dispatchVirtual(this.#bodyStream).then((response) => {
      this.#handleResponse(response);
    }, (error) => {
      this.#handleDispatchError(error);
    }).finally(() => {
      this.#queueUnref();
    });
  }

  async #dispatchBuffered() {
    if (this.#aborted) return;
    try {
      if (this.#timeoutId !== undefined) {
        clearTimeout(this.#timeoutId);
        this.#timeoutId = undefined;
      }
      const body = concatChunks(this.#chunks);
      const response = await this.#dispatchExternal(body);
      this.#handleResponse(response);
    } catch (error) {
      this.#handleDispatchError(error);
    } finally {
      this.#queueUnref();
    }
  }

  #handleResponse(response) {
    if (this.#aborted) return;
    if (this.#timeoutId !== undefined) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = undefined;
    }
    const incoming = new IncomingMessage({
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: response.headers,
      trailers: response.trailers,
      rawTrailers: response.rawTrailers,
      body: normalizeResponseBody(response.body)
    });
    this.#callback?.(incoming);
    this.emit("response", incoming);
  }

  #handleDispatchError(error) {
    try {
      this.emit("error", error);
    } catch (emitError) {
      reportVirtualError(this.#process, emitError);
    }
  }

  #queueUnref() {
    if (this.#unrefQueued) return;
    this.#unrefQueued = true;
    queueMicrotask(() => this.#process.__opencontainersUnref?.());
  }

  #runSocketOperation(operation) {
    if (this.socket) {
      operation(this.socket);
    } else {
      this.#deferredSocketOperations.push(operation);
    }
  }

  #flushDeferredSocketOperations(socket) {
    if (this.#deferredSocketOperations.length === 0) return;
    const operations = this.#deferredSocketOperations;
    this.#deferredSocketOperations = [];
    for (const operation of operations) operation(socket);
  }

  async #dispatchVirtual(bodyStream) {
    return this.#kernel.dispatchHttpRequest({
      id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2),
      projectId: this.#process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      port: this.port,
      method: this.method,
      url: this.path,
      headers: Object.entries(this.headers),
      bodyStream
    });
  }

  async #dispatchExternal(body) {
    const url = `${this.protocol}//${this.host}${this.port && !isDefaultPort(this.protocol, this.port) ? `:${this.port}` : ""}${this.path}`;
    const requestUrl = new URL(url);
    if (isHostPageOrigin(requestUrl)) {
      throw Object.assign(new Error(`Host application request blocked: ${requestUrl.href}`), {
        code: "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED"
      });
    }
    if (!isExternalNetworkAllowed(this.#kernel, this.#process, requestUrl)) {
      throw Object.assign(new Error(`External network request blocked: ${requestUrl.href}`), {
        code: "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED"
      });
    }
    const response = await fetch(requestUrl.href, createBrowserExternalFetchOptions(requestUrl, {
      method: this.method,
      headers: this.headers,
      body: body.byteLength ? body : undefined
    }));
    return {
      status: response.status,
      statusText: response.statusText,
      headers: normalizeExternalResponseHeaders(response.headers),
      body: new Uint8Array(await response.arrayBuffer())
    };
  }
}

export class Agent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = normalizeAgentOptions(options);
    this.defaultPort = 80;
    this.protocol = "http:";
    this.requests = {};
    this.sockets = {};
    this.freeSockets = {};
    this.keepAliveMsecs = this.options.keepAliveMsecs ?? 1000;
    this.keepAlive = Boolean(this.options.keepAlive);
    this.maxSockets = this.options.maxSockets ?? Infinity;
    this.maxFreeSockets = this.options.maxFreeSockets ?? 256;
    this.scheduling = this.options.scheduling ?? "lifo";
    this.maxTotalSockets = this.options.maxTotalSockets ?? Infinity;
    this.totalSocketCount = 0;
    this.agentKeepAliveTimeoutBuffer = this.options.agentKeepAliveTimeoutBuffer ?? 1000;
  }

  createConnection() {
    if (arguments.length === 0 || arguments[0] == null) throw createMissingAgentConnectArgsError();
    return createAgentProbeSocket();
  }

  getName(options = {}) {
    let name = `${options.host ?? "localhost"}:${options.port ?? ""}:${options.localAddress ?? ""}`;
    if (options.family !== undefined) name += `:${options.family}`;
    if (options.socketPath !== undefined) name += `:${options.socketPath}`;
    return name;
  }

  addRequest(req, options, port, localAddress) {}

  createSocket(req, options, callback) {
    const socketOptions = options && typeof options === "object" ? options : {};
    const name = this.getName(socketOptions);
    socketOptions.encoding = null;
    socketOptions._agentKey = name;
    const socket = createAgentProbeSocket();
    socket._httpMessage = req;
    socket.on("free", noopSocketEventListener);
    socket.on("close", noopSocketEventListener);
    socket.on("timeout", noopSocketEventListener);
    socket.on("agentRemove", noopSocketEventListener);
    this.sockets[name] ??= [];
    this.sockets[name].push(socket);
    this.totalSocketCount += 1;
    if (typeof callback === "function") callback(null, socket);
  }

  removeSocket(socket, options) {
    const name = this.getName(options);
    removeSocketFromPool(this.sockets, name, socket);
    if (!socket?.writable) removeSocketFromPool(this.freeSockets, name, socket);
  }

  keepSocketAlive(socket) {
    socket?.setKeepAlive?.(true, this.options.keepAliveMsecs ?? 1000);
    socket?.unref?.();
    socket?.setTimeout?.(this.options.timeout ?? 0);
    return true;
  }

  reuseSocket(socket, req) {
    socket?.removeListener?.("error", noopSocketErrorListener);
    socket?.ref?.();
    if (req && typeof req === "object") req.reusedSocket = true;
  }

  destroy() {
    destroyAgentSocketPool(this.freeSockets);
    destroyAgentSocketPool(this.sockets);
  }
}

alignAgentPrototypeMetadata(Agent, [
  "createConnection",
  "getName",
  "addRequest",
  "createSocket",
  "removeSocket",
  "keepSocketAlive",
  "reuseSocket",
  "destroy"
]);

export const globalAgent = new Agent({ keepAlive: true, scheduling: "lifo", timeout: 5000, proxyEnv: undefined });

function createHttpsAgentClass(BaseAgent) {
  class Agent extends BaseAgent {
    constructor(options = {}) {
      super(normalizeHttpsAgentOptions(options));
      this.defaultPort = 443;
      this.protocol = "https:";
      this.maxCachedSessions = options.maxCachedSessions ?? 100;
      this._sessionCache = { map: {}, list: [] };
    }

    createConnection() {
      return super.createConnection(...arguments);
    }

    getName(options = {}) {
      const baseName = super.getName(options);
      return `${baseName}:${[
        options.ca,
        options.cert,
        options.clientCertEngine,
        options.ciphers,
        options.key,
        options.pfx,
        options.rejectUnauthorized,
        options.servername && options.servername !== options.host ? options.servername : undefined,
        options.minVersion,
        options.maxVersion,
        options.secureProtocol,
        options.crl,
        options.honorCipherOrder,
        options.ecdhCurve,
        options.dhparam,
        options.secureOptions,
        options.sessionIdContext,
        options.sigalgs,
        options.privateKeyIdentifier,
        options.privateKeyEngine
      ].map(formatAgentNameValue).join(":")}`;
    }

    _getSession(key) {
      return this._sessionCache.map[key];
    }

    _cacheSession(key, session) {
      if (this.maxCachedSessions === 0) return;
      if (Object.prototype.hasOwnProperty.call(this._sessionCache.map, key)) {
        this._sessionCache.map[key] = session;
        return;
      }
      this._sessionCache.map[key] = session;
      this._sessionCache.list.push(key);
      while (this._sessionCache.list.length > this.maxCachedSessions) {
        const evicted = this._sessionCache.list.shift();
        delete this._sessionCache.map[evicted];
      }
    }

    _evictSession(key) {
      delete this._sessionCache.map[key];
      this._sessionCache.list = this._sessionCache.list.filter((entry) => entry !== key);
    }
  }
  setFunctionLength(Agent, 1);
  alignAgentPrototypeMetadata(Agent, [
    "createConnection",
    "getName",
    "_getSession",
    "_cacheSession",
    "_evictSession"
  ]);
  return Agent;
}

function normalizeAgentOptions(options = {}) {
  const normalized = { ...options };
  if (!Object.hasOwn(normalized, "noDelay")) normalized.noDelay = true;
  if (!Object.hasOwn(normalized, "path")) normalized.path = null;
  return normalized;
}

function normalizeHttpsAgentOptions(options = {}) {
  const normalized = { ...options };
  if (!Object.hasOwn(normalized, "defaultPort")) normalized.defaultPort = 443;
  if (!Object.hasOwn(normalized, "protocol")) normalized.protocol = "https:";
  return normalized;
}

export class OutgoingMessage extends Writable {
  constructor(options) {
    super(options);
    this.headers = new Map();
    this.headersSent = false;
    this._opencontainersWritableEndedPublic = false;
    this.finished = false;
    this.socket = null;
    this.connection = null;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  removeHeader(name) {
    this.headers.delete(String(name).toLowerCase());
  }

  hasHeader(name) {
    return this.headers.has(String(name).toLowerCase());
  }

  getHeaders() {
    return Object.assign(Object.create(null), Object.fromEntries(this.headers.entries()));
  }

  getHeaderNames() {
    return [...this.headers.keys()];
  }

  flushHeaders() {
    this.headersSent = true;
  }
}

class HttpServer extends EventEmitter {
  constructor({ kernel, process, listener, secure = false } = {}) {
    super();
    this.#kernel = kernel;
    this.#process = process;
    this.secure = secure;
    this.listening = false;
    this.timeout = 0;
    this.keepAliveTimeout = 5000;
    this.headersTimeout = 60000;
    this.requestTimeout = 300000;
    this.maxHeadersCount = null;
    if (typeof listener === "function") this.on("request", listener);
  }

  #kernel;
  #process;

  listen(port = 0, hostOrCallback, maybeCallback) {
    const callback = typeof hostOrCallback === "function" ? hostOrCallback : maybeCallback;
    const host = typeof hostOrCallback === "string" ? hostOrCallback : "0.0.0.0";
    if (!this.#kernel || !this.#process) {
      throw Object.assign(new Error("HTTP server is not bound to an OpenContainers runtime"), {
        code: "ERR_OPENCONTAINERS_HTTP_SERVER_UNBOUND"
      });
    }
    const projectId = this.#process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
    const assignedPort = this.#kernel.registerPort({
      projectId,
      pid: this.#process.pid,
      port,
      host,
      handler: (request) => dispatchServerRequest({ server: this, process: this.#process, request })
    });
    try {
      this.#kernel.listenNet({
        projectId,
        pid: this.#process.pid,
        port: assignedPort,
        host,
        connectionListener: (socket) => {
          handleHttpSocketConnection({
            server: this,
            process: this.#process,
            socket,
            port: assignedPort
          });
        }
      });
    } catch (error) {
      this.#kernel.portManager?.unregister(projectId, assignedPort);
      throw error;
    }
    this.#kernel.registerWebSocketServer({
      projectId,
      port: assignedPort,
      handler: (socket, request) => {
        const req = new IncomingMessage({
          method: "GET",
          url: request.path,
          headers: [["upgrade", "websocket"]]
        });
        try {
          if (this.listenerCount("upgrade")) {
            this.emit("upgrade", req, socket, RuntimeBuffer.alloc(0));
          } else {
            this.emit("websocket", socket, req);
          }
        } catch (error) {
          reportVirtualError(this.#process, error);
          socket.close?.(1011, "Unhandled virtual server error");
        }
      }
    });
    this.listening = true;
    this.address = () => ({ address: host, family: "IPv4", port: assignedPort });
    callback?.();
    this.emit("listening");
    return this;
  }

  close(callback) {
    this.#kernel?.unregisterPortsForPid(this.#process?.pid);
    this.listening = false;
    callback?.();
    this.emit("close");
    return this;
  }

  ref() {
    return this;
  }

  unref() {
    return this;
  }

  setTimeout(timeout, callback) {
    this.timeout = Number(timeout) || 0;
    if (typeof callback === "function") this.on("timeout", callback);
    return this;
  }
}

export class ServerResponse extends OutgoingMessage {
  constructor(resolveResponse) {
    const chunks = [];
    super({
      write: (chunk) => {
        chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      }
    });
    this.statusCode = 200;
    this.statusMessage = "OK";
    this.trailers = {};
    this.#rawTrailers = [];
    this.#chunks = chunks;
    this.#resolveResponse = resolveResponse;
  }

  #chunks;
  #resolveResponse;
  #rawTrailers;
  #ended = false;

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  removeHeader(name) {
    this.headers.delete(String(name).toLowerCase());
  }

  hasHeader(name) {
    return this.headers.has(String(name).toLowerCase());
  }

  getHeaders() {
    return Object.assign(Object.create(null), Object.fromEntries(this.headers.entries()));
  }

  getHeaderNames() {
    return [...this.headers.keys()];
  }

  flushHeaders() {
    this.headersSent = true;
  }

  writeContinue(callback) {
    callback?.();
  }

  writeProcessing(callback) {
    callback?.();
  }

  addTrailers(headers = {}) {
    const trailers = normalizeTrailers(headers);
    Object.assign(this.trailers, trailers.trailers);
    this.#rawTrailers.push(...trailers.rawTrailers);
  }

  writeHead(statusCode, statusMessageOrHeaders, headers) {
    this.statusCode = statusCode;
    if (typeof statusMessageOrHeaders === "string") {
      this.statusMessage = statusMessageOrHeaders;
      for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value);
    } else {
      for (const [name, value] of Object.entries(statusMessageOrHeaders ?? {})) this.setHeader(name, value);
    }
    return this;
  }

  end(chunk, encoding, callback) {
    if (this.#ended) return;
    if (chunk !== undefined) this.write(chunk, encoding);
    this.#ended = true;
    this.headersSent = true;
    this._opencontainersWritableEndedPublic = true;
    this.finished = true;
    const size = this.#chunks.reduce((total, part) => total + part.byteLength, 0);
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunkPart of this.#chunks) {
      body.set(chunkPart, offset);
      offset += chunkPart.byteLength;
    }
    this.#resolveResponse({
      status: this.statusCode,
      statusText: this.statusMessage,
      headers: [...this.headers.entries()],
      trailers: Object.entries(this.trailers),
      rawTrailers: [...this.#rawTrailers],
      body: statusAllowsResponseBody(this.statusCode) ? body : RuntimeBuffer.alloc(0)
    });
    super.end(undefined, undefined, callback);
  }
}

export function createHttpBuiltin({ kernel, process }) {
  let currentGlobalAgent = globalAgent;
  const request = createRequestFactory({ kernel, process, secureDefault: false, defaultAgent: () => currentGlobalAgent });
  const Server = createServerClass({ kernel, process, secure: false });
  function createServer(options, requestListener) {
    return new Server(options, requestListener);
  }
  function get(...args) {
    const req = request(...args);
    req.end();
    return req;
  }
  function connectionListener(socket) {
    this?.emit?.("connection", socket);
  }
  setFunctionLength(request, 3);
  setFunctionLength(get, 3);
  alignHttpMetadata();
  const getMaxHeaderSize = nameAccessor(() => 16 * 1024, "get");
  const getGlobalAgent = nameAccessor(() => currentGlobalAgent, "get");
  const setGlobalAgent = nameAccessor((value) => {
    currentGlobalAgent = value;
  }, "set");
  const getWebSocket = nameAccessor(() => getWebSocketClass(), "get");
  const getCloseEvent = nameAccessor(() => getCloseEventClass(), "get");
  const getMessageEvent = nameAccessor(() => getMessageEventClass(), "get");
  const httpBuiltin = {
    _connectionListener: connectionListener,
    METHODS,
    STATUS_CODES,
    Agent,
    ClientRequest,
    IncomingMessage,
    OutgoingMessage,
    Server,
    ServerResponse,
    createServer,
    validateHeaderName,
    validateHeaderValue,
    get,
    request,
    setMaxIdleHTTPParsers,
    setGlobalProxyFromEnv
  };
  Object.defineProperties(httpBuiltin, {
    maxHeaderSize: {
      configurable: true,
      enumerable: true,
      get: getMaxHeaderSize
    },
    globalAgent: {
      configurable: true,
      enumerable: true,
      get: getGlobalAgent,
      set: setGlobalAgent
    },
    WebSocket: {
      configurable: true,
      enumerable: true,
      get: getWebSocket
    },
    CloseEvent: {
      configurable: true,
      enumerable: true,
      get: getCloseEvent
    },
    MessageEvent: {
      configurable: true,
      enumerable: true,
      get: getMessageEvent
    }
  });
  return httpBuiltin;
}

export function createHttpsBuiltin({ kernel, process }) {
  const HttpsAgent = createHttpsAgentClass(Agent);
  const httpsGlobalAgent = new HttpsAgent({ keepAlive: true, scheduling: "lifo", timeout: 5000, proxyEnv: undefined });
  const request = createRequestFactory({ kernel, process, secureDefault: true, defaultAgent: httpsGlobalAgent });
  const Server = createServerClass({ kernel, process, secure: true });
  function createServer(options, requestListener) {
    return new Server(options, requestListener);
  }
  function get(...args) {
    const req = request(...args);
    req.end();
    return req;
  }
  setFunctionLength(get, 3);
  alignHttpMetadata(HttpsAgent);
  return {
    Agent: HttpsAgent,
    globalAgent: httpsGlobalAgent,
    Server,
    createServer,
    get,
    request
  };
}

function alignHttpMetadata(AgentClass = Agent) {
  setFunctionLength(AgentClass, 1);
  setFunctionLength(ClientRequest, 3);
  setFunctionLength(ServerResponse, 2);
  setFunctionLength(validateHeaderName, 0);
  setFunctionLength(validateHeaderValue, 0);
  if (Object.getPrototypeOf(ClientRequest.prototype) !== OutgoingMessage.prototype) {
    Object.setPrototypeOf(ClientRequest.prototype, OutgoingMessage.prototype);
  }
  defineIncomingMessageAccessors();
  defineClientRequestAccessors();
  alignPrototypeMethodMetadata(IncomingMessage.prototype, [
    "setTimeout",
    "_read",
    "_destroy",
    "_addHeaderLines",
    "_addHeaderLine",
    "_addHeaderLineDistinct",
    "_dumpAndCloseReadable",
    "_dump"
  ], { enumerable: true });
  alignPrototypeMethodMetadata(ClientRequest.prototype, [
    "setHeader",
    "getHeader",
    "removeHeader",
    "hasHeader",
    "getHeaders",
    "getHeaderNames",
    "flushHeaders",
    "setTimeout",
    "clearTimeout",
    "setNoDelay",
    "setSocketKeepAlive",
    "_implicitHeader",
    "_finish",
    "_deferToConnect",
    "onSocket",
    "end",
    "abort",
    "destroy"
  ]);
  alignPrototypeMethodMetadata(ClientRequest.prototype, [
    "setTimeout",
    "clearTimeout",
    "setNoDelay",
    "setSocketKeepAlive",
    "_implicitHeader",
    "_finish",
    "_deferToConnect",
    "onSocket",
    "abort",
    "destroy"
  ], { enumerable: true });
  alignPrototypeMethodMetadata(OutgoingMessage.prototype, [
    "setHeader",
    "getHeader",
    "removeHeader",
    "hasHeader",
    "getHeaders",
    "getHeaderNames",
    "flushHeaders"
  ], { enumerable: true });
  alignPrototypeMethodMetadata(ServerResponse.prototype, [
    "setHeader",
    "getHeader",
    "removeHeader",
    "hasHeader",
    "getHeaders",
    "getHeaderNames",
    "flushHeaders",
    "writeContinue",
    "writeProcessing",
    "addTrailers",
    "writeHead",
    "end"
  ]);
  alignPrototypeMethodMetadata(ServerResponse.prototype, ["writeContinue", "writeProcessing", "writeHead"], { enumerable: true });
}

function defineClientRequestAccessors() {
  const descriptor = Object.getOwnPropertyDescriptor(ClientRequest.prototype, "path");
  if (descriptor?.get?.name === "get" && descriptor.enumerable) return;
  Object.defineProperty(ClientRequest.prototype, "path", {
    configurable: true,
    enumerable: true,
    get: createMethodStyleAccessor("get", function() {
      return this._opencontainersPath;
    }),
    set: createMethodStyleAccessor("set", function(value) {
      this._opencontainersPath = String(value);
    })
  });
}

function defineIncomingMessageAccessors() {
  const expectedNames = "constructor,connection,headers,headersDistinct,trailers,trailersDistinct,signal,setTimeout,_read,_destroy,_addHeaderLines,_addHeaderLine,_addHeaderLineDistinct,_dumpAndCloseReadable,_dump";
  if (Object.getOwnPropertyNames(IncomingMessage.prototype).join(",") === expectedNames) return;

  const methodDescriptors = Object.fromEntries([
    "setTimeout",
    "_read",
    "_destroy",
    "_addHeaderLines",
    "_addHeaderLine",
    "_addHeaderLineDistinct",
    "_dumpAndCloseReadable",
    "_dump"
  ].map((name) => [name, Object.getOwnPropertyDescriptor(IncomingMessage.prototype, name)]));

  for (const name of Object.keys(methodDescriptors)) {
    if (methodDescriptors[name]?.configurable) delete IncomingMessage.prototype[name];
  }

  Object.defineProperties(IncomingMessage.prototype, {
    connection: {
      configurable: false,
      enumerable: false,
      get: createConstructableAccessor("get", 0, function() {
        return this.socket;
      }),
      set: createConstructableAccessor("set", 1, function(value) {
        this.socket = value;
      })
    },
    headers: {
      configurable: false,
      enumerable: false,
      get: createConstructableAccessor("get", 0, function() {
        return getCachedIncomingMessageValue(this, "_opencontainersHeaders", () => ({}));
      }),
      set: createConstructableAccessor("set", 1, function(value) {
        setCachedIncomingMessageValue(this, "_opencontainersHeaders", value);
      })
    },
    headersDistinct: {
      configurable: false,
      enumerable: false,
      get: createConstructableAccessor("get", 0, function() {
        return getCachedIncomingMessageValue(this, "_opencontainersHeadersDistinct", () => distinctHeaderValues(this.rawHeaders, this.headers));
      }),
      set: createConstructableAccessor("set", 1, function(value) {
        setCachedIncomingMessageValue(this, "_opencontainersHeadersDistinct", value);
      })
    },
    trailers: {
      configurable: false,
      enumerable: false,
      get: createConstructableAccessor("get", 0, function() {
        return getCachedIncomingMessageValue(this, "_opencontainersTrailers", () => ({}));
      }),
      set: createConstructableAccessor("set", 1, function(value) {
        setCachedIncomingMessageValue(this, "_opencontainersTrailers", value);
      })
    },
    trailersDistinct: {
      configurable: false,
      enumerable: false,
      get: createConstructableAccessor("get", 0, function() {
        return getCachedIncomingMessageValue(this, "_opencontainersTrailersDistinct", () => distinctHeaderValues(this.rawTrailers, this.trailers));
      }),
      set: createConstructableAccessor("set", 1, function(value) {
        setCachedIncomingMessageValue(this, "_opencontainersTrailersDistinct", value);
      })
    },
    signal: {
      configurable: true,
      enumerable: false,
      get: createConstructableAccessor("get", 0, function() {
        this._opencontainersAbortController ??= new AbortController();
        return this._opencontainersAbortController.signal;
      })
    }
  });

  for (const [name, descriptor] of Object.entries(methodDescriptors)) {
    if (descriptor) Object.defineProperty(IncomingMessage.prototype, name, descriptor);
  }
}

function createMethodStyleAccessor(name, implementation) {
  const descriptor = Object.getOwnPropertyDescriptor({
    get value() {
      return implementation.call(this);
    },
    set value(input) {
      return implementation.call(this, input);
    }
  }, "value");
  const fn = name === "set" ? descriptor.set : descriptor.get;
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
  return fn;
}

function createConstructableAccessor(name, length, implementation) {
  const fn = function(...args) {
    return implementation.apply(this, args);
  };
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
  Object.defineProperty(fn, "length", {
    configurable: true,
    value: length
  });
  return fn;
}

function alignAgentPrototypeMetadata(AgentClass, names) {
  alignPrototypeMethodMetadata(AgentClass.prototype, names, { enumerable: true });
}

function alignPrototypeMethodMetadata(prototype, names, { enumerable } = {}) {
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) continue;
    if ("value" in descriptor) ensureFunctionOwnPrototype(descriptor.value);
    Object.defineProperty(prototype, name, {
      ...descriptor,
      ...(enumerable === undefined ? {} : { enumerable })
    });
  }
}

function ensureFunctionOwnPrototype(fn) {
  if (typeof fn !== "function" || Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    value: prototype,
    writable: true
  });
}

function setFunctionLength(fn, length) {
  Object.defineProperty(fn, "length", {
    configurable: true,
    value: length
  });
}

function nameAccessor(fn, name) {
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
  return fn;
}

function noopSocketErrorListener() {}

function noopSocketEventListener() {}

function createMissingAgentConnectArgsError() {
  return Object.assign(
    new TypeError('The "options" or "port" or "path" argument must be specified'),
    { code: "ERR_MISSING_ARGS" }
  );
}

function destroyAgentSocketPool(pool) {
  for (const sockets of Object.values(pool ?? {})) {
    if (!Array.isArray(sockets)) continue;
    for (const socket of sockets) socket?.destroy?.();
  }
}

function createAgentProbeSocket() {
  const socket = new EventEmitter();
  socket.writable = true;
  socket.destroyed = false;
  socket.connecting = false;
  socket.localAddress = "127.0.0.1";
  socket.localPort = 0;
  socket.remoteAddress = "127.0.0.1";
  socket.remotePort = 0;
  socket.setKeepAlive = function setKeepAlive() {
    return socket;
  };
  socket.setNoDelay = function setNoDelay() {
    return socket;
  };
  socket.setTimeout = function setTimeout() {
    return socket;
  };
  socket.ref = function ref() {
    return socket;
  };
  socket.unref = function unref() {
    return socket;
  };
  socket.write = function write() {
    return true;
  };
  socket.end = function end() {
    socket.emit("finish");
    return socket;
  };
  socket.destroy = function destroy() {
    socket.destroyed = true;
    socket.writable = false;
    socket.emit("close");
    return socket;
  };
  return socket;
}

function createVirtualRequestBodyStream() {
  const stream = new EventEmitter();
  let ended = false;
  stream.write = (chunk) => {
    if (ended) return false;
    stream.emit("data", chunk);
    return true;
  };
  stream.end = () => {
    if (ended) return;
    ended = true;
    stream.emit("end");
  };
  stream.destroy = (error) => {
    if (ended) return;
    ended = true;
    if (error) stream.emit("error", error);
    else stream.emit("end");
  };
  return stream;
}

function createClientRequestSocket(req, options, agent) {
  const socketOptions = createClientSocketOptions(req, options);
  const createConnection = typeof options.createConnection === "function"
    ? options.createConnection
    : (typeof agent?.createConnection === "function" ? agent.createConnection.bind(agent) : null);
  if (!createConnection) return createAgentProbeSocket();
  let callbackSocket;
  const callback = (error, socket) => {
    if (error) {
      queueMicrotask(() => {
        if (!req.destroyed) req.emit("error", error);
      });
      return;
    }
    callbackSocket = socket;
  };
  const returnedSocket = createConnection(socketOptions, callback);
  return returnedSocket ?? callbackSocket ?? createAgentProbeSocket();
}

function createClientSocketOptions(req, options) {
  return {
    ...options,
    host: req.host,
    hostname: req.host,
    port: req.port,
    protocol: req.protocol,
    path: req.path,
    method: req.method,
    headers: { ...req.headers }
  };
}

function formatAgentNameValue(value) {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatAgentNameValue).join(",");
  return String(value);
}

function removeSocketFromPool(pool, name, socket) {
  const sockets = pool?.[name];
  if (!Array.isArray(sockets)) return;
  const index = sockets.indexOf(socket);
  if (index !== -1) sockets.splice(index, 1);
  if (sockets.length === 0) delete pool[name];
}

function createServerClass({ kernel, process, secure }) {
  class Server extends HttpServer {
    constructor(options, requestListener) {
      let listener = requestListener;
      let serverOptions = options;
      if (typeof options === "function") {
        listener = options;
        serverOptions = {};
      }
      super({ kernel, process, listener, secure });
      this.options = serverOptions && typeof serverOptions === "object" ? serverOptions : {};
    }

    close() {
      return super.close(arguments[0]);
    }

    closeAllConnections() {}

    closeIdleConnections() {}

    setTimeout(timeout, callback) {
      return super.setTimeout(timeout, callback);
    }
  }
  alignPrototypeMethodMetadata(Server.prototype, ["close", "closeAllConnections", "closeIdleConnections", "setTimeout"], {
    enumerable: true
  });
  defineServerAsyncDispose(Server.prototype, {
    name: secure ? "" : "[Symbol.asyncDispose]"
  });
  if (secure) reorderPrototype(Server.prototype, [
    "constructor",
    "closeAllConnections",
    "closeIdleConnections",
    "setTimeout",
    "close"
  ]);
  return Server;
}

function defineServerAsyncDispose(prototype, { name }) {
  if (typeof Symbol.asyncDispose !== "symbol") return;
  const asyncDispose = async function() {
    if (!this.listening) throw createServerNotRunningError();
    await new Promise((resolve, reject) => {
      try {
        this.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  };
  Object.defineProperty(asyncDispose, "name", {
    configurable: true,
    value: name
  });
  Object.defineProperty(prototype, Symbol.asyncDispose, {
    value: asyncDispose,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function createServerNotRunningError() {
  return Object.assign(new Error("Server is not running."), {
    code: "ERR_SERVER_NOT_RUNNING"
  });
}

function reorderPrototype(prototype, names) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(prototype, name)])
    .filter(([, descriptor]) => descriptor);
  for (const [name] of descriptors) delete prototype[name];
  for (const [name, descriptor] of descriptors) Object.defineProperty(prototype, name, descriptor);
}

function validateHeaderName(name) {
  const value = String(name);
  if (typeof name !== "string" || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw Object.assign(new TypeError(`Header name must be a valid HTTP token ["${value}"]`), {
      code: "ERR_INVALID_HTTP_TOKEN"
    });
  }
}

function validateHeaderValue(name, value) {
  const headerName = String(name);
  if (value === undefined) {
    throw Object.assign(new TypeError(`Invalid value "undefined" for header "${headerName}"`), {
      code: "ERR_HTTP_INVALID_HEADER_VALUE"
    });
  }
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(`${item}`)) {
      throw Object.assign(new TypeError(`Invalid character in header content ["${headerName}"]`), {
        code: "ERR_INVALID_CHAR"
      });
    }
  }
}

const setMaxIdleHTTPParsers = (max) => {
  if (typeof max !== "number") {
    throw Object.assign(new TypeError(`The "max" argument must be of type number. Received ${max === undefined ? "undefined" : `type ${typeof max}`}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (!Number.isInteger(max)) {
    throw Object.assign(new RangeError(`The value of "max" is out of range. It must be an integer. Received ${max}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  if (max < 1 || max > Number.MAX_SAFE_INTEGER) {
    throw Object.assign(new RangeError(`The value of "max" is out of range. It must be >= 1 && <= ${Number.MAX_SAFE_INTEGER}. Received ${max}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
};

function setGlobalProxyFromEnv() {
  return () => {};
}

function getWebSocketClass() {
  if (typeof globalThis.WebSocket === "function") return globalThis.WebSocket;
  return class WebSocket {
    constructor() {
      throw Object.assign(new Error("WebSocket is unavailable in this runtime"), {
        code: "ERR_OPENCONTAINERS_WEBSOCKET_UNAVAILABLE"
      });
    }
  };
}

function getCloseEventClass() {
  if (typeof globalThis.CloseEvent === "function") return globalThis.CloseEvent;
  return class CloseEvent {
    constructor(type, eventInit = {}) {
      this.type = type;
      this.wasClean = Boolean(eventInit.wasClean);
      this.code = eventInit.code ?? 0;
      this.reason = eventInit.reason ?? "";
    }
  };
}

function getMessageEventClass() {
  if (typeof globalThis.MessageEvent === "function") return globalThis.MessageEvent;
  return class MessageEvent {
    constructor(type, eventInit = {}) {
      this.type = type;
      this.data = eventInit.data ?? null;
      this.origin = eventInit.origin ?? "";
      this.lastEventId = eventInit.lastEventId ?? "";
    }
  };
}

function dispatchServerRequest({ server, process, request }) {
  return new Promise((resolve) => {
    const req = new IncomingMessage(request);
    const res = new ServerResponse(resolve);
    try {
      server.emit("request", req, res);
    } catch (error) {
      reportVirtualError(process, error);
      if (!res.writableEnded) resolve(virtualServerErrorResponse(error));
    }
  });
}

function handleHttpSocketConnection({ server, process, socket, port }) {
  const chunks = [];

  const onData = (chunk) => {
    chunks.push(toBuffer(chunk));
    const buffered = RuntimeBuffer.concat(chunks);
    const headerEnd = findHttpHeaderEnd(buffered);
    if (headerEnd < 0) return;

    const headText = buffered.subarray(0, headerEnd).toString();
    const parsed = parseHttpRequestHead(headText);
    if (!parsed) {
      socket.off?.("data", onData);
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }

    const bodyStart = headerEnd + 4;
    const availableBody = buffered.subarray(bodyStart);
    const contentLength = Number(parsed.headers.get("content-length") ?? 0) || 0;
    const isUpgrade = isUpgradeRequest(parsed.headers);
    if (!isUpgrade && availableBody.byteLength < contentLength) return;

    socket.off?.("data", onData);
    const req = new IncomingMessage({
      method: parsed.method,
      url: parsed.url,
      headers: [...parsed.headers.entries()],
      body: contentLength ? availableBody.subarray(0, contentLength) : undefined,
      port
    });
    req.socket = socket;
    req.connection = socket;

    if (isUpgrade) {
      if (!server.listenerCount("upgrade")) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      try {
        server.emit("upgrade", req, socket, RuntimeBuffer.from(availableBody));
      } catch (error) {
        reportVirtualError(process, error);
        try {
          socket.end();
        } catch (_) {
          socket.destroy?.();
        }
      }
      return;
    }

    dispatchServerRequest({
      server,
      process,
      request: {
        method: parsed.method,
        url: parsed.url,
        headers: [...parsed.headers.entries()],
        body: contentLength ? availableBody.subarray(0, contentLength) : undefined,
        port
      }
    }).then((response) => {
      writeHttpSocketResponse(socket, response);
    }, (error) => {
      reportVirtualError(process, error);
      writeHttpSocketResponse(socket, virtualServerErrorResponse(error));
    });
  };

  socket.on("data", onData);
}

function createRequestFactory({ kernel, process, secureDefault, defaultAgent = globalAgent }) {
  return function request(...args) {
    const { options, callback } = normalizeRequestArgs(args, secureDefault);
    const resolvedDefaultAgent = typeof defaultAgent === "function" ? defaultAgent() : defaultAgent;
    return new ClientRequest({ kernel, process, secureDefault, options, callback, defaultAgent: resolvedDefaultAgent });
  };
}

function normalizeRequestArgs(args, secureDefault) {
  let options = {};
  let callback = args.find((arg) => typeof arg === "function");
  const first = args[0];
  const second = args[1];
  if (typeof first === "string" || first instanceof URL) {
    const url = new URL(first);
    options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      pathname: url.pathname,
      search: url.search
    };
    if (url.username || url.password) {
      options.auth = `${decodeUrlCredential(url.username)}:${decodeUrlCredential(url.password)}`;
    }
    if (first instanceof URL) copyEnumerableUrlRequestOptions(options, first);
    if (second && typeof second === "object") options = { ...options, ...second };
  } else if (first && typeof first === "object") {
    options = { ...first };
  }
  options.protocol ??= secureDefault ? "https:" : "http:";
  const expectedProtocol = secureDefault ? "https:" : "http:";
  if (options.protocol !== expectedProtocol) throw createInvalidProtocolError(options.protocol, expectedProtocol);
  options.hostname ??= options.host ?? "localhost";
  if (options.path !== undefined) {
    const path = String(options.path);
    validateRequestPath(path);
    options.pathname = path.split("?")[0] || "/";
    options.search = path.includes("?") ? `?${path.split("?").slice(1).join("?")}` : "";
  } else {
    options.pathname ??= "/";
    options.search ??= "";
  }
  options.method = normalizeRequestMethod(options.method);
  return { options, callback };
}

function copyEnumerableUrlRequestOptions(options, url) {
  for (const key of Reflect.ownKeys(url)) {
    if (Object.prototype.propertyIsEnumerable.call(url, key)) {
      options[key] = url[key];
    }
  }
}

function normalizeRequestMethod(method) {
  if (method === undefined || method === "") return "GET";
  if (typeof method !== "string") {
    throw Object.assign(new TypeError(`The "options.method" property must be of type string. Received ${formatReceivedValue(method)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  const normalized = method.toUpperCase();
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(normalized)) {
    throw Object.assign(new TypeError(`Method must be a valid HTTP token ["${method}"]`), {
      code: "ERR_INVALID_HTTP_TOKEN"
    });
  }
  return normalized;
}

function validateRequestPath(path) {
  if (/[\u0000-\u0020]/.test(path)) {
    throw Object.assign(new TypeError("Request path contains unescaped characters"), {
      code: "ERR_UNESCAPED_CHARACTERS"
    });
  }
}

function createInvalidProtocolError(protocol, expected) {
  return Object.assign(new TypeError(`Protocol "${String(protocol)}" not supported. Expected "${expected}"`), {
    code: "ERR_INVALID_PROTOCOL"
  });
}

function decodeUrlCredential(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatReceivedValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an instance of Array";
  return `type ${typeof value}${typeof value === "number" ? ` (${value})` : ""}`;
}

const SINGLE_VALUE_INCOMING_HEADERS = new Set([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "server",
  "user-agent"
]);

function normalizeHeaders(headers) {
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
}

function rawIncomingHeaderLines(headers) {
  const rawHeaders = [];
  for (const [name, rawValue] of headers) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) rawHeaders.push(String(name), String(value));
  }
  return rawHeaders;
}

function collectIncomingHeaders(headers) {
  const collected = {};
  for (const [name, rawValue] of headers) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) addIncomingHeaderLine(name, value, collected);
  }
  return collected;
}

function addIncomingHeaderLine(field, value, dest) {
  if (!dest) return;
  const name = String(field ?? "").toLowerCase();
  if (!name) return;
  const normalizedValue = String(value ?? "");
  if (name === "set-cookie") {
    if (dest[name] === undefined) {
      dest[name] = [normalizedValue];
    } else if (Array.isArray(dest[name])) {
      dest[name].push(normalizedValue);
    } else {
      dest[name] = [String(dest[name]), normalizedValue];
    }
    return;
  }
  if (dest[name] === undefined) {
    dest[name] = normalizedValue;
    return;
  }
  if (name === "cookie") {
    dest[name] = `${dest[name]}; ${normalizedValue}`;
    return;
  }
  if (SINGLE_VALUE_INCOMING_HEADERS.has(name)) return;
  dest[name] = `${dest[name]}, ${normalizedValue}`;
}

function addIncomingHeaderLineDistinct(field, value, dest) {
  if (!dest) return;
  const name = String(field ?? "").toLowerCase();
  if (!name) return;
  dest[name] ??= [];
  if (Array.isArray(dest[name])) {
    dest[name].push(String(value ?? ""));
  } else {
    dest[name] = [String(dest[name]), String(value ?? "")];
  }
}

function getCachedIncomingMessageValue(instance, key, createValue) {
  if (!Object.hasOwn(instance, key)) setCachedIncomingMessageValue(instance, key, createValue());
  return instance[key];
}

function setCachedIncomingMessageValue(instance, key, value) {
  Object.defineProperty(instance, key, {
    configurable: true,
    writable: true,
    value
  });
}

function normalizeTrailers(headers, rawHeaders) {
  const trailers = {};
  const rawTrailers = rawHeaders ? rawHeaders.map((value) => String(value)) : [];
  for (const [rawName, rawValue] of headerEntries(headers)) {
    const name = String(rawName);
    const lowerName = name.toLowerCase();
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    trailers[lowerName] = values.map((value) => String(value)).join(", ");
    if (!rawHeaders) {
      for (const value of values) rawTrailers.push(name, String(value));
    }
  }
  return { trailers, rawTrailers };
}

function distinctHeaderValues(rawHeaders, fallbackHeaders) {
  const distinct = Object.create(null);
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    for (let index = 0; index < rawHeaders.length; index += 2) {
      const name = String(rawHeaders[index] ?? "").toLowerCase();
      if (!name) continue;
      distinct[name] ??= [];
      distinct[name].push(String(rawHeaders[index + 1] ?? ""));
    }
    return distinct;
  }
  for (const [name, value] of headerEntries(fallbackHeaders)) {
    const lowerName = String(name).toLowerCase();
    const values = Array.isArray(value) ? value : [value];
    distinct[lowerName] = values.map((entry) => String(entry));
  }
  return distinct;
}

function headerEntries(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers);
}

function normalizeExternalResponseHeaders(headers) {
  const normalized = [];
  for (const [name, value] of headers.entries()) {
    const lowerName = String(name).toLowerCase();
    // Browser fetch exposes decoded response bytes while often preserving the
    // original transfer headers. Node clients such as npm then try to decode
    // the already-decoded payload or enforce the compressed byte length.
    if (lowerName === "content-encoding" || lowerName === "content-length") continue;
    normalized.push([lowerName, value]);
  }
  return normalized;
}

export function createBrowserExternalFetchOptions(url, { method = "GET", headers, body } = {}) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const options = {
    method: normalizedMethod,
    headers: normalizeBrowserExternalRequestHeaders(url, headers, normalizedMethod),
    credentials: "omit",
    redirect: "follow"
  };
  if (body !== undefined && normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    options.body = body;
  }
  return options;
}

function normalizeBrowserExternalRequestHeaders(url, headers, method) {
  if (!isNpmRegistryHost(url.hostname)) return headers ?? {};

  const normalized = [];
  for (const [rawName, rawValue] of requestHeaderEntries(headers)) {
    const name = String(rawName).toLowerCase();
    const value = String(rawValue);
    if (name === "accept" || name === "accept-language" || name === "content-language") {
      normalized.push([name, value]);
      continue;
    }
    if (name === "content-type" && method !== "GET" && method !== "HEAD" && isCorsSafelistedContentType(value)) {
      normalized.push([name, value]);
      continue;
    }
    if (name === "range" && isCorsSafelistedRange(value)) {
      normalized.push([name, value]);
    }
  }

  if (!normalized.some(([name]) => name === "accept")) {
    normalized.push(["accept", "*/*"]);
  }
  return normalized;
}

function requestHeaderEntries(headers) {
  if (!headers) return [];
  if (typeof Headers !== "undefined" && headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers.map(([name, value]) => [name, value]);
  return Object.entries(headers);
}

function isNpmRegistryHost(hostname) {
  return String(hostname || "").toLowerCase() === "registry.npmjs.org";
}

function isCorsSafelistedContentType(value) {
  const type = String(value || "").split(";")[0].trim().toLowerCase();
  return type === "application/x-www-form-urlencoded" || type === "multipart/form-data" || type === "text/plain";
}

function isCorsSafelistedRange(value) {
  return /^bytes=\d*-\d*$/i.test(String(value || "").trim());
}

function concatChunks(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function normalizeResponseBody(body) {
  if (!body) return undefined;
  if (body instanceof Uint8Array) return body;
  if (typeof body === "string") return new TextEncoder().encode(body);
  return new Uint8Array(body);
}

function normalizeIncomingMessageBody(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body.length ? body : null;
  const bytes = RuntimeBuffer.from(body);
  return bytes.byteLength ? bytes : null;
}

function incomingMessageBodyLength(body) {
  return typeof body === "string" ? RuntimeBuffer.byteLength(body) : body.byteLength;
}

function statusAllowsResponseBody(statusCode) {
  if (statusCode === undefined || statusCode === null) return true;
  const status = Number(statusCode);
  return !(status >= 100 && status < 200) && status !== 204 && status !== 304;
}

function toBuffer(chunk) {
  if (chunk instanceof Uint8Array) return RuntimeBuffer.from(chunk);
  return RuntimeBuffer.from(String(chunk));
}

function findHttpHeaderEnd(buffer) {
  for (let index = 0; index <= buffer.byteLength - 4; index++) {
    if (buffer[index] === 13 && buffer[index + 1] === 10 && buffer[index + 2] === 13 && buffer[index + 3] === 10) {
      return index;
    }
  }
  return -1;
}

function parseHttpRequestHead(text) {
  const lines = text.split("\r\n");
  const [method, url] = String(lines.shift() ?? "").split(/\s+/);
  if (!method || !url) return null;

  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(name)) headers.set(name, `${headers.get(name)}, ${value}`);
    else headers.set(name, value);
  }

  return { method, url, headers };
}

function isUpgradeRequest(headers) {
  const connection = headers.get("connection") ?? "";
  return Boolean(headers.get("upgrade")) && connection.toLowerCase().split(",").some((part) => part.trim() === "upgrade");
}

function writeHttpSocketResponse(socket, response) {
  const status = response.status ?? 200;
  const statusText = response.statusText ?? STATUS_CODES[status] ?? "OK";
  const body = statusAllowsResponseBody(status)
    ? normalizeResponseBody(response.body) ?? RuntimeBuffer.alloc(0)
    : RuntimeBuffer.alloc(0);
  const headers = new Map(response.headers ?? []);
  if (!headers.has("content-length")) headers.set("content-length", String(body.byteLength));
  if (!headers.has("connection")) headers.set("connection", "close");

  const headerText = [
    `HTTP/1.1 ${status} ${statusText}`,
    ...[...headers.entries()].map(([name, value]) => `${name}: ${value}`),
    "",
    ""
  ].join("\r\n");

  socket.write(headerText);
  if (body.byteLength) socket.write(body);
  socket.end();
}

function reportVirtualError(process, error) {
  try {
    process.stderr?.write?.(`${formatErrorForDiagnostics(error)}\n`);
  } catch (_) {
    // Diagnostics must never escape the virtual process boundary.
  }
  process.exitCode = 1;
}

function virtualServerErrorResponse(error) {
  const message = error?.message ?? String(error);
  return {
    status: 500,
    statusText: "Internal Server Error",
    headers: [
      ["content-type", "text/plain; charset=utf-8"],
      ["x-opencontainers-error", "unhandled-virtual-server-error"]
    ],
    body: new TextEncoder().encode(`Unhandled virtual server error: ${message}\n`)
  };
}

function formatErrorForDiagnostics(error) {
  return error?.stack ?? error?.message ?? String(error);
}

function isVirtualLocalhost(host) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(String(host));
}

function isDefaultPort(protocol, port) {
  return (protocol === "http:" && Number(port) === 80) || (protocol === "https:" && Number(port) === 443);
}

export function isExternalNetworkAllowed(kernel, process, url) {
  if (kernel.allowExternalNetwork === true) return true;
  const hostname = String(url.hostname || "").toLowerCase();
  return (process?.__opencontainersNetworkAllowlist ?? []).some((allowedHost) => {
    if (!allowedHost) return false;
    if (allowedHost.startsWith(".")) return hostname.endsWith(allowedHost);
    return hostname === allowedHost;
  });
}

function isHostPageOrigin(url) {
  const origin = globalThis.location?.origin;
  if (!origin || origin === "null") return false;
  try {
    return url.origin === new URL(origin).origin;
  } catch (_) {
    return false;
  }
}
