import assert from "node:assert/strict";
import test from "node:test";
import { OpenContainer, createOpenContainersServiceWorkerScript, flattenWebContainerTree } from "../packages/embed/src/webcontainer-compatible.js";

test("OpenContainer facade flattens WebContainer mount trees", () => {
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

test("OpenContainer facade runs node processes with WebContainer-like output", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": { file: { contents: "console.log('facade')" } }
  });

  const process = await container.spawn("node", ["--enable-source-maps", "index.js"]);
  const output = await readStream(process.output);
  const exitCode = await process.exit;

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), "facade");
});

test("OpenContainer facade exposes process input for readline prompts", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "name.js": {
      file: {
        contents: `
          import readline from "node:readline/promises";
          import { stdin as input, stdout as output } from "node:process";

          const rl = readline.createInterface({ input, output });
          const name = await rl.question("name? ");
          console.log("answer:" + name);
          rl.close();
        `
      }
    }
  });

  const process = await container.spawn("node", ["name.js"]);
  const writer = process.input.getWriter();
  let answered = false;
  let output = "";

  await process.output.pipeTo(new WritableStream({
    write(chunk) {
      output += String(chunk);
      if (!answered && output.includes("name? ")) {
        answered = true;
        writer.write("Josh\n");
      }
    }
  }));

  assert.equal(await process.exit, 0);
  assert.equal(output, "name? answer:Josh\n");
});

test("OpenContainer facade runs REPL-shaped top-level-await modules", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
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

test("OpenContainer facade honors process.exitCode in async entry modules", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.mjs": { file: { contents: "process.exitCode = 7;" } }
  });

  const process = await container.spawn("node", ["index.mjs"]);
  assert.equal(await process.exit, 7);
});

test("OpenContainer facade reports a Node-compatible version", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  const process = await container.spawn("node", ["-v"]);

  assert.equal((await readStream(process.output)).trim(), "v26.0.0-opencontainers");
  assert.equal(await process.exit, 0);
});

test("OpenContainer facade exposes process.versions.v8", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": { file: { contents: "console.log(process.versions.v8);" } }
  });

  const process = await container.spawn("node", ["index.js"]);
  assert.equal((await readStream(process.output)).trim(), "14.3.127.18-node.10");
  assert.equal(await process.exit, 0);
});

test("OpenContainer facade does not expose host browser globals to user code", async () => {
  const previousAlert = globalThis.alert;
  globalThis.alert = () => {
    throw new Error("host alert should not be called");
  };

  try {
    const container = await OpenContainer.boot({ registerServiceWorker: false });
    await container.mount({
      "index.js": {
        file: {
          contents: `
            console.log(typeof alert);
            console.log(String(globalThis.alert));
            try { alert('hi'); } catch (error) { console.log(error.name + ':' + error.message); }
          `
        }
      }
    });

    const process = await container.spawn("node", ["index.js"]);
    const output = await readStream(process.output);

    assert.equal(await process.exit, 0);
    assert.match(output, /^undefined\nundefined\nTypeError:alert is not a function\n?$/);
  } finally {
    if (previousAlert === undefined) delete globalThis.alert;
    else globalThis.alert = previousAlert;
  }
});

