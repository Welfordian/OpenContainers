import { EventEmitter, EVENT_EMITTER_CAPTURE_SYMBOL, EVENT_EMITTER_SHAPE_MODE_SYMBOL } from "./events.js";

export const OPENCONTAINERS_NODE_VERSION = "26.0.0";
export const OPENCONTAINERS_PROCESS_VERSION = `v${OPENCONTAINERS_NODE_VERSION}`;
export const OPENCONTAINERS_V8_VERSION = "14.3.127.18-node.10";
export const OPENCONTAINERS_VERSIONS = {
  node: OPENCONTAINERS_NODE_VERSION,
  acorn: "8.15.0",
  ada: "3.2.6",
  amaro: "1.1.0",
  ares: "1.34.5",
  brotli: "1.1.0",
  cldr: "47.0",
  icu: "77.1",
  libffi: "3.4.6",
  lief: "0.16.0",
  llhttp: "9.3.0",
  merve: "1.1.0",
  modules: "144",
  napi: "10",
  nbytes: "0.1.1",
  ncrypto: "0.0.1",
  nghttp2: "1.64.0",
  nghttp3: "",
  ngtcp2: "",
  openssl: "3.0.16",
  simdjson: "3.12.0",
  simdutf: "6.2.0",
  sqlite: "3.49.1",
  tz: "2025b",
  undici: "7.10.0",
  unicode: "16.0",
  uv: "1.51.0",
  uvwasi: "0.0.21",
  v8: OPENCONTAINERS_V8_VERSION,
  zlib: "1.3.1",
  zstd: "1.5.7",
  opencontainers: "0.1.0"
};

const ALLOWED_NODE_ENVIRONMENT_FLAGS = [
  "--abort-on-uncaught-exception",
  "--conditions",
  "--diagnostic-dir",
  "--disable-warning",
  "--enable-source-maps",
  "--experimental-loader",
  "--experimental-network-imports",
  "--experimental-specifier-resolution",
  "--experimental-strip-types",
  "--experimental-transform-types",
  "--experimental-vm-modules",
  "--force-context-aware",
  "--frozen-intrinsics",
  "--heapsnapshot-near-heap-limit",
  "--heapsnapshot-signal",
  "--icu-data-dir",
  "--import",
  "--input-type",
  "--inspect",
  "--inspect-brk",
  "--inspect-port",
  "--loader",
  "--max-http-header-size",
  "--max-old-space-size",
  "--no-addons",
  "--no-deprecation",
  "--no-experimental-detect-module",
  "--no-experimental-require-module",
  "--no-extra-info-on-fatal-exception",
  "--no-force-async-hooks-checks",
  "--no-global-search-paths",
  "--no-network-family-autoselection",
  "--no-warnings",
  "--openssl-config",
  "--openssl-legacy-provider",
  "--pending-deprecation",
  "--policy-integrity",
  "--preserve-symlinks",
  "--preserve-symlinks-main",
  "--prof",
  "--redirect-warnings",
  "--report-compact",
  "--report-dir",
  "--report-directory",
  "--report-filename",
  "--report-on-fatalerror",
  "--report-on-signal",
  "--report-signal",
  "--require",
  "-r",
  "--secure-heap",
  "--secure-heap-min",
  "--stack-trace-limit",
  "--throw-deprecation",
  "--title",
  "--tls-cipher-list",
  "--tls-keylog",
  "--trace-deprecation",
  "--trace-env",
  "--trace-env-js-stack",
  "--trace-env-native-stack",
  "--trace-event-categories",
  "--trace-event-file-pattern",
  "--trace-events-enabled",
  "--trace-exit",
  "--trace-require-module",
  "--trace-sigint",
  "--trace-sync-io",
  "--trace-tls",
  "--trace-uncaught",
  "--trace-warnings",
  "--track-heap-objects",
  "--use-bundled-ca",
  "--use-largepages",
  "--use-openssl-ca",
  "--v8-pool-size",
  "--watch",
  "--watch-path",
  "--watch-preserve-output",
  "--zero-fill-buffers"
];

const PROCESS_REF_SYMBOL = Symbol.for("nodejs.ref");
const PROCESS_UNREF_SYMBOL = Symbol.for("nodejs.unref");
const SIGNAL_NUMBERS = new Map([
  [1, "SIGHUP"],
  [2, "SIGINT"],
  [3, "SIGQUIT"],
  [6, "SIGABRT"],
  [9, "SIGKILL"],
  [14, "SIGALRM"],
  [15, "SIGTERM"]
]);
const SIGNAL_NAMES = new Set([
  "SIGHUP",
  "SIGINT",
  "SIGQUIT",
  "SIGILL",
  "SIGTRAP",
  "SIGABRT",
  "SIGIOT",
  "SIGBUS",
  "SIGFPE",
  "SIGKILL",
  "SIGUSR1",
  "SIGSEGV",
  "SIGUSR2",
  "SIGPIPE",
  "SIGALRM",
  "SIGTERM",
  "SIGCHLD",
  "SIGCONT",
  "SIGSTOP",
  "SIGTSTP",
  "SIGTTIN",
  "SIGTTOU",
  "SIGURG",
  "SIGXCPU",
  "SIGXFSZ",
  "SIGVTALRM",
  "SIGPROF",
  "SIGWINCH",
  "SIGIO",
  "SIGPOLL",
  "SIGPWR",
  "SIGSYS",
  "SIGBREAK"
]);

const PROCESS_EXPORT_ORDER = Object.freeze([
  "version",
  "versions",
  "arch",
  "platform",
  "release",
  "_rawDebug",
  "moduleLoadList",
  "binding",
  "_linkedBinding",
  "_events",
  "_eventsCount",
  "_maxListeners",
  "domain",
  "_exiting",
  "exitCode",
  "config",
  "dlopen",
  "uptime",
  "_getActiveRequests",
  "_getActiveHandles",
  "getActiveResourcesInfo",
  "reallyExit",
  "_kill",
  "loadEnvFile",
  "cpuUsage",
  "threadCpuUsage",
  "resourceUsage",
  "memoryUsage",
  "constrainedMemory",
  "availableMemory",
  "kill",
  "exit",
  "execve",
  "ref",
  "unref",
  "finalization",
  "hrtime",
  "openStdin",
  "getuid",
  "geteuid",
  "getgid",
  "getegid",
  "getgroups",
  "allowedNodeEnvironmentFlags",
  "features",
  "_fatalException",
  "setUncaughtExceptionCaptureCallback",
  "addUncaughtExceptionCaptureCallback",
  "hasUncaughtExceptionCaptureCallback",
  "emitWarning",
  "nextTick",
  "_tickCallback",
  "sourceMapsEnabled",
  "setSourceMapsEnabled",
  "getBuiltinModule",
  "_debugProcess",
  "_debugEnd",
  "_startProfilerIdleNotifier",
  "_stopProfilerIdleNotifier",
  "stdout",
  "stdin",
  "stderr",
  "abort",
  "umask",
  "chdir",
  "cwd",
  "initgroups",
  "setgroups",
  "setegid",
  "seteuid",
  "setgid",
  "setuid",
  "env",
  "title",
  "argv",
  "execArgv",
  "pid",
  "ppid",
  "execPath",
  "debugPort",
  "argv0",
  "_eval",
  "_preload_modules",
  "report"
]);

