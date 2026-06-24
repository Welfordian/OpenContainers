import { resolvePath } from "../../fs/src/path-utils.js";
import { NodeRuntime } from "../../runtime-node/src/NodeRuntime.js";
import { runCommandBuiltin, runCommandBuiltinSync } from "../../shell/src/commands.js";
import { OutputStream } from "./OutputStream.js";
import { ProcessWorkerBackend } from "./ProcessWorkerBackend.js";
import { VirtualProcess } from "./VirtualProcess.js";

function normalizeEnv(env = {}) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

function defaultEnv({ cwd, projectId }) {
  const pathEntries = [...new Set([
    `${cwd}/node_modules/.bin`,
    "/workspace/node_modules/.bin",
    "/bin",
    "/usr/bin"
  ])];

  return {
    HOME: "/home/opencontainers",
    PATH: pathEntries.join(":"),
    PWD: cwd,
    SHELL: "/bin/sh",
    TERM: "xterm-256color",
    OPENCONTAINERS_PROJECT_ID: projectId
  };
}

export class ProcessManager {
  constructor({ kernel, processWorkerBackend, processWorkerFactory }) {
    this.kernel = kernel;
    this.nextPid = 100;
    this.processes = new Map();
    this.processWorkerBackend = processWorkerBackend ?? (processWorkerFactory ? new ProcessWorkerBackend({ kernel, workerFactory: processWorkerFactory }) : null);
  }

