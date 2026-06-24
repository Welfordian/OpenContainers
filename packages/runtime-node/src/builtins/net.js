import { EventEmitter } from "./events.js";
import { VirtualNetSocket } from "../../../kernel/src/NetManager.js";

export function createNetBuiltin({ kernel, process }) {
  let defaultAutoSelectFamily = true;
  let defaultAutoSelectFamilyAttemptTimeout = 500;

  class Server extends EventEmitter {
    constructor(options = {}, connectionListener) {
      super();
      this.allowHalfOpen = Boolean(options.allowHalfOpen);
      this.maxConnections = undefined;
      this.dropMaxConnection = false;
      this.listening = false;
      this.connections = 0;
      this.#connectionListener = connectionListener;
    }

    #connectionListener;
    #address = null;
    #projectId = null;
    #port = null;

    listen(...args) {
      const options = normalizeListenArgs(args);
      const assignedPort = kernel.listenNet({
        projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
        pid: process.pid,
        port: options.port,
        host: options.host,
        allowHalfOpen: this.allowHalfOpen,
	        connectionListener: (socket) => {
	          if (socket instanceof VirtualNetSocket && !(socket instanceof Socket)) {
	            Object.setPrototypeOf(socket, Socket.prototype);
	          }
	          if (this.maxConnections !== undefined && this.connections >= Number(this.maxConnections)) {
	            socket.destroy(Object.assign(new Error("Server has reached maxConnections"), { code: "ERR_SERVER_MAX_CONNECTIONS" }));
	            return;
          }
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
      this.#projectId = process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
      this.#port = assignedPort;
      this.listening = true;
      options.callback?.();
      this.emit("listening");
      return this;
    }

    close(callback) {
      if (this.#port !== null) {
        kernel.closeNet?.({ projectId: this.#projectId ?? "default", pid: process.pid, port: this.#port });
      }
      this.listening = false;
      this.#port = null;
      this.#address = null;
      queueMicrotask(() => {
        callback?.();
        this.emit("close");
      });
      return this;
    }

    address() {
      return this.#address;
    }

    getConnections(callback) {
      callback(null, this.connections);
    }

    ref() {
      return this;
    }

    unref() {
      return this;
    }
  }

  let connectSocket;

	  class Socket extends VirtualNetSocket {
	    constructor(options = {}) {
	      super({ allowHalfOpen: options?.allowHalfOpen });
	    }
	  }

  Object.defineProperties(Server, {
    length: {
      configurable: true,
      value: 2
    }
  });

	  Object.defineProperties(Socket, {
	    length: {
	      configurable: true,
	      value: 1
	    }
	  });

	  defineServerAsyncDispose(Server.prototype);
	  defineSocketPrototypeShape(Socket.prototype, function(...args) {
	    return connectSocket(normalizeConnectArgs(args), this);
	  });

  class SocketAddress {
    constructor(options = {}) {
      if (options === null || typeof options !== "object") {
        throw createInvalidArgTypeError("options", "object", options);
      }
      if (options.address !== undefined && typeof options.address !== "string") {
        throw createInvalidPropertyTypeError("options.address", "string", options.address);
      }
      const family = normalizeSocketAddressFamily(options.family === undefined
        ? (String(options.address ?? "").includes(":") ? "ipv6" : "ipv4")
        : options.family);
      const address = options.address ?? (family === "ipv6" ? "::" : "127.0.0.1");
      const port = normalizeSocketAddressPort(options.port === undefined ? 0 : options.port);
      if (options.flowlabel !== undefined && typeof options.flowlabel !== "number") {
        throw createInvalidPropertyTypeError("options.flowlabel", "number", options.flowlabel);
      }
      const flowlabel = family === "ipv6"
        ? normalizeFlowLabel(options.flowlabel ?? 0, 0xfffff)
        : normalizeIPv4FlowLabel(options.flowlabel ?? 0);
      if (isIP(address) !== (family === "ipv6" ? 6 : 4)) {
        throw Object.assign(new Error("Invalid socket address"), { code: "ERR_INVALID_ADDRESS" });
      }
      this.#address = String(address);
      this.#port = port;
      this.#family = family;
      this.#flowlabel = flowlabel;
    }

    #address;
    #port;
    #family;
    #flowlabel;

    get address() {
      return this.#address;
    }

    get port() {
      return this.#port;
    }

    get family() {
      return this.#family;
    }

    get flowlabel() {
      return this.#flowlabel;
    }

    toJSON() {
      return {
        address: this.address,
        port: this.port,
        family: this.family,
        flowlabel: this.flowlabel
      };
    }

    static parse(input) {
      if (typeof input !== "string") throw createInvalidArgTypeError("input", "string", input);
      const ipv6Match = /^\[([^\]]+)\](?::(\d+))?$/.exec(input);
      if (ipv6Match) {
        try {
          return new SocketAddress({ address: ipv6Match[1], port: ipv6Match[2] === undefined ? 0 : ipv6Match[2], family: "ipv6" });
        } catch {
          return undefined;
        }
      }
      const ipv4Match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(input);
      if (ipv4Match) {
        try {
          const port = ipv4Match[2] === undefined ? 0 : normalizeSocketAddressPort(ipv4Match[2]);
          return new SocketAddress({ address: ipv4Match[1], port, family: "ipv4" });
        } catch {
          return undefined;
        }
      }
      return undefined;
    }

    static isSocketAddress(value) {
      return value instanceof SocketAddress;
    }
  }

  class BlockList {
    constructor() {
      this.#entries = [];
      this.#rules = [];
    }

    #entries;
    #rules;

    get rules() {
      return [...this.#rules];
    }

    addAddress(address, family = undefined) {
      const normalized = normalizeAddressRule(address, family);
      this.#entries.push({ type: "address", ...normalized });
      this.#rules.unshift(`Address: ${formatRuleFamily(normalized.family)} ${normalized.address}`);
    }

    addRange(start, end, family = undefined) {
      const normalizedStart = normalizeAddressRule(start, family);
      const normalizedEnd = normalizeAddressRule(end, normalizedStart.family);
      if (normalizedStart.family !== normalizedEnd.family) {
        throw Object.assign(new Error("Invalid socket address"), { code: "ERR_INVALID_ADDRESS" });
      }
      this.#entries.push({
        type: "range",
        family: normalizedStart.family,
        start: normalizedStart.address,
        end: normalizedEnd.address
      });
      this.#rules.unshift(`Range: ${formatRuleFamily(normalizedStart.family)} ${normalizedStart.address}-${normalizedEnd.address}`);
    }

    addSubnet(net, prefix, family = undefined) {
      const normalized = normalizeAddressRule(net, family);
      const normalizedPrefix = normalizeSubnetPrefix(prefix, normalized.family);
      this.#entries.push({
        type: "subnet",
        family: normalized.family,
        address: normalized.address,
        prefix: normalizedPrefix
      });
      this.#rules.unshift(`Subnet: ${formatRuleFamily(normalized.family)} ${normalized.address}/${normalizedPrefix}`);
    }

    check(address, family = undefined) {
      let normalized;
      try {
        normalized = normalizeAddressRule(address, family);
      } catch {
        return false;
      }
      return this.#entries.some((entry) => matchesBlockListEntry(entry, normalized.address, normalized.family));
    }

    toJSON() {
      return this.rules;
    }

    fromJSON(rules) {
      if (!Array.isArray(rules)) throw createInvalidArgTypeError("rules", "Array", rules);
      for (const rule of rules) {
        applyBlockListRule(this, rule);
      }
    }

    static isBlockList(value) {
      return value instanceof BlockList;
    }
  }

  connectSocket = (options, socket = new Socket({ allowHalfOpen: options.allowHalfOpen })) => {
    const connectedSocket = kernel.connectNet({
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      port: options.port,
      host: options.host,
      socket,
      allowHalfOpen: socket.allowHalfOpen ?? options.allowHalfOpen
    });
    process.__opencontainersAddRef?.();
    connectedSocket.once("close", () => process.__opencontainersUnref?.());
    options.callback && connectedSocket.once("connect", options.callback);
    return connectedSocket;
  };

  const connect = (...args) => connectSocket(normalizeConnectArgs(args));
  const createServer = (optionsOrListener, maybeListener) => {
    const options = typeof optionsOrListener === "object" && optionsOrListener !== null ? optionsOrListener : {};
    const listener = typeof optionsOrListener === "function" ? optionsOrListener : maybeListener;
    return new Server(options, listener);
  };
  const isIPv4 = (host) => isIP(host) === 4;
  const isIPv6 = (host) => isIP(host) === 6;
  const getDefaultAutoSelectFamily = () => defaultAutoSelectFamily;
  const setDefaultAutoSelectFamily = (value) => {
    if (typeof value !== "boolean") throw createInvalidArgTypeError("value", "boolean", value);
    defaultAutoSelectFamily = value;
  };
  const getDefaultAutoSelectFamilyAttemptTimeout = () => defaultAutoSelectFamilyAttemptTimeout;
  const setDefaultAutoSelectFamilyAttemptTimeout = (value) => {
    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) {
      throw Object.assign(
        new RangeError(`The value of "value" is out of range. It must be >= 1 && <= 2147483647. Received ${value}`),
        { code: "ERR_OUT_OF_RANGE" }
      );
    }
    defaultAutoSelectFamilyAttemptTimeout = timeout;
  };
  function createServerHandle(_address, _port, _addressType, _fd, _flags) {
    throw createUnsupportedNetError("net._createServerHandle");
  }
  for (const fn of [
    connect,
    createServer,
    isIPv4,
    isIPv6,
    getDefaultAutoSelectFamily,
    setDefaultAutoSelectFamily,
    getDefaultAutoSelectFamilyAttemptTimeout,
    setDefaultAutoSelectFamilyAttemptTimeout
  ]) {
    defineOwnFunctionPrototype(fn);
  }

  return {
    _createServerHandle: createServerHandle,
    _normalizeArgs: normalizeLegacyArgs,
    get BlockList() {
      return BlockList;
    },
    get SocketAddress() {
      return SocketAddress;
    },
    connect,
    createConnection: connect,
    createServer,
    isIP,
    isIPv4,
    isIPv6,
    Server,
    Socket,
    Stream: Socket,
    getDefaultAutoSelectFamily,
    setDefaultAutoSelectFamily,
    getDefaultAutoSelectFamilyAttemptTimeout,
    setDefaultAutoSelectFamilyAttemptTimeout
  };
}

