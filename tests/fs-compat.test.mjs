import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("node:fs accepts file URL inputs and bigint stat options", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import fs from "node:fs";
    import fsp from "node:fs/promises";

    const file = new URL("file:///workspace/url-input.txt");
    fs.writeFileSync(file, "hello");
    fs.utimesSync(file, new Date(1234), new Date(2345));

    const normalStats = fs.statSync(file);
    const syncStats = fs.statSync(file, { bigint: true });
    const asyncStats = await fsp.stat(file, { bigint: true });

    console.log(fs.readFileSync(file, "utf8"));
    console.log(typeof syncStats.size, syncStats.size === 5n, syncStats.isFile());
    console.log(typeof asyncStats.mtimeMs, asyncStats.mode > 0n);
    console.log(normalStats.atimeInstant.constructor.name, normalStats.atimeInstant.toString().startsWith("1970-01-01T00:00:01.234"), normalStats.atimeNs);
    console.log(typeof syncStats.atimeNs, syncStats.atimeNs === 1234000000n, syncStats.mtimeNs === 2345000000n, syncStats.mtimeInstant.constructor.name);

    fs.writeFileSync("/workspace/a\\\\b", "backslash");
    console.log("encoded backslash:", fs.readFileSync(new URL("file:///workspace/a%5Cb"), "utf8"));
    console.log("encoded backslash stat:", fs.statSync(new URL("file:///workspace/a%5Cb")).isFile());
    console.log("localhost:", fs.readFileSync(new URL("file://localhost/workspace/url-input.txt"), "utf8"));
    console.log("url-like:", fs.readFileSync({
      href: "file:///workspace/url-input.txt",
      origin: "null",
      protocol: "file:",
      username: "",
      password: "",
      host: "",
      hostname: "",
      port: "",
      pathname: "/workspace/url-input.txt",
      search: "",
      hash: "",
    }, "utf8"));

    const invalidRows = [];
    for (const [label, action] of [
      ["encoded slash read", () => fs.readFileSync(new URL("file:///workspace/a%2Fb"))],
      ["encoded slash stat", () => fs.statSync(new URL("file:///workspace/a%2Fb"))],
      ["encoded slash promise", async () => fsp.stat(new URL("file:///workspace/a%2Fb"))],
      ["scheme read", () => fs.readFileSync(new URL("https://example.com/a"))],
      ["scheme stat", () => fs.statSync(new URL("https://example.com/a"))],
      ["host read", () => fs.readFileSync(new URL("file://server/workspace/url-input.txt"))],
      ["host stat", () => fs.statSync(new URL("file://server/workspace/url-input.txt"))],
      ["url-like", () => fs.readFileSync({ protocol: "file:", pathname: "/workspace/url-input.txt" })],
      ["url-like stat", () => fs.statSync({ protocol: "file:", pathname: "/workspace/url-input.txt" })],
      ["url-like host", () => fs.readFileSync({
        href: "file:///workspace/url-input.txt",
        protocol: "file:",
        pathname: "/workspace/url-input.txt",
      })],
    ]) {
      try {
        await action();
        invalidRows.push(label + ":ok");
      } catch (error) {
        invalidRows.push([label, error.name, error.code].join(":"));
      }
    }
    console.log(invalidRows.join("|"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "hello",
    "bigint true true",
    "bigint true",
    "Instant true undefined",
    "bigint true true Instant",
    "encoded backslash: backslash",
    "encoded backslash stat: true",
    "localhost: hello",
    "url-like: hello",
    "encoded slash read:TypeError:ERR_INVALID_FILE_URL_PATH|encoded slash stat:TypeError:ERR_INVALID_FILE_URL_PATH|encoded slash promise:TypeError:ERR_INVALID_FILE_URL_PATH|scheme read:TypeError:ERR_INVALID_URL_SCHEME|scheme stat:TypeError:ERR_INVALID_URL_SCHEME|host read:TypeError:ERR_INVALID_FILE_URL_HOST|host stat:TypeError:ERR_INVALID_FILE_URL_HOST|url-like:TypeError:ERR_INVALID_ARG_TYPE|url-like stat:TypeError:ERR_INVALID_ARG_TYPE|url-like host:TypeError:ERR_INVALID_FILE_URL_HOST"
  ]);
});

test("node:fs exposes native-shaped Stats metadata and predicates", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");

    fs.writeFileSync("stats-file.txt", "hello");
    fs.mkdirSync("stats-dir");
    fs.symlinkSync("stats-file.txt", "stats-link");

    const stats = fs.statSync("stats-file.txt");
    const dirStats = fs.statSync("stats-dir");
    const linkStats = fs.lstatSync("stats-link");
    const statsPrototype = Object.getPrototypeOf(stats);
    const statsBasePrototype = Object.getPrototypeOf(statsPrototype);
    const describe = (prototype, names) => names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const detail = "value" in descriptor
        ? descriptor.writable + ":" + descriptor.value.name + "/" + descriptor.value.length
        : descriptor.get.name + "/" + descriptor.get.length + ":" + descriptor.set.name + "/" + descriptor.set.length;
      return [name, descriptor.enumerable, descriptor.configurable, detail].join(":");
    }).join("|");

    console.log("own keys", Object.keys(stats).join(","));
    console.log("own accessors", Object.hasOwn(stats, "atime"), Object.hasOwn(stats, "atimeInstant"), typeof stats.atime.getTime, stats.atimeInstant.constructor.name);
    console.log("proto names", Object.getOwnPropertyNames(statsPrototype).join(","));
    console.log("proto keys", Object.keys(statsPrototype).join(","));
    console.log("proto desc", describe(statsPrototype, ["atime", "mtime", "ctime", "birthtime", "atimeInstant", "mtimeInstant", "ctimeInstant", "birthtimeInstant", "_checkModeProperty"]));
    console.log("base names", Object.getOwnPropertyNames(statsBasePrototype).join(","));
    console.log("base keys", Object.keys(statsBasePrototype).join(","));
    console.log("base desc", describe(statsBasePrototype, ["isDirectory", "isFile", "isBlockDevice", "isCharacterDevice", "isSymbolicLink", "isFIFO", "isSocket"]));

    const statsDescriptor = Object.getOwnPropertyDescriptor(fs, "Stats");
    console.log("ctor", statsDescriptor.enumerable, statsDescriptor.configurable, statsDescriptor.writable, fs.Stats.name, fs.Stats.length, stats.constructor.name, stats.constructor === fs.Stats, stats instanceof fs.Stats);
    console.log("predicates", stats.isFile(), stats.isDirectory(), dirStats.isDirectory(), linkStats.isSymbolicLink(), linkStats.isFile());

    const bigintStats = fs.statSync("stats-file.txt", { bigint: true });
    console.log("bigint", Object.keys(bigintStats).join(","), typeof bigintStats.mode, typeof bigintStats.atimeNs, bigintStats.isFile(), bigintStats.atimeInstant.constructor.name);

    const assigned = fs.statSync("stats-file.txt");
    const replacementDate = { marker: true };
    assigned.atime = replacementDate;
    assigned.atimeInstant = "instant";
    assigned.atimeMs = 1;
    console.log("setters", assigned.atime === replacementDate, assigned.atimeInstant);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "own keys dev,mode,nlink,uid,gid,rdev,blksize,ino,size,blocks,atimeMs,mtimeMs,ctimeMs,birthtimeMs",
    "own accessors false false function Instant",
    "proto names constructor,atime,mtime,ctime,birthtime,atimeInstant,mtimeInstant,ctimeInstant,birthtimeInstant,_checkModeProperty",
    "proto keys atime,mtime,ctime,birthtime,atimeInstant,mtimeInstant,ctimeInstant,birthtimeInstant,_checkModeProperty",
    "proto desc atime:true:true:get/0:set/1|mtime:true:true:get/0:set/1|ctime:true:true:get/0:set/1|birthtime:true:true:get/0:set/1|atimeInstant:true:true:get/0:set/1|mtimeInstant:true:true:get/0:set/1|ctimeInstant:true:true:get/0:set/1|birthtimeInstant:true:true:get/0:set/1|_checkModeProperty:true:true:true:/1",
    "base names constructor,isDirectory,isFile,isBlockDevice,isCharacterDevice,isSymbolicLink,isFIFO,isSocket",
    "base keys isDirectory,isFile,isBlockDevice,isCharacterDevice,isSymbolicLink,isFIFO,isSocket",
    "base desc isDirectory:true:true:true:/0|isFile:true:true:true:/0|isBlockDevice:true:true:true:/0|isCharacterDevice:true:true:true:/0|isSymbolicLink:true:true:true:/0|isFIFO:true:true:true:/0|isSocket:true:true:true:/0",
    "ctor true true true deprecated 18 Stats false true",
    "predicates true false true true false",
    "bigint dev,mode,nlink,uid,gid,rdev,blksize,ino,size,blocks,atimeMs,mtimeMs,ctimeMs,birthtimeMs,atimeNs,mtimeNs,ctimeNs,birthtimeNs bigint bigint true Instant",
    "setters true instant"
  ]);
});

