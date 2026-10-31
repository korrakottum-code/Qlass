import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildScheduleTiming, findQueuesInClosure, formatBlockDuration,
  DEFAULT_CLOSE_START_BLOCK, DEFAULT_CLOSE_END_BLOCK,
} from "../src/utils/scheduleClosure.js";
import { openBlocksForRoomDay } from "../src/utils/capacity.js";

const room = { id: "m1", openBlock: 132, closeBlock: 240 }; // 11:00–20:00

test("ปิดเฉพาะช่วงเวลา = available false + ช่วงเวลา (รูปแถวที่ผู้อ่านทุกตัวรองรับอยู่แล้ว)", () => {
  assert.deepEqual(
    buildScheduleTiming({ noteOnly: false, available: false, closeRange: true, startBlock: 132, endBlock: 204 }),
    { available: false, startBlock: 132, endBlock: 204 },
  );
});

test("ปิดทั้งวัน / เปิดต่อเวลา / โน้ต ยังได้แถวแบบเดิมทุกไบต์", () => {
  assert.deepEqual(
    buildScheduleTiming({ noteOnly: false, available: false, closeRange: false, startBlock: 132, endBlock: 204 }),
    { available: false, startBlock: null, endBlock: null },
  );
  assert.deepEqual(
    buildScheduleTiming({ noteOnly: false, available: true, closeRange: true, startBlock: 132, endBlock: 264 }),
    { available: true, startBlock: 132, endBlock: 264 },
  );
  assert.deepEqual(
    buildScheduleTiming({ noteOnly: true, available: false, closeRange: true, startBlock: 132, endBlock: 204 }),
    { available: true, startBlock: null, endBlock: null },
  );
});

test("หมอเข้า 17:00: ปิด 11:00–17:00 แล้วเตียงเหลือเปิด 17:00–20:00 เท่านั้น", () => {
  const timing = buildScheduleTiming({
    noteOnly: false, available: false, closeRange: true,
    startBlock: DEFAULT_CLOSE_START_BLOCK, endBlock: DEFAULT_CLOSE_END_BLOCK,
  });
  const blocks = openBlocksForRoomDay(room, [{ roomId: "m1", date: "2026-11-02", noteOnly: false, ...timing }]);
  assert.equal(blocks[0], 204);
  assert.equal(blocks[blocks.length - 1], 239);
  assert.equal(blocks.length, 36);
});

test("คิวที่ทับช่วงปิดแม้บางส่วนถูกเตือน คิวนอกช่วง/ยกเลิก/คนละเตียง/คนละวันไม่ถูกเตือน", () => {
  const queues = [
    { id: "a", roomId: "m1", date: "2026-11-02", timeBlock: 150, status: "confirmed" },       // 12:30 ในช่วง
    { id: "b", roomId: "m1", date: "2026-11-02", timeBlock: 198, durationBlocks: 12, status: "pending" }, // 16:30–17:30 ทับขอบ
    { id: "c", roomId: "m1", date: "2026-11-02", timeBlock: 204, status: "confirmed" },        // 17:00 พอดีขอบ ไม่ทับ
    { id: "d", roomId: "m1", date: "2026-11-02", timeBlock: 150, status: "cancelled" },
    { id: "e", roomId: "m2", date: "2026-11-02", timeBlock: 150, status: "confirmed" },
    { id: "f", roomId: "m1", date: "2026-11-03", timeBlock: 150, status: "confirmed" },
    { id: "g", roomId: "m1", date: "2026-11-02", timeBlock: 120, procedureId: "p3", status: "confirmed" }, // 10:00 ยาว 3 ชม.
  ];
  const procedures = [{ id: "p3", blocks: 36 }];
  const isActive = (s) => !["cancelled", "no_show", "rescheduled"].includes(s);
  const hit = findQueuesInClosure({
    queues, procedures, roomIds: ["m1"], dates: ["2026-11-02"],
    startBlock: 132, endBlock: 204, isActiveQueueStatus: isActive,
  });
  assert.deepEqual(hit.map((q) => q.id), ["g", "a", "b"]);

  const wholeDay = findQueuesInClosure({
    queues, procedures, roomIds: ["m1"], dates: ["2026-11-02"],
    startBlock: null, endBlock: null, isActiveQueueStatus: isActive,
  });
  assert.deepEqual(wholeDay.map((q) => q.id).sort(), ["a", "b", "c", "g"]);
});

test("แถว 'ทุกวัน' (date ว่าง) ไม่เตือนคิว — ไม่รู้ว่าครอบวันไหน", () => {
  const hit = findQueuesInClosure({
    queues: [{ id: "a", roomId: "m1", date: "2026-11-02", timeBlock: 150, status: "confirmed" }],
    roomIds: ["m1"], dates: [""], startBlock: 132, endBlock: 204,
  });
  assert.deepEqual(hit, []);
});

test("ความยาวช่วงแสดงชั่วโมงถูก (เดิม 09:00–11:00 ขึ้น 4 ชั่วโมง)", () => {
  assert.equal(formatBlockDuration(24), "2 ชั่วโมง");
  assert.equal(formatBlockDuration(72), "6 ชั่วโมง");
  assert.equal(formatBlockDuration(30), "2 ชั่วโมง 30 นาที");
  assert.equal(formatBlockDuration(6), "30 นาที");
});

test("ฟอร์มตารางห้องใช้ตัวช่วยชุดนี้ และไม่กลับไปคำนวณชั่วโมงแบบเดิม", () => {
  const src = readFileSync(new URL("../src/components/modals/ScheduleModal.jsx", import.meta.url), "utf8");
  assert.match(src, /buildScheduleTiming\(/);
  assert.match(src, /findQueuesInClosure\(/);
  assert.match(src, /ปิดเฉพาะช่วงเวลา/);
  assert.doesNotMatch(src, /duration \/ STEP/);
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /<ScheduleModal[^>]*queues=\{queues\}[^>]*procedures=\{procedures\}/);
});
