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

test("fs.createReadStream honors start, end, and supplied file descriptors", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/input.txt", "abcdef");
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fs from "node:fs";

    const first = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream("input.txt", { start: 2, end: 4, encoding: "utf8" })
        .on("data", chunk => first.push(chunk))
        .on("error", reject)
        .on("end", resolve);
    });
    console.log("slice", first.join(""));

    const fd = fs.openSync("input.txt", "r");
    const prefix = Buffer.alloc(2);
    fs.readSync(fd, prefix, 0, 2, null);
    const second = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(null, { fd, encoding: "utf8", autoClose: false })
        .on("data", chunk => second.push(chunk))
        .on("error", reject)
        .on("end", resolve);
    });
    console.log("fd", second.join(""));
    fs.closeSync(fd);
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "slice cde\nfd cdef\n");
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

test("fs.createWriteStream honors flags, start, and supplied file descriptors", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fs from "node:fs";

    fs.writeFileSync("output.txt", "abcdef");
    await new Promise((resolve, reject) => {
      fs.createWriteStream("output.txt", { flags: "r+", start: 2 })
        .on("error", reject)
        .on("finish", resolve)
        .end("XX");
    });
    console.log(fs.readFileSync("output.txt", "utf8"));

    const fd = fs.openSync("output.txt", "r+");
    fs.readSync(fd, Buffer.alloc(4), 0, 4, null);
    await new Promise((resolve, reject) => {
      fs.createWriteStream(null, { fd, autoClose: false })
        .on("error", reject)
        .on("finish", resolve)
        .end("YY");
    });
    fs.closeSync(fd);
    console.log(fs.readFileSync("output.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "abXXef\nabXXYY\n");
});

test("fs.ReadStream and fs.WriteStream constructors use virtual files", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/input.txt", "abcdef");
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fs from "node:fs";

    console.log("metadata", fs.ReadStream.name, fs.ReadStream.length, fs.WriteStream.name, fs.WriteStream.length);
    console.log("aliases", fs.ReadStream === fs.FileReadStream, fs.WriteStream === fs.FileWriteStream);
    console.log("export descriptors", ["ReadStream", "WriteStream", "FileReadStream", "FileWriteStream", "Utf8Stream"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(fs, name);
      return [
        name,
        descriptor.enumerable,
        descriptor.configurable,
        typeof descriptor.get,
        typeof descriptor.set,
        fs[name].name + "/" + fs[name].length
      ].join(":");
    }).join("|"));

    const originalReadStream = fs.ReadStream;
    let readReplacementCalled = false;
    let readReplacementArgs;
    function ReplacementReadStream() {
      readReplacementCalled = true;
      readReplacementArgs = [...arguments];
      return { replacement: true };
    }
    fs.ReadStream = ReplacementReadStream;
    const replacementRead = fs.createReadStream("ignored.txt");
    console.log("read replacement", fs.ReadStream === ReplacementReadStream, fs.FileReadStream === originalReadStream, readReplacementCalled, replacementRead.replacement, typeof readReplacementArgs[0], typeof readReplacementArgs[1]);
    fs.ReadStream = originalReadStream;

    const originalWriteStream = fs.WriteStream;
    let writeReplacementCalled = false;
    let writeReplacementArgs;
    function ReplacementWriteStream() {
      writeReplacementCalled = true;
      writeReplacementArgs = [...arguments];
      return { replacement: true };
    }
    fs.WriteStream = ReplacementWriteStream;
    const replacementWrite = fs.createWriteStream("ignored.txt");
    console.log("write replacement", fs.WriteStream === ReplacementWriteStream, fs.FileWriteStream === originalWriteStream, writeReplacementCalled, replacementWrite.replacement, typeof writeReplacementArgs[0], typeof writeReplacementArgs[1]);
    fs.WriteStream = originalWriteStream;
    const describePrototype = (prototype, names) => names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return [
        String(name),
        descriptor.enumerable,
        descriptor.configurable,
        "value" in descriptor ? descriptor.writable : typeof descriptor.set,
        "value" in descriptor ? descriptor.value.name + "/" + descriptor.value.length : typeof descriptor.get
      ].join(":");
    }).join("|");
    const describeFunctionPrototype = (prototype, names) => names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, "prototype");
      return [
        name,
        Object.hasOwn(descriptor.value, "prototype"),
        prototypeDescriptor.enumerable,
        prototypeDescriptor.configurable,
        prototypeDescriptor.writable,
        Object.getOwnPropertyNames(prototypeDescriptor.value).join(","),
        prototypeDescriptor.value.constructor === descriptor.value
      ].join(":");
    }).join("|");
    console.log("read proto", Object.getOwnPropertyNames(fs.ReadStream.prototype).join(","), Object.keys(fs.ReadStream.prototype).join(","));
    console.log("read proto desc", describePrototype(fs.ReadStream.prototype, ["autoClose", "_construct", "_read", "_destroy", "close", "pending"]));
    console.log("read helper prototypes", describeFunctionPrototype(fs.ReadStream.prototype, ["_construct", "_read", "_destroy", "close"]));
    console.log("write proto", Object.getOwnPropertyNames(fs.WriteStream.prototype).join(","), Object.keys(fs.WriteStream.prototype).join(","));
    console.log("write proto desc", describePrototype(fs.WriteStream.prototype, ["autoClose", "_construct", "_write", "_writev", "_destroy", "close", "destroySoon", "pending"]));
    console.log("write helper prototypes", describeFunctionPrototype(fs.WriteStream.prototype, ["_construct", "_write", "_writev", "_destroy", "close", "destroySoon"]));

    const chunks = [];
    const read = new fs.ReadStream("input.txt", { start: 1, end: 3, encoding: "utf8" });
    console.log("read shape", read instanceof fs.ReadStream, read.path, read.bytesRead, typeof read.close, typeof read.pending);
    await new Promise((resolve, reject) => {
      read.on("data", chunk => chunks.push(chunk));
      read.on("error", reject);
      read.on("end", resolve);
    });
    console.log("read result", chunks.join(""), read.bytesRead);

    await new Promise((resolve, reject) => {
      const write = new fs.WriteStream("output.txt");
      console.log("write shape", write instanceof fs.WriteStream, write.path, write.bytesWritten, typeof write.close, typeof write.pending);
      write.on("error", reject);
      write.on("finish", resolve);
      write.end("written!");
    });
    console.log("write result", fs.readFileSync("output.txt", "utf8"));

    const fd = fs.openSync("input.txt", "r");
    fs.readSync(fd, Buffer.alloc(2), 0, 2, null);
    const fdChunks = [];
    await new Promise((resolve, reject) => {
      new fs.ReadStream(null, { fd, autoClose: false, encoding: "utf8" })
        .on("data", chunk => fdChunks.push(chunk))
        .on("error", reject)
        .on("end", resolve);
    });
    console.log("fd read", fdChunks.join(""));
    fs.closeSync(fd);

    fs.writeFileSync("position.txt", "abcdef");
    const writeFd = fs.openSync("position.txt", "r+");
    fs.readSync(writeFd, Buffer.alloc(4), 0, 4, null);
    await new Promise((resolve, reject) => {
      new fs.WriteStream(null, { fd: writeFd, autoClose: false })
        .on("error", reject)
        .on("finish", resolve)
        .end("YY");
    });
    fs.closeSync(writeFd);
    console.log("fd write", fs.readFileSync("position.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "metadata ReadStream 2 WriteStream 2",
    "aliases true true",
    "export descriptors ReadStream:true:true:function:function:ReadStream/2|WriteStream:true:true:function:function:WriteStream/2|FileReadStream:true:true:function:function:ReadStream/2|FileWriteStream:true:true:function:function:WriteStream/2|Utf8Stream:true:true:function:undefined:Utf8Stream/0",
    "read replacement true true true true string undefined",
    "write replacement true true true true string undefined",
    "read proto constructor,autoClose,_construct,_read,_destroy,close,pending _construct,_read,_destroy,close",
    "read proto desc autoClose:false:false:function:function|_construct:true:true:true:_construct/1|_read:true:true:true:/1|_destroy:true:true:true:/2|close:true:true:true:/1|pending:false:true:undefined:function",
    "read helper prototypes _construct:true:false:false:true:constructor:true|_read:true:false:false:true:constructor:true|_destroy:true:false:false:true:constructor:true|close:true:false:false:true:constructor:true",
    "write proto constructor,autoClose,_construct,_write,_writev,_destroy,close,destroySoon,pending _construct,_write,_writev,_destroy,close,destroySoon",
    "write proto desc autoClose:false:false:function:function|_construct:true:true:true:_construct/1|_write:true:true:true:/3|_writev:true:true:true:/2|_destroy:true:true:true:/2|close:true:true:true:/1|destroySoon:true:true:true:/3|pending:false:true:undefined:function",
    "write helper prototypes _construct:true:false:false:true:constructor:true|_write:true:false:false:true:constructor:true|_writev:true:false:false:true:constructor:true|_destroy:true:false:false:true:constructor:true|close:true:false:false:true:constructor:true|destroySoon:true:false:false:true:constructor:true",
    "read shape true input.txt 0 function boolean",
    "read result bcd 3",
    "write shape true output.txt 0 function boolean",
    "write result written!",
    "fd read cdef",
    "fd write abcdYY"
  ]);
});