test("node:fs/promises exposes Node-shaped helper metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");
    const fsNamespace = await import("node:fs");
    const promisesDescriptor = Object.getOwnPropertyDescriptor(fs, "promises");
    const constantKeys = Object.keys(fsp.constants);
    const opendirPrototypeDescriptor = Object.getOwnPropertyDescriptor(fsp.opendir, "prototype");

    console.log(Object.keys(fsp).join(","));
    console.log(typeof promisesDescriptor.get, typeof promisesDescriptor.set, promisesDescriptor.enumerable, promisesDescriptor.configurable, fs.promises === fsp);
    console.log(fs.constants === fsp.constants, constantKeys.slice(0, 15).join(","), constantKeys.slice(-10).join(","));
    console.log([
      fsp.access.length,
      fsp.stat.length,
      fsp.lstat.length,
      fsp.statfs.length,
      fsp.truncate.length,
      fsp.mkdtemp.length,
      fsp.mkdtempDisposable.length,
      fsp.opendir.length,
      fsp.readlink.length,
      fsp.realpath.length,
      fsp.symlink.length,
      fsp.watch.name,
      fsp.watch.length
    ].join(" "));
    console.log(
      "opendir prototype",
      Object.hasOwn(fsp.opendir, "prototype"),
      opendirPrototypeDescriptor.enumerable,
      opendirPrototypeDescriptor.configurable,
      opendirPrototypeDescriptor.writable,
      Object.getOwnPropertyNames(opendirPrototypeDescriptor.value).join(",")
    );
    console.log(
      typeof fsp.exists,
      typeof fsp.fchmod,
      typeof fsp.fchown,
      typeof fsp.ftruncate,
      Object.hasOwn(fsp, "exists"),
      Object.hasOwn(fsp, "fchmod"),
      Object.hasOwn(fsp, "fchown"),
      Object.hasOwn(fsp, "ftruncate")
    );
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "access,copyFile,cp,glob,open,opendir,rename,truncate,rm,rmdir,mkdir,readdir,readlink,symlink,lstat,stat,statfs,link,unlink,chmod,lchmod,lchown,chown,utimes,lutimes,realpath,mkdtemp,mkdtempDisposable,writeFile,appendFile,readFile,watch,constants",
    "function undefined true true true",
    "true UV_FS_SYMLINK_DIR,UV_FS_SYMLINK_JUNCTION,O_RDONLY,O_WRONLY,O_RDWR,UV_DIRENT_UNKNOWN,UV_DIRENT_FILE,UV_DIRENT_DIR,UV_DIRENT_LINK,UV_DIRENT_FIFO,UV_DIRENT_SOCKET,UV_DIRENT_CHAR,UV_DIRENT_BLOCK,S_IFMT,S_IFREG F_OK,R_OK,W_OK,X_OK,UV_FS_COPYFILE_EXCL,COPYFILE_EXCL,UV_FS_COPYFILE_FICLONE,COPYFILE_FICLONE,UV_FS_COPYFILE_FICLONE_FORCE,COPYFILE_FICLONE_FORCE",
    "1 1 1 1 1 2 2 3 2 2 3 watch 1",
    "opendir prototype true false false true constructor",
    "undefined undefined undefined undefined false false false false"
  ]);
});

test("node:fs encodes readdir and opendir entry names", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.mkdirSync("dir");
    fs.writeFileSync("dir/az", "x");

    const describe = (value) => Buffer.isBuffer(value)
      ? "buffer:" + value.toString("hex")
      : typeof value + ":" + value;

    const syncBuffer = fs.readdirSync("dir", { encoding: "buffer" })[0];
    const syncDirentBuffer = fs.readdirSync("dir", { withFileTypes: true, encoding: "buffer" })[0];
    console.log("sync buffer", describe(syncBuffer));
    console.log("sync dirent buffer", describe(syncDirentBuffer.name), syncDirentBuffer.isFile());
    console.log("sync dirent shape", Object.keys(syncDirentBuffer).join(","), Reflect.ownKeys(syncDirentBuffer).map(String).join(","), typeof syncDirentBuffer.parentPath, String(syncDirentBuffer.path));
    console.log("sync hex", fs.readdirSync("dir", { encoding: "hex" })[0]);
    console.log("sync base64", fs.readdirSync("dir", "base64")[0]);

    const syncDir = fs.opendirSync("dir", { encoding: "buffer" });
    console.log("opendir sync buffer", describe(syncDir.readSync().name));
    syncDir.closeSync();

    await new Promise((resolve, reject) => {
      fs.opendir("dir", { encoding: "hex" }, (error, dir) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          console.log("opendir callback hex", describe(dir.readSync().name));
          dir.closeSync();
          resolve();
        } catch (innerError) {
          reject(innerError);
        }
      });
    });

    const promiseDir = await fsp.opendir("dir", { encoding: "base64" });
    console.log("opendir promise base64", describe(promiseDir.readSync().name));
    promiseDir.closeSync();
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync buffer buffer:617a",
    "sync dirent buffer buffer:617a true",
    "sync dirent shape name,parentPath name,parentPath,Symbol(type) string undefined",
    "sync hex 617a",
    "sync base64 YXo=",
    "opendir sync buffer buffer:617a",
    "opendir callback hex string:617a",
    "opendir promise base64 string:YXo="
  ]);
});

test("node:fs honors file content encodings across sync, callback, promise, and fd helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("sync.txt", "6869", "hex");
    console.log("sync", fs.readFileSync("sync.txt", "utf8"), fs.readFileSync("sync.txt", "hex"), fs.readFileSync("sync.txt", "base64"));

    await new Promise((resolve, reject) => {
      fs.writeFile("callback.txt", "aGk=", "base64", (error) => error ? reject(error) : resolve());
    });
    const callbackBase64 = await new Promise((resolve, reject) => {
      fs.readFile("callback.txt", "base64", (error, value) => error ? reject(error) : resolve(value));
    });
    console.log("callback", fs.readFileSync("callback.txt", "utf8"), callbackBase64);

    await fsp.writeFile("promise.txt", "6869", { encoding: "hex" });
    console.log("promise", await fsp.readFile("promise.txt", "utf8"), await fsp.readFile("promise.txt", { encoding: "hex" }));

    const fd = fs.openSync("fd-encoding.txt", "w+");
    console.log("fd write", fs.writeSync(fd, "6869", null, "hex"));
    fs.closeSync(fd);
    console.log("fd read", fs.readFileSync("fd-encoding.txt", "utf8"), fs.readFileSync("fd-encoding.txt", "hex"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync hi 6869 aGk=",
    "callback hi aGk=",
    "promise hi 6869",
    "fd write 2",
    "fd read hi 6869"
  ]);
});

