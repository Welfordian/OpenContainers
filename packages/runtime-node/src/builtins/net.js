import { EventEmitter } from "./events.js";
import { isLoopbackHost, VirtualNetSocket } from "../../../kernel/src/NetManager.js";

export function createNetBuiltin({ kernel, process }) {
  class Server extends EventEmitter {
    constructor(connectionListener) {
      super();
      this.listening = false;
      this.connections = 0;
      this.#connectionListener = connectionListener;
    }

    #connectionListener;
    #address = null;

    listen(...args) {
      const options = normalizeListenArgs(args);
      const assignedPort = kernel.listenNet({
        projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
        pid: process.pid,
        port: options.port,
        host: options.host,
        connectionListener: (socket) => {
          this.connections++;
          this.#connectionListener?.(socket);
          this.emit("connection", socket);
          socket.on("close", () => {
            this.connections = Math.max(0, this.connections - 1);
          });
        }
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
      kernel.unregisterPortsForPid(process.pid);
      this.listening = false;
      callback?.();
      this.emit("close");
      return this;
    }

    address() {
      return this.#address;
    }

    getConnections(callback) {
      callback(null, this.connections);
    }
  }

  const connect = (...args) => {
    const options = normalizeConnectArgs(args);
    const socket = kernel.connectNet({
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      port: options.port,
      host: options.host
    });
    process.__opencontainersAddRef?.();
    socket.once("close", () => process.__opencontainersUnref?.());
    options.callback && socket.once("connect", options.callback);
    return socket;
  };

  return {
    Server,
    Socket: VirtualNetSocket,
    createServer: (optionsOrListener, maybeListener) => {
      const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
      return new Server(listener);
    },
    connect,
    createConnection: connect,
    isIP,
    isIPv4: (host) => isIP(host) === 4,
    isIPv6: (host) => isIP(host) === 6,
    isLoopbackHost
  };
}

function normalizeListenArgs(args) {
  let port = 0;
  let host = "0.0.0.0";
  let callback;
  if (typeof args[0] === "object") {
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

function normalizeConnectArgs(args) {
  let port;
  let host = "127.0.0.1";
  let callback;
  if (typeof args[0] === "object") {
    port = args[0].port;
    host = args[0].host ?? args[0].hostname ?? host;
    callback = args[1];
  } else {
    port = args[0];
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: Number(port), host, callback };
}

function isIP(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 4;
  if (String(host).includes(":")) return 6;
  return 0;
}
