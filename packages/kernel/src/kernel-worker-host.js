import { dirname } from "../../fs/src/path-utils.js";
import { OpfsPersistenceDriver } from "../../fs/src/opfs-driver.js";
import { VirtualFileSystem } from "../../fs/src/VirtualFileSystem.js";
import { Kernel } from "./Kernel.js";

const decoder = new TextDecoder();

export class KernelWorkerHost {
  constructor({ kernel = null, postMessage = () => {}, persistenceDriver = null, storageEstimate = null, registryClient = undefined } = {}) {
    this.registryClient = registryClient;
    this.kernel = kernel ?? new Kernel({ registryClient });
    this.postMessage = postMessage;
    this.persistenceDriver = persistenceDriver;
    this.storageEstimate = storageEstimate;
    this.projectId = "demo";
    this.defaultPreviewPort = 3000;
    this.currentPreviewPort = null;
    this.nextSocketId = 1;
    this.webSockets = new Map();
  }

  async handleMessage(message, postMessage = this.postMessage) {
    if (!message || typeof message !== "object") return;
    const { id, type, payload = {} } = message;
    try {
      switch (type) {
        case "initProject":
          await this.initProject(payload);
          return this.reply(id, { ok: true, files: this.listFiles(), permissions: this.permissions(), storage: await this.storageReport() }, postMessage);
        case "setPermission":
          this.setPermission(payload);
          return this.reply(id, { ok: true, permissions: this.permissions(), storage: await this.storageReport() }, postMessage);
        case "writeFile":
          await this.writeFile(payload.path, payload.content ?? "");
          return this.reply(id, { ok: true, files: this.listFiles(), storage: await this.storageReport() }, postMessage);
        case "readFile":
          return this.reply(id, { ok: true, content: this.kernel.fs.readFileSync(payload.path, "utf8") }, postMessage);
        case "listFiles":
          return this.reply(id, { ok: true, files: this.listFiles() }, postMessage);
        case "status":
          return this.reply(id, { ok: true, permissions: this.permissions(), storage: await this.storageReport(), files: this.listFiles(), preview: this.previewStatus() }, postMessage);
        case "previewStatus":
          return this.reply(id, { ok: true, preview: this.previewStatus(payload) }, postMessage);
        case "runCommand":
          return this.runCommand(id, payload, postMessage);
        case "dispatchHttp":
          return this.dispatchHttp(id, payload, postMessage);
        case "webSocketConnect":
          return this.webSocketConnect(id, payload, postMessage);
        case "webSocketSend":
          return this.webSocketSend(id, payload, postMessage);
        case "webSocketClose":
          return this.webSocketClose(id, payload, postMessage);
        case "openPty":
          return this.openPty(id, payload, postMessage);
        case "ptyInput":
          return this.ptyInput(id, payload, postMessage);
        case "resizePty":
          return this.resizePty(id, payload, postMessage);
        case "closePty":
          return this.closePty(id, payload, postMessage);
        case "killAll":
          this.killAll();
          return this.reply(id, { ok: true }, postMessage);
        case "clearNodeModules":
          await this.clearNodeModules();
          return this.reply(id, { ok: true, files: this.listFiles(), storage: await this.storageReport() }, postMessage);
        case "resetFilesystem":
          await this.resetFilesystem(payload.files ?? defaultProjectFiles());
          return this.reply(id, { ok: true, files: this.listFiles(), storage: await this.storageReport() }, postMessage);
        default:
          throw new Error(`Unknown kernel worker message: ${type}`);
      }
    } catch (error) {
      this.reply(id, { ok: false, error: serializeError(error) }, postMessage);
    }
  }

