import { EventEmitter } from "./events.js";
import { RuntimeBuffer } from "./buffer.js";

export const constants = {
  NGHTTP2_ERR_FRAME_SIZE_ERROR: -522,
  NGHTTP2_SESSION_SERVER: 0,
  NGHTTP2_SESSION_CLIENT: 1,
  NGHTTP2_STREAM_STATE_IDLE: 1,
  NGHTTP2_STREAM_STATE_OPEN: 2,
  NGHTTP2_STREAM_STATE_RESERVED_LOCAL: 3,
  NGHTTP2_STREAM_STATE_RESERVED_REMOTE: 4,
  NGHTTP2_STREAM_STATE_HALF_CLOSED_LOCAL: 5,
  NGHTTP2_STREAM_STATE_HALF_CLOSED_REMOTE: 6,
  NGHTTP2_STREAM_STATE_CLOSED: 7,
  NGHTTP2_FLAG_NONE: 0,
  NGHTTP2_FLAG_END_STREAM: 1,
  NGHTTP2_FLAG_END_HEADERS: 4,
  NGHTTP2_FLAG_ACK: 1,
  NGHTTP2_FLAG_PADDED: 8,
  NGHTTP2_FLAG_PRIORITY: 32,
  DEFAULT_SETTINGS_HEADER_TABLE_SIZE: 4096,
  DEFAULT_SETTINGS_ENABLE_PUSH: 1,
  DEFAULT_SETTINGS_MAX_CONCURRENT_STREAMS: 4294967295,
  DEFAULT_SETTINGS_INITIAL_WINDOW_SIZE: 65535,
  DEFAULT_SETTINGS_MAX_FRAME_SIZE: 16384,
  DEFAULT_SETTINGS_MAX_HEADER_LIST_SIZE: 65535,
  DEFAULT_SETTINGS_ENABLE_CONNECT_PROTOCOL: 0,
  MAX_MAX_FRAME_SIZE: 16777215,
  MIN_MAX_FRAME_SIZE: 16384,
  MAX_INITIAL_WINDOW_SIZE: 2147483647,
  NGHTTP2_SETTINGS_HEADER_TABLE_SIZE: 1,
  NGHTTP2_SETTINGS_ENABLE_PUSH: 2,
  NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS: 3,
  NGHTTP2_SETTINGS_INITIAL_WINDOW_SIZE: 4,
  NGHTTP2_SETTINGS_MAX_FRAME_SIZE: 5,
  NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE: 6,
  NGHTTP2_SETTINGS_ENABLE_CONNECT_PROTOCOL: 8,
  PADDING_STRATEGY_NONE: 0,
  PADDING_STRATEGY_ALIGNED: 1,
  PADDING_STRATEGY_MAX: 2,
  PADDING_STRATEGY_CALLBACK: 1,
  NGHTTP2_NO_ERROR: 0,
  NGHTTP2_PROTOCOL_ERROR: 1,
  NGHTTP2_INTERNAL_ERROR: 2,
  NGHTTP2_FLOW_CONTROL_ERROR: 3,
  NGHTTP2_SETTINGS_TIMEOUT: 4,
  NGHTTP2_STREAM_CLOSED: 5,
  NGHTTP2_FRAME_SIZE_ERROR: 6,
  NGHTTP2_REFUSED_STREAM: 7,
  NGHTTP2_CANCEL: 8,
  NGHTTP2_COMPRESSION_ERROR: 9,
  NGHTTP2_CONNECT_ERROR: 10,
  NGHTTP2_ENHANCE_YOUR_CALM: 11,
  NGHTTP2_INADEQUATE_SECURITY: 12,
  NGHTTP2_HTTP_1_1_REQUIRED: 13,
  NGHTTP2_DEFAULT_WEIGHT: 16,
  HTTP2_HEADER_STATUS: ":status",
  HTTP2_HEADER_METHOD: ":method",
  HTTP2_HEADER_AUTHORITY: ":authority",
  HTTP2_HEADER_SCHEME: ":scheme",
  HTTP2_HEADER_PATH: ":path",
  HTTP2_HEADER_PROTOCOL: ":protocol",
  HTTP2_HEADER_ACCEPT_ENCODING: "accept-encoding",
  HTTP2_HEADER_ACCEPT_LANGUAGE: "accept-language",
  HTTP2_HEADER_ACCEPT_RANGES: "accept-ranges",
  HTTP2_HEADER_ACCEPT: "accept",
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS: "access-control-allow-credentials",
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS: "access-control-allow-headers",
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS: "access-control-allow-methods",
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN: "access-control-allow-origin",
  HTTP2_HEADER_ACCESS_CONTROL_EXPOSE_HEADERS: "access-control-expose-headers",
  HTTP2_HEADER_ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers",
  HTTP2_HEADER_ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method",
  HTTP2_HEADER_AGE: "age",
  HTTP2_HEADER_AUTHORIZATION: "authorization",
  HTTP2_HEADER_CACHE_CONTROL: "cache-control",
  HTTP2_HEADER_CONNECTION: "connection",
  HTTP2_HEADER_CONTENT_DISPOSITION: "content-disposition",
  HTTP2_HEADER_CONTENT_ENCODING: "content-encoding",
  HTTP2_HEADER_CONTENT_LENGTH: "content-length",
  HTTP2_HEADER_CONTENT_TYPE: "content-type",
  HTTP2_HEADER_COOKIE: "cookie",
  HTTP2_HEADER_DATE: "date",
  HTTP2_HEADER_ETAG: "etag",
  HTTP2_HEADER_FORWARDED: "forwarded",
  HTTP2_HEADER_HOST: "host",
  HTTP2_HEADER_IF_MODIFIED_SINCE: "if-modified-since",
  HTTP2_HEADER_IF_NONE_MATCH: "if-none-match",
  HTTP2_HEADER_IF_RANGE: "if-range",
  HTTP2_HEADER_LAST_MODIFIED: "last-modified",
  HTTP2_HEADER_LINK: "link",
  HTTP2_HEADER_LOCATION: "location",
  HTTP2_HEADER_RANGE: "range",
  HTTP2_HEADER_REFERER: "referer",
  HTTP2_HEADER_SERVER: "server",
  HTTP2_HEADER_SET_COOKIE: "set-cookie",
  HTTP2_HEADER_STRICT_TRANSPORT_SECURITY: "strict-transport-security",
  HTTP2_HEADER_TRANSFER_ENCODING: "transfer-encoding",
  HTTP2_HEADER_TE: "te",
  HTTP2_HEADER_UPGRADE_INSECURE_REQUESTS: "upgrade-insecure-requests",
  HTTP2_HEADER_UPGRADE: "upgrade",
  HTTP2_HEADER_USER_AGENT: "user-agent",
  HTTP2_HEADER_VARY: "vary",
  HTTP2_HEADER_X_CONTENT_TYPE_OPTIONS: "x-content-type-options",
  HTTP2_HEADER_X_FRAME_OPTIONS: "x-frame-options",
  HTTP2_HEADER_KEEP_ALIVE: "keep-alive",
  HTTP2_HEADER_PROXY_CONNECTION: "proxy-connection",
  HTTP2_HEADER_X_XSS_PROTECTION: "x-xss-protection",
  HTTP2_HEADER_ALT_SVC: "alt-svc",
  HTTP2_HEADER_CONTENT_SECURITY_POLICY: "content-security-policy",
  HTTP2_HEADER_EARLY_DATA: "early-data",
  HTTP2_HEADER_EXPECT_CT: "expect-ct",
  HTTP2_HEADER_ORIGIN: "origin",
  HTTP2_HEADER_PURPOSE: "purpose",
  HTTP2_HEADER_TIMING_ALLOW_ORIGIN: "timing-allow-origin",
  HTTP2_HEADER_X_FORWARDED_FOR: "x-forwarded-for",
  HTTP2_HEADER_PRIORITY: "priority",
  HTTP2_HEADER_ACCEPT_CHARSET: "accept-charset",
  HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE: "access-control-max-age",
  HTTP2_HEADER_ALLOW: "allow",
  HTTP2_HEADER_CONTENT_LANGUAGE: "content-language",
  HTTP2_HEADER_CONTENT_LOCATION: "content-location",
  HTTP2_HEADER_CONTENT_MD5: "content-md5",
  HTTP2_HEADER_CONTENT_RANGE: "content-range",
  HTTP2_HEADER_DNT: "dnt",
  HTTP2_HEADER_EXPECT: "expect",
  HTTP2_HEADER_EXPIRES: "expires",
  HTTP2_HEADER_FROM: "from",
  HTTP2_HEADER_IF_MATCH: "if-match",
  HTTP2_HEADER_IF_UNMODIFIED_SINCE: "if-unmodified-since",
  HTTP2_HEADER_MAX_FORWARDS: "max-forwards",
  HTTP2_HEADER_PREFER: "prefer",
  HTTP2_HEADER_PROXY_AUTHENTICATE: "proxy-authenticate",
  HTTP2_HEADER_PROXY_AUTHORIZATION: "proxy-authorization",
  HTTP2_HEADER_REFRESH: "refresh",
  HTTP2_HEADER_RETRY_AFTER: "retry-after",
  HTTP2_HEADER_TRAILER: "trailer",
  HTTP2_HEADER_TK: "tk",
  HTTP2_HEADER_VIA: "via",
  HTTP2_HEADER_WARNING: "warning",
  HTTP2_HEADER_WWW_AUTHENTICATE: "www-authenticate",
  HTTP2_HEADER_HTTP2_SETTINGS: "http2-settings",
  HTTP2_METHOD_ACL: "ACL",
  HTTP2_METHOD_BASELINE_CONTROL: "BASELINE-CONTROL",
  HTTP2_METHOD_BIND: "BIND",
  HTTP2_METHOD_CHECKIN: "CHECKIN",
  HTTP2_METHOD_CHECKOUT: "CHECKOUT",
  HTTP2_METHOD_CONNECT: "CONNECT",
  HTTP2_METHOD_COPY: "COPY",
  HTTP2_METHOD_DELETE: "DELETE",
  HTTP2_METHOD_GET: "GET",
  HTTP2_METHOD_HEAD: "HEAD",
  HTTP2_METHOD_LABEL: "LABEL",
  HTTP2_METHOD_LINK: "LINK",
  HTTP2_METHOD_LOCK: "LOCK",
  HTTP2_METHOD_MERGE: "MERGE",
  HTTP2_METHOD_MKACTIVITY: "MKACTIVITY",
  HTTP2_METHOD_MKCALENDAR: "MKCALENDAR",
  HTTP2_METHOD_MKCOL: "MKCOL",
  HTTP2_METHOD_MKREDIRECTREF: "MKREDIRECTREF",
  HTTP2_METHOD_MKWORKSPACE: "MKWORKSPACE",
  HTTP2_METHOD_MOVE: "MOVE",
  HTTP2_METHOD_OPTIONS: "OPTIONS",
  HTTP2_METHOD_ORDERPATCH: "ORDERPATCH",
  HTTP2_METHOD_PATCH: "PATCH",
  HTTP2_METHOD_POST: "POST",
  HTTP2_METHOD_PRI: "PRI",
  HTTP2_METHOD_PROPFIND: "PROPFIND",
  HTTP2_METHOD_PROPPATCH: "PROPPATCH",
  HTTP2_METHOD_PUT: "PUT",
  HTTP2_METHOD_REBIND: "REBIND",
  HTTP2_METHOD_REPORT: "REPORT",
  HTTP2_METHOD_SEARCH: "SEARCH",
  HTTP2_METHOD_TRACE: "TRACE",
  HTTP2_METHOD_UNBIND: "UNBIND",
  HTTP2_METHOD_UNCHECKOUT: "UNCHECKOUT",
  HTTP2_METHOD_UNLINK: "UNLINK",
  HTTP2_METHOD_UNLOCK: "UNLOCK",
  HTTP2_METHOD_UPDATE: "UPDATE",
  HTTP2_METHOD_UPDATEREDIRECTREF: "UPDATEREDIRECTREF",
  HTTP2_METHOD_VERSION_CONTROL: "VERSION-CONTROL",
  HTTP_STATUS_CONTINUE: 100,
  HTTP_STATUS_SWITCHING_PROTOCOLS: 101,
  HTTP_STATUS_PROCESSING: 102,
  HTTP_STATUS_EARLY_HINTS: 103,
  HTTP_STATUS_OK: 200,
  HTTP_STATUS_CREATED: 201,
  HTTP_STATUS_ACCEPTED: 202,
  HTTP_STATUS_NON_AUTHORITATIVE_INFORMATION: 203,
  HTTP_STATUS_NO_CONTENT: 204,
  HTTP_STATUS_RESET_CONTENT: 205,
  HTTP_STATUS_PARTIAL_CONTENT: 206,
  HTTP_STATUS_MULTI_STATUS: 207,
  HTTP_STATUS_ALREADY_REPORTED: 208,
  HTTP_STATUS_IM_USED: 226,
  HTTP_STATUS_MULTIPLE_CHOICES: 300,
  HTTP_STATUS_MOVED_PERMANENTLY: 301,
  HTTP_STATUS_FOUND: 302,
  HTTP_STATUS_SEE_OTHER: 303,
  HTTP_STATUS_NOT_MODIFIED: 304,
  HTTP_STATUS_USE_PROXY: 305,
  HTTP_STATUS_TEMPORARY_REDIRECT: 307,
  HTTP_STATUS_PERMANENT_REDIRECT: 308,
  HTTP_STATUS_BAD_REQUEST: 400,
  HTTP_STATUS_UNAUTHORIZED: 401,
  HTTP_STATUS_PAYMENT_REQUIRED: 402,
  HTTP_STATUS_FORBIDDEN: 403,
  HTTP_STATUS_NOT_FOUND: 404,
  HTTP_STATUS_METHOD_NOT_ALLOWED: 405,
  HTTP_STATUS_NOT_ACCEPTABLE: 406,
  HTTP_STATUS_PROXY_AUTHENTICATION_REQUIRED: 407,
  HTTP_STATUS_REQUEST_TIMEOUT: 408,
  HTTP_STATUS_CONFLICT: 409,
  HTTP_STATUS_GONE: 410,
  HTTP_STATUS_LENGTH_REQUIRED: 411,
  HTTP_STATUS_PRECONDITION_FAILED: 412,
  HTTP_STATUS_PAYLOAD_TOO_LARGE: 413,
  HTTP_STATUS_URI_TOO_LONG: 414,
  HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE: 415,
  HTTP_STATUS_RANGE_NOT_SATISFIABLE: 416,
  HTTP_STATUS_EXPECTATION_FAILED: 417,
  HTTP_STATUS_TEAPOT: 418,
  HTTP_STATUS_MISDIRECTED_REQUEST: 421,
  HTTP_STATUS_UNPROCESSABLE_ENTITY: 422,
  HTTP_STATUS_LOCKED: 423,
  HTTP_STATUS_FAILED_DEPENDENCY: 424,
  HTTP_STATUS_TOO_EARLY: 425,
  HTTP_STATUS_UPGRADE_REQUIRED: 426,
  HTTP_STATUS_PRECONDITION_REQUIRED: 428,
  HTTP_STATUS_TOO_MANY_REQUESTS: 429,
  HTTP_STATUS_REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  HTTP_STATUS_UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  HTTP_STATUS_INTERNAL_SERVER_ERROR: 500,
  HTTP_STATUS_NOT_IMPLEMENTED: 501,
  HTTP_STATUS_BAD_GATEWAY: 502,
  HTTP_STATUS_SERVICE_UNAVAILABLE: 503,
  HTTP_STATUS_GATEWAY_TIMEOUT: 504,
  HTTP_STATUS_HTTP_VERSION_NOT_SUPPORTED: 505,
  HTTP_STATUS_VARIANT_ALSO_NEGOTIATES: 506,
  HTTP_STATUS_INSUFFICIENT_STORAGE: 507,
  HTTP_STATUS_LOOP_DETECTED: 508,
  HTTP_STATUS_BANDWIDTH_LIMIT_EXCEEDED: 509,
  HTTP_STATUS_NOT_EXTENDED: 510,
  HTTP_STATUS_NETWORK_AUTHENTICATION_REQUIRED: 511
};

