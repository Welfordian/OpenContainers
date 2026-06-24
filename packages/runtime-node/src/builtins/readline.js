import { EventEmitter } from "./events.js";
import { Writable } from "./stream.js";

const KEYPRESS_LISTENER = Symbol("opencontainers.readline.keypressListener");
const READLINE_HISTORY_STATE = Symbol("opencontainers.readline.historyState");
const READLINE_LEGACY_STATE = Symbol("opencontainers.readline.legacyState");
let callbackInterfaceParentPrototype = null;

export class Interface extends EventEmitter {
  constructor(options = {}) {
    super();
    const historySize = normalizeHistorySize(options.historySize);
    this.input = options.input;
    this.output = options.output;
    this.completer = options.completer;
    this.terminal = options.terminal === undefined
      ? Boolean(options.output?.isTTY)
      : Boolean(options.terminal);
    this.closed = false;
    this.line = "";
    this.cursor = 0;
    Object.defineProperty(this, READLINE_HISTORY_STATE, {
      configurable: true,
      value: {
        history: [],
        historyIndex: -1,
        historyNavigationLine: "",
        historySize,
        removeHistoryDuplicates: Boolean(options.removeHistoryDuplicates)
      }
    });
    defineReadlineHistoryAccessors(this);
    this.#prompt = options.prompt ?? "> ";
    this.#question = null;
    this.#questionRefed = false;
    this.#onInputData = (chunk) => this.write(chunk);
    this.input?.on?.("data", this.#onInputData);
  }

  #prompt;
  #question;
  #questionCleanup;
  #questionRefed;
  #onInputData;

  setPrompt(prompt) {
    this.#prompt = String(prompt);
  }

  getPrompt() {
    return this.#prompt;
  }

  prompt() {
    this.output?.write?.(this.#prompt);
  }

  question(query, options, callback) {
    const { signal, callback: cb } = normalizeQuestionArgs(options, callback);
    if (signal?.aborted) return;
    this.#refQuestion();
    this.#question = cb;
    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      this.#cancelQuestion();
      this.output?.write?.("\r\n");
    };
    if (signal) {
      signal.addEventListener?.("abort", onAbort, { once: true });
      this.#questionCleanup = cleanup;
    }
    this.output?.write?.(query);
  }

  write(data) {
    const text = typeof data === "string" ? data : data?.toString?.() ?? String(data);
    for (const char of text) {
      if (char === "\r") continue;
      if (char === "\n") {
        const line = this.line;
        recordReadlineLineHistory(this, line);
        this.line = "";
        this.cursor = 0;
        if (this.#question) {
          const callback = this.#question;
          this.#finishQuestion();
          callback(line);
        }
        this.emit("line", line);
      } else {
        const cursor = clampCursor(this.cursor, this.line.length);
        this.line = `${this.line.slice(0, cursor)}${char}${this.line.slice(cursor)}`;
        this.cursor = cursor + char.length;
      }
    }
  }

  getCursorPos() {
    const prompt = String(this.#prompt);
    const promptLines = prompt.split("\n");
    const baseRows = promptLines.length - 1;
    const baseCols = promptLines[promptLines.length - 1].length;
    const totalCols = baseCols + clampCursor(this.cursor, this.line.length);
    const columns = normalizeColumns(this.output?.columns);
    if (!columns) return { cols: totalCols, rows: baseRows };
    return {
      cols: totalCols % columns,
      rows: baseRows + Math.floor(totalCols / columns)
    };
  }

  _getCursorPos() {
    return this.getCursorPos();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.#cancelQuestion();
    this.input?.off?.("data", this.#onInputData);
    this.input?.removeListener?.("data", this.#onInputData);
    this.emit("close");
  }

  [Symbol.asyncIterator]() {
    const readline = this;
    const queue = [];
    const waiters = [];
    let closed = readline.closed;
    let failure = null;

    const cleanup = () => {
      readline.removeListener?.("line", onLine);
      readline.removeListener?.("close", onClose);
      readline.removeListener?.("error", onError);
    };
    const settleWaiter = (waiter, result) => {
      if (waiter.refed) readline.input?.__opencontainersProcess?.__opencontainersUnref?.();
      waiter.resolve(result);
    };
    const rejectWaiter = (waiter, error) => {
      if (waiter.refed) readline.input?.__opencontainersProcess?.__opencontainersUnref?.();
      waiter.reject(error);
    };
    const settle = () => {
      while (waiters.length) {
        const waiter = waiters.shift();
        if (queue.length) settleWaiter(waiter, { value: queue.shift(), done: false });
        else if (failure) rejectWaiter(waiter, failure);
        else if (closed) settleWaiter(waiter, { value: undefined, done: true });
        else {
          waiters.unshift(waiter);
          break;
        }
      }
    };
    const finish = (error) => {
      if (closed || failure) return;
      if (error) failure = error;
      else closed = true;
      cleanup();
      settle();
    };
    const onLine = (line) => {
      queue.push(line);
      settle();
    };
    const onClose = () => finish();
    const onError = (error) => finish(error);

    readline.on("line", onLine);
    readline.once("close", onClose);
    readline.once("error", onError);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
        if (failure) return Promise.reject(failure);
        if (closed) return Promise.resolve({ value: undefined, done: true });
        readline.input?.__opencontainersProcess?.__opencontainersAddRef?.();
        return new Promise((resolve, reject) => waiters.push({ resolve, reject, refed: true }));
      },
      return() {
        finish();
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        finish(error);
        return Promise.reject(error);
      }
    };
  }

  pause() {
    this.input?.pause?.();
    this.emit("pause");
    return this;
  }

  resume() {
    this.input?.resume?.();
    this.emit("resume");
    return this;
  }

  #refQuestion() {
    if (this.#questionRefed) return;
    this.input?.__opencontainersProcess?.__opencontainersAddRef?.();
    this.#questionRefed = true;
  }

  #unrefQuestion() {
    if (!this.#questionRefed) return;
    this.#questionRefed = false;
    this.input?.__opencontainersProcess?.__opencontainersUnref?.();
  }

  #finishQuestion() {
    this.#question = null;
    this.#questionCleanup?.();
    this.#questionCleanup = null;
    this.#unrefQuestion();
  }

  #cancelQuestion() {
    this.#question = null;
    this.#questionCleanup?.();
    this.#questionCleanup = null;
    this.#unrefQuestion();
  }
}

