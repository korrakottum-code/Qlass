import assert from "node:assert/strict";
import test from "node:test";
import { buildQueueStatusUpdate } from "../src/utils/queueStatusUpdate.js";

const QUEUE_STATUSES = [
  "pending", "follow1", "follow2", "follow3", "confirmed",
  "rescheduled", "rescheduled_in", "no_show", "cancelled", "done",
];

const ORIGINAL_QUEUE = Object.freeze({
  id: "queue-1",
  name: "ลูกค้าทดสอบ",
  phone: "0812345678",
  branchId: "branch-1",
  procedureId: "procedure-1",
  promoId: null,
  price: 0,
  note: "ข้อมูลเดิมต้องอยู่ครบ",
  customerType: "old",
  date: "2026-07-15",
  timeBlock: 0,
  durationBlocks: null,
  roomId: "room-1",
  status: "pending",
  statusNote: "โทรครั้งแรก",
  recordedBy: "staff-1",
});

for (const status of QUEUE_STATUSES) {
  test(`status update for ${status} only includes approved database columns`, () => {
    const before = { ...ORIGINAL_QUEUE };
    const result = buildQueueStatusUpdate(
      { ...ORIGINAL_QUEUE, status, statusNote: "บันทึกสถานะใหม่" },
      "2026-07-15T10:00:00.000Z",
    );

    assert.deepEqual(result, {
      status,
      status_note: "บันทึกสถานะใหม่",
      status_updated_at: "2026-07-15T10:00:00.000Z",
    });
    assert.deepEqual(Object.keys(result).sort(), ["status", "status_note", "status_updated_at"]);
    assert.deepEqual(ORIGINAL_QUEUE, before);
  });
}

test("blank status note is stored as an empty string without changing booking fields", () => {
  const result = buildQueueStatusUpdate(
    { ...ORIGINAL_QUEUE, status: "cancelled", statusNote: "" },
    "2026-07-15T10:00:00.000Z",
  );

  assert.deepEqual(result, {
    status: "cancelled",
    status_note: "",
    status_updated_at: "2026-07-15T10:00:00.000Z",
  });
});
