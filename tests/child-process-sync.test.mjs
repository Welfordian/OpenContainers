import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("child_process.spawnSync and execSync run simple virtual commands synchronously", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const childProcess = require('child_process');
      const { ChildProcess, _forkChild, spawn, spawnSync, exec, execFile, execFileSync, execSync, fork } = childProcess;
      console.log('keys', Object.keys(childProcess).join(','));
      console.log('lengths', [ChildProcess.length, _forkChild.length, spawn.length, spawnSync.length, exec.length, execFile.length, execFileSync.length, execSync.length, fork.length].join(','));
      console.log('helper prototypes', ['spawn', 'spawnSync', 'exec', 'execFile', 'execFileSync', 'execSync', 'fork', '_forkChild'].map((name) => {
        const fn = childProcess[name];
        const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
        return [name, fn.name, fn.length, Object.hasOwn(fn, 'prototype'), descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, Object.getOwnPropertyNames(descriptor?.value ?? {}).join(','), descriptor?.value?.constructor === fn].join(':');
	      }).join('|'));
		      const prototypeMethods = ['spawn', 'kill', 'ref', 'unref'];
		      const childProcessPrototypeDescriptor = Object.getOwnPropertyDescriptor(ChildProcess, 'prototype');
		      console.log('prototype descriptor', [
		        childProcessPrototypeDescriptor.enumerable,
		        childProcessPrototypeDescriptor.configurable,
		        childProcessPrototypeDescriptor.writable,
		        Object.getOwnPropertyNames(childProcessPrototypeDescriptor.value).join(','),
		        childProcessPrototypeDescriptor.value.constructor === ChildProcess
		      ].join(':'));
		      console.log('prototype', Object.getOwnPropertyNames(ChildProcess.prototype).join(','));
	      console.log('prototype keys', Object.keys(ChildProcess.prototype).join(','));
	      console.log('prototype meta', prototypeMethods.map((name) => {
	        const descriptor = Object.getOwnPropertyDescriptor(ChildProcess.prototype, name);
	        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, 'prototype')].join(':');
	      }).join('|'));
	      const disposeDescriptor = Object.getOwnPropertyDescriptor(ChildProcess.prototype, Symbol.dispose);
	      console.log('dispose meta', [typeof ChildProcess.prototype[Symbol.dispose], ChildProcess.prototype[Symbol.dispose].name, ChildProcess.prototype[Symbol.dispose].length, disposeDescriptor.enumerable, disposeDescriptor.configurable, disposeDescriptor.writable, Object.hasOwn(disposeDescriptor.value, 'prototype'), Object.getOwnPropertySymbols(ChildProcess.prototype).map(String).join(',')].join(':'));
	      const disposable = new ChildProcess();
	      let disposeKills = 0;
	      disposable.kill = () => { disposeKills += 1; return true; };
	      console.log('dispose result', disposable[Symbol.dispose](), disposeKills);
	      const direct = new ChildProcess();
	      console.log(typeof ChildProcess, direct instanceof ChildProcess, direct.connected, direct.killed, direct.exitCode);
      console.log('direct refs', direct.ref(), direct.unref(), direct.kill(), direct.killed);
      try {
        _forkChild();
      } catch (error) {
        console.log(error.code);
      }
      const asyncChild = spawn('node', ['-e', ""]);
      console.log(asyncChild instanceof ChildProcess, typeof asyncChild.kill, Object.hasOwn(asyncChild, 'kill'), typeof asyncChild.ref, typeof asyncChild.unref, asyncChild.ref(), asyncChild.unref());
      const child = spawnSync('node', ['-e', "console.log('sync child')"]);
      console.log(child.status);
      console.log(child.stdout.toString().trim());
      console.log(execSync('echo sync shell').toString().trim());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
	  assert.equal(result.stdout.toString(), "keys _forkChild,ChildProcess,exec,execFile,execFileSync,execSync,fork,spawn,spawnSync\nlengths 0,2,3,3,3,4,3,2,1\nhelper prototypes spawn:spawn:3:true:false:false:true:constructor:true|spawnSync:spawnSync:3:true:false:false:true:constructor:true|exec:exec:3:true:false:false:true:constructor:true|execFile:execFile:4:true:false:false:true:constructor:true|execFileSync:execFileSync:3:true:false:false:true:constructor:true|execSync:execSync:2:true:false:false:true:constructor:true|fork:fork:1:true:false:false:true:constructor:true|_forkChild:_forkChild:2:true:false:false:true:constructor:true\nprototype descriptor false:false:true:constructor,spawn,kill,ref,unref:true\nprototype constructor,spawn,kill,ref,unref\nprototype keys spawn,kill,ref,unref\nprototype meta spawn:spawn:1:true:true:true:true|kill:kill:1:true:true:true:true|ref:ref:0:true:true:true:true|unref:unref:0:true:true:true:true\ndispose meta function::0:true:true:true:true:Symbol(Symbol.dispose)\ndispose result undefined 1\nfunction true false false null\ndirect refs undefined undefined false false\nERR_OPENCONTAINERS_CHILD_PROCESS_UNSUPPORTED\ntrue function false function function undefined undefined\n0\nsync child\nsync shell\n");
});

