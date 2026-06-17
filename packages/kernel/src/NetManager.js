import { EventEmitter } from "../../runtime-node/src/builtins/events.js";

export class VirtualNetSocket extends EventEmitter {
  constructor({ localAddress = "127.0.0.1", localPort = 0, remoteAddress = "127.0.0.1", remotePort = 0 } = {}) {
    super();
    this.localAddress = localAddress;
    this.localPort = localPort;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.readyState = "opening";
    this.destroyed = false;
    this.writable = true;
    this.readable = true;
    this.bytesRead = 0;
    this.bytesWritten = 0;
    this.#encoding = null;
  }

  #encoding;
  #peer;

  attach(peer) {
    this.#peer = peer;
  }

  open() {
    if (this.destroyed) return;
    this.readyState = "open";
    this.emit("connect");
    this.emit("ready");
  }

  setEncoding(encoding) {
    this.#encoding = encoding;
    return this;
  }

  write(chunk, encoding, callback) {
    if (this.destroyed || !this.#peer || this.#peer.destroyed) {
      const error = Object.assign(new Error("Socket is closed"), { code: "ERR_STREAM_DESTROYED" });
      callback?.(error);
      this.emit("error", error);
      return false;
    }
    const payload = typeof chunk === "string" ? chunk : new Uint8Array(chunk);
    const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    this.bytesWritten += byteLength;
    queueMicrotask(() => {
      this.#peer.#receive(payload);
      callback?.();
    });
    return true;
  }

  end(chunk, encoding, callback) {
    if (chunk !== undefined) this.write(chunk, encoding);
    this.readyState = "readOnly";
    queueMicrotask(() => {
      this.#peer?.emit("end");
      this.destroy();
      callback?.();
    });
  }

  destroy(error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.readyState = "closed";
    if (error) this.emit("error", error);
    this.emit("close", Boolean(error));
    return this;
  }

  pause() {
    return this;
  }

  resume() {
    return this;
  }

  setNoDelay() {
    return this;
  }

  setKeepAlive() {
    return this;
  }

  address() {
    return { address: this.localAddress, family: "IPv4", port: this.localPort };
  }

  #receive(payload) {
    if (this.destroyed) return;
    const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    this.bytesRead += byteLength;
    const data = this.#encoding && payload instanceof Uint8Array
      ? new TextDecoder().decode(payload)
      : payload;
    this.emit("data", data);
  }
}

export class NetManager {
  constructor() {
    this.listeners = new Map();
    this.nextEphemeralPort = 43000;
  }

  #key(projectId, port) {
    return `${projectId}:${port}`;
  }

  listen({ projectId = "default", pid, port = 0, host = "0.0.0.0", connectionListener }) {
    const assignedPort = Number(port) || this.nextEphemeralPort++;
    const key = this.#key(projectId, assignedPort);
    if (this.listeners.has(key)) {
      throw Object.assign(new Error(`Port ${assignedPort} is already in use for project ${projectId}`), {
        code: "EADDRINUSE"
      });
    }
    this.listeners.set(key, { projectId, pid, port: assignedPort, host, connectionListener });
    return assignedPort;
  }

  connect({ projectId = "default", port, host = "127.0.0.1" }) {
    if (!isLoopbackHost(host)) {
      throw Object.assign(new Error(`Raw TCP to ${host}:${port} is not supported in Welford Containers V1`), {
        code: "ERR_WELFORD_RAW_TCP_UNSUPPORTED"
      });
    }
    const listener = this.listeners.get(this.#key(projectId, Number(port)));
    if (!listener) {
      throw Object.assign(new Error(`No virtual TCP server is listening on ${projectId}:${port}`), {
        code: "ECONNREFUSED"
      });
    }
    const client = new VirtualNetSocket({
      localAddress: "127.0.0.1",
      localPort: this.nextEphemeralPort++,
      remoteAddress: host,
      remotePort: Number(port)
    });
    const server = new VirtualNetSocket({
      localAddress: listener.host === "0.0.0.0" ? "127.0.0.1" : listener.host,
      localPort: Number(port),
      remoteAddress: "127.0.0.1",
      remotePort: client.localPort
    });
    client.attach(server);
    server.attach(client);
    queueMicrotask(() => {
      listener.connectionListener(server);
      server.open();
      client.open();
    });
    return client;
  }

  unregisterForPid(pid) {
    for (const [key, entry] of this.listeners.entries()) {
      if (entry.pid === pid) this.listeners.delete(key);
    }
  }

  hasPid(pid) {
    for (const entry of this.listeners.values()) {
      if (entry.pid === pid) return true;
    }
    return false;
  }
}

export function isLoopbackHost(host = "127.0.0.1") {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(String(host));
}
