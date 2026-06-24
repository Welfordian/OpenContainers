import assert from "node:assert/strict";
import test from "node:test";
import { Kernel } from "../packages/kernel/src/Kernel.js";

test("tty built-in exposes TTY detection and write stream capabilities", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const tty = require('tty');
      const stream = new tty.WriteStream(1);
      console.log(tty.ReadStream.length, tty.WriteStream.length);
      console.log(Object.keys(tty.ReadStream.prototype).join(','));
      console.log(Object.getOwnPropertyNames(tty.WriteStream.prototype).join(','));
      console.log(Object.keys(tty.WriteStream.prototype).join(','));
      console.log(tty.WriteStream.prototype.isTTY, Object.hasOwn(tty.WriteStream.prototype, 'isTTY'));
      console.log(
        Object.getOwnPropertyDescriptor(tty.WriteStream.prototype, 'clearLine').enumerable,
        tty.WriteStream.prototype.clearLine.length,
        tty.WriteStream.prototype.getColorDepth.length
      );
      console.log(Object.getOwnPropertyDescriptor(tty.WriteStream.prototype.getColorDepth, 'length').value);
      console.log(
        Object.getOwnPropertyDescriptor(tty.ReadStream.prototype, 'setRawMode').enumerable,
        tty.ReadStream.prototype.setRawMode.length
      );
      console.log(JSON.stringify([
        tty.ReadStream.prototype.setRawMode.name,
        tty.WriteStream.prototype.clearLine.name,
        tty.WriteStream.prototype.clearScreenDown.name,
        tty.WriteStream.prototype.cursorTo.name,
        tty.WriteStream.prototype.moveCursor.name,
        tty.WriteStream.prototype.getWindowSize.name,
        tty.WriteStream.prototype._refreshSize.name,
        tty.WriteStream.prototype.getColorDepth.name,
        tty.WriteStream.prototype.hasColors.name
      ]));
      const ttyPrototypeRows = [
        ["ReadStream", tty.ReadStream.prototype, ["setRawMode"]],
        ["WriteStream", tty.WriteStream.prototype, ["clearLine", "clearScreenDown", "cursorTo", "moveCursor", "getWindowSize", "_refreshSize", "getColorDepth", "hasColors"]]
      ].flatMap(([owner, prototype, names]) => names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, "prototype");
        return [
          owner + "." + name,
          descriptor.enumerable,
          descriptor.configurable,
          descriptor.writable,
          descriptor.value.name,
          descriptor.value.length,
          Object.hasOwn(descriptor.value, "prototype"),
          prototypeDescriptor?.enumerable,
          prototypeDescriptor?.configurable,
          prototypeDescriptor?.writable,
          Object.getOwnPropertyNames(prototypeDescriptor?.value ?? {}).join(","),
          prototypeDescriptor?.value?.constructor === descriptor.value
        ].join(":");
      }));
      console.log(ttyPrototypeRows.join("|"));
      console.log(tty.isatty(1));
      console.log(tty.isatty('1'));
      console.log(tty.isatty(null));
      console.log(stream.isTTY);
      console.log(stream.getColorDepth());
      console.log(stream.hasColors());
      console.log(stream.getColorDepth({ FORCE_COLOR: '0' }));
      console.log(stream.getColorDepth({ FORCE_COLOR: 'false' }));
      console.log(stream.getColorDepth({ FORCE_COLOR: '1' }));
      console.log(stream.getColorDepth({ FORCE_COLOR: '2' }));
      console.log(stream.getColorDepth({ FORCE_COLOR: '3' }));
      console.log(stream.getColorDepth({ NO_COLOR: '1' }));
      console.log(stream.getColorDepth({ TERM: 'dumb' }));
      console.log(stream.getColorDepth({ TERM: 'xterm-256color' }));
      console.log(stream.getColorDepth({ COLORTERM: 'truecolor' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'Apple_Terminal' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'iTerm.app' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'MacTerm' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'Hyper' }));
      console.log(stream.getColorDepth({ TMUX: '1' }));
      console.log(stream.getColorDepth({ TMUX: '1', TERM_PROGRAM: 'Apple_Terminal' }));
      console.log(stream.getColorDepth({ TMUX: '1', TERM: 'dumb' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'Apple_Terminal', COLORTERM: 'truecolor' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'Apple_Terminal', FORCE_COLOR: '3' }));
      console.log(stream.getColorDepth({ TERM_PROGRAM: 'Hyper', COLORTERM: 'truecolor' }));
      console.log(stream.hasColors(1 << 24, { TERM_PROGRAM: 'Apple_Terminal', COLORTERM: 'truecolor' }));
      console.log(stream.hasColors(16, { TERM_PROGRAM: 'Hyper' }));
      console.log(stream.hasColors(1 << 24, { TMUX: '1' }));
      console.log(stream.hasColors(16, { FORCE_COLOR: 'false' }));
      console.log(stream.hasColors({ FORCE_COLOR: '1' }));
      console.log(stream.hasColors(256, { FORCE_COLOR: '1' }));
      console.log(stream.hasColors(256, { FORCE_COLOR: '2' }));
      console.log(stream.hasColors(1 << 24, { COLORTERM: 'truecolor' }));
      console.log(stream.hasColors(16, { TERM: 'dumb' }));
      console.log(JSON.stringify(stream.getWindowSize()));
      let resizeEvents = 0;
      stream.on('resize', () => resizeEvents++);
      stream._refreshSize();
      console.log(resizeEvents);
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(String(chunk)));
      let callbacks = 0;
      stream.clearLine(0, () => callbacks++);
      stream.cursorTo(2);
      stream.cursorTo(2, 3);
      stream.moveCursor(-1, 2);
      stream.clearScreenDown(() => callbacks++);
      console.log(JSON.stringify(chunks.join('')));
      console.log(callbacks);
      const cursorProbe = new tty.WriteStream(1);
      const cursorProbeChunks = [];
      cursorProbe.on('data', (chunk) => cursorProbeChunks.push(String(chunk)));
      console.log("cursor-noop", cursorProbe.cursorTo(), cursorProbe.cursorTo("2"), JSON.stringify(cursorProbeChunks.join("")));
      cursorProbe.cursorTo(-1);
      cursorProbe.cursorTo(1, -1);
      console.log("cursor-negative", JSON.stringify(cursorProbeChunks.join("")));
      for (const args of [
        [NaN],
        [1, NaN]
      ]) {
        try {
          cursorProbe.cursorTo(...args);
        } catch (error) {
          console.log("cursor-error", error.name, error.code, error.message);
        }
      }
      for (const create of [
        () => new tty.ReadStream(),
        () => new tty.WriteStream(),
        () => new tty.ReadStream('1'),
        () => new tty.WriteStream(null)
      ]) {
        try {
          create();
        } catch (error) {
          console.log(error.code);
        }
      }
      for (const args of [
        ['16'],
        [undefined, {}],
        [undefined, { TERM: 'xterm-256color' }],
        [1],
        [1.2]
      ]) {
        try {
          stream.hasColors(...args);
        } catch (error) {
          console.log(error.code);
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "2 1",
    "setRawMode",
    "constructor,isTTY,getColorDepth,hasColors,_refreshSize,cursorTo,moveCursor,clearLine,clearScreenDown,getWindowSize",
    "isTTY,getColorDepth,hasColors,_refreshSize,cursorTo,moveCursor,clearLine,clearScreenDown,getWindowSize",
    "true true",
    "true 2 0",
    "0",
    "true 1",
    "[\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"getColorDepth\",\"hasColors\"]",
    "ReadStream.setRawMode:true:true:true::1:true:false:false:true:constructor:true|WriteStream.clearLine:true:true:true::2:true:false:false:true:constructor:true|WriteStream.clearScreenDown:true:true:true::1:true:false:false:true:constructor:true|WriteStream.cursorTo:true:true:true::3:true:false:false:true:constructor:true|WriteStream.moveCursor:true:true:true::3:true:false:false:true:constructor:true|WriteStream.getWindowSize:true:true:true::0:true:false:false:true:constructor:true|WriteStream._refreshSize:true:true:true::0:true:false:false:true:constructor:true|WriteStream.getColorDepth:true:true:true:getColorDepth:0:true:false:false:true:constructor:true|WriteStream.hasColors:true:true:true:hasColors:2:true:false:false:true:constructor:true",
    "true",
    "false",
    "false",
    "true",
    "24",
    "true",
    "1",
    "1",
    "4",
    "8",
    "24",
    "1",
    "1",
    "8",
    "24",
    "8",
    "8",
    "24",
    "1",
    "24",
    "24",
    "1",
    "8",
    "24",
    "24",
    "false",
    "false",
    "true",
    "false",
    "true",
    "false",
    "true",
    "true",
    "false",
    "[80,24]",
    "1",
    '"\\u001b[2K\\u001b[3G\\u001b[4;3H\\u001b[1D\\u001b[2B\\u001b[0J"',
    "2",
    'cursor-noop true true ""',
    'cursor-negative "\\u001b[0G\\u001b[0;2H"',
    "cursor-error TypeError ERR_INVALID_ARG_VALUE The argument 'x' is invalid. Received NaN",
    "cursor-error TypeError ERR_INVALID_ARG_VALUE The argument 'y' is invalid. Received NaN",
    "ERR_INVALID_FD",
    "ERR_INVALID_FD",
    "ERR_INVALID_FD",
    "ERR_INVALID_FD",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_INVALID_ARG_TYPE",
    "ERR_OUT_OF_RANGE",
    "ERR_OUT_OF_RANGE",
    ""
  ].join("\n"));
});