  spawn(command, args = [], options = {}) {
    const descriptor = this.createDescriptor(command, args, options);
    const process = new VirtualProcess(descriptor);
    this.processes.set(process.pid, process);
    queueMicrotask(() => this.#run(process, command, args));
    return process;
  }

  spawnSync(command, args = [], options = {}) {
    const descriptor = this.createDescriptor(command, args, options);
    const process = new VirtualProcess(descriptor);
    if (options.input !== undefined) process.stdin.write(options.input);
    this.processes.set(process.pid, process);
    let syncError;
    try {
      const status = this.#runSync(process, command, args);
      process.finish(status ?? 0);
    } catch (error) {
      if (error?.code === "ENOENT") {
        syncError = error;
        process.descriptor.status = "exited";
      } else {
        process.fail(error);
      }
    }
    return {
      pid: process.pid,
      status: syncError ? null : process.exitCode,
      signal: process.signalCode,
      stdout: process.stdout.toBuffer(),
      stderr: process.stderr.toBuffer(),
      error: syncError
    };
  }

  createDescriptor(command, args = [], options = {}) {
    const cwd = options.cwd ?? "/workspace";
    const projectId = options.projectId ?? "default";
    const descriptor = {
      pid: this.nextPid++,
      ppid: options.parentPid,
      cwd,
      argv: [command, ...args],
      env: {
        ...defaultEnv({ cwd, projectId }),
        ...normalizeEnv(options.env)
      },
      status: "starting",
      stdin: new OutputStream(),
      stdout: new OutputStream(),
      stderr: new OutputStream(),
      projectId,
      terminal: options.terminal,
      ipc: options.ipc,
      externalNetworkAllowlist: [...(options.externalNetworkAllowlist ?? [])].map((host) => String(host).toLowerCase())
    };
    descriptor.env.OPENCONTAINERS_PROJECT_ID ??= descriptor.projectId;
    return descriptor;
  }

  async #run(process, command, args) {
    process.descriptor.status = "running";
    try {
      const resolved = this.resolveCommand(command, process.descriptor.cwd, process.descriptor.env);
      if (resolved.type === "unknown") {
        throw createSpawnEnoentError(command, args);
      }
      process.emit("spawn");
      let status;
      const canUseProcessWorker = this.processWorkerBackend
        && !process.descriptor.env.OPENCONTAINERS_DISABLE_PROCESS_WORKERS
        && !process.descriptor.ipc;
      if (resolved.type === "node" && canUseProcessWorker) {
        status = await this.processWorkerBackend.run(process, args);
      } else if (resolved.type === "node") {
        status = await new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).execute(args);
      } else if (resolved.type === "node-bin" && canUseProcessWorker) {
        status = await this.processWorkerBackend.run(process, [resolved.target, ...args]);
      } else if (resolved.type === "node-bin") {
        status = await new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).execute([resolved.target, ...args]);
      } else if (resolved.type === "npm") {
        status = await this.kernel.npmCommand.run(args, process.descriptor, { command });
      } else if (resolved.type === "shell") {
        const commandLine = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
        status = await this.kernel.shell.run(commandLine, {
          cwd: process.descriptor.cwd,
          env: process.descriptor.env,
          stdin: process.descriptor.stdin.toString(),
          stdout: process.descriptor.stdout,
          stderr: process.descriptor.stderr,
          projectId: process.descriptor.projectId,
          parentPid: process.pid
        });
      } else if (resolved.type === "builtin") {
        const result = await runCommandBuiltin(resolved.definition, args, {
          kernel: this.kernel,
          descriptor: process.descriptor
        });
        status = result.status;
        if (result.cwd) {
          process.descriptor.cwd = result.cwd;
          process.descriptor.env.PWD = result.cwd;
        }
      }
      const finalStatus = () => process.descriptor.exitCode ?? status ?? 0;
      if ((status ?? 0) === 0 && (this.kernel.portManager.hasPid(process.pid) || this.kernel.net.hasPid(process.pid) || process.descriptor.refCount > 0)) {
        process.descriptor.status = "running";
        process.descriptor.onIdle = () => {
          if (!this.kernel.portManager.hasPid(process.pid) && !this.kernel.net.hasPid(process.pid) && process.descriptor.refCount === 0) {
            process.descriptor.onIdle = null;
            process.finish(finalStatus());
            this.kernel.unregisterPortsForPid(process.pid);
          }
        };
        return;
      }
      process.finish(finalStatus());
    } catch (error) {
      if (error?.code === "ENOENT" && error?.syscall === `spawn ${command}`) {
        process.failToSpawn(error);
      } else {
        process.fail(error);
      }
    } finally {
      if (process.exitCode !== null) this.kernel.unregisterPortsForPid(process.pid);
    }
  }

  #runSync(process, command, args) {
    process.descriptor.status = "running";
    const resolved = this.resolveCommand(command, process.descriptor.cwd, process.descriptor.env);
    if (resolved.type === "node") {
      return new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).executeSync(args);
    }
    if (resolved.type === "node-bin") {
      return new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).executeSync([resolved.target, ...args]);
    }
    if (resolved.type === "shell") {
      const commandLine = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
      return this.kernel.shell.runSync(commandLine, {
        cwd: process.descriptor.cwd,
        env: process.descriptor.env,
        stdin: process.descriptor.stdin.toString(),
        stdout: process.descriptor.stdout,
        stderr: process.descriptor.stderr,
        projectId: process.descriptor.projectId,
        parentPid: process.pid
      });
    }
    if (resolved.type === "builtin") {
      const result = runCommandBuiltinSync(resolved.definition, args, {
        kernel: this.kernel,
        descriptor: process.descriptor
      });
      if (result.cwd) {
        process.descriptor.cwd = result.cwd;
        process.descriptor.env.PWD = result.cwd;
      }
      return result.status;
    }
    throw Object.assign(new Error(`Unsupported sync command: ${command}`), { code: "ENOENT" });
  }

  resolveCommand(command, cwd, env = {}) {
    if (command === "node") return { type: "node" };
    if (command === "npm" || command === "npx") return { type: "npm", command };
    if (command === "sh") return { type: "shell" };

    for (const candidate of this.#commandCandidates(command, cwd, env)) {
      const resolved = this.#resolveExecutable(candidate);
      if (resolved) return resolved;
    }

    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) return { type: "builtin", definition: builtin };
    return { type: "unknown" };
  }

  #commandCandidates(command, cwd, env) {
    const candidates = [];
    const add = (path) => {
      if (!path || candidates.includes(path)) return;
      candidates.push(path);
    };

    if (String(command).includes("/")) {
      add(resolvePath(cwd, command));
      return candidates;
    }

    for (const pathEntry of String(env.PATH || "").split(":")) {
      if (pathEntry) add(resolvePath(cwd, `${pathEntry}/${command}`));
    }

    add(resolvePath(cwd, `node_modules/.bin/${command}`));
    add(`/workspace/node_modules/.bin/${command}`);
    return candidates;
  }

  #resolveExecutable(path) {
    if (!this.kernel.fs.existsSync(path)) return null;

    let source = "";
    try {
      source = this.kernel.fs.readFileSync(path, "utf8");
    } catch {
      return null;
    }

    const trimmed = source.trimStart();
    if (trimmed.startsWith("{")) {
      try {
        const shim = JSON.parse(source);
        if (shim.type === "node-bin" && shim.target) return shim;
      } catch {
        // Real npm bins are usually shell scripts or JS hashbang files.
      }
    }

    const target = this.#realpath(path);
    const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
    if (firstLine.startsWith("#!") && /\bnode(?:\s|$)/.test(firstLine)) {
      return { type: "node-bin", target };
    }
    if (/\.(?:[cm]?js)$/i.test(target)) return { type: "node-bin", target };

    return null;
  }

  #realpath(path) {
    try {
      return this.kernel.fs.realpathSync(path);
    } catch {
      return path;
    }
  }

  kill(pid, signal) {
    const process = this.processes.get(pid);
    if (!process) return false;
    process.kill(signal);
    this.kernel.unregisterPortsForPid(pid);
    return true;
  }

  hasProcess(pid) {
    return this.processes.has(pid);
  }

  killTree(pid, signal) {
    const killed = new Set();
    const killOne = (targetPid) => {
      if (killed.has(targetPid)) return;
      killed.add(targetPid);
      for (const process of this.processes.values()) {
        if (process.descriptor.ppid === targetPid) killOne(process.pid);
      }
      this.kill(targetPid, signal);
    };
    killOne(pid);
    return killed.size > 0;
  }
}

function createSpawnEnoentError(command, args = []) {
  const error = new Error(`spawn ${command} ENOENT`);
  error.errno = -2;
  error.code = "ENOENT";
  error.syscall = `spawn ${command}`;
  error.path = String(command);
  error.spawnargs = [...args];
  return error;
}