test("node:fs exposes Node-shaped callback helper metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const names = [
      "readFile",
      "writeFile",
      "appendFile",
      "readdir",
      "access",
      "stat",
      "lstat",
      "statfs",
      "utimes",
      "lutimes",
      "mkdir",
      "rm",
      "rmdir",
      "unlink",
      "rename",
      "copyFile",
      "cp",
      "chmod",
      "chown",
      "lchmod",
      "lchown",
      "link",
      "realpath",
      "open",
      "close",
      "read",
      "write",
      "readv",
      "writev",
      "truncate",
      "ftruncate",
      "fstat",
      "fchmod",
      "fchown",
      "futimes",
      "fsync",
      "fdatasync",
      "mkdtemp",
      "opendir",
      "glob",
      "readlink",
      "symlink",
      "exists",
      "unwatchFile",
      "watch",
      "watchFile"
    ];
    const syncNames = [
      "copyFileSync",
      "createReadStream",
      "createWriteStream",
      "openSync",
      "readSync",
      "statSync",
      "symlinkSync",
      "Dirent",
      "Dir"
    ];
    const syncHelperNames = syncNames.filter((name) => name !== "Dirent" && name !== "Dir");
    const helperPrototypeNames = [
      "appendFile",
      "appendFileSync",
      "access",
      "accessSync",
      "chown",
      "chownSync",
      "chmod",
      "chmodSync",
      "close",
      "closeSync",
      "copyFile",
      "copyFileSync",
      "cp",
      "cpSync",
      "createReadStream",
      "createWriteStream",
      "exists",
      "existsSync",
      "fchown",
      "fchownSync",
      "fchmod",
      "fchmodSync",
      "fdatasync",
      "fdatasyncSync",
      "fstat",
      "fstatSync",
      "fsync",
      "fsyncSync",
      "ftruncate",
      "ftruncateSync",
      "futimes",
      "futimesSync",
      "glob",
      "globSync",
      "lchown",
      "lchownSync",
      "lchmod",
      "lchmodSync",
      "link",
      "linkSync",
      "lstat",
      "lstatSync",
      "lutimes",
      "lutimesSync",
      "mkdir",
      "mkdirSync",
      "mkdtemp",
      "mkdtempSync",
      "mkdtempDisposableSync",
      "open",
      "openSync",
      "openAsBlob",
      "readdir",
      "readdirSync",
      "read",
      "readSync",
      "readv",
      "readvSync",
      "readFile",
      "readFileSync",
      "readlink",
      "readlinkSync",
      "realpath",
      "realpathSync",
      "rename",
      "renameSync",
      "rm",
      "rmSync",
      "rmdir",
      "rmdirSync",
      "stat",
      "statfs",
      "statSync",
      "statfsSync",
      "symlink",
      "symlinkSync",
      "truncate",
      "truncateSync",
      "unwatchFile",
      "unlink",
      "unlinkSync",
      "utimes",
      "utimesSync",
      "watch",
      "watchFile",
      "writeFile",
      "writeFileSync",
      "write",
      "writeSync",
      "writev",
      "writevSync",
      "_toUnixTimestamp",
      "opendir",
      "opendirSync"
    ];
    console.log(names.map((name) => name + ":" + fs[name].name + "/" + fs[name].length).join("|"));
    console.log(syncNames.map((name) => name + ":" + fs[name].name + "/" + fs[name].length).join("|"));
    console.log(syncHelperNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(fs[name], "prototype");
      return [
        name,
        descriptor.enumerable,
        descriptor.configurable,
        descriptor.writable,
        Object.getOwnPropertyNames(descriptor.value).join(","),
        descriptor.value.constructor === fs[name]
      ].join(":");
    }).join("|"));
    const prototypeRows = helperPrototypeNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(fs[name], "prototype");
      assert.equal(Object.hasOwn(fs[name], "prototype"), true, name);
      assert.equal(descriptor.enumerable, false, name);
      assert.equal(descriptor.configurable, false, name);
      assert.equal(descriptor.writable, true, name);
      assert.equal(Object.getPrototypeOf(descriptor.value), Object.prototype, name);
      assert.deepEqual(Object.getOwnPropertyNames(descriptor.value), ["constructor"], name);
      const constructorDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, "constructor");
      assert.equal(constructorDescriptor.enumerable, false, name);
      assert.equal(constructorDescriptor.configurable, true, name);
      assert.equal(constructorDescriptor.writable, true, name);
      assert.equal(constructorDescriptor.value, fs[name], name);
      return [
        name,
        descriptor.enumerable,
        descriptor.configurable,
        descriptor.writable,
        Object.getOwnPropertyNames(descriptor.value).join(","),
        descriptor.value.constructor === fs[name]
      ].join(":");
    });
    console.log("helper prototypes", helperPrototypeNames.length, prototypeRows[0], prototypeRows.at(-1));
    console.log(
      Object.getOwnPropertyDescriptor(fs.readFile, "name").configurable,
      Object.getOwnPropertyDescriptor(fs.readFile, "length").configurable,
      Object.getOwnPropertyDescriptor(fs.readv, "name").configurable,
      Object.getOwnPropertyDescriptor(fs.exists, "length").configurable,
      Object.getOwnPropertyDescriptor(fs.copyFileSync, "length").configurable,
      Object.getOwnPropertyDescriptor(fs.Dir, "length").configurable
    );
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "readFile:readFile/3|writeFile:writeFile/4|appendFile:appendFile/4|readdir:readdir/3|access:access/3|stat:stat/1|lstat:lstat/1|statfs:statfs/1|utimes:utimes/4|lutimes:lutimes/4|mkdir:mkdir/3|rm:rm/3|rmdir:rmdir/3|unlink:unlink/2|rename:rename/3|copyFile:copyFile/4|cp:cp/4|chmod:chmod/3|chown:chown/4|lchmod:lchmod/3|lchown:lchown/4|link:link/3|realpath:realpath/3|open:open/4|close:close/1|read:read/6|write:write/6|readv:readv/4|writev:writev/4|truncate:truncate/3|ftruncate:ftruncate/1|fstat:fstat/1|fchmod:fchmod/3|fchown:fchown/4|futimes:futimes/4|fsync:fsync/2|fdatasync:fdatasync/2|mkdtemp:mkdtemp/3|opendir:opendir/3|glob:glob/3|readlink:readlink/3|symlink:symlink/4|exists:exists/2|unwatchFile:unwatchFile/2|watch:watch/3|watchFile:watchFile/3",
    "copyFileSync:copyFileSync/3|createReadStream:createReadStream/2|createWriteStream:createWriteStream/2|openSync:openSync/3|readSync:readSync/5|statSync:statSync/1|symlinkSync:symlinkSync/3|Dirent:Dirent/3|Dir:Dir/3",
    "copyFileSync:false:false:true:constructor:true|createReadStream:false:false:true:constructor:true|createWriteStream:false:false:true:constructor:true|openSync:false:false:true:constructor:true|readSync:false:false:true:constructor:true|statSync:false:false:true:constructor:true|symlinkSync:false:false:true:constructor:true",
    "helper prototypes 94 appendFile:false:false:true:constructor:true opendirSync:false:false:true:constructor:true",
    "true true true true true true"
  ]);
});

test("node:fs honors AbortSignal for async file helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("abort.txt", "original");
    const controller = new AbortController();
    controller.abort("stop");

    try {
      await fsp.readFile("abort.txt", { signal: controller.signal });
    } catch (error) {
      console.log("promise read", error.name, error.code, error.cause);
    }

    try {
      await fsp.writeFile("abort.txt", "next", { signal: controller.signal });
    } catch (error) {
      console.log("promise write", error.name, error.code);
    }

    await new Promise((resolve) => {
      fs.appendFile("abort.txt", "!", { signal: controller.signal }, (error) => {
        console.log("callback append", error.name, error.code);
        resolve();
      });
    });

    const handle = await fsp.open("abort.txt", "r+");
    try {
      await handle.writeFile("handle", { signal: controller.signal });
    } catch (error) {
      console.log("handle write", error.name, error.code);
    }
    await handle.close();

    console.log(fs.readFileSync("abort.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "promise read AbortError ABORT_ERR stop",
    "promise write AbortError ABORT_ERR",
    "callback append AbortError ABORT_ERR",
    "handle write AbortError ABORT_ERR",
    "original"
  ]);
});

test("node:fs exposes metadata and link compatibility helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("source.txt", "a");
    fs.chmodSync("source.txt", 0o755);
    fs.chownSync("source.txt", 1000, 1001);
    fs.linkSync("source.txt", "hard.txt");
    fs.appendFileSync("hard.txt", "b");

    const stat = fs.statSync("source.txt");
    console.log((stat.mode & 0o777).toString(8), stat.uid, stat.gid, stat.nlink);
    console.log(fs.readFileSync("source.txt", "utf8"));

    fs.symlinkSync("source.txt", "link.txt");
    fs.lchmodSync("link.txt", 0o777);
    fs.lchownSync("link.txt", 2000, 2001);
    fs.lutimesSync("link.txt", 1, 2);
    const linkStat = fs.lstatSync("link.txt");
    console.log((linkStat.mode & 0o777).toString(8), linkStat.uid, linkStat.gid, linkStat.mtimeMs);

    const syncReadlinkBuffer = fs.readlinkSync("link.txt", "buffer");
    const syncReadlinkObjectBuffer = fs.readlinkSync("link.txt", { encoding: "buffer" });
    const syncRealpathBuffer = fs.realpathSync("link.txt", "buffer");
    const syncRealpathObjectBuffer = fs.realpathSync("link.txt", { encoding: "buffer" });
    const readlinkHex = fs.readlinkSync("link.txt", "hex");
    const realpathHex = fs.realpathSync("link.txt", "hex");
    console.log(Buffer.isBuffer(syncReadlinkBuffer), syncReadlinkBuffer.toString(), Buffer.isBuffer(syncReadlinkObjectBuffer), readlinkHex);
    console.log(Buffer.isBuffer(syncRealpathBuffer), syncRealpathBuffer.toString().endsWith("/source.txt"), Buffer.isBuffer(syncRealpathObjectBuffer), realpathHex === Buffer.from(fs.realpathSync("link.txt")).toString("hex"));

    const callbackReadlinkBuffer = await new Promise((resolve, reject) => {
      fs.readlink("link.txt", { encoding: "buffer" }, (error, value) => error ? reject(error) : resolve(value));
    });
    const callbackRealpathBuffer = await new Promise((resolve, reject) => {
      fs.realpath("link.txt", "buffer", (error, value) => error ? reject(error) : resolve(value));
    });
    console.log(Buffer.isBuffer(callbackReadlinkBuffer), callbackReadlinkBuffer.toString(), Buffer.isBuffer(callbackRealpathBuffer), callbackRealpathBuffer.toString().endsWith("/source.txt"));

    const promiseReadlinkBuffer = await fsp.readlink("link.txt", "buffer");
    const promiseRealpathBuffer = await fsp.realpath("link.txt", { encoding: "buffer" });
    console.log(Buffer.isBuffer(promiseReadlinkBuffer), promiseReadlinkBuffer.toString(), Buffer.isBuffer(promiseRealpathBuffer), promiseRealpathBuffer.toString().endsWith("/source.txt"));

    await fsp.chmod("source.txt", 0o644);
    await fsp.chown("source.txt", 0, 0);
    console.log((fs.statSync("source.txt").mode & 0o777).toString(8), fs.statSync("source.txt").uid);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "755 1000 1001 2",
    "ab",
    "777 2000 2001 2000",
    "true source.txt true 736f757263652e747874",
    "true true true true",
    "true source.txt true true",
    "true source.txt true true",
    "644 0"
  ]);
});

