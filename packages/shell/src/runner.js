import { dirname, resolveShellPath } from "../../fs/src/path-utils.js";
import { runCommandBuiltin, runCommandBuiltinSync } from "./commands.js";
import { parsePipeline, splitCommands } from "./parser.js";

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
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) {
      return runCommandBuiltin(builtin, args, {
        kernel: this.kernel,
        cwd: options.cwd,
        env: options.env,
        stdin: options.stdin,
        stdout: options.stdout,
        stderr: options.stderr,
        projectId: options.projectId,
        parentPid: options.parentPid
      });
    }

    if (!this.isRunnableCommand(command, options)) {
      return this.commandNotFound(command, options);
    }

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
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) {
      return runCommandBuiltinSync(builtin, args, {
        kernel: this.kernel,
        cwd: options.cwd,
        env: options.env,
        stdin: options.stdin,
        stdout: options.stdout,
        stderr: options.stderr,
        projectId: options.projectId,
        parentPid: options.parentPid
      });
    }

    if (!this.isRunnableCommand(command, options)) {
      return this.commandNotFound(command, options);
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

  isRunnableCommand(command, options) {
    return this.kernel.processManager.resolveCommand(command, options.cwd, options.env).type !== "unknown";
  }

  commandNotFound(command, options) {
    options.stderr?.write(`/bin/sh: ${command}: command not found\n`);
    return { status: 127, cwd: options.cwd };
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
    const target = resolveShellPath(cwd, redirect.target);
    if (redirect.append && this.kernel.fs.existsSync(target)) {
      this.kernel.fs.appendFileSync(target, data);
    } else {
      this.kernel.fs.writeFileSync(target, data);
    }
  }

  expandGlobs(args, cwd) {
    return args.flatMap((arg) => {
      if (!/[*?]/.test(arg)) return [arg];
      const resolved = resolveShellPath(cwd, arg);
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
