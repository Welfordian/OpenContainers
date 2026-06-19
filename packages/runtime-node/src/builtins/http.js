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
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  409: "Conflict",
  413: "Payload Too Large",
  418: "I'm a Teapot",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable"
};

export class IncomingMessage extends Readable {
  constructor(request) {
    super();
    this.method = request.method;
    this.url = request.url;
    this.headers = Object.fromEntries(request.headers ?? []);
    this.rawHeaders = [...(request.headers ?? [])].flatMap(([name, value]) => [String(name), String(value)]);
    this.trailers = {};
    this.rawTrailers = [];
    this.statusCode = request.statusCode;
    this.statusMessage = request.statusMessage;
    if (request.body && !this.headers["content-length"]) {
      const bytes = typeof request.body === "string" ? new TextEncoder().encode(request.body) : new Uint8Array(request.body);
      this.headers["content-length"] = String(bytes.byteLength);
    }
    this.socket = {
      remoteAddress: "127.0.0.1",
      remotePort: 0,
      localAddress: "127.0.0.1",
      localPort: request.port,
      encrypted: false
    };
    this.connection = this.socket;
    if (request.body) queueMicrotask(() => {
      this.push(typeof request.body === "string" ? request.body : RuntimeBuffer.from(request.body));
      this.push(null);
    });
  }
}

export class ClientRequest extends Writable {
  constructor({ kernel, process, secureDefault, options, callback }) {
    const chunks = [];
    super({
      write: (chunk) => {
        chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      }
    });
    this.method = options.method ?? "GET";
    this.path = `${options.pathname ?? "/"}${options.search ?? ""}`;
    this.host = options.hostname ?? options.host ?? "localhost";
    this.port = Number(options.port ?? (secureDefault ? 443 : 80));
    this.protocol = options.protocol ?? (secureDefault ? "https:" : "http:");
    this.headers = normalizeHeaders(options.headers ?? {});
    this.#kernel = kernel;
    this.#process = process;
    this.#callback = callback;
    this.#chunks = chunks;
    process.__opencontainersAddRef?.();
  }

  #kernel;
  #process;
  #callback;
  #chunks;
  #ended = false;
  #aborted = false;
  #unrefQueued = false;

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  removeHeader(name) {
    delete this.headers[String(name).toLowerCase()];
  }

