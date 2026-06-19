import { EventEmitter } from "./events.js";

export class Interface extends EventEmitter {
  constructor(options = {}) {
    super();
    this.input = options.input;
    this.output = options.output;
    this.terminal = Boolean(options.terminal);
    this.closed = false;
    this.line = "";
    this.#prompt = options.prompt ?? "> ";
    this.#question = null;
    this.#questionRefed = false;
    this.#onInputData = (chunk) => this.write(chunk);
    this.input?.on?.("data", this.#onInputData);
  }

  #prompt;
  #question;
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

  question(query, callback) {
    this.#refQuestion();
    this.#question = callback;
    this.output?.write?.(query);
  }

  write(data) {
    const text = typeof data === "string" ? data : data?.toString?.() ?? String(data);
    for (const char of text) {
      if (char === "\r") continue;
      if (char === "\n") {
        const line = this.line;
        this.line = "";
        if (this.#question) {
          const callback = this.#question;
          this.#question = null;
          this.#unrefQuestion();
          callback(line);
        }
        this.emit("line", line);
      } else {
        this.line += char;
      }
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.#question = null;
    this.#unrefQuestion();
    this.input?.off?.("data", this.#onInputData);
    this.input?.removeListener?.("data", this.#onInputData);
    this.emit("close");
  }

  pause() {
    return this;
  }

  resume() {
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
}

export function createInterface(options) {
  return new Interface(options);
}

export class PromisesInterface extends Interface {
  question(query, options = {}) {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener?.("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(createAbortError(signal.reason));
      };

      signal?.addEventListener?.("abort", onAbort, { once: true });
      super.question(query, (answer) => {
        cleanup();
        resolve(answer);
      });
    });
  }
}

export function createPromisesInterface(options) {
  return new PromisesInterface(options);
}

export function clearLine(stream, direction, callback) {
  return stream?.clearLine?.(direction, callback) ?? true;
}

export function clearScreenDown(stream, callback) {
  return stream?.clearScreenDown?.(callback) ?? true;
}

export function cursorTo(stream, x, y, callback) {
  return stream?.cursorTo?.(x, y, callback) ?? true;
}

export function moveCursor(stream, dx, dy, callback) {
  return stream?.moveCursor?.(dx, dy, callback) ?? true;
}

export const promises = {
  Interface: PromisesInterface,
  createInterface: createPromisesInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor
};

const readlineBuiltin = {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
  promises
};

export default readlineBuiltin;

function createAbortError(reason) {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  if (reason !== undefined) error.cause = reason;
  return error;
}
