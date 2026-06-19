import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("shared command builtins run directly and through sh -c", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/a.txt", "alpha\n");

  const directLs = await kernel.run("ls", [], { cwd: "/workspace" });
  assert.equal(directLs.status, 0, directLs.stderr.toString());
  assert.equal(directLs.stdout.toString(), "a.txt\n");

  const directClear = await kernel.run("clear", [], { cwd: "/workspace" });
  assert.equal(directClear.status, 0, directClear.stderr.toString());
  assert.equal(directClear.stdout.toString(), "\x1b[2J\x1b[H");

  const shellLs = await kernel.run("sh", ["-c", "ls"], { cwd: "/workspace" });
  assert.equal(shellLs.status, 0, shellLs.stderr.toString());
  assert.equal(shellLs.stdout.toString(), "a.txt\n");
});

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

test("shell resolves tilde paths for builtins, redirects, and globs", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/src", { recursive: true });
  kernel.fs.writeFileSync("/workspace/src/a.txt", "A");
  kernel.fs.writeFileSync("/workspace/src/b.txt", "B");

  const result = await kernel.run("sh", ["-c", "cd src && cat ~/src/*.txt > ~/out.txt && cd ~ && pwd"], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "/workspace\n");
  assert.equal(kernel.fs.readFileSync("/workspace/out.txt", "utf8"), "AB");
});

test("common POSIX-style builtins mutate and inspect the virtual filesystem", async () => {
  const kernel = new Kernel();
  const script = [
    "mkdir -p src/nested",
    "printf hello > src/nested/file.txt",
    "cp -r src copy",
    "mv copy/nested/file.txt copy/nested/moved.txt",
    "touch empty.txt",
    "ls -R .",
    "grep -n hello copy/nested/moved.txt",
    "wc -c copy/nested/moved.txt",
    "find . -name moved.txt -type f",
    "rm -rf src empty.txt"
  ].join("; ");

  const result = await kernel.run("sh", ["-c", script], { cwd: "/workspace" });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), /copy:/);
  assert.match(result.stdout.toString(), /1:hello/);
  assert.match(result.stdout.toString(), /5 copy\/nested\/moved\.txt/);
  assert.match(result.stdout.toString(), /\.\/copy\/nested\/moved\.txt/);
  assert.equal(kernel.fs.readFileSync("/workspace/copy/nested/moved.txt", "utf8"), "hello");
  assert.equal(kernel.fs.existsSync("/workspace/src"), false);
  assert.equal(kernel.fs.existsSync("/workspace/empty.txt"), false);
});

test("unsupported builtin flags return nonzero with concise stderr", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("ls", ["-z"], { cwd: "/workspace" });

  assert.equal(result.status, 2);
  assert.equal(result.stdout.toString(), "");
  assert.equal(result.stderr.toString(), "ls: unsupported option -- z\n");
});

test("shell exit builtin sets the process status", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("sh", ["-c", "echo before && exit 7 && echo after"], { cwd: "/workspace" });

  assert.equal(result.status, 7, result.stderr.toString());
  assert.equal(result.stdout.toString(), "before\n");
});

test("sync shell exit builtin sets the process status", async () => {
  const kernel = new Kernel();
  const result = kernel.spawnSync("sh", ["-c", "exit 9"], { cwd: "/workspace" });

  assert.equal(result.status, 9, result.stderr.toString());
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
  assert.match(result.stdout.toString(), /> build/);
  assert.match(result.stdout.toString(), /> cat \*\.txt \| cat > bundle\.txt/);
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
