import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
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

test("verifyIntegrity accepts multi-token and base64url npm SRI strings", async () => {
  const bytes = Buffer.from("demo tarball bytes");
  const sha512 = createHash("sha512").update(bytes).digest("base64");
  const sha512Url = sha512.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await verifyIntegrity(bytes, `sha1-invalid sha512-${sha512}`);
  await verifyIntegrity(bytes, `sha512-${sha512Url}`);
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
