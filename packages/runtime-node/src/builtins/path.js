import { basename as fsBasename, dirname as fsDirname, extname as fsExtname, joinPath, normalizePath, relativePath } from "../../../fs/src/path-utils.js";

export const sep = "/";
export const delimiter = ":";

function validatePathString(value, name) {
  if (typeof value === "string") return value;
  const received = value === null
    ? "null"
    : typeof value === "object"
      ? `an instance of ${value?.constructor?.name ?? "Object"}`
      : `type ${typeof value}`;
  throw Object.assign(new TypeError(`The "${name}" argument must be of type string. Received ${received}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function validatePathObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const received = value === null
    ? "null"
    : value === undefined
      ? "undefined"
    : Array.isArray(value)
      ? "an instance of Array"
      : `type ${typeof value}`;
  throw Object.assign(new TypeError(`The "pathObject" argument must be of type object. Received ${received}`), {
    code: "ERR_INVALID_ARG_TYPE"
  });
}

function createPathHelper(fn, name = fn.name, length = fn.length) {
  const helper = (...args) => fn(...args);
  Object.defineProperties(helper, {
    name: { configurable: true, value: name },
    length: { configurable: true, value: length }
  });
  return helper;
}

function createBoundPathHelper(fn, name, length = fn.length) {
  const helper = fn.bind(null);
  Object.defineProperties(helper, {
    name: { configurable: true, value: name },
    length: { configurable: true, value: length }
  });
  return helper;
}

function normalize(path) {
  const value = validatePathString(path, "path");
  const normalized = normalizePath(value);
  if (shouldPreservePosixTrailingSeparator(value, normalized)) return `${normalized}/`;
  return normalized;
}

function shouldPreservePosixTrailingSeparator(value, normalized) {
  return value.length > 0 && value.endsWith("/") && normalized !== "/";
}

function ensureExt(ext) {
  if (!ext) return "";
  const value = String(ext);
  return value.startsWith(".") ? value : `.${value}`;
}

function join(...parts) {
  for (const part of parts) validatePathString(part, "path");
  return normalizePath(joinPath(...parts));
}

function resolve(...parts) {
  let resolved = "";
  for (let index = 0; index < parts.length; index += 1) {
    const part = validatePathString(parts[index], `paths[${index}]`);
    if (String(part).startsWith("/")) resolved = String(part);
    else resolved = `${resolved || "/"}/${part}`;
  }
  return normalizePath(resolved || "/");
}

function isAbsolute(path) {
  validatePathString(path, "path");
  return String(path).startsWith("/");
}

function relative(from, to) {
  validatePathString(from, "from");
  validatePathString(to, "to");
  return relativePath(from, to);
}

function toNamespacedPath(path) {
  return path;
}

function dirname(path) {
  validatePathString(path, "path");
  return fsDirname(path);
}

function basename(path, suffix) {
  const value = validatePathString(path, "path");
  const suffixString = suffix === undefined ? undefined : validatePathString(suffix, "suffix");
  return basenameWithSuffix(value, suffixString, isPosixPathSeparator);
}

function extname(path) {
  validatePathString(path, "path");
  return fsExtname(path);
}

function parse(path) {
  validatePathString(path, "path");
  const normalized = normalizePath(path);
  const dir = dirname(normalized);
  const base = fsBasename(normalized);
  const ext = extname(base);
  return {
    root: normalized.startsWith("/") ? "/" : "",
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base
  };
}

function format(pathObject) {
  validatePathObject(pathObject);
  const dir = pathObject.dir || pathObject.root || "";
  const base = pathObject.base || `${pathObject.name || ""}${ensureExt(pathObject.ext)}`;
  if (!dir) return base;
  if (dir === "/") return `/${base}`;
  return `${dir}/${base}`;
}

Object.defineProperty(format, "name", { configurable: true, value: "bound _format" });

export const posix = {};

const WIN32_CWD = "C:\\workspace";

function joinWin32(...parts) {
  for (const part of parts) validatePathString(part, "path");
  return normalizeWin32Path(parts.filter((part) => part !== "").join("\\"));
}

function resolveWin32(...parts) {
  return resolveWin32Path(...parts);
}

function isAbsoluteWin32(path) {
  return parseWin32Path(path).absolute;
}

Object.defineProperty(joinWin32, "name", { configurable: true, value: "join" });
Object.defineProperty(resolveWin32, "name", { configurable: true, value: "resolve" });
Object.defineProperty(isAbsoluteWin32, "name", { configurable: true, value: "isAbsolute" });
for (const [fn, name] of [
  [normalizeWin32Path, "normalize"],
  [relativeWin32Path, "relative"],
  [toNamespacedWin32Path, "toNamespacedPath"],
  [dirnameWin32, "dirname"],
  [basenameWin32, "basename"],
  [extnameWin32, "extname"],
  [parseWin32PathObject, "parse"],
  [formatWin32Path, "bound _format"],
  [matchesWin32Glob, "matchesGlob"]
]) {
  Object.defineProperty(fn, "name", { configurable: true, value: name });
}

export const win32 = {};

const posixResolve = createPathHelper(resolve);
const posixNormalize = createPathHelper(normalize);
const posixIsAbsolute = createPathHelper(isAbsolute);
const posixJoin = createPathHelper(join);
const posixRelative = createPathHelper(relative);
const posixToNamespacedPath = createPathHelper(toNamespacedPath);
const posixDirname = createPathHelper(dirname);
const posixBasename = createPathHelper(basename);
const posixExtname = createPathHelper(extname);
const posixFormat = createBoundPathHelper(format, "bound _format");
const posixParse = createPathHelper(parse);
const posixMatchesGlob = createPathHelper(matchesGlob);

const win32Resolve = createPathHelper(resolveWin32, "resolve");
const win32Normalize = createPathHelper(normalizeWin32Path, "normalize");
const win32IsAbsolute = createPathHelper(isAbsoluteWin32, "isAbsolute");
const win32Join = createPathHelper(joinWin32, "join");
const win32Relative = createPathHelper(relativeWin32Path, "relative");
const win32ToNamespacedPath = createPathHelper(toNamespacedWin32Path, "toNamespacedPath");
const win32Dirname = createPathHelper(dirnameWin32, "dirname");
const win32Basename = createPathHelper(basenameWin32, "basename");
const win32Extname = createPathHelper(extnameWin32, "extname");
const win32Format = createBoundPathHelper(formatWin32Path, "bound _format");
const win32Parse = createPathHelper(parseWin32PathObject, "parse");
const win32MatchesGlob = createPathHelper(matchesWin32Glob, "matchesGlob");

Object.defineProperties(posix, {
  resolve: { enumerable: true, configurable: true, writable: true, value: posixResolve },
  normalize: { enumerable: true, configurable: true, writable: true, value: posixNormalize },
  isAbsolute: { enumerable: true, configurable: true, writable: true, value: posixIsAbsolute },
  join: { enumerable: true, configurable: true, writable: true, value: posixJoin },
  relative: { enumerable: true, configurable: true, writable: true, value: posixRelative },
  toNamespacedPath: { enumerable: true, configurable: true, writable: true, value: posixToNamespacedPath },
  dirname: { enumerable: true, configurable: true, writable: true, value: posixDirname },
  basename: { enumerable: true, configurable: true, writable: true, value: posixBasename },
  extname: { enumerable: true, configurable: true, writable: true, value: posixExtname },
  format: { enumerable: true, configurable: true, writable: true, value: posixFormat },
  parse: { enumerable: true, configurable: true, writable: true, value: posixParse },
  matchesGlob: { enumerable: true, configurable: true, writable: true, value: posixMatchesGlob },
  sep: { enumerable: true, configurable: true, writable: true, value: sep },
  delimiter: { enumerable: true, configurable: true, writable: true, value: delimiter },
  win32: { enumerable: true, configurable: true, writable: true, value: win32 },
  posix: { enumerable: true, configurable: true, writable: true, value: posix },
  _makeLong: { enumerable: true, configurable: true, writable: true, value: posixToNamespacedPath }
});

Object.defineProperties(win32, {
  resolve: { enumerable: true, configurable: true, writable: true, value: win32Resolve },
  normalize: { enumerable: true, configurable: true, writable: true, value: win32Normalize },
  isAbsolute: { enumerable: true, configurable: true, writable: true, value: win32IsAbsolute },
  join: { enumerable: true, configurable: true, writable: true, value: win32Join },
  relative: { enumerable: true, configurable: true, writable: true, value: win32Relative },
  toNamespacedPath: { enumerable: true, configurable: true, writable: true, value: win32ToNamespacedPath },
  dirname: { enumerable: true, configurable: true, writable: true, value: win32Dirname },
  basename: { enumerable: true, configurable: true, writable: true, value: win32Basename },
  extname: { enumerable: true, configurable: true, writable: true, value: win32Extname },
  format: { enumerable: true, configurable: true, writable: true, value: win32Format },
  parse: { enumerable: true, configurable: true, writable: true, value: win32Parse },
  matchesGlob: { enumerable: true, configurable: true, writable: true, value: win32MatchesGlob },
  sep: { enumerable: true, configurable: true, writable: true, value: "\\" },
  delimiter: { enumerable: true, configurable: true, writable: true, value: ";" },
  win32: { enumerable: true, configurable: true, writable: true, value: win32 },
  posix: { enumerable: true, configurable: true, writable: true, value: posix },
  _makeLong: { enumerable: true, configurable: true, writable: true, value: win32ToNamespacedPath }
});

const pathBuiltin = {};
Object.defineProperties(pathBuiltin, {
  resolve: { enumerable: true, configurable: true, writable: true, value: posixResolve },
  normalize: { enumerable: true, configurable: true, writable: true, value: posixNormalize },
  isAbsolute: { enumerable: true, configurable: true, writable: true, value: posixIsAbsolute },
  join: { enumerable: true, configurable: true, writable: true, value: posixJoin },
  relative: { enumerable: true, configurable: true, writable: true, value: posixRelative },
  toNamespacedPath: { enumerable: true, configurable: true, writable: true, value: posixToNamespacedPath },
  dirname: { enumerable: true, configurable: true, writable: true, value: posixDirname },
  basename: { enumerable: true, configurable: true, writable: true, value: posixBasename },
  extname: { enumerable: true, configurable: true, writable: true, value: posixExtname },
  format: { enumerable: true, configurable: true, writable: true, value: posixFormat },
  parse: { enumerable: true, configurable: true, writable: true, value: posixParse },
  matchesGlob: { enumerable: true, configurable: true, writable: true, value: posixMatchesGlob },
  sep: { enumerable: true, configurable: true, writable: true, value: sep },
  delimiter: { enumerable: true, configurable: true, writable: true, value: delimiter },
  win32: { enumerable: true, configurable: true, writable: true, value: win32 },
  posix: { enumerable: true, configurable: true, writable: true, value: posix },
  _makeLong: { enumerable: true, configurable: true, writable: true, value: posixToNamespacedPath }
});

export default pathBuiltin;

function matchesGlob(path, pattern) {
  const source = validatePathString(path, "path");
  const regex = globToRegExp(validatePathString(pattern, "pattern"));
  return regex.test(source);
}

function globToRegExp(pattern) {
  return compileGlobToRegExp(pattern);
}

function compileGlobToRegExp(pattern, flags = "") {
  let output = "^";
  let segmentStart = true;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "/") {
      output += "/";
      segmentStart = true;
      continue;
    }
    if (char === "*") {
      if (next === "*") {
        if (pattern[index + 2] === "/") {
          output += "(?:(?!\\.)[^/]+/)*";
          index += 2;
        } else {
          output += ".*";
          index += 1;
          segmentStart = false;
        }
      } else {
        output += `${segmentStart ? "(?!\\.)" : ""}[^/]*`;
        segmentStart = false;
      }
      continue;
    }
    if (char === "?") {
      output += `${segmentStart ? "(?!\\.)" : ""}[^/]`;
      segmentStart = false;
      continue;
    }
    if (char === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close > index + 1) {
        const rawClass = pattern.slice(index + 1, close);
        const negated = rawClass.startsWith("!");
        const classContent = negated ? rawClass.slice(1) : rawClass;
        const classPrefix = negated ? "^" : "";
        const dotGuard = segmentStart && !classContent.includes(".") ? "(?!\\.)" : "";
        output += `${dotGuard}[${classPrefix}${escapeGlobClass(classContent)}]`;
        index = close;
        segmentStart = false;
        continue;
      }
    }
    if (char === "{") {
      const close = pattern.indexOf("}", index + 1);
      if (close > index + 1) {
        const alternatives = pattern.slice(index + 1, close).split(",");
        output += `(?:${alternatives.map(escapeRegExp).join("|")})`;
        index = close;
        segmentStart = false;
        continue;
      }
    }
    output += escapeRegExp(char);
    segmentStart = false;
  }
  output += "$";
  return new RegExp(output, flags);
}

function escapeGlobClass(value) {
  return String(value).replace(/\\/g, "\\\\");
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function basenameWithSuffix(value, suffix, isPathSeparator, startOffset = 0) {
  let start = startOffset;
  let end = -1;
  let matchedSlash = true;

  if (suffix !== undefined && suffix.length > 0 && suffix.length <= value.length) {
    if (suffix === value) return "";
    let suffixIndex = suffix.length - 1;
    let firstNonSlashEnd = -1;
    for (let index = value.length - 1; index >= start; index -= 1) {
      const code = value.charCodeAt(index);
      if (isPathSeparator(code)) {
        if (!matchedSlash) {
          start = index + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          matchedSlash = false;
          firstNonSlashEnd = index + 1;
        }
        if (suffixIndex >= 0) {
          if (code === suffix.charCodeAt(suffixIndex)) {
            suffixIndex -= 1;
            if (suffixIndex === -1) end = index;
          } else {
            suffixIndex = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }

    if (start === end) end = firstNonSlashEnd;
    else if (end === -1) end = value.length;
    return value.slice(start, end);
  }

  for (let index = value.length - 1; index >= start; index -= 1) {
    if (isPathSeparator(value.charCodeAt(index))) {
      if (!matchedSlash) {
        start = index + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = index + 1;
    }
  }

  if (end === -1) return "";
  return value.slice(start, end);
}

function isPosixPathSeparator(code) {
  return code === 47;
}

function isWin32PathSeparator(code) {
  return code === 47 || code === 92;
}

function isWin32DeviceRoot(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function normalizeWin32Slashes(path) {
  return String(path).replace(/\//g, "\\");
}

function shouldPreserveWin32TrailingSeparator(value) {
  return value.length > 0 && isWin32PathSeparator(value.charCodeAt(value.length - 1));
}

function parseWin32Path(path) {
  const value = normalizeWin32Slashes(validatePathString(path, "path"));
  if (!value) {
    return { value, root: "", tail: "", absolute: false, drive: "", unc: false };
  }

  const namespacedUnc = /^\\\\[?.]\\UNC\\([^\\]+)\\([^\\]+)(?:\\|$)/i.exec(value);
  if (namespacedUnc) {
    const root = `\\\\?\\UNC\\${namespacedUnc[1]}\\${namespacedUnc[2]}\\`;
    return {
      value,
      root,
      tail: value.slice(root.length),
      absolute: true,
      drive: "",
      unc: true,
      namespaced: true
    };
  }

  const namespacedDrive = /^\\\\[?.]\\([a-z]:\\?)/i.exec(value);
  if (namespacedDrive) {
    const drive = namespacedDrive[1].slice(0, 2);
    const root = `\\\\?\\${namespacedDrive[1].endsWith("\\") ? `${drive}\\` : drive}`;
    return {
      value,
      root,
      tail: value.slice(root.length),
      absolute: namespacedDrive[1].endsWith("\\"),
      drive,
      unc: false,
      namespaced: true
    };
  }

  const unc = /^\\\\([^\\]+)\\([^\\]+)(?:\\|$)/.exec(value);
  if (unc) {
    const shareRoot = `\\\\${unc[1]}\\${unc[2]}`;
    const root = value.length > shareRoot.length ? `${shareRoot}\\` : shareRoot;
    return {
      value,
      root,
      tail: value.slice(root.length),
      absolute: true,
      drive: "",
      unc: true
    };
  }

  const drive = /^([a-z]:)(\\)?/i.exec(value);
  if (drive) {
    const root = `${drive[1]}${drive[2] ? "\\" : ""}`;
    return {
      value,
      root,
      tail: value.slice(root.length),
      absolute: Boolean(drive[2]),
      drive: drive[1],
      unc: false
    };
  }

  if (value.startsWith("\\")) {
    return {
      value,
      root: "\\",
      tail: value.slice(1),
      absolute: true,
      drive: "",
      unc: false
    };
  }

  return { value, root: "", tail: value, absolute: false, drive: "", unc: false };
}

function normalizeWin32Segments(tail, absolute) {
  const output = [];
  for (const part of String(tail).split("\\")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (output.length && output[output.length - 1] !== "..") {
        output.pop();
      } else if (!absolute) {
        output.push("..");
      }
      continue;
    }
    output.push(part);
  }
  return output;
}

function normalizeWin32Path(path) {
  const parsed = parseWin32Path(path);
  if (!parsed.value) return ".";

  const segments = normalizeWin32Segments(parsed.tail, parsed.absolute);
  const joined = segments.join("\\");
  const preserveTrailing = shouldPreserveWin32TrailingSeparator(parsed.value);

  if (parsed.unc) {
    const root = parsed.root.endsWith("\\") ? parsed.root : `${parsed.root}\\`;
    return joined ? `${root}${joined}${preserveTrailing ? "\\" : ""}` : root;
  }

  if (parsed.root) {
    if (parsed.root.endsWith("\\")) return joined ? `${parsed.root}${joined}${preserveTrailing ? "\\" : ""}` : parsed.root;
    return joined ? `${parsed.root}${joined}${preserveTrailing ? "\\" : ""}` : parsed.root;
  }

  const normalized = joined || ".";
  return preserveTrailing ? `${normalized}\\` : normalized;
}

function resolveWin32Path(...parts) {
  let resolved = "";
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = normalizeWin32Slashes(validatePathString(parts[index], `paths[${index}]`));
    if (!part) continue;
    resolved = resolved ? `${part}\\${resolved}` : part;
    if (parseWin32Path(part).absolute) break;
  }

  if (!parseWin32Path(resolved).absolute) {
    resolved = `${WIN32_CWD}\\${resolved || "."}`;
  }

  return normalizeWin32Path(resolved);
}

function trimTrailingWin32Separators(value) {
  const parsed = parseWin32Path(value);
  let output = parsed.value;
  while (output.length > parsed.root.length && output.endsWith("\\")) {
    output = output.slice(0, -1);
  }
  return output;
}

function dirnameWin32(path) {
  const normalized = normalizeWin32Path(path);
  const trimmed = trimTrailingWin32Separators(normalized);
  const parsed = parseWin32Path(trimmed);
  if (!trimmed || trimmed === ".") return ".";
  if (trimmed === parsed.root) return parsed.root || ".";
  const index = trimmed.lastIndexOf("\\");
  if (index < 0) return parsed.root || ".";
  if (index < parsed.root.length) return parsed.root || ".";
  if (index === 0) return "\\";
  return trimmed.slice(0, index);
}

function basenameWin32(path, suffix) {
  const value = validatePathString(path, "path");
  const suffixString = suffix === undefined ? undefined : validatePathString(suffix, "suffix");
  const start = value.length >= 2 && isWin32DeviceRoot(value.charCodeAt(0)) && value.charCodeAt(1) === 58
    ? 2
    : 0;
  return basenameWithSuffix(value, suffixString, isWin32PathSeparator, start);
}

function extnameWin32(path) {
  const base = basenameWin32(path);
  const index = base.lastIndexOf(".");
  if (index <= 0) return "";
  return base.slice(index);
}

function parseWin32PathObject(path) {
  const normalized = normalizeWin32Path(path);
  if (normalized === ".") return { root: "", dir: "", base: "", ext: "", name: "" };
  const parsed = parseWin32Path(normalized);
  if (normalized === parsed.root) {
    return { root: parsed.root, dir: parsed.root, base: "", ext: "", name: "" };
  }
  const base = basenameWin32(normalized);
  const ext = extnameWin32(normalized);
  const dir = base ? dirnameWin32(normalized) : parsed.root;
  return {
    root: parsed.root,
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base
  };
}

function formatWin32Path(pathObject) {
  validatePathObject(pathObject);
  const dir = pathObject.dir || pathObject.root || "";
  const base = pathObject.base || `${pathObject.name || ""}${ensureExt(pathObject.ext)}`;
  if (!dir) return base;
  if (dir.endsWith("\\") || dir.endsWith("/")) return `${normalizeWin32Slashes(dir)}${base}`;
  return `${normalizeWin32Slashes(dir)}\\${base}`;
}

function relativeWin32Path(from, to) {
  validatePathString(from, "from");
  validatePathString(to, "to");
  const fromNormalized = resolveWin32Path(from);
  const toNormalized = resolveWin32Path(to);
  const fromParsed = parseWin32Path(fromNormalized);
  const toParsed = parseWin32Path(toNormalized);

  if (fromNormalized.toLowerCase() === toNormalized.toLowerCase()) return "";
  if (fromParsed.root.toLowerCase() !== toParsed.root.toLowerCase()) return toNormalized;

  const fromParts = fromParsed.tail.split("\\").filter(Boolean);
  const toParts = toParsed.tail.split("\\").filter(Boolean);
  while (
    fromParts.length &&
    toParts.length &&
    fromParts[0].toLowerCase() === toParts[0].toLowerCase()
  ) {
    fromParts.shift();
    toParts.shift();
  }

  return [...fromParts.map(() => ".."), ...toParts].join("\\") || "";
}

function toNamespacedWin32Path(path) {
  if (typeof path !== "string") return path;
  if (!path) return "";
  const normalized = normalizeWin32Path(path);
  if (normalized.startsWith("\\\\?\\")) return normalized;
  if (/^\\\\[^\\]+\\[^\\]+\\?/.test(normalized)) {
    return `\\\\?\\UNC\\${normalized.slice(2)}`;
  }
  if (/^[a-z]:\\/i.test(normalized)) {
    return `\\\\?\\${normalized}`;
  }
  return path;
}

function matchesWin32Glob(path, pattern) {
  const source = normalizeWin32GlobSlashes(validatePathString(path, "path"));
  const regex = win32GlobToRegExp(normalizeWin32GlobSlashes(validatePathString(pattern, "pattern")));
  return regex.test(source);
}

function win32GlobToRegExp(pattern) {
  return compileGlobToRegExp(pattern, "i");
}

function normalizeWin32GlobSlashes(path) {
  return String(path).replace(/[\\/]/g, "/");
}
