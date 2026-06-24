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

test("runtime transforms same-line static ESM imports before trailing code", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/helpers.mjs", `
    export const named = "named";
    export default "default";
  `);
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import "./helpers.mjs"; console.log("side-effect");
    import * as namespace from "./helpers.mjs"; console.log(namespace.named);
    import defaultValue, * as combined from "./helpers.mjs"; console.log(defaultValue + ":" + combined.named);
    import { named } from "./helpers.mjs"; console.log(named);
    import value from "./helpers.mjs"; console.log(value);
    import mixed, { named as renamed } from "./helpers.mjs"; console.log(mixed + ":" + renamed);
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "side-effect",
    "named",
    "default:named",
    "named",
    "default",
    "default:named"
  ]);
});

test("runtime transforms same-line ESM export lists before trailing code", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/base.mjs", `
    export const value = "base";
    export const other = "other";
  `);
  kernel.fs.writeFileSync("/workspace/reexport.mjs", `
    export { value as renamed } from "./base.mjs"; console.log("after reexport");
  `);
  kernel.fs.writeFileSync("/workspace/star.mjs", `
    export * from "./base.mjs"; console.log("after star");
  `);
  kernel.fs.writeFileSync("/workspace/namespace.mjs", `
    export * as baseNamespace from "./base.mjs"; console.log("after namespace");
  `);
  kernel.fs.writeFileSync("/workspace/local.mjs", `
    const local = "local";
    export { local }; console.log("after local");
  `);
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import { renamed } from "./reexport.mjs";
    import { value as starValue } from "./star.mjs";
    import { baseNamespace } from "./namespace.mjs";
    import { local } from "./local.mjs";
    console.log(renamed + ":" + starValue + ":" + baseNamespace.value + ":" + local);
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "after reexport",
    "after star",
    "after namespace",
    "after local",
    "base:base:base:local"
  ]);
});

test("runtime does not transform import and export text inside template strings", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    const moduleSource = \`
      import { value } from "not-real";
      export const value = 1;
      const url = import.meta.url;
      const dynamic = import("not-real");
    \`;

    console.log(moduleSource.includes('import { value } from "not-real";'));
    console.log(moduleSource.includes('export const value = 1;'));
    console.log(moduleSource.includes('import.meta.url'));
    console.log(moduleSource.includes('import("not-real")'));

    export {};
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true",
    "true"
  ]);
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

test("runtime supports import.meta filename, dirname, and resolve", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/data.json", JSON.stringify({ ok: true }));
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    console.log(import.meta.url);
    console.log(import.meta.filename);
    console.log(import.meta.dirname);
    console.log(import.meta.resolve("./data.json"));
    console.log(import.meta.resolve("node:fs"));
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "file:///workspace/main.mjs",
    "/workspace/main.mjs",
    "/workspace",
    "file:///workspace/data.json",
    "node:fs",
    ""
  ].join("\n"));
});

test("runtime import.meta.resolve follows package exports and imports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    type: "module",
    imports: {
      "#local": "./local.js",
      "#external": "resolve-pkg/feature",
      "#pattern/*": "./imports/*.js",
      "#blocked": null,
      "#escape": "../outside.js"
    }
  }));
  kernel.fs.writeFileSync("/workspace/local.js", "export default 'local';");
  kernel.fs.mkdirSync("/workspace/imports", { recursive: true });
  kernel.fs.writeFileSync("/workspace/imports/name.js", "export default 'import-pattern';");
  kernel.fs.writeFileSync("/outside.js", "export default 'outside';");
  kernel.fs.mkdirSync("/workspace/node_modules/resolve-pkg", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/resolve-pkg/package.json", JSON.stringify({
    name: "resolve-pkg",
    type: "module",
    exports: {
      ".": {
        import: "./import.js",
        require: "./require.cjs",
        default: "./default.js"
      },
      "./feature": "./feature.js",
      "./pattern/*": "./pattern/*.js",
      "./blocked": null,
      "./escape": "../escape.js"
    }
  }));
  kernel.fs.writeFileSync("/workspace/node_modules/resolve-pkg/import.js", "export default 'import';");
  kernel.fs.writeFileSync("/workspace/node_modules/resolve-pkg/require.cjs", "module.exports = 'require';");
  kernel.fs.writeFileSync("/workspace/node_modules/resolve-pkg/default.js", "export default 'default';");
  kernel.fs.writeFileSync("/workspace/node_modules/resolve-pkg/feature.js", "export default 'feature';");
  kernel.fs.mkdirSync("/workspace/node_modules/resolve-pkg/pattern", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/resolve-pkg/pattern/name.js", "export default 'export-pattern';");
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    const resolveRow = (specifier) => {
      try {
        return import.meta.resolve(specifier);
      } catch (error) {
        return error.code;
      }
    };
    for (const specifier of [
      "resolve-pkg",
      "resolve-pkg/feature",
      "resolve-pkg/pattern/name",
      "#local",
      "#external",
      "#pattern/name",
      "#missing",
      "#blocked",
      "#escape",
      "resolve-pkg/blocked",
      "resolve-pkg/escape"
    ]) {
      console.log(resolveRow(specifier));
    }
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "file:///workspace/node_modules/resolve-pkg/import.js",
    "file:///workspace/node_modules/resolve-pkg/feature.js",
    "file:///workspace/node_modules/resolve-pkg/pattern/name.js",
    "file:///workspace/local.js",
    "file:///workspace/node_modules/resolve-pkg/feature.js",
    "file:///workspace/imports/name.js",
    "ERR_PACKAGE_IMPORT_NOT_DEFINED",
    "ERR_PACKAGE_IMPORT_NOT_DEFINED",
    "ERR_INVALID_PACKAGE_TARGET",
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
    "ERR_INVALID_PACKAGE_TARGET",
    ""
  ].join("\n"));
});

test("runtime supports JSON import attributes in transformed ESM", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/data.json", JSON.stringify({ name: "OpenContainers" }));
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import data from "./data.json" with { type: "json" };
    console.log(data.name);
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "OpenContainers\n");
});

test("runtime exposes live ESM export getters to namespace and dynamic import consumers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/counter.mjs", `
    export let count = 0;
    export function increment() {
      count += 1;
    }
  `);
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import { types } from "node:util";
    import * as counter from "./counter.mjs";
    console.log(counter.count);
    counter.increment();
    console.log(counter.count);
    const dynamic = await import("./counter.mjs");
    console.log(Object.prototype.toString.call(dynamic), types.isModuleNamespaceObject(dynamic));
    console.log(types.isModuleNamespaceObject({ [Symbol.toStringTag]: "Module" }));
    dynamic.increment();
    console.log(dynamic.count);
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "0\n1\n[object Module] true\nfalse\n2\n");
});

test("runtime exposes native-shaped builtin namespace descriptors to transformed ESM", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import * as timers from "node:timers/promises";
    const descriptor = Object.getOwnPropertyDescriptor(timers, "setTimeout");
    console.log(Object.keys(timers).join(","));
    console.log(Object.prototype.toString.call(timers));
    console.log(Object.getOwnPropertySymbols(timers).map(String).join(","));
    console.log(Object.getPrototypeOf(timers) === null);
    console.log(Object.isExtensible(timers), Object.isSealed(timers), Object.isFrozen(timers));
    console.log(descriptor.enumerable, descriptor.configurable, descriptor.writable, "value" in descriptor, typeof descriptor.get);
    try {
      (function () {
        "use strict";
        timers.setTimeout = 1;
      })();
      console.log("assign ok");
    } catch (error) {
      console.log(error.name);
    }
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "default,scheduler,setImmediate,setInterval,setTimeout",
    "[object Module]",
    "Symbol(Symbol.toStringTag)",
    "true",
    "false true false",
    "true false true true undefined",
    "TypeError"
  ]);
});

test("runtime syncs mutated builtin CommonJS exports into ESM namespaces", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import { createRequire, syncBuiltinESMExports } from "node:module";
    import * as timers from "node:timers/promises";
    const dynamicTimers = await import("node:timers/promises");
    const require = createRequire(import.meta.url);
    const cjsTimers = require("node:timers/promises");
    const originalTimeout = cjsTimers.setTimeout;
    const originalImmediate = cjsTimers.setImmediate;
    cjsTimers.setTimeout = function patchedTimeout() {};
    console.log("mutated", timers.setTimeout === cjsTimers.setTimeout, dynamicTimers.setTimeout === cjsTimers.setTimeout, timers.setTimeout === originalTimeout, dynamicTimers.setTimeout === originalTimeout);
    syncBuiltinESMExports();
    console.log("synced", timers.setTimeout === cjsTimers.setTimeout, dynamicTimers.setTimeout === cjsTimers.setTimeout, timers.setTimeout.name, dynamicTimers.setTimeout.name);
    delete cjsTimers.setImmediate;
    syncBuiltinESMExports();
    console.log("deleted", Object.hasOwn(timers, "setImmediate"), typeof timers.setImmediate, Object.hasOwn(dynamicTimers, "setImmediate"), typeof dynamicTimers.setImmediate);
    cjsTimers.setTimeout = originalTimeout;
    cjsTimers.setImmediate = originalImmediate;
    syncBuiltinESMExports();
  `);

  const result = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "mutated false false true true",
    "synced true true patchedTimeout patchedTimeout",
    "deleted true undefined true undefined"
  ]);
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