export function createInterface(input, output, completer, terminal) {
  return new Interface(normalizeValidatedCreateInterfaceArgs(input, output, completer, terminal));
}

class PromisesInterfaceParent extends Interface {
  get columns() {
    return this.output?.columns;
  }

  setPrompt(prompt) {
    return callbackInterfaceParentPrototype.setPrompt.call(this, prompt);
  }

  getPrompt() {
    return callbackInterfaceParentPrototype.getPrompt.call(this);
  }

  setupHistoryManager(_options) {
    return undefined;
  }

  prompt(_preserveCursor) {
    return callbackInterfaceParentPrototype.prompt.call(this);
  }

  close() {
    return callbackInterfaceParentPrototype.close.call(this);
  }

  pause() {
    return callbackInterfaceParentPrototype.pause.call(this);
  }

  resume() {
    return callbackInterfaceParentPrototype.resume.call(this);
  }

  write(data, _key) {
    return callbackInterfaceParentPrototype.write.call(this, data);
  }

  clearLine() {
    this.line = "";
    this.cursor = 0;
  }

  getCursorPos() {
    return callbackInterfaceParentPrototype.getCursorPos.call(this);
  }
}

export class PromisesInterface extends Interface {
  question(query, options = {}) {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        reject(createAbortError(signal.reason));
      };

      signal?.addEventListener?.("abort", onAbort, { once: true });
      super.question(query, options, (answer) => {
        signal?.removeEventListener?.("abort", onAbort);
        resolve(answer);
      });
    });
  }
}

Object.setPrototypeOf(PromisesInterface.prototype, PromisesInterfaceParent.prototype);

alignInterfacePrototypeMetadata();
installCallbackInterfaceParentPrototype();
installPromisesInterfaceParentSymbols();

export class Readline {
  constructor(stream, options = {}) {
    if (!(stream instanceof Writable)) {
      throw createInvalidArgTypeError("stream", "an instance of Writable", stream);
    }
    if (options?.autoCommit !== undefined && options.autoCommit !== null && typeof options.autoCommit !== "boolean") {
      throw createInvalidPropertyTypeError("options.autoCommit", "boolean", options.autoCommit);
    }
    this.#stream = stream;
    this.#autoCommit = options?.autoCommit === true;
  }

  #stream;
  #autoCommit;
  #pending = [];

  clearLine(direction) {
    validateIntegerArgument("dir", direction);
    return this.#push(clearLineSequence(direction));
  }

  clearScreenDown() {
    return this.#push("\x1b[0J");
  }

  cursorTo(x, ...args) {
    const y = args[0];
    validateIntegerArgument("x", x);
    if (y !== undefined && y !== null) validateIntegerArgument("y", y);
    return this.#push(cursorToSequence(x, y));
  }

