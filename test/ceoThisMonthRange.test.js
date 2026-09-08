import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/pages/CeoDashboardPage.jsx", import.meta.url), "utf8");

test('ช่วง "เดือนนี้" ของ CEO Dashboard ต้องจบที่เมื่อวาน ไม่รวมวันนี้ที่ยังไม่จบ', () => {
  assert.match(
    src,
    /const days = Math\.max\(1, Math\.min\(today\.getDate\(\) - 1, prevMonthDays\)\);/,
    'ถ้าแก้กลับเป็น today.getDate() เฉย ๆ เดือนนี้จะรวมวันนี้ที่คิวยังไหลเข้าไม่ครบ ทำให้ยอดต่ำกว่าจริงและ % เทียบเดือนก่อนติดลบเทียม',
  );
});

test('ช่วง 7/14/28 วัน ต้องนับถอยจากเมื่อวาน ไม่ใช่วันนี้ที่คิวยังเข้าไม่ครบ', () => {
  assert.match(
    src,
    /e = new Date\(today\); e\.setDate\(today\.getDate\(\) - 1\);\s*\n\s*s = new Date\(e\); s\.setDate\(e\.getDate\(\) - days \+ 1\);/,
    'ถ้าแก้กลับเป็น e = today วันสุดท้ายของช่วงจะบางกว่าวันอื่นเสมอ ยอดรวมและ % เทียบช่วงก่อนจะต่ำกว่าจริง',
  );
});
