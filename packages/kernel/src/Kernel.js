import { VirtualFileSystem } from "../../fs/src/VirtualFileSystem.js";
import { resolvePath } from "../../fs/src/path-utils.js";
import { NpmCommand } from "../../npm/src/npm-command.js";
import { registerDefaultCommandBuiltins } from "../../shell/src/commands.js";
import { ShellRunner } from "../../shell/src/runner.js";
import { NetManager } from "./NetManager.js";
import { PortManager } from "./PortManager.js";
import { ProcessManager } from "./ProcessManager.js";
import { PtyManager } from "./PtyManager.js";
import { SyscallRouter } from "./SyscallRouter.js";
import { WebSocketManager } from "./WebSocketManager.js";

export class Kernel {
  constructor({
    fs = new VirtualFileSystem(),
    registryClient,
    allowExternalNetwork = false,
    allowInstallScripts = false,
    allowChildProcesses = true,
    allowPersistentStorage = true,
    allowPopups = false,
    processWorkerFactory,
    processWorkerBackend
  } = {}) {
    this.fs = fs;
    this.allowExternalNetwork = allowExternalNetwork;
    this.allowInstallScripts = allowInstallScripts;
    this.allowChildProcesses = allowChildProcesses;
    this.allowPersistentStorage = allowPersistentStorage;
    this.allowPopups = allowPopups;
    this.commandBuiltins = new Map();
    this.portManager = new PortManager();
    this.net = new NetManager();
    this.webSockets = new WebSocketManager();
    this.processManager = new ProcessManager({ kernel: this, processWorkerFactory, processWorkerBackend });
    this.pty = new PtyManager({ kernel: this });
    this.syscalls = new SyscallRouter({ kernel: this });
    this.shell = new ShellRunner({ kernel: this });
    this.npmCommand = new NpmCommand({ kernel: this, registryClient });
    this.registerDefaultBuiltins();
  }

  registerDefaultBuiltins() {
    registerDefaultCommandBuiltins(this);
  }

  resolvePath(cwd, path) {
    return resolvePath(cwd, path);
  }

  spawn(command, args = [], options = {}) {
    return this.processManager.spawn(command, args, options);
  }

  spawnSync(command, args = [], options = {}) {
    return this.processManager.spawnSync(command, args, options);
  }

  kill(pid, signal) {
    return this.processManager.kill(pid, signal);
  }

  killTree(pid, signal) {
    return this.processManager.killTree(pid, signal);
  }

  async run(command, args = [], options = {}) {
    const process = this.spawn(command, args, options);
    return process.completed;
  }

  registerPort(options) {
    return this.portManager.register(options);
  }

  listeningPorts(projectId = "default") {
    return this.portManager.list(projectId);
  }

  unregisterPortsForPid(pid) {
    for (const entry of this.portManager.ports.values()) {
      if (entry.pid === pid) {
        this.webSockets.unregister({ projectId: entry.projectId, port: entry.port });
      }
    }
    this.portManager.unregisterForPid(pid);
    this.net.unregisterForPid(pid);
    this.processManager.processes.get(pid)?.descriptor.onIdle?.();
  }

  dispatchHttpRequest(request) {
    return this.portManager.dispatch(request);
  }

  registerWebSocketServer(options) {
    return this.webSockets.register(options);
  }

  connectWebSocket(options) {
    return this.webSockets.connect(options);
  }

  listenNet(options) {
    return this.net.listen(options);
  }

  connectNet(options) {
    return this.net.connect(options);
  }
}
