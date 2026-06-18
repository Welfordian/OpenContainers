import { EventEmitter } from "../../runtime-node/src/builtins/events.js";

export class VirtualWebSocketEndpoint extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor({ protocol = "" } = {}) {
    super();
    this.protocol = protocol;
    this.readyState = VirtualWebSocketEndpoint.CONNECTING;
    this.bufferedAmount = 0;
    this.binaryType = "arraybuffer";
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  attach(peer) {
    this.peer = peer;
  }

  open() {
    if (this.readyState !== VirtualWebSocketEndpoint.CONNECTING) return;
    this.readyState = VirtualWebSocketEndpoint.OPEN;
    this.#emitDom("open", { type: "open" });
  }

  send(data) {
    if (this.readyState !== VirtualWebSocketEndpoint.OPEN) {
      throw Object.assign(new Error("WebSocket is not open"), { code: "ERR_OPENCONTAINERS_WS_NOT_OPEN" });
    }
    queueMicrotask(() => {
      if (this.peer?.readyState === VirtualWebSocketEndpoint.OPEN) {
        this.peer.#emitDom("message", { type: "message", data });
      }
    });
  }

  close(code = 1000, reason = "") {
    if (this.readyState === VirtualWebSocketEndpoint.CLOSED) return;
    this.readyState = VirtualWebSocketEndpoint.CLOSING;
    queueMicrotask(() => {
      this.readyState = VirtualWebSocketEndpoint.CLOSED;
      this.#emitDom("close", { type: "close", code, reason, wasClean: true });
      if (this.peer?.readyState !== VirtualWebSocketEndpoint.CLOSED) {
        this.peer.close(code, reason);
      }
    });
  }

  addEventListener(type, listener) {
    this.on(type, listener);
  }

  removeEventListener(type, listener) {
    this.off(type, listener);
  }

  #emitDom(type, event) {
    this.emit(type, event);
    const handler = this[`on${type}`];
    if (typeof handler === "function") handler.call(this, event);
  }
}

export class WebSocketManager {
  constructor() {
    this.handlers = new Map();
  }

  #key(projectId, port) {
    return `${projectId}:${port}`;
  }

  register({ projectId = "default", port, handler }) {
    if (!port) throw new Error("WebSocket registration requires a port");
    this.handlers.set(this.#key(projectId, port), handler);
  }

  unregister({ projectId = "default", port }) {
    this.handlers.delete(this.#key(projectId, port));
  }

  unregisterProjectPid(projectId, port) {
    this.unregister({ projectId, port });
  }

  connect({ projectId = "default", port, path = "/", protocols = [] } = {}) {
    const handler = this.handlers.get(this.#key(projectId, port));
    if (!handler) {
      throw Object.assign(new Error(`No virtual WebSocket server is listening on ${projectId}:${port}`), {
        code: "ERR_OPENCONTAINERS_WS_SERVER_MISSING"
      });
    }

    const protocol = Array.isArray(protocols) ? protocols[0] ?? "" : protocols ?? "";
    const client = new VirtualWebSocketEndpoint({ protocol });
    const server = new VirtualWebSocketEndpoint({ protocol });
    client.attach(server);
    server.attach(client);
    handler(server, { projectId, port, path, protocols });
    queueMicrotask(() => {
      client.open();
      server.open();
    });
    return client;
  }
}
