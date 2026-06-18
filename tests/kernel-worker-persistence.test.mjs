import assert from "node:assert/strict";
import test from "node:test";
import { OpfsPersistenceDriver } from "../packages/fs/src/opfs-driver.js";
import { KernelWorkerHost } from "../packages/kernel/src/kernel-worker-host.js";

test("KernelWorkerHost hydrates and persists project files through OPFS", async () => {
  const driver = new OpfsPersistenceDriver(new FakeDirectoryHandle());
  const messages = [];
  const first = new KernelWorkerHost({
    persistenceDriver: driver,
    postMessage: (message) => messages.push(message)
  });

  await first.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await first.handleMessage({
    id: "write",
    type: "writeFile",
    payload: { path: "/workspace/src/app.js", content: "console.log('persisted')" }
  });

  const secondMessages = [];
  const second = new KernelWorkerHost({
    persistenceDriver: driver,
    postMessage: (message) => secondMessages.push(message)
  });
  await second.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await second.handleMessage({
    id: "read",
    type: "readFile",
    payload: { path: "/workspace/src/app.js" }
  });

  assert.equal(secondMessages.at(-1).payload.content, "console.log('persisted')");
});

test("KernelWorkerHost persists command outputs and reports storage status", async () => {
  const driver = new OpfsPersistenceDriver(new FakeDirectoryHandle());
  const messages = [];
  const host = new KernelWorkerHost({
    persistenceDriver: driver,
    storageEstimate: async () => ({ usage: 123, quota: 1000 }),
    postMessage: (message) => messages.push(message)
  });

  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.handleMessage({
    id: "run",
    type: "runCommand",
    payload: { commandLine: "echo generated > generated.txt" }
  });
  assert.equal(await driver.readFile("/workspace/generated.txt", "utf8"), "generated\n");

  await host.handleMessage({ id: "status", type: "status" });
  const status = messages.find((message) => message.type === "reply" && message.requestId === "status").payload;
  assert.equal(status.storage.usage, 123);
  assert.equal(status.storage.quota, 1000);
  assert.equal(status.storage.persistent, true);
  assert.equal(status.permissions.allowPersistentStorage, true);
});

test("KernelWorkerHost clears node_modules from memory and OPFS", async () => {
  const driver = new OpfsPersistenceDriver(new FakeDirectoryHandle());
  const messages = [];
  const host = new KernelWorkerHost({
    persistenceDriver: driver,
    postMessage: (message) => messages.push(message)
  });

  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.writeFile("/workspace/node_modules/pkg/index.js", "module.exports = true;");
  await host.writeFile("/workspace/package-lock.opencontainers.json", "{}");

  await host.handleMessage({ id: "clear", type: "clearNodeModules" });
  const reply = messages.find((message) => message.type === "reply" && message.requestId === "clear").payload;
  assert.equal(reply.files.some((file) => file.path.includes("node_modules")), false);
  assert.deepEqual(await driver.list("/workspace/node_modules"), []);

  await host.handleMessage({ id: "read-lock", type: "readFile", payload: { path: "/workspace/package-lock.opencontainers.json" } });
  const readReply = messages.find((message) => message.type === "reply" && message.requestId === "read-lock").payload;
  assert.equal(readReply.ok, false);
});

test("KernelWorkerHost resetFilesystem clears persisted project state", async () => {
  const driver = new OpfsPersistenceDriver(new FakeDirectoryHandle());
  const messages = [];
  const host = new KernelWorkerHost({
    persistenceDriver: driver,
    postMessage: (message) => messages.push(message)
  });

  await host.handleMessage({ id: "init", type: "initProject", payload: { projectId: "demo" } });
  await host.writeFile("/workspace/custom.txt", "remove me");
  await host.handleMessage({ id: "reset", type: "resetFilesystem", payload: {} });

  assert.equal(host.kernel.fs.existsSync("/workspace/custom.txt"), false);
  assert.deepEqual((await driver.list("/workspace")).map((entry) => entry.path).sort(), [
    "/workspace/package.json",
    "/workspace/server.js"
  ]);
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

  async removeEntry(name, { recursive = false } = {}) {
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
