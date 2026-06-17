import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("tty built-in exposes TTY detection and write stream capabilities", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const tty = require('tty');
      const stream = new tty.WriteStream(1);
      console.log(tty.isatty(1));
      console.log(stream.isTTY);
      console.log(stream.getColorDepth());
      console.log(stream.hasColors());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\ntrue\n24\ntrue\n");
});

test("readline built-in supports questions, line events, prompts, and close", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const readline = require('node:readline');
      const output = { write(value) { console.log('out:' + value); } };
      const rl = readline.createInterface({ output, prompt: 'welford> ' });
      rl.on('line', (line) => console.log('line:' + line));
      rl.on('close', () => console.log('closed'));
      rl.prompt();
      rl.question('name? ', (answer) => console.log('answer:' + answer));
      rl.write('Josh\\n');
      rl.close();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "out:welford> ",
    "out:name? ",
    "answer:Josh",
    "line:Josh",
    "closed",
    ""
  ].join("\n"));
});