test("FileHandle exposes stream, line, web stream, and async dispose helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fsp from "node:fs/promises";

    await fsp.writeFile("input.txt", "alpha\\nbeta\\ngamma\\n");

    const lineHandle = await fsp.open("input.txt", "r");
    const lines = [];
    for await (const line of lineHandle.readLines()) lines.push(line);
    console.log("lines", lines.join("|"));
    await lineHandle.close();

    const readHandle = await fsp.open("input.txt", "r");
    const chunks = [];
    await new Promise((resolve, reject) => {
      readHandle.createReadStream({ start: 6, end: 9, encoding: "utf8", autoClose: false })
        .on("data", chunk => chunks.push(chunk))
        .on("error", reject)
        .on("end", resolve);
    });
    console.log("stream", chunks.join(""));
    await readHandle.close();

    const writeHandle = await fsp.open("output.txt", "w+");
    await new Promise((resolve, reject) => {
      writeHandle.createWriteStream({ autoClose: false })
        .on("error", reject)
        .on("finish", resolve)
        .end("via handle");
    });
    console.log("written", await fsp.readFile("output.txt", "utf8"));
    await writeHandle[Symbol.asyncDispose]();

    const webHandle = await fsp.open("input.txt", "r");
    const reader = webHandle.readableWebStream().getReader();
    const first = await reader.read();
    console.log("web", Buffer.from(first.value).toString("utf8").includes("gamma"));
    await webHandle.close();
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "lines alpha|beta|gamma\nstream beta\nwritten via handle\nweb true\n");
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