test("node:fs exposes Unix timestamp and Utf8Stream compatibility helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");

    console.log(typeof fs._toUnixTimestamp);
    console.log(typeof fs.Utf8Stream);
    console.log(fs._toUnixTimestamp(1.5));
    console.log(fs._toUnixTimestamp("2"));
    console.log(fs._toUnixTimestamp(new Date(3000)));
    console.log(fs._toUnixTimestamp(-1) > Date.now() / 1000 - 5);
    try { fs._toUnixTimestamp(undefined); } catch (error) { console.log(error.name, error.code); }
    try { fs._toUnixTimestamp(Number.NaN); } catch (error) { console.log(error.name, error.code); }

	    const fd = fs.openSync("utf8-stream.txt", "w");
	    const stream = new fs.Utf8Stream({ fd });
	    console.log(stream.constructor.name, typeof stream.flush, typeof stream.flushSync, typeof stream.reopen);
	    console.log("Utf8Stream proto", Object.getOwnPropertyNames(fs.Utf8Stream.prototype).join(","), Object.keys(fs.Utf8Stream.prototype).join(","), Object.getOwnPropertySymbols(fs.Utf8Stream.prototype).map(String).join(","));
	    const utf8StreamRows = ["write", "flush", "flushSync", "reopen", "end", "destroy", "mode", "file", "fd", "minLength", "maxLength", "writing", "sync", "fsync", "append", "periodicFlush", "contentMode", "mkdir", Symbol.dispose].map((name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(fs.Utf8Stream.prototype, name);
	      if ("value" in descriptor) return [String(name), "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
	      return [String(name), "accessor", descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, Object.hasOwn(descriptor.get, "prototype"), typeof descriptor.set].join(":");
	    });
	    console.log("Utf8Stream rows", utf8StreamRows.join("|"));
	    console.log("Utf8Stream defaults", stream.fd, stream.file, stream.mode, stream.minLength, stream.maxLength, stream.writing, stream.sync, stream.fsync, stream.append, stream.periodicFlush, stream.contentMode, stream.mkdir);
	    try {
	      stream.reopen();
	    } catch (error) {
	      console.log("Utf8Stream reopen", error.name, error.code, error.message);
	    }
	    stream.write("hello");
	    stream.end(" stream");
	    fs.closeSync(fd);
	    console.log(fs.readFileSync("utf8-stream.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "function",
    "1.5",
    "2",
    "3",
    "true",
	    "TypeError ERR_INVALID_ARG_TYPE",
	    "TypeError ERR_INVALID_ARG_TYPE",
	    "Utf8Stream function function function",
	    "Utf8Stream proto constructor,write,flush,flushSync,reopen,end,destroy,mode,file,fd,minLength,maxLength,writing,sync,fsync,append,periodicFlush,contentMode,mkdir  Symbol(Symbol.dispose)",
	    "Utf8Stream rows write:data:false:true:true:write:1:false|flush:data:false:true:true:flush:0:false|flushSync:data:false:true:true:flushSync:0:false|reopen:data:false:true:true:reopen:1:false|end:data:false:true:true:end:0:false|destroy:data:false:true:true:destroy:0:false|mode:accessor:false:true:get mode:0:false:undefined|file:accessor:false:true:get file:0:false:undefined|fd:accessor:false:true:get fd:0:false:undefined|minLength:accessor:false:true:get minLength:0:false:undefined|maxLength:accessor:false:true:get maxLength:0:false:undefined|writing:accessor:false:true:get writing:0:false:undefined|sync:accessor:false:true:get sync:0:false:undefined|fsync:accessor:false:true:get fsync:0:false:undefined|append:accessor:false:true:get append:0:false:undefined|periodicFlush:accessor:false:true:get periodicFlush:0:false:undefined|contentMode:accessor:false:true:get contentMode:0:false:undefined|mkdir:accessor:false:true:get mkdir:0:false:undefined|Symbol(Symbol.dispose):data:false:true:true:[Symbol.dispose]:0:false",
	    "Utf8Stream defaults 100 null undefined 0 0 false false false true 0 utf8 false",
	    "Utf8Stream reopen Error ERR_OPERATION_FAILED Operation failed: Unable to reopen a file descriptor, you must pass a file to SonicBoom",
	    "hello stream"
	  ]);
});

test("node:fs enforces descriptor access modes and copy flags", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");

    fs.writeFileSync("fd.txt", "abc");

    const readOnly = fs.openSync("fd.txt", "r");
    try {
      fs.writeSync(readOnly, "x");
    } catch (error) {
      console.log("write", error.code);
    }
    fs.closeSync(readOnly);

    const writeOnly = fs.openSync("fd.txt", "w");
    try {
      const buffer = Buffer.alloc(1);
      fs.readSync(writeOnly, buffer, 0, 1, 0);
    } catch (error) {
      console.log("read", error.code);
    }
    fs.writeSync(writeOnly, "z");
    fs.closeSync(writeOnly);
    console.log(fs.readFileSync("fd.txt", "utf8"));

    fs.copyFileSync("fd.txt", "copy.txt", fs.constants.COPYFILE_EXCL);
    try {
      fs.copyFileSync("fd.txt", "copy.txt", fs.constants.COPYFILE_EXCL);
    } catch (error) {
      console.log("copy", error.code);
    }

    fs.mkdirSync("unlink-dir");
    try {
      fs.unlinkSync("unlink-dir");
    } catch (error) {
      console.log("unlink dir", error.code, fs.statSync("unlink-dir").isDirectory());
    }

    try {
      fs.openSync("created-dir-file.txt", fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_DIRECTORY);
    } catch (error) {
      console.log("open directory create", error.code, fs.existsSync("created-dir-file.txt"));
    }
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "write EBADF",
    "read EBADF",
    "z",
    "copy EEXIST",
    "unlink dir EPERM true",
    "open directory create EINVAL false"
  ]);
});

