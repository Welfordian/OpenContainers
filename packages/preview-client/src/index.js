export function installPreviewClient({ bridge, win = globalThis.window } = {}) {
  if (!win || win.__OPENCONTAINERS_PREVIEW_CLIENT_INSTALLED__) return;
  win.__OPENCONTAINERS_PREVIEW_CLIENT_INSTALLED__ = true;
  const config = win.__OPENCONTAINERS_PREVIEW__;
  if (!config) return;

  const activeBridge = bridge ?? createParentBridge(win, config);
  patchConsole(win, config);
  patchFetch(win, config, activeBridge);
  patchXMLHttpRequest(win, config, activeBridge);
  patchWebSocket(win, config, activeBridge);
}

export function isVirtualLocalhost(url) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname);
}

export function mapPreviewRequestUrl(input, config = {}, baseHref = globalThis.location?.href ?? "https://run.opencontainers.local/") {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
  if (!raw) return null;

  const baseUrl = config.baseUrl ?? baseHref;
  const url = new URL(raw, baseUrl);
  const previewOrigin = config.previewOrigin ?? new URL(baseUrl).origin;

  if (isVirtualLocalhost(url)) {
    const port = url.port || config.defaultPort;
    return `${previewOrigin}/p/${encodeURIComponent(config.projectId)}:${port}${url.pathname}${url.search}`;
  }

  if (url.origin === previewOrigin && url.pathname.startsWith("/p/")) return url.href;
  if (url.origin === previewOrigin && !url.pathname.startsWith("/__opencontainers/")) {
    return `${previewOrigin}/p/${encodeURIComponent(config.projectId)}:${config.defaultPort}${url.pathname}${url.search}`;
  }

  return null;
}

export function mapPreviewWebSocketRequest(input, protocols, config = {}, baseHref = globalThis.location?.href ?? "https://run.opencontainers.local/") {
  let url;
  try {
    url = new URL(String(input || ""), config.baseUrl ?? baseHref);
  } catch (_) {
    return null;
  }

  const baseUrl = config.baseUrl ?? baseHref;
  const previewOrigin = config.previewOrigin ?? new URL(baseUrl).origin;
  const previewHost = new URL(previewOrigin).host;
  if (isVirtualLocalhost(url)) {
    return {
      projectId: config.projectId,
      port: Number(url.port || config.defaultPort),
      path: `${url.pathname}${url.search}`,
      protocols
    };
  }

  if (url.host !== previewHost || url.pathname.startsWith("/__opencontainers/")) return null;
  if (url.pathname.startsWith("/p/")) {
    const rest = url.pathname.slice(3);
    const slashIndex = rest.indexOf("/");
    const projectSegment = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const [projectId, port] = decodeURIComponent(projectSegment).split(":");
    return {
      projectId,
      port: Number(port || config.defaultPort),
      path: `${slashIndex === -1 ? "/" : rest.slice(slashIndex)}${url.search}`,
      protocols
    };
  }

  return {
    projectId: config.projectId,
    port: Number(config.defaultPort),
    path: `${url.pathname}${url.search}`,
    protocols
  };
}

async function serializeFetchInput(input, init = {}, config, win) {
  const url = mapPreviewRequestUrl(input, config, win.location?.href);
  if (!url) return null;

  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const method = init.method ?? request?.method ?? "GET";
  const headers = [...new Headers(init.headers ?? request?.headers ?? []).entries()];
  let body = init.body;
  if (body === undefined && request && !["GET", "HEAD"].includes(method.toUpperCase())) {
    body = await request.clone().arrayBuffer();
  }
  return { url, method, headers, body };
}

function patchFetch(win, config, bridge) {
  const nativeFetch = win.fetch?.bind(win);
  if (!nativeFetch) return;

  win.fetch = async (input, init = {}) => {
    const request = await serializeFetchInput(input, init, config, win);
    if (request && bridge?.fetch) return bridge.fetch(request);
    if (request) return nativeFetch(request.url, init);
    return nativeFetch(input, init);
  };
}

