import { dirname, joinPath, normalizePath } from "../../../packages/fs/src/path-utils.js";
import { Kernel } from "../../../packages/kernel/src/Kernel.js";

const WORKSPACE_ROOT = "/workspace";
const textDecoder = new TextDecoder();

export class OpenContainer {
  static async boot(options = {}) {
    const container = new OpenContainer(options);
    await container.boot();
    return container;
  }

  constructor({
    projectId = "demo",
    previewBasePath = "/opencontainers/preview",
    serviceWorkerUrl = "/opencontainers-runtime-sw.js",
    registerServiceWorker = true,
    serviceWorkerControllerTimeoutMs = 5000,
    kernel = new Kernel()
  } = {}) {
    this.projectId = projectId;
    this.previewBasePath = previewBasePath.replace(/\/$/, "");
    this.serviceWorkerUrl = serviceWorkerUrl;
    this.registerServiceWorker = registerServiceWorker;
    this.serviceWorkerControllerTimeoutMs = serviceWorkerControllerTimeoutMs;
    this.kernel = kernel;
    this.listeners = new Map();
    this.processes = new Set();
    this.serviceWorkerPort = null;
    this.fs = createFsFacade(this);

    this.kernel.portManager.on("register", (entry) => this.#handlePortRegister(entry));
    this.kernel.portManager.on("unregister", (entry) => this.#handlePortUnregister(entry));
  }

  async boot() {
    if (this.registerServiceWorker) await this.#connectServiceWorker();
    return this;
  }

  on(eventName, listener) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(listener);
    return () => this.listeners.get(eventName)?.delete(listener);
  }

  async mount(tree = {}) {
    this.#clearWorkspacePreservingNodeModules();
    const files = flattenWebContainerTree(tree);
    for (const [path, contents] of Object.entries(files)) {
      this.#writeWorkspaceFile(path, contents);
    }
  }

  async spawn(command, args = [], options = {}) {
    if (command === "node" && (args[0] === "-v" || args[0] === "--version")) {
      return syntheticProcess("v26.0.0-opencontainers\n");
    }
    const normalized = normalizeSpawn(command, args);
    const process = this.kernel.spawn(normalized.command, normalized.args, {
      cwd: WORKSPACE_ROOT,
      env: {
        OPENCONTAINERS_PROJECT_ID: this.projectId,
        ...(options.env ?? {})
      },
      projectId: this.projectId
    });
    this.processes.add(process);
    process.completed.finally(() => this.processes.delete(process));
    return new OpenContainerProcess({ container: this, process });
  }

  teardown() {
    for (const process of [...this.processes]) {
      process.kill("SIGTERM");
    }
    this.processes.clear();
    this.serviceWorkerPort?.close?.();
    this.serviceWorkerPort = null;
    this.listeners.clear();
  }

  async dispatchPreviewRequest(request) {
    const preview = parsePreviewRequest(request, this.previewBasePath, this.projectId);
    const response = await this.kernel.dispatchHttpRequest({
      id: request.id ?? randomId(),
      projectId: preview.projectId ?? request.projectId ?? this.projectId,
      port: preview.port,
      method: request.method ?? "GET",
      url: `${preview.path}${preview.search}`,
      headers: request.headers ?? [],
      body: request.body
    });
    return {
      ...response,
      body: serializeBody(response.body)
    };
  }

  #handlePortRegister(entry) {
    if (entry.projectId !== this.projectId) return;
    const url = this.#previewUrl(entry.port);
    if (this.registerServiceWorker && !this.serviceWorkerPort) {
      this.#emit("error", new Error(`Server is listening on port ${entry.port}, but browser previews are not available because the OpenContainers preview Service Worker is not controlling this page. Reload the page and run again.`));
      return;
    }
    this.#emit("port", entry.port, "open", url);
    this.#emit("server-ready", entry.port, url);
  }

