import { basename, dirname, isInsidePath, normalizePath, resolvePath, resolveShellPath } from "../../fs/src/path-utils.js";

const textDecoder = new TextDecoder();

export const COMMAND_REGISTRY = new Map();

function defineCommand(names, definition) {
  for (const name of Array.isArray(names) ? names : [names]) {
    COMMAND_REGISTRY.set(name, { name, ...definition });
  }
}

export function registerDefaultCommandBuiltins(kernel) {
  for (const [name, definition] of COMMAND_REGISTRY) {
    kernel.commandBuiltins.set(name, definition);
  }
}

export async function runCommandBuiltin(commandOrDefinition, args, context) {
  const definition = resolveDefinition(commandOrDefinition, context);
  const result = await definition.run(args, commandContext(context));
  return normalizeCommandResult(result, context.cwd);
}

export function runCommandBuiltinSync(commandOrDefinition, args, context) {
  const definition = resolveDefinition(commandOrDefinition, context);
  if (definition.sync === false || definition.interactive) {
    throw Object.assign(new Error(`Command ${definition.name} cannot run synchronously`), {
      code: "ERR_OPENCONTAINERS_SYNC_COMMAND_UNSUPPORTED"
    });
  }
  const run = definition.runSync ?? definition.run;
  const result = run(args, commandContext(context));
  if (result && typeof result.then === "function") {
    throw Object.assign(new Error(`Command ${definition.name} cannot run synchronously`), {
      code: "ERR_OPENCONTAINERS_SYNC_COMMAND_UNSUPPORTED"
    });
  }
  return normalizeCommandResult(result, context.cwd);
}

export function commandContext(context) {
  return {
    ...context,
    fs: context.fs ?? context.kernel?.fs,
    cwd: context.cwd ?? context.descriptor?.cwd ?? "/workspace",
    env: context.env ?? context.descriptor?.env ?? {},
    stdout: context.stdout ?? context.descriptor?.stdout,
    stderr: context.stderr ?? context.descriptor?.stderr,
    stdin: context.stdin ?? context.descriptor?.stdin?.toString?.() ?? "",
    projectId: context.projectId ?? context.descriptor?.projectId ?? "default",
    parentPid: context.parentPid ?? context.descriptor?.pid,
    descriptor: context.descriptor
  };
}

function resolveDefinition(commandOrDefinition, context) {
  if (typeof commandOrDefinition === "string") {
    const definition = context.kernel?.commandBuiltins.get(commandOrDefinition) ?? COMMAND_REGISTRY.get(commandOrDefinition);
    if (!definition) throw Object.assign(new Error(`Unsupported command: ${commandOrDefinition}`), { code: "ENOENT" });
    return definition;
  }
  return commandOrDefinition;
}

function normalizeCommandResult(result, fallbackCwd) {
  if (typeof result === "number") return { status: result, cwd: fallbackCwd };
  if (!result) return { status: 0, cwd: fallbackCwd };
  return {
    status: result.status ?? 0,
    cwd: result.cwd ?? fallbackCwd
  };
}

function ok(cwd) {
  return { status: 0, cwd };
}

function fail(ctx, command, message, status = 1) {
  ctx.stderr?.write(`${command}: ${message}\n`);
  return { status, cwd: ctx.cwd };
}

function resolve(ctx, path = ".") {
  return resolveShellPath(ctx.cwd, path);
}

function parseFlags(args, supported, { stopAtFirstNonFlag = true } = {}) {
  const flags = new Set();
  const values = [];
  let stop = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!stop && arg === "--") {
      stop = true;
      continue;
    }
    if (!stop && arg.startsWith("-") && arg !== "-") {
      for (const flag of arg.slice(1)) {
        if (!supported.has(flag)) return { error: `unsupported option -- ${flag}` };
        flags.add(flag);
      }
      continue;
    }
    values.push(arg);
    if (stopAtFirstNonFlag) stop = true;
  }

  return { flags, values };
}

function statMode(stats) {
  if (stats.isDirectory()) return "d";
  if (stats.isSymbolicLink()) return "l";
  return "-";
}

function formatPermissions(mode) {
  const bits = [
    0o400, 0o200, 0o100,
    0o040, 0o020, 0o010,
    0o004, 0o002, 0o001
  ];
  const chars = ["r", "w", "x", "r", "w", "x", "r", "w", "x"];
  return bits.map((bit, index) => mode & bit ? chars[index] : "-").join("");
}

function readTextFile(ctx, path) {
  return ctx.fs.readFileSync(path, "utf8");
}

function writeTextFile(ctx, path, value) {
  ctx.fs.writeFileSync(path, value);
}

function isBinaryText(value) {
  return String(value).includes("\x00");
}

function readInputOrFiles(ctx, args) {
  if (!args.length) return [{ path: null, text: String(ctx.stdin ?? "") }];
  return args.map((arg) => {
    const path = resolve(ctx, arg);
    return { path, displayPath: arg, text: readTextFile(ctx, path) };
  });
}

function copyRecursive(ctx, source, destination) {
  const stat = ctx.fs.statSync(source);
  if (stat.isDirectory()) {
    ctx.fs.mkdirSync(destination, { recursive: true });
    for (const child of ctx.fs.readdirSync(source)) {
      copyRecursive(ctx, `${source}/${child}`, `${destination}/${child}`);
    }
    return;
  }
  ctx.fs.copyFileSync(source, destination);
}

