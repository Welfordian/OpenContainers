import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("http and https expose Node-compatible method, status, and export metadata", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('node:http');
      const https = require('node:https');
      console.log(Object.keys(http).join(","));
      console.log(Object.keys(https).join(","));
      console.log(http.METHODS.includes('GET'));
      console.log(http.METHODS.includes('POST'));
      console.log(http.STATUS_CODES[404]);
      console.log(Object.keys(http.STATUS_CODES).length, http.STATUS_CODES[103], http.STATUS_CODES[511]);
      console.log(Object.hasOwn(https, 'METHODS'), Object.hasOwn(https, 'STATUS_CODES'));
      console.log(http.Agent.length, https.Agent.length, http.ClientRequest.length, http.ServerResponse.length);
      console.log(http.createServer.length, http.request.name, http.request.length, http.get.length);
      console.log(https.createServer.length, https.request.name, https.request.length, https.get.length);
      console.log(http.validateHeaderName.length, http.validateHeaderValue.length);
      console.log(http._connectionListener.name, http._connectionListener.length);
      const descriptorRow = (prototype, name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
      };
      const exportDescriptorRow = (object, name) => {
        const descriptor = Object.getOwnPropertyDescriptor(object, name);
        if ("value" in descriptor) return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable].join(":");
        return [
          name,
          descriptor.get?.name,
          descriptor.get?.length,
          typeof descriptor.set,
          descriptor.set?.name ?? "",
          descriptor.set?.length ?? "",
          descriptor.enumerable,
          descriptor.configurable,
          Object.hasOwn(descriptor.get ?? {}, "prototype"),
          Object.hasOwn(descriptor.set ?? {}, "prototype")
        ].join(":");
      };
      const functionPrototypeRow = (fn) => {
        const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
        return [
          Object.hasOwn(fn, "prototype"),
          descriptor?.writable,
          descriptor?.enumerable,
          descriptor?.configurable,
          descriptor?.value?.constructor === fn,
          Object.getOwnPropertyNames(descriptor?.value ?? {}).join(",")
        ].join(":");
      };
      const httpAgent = new http.Agent();
      const httpsAgent = new https.Agent();
      const customHttpAgent = new http.Agent({ keepAlive: false, keepAliveMsecs: 12, maxSockets: 3, maxFreeSockets: 4, scheduling: "fifo", maxTotalSockets: 5, timeout: 6, agentKeepAliveTimeoutBuffer: 7 });
      const customHttpsAgent = new https.Agent({ maxCachedSessions: 2, keepAliveMsecs: 12 });
      const agentShape = (agent) => [
        Object.keys(agent).join(","),
        Object.keys(agent.options).join(","),
        agent.keepAliveMsecs,
        agent.keepAlive,
        String(agent.maxSockets),
        agent.maxFreeSockets,
        agent.scheduling,
        String(agent.maxTotalSockets),
        agent.totalSocketCount,
        agent.agentKeepAliveTimeoutBuffer,
        agent.maxCachedSessions ?? "",
        agent._sessionCache ? Object.keys(agent._sessionCache).join(",") : ""
      ].join("|");
      console.log(["maxHeaderSize", "globalAgent", "WebSocket", "CloseEvent", "MessageEvent"].map((name) => exportDescriptorRow(http, name)).join("|"));
      console.log(http.globalAgent.defaultPort, http.globalAgent.protocol, httpAgent.defaultPort, httpAgent.protocol);
      console.log(https.globalAgent.defaultPort, https.globalAgent.protocol, httpsAgent.defaultPort, httpsAgent.protocol);
      console.log(http.Agent === https.Agent, http.globalAgent === https.globalAgent);
      console.log(http.globalAgent instanceof http.Agent, https.globalAgent instanceof https.Agent, https.globalAgent instanceof http.Agent);
      console.log(httpsAgent.maxCachedSessions, JSON.stringify(httpsAgent._sessionCache));
      console.log(httpAgent.totalSocketCount, httpsAgent.totalSocketCount);
      console.log("agent shapes", [httpAgent, http.globalAgent, customHttpAgent, httpsAgent, https.globalAgent, customHttpsAgent].map(agentShape).join(";;"));
	      console.log(Object.getOwnPropertyNames(http.Agent.prototype).join(","));
	      console.log(["createConnection", "getName", "addRequest", "createSocket", "removeSocket", "keepSocketAlive", "reuseSocket", "destroy"].map((name) => descriptorRow(http.Agent.prototype, name)).join("|"));
	      console.log(Object.getOwnPropertyNames(https.Agent.prototype).join(","));
	      console.log(["createConnection", "getName", "_getSession", "_cacheSession", "_evictSession"].map((name) => descriptorRow(https.Agent.prototype, name)).join("|"));
	      console.log(Object.getOwnPropertyNames(http.Server.prototype).join(","));
	      console.log(Object.getOwnPropertyNames(https.Server.prototype).join(","));
	      const serverAsyncDisposeRow = (prototype) => {
	        const descriptor = Object.getOwnPropertyDescriptor(prototype, Symbol.asyncDispose);
	        return [typeof prototype[Symbol.asyncDispose], prototype[Symbol.asyncDispose].name, prototype[Symbol.asyncDispose].length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype"), Object.getOwnPropertySymbols(prototype).map(String).join(",")].join(":");
	      };
	      console.log("server asyncDispose", serverAsyncDisposeRow(http.Server.prototype), serverAsyncDisposeRow(https.Server.prototype));
	      console.log([
	        http.Agent.prototype.createConnection,
        http.Agent.prototype.addRequest,
        http.Server.prototype.close,
        https.Server.prototype.closeAllConnections,
        http.IncomingMessage.prototype.setTimeout,
        http.ClientRequest.prototype.setTimeout,
        http.OutgoingMessage.prototype.setHeader,
        http.ServerResponse.prototype.writeHead,
        http.ServerResponse.prototype.writeProcessing
      ].map(functionPrototypeRow).join("|"));
      console.log(httpAgent.getName({ host: "example.com", port: 8080, localAddress: "127.0.0.1", family: 4, socketPath: "/tmp/sock" }), httpAgent.getName({}));
      console.log(httpsAgent.getName({}), httpsAgent.getName({ host: "example.com", port: 443, localAddress: "127.0.0.1", family: 4 }));
      for (const [label, run] of [
        ["http", () => httpAgent.createConnection()],
        ["https", () => httpsAgent.createConnection()]
      ]) {
        try {
          run();
        } catch (error) {
          console.log(label, error.name, error.code, /options/.test(error.message));
        }
      }
      const socketEvents = [];
      const fakeSocket = {
        setKeepAlive: (...args) => socketEvents.push(["setKeepAlive", ...args].join(":")),
        setTimeout: (...args) => socketEvents.push(["setTimeout", ...args].join(":")),
        removeListener: (name, fn) => socketEvents.push(["removeListener", name, typeof fn].join(":")),
        unref: () => socketEvents.push("unref"),
        ref: () => socketEvents.push("ref")
      };
      const fakeReq = {};
      console.log(httpAgent.keepSocketAlive(fakeSocket), socketEvents.join("|"));
      console.log(httpAgent.reuseSocket(fakeSocket, fakeReq), fakeReq.reusedSocket, socketEvents.join("|"));
      const createOptions = { host: "socket-host", port: 80 };
      let createdError;
      let createdSocket;
      const createReq = {};
      httpAgent.createSocket(createReq, createOptions, (error, socket) => {
        createdError = error;
        createdSocket = socket;
      });
      console.log(createdError, createdSocket._httpMessage === createReq, httpAgent.totalSocketCount, createOptions.encoding, createOptions._agentKey, httpAgent.sockets[createOptions._agentKey].includes(createdSocket), createdSocket.listenerCount("free"), createdSocket.listenerCount("close"), typeof createdSocket.setKeepAlive);
      const poolSocket = { writable: false };
      const poolName = httpAgent.getName({ host: "pooled" });
      httpAgent.sockets[poolName] = [poolSocket];
      httpAgent.freeSockets[poolName] = [poolSocket];
      httpAgent.removeSocket(poolSocket, { host: "pooled" });
      console.log(Object.hasOwn(httpAgent.sockets, poolName), Object.hasOwn(httpAgent.freeSockets, poolName));
      const writablePoolSocket = { writable: true };
      httpAgent.sockets[poolName] = [writablePoolSocket];
      httpAgent.freeSockets[poolName] = [writablePoolSocket];
      httpAgent.removeSocket(writablePoolSocket, { host: "pooled" });
      console.log(Object.hasOwn(httpAgent.sockets, poolName), Object.hasOwn(httpAgent.freeSockets, poolName));
      const limitedAgent = new https.Agent({ maxCachedSessions: 2 });
      limitedAgent._cacheSession("a", Buffer.from("one"));
      limitedAgent._cacheSession("b", Buffer.from("two"));
      limitedAgent._cacheSession("c", Buffer.from("three"));
      console.log(limitedAgent._getSession("a"), limitedAgent._getSession("b").toString(), limitedAgent._getSession("c").toString(), limitedAgent._sessionCache.list.join(","));
      limitedAgent._cacheSession("b", Buffer.from("two-updated"));
      console.log(limitedAgent._getSession("b").toString(), limitedAgent._sessionCache.list.join(","));
      limitedAgent._evictSession("b");
      console.log(limitedAgent._sessionCache.list.join(","), Object.keys(limitedAgent._sessionCache.map).join(","));
      const disabledAgent = new https.Agent({ maxCachedSessions: 0 });
      disabledAgent._cacheSession("x", Buffer.from("x"));
      console.log(JSON.stringify(disabledAgent._sessionCache), disabledAgent._getSession("x"));
      const httpReq = http.request('http://localhost:3000/');
      const httpsReq = https.request('https://localhost/');
      httpReq.on('error', () => {});
      httpsReq.on('error', () => {});
      console.log(httpReq.agent === http.globalAgent, httpReq.agent === https.globalAgent, httpReq.agent.defaultPort, httpReq.agent.protocol);
      console.log(httpsReq.agent === https.globalAgent, httpsReq.agent === http.globalAgent, httpsReq.agent.defaultPort, httpsReq.agent.protocol);
      httpReq.destroy();
      httpsReq.destroy();
      const originalGlobalAgent = http.globalAgent;
      const replacementGlobalAgent = { defaultPort: 80, protocol: "http:" };
      http.globalAgent = replacementGlobalAgent;
      const replacementReq = http.request('http://localhost:3000/');
      replacementReq.on('error', () => {});
      console.log(http.globalAgent === replacementGlobalAgent, replacementReq.agent === replacementGlobalAgent);
      replacementReq.destroy();
      http.globalAgent = originalGlobalAgent;
      console.log(http.globalAgent === originalGlobalAgent);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "_connectionListener,METHODS,STATUS_CODES,Agent,ClientRequest,IncomingMessage,OutgoingMessage,Server,ServerResponse,createServer,validateHeaderName,validateHeaderValue,get,request,setMaxIdleHTTPParsers,setGlobalProxyFromEnv,maxHeaderSize,globalAgent,WebSocket,CloseEvent,MessageEvent",
    "Agent,globalAgent,Server,createServer,get,request",
    "true",
    "true",
    "Not Found",
    "63 Early Hints Network Authentication Required",
    "false false",
    "1 1 3 2",
    "2 request 3 3",
    "2 request 0 3",
    "0 0",
    "connectionListener 1",
    "maxHeaderSize:get:0:undefined:::true:true:false:false|globalAgent:get:0:function:set:1:true:true:false:false|WebSocket:get:0:undefined:::true:true:false:false|CloseEvent:get:0:undefined:::true:true:false:false|MessageEvent:get:0:undefined:::true:true:false:false",
    "80 http: 80 http:",
    "443 https: 443 https:",
    "false false",
    "true true true",
    "100 {\"map\":{},\"list\":[]}",
    "0 0",
    "agent shapes _events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer|noDelay,path|1000|false|Infinity|256|lifo|Infinity|0|1000||;;_events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer|keepAlive,scheduling,timeout,proxyEnv,noDelay,path|1000|true|Infinity|256|lifo|Infinity|0|1000||;;_events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer|keepAlive,keepAliveMsecs,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,timeout,agentKeepAliveTimeoutBuffer,noDelay,path|12|false|3|4|fifo|5|0|7||;;_events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer,maxCachedSessions,_sessionCache|defaultPort,protocol,noDelay,path|1000|false|Infinity|256|lifo|Infinity|0|1000|100|map,list;;_events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer,maxCachedSessions,_sessionCache|keepAlive,scheduling,timeout,proxyEnv,defaultPort,protocol,noDelay,path|1000|true|Infinity|256|lifo|Infinity|0|1000|100|map,list;;_events,_eventsCount,_maxListeners,options,defaultPort,protocol,requests,sockets,freeSockets,keepAliveMsecs,keepAlive,maxSockets,maxFreeSockets,scheduling,maxTotalSockets,totalSocketCount,agentKeepAliveTimeoutBuffer,maxCachedSessions,_sessionCache|maxCachedSessions,keepAliveMsecs,defaultPort,protocol,noDelay,path|12|false|Infinity|256|lifo|Infinity|0|1000|2|map,list",
    "constructor,createConnection,getName,addRequest,createSocket,removeSocket,keepSocketAlive,reuseSocket,destroy",
    "createConnection:createConnection:0:true:true:true|getName:getName:0:true:true:true|addRequest:addRequest:4:true:true:true|createSocket:createSocket:3:true:true:true|removeSocket:removeSocket:2:true:true:true|keepSocketAlive:keepSocketAlive:1:true:true:true|reuseSocket:reuseSocket:2:true:true:true|destroy:destroy:0:true:true:true",
	    "constructor,createConnection,getName,_getSession,_cacheSession,_evictSession",
	    "createConnection:createConnection:0:true:true:true|getName:getName:0:true:true:true|_getSession:_getSession:1:true:true:true|_cacheSession:_cacheSession:2:true:true:true|_evictSession:_evictSession:1:true:true:true",
	    "constructor,close,closeAllConnections,closeIdleConnections,setTimeout",
	    "constructor,closeAllConnections,closeIdleConnections,setTimeout,close",
	    "server asyncDispose function:[Symbol.asyncDispose]:0:true:true:true:false:Symbol(Symbol.asyncDispose) function::0:true:true:true:false:Symbol(Symbol.asyncDispose)",
	    "true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor|true:true:false:false:true:constructor",
    "example.com:8080:127.0.0.1:4:/tmp/sock localhost::",
    "localhost:::::::::::::::::::::: example.com:443:127.0.0.1:4::::::::::::::::::::",
    "http TypeError ERR_MISSING_ARGS true",
    "https TypeError ERR_MISSING_ARGS true",
    "true setKeepAlive:true:1000|unref|setTimeout:0",
    "undefined true setKeepAlive:true:1000|unref|setTimeout:0|removeListener:error:function|ref",
    "null true 1 null socket-host:80: true 1 1 function",
    "false false",
    "false true",
    "undefined two three b,c",
    "two-updated b,c",
    "c c",
    "{\"map\":{},\"list\":[]} undefined",
    "true false 80 http:",
    "true false 443 https:",
    "true true",
    "true",
    ""
	  ].join("\n"));
	});

