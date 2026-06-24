import { EventEmitter } from "./events.js";
import { RuntimeBuffer } from "./buffer.js";

const SUPPORTED_TYPES = new Set(["udp4", "udp6"]);

export function createDgramBuiltin({ kernel, process }) {
  class SocketImpl extends EventEmitter {
    constructor(typeOrOptions, callback) {
      super();
      const options = normalizeSocketOptions(typeOrOptions);
      this.type = options.type;
      this.reuseAddr = Boolean(options.reuseAddr);
      this.recvBufferSize = 0;
      this.sendBufferSize = 0;
      this.#projectId = process.env.OPENCONTAINERS_PROJECT_ID ?? "default";
      this.#pid = process.pid;
      if (typeof callback === "function") this.on("message", callback);
      Object.defineProperty(this, "__opencontainersReceive", {
        configurable: true,
        value: (message, rinfo) => this.#receive(message, rinfo)
      });
      this.#attachAbortSignal(options.signal);
    }

    #projectId;
    #pid;
    #address = null;
    #closed = false;
    #connected = null;
    #refRequested = true;
    #refed = false;
    #abortSignal = undefined;
    #abortListener = undefined;

    bind(...args) {
      this.#assertOpen();
      if (this.#address) {
        throw Object.assign(new Error("Socket is already bound"), { code: "ERR_SOCKET_ALREADY_BOUND" });
      }
      const options = normalizeBindArgs(args);
      const assignedPort = kernel.listenDgram({
        projectId: this.#projectId,
        pid: this.#pid,
        port: options.port,
        host: options.address,
        socket: this
      });
      this.#address = {
        address: normalizePublicAddress(options.address, this.type),
        family: this.type === "udp6" ? "IPv6" : "IPv4",
        port: assignedPort
      };
      this.#applyRef();
      queueMicrotask(() => {
        if (this.#closed) return;
        this.emit("listening");
        options.callback?.();
      });
      return this;
    }

    connect(...args) {
      this.#assertOpen();
      const options = normalizeConnectArgs(args);
      this.#connected = { port: options.port, address: options.address };
      if (!this.#address) this.bind(0, this.type === "udp6" ? "::" : "0.0.0.0");
      queueMicrotask(() => {
        if (this.#closed) return;
        this.emit("connect");
        options.callback?.();
      });
      return this;
    }

    disconnect() {
      if (!this.#connected) {
        throw Object.assign(new Error("Not connected"), { code: "ERR_SOCKET_DGRAM_NOT_CONNECTED" });
      }
      this.#connected = null;
    }

    sendto(message, ...args) {
      return this.send(message, ...args);
    }

    send(message, ...args) {
      this.#assertOpen();
      const options = normalizeSendArgs(args, this.#connected);
      if (options.port === undefined) {
        throw Object.assign(new TypeError("Port is required unless the socket is connected"), {
          code: "ERR_SOCKET_BAD_PORT"
        });
      }

      if (!this.#address) this.bind(0, this.type === "udp6" ? "::" : "0.0.0.0");

      const payload = normalizeMessage(message, options.offset, options.length);
      let delivered = false;
      try {
        delivered = kernel.sendDgram({
          projectId: this.#projectId,
          port: options.port,
          host: options.address,
          message: payload,
          remoteAddress: effectiveOutboundAddress(this.#address.address, this.type),
          remotePort: this.#address.port
        });
      } catch (error) {
        if (options.callback) queueMicrotask(() => options.callback(error));
        else queueMicrotask(() => this.emit("error", error));
        return;
      }

      queueMicrotask(() => {
        options.callback?.(null, payload.length);
        if (!delivered) {
          this.emit("drop", {
            address: options.address,
            family: this.type === "udp6" ? "IPv6" : "IPv4",
            port: options.port,
            size: payload.length
          });
        }
      });
    }

    close(callback) {
      if (this.#closed) {
        throw Object.assign(new Error("Not running"), { code: "ERR_SOCKET_DGRAM_NOT_RUNNING" });
      }
      return this.#close(callback);
    }

    #close(callback) {
      const onClose = typeof callback === "function" ? callback : undefined;
      this.#closed = true;
      if (this.#address) {
        kernel.closeDgram({
          projectId: this.#projectId,
          port: this.#address.port,
          socket: this
        });
        this.#address = null;
      }
      this.#detachAbortSignal();
      this.#removeRef();
      queueMicrotask(() => {
        onClose?.();
        this.emit("close");
      });
      return this;
    }

    address() {
      if (!this.#address) {
        throw Object.assign(new Error("Socket is not bound"), { code: "EBADF" });
      }
      return { ...this.#address };
    }

    remoteAddress() {
      if (this.#closed) {
        throw Object.assign(new Error("Not running"), { code: "ERR_SOCKET_DGRAM_NOT_RUNNING" });
      }
      if (!this.#connected) {
        throw Object.assign(new Error("Not connected"), { code: "ERR_SOCKET_DGRAM_NOT_CONNECTED" });
      }
      return {
        address: this.#connected.address,
        family: this.type === "udp6" ? "IPv6" : "IPv4",
        port: this.#connected.port
      };
    }

    setBroadcast() {
      this.#assertOpen();
      this.#assertBound("setBroadcast");
    }

    setTTL(ttl) {
      const value = normalizeTtl(ttl);
      this.#assertOpen();
      this.#assertBound("setTTL");
      return value;
    }

    setMulticastTTL(ttl) {
      normalizeMulticastTtl(ttl);
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    setMulticastLoopback() {
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    setMulticastInterface(interfaceAddress) {
      validateStringArgument("interfaceAddress", interfaceAddress);
      if (interfaceAddress === "") {
        throw Object.assign(new Error("setMulticastInterface EINVAL"), { code: "EINVAL" });
      }
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    addMembership(multicastAddress) {
      validateMembershipAddress("addMembership", multicastAddress);
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    dropMembership(multicastAddress) {
      validateMembershipAddress("dropMembership", multicastAddress);
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    addSourceSpecificMembership(sourceAddress, groupAddress) {
      validateStringArgument("sourceAddress", sourceAddress);
      validateStringArgument("groupAddress", groupAddress);
      validateIpAddress("addSourceSpecificMembership", sourceAddress);
      validateIpAddress("addSourceSpecificMembership", groupAddress);
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    dropSourceSpecificMembership(sourceAddress, groupAddress) {
      validateStringArgument("sourceAddress", sourceAddress);
      validateStringArgument("groupAddress", groupAddress);
      validateIpAddress("dropSourceSpecificMembership", sourceAddress);
      validateIpAddress("dropSourceSpecificMembership", groupAddress);
      throw createUnsupportedDgramError("UDP multicast is not supported in OpenContainers V1");
    }

    ref() {
      this.#refRequested = true;
      this.#applyRef();
      return this;
    }

    unref() {
      this.#refRequested = false;
      this.#removeRef();
      return this;
    }

    setRecvBufferSize(size) {
      this.recvBufferSize = normalizeBufferSize(size);
      return this;
    }

    setSendBufferSize(size) {
      this.sendBufferSize = normalizeBufferSize(size);
      return this;
    }

    getRecvBufferSize() {
      return this.recvBufferSize;
    }

    getSendBufferSize() {
      return this.sendBufferSize;
    }

    getSendQueueSize() {
      return 0;
    }

    getSendQueueCount() {
      return 0;
    }

    [Symbol.asyncDispose]() {
      return new Promise((resolve) => this.close(resolve));
    }

    #assertOpen() {
      if (this.#closed) {
        throw Object.assign(new Error("Not running"), { code: "ERR_SOCKET_DGRAM_NOT_RUNNING" });
      }
    }

    #assertBound(method) {
      if (!this.#address) {
        throw Object.assign(new Error(`${method} EBADF`), { code: "EBADF" });
      }
    }

    #applyRef() {
      if (this.#address && this.#refRequested) this.#addRef();
      else this.#removeRef();
    }

    #addRef() {
      if (this.#refed) return;
      this.#refed = true;
      process.__opencontainersAddRef?.();
    }

    #removeRef() {
      if (!this.#refed) return;
      this.#refed = false;
      process.__opencontainersUnref?.();
    }

    #attachAbortSignal(signal) {
      if (signal === undefined) return;
      this.#abortSignal = signal;
      this.#abortListener = () => {
        if (!this.#closed) this.#close();
      };
      signal.addEventListener("abort", this.#abortListener, { once: true });
      if (signal.aborted) this.#close();
    }

    #detachAbortSignal() {
      if (!this.#abortSignal || !this.#abortListener) return;
      this.#abortSignal.removeEventListener("abort", this.#abortListener);
      this.#abortSignal = undefined;
      this.#abortListener = undefined;
    }

    #receive(message, rinfo) {
      if (this.#closed) return;
      this.emit("message", RuntimeBuffer.from(message), rinfo);
    }
  }

  function Socket(typeOrOptions, callback) {
    if (!new.target) return undefined;
    return Reflect.construct(SocketImpl, [typeOrOptions, callback], new.target);
  }
  Socket.prototype = SocketImpl.prototype;
  Object.defineProperty(Socket.prototype, "constructor", {
    configurable: true,
    value: Socket,
    writable: true
  });

  const builtin = {
    createSocket(typeOrOptions, callback) {
      return new Socket(typeOrOptions, callback);
    },
    Socket
  };
  alignDgramMetadata(Socket, builtin.createSocket);
  return builtin;
}

function alignDgramMetadata(Socket, createSocket) {
  Object.defineProperty(Socket, "length", { configurable: true, value: 2 });
  for (const [name, length] of Object.entries({
    bind: 2,
    connect: 3,
    disconnect: 0,
    sendto: 6,
    send: 6,
    close: 1,
    address: 0,
    remoteAddress: 0,
    setBroadcast: 1,
    setTTL: 1,
    setMulticastTTL: 1,
    setMulticastLoopback: 1,
    setMulticastInterface: 1,
    addMembership: 2,
    dropMembership: 2,
    addSourceSpecificMembership: 3,
    dropSourceSpecificMembership: 3,
    ref: 0,
    unref: 0,
    setRecvBufferSize: 1,
    setSendBufferSize: 1,
    getRecvBufferSize: 0,
    getSendBufferSize: 0,
    getSendQueueSize: 0,
    getSendQueueCount: 0
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(Socket.prototype, name);
    if (!descriptor?.value) continue;
    Object.defineProperty(descriptor.value, "name", { configurable: true, value: "" });
    Object.defineProperty(descriptor.value, "length", { configurable: true, value: length });
    defineOwnFunctionPrototype(descriptor.value);
    Object.defineProperty(Socket.prototype, name, { ...descriptor, enumerable: true });
  }
  defineOwnFunctionPrototype(createSocket);
  const asyncDisposeDescriptor = Object.getOwnPropertyDescriptor(Socket.prototype, Symbol.asyncDispose);
  if (asyncDisposeDescriptor?.value) {
    Object.defineProperty(asyncDisposeDescriptor.value, "name", { configurable: true, value: "" });
    Object.defineProperty(asyncDisposeDescriptor.value, "length", { configurable: true, value: 0 });
    Object.defineProperty(Socket.prototype, Symbol.asyncDispose, { ...asyncDisposeDescriptor, enumerable: true });
  }
}

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

export function createUnsupportedDgramError(message = "node:dgram operation is not supported in OpenContainers V1") {
  return Object.assign(new Error(message), {
    code: "ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED"
  });
}

function normalizeSocketOptions(typeOrOptions) {
  const options = typeof typeOrOptions === "object" && typeOrOptions !== null
    ? typeOrOptions
    : { type: typeOrOptions };
  const type = String(options.type);
  if (!SUPPORTED_TYPES.has(type)) {
    throw createBadSocketTypeError();
  }
  validateAbortSignal(options.signal);
  return { ...options, type };
}

function normalizeBindArgs(args) {
  let port = 0;
  let address = "0.0.0.0";
  let callback;

  if (typeof args[0] === "object" && args[0] !== null) {
    port = args[0].port ?? 0;
    address = args[0].address ?? args[0].host ?? address;
    callback = args[1];
  } else {
    port = typeof args[0] === "number" ? args[0] : 0;
    if (typeof args[1] === "string") address = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }

  return { port: normalizePort(port), address, callback };
}

function normalizeSendArgs(args, connected) {
  let offset;
  let length;
  let port;
  let address = connected?.address ?? "127.0.0.1";
  let addressCandidate;
  let callback;

  if (connected && typeof args[0] === "number" && typeof args[1] === "number" && typeof args[2] !== "number") {
    offset = args[0];
    length = args[1];
    port = connected.port;
    callback = args.find((arg) => typeof arg === "function");
  } else if (typeof args[0] === "number" && typeof args[1] === "number" && args[2] !== undefined && typeof args[2] !== "function") {
    offset = args[0];
    length = args[1];
    port = args[2];
    addressCandidate = args[3];
    callback = args.find((arg) => typeof arg === "function");
  } else if (!connected) {
    port = args[0];
    addressCandidate = args[1];
    callback = args.find((arg) => typeof arg === "function");
  } else {
    port = connected?.port;
    callback = args.find((arg) => typeof arg === "function");
  }

  if (typeof addressCandidate === "string") {
    address = addressCandidate;
  } else if (addressCandidate !== undefined && addressCandidate !== null && typeof addressCandidate !== "function") {
    throw createInvalidArgTypeError("address", "string", addressCandidate);
  }

  return {
    offset,
    length,
    port: port === undefined && connected ? undefined : normalizeSendPort(port),
    address,
    callback
  };
}

function normalizeConnectArgs(args) {
  let port;
  let address = "127.0.0.1";
  let callback;
  if (typeof args[0] === "object" && args[0] !== null) {
    port = args[0].port;
    address = args[0].address ?? args[0].host ?? address;
    callback = args[1];
  } else {
    port = args[0];
    if (typeof args[1] === "string") address = args[1];
    callback = args.find((arg) => typeof arg === "function");
  }
  return { port: normalizePort(port), address, callback };
}

function normalizeMessage(message, offset = 0, length) {
  const buffer = Array.isArray(message)
    ? RuntimeBuffer.concat(message.map((chunk) => RuntimeBuffer.from(chunk)))
    : RuntimeBuffer.from(message);
  const start = Math.max(0, Number(offset) || 0);
  const end = length === undefined ? buffer.length : start + Math.max(0, Number(length) || 0);
  return RuntimeBuffer.from(buffer.subarray(start, Math.min(buffer.length, end)));
}

function normalizePort(port) {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw Object.assign(new RangeError("Port should be >= 0 and < 65536"), { code: "ERR_SOCKET_BAD_PORT" });
  }
  return value;
}

function normalizeSendPort(port) {
  const value = Number(port);
  if (!Number.isInteger(value) || value <= 0 || value >= 65536) {
    throw Object.assign(new RangeError(`Port should be > 0 and < 65536. Received ${describeBadPort(port)}.`), {
      code: "ERR_SOCKET_BAD_PORT"
    });
  }
  return value;
}

function normalizeBufferSize(size) {
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    throw Object.assign(new TypeError("Buffer size must be a positive integer"), {
      code: "ERR_SOCKET_BAD_BUFFER_SIZE"
    });
  }
  return size;
}

function normalizeTtl(ttl) {
  if (typeof ttl !== "number") {
    throw Object.assign(new TypeError(`The "ttl" argument must be of type number. Received type ${typeof ttl}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  const value = Number(ttl);
  if (!Number.isInteger(value) || value < 1 || value > 255) {
    throw Object.assign(new Error("setTTL EINVAL"), { code: "EINVAL" });
  }
  return value;
}

function normalizeMulticastTtl(ttl) {
  if (typeof ttl !== "number") {
    throw createInvalidArgTypeError("ttl", "number", ttl);
  }
  const value = Number(ttl);
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw Object.assign(new Error("setMulticastTTL EINVAL"), { code: "EINVAL" });
  }
  return value;
}

function validateMembershipAddress(method, multicastAddress) {
  if (multicastAddress === undefined) {
    throw Object.assign(new TypeError('The "multicastAddress" argument must be specified'), {
      code: "ERR_MISSING_ARGS"
    });
  }
  if (typeof multicastAddress !== "string" || multicastAddress === "" || !isIpLiteral(multicastAddress)) {
    throw Object.assign(new Error(`${method} EINVAL`), { code: "EINVAL" });
  }
}

function validateStringArgument(name, value) {
  if (typeof value !== "string") {
    throw createInvalidArgTypeError(name, "string", value);
  }
}

function createInvalidArgTypeError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be of type ${expected}. Received ${describeReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function validateAbortSignal(signal) {
  if (signal === undefined) return;
  if (typeof AbortSignal === "function" && signal instanceof AbortSignal) return;
  throw Object.assign(
    new TypeError(`The "options.signal" property must be an instance of AbortSignal. Received ${describeSignalReceived(signal)}`),
    { code: "ERR_INVALID_ARG_TYPE" }
  );
}

function validateIpAddress(method, value) {
  if (!isIpLiteral(value)) {
    throw Object.assign(new Error(`${method} EINVAL`), { code: "EINVAL" });
  }
}

function isIpLiteral(value) {
  if (typeof value !== "string" || value === "") return false;
  if (value.includes(":")) return true;
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function describeReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string (${JSON.stringify(value).replaceAll('"', "'")})`;
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  return `type ${typeof value} (${String(value)})`;
}

function describeSignalReceived(value) {
  if (value === null) return "null";
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return describeReceived(value);
}

function describeBadPort(value) {
  if (typeof value === "function") return `function ${value.name ?? ""}`;
  return describeReceived(value);
}

function createBadSocketTypeError() {
  return Object.assign(new TypeError("Bad socket type specified. Valid types are: udp4, udp6"), {
    code: "ERR_SOCKET_BAD_TYPE"
  });
}

function normalizePublicAddress(address, type) {
  if (address === "0.0.0.0" && type === "udp4") return "0.0.0.0";
  if ((address === "::" || address === "::0") && type === "udp6") return "::";
  return String(address);
}

function effectiveOutboundAddress(address, type) {
  if (address === "0.0.0.0" && type === "udp4") return "127.0.0.1";
  if ((address === "::" || address === "::0") && type === "udp6") return "::1";
  return address;
}