function normalizeLegacyArgs(args) {
  const list = Array.from(args ?? []);
  const callback = typeof list[list.length - 1] === "function" ? list[list.length - 1] : undefined;
  const first = list[0];

  if (first && typeof first === "object") return [first, callback];
  if (typeof first === "string") return [{ path: first }, callback];
  if (list.length === 0) return [{}, callback];

  const options = { port: first };
  if (typeof list[1] === "string") options.host = list[1];
  return [options, callback];
}

Object.defineProperty(normalizeLegacyArgs, "name", {
  configurable: true,
  value: "normalizeArgs"
});

function defineOwnFunctionPrototype(fn) {
  if (Object.hasOwn(fn, "prototype")) return;
  const prototype = {};
  Object.defineProperty(prototype, "constructor", {
    configurable: true,
    writable: true,
    value: fn
  });
  Object.defineProperty(fn, "prototype", {
    configurable: false,
    enumerable: false,
    writable: true,
    value: prototype
  });
}

function defineSocketPrototypeShape(prototype, connect) {
  delete prototype.connect;
  setFunctionName(connect, "");
  const setNoDelay = setFunctionName(function(noDelay) {
    return VirtualNetSocket.prototype.setNoDelay.call(this, noDelay);
  }, "");
  const setKeepAlive = setFunctionName(function(enable, initialDelay) {
    return VirtualNetSocket.prototype.setKeepAlive.call(this, enable, initialDelay);
  }, "");
  const address = setFunctionName(function() {
    return VirtualNetSocket.prototype.address.call(this);
  }, "");
  const ref = setFunctionName(function() {
    return VirtualNetSocket.prototype.ref.call(this);
  }, "");
  const unref = setFunctionName(function() {
    return VirtualNetSocket.prototype.unref.call(this);
  }, "");
  const destroySoon = setFunctionName(function() {
    return VirtualNetSocket.prototype.destroySoon.call(this);
  }, "");
	  const resetAndDestroy = setFunctionName(function() {
	    return VirtualNetSocket.prototype.resetAndDestroy.call(this);
	  }, "");
	  const end = setFunctionName(function(chunk, encoding, callback) {
	    return VirtualNetSocket.prototype.end.call(this, chunk, encoding, callback);
	  }, "");
	  const pause = setFunctionName(function() {
	    return VirtualNetSocket.prototype.pause.call(this);
	  }, "");
	  const resume = setFunctionName(function() {
	    return VirtualNetSocket.prototype.resume.call(this);
	  }, "");

	  Object.defineProperties(prototype, {
    setTimeout: dataDescriptor(function setStreamTimeout(timeout, callback) {
      return VirtualNetSocket.prototype.setTimeout.call(this, timeout, callback);
    }),
    setNoDelay: dataDescriptor(setNoDelay),
    setKeepAlive: dataDescriptor(setKeepAlive),
    address: dataDescriptor(address),
	    pending: accessorDescriptor(nonConstructableStateGetter("get", "pending", true), false, true),
	    readyState: accessorDescriptor(constructableStateGetter("get", "readyState", "open"), false, false),
	    bufferSize: accessorDescriptor(constructableStateGetter("get", "bufferSize", undefined), false, false),
	    end: dataDescriptor(end),
	    resetAndDestroy: dataDescriptor(resetAndDestroy),
	    pause: dataDescriptor(pause),
	    resume: dataDescriptor(resume),
	    destroySoon: dataDescriptor(destroySoon),
    bytesRead: accessorDescriptor(constructableStateGetter("bytesRead", "bytesRead", 0), true, false),
    remoteAddress: accessorDescriptor(constructableStateGetter("remoteAddress", "remoteAddress", undefined), true, false),
    remoteFamily: accessorDescriptor(constructableStateGetter("remoteFamily", "remoteFamily", undefined), true, false),
    remotePort: accessorDescriptor(constructableStateGetter("remotePort", "remotePort", undefined), true, false),
    localAddress: accessorDescriptor(constructableStateGetter("localAddress", "localAddress", undefined), true, false),
    localPort: accessorDescriptor(constructableStateGetter("localPort", "localPort", undefined), true, false),
    localFamily: accessorDescriptor(constructableStateGetter("localFamily", "localFamily", undefined), true, false),
    bytesWritten: accessorDescriptor(constructableStateGetter("bytesWritten", "bytesWritten", 0), true, false),
    connect: dataDescriptor(connect),
    ref: dataDescriptor(ref),
    unref: dataDescriptor(unref)
  });
}

