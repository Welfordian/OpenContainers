import assert from "node:assert/strict";
import test from "node:test";
import { selectVersion } from "../packages/npm/src/semver.js";

function metadata(versions, distTags = {}) {
  return {
    name: "demo",
    "dist-tags": { latest: versions.at(-1), ...distTags },
    versions: Object.fromEntries(versions.map(version => [version, { version }]))
  };
}

test("selectVersion resolves compound comparator ranges", () => {
  const selected = selectVersion(metadata(["1.0.0", "2.1.1", "2.1.2", "2.3.0", "3.0.0"]), ">=2.1.2 <3.0.0");
  assert.equal(selected, "2.3.0");
});

test("selectVersion resolves caret, tilde, partial, wildcard, and tagged ranges", () => {
  const demo = metadata(["1.0.0", "1.2.3", "1.2.4", "1.3.0", "2.0.0"], { beta: "2.0.0" });

  assert.equal(selectVersion(demo, "^1.2.3"), "1.3.0");
  assert.equal(selectVersion(demo, "~1.2.3"), "1.2.4");
  assert.equal(selectVersion(demo, "1.2"), "1.2.4");
  assert.equal(selectVersion(demo, "1.x"), "1.3.0");
  assert.equal(selectVersion(demo, "*"), "2.0.0");
  assert.equal(selectVersion(demo, "beta"), "2.0.0");
});
