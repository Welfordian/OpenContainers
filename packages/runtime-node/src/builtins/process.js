import { EventEmitter } from "./events.js";

export const WELFORD_NODE_VERSION = "26.0.0-welford";
export const WELFORD_PROCESS_VERSION = `v${WELFORD_NODE_VERSION}`;
export const WELFORD_V8_VERSION = "14.3.127.18-node.10";
export const WELFORD_VERSIONS = {
  node: WELFORD_NODE_VERSION,
  v8: WELFORD_V8_VERSION,
  modules: "144",
  napi: "10",
  welford: "0.1.0"
};

export function createProcessBuiltin({ descriptor, kernel }) {
  const proc = new EventEmitter();
  proc.pid = descriptor.pid;
  proc.ppid = descriptor.ppid ?? 0;
  proc.argv = [...descriptor.argv];
  proc.execPath = "/bin/node";
  proc.env = descriptor.env;
  proc.platform = "welford";
  proc.arch = "wasm";
  proc.version = WELFORD_PROCESS_VERSION;
  proc.versions = { ...WELFORD_VERSIONS };
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
      code: "WELFORD_PROCESS_EXIT",
      exitCode: Number(code) || 0
    });
  };
  proc.nextTick = (callback, ...args) => queueMicrotask(() => callback(...args));
  proc.kill = (pid, signal = "SIGTERM") => kernel.kill(pid, signal);
  proc.emitWarning = (warning) => descriptor.stderr.write(`${warning}\n`);
  descriptor.refCount ??= 0;
  descriptor.cleanupTasks ??= new Set();
  proc.__welfordAddRef = () => {
    descriptor.refCount++;
  };
  proc.__welfordUnref = () => {
    descriptor.refCount = Math.max(0, descriptor.refCount - 1);
    if (descriptor.refCount === 0) {
      queueMicrotask(() => {
        if (descriptor.refCount === 0) descriptor.onIdle?.();
      });
    }
  };
  proc.__welfordOnExit = (cleanup) => {
    descriptor.cleanupTasks.add(cleanup);
    return () => descriptor.cleanupTasks.delete(cleanup);
  };
  proc.__welfordIsAlive = () => descriptor.status !== "exited" && descriptor.status !== "killed";
  return proc;
}
