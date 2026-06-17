import { EventEmitter } from "../../runtime-node/src/builtins/events.js";

export class PtySession extends EventEmitter {
  constructor({ id, kernel, cwd = "/workspace", env = {}, projectId = "default", cols = 80, rows = 24 }) {
    super();
    this.id = id;
    this.kernel = kernel;
    this.cwd = cwd;
    this.env = {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      COLUMNS: String(cols),
      LINES: String(rows),
      ...env
    };
    this.projectId = projectId;
    this.inputBuffer = "";
    this.foregroundPid = null;
    this.closed = false;
    this.lastCommand = Promise.resolve({ status: 0 });
  }

  write(data) {
    if (this.closed) return;
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    for (const char of text) {
      if (char === "\x03") {
        this.interrupt();
        continue;
      }
      if (char === "\x04") {
        this.close();
        continue;
      }
      if (char === "\r" || char === "\n") {
        const commandLine = this.inputBuffer.trim();
        this.inputBuffer = "";
        this.emitData("\r\n");
        if (commandLine) this.runLine(commandLine);
        continue;
      }
      this.inputBuffer += char;
      this.emitData(char);
    }
  }

  runLine(commandLine) {
    const process = this.kernel.spawn("sh", ["-c", commandLine], {
      cwd: this.cwd,
      env: this.env,
      projectId: this.projectId
    });
    this.foregroundPid = process.pid;
    process.stdout.on("data", (chunk) => this.emitData(chunk));
    process.stderr.on("data", (chunk) => this.emitData(chunk));
    this.lastCommand = process.completed.then((result) => {
      if (this.foregroundPid === process.pid) this.foregroundPid = null;
      if (result.signal) this.emitData(`\r\n[${result.signal}]\r\n`);
      return result;
    });
    return process;
  }

  interrupt() {
    this.emitData("^C\r\n");
    if (this.foregroundPid !== null) {
      this.kernel.killTree(this.foregroundPid, "SIGINT");
      this.foregroundPid = null;
    }
  }

  resize({ cols, rows }) {
    if (cols) this.env.COLUMNS = String(cols);
    if (rows) this.env.LINES = String(rows);
    this.emit("resize", { cols: Number(this.env.COLUMNS), rows: Number(this.env.LINES) });
  }

  close() {
    if (this.closed) return;
    if (this.foregroundPid !== null) this.kernel.killTree(this.foregroundPid, "SIGHUP");
    this.closed = true;
    this.emit("close");
  }

  async waitForIdle() {
    return this.lastCommand;
  }

  emitData(chunk) {
    this.emit("data", chunk);
  }
}

export class PtyManager {
  constructor({ kernel }) {
    this.kernel = kernel;
    this.nextId = 1;
    this.sessions = new Map();
  }

  createSession(options = {}) {
    const session = new PtySession({
      id: `pty-${this.nextId++}`,
      kernel: this.kernel,
      ...options
    });
    this.sessions.set(session.id, session);
    session.on("close", () => this.sessions.delete(session.id));
    return session;
  }

  write(sessionId, data) {
    const session = this.requireSession(sessionId);
    session.write(data);
  }

  resize(sessionId, size) {
    this.requireSession(sessionId).resize(size);
  }

  close(sessionId) {
    this.requireSession(sessionId).close();
  }

  requireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown PTY session: ${sessionId}`);
    return session;
  }
}
