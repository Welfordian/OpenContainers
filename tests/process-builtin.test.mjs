import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";
import { OpenContainersBuffer } from "../packages/runtime-node/src/builtins/buffer.js";

test("process.versions exposes Node-compatible runtime dependency versions", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      console.log(process.version);
      console.log(process.versions.node);
      console.log(process.versions.v8);
      console.log(process.versions.modules);
      console.log(process.versions.napi);
      console.log(process.versions.opencontainers);
      console.log(require('node:process').versions.v8);
      console.log(Object.keys(process.versions).join(","));
      console.log(["uv", "openssl", "zlib", "undici", "sqlite", "zstd"].map((key) => key + ":" + typeof process.versions[key] + ":" + process.versions[key]).join("|"));
      console.log(["node", "uv", "openssl", "opencontainers"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process.versions, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
      }).join("|"));
      console.log(Object.isExtensible(process.versions), Object.isFrozen(process.versions), Object.getPrototypeOf(process.versions) === Object.prototype);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "v26.0.0",
    "26.0.0",
    "14.3.127.18-node.10",
    "144",
    "10",
    "0.1.0",
    "14.3.127.18-node.10",
    "node,acorn,ada,amaro,ares,brotli,cldr,icu,libffi,lief,llhttp,merve,modules,napi,nbytes,ncrypto,nghttp2,nghttp3,ngtcp2,openssl,simdjson,simdutf,sqlite,tz,undici,unicode,uv,uvwasi,v8,zlib,zstd,opencontainers",
    "uv:string:1.51.0|openssl:string:3.0.16|zlib:string:1.3.1|undici:string:7.10.0|sqlite:string:3.49.1|zstd:string:1.5.7",
    "node:true:true:false:string|uv:true:true:false:string|openssl:true:true:false:string|opencontainers:true:true:false:string",
    "true false true"
  ]);
});

test("node:util exposes npm package compatibility helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require('node:util');
      const fn = util.deprecate((value) => value + 1, 'old api');
      function legacyPair(left, right) { return left + right; }
      const pair = util.deprecate(legacyPair, 'old pair', 'DEP_PAIR');
      function Parent() {}
      function Child() {}
      util.inherits(Child, Parent);
      const target = { a: 1 };
      const source = Object.create({ inherited: true });
      source.b = 2;
      Object.defineProperty(source, 'hidden', { value: 3, enumerable: false });
      const extended = util._extend(target, source);
      console.log(fn(1));
      console.log(new Child() instanceof Parent);
      console.log(util.format('value=%d %s', 42, 'ok'));
      console.log(util.types.isRegExp(/x/));
      console.log(util.isArray([]), util.isArray({ length: 0 }));
      console.log(extended === target, JSON.stringify(target));
      console.log(util._extend({ ok: true }, null).ok);
      console.log(typeof new util.promisify(function legacy(value, callback) { callback(null, value); }), Object.hasOwn(util.promisify, 'prototype'));
      console.log(fn.name, fn.length, pair.name, pair.length, pair(2, 3));
      const warnings = [];
      process.on('warning', (warning) => warnings.push(warning.name + ':' + (warning.code ?? '') + ':' + warning.message));
      util.deprecate(function noCode() { return 'warned'; }, 'listener api')();
      util.deprecate(function withCode() { return 'coded'; }, 'listener api code', 'DEP_LISTENER')();
      console.log(warnings.join('|'));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stderr.toString(), /old api/);
  assert.match(result.stderr.toString(), /\[DEP_PAIR\] DeprecationWarning: old pair/);
  assert.match(result.stderr.toString(), /\[DEP0060\] DeprecationWarning: The `util\._extend` API is deprecated\. Please use Object\.assign\(\) instead\./);
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "2",
    "true",
    "value=42 ok",
    "true",
    "true false",
    'true {"a":1,"b":2}',
    "true",
    "function true",
    "deprecated 1 deprecated 2 5",
    "DeprecationWarning::listener api|DeprecationWarning:DEP_LISTENER:listener api code"
  ]);
});

test("node:util exposes additional type predicates used by packages", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require('node:util');
      function args() { return arguments; }
      console.log(util.types.isWeakMap(new WeakMap()));
      console.log(util.types.isWeakSet(new WeakSet()));
      console.log(util.types.isDataView(new DataView(new ArrayBuffer(1))));
      console.log(util.types.isMapIterator(new Map().keys()));
      console.log(util.types.isSetIterator(new Set().keys()));
      console.log(util.types.isArgumentsObject(args()));
      console.log(util.types.isBoxedPrimitive(new String('x')));
      console.log(util.types.isStringObject(new String('x')), util.types.isNumberObject(new Number(1)), util.types.isBooleanObject(new Boolean(false)));
      console.log(util.types.isBigIntObject(Object(1n)), util.types.isSymbolObject(Object(Symbol('x'))));
      console.log(util.types.isInt8Array(new Int8Array()), util.types.isUint8ClampedArray(new Uint8ClampedArray()), util.types.isFloat64Array(new Float64Array()));
      console.log(typeof util.types.isFloat16Array, util.types.isFloat16Array(new Float32Array()));
      console.log(util.types.isBigInt64Array(new BigInt64Array()), util.types.isBigUint64Array(new BigUint64Array()));
      function* generator() { yield 1; }
      console.log(util.types.isGeneratorObject(generator()), util.types.isGeneratorFunction(generator));
      console.log(typeof util.types.isAsyncGeneratorObject, typeof util.types.isAsyncGeneratorFunction);
      console.log(util.types.isPromise(Promise.resolve(1)), util.types.isPromise({ then() {} }));
      console.log(typeof util.types.isProxy, util.types.isProxy({}));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true true true",
    "true true",
    "true true true",
    "function false",
    "true true",
    "true true",
    "undefined undefined",
    "true false",
    "function false"
  ]);
});

test("node:util/types exposes Node-shaped predicate metadata", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const types = require("node:util/types");
      const util = require("node:util");
      const keys = Object.keys(types);
      const descriptorRows = ["isCryptoKey", "isKeyObject"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(types, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, descriptor.value.name, descriptor.value.length].join(":");
      });
      const constructablePredicates = [
        "isDataView",
        "isTypedArray",
        "isUint8Array",
        "isUint8ClampedArray",
        "isUint16Array",
        "isUint32Array",
        "isInt8Array",
        "isInt16Array",
        "isInt32Array",
        "isFloat16Array",
        "isFloat32Array",
        "isFloat64Array",
        "isBigInt64Array",
        "isBigUint64Array"
      ];
      const prototypeRows = constructablePredicates.map((key) => {
        const fn = types[key];
        const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        const instance = new fn();
        return [
          key,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          Object.getOwnPropertyNames(descriptor.value).join(","),
          descriptor.value.constructor === fn,
          instance instanceof fn,
          fn()
        ].join(":");
      });
      console.log(util.types === types);
      console.log(Object.hasOwn(types, "default"));
      console.log(keys.length, keys.join(","));
      console.log(keys.filter((key) => types[key].name === "" && types[key].length === 0).join(","));
      console.log(keys.filter((key) => types[key].name !== "" || types[key].length !== 0).map((key) => [key, types[key].name, types[key].length].join(":")).join(","));
      console.log(descriptorRows.join("|"));
      console.log(prototypeRows.join("|"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "false",
    "43 isArgumentsObject,isArrayBuffer,isAsyncFunction,isBigIntObject,isBooleanObject,isDate,isExternal,isGeneratorFunction,isGeneratorObject,isMap,isMapIterator,isModuleNamespaceObject,isNativeError,isNumberObject,isPromise,isProxy,isRegExp,isSet,isSetIterator,isSharedArrayBuffer,isStringObject,isSymbolObject,isWeakMap,isWeakSet,isAnyArrayBuffer,isBoxedPrimitive,isArrayBufferView,isDataView,isTypedArray,isUint8Array,isUint8ClampedArray,isUint16Array,isUint32Array,isInt8Array,isInt16Array,isInt32Array,isFloat16Array,isFloat32Array,isFloat64Array,isBigInt64Array,isBigUint64Array,isKeyObject,isCryptoKey",
    "isArgumentsObject,isArrayBuffer,isAsyncFunction,isBigIntObject,isBooleanObject,isDate,isExternal,isGeneratorFunction,isGeneratorObject,isMap,isMapIterator,isModuleNamespaceObject,isNativeError,isNumberObject,isPromise,isProxy,isRegExp,isSet,isSetIterator,isSharedArrayBuffer,isStringObject,isSymbolObject,isWeakMap,isWeakSet,isAnyArrayBuffer,isBoxedPrimitive",
    "isArrayBufferView:isView:1,isDataView:isDataView:1,isTypedArray:isTypedArray:1,isUint8Array:isUint8Array:1,isUint8ClampedArray:isUint8ClampedArray:1,isUint16Array:isUint16Array:1,isUint32Array:isUint32Array:1,isInt8Array:isInt8Array:1,isInt16Array:isInt16Array:1,isInt32Array:isInt32Array:1,isFloat16Array:isFloat16Array:1,isFloat32Array:isFloat32Array:1,isFloat64Array:isFloat64Array:1,isBigInt64Array:isBigInt64Array:1,isBigUint64Array:isBigUint64Array:1,isKeyObject:value:1,isCryptoKey:value:1",
    "isCryptoKey:true:false:false:function:value:1|isKeyObject:true:false:false:function:value:1",
    "isDataView:false:false:true:constructor:true:true:false|isTypedArray:false:false:true:constructor:true:true:false|isUint8Array:false:false:true:constructor:true:true:false|isUint8ClampedArray:false:false:true:constructor:true:true:false|isUint16Array:false:false:true:constructor:true:true:false|isUint32Array:false:false:true:constructor:true:true:false|isInt8Array:false:false:true:constructor:true:true:false|isInt16Array:false:false:true:constructor:true:true:false|isInt32Array:false:false:true:constructor:true:true:false|isFloat16Array:false:false:true:constructor:true:true:false|isFloat32Array:false:false:true:constructor:true:true:false|isFloat64Array:false:false:true:constructor:true:true:false|isBigInt64Array:false:false:true:constructor:true:true:false|isBigUint64Array:false:false:true:constructor:true:true:false"
  ]);
});

test("node:util/types uses brand checks for spoof-resistant package probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { types } = require("node:util");

      const detachedPrototypeValues = {
        arrayBuffer: new ArrayBuffer(4),
        dataView: new DataView(new ArrayBuffer(1)),
        date: new Date(),
        map: new Map(),
        set: new Set(),
        weakMap: new WeakMap(),
        weakSet: new WeakSet(),
        regExp: /probe/,
        stringObject: new String("x"),
        numberObject: new Number(1),
        booleanObject: new Boolean(false),
        bigIntObject: Object(1n),
        symbolObject: Object(Symbol("x"))
      };
      for (const value of Object.values(detachedPrototypeValues)) {
        Object.setPrototypeOf(value, null);
      }

      const fake = (tag) => ({ [Symbol.toStringTag]: tag });
      async function asyncFunction() {}
      function* generatorFunction() {}
      const fakeAsyncFunction = { constructor: { name: "AsyncFunction" } };
      const fakeGeneratorFunction = { constructor: { name: "GeneratorFunction" } };
      console.log([
        types.isArrayBuffer(detachedPrototypeValues.arrayBuffer),
        types.isAnyArrayBuffer(detachedPrototypeValues.arrayBuffer),
        types.isDataView(detachedPrototypeValues.dataView),
        types.isDate(detachedPrototypeValues.date),
        types.isMap(detachedPrototypeValues.map),
        types.isSet(detachedPrototypeValues.set),
        types.isWeakMap(detachedPrototypeValues.weakMap),
        types.isWeakSet(detachedPrototypeValues.weakSet),
        types.isRegExp(detachedPrototypeValues.regExp)
      ].join(" "));
      console.log([
        types.isStringObject(detachedPrototypeValues.stringObject),
        types.isNumberObject(detachedPrototypeValues.numberObject),
        types.isBooleanObject(detachedPrototypeValues.booleanObject),
        types.isBigIntObject(detachedPrototypeValues.bigIntObject),
        types.isSymbolObject(detachedPrototypeValues.symbolObject),
        types.isBoxedPrimitive(detachedPrototypeValues.symbolObject)
      ].join(" "));
      console.log([
        types.isStringObject("x"),
        types.isNumberObject(1),
        types.isBooleanObject(false),
        types.isBigIntObject(1n),
        types.isSymbolObject(Symbol("x")),
        types.isBoxedPrimitive("x")
      ].join(" "));
      console.log([
        types.isArrayBuffer(fake("ArrayBuffer")),
        types.isDataView(fake("DataView")),
        types.isDate(fake("Date")),
        types.isMap(fake("Map")),
        types.isSet(fake("Set")),
        types.isWeakMap(fake("WeakMap")),
        types.isWeakSet(fake("WeakSet")),
        types.isRegExp(fake("RegExp")),
        types.isPromise(fake("Promise")),
        types.isModuleNamespaceObject(fake("Module"))
      ].join(" "));
      console.log([
        types.isAsyncFunction(asyncFunction),
        types.isAsyncFunction(fakeAsyncFunction),
        types.isGeneratorFunction(generatorFunction),
        types.isGeneratorFunction(fakeGeneratorFunction),
        typeof DOMException === "function" && types.isNativeError(new DOMException("probe"))
      ].join(" "));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true true true true true true true true",
    "true true true true true true",
    "false false false false false false",
    "false false false false false false false false false false",
    "true false true false true"
  ]);
});

test("node:util.inspect handles custom formatters and common containers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require("node:util");
      const custom = {
        [util.inspect.custom](depth, options, inspect) {
          return "custom:" + depth + ":" + typeof inspect;
        }
      };
      const circular = { name: "root" };
      circular.self = circular;
      const symbolKey = Symbol("sym");
      const hiddenObject = { b: 2, a: 1, [symbolKey]: 4 };
      Object.defineProperty(hiddenObject, "hidden", { value: 3, enumerable: false });
      let getterCount = 0;
      const getterObject = {};
      Object.defineProperty(getterObject, "x", {
        enumerable: true,
        get() {
          getterCount++;
          return 42;
        }
      });
      const setterObject = {};
      Object.defineProperty(setterObject, "s", {
        enumerable: true,
        set(value) {}
      });
      const getterSetterObject = {};
      Object.defineProperty(getterSetterObject, "b", {
        enumerable: true,
        get() {
          getterCount++;
          return "both";
        },
        set(value) {}
      });

      console.log(util.inspect(custom));
      console.log(util.inspect(new Map([["a", new Set([1, 2])]])));
      console.log(util.inspect(new Uint8Array([1, 2, 3])));
      console.log(util.inspect(circular));
      console.log(util.inspect(["x", 1]));
      console.log(util.inspect("x"));
      console.log(Object.keys(util.inspect.defaultOptions).join(","));
      console.log(JSON.stringify(util.inspect.defaultOptions));
      const defaultDescriptor = Object.getOwnPropertyDescriptor(util.inspect, "defaultOptions");
      const defaultOptions = util.inspect.defaultOptions;
      const depthDescriptor = Object.getOwnPropertyDescriptor(defaultOptions, "depth");
      const previousDefaultMaxArrayLength = defaultOptions.maxArrayLength;
      console.log("default descriptor", defaultDescriptor.enumerable, defaultDescriptor.configurable, typeof defaultDescriptor.get, defaultDescriptor.get.length, typeof defaultDescriptor.set, defaultDescriptor.set.length);
      console.log("default sealed", defaultOptions === util.inspect.defaultOptions, Object.isExtensible(defaultOptions), Object.isSealed(defaultOptions), depthDescriptor.enumerable, depthDescriptor.configurable, depthDescriptor.writable);
      util.inspect.defaultOptions = { maxArrayLength: 1 };
      console.log("default setter", defaultOptions === util.inspect.defaultOptions, util.inspect([1, 2, 3]));
      util.inspect.defaultOptions = { maxArrayLength: previousDefaultMaxArrayLength };
      const invalidDefaults = [null, 1].map((value) => {
        try {
          util.inspect.defaultOptions = value;
          return "ok";
        } catch (error) {
          return \`\${error.name}:\${error.code}\`;
        }
      }).join(",");
      let unknownDefaultError;
      try {
        util.inspect.defaultOptions = { __opencontainersUnknown: true };
      } catch (error) {
        unknownDefaultError = \`\${error.name}:\${error.code}:\${Object.hasOwn(defaultOptions, "__opencontainersUnknown")}\`;
      }
      console.log("default invalid", invalidDefaults, unknownDefaultError);
      console.log(util.inspect(hiddenObject));
      console.log(util.inspect(hiddenObject, { showHidden: true }));
      console.log(util.inspect(hiddenObject, { sorted: true }));
      console.log(util.inspect(getterObject), getterCount);
      console.log(util.inspect(getterObject, { getters: true }), getterCount);
      console.log(util.inspect(getterObject, { getters: "set" }), getterCount);
      console.log(util.inspect(setterObject), getterCount);
      console.log(util.inspect(getterSetterObject), getterCount);
      console.log(util.inspect(getterSetterObject, { getters: "get" }), getterCount);
      console.log(util.inspect(getterSetterObject, { getters: "set" }), getterCount);
      console.log(util.inspect([1, 2, 3, 4, 5], { maxArrayLength: 3 }));
      console.log(util.inspect(new Uint8Array([1, 2, 3]), { maxArrayLength: 2 }));
      console.log(util.inspect("abcdef", { maxStringLength: 5 }));
      console.log(util.inspect({ n: 1234567, bi: 1234567890123n }, { numericSeparator: true }));
      console.log(util.inspect(new Map([["b", 1], ["a", 2]]), { sorted: true }));
      console.log(util.inspect(new Set(["b", "a"]), { sorted: true }));
      const previousMaxArrayLength = util.inspect.defaultOptions.maxArrayLength;
      util.inspect.defaultOptions.maxArrayLength = 1;
      console.log(util.inspect([1, 2, 3]));
      util.inspect.defaultOptions.maxArrayLength = previousMaxArrayLength;
      const formatHidden = { visible: 1 };
      Object.defineProperty(formatHidden, "hidden", { value: 2, enumerable: false });
      const formatCircular = { name: "root" };
      formatCircular.self = formatCircular;
      const formatNested = { a: { b: { c: { d: { e: 1 } } } } };
      const formatRows = [
        ["d-float", () => util.format("%d", 1.5)],
        ["d-negzero", () => util.format("%d", -0)],
        ["d-trailing", () => util.format("%d", "1.5x")],
        ["d-bigint", () => util.format("%d", 12n)],
        ["d-symbol", () => util.format("%d", Symbol("x"))],
        ["i-float", () => util.format("%i", 1.5)],
        ["i-trailing", () => util.format("%i", "1.5x")],
        ["i-bigint", () => util.format("%i", 12n)],
        ["i-symbol", () => util.format("%i", Symbol("x"))],
        ["f-trailing", () => util.format("%f", "1.5x")],
        ["f-bigint", () => util.format("%f", 12n)],
        ["f-symbol", () => util.format("%f", Symbol("x"))],
        ["j-circular", () => util.format("%j", circular)],
        ["j-bigint", () => util.format("%j", 12n)],
        ["j-symbol", () => util.format("%j", Symbol("x"))],
        ["o-circular", () => util.format("%o", formatCircular)],
        ["O-circular", () => util.format("%O", formatCircular)],
        ["o-hidden", () => util.format("%o", formatHidden)],
        ["O-hidden", () => util.format("%O", formatHidden)],
        ["with-o-hidden", () => util.formatWithOptions({ showHidden: false }, "%o", formatHidden)],
        ["with-O-hidden", () => util.formatWithOptions({ showHidden: true }, "%O", formatHidden)],
        ["O-deep", () => util.format("%O", formatNested)],
        ["with-depth-O-deep", () => util.formatWithOptions({ depth: 1 }, "%O", formatNested)],
        ["o-deep-leaf", () => util.format("%o", formatNested).includes("e: 1")],
        ["s-bigint", () => util.format("%s", 12n)],
        ["s-symbol", () => util.format("%s", Symbol("x"))],
        ["s-object", () => util.format("%s", { a: 1 })],
        ["s-negzero", () => util.format("%s", -0)]
      ].map(([label, action]) => {
        try {
          return label + ":" + JSON.stringify(action());
        } catch (error) {
          return label + ":THROW:" + error.name + ":" + error.message;
        }
      }).join("|");
      console.log("format token rows", formatRows);
      console.log(util.format("hello", "x", { ok: true }));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "custom:2:function",
    "Map(1) { 'a' => Set(2) { 1, 2 } }",
    "Uint8Array(3) [ 1, 2, 3 ]",
    "<ref *1> { name: 'root', self: [Circular *1] }",
    "[ 'x', 1 ]",
    "'x'",
    "showHidden,depth,colors,customInspect,showProxy,maxArrayLength,maxStringLength,breakLength,compact,sorted,getters,numericSeparator",
    "{\"showHidden\":false,\"depth\":2,\"colors\":false,\"customInspect\":true,\"showProxy\":false,\"maxArrayLength\":100,\"maxStringLength\":10000,\"breakLength\":80,\"compact\":3,\"sorted\":false,\"getters\":false,\"numericSeparator\":false}",
    "default descriptor false false function 0 function 1",
    "default sealed true false true true false true",
    "default setter true [ 1, ... 2 more items ]",
    "default invalid TypeError:ERR_INVALID_ARG_TYPE,TypeError:ERR_INVALID_ARG_TYPE TypeError:undefined:false",
    "{ b: 2, a: 1, Symbol(sym): 4 }",
    "{ b: 2, a: 1, [hidden]: 3, Symbol(sym): 4 }",
    "{ Symbol(sym): 4, a: 1, b: 2 }",
    "{ x: [Getter] } 0",
    "{ x: [Getter: 42] } 1",
    "{ x: [Getter] } 1",
    "{ s: [Setter] } 1",
    "{ b: [Getter/Setter] } 1",
    "{ b: [Getter/Setter] } 1",
    "{ b: [Getter/Setter: 'both'] } 2",
    "[ 1, 2, 3, ... 2 more items ]",
    "Uint8Array(3) [ 1, 2, ... 1 more item ]",
    "'abcde'... 1 more character",
    "{ n: 1_234_567, bi: 1_234_567_890_123n }",
    "Map(2) { 'a' => 2, 'b' => 1 }",
    "Set(2) { 'a', 'b' }",
    "[ 1, ... 2 more items ]",
    "format token rows d-float:\"1.5\"|d-negzero:\"-0\"|d-trailing:\"NaN\"|d-bigint:\"12n\"|d-symbol:\"NaN\"|i-float:\"1\"|i-trailing:\"1\"|i-bigint:\"12n\"|i-symbol:\"NaN\"|f-trailing:\"1.5\"|f-bigint:\"12\"|f-symbol:\"NaN\"|j-circular:\"[Circular]\"|j-bigint:THROW:TypeError:Do not know how to serialize a BigInt|j-symbol:\"undefined\"|o-circular:\"<ref *1> { name: 'root', self: [Circular *1] }\"|O-circular:\"<ref *1> { name: 'root', self: [Circular *1] }\"|o-hidden:\"{ visible: 1, [hidden]: 2 }\"|O-hidden:\"{ visible: 1 }\"|with-o-hidden:\"{ visible: 1, [hidden]: 2 }\"|with-O-hidden:\"{ visible: 1, [hidden]: 2 }\"|O-deep:\"{ a: { b: { c: [Object] } } }\"|with-depth-O-deep:\"{ a: { b: [Object] } }\"|o-deep-leaf:true|s-bigint:\"12n\"|s-symbol:\"Symbol(x)\"|s-object:\"{ a: 1 }\"|s-negzero:\"-0\"",
    "hello x { ok: true }"
  ]);
});

test("node:util exposes color formatting, styleText, and NODE_DEBUG debuglog", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require("node:util");
      const debug = util.debuglog("opencontainers");
      const callbackRows = [];
      const callbackReturn = util.debuglog("opencontainers", (callbackDebug) => {
        callbackRows.push(callbackDebug.name + ":" + callbackDebug.enabled + ":" + (callbackDebug === callbackReturn));
        callbackDebug("callback=%d", 9);
      });
      const disabledReturn = util.debuglog("disabled", (callbackDebug) => {
        callbackRows.push(callbackDebug.name + ":" + callbackDebug.enabled + ":" + (callbackDebug === disabledReturn));
        callbackDebug("hidden");
      });
      const debugDescriptor = Object.getOwnPropertyDescriptor(debug, "enabled");

      console.log(util.stripVTControlCharacters(util.formatWithOptions({ colors: true }, "%O", { a: 1 })));
      console.log(util.formatWithOptions({ colors: true }, "%O", { a: 1 }).includes("\\u001b[33m1\\u001b[39m"));
      console.log(util.stripVTControlCharacters(util.styleText(["bold", "red"], "alert", { validateStream: false })));
      console.log(util.styleText(["bold", "red"], "alert", { validateStream: false }).startsWith("\\u001b[1m\\u001b[31m"));
      const styleRows = ["blink", "doubleunderline", "framed", "overlined", "redBright", "bgGray", "bgWhiteBright", "whiteBright", "bgRedBright"].map((style) => {
        const styled = util.styleText(style, "x", { validateStream: false });
        return [style, JSON.stringify(styled), util.inspect.colors[style].join(",")].join(":");
      }).join("|");
      const colorKeys = Object.keys(util.inspect.colors).join(",");
      const aliasRows = ["grey", "blackBright", "bgGrey", "bgBlackBright", "faint", "crossedout", "strikeThrough", "crossedOut", "conceal", "swapColors", "swapcolors", "doubleUnderline"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(util.inspect.colors, name);
        return [name, descriptor.enumerable, descriptor.configurable, typeof descriptor.get, descriptor.get.name, descriptor.get.length, typeof descriptor.set, descriptor.set.name, descriptor.set.length, util.inspect.colors[name].join(",")].join(":");
      }).join("|");
      console.log("style rows", styleRows);
      console.log("color keys", colorKeys);
      console.log("color aliases", aliasRows);
      console.log(debug.enabled);
      console.log(debug.name, debug.length, debugDescriptor.enumerable, debugDescriptor.configurable, typeof debugDescriptor.get, typeof debugDescriptor.set);
      console.log(util.debug === util.debuglog);
      console.log(JSON.stringify(util.diff("ab", "ac")));
      console.log(JSON.stringify(util.diff("same", "same")));
      const callSites = util.getCallSites();
      const firstCallSite = callSites[0];
      console.log(Array.isArray(callSites), callSites.length > 0);
      console.log(typeof firstCallSite.functionName, typeof firstCallSite.scriptName, Number.isInteger(firstCallSite.lineNumber), Number.isInteger(firstCallSite.columnNumber));
      console.log(Object.prototype.hasOwnProperty.call(util.getCallSites({ sourceMap: true })[0], "sourceMap"));
      console.log(util.setTraceSigInt(false));
      debug("value=%d %s", 42, "ok");
      queueMicrotask(() => console.log(callbackRows.join("|")));
    `
  ], { cwd: "/workspace", env: { NODE_DEBUG: "opencontainers" } });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stderr.toString(), /OPENCONTAINERS \d+: value=42 ok/);
  assert.match(result.stderr.toString(), /OPENCONTAINERS \d+: callback=9/);
  assert.doesNotMatch(result.stderr.toString(), /hidden/);
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "{ a: 1 }",
    "true",
    "alert",
    "true",
    "style rows blink:\"\\u001b[5mx\\u001b[25m\":5,25|doubleunderline:\"\\u001b[21mx\\u001b[24m\":21,24|framed:\"\\u001b[51mx\\u001b[54m\":51,54|overlined:\"\\u001b[53mx\\u001b[55m\":53,55|redBright:\"\\u001b[91mx\\u001b[39m\":91,39|bgGray:\"\\u001b[100mx\\u001b[49m\":100,49|bgWhiteBright:\"\\u001b[107mx\\u001b[49m\":107,49|whiteBright:\"\\u001b[97mx\\u001b[39m\":97,39|bgRedBright:\"\\u001b[101mx\\u001b[49m\":101,49",
    "color keys reset,bold,dim,italic,underline,blink,inverse,hidden,strikethrough,doubleunderline,black,red,green,yellow,blue,magenta,cyan,white,bgBlack,bgRed,bgGreen,bgYellow,bgBlue,bgMagenta,bgCyan,bgWhite,framed,overlined,gray,redBright,greenBright,yellowBright,blueBright,magentaBright,cyanBright,whiteBright,bgGray,bgRedBright,bgGreenBright,bgYellowBright,bgBlueBright,bgMagentaBright,bgCyanBright,bgWhiteBright",
    "color aliases grey:false:true:function:get:0:function:set:1:90,39|blackBright:false:true:function:get:0:function:set:1:90,39|bgGrey:false:true:function:get:0:function:set:1:100,49|bgBlackBright:false:true:function:get:0:function:set:1:100,49|faint:false:true:function:get:0:function:set:1:2,22|crossedout:false:true:function:get:0:function:set:1:9,29|strikeThrough:false:true:function:get:0:function:set:1:9,29|crossedOut:false:true:function:get:0:function:set:1:9,29|conceal:false:true:function:get:0:function:set:1:8,28|swapColors:false:true:function:get:0:function:set:1:7,27|swapcolors:false:true:function:get:0:function:set:1:7,27|doubleUnderline:false:true:function:get:0:function:set:1:21,24",
    "true",
    "logger 0 true true function undefined",
    "true",
    "[[0,\"a\"],[1,\"b\"],[-1,\"c\"]]",
    "[]",
    "true true",
    "string string true true",
    "true",
    "undefined",
    "debug:true:false|noop:false:false"
  ]);
});

test("node:util exposes argument parsing and terminal string helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require("node:util");
      const parsed = util.parseArgs({
        args: ["--color", "--name=Josh", "-vv", "file.txt"],
        options: {
          color: { type: "boolean" },
          name: { type: "string" },
          verbose: { type: "boolean", short: "v", multiple: true }
        },
        allowPositionals: true,
        tokens: true
      });

      console.log(parsed.values.color, parsed.values.name, parsed.values.verbose.length);
      console.log(parsed.positionals.join(","));
      console.log(parsed.tokens.map(token => token.kind).join(","));
      const looseUnknown = util.parseArgs({ args: ["--flag", "--name=Josh", "-abc"], strict: false, tokens: true });
      console.log(JSON.stringify(looseUnknown.values), looseUnknown.tokens.map(token => token.index + ":" + token.rawName + ":" + (token.value ?? "")).join("|"));
      console.log(Object.hasOwn(util.parseArgs({ options: { flag: { type: "boolean" } } }).values, "flag"));
      const loosePositional = util.parseArgs({ args: ["file"], options: {}, strict: false, tokens: true });
      console.log(JSON.stringify(loosePositional));
      const terminator = util.parseArgs({
        args: ["--flag", "--", "--pos"],
        options: { flag: { type: "boolean" } },
        allowPositionals: true,
        tokens: true
      });
      console.log(JSON.stringify(terminator));
      for (const config of [
        { args: ["file"], options: {} },
        { args: ["file"], options: {}, allowPositionals: false },
        { args: ["file"], options: {}, strict: false, allowPositionals: false },
        { args: ["--flag", "--", "--pos"], options: { flag: { type: "boolean" } }, tokens: true },
        { args: ["--flag=true"], options: { flag: { type: "boolean" } } },
        { args: ["--name", "--flag"], options: { name: { type: "string" }, flag: { type: "boolean" } } },
        { args: ["--name"], options: { name: { type: "string" } } },
        { options: { flag: { type: "boolean", short: "ff" } } },
        { options: { flag: { type: "boolean", short: 1 } } },
        { options: { flag: { short: "f" } } },
        { options: { flag: { type: "boolean", multiple: "yes" } } }
      ]) {
        try {
          util.parseArgs(config);
        } catch (error) {
          console.log(error.code);
        }
      }
      console.log(util.stripVTControlCharacters("\\u001b[31mred\\u001b[0m"));
      console.log(util.toUSVString("bad\\uD800surrogate"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true Josh 2",
    "file.txt",
    "option,option,option,option,positional",
    "{\"flag\":true,\"name\":\"Josh\",\"a\":true,\"b\":true,\"c\":true} 0:--flag:|1:--name:Josh|2:-a:|2:-b:|2:-c:",
    "false",
    "{\"values\":{},\"positionals\":[\"file\"],\"tokens\":[{\"kind\":\"positional\",\"index\":0,\"value\":\"file\"}]}",
    "{\"values\":{\"flag\":true},\"positionals\":[\"--pos\"],\"tokens\":[{\"kind\":\"option\",\"name\":\"flag\",\"rawName\":\"--flag\",\"index\":0},{\"kind\":\"option-terminator\",\"index\":1},{\"kind\":\"positional\",\"index\":2,\"value\":\"--pos\"}]}",
    "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
    "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
    "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
    "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
    "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
    "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
    "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "red",
    "bad�surrogate"
  ]);
});

test("node:util exposes system error, abort, and deep equality helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import util from "node:util";
    const controller = util.transferableAbortController();
    const aborted = util.aborted(controller.signal, {}).then((event) => "aborted:" + event.type + ":" + event.constructor.name);
    const abortedValidationRows = [];
    const invalidAlreadyAborted = new AbortController();
    invalidAlreadyAborted.abort("done");
    for (const [label, action] of [
      ["missing", () => util.aborted()],
      ["null-signal", () => util.aborted(null, {})],
      ["object-signal", () => util.aborted({}, {})],
      ["controller-signal", () => util.aborted(new AbortController(), {})],
      ["missing-resource", () => util.aborted(new AbortController().signal)],
      ["null-resource", () => util.aborted(new AbortController().signal, null)],
      ["number-resource", () => util.aborted(new AbortController().signal, 1)],
      ["string-resource", () => util.aborted(new AbortController().signal, "x")],
      ["symbol-resource", () => util.aborted(new AbortController().signal, Symbol("x"))],
      ["already-aborted-string-resource", () => util.aborted(invalidAlreadyAborted.signal, "x")]
    ]) {
      try {
        const promise = action();
        const row = await promise.then(
          () => label + ":resolved",
          (error) => [label, promise.constructor.name, error.name, error.code, error.message].join(":")
        );
        abortedValidationRows.push(row);
      } catch (error) {
        abortedValidationRows.push([label, "throw", error.name, error.code, error.message].join(":"));
      }
    }
    const alreadyAborted = new AbortController();
    alreadyAborted.abort("done");

    controller.abort("done");

    console.log(util.isDeepStrictEqual({ a: [1] }, { a: [1] }));
    console.log(util.getSystemErrorName(-2), util.getSystemErrorMessage(-2));
    console.log(util.getSystemErrorMap().get(-98).join(":"));
    for (const value of ["x", true, 0, 1, 1.5, NaN, Infinity]) {
      try {
        util.getSystemErrorName(value);
      } catch (error) {
        console.log(error.name, error.code);
      }
    }
    console.log(util.getSystemErrorName(-99999), util.getSystemErrorMessage(-99999));
    console.log(util.convertProcessSignalToExitCode("SIGINT"), util.convertProcessSignalToExitCode("SIGTERM"));
    console.log(["aborted", "format", "inspect", "isDeepStrictEqual", "styleText", "setTraceSigInt", "_errnoException", "_exceptionWithHostPort", "_extend", "isArray"].map((name) => name + ":" + util[name].name + ":" + util[name].length).join("|"));
    console.log("util keys:", Object.keys(util).join(","));
    const abortedDescriptor = Object.getOwnPropertyDescriptor(util, "aborted");
    console.log("aborted descriptor:", abortedDescriptor.enumerable, abortedDescriptor.configurable, typeof abortedDescriptor.get, abortedDescriptor.get.name, abortedDescriptor.get.length, typeof abortedDescriptor.set, util.aborted === util.aborted, Object.hasOwn(util.aborted, "prototype"));
    console.log("aborted async:", util.aborted.constructor.name, Object.prototype.toString.call(util.aborted), util.types.isAsyncFunction(util.aborted));
    console.log("aborted validation:", abortedValidationRows.join("|"));
    console.log("aborted already:", await util.aborted(alreadyAborted.signal, {}));
    const prototypeRows = ["_errnoException", "_exceptionWithHostPort", "_extend", "callbackify", "debug", "debuglog", "deprecate", "styleText", "formatWithOptions", "getSystemErrorMap", "getSystemErrorName", "getSystemErrorMessage", "inherits", "isArray", "promisify", "setTraceSigInt"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(util[name], "prototype");
      return name + ":" + [descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
    }).join("|");
    console.log("util prototypes:", prototypeRows);
    console.log("util no prototypes:", ["aborted", "isDeepStrictEqual", "toUSVString", "parseArgs"].map((name) => name + ":" + Object.hasOwn(util[name], "prototype")).join("|"));
    console.log("debug identity:", util.debug === util.debuglog);
    const abortHelperDescriptors = ["transferableAbortController", "transferableAbortSignal"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(util, name);
      const value = util[name];
      return [name, descriptor.enumerable, descriptor.configurable, typeof descriptor.get, descriptor.get.name, typeof descriptor.set, value.name, value.length, Object.hasOwn(value, "prototype")].join(":");
    });
    console.log("abort helper descriptors:", abortHelperDescriptors.join("|"));
    const parsedEnv = util.parseEnv('export A=1\\nB = "two words" # comment\\nC=three#ignored\\nBAD');
    console.log(parsedEnv.A, parsedEnv.B, parsedEnv.C, Object.getPrototypeOf(parsedEnv) === null);
    const errno = util._errnoException(-2, "open", "file.txt");
    const hostPort = util._exceptionWithHostPort(-98, "listen", "127.0.0.1", 3000, "local");
    console.log(errno.code, errno.errno, errno.syscall, errno.message);
    console.log(hostPort.code, hostPort.address, hostPort.port, hostPort.message.includes("127.0.0.1:3000"));
    console.log(await aborted, util.transferableAbortSignal(controller.signal) === controller.signal);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "ENOENT no such file or directory",
    "EADDRINUSE:address already in use",
    "TypeError ERR_INVALID_ARG_TYPE",
    "TypeError ERR_INVALID_ARG_TYPE",
    "RangeError ERR_OUT_OF_RANGE",
    "RangeError ERR_OUT_OF_RANGE",
    "RangeError ERR_OUT_OF_RANGE",
    "RangeError ERR_OUT_OF_RANGE",
    "RangeError ERR_OUT_OF_RANGE",
    "Unknown system error -99999 Unknown system error -99999",
    "130 143",
    "aborted:aborted:2|format:format:0|inspect:inspect:2|isDeepStrictEqual:isDeepStrictEqual:3|styleText:styleText:3|setTraceSigInt:setTraceSigInt:1|_errnoException:_errnoException:0|_exceptionWithHostPort:_exceptionWithHostPort:0|_extend:deprecated:2|isArray:deprecated:1",
    "util keys: _errnoException,_exceptionWithHostPort,_extend,callbackify,convertProcessSignalToExitCode,debug,debuglog,deprecate,format,styleText,formatWithOptions,getCallSites,getSystemErrorMap,getSystemErrorName,getSystemErrorMessage,inherits,inspect,isArray,isDeepStrictEqual,promisify,stripVTControlCharacters,toUSVString,transferableAbortSignal,transferableAbortController,aborted,types,parseEnv,parseArgs,TextDecoder,TextEncoder,MIMEType,MIMEParams,diff,setTraceSigInt",
    "aborted descriptor: true true function get aborted 0 undefined true false",
    "aborted async: AsyncFunction [object AsyncFunction] true",
    "aborted validation: missing:Promise:TypeError:ERR_INVALID_ARG_TYPE:signal is not of type AbortSignal.|null-signal:Promise:TypeError:ERR_INVALID_ARG_TYPE:signal is not of type AbortSignal.|object-signal:Promise:TypeError:ERR_INVALID_ARG_TYPE:signal is not of type AbortSignal.|controller-signal:Promise:TypeError:ERR_INVALID_ARG_TYPE:signal is not of type AbortSignal.|missing-resource:Promise:TypeError:ERR_INVALID_ARG_TYPE:The \"resource\" argument must be of type object. Received undefined|null-resource:Promise:TypeError:ERR_INVALID_ARG_TYPE:The \"resource\" argument must be of type object. Received null|number-resource:Promise:TypeError:ERR_INVALID_ARG_TYPE:The \"resource\" argument must be of type object. Received type number (1)|string-resource:Promise:TypeError:ERR_INVALID_ARG_TYPE:The \"resource\" argument must be of type object. Received type string ('x')|symbol-resource:Promise:TypeError:ERR_INVALID_ARG_TYPE:The \"resource\" argument must be of type object. Received type symbol (Symbol(x))|already-aborted-string-resource:Promise:TypeError:ERR_INVALID_ARG_TYPE:The \"resource\" argument must be of type object. Received type string ('x')",
    "aborted already: undefined",
    "util prototypes: _errnoException:false:false:true:object|_exceptionWithHostPort:false:false:true:object|_extend:false:false:true:object|callbackify:false:false:true:object|debug:false:false:true:object|debuglog:false:false:true:object|deprecate:false:false:true:object|styleText:false:false:true:object|formatWithOptions:false:false:true:object|getSystemErrorMap:false:false:true:object|getSystemErrorName:false:false:true:object|getSystemErrorMessage:false:false:true:object|inherits:false:false:true:object|isArray:false:false:true:object|promisify:false:false:true:object|setTraceSigInt:false:false:true:object",
    "util no prototypes: aborted:false|isDeepStrictEqual:false|toUSVString:false|parseArgs:false",
    "debug identity: true",
    "abort helper descriptors: transferableAbortController:true:true:function:get transferableAbortController:undefined:transferableAbortController:0:true|transferableAbortSignal:true:true:function:get transferableAbortSignal:undefined:transferableAbortSignal:1:true",
    "1 two words three true",
    "ENOENT -2 open open ENOENT file.txt",
    "EADDRINUSE 127.0.0.1 3000 true",
    "aborted:abort:Event true"
  ]);
});

test("node:util exposes MIMEType and MIMEParams helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const util = require("node:util");
      const mime = new util.MIMEType("Text/HTML; Charset=UTF-8; boundary=abc");

      mime.params.set("x-test", "yes");

      const mimeDescriptorRows = ["type", "subtype", "essence", "params", "toString", "toJSON"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(util.MIMEType.prototype, name);
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable ?? null, typeof descriptor.get, typeof descriptor.set, descriptor.value?.name, descriptor.value?.length].join(":");
      });
      const paramsDescriptorRows = ["delete", "get", "has", "set", "entries", "keys", "values", "toString", "toJSON", Symbol.iterator].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(util.MIMEParams.prototype, name);
        return [String(name), descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length].join(":");
      });
      console.log(mime.type, mime.subtype, mime.essence);
      console.log(mime.params.get("charset"), mime.params.has("boundary"), mime.params.get("missing"));
      console.log([...mime.params.keys()].join(","));
      console.log(String(mime));
      console.log(mime.toJSON(), mime.params === mime.params, JSON.stringify([Object.keys(mime), Object.getOwnPropertyNames(mime)]));
      console.log(Object.getOwnPropertyNames(util.MIMEType.prototype).join(","));
      console.log(mimeDescriptorRows.join("|"));
      const params = new util.MIMEParams();
      params.set("a", "1");
      params.set("quoted", "two words");
      const ignoredConstructorRows = [
        new util.MIMEParams({ a: "1" }),
        new util.MIMEParams([["a", "1"]]),
        new util.MIMEParams("a=1")
      ].map((value) => JSON.stringify(value.toString())).join(",");
      const receiverRows = ["get", "has", "set", "delete", "toString"].map((name) => {
        try {
          util.MIMEParams.prototype[name].call({});
          return name + ":ok";
        } catch (error) {
          return [name, error.name, error.message].join(":");
        }
      });
      const iteratorReceiverRows = ["entries", "keys", "values"].map((name) => {
        try {
          return name + ":" + Object.prototype.toString.call(util.MIMEParams.prototype[name].call({}));
        } catch (error) {
          return [name, error.name, error.message].join(":");
        }
      });
      const iteratorNextRows = ["entries", "keys", "values"].map((name) => {
        try {
          util.MIMEParams.prototype[name].call({}).next();
          return name + ":ok";
        } catch (error) {
          return [name, error.name, error.message].join(":");
        }
      });
      console.log(params.toString(), params.toJSON(), util.MIMEParams.prototype[Symbol.iterator].name);
      console.log("ignored constructors:", ignoredConstructorRows);
      console.log("receiver errors:", receiverRows.join("|"));
      console.log("iterator receivers:", iteratorReceiverRows.join("|"));
      console.log("iterator next:", iteratorNextRows.join("|"));
      console.log(Object.getOwnPropertyNames(util.MIMEParams.prototype).join(","));
      console.log(paramsDescriptorRows.join("|"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "text html text/html",
    "UTF-8 true null",
    "charset,boundary,x-test",
    "text/html;charset=UTF-8;boundary=abc;x-test=yes",
    "text/html;charset=UTF-8;boundary=abc;x-test=yes true [[],[]]",
    "constructor,type,subtype,essence,params,toString,toJSON",
    "type:false:true::function:function::|subtype:false:true::function:function::|essence:false:true::function:undefined::|params:false:true::function:undefined::|toString:false:true:true:undefined:undefined:toString:0|toJSON:false:true:true:undefined:undefined:toString:0",
    "a=1;quoted=\"two words\" a=1;quoted=\"two words\" entries",
    "ignored constructors: \"\",\"\",\"\"",
    "receiver errors: get:TypeError:Receiver must be an instance of class MIMEParams|has:TypeError:Receiver must be an instance of class MIMEParams|set:TypeError:Receiver must be an instance of class MIMEParams|delete:TypeError:Receiver must be an instance of class MIMEParams|toString:TypeError:Receiver must be an instance of class MIMEParams",
    "iterator receivers: entries:[object Generator]|keys:[object Generator]|values:[object Generator]",
    "iterator next: entries:TypeError:Receiver must be an instance of class MIMEParams|keys:TypeError:Receiver must be an instance of class MIMEParams|values:TypeError:Receiver must be an instance of class MIMEParams",
    "constructor,delete,get,has,set,entries,keys,values,toString,toJSON",
    "delete:false:true:true:delete:1|get:false:true:true:get:1|has:false:true:true:has:1|set:false:true:true:set:2|entries:false:true:true:entries:0|keys:false:true:true:keys:0|values:false:true:true:values:0|toString:false:true:true:toString:0|toJSON:false:true:true:toString:0|Symbol(Symbol.iterator):false:true:true:entries:0"
  ]);
});

test("node:assert exposes matching and async assertion helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import assert from "node:assert/strict";
    import looseAssert from "node:assert";

    const helperNames = [
      "ok",
      "fail",
      "equal",
      "notEqual",
      "deepEqual",
      "notDeepEqual",
      "deepStrictEqual",
      "notDeepStrictEqual",
      "strictEqual",
      "notStrictEqual",
      "partialDeepStrictEqual",
      "match",
      "doesNotMatch",
      "throws",
      "rejects",
      "doesNotThrow",
      "doesNotReject",
      "ifError"
    ];
    const helperMeta = (namespace) => helperNames.map((name) => {
      const fn = namespace[name];
      return [name, fn.name, fn.length, Object.hasOwn(fn, "prototype")].join(":");
    }).join("|");
    const protoMeta = Object.keys(looseAssert.Assert.prototype).map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(looseAssert.Assert.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable].join(":");
    }).join("|");

    console.log("loose keys", Object.keys(looseAssert).join(","));
    console.log("strict keys", Object.keys(assert).join(","));
    console.log("call metadata", [looseAssert.name, looseAssert.length, looseAssert.ok === looseAssert, assert.name, assert.length, assert.strict === assert, looseAssert.Assert.length].join(":"));
    const assertionErrorPrototype = looseAssert.AssertionError.prototype;
    const assertionErrorToString = Object.getOwnPropertyDescriptor(assertionErrorPrototype, "toString");
    const assertionError = new looseAssert.AssertionError({ message: "m", actual: 1, expected: 2, operator: "===" });
    let invalidAssertionErrorCode;
    try {
      new looseAssert.AssertionError();
    } catch (error) {
      invalidAssertionErrorCode = error.code;
    }
    console.log("AssertionError metadata", [
      looseAssert.AssertionError.name,
      looseAssert.AssertionError.length,
      looseAssert.AssertionError === assert.AssertionError,
      Object.getOwnPropertyNames(assertionErrorPrototype).join(","),
      Object.keys(assertionErrorPrototype).join(",") || "<empty>",
      assertionErrorToString.value.name,
      assertionErrorToString.value.length,
      assertionErrorToString.enumerable,
      assertionErrorToString.configurable,
      assertionErrorToString.writable,
      Object.hasOwn(assertionErrorToString.value, "prototype")
    ].join(":"));
    console.log("AssertionError instance", [
      assertionError.generatedMessage,
      assertionError.diff,
      Object.keys(assertionError).join(","),
      Object.getOwnPropertyNames(assertionError).filter((name) => name !== "stack").join(","),
      assertionError.toString(),
      invalidAssertionErrorCode
    ].join(":"));
    console.log("loose helper metadata", helperMeta(looseAssert));
    console.log("strict helper metadata", helperMeta(assert));
    console.log("Assert prototype metadata", protoMeta);
    assert.match("hello", /ell/);
    assert.doesNotMatch("hello", /zzz/);
    const matchValidationRows = [
      ["loose-match", () => looseAssert.match(123, /123/)],
      ["loose-doesNotMatch", () => looseAssert.doesNotMatch(123, /zzz/)],
      ["strict-match", () => assert.match(123, /123/)],
      ["strict-doesNotMatch", () => assert.doesNotMatch(123, /zzz/)]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.name, error.code, error.operator, /"string" argument/.test(error.message)].join(":");
      }
    });
    console.log("match validation", matchValidationRows.join("|"));
    assert.notDeepStrictEqual({ a: 1 }, { a: 2 });
    assert.deepEqual(new Set([1, 2]), new Set([2, 1]));
    assert.partialDeepStrictEqual({ a: 1, b: { c: 2, d: 3 }, list: [{ ok: true, extra: 1 }] }, { b: { c: 2 }, list: [{ ok: true }] });
    assert.ifError(null);
    assert.throws(() => { throw Object.assign(new Error("nope"), { code: "ERR_TEST" }); }, { code: "ERR_TEST" });
    assert.throws(() => assert.partialDeepStrictEqual({ a: 1 }, { a: 2 }), { operator: "partialDeepStrictEqual" });
    assert.throws(() => assert.equal(1, "1"), { operator: "===" });
    await assert.rejects(Promise.reject(new TypeError("bad")), TypeError);
    await assert.doesNotReject(Promise.resolve("ok"));

    const defaultFacade = new looseAssert.Assert();
    const looseFacade = new looseAssert.Assert({ strict: false });
    assert.throws(() => defaultFacade.equal(1, "1"), { operator: "===" });
    looseFacade.equal(1, "1");
    looseAssert.deepEqual({ a: 1, b: ["2"] }, { a: "1", b: [2] });
    looseAssert.notDeepEqual({ a: 1 }, { a: 2 });
    looseFacade.deepEqual({ a: 1 }, { a: "1" });
    assert.throws(() => defaultFacade.deepEqual({ a: 1 }, { a: "1" }), { operator: "deepStrictEqual" });

    console.log(assert.strict === assert);
    console.log(looseAssert.strict === assert);
    console.log(typeof assert.Assert, typeof assert.partialDeepStrictEqual);
    console.log("assertions ok");
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "loose keys AssertionError,ok,fail,equal,notEqual,deepEqual,notDeepEqual,deepStrictEqual,notDeepStrictEqual,strictEqual,notStrictEqual,partialDeepStrictEqual,match,doesNotMatch,throws,rejects,doesNotThrow,doesNotReject,ifError,strict,Assert",
    "strict keys AssertionError,ok,fail,equal,notEqual,deepEqual,notDeepEqual,deepStrictEqual,notDeepStrictEqual,strictEqual,notStrictEqual,partialDeepStrictEqual,match,doesNotMatch,throws,rejects,doesNotThrow,doesNotReject,ifError,Assert,strict",
    "call metadata assert:0:false:strict:0:true:1",
    "AssertionError metadata AssertionError:1:true:constructor,toString:<empty>:toString:0:false:true:true:false",
    "AssertionError instance false:simple:generatedMessage,code,actual,expected,operator,diff:message,generatedMessage,name,code,actual,expected,operator,diff:AssertionError [ERR_ASSERTION]: m:ERR_INVALID_ARG_TYPE",
    "loose helper metadata ok:ok:0:true|fail:fail:1:true|equal:equal:2:true|notEqual:notEqual:2:true|deepEqual:deepEqual:2:true|notDeepEqual:notDeepEqual:2:true|deepStrictEqual:deepStrictEqual:2:true|notDeepStrictEqual:notDeepStrictEqual:2:true|strictEqual:strictEqual:2:true|notStrictEqual:notStrictEqual:2:true|partialDeepStrictEqual:partialDeepStrictEqual:2:true|match:match:2:true|doesNotMatch:doesNotMatch:2:true|throws:throws:1:true|rejects:rejects:1:false|doesNotThrow:doesNotThrow:1:true|doesNotReject:doesNotReject:1:false|ifError:ifError:1:true",
    "strict helper metadata ok:ok:0:true|fail:fail:1:true|equal:strictEqual:2:true|notEqual:notStrictEqual:2:true|deepEqual:deepStrictEqual:2:true|notDeepEqual:notDeepStrictEqual:2:true|deepStrictEqual:deepStrictEqual:2:true|notDeepStrictEqual:notDeepStrictEqual:2:true|strictEqual:strictEqual:2:true|notStrictEqual:notStrictEqual:2:true|partialDeepStrictEqual:partialDeepStrictEqual:2:true|match:match:2:true|doesNotMatch:doesNotMatch:2:true|throws:throws:1:true|rejects:rejects:1:false|doesNotThrow:doesNotThrow:1:true|doesNotReject:doesNotReject:1:false|ifError:ifError:1:true",
    "Assert prototype metadata fail:fail:1:true|ok:ok:0:true|equal:equal:2:true|notEqual:notEqual:2:true|deepEqual:deepEqual:2:true|notDeepEqual:notDeepEqual:2:true|deepStrictEqual:deepStrictEqual:2:true|notDeepStrictEqual:notDeepStrictEqual:2:true|strictEqual:strictEqual:2:true|notStrictEqual:notStrictEqual:2:true|partialDeepStrictEqual:partialDeepStrictEqual:2:true|throws:throws:1:true|rejects:rejects:1:true|doesNotThrow:doesNotThrow:1:true|doesNotReject:doesNotReject:1:true|ifError:ifError:1:true|match:match:2:true|doesNotMatch:doesNotMatch:2:true",
    "match validation loose-match:AssertionError:ERR_ASSERTION:match:true|loose-doesNotMatch:AssertionError:ERR_ASSERTION:doesNotMatch:true|strict-match:AssertionError:ERR_ASSERTION:match:true|strict-doesNotMatch:AssertionError:ERR_ASSERTION:doesNotMatch:true",
    "true",
    "true",
    "function function",
    "assertions ok"
  ]);
});

test("process exposes Node-like runtime metadata helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const start = process.hrtime();
      console.log(typeof process.hrtime, typeof process.hrtime.bigint, Array.isArray(start), typeof process.hrtime.bigint());
      console.log(process.release.name, process.title, process.argv0, Array.isArray(process.execArgv));
      console.log(typeof process.uptime(), process.memoryUsage().heapUsed >= 0, typeof process.memoryUsage.rss(), process.cpuUsage().user >= 0);
      console.log(process.allowedNodeEnvironmentFlags instanceof Set, typeof process.config, typeof process.features);
      console.log(process.features.tls_alpn, process.features.require_module, process.features.typescript);
      const featureKeys = Object.keys(process.features).join(",");
      const featureValues = Object.keys(process.features).map((key) => key + ":" + process.features[key]).join("|");
      const featureDescriptorRows = Object.keys(process.features).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process.features, key);
        return [
          key,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          descriptor.get?.name,
          descriptor.get?.length,
          typeof descriptor.set,
          typeof descriptor.value
        ].join(":");
      }).join("|");
      process.features.extra = 1;
      const deletedDebug = delete process.features.debug;
      console.log("features keys", featureKeys);
      console.log("features values", featureValues);
      console.log("features descriptors", featureDescriptorRows);
      console.log("features extensible", Object.isExtensible(process.features), Object.isSealed(process.features), Object.isFrozen(process.features), process.features.extra, deletedDebug, Object.hasOwn(process.features, "debug"), process.features.debug);
      console.log(process.allowedNodeEnvironmentFlags.has("--inspect"), process.allowedNodeEnvironmentFlags.has("--inspect=9229"));
      console.log(process.allowedNodeEnvironmentFlags.has("--max_old_space_size=4096"), process.allowedNodeEnvironmentFlags.has("--max-old-space-size=4096"));
      console.log(process.allowedNodeEnvironmentFlags.has("-r"), process.allowedNodeEnvironmentFlags.has("--require=tsx"), process.allowedNodeEnvironmentFlags.has("--definitely-not-node"));
      const expectedProcessKeys = "version,versions,arch,platform,release,_rawDebug,moduleLoadList,binding,_linkedBinding,_events,_eventsCount,_maxListeners,domain,_exiting,exitCode,config,dlopen,uptime,_getActiveRequests,_getActiveHandles,getActiveResourcesInfo,reallyExit,_kill,loadEnvFile,cpuUsage,threadCpuUsage,resourceUsage,memoryUsage,constrainedMemory,availableMemory,kill,exit,execve,ref,unref,finalization,hrtime,openStdin,getuid,geteuid,getgid,getegid,getgroups,allowedNodeEnvironmentFlags,features,_fatalException,setUncaughtExceptionCaptureCallback,addUncaughtExceptionCaptureCallback,hasUncaughtExceptionCaptureCallback,emitWarning,nextTick,_tickCallback,sourceMapsEnabled,setSourceMapsEnabled,getBuiltinModule,_debugProcess,_debugEnd,_startProfilerIdleNotifier,_stopProfilerIdleNotifier,stdout,stdin,stderr,abort,umask,chdir,cwd,initgroups,setgroups,setegid,seteuid,setgid,setuid,env,title,argv,execArgv,pid,ppid,execPath,debugPort,argv0,_eval,_preload_modules,report";
      if (Object.keys(process).join(",") !== expectedProcessKeys) throw new Error("process export order failed");
      if (Object.getOwnPropertyNames(process).join(",") !== expectedProcessKeys) throw new Error("process own-property order failed");
      const descriptorRows = ["features", "allowedNodeEnvironmentFlags", "finalization", "exitCode"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.get?.name, descriptor.set?.name, typeof descriptor.value].join(":");
      }).join("|");
      if (descriptorRows !== "features:true:false:false:::object|allowedNodeEnvironmentFlags:true:true::get:set:undefined|finalization:true:true::get:set:undefined|exitCode:true:false::get:set:undefined") {
        throw new Error("process descriptor metadata failed");
      }
      const domainDescriptor = Object.getOwnPropertyDescriptor(process, "domain");
      const domainDescriptorRow = [domainDescriptor.enumerable, domainDescriptor.configurable, domainDescriptor.writable, typeof domainDescriptor.value, Object.hasOwn(domainDescriptor.get ?? {}, "prototype"), Object.hasOwn(domainDescriptor.set ?? {}, "prototype")].join(":");
      if (domainDescriptorRow !== "true:true:true:object:false:false") throw new Error("process domain descriptor metadata failed");
      const accessorRows = ["sourceMapsEnabled", "stdout", "stdin", "stderr", "report"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, key);
        return [key, descriptor.enumerable, descriptor.configurable, "writable" in descriptor ? descriptor.writable : "accessor", descriptor.get?.name, typeof descriptor.set, typeof descriptor.value].join(":");
      }).join("|");
      if (accessorRows !== "sourceMapsEnabled:true:true:accessor:get:undefined:undefined|stdout:true:true:accessor:getStdout:undefined:undefined|stdin:true:true:accessor:getStdin:undefined:undefined|stderr:true:true:accessor:getStderr:undefined:undefined|report:true:true:accessor:get:undefined:undefined") {
        throw new Error("process accessor descriptor metadata failed");
      }
      const accessorPrototypeRows = ["sourceMapsEnabled", "report"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, key);
        return key + ":" + Object.hasOwn(descriptor.get, "prototype");
      }).join("|");
      if (accessorPrototypeRows !== "sourceMapsEnabled:false|report:false") {
        throw new Error("process accessor prototype metadata failed");
      }
      const evalDescriptor = Object.getOwnPropertyDescriptor(process, "_eval");
      if ([evalDescriptor.enumerable, evalDescriptor.configurable, evalDescriptor.writable, typeof evalDescriptor.value].join(":") !== "true:true:false:string") {
        throw new Error("process _eval descriptor metadata failed");
      }
      const processKeys = Reflect.ownKeys(process).map(String);
      const processSymbolValues = Reflect.ownKeys(process)
        .filter((key) => typeof key === "symbol" && ["Symbol(shapeMode)", "Symbol(kCapture)"].includes(String(key)))
        .map((key) => process[key])
        .join(",");
      const readonlyMetadataRows = ["version", "versions", "arch", "platform", "release", "config", "moduleLoadList"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
      });
      const identityMetadataRows = ["pid", "ppid", "argv0", "_eval", "_preload_modules", "execArgv", "moduleLoadList"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
      });
      const openContainersEnumerableKeys = Object.keys(process).filter((key) => key.startsWith("__opencontainers"));
      const openContainersOwnStringKeys = Reflect.ownKeys(process).filter((key) => typeof key === "string" && key.startsWith("__opencontainers"));
      console.log(Object.prototype.toString.call(process), process[Symbol.toStringTag]);
      console.log(["_events", "_eventsCount", "_maxListeners", "_eval", "_exiting", "_fatalException", "_preload_modules", "Symbol(shapeMode)", "Symbol(kCapture)", "Symbol(Symbol.toStringTag)"].every((key) => processKeys.includes(key)), !processKeys.includes("Symbol(opencontainers.events)"));
      console.log(Object.getPrototypeOf(process._events) === null, typeof process._eventsCount, process._maxListeners === undefined, processSymbolValues);
      console.log("readonly metadata", readonlyMetadataRows.join("|"));
      console.log("identity metadata", identityMetadataRows.join("|"));
      console.log("opencontainers internals", openContainersEnumerableKeys.length, openContainersOwnStringKeys.length, typeof process.__opencontainersAddRef, typeof process.__opencontainersUnref, typeof process.__opencontainersOnExit, typeof process.__opencontainersIsAlive, Array.isArray(process.__opencontainersNetworkAllowlist), typeof process.__opencontainersArgvParseStart);
      console.log(process._eval.includes("process._eval"), Array.isArray(process._preload_modules), Object.getOwnPropertyDescriptor(process, "_preload_modules").writable);
      console.log(process._exiting);
      console.log("helper metadata", ["reallyExit", "_kill", "kill", "exit", "emitWarning", "setSourceMapsEnabled"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, name);
        return [name, process[name].name, process[name].length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
      }).join("|"));
      console.log("selected helper prototypes", ["_kill", "kill", "openStdin", "_fatalException", "setUncaughtExceptionCaptureCallback", "addUncaughtExceptionCaptureCallback", "hasUncaughtExceptionCaptureCallback", "emitWarning", "nextTick", "_tickCallback", "getBuiltinModule", "umask", "chdir", "cwd"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, name);
        const helper = descriptor.value;
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(helper, "prototype");
        let constructable = "no";
        try {
          Reflect.construct(Object, [], helper);
          constructable = "yes";
        } catch (error) {
          constructable = error.message.includes("not a constructor") ? "no" : error.code || error.name;
        }
        return [
          name,
          helper.name,
          helper.length,
          Object.hasOwn(helper, "prototype"),
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          prototypeDescriptor?.enumerable ?? "",
          prototypeDescriptor?.configurable ?? "",
          prototypeDescriptor?.writable ?? "",
          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
          constructable
        ].join(":");
      }).join("|"));
      process._exiting = true;
      console.log(process._exiting);
      process._exiting = false;
      console.log(typeof process._fatalException, process._fatalException.length, process._fatalException.name === "");
      console.log(Object.keys(require("node:process")).includes("exitCode"), Object.getOwnPropertyDescriptor(process, "exitCode").enumerable);
      process.exitCode = "5";
      console.log(process.exitCode);
      process.exitCode = undefined;
      console.log(String(process.exitCode));
      process.exitCode = null;
      console.log(String(process.exitCode));
      process.exitCode = "0x10";
      console.log(process.exitCode);
      process.exitCode = 4294967297;
      console.log(process.exitCode);
      for (const [label, value] of [
        ["bad-string", "bad"],
        ["empty-string", ""],
        ["fraction", 3.2],
        ["nan", NaN],
        ["bool", true],
        ["array", []]
      ]) {
        try {
          process.exitCode = value;
        } catch (error) {
          console.log(label, error.name, error.code);
        }
      }
      console.log("preserved", process.exitCode);
      process.exitCode = 0;
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function function true bigint",
    "node node node true",
    "number true number true",
    "true object object",
    "true true strip",
    "features keys inspector,debug,uv,ipv6,tls_alpn,tls_sni,tls_ocsp,tls,openssl_is_boringssl,cached_builtins,require_module,quic,typescript",
    "features values inspector:true|debug:false|uv:true|ipv6:true|tls_alpn:true|tls_sni:true|tls_ocsp:true|tls:true|openssl_is_boringssl:false|cached_builtins:true|require_module:true|quic:false|typescript:strip",
    "features descriptors inspector:true:true:true:::undefined:boolean|debug:true:true:true:::undefined:boolean|uv:true:true:true:::undefined:boolean|ipv6:true:true:true:::undefined:boolean|tls_alpn:true:true:true:::undefined:boolean|tls_sni:true:true:true:::undefined:boolean|tls_ocsp:true:true:true:::undefined:boolean|tls:true:true:true:::undefined:boolean|openssl_is_boringssl:true:true:true:::undefined:boolean|cached_builtins:true:true::get cached_builtins:0:undefined:undefined|require_module:true:true::get require_module:0:undefined:undefined|quic:true:true::get quic:0:undefined:undefined|typescript:true:true::get:0:undefined:undefined",
    "features extensible true false false 1 true false undefined",
    "true true",
    "true true",
    "true true false",
    "[object process] process",
    "true true",
    "true number true false,false",
    "readonly metadata version:true:true:false:string|versions:true:true:false:object|arch:true:true:false:string|platform:true:true:false:string|release:true:true:false:object|config:true:true:false:object|moduleLoadList:true:true:false:object",
    "identity metadata pid:true:true:false:number|ppid:true:true:true:number|argv0:true:false:false:string|_eval:true:true:false:string|_preload_modules:true:true:false:object|execArgv:true:true:true:object|moduleLoadList:true:true:false:object",
    "opencontainers internals 0 0 function function function function true number",
    "true true false",
    "false",
    "helper metadata reallyExit:reallyExit:0:true:true:true|_kill:_kill:0:true:true:true|kill:kill:2:true:true:true|exit:exit:1:true:true:true|emitWarning:emitWarning:4:true:true:true|setSourceMapsEnabled:setSourceMapsEnabled:1:true:true:true",
    "selected helper prototypes _kill:_kill:0:false:true:true:true:::::no|kill:kill:2:true:true:true:true:false:false:true:constructor:yes|openStdin::0:true:true:true:true:false:false:true:constructor:yes|_fatalException::2:false:true:true:true:::::no|setUncaughtExceptionCaptureCallback:setUncaughtExceptionCaptureCallback:1:true:true:true:true:false:false:true:constructor:yes|addUncaughtExceptionCaptureCallback:addUncaughtExceptionCaptureCallback:1:true:true:true:true:false:false:true:constructor:yes|hasUncaughtExceptionCaptureCallback:hasUncaughtExceptionCaptureCallback:0:true:true:true:true:false:false:true:constructor:yes|emitWarning:emitWarning:4:true:true:true:true:false:false:true:constructor:yes|nextTick:nextTick:1:true:true:true:true:false:false:true:constructor:yes|_tickCallback:runNextTicks:0:true:true:true:true:false:false:true:constructor:yes|getBuiltinModule:getBuiltinModule:1:true:true:true:true:false:false:true:constructor:yes|umask:wrappedUmask:1:true:true:true:true:false:false:true:constructor:yes|chdir:wrappedChdir:1:true:true:true:true:false:false:true:constructor:yes|cwd:wrappedCwd:0:true:true:true:true:false:false:true:constructor:yes",
    "true",
    "function 2 true",
    "true true",
    "5",
    "undefined",
    "undefined",
    "16",
    "1",
    "bad-string TypeError ERR_INVALID_ARG_TYPE",
    "empty-string TypeError ERR_INVALID_ARG_TYPE",
    "fraction RangeError ERR_OUT_OF_RANGE",
    "nan RangeError ERR_OUT_OF_RANGE",
    "bool TypeError ERR_INVALID_ARG_TYPE",
    "array TypeError ERR_INVALID_ARG_TYPE",
    "preserved 1"
  ]);
});

test("process.exit validates and inherits exit codes like Node", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      for (const [label, value] of [
        ["bad-string", "bad"],
        ["fraction", 3.2]
      ]) {
        try {
          process.exit(value);
        } catch (error) {
          console.log(label, error.name, error.code);
        }
      }
      process.exitCode = 7;
      process.on("exit", (code) => console.log("exit", code));
      process.exit();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 7, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "bad-string TypeError ERR_INVALID_ARG_TYPE",
    "fraction RangeError ERR_OUT_OF_RANGE",
    "exit 7"
  ]);
});

test("node -e exposes Node-shaped process.argv", async () => {
  const kernel = new Kernel();

  const noArgs = await kernel.run("node", [
    "-e",
    "console.log(JSON.stringify(process.argv))"
  ], { cwd: "/workspace" });
  const withArgs = await kernel.run("node", [
    "-e",
    "console.log(JSON.stringify(process.argv))",
    "alpha",
    "beta"
  ], { cwd: "/workspace" });
  const withTerminator = await kernel.run("node", [
    "-e",
    "console.log(JSON.stringify(process.argv))",
    "--",
    "--flag",
    "value"
  ], { cwd: "/workspace" });
  const withPositionalOption = await kernel.run("node", [
    "-e",
    "console.log(JSON.stringify(process.argv))",
    "alpha",
    "--flag"
  ], { cwd: "/workspace" });
  const badOption = await kernel.run("node", [
    "-e",
    "console.log(JSON.stringify(process.argv))",
    "--flag"
  ], { cwd: "/workspace" });
  const parseDefaultArgs = await kernel.run("node", [
    "-e",
    "const { parseArgs } = require('node:util'); console.log(JSON.stringify(parseArgs({ options: { flag: { type: 'boolean' } } })))",
    "--",
    "--flag"
  ], { cwd: "/workspace" });
  const parseUnexpectedPositional = await kernel.run("node", [
    "-e",
    "const { parseArgs } = require('node:util'); try { parseArgs({ options: { flag: { type: 'boolean' } } }); } catch (error) { console.log(error.code); }",
    "alpha",
    "--flag"
  ], { cwd: "/workspace" });

  assert.equal(noArgs.status, 0, noArgs.stderr.toString());
  assert.equal(withArgs.status, 0, withArgs.stderr.toString());
  assert.equal(withTerminator.status, 0, withTerminator.stderr.toString());
  assert.equal(withPositionalOption.status, 0, withPositionalOption.stderr.toString());
  assert.equal(badOption.status, 9);
  assert.equal(parseDefaultArgs.status, 0, parseDefaultArgs.stderr.toString());
  assert.equal(parseUnexpectedPositional.status, 0, parseUnexpectedPositional.stderr.toString());
  assert.equal(noArgs.stdout.toString().trim(), '["node"]');
  assert.equal(withArgs.stdout.toString().trim(), '["node","alpha","beta"]');
  assert.equal(withTerminator.stdout.toString().trim(), '["node","--flag","value"]');
  assert.equal(withPositionalOption.stdout.toString().trim(), '["node","alpha","--flag"]');
  assert.equal(badOption.stderr.toString(), "node: bad option: --flag\n");
  assert.equal(parseDefaultArgs.stdout.toString().trim(), '{"values":{"flag":true},"positionals":[]}');
  assert.equal(parseUnexpectedPositional.stdout.toString().trim(), "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL");
});

test("process.loadEnvFile loads virtual dotenv files without overwriting existing env", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/.env", `
    # ignored comment
    EXISTING=from-file
    SPACED = value
    INLINE=abc # comment
    HASH="abc # not comment"
    SINGLE='abc # not comment'
    EMPTY=
    BAD-NAME=x
    MULTI="hello
world"
    ESC="line\\nnext"
    export EXPORTED=five
    DUP=first
    DUP=second
  `);
  kernel.fs.writeFileSync("/workspace/custom.env", "CUSTOM=ok\n");
  kernel.fs.writeFileSync("/workspace/index.js", `
    process.env.EXISTING = "already";
    console.log(String(process.loadEnvFile()));
    process.loadEnvFile();
    process.loadEnvFile(Buffer.from("custom.env"));
    console.log(JSON.stringify({
      existing: process.env.EXISTING,
      spaced: process.env.SPACED,
      inline: process.env.INLINE,
      hash: process.env.HASH,
      single: process.env.SINGLE,
      empty: process.env.EMPTY,
      bad: process.env["BAD-NAME"],
      multi: process.env.MULTI,
      esc: process.env.ESC,
      exported: process.env.EXPORTED,
      dup: process.env.DUP,
      custom: process.env.CUSTOM
    }));
    try {
      process.loadEnvFile(42);
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.equal(lines[0], "undefined");
  assert.deepEqual(JSON.parse(lines[1]), {
    existing: "already",
    spaced: "value",
    inline: "abc",
    hash: "abc # not comment",
    single: "abc # not comment",
    empty: "",
    bad: "x",
    multi: "hello\nworld",
    esc: "line\nnext",
    exported: "five",
    dup: "second",
    custom: "ok"
  });
  assert.equal(lines[2], "ERR_INVALID_ARG_TYPE");
});

test("process.env coerces mutations like Node", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const rows = [];
      const summarize = (key) => {
        const descriptor = Object.getOwnPropertyDescriptor(process.env, key);
        rows.push([
          key,
          Object.hasOwn(process.env, key),
          typeof process.env[key],
          String(process.env[key]),
          descriptor && ("value" in descriptor ? typeof descriptor.value + ":" + String(descriptor.value) : "accessor"),
          descriptor?.enumerable,
          descriptor?.configurable,
          descriptor?.writable
        ].join("|"));
      };
      for (const key of ["OC_NULL", "OC_UNDEF", "OC_NUM", "OC_BOOL", "OC_OBJ", "OC_BIG", "OC_DEF"]) delete process.env[key];

      process.env.OC_NULL = null;
      process.env.OC_UNDEF = undefined;
      process.env.OC_NUM = 42;
      process.env.OC_BOOL = false;
      process.env.OC_OBJ = { toString() { return "obj-value"; } };
      process.env.OC_BIG = 1n;
      for (const key of ["OC_NULL", "OC_UNDEF", "OC_NUM", "OC_BOOL", "OC_OBJ", "OC_BIG"]) summarize(key);

      try {
        process.env[Symbol("s")] = "sym-value";
      } catch (error) {
        rows.push(["symbol-set", error.name, error.code, error.message].join("|"));
      }
      rows.push(["symbol-get", String(process.env[Symbol("s")]), Symbol("s") in process.env, delete process.env[Symbol("s")]].join("|"));

      Object.defineProperty(process.env, "OC_DEF", { value: 99, enumerable: true, configurable: true, writable: true });
      summarize("OC_DEF");
      Object.defineProperty(process.env, "OC_DEF_UNDEF", { value: undefined, enumerable: true, configurable: true, writable: true });
      summarize("OC_DEF_UNDEF");

      for (const [label, descriptor] of [
        ["accessor", { get() { return "x"; }, configurable: true }],
        ["missing-value", { enumerable: true, configurable: true, writable: true }],
        ["nonconfigurable", { value: "x", enumerable: true, configurable: false, writable: true }],
        ["nonwritable", { value: "x", enumerable: true, configurable: true, writable: false }],
        ["nonenumerable", { value: "x", enumerable: false, configurable: true, writable: true }]
      ]) {
        try {
          Object.defineProperty(process.env, "OC_BAD_" + label, descriptor);
        } catch (error) {
          rows.push([label, error.name, error.code, error.message].join("|"));
        }
      }
      rows.push(["delete", delete process.env.OC_NUM, Object.hasOwn(process.env, "OC_NUM")].join("|"));
      console.log(rows.join("\\n"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "OC_NULL|true|string|null|string:null|true|true|true",
    "OC_UNDEF|true|string|undefined|string:undefined|true|true|true",
    "OC_NUM|true|string|42|string:42|true|true|true",
    "OC_BOOL|true|string|false|string:false|true|true|true",
    "OC_OBJ|true|string|obj-value|string:obj-value|true|true|true",
    "OC_BIG|true|string|1|string:1|true|true|true",
    "symbol-set|TypeError||Cannot convert a Symbol value to a string",
    "symbol-get|undefined|false|true",
    "OC_DEF|true|string|99|string:99|true|true|true",
    "OC_DEF_UNDEF|true|string|undefined|string:undefined|true|true|true",
    "accessor|TypeError|ERR_INVALID_OBJECT_DEFINE_PROPERTY|'process.env' does not accept an accessor(getter/setter) descriptor",
    "missing-value|TypeError|ERR_INVALID_OBJECT_DEFINE_PROPERTY|'process.env' only accepts a configurable, writable, and enumerable data descriptor",
    "nonconfigurable|TypeError|ERR_INVALID_OBJECT_DEFINE_PROPERTY|'process.env' only accepts a configurable, writable, and enumerable data descriptor",
    "nonwritable|TypeError|ERR_INVALID_OBJECT_DEFINE_PROPERTY|'process.env' only accepts a configurable, writable, and enumerable data descriptor",
    "nonenumerable|TypeError|ERR_INVALID_OBJECT_DEFINE_PROPERTY|'process.env' only accepts a configurable, writable, and enumerable data descriptor",
    "delete|true|false"
  ]);
});

test("process.emitWarning emits Node-shaped warning events and fallback output", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      process.on("warning", (warning) => {
        console.log(warning.name, warning.code, warning.message, warning.detail);
      });
      process.emitWarning("careful", {
        type: "DeprecationWarning",
        code: "DEP_OPENCONTAINERS_TEST",
        detail: "extra detail"
      });
      process.removeAllListeners("warning");
      process.emitWarning("fallback", "Warning", "OPENCONTAINERS_TEST");
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "DeprecationWarning DEP_OPENCONTAINERS_TEST careful extra detail"
  ]);
  assert.match(result.stderr.toString(), /\[OPENCONTAINERS_TEST\] Warning: fallback/);
});

test("process exposes builtin module lookup, report, and resource usage helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = process.getBuiltinModule("node:fs");
      const missing = process.getBuiltinModule("not-a-core-module");
      const report = process.report.getReport(new Error("boom"));
      const usage = process.resourceUsage();

      console.log(typeof fs.readFileSync, missing);
      console.log(report.header.processId === process.pid, report.javascriptStack.message);
      console.log(typeof usage.userCPUTime, typeof usage.maxRSS);
      console.log(Object.hasOwn(report, "environmentVariables"), Object.hasOwn(report.header, "networkInterfaces"));
      console.log(Array.isArray(report.nativeStack), Array.isArray(report.libuv), Array.isArray(report.workers), typeof report.userLimits);
      process.report.excludeEnv = true;
      process.report.excludeNetwork = true;
      const excludedReport = process.report.getReport();
      console.log(Object.hasOwn(excludedReport, "environmentVariables"), Object.hasOwn(excludedReport.header, "networkInterfaces"));
      const getReport = process.report.getReport;
      console.log(getReport().header.host);
      console.log(process.report.writeReport("report.json"));
      console.log(require("node:fs").statSync("report.json").isFile());
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function undefined",
    "true boom",
    "number number",
    "true true",
    "true true true object",
    "false false",
    "opencontainers",
    "report.json",
    "true"
  ]);
});

test("process exposes browser-safe Node process probe helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      console.log(typeof process.availableMemory(), typeof process.constrainedMemory());
      console.log(Array.isArray(process.getActiveResourcesInfo()), typeof process.threadCpuUsage().user);
      const baseUsage = process.cpuUsage();
      console.log("cpu delta", typeof process.cpuUsage(baseUsage).user, typeof process.threadCpuUsage({ user: 0, system: 0 }).system);
      for (const [label, action] of [
        ["cpu string", () => process.cpuUsage("bad")],
        ["cpu array", () => process.cpuUsage([])],
        ["cpu missing user", () => process.cpuUsage({ system: 0 })],
        ["cpu nan user", () => process.threadCpuUsage({ user: NaN, system: 0 })],
        ["cpu negative system", () => process.threadCpuUsage({ user: 0, system: -1 })]
      ]) {
        try {
          action();
          console.log(label, "ok");
        } catch (error) {
          console.log(label, error.name, error.code);
        }
	      }
	      console.log(process.openStdin() === process.stdin, Array.isArray(process.getgroups()));
	      const posixHelperNames = ["getuid", "geteuid", "getgid", "getegid", "getgroups", "setuid", "setgid", "seteuid", "setegid", "setgroups", "initgroups"];
	      console.log("process posix helpers", posixHelperNames.map((name) => {
	        const descriptor = Object.getOwnPropertyDescriptor(process, name);
	        const helper = descriptor.value;
	        const prototypeDescriptor = Object.getOwnPropertyDescriptor(helper, "prototype");
	        let constructable = "no";
	        try {
	          Reflect.construct(Object, [], helper);
	          constructable = "yes";
	        } catch (error) {
	          constructable = error.message.includes("not a constructor") ? "no" : error.code || error.name;
	        }
	        return [
	          name,
	          helper.name,
	          helper.length,
	          Object.hasOwn(helper, "prototype"),
	          descriptor.enumerable,
	          descriptor.configurable,
	          descriptor.writable,
	          prototypeDescriptor?.enumerable ?? "",
	          prototypeDescriptor?.configurable ?? "",
	          prototypeDescriptor?.writable ?? "",
	          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
	          constructable
	        ].join(":");
	      }).join("|"));
	      console.log(process.sourceMapsEnabled);
	      process.setSourceMapsEnabled(true);
	      console.log(process.sourceMapsEnabled);
      process.setSourceMapsEnabled(false);
      console.log(process.sourceMapsEnabled);
      console.log(typeof process.kill, typeof process._kill);
      console.log(process.kill(process.pid, 0), process._kill(process.pid, 0));
      try { process.kill(99999999, 0); } catch (error) { console.log(error.code, error.errno, error.syscall); }
      try { process.kill("not-a-pid", 0); } catch (error) { console.log(error.code); }
      try { process.kill(process.pid, "NOT_A_SIGNAL"); } catch (error) { console.log(error.code); }
      try { process.kill(process.pid, -1); } catch (error) { console.log(error.code, error.errno, error.syscall); }
      const token = {};
      process.finalization.register(token, () => {});
      process.finalization.registerBeforeExit(token, () => {});
      process.finalization.unregister(token);
      let refCalls = 0;
      const refable = {
        ref() { refCalls += 1; },
        [Symbol.for("nodejs.unref")]() { refCalls += 10; }
      };
      process.ref(refable);
      process.unref(refable);
      console.log(refCalls);
      console.log(typeof process.ref(), typeof process.unref(), typeof process._rawDebug);
      const diagnosticHelperNames = ["_rawDebug", "_getActiveRequests", "_getActiveHandles", "uptime", "getActiveResourcesInfo", "loadEnvFile", "cpuUsage", "threadCpuUsage", "resourceUsage", "memoryUsage", "availableMemory", "constrainedMemory", "ref", "unref", "hrtime"];
      console.log("process diagnostic helpers", diagnosticHelperNames.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, name);
        const helper = descriptor.value;
        return [name, helper.name, helper.length, Object.hasOwn(helper, "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
      }).join("|"));
      const memoryUsageRss = Object.getOwnPropertyDescriptor(process.memoryUsage, "rss").value;
      const hrtimeBigInt = Object.getOwnPropertyDescriptor(process.hrtime, "bigint").value;
      console.log("process diagnostic nested", [memoryUsageRss.name, memoryUsageRss.length, Object.hasOwn(memoryUsageRss, "prototype"), hrtimeBigInt.name, hrtimeBigInt.length, Object.hasOwn(hrtimeBigInt, "prototype")].join(":"));
      console.log(process.hasUncaughtExceptionCaptureCallback());
      process.setUncaughtExceptionCaptureCallback(() => {});
      console.log(process.hasUncaughtExceptionCaptureCallback());
      try { process.setUncaughtExceptionCaptureCallback(() => {}); } catch (error) { console.log(error.code); }
      process.setUncaughtExceptionCaptureCallback(null);
      console.log(process.hasUncaughtExceptionCaptureCallback());
      const previousUmask = process.umask();
      console.log(process.umask("077"), process.umask());
      console.log(process.umask(previousUmask), process.umask());
      try { process.umask("0o22"); } catch (error) { console.log(error.code); }
      try { process.umask({}); } catch (error) { console.log(error.code); }
      try { process.umask(-1); } catch (error) { console.log(error.code); }
      const chdirStart = process.cwd();
      require("node:fs").writeFileSync("/workspace/chdir-file.txt", "file");
      const chdirRows = [
        ["missing", () => process.chdir("/workspace/chdir-missing")],
        ["file", () => process.chdir("/workspace/chdir-file.txt")]
      ].map(([label, action]) => {
        try {
          action();
          return [label, "ok", process.cwd() === chdirStart].join(":");
        } catch (error) {
          return [label, error.name, error.code, error.errno, error.syscall, error.path === chdirStart, process.cwd() === chdirStart].join(":");
        }
      }).join("|");
      console.log("chdir validation", chdirRows);
      try { process.chdir(); } catch (error) { console.log(error.code); }
      try { process.chdir(1); } catch (error) { console.log(error.code); }
      try { process.nextTick(1); } catch (error) { console.log(error.code); }
      try { process.setSourceMapsEnabled(); } catch (error) { console.log(error.code); }
      try { process.setSourceMapsEnabled(null); } catch (error) { console.log(error.code); }
      try { process.setUncaughtExceptionCaptureCallback(1); } catch (error) { console.log(error.code); }
      try { process.addUncaughtExceptionCaptureCallback(); } catch (error) { console.log(error.code); }
      const nativeStubNames = ["execve", "dlopen", "binding", "_linkedBinding", "abort", "_debugProcess", "_debugEnd"];
      console.log("native stubs", nativeStubNames.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(process, name);
        return [name, typeof process[name], process[name]?.name, process[name]?.length, descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, Object.hasOwn(process[name] ?? {}, "prototype")].join(":");
      }).join("|"));
      const errorCode = (run) => {
        try {
          return "ok:" + String(run());
        } catch (error) {
          return error.name + ":" + error.code;
        }
      };
      console.log("execve validation", [
        () => process.execve(),
        () => process.execve(1),
        () => process.execve("/missing", "bad"),
        () => process.execve("/missing", [1]),
        () => process.execve("/missing", ["probe"], "bad"),
        () => process.execve("/missing", ["probe"], { A: 1 })
      ].map(errorCode).join("|"));
      console.log("execve unsupported", errorCode(() => process.execve("/missing", ["probe"], { PATH: "/bin" })));
      console.log("native unsupported", [
        ["dlopen", () => process.dlopen()],
        ["binding", () => process.binding()],
        ["_linkedBinding", () => process._linkedBinding()],
        ["_debugProcess", () => process._debugProcess()],
        ["abort", () => process.abort()],
        ["_debugEnd", () => process._debugEnd()]
      ].map(([name, run]) => name + ":" + errorCode(run)).join("|"));
      try { process.setuid(0); } catch (error) { console.log(error.code); }
      try { process.binding("natives"); } catch (error) { console.log(error.code); }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "number number",
    "true number",
    "cpu delta number number",
    "cpu string TypeError ERR_INVALID_ARG_TYPE",
    "cpu array TypeError ERR_INVALID_ARG_TYPE",
    "cpu missing user TypeError ERR_INVALID_ARG_TYPE",
    "cpu nan user RangeError ERR_INVALID_ARG_VALUE",
	    "cpu negative system RangeError ERR_INVALID_ARG_VALUE",
	    "true true",
	    "process posix helpers getuid:getuid:0:false:true:true:true:::::no|geteuid:geteuid:0:false:true:true:true:::::no|getgid:getgid:0:false:true:true:true:::::no|getegid:getegid:0:false:true:true:true:::::no|getgroups:getgroups:0:false:true:true:true:::::no|setuid::1:true:true:true:true:false:false:true:constructor:yes|setgid::1:true:true:true:true:false:false:true:constructor:yes|seteuid::1:true:true:true:true:false:false:true:constructor:yes|setegid::1:true:true:true:true:false:false:true:constructor:yes|setgroups:setgroups:1:true:true:true:true:false:false:true:constructor:yes|initgroups:initgroups:2:true:true:true:true:false:false:true:constructor:yes",
	    "false",
    "true",
    "false",
    "function function",
    "true true",
    "ESRCH -3 kill",
    "ERR_INVALID_ARG_TYPE",
    "ERR_UNKNOWN_SIGNAL",
    "EINVAL -22 kill",
    "11",
    "undefined undefined function",
    "process diagnostic helpers _rawDebug:_rawDebug:0:true:true:true:true|_getActiveRequests:_getActiveRequests:0:false:true:true:true|_getActiveHandles:_getActiveHandles:0:false:true:true:true|uptime:uptime:0:false:true:true:true|getActiveResourcesInfo:getActiveResourcesInfo:0:false:true:true:true|loadEnvFile:loadEnvFile:0:true:true:true:true|cpuUsage:cpuUsage:1:true:true:true:true|threadCpuUsage:threadCpuUsage:1:true:true:true:true|resourceUsage:resourceUsage:0:true:true:true:true|memoryUsage:memoryUsage:0:true:true:true:true|availableMemory:availableMemory:0:false:true:true:true|constrainedMemory:constrainedMemory:0:false:true:true:true|ref:ref:1:true:true:true:true|unref:unref:1:true:true:true:true|hrtime:hrtime:1:true:true:true:true",
    "process diagnostic nested rss:0:false:hrtimeBigInt:0:true",
    "false",
    "true",
    "ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET",
    "false",
    "18 63",
    "63 18",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_OUT_OF_RANGE",
    "chdir validation missing:Error:ENOENT:-2:chdir:true:true|file:Error:ENOTDIR:-20:chdir:true:true",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "native stubs execve:function:execve:1:true:true:true:true|dlopen:function:dlopen:0:true:true:true:false|binding:function:binding:1:true:true:true:true|_linkedBinding:function:_linkedBinding:1:true:true:true:true|abort:function:abort:0:true:true:true:false|_debugProcess:function:_debugProcess:0:true:true:true:false|_debugEnd:function:_debugEnd:0:true:true:true:false",
    "execve validation TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_VALUE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_VALUE",
    "execve unsupported Error:ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED",
    "native unsupported dlopen:Error:ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED|binding:Error:ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED|_linkedBinding:Error:ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED|_debugProcess:Error:ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED|abort:Error:ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED|_debugEnd:ok:undefined",
    "ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED",
    "ERR_OPENCONTAINERS_PROCESS_UNSUPPORTED"
  ]);
});

test("process.kill delivers virtual signals to the current process", async () => {
  const kernel = new Kernel();
  const handled = await kernel.run("node", [
    "-e",
    `
      process.on("SIGTERM", () => console.log("got SIGTERM"));
      console.log("kill", process.kill(process.pid, "SIGTERM"));
      queueMicrotask(() => console.log("microtask"));
    `
  ], { cwd: "/workspace" });

  assert.equal(handled.status, 0, handled.stderr.toString());
  assert.deepEqual(handled.stdout.toString().trim().split("\n"), [
    "kill true",
    "microtask",
    "got SIGTERM"
  ]);

  const unhandled = await kernel.run("node", [
    "-e",
    `
      console.log("before");
      process.kill(process.pid, "SIGINT");
      console.log("after");
    `
  ], { cwd: "/workspace" });

  assert.equal(unhandled.status, 130, unhandled.stderr.toString());
  assert.equal(unhandled.signal, "SIGINT");
  assert.equal(unhandled.stdout.toString(), "before\n");

  const handlerExit = await kernel.run("node", [
    "-e",
    `
      process.on("SIGTERM", () => {
        console.log("handler exit");
        process.exit(70);
      });
      console.log("kill", process.kill(process.pid, "SIGTERM"));
    `
  ], { cwd: "/workspace" });

  assert.equal(handlerExit.status, 70, handlerExit.stderr.toString());
  assert.equal(handlerExit.signal, null);
  assert.equal(handlerExit.stdout.toString(), "kill true\nhandler exit\n");
});

test("node:module exposes stable builtin metadata and URL createRequire", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/package.json", JSON.stringify({ name: "module-probe" }));
  kernel.fs.mkdirSync("/workspace/shadow/node_modules/test", { recursive: true });
  kernel.fs.writeFileSync("/workspace/shadow/node_modules/test/index.js", "module.exports = 'shadow-test';");
  kernel.fs.writeFileSync("/workspace/shadow/node_modules/test/reporters.js", "module.exports = 'shadow-reporters';");
  kernel.fs.mkdirSync("/workspace/shadow/node_modules/sqlite", { recursive: true });
  kernel.fs.writeFileSync("/workspace/shadow/node_modules/sqlite/index.js", "module.exports = 'shadow-sqlite';");
  kernel.fs.mkdirSync("/home/opencontainers/.node_modules/global-pkg", { recursive: true });
  kernel.fs.writeFileSync("/home/opencontainers/.node_modules/global-pkg/index.js", "module.exports = 'global-home';");
  kernel.fs.writeFileSync("/workspace/index.js", `
    import Module, {
      builtinModules,
      createRequire,
      enableCompileCache,
      findPackageJSON,
      getCompileCacheDir,
      getSourceMapsSupport,
      isBuiltin,
      register,
      registerHooks,
      setSourceMapsSupport,
      SourceMap,
      syncBuiltinESMExports,
      flushCompileCache,
      stripTypeScriptTypes
    } from "node:module";

    const require = createRequire(import.meta.url);
    const expectedModuleKeys = "_cache,_pathCache,_extensions,globalPaths,isBuiltin,_findPath,_nodeModulePaths,_resolveLookupPaths,_load,_resolveFilename,createRequire,_initPaths,_preloadModules,syncBuiltinESMExports,Module,registerHooks,builtinModules,runMain,register,constants,enableCompileCache,findPackageJSON,flushCompileCache,getCompileCacheDir,stripTypeScriptTypes,findSourceMap,SourceMap,getSourceMapsSupport,setSourceMapsSupport";
    const expectedModuleOwnNames = "length,name,prototype,_stat,_cache,_pathCache,_extensions,globalPaths,wrap,wrapper,isBuiltin,_readPackage,_findPath,_nodeModulePaths,_resolveLookupPaths,_load,_resolveFilename,createRequire,_initPaths,_preloadModules,syncBuiltinESMExports,Module,registerHooks,builtinModules,runMain,register,constants,enableCompileCache,findPackageJSON,flushCompileCache,getCompileCacheDir,stripTypeScriptTypes,findSourceMap,SourceMap,getSourceMapsSupport,setSourceMapsSupport";
    const expectedBuiltinModules = "_http_agent,_http_client,_http_common,_http_incoming,_http_outgoing,_http_server,_tls_common,_tls_wrap,assert,assert/strict,async_hooks,buffer,child_process,cluster,console,constants,crypto,dgram,diagnostics_channel,dns,dns/promises,domain,events,fs,fs/promises,http,http2,https,inspector,inspector/promises,module,net,os,path,path/posix,path/win32,perf_hooks,process,punycode,querystring,readline,readline/promises,repl,stream,stream/consumers,stream/promises,stream/web,string_decoder,sys,timers,timers/promises,tls,trace_events,tty,url,util,util/types,v8,vm,wasi,worker_threads,zlib,node:sea,node:sqlite,node:test,node:test/reporters";
    console.log(Module === Module.Module);
    console.log(builtinModules.includes("stream/promises"));
    console.log(isBuiltin("fs"), isBuiltin("node:fs"), isBuiltin("not-a-core-module"));
    console.log(isBuiltin("test"), isBuiltin("node:test"), isBuiltin("test/reporters"), isBuiltin("node:test/reporters"), isBuiltin("sqlite"), isBuiltin("node:sqlite"), isBuiltin("sys"), isBuiltin("node:sys"));
    console.log(builtinModules.includes("test"), builtinModules.includes("node:test"), builtinModules.includes("test/reporters"), builtinModules.includes("node:test/reporters"), builtinModules.includes("sqlite"), builtinModules.includes("node:sqlite"), builtinModules.includes("sys"), builtinModules.includes("node:sys"));
    console.log(typeof process.getBuiltinModule("test"), typeof process.getBuiltinModule("node:test"), typeof process.getBuiltinModule("test/reporters"), typeof process.getBuiltinModule("node:test/reporters"), typeof process.getBuiltinModule("sqlite"), typeof process.getBuiltinModule("node:sqlite"), typeof process.getBuiltinModule("sys"), typeof process.getBuiltinModule("node:sys"));
    console.log(isBuiltin({ toString() { return "fs"; } }), isBuiltin(42));
    for (const value of [42, { toString() { return "node:fs"; } }]) {
      try {
        process.getBuiltinModule(value);
      } catch (error) {
        console.log(error.name, error.code);
      }
    }
    const bareNodePrefixOnlyErrors = [];
    for (const specifier of ["test", "test/reporters", "sqlite"]) {
      try {
        require(specifier);
      } catch (error) {
        bareNodePrefixOnlyErrors.push(error.code);
      }
    }
    console.log(bareNodePrefixOnlyErrors.join(","));
    const shadowRequire = createRequire(new URL("./shadow/index.js", import.meta.url));
    console.log(shadowRequire("test"), shadowRequire("test/reporters"), shadowRequire("sqlite"));
    console.log(typeof require("node:test"), typeof require("node:test/reporters"), typeof require("node:sqlite"));
    console.log(require("node:path").join("a", "b"));
    console.log(createRequire("/workspace/index.js")("node:path").basename("/tmp/file.txt"));
    const createRequireValidation = [];
    for (const [label, action] of [
      ["missing", () => createRequire()],
      ["number", () => createRequire(1)],
      ["relative", () => createRequire("./x.js")],
      ["data-url-object", () => createRequire(new URL("data:text/javascript,export{}"))],
      ["file-url-string", () => createRequire("file:///workspace/probe.js")],
      ["file-url-object", () => createRequire(new URL("file:///workspace/probe.js"))],
      ["abs-path", () => createRequire("/workspace/probe.js")]
    ]) {
      try {
        createRequireValidation.push(label + ":ok:" + typeof action());
      } catch (error) {
        createRequireValidation.push(label + ":" + error.name + ":" + error.code);
      }
    }
    console.log(createRequireValidation.join("|"));
    console.log("global paths", JSON.stringify(Module.globalPaths));
    console.log("resolve paths global tail", require.resolve.paths("global-pkg").slice(-3).join("|"));
    console.log("global package", require.resolve("global-pkg"), require("global-pkg"));
    Module.globalPaths.push("/mutated-global-path");
    console.log("global mutation", Module.globalPaths.includes("/mutated-global-path"), require.resolve.paths("global-pkg").includes("/mutated-global-path"));
    Module._initPaths();
    console.log("global reset", JSON.stringify(Module.globalPaths), require.resolve.paths("global-pkg").includes("/mutated-global-path"));
    console.log(Module.builtinModules === builtinModules);
    console.log("module order", Object.keys(Module).join(",") === expectedModuleKeys, Object.hasOwn(Module, "_builtinLibs"));
    console.log("module own order", Object.getOwnPropertyNames(Module).join(",") === expectedModuleOwnNames);
    console.log("builtin order", builtinModules.join(",") === expectedBuiltinModules, builtinModules.length, builtinModules[0], builtinModules.at(-1));
    console.log([
      Module.name,
      ["createRequire", "isBuiltin", "wrap", "registerHooks", "register", "enableCompileCache", "findPackageJSON", "flushCompileCache", "stripTypeScriptTypes"].map((name) => [
        name,
        Module[name].name,
        Module[name].length,
        Object.hasOwn(Module[name], "prototype")
      ].join(":")).join("|")
    ].join(":"));
    const wrapDescriptor = Object.getOwnPropertyDescriptor(Module, "wrap");
    console.log(wrapDescriptor.enumerable, wrapDescriptor.configurable, typeof wrapDescriptor.get, typeof wrapDescriptor.set, Object.keys(Module).includes("wrap"));
    console.log(findPackageJSON(".", import.meta.url));
    console.log(findPackageJSON("node:fs", import.meta.url) === undefined);
    const findPackageValidation = [];
    for (const [label, action] of [
      ["missing", () => findPackageJSON()],
      ["null-spec", () => findPackageJSON(null, import.meta.url)],
      ["number-spec", () => findPackageJSON(42, import.meta.url)],
      ["empty-spec", () => findPackageJSON("", import.meta.url)],
      ["symbol-spec", () => findPackageJSON(Symbol("x"), import.meta.url)],
      ["base-null", () => findPackageJSON(".", null)],
      ["base-number", () => findPackageJSON(".", 42)],
      ["base-url-object", () => findPackageJSON(".", new URL(import.meta.url))]
    ]) {
      try {
        findPackageValidation.push(label + ":ok:" + action());
      } catch (error) {
        findPackageValidation.push(label + ":" + error.name + ":" + error.code);
      }
    }
    console.log("findPackageJSON validation", findPackageValidation.join("|"));

    for (const [label, value] of [
      ["null", null],
      ["number", 42],
      ["boolean", true],
      ["function", function cacheDir() {}]
    ]) {
      try {
        enableCompileCache(value);
        console.log("compile cache invalid", label, "ok");
      } catch (error) {
        console.log("compile cache invalid", label, error.name, error.code);
      }
    }
    const firstCompileCache = enableCompileCache("/workspace/.cache");
    const secondCompileCache = enableCompileCache();
    console.log(firstCompileCache.status === Module.constants.compileCacheStatus.ENABLED);
    console.log(secondCompileCache.status === Module.constants.compileCacheStatus.ALREADY_ENABLED);
    console.log(getCompileCacheDir());
    console.log(Object.getPrototypeOf(Module.constants) === null, Object.getPrototypeOf(Module.constants.compileCacheStatus) === null);
    console.log(flushCompileCache(), syncBuiltinESMExports(), register("node:fs"));

    setSourceMapsSupport({ enabled: true, nodeModules: true });
    const sourceMaps = getSourceMapsSupport();
    console.log(sourceMaps.enabled, sourceMaps.nodeModules, sourceMaps.generatedCode);

    const hooks = registerHooks({ resolve() {}, load() {} });
    console.log(typeof hooks.deregister, typeof hooks.resolve, typeof hooks.load);
    console.log(
      Object.keys(hooks).join(","),
      Object.getOwnPropertyNames(hooks).join(","),
      Object.getPrototypeOf(hooks).constructor.name,
      Object.getOwnPropertyNames(Object.getPrototypeOf(hooks)).join(","),
      Object.keys(Object.getPrototypeOf(hooks)).join(",") || "<none>"
    );
    console.log(["resolve", "load"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(hooks, name);
      return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
    }).join("|"));
    const deregisterDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(hooks), "deregister");
    console.log(deregisterDescriptor.enumerable, deregisterDescriptor.configurable, deregisterDescriptor.writable, deregisterDescriptor.value.name, deregisterDescriptor.value.length, Object.hasOwn(deregisterDescriptor.value, "prototype"));
    hooks.deregister();
    console.log(Object.hasOwn(hooks, "active"), hooks.active, typeof hooks.resolve, typeof hooks.load);
    console.log(typeof registerHooks(1).deregister, typeof registerHooks("x").deregister, typeof registerHooks({}).deregister);
    for (const value of [undefined, null]) {
      try {
        registerHooks(value);
      } catch (error) {
        console.log(error.name, error.code ?? "none");
      }
    }
    for (const value of [{ resolve: 1 }, { load: 1 }]) {
      try {
        registerHooks(value);
      } catch (error) {
        console.log(error.code);
      }
    }
    const sourceMap = new SourceMap({ version: 3, sources: ["index.js"], names: [], mappings: "" });
    console.log(sourceMap.payload.version, JSON.stringify(sourceMap.findEntry(1, 0)), JSON.stringify(sourceMap.findOrigin(1, 0)));
    const mappedSourceMap = new SourceMap({ version: 3, file: "gen.js", sources: ["orig.js"], names: ["foo"], mappings: "AAAAA;AACA" });
    console.log("source map parsed", JSON.stringify(mappedSourceMap.findEntry(0, 0)), JSON.stringify(mappedSourceMap.findEntry(1, 0)), JSON.stringify(mappedSourceMap.findEntry(2, 0)), JSON.stringify(mappedSourceMap.findOrigin(2, 0)), JSON.stringify(mappedSourceMap.findOrigin(2, 1)));
    console.log("source map proto", Object.getOwnPropertyNames(SourceMap.prototype).join(","));
	    console.log("source map own", JSON.stringify(Object.getOwnPropertyNames(sourceMap)), JSON.stringify(Object.keys(sourceMap)));
	    console.log("source map descriptors", ["payload", "lineLengths"].map((name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(SourceMap.prototype, name);
	      return [name, descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, typeof descriptor.set].join(":");
	    }).join("|"));
	    const sourceMapSymbols = Object.getOwnPropertySymbols(SourceMap.prototype);
	    const sourceMapMappingsDescriptor = Object.getOwnPropertyDescriptor(SourceMap.prototype, sourceMapSymbols[0]);
	    console.log("source map symbols", sourceMapSymbols.map(String).join(","));
	    console.log("source map symbol descriptor", [typeof sourceMapMappingsDescriptor.get, sourceMapMappingsDescriptor.get.name, sourceMapMappingsDescriptor.get.length, typeof sourceMapMappingsDescriptor.set, sourceMapMappingsDescriptor.enumerable, sourceMapMappingsDescriptor.configurable, "writable" in sourceMapMappingsDescriptor].join(":"));
	    console.log("source map mappings", JSON.stringify(sourceMap[sourceMapSymbols[0]]), JSON.stringify(mappedSourceMap[sourceMapSymbols[0]]));
	    try {
	      SourceMap.prototype[sourceMapSymbols[0]];
	    } catch (error) {
	      console.log("source map prototype get", error.name, error.message.includes("private member"));
	    }
	    console.log("source map methods", SourceMap.prototype.findEntry.length, SourceMap.prototype.findOrigin.length, sourceMap.lineLengths);
    console.log(typeof Module._initPaths);
    Module._initPaths();

    const stripped = stripTypeScriptTypes("interface User { id: number }\\nconst user: User = { id: 1 };");
    console.log(stripped.includes("const user") && !stripped.includes("interface User"));
    const sourceMapped = stripTypeScriptTypes("const value: number = 1;", { sourceUrl: "file:///workspace/input.ts" });
    console.log(sourceMapped.includes("const value") && sourceMapped.endsWith("//# sourceURL=file:///workspace/input.ts"));
    console.log(stripTypeScriptTypes("const value: number = 1;", { mode: "strip" }).includes("const value"));
    for (const action of [
      () => stripTypeScriptTypes(42),
      () => stripTypeScriptTypes("const value: number = 1;", null),
      () => stripTypeScriptTypes("const value: number = 1;", 1),
      () => stripTypeScriptTypes("const value: number = 1;", { sourceUrl: 1 }),
      () => stripTypeScriptTypes("const value: number = 1;", { mode: "remove" }),
      () => stripTypeScriptTypes("enum Kind { A }", { mode: "transform" })
    ]) {
      try {
        action();
      } catch (error) {
        console.log(error.code);
      }
    }
    try {
      stripTypeScriptTypes("enum Kind { A }");
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true true false",
    "false true false true false true true true",
    "false true false true false true true false",
    "undefined function undefined object undefined object object object",
    "false false",
    "TypeError ERR_INVALID_ARG_TYPE",
    "TypeError ERR_INVALID_ARG_TYPE",
    "MODULE_NOT_FOUND,MODULE_NOT_FOUND,MODULE_NOT_FOUND",
    "shadow-test shadow-reporters shadow-sqlite",
    "function object object",
    "a/b",
    "file.txt",
    "missing:TypeError:ERR_INVALID_ARG_VALUE|number:TypeError:ERR_INVALID_ARG_VALUE|relative:TypeError:ERR_INVALID_ARG_VALUE|data-url-object:TypeError:ERR_INVALID_ARG_VALUE|file-url-string:ok:function|file-url-object:ok:function|abs-path:ok:function",
    "global paths [\"/home/opencontainers/.node_modules\",\"/home/opencontainers/.node_libraries\",\"/lib/node\"]",
    "resolve paths global tail /home/opencontainers/.node_modules|/home/opencontainers/.node_libraries|/lib/node",
    "global package /home/opencontainers/.node_modules/global-pkg/index.js global-home",
    "global mutation true false",
    "global reset [\"/home/opencontainers/.node_modules\",\"/home/opencontainers/.node_libraries\",\"/lib/node\"] false",
    "true",
    "module order true false",
    "module own order true",
    "builtin order true 66 _http_agent node:test/reporters",
    "Module:createRequire:createRequire:1:true|isBuiltin:isBuiltin:1:false|wrap:wrap:1:true|registerHooks:registerHooks:1:true|register:register:1:true|enableCompileCache:enableCompileCache:1:true|findPackageJSON:findPackageJSON:1:true|flushCompileCache:flushCompileCache:0:false|stripTypeScriptTypes:stripTypeScriptTypes:1:true",
    "false false function function false",
    "/workspace/package.json",
    "true",
    "findPackageJSON validation missing:TypeError:ERR_MISSING_ARGS|null-spec:Error:ERR_MODULE_NOT_FOUND|number-spec:Error:ERR_MODULE_NOT_FOUND|empty-spec:Error:ERR_MODULE_NOT_FOUND|symbol-spec:TypeError:ERR_INVALID_ARG_TYPE|base-null:TypeError:ERR_INVALID_ARG_TYPE|base-number:TypeError:ERR_INVALID_ARG_TYPE|base-url-object:ok:/workspace/package.json",
    "compile cache invalid null TypeError ERR_INVALID_ARG_TYPE",
    "compile cache invalid number TypeError ERR_INVALID_ARG_TYPE",
    "compile cache invalid boolean TypeError ERR_INVALID_ARG_TYPE",
    "compile cache invalid function TypeError ERR_INVALID_ARG_TYPE",
    "true",
    "true",
    "/workspace/.cache",
    "true true",
    "undefined undefined undefined",
    "true true false",
    "function function function",
    "resolve,load resolve,load ModuleHooks constructor,deregister <none>",
    "resolve:true:false:false:function:resolve:0:false|load:true:false:false:function:load:0:false",
    "false true true deregister 0 false",
    "false undefined function function",
    "function function function",
    "TypeError none",
    "TypeError none",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "3 {} {}",
    "source map parsed {\"generatedLine\":0,\"generatedColumn\":0,\"originalSource\":\"orig.js\",\"originalLine\":0,\"originalColumn\":0,\"name\":\"foo\"} {\"generatedLine\":1,\"generatedColumn\":0,\"originalSource\":\"orig.js\",\"originalLine\":1,\"originalColumn\":0,\"name\":\"foo\"} {\"generatedLine\":1,\"generatedColumn\":0,\"originalSource\":\"orig.js\",\"originalLine\":1,\"originalColumn\":0,\"name\":\"foo\"} {\"name\":\"foo\",\"fileName\":\"orig.js\",\"lineNumber\":2,\"columnNumber\":0} {\"name\":\"foo\",\"fileName\":\"orig.js\",\"lineNumber\":2,\"columnNumber\":1}",
	    "source map proto constructor,payload,lineLengths,findEntry,findOrigin",
	    "source map own [] []",
	    "source map descriptors payload:false:true:get payload:0:undefined|lineLengths:false:true:get lineLengths:0:undefined",
	    "source map symbols Symbol(kMappings)",
	    "source map symbol descriptor function:get [kMappings]:0:undefined:false:true:false",
	    "source map mappings [] [[0,0,\"orig.js\",0,0,\"foo\"],[1,0,\"orig.js\",1,0,\"foo\"]]",
	    "source map prototype get TypeError true",
	    "source map methods 2 2 undefined",
    "function",
    "true",
    "true",
    "true",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX"
  ]);
});

test("node:module globalPaths honor virtual HOME and NODE_PATH", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/node-path-root/nodepath-pkg", { recursive: true });
  kernel.fs.writeFileSync("/node-path-root/nodepath-pkg/package.json", JSON.stringify({
    name: "nodepath-pkg",
    main: "main.js"
  }));
  kernel.fs.writeFileSync("/node-path-root/nodepath-pkg/main.js", "module.exports = 'node-path';");
  kernel.fs.writeFileSync("/workspace/index.js", `
    const Module = require("node:module");
    const requireFromWorkspace = Module.createRequire("/workspace/index.js");
    console.log(JSON.stringify(Module.globalPaths));
    console.log(requireFromWorkspace.resolve.paths("nodepath-pkg").slice(-5).join("|"));
    console.log(requireFromWorkspace.resolve("nodepath-pkg"));
    console.log(requireFromWorkspace("nodepath-pkg"));
    Module.globalPaths.push("/mutated");
    Module._initPaths();
    console.log(JSON.stringify(Module.globalPaths));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], {
    cwd: "/workspace",
    env: {
      HOME: "/home/demo",
      NODE_PATH: "/node-path-root:/second-root"
    }
  });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "[\"/node-path-root\",\"/second-root\",\"/home/demo/.node_modules\",\"/home/demo/.node_libraries\",\"/lib/node\"]",
    "/node-path-root|/second-root|/home/demo/.node_modules|/home/demo/.node_libraries|/lib/node",
    "/node-path-root/nodepath-pkg/main.js",
    "node-path",
    "[\"/node-path-root\",\"/second-root\",\"/home/demo/.node_modules\",\"/home/demo/.node_libraries\",\"/lib/node\"]"
  ]);
});

test("node:module exposes CommonJS compatibility resolution hooks", async () => {
  const kernel = new Kernel();
  kernel.fs.mkdirSync("/workspace/lib", { recursive: true });
  kernel.fs.writeFileSync("/workspace/lib/value.js", "module.exports = 42;");
  kernel.fs.mkdirSync("/workspace/pkg", { recursive: true });
  kernel.fs.writeFileSync("/workspace/pkg/package.json", JSON.stringify({
    name: "demo",
    main: "main.js",
    type: "module",
    exports: { ".": "./main.js" },
    imports: { "#x": "./x.js" }
  }));
  kernel.fs.mkdirSync("/workspace/isolated/node_modules/pkg", { recursive: true });
  kernel.fs.writeFileSync("/workspace/isolated/node_modules/pkg/index.js", "module.exports = 'isolated';");
  kernel.fs.writeFileSync("/workspace/index.js", `
    import Module, { createRequire } from "node:module";

    const require = createRequire(import.meta.url);
    const resolved = require.resolve("./lib/value");
    const describeResolve = (action) => {
      try {
        return "ok:" + action();
      } catch (error) {
        return error.name + ":" + error.code;
      }
    };
    console.log(resolved);
    console.log(require("./lib/value"));
    console.log(Array.isArray(require.resolve.paths("pkg")));
    console.log(require.resolve.paths("node:fs"));
    console.log("require resolve meta", require.resolve.length, require.resolve.name, Object.hasOwn(require.resolve, "prototype"), require.resolve.paths.length, require.resolve.paths.name, Object.hasOwn(require.resolve.paths, "prototype"));
    console.log("explicit resolve", require.resolve("pkg", { paths: ["/workspace/isolated"] }));
    console.log("explicit node_modules resolve", require.resolve("pkg", { paths: ["/workspace/isolated/node_modules"] }));
    console.log("explicit filename", Module._resolveFilename("pkg", { filename: "/workspace/index.js" }, false, { paths: ["/workspace/isolated"] }));
    console.log("explicit builtin", require.resolve("node:fs", { paths: [1] }));
    console.log("explicit validation", [
      () => require.resolve("pkg"),
      () => require.resolve("pkg", { paths: null }),
      () => require.resolve("pkg", { paths: 1 }),
      () => require.resolve("pkg", { paths: "x" }),
      () => require.resolve("pkg", { paths: {} }),
      () => require.resolve("pkg", { paths: [1] }),
      () => require.resolve("pkg", { paths: [null] }),
      () => require.resolve("pkg", { paths: [] }),
      () => require.resolve("pkg", { paths: undefined })
    ].map(describeResolve).join("|"));
    console.log(typeof require.extensions[".js"], typeof Module._extensions[".json"]);
    console.log(Module._resolveFilename("./lib/value", { filename: "/workspace/index.js" }));
    console.log(Module._load("./lib/value", { filename: "/workspace/index.js" }));
    console.log(Array.isArray(Module.wrapper), Module.wrap("x") === Module.wrapper[0] + "x" + Module.wrapper[1]);
    const originalWrapper = Module.wrapper;
    Module.wrapper = ["<", ">"];
    console.log(Module.wrap("x"));
    Module.wrapper = originalWrapper;
    console.log(Module._nodeModulePaths("/workspace/src").join("|"));
    console.log("resolver lengths", Module._resolveFilename.length, Module._load.length, Module._nodeModulePaths.length, Module._resolveLookupPaths.length, Module._findPath.length);
    console.log("private helper metadata", ["_findPath", "_nodeModulePaths", "_resolveLookupPaths", "_load", "_resolveFilename", "_initPaths", "_preloadModules"].map((name) => {
      const fn = Module[name];
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      let constructable = false;
      try {
        constructable = Reflect.construct(Object, [], fn) instanceof fn;
      } catch {}
      return [name, fn.name, fn.length, Object.hasOwn(fn, "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(","), constructable].join(":");
    }).join("|"));
    console.log("private lengths", Module._stat.length, Module._readPackage.length);
    console.log("private descriptors", ["_stat", "_readPackage"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(Module, name);
      const fn = Module[name];
      return [name, descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, descriptor.set.name, descriptor.set.length, fn.name, fn.length, Object.hasOwn(fn, "prototype")].join(":");
    }).join("|"));
    console.log("private keys", Object.keys(Module).includes("_stat"), Object.keys(Module).includes("_readPackage"));
    console.log("stat", Module._stat("/workspace/lib/value.js"), Module._stat("/workspace/pkg"), Module._stat("/workspace/missing"));
    const packageInfo = Module._readPackage("/workspace/pkg");
    console.log("package", packageInfo.name, packageInfo.main, packageInfo.type, packageInfo.exists, packageInfo.pjsonPath, packageInfo.exports["."], packageInfo.imports["#x"]);
    const missingPackage = Module._readPackage("/workspace/missing");
    console.log("missing package", missingPackage.type, missingPackage.exists, missingPackage.pjsonPath);

    const prototypeMethods = ["load", "require", "_compile"];
    const prototypeAccessors = ["constructor", "isPreloading", "parent"];
    console.log("prototype names", Object.getOwnPropertyNames(Module.prototype).join(","));
    console.log("prototype keys", Object.keys(Module.prototype).join(","));
    console.log("prototype methods", prototypeMethods.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(Module.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|"));
    console.log("prototype accessors", prototypeAccessors.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(Module.prototype, name);
      return [
        name,
        descriptor.enumerable,
        descriptor.configurable,
        descriptor.get.name,
        descriptor.get.length,
        Object.hasOwn(descriptor.get, "prototype"),
        descriptor.set?.name ?? "undefined",
        descriptor.set?.length ?? "undefined",
        descriptor.set ? Object.hasOwn(descriptor.set, "prototype") : "undefined"
      ].join(":");
    }).join("|"));
    const manual = new Module("/workspace/manual.js");
    console.log("manual state", manual.loaded, Array.isArray(manual.children), Object.keys(manual).includes("parent"), manual.parent, manual.isPreloading);
    console.log("manual require", typeof manual.require("node:path").join);
    manual._compile('module.exports = require("./lib/value") + 1;', "/workspace/manual.js");
    console.log("manual compile", manual.exports);
    const loaded = new Module("/workspace/lib/value.js");
    console.log("manual load", loaded.load("/workspace/lib/value.js"), loaded.exports, loaded.loaded);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "/workspace/lib/value.js",
    "42",
    "true",
    "null",
    "require resolve meta 2 resolve true 1 paths true",
    "explicit resolve /workspace/isolated/node_modules/pkg/index.js",
    "explicit node_modules resolve /workspace/isolated/node_modules/pkg/index.js",
    "explicit filename /workspace/isolated/node_modules/pkg/index.js",
    "explicit builtin node:fs",
    "explicit validation Error:MODULE_NOT_FOUND|TypeError:ERR_INVALID_ARG_VALUE|TypeError:ERR_INVALID_ARG_VALUE|TypeError:ERR_INVALID_ARG_VALUE|TypeError:ERR_INVALID_ARG_VALUE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|Error:MODULE_NOT_FOUND|Error:MODULE_NOT_FOUND",
    "function function",
    "/workspace/lib/value.js",
    "42",
    "true true",
    "<x>",
    "/workspace/src/node_modules|/workspace/node_modules|/node_modules",
    "resolver lengths 4 3 1 2 3",
    "private helper metadata _findPath::3:true:false:false:true:constructor:true|_nodeModulePaths::1:true:false:false:true:constructor:true|_resolveLookupPaths::2:true:false:false:true:constructor:true|_load::3:true:false:false:true:constructor:true|_resolveFilename::4:true:false:false:true:constructor:true|_initPaths::0:true:false:false:true:constructor:true|_preloadModules::1:true:false:false:true:constructor:true",
    "private lengths 1 1",
    "private descriptors _stat:false:true:get:0:set:1:stat:1:true|_readPackage:false:true:get:0:set:1:_readPackage:1:false",
    "private keys false false",
    "stat 0 1 -2",
    "package demo main.js module true /workspace/pkg/package.json ./main.js ./x.js",
    "missing package none false /workspace/missing/package.json",
    "prototype names constructor,isPreloading,parent,load,require,_compile",
    "prototype keys load,require,_compile",
    "prototype methods load::1:true:true:true|require::1:true:true:true|_compile::3:true:true:true",
    "prototype accessors constructor:false:false:get:0:true:undefined:undefined:undefined|isPreloading:false:false:get:0:false:undefined:undefined:undefined|parent:false:false:deprecated:0:true:deprecated:1:true",
    "manual state false true false undefined false",
    "manual require function",
    "manual compile 43",
    "manual load undefined 42 true"
  ]);
});

test("node:module executes registerHooks resolve/load for CommonJS require", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/real.cjs", "module.exports = 'real';");
  kernel.fs.writeFileSync("/workspace/index.js", `
    const { registerHooks } = require("node:module");

    const order = [];
    let resolveContextOk = false;
    let loadContextOk = false;
    const first = registerHooks({
      resolve(specifier, context, nextResolve) {
        order.push("r1:" + specifier);
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        order.push("l1:" + (url.endsWith("/real.cjs") ? "real" : url));
        return nextLoad(url, context);
      }
    });
    const second = registerHooks({
      resolve(specifier, context, nextResolve) {
        order.push("r2:" + specifier);
        if (specifier === "virtual:answer") {
          resolveContextOk = Object.keys(context).sort().join(",") === "conditions,importAttributes,parentURL"
            && context.conditions.join(",") === "require,node,node-addons,module-sync"
            && context.parentURL.endsWith("/index.js");
          return { url: "virtual:answer", shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        order.push("l2:" + (url.endsWith("/real.cjs") ? "real" : url));
        if (url === "virtual:answer") {
          loadContextOk = Object.keys(context).sort().join(",") === "conditions,format,importAttributes"
            && context.conditions.join(",") === "require,node,node-addons,module-sync"
            && context.format === undefined
            && !("parentURL" in context);
          return { format: "commonjs", source: "module.exports = 42;", shortCircuit: true };
        }
        return nextLoad(url, context);
      }
    });

    console.log(require("./real.cjs"));
    console.log(order.join("|"));
    order.length = 0;
    console.log(require("virtual:answer"));
    console.log(order.join("|"));
    console.log(resolveContextOk, loadContextOk);
    second.deregister();
    second.deregister();
    delete require.cache["virtual:answer"];
    try {
      require("virtual:answer");
    } catch (error) {
      console.log(error.code);
    }
    first.deregister();

    const sourceText = {
      "virtual:buffer": "module.exports = 'buffer';",
      "virtual:uint8": "module.exports = 'uint8';",
      "virtual:arraybuffer": "module.exports = 'arraybuffer';"
    };
    const binaryHook = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (Object.prototype.hasOwnProperty.call(sourceText, specifier)) return { url: specifier, shortCircuit: true };
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url === "virtual:buffer") return { format: "commonjs", source: Buffer.from(sourceText[url]), shortCircuit: true };
        if (url === "virtual:uint8") return { format: "commonjs", source: Uint8Array.from(sourceText[url], (char) => char.charCodeAt(0)), shortCircuit: true };
        if (url === "virtual:arraybuffer") return { format: "commonjs", source: Uint8Array.from(sourceText[url], (char) => char.charCodeAt(0)).buffer, shortCircuit: true };
        return nextLoad(url, context);
      }
    });
    console.log([
      require("virtual:buffer"),
      require("virtual:uint8"),
      require("virtual:arraybuffer")
    ].join(","));
    binaryHook.deregister();

    for (const [label, specifier, hooks] of [
      ["resolve-short", "bad:short", {
        resolve(value) {
          if (value === "bad:short") return { url: "bad:short" };
        }
      }],
      ["resolve-url", "bad:url", {
        resolve(value) {
          if (value === "bad:url") return { url: 42, shortCircuit: true };
        }
      }],
      ["load-source", "bad:source", {
        resolve(value) {
          if (value === "bad:source") return { url: "bad:source", shortCircuit: true };
        },
        load(url) {
          if (url === "bad:source") return { format: "commonjs", source: null, shortCircuit: true };
        }
      }]
    ]) {
      const hook = registerHooks(hooks);
      try {
        require(specifier);
      } catch (error) {
        console.log(label + ":" + error.code);
      }
      hook.deregister();
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "real",
    "r2:./real.cjs|r1:./real.cjs|l2:real|l1:real",
    "42",
    "r2:virtual:answer|l2:virtual:answer",
    "true true",
    "MODULE_NOT_FOUND",
    "buffer,uint8,arraybuffer",
    "resolve-short:ERR_INVALID_RETURN_PROPERTY_VALUE",
    "resolve-url:ERR_INVALID_RETURN_PROPERTY_VALUE",
    "load-source:ERR_INVALID_RETURN_PROPERTY_VALUE"
  ]);
});

test("node:module executes registerHooks resolve/load for dynamic ESM import", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/real.mjs", "export default 'real-esm';");
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import { registerHooks } from "node:module";

    const order = [];
    let resolveContextOk = false;
    let loadContextOk = false;
    const first = registerHooks({
      resolve(specifier, context, nextResolve) {
        order.push("r1:" + specifier);
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        order.push("l1:" + (url.endsWith("/real.mjs") ? "real" : url));
        return nextLoad(url, context);
      }
    });
    const second = registerHooks({
      resolve(specifier, context, nextResolve) {
        order.push("r2:" + specifier);
        if (specifier === "virtual:esm") {
          resolveContextOk = Object.keys(context).sort().join(",") === "conditions,importAttributes,parentURL"
            && context.conditions.join(",") === "node,import,module-sync,node-addons"
            && context.parentURL.endsWith("/index.mjs");
          return { url: "virtual:esm", format: "module", shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        order.push("l2:" + (url.endsWith("/real.mjs") ? "real" : url));
        if (url === "virtual:esm") {
          loadContextOk = Object.keys(context).sort().join(",") === "conditions,format,importAttributes"
            && context.conditions.join(",") === "node,import,module-sync,node-addons"
            && context.format === "module"
            && !("parentURL" in context);
          return { format: "module", source: "export const answer = 42;\\nexport default answer + 1;", shortCircuit: true };
        }
        return nextLoad(url, context);
      }
    });

    const real = await import("./real.mjs");
    console.log(real.default);
    console.log(order.join("|"));
    order.length = 0;
    const virtual = await import("virtual:esm");
    console.log(virtual.answer, virtual.default);
    console.log(order.join("|"));
    console.log(resolveContextOk, loadContextOk);
    second.deregister();
    second.deregister();
    try {
      await import("virtual:esm?again");
    } catch (error) {
      console.log(error.code);
    }
    first.deregister();

    for (const [label, specifier, hooks] of [
      ["resolve-short", "bad:short", {
        resolve(value) {
          if (value === "bad:short") return { url: "bad:short", format: "module" };
        }
      }],
      ["load-source", "bad:source", {
        resolve(value) {
          if (value === "bad:source") return { url: "bad:source", format: "module", shortCircuit: true };
        },
        load(url) {
          if (url === "bad:source") return { format: "module", source: null, shortCircuit: true };
        }
      }]
    ]) {
      const hook = registerHooks(hooks);
      try {
        await import(specifier);
      } catch (error) {
        console.log(label + ":" + error.code);
      }
      hook.deregister();
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "real-esm",
    "r2:./real.mjs|r1:./real.mjs|l2:real|l1:real",
    "42 43",
    "r2:virtual:esm|l2:virtual:esm",
    "true true",
    "MODULE_NOT_FOUND",
    "resolve-short:ERR_INVALID_RETURN_PROPERTY_VALUE",
    "load-source:ERR_INVALID_RETURN_PROPERTY_VALUE"
  ]);
});

test("node:module register installs loader hooks for dynamic ESM import", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/registered-loader.mjs", `
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "virtual:registered-file") {
        globalThis.__registeredHookRows.push("file-r:" + specifier + ":" + context.parentURL.endsWith("/index.mjs"));
        return { url: "virtual:registered-file", format: "module", shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }

    export async function load(url, context, nextLoad) {
      if (url === "virtual:registered-file") {
        globalThis.__registeredHookRows.push("file-l:" + url + ":" + context.format);
        return { format: "module", source: "export default 77;", shortCircuit: true };
      }
      return nextLoad(url, context);
    }
  `);
  kernel.fs.writeFileSync("/workspace/index.mjs", `
    import { register } from "node:module";

    globalThis.__registeredHookRows = [];
    const loader = \`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === "virtual:registered-data") {
          globalThis.__registeredHookRows.push("data-r:" + specifier + ":" + context.conditions.join(",") + ":" + context.parentURL.endsWith("/index.mjs"));
          return { url: "virtual:registered-data", format: "module", shortCircuit: true };
        }
        return nextResolve(specifier, context);
      }

      export async function load(url, context, nextLoad) {
        if (url === "virtual:registered-data") {
          globalThis.__registeredHookRows.push("data-l:" + url + ":" + context.format);
          return { format: "module", source: "export const value = 44;\\\\nexport default value + 1;", shortCircuit: true };
        }
        return nextLoad(url, context);
      }
    \`;

    console.log(register("data:text/javascript," + encodeURIComponent(loader)));
    const dataModule = await import("virtual:registered-data");
    console.log(dataModule.value, dataModule.default);
    console.log(register("./registered-loader.mjs", import.meta.url));
    const fileModule = await import("virtual:registered-file");
    console.log(fileModule.default);
    console.log(globalThis.__registeredHookRows.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "undefined",
    "44 45",
    "undefined",
    "77",
    "data-r:virtual:registered-data:node,import,module-sync,node-addons:true|data-l:virtual:registered-data:module|file-r:virtual:registered-file:true|file-l:virtual:registered-file:module"
  ]);
});

test("deprecated internal HTTP/TLS modules and node:sea expose package probe surfaces", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const Module = require("node:module");
    const http = require("node:http");
    const tls = require("node:tls");

    console.log(Module.isBuiltin("_http_agent"), Module.isBuiltin("node:_http_agent"), Module.builtinModules.includes("_http_agent"), Module.builtinModules.includes("node:_http_agent"));
    console.log(Module.isBuiltin("_tls_common"), Module.isBuiltin("node:_tls_common"), Module.builtinModules.includes("_tls_common"), Module.builtinModules.includes("node:_tls_common"));
    console.log(Module.isBuiltin("sea"), Module.isBuiltin("node:sea"), Module.builtinModules.includes("sea"), Module.builtinModules.includes("node:sea"));
    console.log(typeof process.getBuiltinModule("sea"), typeof process.getBuiltinModule("node:sea"));

    const httpAgent = require("node:_http_agent");
    const httpClient = require("_http_client");
    const httpIncoming = require("node:_http_incoming");
    const httpOutgoing = require("node:_http_outgoing");
    const httpServer = require("node:_http_server");
    const httpCommon = require("node:_http_common");
    const tlsCommon = require("node:_tls_common");
    const tlsWrap = require("_tls_wrap");
    console.log("common keys", Object.keys(httpCommon).join(","));
    console.log("outgoing keys", Object.keys(httpOutgoing).join(","));
    console.log("server keys", Object.keys(httpServer).join(","));
    console.log("tls wrap keys", Object.keys(tlsWrap).join(","));
    console.log("parser metadata", httpCommon.HTTPParser.name, httpCommon.HTTPParser.length, Object.keys(httpCommon.HTTPParser.prototype).join(","));
    console.log("parser prototype names", Object.getOwnPropertyNames(httpCommon.HTTPParser.prototype).join(","));
    console.log("parser prototype descriptors", ["constructor", "execute", "initialize", "close", "free", "getCurrentBuffer"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(httpCommon.HTTPParser.prototype, name);
      return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
    }).join("|"));
    console.log("common metadata", httpCommon.freeParser.length, httpCommon.calculateLenientFlags.length, httpCommon.prepareError.length, String(httpCommon.kIncomingMessage), String(httpCommon.kSkipPendingData));
    const parsersDescriptor = Object.getOwnPropertyDescriptor(httpCommon, "parsers");
    console.log("parser pool metadata", ["parsers", parsersDescriptor.enumerable, parsersDescriptor.configurable, parsersDescriptor.writable, typeof parsersDescriptor.value, parsersDescriptor.value.name, parsersDescriptor.value.length ?? "", Object.hasOwn(parsersDescriptor.value, "prototype")].join(":"));
    console.log("server metadata", httpServer.storeHTTPOptions.length, String(httpServer.kServerResponse), String(httpServer.kConnectionsCheckingInterval));
    function functionPrototypeRows(namespace, names) {
      return names.map((name) => {
        const fn = namespace[name];
        const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        return [
          name,
          fn.name,
          fn.length,
          Object.hasOwn(fn, "prototype"),
          descriptor?.enumerable,
          descriptor?.configurable,
          descriptor?.writable,
          Object.getOwnPropertyNames(descriptor?.value ?? {}).join(","),
          descriptor?.value?.constructor === fn
        ].join(":");
      }).join("|");
    }
    console.log("common helper prototypes", functionPrototypeRows(httpCommon, ["freeParser", "isLenient", "calculateLenientFlags", "prepareError"]));
    console.log("incoming helper prototypes", functionPrototypeRows(httpIncoming, ["readStart", "readStop"]));
    console.log("outgoing helper prototypes", functionPrototypeRows(httpOutgoing, ["parseUniqueHeadersOption"]));
    console.log("server helper prototypes", functionPrototypeRows(httpServer, ["setupConnectionsTracking", "storeHTTPOptions", "httpServerPreClose"]));
    console.log("tls helper prototypes", functionPrototypeRows(tlsCommon, ["translatePeerCertificate"]));
    function agentMetadata(agent) {
      return [
        Object.keys(agent).join(","),
        Object.keys(agent.options).join(","),
        agent.keepAliveMsecs,
        agent.keepAlive,
        String(agent.maxSockets),
        agent.maxFreeSockets,
        agent.scheduling,
        String(agent.maxTotalSockets),
        agent.totalSocketCount,
        agent.agentKeepAliveTimeoutBuffer
      ].join(":");
    }
    const customAgent = new httpAgent.Agent({ keepAliveMsecs: 12, maxSockets: 3, maxFreeSockets: 4, scheduling: "fifo", maxTotalSockets: 5, agentKeepAliveTimeoutBuffer: 7 });
    console.log("agent metadata", [agentMetadata(httpAgent.globalAgent), agentMetadata(customAgent)].join("|"));
    function incomingPrototypeDescriptorRows(names) {
      return names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(httpIncoming.IncomingMessage.prototype, name);
        if ("value" in descriptor) {
          return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
        }
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          typeof descriptor.get,
          descriptor.get.name,
          descriptor.get.length,
          typeof descriptor.set,
          descriptor.set?.name ?? "",
          descriptor.set?.length ?? "",
          Object.hasOwn(descriptor.get, "prototype"),
          descriptor.set ? Object.hasOwn(descriptor.set, "prototype") : ""
        ].join(":");
      }).join("|");
    }
    console.log("incoming prototype names", Object.getOwnPropertyNames(httpIncoming.IncomingMessage.prototype).join(","));
    console.log("incoming prototype keys", Object.keys(httpIncoming.IncomingMessage.prototype).join(","));
    console.log("incoming prototype descriptors", incomingPrototypeDescriptorRows(["connection", "headers", "headersDistinct", "trailers", "trailersDistinct", "signal", "setTimeout", "_read", "_destroy", "_addHeaderLines", "_addHeaderLine", "_addHeaderLineDistinct", "_dumpAndCloseReadable", "_dump"]));
    const incomingMessage = new httpIncoming.IncomingMessage({
      headers: [["A", "1"], ["A", "2"], ["Cookie", "a"], ["Cookie", "b"], ["Set-Cookie", "x"], ["Set-Cookie", "y"]],
      trailers: [["T", "1"], ["T", "2"]],
      port: 8080
    });
    const joinedHeaders = {};
    incomingMessage._addHeaderLine("Host", "one", joinedHeaders);
    incomingMessage._addHeaderLine("Host", "two", joinedHeaders);
    incomingMessage._addHeaderLine("Cookie", "a", joinedHeaders);
    incomingMessage._addHeaderLine("Cookie", "b", joinedHeaders);
    incomingMessage._addHeaderLine("Set-Cookie", "x", joinedHeaders);
    incomingMessage._addHeaderLine("Set-Cookie", "y", joinedHeaders);
    incomingMessage._addHeaderLine("X-Test", "left", joinedHeaders);
    incomingMessage._addHeaderLine("X-Test", "right", joinedHeaders);
    const distinctHeaders = Object.create(null);
    incomingMessage._addHeaderLineDistinct("X-Test", "left", distinctHeaders);
    incomingMessage._addHeaderLineDistinct("X-Test", "right", distinctHeaders);
    const parsedHeaders = new httpIncoming.IncomingMessage({ headers: [], port: 8080 });
    parsedHeaders._addHeaderLines(["A", "1", "A", "2", "C", "3"], 4);
    console.log("incoming header helpers", JSON.stringify([incomingMessage.headers, incomingMessage.headersDistinct, incomingMessage.trailers, incomingMessage.trailersDistinct, joinedHeaders, distinctHeaders, parsedHeaders.rawHeaders, parsedHeaders.headers, parsedHeaders.headersDistinct]));
    console.log(httpAgent.Agent === http.Agent, httpAgent.globalAgent === http.globalAgent, httpClient.ClientRequest === http.ClientRequest);
    console.log(httpIncoming.IncomingMessage === http.IncomingMessage, httpOutgoing.OutgoingMessage === http.OutgoingMessage, httpServer.Server === http.Server, httpServer.ServerResponse === http.ServerResponse);
    console.log(httpCommon._checkIsHttpToken("content-type"), httpCommon._checkIsHttpToken("bad header"), httpCommon._checkInvalidHeaderChar("ok\\nno"));
    const parser = new httpCommon.HTTPParser(httpCommon.HTTPParser.REQUEST);
    console.log(httpCommon.HTTPParser.REQUEST, httpCommon.HTTPParser.RESPONSE, typeof parser.execute, parser.execute(Buffer.from("GET / HTTP/1.1\\r\\n\\r\\n")));
    const unique = httpOutgoing.parseUniqueHeadersOption(["Host", "HOST", "X-Test"]);
    console.log(unique instanceof Set, Array.from(unique).sort().join(","));

    console.log(tlsCommon.SecureContext === tls.SecureContext, tlsCommon.createSecureContext === tls.createSecureContext, typeof tlsCommon.translatePeerCertificate({ subject: "x" }));
    console.log(tlsWrap.Server === tls.Server, tlsWrap.TLSSocket === tls.TLSSocket, tlsWrap.connect === tls.connect, tlsWrap.createServer === tls.createServer);

    const sea = require("node:sea");
    console.log(sea.isSea(), Object.keys(sea).join(","));
    console.log(["getAsset", "getAssetAsBlob", "getRawAsset", "getAssetKeys", "isSea"].map((key) => key + ":" + sea[key].name + ":" + sea[key].length + ":" + Object.hasOwn(sea[key], "prototype")).join("|"));
    console.log(Object.keys(sea).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(sea, key);
      return key + ":" + descriptor.enumerable + ":" + descriptor.configurable + ":" + descriptor.writable;
    }).join("|"));
    try {
      require("sea");
    } catch (error) {
      console.log(error.code);
    }
    const seaErrors = [];
    const seaValidationErrors = [];
    for (const [key, args] of [
      ["getAsset", ["missing"]],
      ["getAssetAsBlob", ["missing"]],
      ["getRawAsset", ["missing"]],
      ["getAssetKeys", []]
    ]) {
      try {
        sea[key](...args);
      } catch (error) {
        seaErrors.push([key, error.code, error.message, String(error)].join(":"));
      }
    }
    console.log(seaErrors.join("|"));
    for (const [key, args] of [
      ["getAsset", []],
      ["getAsset", [1]],
      ["getAsset", [Symbol("x")]],
      ["getAsset", [true]],
      ["getAsset", [1n]],
      ["getAsset", ["missing", 1]],
      ["getAsset", ["missing", null]],
      ["getAsset", ["missing", Symbol("x")]],
      ["getAssetAsBlob", []],
      ["getAssetAsBlob", [Symbol("x")]],
      ["getRawAsset", []],
      ["getRawAsset", [Symbol("x")]]
    ]) {
      try {
        sea[key](...args);
      } catch (error) {
        seaValidationErrors.push([key, error.code, error.message, String(error)].join(":"));
      }
    }
    console.log(seaValidationErrors.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true true false",
    "true true true false",
    "false true false true",
    "undefined object",
    "common keys _checkInvalidHeaderChar,_checkIsHttpToken,chunkExpression,continueExpression,CRLF,freeParser,methods,parsers,kIncomingMessage,HTTPParser,isLenient,calculateLenientFlags,prepareError,kSkipPendingData",
    "outgoing keys kHighWaterMark,kUniqueHeaders,parseUniqueHeadersOption,validateHeaderName,validateHeaderValue,OutgoingMessage",
    "server keys STATUS_CODES,Server,ServerResponse,setupConnectionsTracking,storeHTTPOptions,_connectionListener,kServerResponse,httpServerPreClose,kConnectionsCheckingInterval",
    "tls wrap keys TLSSocket,Server,createServer,connect",
    "parser metadata HTTPParser 0 close,free,remove,execute,finish,initialize,pause,resume,consume,unconsume,getCurrentBuffer",
    "parser prototype names close,free,remove,execute,finish,initialize,pause,resume,consume,unconsume,getCurrentBuffer,constructor",
    "parser prototype descriptors constructor:false:true:true:HTTPParser:0:true|execute:true:true:true:execute:0:false|initialize:true:true:true:initialize:0:false|close:true:true:true:close:0:false|free:true:true:true:free:0:false|getCurrentBuffer:true:true:true:getCurrentBuffer:0:false",
    "common metadata 3 2 3 Symbol(IncomingMessage) Symbol(SkipPendingData)",
    "parser pool metadata parsers:true:true:true:object:parsers::false",
    "server metadata 1 Symbol(ServerResponse) Symbol(http.server.connectionsCheckingInterval)",
    "common helper prototypes freeParser:freeParser:3:true:false:false:true:constructor:true|isLenient:isLenient:0:true:false:false:true:constructor:true|calculateLenientFlags:calculateLenientFlags:2:true:false:false:true:constructor:true|prepareError:prepareError:3:true:false:false:true:constructor:true",
    "incoming helper prototypes readStart:readStart:1:true:false:false:true:constructor:true|readStop:readStop:1:true:false:false:true:constructor:true",
    "outgoing helper prototypes parseUniqueHeadersOption:parseUniqueHeadersOption:1:true:false:false:true:constructor:true",
    "server helper prototypes setupConnectionsTracking:setupConnectionsTracking:0:true:false:false:true:constructor:true|storeHTTPOptions:storeHTTPOptions:1:true:false:false:true:constructor:true|httpServerPreClose:httpServerPreClose:1:true:false:false:true:constructor:true",
    "tls helper prototypes translatePeerCertificate:translatePeerCertificate:1:true:false:false:true:constructor:true",
    "agent metadata _events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer:keepAlive,scheduling,timeout,proxyEnv,noDelay,path:1000:true:Infinity:256:lifo:Infinity:0:1000|_events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer:keepAliveMsecs,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,agentKeepAliveTimeoutBuffer,noDelay,path:12:false:3:4:fifo:5:0:7",
    "incoming prototype names constructor,connection,headers,headersDistinct,trailers,trailersDistinct,signal,setTimeout,_read,_destroy,_addHeaderLines,_addHeaderLine,_addHeaderLineDistinct,_dumpAndCloseReadable,_dump",
    "incoming prototype keys setTimeout,_read,_destroy,_addHeaderLines,_addHeaderLine,_addHeaderLineDistinct,_dumpAndCloseReadable,_dump",
    "incoming prototype descriptors connection:false:false:function:get:0:function:set:1:true:true|headers:false:false:function:get:0:function:set:1:true:true|headersDistinct:false:false:function:get:0:function:set:1:true:true|trailers:false:false:function:get:0:function:set:1:true:true|trailersDistinct:false:false:function:get:0:function:set:1:true:true|signal:false:true:function:get:0:undefined:::true:|setTimeout:true:true:true:setTimeout:2:true|_read:true:true:true:_read:1:true|_destroy:true:true:true:_destroy:2:true|_addHeaderLines:true:true:true:_addHeaderLines:2:true|_addHeaderLine:true:true:true:_addHeaderLine:3:true|_addHeaderLineDistinct:true:true:true:_addHeaderLineDistinct:3:true|_dumpAndCloseReadable:true:true:true:_dumpAndCloseReadable:0:true|_dump:true:true:true:_dump:0:true",
    "incoming header helpers [{\"a\":\"1, 2\",\"cookie\":\"a; b\",\"set-cookie\":[\"x\",\"y\"]},{\"a\":[\"1\",\"2\"],\"cookie\":[\"a\",\"b\"],\"set-cookie\":[\"x\",\"y\"]},{\"t\":\"2\"},{\"t\":[\"1\",\"2\"]},{\"host\":\"one\",\"cookie\":\"a; b\",\"set-cookie\":[\"x\",\"y\"],\"x-test\":\"left, right\"},{\"x-test\":[\"left\",\"right\"]},[\"A\",\"1\",\"A\",\"2\",\"C\",\"3\"],{\"a\":\"1, 2\"},{\"a\":[\"1\",\"2\"]}]",
    "true true true",
    "true true true true",
    "true false true",
    "1 2 function 18",
    "true host,x-test",
    "true true object",
    "true true true true",
    "false isSea,getAsset,getRawAsset,getAssetAsBlob,getAssetKeys",
    "getAsset:getAsset:2:true|getAssetAsBlob:getAssetAsBlob:2:true|getRawAsset:getRawAsset:1:true|getAssetKeys:getAssetKeys:0:true|isSea:isSea:0:false",
    "isSea:true:true:true|getAsset:true:true:true|getRawAsset:true:true:true|getAssetAsBlob:true:true:true|getAssetKeys:true:true:true",
    "MODULE_NOT_FOUND",
    "getAsset:ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION:Operation cannot be invoked when not in a single-executable application:Error [ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION]: Operation cannot be invoked when not in a single-executable application|getAssetAsBlob:ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION:Operation cannot be invoked when not in a single-executable application:Error [ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION]: Operation cannot be invoked when not in a single-executable application|getRawAsset:ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION:Operation cannot be invoked when not in a single-executable application:Error [ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION]: Operation cannot be invoked when not in a single-executable application|getAssetKeys:ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION:Operation cannot be invoked when not in a single-executable application:Error [ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION]: Operation cannot be invoked when not in a single-executable application",
    "getAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received undefined|getAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received type number (1):TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received type number (1)|getAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received type symbol (Symbol(x)):TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received type symbol (Symbol(x))|getAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received type boolean (true):TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received type boolean (true)|getAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received type bigint (1n):TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received type bigint (1n)|getAsset:ERR_INVALID_ARG_TYPE:The \"encoding\" argument must be of type string. Received type number (1):TypeError [ERR_INVALID_ARG_TYPE]: The \"encoding\" argument must be of type string. Received type number (1)|getAsset:ERR_INVALID_ARG_TYPE:The \"encoding\" argument must be of type string. Received null:TypeError [ERR_INVALID_ARG_TYPE]: The \"encoding\" argument must be of type string. Received null|getAsset:ERR_INVALID_ARG_TYPE:The \"encoding\" argument must be of type string. Received type symbol (Symbol(x)):TypeError [ERR_INVALID_ARG_TYPE]: The \"encoding\" argument must be of type string. Received type symbol (Symbol(x))|getAssetAsBlob:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received undefined|getAssetAsBlob:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received type symbol (Symbol(x)):TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received type symbol (Symbol(x))|getRawAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received undefined|getRawAsset:ERR_INVALID_ARG_TYPE:The \"key\" argument must be of type string. Received type symbol (Symbol(x)):TypeError [ERR_INVALID_ARG_TYPE]: The \"key\" argument must be of type string. Received type symbol (Symbol(x))"
  ]);
});

test("additional common Node core module aliases resolve for package compatibility", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const consoleModule = require("node:console");
      const pathPosix = require("node:path/posix");
      const pathWin32 = require("node:path/win32");
      const sys = require("node:sys");
      const util = require("node:util");
      const types = require("node:util/types");

      const writes = [];
      const errors = [];
      const customConsole = new consoleModule.Console({
        stdout: { write: (chunk) => writes.push(chunk) },
        stderr: { write: (chunk) => errors.push(chunk) },
        groupIndentation: 4,
        inspectOptions: { compact: false, colors: false }
      });
      customConsole.log("hello", { ok: true });
      customConsole.dir({ nested: { value: 1 } }, { depth: 0 });
      customConsole.dirxml("xmlish", { ok: true });
      customConsole.count("items");
      customConsole.count("items");
      customConsole.countReset("items");
      customConsole.group("group");
      customConsole.info("inside");
      customConsole.groupEnd();
      customConsole.time("load");
      customConsole.timeLog("load", "mid");
      customConsole.timeEnd("load");
      customConsole.assert(false, "bad %d", 7);
      console.count("global");
      console.countReset("global");
      const previousConsoleStdout = consoleModule._stdout;
      const hiddenConsoleWrites = [];
      consoleModule._stdout = { write: (chunk) => hiddenConsoleWrites.push(chunk) };
      consoleModule.log("hidden stdout");
      consoleModule._stdout = previousConsoleStdout;

      const colorChunks = [];
      new consoleModule.Console({
        stdout: { write: (chunk) => colorChunks.push(chunk) },
        colorMode: true
      }).log({ color: 1 });

      const ignored = new consoleModule.Console({
        stdout: { write: () => { throw new Error("ignored write failure"); } },
        ignoreErrors: true
      });
      ignored.log("still ok");

      let threw = false;
      try {
        new consoleModule.Console({
          stdout: { write: () => { throw new Error("visible write failure"); } },
          ignoreErrors: false
        }).log("boom");
      } catch (error) {
        threw = error.message.includes("visible write failure");
      }

      const taskValue = consoleModule.createTask("probe").run(() => 42);
      const asyncTaskValue = consoleModule.createTask("async-probe").run(async () => 43);
      const scopedConsole = consoleModule.context("scoped");
      const describeConsolePrototype = (name) => {
        const descriptor = Object.getOwnPropertyDescriptor(consoleModule.Console.prototype, name);
        if (!descriptor) return name + ":missing";
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      };
      const hiddenConsoleDescriptorRow = (name) => {
        const descriptor = Object.getOwnPropertyDescriptor(consoleModule, name);
        if ("value" in descriptor) {
          return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, descriptor.value?.name ?? "", descriptor.value?.length ?? "", Object.hasOwn(descriptor.value ?? {}, "prototype"), descriptor.value?.constructor?.name ?? ""].join(":");
        }
        return [name, descriptor.enumerable, descriptor.configurable, "accessor", descriptor.get.name, descriptor.get.length, Object.hasOwn(descriptor.get, "prototype"), descriptor.set.name, descriptor.set.length, Object.hasOwn(descriptor.set, "prototype")].join(":");
      };
      let taskThrew = false;
      try {
        consoleModule.createTask("bad").run("not a function");
      } catch (error) {
        taskThrew = error.message.includes("First argument must be a function");
      }

      console.log(typeof consoleModule.Console);
      console.log("console keys:", Object.keys(consoleModule).join(","), Object.hasOwn(consoleModule, "default"));
      console.log("console own names:", Object.getOwnPropertyNames(consoleModule).join(","));
      console.log("console hidden rows:", ["_stdoutErrorHandler", "_stderrErrorHandler", "_ignoreErrors", "_times", "_stdout", "_stderr"].map(hiddenConsoleDescriptorRow).join("|"));
      console.log("console meta:", consoleModule.Console.name, consoleModule.Console.length, consoleModule.log.name, consoleModule.log.length, consoleModule.context.name, consoleModule.context.length, consoleModule.createTask.name, consoleModule.createTask.length);
      console.log("console prototype names:", Object.getOwnPropertyNames(consoleModule.Console.prototype).join(","));
      console.log("console prototype keys:", Object.keys(consoleModule.Console.prototype).join(","));
      console.log("console prototype rows:", ["log", "trace", "table", "dirxml", "groupCollapsed", "timeStamp", "profile", "profileEnd"].map(describeConsolePrototype).join("|"));
      console.log("console hidden stdout:", hiddenConsoleWrites.join("").trim());
      console.log(writes.join("").includes("hello { ok: true }"));
      console.log(writes.join("").includes("[Object]"));
      console.log(writes.join("").includes("xmlish { ok: true }"));
      console.log(writes.join("").includes("items: 2"));
      console.log(writes.join("").includes("    inside"));
      console.log(writes.join("").includes("load:") && writes.join("").includes("mid"));
      console.log(errors.join("").includes("bad 7"));
      console.log(colorChunks.join("").includes("\\u001b["));
      console.log(threw);
      console.log(typeof console.count, typeof console.timeLog);
      console.log(taskValue, typeof asyncTaskValue.then, typeof scopedConsole.log, taskThrew);
      console.log(pathPosix.join("a", "b"), pathWin32.sep);
      console.log(sys === util);
      console.log(util.types === types);
      console.log(types.isDate(new Date()), types.isTypedArray(new Uint8Array()));
      console.log(require("node:module").builtinModules.includes("stream/web"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n").filter(line => !line.startsWith("global:")), [
    "function",
    "console keys: log,info,debug,warn,error,dir,time,timeEnd,timeLog,trace,assert,clear,count,countReset,group,groupEnd,table,dirxml,groupCollapsed,Console,profile,profileEnd,timeStamp,context,createTask false",
    "console own names: log,info,debug,warn,error,dir,time,timeEnd,timeLog,trace,assert,clear,count,countReset,group,groupEnd,table,dirxml,groupCollapsed,_stdoutErrorHandler,_stderrErrorHandler,_ignoreErrors,_times,Console,profile,profileEnd,timeStamp,context,createTask,_stdout,_stderr",
    "console hidden rows: _stdoutErrorHandler:false:true:true:function::1:false:Function|_stderrErrorHandler:false:true:true:function::1:false:Function|_ignoreErrors:false:true:true:boolean:::false:Boolean|_times:false:true:true:object:::false:Map|_stdout:false:true:accessor:get:0:false:set:1:false|_stderr:false:true:accessor:get:0:false:set:1:false",
    "console meta: Console 1 log 0 context 1 createTask 0",
    "console prototype names: constructor,log,info,debug,warn,error,dir,time,timeEnd,timeLog,trace,assert,clear,count,countReset,group,groupEnd,table,dirxml,groupCollapsed",
    "console prototype keys: log,info,debug,warn,error,dir,time,timeEnd,timeLog,trace,assert,clear,count,countReset,group,groupEnd,table,dirxml,groupCollapsed",
    "console prototype rows: log:true:true:true:log:0:false|trace:true:true:true:trace:0:true|table:true:true:true:table:2:false|dirxml:true:true:true:log:0:false|groupCollapsed:true:true:true:group:0:false|timeStamp:missing|profile:missing|profileEnd:missing",
    "console hidden stdout: hidden stdout",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "true",
    "function function",
    "42 function function true",
    "a/b \\",
    "true",
    "true",
    "true true",
    "true"
  ]);
});

test("stream/web and stream/consumers expose Web Stream helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import webDefault, { ReadableStream } from "node:stream/web";
    import * as webNamespace from "node:stream/web";
    import streamBuiltin from "node:stream";
    import consumers from "node:stream/consumers";
    import { createRequire } from "node:module";

    const webCjs = createRequire(import.meta.url)("node:stream/web");
    const consumersCjs = createRequire(import.meta.url)("node:stream/consumers");

    const webStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":true}'));
        controller.close();
      }
    });
    const nodeStream = new streamBuiltin.Readable();
    const nodeText = consumers.text(nodeStream);
    nodeStream.push(new Uint8Array([110, 111]));
    nodeStream.push("de");
    nodeStream.push(null);
    const view = new DataView(new Uint8Array([65, 66, 67]).buffer, 1, 2);
    async function describeConsumer(label, action) {
      try {
        await action();
        return label + ":ok";
      } catch (error) {
        return [label, "err", error.name, String(error.code), error.message].join(":");
      }
    }
    const invalidConsumerRows = await Promise.all([
      describeConsumer("text-null", () => consumers.text(null)),
      describeConsumer("buffer-null", () => consumers.buffer(null)),
      describeConsumer("bytes-null", () => consumers.bytes(null)),
      describeConsumer("arrayBuffer-null", () => consumers.arrayBuffer(null)),
      describeConsumer("text-number", () => consumers.text(123)),
      describeConsumer("buffer-object", () => consumers.buffer({ plain: true }))
    ]);

    console.log(typeof ReadableStream);
    console.log(Object.hasOwn(webCjs, "default"));
    console.log(Object.keys(webCjs).join(","));
    console.log(["ReadableStream", "ReadableStreamDefaultReader", "TransformStream", "WritableStream", "ByteLengthQueuingStrategy", "CompressionStream"].map((key) => key + ":" + webCjs[key].name + ":" + webCjs[key].length).join("|"));
    console.log(Object.hasOwn(webNamespace, "default"));
    console.log(webNamespace.default === webCjs);
    console.log(Object.prototype.toString.call(webNamespace));
    console.log(Object.isExtensible(webNamespace));
    console.log(webDefault.ReadableStream === ReadableStream);
    console.log(Object.hasOwn(consumersCjs, "default"));
    console.log(Object.keys(consumersCjs).join(","));
    console.log(["arrayBuffer", "blob", "buffer", "bytes", "text", "json"].map((key) => key + ":" + consumersCjs[key].name + ":" + consumersCjs[key].length).join("|"));
    console.log(invalidConsumerRows.join("|"));
    console.log(await consumers.text(webStream));
    console.log((await consumers.buffer("abc")).toString("utf8"));
    console.log((await consumers.json('{"answer":42}')).answer);
    console.log(await nodeText);
    console.log((await consumers.buffer(view)).toString("utf8"));
    console.log(await consumers.text(new Blob(["blob"])));
    console.log(new Uint8Array(await consumers.arrayBuffer(Promise.resolve(["x", "y"]))).join(","));
    console.log((await consumers.blob("zip")).size);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "false",
    "ReadableStream,ReadableStreamDefaultReader,ReadableStreamBYOBReader,ReadableStreamBYOBRequest,ReadableByteStreamController,ReadableStreamDefaultController,TransformStream,TransformStreamDefaultController,WritableStream,WritableStreamDefaultWriter,WritableStreamDefaultController,ByteLengthQueuingStrategy,CountQueuingStrategy,TextEncoderStream,TextDecoderStream,CompressionStream,DecompressionStream",
    "ReadableStream:ReadableStream:0|ReadableStreamDefaultReader:ReadableStreamDefaultReader:1|TransformStream:TransformStream:0|WritableStream:WritableStream:0|ByteLengthQueuingStrategy:ByteLengthQueuingStrategy:1|CompressionStream:CompressionStream:1",
    "true",
    "true",
    "[object Module]",
    "false",
    "true",
    "false",
    "arrayBuffer,blob,buffer,bytes,text,json",
    "arrayBuffer:arrayBuffer:1|blob:blob:1|buffer:buffer:1|bytes:bytes:1|text:text:1|json:json:1",
    "text-null:err:TypeError:undefined:Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')|buffer-null:err:TypeError:undefined:Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')|bytes-null:err:TypeError:undefined:Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')|arrayBuffer-null:err:TypeError:undefined:Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')|text-number:err:TypeError:undefined:stream is not async iterable|buffer-object:err:TypeError:undefined:stream is not async iterable",
    "{\"ok\":true}",
    "abc",
    "42",
    "node",
    "BC",
    "blob",
    "120,121",
    "3"
  ]);
});

test("perf_hooks, punycode, and domain cover common package probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const perfHooks = require("node:perf_hooks");
      const { performance, Performance, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceObserver, PerformanceObserverEntryList, PerformanceResourceTiming, monitorEventLoopDelay } = perfHooks;
      const punycode = require("node:punycode");
      const domain = require("node:domain");
      const { EventEmitter } = require("node:events");
      const mark = performance.mark("package-probe");
      const measure = performance.measure("package-measure", "package-probe");
      const illegalConstructorRows = [PerformanceEntry, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList].map((Constructor) => {
        try {
          new Constructor();
          return "ok";
        } catch (error) {
          return [error.name, error.code, error.message].join(":");
        }
      });
      const histogramOptionRows = [
        ["monitor-null", () => monitorEventLoopDelay(null)],
        ["monitor-array", () => monitorEventLoopDelay([])],
        ["monitor-resolution-string", () => monitorEventLoopDelay({ resolution: "1" })],
        ["monitor-resolution-zero", () => monitorEventLoopDelay({ resolution: 0 })],
        ["monitor-resolution-fraction", () => monitorEventLoopDelay({ resolution: 1.2 })],
        ["monitor-valid", () => monitorEventLoopDelay({ resolution: 1 })],
        ["hist-null", () => perfHooks.createHistogram(null)],
        ["hist-array", () => perfHooks.createHistogram([])],
        ["hist-lowest-string", () => perfHooks.createHistogram({ lowest: "1" })],
        ["hist-lowest-zero", () => perfHooks.createHistogram({ lowest: 0 })],
        ["hist-highest-low", () => perfHooks.createHistogram({ lowest: 10, highest: 5 })],
        ["hist-figures-string", () => perfHooks.createHistogram({ figures: "2" })],
        ["hist-valid", () => perfHooks.createHistogram({ lowest: 1, highest: 10, figures: 2 })],
        ["timerify-array", () => perfHooks.timerify(function timed() {}, [])]
      ].map(([label, action]) => {
        try {
          const value = action();
          return [label, "ok", value.constructor.name].join(":");
        } catch (error) {
          return [label, error.name, error.code].join(":");
        }
      });
      const constantsDescriptor = Object.getOwnPropertyDescriptor(perfHooks, "constants");
      const constantDescriptorRows = Object.keys(perfHooks.constants).map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(perfHooks.constants, name);
        return [name, descriptor.value, descriptor.enumerable, descriptor.writable, descriptor.configurable].join(":");
      });
      const hiddenConstantRows = Object.getOwnPropertyNames(perfHooks.constants)
        .filter((name) => !Object.prototype.propertyIsEnumerable.call(perfHooks.constants, name))
        .map((name) => {
          const descriptor = Object.getOwnPropertyDescriptor(perfHooks.constants, name);
          return [name, descriptor.value, descriptor.enumerable, descriptor.writable, descriptor.configurable].join(":");
        });
      const perfFunctionPrototypeRows = ["monitorEventLoopDelay", "eventLoopUtilization", "timerify", "createHistogram"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(perfHooks[name], "prototype");
        return [
          name,
          Object.hasOwn(perfHooks[name], "prototype"),
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          Object.getOwnPropertyNames(descriptor.value).join(",")
        ].join(":");
      });
      const eventLoopDelay = monitorEventLoopDelay({ resolution: 1 });
      const eventLoopDelayPrototype = Object.getPrototypeOf(eventLoopDelay);
      const eventLoopDelayReadoutPrototype = Object.getPrototypeOf(eventLoopDelayPrototype);
      const recordableHistogram = perfHooks.createHistogram();
      const recordablePrototype = Object.getPrototypeOf(recordableHistogram);
      const recordableReadoutPrototype = Object.getPrototypeOf(recordablePrototype);
      const otherRecordableHistogram = perfHooks.createHistogram();
      otherRecordableHistogram.record(20);
      const recordableReturns = [
        recordableHistogram.record(10),
        recordableHistogram.recordDelta(),
        recordableHistogram.add(otherRecordableHistogram)
      ].map(String).join(",");
      const describePerfPrototype = (prototype, names) => names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor) return name + ":missing";
        if ("value" in descriptor) {
          return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
        }
        return [name, descriptor.enumerable, descriptor.configurable, "accessor", descriptor.get.name, descriptor.get.length, typeof descriptor.set].join(":");
      }).join("|");
      const describePrototypeSymbols = (prototype) => Object.getOwnPropertySymbols(prototype).map((symbol) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, symbol);
        return [String(symbol), typeof descriptor.value, descriptor.value?.name ?? "", descriptor.value?.length ?? "", descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value ?? {}, "prototype"), typeof descriptor.value === "string" ? descriptor.value : ""].join(":");
      }).join("|") || "<none>";
      const entryPrototypeRows = [
        "entry:" + Object.getOwnPropertyNames(PerformanceEntry.prototype).join(",") + ":" + Object.keys(PerformanceEntry.prototype).join(",") + ":" + describePerfPrototype(PerformanceEntry.prototype, ["name", "entryType", "startTime", "duration", "toJSON"]),
        "mark:" + Object.getOwnPropertyNames(PerformanceMark.prototype).join(",") + ":" + Object.keys(PerformanceMark.prototype).join(",") + ":" + describePerfPrototype(PerformanceMark.prototype, ["detail", "toJSON"]),
        "measure:" + Object.getOwnPropertyNames(PerformanceMeasure.prototype).join(",") + ":" + Object.keys(PerformanceMeasure.prototype).join(",") + ":" + describePerfPrototype(PerformanceMeasure.prototype, ["detail", "toJSON"]),
        "resource:" + Object.getOwnPropertyNames(PerformanceResourceTiming.prototype).join(",") + ":" + Object.keys(PerformanceResourceTiming.prototype).join(",") + ":" + describePerfPrototype(PerformanceResourceTiming.prototype, ["name", "startTime", "duration", "initiatorType", "workerStart", "redirectStart", "redirectEnd", "fetchStart", "domainLookupStart", "domainLookupEnd", "connectStart", "connectEnd", "secureConnectionStart", "nextHopProtocol", "requestStart", "responseStart", "responseEnd", "encodedBodySize", "decodedBodySize", "transferSize", "deliveryType", "responseStatus", "toJSON"])
      ];
      const performancePrototypeRows = [
        Object.keys(performance).join(",") || "<none>",
        Object.getOwnPropertyNames(performance).join(",") || "<none>",
        Object.getOwnPropertyNames(Performance.prototype).join(","),
        Object.keys(Performance.prototype).join(","),
        describePerfPrototype(Performance.prototype, ["now", "mark", "markResourceTiming", "eventLoopUtilization", "timerify", "timeOrigin", "nodeTiming", "onresourcetimingbufferfull"])
      ];
      const nodeTiming = performance.nodeTiming;
      const nodeTimingPrototype = Object.getPrototypeOf(nodeTiming);
      const nodeTimingEntryPrototype = Object.getPrototypeOf(nodeTimingPrototype);
      const describeNodeTimingOwnDescriptor = (name) => {
        const descriptor = Object.getOwnPropertyDescriptor(nodeTiming, name);
        if ("value" in descriptor) {
          return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, typeof descriptor.get, typeof descriptor.set].join(":");
        }
        return [name, descriptor.enumerable, descriptor.configurable, "accessor", descriptor.get.name, descriptor.get.length, typeof descriptor.set].join(":");
      };
      const nodeTimingToJSONDescriptor = Object.getOwnPropertyDescriptor(nodeTimingPrototype, "toJSON");
      const nodeTimingRows = [
        nodeTiming.constructor.name,
        nodeTiming instanceof PerformanceEntry,
        Object.keys(nodeTiming).join(","),
        Object.getOwnPropertyNames(nodeTiming).join(","),
        Object.getOwnPropertyNames(nodeTimingPrototype).join(","),
        Object.keys(nodeTimingPrototype).join(",") || "<none>",
        nodeTimingEntryPrototype.constructor.name,
        ["name", "duration", "nodeStart", "uvMetricsInfo"].map(describeNodeTimingOwnDescriptor).join("|"),
        [nodeTimingToJSONDescriptor.enumerable, nodeTimingToJSONDescriptor.configurable, nodeTimingToJSONDescriptor.writable, nodeTimingToJSONDescriptor.value.name, nodeTimingToJSONDescriptor.value.length, Object.hasOwn(nodeTimingToJSONDescriptor.value, "prototype")].join(":"),
        Object.keys(nodeTiming.toJSON()).join(","),
        nodeTiming.uvMetricsInfo === nodeTiming.uvMetricsInfo,
        Number.isFinite(nodeTiming.toJSON().duration)
      ];
      const observerValidationRows = [
        ["ctor-missing", () => new PerformanceObserver()],
        ["ctor-null", () => new PerformanceObserver(null)],
        ["observe-missing", () => new PerformanceObserver(() => {}).observe()],
        ["observe-null", () => new PerformanceObserver(() => {}).observe(null)],
        ["observe-entryTypes-string", () => new PerformanceObserver(() => {}).observe({ entryTypes: "mark" })],
        ["observe-type-plus-entryTypes", () => new PerformanceObserver(() => {}).observe({ type: "mark", entryTypes: ["mark"] })]
      ].map(([label, action]) => {
        try {
          action();
          return label + ":ok";
        } catch (error) {
          return [label, error.name, error.code, error.message].join(":");
        }
      });
      const describePunycodeResult = (action) => {
        try {
          return "ok:" + JSON.stringify(action());
        } catch (error) {
          return error.name + ":" + error.message;
        }
      };
      const punycodeValidationRows = [
        ["toASCII-null", () => punycode.toASCII(null)],
        ["toASCII-undefined", () => punycode.toASCII(undefined)],
        ["toUnicode-null", () => punycode.toUnicode(null)],
        ["encode-null", () => punycode.encode(null)],
        ["decode-null", () => punycode.decode(null)],
        ["ucs2-decode-null", () => punycode.ucs2.decode(null)],
        ["ucs2-encode-null", () => punycode.ucs2.encode(null)]
      ].map(([label, action]) => label + ":" + describePunycodeResult(action));
      const punycodeCoercionRows = [
        ["encode-number", () => punycode.encode(123)],
        ["ucs2-decode-number", () => punycode.ucs2.decode(123)],
        ["decode-boolean", () => punycode.decode(true)],
        ["toASCII-number", () => punycode.toASCII(123)],
        ["ucs2-encode-string", () => punycode.ucs2.encode("AB")]
      ].map(([label, action]) => label + ":" + describePunycodeResult(action));

      console.log("perf keys:", Object.keys(perfHooks).join(","));
      console.log(typeof performance.now(), typeof performance.eventLoopUtilization().utilization);
      console.log(["now", "mark", "measure", "clearMarks", "clearMeasures", "markResourceTiming", "clearResourceTimings", "setResourceTimingBufferSize", "getEntries", "getEntriesByName", "getEntriesByType", "eventLoopUtilization", "timerify"].map((name) => name + ":" + performance[name].name + ":" + performance[name].length).join("|"));
      console.log(performance instanceof Performance, Performance.name, Performance.length, performance.constructor.name);
      console.log([PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceObserver, PerformanceObserverEntryList, PerformanceResourceTiming].map((value) => value.name + ":" + value.length).join("|"));
      console.log(typeof PerformanceObserver, typeof monitorEventLoopDelay().enable);
      console.log("perf function prototypes:", perfFunctionPrototypeRows.join("|"));
      console.log("perf performance prototype:", performancePrototypeRows.join(";"));
      console.log("perf performance symbols:", describePrototypeSymbols(Performance.prototype));
      console.log("perf nodeTiming:", nodeTimingRows.join(";"));
      console.log("perf identities:", perfHooks.performance === performance, perfHooks.timerify === performance.timerify, perfHooks.eventLoopUtilization === performance.eventLoopUtilization, typeof performance.eventLoopUtilization.call({}).active);
      console.log("perf global:", globalThis.performance === performance, globalThis.Performance === Performance, performance instanceof globalThis.Performance);
      console.log("perf entry prototypes:", entryPrototypeRows.join(";"));
      console.log("perf constructors:", new PerformanceMark("manual-mark") instanceof PerformanceMark, new PerformanceObserver(() => {}) instanceof PerformanceObserver, illegalConstructorRows.join("|"));
      console.log("histogram options:", histogramOptionRows.join("|"));
      console.log("eld shape:", eventLoopDelay.constructor.name, Object.keys(eventLoopDelay).join(",") || "<none>", Object.getOwnPropertyNames(eventLoopDelay).join(",") || "<none>");
      console.log("eld proto:", Object.getOwnPropertyNames(eventLoopDelayPrototype).join(","), Object.keys(eventLoopDelayPrototype).join(",") || "<none>");
      console.log("eld symbols:", describePrototypeSymbols(eventLoopDelayPrototype));
      console.log("eld readout proto:", Object.getOwnPropertyNames(eventLoopDelayReadoutPrototype).join(","), Object.keys(eventLoopDelayReadoutPrototype).join(",") || "<none>");
      console.log("eld mutators:", typeof eventLoopDelay.record, typeof eventLoopDelay.recordDelta, typeof eventLoopDelay.add);
      console.log("eld values:", eventLoopDelay.enable(), eventLoopDelay.disable(), eventLoopDelay.count, eventLoopDelay.min, eventLoopDelay.max, String(eventLoopDelay.mean), String(eventLoopDelay.stddev), JSON.stringify([...eventLoopDelay.percentiles]), JSON.stringify(eventLoopDelay.toJSON()));
      console.log("recordable shape:", recordableHistogram.constructor.name, Object.keys(recordableHistogram).join(",") || "<none>", Object.getOwnPropertyNames(recordableHistogram).join(",") || "<none>", Object.getOwnPropertyNames(recordablePrototype).join(","), Object.keys(recordablePrototype).join(",") || "<none>", Object.getOwnPropertyNames(recordableReadoutPrototype).join(","), Object.keys(recordableReadoutPrototype).join(",") || "<none>", typeof recordableHistogram.enable, typeof recordableHistogram.record, recordableHistogram.count, recordableReturns);
      const observerProto = PerformanceObserver.prototype;
      const observerDescriptorRows = ["observe", "disconnect", "takeRecords"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(observerProto, name);
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length].join(":");
      });
      const supportedEntryTypesDescriptor = Object.getOwnPropertyDescriptor(PerformanceObserver, "supportedEntryTypes");
      const entryListProto = PerformanceObserverEntryList.prototype;
      const entryListDescriptorRows = ["getEntries", "getEntriesByType", "getEntriesByName"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(entryListProto, name);
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length].join(":");
      });
      console.log("observer proto:", Object.getOwnPropertyNames(observerProto).join(","));
      console.log("observer symbols:", describePrototypeSymbols(observerProto));
      console.log("observer descriptors:", observerDescriptorRows.join("|"));
      console.log("observer supported:", supportedEntryTypesDescriptor.enumerable, supportedEntryTypesDescriptor.configurable, typeof supportedEntryTypesDescriptor.get, PerformanceObserver.supportedEntryTypes.join(","));
      console.log("observer validation:", observerValidationRows.join("|"));
      console.log("entry list proto:", Object.getOwnPropertyNames(entryListProto).join(","));
      console.log("entry list descriptors:", entryListDescriptorRows.join("|"));
      console.log("perf constants descriptor:", constantsDescriptor.enumerable, constantsDescriptor.configurable, constantsDescriptor.writable, typeof constantsDescriptor.value);
      console.log("perf constants object:", Object.getPrototypeOf(perfHooks.constants) === Object.prototype, Object.isExtensible(perfHooks.constants));
      console.log("perf constants names:", Object.getOwnPropertyNames(perfHooks.constants).join(","));
      console.log("perf constants rows:", constantDescriptorRows.join("|"));
      console.log("perf constants hidden rows:", hiddenConstantRows.join("|"));
      console.log(mark instanceof PerformanceMark, measure instanceof PerformanceMeasure);
      console.log(punycode.toASCII("mañana.com"));
      console.log(punycode.toUnicode("xn--maana-pta.com"));
      console.log("punycode keys:", Object.keys(punycode).join(","), Object.hasOwn(punycode, "default"), punycode.version);
      console.log("punycode meta:", ["decode", "encode", "toASCII", "toUnicode"].map((name) => name + ":" + punycode[name].name + ":" + punycode[name].length + ":" + Object.hasOwn(punycode[name], "prototype")).join("|"));
      console.log("punycode ucs2:", Object.keys(punycode.ucs2).join(","), ["decode", "encode"].map((name) => name + ":" + punycode.ucs2[name].name + ":" + punycode.ucs2[name].length + ":" + Object.hasOwn(punycode.ucs2[name], "prototype")).join("|"));
      console.log("punycode domains:", [punycode.toASCII("mañana。com"), punycode.toASCII("mañana．com"), punycode.toASCII("mañana｡com"), punycode.toUnicode("xn--maana-pta。com")].join("|"));
      console.log("punycode validation:", punycodeValidationRows.join("|"));
      console.log("punycode coercion:", punycodeCoercionRows.join("|"));
      const processDomainDescriptor = Object.getOwnPropertyDescriptor(process, "domain");
      const domainActiveDescriptor = Object.getOwnPropertyDescriptor(domain, "active");
      const domainPrototype = domain.Domain.prototype;
      const domainPrototypeDescriptorRows = ["members", "_errorHandler", "enter", "exit", "add", "remove", "run", "intercept", "bind", "dispose"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(domainPrototype, name);
        if (!descriptor) return name + ":missing";
        const valueName = typeof descriptor.value === "function" ? descriptor.value.name : String(descriptor.value);
        const valueLength = typeof descriptor.value === "function" ? descriptor.value.length : "";
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, valueName, valueLength, Object.hasOwn(descriptor.value ?? {}, "prototype")].join(":");
      });
      console.log("domain keys:", Object.keys(domain).join(","));
      console.log("domain meta:", domain.active === null, process.domain === null, Object.hasOwn(process, "domain"), processDomainDescriptor.enumerable, processDomainDescriptor.configurable, typeof processDomainDescriptor.get, typeof processDomainDescriptor.set, Object.hasOwn(processDomainDescriptor.get, "prototype"), Object.hasOwn(processDomainDescriptor.set, "prototype"), domain.create === domain.createDomain, domain.create.name, domain.create.length);
      console.log("domain active descriptor:", domainActiveDescriptor.enumerable, domainActiveDescriptor.configurable, domainActiveDescriptor.writable, domainActiveDescriptor.value === null);
      console.log("domain proto names:", Object.getOwnPropertyNames(domainPrototype).join(","));
      console.log("domain proto keys:", Object.keys(domainPrototype).join(","));
      console.log("domain proto descriptors:", domainPrototypeDescriptorRows.join("|"));

      const d = domain.create();
      const domainInstanceDescriptor = Object.getOwnPropertyDescriptor(d, "domain");
      console.log("domain instance:", Object.keys(d).join(","), Object.getOwnPropertyNames(d).includes("domain"), domainInstanceDescriptor.enumerable, domainInstanceDescriptor.configurable, domainInstanceDescriptor.writable, domainInstanceDescriptor.value === null);
      const domainValidation = domain.create();
      const domainValidationObject = {};
      const domainValidationRows = [
        ["add-undefined", () => domainValidation.add()],
        ["remove-undefined", () => domainValidation.remove()],
        ["add-null", () => domainValidation.add(null)],
        ["remove-null", () => domainValidation.remove(null)],
        ["add-number", () => domainValidation.add(1)],
        ["remove-number", () => domainValidation.remove(1)],
        ["add-object", () => {
          const result = domainValidation.add(domainValidationObject);
          const descriptor = Object.getOwnPropertyDescriptor(domainValidationObject, "domain");
          return ["ok", result === undefined, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value === domainValidation].join(":");
        }],
        ["remove-object", () => {
          const result = domainValidation.remove(domainValidationObject);
          const descriptor = Object.getOwnPropertyDescriptor(domainValidationObject, "domain");
          return ["ok", result === undefined, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value === null].join(":");
        }],
        ["remove-fresh", () => {
          const target = {};
          const result = domainValidation.remove(target);
          const descriptor = Object.getOwnPropertyDescriptor(target, "domain");
          return ["ok", result === undefined, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value === null].join(":");
        }]
      ].map(([label, action]) => {
        try {
          return label + ":" + action();
        } catch (error) {
          return [label, error.constructor.name, error.code ?? "", error.message].join(":");
        }
      }).join("|");
      console.log("domain add/remove validation:", domainValidationRows);
      d.on("error", (error) => console.log("domain:", error.message));
      d.run(() => { throw new Error("handled"); });
      d.run(() => console.log("active:", domain.active === d, process.domain === d));
      console.log("inactive:", domain.active === undefined, process.domain === undefined);

      const d3 = domain.create();
      const interceptedErrors = [];
      d3.on("error", (error) => interceptedErrors.push(error.message));
      function wrapped(left, right) {
        return [this.label, left, right, domain.active === d3, process.domain === d3].join(":");
      }
      const bound = d3.bind(wrapped);
      const intercepted = d3.intercept(wrapped);
      console.log("wrappers:", bound.name, bound.length, bound.call({ label: "ctx" }, "a", "b"));
      console.log("intercepted:", intercepted.name, intercepted.length, intercepted.call({ label: "ctx" }, null, "a", "b"));
      console.log("intercepted error:", intercepted(new Error("boom")), interceptedErrors.join(","), domain.active === undefined);

      const d2 = domain.createDomain();
      const emitter = new EventEmitter();
      d2.on("error", (error) => console.log("emitter:", error.message, emitter.domain === d2));
      d2.add(emitter);
      emitter.emit("error", new Error("routed"));
      d2.remove(emitter);
      console.log("removed:", emitter.domain === null, Array.isArray(domain._stack));
      process.domain = "manual";
      console.log("assigned:", process.domain);
      delete process.domain;
      console.log("deleted:", Object.hasOwn(process, "domain"), process.domain);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
	    "perf keys: Performance,PerformanceEntry,PerformanceMark,PerformanceMeasure,PerformanceObserver,PerformanceObserverEntryList,PerformanceResourceTiming,monitorEventLoopDelay,eventLoopUtilization,timerify,createHistogram,performance,constants",
	    "number number",
	    "now:now:0|mark:mark:1|measure:measure:1|clearMarks:clearMarks:0|clearMeasures:clearMeasures:0|markResourceTiming:markResourceTiming:7|clearResourceTimings:clearResourceTimings:0|setResourceTimingBufferSize:setResourceTimingBufferSize:1|getEntries:getEntries:0|getEntriesByName:getEntriesByName:1|getEntriesByType:getEntriesByType:1|eventLoopUtilization:eventLoopUtilization:2|timerify:timerify:1",
	    "true Performance 0 Performance",
    "PerformanceEntry:0|PerformanceMark:1|PerformanceMeasure:0|PerformanceObserver:1|PerformanceObserverEntryList:0|PerformanceResourceTiming:0",
	    "function function",
	    "perf function prototypes: monitorEventLoopDelay:true:false:false:true:constructor|eventLoopUtilization:true:false:false:true:constructor|timerify:true:false:false:true:constructor|createHistogram:true:false:false:true:constructor",
	    "perf performance prototype: <none>;<none>;constructor,clearMarks,clearMeasures,clearResourceTimings,getEntries,getEntriesByName,getEntriesByType,mark,measure,now,setResourceTimingBufferSize,timeOrigin,toJSON,eventLoopUtilization,nodeTiming,markResourceTiming,timerify,onresourcetimingbufferfull;clearMarks,clearMeasures,clearResourceTimings,getEntries,getEntriesByName,getEntriesByType,mark,measure,now,setResourceTimingBufferSize,timeOrigin,toJSON,onresourcetimingbufferfull;now:true:true:true:now:0:false|mark:true:true:true:mark:1:false|markResourceTiming:false:true:true:markResourceTiming:7:true|eventLoopUtilization:false:true:true:eventLoopUtilization:2:true|timerify:false:true:true:timerify:1:true|timeOrigin:true:true:accessor:get timeOrigin:0:undefined|nodeTiming:false:true:true:node::false|onresourcetimingbufferfull:true:true:accessor:get onresourcetimingbufferfull:0:function",
	    "perf performance symbols: Symbol(nodejs.util.inspect.custom):function:[nodejs.util.inspect.custom]:2:false:true:true:false:|Symbol(Symbol.toStringTag):string::11:false:true:false:false:Performance",
	    "perf nodeTiming: PerformanceNodeTiming;true;name,entryType,startTime,duration,nodeStart,v8Start,environment,loopStart,loopExit,bootstrapComplete,idleTime,uvMetricsInfo;name,entryType,startTime,duration,nodeStart,v8Start,environment,loopStart,loopExit,bootstrapComplete,idleTime,uvMetricsInfo;constructor,toJSON;<none>;PerformanceEntry;name:true:true:false:string:undefined:undefined|duration:true:true:accessor:now:0:undefined|nodeStart:true:true:accessor:get:0:undefined|uvMetricsInfo:true:true:accessor:get:0:undefined;false:true:true:toJSON:0:false;name,entryType,startTime,duration,nodeStart,v8Start,bootstrapComplete,environment,loopStart,loopExit,idleTime;false;true",
    "perf identities: true true true number",
    "perf global: true true true",
    "perf entry prototypes: entry:constructor,name,entryType,startTime,duration,toJSON:name,entryType,startTime,duration,toJSON:name:true:true:accessor:get name:0:undefined|entryType:true:true:accessor:get entryType:0:undefined|startTime:true:true:accessor:get startTime:0:undefined|duration:true:true:accessor:get duration:0:undefined|toJSON:true:true:true:toJSON:0:false;mark:constructor,detail,toJSON:detail:detail:true:true:accessor:get detail:0:undefined|toJSON:false:true:true:toJSON:0:false;measure:constructor,detail,toJSON:detail:detail:true:true:accessor:get detail:0:undefined|toJSON:false:true:true:toJSON:0:false;resource:constructor,name,startTime,duration,initiatorType,workerStart,redirectStart,redirectEnd,fetchStart,domainLookupStart,domainLookupEnd,connectStart,connectEnd,secureConnectionStart,nextHopProtocol,requestStart,responseStart,responseEnd,encodedBodySize,decodedBodySize,transferSize,deliveryType,responseStatus,toJSON:initiatorType,workerStart,redirectStart,redirectEnd,fetchStart,domainLookupStart,domainLookupEnd,connectStart,connectEnd,secureConnectionStart,nextHopProtocol,requestStart,responseStart,responseEnd,encodedBodySize,decodedBodySize,transferSize,deliveryType,responseStatus,toJSON:name:false:true:accessor:get name:0:undefined|startTime:false:true:accessor:get startTime:0:undefined|duration:false:true:accessor:get duration:0:undefined|initiatorType:true:true:accessor:get initiatorType:0:undefined|workerStart:true:true:accessor:get workerStart:0:undefined|redirectStart:true:true:accessor:get redirectStart:0:undefined|redirectEnd:true:true:accessor:get redirectEnd:0:undefined|fetchStart:true:true:accessor:get fetchStart:0:undefined|domainLookupStart:true:true:accessor:get domainLookupStart:0:undefined|domainLookupEnd:true:true:accessor:get domainLookupEnd:0:undefined|connectStart:true:true:accessor:get connectStart:0:undefined|connectEnd:true:true:accessor:get connectEnd:0:undefined|secureConnectionStart:true:true:accessor:get secureConnectionStart:0:undefined|nextHopProtocol:true:true:accessor:get nextHopProtocol:0:undefined|requestStart:true:true:accessor:get requestStart:0:undefined|responseStart:true:true:accessor:get responseStart:0:undefined|responseEnd:true:true:accessor:get responseEnd:0:undefined|encodedBodySize:true:true:accessor:get encodedBodySize:0:undefined|decodedBodySize:true:true:accessor:get decodedBodySize:0:undefined|transferSize:true:true:accessor:get transferSize:0:undefined|deliveryType:true:true:accessor:get deliveryType:0:undefined|responseStatus:true:true:accessor:get responseStatus:0:undefined|toJSON:true:true:true:toJSON:0:false",
    "perf constructors: true true TypeError:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor|TypeError:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor|TypeError:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor|TypeError:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor",
	    "histogram options: monitor-null:TypeError:ERR_INVALID_ARG_TYPE|monitor-array:TypeError:ERR_INVALID_ARG_TYPE|monitor-resolution-string:TypeError:ERR_INVALID_ARG_TYPE|monitor-resolution-zero:RangeError:ERR_OUT_OF_RANGE|monitor-resolution-fraction:RangeError:ERR_OUT_OF_RANGE|monitor-valid:ok:ELDHistogram|hist-null:TypeError:ERR_INVALID_ARG_TYPE|hist-array:TypeError:ERR_INVALID_ARG_TYPE|hist-lowest-string:TypeError:ERR_INVALID_ARG_TYPE|hist-lowest-zero:RangeError:ERR_OUT_OF_RANGE|hist-highest-low:RangeError:ERR_OUT_OF_RANGE|hist-figures-string:TypeError:ERR_INVALID_ARG_TYPE|hist-valid:ok:RecordableHistogram|timerify-array:TypeError:ERR_INVALID_ARG_TYPE",
	    "eld shape: ELDHistogram <none> <none>",
	    "eld proto: constructor,enable,disable <none>",
	    "eld symbols: Symbol(Symbol.dispose):function:[Symbol.dispose]:0:false:true:true:false:",
	    "eld readout proto: constructor,count,countBigInt,min,minBigInt,max,maxBigInt,mean,exceeds,exceedsBigInt,stddev,percentile,percentileBigInt,percentiles,percentilesBigInt,reset,toJSON <none>",
    "eld mutators: undefined undefined undefined",
    "eld values: true true 0 9223372036854776000 0 NaN NaN [[100,0]] {\"count\":0,\"min\":9223372036854776000,\"max\":0,\"mean\":null,\"exceeds\":0,\"stddev\":null,\"percentiles\":{\"100\":0}}",
	    "recordable shape: RecordableHistogram constructor constructor constructor,record,recordDelta,add <none> constructor,count,countBigInt,min,minBigInt,max,maxBigInt,mean,exceeds,exceedsBigInt,stddev,percentile,percentileBigInt,percentiles,percentilesBigInt,reset,toJSON <none> undefined function 3 undefined,undefined,undefined",
	    "observer proto: constructor,observe,disconnect,takeRecords",
	    "observer symbols: Symbol(kMaybeBuffer):function:[kMaybeBuffer]:1:false:true:true:false:|Symbol(kDispatch):function:[kDispatch]:0:false:true:true:false:|Symbol(nodejs.util.inspect.custom):function:[nodejs.util.inspect.custom]:2:false:true:true:false:|Symbol(Symbol.toStringTag):string::19:false:true:false:false:PerformanceObserver",
	    "observer descriptors: observe:true:true:true:observe:0|disconnect:true:true:true:disconnect:0|takeRecords:true:true:true:takeRecords:0",
    "observer supported: false true function dns,function,gc,http,http2,mark,measure,net,quic,resource",
    "observer validation: ctor-missing:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received undefined|ctor-null:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received null|observe-missing:TypeError:ERR_MISSING_ARGS:The \"options.entryTypes\" and \"options.type\" arguments must be specified|observe-null:TypeError:ERR_INVALID_ARG_TYPE:The \"options\" argument must be of type object. Received null|observe-entryTypes-string:TypeError:ERR_INVALID_ARG_TYPE:The \"options.entryTypes\" property must be string[]. Received type string ('mark')|observe-type-plus-entryTypes:TypeError:ERR_INVALID_ARG_VALUE:The property 'options.entryTypes' options.entryTypes can not set with options.type together. Received [ 'mark' ]",
    "entry list proto: constructor,getEntries,getEntriesByType,getEntriesByName",
    "entry list descriptors: getEntries:true:true:true:getEntries:0|getEntriesByType:true:true:true:getEntriesByType:1|getEntriesByName:true:true:true:getEntriesByName:1",
    "perf constants descriptor: true false false object",
    "perf constants object: true true",
    "perf constants names: NODE_PERFORMANCE_GC_MAJOR,NODE_PERFORMANCE_GC_MINOR,NODE_PERFORMANCE_GC_INCREMENTAL,NODE_PERFORMANCE_GC_WEAKCB,NODE_PERFORMANCE_GC_FLAGS_NO,NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED,NODE_PERFORMANCE_GC_FLAGS_FORCED,NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING,NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE,NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY,NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE,NODE_PERFORMANCE_ENTRY_TYPE_GC,NODE_PERFORMANCE_ENTRY_TYPE_HTTP,NODE_PERFORMANCE_ENTRY_TYPE_HTTP2,NODE_PERFORMANCE_ENTRY_TYPE_NET,NODE_PERFORMANCE_ENTRY_TYPE_DNS,NODE_PERFORMANCE_ENTRY_TYPE_QUIC,NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP,NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN,NODE_PERFORMANCE_MILESTONE_ENVIRONMENT,NODE_PERFORMANCE_MILESTONE_NODE_START,NODE_PERFORMANCE_MILESTONE_V8_START,NODE_PERFORMANCE_MILESTONE_LOOP_START,NODE_PERFORMANCE_MILESTONE_LOOP_EXIT,NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE",
    "perf constants rows: NODE_PERFORMANCE_GC_MAJOR:4:true:false:false|NODE_PERFORMANCE_GC_MINOR:1:true:false:false|NODE_PERFORMANCE_GC_INCREMENTAL:8:true:false:false|NODE_PERFORMANCE_GC_WEAKCB:16:true:false:false|NODE_PERFORMANCE_GC_FLAGS_NO:0:true:false:false|NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED:2:true:false:false|NODE_PERFORMANCE_GC_FLAGS_FORCED:4:true:false:false|NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING:8:true:false:false|NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE:16:true:false:false|NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY:32:true:false:false|NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE:64:true:false:false",
    "perf constants hidden rows: NODE_PERFORMANCE_ENTRY_TYPE_GC:0:false:false:false|NODE_PERFORMANCE_ENTRY_TYPE_HTTP:1:false:false:false|NODE_PERFORMANCE_ENTRY_TYPE_HTTP2:2:false:false:false|NODE_PERFORMANCE_ENTRY_TYPE_NET:3:false:false:false|NODE_PERFORMANCE_ENTRY_TYPE_DNS:4:false:false:false|NODE_PERFORMANCE_ENTRY_TYPE_QUIC:5:false:false:false|NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP:0:false:false:false|NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN:1:false:false:false|NODE_PERFORMANCE_MILESTONE_ENVIRONMENT:2:false:false:false|NODE_PERFORMANCE_MILESTONE_NODE_START:3:false:false:false|NODE_PERFORMANCE_MILESTONE_V8_START:4:false:false:false|NODE_PERFORMANCE_MILESTONE_LOOP_START:5:false:false:false|NODE_PERFORMANCE_MILESTONE_LOOP_EXIT:6:false:false:false|NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE:7:false:false:false",
    "true true",
    "xn--maana-pta.com",
    "mañana.com",
    "punycode keys: version,ucs2,decode,encode,toASCII,toUnicode false 2.1.0",
    "punycode meta: decode:decode:1:true|encode:encode:1:true|toASCII:toASCII:1:true|toUnicode:toUnicode:1:true",
    "punycode ucs2: decode,encode decode:ucs2decode:1:true|encode:ucs2encode:1:true",
    "punycode domains: xn--maana-pta.com|xn--maana-pta.com|xn--maana-pta.com|mañana.com",
    "punycode validation: toASCII-null:TypeError:Cannot read properties of null (reading 'split')|toASCII-undefined:TypeError:Cannot read properties of undefined (reading 'split')|toUnicode-null:TypeError:Cannot read properties of null (reading 'split')|encode-null:TypeError:Cannot read properties of null (reading 'length')|decode-null:TypeError:Cannot read properties of null (reading 'lastIndexOf')|ucs2-decode-null:TypeError:Cannot read properties of null (reading 'length')|ucs2-encode-null:TypeError:codePoints is not iterable (cannot read property null)",
    "punycode coercion: encode-number:ok:\"\"|ucs2-decode-number:ok:[]|decode-boolean:TypeError:input.lastIndexOf is not a function|toASCII-number:TypeError:domain.split is not a function|ucs2-encode-string:RangeError:Invalid code point NaN",
    "domain keys: _stack,Domain,createDomain,create,active",
    "domain meta: true true true true true function function true true true createDomain 0",
    "domain active descriptor: true true true true",
	    "domain proto names: constructor,members,_errorHandler,enter,exit,add,remove,run,intercept,bind",
	    "domain proto keys: members,_errorHandler,enter,exit,add,remove,run,intercept,bind",
	    "domain proto descriptors: members:true:true:true:undefined::false|_errorHandler:true:true:true::1:true|enter:true:true:true::0:true|exit:true:true:true::0:true|add:true:true:true::1:true|remove:true:true:true::1:true|run:true:true:true::1:true|intercept:true:true:true::1:true|bind:true:true:true::1:true|dispose:missing",
	    "domain instance: _events,_eventsCount,_maxListeners,members true false true true true",
	    "domain add/remove validation: add-undefined:TypeError::Cannot read properties of undefined (reading 'domain')|remove-undefined:TypeError::Cannot set properties of undefined (setting 'domain')|add-null:TypeError::Cannot read properties of null (reading 'domain')|remove-null:TypeError::Cannot set properties of null (setting 'domain')|add-number:TypeError::Object.defineProperty called on non-object|remove-number:TypeError::Cannot create property 'domain' on number '1'|add-object:ok:true:false:true:true:true|remove-object:ok:true:false:true:true:true|remove-fresh:ok:true:true:true:true:true",
	    "domain: handled",
    "active: true true",
    "inactive: true true",
    "wrappers: runBound 0 ctx:a:b:true:true",
    "intercepted: runIntercepted 0 ctx:a:b:true:true",
    "intercepted error: undefined boom true",
    "emitter: routed true",
    "removed: true true",
    "assigned: manual",
    "deleted: false undefined"
  ]);
});

test("perf_hooks validates mark and measure arguments like Node", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { performance, PerformanceMark, PerformanceMeasure } = require("node:perf_hooks");
      performance.mark("known", { startTime: 10 });
      const describe = (label, action) => {
        try {
          const value = action();
          return [label, "ok", value.name, value.startTime, value.duration, JSON.stringify(value.detail), value.constructor.name].join(":");
        } catch (error) {
          return [label, error.name, error.code ?? "none", error.message].join(":");
        }
      };
      console.log([
        describe("mark-missing", () => performance.mark()),
        describe("mark-options-string", () => performance.mark("x", "bad")),
        describe("mark-neg-start", () => performance.mark("neg", { startTime: -1 })),
        describe("measure-missing", () => performance.measure()),
        describe("measure-null-name", () => performance.measure(null)),
        describe("measure-missing-start", () => performance.measure("m", "missing")),
        describe("measure-missing-option-start", () => performance.measure("m", { start: "missing" })),
        describe("measure-neg-option-start", () => performance.measure("m", { start: -1, duration: 1 })),
        describe("measure-invalid-options", () => performance.measure("m", { start: 1, end: 5, duration: 2 })),
        describe("measure-start-duration", () => performance.measure("m", { start: 1, duration: 2, detail: { ok: true } })),
        describe("measure-known-start", () => performance.measure("m", "known")),
        performance.mark("manual", { startTime: null }) instanceof PerformanceMark,
        performance.measure("manual-measure", null) instanceof PerformanceMeasure
      ].join("\\n"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.deepEqual(lines.slice(0, 10), [
    'mark-missing:TypeError:ERR_MISSING_ARGS:The "name" argument must be specified',
    'mark-options-string:TypeError:ERR_INVALID_ARG_TYPE:The "options" argument must be of type object. Received type string',
    "mark-neg-start:TypeError:ERR_PERFORMANCE_INVALID_TIMESTAMP:-1 is not a valid timestamp",
    'measure-missing:TypeError:ERR_MISSING_ARGS:The "name" argument must be specified',
    'measure-null-name:TypeError:ERR_INVALID_ARG_TYPE:The "name" argument must be of type string. Received null',
    'measure-missing-start:SyntaxError:12:The "missing" performance mark has not been set',
    'measure-missing-option-start:SyntaxError:12:The "missing" performance mark has not been set',
    "measure-neg-option-start:TypeError:ERR_PERFORMANCE_INVALID_TIMESTAMP:-1 is not a valid timestamp",
    "measure-invalid-options:TypeError:ERR_PERFORMANCE_MEASURE_INVALID_OPTIONS:Must not have options.start, options.end, and options.duration specified",
    'measure-start-duration:ok:m:1:2:{"ok":true}:PerformanceMeasure'
  ]);
  assert.match(lines[10], /^measure-known-start:ok:m:10:\d+(?:\.\d+)?:null:PerformanceMeasure$/);
  assert.deepEqual(lines.slice(11), ["true", "true"]);
});

test("perf_hooks PerformanceObserver receives synthetic mark, measure, and function entries", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const { performance, PerformanceObserver, PerformanceObserverEntryList, createHistogram, timerify } = require("node:perf_hooks");

    performance.clearMarks();
    performance.clearMeasures();

    const observed = [];
    const callbackChecks = [];
    const entryListOwnShapes = [];
    const observer = new PerformanceObserver((list, currentObserver) => {
      callbackChecks.push(list instanceof PerformanceObserverEntryList, currentObserver === observer);
      entryListOwnShapes.push(Object.keys(list).join(",") || "<none>", Object.getOwnPropertyNames(list).join(",") || "<none>");
      observed.push(...list.getEntries().map((entry) => \`\${entry.entryType}:\${entry.name}\`));
    });

    console.log(Object.keys(observer).join(",") || "<none>", Object.getOwnPropertyNames(observer).join(",") || "<none>");
    observer.observe({ entryTypes: ["function", "mark", "measure"] });
    performance.mark("observer-start");
    performance.measure("observer-span", "observer-start");
    const histogram = createHistogram();
    const timedAdd = timerify(function add(left, right) {
      return left + right;
    }, { histogram });
    console.log(timedAdd.name, timedAdd.length, timedAdd(2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log(observed.join(","));
    console.log(histogram.count, histogram.min >= 1, typeof histogram.countBigInt, histogram.percentilesBigInt instanceof Map);
    console.log(callbackChecks.every(Boolean), observer.takeRecords().length, entryListOwnShapes.join(":"));

    const buffered = [];
    const bufferedObserver = new PerformanceObserver((list) => {
      buffered.push(...list.getEntriesByType("mark").map((entry) => entry.name));
    });
    bufferedObserver.observe({ type: "mark", buffered: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log(buffered.includes("observer-start"));

    observer.disconnect();
    bufferedObserver.disconnect();
    performance.mark("observer-after-disconnect");
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log(observer.takeRecords().length, bufferedObserver.takeRecords().length);

    try {
      new PerformanceObserver(() => {}).observe();
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "<none> <none>",
    "timerified add 2 5",
    "mark:observer-start,measure:observer-span,function:add",
    "1 true bigint true",
    "true 0 <none>:<none>",
    "true",
    "0 0",
    "ERR_MISSING_ARGS"
  ]);
});

test("perf_hooks resource timing entries follow Node-shaped observer and buffer behavior", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const { performance, PerformanceObserver, PerformanceResourceTiming } = require("node:perf_hooks");

    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(250);
    performance.onresourcetimingbufferfull = null;

    const timingInfo = {
      startTime: 10,
      finalServiceWorkerStartTime: 11,
      redirectStartTime: 12,
      redirectEndTime: 13,
      postRedirectStartTime: 14,
      finalConnectionTimingInfo: {
        domainLookupStartTime: 15,
        domainLookupEndTime: 16,
        connectionStartTime: 17,
        connectionEndTime: 18,
        secureConnectionStartTime: 19,
        ALPNNegotiatedProtocol: "h3"
      },
      finalNetworkRequestStartTime: 20,
      finalNetworkResponseStartTime: 21,
      endTime: 22,
      encodedBodySize: 123,
      decodedBodySize: 456
    };

    const observed = [];
    const observer = new PerformanceObserver((list) => {
      observed.push(...list.getEntriesByType("resource").map((entry) => entry.name));
    });
    observer.observe({ type: "resource" });

    const resource = performance.markResourceTiming(timingInfo, "https://example.test/asset.js", "fetch", globalThis, "", undefined, 206, "cache");
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("entry:", [
      resource instanceof PerformanceResourceTiming,
      resource.entryType,
      resource.startTime,
      resource.duration,
      resource.initiatorType,
      resource.workerStart,
      resource.redirectStart,
      resource.redirectEnd,
      resource.fetchStart,
      resource.domainLookupStart,
      resource.domainLookupEnd,
      resource.connectStart,
      resource.connectEnd,
      resource.secureConnectionStart,
      resource.nextHopProtocol,
      resource.requestStart,
      resource.responseStart,
      resource.responseEnd,
      resource.encodedBodySize,
      resource.decodedBodySize,
      resource.transferSize,
      resource.deliveryType,
      resource.responseStatus
    ].join("|"));
    console.log("lists:", performance.getEntriesByType("resource").map((entry) => entry.name).join(","), performance.getEntriesByName("https://example.test/asset.js", "resource").length, observed.join(","));
    console.log("json keys:", Object.keys(resource.toJSON()).join(","));
    console.log("json:", JSON.stringify(resource.toJSON()));
    console.log("own:", Object.keys(resource).join(",") || "<keys>", Object.getOwnPropertyNames(resource).join(",") || "<own>");

    const buffered = [];
    const bufferedObserver = new PerformanceObserver((list) => {
      buffered.push(...list.getEntries().map((entry) => entry.name));
    });
    bufferedObserver.observe({ type: "resource", buffered: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("buffered:", buffered.join(","));

    observer.disconnect();
    bufferedObserver.disconnect();
    performance.clearResourceTimings();
    console.log("clear:", performance.getEntriesByType("resource").length);

    let full = 0;
    performance.onresourcetimingbufferfull = () => { full++; };
    performance.setResourceTimingBufferSize(1);
    performance.markResourceTiming({ startTime: 1, endTime: 2, encodedBodySize: 1, decodedBodySize: 2 }, "buffer-one", "fetch", globalThis, "", undefined, 200);
    performance.markResourceTiming({ startTime: 2, endTime: 3, encodedBodySize: 3, decodedBodySize: 4 }, "buffer-two", "fetch", globalThis, "", undefined, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("buffer limit:", performance.getEntriesByType("resource").map((entry) => entry.name).join(","), full);

    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(0);
    performance.markResourceTiming({ startTime: 3, endTime: 4, encodedBodySize: 5, decodedBodySize: 6 }, "dropped", "fetch", globalThis, "", undefined, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("buffer zero:", performance.getEntriesByType("resource").length, full);
    try {
      performance.setResourceTimingBufferSize();
    } catch (error) {
      console.log("set missing:", error.name, error.code);
    }
    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(250);
    performance.onresourcetimingbufferfull = null;
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "entry: true|resource|10|12|fetch|11|12|13|14|15|16|17|18|19|h3|20|21|22|123|456|423|cache|206",
    "lists: https://example.test/asset.js 1 https://example.test/asset.js",
    "json keys: name,entryType,startTime,duration,initiatorType,nextHopProtocol,workerStart,redirectStart,redirectEnd,fetchStart,domainLookupStart,domainLookupEnd,connectStart,connectEnd,secureConnectionStart,requestStart,responseStart,responseEnd,transferSize,encodedBodySize,decodedBodySize,deliveryType,responseStatus",
    "json: {\"name\":\"https://example.test/asset.js\",\"entryType\":\"resource\",\"startTime\":10,\"duration\":12,\"initiatorType\":\"fetch\",\"nextHopProtocol\":\"h3\",\"workerStart\":11,\"redirectStart\":12,\"redirectEnd\":13,\"fetchStart\":14,\"domainLookupStart\":15,\"domainLookupEnd\":16,\"connectStart\":17,\"connectEnd\":18,\"secureConnectionStart\":19,\"requestStart\":20,\"responseStart\":21,\"responseEnd\":22,\"transferSize\":423,\"encodedBodySize\":123,\"decodedBodySize\":456,\"deliveryType\":\"cache\",\"responseStatus\":206}",
    "own: <keys> <own>",
    "buffered: https://example.test/asset.js",
    "clear: 0",
    "buffer limit: buffer-one 1",
    "buffer zero: 0 2",
    "set missing: TypeError ERR_MISSING_ARGS"
  ]);
});

test("perf_hooks monitorEventLoopDelay samples browser-safe loop delay", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const { monitorEventLoopDelay, performance } = require("node:perf_hooks");

    (async () => {
      const histogram = monitorEventLoopDelay({ resolution: 1 });
      console.log("state", histogram.enable(), histogram.enable(), typeof histogram.record, typeof histogram.recordDelta, typeof histogram.add);
      await new Promise((resolve) => setTimeout(resolve, 8));
      const start = performance.now();
      while (performance.now() - start < 5) {}
      await new Promise((resolve) => setTimeout(resolve, 8));
      console.log("disable", histogram.disable(), histogram.disable());
      console.log(
        "sampled",
        histogram.count > 0,
        histogram.min !== 9223372036854776000,
        Number.isFinite(histogram.mean),
        Number.isFinite(histogram.stddev),
        histogram.percentiles.has(100),
        histogram.toJSON().count === histogram.count,
        histogram.max >= histogram.min
      );
      histogram.reset();
      console.log("reset", histogram.count, histogram.min, String(histogram.mean), JSON.stringify([...histogram.percentiles]));
    })().catch((error) => {
      console.error(error?.stack ?? error);
      process.exitCode = 1;
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "state true false undefined undefined undefined",
    "disable true false",
    "sampled true true true true true true true",
    "reset 0 9223372036854776000 NaN [[100,0]]"
  ]);
});

test("perf_hooks performance entries are isolated per virtual process", async () => {
  const runProbe = async (source) => {
    const kernel = new Kernel();
    kernel.fs.writeFileSync("/workspace/index.js", source);
    const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });
    assert.equal(result.status, 0, result.stderr.toString());
    return result.stdout.toString().trim();
  };

  const first = await runProbe(`
    const perfHooks = require("node:perf_hooks");
    perfHooks.performance.mark("leak-check");
    console.log(perfHooks.performance === globalThis.performance, perfHooks.timerify === perfHooks.performance.timerify, perfHooks.performance.getEntriesByType("mark").length);
  `);
  const second = await runProbe(`
    const perfHooks = require("node:perf_hooks");
    console.log(perfHooks.performance === globalThis.performance, perfHooks.timerify === perfHooks.performance.timerify, perfHooks.performance.getEntriesByType("mark").length);
  `);

  assert.equal(first, "true true 1");
  assert.equal(second, "true true 0");
});

test("dns, perf_hooks, and v8 expose browser-safe probe helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const dns = require("node:dns");
    const dnsPromises = require("node:dns/promises");
    const perfHooks = require("node:perf_hooks");
    const v8 = require("node:v8");

    dns.setServers(["127.0.0.1", "[::1]:53"]);
    console.log(dns.getServers().join(","));
    console.log(dns.NOTFOUND, dns.ADDRCONFIG, dns.ALL, dns.V4MAPPED, typeof dns.Resolver);
    console.log(Object.hasOwn(dns, "default"), Object.hasOwn(dnsPromises, "default"));
    console.log(dns.lookup.length, dns.resolve.length, dns.resolve4.length, dns.resolve6.length, dnsPromises.lookup.length, dnsPromises.resolve.length, dnsPromises.resolveAny.length);
    console.log(dns.Resolver.prototype.resolve4.length, dns.Resolver.prototype.resolve6.length, dnsPromises.Resolver.prototype.resolve.length, dnsPromises.Resolver.prototype.resolveAny.length, dnsPromises.reverse.length, dnsPromises.Resolver.prototype.reverse.length);
    console.log(dns.resolve.name, dns.resolve4.name, dns.resolveAny.name, dns.reverse.name, dns.getServers.name, dns.setServers.name);
    console.log(dnsPromises.resolve.name, dnsPromises.resolve4.name, dnsPromises.resolveAny.name, dnsPromises.reverse.name, dnsPromises.getServers.name, dnsPromises.setServers.name);
    console.log(dns.Resolver.prototype.resolve4.name, dns.Resolver.prototype.resolveAny.name, dns.Resolver.prototype.reverse.name, dns.Resolver.prototype.setLocalAddress.length, dnsPromises.Resolver.prototype.resolve.name, dnsPromises.Resolver.prototype.resolve4.name, dnsPromises.Resolver.prototype.reverse.name, dnsPromises.Resolver.prototype.setLocalAddress.length);

    const resolver = new dns.Resolver();
    const promiseResolverShape = new dnsPromises.Resolver();
    console.log(typeof resolver.lookup, typeof resolver.lookupService, typeof promiseResolverShape.lookup, typeof promiseResolverShape.lookupService);
    resolver.setServers(["8.8.8.8"]);
    const resolved = await new Promise((resolve, reject) => {
      resolver.resolve4("localhost", { ttl: true }, (error, addresses) => error ? reject(error) : resolve(addresses));
    });
    console.log(resolver.getServers().join(","), resolved.map((record) => \`\${record.address}:\${record.ttl}\`).join(","));

    try {
      await dnsPromises.resolveMx("localhost");
    } catch (error) {
      console.log(error.code, error.syscall, error.hostname);
    }
    try {
      await dnsPromises.resolve4("missing.invalid");
    } catch (error) {
      console.log(error.code, error.syscall, error.hostname);
    }

    const promiseResolver = new dnsPromises.Resolver();
    console.log((await promiseResolver.resolve6("localhost")).join(","));
    console.log(resolver.setLocalAddress("127.0.0.1", "::1") === undefined, promiseResolver.setLocalAddress("127.0.0.1") === undefined);

    for (const probe of [
      () => dns.lookup("", () => {}),
      () => dns.lookup(123, () => {}),
      () => dns.lookup("localhost", { family: 9 }, () => {}),
      () => dns.resolve4(123, () => {}),
      () => dns.lookupService(123, 80, () => {}),
    ]) {
      try {
        probe();
      } catch (error) {
        console.log(error.code);
      }
    }

    const histogram = perfHooks.createHistogram();
    histogram.record(10);
    histogram.record(30);
    console.log(typeof perfHooks.eventLoopUtilization().active, histogram.count, histogram.min, histogram.max, histogram.percentile(50));
    const eventLoopBaseline = perfHooks.eventLoopUtilization();
    console.log(perfHooks.eventLoopUtilization.length, perfHooks.performance.eventLoopUtilization.length, typeof perfHooks.eventLoopUtilization(eventLoopBaseline).active, typeof perfHooks.eventLoopUtilization({ idle: 0, active: 5 }, { idle: 0, active: 2 }).active);
    console.log(histogram.countBigInt, histogram.minBigInt, histogram.maxBigInt, histogram.exceedsBigInt, histogram.percentileBigInt(100));
    console.log(typeof perfHooks.Performance, typeof perfHooks.monitorEventLoopDelay().enable, perfHooks.PerformanceObserver.supportedEntryTypes.includes("function"));
    console.log(perfHooks.performance.nodeTiming.entryType, perfHooks.performance.nodeTiming.name, typeof perfHooks.performance.nodeTiming.duration);
    console.log([
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_NO,
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED,
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_FORCED,
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING,
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE,
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY,
      perfHooks.constants.NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE
    ].join(","));

    const cachedDataVersionTag = v8.cachedDataVersionTag();
    console.log(Number.isInteger(cachedDataVersionTag), cachedDataVersionTag > 0, cachedDataVersionTag === v8.cachedDataVersionTag());
    console.log(Object.keys(v8.getHeapStatistics()).join(","));
    console.log(v8.getHeapCodeStatistics().code_and_metadata_size);
    console.log(v8.getHeapSpaceStatistics()[0].space_name);
    const cppHeapStats = v8.getCppHeapStatistics();
    const cppHeapSpace = cppHeapStats.space_statistics[0];
    const cppHeapFreeList = cppHeapSpace.free_list_stats;
    console.log(cppHeapStats.used_size_bytes);
    console.log("cpp heap root", Object.getPrototypeOf(cppHeapStats) === null, Object.keys(cppHeapStats).join(","), cppHeapStats.space_statistics.length, cppHeapStats.type_names.length, cppHeapStats.detail_level);
    console.log("cpp heap first space", Object.getPrototypeOf(cppHeapSpace) === null, Object.keys(cppHeapSpace).join(","), Array.isArray(cppHeapSpace.page_stats), Object.getPrototypeOf(cppHeapFreeList) === null, Object.keys(cppHeapFreeList).join(","), cppHeapFreeList.bucket_size.length, cppHeapFreeList.free_count.length, cppHeapFreeList.free_size.length);
    console.log("cpp heap names", cppHeapStats.space_statistics.map((space) => space.name).join(","), cppHeapStats.type_names.join(","));
    v8.setFlagsFromString("--expose-gc");
	    console.log([
	      ["missing", () => v8.setFlagsFromString()],
	      ["null", () => v8.setFlagsFromString(null)],
	      ["number", () => v8.setFlagsFromString(1)],
	      ["object", () => v8.setFlagsFromString({})],
	      ["string-object", () => v8.setFlagsFromString(new String("--expose-gc"))]
	    ].map(([label, action]) => {
	      try {
	        action();
	        return label + ":ok";
	      } catch (error) {
	        return label + ":" + error.code;
	      }
	    }).join("|"));
	    v8.takeCoverage();
	    v8.stopCoverage();
	    console.log([
	      ["missing", () => v8.isStringOneByteRepresentation()],
	      ["null", () => v8.isStringOneByteRepresentation(null)],
	      ["number", () => v8.isStringOneByteRepresentation(1)],
	      ["boolean", () => v8.isStringOneByteRepresentation(true)],
	      ["object", () => v8.isStringOneByteRepresentation({})],
	      ["symbol", () => v8.isStringOneByteRepresentation(Symbol("x"))]
	    ].map(([label, action]) => {
	      try {
	        action();
	        return label + ":ok";
	      } catch (error) {
	        return label + ":" + error.code;
	      }
	    }).join("|"));
	    console.log(v8.isStringOneByteRepresentation("abc"), v8.isStringOneByteRepresentation("🙂"));
    const emptyPromiseHookStop = v8.promiseHooks.createHook();
    const promiseHookStop = v8.promiseHooks.createHook({
      init() {},
      before() {},
      after() {},
      settled() {}
    });
    console.log(typeof emptyPromiseHookStop, emptyPromiseHookStop.name, emptyPromiseHookStop.length, emptyPromiseHookStop());
    console.log(typeof promiseHookStop, promiseHookStop.name, promiseHookStop.length, promiseHookStop());
    console.log(["onInit", "onBefore", "onAfter", "onSettled"].map((name) => {
      const stop = v8.promiseHooks[name](() => {});
      return name + ":" + stop.name + ":" + stop.length + ":" + stop();
    }).join("|"));
    console.log([
      ["create-init", () => v8.promiseHooks.createHook({ init: 1 })],
      ["create-before", () => v8.promiseHooks.createHook({ before: 1 })],
      ["create-after", () => v8.promiseHooks.createHook({ after: 1 })],
      ["create-settled", () => v8.promiseHooks.createHook({ settled: 1 })],
      ["onInit", () => v8.promiseHooks.onInit(1)],
      ["onBefore", () => v8.promiseHooks.onBefore(1)],
      ["onAfter", () => v8.promiseHooks.onAfter(1)],
      ["onSettled", () => v8.promiseHooks.onSettled(1)]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return label + ":" + error.code;
      }
    }).join("|"));
    console.log(typeof v8.Serializer, typeof v8.DefaultSerializer, typeof v8.queryObjects, typeof v8.startupSnapshot.isBuildingSnapshot);
    console.log(typeof v8.GCProfiler, typeof v8.startCpuProfile, typeof v8.startHeapProfile);
    console.log([v8.Serializer, v8.Deserializer, v8.DefaultSerializer, v8.DefaultDeserializer, v8.GCProfiler].map((value) => value.name + ":" + value.length).join("|"));
    console.log([v8.setFlagsFromString, v8.startCpuProfile, v8.startHeapProfile, v8.getHeapSnapshot, v8.setHeapSnapshotNearHeapLimit, v8.writeHeapSnapshot].map((value) => value.name + ":" + value.length).join("|"));
    console.log(["cachedDataVersionTag", "getHeapSnapshot", "getHeapStatistics", "getHeapSpaceStatistics", "getHeapCodeStatistics", "getCppHeapStatistics", "setFlagsFromString", "deserialize", "takeCoverage", "stopCoverage", "serialize", "writeHeapSnapshot", "queryObjects", "setHeapSnapshotNearHeapLimit", "isStringOneByteRepresentation", "startCpuProfile", "startHeapProfile"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(v8[name], "prototype");
      return [name, Object.hasOwn(v8[name], "prototype"), descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, descriptor && Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
    }).join("|"));
    console.log(Object.keys(v8).join(","));
    console.log(Object.getOwnPropertyNames(v8.Serializer.prototype).join(","));
    console.log(Object.keys(v8.Serializer.prototype).join(","));
    console.log(["writeValue", "transferArrayBuffer", "writeUint32", "writeUint64", "writeDouble", "writeRawBytes", "_getDataCloneError"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(v8.Serializer.prototype, name);
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, "prototype");
      return [
        name,
        descriptor.value.name,
        descriptor.value.length,
        descriptor.enumerable,
        Object.hasOwn(descriptor.value, "prototype"),
        prototypeDescriptor?.enumerable,
        prototypeDescriptor?.configurable,
        prototypeDescriptor?.writable,
        Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(",")
      ].join(":");
    }).join("|"));
    console.log(Object.getOwnPropertyNames(v8.Deserializer.prototype).join(","));
    console.log(Object.keys(v8.Deserializer.prototype).join(","));
    console.log(["transferArrayBuffer", "_readRawBytes", "readRawBytes"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(v8.Deserializer.prototype, name);
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, "prototype");
      return [
        name,
        descriptor.value.name,
        descriptor.value.length,
        descriptor.enumerable,
        Object.hasOwn(descriptor.value, "prototype"),
        prototypeDescriptor?.enumerable,
        prototypeDescriptor?.configurable,
        prototypeDescriptor?.writable,
        Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(",")
      ].join(":");
    }).join("|"));
    console.log(["onInit", "onBefore", "onAfter", "onSettled"].map((name) => name + ":" + v8.promiseHooks[name].name + ":" + v8.promiseHooks[name].length).join("|"));
    console.log(["addDeserializeCallback", "addSerializeCallback", "setDeserializeMainFunction", "isBuildingSnapshot"].map((name) => name + ":" + v8.startupSnapshot[name].name + ":" + v8.startupSnapshot[name].length).join("|"));
    console.log([...Object.keys(v8.promiseHooks).map((name) => ["promiseHooks", name, v8.promiseHooks[name]]), ...Object.keys(v8.startupSnapshot).map((name) => ["startupSnapshot", name, v8.startupSnapshot[name]])].map(([group, name, value]) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, "prototype");
      return [group + "." + name, value.name, value.length, Object.hasOwn(value, "prototype"), descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, descriptor && Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
    }).join("|"));
    const gcProfiler = new v8.GCProfiler();
    console.log(gcProfiler.start(), gcProfiler.stop().version);
	    const gcDisposeDescriptor = Object.getOwnPropertyDescriptor(v8.GCProfiler.prototype, Symbol.dispose);
	    const gcDisposable = new v8.GCProfiler();
	    gcDisposable.start();
	    console.log("gc dispose", Object.getOwnPropertySymbols(v8.GCProfiler.prototype).map(String).join(","), gcDisposeDescriptor.value.name, gcDisposeDescriptor.value.length, gcDisposeDescriptor.enumerable, gcDisposeDescriptor.configurable, gcDisposeDescriptor.writable, Object.hasOwn(gcDisposeDescriptor.value, "prototype"), gcDisposable[Symbol.dispose]());
	    const cpuProfile = v8.startCpuProfile();
	    const heapProfile = v8.startHeapProfile();
	    console.log("profile handles", [cpuProfile, heapProfile].map((handle) => {
	      const prototype = Object.getPrototypeOf(handle);
	      const constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
	      const stopDescriptor = Object.getOwnPropertyDescriptor(prototype, "stop");
	      const disposeDescriptor = Object.getOwnPropertyDescriptor(prototype, Symbol.dispose);
	      const constructor = constructorDescriptor.value;
	      return [constructor.name, constructor.length, constructorDescriptor.enumerable, constructorDescriptor.configurable, constructorDescriptor.writable, Object.hasOwn(constructor, "prototype"), Object.getOwnPropertyNames(constructor.prototype).join(","), stopDescriptor.value.name, stopDescriptor.value.length, Object.hasOwn(stopDescriptor.value, "prototype"), typeof disposeDescriptor.value, disposeDescriptor.value.name, disposeDescriptor.value.length].join(":");
	    }).join("|"));
	    const cpuProfileData = JSON.parse(cpuProfile.stop());
	    console.log(cpuProfileData.nodes[0].callFrame.functionName, Array.isArray(cpuProfileData.samples), typeof cpuProfile[Symbol.dispose]);
	    const heapProfileData = JSON.parse(heapProfile.stop());
	    console.log(heapProfileData.head.callFrame.functionName, Array.isArray(heapProfileData.samples), typeof heapProfile[Symbol.dispose]);
    try {
      v8.startCpuProfile("bad");
    } catch (error) {
      console.log(error.code);
    }
	    try {
	      v8.setHeapSnapshotNearHeapLimit("bad");
	    } catch (error) {
	      console.log(error.code);
	    }
	    console.log([
	      ["heap-limit-missing", () => v8.setHeapSnapshotNearHeapLimit()],
	      ["heap-limit-string", () => v8.setHeapSnapshotNearHeapLimit("1")],
	      ["heap-limit-float", () => v8.setHeapSnapshotNearHeapLimit(1.5)],
	      ["heap-limit-nan", () => v8.setHeapSnapshotNearHeapLimit(NaN)],
	      ["heap-limit-zero", () => v8.setHeapSnapshotNearHeapLimit(0)],
	      ["heap-limit-negative", () => v8.setHeapSnapshotNearHeapLimit(-1)],
	      ["heap-limit-too-large", () => v8.setHeapSnapshotNearHeapLimit(4294967296)],
	      ["heap-limit-valid", () => v8.setHeapSnapshotNearHeapLimit(1)]
	    ].map(([label, action]) => {
	      try {
	        action();
	        return label + ":ok";
	      } catch (error) {
	        return label + ":" + error.code;
	      }
	    }).join("|"));
	    console.log([
	      ["deserialize-missing", () => v8.deserialize()],
	      ["deserialize-null", () => v8.deserialize(null)],
	      ["deserialize-string", () => v8.deserialize("x")],
	      ["deserialize-arraybuffer", () => v8.deserialize(new ArrayBuffer(4))],
	      ["deserialize-invalid-data", () => v8.deserialize(new DataView(new ArrayBuffer(4)))],
	      ["heap-options", () => v8.getHeapSnapshot("bad")],
	      ["heap-options-array", () => v8.getHeapSnapshot([])],
	      ["write-options", () => v8.writeHeapSnapshot("x", "bad")],
	      ["write-path", () => v8.writeHeapSnapshot(1)]
	    ].map(([label, action]) => {
	      try {
	        action();
	        return label + ":ok";
	      } catch (error) {
	        return label + ":" + (error.code ?? error.name);
	      }
	    }).join("|"));
	    console.log([
	      ["deserializer-missing", () => new v8.Deserializer()],
	      ["deserializer-null", () => new v8.Deserializer(null)],
	      ["deserializer-string", () => new v8.Deserializer("x")],
	      ["deserializer-arraybuffer", () => new v8.Deserializer(new ArrayBuffer(4))],
	      ["default-deserializer-missing", () => new v8.DefaultDeserializer()],
	      ["default-deserializer-arraybuffer", () => new v8.DefaultDeserializer(new ArrayBuffer(4))],
	      ["raw-missing", () => new v8.Serializer().writeRawBytes()],
	      ["raw-string", () => new v8.Serializer().writeRawBytes("hi")],
	      ["raw-arraybuffer", () => new v8.Serializer().writeRawBytes(new ArrayBuffer(2))],
	      ["raw-dataview", () => new v8.Serializer().writeRawBytes(new DataView(new ArrayBuffer(2)))]
	    ].map(([label, action]) => {
	      try {
	        action();
	        return label + ":ok";
	      } catch (error) {
	        return label + ":" + (error.code ?? error.name);
	      }
	    }).join("|"));
	    const serializedForValidation = v8.serialize({});
	    const rawDeserializerForValidation = () => {
	      const serializer = new v8.Serializer();
	      serializer.writeHeader();
	      serializer.writeRawBytes(new Uint8Array([0x68, 0x69]));
	      const deserializer = new v8.Deserializer(serializer.releaseBuffer());
	      deserializer.readHeader();
	      return deserializer;
	    };
	    console.log([
	      ["serializer-transfer-missing", () => new v8.Serializer().transferArrayBuffer()],
	      ["serializer-transfer-typed-array", () => new v8.Serializer().transferArrayBuffer(1, new Uint8Array(1))],
	      ["serializer-transfer-dataview", () => new v8.Serializer().transferArrayBuffer(1, new DataView(new ArrayBuffer(1)))],
	      ["serializer-transfer-ok", () => new v8.Serializer().transferArrayBuffer("loose-id", new ArrayBuffer(1))],
	      ["deserializer-transfer-missing", () => new v8.Deserializer(serializedForValidation).transferArrayBuffer()],
	      ["deserializer-transfer-typed-array", () => new v8.Deserializer(serializedForValidation).transferArrayBuffer(1, new Uint8Array(1))],
	      ["deserializer-transfer-ok", () => new v8.Deserializer(serializedForValidation).transferArrayBuffer("loose-id", new ArrayBuffer(1))]
	    ].map(([label, action]) => {
	      try {
	        action();
	        return label + ":ok";
	      } catch (error) {
	        return label + ":" + (error.code ?? error.name);
	      }
	    }).join("|"));
	    console.log([
	      ["readRaw-negative", () => rawDeserializerForValidation().readRawBytes(-1)],
	      ["_readRaw-negative", () => rawDeserializerForValidation()._readRawBytes(-1)],
	      ["readRaw-after-negative", () => {
	        const deserializer = rawDeserializerForValidation();
	        try {
	          deserializer.readRawBytes(-1);
	        } catch {}
	        return deserializer.readRawBytes(2).toString("hex");
	      }]
	    ].map(([label, action]) => {
	      try {
	        return label + ":ok:" + action();
	      } catch (error) {
	        return label + ":" + (error.code ?? error.name) + ":" + error.message;
	      }
	    }).join("|"));

	    const serializer = new v8.Serializer();
    serializer.writeHeader();
    serializer.writeUint32(42);
    serializer.writeUint64(1, 2);
    serializer.writeDouble(1.5);
    serializer.writeRawBytes(Buffer.from("hi"));
    const deserializer = new v8.Deserializer(serializer.releaseBuffer());
    console.log(
      deserializer.readHeader(),
      deserializer.readUint32(),
      deserializer.readUint64().join(":"),
      deserializer.readDouble(),
      deserializer.readRawBytes(2).toString()
    );

    const defaultSerializer = new v8.DefaultSerializer();
    defaultSerializer.writeHeader();
    defaultSerializer.writeValue({ nested: true });
    const defaultDeserializer = new v8.DefaultDeserializer(defaultSerializer.releaseBuffer());
    defaultDeserializer.readHeader();
    console.log(defaultDeserializer.readValue().nested, defaultDeserializer.getWireFormatVersion());

    const circular = { name: "root" };
    circular.self = circular;
    const serialized = v8.serialize({
      big: 123n,
      map: new Map([[1, "one"]]),
      set: new Set(["x"]),
      date: new Date("2020-01-01T00:00:00.000Z"),
      regexp: /open/gi,
      buffer: Buffer.from("hi"),
      typed: new Uint16Array([7, 9]),
      circular
    });
    const restored = v8.deserialize(serialized);
    console.log(
      Buffer.isBuffer(serialized),
      typeof restored.big,
      restored.map.get(1),
      restored.set.has("x")
    );
    console.log(
      restored.date.toISOString(),
      restored.regexp.source,
      restored.regexp.flags,
      Buffer.isBuffer(restored.buffer),
      restored.buffer.toString()
    );
    console.log(restored.typed.constructor.name, restored.typed.join(","), restored.circular.self === restored.circular);
    const wrappedSerialized = new v8.DefaultDeserializer(serialized);
    console.log(wrappedSerialized.readHeader(), wrappedSerialized.readValue().map.get(1));
    console.log(v8.queryObjects(Object), v8.startupSnapshot.isBuildingSnapshot());
    try {
      v8.startupSnapshot.addSerializeCallback(() => {});
    } catch (error) {
      console.log(error.code);
    }

    try {
      v8.getHeapSnapshot();
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "127.0.0.1,::1",
    "ENOTFOUND 1024 256 2048 function",
    "false false",
    "3 3 2 2 2 2 2",
    "2 2 2 2 2 2",
    "bound resolve bound queryA bound queryAny bound getHostByAddr bound getServers defaultResolverSetServers",
    "bound resolve bound queryA bound queryAny bound getHostByAddr bound getServers defaultResolverSetServers",
    "queryA queryAny getHostByAddr 2 resolve queryA getHostByAddr 2",
    "undefined undefined undefined undefined",
    "8.8.8.8 127.0.0.1:0",
    "ENODATA queryMx localhost",
    "ENOTFOUND queryA missing.invalid",
    "::1",
    "true true",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_VALUE",
    "number 2 10 30 10",
    "2 2 number number",
    "2n 10n 30n 0n 30n",
    "function function true",
    "node node number",
    "0,2,4,8,16,32,64",
    "true true true",
    "total_heap_size,total_heap_size_executable,total_physical_size,total_available_size,used_heap_size,heap_size_limit,malloced_memory,peak_malloced_memory,does_zap_garbage,number_of_native_contexts,number_of_detached_contexts,total_global_handles_size,used_global_handles_size,external_memory,total_allocated_bytes",
    "0",
    "read_only_space",
    "0",
    "cpp heap root true committed_size_bytes,resident_size_bytes,used_size_bytes,space_statistics,type_names,detail_level 5 1 detailed",
    "cpp heap first space true name,committed_size_bytes,resident_size_bytes,used_size_bytes,page_stats,free_list_stats true true bucket_size,free_count,free_size 17 17 17",
    "cpp heap names NormalPageSpace0,NormalPageSpace1,NormalPageSpace2,NormalPageSpace3,LargePageSpace OpenContainers / VirtualRuntime",
    "missing:ERR_INVALID_ARG_TYPE|null:ERR_INVALID_ARG_TYPE|number:ERR_INVALID_ARG_TYPE|object:ERR_INVALID_ARG_TYPE|string-object:ERR_INVALID_ARG_TYPE",
	    "missing:ERR_INVALID_ARG_TYPE|null:ERR_INVALID_ARG_TYPE|number:ERR_INVALID_ARG_TYPE|boolean:ERR_INVALID_ARG_TYPE|object:ERR_INVALID_ARG_TYPE|symbol:ERR_INVALID_ARG_TYPE",
	    "true false",
    "function  0 undefined",
    "function  0 undefined",
    "onInit:bound stop:0:undefined|onBefore:bound stop:0:undefined|onAfter:bound stop:0:undefined|onSettled:bound stop:0:undefined",
    "create-init:ERR_INVALID_ARG_TYPE|create-before:ERR_INVALID_ARG_TYPE|create-after:ERR_INVALID_ARG_TYPE|create-settled:ERR_INVALID_ARG_TYPE|onInit:ERR_INVALID_ARG_TYPE|onBefore:ERR_INVALID_ARG_TYPE|onAfter:ERR_INVALID_ARG_TYPE|onSettled:ERR_INVALID_ARG_TYPE",
    "function function function function",
    "function function function",
    "Serializer:0|Deserializer:1|DefaultSerializer:0|DefaultDeserializer:0|GCProfiler:0",
    "setFlagsFromString:1|startCpuProfile:1|startHeapProfile:1|getHeapSnapshot:1|setHeapSnapshotNearHeapLimit:1|writeHeapSnapshot:2",
    "cachedDataVersionTag:false::::|getHeapSnapshot:true:false:false:true:constructor|getHeapStatistics:true:false:false:true:constructor|getHeapSpaceStatistics:true:false:false:true:constructor|getHeapCodeStatistics:true:false:false:true:constructor|getCppHeapStatistics:true:false:false:true:constructor|setFlagsFromString:true:false:false:true:constructor|deserialize:true:false:false:true:constructor|takeCoverage:false::::|stopCoverage:false::::|serialize:true:false:false:true:constructor|writeHeapSnapshot:true:false:false:true:constructor|queryObjects:true:false:false:true:constructor|setHeapSnapshotNearHeapLimit:true:false:false:true:constructor|isStringOneByteRepresentation:true:false:false:true:constructor|startCpuProfile:true:false:false:true:constructor|startHeapProfile:true:false:false:true:constructor",
    "cachedDataVersionTag,getHeapSnapshot,getHeapStatistics,getHeapSpaceStatistics,getHeapCodeStatistics,getCppHeapStatistics,setFlagsFromString,Serializer,Deserializer,DefaultSerializer,DefaultDeserializer,deserialize,takeCoverage,stopCoverage,serialize,writeHeapSnapshot,promiseHooks,queryObjects,startupSnapshot,setHeapSnapshotNearHeapLimit,GCProfiler,isStringOneByteRepresentation,startCpuProfile,startHeapProfile",
    "writeHeader,writeValue,releaseBuffer,transferArrayBuffer,writeUint32,writeUint64,writeDouble,writeRawBytes,_setTreatArrayBufferViewsAsHostObjects,constructor,_getDataCloneError",
    "writeHeader,writeValue,releaseBuffer,transferArrayBuffer,writeUint32,writeUint64,writeDouble,writeRawBytes,_setTreatArrayBufferViewsAsHostObjects,_getDataCloneError",
    "writeValue:writeValue:0:true:false::::|transferArrayBuffer:transferArrayBuffer:0:true:false::::|writeUint32:writeUint32:0:true:false::::|writeUint64:writeUint64:0:true:false::::|writeDouble:writeDouble:0:true:false::::|writeRawBytes:writeRawBytes:0:true:false::::|_getDataCloneError:Error:1:true:true:false:false:false:constructor,name,message,toString",
    "readHeader,readValue,getWireFormatVersion,transferArrayBuffer,readUint32,readUint64,readDouble,_readRawBytes,constructor,readRawBytes",
    "readHeader,readValue,getWireFormatVersion,transferArrayBuffer,readUint32,readUint64,readDouble,_readRawBytes,readRawBytes",
    "transferArrayBuffer:transferArrayBuffer:0:true:false::::|_readRawBytes:_readRawBytes:0:true:false::::|readRawBytes:readRawBytes:1:true:true:false:false:true:constructor",
    "onInit::1|onBefore::1|onAfter::1|onSettled::1",
    "addDeserializeCallback:addDeserializeCallback:2|addSerializeCallback:addSerializeCallback:2|setDeserializeMainFunction:setDeserializeMainFunction:2|isBuildingSnapshot:isBuildingSnapshot:0",
    "promiseHooks.createHook:createHook:0:true:false:false:true:constructor|promiseHooks.onInit::1:false::::|promiseHooks.onBefore::1:false::::|promiseHooks.onAfter::1:false::::|promiseHooks.onSettled::1:false::::|startupSnapshot.addDeserializeCallback:addDeserializeCallback:2:true:false:false:true:constructor|startupSnapshot.addSerializeCallback:addSerializeCallback:2:true:false:false:true:constructor|startupSnapshot.setDeserializeMainFunction:setDeserializeMainFunction:2:true:false:false:true:constructor|startupSnapshot.isBuildingSnapshot:isBuildingSnapshot:0:true:false:false:true:constructor",
	    "undefined 1",
	    "gc dispose Symbol(Symbol.dispose) [Symbol.dispose] 0 false true true false undefined",
	    "profile handles SyncCPUProfileHandle:1:false:true:true:true:constructor,stop:stop:0:false:function:[Symbol.dispose]:0|SyncHeapProfileHandle:0:false:true:true:true:constructor,stop:stop:0:false:function:[Symbol.dispose]:0",
	    "(root) true function",
	    "(root) true function",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "heap-limit-missing:ERR_INVALID_ARG_TYPE|heap-limit-string:ERR_INVALID_ARG_TYPE|heap-limit-float:ERR_OUT_OF_RANGE|heap-limit-nan:ERR_OUT_OF_RANGE|heap-limit-zero:ERR_OUT_OF_RANGE|heap-limit-negative:ERR_OUT_OF_RANGE|heap-limit-too-large:ERR_OUT_OF_RANGE|heap-limit-valid:ERR_OPENCONTAINERS_V8_UNSUPPORTED",
	    "deserialize-missing:ERR_INVALID_ARG_TYPE|deserialize-null:ERR_INVALID_ARG_TYPE|deserialize-string:ERR_INVALID_ARG_TYPE|deserialize-arraybuffer:ERR_INVALID_ARG_TYPE|deserialize-invalid-data:Error|heap-options:ERR_INVALID_ARG_TYPE|heap-options-array:ERR_INVALID_ARG_TYPE|write-options:ERR_INVALID_ARG_TYPE|write-path:ERR_INVALID_ARG_TYPE",
	    "deserializer-missing:ERR_INVALID_ARG_TYPE|deserializer-null:ERR_INVALID_ARG_TYPE|deserializer-string:ERR_INVALID_ARG_TYPE|deserializer-arraybuffer:ERR_INVALID_ARG_TYPE|default-deserializer-missing:ERR_INVALID_ARG_TYPE|default-deserializer-arraybuffer:ERR_INVALID_ARG_TYPE|raw-missing:ERR_INVALID_ARG_TYPE|raw-string:ERR_INVALID_ARG_TYPE|raw-arraybuffer:ERR_INVALID_ARG_TYPE|raw-dataview:ok",
	    "serializer-transfer-missing:ERR_INVALID_ARG_TYPE|serializer-transfer-typed-array:ERR_INVALID_ARG_TYPE|serializer-transfer-dataview:ERR_INVALID_ARG_TYPE|serializer-transfer-ok:ok|deserializer-transfer-missing:ERR_INVALID_ARG_TYPE|deserializer-transfer-typed-array:ERR_INVALID_ARG_TYPE|deserializer-transfer-ok:ok",
	    "readRaw-negative:Error:ReadRawBytes() failed|_readRaw-negative:Error:ReadRawBytes() failed|readRaw-after-negative:ok:6869",
	    "true 42 1:2 1.5 hi",
    "true 15",
    "true bigint one true",
    "2020-01-01T00:00:00.000Z open gi true hi",
    "Uint16Array 7,9 true",
    "true one",
    "0 false",
    "ERR_NOT_BUILDING_SNAPSHOT",
    "ERR_OPENCONTAINERS_V8_UNSUPPORTED"
  ]);
});

test("node:v8 rejects direct SharedArrayBuffer serialization like Node", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const v8 = require("node:v8");

    const describe = (label, action) => {
      try {
        const result = action();
        return [label, "ok", result.constructor.name, result.length > 0].join(":");
      } catch (error) {
        return [label, error.constructor.name, error.code ?? "", error.message].join(":");
      }
    };

    console.log(describe("serialize-shared", () => v8.serialize(new SharedArrayBuffer(1))));
    console.log(describe("write-shared", () => {
      const serializer = new v8.Serializer();
      serializer.writeValue(new SharedArrayBuffer(1));
      return serializer.releaseBuffer();
    }));
    console.log(describe("serialize-shared-view", () => v8.serialize(new Uint8Array(new SharedArrayBuffer(2)))));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "serialize-shared:Error::#<SharedArrayBuffer> could not be cloned.",
    "write-shared:Error::#<SharedArrayBuffer> could not be cloned.",
    "serialize-shared-view:ok:Buffer:true"
  ]);
});

test("node:v8 Serializer releaseBuffer consumes pending entries like Node", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const v8 = require("node:v8");

    const empty = new v8.Serializer();
    console.log("empty", empty.releaseBuffer().length, empty.releaseBuffer().length);

    const failed = new v8.Serializer();
    try {
      failed.writeValue(function f() {});
    } catch (error) {
      console.log("failed", error.constructor.name, error.message, failed.releaseBuffer().length);
    }

    const header = new v8.Serializer();
    header.writeHeader();
    console.log("header", header.releaseBuffer().length > 0, header.releaseBuffer().length);

    const value = new v8.Serializer();
    value.writeHeader();
    value.writeValue({ ok: true });
    const released = value.releaseBuffer();
    const deserializer = new v8.Deserializer(released);
    console.log("value", released.length > 0, value.releaseBuffer().length, deserializer.readHeader(), deserializer.readValue().ok);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "empty 0 0",
    "failed Error function f() {} could not be cloned. 0",
    "header true 0",
    "value true 0 true true"
  ]);
});

test("node:test supports common skip, todo, subtest, and mock helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const test = require("node:test");

    let ran = 0;
    test.skip("skipped", () => { ran += 100; });
    test.todo("todo", () => { ran += 100; });
    await test("parent", async (t) => {
      await t.test("child", () => { ran += 1; });
      t.skip("note");
      t.todo("later");
    });
    console.log("context outside", test.getTestContext());
    await test("context", async (t) => {
      console.log("context inside", test.getTestContext() === t, test.getTestContext().name);
      await t.test("child context", (child) => {
        console.log("context child", test.getTestContext() === child, test.getTestContext().name);
      });
      console.log("context restored", test.getTestContext() === t);
    });

    const suiteEvents = [];
    await test.describe("suite", () => {
      test.before(() => suiteEvents.push("before"));
      test.after(() => suiteEvents.push("after"));
      test.beforeEach((t) => suiteEvents.push("beforeEach:" + t.name));
      test.afterEach((t) => suiteEvents.push("afterEach:" + t.name));
      test.it("one", (t) => {
        suiteEvents.push("one:" + t.name);
      });
      test.it("two", async (t) => {
        await Promise.resolve();
        suiteEvents.push("two:" + t.name);
      });
      test.describe("nested", () => {
        test.beforeEach(() => suiteEvents.push("nestedBeforeEach"));
        test.it("three", () => {
          suiteEvents.push("three");
        });
      });
    });
    console.log("suite events", suiteEvents.join("|"));
    console.log("suite aliases", test.describe === test.suite, test.it === test.test, typeof test.beforeEach);

    const fn = test.mock.fn((value) => value + 1);
    fn.mock.mockImplementationOnce((value) => value + 10);
    console.log(fn(1), fn(1), fn.mock.callCount(), fn.mock.calls[0].result, fn.mock.calls[0].arguments[0]);

    const target = {
      value: 1,
      add(step) {
        this.value += step;
        return this.value;
      }
    };
    const mocked = test.mock.method(target, "add", function add(step) {
      return this.value + step + 10;
    });
    console.log(target.add(2), target.value, mocked.mock.callCount());
    mocked.mock.mockImplementation(function add(step) {
      this.value += step * 2;
      return this.value;
    });
    console.log(target.add(2), target.value, mocked.mock.callCount());
    mocked.mock.restore();
    console.log(target.add(2), target.value);

    const timerEvents = [];
    test.mock.timers.enable({ apis: ["setTimeout", "setInterval", "setImmediate", "Date"], now: 1000 });
    setTimeout(() => timerEvents.push("timeout:" + Date.now()), 50);
    const interval = setInterval(() => {
      timerEvents.push("interval:" + Date.now());
      clearInterval(interval);
    }, 25);
    setImmediate(() => timerEvents.push("immediate:" + Date.now()));
    test.mock.timers.tick(25);
    console.log("timer events", timerEvents.join("|"));
    test.mock.timers.tick(25);
    console.log("timer events", timerEvents.join("|"));
    test.mock.timers.setTime(new Date(2000));
    console.log("mock date", Date.now(), new Date().toISOString());
    setTimeout(() => timerEvents.push("runAll:" + Date.now()), 10);
    test.mock.timers.runAll();
    console.log("timer events", timerEvents.join("|"));
    test.mock.timers.reset();
    console.log("timers", test.mock.timers.enabled, typeof Date.now());

    const runResult = test.run();
    const stream = require("node:stream");
    const runPrototype = Object.getPrototypeOf(runResult);
    const runPrototypeMethods = Object.getOwnPropertyNames(runPrototype).filter((name) => name !== "constructor");
    const runPrototypeMeta = runPrototypeMethods.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(runPrototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
    }).join("|");
    const emittedRunEvents = [];
    for (const type of ["test:diagnostic", "test:plan", "test:interrupted"]) {
      runResult.on(type, (data) => emittedRunEvents.push(type + ":" + (data.message ?? data.count ?? data.reason)));
    }
    const runEvents = [];
    runResult.diagnostic(0, "hello", 1);
    runResult.plan(0, 2, 1);
    runResult.interrupted("stop");
    runResult.end();
    for await (const event of runResult) runEvents.push(event.type + ":" + (event.data.message ?? event.data.count ?? event.data.reason));
    console.log("run metadata", test.run.name, test.run.length);
    console.log(ran, typeof test.getTestContext, typeof test.suite, typeof test.assert, typeof test.snapshot);
    console.log(Object.keys(test.assert).join(","), Object.keys(test.snapshot).sort().join(","));
    console.log(test.assert.register("probe", () => {}) === undefined, test.snapshot.setDefaultSnapshotSerializers([]) === undefined, test.snapshot.setResolveSnapshotPath(() => "snapshot") === undefined);
    console.log(runResult.on("test:pass", () => {}) === runResult, typeof runResult[Symbol.asyncIterator]);
    console.log("run stream", runResult.constructor.name, runResult instanceof stream.Readable, runResult.readableObjectMode, runResult.readableHighWaterMark, Object.getOwnPropertyNames(runPrototype).join(","), Object.keys(runPrototype).join(",") || "<none>");
    console.log("run stream methods", ["on", "once", "off", "pipe", "destroy", "compose", "map", "filter"].map((name) => typeof runResult[name]).join(","));
    console.log("run stream prototype", runPrototypeMeta);
    console.log("run stream emitted", emittedRunEvents.join("|"));
    console.log("run stream events", runEvents.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "context outside undefined",
    "context inside true context",
    "context child true child context",
    "context restored true",
    "suite events before|beforeEach:one|one:one|afterEach:one|beforeEach:two|two:two|afterEach:two|beforeEach:three|nestedBeforeEach|three|afterEach:three|after",
    "suite aliases true true function",
    "11 2 2 11 1",
    "13 1 1",
    "5 5 2",
    "7 7",
    "timer events immediate:1025|interval:1025",
    "timer events immediate:1025|interval:1025|timeout:1050",
    "mock date 2000 1970-01-01T00:00:02.000Z",
    "timer events immediate:1025|interval:1025|timeout:1050|runAll:2010",
    "timers undefined number",
    "run metadata run 0",
    "1 function function object object",
    "register setDefaultSnapshotSerializers,setResolveSnapshotPath",
    "true true true",
    "true function",
    "run stream TestsStream true true 9007199254740991 constructor,_read,fail,ok,complete,plan,getSkip,getTodo,getXFail,enqueue,dequeue,start,diagnostic,coverage,summary,interrupted,end <none>",
    "run stream methods function,function,function,function,function,function,function,function",
    "run stream prototype _read:_read:0:false:true:true:false|fail:fail:9:false:true:true:false|ok:ok:9:false:true:true:false|complete:complete:9:false:true:true:false|plan:plan:3:false:true:true:false|getSkip:getSkip:0:false:true:true:false|getTodo:getTodo:0:false:true:true:false|getXFail:getXFail:0:false:true:true:false|enqueue:enqueue:7:false:true:true:false|dequeue:dequeue:7:false:true:true:false|start:start:6:false:true:true:false|diagnostic:diagnostic:3:false:true:true:false|coverage:coverage:3:false:true:true:false|summary:summary:5:false:true:true:false|interrupted:interrupted:1:false:true:true:false|end:end:0:false:true:true:false",
    "run stream emitted test:diagnostic:hello|test:plan:2|test:interrupted:stop",
    "run stream events test:diagnostic:hello|test:plan:2|test:interrupted:stop"
  ]);
});

test("node:test exposes per-test snapshot assertion helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const test = require("node:test");

    await test("snapshot assertions", (t) => {
      const describe = (object, name) => {
        const descriptor = Object.getOwnPropertyDescriptor(object, name);
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      };

      console.log(Object.getPrototypeOf(t.assert) === null, Object.keys(t.assert).join(","));
      console.log(["deepEqual", "snapshot", "fileSnapshot", "ok"].map((name) => describe(t.assert, name)).join("|"));
      t.assert.equal(1, "1");
      t.assert.deepStrictEqual({ ok: true }, { ok: true });
      t.assert.ok(true);

      for (const [label, action] of [
        ["snapshot", () => t.assert.snapshot("value")],
        ["fileSnapshot", () => t.assert.fileSnapshot("value", "snapshot.txt")],
        ["fileSnapshotMissingPath", () => t.assert.fileSnapshot("value")]
      ]) {
        try {
          action();
        } catch (error) {
          console.log(label, error.name, error.code, error.message);
        }
      }
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true deepEqual,deepStrictEqual,doesNotMatch,doesNotReject,doesNotThrow,equal,fail,ifError,match,notDeepEqual,notDeepStrictEqual,notEqual,notStrictEqual,partialDeepStrictEqual,rejects,strictEqual,throws,snapshot,fileSnapshot,ok",
    "deepEqual:true:true:true::0:false|snapshot:true:true:true::0:false|fileSnapshot:true:true:true::0:false|ok:true:true:true:ok:0:true",
    "snapshot Error ERR_INVALID_STATE Invalid state: Invalid snapshot filename.",
    "fileSnapshot Error ERR_INVALID_STATE Invalid state: Cannot read snapshot file 'snapshot.txt.' Missing snapshots can be generated by rerunning the command with the --test-update-snapshots flag.",
    "fileSnapshotMissingPath TypeError ERR_INVALID_ARG_TYPE The \"path\" argument must be of type string. Received undefined"
  ]);
});

test("node:test and node:repl expose Node-shaped export metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const nodeTest = require("node:test");
	    const repl = require("node:repl");

	    console.log(Object.keys(nodeTest).join(","));
	    console.log(Object.getOwnPropertyNames(nodeTest).join(","));
	    console.log(Object.hasOwn(nodeTest, "default"), Object.hasOwn(nodeTest, "prototype"), nodeTest.name, nodeTest.length);
    try {
      new nodeTest();
    } catch (error) {
      console.log(error.name, /not a constructor/.test(error.message));
    }
    console.log(nodeTest.only === nodeTest, nodeTest.it === nodeTest.test, nodeTest.describe === nodeTest.suite);
    console.log(Object.keys(nodeTest.describe).join(","));
    console.log(JSON.stringify([Object.keys(nodeTest.mock), Object.keys(nodeTest.mock.timers), typeof nodeTest.mock.timers.enabled]));
    console.log(Object.hasOwn(nodeTest.mock, "fn"), typeof nodeTest.mock.fn, Object.hasOwn(nodeTest.mock.timers, "tick"), typeof nodeTest.mock.timers.tick);
    const describeDescriptor = (object, name) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, name);
      if ("value" in descriptor) return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
      return [name, descriptor.get?.name, descriptor.enumerable, descriptor.configurable, typeof descriptor.set].join(":");
    };
    console.log(["mock", "snapshot", "assert"].map((name) => describeDescriptor(nodeTest, name)).join("|"));
    console.log(["mock", "snapshot", "assert"].map((name) => {
      const getter = Object.getOwnPropertyDescriptor(nodeTest, name).get;
      return name + ":" + getter.name + ":" + getter.length + ":" + Object.hasOwn(getter, "prototype");
    }).join("|"));
    const describeValueDescriptor = (object, name) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
    };
    const describeValidation = (label, action) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    };
    console.log(Object.getPrototypeOf(nodeTest.snapshot) === null, Object.getPrototypeOf(nodeTest.assert) === null);
    console.log(["setDefaultSnapshotSerializers", "setResolveSnapshotPath"].map((name) => describeValueDescriptor(nodeTest.snapshot, name)).join("|"));
    console.log(describeValueDescriptor(nodeTest.assert, "register"));
    console.log([
      describeValidation("serializers-number", () => nodeTest.snapshot.setDefaultSnapshotSerializers(1)),
      describeValidation("serializers-array-number", () => nodeTest.snapshot.setDefaultSnapshotSerializers([1])),
      describeValidation("resolve-number", () => nodeTest.snapshot.setResolveSnapshotPath(1)),
      describeValidation("assert-name-number", () => nodeTest.assert.register(1, () => {})),
      describeValidation("assert-fn-number", () => nodeTest.assert.register("x", 1))
    ].join("|"));
	    const mockPrototype = Object.getPrototypeOf(nodeTest.mock);
	    const timerPrototype = Object.getPrototypeOf(nodeTest.mock.timers);
	    console.log(Object.getOwnPropertyNames(mockPrototype).join(","));
	    console.log(describeDescriptor(mockPrototype, "constructor"));
	    console.log(["timers", "fn", "method", "getter", "setter", "property", "reset", "restoreAll"].map((name) => describeDescriptor(mockPrototype, name)).join("|"));
	    console.log(["timers", "fn", "method", "getter", "setter", "property", "reset", "restoreAll"].map((name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(mockPrototype, name);
	      const fn = descriptor.value ?? descriptor.get;
	      return name + ":" + Object.hasOwn(fn, "prototype");
	    }).join("|"));
	    console.log(Object.getOwnPropertyNames(timerPrototype).join(","));
	    console.log(describeDescriptor(timerPrototype, "constructor"));
	    console.log(["enable", "reset", "tick", "runAll", "setTime"].map((name) => describeDescriptor(timerPrototype, name)).join("|"));
    console.log(["before", "after", "beforeEach", "afterEach", "getTestContext"].map((name) => name + ":" + nodeTest[name].name + ":" + nodeTest[name].length + ":" + Object.hasOwn(nodeTest[name], "prototype")).join("|"));

    console.log(Object.keys(repl).join(","));
    console.log(Object.getOwnPropertyNames(repl).join(","));
    console.log(Object.hasOwn(repl, "default"), Object.hasOwn(repl, "recoverable"), typeof repl.recoverable, repl.start.length, repl.REPLServer.length);
    console.log([
      "writer",
      "isValidSyntax",
      "start",
      "REPLServer",
      "Recoverable"
    ].map((name) => name + ":" + repl[name].name + ":" + repl[name].length + ":" + Object.hasOwn(repl[name], "prototype")).join("|"));
    const writerOptionsDescriptor = Object.getOwnPropertyDescriptor(repl.writer, "options");
    console.log("writer options descriptor", [
      writerOptionsDescriptor.enumerable,
      writerOptionsDescriptor.configurable,
      writerOptionsDescriptor.writable,
      Object.getPrototypeOf(repl.writer.options) === Object.prototype,
      Object.isExtensible(repl.writer.options)
    ].join(":"));
    console.log("writer options", Object.keys(repl.writer.options).join(","), JSON.stringify(repl.writer.options));
    const defaultWriterColors = repl.writer.options.colors;
    repl.writer.options.colors = true;
    console.log("writer colors", JSON.stringify(repl.writer({ a: 1 })));
    repl.writer.options.colors = defaultWriterColors;
    const replPrototypeNames = Object.getOwnPropertyNames(repl.REPLServer.prototype);
    console.log(replPrototypeNames.join(","));
    console.log(Object.keys(repl.REPLServer.prototype).join(","));
    console.log(replPrototypeNames.map((name) => describeDescriptor(repl.REPLServer.prototype, name)).join("|"));
    const builtinDescriptor = Object.getOwnPropertyDescriptor(repl, "builtinModules");
    const libsDescriptor = Object.getOwnPropertyDescriptor(repl, "_builtinLibs");
    console.log(["builtinModules", "_builtinLibs"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(repl, name);
      return [
        name,
        descriptor.enumerable,
        descriptor.configurable,
        descriptor.get.name,
        descriptor.get.length,
        descriptor.set.name,
        descriptor.set.length,
        Object.hasOwn(descriptor.get, "prototype"),
        Object.hasOwn(descriptor.set, "prototype")
      ].join(":");
    }).join("|"));
    console.log(builtinDescriptor.enumerable, typeof builtinDescriptor.get, typeof builtinDescriptor.set, libsDescriptor.enumerable, repl._builtinLibs === repl.builtinModules, repl.builtinModules.includes("fs"));
    const expectedReplBuiltinModules = "assert,assert/strict,async_hooks,buffer,child_process,cluster,console,constants,crypto,dgram,diagnostics_channel,dns,dns/promises,domain,events,fs,fs/promises,http,http2,https,inspector,inspector/promises,module,net,os,path,path/posix,path/win32,perf_hooks,process,punycode,querystring,readline,readline/promises,repl,stream,stream/consumers,stream/promises,stream/web,string_decoder,sys,timers,timers/promises,tls,trace_events,tty,url,util,util/types,v8,vm,wasi,worker_threads,zlib";
    console.log("repl builtins", repl.builtinModules.join(",") === expectedReplBuiltinModules, repl.builtinModules.length, repl.builtinModules[0], repl.builtinModules.at(-1), repl.builtinModules.includes("_http_agent"), repl.builtinModules.includes("node:test"), repl.builtinModules.includes("node:sqlite"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
	  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
	    "expectFailure,skip,todo,only,after,afterEach,before,beforeEach,describe,getTestContext,it,run,suite,test,mock,snapshot,assert",
	    "length,name,expectFailure,skip,todo,only,after,afterEach,before,beforeEach,describe,getTestContext,it,run,suite,test,mock,snapshot,assert",
	    "false false test 3",
    "TypeError true",
    "false true true",
    "expectFailure,skip,todo,only",
    "[[],[],\"undefined\"]",
    "false function false function",
    "mock:get:true:true:undefined|snapshot:get:true:true:undefined|assert:get:true:true:undefined",
    "mock:get:0:false|snapshot:get:0:false|assert:get:0:false",
    "true true",
    "setDefaultSnapshotSerializers:setDefaultSnapshotSerializers:1:true:true:true:true|setResolveSnapshotPath:setResolveSnapshotPath:1:true:true:true:true",
    "register:register:2:true:true:true:true",
    "serializers-number:TypeError:ERR_INVALID_ARG_TYPE:The \"serializers\" argument must be an instance of Array. Received type number (1)|serializers-array-number:TypeError:ERR_INVALID_ARG_TYPE:The \"serializers[0]\" argument must be of type function. Received type number (1)|resolve-number:TypeError:ERR_INVALID_ARG_TYPE:The \"fn\" argument must be of type function. Received type number (1)|assert-name-number:TypeError:ERR_INVALID_ARG_TYPE:The \"name\" argument must be of type string. Received type number (1)|assert-fn-number:TypeError:ERR_INVALID_ARG_TYPE:The \"fn\" argument must be of type function. Received type number (1)",
	    "constructor,timers,fn,method,getter,setter,property,reset,restoreAll",
	    "constructor:MockTracker:0:false:true:true",
	    "timers:get timers:false:true:undefined|fn:fn:0:false:true:true|method:method:2:false:true:true|getter:getter:2:false:true:true|setter:setter:2:false:true:true|property:property:3:false:true:true|reset:reset:0:false:true:true|restoreAll:restoreAll:0:false:true:true",
	    "timers:false|fn:false|method:false|getter:false|setter:false|property:false|reset:false|restoreAll:false",
	    "constructor,enable,reset,tick,runAll,setTime",
	    "constructor:MockTimers:0:false:true:true",
	    "enable:enable:0:false:true:true|reset:reset:0:false:true:true|tick:tick:0:false:true:true|runAll:runAll:0:false:true:true|setTime:setTime:0:false:true:true",
    "before::2:false|after::2:false|beforeEach::2:false|afterEach::2:false|getTestContext:getTestContext:0:true",
    "start,writer,REPLServer,REPL_MODE_SLOPPY,REPL_MODE_STRICT,Recoverable,isValidSyntax",
    "start,writer,REPLServer,REPL_MODE_SLOPPY,REPL_MODE_STRICT,Recoverable,isValidSyntax,builtinModules,_builtinLibs",
    "false false undefined 6 6",
    "writer:writer:1:false|isValidSyntax:isValidSyntax:1:true|start:start:6:true|REPLServer:REPLServer:6:true|Recoverable:Recoverable:1:true",
    "writer options descriptor true:true:true:true:true",
    "writer options showHidden,depth,colors,customInspect,showProxy,maxArrayLength,maxStringLength,breakLength,compact,sorted,getters,numericSeparator {\"showHidden\":false,\"depth\":2,\"colors\":false,\"customInspect\":true,\"showProxy\":true,\"maxArrayLength\":100,\"maxStringLength\":10000,\"breakLength\":80,\"compact\":3,\"sorted\":false,\"getters\":false,\"numericSeparator\":false}",
    "writer colors \"{ a: \\u001b[33m1\\u001b[39m }\"",
    "constructor,setupHistory,clearBufferedCommand,_handleError,close,createContext,resetContext,displayPrompt,setPrompt,complete,completeOnEditorMode,defineCommand",
    "",
    "constructor:REPLServer:6:false:true:true|setupHistory:setupHistory:0:false:true:true|clearBufferedCommand:clearBufferedCommand:0:false:true:true|_handleError:_handleError:1:false:true:true|close:close:0:false:true:true|createContext:createContext:0:false:true:true|resetContext:resetContext:0:false:true:true|displayPrompt:displayPrompt:1:false:true:true|setPrompt:setPrompt:1:false:true:true|complete:complete:0:false:true:true|completeOnEditorMode:completeOnEditorMode:1:false:true:true|defineCommand:defineCommand:2:false:true:true",
    "builtinModules:false:true::0::1:false:false|_builtinLibs:false:true::0::1:false:false",
    "false function function false true true",
    "repl builtins true 54 assert zlib false false false"
  ]);
});

test("node:test/reporters exposes common reporter adapters", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const reporters = require("node:test/reporters");

    async function collect(iterable) {
      let output = "";
      for await (const chunk of iterable) output += String(chunk);
      return output;
    }

    const events = [
      { type: "test:pass", data: { name: "passes" } },
      { type: "test:fail", data: { name: "fails", error: new Error("boom") } },
      { type: "test:skip", data: { name: "skipped" } },
      { type: "test:todo", data: { name: "todo" } },
      { type: "test:diagnostic", data: { message: "note" } }
    ];

    console.log(Object.keys(reporters).join(","));
    console.log(["dot", "junit", "spec", "tap", "lcov"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(reporters, name);
      const callable = descriptor.get ?? descriptor.value;
      return [
        name,
        descriptor.get ? "accessor" : "value",
        typeof callable,
        descriptor.writable === false ? "readonly" : "n/a",
        descriptor.enumerable,
        descriptor.configurable
      ].join(":");
    }).join("|"));
    console.log(Object.keys(reporters).sort().join(","));
    console.log(typeof reporters.tap, typeof reporters.spec, typeof reporters.dot, typeof reporters.junit, typeof reporters.lcov);
    console.log(["dot", "junit", "lcov", "spec", "tap"].map((name) => name + ":" + reporters[name].name + ":" + reporters[name].length).join("|"));
    console.log((await collect(reporters.tap(events))).replace(/\\n/g, "|"));
    console.log((await collect(reporters.dot(events))).replace(/\\n/g, "|"));

    const junit = await collect(reporters.junit(events));
    console.log(junit.includes("<testsuite tests=\\"4\\" failures=\\"1\\">"), junit.includes("<failure message=\\"boom\\" />"), junit.includes("<skipped />"));

    function streamSummary(stream) {
      return [
        stream.constructor.name,
        typeof stream.on,
        typeof stream[Symbol.asyncIterator],
        stream.readableObjectMode,
        stream.writableObjectMode,
        stream._readableState?.objectMode,
        stream._writableState?.objectMode
      ].join(" ");
    }

    const spec = reporters.spec();
    console.log(streamSummary(spec));
    const reporterPrototypeSummary = (stream) => {
      const prototype = Object.getPrototypeOf(stream);
      return [
        Object.getOwnPropertyNames(prototype).join(","),
        Object.keys(prototype).join(",") || "<none>",
        Object.getOwnPropertyNames(prototype).map((name) => {
          const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
          return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
        }).join("|")
      ].join(";");
    };
    console.log("spec prototype", reporterPrototypeSummary(spec));
    const specChunks = [];
    spec.on("data", (chunk) => specChunks.push(String(chunk)));
    for (const event of events) spec.write(event);
    spec.end();
    console.log(specChunks.join("").replace(/\\n/g, "|"));

    const lcov = reporters.lcov();
    console.log(streamSummary(lcov));
    console.log("lcov prototype", reporterPrototypeSummary(lcov));
    console.log("reporter own transforms", Object.hasOwn(spec, "_transform"), Object.hasOwn(spec, "_flush"), Object.hasOwn(lcov, "_transform"), Object.hasOwn(lcov, "_flush"));
    const lcovChunks = [];
    lcov.on("data", (chunk) => lcovChunks.push(String(chunk)));
    lcov.write({ type: "test:coverage", data: { lcov: "TN:\\nSF:index.js\\n" } });
    lcov.end();
    console.log(lcovChunks.join("").replace(/\\n/g, "|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "dot,junit,spec,tap,lcov",
    "dot:accessor:function:n/a:true:true|junit:accessor:function:n/a:true:true|spec:value:function:readonly:true:true|tap:accessor:function:n/a:true:true|lcov:value:function:readonly:true:true",
    "dot,junit,lcov,spec,tap",
    "function function function function function",
    "dot:dot:1|junit:junitReporter:1|lcov:value:0|spec:value:0|tap:tapReporter:1",
    "TAP version 13|ok 1 - passes|not ok 2 - fails|ok 3 - skipped # SKIP|ok 4 - todo # TODO|# note|1..4|",
    ".X,T|",
    "true true true",
    "SpecReporter function function false true false true",
    "spec prototype constructor,_transform,_flush;<none>;constructor:false:true:true:SpecReporter:0:true|_transform:false:true:true:_transform:3:false|_flush:false:true:true:_flush:1:false",
    "ok passes|not ok fails|skip skipped|todo todo|# note|",
    "LcovReporter function function false true false true",
    "lcov prototype constructor,_transform;<none>;constructor:false:true:true:LcovReporter:1:true|_transform:false:true:true:_transform:3:false",
    "reporter own transforms false false false false",
    "TN:|SF:index.js|"
  ]);
});

test("node:test mock helpers preserve Node-like restore lifecycle behavior", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const test = require("node:test");

    const fn = test.mock.fn(function original(a, b) {
      return a + b;
    });
    fn(1, 2);
    fn.mock.mockImplementationOnce(() => 20);
    console.log(fn(3, 4), fn.mock.callCount());
    fn.mock.restore();
    console.log(fn.mock.callCount(), fn(5, 6), fn.mock.callCount(), fn.name, fn.length);
    console.log(Array.isArray(fn.mock.calls[0].arguments), typeof fn.mock.calls[0].stack);
    const mockPrototype = Object.getPrototypeOf(fn.mock);
    const describeMockContextDescriptor = (name) => {
      const descriptor = Object.getOwnPropertyDescriptor(mockPrototype, name);
      if ("value" in descriptor) {
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
      }
      return [name, descriptor.get.name, descriptor.get.length, typeof descriptor.set, descriptor.enumerable, descriptor.configurable].join(":");
    };
    const firstCall = fn.mock.calls[0];
    const callsSnapshot = fn.mock.calls;
    fn.mock.resetCalls();
    console.log("function mock context", JSON.stringify(Object.keys(fn.mock)), JSON.stringify(Object.getOwnPropertyNames(fn.mock)), mockPrototype.constructor.name, Object.getOwnPropertyNames(mockPrototype).join(","));
    console.log("function mock descriptors", ["calls", "callCount", "mockImplementation", "mockImplementationOnce", "restore", "resetCalls"].map(describeMockContextDescriptor).join("|"));
    console.log("function mock call snapshot", Object.keys(firstCall).join(","), Object.getOwnPropertyNames(firstCall).join(","), JSON.stringify(firstCall.arguments), firstCall.result, firstCall.error, typeof firstCall.stack, firstCall.target, callsSnapshot.length, fn.mock.callCount(), callsSnapshot === fn.mock.calls);
    const indexed = test.mock.fn(() => "base");
    indexed.mock.mockImplementationOnce(() => "two", 2);
    indexed.mock.mockImplementationOnce(() => "zero");
    indexed.mock.mockImplementationOnce(() => "override-zero");
    console.log("function mock indexed once", indexed(), indexed(), indexed(), indexed());
    const postCallIndexed = test.mock.fn(() => "base");
    postCallIndexed();
    let pastOnCallError;
    try {
      postCallIndexed.mock.mockImplementationOnce(() => "past", 0);
    } catch (error) {
      pastOnCallError = [error.constructor.name, error.name, error.code, error.message].join(":");
    }
    const onceReturn = postCallIndexed.mock.mockImplementationOnce(() => "future", 1);
    const implementationReturn = postCallIndexed.mock.mockImplementation(() => "changed");
    console.log("function mock implementation returns", implementationReturn, onceReturn, pastOnCallError, postCallIndexed(), postCallIndexed());
    const timedFn = test.mock.fn(() => "orig", () => "mock", { times: 1 });
    const timedFnTwo = test.mock.fn(() => "orig", () => "mock", { times: 2 });
    const timedOriginalFn = test.mock.fn(() => "orig", { times: 1 });
    console.log("function mock times", timedFn(), timedFn(), timedFn.mock.callCount(), timedFnTwo(), timedFnTwo(), timedFnTwo(), timedFnTwo.mock.callCount(), timedOriginalFn(), timedOriginalFn(), timedOriginalFn.mock.callCount());
    const mockTimesValidationRows = [
      ["times0", () => test.mock.fn(() => "orig", { times: 0 })],
      ["times-string", () => test.mock.fn(() => "orig", { times: "1" })],
      ["options-null", () => test.mock.fn(() => "orig", () => "mock", null)]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.constructor.name, error.name, error.code, error.message].join(":");
      }
    }).join("|");
    console.log("function mock times validation", mockTimesValidationRows);

    const target = {
      value: 1,
      add(step) {
        this.value += step;
        return this.value;
      }
    };
    const mocked = test.mock.method(target, "add", function add(step) {
      return this.value + step + 10;
    });
    console.log(target.add(2), target.value, mocked.mock.callCount());
    test.mock.reset();
    console.log(mocked.mock.callCount(), target.add(1), target.value);

    const symbol = Symbol("step");
    const symbolTarget = {
      value: 1,
      [symbol](step) {
        this.value += step;
        return this.value;
      }
    };
    const symbolMock = test.mock.method(symbolTarget, symbol, function step(step) {
      return this.value + step + 20;
    });
    console.log(symbolTarget[symbol](2), symbolMock.mock.callCount());
    test.mock.restoreAll();
    console.log(symbolMock.mock.callCount(), symbolTarget[symbol](1), symbolTarget.value);

    const accessTarget = {
      _value: 1,
      get value() {
        return this._value;
      },
      set value(next) {
        this._value = next;
      }
    };
    const getterMock = test.mock.getter(accessTarget, "value", function value() {
      return this._value + 10;
    });
    console.log(accessTarget.value, getterMock.mock.callCount());
    getterMock.mock.restore();
    console.log(getterMock.mock.callCount(), accessTarget.value);
    const setterMock = test.mock.setter(accessTarget, "value", function value(next) {
      this._value = next * 3;
    });
    accessTarget.value = 3;
    console.log(accessTarget._value, setterMock.mock.callCount());
    test.mock.restoreAll();
    accessTarget.value = 4;
    console.log(accessTarget._value, setterMock.mock.callCount());
    const methodTimesTarget = { m() { return "orig"; } };
    const methodTimesMock = test.mock.method(methodTimesTarget, "m", () => "mock", { times: 1 });
    const methodOmittedTarget = { m() { return "orig"; } };
    const methodOmittedMock = test.mock.method(methodOmittedTarget, "m", { times: 1 });
    const accessorTimesTarget = {
      value: 1,
      get g() { return this.value; },
      set s(next) { this.value = next; }
    };
    const getterTimesMock = test.mock.getter(accessorTimesTarget, "g", () => "mock", { times: 1 });
    const getterTimesRows = [accessorTimesTarget.g, accessorTimesTarget.g, getterTimesMock.mock.callCount()].join(":");
    const setterTimesMock = test.mock.setter(accessorTimesTarget, "s", function s(next) { this.value = next * 2; }, { times: 1 });
    accessorTimesTarget.s = 2;
    const setterTimesFirst = accessorTimesTarget.value;
    accessorTimesTarget.s = 3;
    const methodTimesValidation = (() => {
      try {
        test.mock.method({ m() {} }, "m", () => {}, { times: 0 });
        return "ok";
      } catch (error) {
        return [error.constructor.name, error.name, error.code, error.message].join(":");
      }
    })();
    console.log("method/accessor mock times", methodTimesTarget.m(), methodTimesTarget.m(), methodTimesMock.mock.callCount(), methodTimesTarget.m === methodTimesMock, methodOmittedTarget.m(), methodOmittedTarget.m(), methodOmittedMock.mock.callCount(), methodOmittedTarget.m === methodOmittedMock, getterTimesRows, setterTimesFirst, accessorTimesTarget.value, setterTimesMock.mock.callCount(), methodTimesValidation);

    const propertyTarget = { value: 1 };
    const propertyMock = test.mock.property(propertyTarget, "value", 2);
    console.log(propertyTarget.value, propertyMock.value, propertyMock.mock.accessCount());
    propertyMock.value = 4;
    console.log(propertyTarget.value, propertyMock.mock.accessCount());
    propertyMock.mock.mockImplementationOnce(5);
    console.log(propertyTarget.value, propertyTarget.value, propertyMock.mock.accessCount());
    propertyMock.mock.mockImplementation(6);
    console.log(propertyTarget.value, propertyMock.mock.accessCount(), propertyMock.mock.accesses[0].type);
    const propertyMockPrototype = Object.getPrototypeOf(propertyMock.mock);
    const describePropertyMockContextDescriptor = (name) => {
      const descriptor = Object.getOwnPropertyDescriptor(propertyMockPrototype, name);
      if ("value" in descriptor) {
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
      }
      return [name, descriptor.get.name, descriptor.get.length, typeof descriptor.set, descriptor.enumerable, descriptor.configurable].join(":");
    };
    const firstAccess = propertyMock.mock.accesses[0];
    const accessesSnapshot = propertyMock.mock.accesses;
    propertyMock.mock.resetAccesses();
    console.log("property mock context", JSON.stringify(Object.keys(propertyMock.mock)), JSON.stringify(Object.getOwnPropertyNames(propertyMock.mock)), propertyMockPrototype.constructor.name, Object.getOwnPropertyNames(propertyMockPrototype).join(","), Object.keys(propertyMock).join(","), Object.getOwnPropertyNames(propertyMock).join(","), "mock" in propertyMock, Object.hasOwn(propertyMock, "mock"));
    console.log("property mock descriptors", ["accesses", "accessCount", "mockImplementation", "mockImplementationOnce", "resetAccesses", "restore"].map(describePropertyMockContextDescriptor).join("|"));
    console.log("property mock access snapshot", Object.keys(firstAccess).join(","), Object.getOwnPropertyNames(firstAccess).join(","), firstAccess.type, firstAccess.value, typeof firstAccess.stack, accessesSnapshot.length, propertyMock.mock.accessCount(), accessesSnapshot === propertyMock.mock.accesses);
    console.log(propertyMock.mock.accessCount());
    propertyMock.mock.mockImplementationOnce(7, 1);
    propertyMock.mock.mockImplementationOnce(8);
    propertyMock.mock.mockImplementationOnce(9);
    console.log("property mock indexed once", propertyTarget.value, propertyTarget.value, propertyTarget.value, propertyMock.mock.accessCount());
    const invalidOnAccessMessages = [
      ["string", "2"],
      ["bigint", 1n],
      ["symbol", Symbol("x")],
      ["boolean", true]
    ].map(([label, onAccess]) => {
      try {
        propertyMock.mock.mockImplementationOnce(1, onAccess);
      } catch (error) {
        return label + ":" + error.message;
      }
    });
    console.log("property mock invalid onAccess messages", invalidOnAccessMessages.join("|"));
    for (const probe of [
      () => propertyMock.mock.mockImplementationOnce(1, "x"),
      () => propertyMock.mock.mockImplementationOnce(1, 1.5),
      () => propertyMock.mock.mockImplementationOnce(1, -1)
    ]) {
      try {
        probe();
      } catch (error) {
        console.log(error.code);
      }
    }
    propertyMock.mock.restore();
    console.log(propertyTarget.value);
    test.mock.property(propertyTarget, "value", 8);
    test.mock.reset();
    console.log(propertyTarget.value);

    for (const probe of [
      () => test.mock.method(null, "x"),
      () => test.mock.method({}, 1),
      () => test.mock.method({}, "missing"),
      () => test.mock.property({}, "missing"),
      () => test.mock.getter({ value: 1 }, "value"),
      () => test.mock.setter({ value: 1 }, "value")
    ]) {
      try {
        probe();
      } catch (error) {
        console.log(error.code);
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "20 2",
    "2 11 3 original 2",
    "true object",
    "function mock context [] [] MockFunctionContext constructor,calls,callCount,mockImplementation,mockImplementationOnce,restore,resetCalls",
    "function mock descriptors calls:get calls:0:undefined:false:true|callCount:callCount:0:false:true:true:false|mockImplementation:mockImplementation:1:false:true:true:false|mockImplementationOnce:mockImplementationOnce:2:false:true:true:false|restore:restore:0:false:true:true:false|resetCalls:resetCalls:0:false:true:true:false",
    "function mock call snapshot arguments,error,result,stack,target,this arguments,error,result,stack,target,this [1,2] 3 undefined object undefined 3 0 false",
    "function mock indexed once override-zero base two base",
    "function mock implementation returns undefined undefined RangeError:RangeError:ERR_OUT_OF_RANGE:The value of \"onCall\" is out of range. It must be >= 1 && <= 9007199254740991. Received 0 future changed",
    "function mock times mock orig 2 mock mock orig 3 orig orig 2",
    "function mock times validation times0:RangeError:RangeError:ERR_OUT_OF_RANGE:The value of \"options.times\" is out of range. It must be >= 1 && <= 9007199254740991. Received 0|times-string:TypeError:TypeError:ERR_INVALID_ARG_TYPE:The \"options.times\" property must be of type number. Received type string ('1')|options-null:TypeError:TypeError:ERR_INVALID_ARG_TYPE:The \"options\" argument must be of type object. Received null",
    "13 1 1",
    "1 2 2",
    "23 1",
    "1 2 2",
    "11 1",
    "1 1",
    "9 1",
    "4 1",
    "method/accessor mock times mock orig 1 false orig orig 1 false mock:1:1 4 3 1 RangeError:RangeError:ERR_OUT_OF_RANGE:The value of \"options.times\" is out of range. It must be >= 1 && <= 9007199254740991. Received 0",
    "2 2 2",
    "4 4",
    "5 4 6",
    "6 8 get",
    "property mock context [] [] MockPropertyContext constructor,accesses,accessCount,mockImplementation,mockImplementationOnce,resetAccesses,restore value value false false",
    "property mock descriptors accesses:get accesses:0:undefined:false:true|accessCount:accessCount:0:false:true:true:false|mockImplementation:mockImplementation:1:false:true:true:false|mockImplementationOnce:mockImplementationOnce:2:false:true:true:false|resetAccesses:resetAccesses:0:false:true:true:false|restore:restore:0:false:true:true:false",
    "property mock access snapshot type,value,stack type,value,stack get 2 object 8 0 false",
    "0",
    "property mock indexed once 9 7 6 3",
    "property mock invalid onAccess messages string:The \"onAccess\" argument must be of type number. Received type string ('2')|bigint:The \"onAccess\" argument must be of type number. Received type bigint (1n)|symbol:The \"onAccess\" argument must be of type number. Received type symbol (Symbol(x))|boolean:The \"onAccess\" argument must be of type number. Received type boolean (true)",
    "ERR_INVALID_ARG_TYPE",
    "ERR_OUT_OF_RANGE",
    "ERR_OUT_OF_RANGE",
    "1",
    "1",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_VALUE"
  ]);
});

test("diagnostics_channel exposes Node-shaped channels and tracing helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dc from "node:diagnostics_channel";
    import { channel, hasSubscribers, subscribe, tracingChannel, unsubscribe } from "node:diagnostics_channel";

    console.log(Object.keys(dc).join(","));
    console.log(dc.channel.name, dc.channel.length, dc.boundedChannel.name, dc.boundedChannel.length);
    console.log(["Channel", "BoundedChannel"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(dc[name], "length");
      return [name, dc[name].name, dc[name].length, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value].join(":");
    }).join("|"));
    console.log(Object.getOwnPropertyNames(dc.Channel.prototype).join(","), Object.keys(dc.Channel.prototype).join(","));
    console.log(["subscribe", "unsubscribe", "bindStore", "unbindStore", "hasSubscribers", "publish", "runStores", "withStoreScope"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(dc.Channel.prototype, name);
      const detail = "value" in descriptor ? descriptor.value.name + ":" + descriptor.value.length + ":" + descriptor.writable : descriptor.get.name + ":" + descriptor.get.length + ":" + typeof descriptor.set;
      return [name, descriptor.enumerable, descriptor.configurable, detail].join(":");
    }).join("|"));
    console.log(Object.getOwnPropertyNames(dc.BoundedChannel.prototype).join(","), Object.keys(dc.BoundedChannel.prototype).join(","));
    console.log(["hasSubscribers", "subscribe", "unsubscribe", "withScope", "run"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(dc.BoundedChannel.prototype, name);
      const detail = "value" in descriptor ? descriptor.value.name + ":" + descriptor.value.length + ":" + descriptor.writable : descriptor.get.name + ":" + descriptor.get.length + ":" + typeof descriptor.set;
      return [name, descriptor.enumerable, descriptor.configurable, detail].join(":");
    }).join("|"));

    const events = [];
    const alpha = channel("alpha");
    const subscriber = (message, name) => events.push([String(name), message.value ?? message.result]);

    console.log(alpha === channel("alpha"));
    console.log(alpha instanceof dc.Channel, alpha.constructor.name);
    console.log(hasSubscribers("alpha"), alpha.hasSubscribers);
    alpha.subscribe(subscriber);
    console.log(hasSubscribers("alpha"), alpha.hasSubscribers);
    alpha.publish({ value: 42 });
    console.log(alpha.unsubscribe(subscriber), alpha.unsubscribe(subscriber));
    console.log(hasSubscribers("alpha"), JSON.stringify(events));
    subscribe("beta", subscriber);
    channel("beta").publish({ value: 13 });
    console.log(hasSubscribers("beta"), unsubscribe("beta", subscriber), unsubscribe("beta", subscriber));
    try {
      subscribe("bad", null);
    } catch (error) {
      console.log(error.code, error.name);
    }
    for (const [label, action] of [
      ["channel-object", () => channel({ toString() { return "bad"; } })],
      ["subscribe-object", () => subscribe({ toString() { return "bad"; } }, subscriber)],
      ["unsubscribe-object", () => unsubscribe({ toString() { return "bad"; } }, subscriber)]
    ]) {
      try {
        action();
        console.log(label, "ok");
      } catch (error) {
        console.log(label, error.name, error.code, /string or symbol/.test(error.message));
      }
    }
    console.log("has-object", hasSubscribers({ toString() { return "bad"; } }));

    const bounded = dc.boundedChannel("bounded");
    const boundedEvents = [];
    const boundedSubscriber = {
      start(message, name) {
        boundedEvents.push(["start", String(name), message.value]);
      },
      end(message, name) {
        boundedEvents.push(["end", String(name), message.value]);
      }
    };
    bounded.subscribe(boundedSubscriber);
    console.log(JSON.stringify([bounded instanceof dc.BoundedChannel, bounded.constructor.name, Object.keys(bounded), Object.getOwnPropertyNames(bounded)]));
    console.log(bounded.start.name, bounded.end.name, bounded.hasSubscribers);
    console.log(bounded.run({ value: 7 }, (a, b) => a + b, null, 2, 3));
    console.log(JSON.stringify(boundedEvents));
    console.log(bounded.unsubscribe(boundedSubscriber), bounded.hasSubscribers, bounded.unsubscribe(boundedSubscriber));

    const traced = [];
    const tracing = tracingChannel("task");
    console.log(JSON.stringify([Object.keys(tracing), Object.getOwnPropertyNames(tracing), Object.getOwnPropertyNames(Object.getPrototypeOf(tracing))]));
    const tracingSubscriber = {
      start(message, name) {
        traced.push(["start", String(name), message.value ?? null, message.result ?? null, message.error?.message ?? null]);
      },
      end(message, name) {
        traced.push(["end", String(name), message.value ?? null, message.result ?? null, message.error?.message ?? null]);
      },
      asyncStart(message, name) {
        traced.push(["asyncStart", String(name), message.value ?? null, message.result ?? null, message.error?.message ?? null]);
      },
      asyncEnd(message, name) {
        traced.push(["asyncEnd", String(name), message.value ?? null, message.result ?? null, message.error?.message ?? null]);
      },
      error(message, name) {
        traced.push(["error", String(name), message.value ?? null, message.result ?? null, message.error?.message ?? null]);
      }
    };
    tracing.subscribe(tracingSubscriber);
    console.log(tracing.hasSubscribers);
    console.log(tracing.traceSync((a, b) => a + b, { value: "ctx" }, null, 4, 5));
    console.log(await tracing.tracePromise(async (value) => value * 2, { value: "promise" }, null, 6));
    console.log(tracing.traceCallback((value, callback) => {
      callback(null, value * 3);
      return "outer";
    }, 1, { value: "callback" }, null, 5, (error, value) => traced.push(["callback", "callback", value])));
    try {
      tracing.traceSync(() => {
        throw new Error("boom");
      }, { value: "err" });
    } catch (error) {
      console.log(error.message);
    }
    console.log(tracing.unsubscribe(tracingSubscriber), tracing.hasSubscribers, tracing.unsubscribe(tracingSubscriber));
    console.log(JSON.stringify(traced));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "channel,hasSubscribers,subscribe,tracingChannel,unsubscribe,boundedChannel,Channel,BoundedChannel",
    "channel 1 boundedChannel 1",
    "Channel:Channel:1:false:true:false:1|BoundedChannel:BoundedChannel:1:false:true:false:1",
    "constructor,subscribe,unsubscribe,bindStore,unbindStore,hasSubscribers,publish,runStores,withStoreScope ",
    "subscribe:false:true:subscribe:1:true|unsubscribe:false:true:unsubscribe:0:true|bindStore:false:true:bindStore:2:true|unbindStore:false:true:unbindStore:0:true|hasSubscribers:false:true:get hasSubscribers:0:undefined|publish:false:true:publish:0:true|runStores:false:true:runStores:3:true|withStoreScope:false:true:withStoreScope:0:true",
    "constructor,hasSubscribers,subscribe,unsubscribe,withScope,run ",
    "hasSubscribers:false:true:get hasSubscribers:0:undefined|subscribe:false:true:subscribe:1:true|unsubscribe:false:true:unsubscribe:1:true|withScope:false:true:withScope:0:true|run:false:true:run:3:true",
    "true",
    "true Channel",
    "false false",
    "true true",
    "true false",
    "false [[\"alpha\",42]]",
    "true true false",
    "ERR_INVALID_ARG_TYPE TypeError",
    "channel-object TypeError ERR_INVALID_ARG_TYPE true",
    "subscribe-object TypeError ERR_INVALID_ARG_TYPE true",
    "unsubscribe-object TypeError ERR_INVALID_ARG_TYPE true",
    "has-object false",
    "[true,\"BoundedChannel\",[],[\"start\",\"end\"]]",
    "tracing:bounded:start tracing:bounded:end true",
    "5",
    "[[\"start\",\"tracing:bounded:start\",7],[\"end\",\"tracing:bounded:end\",7]]",
    "true false false",
    "[[],[\"error\"],[\"constructor\",\"start\",\"end\",\"asyncStart\",\"asyncEnd\",\"hasSubscribers\",\"subscribe\",\"unsubscribe\",\"traceSync\",\"tracePromise\",\"traceCallback\"]]",
    "true",
    "9",
    "12",
    "outer",
    "boom",
    "true false false",
    "[[\"start\",\"tracing:task:start\",\"ctx\",null,null],[\"end\",\"tracing:task:end\",\"ctx\",9,null],[\"start\",\"tracing:task:start\",\"promise\",null,null],[\"end\",\"tracing:task:end\",\"promise\",null,null],[\"asyncStart\",\"tracing:task:asyncStart\",\"promise\",12,null],[\"asyncEnd\",\"tracing:task:asyncEnd\",\"promise\",12,null],[\"start\",\"tracing:task:start\",\"callback\",null,null],[\"asyncStart\",\"tracing:task:asyncStart\",\"callback\",15,null],[\"callback\",\"callback\",15],[\"asyncEnd\",\"tracing:task:asyncEnd\",\"callback\",15,null],[\"end\",\"tracing:task:end\",\"callback\",15,null],[\"start\",\"tracing:task:start\",\"err\",null,null],[\"error\",\"tracing:task:error\",\"err\",null,\"boom\"],[\"end\",\"tracing:task:end\",\"err\",null,\"boom\"]]"
  ]);
});

test("cluster exposes primary metadata and setup helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const cluster = require("node:cluster");
      const { EventEmitter } = require("node:events");
      console.log(cluster.isPrimary, cluster.isWorker, cluster.isMaster);
      const clusterKeys = Reflect.ownKeys(cluster).map(String);
      const clusterSymbolValues = Reflect.ownKeys(cluster)
        .filter((key) => typeof key === "symbol" && ["Symbol(shapeMode)", "Symbol(kCapture)"].includes(String(key)))
        .map((key) => cluster[key])
        .join(",");
      console.log(cluster instanceof EventEmitter, ["_events", "_eventsCount", "_maxListeners", "Symbol(shapeMode)", "Symbol(kCapture)"].every((key) => clusterKeys.includes(key)), !Object.keys(cluster).includes("default"), !clusterKeys.includes("Symbol(opencontainers.events)"));
      console.log(Object.keys(cluster).join(","));
      console.log(Object.getPrototypeOf(cluster._events) === null, cluster._eventsCount, cluster._maxListeners === undefined, clusterSymbolValues);
      console.log(typeof cluster.Worker, cluster.Worker.name, cluster.Worker.length);
      const workerPrototypeDescriptor = Object.getOwnPropertyDescriptor(cluster.Worker, "prototype");
      console.log("worker prototype descriptor", workerPrototypeDescriptor.enumerable, workerPrototypeDescriptor.configurable, workerPrototypeDescriptor.writable, Object.getOwnPropertyNames(workerPrototypeDescriptor.value).join(","));
      const calledWorker = cluster.Worker();
      console.log("called worker", calledWorker instanceof cluster.Worker, calledWorker.id, calledWorker.state);
      const worker = new cluster.Worker();
      console.log(worker instanceof cluster.Worker, worker.id, worker.state, typeof worker.kill);
      console.log(Object.keys(worker).join(","));
      console.log(Object.prototype.hasOwnProperty.call(worker, "process"), Object.prototype.hasOwnProperty.call(worker, "_opencontainersDisconnecting"), typeof worker.exitedAfterDisconnect, Object.getPrototypeOf(worker._events) === null, worker._eventsCount);
      console.log(["kill", "send", "isDead", "isConnected", "disconnect", "destroy"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(cluster.Worker.prototype, name);
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable].join(":");
      }).join("|"));
      console.log("worker method prototypes", ["kill", "send", "isDead", "isConnected", "disconnect", "destroy"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(cluster.Worker.prototype, name);
        const fn = descriptor.value;
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        const constructorDescriptor = Object.getOwnPropertyDescriptor(prototypeDescriptor?.value ?? {}, "constructor");
        let constructable = "no";
        try {
          Reflect.construct(Object, [], fn);
          constructable = "yes";
        } catch {}
        return [
          name,
          Object.hasOwn(fn, "prototype"),
          prototypeDescriptor?.enumerable ?? "",
          prototypeDescriptor?.configurable ?? "",
          prototypeDescriptor?.writable ?? "",
          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
          constructorDescriptor?.value === fn,
          constructable
        ].join(":");
      }).join("|"));
      console.log(cluster.fork.length, cluster.setupPrimary.length, cluster.setupMaster.length, cluster.disconnect.length);
      console.log(["setupPrimary", "setupMaster", "fork", "disconnect"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(cluster, name);
        const fn = cluster[name];
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          JSON.stringify(fn.name),
          fn.length,
          Object.hasOwn(fn, "prototype"),
          Object.getOwnPropertyNames(fn.prototype ?? {}).join(","),
          Object.keys(fn.prototype ?? {}).join(",")
        ].join(":");
      }).join("|"));
      console.log(cluster.setupPrimary === cluster.setupMaster);
      cluster.setupPrimary({ exec: "worker.js", args: ["one"] });
      console.log(cluster.settings.exec, cluster.settings.args.join(","));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true false true",
    "true true true true",
    "_events,_eventsCount,_maxListeners,isWorker,isMaster,isPrimary,Worker,workers,settings,SCHED_NONE,SCHED_RR,schedulingPolicy,setupPrimary,setupMaster,fork,disconnect",
    "true 0 true false,false",
    "function Worker 1",
    "worker prototype descriptor false false true constructor,kill,send,isDead,isConnected,disconnect,destroy",
    "called worker true 0 none",
    "true 0 none function",
    "_events,_eventsCount,_maxListeners,exitedAfterDisconnect,state,id",
    "false false undefined true 0",
    "kill::0:true|send::0:true|isDead::0:true|isConnected::0:true|disconnect::0:true|destroy::1:true",
    "worker method prototypes kill:true:false:false:true:constructor:true:yes|send:true:false:false:true:constructor:true:yes|isDead:true:false:false:true:constructor:true:yes|isConnected:true:false:false:true:constructor:true:yes|disconnect:true:false:false:true:constructor:true:yes|destroy:true:false:false:true:constructor:true:yes",
    "1 1 1 1",
    "setupPrimary:true:true:true:\"\":1:true:constructor:|setupMaster:true:true:true:\"\":1:true:constructor:|fork:true:true:true:\"\":1:true:constructor:|disconnect:true:true:true:\"\":1:true:constructor:",
    "true",
    "worker.js one"
  ]);
});

test("cluster.fork runs a virtual worker process with Node-shaped lifecycle events", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/cluster-worker.js", `
    const cluster = require("node:cluster");
    if (cluster.isPrimary) {
      cluster.setupPrimary({ exec: "cluster-worker.js" });
      const worker = cluster.fork({ REPL_TEST_VAR: "hello" });
      console.log("instance", worker instanceof cluster.Worker);
      worker.on("online", () => console.log("online", worker.id, worker.isConnected()));
      worker.on("exit", (code) => {
        console.log("exit", code, cluster.workers[worker.id] === undefined);
        try {
          worker.send({ ok: true });
        } catch (error) {
          console.log(error.code);
        }
      });
    } else {
      console.log("worker", cluster.isWorker, cluster.worker.id, process.env.NODE_UNIQUE_ID, process.env.REPL_TEST_VAR);
      process.exit(7);
    }
  `);

  const result = await kernel.run("node", ["cluster-worker.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n").sort();
  assert.deepEqual(lines, [
    "ERR_OPENCONTAINERS_CLUSTER_IPC_UNSUPPORTED",
    "exit 7 true",
    "instance true",
    "online 1 true",
    "worker true 1 1 hello"
  ].sort());
});

test("node:os and node:url expose package compatibility helpers", async () => {
	  const kernel = new Kernel();
	  kernel.fs.writeFileSync("/workspace/index.js", `
	    import constants from "node:constants";
	    import os from "node:os";
	    import process from "node:process";
	    import url from "node:url";

    const parsed = url.parse("https://user:pass@example.com:8080/a/b?x=1&x=2#hash", true);
    const options = url.urlToHttpOptions(new URL("https://example.com:8443/path?q=1"));
    const unicodeUrl = new URL("https://xn--bcher-kva.example/a?x=1#h");
    const httpOptionSymbol = Symbol("s");
    unicodeUrl.extra = "value";
    unicodeUrl.portHint = 123;
    unicodeUrl[httpOptionSymbol] = "sym-value";
    Object.defineProperty(unicodeUrl, "hidden", { value: "secret", enumerable: false });
    const unicodeHttpOptions = url.urlToHttpOptions(unicodeUrl);
    const ipv6HttpOptions = url.urlToHttpOptions(new URL("http://[::1]:1234/a?q=1"));
    const plainHttpOptions = url.urlToHttpOptions({ href: "https://example.com/" });
    let urlToHttpOptionsStringError;
    try {
      url.urlToHttpOptions("https://example.com");
    } catch (error) {
      urlToHttpOptionsStringError = [error.name, error.code, error.message].join(":");
    }
    const relative = new url.Url().parse("/docs/readme.md?raw=1");
    const resolvedObject = url.resolveObject("/one/two", "../three");

    console.log(os.platform(), os.arch(), os.machine(), os.type());
    console.log(process.platform, process.arch);
    console.log(os.homedir(), os.tmpdir(), os.endianness());
    console.log(os.availableParallelism(), os.totalmem() > 0, os.freemem() > 0);
    console.log(Object.keys(os).join(","));
    const osDescriptors = ["constants", "EOL", "devNull"].map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(os, key);
      return [key, descriptor.enumerable, descriptor.writable, descriptor.configurable, typeof descriptor.value].join(":");
    });
    console.log(osDescriptors.join("|"));
    console.log(os.constants.errno.ENOENT, os.constants.errno.EADDRINUSE, os.constants.errno.ECONNREFUSED);
	    console.log(os.constants.signals.SIGINT, os.constants.signals.SIGUSR1, os.constants.signals.SIGSYS);
	    console.log(Object.keys(os.constants).join(","));
	    const errnoKeys = Object.keys(os.constants.errno);
	    const constantKeys = Object.keys(constants);
	    const expectedErrnoKeys = constantKeys.slice(constantKeys.indexOf("E2BIG"), constantKeys.indexOf("PRIORITY_LOW")).join(",");
	    console.log(errnoKeys.slice(0, 20).join(","));
	    console.log(errnoKeys.join(",") === expectedErrnoKeys, errnoKeys.length, errnoKeys.at(-1));
	    console.log(Object.getPrototypeOf(os.constants) === null, Object.getPrototypeOf(os.constants.errno) === null, Object.getPrototypeOf(os.constants.signals) === null, Object.getPrototypeOf(os.constants.priority) === null, Object.getPrototypeOf(os.constants.dlopen) === null);
    const constantDescriptors = ["UV_UDP_REUSEADDR", "errno", "signals", "priority", "dlopen"].map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(os.constants, key);
      return [key, descriptor.enumerable, descriptor.writable, descriptor.configurable, typeof descriptor.value].join(":");
    });
    const entryDescriptors = [
      Object.getOwnPropertyDescriptor(os.constants.errno, "ENOENT"),
      Object.getOwnPropertyDescriptor(os.constants.signals, "SIGINT"),
      Object.getOwnPropertyDescriptor(os.constants.priority, "PRIORITY_LOW"),
      Object.getOwnPropertyDescriptor(os.constants.dlopen, "RTLD_NOW")
    ].map((descriptor) => [descriptor.enumerable, descriptor.writable, descriptor.configurable].join(":"));
    console.log(constantDescriptors.join("|"));
    console.log(entryDescriptors.join("|"));
    console.log(Object.isExtensible(os.constants.signals), Object.isSealed(os.constants.signals), Object.isFrozen(os.constants.signals));
    try {
      (() => {
        "use strict";
        os.constants.signals.__probe = 1;
      })();
      console.log("signals write ok", os.constants.signals.__probe);
    } catch (error) {
      console.log("signals write throw", error.name, /extensible/.test(error.message));
    }
    console.log(Object.hasOwn(os.constants.signals, "__probe"));
    const interfaces = os.networkInterfaces();
    const userInfo = os.userInfo();
    const bufferUserInfo = os.userInfo({ encoding: "buffer" });
    const upperBufferUserInfo = os.userInfo({ encoding: "BUFFER" });
    const hexUserInfo = os.userInfo({ encoding: "hex" });
    const base64UserInfo = os.userInfo({ encoding: "base64" });
    console.log(interfaces.lo[0].family, interfaces.lo[0].address, interfaces.lo[0].cidr, interfaces.lo[1].family, interfaces.lo[1].scopeid);
    console.log(userInfo.uid, userInfo.gid, userInfo.username, userInfo.homedir, userInfo.shell);
    console.log(Buffer.isBuffer(bufferUserInfo.username), bufferUserInfo.username.toString(), Buffer.isBuffer(bufferUserInfo.homedir), bufferUserInfo.homedir.toString(), bufferUserInfo.shell.toString());
    console.log(Buffer.isBuffer(upperBufferUserInfo.username), upperBufferUserInfo.username.toString());
    console.log(hexUserInfo.username, hexUserInfo.homedir, hexUserInfo.shell);
    console.log(base64UserInfo.username, base64UserInfo.homedir, base64UserInfo.shell);
    console.log(os.getPriority(), os.getPriority(0), os.setPriority(0) === undefined, os.setPriority(0, 0) === undefined);
    console.log([
      "arch",
      "availableParallelism",
      "freemem",
      "getPriority",
      "homedir",
      "hostname",
      "release",
      "setPriority",
      "totalmem",
      "type",
      "userInfo",
      "uptime",
      "version",
      "machine"
    ].map((key) => key + ":" + os[key].name + ":" + os[key].length + ":" + Object.hasOwn(os[key], "prototype")).join("|"));
    for (const action of [
      () => os.getPriority("x"),
      () => os.getPriority(NaN),
      () => os.setPriority("x", 1),
      () => os.setPriority(0, "x"),
      () => os.setPriority(0, -21),
      () => os.setPriority(0, 20)
    ]) {
      try {
        action();
      } catch (error) {
        console.log(error.name, error.code);
      }
    }
    console.log(parsed.protocol, parsed.auth, parsed.hostname, parsed.port, parsed.query.x.join(","));
    console.log(parsed instanceof url.Url, relative.format(), resolvedObject instanceof url.Url, resolvedObject.href);
    console.log(url.fileURLToPathBuffer("file:///tmp/a%20b").toString(), url.fileURLToPathBuffer("file:///tmp/a%FFb").toString("hex"));
    console.log("file url object inputs", url.fileURLToPath(new URL("file:///tmp/a%20b")), url.fileURLToPathBuffer(new URL("file:///tmp/a%20b")).toString());
    for (const [label, action] of [
      ["path-object", () => url.fileURLToPath({ href: "file:///tmp/a%20b" })],
      ["buffer-object", () => url.fileURLToPathBuffer({ href: "file:///tmp/a%20b" })]
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label, error.name, error.code, error.message.includes("string or an instance of URL"));
      }
    }
    console.log("file url windows", url.pathToFileURL("C:\\\\temp\\\\a b.txt", { windows: true }).href, url.fileURLToPath("file:///C:/temp/a%20b.txt", { windows: true }), url.fileURLToPathBuffer("file:///C:/temp/a%20b.txt", { windows: true }).toString("hex"));
    let encodedSlashError;
    try {
      url.fileURLToPath("file:///tmp/a%2Fb");
    } catch (error) {
      encodedSlashError = [error.name, error.code, error.message.includes("encoded /")].join(":");
    }
    console.log("file url separators", encodedSlashError, url.fileURLToPathBuffer("file:///tmp/a%2Fb").toString(), url.fileURLToPathBuffer("file:///C:/tmp/a%5Cb", { windows: true }).toString());
    console.log(typeof url.URLPattern);
    console.log(url.resolve("https://example.com/a/b", "../c?d=1"));
    console.log(options.hostname, options.port, options.path);
    console.log("idna", url.domainToASCII("b\\u00fccher.example"), Buffer.from(url.domainToUnicode("xn--bcher-kva.example")).toString("hex"), Buffer.from(url.domainToUnicode("xn--n3h.com")).toString("hex"), url.domainToUnicode("xn--"));
    console.log(Object.keys(url).join(","));
    console.log(url.pathToFileURL("relative file.js").href);
	    console.log(Object.keys(options).join(","), typeof options.port, Object.hasOwn(options, "host"));
	    console.log("url format options", url.format(unicodeUrl), url.format(unicodeUrl, { unicode: true }), url.format(unicodeUrl, { unicode: true, fragment: false, search: false }));
	    console.log("url http own props", Object.keys(unicodeHttpOptions).join(","), unicodeHttpOptions.extra, unicodeHttpOptions.portHint, Object.hasOwn(unicodeHttpOptions, "hidden"), unicodeHttpOptions.hostname);
	    console.log("url http shape", Object.getPrototypeOf(unicodeHttpOptions) === null, Object.getOwnPropertySymbols(unicodeHttpOptions).map((symbol) => String(symbol) + ":" + unicodeHttpOptions[symbol]).join(","), ipv6HttpOptions.hostname);
	    console.log("url http plain", Object.keys(plainHttpOptions).join(","), Object.hasOwn(plainHttpOptions, "port"), String(plainHttpOptions.port));
	    console.log("url http validation", urlToHttpOptionsStringError);
	    try {
	      url.parse(null);
	    } catch (error) {
	      console.log(error.name, error.code, /string/.test(error.message));
	    }
	    console.log("url proto", Object.getOwnPropertyNames(url.Url.prototype).join(","), Object.keys(url.Url.prototype).join(","));
	    console.log("url proto descriptors", ["parse", "format", "resolve", "resolveObject", "parseHost"].map((key) => {
	      const descriptor = Object.getOwnPropertyDescriptor(url.Url.prototype, key);
	      return [key, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
	    }).join("|"));
	    const urlPrototypeDescriptor = Object.getOwnPropertyDescriptor(url.Url, "prototype");
	    console.log("url ctor proto", urlPrototypeDescriptor.enumerable, urlPrototypeDescriptor.configurable, urlPrototypeDescriptor.writable, typeof urlPrototypeDescriptor.value);
	    console.log("url method prototypes", ["parse", "format", "resolve", "resolveObject", "parseHost"].map((key) => {
	      const fn = url.Url.prototype[key];
	      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
	      return [key, Object.hasOwn(fn, "prototype"), descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, typeof descriptor?.value].join(":");
	    }).join("|"));
	    console.log("parseHost", ["example.com:8080", "example.com:", "example.com:abc", "[::1]:443", ":123"].map((host) => {
	      const parsedHost = new url.Url();
	      parsedHost.host = host;
	      const returned = parsedHost.parseHost();
	      return [host, returned === undefined, parsedHost.hostname ?? "<null>", parsedHost.port ?? "<null>"].join("=>");
	    }).join("|"));
	    console.log(["fileURLToPath", "format", "parse", "pathToFileURL", "resolve", "resolveObject"].map((key) => key + ":" + url[key].name + ":" + url[key].length).join("|"));
		  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "linux x64 x86_64 Linux",
    "linux x64",
    "/home/opencontainers /tmp LE",
    "1 true true",
    "arch,availableParallelism,cpus,endianness,freemem,getPriority,homedir,hostname,loadavg,networkInterfaces,platform,release,setPriority,tmpdir,totalmem,type,userInfo,uptime,version,machine,constants,EOL,devNull",
    "constants:true:false:false:object|EOL:true:false:true:string|devNull:true:false:true:string",
    "2 98 111",
	    "2 10 31",
	    "UV_UDP_REUSEADDR,dlopen,errno,signals,priority",
	    "E2BIG,EACCES,EADDRINUSE,EADDRNOTAVAIL,EAFNOSUPPORT,EAGAIN,EALREADY,EBADF,EBADMSG,EBUSY,ECANCELED,ECHILD,ECONNABORTED,ECONNREFUSED,ECONNRESET,EDEADLK,EDESTADDRREQ,EDOM,EDQUOT,EEXIST",
	    "true 79 EXDEV",
	    "true true true true true",
    "UV_UDP_REUSEADDR:true:false:false:number|errno:true:true:true:object|signals:true:true:true:object|priority:true:true:true:object|dlopen:true:true:true:object",
    "true:false:false|true:false:false|true:false:false|true:false:false",
    "false true true",
    "signals write throw TypeError true",
    "false",
    "IPv4 127.0.0.1 127.0.0.1/8 IPv6 0",
    "1000 1000 opencontainers /home/opencontainers /bin/sh",
    "true opencontainers true /home/opencontainers /bin/sh",
    "true opencontainers",
    "6f70656e636f6e7461696e657273 2f686f6d652f6f70656e636f6e7461696e657273 2f62696e2f7368",
    "b3BlbmNvbnRhaW5lcnM= L2hvbWUvb3BlbmNvbnRhaW5lcnM= L2Jpbi9zaA==",
    "0 0 true true",
    "arch:arch:0:true|availableParallelism::0:false|freemem::0:false|getPriority:getPriority:1:true|homedir:wrappedFn:0:true|hostname:wrappedFn:0:true|release:getOSRelease:0:false|setPriority:setPriority:2:true|totalmem::0:false|type:getOSType:0:false|userInfo:userInfo:1:true|uptime:wrappedFn:0:true|version:getOSVersion:0:false|machine:getMachine:0:false",
    "TypeError ERR_INVALID_ARG_TYPE",
    "RangeError ERR_OUT_OF_RANGE",
    "TypeError ERR_INVALID_ARG_TYPE",
    "TypeError ERR_INVALID_ARG_TYPE",
    "RangeError ERR_OUT_OF_RANGE",
    "RangeError ERR_OUT_OF_RANGE",
    "https: user:pass example.com 8080 1,2",
    "true /docs/readme.md?raw=1 true /three",
    "/tmp/a b 2f746d702f61ff62",
    "file url object inputs /tmp/a b /tmp/a b",
    "path-object TypeError ERR_INVALID_ARG_TYPE true",
    "buffer-object TypeError ERR_INVALID_ARG_TYPE true",
    "file url windows file:///C:/temp/a%20b.txt C:\\temp\\a b.txt 433a5c74656d705c6120622e747874",
    "file url separators TypeError:ERR_INVALID_FILE_URL_PATH:true /tmp/a/b C:\\tmp\\a\\b",
    "function",
    "https://example.com/c?d=1",
    "example.com 8443 /path?q=1",
    "idna xn--bcher-kva.example 62c3bc636865722e6578616d706c65 e298832e636f6d ",
    "Url,parse,resolve,resolveObject,format,URL,URLPattern,URLSearchParams,domainToASCII,domainToUnicode,pathToFileURL,fileURLToPath,fileURLToPathBuffer,urlToHttpOptions",
    "file:///workspace/relative%20file.js",
	    "protocol,hostname,hash,search,pathname,path,href,port number false",
	    "url format options https://xn--bcher-kva.example/a?x=1#h https://bücher.example/a?x=1#h https://bücher.example/a",
	    "url http own props extra,portHint,protocol,hostname,hash,search,pathname,path,href value 123 false xn--bcher-kva.example",
	    "url http shape true Symbol(s):sym-value ::1",
	    "url http plain href,protocol,hostname,hash,search,pathname,path,port true NaN",
	    "url http validation TypeError:ERR_INVALID_ARG_TYPE:The \"url\" argument must be of type object. Received type string ('https://example.com')",
	    "TypeError ERR_INVALID_ARG_TYPE true",
	    "url proto constructor,parse,format,resolve,resolveObject,parseHost parse,format,resolve,resolveObject,parseHost",
	    "url proto descriptors parse:parse:3:true:true:true|format:format:0:true:true:true|resolve:resolve:1:true:true:true|resolveObject:resolveObject:1:true:true:true|parseHost:parseHost:0:true:true:true",
	    "url ctor proto false false true object",
	    "url method prototypes parse:true:false:false:true:object|format:true:false:false:true:object|resolve:true:false:false:true:object|resolveObject:true:false:false:true:object|parseHost:true:false:false:true:object",
	    "parseHost example.com:8080=>true=>example.com=>8080|example.com:=>true=>example.com=><null>|example.com:abc=>true=>example.com:abc=><null>|[::1]:443=>true=>[::1]=>443|:123=>true=><null>=>123",
	    "fileURLToPath:fileURLToPath:1|format:urlFormat:2|parse:urlParse:3|pathToFileURL:pathToFileURL:2|resolve:urlResolve:2|resolveObject:urlResolveObject:2"
	  ]);
	});

test("node:path format and util.promisify support package helper patterns", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import path from "node:path";
    import util from "node:util";
    const legacy = (value, callback) => callback(null, value, value + 1);
    const custom = () => {};
    custom[util.promisify.custom] = () => Promise.resolve("custom result");
    const promisifiedLegacy = util.promisify(legacy);
    const customPromise = custom[util.promisify.custom];
    const customPromisified = util.promisify(custom);
    const legacyPromisifyDescriptor = Object.getOwnPropertyDescriptor(promisifiedLegacy, util.promisify.custom);
    const customPromisifyDescriptor = Object.getOwnPropertyDescriptor(customPromisified, util.promisify.custom);
    const invalidCustom = () => {};
    invalidCustom[util.promisify.custom] = 123;
    const receiver = {
      value: 40,
      read(offset, callback) {
        callback(null, this.value + offset);
      },
      async add(offset) {
        return this.value + offset;
      }
    };
    const rejectError = util.callbackify(async () => {
      throw new Error("boom");
    });
    const rejectFalsy = util.callbackify(async () => Promise.reject(null));
    const callbackifiedAdd = util.callbackify(receiver.add);
    const callbackifiedAnonymous = util.callbackify(async (value) => value);
    function collect(fn, thisArg, ...args) {
      return new Promise((resolve) => {
        fn.call(thisArg, ...args, (error, value) => {
          resolve({
            code: error?.code ?? null,
            message: error?.message ?? null,
            reason: Object.prototype.hasOwnProperty.call(error ?? {}, "reason") ? error.reason : "__none__",
            value
          });
        });
      });
    }

    const [multi, customValue, boundValue, callbackValue, callbackError, callbackFalsy] = await Promise.all([
      promisifiedLegacy(41),
      customPromisified(),
      util.promisify(receiver.read).call(receiver, 2),
      collect(callbackifiedAdd, receiver, 7),
      collect(rejectError, undefined),
      collect(rejectFalsy, undefined)
    ]);

    console.log(Object.keys(path).join(","));
    console.log(Object.keys(path.posix).join(","));
    console.log(Object.keys(path.win32).join(","));
    const pathFunctionNames = ["resolve", "normalize", "isAbsolute", "join", "relative", "toNamespacedPath", "dirname", "basename", "extname", "format", "parse", "matchesGlob", "_makeLong"];
    const describePathFunction = (name, fn) => {
      let construct;
      try {
        new fn();
        construct = "ok";
      } catch (error) {
        construct = error.code || (String(error.message).includes("not a constructor") ? "notConstructor" : error.name);
      }
      return [name, fn.name, fn.length, Object.hasOwn(fn, "prototype"), construct].join(":");
    };
    console.log("path function metadata", [
      ["path", path],
      ["posix", path.posix],
      ["win32", path.win32]
    ].map(([label, mod]) => label + "=" + pathFunctionNames.map((name) => describePathFunction(name, mod[name])).join(",")).join(";"));
    console.log("path function identity", [
      path.resolve === path.posix.resolve,
      path.format === path.posix.format,
      path._makeLong === path.toNamespacedPath,
      path.win32._makeLong === path.win32.toNamespacedPath
    ].join(" "));
    console.log([
      path.posix.posix === path.posix,
      path.posix.win32 === path.win32,
      path.win32.posix === path.posix,
      path.win32.win32 === path.win32,
      path.basename("/workspace/index.test.js", ".js"),
      path.win32.basename("C:\\\\temp\\\\index.test.js", ".js")
    ].join(" "));
    console.log(JSON.stringify([
      path.basename("foo/.."),
      path.posix.basename("foo/.."),
      path.basename("/tmp/file.txt", "file.txt"),
      path.basename("file", "file"),
      path.basename("tmp/file.txt", "tmp/file.txt"),
      path.win32.basename("foo\\\\.."),
      path.win32.basename("C:\\\\temp\\\\file.txt", "file.txt"),
      path.win32.basename("file", "file"),
      path.win32.basename("C:file", "file"),
      path.win32.basename("C:\\\\")
    ]));
    console.log(["basename", "format", "parse", "_makeLong"].map((name) => {
      const value = path[name];
      return [name, value.name, value.length].join(":");
    }).join("|"));
    console.log([
      promisifiedLegacy.name,
      promisifiedLegacy.length,
      legacyPromisifyDescriptor.enumerable,
      legacyPromisifyDescriptor.configurable,
      legacyPromisifyDescriptor.writable,
      legacyPromisifyDescriptor.value === promisifiedLegacy,
      util.promisify(promisifiedLegacy) === promisifiedLegacy,
      customPromisified === customPromise,
      customPromisifyDescriptor.enumerable,
      customPromisifyDescriptor.configurable,
      customPromisifyDescriptor.writable,
      customPromisifyDescriptor.value === customPromisified,
      util.promisify(customPromisified) === customPromisified
    ].join(" "));
    console.log([
      callbackifiedAdd.name,
      callbackifiedAdd.length,
      callbackifiedAnonymous.name,
      callbackifiedAnonymous.length,
      rejectError.name,
      rejectError.length,
      rejectFalsy.name,
      rejectFalsy.length
    ].join(" "));
    console.log(path.format({ dir: "/workspace/src", name: "index", ext: ".js" }));
    console.log(path.normalize("a//b//"));
    console.log(path.format({ dir: "/workspace/src", name: "index", ext: "js" }));
    console.log(JSON.stringify(multi));
    console.log(customValue);
    console.log(boundValue);
    console.log(JSON.stringify(callbackValue));
    console.log(JSON.stringify(callbackError));
    console.log(JSON.stringify(callbackFalsy));
    for (const action of [
      () => util.callbackify(1),
      () => util.callbackify(null),
      () => util.callbackify(async () => "ok")(),
      () => util.promisify(1),
      () => util.promisify(null),
      () => util.promisify(invalidCustom),
      () => util.inherits(null, function Parent() {}),
      () => util.inherits(function Child() {}, null),
      () => util.inherits(function Child() {}, () => {}),
    ]) {
      try {
        action();
      } catch (error) {
        console.log(error.name, error.code, /function|object/.test(error.message));
      }
    }
    console.log(typeof util.TextEncoder, util.types.isArrayBufferView(new Uint8Array()));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "resolve,normalize,isAbsolute,join,relative,toNamespacedPath,dirname,basename,extname,format,parse,matchesGlob,sep,delimiter,win32,posix,_makeLong",
    "resolve,normalize,isAbsolute,join,relative,toNamespacedPath,dirname,basename,extname,format,parse,matchesGlob,sep,delimiter,win32,posix,_makeLong",
    "resolve,normalize,isAbsolute,join,relative,toNamespacedPath,dirname,basename,extname,format,parse,matchesGlob,sep,delimiter,win32,posix,_makeLong",
    "path function metadata path=resolve:resolve:0:false:notConstructor,normalize:normalize:1:false:notConstructor,isAbsolute:isAbsolute:1:false:notConstructor,join:join:0:false:notConstructor,relative:relative:2:false:notConstructor,toNamespacedPath:toNamespacedPath:1:false:notConstructor,dirname:dirname:1:false:notConstructor,basename:basename:2:false:notConstructor,extname:extname:1:false:notConstructor,format:bound _format:1:false:ERR_INVALID_ARG_TYPE,parse:parse:1:false:notConstructor,matchesGlob:matchesGlob:2:false:notConstructor,_makeLong:toNamespacedPath:1:false:notConstructor;posix=resolve:resolve:0:false:notConstructor,normalize:normalize:1:false:notConstructor,isAbsolute:isAbsolute:1:false:notConstructor,join:join:0:false:notConstructor,relative:relative:2:false:notConstructor,toNamespacedPath:toNamespacedPath:1:false:notConstructor,dirname:dirname:1:false:notConstructor,basename:basename:2:false:notConstructor,extname:extname:1:false:notConstructor,format:bound _format:1:false:ERR_INVALID_ARG_TYPE,parse:parse:1:false:notConstructor,matchesGlob:matchesGlob:2:false:notConstructor,_makeLong:toNamespacedPath:1:false:notConstructor;win32=resolve:resolve:0:false:notConstructor,normalize:normalize:1:false:notConstructor,isAbsolute:isAbsolute:1:false:notConstructor,join:join:0:false:notConstructor,relative:relative:2:false:notConstructor,toNamespacedPath:toNamespacedPath:1:false:notConstructor,dirname:dirname:1:false:notConstructor,basename:basename:2:false:notConstructor,extname:extname:1:false:notConstructor,format:bound _format:1:false:ERR_INVALID_ARG_TYPE,parse:parse:1:false:notConstructor,matchesGlob:matchesGlob:2:false:notConstructor,_makeLong:toNamespacedPath:1:false:notConstructor",
    "path function identity true true true true",
    "true true true true index.test index.test",
    "[\"..\",\"..\",\"file.txt\",\"\",\"\",\"..\",\"file.txt\",\"\",\"file\",\"\"]",
    "basename:basename:2|format:bound _format:1|parse:parse:1|_makeLong:toNamespacedPath:1",
    "legacy 2 false true false true true true false true false true true",
    "addCallbackified 2 Callbackified 2 Callbackified 1 Callbackified 1",
    "/workspace/src/index.js",
    "a/b/",
    "/workspace/src/index.js",
    "41",
    "custom result",
    "42",
    '{"code":null,"message":null,"reason":"__none__","value":47}',
    '{"code":null,"message":"boom","reason":"__none__"}',
    '{"code":"ERR_FALSY_VALUE_REJECTION","message":"Promise was rejected with falsy value","reason":null}',
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "function true"
  ]);
});

test("small built-in compatibility exports match package probe behavior", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import path from "node:path";
    import querystring from "node:querystring";
    import streamConsumers from "node:stream/consumers";
    import timers from "node:timers";
    import asyncHooksDefault from "node:async_hooks";
    import * as dgramNamespace from "node:dgram";

    async function* chunks() {
      yield "he";
      yield Buffer.from("llo");
    }

    const bytes = await streamConsumers.bytes(chunks());
    const decoded = querystring.unescapeBuffer("a+b%20c%E2%82%AC", true);
    const literalPlus = querystring.unescapeBuffer("a+b", false);
    const invalidEscape = querystring.unescapeBuffer("%ZZ");
    const timersPromises = await import("node:timers/promises");
    const delayed = await timers.promises.setTimeout(1, "done");
    const noDefaultModules = [
      "node:async_hooks",
      "node:dgram",
      "node:domain",
      "node:http2",
      "node:inspector",
      "node:module",
      "node:perf_hooks",
      "node:sqlite",
      "node:tls",
      "node:trace_events",
      "node:v8",
      "node:vm",
      "node:wasi"
    ];

    console.log(path._makeLong("/workspace/file.txt"));
    console.log(path.win32._makeLong("C:/temp/file.txt"));
    console.log(bytes instanceof Uint8Array, Buffer.isBuffer(bytes), new TextDecoder().decode(bytes));
    console.log(Buffer.isBuffer(decoded), decoded.toString());
    console.log(literalPlus.toString(), invalidEscape.toString());
    console.log(timers.promises === (timersPromises.default ?? timersPromises));
    console.log(delayed);
    console.log(noDefaultModules.every((specifier) => !Object.prototype.hasOwnProperty.call(require(specifier), "default")));
    console.log(asyncHooksDefault === require("node:async_hooks"), dgramNamespace.default === require("node:dgram"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "/workspace/file.txt",
    "\\\\?\\C:\\temp\\file.txt",
    "true false hello",
    "true a b c\u20ac",
    "a+b %ZZ",
    "true",
    "done",
    "true",
    "true true"
  ]);
});

test("node:path/win32 handles drive, UNC, namespace, and relative paths", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import path from "node:path";

    const win = path.win32;
    console.log(win.normalize("C:/temp//foo/../bar"));
    console.log(win.join("C:/temp", "foo", "..", "bar"));
    console.log(win.resolve("C:/temp", "../bar"));
    console.log(win.dirname("C:\\\\temp\\\\file.txt"));
    console.log(win.basename("C:\\\\temp\\\\file.txt"));
    console.log(win.extname("C:\\\\temp\\\\file.txt"));
    console.log(JSON.stringify(win.parse("C:\\\\temp\\\\file.txt")));
    console.log(win.format({ dir: "C:\\\\temp", name: "file", ext: ".txt" }));
    console.log(win.normalize("a\\\\\\\\b\\\\\\\\"));
    console.log(win.format({ dir: "C:\\\\temp", name: "file", ext: "txt" }));
    console.log(win.relative("C:\\\\temp\\\\a", "C:\\\\temp\\\\b\\\\file.txt"));
    console.log(win.isAbsolute("\\\\\\\\server\\\\share\\\\x"), win.isAbsolute("C:relative"));
    console.log(win.toNamespacedPath("C:\\\\temp\\\\file.txt"));
    console.log(win.toNamespacedPath("\\\\\\\\server\\\\share\\\\file.txt"));
    console.log(win.matchesGlob("src\\\\lib\\\\index.js", "src\\\\**\\\\*.js"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "C:\\temp\\bar",
    "C:\\temp\\bar",
    "C:\\bar",
    "C:\\temp",
    "file.txt",
    ".txt",
    "{\"root\":\"C:\\\\\",\"dir\":\"C:\\\\temp\",\"base\":\"file.txt\",\"ext\":\".txt\",\"name\":\"file\"}",
    "C:\\temp\\file.txt",
    "a\\b\\",
    "C:\\temp\\file.txt",
    "..\\b\\file.txt",
    "true false",
    "\\\\?\\C:\\temp\\file.txt",
    "\\\\?\\UNC\\server\\share\\file.txt",
    "true"
  ]);
});

test("node:path validates string and path object arguments", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import path from "node:path";

    function describe(action) {
      try {
        return "ok:" + String(action());
      } catch (error) {
        return error.name + ":" + error.code;
      }
    }

    const passthrough = { path: true };
    const validationChecks = [
      (p) => p.resolve("a", null),
      (p) => p.normalize(null),
      (p) => p.isAbsolute(null),
      (p) => p.join("a", null),
      (p) => p.relative(null, "b"),
      (p) => p.relative("a", null),
      (p) => p.dirname(null),
      (p) => p.basename(null),
      (p) => p.extname(null),
      (p) => p.parse(null),
      (p) => p.basename("file.txt", null),
      (p) => p.format(null),
      (p) => p.format(undefined),
      (p) => p.format([]),
      (p) => p.format(function pathObject() {}),
      (p) => p.format(Symbol("pathObject")),
      (p) => p.matchesGlob(null, "*.js"),
      (p) => p.matchesGlob("file.js", null)
    ];
    const modules = [path, path.posix, path.win32];
    console.log([
      describe(() => path.join(null)),
      describe(() => path.resolve("/tmp", null)),
      describe(() => path.relative(null, "/tmp")),
      describe(() => path.basename("/tmp/file.txt", 1)),
      describe(() => path.format(null)),
      describe(() => path.format([])),
      describe(() => path.matchesGlob("file.js", null))
    ].join("|"));
    console.log([
      describe(() => path.posix.normalize(null)),
      describe(() => path.posix.isAbsolute(null)),
      describe(() => path.posix.parse(null)),
      describe(() => path.posix.matchesGlob(null, "*"))
    ].join("|"));
    console.log([
      describe(() => path.win32.normalize(null)),
      describe(() => path.win32.resolve("C:/tmp", null)),
      describe(() => path.win32.relative(null, "C:/tmp")),
      describe(() => path.win32.basename("C:/tmp/file.txt", 1)),
      describe(() => path.win32.format([])),
      describe(() => path.win32.matchesGlob("file.js", null))
    ].join("|"));
    console.log(path.toNamespacedPath(passthrough) === passthrough, path.win32.toNamespacedPath(passthrough) === passthrough);
    console.log("validation matrix", modules.every((module) => validationChecks.every((check) => describe(() => check(module)) === "TypeError:ERR_INVALID_ARG_TYPE")));
    console.log("namespaced passthrough", [null, 1, undefined].every((value) => path.toNamespacedPath(value) === value && path.posix.toNamespacedPath(value) === value && path.win32.toNamespacedPath(value) === value));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE",
    "TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE",
    "TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE|TypeError:ERR_INVALID_ARG_TYPE",
    "true true",
    "validation matrix true",
    "namespaced passthrough true"
  ]);
});

test("node:path exposes matchesGlob for basic package probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const path = require("node:path");
      console.log(path.matchesGlob("src/index.test.js", "src/*.test.js"));
      console.log(path.posix.matchesGlob("src/lib/index.js", "src/**/*.js"));
      console.log(path.matchesGlob("src/index.js", "src/**/*.js"));
      console.log(path.matchesGlob("src/.hidden.js", "src/*.js"));
      console.log(path.matchesGlob("src/file.js", "src/*.{js,ts}"));
      console.log(path.matchesGlob("src/c.js", "src/[!ab].js"));
      console.log(path.matchesGlob("src/lib/.hidden.js", "src/**/*.js"));
      console.log(path.win32.matchesGlob("src\\\\index.js", "src\\\\**\\\\*.js"));
      console.log(path.win32.matchesGlob("src\\\\.hidden.js", "src\\\\*.js"));
      console.log(path.win32.matchesGlob("src\\\\file.ts", "src\\\\*.{js,ts}"));
      console.log(path.win32.matchesGlob("src\\\\c.js", "src\\\\[!ab].js"));
      console.log(path.win32.matchesGlob("src/index.css", "*.js"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true",
    "false",
    "true",
    "true",
    "false",
    "true",
    "false",
    "true",
    "true",
    "false"
  ]);
});

test("optional native-oriented core modules resolve with explicit unsupported operations", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.mjs", `
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);

      const inspector = require("node:inspector");
      const inspectorPromises = require("node:inspector/promises");
      const repl = require("node:repl");
	      const sqlite = require("node:sqlite");
	      const traceEvents = require("node:trace_events");
	      const util = require("node:util");
	      const wasi = require("node:wasi");

      console.log(typeof inspector.Session, inspector.url());
      console.log(Object.keys(inspector).join(","));
      console.log(["open", "close", "url", "waitForDebugger"].map((name) => name + ":" + inspector[name].name + ":" + inspector[name].length).join("|"));
      const inspectorFunctionDescriptors = (namespace) => ["open", "close", "url", "waitForDebugger"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(namespace, name);
        const fn = namespace[name];
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, fn.name, fn.length, Object.hasOwn(fn, "prototype")].join(":");
      }).join("|");
      console.log("inspector descriptors", inspectorFunctionDescriptors(inspector));
      console.log(Object.keys(inspector.console).join(","));
      const inspectorConsoleTag = Object.getOwnPropertyDescriptor(inspector.console, Symbol.toStringTag);
      console.log("inspector console tag", inspectorConsoleTag.value, inspectorConsoleTag.enumerable, inspectorConsoleTag.configurable, inspectorConsoleTag.writable, Object.prototype.toString.call(inspector.console));
      const inspectorScopedFunctionRows = (namespace, names) => names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(namespace, name);
        const fn = descriptor.value;
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          fn.name,
          fn.length,
          Object.hasOwn(fn, "prototype"),
          prototypeDescriptor?.enumerable ?? "missing",
          prototypeDescriptor?.configurable ?? "missing",
          prototypeDescriptor?.writable ?? "missing",
          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
          prototypeDescriptor?.value?.constructor === fn
        ].join(":");
      }).join("|");
      console.log("inspector console helper metadata", inspectorScopedFunctionRows(inspector.console, Object.keys(inspector.console)));
      console.log(Object.keys(inspector.Network).join(","));
      console.log("inspector network helper metadata", inspectorScopedFunctionRows(inspector.Network, Object.keys(inspector.Network)));
      console.log(Object.keys(inspector.DOMStorage).sort().join(","));
      console.log("inspector domstorage helper metadata", inspectorScopedFunctionRows(inspector.DOMStorage, Object.keys(inspector.DOMStorage).sort()));
      console.log(Object.keys(inspector.NetworkResources).sort().join(","));
      console.log("inspector networkresources helper metadata", inspectorScopedFunctionRows(inspector.NetworkResources, Object.keys(inspector.NetworkResources).sort()));
      const session = new inspector.Session();
      console.log(Object.prototype.hasOwnProperty.call(session, "connected"), session.connected);
      try {
        session.connectToMainThread();
      } catch (error) {
        console.log(error.name, error.code);
      }
      session.connect();
      console.log(Object.prototype.hasOwnProperty.call(session, "connected"), session.connected);
      try {
        session.connect();
      } catch (error) {
        console.log(error.name, error.code);
      }
	      let inspectorDisconnects = 0;
	      session.on("disconnect", () => { inspectorDisconnects += 1; });
	      try {
	        session.post("Runtime.evaluate", {}, 1);
	      } catch (error) {
	        console.log(error.name, error.code);
	      }
      session.post("Runtime.evaluate", { expression: "1 + 2", returnByValue: true }, (error, result) => {
        console.log(error, result.result.type, result.result.value);
      });
      session.post("Runtime.evaluate", { expression: "({ a: 1 })", returnByValue: true }, (error, result) => {
        console.log(error, result.result.type, result.result.value.a);
      });
      session.post("Runtime.evaluate", { expression: "({ a: 1 })" }, (error, result) => {
        console.log(error, result.result.type, result.result.className, typeof result.result.objectId);
        session.post("Runtime.getProperties", { objectId: result.result.objectId }, (propertyError, propertyResult) => {
          const property = propertyResult.result.find((item) => item.name === "a");
          console.log(propertyError, property.name, property.value.value);
        });
      });
      session.post("Runtime.nope", {}, (error) => {
        console.log(error.code);
      });
      session.post("Debugger.enable", {}, (error, result) => {
        console.log(error, result.debuggerId);
      });
      session.post("Schema.getDomains", {}, (error, result) => {
        console.log(error, result.domains.some((domain) => domain.name === "Runtime"));
      });
      session.post("Profiler.start", {}, (error, result) => {
        console.log(error, Object.keys(result).length);
      });
      session.post("Profiler.stop", {}, (error, result) => {
        console.log(error, Array.isArray(result.profile.nodes), typeof result.profile.startTime, typeof result.profile.endTime, result.profile.nodes[0].callFrame.functionName);
      });
	      try {
	        session.post("Runtime.evaluate", {}, 1);
	      } catch (error) {
	        console.log(error.name, error.code);
	      }
	      session.disconnect();
	      console.log("inspector disconnects", inspectorDisconnects);
	      console.log(Object.prototype.hasOwnProperty.call(session, "connected"), session.connected);

	      const promisesSession = new inspectorPromises.Session();
	      let promisesDisconnects = 0;
	      promisesSession.on("disconnect", () => { promisesDisconnects += 1; });
      console.log(Object.keys(inspectorPromises).join(","));
      console.log(Object.keys(inspectorPromises).sort().join(","));
      console.log("inspector promises descriptors", inspectorFunctionDescriptors(inspectorPromises));
      const promisesPostDescriptor = Object.getOwnPropertyDescriptor(inspectorPromises.Session.prototype, "post");
      const promisesPostPrototypeDescriptor = Object.getOwnPropertyDescriptor(promisesPostDescriptor.value, "prototype");
      console.log(Object.hasOwn(inspectorPromises, "default"), Object.getOwnPropertyNames(inspectorPromises.Session.prototype).sort().join(","), promisesSession.post.length, promisesPostDescriptor.enumerable, Object.hasOwn(promisesPostDescriptor.value, "prototype"), promisesPostPrototypeDescriptor.enumerable, promisesPostPrototypeDescriptor.configurable, promisesPostPrototypeDescriptor.writable, Object.getOwnPropertyNames(promisesPostPrototypeDescriptor.value).join(","), promisesPostPrototypeDescriptor.value.constructor === promisesPostDescriptor.value);
      const constructedPromisesPost = new promisesPostDescriptor.value(() => {});
      console.log("inspector promises post construct", constructedPromisesPost instanceof Promise, await constructedPromisesPost.catch((error) => [error.name, error.code, error.message.includes("Received function")].join(":")));
      console.log(typeof promisesSession.connect, typeof promisesSession.disconnect);
      try {
        promisesSession.connectToMainThread();
      } catch (error) {
        console.log(error.name, error.code);
      }
	      await promisesSession.post("Runtime.evaluate", { expression: "1 + 1", returnByValue: true }).catch((error) => {
	        console.log(error.code);
	      });
	      await promisesSession.post("Runtime.evaluate", {}, 1).catch((error) => {
	        console.log(error.name, error.code);
	      });
      promisesSession.connect();
      try {
        promisesSession.connect();
      } catch (error) {
        console.log(error.name, error.code);
      }
      const promisesResult = await promisesSession.post("Runtime.evaluate", { expression: "1 + 2", returnByValue: true });
      console.log(promisesResult.result.type, promisesResult.result.value);
      const promisesProfilerStart = await promisesSession.post("Profiler.start", {});
      console.log(Object.keys(promisesProfilerStart).length);
      const promisesProfilerStop = await promisesSession.post("Profiler.stop", {});
      console.log(Array.isArray(promisesProfilerStop.profile.nodes), typeof promisesProfilerStop.profile.startTime, typeof promisesProfilerStop.profile.endTime, promisesProfilerStop.profile.nodes[0].callFrame.functionName);
      await promisesSession.post("Runtime.nope", {}).catch((error) => {
        console.log(error.code);
      });
	      await promisesSession.post("Runtime.evaluate", {}, 1).catch((error) => {
	        console.log(error.name, error.code);
	      });
	      await promisesSession.post("Runtime.evaluate", () => {}).catch((error) => {
	        console.log(error.name, error.code);
	      });
	      promisesSession.disconnect();
	      console.log("inspector promises disconnects", promisesDisconnects);

      const output = [];
      const server = repl.start({ prompt: "oc> ", output: { write: chunk => output.push(chunk) } });
      server.defineCommand("hello", { help: "demo", action() { this.output.write("hello command"); } });
      server.setupHistory("/workspace/.repl-history", (error, instance) => {
        console.log(error === null, instance === server);
      });
      server.commands.hello.action.call(server);
      server.close();
      const recoverable = new repl.Recoverable(new SyntaxError("Unexpected end of input"));
      console.log(typeof repl.REPLServer, server instanceof repl.REPLServer, output.join(""), recoverable instanceof repl.Recoverable);
      console.log(typeof repl.writer, typeof repl.isValidSyntax, typeof repl.REPL_MODE_SLOPPY, typeof repl.REPL_MODE_STRICT);
      console.log(recoverable instanceof SyntaxError, recoverable.err.message, repl.isValidSyntax("1 + 1"), repl.isValidSyntax("await 1"), repl.isValidSyntax("function x("));
      console.log(recoverable.name, JSON.stringify(recoverable.message), Object.hasOwn(recoverable, "name"), Object.hasOwn(recoverable, "message"));
      console.log(Object.keys(recoverable).join(","), Object.getOwnPropertyNames(recoverable).filter((name) => name !== "stack").join(","));
      console.log(Object.keys(server.commands).sort().join(","));
      console.log(typeof sqlite.DatabaseSync, typeof sqlite.StatementSync, typeof sqlite.backup, typeof sqlite.constants);

      console.log(traceEvents.getEnabledCategories() === undefined);
      const tracing = traceEvents.createTracing({ categories: ["node", "v8"] });
      const overlapping = traceEvents.createTracing({ categories: ["node", "node.async_hooks"] });
	      console.log(Object.keys(tracing).length, Object.getPrototypeOf(tracing).constructor.name);
		      const tracePrototype = Object.getPrototypeOf(tracing);
		      console.log(Object.getOwnPropertyNames(tracePrototype).join(","));
		      console.log("trace symbols", Object.getOwnPropertySymbols(tracePrototype).map((symbol) => {
		        const descriptor = Object.getOwnPropertyDescriptor(tracePrototype, symbol);
		        return [String(symbol), typeof descriptor.value, descriptor.value?.name ?? "", descriptor.value?.length ?? "", descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value ?? {}, "prototype")].join(":");
		      }).join("|"));
		      console.log("trace inspect", util.inspect(tracing));
		      const describeTraceOwnDescriptor = (object, name) => {
		        const descriptor = Object.getOwnPropertyDescriptor(object, name);
		        if ("value" in descriptor && typeof descriptor.value === "function") {
		          return [name, "value", descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
		        }
		        if ("value" in descriptor) {
		          return [name, "value", descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
		        }
		        return [name, "accessor", descriptor.enumerable, descriptor.configurable, typeof descriptor.get, typeof descriptor.set].join(":");
		      };
		      console.log("createTracing own", ["name", "length", "prototype"].map((name) => describeTraceOwnDescriptor(traceEvents.createTracing, name)).join("|"));
		      console.log("trace constructor", describeTraceOwnDescriptor(tracePrototype, "constructor"));
		      const createTracingDescriptor = Object.getOwnPropertyDescriptor(traceEvents, "createTracing");
	      const getEnabledCategoriesDescriptor = Object.getOwnPropertyDescriptor(traceEvents, "getEnabledCategories");
	      const createTracingPrototypeDescriptor = Object.getOwnPropertyDescriptor(traceEvents.createTracing, "prototype");
	      const constructedTracing = new traceEvents.createTracing({ categories: ["node.constructed"] });
	      console.log(traceEvents.createTracing.name, traceEvents.createTracing.length, createTracingDescriptor.enumerable, createTracingDescriptor.configurable, createTracingDescriptor.writable);
	      console.log(Object.hasOwn(traceEvents.createTracing, "prototype"), createTracingPrototypeDescriptor.enumerable, createTracingPrototypeDescriptor.configurable, createTracingPrototypeDescriptor.writable, createTracingPrototypeDescriptor.value.constructor === traceEvents.createTracing, Object.getOwnPropertyNames(createTracingPrototypeDescriptor.value).join(","));
	      console.log(constructedTracing.constructor.name, constructedTracing.categories, constructedTracing.enabled);
	      console.log(traceEvents.getEnabledCategories.name, traceEvents.getEnabledCategories.length, getEnabledCategoriesDescriptor.enumerable, getEnabledCategoriesDescriptor.configurable, getEnabledCategoriesDescriptor.writable);
      const enableDescriptor = Object.getOwnPropertyDescriptor(tracePrototype, "enable");
      const disableDescriptor = Object.getOwnPropertyDescriptor(tracePrototype, "disable");
      const categoriesDescriptor = Object.getOwnPropertyDescriptor(tracePrototype, "categories");
      const enabledDescriptor = Object.getOwnPropertyDescriptor(tracePrototype, "enabled");
      console.log(enableDescriptor.value.name, enableDescriptor.value.length, enableDescriptor.enumerable, enableDescriptor.configurable, enableDescriptor.writable);
      console.log(disableDescriptor.value.name, disableDescriptor.value.length, disableDescriptor.enumerable, disableDescriptor.configurable, disableDescriptor.writable);
      console.log(categoriesDescriptor.get.name, typeof categoriesDescriptor.get, categoriesDescriptor.set === undefined, categoriesDescriptor.enumerable, categoriesDescriptor.configurable);
      console.log(enabledDescriptor.get.name, typeof enabledDescriptor.get, enabledDescriptor.set === undefined, enabledDescriptor.enumerable, enabledDescriptor.configurable);
      console.log(Boolean(categoriesDescriptor.get), Boolean(enabledDescriptor.get));
      tracing.enabled = true;
      tracing.categories = "changed";
      console.log(tracing.enabled, tracing.categories);
      tracing.enable();
      overlapping.enable();
      console.log(tracing.categories, tracing.enabled, overlapping.enabled, traceEvents.getEnabledCategories());
      tracing.disable();
      console.log(tracing.enabled, overlapping.enabled, traceEvents.getEnabledCategories());
      overlapping.disable();
      console.log(traceEvents.getEnabledCategories() === undefined, traceEvents.createTracing({ categories: [""] }).categories === "");
      const spacedTrace = traceEvents.createTracing({ categories: [" node ", "v8 "] });
      const whitespaceTrace = traceEvents.createTracing({ categories: [" "] });
      const sparseTrace = traceEvents.createTracing({ categories: ["", "node", ""] });
      const commaTrace = traceEvents.createTracing({ categories: ["node, v8"] });
      console.log(JSON.stringify(spacedTrace.categories), JSON.stringify(whitespaceTrace.categories), JSON.stringify(sparseTrace.categories), JSON.stringify(commaTrace.categories));
      whitespaceTrace.enable();
      console.log(JSON.stringify(traceEvents.getEnabledCategories()));
      whitespaceTrace.disable();
      spacedTrace.enable();
      console.log(JSON.stringify(traceEvents.getEnabledCategories()));
      spacedTrace.disable();
      sparseTrace.enable();
      console.log(JSON.stringify(traceEvents.getEnabledCategories()));
      sparseTrace.disable();
      commaTrace.enable();
      console.log(JSON.stringify(traceEvents.getEnabledCategories()));
      commaTrace.disable();
      for (const options of [undefined, {}, { categories: [] }, { categories: [1] }, Object.assign(function traceOptions() {}, { categories: ["node"] })]) {
        try {
          if (options === undefined) traceEvents.createTracing();
          else traceEvents.createTracing(options);
        } catch (error) {
          console.log(error.code);
        }
      }
      const wasiRuntime = new wasi.WASI({ version: "preview1", args: ["app"], env: { A: "1" }, preopens: { "/workspace": "/workspace" } });
      const wasiImportObject = wasiRuntime.getImportObject();
      const wasiImportPrototype = Object.getPrototypeOf(wasiRuntime.wasiImport);
      const wasiImportDescriptor = (object, name) => {
        const descriptor = Object.getOwnPropertyDescriptor(object, name);
        return [
          name,
          Boolean(descriptor),
          descriptor?.enumerable,
          descriptor?.configurable,
          descriptor?.writable,
          typeof descriptor?.value,
          descriptor?.value?.name,
          descriptor?.value?.length,
          Object.hasOwn(descriptor?.value ?? {}, "prototype")
        ].join(":");
      };
      console.log(Object.keys(wasi).join(","), Object.hasOwn(wasi, "default"), wasi.WASI.length);
      console.log(Object.keys(wasiRuntime).join(","), typeof wasiRuntime.wasiImport.args_get, typeof wasiRuntime.wasiImport.fd_write, Object.keys(wasiImportObject).join(","));
      console.log("wasi import names", Object.getOwnPropertyNames(wasiRuntime.wasiImport).join(","));
      console.log("wasi import prototype names", Object.getOwnPropertyNames(wasiImportPrototype).join(","));
      const preStartCode = (runtime) => {
        try {
          runtime.wasiImport.args_get();
          return "ok";
        } catch (error) {
          return [error.name, error.code, error.message].join(":");
        }
      };
      console.log(Object.keys(wasiRuntime.wasiImport).length > 40, wasiImportObject.wasi_snapshot_preview1 === wasiRuntime.wasiImport, preStartCode(wasiRuntime));
      const unstableRuntime = new wasi.WASI({ version: "unstable" });
      const unstableImportObject = unstableRuntime.getImportObject();
      console.log(Object.keys(unstableImportObject).join(","), unstableImportObject.wasi_unstable === unstableRuntime.wasiImport, preStartCode(unstableRuntime));
      console.log(["args_get", "fd_fdstat_get", "fd_write", "path_open", "random_get", "sched_yield", "proc_exit"].map((name) => name + ":" + wasiRuntime.wasiImport[name].length + ":" + wasiRuntime.wasiImport[name].name).join("|"));
      console.log(["args_get", "fd_write", "proc_exit", "constructor"].map((name) => wasiImportDescriptor(wasiRuntime.wasiImport, name) + "|" + wasiImportDescriptor(wasiImportPrototype, name)).join(";"));
      console.log(Object.getOwnPropertyNames(wasi.WASI.prototype).join(","));
      console.log("wasi metadata", wasi.WASI.name, wasi.WASI.length);
      console.log("wasi options valid", new wasi.WASI({ version: "preview1", returnOnExit: false, stdin: 0, stdout: 1, stderr: 2 }) instanceof wasi.WASI);
      for (const options of [
        undefined,
        [],
        Object.assign(function wasiOptions() {}, { version: "preview1" }),
        { version: "preview2" },
        { version: 1 },
        { version: "preview1", args: "app" },
        { version: "preview1", env: "nope" },
        { version: "preview1", preopens: [] },
        { version: "preview1", returnOnExit: "yes" },
        { version: "preview1", returnOnExit: null },
        { version: "preview1", stdin: "0" },
        { version: "preview1", stdout: 1.5 },
        { version: "preview1", stderr: -1 },
        { version: "preview1", stdin: 2147483648 }
      ]) {
        try {
          if (options === undefined) new wasi.WASI();
          else new wasi.WASI(options);
        } catch (error) {
          console.log(error.code);
        }
      }
      const wasiMemory = () => new WebAssembly.Memory({ initial: 1 });
      for (const [label, action] of [
        ["finalize-empty", (runtime) => runtime.finalizeBindings({ exports: {} })],
        ["finalize-memory", (runtime) => runtime.finalizeBindings({ exports: { memory: wasiMemory() } })],
        ["initialize-empty", (runtime) => runtime.initialize({ exports: {} })],
        ["initialize-memory", (runtime) => runtime.initialize({ exports: { memory: wasiMemory() } })],
        ["initialize-fn", (runtime) => {
          let initializeCalls = 0;
          const result = runtime.initialize({ exports: { memory: wasiMemory(), _initialize() { initializeCalls += 1; return 5; } } });
          return String(result) + ":" + initializeCalls;
        }],
        ["initialize-nonfn", (runtime) => runtime.initialize({ exports: { memory: wasiMemory(), _initialize: 1 } })],
        ["initialize-start", (runtime) => runtime.initialize({ exports: { memory: wasiMemory(), _start() {} } })],
        ["start-empty", (runtime) => runtime.start({ exports: {} })],
        ["start-memory", (runtime) => runtime.start({ exports: { memory: wasiMemory() } })]
      ]) {
        try {
          console.log(label, "ok", action(new wasi.WASI({ version: "preview1" })));
        } catch (error) {
          console.log(label, error.code);
        }
      }
      let startCalls = 0;
      console.log("start-fn", new wasi.WASI({ version: "preview1" }).start({ exports: { memory: wasiMemory(), _start() { startCalls += 1; return 7; } } }), startCalls);
      const throwingInitialize = new wasi.WASI({ version: "preview1" });
      try {
        throwingInitialize.initialize({ exports: { memory: wasiMemory(), _initialize() { throw Object.assign(new Error("boom"), { code: "BOOM" }); } } });
      } catch (error) {
        console.log("initialize-throw", error.code);
      }
      try {
        throwingInitialize.start({ exports: { memory: wasiMemory(), _start() {} } });
      } catch (error) {
        console.log("initialize-throw-started", error.code);
      }
      const exitRuntime = new wasi.WASI({ version: "preview1" });
      console.log("start-proc-exit", exitRuntime.start({ exports: { memory: wasiMemory(), _start() { exitRuntime.wasiImport.proc_exit(7); } } }));
      const exitRuntimeExplicit = new wasi.WASI({ version: "preview1", returnOnExit: true });
      console.log("start-proc-exit-true", exitRuntimeExplicit.start({ exports: { memory: wasiMemory(), _start() { exitRuntimeExplicit.wasiImport.proc_exit(8); } } }));
      try {
        new wasi.WASI({ version: "preview1" }).wasiImport.proc_exit(9);
      } catch (error) {
        console.log("direct-proc-exit", typeof error, String(error), Object.getOwnPropertyNames(Object(error)).join(",") || "<none>");
      }

      for (const run of [
        () => inspector.open(),
        () => new sqlite.DatabaseSync(":memory:").exec("select 1"),
        () => new sqlite.StatementSync().run(),
        () => new sqlite.Session().changeset()
      ]) {
        try {
          run();
        } catch (error) {
          console.log(error.code);
        }
      }
      const backupPromise = sqlite.backup(new sqlite.DatabaseSync(":memory:"), "backup.db");
      console.log("sqlite backup promise", backupPromise.constructor.name, typeof backupPromise.then);
      backupPromise.catch((error) => console.log(error.code));
    `);
  const result = await kernel.run("node", ["index.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function undefined",
    "open,close,url,waitForDebugger,console,Session,Network,NetworkResources,DOMStorage",
    "open:inspectorOpen:3|close:_debugEnd:0|url:url:0|waitForDebugger:inspectorWaitForDebugger:0",
    "inspector descriptors open:true:true:true:inspectorOpen:3:true|close:true:true:true:_debugEnd:0:false|url:true:true:true:url:0:false|waitForDebugger:true:true:true:inspectorWaitForDebugger:0:true",
    "debug,error,info,log,warn,dir,dirxml,table,trace,group,groupCollapsed,groupEnd,clear,count,countReset,assert,profile,profileEnd,time,timeLog,timeEnd,timeStamp,context",
    "inspector console tag console false true false [object console]",
    "inspector console helper metadata debug:true:true:true:debug:0:false:missing:missing:missing::false|error:true:true:true:error:0:false:missing:missing:missing::false|info:true:true:true:info:0:false:missing:missing:missing::false|log:true:true:true:log:0:false:missing:missing:missing::false|warn:true:true:true:warn:0:false:missing:missing:missing::false|dir:true:true:true:dir:0:false:missing:missing:missing::false|dirxml:true:true:true:dirxml:0:false:missing:missing:missing::false|table:true:true:true:table:0:false:missing:missing:missing::false|trace:true:true:true:trace:0:false:missing:missing:missing::false|group:true:true:true:group:0:false:missing:missing:missing::false|groupCollapsed:true:true:true:groupCollapsed:0:false:missing:missing:missing::false|groupEnd:true:true:true:groupEnd:0:false:missing:missing:missing::false|clear:true:true:true:clear:0:false:missing:missing:missing::false|count:true:true:true:count:0:false:missing:missing:missing::false|countReset:true:true:true:countReset:0:false:missing:missing:missing::false|assert:true:true:true:assert:0:false:missing:missing:missing::false|profile:true:true:true:profile:0:false:missing:missing:missing::false|profileEnd:true:true:true:profileEnd:0:false:missing:missing:missing::false|time:true:true:true:time:0:false:missing:missing:missing::false|timeLog:true:true:true:timeLog:0:false:missing:missing:missing::false|timeEnd:true:true:true:timeEnd:0:false:missing:missing:missing::false|timeStamp:true:true:true:timeStamp:0:false:missing:missing:missing::false|context:true:true:true:context:1:false:missing:missing:missing::false",
    "requestWillBeSent,responseReceived,loadingFinished,loadingFailed,dataSent,dataReceived,webSocketCreated,webSocketClosed,webSocketHandshakeResponseReceived",
    "inspector network helper metadata requestWillBeSent:true:true:true:requestWillBeSent:1:false:missing:missing:missing::false|responseReceived:true:true:true:responseReceived:1:false:missing:missing:missing::false|loadingFinished:true:true:true:loadingFinished:1:false:missing:missing:missing::false|loadingFailed:true:true:true:loadingFailed:1:false:missing:missing:missing::false|dataSent:true:true:true:dataSent:1:false:missing:missing:missing::false|dataReceived:true:true:true:dataReceived:1:false:missing:missing:missing::false|webSocketCreated:true:true:true:webSocketCreated:1:false:missing:missing:missing::false|webSocketClosed:true:true:true:webSocketClosed:1:false:missing:missing:missing::false|webSocketHandshakeResponseReceived:true:true:true:webSocketHandshakeResponseReceived:1:false:missing:missing:missing::false",
    "domStorageItemAdded,domStorageItemRemoved,domStorageItemUpdated,domStorageItemsCleared,registerStorage",
    "inspector domstorage helper metadata domStorageItemAdded:true:true:true:domStorageItemAdded:1:false:missing:missing:missing::false|domStorageItemRemoved:true:true:true:domStorageItemRemoved:1:false:missing:missing:missing::false|domStorageItemUpdated:true:true:true:domStorageItemUpdated:1:false:missing:missing:missing::false|domStorageItemsCleared:true:true:true:domStorageItemsCleared:1:false:missing:missing:missing::false|registerStorage:true:true:true:registerStorage:1:false:missing:missing:missing::false",
    "put",
    "inspector networkresources helper metadata put:true:true:true:put:2:true:false:false:true:constructor:true",
    "false undefined",
    "Error ERR_INSPECTOR_NOT_WORKER",
	    "false undefined",
	    "Error ERR_INSPECTOR_ALREADY_CONNECTED",
	    "TypeError ERR_INVALID_ARG_TYPE",
	    "null number 3",
	    "null object 1",
	    "null object Object string",
    "null a 1",
    "ERR_INSPECTOR_COMMAND",
    "null opencontainers",
	    "null true",
	    "null 0",
	    "null true number number (root)",
	    "TypeError ERR_INVALID_ARG_TYPE",
		    "inspector disconnects 0",
    "false undefined",
    "open,close,url,waitForDebugger,console,Session,Network,NetworkResources,DOMStorage",
    "DOMStorage,Network,NetworkResources,Session,close,console,open,url,waitForDebugger",
    "inspector promises descriptors open:true:true:true:inspectorOpen:3:true|close:true:true:true:_debugEnd:0:false|url:true:true:true:url:0:false|waitForDebugger:true:true:true:inspectorWaitForDebugger:0:true",
    "false constructor,post 3 true true false false true constructor true",
    "inspector promises post construct true TypeError:ERR_INVALID_ARG_TYPE:true",
	    "function function",
	    "Error ERR_INSPECTOR_NOT_WORKER",
	    "ERR_INSPECTOR_NOT_CONNECTED",
	    "TypeError ERR_INVALID_ARG_TYPE",
	    "Error ERR_INSPECTOR_ALREADY_CONNECTED",
	    "number 3",
	    "0",
	    "true number number (root)",
		    "ERR_INSPECTOR_COMMAND",
		    "TypeError ERR_INVALID_ARG_TYPE",
		    "TypeError ERR_INVALID_ARG_TYPE",
		    "inspector promises disconnects 0",
	    "true true",
	    "function true oc> hello command true",
	    "function function symbol symbol",
	    "true Unexpected end of input true true false",
	    "SyntaxError \"\" false false",
	    "err err",
	    "break,clear,exit,hello,help,load,save",
    "function function function object",
		    "true",
		    "0 Tracing",
		    "constructor,enable,disable,enabled,categories",
		    "trace symbols Symbol(nodejs.util.inspect.custom):function:[nodejs.util.inspect.custom]:2:false:true:true:false",
		    "trace inspect Tracing { enabled: false, categories: 'node,v8' }",
		    "createTracing own name:value:false:true:false:string|length:value:false:true:false:number|prototype:value:false:false:true:object",
		    "trace constructor constructor:value:false:true:true:Tracing:1:true",
		    "createTracing 1 true true true",
	    "true false false true true constructor",
	    "Tracing node.constructed false",
	    "getEnabledCategories 0 true true true",
    "enable 0 false true true",
    "disable 0 false true true",
    "get categories function true false true",
    "get enabled function true false true",
    "true true",
    "false node,v8",
    "node,v8 true true node,node.async_hooks,v8",
    "false true node,node.async_hooks",
    "true true",
    "\" node ,v8 \" \" \" \",node,\" \"node, v8\"",
    "\" \"",
    "\" node ,v8 \"",
    "\"node\"",
    "\"node, v8\"",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_TRACE_EVENTS_CATEGORY_REQUIRED",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "WASI false 0",
    "wasiImport function function wasi_snapshot_preview1",
    "wasi import names args_get,args_sizes_get,clock_res_get,clock_time_get,environ_get,environ_sizes_get,fd_advise,fd_allocate,fd_close,fd_datasync,fd_fdstat_get,fd_fdstat_set_flags,fd_fdstat_set_rights,fd_filestat_get,fd_filestat_set_size,fd_filestat_set_times,fd_pread,fd_prestat_get,fd_prestat_dir_name,fd_pwrite,fd_read,fd_readdir,fd_renumber,fd_seek,fd_sync,fd_tell,fd_write,path_create_directory,path_filestat_get,path_filestat_set_times,path_link,path_open,path_readlink,path_remove_directory,path_rename,path_symlink,path_unlink_file,poll_oneoff,proc_exit,proc_raise,random_get,sched_yield,sock_accept,sock_recv,sock_send,sock_shutdown",
    "wasi import prototype names args_get,args_sizes_get,clock_res_get,clock_time_get,environ_get,environ_sizes_get,fd_advise,fd_allocate,fd_close,fd_datasync,fd_fdstat_get,fd_fdstat_set_flags,fd_fdstat_set_rights,fd_filestat_get,fd_filestat_set_size,fd_filestat_set_times,fd_pread,fd_prestat_get,fd_prestat_dir_name,fd_pwrite,fd_read,fd_readdir,fd_renumber,fd_seek,fd_sync,fd_tell,fd_write,path_create_directory,path_filestat_get,path_filestat_set_times,path_link,path_open,path_readlink,path_remove_directory,path_rename,path_symlink,path_unlink_file,poll_oneoff,proc_exit,proc_raise,random_get,sched_yield,sock_accept,sock_recv,sock_send,sock_shutdown,constructor",
    "true true Error:ERR_WASI_NOT_STARTED:wasi.start() has not been called",
    "wasi_unstable true Error:ERR_WASI_NOT_STARTED:wasi.start() has not been called",
	    "args_get:2:bound args_get|fd_fdstat_get:2:bound fd_fdstat_get|fd_write:4:bound fd_write|path_open:9:bound path_open|random_get:2:bound random_get|sched_yield:0:bound sched_yield|proc_exit:1:bound wasiReturnOnProcExit",
	    "args_get:true:true:true:true:function:bound args_get:2:false|args_get:true:true:true:true:function:args_get:2:false;fd_write:true:true:true:true:function:bound fd_write:4:false|fd_write:true:true:true:true:function:fd_write:4:false;proc_exit:true:true:true:true:function:bound wasiReturnOnProcExit:1:false|proc_exit:true:true:true:true:function:proc_exit:1:false;constructor:false::::undefined:::false|constructor:true:false:true:true:function:WASI:0:true",
	    "constructor,finalizeBindings,start,initialize,getImportObject",
	    "wasi metadata WASI 0",
	    "wasi options valid true",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_VALUE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_INVALID_ARG_TYPE",
	    "ERR_OUT_OF_RANGE",
	    "ERR_OUT_OF_RANGE",
	    "ERR_OUT_OF_RANGE",
	    "finalize-empty ERR_INVALID_ARG_TYPE",
    "finalize-memory ok undefined",
	    "initialize-empty ERR_INVALID_ARG_TYPE",
	    "initialize-memory ok undefined",
	    "initialize-fn ok undefined:1",
	    "initialize-nonfn ERR_INVALID_ARG_TYPE",
	    "initialize-start ERR_INVALID_ARG_TYPE",
	    "start-empty ERR_INVALID_ARG_TYPE",
	    "start-memory ERR_INVALID_ARG_TYPE",
	    "start-fn 0 1",
	    "initialize-throw BOOM",
	    "initialize-throw-started ERR_WASI_ALREADY_STARTED",
	    "start-proc-exit 7",
	    "start-proc-exit-true 8",
	    "direct-proc-exit symbol Symbol(kExitCode) <none>",
	    "ERR_OPENCONTAINERS_INSPECTOR_UNSUPPORTED",
    "ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED",
    "ERR_ILLEGAL_CONSTRUCTOR",
    "ERR_ILLEGAL_CONSTRUCTOR",
    "sqlite backup promise Promise function",
    "ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED"
  ]);
});

test("node:inspector reports native-shaped protocol validation errors", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.cjs", `
      const inspector = require("node:inspector");
      const inspectorPromises = require("node:inspector/promises");

      const format = (label, error, result) => [
        label,
        error?.code ?? "null",
        error?.message ?? "null",
        result ? Object.keys(result).join(",") : "null"
      ].join("|");

      const post = (session, label, method, params, omitParams = false) => new Promise((resolve) => {
        const callback = (error, result) => resolve(format(label, error, result));
        if (omitParams) session.post(method, callback);
        else session.post(method, params, callback);
      });

      const session = new inspector.Session();
      session.connect();
      const rows = [];
      rows.push(await post(session, "eval-omitted", "Runtime.evaluate", undefined, true));
      rows.push(await post(session, "eval-null", "Runtime.evaluate", null));
      rows.push(await post(session, "eval-empty", "Runtime.evaluate", {}));
      rows.push(await post(session, "eval-expression-null", "Runtime.evaluate", { expression: null }));
      rows.push(await post(session, "eval-expression-number", "Runtime.evaluate", { expression: 123 }));
      rows.push(await post(session, "eval-returnbyvalue-string", "Runtime.evaluate", { expression: "", returnByValue: "yes" }));
      rows.push(await post(session, "eval-await-string", "Runtime.evaluate", { expression: "", awaitPromise: "yes" }));
      rows.push(await post(session, "eval-objectgroup-number", "Runtime.evaluate", { expression: "", objectGroup: 1 }));
      rows.push(await post(session, "eval-empty-string", "Runtime.evaluate", { expression: "" }));
      rows.push(await post(session, "properties-empty", "Runtime.getProperties", {}));
      rows.push(await post(session, "properties-number", "Runtime.getProperties", { objectId: 1 }));
      rows.push(await post(session, "properties-missing", "Runtime.getProperties", { objectId: "missing" }));
      rows.push(await post(session, "release-empty", "Runtime.releaseObject", {}));
      rows.push(await post(session, "release-number", "Runtime.releaseObject", { objectId: 1 }));
      rows.push(await post(session, "release-missing", "Runtime.releaseObject", { objectId: "missing" }));
      rows.push(await post(session, "release-group-empty", "Runtime.releaseObjectGroup", {}));
      rows.push(await post(session, "release-group-number", "Runtime.releaseObjectGroup", { objectGroup: 1 }));
      rows.push(await post(session, "release-group-valid", "Runtime.releaseObjectGroup", { objectGroup: "missing" }));
      session.disconnect();

      const promiseSession = new inspectorPromises.Session();
      promiseSession.connect();
      const promisePost = async (label, method, params, omitParams = false) => {
        try {
          const result = omitParams
            ? await promiseSession.post(method)
            : await promiseSession.post(method, params);
          return format(label, null, result);
        } catch (error) {
          return format(label, error, null);
        }
      };
      rows.push(await promisePost("promise-eval-null", "Runtime.evaluate", null));
      rows.push(await promisePost("promise-eval-number", "Runtime.evaluate", { expression: 123 }));
      rows.push(await promisePost("promise-properties-missing", "Runtime.getProperties", { objectId: "missing" }));
      promiseSession.disconnect();

      console.log(rows.join("\\n"));
    `);
  const result = await kernel.run("node", ["index.cjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "eval-omitted|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-null|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-empty|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-expression-null|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-expression-number|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-returnbyvalue-string|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-await-string|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-objectgroup-number|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "eval-empty-string|null|null|result",
    "properties-empty|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "properties-number|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "properties-missing|ERR_INSPECTOR_COMMAND|Inspector error -32000: Invalid remote object id|null",
    "release-empty|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "release-number|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "release-missing|ERR_INSPECTOR_COMMAND|Inspector error -32000: Invalid remote object id|null",
    "release-group-empty|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "release-group-number|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "release-group-valid|null|null|",
    "promise-eval-null|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "promise-eval-number|ERR_INSPECTOR_COMMAND|Inspector error -32602: Invalid parameters|null",
    "promise-properties-missing|ERR_INSPECTOR_COMMAND|Inspector error -32000: Invalid remote object id|null"
  ]);
});

test("node:wasi supports browser-safe memory-backed imports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/wasi-read.txt", "hello-wasi");
  const result = await kernel.run("node", [
    "-e",
    `
      const wasi = require("node:wasi");
      const readCString = (bytes, offset) => {
        let end = offset;
        while (bytes[end] !== 0) end += 1;
        return new TextDecoder().decode(bytes.subarray(offset, end));
      };
      const preRuntime = new wasi.WASI({ version: "preview1" });
      try {
        preRuntime.wasiImport.args_sizes_get(0, 4);
      } catch (error) {
        console.log("pre", error.name, error.code, error.message);
      }

      const memory = new WebAssembly.Memory({ initial: 1 });
      const view = new DataView(memory.buffer);
      const bytes = new Uint8Array(memory.buffer);
      const runtime = new wasi.WASI({
        version: "preview1",
        args: ["app", "--flag"],
        env: { A: "1", B: "two" },
        preopens: { "/guest": "/workspace" },
        stdout: 1,
        stderr: 2
      });
      runtime.finalizeBindings({ exports: { memory } });
      const imports = runtime.wasiImport;

      console.log("args sizes", imports.args_sizes_get(0, 4), view.getUint32(0, true), view.getUint32(4, true));
      console.log("args get", imports.args_get(16, 64), readCString(bytes, view.getUint32(16, true)), readCString(bytes, view.getUint32(20, true)));
      console.log("env sizes", imports.environ_sizes_get(96, 100), view.getUint32(96, true), view.getUint32(100, true));
      console.log("env get", imports.environ_get(112, 160), readCString(bytes, view.getUint32(112, true)), readCString(bytes, view.getUint32(116, true)));
      console.log("clock", imports.clock_time_get(0, 0n, 224), view.getBigUint64(224, true) > 0n, imports.clock_res_get(0, 232), view.getBigUint64(232, true) > 0n);
      view.setBigUint64(240, 123n, true);
      console.log("clock invalid", imports.clock_time_get(4, 0n, 240), imports.clock_time_get(0, 0, 240), view.getBigUint64(240, true).toString());
      bytes.fill(0, 256, 264);
      console.log("random", imports.random_get(256, 8), bytes.slice(256, 264).length, bytes.slice(256, 264).some((byte) => byte !== 0));
      bytes.fill(7, 272, 280);
      console.log("bounds", imports.random_get(65533, 4), Array.from(bytes.slice(272, 280)).join(","));
      console.log("yield", imports.sched_yield());

      process.stdin.write("wasi-input");
      bytes.fill(0, 400, 440);
      view.setUint32(336, 400, true);
      view.setUint32(340, 4, true);
      view.setUint32(344, 416, true);
      view.setUint32(348, 16, true);
      const readResult = imports.fd_read(0, 336, 2, 356);
      const readLength = view.getUint32(356, true);
      const readText = new TextDecoder().decode(bytes.subarray(400, 404)) + new TextDecoder().decode(bytes.subarray(416, 416 + readLength - 4));
      console.log("fd read", readResult, readLength, readText);
      console.log("fd read eof", imports.fd_read(0, 336, 1, 356), view.getUint32(356, true));
      bytes.fill(9, 400, 408);
      console.log("fd read pre", imports.fd_read(9, 336, 1, 356), Array.from(bytes.slice(400, 408)).join(","));
      console.log("fd read bounds", imports.fd_read(0, 65533, 1, 356), imports.fd_read(0, 336, 1, 65533));

      bytes.fill(0, 360, 380);
      const prestatResult = imports.fd_prestat_get(3, 360);
      const guestPathLength = view.getUint32(364, true);
      const nameResult = imports.fd_prestat_dir_name(3, 368, guestPathLength);
      console.log("preopen", prestatResult, view.getUint8(360), guestPathLength, nameResult, new TextDecoder().decode(bytes.subarray(368, 368 + guestPathLength)));
      console.log("preopen errors", imports.fd_prestat_get(2, 360), imports.fd_prestat_get(4, 360), imports.fd_prestat_dir_name(3, 368, guestPathLength - 1), imports.fd_prestat_dir_name(3, 65533, guestPathLength));

      const fdstat = (fd, ptr = 448) => {
        bytes.fill(255, ptr, ptr + 24);
        const result = imports.fd_fdstat_get(fd, ptr);
        return result + " " + Array.from(bytes.slice(ptr, ptr + 24)).join(",");
      };
      console.log("fdstat stdin", fdstat(0));
      console.log("fdstat stdout", fdstat(1));
      console.log("fdstat stderr", fdstat(2));
      console.log("fdstat preopen", fdstat(3));
      console.log("fdstat errors", imports.fd_fdstat_get(4, 448), imports.fd_fdstat_get(-1, 448), imports.fd_fdstat_get(0, 65520));

      const openPath = new TextEncoder().encode("wasi-read.txt");
      bytes.set(openPath, 600);
      const openResult = imports.path_open(3, 0, 600, openPath.byteLength, 0, 0n, 0n, 0, 620);
      const openedFd = view.getUint32(620, true);
      view.setUint32(624, 640, true);
      view.setUint32(628, 5, true);
      bytes.fill(0, 640, 660);
      const firstReadResult = imports.fd_read(openedFd, 624, 1, 636);
      const firstReadLength = view.getUint32(636, true);
      const firstReadText = new TextDecoder().decode(bytes.subarray(640, 640 + firstReadLength));
      view.setUint32(628, 16, true);
      bytes.fill(0, 640, 660);
      const secondReadResult = imports.fd_read(openedFd, 624, 1, 636);
      const secondReadLength = view.getUint32(636, true);
      const secondReadText = new TextDecoder().decode(bytes.subarray(640, 640 + secondReadLength));
      console.log("path open file", openResult, openedFd > 3);
      console.log("path read file", firstReadResult, firstReadLength, firstReadText, secondReadResult, secondReadLength, secondReadText);
      console.log("fdstat file", fdstat(openedFd, 672));
      console.log("fd close file", imports.fd_close(openedFd), imports.fd_read(openedFd, 624, 1, 636), imports.fd_close(openedFd));
      const missingPath = new TextEncoder().encode("missing.txt");
      bytes.set(missingPath, 704);
      const escapePath = new TextEncoder().encode("../secret.txt");
      bytes.set(escapePath, 724);
      console.log("path open errors",
        imports.path_open(3, 0, 704, missingPath.byteLength, 0, 0n, 0n, 0, 620),
        imports.path_open(3, 0, 724, escapePath.byteLength, 0, 0n, 0n, 0, 620),
        imports.path_open(0, 0, 704, missingPath.byteLength, 0, 0n, 0n, 0, 620),
        imports.path_open(3, 0, 65533, 4, 0, 0n, 0n, 0, 620),
        imports.path_open(3, 0, 704, missingPath.byteLength, 1, 0n, 0n, 0, 620)
      );

      const output = new TextEncoder().encode("wasi-out\\n");
      bytes.set(output, 320);
      view.setUint32(288, 320, true);
      view.setUint32(292, output.byteLength, true);
      console.log("fd pre", imports.fd_write(9, 288, 1, 296));
      const fdResult = imports.fd_write(1, 288, 1, 296);
      console.log("fd write", fdResult, view.getUint32(296, true));
      console.log("unsupported", imports.fd_prestat_get(4, 304), imports.sock_send(3, 0, 0, 0, 304));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "pre Error ERR_WASI_NOT_STARTED wasi.start() has not been called",
    "args sizes 0 2 11",
    "args get 0 app --flag",
    "env sizes 0 2 10",
    "env get 0 A=1 B=two",
    "clock 0 true 0 true",
    "clock invalid 28 28 123",
    "random 0 8 true",
    "bounds 61 7,7,7,7,7,7,7,7",
    "yield 0",
    "fd read 0 10 wasi-input",
    "fd read eof 0 0",
    "fd read pre 8 9,9,9,9,9,9,9,9",
    "fd read bounds 61 61",
    "preopen 0 0 6 0 /guest",
    "preopen errors 28 8 42 61",
    "fdstat stdin 0 4,255,0,0,255,255,255,255,255,1,224,8,0,0,0,0,0,0,0,0,0,0,0,0",
    "fdstat stdout 0 6,255,5,0,255,255,255,255,74,0,32,56,0,0,0,0,255,255,255,63,0,0,0,0",
    "fdstat stderr 0 6,255,5,0,255,255,255,255,74,0,32,56,0,0,0,0,255,255,255,63,0,0,0,0",
    "fdstat preopen 0 3,255,0,0,255,255,255,255,152,254,191,15,0,0,0,0,255,255,255,15,0,0,0,0",
    "fdstat errors 8 28 61",
    "path open file 0 true",
    "path read file 0 5 hello 0 5 -wasi",
    "fdstat file 0 4,255,0,0,255,255,255,255,38,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "fd close file 0 8 8",
    "path open errors 44 76 76 61 52",
    "fd pre 8",
    "wasi-out",
    "fd write 0 9",
    "unsupported 8 28"
  ]);
});

test("node:trace_events reports native-shaped category validation errors", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const traceEvents = require("node:trace_events");
      const rows = [
        ["missing-options", () => traceEvents.createTracing()],
        ["null-options", () => traceEvents.createTracing(null)],
        ["boolean-options", () => traceEvents.createTracing(true)],
        ["string-options", () => traceEvents.createTracing("node")],
        ["array-options", () => traceEvents.createTracing([])],
        ["function-options", () => traceEvents.createTracing(Object.assign(function traceOptions() {}, { categories: ["node"] }))],
        ["empty-options", () => traceEvents.createTracing({})],
        ["empty-categories", () => traceEvents.createTracing({ categories: [] })],
        ["string-categories", () => traceEvents.createTracing({ categories: "node" })],
        ["number-categories", () => traceEvents.createTracing({ categories: 1 })],
        ["boolean-category", () => traceEvents.createTracing({ categories: [true] })],
        ["null-category", () => traceEvents.createTracing({ categories: [null] })],
        ["object-category", () => traceEvents.createTracing({ categories: [{}] })],
        ["symbol-category", () => traceEvents.createTracing({ categories: [Symbol("x")] })]
      ].map(([label, action]) => {
        try {
          action();
          return label + ":ok";
        } catch (error) {
          return [label, error.name, error.code, error.message, String(error)].join("|");
        }
      });
      console.log(rows.join("\\n"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "missing-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be of type object. Received undefined|TypeError [ERR_INVALID_ARG_TYPE]: The \"options\" argument must be of type object. Received undefined",
    "null-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be of type object. Received null|TypeError [ERR_INVALID_ARG_TYPE]: The \"options\" argument must be of type object. Received null",
    "boolean-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be of type object. Received type boolean (true)|TypeError [ERR_INVALID_ARG_TYPE]: The \"options\" argument must be of type object. Received type boolean (true)",
    "string-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be of type object. Received type string ('node')|TypeError [ERR_INVALID_ARG_TYPE]: The \"options\" argument must be of type object. Received type string ('node')",
    "array-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be of type object. Received an instance of Array|TypeError [ERR_INVALID_ARG_TYPE]: The \"options\" argument must be of type object. Received an instance of Array",
    "function-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be of type object. Received function traceOptions|TypeError [ERR_INVALID_ARG_TYPE]: The \"options\" argument must be of type object. Received function traceOptions",
    "empty-options|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories\" property must be an instance of Array. Received undefined|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories\" property must be an instance of Array. Received undefined",
    "empty-categories|TypeError|ERR_TRACE_EVENTS_CATEGORY_REQUIRED|At least one category is required|TypeError [ERR_TRACE_EVENTS_CATEGORY_REQUIRED]: At least one category is required",
    "string-categories|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories\" property must be an instance of Array. Received type string ('node')|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories\" property must be an instance of Array. Received type string ('node')",
    "number-categories|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories\" property must be an instance of Array. Received type number (1)|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories\" property must be an instance of Array. Received type number (1)",
    "boolean-category|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories[0]\" property must be of type string. Received type boolean (true)|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories[0]\" property must be of type string. Received type boolean (true)",
    "null-category|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories[0]\" property must be of type string. Received null|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories[0]\" property must be of type string. Received null",
    "object-category|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories[0]\" property must be of type string. Received an instance of Object|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories[0]\" property must be of type string. Received an instance of Object",
    "symbol-category|TypeError|ERR_INVALID_ARG_TYPE|The \"options.categories[0]\" property must be of type string. Received type symbol (Symbol(x))|TypeError [ERR_INVALID_ARG_TYPE]: The \"options.categories[0]\" property must be of type string. Received type symbol (Symbol(x))"
  ]);
});

test("node:sqlite exposes stubbed package probe surface", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const sqlite = require("node:sqlite");
      console.log(Object.hasOwn(sqlite, "default"), Object.keys(sqlite).join(","));
      console.log(Object.keys(sqlite.constants).join(","));
      console.log(sqlite.constants.SQLITE_OK, sqlite.constants.SQLITE_DENY, sqlite.constants.SQLITE_CHANGESET_ABORT, sqlite.constants.SQLITE_RECURSIVE);
      const okDescriptor = Object.getOwnPropertyDescriptor(sqlite.constants, "SQLITE_OK");
      sqlite.constants.__probe = 1;
      console.log(Object.isExtensible(sqlite.constants), Object.isFrozen(sqlite.constants), Object.getPrototypeOf(sqlite.constants) === Object.prototype, sqlite.constants.__probe);
      console.log(okDescriptor.enumerable, okDescriptor.configurable, okDescriptor.writable, typeof okDescriptor.value);
      delete sqlite.constants.__probe;
      console.log("DatabaseSync", Object.keys(sqlite.DatabaseSync.prototype).join(","));
      console.log("Session", Object.keys(sqlite.Session.prototype).join(","));
      console.log("StatementSync", Object.keys(sqlite.StatementSync.prototype).join(","));
      console.log("DatabaseSync props", Object.getOwnPropertyNames(sqlite.DatabaseSync.prototype).join(","));
      console.log("Session props", Object.getOwnPropertyNames(sqlite.Session.prototype).join(","));
      console.log("StatementSync props", Object.getOwnPropertyNames(sqlite.StatementSync.prototype).join(","));
      console.log("DatabaseSync symbols", Object.getOwnPropertySymbols(sqlite.DatabaseSync.prototype).map(String).join(","));
      console.log("Session symbols", Object.getOwnPropertySymbols(sqlite.Session.prototype).map(String).join(","));
      console.log("StatementSync symbols", Object.getOwnPropertySymbols(sqlite.StatementSync.prototype).map(String).join(","));
      console.log("dispose metadata", [sqlite.DatabaseSync.prototype, sqlite.Session.prototype].map((prototype) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, Symbol.dispose);
        return [descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
      }).join("|"));
      console.log("metadata", sqlite.backup.name, sqlite.backup.length, sqlite.DatabaseSync.prototype.prepare.name, sqlite.DatabaseSync.prototype.exec.name, sqlite.StatementSync.prototype.run.name, sqlite.StatementSync.prototype.get.name, sqlite.Session.prototype.changeset.name, sqlite.Session.prototype.close.name);
      console.log("own prototypes", Object.hasOwn(sqlite.backup, "prototype"), Object.hasOwn(sqlite.DatabaseSync.prototype.prepare, "prototype"), Object.hasOwn(sqlite.DatabaseSync.prototype.exec, "prototype"), Object.hasOwn(sqlite.StatementSync.prototype.run, "prototype"), Object.hasOwn(sqlite.Session.prototype.changeset, "prototype"));
      console.log("constructor prototypes", ["DatabaseSync", "StatementSync", "Session"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(sqlite[name], "prototype");
        return [name, sqlite[name].name, sqlite[name].length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).at(-1)].join(":");
      }).join("|"));
      console.log("constructor calls", ["DatabaseSync", "StatementSync", "Session"].map((name) => {
        try {
          sqlite[name]();
          return name + ":ok";
        } catch (error) {
          return [name, error.constructor.name, error.name, error.code, error.message].join(":");
        }
      }).join("|"));
      console.log("constructor news", ["DatabaseSync", "StatementSync", "Session"].map((name) => {
        try {
          const value = new sqlite[name](":memory:");
          return [name, "ok", value instanceof sqlite[name]].join(":");
        } catch (error) {
          return [name, error.constructor.name, error.name, error.code, error.message].join(":");
        }
      }).join("|"));
      const database = new sqlite.DatabaseSync(":memory:");
      const databaseAccessorMetadata = ["isOpen", "isTransaction", "limits"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(database, name);
        return [name, descriptor.get.name, descriptor.get.length, typeof descriptor.set, descriptor.enumerable, descriptor.configurable, Object.hasOwn(descriptor.get, "prototype")].join(":");
      }).join("|");
      console.log("constructors", database instanceof sqlite.DatabaseSync);
      console.log("database instance", Object.keys(database).join(","), database.isOpen, database.isTransaction, typeof database.limits, Object.getPrototypeOf(database.limits) === Object.prototype);
      console.log("database limits", Object.keys(database.limits).join(","), database.limits.length, database.limits.variableNumber);
      console.log("database accessors", databaseAccessorMetadata);
      const tagStore = database.createTagStore();
      const tagStorePrototype = Object.getPrototypeOf(tagStore);
      console.log("tag store instance", tagStore.constructor.name, typeof sqlite.SQLTagStore, Object.keys(tagStore).join(","), Object.getOwnPropertyNames(tagStore).join(","), tagStore.capacity, tagStore.size, tagStore.db === database);
      console.log("tag store props", Object.getOwnPropertyNames(tagStorePrototype).join(","));
      console.log("tag store keys", Object.keys(tagStorePrototype).join(","));
      console.log("tag store metadata", ["get", "all", "iterate", "run", "clear", "constructor"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(tagStorePrototype, name);
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
      }).join("|"));
      console.log("tag store accessors", ["capacity", "db", "size"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(tagStore, name);
        return [name, descriptor.get.name, descriptor.get.length, typeof descriptor.set, descriptor.enumerable, descriptor.configurable].join(":");
      }).join("|"));
      console.log("location", database.location(), database.location("main"), database.location("temp"));
      console.log("apply empty", database.applyChangeset(new Uint8Array()), database.applyChangeset(Buffer.alloc(0)), database.applyChangeset(new Uint8Array(), {}));

      const formatErrorRow = (label, run) => {
        try {
          run();
          return label + "|ok";
        } catch (error) {
          return [label, error.constructor.name, error.name, error.code, error.message, String(error)].join("|");
        }
      };
      for (const [label, run] of [
        ["path-undefined", () => new sqlite.DatabaseSync()],
        ["path-null", () => new sqlite.DatabaseSync(null)],
        ["path-nul-buffer", () => new sqlite.DatabaseSync(new Uint8Array([0]))],
        ["path-https-url", () => new sqlite.DatabaseSync(new URL("https://example.com/x"))],
        ["options-undefined", () => new sqlite.DatabaseSync(":memory:", undefined)],
        ["options-null", () => new sqlite.DatabaseSync(":memory:", null)],
        ["options-open-string", () => new sqlite.DatabaseSync(":memory:", { open: "yes" })],
        ["options-readonly-string", () => new sqlite.DatabaseSync(":memory:", { readOnly: "yes" })],
        ["options-foreign-key-string", () => new sqlite.DatabaseSync(":memory:", { enableForeignKeyConstraints: "no" })],
        ["options-allow-string", () => new sqlite.DatabaseSync(":memory:", { allowExtension: "yes" })],
        ["prepare-missing", () => database.prepare()],
        ["exec-missing", () => database.exec()],
        ["location-number", () => database.location(1)],
        ["apply-missing", () => database.applyChangeset()],
        ["apply-object", () => database.applyChangeset({})],
        ["apply-arraybuffer", () => database.applyChangeset(new ArrayBuffer(0))],
        ["apply-options-number", () => database.applyChangeset(new Uint8Array(), 1)],
        ["apply-options-filter-undefined", () => database.applyChangeset(new Uint8Array(), { filter: undefined })],
        ["apply-options-filter", () => database.applyChangeset(new Uint8Array(), { filter: 1 })],
        ["apply-options-conflict", () => database.applyChangeset(new Uint8Array(), { onConflict: null })],
        ["tag-store-string", () => tagStore.get("select 1")],
        ["deserialize-missing", () => database.deserialize()],
        ["setAuthorizer-missing", () => database.setAuthorizer()],
        ["backup-missing", () => sqlite.backup()],
        ["backup-path-missing", () => sqlite.backup(database)],
        ["backup-path-url", () => sqlite.backup(database, new URL("https://example.com/x"))],
        ["backup-options-number", () => sqlite.backup(database, "backup.db", 1)],
        ["backup-options-rate", () => sqlite.backup(database, "backup.db", { rate: 1.5 })],
        ["backup-options-progress", () => sqlite.backup(database, "backup.db", { progress: null })]
      ]) {
        console.log("validation", formatErrorRow(label, run));
      }

      const stateDatabase = new sqlite.DatabaseSync(":memory:", { open: false });
      console.log("state initial", stateDatabase.isOpen, stateDatabase.isTransaction);
      console.log("state limits", formatErrorRow("limits", () => stateDatabase.limits));
      stateDatabase.open();
      console.log("state opened", stateDatabase.isOpen);
      console.log("state open again", formatErrorRow("open", () => stateDatabase.open()));
      const stateTagStore = stateDatabase.createTagStore();
      stateDatabase.close();
      console.log("state closed", stateDatabase.isOpen);
      console.log("state tag closed", formatErrorRow("tag", () => stateTagStore.get\`select 1\`), formatErrorRow("clear", () => stateTagStore.clear()));
      console.log("state close again", formatErrorRow("close", () => stateDatabase.close()));
      stateDatabase[Symbol.dispose]();
      console.log("state disposed closed", stateDatabase.isOpen);
      database[Symbol.dispose]();
      console.log("database disposed", database.isOpen);

      const backupPromise = sqlite.backup(new sqlite.DatabaseSync(":memory:"), "backup.db");
      console.log("backup promise", backupPromise.constructor.name, typeof backupPromise.then);
      backupPromise.catch((error) => {
        console.log("backup", error.code, error.message);
      });

      for (const [label, run] of [
        ["DatabaseSync.prepare", () => new sqlite.DatabaseSync(":memory:").prepare("select 1")],
        ["DatabaseSync.exec", () => new sqlite.DatabaseSync(":memory:").exec("select 1")],
        ["DatabaseSync.applyChangeset", () => new sqlite.DatabaseSync(":memory:").applyChangeset(new Uint8Array([1]))],
        ["SQLTagStore.get", () => new sqlite.DatabaseSync(":memory:").createTagStore().get\`select 1\`],
        ["SQLTagStore.run", () => new sqlite.DatabaseSync(":memory:").createTagStore().run\`select 1\`],
        ["Session.changeset", () => sqlite.Session.prototype.changeset.call({})],
        ["StatementSync.run", () => sqlite.StatementSync.prototype.run.call({})],
        ["Session.dispose", () => sqlite.Session.prototype[Symbol.dispose].call({})],
      ]) {
        try {
          run();
        } catch (error) {
          console.log(label, error.code, error.message);
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "false DatabaseSync,StatementSync,Session,constants,backup",
    "SQLITE_CHANGESET_OMIT,SQLITE_CHANGESET_REPLACE,SQLITE_CHANGESET_ABORT,SQLITE_CHANGESET_DATA,SQLITE_CHANGESET_NOTFOUND,SQLITE_CHANGESET_CONFLICT,SQLITE_CHANGESET_CONSTRAINT,SQLITE_CHANGESET_FOREIGN_KEY,SQLITE_OK,SQLITE_DENY,SQLITE_IGNORE,SQLITE_CREATE_INDEX,SQLITE_CREATE_TABLE,SQLITE_CREATE_TEMP_INDEX,SQLITE_CREATE_TEMP_TABLE,SQLITE_CREATE_TEMP_TRIGGER,SQLITE_CREATE_TEMP_VIEW,SQLITE_CREATE_TRIGGER,SQLITE_CREATE_VIEW,SQLITE_DELETE,SQLITE_DROP_INDEX,SQLITE_DROP_TABLE,SQLITE_DROP_TEMP_INDEX,SQLITE_DROP_TEMP_TABLE,SQLITE_DROP_TEMP_TRIGGER,SQLITE_DROP_TEMP_VIEW,SQLITE_DROP_TRIGGER,SQLITE_DROP_VIEW,SQLITE_INSERT,SQLITE_PRAGMA,SQLITE_READ,SQLITE_SELECT,SQLITE_TRANSACTION,SQLITE_UPDATE,SQLITE_ATTACH,SQLITE_DETACH,SQLITE_ALTER_TABLE,SQLITE_REINDEX,SQLITE_ANALYZE,SQLITE_CREATE_VTABLE,SQLITE_DROP_VTABLE,SQLITE_FUNCTION,SQLITE_SAVEPOINT,SQLITE_COPY,SQLITE_RECURSIVE",
    "0 1 2 33",
    "true false true 1",
    "true false false number",
    "DatabaseSync open,close,prepare,exec,function,createTagStore,location,aggregate,createSession,applyChangeset,enableLoadExtension,enableDefensive,loadExtension,serialize,deserialize,setAuthorizer",
    "Session changeset,patchset,close",
    "StatementSync iterate,all,get,run,columns,setAllowBareNamedParameters,setAllowUnknownNamedParameters,setReadBigInts,setReturnArrays",
    "DatabaseSync props open,close,prepare,exec,function,createTagStore,location,aggregate,createSession,applyChangeset,enableLoadExtension,enableDefensive,loadExtension,serialize,deserialize,setAuthorizer,constructor",
    "Session props changeset,patchset,close,constructor",
    "StatementSync props iterate,all,get,run,columns,setAllowBareNamedParameters,setAllowUnknownNamedParameters,setReadBigInts,setReturnArrays,constructor",
    "DatabaseSync symbols Symbol(Symbol.dispose)",
    "Session symbols Symbol(Symbol.dispose)",
    "StatementSync symbols ",
    "dispose metadata :0:true:true:true|:0:true:true:true",
    "metadata backup 2 prepare exec run get changeset close",
    "own prototypes true false false false false",
    "constructor prototypes DatabaseSync:DatabaseSync:0:false:false:true:constructor|StatementSync:StatementSync:0:false:false:true:constructor|Session:Session:0:false:false:true:constructor",
    "constructor calls DatabaseSync:TypeError:TypeError:ERR_CONSTRUCT_CALL_REQUIRED:Cannot call constructor without `new`|StatementSync:Error:Error:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor|Session:Error:Error:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor",
    "constructor news DatabaseSync:ok:true|StatementSync:Error:Error:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor|Session:Error:Error:ERR_ILLEGAL_CONSTRUCTOR:Illegal constructor",
    "constructors true",
    "database instance isOpen,isTransaction,limits true false object true",
    "database limits length,sqlLength,column,exprDepth,compoundSelect,vdbeOp,functionArg,attach,likePatternLength,variableNumber,triggerDepth 1000000000 32766",
    "database accessors isOpen::0:undefined:true:false:false|isTransaction::0:undefined:true:false:false|limits::0:undefined:true:false:false",
    "tag store instance SQLTagStore undefined capacity,db,size capacity,db,size 1000 0 true",
    "tag store props get,all,iterate,run,clear,constructor",
    "tag store keys get,all,iterate,run,clear",
    "tag store metadata get:get:0:true:true:true:false|all:all:0:true:true:true:false|iterate:iterate:0:true:true:true:false|run:run:0:true:true:true:false|clear:clear:0:true:true:true:false|constructor:SQLTagStore:0:false:true:true:true",
    "tag store accessors capacity::0:undefined:true:false|db::0:undefined:true:false|size::0:undefined:true:false",
    "location null null null",
    "apply empty true true true",
    "validation path-undefined|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"path\" argument must be a string, Uint8Array, or URL without null bytes.|TypeError: The \"path\" argument must be a string, Uint8Array, or URL without null bytes.",
    "validation path-null|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"path\" argument must be a string, Uint8Array, or URL without null bytes.|TypeError: The \"path\" argument must be a string, Uint8Array, or URL without null bytes.",
    "validation path-nul-buffer|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"path\" argument must be a string, Uint8Array, or URL without null bytes.|TypeError: The \"path\" argument must be a string, Uint8Array, or URL without null bytes.",
    "validation path-https-url|TypeError|TypeError|ERR_INVALID_URL_SCHEME|The URL must be of scheme file:|TypeError: The URL must be of scheme file:",
    "validation options-undefined|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be an object.|TypeError: The \"options\" argument must be an object.",
    "validation options-null|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be an object.|TypeError: The \"options\" argument must be an object.",
    "validation options-open-string|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.open\" argument must be a boolean.|TypeError: The \"options.open\" argument must be a boolean.",
    "validation options-readonly-string|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.readOnly\" argument must be a boolean.|TypeError: The \"options.readOnly\" argument must be a boolean.",
    "validation options-foreign-key-string|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.enableForeignKeyConstraints\" argument must be a boolean.|TypeError: The \"options.enableForeignKeyConstraints\" argument must be a boolean.",
    "validation options-allow-string|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.allowExtension\" argument must be a boolean.|TypeError: The \"options.allowExtension\" argument must be a boolean.",
    "validation prepare-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"sql\" argument must be a string.|TypeError: The \"sql\" argument must be a string.",
    "validation exec-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"sql\" argument must be a string.|TypeError: The \"sql\" argument must be a string.",
    "validation location-number|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"dbName\" argument must be a string.|TypeError: The \"dbName\" argument must be a string.",
    "validation apply-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"changeset\" argument must be a Uint8Array.|TypeError: The \"changeset\" argument must be a Uint8Array.",
    "validation apply-object|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"changeset\" argument must be a Uint8Array.|TypeError: The \"changeset\" argument must be a Uint8Array.",
    "validation apply-arraybuffer|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"changeset\" argument must be a Uint8Array.|TypeError: The \"changeset\" argument must be a Uint8Array.",
    "validation apply-options-number|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be an object.|TypeError: The \"options\" argument must be an object.",
    "validation apply-options-filter-undefined|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.filter\" argument must be a function.|TypeError: The \"options.filter\" argument must be a function.",
    "validation apply-options-filter|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.filter\" argument must be a function.|TypeError: The \"options.filter\" argument must be a function.",
    "validation apply-options-conflict|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.onConflict\" argument must be a function.|TypeError: The \"options.onConflict\" argument must be a function.",
    "validation tag-store-string|TypeError|TypeError|ERR_INVALID_ARG_TYPE|First argument must be an array of strings (template literal).|TypeError: First argument must be an array of strings (template literal).",
    "validation deserialize-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"buffer\" argument must be a Uint8Array.|TypeError: The \"buffer\" argument must be a Uint8Array.",
    "validation setAuthorizer-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"callback\" argument must be a function or null.|TypeError: The \"callback\" argument must be a function or null.",
    "validation backup-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"sourceDb\" argument must be an object.|TypeError: The \"sourceDb\" argument must be an object.",
    "validation backup-path-missing|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"path\" argument must be a string, Uint8Array, or URL without null bytes.|TypeError: The \"path\" argument must be a string, Uint8Array, or URL without null bytes.",
    "validation backup-path-url|TypeError|TypeError|ERR_INVALID_URL_SCHEME|The URL must be of scheme file:|TypeError: The URL must be of scheme file:",
    "validation backup-options-number|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options\" argument must be an object.|TypeError: The \"options\" argument must be an object.",
    "validation backup-options-rate|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.rate\" argument must be an integer.|TypeError: The \"options.rate\" argument must be an integer.",
    "validation backup-options-progress|TypeError|TypeError|ERR_INVALID_ARG_TYPE|The \"options.progress\" argument must be a function.|TypeError: The \"options.progress\" argument must be a function.",
    "state initial false false",
    "state limits limits|Error|Error|ERR_INVALID_STATE|database is not open|Error: database is not open",
    "state opened true",
    "state open again open|Error|Error|ERR_INVALID_STATE|database is already open|Error: database is already open",
    "state closed false",
    "state tag closed tag|Error|Error|ERR_INVALID_STATE|database is not open|Error: database is not open clear|ok",
    "state close again close|Error|Error|ERR_INVALID_STATE|database is not open|Error: database is not open",
    "state disposed closed false",
    "database disposed false",
    "backup promise Promise function",
    "DatabaseSync.prepare ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite DatabaseSync.prepare is not supported in OpenContainers V1",
    "DatabaseSync.exec ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite DatabaseSync.exec is not supported in OpenContainers V1",
    "DatabaseSync.applyChangeset ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite DatabaseSync.applyChangeset is not supported in OpenContainers V1",
    "SQLTagStore.get ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite SQLTagStore.get is not supported in OpenContainers V1",
    "SQLTagStore.run ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite SQLTagStore.run is not supported in OpenContainers V1",
    "Session.changeset ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite Session.changeset is not supported in OpenContainers V1",
    "StatementSync.run ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite StatementSync.run is not supported in OpenContainers V1",
    "Session.dispose ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite Session.Symbol(Symbol.dispose) is not supported in OpenContainers V1",
    "backup ERR_OPENCONTAINERS_SQLITE_UNSUPPORTED node:sqlite backup is not supported in OpenContainers V1"
  ]);
});

test("node:repl evaluates simple input and built-in dot commands", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const repl = require("node:repl");
      const input = new EventEmitter();
      const output = [];
      const server = repl.start({
        prompt: "oc> ",
        input,
        output: { write: chunk => output.push(String(chunk)) },
        terminal: false
      });
      input.emit("data", "1 + 2\\n");
      input.emit("data", ".help\\n");
      input.emit("data", ".exit\\n");
      const joined = output.join("");
      console.log(joined.includes("3\\noc> .break"));
      console.log(joined.includes(".exit\\tExit the REPL"));
      console.log(server.closed);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "true"
  ]);
});

test("node:repl buffers recoverable multiline input", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const repl = require("node:repl");
      const keepAlive = setInterval(() => {}, 1000);

      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
      const makeSession = (options = {}) => {
        const input = new EventEmitter();
        const output = [];
        const server = repl.start({
          prompt: "oc> ",
          input,
          output: { write: chunk => output.push(String(chunk)) },
          terminal: false,
          ...options
        });
        return { input, output, server };
      };
      const feed = async (session, lines) => {
        for (const line of lines) {
          session.input.emit("data", line + "\\n");
          await tick();
        }
      };

      (async () => {
        const functionSession = makeSession();
        await feed(functionSession, ["function f() {", "return 3;", "}", "f()"]);
        console.log("function", JSON.stringify(functionSession.output.join("")));
        functionSession.server.close();

        const objectSession = makeSession();
        await feed(objectSession, ["({", "a: 1", "})"]);
        console.log("object", JSON.stringify(objectSession.output.join("")));
        objectSession.server.close();

        const plusSession = makeSession();
        await feed(plusSession, ["1 +", "2"]);
        console.log("plus", JSON.stringify(plusSession.output.join("")));
        plusSession.server.close();

        const recoverableLog = [];
        const recoverableSession = makeSession({
          eval(code, context, filename, callback) {
            recoverableLog.push(JSON.stringify(code));
            if (recoverableLog.length === 1) {
              callback(new repl.Recoverable(new SyntaxError("more input")));
              return;
            }
            callback(null, code.replace(/\\n/g, "|"));
          }
        });
        await feed(recoverableSession, ["first", "second"]);
        console.log("recoverable", JSON.stringify(recoverableSession.output.join("")), JSON.stringify(recoverableLog));
        recoverableSession.server.close();
        clearInterval(keepAlive);
      })().catch((error) => {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
        clearInterval(keepAlive);
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'function "oc> | | undefined\\noc> 3\\noc> "',
    'object "oc> | | { a: 1 }\\noc> "',
    'plus "oc> | 3\\noc> "',
    'recoverable "oc> | \'first|second|\'\\noc> " ["\\"first\\\\n\\"","\\"first\\\\nsecond\\\\n\\""]'
  ]);
});

test("node:repl dot commands clear buffered multiline input", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const repl = require("node:repl");
      const keepAlive = setInterval(() => {}, 1000);

      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
      const run = async (lines) => {
        const input = new EventEmitter();
        const output = [];
        const server = repl.start({
          prompt: "oc> ",
          input,
          output: { write: chunk => output.push(String(chunk)) },
          terminal: false
        });
        for (const line of lines) {
          input.emit("data", line + "\\n");
          await tick();
        }
        server.close();
        return output.join("");
      };

      (async () => {
        console.log("break", JSON.stringify(await run(["function h() {", ".break", "1 + 1"])));
        console.log("clear", JSON.stringify(await run(["function h() {", ".clear", "1 + 1"])));
        clearInterval(keepAlive);
      })().catch((error) => {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
        clearInterval(keepAlive);
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'break "oc> | oc> 2\\noc> "',
    'clear "oc> | Clearing context...\\noc> 2\\noc> "'
  ]);
});

test("node:repl supports legacy positional arguments and option state", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const repl = require("node:repl");

      function makeStream() {
        const stream = new EventEmitter();
        stream.output = "";
        stream.write = (chunk) => {
          stream.output += String(chunk);
          return true;
        };
        stream.resume = () => {};
        stream.pause = () => {};
        stream.setRawMode = () => {};
        stream.isTTY = false;
        return stream;
      }

      const evalFn = (code, context, filename, callback) => callback(null, undefined);
      const positionalStream = makeStream();
      const positional = repl.start("p> ", positionalStream, evalFn, false, true, repl.REPL_MODE_STRICT);
      console.log("positional", JSON.stringify([
        positional._prompt,
        positional._initialPrompt,
        positional.input === positionalStream,
        positional.output === positionalStream,
        positional.ignoreUndefined,
        positional.useGlobal,
        positional.replMode === repl.REPL_MODE_STRICT,
        positional.breakEvalOnSigint,
        positional.context === globalThis,
        typeof positional.eval,
        positional.terminal,
        positionalStream.output
      ]));
      positional.close();

      const constructorStream = makeStream();
      const constructed = new repl.REPLServer("c> ", constructorStream, evalFn, false, true, repl.REPL_MODE_STRICT);
      console.log("constructed", JSON.stringify([
        constructed._prompt,
        constructed._initialPrompt,
        constructed.input === constructorStream,
        constructed.output === constructorStream,
        constructed.ignoreUndefined,
        constructed.useGlobal,
        constructed.replMode === repl.REPL_MODE_STRICT,
        constructed.breakEvalOnSigint,
        constructed.context === globalThis,
        constructorStream.output
      ]));
      constructed.close();

      const optionsInput = makeStream();
      const optionsOutput = makeStream();
      const optionServer = repl.start({
        prompt: "o> ",
        input: optionsInput,
        output: optionsOutput,
        terminal: false,
        useGlobal: true,
        ignoreUndefined: true,
        replMode: repl.REPL_MODE_STRICT,
        breakEvalOnSigint: true
      });
      console.log("options", JSON.stringify([
        optionServer._prompt,
        optionServer._initialPrompt,
        optionServer.input === optionsInput,
        optionServer.output === optionsOutput,
        optionServer.ignoreUndefined,
        optionServer.useGlobal,
        optionServer.replMode === repl.REPL_MODE_STRICT,
        optionServer.breakEvalOnSigint,
        optionServer.context === globalThis,
        optionServer.terminal,
        optionsOutput.output
      ]));
      optionServer.close();

      const defaultInput = makeStream();
      const defaultOutput = makeStream();
      const defaultServer = repl.start({ input: defaultInput, output: defaultOutput, terminal: false });
      console.log("defaults", JSON.stringify([
        defaultServer.replMode === repl.REPL_MODE_SLOPPY,
        defaultServer.replMode === repl.REPL_MODE_STRICT,
        defaultServer.breakEvalOnSigint,
        defaultServer.useGlobal,
        defaultServer.ignoreUndefined,
        Object.hasOwn(defaultServer, "replMode"),
        Object.hasOwn(defaultServer, "breakEvalOnSigint"),
        defaultOutput.output
      ]));
      defaultServer.close();

      try {
        repl.start({ input: makeStream(), output: makeStream(), breakEvalOnSigint: true, eval: evalFn });
      } catch (error) {
        console.log("eval config", error.constructor.name, error.code, error.message);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'positional ["p> ","p> ",true,true,true,false,true,false,false,"function",false,"p> "]',
    'constructed ["c> ","c> ",true,true,true,false,true,false,false,"c> "]',
    'options ["o> ","o> ",true,true,true,true,true,true,true,false,"o> "]',
    'defaults [true,false,false,false,false,true,true,"> "]',
    'eval config TypeError ERR_INVALID_REPL_EVAL_CONFIG Cannot specify both "breakEvalOnSigint" and "eval" for REPL'
  ]);
});

test("node:repl exposes prompt, context, and completion helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const repl = require("node:repl");
      const input = new EventEmitter();
      const output = [];
      const server = repl.start({
        prompt: "n> ",
        input,
        output: { write: chunk => output.push(String(chunk)) },
        terminal: false,
        context: { alpha: 1 }
      });

      console.log(typeof server.prompt, typeof server.setPrompt, typeof server.displayPrompt);
      console.log(JSON.stringify([server._prompt, server._initialPrompt]));
      console.log(String(server.setPrompt("x> ")), String(server.displayPrompt()), String(server.prompt()));
      console.log(JSON.stringify(server._prompt));
      const created = server.createContext();
      console.log(typeof server.createContext, typeof server.resetContext, created === server.context);
      const reset = server.resetContext();
      console.log(reset === server.context, typeof reset);
      server.context.alpha = 1;
      server.complete("al", (error, completion) => {
        console.log(error, JSON.stringify(completion));
      });
      console.log(typeof server.complete, typeof server.completeOnEditorMode, JSON.stringify(server.completeOnEditorMode(".he")));
      server.close();
      console.log(JSON.stringify(output.join("")));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function function function",
    '["n> ","n> "]',
    "undefined undefined undefined",
    '"x> "',
    "function function false",
    "true object",
    'null [["alpha"],"al"]',
    'function function [[".help"],".he"]',
    '"n> x> x> "'
  ]);
});

test("node:repl records history only for terminal sessions", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const repl = require("node:repl");

      const sessions = [false, true].map((terminal) => {
        const input = new EventEmitter();
        const output = [];
        const server = repl.start({
          prompt: "h> ",
          input,
          output: { write: chunk => output.push(String(chunk)) },
          terminal,
          useColors: false
        });
        input.emit("data", "1 + 2\\n");
        return { terminal, output, server };
      });
      setTimeout(() => {
        for (const { terminal, output, server } of sessions) {
          console.log(terminal, JSON.stringify(server.history), JSON.stringify(server.line), output.join("").includes("3\\nh> "));
          server.close();
        }
      }, 0);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'false [] "" true',
    'true ["1 + 2"] "" true'
  ]);
});

test("runtime Buffer global can be shadowed by CommonJS modules", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/buffer-shadow.js", `
    const { Buffer } = require('node:buffer');
    module.exports = Buffer.from('ok').toString();
  `);

  const result = await kernel.run("node", ["-e", "console.log(require('./buffer-shadow'))"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ok\n");
});

test("runtime Buffer supports base64 string encoding", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const buffer = Buffer.from('Hello REPL');
      console.log(buffer.toString());
      console.log(buffer.toString('base64'));
      console.log(require('node:buffer').Buffer.from('Hello REPL').toString('base64'));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "Hello REPL",
    "SGVsbG8gUkVQTA==",
    "SGVsbG8gUkVQTA=="
  ]);
});

test("node:buffer exposes package compatibility exports", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const buffer = require('node:buffer');
      const expectedKeys = 'Buffer,transcode,isUtf8,isAscii,kMaxLength,kStringMaxLength,btoa,atob,constants,INSPECT_MAX_BYTES,Blob,resolveObjectURL,File';
      const descriptorRows = ['constants', 'INSPECT_MAX_BYTES', 'kMaxLength', 'kStringMaxLength', 'SlowBuffer', 'OpenContainersBuffer'].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(buffer, key);
        if (!descriptor) return key + ':missing';
        return [
          key,
          descriptor.enumerable,
          descriptor.configurable,
          'writable' in descriptor ? descriptor.writable : '',
          descriptor.get?.name ?? '',
          descriptor.set?.name ?? '',
          typeof descriptor.value
        ].join(':');
      });
      const constantRows = ['MAX_LENGTH', 'MAX_STRING_LENGTH'].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(buffer.constants, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value].join(':');
      });
      const originalInspectMaxBytes = buffer.INSPECT_MAX_BYTES;
      buffer.INSPECT_MAX_BYTES = 123;
      const encoded = buffer.btoa('Hello REPL');
      console.log(buffer.atob(encoded));
      console.log(Object.hasOwn(buffer, "default"), Object.keys(buffer).includes("default"));
      console.log(Object.keys(buffer).join(","));
      console.log(buffer.constants.MAX_LENGTH, buffer.kMaxLength, buffer.constants.MAX_STRING_LENGTH, buffer.kStringMaxLength);
      console.log(buffer.INSPECT_MAX_BYTES, buffer.kMaxLength > 0, buffer.kStringMaxLength > 0);
      console.log(descriptorRows.join("|"));
      console.log(constantRows.join("|"));
      console.log(Object.getPrototypeOf(buffer.constants) === Object.prototype, Object.isFrozen(buffer.constants), Object.isExtensible(buffer.constants));
      console.log(typeof buffer.Blob, typeof buffer.File, typeof buffer.SlowBuffer, typeof buffer.OpenContainersBuffer);
      console.log(buffer.isAscii(Buffer.from('abc')), buffer.isUtf8(Buffer.from('abc')));
      console.log(buffer.isAscii(Buffer.from([0xff])), buffer.isUtf8(Buffer.from([0xc3, 0x28])), buffer.isUtf8(Buffer.from([0xc3, 0xa9])));
      const objectUrl = URL.createObjectURL(new buffer.Blob(['blob text'], { type: 'text/plain' }));
      const resolvedBlob = buffer.resolveObjectURL(objectUrl);
      console.log(resolvedBlob instanceof buffer.Blob, resolvedBlob.size, resolvedBlob.type);
      URL.revokeObjectURL(objectUrl);
      console.log(buffer.resolveObjectURL(objectUrl), buffer.resolveObjectURL(new URL('blob:opencontainers:test')));
      try {
        buffer.isUtf8('abc');
      } catch (error) {
        console.log(error.code);
      }
      try {
        buffer.isAscii(new DataView(new ArrayBuffer(1)));
      } catch (error) {
        console.log(error.code);
      }
      buffer.INSPECT_MAX_BYTES = originalInspectMaxBytes;
      if (Object.keys(buffer).join(",") !== expectedKeys) throw new Error("buffer export order failed");
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "Hello REPL",
    "false false",
    "Buffer,transcode,isUtf8,isAscii,kMaxLength,kStringMaxLength,btoa,atob,constants,INSPECT_MAX_BYTES,Blob,resolveObjectURL,File",
    "9007199254740991 9007199254740991 536870888 536870888",
    "123 true true",
    "constants:true:false:false:::object|INSPECT_MAX_BYTES:true:true::get:set:undefined|kMaxLength:true:true:true:::number|kStringMaxLength:true:true:true:::number|SlowBuffer:missing|OpenContainersBuffer:missing",
    "MAX_LENGTH:true:false:false:9007199254740991|MAX_STRING_LENGTH:true:false:false:536870888",
    "true false true",
    "function function undefined undefined",
    "true true",
    "false false true",
    "true 9 text/plain",
    "undefined undefined",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE"
  ]);
});

test("node:string_decoder handles chunked encodings like Node", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { StringDecoder } = require("node:string_decoder");
      console.log(StringDecoder.name, StringDecoder.length);
      const methodRow = (name) => {
        const descriptor = Object.getOwnPropertyDescriptor(StringDecoder.prototype, name);
        const prototype = Object.getOwnPropertyDescriptor(descriptor.value, "prototype");
        return [
          name,
          descriptor.value.name,
          descriptor.value.length,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          Object.hasOwn(descriptor.value, "prototype"),
          prototype?.writable,
          prototype?.enumerable,
          prototype?.configurable,
          Object.getOwnPropertyNames(prototype?.value ?? {}).join(","),
          prototype?.value?.constructor === descriptor.value
        ].join(":");
      };
      const accessorRow = (name) => {
        const descriptor = Object.getOwnPropertyDescriptor(StringDecoder.prototype, name);
        return [
          name,
          descriptor.get.name,
          descriptor.get.length,
          typeof descriptor.set,
          descriptor.enumerable,
          descriptor.configurable,
          Object.hasOwn(descriptor.get, "prototype")
        ].join(":");
      };
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(StringDecoder, "prototype");
      const shapeDecoder = new StringDecoder("utf8");
      const nativeSymbol = Object.getOwnPropertySymbols(shapeDecoder)[0];
      const nativeSymbolDescriptor = Object.getOwnPropertyDescriptor(shapeDecoder, nativeSymbol);
      console.log(Object.getOwnPropertyNames(StringDecoder).join(","));
      console.log([prototypeDescriptor.writable, prototypeDescriptor.enumerable, prototypeDescriptor.configurable].join(":"));
      console.log(Object.getOwnPropertyNames(StringDecoder.prototype).join(","));
      console.log(Object.keys(StringDecoder.prototype).join(","));
      console.log(["write", "end", "text"].map(methodRow).join("|"));
      console.log(["lastChar", "lastNeed", "lastTotal"].map(accessorRow).join("|"));
      console.log([
        "instance-shape",
        Object.keys(shapeDecoder).join(","),
        Object.getOwnPropertyNames(shapeDecoder).join(","),
        Reflect.ownKeys(shapeDecoder).map(String).join(","),
        nativeSymbolDescriptor.enumerable,
        nativeSymbolDescriptor.configurable,
        nativeSymbolDescriptor.writable,
        shapeDecoder[nativeSymbol].toString("hex"),
        JSON.stringify(shapeDecoder.lastChar),
        shapeDecoder.lastNeed,
        shapeDecoder.lastTotal
      ].join(" "));

      const utf8 = new StringDecoder("utf8");
      const euro = Buffer.from("€");
      console.log(JSON.stringify([
        utf8.write(euro.subarray(0, 1)),
        utf8.write(euro.subarray(1, 2)),
        utf8.end(euro.subarray(2))
      ]));

      const base64 = new StringDecoder("base64");
      console.log(JSON.stringify([
        base64.write(Buffer.from([0x61])),
        base64.write(Buffer.from([0x62])),
        base64.end(Buffer.from([0x63]))
      ]));

      const base64url = new StringDecoder("base64url");
      console.log(JSON.stringify([
        base64url.write(Buffer.from([0xff])),
        base64url.write(Buffer.from([0xee])),
        base64url.end(Buffer.from([0xdd]))
      ]));
      const stateUtf8 = new StringDecoder("utf8");
      const stateUtf8Symbol = Object.getOwnPropertySymbols(stateUtf8)[0];
      console.log(JSON.stringify([
        stateUtf8.write(Buffer.from([0xe2])),
        stateUtf8[stateUtf8Symbol].toString("hex"),
        stateUtf8.lastNeed,
        stateUtf8.lastTotal,
        stateUtf8.write(Buffer.from([0x82])),
        stateUtf8[stateUtf8Symbol].toString("hex"),
        stateUtf8.end(Buffer.from([0xac])),
        stateUtf8[stateUtf8Symbol].toString("hex")
      ]));
      const incompleteUtf8 = new StringDecoder("utf8");
      const incompleteUtf8Symbol = Object.getOwnPropertySymbols(incompleteUtf8)[0];
      console.log(JSON.stringify([
        incompleteUtf8.write(Buffer.from([0xe2])),
        incompleteUtf8.end(),
        incompleteUtf8[incompleteUtf8Symbol].toString("hex"),
        incompleteUtf8.lastNeed,
        incompleteUtf8.lastTotal
      ]));
      const stateBase64 = new StringDecoder("base64");
      const stateBase64Symbol = Object.getOwnPropertySymbols(stateBase64)[0];
      console.log(JSON.stringify([
        stateBase64.write(Buffer.from([0x61])),
        stateBase64[stateBase64Symbol].toString("hex"),
        stateBase64.lastNeed,
        stateBase64.lastTotal,
        stateBase64.write(Buffer.from([0x62])),
        stateBase64[stateBase64Symbol].toString("hex"),
        stateBase64.end(Buffer.from([0x63])),
        stateBase64[stateBase64Symbol].toString("hex")
      ]));
      console.log(JSON.stringify([
        new StringDecoder("utf8").text(Buffer.from("abc"), 0),
        new StringDecoder("utf8").text(Buffer.from("abc"), 1),
        new StringDecoder("utf8").text(Buffer.from("abc"), 3),
        new StringDecoder("utf8").text(Buffer.from("abc"), -1)
      ]));

      const ascii = new StringDecoder("ascii").write(Buffer.from([0xff, 0x41]));
      console.log(ascii.charCodeAt(0), ascii[1]);

      console.log(new StringDecoder("utf8").write("plain"));
      const viewBuffer = Buffer.from("view");
      console.log(new StringDecoder("utf8").end(new DataView(viewBuffer.buffer, viewBuffer.byteOffset, viewBuffer.byteLength)));

      for (const [label, action] of [
        ["write-undefined", () => new StringDecoder("utf8").write()],
        ["write-null", () => new StringDecoder("utf8").write(null)],
        ["write-array", () => new StringDecoder("utf8").write([97])],
        ["write-arraybuffer", () => new StringDecoder("utf8").write(new ArrayBuffer(1))],
        ["end-null", () => new StringDecoder("utf8").end(null)],
        ["end-object", () => new StringDecoder("utf8").end({ 0: 97, length: 1 })]
      ]) {
        try {
          action();
          console.log(label, "ok");
        } catch (error) {
          console.log(label, error.name, error.code, error.message.includes('"buf"'));
        }
      }

      console.log(new StringDecoder("utf8").end());

      try {
        new StringDecoder("not-real");
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "StringDecoder 1",
    "length,name,prototype",
    "true:false:false",
    "constructor,write,end,text,lastChar,lastNeed,lastTotal",
    "write,end,text,lastChar,lastNeed,lastTotal",
    "write:write:1:true:true:true:true:true:false:false:constructor:true|end:end:1:true:true:true:true:true:false:false:constructor:true|text:text:2:true:true:true:true:true:false:false:constructor:true",
    "lastChar:get:0:undefined:true:true:false|lastNeed:get:0:undefined:true:true:false|lastTotal:get:0:undefined:true:true:false",
    'instance-shape encoding encoding encoding,Symbol(kNativeDecoder) true true true 00000000000001 {"type":"Buffer","data":[0,0,0,0]} 0 0',
    '["","","€"]',
    '["","","YWJj"]',
    '["","","_-7d"]',
    '["","e2000000020301",2,3,"","e2820000010301","€","e282ac00000001"]',
    '["","�","e2000000000001",0,0]',
    '["","61000000020302",2,3,"","61620000010302","YWJj","61626300000002"]',
    '["abc","bc","","c"]',
    "127 A",
    "plain",
    "view",
    "write-undefined TypeError ERR_INVALID_ARG_TYPE true",
    "write-null TypeError ERR_INVALID_ARG_TYPE true",
    "write-array TypeError ERR_INVALID_ARG_TYPE true",
    "write-arraybuffer TypeError ERR_INVALID_ARG_TYPE true",
    "end-null TypeError ERR_INVALID_ARG_TYPE true",
    "end-object TypeError ERR_INVALID_ARG_TYPE true",
    "",
    "ERR_UNKNOWN_ENCODING"
  ]);
});

test("OpenContainersBuffer supports Node-style numeric and search helpers", () => {
  const output = [];
  const buffer = new OpenContainersBuffer(24);

  buffer.writeUIntBE(0x123456, 0, 3);
  buffer.writeUIntLE(0x123456, 3, 3);
  buffer.writeIntBE(-2, 6, 2);
  buffer.writeIntLE(-3, 8, 2);
  buffer.writeFloatLE(1.5, 10);
  buffer.writeDoubleBE(3.25, 14);

  output.push(buffer.readUIntBE(0, 3).toString(16));
  output.push(buffer.readUIntLE(3, 3).toString(16));
  output.push(`${buffer.readIntBE(6, 2)} ${buffer.readIntLE(8, 2)}`);
  output.push(`${buffer.readFloatLE(10).toFixed(1)} ${buffer.readDoubleBE(14).toFixed(2)}`);

  const hello = OpenContainersBuffer.from("hello");
  output.push(`${hello.includes("ell")} ${hello.indexOf("ll")} ${hello.lastIndexOf("l")}`);
  output.push(JSON.stringify(OpenContainersBuffer.from("hi")));

  const wide = OpenContainersBuffer.alloc(8);
  wide.writeBigUInt64BE(0x0102030405060708n);
  output.push(`${wide.toString("hex")} ${wide.readBigUInt64BE().toString(16)}`);
  wide.writeBigInt64LE(-2n);
  output.push(`${wide.readBigInt64LE().toString()} ${wide.toString("hex")}`);
  wide.writeBigUint64LE(0x0102030405060708n);
  output.push(`${wide.readBigUint64LE().toString(16)} ${wide.toString("hex")}`);
  output.push(OpenContainersBuffer.from("00112233", "hex").swap16().toString("hex"));
  output.push(OpenContainersBuffer.from("0011223344556677", "hex").swap32().toString("hex"));
  output.push(OpenContainersBuffer.alloc(6).fill("ab").toString());
  output.push(OpenContainersBuffer.from([1, 2, 3, 4]).fill(OpenContainersBuffer.from([9, 8]), 1, 4).toString("hex"));

  assert.deepEqual(output, [
    "123456",
    "123456",
    "-2 -3",
    "1.5 3.25",
    "true 2 3",
    "{\"type\":\"Buffer\",\"data\":[104,105]}",
    "0102030405060708 102030405060708",
    "-2 feffffffffffffff",
    "102030405060708 0807060504030201",
    "11003322",
    "3322110077665544",
    "ababab",
    "01090809"
  ]);
});

test("node:fs exposes Dirent, temporary directories, opendir, truncate, and FileHandle helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import fs from "node:fs";
    import fsp from "node:fs/promises";

    fs.mkdirSync("src/nested", { recursive: true });
    fs.writeFileSync("src/a.txt", "abcdef");

    const entries = fs.readdirSync("src", { withFileTypes: true });
    console.log(entries[0] instanceof fs.Dirent, entries[0].name, entries[0].isFile());
    console.log(entries[1] instanceof fs.Dirent, entries[1].name, entries[1].isDirectory());

    const dir = fs.opendirSync("src");
    const dirEntries = [];
    for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
      dirEntries.push(entry.name);
    }
    dir.closeSync();
    console.log(dirEntries.join(","));

    const temp = fs.mkdtempSync("tmp-");
    console.log(temp.startsWith("tmp-"), fs.statSync(temp).isDirectory());

    const handle = await fsp.open("src/a.txt", "r+");
    await handle.truncate(3);
    console.log(await handle.readFile("utf8"));
    await handle.writeFile("xyz");
    console.log(await fsp.readFile("src/a.txt", "utf8"));
    await handle.close();

    await fsp.truncate("src/a.txt", 1);
    console.log(fs.readFileSync("src/a.txt", "utf8"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true a.txt true",
    "true nested true",
    "a.txt,nested",
    "true true",
    "abc",
    "abcxyz",
    "a"
  ]);
});

test("node:fs and node:constants expose common file flag constants", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const fs = require("node:fs");
      const constants = require("node:constants");
      console.log(Object.hasOwn(fs, "F_OK"), fs.F_OK, fs.constants.F_OK, fs.constants.COPYFILE_EXCL, fs.constants.O_CREAT > 0);
      console.log(constants.F_OK, constants.COPYFILE_EXCL, constants.O_CREAT > 0);
      console.log(fs.constants.S_IFREG > 0, fs.constants.S_IRUSR > 0);
      console.log(constants.ENOENT, constants.EACCES, constants.EADDRINUSE, constants.RTLD_NOW, constants.RTLD_GLOBAL);
      console.log(constants.SIGCHLD, constants.SIGWINCH, constants.PRIORITY_HIGH, constants.PRIORITY_HIGHEST);
      console.log(constants.UV_FS_SYMLINK_DIR, constants.UV_FS_SYMLINK_JUNCTION, constants.UV_FS_O_FILEMAP);
      console.log(constants.SIGINFO, constants.O_SYMLINK, fs.constants.O_SYMLINK);
      console.log(Object.hasOwn(constants, "SIGPOLL"), Object.hasOwn(constants, "SIGPWR"));
      console.log(constants.UV_DIRENT_UNKNOWN, constants.UV_DIRENT_FILE, constants.UV_DIRENT_DIR, constants.UV_DIRENT_LINK, constants.UV_DIRENT_SOCKET);
      console.log(constants.UV_FS_COPYFILE_EXCL, constants.UV_FS_COPYFILE_FICLONE, constants.UV_FS_COPYFILE_FICLONE_FORCE);
      console.log(fs.constants.O_DSYNC, fs.constants.O_NONBLOCK, fs.constants.O_SYNC, fs.constants.O_SYNC === constants.O_SYNC);
      console.log(constants.TLS1_VERSION, constants.TLS1_1_VERSION, constants.TLS1_2_VERSION, constants.TLS1_3_VERSION);
      console.log(constants.RSA_PKCS1_PADDING, constants.RSA_X931_PADDING, constants.RSA_PSS_SALTLEN_AUTO);
      console.log(constants.DH_CHECK_P_NOT_PRIME, constants.DH_CHECK_P_NOT_SAFE_PRIME, constants.DH_UNABLE_TO_CHECK_GENERATOR, constants.DH_NOT_SUITABLE_GENERATOR);
      console.log(constants.ENGINE_METHOD_RSA, constants.ENGINE_METHOD_EC, constants.ENGINE_METHOD_ALL, constants.ENGINE_METHOD_NONE);
      console.log(constants.POINT_CONVERSION_COMPRESSED, constants.POINT_CONVERSION_UNCOMPRESSED, constants.POINT_CONVERSION_HYBRID);
      console.log(constants.OPENSSL_VERSION_NUMBER, constants.SSL_OP_ALL, constants.SSL_OP_NO_TLSv1, constants.SSL_OP_NO_TLSv1_3, constants.SSL_OP_NO_SSLv3, constants.SSL_OP_NO_COMPRESSION, constants.SSL_OP_PRIORITIZE_CHACHA);
      console.log(typeof constants.defaultCoreCipherList, constants.defaultCoreCipherList.includes("TLS_AES_256_GCM_SHA384"), Object.hasOwn(constants, "defaultCipherList"), typeof constants.defaultCipherList);
      console.log(Object.isFrozen(constants), Object.getPrototypeOf(constants) === Object.prototype);
      const constantKeys = Object.keys(constants);
      const expectedErrnoKeys = [
        "E2BIG", "EACCES", "EADDRINUSE", "EADDRNOTAVAIL", "EAFNOSUPPORT",
        "EAGAIN", "EALREADY", "EBADF", "EBADMSG", "EBUSY", "ECANCELED",
        "ECHILD", "ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "EDEADLK",
        "EDESTADDRREQ", "EDOM", "EDQUOT", "EEXIST", "EFAULT", "EFBIG",
        "EHOSTUNREACH", "EIDRM", "EILSEQ", "EINPROGRESS", "EINTR", "EINVAL",
        "EIO", "EISCONN", "EISDIR", "ELOOP", "EMFILE", "EMLINK", "EMSGSIZE",
        "EMULTIHOP", "ENAMETOOLONG", "ENETDOWN", "ENETRESET", "ENETUNREACH",
        "ENFILE", "ENOBUFS", "ENODATA", "ENODEV", "ENOENT", "ENOEXEC",
        "ENOLCK", "ENOLINK", "ENOMEM", "ENOMSG", "ENOPROTOOPT", "ENOSPC",
        "ENOSR", "ENOSTR", "ENOSYS", "ENOTCONN", "ENOTDIR", "ENOTEMPTY",
        "ENOTSOCK", "ENOTSUP", "ENOTTY", "ENXIO", "EOPNOTSUPP", "EOVERFLOW",
        "EPERM", "EPIPE", "EPROTO", "EPROTONOSUPPORT", "EPROTOTYPE",
        "ERANGE", "EROFS", "ESPIPE", "ESRCH", "ESTALE", "ETIME", "ETIMEDOUT",
        "ETXTBSY", "EWOULDBLOCK", "EXDEV"
      ].join(",");
      if (constantKeys.slice(constantKeys.indexOf("E2BIG"), constantKeys.indexOf("PRIORITY_LOW")).join(",") !== expectedErrnoKeys) {
        throw new Error("constants errno order failed");
      }
      console.log(constantKeys.slice(constantKeys.indexOf("UV_FS_SYMLINK_DIR"), constantKeys.indexOf("COPYFILE_FICLONE_FORCE") + 1).join(","));
      console.log(constantKeys.slice(constantKeys.indexOf("UV_FS_COPYFILE_FICLONE_FORCE"), constantKeys.indexOf("POINT_CONVERSION_HYBRID") + 1).join(","));
      console.log(["F_OK", "ENOENT", "RTLD_NOW", "SIGWINCH", "SIGINFO", "UV_DIRENT_DIR", "O_SYNC", "O_SYMLINK", "TLS1_3_VERSION", "RSA_X931_PADDING", "DH_CHECK_P_NOT_PRIME", "OPENSSL_VERSION_NUMBER", "SSL_OP_ALL", "SSL_OP_NO_TLSv1_3", "defaultCoreCipherList"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(constants, key);
        return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
      }).join("|"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "false undefined 0 1 true",
    "0 1 true",
    "true true",
    "2 13 98 2 8",
    "17 28 -14 -20",
    "1 2 0",
    "29 2097152 2097152",
    "false false",
    "0 1 2 3 5",
    "1 2 4",
    "4096 2048 1052672 true",
    "769 770 771 772",
    "1 5 -2",
    "1 2 4 8",
    "1 2048 65535 0",
    "2 4 6",
    "810549344 2147485776 67108864 536870912 33554432 131072 2097152",
    "string true false undefined",
    "true true",
    "UV_FS_SYMLINK_DIR,UV_FS_SYMLINK_JUNCTION,O_RDONLY,O_WRONLY,O_RDWR,UV_DIRENT_UNKNOWN,UV_DIRENT_FILE,UV_DIRENT_DIR,UV_DIRENT_LINK,UV_DIRENT_FIFO,UV_DIRENT_SOCKET,UV_DIRENT_CHAR,UV_DIRENT_BLOCK,S_IFMT,S_IFREG,S_IFDIR,S_IFCHR,S_IFBLK,S_IFIFO,S_IFLNK,S_IFSOCK,O_CREAT,O_EXCL,UV_FS_O_FILEMAP,O_NOCTTY,O_TRUNC,O_APPEND,O_DIRECTORY,O_NOFOLLOW,O_SYNC,O_DSYNC,O_SYMLINK,O_NONBLOCK,S_IRWXU,S_IRUSR,S_IWUSR,S_IXUSR,S_IRWXG,S_IRGRP,S_IWGRP,S_IXGRP,S_IRWXO,S_IROTH,S_IWOTH,S_IXOTH,F_OK,R_OK,W_OK,X_OK,UV_FS_COPYFILE_EXCL,COPYFILE_EXCL,UV_FS_COPYFILE_FICLONE,COPYFILE_FICLONE,UV_FS_COPYFILE_FICLONE_FORCE,COPYFILE_FICLONE_FORCE",
    "UV_FS_COPYFILE_FICLONE_FORCE,COPYFILE_FICLONE_FORCE,OPENSSL_VERSION_NUMBER,SSL_OP_ALL,SSL_OP_ALLOW_NO_DHE_KEX,SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,SSL_OP_CIPHER_SERVER_PREFERENCE,SSL_OP_CISCO_ANYCONNECT,SSL_OP_COOKIE_EXCHANGE,SSL_OP_CRYPTOPRO_TLSEXT_BUG,SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS,SSL_OP_LEGACY_SERVER_CONNECT,SSL_OP_NO_COMPRESSION,SSL_OP_NO_ENCRYPT_THEN_MAC,SSL_OP_NO_QUERY_MTU,SSL_OP_NO_RENEGOTIATION,SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION,SSL_OP_NO_SSLv2,SSL_OP_NO_SSLv3,SSL_OP_NO_TICKET,SSL_OP_NO_TLSv1,SSL_OP_NO_TLSv1_1,SSL_OP_NO_TLSv1_2,SSL_OP_NO_TLSv1_3,SSL_OP_PRIORITIZE_CHACHA,SSL_OP_TLS_ROLLBACK_BUG,ENGINE_METHOD_RSA,ENGINE_METHOD_DSA,ENGINE_METHOD_DH,ENGINE_METHOD_RAND,ENGINE_METHOD_EC,ENGINE_METHOD_CIPHERS,ENGINE_METHOD_DIGESTS,ENGINE_METHOD_PKEY_METHS,ENGINE_METHOD_PKEY_ASN1_METHS,ENGINE_METHOD_ALL,ENGINE_METHOD_NONE,DH_CHECK_P_NOT_SAFE_PRIME,DH_CHECK_P_NOT_PRIME,DH_UNABLE_TO_CHECK_GENERATOR,DH_NOT_SUITABLE_GENERATOR,RSA_PKCS1_PADDING,RSA_NO_PADDING,RSA_PKCS1_OAEP_PADDING,RSA_X931_PADDING,RSA_PKCS1_PSS_PADDING,RSA_PSS_SALTLEN_DIGEST,RSA_PSS_SALTLEN_MAX_SIGN,RSA_PSS_SALTLEN_AUTO,defaultCoreCipherList,TLS1_VERSION,TLS1_1_VERSION,TLS1_2_VERSION,TLS1_3_VERSION,POINT_CONVERSION_COMPRESSED,POINT_CONVERSION_UNCOMPRESSED,POINT_CONVERSION_HYBRID",
    "F_OK:true:false:false:number|ENOENT:true:false:false:number|RTLD_NOW:true:false:false:number|SIGWINCH:true:false:false:number|SIGINFO:true:false:false:number|UV_DIRENT_DIR:true:false:false:number|O_SYNC:true:false:false:number|O_SYMLINK:true:false:false:number|TLS1_3_VERSION:true:false:false:number|RSA_X931_PADDING:true:false:false:number|DH_CHECK_P_NOT_PRIME:true:false:false:number|OPENSSL_VERSION_NUMBER:true:false:false:number|SSL_OP_ALL:true:false:false:number|SSL_OP_NO_TLSv1_3:true:false:false:number|defaultCoreCipherList:true:false:false:string"
  ]);
});

test("node:constants exposes defaultCipherList after crypto initialization", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const originalDefaultCipherDescriptor = Object.getOwnPropertyDescriptor(crypto.constants, "defaultCipherList");
      crypto.constants.defaultCipherList = "override";
      const constants = require("node:constants");
      const descriptor = Object.getOwnPropertyDescriptor(constants, "defaultCipherList");
      console.log(Object.hasOwn(constants, "defaultCipherList"), constants.defaultCipherList, constants.defaultCoreCipherList.includes("TLS_AES_256_GCM_SHA384"));
      console.log(descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value);
      console.log(Object.isFrozen(constants), Object.keys(constants).slice(-8).join(","));
      Object.defineProperty(crypto.constants, "defaultCipherList", originalDefaultCipherDescriptor);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true override true",
    "true false false string",
    "true TLS1_VERSION,TLS1_1_VERSION,TLS1_2_VERSION,TLS1_3_VERSION,POINT_CONVERSION_COMPRESSED,POINT_CONVERSION_UNCOMPRESSED,POINT_CONVERSION_HYBRID,defaultCipherList"
  ]);
});

test("node:constants exposes defaultCipherList after TLS initialization", async () => {
  const kernel = new Kernel();
  const rows = [];
  for (const prelude of ["node:tls", "node:https"]) {
    const result = await kernel.run("node", [
      "-e",
      `
        require(${JSON.stringify(prelude)});
        const constants = require("node:constants");
        const descriptor = Object.getOwnPropertyDescriptor(constants, "defaultCipherList");
        console.log([
          ${JSON.stringify(prelude)},
          Object.hasOwn(constants, "defaultCipherList"),
          constants.defaultCipherList === constants.defaultCoreCipherList,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          typeof descriptor.value,
          Object.isFrozen(constants),
          Object.keys(constants).slice(-8).join(",")
        ].join(" "));
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    rows.push(result.stdout.toString().trim());
  }

  assert.deepEqual(rows, [
    "node:tls true true true false false string true TLS1_VERSION,TLS1_1_VERSION,TLS1_2_VERSION,TLS1_3_VERSION,POINT_CONVERSION_COMPRESSED,POINT_CONVERSION_UNCOMPRESSED,POINT_CONVERSION_HYBRID,defaultCipherList",
    "node:https true true true false false string true TLS1_VERSION,TLS1_1_VERSION,TLS1_2_VERSION,TLS1_3_VERSION,POINT_CONVERSION_COMPRESSED,POINT_CONVERSION_UNCOMPRESSED,POINT_CONVERSION_HYBRID,defaultCipherList"
  ]);
});

test("node:constants preserves constants-first cache when crypto loads later", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/constants-load-order.cjs", `
    const constants = require("node:constants");
    console.log(Object.hasOwn(constants, "defaultCipherList"), typeof constants.defaultCipherList, Object.keys(constants).slice(-8).join(","));
    const crypto = require("node:crypto");
    console.log(Object.hasOwn(constants, "defaultCipherList"), typeof constants.defaultCipherList, constants === require("node:constants"), Object.hasOwn(crypto.constants, "defaultCipherList"));
    const tls = require("node:tls");
    const https = require("node:https");
    console.log(Object.hasOwn(constants, "defaultCipherList"), typeof constants.defaultCipherList, typeof tls.createSecureContext, typeof https.request);
  `);
  const result = await kernel.run("node", ["/workspace/constants-load-order.cjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "false undefined defaultCoreCipherList,TLS1_VERSION,TLS1_1_VERSION,TLS1_2_VERSION,TLS1_3_VERSION,POINT_CONVERSION_COMPRESSED,POINT_CONVERSION_UNCOMPRESSED,POINT_CONVERSION_HYBRID",
    "false undefined true true",
    "false undefined function function"
  ]);
});

test("node:fs exposes statfs sync, callback, and promise helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const fs = require("node:fs");
    const fsp = require("node:fs/promises");

    const sync = fs.statfsSync(".");
    console.log(Object.hasOwn(fs, "StatFs"), typeof fs.StatFs, sync.constructor.name, sync.bsize > 0, sync.path);

    const [callbackError, callbackStats] = await new Promise((resolve) => {
      fs.statfs(".", (error, stats) => resolve([error, stats]));
    });
    console.log(callbackError === null, callbackStats.blocks > 0);

    const bigint = await fsp.statfs(".", { bigint: true });
    console.log(typeof bigint.bsize, typeof bigint.blocks, bigint.path);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "false undefined StatFs true /workspace",
    "true true",
    "bigint bigint /workspace"
  ]);
});

test("node:crypto randomBytes supports callback form and keeps process alive", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require('node:crypto');
      console.log(crypto.pseudoRandomBytes === crypto.randomBytes, crypto.rng === crypto.randomBytes, crypto.prng === crypto.randomBytes);
      console.log(Buffer.isBuffer(crypto.pseudoRandomBytes(4)), Buffer.isBuffer(crypto.rng(2)), Buffer.isBuffer(crypto.prng(3)));
      for (const [label, run] of [
        ["undefined", () => crypto.randomBytes(undefined)],
        ["string", () => crypto.randomBytes("4")],
        ["nan", () => crypto.randomBytes(NaN)],
        ["infinity", () => crypto.randomBytes(Infinity)],
        ["negative", () => crypto.randomBytes(-1)],
        ["too-large", () => crypto.randomBytes(2 ** 31)],
        ["bad-callback", () => crypto.randomBytes(4, 123)],
        ["null-callback", () => crypto.randomBytes(4, null)]
      ]) {
        try {
          run();
        } catch (error) {
          console.log(label, error.name, error.code);
        }
      }
      console.log("fraction", crypto.randomBytes(1.5).length);
      crypto.pseudoRandomBytes(15, (error, bytes) => {
        console.log(error === null);
        console.log(bytes.length);
        console.log(bytes.toString('base64').length > 0);
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true true",
    "true true true",
    "undefined TypeError ERR_INVALID_ARG_TYPE",
    "string TypeError ERR_INVALID_ARG_TYPE",
    "nan RangeError ERR_OUT_OF_RANGE",
    "infinity RangeError ERR_OUT_OF_RANGE",
    "negative RangeError ERR_OUT_OF_RANGE",
    "too-large RangeError ERR_OUT_OF_RANGE",
    "bad-callback TypeError ERR_INVALID_ARG_TYPE",
    "null-callback TypeError ERR_INVALID_ARG_TYPE",
    "fraction 1",
    "true",
    "15",
    "true"
  ]);
});

test("node:crypto exposes native-shaped descriptor metadata", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const descriptorRow = (object, key) => {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        return [
          key,
          descriptor.enumerable,
          descriptor.configurable,
          "writable" in descriptor ? descriptor.writable : "accessor",
          typeof descriptor.get,
          typeof descriptor.set
        ].join(":");
      };
      console.log(Object.keys(crypto).join(","));
      console.log(["constants", "webcrypto", "subtle", "getRandomValues", "fips"].map((key) => descriptorRow(crypto, key)).join("|"));
      const fipsDescriptor = Object.getOwnPropertyDescriptor(crypto, "fips");
      const fipsAccessorRow = (kind, fn) => {
        const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        return [kind, fn.name, fn.length, Object.hasOwn(fn, "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
      };
      console.log([fipsAccessorRow("get", fipsDescriptor.get), fipsAccessorRow("set", fipsDescriptor.set)].join("|"));
      console.log(["pseudoRandomBytes", "rng", "prng"].map((key) => descriptorRow(crypto, key)).join("|"));
      const paddingDescriptor = Object.getOwnPropertyDescriptor(crypto.constants, "RSA_PKCS1_PADDING");
      const tlsDescriptor = Object.getOwnPropertyDescriptor(crypto.constants, "TLS1_3_VERSION");
      const coreCipherDescriptor = Object.getOwnPropertyDescriptor(crypto.constants, "defaultCoreCipherList");
      const cipherDescriptor = Object.getOwnPropertyDescriptor(crypto.constants, "defaultCipherList");
      console.log(Object.getPrototypeOf(crypto.constants) === null, paddingDescriptor.enumerable, paddingDescriptor.configurable, paddingDescriptor.writable, paddingDescriptor.value);
      console.log(crypto.constants.RSA_X931_PADDING, crypto.constants.DH_CHECK_P_NOT_PRIME, crypto.constants.DH_NOT_SUITABLE_GENERATOR, crypto.constants.POINT_CONVERSION_HYBRID);
      console.log(crypto.constants.TLS1_VERSION, crypto.constants.TLS1_1_VERSION, crypto.constants.TLS1_2_VERSION, crypto.constants.TLS1_3_VERSION, tlsDescriptor.enumerable, tlsDescriptor.configurable, tlsDescriptor.writable);
      console.log(crypto.constants.OPENSSL_VERSION_NUMBER, crypto.constants.SSL_OP_ALL, crypto.constants.SSL_OP_NO_TLSv1, crypto.constants.SSL_OP_NO_TLSv1_3, crypto.constants.SSL_OP_NO_SSLv3, crypto.constants.SSL_OP_NO_COMPRESSION, crypto.constants.SSL_OP_PRIORITIZE_CHACHA);
      console.log(typeof crypto.constants.defaultCoreCipherList, crypto.constants.defaultCoreCipherList.includes("TLS_AES_256_GCM_SHA384"), coreCipherDescriptor.enumerable, coreCipherDescriptor.configurable, coreCipherDescriptor.writable, typeof coreCipherDescriptor.value);
      console.log(cipherDescriptor.enumerable, cipherDescriptor.configurable, typeof cipherDescriptor.get, typeof cipherDescriptor.set, crypto.constants.defaultCipherList === crypto.constants.defaultCoreCipherList);
      crypto.constants.defaultCipherList = "override";
      const assignedCipherDescriptor = Object.getOwnPropertyDescriptor(crypto.constants, "defaultCipherList");
      console.log(crypto.constants.defaultCipherList);
      console.log(assignedCipherDescriptor.enumerable, assignedCipherDescriptor.configurable, assignedCipherDescriptor.writable, typeof assignedCipherDescriptor.value, typeof assignedCipherDescriptor.get, typeof assignedCipherDescriptor.set);
      console.log(crypto.getRandomValues.name, crypto.getRandomValues.length, typeof crypto.webcrypto, typeof crypto.subtle);
      console.log(Object.keys(crypto).includes("pseudoRandomBytes"), Object.keys(crypto).includes("fips"), crypto.pseudoRandomBytes === crypto.randomBytes);
      crypto.pseudoRandomBytes = (size) => Buffer.alloc(size, 1);
      console.log(crypto.pseudoRandomBytes === crypto.randomBytes, crypto.pseudoRandomBytes(2).toString("hex"));
      delete crypto.pseudoRandomBytes;
      console.log(Object.hasOwn(crypto, "pseudoRandomBytes"));
      const metadataNames = [
        "checkPrime",
        "checkPrimeSync",
        "createDiffieHellman",
        "createHash",
        "createHmac",
        "createSecretKey",
        "createSign",
        "createVerify",
        "diffieHellman",
        "generatePrime",
        "generatePrimeSync",
        "generateKeyPair",
        "generateKeyPairSync",
        "generateKey",
        "generateKeySync",
        "privateDecrypt",
        "privateEncrypt",
        "publicDecrypt",
        "publicEncrypt",
        "randomFill",
        "randomFillSync",
        "randomInt",
        "randomUUID",
        "randomUUIDv7",
        "scrypt",
        "pbkdf2Sync",
        "setEngine",
        "getFips",
        "setFips",
        "timingSafeEqual",
        "sign",
        "verify",
        "getCiphers",
        "getCurves",
        "getHashes",
        "getDiffieHellman",
        "Cipheriv",
        "Decipheriv",
        "Hash",
        "Hmac",
        "Sign",
        "Verify",
        "secureHeapUsed"
      ];
      console.log(metadataNames.map((name) => name + ":" + crypto[name].name + "/" + crypto[name].length).join("|"));
      console.log(["setEngine", "getFips", "setFips", "secureHeapUsed"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(crypto[name], "prototype");
        return [name, crypto[name].name, crypto[name].length, Object.hasOwn(crypto[name], "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
      }).join("|"));
      console.log(["randomBytes", "randomFill", "randomFillSync", "randomInt", "randomUUID", "randomUUIDv7"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(crypto[name], "prototype");
        return [name, crypto[name].name, crypto[name].length, Object.hasOwn(crypto[name], "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
      }).join("|"));
      console.log(["createCipheriv", "createDecipheriv", "createDiffieHellman", "createDiffieHellmanGroup", "createECDH", "createHash", "createHmac", "createPrivateKey", "createPublicKey", "createSecretKey", "createSign", "createVerify", "diffieHellman", "generateKeyPair", "generateKeyPairSync", "generateKey", "generateKeySync", "getDiffieHellman", "hkdf", "pbkdf2", "scrypt", "sign", "verify"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(crypto[name], "prototype");
        return [name, crypto[name].name, crypto[name].length, Object.hasOwn(crypto[name], "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
      }).join("|"));
      console.log(new crypto.Hash("sha256").constructor.name, new crypto.Hmac("sha256", "key").constructor.name);
      console.log(crypto.Hash.name, crypto.Hmac.name, crypto.Hash("sha256").constructor.name, crypto.Hmac("sha256", "key").constructor.name);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "argon2,argon2Sync,checkPrime,checkPrimeSync,createCipheriv,createDecipheriv,createDiffieHellman,createDiffieHellmanGroup,createECDH,createHash,createHmac,createPrivateKey,createPublicKey,createSecretKey,createSign,createVerify,diffieHellman,generatePrime,generatePrimeSync,getCiphers,getCipherInfo,getCurves,getDiffieHellman,getHashes,hkdf,hkdfSync,pbkdf2,pbkdf2Sync,generateKeyPair,generateKeyPairSync,generateKey,generateKeySync,privateDecrypt,privateEncrypt,publicDecrypt,publicEncrypt,randomBytes,randomFill,randomFillSync,randomInt,randomUUID,randomUUIDv7,scrypt,scryptSync,sign,setEngine,timingSafeEqual,getFips,setFips,verify,hash,encapsulate,decapsulate,Certificate,Cipheriv,Decipheriv,DiffieHellman,DiffieHellmanGroup,ECDH,Hash,Hmac,KeyObject,Sign,Verify,X509Certificate,secureHeapUsed,constants,webcrypto,subtle,getRandomValues",
    "constants:true:false:false:undefined:undefined|webcrypto:true:false:accessor:function:undefined|subtle:true:false:accessor:function:undefined|getRandomValues:true:false:accessor:function:undefined|fips:false:false:accessor:function:function",
    "get:deprecated:0:true:false:false:true:constructor|set:deprecated:1:true:false:false:true:constructor",
    "pseudoRandomBytes:false:true:accessor:function:function|rng:false:true:accessor:function:function|prng:false:true:accessor:function:function",
    "true true false false 1",
    "5 1 8 6",
    "769 770 771 772 true false false",
    "810549344 2147485776 67108864 536870912 33554432 131072 2097152",
    "string true true false false string",
    "true true function function true",
    "override",
    "true true true string undefined undefined",
    "getRandomValues 1 object object",
    "false false true",
    "false 0101",
    "false",
    "checkPrime:checkPrime/1|checkPrimeSync:checkPrimeSync/1|createDiffieHellman:createDiffieHellman/4|createHash:createHash/2|createHmac:createHmac/3|createSecretKey:createSecretKey/2|createSign:createSign/2|createVerify:createVerify/2|diffieHellman:diffieHellman/2|generatePrime:generatePrime/3|generatePrimeSync:generatePrimeSync/1|generateKeyPair:generateKeyPair/3|generateKeyPairSync:generateKeyPairSync/2|generateKey:generateKey/3|generateKeySync:generateKeySync/2|privateDecrypt:/2|privateEncrypt:/2|publicDecrypt:/2|publicEncrypt:/2|randomFill:randomFill/4|randomFillSync:randomFillSync/1|randomInt:randomInt/3|randomUUID:randomUUID/1|randomUUIDv7:randomUUIDv7/1|scrypt:scrypt/4|pbkdf2Sync:pbkdf2Sync/5|setEngine:setEngine/2|getFips:getFips/0|setFips:setFips/1|timingSafeEqual:/0|sign:signOneShot/4|verify:verifyOneShot/5|getCiphers:/0|getCurves:/0|getHashes:/0|getDiffieHellman:createDiffieHellmanGroup/1|Cipheriv:Cipheriv/4|Decipheriv:Decipheriv/4|Hash:deprecated/2|Hmac:deprecated/3|Sign:Sign/2|Verify:Verify/2|secureHeapUsed:secureHeapUsed/0",
    "setEngine:setEngine:2:true:false:false:true:constructor|getFips:getFips:0:true:false:false:true:constructor|setFips:setFips:1:true:false:false:true:constructor|secureHeapUsed:secureHeapUsed:0:true:false:false:true:constructor",
    "randomBytes:randomBytes:2:true:false:false:true:constructor|randomFill:randomFill:4:true:false:false:true:constructor|randomFillSync:randomFillSync:1:true:false:false:true:constructor|randomInt:randomInt:3:true:false:false:true:constructor|randomUUID:randomUUID:1:true:false:false:true:constructor|randomUUIDv7:randomUUIDv7:1:true:false:false:true:constructor",
    "createCipheriv:createCipheriv:4:true:false:false:true:constructor|createDecipheriv:createDecipheriv:4:true:false:false:true:constructor|createDiffieHellman:createDiffieHellman:4:true:false:false:true:constructor|createDiffieHellmanGroup:createDiffieHellmanGroup:1:true:false:false:true:constructor|createECDH:createECDH:1:true:false:false:true:constructor|createHash:createHash:2:true:false:false:true:constructor|createHmac:createHmac:3:true:false:false:true:constructor|createPrivateKey:createPrivateKey:1:true:false:false:true:constructor|createPublicKey:createPublicKey:1:true:false:false:true:constructor|createSecretKey:createSecretKey:2:true:false:false:true:constructor|createSign:createSign:2:true:false:false:true:constructor|createVerify:createVerify:2:true:false:false:true:constructor|diffieHellman:diffieHellman:2:true:false:false:true:constructor|generateKeyPair:generateKeyPair:3:true:false:false:true:constructor|generateKeyPairSync:generateKeyPairSync:2:true:false:false:true:constructor|generateKey:generateKey:3:true:false:false:true:constructor|generateKeySync:generateKeySync:2:true:false:false:true:constructor|getDiffieHellman:createDiffieHellmanGroup:1:true:false:false:true:constructor|hkdf:hkdf:6:true:false:false:true:constructor|pbkdf2:pbkdf2:6:true:false:false:true:constructor|scrypt:scrypt:4:true:false:false:true:constructor|sign:signOneShot:4:true:false:false:true:constructor|verify:verifyOneShot:5:true:false:false:true:constructor",
    "Hash Hmac",
    "deprecated deprecated Hash Hmac"
  ]);
});

test("node:crypto exposes randomInt, getCiphers, hash copy, and secret keys", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const hash = crypto.createHash("sha256").update("abc");
      const copy = hash.copy().update("def").digest("hex");
      const md5 = crypto.createHash("md5").update("hello repl").digest("hex");
      const digestBuffer = crypto.createHash("sha256").update("abc").digest("buffer");
      const hmacBuffer = crypto.createHmac("sha256", "secret").update("hello").digest("buffer");
      const key = crypto.createSecretKey(Buffer.alloc(32, 7));
      const iv = Buffer.alloc(16, 8);
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      const encrypted = cipher.update("x", "utf8", "hex") + cipher.final("hex");

      console.log(crypto.getCiphers().includes("aes-256-cbc"));
      console.log(crypto.getHashes().includes("md5"));
      const hashes = crypto.getHashes();
      const curves = crypto.getCurves();
      hashes.push("mutated");
      curves.push("mutated");
      console.log(hashes.length, hashes[0], hashes.at(-2), crypto.getHashes().length, crypto.getHashes().at(-1), crypto.getHashes().includes("mutated"), crypto.getHashes().includes("RSA-SHA256"));
      console.log(curves.length, curves[0], curves.at(-2), crypto.getCurves().length, crypto.getCurves().at(-1), crypto.getCurves().includes("mutated"), crypto.getCurves().includes("prime256v1"), crypto.getCurves().includes("secp256k1"));
      console.log(crypto.randomInt(1, 3) >= 1);
      console.log(typeof crypto.randomUUIDv7, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(crypto.randomUUIDv7()));
      console.log(crypto.hash.length, Buffer.isBuffer(crypto.hash("sha256", "abc", "buffer")), crypto.hash("sha256", "abc").slice(0, 8));
      console.log(Buffer.isBuffer(digestBuffer), digestBuffer.length, digestBuffer.toString("hex").slice(0, 8));
      console.log(Buffer.isBuffer(hmacBuffer), hmacBuffer.length, hmacBuffer.toString("hex").slice(0, 8));
      crypto.randomInt(2, (error, value) => console.log(error === null, value >= 0, value < 2));
      console.log(md5);
      console.log(copy);
      console.log(key.type, key.symmetricKeySize, key.export().length);
      console.log(typeof encrypted);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.deepEqual(lines.slice(0, 2), ["true", "true"]);
  assert.equal(lines[2], "53 RSA-MD5 ssl3-sha1 52 ssl3-sha1 false true");
  assert.equal(lines[3], "83 Oakley-EC2N-3 wap-wsg-idm-ecid-wtls9 82 wap-wsg-idm-ecid-wtls9 false true true");
  assert.equal(lines[4], "true");
  assert.equal(lines[5], "function true");
  assert.equal(lines[6], "3 true ba7816bf");
  assert.equal(lines[7], "true 32 ba7816bf");
  assert.equal(lines[8], "true 32 88aab3ed");
  assert.equal(lines[9], "11c68220cb096198591dcd3fa47aec34");
  assert.equal(lines[10], "bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721");
  assert.equal(lines[11], "secret 32 32");
  assert.equal(lines[12], "string");
  assert.equal(lines[13], "true true true");
});

test("node:crypto validates randomInt and randomFill arguments like Node", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");

      const oneArg = crypto.randomInt(2);
      const arrayBuffer = new ArrayBuffer(4);
      const dataView = new DataView(new ArrayBuffer(4));
      const typedArray = new Uint16Array(2);
      console.log("success", Number.isInteger(oneArg), oneArg >= 0, oneArg < 2, crypto.randomFillSync(arrayBuffer) === arrayBuffer, crypto.randomFillSync(dataView) === dataView, crypto.randomFillSync(typedArray) === typedArray);

      const rows = [
        ["randomInt-range", () => crypto.randomInt(0, 2 ** 48)],
        ["randomInt-min-type", () => crypto.randomInt("1", 3)],
        ["randomInt-callback", () => crypto.randomInt(1, 3, "callback")],
        ["randomFill-callback", () => crypto.randomFill(Buffer.alloc(4))],
        ["randomFill-buf", () => crypto.randomFill("x", () => {})],
        ["randomFill-offset", () => crypto.randomFill(Buffer.alloc(4), "1", () => {})],
        ["randomFill-size", () => crypto.randomFill(Buffer.alloc(4), 0, "2", () => {})],
        ["randomFill-range", () => crypto.randomFill(Buffer.alloc(4), 0, 5, () => {})],
        ["randomFillSync-buf", () => crypto.randomFillSync("x")],
        ["randomFillSync-null", () => crypto.randomFillSync(null)],
        ["randomFillSync-range", () => crypto.randomFillSync(Buffer.alloc(4), 0, 5)]
      ].map(([label, action]) => {
        try {
          action();
          return label + ":ok";
        } catch (error) {
          return [label, error.name, error.code, error.message].join(":");
        }
      });
      console.log(rows.join("|"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "success true true true true true true",
    "randomInt-range:RangeError:ERR_OUT_OF_RANGE:The value of \"max - min\" is out of range. It must be <= 281474976710655. Received 281_474_976_710_656|randomInt-min-type:TypeError:ERR_INVALID_ARG_TYPE:The \"min\" argument must be a safe integer. Received type string ('1')|randomInt-callback:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('callback')|randomFill-callback:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received undefined|randomFill-buf:TypeError:ERR_INVALID_ARG_TYPE:The \"buf\" argument must be an instance of ArrayBuffer or ArrayBufferView. Received type string ('x')|randomFill-offset:TypeError:ERR_INVALID_ARG_TYPE:The \"offset\" argument must be of type number. Received type string ('1')|randomFill-size:TypeError:ERR_INVALID_ARG_TYPE:The \"size\" argument must be of type number. Received type string ('2')|randomFill-range:RangeError:ERR_OUT_OF_RANGE:The value of \"size + offset\" is out of range. It must be <= 4. Received 5|randomFillSync-buf:TypeError:ERR_INVALID_ARG_TYPE:The \"buf\" argument must be an instance of ArrayBuffer or ArrayBufferView. Received type string ('x')|randomFillSync-null:TypeError:ERR_INVALID_ARG_TYPE:The \"buf\" argument must be an instance of ArrayBuffer or ArrayBufferView. Received null|randomFillSync-range:RangeError:ERR_OUT_OF_RANGE:The value of \"size + offset\" is out of range. It must be <= 4. Received 5"
  ]);
});

test("node:crypto exposes Node-shaped constructor probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const key = Buffer.alloc(32, 1);
      const iv = Buffer.alloc(16, 2);
      const hash = crypto.createHash("sha256");
      const hmac = crypto.createHmac("sha256", "secret");
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      const encrypted = cipher.update("secret", "utf8", "hex") + cipher.final("hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      const decrypted = decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
      console.log(
        hash instanceof crypto.Hash,
        hmac instanceof crypto.Hmac,
        cipher instanceof crypto.Cipheriv,
        decipher instanceof crypto.Decipheriv
      );
      console.log(new crypto.Hash("sha256").update("abc").digest("hex"));
      console.log(decrypted);

      const certificate = new crypto.Certificate();
      const calledCertificate = crypto.Certificate();
      const sign = crypto.createSign("RSA-SHA256");
      const verify = crypto.createVerify("RSA-SHA256");
      const diffieHellman = crypto.createDiffieHellman(2048);
      const group = crypto.getDiffieHellman("modp14");
      const ecdh = crypto.createECDH("prime256v1");
      console.log(
        certificate instanceof crypto.Certificate,
        sign instanceof crypto.Sign,
        verify instanceof crypto.Verify,
        diffieHellman instanceof crypto.DiffieHellman,
        group instanceof crypto.DiffieHellmanGroup,
        ecdh instanceof crypto.ECDH
      );
      const functionPrototypeRow = (fn) => {
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        return [
          fn.name,
          fn.length,
          Object.hasOwn(fn, "prototype"),
          prototypeDescriptor?.enumerable,
          prototypeDescriptor?.configurable,
          prototypeDescriptor?.writable,
          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
          prototypeDescriptor?.value?.constructor === fn
        ].join(":");
      };
      const certificateDescriptorRow = (target, name) => {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          functionPrototypeRow(descriptor.value)
        ].join(":");
      };
      console.log("certificate call", calledCertificate instanceof crypto.Certificate, Object.prototype.toString.call(calledCertificate), Object.keys(crypto.Certificate).join(","));
      console.log("certificate constructor names", Object.getOwnPropertyNames(crypto.Certificate).join(","), Object.getOwnPropertyNames(crypto.Certificate.prototype).join(","), Object.keys(crypto.Certificate.prototype).join(","));
      console.log("certificate statics", ["exportChallenge", "exportPublicKey", "verifySpkac"].map((name) => certificateDescriptorRow(crypto.Certificate, name)).join("|"));
      console.log("certificate prototype", ["verifySpkac", "exportPublicKey", "exportChallenge"].map((name) => certificateDescriptorRow(crypto.Certificate.prototype, name)).join("|"));
      console.log("certificate results", JSON.stringify(crypto.Certificate.verifySpkac(Buffer.alloc(0))), crypto.Certificate.verifySpkac(Buffer.from("x")), JSON.stringify(crypto.Certificate.exportPublicKey(Buffer.alloc(0))), JSON.stringify(certificate.exportChallenge(Buffer.alloc(0))));
      console.log("certificate missing", ["verifySpkac", "exportPublicKey", "exportChallenge"].map((name) => {
        try {
          crypto.Certificate[name]();
          return name + ":ok";
        } catch (error) {
          return [name, error.name, error.code].join(":");
        }
      }).join("|"));
      try {
        sign.sign("private-key");
      } catch (error) {
        console.log(error.code);
      }
      try {
        new crypto.X509Certificate("nope");
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true true true",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "secret",
    "true true true true true true",
    "certificate call true [object Object] exportChallenge,exportPublicKey,verifySpkac",
    "certificate constructor names length,name,prototype,exportChallenge,exportPublicKey,verifySpkac constructor,verifySpkac,exportPublicKey,exportChallenge verifySpkac,exportPublicKey,exportChallenge",
    "certificate statics exportChallenge:true:true:true:exportChallenge:2:true:false:false:true:constructor:true|exportPublicKey:true:true:true:exportPublicKey:2:true:false:false:true:constructor:true|verifySpkac:true:true:true:verifySpkac:2:true:false:false:true:constructor:true",
    "certificate prototype verifySpkac:true:true:true:verifySpkac:2:true:false:false:true:constructor:true|exportPublicKey:true:true:true:exportPublicKey:2:true:false:false:true:constructor:true|exportChallenge:true:true:true:exportChallenge:2:true:false:false:true:constructor:true",
    "certificate results \"\" false \"\" \"\"",
    "certificate missing verifySpkac:TypeError:ERR_INVALID_ARG_TYPE|exportPublicKey:TypeError:ERR_INVALID_ARG_TYPE|exportChallenge:TypeError:ERR_INVALID_ARG_TYPE",
    "ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "ERR_OSSL_PEM_NO_START_LINE"
  ]);
});

test("node:crypto exposes X509Certificate metadata and asymmetric key probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const pem = \`-----BEGIN CERTIFICATE-----
MIIC3DCCAcQCCQCsVYv1mCP9OzANBgkqhkiG9w0BAQsFADAwMRUwEwYDVQQDDAxl
eGFtcGxlLnRlc3QxFzAVBgNVBAoMDk9wZW5Db250YWluZXJzMB4XDTI2MDYyMDIw
MDI1OVoXDTI3MDYyMDIwMDI1OVowMDEVMBMGA1UEAwwMZXhhbXBsZS50ZXN0MRcw
FQYDVQQKDA5PcGVuQ29udGFpbmVyczCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBAKtsAxArae2YYu8D24yiK4ctzHmkhENVjJ/9fuSBqTlNEsMTbnwQy3MF
QLz0ik41wjsOr6LzRLK+9tf2gFAj2MQ/fxz5vc8vNkYTPWo8lLtJVFPaEvVZ6t6d
DYyf1eoSHRV82+3mqsqX2Kyjeb65rEpsymrM2Ru+sptcC9+g+rph7uyt2LSLIsle
gFLr9vevkgwQqQgMl18/VJxxxR6aG/wxU8LvxrmzyXs+gWn+NMErFwsPGtKKWQpR
xGs0bpPxvV7sWaEOi/RDKMXDulfn9+bJQMdDE2hX03jczo3srzz/cLtCpp+RiHWI
A/ekuxEK4sfZddCZMYQ3uEL5xBKDQdUCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEA
EmSdS1fqcIKAXNyd5kNz4ykQx2+ou3x82Bqe6asx2AQbpVOxBzS7HXpGB2oplOWV
I7K911mJLQkoVBTPlizkL+R8dO8MkvZ6pBJ1wl07ae6hZERGhc/UIrtdlio3AxWd
bJCHzK3ut4qmPGPaUx4Z3ANsw7vORpfYwh+ZjovztBhhg8IMnBhBWhVWWQKDMLX6
ncWd4ADYHUbvlPlX8rq0NL2IclVSY5KeRufHMFua7sBzZ20HhYeZSEmGhut7dknJ
wYTYSkxU6ItQ2rZvvtc1A+zGjvMcNVh6Qm7KVhysK/4DYiQm71qdNxK4n0XhTY7O
cA6uruLYoYH6ducBIUURvA==
-----END CERTIFICATE-----\`;
      const cert = new crypto.X509Certificate(pem);
      console.log(cert instanceof crypto.X509Certificate);
      console.log(JSON.stringify({
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        fingerprint256: cert.fingerprint256,
        ca: cert.ca,
        host: cert.checkHost("example.test"),
        email: cert.checkEmail("a@example.test") || null,
        raw: Buffer.isBuffer(cert.raw),
        rawLength: cert.raw.length,
        publicType: cert.publicKey.type,
        publicAsym: cert.publicKey.asymmetricKeyType,
        pem: cert.toString().startsWith("-----BEGIN CERTIFICATE-----"),
        json: cert.toJSON() === cert.toString(),
      }));
      const fromDer = new crypto.X509Certificate(cert.raw);
      console.log(fromDer.subject, fromDer.checkIssued(cert));
      const publicKey = crypto.createPublicKey(cert.publicKey.export({ format: "pem", type: "spki" }));
      console.log(publicKey.type, publicKey.asymmetricKeyType, publicKey.export({ format: "pem", type: "spki" }).startsWith("-----BEGIN PUBLIC KEY-----"));
      try {
        cert.verify(publicKey);
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "{\"subject\":\"CN=example.test\\nO=OpenContainers\",\"issuer\":\"CN=example.test\\nO=OpenContainers\",\"serialNumber\":\"AC558BF59823FD3B\",\"validFrom\":\"Jun 20 20:02:59 2026 GMT\",\"validTo\":\"Jun 20 20:02:59 2027 GMT\",\"fingerprint256\":\"D3:2F:8B:56:E0:B4:28:33:B4:AD:63:F5:0F:04:4B:86:C9:C3:1E:A3:8E:AE:68:1B:93:FC:78:40:AE:8B:D0:9C\",\"ca\":false,\"host\":\"example.test\",\"email\":null,\"raw\":true,\"rawLength\":736,\"publicType\":\"public\",\"publicAsym\":\"rsa\",\"pem\":true,\"json\":true}",
    "CN=example.test",
    "O=OpenContainers true",
    "public rsa true",
    "ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED"
  ]);
});

test("node:crypto Sign and Verify accept writable update probes", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const stream = require("node:stream");

      const sign = crypto.createSign("RSA-SHA256");
      let signFinished = false;
      sign.on("finish", () => {
        signFinished = true;
      });
      console.log(sign instanceof crypto.Sign, sign instanceof stream.Writable);
      console.log(sign.update("a") === sign, sign.write("b"));
      sign.end("c", () => {
        console.log("sign-end", signFinished, sign.writableEnded, sign.writableFinished);
      });
      try {
        sign.sign("private-key");
      } catch (error) {
        console.log("sign", error.code);
      }

      const verify = crypto.createVerify("RSA-SHA256");
      let verifyFinished = false;
      verify.on("finish", () => {
        verifyFinished = true;
      });
      console.log(verify instanceof crypto.Verify, verify instanceof stream.Writable);
      console.log(verify.update(Buffer.from("a")) === verify, verify.write(Buffer.from("b")));
      verify.end(Buffer.from("c"), () => {
        console.log("verify-end", verifyFinished, verify.writableEnded, verify.writableFinished);
      });
      try {
        verify.verify("public-key", "signature");
      } catch (error) {
        console.log("verify", error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true",
    "true true",
    "sign-end true true true",
    "sign ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "true true",
    "true true",
    "verify-end true true true",
    "verify ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED"
  ]);
});

test("node:crypto secret keys are detected by util.types.isKeyObject", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const util = require("node:util");
      const key = crypto.createSecretKey(Buffer.alloc(32));
      console.log(util.types.isKeyObject(key));
      console.log(util.types.isKeyObject({}));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\nfalse\n");
});

test("node:crypto supports sha256 and AES-CBC cipher round trips", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require('node:crypto');
      const hash = crypto.createHash('sha256').update('hello repl').digest('hex');
      console.log(hash);

      const key = Buffer.alloc(32, 1);
      const iv = Buffer.alloc(16, 2);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update('secret message', 'utf8', 'hex');
      encrypted += cipher.final('hex');
      console.log(encrypted);

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      console.log(decrypted);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "ba4d55a8197c018035c8b1bc6e6866c396f16a91fbce926ad26236c298468aa0",
    "c38c13861fcfd31d87816dd429025bfe",
    "secret message"
  ]);
});

test("node:crypto supports AES-CTR cipher round trips", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require('node:crypto');
      const key = Buffer.alloc(32, 1);
      const iv = Buffer.alloc(16, 2);
      const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
      let encrypted = cipher.update('secret message', 'utf8', 'hex');
      encrypted += cipher.final('hex');
      console.log(encrypted);

      const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      console.log(decrypted);

      const info = crypto.getCipherInfo('aes-256-ctr');
      console.log(crypto.getCiphers().includes('aes-256-ctr'));
      console.log(info.mode, info.name, info.nid, info.keyLength, info.blockSize, info.ivLength);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "11cb718141cbca65b08506d47467",
    "secret message",
    "true",
    "ctr aes-256-ctr 906 32 1 16"
  ]);
});

test("node:crypto supports AES-GCM cipher round trips", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require('node:crypto');
      const key = Buffer.alloc(32, 1);
      const iv = Buffer.alloc(12, 2);
      const aad = Buffer.from('aad');
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad);
      let encrypted = cipher.update('secret message', 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const tag = cipher.getAuthTag().toString('hex');
      console.log(encrypted);
      console.log(tag);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      console.log(decrypted);

      try {
        const bad = crypto.createDecipheriv('aes-256-gcm', key, iv);
        bad.setAAD(Buffer.from('wrong'));
        bad.setAuthTag(Buffer.from(tag, 'hex'));
        bad.update(encrypted, 'hex');
        bad.final();
      } catch (error) {
        console.log(error.code);
      }

      const info = crypto.getCipherInfo('aes-256-gcm');
      console.log(crypto.getCiphers().includes('aes-256-gcm'));
      console.log(info.mode, info.name, info.nid, info.keyLength, info.blockSize, info.ivLength);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "74b3aa3b2f23e190b6bfcfa93bc2",
    "40d06704581b1c050fab0a38ea619fa7",
    "secret message",
    "ERR_OSSL_BAD_DECRYPT",
    "true",
    "gcm id-aes256-gcm 901 32 1 12"
  ]);
});

test("node:crypto supports HMAC, randomFill, and timingSafeEqual", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const hmac = crypto.createHmac("sha256", "secret").update("hello").digest("hex");
      const buffer = Buffer.alloc(8);
      crypto.randomFillSync(buffer, 2, 4);
      crypto.randomFill(Buffer.alloc(4), (error, filled) => {
        const typed = new Uint16Array(4);
        const returned = crypto.getRandomValues(typed);
        console.log(hmac);
        console.log(buffer.slice(2, 6).some(byte => byte !== 0));
        console.log(error === null, filled.length);
        console.log(returned === typed, typed.some(value => value !== 0));
        try {
          crypto.getRandomValues(new Float32Array(1));
        } catch (typeError) {
          console.log(typeError.name);
        }
        try {
          crypto.getRandomValues(new Uint8Array(65537));
        } catch (quotaError) {
          console.log(quotaError.name);
        }
        console.log(crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("same")));
        const timingDescriptor = Object.getOwnPropertyDescriptor(crypto, "timingSafeEqual");
        console.log(crypto.timingSafeEqual.name === "", crypto.timingSafeEqual.length, Object.hasOwn(crypto.timingSafeEqual, "prototype"), timingDescriptor.enumerable, timingDescriptor.configurable, timingDescriptor.writable);
        console.log(typeof crypto.webcrypto === "object" || typeof crypto.webcrypto === "undefined");
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b",
    "true",
    "true 4",
    "true true",
    "TypeMismatchError",
    "QuotaExceededError",
    "true",
    "true 0 false true true true",
    "true"
  ]);
});

test("node:crypto supports PBKDF2 and KeyObject HMAC inputs", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const sync = crypto.pbkdf2Sync("password", "salt", 1000, 32, "sha256");
      const secret = crypto.createSecretKey(Buffer.from("secret"));
      console.log(sync.toString("hex"));
      console.log(crypto.createHmac("sha256", secret).update("hello").digest("hex"));
      crypto.pbkdf2(Buffer.from("password"), Buffer.from("salt"), 2, 16, "sha1", (error, key) => {
        console.log(error === null, key.toString("hex"));
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "632c2812e46d4604102ba7618e9d6d7d2f8128f6266b4a03264d2a0460b7dcb3",
    "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b",
    "true ea6c014dc72d6f8ccd1ed92ace1d41f0"
  ]);
});

test("node:crypto supports HKDF and common OpenSSL probe helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const sync = crypto.hkdfSync("sha256", "secret", "salt", "info", 32);
      console.log(Object.prototype.toString.call(sync), Buffer.from(sync).toString("hex"));
      crypto.hkdf("sha1", Buffer.from("secret"), Buffer.alloc(0), Buffer.alloc(0), 16, (error, key) => {
        console.log(error === null, Object.prototype.toString.call(key), Buffer.from(key).toString("hex"));
        console.log(crypto.hash("sha256", "hello repl", "hex"));
        console.log(crypto.getCipherInfo("aes-256-cbc").keyLength);
        console.log(crypto.getCipherInfo("aes-256-cbc", { keyLength: 31 }));
        console.log(Array.isArray(crypto.getCurves()), crypto.getFips(), crypto.fips, crypto.secureHeapUsed().total);
        crypto.setFips(0);
        try {
          crypto.setEngine("missing", crypto.constants.ENGINE_METHOD_ALL);
        } catch (error) {
          console.log(error.code, crypto.constants.ENGINE_METHOD_RSA, crypto.constants.ENGINE_METHOD_ALL);
        }
        for (const action of [
          () => crypto.setEngine(),
          () => crypto.setEngine("missing", "bad")
        ]) {
          try {
            action();
          } catch (error) {
            console.log(error.constructor.name, error.code);
          }
        }
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "[object ArrayBuffer] f6d2fcc47cb939deafe3853a1e641a27e6924aff7a63d09cb04ccfffbe4776ef",
    "true [object ArrayBuffer] 7241733aa88c791e52976d56e33a5ccc",
    "ba4d55a8197c018035c8b1bc6e6866c396f16a91fbce926ad26236c298468aa0",
    "32",
    "undefined",
    "true 0 0 0",
    "ERR_CRYPTO_ENGINE_UNKNOWN 1 65535",
    "TypeError ERR_INVALID_ARG_TYPE",
    "TypeError ERR_INVALID_ARG_TYPE"
  ]);
});

test("node:crypto supports scrypt and scryptSync", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const sync = crypto.scryptSync("password", "salt", 32, { N: 16, r: 1, p: 1 });
      const aliasSync = crypto.scryptSync("password", "salt", 32, {
        cost: 32,
        blockSize: 2,
        parallelization: 1,
      });

      console.log(sync.toString("hex"));
      console.log(aliasSync.toString("hex"));
      crypto.scrypt("password", "salt", 16, { N: 16, r: 1, p: 1 }, (error, key) => {
        console.log(error === null, key.toString("hex"));
        try {
          crypto.scryptSync("password", "salt", 16, { N: 15 });
        } catch (invalidError) {
          console.log(invalidError.code);
        }
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "45133c3dfba48c82235df51a5349924110eee893752f0d4168d2e2aee5722d82",
    "ee2154d72b1d19097fc86f84cf625f5c3e0262c0fdde7163714da53506358d04",
    "true 45133c3dfba48c82235df51a53499241",
    "ERR_CRYPTO_INVALID_SCRYPT_PARAMS"
  ]);
});

test("node:crypto supports prime probe helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      const dataView = new DataView(Uint8Array.from([17]).buffer);
      console.log("checks", [
        crypto.checkPrimeSync(Buffer.from([4])),
        crypto.checkPrimeSync(Buffer.from([5])),
        crypto.checkPrimeSync(new Uint8Array([17])),
        crypto.checkPrimeSync(dataView),
        crypto.checkPrimeSync(5n),
        crypto.checkPrimeSync(Buffer.alloc(0)),
        crypto.checkPrimeSync(Buffer.from([5]), { checks: 0 })
      ].join(":"));

      const generated = crypto.generatePrimeSync(8);
      const generatedBigInt = crypto.generatePrimeSync(8, { bigint: true });
      const safePrime = crypto.generatePrimeSync(8, { safe: true, bigint: true });
      const constrained = crypto.generatePrimeSync(8, {
        add: Buffer.from([3]),
        rem: Buffer.from([2]),
        bigint: true
      });
      console.log("generated", [
        Object.prototype.toString.call(generated),
        generated.byteLength,
        crypto.checkPrimeSync(generated),
        typeof generatedBigInt,
        crypto.checkPrimeSync(generatedBigInt),
        typeof safePrime,
        crypto.checkPrimeSync(safePrime),
        crypto.checkPrimeSync((safePrime - 1n) / 2n),
        constrained % 3n,
        crypto.checkPrimeSync(constrained)
      ].join(":"));

      let pending = 2;
      const maybePrintErrors = () => {
        pending -= 1;
        if (pending !== 0) return;

        const rows = [
          ["candidate-number", () => crypto.checkPrimeSync(5)],
          ["options-null", () => crypto.checkPrimeSync(Buffer.from([5]), null)],
          ["checks-string", () => crypto.checkPrimeSync(Buffer.from([5]), { checks: "1" })],
          ["checks-negative", () => crypto.checkPrimeSync(Buffer.from([5]), { checks: -1 })],
          ["size-zero", () => crypto.generatePrimeSync(0)],
          ["size-one", () => crypto.generatePrimeSync(1)],
          ["size-string", () => crypto.generatePrimeSync("8")],
          ["bigint-string", () => crypto.generatePrimeSync(8, { bigint: "yes" })],
          ["add-number", () => crypto.generatePrimeSync(8, { add: 3 })],
          ["check-callback-missing", () => crypto.checkPrime(Buffer.from([5]))],
          ["generate-callback-missing", () => crypto.generatePrime(8)]
        ].map(([label, action]) => {
          try {
            action();
            return label + ":ok";
          } catch (error) {
            return [label, error.name, error.code].join(":");
          }
        });
        console.log("errors", rows.join("|"));
      };
      crypto.checkPrime(Buffer.from([5]), (error, value) => {
        console.log("async-check", error, value);
        maybePrintErrors();
      });
      crypto.generatePrime(8, { bigint: true }, (error, value) => {
        console.log("async-generate", error, typeof value, crypto.checkPrimeSync(value));
        maybePrintErrors();
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "checks false:true:true:true:true:false:true",
    "generated [object ArrayBuffer]:1:true:bigint:true:bigint:true:true:2:true",
    "async-check undefined true",
    "async-generate undefined bigint true",
    "errors candidate-number:TypeError:ERR_INVALID_ARG_TYPE|options-null:TypeError:ERR_INVALID_ARG_TYPE|checks-string:TypeError:ERR_INVALID_ARG_TYPE|checks-negative:RangeError:ERR_OUT_OF_RANGE|size-zero:RangeError:ERR_OUT_OF_RANGE|size-one:Error:ERR_OSSL_BN_BITS_TOO_SMALL|size-string:TypeError:ERR_INVALID_ARG_TYPE|bigint-string:TypeError:ERR_INVALID_ARG_TYPE|add-number:TypeError:ERR_INVALID_ARG_TYPE|check-callback-missing:TypeError:ERR_INVALID_ARG_TYPE|generate-callback-missing:TypeError:ERR_INVALID_ARG_TYPE"
  ]);
});

test("node:crypto exposes asymmetric probe helpers with stable unsupported errors", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const crypto = require("node:crypto");
      console.log(
        typeof crypto.generateKeyPair,
        typeof crypto.generateKeyPairSync,
        typeof crypto.createPrivateKey,
        typeof crypto.createSign,
        typeof crypto.Sign,
        typeof crypto.publicEncrypt,
        typeof crypto.argon2,
        typeof crypto.argon2Sync,
        typeof crypto.encapsulate,
        typeof crypto.decapsulate
      );
      console.log(crypto.argon2.length, crypto.argon2Sync.length, crypto.encapsulate.length, crypto.decapsulate.length);
      crypto.generateKeyPair("rsa", { modulusLength: 2048 }, (error) => {
        console.log("async", error.code);
      });
      crypto.argon2("argon2id", {}, (error) => {
        console.log("argon2", error.code);
      });
      crypto.encapsulate("key", (error) => {
        console.log("encapsulate", error.code);
      });
      try {
        crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      } catch (error) {
        console.log("sync", error.code);
      }
      try {
        crypto.argon2Sync("argon2id", {});
      } catch (error) {
        console.log("argon2Sync", error.code);
      }
      try {
        crypto.decapsulate("key", "ciphertext");
      } catch (error) {
        console.log("decapsulate", error.code);
      }
      try {
        crypto.createSign("RSA-SHA256").sign("private-key");
      } catch (error) {
        console.log("sign", error.code);
      }
      console.log(
        crypto.constants.RSA_PKCS1_PADDING,
        crypto.constants.RSA_PSS_SALTLEN_AUTO,
        crypto.constants.POINT_CONVERSION_UNCOMPRESSED
      );
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function function function function function function function function function function",
    "3 2 2 3",
    "sync ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "argon2Sync ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "decapsulate ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "sign ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "1 -2 4",
    "async ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "argon2 ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED",
    "encapsulate ERR_OPENCONTAINERS_CRYPTO_UNSUPPORTED"
  ]);
});

test("node:vm supports basic context scripts", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const sandbox = {
      console,
      result: null,
    };

    vm.createContext(sandbox);

    const script = new vm.Script(\`
      const x = 21;
      result = x * 2;
      console.log("inside vm:", result);
    \`);

    script.runInContext(sandbox);

    console.log("outside vm result:", sandbox.result);
    console.log("is context:", vm.isContext(sandbox));
    const contextProbe = [
      "typeof process",
      "typeof Buffer",
      "typeof Object",
      "typeof Function",
      "(globalThis === this)",
      "Function(\\"return typeof process + ':' + (globalThis === this)\\")()"
    ].join(" + ':' + ");
    console.log("context globals:", vm.runInContext(contextProbe, sandbox));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "inside vm: 42",
    "outside vm result: 42",
    "is context: true",
    "context globals: undefined:undefined:function:function:true:undefined:true"
  ]);
});

test("node:vm supports runInNewContext and named imports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm, { Script, runInNewContext, runInThisContext } from "node:vm";

    console.log(["compileFunction", "runInContext", "runInNewContext", "runInThisContext"].map((name) => name + ":" + vm[name].name + ":" + vm[name].length).join("|"));
    const sandbox = { value: 7 };
    console.log(runInNewContext("value * 6", sandbox));
    console.log(new Script("value += 1; value").runInNewContext(sandbox));
    console.log(sandbox.value);
    console.log(typeof runInThisContext("Buffer"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "compileFunction:compileFunction:2|runInContext:runInContext:3|runInNewContext:runInNewContext:3|runInThisContext:runInThisContext:2",
    "42",
    "8",
    "8",
    "function"
  ]);
});

test("node:vm supports compileFunction with parsing contexts", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const sandbox = { multiplier: 6 };
    vm.createContext(sandbox);
    const fn = vm.compileFunction("return value * multiplier;", ["value"], {
      parsingContext: sandbox,
    });

    console.log(fn(7));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "42\n");
});

test("node:vm supports cached data probe APIs", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const script = new vm.Script("40 + 2", { filename: "cached.js", produceCachedData: true });
    const cachedData = script.createCachedData();
    const reused = new vm.Script("40 + 2", { cachedData });
    const fn = vm.compileFunction("return value + 1;", ["value"], { produceCachedData: true });
    const reusedFn = vm.compileFunction("return value + 1;", ["value"], { cachedData: fn.cachedData });

    console.log(script.runInThisContext(), Buffer.isBuffer(cachedData), cachedData.length > 0);
    console.log(script.cachedDataProduced, Buffer.isBuffer(script.cachedData), script.cachedData.length > 0);
    console.log(reused.cachedDataRejected);
    console.log(fn(41), Buffer.isBuffer(fn.cachedData), fn.cachedData.length > 0);
    console.log(reusedFn.cachedDataRejected, reusedFn(41));

    try {
      new vm.Script("1", { cachedData: "nope" });
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "42 true true",
    "true true true",
    "false",
    "42 true true",
    "false 42",
    "ERR_INVALID_ARG_TYPE"
  ]);
});

test("node:vm exposes constants and measureMemory probe helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm, { constants, measureMemory } from "node:vm";

    const memory = await measureMemory({ mode: "summary", execution: "eager" });
    console.log(Object.keys(vm).join(","));
    console.log(["createScript", "measureMemory", "Module"].map((name) => {
      const value = vm[name];
      const descriptor = Object.getOwnPropertyDescriptor(value, "prototype");
      return [name, value.name, value.length, Object.hasOwn(value, "prototype"), descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, Object.getOwnPropertyNames(descriptor?.value ?? {}).join(",")].join(":");
    }).join("|"));
    console.log(["Module", "SourceTextModule", "SyntheticModule"].map((name) => [
      name,
      Object.getOwnPropertyNames(vm[name].prototype).join(","),
      Object.keys(vm[name].prototype).join(",") || "<none>",
      Object.getPrototypeOf(vm[name].prototype)?.constructor?.name
    ].join(":")).join("|"));
    console.log(["Module", "SourceTextModule", "SyntheticModule"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(vm[name], "prototype");
      return [name, vm[name].name, vm[name].length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(vm[name], "prototype")].join(":");
    }).join("|"));
    const sourceModule = new vm.SourceTextModule("export const ok = true;");
    const syntheticModule = new vm.SyntheticModule(["ok"], function () {});
    console.log("module instances", [
      Object.getOwnPropertyNames(sourceModule).join(",") || "<none>",
      Object.keys(sourceModule).join(",") || "<none>",
      Object.getOwnPropertyNames(syntheticModule).join(",") || "<none>",
      Object.keys(syntheticModule).join(",") || "<none>",
      syntheticModule.status,
      sourceModule.status
    ].join(":"));
    console.log(typeof constants.USE_MAIN_CONTEXT_DEFAULT_LOADER);
    console.log(typeof constants.DONT_CONTEXTIFY);
    console.log(vm.constants === constants);
    console.log(typeof memory.total.jsMemoryEstimate, Array.isArray(memory.total.jsMemoryRange));
    console.log(typeof memory.WebAssembly.code, typeof memory.WebAssembly.metadata);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "Script,createContext,createScript,runInContext,runInNewContext,runInThisContext,isContext,compileFunction,measureMemory,constants,Module,SourceTextModule,SyntheticModule",
    "createScript:createScript:2:true:false:false:true:constructor|measureMemory:measureMemory:0:true:false:false:true:constructor|Module:Module:1:true:false:false:false:constructor,identifier,context,namespace,status,error,link,evaluate",
    "Module:constructor,identifier,context,namespace,status,error,link,evaluate:<none>:Object|SourceTextModule:constructor,linkRequests,instantiate,dependencySpecifiers,moduleRequests,status,error,hasAsyncGraph,hasTopLevelAwait,createCachedData:<none>:Module|SyntheticModule:constructor,link,setExport:<none>:Module",
    "Module:Module:1:false:false:false:true|SourceTextModule:SourceTextModule:1:false:false:false:true|SyntheticModule:SyntheticModule:2:false:false:false:true",
    "module instances <none>:<none>:<none>:<none>:linked:unlinked",
    "symbol",
    "symbol",
    "true",
    "number true",
    "number number"
  ]);
});

test("node:vm supports SyntheticModule exports", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const mod = new vm.SyntheticModule(["name", "answer"], function () {
      this.setExport("name", "OpenContainers");
      this.setExport("answer", 42);
    }, {
      identifier: "/workspace/generated.js",
    });

    await mod.link(() => {});
    const result = await mod.evaluate();

    console.log(mod.status);
    console.log(result.status);
    console.log(mod.namespace.name, mod.namespace.answer);
    console.log(Object.prototype.toString.call(mod.namespace));

    try {
      mod.setExport("missing", true);
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "evaluated",
    "evaluated",
    "OpenContainers 42",
    "[object Module]",
    "ERR_VM_MODULE_NOT_MODULE"
  ]);
});

test("node:vm supports SourceTextModule linking and namespaces", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const dependency = new vm.SyntheticModule(["value"], function () {
      this.setExport("value", 21);
    }, {
      identifier: "/workspace/dependency.js",
    });

    const mod = new vm.SourceTextModule(\`
      import { value } from "dependency";
      export const doubled = value * 2;
      export default doubled + 1;
    \`, {
      identifier: "/workspace/source.js",
      initializeImportMeta(meta) {
        meta.extra = "initialized";
      }
    });

    console.log(mod.status);
    console.log(mod.dependencySpecifiers.join(","));

    await mod.link((specifier, referencingModule) => {
      console.log("link", specifier, referencingModule.identifier);
      return dependency;
    });
    await mod.evaluate();

    console.log(dependency.status, mod.status);
    console.log(mod.namespace.doubled, mod.namespace.default);
    console.log(Object.prototype.toString.call(mod.namespace));

    try {
      await new vm.SourceTextModule("export const ok = true;").evaluate();
    } catch (error) {
      console.log(error.code);
    }

    const invalid = new vm.SourceTextModule(\`import "missing";\`);
    try {
      await invalid.link(() => ({}));
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "unlinked",
    "dependency",
    "link dependency /workspace/source.js",
    "evaluated evaluated",
    "42 43",
    "[object Module]",
    "ERR_VM_MODULE_STATUS",
    "ERR_VM_MODULE_NOT_MODULE"
  ]);
});

test("node:vm supports SourceTextModule dynamic import callbacks", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import vm from "node:vm";

    const dependency = new vm.SyntheticModule(["value"], function () {
      this.setExport("value", 13);
    });

    const mod = new vm.SourceTextModule(\`
      const dependency = await import("dynamic-dependency");
      export const value = dependency.value + 2;
    \`, {
      importModuleDynamically(specifier, referencingModule) {
        console.log("dynamic", specifier, referencingModule.status);
        return dependency;
      }
    });

    await mod.link(() => {});
    await mod.evaluate();

    console.log(dependency.status, mod.status);
    console.log(mod.namespace.value);

    const missing = new vm.SourceTextModule(\`
      export const value = (await import("missing")).value;
    \`);
    await missing.link(() => {});
    try {
      await missing.evaluate();
    } catch (error) {
      console.log(error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "dynamic dynamic-dependency evaluating",
    "evaluated evaluated",
    "15",
    "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING"
  ]);
});

test("node:zlib hides unsupported promises submodule and supports promisified callbacks", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { builtinModules, createRequire, isBuiltin } from "node:module";
    import { promisify } from "node:util";
    import zlib from "node:zlib";

    const require = createRequire(import.meta.url);

    async function rejected(label, run) {
      try {
        await run();
        console.log(label, "ok");
      } catch (error) {
        console.log(label, error.code);
      }
    }

    await rejected("require", () => Promise.resolve().then(() => require("node:zlib/promises")));
    await rejected("import", () => import("node:zlib/promises"));
    console.log("module", isBuiltin("zlib/promises"), isBuiltin("node:zlib/promises"), builtinModules.includes("zlib/promises"));
    console.log("zlib promises", Object.hasOwn(zlib, "promises"), Object.getOwnPropertyDescriptor(zlib, "promises") === undefined, zlib.promises === undefined);

    const input = "hello repl ".repeat(1000);
    const gzipAsync = promisify(zlib.gzip);
    const gunzipAsync = promisify(zlib.gunzip);
    const deflateAsync = promisify(zlib.deflate);
    const inflateAsync = promisify(zlib.inflate);
    const deflateRawAsync = promisify(zlib.deflateRaw);
    const inflateRawAsync = promisify(zlib.inflateRaw);
    const unzipAsync = promisify(zlib.unzip);
    const brotliCompressAsync = promisify(zlib.brotliCompress);
    const brotliDecompressAsync = promisify(zlib.brotliDecompress);

    const gzip = await gzipAsync(input);
    const gunzip = await gunzipAsync(gzip);

    console.log("gzip size ok:", gzip.length > 0);
    console.log("gunzip matches:", gunzip.toString() === input);

    const deflated = await deflateAsync(input);
    const inflated = await inflateAsync(deflated);

    console.log("deflate size ok:", deflated.length > 0);
    console.log("inflate matches:", inflated.toString() === input);

    const raw = await deflateRawAsync(input);
    const unraw = await inflateRawAsync(raw);
    const unzipped = await unzipAsync(gzip);

    console.log("raw deflate size ok:", raw.length > 0);
    console.log("raw inflate matches:", unraw.toString() === input);
    console.log("unzip matches:", unzipped.toString() === input);

    const brotli = await brotliCompressAsync(input);
    const unbrotli = await brotliDecompressAsync(brotli);

    console.log("brotli size ok:", brotli.length > 0);
    console.log("brotli matches:", unbrotli.toString() === input);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "require ERR_UNKNOWN_BUILTIN_MODULE",
    "import ERR_UNKNOWN_BUILTIN_MODULE",
    "module false false false",
    "zlib promises false true true",
    "gzip size ok: true",
    "gunzip matches: true",
    "deflate size ok: true",
    "inflate matches: true",
    "raw deflate size ok: true",
    "raw inflate matches: true",
    "unzip matches: true",
    "brotli size ok: true",
    "brotli matches: true"
  ]);
});

test("node:zlib callback APIs keep the process alive", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";

    const input = "callback zlib ".repeat(200);
    zlib.gzip(input, (error, gzip) => {
      if (error) throw error;
      zlib.gunzip(gzip, (error, gunzip) => {
        if (error) throw error;
        console.log(gunzip.toString() === input);
      });
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\n");
});

test("node:zlib exposes crc32 with Node-compatible inputs and seed validation", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";

    const text = "hello";
    const buffer = Buffer.from(text);
    const typed = new Uint8Array(buffer);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    console.log(zlib.crc32(text));
    console.log(zlib.crc32(buffer));
    console.log(zlib.crc32(typed));
    console.log(zlib.crc32(view));
    console.log(zlib.crc32(text, 1));
    console.log(zlib.crc32(""));

    for (const [name, run] of [
      ["data", () => zlib.crc32(undefined)],
      ["arraybuffer", () => zlib.crc32(new ArrayBuffer(3))],
      ["seed-type", () => zlib.crc32("x", null)],
      ["seed-range", () => zlib.crc32("x", -1)],
      ["seed-integer", () => zlib.crc32("x", 1.2)]
    ]) {
      try {
        run();
      } catch (error) {
        console.log(name, error.code);
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "907060870",
    "907060870",
    "907060870",
    "907060870",
    "191926070",
    "0",
    "data ERR_INVALID_ARG_TYPE",
    "arraybuffer ERR_INVALID_ARG_TYPE",
    "seed-type ERR_INVALID_ARG_TYPE",
    "seed-range ERR_OUT_OF_RANGE",
    "seed-integer ERR_OUT_OF_RANGE"
  ]);
});

test("node:zlib exposes zstd APIs with host-backed compression when available", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";
    import { Readable, Writable, pipeline } from "node:stream";
    import { promisify } from "node:util";

    const input = "zstd compression ".repeat(200);
    const zstdCompressAsync = promisify(zlib.zstdCompress);
    const zstdDecompressAsync = promisify(zlib.zstdDecompress);

    function zstdCallback(input) {
      return new Promise((resolve, reject) => {
        zlib.zstdCompress(input, (error, output) => error ? reject(error) : resolve(output));
      });
    }

    function collect() {
      const chunks = [];
      const writable = new Writable({
        write(chunk) {
          chunks.push(Buffer.from(chunk));
        }
      });
      return { chunks, writable };
    }

    function pipe(...streams) {
      return new Promise((resolve, reject) => {
        pipeline(...streams, (error) => error ? reject(error) : resolve());
      });
    }

    console.log(typeof zlib.zstdCompress, typeof zlib.zstdDecompress, typeof zlib.zstdCompressSync, typeof zlib.zstdDecompressSync);
    console.log(zlib.createZstdCompress() instanceof zlib.ZstdCompress, zlib.createZstdDecompress() instanceof zlib.ZstdDecompress);

    const sync = zlib.zstdCompressSync(input);
    console.log("sync", zlib.zstdDecompressSync(sync).toString() === input);

    const callback = await zstdCallback(input);
    const promise = await zstdCompressAsync(input);
    console.log("async", zlib.zstdDecompressSync(callback).toString() === input, (await zstdDecompressAsync(promise)).toString() === input);

    const sink = collect();
    await pipe(Readable.from([input]), zlib.createZstdCompress(), sink.writable);
    const streamCompressed = Buffer.concat(sink.chunks);
    console.log("stream", zlib.zstdDecompressSync(streamCompressed).toString() === input);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function function function function",
    "true true",
    "sync true",
    "async true true",
    "stream true"
  ]);
});

test("node:zlib forwards compression options through async APIs and streams", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";
    import { Readable, Writable, pipeline } from "node:stream";
    import { promisify } from "node:util";

    const gzipAsync = promisify(zlib.gzip);
    const gunzipAsync = promisify(zlib.gunzip);

    function gzipCallback(input, options) {
      return new Promise((resolve, reject) => {
        zlib.gzip(input, options, (error, output) => error ? reject(error) : resolve(output));
      });
    }

    function collect() {
      const chunks = [];
      const writable = new Writable({
        write(chunk) {
          chunks.push(Buffer.from(chunk));
        }
      });
      return { chunks, writable };
    }

    function pipe(...streams) {
      return new Promise((resolve, reject) => {
        pipeline(...streams, (error) => error ? reject(error) : resolve());
      });
    }

    const input = "zlib options ".repeat(5000);

    const promisifyStored = await gzipAsync(input, { level: 0 });
    const promisifyCompressed = await gzipAsync(input, { level: 9 });
    console.log("promisify level:", promisifyStored.length > promisifyCompressed.length, (await gunzipAsync(promisifyCompressed)).toString() === input);

    const callbackStored = await gzipCallback(input, { level: 0 });
    const callbackCompressed = await gzipCallback(input, { level: 9 });
    console.log("callback level:", callbackStored.length > callbackCompressed.length, zlib.gunzipSync(callbackCompressed).toString() === input);

    const streamStoredSink = collect();
    await pipe(Readable.from([input]), zlib.createGzip({ level: 0 }), streamStoredSink.writable);
    const streamStored = Buffer.concat(streamStoredSink.chunks);

    const streamCompressedSink = collect();
    await pipe(Readable.from([input]), zlib.createGzip({ level: 9 }), streamCompressedSink.writable);
    const streamCompressed = Buffer.concat(streamCompressedSink.chunks);
    console.log("stream level:", streamStored.length > streamCompressed.length, zlib.gunzipSync(streamCompressed).toString() === input);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "promisify level: true true",
    "callback level: true true",
    "stream level: true true"
  ]);
});

test("node:zlib validates classic compression options synchronously", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";

    const paramsProbe = zlib.createDeflate();
    const cases = [
      ["createGzip-level-high", () => zlib.createGzip({ level: 99 }), "ERR_OUT_OF_RANGE", "options.level"],
      ["createGzip-level-low", () => zlib.createGzip({ level: -2 }), "ERR_OUT_OF_RANGE", "options.level"],
      ["createGzip-windowBits-low", () => zlib.createGzip({ windowBits: 7 }), "ERR_OUT_OF_RANGE", "options.windowBits"],
      ["createDeflateRaw-windowBits-low", () => zlib.createDeflateRaw({ windowBits: 7 }), "ERR_OUT_OF_RANGE", "options.windowBits"],
      ["createGzip-memLevel-high", () => zlib.createGzip({ memLevel: 10 }), "ERR_OUT_OF_RANGE", "options.memLevel"],
      ["createGzip-strategy-high", () => zlib.createGzip({ strategy: 5 }), "ERR_OUT_OF_RANGE", "options.strategy"],
      ["createGzip-level-type", () => zlib.createGzip({ level: "9" }), "ERR_INVALID_ARG_TYPE", "options.level"],
      ["gzip-callback-missing", () => zlib.gzip(Buffer.from("x"), {}), "ERR_INVALID_ARG_TYPE", "callback"],
      ["gzip-callback-type", () => zlib.gzip(Buffer.from("x"), {}, {}), "ERR_INVALID_ARG_TYPE", "callback"],
      ["gzip-invalid-level-callback", () => zlib.gzip(Buffer.from("x"), { level: 99 }, () => {}), "ERR_OUT_OF_RANGE", "options.level"],
      ["gzip-invalid-level-missing-callback", () => zlib.gzip(Buffer.from("x"), { level: "9" }), "ERR_INVALID_ARG_TYPE", "options.level"],
      ["params-level-type", () => paramsProbe.params("1", zlib.constants.Z_DEFAULT_STRATEGY, () => {}), "ERR_INVALID_ARG_TYPE", '"level"'],
      ["params-level-high", () => paramsProbe.params(99, zlib.constants.Z_DEFAULT_STRATEGY, () => {}), "ERR_OUT_OF_RANGE", '"level"'],
      ["params-strategy-type", () => paramsProbe.params(zlib.constants.Z_DEFAULT_COMPRESSION, "0", () => {}), "ERR_INVALID_ARG_TYPE", '"strategy"'],
      ["params-strategy-high", () => paramsProbe.params(zlib.constants.Z_DEFAULT_COMPRESSION, 99, () => {}), "ERR_OUT_OF_RANGE", '"strategy"'],
      ["flush-kind-string", () => paramsProbe.flush("bad", () => {}), "ERR_INVALID_ARG_TYPE", '"chunk"'],
      ["flush-kind-high", () => paramsProbe.flush(999, () => {}), "ERR_INVALID_ARG_TYPE", '"chunk"'],
    ];

    for (const [label, action, code, text] of cases) {
      try {
        action();
        console.log(label, "ok");
      } catch (error) {
        console.log(label, error.name, error.code, error.code === code, error.message.includes(text));
      }
    }

    console.log("params-callback-missing", paramsProbe.params(zlib.constants.Z_BEST_SPEED, zlib.constants.Z_DEFAULT_STRATEGY));
    console.log("brotli", zlib.createBrotliCompress({ level: 99, windowBits: 7, memLevel: 10, strategy: 5 }).constructor.name);
    console.log("zstd", zlib.createZstdCompress({ level: 99, windowBits: 7, memLevel: 10, strategy: 5 }).constructor.name);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "createGzip-level-high RangeError ERR_OUT_OF_RANGE true true",
    "createGzip-level-low RangeError ERR_OUT_OF_RANGE true true",
    "createGzip-windowBits-low RangeError ERR_OUT_OF_RANGE true true",
    "createDeflateRaw-windowBits-low RangeError ERR_OUT_OF_RANGE true true",
    "createGzip-memLevel-high RangeError ERR_OUT_OF_RANGE true true",
    "createGzip-strategy-high RangeError ERR_OUT_OF_RANGE true true",
    "createGzip-level-type TypeError ERR_INVALID_ARG_TYPE true true",
    "gzip-callback-missing TypeError ERR_INVALID_ARG_TYPE true true",
    "gzip-callback-type TypeError ERR_INVALID_ARG_TYPE true true",
    "gzip-invalid-level-callback RangeError ERR_OUT_OF_RANGE true true",
    "gzip-invalid-level-missing-callback TypeError ERR_INVALID_ARG_TYPE true true",
    "params-level-type TypeError ERR_INVALID_ARG_TYPE true true",
    "params-level-high RangeError ERR_OUT_OF_RANGE true true",
    "params-strategy-type TypeError ERR_INVALID_ARG_TYPE true true",
    "params-strategy-high RangeError ERR_OUT_OF_RANGE true true",
    "flush-kind-string TypeError ERR_INVALID_ARG_TYPE true true",
    "flush-kind-high TypeError ERR_INVALID_ARG_TYPE true true",
    "params-callback-missing undefined",
    "brotli BrotliCompress",
    "zstd ZstdCompress"
  ]);
});

test("node:zlib exposes constants and sync helpers in Node-backed hosts", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";

    const input = "sync zlib ".repeat(200);
    const gzip = zlib.gzipSync(input);
    const deflated = zlib.deflateSync(input);
    const raw = zlib.deflateRawSync(input);
    const brotli = zlib.brotliCompressSync(input);

    console.log(Object.keys(zlib).join(","));
    console.log(zlib.gunzipSync(gzip).toString() === input);
    console.log(zlib.inflateSync(deflated).toString() === input);
    console.log(zlib.inflateRawSync(raw).toString() === input);
    console.log(zlib.unzipSync(gzip).toString() === input);
    console.log(zlib.brotliDecompressSync(brotli).toString() === input);
    const descriptor = Object.getOwnPropertyDescriptor(zlib, "Z_NO_FLUSH");
    console.log(
      zlib.constants.Z_SYNC_FLUSH,
      typeof zlib.codes.Z_OK,
      zlib.createDeflateRaw() instanceof zlib.DeflateRaw,
      zlib.createUnzip() instanceof zlib.Unzip,
      zlib.Z_NO_FLUSH === zlib.constants.Z_NO_FLUSH,
      zlib.GZIP === zlib.constants.GZIP,
      zlib.ZSTD_COMPRESS === zlib.constants.ZSTD_COMPRESS,
      descriptor.enumerable,
      "BROTLI_PARAM_QUALITY" in zlib,
      zlib.constants.BROTLI_PARAM_QUALITY
    );
    const codeNames = ["-6", "-5", "-4", "-3", "-2", "-1", "0", "1", "2", "Z_OK", "Z_STREAM_END", "Z_NEED_DICT", "Z_ERRNO", "Z_STREAM_ERROR", "Z_DATA_ERROR", "Z_MEM_ERROR", "Z_BUF_ERROR", "Z_VERSION_ERROR"];
    const constantKeys = Object.keys(zlib.constants);
    const constantsWindow = constantKeys.slice(
      constantKeys.indexOf("DEFLATERAW"),
      constantKeys.indexOf("Z_DEFAULT_WINDOWBITS") + 1
    );
    const topLevelNames = Object.getOwnPropertyNames(zlib);
    const topLevelConstantsPrefix = topLevelNames.slice(
      topLevelNames.indexOf("codes") + 1,
      topLevelNames.indexOf("UNZIP") + 1
    );
    const topLevelZstdWindow = topLevelNames.slice(
      topLevelNames.indexOf("ZSTD_DECOMPRESS"),
      topLevelNames.indexOf("ZSTD_CLEVEL_DEFAULT") + 1
    );
    const descriptorSummary = Object.fromEntries(["codes", "constants", "createGzip"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(zlib, name);
      return [name, [descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value]];
    }));
    console.log("shape", JSON.stringify({
      descriptors: descriptorSummary,
      codesLength: Object.keys(zlib.codes).length,
      codes: Object.fromEntries(codeNames.map((name) => [name, zlib.codes[name]])),
      constantsProto: Object.getPrototypeOf(zlib.constants) === null,
      codesProto: Object.getPrototypeOf(zlib.codes) === Object.prototype,
      hasTreesConstant: Object.hasOwn(zlib.constants, "Z_TREES"),
      hasTreesTopLevel: Object.hasOwn(zlib, "Z_TREES")
    }));
    console.log("constants window", constantsWindow.join(","));
    console.log("top-level constants prefix", topLevelConstantsPrefix.join(","));
    console.log("top-level zstd window", topLevelZstdWindow.join(","));
    const promisesDescriptor = Object.getOwnPropertyDescriptor(zlib, "promises");
    console.log(
      Object.hasOwn(zlib, "default"),
      Object.keys(zlib).includes("default"),
      Object.hasOwn(zlib, "promises"),
      Object.keys(zlib).includes("promises"),
      promisesDescriptor === undefined,
      zlib.promises
    );
    console.log("gzip metadata", zlib.gzip.name, zlib.gzip.length, zlib.gzipSync.name, zlib.gzipSync.length, zlib.createGzip.name, zlib.createGzip.length);
    console.log("brotli metadata", zlib.brotliCompress.name, zlib.brotliCompress.length, zlib.brotliCompressSync.name, zlib.brotliCompressSync.length, zlib.createBrotliCompress.name, zlib.createBrotliCompress.length);
    console.log("zstd metadata", zlib.zstdCompress.name, zlib.zstdCompress.length, zlib.zstdCompressSync.name, zlib.zstdCompressSync.length, zlib.createZstdCompress.name, zlib.createZstdCompress.length);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "crc32,Deflate,Inflate,Gzip,Gunzip,DeflateRaw,InflateRaw,Unzip,BrotliCompress,BrotliDecompress,ZstdCompress,ZstdDecompress,deflate,deflateSync,gzip,gzipSync,deflateRaw,deflateRawSync,unzip,unzipSync,inflate,inflateSync,gunzip,gunzipSync,inflateRaw,inflateRawSync,brotliCompress,brotliCompressSync,brotliDecompress,brotliDecompressSync,zstdCompress,zstdCompressSync,zstdDecompress,zstdDecompressSync,createDeflate,createInflate,createDeflateRaw,createInflateRaw,createGzip,createGunzip,createUnzip,createBrotliCompress,createBrotliDecompress,createZstdCompress,createZstdDecompress,constants,codes",
    "true",
    "true",
    "true",
    "true",
    "true",
    "2 number true true true true true false false 1",
    "shape {\"descriptors\":{\"codes\":[true,false,false,\"object\"],\"constants\":[true,false,false,\"object\"],\"createGzip\":[true,true,false,\"function\"]},\"codesLength\":18,\"codes\":{\"0\":\"Z_OK\",\"1\":\"Z_STREAM_END\",\"2\":\"Z_NEED_DICT\",\"-6\":\"Z_VERSION_ERROR\",\"-5\":\"Z_BUF_ERROR\",\"-4\":\"Z_MEM_ERROR\",\"-3\":\"Z_DATA_ERROR\",\"-2\":\"Z_STREAM_ERROR\",\"-1\":\"Z_ERRNO\",\"Z_OK\":0,\"Z_STREAM_END\":1,\"Z_NEED_DICT\":2,\"Z_ERRNO\":-1,\"Z_STREAM_ERROR\":-2,\"Z_DATA_ERROR\":-3,\"Z_MEM_ERROR\":-4,\"Z_BUF_ERROR\":-5,\"Z_VERSION_ERROR\":-6},\"constantsProto\":true,\"codesProto\":true,\"hasTreesConstant\":false,\"hasTreesTopLevel\":false}",
    "constants window DEFLATERAW,INFLATERAW,UNZIP,BROTLI_DECODE,BROTLI_ENCODE,ZSTD_DECOMPRESS,ZSTD_COMPRESS,Z_MIN_WINDOWBITS,Z_MAX_WINDOWBITS,Z_DEFAULT_WINDOWBITS",
    "top-level constants prefix Z_NO_FLUSH,Z_PARTIAL_FLUSH,Z_SYNC_FLUSH,Z_FULL_FLUSH,Z_FINISH,Z_BLOCK,Z_OK,Z_STREAM_END,Z_NEED_DICT,Z_ERRNO,Z_STREAM_ERROR,Z_DATA_ERROR,Z_MEM_ERROR,Z_BUF_ERROR,Z_VERSION_ERROR,Z_NO_COMPRESSION,Z_BEST_SPEED,Z_BEST_COMPRESSION,Z_DEFAULT_COMPRESSION,Z_FILTERED,Z_HUFFMAN_ONLY,Z_RLE,Z_FIXED,Z_DEFAULT_STRATEGY,ZLIB_VERNUM,DEFLATE,INFLATE,GZIP,GUNZIP,DEFLATERAW,INFLATERAW,UNZIP",
    "top-level zstd window ZSTD_DECOMPRESS,ZSTD_COMPRESS,Z_MIN_WINDOWBITS,Z_MAX_WINDOWBITS,Z_DEFAULT_WINDOWBITS,Z_MIN_CHUNK,Z_MAX_CHUNK,Z_DEFAULT_CHUNK,Z_MIN_MEMLEVEL,Z_MAX_MEMLEVEL,Z_DEFAULT_MEMLEVEL,Z_MIN_LEVEL,Z_MAX_LEVEL,Z_DEFAULT_LEVEL,ZSTD_e_continue,ZSTD_e_flush,ZSTD_e_end,ZSTD_fast,ZSTD_dfast,ZSTD_greedy,ZSTD_lazy,ZSTD_lazy2,ZSTD_btlazy2,ZSTD_btopt,ZSTD_btultra,ZSTD_btultra2,ZSTD_c_compressionLevel,ZSTD_c_windowLog,ZSTD_c_hashLog,ZSTD_c_chainLog,ZSTD_c_searchLog,ZSTD_c_minMatch,ZSTD_c_targetLength,ZSTD_c_strategy,ZSTD_c_enableLongDistanceMatching,ZSTD_c_ldmHashLog,ZSTD_c_ldmMinMatch,ZSTD_c_ldmBucketSizeLog,ZSTD_c_ldmHashRateLog,ZSTD_c_contentSizeFlag,ZSTD_c_checksumFlag,ZSTD_c_dictIDFlag,ZSTD_c_nbWorkers,ZSTD_c_jobSize,ZSTD_c_overlapLog,ZSTD_d_windowLogMax,ZSTD_CLEVEL_DEFAULT",
    "false false false false true undefined",
    "gzip metadata asyncBufferWrapper 3 syncBufferWrapper 2 value 1",
    "brotli metadata asyncBufferWrapper 3 syncBufferWrapper 2 value 1",
    "zstd metadata asyncBufferWrapper 3 syncBufferWrapper 2 value 1"
  ]);
});

test("node:zlib exposes transform stream constructors and factories", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import zlib from "node:zlib";
    import { Readable, Writable, pipeline } from "node:stream";

    function collect() {
      const chunks = [];
      const writable = new Writable({
        write(chunk) {
          chunks.push(Buffer.from(chunk));
        }
      });
      return { chunks, writable };
    }

    function pipe(...streams) {
      return new Promise((resolve, reject) => {
        pipeline(...streams, (error) => error ? reject(error) : resolve());
      });
    }

    const input = "stream zlib ".repeat(500);
    const gzipSink = collect();
    const gzipStream = zlib.createGzip();
    await pipe(Readable.from([input.slice(0, 100), input.slice(100)]), gzipStream, gzipSink.writable);
    const gzip = Buffer.concat(gzipSink.chunks);
    console.log("gzip", gzip.length > 0, zlib.createGzip() instanceof zlib.Gzip, gzipStream.bytesWritten === Buffer.byteLength(input));

    const probe = zlib.createGzip();
    probe.write("abc");
    console.log("probe before reset", probe.bytesWritten, typeof probe.flush, typeof probe.params, typeof probe.reset, typeof probe.close);
    probe.reset();
    console.log("probe after reset", probe.bytesWritten);
    await new Promise((resolve, reject) => probe.flush((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => probe.params(zlib.constants.Z_BEST_SPEED, zlib.constants.Z_DEFAULT_STRATEGY, (error) => error ? reject(error) : resolve()));
    await new Promise((resolve) => probe.close(resolve));
    console.log("probe closed", probe.destroyed || probe.closed);

    const flushProbe = zlib.createGzip();
    const flushChunks = [];
    flushProbe.on("data", (chunk) => flushChunks.push(Buffer.from(chunk)));
    flushProbe.write("abc");
    const flushSummary = await new Promise((resolve, reject) => {
      flushProbe.flush(zlib.constants.Z_SYNC_FLUSH, (error) => {
        if (error) reject(error);
        else resolve([flushChunks.length > 0, Buffer.concat(flushChunks).length > 0].join(":"));
      });
    });
    flushProbe.end("def");
    await new Promise((resolve, reject) => {
      flushProbe.on("error", reject);
      flushProbe.on("end", resolve);
    });
    const flushOutput = Buffer.concat(flushChunks);
    console.log("flush output", flushSummary, zlib.gunzipSync(flushOutput).toString() === "abcdef", flushChunks.length >= 2);

    function methodRows(prototype, names) {
      return names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor) return name + ":missing";
        if ("value" in descriptor) {
          return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
        }
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, typeof descriptor.set, Object.hasOwn(descriptor.get, "prototype")].join(":");
      }).join("|");
    }
    function stateValue(value) {
      if (value === null) return "null";
      if (value === undefined) return "undefined";
      if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return String(value);
      if (Buffer.isBuffer(value)) return "Buffer:" + value.length;
      if (ArrayBuffer.isView(value)) return value.constructor.name + ":" + value.byteLength;
      return value.constructor?.name ?? typeof value;
    }
    function stateRows(instance, names) {
      return names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(instance, name);
        const value = instance[name];
        if (!descriptor) return [name, "missing", typeof value, stateValue(value)].join(":");
        if ("value" in descriptor) return [name, "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, stateValue(value)].join(":");
        return [name, "accessor", descriptor.enumerable, descriptor.configurable, descriptor.get?.name, descriptor.get?.length, typeof descriptor.set, stateValue(value)].join(":");
      }).join("|");
    }

    const constructorNames = ["Deflate", "Inflate", "Gzip", "Gunzip", "DeflateRaw", "InflateRaw", "Unzip", "BrotliCompress", "BrotliDecompress", "ZstdCompress", "ZstdDecompress"];
    const constructorPrototypeRows = constructorNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(zlib[name], "prototype");
      return [name, typeof zlib[name], zlib[name].name, zlib[name].length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(","), Object.getPrototypeOf(descriptor.value).constructor.name].join(":");
    });
    const constructorCallRows = constructorNames.map((name) => {
      try {
        const value = zlib[name]();
        const row = [name, "call-ok", value.constructor.name, value instanceof zlib[name]].join(":");
        value.destroy?.();
        return row;
      } catch (error) {
        return [name, error.constructor.name, error.name, error.code, error.message].join(":");
      }
    });
    const zlibParent = Object.getPrototypeOf(zlib.Gzip.prototype);
    const brotliParent = Object.getPrototypeOf(zlib.BrotliCompress.prototype);
    const zstdParent = Object.getPrototypeOf(zlib.ZstdCompress.prototype);
    const zlibBase = Object.getPrototypeOf(zlibParent);
    console.log("zlib constructor prototypes", constructorPrototypeRows.join("|"));
    console.log("zlib constructor calls", constructorCallRows.join("|"));
    console.log("zlib chain", zlibParent.constructor.name, brotliParent.constructor.name, Object.getPrototypeOf(brotliParent).constructor.name, zstdParent.constructor.name, Object.getPrototypeOf(zstdParent).constructor.name);
    console.log("zlib parent names", Object.getOwnPropertyNames(zlibParent).join(","), Object.keys(zlibParent).join(","));
    console.log("zlib base names", Object.getOwnPropertyNames(zlibBase).join(","), Object.keys(zlibBase).join(","));
    console.log("zlib parent rows", methodRows(zlibParent, ["constructor", "params"]));
    console.log("zlib wrapper rows", methodRows(brotliParent, ["constructor"]), methodRows(zstdParent, ["constructor"]));
    console.log("zlib base rows", methodRows(zlibBase, ["constructor", "_closed", "reset", "_flush", "_final", "flush", "close", "_destroy", "_transform", "_processChunk"]));
    console.log("zlib params", typeof zlib.createGzip().params, typeof zlib.createBrotliCompress().params, typeof zlib.createZstdCompress().params);
    const instanceStateFields = ["bytesWritten", "_handle", "_outBuffer", "_outOffset", "_chunkSize", "_defaultFlushFlag", "_finishFlushFlag", "_defaultFullFlushFlag", "_info", "_maxOutputLength", "_rejectGarbageAfterEnd", "_level", "_strategy", "_mode", "_dictionary", "_closed"];
    const stateGzip = zlib.createGzip();
    const stateGzipOptions = zlib.createGzip({ chunkSize: 4096, level: 3, strategy: zlib.constants.Z_FILTERED, flush: zlib.constants.Z_FULL_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH, info: true, maxOutputLength: 12345 });
    const stateBrotli = zlib.createBrotliCompress({ chunkSize: 4096, flush: zlib.constants.BROTLI_OPERATION_FLUSH, finishFlush: zlib.constants.BROTLI_OPERATION_FINISH });
    const stateZstd = zlib.createZstdCompress({ chunkSize: 4096, flush: zlib.constants.ZSTD_e_flush, finishFlush: zlib.constants.ZSTD_e_end });
    console.log("zlib instance state", stateRows(stateGzip, instanceStateFields));
    console.log("zlib option state", stateRows(stateGzipOptions, ["_outBuffer", "_chunkSize", "_defaultFlushFlag", "_finishFlushFlag", "_defaultFullFlushFlag", "_info", "_maxOutputLength", "_level", "_strategy", "_mode"]));
    console.log("zlib modern state", stateRows(stateBrotli, ["_handle", "_chunkSize", "_defaultFlushFlag", "_finishFlushFlag", "_defaultFullFlushFlag", "_level", "_strategy", "_mode"]) + " " + stateRows(stateZstd, ["_handle", "_chunkSize", "_defaultFlushFlag", "_finishFlushFlag", "_defaultFullFlushFlag", "_level", "_strategy", "_mode"]));
    await new Promise((resolve, reject) => stateGzip.params(zlib.constants.Z_BEST_SPEED, zlib.constants.Z_HUFFMAN_ONLY, (error) => error ? reject(error) : resolve()));
    console.log("zlib params state", stateGzip._level, stateGzip._strategy);
    stateGzip.destroy();
    await new Promise((resolve) => stateGzipOptions.close(resolve));
    console.log("zlib closed state", stateRows(stateGzip, ["_handle", "_closed"]), stateRows(stateGzipOptions, ["_handle", "_closed"]));

    const gunzipSink = collect();
    await pipe(Readable.from([gzip.subarray(0, 5), gzip.subarray(5)]), new zlib.Gunzip(), gunzipSink.writable);
    console.log("gunzip", Buffer.concat(gunzipSink.chunks).toString() === input);

    const rawSink = collect();
    await pipe(Readable.from([input]), zlib.createDeflateRaw(), rawSink.writable);
    const raw = Buffer.concat(rawSink.chunks);
    const unrawSink = collect();
    await pipe(Readable.from([raw]), new zlib.InflateRaw(), unrawSink.writable);
    console.log("raw", Buffer.concat(unrawSink.chunks).toString() === input);

    const unzipSink = collect();
    await pipe(Readable.from([gzip]), zlib.createUnzip(), unzipSink.writable);
    console.log("unzip", Buffer.concat(unzipSink.chunks).toString() === input);

    const brotliSink = collect();
    await pipe(Readable.from([input]), zlib.createBrotliCompress(), brotliSink.writable);
    const brotli = Buffer.concat(brotliSink.chunks);
    const unbrotliSink = collect();
    await pipe(Readable.from([brotli]), new zlib.BrotliDecompress(), unbrotliSink.writable);
    console.log("brotli", Buffer.concat(unbrotliSink.chunks).toString() === input);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "gzip true true true",
    "probe before reset 3 function function function function",
    "probe after reset 0",
    "probe closed true",
    "flush output true:true true true",
    "zlib constructor prototypes Deflate:function:Deflate:1:false:false:true:constructor:Zlib|Inflate:function:Inflate:1:false:false:true:constructor:Zlib|Gzip:function:Gzip:1:false:false:true:constructor:Zlib|Gunzip:function:Gunzip:1:false:false:true:constructor:Zlib|DeflateRaw:function:DeflateRaw:1:false:false:true:constructor:Zlib|InflateRaw:function:InflateRaw:1:false:false:true:constructor:Zlib|Unzip:function:Unzip:1:false:false:true:constructor:Zlib|BrotliCompress:function:BrotliCompress:1:false:false:true:constructor:Brotli|BrotliDecompress:function:BrotliDecompress:1:false:false:true:constructor:Brotli|ZstdCompress:function:ZstdCompress:1:false:false:false:constructor:Zstd|ZstdDecompress:function:ZstdDecompress:1:false:false:false:constructor:Zstd",
    "zlib constructor calls Deflate:call-ok:Deflate:true|Inflate:call-ok:Inflate:true|Gzip:call-ok:Gzip:true|Gunzip:call-ok:Gunzip:true|DeflateRaw:call-ok:DeflateRaw:true|InflateRaw:call-ok:InflateRaw:true|Unzip:call-ok:Unzip:true|BrotliCompress:call-ok:BrotliCompress:true|BrotliDecompress:call-ok:BrotliDecompress:true|ZstdCompress:TypeError:TypeError::Class constructor ZstdCompress cannot be invoked without 'new'|ZstdDecompress:TypeError:TypeError::Class constructor ZstdDecompress cannot be invoked without 'new'",
    "zlib chain Zlib Brotli Zlib Zstd ZlibBase",
    "zlib parent names constructor,params params",
    "zlib base names constructor,_closed,reset,_flush,_final,flush,close,_destroy,_transform,_processChunk _closed,reset,_flush,_final,flush,close,_destroy,_transform,_processChunk",
    "zlib parent rows constructor:false:true:true:Zlib:2:true|params:true:true:true:params:3:true",
    "zlib wrapper rows constructor:false:true:true:Brotli:2:true constructor:false:true:true:Zstd:4:true",
    "zlib base rows constructor:false:true:true:ZlibBase:4:true|_closed:true:true:get:0:undefined:true|reset:true:true:true:reset:0:true|_flush:true:true:true::1:true|_final:true:true:true::1:true|flush:true:true:true::2:true|close:true:true:true::1:true|_destroy:true:true:true::2:true|_transform:true:true:true::3:true|_processChunk:true:true:true::3:true",
    "zlib params function function undefined",
    "zlib instance state bytesWritten:data:true:true:true:0|_handle:data:true:true:true:Zlib|_outBuffer:data:true:true:true:Buffer:16384|_outOffset:data:true:true:true:0|_chunkSize:data:true:true:true:16384|_defaultFlushFlag:data:true:true:true:0|_finishFlushFlag:data:true:true:true:4|_defaultFullFlushFlag:data:true:true:true:3|_info:data:true:true:true:undefined|_maxOutputLength:data:true:true:true:9007199254740991|_rejectGarbageAfterEnd:data:true:true:true:false|_level:data:true:true:true:-1|_strategy:data:true:true:true:0|_mode:data:true:true:true:3|_dictionary:missing:undefined:undefined|_closed:missing:boolean:false",
    "zlib option state _outBuffer:data:true:true:true:Buffer:4096|_chunkSize:data:true:true:true:4096|_defaultFlushFlag:data:true:true:true:3|_finishFlushFlag:data:true:true:true:2|_defaultFullFlushFlag:data:true:true:true:3|_info:data:true:true:true:true|_maxOutputLength:data:true:true:true:12345|_level:data:true:true:true:3|_strategy:data:true:true:true:1|_mode:data:true:true:true:3",
    "zlib modern state _handle:data:true:true:true:BrotliEncoder|_chunkSize:data:true:true:true:4096|_defaultFlushFlag:data:true:true:true:1|_finishFlushFlag:data:true:true:true:2|_defaultFullFlushFlag:data:true:true:true:1|_level:missing:undefined:undefined|_strategy:missing:undefined:undefined|_mode:missing:undefined:undefined _handle:data:true:true:true:ZstdCompress|_chunkSize:data:true:true:true:4096|_defaultFlushFlag:data:true:true:true:1|_finishFlushFlag:data:true:true:true:2|_defaultFullFlushFlag:data:true:true:true:1|_level:missing:undefined:undefined|_strategy:missing:undefined:undefined|_mode:missing:undefined:undefined",
    "zlib params state 1 2",
    "zlib closed state _handle:data:true:true:true:null|_closed:missing:boolean:true _handle:data:true:true:true:null|_closed:missing:boolean:true",
    "gunzip true",
    "raw true",
    "unzip true",
    "brotli true"
  ]);
});

test("node:async_hooks AsyncLocalStorage preserves context across awaits and microtasks", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { AsyncLocalStorage } from "node:async_hooks";

    const als = new AsyncLocalStorage();

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    await als.run({ requestId: "abc-123" }, async () => {
      console.log("initial:", JSON.stringify(als.getStore()));

      await sleep(1);
      console.log("after timeout:", JSON.stringify(als.getStore()));

      await Promise.resolve();
      console.log("after promise:", JSON.stringify(als.getStore()));

      queueMicrotask(() => {
        console.log("inside microtask:", JSON.stringify(als.getStore()));
      });

      await sleep(1);
    });

    console.log("outside:", als.getStore());
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'initial: {"requestId":"abc-123"}',
    'after timeout: {"requestId":"abc-123"}',
    'after promise: {"requestId":"abc-123"}',
    'inside microtask: {"requestId":"abc-123"}',
    "outside: undefined"
  ]);
});

test("node:async_hooks AsyncLocalStorage captures context for later timers and nextTick", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { AsyncLocalStorage } from "node:async_hooks";

    const als = new AsyncLocalStorage();

    await new Promise((resolve) => {
      als.run({ requestId: "timer" }, () => {
        setTimeout(() => {
          console.log("timer:", JSON.stringify(als.getStore()));
          resolve();
        }, 1);

        process.nextTick(() => {
          console.log("nextTick:", JSON.stringify(als.getStore()));
        });
      });

      console.log("outside sync:", als.getStore());
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "outside sync: undefined",
    'nextTick: {"requestId":"timer"}',
    'timer: {"requestId":"timer"}'
  ]);
});

test("node:async_hooks exposes AsyncResource package-probe helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import asyncHooks, {
      AsyncLocalStorage,
      AsyncResource,
      createHook,
      executionAsyncId,
      executionAsyncResource,
      triggerAsyncId,
      asyncWrapProviders
    } from "node:async_hooks";

    const asyncLocalStorageDescriptor = Object.getOwnPropertyDescriptor(asyncHooks, "AsyncLocalStorage");
    const asyncLocalStoragePrototype = AsyncLocalStorage.prototype;
    const nameDescriptor = Object.getOwnPropertyDescriptor(asyncLocalStoragePrototype, "name");
    const withScopeDescriptor = Object.getOwnPropertyDescriptor(asyncLocalStoragePrototype, "withScope");
    console.log(
      "als module",
      Object.keys(asyncHooks).join(","),
      asyncLocalStorageDescriptor.enumerable,
      asyncLocalStorageDescriptor.configurable,
      typeof asyncLocalStorageDescriptor.get,
      typeof asyncLocalStorageDescriptor.set
    );
    console.log("als prototype", JSON.stringify({
      own: Object.getOwnPropertyNames(asyncLocalStoragePrototype),
      keys: Object.keys(asyncLocalStoragePrototype)
    }));
    console.log(
      "als descriptors",
      nameDescriptor.enumerable,
      nameDescriptor.configurable,
      typeof nameDescriptor.get,
      withScopeDescriptor.enumerable,
      withScopeDescriptor.configurable,
      withScopeDescriptor.writable,
      withScopeDescriptor.value.name,
      withScopeDescriptor.value.length
    );
	    console.log("metadata", AsyncResource.name, AsyncResource.length, createHook.name, createHook.length);
	    const helperDescriptor = (name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(asyncHooks, name);
	      return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
	    };
	    console.log("helper metadata", ["executionAsyncId", "triggerAsyncId", "executionAsyncResource"].map(helperDescriptor).join("|"));
	    console.log("provider metadata", Object.getPrototypeOf(asyncWrapProviders) === null, Object.keys(asyncWrapProviders).slice(0, 4).join(","), Object.keys(asyncWrapProviders).length);
	    const hook = createHook({
      init(asyncId, type, triggerId) {
        events.push(["init", type, triggerId, Number.isInteger(asyncId)].join(":"));
      },
      before(asyncId) {
        events.push(["before", asyncId].join(":"));
      },
      after(asyncId) {
        events.push(["after", asyncId].join(":"));
      },
      destroy(asyncId) {
        events.push(["destroy", asyncId].join(":"));
      },
      promiseResolve() {}
    });
    const hookPrototype = Object.getPrototypeOf(hook);
    console.log("hook shape", JSON.stringify([
      hook.constructor.name,
      Object.keys(hook).join(","),
      Object.getOwnPropertyNames(hook).join(","),
      hookPrototype.constructor.name,
      Object.getOwnPropertyNames(hookPrototype).join(","),
      Object.keys(hookPrototype).join(",")
    ]));
    console.log("hook descriptors", Object.getOwnPropertyNames(hookPrototype).map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(hookPrototype, name);
      return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value?.name, descriptor.value?.length, Object.hasOwn(descriptor.value ?? {}, "prototype")].join(":");
    }).join("|"));
    console.log("hook validation", [
      ["missing", () => createHook()],
      ["null", () => createHook(null)],
      ["init", () => createHook({ init: 1 })],
      ["number", () => createHook(1)]
    ].map(([label, action]) => {
      try {
        const value = action();
        return [label, value.constructor.name, Object.keys(value).join(","), Object.getOwnPropertyNames(value).join(",")].join(":");
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    }).join("|"));
    console.log("resource validation", [
      ["missing-type", () => new AsyncResource()],
      ["null-type", () => new AsyncResource(null)],
      ["number-type", () => new AsyncResource(1)],
      ["symbol-type", () => new AsyncResource(Symbol("x"))],
      ["string-trigger", () => new AsyncResource("x", { triggerAsyncId: "7" })],
      ["float-trigger", () => new AsyncResource("x", { triggerAsyncId: 1.5 })],
      ["null-trigger", () => new AsyncResource("x", { triggerAsyncId: null })],
      ["nan-trigger", () => new AsyncResource("x", NaN)],
      ["too-high-trigger", () => new AsyncResource("x", { triggerAsyncId: 2 ** 53 })],
      ["valid-number-trigger", () => new AsyncResource("x", 7).triggerAsyncId()],
      ["valid-object-trigger", () => new AsyncResource("x", { triggerAsyncId: 7 }).triggerAsyncId()],
      ["static-bind-number", () => AsyncResource.bind(123)],
      ["instance-bind-number", () => new AsyncResource("x").bind(123)],
      ["storage-bind-number", () => AsyncLocalStorage.bind(123)],
      ["static-bind-name", () => AsyncResource.bind(function named() {}).name],
      ["instance-bind-name", () => new AsyncResource("x").bind(function named() {}).name],
      ["storage-bind-name", () => AsyncLocalStorage.bind(function named() {}).name]
    ].map(([label, action]) => {
      try {
        return label + ":ok:" + action();
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    }).join("|"));
    console.log("resource prototype", JSON.stringify({
      own: Object.getOwnPropertyNames(AsyncResource.prototype),
      keys: Object.keys(AsyncResource.prototype)
    }));
    console.log("resource descriptors", Object.getOwnPropertyNames(AsyncResource.prototype).map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(AsyncResource.prototype, name);
      return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value?.name, descriptor.value?.length].join(":");
    }).join("|"));
    console.log("hook", hook.enable() === hook, hook.disable() === hook);

    const storage = new AsyncLocalStorage({ name: "request", defaultValue: { requestId: "default" } });
    console.log("storage options", storage.name, JSON.stringify(storage.getStore()), JSON.stringify({
      keys: Object.keys(storage),
      own: Object.getOwnPropertyNames(storage)
    }));
    const storageScope = storage.withScope({ requestId: "scope" });
    console.log("storage scope", JSON.stringify(storage.getStore()), JSON.stringify({
      keys: Object.keys(storageScope),
      own: Object.getOwnPropertyNames(storageScope)
    }), storageScope.constructor.name, storageScope.constructor.length, typeof storageScope.dispose, typeof storageScope[Symbol.dispose]);
    storageScope[Symbol.dispose]();
    console.log("storage scope disposed", JSON.stringify(storage.getStore()));
    const storageBound = storage.run({ requestId: "bound" }, () => {
      return AsyncLocalStorage.bind(function (value) {
        return [this.label, value, JSON.stringify(storage.getStore())].join(":");
      });
    });
    console.log("storage bound", storageBound.call({ label: "caller" }, "ok"));

    const events = [];
    hook.enable();
    const resource = new AsyncResource("probe", { triggerAsyncId: 7 });
    console.log("ids", Number.isInteger(resource.asyncId()), resource.triggerAsyncId());

    const scoped = resource.runInAsyncScope(function (value) {
      return [
        this.label,
        value,
        executionAsyncId() === resource.asyncId(),
        triggerAsyncId(),
        executionAsyncResource() === resource
      ].join(":");
    }, { label: "ctx" }, "ok");
    console.log("scoped", scoped);

    const bound = resource.bind(function (value) {
      return [this.label, value, executionAsyncResource() === resource].join(":");
    }, { label: "bound" });
    console.log("bound", bound("ok"));
    console.log("bound resource", bound.asyncResource === resource);

    const callThisBound = resource.bind(function (value) {
      return [this.label, value, executionAsyncResource() === resource].join(":");
    });
    console.log("bound this", callThisBound.call({ label: "caller" }, "ok"));

    const staticBound = AsyncResource.bind(() => executionAsyncId() > 0, "static-probe");
    console.log("static", staticBound(), staticBound.asyncResource.type);

    console.log("providers", asyncWrapProviders.PROMISE, asyncHooks.asyncWrapProviders.TCPWRAP);
    console.log("destroy", resource.emitDestroy() === resource);
    hook.disable();
    const staticThisBound = AsyncResource.bind(function (value) {
      return [this.label, value, executionAsyncId() > 0].join(":");
    }, "static-this");
    console.log("static this", staticThisBound.call({ label: "static-caller" }, "ok"), staticThisBound.asyncResource.type);
    new AsyncResource("disabled-probe").emitDestroy();
    console.log("events", [
      events.includes("init:probe:7:true"),
      events.filter((event) => event === "before:" + resource.asyncId()).length,
      events.filter((event) => event === "after:" + resource.asyncId()).length,
      events.includes("init:static-probe:0:true"),
      events.filter((event) => event === "before:" + staticBound.asyncResource.asyncId()).length,
      events.filter((event) => event === "after:" + staticBound.asyncResource.asyncId()).length,
      events.includes("destroy:" + resource.asyncId()),
      events.some((event) => event.includes("disabled-probe"))
    ].join(" "));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "als module AsyncLocalStorage,createHook,executionAsyncId,triggerAsyncId,executionAsyncResource,asyncWrapProviders,AsyncResource true true function undefined",
	    "als prototype {\"own\":[\"constructor\",\"name\",\"disable\",\"enterWith\",\"run\",\"exit\",\"getStore\",\"withScope\"],\"keys\":[]}",
	    "als descriptors false true function false true true withScope 1",
	    "metadata AsyncResource 1 createHook 1",
	    "helper metadata executionAsyncId:true:true:true:executionAsyncId:0:true|triggerAsyncId:true:true:true:triggerAsyncId:0:true|executionAsyncResource:true:true:true:executionAsyncResource:0:true",
	    "provider metadata true NONE,DIRHANDLE,DNSCHANNEL,ELDHISTOGRAM 68",
    'hook shape ["AsyncHook","","","AsyncHook","constructor,enable,disable",""]',
    "hook descriptors constructor:false:true:true:AsyncHook:1:true|enable:false:true:true:enable:0:false|disable:false:true:true:disable:0:false",
    "hook validation missing:TypeError::Cannot destructure property 'init' of 'undefined' as it is undefined.|null:TypeError::Cannot destructure property 'init' of 'object null' as it is null.|init:TypeError:ERR_ASYNC_CALLBACK:hook.init must be a function|number:AsyncHook::",
    "resource validation missing-type:TypeError:ERR_INVALID_ARG_TYPE:The \"type\" argument must be of type string. Received undefined|null-type:TypeError:ERR_INVALID_ARG_TYPE:The \"type\" argument must be of type string. Received null|number-type:TypeError:ERR_INVALID_ARG_TYPE:The \"type\" argument must be of type string. Received type number (1)|symbol-type:TypeError:ERR_INVALID_ARG_TYPE:The \"type\" argument must be of type string. Received type symbol (Symbol(x))|string-trigger:RangeError:ERR_INVALID_ASYNC_ID:Invalid triggerAsyncId value: 7|float-trigger:RangeError:ERR_INVALID_ASYNC_ID:Invalid triggerAsyncId value: 1.5|null-trigger:RangeError:ERR_INVALID_ASYNC_ID:Invalid triggerAsyncId value: null|nan-trigger:RangeError:ERR_INVALID_ASYNC_ID:Invalid triggerAsyncId value: NaN|too-high-trigger:RangeError:ERR_INVALID_ASYNC_ID:Invalid triggerAsyncId value: 9007199254740992|valid-number-trigger:ok:7|valid-object-trigger:ok:7|static-bind-number:TypeError:ERR_INVALID_ARG_TYPE:The \"fn\" argument must be of type function. Received type number (123)|instance-bind-number:TypeError:ERR_INVALID_ARG_TYPE:The \"fn\" argument must be of type function. Received type number (123)|storage-bind-number:TypeError:ERR_INVALID_ARG_TYPE:The \"fn\" argument must be of type function. Received type number (123)|static-bind-name:ok:bound|instance-bind-name:ok:bound|storage-bind-name:ok:bound",
    'resource prototype {"own":["constructor","runInAsyncScope","emitDestroy","asyncId","triggerAsyncId","bind"],"keys":[]}',
    "resource descriptors constructor:false:true:true:AsyncResource:1|runInAsyncScope:false:true:true:runInAsyncScope:2|emitDestroy:false:true:true:emitDestroy:0|asyncId:false:true:true:asyncId:0|triggerAsyncId:false:true:true:triggerAsyncId:0|bind:false:true:true:bind:2",
	    "hook true true",
    'storage options request {"requestId":"default"} {"keys":[],"own":[]}',
    'storage scope {"requestId":"scope"} {"keys":[],"own":[]} RunScope 2 function function',
    'storage scope disposed {"requestId":"default"}',
    'storage bound caller:ok:{"requestId":"bound"}',
    "ids true 7",
    "scoped ctx:ok:true:7:true",
    "bound bound:ok:true",
    "bound resource true",
    "bound this caller:ok:true",
    "static true static-probe",
    "providers 27 40",
    "destroy true",
    "static this static-caller:ok:true static-this",
    "events true 3 3 true 1 1 true false"
  ]);
});

test("node:querystring parses and formats query strings", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const querystring = require('node:querystring');
      console.log(JSON.stringify(querystring.parse('a=1&a=2&b=hello+world')));
      console.log(querystring.stringify({ a: ['1', '2'], b: 'hello world' }));
      console.log(Object.keys(querystring).join(','));
      console.log(Object.keys(querystring).map((key) => key + ':' + querystring[key].name + ':' + querystring[key].length).join('|'));
      const invalidUnescape = querystring.unescape('%FF');
      console.log(invalidUnescape.length, invalidUnescape.charCodeAt(0), querystring.unescape('a+b%20c'), querystring.unescapeBuffer('a+b%20c', true).toString());
      const special = querystring.parse('__proto__=polluted&toString=x&a=1&a=2');
      const empty = querystring.parse('');
      console.log(Object.getPrototypeOf(special) === null, Object.keys(special).join(','), JSON.stringify(special));
      console.log(Object.prototype.hasOwnProperty.call(special, '__proto__'), special.__proto__, typeof special.toString, special.toString, Array.isArray(special.a), special.a.join(','));
      console.log(Object.getPrototypeOf(empty) === null, Object.keys(empty).length);
      console.log(JSON.stringify(querystring.parse('a=1&b=2&c=3', undefined, undefined, { maxKeys: 2 })));
      console.log(JSON.stringify(querystring.parse('a=b&c=d', null, null)));
      console.log(querystring.stringify({ a: 'b', c: 'd' }, null, null));
      console.log(Object.keys(querystring.parse(Array.from({ length: 1002 }, (_, index) => 'k' + index + '=v').join('&'))).length);
      console.log(Object.keys(querystring.parse('k0=v&k1=v&k2=v', undefined, undefined, { maxKeys: 0 })).length);
      console.log(JSON.stringify(querystring.parse('a=x%20y&b=z', undefined, undefined, { decodeURIComponent: (value) => 'D(' + value + ')' })));
      console.log(JSON.stringify(querystring.parse('a=x+y', undefined, undefined, { decodeURIComponent: (value) => 'D(' + value + ')' })));
      console.log(JSON.stringify(querystring.parse('a=%FF+b')));
      console.log(querystring.stringify({ a: {}, b: [], c: [1, {}], d: null, e: undefined, f: true, g: 2n }));
      console.log(querystring.stringify({ a: 'x y' }, undefined, undefined, { encodeURIComponent: (value) => 'E(' + value + ')' }));
      console.log(JSON.stringify([querystring.stringify('ab'), querystring.stringify(123), querystring.stringify(true), querystring.stringify(['a', 'b']), querystring.stringify({ 0: 'a', 1: 'b' })]));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    JSON.stringify({ a: ["1", "2"], b: "hello world" }),
    "a=1&a=2&b=hello%20world",
    "unescapeBuffer,unescape,escape,stringify,encode,parse,decode",
    "unescapeBuffer:unescapeBuffer:2|unescape:qsUnescape:2|escape:qsEscape:1|stringify:stringify:4|encode:stringify:4|parse:parse:4|decode:parse:4",
    "1 65533 a+b c a b c",
    "true __proto__,toString,a {\"__proto__\":\"polluted\",\"toString\":\"x\",\"a\":[\"1\",\"2\"]}",
    "true polluted string x true 1,2",
    "true 0",
    "{\"a\":\"1\",\"b\":\"2\"}",
    "{\"a\":\"b\",\"c\":\"d\"}",
    "a=b&c=d",
    "1000",
    "3",
    "{\"D(a)\":\"D(x%20y)\",\"D(b)\":\"D(z)\"}",
    "{\"D(a)\":\"D(x%20y)\"}",
    "{\"a\":\"� b\"}",
    "a=&c=1&c=&d=&e=&f=true&g=2",
    "E(a)=E(x y)",
    "[\"\",\"\",\"\",\"0=a&1=b\",\"0=a&1=b\"]"
  ]);
});

test("node:stream default export is an inheritable Stream constructor", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const Stream = require('node:stream');
      const util = require('node:util');
      function Child() {}
      util.inherits(Child, Stream);
      const streamDescriptorRow = (prototype, name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor) return [name, "missing", typeof prototype[name]].join(":");
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      };
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(Stream, 'prototype');
      const constructorDescriptor = Object.getOwnPropertyDescriptor(Stream.prototype, 'constructor');
      const receiver = {};
      const stream = new Stream();
      console.log(typeof Stream);
      console.log(typeof Stream.Readable);
      console.log([Stream, Stream.Readable, Stream.Writable, Stream.Duplex, Stream.Transform, Stream.PassThrough].map((constructor) => constructor.length).join(','));
      console.log(Stream.duplexPair.length);
      console.log(new Child() instanceof Stream);
      console.log(prototypeDescriptor.enumerable, prototypeDescriptor.configurable, prototypeDescriptor.writable, constructorDescriptor.enumerable, constructorDescriptor.configurable, constructorDescriptor.writable, Stream.prototype.constructor === Stream);
      console.log("stream proto names", Object.getOwnPropertyNames(Stream.prototype).join(","));
      console.log("stream proto keys", Object.keys(Stream.prototype).join(","));
      console.log("stream proto rows", ["constructor", "pipe", "unpipe", "eventNames"].map((name) => streamDescriptorRow(Stream.prototype, name)).join("|"));
      console.log(Stream.call(receiver) === undefined, Object.keys(receiver).join(','), stream instanceof Stream, stream instanceof require('node:events').EventEmitter, Object.keys(stream).join(','));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "function",
    "1,1,1,1,1,1",
    "1",
    "true",
    "false false true false true true true",
    "stream proto names constructor,pipe,eventNames",
    "stream proto keys pipe,eventNames",
    "stream proto rows constructor:false:true:true:function:Stream:1:true|pipe:true:true:true:function::2:true|unpipe:missing:undefined|eventNames:true:true:true:function:eventNames:0:true",
    "true _events,_eventsCount,_maxListeners true true _events,_eventsCount,_maxListeners"
  ]);
});

test("node:stream exposes callable Transform for legacy npm inheritance", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const stream = require('node:stream');
      const util = require('node:util');
      function Upper() {
        stream.Transform.call(this);
      }
      util.inherits(Upper, stream.Transform);
      Upper.prototype._transform = function(chunk, encoding, callback) {
        this.push(String(chunk).toUpperCase());
        callback();
      };
      const upper = new Upper();
      upper.on('data', chunk => console.log(String(chunk)));
      upper.write('ok');
      upper.end();
      console.log(upper instanceof stream.Transform);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "OK",
    "true"
  ]);
});

test("node:stream pipeline pipes readable output into writable destinations", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const stream = require('node:stream');
      const input = new stream.Readable();
      const output = new stream.Writable({
        write(chunk) {
          console.log(String(chunk));
        }
      });
      stream.pipeline(input, output, (error) => {
        if (error) console.error(error.message);
        else console.log('done');
      });
      input.push('file');
      input.push(null);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "file\ndone\n");
});

test("node:stream pipeline supports iterable sources and function stages", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Writable, pipeline } from "node:stream";

    const chunks = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      }
    });

    await new Promise((resolve, reject) => {
      pipeline(["a", "b"], async function* upper(source) {
        for await (const chunk of source) {
          yield String(chunk).toUpperCase();
        }
      }, sink, (error) => {
        if (error) reject(error);
        else {
          console.log("iterable", chunks.join(""));
          resolve();
        }
      });
    });

    const failedSink = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    });

    await new Promise((resolve) => {
      pipeline(["x"], async function* explode(source) {
        for await (const chunk of source) {
          yield chunk;
          throw new Error("boom");
        }
      }, failedSink, (error) => {
        console.log("error", error.message, failedSink.destroyed, failedSink.closed);
        resolve();
      });
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "iterable AB",
    "error boom true true"
  ]);
});

test("node:stream exposes PassThrough, Readable.from, async iteration, and callback finished", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";

    const pass = new stream.PassThrough();
    pass.on("data", chunk => console.log("pass:" + chunk.toString()));
    pass.write("ok");
    pass.end();

    const bufferedPass = new stream.PassThrough({ objectMode: true });
    console.log("pass shape", typeof bufferedPass[Symbol.asyncIterator], typeof bufferedPass.iterator, typeof bufferedPass.read, typeof bufferedPass.pause, bufferedPass._readableState?.objectMode, bufferedPass._writableState?.objectMode);
    bufferedPass.write("a");
    bufferedPass.end("b");
    const bufferedChunks = [];
    for await (const chunk of bufferedPass) {
      bufferedChunks.push(String(chunk));
    }
    console.log("pass iter:" + bufferedChunks.join(""));

    const transform = new stream.Transform({
      transform(chunk, _encoding, callback) {
        callback(null, String(chunk).toUpperCase());
      }
    });
    console.log("transform parents", Object.getPrototypeOf(stream.Transform).name, Object.getPrototypeOf(stream.PassThrough).name, Object.getPrototypeOf(stream.Transform.prototype).constructor.name);
    console.log("transform instanceof", transform instanceof stream.Transform, transform instanceof stream.Duplex, transform instanceof stream.Readable, transform instanceof stream.Writable);
    transform.write("a");
    transform.end("b");
    const transformChunks = [];
    for await (const chunk of transform) {
      transformChunks.push(String(chunk));
    }
    console.log("transform iter:" + transformChunks.join(""), transform.readableLength, transform._readableState.ended, transform._writableState.finished);

    const chunks = [];
    for await (const chunk of stream.Readable.from(["a", "b"])) {
      chunks.push(String(chunk));
    }
    console.log("from:" + chunks.join(""));

    const describeReadableFromChunk = (chunk) => {
      if (Buffer.isBuffer(chunk)) return "Buffer:" + chunk.toString("hex");
      if (ArrayBuffer.isView(chunk)) return chunk.constructor.name + ":" + Array.from(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)).join(",");
      return typeof chunk + ":" + String(chunk);
    };
    const collectReadableFrom = async (label, input) => {
      try {
        const readableFrom = stream.Readable.from(input);
        const rows = [];
        for await (const chunk of readableFrom) rows.push(describeReadableFromChunk(chunk));
        console.log("from source", label, readableFrom.readableObjectMode + ":" + readableFrom.readableHighWaterMark + ":" + rows.join("|"));
      } catch (error) {
        console.log("from source", label, [error.name, error.code, error.message].join(":"));
      }
    };
    await collectReadableFrom("string", "abc");
    await collectReadableFrom("buffer", Buffer.from("abc"));
    await collectReadableFrom("uint8", new Uint8Array([1, 2]));
    await collectReadableFrom("int16", new Int16Array([256, 257]));
    await collectReadableFrom("dataview", new DataView(Uint8Array.from([3, 4]).buffer));
    await collectReadableFrom("arraybuffer", Uint8Array.from([5, 6]).buffer);
    await collectReadableFrom("null", null);
    await collectReadableFrom("undefined", undefined);
    await collectReadableFrom("number", 1);

    const readable = stream.Readable.from(["done"]);
    stream.finished(readable, (error) => {
      console.log("finished:" + (error ? error.message : "ok"));
    });
    readable.resume();

    console.log(stream.isReadable(readable), stream.isWritable(pass), typeof stream.Readable.toWeb);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "pass:ok",
    "pass shape function function function function true true",
    "pass iter:ab",
    "transform parents Duplex Transform Duplex",
    "transform instanceof true true true true",
    "transform iter:AB 0 true true",
    "from:ab",
    "from source string true:16:string:abc",
    "from source buffer true:16:Buffer:616263",
    "from source uint8 true:1:number:1|number:2",
    "from source int16 true:1:number:256|number:257",
    "from source dataview TypeError:ERR_INVALID_ARG_TYPE:The \"iterable\" argument must be an instance of Iterable. Received an instance of DataView",
    "from source arraybuffer TypeError:ERR_INVALID_ARG_TYPE:The \"iterable\" argument must be an instance of Iterable. Received an instance of ArrayBuffer",
    "from source null TypeError:ERR_INVALID_ARG_TYPE:The \"iterable\" argument must be an instance of Iterable. Received null",
    "from source undefined TypeError:ERR_INVALID_ARG_TYPE:The \"iterable\" argument must be an instance of Iterable. Received undefined",
    "from source number TypeError:ERR_INVALID_ARG_TYPE:The \"iterable\" argument must be an instance of Iterable. Received type number (1)",
    "true false function",
    "finished:ok"
  ]);
});

test("node:stream pulls custom Readable sources", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";

    const events = [];
    const readable = new stream.Readable({
      highWaterMark: 7,
      read(size) {
        events.push("read:" + size + ":" + this.constructor.name);
        this.push("x");
        this.push(null);
      }
    });
    readable.on("data", (chunk) => events.push("data:" + chunk));
    readable.on("end", () => events.push("end"));
    await new Promise((resolve) => readable.on("close", resolve));
    console.log("data", events.join("|"));

    let directReads = 0;
    const direct = new stream.Readable({
      highWaterMark: 5,
      read(size) {
        events.push("direct-read:" + size);
        if (directReads++ === 0) this.push("ab");
        else this.push(null);
      }
    });
    console.log("direct", String(direct.read()), direct.read(), events.slice(-2).join("|"));

    class CustomReadable extends stream.Readable {
      _read(size) {
        this.push("s" + size);
        this.push(null);
      }
    }
    const subclassChunks = [];
    for await (const chunk of new CustomReadable({ highWaterMark: 3 })) {
      subclassChunks.push(String(chunk));
    }
    console.log("subclass", subclassChunks.join(""));

    const iterated = new stream.Readable({
      read() {
        this.push("i");
        this.push(null);
      }
    });
    const iteratedChunks = [];
    for await (const chunk of iterated) iteratedChunks.push(String(chunk));
    console.log("iterated", iteratedChunks.join(""));

    const pipedChunks = [];
    await new Promise((resolve, reject) => {
      const source = new stream.Readable({
        read() {
          this.push("p");
          this.push(null);
        }
      });
      const sink = new stream.Writable({
        write(chunk, _encoding, callback) {
          pipedChunks.push(String(chunk));
          callback();
        }
      });
      stream.pipeline(source, sink, (error) => error ? reject(error) : resolve());
    });
    console.log("pipeline", pipedChunks.join(""));

    const failed = new stream.Readable({
      read() {
        throw new Error("boom");
      }
    });
    failed.on("error", (error) => console.log("error", error.message, failed.destroyed, failed.errored?.message));
    failed.resume();
    await new Promise((resolve) => setTimeout(resolve, 0));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "data read:7:Readable|data:x|end",
    "direct ab null direct-read:5|direct-read:5",
    "subclass s3",
    "iterated i",
    "pipeline p",
    "error boom true boom"
  ]);
});

test("node:stream setEncoding decodes split byte chunks", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";

    const dataPass = new stream.PassThrough();
    dataPass.setEncoding("utf8");
    dataPass.on("data", (chunk) => console.log("data", JSON.stringify(chunk), typeof chunk));
    dataPass.write(Buffer.from([0xe2]));
    dataPass.end(Buffer.from([0x82, 0xac]));

    const buffered = new stream.Readable({ read() {} });
    buffered.push(Buffer.from([0xe2]));
    buffered.push(Buffer.from([0x82, 0xac]));
    buffered.push(null);
    buffered.setEncoding("utf8");
    console.log("buffered", JSON.stringify(buffered.read()), buffered.read());

    const lateIncomplete = new stream.Readable({ read() {} });
    lateIncomplete.push(Buffer.from([0xe2]));
    lateIncomplete.push(null);
    lateIncomplete.setEncoding("utf8");
    console.log("late incomplete", lateIncomplete.read());

    const lateBase64 = new stream.Readable({ read() {} });
    lateBase64.push(Buffer.from([1]));
    lateBase64.push(Buffer.from([2, 3, 4]));
    lateBase64.push(null);
    lateBase64.setEncoding("base64");
    console.log("late base64", lateBase64.read(), lateBase64.read());

    const latePass = new stream.PassThrough();
    latePass.write(Buffer.from([0xe2]));
    latePass.end();
    latePass.setEncoding("utf8");
    console.log("late pass", latePass.read());

    const iterated = stream.Readable.from([
      Buffer.from([0xf0]),
      Buffer.from([0x9f, 0x98, 0x80])
    ]);
    iterated.setEncoding("utf8");
    const iteratedChunks = [];
    for await (const chunk of iterated) iteratedChunks.push(chunk);
    console.log("iterated", iteratedChunks.length, JSON.stringify(iteratedChunks.join("")));

    const base64 = new stream.PassThrough();
    base64.setEncoding("base64");
    base64.on("data", (chunk) => console.log("base64", chunk));
    base64.write(Buffer.from([1]));
    base64.write(Buffer.from([2]));
    base64.end(Buffer.from([3, 4]));

    const latin1 = new stream.PassThrough();
    latin1.setEncoding("latin1");
    latin1.on("data", (chunk) => console.log("latin1", JSON.stringify(chunk)));
    latin1.end(Buffer.from([0xc2, 0xa3]));

    const hex = new stream.PassThrough();
    hex.setEncoding("hex");
    hex.on("data", (chunk) => console.log("hex", chunk));
    hex.write(Buffer.from([0x00, 0xff]));
    hex.end(Buffer.from([0x10]));

    const readPass = new stream.PassThrough();
    readPass.setEncoding("utf8");
    readPass.write(Buffer.from([0xe2]));
    readPass.end(Buffer.from([0x82, 0xac]));
    console.log("read pass", JSON.stringify(readPass.read()), readPass.read());

    const iteratedPass = new stream.PassThrough();
    iteratedPass.setEncoding("utf8");
    iteratedPass.write(Buffer.from([0xe2]));
    iteratedPass.end(Buffer.from([0x82, 0xac]));
    const iteratedPassChunks = [];
    for await (const chunk of iteratedPass) iteratedPassChunks.push(chunk);
    console.log("iterated pass", iteratedPassChunks.length, JSON.stringify(iteratedPassChunks.join("")));

    const nullEncoding = new stream.Readable({ read() {} });
    console.log("null encoding", nullEncoding.setEncoding(null) === nullEncoding, nullEncoding.readableEncoding);
    try {
      new stream.Readable({ read() {} }).setEncoding("not-an-encoding");
    } catch (error) {
      console.log("bad encoding", error.name, error.code);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'data "\u20ac" string',
    'buffered "\u20ac" null',
    "late incomplete null",
    "late base64 AQID null",
    "late pass null",
    'iterated 1 "\ud83d\ude00"',
    "base64 AQID",
    "base64 BA==",
    'latin1 "\u00c2\u00a3"',
    "hex 00ff",
    "hex 10",
    'read pass "\u20ac" null',
    'iterated pass 1 "\u20ac"',
    "null encoding true utf8",
    "bad encoding TypeError ERR_UNKNOWN_ENCODING"
  ]);
});

test("node:stream exposes Node-shaped Readable legacy and static helper metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";
    import { EventEmitter } from "node:events";

    const legacyNames = ["_read", "_undestroy", "_destroy", "push", "unshift", "isPaused", "setEncoding", "read", "pipe", "unpipe", "on", "addListener", "removeListener", "off", "removeAllListeners", "pause", "resume", "wrap", "destroy"];
    console.log("legacy types", legacyNames.map((name) => typeof stream.Readable.prototype[name]).join("|"));
    console.log("legacy meta", legacyNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(stream.Readable.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|"));
    const writableLegacyNames = ["pipe", "write", "end", "destroy", "_write", "_undestroy", "_destroy", "cork", "uncork", "setDefaultEncoding"];
    console.log("writable legacy meta", writableLegacyNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(stream.Writable.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|"));
    const functionPrototypeRow = (fn) => {
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      if (!descriptor) return "no-prototype";
      return [descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(",")].join("/");
    };
    const descriptorRow = (prototype, name) => {
      const label = typeof name === "symbol" ? String(name) : name;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor) {
        const inherited = prototype[name];
        if (typeof inherited !== "function") return [label, "missing", typeof inherited].join(":");
        return [label, "missing", "function", inherited.name, inherited.length, Object.hasOwn(inherited, "prototype"), functionPrototypeRow(inherited)].join(":");
      }
      const value = descriptor.value;
      if (typeof value !== "function") return [label, "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, value === null ? "null" : typeof value].join(":");
      return [label, "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, "function", value.name, value.length, Object.hasOwn(value, "prototype"), functionPrototypeRow(value)].join(":");
    };
    console.log("writable prototype order", Object.getOwnPropertyNames(stream.Writable.prototype).join(","), Object.keys(stream.Writable.prototype).join(","), Object.getOwnPropertySymbols(stream.Writable.prototype).map(String).join(","));
    console.log("writable descriptor shape", ["pipe", "write", "cork", "uncork", "setDefaultEncoding", "_write", "_writev", "end", "destroy", "_destroy", "_undestroy"].map((name) => descriptorRow(stream.Writable.prototype, name)).join("|"));
    const rejectionDescriptor = Object.getOwnPropertyDescriptor(stream.Writable.prototype, Symbol.for("nodejs.rejection"));
    const writableAsyncDescriptor = Object.getOwnPropertyDescriptor(stream.Writable.prototype, Symbol.asyncDispose);
    console.log("writable symbol descriptors", [
      "rejection",
      rejectionDescriptor.enumerable,
      rejectionDescriptor.configurable,
      rejectionDescriptor.writable,
      rejectionDescriptor.value.name,
      rejectionDescriptor.value.length,
      Object.hasOwn(rejectionDescriptor.value, "prototype"),
      functionPrototypeRow(rejectionDescriptor.value)
    ].join(":"), [
      "async",
      writableAsyncDescriptor.enumerable,
      writableAsyncDescriptor.configurable,
      writableAsyncDescriptor.writable,
      writableAsyncDescriptor.value.name,
      writableAsyncDescriptor.value.length,
      Object.hasOwn(writableAsyncDescriptor.value, "prototype"),
      functionPrototypeRow(writableAsyncDescriptor.value)
    ].join(":"));
    const writevDescriptor = Object.getOwnPropertyDescriptor(stream.Writable.prototype, "_writev");
    console.log("writable writev meta", writevDescriptor.value, writevDescriptor.enumerable, writevDescriptor.configurable, writevDescriptor.writable);
    const writableDefaultError = (() => {
      try {
        stream.Writable.prototype._write.call({ _writev: null }, "x", "buffer", () => {});
        return "ok";
      } catch (error) {
        return [error.name, error.code, error.message].join(":");
      }
    })();
    const delegatedWritableRows = [];
    stream.Writable.prototype._write.call({
      _writev(entries, callback) {
        delegatedWritableRows.push(entries[0].chunk + ":" + entries[0].encoding);
        callback();
      }
    }, "x", "utf8", () => delegatedWritableRows.push("callback"));
    const pipeWritable = new stream.Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const pipeRows = [];
    pipeWritable.on("error", (error) => pipeRows.push([error.name, error.code, error.message].join(":")));
    const pipeResult = pipeWritable.pipe(new stream.Writable({ write(_chunk, _encoding, callback) { callback(); } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("writable defaults", writableDefaultError, delegatedWritableRows.join("|"), pipeResult, pipeRows.join("|"), pipeWritable.destroyed, pipeWritable.errored?.code);
    const duplexLegacyNames = ["write", "end", "destroy", "cork", "uncork", "setDefaultEncoding", "_write"];
    console.log("duplex legacy meta", duplexLegacyNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(stream.Duplex.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|"));
    console.log("duplex prototype order", Object.getOwnPropertyNames(stream.Duplex.prototype).join(","), Object.keys(stream.Duplex.prototype).join(","), Object.getOwnPropertySymbols(stream.Duplex.prototype).map(String).join(",") || "<none>");
    console.log("duplex descriptor shape", ["write", "pipe", "cork", "uncork", "setDefaultEncoding", "_write", "_writev", "end", "destroy", "_destroy", "_undestroy", Symbol.asyncDispose].map((name) => descriptorRow(stream.Duplex.prototype, name)).join("|"));
    console.log("duplex async ownership", Object.hasOwn(stream.Duplex.prototype, Symbol.asyncDispose), stream.Duplex.prototype[Symbol.asyncDispose] === stream.Readable.prototype[Symbol.asyncDispose], stream.Duplex.prototype[Symbol.asyncDispose] === stream.Writable.prototype[Symbol.asyncDispose]);
    const duplexWritevDescriptor = Object.getOwnPropertyDescriptor(stream.Duplex.prototype, "_writev");
    const descriptorDuplex = new stream.Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
    console.log("duplex writev/default encoding", duplexWritevDescriptor.value, duplexWritevDescriptor.enumerable, duplexWritevDescriptor.configurable, duplexWritevDescriptor.writable, descriptorDuplex.setDefaultEncoding("utf8") === descriptorDuplex);
    const transformHookNames = ["_final", "_transform", "_write", "_read"];
    console.log("transform hook meta", transformHookNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(stream.Transform.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|"));
    console.log("pass transform meta", descriptorRow(stream.PassThrough.prototype, "_transform"));
    const transformDefaultError = (() => {
      try {
        stream.Transform.prototype._transform.call(new stream.Transform(), "x", "buffer", () => {});
        return "ok";
      } catch (error) {
        return [error.name, error.code, error.message].join(":");
      }
    })();
    const flushedTransform = new stream.Transform({
      flush(callback) {
        callback(null, "flushed");
      }
    });
    const finalRows = [];
    stream.Transform.prototype._final.call(flushedTransform, (error) => {
      finalRows.push(error ? error.code : "ok");
      finalRows.push(String(flushedTransform.read()));
    });
    console.log("transform hook defaults", Object.keys(stream.Transform.prototype).slice(0, 4).join(","), transformDefaultError, finalRows.join("|"));
    console.log("destroy prototype meta", [
      Object.hasOwn(stream.Readable.prototype._destroy, "prototype"),
      Object.getOwnPropertyNames(stream.Readable.prototype._destroy.prototype).join(","),
      Object.hasOwn(stream.Readable.prototype._undestroy, "prototype"),
      Object.getOwnPropertyNames(stream.Readable.prototype._undestroy.prototype).join(","),
      Object.hasOwn(stream.Writable.prototype._destroy, "prototype"),
      Object.getOwnPropertyNames(stream.Writable.prototype._destroy.prototype).join(","),
      Object.hasOwn(stream.Writable.prototype._undestroy, "prototype"),
      Object.getOwnPropertyNames(stream.Writable.prototype._undestroy.prototype).join(",")
    ].join("|"));
    const destroyCallbacks = [];
    const destroyReadable = new stream.Readable({ read() {} });
    destroyReadable.on("error", () => {});
    const destroyWritable = new stream.Writable({ write(chunk, encoding, callback) { callback(); } });
    destroyWritable.on("error", () => {});
    stream.Readable.prototype._destroy.call(destroyReadable, new Error("readable-destroy"), (error) => destroyCallbacks.push("readable:" + error.message));
    stream.Writable.prototype._destroy.call(destroyWritable, new Error("writable-destroy"), (error) => destroyCallbacks.push("writable:" + error.message));
    console.log("destroy callbacks", destroyCallbacks.join("|"));
    destroyReadable.destroy(new Error("readable-boom"));
    destroyWritable.destroy(new Error("writable-boom"));
    stream.Readable.prototype._undestroy.call(destroyReadable);
    stream.Writable.prototype._undestroy.call(destroyWritable);
    console.log("undestroy state", destroyReadable.destroyed, destroyReadable.closed, destroyReadable.errored, destroyReadable.readableAborted, destroyReadable.readable, destroyWritable.destroyed, destroyWritable.closed, destroyWritable.errored, destroyWritable.writableAborted, destroyWritable.writable);

    const listenerReadable = new stream.Readable({ read() {} });
    const listenerRows = [];
    function first() { listenerRows.push("first"); }
    function second() { listenerRows.push("second"); }
    function third() { listenerRows.push("third"); }
    listenerReadable.on("data", first);
    listenerReadable.removeListener("data", first);
    listenerReadable.emit("data", "a");
    listenerReadable.on("data", second);
    listenerReadable.off("data", second);
    listenerReadable.emit("data", "b");
    listenerReadable.on("data", third);
    listenerReadable.removeAllListeners("data");
    listenerReadable.emit("data", "c");
    console.log("listener removal", listenerRows.join("|"), listenerReadable.listenerCount("data"));

    const readable = new stream.Readable();
    console.log("paused", readable.isPaused(), readable.pause() === readable, readable.isPaused(), readable.resume() === readable, readable.isPaused());
    readable.unshift("b");
    readable.unshift("a");
    console.log("unshift", String(readable.read()), String(readable.read()));

    const source = new stream.Readable();
    let output = "";
    const destination = new stream.Writable({
      write(chunk) {
        output += String(chunk);
      }
    });
    console.log("pipe returns", source.pipe(destination) === destination, source.unpipe(destination) === source);
    source.pipe(destination);
    const destinationDone = new Promise((resolve) => destination.on("finish", resolve));
    source.push("take");
    source.push(null);
    await destinationDone;
    console.log("pipe output", output);

    const legacy = new EventEmitter();
    const wrapped = new stream.Readable().wrap(legacy);
    const wrappedChunks = [];
    wrapped.on("data", (chunk) => wrappedChunks.push(String(chunk)));
    const wrappedDone = new Promise((resolve) => wrapped.on("end", resolve));
    legacy.emit("data", "wrap");
    legacy.emit("end");
    await wrappedDone;
    console.log("wrap", wrappedChunks.join(""), wrapped.readableEnded);

    const staticLegacy = new EventEmitter();
    const staticWrapped = stream.Readable.wrap(staticLegacy, { objectMode: true, highWaterMark: 3 });
    const staticWrappedChunks = [];
    staticWrapped.on("data", (chunk) => staticWrappedChunks.push(String(chunk)));
    const staticWrappedDone = new Promise((resolve) => staticWrapped.on("end", resolve));
    staticLegacy.emit("data", "static-a");
    staticLegacy.emit("data", "static-b");
    staticLegacy.emit("end");
    await staticWrappedDone;
    console.log("static wrap", staticWrapped instanceof stream.Readable, staticWrapped.readableObjectMode, staticWrapped.readableHighWaterMark, staticWrappedChunks.join("|"), staticWrapped.readableEnded, staticWrapped.destroyed);

    console.log("readable static keys", Object.keys(stream.Readable).join(","));
	    console.log("readable static internals", ["ReadableState", "_fromList"].map((name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(stream.Readable, name);
	      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
	    }).join("|"));
	    console.log("writable static names", Object.getOwnPropertyNames(stream.Writable).join(","));
	    console.log("duplex static names", Object.getOwnPropertyNames(stream.Duplex).join(","));
	    const writableStateDescriptor = Object.getOwnPropertyDescriptor(stream.Writable, "WritableState");
	    console.log("writable state static", writableStateDescriptor.value.name, writableStateDescriptor.value.length, writableStateDescriptor.enumerable, writableStateDescriptor.configurable, writableStateDescriptor.writable, Object.hasOwn(writableStateDescriptor.value, "prototype"));
	    console.log("writable state prototype", Object.getOwnPropertyNames(stream.Writable.WritableState.prototype).join(","), Object.keys(stream.Writable.WritableState.prototype).join(","));
	    const writableState = new stream.Writable.WritableState({ objectMode: true, highWaterMark: 4, decodeStrings: false, defaultEncoding: "latin1" }, null, false);
	    console.log("writable state instance", Object.keys(writableState).join(","), writableState.objectMode, writableState.highWaterMark, writableState.decodeStrings, writableState.defaultEncoding, writableState.getBuffer().length, writableState.bufferedRequestCount);
	    console.log("readable state prototype", Object.getOwnPropertyNames(stream.Readable.ReadableState.prototype).join(","));
    const stateReadable = new stream.Readable({ objectMode: true, highWaterMark: 3, read() {} });
    console.log("readable state", stateReadable._readableState instanceof stream.Readable.ReadableState, Object.keys(stateReadable._readableState).join(","), stateReadable._readableState.objectMode, stateReadable._readableState.highWaterMark, Array.isArray(stateReadable._readableState.buffer), stateReadable._readableState.length);
    stateReadable.push("state-a");
    stateReadable.push("state-b");
    console.log("readable state buffered", stateReadable._readableState.length, stateReadable._readableState.buffer.join("|"), stateReadable._readableState.flowing, stateReadable._readableState.paused);
    stateReadable.pause();
    console.log("readable state paused", stateReadable._readableState.paused, stateReadable._readableState.flowing);
    stateReadable.resume();
    console.log("readable state resumed", stateReadable._readableState.paused, stateReadable._readableState.flowing);
    stateReadable.on("error", () => {});
    stateReadable.destroy(new Error("state-boom"));
    console.log("readable state destroyed", stateReadable._readableState.destroyed, stateReadable._readableState.closed, stateReadable._readableState.errored.message);
    const listState = new stream.Readable.ReadableState({ highWaterMark: 3 }, null, false);
    listState.buffer.push(Buffer.from("abc"));
    listState.length = 3;
    const listFirst = stream.Readable._fromList(1, listState);
    const listRest = stream.Readable._fromList(2, listState);
    const objectState = new stream.Readable.ReadableState({ objectMode: true }, null, false);
    objectState.buffer.push("one", "two");
    objectState.length = 2;
    console.log("from list", listFirst.toString(), listRest.toString(), listState.buffer.length, stream.Readable._fromList(1, objectState), objectState.buffer.join("|"));

    const invalidWebBridgeRows = [
      ["readable-null", () => stream.Readable.fromWeb(null)],
      ["readable-object", () => stream.Readable.fromWeb({})],
      ["writable-null", () => stream.Writable.fromWeb(null)],
      ["writable-object", () => stream.Writable.fromWeb({})],
      ["duplex-null", () => stream.Duplex.fromWeb(null)],
      ["duplex-missing", () => stream.Duplex.fromWeb()],
      ["duplex-empty", () => stream.Duplex.fromWeb({})],
      ["duplex-bad-writable", () => stream.Duplex.fromWeb({
        readable: new ReadableStream(),
        writable: null
      })]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    });
    console.log("web bridge invalid", invalidWebBridgeRows.join("|"));

    const staticHelpers = [
      ["Readable", "from"],
      ["Readable", "fromWeb"],
      ["Readable", "toWeb"],
      ["Readable", "wrap"],
      ["Writable", "fromWeb"],
      ["Writable", "toWeb"],
      ["Duplex", "from"],
      ["Duplex", "fromWeb"],
      ["Duplex", "toWeb"]
    ];
    console.log("static meta", staticHelpers.map(([constructorName, name]) => {
      const descriptor = Object.getOwnPropertyDescriptor(stream[constructorName], name);
      return [constructorName + "." + name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "legacy types function|function|function|function|function|function|function|function|function|function|function|function|function|function|function|function|function|function|function",
    "legacy meta _read::1:true:true:true|_undestroy:undestroy:0:true:true:true|_destroy::2:true:true:true|push::2:true:true:true|unshift::2:true:true:true|isPaused::0:true:true:true|setEncoding::1:true:true:true|read::1:true:true:true|pipe::2:true:true:true|unpipe::1:true:true:true|on:on:2:true:true:true|addListener:addListener:2:true:true:true|removeListener::2:true:true:true|off::2:true:true:true|removeAllListeners::1:true:true:true|pause::0:true:true:true|resume::0:true:true:true|wrap::1:true:true:true|destroy:destroy:2:true:true:true",
    "writable legacy meta pipe::0:true:true:true|write::3:true:true:true|end::3:true:true:true|destroy::2:true:true:true|_write::3:true:true:true|_undestroy:undestroy:0:true:true:true|_destroy::2:true:true:true|cork::0:true:true:true|uncork::0:true:true:true|setDefaultEncoding:setDefaultEncoding:1:true:true:true",
    "writable prototype order constructor,pipe,write,cork,uncork,setDefaultEncoding,_write,_writev,end,closed,destroyed,writable,writableFinished,writableObjectMode,writableBuffer,writableEnded,writableNeedDrain,writableHighWaterMark,writableCorked,writableLength,errored,writableAborted,destroy,_undestroy,_destroy pipe,write,cork,uncork,setDefaultEncoding,_write,_writev,end,destroy,_undestroy,_destroy Symbol(nodejs.rejection),Symbol(Symbol.asyncDispose)",
    "writable descriptor shape pipe:data:true:true:true:function::0:true:false/false/true/constructor|write:data:true:true:true:function::3:true:false/false/true/constructor|cork:data:true:true:true:function::0:true:false/false/true/constructor|uncork:data:true:true:true:function::0:true:false/false/true/constructor|setDefaultEncoding:data:true:true:true:function:setDefaultEncoding:1:true:false/false/true/constructor|_write:data:true:true:true:function::3:true:false/false/true/constructor|_writev:data:true:true:true:null|end:data:true:true:true:function::3:true:false/false/true/constructor|destroy:data:true:true:true:function::2:true:false/false/true/constructor|_destroy:data:true:true:true:function::2:true:false/false/true/constructor|_undestroy:data:true:true:true:function:undestroy:0:true:false/false/true/constructor",
    "writable symbol descriptors rejection:true:true:true::3:true:false/false/true/constructor async:true:true:true::0:false:no-prototype",
    "writable writev meta null true true true",
    "writable defaults Error:ERR_METHOD_NOT_IMPLEMENTED:The _write() method is not implemented x:utf8|callback undefined Error:ERR_STREAM_CANNOT_PIPE:Cannot pipe, not readable true ERR_STREAM_CANNOT_PIPE",
    "duplex legacy meta write::3:true:true:true|end::3:true:true:true|destroy::2:true:true:true|cork::0:true:true:true|uncork::0:true:true:true|setDefaultEncoding:setDefaultEncoding:1:true:true:true|_write::3:true:true:true",
    "duplex prototype order constructor,write,cork,uncork,setDefaultEncoding,_write,_writev,end,destroy,writable,writableHighWaterMark,writableObjectMode,writableBuffer,writableLength,writableFinished,writableCorked,writableEnded,writableNeedDrain,destroyed write,cork,uncork,setDefaultEncoding,_write,_writev,end,destroy <none>",
    "duplex descriptor shape write:data:true:true:true:function::3:true:false/false/true/constructor|pipe:missing:function::2:true:false/false/true/constructor|cork:data:true:true:true:function::0:true:false/false/true/constructor|uncork:data:true:true:true:function::0:true:false/false/true/constructor|setDefaultEncoding:data:true:true:true:function:setDefaultEncoding:1:true:false/false/true/constructor|_write:data:true:true:true:function::3:true:false/false/true/constructor|_writev:data:true:true:true:null|end:data:true:true:true:function::3:true:false/false/true/constructor|destroy:data:true:true:true:function::2:true:false/false/true/constructor|_destroy:missing:function::2:true:false/false/true/constructor|_undestroy:missing:function:undestroy:0:true:false/false/true/constructor|Symbol(Symbol.asyncDispose):missing:function::0:false:no-prototype",
    "duplex async ownership false true false",
    "duplex writev/default encoding null true true true true",
    "transform hook meta _final:final:1:true:true:true|_transform::3:true:true:true|_write::3:true:true:true|_read::0:true:true:true",
    "pass transform meta _transform:data:true:true:true:function::3:true:false/false/true/constructor",
    "transform hook defaults _final,_transform,_write,_read Error:ERR_METHOD_NOT_IMPLEMENTED:The _transform() method is not implemented ok|flushed",
    "destroy prototype meta true|constructor|true|constructor|true|constructor|true|constructor",
    "destroy callbacks readable:readable-destroy|writable:writable-destroy",
    "undestroy state false false null false true false false null false true",
    "listener removal  0",
    "paused false true true true false",
    "unshift a b",
    "pipe returns true true",
    "pipe output take",
    "wrap wrap true",
	    "static wrap true true 3 static-a|static-b true true",
	    "readable static keys ReadableState,_fromList,from,fromWeb,toWeb,wrap",
	    "readable static internals ReadableState:ReadableState:3:true:true:true:true|_fromList:fromList:2:true:true:true:true",
	    "writable static names length,name,prototype,WritableState,fromWeb,toWeb",
	    "duplex static names length,name,prototype,fromWeb,toWeb,from",
	    "writable state static WritableState 3 true true true true",
	    "writable state prototype constructor,objectMode,finalCalled,needDrain,ending,ended,finished,destroyed,decodeStrings,writing,sync,bufferProcessing,constructed,prefinished,errorEmitted,emitClose,autoDestroy,closed,closeEmitted,allBuffers,allNoop,errored,writable,defaultEncoding,writecb,afterWriteTickInfo,buffered,bufferedRequestCount,getBuffer getBuffer",
	    "writable state instance highWaterMark,length,corked,onwrite,writelen,bufferedIndex,pendingcb true 4 false latin1 0 0",
	    "readable state prototype constructor,objectMode,ended,endEmitted,reading,constructed,sync,needReadable,emittedReadable,readableListening,resumeScheduled,errorEmitted,emitClose,autoDestroy,destroyed,closed,closeEmitted,multiAwaitDrain,readingMore,dataEmitted,errored,defaultEncoding,decoder,encoding,flowing,pipesCount,paused",
    "readable state true highWaterMark,buffer,bufferIndex,length,pipes,awaitDrainWriters true 3 true 0",
    "readable state buffered 2 state-a|state-b null false",
    "readable state paused true false",
    "readable state resumed false true",
    "readable state destroyed true true state-boom",
    "from list a bc 0 one two",
    "web bridge invalid readable-null:TypeError:ERR_INVALID_ARG_TYPE:The \"readableStream\" argument must be an instance of ReadableStream. Received null|readable-object:TypeError:ERR_INVALID_ARG_TYPE:The \"readableStream\" argument must be an instance of ReadableStream. Received an instance of Object|writable-null:TypeError:ERR_INVALID_ARG_TYPE:The \"writableStream\" argument must be an instance of WritableStream. Received null|writable-object:TypeError:ERR_INVALID_ARG_TYPE:The \"writableStream\" argument must be an instance of WritableStream. Received an instance of Object|duplex-null:TypeError:ERR_INVALID_ARG_TYPE:The \"pair\" argument must be of type object. Received null|duplex-missing:TypeError:ERR_INVALID_ARG_TYPE:The \"pair.readable\" property must be an instance of ReadableStream. Received undefined|duplex-empty:TypeError:ERR_INVALID_ARG_TYPE:The \"pair.readable\" property must be an instance of ReadableStream. Received undefined|duplex-bad-writable:TypeError:ERR_INVALID_ARG_TYPE:The \"pair.writable\" property must be an instance of WritableStream. Received null",
    "static meta Readable.from::2:true:true:true|Readable.fromWeb::2:true:true:true|Readable.toWeb::2:true:true:true|Readable.wrap::2:true:true:true|Writable.fromWeb::2:true:true:true|Writable.toWeb::1:true:true:true|Duplex.from::1:true:true:true|Duplex.fromWeb::2:true:true:true|Duplex.toWeb::2:true:true:true"
  ]);
});

test("node:stream exposes Readable iterator helper methods", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";

    const helperNames = ["iterator", "compose", "map", "filter", "flatMap", "drop", "take", "reduce", "toArray", "some", "find", "forEach", "every"];
    console.log("helper types", helperNames.map((name) => typeof stream.Readable.prototype[name]).join("|"));
    console.log("helper meta", helperNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(stream.Readable.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable].join(":");
    }).join("|"));

    const iteratorSource = stream.Readable.from(["i", "j"]);
    const iterator = iteratorSource.iterator({ destroyOnReturn: false });
    const iteratorFirst = await iterator.next();
    await iterator.return();
    console.log("iterator", typeof iterator.next, iteratorFirst.value, iteratorSource.destroyed, (await iteratorSource.toArray()).join(""));

    const composed = await stream.Readable
      .from(["a"])
      .compose(async function* upper(source) {
        for await (const chunk of source) yield String(chunk).toUpperCase();
      })
      .toArray();
    console.log("compose", composed.join(""));

    const mapped = await stream.Readable
      .from([1, 2, 3, 4])
      .map(async (value, options) => {
        if ("signal" in options) return value * 2;
        return 0;
      })
      .filter((value) => value > 4)
      .toArray();
    console.log("mapped", JSON.stringify(mapped));

    const flattened = await stream.Readable
      .from([1, 2])
      .flatMap((value) => [value, value + 10])
      .toArray();
    console.log("flat", JSON.stringify(flattened));

    const windowed = await stream.Readable
      .from([1, 2, 3, 4])
      .drop(1)
      .take(2)
      .toArray();
    console.log("window", JSON.stringify(windowed));

    const takeSource = stream.Readable.from(["a", "b"]);
    const taken = takeSource.take(1);
    console.log(
      "take lifecycle",
      JSON.stringify(await taken.toArray()),
      takeSource.destroyed,
      takeSource.errored?.name,
      takeSource.errored?.code,
      takeSource.readableAborted,
      taken.destroyed,
      taken.errored
    );

    const takeZeroSource = stream.Readable.from(["a", "b"]);
    const takenZero = takeZeroSource.take(0);
    console.log(
      "take zero",
      JSON.stringify(await takenZero.toArray()),
      takeZeroSource.destroyed,
      takeZeroSource.errored?.code,
      takeZeroSource.readableAborted,
      takenZero.destroyed,
      takenZero.readableEnded
    );

    const seen = [];
    await stream.Readable.from(["a", "b"]).forEach((value) => seen.push(value));
    console.log("forEach", seen.join(""));

    console.log("find", await stream.Readable.from([1, 2, 3]).find((value) => value > 1));
    console.log("some", await stream.Readable.from([1, 2, 3]).some((value) => value === 3));
    console.log("every", await stream.Readable.from([1, 2, 3]).every((value) => value > 0));
    console.log("reduce", await stream.Readable.from([1, 2, 3]).reduce((total, value) => total + value, 0));

    const controller = new AbortController();
    controller.abort("stop");
    try {
      await stream.Readable.from([1]).toArray({ signal: controller.signal });
    } catch (error) {
      console.log("abort", error.name, error.code, error.cause);
    }

    for (const action of [
      () => stream.Readable.from([1]).map(1),
      () => stream.Readable.from([1]).filter(1),
      () => stream.Readable.from([1]).take(-1),
    ]) {
      try {
        action();
      } catch (error) {
        console.log("invalid", error.name, error.code);
      }
    }

    for (const action of [
      () => stream.Readable.from([1]).reduce(1),
      () => stream.Readable.from([]).reduce((total, value) => total + value),
    ]) {
      try {
        await action();
      } catch (error) {
        console.log("invalid", error.name, error.code);
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "helper types function|function|function|function|function|function|function|function|function|function|function|function|function",
    "helper meta iterator::1:true|compose:compose:2:true|map:map:2:false|filter:filter:2:false|flatMap:flatMap:2:false|drop:drop:1:false|take:take:1:false|reduce:reduce:3:false|toArray:toArray:1:false|some:some:1:false|find:find:2:false|forEach:forEach:2:false|every:every:1:false",
    "iterator function i false j",
    "compose A",
    "mapped [6,8]",
    "flat [1,11,2,12]",
    "window [2,3]",
    "take lifecycle [\"a\"] true AbortError ABORT_ERR true true null",
    "take zero [] true ABORT_ERR true true true",
    "forEach ab",
    "find 2",
    "some true",
    "every true",
    "reduce 6",
    "abort AbortError ABORT_ERR stop",
    "invalid TypeError ERR_INVALID_ARG_TYPE",
    "invalid TypeError ERR_INVALID_ARG_TYPE",
    "invalid RangeError ERR_OUT_OF_RANGE",
    "invalid TypeError ERR_INVALID_ARG_TYPE",
    "invalid TypeError ERR_MISSING_ARGS"
  ]);
});

test("node:stream exposes default high water mark and buffer probe helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream, {
      Readable,
      _isArrayBufferView,
      _isUint8Array,
      _uint8ArrayToBuffer,
      destroy,
      getDefaultHighWaterMark,
      setDefaultHighWaterMark
    } from "node:stream";

    const previousBinary = getDefaultHighWaterMark(false);
    const previousObject = getDefaultHighWaterMark(true);
    console.log("stream keys", Object.keys(stream).join(","));
    console.log("defaults", previousBinary, previousObject, stream.getDefaultHighWaterMark(false), stream.getDefaultHighWaterMark(true));
    console.log("helper names", _isArrayBufferView.name, _isUint8Array.name, destroy.name, stream.finished.name);
    console.log("helper prototypes", Object.hasOwn(_isArrayBufferView, "prototype"), Object.hasOwn(_isUint8Array, "prototype"));

    setDefaultHighWaterMark(false, 12345);
    setDefaultHighWaterMark(true, 12);
    const binary = new Readable();
    const object = new Readable({ objectMode: true });
    console.log("updated", binary.readableHighWaterMark, object.readableHighWaterMark);

    const view = new DataView(new ArrayBuffer(1));
    const bytes = new Uint8Array([1, 2, 3]);
    const buffer = _uint8ArrayToBuffer(bytes);
    console.log("probes", _isUint8Array(bytes), _isUint8Array(view), _isArrayBufferView(view), Buffer.isBuffer(buffer), buffer.toString("hex"));

    const target = {
      destroy(error) {
        console.log("destroyed", error.message);
      }
    };
    console.log("destroy return", destroy(target, new Error("bye")));

    setDefaultHighWaterMark(false, previousBinary);
    setDefaultHighWaterMark(true, previousObject);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "stream keys isDestroyed,isDisturbed,isErrored,isReadable,isWritable,Readable,Writable,Duplex,Transform,PassThrough,duplexPair,pipeline,addAbortSignal,finished,destroy,compose,setDefaultHighWaterMark,getDefaultHighWaterMark,promises,Stream,_isArrayBufferView,_isUint8Array,_uint8ArrayToBuffer",
    "defaults 65536 16 65536 16",
    "helper names isView isUint8Array destroyer eos",
    "helper prototypes false true",
    "updated 12345 12",
    "probes true false true true 010203",
    "destroyed bye",
    "destroy return undefined"
  ]);
});

test("node:stream addAbortSignal destroys streams with AbortError", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream, { addAbortSignal } from "node:stream";

    const controller = new AbortController();
    const readable = new stream.Readable();
    readable.on("error", (error) => {
      console.log("later", error.name, error.code, error.cause);
    });
    console.log(addAbortSignal(controller.signal, readable) === readable);
    controller.abort("stop");
    await new Promise((resolve) => setTimeout(resolve, 1));
    console.log("destroyed", readable.destroyed);

    const already = new stream.Readable();
    const aborted = new AbortController();
    aborted.abort("now");
    already.on("error", (error) => {
      console.log("already", error.name, error.code, error.cause);
    });
    stream.addAbortSignal(aborted.signal, already);
    console.log("already destroyed", already.destroyed);

    const validationRows = [
      ["missing-signal", () => stream.addAbortSignal(undefined, new stream.PassThrough())],
      ["fake-signal", () => stream.addAbortSignal({}, new stream.PassThrough())],
      ["missing-stream", () => stream.addAbortSignal(new AbortController().signal)],
      ["fake-stream", () => stream.addAbortSignal(new AbortController().signal, {})]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":return";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    });
    console.log("validation", validationRows.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "later AbortError ABORT_ERR stop",
    "destroyed true",
    "already AbortError ABORT_ERR now",
    "already destroyed true",
    "validation missing-signal:TypeError:ERR_INVALID_ARG_TYPE:The \"signal\" argument must be an instance of AbortSignal. Received undefined|fake-signal:TypeError:ERR_INVALID_ARG_TYPE:The \"signal\" argument must be an instance of AbortSignal. Received an instance of Object|missing-stream:TypeError:ERR_INVALID_ARG_TYPE:The \"stream\" argument must be an instance of ReadableStream, WritableStream, or Stream. Received undefined|fake-stream:TypeError:ERR_INVALID_ARG_TYPE:The \"stream\" argument must be an instance of ReadableStream, WritableStream, or Stream. Received an instance of Object"
  ]);
});

test("node:stream exposes common lifecycle state fields", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Duplex, PassThrough, Readable, Writable } from "node:stream";

    const descriptorRow = (prototype, names) => names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return [name, descriptor ? "accessor" : "missing", descriptor?.get ? "get" : "", descriptor?.set ? "set" : "", descriptor?.enumerable, descriptor?.configurable, descriptor?.get?.name ?? "", descriptor?.set?.name ?? ""].join(":");
    }).join("|");
    const readableNames = ["readable", "readableDidRead", "readableAborted", "readableHighWaterMark", "readableBuffer", "readableFlowing", "readableLength", "readableObjectMode", "readableEncoding", "errored", "closed", "destroyed", "readableEnded"];
    const writableNames = ["closed", "destroyed", "writable", "writableFinished", "writableObjectMode", "writableBuffer", "writableEnded", "writableNeedDrain", "writableHighWaterMark", "writableCorked", "writableLength", "errored", "writableAborted"];
    const duplexNames = ["writable", "writableHighWaterMark", "writableObjectMode", "writableBuffer", "writableLength", "writableFinished", "writableCorked", "writableEnded", "writableNeedDrain", "destroyed"];
    console.log("readable descriptors", descriptorRow(Readable.prototype, readableNames));
    console.log("writable descriptors", descriptorRow(Writable.prototype, writableNames));
    console.log("duplex descriptors", descriptorRow(Duplex.prototype, duplexNames));

    const readable = new Readable({ highWaterMark: 3, objectMode: true });
    const descriptorWritable = new Writable({ write() {} });
    const descriptorDuplex = new Duplex({ read() {}, write() {} });
    console.log("state own", ["readable", "readableLength", "destroyed", "closed", "writable", "writableLength"].map((name) => [name, Object.hasOwn(readable, name), Object.hasOwn(descriptorWritable, name), Object.hasOwn(descriptorDuplex, name)].join(":")).join("|"));
    descriptorWritable.cork();
    descriptorWritable.write("x");
    console.log("writable buffer", Array.isArray(descriptorWritable.writableBuffer), descriptorWritable.writableBuffer.length, descriptorWritable.writableLength, descriptorWritable.writableBuffer[0].chunk);
    console.log("readable setup", readable.readableHighWaterMark, readable.readableObjectMode);
    readable.on("data", () => {});
    const readableClosed = new Promise((resolve) => readable.on("close", resolve));
    readable.push("x");
    readable.push(null);
    await readableClosed;
    console.log("readable done", readable.readableEnded, readable.closed, readable.destroyed);

    const writable = new Writable({
      highWaterMark: 2,
      objectMode: true,
      write(chunk) {
        console.log("write", chunk);
      }
    });
    writable.cork();
    writable.cork();
    writable.uncork();
    console.log("writable setup", writable.writableHighWaterMark, writable.writableObjectMode, writable.writableCorked);
    const writableClosed = new Promise((resolve) => writable.on("close", resolve));
    console.log("writable chain", writable.end("ok") === writable, writable.setDefaultEncoding("utf8") === writable);
    await writableClosed;
    console.log("writable done", writable.writableEnded, writable.writableFinished, writable.closed, writable.destroyed);

    const pass = new PassThrough({ objectMode: true });
    pass.on("data", (chunk) => console.log("pass", chunk));
    pass.cork();
    pass.uncork();
    const passClosed = new Promise((resolve) => pass.on("close", resolve));
    console.log("pass chain", pass.end("through") === pass, pass.writableCorked);
    await passClosed;
    console.log("pass done", pass.readableEnded, pass.writableEnded, pass.writableFinished, pass.closed, pass.destroyed);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "readable descriptors readable:accessor:get:set:false:false:get:set|readableDidRead:accessor:get::false:false:get:|readableAborted:accessor:get::false:false:get:|readableHighWaterMark:accessor:get::false:false:get:|readableBuffer:accessor:get::false:false:get:|readableFlowing:accessor:get:set:false:false:get:set|readableLength:accessor:get::false:false:get:|readableObjectMode:accessor:get::false:false:get:|readableEncoding:accessor:get::false:false:get:|errored:accessor:get::false:false:get:|closed:accessor:get::false:false:get:|destroyed:accessor:get:set:false:false:get:set|readableEnded:accessor:get::false:false:get:",
    "writable descriptors closed:accessor:get::false:false:get:|destroyed:accessor:get:set:false:false:get:set|writable:accessor:get:set:false:false:get:set|writableFinished:accessor:get::false:false:get:|writableObjectMode:accessor:get::false:false:get:|writableBuffer:accessor:get::false:false:get:|writableEnded:accessor:get::false:false:get:|writableNeedDrain:accessor:get::false:false:get:|writableHighWaterMark:accessor:get::false:false:get:|writableCorked:accessor:get::false:false:get:|writableLength:accessor:get::false:false:get:|errored:accessor:get::false:false:get:|writableAborted:accessor:get::false:false:get:",
    "duplex descriptors writable:accessor:get:set:false:false:get:set|writableHighWaterMark:accessor:get::false:false:get:|writableObjectMode:accessor:get::false:false:get:|writableBuffer:accessor:get::false:false:get:|writableLength:accessor:get::false:false:get:|writableFinished:accessor:get::false:false:get:|writableCorked:accessor:get::false:false:get:|writableEnded:accessor:get::false:false:get:|writableNeedDrain:accessor:get::false:false:get:|destroyed:accessor:get:set:false:false:get:set",
    "state own readable:false:false:false|readableLength:false:false:false|destroyed:false:false:false|closed:false:false:false|writable:false:false:false|writableLength:false:false:false",
    "writable buffer true 1 1 x",
    "readable setup 3 true",
    "readable done true true true",
    "writable setup 2 true 1",
    "write ok",
    "writable chain true true",
    "writable done true true true true",
    "pass through",
    "pass chain true 0",
    "pass done true true true true true"
  ]);
});

test("node:stream Writable tracks backpressure and corked writes", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Writable } from "node:stream";

    const events = [];
    const writable = new Writable({
      highWaterMark: 3,
      write(chunk, encoding, callback) {
        events.push("_write:" + chunk.length + ":" + writable.writableLength + ":" + writable.writableNeedDrain);
        setTimeout(callback, 0);
      }
    });
    writable.on("drain", () => {
      events.push("drain:" + writable.writableLength + ":" + writable.writableNeedDrain);
    });
    console.log("initial", writable.writableLength, writable.writableNeedDrain);
    console.log("write1", writable.write("aa"), writable.writableLength, writable.writableNeedDrain);
    console.log("write2", writable.write("bb"), writable.writableLength, writable.writableNeedDrain);
    await new Promise((resolve) => writable.once("drain", resolve));
    console.log("later", writable.writableLength, writable.writableNeedDrain);
    console.log(events.join("|"));

    const output = [];
    const corked = new Writable({
      write(chunk, encoding, callback) {
        output.push(String(chunk));
        callback();
      }
    });
    corked.cork();
    console.log("cork write", corked.write("a"), output.join(""), corked.writableLength, corked.writableCorked);
    corked.write("b");
    console.log("before uncork", output.join(""), corked.writableLength, corked.writableCorked);
    console.log("uncork", corked.uncork(), output.join(""), corked.writableLength, corked.writableCorked);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "initial 0 false",
    "write1 true 2 false",
    "write2 false 4 true",
    "later 0 false",
    "_write:2:2:false|_write:2:2:true|drain:0:false",
    "cork write true  1 1",
    "before uncork  2 1",
    "uncork undefined ab 0 0"
  ]);
});

test("node:stream Readable.pipe pauses and resumes for writable backpressure", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Readable, Writable } from "node:stream";

    const source = new Readable({ read() {} });
    const writes = [];
    const drainStates = [];
    const sink = new Writable({
      highWaterMark: 2,
      write(chunk, encoding, callback) {
        writes.push(String(chunk));
        setTimeout(callback, 0);
      }
    });
    sink.on("drain", () => {
      drainStates.push(source.isPaused() + ":" + writes.join(","));
    });

    source.pipe(sink);
    source.push("aa");
    console.log("after first", source.isPaused(), writes.join(","), sink.writableNeedDrain);
    source.push("bb");
    source.push("cc");
    console.log("after queued", source.isPaused(), writes.join(","), sink.writableNeedDrain);
    source.push(null);
    await new Promise((resolve) => sink.on("finish", resolve));
    console.log("final", writes.join(","), drainStates.length, drainStates.every((entry) => entry.startsWith("true:")));

    const unpipeSource = new Readable({ read() {} });
    const unpipeWrites = [];
    const unpipeSink = new Writable({
      highWaterMark: 1,
      write(chunk, encoding, callback) {
        unpipeWrites.push(String(chunk));
        setTimeout(callback, 0);
      }
    });
    unpipeSource.pipe(unpipeSink);
    unpipeSource.push("x");
    const pausedBeforeUnpipe = unpipeSource.isPaused();
    unpipeSource.unpipe(unpipeSink);
    const pausedAfterUnpipe = unpipeSource.isPaused();
    unpipeSource.push("y");
    await new Promise((resolve) => setTimeout(resolve, 5));
    console.log("unpipe cleanup", pausedBeforeUnpipe, pausedAfterUnpipe, unpipeWrites.join(","));

    const endSource = new Readable({ read() {} });
    const endWrites = [];
    const endSink = new Writable({
      write(chunk, encoding, callback) {
        endWrites.push(String(chunk));
        callback();
      }
    });
    endSource.pipe(endSink, { end: false });
    endSource.push("z");
    endSource.push(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("end false", endSink.writableEnded, endSink.writableFinished, endWrites.join(","));
    const endFinished = new Promise((resolve) => endSink.on("finish", resolve));
    endSink.end();
    await endFinished;
    console.log("manual end", endSink.writableEnded, endSink.writableFinished);

    const manuallyPaused = new Readable({ read() {} });
    const manualSink = new Writable({ write(chunk, encoding, callback) { callback(); } });
    manuallyPaused.pause();
    manuallyPaused.pipe(manualSink);
    manuallyPaused.unpipe(manualSink);
    console.log("manual pause", manuallyPaused.isPaused());
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "after first true aa true",
    "after queued true aa true",
    "final aa,bb,cc 3 true",
    "unpipe cleanup true true x",
    "end false false false z",
    "manual end true true",
    "manual pause true"
  ]);
});

test("node:stream exposes duplexPair, web duplex conversion, disturbed state, and async disposal", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";

    const [left, right] = stream.duplexPair();
    const leftChunks = [];
    const rightChunks = [];
    left.on("data", chunk => leftChunks.push(String(chunk)));
    right.on("data", chunk => rightChunks.push(String(chunk)));
    left.write("to-right");
    right.write("to-left");
    left.end("left-end");
    right.end("right-end");
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log("pair", leftChunks.join("|"), rightChunks.join("|"), left.writableEnded, right.writableEnded);

    const readable = stream.Readable.from(["a"]);
    console.log("disturbed statics", ["Readable", "Writable", "Duplex"].map((name) => {
      const constructor = stream[name];
      return [name, Object.hasOwn(constructor, "isDisturbed"), constructor.isDisturbed === stream.isDisturbed].join(":");
    }).join("|"));
    console.log("disturbed before", stream.isDisturbed(readable), stream.Readable.isDisturbed(readable));
    for await (const _chunk of readable) {}
    console.log("disturbed after", stream.isReadable(readable), stream.isDisturbed(readable), stream.Readable.isDisturbed(readable));
    console.log(
      "plain state",
      stream.isReadable({ readable: true }),
      stream.isWritable({ writable: true }),
      stream.isErrored({ errored: new Error("plain") }),
      stream.isDestroyed({ destroyed: true }),
      stream.isDestroyed(null),
      stream.isDisturbed({ readableEnded: true })
    );
    const transform = new stream.PassThrough();
    console.log("transform state", stream.isReadable(transform), stream.isWritable(transform), stream.isErrored(transform), stream.isDestroyed(transform));
    transform.on("error", () => {});
    transform.destroy(new Error("boom"));
    console.log("transform errored", stream.isReadable(transform), stream.isWritable(transform), stream.isErrored(transform), stream.isDestroyed(transform));
    console.log(
      "web state",
      stream.isReadable(new ReadableStream()),
      stream.isWritable(new ReadableStream()),
      stream.isErrored(new ReadableStream()),
      stream.isDisturbed(new ReadableStream()),
      stream.isReadable(new WritableStream()),
      stream.isWritable(new WritableStream()),
      stream.isErrored(new WritableStream()),
      stream.isDisturbed(new WritableStream()),
      stream.isReadable(new TransformStream()),
      stream.isWritable(new TransformStream()),
      stream.isErrored(new TransformStream()),
      stream.isDisturbed(new TransformStream())
    );

    const disposed = new stream.PassThrough();
    await disposed[Symbol.asyncDispose]();
    console.log("disposed", disposed.destroyed, disposed.closed, typeof stream.duplexPair);
    const asyncDisposeOwnerRow = (label, prototype) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, Symbol.asyncDispose);
      const value = prototype[Symbol.asyncDispose];
      if (descriptor) return [label, "own", descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      return [label, "missing", typeof value, value?.name ?? "", value?.length ?? "", typeof value === "function" ? Object.hasOwn(value, "prototype") : ""].join(":");
    };
    console.log("async dispose owners", [
      asyncDisposeOwnerRow("Stream", stream.prototype),
      asyncDisposeOwnerRow("Readable", stream.Readable.prototype),
      asyncDisposeOwnerRow("Writable", stream.Writable.prototype),
      asyncDisposeOwnerRow("Duplex", stream.Duplex.prototype),
      asyncDisposeOwnerRow("Transform", stream.Transform.prototype)
    ].join("|"));

    const pair = {
      readable: new ReadableStream({
        start(controller) {
          controller.enqueue("web");
          controller.close();
        }
      }),
      writable: new WritableStream({
        write(chunk) {
          globalThis.__webWrite = String(chunk);
        }
      })
    };
    const duplex = stream.Duplex.fromWeb(pair);
    duplex.on("data", chunk => console.log("web data", String(chunk)));
    duplex.write("sink");
    duplex.end();
    await new Promise(resolve => setTimeout(resolve, 0));
    const webPair = stream.Duplex.toWeb(duplex);
    console.log("web write", globalThis.__webWrite, typeof webPair.readable.getReader, typeof webPair.writable.getWriter);

    const webCloseEvents = [];
    const closeWritable = stream.Writable.fromWeb(new WritableStream({
      write(chunk) {
        webCloseEvents.push("write:" + String(chunk));
      },
      close() {
        webCloseEvents.push("close");
      }
    }));
    closeWritable.write("close-me");
    closeWritable.end();
    await new Promise(resolve => closeWritable.on("close", resolve));
    console.log("web close", webCloseEvents.join("|"), closeWritable.writableFinished, closeWritable.closed);

    const webAbortEvents = [];
    const abortWritable = stream.Writable.fromWeb(new WritableStream({
      abort(reason) {
        webAbortEvents.push("abort:" + reason.message);
      }
    }));
    abortWritable.on("error", () => {});
    abortWritable.destroy(new Error("abort-me"));
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log("web abort", webAbortEvents.join("|"), abortWritable.destroyed, abortWritable.closed);

    const webCancelEvents = [];
    const cancelReason = new Error("cancel-me");
    const cancelReadable = stream.Readable.fromWeb(new ReadableStream({
      start(controller) {
        controller.enqueue("cancelled");
      },
      cancel(reason) {
        webCancelEvents.push("cancel:" + reason.message);
      }
    }));
    cancelReadable.on("error", () => {});
    cancelReadable.destroy(cancelReason);
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log("web cancel destroy", webCancelEvents.join("|"), cancelReadable.destroyed, cancelReadable.closed, cancelReadable.errored === cancelReason);

    const webBreakEvents = [];
    const breakReadable = stream.Readable.fromWeb(new ReadableStream({
      start(controller) {
        controller.enqueue("first");
      },
      cancel(reason) {
        webBreakEvents.push("cancel:" + reason.name + ":" + reason.code);
      }
    }));
    let breakChunk = "";
    for await (const chunk of breakReadable) {
      breakChunk = String(chunk);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log("web cancel break", breakChunk, webBreakEvents.join("|"), breakReadable.destroyed, breakReadable.closed, breakReadable.errored?.name, breakReadable.errored?.code);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "pair to-left|right-end to-right|left-end true true",
    "disturbed statics Readable:false:true|Writable:false:true|Duplex:false:true",
    "disturbed before false false",
    "disturbed after false true true",
    "plain state false false false null null false",
    "transform state true true false false",
    "transform errored false false true true",
    "web state true null false false null true false false null null false false",
    "disposed true true function",
    "async dispose owners Stream:missing:undefined:::|Readable:own:true:true:true::0:false|Writable:own:true:true:true::0:false|Duplex:missing:function::0:false|Transform:missing:function::0:false",
    "web data web",
    "web write sink function function",
    "web close write:close-me|close true true",
    "web abort abort:abort-me true true",
    "web cancel destroy cancel:cancel-me true true true",
    "web cancel break first cancel:AbortError:ABORT_ERR true true AbortError ABORT_ERR"
  ]);
});

test("node:stream compose chains transform streams", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream, { Transform, compose } from "node:stream";

    const upper = new Transform();
    upper._transform = (chunk, _encoding, callback) => {
      callback(null, String(chunk).toUpperCase());
    };

    const suffix = new Transform();
    suffix._transform = (chunk, _encoding, callback) => {
      callback(null, String(chunk) + "!");
    };

    const duplex = compose(upper, suffix);
    const chunks = [];
    const done = (async () => {
      for await (const chunk of duplex) chunks.push(String(chunk));
    })();

    console.log(stream.compose === compose);
    console.log(duplex.write("a"));
    duplex.end("b");
    await done;
    console.log(chunks.join(""));

    try {
      compose();
    } catch (error) {
      console.log(error.code, error instanceof TypeError);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "true",
    "A!B!",
    "ERR_MISSING_ARGS true"
  ]);
});

test("node:stream/promises supports pipeline and finished", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import stream from "node:stream";
    import { pipeline, finished } from "node:stream/promises";
    const promisesDescriptor = Object.getOwnPropertyDescriptor(stream, "promises");
    console.log("keys", Object.keys(stream.promises).join(","));
    console.log("descriptor", typeof promisesDescriptor.get, typeof promisesDescriptor.set, promisesDescriptor.enumerable, promisesDescriptor.configurable, stream.promises.pipeline === pipeline, stream.promises.finished === finished);
    console.log("metadata", pipeline.name, pipeline.length, finished.name, finished.length);
    const input = new stream.Readable();
    let output = "";
    const writable = new stream.Writable({
      write(chunk) {
        output += String(chunk);
      }
    });

    const done = Promise.all([
      pipeline(input, writable),
      finished(writable)
    ]);

    input.push("pro");
    input.push("mise");
    input.push(null);

    await done;
    console.log(output);

    const abortedInput = new stream.Readable();
    const abortedOutput = new stream.Writable({ write() {} });
    const controller = new AbortController();
    const aborted = pipeline(abortedInput, abortedOutput, { signal: controller.signal })
      .catch(error => [error.name, error.code, error.cause].join(":"));
    abortedInput.push("x");
    controller.abort("stop");
    console.log(await aborted);
    console.log(abortedInput.destroyed, abortedOutput.destroyed);

    const pending = new stream.Writable({ write() {} });
    const finishedController = new AbortController();
    const finishedResult = finished(pending, { signal: finishedController.signal })
      .catch(error => [error.name, error.code, error.cause].join(":"));
    finishedController.abort("finished");
    console.log(await finishedResult);

    async function finishedListenerRow(label, options) {
      const target = new stream.PassThrough();
      const done = finished(target, options);
      target.resume();
      target.end("ok");
      await done;
      console.log(label, ["end", "finish", "error", "close"].map((event) => target.listenerCount(event)).join(","), target.readableEnded, target.writableFinished, target.closed);
    }

    await finishedListenerRow("cleanup-default");
    await finishedListenerRow("cleanup-false", { cleanup: false });
    await finishedListenerRow("cleanup-true", { cleanup: true });

    try {
      finished(new stream.PassThrough(), { cleanup: "yes" });
    } catch (error) {
      console.log("cleanup-invalid", error.name, error.code, error.message);
    }

    console.log("options-invalid", await finished(new stream.PassThrough(), "yes")
      .catch(error => [error.name, error.code, error.message].join(":")));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "keys finished,pipeline",
    "descriptor function undefined true true true true",
    "metadata pipeline 0 finished 2",
    "promise",
    "AbortError:ABORT_ERR:stop",
    "true true",
    "AbortError:ABORT_ERR:finished",
    "cleanup-default 1,1,1,1 true true true",
    "cleanup-false 1,1,1,1 true true true",
    "cleanup-true 0,0,0,0 true true true",
    "cleanup-invalid TypeError ERR_INVALID_ARG_TYPE The \"cleanup\" argument must be of type boolean. Received type string ('yes')",
    "options-invalid TypeError:ERR_INVALID_ARG_TYPE:The \"options\" argument must be of type object. Received type string ('yes')"
  ]);
});

test("node:timers and node:timers/promises expose timer helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/timers.mjs", `
    import timers from 'node:timers';
    import timerPromises from 'node:timers/promises';
    console.log(Object.keys(timers).join(','));
    console.log(Object.keys(timerPromises).join(','));
    const timerMeta = ["setTimeout", "clearTimeout", "setImmediate", "clearImmediate", "setInterval", "clearInterval"].map((name) => name + ":" + timers[name].name + ":" + timers[name].length).join("|");
    const timerPrototypeMeta = ["setTimeout", "setImmediate", "setInterval"].map((name) => {
      const fn = timers[name];
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [name, Object.hasOwn(fn, "prototype"), descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(",")].join(":");
    }).join("|");
    const promisesDescriptor = Object.getOwnPropertyDescriptor(timers, "promises");
    const scheduler = timerPromises.scheduler;
    const schedulerPrototype = Object.getPrototypeOf(scheduler);
    const schedulerSymbols = Object.getOwnPropertySymbols(scheduler);
    const schedulerSymbolRows = schedulerSymbols.map((symbol) => {
      const descriptor = Object.getOwnPropertyDescriptor(scheduler, symbol);
      return [String(symbol), descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value].join(":");
    }).join("|");
    const schedulerPrototypeRows = ["constructor", "yield", "wait"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(schedulerPrototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
    }).join("|");
    console.log(timerMeta);
    console.log(timerPrototypeMeta);
    console.log(["promises", promisesDescriptor.get.name, promisesDescriptor.get.length, Object.hasOwn(promisesDescriptor.get, "prototype"), typeof promisesDescriptor.set, promisesDescriptor.enumerable, promisesDescriptor.configurable].join(":"));
    console.log(["setTimeout", "setImmediate", "setInterval"].map((name) => name + ":" + timerPromises[name].name + ":" + timerPromises[name].length).join("|"));
    console.log(["setTimeout", "setImmediate", "setInterval", "scheduler"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(timerPromises, name);
      return [name, descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value?.name, descriptor.value?.length, Object.hasOwn(descriptor.value ?? {}, "prototype")].join(":");
    }).join("|"));
    console.log("scheduler shape", Object.keys(scheduler).join(",") || "<empty>", Object.getOwnPropertyNames(scheduler).join(",") || "<empty>", schedulerSymbols.map(String).join(",") || "<empty>", schedulerPrototype.constructor.name);
    console.log("scheduler proto", Object.getOwnPropertyNames(schedulerPrototype).join(","), Object.keys(schedulerPrototype).join(",") || "<empty>", schedulerPrototypeRows);
    console.log("scheduler symbols", schedulerSymbolRows);
    await new Promise(resolve => timers.setImmediate(resolve));
    console.log('immediate');
    console.log(await timerPromises.setTimeout(0, 'promise'));
    console.log(await timerPromises.setImmediate('later'));
    console.log(await timerPromises.scheduler.wait(0));
    console.log(await timerPromises.scheduler.yield());

    const timeoutController = new AbortController();
    const timeout = timerPromises.setTimeout(1000, 'nope', { signal: timeoutController.signal })
      .catch(error => [error.name, error.code, error.cause].join(' '));
    timeoutController.abort('timeout');
    console.log(await timeout);

    const immediateController = new AbortController();
    const immediate = timerPromises.setImmediate('nope', { signal: immediateController.signal })
      .catch(error => [error.name, error.code, error.cause].join(' '));
    immediateController.abort('immediate');
    console.log(await immediate);

    const intervalController = new AbortController();
    const interval = timerPromises.setInterval(0, 'tick', { signal: intervalController.signal });
    console.log((await interval.next()).value);
    intervalController.abort('interval');
    try {
      await interval.next();
    } catch (error) {
      console.log([error.name, error.code, error.cause].join(' '));
    }

    try {
      await timerPromises.setTimeout(0, undefined, 'bad');
    } catch (error) {
      console.log(error.code);
    }

    const invalidOptionRows = await Promise.all([
      ["timeout-signal-object", () => timerPromises.setTimeout(0, "x", { signal: {} })],
      ["timeout-signal-null", () => timerPromises.setTimeout(0, "x", { signal: null })],
      ["immediate-signal-object", () => timerPromises.setImmediate("x", { signal: {} })],
      ["scheduler-signal-object", () => timerPromises.scheduler.wait(0, { signal: {} })],
      ["timeout-ref-string", () => timerPromises.setTimeout(0, "x", { ref: "no" })],
      ["interval-signal-object", async () => {
        const iterator = timerPromises.setInterval(0, "x", { signal: {} });
        await iterator.next();
      }]
    ].map(async ([label, action]) => {
      try {
        await action();
        return label + ":resolved";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    }));
    console.log("promise validation", invalidOptionRows.join("|"));
  `);
  const result = await kernel.run("node", ["timers.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "setTimeout,clearTimeout,setImmediate,clearImmediate,setInterval,clearInterval,promises",
    "setTimeout,setImmediate,setInterval,scheduler",
    "setTimeout:setTimeout:2|clearTimeout:clearTimeout:1|setImmediate:setImmediate:1|clearImmediate:clearImmediate:1|setInterval:setInterval:2|clearInterval:clearInterval:1",
    "setTimeout:true:false:false:true:constructor|setImmediate:true:false:false:true:constructor|setInterval:true:false:false:true:constructor",
    "promises:get:0:false:undefined:true:true",
    "setTimeout:setTimeout:2|setImmediate:setImmediate:1|setInterval:setInterval:2",
    "setTimeout:true:true:true:setTimeout:2:true|setImmediate:true:true:true:setImmediate:1:true|setInterval:true:true:true:setInterval:2:true|scheduler:true:true:true:::false",
    "scheduler shape <empty> <empty> Symbol(kScheduler) Scheduler",
    "scheduler proto constructor,yield,wait <empty> constructor:Scheduler:0:false:true:true|yield:yield:0:false:true:true|wait:wait:2:false:true:true",
    "scheduler symbols Symbol(kScheduler):true:true:true:boolean",
    "immediate",
    "promise",
    "later",
    "undefined",
    "undefined",
    "AbortError ABORT_ERR timeout",
    "AbortError ABORT_ERR immediate",
    "tick",
    "AbortError ABORT_ERR interval",
    "ERR_INVALID_ARG_TYPE",
    "promise validation timeout-signal-object:TypeError:ERR_INVALID_ARG_TYPE:The \"options.signal\" property must be an instance of AbortSignal. Received an instance of Object|timeout-signal-null:TypeError:ERR_INVALID_ARG_TYPE:The \"options.signal\" property must be an instance of AbortSignal. Received null|immediate-signal-object:TypeError:ERR_INVALID_ARG_TYPE:The \"options.signal\" property must be an instance of AbortSignal. Received an instance of Object|scheduler-signal-object:TypeError:ERR_INVALID_ARG_TYPE:The \"options.signal\" property must be an instance of AbortSignal. Received an instance of Object|timeout-ref-string:TypeError:ERR_INVALID_ARG_TYPE:The \"options.ref\" property must be of type boolean. Received type string ('no')|interval-signal-object:TypeError:ERR_INVALID_ARG_TYPE:The \"options.signal\" property must be an instance of AbortSignal. Received an instance of Object",
    ""
  ].join("\n"));
});

test("node:timers validates callbacks and disposes handles", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/timer-dispose.mjs", `
    import timers from "node:timers";

    for (const [label, action] of [
      ["timeout", () => timers.setTimeout(undefined, 1)],
      ["interval", () => timers.setInterval(null, 1)],
      ["immediate", () => timers.setImmediate(123)],
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label, error.name, error.code, error.message.includes("callback"));
      }
    }

    const timeout = timers.setTimeout(() => console.log("timeout fired"), 1);
    const interval = timers.setInterval(() => console.log("interval fired"), 1);
    const immediate = timers.setImmediate(() => console.log("immediate fired"));
    console.log(typeof timeout[Symbol.dispose], typeof interval[Symbol.dispose], typeof immediate[Symbol.dispose], typeof timeout[Symbol.toPrimitive]());
    timeout[Symbol.dispose]();
    interval[Symbol.dispose]();
    immediate[Symbol.dispose]();
    await new Promise((resolve) => timers.setTimeout(resolve, 5));
    console.log("disposed");
  `);

  const result = await kernel.run("node", ["timer-dispose.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "timeout TypeError ERR_INVALID_ARG_TYPE true",
    "interval TypeError ERR_INVALID_ARG_TYPE true",
    "immediate TypeError ERR_INVALID_ARG_TYPE true",
    "function function function number",
    "disposed"
  ]);
});

test("top-level timers keep the virtual process alive until cleared", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      let count = 0;
      const timer = setInterval(() => {
        count++;
        console.log(count);
        if (count >= 3) {
          clearInterval(timer);
          console.log('Done!');
        }
      }, 1);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "1\n2\n3\nDone!\n");
});

test("timeout handles expose refresh for Engine.IO heartbeat timers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      let count = 0;
      const timer = setTimeout(() => {
        count++;
        console.log('tick:' + count);
        if (count < 2) timer.refresh();
      }, 1);
      console.log(typeof timer.refresh);
      console.log(timer.refresh() === timer);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function",
    "true",
    "tick:1",
    "tick:2"
  ]);
});

test("unref timers do not keep the virtual process alive", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      setTimeout(() => console.log('late'), 10).unref();
      console.log('done');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "done\n");
});

test("node:worker_threads supports eval workers and parentPort messages", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Worker, isMainThread, threadId } from "node:worker_threads";

    console.log(isMainThread, threadId);
    const worker = new Worker(\`
      const { parentPort, workerData, isMainThread, threadId } = require("worker_threads");
      parentPort.postMessage(workerData.label + ":" + isMainThread + ":" + threadId);
    \`, {
      eval: true,
      workerData: { label: "Worker OK" }
    });
    worker.on("message", console.log);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true 0",
    "Worker OK:false:1"
  ]);
});

test("node:worker_threads exposes stdout and stderr streams", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Worker } from "node:worker_threads";

    const captured = new Worker(\`
      console.log("worker out");
      console.error("worker err");
      process.stdout.write("worker direct out\\\\n");
      process.stderr.write("worker direct err\\\\n");
    \`, { eval: true, stdout: true, stderr: true });
    console.log("capture streams", typeof captured.stdout.on, typeof captured.stderr.on, captured.stdin);
    let capturedOut = "";
    let capturedErr = "";
    captured.stdout.on("data", (chunk) => {
      capturedOut += chunk;
    });
    captured.stderr.on("data", (chunk) => {
      capturedErr += chunk;
    });
    const capturedCode = await new Promise((resolve) => captured.on("exit", resolve));
    console.log("captured", capturedCode, JSON.stringify(capturedOut), JSON.stringify(capturedErr));

    const forwarded = new Worker(\`
      console.log("default out");
      console.error("default err");
    \`, { eval: true });
    console.log("default streams", typeof forwarded.stdout.on, typeof forwarded.stderr.on, forwarded.stdin);
    let forwardedOut = "";
    let forwardedErr = "";
    forwarded.stdout.on("data", (chunk) => {
      forwardedOut += chunk;
    });
    forwarded.stderr.on("data", (chunk) => {
      forwardedErr += chunk;
    });
    const forwardedCode = await new Promise((resolve) => forwarded.on("exit", resolve));
    console.log("forwarded captured", forwardedCode, JSON.stringify(forwardedOut), JSON.stringify(forwardedErr));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "capture streams function function null",
    "captured 0 \"worker out\\nworker direct out\\n\" \"worker err\\nworker direct err\\n\"",
    "default streams function function null",
    "default out",
    "forwarded captured 0 \"default out\\n\" \"default err\\n\""
  ]);
  assert.equal(result.stderr.toString(), "default err\n");
});

test("node:worker_threads supports stdin and truthy stdio capture options", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Worker } from "node:worker_threads";

    async function waitFor(worker) {
      return await new Promise((resolve, reject) => {
        worker.on("error", reject);
        worker.on("exit", resolve);
      });
    }

    const stdinWorker = new Worker(\`
      process.stdin.setEncoding("utf8");
      let body = "";
      process.stdin.on("data", (chunk) => {
        body += chunk;
      });
      process.stdin.on("end", () => {
        console.log(JSON.stringify({
          body,
          hasFd: Object.hasOwn(process.stdin, "fd"),
          hasIsTTY: Object.hasOwn(process.stdin, "isTTY"),
          hasSetRawMode: Object.hasOwn(process.stdin, "setRawMode")
        }));
      });
    \`, { eval: true, stdin: 1, stdout: true });
    console.log("stdin shape", typeof stdinWorker.stdin.write, typeof stdinWorker.stdin.end);
    let stdinOut = "";
    stdinWorker.stdout.on("data", (chunk) => {
      stdinOut += chunk;
    });
    stdinWorker.stdin.write("a");
    stdinWorker.stdin.write(Buffer.from("b"));
    stdinWorker.stdin.end("c");
    console.log("stdin result", await waitFor(stdinWorker), stdinOut.trim());

    const defaultInput = new Worker(\`
      process.stdin.resume();
      process.stdin.on("end", () => console.log("default stdin ended"));
    \`, { eval: true, stdout: true });
    let defaultOut = "";
    defaultInput.stdout.on("data", (chunk) => {
      defaultOut += chunk;
    });
    console.log("default stdin", defaultInput.stdin, await waitFor(defaultInput), defaultOut.trim());

    const falsyRows = [];
    for (const value of [undefined, null, false, 0, ""]) {
      const worker = new Worker("", { eval: true, stdin: value });
      falsyRows.push(worker.stdin === null);
      await waitFor(worker);
    }
    const truthyRows = [];
    for (const value of [1, "yes", true, {}]) {
      const worker = new Worker("", { eval: true, stdin: value });
      truthyRows.push(typeof worker.stdin?.write);
      await waitFor(worker);
    }
    console.log("stdin truthiness", falsyRows.join(","), truthyRows.join(","));

    const truthyCapture = new Worker(\`
      console.log("truthy out");
      console.error("truthy err");
    \`, { eval: true, stdout: 1, stderr: "yes" });
    let truthyOut = "";
    let truthyErr = "";
    truthyCapture.stdout.on("data", (chunk) => {
      truthyOut += chunk;
    });
    truthyCapture.stderr.on("data", (chunk) => {
      truthyErr += chunk;
    });
    console.log(
      "truthy capture",
      await waitFor(truthyCapture),
      JSON.stringify(truthyOut),
      JSON.stringify(truthyErr)
    );
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "stdin shape function function",
    "stdin result 0 {\"body\":\"abc\",\"hasFd\":false,\"hasIsTTY\":false,\"hasSetRawMode\":false}",
    "default stdin null 0 default stdin ended",
    "stdin truthiness true,true,true,true,true function,function,function,function",
    "truthy capture 0 \"truthy out\\n\" \"truthy err\\n\""
  ]);
  assert.equal(result.stderr.toString(), "");
});

test("node:worker_threads closes default stdout and stderr streams without consumers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Worker } from "node:worker_threads";

    const worker = new Worker(\`
      console.log("unconsumed default out");
      console.error("unconsumed default err");
    \`, { eval: true });
    const events = [];
    worker.stdout.on("end", () => events.push("stdout:end"));
    worker.stdout.on("close", () => events.push("stdout:close"));
    worker.stderr.on("end", () => events.push("stderr:end"));
    worker.stderr.on("close", () => events.push("stderr:close"));
    const code = await new Promise((resolve) => worker.on("exit", resolve));
    console.log(
      "lifecycle",
      code,
      events.sort().join(","),
      worker.stdout.readableEnded,
      worker.stdout.destroyed,
      worker.stderr.readableEnded,
      worker.stderr.destroyed
    );
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "unconsumed default out",
    "lifecycle 0 stderr:close,stderr:end,stdout:close,stdout:end true true true true"
  ]);
  assert.equal(result.stderr.toString(), "unconsumed default err\n");
});

test("node:worker_threads resolves file URL worker entries", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      Worker,
      isMainThread,
      parentPort,
      workerData,
    } from "node:worker_threads";

    if (isMainThread) {
      console.log("main thread");

      const worker = new Worker(new URL(import.meta.url), {
        workerData: {
          input: 21,
        },
      });

      worker.on("message", (message) => {
        console.log("worker message:", JSON.stringify(message));
      });

      worker.on("error", (error) => {
        console.error("worker error:", error);
      });

      const exitCode = await new Promise((resolve) => {
        worker.on("exit", resolve);
      });

      console.log("worker exit:", exitCode);
    } else {
      parentPort.postMessage({
        input: workerData.input,
        doubled: workerData.input * 2,
        pid: process.pid,
      });
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.equal(lines[0], "main thread");
  assert.match(lines[1], /^worker message: \{"input":21,"doubled":42,"pid":\d+\}$/);
  assert.equal(lines[2], "worker exit: 0");
});

test("node:worker_threads supports argv, env, threadName, and environment data", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      Worker,
      SHARE_ENV,
      getEnvironmentData,
      isInternalThread,
      setEnvironmentData,
      threadName,
    } from "node:worker_threads";

    setEnvironmentData("config", { answer: 42 });
    process.env.PARENT_ONLY = "parent";

    const probeSource = \`
      const {
        getEnvironmentData,
        isInternalThread,
        parentPort,
        threadName,
        workerData,
      } = require("node:worker_threads");

      process.env.WORKER_ONLY = "worker";
      parentPort.postMessage({
        argv: process.argv.slice(2),
        envFoo: process.env.FOO ?? null,
        parentOnly: process.env.PARENT_ONLY ?? null,
        workerData: workerData ?? null,
        envData: getEnvironmentData("config"),
        threadName,
        isInternalThread,
      });
    \`;

    function runWorker(options) {
      const worker = new Worker(probeSource, { eval: true, ...options });
      return new Promise((resolve, reject) => {
        worker.on("message", (message) => {
          worker.on("exit", (code) => resolve({ message, code }));
        });
        worker.on("error", reject);
      });
    }

    const inherited = await runWorker({
      argv: ["--flag", "value"],
      name: "inherited-probe",
      workerData: { ok: true },
    });
    console.log(JSON.stringify(inherited));
    console.log("parent worker only:", process.env.WORKER_ONLY ?? "missing");

    const replaced = await runWorker({
      argv: ["custom"],
      env: { FOO: "bar" },
      name: "env-probe",
    });
    console.log(JSON.stringify(replaced));

    process.env.PARENT_SHARED = "visible";
    const shared = await runWorker({
      env: SHARE_ENV,
      name: "shared-probe",
    });
    console.log(JSON.stringify(shared));
    console.log("shared worker only:", process.env.WORKER_ONLY);
    console.log("main env data:", JSON.stringify(getEnvironmentData("config")));
    console.log("main thread:", JSON.stringify({ threadName, isInternalThread }));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const lines = result.stdout.toString().trim().split("\n");
  assert.deepEqual(JSON.parse(lines[0]), {
    message: {
      argv: ["--flag", "value"],
      envFoo: null,
      parentOnly: "parent",
      workerData: { ok: true },
      envData: { answer: 42 },
      threadName: "inherited-probe",
      isInternalThread: false
    },
    code: 0
  });
  assert.equal(lines[1], "parent worker only: missing");
  assert.deepEqual(JSON.parse(lines[2]), {
    message: {
      argv: ["custom"],
      envFoo: "bar",
      parentOnly: null,
      workerData: null,
      envData: { answer: 42 },
      threadName: "env-probe",
      isInternalThread: false
    },
    code: 0
  });
  assert.deepEqual(JSON.parse(lines[3]), {
    message: {
      argv: [],
      envFoo: null,
      parentOnly: "parent",
      workerData: null,
      envData: { answer: 42 },
      threadName: "shared-probe",
      isInternalThread: false
    },
    code: 0
  });
  assert.equal(lines[4], "shared worker only: worker");
  assert.equal(lines[5], "main env data: {\"answer\":42}");
  assert.equal(lines[6], "main thread: {\"threadName\":\"\",\"isInternalThread\":false}");
});

test("node:worker_threads exposes normalized resourceLimits metadata", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      Worker,
      resourceLimits,
    } from "node:worker_threads";

    const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, "resourceLimits");
    console.log("main", JSON.stringify(resourceLimits), Object.keys(resourceLimits).join(",") || "<empty>");
    console.log("descriptor", typeof descriptor.get, typeof descriptor.set, descriptor.enumerable, descriptor.configurable);

    const probeSource = \`
      const { parentPort, resourceLimits } = require("node:worker_threads");
      const snapshot = { ...resourceLimits };
      resourceLimits.maxOldGenerationSizeMb = 999;
      parentPort.postMessage({
        snapshot,
        mutated: resourceLimits.maxOldGenerationSizeMb,
        keys: Object.keys(resourceLimits),
      });
    \`;

    async function runWorker(options) {
      const worker = new Worker(probeSource, { eval: true, ...options });
      const initial = worker.resourceLimits;
      const copy = worker.resourceLimits;
      copy.maxYoungGenerationSizeMb = 12345;
      const afterCopy = worker.resourceLimits;
      const message = await new Promise((resolve, reject) => {
        worker.on("message", resolve);
        worker.on("error", reject);
      });
      const code = await new Promise((resolve) => worker.on("exit", resolve));
      return {
        initial,
        afterCopy,
        message,
        code,
        afterExit: worker.resourceLimits,
      };
    }

    const mixed = await runWorker({
      resourceLimits: {
        maxYoungGenerationSizeMb: 8,
        maxOldGenerationSizeMb: "bad",
        codeRangeSizeMb: 64,
        stackSizeMb: 2,
        ignored: 99,
      },
    });
    console.log("mixed initial", JSON.stringify(mixed.initial), Object.keys(mixed.initial).join(","));
    console.log("mixed defensive", JSON.stringify(mixed.afterCopy));
    console.log("mixed worker", JSON.stringify(mixed.message));
    console.log("mixed after", mixed.code, JSON.stringify(mixed.afterExit), Object.keys(mixed.afterExit).join(",") || "<empty>");

    const fallback = await runWorker({ resourceLimits: "bad" });
    console.log("fallback initial", JSON.stringify(fallback.initial));
    console.log("fallback worker", JSON.stringify(fallback.message.snapshot));
    console.log("fallback after", fallback.code, JSON.stringify(fallback.afterExit));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "main {} <empty>",
    "descriptor function undefined false true",
    "mixed initial {\"maxYoungGenerationSizeMb\":8,\"maxOldGenerationSizeMb\":-1,\"codeRangeSizeMb\":64,\"stackSizeMb\":2} maxYoungGenerationSizeMb,maxOldGenerationSizeMb,codeRangeSizeMb,stackSizeMb",
    "mixed defensive {\"maxYoungGenerationSizeMb\":8,\"maxOldGenerationSizeMb\":-1,\"codeRangeSizeMb\":64,\"stackSizeMb\":2}",
    "mixed worker {\"snapshot\":{\"maxYoungGenerationSizeMb\":8,\"maxOldGenerationSizeMb\":-1,\"codeRangeSizeMb\":64,\"stackSizeMb\":2},\"mutated\":999,\"keys\":[\"maxYoungGenerationSizeMb\",\"maxOldGenerationSizeMb\",\"codeRangeSizeMb\",\"stackSizeMb\"]}",
    "mixed after 0 {} <empty>",
    "fallback initial {\"maxYoungGenerationSizeMb\":-1,\"maxOldGenerationSizeMb\":-1,\"codeRangeSizeMb\":-1,\"stackSizeMb\":4}",
    "fallback worker {\"maxYoungGenerationSizeMb\":-1,\"maxOldGenerationSizeMb\":-1,\"codeRangeSizeMb\":-1,\"stackSizeMb\":4}",
    "fallback after 0 {}"
  ]);
});

test("node:worker_threads exposes Worker introspection probe helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { Worker } from "node:worker_threads";

    const accessorNames = ["threadId", "threadName", "stdin", "stdout", "stderr", "resourceLimits"];
    const methodNames = ["postMessage", "terminate", "ref", "unref", "getHeapSnapshot", "getHeapStatistics", "cpuUsage", "startCpuProfile", "startHeapProfile"];
    const accessorRow = accessorNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, name);
      return [name, typeof descriptor.get, typeof descriptor.set, descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length].join(":");
    }).join("|");
    const methodRow = methodNames.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, name);
      return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
    }).join("|");
    console.log("prototype names", Object.getOwnPropertyNames(Worker.prototype).join(","));
    console.log("prototype keys", Object.keys(Worker.prototype).join(",") || "<empty>");
    console.log("accessors", accessorRow);
    console.log("methods", methodRow);

    const worker = new Worker("setInterval(() => {}, 1000)", {
      eval: true,
      name: "probe",
      stdin: true,
      stdout: true,
      stderr: true,
      resourceLimits: { maxYoungGenerationSizeMb: 4 }
    });
    await new Promise((resolve, reject) => {
      worker.once("online", resolve);
      worker.once("error", reject);
    });
    console.log("values", typeof worker.threadId, worker.threadName, typeof worker.stdin.write, typeof worker.stdout.on, typeof worker.stderr.on, Object.hasOwn(worker, "threadId"), Object.hasOwn(worker, "stdin"));
    console.log("limits", JSON.stringify(worker.resourceLimits));

    const heapStats = await worker.getHeapStatistics();
    console.log("heap stats", Object.keys(heapStats).join(","), typeof heapStats.used_heap_size, typeof heapStats.total_allocated_bytes);
    const baseUsage = await worker.cpuUsage();
    const usageDelta = await worker.cpuUsage(baseUsage);
    console.log("cpu usage", Object.keys(baseUsage).join(","), typeof baseUsage.user, typeof usageDelta.system);

    let snapshotBody = "";
    for await (const chunk of await worker.getHeapSnapshot()) snapshotBody += String(chunk);
    const snapshot = JSON.parse(snapshotBody);
    console.log("snapshot", Object.keys(snapshot).join(","), snapshot.snapshot.node_count);

    const cpuProfile = await worker.startCpuProfile();
    const heapProfile = await worker.startHeapProfile();
    const cpuPrototype = Object.getPrototypeOf(cpuProfile);
    const heapPrototype = Object.getPrototypeOf(heapProfile);
    console.log("profile handles", cpuProfile.constructor.name, Object.getOwnPropertyNames(cpuPrototype).join(","), typeof cpuProfile[Symbol.dispose], heapProfile.constructor.name, Object.getOwnPropertyNames(heapPrototype).join(","), typeof heapProfile[Symbol.dispose]);
    const cpuProfileData = JSON.parse(await cpuProfile.stop());
    const heapProfileData = JSON.parse(await heapProfile.stop());
    console.log("profiles", cpuProfileData.nodes[0].callFrame.functionName, Array.isArray(cpuProfileData.samples), heapProfileData.head.callFrame.functionName, Array.isArray(heapProfileData.samples));

    console.log("validation", [
      ["heap-options", () => worker.getHeapSnapshot("bad")],
      ["heap-array", () => worker.getHeapSnapshot([])],
      ["cpu-prev", () => worker.cpuUsage("bad")],
      ["cpu-prev-user", () => worker.cpuUsage({ system: 0 })],
      ["start-cpu", () => worker.startCpuProfile("bad")],
      ["start-heap", () => worker.startHeapProfile("bad")]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return label + ":" + error.code;
      }
    }).join("|"));

    await worker.terminate();
    console.log("after", JSON.stringify(worker.resourceLimits), await worker.cpuUsage().catch((error) => error.code), await worker.getHeapStatistics().catch((error) => error.code));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "prototype names constructor,postMessage,terminate,ref,unref,threadId,threadName,stdin,stdout,stderr,resourceLimits,getHeapSnapshot,getHeapStatistics,cpuUsage,startCpuProfile,startHeapProfile",
    "prototype keys <empty>",
    "accessors threadId:function:undefined:false:true:get threadId:0|threadName:function:undefined:false:true:get threadName:0|stdin:function:undefined:false:true:get stdin:0|stdout:function:undefined:false:true:get stdout:0|stderr:function:undefined:false:true:get stderr:0|resourceLimits:function:undefined:false:true:get resourceLimits:0",
    "methods postMessage:postMessage:0:false:true:true:false|terminate:terminate:0:false:true:true:false|ref:ref:0:false:true:true:false|unref:unref:0:false:true:true:false|getHeapSnapshot:getHeapSnapshot:1:false:true:true:false|getHeapStatistics:getHeapStatistics:0:false:true:true:false|cpuUsage:cpuUsage:1:false:true:true:false|startCpuProfile:startCpuProfile:1:false:true:true:false|startHeapProfile:startHeapProfile:1:false:true:true:false",
    "values number probe function function function false false",
    "limits {\"maxYoungGenerationSizeMb\":4,\"maxOldGenerationSizeMb\":-1,\"codeRangeSizeMb\":-1,\"stackSizeMb\":4}",
    "heap stats total_heap_size,total_heap_size_executable,total_physical_size,total_available_size,used_heap_size,heap_size_limit,malloced_memory,peak_malloced_memory,does_zap_garbage,number_of_native_contexts,number_of_detached_contexts,total_global_handles_size,used_global_handles_size,external_memory,total_allocated_bytes number number",
    "cpu usage user,system number number",
    "snapshot snapshot,nodes,edges,strings 0",
    "profile handles CPUProfileHandle constructor,stop function HeapProfileHandle constructor,stop function",
    "profiles (root) true (root) true",
    "validation heap-options:ERR_INVALID_ARG_TYPE|heap-array:ERR_INVALID_ARG_TYPE|cpu-prev:ERR_INVALID_ARG_TYPE|cpu-prev-user:ERR_INVALID_ARG_TYPE|start-cpu:ERR_INVALID_ARG_TYPE|start-heap:ERR_INVALID_ARG_TYPE",
    "after {} ERR_WORKER_NOT_RUNNING ERR_WORKER_NOT_RUNNING"
  ]);
});

test("node:worker_threads supports ArrayBuffer and MessagePort transfer lists", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      markAsUntransferable,
      MessageChannel,
      MessagePort,
      receiveMessageOnPort,
      Worker,
    } from "node:worker_threads";

    function bytes(buffer) {
      return Array.from(new Uint8Array(buffer)).join(",");
    }

    const { port1, port2 } = new MessageChannel();
    const portBuffer = new ArrayBuffer(4);
    new Uint8Array(portBuffer).set([1, 2, 3, 4]);
    port1.postMessage({ buffer: portBuffer }, [portBuffer]);
    const portReceived = receiveMessageOnPort(port2).message.buffer;
    console.log("port transfer", portBuffer.byteLength, portReceived.byteLength, bytes(portReceived));

    const duplicate = new ArrayBuffer(1);
    try {
      port1.postMessage("duplicate", [duplicate, duplicate]);
    } catch (error) {
      console.log("duplicate", error.name, error.code);
    }

    const marked = new ArrayBuffer(1);
    markAsUntransferable(marked);
    try {
      port1.postMessage("marked", [marked]);
    } catch (error) {
      console.log("marked", error.name, error.code, marked.byteLength);
    }

    const unrelated = new ArrayBuffer(2);
    new Uint8Array(unrelated).set([10, 11]);
    port1.postMessage("unrelated", [unrelated]);
    console.log("unrelated transfer", unrelated.byteLength, receiveMessageOnPort(port2).message);

    const markedUnlisted = new ArrayBuffer(2);
    new Uint8Array(markedUnlisted).set([12, 13]);
    markAsUntransferable(markedUnlisted);
    port1.postMessage({ buffer: markedUnlisted });
    const markedUnlistedClone = receiveMessageOnPort(port2).message.buffer;
    console.log("marked unlisted", markedUnlisted.byteLength, markedUnlistedClone.byteLength, bytes(markedUnlistedClone));

    const detached = new ArrayBuffer(1);
    structuredClone(detached, { transfer: [detached] });
    try {
      port1.postMessage("detached", [detached]);
    } catch (error) {
      console.log("detached", error.name, error.code);
    }

    try {
      port1.postMessage("typed", [new Uint8Array(1)]);
    } catch (error) {
      console.log("typed", error.name, error.code);
    }

    if (typeof SharedArrayBuffer === "function") {
      try {
        port1.postMessage("shared", [new SharedArrayBuffer(1)]);
      } catch (error) {
        console.log("shared", error.name, error.code);
      }
    }

    try {
      port1.postMessage("invalid-list", "abc");
    } catch (error) {
      console.log("invalid list string", error.name, error.code);
    }

    try {
      port1.postMessage("invalid-list", 123);
    } catch (error) {
      console.log("invalid list number", error.name, error.code);
    }

    const { port1: transferPort, port2: transferPeer } = new MessageChannel();
    const closeEvent = new Promise((resolve) => transferPort.once("close", () => resolve("close")));
    port1.postMessage({ port: transferPort }, [transferPort]);
    const movedPort = receiveMessageOnPort(port2).message.port;
    console.log("port original close", await closeEvent);
    movedPort.postMessage("through transferred port");
    transferPeer.postMessage("back through moved port");
    console.log(
      "port transfer moved",
      movedPort instanceof MessagePort,
      receiveMessageOnPort(transferPeer).message,
      receiveMessageOnPort(movedPort).message
    );
    transferPort.postMessage("after transfer");
    console.log("port original detached", String(receiveMessageOnPort(transferPeer)));
    try {
      port1.postMessage("duplicate-port", [transferPeer, transferPeer]);
    } catch (error) {
      console.log("port duplicate", error.name, error.code, error.message.includes("duplicate MessagePort"));
    }
    try {
      port1.postMessage({ port: transferPeer });
    } catch (error) {
      console.log("port missing transfer", error.name, error.code, error.message.includes("not listed"));
    }

    const { port1: wrongListed, port2: wrongListedPeer } = new MessageChannel();
    const { port1: missingPort, port2: missingPeer } = new MessageChannel();
    try {
      port1.postMessage({ port: missingPort }, [wrongListed]);
    } catch (error) {
      console.log("port wrong list", error.name, error.code, error.message.includes("not listed"));
    }
    wrongListed.postMessage("wrong-listed still usable");
    missingPort.postMessage("missing still usable");
    console.log(
      "port wrong list usable",
      receiveMessageOnPort(wrongListedPeer).message,
      receiveMessageOnPort(missingPeer).message
    );

    const { port1: markedPort, port2: markedPeer } = new MessageChannel();
    markAsUntransferable(markedPort);
    try {
      port1.postMessage({ port: markedPort }, [markedPort]);
    } catch (error) {
      console.log("port marked", error.name, error.code, error.message.includes("unsupported type"));
    }
    markedPort.postMessage("marked still usable");
    console.log("port marked usable", receiveMessageOnPort(markedPeer).message);
    movedPort.close();
    transferPeer.close();
    transferPort.close();
    wrongListed.close();
    wrongListedPeer.close();
    missingPort.close();
    missingPeer.close();
    markedPort.close();
    markedPeer.close();
    port1.close();
    port2.close();

    const workerDataBuffer = new ArrayBuffer(3);
    new Uint8Array(workerDataBuffer).set([5, 6, 7]);
    const dataWorker = new Worker(\`
      const { parentPort, workerData } = require("node:worker_threads");
      parentPort.postMessage({ byteLength: workerData.byteLength, bytes: Array.from(new Uint8Array(workerData)) });
    \`, {
      eval: true,
      workerData: workerDataBuffer,
      transferList: [workerDataBuffer]
    });
    console.log("workerData detached", workerDataBuffer.byteLength);
    console.log("workerData received", JSON.stringify(await new Promise((resolve) => dataWorker.once("message", resolve))));

    const postWorker = new Worker(\`
      const { parentPort } = require("node:worker_threads");
      const keepAlive = setInterval(() => {}, 1000);
      parentPort.on("message", (buffer) => {
        clearInterval(keepAlive);
        parentPort.postMessage({ byteLength: buffer.byteLength, bytes: Array.from(new Uint8Array(buffer)) });
      });
    \`, { eval: true });
    await new Promise((resolve) => postWorker.once("online", resolve));
    const postBuffer = new ArrayBuffer(2);
    new Uint8Array(postBuffer).set([8, 9]);
    const postReply = new Promise((resolve) => postWorker.once("message", resolve));
    console.log("post detached", postWorker.postMessage(postBuffer, [postBuffer]), postBuffer.byteLength);
    console.log("post received", JSON.stringify(await postReply));
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "port transfer 0 4 1,2,3,4",
    "duplicate DataCloneError 25",
    "marked DataCloneError 25 1",
    "unrelated transfer 0 unrelated",
    "marked unlisted 2 2 12,13",
    "detached DataCloneError 25",
    "typed DataCloneError 25",
    "shared DataCloneError 25",
    "invalid list string TypeError ERR_INVALID_ARG_TYPE",
    "invalid list number TypeError ERR_INVALID_ARG_TYPE",
    "port original close close",
    "port transfer moved true through transferred port back through moved port",
    "port original detached undefined",
    "port duplicate DataCloneError 25 true",
    "port missing transfer DataCloneError 25 true",
    "port wrong list DataCloneError 25 true",
    "port wrong list usable wrong-listed still usable missing still usable",
    "port marked DataCloneError 25 true",
    "port marked usable marked still usable",
    "workerData detached 0",
    'workerData received {"byteLength":3,"bytes":[5,6,7]}',
    "post detached true 0",
    'post received {"byteLength":2,"bytes":[8,9]}'
  ]);
});

test("node:worker_threads markAsUncloneable rejects native-shaped clone targets", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      markAsUncloneable,
      MessageChannel,
      receiveMessageOnPort,
      Worker,
    } from "node:worker_threads";

    function cloneRow(label, action) {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.constructor.name, error.name, error.code, error.message].join(":");
      }
    }

    const { port1, port2 } = new MessageChannel();
    const plain = { ok: true };
    const nested = { value: true };
    const array = [1, 2];
    const nullPrototype = Object.assign(Object.create(null), { ok: true });
    class Custom {
      constructor() {
        this.ok = true;
      }
    }
    const custom = new Custom();
    const errorValue = new Error("marked");
    const date = new Date(0);
    const regexp = /marked/gi;
    const map = new Map([["entry", { ok: true }]]);
    const set = new Set([{ ok: true }]);
    const buffer = new ArrayBuffer(2);
    const typed = new Uint8Array([3, 4]);

    for (const value of [plain, nested, array, nullPrototype, custom, errorValue, date, regexp, map, set, buffer, typed]) {
      markAsUncloneable(value);
    }

    console.log(cloneRow("plain", () => port1.postMessage(plain)));
    console.log(cloneRow("nested", () => port1.postMessage({ nested })));
    console.log(cloneRow("null-proto", () => port1.postMessage(nullPrototype)));
    console.log(cloneRow("class", () => port1.postMessage(custom)));
    console.log(cloneRow("error", () => port1.postMessage(errorValue)));
    port1.postMessage(array);
    port1.postMessage(date);
    port1.postMessage(regexp);
    port1.postMessage(map);
    port1.postMessage(set);
    port1.postMessage(buffer);
    port1.postMessage(typed);
    const arrayClone = receiveMessageOnPort(port2).message;
    const dateClone = receiveMessageOnPort(port2).message;
    const regexpClone = receiveMessageOnPort(port2).message;
    const mapClone = receiveMessageOnPort(port2).message;
    const setClone = receiveMessageOnPort(port2).message;
    const bufferClone = receiveMessageOnPort(port2).message;
    const typedClone = receiveMessageOnPort(port2).message;
    console.log(
      "allowed",
      Array.isArray(arrayClone),
      arrayClone.join(","),
      dateClone.getTime(),
      regexpClone.source + "/" + regexpClone.flags,
      mapClone.get("entry").ok,
      setClone.values().next().value.ok,
      bufferClone.byteLength,
      Array.from(typedClone).join(",")
    );

    const workerData = { workerData: true };
    markAsUncloneable(workerData);
    console.log(cloneRow("workerData", () => new Worker("", { eval: true, workerData })));

    const worker = new Worker(\`
      const { parentPort } = require("node:worker_threads");
      const keepAlive = setInterval(() => {}, 1000);
      parentPort.on("message", () => {
        clearInterval(keepAlive);
        parentPort.postMessage("unexpected");
      });
    \`, { eval: true });
    await new Promise((resolve) => worker.once("online", resolve));
    const postValue = { post: true };
    markAsUncloneable(postValue);
    console.log(cloneRow("worker-post", () => worker.postMessage(postValue)));
    console.log("primitive", markAsUncloneable(1), markAsUncloneable("x"), markAsUncloneable(null));
    console.log("worker exit", await worker.terminate());
    port1.close();
    port2.close();
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "plain:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "nested:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "null-proto:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "class:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "error:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "allowed true 1,2 0 marked/gi true true 2 3,4",
    "workerData:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "worker-post:DOMException:DataCloneError:25:Cannot clone object of unsupported type.",
    "primitive undefined undefined undefined",
    "worker exit 1"
  ]);
});

test("node:worker_threads keeps worker timers alive until cleared", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const { Worker } = require("node:worker_threads");
    const worker = new Worker(\`
      const { parentPort } = require("node:worker_threads");
      let count = 0;
      const timer = setInterval(() => {
        count++;
        parentPort.postMessage(count);
        if (count === 2) clearInterval(timer);
      }, 1);
    \`, { eval: true });
    worker.on("message", console.log);
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "1\n2\n");
});

test("global MessageChannel keeps the virtual process alive until messages deliver", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = event => console.log(event.data);
      port2.postMessage("MessageChannel works!");
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "MessageChannel works!\n");
});

test("node:worker_threads MessageChannel emits Node-style message events", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { MessageChannel } = require("node:worker_threads");
      const { port1, port2 } = new MessageChannel();
      port1.on("message", console.log);
      port2.postMessage("worker_threads MessageChannel works!");
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "worker_threads MessageChannel works!\n");
});

test("node:worker_threads receiveMessageOnPort drains queued MessageChannel messages", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      (async () => {
        const { MessageChannel, receiveMessageOnPort } = require("node:worker_threads");
        const { port1, port2 } = new MessageChannel();
        const delivered = [];
        port2.on("message", (message) => delivered.push(message));

        port1.postMessage({ ok: true });
        console.log(JSON.stringify(receiveMessageOnPort(port2)));
        console.log(String(receiveMessageOnPort(port2)));
        await new Promise((resolve) => setTimeout(resolve, 1));
        console.log(JSON.stringify(delivered));

        try {
          receiveMessageOnPort({});
        } catch (error) {
          console.log(error.name, error.code, error.message.includes("MessagePort instance"));
        }

        port1.postMessage("event");
        console.log(await new Promise((resolve) => port2.once("message", resolve)));
        console.log(String(receiveMessageOnPort(port2)));
        port1.close();
        port2.close();
      })();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    '{"message":{"ok":true}}',
    "undefined",
    "[]",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "event",
    "undefined"
  ]);
});

test("node:worker_threads exposes package compatibility helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      BroadcastChannel,
      isMarkedAsUntransferable,
      locks,
      markAsUncloneable,
      markAsUntransferable,
      MessageChannel,
      MessagePort,
      moveMessagePortToContext,
      postMessageToThread,
      receiveMessageOnPort,
    } from "node:worker_threads";
    import { createContext } from "node:vm";
    const workerThreadsNamespace = await import("node:worker_threads");
    const workerThreads = workerThreadsNamespace.default ?? workerThreadsNamespace;

    console.log(Object.keys(workerThreads).join(","));
    console.log("main workerData", workerThreads.workerData === null, typeof workerThreads.workerData);
    console.log("share env", String(workerThreads.SHARE_ENV), Symbol.keyFor(workerThreads.SHARE_ENV));
    console.log([
      ["BroadcastChannel", BroadcastChannel],
      ["MessageChannel", MessageChannel],
      ["MessagePort", MessagePort],
      ["markAsUncloneable", markAsUncloneable],
      ["moveMessagePortToContext", moveMessagePortToContext],
      ["postMessageToThread", postMessageToThread],
    ].map(([name, value]) => name + ":" + value.name + ":" + value.length).join("|"));
    const helperPrototypeNames = [
      "MessageChannel",
      "markAsUncloneable",
      "markAsUntransferable",
      "isMarkedAsUntransferable",
      "setEnvironmentData",
      "getEnvironmentData",
      "receiveMessageOnPort",
      "moveMessagePortToContext",
      "postMessageToThread"
    ];
    const constructTag = (fn) => {
      try {
        const instance = new fn();
        instance.port1?.close?.();
        instance.port2?.close?.();
        return "ok";
      } catch (error) {
        return error.code || (String(error.message).includes("not a constructor") ? "notConstructor" : error.name);
      }
    };
    const functionPrototypeRow = (fn) => {
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [
        fn?.name,
        fn?.length,
        Object.hasOwn(fn, "prototype"),
        prototypeDescriptor?.enumerable,
        prototypeDescriptor?.configurable,
        prototypeDescriptor?.writable,
        Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
        constructTag(fn)
      ].join(":");
    };
    const accessorFunctionPrototypeRow = (fn) => {
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [
        fn?.name,
        fn?.length,
        Object.hasOwn(fn, "prototype"),
        prototypeDescriptor?.enumerable,
        prototypeDescriptor?.configurable,
        prototypeDescriptor?.writable,
        Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(",")
      ].join(":");
    };
    console.log("helper prototypes", helperPrototypeNames.map((name) => name + ":" + functionPrototypeRow(workerThreads[name])).join("|"));
    console.log("broadcast accessors", ["onmessage", "onmessageerror"].map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(BroadcastChannel.prototype, name);
      return [name, descriptor.enumerable, descriptor.configurable, accessorFunctionPrototypeRow(descriptor.get), accessorFunctionPrototypeRow(descriptor.set)].join(":");
    }).join("|"));
    try {
      MessageChannel();
    } catch (error) {
      console.log("channel call", error.name, error.code, error.message);
    }

    const { port1, port2 } = new MessageChannel();
    console.log(
      "ports",
      port1 instanceof MessagePort,
      Object.getPrototypeOf(port1) === MessagePort.prototype,
      port1.hasRef(),
      port1.unref(),
      port1.hasRef(),
      port1.ref(),
      port1.hasRef()
    );
    const postMessageDescriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, "postMessage");
    const onmessageDescriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, "onmessage");
    const messagePortPrototypeRow = (name) => {
      const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, name);
      const functionPrototypeRow = (fn) => {
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        return [
          fn?.name,
          fn?.length,
          Object.hasOwn(fn, "prototype"),
          prototypeDescriptor?.enumerable,
          prototypeDescriptor?.configurable,
          prototypeDescriptor?.writable,
          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(",")
        ].join(":");
      };
      if ("value" in descriptor) {
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          functionPrototypeRow(descriptor.value)
        ].join(":");
      }
      return [
        name,
        descriptor.enumerable,
        descriptor.configurable,
        "get",
        functionPrototypeRow(descriptor.get),
        "set",
        functionPrototypeRow(descriptor.set)
      ].join(":");
    };
    console.log(
      "port descriptors",
      postMessageDescriptor.enumerable,
      MessagePort.prototype.postMessage.length,
      typeof onmessageDescriptor.get,
      typeof onmessageDescriptor.set,
      onmessageDescriptor.enumerable
    );
    console.log("port prototype names", Object.getOwnPropertyNames(MessagePort.prototype).join(","));
    console.log("port prototype keys", Object.keys(MessagePort.prototype).join(","));
    console.log("port prototype metadata", Object.getOwnPropertyNames(MessagePort.prototype).map(messagePortPrototypeRow).join("|"));
    try {
      new MessagePort();
    } catch (error) {
      console.log("port constructor", error.name, error.code, error.message.includes("Constructor cannot be called"));
    }
    port1.close();
    port2.close();

    const { port1: contextPort, port2: contextPeer } = new MessageChannel();
    const movedPort = moveMessagePortToContext(contextPort, createContext({}));
    console.log(
      "moved port",
      movedPort !== contextPort,
      movedPort instanceof MessagePort,
      Object.getPrototypeOf(movedPort) === MessagePort.prototype,
      movedPort.constructor.name,
      typeof movedPort.on,
      typeof movedPort.addEventListener,
      typeof movedPort.postMessage,
      typeof movedPort.start,
      typeof movedPort.ref,
      typeof movedPort.close
    );
    console.log("moved own", Object.getOwnPropertyNames(movedPort).join(","), Object.getOwnPropertySymbols(movedPort).length);
    console.log("moved proto", Object.getOwnPropertyNames(Object.getPrototypeOf(movedPort)).join(","));
    console.log("moved proto2", Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(movedPort))).join(","));
    movedPort.postMessage("to-peer");
    console.log("moved peer", receiveMessageOnPort(contextPeer).message);
    contextPeer.postMessage("to-moved");
    console.log("moved receive", receiveMessageOnPort(movedPort).message, receiveMessageOnPort(movedPort));
    console.log("moved ref", movedPort.hasRef(), movedPort.ref(), movedPort.hasRef(), movedPort.unref(), movedPort.hasRef());
    const movedValidationRows = [
      ["missing", () => moveMessagePortToContext()],
      ["nonport", () => moveMessagePortToContext({}, createContext({}))],
      ["missing-context", () => moveMessagePortToContext(contextPeer)],
      ["non-context", () => moveMessagePortToContext(contextPeer, {})]
    ].map(([label, action]) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    }).join("|");
    console.log("moved validation", movedValidationRows);
    movedPort.close();
    contextPeer.close();

    const object = {};
    console.log(isMarkedAsUntransferable(object));
    console.log(markAsUntransferable(object), isMarkedAsUntransferable(object));
    console.log(markAsUncloneable(object));

    const name = "worker-probe-" + Date.now();
    const first = new BroadcastChannel(name);
    const second = new BroadcastChannel(name);
    const received = await new Promise((resolve) => {
      second.addEventListener("message", (event) => resolve(event.data.ok));
      first.postMessage({ ok: true });
    });
    console.log("broadcast", received);
    first.close();
    second.close();

    console.log("locks before", JSON.stringify(await locks.query()));
    const lockResult = await locks.request("resource", async (lock) => {
      console.log("lock", lock.name, lock.mode, JSON.stringify(await locks.query()));
      return 42;
    });
    console.log("lock result", lockResult);
    console.log("locks after", JSON.stringify(await locks.query()));

    const validationRow = async (label, action) => {
      try {
        await action();
        return label + ":ok";
      } catch (error) {
        return [label, error.name, error.code, error.message].join(":");
      }
    };
    console.log("locks validation", (await Promise.all([
      validationRow("missing", () => locks.request("resource")),
      validationRow("number", () => locks.request("resource", 1)),
      validationRow("object", () => locks.request("resource", {}))
    ])).join("|"));
    console.log("postMessage validation", (await Promise.all([
      validationRow("timeout-array", () => postMessageToThread(999999, { ok: true }, [], [])),
      validationRow("timeout-string", () => postMessageToThread(999999, { ok: true }, [], "5")),
      validationRow("timeout-negative", () => postMessageToThread(999999, { ok: true }, [], -1)),
      validationRow("timeout-nan", () => postMessageToThread(999999, { ok: true }, [], NaN)),
      validationRow("timeout-zero", () => postMessageToThread(999999, { ok: true }, [], 0))
    ])).join("|"));

    try {
      await postMessageToThread(999999, { ok: true });
    } catch (error) {
      console.log(error.code, error.message.includes("destination thread"));
    }
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "isInternalThread,isMainThread,MessagePort,MessageChannel,markAsUncloneable,markAsUntransferable,isMarkedAsUntransferable,moveMessagePortToContext,receiveMessageOnPort,resourceLimits,postMessageToThread,threadId,threadName,SHARE_ENV,Worker,parentPort,workerData,BroadcastChannel,setEnvironmentData,getEnvironmentData,locks",
    "main workerData true object",
    "share env Symbol(nodejs.worker_threads.SHARE_ENV) nodejs.worker_threads.SHARE_ENV",
    "BroadcastChannel:BroadcastChannel:1|MessageChannel:MessageChannel:0|MessagePort:MessagePort:0|markAsUncloneable:markAsUncloneable:1|moveMessagePortToContext:moveMessagePortToContext:0|postMessageToThread:postMessageToThread:4",
    "helper prototypes MessageChannel:MessageChannel:0:true:false:false:true:constructor:ok|markAsUncloneable:markAsUncloneable:1:true:false:false:true:constructor:ok|markAsUntransferable:markAsUntransferable:1:true:false:false:true:constructor:ok|isMarkedAsUntransferable:isMarkedAsUntransferable:1:true:false:false:true:constructor:ok|setEnvironmentData:setEnvironmentData:2:true:false:false:true:constructor:ok|getEnvironmentData:getEnvironmentData:1:true:false:false:true:constructor:ok|receiveMessageOnPort:receiveMessageOnPort:1:true:false:false:true:constructor:ERR_INVALID_ARG_TYPE|moveMessagePortToContext:moveMessagePortToContext:0:false:::::notConstructor|postMessageToThread:postMessageToThread:4:false:::::notConstructor",
    "broadcast accessors onmessage:true:true:get onmessage:0:true:false:false:true:constructor:set onmessage:1:true:false:false:true:constructor|onmessageerror:true:true:get onmessageerror:0:true:false:false:true:constructor:set onmessageerror:1:true:false:false:true:constructor",
    "channel call TypeError ERR_CONSTRUCT_CALL_REQUIRED Cannot call constructor without `new`",
    "ports true true false undefined false undefined true",
    "port descriptors true 0 function function true",
    "port prototype names postMessage,start,constructor,ref,unref,hasRef,onmessage,onmessageerror,close",
    "port prototype keys postMessage,start,ref,unref,hasRef,onmessage,onmessageerror,close",
    "port prototype metadata postMessage:true:true:true:postMessage:0:false::::|start:true:true:true:start:0:false::::|constructor:false:true:true:MessagePort:0:true:false:false:true:postMessage,start,constructor,ref,unref,hasRef,onmessage,onmessageerror,close|ref:true:true:true:ref:0:false::::|unref:true:true:true:unref:0:false::::|hasRef:true:true:true:hasRef:0:true:false:false:true:constructor|onmessage:true:true:get:get onmessage:0:true:false:false:true:constructor:set:set onmessage:1:true:false:false:true:constructor|onmessageerror:true:true:get:get onmessageerror:0:true:false:false:true:constructor:set:set onmessageerror:1:true:false:false:true:constructor|close:true:true:true:close:1:true:false:false:true:constructor",
    "port constructor TypeError ERR_CONSTRUCT_CALL_INVALID true",
    "moved port true false false MessagePort undefined undefined function function function function",
    "moved own  0",
    "moved proto postMessage,start,constructor",
    "moved proto2 close,hasRef,ref,unref,constructor",
    "moved peer to-peer",
    "moved receive to-moved undefined",
    "moved ref false undefined true undefined false",
    "moved validation missing:TypeError:ERR_INVALID_ARG_TYPE:The \"port\" argument must be a MessagePort instance|nonport:TypeError:ERR_INVALID_ARG_TYPE:The \"port\" argument must be a MessagePort instance|missing-context:TypeError:ERR_INVALID_ARG_TYPE:Invalid context argument|non-context:TypeError:ERR_INVALID_ARG_TYPE:Invalid context argument",
    "false",
    "undefined true",
    "undefined",
    "broadcast true",
    'locks before {"held":[],"pending":[]}',
    'lock resource exclusive {"held":[{"name":"resource","mode":"exclusive"}],"pending":[]}',
    "lock result 42",
    'locks after {"held":[],"pending":[]}',
    'locks validation missing:TypeError:ERR_INVALID_ARG_TYPE:The "callback" argument must be of type function. Received undefined|number:TypeError:ERR_INVALID_ARG_TYPE:The "callback" argument must be of type function. Received type number (1)|object:TypeError:ERR_INVALID_ARG_TYPE:The "callback" argument must be of type function. Received an instance of Object',
    'postMessage validation timeout-array:TypeError:ERR_INVALID_ARG_TYPE:The "timeout" argument must be of type number. Received an instance of Array|timeout-string:TypeError:ERR_INVALID_ARG_TYPE:The "timeout" argument must be of type number. Received type string (\'5\')|timeout-negative:RangeError:ERR_OUT_OF_RANGE:The value of "timeout" is out of range. It must be >= 0. Received -1|timeout-nan:RangeError:ERR_OUT_OF_RANGE:The value of "timeout" is out of range. It must be >= 0. Received NaN|timeout-zero:Error:ERR_WORKER_MESSAGING_TIMEOUT:Sending a message to another thread timed out',
    "ERR_WORKER_MESSAGING_FAILED true"
  ]);
});

test("timer callback errors are contained in the virtual process", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    "setTimeout(() => { throw new Error('timer boom'); }, 1);"
  ], { cwd: "/workspace" });

  assert.equal(result.status, 1);
  assert.match(result.stderr.toString(), /timer boom/);
});

test("node:events exposes once promise helper", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { EventEmitter, once } from "node:events";

    const emitter = new EventEmitter();
    setTimeout(() => {
      emitter.emit("ready", {
        ok: true,
        at: 123,
      });
    }, 1);

    const [payload] = await once(emitter, "ready");
    console.log("once payload:", payload);

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort("timeout hit");
    }, 1);

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10);

        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(controller.signal.reason);
        });
      });
    } catch (error) {
      console.log("aborted with:", error);
    }

    async function* numbers() {
      for (let i = 1; i <= 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        yield i;
      }
    }

    for await (const n of numbers()) {
      console.log("async iter:", n);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "once payload: {\"ok\":true,\"at\":123}",
    "aborted with: timeout hit",
    "async iter: 1",
    "async iter: 2",
    "async iter: 3"
  ]);
});

test("node:events exposes on async iterator helper", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { EventEmitter, on } from "node:events";

    const emitter = new EventEmitter();
    setTimeout(() => emitter.emit("item", "first"), 1);
    setTimeout(() => emitter.emit("item", "second"), 2);

    for await (const [value] of on(emitter, "item")) {
      console.log(value);
      if (value === "second") break;
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "first",
    "second"
  ]);
});

test("node:events on async iterator honors close events", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { EventEmitter, on } from "node:events";

    const emitter = new EventEmitter();
    const seen = [];
    setTimeout(() => {
      emitter.emit("item", "first");
      emitter.emit("finish");
      emitter.emit("item", "ignored");
    }, 1);

    for await (const [value] of on(emitter, "item", { close: ["finish"] })) {
      seen.push(value);
    }

    console.log(seen.join(","));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "first\n");
});

test("node:events once and on support EventTarget sources", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import { once, on } from "node:events";

    const controller = new AbortController();
    const abortPromise = once(controller.signal, "abort");
    controller.abort("native-reason");
    const [abortEvent] = await abortPromise;
    console.log("once", abortEvent.type, abortEvent.target === controller.signal, controller.signal.reason);

    const target = new EventTarget();
    const iterator = on(target, "message", { close: ["close"] });
    target.dispatchEvent(new Event("message"));
    target.dispatchEvent(new Event("close"));
    let count = 0;
    for await (const [event] of iterator) {
      console.log("on", event.type, event.target === target);
      count++;
    }
    console.log("count", count);

    const signal = new AbortController();
    const aborted = on(new EventTarget(), "message", { signal: signal.signal });
    const result = aborted.next().catch((error) => [error.name, error.code, error.cause].join(":"));
    signal.abort("stop");
    console.log("abort", await result);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "once abort true native-reason",
    "on message true",
    "count 1",
    "abort AbortError:ABORT_ERR:stop"
  ]);
});

test("EventEmitter methods can be mixed into plain objects", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require('node:events');
      function app() {}
      for (const name of Object.getOwnPropertyNames(EventEmitter.prototype)) {
        if (name !== 'constructor') app[name] = EventEmitter.prototype[name];
      }
      app.on('ready', value => console.log(value));
      app.emit('ready', 'ok');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ok\n");
});

test("node:events default export is the EventEmitter constructor", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const EventEmitter = require('node:events');
      const { EventEmitter: NamedEventEmitter } = require('node:events');
      class Custom extends EventEmitter {}
      console.log(EventEmitter === NamedEventEmitter);
      console.log(new Custom() instanceof EventEmitter);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\ntrue\n");
});

test("node:events exposes enumerable listener methods for package proxies", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require('node:events');
      console.log(Object.keys(EventEmitter.prototype).includes('on'));
      const emitter = new EventEmitter();
      emitter.prependListener('event', () => console.log('first'));
      emitter.on('event', () => console.log('second'));
      console.log(emitter.eventNames()[0]);
      emitter.emit('event');
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "event",
    "first",
    "second"
  ]);
});

test("node:events exposes static package compatibility helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const events = require("node:events");
      const describeDescriptor = (key) => {
        const descriptor = Object.getOwnPropertyDescriptor(events, key);
        return JSON.stringify([
          key,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable ?? null,
          typeof descriptor.get,
          typeof descriptor.set,
          typeof descriptor.value
        ]);
      };
      const describePrototypeDescriptor = (key) => {
        const descriptor = Object.getOwnPropertyDescriptor(events.EventEmitter.prototype, key);
        return JSON.stringify([
          key,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          typeof descriptor.value
        ]);
      };
      const emitter = new events.EventEmitter();
      const capturedEmitter = new events.EventEmitter({ captureRejections: true });
      const ownShape = (value) => [
        Reflect.ownKeys(value).map(String).join(","),
        Object.keys(value).join(","),
        value._eventsCount,
        Object.getPrototypeOf(value._events) === null,
        Object.getOwnPropertySymbols(value).map((symbol) => String(symbol) + ":" + value[symbol]).join(","),
        Object.hasOwn(value, "captureRejections")
      ].join("|");
      console.log(Object.keys(events).join(","));
      console.log(JSON.stringify([events.EventEmitter.length, events.listenerCount.name, events.listenerCount.length, events.setMaxListeners.name, events.setMaxListeners.length, events.init.name, events.init.length]));
      console.log(describeDescriptor("captureRejections"));
      console.log(describeDescriptor("EventEmitterAsyncResource"));
      console.log(Object.getOwnPropertyDescriptor(events, "EventEmitterAsyncResource").get.name);
      console.log(describeDescriptor("defaultMaxListeners"));
      console.log(describeDescriptor("kMaxEventTargetListeners"));
      console.log(describeDescriptor("kMaxEventTargetListenersWarned"));
      console.log(JSON.stringify([
        events.EventEmitter.prototype.on === events.EventEmitter.prototype.addListener,
        events.EventEmitter.prototype.off === events.EventEmitter.prototype.removeListener,
        events.EventEmitter.prototype.on.name,
        events.EventEmitter.prototype.off.name
      ]));
      console.log(describePrototypeDescriptor("_events"));
      console.log(describePrototypeDescriptor("_eventsCount"));
      console.log(describePrototypeDescriptor("_maxListeners"));
      console.log("emitter shape", ownShape(emitter));
      console.log("captured shape", ownShape(capturedEmitter));
      function listener() {}
      emitter.on("ready", listener);
      emitter.once("ready", listener);
      console.log(events.listenerCount(emitter, "ready"));
      console.log(emitter.listenerCount("ready", listener));
      console.log(events.getEventListeners(emitter, "ready").length);
      events.setMaxListeners(23, emitter);
      console.log(events.getMaxListeners(emitter), events.defaultMaxListeners);
      try { emitter.setMaxListeners("23"); } catch (error) { console.log(error.code); }
      try { events.defaultMaxListeners = -1; } catch (error) { console.log(error.code); }
      events.setMaxListeners(9);
      console.log(events.defaultMaxListeners, (new events.EventEmitter()).getMaxListeners());
      events.setMaxListeners(10);
      const initialized = {};
      events.init.call(initialized);
      console.log(typeof events.init, events.usingDomains, initialized._eventsCount, Object.getPrototypeOf(initialized._events) === null);
      const target = new EventTarget();
      const targetCalls = [];
      function firstTargetListener() {
        targetCalls.push("first");
      }
      function onceTargetListener() {
        targetCalls.push("once");
      }
      const objectTargetListener = {
        handleEvent(event) {
          targetCalls.push("object:" + (event.target === target));
        }
      };
      target.addEventListener("ping", firstTargetListener);
      target.addEventListener("ping", onceTargetListener, { once: true });
      target.addEventListener("ping", objectTargetListener);
      const targetListeners = events.getEventListeners(target, "ping");
      console.log(
        "target listeners",
        targetListeners.length,
        targetListeners[0] === firstTargetListener,
        targetListeners[1] === onceTargetListener,
        targetListeners[2] === objectTargetListener,
        events.listenerCount(target, "ping")
      );
      target.removeEventListener("ping", firstTargetListener);
      console.log("target remove", events.getEventListeners(target, "ping").map((listener) => listener === onceTargetListener ? "once" : listener === objectTargetListener ? "object" : "?").join(","), events.listenerCount(target, "ping"));
      target.dispatchEvent(new Event("ping"));
      console.log("target dispatch", targetCalls.join("|"), events.getEventListeners(target, "ping").map((listener) => listener === objectTargetListener ? "object" : "?").join(","), events.listenerCount(target, "ping"));
      const captureTarget = new EventTarget();
      function captureListener() {}
      captureTarget.addEventListener("capture", captureListener);
      captureTarget.addEventListener("capture", captureListener);
      captureTarget.addEventListener("capture", captureListener, { capture: true });
      console.log("target duplicate", events.getEventListeners(captureTarget, "capture").length);
      captureTarget.removeEventListener("capture", captureListener);
      console.log("target capture remove", events.getEventListeners(captureTarget, "capture").length);
      captureTarget.removeEventListener("capture", captureListener, { capture: true });
      console.log("target capture clear", events.getEventListeners(captureTarget, "capture").length);
      console.log("target max before", events.getMaxListeners(target));
      events.setMaxListeners(7, target);
      console.log("target max after", events.getMaxListeners(target), events.defaultMaxListeners);
      const staticValidation = [
        ["listener-object", () => events.listenerCount({}, "x")],
        ["listener-array", () => events.listenerCount([], "x")],
        ["listener-function", () => events.listenerCount(function namedListenerTarget() {}, "x")],
        ["get-listeners-function", () => events.getEventListeners(function namedEventTarget() {}, "x")],
        ["get-max-function", () => events.getMaxListeners(function namedMaxTarget() {})],
        ["set-max-function", () => events.setMaxListeners(2, function namedSetTarget() {})]
      ].map(([label, action]) => {
        try {
          action();
          return label + ":return";
        } catch (error) {
          return [label, error.name, error.code, error.message].join(":");
        }
      }).join("|");
      console.log("static validation", staticValidation);
      const addAbortValidation = [
        ["missing-signal", () => events.addAbortListener()],
        ["null-signal", () => events.addAbortListener(null, () => {})],
        ["object-signal", () => events.addAbortListener({}, () => {})],
        ["bad-listener", () => events.addAbortListener(new AbortController().signal, 1)]
      ].map(([label, action]) => {
        try {
          action();
          return label + ":return";
        } catch (error) {
          return [label, error.name, error.code, /"signal"|"listener"/.test(error.message)].join(":");
        }
      }).join("|");
      console.log("abort validation", addAbortValidation);
      const shapeController = new AbortController();
      const disposable = events.addAbortListener(shapeController.signal, () => {});
      const disposeDescriptor = Object.getOwnPropertyDescriptor(disposable, Symbol.dispose);
      console.log("abort disposable", JSON.stringify([
        Object.keys(disposable).join(","),
        Object.getOwnPropertyNames(disposable).join(","),
        Object.getOwnPropertySymbols(disposable).map(String).join(","),
        disposeDescriptor.enumerable,
        disposeDescriptor.configurable,
        disposeDescriptor.writable,
        disposeDescriptor.value.name,
        disposeDescriptor.value.length,
        Object.hasOwn(disposeDescriptor.value, "prototype")
      ]));
      disposable[Symbol.dispose]();
      let disposedCalls = 0;
      const disposedController = new AbortController();
      const disposed = events.addAbortListener(disposedController.signal, () => disposedCalls++);
      disposed[Symbol.dispose]();
      disposedController.abort("stop");
      console.log("abort disposed", disposedCalls);
      const alreadyController = new AbortController();
      alreadyController.abort("already");
      events.addAbortListener(alreadyController.signal, () => console.log("abort already", alreadyController.signal.reason));
      const controller = new AbortController();
      events.addAbortListener(controller.signal, () => console.log("aborted"));
      controller.abort();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "addAbortListener,once,on,getEventListeners,getMaxListeners,listenerCount,EventEmitter,usingDomains,captureRejectionSymbol,captureRejections,EventEmitterAsyncResource,errorMonitor,defaultMaxListeners,setMaxListeners,init",
    '[1,"listenerCount",2,"",0,"",1]',
    '["captureRejections",true,false,null,"function","function","undefined"]',
    '["EventEmitterAsyncResource",true,true,null,"function","undefined","undefined"]',
    "lazyEventEmitterAsyncResource",
    '["defaultMaxListeners",true,false,null,"function","function","undefined"]',
    '["kMaxEventTargetListeners",false,false,false,"undefined","undefined","symbol"]',
    '["kMaxEventTargetListenersWarned",false,false,false,"undefined","undefined","symbol"]',
    '[true,true,"addListener","removeListener"]',
    '["_events",true,true,true,"undefined"]',
    '["_eventsCount",true,true,true,"number"]',
    '["_maxListeners",true,true,true,"undefined"]',
    "emitter shape _events,_eventsCount,_maxListeners,Symbol(shapeMode),Symbol(kCapture)|_events,_eventsCount,_maxListeners|0|true|Symbol(shapeMode):false,Symbol(kCapture):false|false",
    "captured shape _events,_eventsCount,_maxListeners,Symbol(shapeMode),Symbol(kCapture)|_events,_eventsCount,_maxListeners|0|true|Symbol(shapeMode):false,Symbol(kCapture):true|false",
    "2",
    "2",
    "2",
    "23 10",
    "ERR_INVALID_ARG_TYPE",
    "ERR_OUT_OF_RANGE",
    "9 9",
    "function false 0 true",
    "target listeners 3 true true true 3",
    "target remove once,object 2",
    "target dispatch once|object:true object 1",
    "target duplicate 2",
    "target capture remove 1",
    "target capture clear 0",
    "target max before 10",
    "target max after 7 10",
    'static validation listener-object:TypeError:ERR_INVALID_ARG_TYPE:The "emitter" argument must be an instance of EventEmitter or EventTarget. Received an instance of Object|listener-array:TypeError:ERR_INVALID_ARG_TYPE:The "emitter" argument must be an instance of EventEmitter or EventTarget. Received an instance of Array|listener-function:TypeError:ERR_INVALID_ARG_TYPE:The "emitter" argument must be an instance of EventEmitter or EventTarget. Received function namedListenerTarget|get-listeners-function:TypeError:ERR_INVALID_ARG_TYPE:The "emitter" argument must be an instance of EventEmitter or EventTarget. Received function namedEventTarget|get-max-function:TypeError:ERR_INVALID_ARG_TYPE:The "emitter" argument must be an instance of EventEmitter or EventTarget. Received function namedMaxTarget|set-max-function:TypeError:ERR_INVALID_ARG_TYPE:The "eventTargets" argument must be an instance of EventEmitter or EventTarget. Received function namedSetTarget',
    "abort validation missing-signal:TypeError:ERR_INVALID_ARG_TYPE:true|null-signal:TypeError:ERR_INVALID_ARG_TYPE:true|object-signal:TypeError:ERR_INVALID_ARG_TYPE:true|bad-listener:TypeError:ERR_INVALID_ARG_TYPE:true",
    'abort disposable ["","","Symbol(Symbol.dispose)",true,true,true,"[Symbol.dispose]",0,false]',
    "abort disposed 0",
    "aborted",
    "abort already already"
  ]);
});

test("node:events emits listener lifecycle meta events", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const emitter = new EventEmitter();
      const seen = [];
      function first() {}
      function second() {}
      function onceListener() {}

      emitter.on("removeListener", (name, listener) => {
        seen.push("remove:" + String(name) + ":" + listener.name);
      });
      emitter.on("newListener", (name, listener) => {
        seen.push("new:" + String(name) + ":" + listener.name);
      });

      emitter.on("work", first);
      emitter.prependOnceListener("work", onceListener);
      emitter.removeListener("work", first);
      emitter.emit("work");
      emitter.on("alpha", first);
      emitter.on("alpha", second);
      emitter.removeAllListeners("alpha");

      console.log(seen.join("|"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(
    result.stdout.toString(),
    "new:work:first|new:work:onceListener|remove:work:first|remove:work:onceListener|new:alpha:first|new:alpha:second|remove:alpha:second|remove:alpha:first\n"
  );
});

test("node:events reports Node-shaped listener and unhandled error failures", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter } = require("node:events");
      const emitter = new EventEmitter();
      for (const action of [
        () => emitter.on("x", 1),
        () => emitter.once("x", 1),
        () => emitter.prependOnceListener("x", 1),
        () => emitter.removeListener("x", 1),
        () => emitter.off("x", 1),
      ]) {
        try {
          action();
        } catch (error) {
          console.log(error.name, error.code, /listener/.test(error.message));
        }
      }

      for (const value of [undefined, "boom", 123]) {
        try {
          emitter.emit("error", value);
        } catch (error) {
          console.log(error.code, error.context === value, error.message);
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "TypeError ERR_INVALID_ARG_TYPE true",
    "ERR_UNHANDLED_ERROR true Unhandled error. (undefined)",
    "ERR_UNHANDLED_ERROR true Unhandled error. ('boom')",
    "ERR_UNHANDLED_ERROR true Unhandled error. (123)"
  ]);
});

test("node:events supports errorMonitor and captureRejections", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import {
      EventEmitter,
      captureRejectionSymbol,
      errorMonitor,
    } from "node:events";

    const seen = [];

    const unhandled = new EventEmitter();
    unhandled.on(errorMonitor, (error) => {
      seen.push("monitor:" + error.message);
    });
    try {
      unhandled.emit("error", new Error("boom"));
    } catch (error) {
      seen.push("throw:" + error.message);
    }

    const captured = new EventEmitter({ captureRejections: true });
    captured.on(errorMonitor, (error) => {
      seen.push("capture-monitor:" + error.message);
    });
    captured.on("error", (error) => {
      seen.push("capture-error:" + error.message);
    });
    captured.on("work", async () => {
      throw new Error("reject boom");
    });
    captured.emit("work");
    await new Promise((resolve) => setTimeout(resolve, 1));

    const custom = new EventEmitter({ captureRejections: true });
    custom[captureRejectionSymbol] = (error, eventName, value) => {
      seen.push("custom:" + eventName + ":" + value + ":" + error.message);
    };
    custom.on("work", async (value) => {
      throw new Error("custom boom");
    });
    custom.emit("work", "payload");
    await new Promise((resolve) => setTimeout(resolve, 1));

    console.log(seen.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(
    result.stdout.toString(),
    "monitor:boom|throw:boom|capture-monitor:reject boom|capture-error:reject boom|custom:work:payload:custom boom\n"
  );
});

test("node:events exposes EventEmitterAsyncResource", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const { EventEmitter, EventEmitterAsyncResource } = require("node:events");
      const { AsyncLocalStorage, executionAsyncId, executionAsyncResource, triggerAsyncId } = require("node:async_hooks");
      console.log("metadata", EventEmitterAsyncResource.name, EventEmitterAsyncResource.length);
      for (const [label, action] of [
        ["missing", () => new EventEmitterAsyncResource()],
        ["empty-object", () => new EventEmitterAsyncResource({})],
        ["name-null", () => new EventEmitterAsyncResource({ name: null })],
        ["name-number", () => new EventEmitterAsyncResource({ name: 123 })],
        ["trigger-null", () => new EventEmitterAsyncResource({ name: "x", triggerAsyncId: null })],
        ["trigger-string", () => new EventEmitterAsyncResource({ name: "x", triggerAsyncId: "7" })],
        ["trigger-float", () => new EventEmitterAsyncResource({ name: "x", triggerAsyncId: 1.5 })],
        ["trigger-too-high", () => new EventEmitterAsyncResource({ name: "x", triggerAsyncId: Number.MAX_SAFE_INTEGER + 1 })]
      ]) {
        try {
          action();
          console.log(label, "ok");
        } catch (error) {
          console.log(label, error.name, error.code, /options\\.name|triggerAsyncId/.test(error.message));
        }
      }

      const stringResource = new EventEmitterAsyncResource("string-resource");
      console.log(typeof stringResource.name, typeof stringResource.destroyed, stringResource.emitDestroy());

      const emitter = new EventEmitterAsyncResource({
        name: "repl-resource",
        triggerAsyncId: 7,
      });

      emitter.on("ready", function (value) {
        console.log(this === emitter, value);
      });
      const storage = new AsyncLocalStorage();
      let scoped;
      storage.run("scoped-store", () => {
        scoped = new EventEmitterAsyncResource({
          name: "scoped-resource",
          triggerAsyncId: 11,
        });
      });
      scoped.on("scoped", function (value) {
        console.log(
          "scoped",
          this === scoped,
          value,
          storage.getStore(),
          executionAsyncId() === scoped.asyncId,
          triggerAsyncId(),
          executionAsyncResource() === scoped.asyncResource
        );
      });

      console.log(Number.isInteger(emitter.asyncId), emitter.triggerAsyncId);
      console.log(emitter.asyncResource.asyncId() === emitter.asyncId);
      console.log(emitter.asyncResource.triggerAsyncId());
      console.log(
        Object.hasOwn(emitter, "asyncId"),
        Object.hasOwn(emitter, "triggerAsyncId"),
        Object.hasOwn(emitter, "asyncResource"),
        Object.hasOwn(emitter, "destroyed")
      );
      console.log(["asyncId", "triggerAsyncId", "asyncResource"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(EventEmitterAsyncResource.prototype, name);
        return [name, descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, typeof descriptor.set].join(":");
      }).join("|"));
      const emitDescriptor = Object.getOwnPropertyDescriptor(EventEmitterAsyncResource.prototype, "emit");
      console.log("prototype", Object.getOwnPropertyNames(EventEmitterAsyncResource.prototype).join(","), Object.keys(EventEmitterAsyncResource.prototype).join(",") || "<none>");
      console.log("emit descriptor", [
        emitDescriptor.enumerable,
        emitDescriptor.configurable,
        emitDescriptor.writable,
        emitDescriptor.value.name,
        emitDescriptor.value.length,
        Object.hasOwn(emitDescriptor.value, "prototype"),
        emitDescriptor.value === EventEmitter.prototype.emit
      ].join(":"));
      console.log("scoped emit", scoped.emit("scoped", "ok"));
      console.log("emit return", emitter.emit("ready", "ok"), emitter.emit("missing"));
      console.log(emitter.emitDestroy(), emitter.destroyed);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "metadata EventEmitterAsyncResource 0",
    "missing TypeError ERR_INVALID_ARG_TYPE true",
    "empty-object TypeError ERR_INVALID_ARG_TYPE true",
    "name-null TypeError ERR_INVALID_ARG_TYPE true",
    "name-number TypeError ERR_INVALID_ARG_TYPE true",
    "trigger-null RangeError ERR_INVALID_ASYNC_ID true",
    "trigger-string RangeError ERR_INVALID_ASYNC_ID true",
    "trigger-float RangeError ERR_INVALID_ASYNC_ID true",
    "trigger-too-high RangeError ERR_INVALID_ASYNC_ID true",
    "undefined undefined undefined",
    "true 7",
    "true",
    "7",
    "false false false false",
    "asyncId:false:true:get asyncId:0:undefined|triggerAsyncId:false:true:get triggerAsyncId:0:undefined|asyncResource:false:true:get asyncResource:0:undefined",
    "prototype constructor,emit,emitDestroy,asyncId,triggerAsyncId,asyncResource <none>",
    "emit descriptor false:true:true:emit:1:false:false",
    "scoped true ok scoped-store true 11 true",
    "scoped emit true",
    "true ok",
    "emit return true false",
    "undefined undefined"
  ]);
});

test("node:tls can be required by packages and rejects client sockets clearly", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const tls = require('node:tls');
      const crypto = require('node:crypto');
      const pem = \`-----BEGIN CERTIFICATE-----
MIIC3DCCAcQCCQCsVYv1mCP9OzANBgkqhkiG9w0BAQsFADAwMRUwEwYDVQQDDAxl
eGFtcGxlLnRlc3QxFzAVBgNVBAoMDk9wZW5Db250YWluZXJzMB4XDTI2MDYyMDIw
MDI1OVoXDTI3MDYyMDIwMDI1OVowMDEVMBMGA1UEAwwMZXhhbXBsZS50ZXN0MRcw
FQYDVQQKDA5PcGVuQ29udGFpbmVyczCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBAKtsAxArae2YYu8D24yiK4ctzHmkhENVjJ/9fuSBqTlNEsMTbnwQy3MF
QLz0ik41wjsOr6LzRLK+9tf2gFAj2MQ/fxz5vc8vNkYTPWo8lLtJVFPaEvVZ6t6d
DYyf1eoSHRV82+3mqsqX2Kyjeb65rEpsymrM2Ru+sptcC9+g+rph7uyt2LSLIsle
gFLr9vevkgwQqQgMl18/VJxxxR6aG/wxU8LvxrmzyXs+gWn+NMErFwsPGtKKWQpR
xGs0bpPxvV7sWaEOi/RDKMXDulfn9+bJQMdDE2hX03jczo3srzz/cLtCpp+RiHWI
A/ekuxEK4sfZddCZMYQ3uEL5xBKDQdUCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEA
EmSdS1fqcIKAXNyd5kNz4ykQx2+ou3x82Bqe6asx2AQbpVOxBzS7HXpGB2oplOWV
I7K911mJLQkoVBTPlizkL+R8dO8MkvZ6pBJ1wl07ae6hZERGhc/UIrtdlio3AxWd
bJCHzK3ut4qmPGPaUx4Z3ANsw7vORpfYwh+ZjovztBhhg8IMnBhBWhVWWQKDMLX6
ncWd4ADYHUbvlPlX8rq0NL2IclVSY5KeRufHMFua7sBzZ20HhYeZSEmGhut7dknJ
wYTYSkxU6ItQ2rZvvtc1A+zGjvMcNVh6Qm7KVhysK/4DYiQm71qdNxK4n0XhTY7O
cA6uruLYoYH6ducBIUURvA==
-----END CERTIFICATE-----\`;
      const context = tls.createSecureContext({ servername: "example.com" });
      const socket = new tls.TLSSocket(null, { servername: "example.com" });
      const server = tls.createServer({}, () => {});
      const expectedTlsCiphers = "aes128-gcm-sha256,aes128-sha,aes128-sha256,aes256-gcm-sha384,aes256-sha,aes256-sha256,dhe-psk-aes128-cbc-sha,dhe-psk-aes128-cbc-sha256,dhe-psk-aes128-gcm-sha256,dhe-psk-aes256-cbc-sha,dhe-psk-aes256-cbc-sha384,dhe-psk-aes256-gcm-sha384,dhe-psk-chacha20-poly1305,dhe-rsa-aes128-gcm-sha256,dhe-rsa-aes128-sha,dhe-rsa-aes128-sha256,dhe-rsa-aes256-gcm-sha384,dhe-rsa-aes256-sha,dhe-rsa-aes256-sha256,dhe-rsa-chacha20-poly1305,ecdhe-ecdsa-aes128-gcm-sha256,ecdhe-ecdsa-aes128-sha,ecdhe-ecdsa-aes128-sha256,ecdhe-ecdsa-aes256-gcm-sha384,ecdhe-ecdsa-aes256-sha,ecdhe-ecdsa-aes256-sha384,ecdhe-ecdsa-chacha20-poly1305,ecdhe-psk-aes128-cbc-sha,ecdhe-psk-aes128-cbc-sha256,ecdhe-psk-aes256-cbc-sha,ecdhe-psk-aes256-cbc-sha384,ecdhe-psk-chacha20-poly1305,ecdhe-rsa-aes128-gcm-sha256,ecdhe-rsa-aes128-sha,ecdhe-rsa-aes128-sha256,ecdhe-rsa-aes256-gcm-sha384,ecdhe-rsa-aes256-sha,ecdhe-rsa-aes256-sha384,ecdhe-rsa-chacha20-poly1305,psk-aes128-cbc-sha,psk-aes128-cbc-sha256,psk-aes128-gcm-sha256,psk-aes256-cbc-sha,psk-aes256-cbc-sha384,psk-aes256-gcm-sha384,psk-chacha20-poly1305,rsa-psk-aes128-cbc-sha,rsa-psk-aes128-cbc-sha256,rsa-psk-aes128-gcm-sha256,rsa-psk-aes256-cbc-sha,rsa-psk-aes256-cbc-sha384,rsa-psk-aes256-gcm-sha384,rsa-psk-chacha20-poly1305,srp-aes-128-cbc-sha,srp-aes-256-cbc-sha,srp-rsa-aes-128-cbc-sha,srp-rsa-aes-256-cbc-sha,tls_aes_128_ccm_8_sha256,tls_aes_128_ccm_sha256,tls_aes_128_gcm_sha256,tls_aes_256_gcm_sha384,tls_chacha20_poly1305_sha256";
      console.log(typeof tls.TLSSocket, typeof tls.Server, context.constructor.name);
      console.log(Object.hasOwn(tls, "createConnection"), Object.hasOwn(tls, "createSecurePair"), Object.keys(tls).includes("createConnection"), Object.keys(tls).includes("createSecurePair"));
      console.log(Object.keys(tls).join(","));
      console.log(tls.DEFAULT_CIPHERS === crypto.constants.defaultCoreCipherList, tls.DEFAULT_CIPHERS.includes("ECDHE-RSA-AES128-GCM-SHA256"));
      const rootDescriptor = Object.getOwnPropertyDescriptor(tls, "rootCertificates");
      console.log(JSON.stringify([
        Object.hasOwn(tls, "parseCertString"),
        rootDescriptor.enumerable,
        rootDescriptor.configurable,
        typeof rootDescriptor.get,
        rootDescriptor.get.name,
        rootDescriptor.get.length,
        Array.isArray(tls.rootCertificates)
      ]));
      console.log(JSON.stringify([
        tls.SecureContext.length,
        tls.TLSSocket.length,
        tls.Server.length,
        tls.createSecureContext.length,
        tls.createServer.length,
        tls.checkServerIdentity.length,
        tls.getCiphers.name,
        tls.getCiphers.length,
        Object.hasOwn(tls.getCiphers, "prototype")
      ]));
      console.log(["SecureContext", "TLSSocket", "Server"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(tls[name], "prototype");
        return [name, typeof descriptor.value, descriptor.value.constructor.name, descriptor.writable, descriptor.enumerable, descriptor.configurable].join(":");
      }).join("|"));
      console.log(["SecureContext", "TLSSocket", "Server"].map((name) => {
        const symbols = Object.getOwnPropertySymbols(tls[name].prototype).map(String).join(",");
        return name + ":" + (symbols || "<empty>");
      }).join("|"));
      console.log(["TLSSocket", "Server"].flatMap((name) => Object.getOwnPropertySymbols(tls[name].prototype).map((symbol) => {
        const descriptor = Object.getOwnPropertyDescriptor(tls[name].prototype, symbol);
        return [name, String(symbol), descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      })).join("|"));
      console.log(tls.SecureContext() instanceof tls.SecureContext, tls.Server() instanceof tls.Server);
      console.log(Object.getOwnPropertyNames(tls.TLSSocket.prototype).join(","));
      console.log(Object.keys(tls.TLSSocket.prototype).join(","));
      function methodPrototypeSummary(prototype, names) {
        const failures = names.filter((name) => {
          const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
          const value = descriptor?.value;
          const prototypeDescriptor = typeof value === "function" ? Object.getOwnPropertyDescriptor(value, "prototype") : undefined;
          const constructorDescriptor = prototypeDescriptor?.value
            ? Object.getOwnPropertyDescriptor(prototypeDescriptor.value, "constructor")
            : undefined;
          let constructable = false;
          try {
            Reflect.construct(Object, [], value);
            constructable = true;
          } catch {}
          let notConstructorFailure = false;
          try {
            new value();
          } catch (error) {
            notConstructorFailure = /not a constructor/.test(error.message);
          }
          return !(
            descriptor?.enumerable === true &&
            descriptor?.configurable === true &&
            descriptor?.writable === true &&
            prototypeDescriptor?.enumerable === false &&
            prototypeDescriptor?.configurable === false &&
            prototypeDescriptor?.writable === true &&
            Object.getOwnPropertyNames(prototypeDescriptor.value).join(",") === "constructor" &&
            constructorDescriptor?.value === value &&
            constructorDescriptor?.enumerable === false &&
            constructorDescriptor?.configurable === true &&
            constructorDescriptor?.writable === true &&
            constructable &&
            !notConstructorFailure
          );
        });
        return failures.join(",") || "ok";
      }
      console.log("tls method prototypes", methodPrototypeSummary(tls.TLSSocket.prototype, Object.keys(tls.TLSSocket.prototype)));
      console.log(["renegotiate", "exportKeyingMaterial", "getPeerCertificate", "getPeerX509Certificate", "getCipher", "getSession"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(tls.TLSSocket.prototype, name);
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable].join(":");
      }).join("|"));
      console.log(Object.getOwnPropertyNames(tls.Server.prototype).join(","));
      console.log(Object.keys(tls.Server.prototype).join(","));
      console.log("server method prototypes", methodPrototypeSummary(tls.Server.prototype, Object.keys(tls.Server.prototype)));
      console.log(["setSecureContext", "_getServerData", "_setServerData", "setTicketKeys", "addContext"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(tls.Server.prototype, name);
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable].join(":");
      }).join("|"));
      const initialTicketKeys = server.getTicketKeys();
      console.log(Buffer.isBuffer(initialTicketKeys), initialTicketKeys.length, initialTicketKeys === server.getTicketKeys());
      const sourceTicketKeys = Buffer.alloc(48, 7);
      console.log(server.setTicketKeys(sourceTicketKeys));
      const storedTicketKeys = server.getTicketKeys();
      console.log(storedTicketKeys.equals(sourceTicketKeys), storedTicketKeys === sourceTicketKeys);
      sourceTicketKeys.fill(9);
      console.log(server.getTicketKeys().equals(Buffer.alloc(48, 7)));
      server.setTicketKeys(new Uint8Array(48).fill(3));
      console.log(server.getTicketKeys().equals(Buffer.alloc(48, 3)));
      const ticketKeyValidationRows = [
        ["missing", () => server.setTicketKeys()],
        ["arraybuffer", () => server.setTicketKeys(new ArrayBuffer(48))],
        ["short", () => server.setTicketKeys(Buffer.alloc(47))]
      ].map(([label, action]) => {
        try {
          action();
          return label + ":ok";
        } catch (error) {
          return [label, error.code, error.message.split("\\n")[0]].join(":");
        }
      }).join("|");
      console.log(ticketKeyValidationRows);
      try {
        tls.createSecurePair();
      } catch (error) {
        console.log(error.constructor.name, error.code, /not a function/.test(error.message));
      }
      console.log(socket.encrypted, socket.getCipher(), socket.getProtocol(), tls.getCiphers().includes("tls_aes_128_gcm_sha256"));
      const ciphers = tls.getCiphers();
      ciphers.push("mutated");
      console.log(tls.getCiphers().join(",") === expectedTlsCiphers, tls.getCiphers().length, tls.getCiphers()[0], tls.getCiphers().at(-1), tls.getCiphers().includes("mutated"));
      console.log(typeof socket.destroy, typeof socket.setTimeout, typeof socket.ref, typeof server.close, typeof server.address);
      console.log(server instanceof tls.Server, server.address());
      console.log(typeof tls.convertALPNProtocols, typeof tls.getCACertificates, typeof tls.setDefaultCACertificates);
      const alpn = {};
      tls.convertALPNProtocols(["h2", "http/1.1"], alpn);
      console.log(Buffer.isBuffer(alpn.ALPNProtocols), Array.from(alpn.ALPNProtocols).join(","));
      const copiedAlpn = {};
      tls.convertALPNProtocols(Buffer.from([2, 104, 50]), copiedAlpn);
      console.log(Buffer.isBuffer(copiedAlpn.ALPNProtocols), Array.from(copiedAlpn.ALPNProtocols).join(","));
      console.log(Array.isArray(tls.getCACertificates()), tls.getCACertificates("system").length, tls.getCACertificates("bundled").length, tls.getCACertificates("extra").length);
      tls.setDefaultCACertificates(["cert-a", Buffer.from("cert-b")]);
      const ca = tls.getCACertificates();
      console.log(ca.length, ca[0], Buffer.isBuffer(ca[1]), ca[1].toString());
      try {
        tls.getCACertificates("bad");
      } catch (error) {
        console.log(error.code);
      }
      try {
        tls.setDefaultCACertificates("bad");
      } catch (error) {
        console.log(error.code);
      }
      try {
        tls.convertALPNProtocols(["a".repeat(256)], {});
      } catch (error) {
        console.log(error.code);
      }
      console.log(tls.checkServerIdentity("example.com", { subjectaltname: "DNS:example.com" }));
      console.log(tls.checkServerIdentity("www.example.com", { subjectaltname: "DNS:*.example.com" }));
      console.log(tls.checkServerIdentity("127.0.0.1", { subjectaltname: "IP Address:127.0.0.1" }));
      const altError = tls.checkServerIdentity("api.sub.example.com", { subjectaltname: "DNS:*.example.com" });
      const cnError = tls.checkServerIdentity("bad.example.com", { subject: { CN: "example.com" } });
      console.log(altError.code, altError.reason);
      console.log(cnError.code, cnError.reason);
      const contextWithCert = tls.createSecureContext({ cert: pem });
      const certSocket = new tls.TLSSocket(null, { cert: pem, peerCertificate: pem });
      console.log(Buffer.isBuffer(contextWithCert.context.getCertificate()), contextWithCert.context.getCertificate().length);
      console.log(certSocket.getX509Certificate().subject.split("\\n")[0]);
      const peerLegacy = certSocket.getPeerCertificate(true);
      console.log(certSocket.getPeerX509Certificate().fingerprint256 === certSocket.getX509Certificate().fingerprint256);
      console.log(peerLegacy.subject.includes("example.test"), peerLegacy.issuerCertificate === peerLegacy);
      console.log(socket.getX509Certificate(), socket.getPeerX509Certificate(), JSON.stringify(socket.getCertificate()));
      socket.setKeyCert(contextWithCert);
      console.log(socket.getX509Certificate().subject.split("\\n")[0]);
      try {
        new tls.TLSSocket(null, { cert: "nope" });
      } catch (error) {
        console.log(error.code);
      }
      try {
        tls.connect({});
      } catch (error) {
        console.log(error.constructor.name, error.code, /options/.test(error.message));
      }
      try {
        tls.connect(443, "example.com");
      } catch (error) {
        console.log(error.code);
      }
      try {
        server.listen(443);
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "function function SecureContext",
    "false false false false",
    "CLIENT_RENEG_LIMIT,CLIENT_RENEG_WINDOW,DEFAULT_CIPHERS,DEFAULT_ECDH_CURVE,DEFAULT_MIN_VERSION,DEFAULT_MAX_VERSION,getCiphers,rootCertificates,getCACertificates,setDefaultCACertificates,convertALPNProtocols,checkServerIdentity,createSecureContext,SecureContext,TLSSocket,Server,createServer,connect",
    "true true",
    "[false,true,false,\"function\",\"cacheBundledRootCertificates\",0,true]",
    "[4,2,2,1,2,2,\"\",0,false]",
    "SecureContext:object:SecureContext:true:false:false|TLSSocket:object:TLSSocket:true:false:false|Server:object:Server:true:false:false",
    "SecureContext:<empty>|TLSSocket:Symbol(kReinitializeHandle)|Server:Symbol(nodejs.rejection)",
    "TLSSocket:Symbol(kReinitializeHandle):true:true:true:function:reinitializeHandle:1:true|Server:Symbol(nodejs.rejection):true:true:true:function::3:true",
    "true true",
    "constructor,disableRenegotiation,_wrapHandle,_destroySSL,_init,renegotiate,exportKeyingMaterial,setMaxSendFragment,_handleTimeout,_emitTLSError,_tlsError,_releaseControl,_finishInit,_start,setServername,setSession,getPeerCertificate,getCertificate,getPeerX509Certificate,getX509Certificate,setKeyCert,getCipher,getSharedSigalgs,getEphemeralKeyInfo,getFinished,getPeerFinished,getProtocol,getSession,getTLSTicket,isSessionReused,enableTrace",
    "disableRenegotiation,_wrapHandle,_destroySSL,_init,renegotiate,exportKeyingMaterial,setMaxSendFragment,_handleTimeout,_emitTLSError,_tlsError,_releaseControl,_finishInit,_start,setServername,setSession,getPeerCertificate,getCertificate,getPeerX509Certificate,getX509Certificate,setKeyCert,getCipher,getSharedSigalgs,getEphemeralKeyInfo,getFinished,getPeerFinished,getProtocol,getSession,getTLSTicket,isSessionReused,enableTrace",
    "tls method prototypes ok",
    "renegotiate::2:true|exportKeyingMaterial::3:true|getPeerCertificate::1:true|getPeerX509Certificate::1:true|getCipher:socketMethodProxy:0:true|getSession:socketMethodProxy:0:true",
    "constructor,setSecureContext,_getServerData,_setServerData,getTicketKeys,setTicketKeys,addContext",
    "setSecureContext,_getServerData,_setServerData,getTicketKeys,setTicketKeys,addContext",
    "server method prototypes ok",
    "setSecureContext::1:true|_getServerData::0:true|_setServerData::1:true|setTicketKeys:setTicketKeys:1:true|addContext::2:true",
    "true 48 false",
    "undefined",
    "true false",
    "true",
    "true",
    "missing:ERR_INVALID_ARG_TYPE:The \"buffer\" argument must be an instance of Buffer, TypedArray, or DataView. Received undefined|arraybuffer:ERR_INVALID_ARG_TYPE:The \"buffer\" argument must be an instance of Buffer, TypedArray, or DataView. Received an instance of ArrayBuffer|short:ERR_INTERNAL_ASSERTION:Session ticket keys must be a 48-byte buffer",
    "TypeError undefined true",
    "true undefined TLSv1.3 true",
    "true 62 aes128-gcm-sha256 tls_chacha20_poly1305_sha256 false",
    "function function function function function",
    "true null",
    "function function function",
    "true 2,104,50,8,104,116,116,112,47,49,46,49",
    "true 2,104,50",
    "true 0 0 0",
    "2 cert-a true cert-b",
    "ERR_INVALID_ARG_VALUE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_OUT_OF_RANGE",
    "undefined",
    "undefined",
    "undefined",
    "ERR_TLS_CERT_ALTNAME_INVALID Host: api.sub.example.com. is not in the cert's altnames: DNS:*.example.com",
    "ERR_TLS_CERT_ALTNAME_INVALID Host: bad.example.com. is not cert's CN: example.com",
    "true 736",
    "CN=example.test",
    "true",
    "true true",
    "undefined undefined {}",
    "CN=example.test",
    "ERR_OSSL_PEM_NO_START_LINE",
    "TypeError ERR_MISSING_ARGS true",
    "ERR_OPENCONTAINERS_TLS_UNSUPPORTED",
    "ERR_OPENCONTAINERS_TLS_UNSUPPORTED"
  ]);
});
