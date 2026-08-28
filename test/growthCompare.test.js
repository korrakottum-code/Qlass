import test from "node:test";
import assert from "node:assert/strict";
import {
  SMALL_BASE, byCustomerType, lostStat, changePct, sortByQueueCount, sortByPercent, sorterFor, topMovers,
} from "../src/utils/growthCompare.js";

const row = (name, prev, total) => ({ name, prev, total, ch: changePct(total, prev) });
const order = (rows) => [...rows].sort(sortByQueueCount).map((r) => r.name);
const orderByPct = (rows) => [...rows].sort(sortByPercent).map((r) => r.name);

test("ลดลงมาก่อนเพิ่มขึ้นเสมอ แม้ตัวที่เพิ่มจะขยับแรงกว่า", () => {
  // สาขาที่แย่ลงคือสิ่งที่เจ้าของอยากเห็นก่อน ต่อให้ % ของอีกกลุ่มจะสูงกว่า
  assert.deepEqual(order([row("โต", 100, 300), row("ตก", 100, 90)]), ["ตก", "โต"]);
});

test("ในกลุ่มเดียวกัน เรียงตามจำนวนคิวที่เปลี่ยนไป ไม่ใช่ %", () => {
  // เคสจริง 28 วัน: Hifu หาย 204 คิว (-15%) ต้องมาก่อน Oligio ที่หายแค่ 17 คิว (-94%)
  // เดิมเรียงด้วย % ทำให้ Hifu ตกไปอันดับ 10 จนถูกซ่อนหลังปุ่ม "ดูเพิ่ม" (โชว์แค่ 8 แถวแรก)
  assert.deepEqual(order([row("Oligio", 18, 1), row("Hifu", 1340, 1136)]), ["Hifu", "Oligio"]);
});

test("ของฐานเล็กจมท้ายเองโดยไม่ต้องมีกฎพิเศษ เพราะขยับไม่กี่คิว", () => {
  // 1→2 ที่ % = +100% แต่ขยับคิวเดียว ต้องแพ้ของที่ขยับ 300 คิว
  assert.deepEqual(order([row("บวม%", 1, 2), row("โตจริง", 1000, 1300)]), ["โตจริง", "บวม%"]);
  // ส่วน 1→587 เคยต้องมีกฎดันลง ตอนนี้ 586 คิวคือการขยับจริง ควรได้อันดับต้นจริงๆ
  assert.deepEqual(order([row("เปิดใหม่", 1, 587), row("โตจริง", 1000, 1300)]), ["เปิดใหม่", "โตจริง"]);
});

test("ขยับเท่ากันเป๊ะ ให้ % ตัดสิน — หาย 5 จาก 10 หนักกว่าหาย 5 จาก 500", () => {
  assert.deepEqual(order([row("ฐานใหญ่", 500, 495), row("ฐานเล็ก", 10, 5)]), ["ฐานเล็ก", "ฐานใหญ่"]);
});

test("ยอดเท่าเดิมไม่ถือว่าลดลง (ไปอยู่กลุ่มเพิ่มขึ้น แล้วโชว์ป้ายคงที่แทน)", () => {
  assert.deepEqual(order([row("คงที่", 100, 100), row("ตก", 100, 99)]), ["ตก", "คงที่"]);
});

test("SMALL_BASE คือ 10 — เส้นแบ่งที่ฝั่งแสดงผลใช้ตัดสินว่าจะต่อ % ท้ายป้ายไหม", () => {
  assert.equal(SMALL_BASE, 10);
});

test("changePct: ฐาน 0 แต่มีคิว = +100, ฐาน 0 และไม่มีคิว = 0", () => {
  assert.equal(changePct(50, 0), 100);
  assert.equal(changePct(0, 0), 0);
  assert.equal(changePct(0, 80), -100);
});

const q = (status) => ({ status });
const many = (n, status) => Array.from({ length: n }, () => q(status));

test("lostStat คืน rate null เมื่อไม่มีคิว ไม่ใช่ 0 (ไม่มีข้อมูล ≠ ยกเลิก 0%)", () => {
  assert.deepEqual(lostStat([]), { lost: 0, total: 0, rate: null, reliable: false });
});

test("lostStat คิดอัตราถูกและส่งตัวตั้ง/ตัวหารดิบกลับมาด้วยเสมอ", () => {
  const arr = [...many(8, "done"), q("no_show"), q("cancelled")];
  assert.deepEqual(lostStat(arr), { lost: 2, total: 10, rate: 20, reliable: true });
});

test("ฐานน้อยกว่า SMALL_BASE ถือว่าเชื่อ % ไม่ได้ — คิวใบเดียวต้องไม่กลายเป็น 100% ที่เชื่อถือได้", () => {
  // เคสจริงจาก production: Oligio มีคิวเดียวในช่วงนั้นแล้วโดนยกเลิก เดิมขึ้น "100%" ตัวหนาสีแดง
  const one = lostStat([q("cancelled")]);
  assert.equal(one.rate, 100);
  assert.equal(one.reliable, false, "คิวใบเดียวห้ามถือว่าฐานพอ");
  // และคิวใบเดียวที่ไม่โดนยกเลิกก็ต้องไม่ถือว่า "0% เขียว" ที่เชื่อได้เหมือนกัน
  assert.equal(lostStat([q("done")]).reliable, false);
});

