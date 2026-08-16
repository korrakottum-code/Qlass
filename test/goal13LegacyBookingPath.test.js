import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const flagModule = readFileSync(new URL("../src/utils/serverQueueCreate.js", import.meta.url), "utf8");

test("Goal 13 server queue create fails closed unless explicitly enabled", () => {
  assert.match(flagModule, /VITE_USE_SERVER_QUEUE_CREATE === "true"/);
  assert.match(flagModule, /parseStaffAllowlist\(import\.meta\.env\.VITE_SERVER_QUEUE_CREATE_STAFF_IDS\)/);
});

test("Goal 13 keeps reschedule and bulk booking on the established writer unconditionally", () => {
  // Reschedule and AI-parsed bulk booking never evaluate the server-create
  // gate at all — they always use the direct writer.
  assert.ok((app.match(/await createQueue\(/g) ?? []).length >= 2);
  // The server path is gated at exactly two call sites: the Booking page form
  // and the Timeline mini-popup. Any other appearance is unreviewed scope creep.
  assert.equal((app.match(/createQueueOnServer\(/g) ?? []).length, 2);
  // submitForm = form plus deliberate pre-gate overrides (waiting-queue revert,
  // same-day auto-confirm) — the Booking page gate itself is unchanged.
  assert.match(app, /const useServerCreate = !editingQueueId && shouldUseServerQueueCreate\(currentUser, submitForm\)/);
  // Timeline's mini-popup only ever creates (no edit concept there), gated on
  // the same same-day-confirmed form the direct writer already used.
  assert.match(app, /const useServerCreate = shouldUseServerQueueCreate\(currentUser, sameDayConfirmed\)/);
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

test("Goal 13 Timeline booking save never falls back to direct insert after a server rejection", () => {
  const catchBlock = app.match(/} catch \(error\) \{\s*console\.error\("Timeline booking save failed:"[\s\S]*?return false;\s*\}/);
  assert.ok(catchBlock, "Timeline booking save catch block not found");
  assert.doesNotMatch(catchBlock[0], /await createQueue\(/);
  assert.doesNotMatch(catchBlock[0], /createQueueOnServer\(/);
  // Same idempotent-retry rule as the Booking page, using Timeline's own ref.
  assert.match(catchBlock[0], /timelineServerQueueRequestIdRef\.current = null/);
});

test("Timeline booking has its own request-id ref, independent from the Booking page's", () => {
  assert.match(app, /const timelineServerQueueRequestIdRef = useRef\(null\);/);
});
