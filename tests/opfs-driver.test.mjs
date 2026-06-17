import assert from "node:assert/strict";
import test from "node:test";
import { OpfsPersistenceDriver } from "../packages/fs/src/opfs-driver.js";
import { VirtualFileSystem } from "../packages/fs/src/VirtualFileSystem.js";

test("OpfsPersistenceDriver writes, reads, lists, flushes, and hydrates virtual filesystems", async () => {
  const driver = new OpfsPersistenceDriver(new FakeDirectoryHandle());
  await driver.writeFile("/workspace/a.txt", "hello");
  await driver.writeFile("/workspace/src/b.txt", "world");

  assert.equal(await driver.readFile("/workspace/a.txt", "utf8"), "hello");
  assert.deepEqual((await driver.list("/workspace")).map((entry) => entry.path), [
    "/workspace/a.txt",
    "/workspace/src",
    "/workspace/src/b.txt"
  ]);

  const source = new VirtualFileSystem();
  source.writeFileSync("/workspace/flushed.txt", "persist me");
  await driver.flushVirtualFileSystem(source);

  const target = new VirtualFileSystem();
  await driver.hydrateVirtualFileSystem(target);
  assert.equal(target.readFileSync("/workspace/a.txt", "utf8"), "hello");
  assert.equal(target.readFileSync("/workspace/src/b.txt", "utf8"), "world");
  assert.equal(target.readFileSync("/workspace/flushed.txt", "utf8"), "persist me");
});

class FakeDirectoryHandle {
  kind = "directory";

  constructor() {
    this.children = new Map();
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.children.has(name)) {
      if (!create) throw new Error(`Missing directory: ${name}`);
      this.children.set(name, new FakeDirectoryHandle());
    }
    const value = this.children.get(name);
    if (value.kind !== "directory") throw new Error(`${name} is not a directory`);
    return value;
  }

  async getFileHandle(name, { create = false } = {}) {
    if (!this.children.has(name)) {
      if (!create) throw new Error(`Missing file: ${name}`);
      this.children.set(name, new FakeFileHandle());
    }
    const value = this.children.get(name);
    if (value.kind !== "file") throw new Error(`${name} is not a file`);
    return value;
  }

  async removeEntry(name) {
    this.children.delete(name);
  }

  async *entries() {
    yield* this.children.entries();
  }
}

class FakeFileHandle {
  kind = "file";

  constructor() {
    this.bytes = new Uint8Array();
  }

  async createWritable() {
    return {
      write: async (bytes) => {
        this.bytes = new Uint8Array(bytes);
      },
      close: async () => {}
    };
  }

  async getFile() {
    const bytes = this.bytes;
    return {
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
  }
}
