const LOOPBACK_V4 = "127.0.0.1";
const LOOPBACK_V6 = "::1";
const VALID_RESULT_ORDERS = new Set(["ipv4first", "ipv6first", "verbatim"]);
const VALID_RECORD_TYPES = new Set(["A", "AAAA", "ANY", "CAA", "CNAME", "MX", "NAPTR", "NS", "PTR", "SOA", "SRV", "TLSA", "TXT"]);
const DEFAULT_SERVERS = Object.freeze([LOOPBACK_V4]);
const MAX_RESOLVER_TRIES = 2147483647;
const LOOKUP_SERVICE_NAMES = Object.freeze(new Map([
  [22, "ssh"],
  [53, "domain"],
  [80, "http"],
  [443, "https"],
  [8080, "http-alt"]
]));
const RESOLVER_QUERY_METHOD_ORDER = Object.freeze([
  "resolveAny",
  "resolve4",
  "resolve6",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNs",
  "resolveTlsa",
  "resolveTxt",
  "resolveSrv",
  "resolvePtr",
  "resolveNaptr",
  "resolveSoa",
  "reverse",
  "resolve"
]);
const ERROR_CONSTANTS = Object.freeze({
  NODATA: "ENODATA",
  FORMERR: "EFORMERR",
  SERVFAIL: "ESERVFAIL",
  NOTFOUND: "ENOTFOUND",
  NOTIMP: "ENOTIMP",
  REFUSED: "EREFUSED",
  BADQUERY: "EBADQUERY",
  BADNAME: "EBADNAME",
  BADFAMILY: "EBADFAMILY",
  BADRESP: "EBADRESP",
  CONNREFUSED: "ECONNREFUSED",
  TIMEOUT: "ETIMEOUT",
  EOF: "EOF",
  FILE: "EFILE",
  NOMEM: "ENOMEM",
  DESTRUCTION: "EDESTRUCTION",
  BADSTR: "EBADSTR",
  BADFLAGS: "EBADFLAGS",
  NONAME: "ENONAME",
  BADHINTS: "EBADHINTS",
  NOTINITIALIZED: "ENOTINITIALIZED",
  LOADIPHLPAPI: "ELOADIPHLPAPI",
  ADDRGETNETWORKPARAMS: "EADDRGETNETWORKPARAMS",
  CANCELLED: "ECANCELLED",
});