test("tty and readline ANSI helpers validate callback arguments", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const tty = require('node:tty');
      const readline = require('node:readline');
      const stream = new tty.WriteStream(1);
      const sink = { write() { return true; } };
      for (const [label, action] of [
        ["tty-clearLine", () => stream.clearLine(0, "x")],
        ["tty-clearScreenDown", () => stream.clearScreenDown("x")],
        ["tty-cursorTo-y", () => stream.cursorTo(1, 2, "x")],
        ["tty-moveCursor", () => stream.moveCursor(1, 1, "x")],
        ["tty-moveCursor-noop", () => stream.moveCursor(0, 0, "x")],
        ["readline-clearLine", () => readline.clearLine(sink, 0, "x")],
        ["readline-clearScreenDown", () => readline.clearScreenDown(sink, "x")],
        ["readline-cursorTo-y", () => readline.cursorTo(sink, 1, 2, "x")],
        ["readline-moveCursor", () => readline.moveCursor(sink, 1, 1, "x")],
        ["readline-moveCursor-noop", () => readline.moveCursor(sink, 0, 0, "x")]
      ]) {
        try {
          action();
        } catch (error) {
          console.log(label + ":" + error.name + ":" + error.code + ":" + error.message + ":" + String(error));
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "tty-clearLine:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError: The \"callback\" argument must be of type function. Received type string ('x')",
    "tty-clearScreenDown:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError: The \"callback\" argument must be of type function. Received type string ('x')",
    "tty-cursorTo-y:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError: The \"callback\" argument must be of type function. Received type string ('x')",
    "tty-moveCursor:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError: The \"callback\" argument must be of type function. Received type string ('x')",
    "tty-moveCursor-noop:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError: The \"callback\" argument must be of type function. Received type string ('x')",
    "readline-clearLine:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError [ERR_INVALID_ARG_TYPE]: The \"callback\" argument must be of type function. Received type string ('x')",
    "readline-clearScreenDown:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError [ERR_INVALID_ARG_TYPE]: The \"callback\" argument must be of type function. Received type string ('x')",
    "readline-cursorTo-y:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError [ERR_INVALID_ARG_TYPE]: The \"callback\" argument must be of type function. Received type string ('x')",
    "readline-moveCursor:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError [ERR_INVALID_ARG_TYPE]: The \"callback\" argument must be of type function. Received type string ('x')",
    "readline-moveCursor-noop:TypeError:ERR_INVALID_ARG_TYPE:The \"callback\" argument must be of type function. Received type string ('x'):TypeError [ERR_INVALID_ARG_TYPE]: The \"callback\" argument must be of type function. Received type string ('x')"
  ]);
});

test("readline defaults terminal mode from TTY output and mirrors fallback cursorTo validation", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const readline = require('node:readline');
      const promises = require('node:readline/promises');
      const { PassThrough, Writable } = require('node:stream');
      function makeOutput(isTTY) {
        const output = new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          }
        });
        output.isTTY = isTTY;
        return output;
      }
      for (const [moduleName, module] of [
        ["callback", readline],
        ["promises", promises]
      ]) {
        for (const [label, options] of [
          ["tty-default", { output: makeOutput(true) }],
          ["notty-default", { output: makeOutput(false) }],
          ["tty-false", { output: makeOutput(true), terminal: false }],
          ["tty-true", { output: makeOutput(false), terminal: true }],
          ["tty-null", { output: makeOutput(true), terminal: null }]
        ]) {
          const rl = module.createInterface({ input: new PassThrough(), ...options });
          console.log(moduleName + ":" + label + ":" + rl.terminal);
          rl.close();
        }
      }

      function sink() {
        const chunks = [];
        return {
          chunks,
          write(value, callback) {
            chunks.push(String(value));
            callback?.();
            return true;
          }
        };
      }
      for (const [label, action] of [
        ["missing", (output) => readline.cursorTo(output)],
        ["string", (output) => readline.cursorTo(output, "2")],
        ["nan", (output) => readline.cursorTo(output, NaN)],
        ["number", (output) => readline.cursorTo(output, 2)],
        ["number-y", (output) => readline.cursorTo(output, 2, 3)]
      ]) {
        const output = sink();
        try {
          const value = action(output);
          console.log("cursor:" + label + ":ok:" + value + ":" + JSON.stringify(output.chunks.join("")));
        } catch (error) {
          console.log("cursor:" + label + ":" + error.name + ":" + error.code + ":" + error.message + ":" + JSON.stringify(output.chunks.join("")));
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "callback:tty-default:true",
    "callback:notty-default:false",
    "callback:tty-false:false",
    "callback:tty-true:true",
    "callback:tty-null:false",
    "promises:tty-default:true",
    "promises:notty-default:false",
    "promises:tty-false:false",
    "promises:tty-true:true",
    "promises:tty-null:false",
    'cursor:missing:ok:true:""',
    'cursor:string:ok:true:""',
    "cursor:nan:TypeError:ERR_INVALID_ARG_VALUE:The argument 'x' is invalid. Received NaN:\"\"",
    'cursor:number:ok:true:"\\u001b[3G"',
    'cursor:number-y:ok:true:"\\u001b[4;3H"'
  ]);
});

