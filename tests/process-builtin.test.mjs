import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("process.versions exposes Node-compatible runtime dependency versions", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      console.log(process.version);
      console.log(process.versions.node);
      console.log(process.versions.v8);
      console.log(process.versions.modules);
      console.log(process.versions.napi);
      console.log(process.versions.opencontainers);
      console.log(require('node:process').versions.v8);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "v26.0.0",
    "26.0.0",
    "14.3.127.18-node.10",
    "144",
    "10",
    "0.1.0",
    "14.3.127.18-node.10"
  ]);
});

test("node:util exposes npm package compatibility helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require('node:util');
      const fn = util.deprecate((value) => value + 1, 'old api');
      function Parent() {}
      function Child() {}
      util.inherits(Child, Parent);
      console.log(fn(1));
      console.log(new Child() instanceof Parent);
      console.log(util.format('value=%d %s', 42, 'ok'));
      console.log(util.types.isRegExp(/x/));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stderr.toString(), /old api/);
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "2",
    "true",
    "value=42 ok",
    "true"
  ]);
});

test("node:util exposes additional type predicates used by packages", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require('node:util');
      function args() { return arguments; }
      console.log(util.types.isWeakMap(new WeakMap()));
      console.log(util.types.isWeakSet(new WeakSet()));
      console.log(util.types.isDataView(new DataView(new ArrayBuffer(1))));
      console.log(util.types.isMapIterator(new Map().keys()));
      console.log(util.types.isSetIterator(new Set().keys()));
      console.log(util.types.isArgumentsObject(args()));
      console.log(util.types.isBoxedPrimitive(new String('x')));
      console.log(typeof util.types.isProxy, util.types.isProxy({}));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "function false"
  ]);
});

test("node:util exposes argument parsing and terminal string helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require("node:util");
      const parsed = util.parseArgs({
        args: ["--color", "--name=Josh", "-vv", "file.txt"],
        options: {
          color: { type: "boolean" },
          name: { type: "string" },
          verbose: { type: "boolean", short: "v", multiple: true }
        },
        allowPositionals: true,
        tokens: true
      });

      console.log(parsed.values.color, parsed.values.name, parsed.values.verbose.length);
      console.log(parsed.positionals.join(","));
      console.log(parsed.tokens.map(token => token.kind).join(","));
      console.log(util.stripVTControlCharacters("\\u001b[31mred\\u001b[0m"));
      console.log(util.toUSVString("bad\\uD800surrogate"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true Josh 2",
    "file.txt",
    "option,option,option,option,positional",
    "red",
    "bad�surrogate"
  ]);
});

test("node:util exposes system error, abort, and deep equality helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import util from "node:util";
    const controller = util.transferableAbortController();
    const aborted = util.aborted(controller.signal).then(() => "aborted");

    controller.abort("done");

    console.log(util.isDeepStrictEqual({ a: [1] }, { a: [1] }));
    console.log(util.getSystemErrorName(-2), util.getSystemErrorMessage(-2));
    console.log(util.getSystemErrorMap().get(-98).join(":"));
    console.log(await aborted, util.transferableAbortSignal(controller.signal) === controller.signal);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "ENOENT no such file or directory",
    "EADDRINUSE:address already in use",
    "aborted true"
  ]);
});

test("node:util exposes MIMEType and MIMEParams helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require("node:util");
      const mime = new util.MIMEType("Text/HTML; Charset=UTF-8; boundary=abc");

      mime.params.set("x-test", "yes");

      console.log(mime.type, mime.subtype, mime.essence);
      console.log(mime.params.get("charset"), mime.params.has("boundary"), mime.params.get("missing"));
      console.log([...mime.params.keys()].join(","));
      console.log(String(mime));
      console.log(new util.MIMEParams({ a: "1", quoted: "two words" }).toString());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "text html text/html",
    "UTF-8 true null",
    "charset,boundary,x-test",
    "text/html;charset=UTF-8;boundary=abc;x-test=yes",
    "a=1;quoted=\"two words\""
  ]);
});

test("node:assert exposes matching and async assertion helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import assert from "node:assert/strict";

    assert.match("hello", /ell/);
    assert.doesNotMatch("hello", /zzz/);
    assert.notDeepStrictEqual({ a: 1 }, { a: 2 });
    assert.deepEqual(new Set([1, 2]), new Set([2, 1]));
    assert.ifError(null);
    assert.throws(() => { throw Object.assign(new Error("nope"), { code: "ERR_TEST" }); }, { code: "ERR_TEST" });
    await assert.rejects(Promise.reject(new TypeError("bad")), TypeError);
    await assert.doesNotReject(Promise.resolve("ok"));

    console.log(assert.strict === assert);
    console.log("assertions ok");
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "assertions ok"
  ]);
});

