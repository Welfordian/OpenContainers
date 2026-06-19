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

test("PTY sessions keep cwd changes between commands", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/src", { recursive: true });
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo" });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.write("cd src\n");
  const cdResult = await session.waitForIdle();
  assert.equal(cdResult.status, 0);
  assert.equal(session.cwd, "/workspace/src");

  session.write("pwd\n");
  const pwdResult = await session.waitForIdle();
  assert.equal(pwdResult.status, 0);
  assert.match(output, /\/workspace\/src/);
});

test("PTY cd expands home shorthand", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/lol", { recursive: true });
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("cd lol\n");
  let result = await session.waitForIdle();
  assert.equal(result.status, 0);
  assert.equal(session.cwd, "/workspace/lol");

  session.write("cd ~\n");
  result = await session.waitForIdle();
  assert.equal(result.status, 0);
  assert.equal(session.cwd, "/workspace");
  assert.doesNotMatch(output, /cd: /);
});

test("PTY sessions route shared builtins entered at the prompt", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/a.txt", "alpha\n");
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("ls\n");
  const lsResult = await session.waitForIdle();
  assert.equal(lsResult.status, 0);
  assert.match(output, /a\.txt/);

  session.write("clear\n");
  const clearResult = await session.waitForIdle();
  assert.equal(clearResult.status, 0);
  assert.match(output, /\x1b\[2J\x1b\[H/);
});

test("PTY prompt handles history and cursor editing escape sequences", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.ts", "console.log('i');");
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("node index.ts\n");
  let result = await session.waitForIdle();
  assert.equal(result.status, 0, output);

  session.write("\x1b[A\r");
  result = await session.waitForIdle();
  assert.equal(result.status, 0, output);
  assert.equal(output.match(/^i$/gm)?.length, 2);
  assert.doesNotMatch(output, /Unsupported command/);

  output = "";
  session.write("node index.s\x1b[Dt\n");
  result = await session.waitForIdle();
  assert.equal(result.status, 0, output);
  assert.match(output, /^i$/m);
  assert.doesNotMatch(output, /\x1b\[D.*Unsupported command/s);
});

test("PTY prompt completes commands and paths with Tab", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", "console.log('js');");
  kernel.fs.writeFileSync("/workspace/index.ts", "console.log('ts');");
  kernel.fs.mkdirSync("/workspace/src", { recursive: true });
  kernel.fs.writeFileSync("/workspace/src/name.js", "export const name = 'Josh';");
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();

  session.write("cle\t");
  assert.equal(session.inputBuffer, "clear ");

  session.setInputLine("nano in");
  session.write("\t");
  assert.equal(session.inputBuffer, "nano index.");

  output = "";
  session.write("\t");
  assert.match(output, /index\.js/);
  assert.match(output, /index\.ts/);
  assert.equal(session.inputBuffer, "nano index.");

  session.setInputLine("cat sr");
  session.write("\t");
  assert.equal(session.inputBuffer, "cat src/");

  session.write("na\t");
  assert.equal(session.inputBuffer, "cat src/name.js ");
});

test("PTY sessions forward input to foreground Node processes", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/name.js", `
    import readline from "node:readline/promises";
    import { stdin as input, stdout as output } from "node:process";

    const rl = readline.createInterface({ input, output });
    const name = await rl.question("name? ");
    console.log("answer:" + name);
    rl.close();
  `);

  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo" });
  let output = "";
  let answered = false;
  session.on("data", (chunk) => {
    output += String(chunk);
    if (!answered && output.includes("name? ")) {
      answered = true;
      session.write("Josh\n");
    }
  });

  session.write("node name.js\n");
  const result = await session.waitForIdle();

  assert.equal(result.status, 0);
  assert.match(output, /name\? Josh\r?\nanswer:Josh/);
});

test("PTY vi writes files from terminal keystrokes", async () => {
  const kernel = new Kernel();
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("vi file.txt\n");
  await eventually(() => output.includes("\x1b[?1049h"));
  session.write("ihello\x1b:wq\r");
  const result = await session.waitForIdle();

  assert.equal(result.status, 0);
  assert.equal(kernel.fs.readFileSync("/workspace/file.txt", "utf8"), "hello");
});

test("PTY vi q! discards unsaved edits", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/file.txt", "original");
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("vi file.txt\n");
  await eventually(() => output.includes("\x1b[?1049h"));
  session.write("iedited\x1b:q!\r");
  const result = await session.waitForIdle();

  assert.equal(result.status, 0);
  assert.equal(kernel.fs.readFileSync("/workspace/file.txt", "utf8"), "original");
});

test("PTY nano writes files from terminal keystrokes", async () => {
  const kernel = new Kernel();
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("nano note.txt\n");
  await eventually(() => output.includes("\x1b[?1049h"));
  session.write("hello nano\x0f\r\x18");
  const result = await session.waitForIdle();

  assert.equal(result.status, 0);
  assert.equal(kernel.fs.readFileSync("/workspace/note.txt", "utf8"), "hello nano");
  const lastLeave = output.lastIndexOf("\x1b[?1049l");
  assert.notEqual(lastLeave, -1);
  assert.equal(output.slice(lastLeave).includes("\x1b[?1049h"), false);
});

test("PTY nano redraws against resized terminal dimensions", async () => {
  const kernel = new Kernel();
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true, cols: 40, rows: 10 });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("nano note.txt\n");
  await eventually(() => output.includes("\x1b[?1049h"));

  session.resize({ cols: 50, rows: 16 });
  await eventually(() => output.includes("\x1b[15;1H"));

  session.write("ch");
  await eventually(() => {
    const lastClear = output.lastIndexOf("\x1b[2J\x1b[H");
    const redraw = output.slice(lastClear);
    return redraw.includes("\x1b[2;1Hch")
      && redraw.includes("\x1b[15;1H")
      && redraw.includes("\x1b[2;3H");
  });

  session.write("\x03");
  const result = await session.waitForIdle();
  assert.equal(result.status, 130);
});

test("PTY less renders content and quits on q", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/readme.txt", "line one\nline two\n");
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  session.write("less readme.txt\n");
  await eventually(() => output.includes("\x1b[?1049h") && output.includes("line one"));
  session.write("q");
  const result = await session.waitForIdle();

  assert.equal(result.status, 0);
  assert.match(output, /line one/);
});

test("interactive PTY sessions render prompts and redraw edited input", async () => {
  const kernel = new Kernel();
  const session = kernel.pty.createSession({ cwd: "/workspace", projectId: "demo", interactive: true });
  let output = "";
  session.on("data", (chunk) => { output += String(chunk); });

  session.start();
  assert.match(output, /~\x1b\[0m \x1b\[32m\$/);

  session.write("echo prompx");
  session.write("\x7f");
  session.write("t\n");
  const result = await session.waitForIdle();

  assert.equal(result.status, 0);
  assert.match(output, /echo prompt/);
  assert.match(output, /prompt\n/);
  assert.equal(session.inputBuffer, "");

  session.setInputLine("pwd");
  assert.match(output, /\x1b\[2K\r/);
  assert.match(output, /pwd$/);
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
