import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("http and https expose Node-compatible method and status constants", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('node:http');
      const https = require('node:https');
      console.log(http.METHODS.includes('GET'));
      console.log(http.METHODS.includes('POST'));
      console.log(http.STATUS_CODES[404]);
      console.log(https.METHODS.includes('GET'));
      console.log(https.STATUS_CODES[200]);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\ntrue\nNot Found\ntrue\nOK\n");
});

test("http.get dispatches virtual localhost requests through the kernel HTTP table", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end('path:' + req.url);
    }).listen(3000);
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('http');
      http.get('http://localhost:3000/from-client', (res) => {
        console.log(res.statusCode);
        res.on('data', (chunk) => console.log(String(chunk)));
      });
    `
  ], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "200\npath:/from-client\n");
  server.kill("SIGTERM");
});

test("http.createServer registers initial listener as reorderable request listener", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    const server = http.createServer((req, res) => {
      res.end('app:' + req.url);
    });
    const appListener = server.listeners('request')[0];
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      if (req.url.startsWith('/socket.io/')) {
        res.end('socket');
        return;
      }
      appListener(req, res);
    });
    server.listen(3000);
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const socketResponse = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/socket.io/?EIO=4",
    headers: []
  });
  const appResponse = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/hello",
    headers: []
  });

  assert.equal(new TextDecoder().decode(socketResponse.body), "socket");
  assert.equal(new TextDecoder().decode(appResponse.body), "app:/hello");
  server.kill("SIGTERM");
});

test("virtual server request listener errors return 500 without escaping the host app", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer(() => {
      throw new Error('request boom');
    }).listen(3000);
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const response = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/boom",
    headers: []
  });

  assert.equal(response.status, 500);
  assert.equal(response.statusText, "Internal Server Error");
  assert.match(new TextDecoder().decode(response.body), /Unhandled virtual server error: request boom/);
  assert.match(server.stderr.toString(), /request boom/);
  server.kill("SIGTERM");
});

test("global fetch dispatches virtual localhost requests through the kernel HTTP table", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end('fetch-path:' + req.url);
    }).listen(3000);
  `);
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('http://localhost:3000/from-fetch?x=1');
    console.log(response.status);
    console.log(await response.text());
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "200\nfetch-path:/from-fetch?x=1\n");
  server.kill("SIGTERM");
});

test("https.get maps external requests to fetch when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response("fetched:" + new URL(url).pathname, {
    status: 201,
    statusText: "Created",
    headers: { "content-type": "text/plain" }
  });

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        https.get('https://example.com/api', (res) => {
          console.log(res.statusCode);
          res.on('data', (chunk) => console.log(String(chunk)));
        });
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "201\nfetched:/api\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch maps external requests to browser fetch when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('https://example.com/api');
    console.log(response.status);
    console.log(await response.text());
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response("fetched:" + new URL(url).pathname, {
    status: 202,
    statusText: "Accepted",
    headers: { "content-type": "text/plain" }
  });

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "202\nfetched:/api\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch blocks host application origin even when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://run.welford.local/api/private');
    } catch (error) {
      console.log(error.code);
    }
  `);
  const oldFetch = globalThis.fetch;
  const oldLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  globalThis.fetch = async () => {
    throw new Error("host fetch should not be called");
  };
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://run.welford.local" }
  });

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_WELFORD_HOST_ORIGIN_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
    restoreGlobalLocation(oldLocationDescriptor);
  }
});

test("https.get blocks host application origin even when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  const oldFetch = globalThis.fetch;
  const oldLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  globalThis.fetch = async () => {
    throw new Error("host fetch should not be called");
  };
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://run.welford.local" }
  });

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        const req = https.get('https://run.welford.local/api/private', () => {});
        req.on('error', (error) => console.log(error.code));
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_WELFORD_HOST_ORIGIN_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
    restoreGlobalLocation(oldLocationDescriptor);
  }
});

test("http.get blocks external requests without external network permission", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('http');
      const req = http.get('http://example.com/', () => {});
      req.on('error', (error) => console.log(error.code));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ERR_WELFORD_EXTERNAL_NETWORK_BLOCKED\n");
});

test("global fetch blocks external requests without external network permission", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://example.com/');
    } catch (error) {
      console.log(error.code);
    }
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("host fetch should not be called");
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_WELFORD_EXTERNAL_NETWORK_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch reports browser CORS and network failures clearly", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://example.com/');
    } catch (error) {
      console.log(error.code);
      console.log(error.message.includes('Browser CORS and network restrictions still apply'));
    }
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_WELFORD_EXTERNAL_FETCH_FAILED\ntrue\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

function restoreGlobalLocation(descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, "location", descriptor);
  } else {
    delete globalThis.location;
  }
}

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
