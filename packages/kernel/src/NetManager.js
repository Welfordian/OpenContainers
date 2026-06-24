import { EventEmitter } from "../../runtime-node/src/builtins/events.js";

export class VirtualNetSocket extends EventEmitter {
	  constructor({
	    localAddress = undefined,
	    localPort = undefined,
	    remoteAddress = undefined,
	    remotePort = undefined,
	    allowHalfOpen = false
	  } = {}) {
	    super();
	    defineSocketStateProperties(this, {
	      localAddress,
	      localPort,
	      localFamily: localAddress === undefined ? undefined : isIpV6(localAddress) ? "IPv6" : "IPv4",
	      remoteAddress,
	      remotePort,
	      remoteFamily: remoteAddress === undefined ? undefined : isIpV6(remoteAddress) ? "IPv6" : "IPv4",
	      allowHalfOpen: Boolean(allowHalfOpen),
	      readyState: "open",
	      connecting: false,
	      pending: true,
	      destroyed: false,
	      closed: false,
	      writable: true,
	      readable: true,
	      writableEnded: false,
	      writableFinished: false,
	      readableEnded: false,
	      errored: null,
	      timeout: 0,
	      bytesRead: 0,
	      bytesWritten: 0
	    });
	    this.#encoding = null;
	  }

  #encoding;
  #peer;
  #paused = false;
  #readQueue = [];
  #pendingEnd = false;
  #timeoutHandle = null;
  #noDelay = false;
  #keepAlive = false;
  #keepAliveInitialDelay = 0;

  configureEndpoint({
    localAddress = this.localAddress,
    localPort = this.localPort,
    remoteAddress = this.remoteAddress,
    remotePort = this.remotePort,
    allowHalfOpen = this.allowHalfOpen
	  } = {}) {
	    defineSocketStateProperties(this, {
	      localAddress,
	      localPort: Number(localPort) || 0,
	      localFamily: isIpV6(localAddress) ? "IPv6" : "IPv4",
	      remoteAddress,
	      remotePort: Number(remotePort) || 0,
	      remoteFamily: isIpV6(remoteAddress) ? "IPv6" : "IPv4",
	      allowHalfOpen: Boolean(allowHalfOpen),
	      readyState: "opening",
	      connecting: true,
	      pending: true,
	      destroyed: false,
	      closed: false,
	      writable: true,
	      readable: true,
	      writableEnded: false,
	      writableFinished: false,
	      readableEnded: false,
	      errored: null,
	      bytesRead: 0,
	      bytesWritten: 0
	    });
	    this.#readQueue = [];
	    this.#pendingEnd = false;
	    return this;
	  }

  attach(peer) {
    this.#peer = peer;
  }

  open() {
    if (this.destroyed) return;
    this.connecting = false;
    this.pending = false;
    this.readyState = "open";
    this.#refreshTimeout();
    this.emit("connect");
    this.emit("ready");
  }

  setEncoding(encoding) {
    this.#encoding = encoding;
    return this;
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    if (this.destroyed || this.writableEnded || !this.#peer || this.#peer.destroyed) {
      const error = Object.assign(new Error("Socket is closed"), { code: "ERR_STREAM_DESTROYED" });
      callback?.(error);
      if (!callback || this.listenerCount("error") > 0) this.emit("error", error);
      return false;
    }
    const payload = normalizeSocketChunk(chunk, encoding);
    const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    this.bytesWritten += byteLength;
    this.#refreshTimeout();
    queueMicrotask(() => {
      if (this.destroyed || !this.#peer || this.#peer.destroyed) {
        const error = Object.assign(new Error("Socket is closed"), { code: "ERR_STREAM_DESTROYED" });
        callback?.(error);
        if (!callback || this.listenerCount("error") > 0) this.emit("error", error);
        return;
      }
      this.#peer.#receive(payload);
      callback?.();
      this.emit("drain");
    });
    return true;
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
    this.#finishWritable(callback);
    return this;
  }

