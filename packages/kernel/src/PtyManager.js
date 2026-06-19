import { EventEmitter } from "../../runtime-node/src/builtins/events.js";
import { resolvePath, resolveShellPath } from "../../fs/src/path-utils.js";
import { parsePipeline, splitCommands, tokenize } from "../../shell/src/parser.js";

function parsePtySimpleCommand(commandLine) {
  const commands = splitCommands(commandLine);
  if (commands.length !== 1 || commands[0].operator !== null) return null;

  const pipeline = parsePipeline(commands[0].command);
  if (pipeline.segments.length !== 1) return null;

  const segment = pipeline.segments[0];
  if (segment.redirects.length) return null;

  const tokens = [...segment.tokens];
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index++;
  const command = tokens[index];
  if (!command) return null;

  return {
    command,
    args: tokens.slice(index + 1)
  };
}

export class PtySession extends EventEmitter {
  constructor({ id, kernel, cwd = "/workspace", env = {}, projectId = "default", cols = 80, rows = 24, interactive = false }) {
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
    this.inputCursor = 0;
    this.history = [];
    this.historyIndex = null;
    this.foregroundPid = null;
    this.foregroundProcess = null;
    this.foregroundRawMode = false;
    this.closed = false;
    this.interactive = Boolean(interactive);
    this.started = false;
    this.lastCommand = Promise.resolve({ status: 0 });
  }

  start() {
    if (this.closed || this.started) return;
    this.started = true;
    if (this.interactive) this.emitPrompt();
  }

