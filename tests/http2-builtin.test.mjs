import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("node:http2 supports virtual h2c server/client streams", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import http2 from "node:http2";

    const {
      HTTP2_HEADER_CONTENT_TYPE,
      HTTP2_HEADER_METHOD,
      HTTP2_HEADER_PATH,
      HTTP2_HEADER_STATUS
    } = http2.constants;

    const server = http2.createServer();
    server.on("stream", (stream, headers) => {
      console.log("server path:", headers[HTTP2_HEADER_PATH]);
      console.log("server method:", headers[HTTP2_HEADER_METHOD]);
      let requestBody = "";
      stream.on("data", (chunk) => {
        requestBody += chunk.toString();
      });
      stream.on("end", () => {
        console.log("server body:", requestBody);
        stream.respond({
          [HTTP2_HEADER_STATUS]: 201,
          [HTTP2_HEADER_CONTENT_TYPE]: "text/plain"
        });
        stream.end("hello " + headers[HTTP2_HEADER_PATH]);
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    console.log("listening:", server.address().port > 0);

    const client = http2.connect("http://localhost:" + server.address().port);
    await new Promise((resolve) => client.once("connect", resolve));
    const request = client.request({
      [HTTP2_HEADER_METHOD]: "POST",
      [HTTP2_HEADER_PATH]: "/h2"
    });

    let responseStatus = 0;
    let responseBody = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      responseStatus = headers[HTTP2_HEADER_STATUS];
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.end("request-body");

    await new Promise((resolve) => request.on("end", resolve));
    console.log("client status:", responseStatus);
    console.log("client body:", responseBody);
    client.close();
    server.close();
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "listening: true",
    "server path: /h2",
    "server method: POST",
    "server body: request-body",
    "client status: 201",
    "client body: hello /h2"
  ]);
});

test("node:http2 createServer handler receives request and response wrappers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import http2 from "node:http2";

    const {
      HTTP2_HEADER_METHOD,
      HTTP2_HEADER_PATH,
      HTTP2_HEADER_STATUS
    } = http2.constants;

    let callbackRequest;
    const server = http2.createServer((request, response) => {
      callbackRequest = request;
      console.log("callback args:", request.constructor.name, response.constructor.name, request instanceof http2.Http2ServerRequest, response instanceof http2.Http2ServerResponse);
      console.log("callback fields:", request.method, request.url, request.headers[HTTP2_HEADER_PATH], typeof request.on, typeof response.setHeader, response.headersSent);
      console.log("request metadata:", request.aborted, request.complete, request.httpVersion, request.httpVersionMajor, request.httpVersionMinor, request.connection === request.socket, Array.isArray(request.rawHeaders), Array.isArray(request.rawTrailers));
      console.log("response metadata:", response._header === null, response.writableEnded, response.finished, response.writableFinished, response.writableHighWaterMark, response.writableObjectMode, response.writableNeedDrain, response.writableLength, response.connection === response.socket, response.stream === request.stream);
      response.cork();
      response.uncork();
      console.log("response corked:", response.writableCorked);
      response.setTrailer("x-trailer", "ok");
      response.addTrailers({ "x-trailer-two": "ok" });
      response.appendHeader("x-extra", "one");
      response.appendHeader("x-extra", "two");
      console.log("append header:", JSON.stringify(response.getHeader("x-extra")));
      try {
        response.createPushResponse({}, () => {});
      } catch (error) {
        console.log("push response:", error.code);
      }

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        console.log("callback body:", body);
        console.log("request complete:", request.complete);
        console.log("request stream:", request.stream.constructor.name, request.stream.headersSent);
        response.statusCode = 202;
        response.setHeader("x-probe", "ok");
        console.log("headers before:", response.getHeader("x-probe"), response.hasHeader("x-probe"), response.getHeaderNames().join(","));
        response.write("response:");
        response.end(request.url);
      });
    });

    console.log("listeners initial:", server.listenerCount("request"), server.listenerCount("stream"));
    server.on("request", (request, response) => {
      console.log("request event:", request === callbackRequest, request.constructor.name, response.constructor.name, request.url);
    });
    server.on("stream", (stream, headers) => {
      console.log("stream event:", stream.constructor.name, headers[HTTP2_HEADER_PATH]);
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = http2.connect("http://localhost:" + server.address().port);
    await new Promise((resolve) => client.once("connect", resolve));
    const request = client.request({
      [HTTP2_HEADER_METHOD]: "POST",
      [HTTP2_HEADER_PATH]: "/via-callback"
    });

    let responseStatus = 0;
    let responseHeader = "";
    let responseBody = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      responseStatus = headers[HTTP2_HEADER_STATUS];
      responseHeader = headers["x-probe"];
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.end("payload");

    await new Promise((resolve) => request.on("end", resolve));
    console.log("client response:", responseStatus, responseHeader);
    console.log("client body:", responseBody);
    client.close();
    server.close();
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace", projectId: "http2-handler" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "listeners initial: 1 1",
    "callback args: Http2ServerRequest Http2ServerResponse true true",
    "callback fields: POST /via-callback /via-callback function function false",
    "request metadata: false false 2.0 2 0 true true true",
    "response metadata: true false false false 16384 false false 0 true true",
    "response corked: 0",
    'append header: ["one","two"]',
    "push response: ERR_OPENCONTAINERS_HTTP2_UNSUPPORTED",
    "request event: true Http2ServerRequest Http2ServerResponse /via-callback",
    "stream event: Http2Stream /via-callback",
    "callback body: payload",
    "request complete: true",
    "request stream: Http2Stream false",
    "headers before: ok true x-extra,x-probe",
    "client response: 202 ok",
    "client body: response:/via-callback"
  ]);
});