  moveCursor(dx, dy) {
    validateIntegerArgument("dx", dx);
    validateIntegerArgument("dy", dy);
    return this.#push(moveCursorSequence(dx, dy));
  }

  commit() {
    const sequence = this.#pending.join("");
    this.#pending = [];
    if (!sequence) return Promise.resolve();
    return writeControlSequenceAsync(this.#stream, sequence);
  }

  rollback() {
    this.#pending = [];
    return this;
  }

  #push(sequence) {
    if (!sequence) return this;
    if (this.#autoCommit) {
      this.#stream.write(sequence);
    } else {
      this.#pending.push(sequence);
    }
    return this;
  }
}

export function createPromisesInterface(input, output, completer, terminal) {
  return new PromisesInterface(normalizeValidatedCreateInterfaceArgs(input, output, completer, terminal));
}

function normalizeValidatedCreateInterfaceArgs(input, output, completer, terminal) {
  if (input === undefined && output === undefined && completer === undefined && terminal === undefined) {
    throw new TypeError("Cannot read properties of undefined (reading 'history')");
  }
  if (input === null && output === undefined && completer === undefined && terminal === undefined) {
    throw new TypeError("Cannot read properties of null (reading 'history')");
  }
  const options = normalizeCreateInterfaceArgs(input, output, completer, terminal);
  if (typeof options.input?.on !== "function") {
    throw new TypeError("input.on is not a function");
  }
  return options;
}

export function clearLine(stream, direction, callback) {
  if (typeof stream?.clearLine === "function") return stream.clearLine(direction, callback);
  return writeControlSequence(stream, clearLineSequence(direction), callback);
}

export function clearScreenDown(stream, callback) {
  if (typeof stream?.clearScreenDown === "function") return stream.clearScreenDown(callback);
  return writeControlSequence(stream, "\x1b[0J", callback);
}

export function cursorTo(stream, x, y, callback) {
  if (typeof stream?.cursorTo === "function") return stream.cursorTo(x, y, callback);
  const cb = typeof y === "function" ? y : callback;
  if (typeof x !== "number") return writeControlSequence(stream, "", cb);
  if (Number.isNaN(x)) throw invalidCursorArgument("x", x);
  if (typeof y === "number" && Number.isNaN(y)) throw invalidCursorArgument("y", y);
  return writeControlSequence(stream, cursorToSequence(x, y), cb);
}

export function moveCursor(stream, dx, dy, callback) {
  if (typeof stream?.moveCursor === "function") return stream.moveCursor(dx, dy, callback);
  return writeControlSequence(stream, moveCursorSequence(dx, dy), callback);
}

export function emitKeypressEvents(stream) {
  if (!stream || typeof stream.on !== "function" || typeof stream.emit !== "function") return;
  if (stream[KEYPRESS_LISTENER]) return;
  const onData = (chunk) => {
    const text = typeof chunk === "string" ? chunk : chunk?.toString?.("utf8") ?? String(chunk);
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "\x1b" && text[index + 1] === "[" && text[index + 2]) {
        const sequence = text.slice(index, index + 3);
        stream.emit("keypress", undefined, createEscapeKey(sequence));
        index += 2;
      } else {
        stream.emit("keypress", char, createCharacterKey(char));
      }
    }
  };
  Object.defineProperty(stream, KEYPRESS_LISTENER, {
    configurable: true,
    value: onData
  });
  stream.on("data", onData);
}

export const promises = {
  Interface: PromisesInterface,
  Readline,
  createInterface: createPromisesInterface
};

const readlineBuiltin = {
  Interface,
  clearLine,
  clearScreenDown,
  createInterface,
  cursorTo,
  emitKeypressEvents,
  moveCursor,
  promises
};

Object.defineProperties(Interface, {
  length: {
    configurable: true,
    value: 4
  }
});

Object.defineProperties(createInterface, {
  length: {
    configurable: true,
    value: 4
  }
});

Object.defineProperties(PromisesInterface, {
  name: {
    configurable: true,
    value: "Interface"
  }
});

Object.defineProperties(PromisesInterfaceParent, {
  name: {
    configurable: true,
    value: "Interface"
  }
});

Object.defineProperties(createPromisesInterface, {
  name: {
    configurable: true,
    value: "createInterface"
  },
  length: {
    configurable: true,
    value: 4
  }
});

reorderProperties(Readline.prototype, [
  "cursorTo",
  "moveCursor",
  "clearLine",
  "clearScreenDown",
  "commit",
  "rollback"
]);