function patchXMLHttpRequest(win, config, bridge) {
  const NativeXMLHttpRequest = win.XMLHttpRequest;
  if (!NativeXMLHttpRequest) return;

  win.XMLHttpRequest = class OpenContainersXMLHttpRequest extends EventTarget {
    static UNSENT = 0;
    static OPENED = 1;
    static HEADERS_RECEIVED = 2;
    static LOADING = 3;
    static DONE = 4;

    constructor() {
      super();
      this.readyState = OpenContainersXMLHttpRequest.UNSENT;
      this.response = null;
      this.responseText = "";
      this.responseType = "";
      this.responseURL = "";
      this.status = 0;
      this.statusText = "";
      this.timeout = 0;
      this.withCredentials = false;
      this.onreadystatechange = null;
      this.onload = null;
      this.onerror = null;
      this.onabort = null;
      this.onloadend = null;
      this.#headers = [];
      this.#responseHeaders = [];
    }

    #headers;
    #responseHeaders;
    #method = "GET";
    #url = "";
    #mappedUrl = null;
    #native = null;
    #aborted = false;

    open(method, url, async = true, user, password) {
      this.#method = String(method ?? "GET").toUpperCase();
      this.#url = String(url);
      this.#mappedUrl = mapPreviewRequestUrl(url, config, win.location?.href);
      if (!this.#mappedUrl || !bridge?.fetch) {
        this.#native = new NativeXMLHttpRequest();
        this.#wireNative();
        this.#native.open(method, url, async, user, password);
        return;
      }
      this.#setReadyState(OpenContainersXMLHttpRequest.OPENED);
    }

    setRequestHeader(name, value) {
      if (this.#native) return this.#native.setRequestHeader(name, value);
      this.#headers.push([String(name), String(value)]);
    }

    getResponseHeader(name) {
      if (this.#native) return this.#native.getResponseHeader(name);
      const lowerName = String(name).toLowerCase();
      return this.#responseHeaders.find(([key]) => key.toLowerCase() === lowerName)?.[1] ?? null;
    }

    getAllResponseHeaders() {
      if (this.#native) return this.#native.getAllResponseHeaders();
      return this.#responseHeaders.map(([key, value]) => `${key}: ${value}`).join("\r\n");
    }

    overrideMimeType(type) {
      if (this.#native?.overrideMimeType) this.#native.overrideMimeType(type);
    }

    send(body = null) {
      if (this.#native) return this.#native.send(body);
      if (!this.#mappedUrl) {
        this.#emit("error");
        this.#emit("loadend");
        return;
      }
      bridge.fetch({
        url: this.#mappedUrl,
        method: this.#method,
        headers: this.#headers,
        body
      }).then(async (response) => {
        if (this.#aborted) return;
        this.status = response.status;
        this.statusText = response.statusText;
        this.responseURL = this.#mappedUrl;
        this.#responseHeaders = [...response.headers.entries()];
        this.#setReadyState(OpenContainersXMLHttpRequest.HEADERS_RECEIVED);
        const arrayBuffer = await response.arrayBuffer();
        if (this.#aborted) return;
        this.#setReadyState(OpenContainersXMLHttpRequest.LOADING);
        this.#setResponse(arrayBuffer);
        this.#setReadyState(OpenContainersXMLHttpRequest.DONE);
        this.#emit("load");
        this.#emit("loadend");
      }).catch((error) => {
        if (this.#aborted) return;
        this.status = 0;
        this.statusText = "";
        this.error = error;
        this.#setReadyState(OpenContainersXMLHttpRequest.DONE);
        this.#emit("error");
        this.#emit("loadend");
      });
    }

    abort() {
      if (this.#native) return this.#native.abort();
      this.#aborted = true;
      this.#setReadyState(OpenContainersXMLHttpRequest.UNSENT);
      this.#emit("abort");
      this.#emit("loadend");
    }

    #setResponse(arrayBuffer) {
      if (this.responseType === "arraybuffer") {
        this.response = arrayBuffer;
        this.responseText = "";
        return;
      }
      const text = new TextDecoder().decode(arrayBuffer);
      this.responseText = text;
      this.response = this.responseType === "json" ? JSON.parse(text) : text;
    }

    #setReadyState(state) {
      this.readyState = state;
      this.#emit("readystatechange");
    }

    #emit(type) {
      const event = new Event(type);
      this.dispatchEvent(event);
      const handler = this[`on${type}`];
      if (typeof handler === "function") handler.call(this, event);
    }

    #wireNative() {
      for (const type of ["readystatechange", "load", "error", "abort", "loadend"]) {
        this.#native.addEventListener(type, (event) => {
          this.readyState = this.#native.readyState;
          this.response = this.#native.response;
          this.responseText = this.#native.responseText;
          this.responseURL = this.#native.responseURL;
          this.status = this.#native.status;
          this.statusText = this.#native.statusText;
          this.dispatchEvent(event);
          const handler = this[`on${type}`];
          if (typeof handler === "function") handler.call(this, event);
        });
      }
    }
  };
  win.XMLHttpRequest.UNSENT = win.XMLHttpRequest.prototype.UNSENT = 0;
  win.XMLHttpRequest.OPENED = win.XMLHttpRequest.prototype.OPENED = 1;
  win.XMLHttpRequest.HEADERS_RECEIVED = win.XMLHttpRequest.prototype.HEADERS_RECEIVED = 2;
  win.XMLHttpRequest.LOADING = win.XMLHttpRequest.prototype.LOADING = 3;
  win.XMLHttpRequest.DONE = win.XMLHttpRequest.prototype.DONE = 4;
}

function patchWebSocket(win, config, bridge) {
  const NativeWebSocket = win.WebSocket;
  if (!NativeWebSocket) return;

  win.WebSocket = class OpenContainersWebSocket extends EventTarget {
    constructor(input, protocols) {
      const request = mapPreviewWebSocketRequest(input, protocols, config, win.location?.href);
      if (!request) return new NativeWebSocket(input, protocols);
      super();
      if (!bridge?.webSocket) {
        queueMicrotask(() => this.dispatchEvent(new Event("error")));
        return;
      }
      return bridge.webSocket(request);
    }
  };
}

export function createParentBridge(win = globalThis.window, config = win?.__OPENCONTAINERS_PREVIEW__ ?? {}) {
  let nextId = 1;
  const sockets = new Map();
  const pendingFetches = new Map();
  const targetOrigin = config.parentOrigin ?? win.location?.origin ?? "*";

  win.addEventListener?.("message", (event) => {
    const message = event.data;
    if (message?.type === "opencontainers:fetch:response") {
      const pending = pendingFetches.get(message.id);
      if (!pending) return;
      pendingFetches.delete(message.id);
      if (!message.ok) {
        pending.reject(Object.assign(new Error(message.error?.message ?? "Preview fetch failed"), message.error ?? {}));
      } else {
        pending.resolve(new Response(message.body, {
          status: message.status,
          statusText: message.statusText,
          headers: message.headers
        }));
      }
      return;
    }

    if (message?.type !== "opencontainers:ws:event") return;
    const socket = sockets.get(message.localId) ?? sockets.get(message.socketId);
    if (!socket) return;
    socket.receive(message);
    if (message.event === "connected" && message.socketId) sockets.set(message.socketId, socket);
    if (message.event === "close") {
      sockets.delete(message.localId);
      sockets.delete(message.socketId);
    }
  });

  return {
    fetch(request) {
      const id = `preview-fetch-${nextId++}`;
      return new Promise((resolve, reject) => {
        pendingFetches.set(id, { resolve, reject });
        win.parent?.postMessage?.({
          type: "opencontainers:fetch:request",
          id,
          ...request
        }, targetOrigin);
      });
    },

    webSocket({ projectId, port, path, protocols }) {
      const localId = `preview-ws-${nextId++}`;
      const socket = new PreviewVirtualWebSocket({ win, localId, targetOrigin });
      sockets.set(localId, socket);
      win.parent?.postMessage?.({
        type: "opencontainers:ws:connect",
        localId,
        projectId,
        port,
        path,
        protocols
      }, targetOrigin);
      return socket;
    }
  };
}

export class PreviewVirtualWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor({ win, localId, targetOrigin }) {
    super();
    this.win = win;
    this.localId = localId;
    this.targetOrigin = targetOrigin;
    this.socketId = null;
    this.readyState = PreviewVirtualWebSocket.CONNECTING;
    this.bufferedAmount = 0;
    this.protocol = "";
    this.binaryType = "arraybuffer";
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(data) {
    if (this.readyState !== PreviewVirtualWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.win.parent?.postMessage?.({
      type: "opencontainers:ws:send",
      localId: this.localId,
      socketId: this.socketId,
      data
    }, this.targetOrigin);
  }

  close(code = 1000, reason = "") {
    if (this.readyState === PreviewVirtualWebSocket.CLOSED) return;
    this.readyState = PreviewVirtualWebSocket.CLOSING;
    this.win.parent?.postMessage?.({
      type: "opencontainers:ws:close",
      localId: this.localId,
      socketId: this.socketId,
      code,
      reason
    }, this.targetOrigin);
  }

  receive(message) {
    if (message.event === "connected") {
      this.socketId = message.socketId;
      return;
    }
    if (message.event === "open") {
      this.readyState = PreviewVirtualWebSocket.OPEN;
      this.emit("open", new Event("open"));
      return;
    }
    if (message.event === "message") {
      this.emit("message", createDomEvent("message", { data: message.data }));
      return;
    }
    if (message.event === "close") {
      this.readyState = PreviewVirtualWebSocket.CLOSED;
      this.emit("close", createDomEvent("close", {
        code: message.code ?? 1000,
        reason: message.reason ?? "",
        wasClean: message.wasClean ?? true
      }));
      return;
    }
    if (message.event === "error") {
      this.emit("error", new Event("error"));
    }
  }

  emit(type, event) {
    this.dispatchEvent(event);
    const handler = this[`on${type}`];
    if (typeof handler === "function") handler.call(this, event);
  }
}

function createDomEvent(type, detail = {}) {
  if (type === "message" && typeof MessageEvent !== "undefined") {
    return new MessageEvent("message", detail);
  }
  if (type === "close" && typeof CloseEvent !== "undefined") {
    return new CloseEvent("close", detail);
  }
  const event = new Event(type);
  for (const [key, value] of Object.entries(detail)) {
    Object.defineProperty(event, key, { value, enumerable: true });
  }
  return event;
}

function patchConsole(win, config) {
  const targetOrigin = config.parentOrigin ?? win.location?.origin ?? "*";
  for (const level of ["log", "warn", "error", "info"]) {
    const original = win.console[level].bind(win.console);
    win.console[level] = (...args) => {
      win.parent?.postMessage?.({ type: "preview-console", level, args }, targetOrigin);
      original(...args);
    };
  }
}

export function previewClientBrowserScript() {
  return `(() => {
  function installPreviewClient(win = window) {
    if (!win || win.__OPENCONTAINERS_PREVIEW_CLIENT_INSTALLED__) return;
    win.__OPENCONTAINERS_PREVIEW_CLIENT_INSTALLED__ = true;
    const config = win.__OPENCONTAINERS_PREVIEW__;
    if (!config) return;
    const bridge = createParentBridge(win, config);
    patchConsole(win, config);
    patchFetch(win, config, bridge);
    patchXMLHttpRequest(win, config, bridge);
    patchWebSocket(win, config, bridge);
  }
  function isVirtualLocalhost(url) {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname);
  }
  function mapPreviewRequestUrl(input, config, baseHref) {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    if (!raw) return null;
    const baseUrl = config.baseUrl || baseHref;
    const url = new URL(raw, baseUrl);
    const previewOrigin = config.previewOrigin || new URL(baseUrl).origin;
    if (isVirtualLocalhost(url)) {
      const port = url.port || config.defaultPort;
      return previewOrigin + "/p/" + encodeURIComponent(config.projectId) + ":" + port + url.pathname + url.search;
    }
    if (url.origin === previewOrigin && url.pathname.startsWith("/p/")) return url.href;
    if (url.origin === previewOrigin && !url.pathname.startsWith("/__opencontainers/")) {
      return previewOrigin + "/p/" + encodeURIComponent(config.projectId) + ":" + config.defaultPort + url.pathname + url.search;
    }
    return null;
  }
  function mapPreviewWebSocketRequest(input, protocols, config, baseHref) {
    let url;
    try {
      url = new URL(String(input || ""), config.baseUrl || baseHref);
    } catch (_) {
      return null;
    }
    const baseUrl = config.baseUrl || baseHref;
    const previewOrigin = config.previewOrigin || new URL(baseUrl).origin;
    const previewHost = new URL(previewOrigin).host;
    if (isVirtualLocalhost(url)) {
      return {
        projectId: config.projectId,
        port: Number(url.port || config.defaultPort),
        path: url.pathname + url.search,
        protocols
      };
    }
    if (url.host !== previewHost || url.pathname.startsWith("/__opencontainers/")) return null;
    if (url.pathname.startsWith("/p/")) {
      const rest = url.pathname.slice(3);
      const slashIndex = rest.indexOf("/");
      const projectSegment = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
      const pieces = decodeURIComponent(projectSegment).split(":");
      return {
        projectId: pieces[0],
        port: Number(pieces[1] || config.defaultPort),
        path: (slashIndex === -1 ? "/" : rest.slice(slashIndex)) + url.search,
        protocols
      };
    }
    return {
      projectId: config.projectId,
      port: Number(config.defaultPort),
      path: url.pathname + url.search,
      protocols
    };
  }
  async function serializeFetchInput(input, init, config, win) {
    const url = mapPreviewRequestUrl(input, config, win.location?.href);
    if (!url) return null;
    const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const method = init?.method || request?.method || "GET";
    const headers = [...new Headers(init?.headers || request?.headers || []).entries()];
    let body = init?.body;
    if (body === undefined && request && !["GET", "HEAD"].includes(method.toUpperCase())) {
      body = await request.clone().arrayBuffer();
    }
    return { url, method, headers, body };
  }
  function patchFetch(win, config, bridge) {
    const nativeFetch = win.fetch?.bind(win);
    if (!nativeFetch) return;
    win.fetch = async (input, init = {}) => {
      const request = await serializeFetchInput(input, init, config, win);
      if (request && bridge?.fetch) return bridge.fetch(request);
      if (request) return nativeFetch(request.url, init);
      return nativeFetch(input, init);
    };
  }
  function patchXMLHttpRequest(win, config, bridge) {
    const NativeXMLHttpRequest = win.XMLHttpRequest;
    if (!NativeXMLHttpRequest) return;
    win.XMLHttpRequest = class OpenContainersXMLHttpRequest extends EventTarget {
      static UNSENT = 0;
      static OPENED = 1;
      static HEADERS_RECEIVED = 2;
      static LOADING = 3;
      static DONE = 4;
      constructor() {
        super();
        this.readyState = OpenContainersXMLHttpRequest.UNSENT;
        this.response = null;
        this.responseText = "";
        this.responseType = "";
        this.responseURL = "";
        this.status = 0;
        this.statusText = "";
        this.timeout = 0;
        this.withCredentials = false;
        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        this.onloadend = null;
        this._headers = [];
        this._responseHeaders = [];
        this._method = "GET";
        this._url = "";
        this._mappedUrl = null;
        this._native = null;
        this._aborted = false;
      }
      open(method, url, async = true, user, password) {
        this._method = String(method || "GET").toUpperCase();
        this._url = String(url);
        this._mappedUrl = mapPreviewRequestUrl(url, config, win.location?.href);
        if (!this._mappedUrl || !bridge?.fetch) {
          this._native = new NativeXMLHttpRequest();
          this._wireNative();
          this._native.open(method, url, async, user, password);
          return;
        }
        this._setReadyState(OpenContainersXMLHttpRequest.OPENED);
      }
      setRequestHeader(name, value) {
        if (this._native) return this._native.setRequestHeader(name, value);
        this._headers.push([String(name), String(value)]);
      }
      getResponseHeader(name) {
        if (this._native) return this._native.getResponseHeader(name);
        const lowerName = String(name).toLowerCase();
        const match = this._responseHeaders.find(([key]) => key.toLowerCase() === lowerName);
        return match ? match[1] : null;
      }
      getAllResponseHeaders() {
        if (this._native) return this._native.getAllResponseHeaders();
        return this._responseHeaders.map(([key, value]) => key + ": " + value).join("\\r\\n");
      }
      overrideMimeType(type) {
        if (this._native?.overrideMimeType) this._native.overrideMimeType(type);
      }
      send(body = null) {
        if (this._native) return this._native.send(body);
        if (!this._mappedUrl) {
          this._emit("error");
          this._emit("loadend");
          return;
        }
        bridge.fetch({ url: this._mappedUrl, method: this._method, headers: this._headers, body }).then(async (response) => {
          if (this._aborted) return;
          this.status = response.status;
          this.statusText = response.statusText;
          this.responseURL = this._mappedUrl;
          this._responseHeaders = [...response.headers.entries()];
          this._setReadyState(OpenContainersXMLHttpRequest.HEADERS_RECEIVED);
          const arrayBuffer = await response.arrayBuffer();
          if (this._aborted) return;
          this._setReadyState(OpenContainersXMLHttpRequest.LOADING);
          this._setResponse(arrayBuffer);
          this._setReadyState(OpenContainersXMLHttpRequest.DONE);
          this._emit("load");
          this._emit("loadend");
        }).catch((error) => {
          if (this._aborted) return;
          this.status = 0;
          this.statusText = "";
          this.error = error;
          this._setReadyState(OpenContainersXMLHttpRequest.DONE);
          this._emit("error");
          this._emit("loadend");
        });
      }
      abort() {
        if (this._native) return this._native.abort();
        this._aborted = true;
        this._setReadyState(OpenContainersXMLHttpRequest.UNSENT);
        this._emit("abort");
        this._emit("loadend");
      }
      _setResponse(arrayBuffer) {
        if (this.responseType === "arraybuffer") {
          this.response = arrayBuffer;
          this.responseText = "";
          return;
        }
        const text = new TextDecoder().decode(arrayBuffer);
        this.responseText = text;
        this.response = this.responseType === "json" ? JSON.parse(text) : text;
      }
      _setReadyState(state) {
        this.readyState = state;
        this._emit("readystatechange");
      }
      _emit(type) {
        const event = new Event(type);
        this.dispatchEvent(event);
        const handler = this["on" + type];
        if (typeof handler === "function") handler.call(this, event);
      }
      _wireNative() {
        for (const type of ["readystatechange", "load", "error", "abort", "loadend"]) {
          this._native.addEventListener(type, (event) => {
            this.readyState = this._native.readyState;
            this.response = this._native.response;
            this.responseText = this._native.responseText;
            this.responseURL = this._native.responseURL;
            this.status = this._native.status;
            this.statusText = this._native.statusText;
            this.dispatchEvent(event);
            const handler = this["on" + type];
            if (typeof handler === "function") handler.call(this, event);
          });
        }
      }
    };
    win.XMLHttpRequest.UNSENT = win.XMLHttpRequest.prototype.UNSENT = 0;
    win.XMLHttpRequest.OPENED = win.XMLHttpRequest.prototype.OPENED = 1;
    win.XMLHttpRequest.HEADERS_RECEIVED = win.XMLHttpRequest.prototype.HEADERS_RECEIVED = 2;
    win.XMLHttpRequest.LOADING = win.XMLHttpRequest.prototype.LOADING = 3;
    win.XMLHttpRequest.DONE = win.XMLHttpRequest.prototype.DONE = 4;
  }
  function patchWebSocket(win, config, bridge) {
    const NativeWebSocket = win.WebSocket;
    if (!NativeWebSocket) return;
    win.WebSocket = class OpenContainersWebSocket extends EventTarget {
      constructor(input, protocols) {
        const request = mapPreviewWebSocketRequest(input, protocols, config, win.location?.href);
        if (!request) return new NativeWebSocket(input, protocols);
        super();
        if (!bridge?.webSocket) {
          queueMicrotask(() => this.dispatchEvent(new Event("error")));
          return;
        }
        return bridge.webSocket(request);
      }
    };
  }
  function createParentBridge(win, config) {
    let nextId = 1;
    const sockets = new Map();
    const pendingFetches = new Map();
    const targetOrigin = config.parentOrigin || win.location?.origin || "*";
    win.addEventListener?.("message", (event) => {
      const message = event.data;
      if (message?.type === "opencontainers:fetch:response") {
        const pending = pendingFetches.get(message.id);
        if (!pending) return;
        pendingFetches.delete(message.id);
        if (!message.ok) pending.reject(Object.assign(new Error(message.error?.message || "Preview fetch failed"), message.error || {}));
        else pending.resolve(new Response(message.body, {
          status: message.status,
          statusText: message.statusText,
          headers: message.headers
        }));
        return;
      }
      if (message?.type !== "opencontainers:ws:event") return;
      const socket = sockets.get(message.localId) || sockets.get(message.socketId);
      if (!socket) return;
      socket.receive(message);
      if (message.event === "connected" && message.socketId) sockets.set(message.socketId, socket);
      if (message.event === "close") {
        sockets.delete(message.localId);
        sockets.delete(message.socketId);
      }
    });
    return {
      fetch(request) {
        const id = "preview-fetch-" + nextId++;
        return new Promise((resolve, reject) => {
          pendingFetches.set(id, { resolve, reject });
          win.parent?.postMessage?.({ type: "opencontainers:fetch:request", id, ...request }, targetOrigin);
        });
      },
      webSocket({ projectId, port, path, protocols }) {
        const localId = "preview-ws-" + nextId++;
        const socket = new PreviewVirtualWebSocket({ win, localId, targetOrigin });
        sockets.set(localId, socket);
        win.parent?.postMessage?.({ type: "opencontainers:ws:connect", localId, projectId, port, path, protocols }, targetOrigin);
        return socket;
      }
    };
  }
  class PreviewVirtualWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor({ win, localId, targetOrigin }) {
      super();
      this.win = win;
      this.localId = localId;
      this.targetOrigin = targetOrigin;
      this.socketId = null;
      this.readyState = PreviewVirtualWebSocket.CONNECTING;
      this.bufferedAmount = 0;
      this.protocol = "";
      this.binaryType = "arraybuffer";
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
    }
    send(data) {
      if (this.readyState !== PreviewVirtualWebSocket.OPEN) throw new Error("WebSocket is not open");
      this.win.parent?.postMessage?.({ type: "opencontainers:ws:send", localId: this.localId, socketId: this.socketId, data }, this.targetOrigin);
    }
    close(code = 1000, reason = "") {
      if (this.readyState === PreviewVirtualWebSocket.CLOSED) return;
      this.readyState = PreviewVirtualWebSocket.CLOSING;
      this.win.parent?.postMessage?.({ type: "opencontainers:ws:close", localId: this.localId, socketId: this.socketId, code, reason }, this.targetOrigin);
    }
    receive(message) {
      if (message.event === "connected") {
        this.socketId = message.socketId;
        return;
      }
      if (message.event === "open") {
        this.readyState = PreviewVirtualWebSocket.OPEN;
        this.emit("open", new Event("open"));
        return;
      }
      if (message.event === "message") {
        this.emit("message", createDomEvent("message", { data: message.data }));
        return;
      }
      if (message.event === "close") {
        this.readyState = PreviewVirtualWebSocket.CLOSED;
        this.emit("close", createDomEvent("close", { code: message.code || 1000, reason: message.reason || "", wasClean: message.wasClean ?? true }));
        return;
      }
      if (message.event === "error") this.emit("error", new Event("error"));
    }
    emit(type, event) {
      this.dispatchEvent(event);
      const handler = this["on" + type];
      if (typeof handler === "function") handler.call(this, event);
    }
  }
  function createDomEvent(type, detail = {}) {
    if (type === "message" && typeof MessageEvent !== "undefined") return new MessageEvent("message", detail);
    if (type === "close" && typeof CloseEvent !== "undefined") return new CloseEvent("close", detail);
    const event = new Event(type);
    for (const [key, value] of Object.entries(detail)) Object.defineProperty(event, key, { value, enumerable: true });
    return event;
  }
  function patchConsole(win, config) {
    const targetOrigin = config.parentOrigin || win.location?.origin || "*";
    for (const level of ["log", "warn", "error", "info"]) {
      const original = win.console[level].bind(win.console);
      win.console[level] = (...args) => {
        win.parent?.postMessage?.({ type: "preview-console", level, args }, targetOrigin);
        original(...args);
      };
    }
  }
  installPreviewClient();
})();`;
}
