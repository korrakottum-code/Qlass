import assert from "node:assert/strict";
import test from "node:test";
import {
  getClientDiagnostics,
  recordClientDiagnostic,
  resetClientDiagnosticsForTest,
} from "../src/utils/clientDiagnostics.js";

test("diagnostics allowlist metadata and never retain error messages or arbitrary fields", () => {
  resetClientDiagnosticsForTest();
  const error = new TypeError("PIN 1614 for Somchai / HN KR123 should never be retained");
  recordClientDiagnostic("initial_load", {
    stage: "core",
    outcome: "failed",
    durationMs: 41.7,
    error,
    pin: "1614",
    customerName: "Somchai",
    hn: "KR123",
    token: "secret",
  });

  const [event] = getClientDiagnostics();
  assert.deepEqual(
    Object.keys(event).sort(),
    ["at", "durationMs", "errorKind", "name", "outcome", "release", "stage"],
  );
  assert.equal(event.errorKind, "TypeError");
  assert.equal(event.durationMs, 42);
  assert.doesNotMatch(JSON.stringify(event), /1614|Somchai|KR123|secret|PIN/i);
});

test("diagnostics reject unknown events and keep a bounded buffer", () => {
  resetClientDiagnosticsForTest();
  assert.equal(recordClientDiagnostic("unknown_event", { anything: "no" }), null);
  for (let index = 0; index < 55; index += 1) {
    recordClientDiagnostic("write_outcome", { outcome: "succeeded" });
  }
  assert.equal(getClientDiagnostics().length, 50);
});
