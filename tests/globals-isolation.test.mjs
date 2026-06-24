import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

function parseJsonLine(stdout) {
  const line = stdout.toString().trim().split("\n").at(-1);
  return JSON.parse(line);
}

function hideHostGlobals(names) {
  const descriptors = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const [name, descriptor] of descriptors) {
    if (descriptor && descriptor.configurable === false) continue;
    Object.defineProperty(globalThis, name, {
      value: undefined,
      configurable: true,
      writable: true
    });
  }
  return () => {
    for (const [name, descriptor] of descriptors.reverse()) {
      if (descriptor && descriptor.configurable === false) continue;
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

test("runtime exposes Node-compatible global invariants", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/globals.mjs", `
    const channel = new MessageChannel();
    channel.port1.close();
    channel.port2.close();

    const broadcastOne = new BroadcastChannel("global-invariants");
    const broadcastTwo = new BroadcastChannel("global-invariants");
    const broadcastPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("BroadcastChannel timed out")), 100);
      broadcastTwo.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data?.ready === true);
      };
    });
    broadcastOne.postMessage({ ready: true });
    const broadcastChannel = await broadcastPromise;
    broadcastOne.close();
    broadcastTwo.close();

    const accessorDescriptor = (name) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      return [
        descriptor.enumerable,
        descriptor.configurable,
        "value" in descriptor,
        descriptor.get?.name,
        descriptor.get?.length,
        descriptor.set?.name,
        descriptor.set?.length,
        Object.keys(globalThis).includes(name)
      ].join(":");
    };
    const originalBuffer = globalThis.Buffer;
    globalThis.Buffer = "replacement-buffer";
    const bufferAccessorAssignment = globalThis.Buffer === "replacement-buffer" && Buffer === "replacement-buffer";
    globalThis.Buffer = originalBuffer;
    const originalProcess = globalThis.process;
    globalThis.process = { marker: "replacement-process" };
    const processAccessorAssignment = globalThis.process.marker === "replacement-process" && process.marker === "replacement-process";
    globalThis.process = originalProcess;
    const originalPerformance = globalThis.performance;
    globalThis.performance = { marker: "replacement-performance" };
    const performanceAccessorAssignment = globalThis.performance.marker === "replacement-performance" && performance.marker === "replacement-performance";
    globalThis.performance = originalPerformance;

    const values = {
      globalIdentity: global === globalThis,
      processGlobal: process === globalThis.process,
      bufferGlobal: Buffer === globalThis.Buffer,
      bufferBase64: Buffer.from("OpenContainers").toString("base64"),
      consoleGlobal: console === globalThis.console,
      timerGlobals: typeof setTimeout === "function" && typeof clearTimeout === "function" && typeof setImmediate === "function" && typeof clearImmediate === "function",
      fetchGlobal: fetch === globalThis.fetch && typeof fetch === "function",
      fetchMetadata: fetch.name === "fetch" && fetch.length === 1 && Object.getOwnPropertyDescriptor(globalThis, "fetch").enumerable === true,
      nodeNonEnumerableGlobalDescriptors: [
        "AbortController",
        "AbortSignal",
        "Atomics",
        "Blob",
        "BroadcastChannel",
        "ByteLengthQueuingStrategy",
        "CompressionStream",
        "console",
        "CountQueuingStrategy",
        "Crypto",
        "CryptoKey",
        "CustomEvent",
        "DecompressionStream",
        "DOMException",
        "Event",
        "EventTarget",
        "FormData",
        "Headers",
        "MessageChannel",
        "MessageEvent",
        "MessagePort",
        "PerformanceEntry",
        "PerformanceMark",
        "PerformanceMeasure",
        "PerformanceObserver",
        "PerformanceObserverEntryList",
        "PerformanceResourceTiming",
        "ReadableByteStreamController",
        "ReadableStream",
        "ReadableStreamBYOBReader",
        "ReadableStreamBYOBRequest",
        "ReadableStreamDefaultController",
        "ReadableStreamDefaultReader",
        "Request",
        "Response",
        "SubtleCrypto",
        "TextDecoder",
        "TextDecoderStream",
        "TextEncoder",
        "TextEncoderStream",
        "TransformStream",
        "TransformStreamDefaultController",
        "URL",
        "URLSearchParams",
        "WebAssembly",
        "WritableStream",
        "WritableStreamDefaultController",
        "WritableStreamDefaultWriter",
        "globalThis"
      ].every((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
        return descriptor?.value === globalThis[name] && descriptor.enumerable === false && descriptor.configurable === true && descriptor.writable === true && Object.keys(globalThis).includes(name) === false;
      }),
      accessorGlobalDescriptors: accessorDescriptor("Buffer") === "false:true:false:get:0:set:1:false" && accessorDescriptor("process") === "false:true:false:get:0:set:1:false" && accessorDescriptor("performance") === "true:true:false:get performance:0:set performance:1:true",
      accessorGlobalAssignments: bufferAccessorAssignment && processAccessorAssignment && performanceAccessorAssignment && Buffer === originalBuffer && process === originalProcess && performance === originalPerformance,
      urlGlobals: new URL("/path?x=1", "https://example.com").searchParams.get("x") === "1" && new URLSearchParams("a=b").get("a") === "b",
      streamGlobals: typeof ReadableStream === "function" && typeof WritableStream === "function" && typeof TransformStream === "function",
      encodingGlobals: new TextDecoder().decode(new TextEncoder().encode("ok")) === "ok",
      atobBtoa: atob.name === "atob" && btoa.name === "btoa" && atob(btoa("OpenContainers")) === "OpenContainers",
      domException: new DOMException("denied", "SecurityError").name === "SecurityError",
      customEvent: new CustomEvent("opencontainers", { detail: 42 }).detail === 42,
      messageEvent: new MessageEvent("message", { data: "ready" }).data === "ready",
      broadcastChannel,
      queueingStrategies: new ByteLengthQueuingStrategy({ highWaterMark: 1 }).highWaterMark === 1 && new CountQueuingStrategy({ highWaterMark: 2 }).highWaterMark === 2,
      compressionGlobals: typeof CompressionStream === "function" && typeof DecompressionStream === "function",
      textStreamGlobals: typeof TextEncoderStream === "function" && typeof TextDecoderStream === "function",
      performanceGlobal: typeof performance.now() === "number" && typeof PerformanceMark === "function",
      structuredCloneGlobal: structuredClone.name === "structuredClone" && structuredClone({ ok: true }).ok === true,
      webAssemblyGlobal: typeof WebAssembly === "object" && typeof WebAssembly.Module === "function",
      functionConstructorGlobal: Function("return this")() === globalThis
    };

    console.log(JSON.stringify(values));
  `);

  const result = await kernel.run("node", ["globals.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const values = parseJsonLine(result.stdout);
  assert.equal(values.bufferBase64, "T3BlbkNvbnRhaW5lcnM=");
  delete values.bufferBase64;
  for (const [name, value] of Object.entries(values)) {
    assert.equal(value, true, `${name} should be true`);
  }
});

test("runtime provides deterministic fallbacks when host globals are missing", async () => {
  const restore = hideHostGlobals([
    "atob",
    "btoa",
    "Event",
    "EventTarget",
    "CustomEvent",
    "DOMException",
    "MessageEvent",
    "BroadcastChannel",
    "ByteLengthQueuingStrategy",
    "CountQueuingStrategy",
    "PerformanceEntry",
    "PerformanceMark",
    "PerformanceMeasure",
    "PerformanceObserver",
    "PerformanceObserverEntryList",
    "PerformanceResourceTiming",
    "performance",
    "structuredClone",
    "ReadableStream",
    "ReadableByteStreamController",
    "ReadableStreamBYOBReader",
    "ReadableStreamBYOBRequest",
    "ReadableStreamDefaultController",
    "ReadableStreamDefaultReader",
    "TransformStream",
    "TransformStreamDefaultController",
    "WritableStream",
    "WritableStreamDefaultController",
    "WritableStreamDefaultWriter",
    "TextEncoderStream",
    "TextDecoderStream"
  ]);

  try {
    const kernel = new Kernel();
    kernel.fs.writeFileSync("/workspace/fallback-globals.mjs", `
      const target = new EventTarget();
      let eventTargetCalls = 0;
      target.addEventListener("opencontainers", (event) => {
        if (event.detail === 42) eventTargetCalls += 1;
      });

      const broadcastOne = new BroadcastChannel("fallback-globals");
      const broadcastTwo = new BroadcastChannel("fallback-globals");
      let broadcastSelfDelivered = false;
      broadcastOne.onmessage = () => {
        broadcastSelfDelivered = true;
      };
      const broadcastMessage = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("BroadcastChannel fallback timed out")), 100);
        broadcastTwo.addEventListener("message", (event) => {
          clearTimeout(timer);
          resolve(event.data);
        });
        broadcastOne.postMessage({ ok: true, nested: { value: 42 } });
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      broadcastOne.close();
      broadcastTwo.close();
      let broadcastClosedError = "";
      try {
        broadcastOne.postMessage("closed");
      } catch (error) {
        broadcastClosedError = error.name;
      }

      const observerEntries = [];
      const observer = new PerformanceObserver((list) => {
        observerEntries.push(
          list instanceof PerformanceObserverEntryList,
          list.getEntriesByName("fallback-mark")[0]?.name === "fallback-mark"
        );
      });
      observer.observe({ entryTypes: ["mark"] });
      const mark = performance.mark("fallback-mark");
      const measure = performance.measure("fallback-measure", "fallback-mark");
      await new Promise((resolve) => setTimeout(resolve, 0));
      observer.disconnect();
      const illegalPerformanceConstructors = [PerformanceEntry, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList].map((Constructor) => {
        try {
          new Constructor();
          return "ok";
        } catch (error) {
          return error.code;
        }
      }).join(",");
      async function collect(stream) {
        const reader = stream.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        reader.releaseLock?.();
        return chunks;
      }
      const readableChunks = await collect(new ReadableStream({
        start(controller) {
          controller.enqueue("a");
          controller.enqueue("b");
          controller.close();
        }
      }));
      const transformedChunks = await collect(new ReadableStream({
        start(controller) {
          controller.enqueue("open");
          controller.close();
        }
      }).pipeThrough(new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk.toUpperCase());
        }
      })));
      const writableChunks = [];
      const writer = new WritableStream({
        write(chunk) {
          writableChunks.push(chunk);
        }
      }).getWriter();
      await writer.write("written");
      await writer.close();
      const byobTarget = new Uint8Array(4);
      const byobReader = new ReadableStream({
        type: "bytes",
        pull(controller) {
          const request = controller.byobRequest;
          request.view[0] = 65;
          request.view[1] = 66;
          request.respond(2);
          controller.close();
        }
      }).getReader({ mode: "byob" });
      const byobResult = await byobReader.read(byobTarget);
      byobReader.releaseLock();
      const queuedByobFirstTarget = new Uint8Array(2);
      const queuedByobSecondTarget = new Uint8Array(2);
      const queuedByobReader = new ReadableStream({
        type: "bytes",
        start(controller) {
          controller.enqueue(new Uint8Array([67, 68, 69]));
          controller.close();
        }
      }).getReader({ mode: "byob" });
      const queuedByobFirst = await queuedByobReader.read(queuedByobFirstTarget);
      const queuedByobSecond = await queuedByobReader.read(queuedByobSecondTarget);
      queuedByobReader.releaseLock();
      const desiredSizeRows = [];
      let desiredSizeController;
      const desiredSizeReader = new ReadableStream({
        start(controller) {
          desiredSizeController = controller;
          desiredSizeRows.push(controller.desiredSize);
          controller.enqueue("aa");
          desiredSizeRows.push(controller.desiredSize);
          controller.enqueue("b");
          desiredSizeRows.push(controller.desiredSize);
        }
      }, {
        highWaterMark: 4,
        size(chunk) {
          return chunk.length;
        }
      }).getReader();
      await desiredSizeReader.read();
      desiredSizeRows.push(desiredSizeController.desiredSize);
      await desiredSizeReader.read();
      desiredSizeRows.push(desiredSizeController.desiredSize);
      desiredSizeController.close();
      desiredSizeReader.releaseLock();
      const byteDesiredSizeRows = [];
      let byteDesiredSizeController;
      const byteDesiredSizeReader = new ReadableStream({
        type: "bytes",
        start(controller) {
          byteDesiredSizeController = controller;
          byteDesiredSizeRows.push(controller.desiredSize);
          controller.enqueue(new Uint8Array([70, 71, 72]));
          byteDesiredSizeRows.push(controller.desiredSize);
        }
      }, {
        highWaterMark: 4
      }).getReader({ mode: "byob" });
      const byteDesiredFirst = await byteDesiredSizeReader.read(new Uint8Array(2));
      byteDesiredSizeRows.push(byteDesiredSizeController.desiredSize);
      const byteDesiredSecond = await byteDesiredSizeReader.read(new Uint8Array(2));
      byteDesiredSizeRows.push(byteDesiredSizeController.desiredSize);
      byteDesiredSizeController.close();
      byteDesiredSizeReader.releaseLock();
      const web = await import("node:stream/web");
      const securityError = new DOMException("denied", "SecurityError");
      const notFoundError = new DOMException("missing", "NotFoundError");
      const invalidStateError = new DOMException("bad", "InvalidStateError");
      const defaultError = new DOMException("plain");

      const values = {
        atobBtoa: atob(btoa("OpenContainers")) === "OpenContainers",
        domException: securityError.name === "SecurityError" && securityError.message === "denied",
        domExceptionShape: Object.prototype.toString.call(securityError) === "[object DOMException]" && securityError instanceof Error && securityError instanceof DOMException && Object.getOwnPropertyNames(securityError).join(",") === "stack",
        domExceptionCodes: securityError.code === 18 && notFoundError.code === 8 && invalidStateError.code === 11 && defaultError.code === 0,
        domExceptionConstants: DOMException.name === "DOMException" && DOMException.length === 0 && DOMException.SECURITY_ERR === 18 && DOMException.NOT_FOUND_ERR === 8 && DOMException.INVALID_STATE_ERR === 11 && DOMException.prototype.SECURITY_ERR === 18,
        domExceptionDescriptors: ["name", "message", "code"].every((property) => {
          const descriptor = Object.getOwnPropertyDescriptor(DOMException.prototype, property);
          return descriptor?.enumerable === true && descriptor.configurable === true && typeof descriptor.get === "function" && descriptor.set === undefined;
        }),
        eventTarget: target.dispatchEvent(new CustomEvent("opencontainers", { detail: 42 })) && eventTargetCalls === 1,
        messageEvent: new MessageEvent("message", { data: "ready", origin: "opencontainers://" }).data === "ready",
        broadcastChannel: broadcastMessage.ok === true && broadcastMessage.nested.value === 42 && broadcastSelfDelivered === false && broadcastClosedError === "InvalidStateError",
        byteLengthStrategy: new ByteLengthQueuingStrategy({ highWaterMark: 3 }).size(Buffer.from("abc")) === 3,
        countStrategy: new CountQueuingStrategy({ highWaterMark: 2 }).size({}) === 1,
        performanceClasses: mark instanceof PerformanceMark && measure instanceof PerformanceMeasure && observer instanceof PerformanceObserver,
        performanceEntries: performance.getEntriesByType("mark").at(-1).name === "fallback-mark" && performance.getEntriesByName("fallback-measure")[0].entryType === "measure",
        performanceEntryList: observerEntries.every(Boolean),
        performanceIllegalConstructors: illegalPerformanceConstructors === "ERR_ILLEGAL_CONSTRUCTOR,ERR_ILLEGAL_CONSTRUCTOR,ERR_ILLEGAL_CONSTRUCTOR,ERR_ILLEGAL_CONSTRUCTOR",
        structuredCloneGlobal: structuredClone({ ok: true, nested: { value: 1 } }).nested.value === 1,
        webStreamGlobals: typeof ReadableStream === "function" && typeof WritableStream === "function" && typeof TransformStream === "function" && typeof ReadableStreamDefaultReader === "function" && typeof WritableStreamDefaultWriter === "function" && typeof ReadableByteStreamController === "function" && typeof ReadableStreamBYOBReader === "function" && typeof ReadableStreamBYOBRequest === "function",
        webStreamFallbackMetadata: [ReadableStream, ReadableByteStreamController, ReadableStreamBYOBReader, ReadableStreamBYOBRequest].map((value) => value.name + ":" + value.length).join("|") === "ReadableStream:0|ReadableByteStreamController:0|ReadableStreamBYOBReader:1|ReadableStreamBYOBRequest:0",
        readableStream: readableChunks.join("") === "ab",
        byobReadableStream: byobResult.value.byteLength === 2 && byobResult.value[0] === 65 && byobResult.value[1] === 66,
        byobReadableStreamDetachesSource: byobResult.value.buffer !== byobTarget.buffer && byobTarget.byteLength === 0 && byobTarget.buffer.byteLength === 0,
        queuedByobReadableStream: queuedByobFirst.value.byteLength === 2 && queuedByobFirst.value[0] === 67 && queuedByobFirst.value[1] === 68 && queuedByobSecond.value.byteLength === 1 && queuedByobSecond.value[0] === 69,
        queuedByobReadableStreamDetachesSources: queuedByobFirst.value.buffer !== queuedByobFirstTarget.buffer && queuedByobFirstTarget.byteLength === 0 && queuedByobSecond.value.buffer !== queuedByobSecondTarget.buffer && queuedByobSecondTarget.byteLength === 0,
        readableStreamDesiredSize: desiredSizeRows.join(",") === "4,2,1,3,4",
        byteReadableStreamDesiredSize: byteDesiredSizeRows.join(",") === "4,1,3,4" && byteDesiredFirst.value.byteLength === 2 && byteDesiredFirst.value[0] === 70 && byteDesiredFirst.value[1] === 71 && byteDesiredSecond.value.byteLength === 1 && byteDesiredSecond.value[0] === 72,
        transformStream: transformedChunks.join("") === "OPEN",
        writableStream: writableChunks.join("") === "written",
        streamWebBuiltin: typeof web.ReadableStream === "function" && typeof web.WritableStream === "function" && typeof web.TransformStream === "function" && new web.ByteLengthQueuingStrategy({ highWaterMark: 1 }).size(new Uint8Array([1, 2])) === 2,
        textEncoderStream: await collect(new ReadableStream({
          start(controller) {
            controller.enqueue("OpenContainers");
            controller.close();
          }
        }).pipeThrough(new TextEncoderStream())).then((chunks) => chunks[0][0]) === 79,
        textDecoderStream: await (async () => {
          const chunks = await collect(new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([79, 112, 101, 110]));
              controller.close();
            }
          }).pipeThrough(new TextDecoderStream()));
          return chunks.join("") === "Open";
        })()
      };

      console.log(JSON.stringify(values));
    `);

    const result = await kernel.run("node", ["fallback-globals.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    const values = parseJsonLine(result.stdout);
    for (const [name, value] of Object.entries(values)) {
      assert.equal(value, true, `${name} should be true`);
    }
  } finally {
    restore();
  }
});

test("runtime blocks common browser host globals from user code", async () => {
  const blockedNames = [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "navigator",
    "parent",
    "top",
    "self"
  ];
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/blocked.mjs", `
    const blockedNames = ${JSON.stringify(blockedNames)};
    const before = Object.fromEntries(blockedNames.map((name) => [name, typeof globalThis[name]]));
    const lexicalBefore = Object.fromEntries(blockedNames.map((name) => [name, Function("return typeof " + name)()]));

    window = { runtimeOnly: true };
    self = "runtime-self";

    console.log(JSON.stringify({
      before,
      lexicalBefore,
      assignedWindow: globalThis.window?.runtimeOnly === true,
      assignedSelf: globalThis.self === "runtime-self",
      functionWindow: Function("return window.runtimeOnly")() === true
    }));
  `);

  const result = await kernel.run("node", ["blocked.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  const values = parseJsonLine(result.stdout);
  assert.deepEqual(values.before, Object.fromEntries(blockedNames.map((name) => [name, "undefined"])));
  assert.deepEqual(values.lexicalBefore, Object.fromEntries(blockedNames.map((name) => [name, "undefined"])));
  assert.equal(values.assignedWindow, true);
  assert.equal(values.assignedSelf, true);
  assert.equal(values.functionWindow, true);
});

test("Function constructor code cannot mutate the host global object", async () => {
  const original = globalThis.__opencontainersHostProbe;
  globalThis.__opencontainersHostProbe = "host";
  try {
    const kernel = new Kernel();
    kernel.fs.writeFileSync("/workspace/function-escape.mjs", `
      Function("return this")().__opencontainersHostProbe = "runtime";
      console.log(JSON.stringify({
        runtimeValue: globalThis.__opencontainersHostProbe,
        functionValue: Function("return this.__opencontainersHostProbe")()
      }));
    `);

    const result = await kernel.run("node", ["function-escape.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.deepEqual(parseJsonLine(result.stdout), {
      runtimeValue: "runtime",
      functionValue: "runtime"
    });
    assert.equal(globalThis.__opencontainersHostProbe, "host");
  } finally {
    if (original === undefined) delete globalThis.__opencontainersHostProbe;
    else globalThis.__opencontainersHostProbe = original;
  }
});

test("CommonJS and node -e expose Node-compatible top-level this values", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/cjs.js", `
    console.log(JSON.stringify({
      cjsThisExports: this === module.exports,
      cjsThisGlobal: this === globalThis,
      functionThisGlobal: Function("return this")() === globalThis
    }));
  `);

  const cjs = await kernel.run("node", ["cjs.js"], { cwd: "/workspace" });
  assert.equal(cjs.status, 0, cjs.stderr.toString());
  assert.deepEqual(parseJsonLine(cjs.stdout), {
    cjsThisExports: true,
    cjsThisGlobal: false,
    functionThisGlobal: true
  });

  const evalResult = await kernel.run("node", ["-e", "console.log(JSON.stringify({ evalThisGlobal: this === globalThis }))"], { cwd: "/workspace" });
  assert.equal(evalResult.status, 0, evalResult.stderr.toString());
  assert.deepEqual(parseJsonLine(evalResult.stdout), { evalThisGlobal: true });
});