class NodeEnvironmentFlagSet extends Set {
  has(value) {
    if (super.has(value)) return true;
    if (typeof value !== "string") return false;
    return super.has(normalizeNodeEnvironmentFlag(value));
  }
}

export function createProcessBuiltin({ descriptor, kernel, asyncContextManager, getBuiltinModule }) {
  const proc = new EventEmitter();
  const resolveBuiltinModule = getBuiltinModule;
  EventEmitter.init.call(proc);
  proc[EVENT_EMITTER_SHAPE_MODE_SYMBOL] = false;
  proc[EVENT_EMITTER_CAPTURE_SYMBOL] = false;
  Object.defineProperty(proc, Symbol.toStringTag, {
    value: "process",
    writable: true,
    enumerable: false,
    configurable: false
  });
  if (descriptor.evalSource !== undefined) {
    Object.defineProperty(proc, "_eval", {
      value: descriptor.evalSource,
      writable: false,
      enumerable: true,
      configurable: true
    });
  }
  Object.defineProperty(proc, "_preload_modules", {
    value: [],
    writable: false,
    enumerable: true,
    configurable: true
  });
  let processExiting = false;
  Object.defineProperty(proc, "_exiting", {
    enumerable: true,
    configurable: true,
    get: () => processExiting,
    set: (value) => {
      processExiting = value;
    }
  });
  const startNs = nowNs();
  defineReadonlyProcessValue(proc, "pid", descriptor.pid);
  proc.ppid = descriptor.ppid ?? 0;
  Object.defineProperty(proc, "domain", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: null
  });
  proc.argv = [...descriptor.argv];
  Object.defineProperty(proc, "argv0", {
    value: descriptor.argv?.[0] ?? "node",
    writable: false,
    enumerable: true,
    configurable: true
  });
  proc.execPath = "/bin/node";
  proc.execArgv = [];
  proc.env = createProcessEnv(descriptor.env);
  defineReadonlyProcessValue(proc, "platform", "linux");
  defineReadonlyProcessValue(proc, "arch", "x64");
  proc.title = "node";
  defineReadonlyProcessValue(proc, "version", OPENCONTAINERS_PROCESS_VERSION);
  defineReadonlyProcessValue(proc, "versions", createProcessVersions());
  defineReadonlyProcessValue(proc, "release", {
    name: "node",
    sourceUrl: "https://nodejs.org/download/release/",
    headersUrl: "https://nodejs.org/download/release/"
  });
  defineReadonlyProcessValue(proc, "config", Object.freeze({
    variables: Object.freeze({}),
    target_defaults: Object.freeze({})
  }));
  defineReadonlyProcessValue(proc, "features", createProcessFeatures());
  proc.debugPort = 9229;
  defineReadonlyProcessValue(proc, "moduleLoadList", []);
  let sourceMapsEnabled = false;
  Object.defineProperty(proc, "sourceMapsEnabled", {
    enumerable: true,
    configurable: true,
    get: () => sourceMapsEnabled
  });
  let allowedNodeEnvironmentFlags = new NodeEnvironmentFlagSet(ALLOWED_NODE_ENVIRONMENT_FLAGS);
  Object.defineProperty(proc, "allowedNodeEnvironmentFlags", {
    enumerable: true,
    configurable: true,
    get: () => allowedNodeEnvironmentFlags,
    set: (value) => {
      allowedNodeEnvironmentFlags = value;
    }
  });
  Object.defineProperty(proc, "exitCode", {
    enumerable: true,
    configurable: true,
    get: () => descriptor.exitCode,
    set: (code) => {
      descriptor.exitCode = normalizeExitCode(code, { nullish: "clear" });
    }
  });
  Object.defineProperty(proc, "stdin", {
    enumerable: true,
    configurable: true,
    get: function getStdin() {
      return descriptor.stdin;
    }
  });
  Object.defineProperty(proc, "stdout", {
    enumerable: true,
    configurable: true,
    get: function getStdout() {
      return descriptor.stdout;
    }
  });
  Object.defineProperty(proc, "stderr", {
    enumerable: true,
    configurable: true,
    get: function getStderr() {
      return descriptor.stderr;
    }
  });
  markProcessStream(proc.stdin, proc, 0);
  markProcessStream(proc.stdout, proc, 1);
  markProcessStream(proc.stderr, proc, 2);
  proc.cwd = function wrappedCwd() {
    return descriptor.cwd;
  };
  proc.chdir = function wrappedChdir(path) {
    if (typeof path !== "string") {
      throw createInvalidProcessArgTypeError("directory", "string", path);
    }
    const previousCwd = descriptor.cwd;
    const targetPath = kernel.resolvePath(previousCwd, path);
    let stats;
    try {
      stats = kernel.fs.statSync(targetPath);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        throw createProcessChdirError(error.code, previousCwd, targetPath);
      }
      throw error;
    }
    if (!stats.isDirectory()) throw createProcessChdirError("ENOTDIR", previousCwd, targetPath);
    descriptor.cwd = targetPath;
  };
  proc.loadEnvFile = function loadEnvFile(path = ".env") {
    const envPath = normalizeEnvFilePath(path, descriptor.cwd, kernel);
    const source = kernel.fs.readFileSync(envPath, "utf8");
    const parsed = parseDotEnv(source);
    for (const [key, value] of Object.entries(parsed)) {
      if (!Object.hasOwn(proc.env, key)) proc.env[key] = value;
    }
  };
  let umaskValue = 0o022;
  proc.umask = function wrappedUmask(mask) {
    const previous = umaskValue;
    if (mask !== undefined) umaskValue = normalizeUmask(mask);
    return previous;
  };
  const getuid = () => 1000;
  const getgid = () => 1000;
  const geteuid = () => 1000;
  const getegid = () => 1000;
  const getgroups = () => [1000];
  alignProcessFunctionMetadata(getuid, "getuid", 0);
  alignProcessFunctionMetadata(getgid, "getgid", 0);
  alignProcessFunctionMetadata(geteuid, "geteuid", 0);
  alignProcessFunctionMetadata(getegid, "getegid", 0);
  alignProcessFunctionMetadata(getgroups, "getgroups", 0);
  proc.getuid = getuid;
  proc.getgid = getgid;
  proc.geteuid = geteuid;
  proc.getegid = getegid;
  proc.getgroups = getgroups;
  proc.setuid = function(_id) {
    throw createUnsupportedProcessError("process.setuid");
  };
  proc.setgid = function(_id) {
    throw createUnsupportedProcessError("process.setgid");
  };
  proc.seteuid = function(_id) {
    throw createUnsupportedProcessError("process.seteuid");
  };
  proc.setegid = function(_id) {
    throw createUnsupportedProcessError("process.setegid");
  };
  proc.setgroups = function setgroups(_groups) {
    throw createUnsupportedProcessError("process.setgroups");
  };
  proc.initgroups = function initgroups(_user, _extraGroup) {
    throw createUnsupportedProcessError("process.initgroups");
  };
  alignProcessFunctionMetadata(proc.setuid, "", 1);
  alignProcessFunctionMetadata(proc.setgid, "", 1);
  alignProcessFunctionMetadata(proc.seteuid, "", 1);
  alignProcessFunctionMetadata(proc.setegid, "", 1);
  const dlopen = () => {
    throw createUnsupportedProcessError("process.dlopen");
  };
  Object.defineProperty(dlopen, "name", { configurable: true, value: "dlopen" });
  proc.dlopen = dlopen;
  proc.binding = function binding(name) {
    throw createUnsupportedProcessError(`process.binding(${JSON.stringify(String(name))})`);
  };
  proc._linkedBinding = function _linkedBinding(name) {
    throw createUnsupportedProcessError(`process._linkedBinding(${JSON.stringify(String(name))})`);
  };
  const debugProcess = () => {
    throw createUnsupportedProcessError("process._debugProcess");
  };
  Object.defineProperty(debugProcess, "name", { configurable: true, value: "_debugProcess" });
  proc._debugProcess = debugProcess;
  const debugEnd = () => {};
  Object.defineProperty(debugEnd, "name", { configurable: true, value: "_debugEnd" });
  proc._debugEnd = debugEnd;
  proc._getActiveHandles = () => [];
  alignProcessFunctionMetadata(proc._getActiveHandles, "_getActiveHandles", 0);
  proc._getActiveRequests = () => [];
  alignProcessFunctionMetadata(proc._getActiveRequests, "_getActiveRequests", 0);
  proc._rawDebug = function _rawDebug(...args) {
    descriptor.stderr.write(`${args.map(String).join(" ")}\n`);
  };
  proc._tickCallback = function runNextTicks() {};
  proc._startProfilerIdleNotifier = () => {};
  proc._stopProfilerIdleNotifier = () => {};
  proc.openStdin = function() {
    return proc.stdin;
  };
  Object.defineProperty(proc.openStdin, "name", { configurable: true, value: "" });
  proc.ref = function ref(maybeRefable) {
    const ref = maybeRefable?.[PROCESS_REF_SYMBOL] ?? maybeRefable?.ref;
    if (typeof ref === "function") ref.call(maybeRefable);
  };
  proc.unref = function unref(maybeRefable) {
    const unref = maybeRefable?.[PROCESS_UNREF_SYMBOL] ?? maybeRefable?.unref;
    if (typeof unref === "function") unref.call(maybeRefable);
  };
  proc.reallyExit = (code = undefined) => proc.exit(code);
  alignProcessFunctionMetadata(proc.reallyExit, "reallyExit", 0);
  const abort = () => {
    throw createUnsupportedProcessError("process.abort");
  };
  Object.defineProperty(abort, "name", { configurable: true, value: "abort" });
  proc.abort = abort;
  proc.execve = function execve(execPath) {
    validateExecveArguments(execPath, arguments.length > 1 ? arguments[1] : undefined, arguments.length > 2 ? arguments[2] : undefined);
    throw createUnsupportedProcessError("process.execve");
  };
  let uncaughtExceptionCaptureCallback = null;
  proc._fatalException = {
    _fatalException(error, fromPromise) {
      if (typeof uncaughtExceptionCaptureCallback === "function") {
        uncaughtExceptionCaptureCallback(error, Boolean(fromPromise));
        return true;
      }
      return proc.emit("uncaughtException", error, Boolean(fromPromise));
    }
  }._fatalException;
  Object.defineProperty(proc._fatalException, "name", { configurable: true, value: "" });
  proc.setUncaughtExceptionCaptureCallback = function setUncaughtExceptionCaptureCallback(callback) {
    if (callback !== null && typeof callback !== "function") {
      throw createInvalidProcessArgTypeError("fn", "function or null", callback);
    }
    if (callback !== null && uncaughtExceptionCaptureCallback !== null) {
      throw Object.assign(new Error("`process.setupUncaughtExceptionCapture()` was called while a capture callback was already active"), {
        code: "ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET"
      });
    }
    uncaughtExceptionCaptureCallback = callback;
  };
  proc.hasUncaughtExceptionCaptureCallback = function hasUncaughtExceptionCaptureCallback() {
    return typeof uncaughtExceptionCaptureCallback === "function";
  };
  proc.addUncaughtExceptionCaptureCallback = function addUncaughtExceptionCaptureCallback(callback) {
    if (typeof callback !== "function") throw createInvalidProcessArgTypeError("fn", "function", callback);
    proc.on("uncaughtException", callback);
  };
  proc.exit = function(code = undefined) {
    const exitCode = arguments.length === 0
      ? normalizeExitCode(descriptor.exitCode ?? 0)
      : normalizeExitCode(code);
    descriptor.exitCode = exitCode;
    proc._exiting = true;
    proc.emit("exit", exitCode);
    throw Object.assign(new Error(`Process exited with code ${code}`), {
      code: "OPENCONTAINERS_PROCESS_EXIT",
      exitCode
    });
  };
  alignProcessFunctionMetadata(proc.exit, "exit", 1);
  proc.nextTick = function nextTick(callback, ...args) {
    if (typeof callback !== "function") {
      throw createInvalidProcessArgTypeError("callback", "function", callback);
    }
    const wrapped = asyncContextManager?.bind(callback) ?? callback;
    queueMicrotask(() => wrapped(...args));
  };
  proc.kill = function kill(pid, signal) {
    validateProcessPid(pid);
    const normalizedSignal = normalizeProcessSignal(arguments.length > 1 ? signal : "SIGTERM");
    if (normalizedSignal === 0) {
      if (kernel.hasProcess?.(pid)) return true;
      throw createProcessSystemError("ESRCH", -3);
    }
    if (pid === descriptor.pid && deliverSignalToCurrentProcess(proc, descriptor, normalizedSignal)) {
      return true;
    }
    if (!kernel.kill(pid, normalizedSignal)) throw createProcessSystemError("ESRCH", -3);
    if (pid === descriptor.pid) {
      throw Object.assign(new Error(`Process killed by ${normalizedSignal}`), {
        code: "OPENCONTAINERS_PROCESS_EXIT",
        exitCode: signalExitCode(normalizedSignal)
      });
    }
    return true;
  };
  alignProcessFunctionMetadata(proc.kill, "kill", 2);
  proc._kill = {
    _kill() {
      return proc.kill(arguments[0], arguments.length > 1 ? arguments[1] : undefined);
    }
  }._kill;
  proc.emitWarning = function emitWarning(warning, typeOrOptions, code, ctor) {
    const warningObject = createProcessWarning(warning, typeOrOptions, code, ctor);
    const hadListeners = proc.listenerCount("warning") > 0;
    proc.emit("warning", warningObject);
    if (!hadListeners) descriptor.stderr.write(`${formatProcessWarning(warningObject, proc.pid)}\n`);
  };
  alignProcessFunctionMetadata(proc.emitWarning, "emitWarning", 4);
  proc.uptime = () => Number(nowNs() - startNs) / 1e9;
  alignProcessFunctionMetadata(proc.uptime, "uptime", 0);
  proc.hrtime = function hrtime(previous) {
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
  proc.hrtime.bigint = function hrtimeBigInt() {
    return nowNs() - startNs;
  };
  proc.memoryUsage = function memoryUsage() {
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
  alignProcessFunctionMetadata(proc.memoryUsage.rss, "rss", 0);
  proc.availableMemory = () => {
    const memory = proc.memoryUsage();
    return Math.max(0, Number(memory.rss ?? 0) - Number(memory.heapUsed ?? 0));
  };
  alignProcessFunctionMetadata(proc.availableMemory, "availableMemory", 0);
  proc.constrainedMemory = () => 0;
  alignProcessFunctionMetadata(proc.constrainedMemory, "constrainedMemory", 0);
  proc.cpuUsage = function cpuUsage(previous) {
    const usage = { user: Math.floor(proc.uptime() * 1000000), system: 0 };
    const previousUsage = normalizeCpuUsagePrevious(previous);
    if (previousUsage) {
      return {
        user: usage.user - previousUsage.user,
        system: usage.system - previousUsage.system
      };
    }
    return usage;
  };
  proc.threadCpuUsage = function threadCpuUsage(previous) {
    return proc.cpuUsage(previous);
  };
  proc.resourceUsage = function resourceUsage() {
    return {
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
    };
  };
  proc.getActiveResourcesInfo = () => {
    const resources = [];
    if (descriptor.refCount > 0) resources.push("OpenContainersHandle");
    return resources;
  };
  alignProcessFunctionMetadata(proc.getActiveResourcesInfo, "getActiveResourcesInfo", 0);
  proc.setSourceMapsEnabled = function setSourceMapsEnabled(enabled) {
    if (typeof enabled !== "boolean") {
      throw createInvalidProcessArgTypeError("enabled", "boolean", enabled);
    }
    sourceMapsEnabled = enabled;
  };
  proc.getBuiltinModule = function getBuiltinModule(specifier) {
    if (typeof resolveBuiltinModule !== "function") return undefined;
    if (typeof specifier !== "string") {
      throw createInvalidProcessArgTypeError("id", "string", specifier);
    }
    return resolveBuiltinModule(specifier) ?? undefined;
  };
  const reportObject = {
    directory: "",
    filename: "",
    compact: false,
    excludeEnv: false,
    excludeNetwork: false,
    signal: "SIGUSR2",
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport(error) {
      const now = new Date();
      const header = {
        reportVersion: 5,
        event: "JavaScript API",
        trigger: "GetReport",
        filename: reportObject.filename,
        dumpEventTime: now.toISOString(),
        dumpEventTimeStamp: now.getTime(),
        processId: proc.pid,
        threadId: 0,
        cwd: proc.cwd(),
        commandLine: [...proc.argv],
        nodejsVersion: proc.version,
        wordSize: 64,
        arch: proc.arch,
        platform: proc.platform,
        componentVersions: { ...proc.versions },
        release: { ...proc.release },
        osName: "OpenContainers",
        osRelease: proc.versions.opencontainers,
        osVersion: proc.versions.opencontainers,
        osMachine: proc.arch,
        cpus: [],
        host: "opencontainers"
      };
      if (!reportObject.excludeNetwork) header.networkInterfaces = [];

      const report = {
        header,
        javascriptStack: error
          ? { message: error.message, stack: String(error.stack ?? error.message ?? error), errorProperties: {} }
          : { message: "", stack: "", errorProperties: {} },
        javascriptHeap: proc.memoryUsage(),
        resourceUsage: proc.resourceUsage(),
        uvthreadResourceUsage: {
          userCPUTime: 0,
          systemCPUTime: 0,
          cpuConsumptionPercent: 0,
          userCpuConsumptionPercent: 0,
          kernelCpuConsumptionPercent: 0,
          fsActivity: { reads: 0, writes: 0 }
        },
        nativeStack: [],
        libuv: [],
        workers: [],
        userLimits: {
          core_file_size_blocks: "unlimited",
          data_seg_size_bytes: "unlimited",
          file_size_blocks: "unlimited",
          max_locked_memory_bytes: "unlimited",
          max_memory_size_bytes: "unlimited",
          open_files: "unlimited",
          stack_size_bytes: "unlimited",
          cpu_time_seconds: "unlimited",
          max_user_processes: "unlimited",
          virtual_memory_bytes: "unlimited"
        },
        sharedObjects: []
      };
      if (!reportObject.excludeEnv) report.environmentVariables = { ...proc.env };
      return report;
    },
    writeReport(filename) {
      const target = filename || `report.${Date.now()}.${proc.pid}.json`;
      kernel.fs.writeFileSync(kernel.resolvePath(proc.cwd(), target), JSON.stringify(reportObject.getReport(), null, 2));
      return target;
    }
  };
  Object.defineProperty(proc, "report", {
    enumerable: true,
    configurable: true,
    get: () => reportObject
  });
  const finalizationCallbacks = new WeakMap();
  let finalization = {
    register(ref, callback) {
      validateFinalizationRef(ref);
      if (typeof callback !== "function") throw new TypeError("The callback argument must be of type function");
      finalizationCallbacks.set(ref, callback);
    },
    registerBeforeExit(ref, callback) {
      validateFinalizationRef(ref);
      if (typeof callback !== "function") throw new TypeError("The callback argument must be of type function");
      finalizationCallbacks.set(ref, callback);
    },
    unregister(ref) {
      if ((typeof ref !== "object" && typeof ref !== "function") || ref === null) return;
      finalizationCallbacks.delete(ref);
    }
  };
  Object.defineProperty(proc, "finalization", {
    enumerable: true,
    configurable: true,
    get: () => finalization,
    set: (value) => {
      finalization = value;
    }
  });
  descriptor.refCount ??= 0;
  descriptor.cleanupTasks ??= new Set();
  const openContainersInternals = {
    __opencontainersNetworkAllowlist: Object.freeze([...(descriptor.externalNetworkAllowlist ?? [])]),
    __opencontainersArgvParseStart: descriptor.argvParseStart ?? 2,
    __opencontainersAddRef: () => {
      descriptor.refCount++;
    },
    __opencontainersUnref: () => {
      descriptor.refCount = Math.max(0, descriptor.refCount - 1);
      if (descriptor.refCount === 0) {
        queueMicrotask(() => {
          if (descriptor.refCount === 0) descriptor.onIdle?.();
        });
      }
    },
    __opencontainersOnExit: (cleanup) => {
      descriptor.cleanupTasks.add(cleanup);
      return () => descriptor.cleanupTasks.delete(cleanup);
    },
    __opencontainersIsAlive: () => descriptor.status !== "exited" && descriptor.status !== "killed"
  };
  installOpenContainersProcessInternals(proc, openContainersInternals);
  installIpcChannel(proc, descriptor);
  reorderProcessExports(proc);
  const argv0Descriptor = Object.getOwnPropertyDescriptor(proc, "argv0");
  Object.defineProperty(proc, "argv0", {
    ...argv0Descriptor,
    configurable: false
  });
  const featuresDescriptor = Object.getOwnPropertyDescriptor(proc, "features");
  Object.defineProperty(proc, "features", {
    ...featuresDescriptor,
    configurable: false
  });
  const exitCodeDescriptor = Object.getOwnPropertyDescriptor(proc, "exitCode");
  Object.defineProperty(proc, "exitCode", {
    ...exitCodeDescriptor,
    configurable: false
  });
  return proc;
}

export function installProcessDomainAccessor(proc, getActiveDomain) {
  let assignedDomain;
  let domainAssigned = false;
  Object.defineProperty(proc, "domain", {
    enumerable: true,
    configurable: true,
    get: function get() {
      return domainAssigned ? assignedDomain : getActiveDomain?.();
    },
    set: function set(value) {
      domainAssigned = true;
      assignedDomain = value;
    }
  });
}

function defineReadonlyProcessValue(proc, name, value, options = {}) {
  Object.defineProperty(proc, name, {
    configurable: options.configurable ?? true,
    enumerable: true,
    writable: false,
    value
  });
}

function createProcessVersions() {
  const versions = {};
  for (const [key, value] of Object.entries(OPENCONTAINERS_VERSIONS)) {
    Object.defineProperty(versions, key, {
      configurable: true,
      enumerable: true,
      writable: false,
      value
    });
  }
  return versions;
}

function createProcessEnv(env) {
  return new Proxy(env, {
    set(target, property, value) {
      target[coerceProcessEnvKey(property)] = coerceProcessEnvValue(value);
      return true;
    },
    defineProperty(target, property, descriptor) {
      const key = coerceProcessEnvKey(property);
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        throw createInvalidProcessEnvDefinePropertyError("'process.env' does not accept an accessor(getter/setter) descriptor");
      }
      if (!Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.enumerable !== true || descriptor.configurable !== true || descriptor.writable !== true) {
        throw createInvalidProcessEnvDefinePropertyError("'process.env' only accepts a configurable, writable, and enumerable data descriptor");
      }
      Object.defineProperty(target, key, {
        value: coerceProcessEnvValue(descriptor.value),
        enumerable: true,
        configurable: true,
        writable: true
      });
      return true;
    }
  });
}

