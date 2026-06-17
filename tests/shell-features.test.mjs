import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("shell pipes stdout between commands", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("sh", ["-c", "echo piped | cat"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "piped\n");
});

test("shell redirects stdout and stderr with overwrite and append", async () => {
  const kernel = new Kernel();
  const first = await kernel.run("sh", ["-c", "echo first > out.txt; echo second >> out.txt"], { cwd: "/workspace" });
  assert.equal(first.status, 0, first.stderr.toString());
  assert.equal(first.stdout.toString(), "");
  assert.equal(kernel.fs.readFileSync("/workspace/out.txt", "utf8"), "first\nsecond\n");

  const second = await kernel.run("sh", ["-c", "node -e \"console.error('bad')\" 2> err.txt"], { cwd: "/workspace" });
  assert.equal(second.status, 0, second.stderr.toString());
  assert.equal(second.stdout.toString(), "");
  assert.equal(kernel.fs.readFileSync("/workspace/err.txt", "utf8"), "bad\n");
});

test("shell expands basic globs against the virtual filesystem", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/a.txt", "A");
  kernel.fs.writeFileSync("/workspace/b.txt", "B");
  kernel.fs.writeFileSync("/workspace/c.js", "C");

  const result = await kernel.run("sh", ["-c", "cat *.txt"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "AB");
});

test("npm run scripts use shell pipes, redirects, and globs", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/a.txt", "A");
  kernel.fs.writeFileSync("/workspace/b.txt", "B");
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({
    scripts: {
      build: "cat *.txt | cat > bundle.txt"
    }
  }));

  const result = await kernel.run("npm", ["run", "build"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "");
  assert.equal(kernel.fs.readFileSync("/workspace/bundle.txt", "utf8"), "AB");
});

test("sync shell execution supports pipes and redirects for execSync", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { execSync } = require('child_process');
      console.log(execSync('echo sync | cat').toString().trim());
      execSync('echo file > sync.txt');
      console.log(require('fs').readFileSync('sync.txt', 'utf8').trim());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "sync\nfile\n");
});