  #handlePortUnregister(entry) {
    if (entry.projectId !== this.projectId) return;
    this.#emit("port", entry.port, "close", this.#previewUrl(entry.port));
  }

  #previewUrl(port) {
    const path = `${this.previewBasePath}/${encodeURIComponent(this.projectId)}:${port}/`;
    if (typeof window !== "undefined" && window.location?.origin) {
      return new URL(path, window.location.origin).toString();
    }
    return `https://run.opencontainers.local${path}`;
  }

  async #connectServiceWorker() {
    const serviceWorker = typeof navigator === "undefined" ? null : navigator.serviceWorker;
    if (!serviceWorker) return;
    const registration = await serviceWorker.register(this.serviceWorkerUrl, { scope: "/" });
    const readyRegistration = await serviceWorker.ready;
    const worker = await resolveServiceWorkerMessageTarget({
      serviceWorker,
      registration,
      readyRegistration,
      timeoutMs: this.serviceWorkerControllerTimeoutMs
    });
    if (!worker) {
      this.#emit("error", new Error("OpenContainers preview Service Worker is registered but no active worker is available yet. Reload the page and run again."));
      return;
    }

    const channel = new MessageChannel();
    channel.port2.onmessage = (event) => {
      this.#handleServiceWorkerMessage(event.data, channel.port2);
    };
    channel.port2.start?.();
    worker.postMessage({ type: "OPENCONTAINERS_CONNECT_KERNEL" }, [channel.port1]);
    this.serviceWorkerPort = channel.port2;
  }

  async #handleServiceWorkerMessage(message, port) {
    if (!message?.id || message.type !== "dispatchHttp") return;
    try {
      const response = await this.dispatchPreviewRequest(message.payload ?? {});
      port.postMessage({
        type: "reply",
        requestId: message.id,
        payload: { ok: true, response }
      });
    } catch (error) {
      port.postMessage({
        type: "reply",
        requestId: message.id,
        payload: { ok: false, error: serializeError(error) }
      });
    }
  }

  #writeWorkspaceFile(filePath, contents) {
    const path = toWorkspacePath(filePath);
    this.kernel.fs.mkdirSync(dirname(path), { recursive: true });
    this.kernel.fs.writeFileSync(path, contents);
  }

  #clearWorkspacePreservingNodeModules() {
    const preserved = new Set([
      `${WORKSPACE_ROOT}/node_modules`,
      `${WORKSPACE_ROOT}/package-lock.opencontainers.json`
    ]);
    for (const [path] of [...this.kernel.fs.nodes.entries()].sort((left, right) => right[0].length - left[0].length)) {
      if (path === WORKSPACE_ROOT || !path.startsWith(`${WORKSPACE_ROOT}/`)) continue;
      if ([...preserved].some((root) => path === root || path.startsWith(`${root}/`))) continue;
      this.kernel.fs.rmSync(path, { recursive: true, force: true });
    }
  }

  #emit(eventName, ...args) {
    for (const listener of this.listeners.get(eventName) ?? []) {
      try {
        listener(...args);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}

function waitForServiceWorkerController(serviceWorker, timeoutMs) {
  if (serviceWorker.controller) return Promise.resolve(serviceWorker.controller);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      serviceWorker.removeEventListener?.("controllerchange", finish);
      resolve(serviceWorker.controller ?? null);
    };
    serviceWorker.addEventListener?.("controllerchange", finish);
    timer = setTimeout(finish, timeoutMs);
  });
}

async function resolveServiceWorkerMessageTarget({
  serviceWorker,
  timeoutMs
}) {
  if (serviceWorker.controller) return serviceWorker.controller;
  return waitForServiceWorkerController(serviceWorker, timeoutMs);
}

export const WebContainer = OpenContainer;

export function flattenWebContainerTree(tree, prefix = "") {
  const files = {};
  for (const [name, entry] of Object.entries(tree ?? {})) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry?.file) {
      files[path] = entry.file.contents ?? "";
      continue;
    }
    if (entry?.directory) {
      Object.assign(files, flattenWebContainerTree(entry.directory, path));
    }
  }
  return files;
}

export function parseOpenContainersPreviewUrl(url, previewBasePath = "/opencontainers/preview") {
  const parsed = new URL(url, "https://run.opencontainers.local");
  const base = previewBasePath.replace(/\/$/, "");
  const marker = `${base}/`;
  const markerIndex = parsed.pathname.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error(`Not a OpenContainers preview URL: ${parsed.pathname}`);
  const rest = parsed.pathname.slice(markerIndex + marker.length);
  const slashIndex = rest.indexOf("/");
  const projectSegment = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  const [projectPart, portPart] = decodeURIComponent(projectSegment).split(":");
  return {
    projectId: projectPart,
    port: Number(portPart),
    path: slashIndex === -1 ? "/" : rest.slice(slashIndex),
    search: parsed.search
  };
}

function parsePreviewRequest(request, previewBasePath, fallbackProjectId) {
  try {
    return parseOpenContainersPreviewUrl(request.url, previewBasePath);
  } catch (error) {
    const port = Number(request.port);
    if (!Number.isFinite(port) || port <= 0) throw error;
    const parsed = new URL(request.url || "/", "https://run.opencontainers.local");
    return {
      projectId: request.projectId ?? fallbackProjectId,
      port,
      path: parsed.pathname || "/",
      search: parsed.search
    };
  }
}

