import { dirname, joinPath, resolvePath } from "../../fs/src/path-utils.js";
import { adapterForPackage, materializeAdapterFiles } from "../../adapters/src/registry.js";
import { RegistryClient } from "./registry-client.js";
import { selectVersion } from "./semver.js";

export class NpmInstaller {
  constructor({ kernel, registryClient = new RegistryClient() }) {
    this.kernel = kernel;
    this.registryClient = registryClient;
    this.installed = new Set();
  }

  async install({ cwd = "/workspace", packages = [], saveDev = false, descriptor } = {}) {
    const manifestPath = resolvePath(cwd, "package.json");
    const manifest = this.kernel.fs.existsSync(manifestPath)
      ? JSON.parse(this.kernel.fs.readFileSync(manifestPath, "utf8"))
      : { scripts: {}, dependencies: {}, devDependencies: {} };

    if (packages.length) {
      for (const spec of packages) {
        const { name, range } = parsePackageSpec(spec);
        const target = saveDev ? "devDependencies" : "dependencies";
        manifest[target] ??= {};
        manifest[target][name] = range ?? "latest";
      }
      this.kernel.fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    const dependencies = {
      ...(manifest.dependencies ?? {}),
      ...(saveDev ? manifest.devDependencies ?? {} : {})
    };
    for (const [name, range] of Object.entries(dependencies)) {
      await this.installPackage({ cwd, name, range, descriptor });
    }
    this.writeLockfile(cwd);
  }

  async installPackage({ cwd, name, range = "latest", descriptor }) {
    const metadata = await this.registryClient.metadata(name);
    const version = selectVersion(metadata, range);
    const key = `${name}@${version}`;
    if (this.installed.has(key)) return;
    this.installed.add(key);

    const packageMetadata = metadata.versions[version];
    const adapter = adapterForPackage(name);
    const packageRoot = joinPath(cwd, "node_modules", name);
    this.kernel.fs.mkdirSync(packageRoot, { recursive: true });

    const files = await this.registryClient.packageFiles(name, version, packageMetadata);
    for (const [filePath, content] of Object.entries(files)) {
      const target = joinPath(packageRoot, filePath);
      this.kernel.fs.mkdirSync(dirname(target), { recursive: true });
      this.kernel.fs.writeFileSync(target, content);
    }

    if (adapter) {
      this.applyAdapter({ name, version, packageRoot, packageMetadata, adapter, descriptor });
    } else if (!this.kernel.fs.existsSync(joinPath(packageRoot, "package.json"))) {
      this.kernel.fs.writeFileSync(joinPath(packageRoot, "package.json"), `${JSON.stringify(packageMetadata, null, 2)}\n`);
    }

    for (const [dependencyName, dependencyRange] of Object.entries(packageMetadata.dependencies ?? {})) {
      await this.installPackage({ cwd, name: dependencyName, range: dependencyRange, descriptor });
    }

    this.linkBins({ cwd, name, packageRoot, packageMetadata, adapter });
    await this.runLifecycleScripts({ name, version, packageRoot, packageMetadata, descriptor, adapter });
  }

  applyAdapter({ name, version, packageRoot, packageMetadata, adapter, descriptor }) {
    materializeAdapterFiles(this.kernel.fs, adapter);
    if (adapter.replaceModule) {
      this.kernel.fs.writeFileSync(joinPath(packageRoot, "index.js"), `module.exports = require(${JSON.stringify(adapter.replaceModule)});\n`);
      this.kernel.fs.writeFileSync(joinPath(packageRoot, "package.json"), `${JSON.stringify({
        name,
        version,
        main: "index.js",
        opencontainersAdapter: adapter.replaceModule,
        originalPackage: {
          main: packageMetadata.main,
          exports: packageMetadata.exports
        }
      }, null, 2)}\n`);
      descriptor?.stdout?.write?.(`adapted ${name}@${version} -> ${adapter.replaceModule}\n`);
    }
  }

  linkBins({ cwd, name, packageRoot, packageMetadata, adapter }) {
    const bin = adapter?.replaceBin ?? packageMetadata.bin;
    if (!bin) return;
    const binEntries = typeof bin === "string" ? [[name, bin]] : Object.entries(bin);
    const binRoot = joinPath(cwd, "node_modules/.bin");
    this.kernel.fs.mkdirSync(binRoot, { recursive: true });
    for (const [binName, target] of binEntries) {
      this.kernel.fs.writeFileSync(joinPath(binRoot, binName), `${JSON.stringify({
        type: "node-bin",
        package: name,
        target: String(target).startsWith("/") ? target : joinPath(packageRoot, target)
      }, null, 2)}\n`);
    }
  }

  writeLockfile(cwd) {
    this.kernel.fs.writeFileSync(resolvePath(cwd, "package-lock.opencontainers.json"), `${JSON.stringify({
      lockfileVersion: 1,
      packages: [...this.installed].sort()
    }, null, 2)}\n`);
  }

  async runLifecycleScripts({ name, version, packageRoot, packageMetadata, descriptor, adapter }) {
    const scripts = packageMetadata.scripts ?? {};
    const lifecycleOrder = ["preinstall", "install", "postinstall", "prepare"];
    const enabledScripts = lifecycleOrder.filter((scriptName) => scripts[scriptName]);
    if (!enabledScripts.length) return;

    if (adapter?.postInstall === "skip") {
      descriptor?.stderr?.write?.(`skipped install scripts for ${name}@${version}; adapter ${adapter.replaceModule ?? "configured"} replaces native package behavior\n`);
      return;
    }

    if (!this.kernel.allowInstallScripts) {
      descriptor?.stderr?.write?.(`skipped install scripts for ${name}@${version}; permission disabled\n`);
      return;
    }

    for (const scriptName of enabledScripts) {
      descriptor?.stdout?.write?.(`${name}@${version} ${scriptName}: ${scripts[scriptName]}\n`);
      const child = this.kernel.spawn("sh", ["-c", scripts[scriptName]], {
        cwd: packageRoot,
        env: {
          ...(descriptor?.env ?? {}),
          npm_lifecycle_event: scriptName,
          npm_package_name: name,
          npm_package_version: version
        },
        projectId: descriptor?.projectId ?? "default",
        parentPid: descriptor?.pid
      });
      child.stdout.on("data", (chunk) => descriptor?.stdout?.write?.(chunk));
      child.stderr.on("data", (chunk) => descriptor?.stderr?.write?.(chunk));
      const result = await child.completed;
      if (result.status !== 0) {
        throw Object.assign(new Error(`${name}@${version} ${scriptName} failed`), {
          code: "ERR_OPENCONTAINERS_NPM_LIFECYCLE_FAILED",
          status: result.status
        });
      }
    }
  }
}

export function parsePackageSpec(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("@");
    const name = `@${parts[1]}`;
    return { name, range: parts[2] };
  }
  const [name, range] = spec.split("@");
  return { name, range };
}
