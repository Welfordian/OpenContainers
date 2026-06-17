import { dirname, resolvePath } from "../../fs/src/path-utils.js";
import { parsePipeline, parseSimpleCommand, splitCommands } from "./parser.js";

export class ShellRunner {
  constructor({ kernel }) {
    this.kernel = kernel;
  }

  async run(commandLine, options = {}) {
    let cwd = options.cwd ?? "/workspace";
    let lastStatus = 0;
    const commands = splitCommands(commandLine);

    for (let index = 0; index < commands.length; index++) {
      const { command, operator } = commands[index];
      if (index > 0) {
        const previousOperator = commands[index - 1].operator;
        if (previousOperator === "&&" && lastStatus !== 0) continue;
        if (previousOperator === "||" && lastStatus === 0) continue;
      }

      const result = await this.runPipeline(command, {
        ...options,
        cwd
      });
      lastStatus = result.status;
      cwd = result.cwd ?? cwd;
      if (operator === null) break;
    }

    return lastStatus;
  }

  async runPipeline(commandLine, options) {
    const pipeline = parsePipeline(commandLine);
    let stdin = options.stdin ?? "";
    let lastResult = { status: 0, cwd: options.cwd };

    for (let index = 0; index < pipeline.segments.length; index++) {
      const segment = this.prepareSegment(pipeline.segments[index], options.cwd);
      if (!segment.command) continue;
      const isLast = index === pipeline.segments.length - 1;
      const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
      const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
      const stdout = isLast && !stdoutRedirect ? options.stdout ?? new MemoryStream() : new MemoryStream();
      const stderr = isLast && !stderrRedirect ? options.stderr ?? new MemoryStream() : new MemoryStream();
      const env = { ...(options.env ?? {}), ...segment.env };
      lastResult = await this.runCommand(segment.command, segment.args, {
        ...options,
        cwd: lastResult.cwd ?? options.cwd,
        env,
        stdin,
        stdout,
        stderr
      });
      this.flushSegmentOutput({
        segment,
        stdout,
        stderr,
        stdinTarget: isLast ? options.stdout : null,
        stderrTarget: isLast ? options.stderr : null,
        cwd: lastResult.cwd ?? options.cwd
      });
      stdin = typeof stdout.toString === "function" ? stdout.toString() : "";
    }

    return lastResult;
  }

