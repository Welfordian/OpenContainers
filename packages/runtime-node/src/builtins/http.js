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
    process.__welfordAddRef?.();
  }

  #kernel;
  #process;
  #callback;
  #chunks;
  #ended = false;

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

  async #dispatch() {
    try {
      const body = concatChunks(this.#chunks);
      const response = isVirtualLocalhost(this.host)
        ? await this.#dispatchVirtual(body)
        : await this.#dispatchExternal(body);
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
      queueMicrotask(() => this.#process.__welfordUnref?.());
    }
  }

  async #dispatchVirtual(body) {
    return this.#kernel.dispatchHttpRequest({
      id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2),
      projectId: this.#process.env.WELFORD_PROJECT_ID ?? "default",
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
        code: "ERR_WELFORD_HOST_ORIGIN_BLOCKED"
      });
    }
    if (this.#kernel.allowExternalNetwork !== true) {
      throw Object.assign(new Error(`External network request blocked: ${requestUrl.href}`), {
        code: "ERR_WELFORD_EXTERNAL_NETWORK_BLOCKED"
      });
    }
    const response = await fetch(requestUrl.href, {
      method: this.method,
      headers: this.headers,
      body: body.byteLength ? body : undefined
    });
    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: new Uint8Array(await response.arrayBuffer())
    };
  }
}

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
    METHODS,
    STATUS_CODES,
    createServer(listener) {
      const server = new EventEmitter();
      if (listener) server.on("request", listener);
      server.listening = false;
      server.listen = (port = 0, hostOrCallback, maybeCallback) => {
        const callback = typeof hostOrCallback === "function" ? hostOrCallback : maybeCallback;
        const host = typeof hostOrCallback === "string" ? hostOrCallback : "0.0.0.0";
        const assignedPort = kernel.registerPort({
          projectId: process.env.WELFORD_PROJECT_ID ?? "default",
          pid: process.pid,
          port,
          host,
          handler: async (request) => new Promise((resolve) => {
            const req = new IncomingMessage(request);
            const res = new ServerResponse(resolve);
            try {
              server.emit("request", req, res);
            } catch (error) {
              reportVirtualError(process, error);
              if (!res.writableEnded) resolve(virtualServerErrorResponse(error));
            }
          })
        });
        kernel.registerWebSocketServer({
          projectId: process.env.WELFORD_PROJECT_ID ?? "default",
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
      ["x-welford-error", "unhandled-virtual-server-error"]
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

function isHostPageOrigin(url) {
  const origin = globalThis.location?.origin;
  if (!origin || origin === "null") return false;
  try {
    return url.origin === new URL(origin).origin;
  } catch (_) {
    return false;
  }
}
