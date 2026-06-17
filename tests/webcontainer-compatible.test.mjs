import assert from "node:assert/strict";
import test from "node:test";
import { WelfordContainer, createWelfordServiceWorkerScript, flattenWebContainerTree } from "../packages/embed/src/webcontainer-compatible.js";

test("WelfordContainer facade flattens WebContainer mount trees", () => {
  assert.deepEqual(flattenWebContainerTree({
    src: {
      directory: {
        "index.js": { file: { contents: "console.log('ok')" } }
      }
    },
    "package.json": { file: { contents: "{}" } }
  }), {
    "src/index.js": "console.log('ok')",
    "package.json": "{}"
  });
});

test("WelfordContainer facade runs node processes with WebContainer-like output", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": { file: { contents: "console.log('facade')" } }
  });

  const process = await container.spawn("node", ["--enable-source-maps", "index.js"]);
  const output = await readStream(process.output);
  const exitCode = await process.exit;

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), "facade");
});

test("WelfordContainer facade runs REPL-shaped top-level-await modules", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": { file: { contents: "await Promise.resolve();\nconsole.log('repl-entry');" } },
    ".repl": {
      directory: {
        "runtime.mjs": {
          file: { contents: "await import('../index.js?run=123');\nconsole.log('repl-done');" }
        }
      }
    }
  });

  const process = await container.spawn("node", ["--enable-source-maps", ".repl/runtime.mjs"]);
  const output = await readStream(process.output);
  const exitCode = await process.exit;

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), "repl-entry\nrepl-done");
});

test("WelfordContainer facade honors process.exitCode in async entry modules", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.mjs": { file: { contents: "process.exitCode = 7;" } }
  });

  const process = await container.spawn("node", ["index.mjs"]);
  assert.equal(await process.exit, 7);
});

test("WelfordContainer facade reports a Node-compatible version", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  const process = await container.spawn("node", ["-v"]);

  assert.equal((await readStream(process.output)).trim(), "v26.0.0-welford");
  assert.equal(await process.exit, 0);
});

test("WelfordContainer facade exposes process.versions.v8", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": { file: { contents: "console.log(process.versions.v8);" } }
  });

  const process = await container.spawn("node", ["index.js"]);
  assert.equal((await readStream(process.output)).trim(), "14.3.127.18-node.10");
  assert.equal(await process.exit, 0);
});

test("WelfordContainer facade emits server-ready for detected ports and dispatches preview requests", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "server.js": {
      file: {
        contents: `
          const http = require('http');
          http.createServer((req, res) => res.end('port:' + req.url)).listen(8000);
        `
      }
    }
  });

  const ready = new Promise((resolve) => container.on("server-ready", (port, url) => resolve({ port, url })));
  const process = await container.spawn("node", ["server.js"]);
  const event = await ready;

  assert.equal(event.port, 8000);
  assert.match(event.url, /\/welford\/preview\/demo:8000\//);

  const response = await container.dispatchPreviewRequest({
    url: `${event.url}hello?x=1`,
    method: "GET",
    headers: []
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, "port:/hello?x=1");

  process.kill();
});