function walk(ctx, root, callback) {
  callback(root);
  let stats;
  try {
    stats = ctx.fs.statSync(root);
  } catch {
    return;
  }
  if (!stats.isDirectory()) return;
  for (const name of ctx.fs.readdirSync(root)) {
    walk(ctx, `${root}/${name}`, callback);
  }
}

function commandExists(ctx, command) {
  if (["node", "npm", "npx", "sh"].includes(command)) return `/bin/${command}`;
  if (ctx.kernel?.commandBuiltins.has(command)) return command;
  for (const entry of String(ctx.env?.PATH ?? "").split(":")) {
    if (!entry) continue;
    const candidate = resolvePath(ctx.cwd, `${entry}/${command}`);
    if (ctx.fs.existsSync(candidate)) return candidate;
  }
  const local = resolvePath(ctx.cwd, `node_modules/.bin/${command}`);
  if (ctx.fs.existsSync(local)) return local;
  const workspace = `/workspace/node_modules/.bin/${command}`;
  if (ctx.fs.existsSync(workspace)) return workspace;
  return null;
}

defineCommand("clear", {
  run: (_args, ctx) => {
    ctx.stdout?.write("\x1b[2J\x1b[H");
    return ok(ctx.cwd);
  }
});

defineCommand("pwd", {
  run: (_args, ctx) => {
    ctx.stdout?.write(`${ctx.cwd}\n`);
    return ok(ctx.cwd);
  }
});

defineCommand("cd", {
  run: (args, ctx) => {
    if (args.length > 1) return fail(ctx, "cd", "too many arguments");
    const target = resolve(ctx, args[0] ?? "/workspace");
    const stats = ctx.fs.statSync(target);
    if (!stats.isDirectory()) return fail(ctx, "cd", `${target} is not a directory`);
    return { status: 0, cwd: target };
  }
});

defineCommand("ls", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["a", "l", "R"]));
    if (parsed.error) return fail(ctx, "ls", parsed.error, 2);
    const targets = parsed.values.length ? parsed.values : ["."];
    const output = [];
    const listOne = (displayTarget, target, heading) => {
      const stats = ctx.fs.statSync(target);
      if (!stats.isDirectory()) {
        output.push(parsed.flags.has("l") ? formatLongListing(ctx, target, basename(target), stats) : displayTarget);
        return;
      }
      if (heading) output.push(`${displayTarget}:`);
      const names = ctx.fs.readdirSync(target)
        .filter((name) => parsed.flags.has("a") || !name.startsWith("."));
      for (const name of names) {
        const childPath = `${target === "/" ? "" : target}/${name}`;
        const childStats = ctx.fs.lstatSync(childPath);
        output.push(parsed.flags.has("l") ? formatLongListing(ctx, childPath, name, childStats) : name);
      }
      if (!parsed.flags.has("R")) return;
      for (const name of names) {
        const childPath = `${target === "/" ? "" : target}/${name}`;
        if (ctx.fs.statSync(childPath).isDirectory()) {
          output.push("");
          listOne(`${displayTarget.replace(/\/$/, "")}/${name}`, childPath, true);
        }
      }
    };

    try {
      for (let index = 0; index < targets.length; index++) {
        if (index > 0) output.push("");
        listOne(targets[index], resolve(ctx, targets[index]), targets.length > 1 || parsed.flags.has("R"));
      }
      if (output.length) ctx.stdout?.write(`${output.join("\n")}\n`);
      return ok(ctx.cwd);
    } catch (error) {
      return fail(ctx, "ls", error.message ?? String(error));
    }
  }
});

function formatLongListing(ctx, path, name, stats) {
  const type = statMode(stats);
  const perms = formatPermissions(stats.mode);
  const size = String(stats.size).padStart(6, " ");
  const date = stats.mtime.toISOString().slice(0, 16).replace("T", " ");
  let display = name;
  if (stats.isSymbolicLink()) {
    try {
      display += ` -> ${ctx.fs.readlinkSync(path)}`;
    } catch {}
  }
  return `${type}${perms} 1 user user ${size} ${date} ${display}`;
}

defineCommand("cat", {
  run: (args, ctx) => {
    try {
      for (const entry of readInputOrFiles(ctx, args)) ctx.stdout?.write(entry.text);
      return ok(ctx.cwd);
    } catch (error) {
      return fail(ctx, "cat", error.message ?? String(error));
    }
  }
});

defineCommand("echo", {
  run: (args, ctx) => {
    ctx.stdout?.write(`${args.join(" ")}\n`);
    return ok(ctx.cwd);
  }
});

defineCommand("printf", {
  run: (args, ctx) => {
    if (!args.length) return ok(ctx.cwd);
    let index = 1;
    const formatted = String(args[0]).replace(/%(%|s|d|j)/g, (_match, token) => {
      if (token === "%") return "%";
      const value = args[index++] ?? "";
      if (token === "d") return String(Number(value) || 0);
      if (token === "j") return JSON.stringify(value);
      return String(value);
    }).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    ctx.stdout?.write(formatted);
    return ok(ctx.cwd);
  }
});

