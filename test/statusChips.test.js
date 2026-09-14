import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStatusChips } from "../src/utils/statusChips.js";

const STATUSES = [
  { value: "pending", label: "รอยืนยัน" },
  { value: "confirmed", label: "ยืนยันแล้ว" },
  { value: "no_show", label: "ไม่มาตามนัด" },
  { value: "cancelled", label: "ยกเลิก" },
  { value: "done", label: "มาแล้ว / เสร็จ" },
];

const page = readFileSync(new URL("../src/pages/QueueTablePage.jsx", import.meta.url), "utf8");

test("ก้อนใหญ่ขึ้นก่อน — วันที่ผ่านมาแล้วต้องเห็น 'มาแล้ว/เสร็จ' เป็นชิปแรก", () => {
  // เคสจริง 12 ก.ย. 2569: done 1317, no_show 476, cancelled 50, confirmed 1
  // ของเดิมเรียงตามลำดับสถานะ done เลยไปอยู่ท้ายสุดและตกขอบจอมือถือ
  const chips = buildStatusChips(STATUSES, { done: 1317, no_show: 476, cancelled: 50, confirmed: 1 });
  assert.deepEqual(chips.map((c) => c.value), ["done", "no_show", "cancelled", "confirmed"]);
  assert.equal(chips[0].count, 1317);
});

test("สถานะที่นับได้ 0 และไม่ได้กรองอยู่ ไม่ต้องโชว์", () => {
  const chips = buildStatusChips(STATUSES, { done: 3 });
  assert.deepEqual(chips.map((c) => c.value), ["done"]);
});

test("สถานะที่กรองค้างไว้ต้องโชว์เสมอแม้นับได้ 0", () => {
  // ไม่งั้นชิปหายแต่ตัวกรองยังทำงาน ตารางว่างโดยไม่มีอะไรบอกว่ากรองอยู่
  const chips = buildStatusChips(STATUSES, { done: 3 }, "confirmed");
  const confirmed = chips.find((c) => c.value === "confirmed");
  assert.ok(confirmed, "ชิปของสถานะที่กรองอยู่ต้องอยู่ในแถว");
  assert.equal(confirmed.count, 0);
});

test("ช่วงวันที่ที่ไม่มีคิวเลย แต่กรองค้างไว้ ยังต้องมีชิปให้เห็น", () => {
  const chips = buildStatusChips(STATUSES, {}, "confirmed");
  assert.equal(chips.length, 1);
  assert.equal(chips[0].value, "confirmed");
});

test("ไม่ได้กรองอะไรและไม่มีคิวเลย = ไม่มีชิป", () => {
  assert.deepEqual(buildStatusChips(STATUSES, {}, "all"), []);
});

test("หน้าตารางคิวมีปุ่มล้างตัวกรองสถานะตอนกรองค้างอยู่", () => {
  assert.match(page, /qfStatus !== "all" && \(/);
  assert.match(page, /✕ ล้างตัวกรองสถานะ/);
});

test("หน้าตารางคิวใช้ buildStatusChips ไม่ได้กรองชิปเองในหน้า", () => {
  assert.match(page, /buildStatusChips\(TABLE_STATUSES, statusStats, qfStatus\)/);
  assert.doesNotMatch(page, /TABLE_STATUSES\.filter\(\(s\) => statusStats\[s\.value\]\)/);
});
