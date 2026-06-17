import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { VirtualFileSystem } from "../packages/fs/src/VirtualFileSystem.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";

test("runtime transforms basic ESM imports and exports to CommonJS", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/math.mjs", `
    export const one = 1;
    export function add(a, b) { return a + b; }
    export default function label(value) { return 'value:' + value; }
  `);
  kernel.fs.writeFileSync("/workspace/main.js", `
    import label, { one, add as sum } from './math.mjs';
    console.log(label(sum(one, 2)));
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "value:3\n");
});

test("runtime treats package type module .js files as ESM and supports import.meta.url", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({ type: "module" }));
  kernel.fs.writeFileSync("/workspace/main.js", `
    export const marker = import.meta.url.includes('/workspace/main.js');
    console.log(marker);
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\n");
});

test("runtime supports dynamic import through the transformed ESM loader", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/value.mjs", "export default 'dynamic';");
  kernel.fs.writeFileSync("/workspace/main.js", `
    import('./value.mjs').then((mod) => console.log(mod.default));
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "dynamic\n");
});

test("runtime supports top-level await in ESM entry files", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    const value = await Promise.resolve('ready');
    console.log(value);
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ready\n");
});

test("runtime dynamic import strips cache-busting query strings for virtual files", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const value = await Promise.resolve('entry');
    console.log(value);
  `);
  kernel.fs.mkdirSync("/workspace/.repl", { recursive: true });
  kernel.fs.writeFileSync("/workspace/.repl/runtime.mjs", `
    await import('../index.js?run=123');
    console.log('done');
  `);

  const result = await kernel.run("node", [".repl/runtime.mjs"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "entry\ndone\n");
});

test("runtime accepts empty ESM export markers in server entries", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import http from "node:http";

    const port = 3000;
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://" + request.headers.host);
      const body = url.pathname === "/time"
        ? { now: "test-now" }
        : { hello: "Node", try: "/time" };

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body, null, 2));
    });

    server.listen(port, "0.0.0.0", () => {
      console.log("Server ready on port " + port);
    });

    export {};
  `);

  const server = kernel.spawn("node", ["index.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const response = await kernel.dispatchHttpRequest({
    id: "esm-server",
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/time",
    headers: [["host", "localhost:3000"]]
  });

  assert.equal(response.status, 200);
  assert.equal(new TextDecoder().decode(response.body), JSON.stringify({ now: "test-now" }, null, 2));
  server.kill("SIGTERM");
});

test("runtime does not transform CommonJS comments that mention exports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/commented-cjs.js", `
    // default engine export
    var fn = () => 'ok';
    module.exports = fn();
  `);

  const result = await kernel.run("node", ["-e", "console.log(require('./commented-cjs'))"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ok\n");
});

test("package exports resolve root, subpath, pattern, and conditional targets", async () => {
  const kernel = new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      "modern-pkg": {
        versions: {
          "1.0.0": {
            exports: {
              ".": {
                browser: "./browser.mjs",
                require: "./cjs.js",
                default: "./default.js"
              },
              "./feature": {
                require: "./feature.cjs",
                default: "./feature-default.js"
              },
              "./utils/*": "./utils/*.mjs"
            },
            files: {
              "package.json": JSON.stringify({
                name: "modern-pkg",
                version: "1.0.0",
                exports: {
                  ".": {
                    browser: "./browser.mjs",
                    require: "./cjs.js",
                    default: "./default.js"
                  },
                  "./feature": {
                    require: "./feature.cjs",
                    default: "./feature-default.js"
                  },
                  "./utils/*": "./utils/*.mjs"
                }
              }),
              "browser.mjs": "export const target = 'browser'; export default 'browser-default';",
              "cjs.js": "module.exports = { target: 'require' };",
              "default.js": "module.exports = { target: 'default' };",
              "feature.cjs": "module.exports = { feature: 'feature-cjs' };",
              "feature-default.js": "module.exports = { feature: 'feature-default' };",
              "utils/name.mjs": "export const name = 'pattern';"
            }
          }
        }
      }
    })
  });
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "modern-pkg": "1.0.0" }
  }));
  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());

  const result = await kernel.run("node", [
    "-e",
    `
      console.log(require('modern-pkg').target);
      console.log(require('modern-pkg/feature').feature);
      console.log(require('modern-pkg/utils/name').name);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "browser\nfeature-cjs\npattern\n");
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