defineCommand("env", {
  run: (args, ctx) => {
    if (args.length) return fail(ctx, "env", "running commands through env is not supported yet", 2);
    for (const [key, value] of Object.entries(ctx.env ?? {}).sort()) ctx.stdout?.write(`${key}=${value}\n`);
    return ok(ctx.cwd);
  }
});

defineCommand("which", {
  run: (args, ctx) => {
    let status = 0;
    for (const command of args) {
      const found = commandExists(ctx, command);
      if (found) ctx.stdout?.write(`${found}\n`);
      else status = 1;
    }
    return { status, cwd: ctx.cwd };
  }
});

defineCommand("command", {
  run: (args, ctx) => {
    if (args[0] !== "-v" || args.length < 2) return fail(ctx, "command", "only command -v is supported", 2);
    return COMMAND_REGISTRY.get("which").run(args.slice(1), ctx);
  }
});

defineCommand("true", {
  run: (_args, ctx) => ok(ctx.cwd)
});

defineCommand("false", {
  run: (_args, ctx) => ({ status: 1, cwd: ctx.cwd })
});

defineCommand("exit", {
  run: (args, ctx) => ({ status: shellExitStatus(args[0]), cwd: ctx.cwd })
});

defineCommand("touch", {
  run: (args, ctx) => {
    if (!args.length) return fail(ctx, "touch", "missing file operand", 1);
    for (const arg of args) {
      const path = resolve(ctx, arg);
      if (ctx.fs.existsSync(path)) {
        const data = ctx.fs.readFileSync(path);
        ctx.fs.writeFileSync(path, data);
      } else {
        ctx.fs.writeFileSync(path, "");
      }
    }
    return ok(ctx.cwd);
  }
});

defineCommand("mkdir", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["p"]));
    if (parsed.error) return fail(ctx, "mkdir", parsed.error, 2);
    if (!parsed.values.length) return fail(ctx, "mkdir", "missing operand");
    for (const arg of parsed.values) ctx.fs.mkdirSync(resolve(ctx, arg), { recursive: parsed.flags.has("p") });
    return ok(ctx.cwd);
  }
});

defineCommand("rmdir", {
  run: (args, ctx) => {
    if (!args.length) return fail(ctx, "rmdir", "missing operand");
    for (const arg of args) ctx.fs.rmdirSync(resolve(ctx, arg));
    return ok(ctx.cwd);
  }
});

defineCommand("rm", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["r", "R", "f"]));
    if (parsed.error) return fail(ctx, "rm", parsed.error, 2);
    if (!parsed.values.length && !parsed.flags.has("f")) return fail(ctx, "rm", "missing operand");
    for (const arg of parsed.values) {
      ctx.fs.rmSync(resolve(ctx, arg), {
        recursive: parsed.flags.has("r") || parsed.flags.has("R"),
        force: parsed.flags.has("f")
      });
    }
    return ok(ctx.cwd);
  }
});

defineCommand("cp", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["r", "R"]));
    if (parsed.error) return fail(ctx, "cp", parsed.error, 2);
    if (parsed.values.length < 2) return fail(ctx, "cp", "missing file operand");
    const sources = parsed.values.slice(0, -1);
    const rawDestination = parsed.values.at(-1);
    const destination = resolve(ctx, rawDestination);
    const destinationIsDirectory = ctx.fs.existsSync(destination) && ctx.fs.statSync(destination).isDirectory();
    if (sources.length > 1 && !destinationIsDirectory) return fail(ctx, "cp", "target is not a directory");
    for (const sourceArg of sources) {
      const source = resolve(ctx, sourceArg);
      const sourceStats = ctx.fs.statSync(source);
      if (sourceStats.isDirectory() && !(parsed.flags.has("r") || parsed.flags.has("R"))) return fail(ctx, "cp", `${sourceArg}: omitting directory`);
      const target = destinationIsDirectory ? `${destination}/${basename(source)}` : destination;
      if (sourceStats.isDirectory()) copyRecursive(ctx, source, target);
      else ctx.fs.copyFileSync(source, target);
    }
    return ok(ctx.cwd);
  }
});

defineCommand("mv", {
  run: (args, ctx) => {
    if (args.length < 2) return fail(ctx, "mv", "missing file operand");
    const sources = args.slice(0, -1);
    const destination = resolve(ctx, args.at(-1));
    const destinationIsDirectory = ctx.fs.existsSync(destination) && ctx.fs.statSync(destination).isDirectory();
    if (sources.length > 1 && !destinationIsDirectory) return fail(ctx, "mv", "target is not a directory");
    for (const sourceArg of sources) {
      const source = resolve(ctx, sourceArg);
      const target = destinationIsDirectory ? `${destination}/${basename(source)}` : destination;
      ctx.fs.renameSync(source, target);
    }
    return ok(ctx.cwd);
  }
});

defineCommand("ln", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["s"]));
    if (parsed.error) return fail(ctx, "ln", parsed.error, 2);
    if (!parsed.flags.has("s")) return fail(ctx, "ln", "hard links are not supported; use -s", 2);
    if (parsed.values.length !== 2) return fail(ctx, "ln", "usage: ln -s target link_name", 2);
    ctx.fs.symlinkSync(parsed.values[0], resolve(ctx, parsed.values[1]));
    return ok(ctx.cwd);
  }
});

