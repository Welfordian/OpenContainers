import { EventEmitter } from "./events.js";
import { Readable, Writable } from "./stream.js";

function childHandleFromVirtualProcess(virtualProcess) {
  const child = new EventEmitter();
  child.pid = virtualProcess.pid;
  child.stdin = new Writable({ write: (chunk) => virtualProcess.stdin.write(chunk) });
  child.stdout = new Readable();
  child.stderr = new Readable();

  virtualProcess.stdout.on("data", (chunk) => child.stdout.push(chunk));
  virtualProcess.stderr.on("data", (chunk) => child.stderr.push(chunk));
  virtualProcess.on("exit", (code, signal) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.stdout.push(null);
    child.stderr.push(null);
    child.emit("exit", code, signal);
    child.emit("close", code, signal);
  });
  virtualProcess.on("error", (error) => child.emit("error", error));

  child.kill = (signal = "SIGTERM") => virtualProcess.kill(signal);
  return child;
}

export function createChildProcessBuiltin({ kernel, process }) {
  const spawn = (command, args = [], options = {}) => {
    if (kernel.allowChildProcesses === false) {
      throw Object.assign(new Error("Child process spawning is disabled for this project"), {
        code: "ERR_OPENCONTAINERS_CHILD_PROCESS_PERMISSION"
      });
    }
    process.__opencontainersAddRef?.();
    const virtualProcess = kernel.spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
      parentPid: process.pid
    });
    const child = childHandleFromVirtualProcess(virtualProcess);
    child.on("close", () => process.__opencontainersUnref?.());
    child.on("error", () => process.__opencontainersUnref?.());
    return child;
  };

  const exec = (command, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const child = spawn("sh", ["-c", command], typeof options === "object" ? options : {});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => {
      const error = code === 0 ? null : Object.assign(new Error(`Command failed: ${command}`), { code });
      cb?.(error, stdout, stderr);
    });
    return child;
  };

  const spawnSync = (command, args = [], options = {}) => kernel.spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    projectId: process.env.OPENCONTAINERS_PROJECT_ID ?? "default",
    parentPid: process.pid
  });

  const execSync = (command, options = {}) => {
    const result = spawnSync("sh", ["-c", command], options);
    if (result.status !== 0) {
      throw Object.assign(new Error(`Command failed: ${command}`), result);
    }
    return options.encoding ? result.stdout.toString(options.encoding) : result.stdout;
  };

  const fork = (modulePath, args = [], options = {}) => spawn("node", [modulePath, ...args], options);

  return {
    spawn,
    exec,
    execFile: (file, args, options, callback) => {
      const child = spawn(file, args, options);
      callback && child.on("close", (code) => callback(code ? Object.assign(new Error(`Command failed: ${file}`), { code }) : null));
      return child;
    },
    fork,
    spawnSync,
    execSync
  };
}