  #finishWritable(callback) {
    if (this.writableEnded) {
      callback?.();
      return;
    }
    this.writable = false;
    this.writableEnded = true;
    this.writableFinished = true;
    this.readyState = this.readable && !this.readableEnded ? "readOnly" : "closed";
    queueMicrotask(() => {
      this.emit("finish");
      this.#peer?.#receiveEnd();
      if (!this.allowHalfOpen || this.readableEnded) this.destroy();
      callback?.();
    });
  }

  destroy(error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.closed = true;
    this.connecting = false;
    this.pending = false;
    this.writable = false;
    this.readable = false;
    this.readyState = "closed";
    this.errored = error ?? null;
    this.#clearTimeoutHandle();
    if (error && this.listenerCount("error") > 0) this.emit("error", error);
    else if (error) this.errored = error;
    this.emit("close", Boolean(error));
    return this;
  }

  destroySoon() {
    if (this.writable && !this.writableEnded) this.end();
    else this.destroy();
    return this;
  }

  resetAndDestroy() {
    return this.destroy(Object.assign(new Error("Socket reset"), { code: "ECONNRESET" }));
  }

  pause() {
    this.#paused = true;
    return this;
  }

  resume() {
    this.#paused = false;
    this.#flushReadQueue();
    return this;
  }

  setTimeout(timeout = 0, callback) {
    this.timeout = Math.max(0, Number(timeout) || 0);
    if (typeof callback === "function") this.once("timeout", callback);
    this.#refreshTimeout();
    return this;
  }

  setNoDelay(noDelay = true) {
    this.#noDelay = Boolean(noDelay);
    return this;
  }

  setKeepAlive(enable = false, initialDelay = 0) {
    this.#keepAlive = Boolean(enable);
    this.#keepAliveInitialDelay = Number(initialDelay) || 0;
    return this;
  }

  ref() {
    return this;
  }

  unref() {
    return this;
  }

	  address() {
	    if (this.localAddress === undefined && this.localPort === undefined) return {};
	    return { address: this.localAddress, family: this.localFamily, port: this.localPort };
	  }

  #receive(payload) {
    if (this.destroyed || this.readableEnded) return;
    const byteLength = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    this.bytesRead += byteLength;
    this.#refreshTimeout();
    if (this.#paused) {
      this.#readQueue.push(payload);
      return;
    }
    this.#emitData(payload);
  }

  #receiveEnd() {
    if (this.destroyed || this.readableEnded) return;
    this.readable = false;
    this.readableEnded = true;
    this.readyState = this.writable && !this.writableEnded ? "writeOnly" : "closed";
    if (this.#paused && this.#readQueue.length) {
      this.#pendingEnd = true;
      return;
    }
    this.#emitEnd();
  }

  #emitEnd() {
    if (this.destroyed) return;
    this.emit("end");
    if (!this.allowHalfOpen && !this.writableEnded) {
      this.#finishWritable();
      return;
    }
    if (this.writableEnded || !this.allowHalfOpen) {
      queueMicrotask(() => this.destroy());
    }
  }

  #emitData(payload) {
    const data = this.#encoding && payload instanceof Uint8Array
      ? new TextDecoder(this.#encoding).decode(payload)
      : payload;
    this.emit("data", data);
  }

  #flushReadQueue() {
    while (!this.#paused && this.#readQueue.length && !this.destroyed) {
      this.#emitData(this.#readQueue.shift());
    }
    if (!this.#paused && this.#pendingEnd) {
      this.#pendingEnd = false;
      this.#emitEnd();
    }
  }

  #refreshTimeout() {
    this.#clearTimeoutHandle();
    if (!this.timeout || this.destroyed) return;
    this.#timeoutHandle = globalThis.setTimeout(() => {
      this.#timeoutHandle = null;
      if (!this.destroyed) this.emit("timeout");
    }, this.timeout);
  }

  #clearTimeoutHandle() {
    if (!this.#timeoutHandle) return;
    globalThis.clearTimeout(this.#timeoutHandle);
    this.#timeoutHandle = null;
  }
}

function defineSocketStateProperties(socket, state) {
  for (const [name, value] of Object.entries(state)) {
    Object.defineProperty(socket, name, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
}

function normalizeSocketChunk(chunk, encoding) {
  if (chunk === undefined || chunk === null) return "";
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk.slice(0));
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
  }
  return new TextEncoder().encode(String(chunk));
}

export class NetManager {
  constructor() {
    this.listeners = new Map();
    this.udpListeners = new Map();
    this.nextEphemeralPort = 43000;
  }