  async runCommand(command, args, options) {
    const builtin = this.shellBuiltin(command);
    if (builtin) return builtin(args, options);

    const child = this.kernel.spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      projectId: options.projectId,
      parentPid: options.parentPid
    });
    child.stdout.on("data", (chunk) => options.stdout?.write(chunk));
    child.stderr.on("data", (chunk) => options.stderr?.write(chunk));
    const result = await child.completed;
    return { status: result.status, cwd: options.cwd };
  }

  runSync(commandLine, options = {}) {
    let cwd = options.cwd ?? "/workspace";
    let lastStatus = 0;
    const commands = splitCommands(commandLine);

    for (let index = 0; index < commands.length; index++) {
      const { command } = commands[index];
      if (index > 0) {
        const previousOperator = commands[index - 1].operator;
        if (previousOperator === "&&" && lastStatus !== 0) continue;
        if (previousOperator === "||" && lastStatus === 0) continue;
      }

      const result = this.runPipelineSync(command, {
        ...options,
        cwd
      });
      lastStatus = result.status;
      cwd = result.cwd ?? cwd;
    }

    return lastStatus;
  }

  runPipelineSync(commandLine, options) {
    const pipeline = parsePipeline(commandLine);
    let stdin = options.stdin ?? "";
    let lastResult = { status: 0, cwd: options.cwd };

    for (let index = 0; index < pipeline.segments.length; index++) {
      const segment = this.prepareSegment(pipeline.segments[index], options.cwd);
      if (!segment.command) continue;
      const isLast = index === pipeline.segments.length - 1;
      const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
      const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
      const stdout = isLast && !stdoutRedirect ? options.stdout ?? new MemoryStream() : new MemoryStream();
      const stderr = isLast && !stderrRedirect ? options.stderr ?? new MemoryStream() : new MemoryStream();
      const env = { ...(options.env ?? {}), ...segment.env };
      lastResult = this.runCommandSync(segment.command, segment.args, {
        ...options,
        cwd: lastResult.cwd ?? options.cwd,
        env,
        stdin,
        stdout,
        stderr
      });
      this.flushSegmentOutput({
        segment,
        stdout,
        stderr,
        stdinTarget: isLast ? options.stdout : null,
        stderrTarget: isLast ? options.stderr : null,
        cwd: lastResult.cwd ?? options.cwd
      });
      stdin = typeof stdout.toString === "function" ? stdout.toString() : "";
    }

    return lastResult;
  }

  runCommandSync(command, args, options) {
    const builtin = this.shellBuiltin(command);
    if (builtin) {
      return this.syncShellBuiltin(command, args, options);
    }

    const result = this.kernel.spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      projectId: options.projectId,
      parentPid: options.parentPid
    });
    options.stdout?.write(result.stdout);
    options.stderr?.write(result.stderr);
    return { status: result.status, cwd: options.cwd };
  }

  syncShellBuiltin(command, args, options) {
    const fs = this.kernel.fs;
    const resolve = (cwd, path) => resolvePath(cwd, path);
    switch (command) {
      case "cd": {
        const target = resolve(options.cwd, args[0] ?? "/workspace");
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
        return { status: 0, cwd: target };
      }
      case "pwd":
        options.stdout?.write(`${options.cwd}\n`);
        return { status: 0, cwd: options.cwd };
      case "ls": {
        const target = resolve(options.cwd, args[0] ?? ".");
        options.stdout?.write(`${fs.readdirSync(target).join("\n")}\n`);
        return { status: 0, cwd: options.cwd };
      }
      case "cat":
        if (!args.length) options.stdout?.write(options.stdin ?? "");
        else for (const path of args) options.stdout?.write(fs.readFileSync(resolve(options.cwd, path), "utf8"));
        return { status: 0, cwd: options.cwd };
      case "echo":
        options.stdout?.write(`${args.join(" ")}\n`);
        return { status: 0, cwd: options.cwd };
      case "mkdir": {
        const recursive = args.includes("-p");
        for (const path of args.filter((arg) => arg !== "-p")) fs.mkdirSync(resolve(options.cwd, path), { recursive });
        return { status: 0, cwd: options.cwd };
      }
      case "rm": {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const force = args.includes("-f") || args.includes("-rf") || args.includes("-fr");
        for (const path of args.filter((arg) => !arg.startsWith("-"))) fs.rmSync(resolve(options.cwd, path), { recursive, force });
        return { status: 0, cwd: options.cwd };
      }
      case "cp":
        fs.copyFileSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      case "mv":
        fs.renameSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      case "which": {
        for (const commandName of args) {
          const shim = resolve(options.cwd, `node_modules/.bin/${commandName}`);
          if (fs.existsSync(shim)) options.stdout?.write(`${shim}\n`);
          else if (["node", "npm", "sh"].includes(commandName)) options.stdout?.write(`/bin/${commandName}\n`);
        }
        return { status: 0, cwd: options.cwd };
      }
      case "env":
        for (const [key, value] of Object.entries(options.env ?? {})) options.stdout?.write(`${key}=${value}\n`);
        return { status: 0, cwd: options.cwd };
      case "clear":
        options.stdout?.write("\x1bc");
        return { status: 0, cwd: options.cwd };
      default:
        throw new Error(`No synchronous shell builtin: ${command}`);
    }
  }

  shellBuiltin(command) {
    const fs = this.kernel.fs;
    const resolve = (cwd, path) => resolvePath(cwd, path);

    const builtins = {
      cd: async (args, options) => {
        const target = resolve(options.cwd, args[0] ?? "/workspace");
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
        return { status: 0, cwd: target };
      },
      pwd: async (_args, options) => {
        options.stdout?.write(`${options.cwd}\n`);
        return { status: 0, cwd: options.cwd };
      },
      ls: async (args, options) => {
        const target = resolve(options.cwd, args[0] ?? ".");
        options.stdout?.write(`${fs.readdirSync(target).join("\n")}\n`);
        return { status: 0, cwd: options.cwd };
      },
      cat: async (args, options) => {
        if (!args.length) options.stdout?.write(options.stdin ?? "");
        else for (const path of args) options.stdout?.write(fs.readFileSync(resolve(options.cwd, path), "utf8"));
        return { status: 0, cwd: options.cwd };
      },
      echo: async (args, options) => {
        options.stdout?.write(`${args.join(" ")}\n`);
        return { status: 0, cwd: options.cwd };
      },
      mkdir: async (args, options) => {
        const recursive = args.includes("-p");
        for (const path of args.filter((arg) => arg !== "-p")) fs.mkdirSync(resolve(options.cwd, path), { recursive });
        return { status: 0, cwd: options.cwd };
      },
      rm: async (args, options) => {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const force = args.includes("-f") || args.includes("-rf") || args.includes("-fr");
        for (const path of args.filter((arg) => !arg.startsWith("-"))) fs.rmSync(resolve(options.cwd, path), { recursive, force });
        return { status: 0, cwd: options.cwd };
      },
      cp: async (args, options) => {
        fs.copyFileSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      },
      mv: async (args, options) => {
        fs.renameSync(resolve(options.cwd, args[0]), resolve(options.cwd, args[1]));
        return { status: 0, cwd: options.cwd };
      },
      which: async (args, options) => {
        for (const commandName of args) {
          const shim = resolve(options.cwd, `node_modules/.bin/${commandName}`);
          if (fs.existsSync(shim)) options.stdout?.write(`${shim}\n`);
          else if (["node", "npm", "sh"].includes(commandName)) options.stdout?.write(`/bin/${commandName}\n`);
        }
        return { status: 0, cwd: options.cwd };
      },
      env: async (_args, options) => {
        for (const [key, value] of Object.entries(options.env ?? {})) options.stdout?.write(`${key}=${value}\n`);
        return { status: 0, cwd: options.cwd };
      },
      clear: async (_args, options) => {
        options.stdout?.write("\x1bc");
        return { status: 0, cwd: options.cwd };
      }
    };

    return builtins[command];
  }

  prepareSegment(segment, cwd) {
    const tokens = [...segment.tokens];
    const env = {};
    let index = 0;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
      const [key, ...rest] = tokens[index].split("=");
      env[key] = rest.join("=");
      index++;
    }
    return {
      env,
      command: tokens[index],
      args: this.expandGlobs(tokens.slice(index + 1), cwd),
      redirects: segment.redirects
    };
  }

  flushSegmentOutput({ segment, stdout, stderr, stdinTarget, stderrTarget, cwd }) {
    const stdoutRedirect = segment.redirects.find((redirect) => redirect.fd === 1);
    const stderrRedirect = segment.redirects.find((redirect) => redirect.fd === 2);
    if (stdoutRedirect) this.writeRedirect(stdoutRedirect, stdout.toString(), cwd);
    else if (stdout instanceof MemoryStream) stdinTarget?.write(stdout.toString());
    if (stderrRedirect) this.writeRedirect(stderrRedirect, stderr.toString(), cwd);
    else if (stderr instanceof MemoryStream) stderrTarget?.write(stderr.toString());
  }

  writeRedirect(redirect, data, cwd) {
    const target = resolvePath(cwd, redirect.target);
    if (redirect.append && this.kernel.fs.existsSync(target)) {
      this.kernel.fs.appendFileSync(target, data);
    } else {
      this.kernel.fs.writeFileSync(target, data);
    }
  }

  expandGlobs(args, cwd) {
    return args.flatMap((arg) => {
      if (!/[*?]/.test(arg)) return [arg];
      const resolved = resolvePath(cwd, arg);
      const directory = dirname(resolved);
      const pattern = resolved.slice(directory.length === 1 ? 1 : directory.length + 1);
      if (!this.kernel.fs.existsSync(directory) || !this.kernel.fs.statSync(directory).isDirectory()) return [arg];
      const regex = globToRegex(pattern);
      const matches = this.kernel.fs.readdirSync(directory)
        .filter((name) => regex.test(name))
        .sort()
        .map((name) => directory === cwd ? name : `${directory}/${name}`);
      return matches.length ? matches : [arg];
    });
  }
}

class MemoryStream {
  constructor() {
    this.chunks = [];
  }

  write(chunk) {
    this.chunks.push(typeof chunk === "string" ? chunk : String(chunk));
  }

  toString() {
    return this.chunks.join("");
  }
}

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
