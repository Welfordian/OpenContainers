let nextTimerId = 1;

export function createTimerApi({ process } = {}) {
  const setTimeoutCompat = (callback, delay = 0, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "timeout", process, callback, args, delay });
    handle.start();
    return handle;
  };

  const setIntervalCompat = (callback, delay = 0, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "interval", process, callback, args, delay, repeat: true });
    handle.start();
    return handle;
  };

  const setImmediateCompat = (callback, ...args) => {
    const handle = new OpenContainersTimerHandle({ kind: "immediate", process, callback, args, delay: 0 });
    handle.start();
    return handle;
  };

  const clearTimer = (handle) => {
    if (handle instanceof OpenContainersTimerHandle) {
      handle.close();
      return;
    }
    globalThis.clearTimeout(handle);
    globalThis.clearInterval(handle);
  };

  return {
    clearImmediate: clearTimer,
    clearInterval: clearTimer,
    clearTimeout: clearTimer,
    setImmediate: setImmediateCompat,
    setInterval: setIntervalCompat,
    setTimeout: setTimeoutCompat,
    builtin: {
      clearImmediate: clearTimer,
      clearInterval: clearTimer,
      clearTimeout: clearTimer,
      setImmediate: setImmediateCompat,
      setInterval: setIntervalCompat,
      setTimeout: setTimeoutCompat
    },
    promisesBuiltin: {
      setImmediate: (value) => new Promise(resolve => setImmediateCompat(() => resolve(value))),
      setInterval: async function* timersPromisesSetInterval(delay = 1, value) {
        while (true) {
          await new Promise(resolve => setTimeoutCompat(resolve, delay));
          yield value;
        }
      },
      setTimeout: (delay = 1, value) => new Promise(resolve => setTimeoutCompat(() => resolve(value), delay))
    }
  };
}

class OpenContainersTimerHandle {
  constructor({ kind, process, callback, args = [], delay = 0, repeat = false }) {
    this.kind = kind;
    this.process = process;
    this.callback = typeof callback === "function" ? callback : () => {};
    this.args = args;
    this.delay = Number(delay) || 0;
    this.repeat = repeat;
    this.id = nextTimerId++;
    this.active = true;
    this.refed = true;
    this.refreshedDuringCallback = false;
    this.process?.__opencontainersAddRef?.();
    this.disposeExitHook = this.process?.__opencontainersOnExit?.(() => this.close({ releaseRef: false }));
  }

  start() {
    if (this.kind === "interval") this.nativeHandle = globalThis.setInterval(() => this.fire(), this.delay);
    else this.nativeHandle = globalThis.setTimeout(() => this.fire(), this.delay);
  }

  clearNativeHandle() {
    if (this.kind === "interval") globalThis.clearInterval(this.nativeHandle);
    else globalThis.clearTimeout(this.nativeHandle);
    this.nativeHandle = null;
  }

  fire() {
    if (!this.active) return;
    if (this.process?.__opencontainersIsAlive?.() === false) {
      this.close();
      return;
    }
    this.refreshedDuringCallback = false;
    try {
      this.callback(...this.args);
    } catch (error) {
      this.process?.stderr?.write?.(`${error?.stack ?? error?.message ?? error}\n`);
      this.process.exitCode = 1;
      this.close();
      return;
    }
    if (!this.repeat && !this.refreshedDuringCallback) this.close();
  }

  close({ releaseRef = true } = {}) {
    if (!this.active) return;
    this.active = false;
    this.clearNativeHandle();
    this.disposeExitHook?.();
    this.disposeExitHook = null;
    if (releaseRef && this.refed) {
      this.refed = false;
      this.process?.__opencontainersUnref?.();
    }
  }

  ref() {
    if (this.active && !this.refed) {
      this.refed = true;
      this.process?.__opencontainersAddRef?.();
    }
    return this;
  }

  unref() {
    if (this.active && this.refed) {
      this.refed = false;
      this.process?.__opencontainersUnref?.();
    }
    return this;
  }

  hasRef() {
    return this.refed;
  }

  refresh() {
    if (!this.active) return this;
    this.refreshedDuringCallback = true;
    this.clearNativeHandle();
    this.start();
    return this;
  }

  [Symbol.toPrimitive]() {
    return this.id;
  }
}
