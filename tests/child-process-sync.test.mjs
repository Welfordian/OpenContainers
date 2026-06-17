import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("child_process.spawnSync and execSync run simple virtual commands synchronously", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { spawnSync, execSync } = require('child_process');
      const child = spawnSync('node', ['-e', "console.log('sync child')"]);
      console.log(child.status);
      console.log(child.stdout.toString().trim());
      console.log(execSync('echo sync shell').toString().trim());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "0\nsync child\nsync shell\n");
});
