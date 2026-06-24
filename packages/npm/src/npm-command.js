import { NpmBootstrapper } from "./npm-bootstrapper.js";
import { NpmInstaller } from "./installer.js";
import { MemoryRegistryClient, RegistryClient } from "./registry-client.js";

export class NpmCommand {
  constructor({ kernel, registryClient = new RegistryClient() }) {
    this.kernel = kernel;
    this.registryClient = registryClient;
    this.bootstrapper = new NpmBootstrapper({ kernel, registryClient });
    this.legacyInstaller = new NpmInstaller({ kernel, registryClient });
  }

  async run(args, descriptor, { command = "npm" } = {}) {
    if (this.registryClient instanceof MemoryRegistryClient) {
      return this.#runLegacy(command === "npx" ? ["exec", ...args] : args, descriptor);
    }

    if (command === "npm" && this.#isLocalScriptCommand(args)) {
      return this.#runLegacy(args, descriptor, { emitScriptHeader: true });
    }

    const entrypoints = await this.bootstrapper.ensure();
    const cliPath = command === "npx" ? entrypoints.npxRunner : entrypoints.npmRunner;
    const child = this.kernel.spawn("node", [cliPath, ...args], {
      cwd: descriptor.cwd,
      env: {
        ...descriptor.env,
        INIT_CWD: descriptor.cwd,
        npm_execpath: entrypoints.npmCli,
        npm_node_execpath: "/bin/node",
        npm_config_cache: descriptor.env.npm_config_cache ?? "/home/opencontainers/.npm",
        npm_config_audit: descriptor.env.npm_config_audit ?? "false",
        npm_config_fund: descriptor.env.npm_config_fund ?? "false",
        npm_config_update_notifier: descriptor.env.npm_config_update_notifier ?? "false",
        OPENCONTAINERS_NPM_CLI: "1"
      },
      projectId: descriptor.projectId,
      parentPid: descriptor.pid,
      externalNetworkAllowlist: ["registry.npmjs.org"]
    });

    child.stdout.on("data", (chunk) => descriptor.stdout.write(chunk));
    child.stderr.on("data", (chunk) => descriptor.stderr.write(chunk));
    const result = await child.completed;
    return result.status;
  }

  #isLocalScriptCommand(args) {
    const command = args[0];
    if (command === "run" || command === "run-script") return true;
    return ["t", "tst", "test", "start", "stop", "restart"].includes(command);
  }

  async #runLegacy(args, descriptor, { emitScriptHeader = false } = {}) {
    const [command = "--version", ...rest] = args;
    if (command === "--version" || command === "-v") {
      descriptor.stdout.write("opencontainers-npm/0.1.0\n");
      return 0;
    }
    if (command === "install" || command === "i") {
      const saveDev = rest.includes("--save-dev") || rest.includes("-D");
      const packages = rest.filter((arg) => !arg.startsWith("-"));
      await this.legacyInstaller.install({ cwd: descriptor.cwd, packages, saveDev, descriptor });
      descriptor.stdout.write("installed\n");
      return 0;
    }
    if (command === "run" || command === "run-script") {
      const scriptName = rest[0];
      if (!scriptName) throw new Error("npm run requires a script name");
      return this.#runScript(scriptName, descriptor, { emitHeader: emitScriptHeader });
    }
    const scriptAlias = {
      t: "test",
      tst: "test",
      test: "test",
      start: "start",
      stop: "stop",
      restart: "restart"
    }[command];
    if (scriptAlias) {
      return this.#runScript(scriptAlias, descriptor, { emitHeader: emitScriptHeader });
    }
    if (command === "exec") {
      const [bin, ...binArgs] = rest;
      const child = this.kernel.spawn(bin, binArgs, {
        cwd: descriptor.cwd,
        env: descriptor.env,
        projectId: descriptor.projectId,
        parentPid: descriptor.pid
      });
      child.stdout.on("data", (chunk) => descriptor.stdout.write(chunk));
      child.stderr.on("data", (chunk) => descriptor.stderr.write(chunk));
      const result = await child.completed;
      return result.status;
    }
    if (command === "ls") {
      const nodeModules = `${descriptor.cwd}/node_modules`;
      const names = this.kernel.fs.existsSync(nodeModules) ? this.kernel.fs.readdirSync(nodeModules) : [];
      descriptor.stdout.write(`${names.join("\n")}\n`);
      return 0;
    }
    throw new Error(`Unsupported npm command: ${command}`);
  }

  #runScript(scriptName, descriptor, { emitHeader = false } = {}) {
    const manifest = JSON.parse(this.kernel.fs.readFileSync(`${descriptor.cwd}/package.json`, "utf8"));
    const script = manifest.scripts?.[scriptName];
    if (!script) throw new Error(`Missing script: ${scriptName}`);
    if (emitHeader) {
      descriptor.stdout.write(`> ${scriptName}\n> ${script}\n`);
    }
    return this.kernel.shell.run(script, {
      cwd: descriptor.cwd,
      env: {
        ...descriptor.env,
        npm_lifecycle_event: scriptName,
        npm_lifecycle_script: script,
        npm_package_json: `${descriptor.cwd}/package.json`,
        PATH: `${descriptor.cwd}/node_modules/.bin:${descriptor.env.PATH ?? ""}`
      },
      stdout: descriptor.stdout,
      stderr: descriptor.stderr,
      projectId: descriptor.projectId,
      parentPid: descriptor.pid
    });
  }
}
