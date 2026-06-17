import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("fs.createReadStream streams virtual file contents", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/input.txt", "streamed");

  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      const stream = fs.createReadStream('input.txt', { encoding: 'utf8' });
      stream.on('data', (chunk) => console.log(chunk));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "streamed\n");
});

test("fs.createWriteStream writes virtual file contents", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      const stream = fs.createWriteStream('output.txt');
      stream.write('written');
      stream.end('!');
      console.log(fs.readFileSync('output.txt', 'utf8'));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "written!\n");
});

test("fs.watchFile observes virtual file stat changes", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      fs.watchFile('watched.txt', (curr, prev) => {
        console.log(prev.size + '->' + curr.size);
      });
      fs.writeFileSync('watched.txt', 'newer');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "3->5\n");
});