export const sensitiveHeaders = Symbol("sensitiveHeaders");

let nextStreamId = 1;

export function createHttp2Builtin({ kernel, process }) {
  const responseSetHeaderSymbol = Symbol("setHeader");
  const responseAppendHeaderSymbol = Symbol("appendHeader");
  const responseBeginSendSymbol = Symbol("begin-send");

  class Http2Server extends EventEmitter {
    constructor(optionsOrListener, maybeListener) {
      super();
      this.timeout = 0;
      this.listening = false;
      this.#options = typeof optionsOrListener === "object" && optionsOrListener !== null ? optionsOrListener : {};
      const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
      if (listener) {
        this.on("request", listener);
        this.on("stream", noopStreamListener);
      }
    }

    #options;
    #address = null;

    listen(...args) {
      const options = normalizeListenArgs(args);
      const projectId = process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
      const assignedPort = kernel.listenHttp2({
        projectId,
        pid: process.pid,
        port: options.port,
        host: options.host,
        server: this
      });
      this.#address = {
        address: options.host === "0.0.0.0" ? "127.0.0.1" : options.host,
        family: "IPv4",
        port: assignedPort
      };
      this.listening = true;
      options.callback?.();
      this.emit("listening");
      return this;
    }

    close(callback) {
      if (this.#address) {
        kernel.closeHttp2({
          projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
          pid: process.pid,
          port: this.#address.port,
          server: this
        });
      }
      this.listening = false;
      this.#address = null;
      callback?.();
      this.emit("close");
      return this;
    }

    address() {
      return this.#address;
    }

    setTimeout(milliseconds, callback) {
      this.timeout = Number(milliseconds) || 0;
      if (callback) this.on("timeout", callback);
      return this;
    }

    _opencontainersDispatch({ clientSession, headers }) {
      const serverStream = new Http2Stream({ session: null, side: "server" });
      const clientStream = new Http2Stream({ session: clientSession, side: "client" });
      serverStream._opencontainersPair(clientStream);
      clientStream._opencontainersPair(serverStream);
      serverStream._opencontainersRequestHeaders = headers;
      queueMicrotask(() => {
        try {
          if (this.listenerCount("request") > 0) {
            const request = new Http2ServerRequest(serverStream, headers, {}, rawHeadersFromHeaders(headers));
            const response = new Http2ServerResponse(serverStream, {});
            this.emit("request", request, response);
          }
          this.emit("stream", serverStream, headers, 0);
        } catch (error) {
          reportVirtualError(process, error);
          serverStream.respond({ [constants.HTTP2_HEADER_STATUS]: 500 });
          serverStream.end(error?.message ?? String(error));
        }
      });
      return clientStream;
    }
  }

  class ClientHttp2Session extends EventEmitter {
    constructor(authority, server) {
      super();
      this.authority = authority.href;
      this.originSet = [authority.origin];
      this.alpnProtocol = "h2c";
      this.closed = false;
      this.destroyed = false;
      this.connecting = false;
      this.encrypted = false;
      this.socket = null;
      this.#server = server;
      process.__opencontainersAddRef?.();
      queueMicrotask(() => {
        this.emit("connect", this, null);
        this.emit("remoteSettings", getDefaultSettings());
      });
    }

    #server;
    #unrefQueued = false;

    request(headers = {}, options = {}) {
      if (this.closed || this.destroyed) {
        throw Object.assign(new Error("The HTTP/2 session has been closed"), { code: "ERR_HTTP2_INVALID_SESSION" });
      }
      const normalized = normalizeRequestHeaders(headers, this.authority);
      const stream = this.#server._opencontainersDispatch({
        clientSession: this,
        headers: normalized,
        options
      });
      this.emit("stream", stream, normalized);
      return stream;
    }

    close(callback) {
      if (this.closed) {
        callback?.();
        return this;
      }
      this.closed = true;
      callback?.();
      this.emit("close");
      this.#queueUnref();
      return this;
    }

    destroy(error) {
      if (this.destroyed) return this;
      this.destroyed = true;
      if (error) this.emit("error", error);
      return this.close();
    }

    setTimeout(_milliseconds, callback) {
      if (callback) this.on("timeout", callback);
      return this;
    }

    ping(payloadOrCallback, maybeCallback) {
      const callback = typeof payloadOrCallback === "function" ? payloadOrCallback : maybeCallback;
      queueMicrotask(() => callback?.(null, 0, RuntimeBuffer.from(payloadOrCallback && typeof payloadOrCallback !== "function" ? payloadOrCallback : "")));
      return true;
    }

    ref() {
      return this;
    }

    unref() {
      return this;
    }

    #queueUnref() {
      if (this.#unrefQueued) return;
      this.#unrefQueued = true;
      queueMicrotask(() => process.__opencontainersUnref?.());
    }
  }

  class Http2ServerRequest extends EventEmitter {
    constructor(stream, headers, options, rawHeaders) {
      super();
      this.#stream = stream;
      this.#headers = headers ?? {};
      this.#options = options ?? {};
      this.#rawHeaders = rawHeaders ?? [];
      this.#method = String(this.#headers[constants.HTTP2_HEADER_METHOD] ?? constants.HTTP2_METHOD_GET);
      this.#url = String(this.#headers[constants.HTTP2_HEADER_PATH] ?? "/");
      this.#authority = this.#headers[constants.HTTP2_HEADER_AUTHORITY];
      this.#scheme = this.#headers[constants.HTTP2_HEADER_SCHEME];
      this.#socket = stream.session?.socket ?? null;
      stream.on("data", (chunk) => this.emit("data", chunk));
      stream.on("end", () => {
        this.#complete = true;
        this.emit("end");
      });
      stream.on("close", () => this.emit("close"));
      stream.on("error", (error) => this.emit("error", error));
    }

    #stream;
    #headers;
    #options;
    #rawHeaders;
    #trailers = {};
    #rawTrailers = [];
    #method;
    #url;
    #authority;
    #scheme;
    #socket;
    #complete = false;
    #aborted = false;

    get aborted() {
      return this.#aborted;
    }

    get complete() {
      return this.#complete;
    }

    get stream() {
      return this.#stream;
    }

    get headers() {
      return this.#headers;
    }

    get rawHeaders() {
      return this.#rawHeaders;
    }

    get trailers() {
      return this.#trailers;
    }

    get rawTrailers() {
      return this.#rawTrailers;
    }

    get httpVersionMajor() {
      return 2;
    }

    get httpVersionMinor() {
      return 0;
    }

    get httpVersion() {
      return "2.0";
    }

    get socket() {
      return this.#socket;
    }

    get connection() {
      return this.socket;
    }

    _read(size) {}

    get method() {
      return this.#method;
    }

    set method(value) {
      this.#method = String(value);
    }

    get authority() {
      return this.#authority;
    }

    get scheme() {
      return this.#scheme;
    }

    get url() {
      return this.#url;
    }

    set url(value) {
      this.#url = String(value);
    }

    setTimeout(milliseconds, callback) {
      this.stream.setTimeout(milliseconds, callback);
      return this;
    }
  }

  const http2ServerRequestReadablePrototype = Object.create(EventEmitter.prototype, {
    setEncoding: {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function setEncoding(encoding) {
        this.stream.setEncoding(encoding);
        return this;
      }
    },
    pause: {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function pause() {
        this.stream.pause();
        return this;
      }
    },
    resume: {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function resume() {
        this.stream.resume();
        return this;
      }
    },
    destroy: {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function destroy(error) {
        this.stream.destroy(error);
        return this;
      }
    }
  });
  Object.setPrototypeOf(Http2ServerRequest.prototype, http2ServerRequestReadablePrototype);

  class Http2ServerResponse extends EventEmitter {
    constructor(stream, options) {
      super();
      this.#stream = stream;
      this.#options = options ?? {};
      this.#statusCode = constants.HTTP_STATUS_OK;
      this.#statusMessage = "";
      this.#sendDate = true;
      this.#socket = stream.session?.socket ?? null;
      this.#headers = new Map();
    }

    #stream;
    #options;
    #headers;
    #trailers = new Map();
    #statusCode;
    #statusMessage;
    #sendDate;
    #socket;
    #writableCorked = 0;

    get _header() {
      return this.headersSent ? "" : null;
    }

    get writableEnded() {
      return this.stream.writableEnded;
    }

    get finished() {
      return this.stream.writableEnded;
    }

    get socket() {
      return this.#socket;
    }

    get connection() {
      return this.socket;
    }

    get stream() {
      return this.#stream;
    }

    get headersSent() {
      return this.stream.headersSent;
    }

    get sendDate() {
      return this.#sendDate;
    }

    set sendDate(value) {
      this.#sendDate = Boolean(value);
    }

    get statusCode() {
      return this.#statusCode;
    }

    set statusCode(value) {
      this.#statusCode = Number(value) || constants.HTTP_STATUS_OK;
    }

    get writableCorked() {
      return this.#writableCorked;
    }

    get writableHighWaterMark() {
      return 16384;
    }

    get writableObjectMode() {
      return false;
    }

    get writableFinished() {
      return this.stream.writableEnded;
    }

    get writableLength() {
      return 0;
    }

    get writableNeedDrain() {
      return false;
    }

    setTrailer(name, value) {
      this.#trailers.set(String(name).toLowerCase(), value);
    }

    addTrailers(headers) {
      if (!headers || typeof headers !== "object") return;
      for (const [name, value] of Object.entries(headers)) this.setTrailer(name, value);
    }

    getHeader(name) {
      return this.#headers.get(String(name).toLowerCase());
    }

    getHeaderNames() {
      return [...this.#headers.keys()];
    }

    getHeaders() {
      return Object.fromEntries(this.#headers);
    }

    hasHeader(name) {
      return this.#headers.has(String(name).toLowerCase());
    }

    removeHeader(name) {
      this.#headers.delete(String(name).toLowerCase());
    }

    setHeader(name, value) {
      this.#headers.set(String(name).toLowerCase(), value);
      return this;
    }

    [responseSetHeaderSymbol](name, value) {
      return this.setHeader(name, value);
    }

    appendHeader(name, value) {
      const normalized = String(name).toLowerCase();
      const current = this.#headers.get(normalized);
      if (current === undefined) {
        this.#headers.set(normalized, value);
      } else if (Array.isArray(current)) {
        current.push(value);
      } else {
        this.#headers.set(normalized, [current, value]);
      }
      return this;
    }

    [responseAppendHeaderSymbol](name, value) {
      return this.appendHeader(name, value);
    }

    get statusMessage() {
      return this.#statusMessage;
    }

    set statusMessage(value) {
      this.#statusMessage = String(value);
    }

    flushHeaders() {
      this.#sendHeaders();
    }

    [responseBeginSendSymbol]() {
      this.#sendHeaders();
    }

    writeHead(statusCode, statusMessageOrHeaders, maybeHeaders) {
      this.statusCode = Number(statusCode) || this.statusCode;
      if (typeof statusMessageOrHeaders === "string") {
        this.statusMessage = statusMessageOrHeaders;
        this.#mergeHeaders(maybeHeaders);
      } else {
        this.#mergeHeaders(statusMessageOrHeaders);
      }
      this.#sendHeaders();
      return this;
    }

    cork() {
      this.#writableCorked += 1;
    }

    uncork() {
      if (this.#writableCorked > 0) this.#writableCorked -= 1;
    }

    write(chunk, encoding, callback) {
      if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      this.#sendHeaders();
      return this.stream.write(chunk, encoding, callback);
    }

    end(chunk, encoding, callback) {
      if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      this.#sendHeaders();
      this.stream.end(chunk, encoding, callback);
      return this;
    }

    destroy(error) {
      this.stream.destroy(error);
      return this;
    }

    setTimeout(milliseconds, callback) {
      this.stream.setTimeout(milliseconds, callback);
      return this;
    }

    createPushResponse(headers, callback) {
      throw unsupportedHttp2("createPushResponse");
    }

    writeInformation(statusCode, headers) {
      const normalized = normalizeResponseHeaders(headers);
      normalized[constants.HTTP2_HEADER_STATUS] = Number(statusCode) || constants.HTTP_STATUS_CONTINUE;
      this.stream.additionalHeaders(normalized);
    }

    writeContinue() {
      this.writeInformation(constants.HTTP_STATUS_CONTINUE, {});
    }

    writeEarlyHints(hints) {
      this.writeInformation(constants.HTTP_STATUS_EARLY_HINTS, hints ?? {});
    }

    #mergeHeaders(headers) {
      if (!headers || typeof headers !== "object") return;
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    }

    #sendHeaders() {
      if (this.stream.headersSent) return;
      const headers = Object.fromEntries(this.#headers);
      headers[constants.HTTP2_HEADER_STATUS] = this.statusCode;
      this.stream.respond(headers);
    }
  }

  function connect(authority, optionsOrListener, maybeListener) {
    const { url, listener } = normalizeConnectArgs(authority, optionsOrListener, maybeListener);
    if (url.protocol === "https:") throw unsupportedHttp2("secure client sessions");
    if (url.protocol !== "http:") throw unsupportedHttp2(`protocol ${url.protocol}`);
    const projectId = process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
    const server = kernel.connectHttp2({
      projectId,
      port: Number(url.port || 80),
      host: url.hostname || "localhost"
    });
    const session = new ClientHttp2Session(url, server);
    if (listener) session.once("connect", listener);
    return session;
  }

  function createServer(optionsOrListener, maybeListener) {
    return new Http2Server(optionsOrListener, maybeListener);
  }

  function createSecureServer(options, onRequestHandler) {
    throw unsupportedHttp2("createSecureServer");
  }

  function performServerHandshake(_stream) {
    throw unsupportedHttp2("performServerHandshake");
  }

  const builtin = {
    connect,
    constants,
    createServer,
    createSecureServer,
    getDefaultSettings,
    getPackedSettings,
    getUnpackedSettings,
    performServerHandshake,
    sensitiveHeaders,
    Http2ServerRequest,
    Http2ServerResponse
  };
  return builtin;
}

class Http2Stream extends EventEmitter {
  constructor({ session, side }) {
    super();
    this.id = nextStreamId;
    nextStreamId += 2;
    this.session = session;
    this.side = side;
    this.closed = false;
    this.destroyed = false;
    this.headersSent = false;
    this.rstCode = constants.NGHTTP2_NO_ERROR;
    this.sentHeaders = null;
    this.writable = true;
    this.readable = true;
    this.writableEnded = false;
    this.readableEnded = false;
  }

  #peer;
  #encoding = null;

  _opencontainersPair(peer) {
    this.#peer = peer;
  }

  respond(headers = {}, options = {}) {
    if (this.side !== "server") {
      throw Object.assign(new Error("respond is only valid on server HTTP/2 streams"), { code: "ERR_HTTP2_INVALID_STREAM" });
    }
    this.headersSent = true;
    this.sentHeaders = normalizeResponseHeaders(headers);
    queueMicrotask(() => {
      this.#peer?._opencontainersEmitResponse(this.sentHeaders, options);
    });
  }

  additionalHeaders(headers = {}) {
    queueMicrotask(() => {
      this.#peer?.emit("headers", normalizeResponseHeaders(headers), 0);
    });
  }

  write(chunk, encoding, callback) {
    if (this.destroyed || this.writableEnded) {
      const error = Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
      callback?.(error);
      this.emit("error", error);
      return false;
    }
    const payload = normalizeChunk(chunk, encoding);
    queueMicrotask(() => {
      this.#peer?._opencontainersReceive(payload);
      callback?.();
    });
    return true;
  }

  end(chunk, encoding, callback) {
    if (chunk !== undefined) this.write(chunk, encoding);
    this.writableEnded = true;
    queueMicrotask(() => {
      this.emit("finish");
      this.#peer?._opencontainersEnd();
      callback?.();
    });
    return this;
  }

  setEncoding(encoding) {
    this.#encoding = encoding;
    return this;
  }

  close(code = constants.NGHTTP2_NO_ERROR, callback) {
    this.rstCode = code;
    this.destroyed = true;
    this.closed = true;
    callback?.();
    this.emit("close");
    this.#peer?._opencontainersEnd();
    return this;
  }

  destroy(error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.closed = true;
    if (error) this.emit("error", error);
    this.emit("close");
    this.#peer?._opencontainersEnd();
    return this;
  }

  pause() {
    return this;
  }

  resume() {
    return this;
  }

  priority() {
    return this;
  }

  setTimeout(_milliseconds, callback) {
    if (callback) this.on("timeout", callback);
    return this;
  }

  _opencontainersEmitResponse(headers, flags = 0) {
    this.emit("response", headers, flags);
  }

  _opencontainersReceive(payload) {
    if (this.destroyed || this.readableEnded) return;
    const data = this.#encoding ? RuntimeBuffer.from(payload).toString(this.#encoding) : payload;
    this.emit("data", data);
  }

  _opencontainersEnd() {
    if (this.readableEnded) return;
    this.readableEnded = true;
    this.emit("end");
    this.closed = true;
    this.emit("close");
  }
}

function normalizeListenArgs(args) {
  let port = 0;
  let host = "0.0.0.0";
  let callback;
  if (typeof args[0] === "object" && args[0] !== null) {
    port = args[0].port ?? 0;
    host = args[0].host ?? host;
    callback = args[1];
  } else {
    port = args[0] ?? 0;
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: Number(port), host, callback };
}

function normalizeConnectArgs(authority, optionsOrListener, maybeListener) {
  const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
  const url = authority instanceof URL ? new URL(authority.href) : new URL(String(authority));
  return { url, listener };
}

function normalizeHttp2StreamConstructorOptions(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "side")) return value;
  return { session: null, side: "server" };
}