  async initProject({ projectId = "demo", defaultPreviewPort = 3000, files = defaultProjectFiles(), hydrate = true } = {}) {
    this.projectId = projectId;
    this.defaultPreviewPort = defaultPreviewPort;
    this.currentPreviewPort = null;
    this.kernel = new Kernel({
      fs: new VirtualFileSystem({ files: normalizeProjectFiles(files) }),
      registryClient: this.registryClient
    });
    this.kernel.allowExternalNetwork = false;
    this.kernel.allowInstallScripts = false;
    this.kernel.allowChildProcesses = true;
    this.kernel.allowPersistentStorage = true;
    this.kernel.allowPopups = false;
    if (!this.persistenceDriver && typeof navigator !== "undefined") {
      try {
        this.persistenceDriver = await OpfsPersistenceDriver.open(navigator.storage);
      } catch {
        this.persistenceDriver = null;
      }
    }
    if (hydrate) await this.hydrateWorkspace();
  }

  setPermission({ name, value }) {
    if (![
      "allowExternalNetwork",
      "allowInstallScripts",
      "allowChildProcesses",
      "allowPersistentStorage",
      "allowPopups"
    ].includes(name)) {
      throw new Error(`Unknown permission: ${name}`);
    }
    this.kernel[name] = Boolean(value);
  }

  permissions() {
    return {
      allowExternalNetwork: Boolean(this.kernel.allowExternalNetwork),
      allowInstallScripts: Boolean(this.kernel.allowInstallScripts),
      allowChildProcesses: Boolean(this.kernel.allowChildProcesses),
      allowPersistentStorage: Boolean(this.kernel.allowPersistentStorage),
      allowPopups: Boolean(this.kernel.allowPopups)
    };
  }

  async writeFile(path, content) {
    this.kernel.fs.mkdirSync(dirname(path), { recursive: true });
    this.kernel.fs.writeFileSync(path, content);
    await this.persistPath(path);
  }

  async runCommand(id, { commandLine, cwd = "/workspace", env = {}, detached = false } = {}, postMessage = this.postMessage) {
    const stdout = this.stream("stdout", id, postMessage);
    const stderr = this.stream("stderr", id, postMessage);
    if (detached) {
      const process = this.kernel.spawn("sh", ["-c", commandLine], {
        cwd,
        env: {
          OPENCONTAINERS_PROJECT_ID: this.projectId,
          ...env
        },
        projectId: this.projectId
      });
      process.stdout.on("data", (chunk) => stdout.write(chunk));
      process.stderr.on("data", (chunk) => stderr.write(chunk));
      process.on("close", (status, signal) => {
        this.persistWorkspace().catch(() => {});
        postMessage({
          type: "processExit",
          requestId: id,
          pid: process.pid,
          status,
          signal
        });
      });
      await Promise.resolve();
      return this.reply(id, { ok: true, status: "running", pid: process.pid, files: this.listFiles(), storage: await this.storageReport(), preview: this.previewStatus() }, postMessage);
    }

    const status = await this.kernel.shell.run(commandLine, {
      cwd,
      env: {
        OPENCONTAINERS_PROJECT_ID: this.projectId,
        ...env
      },
      stdout,
      stderr,
      projectId: this.projectId
    });
    await this.persistWorkspace();
    this.reply(id, { ok: true, status, files: this.listFiles(), storage: await this.storageReport(), preview: this.previewStatus() }, postMessage);
  }

  async dispatchHttp(id, request, postMessage = this.postMessage) {
    const explicitPort = request.port !== undefined && request.port !== null ? Number(request.port) : null;
    const preview = explicitPort ? { port: explicitPort, ports: this.previewStatus({ projectId: request.projectId }).ports } : this.previewStatus({ projectId: request.projectId });
    if (!preview.port) {
      return this.reply(id, {
        ok: true,
        response: {
          status: 200,
          statusText: "OK",
          headers: [["content-type", "text/html; charset=utf-8"]],
          body: "",
          previewPort: null,
          previewPorts: preview.ports
        }
      }, postMessage);
    }

    const response = await this.kernel.dispatchHttpRequest({
      ...request,
      projectId: request.projectId ?? this.projectId,
      port: preview.port
    });
    this.reply(id, {
      ok: true,
      response: {
        ...response,
        body: serializeBody(response.body),
        previewPort: preview.port,
        previewPorts: preview.ports
      }
    }, postMessage);
  }

