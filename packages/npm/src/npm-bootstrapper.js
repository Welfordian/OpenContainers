import { joinPath } from "../../fs/src/path-utils.js";

export const DEFAULT_NPM_VERSION = "11.17.0";
export const DEFAULT_NPM_PACKAGE_ROOT = `/home/opencontainers/.opencontainers/npm/npm-${DEFAULT_NPM_VERSION}`;

export class NpmBootstrapper {
  constructor({
    kernel,
    registryClient,
    version = DEFAULT_NPM_VERSION,
    packageRoot = `/home/opencontainers/.opencontainers/npm/npm-${version}`
  }) {
    this.kernel = kernel;
    this.registryClient = registryClient;
    this.version = version;
    this.packageRoot = packageRoot;
    this.bootstrapped = null;
  }

  async ensure() {
    if (this.bootstrapped && this.#isInstalled()) return this.bootstrapped;
    if (this.#isInstalled()) {
      this.#writeRunnerFiles();
      this.bootstrapped = this.#entrypoints();
      return this.bootstrapped;
    }

    if (!this.registryClient) {
      throw new Error("npm CLI bootstrap requires an npm registry client");
    }

    const metadata = await this.registryClient.metadata("npm");
    const packageMetadata = metadata.versions?.[this.version];
    if (!packageMetadata) {
      throw new Error(`Pinned npm version ${this.version} was not found in the registry metadata`);
    }

    const files = await this.registryClient.packageFiles("npm", this.version, packageMetadata);
    this.#writePackage(files);
    this.#writeRunnerFiles();
    this.bootstrapped = this.#entrypoints();
    return this.bootstrapped;
  }

  #isInstalled() {
    const manifestPath = joinPath(this.packageRoot, "package.json");
    if (!this.kernel.fs.existsSync(manifestPath)) return false;
    try {
      const manifest = JSON.parse(this.kernel.fs.readFileSync(manifestPath, "utf8"));
      return manifest.name === "npm" && manifest.version === this.version;
    } catch {
      return false;
    }
  }