export default readlineBuiltin;

function reorderProperties(target, names) {
  const descriptors = names
    .map((name) => [name, Object.getOwnPropertyDescriptor(target, name)])
    .filter(([, descriptor]) => descriptor?.configurable);
  for (const [name] of descriptors) {
    delete target[name];
  }
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(target, name, descriptor);
  }
}

function alignInterfacePrototypeMetadata() {
  const originalQuestion = Interface.prototype.question;
  Object.defineProperty(Interface.prototype, "question", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function question(query, options, callback) {
      return originalQuestion.call(this, query, options, callback);
    }
  });

  for (const name of [
    "_decoder",
    "_line_buffer",
    "_oldPrompt",
    "_previousKey",
    "_prompt",
    "_questionCallback",
    "_sawKeyPress",
    "_sawReturnAt"
  ]) {
    defineReadlineLegacyAccessor(name);
  }

  const privateMethods = [
    ["_setRawMode", 1, function setRawMode(mode) {
      return this.input?.setRawMode?.(mode);
    }],
    ["_onLine", 1, function onLine(line = this.line) {
      return this.write(`${line}\n`);
    }],
    ["_writeToOutput", 1, function writeToOutput(value) {
      return this.output?.write?.(value);
    }],
    ["_addHistory", 0, function addHistory() {
      return addReadlineHistoryEntry(this, this.line);
    }],
    ["_refreshLine", 0, function refreshLine() {
      return undefined;
    }],
    ["_normalWrite", 1, function normalWrite(value) {
      return this.write(value);
    }],
    ["_insertString", 1, function insertString(value = "") {
      const text = String(value);
      const cursor = clampCursor(this.cursor, this.line.length);
      this.line = `${this.line.slice(0, cursor)}${text}${this.line.slice(cursor)}`;
      this.cursor = cursor + text.length;
    }],
    ["_wordLeft", 0, function wordLeft() {
      this.cursor = findPreviousWordBoundary(this.line, this.cursor);
    }],
    ["_wordRight", 0, function wordRight() {
      this.cursor = findNextWordBoundary(this.line, this.cursor);
    }],
    ["_deleteLeft", 0, function deleteLeft() {
      if (this.cursor <= 0) return;
      this.line = `${this.line.slice(0, this.cursor - 1)}${this.line.slice(this.cursor)}`;
      this.cursor -= 1;
    }],
    ["_deleteRight", 0, function deleteRight() {
      if (this.cursor >= this.line.length) return;
      this.line = `${this.line.slice(0, this.cursor)}${this.line.slice(this.cursor + 1)}`;
    }],
    ["_deleteWordLeft", 0, function deleteWordLeft() {
      const start = findPreviousWordBoundary(this.line, this.cursor);
      this.line = `${this.line.slice(0, start)}${this.line.slice(this.cursor)}`;
      this.cursor = start;
    }],
    ["_deleteWordRight", 0, function deleteWordRight() {
      const end = findNextWordBoundary(this.line, this.cursor);
      this.line = `${this.line.slice(0, this.cursor)}${this.line.slice(end)}`;
    }],
    ["_deleteLineLeft", 0, function deleteLineLeft() {
      this.line = this.line.slice(this.cursor);
      this.cursor = 0;
    }],
    ["_deleteLineRight", 0, function deleteLineRight() {
      this.line = this.line.slice(0, this.cursor);
    }],
    ["_line", 0, function line() {
      addReadlineHistoryEntry(this, this.line);
      return this.write("\n");
    }],
    ["_historyNext", 0, function historyNext() {
      return moveReadlineHistoryNext(this);
    }],
    ["_historyPrev", 0, function historyPrev() {
      return moveReadlineHistoryPrev(this);
    }],
    ["_getDisplayPos", 1, function getDisplayPos(value = "") {
      const columns = normalizeColumns(this.output?.columns);
      const text = String(value);
      if (!columns) return { cols: text.length, rows: 0 };
      return {
        cols: text.length % columns,
        rows: Math.floor(text.length / columns)
      };
    }],
    ["_moveCursor", 1, function moveCursor(dx = 0) {
      this.cursor = clampCursor(this.cursor + Number(dx || 0), this.line.length);
    }],
    ["_ttyWrite", 2, function ttyWrite(value, key = {}) {
      if (value !== undefined) return this.write(value);
      if (key?.name === "return") return this.write("\n");
      if (key?.name === "backspace") return this._deleteLeft();
      return undefined;
    }]
  ];

  for (const [name, length, implementation] of privateMethods) {
    Object.defineProperty(Interface.prototype, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: createReadlineProbeMethod(`[${name}]`, length, implementation)
    });
  }

  Object.defineProperty(Interface.prototype, "_tabComplete", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: createConstructableReadlineProbe("", 1, function tabComplete(value = this.line) {
      return typeof this.completer === "function" ? this.completer(value) : undefined;
    })
  });
  Object.defineProperty(Interface.prototype, "_getCursorPos", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: createReadlineProbeMethod("getCursorPos", 0, function getCursorPos() {
      return this.getCursorPos();
    })
  });

  reorderProperties(Interface.prototype, [
    "_decoder",
    "_line_buffer",
    "_oldPrompt",
    "_previousKey",
    "_prompt",
    "_questionCallback",
    "_sawKeyPress",
    "_sawReturnAt",
    "_setRawMode",
    "_onLine",
    "_writeToOutput",
    "_addHistory",
    "_refreshLine",
    "_normalWrite",
    "_insertString",
    "_tabComplete",
    "_wordLeft",
    "_wordRight",
    "_deleteLeft",
    "_deleteRight",
    "_deleteWordLeft",
    "_deleteWordRight",
    "_deleteLineLeft",
    "_deleteLineRight",
    "_line",
    "_historyNext",
    "_historyPrev",
    "_getDisplayPos",
    "_getCursorPos",
    "_moveCursor",
    "_ttyWrite"
  ]);
}