defineCommand("chmod", {
  run: (args, ctx) => {
    if (args.length < 2) return fail(ctx, "chmod", "missing operand");
    const mode = Number.parseInt(args[0], 8);
    if (!Number.isFinite(mode)) return fail(ctx, "chmod", "only octal modes are supported", 2);
    for (const arg of args.slice(1)) {
      const path = resolve(ctx, arg);
      const node = ctx.fs.nodes?.get(normalizePath(path));
      if (!node) ctx.fs.statSync(path);
      else node.mode = (node.mode & 0o170000) | (mode & 0o7777);
    }
    return ok(ctx.cwd);
  }
});

defineCommand("stat", {
  run: (args, ctx) => {
    if (!args.length) return fail(ctx, "stat", "missing operand");
    for (const arg of args) {
      const path = resolve(ctx, arg);
      const stats = ctx.fs.lstatSync(path);
      ctx.stdout?.write(`  File: ${arg}\n  Size: ${stats.size}\tMode: ${(stats.mode & 0o7777).toString(8)}\nModify: ${stats.mtime.toISOString()}\n`);
    }
    return ok(ctx.cwd);
  }
});

defineCommand("basename", {
  run: (args, ctx) => {
    ctx.stdout?.write(`${basename(args[0] ?? "")}\n`);
    return ok(ctx.cwd);
  }
});

defineCommand("dirname", {
  run: (args, ctx) => {
    ctx.stdout?.write(`${dirname(args[0] ?? ".")}\n`);
    return ok(ctx.cwd);
  }
});

defineCommand("date", {
  run: (_args, ctx) => {
    ctx.stdout?.write(`${new Date().toString()}\n`);
    return ok(ctx.cwd);
  }
});

defineCommand("sleep", {
  sync: false,
  run: async (args, ctx) => {
    const seconds = Number(args[0] ?? 1);
    if (!Number.isFinite(seconds) || seconds < 0) return fail(ctx, "sleep", "invalid time interval", 1);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, seconds * 1000));
    return ok(ctx.cwd);
  }
});

defineCommand("head", {
  run: (args, ctx) => headTail(args, ctx, "head")
});

defineCommand("tail", {
  run: (args, ctx) => headTail(args, ctx, "tail")
});

function headTail(args, ctx, command) {
  let count = 10;
  const rest = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "-n") {
      count = Number(args[++index]);
      if (!Number.isFinite(count)) return fail(ctx, command, "invalid line count", 2);
      continue;
    }
    if (args[index].startsWith("-n")) {
      count = Number(args[index].slice(2));
      if (!Number.isFinite(count)) return fail(ctx, command, "invalid line count", 2);
      continue;
    }
    if (args[index].startsWith("-")) return fail(ctx, command, `unsupported option -- ${args[index].slice(1)}`, 2);
    rest.push(args[index]);
  }
  const entries = readInputOrFiles(ctx, rest);
  for (const entry of entries) {
    const lines = entry.text.split(/\r?\n/);
    const selected = command === "head" ? lines.slice(0, count) : lines.slice(Math.max(0, lines.length - count));
    ctx.stdout?.write(selected.join("\n"));
    if (!selected.at(-1)?.endsWith("\n")) ctx.stdout?.write("\n");
  }
  return ok(ctx.cwd);
}

defineCommand("wc", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["l", "w", "c"]));
    if (parsed.error) return fail(ctx, "wc", parsed.error, 2);
    const all = !parsed.flags.size;
    const entries = readInputOrFiles(ctx, parsed.values);
    for (const entry of entries) {
      const bytes = new TextEncoder().encode(entry.text).byteLength;
      const lines = entry.text ? entry.text.split("\n").length - (entry.text.endsWith("\n") ? 0 : 1) : 0;
      const words = entry.text.trim() ? entry.text.trim().split(/\s+/).length : 0;
      const parts = [];
      if (all || parsed.flags.has("l")) parts.push(String(lines).padStart(7, " "));
      if (all || parsed.flags.has("w")) parts.push(String(words).padStart(7, " "));
      if (all || parsed.flags.has("c")) parts.push(String(bytes).padStart(7, " "));
      if (entry.displayPath) parts.push(` ${entry.displayPath}`);
      ctx.stdout?.write(`${parts.join("")}\n`);
    }
    return ok(ctx.cwd);
  }
});