test("fs.watchFile can unwatch a specific listener", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      const listener = (curr, prev) => {
        console.log(prev.size + '->' + curr.size);
      };
      fs.watchFile('watched.txt', listener);
      fs.writeFileSync('watched.txt', 'newer');
      fs.unwatchFile('watched.txt', listener);
      fs.writeFileSync('watched.txt', 'longer value');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "3->5\n");
});

test("fs.watchFile returned watcher can be closed", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      const watcher = fs.watchFile('watched.txt', (curr, prev) => {
        console.log(prev.size + '->' + curr.size);
      });
      console.log(watcher.constructor.name, typeof watcher.ref, typeof watcher.unref, typeof watcher.close);
      console.log(watcher.ref() === watcher, watcher.unref() === watcher);
      fs.writeFileSync('watched.txt', 'newer');
      watcher.close();
      fs.writeFileSync('watched.txt', 'longer value');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "StatWatcher function function function\ntrue true\n3->5\n");
});

test("fs.watch exposes a Node-shaped FSWatcher", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      const watcher = fs.watch('watched.txt', (event, filename) => {
        console.log('listener', event, filename);
      });
      console.log(Object.hasOwn(fs, "FSWatcher"), typeof fs.FSWatcher, watcher.constructor.name);
      console.log(typeof watcher.ref, typeof watcher.unref, typeof watcher.close);
      watcher.on('close', () => console.log('closed'));
      fs.writeFileSync('watched.txt', 'newer');
      watcher.close();
      fs.writeFileSync('watched.txt', 'longer value');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "false undefined FSWatcher\nfunction function function\nlistener change watched.txt\nclosed\n");
});

