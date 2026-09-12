import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchWords, isSearchable, matchesQueueSearch, rankQueueMatch, sortSearchResults } from "../src/utils/queueSearch.js";

// หน้าร้านพิมพ์ "ชื่อ นามสกุล" แล้วหาไม่เจอ ต้องลบนามสกุลออกถึงเจอ แล้วนั่งเลื่อนหาเอง
// เพราะชื่อในฐานข้อมูลพิมพ์กันมาหลายแบบ เว้นวรรคสองครั้งบ้าง มีช่องว่างต่อท้ายบ้าง
// มีคำนำหน้าอย่าง "น.ส." บ้าง (เจอจริงหน้าร้าน 12 ก.ย. 2569)

test("แยกคำ ตัดช่องว่างซ้ำและหัวท้ายทิ้ง", () => {
  assert.deepEqual(searchWords("  สุดารัตน์   อัศวภูมิ  "), ["สุดารัตน์", "อัศวภูมิ"]);
  assert.deepEqual(searchWords(""), []);
  assert.deepEqual(searchWords("   "), []);
});

test("ถอดอักขระที่ทำให้คำสั่งค้นหาพังหรือค้นมั่ว", () => {
  // , และ ( ) เป็นตัวคั่นของ PostgREST, * % _ เป็น wildcard ของ ilike, " ใช้ครอบค่า
  assert.deepEqual(searchWords("a,b(c)d"), ["a", "b", "c", "d"]);
  assert.deepEqual(searchWords("a%b_c\\d"), ["a", "b", "c", "d"]);
  // พิมพ์ ก*ข แล้วเคยได้ "สมปรารถนา ปทักขินัง" เพราะ * กลายเป็นไวลด์การ์ด
  assert.deepEqual(searchWords("ก*ข"), ["ก", "ข"]);
  assert.deepEqual(searchWords('ก"ข'), ["ก", "ข"]);
});