test("node:fs cp supports filters, existing destination options, and timestamps", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.mkdirSync("cp-src/keep", { recursive: true });
    fs.mkdirSync("cp-src/skip", { recursive: true });
    fs.writeFileSync("cp-src/keep/a.txt", "a");
    fs.writeFileSync("cp-src/skip/b.txt", "b");
    fs.writeFileSync("cp-src/root.txt", "root");
    fs.utimesSync("cp-src/keep/a.txt", new Date(1234000), new Date(2345000));
    const describeCalls = (calls) => [calls[0], ...calls.slice(1).sort()].join("|");

    const syncCalls = [];
    fs.cpSync("cp-src", "cp-sync", {
      recursive: true,
      preserveTimestamps: true,
      filter(source, destination) {
        syncCalls.push(source + ">" + destination);
        return source.includes("/skip") ? "" : 1;
      }
    });
    console.log("sync calls", describeCalls(syncCalls));
    console.log("sync results", fs.existsSync("cp-sync/keep/a.txt"), fs.existsSync("cp-sync/skip"), fs.existsSync("cp-sync/root.txt"));
    console.log("sync mtime", fs.statSync("cp-sync/keep/a.txt").mtimeMs);

    fs.writeFileSync("existing.txt", "old");
    fs.writeFileSync("incoming.txt", "new");
    fs.cpSync("incoming.txt", "existing.txt", { force: false });
    console.log("force false", fs.readFileSync("existing.txt", "utf8"));
    fs.cpSync("incoming.txt", "existing.txt", { errorOnExist: true });
    console.log("error default force", fs.readFileSync("existing.txt", "utf8"));
    fs.writeFileSync("existing.txt", "old");
    try {
      fs.cpSync("incoming.txt", "existing.txt", { force: false, errorOnExist: true });
    } catch (error) {
      console.log("error force false", error.code, error.syscall, error.path);
    }
    console.log("error kept", fs.readFileSync("existing.txt", "utf8"));

    try {
      fs.cpSync("incoming.txt", "invalid.txt", { filter: async () => true });
    } catch (error) {
      console.log("promise filter sync", error.code);
    }

    const callbackCalls = [];
    await new Promise((resolve, reject) => {
      fs.cp("cp-src", "cp-callback", {
        recursive: true,
        filter: async (source, destination) => {
          callbackCalls.push(source + ">" + destination);
          return source.includes("/skip") ? 0 : "yes";
        }
      }, (error) => error ? reject(error) : resolve());
    });
    console.log("callback", describeCalls(callbackCalls), fs.existsSync("cp-callback/skip"), fs.existsSync("cp-callback/keep/a.txt"));

    const promiseCalls = [];
    await fsp.cp("cp-src", "cp-promise", {
      recursive: true,
      filter: async (source, destination) => {
        promiseCalls.push(source + ">" + destination);
        return source.includes("/skip") ? null : {};
      }
    });
    console.log("promise", describeCalls(promiseCalls), fs.existsSync("cp-promise/skip"), fs.existsSync("cp-promise/keep/a.txt"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync calls cp-src>cp-sync|cp-src/keep/a.txt>cp-sync/keep/a.txt|cp-src/keep>cp-sync/keep|cp-src/root.txt>cp-sync/root.txt|cp-src/skip>cp-sync/skip",
    "sync results true false true",
    "sync mtime 2345000",
    "force false old",
    "error default force new",
    "error force false ERR_FS_CP_EEXIST cp /workspace/existing.txt",
    "error kept old",
    "promise filter sync ERR_INVALID_RETURN_VALUE",
    "callback cp-src>cp-callback|cp-src/keep/a.txt>cp-callback/keep/a.txt|cp-src/keep>cp-callback/keep|cp-src/root.txt>cp-callback/root.txt|cp-src/skip>cp-callback/skip false true",
    "promise cp-src>cp-promise|cp-src/keep/a.txt>cp-promise/keep/a.txt|cp-src/keep>cp-promise/keep|cp-src/root.txt>cp-promise/root.txt|cp-src/skip>cp-promise/skip false true"
  ]);
});

test("node:fs honors access modes and file descriptor whole-file helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("private.txt", "secret");
    fs.chmodSync("private.txt", 0o600);
    fs.accessSync("private.txt", fs.constants.R_OK | fs.constants.W_OK);
    console.log("private rw");

    fs.chmodSync("private.txt", 0o400);
    try {
      fs.accessSync("private.txt", fs.constants.W_OK);
    } catch (error) {
      console.log("write access", error.code);
    }

    fs.writeFileSync("script.sh", "echo ok");
    fs.chmodSync("script.sh", 0o644);
    try {
      await fsp.access("script.sh", fs.constants.X_OK);
    } catch (error) {
      console.log("execute access", error.code);
    }
    fs.chmodSync("script.sh", 0o755);
    await fsp.access("script.sh", fs.constants.X_OK);
    console.log("execute ok");

    fs.writeFileSync("fd.txt", "abcdef");
    const readFd = fs.openSync("fd.txt", "r");
    const prefix = Buffer.alloc(2);
    fs.readSync(readFd, prefix, 0, 2, null);
    console.log("prefix", prefix.toString());
    console.log("remaining", fs.readFileSync(readFd, "utf8"));
    console.log("again", JSON.stringify(fs.readFileSync(readFd, "utf8")));
    fs.closeSync(readFd);

    const writeFd = fs.openSync("fd.txt", "r+");
    fs.readSync(writeFd, Buffer.alloc(2), 0, 2, null);
    fs.writeFileSync(writeFd, "XX");
    fs.closeSync(writeFd);
    console.log(fs.readFileSync("fd.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "private rw",
    "write access EACCES",
    "execute access EACCES",
    "execute ok",
    "prefix ab",
    "remaining cdef",
    "again \"\"",
    "abXXef"
  ]);
});

test("node:fs supports vector read and write descriptor helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("vectors.txt", "0123456789");

    const readFd = fs.openSync("vectors.txt", "r");
    const readOne = Buffer.alloc(2);
    const readTwo = Buffer.alloc(3);
    console.log("readvSync", fs.readvSync(readFd, [readOne, readTwo], 1), readOne.toString(), readTwo.toString());

    const current = Buffer.alloc(2);
    fs.readSync(readFd, current, 0, 2, null);
    console.log("position", current.toString());
    fs.closeSync(readFd);

    const writeFd = fs.openSync("vectors.txt", "r+");
    console.log("writevSync", fs.writevSync(writeFd, [Buffer.from("AB"), Buffer.from("CD")], 2));
    fs.writeSync(writeFd, "Z");
    fs.closeSync(writeFd);
    console.log("after sync", fs.readFileSync("vectors.txt", "utf8"));

    const callbackFd = fs.openSync("vectors.txt", "r");
    await new Promise((resolve, reject) => {
      const a = Buffer.alloc(1);
      const b = Buffer.alloc(2);
      fs.readv(callbackFd, [a, b], 1, (error, bytesRead, buffers) => {
        if (error) {
          reject(error);
          return;
        }
        console.log("readv callback", bytesRead, a.toString(), b.toString(), buffers.length);
        resolve();
      });
    });
    fs.closeSync(callbackFd);

    const handle = await fsp.open("vectors.txt", "r+");
    const handleA = Buffer.alloc(2);
    const handleB = Buffer.alloc(2);
    const readResult = await handle.readv([handleA, handleB], 1);
    console.log("handle readv", readResult.bytesRead, handleA.toString(), handleB.toString());
    const writeResult = await handle.writev([Buffer.from("xy"), Buffer.from("z")], 1);
    console.log("handle writev", writeResult.bytesWritten);
    await handle.close();
    console.log("after handle", fs.readFileSync("vectors.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "readvSync 5 12 345",
    "position 01",
    "writevSync 4",
    "after sync Z1ABCD6789",
    "readv callback 3 1 AB 2",
    "handle readv 4 1A BC",
    "handle writev 3",
    "after handle ZxyzCD6789"
  ]);
});

