import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("node:net supports virtual localhost server/client sockets", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const net = require('net');
    const server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => socket.write('echo:' + chunk));
    });
    server.listen(4321, '127.0.0.1');
  `);

  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.net.hasPid(server.pid));

  const result = await kernel.run("node", [
    "-e",
    `
      const net = require('node:net');
      const socket = net.connect(4321, 'localhost', () => socket.write('hello'));
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => {
        console.log(chunk);
        socket.end();
      });
    `
  ], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "echo:hello\n");
  server.kill("SIGTERM");
});

test("node:net reports clear V1 error for external raw TCP", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const net = require('net');
      try {
        net.connect(5432, 'db.example.com');
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_RAW_TCP_UNSUPPORTED\n");
});

test("net server close lets a listener-only process exit", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const net = require('net');
      const server = net.createServer();
      server.listen(0, () => {
        console.log(server.address().port > 0);
        server.close();
      });
    `
  ], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\n");
});

test("node:dns/promises and node:net support loopback TCP round trips", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns/promises";
    import net from "node:net";

    const lookup = await dns.lookup("localhost");
    console.log("lookup localhost:", lookup.address, lookup.family);

    const server = net.createServer((socket) => {
      socket.write("hello client\\n");
      socket.on("data", (data) => {
        socket.write("echo:" + data);
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const { port } = server.address();
    console.log("tcp server:", port > 0);

    const client = net.createConnection({ port, host: "127.0.0.1" });
    client.setEncoding("utf8");

    client.on("data", (data) => {
      console.log("client received:", JSON.stringify(data));
      if (data.includes("hello client")) {
        client.write("ping\\n");
      }
      if (data.includes("echo:ping")) {
        client.end();
        server.close();
      }
    });

    await new Promise((resolve) => server.on("close", resolve));
    console.log("tcp test complete");
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "lookup localhost: 127.0.0.1 4",
    "tcp server: true",
    "client received: \"hello client\\n\"",
    "client received: \"echo:ping\\n\"",
    "tcp test complete"
  ]);
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