test("readline exports Node-shaped callback and promise module metadata", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const readline = require('node:readline');
      const promises = require('node:readline/promises');
      console.log(Object.keys(readline).join(','));
      console.log(readline.Interface.name, readline.Interface.length, readline.createInterface.length);
      console.log(readline.createInterface.name);
      const publicSymbolRows = (target) => [Symbol.asyncIterator, Symbol.dispose].map((symbol) => {
        const descriptor = Object.getOwnPropertyDescriptor(target, symbol);
        if (!descriptor) return String(symbol) + ":missing";
        return [String(symbol), typeof descriptor.value, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, "prototype")].join(":");
      }).join("|");
      const legacyAccessorNames = ['_decoder','_line_buffer','_oldPrompt','_previousKey','_prompt','_questionCallback','_sawKeyPress','_sawReturnAt'];
      const legacyMethodNames = ['question','_setRawMode','_onLine','_writeToOutput','_addHistory','_refreshLine','_normalWrite','_insertString','_tabComplete','_wordLeft','_wordRight','_deleteLeft','_deleteRight','_deleteWordLeft','_deleteWordRight','_deleteLineLeft','_deleteLineRight','_line','_historyNext','_historyPrev','_getDisplayPos','_getCursorPos','_moveCursor','_ttyWrite'];
      console.log(Object.getOwnPropertyNames(readline.Interface.prototype).join(','));
      console.log(Object.keys(readline.Interface.prototype).join(','));
      const callbackParent = Object.getPrototypeOf(readline.Interface.prototype);
      console.log(Object.getOwnPropertyNames(callbackParent).join(','));
      console.log(Object.keys(callbackParent).join(','));
      console.log(publicSymbolRows(callbackParent));
      console.log("callback symbol owners", Object.hasOwn(readline.Interface.prototype, Symbol.asyncIterator), Object.hasOwn(callbackParent, Symbol.asyncIterator), Object.hasOwn(callbackParent, Symbol.dispose));
      const disposableCallback = readline.createInterface({ input: { on() {}, off() {}, removeListener() {} }, output: { write() { return true; } } });
      let callbackClosed = 0;
      disposableCallback.on('close', () => callbackClosed++);
      console.log('callback dispose', disposableCallback[Symbol.dispose](), disposableCallback.closed, callbackClosed);
      const callbackGrandparent = Object.getPrototypeOf(callbackParent);
      console.log(Object.getOwnPropertyNames(callbackGrandparent).join(','));
      console.log(callbackGrandparent.constructor.name, Object.getPrototypeOf(callbackGrandparent).constructor.name);
      console.log(["constructor", "columns", "setPrompt", "getPrompt", "setupHistoryManager", "prompt", "close", "pause", "resume", "write", "clearLine", "getCursorPos"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(callbackParent, name);
        if (!descriptor) return name + ":missing";
        const detail = "value" in descriptor
          ? descriptor.value.name + "/" + descriptor.value.length + "/" + descriptor.writable + "/" + Object.hasOwn(descriptor.value, "prototype")
          : descriptor.get.name + "/" + descriptor.get.length + "/" + typeof descriptor.set + "/" + Object.hasOwn(descriptor.get, "prototype");
        return [name, descriptor.enumerable, descriptor.configurable, detail].join(":");
      }).join("|"));
      console.log(legacyAccessorNames.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(readline.Interface.prototype, name);
        return [name, descriptor.get.name, descriptor.set.name, descriptor.enumerable, descriptor.configurable, Object.hasOwn(descriptor.get, 'prototype'), Object.hasOwn(descriptor.set, 'prototype')].join(':');
      }).join('|'));
      console.log(legacyMethodNames.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(readline.Interface.prototype, name);
        return [name, descriptor.value.name, descriptor.value.length, descriptor.enumerable, descriptor.configurable, descriptor.writable, Object.hasOwn(descriptor.value, 'prototype')].join(':');
      }).join('|'));
      const legacyRl = readline.createInterface({ input: { on() {}, off() {}, removeListener() {} }, output: { write() { return true; } } });
      legacyRl._line_buffer = 'alpha beta';
      legacyRl.cursor = legacyRl.line.length;
      legacyRl._wordLeft();
      const legacyLeft = legacyRl.cursor;
      legacyRl._deleteWordRight();
      console.log('legacy edit', legacyLeft, JSON.stringify(legacyRl.line), legacyRl.cursor, JSON.stringify(legacyRl._getDisplayPos('abcdef')));
      legacyRl.close();
      console.log(Object.keys(promises).join(','));
      console.log(promises.Interface.name, promises.Interface.length, promises.createInterface.length, promises.Readline.length);
      console.log(promises.createInterface.name);
      console.log(Object.getOwnPropertyNames(promises.Readline.prototype).join(','));
      console.log(Object.keys(promises.Readline.prototype).join(','));
      console.log(promises.Readline.prototype.clearLine.length, promises.Readline.prototype.cursorTo.length, promises.Readline.prototype.moveCursor.length);
      const parent = Object.getPrototypeOf(promises.Interface.prototype);
      console.log(Object.getOwnPropertyNames(parent).join(','));
      console.log(Object.keys(parent).join(','));
      console.log(publicSymbolRows(parent));
      console.log("promise symbol owners", Object.hasOwn(promises.Interface.prototype, Symbol.asyncIterator), Object.hasOwn(parent, Symbol.asyncIterator), Object.hasOwn(parent, Symbol.dispose));
      console.log(["constructor", "columns", "setPrompt", "getPrompt", "setupHistoryManager", "prompt", "close", "pause", "resume", "write", "clearLine", "getCursorPos"].map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(parent, name);
        if (!descriptor) return name + ":missing";
        const detail = "value" in descriptor
          ? descriptor.value.name + "/" + descriptor.value.length + "/" + descriptor.writable
          : descriptor.get.name + "/" + descriptor.get.length + "/" + typeof descriptor.set;
        return [name, descriptor.enumerable, descriptor.configurable, detail].join(":");
      }).join("|"));
      const disposable = promises.createInterface({ input: { on() {}, off() {}, removeListener() {} }, output: { write() { return true; } } });
      let promiseClosed = 0;
      disposable.on('close', () => promiseClosed++);
      console.log('dispose', disposable[Symbol.dispose](), disposable.closed, promiseClosed);
      console.log(Object.hasOwn(readline, 'default'), Object.hasOwn(promises, 'default'));
      console.log(typeof promises.clearLine, typeof promises.cursorTo);
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "Interface,clearLine,clearScreenDown,createInterface,cursorTo,emitKeypressEvents,moveCursor,promises",
    "Interface 4 4",
    "createInterface",
    "constructor,question,_decoder,_line_buffer,_oldPrompt,_previousKey,_prompt,_questionCallback,_sawKeyPress,_sawReturnAt,_setRawMode,_onLine,_writeToOutput,_addHistory,_refreshLine,_normalWrite,_insertString,_tabComplete,_wordLeft,_wordRight,_deleteLeft,_deleteRight,_deleteWordLeft,_deleteWordRight,_deleteLineLeft,_deleteLineRight,_line,_historyNext,_historyPrev,_getDisplayPos,_getCursorPos,_moveCursor,_ttyWrite",
    "question,_setRawMode,_onLine,_writeToOutput,_addHistory,_refreshLine,_normalWrite,_insertString,_tabComplete,_wordLeft,_wordRight,_deleteLeft,_deleteRight,_deleteWordLeft,_deleteWordRight,_deleteLineLeft,_deleteLineRight,_line,_historyNext,_historyPrev,_getDisplayPos,_getCursorPos,_moveCursor,_ttyWrite",
    "constructor,columns,setPrompt,getPrompt,setupHistoryManager,prompt,close,pause,resume,write,clearLine,getCursorPos",
    "",
    "Symbol(Symbol.asyncIterator):function:[Symbol.asyncIterator]:0:false:true:true:false|Symbol(Symbol.dispose):function:[Symbol.dispose]:0:true:true:true:true",
    "callback symbol owners false true true",
    "callback dispose undefined true 1",
    "constructor",
    "InterfaceConstructor EventEmitter",
    "constructor:false:true:Interface/0/true/true|columns:false:true:get columns/0/undefined/false|setPrompt:false:true:setPrompt/1/true/false|getPrompt:false:true:getPrompt/0/true/false|setupHistoryManager:false:true:setupHistoryManager/1/true/false|prompt:false:true:prompt/1/true/false|close:false:true:close/0/true/false|pause:false:true:pause/0/true/false|resume:false:true:resume/0/true/false|write:false:true:write/2/true/false|clearLine:false:true:clearLine/0/true/false|getCursorPos:false:true:getCursorPos/0/true/false",
    "_decoder:get:set:false:false:false:false|_line_buffer:get:set:false:false:false:false|_oldPrompt:get:set:false:false:false:false|_previousKey:get:set:false:false:false:false|_prompt:get:set:false:false:false:false|_questionCallback:get:set:false:false:false:false|_sawKeyPress:get:set:false:false:false:false|_sawReturnAt:get:set:false:false:false:false",
    "question:question:3:true:true:true:true|_setRawMode:[_setRawMode]:1:true:true:true:false|_onLine:[_onLine]:1:true:true:true:false|_writeToOutput:[_writeToOutput]:1:true:true:true:false|_addHistory:[_addHistory]:0:true:true:true:false|_refreshLine:[_refreshLine]:0:true:true:true:false|_normalWrite:[_normalWrite]:1:true:true:true:false|_insertString:[_insertString]:1:true:true:true:false|_tabComplete::1:true:true:true:true|_wordLeft:[_wordLeft]:0:true:true:true:false|_wordRight:[_wordRight]:0:true:true:true:false|_deleteLeft:[_deleteLeft]:0:true:true:true:false|_deleteRight:[_deleteRight]:0:true:true:true:false|_deleteWordLeft:[_deleteWordLeft]:0:true:true:true:false|_deleteWordRight:[_deleteWordRight]:0:true:true:true:false|_deleteLineLeft:[_deleteLineLeft]:0:true:true:true:false|_deleteLineRight:[_deleteLineRight]:0:true:true:true:false|_line:[_line]:0:true:true:true:false|_historyNext:[_historyNext]:0:true:true:true:false|_historyPrev:[_historyPrev]:0:true:true:true:false|_getDisplayPos:[_getDisplayPos]:1:true:true:true:false|_getCursorPos:getCursorPos:0:true:true:true:false|_moveCursor:[_moveCursor]:1:true:true:true:false|_ttyWrite:[_ttyWrite]:2:true:true:true:false",
    'legacy edit 6 "alpha " 6 {"cols":6,"rows":0}',
    "Interface,Readline,createInterface",
    "Interface 0 4 1",
    "createInterface",
    "constructor,cursorTo,moveCursor,clearLine,clearScreenDown,commit,rollback",
    "",
    "1 1 2",
    "constructor,columns,setPrompt,getPrompt,setupHistoryManager,prompt,close,pause,resume,write,clearLine,getCursorPos",
    "",
    "Symbol(Symbol.asyncIterator):function:[Symbol.asyncIterator]:0:false:true:true:false|Symbol(Symbol.dispose):function:[Symbol.dispose]:0:true:true:true:true",
    "promise symbol owners false true true",
    "constructor:false:true:Interface/0/true|columns:false:true:get columns/0/undefined|setPrompt:false:true:setPrompt/1/true|getPrompt:false:true:getPrompt/0/true|setupHistoryManager:false:true:setupHistoryManager/1/true|prompt:false:true:prompt/1/true|close:false:true:close/0/true|pause:false:true:pause/0/true|resume:false:true:resume/0/true|write:false:true:write/2/true|clearLine:false:true:clearLine/0/true|getCursorPos:false:true:getCursorPos/0/true",
    "dispose undefined true 1",
    "false false",
    "undefined undefined"
  ]);
});

