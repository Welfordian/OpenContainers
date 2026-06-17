import { NpmInstaller } from "./installer.js";

export class NpmCommand {
  constructor({ kernel, registryClient }) {
    this.kernel = kernel;
    this.installer = new NpmInstaller({ kernel, registryClient });
  }

  async run(args, descriptor) {
    const [command = "--version", ...rest] = args;
    if (command === "--version" || command === "-v") {
      descriptor.stdout.write("welford-npm/0.1.0\n");
      return 0;
    }
    if (command === "install" || command === "i") {
      const saveDev = rest.includes("--save-dev") || rest.includes("-D");
      const packages = rest.filter((arg) => !arg.startsWith("-"));
      await this.installer.install({ cwd: descriptor.cwd, packages, saveDev, descriptor });
      descriptor.stdout.write("installed\n");
      return 0;
    }
    if (command === "run") {
      const scriptName = rest[0];
      if (!scriptName) throw new Error("npm run requires a script name");
      const manifest = JSON.parse(this.kernel.fs.readFileSync(`${descriptor.cwd}/package.json`, "utf8"));
      const script = manifest.scripts?.[scriptName];
      if (!script) throw new Error(`Missing script: ${scriptName}`);
      return this.kernel.shell.run(script, {
        cwd: descriptor.cwd,
        env: {
          ...descriptor.env,
          npm_lifecycle_event: scriptName,
          PATH: `${descriptor.cwd}/node_modules/.bin:${descriptor.env.PATH ?? ""}`
        },
        stdout: descriptor.stdout,
        stderr: descriptor.stderr,
        projectId: descriptor.projectId,
        parentPid: descriptor.pid
      });
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
}