export function createDnsBuiltin() {
  let defaultResultOrder = "verbatim";
  let servers = [...DEFAULT_SERVERS];

  function lookup(hostname, options) {
    validateLookupPromiseArguments(hostname, options);
    return promiseFromSync(() => lookupSync(hostname, options, defaultResultOrder));
  }
  function lookupService(address, port) {
    validateLookupServiceAddress(address);
    validateLookupServicePort(port);
    return Promise.resolve(lookupServiceSync(address, port));
  }
  const resolve = (hostname, rrtype) => {
    validateDnsName(hostname);
    const recordType = validateResolveRecordType(rrtype, { allowUndefined: true });
    return promiseFromSync(() => resolveSync(hostname, recordType));
  };
  const resolve4 = (hostname, options) => {
    validateDnsName(hostname);
    return promiseFromSync(() => resolveAddressSync(hostname, 4, options));
  };
  const resolve6 = (hostname, options) => {
    validateDnsName(hostname);
    return promiseFromSync(() => resolveAddressSync(hostname, 6, options));
  };
  const resolveRecord = (hostname, rrtype) => resolve(hostname, rrtype);
  const reverse = (ip) => {
    validateDnsName(ip);
    return promiseFromSync(() => reverseSync(ip));
  };
  const getServers = () => [...servers];
  function setServers(nextServers) {
    servers = normalizeServers(nextServers);
  }
  function getDefaultResultOrder() {
    return defaultResultOrder;
  }
  function setDefaultResultOrder(order) {
    defaultResultOrder = normalizeResultOrder(order);
  }

  const promises = {
    lookup,
    lookupService,
    Resolver: createPromiseResolverClass(),
    getDefaultResultOrder,
    setDefaultResultOrder,
    setServers,
    ...ERROR_CONSTANTS,
    getServers,
    resolve,
    resolve4,
    resolve6,
    resolveAny: (hostname) => resolve(hostname, "ANY"),
    resolveCaa: (hostname) => resolveRecord(hostname, "CAA"),
    resolveCname: (hostname) => resolveRecord(hostname, "CNAME"),
    resolveMx: (hostname) => resolveRecord(hostname, "MX"),
    resolveNaptr: (hostname) => resolveRecord(hostname, "NAPTR"),
    resolveNs: (hostname) => resolveRecord(hostname, "NS"),
    resolvePtr: (hostname) => resolveRecord(hostname, "PTR"),
    resolveSoa: (hostname) => resolveRecord(hostname, "SOA"),
    resolveSrv: (hostname) => resolveRecord(hostname, "SRV"),
    resolveTlsa: (hostname) => resolveRecord(hostname, "TLSA"),
    resolveTxt: (hostname) => resolveRecord(hostname, "TXT"),
    reverse,
  };

  const builtin = {
    lookup: function lookup(hostname, options, callback) {
      return callbackifyLookup(hostname, options, callback, defaultResultOrder);
    },
    lookupService: callbackifyLookupService,
    Resolver: createCallbackResolverClass(),
    getDefaultResultOrder,
    setDefaultResultOrder,
    setServers,
    ADDRCONFIG: 1024,
    ALL: 256,
    V4MAPPED: 2048,
    ...ERROR_CONSTANTS,
    getServers,
    resolve: callbackifyResolve.bind(undefined),
    resolve4: callbackifyResolve4.bind(undefined),
    resolve6: callbackifyResolve6.bind(undefined),
    resolveAny: (hostname, callback) => callbackifyResolve(hostname, "ANY", callback),
    resolveCaa: (hostname, callback) => callbackifyResolve(hostname, "CAA", callback),
    resolveCname: (hostname, callback) => callbackifyResolve(hostname, "CNAME", callback),
    resolveMx: (hostname, callback) => callbackifyResolve(hostname, "MX", callback),
    resolveNaptr: (hostname, callback) => callbackifyResolve(hostname, "NAPTR", callback),
    resolveNs: (hostname, callback) => callbackifyResolve(hostname, "NS", callback),
    resolvePtr: (hostname, callback) => callbackifyResolve(hostname, "PTR", callback),
    resolveSoa: (hostname, callback) => callbackifyResolve(hostname, "SOA", callback),
    resolveSrv: (hostname, callback) => callbackifyResolve(hostname, "SRV", callback),
    resolveTlsa: (hostname, callback) => callbackifyResolve(hostname, "TLSA", callback),
    resolveTxt: (hostname, callback) => callbackifyResolve(hostname, "TXT", callback),
    reverse: callbackifyReverse.bind(undefined),
  };
  Object.defineProperty(builtin, "promises", {
    configurable: true,
    enumerable: true,
    get() {
      return promises;
    }
  });
  alignDnsFunctionMetadata(builtin, promises);
  return builtin;
}

function alignDnsFunctionMetadata(builtin, promises) {
  const boundResolveNames = {
    resolve: "bound resolve",
    resolve4: "bound queryA",
    resolve6: "bound queryAaaa",
    resolveAny: "bound queryAny",
    resolveCaa: "bound queryCaa",
    resolveCname: "bound queryCname",
    resolveMx: "bound queryMx",
    resolveNaptr: "bound queryNaptr",
    resolveNs: "bound queryNs",
    resolvePtr: "bound queryPtr",
    resolveSoa: "bound querySoa",
    resolveSrv: "bound querySrv",
    resolveTlsa: "bound queryTlsa",
    resolveTxt: "bound queryTxt",
    reverse: "bound getHostByAddr",
    getServers: "bound getServers",
    setServers: "defaultResolverSetServers"
  };
  const resolverResolveNames = {
    resolve: "resolve",
    resolve4: "queryA",
    resolve6: "queryAaaa",
    resolveAny: "queryAny",
    resolveCaa: "queryCaa",
    resolveCname: "queryCname",
    resolveMx: "queryMx",
    resolveNaptr: "queryNaptr",
    resolveNs: "queryNs",
    resolvePtr: "queryPtr",
    resolveSoa: "querySoa",
    resolveSrv: "querySrv",
    resolveTlsa: "queryTlsa",
    resolveTxt: "queryTxt",
    reverse: "getHostByAddr"
  };
  const twoArgResolveLengths = {
    resolve4: 2,
    resolve6: 2,
    resolveAny: 2,
    resolveCaa: 2,
    resolveCname: 2,
    resolveMx: 2,
    resolveNaptr: 2,
    resolveNs: 2,
    resolvePtr: 2,
    resolveSoa: 2,
    resolveSrv: 2,
    resolveTlsa: 2,
    resolveTxt: 2
  };

  setFunctionMetadata(builtin, {
    lookupService: { name: "lookupService", length: 3 },
    ...Object.fromEntries(Object.entries(boundResolveNames).map(([name, functionName]) => [name, { name: functionName }]))
  });
  setFunctionMetadata(builtin, {
    resolve4: { length: 2 },
    resolve6: { length: 2 }
  });
  setFunctionMetadata(builtin.Resolver.prototype, {
    setLocalAddress: { length: 2 },
    ...Object.fromEntries(Object.entries(resolverResolveNames).map(([name, functionName]) => [name, { name: functionName }]))
  });
  setFunctionMetadata(builtin.Resolver.prototype, {
    ...Object.fromEntries(Object.entries(twoArgResolveLengths).map(([name, length]) => [name, { length }]))
  });
  setFunctionMetadata(promises, {
    ...Object.fromEntries(Object.entries(boundResolveNames).map(([name, functionName]) => [name, { name: functionName }]))
  });
  setFunctionMetadata(promises, {
    resolve: { length: 2 },
    reverse: { length: 2 },
    ...Object.fromEntries(Object.entries(twoArgResolveLengths).map(([name, length]) => [name, { length }]))
  });
  setFunctionMetadata(promises.Resolver.prototype, {
    setLocalAddress: { length: 2 },
    ...Object.fromEntries(Object.entries(resolverResolveNames).map(([name, functionName]) => [name, { name: functionName }]))
  });
  setFunctionMetadata(promises.Resolver.prototype, {
    resolve: { length: 2 },
    reverse: { length: 2 },
    ...Object.fromEntries(Object.entries(twoArgResolveLengths).map(([name, length]) => [name, { length }]))
  });
  markResolverQueryMethodsEnumerable(builtin.Resolver.prototype);
  markResolverQueryMethodsEnumerable(promises.Resolver.prototype);
}

