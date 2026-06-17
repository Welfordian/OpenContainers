import { RuntimeBuffer } from "../../runtime-node/src/builtins/buffer.js";
import { EventEmitter } from "../../runtime-node/src/builtins/events.js";

export class PortManager extends EventEmitter {
  constructor() {
    super();
    this.ports = new Map();
    this.nextEphemeralPort = 49152;
  }

  #key(projectId, port) {
    return `${projectId}:${port}`;
  }

  register({ projectId = "default", pid, port = 0, host = "0.0.0.0", handler }) {
    const assignedPort = Number(port) || this.nextEphemeralPort++;
    const key = this.#key(projectId, assignedPort);
    if (this.ports.has(key)) {
      throw Object.assign(new Error(`Port ${assignedPort} is already in use for project ${projectId}`), {
        code: "EADDRINUSE"
      });
    }
    const entry = { projectId, pid, port: assignedPort, host, handler };
    this.ports.set(key, entry);
    this.emit("register", entry);
    return assignedPort;
  }

  unregister(projectId, port) {
    const key = this.#key(projectId, port);
    const entry = this.ports.get(key);
    if (!entry) return;
    this.ports.delete(key);
    this.emit("unregister", entry);
  }

  unregisterForPid(pid) {
    for (const [key, entry] of this.ports) {
      if (entry.pid === pid) {
        this.ports.delete(key);
        this.emit("unregister", entry);
      }
    }
  }

  get(projectId, port) {
    return this.ports.get(this.#key(projectId, port));
  }

  list(projectId = "default") {
    return [...this.ports.values()]
      .filter((entry) => entry.projectId === projectId)
      .map(({ projectId, pid, port, host }) => ({ projectId, pid, port, host }));
  }

  hasPid(pid) {
    for (const entry of this.ports.values()) {
      if (entry.pid === pid) return true;
    }
    return false;
  }

  async dispatch(request) {
    const projectId = request.projectId ?? "default";
    const port = request.port;
    const entry = this.ports.get(this.#key(projectId, port));
    if (!entry) {
      return {
        status: 502,
        statusText: "Bad Gateway",
        headers: [["content-type", "text/plain"]],
        body: RuntimeBuffer.from(`No virtual server is listening on ${projectId}:${port}`)
      };
    }
    return entry.handler(request);
  }
}