function rawHeadersFromHeaders(headers) {
  const rawHeaders = [];
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (String(name).startsWith(":")) continue;
    if (Array.isArray(value)) {
      for (const item of value) rawHeaders.push(name, String(item));
    } else {
      rawHeaders.push(name, String(value));
    }
  }
  return rawHeaders;
}

function normalizeRequestHeaders(headers, authority) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    normalized[String(name).toLowerCase()] = value;
  }
  const url = new URL(authority);
  normalized[constants.HTTP2_HEADER_METHOD] ??= constants.HTTP2_METHOD_GET;
  normalized[constants.HTTP2_HEADER_PATH] ??= "/";
  normalized[constants.HTTP2_HEADER_SCHEME] ??= url.protocol.replace(":", "");
  normalized[constants.HTTP2_HEADER_AUTHORITY] ??= url.host;
  return normalized;
}

function normalizeResponseHeaders(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    normalized[String(name).toLowerCase()] = value;
  }
  normalized[constants.HTTP2_HEADER_STATUS] ??= constants.HTTP_STATUS_OK;
  return normalized;
}

function normalizeChunk(chunk, encoding) {
  if (chunk instanceof Uint8Array) return RuntimeBuffer.from(chunk);
  if (chunk instanceof ArrayBuffer) return RuntimeBuffer.from(new Uint8Array(chunk));
  return RuntimeBuffer.from(String(chunk ?? ""), encoding);
}

