import { basename, dirname, extname, joinPath, normalizePath, relativePath, resolvePath } from "../../../fs/src/path-utils.js";

export const sep = "/";
export const delimiter = ":";
const parsePath = (path) => {
  const normalized = normalizePath(path);
  const dir = dirname(normalized);
  const base = basename(normalized);
  const ext = extname(base);
  return {
    root: normalized.startsWith("/") ? "/" : "",
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base
  };
};

const formatPath = (pathObject = {}) => {
  const dir = pathObject.dir || pathObject.root || "";
  const base = pathObject.base || `${pathObject.name || ""}${pathObject.ext || ""}`;
  if (!dir) return base;
  if (dir === "/") return `/${base}`;
  return `${dir}/${base}`;
};

export const posix = {
  sep,
  delimiter,
  normalize: normalizePath,
  join: (...parts) => normalizePath(joinPath(...parts)),
  resolve: (...parts) => {
    let resolved = "";
    for (const part of parts) {
      if (String(part).startsWith("/")) resolved = String(part);
      else resolved = `${resolved || "/"}/${part}`;
    }
    return normalizePath(resolved || "/");
  },
  dirname,
  basename,
  extname,
  isAbsolute: (path) => String(path).startsWith("/"),
  relative: relativePath,
  toNamespacedPath: (path) => path,
  parse: parsePath,
  format: formatPath,
  matchesGlob: (path, pattern) => matchesGlob(path, pattern)
};

export const win32 = {
  ...posix,
  sep: "\\",
  delimiter: ";",
  isAbsolute: (path) => /^[a-z]:[\\/]/i.test(String(path)) || /^[\\/]{2}/.test(String(path))
};

export default {
  ...posix,
  posix,
  win32
};

function matchesGlob(path, pattern) {
  const source = String(path);
  const regex = globToRegExp(String(pattern));
  return regex.test(source);
}

function globToRegExp(pattern) {
  let output = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*") {
      if (next === "*") {
        output += ".*";
        index += 1;
      } else {
        output += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      output += "[^/]";
      continue;
    }
    if (char === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close > index + 1) {
        output += pattern.slice(index, close + 1);
        index = close;
        continue;
      }
    }
    output += escapeRegExp(char);
  }
  output += "$";
  return new RegExp(output);
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
