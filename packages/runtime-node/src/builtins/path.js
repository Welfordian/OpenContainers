import { basename, dirname, extname, joinPath, normalizePath, relativePath, resolvePath } from "../../../fs/src/path-utils.js";

export const sep = "/";
export const delimiter = ":";
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
  relative: relativePath
};

export default {
  ...posix,
  posix
};