function dataDescriptor(value) {
  return {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  };
}

function accessorDescriptor(get, enumerable, configurable) {
  return {
    get,
    enumerable,
    configurable
  };
}

function constructableStateGetter(name, stateName, fallback) {
  return setFunctionName(function get() {
    return socketStateValue(this, stateName, fallback);
  }, name);
}

function nonConstructableStateGetter(name, stateName, fallback) {
  const descriptor = Object.getOwnPropertyDescriptor({
    get value() {
      return socketStateValue(this, stateName, fallback);
    }
  }, "value");
  return setFunctionName(descriptor.get, name);
}

function socketStateValue(socket, stateName, fallback) {
  const descriptor = Object.getOwnPropertyDescriptor(socket, stateName);
  return descriptor && "value" in descriptor ? descriptor.value : fallback;
}

function setFunctionName(fn, name) {
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
  return fn;
}

function defineServerAsyncDispose(prototype) {
  if (typeof Symbol.asyncDispose !== "symbol") return;
  const asyncDispose = async function() {
    await new Promise((resolve, reject) => {
      try {
        this.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  };
  Object.defineProperty(asyncDispose, "name", {
    configurable: true,
    value: ""
  });
  Object.defineProperty(prototype, Symbol.asyncDispose, {
    value: asyncDispose,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function createUnsupportedNetError(api) {
  return Object.assign(new Error(`${api} is not supported in OpenContainers V1`), {
    code: "ERR_OPENCONTAINERS_NET_UNSUPPORTED"
  });
}

function applyBlockListRule(blockList, rule) {
  const text = String(rule);
  let match = /^Address: (IPv4|IPv6) (.+)$/.exec(text);
  if (match) {
    blockList.addAddress(match[2], parseRuleFamily(match[1]));
    return;
  }

  match = /^Range: (IPv4|IPv6) (.+)-(.+)$/.exec(text);
  if (match) {
    blockList.addRange(match[2], match[3], parseRuleFamily(match[1]));
    return;
  }

  match = /^Subnet: (IPv4|IPv6) (.+)\/(\d+)$/.exec(text);
  if (match) {
    blockList.addSubnet(match[2], Number(match[3]), parseRuleFamily(match[1]));
    return;
  }

  throw createInvalidArgValueError("rules", rule);
}

function parseRuleFamily(family) {
  return family === "IPv6" ? "ipv6" : "ipv4";
}

function normalizeListenArgs(args) {
  let port = 0;
  let host = "0.0.0.0";
  let callback;
  if (typeof args[0] === "object" && args[0] !== null) {
    port = args[0].port ?? 0;
    host = args[0].host ?? host;
    callback = args[1];
  } else {
    port = args[0] ?? 0;
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: normalizeServerPort(port), host, callback };
}

function normalizeConnectArgs(args) {
  if (isMissingConnectTarget(args)) throw createMissingConnectArgsError();
  let port;
  let host = "127.0.0.1";
  let callback;
  let allowHalfOpen = false;
  if (typeof args[0] === "object") {
    port = args[0].port;
    host = args[0].host ?? args[0].hostname ?? host;
    allowHalfOpen = Boolean(args[0].allowHalfOpen);
    callback = args[1];
  } else {
    port = args[0];
    if (typeof args[1] === "string") host = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: normalizeConnectPort(port), host, callback, allowHalfOpen };
}

function isMissingConnectTarget(args) {
  if (args.length === 0) return true;
  const first = args[0];
  if (first !== null && typeof first === "object") {
    return first.port === undefined && first.path === undefined;
  }
  return false;
}

function isIP(host) {
  if (isIPv4Address(host)) return 4;
  if (isIPv6Address(host)) return 6;
  return 0;
}

function isIPv4Address(host) {
  if (typeof host !== "string") return false;
  const parts = host.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255 && part === String(value);
  });
}

function isIPv6Address(host) {
  if (typeof host !== "string" || !host.includes(":")) return false;
  if (host === "::") return true;
  return /^[0-9a-fA-F:]+$/.test(host) && host.split("::").length <= 2;
}

function normalizeFamily(family) {
  const normalized = family.toLowerCase();
  if (normalized === "ipv4") return "ipv4";
  if (normalized === "ipv6") return "ipv6";
  throw createInvalidArgValueError("options.family", family);
}

function normalizeSocketAddressFamily(family) {
  return normalizeFamily(String(family));
}

function normalizeBlockListFamily(family) {
  if (typeof family !== "string") throw createInvalidArgTypeError("family", "string", family);
  return normalizeFamily(family);
}

function normalizeSocketAddressPort(value) {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.trim() === "")) {
    throw createSocketBadPortError("options.port", value);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port >= 65536) {
    throw createSocketBadPortError("options.port", value);
  }
  return port;
}

function normalizeServerPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port >= 65536) {
    throw createSocketBadPortError("options.port", value);
  }
  return port;
}

