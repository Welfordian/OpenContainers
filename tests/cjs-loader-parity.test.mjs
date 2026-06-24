import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("CommonJS modules expose Node-like main, parent, children, loaded, and paths metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const child = require("./child");
    const mainModuleDescriptor = Object.getOwnPropertyDescriptor(process, "mainModule");
    const evalDescriptor = Object.getOwnPropertyDescriptor(process, "_eval");
    console.log("main-is-module", require.main === module);
    console.log("process-main-module", process.mainModule === module, mainModuleDescriptor.enumerable, mainModuleDescriptor.configurable, mainModuleDescriptor.writable, evalDescriptor === undefined);
    console.log("main-id", module.id);
    console.log("main-loaded-during-exec", module.loaded);
    console.log("child-record", module.children.length, module.children[0].filename.endsWith("/child.js"), module.children[0].loaded);
    console.log("child-exports", child.parentIsMain, child.loadedDuringChild, child.hasWorkspaceNodeModules);
  `);
  kernel.fs.writeFileSync("/workspace/child.js", `
    exports.parentIsMain = module.parent === require.main;
    exports.loadedDuringChild = module.loaded;
    exports.hasWorkspaceNodeModules = module.paths.includes("/workspace/node_modules");
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "main-is-module true",
    "process-main-module true true true true true",
    "main-id .",
    "main-loaded-during-exec false",
    "child-record 1 true true",
    "child-exports true false true",
    ""
  ].join("\n"));
});

test("require.cache supports Node-style property mutation and deletion", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const resolved = require.resolve("./value");
    console.log(require("./value"));
    require.cache[resolved].exports = "patched";
    console.log(require("./value"));
    delete require.cache[resolved];
    console.log(require("./value"));
  `);
  kernel.fs.writeFileSync("/workspace/value.js", `
    globalThis.__valueLoads = (globalThis.__valueLoads || 0) + 1;
    module.exports = "value-" + globalThis.__valueLoads;
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "value-1\npatched\nvalue-2\n");
});

test("ESM entry files do not expose CommonJS process main metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    console.log(Object.hasOwn(process, "mainModule"), process.mainModule);
    console.log(Object.hasOwn(process, "_eval"), process._eval);
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "false undefined\nfalse undefined\n");
});

test("node:module exposes require.cache parity and parent-aware _load", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const Module = require("node:module");
    const resolved = require.resolve("./child");
    console.log("same-cache", Module._cache === require.cache);
    const child = Module._load("./child", module);
    console.log("loaded", child.value);
    console.log("child-record", module.children.length, module.children[0].filename === resolved);
    Module._cache[resolved].exports = { value: "patched" };
    console.log("patched", require("./child").value);
  `);
  kernel.fs.writeFileSync("/workspace/child.js", `
    exports.value = "child";
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "same-cache true",
    "loaded child",
    "child-record 1 true",
    "patched patched",
    ""
  ].join("\n"));
});