test("node:fs supports descriptor read and write option overloads", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("overloads.txt", "abcdef");
    let fd = fs.openSync("overloads.txt", "r+");
    const syncBuffer = Buffer.alloc(4, ".");
    console.log("readSync options", fs.readSync(fd, syncBuffer, { offset: 1, length: 2, position: 2 }), JSON.stringify(syncBuffer.toString()));
    const syncDefault = Buffer.alloc(3, ".");
    console.log("readSync default options", fs.readSync(fd, syncDefault, {}), JSON.stringify(syncDefault.toString()));
    fs.closeSync(fd);

    fs.writeFileSync("overloads.txt", "abcdef");
    fd = fs.openSync("overloads.txt", "r+");
    console.log("writeSync buffer options", fs.writeSync(fd, Buffer.from("XYZ"), { offset: 1, length: 2, position: 1 }));
    console.log("after writeSync buffer", fs.readFileSync("overloads.txt", "utf8"));
    console.log("writeSync string object", fs.writeSync(fd, "pqrs", { offset: 1, length: 2, position: 4 }));
    fs.closeSync(fd);
    console.log("after writeSync string", fs.readFileSync("overloads.txt", "utf8"));

    fs.writeFileSync("overloads.txt", "abcdef");
    fd = fs.openSync("overloads.txt", "r+");
    const callbackBuffer = Buffer.alloc(4, ".");
    await new Promise((resolve, reject) => {
      fs.read(fd, callbackBuffer, { offset: 1, length: 2, position: 2 }, (error, bytesRead, buffer) => {
        if (error) {
          reject(error);
          return;
        }
        console.log("read callback options", bytesRead, buffer === callbackBuffer, JSON.stringify(callbackBuffer.toString()));
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      const source = Buffer.from("XYZ");
      fs.write(fd, source, { offset: 1, length: 2, position: 1 }, (error, bytesWritten, buffer) => {
        if (error) {
          reject(error);
          return;
        }
        console.log("write callback buffer options", bytesWritten, buffer === source, fs.readFileSync("overloads.txt", "utf8"));
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      fs.write(fd, "pqrs", { offset: 1, length: 2, position: 4 }, (error, bytesWritten, value) => {
        if (error) {
          reject(error);
          return;
        }
        console.log("write callback string object", bytesWritten, value, fs.readFileSync("overloads.txt", "utf8"));
        resolve();
      });
    });
    fs.closeSync(fd);

    fs.writeFileSync("overloads.txt", "abcdef");
    const handle = await fsp.open("overloads.txt", "r+");
    const handleBuffer = Buffer.alloc(4, ".");
    const readResult = await handle.read(handleBuffer, { offset: 1, length: 2, position: 2 });
    console.log("handle read options", readResult.bytesRead, readResult.buffer === handleBuffer, JSON.stringify(handleBuffer.toString()));
    const writeResult = await handle.write(Buffer.from("XYZ"), { offset: 1, length: 2, position: 1 });
    console.log("handle write buffer options", writeResult.bytesWritten, writeResult.buffer.toString(), fs.readFileSync("overloads.txt", "utf8"));
    const stringResult = await handle.write("pqrs", { offset: 1, length: 2, position: 4 });
    console.log("handle write string object", stringResult.bytesWritten, stringResult.buffer, fs.readFileSync("overloads.txt", "utf8"));
    await handle.close();
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'readSync options 2 ".cd."',
    'readSync default options 3 "abc"',
    "writeSync buffer options 2",
    "after writeSync buffer aYZdef",
    "writeSync string object 4",
    "after writeSync string pqrsef",
    'read callback options 2 true ".cd."',
    "write callback buffer options 2 true aYZdef",
    "write callback string object 4 pqrs pqrsef",
    'handle read options 2 true ".cd."',
    "handle write buffer options 2 XYZ aYZdef",
    "handle write string object 4 pqrs pqrsef"
  ]);
});

test("node:fs supports descriptor metadata and flush helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.writeFileSync("fd-meta.txt", "abc");
    const fd = fs.openSync("fd-meta.txt", "r+");
    console.log("fstatSync", fs.fstatSync(fd).size, typeof fs.fstatSync(fd, { bigint: true }).size);
    fs.futimesSync(fd, 1, 2);
    console.log("futimesSync", fs.statSync("fd-meta.txt").mtimeMs);
    fs.fsyncSync(fd);
    fs.fdatasyncSync(fd);

    await new Promise((resolve, reject) => {
      fs.fstat(fd, (error, stat) => {
        if (error) {
          reject(error);
          return;
        }
        console.log("fstat", stat.size);
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      fs.futimes(fd, 3, 4, (error) => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => fs.fsync(fd, (error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => fs.fdatasync(fd, (error) => error ? reject(error) : resolve()));
    fs.closeSync(fd);
    console.log("futimes", fs.statSync("fd-meta.txt").mtimeMs);

    const handle = await fsp.open("fd-meta.txt", "r+");
    const handleProto = Object.getPrototypeOf(handle);
    const fdDescriptor = Object.getOwnPropertyDescriptor(handleProto, "fd");
    const handleDescriptorRow = (owner, name) => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if ("value" in descriptor) {
        return [String(name), "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      }
      return [String(name), "accessor", descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, typeof descriptor.set, Object.hasOwn(descriptor.get, "prototype")].join(":");
    };
    console.log("handle shape", handle.constructor.name, Object.hasOwn(handle, "fd"), Object.hasOwn(handle, "close"), fdDescriptor.enumerable);
    console.log("handle proto names", Object.getOwnPropertyNames(handleProto).join(","));
    console.log("handle proto keys", Object.keys(handleProto).join(","));
    console.log("handle rows", ["getAsyncId", "fd", "appendFile", "read", "write", "readableWebStream", "createReadStream", "createWriteStream"].map((name) => handleDescriptorRow(handleProto, name)).join("|"));
    console.log("handle close row", handleDescriptorRow(handle, "close"));
    console.log("handle async dispose", handleDescriptorRow(handleProto, Symbol.asyncDispose));
    console.log("handle methods", Object.hasOwn(handle, "read"), handle.read.length, handle.write.length, handle.readv.length, handle.writev.length, handle.close.length);
    console.log("handle fd", typeof handle.fd, handle.fd >= 0);
    const asyncId = handle.getAsyncId();
    console.log("handle async id", typeof asyncId, asyncId > 0, handle.getAsyncId() === asyncId);
    console.log("handle stat", (await handle.stat()).size);
    await handle.utimes(5, 6);
    await handle.sync();
    await handle.datasync();
    await handle.close();
    await handle.close();
    console.log("handle closed", handle.fd, handle.getAsyncId() === asyncId);
    console.log("handle utimes", fs.statSync("fd-meta.txt").mtimeMs);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "fstatSync 3 bigint",
    "futimesSync 2000",
    "fstat 3",
    "futimes 4000",
    "handle shape FileHandle false true false",
    "handle proto names constructor,getAsyncId,fd,appendFile,chmod,chown,datasync,sync,read,readv,readFile,readLines,stat,truncate,utimes,write,writev,writeFile,readableWebStream,createReadStream,createWriteStream",
    "handle proto keys ",
    "handle rows getAsyncId:data:false:true:true:getAsyncId:0:false|fd:accessor:false:true:get fd:0:undefined:false|appendFile:data:false:true:true:appendFile:2:false|read:data:false:true:true:read:4:false|write:data:false:true:true:write:4:false|readableWebStream:data:false:true:true:readableWebStream:0:false|createReadStream:data:false:true:true:createReadStream:0:false|createWriteStream:data:false:true:true:createWriteStream:0:false",
    "handle close row close:data:true:true:true:close:0:false",
    "handle async dispose Symbol(Symbol.asyncDispose):data:false:true:true:[Symbol.asyncDispose]:0:false",
    "handle methods false 4 4 2 2 0",
    "handle fd number true",
    "handle async id number true true",
    "handle stat 3",
    "handle closed -1 true",
    "handle utimes 6000"
  ]);
});

test("node:fs supports glob sync, callback, and promise iterator helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.mkdirSync("src/nested", { recursive: true });
    fs.mkdirSync("test", { recursive: true });
    fs.writeFileSync("index.js", "");
    fs.writeFileSync("src/a.js", "");
    fs.writeFileSync("src/b.ts", "");
    fs.writeFileSync("src/nested/c.js", "");
    fs.writeFileSync("test/a.test.js", "");
    fs.writeFileSync(".hidden.js", "");

    console.log("sync", fs.globSync("**/*.js").sort().join(","));
    console.log("array", fs.globSync(["*.js", "src/*.ts"]).sort().join(","));
    console.log("cwd", fs.globSync("*.js", { cwd: "src" }).join(","));
    console.log("exclude", fs.globSync("**/*.js", { exclude: ["test/**"] }).sort().join(","));
    console.log("fn exclude", fs.globSync("**/*.js", { exclude: (path) => path.startsWith("src/nested") }).sort().join(","));

    const dirents = fs.globSync("**/*.js", { withFileTypes: true })
      .map((entry) => [entry.name, entry.parentPath, entry.isFile()].join(":"))
      .sort();
    console.log("dirents", dirents.join(","));

    const callbackMatches = await new Promise((resolve, reject) => {
      fs.glob("src/*.{js,ts}", (error, matches) => error ? reject(error) : resolve(matches.sort()));
    });
    console.log("callback", callbackMatches.join(","));

    const promiseMatches = [];
    for await (const match of fsp.glob("src/**/*.js")) {
      promiseMatches.push(match);
    }
    console.log("promises", promiseMatches.sort().join(","));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync index.js,src/a.js,src/nested/c.js,test/a.test.js",
    "array index.js,src/b.ts",
    "cwd a.js",
    "exclude index.js,src/a.js,src/nested/c.js",
    "fn exclude index.js,src/a.js,test/a.test.js",
    "dirents a.js:src:true,a.test.js:test:true,c.js:src/nested:true,index.js:.:true",
    "callback src/a.js,src/b.ts",
    "promises src/a.js,src/nested/c.js"
  ]);
});

test("node:fs supports recursive readdir across sync, callback, and promises", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.mkdirSync("tree/a/b", { recursive: true });
    fs.writeFileSync("tree/root.txt", "");
    fs.writeFileSync("tree/a/one.txt", "");
    fs.writeFileSync("tree/a/b/two.txt", "");

    const describeDirents = (entries) => entries
      .map((entry) => [
        entry.name,
        entry.parentPath,
        String(entry.path),
        Reflect.ownKeys(entry).map(String).join("+"),
        entry.isDirectory()
      ].join(":"))
      .join(",");

    const callbackEntries = await new Promise((resolve, reject) => {
      fs.readdir("tree", { recursive: true }, (error, entries) => error ? reject(error) : resolve(entries));
    });
    const callbackDirents = await new Promise((resolve, reject) => {
      fs.readdir("tree", { recursive: true, withFileTypes: true }, (error, entries) => error ? reject(error) : resolve(entries));
    });

    console.log("sync", fs.readdirSync("tree", { recursive: true }).join(","));
    console.log("sync dirents", describeDirents(fs.readdirSync("tree", { recursive: true, withFileTypes: true })));
    console.log("callback", callbackEntries.join(","));
    console.log("callback dirents", describeDirents(callbackDirents));
    console.log("promises", (await fsp.readdir("tree", { recursive: true })).join(","));
    console.log("promises dirents", describeDirents(await fsp.readdir("tree", { recursive: true, withFileTypes: true })));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync a,root.txt,a/b,a/one.txt,a/b/two.txt",
    "sync dirents a:/workspace/tree:undefined:name+parentPath+Symbol(type):true,root.txt:/workspace/tree:undefined:name+parentPath+Symbol(type):false,b:/workspace/tree/a:undefined:name+parentPath+Symbol(type):true,one.txt:/workspace/tree/a:undefined:name+parentPath+Symbol(type):false,two.txt:/workspace/tree/a/b:undefined:name+parentPath+Symbol(type):false",
    "callback a,root.txt,a/b,a/one.txt,a/b/two.txt",
    "callback dirents a:/workspace/tree:undefined:name+parentPath+Symbol(type):true,root.txt:/workspace/tree:undefined:name+parentPath+Symbol(type):false,b:/workspace/tree/a:undefined:name+parentPath+Symbol(type):true,one.txt:/workspace/tree/a:undefined:name+parentPath+Symbol(type):false,two.txt:/workspace/tree/a/b:undefined:name+parentPath+Symbol(type):false",
    "promises a,root.txt,a/b,a/one.txt,a/b/two.txt",
    "promises dirents a:/workspace/tree:undefined:name+parentPath+Symbol(type):true,root.txt:/workspace/tree:undefined:name+parentPath+Symbol(type):false,b:/workspace/tree/a:undefined:name+parentPath+Symbol(type):true,one.txt:/workspace/tree/a:undefined:name+parentPath+Symbol(type):false,two.txt:/workspace/tree/a/b:undefined:name+parentPath+Symbol(type):false"
  ]);
});