  #entrypoints() {
    return {
      version: this.version,
      root: this.packageRoot,
      npmCli: joinPath(this.packageRoot, "bin/npm-cli.js"),
      npxCli: joinPath(this.packageRoot, "bin/npx-cli.js"),
      npmRunner: joinPath(this.packageRoot, ".opencontainers/npm-runner.mjs"),
      npxRunner: joinPath(this.packageRoot, ".opencontainers/npx-runner.mjs")
    };
  }

  #writePackage(files) {
    this.kernel.fs.mkdirSync(this.packageRoot, { recursive: true });
    for (const [relativePath, value] of Object.entries(files)) {
      const targetPath = joinPath(this.packageRoot, relativePath);
      this.kernel.fs.mkdirSync(joinPath(targetPath, ".."), { recursive: true });
      this.kernel.fs.writeFileSync(targetPath, value);
    }
  }

  #writeRunnerFiles() {
    const runnerDir = joinPath(this.packageRoot, ".opencontainers");
    this.kernel.fs.mkdirSync(runnerDir, { recursive: true });
    const pacotePatchPath = joinPath(runnerDir, "pacote-extract-patch.cjs");
    this.kernel.fs.writeFileSync(pacotePatchPath, this.#pacoteExtractPatchSource());
    this.kernel.fs.writeFileSync(joinPath(runnerDir, "npm-runner.mjs"), [
      `require(${JSON.stringify(pacotePatchPath)});`,
      "patchNpmProcessExit();",
      `const cli = require(${JSON.stringify(joinPath(this.packageRoot, "lib/cli.js"))});`,
      `process.argv[1] = ${JSON.stringify(joinPath(this.packageRoot, "bin/npm-cli.js"))};`,
      "await cli(process);",
      "",
      "function patchNpmProcessExit() {",
      "  process.exit = (code = undefined) => {",
      "    const exitCode = Number(code ?? process.exitCode ?? 0) || 0;",
      "    process.exitCode = exitCode;",
      "    process.emit('exit', exitCode);",
      "  };",
      "}",
      ""
    ].join("\n"));
    this.kernel.fs.writeFileSync(joinPath(runnerDir, "npx-runner.mjs"), [
      `require(${JSON.stringify(pacotePatchPath)});`,
      "patchNpmProcessExit();",
      `const cli = require(${JSON.stringify(joinPath(this.packageRoot, "lib/cli.js"))});`,
      `process.argv[1] = ${JSON.stringify(joinPath(this.packageRoot, "bin/npm-cli.js"))};`,
      "process.argv.splice(2, 0, 'exec');",
      "await cli(process);",
      "",
      "function patchNpmProcessExit() {",
      "  process.exit = (code = undefined) => {",
      "    const exitCode = Number(code ?? process.exitCode ?? 0) || 0;",
      "    process.exitCode = exitCode;",
      "    process.emit('exit', exitCode);",
      "  };",
      "}",
      ""
    ].join("\n"));
  }

  #pacoteExtractPatchSource() {
    const pacotePath = joinPath(this.packageRoot, "node_modules/pacote/lib/index.js");
    return `
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const pacote = require(${JSON.stringify(pacotePath)});

if (!pacote.__opencontainersPatchedExtract) {
  const originalExtract = pacote.extract;
  pacote.extract = async function openContainersExtract(spec, destination, options = {}) {
    const resolved = options.resolved || await pacote.resolve(spec, options);
    if (!resolved || !/^https?:\\/\\//i.test(resolved)) {
      return originalExtract.call(this, spec, destination, options);
    }

    const compressedOrTar = await fetchBytes(resolved);
    const archiveBytes = await archiveBytesForInstall(compressedOrTar, options.integrity);
    const files = extractTarFiles(archiveBytes);

    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
      const target = safeJoin(destination, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  };
  Object.defineProperty(pacote, "__opencontainersPatchedExtract", {
    value: true,
    enumerable: false,
  });
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`npm tarball request failed for \${url}: \${response.status}\`);
  }
  return Buffer.from(new Uint8Array(await response.arrayBuffer()));
}

async function archiveBytesForInstall(bytes, integrity) {
  if (integrity) {
    try {
      verifyIntegrity(bytes, String(integrity));
    } catch (error) {
      if (looksLikeTarArchive(bytes)) return bytes;
      throw error;
    }
  }
  if (looksLikeTarArchive(bytes)) return bytes;
  return gunzip(bytes);
}

function verifyIntegrity(bytes, integrity) {
  const checks = String(integrity || "")
    .trim()
    .split(/\\s+/)
    .map(parseIntegrityToken)
    .filter(Boolean);
  if (!checks.length) return;

  for (const { algorithm, expected } of checks) {
    const normalized = normalizeDigestAlgorithm(algorithm);
    if (!normalized) continue;
    const actual = crypto.createHash(normalized).update(bytes).digest("base64");
    if (normalizeIntegrityDigest(actual) === normalizeIntegrityDigest(expected)) return;
  }

  throw Object.assign(new Error("npm tarball integrity check failed"), {
    code: "ERR_OPENCONTAINERS_NPM_INTEGRITY",
  });
}

function parseIntegrityToken(token) {
  const match = String(token).match(/^([a-z0-9]+)-(.+)$/i);
  return match ? { algorithm: match[1], expected: match[2] } : null;
}

function normalizeDigestAlgorithm(algorithm) {
  const normalized = String(algorithm || "").toLowerCase();
  if (normalized === "sha1") return "sha1";
  if (normalized === "sha256") return "sha256";
  if (normalized === "sha384") return "sha384";
  if (normalized === "sha512") return "sha512";
  return "";
}

function normalizeIntegrityDigest(value) {
  return String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");
}

function gunzip(bytes) {
  return new Promise((resolve, reject) => {
    zlib.gunzip(bytes, (error, result) => {
      if (error) reject(error);
      else resolve(Buffer.from(result));
    });
  });
}

function extractTarFiles(bytes) {
  const files = {};
  let offset = 0;
  let pendingLongPath = "";

  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = readTarString(header, 0, 100);
    const size = Number.parseInt(readTarString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readTarString(header, 345, 155);
    const rawName = pendingLongPath || (prefix ? \`\${prefix}/\${name}\` : name);
    const fullName = normalizeTarPath(rawName);
    pendingLongPath = "";

    offset += 512;
    const content = bytes.subarray(offset, offset + size);

    if (type === "L") {
      pendingLongPath = readTarString(content, 0, content.byteLength);
    } else if (type === "0" || type === "\\0") {
      files[fullName] = Buffer.from(content);
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return stripCommonPackageRoot(files);
}

function looksLikeTarArchive(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 512) return false;
  const name = readTarString(bytes, 0, 100);
  if (!name) return false;
  const checksumText = readTarString(bytes, 148, 8).trim().replace(/\\0.*$/, "");
  const expected = Number.parseInt(checksumText || "0", 8);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  let actual = 0;
  for (let index = 0; index < 512; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : bytes[index];
  }
  return actual === expected;
}

function stripCommonPackageRoot(files) {
  if (files["package.json"]) return files;
  const roots = new Set();
  for (const path of Object.keys(files)) {
    const [root, rest] = path.split(/\\/(.+)/, 2);
    if (root && rest) roots.add(root);
  }
  if (roots.size !== 1) return files;
  const [root] = roots;
  const stripped = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith(\`\${root}/\`)) stripped[path.slice(root.length + 1)] = content;
  }
  return stripped;
}

function normalizeTarPath(value) {
  return String(value || "")
    .replace(/\\0.*$/, "")
    .replace(/\\\\/g, "/")
    .replace(/^\\/+/, "")
    .replace(/^\\.\\//, "");
}

function readTarString(bytes, start, length) {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end));
}

function safeJoin(root, relativePath) {
  const normalized = normalizeTarPath(relativePath);
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error(\`Unsafe tar entry path: \${relativePath}\`);
  }
  const target = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(\`\${resolvedRoot}/\`)) {
    throw new Error(\`Unsafe tar entry path: \${relativePath}\`);
  }
  return target;
}
`;
  }
}