function setFunctionMetadata(target, metadata) {
  for (const [name, options] of Object.entries(metadata)) {
    const fn = target[name];
    if (typeof fn === "function") {
      if (options.name !== undefined) {
        Object.defineProperty(fn, "name", {
          configurable: true,
          value: options.name
        });
      }
      if (options.length !== undefined) {
        Object.defineProperty(fn, "length", {
          configurable: true,
          value: options.length
        });
      }
    }
  }
}

function markResolverQueryMethodsEnumerable(prototype) {
  for (const name of RESOLVER_QUERY_METHOD_ORDER) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor) {
      Object.defineProperty(prototype, name, {
        ...descriptor,
        enumerable: true
      });
    }
  }
}

function createCallbackResolverClass() {
  const resolverState = new WeakMap();

  class ResolverBase {
    constructor() {
      validateResolverOptions(arguments[0]);
      resolverState.set(this, createResolverState());
    }

    cancel() {
      return cancelResolverState(resolverState.get(this));
    }

    getServers() {
      return [...resolverState.get(this).servers];
    }

    setServers(servers) {
      resolverState.get(this).servers = normalizeServers(servers);
    }

    setLocalAddress(ipv4, ipv6) {
      validateResolverLocalAddress(ipv4, "ipv4");
      if (ipv6 !== undefined) validateResolverLocalAddress(ipv6, "ipv6");
    }
  }

  class Resolver extends ResolverBase {}

  Object.assign(Resolver.prototype, {
    resolveAny: function resolveAny(hostname, callback) {
      return scheduleResolverCallback(resolverState.get(this), hostname, "queryAny", () => {
        validateDnsName(hostname);
        return resolveSync(hostname, "ANY");
      }, callback);
    },

    resolve4: function resolve4(hostname, options, callback) {
      const cb = typeof options === "function" ? options : callback;
      const operationOptions = typeof options === "function" ? undefined : options;
      if (typeof cb !== "function") throw new TypeError("Callback must be a function");
      validateDnsName(hostname);
      return scheduleResolverCallback(resolverState.get(this), hostname, "queryA", () => {
        return resolveAddressSync(hostname, 4, operationOptions);
      }, cb);
    },

    resolve6: function resolve6(hostname, options, callback) {
      const cb = typeof options === "function" ? options : callback;
      const operationOptions = typeof options === "function" ? undefined : options;
      if (typeof cb !== "function") throw new TypeError("Callback must be a function");
      validateDnsName(hostname);
      return scheduleResolverCallback(resolverState.get(this), hostname, "queryAaaa", () => {
        return resolveAddressSync(hostname, 6, operationOptions);
      }, cb);
    },

    resolveCaa: function resolveCaa(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "CAA", callback);
    },

    resolveCname: function resolveCname(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "CNAME", callback);
    },

    resolveMx: function resolveMx(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "MX", callback);
    },

    resolveNs: function resolveNs(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "NS", callback);
    },

    resolveTlsa: function resolveTlsa(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "TLSA", callback);
    },

    resolveTxt: function resolveTxt(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "TXT", callback);
    },

    resolveSrv: function resolveSrv(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "SRV", callback);
    },

    resolvePtr: function resolvePtr(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "PTR", callback);
    },

    resolveNaptr: function resolveNaptr(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "NAPTR", callback);
    },

    resolveSoa: function resolveSoa(hostname, callback) {
      return scheduleResolverRecordCallback(resolverState.get(this), hostname, "SOA", callback);
    },

    reverse: function reverse(ip, callback) {
      validateReverseAddress(ip);
      return scheduleResolverCallback(resolverState.get(this), ip, "getHostByAddr", () => reverseSync(ip), callback);
    },

    resolve: function resolve(hostname, rrtype, callback) {
      const cb = typeof rrtype === "function" ? rrtype : callback;
      const recordType = typeof rrtype === "function" ? "A" : validateResolveRecordType(rrtype, { allowUndefined: false });
      const syscall = `query${formatRecordType(recordType)}`;
      if (typeof cb !== "function") throw new TypeError("Callback must be a function");
      validateDnsName(hostname);
      return scheduleResolverCallback(resolverState.get(this), hostname, syscall, () => {
        return resolveSync(hostname, recordType);
      }, cb);
    }
  });

  return Resolver;
}

