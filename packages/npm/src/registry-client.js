export class RegistryClient {
  constructor({ registryUrl = "https://registry.npmjs.org" } = {}) {
    this.registryUrl = registryUrl.replace(/\/$/, "");
  }

  async metadata(packageName) {
    const response = await fetch(`${this.registryUrl}/${encodeURIComponent(packageName).replace(/^%40/, "@")}`);
    if (!response.ok) {
      throw new Error(`npm metadata request failed for ${packageName}: ${response.status}`);
    }
    return response.json();
  }

  async packageFiles(packageName, version, metadata) {
    const tarball = metadata.dist?.tarball;
    if (!tarball) throw new Error(`No tarball URL for ${packageName}@${version}`);
    const response = await fetch(tarball);
    if (!response.ok) {
      throw new Error(`npm tarball request failed for ${packageName}@${version}: ${response.status}`);
    }
    const compressed = new Uint8Array(await response.arrayBuffer());
    if (metadata.dist?.integrity) await verifyIntegrity(compressed, metadata.dist.integrity);
    const tarBytes = await decompressGzip(compressed);
    return extractTarFiles(tarBytes);
  }
}

export class MemoryRegistryClient {
  constructor(packages = {}) {
    this.packages = packages;
  }

  async metadata(packageName) {
    const entry = this.packages[packageName];
    if (!entry) throw new Error(`No test registry entry for ${packageName}`);
    return {
      name: packageName,
      "dist-tags": { latest: Object.keys(entry.versions).at(-1), ...(entry.distTags ?? {}) },
      versions: Object.fromEntries(Object.entries(entry.versions).map(([version, data]) => [
        version,
        {
          name: packageName,
          version,
          dependencies: data.dependencies ?? {},
          scripts: data.scripts ?? {},
          bin: data.bin,
          main: data.main,
          exports: data.exports,
          dist: {
            integrity: `memory-${packageName}-${version}`,
            tarball: `memory:${packageName}@${version}`
          }
        }
      ]))
    };
  }

  async packageFiles(packageName, version) {
    const files = this.packages[packageName]?.versions?.[version]?.files;
    if (!files) throw new Error(`No files for ${packageName}@${version}`);
    return files;
  }
}

export async function verifyIntegrity(bytes, integrity) {
  const checks = String(integrity || "")
    .trim()
    .split(/\s+/)
    .map(parseIntegrityToken)
    .filter(Boolean);
  if (!checks.length) return;

  const attempts = [];
  for (const { algorithm, expected } of checks) {
    const digestAlgorithm = normalizeDigestAlgorithm(algorithm);
    if (!digestAlgorithm) continue;
    const digest = new Uint8Array(await crypto.subtle.digest(digestAlgorithm, bytes));
    const actual = bytesToBase64(digest);
    attempts.push({ algorithm, expected, actual });
    if (normalizeIntegrityDigest(actual) === normalizeIntegrityDigest(expected)) return;
  }

  throw Object.assign(new Error("npm tarball integrity check failed"), {
    code: "ERR_WELFORD_NPM_INTEGRITY",
    expected: checks.map(check => `${check.algorithm}-${check.expected}`).join(" "),
    actual: attempts.map(attempt => `${attempt.algorithm}-${attempt.actual}`).join(" ")
  });
}

function parseIntegrityToken(token) {
  const match = String(token).match(/^([a-z0-9]+)-(.+)$/i);
  if (!match) return null;
  return { algorithm: match[1], expected: match[2] };
}

function normalizeDigestAlgorithm(algorithm) {
  const normalized = String(algorithm || "").toLowerCase();
  if (normalized === "sha1") return "SHA-1";
  if (normalized === "sha256") return "SHA-256";
  if (normalized === "sha384") return "SHA-384";
  if (normalized === "sha512") return "SHA-512";
  return "";
}

function normalizeIntegrityDigest(value) {
  return String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");
}

export async function decompressGzip(bytes) {
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (globalThis.process?.versions?.node) {
    const importNodeModule = Function("specifier", "return import(specifier)");
    const { gunzipSync } = await importNodeModule("node:zlib");
    return new Uint8Array(gunzipSync(bytes));
  }
  throw Object.assign(new Error("gzip decompression is unavailable in this browser"), {
    code: "ERR_WELFORD_GZIP_UNAVAILABLE"
  });
}

export function extractTarFiles(bytes) {
  const files = {};
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const size = Number.parseInt(readTarString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readTarString(header, 345, 155);
    const fullName = normalizeTarPath(prefix ? `${prefix}/${name}` : name);
    offset += 512;
    const content = bytes.slice(offset, offset + size);
    if (type === "0" || type === "\0") {
      files[fullName] = content;
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

function normalizeTarPath(path) {
  return path.replace(/^package\//, "").replace(/^\.\//, "");
}

function readTarString(bytes, start, length) {
  const slice = bytes.slice(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.slice(0, end));
}

function bytesToBase64(bytes) {
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}
