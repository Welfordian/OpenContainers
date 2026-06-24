import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("node:net supports virtual localhost server/client sockets", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/server.js", `
    const net = require('net');
    const server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => socket.write('echo:' + chunk));
    });
    server.listen(4321, '127.0.0.1');
  `);

  const server = kernel.spawn("node", ["server.js"], { cwd: "/workspace", projectId: "demo" });
  await eventually(() => kernel.net.hasPid(server.pid));

  const result = await kernel.run("node", [
    "-e",
    `
      const net = require('node:net');
      const socket = net.connect(4321, 'localhost', () => socket.write('hello'));
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => {
        console.log(chunk);
        socket.end();
      });
    `
  ], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "echo:hello\n");
  server.kill("SIGTERM");
});

test("node:net reports clear V1 error for external raw TCP", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const net = require('net');
      try {
        net.connect(5432, 'db.example.com');
      } catch (error) {
        console.log(error.code);
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_RAW_TCP_UNSUPPORTED\n");
});

test("node:net reports Node-shaped missing connect arguments", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const net = require("node:net");
    for (const [label, action] of [
      ["connect0", () => net.connect()],
      ["connectObject", () => net.connect({})],
      ["create0", () => net.createConnection()],
      ["createObject", () => net.createConnection({})],
      ["socket0", () => new net.Socket().connect()],
      ["socketObject", () => new net.Socket().connect({})]
    ]) {
      try {
        const socket = action();
        socket.destroy();
      } catch (error) {
        console.log(label, error.constructor.name, error.code, error.message);
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    'connect0 TypeError ERR_MISSING_ARGS The "options" or "port" or "path" argument must be specified',
    'connectObject TypeError ERR_MISSING_ARGS The "options" or "port" or "path" argument must be specified',
    'create0 TypeError ERR_MISSING_ARGS The "options" or "port" or "path" argument must be specified',
    'createObject TypeError ERR_MISSING_ARGS The "options" or "port" or "path" argument must be specified',
    'socket0 TypeError ERR_MISSING_ARGS The "options" or "port" or "path" argument must be specified',
    'socketObject TypeError ERR_MISSING_ARGS The "options" or "port" or "path" argument must be specified'
  ]);
});

test("node:net reports Node-shaped bad port validation", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    const net = require("node:net");
    for (const [label, action] of [
      ["connect-string", () => net.connect({ port: "abc" })],
      ["connect-negative", () => net.connect(-1)],
      ["connect-high", () => net.connect(65536)],
      ["connect-null", () => net.connect({ port: null })],
      ["connect-function", () => net.connect(() => {})],
      ["createConnection-string", () => net.createConnection({ port: "abc" })],
      ["socket-connect-high", () => new net.Socket().connect(65536)],
      ["listen-negative", () => net.createServer().listen(-1)],
      ["listen-high", () => net.createServer().listen(65536)],
      ["listen-object-string", () => net.createServer().listen({ port: "abc" })]
    ]) {
      try {
        const value = action();
        value.destroy?.();
        value.close?.();
      } catch (error) {
        console.log(label, error.constructor.name, error.code, error.message);
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "connect-string RangeError ERR_SOCKET_BAD_PORT Port should be >= 0 and < 65536. Received type string ('abc').",
    "connect-negative RangeError ERR_SOCKET_BAD_PORT Port should be >= 0 and < 65536. Received type number (-1).",
    "connect-high RangeError ERR_SOCKET_BAD_PORT Port should be >= 0 and < 65536. Received type number (65536).",
    'connect-null TypeError ERR_INVALID_ARG_TYPE The "options.port" property must be one of type number or string. Received null',
    'connect-function TypeError ERR_INVALID_ARG_TYPE The "options.port" property must be one of type number or string. Received function ',
    "createConnection-string RangeError ERR_SOCKET_BAD_PORT Port should be >= 0 and < 65536. Received type string ('abc').",
    "socket-connect-high RangeError ERR_SOCKET_BAD_PORT Port should be >= 0 and < 65536. Received type number (65536).",
    "listen-negative RangeError ERR_SOCKET_BAD_PORT options.port should be >= 0 and < 65536. Received type number (-1).",
    "listen-high RangeError ERR_SOCKET_BAD_PORT options.port should be >= 0 and < 65536. Received type number (65536).",
    "listen-object-string RangeError ERR_SOCKET_BAD_PORT options.port should be >= 0 and < 65536. Received type string ('abc')."
  ]);
});

test("node:net exposes BlockList, SocketAddress, and auto-select-family helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import net from "node:net";

    console.log("exports", typeof net.BlockList, typeof net.SocketAddress, typeof net.getDefaultAutoSelectFamily);
    console.log("keys", Object.keys(net).join(","));
	    console.log("accessors", ["BlockList", "SocketAddress"].map((name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(net, name);
	      return [name, typeof descriptor.get, descriptor.get.name, descriptor.set, descriptor.enumerable, descriptor.configurable].join(":");
	    }).join("|"));
	    console.log("no loopback export", Object.hasOwn(net, "isLoopbackHost"));
	    console.log("ctor lengths", net.Socket.length, net.Server.length, net.createServer.length);
	    const serverAsyncDispose = Object.getOwnPropertyDescriptor(net.Server.prototype, Symbol.asyncDispose);
	    console.log("server asyncDispose", [typeof net.Server.prototype[Symbol.asyncDispose], net.Server.prototype[Symbol.asyncDispose].name, net.Server.prototype[Symbol.asyncDispose].length, serverAsyncDispose.enumerable, serverAsyncDispose.configurable, serverAsyncDispose.writable, Object.hasOwn(serverAsyncDispose.value, "prototype"), Object.getOwnPropertySymbols(net.Server.prototype).map(String).join(",")].join(":"));
	    const idleServer = net.createServer();
	    const idleDispose = idleServer[Symbol.asyncDispose]();
	    console.log("server asyncDispose idle", idleDispose.constructor.name, await idleDispose, idleServer.listening);
	    console.log("socket proto", Object.getOwnPropertyNames(net.Socket.prototype).join(","));
	    console.log("socket proto keys", Object.keys(net.Socket.prototype).join(","));
	    const socketPrototypeRows = ["connect", "setTimeout", "setNoDelay", "setKeepAlive", "address", "ref", "unref", "end", "pause", "resume", "destroySoon", "resetAndDestroy", "pending", "readyState", "bufferSize", "remoteAddress", "remoteFamily", "remotePort", "localAddress", "localPort", "localFamily", "bytesRead", "bytesWritten"].map((name) => {
	      const descriptor = Object.getOwnPropertyDescriptor(net.Socket.prototype, name);
	      if ("value" in descriptor) return [name, "data", descriptor.enumerable, descriptor.configurable, descriptor.writable, descriptor.value.name, descriptor.value.length, Object.hasOwn(descriptor.value, "prototype")].join(":");
	      return [name, "accessor", descriptor.enumerable, descriptor.configurable, descriptor.get.name, descriptor.get.length, Object.hasOwn(descriptor.get, "prototype"), typeof descriptor.set].join(":");
	    });
	    console.log("socket proto rows", socketPrototypeRows.join("|"));
	    const freshSocket = new net.Socket();
	    console.log("fresh socket", freshSocket.pending, freshSocket.readyState, freshSocket.connecting, freshSocket.destroyed, freshSocket.closed, freshSocket.localAddress, freshSocket.localPort, freshSocket.localFamily, freshSocket.remoteAddress, freshSocket.remotePort, freshSocket.remoteFamily, freshSocket.bufferSize, JSON.stringify(freshSocket.address()), freshSocket.setTimeout(0) === freshSocket, freshSocket.setNoDelay() === freshSocket, freshSocket.setKeepAlive(true, 10) === freshSocket, freshSocket.ref() === freshSocket, freshSocket.unref() === freshSocket);
	    console.log("private lengths", net._normalizeArgs.length, net._createServerHandle.length);
    console.log("private names", net._normalizeArgs.name, net._createServerHandle.name);
    console.log("stream", net.Stream === net.Socket, new net.Stream() instanceof net.Socket);
    const helperPrototypeNames = ["connect", "createConnection", "createServer", "isIPv4", "isIPv6", "getDefaultAutoSelectFamily", "setDefaultAutoSelectFamily", "getDefaultAutoSelectFamilyAttemptTimeout", "setDefaultAutoSelectFamilyAttemptTimeout"];
    console.log("helper prototypes", helperPrototypeNames.map((name) => {
      const fn = net[name];
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [
        name,
        Object.hasOwn(fn, "prototype"),
        descriptor?.enumerable,
        descriptor?.configurable,
        descriptor?.writable,
        Object.getOwnPropertyNames(descriptor?.value ?? {}).join(","),
        descriptor?.value?.constructor === fn
      ].join(":");
    }).join("|"));
    const normalized = net._normalizeArgs([4321, "localhost", () => {}]);
    const normalizedPath = net._normalizeArgs(["/tmp/opencontainers.sock"]);
    console.log("normalize", normalized[0].port, normalized[0].host, typeof normalized[1], normalizedPath[0].path, normalizedPath[1]);
    try {
      net._createServerHandle("127.0.0.1", 4321, 4);
    } catch (error) {
      console.log("handle", error.code);
    }
    console.log("defaults", net.getDefaultAutoSelectFamily(), net.getDefaultAutoSelectFamilyAttemptTimeout());
    console.log("setters", net.setDefaultAutoSelectFamily(false), net.setDefaultAutoSelectFamilyAttemptTimeout(123));
    console.log("updated", net.getDefaultAutoSelectFamily(), net.getDefaultAutoSelectFamilyAttemptTimeout());

    const parsed4 = net.SocketAddress.parse("127.0.0.1");
    const parsed4WithPort = net.SocketAddress.parse("127.0.0.1:4321");
    const parsed6 = net.SocketAddress.parse("[::1]:4321");
    const parsed6NoPort = net.SocketAddress.parse("[::1]");
    console.log("parse4", JSON.stringify(parsed4.toJSON()));
    console.log("parse4port", JSON.stringify(parsed4WithPort.toJSON()));
    console.log("parse6", JSON.stringify(parsed6.toJSON()));
    console.log("parse6bare", JSON.stringify(parsed6NoPort.toJSON()));
    console.log("parse bad", net.SocketAddress.parse("not-an-address"));

    const address = new net.SocketAddress({ address: "127.0.0.1", port: 80, family: "ipv4" });
    const address4Flow = new net.SocketAddress({ address: "127.0.0.1", flowlabel: 1048576 });
    const address6 = new net.SocketAddress({ address: "::1", port: 443, family: "ipv6", flowlabel: 7 });
    console.log("address", JSON.stringify(address.toJSON()), JSON.stringify(address4Flow.toJSON()), JSON.stringify(address6.toJSON()));
    console.log("guards", net.SocketAddress.isSocketAddress(address), net.SocketAddress.isSocketAddress({}), net.BlockList.isBlockList(new net.BlockList()), net.BlockList.isBlockList({}));
    console.log("socket shape", JSON.stringify(Object.getOwnPropertyNames(address)), Object.getOwnPropertyDescriptor(net.SocketAddress.prototype, "address").enumerable, Object.getOwnPropertyDescriptor(net.SocketAddress.prototype, "port").enumerable);

    const blockList = new net.BlockList();
    blockList.addAddress("127.0.0.1");
    blockList.addAddress("::1", "ipv6");
    blockList.addRange("10.0.0.1", "10.0.0.3");
    blockList.addSubnet("192.168.0.0", 24);
    console.log("rules", blockList.rules.join("|"));
    console.log("block shape", JSON.stringify(Object.getOwnPropertyNames(blockList)), Object.getOwnPropertyDescriptor(net.BlockList.prototype, "rules").enumerable, typeof blockList.toJSON, typeof blockList.fromJSON);
    console.log("json", JSON.stringify(blockList.toJSON()));
    const blockListCopy = new net.BlockList();
    console.log("fromjson", blockListCopy.fromJSON(blockList.toJSON()), blockListCopy.rules.join("|"));
    console.log("checks", blockList.check("127.0.0.1"), blockList.check("::1", "ipv6"), blockList.check("10.0.0.2"), blockList.check("10.0.0.4"), blockList.check("192.168.0.42"), blockList.check("192.168.1.1"));
    console.log("ip", net.isIP("127.0.0.1"), net.isIP("::1"), net.isIP("01.2.3.4"), net.isIP("999.2.3.4"));

    for (const [label, action] of [
      ["family", () => net.setDefaultAutoSelectFamily("yes")],
      ["timeout", () => net.setDefaultAutoSelectFamilyAttemptTimeout(0)],
      ["parseMissing", () => net.SocketAddress.parse()],
      ["parseNull", () => net.SocketAddress.parse(null)],
      ["parseObject", () => net.SocketAddress.parse({})],
      ["address", () => new net.SocketAddress({ address: "bad" })],
      ["addressNull", () => new net.SocketAddress({ address: null })],
      ["addressNumber", () => new net.SocketAddress({ address: 1 })],
      ["portNull", () => new net.SocketAddress({ port: null })],
      ["portBoolean", () => new net.SocketAddress({ port: true })],
      ["portEmpty", () => new net.SocketAddress({ port: "" })],
      ["portBlank", () => new net.SocketAddress({ port: " " })],
      ["portArray", () => new net.SocketAddress({ port: [] })],
      ["portArrayValue", () => new net.SocketAddress({ port: [80] })],
      ["portBigInt", () => new net.SocketAddress({ port: 1n })],
      ["portSymbol", () => new net.SocketAddress({ port: Symbol("p") })],
      ["familyString", () => new net.SocketAddress({ address: "127.0.0.1", family: "4" })],
      ["familyNumber", () => new net.SocketAddress({ address: "127.0.0.1", family: 4 })],
      ["familyNull", () => new net.SocketAddress({ address: "127.0.0.1", family: null })],
      ["flowlabel", () => new net.SocketAddress({ address: "127.0.0.1", flowlabel: -1 })],
      ["flowlabelNull", () => new net.SocketAddress({ address: "127.0.0.1", flowlabel: null })],
      ["flowlabelString", () => new net.SocketAddress({ address: "127.0.0.1", flowlabel: "1" })],
      ["block", () => blockList.addAddress("bad")],
      ["blockFamilyString", () => blockList.addAddress("127.0.0.1", "4")],
      ["blockFamilyNumber", () => blockList.addAddress("127.0.0.1", 4)],
      ["blockAddressType", () => blockList.addAddress(123)]
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label, error.code);
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "exports function function function",
    "keys _createServerHandle,_normalizeArgs,BlockList,SocketAddress,connect,createConnection,createServer,isIP,isIPv4,isIPv6,Server,Socket,Stream,getDefaultAutoSelectFamily,setDefaultAutoSelectFamily,getDefaultAutoSelectFamilyAttemptTimeout,setDefaultAutoSelectFamilyAttemptTimeout",
	    "accessors BlockList:function:get BlockList::true:true|SocketAddress:function:get SocketAddress::true:true",
	    "no loopback export false",
	    "ctor lengths 1 2 2",
	    "server asyncDispose function::0:true:true:true:false:Symbol(Symbol.asyncDispose)",
	    "server asyncDispose idle Promise undefined false",
	    "socket proto constructor,setTimeout,setNoDelay,setKeepAlive,address,pending,readyState,bufferSize,end,resetAndDestroy,pause,resume,destroySoon,bytesRead,remoteAddress,remoteFamily,remotePort,localAddress,localPort,localFamily,bytesWritten,connect,ref,unref",
	    "socket proto keys setTimeout,setNoDelay,setKeepAlive,address,end,resetAndDestroy,pause,resume,destroySoon,bytesRead,remoteAddress,remoteFamily,remotePort,localAddress,localPort,localFamily,bytesWritten,connect,ref,unref",
	    "socket proto rows connect:data:true:true:true::0:true|setTimeout:data:true:true:true:setStreamTimeout:2:true|setNoDelay:data:true:true:true::1:true|setKeepAlive:data:true:true:true::2:true|address:data:true:true:true::0:true|ref:data:true:true:true::0:true|unref:data:true:true:true::0:true|end:data:true:true:true::3:true|pause:data:true:true:true::0:true|resume:data:true:true:true::0:true|destroySoon:data:true:true:true::0:true|resetAndDestroy:data:true:true:true::0:true|pending:accessor:false:true:get:0:false:undefined|readyState:accessor:false:false:get:0:true:undefined|bufferSize:accessor:false:false:get:0:true:undefined|remoteAddress:accessor:true:false:remoteAddress:0:true:undefined|remoteFamily:accessor:true:false:remoteFamily:0:true:undefined|remotePort:accessor:true:false:remotePort:0:true:undefined|localAddress:accessor:true:false:localAddress:0:true:undefined|localPort:accessor:true:false:localPort:0:true:undefined|localFamily:accessor:true:false:localFamily:0:true:undefined|bytesRead:accessor:true:false:bytesRead:0:true:undefined|bytesWritten:accessor:true:false:bytesWritten:0:true:undefined",
	    "fresh socket true open false false false undefined undefined undefined undefined undefined undefined undefined {} true true true true true",
	    "private lengths 1 5",
    "private names normalizeArgs createServerHandle",
    "stream true true",
    "helper prototypes connect:true:false:false:true:constructor:true|createConnection:true:false:false:true:constructor:true|createServer:true:false:false:true:constructor:true|isIPv4:true:false:false:true:constructor:true|isIPv6:true:false:false:true:constructor:true|getDefaultAutoSelectFamily:true:false:false:true:constructor:true|setDefaultAutoSelectFamily:true:false:false:true:constructor:true|getDefaultAutoSelectFamilyAttemptTimeout:true:false:false:true:constructor:true|setDefaultAutoSelectFamilyAttemptTimeout:true:false:false:true:constructor:true",
    "normalize 4321 localhost function /tmp/opencontainers.sock undefined",
    "handle ERR_OPENCONTAINERS_NET_UNSUPPORTED",
    "defaults true 500",
    "setters undefined undefined",
    "updated false 123",
    'parse4 {"address":"127.0.0.1","port":0,"family":"ipv4","flowlabel":0}',
    'parse4port {"address":"127.0.0.1","port":4321,"family":"ipv4","flowlabel":0}',
    'parse6 {"address":"::1","port":4321,"family":"ipv6","flowlabel":0}',
    'parse6bare {"address":"::1","port":0,"family":"ipv6","flowlabel":0}',
    "parse bad undefined",
    'address {"address":"127.0.0.1","port":80,"family":"ipv4","flowlabel":0} {"address":"127.0.0.1","port":0,"family":"ipv4","flowlabel":0} {"address":"::1","port":443,"family":"ipv6","flowlabel":7}',
    "guards true false true false",
    "socket shape [] false false",
    "rules Subnet: IPv4 192.168.0.0/24|Range: IPv4 10.0.0.1-10.0.0.3|Address: IPv6 ::1|Address: IPv4 127.0.0.1",
    "block shape [] false function function",
    'json ["Subnet: IPv4 192.168.0.0/24","Range: IPv4 10.0.0.1-10.0.0.3","Address: IPv6 ::1","Address: IPv4 127.0.0.1"]',
    "fromjson undefined Address: IPv4 127.0.0.1|Address: IPv6 ::1|Range: IPv4 10.0.0.1-10.0.0.3|Subnet: IPv4 192.168.0.0/24",
    "checks true true true false true false",
    "ip 4 6 0 0",
    "family ERR_INVALID_ARG_TYPE",
    "timeout ERR_OUT_OF_RANGE",
    "parseMissing ERR_INVALID_ARG_TYPE",
    "parseNull ERR_INVALID_ARG_TYPE",
    "parseObject ERR_INVALID_ARG_TYPE",
    "address ERR_INVALID_ADDRESS",
    "addressNull ERR_INVALID_ARG_TYPE",
    "addressNumber ERR_INVALID_ARG_TYPE",
    "portNull ERR_SOCKET_BAD_PORT",
    "portBoolean ERR_SOCKET_BAD_PORT",
    "portEmpty ERR_SOCKET_BAD_PORT",
    "portBlank ERR_SOCKET_BAD_PORT",
    "portArray ERR_SOCKET_BAD_PORT",
    "portArrayValue ERR_SOCKET_BAD_PORT",
    "portBigInt ERR_SOCKET_BAD_PORT",
    "portSymbol ERR_SOCKET_BAD_PORT",
    "familyString ERR_INVALID_ARG_VALUE",
    "familyNumber ERR_INVALID_ARG_VALUE",
    "familyNull ERR_INVALID_ARG_VALUE",
    "flowlabel ERR_OUT_OF_RANGE",
    "flowlabelNull ERR_INVALID_ARG_TYPE",
    "flowlabelString ERR_INVALID_ARG_TYPE",
    "block ERR_INVALID_ADDRESS",
    "blockFamilyString ERR_INVALID_ARG_VALUE",
    "blockFamilyNumber ERR_INVALID_ARG_TYPE",
    "blockAddressType ERR_INVALID_ARG_TYPE"
  ]);
});

test("node:dgram supports virtual UDP loopback messages", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dgram from "node:dgram";

    const server = dgram.createSocket("udp4");
    const client = dgram.createSocket({ type: "udp4" });

    server.on("message", (message, rinfo) => {
      console.log("server:", message.toString(), rinfo.address, rinfo.port > 0);
      server.send("pong", rinfo.port, rinfo.address);
    });

    client.on("message", (message, rinfo) => {
      console.log("client:", message.toString(), rinfo.address, rinfo.port > 0);
      client.close();
      server.close();
    });

    await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));
    console.log("address:", server.address().address, server.address().port > 0);
    client.send(Buffer.from("ping"), server.address().port, "localhost");
    await new Promise((resolve) => server.on("close", resolve));
    console.log("udp test complete");
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "address: 127.0.0.1 true",
    "server: ping 127.0.0.1 true",
    "client: pong 127.0.0.1 true",
    "udp test complete"
  ]);
});

test("node:dgram supports virtual UDP6 loopback messages", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dgram from "node:dgram";

    const server = dgram.createSocket("udp6");
    const client = dgram.createSocket({ type: "udp6" });

    server.on("message", (message, rinfo) => {
      console.log("server:", message.toString(), rinfo.address, rinfo.family, rinfo.port > 0);
      server.send("pong", rinfo.port, rinfo.address);
    });

    client.on("message", (message, rinfo) => {
      console.log("client:", message.toString(), rinfo.address, rinfo.family, rinfo.port > 0);
      client.close();
      server.close();
    });

    await new Promise((resolve) => server.bind(0, "::1", resolve));
    console.log("address:", server.address().address, server.address().family, server.address().port > 0);
    client.send(Buffer.from("ping"), server.address().port, "::1");
    await new Promise((resolve) => server.on("close", resolve));
    console.log("udp6 test complete");
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "address: ::1 IPv6 true",
    "server: ping ::1 IPv6 true",
    "client: pong ::1 IPv6 true",
    "udp6 test complete"
  ]);
});

test("node:dgram supports connected sockets, array payloads, and queue probes", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dgram from "node:dgram";

    const server = dgram.createSocket("udp4");
    const client = dgram.createSocket("udp4");
    const events = [];

    server.on("message", (message, rinfo) => {
      events.push("server:" + message.toString() + ":" + rinfo.size);
      server.send([Buffer.from("po"), "ng"], rinfo.port, rinfo.address, (error, bytes) => {
        if (error) throw error;
        events.push("reply-bytes:" + bytes);
      });
    });

    client.on("connect", () => {
      const remote = client.remoteAddress();
      events.push("connect:" + remote.address + ":" + (remote.port > 0));
      events.push("queue:" + client.getSendQueueSize() + ":" + client.getSendQueueCount());
      client.sendto([Buffer.from("pi"), new Uint8Array([110, 103])], (error, bytes) => {
        if (error) throw error;
        events.push("send-bytes:" + bytes);
      });
    });

    client.on("message", (message) => {
      events.push("client:" + message.toString());
      try {
        client.setMulticastInterface("127.0.0.1");
      } catch (error) {
        events.push("multicast:" + error.code);
      }
      const disconnected = client.disconnect();
      events.push("disconnect:" + (disconnected === undefined));
      try {
        client.remoteAddress();
      } catch (error) {
        events.push("remote-after-disconnect:" + error.code + ":" + error.message);
      }
      client.close();
      server.close();
    });

    await new Promise((resolve) => server.bind({ port: 0, address: "127.0.0.1" }, resolve));
    client.connect(server.address().port, "localhost");
    await new Promise((resolve) => server.on("close", resolve));
    console.log(events.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(
    result.stdout.toString(),
    "connect:localhost:true|queue:0:0|server:ping:4|send-bytes:4|client:pong|multicast:ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED|disconnect:true|remote-after-disconnect:ERR_SOCKET_DGRAM_NOT_CONNECTED:Not connected|reply-bytes:4\n"
  );
});

test("node:dgram connected send honors offset and length overload", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dgram from "node:dgram";

    const server = dgram.createSocket("udp4");
    const client = dgram.createSocket("udp4");
    const events = [];

    server.on("message", (message, rinfo) => {
      events.push("server:" + message.toString() + ":" + rinfo.size);
      client.close();
      server.close();
    });

    client.on("connect", () => {
      client.send(Buffer.from("abcdef"), 1, 3, (error, bytes) => {
        events.push("callback:" + (error?.code ?? "null") + ":" + bytes);
      });
    });

    await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));
    client.connect(server.address().port, "127.0.0.1");
    await new Promise((resolve) => server.on("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log(events.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "server:bcd:3|callback:null:3\n");
});

test("node:dgram send handles unconnected overload validation like Node", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dgram from "node:dgram";

    const capture = (label, action) => {
      try {
        action();
        return label + ":ok";
      } catch (error) {
        return [label, error.constructor.name, error.code, error.message].join(":");
      }
    };

    const validationSocket = dgram.createSocket("udp4");
    console.log(capture("callback-only", () => validationSocket.send("x", () => {})));
    console.log(capture("offset-length-no-port", () => validationSocket.send(Buffer.from("abcd"), 1, 2, () => {})));
    console.log(capture("bad-port-zero", () => validationSocket.send("x", 0, "127.0.0.1", () => {})));
    validationSocket.close();

    const server = dgram.createSocket("udp4");
    const client = dgram.createSocket("udp4");
    const events = [];
    const received = new Promise((resolve) => {
      server.on("message", (message, rinfo) => {
        events.push("server:" + message.toString() + ":" + rinfo.size);
        resolve();
      });
    });
    await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));
    const sent = new Promise((resolve) => {
      client.send("x", String(server.address().port), "127.0.0.1", (error, bytes) => {
        events.push("callback:" + (error?.code ?? "null") + ":" + bytes);
        resolve();
      });
    });
    await Promise.all([received, sent]);
    client.close();
    server.close();
    console.log(events.join("|"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "callback-only:RangeError:ERR_SOCKET_BAD_PORT:Port should be > 0 and < 65536. Received function .",
    'offset-length-no-port:TypeError:ERR_INVALID_ARG_TYPE:The "address" argument must be of type string. Received type number (2)',
    "bad-port-zero:RangeError:ERR_SOCKET_BAD_PORT:Port should be > 0 and < 65536. Received type number (0).",
    "server:x:1|callback:null:1"
  ]);
});

test("node:dgram exposes Node-shaped socket option and lifecycle probe helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dgram from "node:dgram";

    const methods = [
      "bind",
      "connect",
      "disconnect",
      "sendto",
      "send",
      "close",
      "address",
      "remoteAddress",
      "setBroadcast",
      "setTTL",
      "setMulticastTTL",
      "setMulticastLoopback",
      "setMulticastInterface",
      "addMembership",
      "dropMembership",
      "addSourceSpecificMembership",
      "dropSourceSpecificMembership",
      "ref",
      "unref",
      "setRecvBufferSize",
      "setSendBufferSize",
      "getRecvBufferSize",
      "getSendBufferSize",
      "getSendQueueSize",
      "getSendQueueCount"
    ];
    console.log("ctors", dgram.createSocket.length, dgram.Socket.length);
    console.log("exports", Object.keys(dgram).join(","));
    const socketPrototypeDescriptor = Object.getOwnPropertyDescriptor(dgram.Socket, "prototype");
    const socketConstructorDescriptor = Object.getOwnPropertyDescriptor(dgram.Socket.prototype, "constructor");
    console.log("socket prototype descriptor", socketPrototypeDescriptor.enumerable, socketPrototypeDescriptor.configurable, socketPrototypeDescriptor.writable, socketPrototypeDescriptor.value === dgram.Socket.prototype);
    console.log(
      "socket constructor descriptor",
      socketConstructorDescriptor.enumerable,
      socketConstructorDescriptor.configurable,
      socketConstructorDescriptor.writable,
      socketConstructorDescriptor.value === dgram.Socket,
      socketConstructorDescriptor.value.name,
      socketConstructorDescriptor.value.length,
      Object.hasOwn(socketConstructorDescriptor.value, "prototype")
    );
    console.log("socket callable", dgram.Socket("udp4") === undefined);
    console.log("own", Object.getOwnPropertyNames(dgram.Socket.prototype).join(","));
    console.log("keys", Object.keys(dgram.Socket.prototype).join(","));
    console.log("lengths", methods.map((name) => name + ":" + dgram.Socket.prototype[name].length).join("|"));
    console.log("names", methods.map((name) => name + ":" + JSON.stringify(dgram.Socket.prototype[name].name)).join("|"));
    const prototypeRows = ["createSocket", ...methods].map((name) => {
      const fn = name === "createSocket" ? dgram.createSocket : dgram.Socket.prototype[name];
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [
        name,
        Boolean(descriptor),
        descriptor?.enumerable,
        descriptor?.configurable,
        descriptor?.writable,
        Object.getOwnPropertyNames(descriptor?.value ?? {}).join(","),
        descriptor?.value?.constructor === fn
      ].join(":");
    }).join("|");
    console.log("prototypes", prototypeRows);

    function capture(label, fn) {
      try {
        fn();
      } catch (error) {
        console.log(label, error.constructor.name, error.code, error.message);
      }
    }

    const socket = dgram.createSocket("udp4");
    capture("unbound-disconnect", () => socket.disconnect());
    capture("unbound-remote", () => socket.remoteAddress());
    capture("unbound-broadcast", () => socket.setBroadcast(true));
    capture("unbound-ttl", () => socket.setTTL(64));
    console.log("buffer controls", socket.setRecvBufferSize(32) === socket, socket.setSendBufferSize(64) === socket, socket.getRecvBufferSize(), socket.getSendBufferSize());
    console.log("unbound ref", socket.ref() === socket, socket.unref() === socket);
    console.log("internal hook", Object.getOwnPropertyNames(dgram.Socket.prototype).includes("__opencontainersReceive"), Object.prototype.hasOwnProperty.call(socket, "__opencontainersReceive"));
    const asyncDispose = Object.getOwnPropertyDescriptor(dgram.Socket.prototype, Symbol.asyncDispose);
    console.log("asyncDispose", typeof socket[Symbol.asyncDispose], socket[Symbol.asyncDispose].name, socket[Symbol.asyncDispose].length, asyncDispose.enumerable);
    console.log("asyncDispose prototype", Object.hasOwn(socket[Symbol.asyncDispose], "prototype"));
    const disposed = socket[Symbol.asyncDispose]();
    console.log("dispose promise", typeof disposed.then);
    await disposed;
    console.log("disposed");
    capture("disposed-remote", () => socket.remoteAddress());

    const bound = dgram.createSocket("udp4");
    await new Promise((resolve) => bound.bind(0, "127.0.0.1", resolve));
    console.log("bound controls", bound.setBroadcast(true), bound.setTTL(64), bound.setRecvBufferSize(48) === bound, bound.setSendBufferSize(96) === bound, bound.getRecvBufferSize(), bound.getSendBufferSize());
    console.log("close nonfunction", bound.close(123) === bound);
    await new Promise((resolve) => bound.on("close", resolve));
    capture("duplicate-close", () => bound.close());

    const preAbortedController = new AbortController();
    preAbortedController.abort("done");
    const preAborted = dgram.createSocket({ type: "udp4", signal: preAbortedController.signal });
    const preAbortedClosed = new Promise((resolve) => preAborted.on("close", resolve));
    preAborted.on("close", () => console.log("signal pre-aborted close"));
    await preAbortedClosed;
    capture("signal-pre-aborted-bind", () => preAborted.bind(0));

    const abortController = new AbortController();
    const abortSocket = dgram.createSocket({ type: "udp4", signal: abortController.signal });
    await new Promise((resolve) => abortSocket.bind(0, "127.0.0.1", resolve));
    const abortClosed = new Promise((resolve) => abortSocket.on("close", resolve));
    abortSocket.on("close", () => console.log("signal abort close"));
    abortController.abort();
    await abortClosed;
    capture("signal-aborted-send", () => abortSocket.send("x", 1, "127.0.0.1"));

    capture("bad-type", () => dgram.createSocket());
    capture("bad-signal", () => dgram.createSocket({ type: "udp4", signal: {} }));
    capture("bad-ttl", () => dgram.createSocket("udp4").setTTL(0));
    capture("bad-recv-buffer", () => dgram.createSocket("udp4").setRecvBufferSize(-1));
    capture("bad-multicast-ttl-type", () => dgram.createSocket("udp4").setMulticastTTL("1"));
    capture("bad-multicast-ttl-range", () => dgram.createSocket("udp4").setMulticastTTL(256));
    capture("bad-multicast-interface-type", () => dgram.createSocket("udp4").setMulticastInterface(1));
    capture("bad-multicast-interface-empty", () => dgram.createSocket("udp4").setMulticastInterface(""));
    capture("missing-membership", () => dgram.createSocket("udp4").addMembership());
    capture("bad-membership", () => dgram.createSocket("udp4").addMembership(""));
    capture("bad-membership-name", () => dgram.createSocket("udp4").addMembership("not-an-ip"));
    capture("bad-ssm-source", () => dgram.createSocket("udp4").addSourceSpecificMembership());
    capture("bad-ssm-group", () => dgram.createSocket("udp4").dropSourceSpecificMembership("127.0.0.1"));
    capture("unsupported-multicast-ttl", () => dgram.createSocket("udp4").setMulticastTTL(1));
    capture("unsupported-multicast-loopback", () => dgram.createSocket("udp4").setMulticastLoopback(true));
    capture("unsupported-multicast-interface", () => dgram.createSocket("udp4").setMulticastInterface("127.0.0.1"));
    capture("unsupported-membership", () => dgram.createSocket("udp4").addMembership("224.0.0.114"));
    capture("unsupported-ssm", () => dgram.createSocket("udp4").addSourceSpecificMembership("127.0.0.1", "224.0.0.114"));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "ctors 2 2",
    "exports createSocket,Socket",
    "socket prototype descriptor false false true true",
    "socket constructor descriptor false true true true Socket 2 true",
    "socket callable true",
    "own constructor,bind,connect,disconnect,sendto,send,close,address,remoteAddress,setBroadcast,setTTL,setMulticastTTL,setMulticastLoopback,setMulticastInterface,addMembership,dropMembership,addSourceSpecificMembership,dropSourceSpecificMembership,ref,unref,setRecvBufferSize,setSendBufferSize,getRecvBufferSize,getSendBufferSize,getSendQueueSize,getSendQueueCount",
    "keys bind,connect,disconnect,sendto,send,close,address,remoteAddress,setBroadcast,setTTL,setMulticastTTL,setMulticastLoopback,setMulticastInterface,addMembership,dropMembership,addSourceSpecificMembership,dropSourceSpecificMembership,ref,unref,setRecvBufferSize,setSendBufferSize,getRecvBufferSize,getSendBufferSize,getSendQueueSize,getSendQueueCount",
    "lengths bind:2|connect:3|disconnect:0|sendto:6|send:6|close:1|address:0|remoteAddress:0|setBroadcast:1|setTTL:1|setMulticastTTL:1|setMulticastLoopback:1|setMulticastInterface:1|addMembership:2|dropMembership:2|addSourceSpecificMembership:3|dropSourceSpecificMembership:3|ref:0|unref:0|setRecvBufferSize:1|setSendBufferSize:1|getRecvBufferSize:0|getSendBufferSize:0|getSendQueueSize:0|getSendQueueCount:0",
    'names bind:""|connect:""|disconnect:""|sendto:""|send:""|close:""|address:""|remoteAddress:""|setBroadcast:""|setTTL:""|setMulticastTTL:""|setMulticastLoopback:""|setMulticastInterface:""|addMembership:""|dropMembership:""|addSourceSpecificMembership:""|dropSourceSpecificMembership:""|ref:""|unref:""|setRecvBufferSize:""|setSendBufferSize:""|getRecvBufferSize:""|getSendBufferSize:""|getSendQueueSize:""|getSendQueueCount:""',
    "prototypes createSocket:true:false:false:true:constructor:true|bind:true:false:false:true:constructor:true|connect:true:false:false:true:constructor:true|disconnect:true:false:false:true:constructor:true|sendto:true:false:false:true:constructor:true|send:true:false:false:true:constructor:true|close:true:false:false:true:constructor:true|address:true:false:false:true:constructor:true|remoteAddress:true:false:false:true:constructor:true|setBroadcast:true:false:false:true:constructor:true|setTTL:true:false:false:true:constructor:true|setMulticastTTL:true:false:false:true:constructor:true|setMulticastLoopback:true:false:false:true:constructor:true|setMulticastInterface:true:false:false:true:constructor:true|addMembership:true:false:false:true:constructor:true|dropMembership:true:false:false:true:constructor:true|addSourceSpecificMembership:true:false:false:true:constructor:true|dropSourceSpecificMembership:true:false:false:true:constructor:true|ref:true:false:false:true:constructor:true|unref:true:false:false:true:constructor:true|setRecvBufferSize:true:false:false:true:constructor:true|setSendBufferSize:true:false:false:true:constructor:true|getRecvBufferSize:true:false:false:true:constructor:true|getSendBufferSize:true:false:false:true:constructor:true|getSendQueueSize:true:false:false:true:constructor:true|getSendQueueCount:true:false:false:true:constructor:true",
    "unbound-disconnect Error ERR_SOCKET_DGRAM_NOT_CONNECTED Not connected",
    "unbound-remote Error ERR_SOCKET_DGRAM_NOT_CONNECTED Not connected",
    "unbound-broadcast Error EBADF setBroadcast EBADF",
    "unbound-ttl Error EBADF setTTL EBADF",
    "buffer controls true true 32 64",
    "unbound ref true true",
    "internal hook false true",
    "asyncDispose function  0 true",
    "asyncDispose prototype false",
    "dispose promise function",
    "disposed",
    "disposed-remote Error ERR_SOCKET_DGRAM_NOT_RUNNING Not running",
    "bound controls undefined 64 true true 48 96",
    "close nonfunction true",
    "duplicate-close Error ERR_SOCKET_DGRAM_NOT_RUNNING Not running",
    "signal pre-aborted close",
    "signal-pre-aborted-bind Error ERR_SOCKET_DGRAM_NOT_RUNNING Not running",
    "signal abort close",
    "signal-aborted-send Error ERR_SOCKET_DGRAM_NOT_RUNNING Not running",
    "bad-type TypeError ERR_SOCKET_BAD_TYPE Bad socket type specified. Valid types are: udp4, udp6",
    "bad-signal TypeError ERR_INVALID_ARG_TYPE The \"options.signal\" property must be an instance of AbortSignal. Received an instance of Object",
    "bad-ttl Error EINVAL setTTL EINVAL",
    "bad-recv-buffer TypeError ERR_SOCKET_BAD_BUFFER_SIZE Buffer size must be a positive integer",
    "bad-multicast-ttl-type TypeError ERR_INVALID_ARG_TYPE The \"ttl\" argument must be of type number. Received type string ('1')",
    "bad-multicast-ttl-range Error EINVAL setMulticastTTL EINVAL",
    "bad-multicast-interface-type TypeError ERR_INVALID_ARG_TYPE The \"interfaceAddress\" argument must be of type string. Received type number (1)",
    "bad-multicast-interface-empty Error EINVAL setMulticastInterface EINVAL",
    "missing-membership TypeError ERR_MISSING_ARGS The \"multicastAddress\" argument must be specified",
    "bad-membership Error EINVAL addMembership EINVAL",
    "bad-membership-name Error EINVAL addMembership EINVAL",
    "bad-ssm-source TypeError ERR_INVALID_ARG_TYPE The \"sourceAddress\" argument must be of type string. Received undefined",
    "bad-ssm-group TypeError ERR_INVALID_ARG_TYPE The \"groupAddress\" argument must be of type string. Received undefined",
    "unsupported-multicast-ttl Error ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED UDP multicast is not supported in OpenContainers V1",
    "unsupported-multicast-loopback Error ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED UDP multicast is not supported in OpenContainers V1",
    "unsupported-multicast-interface Error ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED UDP multicast is not supported in OpenContainers V1",
    "unsupported-membership Error ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED UDP multicast is not supported in OpenContainers V1",
    "unsupported-ssm Error ERR_OPENCONTAINERS_DGRAM_UNSUPPORTED UDP multicast is not supported in OpenContainers V1"
  ]);
});

test("node:dgram reports clear V1 error for external raw UDP", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const dgram = require("node:dgram");
      const socket = dgram.createSocket("udp4");
      socket.send("ping", 53, "dns.example.com", (error) => {
        console.log(error.code);
        socket.close();
      });
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "ERR_OPENCONTAINERS_RAW_UDP_UNSUPPORTED\n");
});

test("net server close lets a listener-only process exit", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const net = require('net');
      const server = net.createServer();
      server.listen(0, () => {
        console.log(server.address().port > 0);
        server.close();
      });
    `
  ], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), "true\n");
});

