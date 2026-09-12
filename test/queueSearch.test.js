import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchWords, isSearchable, matchesQueueSearch } from "../src/utils/queueSearch.js";

// หน้าร้านพิมพ์ "ชื่อ นามสกุล" แล้วหาไม่เจอ ต้องลบนามสกุลออกถึงเจอ แล้วนั่งเลื่อนหาเอง
// เพราะชื่อในฐานข้อมูลพิมพ์กันมาหลายแบบ เว้นวรรคสองครั้งบ้าง มีช่องว่างต่อท้ายบ้าง
// มีคำนำหน้าอย่าง "น.ส." บ้าง (เจอจริงหน้าร้าน 12 ก.ย. 2569)

test("แยกคำ ตัดช่องว่างซ้ำและหัวท้ายทิ้ง", () => {
  assert.deepEqual(searchWords("  สุดารัตน์   อัศวภูมิ  "), ["สุดารัตน์", "อัศวภูมิ"]);
  assert.deepEqual(searchWords(""), []);
  assert.deepEqual(searchWords("   "), []);
});

test("ถอดอักขระที่ทำให้คำสั่งค้นหาพัง", () => {
  // , และ ( ) เป็นตัวคั่นของ PostgREST ส่วน % _ \\ เป็น wildcard ของ ilike
  assert.deepEqual(searchWords("a,b(c)d"), ["a", "b", "c", "d"]);
  assert.deepEqual(searchWords("a%b_c\\d"), ["a", "b", "c", "d"]);
});

test("จำกัดจำนวนคำ กันคนวางข้อความยาวลงช่องค้นหา", () => {
  assert.equal(searchWords("ก ข ค ง จ ฉ ช").length, 4);
});

test("คำค้นสั้นเกินไปไม่ยิงหาทั้งตาราง", () => {
  assert.equal(isSearchable("ก"), false);
  assert.equal(isSearchable(" "), false);
  assert.equal(isSearchable("กข"), true);
  assert.equal(isSearchable("0909515956"), true);
});

test("ชื่อที่เว้นวรรคสองครั้งหรือมีช่องว่างท้าย ต้องหาเจอ", () => {
  const q = { name: "กรรฏภมรวรรจน์  อัศวภูมิ ", phone: "0622562428" };
  assert.equal(matchesQueueSearch(q, "กรรฏภมรวรรจน์ อัศวภูมิ"), true);
  // แบบเดิมที่จับทั้งประโยคเป็นก้อนเดียวจะพลาดเคสนี้
  assert.equal(q.name.includes("กรรฏภมรวรรจน์ อัศวภูมิ"), false);
});

test("ชื่อที่มีคำนำหน้า และการสลับลำดับคำ ต้องหาเจอ", () => {
  const q = { name: "น.ส. สุดารัตน์ บุญน้อย", phone: "0614813714" };
  assert.equal(matchesQueueSearch(q, "สุดารัตน์ บุญน้อย"), true);
  assert.equal(matchesQueueSearch(q, "บุญน้อย สุดารัตน์"), true);
});

test("ค้นด้วยเบอร์ และค้นด้วยชื่อแอดมินผู้บันทึก", () => {
  const q = { name: "สุดารัตน์ อัศวภูมิ", phone: "0909515956" };
  assert.equal(matchesQueueSearch(q, "0909515956"), true);
  assert.equal(matchesQueueSearch(q, "ยอน"), false);
  assert.equal(matchesQueueSearch(q, "ยอน", "ยอน ภาณุวัฒน์"), true);
});

test("ทุกคำต้องเจอครบ ไม่ใช่เจอคำเดียวก็ผ่าน", () => {
  const q = { name: "สุดารัตน์ สามสี", phone: "0952748853" };
  assert.equal(matchesQueueSearch(q, "สุดารัตน์"), true);
  assert.equal(matchesQueueSearch(q, "สุดารัตน์ อัศวภูมิ"), false);
});

test("ไม่พิมพ์อะไรเลย = ไม่กรอง", () => {
  assert.equal(matchesQueueSearch({ name: "ก", phone: "1" }, ""), true);
});

// ─── กติกาในหน้าจอ ───
const page = readFileSync(new URL("../src/pages/QueueTablePage.jsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");

test("ค้นหาต้องไม่ผูกช่วงวันที่และไม่ผูกสาขา", () => {
  const start = service.indexOf("export async function searchQueues");
  assert.ok(start > 0, "หา searchQueues ไม่เจอ");
  const fn = service.slice(start, service.indexOf("\n}", start));
  assert.ok(!/(gte|lte|eq)\("date"/.test(fn), "ห้ามกรองวันที่ในคำสั่งค้นหา");
  assert.ok(!/branch_id/.test(fn), "ห้ามกรองสาขาในคำสั่งค้นหา");
  assert.match(fn, /for \(const w of words\) query = query\.or\(/, "ต้อง AND ทีละคำ");
});

test("ตอนค้นหาต้องข้ามด่านบังคับเลือกสาขา", () => {
  // ด่านนั้นมีไว้กันตารางเป็นพันแถว ซึ่งไม่เกิดตอนค้นชื่อคนเดียว
  assert.match(page, /\{searching \? \(/);
  const i = page.indexOf("{searching ? (");
  const j = page.indexOf("needsBranch ? (", i);
  assert.ok(j > i, "บล็อกค้นหาต้องมาก่อนด่านเลือกสาขา");
});

test("ไม่เจอตอนค้นหา ห้ามชวนให้ไปลงคิวใหม่", () => {
  // "ยังไม่มีคิว — ไปบันทึกคิวก่อนเลย!" ของมุมมองรายวัน ถ้าโผล่ตอนค้นหา หน้าร้านจะอ่านว่า
  // ลูกค้าคนนี้ไม่มีคิว แล้วลงใหม่ทับของเดิม
  const i = page.indexOf("{searching ? (");
  const j = page.indexOf("needsBranch ? (", i);
  const searchBlock = page.slice(i, j);
  // เทียบข้อความที่ใช้จริง (มี "!" ท้าย) ไม่ใช่ที่พิมพ์ไว้ในคอมเมนต์อธิบายกฎข้อนี้
  assert.ok(!searchBlock.includes("ไปบันทึกคิวก่อนเลย!"));
  assert.ok(searchBlock.includes("ไม่พบ") && searchBlock.includes("ในระบบเลย"));
  assert.match(searchBlock, /ค้นครบทุกวันและทุกสาขาแล้ว/);
});

test("ผลค้นหาต้องผูกกับคำที่ค้น กันผลของคำเก่าค้างโชว์", () => {
  assert.match(page, /const resultsFresh = globalSearch\.term === searchTerm;/);
  assert.match(page, /resultsFresh \? globalSearch\.rows : \[\]/);
});