  webSocketConnect(id, request, postMessage = this.postMessage) {
    const socketId = `ws-${this.nextSocketId++}`;
    const preview = request.port ? { port: Number(request.port) } : this.previewStatus({ projectId: request.projectId });
    if (!preview.port) throw new Error(`No virtual server is listening for project ${request.projectId ?? this.projectId}`);
    const socket = this.kernel.connectWebSocket({
      projectId: request.projectId ?? this.projectId,
      port: preview.port,
      path: request.path ?? "/",
      protocols: request.protocols ?? []
    });
    this.webSockets.set(socketId, socket);
    socket.addEventListener("open", () => {
      postMessage({ type: "webSocket", requestId: id, socketId, event: "open" });
    });
    socket.addEventListener("message", (event) => {
      postMessage({
        type: "webSocket",
        requestId: id,
        socketId,
        event: "message",
        data: serializeWebSocketData(event.data)
      });
    });
    socket.addEventListener("close", (event) => {
      this.webSockets.delete(socketId);
      postMessage({
        type: "webSocket",
        requestId: id,
        socketId,
        event: "close",
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
    });
    this.reply(id, { ok: true, socketId }, postMessage);
  }

  webSocketSend(id, { socketId, data }, postMessage = this.postMessage) {
    const socket = this.webSockets.get(socketId);
    if (!socket) throw new Error(`Unknown virtual WebSocket: ${socketId}`);
    socket.send(data);
    this.reply(id, { ok: true }, postMessage);
  }

  webSocketClose(id, { socketId, code = 1000, reason = "" }, postMessage = this.postMessage) {
    const socket = this.webSockets.get(socketId);
    if (socket) socket.close(code, reason);
    this.webSockets.delete(socketId);
    this.reply(id, { ok: true }, postMessage);
  }

  openPty(id, payload, postMessage = this.postMessage) {
    const session = this.kernel.pty.createSession({
      cwd: payload.cwd ?? "/workspace",
      env: {
        OPENCONTAINERS_PROJECT_ID: this.projectId,
        ...(payload.env ?? {})
      },
      projectId: this.projectId,
      cols: payload.cols,
      rows: payload.rows
    });
    session.on("data", (chunk) => {
      postMessage({
        type: "pty",
        requestId: id,
        sessionId: session.id,
        chunk: typeof chunk === "string" ? chunk : decoder.decode(chunk)
      });
    });
    session.on("close", () => {
      postMessage({ type: "pty", requestId: id, sessionId: session.id, event: "close" });
    });
    this.reply(id, { ok: true, sessionId: session.id }, postMessage);
  }

  ptyInput(id, { sessionId, data }, postMessage = this.postMessage) {
    this.kernel.pty.write(sessionId, data);
    this.reply(id, { ok: true }, postMessage);
  }

  resizePty(id, { sessionId, cols, rows }, postMessage = this.postMessage) {
    this.kernel.pty.resize(sessionId, { cols, rows });
    this.reply(id, { ok: true }, postMessage);
  }

  closePty(id, { sessionId }, postMessage = this.postMessage) {
    this.kernel.pty.close(sessionId);
    this.reply(id, { ok: true }, postMessage);
  }

  killAll() {
    for (const process of this.kernel.processManager.processes.values()) {
      if (process.exitCode === null) this.kernel.killTree(process.pid, "SIGTERM");
    }
  }

  async clearNodeModules() {
    if (this.kernel.fs.existsSync("/workspace/node_modules")) {
      this.kernel.fs.rmSync("/workspace/node_modules", { recursive: true, force: true });
    }
    if (this.kernel.fs.existsSync("/workspace/package-lock.opencontainers.json")) {
      this.kernel.fs.rmSync("/workspace/package-lock.opencontainers.json", { force: true });
    }
    if (this.persistenceDriver && this.permissions().allowPersistentStorage) {
      await this.persistenceDriver.removeTree("/workspace/node_modules");
      await this.persistenceDriver.removeTree("/workspace/package-lock.opencontainers.json");
    }
  }

  async resetFilesystem(files) {
    if (this.persistenceDriver) await this.persistenceDriver.removeTree("/workspace");
    await this.initProject({
      projectId: this.projectId,
      defaultPreviewPort: this.defaultPreviewPort,
      files,
      hydrate: false
    });
    await this.persistWorkspace();
  }

  listFiles(root = "/workspace") {
    const files = [];
    for (const [path, node] of this.kernel.fs.nodes.entries()) {
      if (!path.startsWith(root) || path === root) continue;
      files.push({
        path,
        type: node.type,
        size: node.type === "file" ? node.data.byteLength : 0,
        mtimeMs: node.mtimeMs
      });
    }
    return files.sort((left, right) => left.path.localeCompare(right.path));
  }

  async hydrateWorkspace() {
    if (!this.persistenceDriver || !this.permissions().allowPersistentStorage) return;
    await this.persistenceDriver.hydrateVirtualFileSystem(this.kernel.fs, "/workspace");
  }

  async persistWorkspace() {
    if (!this.persistenceDriver || !this.permissions().allowPersistentStorage) return;
    await this.persistenceDriver.flushVirtualFileSystem(this.kernel.fs, "/workspace");
  }

  async persistPath(path) {
    if (!this.persistenceDriver || !this.permissions().allowPersistentStorage) return;
    if (!this.kernel.fs.existsSync(path) || !this.kernel.fs.statSync(path).isFile()) return;
    await this.persistenceDriver.writeFile(path, this.kernel.fs.readFileSync(path));
  }

  async storageReport() {
    const virtualUsage = this.listFiles("/")
      .filter((file) => file.type === "file")
      .reduce((total, file) => total + file.size, 0);
    const estimate = this.storageEstimate
      ? await this.storageEstimate()
      : typeof navigator !== "undefined" && navigator.storage?.estimate
        ? await navigator.storage.estimate()
        : {};
    return {
      virtualUsage,
      usage: estimate.usage ?? virtualUsage,
      quota: estimate.quota ?? null,
      persistent: Boolean(this.persistenceDriver && this.permissions().allowPersistentStorage)
    };
  }

  previewStatus({ projectId = this.projectId } = {}) {
    const ports = this.kernel.listeningPorts(projectId);
    const preferred = ports.find((entry) => entry.port === this.currentPreviewPort)
      ?? ports.find((entry) => entry.port === this.defaultPreviewPort)
      ?? ports[0]
      ?? null;
    this.currentPreviewPort = preferred?.port ?? null;
    return {
      projectId,
      port: this.currentPreviewPort,
      ports
    };
  }

  stream(name, requestId, postMessage = this.postMessage) {
    return {
      write: (chunk) => {
        postMessage({
          type: "stream",
          requestId,
          stream: name,
          chunk: typeof chunk === "string" ? chunk : decoder.decode(chunk)
        });
      }
    };
  }

  reply(requestId, payload, postMessage = this.postMessage) {
    postMessage({
      type: "reply",
      requestId,
      payload
    });
  }
}

export function defaultProjectFiles() {
  return {
    "/workspace/package.json": JSON.stringify({
      scripts: {
        dev: "node server.js"
      },
      dependencies: {}
    }, null, 2),
    "/workspace/server.js": [
      "const http = require('http');",
      "",
      "http.createServer((req, res) => {",
      "  res.setHeader('content-type', 'text/html');",
      "  res.end('<!doctype html><html><body><h1>Hello from OpenContainers</h1></body></html>');",
      "}).listen(3000);"
    ].join("\n")
  };
}

function normalizeProjectFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [
    path.startsWith("/") ? path : `/workspace/${path}`,
    content
  ]));
}

function serializeBody(body) {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return decoder.decode(body);
  if (ArrayBuffer.isView(body)) return decoder.decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  return String(body);
}

function serializeWebSocketData(data) {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return decoder.decode(data);
  if (ArrayBuffer.isView(data)) return decoder.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return String(data);
}

function serializeError(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack
  };
}