function getDefaultSettings() {
  return {
    headerTableSize: 4096,
    enablePush: true,
    initialWindowSize: 65535,
    maxFrameSize: 16384,
    maxConcurrentStreams: 4294967295,
    maxHeaderSize: 65535,
    maxHeaderListSize: 65535,
    enableConnectProtocol: false
  };
}

const HTTP2_SETTINGS_FIELDS = [
  ["headerTableSize", constants.NGHTTP2_SETTINGS_HEADER_TABLE_SIZE, (value) => Number(value)],
  ["enablePush", constants.NGHTTP2_SETTINGS_ENABLE_PUSH, (value) => value ? 1 : 0],
  ["maxConcurrentStreams", constants.NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS, (value) => Number(value)],
  ["initialWindowSize", constants.NGHTTP2_SETTINGS_INITIAL_WINDOW_SIZE, (value) => Number(value)],
  ["maxFrameSize", constants.NGHTTP2_SETTINGS_MAX_FRAME_SIZE, (value) => Number(value)],
  ["maxHeaderSize", constants.NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE, (value) => Number(value)],
  ["enableConnectProtocol", constants.NGHTTP2_SETTINGS_ENABLE_CONNECT_PROTOCOL, (value) => value ? 1 : 0]
];

const HTTP2_SETTINGS_BY_ID = new Map(HTTP2_SETTINGS_FIELDS.map(([name, id]) => [id, name]));

