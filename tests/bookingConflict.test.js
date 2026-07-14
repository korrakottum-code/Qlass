import assert from "node:assert/strict";
import test from "node:test";
import { checkFreshRoomBookingConflict, findRoomBookingConflict } from "../src/utils/bookingConflict.js";

const procedures = [{ id: "pico", blocks: 2 }, { id: "filler", blocks: 4 }];
const queues = [{
  id: "existing", procedureId: "pico", timeBlock: 120, durationBlocks: null,
}];

test("fresh room check reports a conflict using the procedure duration when the queue snapshot is null", async () => {
  const result = await checkFreshRoomBookingConflict({
    fetchQueues: async () => queues,
    roomId: "room-1",
    date: "2026-07-15",
    procedures,
    startBlock: 121,
    durationBlocks: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.conflict?.id, "existing");
});

test("fresh room check failure is fail-closed and exposes no cached queue fallback", async () => {
  const result = await checkFreshRoomBookingConflict({
    fetchQueues: async () => { throw new Error("network timeout"); },
    roomId: "room-1",
    date: "2026-07-15",
    procedures,
    startBlock: 121,
    durationBlocks: 2,
  });

  assert.deepEqual({ ok: result.ok, reason: result.reason }, {
    ok: false,
    reason: "fresh-check-failed",
  });
});

test("editing a queue does not conflict with itself", () => {
  const conflict = findRoomBookingConflict({
    queues,
    procedures,
    startBlock: 120,
    durationBlocks: 2,
    excludeQueueId: "existing",
  });

  assert.equal(conflict, null);
});