export function createOpenContainersServiceWorkerScript({ previewBasePath = "/opencontainers/preview" } = {}) {
  return `
const previewBasePath = ${JSON.stringify(previewBasePath.replace(/\/$/, ""))};
let kernelPort = null;
const pending = new Map();
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if (event.data?.type === "OPENCONTAINERS_CONNECT_KERNEL" && event.ports?.[0]) {
    kernelPort = event.ports[0];
    kernelPort.onmessage = handleKernelMessage;
    kernelPort.start?.();
  }
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(previewBasePath + "/")) return;
  event.respondWith(handlePreviewFetch(event.request));
});
function handleKernelMessage(event) {
  const message = event.data;
  if (message?.type !== "reply") return;
  const pendingRequest = pending.get(message.requestId);
  if (!pendingRequest) return;
  pending.delete(message.requestId);
  pendingRequest.resolve(message.payload);
}
async function handlePreviewFetch(request) {
  if (!kernelPort) return new Response("OpenContainers runtime is not connected", { status: 503 });
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : new Uint8Array(await request.arrayBuffer());
  const payload = await requestKernel("dispatchHttp", {
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body
  });
  if (!payload.ok) {
    return new Response(payload.error?.message || "OpenContainers preview request failed", { status: 500 });
  }
  const response = payload.response || {};
  const headers = new Headers(response.headers || []);
  return new Response(response.body || "", {
    status: response.status || 200,
    statusText: response.statusText || "OK",
    headers
  });
}
function requestKernel(type, payload) {
  const id = crypto.randomUUID?.() || Math.random().toString(16).slice(2);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out waiting for OpenContainers runtime"));
    }, 30000);
    pending.set(id, { resolve: value => {
      clearTimeout(timeout);
      resolve(value);
    }});
    kernelPort.postMessage({ id, type, payload });
  });
}
`;
}

class OpenContainerProcess {
  constructor({ container, process }) {
    this.container = container;
    this.process = process;
    this.output = this.#createOutputStream();
    this.exit = process.completed.then((result) => result.status);
  }

  kill(signal = "SIGTERM") {
    if (!this.container.kernel.killTree(this.process.pid, signal)) {
      this.process.kill(signal);
    }
  }

  #createOutputStream() {
    const process = this.process;
    return new ReadableStream({
      start(controller) {
        const onData = (chunk) => controller.enqueue(decodeChunk(chunk));
        process.stdout.on("data", onData);
        process.stderr.on("data", onData);
        process.completed.finally(() => {
          process.stdout.off?.("data", onData);
          process.stderr.off?.("data", onData);
          controller.close();
        });
      }
    });
  }
}

function syntheticProcess(output, exitCode = 0) {
  return {
    output: new ReadableStream({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      }
    }),
    exit: Promise.resolve(exitCode),
    kill() {}
  };
}

function createFsFacade(container) {
  return {
    mkdir: async (path, options = {}) => {
      container.kernel.fs.mkdirSync(toWorkspacePath(path), options);
    },
    writeFile: async (path, contents) => {
      const workspacePath = toWorkspacePath(path);
      container.kernel.fs.mkdirSync(dirname(workspacePath), { recursive: true });
      container.kernel.fs.writeFileSync(workspacePath, contents);
    },
    rm: async (path, options = {}) => {
      container.kernel.fs.rmSync(toWorkspacePath(path), { recursive: Boolean(options.recursive), force: Boolean(options.force) });
    },
    readFile: async (path, encoding) => container.kernel.fs.readFileSync(toWorkspacePath(path), encoding)
  };
}

function normalizeSpawn(command, args) {
  if (command !== "node") return { command, args };
  const filteredArgs = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--enable-source-maps") continue;
    if (arg === "--loader" || arg === "--require" || arg === "-r") {
      index++;
      continue;
    }
    filteredArgs.push(arg);
  }
  return { command, args: filteredArgs };
}

function toWorkspacePath(path) {
  return joinPath(WORKSPACE_ROOT, normalizePath(`/${String(path || "").replace(/^\/+/, "")}`));
}

function decodeChunk(chunk) {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return textDecoder.decode(chunk);
  if (ArrayBuffer.isView(chunk)) return textDecoder.decode(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  return String(chunk);
}

function serializeBody(body) {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return textDecoder.decode(body);
  if (ArrayBuffer.isView(body)) return textDecoder.decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  return String(body);
}

function serializeError(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack
  };
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);
}
