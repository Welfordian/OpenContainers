import { dispatchPreviewRequest, parsePreviewUrl } from "./http-dispatch.js";
import { injectPreviewClient } from "./preview-rewriter.js";
import { previewClientBrowserScript } from "../../preview-client/src/index.js";

export class OpenContainersServiceWorkerRuntime {
  constructor({ scope = globalThis, timeoutMs = 30_000 } = {}) {
    this.scope = scope;
    this.timeoutMs = timeoutMs;
    this.kernelPort = null;
    this.pending = new Map();
    this.reconnectPromise = null;
  }

  connect(port) {
    this.kernelPort = port;
    port.onmessage = (event) => this.handleKernelMessage(event.data);
    port.start?.();
  }

  handleKernelMessage(message) {
    if (message?.type !== "reply") return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    pending.resolve(message.payload);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__opencontainers/preview-client.js") {
      return new Response(previewClientBrowserScript(), {
        headers: { "content-type": "text/javascript; charset=utf-8" }
      });
    }

    const preview = parsePreviewUrl(url);
    if (!preview) return null;

    const response = await dispatchPreviewRequest({
      kernel: {
        dispatchHttpRequest: (virtualRequest) => this.requestKernel("dispatchHttp", virtualRequest).then((payload) => {
          if (!payload.ok) throw deserializeError(payload.error);
          return payload.response;
        })
      },
      request,
      defaultPort: preview.port
    });

    const headers = new Headers(response.headers ?? []);
    let body = response.body ?? "";
    const contentType = headers.get("content-type") ?? "";
    if (typeof body !== "string") body = new TextDecoder().decode(body);
    if (contentType.includes("text/html") || /<!doctype html|<html/i.test(body)) {
      body = injectPreviewClient(body, {
        projectId: preview.projectId,
        defaultPort: response.previewPort ?? preview.port,
        parentOrigin: url.origin,
        previewOrigin: url.origin,
        baseUrl: url.href
      });
      headers.set("content-type", "text/html; charset=utf-8");
    }

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  requestKernel(type, payload) {
    if (!this.kernelPort) {
      return Promise.reject(new Error("OpenContainers kernel worker is not connected"));
    }
    const requestId = crypto.randomUUID?.() ?? Math.random().toString(16).slice(2);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for kernel response to ${type}`));
      }, this.timeoutMs);
      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        }
      });
      this.kernelPort.postMessage({ id: requestId, type, payload });
    });
  }

  async requestRuntimeConnection() {
    if (this.kernelPort) return this.kernelPort;
    if (!this.reconnectPromise) {
      this.reconnectPromise = this.requestRuntimeConnectionOnce().finally(() => {
        this.reconnectPromise = null;
      });
    }
    return this.reconnectPromise;
  }

  async requestRuntimeConnectionOnce() {
    if (!this.scope.clients?.matchAll) return null;
    const clients = await this.scope.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    for (const client of clients) {
      client.postMessage?.({ type: "OPENCONTAINERS_REQUEST_KERNEL_CONNECTION" });
    }

    const deadline = Date.now() + 1500;
    while (!this.kernelPort && Date.now() < deadline) {
      await sleep(25);
    }
    return this.kernelPort;
  }
}

export function installOpenContainersServiceWorker(scope = self) {
  const runtime = new OpenContainersServiceWorkerRuntime({ scope });
  scope.addEventListener("install", (event) => event.waitUntil(scope.skipWaiting()));
  scope.addEventListener("activate", (event) => event.waitUntil(scope.clients.claim()));
  scope.addEventListener("message", (event) => {
    if (event.data?.type === "OPENCONTAINERS_CONNECT_KERNEL" && event.ports?.[0]) {
      runtime.connect(event.ports[0]);
    }
  });
  scope.addEventListener("fetch", (event) => {
    event.respondWith((async () => {
      if (!runtime.kernelPort) await runtime.requestRuntimeConnection();
      const response = await runtime.fetch(event.request);
      return response ?? fetch(event.request);
    })());
  });
  return runtime;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deserializeError(error) {
  return Object.assign(new Error(error?.message ?? "Kernel request failed"), error ?? {});
}
