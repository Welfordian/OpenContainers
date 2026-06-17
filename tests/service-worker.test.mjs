import assert from "node:assert/strict";
import test from "node:test";
import { dispatchPreviewRequest, parsePreviewUrl } from "../packages/service-worker/src/http-dispatch.js";
import { injectPreviewClient } from "../packages/service-worker/src/preview-rewriter.js";

test("preview URLs carry project and optional port", () => {
  assert.deepEqual(parsePreviewUrl("https://run.welford.local/p/demo:5173/src/main.js?x=1"), {
    projectId: "demo",
    port: 5173,
    path: "/src/main.js",
    search: "?x=1"
  });
});

test("preview rewriter injects client once", () => {
  const html = "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const once = injectPreviewClient(html, { projectId: "demo", defaultPort: 5173 });
  const twice = injectPreviewClient(once, { projectId: "demo", defaultPort: 5173 });
  assert.match(once, /__WELFORD_PREVIEW__/);
  assert.equal(twice, once);
});

test("preview dispatch leaves implicit ports unset for kernel-side detection", async () => {
  const requests = [];
  const response = await dispatchPreviewRequest({
    kernel: {
      dispatchHttpRequest(request) {
        requests.push(request);
        return { status: 200, headers: [], body: "" };
      }
    },
    request: new Request("https://run.welford.local/p/demo/")
  });

  assert.equal(response.status, 200);
  assert.equal(requests[0].projectId, "demo");
  assert.equal(requests[0].port, undefined);
});