function normalizeConnectPort(value) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw createInvalidPortTypeError(value);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port >= 65536) {
    throw createSocketBadPortError("Port", value);
  }
  return port;
}

function createSocketBadPortError(label, value) {
  return Object.assign(
    new RangeError(`${label} should be >= 0 and < 65536. Received ${formatPortValue(value)}.`),
    { code: "ERR_SOCKET_BAD_PORT" }
  );
}

function createInvalidPortTypeError(value) {
  return Object.assign(
    new TypeError(`The "options.port" property must be one of type number or string. Received ${formatInvalidPortType(value)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function formatPortValue(value) {
  if (typeof value === "string") return `type string ('${value}')`;
  if (value === null) return "null";
  return `type ${typeof value} (${String(value)})`;
}

function formatInvalidPortType(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return `function ${value.name ?? ""}`;
  return `type ${typeof value}`;
}

function normalizeFlowLabel(value, max = 0xffffffff) {
  const flowlabel = Number(value);
  if (!Number.isInteger(flowlabel) || flowlabel < 0 || flowlabel > max) {
    throw Object.assign(
      new RangeError(`The value of "options.flowlabel" is out of range. It must be >= 0 && <= ${max}. Received ${value}`),
      { code: "ERR_OUT_OF_RANGE" }
    );
  }
  return flowlabel;
}

function normalizeIPv4FlowLabel(value) {
  normalizeFlowLabel(value);
  return 0;
}

function normalizeAddressRule(address, family = undefined) {
  if (typeof address !== "string") throw createInvalidArgTypeError("address", "string", address);
  const stringAddress = address;
  const detected = isIP(stringAddress);
  if (!detected) throw Object.assign(new Error("Invalid socket address"), { code: "ERR_INVALID_ADDRESS" });
  const normalizedFamily = family === undefined ? (detected === 6 ? "ipv6" : "ipv4") : normalizeBlockListFamily(family);
  if ((normalizedFamily === "ipv6" ? 6 : 4) !== detected) {
    throw Object.assign(new Error("Invalid socket address"), { code: "ERR_INVALID_ADDRESS" });
  }
  return { address: stringAddress, family: normalizedFamily };
}

function normalizeSubnetPrefix(prefix, family) {
  const max = family === "ipv6" ? 128 : 32;
  const value = Number(prefix);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw Object.assign(
      new RangeError(`The value of "prefix" is out of range. It must be >= 0 && <= ${max}. Received ${prefix}`),
      { code: "ERR_OUT_OF_RANGE" }
    );
  }
  return value;
}

function matchesBlockListEntry(entry, address, family) {
  if (entry.family !== family) return false;
  if (entry.type === "address") return entry.address === address;
  if (family !== "ipv4") return false;
  const value = ipv4ToNumber(address);
  if (entry.type === "range") {
    const start = ipv4ToNumber(entry.start);
    const end = ipv4ToNumber(entry.end);
    return value >= Math.min(start, end) && value <= Math.max(start, end);
  }
  if (entry.type === "subnet") {
    const mask = entry.prefix === 0 ? 0 : (0xffffffff << (32 - entry.prefix)) >>> 0;
    return (value & mask) === (ipv4ToNumber(entry.address) & mask);
  }
  return false;
}

function ipv4ToNumber(address) {
  return address.split(".").reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}

function formatRuleFamily(family) {
  return family === "ipv6" ? "IPv6" : "IPv4";
}

function createInvalidArgTypeError(name, expected, value) {
  return Object.assign(
    new TypeError(`The "${name}" argument must be of type ${expected}. Received type ${typeof value}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function createInvalidPropertyTypeError(name, expected, value) {
  return Object.assign(
    new TypeError(`The "${name}" property must be of type ${expected}. Received ${formatInvalidPropertyType(value)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function formatInvalidPropertyType(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  return `type ${typeof value} (${String(value)})`;
}

function createInvalidArgValueError(name, value) {
  return Object.assign(
    new TypeError(`The property "${name}" is invalid. Received ${value}`),
    { code: "ERR_INVALID_ARG_VALUE" }
  );
}

function createMissingConnectArgsError() {
  return Object.assign(
    new TypeError('The "options" or "port" or "path" argument must be specified'),
    { code: "ERR_MISSING_ARGS" }
  );
}