test("node:fs validates mkdtemp prefixes and encodes temp paths", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    const describeError = (label, action) => {
      try {
        action();
        console.log(label, "ok");
      } catch (error) {
        console.log(label, error.name, error.code);
      }
    };

    describeError("sync missing", () => fs.mkdtempSync());
    describeError("sync number", () => fs.mkdtempSync(1));
    describeError("callback no callback", () => fs.mkdtemp("tmp-"));

    await new Promise((resolve) => {
      fs.mkdtemp(undefined, (error) => {
        console.log("callback missing", error.name, error.code);
        resolve();
      });
    });

    await fsp.mkdtemp()
      .then(() => console.log("promise missing ok"))
      .catch((error) => console.log("promise missing", error.name, error.code));
    await fsp.mkdtemp(1)
      .then(() => console.log("promise number ok"))
      .catch((error) => console.log("promise number", error.name, error.code));

    const bufferTemp = fs.mkdtempSync(Buffer.from("buf-"), "buffer");
    console.log("sync buffer", Buffer.isBuffer(bufferTemp), bufferTemp.toString().startsWith("buf-"));
    fs.rmSync(bufferTemp.toString(), { recursive: true, force: true });

    const promiseBufferTemp = await fsp.mkdtemp("async-", { encoding: "buffer" });
    console.log("promise buffer", Buffer.isBuffer(promiseBufferTemp), promiseBufferTemp.toString().startsWith("async-"));
    fs.rmSync(promiseBufferTemp.toString(), { recursive: true, force: true });

    const urlTemp = fs.mkdtempSync(new URL("file:///workspace/url-"));
    console.log("file url", urlTemp.startsWith("/workspace/url-"), fs.existsSync(urlTemp));
    fs.rmSync(urlTemp, { recursive: true, force: true });
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync missing TypeError ERR_INVALID_ARG_TYPE",
    "sync number TypeError ERR_INVALID_ARG_TYPE",
    "callback no callback TypeError ERR_INVALID_ARG_TYPE",
    "callback missing TypeError ERR_INVALID_ARG_TYPE",
    "promise missing TypeError ERR_INVALID_ARG_TYPE",
    "promise number TypeError ERR_INVALID_ARG_TYPE",
    "sync buffer true true",
    "promise buffer true true",
    "file url true true"
  ]);
});