function createPromiseResolverClass() {
  const resolverState = new WeakMap();

  class ResolverBase {
    constructor() {
      validateResolverOptions(arguments[0]);
      resolverState.set(this, createResolverState());
    }

    cancel() {
      return cancelResolverState(resolverState.get(this));
    }

    getServers() {
      return [...resolverState.get(this).servers];
    }

    setServers(servers) {
      resolverState.get(this).servers = normalizeServers(servers);
    }

    setLocalAddress(ipv4, ipv6) {
      validateResolverLocalAddress(ipv4, "ipv4");
      if (ipv6 !== undefined) validateResolverLocalAddress(ipv6, "ipv6");
    }
  }

  class Resolver extends ResolverBase {}

  Object.assign(Resolver.prototype, {
    resolveAny: function resolveAny(hostname) {
      return this.resolve(hostname, "ANY");
    },

    resolve4: function resolve4(hostname, options) {
      validateDnsName(hostname);
      return scheduleResolverPromise(resolverState.get(this), hostname, "queryA", () => resolveAddressSync(hostname, 4, options));
    },

    resolve6: function resolve6(hostname, options) {
      validateDnsName(hostname);
      return scheduleResolverPromise(resolverState.get(this), hostname, "queryAaaa", () => resolveAddressSync(hostname, 6, options));
    },

    resolveCaa: function resolveCaa(hostname) {
      return this.resolve(hostname, "CAA");
    },

    resolveCname: function resolveCname(hostname) {
      return this.resolve(hostname, "CNAME");
    },

    resolveMx: function resolveMx(hostname) {
      return this.resolve(hostname, "MX");
    },

    resolveNs: function resolveNs(hostname) {
      return this.resolve(hostname, "NS");
    },

    resolveTlsa: function resolveTlsa(hostname) {
      return this.resolve(hostname, "TLSA");
    },

    resolveTxt: function resolveTxt(hostname) {
      return this.resolve(hostname, "TXT");
    },

    resolveSrv: function resolveSrv(hostname) {
      return this.resolve(hostname, "SRV");
    },

    resolvePtr: function resolvePtr(hostname) {
      return this.resolve(hostname, "PTR");
    },

    resolveNaptr: function resolveNaptr(hostname) {
      return this.resolve(hostname, "NAPTR");
    },

    resolveSoa: function resolveSoa(hostname) {
      return this.resolve(hostname, "SOA");
    },

    reverse: function reverse(ip) {
      validateDnsName(ip);
      return scheduleResolverPromise(resolverState.get(this), ip, "getHostByAddr", () => reverseSync(ip));
    },

    resolve: function resolve(hostname, rrtype) {
      validateDnsName(hostname);
      const recordType = validateResolveRecordType(rrtype, { allowUndefined: true });
      const syscall = `query${formatRecordType(recordType)}`;
      return scheduleResolverPromise(resolverState.get(this), hostname, syscall, () => resolveSync(hostname, recordType));
    }
  });

  return Resolver;
}

function createResolverState() {
  return {
    servers: [...DEFAULT_SERVERS],
    pending: new Set(),
  };
}

function cancelResolverState(state) {
  for (const pending of [...state.pending]) pending.cancel();
  return undefined;
}