test("readline createInterface reports native-shaped invalid argument errors", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      for (const [moduleName, readline] of [
        ["callback", require('node:readline')],
        ["promises", require('node:readline/promises')]
      ]) {
        for (const [label, action] of [
          ["missing", () => readline.createInterface()],
          ["null", () => readline.createInterface(null)],
          ["string", () => readline.createInterface("x")],
          ["empty-object", () => readline.createInterface({})],
          ["output-only", () => readline.createInterface({ output: { write() { return true; } } })]
        ]) {
          try {
            action();
          } catch (error) {
            console.log(moduleName + ":" + label + ":" + error.constructor.name + ":" + (error.code ?? "") + ":" + error.message);
          }
        }
      }
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "callback:missing:TypeError::Cannot read properties of undefined (reading 'history')",
    "callback:null:TypeError::Cannot read properties of null (reading 'history')",
    "callback:string:TypeError::input.on is not a function",
    "callback:empty-object:TypeError::input.on is not a function",
    "callback:output-only:TypeError::input.on is not a function",
    "promises:missing:TypeError::Cannot read properties of undefined (reading 'history')",
    "promises:null:TypeError::Cannot read properties of null (reading 'history')",
    "promises:string:TypeError::input.on is not a function",
    "promises:empty-object:TypeError::input.on is not a function",
    "promises:output-only:TypeError::input.on is not a function"
  ]);
});