test("node:dns supports loopback lookup helpers and result order controls", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns";
    import promises from "node:dns/promises";

    console.log(dns.getDefaultResultOrder());
    console.log(Object.keys(dns).join(","));
    console.log(Object.keys(promises).join(","));
    const promisesDescriptor = Object.getOwnPropertyDescriptor(dns, "promises");
    console.log("promises descriptor", typeof promisesDescriptor.get, typeof promisesDescriptor.set, promisesDescriptor.enumerable, promisesDescriptor.configurable, dns.promises === promises);
    function helperPrototypeRow(namespace, name) {
      const fn = namespace[name];
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [
        name,
        Object.hasOwn(fn, "prototype"),
        descriptor?.enumerable,
        descriptor?.configurable,
        descriptor?.writable,
        Object.getOwnPropertyNames(descriptor?.value ?? {}).join(",")
      ].join(":");
    }
    const helperNames = [
      "lookup",
      "lookupService",
      "getDefaultResultOrder",
      "setDefaultResultOrder",
      "setServers",
      "getServers",
      "resolve",
      "resolve4",
      "resolve6",
      "resolveAny",
      "resolveCaa",
      "resolveCname",
      "resolveMx",
      "resolveNaptr",
      "resolveNs",
      "resolvePtr",
      "resolveSoa",
      "resolveSrv",
      "resolveTlsa",
      "resolveTxt",
      "reverse"
    ];
    console.log("dns helper prototypes", helperNames.map((name) => helperPrototypeRow(dns, name)).join("|"));
    console.log("promises helper prototypes", helperNames.map((name) => helperPrototypeRow(promises, name)).join("|"));
    dns.setDefaultResultOrder("ipv6first");
    console.log((await promises.lookup("localhost")).address);
    console.log((await promises.lookup("localhost", { family: 4 })).address);
    console.log((await promises.lookup("localhost", { all: true })).map((record) => record.family).join(","));
    console.log((await promises.lookup("localhost", { all: true, verbatim: false })).map((record) => record.family).join(","));
    console.log("literal", JSON.stringify(await promises.lookup("8.8.8.8", { family: 6 })));
    console.log("literal-all", JSON.stringify(await promises.lookup("2001:db8::1", { all: true, family: 4 })));
    console.log("literal-zero", JSON.stringify(await promises.lookup("0.0.0.0")));
    console.log("literal-any", JSON.stringify(await promises.lookup("::", { all: true, family: 4 })));
    console.log("literal-mapped", JSON.stringify(await promises.lookup("::ffff:127.0.0.1", { all: true, order: "ipv4first" })));
    console.log((await promises.lookupService("127.0.0.1", 8080)).hostname);
    console.log("service names", (await Promise.all([80, 443, 22, 53, 8080, 65000].map((port) => promises.lookupService("127.0.0.1", port)))).map((result) => result.service).join(","));
    console.log((await promises.resolve("localhost", "ANY")).map((record) => \`\${record.type}:\${record.family}:\${record.ttl}\`).join(","));
    console.log((await promises.resolve4("localhost", { ttl: true })).map((record) => \`\${record.address}:\${record.ttl}\`).join(","));
    await new Promise((resolve, reject) => {
      dns.lookup("localhost", { all: true, verbatim: false }, (error, records) => {
        if (error) reject(error);
        else {
          console.log(records.map((record) => record.family).join(","));
          resolve();
        }
      });
    });
    await new Promise((resolve, reject) => {
      dns.lookupService("::1", 3000, (error, hostname, service) => {
        if (error) reject(error);
        else {
          console.log(hostname, service);
          resolve();
        }
      });
    });
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "verbatim",
    "lookup,lookupService,Resolver,getDefaultResultOrder,setDefaultResultOrder,setServers,ADDRCONFIG,ALL,V4MAPPED,NODATA,FORMERR,SERVFAIL,NOTFOUND,NOTIMP,REFUSED,BADQUERY,BADNAME,BADFAMILY,BADRESP,CONNREFUSED,TIMEOUT,EOF,FILE,NOMEM,DESTRUCTION,BADSTR,BADFLAGS,NONAME,BADHINTS,NOTINITIALIZED,LOADIPHLPAPI,ADDRGETNETWORKPARAMS,CANCELLED,getServers,resolve,resolve4,resolve6,resolveAny,resolveCaa,resolveCname,resolveMx,resolveNaptr,resolveNs,resolvePtr,resolveSoa,resolveSrv,resolveTlsa,resolveTxt,reverse,promises",
    "lookup,lookupService,Resolver,getDefaultResultOrder,setDefaultResultOrder,setServers,NODATA,FORMERR,SERVFAIL,NOTFOUND,NOTIMP,REFUSED,BADQUERY,BADNAME,BADFAMILY,BADRESP,CONNREFUSED,TIMEOUT,EOF,FILE,NOMEM,DESTRUCTION,BADSTR,BADFLAGS,NONAME,BADHINTS,NOTINITIALIZED,LOADIPHLPAPI,ADDRGETNETWORKPARAMS,CANCELLED,getServers,resolve,resolve4,resolve6,resolveAny,resolveCaa,resolveCname,resolveMx,resolveNaptr,resolveNs,resolvePtr,resolveSoa,resolveSrv,resolveTlsa,resolveTxt,reverse",
    "promises descriptor function undefined true true true",
    "dns helper prototypes lookup:true:false:false:true:constructor|lookupService:true:false:false:true:constructor|getDefaultResultOrder:true:false:false:true:constructor|setDefaultResultOrder:true:false:false:true:constructor|setServers:true:false:false:true:constructor|getServers:false::::|resolve:false::::|resolve4:false::::|resolve6:false::::|resolveAny:false::::|resolveCaa:false::::|resolveCname:false::::|resolveMx:false::::|resolveNaptr:false::::|resolveNs:false::::|resolvePtr:false::::|resolveSoa:false::::|resolveSrv:false::::|resolveTlsa:false::::|resolveTxt:false::::|reverse:false::::",
    "promises helper prototypes lookup:true:false:false:true:constructor|lookupService:true:false:false:true:constructor|getDefaultResultOrder:true:false:false:true:constructor|setDefaultResultOrder:true:false:false:true:constructor|setServers:true:false:false:true:constructor|getServers:false::::|resolve:false::::|resolve4:false::::|resolve6:false::::|resolveAny:false::::|resolveCaa:false::::|resolveCname:false::::|resolveMx:false::::|resolveNaptr:false::::|resolveNs:false::::|resolvePtr:false::::|resolveSoa:false::::|resolveSrv:false::::|resolveTlsa:false::::|resolveTxt:false::::|reverse:false::::",
    "::1",
    "127.0.0.1",
    "6,4",
    "4,6",
    'literal {"address":"8.8.8.8","family":4}',
    'literal-all [{"address":"2001:db8::1","family":6}]',
    'literal-zero {"address":"0.0.0.0","family":4}',
    'literal-any [{"address":"::","family":6}]',
    'literal-mapped [{"address":"::ffff:127.0.0.1","family":6}]',
    "localhost",
    "service names http,https,ssh,domain,http-alt,65000",
    "AAAA:6:0,A:4:0",
    "127.0.0.1:0",
    "4,6",
    "localhost 3000"
  ]);
});

test("node:dns Resolver prototypes expose native enumerable query methods", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns";
    import promises from "node:dns/promises";

    function descriptorRow(prototype, name) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return [
        descriptor.enumerable,
        descriptor.configurable,
        descriptor.writable,
        descriptor.value.name,
        descriptor.value.length
      ].join(":");
    }

    function functionPrototypeRow(prototype, name) {
      const fn = prototype[name];
      const descriptor = Object.getOwnPropertyDescriptor(fn, "prototype");
      return [
        name,
        Object.hasOwn(fn, "prototype"),
        descriptor?.enumerable,
        descriptor?.configurable,
        descriptor?.writable,
        Object.getOwnPropertyNames(descriptor?.value ?? {}).join(",")
      ].join(":");
    }

    function summarize(label, Resolver) {
      const prototype = Resolver.prototype;
      const basePrototype = Object.getPrototypeOf(prototype);
      const resolverKeys = [
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
      ];
      console.log(label, "keys", Object.keys(prototype).join(","));
      console.log(label, "own", Object.getOwnPropertyNames(prototype).join(","));
      console.log(label, "base", Object.getOwnPropertyNames(basePrototype).join(","));
      console.log(label, "query", [
        descriptorRow(prototype, "resolveAny"),
        descriptorRow(prototype, "resolve4"),
        descriptorRow(prototype, "reverse"),
        descriptorRow(prototype, "resolve")
      ].join("|"));
      console.log(label, "base-shape", [
        Object.hasOwn(prototype, "getServers"),
        descriptorRow(basePrototype, "cancel"),
        descriptorRow(basePrototype, "getServers"),
        descriptorRow(basePrototype, "setLocalAddress")
      ].join("|"));
      console.log(label, "function-prototype", resolverKeys.map((name) => functionPrototypeRow(prototype, name)).join("|"));
    }

    summarize("dns", dns.Resolver);
    summarize("promises", promises.Resolver);
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "dns keys resolveAny,resolve4,resolve6,resolveCaa,resolveCname,resolveMx,resolveNs,resolveTlsa,resolveTxt,resolveSrv,resolvePtr,resolveNaptr,resolveSoa,reverse,resolve",
    "dns own constructor,resolveAny,resolve4,resolve6,resolveCaa,resolveCname,resolveMx,resolveNs,resolveTlsa,resolveTxt,resolveSrv,resolvePtr,resolveNaptr,resolveSoa,reverse,resolve",
    "dns base constructor,cancel,getServers,setServers,setLocalAddress",
    "dns query true:true:true:queryAny:2|true:true:true:queryA:2|true:true:true:getHostByAddr:2|true:true:true:resolve:3",
    "dns base-shape false|false:true:true:cancel:0|false:true:true:getServers:0|false:true:true:setLocalAddress:2",
    "dns function-prototype resolveAny:true:false:false:true:constructor|resolve4:true:false:false:true:constructor|resolve6:true:false:false:true:constructor|resolveCaa:true:false:false:true:constructor|resolveCname:true:false:false:true:constructor|resolveMx:true:false:false:true:constructor|resolveNs:true:false:false:true:constructor|resolveTlsa:true:false:false:true:constructor|resolveTxt:true:false:false:true:constructor|resolveSrv:true:false:false:true:constructor|resolvePtr:true:false:false:true:constructor|resolveNaptr:true:false:false:true:constructor|resolveSoa:true:false:false:true:constructor|reverse:true:false:false:true:constructor|resolve:true:false:false:true:constructor",
    "promises keys resolveAny,resolve4,resolve6,resolveCaa,resolveCname,resolveMx,resolveNs,resolveTlsa,resolveTxt,resolveSrv,resolvePtr,resolveNaptr,resolveSoa,reverse,resolve",
    "promises own constructor,resolveAny,resolve4,resolve6,resolveCaa,resolveCname,resolveMx,resolveNs,resolveTlsa,resolveTxt,resolveSrv,resolvePtr,resolveNaptr,resolveSoa,reverse,resolve",
    "promises base constructor,cancel,getServers,setServers,setLocalAddress",
    "promises query true:true:true:queryAny:2|true:true:true:queryA:2|true:true:true:getHostByAddr:2|true:true:true:resolve:2",
    "promises base-shape false|false:true:true:cancel:0|false:true:true:getServers:0|false:true:true:setLocalAddress:2",
    "promises function-prototype resolveAny:true:false:false:true:constructor|resolve4:true:false:false:true:constructor|resolve6:true:false:false:true:constructor|resolveCaa:true:false:false:true:constructor|resolveCname:true:false:false:true:constructor|resolveMx:true:false:false:true:constructor|resolveNs:true:false:false:true:constructor|resolveTlsa:true:false:false:true:constructor|resolveTxt:true:false:false:true:constructor|resolveSrv:true:false:false:true:constructor|resolvePtr:true:false:false:true:constructor|resolveNaptr:true:false:false:true:constructor|resolveSoa:true:false:false:true:constructor|reverse:true:false:false:true:constructor|resolve:true:false:false:true:constructor"
  ]);
});

test("node:dns Resolver cancel rejects pending resolver queries", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns";
    import promises from "node:dns/promises";

    console.log("root cancel", Object.hasOwn(dns, "cancel"), Object.hasOwn(promises, "cancel"), dns.cancel === undefined, promises.cancel === undefined);
    console.log("empty cancel", new dns.Resolver().cancel(), new promises.Resolver().cancel());

    const callbackResolver = new dns.Resolver();
    let callbackSync = true;
    const callbackDone = new Promise((resolve) => {
      callbackResolver.resolve4("localhost", (error, records) => {
        console.log("callback cancel", callbackSync ? "sync" : "async", error.name, error.code, Object.hasOwn(error, "errno"), String(error.errno), error.syscall, error.hostname, records === undefined);
        resolve();
      });
      console.log("callback cancel return", callbackResolver.cancel());
      callbackSync = false;
    });
    await callbackDone;
    await new Promise((resolve, reject) => {
      callbackResolver.resolve4("localhost", (error, records) => {
        if (error) reject(error);
        else {
          console.log("callback after", records.join(","));
          resolve();
        }
      });
    });

    const promiseResolver = new promises.Resolver();
    let promiseSettled = false;
    const cancelled = promiseResolver.resolve6("localhost")
      .then(() => "resolved")
      .catch((error) => {
        promiseSettled = true;
        return ["rejected", error.name, error.code, Object.hasOwn(error, "errno"), String(error.errno), error.syscall, error.hostname].join(":");
      });
    console.log("promise cancel return", promiseResolver.cancel());
    console.log("promise settled after cancel", promiseSettled);
    console.log("promise cancel", await cancelled);
    console.log("promise after", (await promiseResolver.resolve4("localhost")).join(","));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "root cancel false false true true",
    "empty cancel undefined undefined",
    "callback cancel return undefined",
    "callback cancel async Error ECANCELLED true undefined queryA localhost true",
    "callback after 127.0.0.1",
    "promise cancel return undefined",
    "promise settled after cancel false",
    "promise cancel rejected:Error:ECANCELLED:true:undefined:queryAaaa:localhost",
    "promise after 127.0.0.1"
  ]);
});

test("node:dns supports virtual loopback PTR resolution", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns";
    import promises from "node:dns/promises";

    console.log((await promises.resolvePtr("127.0.0.1")).join(","));
    console.log((await promises.resolve("::1", "PTR")).join(","));

    const promiseResolver = new promises.Resolver();
    console.log((await promiseResolver.resolvePtr("127.0.0.1")).join(","));

    await new Promise((resolve, reject) => {
      const resolver = new dns.Resolver();
      resolver.resolvePtr("::1", (error, records) => {
        if (error) reject(error);
        else {
          console.log(records.join(","));
          resolve();
        }
      });
    });

    try {
      await promises.resolvePtr("localhost");
    } catch (error) {
      console.log(error.code, error.syscall, error.hostname);
    }
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "localhost",
    "localhost",
    "localhost",
    "localhost",
    "ENODATA queryPtr localhost"
  ]);
});

test("node:dns reports Node-shaped validation errors for lookup options and IP helpers", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns";
    import promises from "node:dns/promises";

    for (const [label, action] of [
      ["order", () => promises.lookup("localhost", { order: "bad" })],
      ["verbatim", () => promises.lookup("localhost", { verbatim: "yes" })],
      ["all", () => promises.lookup("localhost", { all: "yes" })],
      ["hints", () => promises.lookup("localhost", { hints: "bad" })],
      ["family", () => promises.lookup("localhost", { family: "4" })],
      ["options", () => promises.lookup("localhost", "bad")],
      ["reverse", () => promises.reverse("localhost")],
      ["lookupService", () => promises.lookupService("localhost", 80)],
      ["reverse-ipv6", () => promises.reverse(":::")],
      ["lookupService-ipv6", () => promises.lookupService(":::", 80)]
    ]) {
      try {
        await action();
      } catch (error) {
        console.log(label, error.code, error.errno, error.syscall);
      }
    }

    try {
      dns.lookup("localhost", { order: "bad" }, () => {});
    } catch (error) {
      console.log("callback-order", error.code);
    }

    for (const [label, action] of [
      ["resolve-badtype-callback", () => dns.resolve("localhost", "BADTYPE", () => {})],
      ["resolve-empty-callback", () => dns.resolve("localhost", "", () => {})],
      ["resolve-null-callback", () => dns.resolve("localhost", null, () => {})],
      ["resolve-undefined-callback", () => dns.resolve("localhost", undefined, () => {})],
      ["resolve-number-callback", () => dns.resolve("localhost", 1, () => {})],
      ["resolve-lowercase-promise", () => promises.resolve("localhost", "a")],
      ["resolve-null-promise", () => promises.resolve("localhost", null)],
      ["resolver-resolve-undefined-callback", () => new dns.Resolver().resolve("localhost", undefined, () => {})],
      ["promise-resolver-resolve-lowercase", () => new promises.Resolver().resolve("localhost", "a")]
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label, error.name, error.code, error.message);
      }
    }

    const callbackResolverLocal = new dns.Resolver();
    const promiseResolverLocal = new promises.Resolver();
    console.log("local-address-ok", callbackResolverLocal.setLocalAddress("127.0.0.1", "::1"), promiseResolverLocal.setLocalAddress("2001:db8::1"));
    console.log("local-address-family-order", callbackResolverLocal.setLocalAddress("::1", "127.0.0.1"), promiseResolverLocal.setLocalAddress("::1", "127.0.0.1"));
    for (const [label, action] of [
      ["local-missing", () => callbackResolverLocal.setLocalAddress()],
      ["local-null", () => callbackResolverLocal.setLocalAddress(null)],
      ["local-number", () => callbackResolverLocal.setLocalAddress(1)],
      ["local-empty", () => callbackResolverLocal.setLocalAddress("")],
      ["local-bad", () => callbackResolverLocal.setLocalAddress("bad")],
      ["local-ipv6-null", () => callbackResolverLocal.setLocalAddress("127.0.0.1", null)],
      ["local-promise-bad", () => promiseResolverLocal.setLocalAddress("127.0.0.999")]
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label, error.name, error.code, error.message);
      }
    }

    async function capturePromiseTiming(label, action) {
      try {
        const value = action();
        console.log(label, value && typeof value.then === "function" ? "promise" : typeof value);
        await value.then(
          () => console.log(label + "-resolved"),
          (error) => console.log(label + "-rejected", error.name, error.code)
        );
      } catch (error) {
        console.log(label, "throw", error.name, error.code);
      }
    }

    await capturePromiseTiming("lookup-empty", () => promises.lookup(""));
    await capturePromiseTiming("lookup-null", () => promises.lookup(null));
    await capturePromiseTiming("lookup-number", () => promises.lookup(42));
    await capturePromiseTiming("reverse-localhost", () => promises.reverse("localhost"));
    await capturePromiseTiming("lookupService-port", () => promises.lookupService("127.0.0.1", -1));
    await capturePromiseTiming("lookupService-port-null", () => promises.lookupService("127.0.0.1", null));
    await capturePromiseTiming("lookupService-port-bool", () => promises.lookupService("127.0.0.1", true));
    await capturePromiseTiming("lookupService-port-empty", () => promises.lookupService("127.0.0.1", ""));
    await capturePromiseTiming("lookupService-port-space", () => promises.lookupService("127.0.0.1", "  "));
    console.log("lookupService-port-string", (await promises.lookupService("127.0.0.1", "80")).service);

    dns.setServers(["127.0.0.1", "8.8.8.8:53", "8.8.8.8:5353", "[::1]:53", "[::1]:5353"]);
    console.log("servers", dns.getServers().join(","));
    const resolver = new dns.Resolver();
    resolver.setServers(["[2001:db8::1]", "[2001:db8::1]:5353"]);
    console.log("resolver-servers", resolver.getServers().join(","));

    function captureResolverConstructor(label, Ctor) {
      console.log(label + "-length", Ctor.length);
      const inheritedOptions = Object.create({ timeout: "bad", tries: 0 });
      const accessorOptions = {};
      Object.defineProperty(accessorOptions, "timeout", {
        get() {
          throw new Error(label + " getter called");
        }
      });
      const acceptedOptions = [
        undefined,
        null,
        42,
        "ignored",
        [],
        { timeout: -1 },
        { timeout: 0 },
        { timeout: 2147483647, tries: 1 },
        { tries: 2147483647 },
        inheritedOptions,
        accessorOptions
      ];
      console.log(label + "-accepted", acceptedOptions.every((options) => new Ctor(options) instanceof Ctor));
      const functionOptions = function resolverOptions() {};
      functionOptions.timeout = "100";
      for (const [caseLabel, options] of [
        ["timeout-type", { timeout: "100" }],
        ["timeout-nan", { timeout: NaN }],
        ["timeout-float", { timeout: 1.5 }],
        ["timeout-low", { timeout: -2 }],
        ["timeout-high", { timeout: 2147483648 }],
        ["tries-type", { tries: "2" }],
        ["tries-nan", { tries: NaN }],
        ["tries-float", { tries: 1.5 }],
        ["tries-low", { tries: 0 }],
        ["tries-high", { tries: 2147483648 }],
        ["function-timeout-type", functionOptions]
      ]) {
        try {
          new Ctor(options);
        } catch (error) {
          console.log(label + "-" + caseLabel, error.name, error.code);
        }
      }
    }

    captureResolverConstructor("resolver", dns.Resolver);
    captureResolverConstructor("promise-resolver", promises.Resolver);

    for (const [label, value] of [
      ["servers-type", "127.0.0.1"],
      ["server-undefined", [undefined]],
      ["server-null", [null]],
      ["server-object", [{}]],
      ["server-empty", [""]],
      ["server-hostname", ["dns.example.com"]],
      ["server-ipv4", ["1.2.3.999"]],
      ["server-ipv6", [":::::"]],
      ["server-bracket-ipv6", ["[:::]:53"]],
      ["server-port", ["1.2.3.4:bad"]]
    ]) {
      try {
        dns.setServers(value);
      } catch (error) {
        console.log(label, error.name, error.code);
      }
    }

    try {
      dns.lookup(null, () => {});
    } catch (error) {
      console.log("callback-null", error.name, error.code);
    }

    let reverseCallbackCalled = false;
    try {
      dns.reverse(":::", () => {
        reverseCallbackCalled = true;
      });
    } catch (error) {
      console.log("callback-reverse-ipv6", error.name, error.code, error.syscall);
    }

    let lookupServiceCallbackCalled = false;
    try {
      dns.lookupService("127.0.0.1", -1, () => {
        lookupServiceCallbackCalled = true;
      });
    } catch (error) {
      console.log("callback-lookupService-port", error.name, error.code);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("callback-reverse-ipv6-called", reverseCallbackCalled);
    console.log("callback-lookupService-called", lookupServiceCallbackCalled);
    for (const [label, port] of [
      ["callback-lookupService-null", null],
      ["callback-lookupService-bool", true],
      ["callback-lookupService-empty", ""]
    ]) {
      try {
        dns.lookupService("127.0.0.1", port, () => {});
      } catch (error) {
        console.log(label, error.name, error.code);
      }
    }

    try {
      dns.lookupService(":::", 80, () => {});
    } catch (error) {
      console.log("callback-lookupService-ipv6", error.name, error.code);
    }
  `);

  const result = await kernel.run("node", ["index.js"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "order ERR_INVALID_ARG_VALUE undefined undefined",
    "verbatim ERR_INVALID_ARG_TYPE undefined undefined",
    "all ERR_INVALID_ARG_TYPE undefined undefined",
    "hints ERR_INVALID_ARG_TYPE undefined undefined",
    "family ERR_INVALID_ARG_VALUE undefined undefined",
    "options ERR_INVALID_ARG_TYPE undefined undefined",
    "reverse EINVAL -22 getHostByAddr",
    "lookupService ERR_INVALID_ARG_VALUE undefined undefined",
    "reverse-ipv6 EINVAL -22 getHostByAddr",
    "lookupService-ipv6 ERR_INVALID_ARG_VALUE undefined undefined",
    "callback-order ERR_INVALID_ARG_VALUE",
    "resolve-badtype-callback TypeError ERR_INVALID_ARG_VALUE The argument 'rrtype' is invalid. Received 'BADTYPE'",
    "resolve-empty-callback TypeError ERR_INVALID_ARG_VALUE The argument 'rrtype' is invalid. Received ''",
    "resolve-null-callback TypeError ERR_INVALID_ARG_TYPE The \"rrtype\" argument must be of type string. Received null",
    "resolve-undefined-callback TypeError ERR_INVALID_ARG_TYPE The \"rrtype\" argument must be of type string. Received undefined",
    "resolve-number-callback TypeError ERR_INVALID_ARG_TYPE The \"rrtype\" argument must be of type string. Received type number (1)",
    "resolve-lowercase-promise TypeError ERR_INVALID_ARG_VALUE The argument 'rrtype' is invalid. Received 'a'",
    "resolve-null-promise TypeError ERR_INVALID_ARG_TYPE The \"rrtype\" argument must be of type string. Received null",
    "resolver-resolve-undefined-callback TypeError ERR_INVALID_ARG_TYPE The \"rrtype\" argument must be of type string. Received undefined",
    "promise-resolver-resolve-lowercase TypeError ERR_INVALID_ARG_VALUE The argument 'rrtype' is invalid. Received 'a'",
    "local-address-ok undefined undefined",
    "local-address-family-order undefined undefined",
    "local-missing TypeError ERR_INVALID_ARG_TYPE The \"ipv4\" argument must be of type string. Received undefined",
    "local-null TypeError ERR_INVALID_ARG_TYPE The \"ipv4\" argument must be of type string. Received null",
    "local-number TypeError ERR_INVALID_ARG_TYPE The \"ipv4\" argument must be of type string. Received type number (1)",
    "local-empty TypeError ERR_INVALID_ARG_VALUE Invalid IP address.",
    "local-bad TypeError ERR_INVALID_ARG_VALUE Invalid IP address.",
    "local-ipv6-null TypeError ERR_INVALID_ARG_TYPE The \"ipv6\" argument must be of type string. Received null",
    "local-promise-bad TypeError ERR_INVALID_ARG_VALUE Invalid IP address.",
    "lookup-empty promise",
    "lookup-empty-rejected TypeError ERR_INVALID_ARG_VALUE",
    "lookup-null promise",
    "lookup-null-rejected TypeError ERR_INVALID_ARG_VALUE",
    "lookup-number throw TypeError ERR_INVALID_ARG_TYPE",
    "reverse-localhost promise",
    "reverse-localhost-rejected Error EINVAL",
    "lookupService-port throw RangeError ERR_SOCKET_BAD_PORT",
    "lookupService-port-null throw RangeError ERR_SOCKET_BAD_PORT",
    "lookupService-port-bool throw RangeError ERR_SOCKET_BAD_PORT",
    "lookupService-port-empty throw RangeError ERR_SOCKET_BAD_PORT",
    "lookupService-port-space throw RangeError ERR_SOCKET_BAD_PORT",
    "lookupService-port-string http",
    "servers 127.0.0.1,8.8.8.8,8.8.8.8:5353,::1,[::1]:5353",
    "resolver-servers 2001:db8::1,[2001:db8::1]:5353",
    "resolver-length 0",
    "resolver-accepted true",
    "resolver-timeout-type TypeError ERR_INVALID_ARG_TYPE",
    "resolver-timeout-nan RangeError ERR_OUT_OF_RANGE",
    "resolver-timeout-float RangeError ERR_OUT_OF_RANGE",
    "resolver-timeout-low RangeError ERR_OUT_OF_RANGE",
    "resolver-timeout-high RangeError ERR_OUT_OF_RANGE",
    "resolver-tries-type TypeError ERR_INVALID_ARG_TYPE",
    "resolver-tries-nan RangeError ERR_OUT_OF_RANGE",
    "resolver-tries-float RangeError ERR_OUT_OF_RANGE",
    "resolver-tries-low RangeError ERR_OUT_OF_RANGE",
    "resolver-tries-high RangeError ERR_OUT_OF_RANGE",
    "resolver-function-timeout-type TypeError ERR_INVALID_ARG_TYPE",
    "promise-resolver-length 0",
    "promise-resolver-accepted true",
    "promise-resolver-timeout-type TypeError ERR_INVALID_ARG_TYPE",
    "promise-resolver-timeout-nan RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-timeout-float RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-timeout-low RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-timeout-high RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-tries-type TypeError ERR_INVALID_ARG_TYPE",
    "promise-resolver-tries-nan RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-tries-float RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-tries-low RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-tries-high RangeError ERR_OUT_OF_RANGE",
    "promise-resolver-function-timeout-type TypeError ERR_INVALID_ARG_TYPE",
    "servers-type TypeError ERR_INVALID_ARG_TYPE",
    "server-undefined TypeError ERR_INVALID_ARG_TYPE",
    "server-null TypeError ERR_INVALID_ARG_TYPE",
    "server-object TypeError ERR_INVALID_ARG_TYPE",
    "server-empty TypeError ERR_INVALID_IP_ADDRESS",
    "server-hostname TypeError ERR_INVALID_IP_ADDRESS",
    "server-ipv4 TypeError ERR_INVALID_IP_ADDRESS",
    "server-ipv6 TypeError ERR_INVALID_IP_ADDRESS",
    "server-bracket-ipv6 TypeError ERR_INVALID_IP_ADDRESS",
    "server-port TypeError ERR_INVALID_IP_ADDRESS",
    "callback-null TypeError ERR_INVALID_ARG_VALUE",
    "callback-reverse-ipv6 Error EINVAL getHostByAddr",
    "callback-lookupService-port RangeError ERR_SOCKET_BAD_PORT",
    "callback-reverse-ipv6-called false",
    "callback-lookupService-called false",
    "callback-lookupService-null RangeError ERR_SOCKET_BAD_PORT",
    "callback-lookupService-bool RangeError ERR_SOCKET_BAD_PORT",
    "callback-lookupService-empty RangeError ERR_SOCKET_BAD_PORT",
    "callback-lookupService-ipv6 TypeError ERR_INVALID_ARG_VALUE"
  ]);
});

