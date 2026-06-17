import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { KernelWorkerHost } from "../packages/kernel/src/kernel-worker-host.js";

test("PTY sessions echo input, stream command output, and close on Ctrl+D", async () => {
  const kernel = new Kernel();
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo" });
  let output = "";
  let closed = false;
  session.on("data", (chunk) => { output += String(chunk); });
  session.on("close", () => { closed = true; });

  session.write("echo hello\n");
  const result = await session.waitForIdle();
  assert.equal(result.status, 0);
  assert.match(output, /echo hello/);
  assert.match(output, /hello\n/);

  session.write("\x04");
  assert.equal(closed, true);
});

test("PTY Ctrl+C kills the foreground shell process tree and releases virtual ports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer((req, res) => res.end('still running')).listen(3000);
  `);
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo" });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.write("node server.js\n");
  await eventually(async () => {
    const response = await kernel.dispatchHttpRequest({
      projectId: "demo",
      port: 3000,
      method: "GET",
      url: "/",
      headers: []
    });
    return response.status === 200;
  });

  session.write("\x03");
  await eventually(async () => {
    const response = await kernel.dispatchHttpRequest({
      projectId: "demo",
      port: 3000,
      method: "GET",
      url: "/",
      headers: []
    });
    return response.status === 502;
  });

  assert.match(output, /\^C/);
});

test("KernelWorkerHost exposes PTY open/input/close messages", async () => {
  const messages = [];
  const host = new KernelWorkerHost({ postMessage: (message) => messages.push(message) });
  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.handleMessage({ id: "pty", type: "openPty", payload: { cwd: "/workspace" } });
  const sessionId = messages.at(-1).payload.sessionId;
  assert.ok(sessionId);

  await host.handleMessage({ id: "input", type: "ptyInput", payload: { sessionId, data: "echo host\n" } });
  await eventually(() => messages.some((message) => message.type === "pty" && /host/.test(message.chunk ?? "")));

  await host.handleMessage({ id: "close", type: "closePty", payload: { sessionId } });
  const closeReply = messages.find((message) => message.type === "reply" && message.requestId === "close");
  assert.equal(closeReply.payload.ok, true);
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
