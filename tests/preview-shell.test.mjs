import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewShell } from "../packages/ui/src/preview-shell.js";

test("preview shell uses a same-origin outer frame with a nested sandboxed document", () => {
  const shell = buildPreviewShell({ previewUrl: "https://run.welford.local/p/demo/" });

  assert.match(shell, /welford-preview-document/);
  assert.match(shell, /sandbox="allow-scripts allow-forms allow-popups allow-downloads"/);
  assert.doesNotMatch(shell, /allow-same-origin/);
  assert.match(shell, /handleFetchRequest/);
  assert.match(shell, /window\.parent\.postMessage/);
});