defineCommand("grep", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["i", "n", "r", "R"]));
    if (parsed.error) return fail(ctx, "grep", parsed.error, 2);
    const [pattern, ...paths] = parsed.values;
    if (!pattern) return fail(ctx, "grep", "missing pattern");
    const flags = parsed.flags.has("i") ? "i" : "";
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const targets = paths.length ? paths.map((path) => resolve(ctx, path)) : [null];
    let matched = false;
    const grepFile = (path, label) => {
      const text = path ? readTextFile(ctx, path) : String(ctx.stdin ?? "");
      text.split(/\r?\n/).forEach((line, index) => {
        if (!regex.test(line)) return;
        matched = true;
        const prefix = [];
        if (paths.length > 1 || parsed.flags.has("r") || parsed.flags.has("R")) prefix.push(label);
        if (parsed.flags.has("n")) prefix.push(String(index + 1));
        ctx.stdout?.write(`${prefix.length ? `${prefix.join(":")}:` : ""}${line}\n`);
      });
    };
    for (const target of targets) {
      if (target && ctx.fs.statSync(target).isDirectory()) {
        if (!(parsed.flags.has("r") || parsed.flags.has("R"))) return fail(ctx, "grep", `${target}: is a directory`);
        walk(ctx, target, (path) => {
          if (ctx.fs.statSync(path).isFile()) grepFile(path, path);
        });
      } else {
        grepFile(target, target ?? "");
      }
    }
    return { status: matched ? 0 : 1, cwd: ctx.cwd };
  }
});

defineCommand("find", {
  run: (args, ctx) => {
    let roots = [];
    let namePattern = null;
    let type = null;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "-name") namePattern = args[++index];
      else if (arg === "-type") type = args[++index];
      else if (arg.startsWith("-")) return fail(ctx, "find", `unsupported option ${arg}`, 2);
      else roots.push(arg);
    }
    if (!roots.length) roots = ["."];
    if (type && !["f", "d", "l"].includes(type)) return fail(ctx, "find", `unsupported type ${type}`, 2);
    const matcher = namePattern ? globPattern(namePattern) : null;
    for (const root of roots) {
      const resolvedRoot = resolve(ctx, root);
      walk(ctx, resolvedRoot, (path) => {
        const stats = ctx.fs.lstatSync(path);
        if (type === "f" && !stats.isFile()) return;
        if (type === "d" && !stats.isDirectory()) return;
        if (type === "l" && !stats.isSymbolicLink()) return;
        if (matcher && !matcher.test(basename(path))) return;
        ctx.stdout?.write(`${formatFindPath(root, resolvedRoot, path)}\n`);
      });
    }
    return ok(ctx.cwd);
  }
});

function formatFindPath(root, resolvedRoot, path) {
  if (root.startsWith("/")) return path;
  const base = root.replace(/\/+$/, "") || ".";
  if (path === resolvedRoot) return base;
  const suffix = path.slice(resolvedRoot.length).replace(/^\/+/, "");
  return base === "." ? `./${suffix}` : `${base}/${suffix}`;
}

defineCommand("sort", {
  run: (args, ctx) => {
    const parsed = parseFlags(args, new Set(["r"]));
    if (parsed.error) return fail(ctx, "sort", parsed.error, 2);
    const text = readInputOrFiles(ctx, parsed.values).map((entry) => entry.text).join("");
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    lines.sort();
    if (parsed.flags.has("r")) lines.reverse();
    ctx.stdout?.write(`${lines.join("\n")}${lines.length ? "\n" : ""}`);
    return ok(ctx.cwd);
  }
});

defineCommand("uniq", {
  run: (args, ctx) => {
    if (args.some((arg) => arg.startsWith("-"))) return fail(ctx, "uniq", "flags are not supported yet", 2);
    const text = readInputOrFiles(ctx, args).map((entry) => entry.text).join("");
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    let previous;
    for (const line of lines) {
      if (line === previous) continue;
      previous = line;
      ctx.stdout?.write(`${line}\n`);
    }
    return ok(ctx.cwd);
  }
});

defineCommand(["less", "more"], {
  interactive: true,
  rawTerminal: true,
  sync: false,
  run: (args, ctx) => runPager(args, ctx)
});

defineCommand(["vi", "vim"], {
  interactive: true,
  rawTerminal: true,
  sync: false,
  run: (args, ctx) => runVi(args, ctx)
});

defineCommand("nano", {
  interactive: true,
  rawTerminal: true,
  sync: false,
  run: (args, ctx) => runNano(args, ctx)
});