function installCallbackInterfaceParentPrototype() {
  const eventEmitterPrototype = Object.getPrototypeOf(Interface.prototype);
  const original = {
    setPrompt: Interface.prototype.setPrompt,
    getPrompt: Interface.prototype.getPrompt,
    prompt: Interface.prototype.prompt,
    write: Interface.prototype.write,
    getCursorPos: Interface.prototype.getCursorPos,
    close: Interface.prototype.close,
    pause: Interface.prototype.pause,
    resume: Interface.prototype.resume,
    asyncIterator: Interface.prototype[Symbol.asyncIterator]
  };
  const interfaceConstructorPrototype = Object.create(eventEmitterPrototype);
  const interfaceConstructor = function () {};
  Object.defineProperty(interfaceConstructor, "name", {
    configurable: true,
    value: "InterfaceConstructor"
  });
  Object.defineProperty(interfaceConstructorPrototype, "constructor", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: interfaceConstructor
  });

  const parent = Object.create(interfaceConstructorPrototype);
  const parentConstructor = function () {};
  Object.defineProperty(parentConstructor, "name", {
    configurable: true,
    value: "Interface"
  });
  Object.defineProperty(parent, "constructor", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: parentConstructor
  });
  Object.defineProperty(parent, "columns", {
    configurable: true,
    enumerable: false,
    get: createReadlineProbeMethod("get columns", 0, function getColumns() {
      return this.output?.columns;
    })
  });

  defineParentMethod(parent, "setPrompt", 1, function setPrompt(prompt) {
    return original.setPrompt.call(this, prompt);
  });
  defineParentMethod(parent, "getPrompt", 0, function getPrompt() {
    return original.getPrompt.call(this);
  });
  defineParentMethod(parent, "setupHistoryManager", 1, function setupHistoryManager(_options) {
    return undefined;
  });
  defineParentMethod(parent, "prompt", 1, function prompt(_preserveCursor) {
    return original.prompt.call(this);
  });
  defineParentMethod(parent, "close", 0, function close() {
    return original.close.call(this);
  });
  defineParentMethod(parent, "pause", 0, function pause() {
    return original.pause.call(this);
  });
  defineParentMethod(parent, "resume", 0, function resume() {
    return original.resume.call(this);
  });
  defineParentMethod(parent, "write", 2, function write(data, _key) {
    return original.write.call(this, data);
  });
  defineParentMethod(parent, "clearLine", 0, function clearLine() {
    this.line = "";
    this.cursor = 0;
  });
  defineParentMethod(parent, "getCursorPos", 0, function getCursorPos() {
    return original.getCursorPos.call(this);
  });
  defineParentSymbolMethods(parent, {
    asyncIterator() {
      return original.asyncIterator.call(this);
    },
    dispose() {
      return original.close.call(this);
    }
  });

  Object.setPrototypeOf(Interface.prototype, parent);
  for (const name of Object.keys(original)) delete Interface.prototype[name];
  delete Interface.prototype[Symbol.asyncIterator];
  callbackInterfaceParentPrototype = parent;
}