test("runtime source overrides do not mutate workspace files", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", "1 + 1;\n");
  kernel.fs.mkdirSync("/workspace/.repl", { recursive: true });
  kernel.fs.writeFileSync("/workspace/.repl/runtime.mjs", `
    globalThis.__opencontainersSourceOverrides = {
      "/workspace/index.js": "await globalThis.__replReturn(1 + 1);\\n"
    };
    globalThis.__replReturn = async value => {
      console.log("return:" + value);
      return value;
    };
    await import("../index.js?run=123");
    console.log("done");
  `);

  const result = await kernel.run("node", [".repl/runtime.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "return:2\ndone\n");
  assert.equal(kernel.fs.readFileSync("/workspace/index.js", "utf8"), "1 + 1;\n");
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
  assert.equal(result.stdout.toString(), "require\nfeature-cjs\npattern\n");
});

test("package exports resolve package self references from the active package scope", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    name: "root-pkg",
    exports: {
      ".": "./main.js",
      "./feature": "./feature.js"
    }
  }));
  kernel.fs.writeFileSync("/workspace/main.js", "module.exports = 'root-main';");
  kernel.fs.writeFileSync("/workspace/feature.js", "module.exports = 'root-feature';");
  kernel.fs.writeFileSync("/workspace/inside.js", `
    for (const id of ["root-pkg", "root-pkg/feature", "root-pkg/missing"]) {
      try {
        console.log(id + ":" + require(id));
      } catch (error) {
        console.log(id + ":" + error.code);
      }
    }
    console.log(require.resolve("root-pkg", { paths: ["/tmp"] }).endsWith("/workspace/main.js"));
  `);

  kernel.fs.mkdirSync("/workspace/scoped", { recursive: true });
  kernel.fs.writeFileSync("/workspace/scoped/package.json", JSON.stringify({
    name: "@scope/self",
    exports: {
      ".": "./index.js",
      "./x": "./x.js"
    }
  }));
  kernel.fs.writeFileSync("/workspace/scoped/index.js", "module.exports = 'scoped-index';");
  kernel.fs.writeFileSync("/workspace/scoped/x.js", "module.exports = 'scoped-x';");
  kernel.fs.writeFileSync("/workspace/scoped/inside.js", `
    console.log(require("@scope/self"));
    console.log(require("@scope/self/x"));
  `);

  kernel.fs.mkdirSync("/workspace/plain", { recursive: true });
  kernel.fs.writeFileSync("/workspace/plain/package.json", JSON.stringify({
    name: "plain-self",
    main: "index.js"
  }));
  kernel.fs.writeFileSync("/workspace/plain/index.js", "module.exports = 'plain-index';");
  kernel.fs.writeFileSync("/workspace/plain/inside.js", `
    try {
      require("plain-self");
    } catch (error) {
      console.log(error.code);
    }
  `);

  kernel.fs.mkdirSync("/workspace/no-root", { recursive: true });
  kernel.fs.writeFileSync("/workspace/no-root/package.json", JSON.stringify({
    name: "no-root-self",
    exports: {
      "./x": "./x.js"
    }
  }));
  kernel.fs.writeFileSync("/workspace/no-root/x.js", "module.exports = 'no-root-x';");
  kernel.fs.writeFileSync("/workspace/no-root/inside.js", `
    for (const id of ["no-root-self", "no-root-self/x"]) {
      try {
        console.log(id + ":" + require(id));
      } catch (error) {
        console.log(id + ":" + error.code);
      }
    }
  `);

  kernel.fs.writeFileSync("/outside.js", `
    try {
      require("root-pkg");
    } catch (error) {
      console.log(error.code);
    }
  `);

  const root = await kernel.run("node", ["/workspace/inside.js"], { cwd: "/workspace" });
  assert.equal(root.status, 0, root.stderr.toString());
  assert.deepEqual(root.stdout.toString().trim().split("\n"), [
    "root-pkg:root-main",
    "root-pkg/feature:root-feature",
    "root-pkg/missing:ERR_PACKAGE_PATH_NOT_EXPORTED",
    "true"
  ]);

  const scoped = await kernel.run("node", ["/workspace/scoped/inside.js"], { cwd: "/workspace/scoped" });
  assert.equal(scoped.status, 0, scoped.stderr.toString());
  assert.deepEqual(scoped.stdout.toString().trim().split("\n"), [
    "scoped-index",
    "scoped-x"
  ]);

  const plain = await kernel.run("node", ["/workspace/plain/inside.js"], { cwd: "/workspace/plain" });
  assert.equal(plain.status, 0, plain.stderr.toString());
  assert.equal(plain.stdout.toString().trim(), "MODULE_NOT_FOUND");

  const noRoot = await kernel.run("node", ["/workspace/no-root/inside.js"], { cwd: "/workspace/no-root" });
  assert.equal(noRoot.status, 0, noRoot.stderr.toString());
  assert.deepEqual(noRoot.stdout.toString().trim().split("\n"), [
    "no-root-self:ERR_PACKAGE_PATH_NOT_EXPORTED",
    "no-root-self/x:no-root-x"
  ]);

  const outside = await kernel.run("node", ["/outside.js"], { cwd: "/" });
  assert.equal(outside.status, 0, outside.stderr.toString());
  assert.equal(outside.stdout.toString().trim(), "MODULE_NOT_FOUND");
});