test("child_process.execFile and execFileSync expose Node-style stdout callbacks", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/exec-file.mjs", `
    import { exec, execFile, execFileSync } from "node:child_process";

    function runExecFile(args, options) {
      return new Promise((resolve) => {
        execFile("node", args, options, (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        });
      });
    }

    function runExec(command, options) {
      return new Promise((resolve) => {
        exec(command, options, (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        });
      });
    }

    const stdout = execFileSync("node", ["-e", "console.log('sync file')"]).toString().trim();
    console.log("sync:", stdout);

    const inheritedArgs = await new Promise((resolve, reject) => {
      execFile("node", ["-e", "console.log('async file')"], (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout: stdout.trim(), stderr });
      });
    });
    console.log("async:", JSON.stringify(inheritedArgs));

    const overloadedOptions = await new Promise((resolve, reject) => {
      execFile("echo", { shell: true }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout: stdout.trim(), stderr });
      });
    });
    console.log("overload:", JSON.stringify(overloadedOptions));

    const buffered = await runExecFile(["-e", "process.stdout.write('bufout'); process.stderr.write('buferr')"], { encoding: "buffer" });
    console.log("async buffer:", Buffer.isBuffer(buffered.stdout), buffered.stdout.toString(), Buffer.isBuffer(buffered.stderr), buffered.stderr.toString());

    const execBuffered = await runExec("printf bufexec", { encoding: "buffer" });
    console.log("async exec buffer:", Buffer.isBuffer(execBuffered.stdout), execBuffered.stdout.toString(), Buffer.isBuffer(execBuffered.stderr), execBuffered.stderr.toString());

    const perStreamOk = await runExecFile(["-e", "process.stdout.write('ab'); process.stderr.write('cd')"], { maxBuffer: 3, encoding: "utf8" });
    console.log("async maxBuffer per stream:", perStreamOk.error, JSON.stringify(perStreamOk.stdout), JSON.stringify(perStreamOk.stderr));

    const boundaryOk = await runExecFile(["-e", "process.stdout.write('abc'); process.stderr.write('xyz')"], { maxBuffer: 3, encoding: "utf8" });
    console.log("async maxBuffer boundary:", boundaryOk.error, JSON.stringify(boundaryOk.stdout), JSON.stringify(boundaryOk.stderr));

    const stdoutLimited = await runExecFile(["-e", "process.stdout.write('abcd'); process.stderr.write('e')"], { maxBuffer: 3, encoding: "utf8" });
    console.log("async maxBuffer stdout:", stdoutLimited.error.name, stdoutLimited.error.code, stdoutLimited.error.message, stdoutLimited.error.cmd.startsWith("node -e "), JSON.stringify(stdoutLimited.stdout), JSON.stringify(stdoutLimited.stderr), Object.keys(stdoutLimited.error).join(","), "killed" in stdoutLimited.error, "signal" in stdoutLimited.error, "stdout" in stdoutLimited.error, "stderr" in stdoutLimited.error);

    const stderrLimited = await runExecFile(["-e", "process.stdout.write('a'); process.stderr.write('bcde')"], { maxBuffer: 3, encoding: "utf8" });
    console.log("async maxBuffer stderr:", stderrLimited.error.name, stderrLimited.error.code, stderrLimited.error.message, JSON.stringify(stderrLimited.stdout), JSON.stringify(stderrLimited.stderr));

    const bufferLimited = await runExecFile(["-e", "process.stdout.write('abcd')"], { maxBuffer: 3, encoding: "buffer" });
    console.log("async maxBuffer buffer:", bufferLimited.error.name, bufferLimited.error.code, Buffer.isBuffer(bufferLimited.stdout), bufferLimited.stdout.toString(), Buffer.isBuffer(bufferLimited.stderr), bufferLimited.stderr.toString());

    const zeroLimited = await runExecFile(["-e", "process.stdout.write('abcd')"], { maxBuffer: 0, encoding: "utf8" });
    console.log("async maxBuffer zero:", zeroLimited.error.code, JSON.stringify(zeroLimited.stdout), JSON.stringify(zeroLimited.stderr));

    try {
      execFile("node", ["-e", ""], { maxBuffer: "3" }, () => {});
    } catch (error) {
      console.log("async maxBuffer type:", error.name, error.code);
    }

    try {
      execFile("node", ["-e", ""], { maxBuffer: -1 }, () => {});
    } catch (error) {
      console.log("async maxBuffer range:", error.name, error.code);
    }

    const execLimited = await runExec("printf abcd", { maxBuffer: 3, encoding: "utf8" });
    console.log("async exec maxBuffer:", execLimited.error.code, execLimited.error.message, JSON.stringify(execLimited.stdout), JSON.stringify(execLimited.stderr));

    const timeoutLimited = await runExecFile(["-e", "setTimeout(() => {}, 1000)"], { timeout: 5, killSignal: "SIGKILL", encoding: "utf8" });
    console.log("async timeout execFile:", timeoutLimited.error.killed, timeoutLimited.error.signal, timeoutLimited.error.code, JSON.stringify(timeoutLimited.stdout), JSON.stringify(timeoutLimited.stderr));

    const execTimeoutLimited = await runExec("node -e 'setTimeout(() => {}, 1000)'", { timeout: 5, encoding: "utf8" });
    console.log("async timeout exec:", execTimeoutLimited.error.killed, execTimeoutLimited.error.signal, execTimeoutLimited.error.code, JSON.stringify(execTimeoutLimited.stdout), JSON.stringify(execTimeoutLimited.stderr));

    try {
      execFile("node", ["-e", ""], { timeout: "5" }, () => {});
    } catch (error) {
      console.log("async timeout type:", error.name, error.code);
    }

    try {
      execFile("node", ["-e", ""], { timeout: -1 }, () => {});
    } catch (error) {
      console.log("async timeout range:", error.name, error.code);
    }
  `);

  const result = await kernel.run("node", ["exec-file.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync: sync file",
    'async: {"stdout":"async file","stderr":""}',
    'overload: {"stdout":"","stderr":""}',
    "async buffer: true bufout true buferr",
    "async exec buffer: true bufexec true ",
    'async maxBuffer per stream: null "ab" "cd"',
    'async maxBuffer boundary: null "abc" "xyz"',
    'async maxBuffer stdout: RangeError ERR_CHILD_PROCESS_STDIO_MAXBUFFER stdout maxBuffer length exceeded true "abc" "" code,cmd false false false false',
    'async maxBuffer stderr: RangeError ERR_CHILD_PROCESS_STDIO_MAXBUFFER stderr maxBuffer length exceeded "a" "bcd"',
    "async maxBuffer buffer: RangeError ERR_CHILD_PROCESS_STDIO_MAXBUFFER true abc true ",
    'async maxBuffer zero: ERR_CHILD_PROCESS_STDIO_MAXBUFFER "" ""',
    "async maxBuffer type: TypeError ERR_INVALID_ARG_TYPE",
    "async maxBuffer range: RangeError ERR_OUT_OF_RANGE",
    'async exec maxBuffer: ERR_CHILD_PROCESS_STDIO_MAXBUFFER stdout maxBuffer length exceeded "abc" ""',
    'async timeout execFile: true SIGKILL null "" ""',
    'async timeout exec: true SIGTERM null "" ""',
    "async timeout type: TypeError ERR_INVALID_ARG_TYPE",
    "async timeout range: RangeError ERR_OUT_OF_RANGE"
  ]);
});

test("child_process shell option and spawnSync input follow common Node paths", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/shell-spawn.mjs", `
    import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";

    const shellChild = spawn("echo shell child && exit 5", { shell: true });
    let output = "";
    shellChild.stdout.on("data", (chunk) => { output += chunk; });
    const shellCode = await new Promise((resolve) => shellChild.on("close", resolve));
    console.log("shell:", shellCode, JSON.stringify(output));

    const quoted = spawnSync("printf", ["%s", "a b"], { shell: true, encoding: "utf8" });
    console.log("quoted:", quoted.status, JSON.stringify(quoted.stdout));

    const piped = spawnSync("cat", { input: "hello stdin", encoding: "utf8" });
    console.log("input:", piped.status, JSON.stringify(piped.stdout));
    console.log("encoding buffer:", Buffer.isBuffer(spawnSync("node", ["-e", "process.stdout.write('a')"], { encoding: "buffer" }).stdout), Buffer.isBuffer(execFileSync("node", ["-e", "process.stdout.write('b')"], { encoding: "buffer" })), Buffer.isBuffer(execSync("printf c", { encoding: "buffer" })));

    const limited = spawnSync("node", ["-e", "process.stdout.write('abc'); process.stderr.write('d')"], { maxBuffer: 3, encoding: "utf8", killSignal: "SIGKILL" });
    console.log("maxBuffer:", limited.status, limited.signal, limited.error.code, limited.error.errno, limited.error.syscall, JSON.stringify(limited.stdout), JSON.stringify(limited.stderr), limited.output[1] === limited.stdout, limited.output[2] === limited.stderr);

    const unlimited = spawnSync("node", ["-e", "process.stdout.write('abcd')"], { maxBuffer: 0, encoding: "utf8" });
    console.log("maxBuffer zero:", unlimited.status, unlimited.error, JSON.stringify(unlimited.stdout));

    try {
      spawnSync("node", ["-e", ""], { maxBuffer: "3" });
    } catch (error) {
      console.log("maxBuffer type:", error.name, error.code);
    }

    try {
      spawnSync("node", ["-e", ""], { maxBuffer: -1 });
    } catch (error) {
      console.log("maxBuffer range:", error.name, error.code);
    }

    try {
      execFileSync("node", ["-e", "process.stdout.write('abcd')"], { maxBuffer: 3, encoding: "utf8" });
    } catch (error) {
      console.log("execFile maxBuffer:", error.status, error.signal, error.code, JSON.stringify(error.stdout), JSON.stringify(error.stderr));
    }

    const timedOut = spawnSync("node", ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)"], { timeout: 5, encoding: "utf8", killSignal: "SIGKILL" });
    console.log("timeout:", timedOut.status, timedOut.signal, timedOut.error.code, timedOut.error.errno, timedOut.error.syscall, JSON.stringify(timedOut.stdout), JSON.stringify(timedOut.stderr), timedOut.output[1] === timedOut.stdout, timedOut.output[2] === timedOut.stderr);

    try {
      spawnSync("node", ["-e", ""], { timeout: "5" });
    } catch (error) {
      console.log("timeout type:", error.name, error.code);
    }

    try {
      spawnSync("node", ["-e", ""], { timeout: -1 });
    } catch (error) {
      console.log("timeout range:", error.name, error.code);
    }

    try {
      execFileSync("node", ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)"], { timeout: 5, encoding: "utf8" });
    } catch (error) {
      console.log("execFile timeout:", error.status, error.signal, error.code, error.errno, error.syscall, JSON.stringify(error.stdout), JSON.stringify(error.stderr));
    }
  `);

  const result = await kernel.run("node", ["shell-spawn.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'shell: 5 "shell child\\n"',
    'quoted: 0 "a b"',
    'input: 0 "hello stdin"',
    "encoding buffer: true true true",
    'maxBuffer: null SIGKILL ENOBUFS -55 spawnSync node "abc" "d" true true',
    'maxBuffer zero: 0 undefined "abcd"',
    "maxBuffer type: TypeError ERR_INVALID_ARG_TYPE",
    "maxBuffer range: RangeError ERR_OUT_OF_RANGE",
    'execFile maxBuffer: null SIGTERM ENOBUFS "abcd" ""',
    'timeout: null SIGKILL ETIMEDOUT -60 spawnSync node "" "" true true',
    "timeout type: TypeError ERR_INVALID_ARG_TYPE",
    "timeout range: RangeError ERR_OUT_OF_RANGE",
    'execFile timeout: null SIGTERM ETIMEDOUT -60 spawnSync node "" ""'
  ]);
});

test("child_process sync helpers report missing executable ENOENT like Node", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/missing-sync.mjs", `
    import { execFileSync, spawnSync } from "node:child_process";

    const missing = "definitely-missing-opencontainers-command";
    const result = spawnSync(missing, ["--flag"], { encoding: "utf8" });
    console.log("spawn keys:", Object.keys(result).join(","));
    console.log("spawn result:", result.status, result.signal, result.pid, result.output, result.stdout, result.stderr);
    console.log("spawn error:", result.error.name, result.error.code, result.error.errno, result.error.syscall, result.error.path, JSON.stringify(result.error.spawnargs), Object.keys(result.error).join(","), result.error.message);

    try {
      execFileSync(missing, ["--flag"], { encoding: "utf8" });
    } catch (error) {
      console.log("execFile error:", error.name, error.code, error.errno, error.syscall, error.path, JSON.stringify(error.spawnargs), error.status, error.signal, error.pid, error.output, error.stdout, error.stderr, Object.keys(error).join(","), error.message);
    }
  `);

  const result = await kernel.run("node", ["missing-sync.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "spawn keys: error,status,signal,output,pid,stdout,stderr",
    "spawn result: null null 0 null undefined undefined",
    'spawn error: Error ENOENT -2 spawnSync definitely-missing-opencontainers-command definitely-missing-opencontainers-command ["--flag"] errno,code,syscall,path,spawnargs spawnSync definitely-missing-opencontainers-command ENOENT',
    'execFile error: Error ENOENT -2 spawnSync definitely-missing-opencontainers-command definitely-missing-opencontainers-command ["--flag"] null null 0 null undefined undefined errno,code,syscall,path,spawnargs,error,status,signal,output,pid,stdout,stderr spawnSync definitely-missing-opencontainers-command ENOENT'
  ]);
});

test("child_process async helpers report missing executable ENOENT like Node", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/missing-async.mjs", `
    import { exec, execFile, spawn } from "node:child_process";

    async function runSpawn(command, args = [], options) {
      return await new Promise((resolve) => {
        const child = spawn(command, args, options);
        const rows = [];
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => { stdout += chunk; });
        child.stderr?.on("data", (chunk) => { stderr += chunk; });
        child.on("spawn", () => rows.push("spawn"));
        child.on("error", (error) => rows.push(["error", error.name, error.code, error.errno, error.syscall, error.path, JSON.stringify(error.spawnargs), error.message].join(":")));
        child.on("exit", (code, signal) => rows.push(["exit", code, signal].join(":")));
        child.on("close", (code, signal) => {
          rows.push(["close", code, signal].join(":"));
          resolve({ rows, stdout, stderr });
        });
      });
    }

    function runExecFile(command, args = [], options) {
      return new Promise((resolve) => {
        const rows = [];
        const child = execFile(command, args, options, (error, stdout, stderr) => {
          rows.push(["callback", stdout, stderr, error?.name, error?.code, error?.errno, error?.syscall, error?.path, JSON.stringify(error?.spawnargs), error?.cmd, error?.message].join(":"));
        });
        child.on("spawn", () => rows.push("spawn"));
        child.on("error", (error) => rows.push(["error", error.name, error.code, error.errno, error.syscall, error.path, JSON.stringify(error.spawnargs), error.cmd, error.message].join(":")));
        child.on("exit", (code, signal) => rows.push(["exit", code, signal].join(":")));
        child.on("close", (code, signal) => {
          rows.push(["close", code, signal].join(":"));
          setImmediate(() => resolve(rows));
        });
      });
    }

    const missing = "definitely-missing-opencontainers-command";
    console.log("spawn missing:", JSON.stringify(await runSpawn(missing, ["--flag"])));
    console.log("spawn shell missing:", JSON.stringify(await runSpawn(missing + " --flag", { shell: true })));
    console.log("execFile missing:", JSON.stringify(await runExecFile(missing, ["--flag"])));
    await new Promise((resolve) => exec(missing + " --flag", (error, stdout, stderr) => {
      console.log("exec shell missing:", JSON.stringify({ name: error.name, code: error.code, killed: error.killed, signal: error.signal, cmd: error.cmd, message: error.message, stdout, stderr }));
      resolve();
    }));
  `);

  const result = await kernel.run("node", ["missing-async.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'spawn missing: {"rows":["error:Error:ENOENT:-2:spawn definitely-missing-opencontainers-command:definitely-missing-opencontainers-command:[\\"--flag\\"]:spawn definitely-missing-opencontainers-command ENOENT","close:-2:"],"stdout":"","stderr":""}',
    'spawn shell missing: {"rows":["spawn","exit:127:","close:127:"],"stdout":"","stderr":"/bin/sh: definitely-missing-opencontainers-command: command not found\\n"}',
    'execFile missing: ["callback:::Error:ENOENT:-2:spawn definitely-missing-opencontainers-command:definitely-missing-opencontainers-command:[\\"--flag\\"]:definitely-missing-opencontainers-command --flag:spawn definitely-missing-opencontainers-command ENOENT","error:Error:ENOENT:-2:spawn definitely-missing-opencontainers-command:definitely-missing-opencontainers-command:[\\"--flag\\"]:definitely-missing-opencontainers-command --flag:spawn definitely-missing-opencontainers-command ENOENT","close:-2:"]',
    'exec shell missing: {"name":"Error","code":127,"killed":false,"signal":null,"cmd":"definitely-missing-opencontainers-command --flag","message":"Command failed: definitely-missing-opencontainers-command --flag\\n/bin/sh: definitely-missing-opencontainers-command: command not found\\n","stdout":"","stderr":"/bin/sh: definitely-missing-opencontainers-command: command not found\\n"}'
  ]);
});

test("child_process.spawn inherits default env and preserves shell exit status", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/child-process.mjs", `
    import { spawn } from "node:child_process";

    console.log("env HOME:", process.env.HOME);
    console.log("env PATH:", process.env.PATH);

    if (!process.env.HOME) throw new Error("Expected HOME to be set");
    if (!process.env.PATH) throw new Error("Expected PATH to be set");

    const child = spawn("sh", ["-c", "echo child works && exit 7"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        REPL_TEST_VAR: "hello"
      }
    });
    const spawnRows = [];
    child.on("spawn", () => {
      spawnRows.push([
        "spawn",
        child.spawnfile,
        JSON.stringify(child.spawnargs),
        Array.isArray(child.stdio),
        child.stdio.length,
        child.stdin === child.stdio[0],
        child.stdout === child.stdio[1],
        child.stderr === child.stdio[2],
        child.killed
      ].join(":"));
    });

    child.stdout.on("data", (chunk) => {
      console.log("stdout:", chunk.toString().trim());
    });

    child.stderr.on("data", (chunk) => {
      console.error("stderr:", chunk.toString().trim());
    });

    const code = await new Promise((resolve) => {
      child.on("close", resolve);
    });

    console.log("child exit code:", code);

    if (code !== 7) {
      throw new Error(\`Expected exit code 7, got \${code}\`);
    }
    console.log(spawnRows.join("|"));
  `);

  const result = await kernel.run("node", ["child-process.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), /env HOME: \/home\/opencontainers\n/);
  assert.match(result.stdout.toString(), /env PATH: .*\/workspace\/node_modules\/\.bin/);
  assert.match(result.stdout.toString(), /stdout: child works\n/);
  assert.match(result.stdout.toString(), /spawn:sh:\["sh","-c","echo child works && exit 7"\]:true:3:true:true:true:false\n/);
  assert.match(result.stdout.toString(), /child exit code: 7\n/);
  assert.equal(result.stderr.toString(), "");
});

test("child_process.spawn forwards inherited stdout and stderr", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/inherit.mjs", `
    import { spawn } from "node:child_process";

    const child = spawn("node", ["-e", "console.log('inherited out'); console.error('inherited err')"], {
      stdio: "inherit"
    });

    const code = await new Promise((resolve) => child.on("close", resolve));
    console.log("child exit code:", code);
  `);

  const result = await kernel.run("node", ["inherit.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "inherited out\nchild exit code: 0\n");
  assert.equal(result.stderr.toString(), "inherited err\n");
});

test("child_process.spawn supports AbortSignal cancellation", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/spawn-signal.mjs", `
    import { spawn } from "node:child_process";

    async function abortAfterSpawn() {
      const controller = new AbortController();
      const child = spawn("node", ["-e", "setTimeout(() => {}, 1000)"], {
        signal: controller.signal,
        killSignal: "SIGKILL"
      });
      const rows = [];
      child.on("error", (error) => {
        rows.push(["error", error.name, error.code, error.message, error.cause].join(":"));
      });
      const closed = new Promise((resolve) => {
        child.on("close", (code, signal) => {
          rows.push(["close", code, signal, child.killed, child.exitCode, child.signalCode].join(":"));
          resolve();
        });
      });
      controller.abort("stop");
      await closed;
      console.log(rows.join("|"));
    }

    async function abortBeforeSpawn() {
      const controller = new AbortController();
      controller.abort("pre");
      const child = spawn("node", ["-e", "setTimeout(() => {}, 1000)"], {
        signal: controller.signal
      });
      const rows = [];
      child.on("error", (error) => {
        rows.push(["error", error.name, error.code, error.message, error.cause].join(":"));
      });
      const closed = new Promise((resolve) => {
        child.on("close", (code, signal) => {
          rows.push(["close", code, signal, child.killed, child.exitCode, child.signalCode].join(":"));
          resolve();
        });
      });
      await closed;
      console.log(rows.join("|"));
    }

    await abortAfterSpawn();
    await abortBeforeSpawn();

    const timedOut = spawn("node", ["-e", "setTimeout(() => {}, 1000)"], {
      timeout: 5,
      killSignal: "SIGKILL"
    });
    const timeoutRows = [];
    timedOut.on("error", (error) => {
      timeoutRows.push(["error", error.name, error.code].join(":"));
    });
    await new Promise((resolve) => {
      timedOut.on("close", (code, signal) => {
        timeoutRows.push(["close", code, signal, timedOut.killed, timedOut.exitCode, timedOut.signalCode].join(":"));
        resolve();
      });
    });
    console.log("timeout", timeoutRows.join("|"));

    for (const value of [123, {}, null]) {
      try {
        spawn("node", ["-e", ""], { signal: value });
      } catch (error) {
        console.log("invalid", error.name, error.code);
      }
    }

    const child = spawn("node", ["-e", ""]);
    await new Promise((resolve) => child.on("close", resolve));
    console.log("after close", child.kill(), child.killed, child.exitCode, child.signalCode);
  `);

  const result = await kernel.run("node", ["spawn-signal.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "error:AbortError:ABORT_ERR:The operation was aborted:stop|close::SIGKILL:true::SIGKILL",
    "error:AbortError:ABORT_ERR:The operation was aborted:pre|close::SIGTERM:true::SIGTERM",
    "timeout close::SIGKILL:true::SIGKILL",
    "invalid TypeError ERR_INVALID_ARG_TYPE",
    "invalid TypeError ERR_INVALID_ARG_TYPE",
    "invalid TypeError ERR_INVALID_ARG_TYPE",
    "after close false false 0 null"
  ]);
});

test("child_process.fork supports virtual JSON IPC messaging", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/worker.js", `
    process.on("message", (message) => {
      process.send({
        reply: message.value * 2,
        argv: process.argv[2],
        env: process.env.REPL_TEST_VAR
      });
      process.disconnect();
    });
    process.send({ ready: 21 });
  `);
  kernel.fs.writeFileSync("/workspace/parent.js", `
    const { fork } = require("node:child_process");
    const child = fork("worker.js", ["arg-one"], {
      silent: true,
      env: { ...process.env, REPL_TEST_VAR: "hello" }
    });

    const messages = [];
    const reply = new Promise((resolve) => {
      child.on("message", (message) => {
        messages.push(message);
        if (message.ready) {
          try {
            child.send({ bad: true }, { fd: 1 });
          } catch (error) {
            console.log("handle error:", error.code);
          }
          child.send({ value: message.ready });
        }
        if (message.reply) resolve();
      });
    });
    child.on("disconnect", () => {
      console.log("disconnect:", child.connected);
    });

    await reply;
    const code = await new Promise((resolve) => child.on("close", resolve));

    console.log(JSON.stringify(messages));
    console.log("close:", code);
  `);

  const result = await kernel.run("node", ["parent.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n").sort(), [
    "close: 0",
    "disconnect: false",
    "handle error: ERR_OPENCONTAINERS_IPC_HANDLE_UNSUPPORTED",
    JSON.stringify([
      { ready: 21 },
      { reply: 42, argv: "arg-one", env: "hello" }
    ])
  ].sort());
});

test("child_process.fork delivers send-only child messages without keeping the child alive", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/send-only.js", `
    process.send({ done: true, connected: process.connected });
  `);
  kernel.fs.writeFileSync("/workspace/parent.js", `
    const { fork } = require("node:child_process");
    const child = fork("send-only.js", [], { silent: true });
    const message = await new Promise((resolve) => child.on("message", resolve));
    const code = await new Promise((resolve) => child.on("close", resolve));
    console.log(JSON.stringify(message));
    console.log("close:", code);
  `);

  const result = await kernel.run("node", ["parent.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    JSON.stringify({ done: true, connected: true }),
    "close: 0"
  ]);
});
