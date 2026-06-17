import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { KernelWorkerHost } from "../packages/kernel/src/kernel-worker-host.js";
import { createParentBridge, mapPreviewRequestUrl } from "../packages/preview-client/src/index.js";

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

test("KernelWorkerHost exposes virtual WebSocket connect/send/close messages", async () => {
  const messages = [];
  const host = new KernelWorkerHost({ postMessage: (message) => messages.push(message) });
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
    href: "https://run.welford.local/p/demo/",
    origin: "https://run.welford.local",
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

  assert.equal(parentMessages[0].message.type, "welford:ws:connect");
  assert.equal(parentMessages[0].message.port, 5173);

  const seen = [];
  socket.addEventListener("open", () => seen.push("open"));
  socket.addEventListener("message", (event) => seen.push(event.data));
  win.dispatchMessage({
    type: "welford:ws:event",
    localId: "preview-ws-1",
    socketId: "ws-1",
    event: "connected"
  });
  win.dispatchMessage({
    type: "welford:ws:event",
    localId: "preview-ws-1",
    socketId: "ws-1",
    event: "open"
  });
  socket.send("client");
  win.dispatchMessage({
    type: "welford:ws:event",
    socketId: "ws-1",
    event: "message",
    data: "server"
  });

  assert.deepEqual(seen, ["open", "server"]);
  assert.equal(parentMessages.at(-1).message.type, "welford:ws:send");
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
    parentOrigin: "https://run.welford.local",
    previewOrigin: "https://run.welford.local",
    baseUrl: "https://run.welford.local/p/demo/",
    projectId: "demo",
    defaultPort: 3000
  });
  const responsePromise = bridge.fetch({
    url: "https://run.welford.local/p/demo/api",
    method: "GET",
    headers: []
  });

  assert.equal(parentMessages[0].origin, "https://run.welford.local");
  assert.equal(parentMessages[0].message.type, "welford:fetch:request");
  win.dispatchMessage({
    type: "welford:fetch:response",
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

test("preview request URL mapper routes localhost and root-relative fetches to preview URLs", () => {
  const config = {
    projectId: "demo",
    defaultPort: 3000,
    previewOrigin: "https://run.welford.local",
    baseUrl: "https://run.welford.local/p/demo/"
  };

  assert.equal(
    mapPreviewRequestUrl("http://localhost:5173/src/main.js?x=1", config, "about:srcdoc"),
    "https://run.welford.local/p/demo:5173/src/main.js?x=1"
  );
  assert.equal(
    mapPreviewRequestUrl("/api/health", config, "about:srcdoc"),
    "https://run.welford.local/p/demo:3000/api/health"
  );
  assert.equal(
    mapPreviewRequestUrl("client.js", config, "about:srcdoc"),
    "https://run.welford.local/p/demo/client.js"
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
