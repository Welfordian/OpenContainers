import { KernelWorkerHost } from "./kernel-worker-host.js";

const host = new KernelWorkerHost({
  postMessage: (message) => self.postMessage(message)
});

if (typeof self !== "undefined") {
  self.addEventListener("message", (event) => {
    if (event.data?.type === "OPENCONTAINERS_ATTACH_PORT") {
      const port = event.ports?.[0] ?? event.data.port;
      if (!port) return;
      port.onmessage = (portEvent) => {
        host.handleMessage(portEvent.data, (message) => port.postMessage(message));
      };
      port.start?.();
      return;
    }
    host.handleMessage(event.data, (message) => self.postMessage(message));
  });
}

export { host };
