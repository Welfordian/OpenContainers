import { EventEmitter } from "./events.js";

export const OPENCONTAINERS_NODE_VERSION = "26.0.0-opencontainers";
export const OPENCONTAINERS_PROCESS_VERSION = `v${OPENCONTAINERS_NODE_VERSION}`;
export const OPENCONTAINERS_V8_VERSION = "14.3.127.18-node.10";
export const OPENCONTAINERS_VERSIONS = {
  node: OPENCONTAINERS_NODE_VERSION,
  v8: OPENCONTAINERS_V8_VERSION,
  modules: "144",
  napi: "10",
  opencontainers: "0.1.0"
};

export function createProcessBuiltin({ descriptor, kernel }) {
  const proc = new EventEmitter();
  proc.pid = descriptor.pid;
  proc.ppid = descriptor.ppid ?? 0;
  proc.argv = [...descriptor.argv];
  proc.execPath = "/bin/node";
  proc.env = descriptor.env;
  proc.platform = "opencontainers";
  proc.arch = "wasm";
  proc.version = OPENCONTAINERS_PROCESS_VERSION;
  proc.versions = { ...OPENCONTAINERS_VERSIONS };
  Object.defineProperty(proc, "exitCode", {
    get: () => descriptor.exitCode,
    set: (code) => {
      descriptor.exitCode = Number(code) || 0;
    }
  });
  proc.stdin = descriptor.stdin;
  proc.stdout = descriptor.stdout;
  proc.stderr = descriptor.stderr;
  proc.cwd = () => descriptor.cwd;
  proc.chdir = (path) => {
    descriptor.cwd = kernel.resolvePath(descriptor.cwd, path);
    kernel.fs.statSync(descriptor.cwd);
  };
  proc.exit = (code = 0) => {
    throw Object.assign(new Error(`Process exited with code ${code}`), {
      code: "OPENCONTAINERS_PROCESS_EXIT",
      exitCode: Number(code) || 0
    });
  };
  proc.nextTick = (callback, ...args) => queueMicrotask(() => callback(...args));
  proc.kill = (pid, signal = "SIGTERM") => kernel.kill(pid, signal);
  proc.emitWarning = (warning) => descriptor.stderr.write(`${warning}\n`);
  descriptor.refCount ??= 0;
  descriptor.cleanupTasks ??= new Set();
  proc.__opencontainersAddRef = () => {
    descriptor.refCount++;
  };
  proc.__opencontainersUnref = () => {
    descriptor.refCount = Math.max(0, descriptor.refCount - 1);
    if (descriptor.refCount === 0) {
      queueMicrotask(() => {
        if (descriptor.refCount === 0) descriptor.onIdle?.();
      });
    }
  };
  proc.__opencontainersOnExit = (cleanup) => {
    descriptor.cleanupTasks.add(cleanup);
    return () => descriptor.cleanupTasks.delete(cleanup);
  };
  proc.__opencontainersIsAlive = () => descriptor.status !== "exited" && descriptor.status !== "killed";
  return proc;
}