function coerceProcessEnvKey(property) {
  if (typeof property === "symbol") throw new TypeError("Cannot convert a Symbol value to a string");
  return String(property);
}

function coerceProcessEnvValue(value) {
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol value to a string");
  return String(value);
}

function createInvalidProcessEnvDefinePropertyError(message) {
  return Object.assign(new TypeError(message), {
    code: "ERR_INVALID_OBJECT_DEFINE_PROPERTY"
  });
}

function createProcessFeatures() {
  const features = {
    inspector: true,
    debug: false,
    uv: true,
    ipv6: true,
    tls_alpn: true,
    tls_sni: true,
    tls_ocsp: true,
    tls: true,
    openssl_is_boringssl: false,
    get cached_builtins() {
      return true;
    },
    get require_module() {
      return true;
    },
    get quic() {
      return false;
    }
  };
  Object.defineProperty(features, "typescript", {
    configurable: true,
    enumerable: true,
    get: function get() {
      return "strip";
    }
  });
  return features;
}

function reorderProcessExports(proc) {
  const descriptors = [];
  for (const key of PROCESS_EXPORT_ORDER) {
    const descriptor = Object.getOwnPropertyDescriptor(proc, key);
    if (descriptor?.enumerable) descriptors.push([key, descriptor]);
  }
  for (const [key] of descriptors) delete proc[key];
  for (const [key, descriptor] of descriptors) Object.defineProperty(proc, key, descriptor);
}