test("fs.watch supports emitter listeners and buffer filename encoding", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require('fs');
      const watcher = fs.watch('watched.txt', { encoding: 'buffer' });
      watcher.on('change', (event, filename) => {
        console.log(event, Buffer.isBuffer(filename), filename.toString());
        watcher.close();
      });
      fs.writeFileSync('watched.txt', 'newer');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "change true watched.txt\n");
});

test("fs.watch filters recursive and non-recursive directory events", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/watch-root/nested", { recursive: true });
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fs from "node:fs";

    const directEvents = [];
    const recursiveEvents = [];
    const bufferEvents = [];
    const directWatcher = fs.watch("watch-root", { recursive: false }, (eventType, filename) => {
      directEvents.push(eventType + ":" + filename);
    });
    const recursiveWatcher = fs.watch("watch-root", { recursive: true }, (eventType, filename) => {
      recursiveEvents.push(eventType + ":" + filename);
    });
    const bufferWatcher = fs.watch("watch-root", { recursive: true, encoding: "buffer" }, (eventType, filename) => {
      bufferEvents.push(eventType + ":" + Buffer.isBuffer(filename) + ":" + filename.toString());
    });

    fs.writeFileSync("watch-root/direct.txt", "direct");
    fs.writeFileSync("watch-root/nested/deep.txt", "deep");
    directWatcher.close();
    recursiveWatcher.close();
    bufferWatcher.close();

    console.log("direct", directEvents.join(","));
    console.log("recursive", recursiveEvents.join(","));
    console.log("buffer", bufferEvents.join(","));
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "direct change:direct.txt",
    "recursive change:direct.txt,change:nested/deep.txt",
    "buffer change:true:direct.txt,change:true:nested/deep.txt",
    ""
  ].join("\n"));
});

test("fs.promises.watch yields file change events", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fsp from "node:fs/promises";

    const events = [];
    const watcher = fsp.watch("watched.txt");
    const done = (async () => {
      for await (const event of watcher) {
        events.push(event.eventType + ":" + event.filename);
        break;
      }
    })();
    await fsp.writeFile("watched.txt", "newer");
    await done;
    console.log(events.join(","));
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "change:watched.txt\n");
});

test("fs.promises.watch supports recursive virtual directory filenames", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/watch-root/nested", { recursive: true });
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fsp from "node:fs/promises";

    const watcher = fsp.watch("watch-root", { recursive: true });
    const done = (async () => {
      for await (const event of watcher) {
        console.log(event.eventType + ":" + event.filename);
        break;
      }
    })();
    await fsp.writeFile("watch-root/nested/deep.txt", "deep");
    await done;
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "change:nested/deep.txt\n");
});

test("fs.promises.watch honors AbortSignal", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/watched.txt", "old");
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import fsp from "node:fs/promises";

    const controller = new AbortController();
    const watcher = fsp.watch("watched.txt", { signal: controller.signal });
    controller.abort("stop");

    try {
      for await (const event of watcher) {
        console.log(event.eventType);
      }
    } catch (error) {
      console.log(error.name, error.code, error.cause);
    }
  `);

  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "AbortError ABORT_ERR stop\n");
});