function scheduleResolverRecordCallback(state, hostname, rrtype, callback) {
  const syscall = `query${formatRecordType(rrtype)}`;
  if (typeof callback !== "function") throw new TypeError("Callback must be a function");
  validateDnsName(hostname);
  return scheduleResolverCallback(state, hostname, syscall, () => {
    return resolveSync(hostname, rrtype);
  }, callback);
}

function scheduleResolverCallback(state, hostname, syscall, action, callback) {
  if (typeof callback !== "function") throw new TypeError("Callback must be a function");
  let settled = false;
  const pending = {
    cancel() {
      if (settled) return;
      settled = true;
      state.pending.delete(pending);
      queueMicrotask(() => callback(createDnsCancelError(hostname, syscall)));
    }
  };
  state.pending.add(pending);
  queueMicrotask(() => {
    if (settled) return;
    settled = true;
    state.pending.delete(pending);
    try {
      callback(null, action());
    } catch (error) {
      callback(error);
    }
  });
  return undefined;
}

function scheduleResolverPromise(state, hostname, syscall, action) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const pending = {
      cancel() {
        if (settled) return;
        settled = true;
        state.pending.delete(pending);
        reject(createDnsCancelError(hostname, syscall));
      }
    };
    state.pending.add(pending);
    queueMicrotask(() => {
      if (settled) return;
      settled = true;
      state.pending.delete(pending);
      try {
        resolve(action());
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createDnsCancelError(hostname, syscall) {
  return Object.assign(new Error(`${syscall} ECANCELLED ${hostname}`), {
    code: "ECANCELLED",
    errno: undefined,
    syscall,
    hostname,
  });
}

function callbackifyLookup(hostname, options, callback, defaultResultOrder) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  validateLookupHostname(hostname);
  validateLookupOptions(options);
  queueMicrotask(() => {
    try {
      const result = lookupSync(hostname, typeof options === "function" ? undefined : options, defaultResultOrder);
      if (Array.isArray(result)) cb(null, result);
      else cb(null, result.address, result.family);
    } catch (error) {
      cb(error);
    }
  });
}

function callbackifyLookupService(address, port, callback) {
  if (typeof callback !== "function") throw new TypeError("Callback must be a function");
  validateLookupServiceAddress(address);
  validateLookupServicePort(port);
  queueMicrotask(() => {
    try {
      const result = lookupServiceSync(address, port);
      callback(null, result.hostname, result.service);
    } catch (error) {
      callback(error);
    }
  });
}

function callbackifyResolve(hostname, rrtype, callback) {
  const cb = typeof rrtype === "function" ? rrtype : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  validateDnsName(hostname);
  const recordType = typeof rrtype === "function" ? "A" : validateResolveRecordType(rrtype, { allowUndefined: false });
  queueMicrotask(() => {
    try {
      cb(null, resolveSync(hostname, recordType));
    } catch (error) {
      cb(error);
    }
  });
}

function callbackifyResolve4(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  validateDnsName(hostname);
  queueMicrotask(() => {
    try {
      cb(null, resolveAddressSync(hostname, 4, typeof options === "function" ? undefined : options));
    } catch (error) {
      cb(error);
    }
  });
}

function callbackifyResolve6(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") throw new TypeError("Callback must be a function");
  validateDnsName(hostname);
  queueMicrotask(() => {
    try {
      cb(null, resolveAddressSync(hostname, 6, typeof options === "function" ? undefined : options));
    } catch (error) {
      cb(error);
    }
  });
}

function callbackifyReverse(ip, callback) {
  if (typeof callback !== "function") throw new TypeError("Callback must be a function");
  validateReverseAddress(ip);
  queueMicrotask(() => {
    try {
      callback(null, reverseSync(ip));
    } catch (error) {
      callback(error);
    }
  });
}

function lookupSync(hostname, options, defaultResultOrder = "verbatim") {
  validateLookupHostname(hostname);
  validateLookupOptions(options);
  const normalized = normalizeHost(hostname);
  const family = normalizeFamily(options);
  const all = Boolean(typeof options === "object" && options?.all);
  const literal = literalAddressRecord(normalized);
  if (literal) return all ? [{ ...literal }] : { ...literal };
  const records = orderRecords(localRecords(normalized), options, defaultResultOrder).filter((record) => !family || record.family === family);
  if (!records.length) throw dnsNotFound(hostname);
  return all ? records.map((record) => ({ ...record })) : { ...records[0] };
}

function resolveSync(hostname, rrtype = "A") {
  validateDnsName(hostname);
  const type = validateResolveRecordType(rrtype, { allowUndefined: true });
  if (type === "A") return resolveAddressSync(hostname, 4);
  if (type === "AAAA") return resolveAddressSync(hostname, 6);
  if (type === "ANY") {
    const records = localRecords(normalizeHost(hostname));
    if (!records.length) throw dnsNotFound(hostname, "queryAny");
    return records.map((record) => ({
      address: record.address,
      ttl: 0,
      type: record.family === 4 ? "A" : "AAAA",
      family: record.family,
    }));
  }
  if (type === "PTR") return resolvePtrSync(hostname);
  return resolveUnsupportedSync(hostname, type);
}

function resolveUnsupportedSync(hostname, rrtype) {
  throw createDnsDataError(hostname, rrtype);
}

function createDnsDataError(hostname, rrtype) {
  const type = validateResolveRecordType(rrtype, { allowUndefined: true });
  return Object.assign(new Error(`query${formatRecordType(type)} ENODATA ${hostname}`), {
    code: "ENODATA",
    errno: "ENODATA",
    syscall: `query${formatRecordType(type)}`,
    hostname,
  });
}

function resolveAddressSync(hostname, family, options) {
  const records = localRecords(normalizeHost(hostname)).filter((record) => record.family === family);
  if (!records.length) throw dnsNotFound(hostname, family === 4 ? "queryA" : "queryAAAA");
  if (options?.ttl) {
    return records.map((record) => ({ address: record.address, ttl: 0 }));
  }
  return records.map((record) => record.address);
}

function reverseSync(ip) {
  validateReverseAddress(ip);
  const normalized = normalizeHost(ip);
  if (normalized === LOOPBACK_V4 || normalized === LOOPBACK_V6) return ["localhost"];
  throw dnsNotFound(ip, "getHostByAddr");
}

function resolvePtrSync(hostname) {
  validateDnsName(hostname);
  const normalized = normalizeHost(hostname);
  if (normalized === LOOPBACK_V4 || normalized === LOOPBACK_V6) return ["localhost"];
  throw createDnsDataError(hostname, "PTR");
}

function lookupServiceSync(address, port) {
  validateLookupServiceAddress(address);
  validateLookupServicePort(port);
  const normalized = normalizeHost(address);
  if (normalized !== LOOPBACK_V4 && normalized !== LOOPBACK_V6) throw dnsNotFound(address, "getnameinfo");
  const numericPort = Number(port);
  return { hostname: "localhost", service: LOOKUP_SERVICE_NAMES.get(numericPort) ?? String(numericPort) };
}

function validateLookupServicePort(port) {
  if (port === null || typeof port === "boolean" || (typeof port === "string" && port.trim() === "")) {
    throw Object.assign(new RangeError(`Port should be >= 0 and < 65536. Received ${formatSocketBadPortValue(port)}.`), {
      code: "ERR_SOCKET_BAD_PORT"
    });
  }
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 0 || numericPort > 65535) {
    throw Object.assign(new RangeError(`Port should be >= 0 and < 65536. Received ${formatSocketBadPortValue(port)}.`), {
      code: "ERR_SOCKET_BAD_PORT"
    });
  }
}

function localRecords(hostname) {
  if (hostname === "localhost") {
    return [{ address: LOOPBACK_V6, family: 6 }, { address: LOOPBACK_V4, family: 4 }];
  }
  if (hostname === LOOPBACK_V4 || hostname === "0.0.0.0") {
    return [{ address: LOOPBACK_V4, family: 4 }];
  }
  if (hostname === LOOPBACK_V6 || hostname === "[::1]") {
    return [{ address: LOOPBACK_V6, family: 6 }];
  }
  return [];
}

function literalAddressRecord(hostname) {
  if (!isIpAddressLiteral(hostname)) return null;
  return {
    address: hostname,
    family: hostname.includes(":") ? 6 : 4
  };
}

function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase();
}

