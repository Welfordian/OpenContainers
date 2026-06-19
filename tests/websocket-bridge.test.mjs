import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { KernelWorkerHost } from "../packages/kernel/src/kernel-worker-host.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";
import { createParentBridge, installPreviewClient, mapPreviewRequestUrl, mapPreviewWebSocketRequest } from "../packages/preview-client/src/index.js";

test("virtual http upgrade handlers can exchange WebSocket messages through the kernel", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    const server = http.createServer((req, res) => res.end('ok'));
    server.on('upgrade', (req, socket) => {
      socket.addEventListener('open', () => socket.send('ready:' + req.url));
      socket.addEventListener('message', (event) => socket.send('echo:' + event.data));
    });
    server.listen(3000);
  `);

  const process = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const socket = kernel.connectWebSocket({ projectId: "demo", port: 3000, path: "/hmr" });
  const messages = [];
  socket.addEventListener("message", (event) => messages.push(event.data));
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  socket.send("ping");
  await eventually(() => messages.length === 2);

  assert.deepEqual(messages, ["ready:/hmr", "echo:ping"]);
  process.kill("SIGTERM");
});

test("virtual WebSocket upgrade handler errors stay inside the server process", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    const server = http.createServer((req, res) => res.end('ok'));
    server.on('upgrade', () => {
      throw new Error('upgrade boom');
    });
    server.listen(3000);
  `);

  const process = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.doesNotThrow(() => {
    kernel.connectWebSocket({ projectId: "demo", port: 3000, path: "/socket.io/" });
  });
  assert.match(process.stderr.toString(), /upgrade boom/);
  process.kill("SIGTERM");
});