  end(chunk, encoding, callback) {
    if (this.#ended) return;
    if (chunk !== undefined) this.write(chunk, encoding);
    this.#ended = true;
    super.end(undefined, undefined, callback);
    queueMicrotask(() => this.#dispatch());
  }

  abort() {
    return this.destroy(Object.assign(new Error("Request aborted"), { code: "ECONNRESET" }));
  }

  destroy(error) {
    if (this.#aborted) return this;
    this.#aborted = true;
    this.destroyed = true;
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

  async #dispatch() {
    if (this.#aborted) return;
    try {
      const body = concatChunks(this.#chunks);
      const response = isVirtualLocalhost(this.host)
        ? await this.#dispatchVirtual(body)
        : await this.#dispatchExternal(body);
      if (this.#aborted) return;
      const incoming = new IncomingMessage({
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: response.headers,
        body: normalizeResponseBody(response.body)
      });
      this.#callback?.(incoming);
      this.emit("response", incoming);
    } catch (error) {
      try {
        this.emit("error", error);
      } catch (emitError) {
        reportVirtualError(this.#process, emitError);
      }
    } finally {
      this.#queueUnref();
    }
  }

  #queueUnref() {
    if (this.#unrefQueued) return;
    this.#unrefQueued = true;
    queueMicrotask(() => this.#process.__opencontainersUnref?.());
  }

  async #dispatchVirtual(body) {
    return this.#kernel.dispatchHttpRequest({
      id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2),
      projectId: this.#process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      port: this.port,
      method: this.method,
      url: this.path,
      headers: Object.entries(this.headers),
      body
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
    this.options = options;
    this.requests = {};
    this.sockets = {};
    this.freeSockets = {};
    this.keepAlive = Boolean(options.keepAlive);
    this.maxSockets = options.maxSockets ?? Infinity;
    this.maxFreeSockets = options.maxFreeSockets ?? 256;
  }

  addRequest() {}

  destroy() {
    this.emit("free");
  }
}

export const globalAgent = new Agent();

export class ServerResponse extends Writable {
  constructor(resolveResponse) {
    const chunks = [];
    super({
      write: (chunk) => {
        chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      }
    });
    this.statusCode = 200;
    this.statusMessage = "OK";
    this.headers = new Map();
    this.headersSent = false;
    this.writableEnded = false;
    this.finished = false;
    this.#chunks = chunks;
    this.#resolveResponse = resolveResponse;
  }

  #chunks;
  #resolveResponse;
  #ended = false;

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
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
    return Object.fromEntries(this.headers.entries());
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
    this.writableEnded = true;
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
      body
    });
    super.end(undefined, undefined, callback);
  }
}

export function createHttpBuiltin({ kernel, process }) {
  const request = createRequestFactory({ kernel, process, secureDefault: false });
  return {
    IncomingMessage,
    ServerResponse,
    ClientRequest,
    Agent,
    globalAgent,
    METHODS,
    STATUS_CODES,
    createServer(listener) {
      const server = new EventEmitter();
      if (listener) server.on("request", listener);
      server.listening = false;
      server.listen = (port = 0, hostOrCallback, maybeCallback) => {
        const callback = typeof hostOrCallback === "function" ? hostOrCallback : maybeCallback;
        const host = typeof hostOrCallback === "string" ? hostOrCallback : "0.0.0.0";
        const projectId = process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
        const assignedPort = kernel.registerPort({
          projectId,
          pid: process.pid,
          port,
          host,
          handler: (request) => dispatchServerRequest({ server, process, request })
        });
        try {
          kernel.listenNet({
            projectId,
            pid: process.pid,
            port: assignedPort,
            host,
            connectionListener: (socket) => {
              handleHttpSocketConnection({
                server,
                process,
                socket,
                port: assignedPort
              });
            }
          });
        } catch (error) {
          kernel.portManager?.unregister(projectId, assignedPort);
          throw error;
        }
        kernel.registerWebSocketServer({
          projectId,
          port: assignedPort,
          handler: (socket, request) => {
            const req = new IncomingMessage({
              method: "GET",
              url: request.path,
              headers: [["upgrade", "websocket"]]
            });
            try {
              if (server.listenerCount("upgrade")) {
                server.emit("upgrade", req, socket, RuntimeBuffer.alloc(0));
              } else {
                server.emit("websocket", socket, req);
              }
            } catch (error) {
              reportVirtualError(process, error);
              socket.close?.(1011, "Unhandled virtual server error");
            }
          }
        });
        server.listening = true;
        server.address = () => ({ address: host, family: "IPv4", port: assignedPort });
        callback?.();
        server.emit("listening");
        return server;
      };
      server.close = (callback) => {
        kernel.unregisterPortsForPid(process.pid);
        server.listening = false;
        callback?.();
        server.emit("close");
      };
      return server;
    },
    request,
    get: (...args) => {
      const req = request(...args);
      req.end();
      return req;
    }
  };
}

export function createHttpsBuiltin({ kernel, process }) {
  const request = createRequestFactory({ kernel, process, secureDefault: true });
  return {
    Agent,
    globalAgent,
    METHODS,
    STATUS_CODES,
    request,
    get: (...args) => {
      const req = request(...args);
      req.end();
      return req;
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

function createRequestFactory({ kernel, process, secureDefault }) {
  return (...args) => {
    const { options, callback } = normalizeRequestArgs(args, secureDefault);
    return new ClientRequest({ kernel, process, secureDefault, options, callback });
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
      port: url.port,
      pathname: url.pathname,
      search: url.search
    };
    if (second && typeof second === "object") options = { ...options, ...second };
  } else if (first && typeof first === "object") {
    options = { ...first };
  }
  options.protocol ??= secureDefault ? "https:" : "http:";
  options.hostname ??= options.host ?? "localhost";
  options.pathname ??= options.path?.split("?")[0] ?? "/";
  options.search ??= options.path?.includes("?") ? `?${options.path.split("?").slice(1).join("?")}` : "";
  return { options, callback };
}

function normalizeHeaders(headers) {
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
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
  const body = normalizeResponseBody(response.body) ?? RuntimeBuffer.alloc(0);
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