function defineParentMethod(target, name, length, implementation) {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: createReadlineProbeMethod(name, length, implementation)
  });
}

function installPromisesInterfaceParentSymbols() {
  defineParentSymbolMethods(PromisesInterfaceParent.prototype, {
    asyncIterator() {
      return callbackInterfaceParentPrototype[Symbol.asyncIterator].call(this);
    },
    dispose() {
      return callbackInterfaceParentPrototype[Symbol.dispose].call(this);
    }
  });
}

function defineParentSymbolMethods(target, implementations) {
  Object.defineProperty(target, Symbol.asyncIterator, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: createReadlineProbeMethod("[Symbol.asyncIterator]", 0, implementations.asyncIterator)
  });
  Object.defineProperty(target, Symbol.dispose, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: createConstructableReadlineProbe("[Symbol.dispose]", 0, implementations.dispose)
  });
}

function defineReadlineLegacyAccessor(name) {
  Object.defineProperty(Interface.prototype, name, {
    configurable: false,
    enumerable: false,
    get: createReadlineProbeMethod("get", 0, function getLegacyValue() {
      if (name === "_prompt") return this.getPrompt();
      if (name === "_line_buffer") return this.line;
      return getReadlineLegacyState(this)[name];
    }),
    set: createReadlineProbeMethod("set", 1, function setLegacyValue(value) {
      if (name === "_prompt") {
        this.setPrompt(value);
        return;
      }
      if (name === "_line_buffer") {
        this.line = String(value ?? "");
        this.cursor = clampCursor(this.cursor, this.line.length);
        return;
      }
      getReadlineLegacyState(this)[name] = value;
    })
  });
}

function defineReadlineHistoryAccessors(target) {
  Object.defineProperty(target, "history", {
    configurable: true,
    enumerable: true,
    get: createReadlineProbeMethod("get", 0, function getHistory() {
      return getReadlineHistoryState(this).history;
    }),
    set: createReadlineProbeMethod("set", 1, function setHistory(value) {
      getReadlineHistoryState(this).history = value;
    })
  });
  Object.defineProperty(target, "historyIndex", {
    configurable: true,
    enumerable: true,
    get: createReadlineProbeMethod("get", 0, function getHistoryIndex() {
      return getReadlineHistoryState(this).historyIndex;
    }),
    set: createReadlineProbeMethod("set", 1, function setHistoryIndex(value) {
      getReadlineHistoryState(this).historyIndex = value;
    })
  });
  Object.defineProperty(target, "historySize", {
    configurable: true,
    enumerable: true,
    get: createReadlineProbeMethod("get", 0, function getHistorySize() {
      return getReadlineHistoryState(this).historySize;
    })
  });
}

function getReadlineLegacyState(target) {
  if (!Object.hasOwn(target, READLINE_LEGACY_STATE)) {
    Object.defineProperty(target, READLINE_LEGACY_STATE, {
      configurable: true,
      value: Object.create(null)
    });
  }
  return target[READLINE_LEGACY_STATE];
}

function getReadlineHistoryState(target) {
  if (!Object.hasOwn(target, READLINE_HISTORY_STATE)) {
    Object.defineProperty(target, READLINE_HISTORY_STATE, {
      configurable: true,
      value: {
        history: [],
        historyIndex: -1,
        historyNavigationLine: "",
        historySize: 30,
        removeHistoryDuplicates: false
      }
    });
  }
  return target[READLINE_HISTORY_STATE];
}

function normalizeHistorySize(value) {
  if (value === undefined) return 30;
  if (typeof value !== "number") {
    throw createInvalidArgTypeError("size", "number", value);
  }
  if (Number.isNaN(value) || value < 0) {
    throw withNodeErrorString(
      new RangeError(`The value of "size" is out of range. It must be >= 0. Received ${value}`),
      "ERR_OUT_OF_RANGE"
    );
  }
  return value;
}

function getReadlineHistoryArray(state) {
  if (!Array.isArray(state.history)) state.history = [];
  return state.history;
}

function getReadlineHistoryLimit(state) {
  const limit = Math.floor(state.historySize);
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit);
}

function recordReadlineLineHistory(target, line) {
  if (!target.terminal) return;
  addReadlineHistoryEntry(target, line);
}