  write(data) {
    if (this.closed) return;
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    if (this.foregroundPid !== null && this.foregroundRawMode) {
      this.foregroundProcess?.stdin?.write?.(text);
      return;
    }
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "\x03") {
        this.interrupt();
        continue;
      }
      if (char === "\x04") {
        this.close();
        continue;
      }
      if (char === "\x0c") {
        this.emitData("\x1bc");
        if (this.interactive) this.redrawInputLine();
        continue;
      }
      if (this.foregroundPid !== null) {
        this.forwardForegroundInput(char);
        continue;
      }
      if (char === "\x1b") {
        const sequence = readControlSequence(text, index);
        if (sequence) {
          this.handlePromptControlSequence(sequence.value);
          index += sequence.value.length - 1;
          continue;
        }
      }
      if (char === "\b" || char === "\x7f") {
        this.backspace();
        continue;
      }
      if (char === "\t") {
        this.completeInput();
        continue;
      }
      if (char === "\r" || char === "\n") {
        const commandLine = this.inputBuffer.trim();
        this.inputBuffer = "";
        this.inputCursor = 0;
        this.historyIndex = null;
        this.emitData("\r\n");
        if (commandLine) {
          this.pushHistory(commandLine);
          this.runLine(commandLine);
        }
        else if (this.interactive) this.emitPrompt();
        continue;
      }
      this.insertInput(char);
    }
  }

  runLine(commandLine) {
    this.emit("commandstart", { commandLine, cwd: this.cwd });
    const localProcess = this.runLocalCommand(commandLine);
    if (localProcess) return localProcess;

    const simpleCommand = this.parseSimpleCommand(commandLine);
    const builtin = simpleCommand ? this.kernel.commandBuiltins.get(simpleCommand.command) : null;
    const process = simpleCommand
      ? this.kernel.spawn(simpleCommand.command, simpleCommand.args, {
        cwd: this.cwd,
        env: this.env,
        projectId: this.projectId,
        terminal: this
      })
      : this.kernel.spawn("sh", ["-c", commandLine], {
      cwd: this.cwd,
      env: this.env,
      projectId: this.projectId,
      terminal: this
    });
    this.foregroundPid = process.pid;
    this.foregroundProcess = process;
    this.foregroundRawMode = Boolean(builtin?.rawTerminal);
    process.stdout.on("data", (chunk) => this.emitData(chunk));
    process.stderr.on("data", (chunk) => this.emitData(chunk));
    this.lastCommand = process.completed.then((result) => {
      if (this.foregroundPid === process.pid) this.foregroundPid = null;
      if (this.foregroundProcess === process) this.foregroundProcess = null;
      this.foregroundRawMode = false;
      if (process.descriptor.cwd && process.descriptor.cwd !== this.cwd) this.cwd = process.descriptor.cwd;
      if (result.signal) this.emitData(`\r\n[${result.signal}]\r\n`);
      if (this.interactive && !this.closed) this.emitPrompt();
      this.emit("commandend", { commandLine, cwd: this.cwd, result });
      return result;
    });
    return process;
  }

  parseSimpleCommand(commandLine) {
    try {
      return parsePtySimpleCommand(commandLine);
    } catch (_) {
      return null;
    }
  }

  runLocalCommand(commandLine) {
    let simpleCommand;
    try {
      simpleCommand = parsePtySimpleCommand(commandLine);
    } catch (_) {
      return null;
    }

    if (!simpleCommand) return null;
    if (simpleCommand.command === "cd") return this.changeDirectory(simpleCommand.args);
    if (simpleCommand.command === "exit") {
      this.close();
      return this.resolveLocalCommand(0);
    }
    return null;
  }

  changeDirectory(args) {
    if (args.length > 1) {
      this.emitData("cd: too many arguments\r\n");
      return this.resolveLocalCommand(1);
    }

    const target = resolveShellPath(this.cwd, args[0] ?? "/workspace");
    try {
      const stat = this.kernel.fs.statSync(target);
      if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
      this.cwd = target;
      return this.resolveLocalCommand(0);
    } catch (error) {
      this.emitData(`cd: ${error instanceof Error ? error.message : String(error)}\r\n`);
      return this.resolveLocalCommand(1);
    }
  }

  resolveLocalCommand(status) {
    const result = { status, cwd: this.cwd };
    this.lastCommand = Promise.resolve(result).then((resolved) => {
      if (this.interactive && !this.closed) this.emitPrompt();
      this.emit("commandend", { cwd: this.cwd, result: resolved });
      return resolved;
    });
    return { pid: null, completed: this.lastCommand };
  }

  interrupt() {
    this.inputBuffer = "";
    this.inputCursor = 0;
    this.historyIndex = null;
    this.emitData("^C\r\n");
    if (this.foregroundPid !== null) {
      this.kernel.killTree(this.foregroundPid, "SIGINT");
      this.foregroundPid = null;
      this.foregroundProcess = null;
      this.foregroundRawMode = false;
      return;
    }
    if (this.interactive && !this.closed) this.emitPrompt();
  }

  resize({ cols, rows }) {
    if (cols) this.env.COLUMNS = String(cols);
    if (rows) this.env.LINES = String(rows);
    if (this.foregroundProcess?.descriptor?.env) {
      if (cols) this.foregroundProcess.descriptor.env.COLUMNS = String(cols);
      if (rows) this.foregroundProcess.descriptor.env.LINES = String(rows);
    }
    this.emit("resize", { cols: Number(this.env.COLUMNS), rows: Number(this.env.LINES) });
  }

  close() {
    if (this.closed) return;
    if (this.foregroundPid !== null) this.kernel.killTree(this.foregroundPid, "SIGHUP");
    this.foregroundProcess = null;
    this.foregroundRawMode = false;
    this.closed = true;
    this.emit("close");
  }

  async waitForIdle() {
    return this.lastCommand;
  }

  emitData(chunk) {
    this.emit("data", chunk);
  }

  forwardForegroundInput(char) {
    if (!this.foregroundProcess) return;
    if (char === "\r" || char === "\n") {
      this.emitData("\r\n");
      this.foregroundProcess.stdin?.write?.("\n");
      return;
    }
    if (char === "\b" || char === "\x7f") {
      this.emitData("\b \b");
      this.foregroundProcess.stdin?.write?.("\x7f");
      return;
    }
    this.emitData(char);
    this.foregroundProcess.stdin?.write?.(char);
  }

  setInputLine(value = "") {
    if (this.closed || this.foregroundPid !== null) return;
    this.inputBuffer = String(value);
    this.inputCursor = this.inputBuffer.length;
    this.emitData("\x1b[2K\r");
    this.redrawInputLine();
  }

  redrawInputLine() {
    if (this.closed) return;
    this.emitData("\x1b[2K\r");
    if (this.interactive) this.emitPrompt();
    if (this.inputBuffer) this.emitData(this.inputBuffer);
    const trailing = this.inputBuffer.length - this.inputCursor;
    if (trailing > 0) this.emitData(`\x1b[${trailing}D`);
  }

  insertInput(char) {
    if (char < " ") return;
    const chars = Array.from(this.inputBuffer);
    const insert = Array.from(char);
    chars.splice(this.inputCursor, 0, ...insert);
    this.inputBuffer = chars.join("");
    this.inputCursor += insert.length;
    this.redrawInputLine();
  }

  backspace() {
    if (!this.inputBuffer || this.inputCursor <= 0) return;
    const chars = Array.from(this.inputBuffer);
    chars.splice(this.inputCursor - 1, 1);
    this.inputBuffer = chars.join("");
    this.inputCursor--;
    this.redrawInputLine();
  }

  completeInput() {
    if (this.closed || this.foregroundPid !== null) return;
    const context = currentCompletionContext(this.inputBuffer, this.inputCursor);
    const result = context.isCommandPosition && !context.token.includes("/")
      ? this.completeCommand(context.token)
      : this.completePath(context.token);
    if (!result?.matches?.length) {
      this.emitData("\x07");
      return;
    }

    if (result.replacement !== undefined) {
      this.replaceInputRange(context.start, context.end, result.replacement);
      return;
    }

    this.emitCompletionList(result.matches);
  }

  completeCommand(prefix) {
    const matches = this.commandCompletionNames()
      .filter((name) => name.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    return completionResult(prefix, matches, (name) => `${name} `);
  }

  commandCompletionNames() {
    const names = new Set(["node", "npm", "npx", "sh"]);
    for (const name of this.kernel.commandBuiltins.keys()) names.add(name);

    const pathEntries = [
      ...String(this.env.PATH || "").split(":").filter(Boolean),
      `${this.cwd}/node_modules/.bin`,
      "/workspace/node_modules/.bin"
    ];
    for (const entry of pathEntries) {
      const directory = resolvePath(this.cwd, entry);
      let children = [];
      try {
        children = this.kernel.fs.readdirSync(directory);
      } catch {
        continue;
      }
      for (const name of children) names.add(name);
    }
    return [...names];
  }

  completePath(token) {
    const slashIndex = token.lastIndexOf("/");
    const directoryToken = slashIndex === -1 ? "." : token.slice(0, slashIndex) || "/";
    const namePrefix = slashIndex === -1 ? token : token.slice(slashIndex + 1);
    const displayPrefix = slashIndex === -1 ? "" : token.slice(0, slashIndex + 1);
    const directoryPath = resolveShellPath(this.cwd, directoryToken);

    let children = [];
    try {
      children = this.kernel.fs.readdirSync(directoryPath)
        .filter((name) => name.startsWith(namePrefix))
        .filter((name) => namePrefix.startsWith(".") || !name.startsWith("."));
    } catch {
      return { matches: [] };
    }

    const matches = children
      .map((name) => {
        const childPath = `${directoryPath === "/" ? "" : directoryPath}/${name}`;
        let isDirectory = false;
        try {
          isDirectory = this.kernel.fs.statSync(childPath).isDirectory();
        } catch {
          isDirectory = false;
        }
        return {
          name,
          display: `${displayPrefix}${name}${isDirectory ? "/" : ""}`,
          replacement: `${displayPrefix}${name}${isDirectory ? "/" : " "}`
        };
      })
      .sort((a, b) => a.display.localeCompare(b.display));

    return completionResult(namePrefix, matches, (match) => match.replacement, (match) => match.display);
  }

  replaceInputRange(start, end, replacement) {
    const chars = Array.from(this.inputBuffer);
    const insert = Array.from(replacement);
    chars.splice(start, end - start, ...insert);
    this.inputBuffer = chars.join("");
    this.inputCursor = start + insert.length;
    this.redrawInputLine();
  }

  emitCompletionList(matches) {
    this.emitData("\r\n");
    this.emitData(`${matches.join("  ")}\r\n`);
    this.redrawInputLine();
  }

  deleteForward() {
    const chars = Array.from(this.inputBuffer);
    if (this.inputCursor >= chars.length) return;
    chars.splice(this.inputCursor, 1);
    this.inputBuffer = chars.join("");
    this.redrawInputLine();
  }

  moveInputCursor(delta) {
    const next = Math.max(0, Math.min(Array.from(this.inputBuffer).length, this.inputCursor + delta));
    if (next === this.inputCursor) return;
    this.inputCursor = next;
    this.emitData(delta < 0 ? "\x1b[D" : "\x1b[C");
  }

  handlePromptControlSequence(sequence) {
    if (sequence === "\x1b[A") {
      this.showHistory(-1);
      return;
    }
    if (sequence === "\x1b[B") {
      this.showHistory(1);
      return;
    }
    if (sequence === "\x1b[D") {
      this.moveInputCursor(-1);
      return;
    }
    if (sequence === "\x1b[C") {
      this.moveInputCursor(1);
      return;
    }
    if (sequence === "\x1b[H" || sequence === "\x1b[1~") {
      this.inputCursor = 0;
      this.redrawInputLine();
      return;
    }
    if (sequence === "\x1b[F" || sequence === "\x1b[4~") {
      this.inputCursor = Array.from(this.inputBuffer).length;
      this.redrawInputLine();
      return;
    }
    if (sequence === "\x1b[3~") {
      this.deleteForward();
    }
  }

  pushHistory(commandLine) {
    if (this.history.at(-1) !== commandLine) this.history.push(commandLine);
    if (this.history.length > 200) this.history.shift();
  }

  showHistory(direction) {
    if (!this.history.length) return;
    if (this.historyIndex === null) {
      this.historyIndex = direction < 0 ? this.history.length - 1 : null;
    } else {
      this.historyIndex += direction;
      if (this.historyIndex < 0) this.historyIndex = 0;
      if (this.historyIndex >= this.history.length) this.historyIndex = null;
    }
    this.setInputLine(this.historyIndex === null ? "" : this.history[this.historyIndex]);
  }

  emitPrompt() {
    this.emitData(`\x1b[36m${formatPtyCwd(this.cwd)}\x1b[0m \x1b[32m$\x1b[0m `);
  }
}

