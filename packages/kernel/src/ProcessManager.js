import { resolvePath } from "../../fs/src/path-utils.js";
import { NodeRuntime } from "../../runtime-node/src/NodeRuntime.js";
import { OutputStream } from "./OutputStream.js";
import { ProcessWorkerBackend } from "./ProcessWorkerBackend.js";
import { VirtualProcess } from "./VirtualProcess.js";

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
    this.processes.set(process.pid, process);
    try {
      const status = this.#runSync(process, command, args);
      process.finish(status ?? 0);
    } catch (error) {
      process.fail(error);
    }
    return {
      pid: process.pid,
      status: process.exitCode,
      signal: process.signalCode,
      stdout: process.stdout.toBuffer(),
      stderr: process.stderr.toBuffer()
    };
  }

  createDescriptor(command, args = [], options = {}) {
    const descriptor = {
      pid: this.nextPid++,
      ppid: options.parentPid,
      cwd: options.cwd ?? "/workspace",
      argv: [command, ...args],
      env: { ...(options.env ?? {}) },
      status: "starting",
      stdin: new OutputStream(),
      stdout: new OutputStream(),
      stderr: new OutputStream(),
      projectId: options.projectId ?? "default"
    };
    descriptor.env.WELFORD_PROJECT_ID ??= descriptor.projectId;
    return descriptor;
  }

  async #run(process, command, args) {
    process.descriptor.status = "running";
    try {
      const resolved = this.resolveCommand(command, process.descriptor.cwd);
      let status;
      if (resolved.type === "node" && this.processWorkerBackend && !process.descriptor.env.WELFORD_DISABLE_PROCESS_WORKERS) {
        status = await this.processWorkerBackend.run(process, args);
      } else if (resolved.type === "node") {
        status = await new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).execute(args);
      } else if (resolved.type === "node-bin" && this.processWorkerBackend && !process.descriptor.env.WELFORD_DISABLE_PROCESS_WORKERS) {
        status = await this.processWorkerBackend.run(process, [resolved.target, ...args]);
      } else if (resolved.type === "node-bin") {
        status = await new NodeRuntime({ kernel: this.kernel, descriptor: process.descriptor }).execute([resolved.target, ...args]);
      } else if (resolved.type === "npm") {
        status = await this.kernel.npmCommand.run(args, process.descriptor);
      } else if (resolved.type === "shell") {
        const commandLine = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
        status = await this.kernel.shell.run(commandLine, {
          cwd: process.descriptor.cwd,
          env: process.descriptor.env,
          stdout: process.descriptor.stdout,
          stderr: process.descriptor.stderr,
          projectId: process.descriptor.projectId,
          parentPid: process.pid
        });
      } else if (resolved.type === "builtin") {
        status = await resolved.run(args, process.descriptor);
      } else {
        throw Object.assign(new Error(`Unsupported command: ${command}`), { code: "ENOENT" });
      }
      if ((status ?? 0) === 0 && (this.kernel.portManager.hasPid(process.pid) || this.kernel.net.hasPid(process.pid) || process.descriptor.refCount > 0)) {
        process.descriptor.status = "running";
        process.descriptor.onIdle = () => {
          if (!this.kernel.portManager.hasPid(process.pid) && !this.kernel.net.hasPid(process.pid) && process.descriptor.refCount === 0) {
            process.descriptor.onIdle = null;
            process.finish(status ?? 0);
            this.kernel.unregisterPortsForPid(process.pid);
          }
        };
        return;
      }
      process.finish(status ?? 0);
    } catch (error) {
      process.fail(error);
    } finally {
      if (process.exitCode !== null) this.kernel.unregisterPortsForPid(process.pid);
    }
  }

  #runSync(process, command, args) {
    process.descriptor.status = "running";
    const resolved = this.resolveCommand(command, process.descriptor.cwd);
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
        stdout: process.descriptor.stdout,
        stderr: process.descriptor.stderr,
        projectId: process.descriptor.projectId,
        parentPid: process.pid
      });
    }
    if (resolved.type === "builtin") {
      const result = resolved.run(args, process.descriptor);
      if (result && typeof result.then === "function") {
        throw Object.assign(new Error(`Command ${command} cannot run synchronously`), {
          code: "ERR_WELFORD_SYNC_COMMAND_UNSUPPORTED"
        });
      }
      return result ?? 0;
    }
    throw Object.assign(new Error(`Unsupported sync command: ${command}`), { code: "ENOENT" });
  }

  resolveCommand(command, cwd) {
    if (command === "node") return { type: "node" };
    if (command === "npm" || command === "npx") return { type: "npm" };
    if (command === "sh") return { type: "shell" };
    const shimPath = resolvePath(cwd, `node_modules/.bin/${command}`);
    if (this.kernel.fs.existsSync(shimPath)) {
      const shim = JSON.parse(this.kernel.fs.readFileSync(shimPath, "utf8"));
      if (shim.type === "node-bin") return shim;
    }
    const binPath = `/workspace/node_modules/.bin/${command}`;
    if (this.kernel.fs.existsSync(binPath)) {
      const shim = JSON.parse(this.kernel.fs.readFileSync(binPath, "utf8"));
      if (shim.type === "node-bin") return shim;
    }
    const builtin = this.kernel.commandBuiltins.get(command);
    if (builtin) return { type: "builtin", run: builtin };
    return { type: "unknown" };
  }

  kill(pid, signal) {
    const process = this.processes.get(pid);
    if (!process) return false;
    process.kill(signal);
    this.kernel.unregisterPortsForPid(pid);
    return true;
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
