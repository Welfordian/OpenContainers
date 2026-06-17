import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { VirtualFileSystem } from "../packages/fs/src/VirtualFileSystem.js";
import { MemoryRegistryClient } from "../packages/npm/src/registry-client.js";

function adapterKernel() {
  const kernel = new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      esbuild: {
        versions: {
          "0.19.0": {
            main: "lib/main.js",
            bin: { esbuild: "bin/esbuild" },
            scripts: { postinstall: "node native-install.js" },
            files: {
              "package.json": JSON.stringify({
                name: "esbuild",
                version: "0.19.0",
                main: "lib/main.js",
                bin: { esbuild: "bin/esbuild" },
                scripts: { postinstall: "node native-install.js" }
              }),
              "lib/main.js": "throw new Error('native esbuild path should not load');",
              "bin/esbuild": "throw new Error('native esbuild bin should not run');",
              "native-install.js": "require('fs').writeFileSync('../../native-install-ran.txt', 'yes');"
            }
          }
        }
      },
      fsevents: {
        versions: {
          "2.0.0": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "fsevents", version: "2.0.0", main: "index.js" }),
              "index.js": "throw new Error('native fsevents should not load');"
            }
          }
        }
      },
      sharp: {
        versions: {
          "1.0.0": {
            main: "index.js",
            files: {
              "package.json": JSON.stringify({ name: "sharp", version: "1.0.0", main: "index.js" }),
              "index.js": "module.exports = () => 'native sharp';"
            }
          }
        }
      }
    }),
    allowInstallScripts: true
  });
  kernel.allowInstallScripts = true;
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: {
      esbuild: "0.19.0",
      fsevents: "2.0.0",
      sharp: "1.0.0"
    }
  }));
  return kernel;
}

test("npm install applies package adapters to native-binary packages", async () => {
  const kernel = adapterKernel();
  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });

  assert.equal(install.status, 0, install.stderr.toString());
  assert.match(install.stdout.toString(), /adapted esbuild@0.19.0/);
  assert.match(install.stderr.toString(), /skipped install scripts for esbuild@0.19.0/);
  assert.equal(kernel.fs.existsSync("/workspace/native-install-ran.txt"), false);
  assert.ok(kernel.fs.existsSync("/__adapters__/esbuild-wasm/index.js"));
  assert.ok(kernel.fs.existsSync("/__adapters__/esbuild-wasm/bin.js"));

  const shim = JSON.parse(kernel.fs.readFileSync("/workspace/node_modules/.bin/esbuild", "utf8"));
  assert.equal(shim.target, "/__adapters__/esbuild-wasm/bin.js");

  const requireResult = await kernel.run("node", [
    "-e",
    "const esbuild = require('esbuild'); console.log(esbuild.version); console.log(esbuild.transformSync('let x = 1').code);"
  ], { cwd: "/workspace" });
  assert.equal(requireResult.status, 0, requireResult.stderr.toString());
  assert.equal(requireResult.stdout.toString(), "welford-esbuild-wasm-adapter\nlet x = 1\n");

  const binResult = await kernel.run("esbuild", ["--version"], { cwd: "/workspace" });
  assert.equal(binResult.status, 0, binResult.stderr.toString());
  assert.equal(binResult.stdout.toString(), "welford-esbuild-wasm-adapter\n");
});

test("fsevents and sharp adapters replace native module behavior explicitly", async () => {
  const kernel = adapterKernel();
  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());

  const result = await kernel.run("node", [
    "-e",
    `
      const fsevents = require('fsevents');
      console.log(typeof fsevents.watch('/tmp').close);
      try {
        require('sharp')();
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "function\nERR_WELFORD_NATIVE_MODULE_UNSUPPORTED\n");
});