test("node:http2 reports stable unsupported errors for secure sessions", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http2 = require("node:http2");
      for (const operation of [
        () => http2.createSecureServer(),
        () => http2.connect("https://example.com"),
        () => http2.performServerHandshake({})
      ]) {
        try {
          operation();
        } catch (error) {
          console.log(error.code);
        }
      }
      console.log(typeof http2.performServerHandshake, http2.performServerHandshake.name, http2.performServerHandshake.length, Object.prototype.propertyIsEnumerable.call(http2, "performServerHandshake"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "ERR_OPENCONTAINERS_HTTP2_UNSUPPORTED",
    "ERR_OPENCONTAINERS_HTTP2_UNSUPPORTED",
    "ERR_OPENCONTAINERS_HTTP2_UNSUPPORTED",
    "function performServerHandshake 1 true"
  ]);
});

test("node:http2 exposes native-shaped metadata and settings helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http2 = require("node:http2");
      console.log(Object.keys(http2).join(","));
      console.log(String(http2.sensitiveHeaders), http2.sensitiveHeaders.description);
      console.log([
        http2.connect.name + ":" + http2.connect.length,
        http2.createServer.name + ":" + http2.createServer.length,
        http2.createSecureServer.name + ":" + http2.createSecureServer.length,
        http2.getDefaultSettings.name + ":" + http2.getDefaultSettings.length,
        http2.getPackedSettings.name + ":" + http2.getPackedSettings.length,
        http2.getUnpackedSettings.name + ":" + http2.getUnpackedSettings.length,
        http2.performServerHandshake.name + ":" + http2.performServerHandshake.length,
        http2.Http2ServerRequest.name + ":" + http2.Http2ServerRequest.length,
        http2.Http2ServerResponse.name + ":" + http2.Http2ServerResponse.length
      ].join("|"));
      console.log("helper prototypes:", [
        "connect",
        "createServer",
        "createSecureServer",
        "getDefaultSettings",
        "getPackedSettings",
        "getUnpackedSettings",
        "performServerHandshake"
      ].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(http2[name], "prototype");
        return [name, Object.hasOwn(http2[name], "prototype"), descriptor?.enumerable, descriptor?.configurable, descriptor?.writable, Object.getOwnPropertyNames(descriptor?.value ?? {}).join(","), descriptor?.value?.constructor === http2[name]].join(":");
      }).join("|"));
      console.log(Object.keys(http2.constants).length, http2.constants.NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE, http2.constants.HTTP2_HEADER_PROTOCOL, http2.constants.HTTP_STATUS_NETWORK_AUTHENTICATION_REQUIRED);
      const requestPrototype = http2.Http2ServerRequest.prototype;
      const responsePrototype = http2.Http2ServerResponse.prototype;
      const requestPrototypeNames = Object.getOwnPropertyNames(requestPrototype);
      const responsePrototypeNames = Object.getOwnPropertyNames(responsePrototype);
      console.log("request prototype:", requestPrototypeNames.join(","));
      console.log("request inherited:", ["setEncoding", "pause", "resume", "destroy"].map((name) => typeof requestPrototype[name] + ":" + Object.hasOwn(requestPrototype, name)).join("|"));
      console.log("response prototype:", responsePrototypeNames.join(","));
      console.log("response symbols:", Object.getOwnPropertySymbols(responsePrototype).map(String).join(","));
      console.log("response symbol descriptors:", Object.getOwnPropertySymbols(responsePrototype).map((symbol) => {
        const descriptor = Object.getOwnPropertyDescriptor(responsePrototype, symbol);
        return [String(symbol), descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
      }).join("|"));
      const requestMethodDescriptor = Object.getOwnPropertyDescriptor(requestPrototype, "method");
      const requestReadDescriptor = Object.getOwnPropertyDescriptor(requestPrototype, "_read");
      const responseStatusDescriptor = Object.getOwnPropertyDescriptor(responsePrototype, "statusCode");
      const responseEarlyHintsDescriptor = Object.getOwnPropertyDescriptor(responsePrototype, "writeEarlyHints");
      console.log(
        "prototype descriptors:",
        requestMethodDescriptor.enumerable,
        typeof requestMethodDescriptor.get,
        typeof requestMethodDescriptor.set,
        requestReadDescriptor.value.name,
        requestReadDescriptor.value.length,
        responseStatusDescriptor.enumerable,
        typeof responseStatusDescriptor.get,
        typeof responseStatusDescriptor.set,
        responseEarlyHintsDescriptor.value.name,
        responseEarlyHintsDescriptor.value.length
      );
      console.log(JSON.stringify(http2.getDefaultSettings()));
      const packed = http2.getPackedSettings({
        headerTableSize: 123,
        enablePush: false,
        maxConcurrentStreams: 7,
        initialWindowSize: 456,
        maxFrameSize: 16384,
        maxHeaderListSize: 99,
        enableConnectProtocol: true
      });
      console.log(packed.toString("hex"));
      console.log(JSON.stringify(http2.getUnpackedSettings(packed)));
      const headerSize = http2.getPackedSettings({ maxHeaderSize: 42 });
      console.log(headerSize.toString("hex"), JSON.stringify(http2.getUnpackedSettings(headerSize)));
      const headerListSize = http2.getPackedSettings({ enableConnectProtocol: true, maxHeaderListSize: 99 });
      console.log(headerListSize.toString("hex"), JSON.stringify(http2.getUnpackedSettings(headerListSize)));
      console.log(JSON.stringify(http2.getUnpackedSettings(Buffer.from("000700000063", "hex"))));
      try {
        http2.getUnpackedSettings(Buffer.from("000100", "hex"));
      } catch (error) {
        console.log(error.name, error.code, error.message.includes("multiple of six"));
      }
      console.log(Object.hasOwn(http2, "ServerHttp2Stream"), Object.hasOwn(http2, "ClientHttp2Stream"), Object.hasOwn(http2, "ClientHttp2Session"), Object.hasOwn(http2, "default"));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "connect,constants,createServer,createSecureServer,getDefaultSettings,getPackedSettings,getUnpackedSettings,performServerHandshake,sensitiveHeaders,Http2ServerRequest,Http2ServerResponse",
    "Symbol(sensitiveHeaders) sensitiveHeaders",
    "connect:3|createServer:2|createSecureServer:2|getDefaultSettings:0|getPackedSettings:1|getUnpackedSettings:1|performServerHandshake:1|Http2ServerRequest:4|Http2ServerResponse:2",
    "helper prototypes: connect:true:false:false:true:constructor:true|createServer:true:false:false:true:constructor:true|createSecureServer:true:false:false:true:constructor:true|getDefaultSettings:true:false:false:true:constructor:true|getPackedSettings:true:false:false:true:constructor:true|getUnpackedSettings:true:false:false:true:constructor:true|performServerHandshake:true:false:false:true:constructor:true",
    "240 6 :protocol 511",
    "request prototype: constructor,aborted,complete,stream,headers,rawHeaders,trailers,rawTrailers,httpVersionMajor,httpVersionMinor,httpVersion,socket,connection,_read,method,authority,scheme,url,setTimeout",
    "request inherited: function:false|function:false|function:false|function:false",
    "response prototype: constructor,_header,writableEnded,finished,socket,connection,stream,headersSent,sendDate,statusCode,writableCorked,writableHighWaterMark,writableObjectMode,writableFinished,writableLength,writableNeedDrain,setTrailer,addTrailers,getHeader,getHeaderNames,getHeaders,hasHeader,removeHeader,setHeader,appendHeader,statusMessage,flushHeaders,writeHead,cork,uncork,write,end,destroy,setTimeout,createPushResponse,writeInformation,writeContinue,writeEarlyHints",
    "response symbols: Symbol(setHeader),Symbol(appendHeader),Symbol(begin-send)",
    "response symbol descriptors: Symbol(setHeader):false:true:true:[setHeader]:2:false|Symbol(appendHeader):false:true:true:[appendHeader]:2:false|Symbol(begin-send):false:true:true:[begin-send]:0:false",
    "prototype descriptors: false function function _read 1 false function function writeEarlyHints 1",
    "{\"headerTableSize\":4096,\"enablePush\":true,\"initialWindowSize\":65535,\"maxFrameSize\":16384,\"maxConcurrentStreams\":4294967295,\"maxHeaderSize\":65535,\"maxHeaderListSize\":65535,\"enableConnectProtocol\":false}",
    "00010000007b0002000000000003000000070004000001c8000500004000000600000063000800000001",
    "{\"headerTableSize\":123,\"enablePush\":false,\"maxConcurrentStreams\":7,\"initialWindowSize\":456,\"maxFrameSize\":16384,\"maxHeaderSize\":99,\"maxHeaderListSize\":99,\"enableConnectProtocol\":true}",
    "00060000002a {\"maxHeaderSize\":42,\"maxHeaderListSize\":42}",
    "000600000063000800000001 {\"maxHeaderSize\":99,\"maxHeaderListSize\":99,\"enableConnectProtocol\":true}",
    "{\"customSettings\":{\"7\":99}}",
    "RangeError ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH true",
    "false false false false"
  ]);
});