test("process exposes Node-like runtime metadata helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const start = process.hrtime();
      console.log(typeof process.hrtime, typeof process.hrtime.bigint, Array.isArray(start), typeof process.hrtime.bigint());
      console.log(process.release.name, process.title, process.argv0, Array.isArray(process.execArgv));
      console.log(typeof process.uptime(), process.memoryUsage().heapUsed >= 0, typeof process.memoryUsage.rss(), process.cpuUsage().user >= 0);
      console.log(process.allowedNodeEnvironmentFlags instanceof Set, typeof process.config, typeof process.features);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function function true bigint",
    "node node node true",
    "number true number true",
    "true object object"
  ]);
});

test("process exposes builtin module lookup, report, and resource usage helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = process.getBuiltinModule("node:fs");
      const missing = process.getBuiltinModule("not-a-core-module");
      const report = process.report.getReport(new Error("boom"));
      const usage = process.resourceUsage();

      console.log(typeof fs.readFileSync, missing);
      console.log(report.header.processId === process.pid, report.javascriptStack.message);
      console.log(typeof usage.userCPUTime, typeof usage.maxRSS);
      console.log(process.report.writeReport("report.json"));
      console.log(require("node:fs").statSync("report.json").isFile());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function undefined",
    "true boom",
    "number number",
    "report.json",
    "true"
  ]);
});

test("node:module exposes stable builtin metadata and URL createRequire", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import Module, { builtinModules, createRequire, isBuiltin } from "node:module";

    const require = createRequire(import.meta.url);
    console.log(Module === Module.Module);
    console.log(builtinModules.includes("stream/promises"));
    console.log(isBuiltin("fs"), isBuiltin("node:fs"), isBuiltin("not-a-core-module"));
    console.log(require("node:path").join("a", "b"));
    console.log(Module.builtinModules === builtinModules);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true true false",
    "a/b",
    "true"
  ]);
});