test("WelfordContainer facade kill releases preview ports for reruns", async () => {
  const container = await WelfordContainer.boot({ projectId: "repl", registerServiceWorker: false });
  await container.mount({
    "index.js": {
      file: {
        contents: `
          const http = require('http');
          http.createServer((req, res) => res.end('rerun:' + req.url)).listen(3000);
        `
      }
    }
  });

  const firstReady = onceServerReady(container);
  const first = await container.spawn("node", ["index.js"]);
  const firstEvent = await firstReady;

  assert.equal(firstEvent.port, 3000);
  assert.equal(container.kernel.listeningPorts("repl").length, 1);

  first.kill();
  assert.equal(await first.exit, 143);
  assert.deepEqual(container.kernel.listeningPorts("repl"), []);

  const secondReady = onceServerReady(container);
  const second = await container.spawn("node", ["index.js"]);
  const secondEvent = await secondReady;

  assert.equal(secondEvent.port, 3000);

  const response = await container.dispatchPreviewRequest({
    url: `${secondEvent.url}again`,
    method: "GET",
    headers: []
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, "rerun:/again");

  second.kill();
  assert.equal(await second.exit, 143);
  assert.deepEqual(container.kernel.listeningPorts("repl"), []);
});

test("WelfordContainer facade contains process startup errors in process output", async () => {
  const container = await WelfordContainer.boot({ projectId: "repl", registerServiceWorker: false });
  await container.mount({
    "index.js": {
      file: {
        contents: `
          const http = require('http');
          http.createServer((req, res) => res.end('ok')).listen(3000);
        `
      }
    }
  });

  const firstReady = onceServerReady(container);
  const first = await container.spawn("node", ["index.js"]);
  await firstReady;

  const second = await container.spawn("node", ["index.js"]);
  const output = await readStream(second.output);
  const exitCode = await second.exit;

  assert.equal(exitCode, 1);
  assert.match(output, /Port 3000 is already in use for project repl/);
  assert.deepEqual(container.kernel.listeningPorts("repl").map(({ port }) => port), [3000]);

  first.kill();
  assert.equal(await first.exit, 143);
  assert.deepEqual(container.kernel.listeningPorts("repl"), []);
});

test("WelfordContainer facade waits for Service Worker control before connecting previews", async () => {
  const previousNavigator = globalThis.navigator;
  const previousWindow = globalThis.window;
  let controller = null;
  let postedMessage = null;
  const listeners = new Set();
  const serviceWorker = {
    get controller() {
      return controller;
    },
    async register() {
      queueMicrotask(() => {
        controller = {
          postMessage(message, ports) {
            postedMessage = { message, ports };
          }
        };
        for (const listener of listeners) listener();
      });
      return {};
    },
    ready: Promise.resolve({}),
    addEventListener(type, listener) {
      if (type === "controllerchange") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "controllerchange") listeners.delete(listener);
    }
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://example.test" } }
  });

  try {
    const container = await WelfordContainer.boot({
      serviceWorkerControllerTimeoutMs: 100
    });

    assert.equal(postedMessage?.message?.type, "WELFORD_CONNECT_KERNEL");
    assert.equal(postedMessage?.ports?.length, 1);
    container.teardown();
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow
    });
  }
});

test("WelfordContainer facade connects previews through an active Service Worker before page control", async () => {
  const previousNavigator = globalThis.navigator;
  const previousWindow = globalThis.window;
  let postedMessage = null;
  const activeWorker = {
    postMessage(message, ports) {
      postedMessage = { message, ports };
    }
  };
  const serviceWorker = {
    controller: null,
    async register() {
      return { active: activeWorker };
    },
    ready: Promise.resolve({ active: activeWorker }),
    addEventListener() {},
    removeEventListener() {}
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://example.test" } }
  });

  try {
    const container = await WelfordContainer.boot({
      serviceWorkerControllerTimeoutMs: 100
    });

    assert.equal(postedMessage?.message?.type, "WELFORD_CONNECT_KERNEL");
    assert.equal(postedMessage?.ports?.length, 1);
    container.teardown();
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow
    });
  }
});

test("WelfordContainer facade allows terminal-only scripts without preview ports", async () => {
  const container = await WelfordContainer.boot({ registerServiceWorker: false });
  const ports = [];
  container.on("server-ready", (port) => ports.push(port));
  await container.mount({
    "index.js": { file: { contents: "const name = 'Josh';\nconsole.log(name);" } }
  });

  const process = await container.spawn("node", ["index.js"]);
  const output = await readStream(process.output);
  const exitCode = await process.exit;

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), "Josh");
  assert.deepEqual(ports, []);
});

test("Welford service worker script contains preview routing contract", () => {
  const script = createWelfordServiceWorkerScript();
  assert.match(script, /WELFORD_CONNECT_KERNEL/);
  assert.match(script, /\/welford\/preview/);
  assert.match(script, /dispatchHttp/);
});

async function readStream(stream) {
  let output = "";
  await stream.pipeTo(new WritableStream({
    write(chunk) {
      output += String(chunk);
    }
  }));
  return output;
}

function onceServerReady(container) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for server-ready"));
    }, 1000);
    const unsubscribe = container.on("server-ready", (port, url) => {
      clearTimeout(timer);
      unsubscribe();
      resolve({ port, url });
    });
  });
}
