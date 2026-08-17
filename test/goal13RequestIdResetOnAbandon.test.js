import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression coverage for a real bug found reviewing PR #137: closing a
// booking draft without a successful save (Cancel / clear form / backdrop
// click / ✕) left the Goal 13 request-id ref populated. The *next* booking
// attempt — for a different customer — then reused that stale request ID.
// If the original failed request had actually landed server-side despite a
// transport error, create_queue_v1's idempotency check silently returns the
// OLD queue instead of creating one for the new customer: the UI shows
// "บันทึกคิวเรียบร้อย ✓" while the second customer's booking is never written.

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const bookingPage = readFileSync(new URL("../src/pages/BookingPage.jsx", import.meta.url), "utf8");
const timelinePage = readFileSync(new URL("../src/pages/TimelinePage.jsx", import.meta.url), "utf8");

test("App wires an abandon-draft reset into both request-id refs", () => {
  assert.match(app, /onAbandonDraft=\{\(\) => \{ serverQueueRequestIdRef\.current = null; \}\}/);
  assert.match(app, /onAbandonDraft=\{\(\) => \{ timelineServerQueueRequestIdRef\.current = null; \}\}/);
});

test("Booking page resets the request id when the draft is cleared, not just on success/rejection", () => {
  assert.match(bookingPage, /onAbandonDraft/);
  const handleClear = bookingPage.match(/function handleClear\(\) \{[\s\S]*?\n  \}/);
  assert.ok(handleClear, "handleClear not found");
  assert.match(handleClear[0], /onAbandonDraft\?\.\(\)/);
});

test("Timeline popup resets the request id on every dismissal path, not just success", () => {
  const closeHelper = timelinePage.match(/function closeBookingForm\(\) \{[\s\S]*?\n  \}/);
  assert.ok(closeHelper, "closeBookingForm helper not found");
  assert.match(closeHelper[0], /onAbandonDraft\?\.\(\)/);
  assert.match(closeHelper[0], /setBookingForm\(null\)/);

  // All three dismissal points (backdrop click, ✕, "ยกเลิก") must route
  // through the helper — a raw setBookingForm(null) on any of them would
  // silently reopen the same hole this test guards against.
  assert.match(timelinePage, /onClick=\{closeBookingForm\}>/); // backdrop
  assert.match(timelinePage, /onClick=\{closeBookingForm\}[^>]*>✕<\/button>/); // header ✕
  assert.match(timelinePage, /"ยกเลิก"\}?\s*onClick=\{closeBookingForm\}|onClick=\{closeBookingForm\}>ยกเลิก</); // cancel button

  // The success path is a *different*, already-correct reset (App's
  // onSubmitBooking clears the ref itself right after a successful server
  // create) — it must stay a plain setBookingForm(null), not double up on
  // onAbandonDraft after the ref is already gone.
  const successClose = timelinePage.match(/if \(submission\.started && submission\.result\) setBookingForm\(null\);/);
  assert.ok(successClose, "success-path close not found or was changed");
});