test("จุดในชื่อต้องไม่โดนถอด — คำนำหน้าอย่าง น.ส. ใช้ค้นได้จริง", () => {
  assert.deepEqual(searchWords("น.ส. สุดารัตน์"), ["น.ส.", "สุดารัตน์"]);
  assert.equal(matchesQueueSearch({ name: "น.ส.กนกวรรณ บุญญวัตร", phone: "" }, "น.ส."), true);
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

test("ต้องรอให้พิมพ์นิ่งก่อน ไม่กรอง/ไม่ยิงหาใหม่ทุกตัวอักษร", () => {
  // พิมพ์หนึ่งตัวอักษรแล้วคำนวณตารางใหม่ทั้งหน้า (คิวหลักพันแถว จัดกลุ่มตามสาขา/ห้อง/วัน)
  // ทำให้ช่องพิมพ์รู้สึกค้าง — หน้าร้านแจ้งเข้ามา 12 ก.ย. 2569
  assert.match(page, /const \[appliedSearch, setAppliedSearch\] = useState\(""\);/);
  assert.match(page, /setTimeout\(\(\) => setAppliedSearch\(qfSearch\.trim\(\)\), SEARCH_DEBOUNCE_MS\)/);
  assert.match(page, /const searchTerm = appliedSearch;/,
    "ทุกอย่างที่หนักต้องอิงคำที่นิ่งแล้ว ไม่ใช่คำที่กำลังพิมพ์");
});

test("ตัวอักษรเดียวยังไม่กรองอะไร", () => {
  assert.match(page, /if \(!isSearchable\(appliedSearch\)\) return true;/);
});

test("ยังพิมพ์ไม่หยุด ต้องบอกว่าผลที่เห็นยังไม่ใช่ของคำล่าสุด", () => {
  assert.match(page, /const searchPending = qfSearch\.trim\(\) !== appliedSearch;/);
  assert.match(page, /กำลังพิมพ์/);
});

test("ลบคิวจากผลค้นหาแล้วแถวต้องหายทันที", () => {
  // ผลค้นหามาจากคนละก้อนกับ state หลัก ถ้าไม่จำไว้ว่าลบอะไรไป แถวที่ลบแล้วจะยังค้างอยู่
  // จนกว่าจะค้นใหม่ แล้วหน้าร้านจะเข้าใจว่าลบไม่สำเร็จ แล้วกดลบซ้ำ
  assert.match(page, /const \[deletedInSearch, setDeletedInSearch\]/);
  assert.match(page, /for \(const id of deletedInSearch\) byId\.delete\(id\);/);
});

test("ลบไม่สำเร็จต้องไม่ซ่อนแถว", () => {
  // แถวยังอยู่ใน DB จริง ซ่อนไปแล้วหน้าร้านจะเข้าใจว่าลบสำเร็จ
  assert.match(page, /\.then\(\(\) => setDeletedInSearch/);
  assert.match(page, /\.catch\(\(\) => \{\}\)/);
});

test("ตอนค้นหาต้องซ่อนตัวเลขที่ผูกกับช่วงวันที่", () => {
  // ชิปสรุปสถานะและแบนเนอร์เตือนนับตามช่วงวันที่ ซึ่งตอนค้นหาไม่ได้ใช้ — โชว์ไว้จะอ่านปนกัน
  assert.match(page, /\{!searching && Object\.keys\(statusStats\)\.length > 0 && \(/);
  assert.match(page, /\{!searching && overdueCount > 0 && \(/);
  assert.match(page, /\{!searching && !needsBranch && filteredQueues\.length > HEAVY_ROW_WARNING && \(/);
});

test("เรียงให้ที่ตรงกว่าขึ้นก่อน", () => {
  // พิมพ์ "สุดา" ต้องได้คนที่ชื่อขึ้นต้นด้วย "สุดา" ก่อนคนที่ "สุดา" ไปโผล่กลางคำ
  const rows = [
    { name: "นางสาวสุดารักษ์ คำสุนันท์", phone: "0874261585", date: "2026-10-25" },
    { name: "น.ส เชษฐ์สุดา นนมุต", phone: "0840327944", date: "2026-10-24" },
    { name: "สุดารัตน์ สะอาดดวงกมล", phone: "0814364184", date: "2026-10-09" },
    { name: "พรรณิภา สุดามาตร์", phone: "0661535539", date: "2026-10-03" },
  ];
  const sorted = sortSearchResults(rows, "สุดา");
  assert.equal(sorted[0].name, "สุดารัตน์ สะอาดดวงกมล", "ชื่อขึ้นต้นด้วยคำที่พิมพ์ต้องมาก่อน");
  assert.equal(sorted[1].name, "พรรณิภา สุดามาตร์", "คำใดคำหนึ่งขึ้นต้นด้วย มาก่อนที่โผล่กลางคำ");
  assert.ok(sorted.slice(2).every((r) => rankQueueMatch(r, "สุดา") === 10));
});

test("ค้นด้วยเบอร์ เบอร์ที่ตรงเป๊ะต้องมาก่อน", () => {
  const rows = [
    { name: "ก", phone: "0909515956", date: "2026-01-01" },
    { name: "ข", phone: "09095159560", date: "2026-12-31" },
  ];
  assert.equal(sortSearchResults(rows, "0909515956")[0].name, "ก");
});

test("ผลเยอะเกินต้องตัดให้เหลือเท่าที่อ่านไหว และบอกว่าตัด", () => {
  // วาด 200 แถว แถวละ 4-5 ปุ่ม = หน้าหน่วงทันทีที่พิมพ์ และคนอ่านก็ไล่ไม่ไหวอยู่ดี
  assert.match(page, /const SEARCH_PAGE_SIZE = 50;/);
  assert.match(page, /searchResults\.slice\(0, SEARCH_PAGE_SIZE\)/);
  assert.match(page, /แสดง \{searchItems\.length\} จากที่เจอทั้งหมด \{searchResults\.length\} คิว/);
});

test("พิมพ์แล้วต้องไม่วาดตารางใหม่ทุกตัวอักษร", () => {
  assert.match(page, /const QueueDataTableMemo = memo\(QueueDataTable\);/);
  assert.match(page, /const tableProps = useMemo\(\(\) => \(\{/,
    "props ต้อง identity คงที่ ไม่งั้น memo ไม่ช่วยอะไรเลย");
  assert.ok(!/<QueueDataTable /.test(page), "ต้องใช้ตัวที่ห่อ memo ทุกที่");
});
