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
  }

  #prompt;
  #question;

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
    this.output?.write?.(query);
    this.#question = callback;
  }

  write(data) {
    const text = String(data);
    for (const char of text) {
      if (char === "\r") continue;
      if (char === "\n") {
        const line = this.line;
        this.line = "";
        if (this.#question) {
          const callback = this.#question;
          this.#question = null;
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
    this.emit("close");
  }

  pause() {
    return this;
  }

  resume() {
    return this;
  }
}

export function createInterface(options) {
  return new Interface(options);
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

export default {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor
};