test("node:module exposes CommonJS compatibility resolution hooks", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/lib", { recursive: true });
  kernel.fs.writeFileSync("/workspace/lib/value.js", "module.exports = 42;");
  kernel.fs.writeFileSync("/workspace/index.js", `
    import Module, { createRequire } from "node:module";

    const require = createRequire(import.meta.url);
    const resolved = require.resolve("./lib/value");
    console.log(resolved);
    console.log(require("./lib/value"));
    console.log(Array.isArray(require.resolve.paths("pkg")));
    console.log(require.resolve.paths("node:fs"));
    console.log(typeof require.extensions[".js"], typeof Module._extensions[".json"]);
    console.log(Module._resolveFilename("./lib/value", { filename: "/workspace/index.js" }));
    console.log(Module._load("./lib/value", { filename: "/workspace/index.js" }));
    console.log(Module._nodeModulePaths("/workspace/src").join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "/workspace/lib/value.js",
    "42",
    "true",
    "null",
    "function function",
    "/workspace/lib/value.js",
    "42",
    "/workspace/src/node_modules|/workspace/node_modules|/node_modules"
  ]);
});

test("additional common Node core module aliases resolve for package compatibility", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const consoleModule = require("node:console");
      const pathPosix = require("node:path/posix");
      const pathWin32 = require("node:path/win32");
      const types = require("node:util/types");

      const writes = [];
      const customConsole = new consoleModule.Console({ write: (chunk) => writes.push(chunk) });
      customConsole.log("hello", { ok: true });

      console.log(typeof consoleModule.Console);
      console.log(writes.join("").trim());
      console.log(pathPosix.join("a", "b"), pathWin32.sep);
      console.log(types.isDate(new Date()), types.isTypedArray(new Uint8Array()));
      console.log(require("node:module").builtinModules.includes("stream/web"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "hello {\"ok\":true}",
    "a/b \\",
    "true true",
    "true"
  ]);
});

test("stream/web and stream/consumers expose Web Stream helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { ReadableStream } from "node:stream/web";
    import consumers from "node:stream/consumers";

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":true}'));
        controller.close();
      }
    });

    console.log(typeof ReadableStream);
    console.log(await consumers.text(stream));
    console.log((await consumers.buffer("abc")).toString("utf8"));
    console.log((await consumers.json('{"answer":42}')).answer);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "{\"ok\":true}",
    "abc",
    "42"
  ]);
});

test("perf_hooks, punycode, and domain cover common package probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { performance, PerformanceObserver, monitorEventLoopDelay } = require("node:perf_hooks");
      const punycode = require("node:punycode");
      const domain = require("node:domain");

      console.log(typeof performance.now(), typeof performance.eventLoopUtilization().utilization);
      console.log(typeof PerformanceObserver, typeof monitorEventLoopDelay().enable);
      console.log(punycode.toASCII("mañana.com"));
      console.log(punycode.toUnicode("xn--maana-pta.com"));

      const d = domain.create();
      d.on("error", (error) => console.log("domain:", error.message));
      d.run(() => { throw new Error("handled"); });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "number number",
    "function function",
    "xn--maana-pta.com",
    "mañana.com",
    "domain: handled"
  ]);
});

test("cluster and dgram resolve with explicit unsupported operation errors", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const cluster = require("node:cluster");
      const dgram = require("node:dgram");
      console.log(cluster.isPrimary, cluster.isWorker);
      try {
        cluster.fork();
      } catch (error) {
        console.log(error.code);
      }
      try {
        dgram.createSocket("udp4");
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true false",
    "ERR_OPENCONTAINERS_CLUSTER_UNSUPPORTED",
    "ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED"
  ]);
});

test("node:os and node:url expose package compatibility helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import os from "node:os";
    import url from "node:url";

    const parsed = url.parse("https://user:pass@example.com:8080/a/b?x=1&x=2#hash", true);
    const options = url.urlToHttpOptions(new URL("https://example.com:8443/path?q=1"));

    console.log(os.homedir(), os.tmpdir(), os.endianness());
    console.log(os.availableParallelism(), os.totalmem() > 0, os.freemem() > 0);
    console.log(JSON.stringify(os.networkInterfaces()));
    console.log(parsed.protocol, parsed.auth, parsed.hostname, parsed.port, parsed.query.x.join(","));
    console.log(url.resolve("https://example.com/a/b", "../c?d=1"));
    console.log(options.hostname, options.port, options.path);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "/home/opencontainers /tmp LE",
    "1 true true",
    "{}",
    "https: user:pass example.com 8080 1,2",
    "https://example.com/c?d=1",
    "example.com 8443 /path?q=1"
  ]);
});

test("node:path format and util.promisify support package helper patterns", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import path from "node:path";
    import util from "node:util";
    const legacy = (value, callback) => callback(null, value, value + 1);
    const custom = () => {};
    custom[util.promisify.custom] = () => Promise.resolve("custom result");

    const [multi, customValue] = await Promise.all([
      util.promisify(legacy)(41),
      util.promisify(custom)()
    ]);

    console.log(path.format({ dir: "/workspace/src", name: "index", ext: ".js" }));
    console.log(JSON.stringify(multi));
    console.log(customValue);
    console.log(typeof util.TextEncoder, util.types.isArrayBufferView(new Uint8Array()));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "/workspace/src/index.js",
    "[41,42]",
    "custom result",
    "function true"
  ]);
});

test("node:path exposes matchesGlob for basic package probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const path = require("node:path");
      console.log(path.matchesGlob("src/index.test.js", "src/*.test.js"));
      console.log(path.posix.matchesGlob("src/lib/index.js", "src/**/*.js"));
      console.log(path.win32.matchesGlob("src/index.css", "*.js"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "false"
  ]);
});

test("optional native-oriented core modules resolve with explicit unsupported operations", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const inspector = require("node:inspector");
      const repl = require("node:repl");
      const traceEvents = require("node:trace_events");
      const wasi = require("node:wasi");

      console.log(typeof inspector.Session, inspector.url());
      console.log(typeof repl.REPLServer, repl.recoverable(new SyntaxError("Unexpected end of input")));

      const tracing = traceEvents.createTracing({ categories: ["node"] });
      tracing.enable();
      console.log(tracing.enabled, traceEvents.getEnabledCategories() === "");

      for (const run of [
        () => inspector.open(),
        () => repl.start(),
        () => new wasi.WASI()
      ]) {
        try {
          run();
        } catch (error) {
          console.log(error.code);
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function undefined",
    "function true",
    "true true",
    "ERR_OPENCONTAINERS_INSPECTOR_UNSUPPORTED",
    "ERR_OPENCONTAINERS_REPL_UNSUPPORTED",
    "ERR_OPENCONTAINERS_WASI_UNSUPPORTED"
  ]);
});

test("runtime Buffer global can be shadowed by CommonJS modules", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/buffer-shadow.js", `
    const { Buffer } = require('node:buffer');
    module.exports = Buffer.from('ok').toString();
  `);

  const result = await kernel.run("node", ["-e", "console.log(require('./buffer-shadow'))"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ok\n");
});

test("runtime Buffer supports base64 string encoding", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const buffer = Buffer.from('Hello REPL');
      console.log(buffer.toString());
      console.log(buffer.toString('base64'));
      console.log(require('node:buffer').Buffer.from('Hello REPL').toString('base64'));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "Hello REPL",
    "SGVsbG8gUkVQTA==",
    "SGVsbG8gUkVQTA=="
  ]);
});

test("node:buffer exposes package compatibility exports", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const buffer = require('node:buffer');
      const encoded = buffer.btoa('Hello REPL');
      console.log(buffer.atob(encoded));
      console.log(buffer.constants.MAX_LENGTH > 0, buffer.constants.MAX_STRING_LENGTH > 0);
      console.log(buffer.INSPECT_MAX_BYTES > 0, buffer.kMaxLength > 0, buffer.kStringMaxLength > 0);
      console.log(typeof buffer.Blob, typeof buffer.File, typeof buffer.SlowBuffer);
      console.log(buffer.isAscii(Buffer.from('abc')), buffer.isUtf8(Buffer.from('abc')));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "Hello REPL",
    "true true",
    "true true true",
    "function function function",
    "true true"
  ]);
});

test("OpenContainersBuffer supports Node-style numeric and search helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { OpenContainersBuffer } = require("node:buffer");
      const buffer = new OpenContainersBuffer(24);

      buffer.writeUIntBE(0x123456, 0, 3);
      buffer.writeUIntLE(0x123456, 3, 3);
      buffer.writeIntBE(-2, 6, 2);
      buffer.writeIntLE(-3, 8, 2);
      buffer.writeFloatLE(1.5, 10);
      buffer.writeDoubleBE(3.25, 14);

      console.log(buffer.readUIntBE(0, 3).toString(16));
      console.log(buffer.readUIntLE(3, 3).toString(16));
      console.log(buffer.readIntBE(6, 2), buffer.readIntLE(8, 2));
      console.log(buffer.readFloatLE(10).toFixed(1), buffer.readDoubleBE(14).toFixed(2));

      const hello = OpenContainersBuffer.from("hello");
      console.log(hello.includes("ell"), hello.indexOf("ll"), hello.lastIndexOf("l"));
      console.log(JSON.stringify(OpenContainersBuffer.from("hi")));

      const wide = OpenContainersBuffer.alloc(8);
      wide.writeBigUInt64BE(0x0102030405060708n);
      console.log(wide.toString("hex"), wide.readBigUInt64BE().toString(16));
      wide.writeBigInt64LE(-2n);
      console.log(wide.readBigInt64LE().toString(), wide.toString("hex"));
      wide.writeBigUint64LE(0x0102030405060708n);
      console.log(wide.readBigUint64LE().toString(16), wide.toString("hex"));
      console.log(OpenContainersBuffer.from("00112233", "hex").swap16().toString("hex"));
      console.log(OpenContainersBuffer.from("0011223344556677", "hex").swap32().toString("hex"));
      console.log(OpenContainersBuffer.alloc(6).fill("ab").toString());
      console.log(OpenContainersBuffer.from([1, 2, 3, 4]).fill(OpenContainersBuffer.from([9, 8]), 1, 4).toString("hex"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "123456",
    "123456",
    "-2 -3",
    "1.5 3.25",
    "true 2 3",
    "{\"type\":\"Buffer\",\"data\":[104,105]}",
    "0102030405060708 102030405060708",
    "-2 feffffffffffffff",
    "102030405060708 0807060504030201",
    "11003322",
    "3322110077665544",
    "ababab",
    "01090809"
  ]);
});

test("node:fs exposes Dirent, temporary directories, opendir, truncate, and FileHandle helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import fs from "node:fs";
    import fsp from "node:fs/promises";

    fs.mkdirSync("src/nested", { recursive: true });
    fs.writeFileSync("src/a.txt", "abcdef");

    const entries = fs.readdirSync("src", { withFileTypes: true });
    console.log(entries[0] instanceof fs.Dirent, entries[0].name, entries[0].isFile());
    console.log(entries[1] instanceof fs.Dirent, entries[1].name, entries[1].isDirectory());

    const dir = fs.opendirSync("src");
    const dirEntries = [];
    for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
      dirEntries.push(entry.name);
    }
    dir.closeSync();
    console.log(dirEntries.join(","));

    const temp = fs.mkdtempSync("tmp-");
    console.log(temp.startsWith("tmp-"), fs.statSync(temp).isDirectory());

    const handle = await fsp.open("src/a.txt", "r+");
    await handle.truncate(3);
    console.log(await handle.readFile("utf8"));
    await handle.writeFile("xyz");
    console.log(await fsp.readFile("src/a.txt", "utf8"));
    await handle.close();

    await fsp.truncate("src/a.txt", 1);
    console.log(fs.readFileSync("src/a.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true a.txt true",
    "true nested true",
    "a.txt,nested",
    "true true",
    "abc",
    "xyz",
    "x"
  ]);
});

test("node:fs and node:constants expose common file flag constants", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require("node:fs");
      const constants = require("node:constants");
      console.log(fs.F_OK, fs.constants.COPYFILE_EXCL, fs.constants.O_CREAT > 0);
      console.log(constants.F_OK, constants.COPYFILE_EXCL, constants.O_CREAT > 0);
      console.log(fs.constants.S_IFREG > 0, fs.constants.S_IRUSR > 0);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "0 1 true",
    "0 1 true",
    "true true"
  ]);
});

test("node:fs exposes statfs sync, callback, and promise helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    const sync = fs.statfsSync(".");
    console.log(sync instanceof fs.StatFs, sync.bsize > 0, sync.path);

    const [callbackError, callbackStats] = await new Promise((resolve) => {
      fs.statfs(".", (error, stats) => resolve([error, stats]));
    });
    console.log(callbackError === null, callbackStats.blocks > 0);

    const bigint = await fsp.statfs(".", { bigint: true });
    console.log(typeof bigint.bsize, typeof bigint.blocks, bigint.path);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true /workspace",
    "true true",
    "bigint bigint /workspace"
  ]);
});

test("node:crypto randomBytes supports callback form and keeps process alive", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require('node:crypto');
      crypto.randomBytes(15, (error, bytes) => {
        console.log(error === null);
        console.log(bytes.length);
        console.log(bytes.toString('base64').length > 0);
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "15",
    "true"
  ]);
});

test("node:crypto exposes randomInt, getCiphers, hash copy, and secret keys", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const hash = crypto.createHash("sha256").update("abc");
      const copy = hash.copy().update("def").digest("hex");
      const key = crypto.createSecretKey(Buffer.alloc(32, 7));
      const iv = Buffer.alloc(16, 8);
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      const encrypted = cipher.update("x", "utf8", "hex") + cipher.final("hex");

      console.log(crypto.getCiphers().includes("aes-256-cbc"));
      console.log(crypto.randomInt(1, 3) >= 1);
      crypto.randomInt(2, (error, value) => console.log(error === null, value >= 0, value < 2));
      console.log(copy);
      console.log(key.type, key.symmetricKeySize, key.export().length);
      console.log(typeof encrypted);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.deepEqual(lines.slice(0, 2), ["true", "true"]);
  assert.equal(lines[2], "bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721");
  assert.equal(lines[3], "secret 32 32");
  assert.equal(lines[4], "string");
  assert.equal(lines[5], "true true true");
});

test("node:crypto secret keys are detected by util.types.isKeyObject", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const util = require("node:util");
      const key = crypto.createSecretKey(Buffer.alloc(32));
      console.log(util.types.isKeyObject(key));
      console.log(util.types.isKeyObject({}));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\nfalse\n");
});

test("node:crypto supports sha256 and AES-CBC cipher round trips", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require('node:crypto');
      const hash = crypto.createHash('sha256').update('hello repl').digest('hex');
      console.log(hash);

      const key = Buffer.alloc(32, 1);
      const iv = Buffer.alloc(16, 2);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update('secret message', 'utf8', 'hex');
      encrypted += cipher.final('hex');
      console.log(encrypted);

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      console.log(decrypted);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "ba4d55a8197c018035c8b1bc6e6866c396f16a91fbce926ad26236c298468aa0",
    "c38c13861fcfd31d87816dd429025bfe",
    "secret message"
  ]);
});

test("node:crypto supports HMAC, randomFill, and timingSafeEqual", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const hmac = crypto.createHmac("sha256", "secret").update("hello").digest("hex");
      const buffer = Buffer.alloc(8);
      crypto.randomFillSync(buffer, 2, 4);
      crypto.randomFill(Buffer.alloc(4), (error, filled) => {
        console.log(hmac);
        console.log(buffer.slice(2, 6).some(byte => byte !== 0));
        console.log(error === null, filled.length);
        console.log(crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("same")));
        console.log(typeof crypto.webcrypto === "object" || typeof crypto.webcrypto === "undefined");
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b",
    "true",
    "true 4",
    "true",
    "true"
  ]);
});

test("node:vm supports basic context scripts", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const sandbox = {
      console,
      result: null,
    };

    vm.createContext(sandbox);

    const script = new vm.Script(\`
      const x = 21;
      result = x * 2;
      console.log("inside vm:", result);
    \`);

    script.runInContext(sandbox);

    console.log("outside vm result:", sandbox.result);
    console.log("is context:", vm.isContext(sandbox));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "inside vm: 42",
    "outside vm result: 42",
    "is context: true"
  ]);
});

test("node:vm supports runInNewContext and named imports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Script, runInNewContext, runInThisContext } from "node:vm";

    const sandbox = { value: 7 };
    console.log(runInNewContext("value * 6", sandbox));
    console.log(new Script("value += 1; value").runInNewContext(sandbox));
    console.log(sandbox.value);
    console.log(typeof runInThisContext("Buffer"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "42",
    "8",
    "8",
    "function"
  ]);
});

test("node:vm supports compileFunction with parsing contexts", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const sandbox = { multiplier: 6 };
    vm.createContext(sandbox);
    const fn = vm.compileFunction("return value * multiplier;", ["value"], {
      parsingContext: sandbox,
    });

    console.log(fn(7));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "42\n");
});

test("node:zlib/promises supports compression round trips", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib/promises";

    const input = "hello repl ".repeat(1000);

    const gzip = await zlib.gzip(input);
    const gunzip = await zlib.gunzip(gzip);

    console.log("gzip size ok:", gzip.length > 0);
    console.log("gunzip matches:", gunzip.toString() === input);

    const deflated = await zlib.deflate(input);
    const inflated = await zlib.inflate(deflated);

    console.log("deflate size ok:", deflated.length > 0);
    console.log("inflate matches:", inflated.toString() === input);

    const brotli = await zlib.brotliCompress(input);
    const unbrotli = await zlib.brotliDecompress(brotli);

    console.log("brotli size ok:", brotli.length > 0);
    console.log("brotli matches:", unbrotli.toString() === input);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "gzip size ok: true",
    "gunzip matches: true",
    "deflate size ok: true",
    "inflate matches: true",
    "brotli size ok: true",
    "brotli matches: true"
  ]);
});

test("node:zlib callback APIs keep the process alive", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";

    const input = "callback zlib ".repeat(200);
    zlib.gzip(input, (error, gzip) => {
      if (error) throw error;
      zlib.gunzip(gzip, (error, gunzip) => {
        if (error) throw error;
        console.log(gunzip.toString() === input);
      });
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\n");
});

test("node:async_hooks AsyncLocalStorage preserves context across awaits and microtasks", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { AsyncLocalStorage } from "node:async_hooks";

    const als = new AsyncLocalStorage();

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    await als.run({ requestId: "abc-123" }, async () => {
      console.log("initial:", JSON.stringify(als.getStore()));

      await sleep(1);
      console.log("after timeout:", JSON.stringify(als.getStore()));

      await Promise.resolve();
      console.log("after promise:", JSON.stringify(als.getStore()));

      queueMicrotask(() => {
        console.log("inside microtask:", JSON.stringify(als.getStore()));
      });

      await sleep(1);
    });

    console.log("outside:", als.getStore());
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'initial: {"requestId":"abc-123"}',
    'after timeout: {"requestId":"abc-123"}',
    'after promise: {"requestId":"abc-123"}',
    'inside microtask: {"requestId":"abc-123"}',
    "outside: undefined"
  ]);
});

test("node:async_hooks AsyncLocalStorage captures context for later timers and nextTick", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { AsyncLocalStorage } from "node:async_hooks";

    const als = new AsyncLocalStorage();

    await new Promise((resolve) => {
      als.run({ requestId: "timer" }, () => {
        setTimeout(() => {
          console.log("timer:", JSON.stringify(als.getStore()));
          resolve();
        }, 1);

        process.nextTick(() => {
          console.log("nextTick:", JSON.stringify(als.getStore()));
        });
      });

      console.log("outside sync:", als.getStore());
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "outside sync: undefined",
    'nextTick: {"requestId":"timer"}',
    'timer: {"requestId":"timer"}'
  ]);
});

test("node:querystring parses and formats query strings", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const querystring = require('node:querystring');
      console.log(JSON.stringify(querystring.parse('a=1&a=2&b=hello+world')));
      console.log(querystring.stringify({ a: ['1', '2'], b: 'hello world' }));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    JSON.stringify({ a: ["1", "2"], b: "hello world" }),
    "a=1&a=2&b=hello%20world"
  ]);
});

test("node:stream default export is an inheritable Stream constructor", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const Stream = require('node:stream');
      const util = require('node:util');
      function Child() {}
      util.inherits(Child, Stream);
      console.log(typeof Stream);
      console.log(typeof Stream.Readable);
      console.log(new Child() instanceof Stream);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "function",
    "true"
  ]);
});

test("node:stream exposes callable Transform for legacy npm inheritance", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const stream = require('node:stream');
      const util = require('node:util');
      function Upper() {
        stream.Transform.call(this);
      }
      util.inherits(Upper, stream.Transform);
      Upper.prototype._transform = function(chunk, encoding, callback) {
        this.push(String(chunk).toUpperCase());
        callback();
      };
      const upper = new Upper();
      upper.on('data', chunk => console.log(String(chunk)));
      upper.write('ok');
      upper.end();
      console.log(upper instanceof stream.Transform);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "OK",
    "true"
  ]);
});

test("node:stream pipeline pipes readable output into writable destinations", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const stream = require('node:stream');
      const input = new stream.Readable();
      const output = new stream.Writable({
        write(chunk) {
          console.log(String(chunk));
        }
      });
      stream.pipeline(input, output, (error) => {
        if (error) console.error(error.message);
        else console.log('done');
      });
      input.push('file');
      input.push(null);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "file\ndone\n");
});

test("node:stream exposes PassThrough, Readable.from, async iteration, and callback finished", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";

    const pass = new stream.PassThrough();
    pass.on("data", chunk => console.log("pass:" + chunk.toString()));
    pass.write("ok");
    pass.end();

    const chunks = [];
    for await (const chunk of stream.Readable.from(["a", "b"])) {
      chunks.push(String(chunk));
    }
    console.log("from:" + chunks.join(""));

    const readable = stream.Readable.from(["done"]);
    stream.finished(readable, (error) => {
      console.log("finished:" + (error ? error.message : "ok"));
    });
    readable.resume();

    console.log(stream.isReadable(readable), stream.isWritable(pass), typeof stream.Readable.toWeb);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "pass:ok",
    "from:ab",
    "true true function",
    "finished:ok"
  ]);
});

test("node:stream/promises supports pipeline and finished", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";
    import { pipeline, finished } from "node:stream/promises";
    const input = new stream.Readable();
    let output = "";
    const writable = new stream.Writable({
      write(chunk) {
        output += String(chunk);
      }
    });

    const done = Promise.all([
      pipeline(input, writable),
      finished(writable)
    ]);

    input.push("pro");
    input.push("mise");
    input.push(null);

    await done;
    console.log(output);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "promise\n");
});

test("node:timers and node:timers/promises expose timer helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/timers.mjs", `
    import timers from 'node:timers';
    import timerPromises from 'node:timers/promises';
    await new Promise(resolve => timers.setImmediate(resolve));
    console.log('immediate');
    console.log(await timerPromises.setTimeout(0, 'promise'));
  `);
  const result = await kernel.run("node", ["timers.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "immediate\npromise\n");
});

test("top-level timers keep the virtual process alive until cleared", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      let count = 0;
      const timer = setInterval(() => {
        count++;
        console.log(count);
        if (count >= 3) {
          clearInterval(timer);
          console.log('Done!');
        }
      }, 1);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "1\n2\n3\nDone!\n");
});

test("timeout handles expose refresh for Engine.IO heartbeat timers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      let count = 0;
      const timer = setTimeout(() => {
        count++;
        console.log('tick:' + count);
        if (count < 2) timer.refresh();
      }, 1);
      console.log(typeof timer.refresh);
      console.log(timer.refresh() === timer);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "true",
    "tick:1",
    "tick:2"
  ]);
});

test("unref timers do not keep the virtual process alive", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      setTimeout(() => console.log('late'), 10).unref();
      console.log('done');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "done\n");
});

test("node:worker_threads supports eval workers and parentPort messages", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Worker, isMainThread, threadId } from "node:worker_threads";

    console.log(isMainThread, threadId);
    const worker = new Worker(\`
      const { parentPort, workerData, isMainThread, threadId } = require("worker_threads");
      parentPort.postMessage(workerData.label + ":" + isMainThread + ":" + threadId);
    \`, {
      eval: true,
      workerData: { label: "Worker OK" }
    });
    worker.on("message", console.log);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true 0",
    "Worker OK:false:1"
  ]);
});

test("node:worker_threads resolves file URL worker entries", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      Worker,
      isMainThread,
      parentPort,
      workerData,
    } from "node:worker_threads";

    if (isMainThread) {
      console.log("main thread");

      const worker = new Worker(new URL(import.meta.url), {
        workerData: {
          input: 21,
        },
      });

      worker.on("message", (message) => {
        console.log("worker message:", JSON.stringify(message));
      });

      worker.on("error", (error) => {
        console.error("worker error:", error);
      });

      const exitCode = await new Promise((resolve) => {
        worker.on("exit", resolve);
      });

      console.log("worker exit:", exitCode);
    } else {
      parentPort.postMessage({
        input: workerData.input,
        doubled: workerData.input * 2,
        pid: process.pid,
      });
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.equal(lines[0], "main thread");
  assert.match(lines[1], /^worker message: \{"input":21,"doubled":42,"pid":\d+\}$/);
  assert.equal(lines[2], "worker exit: 0");
});

test("node:worker_threads keeps worker timers alive until cleared", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const { Worker } = require("node:worker_threads");
    const worker = new Worker(\`
      const { parentPort } = require("node:worker_threads");
      let count = 0;
      const timer = setInterval(() => {
        count++;
        parentPort.postMessage(count);
        if (count === 2) clearInterval(timer);
      }, 1);
    \`, { eval: true });
    worker.on("message", console.log);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "1\n2\n");
});

test("global MessageChannel keeps the virtual process alive until messages deliver", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = event => console.log(event.data);
      port2.postMessage("MessageChannel works!");
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "MessageChannel works!\n");
});

test("node:worker_threads MessageChannel emits Node-style message events", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { MessageChannel } = require("node:worker_threads");
      const { port1, port2 } = new MessageChannel();
      port1.on("message", console.log);
      port2.postMessage("worker_threads MessageChannel works!");
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "worker_threads MessageChannel works!\n");
});

test("timer callback errors are contained in the virtual process", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    "setTimeout(() => { throw new Error('timer boom'); }, 1);"
  ], { cwd: "/workspace" });

  assert.equal(result.status, 1);
  assert.match(result.stderr.toString(), /timer boom/);
});

test("node:events exposes once promise helper", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { EventEmitter, once } from "node:events";

    const emitter = new EventEmitter();
    setTimeout(() => {
      emitter.emit("ready", {
        ok: true,
        at: 123,
      });
    }, 1);

    const [payload] = await once(emitter, "ready");
    console.log("once payload:", payload);

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort("timeout hit");
    }, 1);

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10);

        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(controller.signal.reason);
        });
      });
    } catch (error) {
      console.log("aborted with:", error);
    }

    async function* numbers() {
      for (let i = 1; i <= 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        yield i;
      }
    }

    for await (const n of numbers()) {
      console.log("async iter:", n);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "once payload: {\"ok\":true,\"at\":123}",
    "aborted with: timeout hit",
    "async iter: 1",
    "async iter: 2",
    "async iter: 3"
  ]);
});

test("node:events exposes on async iterator helper", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { EventEmitter, on } from "node:events";

    const emitter = new EventEmitter();
    setTimeout(() => emitter.emit("item", "first"), 1);
    setTimeout(() => emitter.emit("item", "second"), 2);

    for await (const [value] of on(emitter, "item")) {
      console.log(value);
      if (value === "second") break;
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "first",
    "second"
  ]);
});

test("EventEmitter methods can be mixed into plain objects", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require('node:events');
      function app() {}
      for (const name of Object.getOwnPropertyNames(EventEmitter.prototype)) {
        if (name !== 'constructor') app[name] = EventEmitter.prototype[name];
      }
      app.on('ready', value => console.log(value));
      app.emit('ready', 'ok');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ok\n");
});

test("node:events default export is the EventEmitter constructor", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const EventEmitter = require('node:events');
      const { EventEmitter: NamedEventEmitter } = require('node:events');
      class Custom extends EventEmitter {}
      console.log(EventEmitter === NamedEventEmitter);
      console.log(new Custom() instanceof EventEmitter);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\ntrue\n");
});

test("node:events exposes enumerable listener methods for package proxies", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require('node:events');
      console.log(Object.keys(EventEmitter.prototype).includes('on'));
      const emitter = new EventEmitter();
      emitter.prependListener('event', () => console.log('first'));
      emitter.on('event', () => console.log('second'));
      console.log(emitter.eventNames()[0]);
      emitter.emit('event');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "event",
    "first",
    "second"
  ]);
});

test("node:events exposes static package compatibility helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const events = require("node:events");
      const emitter = new events.EventEmitter();
      emitter.on("ready", () => {});
      console.log(events.listenerCount(emitter, "ready"));
      console.log(events.getEventListeners(emitter, "ready").length);
      events.setMaxListeners(23, emitter);
      console.log(events.getMaxListeners(emitter), events.defaultMaxListeners);
      const controller = new AbortController();
      events.addAbortListener(controller.signal, () => console.log("aborted"));
      controller.abort();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "1",
    "1",
    "23 23",
    "aborted"
  ]);
});

test("node:tls can be required by packages and rejects client sockets clearly", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const tls = require('node:tls');
      console.log(typeof tls.TLSSocket);
      try {
        tls.connect({});
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "function\nERR_OPENCONTAINERS_TLS_UNSUPPORTED\n");
});
