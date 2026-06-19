import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("shell commands resolve symlinked node bins from PATH", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/tmp/pkg", { recursive: true });
  kernel.fs.mkdirSync("/tmp/bin", { recursive: true });
  kernel.fs.writeFileSync("/tmp/pkg/hello.js", [
    "#!/usr/bin/env node",
    "console.log(`bin args: ${process.argv.slice(2).join(',')}`);",
    ""
  ].join("\n"));
  kernel.fs.symlinkSync("../pkg/hello.js", "/tmp/bin/hello");

  const result = await kernel.run("sh", ["-c", "'hello' one two"], {
    cwd: "/workspace",
    env: { PATH: "/tmp/bin:/bin:/usr/bin" }
  });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "bin args: one,two\n");
});
