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
    "v26.0.0-opencontainers",
    "26.0.0-opencontainers",
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