test("package exports and imports preserve wildcard replacements inside array targets", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/node_modules/array-target-pkg/src", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/array-target-pkg/package.json", JSON.stringify({
    name: "array-target-pkg",
    version: "1.0.0",
    type: "module",
    exports: {
      "./features/*": [
        "./src/*.js"
      ]
    },
    imports: {
      "#internal/*": [
        "./src/*.js"
      ]
    }
  }));
  kernel.fs.writeFileSync("/workspace/node_modules/array-target-pkg/src/name.js", `
    export const name = "array-target";
    export default name;
  `);
  kernel.fs.writeFileSync("/workspace/node_modules/array-target-pkg/main.js", `
    import value from "#internal/name";
    console.log(value);
  `);
  kernel.fs.writeFileSync("/workspace/main.js", `
    import value from "array-target-pkg/features/name";
    console.log(value);
  `);

  const exported = await kernel.run("node", ["main.js"], { cwd: "/workspace" });
  assert.equal(exported.status, 0, exported.stderr.toString());
  assert.equal(exported.stdout.toString(), "array-target\n");

  const imported = await kernel.run("node", ["node_modules/array-target-pkg/main.js"], { cwd: "/workspace" });
  assert.equal(imported.status, 0, imported.stderr.toString());
  assert.equal(imported.stdout.toString(), "array-target\n");
});

