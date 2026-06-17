const HEADER_INTS = 4;
const HEADER_BYTES = HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const STATE = 0;
const REQUEST_LENGTH = 1;
const RESPONSE_LENGTH = 2;

export const MailboxState = {
  idle: 0,
  request: 1,
  response: 2
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class SyscallMailbox {
  constructor(buffer) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new TypeError("SyscallMailbox requires a SharedArrayBuffer");
    }
    this.buffer = buffer;
    this.control = new Int32Array(buffer, 0, HEADER_INTS);
    this.payload = new Uint8Array(buffer, HEADER_BYTES);
  }

  static create(payloadBytes = 1024 * 1024) {
    return new SyscallMailbox(new SharedArrayBuffer(HEADER_BYTES + payloadBytes));
  }

  submitSync(request, timeoutMs = 30_000) {
    this.#writeJson(request, REQUEST_LENGTH);
    Atomics.store(this.control, STATE, MailboxState.request);
    Atomics.notify(this.control, STATE);

    const waitResult = Atomics.wait(this.control, STATE, MailboxState.request, timeoutMs);
    if (waitResult === "timed-out") {
      throw Object.assign(new Error("Timed out waiting for syscall response"), {
        code: "ERR_WELFORD_SYSCALL_TIMEOUT"
      });
    }

    const envelope = this.#readJson(RESPONSE_LENGTH);
    Atomics.store(this.control, STATE, MailboxState.idle);
    Atomics.notify(this.control, STATE);
    if (!envelope.ok) {
      throw Object.assign(new Error(envelope.error?.message ?? "Syscall failed"), envelope.error ?? {});
    }
    return envelope.value;
  }

  waitForRequest(timeoutMs = 30_000) {
    const waitResult = Atomics.wait(this.control, STATE, MailboxState.idle, timeoutMs);
    if (waitResult === "timed-out") return null;
    if (Atomics.load(this.control, STATE) !== MailboxState.request) return null;
    return this.#readJson(REQUEST_LENGTH);
  }

  respond(value) {
    this.#writeJson({ ok: true, value }, RESPONSE_LENGTH);
    Atomics.store(this.control, STATE, MailboxState.response);
    Atomics.notify(this.control, STATE);
  }

  respondError(error) {
    this.#writeJson({
      ok: false,
      error: {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      }
    }, RESPONSE_LENGTH);
    Atomics.store(this.control, STATE, MailboxState.response);
    Atomics.notify(this.control, STATE);
  }

  #writeJson(value, lengthSlot) {
    const bytes = encoder.encode(JSON.stringify(value));
    if (bytes.byteLength > this.payload.byteLength) {
      throw Object.assign(new Error(`Syscall payload is too large: ${bytes.byteLength} bytes`), {
        code: "ERR_WELFORD_SYSCALL_PAYLOAD_TOO_LARGE"
      });
    }
    this.payload.fill(0);
    this.payload.set(bytes);
    Atomics.store(this.control, lengthSlot, bytes.byteLength);
  }

  #readJson(lengthSlot) {
    const length = Atomics.load(this.control, lengthSlot);
    const bytes = this.payload.slice(0, length);
    return JSON.parse(decoder.decode(bytes));
  }
}