test("readline built-in supports questions, line events, prompts, and close", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const readline = require('node:readline');
      const { EventEmitter } = require('node:events');
      const output = { write(value) { console.log('out:' + value); } };
      const rl = readline.createInterface({ input: new EventEmitter(), output, prompt: 'opencontainers> ' });
      rl.on('line', (line) => console.log('line:' + line));
      rl.on('close', () => console.log('closed'));
      rl.prompt();
      rl.question('name? ', (answer) => console.log('answer:' + answer));
      rl.write('Josh\\n');
      rl.close();
      const writes = [];
      const sink = {
        write(value, callback) {
          writes.push(value);
          callback?.();
          return true;
        }
      };
      let callbacks = 0;
      readline.clearLine(sink, -1, () => callbacks++);
      readline.cursorTo(sink, 4);
      readline.cursorTo(sink, 4, 1);
      readline.moveCursor(sink, 3, -2);
      readline.clearScreenDown(sink, () => callbacks++);
      console.log(JSON.stringify(writes.join('')));
      console.log(callbacks);

      let paused = 0;
      let resumed = 0;
      const input = {
        on() {},
        off() {},
        removeListener() {},
        pause() { paused++; },
        resume() { resumed++; }
      };
      const pausable = readline.createInterface({ input });
      const pauseEvents = [];
      pausable.on('pause', () => pauseEvents.push('pause'));
      pausable.on('resume', () => pauseEvents.push('resume'));
      console.log(pausable.pause() === pausable);
      console.log(pausable.resume() === pausable);
      console.log(JSON.stringify({ paused, resumed, pauseEvents }));
      pausable.close();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "out:opencontainers> ",
    "out:name? ",
    "answer:Josh",
    "line:Josh",
    "closed",
    '"\\u001b[1K\\u001b[5G\\u001b[2;5H\\u001b[3C\\u001b[2A\\u001b[0J"',
    "2",
    "true",
    "true",
    '{"paused":1,"resumed":1,"pauseEvents":["pause","resume"]}',
    ""
  ].join("\n"));
});

test("readline Interface exposes cursor position helpers", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const readline = require('node:readline');
      const promises = require('node:readline/promises');
      const { EventEmitter } = require('node:events');
      const output = {
        columns: 5,
        write() { return true; }
      };
      const callbackParent = Object.getPrototypeOf(readline.Interface.prototype);
      const descriptor = Object.getOwnPropertyDescriptor(callbackParent, 'getCursorPos');
      const legacyDescriptor = Object.getOwnPropertyDescriptor(readline.Interface.prototype, '_getCursorPos');
      console.log(Object.hasOwn(readline.Interface.prototype, 'getCursorPos'));
      console.log(JSON.stringify({
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
        writable: descriptor.writable,
        name: descriptor.value.name,
        length: descriptor.value.length
      }));
      console.log(JSON.stringify({
        enumerable: legacyDescriptor.enumerable,
        configurable: legacyDescriptor.configurable,
        writable: legacyDescriptor.writable,
        name: legacyDescriptor.value.name,
        length: legacyDescriptor.value.length
      }));

      const rl = readline.createInterface({ input: new EventEmitter(), output, prompt: 'p> ', terminal: true });
      console.log(JSON.stringify(rl.getCursorPos()), JSON.stringify(rl.line), rl.cursor);
      rl.write('abcdef');
      console.log(JSON.stringify(rl.getCursorPos()), JSON.stringify(rl._getCursorPos()), rl.getCursorPos().cols === rl._getCursorPos().cols, JSON.stringify(rl.line), rl.cursor);
      rl.write('\\n');
      console.log(JSON.stringify(rl.getCursorPos()), JSON.stringify(rl.line), rl.cursor);
      rl.close();

      const promiseRl = promises.createInterface({ input: new EventEmitter(), output, prompt: '>>', terminal: true });
      promiseRl.write('abcd');
      console.log(typeof promiseRl.getCursorPos, JSON.stringify(promiseRl.getCursorPos()), JSON.stringify(promiseRl.line), promiseRl.cursor);
      promiseRl.close();
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "false",
    '{"enumerable":false,"configurable":true,"writable":true,"name":"getCursorPos","length":0}',
    '{"enumerable":true,"configurable":true,"writable":true,"name":"getCursorPos","length":0}',
    '{"cols":3,"rows":0} "" 0',
    '{"cols":4,"rows":1} {"cols":4,"rows":1} true "abcdef" 6',
    '{"cols":3,"rows":0} "" 0',
    'function {"cols":1,"rows":1} "abcd" 4'
  ]);
});

