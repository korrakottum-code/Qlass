import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const flagModule = readFileSync(new URL("../src/utils/serverQueueCreate.js", import.meta.url), "utf8");

test("Goal 13 server queue create fails closed unless explicitly enabled", () => {
  assert.match(flagModule, /VITE_USE_SERVER_QUEUE_CREATE === "true"/);
  assert.match(flagModule, /parseStaffAllowlist\(import\.meta\.env\.VITE_SERVER_QUEUE_CREATE_STAFF_IDS\)/);
});

test("Goal 13 keeps every non-gated Booking flow on the established writer", () => {
  // Reschedule, bulk booking, Timeline booking, and the flag-off Booking path
  // all still use the direct writer.
  assert.ok((app.match(/await createQueue\(/g) ?? []).length >= 3);
  // The server path exists exactly once and only behind the explicit gate.
  assert.equal((app.match(/createQueueOnServer\(/g) ?? []).length, 1);
  // submitForm = form plus deliberate pre-gate overrides (waiting-queue revert,
  // same-day auto-confirm) — the gate itself is unchanged and still evaluated once.
  assert.match(app, /const useServerCreate = !editingQueueId && shouldUseServerQueueCreate\(currentUser, submitForm\)/);
});

test("Goal 13 booking save never falls back to direct insert after a server rejection", () => {
  const catchBlock = app.match(/} catch \(error\) \{\s*console\.error\("Booking save failed:"[\s\S]*?return false;\s*\}/);
  assert.ok(catchBlock, "booking save catch block not found");
  assert.doesNotMatch(catchBlock[0], /createQueue\(/);
  assert.doesNotMatch(catchBlock[0], /createQueueOnServer\(/);
  // A business rejection ends the attempt's request ID; a transport failure
  // keeps it so an idempotent retry cannot create a duplicate queue.
  assert.match(catchBlock[0], /serverQueueRequestIdRef\.current = null/);
});
