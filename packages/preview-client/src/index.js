export function installPreviewClient({ bridge, win = globalThis.window } = {}) {
  if (!win || win.__WELFORD_PREVIEW_CLIENT_INSTALLED__) return;
  win.__WELFORD_PREVIEW_CLIENT_INSTALLED__ = true;
  const config = win.__WELFORD_PREVIEW__;
  if (!config) return;

  const activeBridge = bridge ?? createParentBridge(win, config);
  patchConsole(win, config);
  patchFetch(win, config, activeBridge);
  patchWebSocket(win, config, activeBridge);
}

export function isVirtualLocalhost(url) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname);
}

export function mapPreviewRequestUrl(input, config = {}, baseHref = globalThis.location?.href ?? "https://run.welford.local/") {
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
  if (url.origin === previewOrigin && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/__welford/")) {
    return `${previewOrigin}/p/${encodeURIComponent(config.projectId)}:${config.defaultPort}${url.pathname}${url.search}`;
  }

  return null;
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

function patchWebSocket(win, config, bridge) {
  const NativeWebSocket = win.WebSocket;
  if (!NativeWebSocket) return;

  win.WebSocket = class WelfordWebSocket extends EventTarget {
    constructor(input, protocols) {
      const url = new URL(input, config.baseUrl ?? win.location.href);
      if (!isVirtualLocalhost(url)) return new NativeWebSocket(input, protocols);
      super();
      if (!bridge?.webSocket) {
        queueMicrotask(() => this.dispatchEvent(new Event("error")));
        return;
      }
      return bridge.webSocket({
        projectId: config.projectId,
        port: Number(url.port || config.defaultPort),
        path: `${url.pathname}${url.search}`,
        protocols
      });
    }
  };
}

export function createParentBridge(win = globalThis.window, config = win?.__WELFORD_PREVIEW__ ?? {}) {
  let nextId = 1;
  const sockets = new Map();
  const pendingFetches = new Map();
  const targetOrigin = config.parentOrigin ?? win.location?.origin ?? "*";

  win.addEventListener?.("message", (event) => {
    const message = event.data;
    if (message?.type === "welford:fetch:response") {
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

    if (message?.type !== "welford:ws:event") return;
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
          type: "welford:fetch:request",
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
        type: "welford:ws:connect",
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
      type: "welford:ws:send",
      localId: this.localId,
      socketId: this.socketId,
      data
    }, this.targetOrigin);
  }

  close(code = 1000, reason = "") {
    if (this.readyState === PreviewVirtualWebSocket.CLOSED) return;
    this.readyState = PreviewVirtualWebSocket.CLOSING;
    this.win.parent?.postMessage?.({
      type: "welford:ws:close",
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
    if (!win || win.__WELFORD_PREVIEW_CLIENT_INSTALLED__) return;
    win.__WELFORD_PREVIEW_CLIENT_INSTALLED__ = true;
    const config = win.__WELFORD_PREVIEW__;
    if (!config) return;
    const bridge = createParentBridge(win, config);
    patchConsole(win, config);
    patchFetch(win, config, bridge);
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
    if (url.origin === previewOrigin && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/__welford/")) {
      return previewOrigin + "/p/" + encodeURIComponent(config.projectId) + ":" + config.defaultPort + url.pathname + url.search;
    }
    return null;
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
  function patchWebSocket(win, config, bridge) {
    const NativeWebSocket = win.WebSocket;
    if (!NativeWebSocket) return;
    win.WebSocket = class WelfordWebSocket extends EventTarget {
      constructor(input, protocols) {
        const url = new URL(input, config.baseUrl || win.location.href);
        if (!isVirtualLocalhost(url)) return new NativeWebSocket(input, protocols);
        super();
        if (!bridge?.webSocket) {
          queueMicrotask(() => this.dispatchEvent(new Event("error")));
          return;
        }
        return bridge.webSocket({
          projectId: config.projectId,
          port: Number(url.port || config.defaultPort),
          path: url.pathname + url.search,
          protocols
        });
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
      if (message?.type === "welford:fetch:response") {
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
      if (message?.type !== "welford:ws:event") return;
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
          win.parent?.postMessage?.({ type: "welford:fetch:request", id, ...request }, targetOrigin);
        });
      },
      webSocket({ projectId, port, path, protocols }) {
        const localId = "preview-ws-" + nextId++;
        const socket = new PreviewVirtualWebSocket({ win, localId, targetOrigin });
        sockets.set(localId, socket);
        win.parent?.postMessage?.({ type: "welford:ws:connect", localId, projectId, port, path, protocols }, targetOrigin);
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
      this.win.parent?.postMessage?.({ type: "welford:ws:send", localId: this.localId, socketId: this.socketId, data }, this.targetOrigin);
    }
    close(code = 1000, reason = "") {
      if (this.readyState === PreviewVirtualWebSocket.CLOSED) return;
      this.readyState = PreviewVirtualWebSocket.CLOSING;
      this.win.parent?.postMessage?.({ type: "welford:ws:close", localId: this.localId, socketId: this.socketId, code, reason }, this.targetOrigin);
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