test("package exports respect declared condition order with browser fallback", async () => {
  const kernel = new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      "conditioned-pkg": {
        versions: {
          "1.0.0": {
            exports: {
              ".": {
                browser: "./browser.js",
                require: "./require.js",
                import: "./import.js",
                node: "./node.js",
                default: "./default.js"
              },
              "./node-first": {
                node: "./node.js",
                require: "./require.js",
                default: "./default.js"
              },
              "./browser-only": {
                browser: "./browser.js"
              }
            },
            files: {
              "package.json": JSON.stringify({
                name: "conditioned-pkg",
                version: "1.0.0",
                exports: {
                  ".": {
                    browser: "./browser.js",
                    require: "./require.js",
                    import: "./import.js",
                    node: "./node.js",
                    default: "./default.js"
                  },
                  "./node-first": {
                    node: "./node.js",
                    require: "./require.js",
                    default: "./default.js"
                  },
                  "./browser-only": {
                    browser: "./browser.js"
                  }
                }
              }),
              "browser.js": "module.exports = 'browser';",
              "require.js": "module.exports = 'require';",
              "import.js": "module.exports = 'import';",
              "node.js": "module.exports = 'node';",
              "default.js": "module.exports = 'default';"
            }
          }
        }
      }
    })
  });
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "conditioned-pkg": "1.0.0" }
  }));
  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());

  const result = await kernel.run("node", [
    "-e",
    `
      console.log(require('conditioned-pkg'));
      console.log(require('conditioned-pkg/node-first'));
      console.log(require('conditioned-pkg/browser-only'));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "require\nnode\nbrowser\n");
});

test("static ESM package imports and re-exports use import conditions", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/node_modules/dual-pkg", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/package.json", JSON.stringify({
    name: "dual-pkg",
    version: "1.0.0",
    exports: {
      ".": {
        require: "./require.cjs",
        import: "./import.mjs",
        default: "./default.cjs"
      },
      "./feature": {
        require: "./feature-require.cjs",
        import: "./feature-import.mjs",
        default: "./feature-default.cjs"
      }
    }
  }));
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/require.cjs", "module.exports = { branch: 'require', default: 'require-default' };");
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/default.cjs", "module.exports = { branch: 'default', default: 'default-value' };");
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/feature-require.cjs", "module.exports = { branch: 'feature-require', default: 'feature-require-default' };");
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/feature-default.cjs", "module.exports = { branch: 'feature-default', default: 'feature-default-value' };");
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/import.mjs", `
    export const branch = "import";
    export default "import-default";
  `);
  kernel.fs.writeFileSync("/workspace/node_modules/dual-pkg/feature-import.mjs", `
    export const branch = "feature-import";
    export default "feature-import-default";
  `);
  kernel.fs.writeFileSync("/workspace/reexport.mjs", `
    export { branch as packageBranch } from "dual-pkg";
    export { branch as featureBranch } from "dual-pkg/feature";
  `);
  kernel.fs.writeFileSync("/workspace/main.mjs", `
    import value, { branch } from "dual-pkg";
    import * as feature from "dual-pkg/feature";
    import { packageBranch, featureBranch } from "./reexport.mjs";

    const dynamicPackage = await import("dual-pkg");
    const dynamicFeature = await import("dual-pkg/feature");

    console.log("static", value, branch);
    console.log("namespace", feature.default, feature.branch);
    console.log("reexport", packageBranch, featureBranch);
    console.log("dynamic", dynamicPackage.default, dynamicPackage.branch, dynamicFeature.default, dynamicFeature.branch);
  `);

  const required = await kernel.run("node", [
    "-e",
    "const pkg = require('dual-pkg'); const feature = require('dual-pkg/feature'); console.log(pkg.default, pkg.branch, feature.default, feature.branch);"
  ], { cwd: "/workspace" });
  assert.equal(required.status, 0, required.stderr.toString());
  assert.equal(required.stdout.toString(), "require-default require feature-require-default feature-require\n");

  const imported = await kernel.run("node", ["main.mjs"], { cwd: "/workspace" });
  assert.equal(imported.status, 0, imported.stderr.toString());
  assert.deepEqual(imported.stdout.toString().trim().split("\n"), [
    "static import-default import",
    "namespace feature-import-default feature-import",
    "reexport import feature-import",
    "dynamic import-default import feature-import-default feature-import"
  ]);
});

test("package exports throw Node-shaped errors for blocked subpaths and invalid targets", async () => {
  const kernel = new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      "sealed-pkg": {
        versions: {
          "1.0.0": {
            exports: {
              ".": "./index.js",
              "./blocked": null,
              "./escape": "../escape.js",
              "./node-modules": "./node_modules/hidden.js"
            },
            files: {
              "package.json": JSON.stringify({
                name: "sealed-pkg",
                version: "1.0.0",
                exports: {
                  ".": "./index.js",
                  "./blocked": null,
                  "./escape": "../escape.js",
                  "./node-modules": "./node_modules/hidden.js"
                }
              }),
              "index.js": "module.exports = 'root';",
              "internal.js": "module.exports = 'internal';",
              "node_modules/hidden.js": "module.exports = 'hidden';"
            }
          }
        }
      }
    })
  });
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "sealed-pkg": "1.0.0" }
  }));
  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());

  const hidden = await kernel.run("node", ["-e", "require('sealed-pkg/internal')"], { cwd: "/workspace" });
  assert.notEqual(hidden.status, 0);
  assert.match(hidden.stderr.toString(), /ERR_PACKAGE_PATH_NOT_EXPORTED/);

  const blocked = await kernel.run("node", ["-e", "require('sealed-pkg/blocked')"], { cwd: "/workspace" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr.toString(), /ERR_PACKAGE_PATH_NOT_EXPORTED/);

  const invalid = await kernel.run("node", ["-e", "require('sealed-pkg/escape')"], { cwd: "/workspace" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr.toString(), /ERR_INVALID_PACKAGE_TARGET/);

  const nodeModulesTarget = await kernel.run("node", ["-e", "require('sealed-pkg/node-modules')"], { cwd: "/workspace" });
  assert.notEqual(nodeModulesTarget.status, 0);
  assert.match(nodeModulesTarget.stderr.toString(), /ERR_INVALID_PACKAGE_TARGET/);
});

test("package exports reject mixed condition and subpath keys", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/node_modules/mixed-exports", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/mixed-exports/package.json", JSON.stringify({
    name: "mixed-exports",
    version: "1.0.0",
    exports: {
      ".": "./index.js",
      default: "./index.js"
    }
  }));
  kernel.fs.writeFileSync("/workspace/node_modules/mixed-exports/index.js", "module.exports = 42;");
  kernel.fs.writeFileSync("/workspace/import-mixed.mjs", "import value from 'mixed-exports'; console.log(value);");

  const required = await kernel.run("node", ["-e", "require('mixed-exports')"], { cwd: "/workspace" });
  assert.notEqual(required.status, 0);
  assert.match(required.stderr.toString(), /ERR_INVALID_PACKAGE_CONFIG/);
  assert.match(required.stderr.toString(), /cannot contain some keys starting with '\.'/);

  const imported = await kernel.run("node", ["import-mixed.mjs"], { cwd: "/workspace" });
  assert.notEqual(imported.status, 0);
  assert.match(imported.stderr.toString(), /ERR_INVALID_PACKAGE_CONFIG/);
  assert.match(imported.stderr.toString(), /cannot contain some keys starting with '\.'/);
});

test("package imports throw Node-shaped errors for missing specifiers and invalid targets", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    type: "module",
    imports: {
      "#ok": "./ok.js",
      "#blocked": null,
      "#escape": "../outside.js",
      "#nodeModules": "./node_modules/hidden.js",
      "#external": "dep"
    }
  }));
  kernel.fs.writeFileSync("/workspace/ok.js", "export default 'ok';");
  kernel.fs.writeFileSync("/outside.js", "export default 'outside';");
  kernel.fs.mkdirSync("/workspace/node_modules/dep", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/dep/package.json", JSON.stringify({ name: "dep", main: "index.js" }));
  kernel.fs.writeFileSync("/workspace/node_modules/dep/index.js", "module.exports = 'dep';");
  kernel.fs.mkdirSync("/workspace/node_modules", { recursive: true });
  kernel.fs.writeFileSync("/workspace/node_modules/hidden.js", "export default 'hidden';");
  kernel.fs.writeFileSync("/workspace/main.js", "import '#missing';");
  kernel.fs.writeFileSync("/workspace/blocked.js", "import '#blocked';");
  kernel.fs.writeFileSync("/workspace/escape.js", "import '#escape';");
  kernel.fs.writeFileSync("/workspace/node-modules.js", "import '#nodeModules';");
  kernel.fs.writeFileSync("/workspace/external.js", "import value from '#external'; console.log(value);");
  kernel.fs.writeFileSync("/workspace/external.cjs", "console.log(require('#external'));");
  kernel.fs.writeFileSync("/workspace/escape.cjs", "require('#escape');");
  kernel.fs.writeFileSync("/workspace/node-modules.cjs", "require('#nodeModules');");

  const missing = await kernel.run("node", ["main.js"], { cwd: "/workspace" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr.toString(), /ERR_PACKAGE_IMPORT_NOT_DEFINED/);

  const blocked = await kernel.run("node", ["blocked.js"], { cwd: "/workspace" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr.toString(), /ERR_PACKAGE_IMPORT_NOT_DEFINED/);

  const esmEscape = await kernel.run("node", ["escape.js"], { cwd: "/workspace" });
  assert.notEqual(esmEscape.status, 0);
  assert.match(esmEscape.stderr.toString(), /ERR_INVALID_PACKAGE_TARGET/);

  const esmNodeModules = await kernel.run("node", ["node-modules.js"], { cwd: "/workspace" });
  assert.notEqual(esmNodeModules.status, 0);
  assert.match(esmNodeModules.stderr.toString(), /ERR_INVALID_PACKAGE_TARGET/);

  const cjsEscape = await kernel.run("node", ["escape.cjs"], { cwd: "/workspace" });
  assert.notEqual(cjsEscape.status, 0);
  assert.match(cjsEscape.stderr.toString(), /ERR_INVALID_PACKAGE_TARGET/);

  const cjsNodeModules = await kernel.run("node", ["node-modules.cjs"], { cwd: "/workspace" });
  assert.notEqual(cjsNodeModules.status, 0);
  assert.match(cjsNodeModules.stderr.toString(), /ERR_INVALID_PACKAGE_TARGET/);

  const esmExternal = await kernel.run("node", ["external.js"], { cwd: "/workspace" });
  assert.equal(esmExternal.status, 0, esmExternal.stderr.toString());
  assert.equal(esmExternal.stdout.toString(), "dep\n");

  const cjsExternal = await kernel.run("node", ["external.cjs"], { cwd: "/workspace" });
  assert.equal(cjsExternal.status, 0, cjsExternal.stderr.toString());
  assert.equal(cjsExternal.stdout.toString(), "dep\n");
});

test("package imports resolve private # specifiers used by ESM packages", async () => {
  const kernel = new Kernel({
    fs: new VirtualFileSystem(),
    registryClient: new MemoryRegistryClient({
      "chalk-shaped": {
        versions: {
          "1.0.0": {
            exports: "./source/index.js",
            imports: {
              "#ansi-styles": "./source/vendor/ansi-styles.js",
              "#supports-color": {
                node: "./source/vendor/supports-color-node.js",
                default: "./source/vendor/supports-color-browser.js"
              },
              "#ordered-color": {
                default: "./source/vendor/supports-color-browser.js",
                node: "./source/vendor/supports-color-node.js"
              }
            },
            files: {
              "package.json": JSON.stringify({
                name: "chalk-shaped",
                version: "1.0.0",
                type: "module",
                exports: "./source/index.js",
                imports: {
                  "#ansi-styles": "./source/vendor/ansi-styles.js",
                  "#supports-color": {
                    node: "./source/vendor/supports-color-node.js",
                    default: "./source/vendor/supports-color-browser.js"
                  },
                  "#ordered-color": {
                    default: "./source/vendor/supports-color-browser.js",
                    node: "./source/vendor/supports-color-node.js"
                  }
                }
              }),
              "source/index.js": `
                import ansiStyles from "#ansi-styles";
                import supportsColor from "#supports-color";
                import orderedColor from "#ordered-color";
                const chalk = { magenta(value) { return ansiStyles.magenta.open + value + ansiStyles.magenta.close + ':' + supportsColor.level + ':' + orderedColor.level; } };
                export default chalk;
              `,
              "source/vendor/ansi-styles.js": "export default { magenta: { open: '<m>', close: '</m>' } };",
              "source/vendor/supports-color-node.js": "export default { level: 3 };",
              "source/vendor/supports-color-browser.js": "export default { level: 1 };"
            }
          }
        }
      }
    })
  });
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    dependencies: { "chalk-shaped": "1.0.0" }
  }));
  const install = await kernel.run("npm", ["install"], { cwd: "/workspace" });
  assert.equal(install.status, 0, install.stderr.toString());
  kernel.fs.writeFileSync("/workspace/main.js", `
    import chalk from "chalk-shaped";
    console.log(chalk.magenta('ok'));
  `);

  const result = await kernel.run("node", ["main.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "<m>ok</m>:3:1\n");
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