test("http and https Server Symbol.asyncDispose follow Node close semantics", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server-dispose.mjs", `
    import http from "node:http";
    import https from "node:https";

    for (const [label, server] of [["http", http.createServer()], ["https", https.createServer()]]) {
      try {
        await server[Symbol.asyncDispose]();
      } catch (error) {
        console.log(label, "not running", error.constructor.name, error.code, error.message);
      }
    }

    const httpServer = http.createServer((req, res) => res.end("ok"));
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const httpDispose = httpServer[Symbol.asyncDispose]();
    console.log("http dispose", httpDispose.constructor.name, await httpDispose, httpServer.listening);

    const httpsServer = https.createServer({}, (req, res) => res.end("ok"));
    await new Promise((resolve) => httpsServer.listen(0, "127.0.0.1", resolve));
    const httpsDispose = httpsServer[Symbol.asyncDispose]();
    console.log("https dispose", httpsDispose.constructor.name, await httpsDispose, httpsServer.listening);
  `);

  const result = await kernel.run("node", ["server-dispose.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "http not running Error ERR_SERVER_NOT_RUNNING Server is not running.",
    "https not running Error ERR_SERVER_NOT_RUNNING Server is not running.",
    "http dispose Promise undefined false",
    "https dispose Promise undefined false"
  ]);
});

test("http.Agent.destroy destroys active and free socket pools without synthetic free events", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require("node:http");
      const agent = new http.Agent();
      const events = [];
      const freeSocket = {
        destroyed: false,
        destroy() {
          this.destroyed = true;
          events.push("free:destroy");
        }
      };
      const busySocket = {
        destroyed: false,
        destroy() {
          this.destroyed = true;
          events.push("busy:destroy");
        }
      };

      agent.on("free", () => events.push("agent-free"));
      agent.freeSockets["example.com:80:"] = [freeSocket];
      agent.sockets["example.com:80:"] = [busySocket];
      const result = agent.destroy();

      console.log(result === undefined);
      console.log(events.join("|"));
      console.log(freeSocket.destroyed, busySocket.destroyed);
      console.log(Object.keys(agent.freeSockets).join(","), Object.keys(agent.sockets).join(","));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true",
    "free:destroy|busy:destroy",
    "true true",
    "example.com:80: example.com:80:"
  ]);
});

test("http and https expose Node-compatible server and validation helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('node:http');
      const https = require('node:https');
      const server = http.createServer();
      const secureServer = https.createServer({}, () => {});
      const serverHelperNames = ["close", "closeAllConnections", "closeIdleConnections", "setTimeout"];
      const incomingTimeoutDescriptor = Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, "setTimeout");
      const helperSummary = (mod, instance) => JSON.stringify({
        types: Object.fromEntries(serverHelperNames.map((name) => [name, typeof instance[name]])),
        descriptors: Object.fromEntries(serverHelperNames.map((name) => {
          const descriptor = Object.getOwnPropertyDescriptor(mod.Server.prototype, name);
          return [name, descriptor && {
            name: descriptor.value.name,
            length: descriptor.value.length,
            enumerable: descriptor.enumerable
          }];
        }))
      });
      console.log(typeof http.Server);
      console.log(typeof http.OutgoingMessage);
      console.log(server instanceof http.Server);
      console.log(secureServer instanceof https.Server);
      console.log(helperSummary(http, server));
      console.log(helperSummary(https, secureServer));
      console.log("incoming timeout", incomingTimeoutDescriptor.value.name, incomingTimeoutDescriptor.value.length, incomingTimeoutDescriptor.enumerable, incomingTimeoutDescriptor.configurable, incomingTimeoutDescriptor.writable);
      const incoming = new http.IncomingMessage({ method: "GET", url: "/", headers: [], port: 8080 });
      const socketTimeouts = [];
      incoming.socket.setTimeout = (...args) => {
        socketTimeouts.push(args.join(":"));
        return incoming.socket;
      };
      let incomingTimeouts = 0;
      console.log("incoming setTimeout", incoming.setTimeout(25, () => incomingTimeouts++) === incoming, socketTimeouts.join("|"));
      incoming.emit("timeout");
      console.log("incoming timeout callback", incomingTimeouts);
      console.log(http.maxHeaderSize);
      console.log(typeof http._connectionListener);
      console.log(typeof http.WebSocket);
      console.log(typeof http.CloseEvent);
      console.log(typeof http.MessageEvent);
      console.log(typeof http.setGlobalProxyFromEnv());
      const maxParserPrototype = Object.getOwnPropertyDescriptor(http.setMaxIdleHTTPParsers, "prototype");
      console.log("max parser prototype", Object.hasOwn(http.setMaxIdleHTTPParsers, "prototype"), maxParserPrototype);
      console.log(http.validateHeaderName('x-opencontainers'));
      console.log(http.validateHeaderValue('x-opencontainers', ['one', 'two']));
      console.log(http.setMaxIdleHTTPParsers(1));
      try { http.validateHeaderName('bad header'); } catch (error) { console.log(error.name, error.code); }
      try { http.validateHeaderName(['x-opencontainers']); } catch (error) { console.log(error.name, error.code); }
      try { http.validateHeaderName(1); } catch (error) { console.log(error.name, error.code); }
      try { http.validateHeaderValue('x-opencontainers', 'bad\\n'); } catch (error) { console.log(error.name, error.code); }
      try { http.validateHeaderValue('x-opencontainers', undefined); } catch (error) { console.log(error.name, error.code); }
      try { http.validateHeaderValue('x-opencontainers', Symbol('bad')); } catch (error) { console.log(error.name, error.code ?? 'no-code'); }
      try { http.setMaxIdleHTTPParsers(0); } catch (error) { console.log(error.name, error.code); }
      try { http.setMaxIdleHTTPParsers('1'); } catch (error) { console.log(error.name, error.code); }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "function",
    "function",
    "true",
    "true",
    '{"types":{"close":"function","closeAllConnections":"function","closeIdleConnections":"function","setTimeout":"function"},"descriptors":{"close":{"name":"close","length":0,"enumerable":true},"closeAllConnections":{"name":"closeAllConnections","length":0,"enumerable":true},"closeIdleConnections":{"name":"closeIdleConnections","length":0,"enumerable":true},"setTimeout":{"name":"setTimeout","length":2,"enumerable":true}}}',
    '{"types":{"close":"function","closeAllConnections":"function","closeIdleConnections":"function","setTimeout":"function"},"descriptors":{"close":{"name":"close","length":0,"enumerable":true},"closeAllConnections":{"name":"closeAllConnections","length":0,"enumerable":true},"closeIdleConnections":{"name":"closeIdleConnections","length":0,"enumerable":true},"setTimeout":{"name":"setTimeout","length":2,"enumerable":true}}}',
    "incoming timeout setTimeout 2 true true true",
    "incoming setTimeout true 25",
    "incoming timeout callback 1",
    "16384",
    "function",
    "function",
    "function",
    "function",
    "function",
    "max parser prototype false undefined",
    "undefined",
    "undefined",
    "undefined",
    "TypeError ERR_INVALID_HTTP_TOKEN",
    "TypeError ERR_INVALID_HTTP_TOKEN",
    "TypeError ERR_INVALID_HTTP_TOKEN",
    "TypeError ERR_INVALID_CHAR",
    "TypeError ERR_HTTP_INVALID_HEADER_VALUE",
    "TypeError no-code",
    "RangeError ERR_OUT_OF_RANGE",
    "TypeError ERR_INVALID_ARG_TYPE",
    ""
  ].join("\n"));
});

test("http.ClientRequest exposes Node-style header and lifecycle helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('node:http');
      const https = require('node:https');
      const req = http.request('http://localhost:3000/path?x=1', {
        headers: { 'X-Initial': 'yes' }
      });
      req.on('error', () => {});
      console.log(req.method);
      console.log(req.path);
      console.log(req.agent === http.globalAgent);
      console.log(req.reusedSocket);
      console.log(req.setHeader('X-Later', 'ok') === req);
      console.log(req.getHeader('x-initial'));
      console.log(req.hasHeader('X-Later'));
      console.log(req.getHeaderNames().sort().join(','));
      const headers = req.getHeaders();
      console.log(Object.getPrototypeOf(headers) === null);
      console.log(headers.host);
      console.log(headers['x-later']);
      console.log(req.headersSent === undefined || req.headersSent === false);
      console.log(req.flushHeaders());
      console.log(req.headersSent);
      console.log(req.setTimeout(50, () => {}) === req);
      console.log(req.writableEnded);
      req.end();
      console.log(req.writableEnded);
      req.destroy();

      function authHeader(...args) {
        const authReq = http.request(...args);
        authReq.on('error', () => {});
        const header = authReq.getHeader('authorization');
        authReq.destroy();
        return header;
      }

      console.log(authHeader('http://user:pass@localhost:3000/path'));
      console.log(authHeader(new URL('http://user:p%40ss@localhost:3000/path')));
      console.log(authHeader({ hostname: 'localhost', port: 3000, path: '/path', auth: 'user:pass' }));
      console.log(authHeader('http://user:pass@localhost:3000/path', { headers: { authorization: 'Bearer explicit' } }));

      const urlOwnedOptions = new URL('http://user:pass@localhost/original?x=1');
      urlOwnedOptions.method = 'post';
      urlOwnedOptions.headers = { 'X-Url': 'yes' };
      urlOwnedOptions.path = '/url-owned?z=1';
      urlOwnedOptions.auth = 'override:secret';
      const urlOwnedReq = http.request(urlOwnedOptions);
      urlOwnedReq.on('error', () => {});
      console.log("url owned options", urlOwnedReq.method, urlOwnedReq.path, urlOwnedReq.getHeader('x-url'), urlOwnedReq.getHeader('authorization'), urlOwnedReq.getHeader('host'));
      urlOwnedReq.destroy();

      const urlSecondOptions = new URL('http://localhost:3000/from-url');
      urlSecondOptions.method = 'post';
      urlSecondOptions.headers = { 'X-Url': 'yes' };
      const urlSecondReq = http.request(urlSecondOptions, {
        method: 'put',
        headers: { 'X-Options': 'ok' },
        path: '/from-options'
      });
      urlSecondReq.on('error', () => {});
      console.log("url second options", urlSecondReq.method, urlSecondReq.path, urlSecondReq.getHeader('x-url'), urlSecondReq.getHeader('x-options'), urlSecondReq.getHeader('host'));
      urlSecondReq.destroy();

      const overrideReq = http.request('http://localhost/original?x=1', { path: '/override?y=2' });
      overrideReq.on('error', () => {});
      console.log("path override", overrideReq.path, overrideReq.port, overrideReq.getHeader('host'));
      overrideReq.destroy();

      const defaultPortReq = http.request('http://localhost/default');
      defaultPortReq.on('error', () => {});
      console.log("default port", defaultPortReq.path, defaultPortReq.port, defaultPortReq.getHeader('host'));
      defaultPortReq.destroy();

      for (const [label, action, expected] of [
        ["http ftp", () => http.request("ftp://localhost:3000/"), 'Expected "http:"'],
        ["https http", () => https.request("http://localhost:3000/"), 'Expected "https:"']
      ]) {
        try {
          const invalidReq = action();
          invalidReq.on('error', () => {});
          invalidReq.destroy();
          console.log(label, "ok");
        } catch (error) {
          console.log(label, error.name, error.code, error.message.includes(expected));
        }
      }

      for (const [label, options, code, text] of [
        ["method space", { method: "BAD METHOD" }, "ERR_INVALID_HTTP_TOKEN", "valid HTTP token"],
        ["method newline", { method: "GET\\nX" }, "ERR_INVALID_HTTP_TOKEN", "valid HTTP token"],
        ["method number", { method: 123 }, "ERR_INVALID_ARG_TYPE", "options.method"],
        ["method array", { method: ["GET"] }, "ERR_INVALID_ARG_TYPE", "options.method"]
      ]) {
        try {
          const invalidReq = http.request({ host: "localhost", port: 3000, path: "/", ...options });
          invalidReq.on('error', () => {});
          invalidReq.destroy();
          console.log(label, "ok");
        } catch (error) {
          console.log(label, error.name, error.code, error.message.includes(text));
        }
      }

      for (const [label, action] of [
        ["path space", () => http.request({ host: "localhost", port: 3000, path: "/has space" })],
        ["path newline", () => http.request({ host: "localhost", port: 3000, path: "/bad\\npath" })],
        ["https path tab", () => https.request({ host: "localhost", port: 3000, path: "/bad\\tpath" })]
      ]) {
        try {
          const invalidReq = action();
          invalidReq.on('error', () => {});
          invalidReq.destroy();
          console.log(label, "ok");
        } catch (error) {
          console.log(label, error.name, error.code, error.message);
        }
      }
      const escapedPathReq = http.request({ host: "localhost", port: 3000, path: "/has%20space" });
      escapedPathReq.on('error', () => {});
      console.log("path escaped", escapedPathReq.path);
      escapedPathReq.destroy();
      const lowerReq = http.request({ host: "localhost", port: 3000, path: "/", method: "post" });
      lowerReq.on('error', () => {});
      console.log("method lower", lowerReq.method);
      lowerReq.destroy();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "GET",
    "/path?x=1",
    "true",
    "false",
    "true",
    "yes",
    "true",
    "host,x-initial,x-later",
    "true",
    "localhost:3000",
    "ok",
    "true",
    "undefined",
    "true",
    "true",
    "false",
    "true",
    "Basic dXNlcjpwYXNz",
    "Basic dXNlcjpwQHNz",
    "Basic dXNlcjpwYXNz",
    "Bearer explicit",
    "url owned options POST /url-owned?z=1 yes Basic b3ZlcnJpZGU6c2VjcmV0 localhost",
    "url second options PUT /from-options undefined ok localhost:3000",
    "path override /override?y=2 80 localhost",
    "default port /default 80 localhost",
    "http ftp TypeError ERR_INVALID_PROTOCOL true",
    "https http TypeError ERR_INVALID_PROTOCOL true",
    "method space TypeError ERR_INVALID_HTTP_TOKEN true",
    "method newline TypeError ERR_INVALID_HTTP_TOKEN true",
    "method number TypeError ERR_INVALID_ARG_TYPE true",
    "method array TypeError ERR_INVALID_ARG_TYPE true",
    "path space TypeError ERR_UNESCAPED_CHARACTERS Request path contains unescaped characters",
    "path newline TypeError ERR_UNESCAPED_CHARACTERS Request path contains unescaped characters",
    "https path tab TypeError ERR_UNESCAPED_CHARACTERS Request path contains unescaped characters",
    "path escaped /has%20space",
    "method lower POST",
    ""
  ].join("\n"));
});

test("http request-side prototypes expose Node-shaped probe helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('node:http');
      function functionPrototypeRow(fn) {
        const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
        if (!descriptor) return 'no-prototype';
        return [descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.getOwnPropertyNames(descriptor.value).join(',')].join('/');
      }
      function descriptorRow(prototype, name) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor) return [name, 'missing', typeof prototype[name]].join(':');
        if ('value' in descriptor) {
          return [name, 'data', descriptor.enumerable, descriptor.configurable, descriptor.writable, typeof descriptor.value, descriptor.value?.name, descriptor.value?.length, Object.hasOwn(descriptor.value, 'prototype'), functionPrototypeRow(descriptor.value)].join(':');
        }
        return [name, 'accessor', descriptor.enumerable, descriptor.configurable, descriptor.get?.name, descriptor.get?.length, typeof descriptor.set, descriptor.set?.name ?? '', descriptor.set?.length ?? '', Object.hasOwn(descriptor.get ?? {}, 'prototype'), Object.hasOwn(descriptor.set ?? {}, 'prototype')].join(':');
      }
      const clientNames = ['path', 'clearTimeout', 'setNoDelay', 'setSocketKeepAlive', '_implicitHeader', '_finish', '_deferToConnect', 'onSocket', 'setTimeout', 'abort', 'destroy'];
      const incomingNames = ['headersDistinct', 'trailersDistinct', 'signal', 'setTimeout', '_read', '_destroy', '_dumpAndCloseReadable', '_dump'];
      console.log('client proto parent', Object.getPrototypeOf(http.ClientRequest.prototype).constructor.name);
      console.log('client proto rows', clientNames.map((name) => descriptorRow(http.ClientRequest.prototype, name)).join('|'));
      console.log('incoming proto rows', incomingNames.map((name) => descriptorRow(http.IncomingMessage.prototype, name)).join('|'));

      const req = http.request('http://localhost:3000/path?x=1');
      req.on('error', () => {});
      console.log('request path', Object.hasOwn(req, 'path'), req.path, req instanceof http.OutgoingMessage);
      const socketRows = [];
      const socket = {
        connecting: false,
        setNoDelay: (value) => socketRows.push('setNoDelay:' + value),
        setKeepAlive: (...args) => socketRows.push('setKeepAlive:' + args.join(':')),
        setTimeout: (...args) => socketRows.push('setTimeout:' + args.join(':'))
      };
      console.log('on socket', req.onSocket(socket) === undefined, req.socket === socket, socket._httpMessage === req);
      console.log(
        'request helpers',
        req.clearTimeout() === undefined,
        req.setNoDelay(false) === undefined,
        req.setSocketKeepAlive(true, 12) === undefined,
        req._implicitHeader() === undefined,
        req._finish() === undefined,
        req._deferToConnect(() => socketRows.push('deferred'), []) === undefined,
        socketRows.join('|')
      );
      req.destroy();

      const deferredReq = http.request('http://localhost:3000/deferred');
      deferredReq.on('error', () => {});
      const deferredSocketRows = [];
      const deferredSocket = {
        connecting: false,
        setNoDelay: (value) => deferredSocketRows.push('setNoDelay:' + value),
        setKeepAlive: (...args) => deferredSocketRows.push('setKeepAlive:' + args.join(':')),
        setTimeout: (...args) => deferredSocketRows.push('setTimeout:' + args.join(':'))
      };
      deferredReq.setNoDelay(false);
      deferredReq.setSocketKeepAlive(true, 12);
      deferredReq.clearTimeout();
      console.log('deferred socket helpers', deferredReq.onSocket(deferredSocket) === undefined, deferredSocketRows.join('|'));
      deferredReq.destroy();

      const abortReq = http.request('http://localhost:3000/abort');
      abortReq.on('error', () => {});
      console.log('abort return', abortReq.abort(), abortReq.destroyed, abortReq.aborted);

      const incoming = new http.IncomingMessage({
        method: 'GET',
        url: '/',
        headers: [['a', '1'], ['b', '2'], ['b', '3']],
        trailers: { t: ['x', 'y'] },
        port: 80
      });
      console.log('incoming distinct', JSON.stringify(incoming.headersDistinct), Object.getPrototypeOf(incoming.headersDistinct) === null, JSON.stringify(incoming.trailersDistinct), Object.getPrototypeOf(incoming.trailersDistinct) === null);
      console.log('incoming signal/dump', incoming.signal.constructor.name, incoming.signal.aborted, incoming._dump(), incoming._dumped);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "client proto parent OutgoingMessage",
    "client proto rows path:accessor:true:true:get:0:function:set:1:false:false|clearTimeout:data:true:true:true:function:clearTimeout:1:true:false/false/true/constructor|setNoDelay:data:true:true:true:function:setNoDelay:1:true:false/false/true/constructor|setSocketKeepAlive:data:true:true:true:function:setSocketKeepAlive:2:true:false/false/true/constructor|_implicitHeader:data:true:true:true:function:_implicitHeader:0:true:false/false/true/constructor|_finish:data:true:true:true:function:_finish:0:true:false/false/true/constructor|_deferToConnect:data:true:true:true:function:_deferToConnect:2:true:false/false/true/constructor|onSocket:data:true:true:true:function:onSocket:2:true:false/false/true/constructor|setTimeout:data:true:true:true:function:setTimeout:2:true:false/false/true/constructor|abort:data:true:true:true:function:abort:0:true:false/false/true/constructor|destroy:data:true:true:true:function:destroy:1:true:false/false/true/constructor",
    "incoming proto rows headersDistinct:accessor:false:false:get:0:function:set:1:true:true|trailersDistinct:accessor:false:false:get:0:function:set:1:true:true|signal:accessor:false:true:get:0:undefined:::true:false|setTimeout:data:true:true:true:function:setTimeout:2:true:false/false/true/constructor|_read:data:true:true:true:function:_read:1:true:false/false/true/constructor|_destroy:data:true:true:true:function:_destroy:2:true:false/false/true/constructor|_dumpAndCloseReadable:data:true:true:true:function:_dumpAndCloseReadable:0:true:false/false/true/constructor|_dump:data:true:true:true:function:_dump:0:true:false/false/true/constructor",
    "request path false /path?x=1 true",
    "on socket true true true",
    "request helpers true true true true true true setTimeout:0|setNoDelay:false|setKeepAlive:true:12|deferred",
    "deferred socket helpers true setNoDelay:false|setKeepAlive:true:12|setTimeout:0",
    "abort return undefined true true",
    'incoming distinct {"a":["1"],"b":["2","3"]} true {"t":["x","y"]} true',
    "incoming signal/dump AbortSignal false undefined true"
  ]);
});

test("http.ClientRequest emits socket event and honors createConnection", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/client-socket.mjs", `
    import http from "node:http";
    import { EventEmitter } from "node:events";

    const server = http.createServer((req, res) => res.end("ok"));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    const req = http.request({ host: "127.0.0.1", port, path: "/probe" });
    const rows = [];
    rows.push("initial:" + [req.socket === null, req.connection === null].join(":"));
    const socketSeen = new Promise((resolve) => {
      req.on("socket", (socket) => {
        rows.push("socket:" + [
          req.socket === socket,
          req.connection === socket,
          socket._httpMessage === req,
          typeof socket.setTimeout,
          typeof socket.destroy,
          socket.writable,
          socket.destroyed,
          socket.connecting,
          socket.localAddress
        ].join(":"));
        resolve();
      });
    });
    const responseSeen = new Promise((resolve) => {
      req.on("response", (res) => {
        rows.push("response:" + [req.socket !== null, req.connection === req.socket, res.statusCode].join(":"));
        res.resume();
        res.on("end", resolve);
      });
    });
    req.end();
    await socketSeen;
    await responseSeen;
    server.close();
    console.log(rows.join("|"));

    const customSocket = new EventEmitter();
    customSocket.writable = true;
    customSocket.destroyed = false;
    customSocket.connecting = false;
    customSocket.setTimeout = () => customSocket;
    customSocket.destroy = function destroy() {
      this.destroyed = true;
      this.emit("close");
      return this;
    };
    const customRows = [];
    const customReq = http.request({
      host: "example.com",
      port: 80,
      path: "/probe",
      createConnection(options, callback) {
        customRows.push("createConnection:" + [options.host, options.port, options.path, typeof callback].join(":"));
        return customSocket;
      }
    });
    customRows.push("initial:" + [customReq.socket === null, customReq.connection === null].join(":"));
    await new Promise((resolve) => {
      customReq.on("socket", (socket) => {
        customRows.push("socket:" + [
          socket === customSocket,
          customReq.socket === socket,
          customReq.connection === socket,
          socket._httpMessage === customReq,
          typeof socket.setTimeout,
          typeof socket.destroy,
          socket.writable,
          socket.destroyed
        ].join(":"));
        resolve();
      });
    });
    console.log(customRows.join("|"));
    customReq.destroy();
  `);

  const result = await kernel.run("node", ["/workspace/client-socket.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "initial:true:true|socket:true:true:true:function:function:true:false:false:127.0.0.1|response:true:true:200",
    "initial:true:true|createConnection:example.com:80:/probe:function|socket:true:true:true:true:function:function:true:false"
  ]);
});

test("http.ServerResponse exposes Node-style header, trailer, and interim response helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server-response.mjs", `
    import http from "node:http";

    const server = http.createServer((req, res) => {
      console.log(req.connection === req.socket);
      console.log(res.connection === res.socket);
      console.log(res.setHeader('X-Initial', 'yes') === res);
      res.setHeader('X-Remove', 'gone');
      console.log(res.removeHeader('X-Remove'));
      console.log(res.getHeader('x-initial'));
      console.log(res.hasHeader('X-Initial'));
      console.log(res.getHeaderNames().join(','));
      const headers = res.getHeaders();
      console.log(Object.getPrototypeOf(headers) === null);
      console.log(headers['x-initial']);
      console.log(res.writeContinue(() => console.log('continue callback')));
      console.log(res.writeProcessing());
      console.log(res.addTrailers({ 'X-Trailer': 'done', 'X-Multi': ['a', 'b'] }));
      console.log(res.headersSent);
      console.log(res.flushHeaders());
      console.log(res.headersSent);
      res.writeHead(201, 'Created', { 'X-Later': 'ok' });
      res.end('done');
    });

    console.log(typeof server.ref);
    console.log(typeof server.unref);
    console.log(server.setTimeout(25) === server);
    server.listen(3000, () => {
      http.get('http://localhost:3000/', (res) => {
        console.log(res.statusCode);
        console.log(res.statusMessage);
        console.log(res.headers['x-later']);
        res.on('data', (chunk) => console.log(String(chunk)));
        res.on('end', () => {
          console.log(JSON.stringify(res.trailers));
          console.log(res.rawTrailers.join('|'));
          server.close();
        });
      });
    });

    await new Promise((resolve) => server.on('close', resolve));
  `);

  const result = await kernel.run("node", ["server-response.mjs"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "function",
    "function",
    "true",
    "true",
    "true",
    "true",
    "undefined",
    "yes",
    "true",
    "x-initial",
    "true",
    "yes",
    "continue callback",
    "undefined",
    "undefined",
    "undefined",
    "false",
    "undefined",
    "true",
    "201",
    "Created",
    "ok",
    "done",
    "{\"x-trailer\":\"done\",\"x-multi\":\"a, b\"}",
    "X-Trailer|done|X-Multi|a|X-Multi|b",
    ""
  ].join("\n"));
});

test("http.get dispatches virtual localhost requests through the kernel HTTP table", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end('path:' + req.url);
    }).listen(3000);
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('http');
      http.get('http://localhost:3000/from-client', (res) => {
        console.log(res.statusCode);
        res.on('data', (chunk) => console.log(String(chunk)));
      });
    `
  ], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "200\npath:/from-client\n");
  server.kill("SIGTERM");
});