test("CommonJS require helpers validate request arguments", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const Module = require("node:module");
    const manual = new Module("/workspace/manual.js");
    manual.filename = "/workspace/manual.js";
    function describe(action) {
      try {
        return "ok:" + action();
      } catch (error) {
        return [error.name, error.code, error.message].join(":");
      }
    }
    console.log([
      describe(() => require()),
      describe(() => require(1)),
      describe(() => require.resolve()),
      describe(() => require.resolve(1)),
      describe(() => require.resolve.paths()),
      describe(() => require.resolve.paths(1)),
      describe(() => manual.require()),
      describe(() => manual.require(1))
    ].join("|"));
    console.log([
      require.resolve.paths("node:fs") === null,
      require.resolve.paths("./x").join(","),
      require.resolve.paths(".").join(","),
      require.resolve.paths("..").join(","),
      Array.isArray(require.resolve.paths("/abs"))
    ].join(" "));
    console.log([
      typeof Module.prototype.require.call(null, "node:path").join,
      typeof Module.prototype.require.call(undefined, "fs").readFile,
      Module.prototype.require.call(null, "./receiver-relative"),
      Module.prototype.require.call(undefined, "./receiver-relative"),
      Module.prototype.require.call({}, "./receiver-relative")
    ].join(" "));
  `);
  kernel.fs.writeFileSync("/workspace/receiver-relative.js", "module.exports = 'relative-ok';\n");

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    [
      'TypeError:ERR_INVALID_ARG_TYPE:The "id" argument must be of type string. Received undefined',
      'TypeError:ERR_INVALID_ARG_TYPE:The "id" argument must be of type string. Received type number (1)',
      'TypeError:ERR_INVALID_ARG_TYPE:The "request" argument must be of type string. Received undefined',
      'TypeError:ERR_INVALID_ARG_TYPE:The "request" argument must be of type string. Received type number (1)',
      'TypeError:ERR_INVALID_ARG_TYPE:The "request" argument must be of type string. Received undefined',
      'TypeError:ERR_INVALID_ARG_TYPE:The "request" argument must be of type string. Received type number (1)',
      'TypeError:ERR_INVALID_ARG_TYPE:The "id" argument must be of type string. Received undefined',
      'TypeError:ERR_INVALID_ARG_TYPE:The "id" argument must be of type string. Received type number (1)'
    ].join("|"),
    "true /workspace /workspace /workspace true",
    "function function relative-ok relative-ok relative-ok",
    ""
  ].join("\n"));
});

test("require.extensions supports custom handlers and native addon failures", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const Module = require("node:module");
    console.log("same-extensions", Module._extensions === require.extensions);
    require.extensions[".txt"] = (module, filename) => {
      module.exports = require("node:fs").readFileSync(filename, "utf8").trim().toUpperCase();
    };
    require.extensions[".foo"] = (module, filename) => {
      module._compile("module.exports = require('node:path').basename(__filename) + ':' + __dirname", filename);
    };
    console.log("txt", require("./message.txt"));
    console.log("compile", require("./compiled.foo"));
    try {
      require("./native.node");
    } catch (error) {
      console.log("native", error.code);
    }
  `);
  kernel.fs.writeFileSync("/workspace/message.txt", "hello extensions\n");
  kernel.fs.writeFileSync("/workspace/compiled.foo", "");
  kernel.fs.writeFileSync("/workspace/native.node", "");

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "same-extensions true",
    "txt HELLO EXTENSIONS",
    "compile compiled.foo:/workspace",
    "native ERR_OPENCONTAINERS_NATIVE_ADDON_UNSUPPORTED",
    ""
  ].join("\n"));
});

test("failed CommonJS module loads are removed from require.cache", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const resolved = require.resolve("./bad");
    for (let index = 0; index < 2; index++) {
      try {
        require("./bad");
      } catch (error) {
        console.log(error.message, resolved in require.cache);
      }
    }
  `);
  kernel.fs.writeFileSync("/workspace/bad.js", `
    globalThis.__badLoads = (globalThis.__badLoads || 0) + 1;
    throw new Error("bad-" + globalThis.__badLoads);
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "bad-1 false\nbad-2 false\n");
});

test("circular CommonJS dependencies observe partially-loaded exports and loaded=false", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.js", `
    const a = require("./a");
    console.log(a.name, a.bSawAName, a.bSawALoaded);
  `);
  kernel.fs.writeFileSync("/workspace/a.js", `
    exports.name = "a-start";
    const b = require("./b");
    exports.bSawAName = b.aName;
    exports.bSawALoaded = b.aLoaded;
    exports.name = "a-done";
  `);
  kernel.fs.writeFileSync("/workspace/b.js", `
    const a = require("./a");
    exports.aName = a.name;
    exports.aLoaded = require.cache[require.resolve("./a")].loaded;
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "a-done a-start false\n");
});
