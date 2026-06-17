export function selectVersion(metadata, range = "latest") {
  const versions = Object.keys(metadata.versions ?? {});
  if (!versions.length) throw new Error(`No versions available for ${metadata.name}`);

  const requestedRange = String(range || "latest").trim();
  const taggedVersion = metadata["dist-tags"]?.[requestedRange];
  if (taggedVersion && metadata.versions[taggedVersion]) return taggedVersion;
  if (requestedRange === "latest" || requestedRange === "*") {
    const latest = metadata["dist-tags"]?.latest;
    if (latest && metadata.versions[latest]) return latest;
  }
  if (metadata.versions[requestedRange]) return requestedRange;

  const compatible = versions
    .filter((version) => Boolean(parseVersion(version)))
    .sort(compareVersions)
    .filter((version) => satisfiesRange(version, requestedRange));
  if (compatible.length) return compatible.at(-1);

  throw new Error(`Cannot resolve ${metadata.name}@${range}`);
}

function satisfiesRange(version, range) {
  const normalizedRange = String(range || "*")
    .trim()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([<>=~^])\s+/g, "$1");

  if (!normalizedRange || normalizedRange === "*" || /^[xX]$/.test(normalizedRange)) return true;

  return normalizedRange
    .split(/\s*\|\|\s*/)
    .some((rangePart) => satisfiesRangePart(version, rangePart));
}

function satisfiesRangePart(version, rangePart) {
  const hyphenMatch = rangePart.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (hyphenMatch) {
    return satisfiesComparator(version, ">=", hyphenMatch[1])
      && satisfiesComparator(version, "<=", hyphenMatch[2]);
  }

  return rangePart
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => satisfiesToken(version, token));
}

function satisfiesToken(version, token) {
  if (token === "*" || /^[xX]$/.test(token)) return true;
  if (token.startsWith("^")) return satisfiesCaret(version, token.slice(1));
  if (token.startsWith("~")) return satisfiesTilde(version, token.slice(1));

  const match = token.match(/^(<=|>=|<|>|=)?(.+)$/);
  if (!match) return false;
  const [, comparator = "=", target] = match;
  if (comparator === "=" && isPartialVersion(target)) return satisfiesPartial(version, target);
  return satisfiesComparator(version, comparator, target);
}

function satisfiesComparator(version, comparator, target) {
  const versionParts = parseVersion(version);
  const targetParts = parseVersion(target, { partial: true });
  if (!versionParts || !targetParts) return false;

  const comparison = compareParsedVersions(versionParts, completeVersion(targetParts));
  if (comparator === "<") return comparison < 0;
  if (comparator === "<=") return comparison <= 0;
  if (comparator === ">") return comparison > 0;
  if (comparator === ">=") return comparison >= 0;
  return comparison === 0;
}

function satisfiesPartial(version, target) {
  const versionParts = parseVersion(version);
  const targetParts = parseVersion(target, { partial: true });
  if (!versionParts || !targetParts) return false;
  if (targetParts.major !== null && versionParts.major !== targetParts.major) return false;
  if (targetParts.minor !== null && versionParts.minor !== targetParts.minor) return false;
  if (targetParts.patch !== null && versionParts.patch !== targetParts.patch) return false;
  if (targetParts.prerelease && versionParts.prerelease !== targetParts.prerelease) return false;
  return true;
}

function satisfiesCaret(version, target) {
  const lower = completeVersion(parseVersion(target, { partial: true }));
  if (!lower) return false;

  let upper;
  if (lower.major > 0) upper = { ...lower, major: lower.major + 1, minor: 0, patch: 0, prerelease: "" };
  else if (lower.minor > 0) upper = { ...lower, minor: lower.minor + 1, patch: 0, prerelease: "" };
  else upper = { ...lower, patch: lower.patch + 1, prerelease: "" };

  return compareVersions(version, formatVersion(lower)) >= 0
    && compareVersions(version, formatVersion(upper)) < 0;
}

function satisfiesTilde(version, target) {
  const parsed = parseVersion(target, { partial: true });
  const lower = completeVersion(parsed);
  if (!lower) return false;

  const upper = parsed.minor === null
    ? { ...lower, major: lower.major + 1, minor: 0, patch: 0, prerelease: "" }
    : { ...lower, minor: lower.minor + 1, patch: 0, prerelease: "" };

  return compareVersions(version, formatVersion(lower)) >= 0
    && compareVersions(version, formatVersion(upper)) < 0;
}

function isPartialVersion(version) {
  return /^\s*v?\d+(?:\.(?:\d+|[xX*]))?(?:\.(?:\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?\s*$/.test(String(version || ""));
}

function parseVersion(version, { partial = false } = {}) {
  const value = String(version || "").trim().replace(/^v/, "");
  const match = value.match(/^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  const [, major, minor, patch, prerelease = ""] = match;
  const parsePart = (part, required) => {
    if (part === undefined) return required || !partial ? 0 : null;
    if (part === "x" || part === "X" || part === "*") return partial ? null : 0;
    return Number(part);
  };

  return {
    major: parsePart(major, true),
    minor: parsePart(minor, false),
    patch: parsePart(patch, false),
    prerelease
  };
}

function completeVersion(version) {
  if (!version) return null;
  return {
    major: version.major ?? 0,
    minor: version.minor ?? 0,
    patch: version.patch ?? 0,
    prerelease: version.prerelease ?? ""
  };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ""}`;
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return String(left).localeCompare(String(right));
  return compareParsedVersions(leftParts, rightParts);
}

function compareParsedVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    const delta = left[key] - right[key];
    if (delta) return delta;
  }

  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && !right.prerelease) return 0;
  return comparePrerelease(left.prerelease, right.prerelease);
}

function comparePrerelease(left, right) {
  const leftParts = String(left).split(".");
  const rightParts = String(right).split(".");
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
    if (leftNumber !== null && rightNumber === null) return -1;
    if (leftNumber === null && rightNumber !== null) return 1;
    const comparison = leftPart.localeCompare(rightPart);
    if (comparison) return comparison;
  }
  return 0;
}