test("node:dns/promises and node:net support loopback TCP round trips", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import dns from "node:dns/promises";
    import net from "node:net";

    const lookup = await dns.lookup("localhost");
    console.log("lookup localhost:", lookup.address, lookup.family);

    const server = net.createServer((socket) => {
      socket.write("hello client\\n");
      socket.on("data", (data) => {
        socket.write("echo:" + data);
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const { port } = server.address();
    console.log("tcp server:", port > 0);

    const client = net.createConnection({ port, host: "127.0.0.1" });
    client.setEncoding("utf8");

    client.on("data", (data) => {
      console.log("client received:", JSON.stringify(data));
      if (data.includes("hello client")) {
        client.write("ping\\n");
      }
      if (data.includes("echo:ping")) {
        client.end();
        server.close();
      }
    });

    await new Promise((resolve) => server.on("close", resolve));
    console.log("tcp test complete");
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "lookup localhost: ::1 6",
    "tcp server: true",
    "client received: \"hello client\\n\"",
    "client received: \"echo:ping\\n\"",
    "tcp test complete"
  ]);
});

test("node:net supports constructor sockets, lifecycle controls, and paused reads", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import net from "node:net";

	    const server = net.createServer({ allowHalfOpen: true }, (socket) => {
	      console.log("server socket:", socket instanceof net.Socket, socket.allowHalfOpen, socket.localPort === server.address().port, socket.remotePort > 0);
      console.log("server controls:", socket.setNoDelay().setKeepAlive(true, 10).ref().unref() === socket);
      socket.on("data", (data) => {
        socket.write("pong:" + data);
      });
      socket.on("end", () => {
        console.log("server end:", socket.readableEnded, socket.readyState, socket.destroyed);
        setTimeout(() => {
          console.log("server late:", socket.readyState, socket.destroyed);
          socket.end("late");
        }, 0);
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const client = new net.Socket({ allowHalfOpen: true });
	    console.log("constructor:", client instanceof net.Socket, client.connecting, client.pending);
    client.setEncoding("utf8");
    client.pause();

    await new Promise((resolve) => client.connect({ port: server.address().port, host: "localhost" }, resolve));
    console.log("client connected:", client.connecting, client.pending, client.remotePort === server.address().port, client.remoteFamily, client.address().port > 0);

    let received = "";
    client.on("data", (chunk) => {
      received += chunk;
      console.log("client data:", received, client.bytesRead, client.bytesWritten, client.readyState, client.destroyed);
      if (received === "pong:ping") {
        client.end();
        console.log("client after end:", client.readyState, client.destroyed);
      }
    });

    client.write("ping");
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("paused bytes:", client.bytesRead, received.length);
    client.resume();

    await new Promise((resolve) => client.on("close", resolve));
    console.log("client closed:", client.destroyed, client.closed, client.writableEnded);
    server.close();
    await new Promise((resolve) => server.on("close", resolve));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
	    "constructor: true false true",
	    "server socket: true true true true",
    "server controls: true",
    "client connected: false false true IPv4 true",
    "paused bytes: 9 0",
    "client data: pong:ping 9 4 open false",
    "client after end: readOnly false",
    "server end: true writeOnly false",
    "server late: writeOnly false",
    "client data: pong:pinglate 13 4 readOnly false",
    "client closed: true true true"
  ]);
});

test("node:net socket setTimeout emits timeout without destroying the socket", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/index.js", `
    import net from "node:net";

    const server = net.createServer((socket) => {
      socket.on("end", () => socket.end());
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const client = net.connect(server.address().port, "127.0.0.1");
    await new Promise((resolve) => client.on("connect", resolve));
    console.log("timeout chain:", client.setTimeout(1) === client);
    await new Promise((resolve) => client.once("timeout", resolve));
    console.log("timeout fired:", client.destroyed, client.readyState);
    client.end();
    await new Promise((resolve) => client.on("close", resolve));
    server.close();
    await new Promise((resolve) => server.on("close", resolve));
  `);

  const result = await kernel.run("node", ["/workspace/index.js"], { cwd: "/workspace", projectId: "demo" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "timeout chain: true",
    "timeout fired: false open"
  ]);
});

async function eventually(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