test("http.request streams virtual localhost request body chunks before client end", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const http = require('http');

    const rows = [];
    let clientEnded = false;
    const server = http.createServer((req, res) => {
      req.on('data', (chunk) => {
        rows.push('server data:' + String(chunk) + ':clientEnded=' + clientEnded);
      });
      req.on('end', () => {
        rows.push('server end:clientEnded=' + clientEnded);
        res.end(rows.join('|'));
      });
    });

    await new Promise((resolve) => server.listen(3000, '127.0.0.1', resolve));

    const responseText = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: 3000,
        path: '/stream',
        method: 'POST'
      }, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve(text));
      });
      req.on('error', reject);
      req.write('first');
      setTimeout(() => {
        rows.push('client before end');
        clientEnded = true;
        req.end('second');
      }, 0);
    });

    console.log(responseText);
    server.close();
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "server data:first:clientEnded=false|client before end|server data:second:clientEnded=true|server end:clientEnded=true",
    ""
  ].join("\n"));
});

test("http IncomingMessage ends empty request and response streams", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import http from "node:http";
    import net from "node:net";

    const server = http.createServer((req, res) => {
      const events = [];
      const timeout = setTimeout(() => {
        if (!events.some((event) => event.startsWith("end:"))) {
          res.statusCode = 599;
          res.end(req.url + ":timeout:" + events.join("|"));
        }
      }, 10);

      req.on("data", (chunk) => {
        events.push("data:" + chunk.length);
      });
      req.on("end", () => {
        clearTimeout(timeout);
        events.push("end:" + req.readableEnded);
        if (req.url === "/empty-200") {
          res.statusCode = 200;
          res.end();
          return;
        }
        if (req.url === "/status-204") {
          res.statusCode = 204;
          res.end("ignored");
          return;
        }
        res.end(req.url + ":" + events.join("|"));
      });
    });

    await new Promise((resolve) => server.listen(3000, "127.0.0.1", resolve));

    function request(path, options = {}, body) {
      return new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port: 3000, path, ...options }, (res) => {
          const events = [];
          let text = "";
          res.on("data", (chunk) => {
            events.push("data:" + chunk.length);
            text += String(chunk);
          });
          res.on("end", () => {
            events.push("end:" + res.readableEnded);
            resolve([path, res.statusCode, events.join("|"), text].join(" "));
          });
        });
        req.on("error", reject);
        if (body === undefined) req.end();
        else req.end(body);
      });
    }

    function raw(payload) {
      return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port: 3000 });
        let text = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
          text += chunk;
        });
        socket.on("error", reject);
        socket.on("end", () => {
          resolve(text.split("\\r\\n\\r\\n")[1] ?? "");
        });
        socket.write(payload);
      });
    }

    console.log(await request("/no-body"));
    console.log(await request("/length-zero", { method: "POST", headers: { "content-length": "0" } }));
    console.log(await request("/explicit-empty", { method: "POST" }, new Uint8Array(0)));
    console.log(await request("/empty-200"));
    console.log(await request("/status-204"));
    console.log("raw", await raw("GET /raw-get HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\n"));
    console.log("raw", await raw("POST /raw-post HTTP/1.1\\r\\nHost: localhost\\r\\nContent-Length: 0\\r\\n\\r\\n"));

    server.close();
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "/no-body 200 data:17|end:true /no-body:end:true",
    "/length-zero 200 data:21|end:true /length-zero:end:true",
    "/explicit-empty 200 data:24|end:true /explicit-empty:end:true",
    "/empty-200 200 end:true ",
    "/status-204 204 end:true ",
    "raw /raw-get:end:true",
    "raw /raw-post:end:true"
  ]);
});

