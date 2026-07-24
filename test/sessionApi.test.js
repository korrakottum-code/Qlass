import test from "node:test";
import assert from "node:assert/strict";
import { createSessionApi } from "../src/utils/sessionApi.js";

test("queue-create API forwards one caller-provided idempotency key and payload", async () => {
  const calls = [];
  const api = createSessionApi(async (name, options) => {
    calls.push({ name, options });
    return { data: { queue: { id: "queue-1" } }, error: null };
  });

  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const queue = { branch_id: "branch-1", name: "test", phone: "000" };
  const result = await api.createQueueV1("a".repeat(64), requestId, queue);

  assert.deepEqual(result, { queue: { id: "queue-1" } });
  assert.deepEqual(calls, [{
    name: "staff-session",
    options: { body: { action: "create_queue_v1", token: "a".repeat(64), requestId, queue } },
  }]);
});

test("queue-create API surfaces server errors without retrying under a new request id", async () => {
  const api = createSessionApi(async () => ({ data: { error: "room_conflict" }, error: null }));
  await assert.rejects(
    () => api.createQueueV1("a".repeat(64), "123e4567-e89b-42d3-a456-426614174000", {}),
    /room_conflict/,
  );
});

test("operational API forwards diagnostics and release checks through the server session boundary", async () => {
  const calls = [];
  const api = createSessionApi(async (name, options) => {
    calls.push({ name, options });
    return { data: { accepted: 1, refreshRequired: false }, error: null };
  });

  const token = "b".repeat(64);
  const events = [{ name: "initial_load", release: "release-1", stage: "core", outcome: "succeeded", durationMs: 12 }];
  await api.flushClientDiagnostics(token, events);
  await api.getReleaseStatus(token, "release-1");

  assert.deepEqual(calls, [
    { name: "staff-session", options: { body: { action: "client_diagnostics", token, events } } },
    { name: "staff-session", options: { body: { action: "release_status", token, release: "release-1" } } },
  ]);
});