function getPackedSettings(settings) {
  const normalized = settings ?? {};
  const entries = [];
  for (const [name, id, normalize] of HTTP2_SETTINGS_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(normalized, name)) continue;
    const value = normalize(normalized[name]);
    if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) {
      throw Object.assign(new RangeError(`Invalid HTTP/2 setting value for ${name}`), {
        code: "ERR_OUT_OF_RANGE"
      });
    }
    entries.push([id, value >>> 0]);
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "maxHeaderSize") && Object.prototype.hasOwnProperty.call(normalized, "maxHeaderListSize")) {
    const value = Number(normalized.maxHeaderListSize);
    if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) {
      throw Object.assign(new RangeError("Invalid HTTP/2 setting value for maxHeaderListSize"), {
        code: "ERR_OUT_OF_RANGE"
      });
    }
    entries.push([constants.NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE, value >>> 0]);
  }
  entries.sort(([leftId], [rightId]) => leftId - rightId);
  const output = RuntimeBuffer.alloc(entries.length * 6);
  entries.forEach(([id, value], index) => {
    const offset = index * 6;
    output.writeUInt16BE(id, offset);
    output.writeUInt32BE(value, offset + 2);
  });
  return output;
}

function getUnpackedSettings(buffer) {
  const bytes = RuntimeBuffer.from(buffer ?? RuntimeBuffer.alloc(0));
  if (bytes.length === 0) return {};
  if (bytes.length % 6 !== 0) {
    throw Object.assign(new RangeError("Packed settings length must be a multiple of six"), {
      code: "ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH"
    });
  }
  const settings = {};
  for (let offset = 0; offset < bytes.length; offset += 6) {
    const id = bytes.readUInt16BE(offset);
    const value = bytes.readUInt32BE(offset + 2);
    const name = HTTP2_SETTINGS_BY_ID.get(id);
    const normalized = id === constants.NGHTTP2_SETTINGS_ENABLE_PUSH || id === constants.NGHTTP2_SETTINGS_ENABLE_CONNECT_PROTOCOL
      ? Boolean(value)
      : value;
    if (id === constants.NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE) {
      settings.maxHeaderSize = normalized;
      settings.maxHeaderListSize = normalized;
    } else if (!name) {
      settings.customSettings ??= {};
      settings.customSettings[id] = value;
    } else {
      settings[name] = normalized;
    }
  }
  return settings;
}

function unsupportedHttp2(operation) {
  return Object.assign(new Error(`node:http2 ${operation} is not supported in OpenContainers V1`), {
    code: "ERR_OPENCONTAINERS_HTTP2_UNSUPPORTED"
  });
}

function reportVirtualError(process, error) {
  try {
    process.stderr?.write?.(`${error?.stack ?? error?.message ?? String(error)}\n`);
  } catch (_) {
    // Diagnostics must not escape the virtual process boundary.
  }
  process.exitCode = 1;
}

function noopStreamListener() {}
