import assert from "node:assert/strict";
import test from "node:test";
import { KernelWorkerHost } from "../packages/kernel/src/kernel-worker-host.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";

function createHost(messages) {
  return new KernelWorkerHost({
    postMessage: (message) => messages.push(message),
    registryClient: new MemoryRegistryClient({})
  });
}

test("KernelWorkerHost initializes projects, edits files, and runs commands", async () => {
  const messages = [];
  const host = createHost(messages);

  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  assert.equal(messages.at(-1).payload.ok, true);
  assert.ok(messages.at(-1).payload.files.some((file) => file.path === "/workspace/server.js"));

  await host.handleMessage({
    id: "write",
    type: "writeFile",
    payload: { path: "/workspace/hello.txt", content: "hello" }
  });
  await host.handleMessage({
    id: "read",
    type: "readFile",
    payload: { path: "/workspace/hello.txt" }
  });
  assert.equal(messages.at(-1).payload.content, "hello");

  await host.handleMessage({
    id: "run",
    type: "runCommand",
    payload: { commandLine: "cat hello.txt" }
  });
  assert.equal(messages.find((message) => message.type === "stream" && message.requestId === "run").chunk, "hello");
  assert.equal(messages.at(-1).payload.status, 0);
});

test("KernelWorkerHost detached dev command leaves virtual HTTP server reachable", async () => {
  const messages = [];
  const host = createHost(messages);
  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.handleMessage({
    id: "run",
    type: "runCommand",
    payload: { commandLine: "npm run dev", detached: true }
  });

  assert.equal(messages.at(-1).payload.status, "running");
  await new Promise((resolve) => setTimeout(resolve, 10));

  await host.handleMessage({
    id: "http",
    type: "dispatchHttp",
    payload: {
      projectId: "demo",
      port: 3000,
      method: "GET",
      url: "/",
      headers: []
    }
  });

  const reply = messages.at(-1).payload.response;
  assert.equal(reply.status, 200);
  assert.match(reply.body, /Hello from OpenContainers/);
});

test("KernelWorkerHost detects non-default preview ports", async () => {
  const messages = [];
  const host = createHost(messages);
  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.handleMessage({
    id: "write",
    type: "writeFile",
    payload: {
      path: "/workspace/server.js",
      content: `
        const http = require('http');
        http.createServer((req, res) => res.end('gatsby-port')).listen(8000);
      `
    }
  });
  await host.handleMessage({
    id: "run",
    type: "runCommand",
    payload: { commandLine: "npm run dev", detached: true }
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  await host.handleMessage({ id: "preview", type: "previewStatus" });
  const preview = messages.at(-1).payload.preview;
  assert.equal(preview.port, 8000);
  assert.deepEqual(preview.ports.map((entry) => entry.port), [8000]);

  await host.handleMessage({
    id: "http",
    type: "dispatchHttp",
    payload: {
      projectId: "demo",
      method: "GET",
      url: "/",
      headers: []
    }
  });

  const reply = messages.at(-1).payload.response;
  assert.equal(reply.status, 200);
  assert.equal(reply.previewPort, 8000);
  assert.match(reply.body, /gatsby-port/);
});

test("KernelWorkerHost treats terminal-only scripts as valid no-preview runs", async () => {
  const messages = [];
  const host = createHost(messages);
  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.handleMessage({
    id: "write",
    type: "writeFile",
    payload: {
      path: "/workspace/server.js",
      content: "const name = 'Josh';\nconsole.log(name);"
    }
  });
  await host.handleMessage({
    id: "pty",
    type: "openPty",
    payload: { cwd: "/workspace", cols: 100, rows: 24 }
  });
  const sessionId = messages.at(-1).payload.sessionId;
  await host.handleMessage({
    id: "input",
    type: "ptyInput",
    payload: { sessionId, data: "npm run dev\n" }
  });
  await eventually(() => messages.some((message) => message.type === "pty" && message.chunk?.includes("Josh")));

  await host.handleMessage({ id: "preview", type: "previewStatus" });
  assert.equal(messages.at(-1).payload.preview.port, null);

  await host.handleMessage({
    id: "http",
    type: "dispatchHttp",
    payload: {
      projectId: "demo",
      method: "GET",
      url: "/",
      headers: []
    }
  });
  const reply = messages.at(-1).payload.response;
  assert.equal(reply.status, 200);
  assert.equal(reply.body, "");
  assert.equal(reply.previewPort, null);
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
