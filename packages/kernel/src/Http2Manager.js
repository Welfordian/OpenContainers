import { isLoopbackHost } from "./NetManager.js";

export class Http2Manager {
  constructor({ net }) {
    this.net = net;
    this.servers = new Map();
  }

  #key(projectId, port) {
    return `${projectId}:${port}`;
  }

  listen({ projectId = "default", pid, port = 0, host = "0.0.0.0", server }) {
    const assignedPort = this.net.listen({
      projectId,
      pid,
      port,
      host,
      connectionListener: (socket) => {
        socket.destroy(Object.assign(new Error("Raw HTTP/2 frames are not supported in OpenContainers V1; use node:http2 virtual sessions."), {
          code: "ERR_OPENCONTAINERS_HTTP2_WIRE_UNSUPPORTED"
        }));
      }
    });
    this.servers.set(this.#key(projectId, assignedPort), {
      projectId,
      pid,
      port: assignedPort,
      host,
      server
    });
    return assignedPort;
  }

  close({ projectId = "default", port, server }) {
    const key = this.#key(projectId, Number(port));
    const entry = this.servers.get(key);
    if (!entry) return false;
    if (server && entry.server !== server) return false;
    this.servers.delete(key);
    this.net.unlisten({ projectId, port: Number(port) });
    return true;
  }

  connect({ projectId = "default", port, host = "localhost" }) {
    if (!isLoopbackHost(host)) {
      throw Object.assign(new Error(`HTTP/2 to ${host}:${port} is not supported in OpenContainers V1`), {
        code: "ERR_OPENCONTAINERS_HTTP2_UNSUPPORTED"
      });
    }
    const entry = this.servers.get(this.#key(projectId, Number(port)));
    if (!entry) {
      throw Object.assign(new Error(`No virtual HTTP/2 server is listening on ${projectId}:${port}`), {
        code: "ECONNREFUSED"
      });
    }
    return entry.server;
  }

  unregisterForPid(pid) {
    for (const [key, entry] of this.servers.entries()) {
      if (entry.pid === pid) this.servers.delete(key);
    }
  }

  hasPid(pid) {
    for (const entry of this.servers.values()) {
      if (entry.pid === pid) return true;
    }
    return false;
  }
}
