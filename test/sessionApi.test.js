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