test("KernelWorkerHost exposes virtual WebSocket connect/send/close messages", async () => {
  const messages = [];
  const host = new KernelWorkerHost({
    postMessage: (message) => messages.push(message),
    registryClient: new MemoryRegistryClient({})
  });
  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.handleMessage({
    id: "server",
    type: "writeFile",
    payload: {
      path: "/workspace/server.js",
      content: `
        const http = require('http');
        const server = http.createServer();
        server.on('upgrade', (req, socket) => {
          socket.addEventListener('message', (event) => socket.send('host:' + event.data));
        });
        server.listen(3000);
      `
    }
  });
  await host.handleMessage({
    id: "run",
    type: "runCommand",
    payload: { commandLine: "npm run dev", detached: true }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await host.handleMessage({
    id: "connect",
    type: "webSocketConnect",
    payload: { projectId: "demo", port: 3000, path: "/socket" }
  });
  const socketId = messages.find((message) => message.type === "reply" && message.requestId === "connect").payload.socketId;
  await eventually(() => messages.some((message) => message.type === "webSocket" && message.event === "open"));

  await host.handleMessage({
    id: "send",
    type: "webSocketSend",
    payload: { socketId, data: "hello" }
  });
  await eventually(() => messages.some((message) => message.type === "webSocket" && message.event === "message"));

  assert.equal(messages.find((message) => message.type === "webSocket" && message.event === "message").data, "host:hello");
  await host.handleMessage({
    id: "close",
    type: "webSocketClose",
    payload: { socketId, code: 1000, reason: "done" }
  });
});

test("preview parent bridge maps virtual localhost WebSockets to parent messages", async () => {
  const parentMessages = [];
  const win = new FakeWindow({
    href: "https://run.opencontainers.local/p/demo/",
    origin: "https://run.opencontainers.local",
    parent: {
      postMessage: (message, origin) => parentMessages.push({ message, origin })
    }
  });

  const bridge = createParentBridge(win);
  const socket = bridge.webSocket({
    projectId: "demo",
    port: 5173,
    path: "/hmr",
    protocols: []
  });

  assert.equal(parentMessages[0].message.type, "opencontainers:ws:connect");
  assert.equal(parentMessages[0].message.port, 5173);

  const seen = [];
  socket.addEventListener("open", () => seen.push("open"));
  socket.addEventListener("message", (event) => seen.push(event.data));
  win.dispatchMessage({
    type: "opencontainers:ws:event",
    localId: "preview-ws-1",
    socketId: "ws-1",
    event: "connected"
  });
  win.dispatchMessage({
    type: "opencontainers:ws:event",
    localId: "preview-ws-1",
    socketId: "ws-1",
    event: "open"
  });
  socket.send("client");
  win.dispatchMessage({
    type: "opencontainers:ws:event",
    socketId: "ws-1",
    event: "message",
    data: "server"
  });

  assert.deepEqual(seen, ["open", "server"]);
  assert.equal(parentMessages.at(-1).message.type, "opencontainers:ws:send");
  assert.equal(parentMessages.at(-1).message.socketId, "ws-1");
  assert.equal(parentMessages.at(-1).message.data, "client");
});

test("preview parent bridge proxies fetches through the parent frame", async () => {
  const parentMessages = [];
  const win = new FakeWindow({
    href: "about:srcdoc",
    origin: "null",
    parent: {
      postMessage: (message, origin) => parentMessages.push({ message, origin })
    }
  });

  const bridge = createParentBridge(win, {
    parentOrigin: "https://run.opencontainers.local",
    previewOrigin: "https://run.opencontainers.local",
    baseUrl: "https://run.opencontainers.local/p/demo/",
    projectId: "demo",
    defaultPort: 3000
  });
  const responsePromise = bridge.fetch({
    url: "https://run.opencontainers.local/p/demo/api",
    method: "GET",
    headers: []
  });

  assert.equal(parentMessages[0].origin, "https://run.opencontainers.local");
  assert.equal(parentMessages[0].message.type, "opencontainers:fetch:request");
  win.dispatchMessage({
    type: "opencontainers:fetch:response",
    id: parentMessages[0].message.id,
    ok: true,
    status: 200,
    statusText: "OK",
    headers: [["content-type", "text/plain"]],
    body: new TextEncoder().encode("proxied").buffer
  });

  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "proxied");
});

test("preview client proxies virtual XMLHttpRequest through the parent frame", async () => {
  const parentMessages = [];
  const win = new FakeWindow({
    href: "about:srcdoc",
    origin: "null",
    parent: {
      postMessage: (message, origin) => parentMessages.push({ message, origin })
    }
  });
  win.__OPENCONTAINERS_PREVIEW__ = {
    parentOrigin: "https://run.opencontainers.local",
    previewOrigin: "https://run.opencontainers.local",
    baseUrl: "https://run.opencontainers.local/p/demo/",
    projectId: "demo",
    defaultPort: 3000
  };
  win.console = { log() {}, warn() {}, error() {}, info() {} };
  win.fetch = async () => {
    throw new Error("native fetch should not be used");
  };
  win.WebSocket = class {};
  win.XMLHttpRequest = class {};

  installPreviewClient({ win });

  const xhr = new win.XMLHttpRequest();
  const loaded = new Promise((resolve) => {
    xhr.onload = resolve;
  });
  xhr.open("POST", "/socket.io/?EIO=4&transport=polling&sid=abc");
  xhr.setRequestHeader("content-type", "text/plain;charset=UTF-8");
  xhr.send("40");

  assert.equal(parentMessages[0].origin, "https://run.opencontainers.local");
  assert.equal(parentMessages[0].message.type, "opencontainers:fetch:request");
  assert.equal(parentMessages[0].message.method, "POST");
  assert.equal(parentMessages[0].message.body, "40");
  assert.match(parentMessages[0].message.url, /\/p\/demo:3000\/socket\.io\/\?EIO=4&transport=polling&sid=abc$/);

  const body = new TextEncoder().encode("ok").buffer;
  win.dispatchMessage({
    type: "opencontainers:fetch:response",
    id: parentMessages[0].message.id,
    ok: true,
    status: 200,
    statusText: "OK",
    headers: [["content-type", "text/plain"]],
    body
  });

  await loaded;
  assert.equal(xhr.status, 200);
  assert.equal(xhr.responseText, "ok");
});

test("preview request URL mapper routes localhost and root-relative fetches to preview URLs", () => {
  const config = {
    projectId: "demo",
    defaultPort: 3000,
    previewOrigin: "https://run.opencontainers.local",
    baseUrl: "https://run.opencontainers.local/p/demo/"
  };

  assert.equal(
    mapPreviewRequestUrl("http://localhost:5173/src/main.js?x=1", config, "about:srcdoc"),
    "https://run.opencontainers.local/p/demo:5173/src/main.js?x=1"
  );
  assert.equal(
    mapPreviewRequestUrl("/api/health", config, "about:srcdoc"),
    "https://run.opencontainers.local/p/demo:3000/api/health"
  );
  assert.equal(
    mapPreviewRequestUrl("https://run.opencontainers.local/api/private", config, "about:srcdoc"),
    "https://run.opencontainers.local/p/demo:3000/api/private"
  );
  assert.equal(
    mapPreviewRequestUrl("client.js", config, "about:srcdoc"),
    "https://run.opencontainers.local/p/demo/client.js"
  );
});

test("preview WebSocket mapper routes same-host sockets to the virtual port", () => {
  const config = {
    projectId: "demo",
    defaultPort: 3000,
    previewOrigin: "https://run.opencontainers.local",
    baseUrl: "https://run.opencontainers.local/p/demo/"
  };

  assert.deepEqual(
    mapPreviewWebSocketRequest("/socket.io/?EIO=4", ["polling"], config, "about:srcdoc"),
    {
      projectId: "demo",
      port: 3000,
      path: "/socket.io/?EIO=4",
      protocols: ["polling"]
    }
  );
  assert.deepEqual(
    mapPreviewWebSocketRequest("wss://run.opencontainers.local/socket.io/?EIO=4", undefined, config, "about:srcdoc"),
    {
      projectId: "demo",
      port: 3000,
      path: "/socket.io/?EIO=4",
      protocols: undefined
    }
  );
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

class FakeWindow extends EventTarget {
  constructor({ href, origin, parent }) {
    super();
    this.location = { href, origin };
    this.parent = parent;
  }

  dispatchMessage(data) {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: data });
    this.dispatchEvent(event);
  }
}
