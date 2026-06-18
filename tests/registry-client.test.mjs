import assert from "node:assert/strict";
import { Buffer as NodeBuffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { OpenContainersBuffer } from "../packages/runtime-node/src/builtins/buffer.js";
import { RegistryClient, verifyIntegrity } from "../packages/npm/src/registry-client.js";

test("RegistryClient downloads, verifies, decompresses, and extracts npm tarballs", async () => {
  const tar = createTar({
    "package/package.json": JSON.stringify({ name: "demo", version: "1.0.0", main: "index.js" }),
    "package/index.js": "module.exports = 'demo';"
  });
  const tgz = gzipSync(tar);
  const integrity = `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(tgz);

  try {
    const client = new RegistryClient();
    const files = await client.packageFiles("demo", "1.0.0", {
      dist: { tarball: "https://registry.example/demo.tgz", integrity }
    });
    assert.equal(Buffer.from(files["package.json"]).toString(), JSON.stringify({ name: "demo", version: "1.0.0", main: "index.js" }));
    assert.equal(Buffer.from(files["index.js"]).toString(), "module.exports = 'demo';");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("RegistryClient retries npm tarballs when cached bytes fail integrity", async () => {
  const tar = createTar({
    "package/package.json": JSON.stringify({ name: "demo", version: "1.0.0", main: "index.js" }),
    "package/index.js": "module.exports = 'demo';"
  });
  const tgz = gzipSync(tar);
  const integrity = `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init?.cache || "default");
    return new Response(calls.length === 1 ? Buffer.from("stale cache") : tgz);
  };

  try {
    const client = new RegistryClient();
    const files = await client.packageFiles("demo", "1.0.0", {
      dist: { tarball: "https://registry.example/demo.tgz", integrity }
    });
    assert.deepEqual(calls, ["default", "reload"]);
    assert.equal(Buffer.from(files["index.js"]).toString(), "module.exports = 'demo';");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("RegistryClient accepts browser-decoded tar archives after integrity mismatch", async () => {
  const tar = createTar({
    "package/package.json": JSON.stringify({ name: "demo", version: "1.0.0", main: "index.js" }),
    "package/index.js": "module.exports = 'decoded';"
  });
  const tgz = gzipSync(tar);
  const integrity = `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init?.cache || "default");
    return new Response(tar);
  };

  try {
    const client = new RegistryClient();
    const files = await client.packageFiles("demo", "1.0.0", {
      dist: { tarball: "https://registry.example/demo.tgz", integrity }
    });
    assert.deepEqual(calls, ["default"]);
    assert.equal(Buffer.from(files["index.js"]).toString(), "module.exports = 'decoded';");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("RegistryClient accepts valid package archives after repeated browser integrity mismatch", async () => {
  const tar = createTar({
    "package/package.json": JSON.stringify({ name: "demo", version: "1.0.0", main: "index.js" }),
    "package/index.js": "module.exports = 'valid-package';"
  });
  const tgz = gzipSync(tar);
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init?.cache || "default");
    return new Response(tgz);
  };

  try {
    const client = new RegistryClient();
    const files = await client.packageFiles("demo", "1.0.0", {
      dist: { tarball: "https://registry.example/demo.tgz", integrity: "sha512-invalid" }
    });
    assert.deepEqual(calls, ["default", "reload"]);
    assert.equal(Buffer.from(files["index.js"]).toString(), "module.exports = 'valid-package';");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("RegistryClient accepts scoped package tarballs with non-package roots after retry", async () => {
  const tar = createTar({
    "ws/package.json": JSON.stringify({ name: "@types/ws", version: "8.18.1", types: "index.d.ts" }),
    "ws/index.d.ts": "export {};",
    "ws/README.md": "types"
  });
  const tgz = gzipSync(tar);
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init?.cache || "default");
    return new Response(tgz);
  };

  try {
    const client = new RegistryClient();
    const files = await client.packageFiles("@types/ws", "8.18.1", {
      dist: { tarball: "https://registry.example/@types/ws.tgz", integrity: "sha512-invalid" }
    });
    assert.deepEqual(calls, ["default", "reload"]);
    assert.equal(Buffer.from(files["package.json"]).toString(), JSON.stringify({ name: "@types/ws", version: "8.18.1", types: "index.d.ts" }));
    assert.equal(Buffer.from(files["index.d.ts"]).toString(), "export {};");
    assert.equal(files["ws/package.json"], undefined);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("RegistryClient reports package details when integrity mismatch is not a valid package archive", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.from("not an npm archive"));

  try {
    const client = new RegistryClient();
    await assert.rejects(
      () => client.packageFiles("demo", "1.0.0", {
        dist: { tarball: "https://registry.example/demo.tgz", integrity: "sha512-invalid" }
      }),
      error => {
        assert.equal(error.code, "ERR_OPENCONTAINERS_NPM_INTEGRITY");
        assert.match(error.message, /demo@1\.0\.0/);
        assert.match(error.message, /registry\.example\/demo\.tgz/);
        assert.match(error.message, /signature:/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("verifyIntegrity accepts multi-token and base64url npm SRI strings", async () => {
  const bytes = Buffer.from("demo tarball bytes");
  const sha512 = createHash("sha512").update(bytes).digest("base64");
  const sha512Url = sha512.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await verifyIntegrity(bytes, `sha1-invalid sha512-${sha512}`);
  await verifyIntegrity(bytes, `sha512-${sha512Url}`);
});

test("verifyIntegrity does not use OpenContainersBuffer utf8 output for base64 digests", async () => {
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  Object.defineProperty(globalThis, "Buffer", {
    configurable: true,
    writable: true,
    value: OpenContainersBuffer
  });
  try {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const sha512 = createHash("sha512").update(bytes).digest("base64");
    await verifyIntegrity(bytes, `sha512-${sha512}`);
    assert.equal(OpenContainersBuffer.from(bytes).toString("base64"), NodeBuffer.from(bytes).toString("base64"));
  } finally {
    if (bufferDescriptor) Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
    else delete globalThis.Buffer;
  }
});

test("OpenContainersBuffer exposes Node-compatible unsafe allocation and integer writes", () => {
  const buffer = OpenContainersBuffer.allocUnsafe(10);
  assert.equal(buffer.length, 10);
  assert.equal(OpenContainersBuffer.allocUnsafeSlow(2).length, 2);

  buffer.writeUInt8(0x81, 0);
  buffer.writeUInt16BE(0x0203, 1);
  buffer.writeUInt32BE(0x04050607, 3);
  assert.equal(buffer.readUInt8(0), 0x81);
  assert.equal(buffer.readUInt16BE(1), 0x0203);
  assert.equal(buffer.readUInt32BE(3), 0x04050607);

  buffer.writeInt8(-1, 0);
  buffer.writeInt16BE(-2, 1);
  buffer.writeInt32BE(-3, 3);
  assert.equal(buffer.readInt8(0), -1);
  assert.equal(buffer.readInt16BE(1), -2);
  assert.equal(buffer.readInt32BE(3), -3);
  buffer.writeInt16LE(-4, 1);
  buffer.writeInt32LE(-5, 3);
  assert.equal(buffer.readInt16LE(1), -4);
  assert.equal(buffer.readInt32LE(3), -5);

  const text = OpenContainersBuffer.alloc(6);
  assert.equal(text.write("hello world", 0, 5), 5);
  assert.equal(text.toString("utf8", 0, 5), "hello");
  assert.equal(OpenContainersBuffer.from("SGVsbG8=", "base64").toString(), "Hello");
  assert.equal(OpenContainersBuffer.concat([OpenContainersBuffer.from("he"), OpenContainersBuffer.from("llo")]).toString(), "hello");
  assert.equal(OpenContainersBuffer.from("abc").copy(text, 1), 3);
  assert.equal(text.toString("utf8", 1, 4), "abc");
});

test("OpenContainersBuffer keeps base64id on the Node-compatible ID path", () => {
  const rand = OpenContainersBuffer.alloc(15);
  assert.equal(typeof rand.writeInt32BE, "function");

  rand.writeInt32BE(1, 11);
  OpenContainersBuffer.from([0xde, 0xad, 0xbe, 0xef]).copy(rand);

  assert.match(rand.toString("base64").replace(/\//g, "_").replace(/\+/g, "-"), /^[A-Za-z0-9_-]+={0,2}$/);
  assert.equal(/^[0-9]+$/.test(rand.toString("base64")), false);
});

function createTar(files) {
  const chunks = [];
  for (const [name, content] of Object.entries(files)) {
    const bytes = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
    header.fill(" ", 148, 156);
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    chunks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}
