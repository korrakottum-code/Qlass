import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCK_PAST_TIME_TODAY, currentBlockOf, isPastPlacement } from "../src/utils/backdateRule.js";

// ห้ามลงคิวใหม่ย้อนหลัง (วันที่ผ่านไปแล้ว) ทุกบทบาท ทุกทางที่สร้างคิว
// เหตุ: 2 ต.ค. 2569 บ่าย มีคิวนัด 1 ต.ค. ถูกสร้างผ่านปุ่มกดช่องใน Timeline (ไม่มีด่านกัน)
// เวลาของวันนี้ "ไม่ห้าม": ข้อมูลจริง 30 วันมีคิวที่ลงหลังเวลานัดวันเดียวกัน ~1,400 คิว
// (ปิดเป็นเสร็จแล้ว = ลงบันทึกทีหลัง) ห้ามแล้วงานปกติของสาขาจะลงไม่ได้

const NOW = new Date(2026, 9, 2, 15, 3); // 2 ต.ค. 2569 15:03 -> block 180 (15:00)

test("ค่าเริ่มต้น: ห้ามเฉพาะวันที่ ไม่ห้ามเวลาของวันนี้", () => {
  assert.equal(BLOCK_PAST_TIME_TODAY, false);
});

test("วันที่ผ่านไปแล้วลงไม่ได้ ไม่ว่าเวลาไหน", () => {
  assert.equal(isPastPlacement("2026-10-01", 180, NOW), true);
  assert.equal(isPastPlacement("2026-10-01", null, NOW), true);
  assert.equal(isPastPlacement("2025-12-31", 200, NOW), true);
});

test("วันนี้และอนาคตผ่านเสมอ แม้ช่องเวลาจะผ่านไปแล้ว (ลงบันทึกทีหลังได้)", () => {
  assert.equal(isPastPlacement("2026-10-02", 108, NOW), false);
  assert.equal(isPastPlacement("2026-10-02", 179, NOW), false);
  assert.equal(isPastPlacement("2026-10-02", null, NOW), false);
  assert.equal(isPastPlacement("2026-10-03", 108, NOW), false);
});

test("ไม่มีวันที่ = ไม่ตัดสิน (ปล่อยให้ด่านอื่นจัดการ)", () => {
  assert.equal(isPastPlacement("", 108, NOW), false);
  assert.equal(isPastPlacement(undefined, 108, NOW), false);
});

test("สวิตช์ห้ามเวลา (ยังปิดอยู่): เปิดแล้วช่องปัจจุบันยังลงได้ ช่องก่อนหน้าลงไม่ได้", () => {
  assert.equal(currentBlockOf(NOW), 180);
  assert.equal(isPastPlacement("2026-10-02", 179, NOW, true), true);
  assert.equal(isPastPlacement("2026-10-02", 180, NOW, true), false);
  assert.equal(isPastPlacement("2026-10-02", 181, NOW, true), false);
  assert.equal(isPastPlacement("2026-10-02", null, NOW, true), false);
  assert.equal(isPastPlacement("2026-10-03", 108, NOW, true), false);
});

test("ทุกทางที่สร้างคิวใหม่ต้องเรียกด่านนี้ และการแก้คิวเดิมไม่ถูกแตะ", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /!editingQueueId && isPastPlacement\(form\.date, form\.timeBlock\)/, "หน้าบันทึกคิว (เฉพาะคิวใหม่)");
  assert.match(app, /isPastPlacement\(bookingForm\.date, bookingForm\.timeBlock\)/, "Timeline");
  assert.match(app, /isPastPlacement\(rescheduledQueue\.date, rescheduledQueue\.timeBlock\)/, "เลื่อนนัด");
  assert.match(app, /skippedPast\+\+/, "วางข้อความหลายคิว");
  const timeline = readFileSync(new URL("../src/pages/TimelinePage.jsx", import.meta.url), "utf8");
  assert.match(timeline, /isPastPlacement\(date, b\)/, "คลิกช่องใน Timeline");
});