function globPattern(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function shellExitStatus(value) {
  if (value === undefined) return 0;
  const status = Number(value);
  if (!Number.isFinite(status)) return 2;
  return ((Math.trunc(status) % 256) + 256) % 256;
}

function decodeChunk(chunk) {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return textDecoder.decode(chunk);
  return String(chunk);
}

function terminalSize(ctx) {
  const cols = Number(ctx.descriptor?.env?.COLUMNS ?? ctx.env?.COLUMNS ?? 80);
  const rows = Number(ctx.descriptor?.env?.LINES ?? ctx.env?.LINES ?? 24);
  return {
    cols: Number.isFinite(cols) ? Math.max(20, cols) : 80,
    rows: Number.isFinite(rows) ? Math.max(8, rows) : 24
  };
}

function writeScreen(ctx, value) {
  ctx.stdout?.write(value);
}

function move(row, col) {
  return `\x1b[${row};${col}H`;
}

function clearScreen() {
  return "\x1b[2J\x1b[H";
}

function enterAltScreen() {
  return "\x1b[?1049h\x1b[?25l";
}

function leaveAltScreen() {
  return "\x1b[?25h\x1b[?1049l";
}

function inverse(text) {
  return `\x1b[7m${text}\x1b[0m`;
}

function truncate(value, width) {
  const chars = Array.from(String(value));
  if (chars.length <= width) return String(value).padEnd(width, " ");
  return `${chars.slice(0, Math.max(0, width - 1)).join("")}…`;
}

function parseTerminalKeys(data) {
  const keys = [];
  for (let index = 0; index < data.length; index++) {
    const char = data[index];
    if (char === "\x1b") {
      const seq3 = data.slice(index, index + 3);
      if (["\x1b[A", "\x1b[B", "\x1b[C", "\x1b[D"].includes(seq3)) {
        keys.push({ type: "escape", value: seq3 });
        index += 2;
        continue;
      }
      keys.push({ type: "escape", value: "\x1b" });
      continue;
    }
    keys.push({ type: "char", value: char });
  }
  return keys;
}

function addCleanup(ctx, cleanup) {
  ctx.descriptor.cleanupTasks ??= new Set();
  ctx.descriptor.cleanupTasks.add(cleanup);
}

function loadEditableFile(ctx, fileArg) {
  const path = fileArg ? resolve(ctx, fileArg) : null;
  let text = "";
  if (path && ctx.fs.existsSync(path)) {
    text = readTextFile(ctx, path);
    if (isBinaryText(text)) throw new Error(`${fileArg}: binary file not supported`);
  }
  return {
    path,
    name: fileArg ?? "[No Name]",
    lines: text.length ? text.replace(/\r\n/g, "\n").split("\n") : [""]
  };
}

function saveEditableFile(ctx, state) {
  if (!state.path) throw new Error("no file name");
  writeTextFile(ctx, state.path, state.lines.join("\n"));
  state.original = state.lines.join("\n");
  state.dirty = false;
}

function runPager(args, ctx) {
  const files = readInputOrFiles(ctx, args);
  const text = files.map((entry) => entry.text).join("");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let offset = 0;
  let resolved = false;

  return new Promise((resolvePager) => {
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      ctx.descriptor?.stdin?.off?.("data", onData);
      writeScreen(ctx, leaveAltScreen());
      resolvePager(ok(ctx.cwd));
    };
    const redraw = () => {
      const { cols, rows } = terminalSize(ctx);
      const pageRows = Math.max(1, rows - 1);
      const visible = lines.slice(offset, offset + pageRows);
      let screen = enterAltScreen() + clearScreen();
      visible.forEach((line, index) => {
        screen += move(index + 1, 1) + truncate(line, cols);
      });
      const percent = lines.length <= pageRows ? "All" : `${Math.min(100, Math.round(((offset + pageRows) / lines.length) * 100))}%`;
      screen += move(rows, 1) + inverse(truncate(` ${args[0] ?? ""} ${percent} - q to quit `, cols));
      writeScreen(ctx, screen);
    };
    const onData = (chunk) => {
      for (const key of parseTerminalKeys(decodeChunk(chunk))) {
        if (key.value === "q" || key.value === "\x03") return cleanup();
        if (key.value === " " || key.value === "\x1b[B" || key.value === "j") offset = Math.min(Math.max(0, lines.length - 1), offset + 1);
        if (key.value === "b" || key.value === "\x1b[A" || key.value === "k") offset = Math.max(0, offset - 1);
      }
      redraw();
    };
    addCleanup(ctx, cleanup);
    ctx.descriptor?.stdin?.on?.("data", onData);
    redraw();
  });
}

