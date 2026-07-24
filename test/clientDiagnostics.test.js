import test from "node:test";
import assert from "node:assert/strict";
import {
  discardClientDiagnostics,
  getClientDiagnostics,
  recordClientDiagnostic,
  resetClientDiagnosticsForTest,
} from "../src/utils/clientDiagnostics.js";

test("client diagnostics keeps only its explicit allowlist and never stores error text", () => {
  resetClientDiagnosticsForTest();
  recordClientDiagnostic("initial_load", {
    stage: "core",
    outcome: "failed",
    durationMs: 99,
    phone: "0812345678",
    hn: "HN-123",
    error: { name: "TypeError", message: "customer 0812345678 failed" },
  });

  const [event] = getClientDiagnostics();
  assert.deepEqual(Object.keys(event).sort(), ["at", "durationMs", "errorKind", "name", "outcome", "release", "stage"]);
  assert.equal(event.errorKind, "TypeError");
  assert.equal(JSON.stringify(event).includes("0812345678"), false);
  assert.equal(JSON.stringify(event).includes("HN-123"), false);
});

test("discarding accepted diagnostics preserves newer local events", () => {
  resetClientDiagnosticsForTest();
  recordClientDiagnostic("initial_load", { stage: "staff", outcome: "succeeded" });
  recordClientDiagnostic("realtime_status", { status: "SUBSCRIBED" });
  discardClientDiagnostics(1);

  const events = getClientDiagnostics();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "realtime_status");
});
