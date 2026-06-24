import { dirname, resolvePath } from "../../fs/src/path-utils.js";
import { ModuleLoader } from "./module-loader.js";

export class NodeRuntime {
  constructor({ kernel, descriptor }) {
    this.kernel = kernel;
    this.descriptor = descriptor;
    this.console = this.createConsole();
    this.loader = new ModuleLoader({ kernel, descriptor, console: this.console });
  }

  createConsole() {
    const timers = new Map();
    const counts = new Map();
    let groupDepth = 0;
    const now = () => globalThis.performance?.now?.() ?? Date.now();
    const write = (stream, args) => {
      stream.write(`${" ".repeat(groupDepth * 2)}${formatConsoleArgs(args)}\n`);
    };
    return {
      log: (...args) => write(this.descriptor.stdout, args),
      info: (...args) => write(this.descriptor.stdout, args),
      debug: (...args) => write(this.descriptor.stdout, args),
      warn: (...args) => write(this.descriptor.stderr, args),
      error: (...args) => write(this.descriptor.stderr, args),
      dir: (value) => write(this.descriptor.stdout, [value]),
      trace: (...args) => write(this.descriptor.stderr, [`Trace: ${formatConsoleArgs(args)}`]),
      assert: (value, ...args) => {
        if (!value) write(this.descriptor.stderr, [args.length ? formatConsoleArgs(args) : "Assertion failed"]);
      },
      clear: () => this.descriptor.stdout.write("\x1b[1;1H\x1b[0J"),
      count: (label = "default") => {
        const key = String(label);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        write(this.descriptor.stdout, [`${key}: ${count}`]);
      },
      countReset: (label = "default") => {
        const key = String(label);
        if (!counts.delete(key)) write(this.descriptor.stderr, [`Count for '${key}' does not exist`]);
      },
      group: (...label) => {
        if (label.length) write(this.descriptor.stdout, label);
        groupDepth++;
      },
      groupCollapsed: (...label) => {
        if (label.length) write(this.descriptor.stdout, label);
        groupDepth++;
      },
      groupEnd: () => {
        if (groupDepth > 0) groupDepth--;
      },
      time: (label = "default") => timers.set(String(label), now()),
      timeLog: (label = "default", ...args) => {
        const key = String(label);
        const start = timers.get(key);
        if (start === undefined) {
          write(this.descriptor.stderr, [`No such label '${key}' for console.timeLog()`]);
          return;
        }
        write(this.descriptor.stdout, [`${key}: ${(now() - start).toFixed(3)}ms`, ...args]);
      },
      timeEnd: (label = "default") => {
        const key = String(label);
        const start = timers.get(key);
        if (start === undefined) {
          write(this.descriptor.stderr, [`No such label '${key}' for console.timeEnd()`]);
          return;
        }
        timers.delete(key);
        write(this.descriptor.stdout, [`${key}: ${(now() - start).toFixed(3)}ms`]);
      },
      table: (value) => write(this.descriptor.stdout, [value]),
      timeStamp: () => {},
      profile: () => {},
      profileEnd: () => {}
    };
  }

  async execute(args) {
    try {
      if (args[0] === "-e") {
        const source = args[1] ?? "";
        const badOption = invalidEvalOption(args);
        if (badOption) {
          this.descriptor.stderr.write(`node: bad option: ${badOption}\n`);
          return 9;
        }
        this.descriptor.argv = normalizeEvalArgv(args);
        this.descriptor.argvParseStart = 1;
        this.descriptor.evalSource = source;
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }

      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
      this.descriptor.argvParseStart = 2;
      this.descriptor.evalSource = undefined;
      this.loader.setMain(filename);
      await this.loader.import(filename, `${dirname(filename)}/[entry].js`);
      return this.loader.process.exitCode ?? 0;
    } catch (error) {
      if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") return error.exitCode;
      this.descriptor.stderr.write(`${error.stack ?? error.message ?? error}\n`);
      return 1;
    }
  }

  executeSync(args) {
    try {
      if (args[0] === "-e") {
        const source = args[1] ?? "";
        const badOption = invalidEvalOption(args);
        if (badOption) {
          this.descriptor.stderr.write(`node: bad option: ${badOption}\n`);
          return 9;
        }
        this.descriptor.argv = normalizeEvalArgv(args);
        this.descriptor.argvParseStart = 1;
        this.descriptor.evalSource = source;
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }

      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
      this.descriptor.argvParseStart = 2;
      this.descriptor.evalSource = undefined;
      this.loader.setMain(filename);
      this.loader.require(filename, `${dirname(filename)}/[entry].js`);
      return 0;
    } catch (error) {
      if (error?.code === "OPENCONTAINERS_PROCESS_EXIT") return error.exitCode;
      this.descriptor.stderr.write(`${error.stack ?? error.message ?? error}\n`);
      return 1;
    }
  }

  executeSource(source, filename) {
    const module = { id: filename, filename, exports: {} };
    const require = this.loader.createRequire(filename);
    const wrapped = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "console",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "__opencontainersGlobals",
      "fetch",
      "__opencontainersDynamicImport",
      `with (__opencontainersGlobals) {\n${source}\n}\n//# sourceURL=opencontainers://${filename}`
    );
    wrapped.call(
      this.loader.runtimeGlobals,
      module.exports,
      require,
      module,
      filename,
      dirname(filename),
      this.loader.process,
      this.console,
      this.loader.timers.setTimeout,
      this.loader.timers.clearTimeout,
      this.loader.timers.setInterval,
      this.loader.timers.clearInterval,
      this.loader.timers.setImmediate,
      this.loader.timers.clearImmediate,
      this.loader.runtimeGlobals,
      this.loader.fetch,
      (specifier) => this.loader.dynamicImport(specifier, filename)
    );
    return module.exports;
  }
}

function invalidEvalOption(args) {
  const firstUserArg = args[2];
  if (firstUserArg === undefined || firstUserArg === "--" || firstUserArg === "-") return null;
  return firstUserArg.startsWith("-") ? firstUserArg : null;
}

function normalizeEvalArgv(args) {
  const userArgs = args.slice(2);
  if (userArgs[0] === "--") userArgs.shift();
  return ["node", ...userArgs];
}

function formatConsoleArgs(args) {
  return args.map(formatConsoleValue).join(" ");
}

function formatConsoleValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  if (typeof value === "function") return `[Function${value.name ? `: ${value.name}` : ""}]`;
  if (typeof value === "symbol") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch (_) {
    return String(value);
  }
}
