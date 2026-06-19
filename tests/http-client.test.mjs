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

test("http servers accept in-container TCP upgrade requests", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import http from "node:http";
    import net from "node:net";

    const server = http.createServer();

    server.on("upgrade", (req, socket) => {
      console.log("upgrade requested:", req.headers.upgrade);
      socket.write(
        "HTTP/1.1 101 Switching Protocols\\r\\n" +
          "Connection: Upgrade\\r\\n" +
          "Upgrade: repl-test\\r\\n" +
          "\\r\\n"
      );
      socket.write("hello over upgraded socket\\n");
      socket.on("data", (chunk) => {
        socket.write(\`echo:\${chunk}\`);
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const { port } = server.address();
    console.log("server ready:", port > 0);

    const client = net.createConnection({ host: "127.0.0.1", port });
    client.setEncoding("utf8");
    client.write(
      "GET /upgrade HTTP/1.1\\r\\n" +
        "Host: 127.0.0.1\\r\\n" +
        "Connection: Upgrade\\r\\n" +
        "Upgrade: repl-test\\r\\n" +
        "\\r\\n"
    );

    client.on("data", (data) => {
      console.log("client received:", JSON.stringify(data));
      if (data.includes("hello over upgraded socket")) {
        client.write("ping\\n");
      }
      if (data.includes("echo:ping")) {
        client.end();
        server.close();
      }
    });

    await new Promise((resolve) => server.on("close", resolve));
    console.log("upgrade test complete");
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "server ready: true",
    "upgrade requested: repl-test",
    "client received: \"HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: repl-test\\r\\n\\r\\n\"",
    "client received: \"hello over upgraded socket\\n\"",
    "client received: \"echo:ping\\n\"",
    "upgrade test complete",
    ""
  ].join("\n"));
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

test("global fetch strips npm registry headers that force browser CORS preflight", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('https://registry.npmjs.org/chalk', {
      headers: {
        accept: 'application/vnd.npm.install-v1+json',
        'npm-command': 'install',
        'pacote-req-type': 'packument',
        'pacote-version': '19.0.1',
        'user-agent': 'npm/11'
      }
    });
    console.log(response.status);
    console.log(await response.text());
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(String(url), "https://registry.npmjs.org/chalk");
    assert.equal(init.credentials, "omit");
    assert.equal(headers.get("accept"), "application/vnd.npm.install-v1+json");
    assert.equal(headers.has("npm-command"), false);
    assert.equal(headers.has("pacote-req-type"), false);
    assert.equal(headers.has("pacote-version"), false);
    assert.equal(headers.has("user-agent"), false);
    return new Response("registry-ok", { status: 203 });
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "203\nregistry-ok\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("https.get strips npm registry headers that force browser CORS preflight", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(String(url), "https://registry.npmjs.org/chalk");
    assert.equal(init.credentials, "omit");
    assert.equal(headers.get("accept"), "application/vnd.npm.install-v1+json");
    assert.equal(headers.has("npm-command"), false);
    assert.equal(headers.has("pacote-version"), false);
    return new Response("registry-ok", {
      status: 206,
      statusText: "Partial Content",
      headers: { "content-type": "text/plain" }
    });
  };

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        https.get('https://registry.npmjs.org/chalk', {
          headers: {
            accept: 'application/vnd.npm.install-v1+json',
            'npm-command': 'install',
            'pacote-version': '19.0.1'
          }
        }, (res) => {
          console.log(res.statusCode);
          res.on('data', (chunk) => console.log(String(chunk)));
        });
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "206\nregistry-ok\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch blocks host application origin even when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://run.opencontainers.local/api/private');
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
    value: { origin: "https://run.opencontainers.local" }
  });

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED\n");
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
    value: { origin: "https://run.opencontainers.local" }
  });

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        const req = https.get('https://run.opencontainers.local/api/private', () => {});
        req.on('error', (error) => console.log(error.code));
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED\n");
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
  assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED\n");
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
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch allows descriptor-scoped external hosts without enabling general external network", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('https://example.com/package');
    console.log(response.status + ':' + await response.text());

    try {
      await fetch('https://blocked.example/package');
    } catch (error) {
      console.log(error.code);
    }
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://example.com/package");
    return new Response("allowed", { status: 200 });
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], {
      cwd: "/workspace",
      externalNetworkAllowlist: ["example.com"]
    });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "200:allowed\nERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED\n");
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
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_EXTERNAL_FETCH_FAILED\ntrue\n");
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
