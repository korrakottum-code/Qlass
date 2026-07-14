import assert from "node:assert/strict";
import test from "node:test";
import { canViewAllBranchesForRoles, filterItemsByBranch } from "../src/utils/accessControl.js";
import { lookupHnCustomers, selectHnLookupFunction } from "../src/utils/hnLookup.js";
import { reconcileRealtimeQueue } from "../src/utils/realtimeQueueState.js";
import { buildRescheduledQueue } from "../src/utils/rescheduleQueue.js";
import { createSessionApi } from "../src/utils/sessionApi.js";
import { filterQueuesForExport } from "../src/utils/exportFilters.js";
import { buildQueueStatusUpdate } from "../src/utils/queueStatusUpdate.js";

test("server-session login forwards only the login action and fails closed on server errors", async () => {
  const calls = [];
  const api = createSessionApi(async (name, options) => {
    calls.push({ name, options });
    return { data: { user: { id: "staff-1" }, session: { token: "session-token" } }, error: null };
  });
  const result = await api.loginWithPin("staff-1", "1234");
  assert.equal(result.user.id, "staff-1");
  assert.deepEqual(calls, [{ name: "staff-session", options: { body: { action: "login", staffId: "staff-1", pin: "1234" } } }]);

  const denied = createSessionApi(async () => ({ data: { error: "invalid_pin" }, error: null }));
  await assert.rejects(denied.loginWithPin("staff-1", "bad"), /invalid_pin/);

  let revokeAttempted = false;
  const revoking = createSessionApi(async () => {
    revokeAttempted = true;
    throw new Error("network unavailable");
  });
  await assert.doesNotReject(revoking.revokeServerSession("session-token"));
  assert.equal(revokeAttempted, true);
});

test("reschedule payload preserves the original queue data and never mutates it", () => {
  const original = { id: "q1", createdAt: "2026-07-01", status: "confirmed", statusNote: "old", statusUpdatedAt: "x", recordedBy: "staff-1", name: "Customer", date: "2026-07-15", timeBlock: 144, branchId: "b1" };
  const next = buildRescheduledQueue(original, { date: "2026-07-16", timeBlock: 156, statusNote: "moved" }, "2026-07-15");
  assert.deepEqual(next, { recordedBy: "staff-1", name: "Customer", date: "2026-07-16", timeBlock: 156, branchId: "b1", status: "rescheduled_in", statusNote: "moved", createdAt: "2026-07-15" });
  assert.equal(original.status, "confirmed");
  assert.equal(buildRescheduledQueue(original, {}, "2026-07-15"), null);
});

test("a failed reschedule continuation cannot overwrite source booking fields", async () => {
  const original = { id: "q1", name: "Customer", phone: "0812345678", date: "2026-07-15", timeBlock: 144, price: 1990, recordedBy: "staff-1" };
  const sourceUpdate = buildQueueStatusUpdate({ status: "rescheduled", statusNote: "move" }, "2026-07-15T10:00:00.000Z");
  assert.deepEqual(sourceUpdate, {
    status: "rescheduled",
    status_note: "move",
    status_updated_at: "2026-07-15T10:00:00.000Z",
  });

  await assert.rejects(async () => {
    const continuation = buildRescheduledQueue(original, { date: "2026-07-16" }, "2026-07-15");
    assert.ok(continuation);
    throw new Error("continuation write failed");
  }, /continuation write failed/);
  assert.deepEqual(original, { id: "q1", name: "Customer", phone: "0812345678", date: "2026-07-15", timeBlock: 144, price: 1990, recordedBy: "staff-1" });
});

test("realtime reconciliation deduplicates inserts, updates missed rows, and removes deletes", () => {
  const first = { id: "q1", status: "pending" };
  const second = { id: "q2", status: "pending" };
  assert.deepEqual(reconcileRealtimeQueue([first], "INSERT", first), [first]);
  assert.deepEqual(reconcileRealtimeQueue([first], "UPDATE", second), [first, second]);
  assert.deepEqual(reconcileRealtimeQueue([first, second], "UPDATE", { ...first, status: "done" }), [{ id: "q1", status: "done" }, second]);
  assert.deepEqual(reconcileRealtimeQueue([first, second], "DELETE", first), [second]);
});

test("branch roles and HN client contract fail closed", async () => {
  const roles = [{ value: "admin", branchScope: "all" }, { value: "manager", branchScope: "own" }];
  const allBranchesUser = { role: "admin" };
  const oneBranchUser = { role: "manager", branchId: "b1" };
  assert.equal(canViewAllBranchesForRoles(allBranchesUser, roles), true);
  assert.deepEqual(filterItemsByBranch([{ branchId: "b1" }, { branchId: "b2" }], oneBranchUser, "branchId", roles), [{ branchId: "b1" }]);
  assert.equal(selectHnLookupFunction("unexpected-function"), "search-hn");

  let called = false;
  const denied = await lookupHnCustomers({
    query: "0812345678",
    requestedFunction: "search-hn-recovery",
    token: "invalid-session",
    invoke: async () => { called = true; return { data: { error: "invalid_session" }, error: null }; },
  });
  assert.equal(called, true);
  assert.deepEqual(denied, []);
});

test("export filtering retains every eligible historical queue and excludes only declared categories", () => {
  const queues = [
    { id: "within-range", date: "2026-07-15", branchId: "b1", customerType: "new", status: "pending" },
    { id: "done-old", date: "2026-07-10", branchId: "b1", customerType: "old", status: "done" },
    { id: "course", date: "2026-07-15", branchId: "b1", customerType: "course", status: "done" },
    { id: "other-branch", date: "2026-07-15", branchId: "b2", customerType: "new", status: "done" },
    { id: "missing-date", branchId: "b1", customerType: "new", status: "done" },
  ];
  assert.deepEqual(
    filterQueuesForExport(queues, { startDate: "2026-07-01", endDate: "2026-07-31", branchId: "b1", includeCourse: false }).map((queue) => queue.id),
    ["within-range", "done-old"],
  );
  assert.deepEqual(
    filterQueuesForExport(queues, { branchId: "b1", onlyDone: true }).map((queue) => queue.id),
    ["done-old", "course"],
  );
});
