import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { VirtualFileSystem } from "../packages/fs/src/VirtualFileSystem.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";

function createKernel() {
  return new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      "is-number": {
        versions: {
          "1.0.0": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "is-number", version: "1.0.0", main: "index.js" }),
              "index.js": "module.exports = (value) => typeof value === 'number' && Number.isFinite(value);"
            }
          }
        }
      },
      "is-odd": {
        versions: {
          "1.0.0": {
            main: "index.js",
            dependencies: { "is-number": "^1.0.0" },
            files: {
              "package.json": JSON.stringify({ name: "is-odd", version: "1.0.0", main: "index.js", dependencies: { "is-number": "^1.0.0" } }),
              "index.js": "const isNumber = require('is-number'); module.exports = (value) => isNumber(value) && Math.abs(value % 2) === 1;"
            }
          }
        }
      },
      "hello-bin": {
        versions: {
          "1.0.0": {
            main: "index.js",
            bin: { hello: "bin/hello.js" },
            files: {
              "package.json": JSON.stringify({ name: "hello-bin", version: "1.0.0", bin: { hello: "bin/hello.js" } }),
              "bin/hello.js": "console.log('hello from bin')"
            }
          }
        }
      }
    })
  });
}

test("milestone 1: node -e executes and captures stdout", async () => {
  const kernel = createKernel();
  const result = await kernel.run("node", ["-e", "console.log('hello')"], { cwd: "/workspace" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString(), "hello\n");
});

test("milestone 2: fs sync APIs operate on the virtual filesystem", async () => {
  const kernel = createKernel();
  const result = await kernel.run("node", [
    "-e",
    "const fs=require('fs'); fs.writeFileSync('a.txt','hi'); console.log(fs.readFileSync('a.txt','utf8'))"
  ], { cwd: "/workspace" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString(), "hi\n");
  assert.equal(kernel.fs.readFileSync("/workspace/a.txt", "utf8"), "hi");
});

test("milestone 3: npm install materializes node_modules and package resolution works", async () => {
  const kernel = createKernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "is-odd": "^1.0.0" }
  }));

  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());
  assert.ok(kernel.fs.existsSync("/workspace/node_modules/is-odd/index.js"));
  assert.ok(kernel.fs.existsSync("/workspace/node_modules/is-number/index.js"));

  const result = await kernel.run("node", ["-e", "console.log(require('is-odd')(3))"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\n");
});

test("milestone 6 foundation: npm run resolves node_modules .bin shims", async () => {
  const kernel = createKernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    scripts: { dev: "hello" },
    dependencies: { "hello-bin": "1.0.0" }
  }));

  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());
  assert.ok(kernel.fs.existsSync("/workspace/node_modules/.bin/hello"));

  const result = await kernel.run("npm", ["run", "dev"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "hello from bin\n");
});

test("milestone 4 foundation: virtual http server dispatches through the kernel port table", async () => {
  const kernel = createKernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end('Hello from OpenContainers');
    }).listen(3000);
  `);

  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/",
    headers: []
  });

  assert.equal(response.status, 200);
  assert.equal(Buffer.from(response.body).toString(), "Hello from OpenContainers");
  server.kill("SIGTERM");
});

test("milestone 5 foundation: child_process.spawn runs virtual node children", async () => {
  const kernel = createKernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { spawn } = require('child_process');
      const child = spawn('node', ['-e', "console.log('child')"]);
      child.stdout.on('data', (chunk) => console.log(String(chunk).trim()));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "child\n");
});
