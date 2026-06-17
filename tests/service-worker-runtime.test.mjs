import assert from "node:assert/strict";
import test from "node:test";
import { WelfordServiceWorkerRuntime } from "../packages/service-worker/src/sw-runtime.js";

test("Service Worker runtime dispatches preview requests through the kernel port and injects the preview client", async () => {
  const runtime = new WelfordServiceWorkerRuntime({ timeoutMs: 1000 });
  const port = {
    start() {},
    postMessage(message) {
      queueMicrotask(() => {
        port.onmessage({
          data: {
            type: "reply",
            requestId: message.id,
            payload: {
              ok: true,
              response: {
                status: 200,
                statusText: "OK",
                headers: [["content-type", "text/html"]],
                body: "<!doctype html><html><head></head><body>preview</body></html>",
                previewPort: 8000
              }
            }
          }
        });
      });
    }
  };
  runtime.connect(port);

  const response = await runtime.fetch(new Request("https://run.welford.local/p/demo/"));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /__WELFORD_PREVIEW__/);
  assert.match(html, /installPreviewClient/);
  assert.match(html, /"defaultPort":8000/);
  assert.match(html, /"parentOrigin":"https:\/\/run\.welford\.local"/);
  assert.doesNotMatch(html, /src="\/__welford\/preview-client\.js"/);
});
