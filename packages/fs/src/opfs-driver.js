import { dirname, joinPath, normalizePath } from "./path-utils.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class OpfsPersistenceDriver {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
  }

  static async open(storage = globalThis.navigator?.storage) {
    if (!storage?.getDirectory) {
      throw Object.assign(new Error("Origin Private File System is unavailable"), {
        code: "ERR_OPENCONTAINERS_OPFS_UNAVAILABLE"
      });
    }
    return new OpfsPersistenceDriver(await storage.getDirectory());
  }

  async writeFile(path, data) {
    const normalized = normalizePath(path).replace(/^\//, "");
    const parent = await this.directoryFor(dirname(normalized), { create: true });
    const name = basenameFromNormalized(normalized);
    const file = await parent.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(typeof data === "string" ? encoder.encode(data) : data);
    await writable.close();
  }

  async readFile(path, encoding) {
    const normalized = normalizePath(path).replace(/^\//, "");
    const parent = await this.directoryFor(dirname(normalized), { create: false });
    const file = await parent.getFileHandle(basenameFromNormalized(normalized));
    const bytes = new Uint8Array(await (await file.getFile()).arrayBuffer());
    return encoding ? decoder.decode(bytes) : bytes;
  }

  async remove(path, { recursive = false } = {}) {
    const normalized = normalizePath(path).replace(/^\//, "");
    const parent = await this.directoryFor(dirname(normalized), { create: false });
    await parent.removeEntry(basenameFromNormalized(normalized), { recursive });
  }

  async list(path = "/") {
    const normalized = normalizePath(path).replace(/^\//, "");
    let directory;
    try {
      directory = await this.directoryFor(normalized, { create: false });
    } catch {
      return [];
    }
    const entries = [];
    await this.walk(directory, normalized ? `/${normalized}` : "", entries);
    return entries.sort((left, right) => left.path.localeCompare(right.path));
  }

  async flushVirtualFileSystem(fs, root = "/workspace") {
    for (const [path, node] of fs.nodes.entries()) {
      if (path === "/" || node.type !== "file" || !path.startsWith(root)) continue;
      await this.writeFile(path, node.data);
    }
  }

  async hydrateVirtualFileSystem(fs, root = "/workspace") {
    for (const entry of await this.list(root)) {
      if (entry.type !== "file") continue;
      fs.mkdirSync(dirname(entry.path), { recursive: true });
      fs.writeFileSync(entry.path, await this.readFile(entry.path));
    }
  }

  async removeTree(path) {
    try {
      await this.remove(path, { recursive: true });
    } catch {
      // Missing persisted trees are fine for reset/cleanup paths.
    }
  }

  async directoryFor(path, { create }) {
    const normalized = normalizePath(path).replace(/^\//, "");
    if (!normalized || normalized === ".") return this.rootDirectory;
    let directory = this.rootDirectory;
    for (const segment of normalized.split("/").filter(Boolean)) {
      directory = await directory.getDirectoryHandle(segment, { create });
    }
    return directory;
  }

  async walk(directory, prefix, entries) {
    for await (const [name, handle] of directory.entries()) {
      const path = joinPath(prefix || "/", name);
      if (handle.kind === "directory") {
        entries.push({ path, type: "directory", size: 0 });
        await this.walk(handle, path, entries);
      } else {
        const file = await handle.getFile();
        entries.push({ path, type: "file", size: file.size ?? 0 });
      }
    }
  }
}

function basenameFromNormalized(path) {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}