test("readline terminal mode records and navigates history", async () => {
  const kernel = new Kernel();
  const result = await kernel.run("node", [
    "-e",
    `
      const readline = require('node:readline');
      const promises = require('node:readline/promises');
      const { EventEmitter } = require('node:events');

      function makeInput() {
        const input = new EventEmitter();
        input.resume = () => {};
        input.pause = () => {};
        input.setRawMode = () => {};
        return input;
      }

      function makeOutput() {
        return {
          columns: 80,
          write() { return true; }
        };
      }

      function descriptorMeta(target, name) {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        return [
          name,
          descriptor.enumerable,
          descriptor.configurable,
          typeof descriptor.get,
          descriptor.get?.name,
          descriptor.get?.length,
          typeof descriptor.set,
          descriptor.set?.name,
          descriptor.set?.length
        ].join(':');
      }

      const rows = [];
      for (const terminal of [false, true]) {
        const input = makeInput();
        const rl = readline.createInterface({
          input,
          output: makeOutput(),
          terminal,
          historySize: 10,
          removeHistoryDuplicates: false
        });
        rows.push(['meta', terminal, descriptorMeta(rl, 'history'), descriptorMeta(rl, 'historyIndex'), descriptorMeta(rl, 'historySize')].join(':'));
        input.emit('data', 'one\\n');
        input.emit('data', 'two\\n');
        rows.push(['after', terminal, JSON.stringify(rl.history), rl.historyIndex, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip'].join(':'));
        rows.push(['add-empty', terminal, JSON.stringify(rl._addHistory()), JSON.stringify(rl.history), rl.historyIndex].join(':'));
        rl._historyPrev();
        rows.push(['prev1', terminal, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip', rl.historyIndex].join(':'));
        rl._historyPrev();
        rows.push(['prev2', terminal, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip', rl.historyIndex].join(':'));
        rl._historyPrev();
        rows.push(['prev3', terminal, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip', rl.historyIndex].join(':'));
        rl._historyNext();
        rows.push(['next1', terminal, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip', rl.historyIndex].join(':'));
        rl._historyNext();
        rows.push(['next2', terminal, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip', rl.historyIndex].join(':'));
        rl._historyNext();
        rows.push(['next3', terminal, JSON.stringify(rl.line), terminal ? rl.cursor : 'skip', rl.historyIndex].join(':'));
        rl.close();
      }

      const manual = readline.createInterface({ input: makeInput(), output: makeOutput(), terminal: true, historySize: 2 });
      for (const line of ['one', 'two', 'two', 'three']) {
        manual.line = line;
        manual.cursor = line.length;
        rows.push(['manual-add', line, JSON.stringify(manual._addHistory()), JSON.stringify(manual.history), manual.historyIndex].join(':'));
      }
      manual.line = '';
      manual.cursor = 0;
      rows.push(['manual-empty', JSON.stringify(manual._addHistory()), JSON.stringify(manual.history), manual.historyIndex].join(':'));
      manual.close();

      const cappedInput = makeInput();
      const capped = readline.createInterface({ input: cappedInput, output: makeOutput(), terminal: true, historySize: 1 });
      cappedInput.emit('data', 'one\\n');
      cappedInput.emit('data', 'two\\n');
      rows.push('cap:' + JSON.stringify(capped.history) + ':' + capped.historySize);
      capped.close();

      const halfSizeInput = makeInput();
      const halfSize = readline.createInterface({ input: halfSizeInput, output: makeOutput(), terminal: true, historySize: 1.5 });
      halfSizeInput.emit('data', 'one\\n');
      halfSizeInput.emit('data', 'two\\n');
      halfSizeInput.emit('data', 'three\\n');
      rows.push('half-size:' + JSON.stringify(halfSize.history) + ':' + halfSize.historySize);
      halfSize.close();

      const defaultDuplicateInput = makeInput();
      const defaultDuplicate = readline.createInterface({ input: defaultDuplicateInput, output: makeOutput(), terminal: true });
      defaultDuplicateInput.emit('data', 'one\\n');
      defaultDuplicateInput.emit('data', 'two\\n');
      defaultDuplicateInput.emit('data', 'one\\n');
      rows.push('default-duplicates:' + JSON.stringify(defaultDuplicate.history));
      defaultDuplicate.close();

      const dedupeInput = makeInput();
      const dedupe = readline.createInterface({ input: dedupeInput, output: makeOutput(), terminal: true, removeHistoryDuplicates: true });
      dedupeInput.emit('data', 'one\\n');
      dedupeInput.emit('data', 'two\\n');
      dedupeInput.emit('data', 'one\\n');
      rows.push('dedupe:' + JSON.stringify(dedupe.history));
      dedupe.close();

      for (const terminal of [false, true]) {
        const legacyLine = readline.createInterface({ input: makeInput(), output: makeOutput(), terminal });
        legacyLine.line = 'manual';
        legacyLine.cursor = legacyLine.line.length;
        legacyLine._line();
        rows.push(['legacy-line', terminal, JSON.stringify(legacyLine.history), JSON.stringify(legacyLine.line), legacyLine.cursor, legacyLine.historyIndex].join(':'));
        legacyLine.close();
      }

      const draftNav = readline.createInterface({ input: makeInput(), output: makeOutput(), terminal: true });
      for (const line of ['one', 'two', 'three']) {
        draftNav.line = line;
        draftNav.cursor = line.length;
        draftNav._addHistory();
      }
      draftNav.line = 'draft';
      draftNav.cursor = draftNav.line.length;
      draftNav._historyPrev();
      rows.push(['draft-prev', JSON.stringify(draftNav.line), draftNav.cursor, draftNav.historyIndex].join(':'));
      draftNav._historyNext();
      rows.push(['draft-next', JSON.stringify(draftNav.line), draftNav.cursor, draftNav.historyIndex].join(':'));
      draftNav.close();

      const promiseInput = makeInput();
      const promiseRl = promises.createInterface({ input: promiseInput, output: makeOutput(), terminal: true });
      promiseInput.emit('data', 'promise\\n');
      rows.push('promise:' + JSON.stringify(promiseRl.history) + ':' + promiseRl.historyIndex);
      promiseRl.close();

      for (const [label, historySize] of [['negative-size', -1], ['nan-size', NaN], ['string-size', '2'], ['null-size', null], ['boolean-size', true]]) {
        try {
          readline.createInterface({ input: makeInput(), output: makeOutput(), terminal: true, historySize });
        } catch (error) {
          rows.push([label, error.name, error.code, error.message].join(':'));
        }
      }

      console.log(rows.join('\\n'));
    `
  ], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "meta:false:history:true:true:function:get:0:function:set:1:historyIndex:true:true:function:get:0:function:set:1:historySize:true:true:function:get:0:undefined::",
    'after:false:[]:-1:"":skip',
    'add-empty:false:"":[]:-1',
    'prev1:false:"":skip:-1',
    'prev2:false:"":skip:-1',
    'prev3:false:"":skip:-1',
    'next1:false:"":skip:-1',
    'next2:false:"":skip:-1',
    'next3:false:"":skip:-1',
    "meta:true:history:true:true:function:get:0:function:set:1:historyIndex:true:true:function:get:0:function:set:1:historySize:true:true:function:get:0:undefined::",
    'after:true:["two","one"]:-1:"":0',
    'add-empty:true:"":["two","one"]:-1',
    'prev1:true:"two":3:0',
    'prev2:true:"one":3:1',
    'prev3:true:"":0:2',
    'next1:true:"one":3:1',
    'next2:true:"two":3:0',
    'next3:true:"":0:-1',
    'manual-add:one:"one":["one"]:-1',
    'manual-add:two:"two":["two","one"]:-1',
    'manual-add:two:"two":["two","one"]:-1',
    'manual-add:three:"three":["three","two"]:-1',
    'manual-empty:"":["three","two"]:-1',
    'cap:["two"]:1',
    'half-size:["three"]:1.5',
    'default-duplicates:["one","two","one"]',
    'dedupe:["one","two"]',
    'legacy-line:false:["manual"]:"":0:-1',
    'legacy-line:true:["manual"]:"":0:-1',
    'draft-prev:"three":5:0',
    'draft-next:"":0:-1',
    'promise:["promise"]:-1',
    'negative-size:RangeError:ERR_OUT_OF_RANGE:The value of "size" is out of range. It must be >= 0. Received -1',
    'nan-size:RangeError:ERR_OUT_OF_RANGE:The value of "size" is out of range. It must be >= 0. Received NaN',
    "string-size:TypeError:ERR_INVALID_ARG_TYPE:The \"size\" argument must be of type number. Received type string ('2')",
    'null-size:TypeError:ERR_INVALID_ARG_TYPE:The "size" argument must be of type number. Received null',
    'boolean-size:TypeError:ERR_INVALID_ARG_TYPE:The "size" argument must be of type number. Received type boolean (true)'
  ]);
});