function addReadlineHistoryEntry(target, line) {
  const value = String(line ?? "");
  if (value.length === 0) return value;
  const state = getReadlineHistoryState(target);
  const limit = getReadlineHistoryLimit(state);
  if (limit <= 0) return value;
  const history = getReadlineHistoryArray(state);
  if (history[0] === value) {
    state.historyIndex = -1;
    state.historyNavigationLine = "";
    return value;
  }
  if (state.removeHistoryDuplicates) {
    for (let index = history.length - 1; index >= 0; index--) {
      if (history[index] === value) history.splice(index, 1);
    }
  }
  history.unshift(value);
  if (history.length > limit) history.length = limit;
  state.historyIndex = -1;
  state.historyNavigationLine = "";
  return value;
}

function moveReadlineHistoryPrev(target) {
  const state = getReadlineHistoryState(target);
  const history = getReadlineHistoryArray(state);
  if (history.length === 0) return undefined;
  if (!Number.isInteger(state.historyIndex)) state.historyIndex = -1;
  if (state.historyIndex === -1) {
    state.historyNavigationLine = "";
    state.historyIndex = target.line !== "" && target.line === history[0] ? 1 : 0;
  } else if (state.historyIndex < history.length) {
    state.historyIndex += 1;
  }
  if (state.historyIndex >= history.length) {
    state.historyIndex = history.length;
    applyReadlineHistoryLine(target, state.historyNavigationLine);
    return undefined;
  }
  applyReadlineHistoryLine(target, history[state.historyIndex]);
  return undefined;
}

function moveReadlineHistoryNext(target) {
  const state = getReadlineHistoryState(target);
  const history = getReadlineHistoryArray(state);
  if (history.length === 0) return undefined;
  if (!Number.isInteger(state.historyIndex) || state.historyIndex === -1) return undefined;
  if (state.historyIndex === 0) {
    state.historyIndex = -1;
    applyReadlineHistoryLine(target, state.historyNavigationLine);
    return undefined;
  }
  state.historyIndex -= 1;
  applyReadlineHistoryLine(target, history[state.historyIndex]);
  return undefined;
}

function applyReadlineHistoryLine(target, line) {
  target.line = String(line ?? "");
  target.cursor = target.line.length;
}

function createReadlineProbeMethod(name, length, implementation) {
  const method = {
    method(...args) {
      return implementation.apply(this, args);
    }
  }.method;
  Object.defineProperty(method, "name", { configurable: true, value: name });
  Object.defineProperty(method, "length", { configurable: true, value: length });
  return method;
}

function createConstructableReadlineProbe(name, length, implementation) {
  const method = function (...args) {
    return implementation.apply(this, args);
  };
  Object.defineProperty(method, "name", { configurable: true, value: name });
  Object.defineProperty(method, "length", { configurable: true, value: length });
  return method;
}

function normalizeQuestionArgs(options, callback) {
  if (typeof options === "function") {
    return { signal: undefined, callback: options };
  }
  if (typeof callback !== "function") {
    throw Object.assign(new TypeError("The \"callback\" argument must be of type function"), {
      code: "ERR_INVALID_ARG_TYPE"
    });
  }
  return { signal: options?.signal, callback };
}

function normalizeCreateInterfaceArgs(input, output, completer, terminal) {
  if (output === undefined && completer === undefined && terminal === undefined && shouldTreatAsOptionsObject(input)) {
    return input ?? {};
  }
  return { input, output, completer, terminal };
}

function shouldTreatAsOptionsObject(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object") return false;
  for (const name of [
    "input",
    "output",
    "completer",
    "terminal",
    "historySize",
    "prompt",
    "crlfDelay",
    "escapeCodeTimeout",
    "removeHistoryDuplicates",
    "tabSize"
  ]) {
    if (name in value) return true;
  }
  return !isReadableLike(value);
}

function isReadableLike(value) {
  return typeof value?.on === "function"
    || typeof value?.read === "function"
    || typeof value?.resume === "function"
    || typeof value?.pause === "function";
}