function readControlSequence(text, start) {
  if (text[start] !== "\x1b") return null;
  if (text[start + 1] !== "[") return { value: "\x1b" };
  let index = start + 2;
  while (index < text.length && /[0-9;?]/.test(text[index])) index++;
  if (index < text.length && /[A-Za-z~]/.test(text[index])) {
    return { value: text.slice(start, index + 1) };
  }
  return { value: "\x1b" };
}

function currentCompletionContext(inputBuffer, inputCursor) {
  const inputChars = Array.from(inputBuffer);
  const before = inputChars.slice(0, inputCursor).join("");
  const tokenStart = currentTokenStart(before);
  const token = before.slice(tokenStart);
  const segmentPrefix = currentCommandSegmentPrefix(before.slice(0, tokenStart));
  const priorTokens = safeTokenize(segmentPrefix);
  const isCommandPosition = priorTokens.every((part) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(part));
  return {
    token,
    start: Array.from(before.slice(0, tokenStart)).length,
    end: inputCursor,
    isCommandPosition
  };
}

function currentTokenStart(value) {
  let quote = null;
  let escaped = false;
  let start = 0;
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) start = index + 1;
  }
  return Array.from(chars.slice(0, start).join("")).length;
}

function currentCommandSegmentPrefix(value) {
  let quote = null;
  let escaped = false;
  let start = 0;
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ";" || char === "|") start = index + 1;
    if (char === "&" && chars[index + 1] === "&") {
      start = index + 2;
      index++;
    }
  }
  return chars.slice(start).join("").trim();
}

function safeTokenize(value) {
  try {
    return tokenize(value);
  } catch {
    return [];
  }
}

function completionResult(prefix, matches, replacementFor, displayFor = (value) => value) {
  if (!matches.length) return { matches: [] };
  if (matches.length === 1) {
    return {
      matches: [displayFor(matches[0])],
      replacement: replacementFor(matches[0])
    };
  }

  const names = matches.map((match) => typeof match === "string" ? match : match.name);
  const shared = commonPrefix(names);
  if (shared.length > prefix.length) {
    const first = matches[0];
    const replacementPrefix = typeof first === "string"
      ? ""
      : String(first.replacement).slice(0, String(first.replacement).lastIndexOf(first.name));
    return {
      matches: matches.map(displayFor),
      replacement: `${replacementPrefix}${shared}`
    };
  }

  return {
    matches: matches.map(displayFor)
  };
}

function commonPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
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

function formatPtyCwd(cwd) {
  const value = String(cwd || "/workspace").replace(/\/+$/, "") || "/";
  if (value === "/workspace") return "~";
  if (value.startsWith("/workspace/")) return `~/${value.slice("/workspace/".length)}`;
  return value;
}
