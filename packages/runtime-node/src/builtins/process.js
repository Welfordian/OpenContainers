import { EventEmitter } from "./events.js";

export const OPENCONTAINERS_NODE_VERSION = "26.0.0";
export const OPENCONTAINERS_PROCESS_VERSION = `v${OPENCONTAINERS_NODE_VERSION}`;
export const OPENCONTAINERS_V8_VERSION = "14.3.127.18-node.10";
export const OPENCONTAINERS_VERSIONS = {
  node: OPENCONTAINERS_NODE_VERSION,
  v8: OPENCONTAINERS_V8_VERSION,
  modules: "144",
  napi: "10",
  opencontainers: "0.1.0"
};

export function createProcessBuiltin({ descriptor, kernel, asyncContextManager, getBuiltinModule }) {
  const proc = new EventEmitter();
  const startNs = nowNs();
  proc.pid = descriptor.pid;
  proc.ppid = descriptor.ppid ?? 0;
  Object.defineProperty(proc, "__opencontainersNetworkAllowlist", {
    value: Object.freeze([...(descriptor.externalNetworkAllowlist ?? [])]),
    enumerable: false
  });
  proc.argv = [...descriptor.argv];
  proc.argv0 = descriptor.argv?.[0] ?? "node";
  proc.execPath = "/bin/node";
  proc.execArgv = [];
  proc.env = descriptor.env;
  proc.platform = "opencontainers";
  proc.arch = "wasm";
  proc.title = "node";
  proc.version = OPENCONTAINERS_PROCESS_VERSION;
  proc.versions = { ...OPENCONTAINERS_VERSIONS };
  proc.release = {
    name: "node",
    sourceUrl: "https://nodejs.org/download/release/",
    headersUrl: "https://nodejs.org/download/release/"
  };
  proc.config = Object.freeze({
    variables: Object.freeze({}),
    target_defaults: Object.freeze({})
  });
  proc.features = Object.freeze({
    inspector: false,
    debug: false,
    uv: false,
    ipv6: true,
    tls: true,
    cached_builtins: false
  });
  proc.allowedNodeEnvironmentFlags = new Set();
  Object.defineProperty(proc, "exitCode", {
    get: () => descriptor.exitCode,
    set: (code) => {
      descriptor.exitCode = Number(code) || 0;
    }
  });
  proc.stdin = descriptor.stdin;
  proc.stdout = descriptor.stdout;
  proc.stderr = descriptor.stderr;
  markProcessStream(proc.stdin, proc, 0);
  markProcessStream(proc.stdout, proc, 1);
  markProcessStream(proc.stderr, proc, 2);
  proc.cwd = () => descriptor.cwd;
  proc.chdir = (path) => {
    descriptor.cwd = kernel.resolvePath(descriptor.cwd, path);
    kernel.fs.statSync(descriptor.cwd);
  };
  let umaskValue = 0o022;
  proc.umask = (mask) => {
    const previous = umaskValue;
    if (mask !== undefined) umaskValue = Number(mask);
    return previous;
  };
  proc.getuid = () => 1000;
  proc.getgid = () => 1000;
  proc.geteuid = () => 1000;
  proc.getegid = () => 1000;
  proc.exit = (code = undefined) => {
    const exitCode = Number(code ?? descriptor.exitCode ?? 0) || 0;
    descriptor.exitCode = exitCode;
    proc.emit("exit", exitCode);
    throw Object.assign(new Error(`Process exited with code ${code}`), {
      code: "OPENCONTAINERS_PROCESS_EXIT",
      exitCode
    });
  };
  proc.nextTick = (callback, ...args) => {
    const wrapped = asyncContextManager?.bind(callback) ?? callback;
    queueMicrotask(() => wrapped(...args));
  };
  proc.kill = (pid, signal = "SIGTERM") => kernel.kill(pid, signal);
  proc.emitWarning = (warning) => descriptor.stderr.write(`${warning}\n`);
  proc.uptime = () => Number(nowNs() - startNs) / 1e9;
  proc.hrtime = (previous) => {
    const elapsed = nowNs() - startNs;
    let seconds = elapsed / 1000000000n;
    let nanoseconds = elapsed % 1000000000n;
    if (Array.isArray(previous)) {
      const previousSeconds = BigInt(Number(previous[0] ?? 0));
      const previousNanoseconds = BigInt(Number(previous[1] ?? 0));
      const diff = elapsed - (previousSeconds * 1000000000n + previousNanoseconds);
      seconds = diff / 1000000000n;
      nanoseconds = diff % 1000000000n;
      if (nanoseconds < 0n) {
        seconds -= 1n;
        nanoseconds += 1000000000n;
      }
    }
    return [Number(seconds), Number(nanoseconds)];
  };
  proc.hrtime.bigint = () => nowNs() - startNs;
  proc.memoryUsage = () => {
    const browserMemory = globalThis.performance?.memory;
    const heapTotal = Number(browserMemory?.totalJSHeapSize ?? 0);
    const heapUsed = Number(browserMemory?.usedJSHeapSize ?? 0);
    const rss = Number(browserMemory?.jsHeapSizeLimit ?? heapTotal ?? 0);
    return {
      rss,
      heapTotal,
      heapUsed,
      external: 0,
      arrayBuffers: 0
    };
  };
  proc.memoryUsage.rss = () => proc.memoryUsage().rss;
  proc.cpuUsage = (previous) => {
    const usage = { user: Math.floor(proc.uptime() * 1000000), system: 0 };
    if (previous && typeof previous === "object") {
      return {
        user: usage.user - Number(previous.user ?? 0),
        system: usage.system - Number(previous.system ?? 0)
      };
    }
    return usage;
  };
  proc.resourceUsage = () => ({
    userCPUTime: proc.cpuUsage().user,
    systemCPUTime: proc.cpuUsage().system,
    maxRSS: Math.ceil(proc.memoryUsage().rss / 1024),
    sharedMemorySize: 0,
    unsharedDataSize: 0,
    unsharedStackSize: 0,
    minorPageFault: 0,
    majorPageFault: 0,
    swappedOut: 0,
    fsRead: 0,
    fsWrite: 0,
    ipcSent: 0,
    ipcReceived: 0,
    signalsCount: 0,
    voluntaryContextSwitches: 0,
    involuntaryContextSwitches: 0
  });
  proc.getBuiltinModule = (specifier) => {
    if (typeof getBuiltinModule !== "function") return undefined;
    return getBuiltinModule(String(specifier)) ?? undefined;
  };
  proc.report = {
    directory: "",
    filename: "",
    compact: false,
    signal: "SIGUSR2",
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport(error) {
      return {
        header: {
          reportVersion: 5,
          event: error ? "JavaScript API" : "JavaScript API",
          trigger: "GetReport",
          filename: this.filename,
          dumpEventTime: new Date().toISOString(),
          processId: proc.pid,
          cwd: proc.cwd(),
          commandLine: [...proc.argv],
          nodejsVersion: proc.version,
          opencontainersVersion: proc.versions.opencontainers
        },
        javascriptStack: error
          ? { message: error.message, stack: String(error.stack ?? error.message ?? error) }
          : { message: "", stack: "" },
        javascriptHeap: proc.memoryUsage(),
        resourceUsage: proc.resourceUsage(),
        environmentVariables: { ...proc.env },
        sharedObjects: []
      };
    },
    writeReport(filename) {
      const target = filename || `report.${Date.now()}.${proc.pid}.json`;
      kernel.fs.writeFileSync(kernel.resolvePath(proc.cwd(), target), JSON.stringify(this.getReport(), null, 2));
      return target;
    }
  };
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

function nowNs() {
  if (typeof globalThis.performance?.now === "function") {
    return BigInt(Math.floor(globalThis.performance.now() * 1000000));
  }
  return BigInt(Date.now()) * 1000000n;
}

function markProcessStream(stream, process, fd) {
  if (!stream || typeof stream !== "object") return;
  stream.fd ??= fd;
  stream.isTTY ??= true;
  stream.columns ??= 80;
  stream.rows ??= 24;
  if (fd === 0) {
    stream.isRaw ??= false;
    stream.setRawMode ??= (value) => {
      stream.isRaw = Boolean(value);
      return stream;
    };
  }
  stream.__opencontainersProcess = process;
}