function createAbortError(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function validateIntegerArgument(name, value) {
  if (typeof value !== "number") {
    throw createInvalidArgTypeError(name, "number", value);
  }
  if (!Number.isInteger(value)) {
    throw withNodeErrorString(
      new RangeError(`The value of "${name}" is out of range. It must be an integer. Received ${value}`),
      "ERR_OUT_OF_RANGE"
    );
  }
}

function createInvalidArgTypeError(name, expected, value) {
  const expectedPhrase = expected.startsWith("an instance of") ? expected : `of type ${expected}`;
  return withNodeErrorString(
    new TypeError(`The "${name}" argument must be ${expectedPhrase}. Received ${formatReceivedValue(value)}`),
    "ERR_INVALID_ARG_TYPE"
  );
}

function createInvalidPropertyTypeError(name, expected, value) {
  const expectedPhrase = expected.startsWith("an instance of") ? expected : `of type ${expected}`;
  return withNodeErrorString(
    new TypeError(`The "${name}" property must be ${expectedPhrase}. Received ${formatReceivedValue(value)}`),
    "ERR_INVALID_ARG_TYPE"
  );
}

function invalidCursorArgument(name, value) {
  return Object.assign(new TypeError(`The argument '${name}' is invalid. Received ${value}`), {
    code: "ERR_INVALID_ARG_VALUE"
  });
}

function withNodeErrorString(error, code) {
  error.code = code;
  Object.defineProperty(error, "toString", {
    configurable: true,
    value() {
      return `${this.name} [${code}]: ${this.message}`;
    }
  });
  return error;
}

function clampCursor(cursor, lineLength) {
  if (!Number.isInteger(cursor)) return lineLength;
  return Math.min(Math.max(cursor, 0), lineLength);
}

function findPreviousWordBoundary(line, cursor) {
  let index = clampCursor(cursor, line.length);
  while (index > 0 && /\s/.test(line[index - 1])) index--;
  while (index > 0 && !/\s/.test(line[index - 1])) index--;
  return index;
}

function findNextWordBoundary(line, cursor) {
  let index = clampCursor(cursor, line.length);
  while (index < line.length && /\s/.test(line[index])) index++;
  while (index < line.length && !/\s/.test(line[index])) index++;
  return index;
}

function normalizeColumns(value) {
  const columns = Number(value);
  return Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 0;
}

function formatReceivedValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `type string ('${value}')`;
  if (typeof value === "boolean") return `type boolean (${value})`;
  if (typeof value === "object") return `an instance of ${value.constructor?.name ?? "Object"}`;
  return `type ${typeof value}`;
}

function writeControlSequence(stream, sequence, callback) {
  validateCallbackArgument(callback);
  if (!sequence) {
    callback?.();
    return true;
  }
  if (typeof stream?.write === "function") return stream.write(sequence, callback);
  callback?.();
  return true;
}

function validateCallbackArgument(callback) {
  if (callback === undefined || typeof callback === "function") return;
  throw createInvalidArgTypeError("callback", "function", callback);
}

function writeControlSequenceAsync(stream, sequence) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    try {
      const result = stream.write(sequence, settle);
      if (result !== false) queueMicrotask(() => settle());
    } catch (error) {
      settle(error);
    }
  });
}

function clearLineSequence(direction = 0) {
  const mode = direction < 0 ? 1 : direction > 0 ? 0 : 2;
  return `\x1b[${mode}K`;
}

function cursorToSequence(x, y) {
  const column = Math.max(0, Number(x) || 0);
  if (typeof y === "number") {
    const row = Math.max(0, Number(y) || 0);
    return `\x1b[${row + 1};${column + 1}H`;
  }
  return `\x1b[${column + 1}G`;
}

function moveCursorSequence(dx, dy) {
  let sequence = "";
  const deltaY = Number(dy) || 0;
  const deltaX = Number(dx) || 0;
  if (deltaX < 0) sequence += `\x1b[${Math.abs(deltaX)}D`;
  if (deltaX > 0) sequence += `\x1b[${deltaX}C`;
  if (deltaY < 0) sequence += `\x1b[${Math.abs(deltaY)}A`;
  if (deltaY > 0) sequence += `\x1b[${deltaY}B`;
  return sequence;
}

function createEscapeKey(sequence) {
  const code = sequence.slice(1);
  const names = {
    "[A": "up",
    "[B": "down",
    "[C": "right",
    "[D": "left",
    "[H": "home",
    "[F": "end"
  };
  return {
    sequence,
    name: names[code] ?? "escape",
    ctrl: false,
    meta: false,
    shift: false,
    code
  };
}

function createCharacterKey(char) {
  const code = char.charCodeAt(0);
  if (char === "\r" || char === "\n") return key(char, "return");
  if (char === "\t") return key(char, "tab");
  if (char === "\b" || char === "\x7f") return key(char, "backspace");
  if (char === "\x1b") return key(char, "escape");
  if (char === " ") return key(char, "space");
  if (code > 0 && code <= 26) {
    return key(char, String.fromCharCode(code + 96), { ctrl: true });
  }
  return key(char, char.toLowerCase(), {
    shift: char.length === 1 && char >= "A" && char <= "Z"
  });
}

function key(sequence, name, extra = {}) {
  return {
    sequence,
    name,
    ctrl: false,
    meta: false,
    shift: false,
    ...extra
  };
}