  #key(projectId, port) {
    return `${projectId}:${port}`;
  }

  listen({ projectId = "default", pid, port = 0, host = "0.0.0.0", connectionListener, allowHalfOpen = false }) {
    const assignedPort = Number(port) || this.nextEphemeralPort++;
    const key = this.#key(projectId, assignedPort);
    if (this.listeners.has(key)) {
      throw Object.assign(new Error(`Port ${assignedPort} is already in use for project ${projectId}`), {
        code: "EADDRINUSE"
      });
    }
    this.listeners.set(key, { projectId, pid, port: assignedPort, host, connectionListener, allowHalfOpen: Boolean(allowHalfOpen) });
    return assignedPort;
  }

  unlisten({ projectId = "default", port }) {
    return this.listeners.delete(this.#key(projectId, Number(port)));
  }

  connect({ projectId = "default", port, host = "127.0.0.1", socket, allowHalfOpen = false }) {
    if (!isLoopbackHost(host)) {
      throw Object.assign(new Error(`Raw TCP to ${host}:${port} is not supported in OpenContainers V1`), {
        code: "ERR_OPENCONTAINERS_RAW_TCP_UNSUPPORTED"
      });
    }
    const listener = this.listeners.get(this.#key(projectId, Number(port)));
    if (!listener) {
      throw Object.assign(new Error(`No virtual TCP server is listening on ${projectId}:${port}`), {
        code: "ECONNREFUSED"
      });
    }
    const client = socket instanceof VirtualNetSocket ? socket.configureEndpoint({
      localAddress: "127.0.0.1",
      localPort: this.nextEphemeralPort++,
      remoteAddress: host,
      remotePort: Number(port),
      allowHalfOpen
    }) : new VirtualNetSocket({
      localAddress: "127.0.0.1",
      localPort: this.nextEphemeralPort++,
      remoteAddress: host,
      remotePort: Number(port),
      allowHalfOpen
    });
    const server = new VirtualNetSocket({
      localAddress: listener.host === "0.0.0.0" ? "127.0.0.1" : listener.host,
      localPort: Number(port),
      remoteAddress: "127.0.0.1",
      remotePort: client.localPort,
      allowHalfOpen: listener.allowHalfOpen
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

  listenUdp({ projectId = "default", pid, port = 0, host = "0.0.0.0", socket }) {
    const assignedPort = Number(port) || this.nextEphemeralPort++;
    const key = this.#key(projectId, assignedPort);
    if (this.udpListeners.has(key)) {
      throw Object.assign(new Error(`UDP port ${assignedPort} is already in use for project ${projectId}`), {
        code: "EADDRINUSE"
      });
    }
    this.udpListeners.set(key, { projectId, pid, port: assignedPort, host, socket });
    return assignedPort;
  }

  unlistenUdp({ projectId = "default", port, socket }) {
    const key = this.#key(projectId, Number(port));
    const entry = this.udpListeners.get(key);
    if (!entry) return false;
    if (socket && entry.socket !== socket) return false;
    this.udpListeners.delete(key);
    return true;
  }

  sendUdp({
    projectId = "default",
    port,
    host = "127.0.0.1",
    message,
    remoteAddress = "127.0.0.1",
    remotePort = 0
  }) {
    if (!isLoopbackHost(host)) {
      throw Object.assign(new Error(`Raw UDP to ${host}:${port} is not supported in OpenContainers V1`), {
        code: "ERR_OPENCONTAINERS_RAW_UDP_UNSUPPORTED"
      });
    }

    const listener = this.udpListeners.get(this.#key(projectId, Number(port)));
    if (!listener) return false;

    queueMicrotask(() => {
      listener.socket?.__opencontainersReceive?.(message, {
        address: remoteAddress,
        family: isIpV6(remoteAddress) ? "IPv6" : "IPv4",
        port: Number(remotePort),
        size: message.byteLength ?? message.length ?? 0
      });
    });
    return true;
  }

  unregisterForPid(pid) {
    for (const [key, entry] of this.listeners.entries()) {
      if (entry.pid === pid) this.listeners.delete(key);
    }
    for (const [key, entry] of this.udpListeners.entries()) {
      if (entry.pid === pid) this.udpListeners.delete(key);
    }
  }

  hasPid(pid) {
    for (const entry of this.listeners.values()) {
      if (entry.pid === pid) return true;
    }
    for (const entry of this.udpListeners.values()) {
      if (entry.pid === pid) return true;
    }
    return false;
  }
}

export function isLoopbackHost(host = "127.0.0.1") {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(String(host));
}

function isIpV6(host) {
  return String(host).includes(":");
}