test("node:fs exposes disposable temp dirs, blob reads, constants, and stream aliases", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");
    const fsNamespace = await import("node:fs");
    const expectedFsKeys = [
      "appendFile", "appendFileSync", "access", "accessSync", "chown", "chownSync",
      "chmod", "chmodSync", "close", "closeSync", "copyFile", "copyFileSync",
      "cp", "cpSync", "createReadStream", "createWriteStream", "exists", "existsSync",
      "fchown", "fchownSync", "fchmod", "fchmodSync", "fdatasync", "fdatasyncSync",
      "fstat", "fstatSync", "fsync", "fsyncSync", "ftruncate", "ftruncateSync",
      "futimes", "futimesSync", "glob", "globSync", "lchown", "lchownSync",
      "lchmod", "lchmodSync", "link", "linkSync", "lstat", "lstatSync", "lutimes",
      "lutimesSync", "mkdir", "mkdirSync", "mkdtemp", "mkdtempSync",
      "mkdtempDisposableSync", "open", "openSync", "openAsBlob", "readdir",
      "readdirSync", "read", "readSync", "readv", "readvSync", "readFile",
      "readFileSync", "readlink", "readlinkSync", "realpath", "realpathSync",
      "rename", "renameSync", "rm", "rmSync", "rmdir", "rmdirSync", "stat",
      "statfs", "statSync", "statfsSync", "symlink", "symlinkSync", "truncate",
      "truncateSync", "unwatchFile", "unlink", "unlinkSync", "utimes", "utimesSync",
      "watch", "watchFile", "writeFile", "writeFileSync", "write", "writeSync",
      "writev", "writevSync", "Dirent", "Stats", "ReadStream", "WriteStream",
      "FileReadStream", "FileWriteStream", "Utf8Stream", "_toUnixTimestamp", "Dir",
      "opendir", "opendirSync", "constants", "promises"
    ].join(",");
    if (Object.keys(fs).join(",") !== expectedFsKeys) throw new Error("fs export order failed");

    const disposableDescriptorRow = (target, name) => {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (!descriptor) return String(name) + ":missing";
      if (name === "path") {
        return [String(name), "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
      }
      return [String(name), "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
    };

    const temp = fs.mkdtempDisposableSync("tmp-");
    console.log("sync temp", temp.path.startsWith("tmp-"), fs.existsSync(temp.path));
    console.log("sync temp proto null", Object.getPrototypeOf(temp) === null);
    console.log("sync temp keys", Object.keys(temp).join(","));
    console.log("sync temp symbols", Object.getOwnPropertySymbols(temp).map(String).join(","));
    console.log("sync temp rows", ["path", "remove", Symbol.dispose].map((name) => disposableDescriptorRow(temp, name)).join("|"));
    console.log("sync temp extra", typeof temp[Symbol.asyncDispose], temp.remove === temp[Symbol.dispose]);
    temp[Symbol.dispose]();
    console.log("sync removed", fs.existsSync(temp.path));

    const asyncTemp = await fsp.mkdtempDisposable("async-");
    console.log("async temp", asyncTemp.path.startsWith("async-"), fs.existsSync(asyncTemp.path));
    console.log("async temp proto null", Object.getPrototypeOf(asyncTemp) === null);
    console.log("async temp keys", Object.keys(asyncTemp).join(","));
    console.log("async temp symbols", Object.getOwnPropertySymbols(asyncTemp).map(String).join(","));
    console.log("async temp rows", ["path", "remove", Symbol.asyncDispose].map((name) => disposableDescriptorRow(asyncTemp, name)).join("|"));
    console.log("async temp extra", typeof asyncTemp[Symbol.dispose], asyncTemp.remove === asyncTemp[Symbol.asyncDispose], asyncTemp[Symbol.asyncDispose] === asyncTemp[Symbol.dispose]);
    const asyncRemoveResult = asyncTemp.remove();
    console.log("async temp remove", asyncRemoveResult && typeof asyncRemoveResult.then, asyncRemoveResult.constructor.name);
    await asyncRemoveResult;
    console.log("async removed", fs.existsSync(asyncTemp.path));

    fs.writeFileSync("blob.txt", "blob-data");
    const blobPromise = fs.openAsBlob("blob.txt", { type: "text/plain" });
    console.log("openAsBlob metadata", fs.openAsBlob.constructor.name, fs.openAsBlob.name, fs.openAsBlob.length, blobPromise instanceof Promise);
    const blob = await blobPromise;
    console.log("blob", blob.type, await blob.text());
    const openAsBlobValidationRows = [
      ["missing", () => fs.openAsBlob()],
      ["number-path", () => fs.openAsBlob(1)],
      ["bad-options", () => fs.openAsBlob("blob.txt", 1)],
      ["options-null", () => fs.openAsBlob("blob.txt", null)],
      ["options-array", () => fs.openAsBlob("blob.txt", [])],
      ["bad-type-symbol", () => fs.openAsBlob("blob.txt", { type: Symbol("x") })],
      ["bad-type-number", () => fs.openAsBlob("blob.txt", { type: 1 })]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    }).join("|");
    console.log("openAsBlob validation", openAsBlobValidationRows);
    console.log("constants", fsp.constants.R_OK === fs.constants.R_OK);
    const constantsDescriptor = Object.getOwnPropertyDescriptor(fs, "constants");
    const promisesConstantsDescriptor = Object.getOwnPropertyDescriptor(fsp, "constants");
    const readDescriptor = Object.getOwnPropertyDescriptor(fs.constants, "R_OK");
    console.log("constants descriptor", constantsDescriptor.enumerable, constantsDescriptor.configurable, constantsDescriptor.writable, Object.getPrototypeOf(fs.constants) === null, Object.isExtensible(fs.constants));
    console.log("constant property", readDescriptor.enumerable, readDescriptor.configurable, readDescriptor.writable, readDescriptor.value);
    console.log("promises constants descriptor", promisesConstantsDescriptor.enumerable, promisesConstantsDescriptor.configurable, promisesConstantsDescriptor.writable, fsp.constants === fs.constants);
    console.log("top-level constants", Object.hasOwn(fs, "F_OK"), fs.F_OK, Object.hasOwn(fsNamespace, "F_OK"), Object.hasOwn(fsNamespace.default, "F_OK"), fs.constants.F_OK);
    console.log("aliases", fs.ReadStream === fs.FileReadStream, fs.WriteStream === fs.FileWriteStream);
    console.log("stream accessors", ["ReadStream", "WriteStream", "FileReadStream", "FileWriteStream", "Utf8Stream"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(fs, name);
      return [name, descriptor.get?.name, descriptor.set?.name ?? "", descriptor.enumerable, descriptor.configurable].join(":");
    }).join("|"));
    console.log("sync arities", ["fstatSync", "globSync", "lstatSync", "mkdtempSync", "mkdtempDisposableSync", "readvSync", "truncateSync", "writevSync"].map((name) => name + ":" + fs[name].length).join("|"));
    console.log("dir proto", [
      Object.getOwnPropertyNames(fs.Dir.prototype).join(","),
      Object.getOwnPropertySymbols(fs.Dir.prototype).map(String).join(","),
      Object.keys(fs.Dir.prototype).join(",")
    ].join("|"));
    console.log("dir descriptors", ["path", "read", "readSync", "close", "closeSync", "entries", Symbol.asyncIterator].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(fs.Dir.prototype, name);
      return [
        String(name),
        descriptor.enumerable,
        descriptor.configurable,
        "value" in descriptor ? descriptor.writable : typeof descriptor.set,
        "value" in descriptor ? descriptor.value.name + "/" + descriptor.value.length : typeof descriptor.get
      ].join(":");
    }).join("|"));
    const manualDirent = new fs.Dirent("manual", fs.constants.UV_DIRENT_FILE, "/parent");
    const stringTypeDirent = new fs.Dirent("manual", "file", "/parent");
    console.log("dirent shape", [
      Object.keys(manualDirent).join(","),
      Reflect.ownKeys(manualDirent).map(String).join(","),
      manualDirent.parentPath,
      String(manualDirent.path),
      manualDirent.isFile(),
      stringTypeDirent.isFile()
    ].join("|"));
    console.log("dirent proto", [
      Object.getOwnPropertyNames(fs.Dirent.prototype).join(","),
      Object.keys(fs.Dirent.prototype).join(",")
    ].join("|"));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync temp true true",
    "sync temp proto null false",
    "sync temp keys path,remove",
    "sync temp symbols Symbol(Symbol.dispose)",
    "sync temp rows path:data:true:true:true:string|remove:data:true:true:true:remove:0:false|Symbol(Symbol.dispose):data:true:true:true:[Symbol.dispose]:0:false",
    "sync temp extra undefined false",
    "sync removed false",
    "async temp true true",
    "async temp proto null true",
    "async temp keys path,remove",
    "async temp symbols Symbol(Symbol.asyncDispose)",
    "async temp rows path:data:true:true:true:string|remove:data:true:true:true:remove:0:false|Symbol(Symbol.asyncDispose):data:true:true:true:[Symbol.asyncDispose]:0:false",
    "async temp extra undefined false false",
    "async temp remove function Promise",
    "async removed false",
    "openAsBlob metadata Function openAsBlob 1 true",
    "blob text/plain blob-data",
    "openAsBlob validation missing:TypeError:ERR_INVALID_ARG_TYPE:The \"path\" argument must be of type string or an instance of Buffer or URL. Received undefined|number-path:TypeError:ERR_INVALID_ARG_TYPE:The \"path\" argument must be of type string or an instance of Buffer or URL. Received type number (1)|bad-options:TypeError:ERR_INVALID_ARG_TYPE:The \"options\" argument must be of type object. Received type number (1)|options-null:TypeError:ERR_INVALID_ARG_TYPE:The \"options\" argument must be of type object. Received null|options-array:TypeError:ERR_INVALID_ARG_TYPE:The \"options\" argument must be of type object. Received an instance of Array|bad-type-symbol:TypeError:ERR_INVALID_ARG_TYPE:The \"options.type\" argument must be of type string. Received type symbol (Symbol(x))|bad-type-number:TypeError:ERR_INVALID_ARG_TYPE:The \"options.type\" argument must be of type string. Received type number (1)",
    "constants true",
    "constants descriptor true false false true true",
    "constant property true false false 4",
    "promises constants descriptor true true true true",
    "top-level constants false undefined false false 0",
    "aliases true true",
    "stream accessors ReadStream:get ReadStream:set ReadStream:true:true|WriteStream:get WriteStream:set WriteStream:true:true|FileReadStream:get FileReadStream:set FileReadStream:true:true|FileWriteStream:get FileWriteStream:set FileWriteStream:true:true|Utf8Stream:get Utf8Stream::true:true",
    "sync arities fstatSync:1|globSync:2|lstatSync:1|mkdtempSync:2|mkdtempDisposableSync:2|readvSync:3|truncateSync:2|writevSync:3",
    "dir proto constructor,path,read,readSync,close,closeSync,entries|Symbol(Symbol.dispose),Symbol(Symbol.asyncDispose),Symbol(Symbol.asyncIterator)|",
    "dir descriptors path:false:true:undefined:function|read:false:true:true:read/1|readSync:false:true:true:readSync/0|close:false:true:true:close/1|closeSync:false:true:true:closeSync/0|entries:false:true:true:entries/0|Symbol(Symbol.asyncIterator):false:true:true:entries/0",
    "dirent shape name,parentPath|name,parentPath,Symbol(type)|/parent|undefined|true|false",
    "dirent proto constructor,isDirectory,isFile,isBlockDevice,isCharacterDevice,isSymbolicLink,isFIFO,isSocket|"
  ]);
});

test("node:fs realpath detects symbolic link loops", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    fs.symlinkSync("b", "a");
    fs.symlinkSync("a", "b");

    try {
      fs.realpathSync("a");
    } catch (error) {
      console.log("sync", error.code);
    }

    try {
      await fsp.realpath("b");
    } catch (error) {
      console.log("async", error.code);
    }
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "sync ELOOP",
    "async ELOOP"
  ]);
});