function alignProcessFunctionMetadata(fn, name, length) {
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: name
  });
  Object.defineProperty(fn, "length", {
    configurable: true,
    value: length
  });
}

function installOpenContainersProcessInternals(proc, internals) {
  const internalPrototype = Object.create(Object.getPrototypeOf(proc));
  for (const [name, value] of Object.entries(internals)) {
    Object.defineProperty(internalPrototype, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value
    });
  }
  Object.setPrototypeOf(proc, internalPrototype);
}

function createUnsupportedProcessError(api) {
  return Object.assign(new Error(`${api} is not supported in OpenContainers`), {
    code: "ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED"
  });
}

function validateExecveArguments(execPath, args, env) {
  if (typeof execPath !== "string") {
    throw createInvalidProcessArgTypeError("execPath", "string", execPath);
  }
  if (args !== undefined && !Array.isArray(args)) {
    throw createInvalidProcessArgInstanceError("args", "Array", args);
  }
  for (const [index, value] of (args ?? []).entries()) {
    if (typeof value !== "string" || value.includes("\0")) {
      throw createInvalidExecveStringValueError(`args[${index}]`, value);
    }
  }
  if (env !== undefined) {
    if ((typeof env !== "object" && typeof env !== "function") || env === null || Array.isArray(env)) {
      throw createInvalidProcessArgTypeError("env", "object", env);
    }
    for (const [key, value] of Object.entries(env)) {
      if (typeof key !== "string" || key.includes("\0") || typeof value !== "string" || value.includes("\0")) {
        throw createInvalidExecveEnvValueError(env);
      }
    }
  }
}

