const LOOPBACK_V4 = "127.0.0.1";
const LOOPBACK_V6 = "::1";

export function createDnsBuiltin() {
  const promises = {
    lookup: (hostname, options) => Promise.resolve(lookupSync(hostname, options)),
    resolve: (hostname, rrtype = "A") => Promise.resolve(resolveSync(hostname, rrtype)),
    resolve4: (hostname) => Promise.resolve(resolveAddressSync(hostname, 4)),
    resolve6: (hostname) => Promise.resolve(resolveAddressSync(hostname, 6)),
    reverse: (ip) => Promise.resolve(reverseSync(ip)),
  };

  return {
    lookup: callbackifyLookup,
    resolve: callbackifyResolve,
    resolve4: callbackifyResolve4,
    resolve6: callbackifyResolve6,
    reverse: callbackifyReverse,
    promises,
    ADDRCONFIG: 32,
    V4MAPPED: 8,
  };
}

function callbackifyLookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  queueMicrotask(() => {
    try {
      const result = lookupSync(hostname, typeof options === "function" ? undefined : options);
      if (Array.isArray(result)) cb(null, result);
      else cb(null, result.address, result.family);
    } catch (error) {
      cb(error);
    }
  });
}

function callbackifyResolve(hostname, rrtype, callback) {
  const cb = typeof rrtype === "function" ? rrtype : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  queueMicrotask(() => {
    try {
      cb(null, resolveSync(hostname, typeof rrtype === "function" ? "A" : rrtype));
    } catch (error) {
      cb(error);
    }
  });
}

function callbackifyResolve4(hostname, callback) {
  callbackifyResolve(hostname, "A", callback);
}

function callbackifyResolve6(hostname, callback) {
  callbackifyResolve(hostname, "AAAA", callback);
}

function callbackifyReverse(ip, callback) {
  if (typeof callback !== "function") throw new TypeError("Callback must be a function");
  queueMicrotask(() => {
    try {
      callback(null, reverseSync(ip));
    } catch (error) {
      callback(error);
    }
  });
}

function lookupSync(hostname, options) {
  const normalized = normalizeHost(hostname);
  const family = normalizeFamily(options);
  const all = Boolean(typeof options === "object" && options?.all);
  const records = localRecords(normalized).filter((record) => !family || record.family === family);
  if (!records.length) throw dnsNotFound(hostname);
  return all ? records.map((record) => ({ ...record })) : { ...records[0] };
}

function resolveSync(hostname, rrtype = "A") {
  const type = String(rrtype || "A").toUpperCase();
  if (type === "A") return resolveAddressSync(hostname, 4);
  if (type === "AAAA") return resolveAddressSync(hostname, 6);
  if (type === "ANY") return localRecords(normalizeHost(hostname)).map((record) => ({
    address: record.address,
    family: record.family,
  }));
  throw Object.assign(new Error(`query ${type} ENODATA ${hostname}`), {
    code: "ENODATA",
    errno: "ENODATA",
    syscall: "query",
    hostname,
  });
}

function resolveAddressSync(hostname, family) {
  const records = localRecords(normalizeHost(hostname)).filter((record) => record.family === family);
  if (!records.length) throw dnsNotFound(hostname);
  return records.map((record) => record.address);
}

function reverseSync(ip) {
  const normalized = normalizeHost(ip);
  if (normalized === LOOPBACK_V4 || normalized === LOOPBACK_V6) return ["localhost"];
  throw dnsNotFound(ip, "getHostByAddr");
}

function localRecords(hostname) {
  if (hostname === "localhost" || hostname === LOOPBACK_V4 || hostname === "0.0.0.0") {
    return [{ address: LOOPBACK_V4, family: 4 }];
  }
  if (hostname === LOOPBACK_V6 || hostname === "[::1]") {
    return [{ address: LOOPBACK_V6, family: 6 }];
  }
  return [];
}

function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase();
}

function normalizeFamily(options) {
  if (typeof options === "number") return options;
  if (typeof options === "object" && options?.family) return Number(options.family);
  return 0;
}

function dnsNotFound(hostname, syscall = "getaddrinfo") {
  return Object.assign(new Error(`${syscall} ENOTFOUND ${hostname}`), {
    code: "ENOTFOUND",
    errno: "ENOTFOUND",
    syscall,
    hostname,
  });
}
