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
      console.log(process.versions.welford);
      console.log(require('node:process').versions.v8);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "v26.0.0-welford",
    "26.0.0-welford",
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