function runVi(args, ctx) {
  let state;
  try {
    state = loadEditableFile(ctx, args[0]);
  } catch (error) {
    ctx.stderr?.write(`vi: ${error.message ?? error}\n`);
    return 1;
  }
  state.original = state.lines.join("\n");
  state.dirty = false;
  state.row = 0;
  state.col = 0;
  state.mode = "normal";
  state.command = "";
  state.undo = null;
  let pending = "";
  let message = "";
  let resolved = false;

  return new Promise((resolveVi) => {
    const snapshot = () => {
      state.undo = {
        lines: [...state.lines],
        row: state.row,
        col: state.col
      };
    };
    const markDirty = () => {
      state.dirty = state.lines.join("\n") !== state.original;
    };
    const clamp = () => {
      state.row = Math.max(0, Math.min(state.row, state.lines.length - 1));
      state.col = Math.max(0, Math.min(state.col, state.lines[state.row].length));
    };
    const redraw = () => {
      const { cols, rows } = terminalSize(ctx);
      const bodyRows = Math.max(1, rows - 2);
      const top = Math.max(0, Math.min(state.row, Math.max(0, state.lines.length - bodyRows)));
      let screen = enterAltScreen() + clearScreen();
      for (let index = 0; index < bodyRows; index++) {
        const line = state.lines[top + index];
        screen += move(index + 1, 1) + truncate(line ?? "~", cols);
      }
      const status = `${state.mode === "insert" ? "-- INSERT --" : state.name}${state.dirty ? " [+]" : ""}`;
      screen += move(rows - 1, 1) + inverse(truncate(` ${status}`, cols));
      screen += move(rows, 1) + truncate(state.mode === "command" ? `:${state.command}` : message, cols);
      screen += move(state.row - top + 1, state.col + 1);
      writeScreen(ctx, `${screen}\x1b[?25h`);
    };
    const finish = (status = 0) => {
      if (resolved) return;
      resolved = true;
      ctx.descriptor?.stdin?.off?.("data", onData);
      writeScreen(ctx, leaveAltScreen());
      resolveVi({ status, cwd: ctx.cwd });
    };
    const insertText = (value) => {
      snapshot();
      const line = state.lines[state.row];
      state.lines[state.row] = `${line.slice(0, state.col)}${value}${line.slice(state.col)}`;
      state.col += Array.from(value).length;
      markDirty();
    };
    const insertNewLine = () => {
      snapshot();
      const line = state.lines[state.row];
      state.lines.splice(state.row + 1, 0, line.slice(state.col));
      state.lines[state.row] = line.slice(0, state.col);
      state.row++;
      state.col = 0;
      markDirty();
    };
    const runCommand = () => {
      const command = state.command.trim();
      state.command = "";
      state.mode = "normal";
      try {
        if (command === "w") {
          saveEditableFile(ctx, state);
          message = `"${state.name}" written`;
        } else if (command === "q") {
          if (state.dirty) message = "No write since last change (add ! to override)";
          else finish(0);
        } else if (command === "q!") {
          finish(0);
        } else if (command === "wq" || command === "x") {
          saveEditableFile(ctx, state);
          finish(0);
        } else {
          message = `Not an editor command: ${command}`;
        }
      } catch (error) {
        message = error.message ?? String(error);
      }
    };
    const onNormalKey = (key) => {
      message = "";
      if (pending === "d" && key.value === "d") {
        snapshot();
        state.lines.splice(state.row, 1);
        if (!state.lines.length) state.lines.push("");
        state.col = 0;
        pending = "";
        markDirty();
        clamp();
        return;
      }
      pending = "";
      switch (key.value) {
        case "i":
          state.mode = "insert";
          return;
        case "a":
          state.col = Math.min(state.lines[state.row].length, state.col + 1);
          state.mode = "insert";
          return;
        case "o":
          snapshot();
          state.lines.splice(state.row + 1, 0, "");
          state.row++;
          state.col = 0;
          state.mode = "insert";
          markDirty();
          return;
        case "O":
          snapshot();
          state.lines.splice(state.row, 0, "");
          state.col = 0;
          state.mode = "insert";
          markDirty();
          return;
        case "x":
          if (state.lines[state.row].length) {
            snapshot();
            const line = state.lines[state.row];
            state.lines[state.row] = `${line.slice(0, state.col)}${line.slice(state.col + 1)}`;
            markDirty();
          }
          return;
        case "d":
          pending = "d";
          return;
        case "u":
          if (state.undo) {
            state.lines = [...state.undo.lines];
            state.row = state.undo.row;
            state.col = state.undo.col;
            markDirty();
          }
          return;
        case ":":
          state.mode = "command";
          state.command = "";
          return;
        case "h":
        case "\x1b[D":
          state.col--;
          break;
        case "l":
        case "\x1b[C":
          state.col++;
          break;
        case "j":
        case "\x1b[B":
          state.row++;
          break;
        case "k":
        case "\x1b[A":
          state.row--;
          break;
        case "0":
          state.col = 0;
          break;
        case "$":
          state.col = state.lines[state.row].length;
          break;
      }
      clamp();
    };
    const onData = (chunk) => {
      for (const key of parseTerminalKeys(decodeChunk(chunk))) {
        if (key.value === "\x03") return finish(130);
        if (state.mode === "command") {
          if (key.value === "\r" || key.value === "\n") runCommand();
          else if (key.value === "\x7f" || key.value === "\b") state.command = state.command.slice(0, -1);
          else if (key.value === "\x1b") state.mode = "normal";
          else if (key.type === "char") state.command += key.value;
          continue;
        }
        if (state.mode === "insert") {
          if (key.value === "\x1b") state.mode = "normal";
          else if (key.value === "\r" || key.value === "\n") insertNewLine();
          else if (key.value === "\x7f" || key.value === "\b") {
            if (state.col > 0) {
              snapshot();
              const line = state.lines[state.row];
              state.lines[state.row] = `${line.slice(0, state.col - 1)}${line.slice(state.col)}`;
              state.col--;
              markDirty();
            }
          } else if (key.type === "char" && key.value >= " ") insertText(key.value);
          continue;
        }
        onNormalKey(key);
      }
      redraw();
    };
    addCleanup(ctx, finish);
    ctx.descriptor?.stdin?.on?.("data", onData);
    redraw();
  });
}

