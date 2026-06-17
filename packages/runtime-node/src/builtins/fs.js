import { resolvePath } from "../../../fs/src/path-utils.js";
import { Readable, Writable } from "./stream.js";

function wrapCallback(fn) {
  return (...args) => {
    const callback = args.at(-1);
    const hasCallback = typeof callback === "function";
    queueMicrotask(() => {
      try {
        const result = fn(...args.slice(0, hasCallback ? -1 : undefined));
        if (hasCallback) callback(null, result);
      } catch (error) {
        if (hasCallback) callback(error);
        else throw error;
      }
    });
  };
}

export function createFsBuiltin({ kernel, process }) {
  const resolve = (path) => resolvePath(process.cwd(), path);
  const fs = {
    readFileSync: (path, options) => kernel.fs.readFileSync(resolve(path), options),
    writeFileSync: (path, data, options) => kernel.fs.writeFileSync(resolve(path), data, options),
    appendFileSync: (path, data, options) => kernel.fs.appendFileSync(resolve(path), data, options),
    existsSync: (path) => kernel.fs.existsSync(resolve(path)),
    statSync: (path) => kernel.fs.statSync(resolve(path)),
    lstatSync: (path) => kernel.fs.lstatSync(resolve(path)),
    readdirSync: (path, options) => kernel.fs.readdirSync(resolve(path), options),
    mkdirSync: (path, options) => kernel.fs.mkdirSync(resolve(path), options),
    rmSync: (path, options) => kernel.fs.rmSync(resolve(path), options),
    rmdirSync: (path, options) => kernel.fs.rmdirSync(resolve(path), options),
    unlinkSync: (path) => kernel.fs.unlinkSync(resolve(path)),
    renameSync: (oldPath, newPath) => kernel.fs.renameSync(resolve(oldPath), resolve(newPath)),
    copyFileSync: (source, destination) => kernel.fs.copyFileSync(resolve(source), resolve(destination)),
    watch: (path, options, listener) => kernel.fs.watch(resolve(path), options, listener),
    watchFile: (path, options, listener) => {
      const resolved = resolve(path);
      const callback = typeof options === "function" ? options : listener;
      if (typeof callback !== "function") throw new TypeError("watchFile listener is required");
      let previous = kernel.fs.existsSync(resolved) ? kernel.fs.statSync(resolved) : null;
      return kernel.fs.watch(resolved, () => {
        const current = kernel.fs.existsSync(resolved) ? kernel.fs.statSync(resolved) : null;
        callback(current, previous);
        previous = current;
      });
    },
    unwatchFile: () => {},
    createReadStream: (path, options = {}) => {
      const stream = new Readable();
      queueMicrotask(() => {
        try {
          stream.push(kernel.fs.readFileSync(resolve(path), options.encoding ? { encoding: options.encoding } : undefined));
          stream.push(null);
        } catch (error) {
          stream.emit("error", error);
          stream.destroy(error);
        }
      });
      return stream;
    },
    createWriteStream: (path, options = {}) => {
      const chunks = [];
      const stream = new Writable({
        write: (chunk) => {
          chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
        }
      });
      const finish = () => {
        const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (options.flags === "a") kernel.fs.appendFileSync(resolve(path), data);
        else kernel.fs.writeFileSync(resolve(path), data);
      };
      stream.once("finish", finish);
      return stream;
    },
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1
    }
  };

  fs.readFile = wrapCallback((path, options) => fs.readFileSync(path, options));
  fs.writeFile = wrapCallback((path, data, options) => fs.writeFileSync(path, data, options));
  fs.appendFile = wrapCallback((path, data, options) => fs.appendFileSync(path, data, options));
  fs.readdir = wrapCallback((path, options) => fs.readdirSync(path, options));
  fs.stat = wrapCallback((path) => fs.statSync(path));
  fs.mkdir = wrapCallback((path, options) => fs.mkdirSync(path, options));
  fs.rm = wrapCallback((path, options) => fs.rmSync(path, options));
  fs.rename = wrapCallback((oldPath, newPath) => fs.renameSync(oldPath, newPath));

  fs.promises = {
    readFile: async (path, options) => fs.readFileSync(path, options),
    writeFile: async (path, data, options) => fs.writeFileSync(path, data, options),
    appendFile: async (path, data, options) => fs.appendFileSync(path, data, options),
    exists: async (path) => fs.existsSync(path),
    stat: async (path) => fs.statSync(path),
    lstat: async (path) => fs.lstatSync(path),
    readdir: async (path, options) => fs.readdirSync(path, options),
    mkdir: async (path, options) => fs.mkdirSync(path, options),
    rm: async (path, options) => fs.rmSync(path, options),
    rename: async (oldPath, newPath) => fs.renameSync(oldPath, newPath),
    copyFile: async (source, destination) => fs.copyFileSync(source, destination),
    unlink: async (path) => fs.unlinkSync(path)
  };

  return fs;
}