test("http servers accept in-container TCP upgrade requests", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import http from "node:http";
    import net from "node:net";

    const server = http.createServer();

    server.on("upgrade", (req, socket) => {
      console.log("upgrade requested:", req.headers.upgrade);
      socket.write(
        "HTTP/1.1 101 Switching Protocols\\r\\n" +
          "Connection: Upgrade\\r\\n" +
          "Upgrade: repl-test\\r\\n" +
          "\\r\\n"
      );
      socket.write("hello over upgraded socket\\n");
      socket.on("data", (chunk) => {
        socket.write(\`echo:\${chunk}\`);
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const { port } = server.address();
    console.log("server ready:", port > 0);

    const client = net.createConnection({ host: "127.0.0.1", port });
    client.setEncoding("utf8");
    client.write(
      "GET /upgrade HTTP/1.1\\r\\n" +
        "Host: 127.0.0.1\\r\\n" +
        "Connection: Upgrade\\r\\n" +
        "Upgrade: repl-test\\r\\n" +
        "\\r\\n"
    );

    client.on("data", (data) => {
      console.log("client received:", JSON.stringify(data));
      if (data.includes("hello over upgraded socket")) {
        client.write("ping\\n");
      }
      if (data.includes("echo:ping")) {
        client.end();
        server.close();
      }
    });

    await new Promise((resolve) => server.on("close", resolve));
    console.log("upgrade test complete");
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "server ready: true",
    "upgrade requested: repl-test",
    "client received: \"HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: repl-test\\r\\n\\r\\n\"",
    "client received: \"hello over upgraded socket\\n\"",
    "client received: \"echo:ping\\n\"",
    "upgrade test complete",
    ""
  ].join("\n"));
});

test("http.createServer registers initial listener as reorderable request listener", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    const server = http.createServer((req, res) => {
      res.end('app:' + req.url);
    });
    const appListener = server.listeners('request')[0];
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      if (req.url.startsWith('/socket.io/')) {
        res.end('socket');
        return;
      }
      appListener(req, res);
    });
    server.listen(3000);
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const socketResponse = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/socket.io/?EIO=4",
    headers: []
  });
  const appResponse = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/hello",
    headers: []
  });

  assert.equal(new TextDecoder().decode(socketResponse.body), "socket");
  assert.equal(new TextDecoder().decode(appResponse.body), "app:/hello");
  server.kill("SIGTERM");
});

test("virtual server request listener errors return 500 without escaping the host app", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer(() => {
      throw new Error('request boom');
    }).listen(3000);
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const response = await kernel.dispatchHttpRequest({
    projectId: "demo",
    port: 3000,
    method: "GET",
    url: "/boom",
    headers: []
  });

  assert.equal(response.status, 500);
  assert.equal(response.statusText, "Internal Server Error");
  assert.match(new TextDecoder().decode(response.body), /Unhandled virtual server error: request boom/);
  assert.match(server.stderr.toString(), /request boom/);
  server.kill("SIGTERM");
});

test("global fetch dispatches virtual localhost requests through the kernel HTTP table", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const http = require('http');
    http.createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end('fetch-path:' + req.url);
    }).listen(3000);
  `);
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('http://localhost:3000/from-fetch?x=1');
    console.log(response.status);
    console.log(await response.text());
  `);
  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.portManager.hasPid(server.pid));

  const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "200\nfetch-path:/from-fetch?x=1\n");
  server.kill("SIGTERM");
});

test("https.get maps external requests to fetch when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response("fetched:" + new URL(url).pathname, {
    status: 201,
    statusText: "Created",
    headers: { "content-type": "text/plain" }
  });

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        https.get('https://example.com/api', (res) => {
          console.log(res.statusCode);
          res.on('data', (chunk) => console.log(String(chunk)));
        });
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "201\nfetched:/api\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch maps external requests to browser fetch when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('https://example.com/api');
    console.log(response.status);
    console.log(await response.text());
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response("fetched:" + new URL(url).pathname, {
    status: 202,
    statusText: "Accepted",
    headers: { "content-type": "text/plain" }
  });

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "202\nfetched:/api\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch strips npm registry headers that force browser CORS preflight", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('https://registry.npmjs.org/chalk', {
      headers: {
        accept: 'application/vnd.npm.install-v1+json',
        'npm-command': 'install',
        'pacote-req-type': 'packument',
        'pacote-version': '19.0.1',
        'user-agent': 'npm/11'
      }
    });
    console.log(response.status);
    console.log(await response.text());
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(String(url), "https://registry.npmjs.org/chalk");
    assert.equal(init.credentials, "omit");
    assert.equal(headers.get("accept"), "application/vnd.npm.install-v1+json");
    assert.equal(headers.has("npm-command"), false);
    assert.equal(headers.has("pacote-req-type"), false);
    assert.equal(headers.has("pacote-version"), false);
    assert.equal(headers.has("user-agent"), false);
    return new Response("registry-ok", { status: 203 });
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "203\nregistry-ok\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("https.get strips npm registry headers that force browser CORS preflight", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(String(url), "https://registry.npmjs.org/chalk");
    assert.equal(init.credentials, "omit");
    assert.equal(headers.get("accept"), "application/vnd.npm.install-v1+json");
    assert.equal(headers.has("npm-command"), false);
    assert.equal(headers.has("pacote-version"), false);
    return new Response("registry-ok", {
      status: 206,
      statusText: "Partial Content",
      headers: { "content-type": "text/plain" }
    });
  };

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        https.get('https://registry.npmjs.org/chalk', {
          headers: {
            accept: 'application/vnd.npm.install-v1+json',
            'npm-command': 'install',
            'pacote-version': '19.0.1'
          }
        }, (res) => {
          console.log(res.statusCode);
          res.on('data', (chunk) => console.log(String(chunk)));
        });
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "206\nregistry-ok\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch blocks host application origin even when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://run.opencontainers.local/api/private');
    } catch (error) {
      console.log(error.code);
    }
  `);
  const oldFetch = globalThis.fetch;
  const oldLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  globalThis.fetch = async () => {
    throw new Error("host fetch should not be called");
  };
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://run.opencontainers.local" }
  });

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
    restoreGlobalLocation(oldLocationDescriptor);
  }
});