test("OpenContainer facade emits server-ready for detected ports and dispatches preview requests", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
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
  assert.match(event.url, /\/opencontainers\/preview\/demo:8000\//);

  const response = await container.dispatchPreviewRequest({
    url: `${event.url}hello?x=1`,
    method: "GET",
    headers: []
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, "port:/hello?x=1");

  process.kill();
});

test("OpenContainer facade dispatches nested preview URLs to the innermost port", async () => {
  const container = await OpenContainer.boot({ projectId: "repl", registerServiceWorker: false });
  await container.mount({
    "server.js": {
      file: {
        contents: `
          const http = require('http');
          http.createServer((req, res) => res.end('inner:' + req.url)).listen(3000);
        `
      }
    }
  });

  const ready = onceServerReady(container);
  const process = await container.spawn("node", ["server.js"]);
  await ready;

  const response = await container.dispatchPreviewRequest({
    url: "https://run.opencontainers.local/opencontainers/preview/repl:8000/opencontainers/preview/repl:3000/socket.io/?EIO=4&transport=polling",
    method: "GET",
    headers: []
  });

  assert.equal(response.status, 200);
  assert.equal(response.body, "inner:/socket.io/?EIO=4&transport=polling");

  process.kill();
});

test("OpenContainer facade kill releases preview ports for reruns", async () => {
  const container = await OpenContainer.boot({ projectId: "repl", registerServiceWorker: false });
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

test("OpenContainer facade contains process startup errors in process output", async () => {
  const container = await OpenContainer.boot({ projectId: "repl", registerServiceWorker: false });
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

test("OpenContainer facade supports Express-style response helpers", async () => {
  const container = await OpenContainer.boot({ projectId: "repl", registerServiceWorker: false });
  await container.mount({
    "server.js": {
      file: {
        contents: `
          const http = require('http');
          http.createServer((req, res) => {
            req.unpipe();
            res.end(String(Buffer.isBuffer(Buffer.from('ok'))) + ':' + typeof Buffer.allocUnsafe);
          }).listen(3000);
        `
      }
    }
  });

  const ready = onceServerReady(container);
  const process = await container.spawn("node", ["server.js"]);
  const event = await ready;

  const response = await container.dispatchPreviewRequest({
    url: event.url,
    method: "GET",
    headers: []
  });

  assert.equal(response.status, 200);
  assert.equal(response.body, "true:function");

  process.kill();
  assert.equal(await process.exit, 143);
});

test("OpenContainer facade waits for Service Worker control before connecting previews", async () => {
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
    const container = await OpenContainer.boot({
      serviceWorkerControllerTimeoutMs: 100
    });

    assert.equal(postedMessage?.message?.type, "OPENCONTAINERS_CONNECT_KERNEL");
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

test("OpenContainer facade reconnects the Service Worker when previews request a runtime channel", async () => {
  const previousNavigator = globalThis.navigator;
  const previousWindow = globalThis.window;
  const postedMessages = [];
  const listeners = new Map();
  const controller = {
    postMessage(message, ports) {
      postedMessages.push({ message, ports });
    }
  };
  const serviceWorker = {
    controller,
    async register() {
      return { active: controller };
    },
    ready: Promise.resolve({ active: controller }),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
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
    const container = await OpenContainer.boot();
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "OPENCONTAINERS_CONNECT_KERNEL");

    listeners.get("message")?.({
      data: { type: "OPENCONTAINERS_REQUEST_KERNEL_CONNECTION" }
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(postedMessages.length, 2);
    assert.equal(postedMessages[1].message.type, "OPENCONTAINERS_CONNECT_KERNEL");

    container.teardown();
    assert.equal(listeners.has("message"), false);
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

test("OpenContainer facade does not connect previews until the Service Worker controls the page", async () => {
  const previousNavigator = globalThis.navigator;
  const previousWindow = globalThis.window;
  let postedMessage = null;
  const errors = [];
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
    const container = await OpenContainer.boot({
      serviceWorkerControllerTimeoutMs: 100
    });
    container.on("error", error => errors.push(error));
    const portEvents = [];
    container.on("port", (...args) => portEvents.push(args));
    container.on("server-ready", (...args) => portEvents.push(args));
    await container.mount({
      "server.js": {
        file: {
          contents: "require('http').createServer((_req, res) => res.end('ok')).listen(3000);"
        }
      }
    });

    const process = await container.spawn("node", ["server.js"]);
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(postedMessage, null);
    assert.equal(container.serviceWorkerPort, null);
    assert.deepEqual(portEvents, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Service Worker is not controlling this page/);
    process.kill();
    assert.equal(await process.exit, 143);
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

test("OpenContainer facade allows terminal-only scripts without preview ports", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
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

test("OpenContainer facade keeps interval-only scripts alive until cleared", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": {
      file: {
        contents: `
          let count = 0;
          const max = 3;
          const timer = setInterval(() => {
            count++;
            console.log(count);
            if (count >= max) {
              clearInterval(timer);
              console.log('Done!');
            }
          }, 1);
        `
      }
    }
  });

  const process = await container.spawn("node", ["index.js"]);
  const output = await readStream(process.output);
  const exitCode = await process.exit;

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), "1\n2\n3\nDone!");
});

test("OpenContainer facade supports node:worker_threads eval workers", async () => {
  const container = await OpenContainer.boot({ registerServiceWorker: false });
  await container.mount({
    "index.js": {
      file: {
        contents: `
          import { Worker } from "node:worker_threads";

          const worker = new Worker(
            \`
              const { parentPort } = require("worker_threads");
              parentPort.postMessage("Worker OK");
            \`,
            { eval: true }
          );

          worker.on("message", console.log);
        `
      }
    }
  });

  const process = await container.spawn("node", ["index.js"]);
  const output = await readStream(process.output);
  const exitCode = await process.exit;

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), "Worker OK");
});

test("OpenContainers service worker script contains preview routing contract", () => {
  const script = createOpenContainersServiceWorkerScript();
  assert.match(script, /OPENCONTAINERS_CONNECT_KERNEL/);
  assert.match(script, /OPENCONTAINERS_REQUEST_KERNEL_CONNECTION/);
  assert.match(script, /\/opencontainers\/preview/);
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