test("เส้นแบ่ง reliable อยู่ที่ SMALL_BASE พอดี ไม่เหลื่อม", () => {
  assert.equal(lostStat(many(SMALL_BASE - 1, "done")).reliable, false);
  assert.equal(lostStat(many(SMALL_BASE, "done")).reliable, true);
});

test("นับทั้งยกเลิกและไม่มาเป็น lost สถานะอื่นไม่นับ", () => {
  const arr = [q("cancelled"), q("no_show"), q("done"), q("confirmed"), q("waiting")];
  assert.equal(lostStat(arr).lost, 2);
});

test("byCustomerType นับครบสามประเภท ไม่ปนกับสถานะอื่น", () => {
  const arr = [
    { customerType: "new" }, { customerType: "new" }, { customerType: "old" },
    { customerType: "course" }, { customerType: undefined },
  ];
  assert.deepEqual(byCustomerType(arr), { new: 2, old: 1, course: 1 });
});

test("topMovers: เอาตัวที่ขยับแรงสุด ตัดตัวที่ไม่ขยับ และคีย์ด้วย id ไม่ใช่ชื่อ", () => {
  const cur = { a: 10, b: 3, c: 5 }, prev = { a: 1, b: 3, d: 20 };
  const movers = topMovers(cur, prev, (id) => `ชื่อ-${id}`, 3);
  assert.deepEqual(movers.map((m) => m.id), ["d", "a", "c"]);
  assert.equal(movers.find((m) => m.id === "b"), undefined, "ตัวที่ไม่ขยับต้องถูกตัดทิ้ง");
  assert.deepEqual(movers[0], { id: "d", name: "ชื่อ-d", cur: 0, prev: 20, delta: -20 });
});

test("topMovers เคารพ limit", () => {
  const cur = { a: 9, b: 8, c: 7, d: 6, e: 5, f: 4 };
  assert.equal(topMovers(cur, {}, (id) => id).length, 5);
});

// ─── โหมด "% ตกหนัก" (ปุ่มสลับในหน้า) ───

test("โหมด % เรียงตามอัตราที่ตก ไม่ใช่จำนวน — เคสสาขาที่ % เกาะกลุ่มกัน", () => {
  // ข้อมูลจริง 28 วัน: หอกาญหาย 245 คิวแต่แค่ -9% ส่วนสุรินทร์หาย 115 คิวแต่ -15%
  // โหมดจำนวนดันหอกาญขึ้นก่อน โหมด % ต้องดันสุรินทร์ขึ้นก่อน
  const rows = [row("หอกาญ", 2805, 2560), row("สุรินทร์", 760, 645)];
  assert.deepEqual(order(rows), ["หอกาญ", "สุรินทร์"]);
  assert.deepEqual(orderByPct(rows), ["สุรินทร์", "หอกาญ"]);
});

test("โหมด % ยังต้องดันฐานเล็กลงท้ายกลุ่ม — บั๊ก 1→587 = +58600% ห้ามกลับมา", () => {
  assert.deepEqual(orderByPct([row("เปิดใหม่", 1, 587), row("โตจริง", 1000, 1300)]), ["โตจริง", "เปิดใหม่"]);
  assert.deepEqual(orderByPct([row("บวม%", 1, 2), row("โตจริง", 1000, 1300)]), ["โตจริง", "บวม%"]);
});

test("โหมด % ที่ตกเท่ากันเป๊ะ ให้จำนวนตัดสิน ไม่ปล่อยให้ลำดับมั่ว", () => {
  // ลาดกระบัง -15% และสุรินทร์ -15% เท่ากัน ตัวที่หายมากกว่าต้องมาก่อนเสมอ
  const rows = [row("สุรินทร์", 760, 645), row("ลาดกระบัง", 794, 677)];
  assert.equal(rows[0].ch, rows[1].ch, "สองแถวนี้ต้อง % เท่ากันจริงถึงจะทดสอบตัวตัดสินได้");
  assert.deepEqual(orderByPct(rows), ["ลาดกระบัง", "สุรินทร์"]);
});

test("ทั้งสองโหมดแยกกลุ่มลดลงมาก่อนเพิ่มขึ้นเหมือนกัน", () => {
  const rows = [row("โตแรง", 100, 900), row("ตกนิด", 100, 99)];
  assert.deepEqual(order(rows), ["ตกนิด", "โตแรง"]);
  assert.deepEqual(orderByPct(rows), ["ตกนิด", "โตแรง"]);
});

test("sorterFor เลือกตัวเรียงตามชื่อโหมด และ default เป็นจำนวนคิว", () => {
  assert.equal(sorterFor("pct"), sortByPercent);
  assert.equal(sorterFor("count"), sortByQueueCount);
  assert.equal(sorterFor(undefined), sortByQueueCount, "โหมดที่ไม่รู้จักต้องตกมาที่จำนวนคิว");
});