test("https.get blocks host application origin even when external network permission is enabled", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  const oldFetch = globalThis.fetch;
  const oldLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  globalThis.fetch = async () => {
    throw new Error("host fetch should not be called");
  };
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://run.opencontainers.local" }
  });

  try {
    const result = await kernel.run("node", [
      "-e",
      `
        const https = require('https');
        const req = https.get('https://run.opencontainers.local/api/private', () => {});
        req.on('error', (error) => console.log(error.code));
      `
    ], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_HOST_ORIGIN_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
    restoreGlobalLocation(oldLocationDescriptor);
  }
});

test("http.get blocks external requests without external network permission", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const http = require('http');
      const req = http.get('http://example.com/', () => {});
      req.on('error', (error) => console.log(error.code));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED\n");
});

test("global fetch blocks external requests without external network permission", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://example.com/');
    } catch (error) {
      console.log(error.code);
    }
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("host fetch should not be called");
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch allows descriptor-scoped external hosts without enabling general external network", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    const response = await fetch('https://example.com/package');
    console.log(response.status + ':' + await response.text());

    try {
      await fetch('https://blocked.example/package');
    } catch (error) {
      console.log(error.code);
    }
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://example.com/package");
    return new Response("allowed", { status: 200 });
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], {
      cwd: "/workspace",
      externalNetworkAllowlist: ["example.com"]
    });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "200:allowed\nERR_OPENCONTAINERS_EXTERNAL_NETWORK_BLOCKED\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("global fetch reports browser CORS and network failures clearly", async () => {
  const kernel = new Kernel();
  kernel.allowExternalNetwork = true;
  kernel.fs.writeFileSync("/workspace/client.mjs", `
    try {
      await fetch('https://example.com/');
    } catch (error) {
      console.log(error.code);
      console.log(error.message.includes('Browser CORS and network restrictions still apply'));
    }
  `);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const result = await kernel.run("node", ["client.mjs"], { cwd: "/workspace" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_EXTERNAL_FETCH_FAILED\ntrue\n");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

function restoreGlobalLocation(descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, "location", descriptor);
  } else {
    delete globalThis.location;
  }
}

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
