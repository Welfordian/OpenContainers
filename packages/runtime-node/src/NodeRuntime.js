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
    const write = (stream, args) => {
      stream.write(`${args.map(formatConsoleValue).join(" ")}\n`);
    };
    return {
      log: (...args) => write(this.descriptor.stdout, args),
      info: (...args) => write(this.descriptor.stdout, args),
      warn: (...args) => write(this.descriptor.stderr, args),
      error: (...args) => write(this.descriptor.stderr, args)
    };
  }

  async execute(args) {
    try {
      if (args[0] === "-e") {
        const source = args[1] ?? "";
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }

      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
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
        this.executeSource(source, resolvePath(this.descriptor.cwd, "[eval].js"));
        return 0;
      }

      const script = args[0];
      if (!script) throw new Error("node requires a script path or -e source");
      const filename = resolvePath(this.descriptor.cwd, script);
      this.descriptor.argv = ["node", filename, ...args.slice(1)];
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
    wrapped(
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
