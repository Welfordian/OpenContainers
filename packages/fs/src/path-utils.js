export function normalizePath(input) {
  if (input === undefined || input === null || input === "") return ".";
  const absolute = String(input).startsWith("/");
  const segments = [];

  for (const part of String(input).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!absolute) {
        segments.push("..");
      }
      continue;
    }
    segments.push(part);
  }

  const joined = segments.join("/");
  if (absolute) return `/${joined}`.replace(/\/+$/, "") || "/";
  return joined || ".";
}

export function resolvePath(cwd, input = ".") {
  if (String(input).startsWith("/")) return normalizePath(input);
  return normalizePath(`${cwd || "/"}/${input}`);
}

export function expandHomePath(input = ".", home = "/workspace") {
  const value = String(input);
  if (value === "~") return normalizePath(home);
  if (value.startsWith("~/")) return normalizePath(`${home}/${value.slice(2)}`);
  return value;
}

export function resolveShellPath(cwd, input = ".", home = "/workspace") {
  return resolvePath(cwd, expandHomePath(input, home));
}

export function dirname(input) {
  const normalized = normalizePath(input);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized.startsWith("/") ? "/" : ".";
  return normalized.slice(0, index);
}

export function basename(input) {
  const normalized = normalizePath(input);
  if (normalized === "/") return "";
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function extname(input) {
  const base = basename(input);
  const index = base.lastIndexOf(".");
  if (index <= 0) return "";
  return base.slice(index);
}

export function joinPath(...parts) {
  if (!parts.length) return ".";
  const first = String(parts[0] ?? "");
  const joined = parts.filter((part) => part !== undefined && part !== null && part !== "").join("/");
  return normalizePath(first.startsWith("/") ? joined : joined || ".");
}

export function relativePath(from, to) {
  const fromParts = normalizePath(from).split("/").filter(Boolean);
  const toParts = normalizePath(to).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/");
}

export function isInsidePath(parent, child) {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent.replace(/\/$/, "")}/`);
}
