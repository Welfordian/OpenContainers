import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { VirtualFileSystem } from "../packages/fs/src/VirtualFileSystem.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";

function lifecycleKernel({ allowInstallScripts = false } = {}) {
  const kernel = new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      "lifecycle-pkg": {
        versions: {
          "1.0.0": {
            main: "index.js",
            scripts: {
              postinstall: "node postinstall.js"
            },
            files: {
              "package.json": JSON.stringify({
                name: "lifecycle-pkg",
                version: "1.0.0",
                main: "index.js",
                scripts: { postinstall: "node postinstall.js" }
              }),
              "index.js": "module.exports = true;",
              "postinstall.js": "const fs = require('fs'); fs.writeFileSync('../../postinstall-ran.txt', process.env.npm_lifecycle_event);"
            }
          }
        }
      },
      "socket-range-parent": {
        versions: {
          "1.0.0": {
            main: "index.js",
            dependencies: { "safer-buffer": ">=2.1.2 <3.0.0" },
            files: {
              "package.json": JSON.stringify({
                name: "socket-range-parent",
                version: "1.0.0",
                main: "index.js",
                dependencies: { "safer-buffer": ">=2.1.2 <3.0.0" }
              }),
              "index.js": "module.exports = require('safer-buffer').Buffer;"
            }
          }
        }
      },
      "safer-buffer": {
        versions: {
          "2.1.1": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "safer-buffer", version: "2.1.1", main: "index.js" }),
              "index.js": "module.exports = { Buffer: 'old' };"
            }
          },
          "2.1.2": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "safer-buffer", version: "2.1.2", main: "index.js" }),
              "index.js": "module.exports = { Buffer: 'ok' };"
            }
          },
          "2.1.3": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "safer-buffer", version: "2.1.3", main: "index.js" }),
              "index.js": "module.exports = { Buffer: 'best' };"
            }
          },
          "3.0.0": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "safer-buffer", version: "3.0.0", main: "index.js" }),
              "index.js": "module.exports = { Buffer: 'too-new' };"
            }
          }
        }
      }
    }),
    allowInstallScripts
  });
  kernel.allowInstallScripts = allowInstallScripts;
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "lifecycle-pkg": "1.0.0" }
  }));
  return kernel;
}

test("npm install skips lifecycle scripts when install-script permission is disabled", async () => {
  const kernel = lifecycleKernel({ allowInstallScripts: false });
  const result = await kernel.run("npm", ["install"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(kernel.fs.existsSync("/workspace/postinstall-ran.txt"), false);
  assert.match(result.stderr.toString(), /skipped install scripts/);
});

test("npm install runs lifecycle scripts through the virtual process manager when permitted", async () => {
  const kernel = lifecycleKernel({ allowInstallScripts: true });
  const result = await kernel.run("npm", ["install"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(kernel.fs.readFileSync("/workspace/postinstall-ran.txt", "utf8"), "postinstall");
  assert.match(result.stdout.toString(), /lifecycle-pkg@1.0.0 postinstall/);
});

test("npm install resolves transitive compound semver ranges", async () => {
  const kernel = lifecycleKernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "socket-range-parent": "1.0.0" }
  }));

  const result = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.ok(kernel.fs.existsSync("/workspace/node_modules/safer-buffer/index.js"));

  const lockfile = JSON.parse(kernel.fs.readFileSync("/workspace/package-lock.opencontainers.json", "utf8"));
  assert.ok(lockfile.packages.includes("safer-buffer@2.1.3"));
  assert.equal(lockfile.packages.includes("safer-buffer@3.0.0"), false);
});
