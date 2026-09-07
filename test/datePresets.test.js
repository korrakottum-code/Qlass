import test from "node:test";
import assert from "node:assert/strict";
import { toDateStr, daySpan, getDatePresets, pickDatePresets } from "../src/utils/datePresets.js";

// พุธ 9 ก.ย. 2026 — ใช้เป็น "วันนี้" คงที่ทุกเคส
const NOW = new Date(2026, 8, 9, 10, 30);
const byKey = (k, now = NOW) => getDatePresets(now).find((p) => p.key === k);

test("toDateStr ใช้วันที่ตามเครื่อง ไม่ใช่ UTC", () => {
  // 23:30 ตามเวลาเครื่อง ต้องยังเป็นวันเดิม แม้ UTC จะข้ามวันไปแล้ว
  assert.equal(toDateStr(new Date(2026, 8, 9, 23, 30)), "2026-09-09");
  assert.equal(toDateStr(new Date(2026, 0, 5)), "2026-01-05", "เดือน/วันเลขเดียวต้องเติม 0");
});

test("daySpan นับหัวนับหาง", () => {
  assert.equal(daySpan("2026-09-09", "2026-09-09"), 1, "วันเดียว = 1 วัน");
  assert.equal(daySpan("2026-09-03", "2026-09-09"), 7);
  assert.equal(daySpan("2026-08-31", "2026-09-01"), 2, "ข้ามเดือน");
  assert.equal(daySpan("2026-12-31", "2027-01-01"), 2, "ข้ามปี");
  assert.equal(daySpan("", "2026-09-09"), 0, "ค่าว่างไม่ทำให้พัง");
});

test("ช่วงวันเดียวมี start เท่ากับ end", () => {
  assert.deepEqual(
    [byKey("today").start, byKey("today").end],
    ["2026-09-09", "2026-09-09"],
  );
  assert.deepEqual(
    [byKey("yesterday").start, byKey("yesterday").end],
    ["2026-09-08", "2026-09-08"],
  );
});

test("7 วันล่าสุด รวมวันนี้แล้วได้ 7 วันพอดี", () => {
  const p = byKey("last7");
  assert.deepEqual([p.start, p.end], ["2026-09-03", "2026-09-09"]);
  assert.equal(daySpan(p.start, p.end), 7);
});

test("สัปดาห์เริ่มวันจันทร์ และสัปดาห์ที่แล้วยาว 7 วันเสมอ", () => {
  // 9 ก.ย. 2026 เป็นวันพุธ → จันทร์คือ 7 ก.ย.
  assert.equal(byKey("thisWeek").start, "2026-09-07");
  const last = byKey("lastWeek");
  assert.deepEqual([last.start, last.end], ["2026-08-31", "2026-09-06"]);
  assert.equal(daySpan(last.start, last.end), 7);

  // วันอาทิตย์ต้องนับเป็นวันสุดท้ายของสัปดาห์ ไม่ใช่วันแรก
  const sunday = new Date(2026, 8, 13);
  assert.equal(byKey("thisWeek", sunday).start, "2026-09-07");
});

test("เดือนนี้/เดือนที่แล้ว จบที่วันสุดท้ายของเดือนจริง", () => {
  assert.deepEqual([byKey("thisMonth").start, byKey("thisMonth").end], ["2026-09-01", "2026-09-30"]);
  assert.deepEqual([byKey("lastMonth").start, byKey("lastMonth").end], ["2026-08-01", "2026-08-31"]);

  // ก.พ. ปีอธิกสุรทิน — เดือนที่แล้วของ 1 มี.ค. 2028 ต้องจบ 29
  const mar2028 = new Date(2028, 2, 1);
  assert.equal(byKey("lastMonth", mar2028).end, "2028-02-29");
});

test("ไตรมาส/ปี ครอบคลุมช่วงเต็ม", () => {
  assert.deepEqual([byKey("thisQuarter").start, byKey("thisQuarter").end], ["2026-07-01", "2026-09-30"]);
  assert.deepEqual([byKey("thisYear").start, byKey("thisYear").end], ["2026-01-01", "2026-12-31"]);
});

test("พรุ่งนี้ เป็นวันเดียว และอยู่ถัดจากวันนี้", () => {
  const p = byKey("tomorrow");
  assert.deepEqual([p.start, p.end], ["2026-09-10", "2026-09-10"]);
  // ข้ามเดือน: 30 ก.ย. → 1 ต.ค.
  assert.equal(byKey("tomorrow", new Date(2026, 8, 30)).start, "2026-10-01");
  // ข้ามปี: 31 ธ.ค. → 1 ม.ค. ปีถัดไป
  assert.equal(byKey("tomorrow", new Date(2026, 11, 31)).start, "2027-01-01");
});

test("ต้นเดือนถึงเมื่อวาน ไม่รวมวันนี้ และหายไปเมื่อเป็นวันที่ 1", () => {
  const p = byKey("monthToYesterday");
  assert.deepEqual([p.start, p.end], ["2026-09-01", "2026-09-08"], "จบที่เมื่อวาน ไม่ใช่วันนี้");
  assert.ok(p.end < byKey("today").start, "ต้องไม่รวมวันนี้");

  // วันที่ 2 = ช่วงสั้นสุดที่ยังมีความหมาย (วันเดียวคือวันที่ 1)
  const d2 = new Date(2026, 8, 2);
  assert.deepEqual([byKey("monthToYesterday", d2).start, byKey("monthToYesterday", d2).end], ["2026-09-01", "2026-09-01"]);

  // วันที่ 1: ต้นเดือน > เมื่อวาน → ต้องถูกตัดทิ้ง ไม่ใช่คืนช่วงติดลบ
  const d1 = new Date(2026, 8, 1);
  assert.equal(byKey("monthToYesterday", d1), undefined);
  assert.ok(getDatePresets(d1).every((x) => x.start <= x.end), "ทุกช่วงที่คืนมาต้องไม่ติดลบ");
});

test("pickDatePresets คืนเฉพาะที่ขอ ตามลำดับที่ขอ", () => {
  const picked = pickDatePresets(["thisMonth", "today"], NOW);
  assert.deepEqual(picked.map((p) => p.key), ["thisMonth", "today"]);
  // key ที่ไม่มีจริงต้องถูกตัดทิ้ง ไม่ใช่โผล่มาเป็น undefined
  assert.deepEqual(pickDatePresets(["today", "ไม่มีจริง"], NOW).map((p) => p.key), ["today"]);
});