function runNano(args, ctx) {
  let state;
  try {
    state = loadEditableFile(ctx, args[0]);
  } catch (error) {
    ctx.stderr?.write(`nano: ${error.message ?? error}\n`);
    return 1;
  }
  state.original = state.lines.join("\n");
  state.dirty = false;
  state.row = 0;
  state.col = 0;
  let cutBuffer = "";
  let prompt = null;
  let message = "";
  let resolved = false;

  return new Promise((resolveNano) => {
    const markDirty = () => {
      state.dirty = state.lines.join("\n") !== state.original;
    };
    const clamp = () => {
      state.row = Math.max(0, Math.min(state.row, state.lines.length - 1));
      state.col = Math.max(0, Math.min(state.col, state.lines[state.row].length));
    };
    const redraw = () => {
      const { cols, rows } = terminalSize(ctx);
      const bodyRows = Math.max(1, rows - 3);
      const top = Math.max(0, Math.min(state.row, Math.max(0, state.lines.length - bodyRows)));
      let screen = enterAltScreen() + clearScreen();
      screen += move(1, 1) + inverse(truncate(`  OpenContainers nano  ${state.name}${state.dirty ? " *" : ""}`, cols));
      for (let index = 0; index < bodyRows; index++) {
        const line = state.lines[top + index] ?? "";
        screen += move(index + 2, 1) + truncate(line, cols);
      }
      const footer = prompt
        ? `${prompt.label}${prompt.value}`
        : "^O Write Out   ^X Exit   ^K Cut   ^U Paste   ^W Search";
      screen += move(rows - 1, 1) + inverse(truncate(` ${footer}`, cols));
      screen += move(rows, 1) + truncate(message, cols);
      screen += move(state.row - top + 2, state.col + 1);
      writeScreen(ctx, `${screen}\x1b[?25h`);
    };
    const finish = (status = 0) => {
      if (resolved) return;
      resolved = true;
      ctx.descriptor?.stdin?.off?.("data", onData);
      ctx.descriptor?.terminal?.off?.("resize", onResize);
      writeScreen(ctx, leaveAltScreen());
      resolveNano({ status, cwd: ctx.cwd });
    };
    const save = (pathArg = state.name) => {
      const target = state.path ?? resolve(ctx, pathArg);
      state.path = target;
      state.name = pathArg;
      saveEditableFile(ctx, state);
      message = `Wrote ${state.name}`;
    };
    const insert = (value) => {
      const line = state.lines[state.row];
      state.lines[state.row] = `${line.slice(0, state.col)}${value}${line.slice(state.col)}`;
      state.col += Array.from(value).length;
      markDirty();
    };
    const newline = () => {
      const line = state.lines[state.row];
      state.lines.splice(state.row + 1, 0, line.slice(state.col));
      state.lines[state.row] = line.slice(0, state.col);
      state.row++;
      state.col = 0;
      markDirty();
    };
    const backspace = () => {
      if (state.col > 0) {
        const line = state.lines[state.row];
        state.lines[state.row] = `${line.slice(0, state.col - 1)}${line.slice(state.col)}`;
        state.col--;
        markDirty();
      } else if (state.row > 0) {
        const previousLength = state.lines[state.row - 1].length;
        state.lines[state.row - 1] += state.lines[state.row];
        state.lines.splice(state.row, 1);
        state.row--;
        state.col = previousLength;
        markDirty();
      }
    };
    const search = (needle) => {
      for (let row = state.row; row < state.lines.length; row++) {
        const col = state.lines[row].indexOf(needle, row === state.row ? state.col + 1 : 0);
        if (col !== -1) {
          state.row = row;
          state.col = col;
          return;
        }
      }
      message = `"${needle}" not found`;
    };
    const onData = (chunk) => {
      for (const key of parseTerminalKeys(decodeChunk(chunk))) {
        message = "";
        if (prompt) {
          if (key.value === "\r" || key.value === "\n") {
            const active = prompt;
            prompt = null;
            if (active.kind === "save") save(active.value || state.name);
            if (active.kind === "search") search(active.value);
          } else if (key.value === "\x1b") {
            prompt = null;
          } else if (key.value === "\x7f" || key.value === "\b") {
            prompt.value = prompt.value.slice(0, -1);
          } else if (key.type === "char" && key.value >= " ") {
            prompt.value += key.value;
          }
          continue;
        }
        if (key.value === "\x18") {
          if (state.dirty) {
            message = "Modified buffer; press Ctrl+O to save or Ctrl+X again to exit";
            state.dirty = false;
          } else {
            finish(0);
            return;
          }
          continue;
        }
        if (key.value === "\x0f") {
          prompt = { kind: "save", label: "File Name to Write: ", value: state.path ? state.name : "" };
          continue;
        }
        if (key.value === "\x0b") {
          cutBuffer = state.lines.splice(state.row, 1)[0] ?? "";
          if (!state.lines.length) state.lines.push("");
          clamp();
          markDirty();
          continue;
        }
        if (key.value === "\x15") {
          state.lines.splice(state.row, 0, cutBuffer);
          markDirty();
          continue;
        }
        if (key.value === "\x17") {
          prompt = { kind: "search", label: "Search: ", value: "" };
          continue;
        }
        if (key.value === "\x03") return finish(130);
        if (key.value === "\x1b[A") state.row--;
        else if (key.value === "\x1b[B") state.row++;
        else if (key.value === "\x1b[D") state.col--;
        else if (key.value === "\x1b[C") state.col++;
        else if (key.value === "\r" || key.value === "\n") newline();
        else if (key.value === "\x7f" || key.value === "\b") backspace();
        else if (key.type === "char" && key.value >= " ") insert(key.value);
        clamp();
      }
      if (!resolved) redraw();
    };
    const onResize = () => {
      if (!resolved) redraw();
    };
    addCleanup(ctx, finish);
    ctx.descriptor?.stdin?.on?.("data", onData);
    ctx.descriptor?.terminal?.on?.("resize", onResize);
    redraw();
  });
}
