import { ProcessWorkerHost } from "./process-worker-host.js";

const host = new ProcessWorkerHost({
  postMessage: (message) => self.postMessage(message)
});

self.addEventListener("message", (event) => {
  host.handleMessage(event.data);
});

export { host };
