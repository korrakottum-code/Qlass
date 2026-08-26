import test from "node:test";
import assert from "node:assert/strict";
import {
  SMALL_BASE, byCustomerType, lostRateOf, changePct, sortByChange, topMovers,
} from "../src/utils/growthCompare.js";

const row = (name, prev, total) => ({ name, prev, total, ch: changePct(total, prev) });
const order = (rows) => [...rows].sort(sortByChange).map((r) => r.name);

test("ลดลงมาก่อนเพิ่มขึ้นเสมอ แม้ตัวที่เพิ่มจะขยับแรงกว่า", () => {
  // สาขาที่แย่ลงคือสิ่งที่เจ้าของอยากเห็นก่อน ต่อให้ % ของอีกกลุ่มจะสูงกว่า
  assert.deepEqual(order([row("โต", 100, 300), row("ตก", 100, 90)]), ["ตก", "โต"]);
});

test("ในกลุ่มเดียวกัน เรียงตามขนาด % ไม่ใช่ยอดคิวรวม", () => {
  assert.deepEqual(
    order([row("ใหญ่แต่ขยับนิด", 5000, 4900), row("เล็กแต่ขยับแรง", 100, 40)]),
    ["เล็กแต่ขยับแรง", "ใหญ่แต่ขยับนิด"],
  );
});

test("ฐานเทียบน้อยกว่า SMALL_BASE จมท้ายกลุ่มเสมอ ไม่แย่งอันดับต้นด้วย % บวมเทียม", () => {
  // 1→587 = +58600% ต้องไม่ชนะ 1000→1300 = +30% ที่เป็นการเติบโตจริง
  const rows = [row("เปิดใหม่", 1, 587), row("โตจริง", 1000, 1300)];
  assert.equal(changePct(587, 1) > changePct(1300, 1000), true, "ตัว % ดิบยังบวมกว่าจริง");
  assert.deepEqual(order(rows), ["โตจริง", "เปิดใหม่"]);
});

test("ฐานเล็กทั้งคู่ เรียงด้วยจำนวนคิวที่เปลี่ยนจริง ไม่ใช่ %", () => {
  // 1→9 = +800% แต่ขยับแค่ 8 คิว ส่วน 9→40 = +344% แต่ขยับ 31 คิว — อันหลังสำคัญกว่า
  assert.deepEqual(order([row("บวม%", 1, 9), row("ขยับจริง", 9, 40)]), ["ขยับจริง", "บวม%"]);
});

test("ยอดเท่าเดิมไม่ถือว่าลดลง (ไปอยู่กลุ่มเพิ่มขึ้น แล้วโชว์ป้ายคงที่แทน)", () => {
  assert.deepEqual(order([row("คงที่", 100, 100), row("ตก", 100, 99)]), ["ตก", "คงที่"]);
});

test("SMALL_BASE คือ 10 — เส้นแบ่งเดียวกับที่หน้าจอใช้ตัดสินว่าจะโชว์ % หรือจำนวนคิว", () => {
  assert.equal(SMALL_BASE, 10);
  assert.deepEqual(order([row("ฐาน10", 10, 5), row("ฐาน9", 9, 1)]), ["ฐาน10", "ฐาน9"]);
});

test("changePct: ฐาน 0 แต่มีคิว = +100, ฐาน 0 และไม่มีคิว = 0", () => {
  assert.equal(changePct(50, 0), 100);
  assert.equal(changePct(0, 0), 0);
  assert.equal(changePct(0, 80), -100);
});

test("lostRateOf คืน null เมื่อไม่มีคิว ไม่ใช่ 0 (ไม่มีข้อมูล ≠ ยกเลิก 0%)", () => {
  assert.equal(lostRateOf([]), null);
  assert.equal(lostRateOf([{ status: "done" }, { status: "no_show" }]), 50);
  assert.equal(lostRateOf([{ status: "cancelled" }, { status: "no_show" }]), 100);
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