function createInvalidProcessArgInstanceError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be an instance of ${expected}. Received ${formatProcessReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidProcessArgTypeError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" argument must be of type ${expected}. Received ${formatProcessReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidProcessPropertyTypeError(name, expected, value) {
  return Object.assign(new TypeError(`The "${name}" property must be of type ${expected}. Received ${formatProcessReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createInvalidProcessPropertyValueError(name, value) {
  return Object.assign(new RangeError(`The property '${name}' is invalid. Received ${value}`), {
    code: "ERR_INVALID_ARG_VALUE"
  });
}

function normalizeCpuUsagePrevious(previous) {
  if (previous === undefined || previous === null) return null;
  if (typeof previous !== "object" || Array.isArray(previous)) {
    throw createInvalidProcessArgTypeError("prevValue", "object", previous);
  }
  return {
    user: validateCpuUsagePreviousNumber(previous, "user"),
    system: validateCpuUsagePreviousNumber(previous, "system")
  };
}

function validateCpuUsagePreviousNumber(previous, name) {
  const value = previous[name];
  if (typeof value !== "number") {
    throw createInvalidProcessPropertyTypeError(`prevValue.${name}`, "number", value);
  }
  if (!Number.isFinite(value) || value < 0) {
    throw createInvalidProcessPropertyValueError(`prevValue.${name}`, value);
  }
  return value;
}

function createInvalidExecveStringValueError(name, value) {
  return Object.assign(new TypeError(`The argument '${name}' must be a string without null bytes. Received ${formatProcessReceived(value)}`), {
    code: "ERR_INVALID_ARG_VALUE"
  });
}

function createInvalidExecveEnvValueError(value) {
  return Object.assign(new TypeError(`The argument 'env' must be an object with string keys and values without null bytes. Received ${formatProcessReceived(value)}`), {
    code: "ERR_INVALID_ARG_VALUE"
  });
}

function formatProcessReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\0", "\\x00")}')`;
  if (typeof value === "number") return `type number (${value})`;
  if (typeof value === "bigint") return `type bigint (${value}n)`;
  if (typeof value === "boolean") return `type boolean (${value})`;
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  if (Array.isArray(value)) return "an instance of Array";
  if (typeof value === "object") return formatProcessObjectReceived(value);
  return `type ${typeof value}`;
}

function formatProcessObjectReceived(value) {
  const entries = Object.entries(value);
  if (entries.length && entries.length <= 4) {
    return `{ ${entries.map(([key, entry]) => `${formatProcessObjectKey(key)}: ${formatProcessObjectValue(entry)}`).join(", ")} }`;
  }
  return `an instance of ${value?.constructor?.name ?? "Object"}`;
}

function formatProcessObjectKey(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? key
    : `'${String(key).replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\0", "\\x00")}'`;
}

function formatProcessObjectValue(value) {
  if (typeof value === "string") return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\0", "\\x00")}'`;
  if (typeof value === "bigint") return `${value}n`;
  return String(value);
}

function normalizeExitCode(code, { nullish = "zero" } = {}) {
  if (code === undefined || code === null) {
    return nullish === "clear" ? undefined : 0;
  }
  let number;
  if (typeof code === "string") {
    if (code.trim() === "") throw createInvalidExitCodeTypeError(code);
    number = Number(code);
    if (Number.isNaN(number)) throw createInvalidExitCodeTypeError(code);
  } else if (typeof code === "number") {
    number = code;
  } else {
    throw createInvalidExitCodeTypeError(code);
  }
  if (!Number.isInteger(number)) {
    throw Object.assign(new RangeError(`The value of "code" is out of range. It must be an integer. Received ${number}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return number | 0;
}

function createInvalidExitCodeTypeError(value) {
  return Object.assign(new TypeError(`The "code" argument must be of type number. Received ${formatExitCodeReceived(value)}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function formatExitCodeReceived(value) {
  if (typeof value === "string") return `type string ('${value.replaceAll("'", "\\'")}')`;
  if (typeof value === "bigint") return `type bigint (${value}n)`;
  if (typeof value === "symbol") return `type symbol (${String(value)})`;
  if (value !== null && typeof value === "object") {
    return `an instance of ${value?.constructor?.name ?? "Object"}`;
  }
  return `type ${typeof value} (${String(value)})`;
}

function normalizeUmask(mask) {
  if (typeof mask === "string") {
    if (!/^[0-7]+$/.test(mask)) {
      throw Object.assign(new TypeError(`The argument 'mask' must be a 32-bit unsigned integer or an octal string. Received ${JSON.stringify(mask)}`), {
        code: "ERR_INVALID_ARG_VALUE"
      });
    }
    return parseInt(mask, 8) & 0o7777;
  }
  if (typeof mask !== "number") {
    throw createInvalidProcessArgTypeError("mask", "number", mask === null ? undefined : mask);
  }
  if (!Number.isInteger(mask) || mask < 0 || mask > 0xffffffff) {
    throw Object.assign(new RangeError(`The value of "mask" is out of range. It must be >= 0 && <= 4294967295. Received ${mask}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  return mask & 0o7777;
}

function validateProcessPid(pid) {
  if (typeof pid !== "number" || !Number.isInteger(pid)) {
    throw Object.assign(new TypeError(`The "pid" argument must be of type number. Received type ${typeof pid}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
}

function normalizeProcessSignal(signal) {
  if (signal === undefined || signal === null) return "SIGTERM";
  if (signal === 0) return 0;
  if (typeof signal === "number") {
    if (!Number.isInteger(signal)) {
      throw Object.assign(new TypeError("The \"signal\" argument must be a valid integer signal"), {
        code: "ERR_INVALID_ARG_TYPE"
      });
    }
    const mappedSignal = SIGNAL_NUMBERS.get(signal);
    if (!mappedSignal) throw createProcessSystemError("EINVAL", -22);
    return mappedSignal;
  }
  if (typeof signal === "string") {
    if (SIGNAL_NAMES.has(signal)) return signal;
    throw Object.assign(new TypeError(`Unknown signal: ${signal}`), {
      code: "ERR_UNKNOWN_SIGNAL"
    });
  }
  throw Object.assign(new TypeError(`The "signal" argument must be of type string or number. Received type ${typeof signal}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function deliverSignalToCurrentProcess(proc, descriptor, signal) {
  if (signal === "SIGKILL" || signal === "SIGSTOP" || proc.listenerCount(signal) === 0) return false;
  descriptor.refCount = (descriptor.refCount ?? 0) + 1;
  queueMicrotask(() => {
    queueMicrotask(() => {
      try {
        if (descriptor.status !== "exited" && descriptor.status !== "killed") proc.emit(signal);
      } catch (error) {
        if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") {
          descriptor.exitCode = error.exitCode;
        } else {
          descriptor.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
          descriptor.exitCode = 1;
        }
      } finally {
        descriptor.refCount = Math.max(0, (descriptor.refCount ?? 0) - 1);
        if (descriptor.refCount === 0) queueMicrotask(() => descriptor.onIdle?.());
      }
    });
  });
  return true;
}

function signalExitCode(signal) {
  for (const [number, name] of SIGNAL_NUMBERS) {
    if (name === signal) return 128 + number;
  }
  return 143;
}

function createProcessSystemError(code, errno) {
  return Object.assign(new Error(`kill ${code}`), {
    code,
    errno,
    syscall: "kill"
  });
}

function createProcessChdirError(code, previousCwd, targetPath) {
  const errno = code === "ENOENT" ? -2 : -20;
  const reason = code === "ENOENT" ? "no such file or directory" : "not a directory";
  return Object.assign(new Error(`${code}: ${reason}, chdir '${previousCwd}' -> '${targetPath}'`), {
    code,
    errno,
    syscall: "chdir",
    path: previousCwd
  });
}

function normalizeNodeEnvironmentFlag(value) {
  const flag = String(value);
  const equalsIndex = flag.indexOf("=");
  const name = equalsIndex === -1 ? flag : flag.slice(0, equalsIndex);
  if (name.startsWith("--")) return name.replace(/_/g, "-");
  return name;
}

function normalizeEnvFilePath(path, cwd, kernel) {
  if (path && typeof path === "object" && typeof path.protocol === "string" && typeof path.pathname === "string") {
    if (path.protocol !== "file:") {
      throw Object.assign(new TypeError("The URL must be of scheme file"), { code: "ERR_INVALID_URL_SCHEME" });
    }
    return decodeURIComponent(path.pathname || "/");
  }
  if (ArrayBuffer.isView(path)) {
    const view = new Uint8Array(path.buffer, path.byteOffset, path.byteLength);
    return kernel.resolvePath(cwd, new TextDecoder().decode(view));
  }
  if (typeof path !== "string") {
    throw Object.assign(new TypeError(`The "path" argument must be of type string or an instance of Buffer or URL. Received type ${typeof path}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return kernel.resolvePath(cwd, path);
}

function parseDotEnv(source) {
  const parsed = {};
  const lines = String(source).replace(/^\uFEFF/, "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    let line = lines[index];
    let trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trimStart();

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key) continue;

    let value = trimmed.slice(equalsIndex + 1).trimStart();
    if (value.startsWith("'") || value.startsWith("\"")) {
      const quote = value[0];
      let body = value.slice(1);
      while (!hasClosingQuote(body, quote) && index < lines.length - 1) {
        index++;
        body += `\n${lines[index]}`;
      }
      const closeIndex = closingQuoteIndex(body, quote);
      const quoted = closeIndex === -1 ? body : body.slice(0, closeIndex);
      parsed[key] = quote === "\"" ? unescapeDoubleQuotedEnvValue(quoted) : quoted;
      continue;
    }

    parsed[key] = stripInlineEnvComment(value).trimEnd();
  }

  return parsed;
}

function stripInlineEnvComment(value) {
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index);
    }
  }
  return value;
}

function hasClosingQuote(value, quote) {
  return closingQuoteIndex(value, quote) !== -1;
}

function closingQuoteIndex(value, quote) {
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== quote) continue;
    if (quote === "\"" && isEscaped(value, index)) continue;
    return index;
  }
  return -1;
}

function isEscaped(value, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor--) slashCount++;
  return slashCount % 2 === 1;
}

function unescapeDoubleQuotedEnvValue(value) {
  return value.replace(/\\([nrt"\\])/g, (_, escaped) => {
    switch (escaped) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "\"":
        return "\"";
      case "\\":
        return "\\";
      default:
        return escaped;
    }
  });
}

function installIpcChannel(proc, descriptor) {
  const ipc = descriptor.ipc;
  if (!ipc) return;

  let ipcRefed = false;
  let disconnected = false;
  const refIpc = () => {
    if (ipcRefed || disconnected) return;
    ipcRefed = true;
    proc.__opencontainersAddRef?.();
  };
  const unrefIpc = () => {
    if (!ipcRefed) return;
    ipcRefed = false;
    proc.__opencontainersUnref?.();
  };
  const maybeRefForEvent = (eventName) => {
    if (eventName === "message" || eventName === "disconnect") refIpc();
  };
  const maybeUnrefForEvent = () => {
    if (proc.listenerCount("message") === 0 && proc.listenerCount("disconnect") === 0) unrefIpc();
  };

  const originalOn = proc.on.bind(proc);
  const originalAddListener = proc.addListener.bind(proc);
  const originalPrependListener = proc.prependListener.bind(proc);
  const originalOnce = proc.once.bind(proc);
  const originalPrependOnceListener = proc.prependOnceListener.bind(proc);
  const originalOff = proc.off.bind(proc);
  const originalRemoveListener = proc.removeListener.bind(proc);
  const originalRemoveAllListeners = proc.removeAllListeners.bind(proc);

  proc.on = (eventName, listener) => {
    const result = originalOn(eventName, listener);
    maybeRefForEvent(eventName);
    return result;
  };
  proc.addListener = (eventName, listener) => {
    const result = originalAddListener(eventName, listener);
    maybeRefForEvent(eventName);
    return result;
  };
  proc.prependListener = (eventName, listener) => {
    const result = originalPrependListener(eventName, listener);
    maybeRefForEvent(eventName);
    return result;
  };
  proc.once = (eventName, listener) => {
    const result = originalOnce(eventName, listener);
    maybeRefForEvent(eventName);
    return result;
  };
  proc.prependOnceListener = (eventName, listener) => {
    const result = originalPrependOnceListener(eventName, listener);
    maybeRefForEvent(eventName);
    return result;
  };
  proc.off = (eventName, listener) => {
    const result = originalOff(eventName, listener);
    if (eventName === "message" || eventName === "disconnect") maybeUnrefForEvent();
    return result;
  };
  proc.removeListener = (eventName, listener) => {
    const result = originalRemoveListener(eventName, listener);
    if (eventName === "message" || eventName === "disconnect") maybeUnrefForEvent();
    return result;
  };
  proc.removeAllListeners = (eventName) => {
    const result = originalRemoveAllListeners(eventName);
    if (eventName === undefined || eventName === "message" || eventName === "disconnect") maybeUnrefForEvent();
    return result;
  };

  proc.connected = true;
  proc.channel = {
    ref: refIpc,
    unref: unrefIpc
  };
  proc.send = (message, sendHandle, options, callback) => {
    const sendArgs = normalizeIpcSendArgs(sendHandle, options, callback);
    if (sendArgs.error) {
      sendArgs.callback?.(sendArgs.error);
      throw sendArgs.error;
    }
    if (!proc.connected || disconnected) {
      const error = createIpcClosedError();
      sendArgs.callback?.(error);
      return false;
    }
    const cloned = cloneIpcMessage(message);
    if (cloned.error) {
      sendArgs.callback?.(cloned.error);
      throw cloned.error;
    }
    ipc.sendToParent?.(cloned.value, sendArgs.callback);
    return true;
  };
  proc.disconnect = () => {
    if (!proc.connected || disconnected) return;
    disconnected = true;
    proc.connected = false;
    unrefIpc();
    ipc.disconnectFromChild?.();
    proc.emit("disconnect");
  };

  ipc.deliverToChild = (message) => {
    if (!proc.connected || disconnected) return false;
    proc.emit("message", cloneIpcMessage(message).value);
    return true;
  };
  ipc.disconnectFromParent = () => {
    if (!proc.connected || disconnected) return;
    disconnected = true;
    proc.connected = false;
    unrefIpc();
    proc.emit("disconnect");
  };
  const queuedMessages = ipc.pendingToChild ?? [];
  ipc.pendingToChild = [];
  for (const message of queuedMessages) ipc.deliverToChild(message);

  descriptor.cleanupTasks.add(() => {
    if (proc.connected && !disconnected) {
      disconnected = true;
      proc.connected = false;
      ipc.disconnectFromChild?.();
    }
    unrefIpc();
  });
}

function normalizeIpcSendArgs(sendHandle, options, callback) {
  let cb = callback;
  let handle = sendHandle;
  if (typeof handle === "function") {
    cb = handle;
    handle = undefined;
  } else if (typeof options === "function") {
    cb = options;
  }
  if (handle !== undefined && handle !== null) {
    return {
      callback: cb,
      error: Object.assign(new Error("IPC handle passing is not supported in OpenContainers V1"), {
        code: "ERR_OPENCONTAINERS_IPC_HANDLE_UNSUPPORTED"
      })
    };
  }
  return { callback: cb };
}

function createIpcClosedError() {
  return Object.assign(new Error("IPC channel is closed"), {
    code: "ERR_IPC_CHANNEL_CLOSED"
  });
}

function cloneIpcMessage(message) {
  if (typeof structuredClone === "function") {
    try {
      return { value: structuredClone(message) };
    } catch (error) {
      return {
        error: Object.assign(new Error(`IPC message could not be cloned: ${error?.message ?? error}`), {
          code: "ERR_OPENCONTAINERS_IPC_SERIALIZATION"
        })
      };
    }
  }
  try {
    return { value: message === undefined ? undefined : JSON.parse(JSON.stringify(message)) };
  } catch (error) {
    return {
      error: Object.assign(new Error(`IPC message could not be serialized: ${error?.message ?? error}`), {
        code: "ERR_OPENCONTAINERS_IPC_SERIALIZATION"
      })
    };
  }
}

function validateFinalizationRef(ref) {
  if ((typeof ref !== "object" && typeof ref !== "function") || ref === null) {
    throw new TypeError("The ref argument must be an object");
  }
}

function createProcessWarning(warning, typeOrOptions, code, ctor) {
  if (warning instanceof Error) {
    if (typeOrOptions && typeof typeOrOptions === "object") {
      if (typeOrOptions.type && !warning.name) warning.name = String(typeOrOptions.type);
      if (typeOrOptions.code !== undefined) warning.code = String(typeOrOptions.code);
      if (typeOrOptions.detail !== undefined) warning.detail = String(typeOrOptions.detail);
    } else {
      if (typeOrOptions && warning.name === "Error") warning.name = String(typeOrOptions);
      if (code !== undefined) warning.code = String(code);
    }
    return warning;
  }

  const options = typeOrOptions && typeof typeOrOptions === "object" ? typeOrOptions : {};
  const name = options.type ?? (typeof typeOrOptions === "string" ? typeOrOptions : "Warning");
  const warningObject = new Error(String(warning));
  warningObject.name = String(name || "Warning");
  const warningCode = options.code ?? code;
  if (warningCode !== undefined) warningObject.code = String(warningCode);
  if (options.detail !== undefined) warningObject.detail = String(options.detail);
  const stackCtor = options.ctor ?? ctor;
  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(warningObject, typeof stackCtor === "function" ? stackCtor : createProcessWarning);
  }
  return warningObject;
}

function formatProcessWarning(warning, pid) {
  const code = warning.code ? `[${warning.code}] ` : "";
  const header = `(node:${pid}) ${code}${warning.name}: ${warning.message}`;
  const detail = warning.detail ? `\n${warning.detail}` : "";
  return `${header}${detail}`;
}

function nowNs() {
  if (typeof globalThis.performance?.now === "function") {
    return BigInt(Math.floor(globalThis.performance.now() * 1000000));
  }
  return BigInt(Date.now()) * 1000000n;
}

function markProcessStream(stream, process, fd) {
  if (!stream || typeof stream !== "object") return;
  if (stream.__opencontainersWorkerStdio !== true) {
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
  }
  stream.__opencontainersProcess = process;
}