test("readline createInterface supports legacy positional streams", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/readline-positional.mjs", `
    import readline from "node:readline";
    import promisesReadline from "node:readline/promises";
    import { EventEmitter } from "node:events";

    function createPair() {
      const input = new EventEmitter();
      let output = "";
      const sink = {
        write(value) {
          output += String(value);
          return true;
        }
      };
      return { input, sink, get output() { return output; } };
    }

    const callbackPair = createPair();
    const completer = (line) => [[line], line];
    const rl = readline.createInterface(callbackPair.input, callbackPair.sink, completer, true);
    console.log(rl.input === callbackPair.input, rl.output === callbackPair.sink, rl.completer === completer, rl.terminal);
    rl.question("Q? ", (answer) => console.log("callback:" + callbackPair.output + ":" + answer));
    callbackPair.input.emit("data", "Alice\\n");
    rl.close();

    const promisePair = createPair();
    const promiseCompleter = (line) => [[line], line];
    const promiseRl = promisesReadline.createInterface(promisePair.input, promisePair.sink, promiseCompleter, true);
    console.log(promiseRl.input === promisePair.input, promiseRl.output === promisePair.sink, promiseRl.completer === promiseCompleter, promiseRl.terminal);
    const answer = promiseRl.question("P? ");
    promisePair.input.emit("data", "Bob\\n");
    console.log("promise:" + promisePair.output + ":" + await answer);
    promiseRl.close();
  `);
  const result = await kernel.run("node", ["readline-positional.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout.toString().trim().split("\n"), [
    "true true true true",
    "callback:Q? :Alice",
    "true true true true",
    "promise:P? :Bob"
  ]);
});

test("readline questions support AbortSignal overloads without swallowing later input", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/readline-abort.mjs", `
    import readline from "node:readline";
    import promisesReadline from "node:readline/promises";
    import { PassThrough, Writable } from "node:stream";

    function outputCollector() {
      const chunks = [];
      return {
        chunks,
        stream: new Writable({
          write(chunk, _encoding, callback) {
            chunks.push(String(chunk));
            callback();
          }
        })
      };
    }

    const input = new PassThrough();
    const callbackOutput = outputCollector();
    const rl = readline.createInterface({ input, output: callbackOutput.stream });
    const lines = [];
    let callbackCalls = 0;
    rl.on("line", (line) => lines.push(line));

    const callbackController = new AbortController();
    rl.question("Name? ", { signal: callbackController.signal }, (answer) => {
      callbackCalls++;
      console.log("callback-answer:" + answer);
    });
    console.log("callback-prompt:" + JSON.stringify(callbackOutput.chunks.join("")));
    callbackController.abort("stop");
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("callback-aborted:" + JSON.stringify(callbackOutput.chunks.join("")));
    input.write("later\\n");
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("callback-calls:" + callbackCalls);
    console.log("callback-lines:" + JSON.stringify(lines));
    rl.close();

    const promiseInput = new PassThrough();
    const promiseOutput = outputCollector();
    const promiseRl = promisesReadline.createInterface({
      input: promiseInput,
      output: promiseOutput.stream
    });
    const promiseController = new AbortController();
    const question = promiseRl.question("Prompt? ", { signal: promiseController.signal })
      .then(
        (answer) => "resolved:" + answer,
        (error) => "rejected:" + error.name + ":" + error.code + ":" + error.cause
      );
    console.log("promise-prompt:" + JSON.stringify(promiseOutput.chunks.join("")));
    promiseController.abort("timeout");
    console.log(await question);
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log("promise-aborted:" + JSON.stringify(promiseOutput.chunks.join("")));
    promiseInput.write("ignored\\n");
    await new Promise((resolve) => setTimeout(resolve, 0));
    promiseRl.close();

    const alreadyAborted = new AbortController();
    alreadyAborted.abort("already");
    const preAborted = promisesReadline.createInterface({
      input: new PassThrough(),
      output: outputCollector().stream
    });
    await preAborted.question("Never? ", { signal: alreadyAborted.signal })
      .then(
        () => console.log("pre-aborted:resolved"),
        (error) => console.log("pre-aborted:" + error.name + ":" + error.code + ":" + error.cause)
      );
    preAborted.close();
  `);

  const result = await kernel.run("node", ["/workspace/readline-abort.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    'callback-prompt:"Name? "',
    'callback-aborted:"Name? \\r\\n"',
    "callback-calls:0",
    'callback-lines:["later"]',
    'promise-prompt:"Prompt? "',
    "rejected:AbortError:ABORT_ERR:timeout",
    'promise-aborted:"Prompt? \\r\\n"',
    "pre-aborted:AbortError:ABORT_ERR:already",
    ""
  ].join("\n"));
});

test("readline supports async iteration and keypress events", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/readline.mjs", `
    import readline from "node:readline";
    import { PassThrough } from "node:stream";

    const input = new PassThrough();
    const rl = readline.createInterface({ input });
    const lines = [];
    queueMicrotask(() => {
      input.write("alpha\\n");
      input.write("beta\\n");
      rl.close();
    });
    for await (const line of rl) {
      lines.push(line);
    }
    console.log("lines:" + JSON.stringify(lines));

    const keys = new PassThrough();
    const events = [];
    readline.emitKeypressEvents(keys);
    readline.emitKeypressEvents(keys);
    keys.on("keypress", (str, key) => {
      events.push([str == null ? null : str.charCodeAt(0), key.name, key.ctrl, key.shift, key.code ?? null]);
    });
    keys.write("a\\r\\u0003\\u007f\\x1b[A");
    console.log("keys:" + JSON.stringify(events));
  `);

  const result = await kernel.run("node", ["/workspace/readline.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    'lines:["alpha","beta"]',
    'keys:[[97,"a",false,false,null],[13,"return",false,false,null],[3,"c",true,false,null],[127,"backspace",false,false,null],[null,"up",false,false,"[A"]]',
    ""
  ].join("\n"));
});

test("readline/promises supports process stdin questions", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/name.js", `
    import readline from "node:readline/promises";
    import { stdin as input, stdout as output } from "node:process";

    console.log("TTY info:", JSON.stringify({
      stdinTTY: input.isTTY,
      stdoutTTY: output.isTTY,
    }));

    const rl = readline.createInterface({ input, output });
    const name = await rl.question("Type something and press enter: ");

    console.log("you typed:", name);

    rl.close();
  `);

  const process = kernel.spawn("node", ["name.js"], { cwd: "/workspace" });
  let answered = false;
  process.stdout.on("data", (chunk) => {
    if (!answered && chunk.toString().includes("Type something and press enter: ")) {
      answered = true;
      process.stdin.write("Josh\n");
    }
  });

  const result = await process.completed;

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    'TTY info: {"stdinTTY":true,"stdoutTTY":true}',
    "Type something and press enter: you typed: Josh",
    ""
  ].join("\n"));
});

test("readline/promises exposes Readline cursor action helper", async () => {
  const kernel = new Kernel();
  kernel.fs.writeFileSync("/workspace/readline-actions.mjs", `
    import { Readline } from "node:readline/promises";
    import { Writable } from "node:stream";

    const chunks = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      }
    });
    const actions = new Readline(output, { autoCommit: false });
    console.log(actions.cursorTo(2).clearLine(0).moveCursor(1, -1).clearScreenDown() === actions);
    console.log(chunks.length);
    await actions.commit();
    console.log(JSON.stringify(chunks.join("")));
    actions.cursorTo(9).rollback();
    await actions.commit();
    console.log(JSON.stringify(chunks.join("")));

    const autoChunks = [];
    const autoOutput = new Writable({
      write(chunk, _encoding, callback) {
        autoChunks.push(String(chunk));
        callback();
      }
    });
    const auto = new Readline(autoOutput, { autoCommit: true });
    console.log(auto.cursorTo(1) === auto, JSON.stringify(autoChunks.join("")));

    for (const [label, action] of [
      ["ctor-missing", () => new Readline()],
      ["ctor-null", () => new Readline(null)],
      ["ctor-object", () => new Readline({})],
      ["ctor-write-only", () => new Readline({ write() {} })],
      ["ctor-autoCommit-string", () => new Readline(output, { autoCommit: "x" })]
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label + ":" + error.name + ":" + error.code + ":" + error.message + ":" + String(error));
      }
    }

    for (const [label, action] of [
      ["cursorTo()", () => actions.cursorTo()],
      ["cursorTo-string", () => actions.cursorTo("2")],
      ["cursorTo-float", () => actions.cursorTo(1.5)],
      ["cursorTo-y-string", () => actions.cursorTo(1, "2")],
      ["moveCursor-one-arg", () => actions.moveCursor(1)],
      ["moveCursor-string", () => actions.moveCursor("1", 1)],
      ["clearLine()", () => actions.clearLine()],
      ["clearLine-float", () => actions.clearLine(1.5)]
    ]) {
      try {
        action();
      } catch (error) {
        console.log(label + ":" + error.name + ":" + error.code + ":" + error.message + ":" + String(error));
      }
    }
  `);

  const result = await kernel.run("node", ["/workspace/readline-actions.mjs"], { cwd: "/workspace" });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), [
    "true",
    "0",
    '"\\u001b[3G\\u001b[2K\\u001b[1C\\u001b[1A\\u001b[0J"',
    '"\\u001b[3G\\u001b[2K\\u001b[1C\\u001b[1A\\u001b[0J"',
    'true "\\u001b[2G"',
    'ctor-missing:TypeError:ERR_INVALID_ARG_TYPE:The "stream" argument must be an instance of Writable. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The "stream" argument must be an instance of Writable. Received undefined',
    'ctor-null:TypeError:ERR_INVALID_ARG_TYPE:The "stream" argument must be an instance of Writable. Received null:TypeError [ERR_INVALID_ARG_TYPE]: The "stream" argument must be an instance of Writable. Received null',
    'ctor-object:TypeError:ERR_INVALID_ARG_TYPE:The "stream" argument must be an instance of Writable. Received an instance of Object:TypeError [ERR_INVALID_ARG_TYPE]: The "stream" argument must be an instance of Writable. Received an instance of Object',
    'ctor-write-only:TypeError:ERR_INVALID_ARG_TYPE:The "stream" argument must be an instance of Writable. Received an instance of Object:TypeError [ERR_INVALID_ARG_TYPE]: The "stream" argument must be an instance of Writable. Received an instance of Object',
    "ctor-autoCommit-string:TypeError:ERR_INVALID_ARG_TYPE:The \"options.autoCommit\" property must be of type boolean. Received type string ('x'):TypeError [ERR_INVALID_ARG_TYPE]: The \"options.autoCommit\" property must be of type boolean. Received type string ('x')",
    'cursorTo():TypeError:ERR_INVALID_ARG_TYPE:The "x" argument must be of type number. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The "x" argument must be of type number. Received undefined',
    "cursorTo-string:TypeError:ERR_INVALID_ARG_TYPE:The \"x\" argument must be of type number. Received type string ('2'):TypeError [ERR_INVALID_ARG_TYPE]: The \"x\" argument must be of type number. Received type string ('2')",
    'cursorTo-float:RangeError:ERR_OUT_OF_RANGE:The value of "x" is out of range. It must be an integer. Received 1.5:RangeError [ERR_OUT_OF_RANGE]: The value of "x" is out of range. It must be an integer. Received 1.5',
    "cursorTo-y-string:TypeError:ERR_INVALID_ARG_TYPE:The \"y\" argument must be of type number. Received type string ('2'):TypeError [ERR_INVALID_ARG_TYPE]: The \"y\" argument must be of type number. Received type string ('2')",
    'moveCursor-one-arg:TypeError:ERR_INVALID_ARG_TYPE:The "dy" argument must be of type number. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The "dy" argument must be of type number. Received undefined',
    "moveCursor-string:TypeError:ERR_INVALID_ARG_TYPE:The \"dx\" argument must be of type number. Received type string ('1'):TypeError [ERR_INVALID_ARG_TYPE]: The \"dx\" argument must be of type number. Received type string ('1')",
    'clearLine():TypeError:ERR_INVALID_ARG_TYPE:The "dir" argument must be of type number. Received undefined:TypeError [ERR_INVALID_ARG_TYPE]: The "dir" argument must be of type number. Received undefined',
    'clearLine-float:RangeError:ERR_OUT_OF_RANGE:The value of "dir" is out of range. It must be an integer. Received 1.5:RangeError [ERR_OUT_OF_RANGE]: The value of "dir" is out of range. It must be an integer. Received 1.5',
    ""
  ].join("\n"));
});
