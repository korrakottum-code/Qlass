import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("Goal 13 leaves every Booking create flow on the established writer until an opt-in cutover", () => {
  assert.match(app, /createQueue, updateQueue/);
  assert.doesNotMatch(app, /\bcreateQueueV1\b/);
  assert.ok((app.match(/await createQueue\(/g) ?? []).length >= 2);
});