function validateLookupHostname(hostname) {
  if (hostname === undefined || hostname === null || hostname === "") {
    throw Object.assign(new TypeError(`The argument 'hostname' must be a non-empty string. Received ${formatValueLiteral(hostname)}`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
  if (typeof hostname !== "string") {
    throw Object.assign(new TypeError(`The "hostname" argument must be of type string. Received ${formatReceivedType(hostname)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
}

function validateDnsName(name) {
  if (typeof name !== "string") {
    throw Object.assign(new TypeError(`The "name" argument must be of type string. Received ${formatReceivedType(name)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
}

function validateResolveRecordType(rrtype, { allowUndefined } = {}) {
  if (rrtype === undefined) {
    if (allowUndefined) return "A";
    throw Object.assign(new TypeError(`The "rrtype" argument must be of type string. Received undefined`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (typeof rrtype !== "string") {
    throw Object.assign(new TypeError(`The "rrtype" argument must be of type string. Received ${formatReceivedType(rrtype)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (!VALID_RECORD_TYPES.has(rrtype)) {
    throw Object.assign(new TypeError(`The argument 'rrtype' is invalid. Received '${rrtype}'`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
  return rrtype;
}

function validateResolverLocalAddress(address, name) {
  if (typeof address !== "string") {
    throw Object.assign(new TypeError(`The "${name}" argument must be of type string. Received ${formatReceivedType(address)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (!isIpAddressLiteral(address)) {
    throw Object.assign(new TypeError("Invalid IP address."), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
}

function validateLookupPromiseArguments(hostname, options) {
  if (!isDeferredLookupHostnameError(hostname)) validateLookupHostname(hostname);
  validateLookupOptions(options);
}

function isDeferredLookupHostnameError(hostname) {
  return hostname === undefined || hostname === null || hostname === "";
}

function promiseFromSync(action) {
  return Promise.resolve().then(action);
}

function formatValueLiteral(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `'${value}'`;
  return String(value);
}

function formatReceivedType(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "number") return `type number (${value})`;
  if (typeof value === "object") return `an instance of ${value?.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

function formatSocketBadPortValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "number") return `type number (${value})`;
  return formatReceivedType(value);
}

function validateLookupServiceAddress(address) {
  if (typeof address !== "string") {
    throw Object.assign(new TypeError(`The argument 'address' is invalid. Received ${address}`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
  if (!isIpAddressLiteral(address)) {
    throw Object.assign(new TypeError(`The argument 'address' is invalid. Received ${JSON.stringify(address)}`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
}

function validateReverseAddress(address) {
  validateDnsName(address);
  if (!isIpAddressLiteral(address)) {
    throw Object.assign(new Error(`getHostByAddr EINVAL ${address}`), {
      code: "EINVAL",
      errno: -22,
      syscall: "getHostByAddr",
      hostname: address,
    });
  }
}

function validateLookupOptions(options) {
  if (options === undefined || options === null || typeof options === "function") return;
  if (typeof options === "number") {
    normalizeFamily(options);
    return;
  }
  if (typeof options !== "object") {
    throw Object.assign(new TypeError(`The "options" argument must be of type object or integer. Received type ${typeof options}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (options.family !== undefined) normalizeFamily(options);
  if (options.all !== undefined && typeof options.all !== "boolean") {
    throw Object.assign(new TypeError(`The "options.all" property must be of type boolean. Received type ${typeof options.all}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (options.verbatim !== undefined && typeof options.verbatim !== "boolean") {
    throw Object.assign(new TypeError(`The "options.verbatim" property must be of type boolean. Received type ${typeof options.verbatim}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (options.hints !== undefined && typeof options.hints !== "number") {
    throw Object.assign(new TypeError(`The "options.hints" property must be of type number. Received type ${typeof options.hints}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (options.order !== undefined && options.order !== null && !VALID_RESULT_ORDERS.has(options.order)) {
    throw Object.assign(new TypeError(`The property 'options.order' must be one of: 'verbatim', 'ipv4first', 'ipv6first'. Received ${JSON.stringify(options.order)}`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
}

function validateResolverOptions(options) {
  if (options === undefined || options === null) return;
  const type = typeof options;
  if (type !== "object" && type !== "function") return;
  validateResolverIntegerOption(options, "timeout", -1, MAX_RESOLVER_TRIES);
  validateResolverIntegerOption(options, "tries", 1, MAX_RESOLVER_TRIES);
}

function validateResolverIntegerOption(options, name, min, max) {
  const descriptor = Object.getOwnPropertyDescriptor(options, name);
  if (!descriptor || !("value" in descriptor) || descriptor.value === undefined) return;
  const { value } = descriptor;
  if (typeof value !== "number") {
    throw Object.assign(new TypeError(`The "options.${name}" property must be of type number. Received ${formatReceivedType(value)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  if (!Number.isInteger(value)) {
    throw Object.assign(new RangeError(`The value of "options.${name}" is out of range. It must be an integer. Received ${formatNumericValue(value)}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
  if (value < min || value > max) {
    throw Object.assign(new RangeError(`The value of "options.${name}" is out of range. It must be >= ${min} && <= ${max}. Received ${formatNumericValue(value)}`), {
      code: "ERR_OUT_OF_RANGE"
    });
  }
}

function formatNumericValue(value) {
  return String(value);
}

function normalizeFamily(options) {
  if (typeof options === "number") {
    if (![0, 4, 6].includes(options)) {
      throw Object.assign(new TypeError(`The argument 'family' must be one of: 0, 4, 6. Received ${options}`), {
        code: "ERR_INVALID_ARG_VALUE"
      });
    }
    return options;
  }
  if (typeof options === "object" && options?.family !== undefined) {
    const family = options.family;
    if (![0, 4, 6].includes(family)) {
      throw Object.assign(new TypeError(`The property 'options.family' must be one of: 0, 4, 6. Received ${family}`), {
        code: "ERR_INVALID_ARG_VALUE"
      });
    }
    return family;
  }
  return 0;
}

function orderRecords(records, options, defaultResultOrder) {
  const order = typeof options === "object" && options?.order != null
    ? normalizeResultOrder(options.order)
    : typeof options === "object" && options?.verbatim === true
      ? "verbatim"
      : typeof options === "object" && options?.verbatim === false
        ? "ipv4first"
      : defaultResultOrder;
  if (order === "ipv6first") return [...records].sort((left, right) => right.family - left.family);
  if (order === "ipv4first") return [...records].sort((left, right) => left.family - right.family);
  return [...records];
}

function normalizeResultOrder(order) {
  const normalized = String(order);
  if (!VALID_RESULT_ORDERS.has(normalized)) {
    throw Object.assign(new TypeError(`Invalid DNS result order: ${order}`), {
      code: "ERR_INVALID_ARG_VALUE"
    });
  }
  return normalized;
}

function formatRecordType(type) {
  return `${type[0] ?? ""}${type.slice(1).toLowerCase()}`;
}

function normalizeServers(servers) {
  if (!Array.isArray(servers)) {
    throw Object.assign(new TypeError(`The "servers" argument must be an instance of Array. Received ${formatReceivedType(servers)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return servers.map((server, index) => normalizeServer(server, index));
}

function normalizeServer(server, index) {
  if (typeof server !== "string") {
    throw Object.assign(new TypeError(`The "servers[${index}]" argument must be of type string. Received ${formatReceivedType(server)}`), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }

  const value = server.trim();
  if (!value) throw invalidIpAddress(server);

  const bracketed = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    const address = normalizeHost(bracketed[1]);
    const port = bracketed[2] === undefined ? undefined : normalizeServerPort(bracketed[2], server);
    if (!isIpAddressLiteral(address) || !address.includes(":")) throw invalidIpAddress(server);
    return port === undefined || port === 53 ? address : `[${address}]:${port}`;
  }

  const ipv4WithPort = value.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
  if (ipv4WithPort) {
    const address = ipv4WithPort[1];
    const port = normalizeServerPort(ipv4WithPort[2], server);
    if (!isIpAddressLiteral(address)) throw invalidIpAddress(server);
    return port === 53 ? address : `${address}:${port}`;
  }

  const normalized = normalizeHost(value);
  if (!isIpAddressLiteral(normalized)) throw invalidIpAddress(server);
  return normalized;
}

function normalizeServerPort(port, rawServer) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw invalidIpAddress(rawServer);
  }
  return numericPort;
}

function invalidIpAddress(value) {
  return Object.assign(new TypeError(`Invalid IP address: ${value}`), {
    code: "ERR_INVALID_IP_ADDRESS"
  });
}

function isIpAddressLiteral(value) {
  const normalized = normalizeHost(value);
  if (normalized === LOOPBACK_V6) return true;
  if (normalized.includes(":")) return isIpv6AddressLiteral(normalized);
  return isIpv4AddressLiteral(normalized);
}

function isIpv4AddressLiteral(value) {
  const parts = String(value).split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const numeric = Number(part);
    return numeric >= 0 && numeric <= 255;
  });
}

function isIpv6AddressLiteral(value) {
  const compressed = value.includes("::");
  const halves = value.split("::");
  if (halves.length > 2) return false;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const groups = compressed ? [...left, ...right] : value.split(":");
  let groupCount = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const part = groups[index];
    if (part.includes(".")) {
      if (index !== groups.length - 1 || !isIpv4AddressLiteral(part)) return false;
      groupCount += 2;
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return false;
      groupCount += 1;
    }
  }
  if (!compressed && groupCount !== 8) return false;
  if (compressed && groupCount >= 8) return false;
  return true;
}

function dnsNotFound(hostname, syscall = "getaddrinfo") {
  return Object.assign(new Error(`${syscall} ENOTFOUND ${hostname}`), {
    code: "ENOTFOUND",
    errno: "ENOTFOUND",
    syscall,
    hostname,
  });
}
