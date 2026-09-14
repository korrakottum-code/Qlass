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

test("ตอนค้นหาต้องไม่ยึดตารางของวันที่เลือกไปทั้งหน้า", () => {
  // #186 เคยให้ผลค้นหาแทนที่มุมมองรายวันทั้งหมด หน้าร้านเสียมุมมอง "งานวันนี้" ซึ่งใช้
  // วันละหลายสิบครั้ง ส่วนการตามหาคนข้ามวันเกิดวันละไม่กี่ครั้ง (หน้าร้านแจ้ง 13 ก.ย. 2569)
  assert.ok(!/โหมดค้นหา: แทนที่มุมมองรายวันทั้งหมด/.test(page));
  assert.match(page, /const elsewhere = useMemo\(/, "ต้องแยกเป็น 'คิวที่อยู่นอกมุมมองนี้'");
  assert.match(page, /!visibleIds\.has\(q\.id\)/, "ต้องไม่โชว์ซ้ำกับที่อยู่ในตารางแล้ว");
});

test("บรรทัดเตือนนับเฉพาะคิวข้างหน้า ไม่นับประวัติเก่า", () => {
  // ลูกค้าประจำมีประวัติหลายใบ ถ้านับด้วย บรรทัดนี้จะขึ้นเลขทุกครั้งจนไม่มีใครอ่าน
  // ข้อมูลจริง: ลูกค้า 115,979 คน มีแค่ 6,087 คนที่มีคิวข้างหน้าค้างอยู่
  const start = page.indexOf("const elsewhereUpcoming");
  const block = page.slice(start, start + 500);
  assert.match(block, /q\.date >= today/);
  assert.match(block, /isActiveQueueStatus/);
  assert.match(block, /!== "done"/);
});

test("ตัวกรองด้านบนต้องกลับมาทำงานตอนค้นหา", () => {
  // ชิปสรุปสถานะและแบนเนอร์เตือนถูกซ่อนไว้ตอน #186 เพราะผลค้นหายึดทั้งหน้า
  // ตอนนี้ตารางรายวันเป็นพระเอกเหมือนเดิม ตัวเลขพวกนี้จึงต้องกลับมา
  assert.ok(!/\{!searching && statusChips\.length > 0/.test(page));
  assert.ok(!/\{!searching && overdueCount > 0/.test(page));
});

test("ไม่เจอในวันที่เลือก ห้ามชวนให้ไปลงคิวใหม่", () => {
  // "ยังไม่มีคิว — ไปบันทึกคิวก่อนเลย!" คือประโยคที่ทำให้หน้าร้านลงคิวซ้ำทับของเดิม
  assert.match(page, /ไม่เจอ "\$\{searchTerm\}" ใน\$\{isRange \? "ช่วงวันที่นี้" : "วันที่เลือก"\}/);
  assert.match(page, /แต่เจอในวันอื่น \{elsewhere\.length\} คิว/);
});

test("ค้นครบทั้งระบบแล้วไม่เจอจริง ต้องบอกให้ชัด", () => {
  // ต่างจาก "ไม่เจอในวันนี้" ซึ่งไม่ได้แปลว่าไม่มี — ประโยคนี้คือสิ่งที่ทำให้กล้าลงใหม่
  assert.match(page, /const foundNowhere = searching && searchStatus === "done" && searchResults\.length === 0;/);
  assert.match(page, /ไม่พบ "\{searchTerm\}" ในระบบเลย/);
});

test("แผงกางต้องหุบเองเมื่อเปลี่ยนคำค้น", () => {
  // เก็บเป็น "คำค้นที่กางไว้" ไม่ใช่บูลีน จะได้ไม่ต้องมี effect คอยรีเซ็ต (setState ใน
  // effect ทำให้ render ซ้อน และ lint ของโปรเจกต์นี้ก็ห้ามไว้)
  assert.match(page, /const \[expandedFor, setExpandedFor\] = useState\(""\);/);
  assert.match(page, /const showElsewhere = expandedFor === searchTerm;/);
});

test("ผลที่อยู่นอกมุมมองต้องตัดให้เหลือเท่าที่อ่านไหว", () => {
  assert.match(page, /const SEARCH_PAGE_SIZE = 50;/);
  assert.match(page, /elsewhere\.slice\(0, SEARCH_PAGE_SIZE\)/);
  assert.match(page, /แสดง \{elsewhereItems\.length\} จาก \{elsewhere\.length\}/);
});

test("ยังพิมพ์ไม่หยุด ต้องบอกว่าตัวเลขยังไม่ใช่ของคำล่าสุด", () => {
  assert.match(page, /const searchPending = qfSearch\.trim\(\) !== appliedSearch;/);
  assert.match(page, /กำลังพิมพ์/);
});

test("ต้องรอให้พิมพ์นิ่งก่อน ไม่กรอง/ไม่ยิงหาใหม่ทุกตัวอักษร", () => {
  assert.match(page, /const \[appliedSearch, setAppliedSearch\] = useState\(""\);/);
  assert.match(page, /setTimeout\(\(\) => setAppliedSearch\(qfSearch\.trim\(\)\), SEARCH_DEBOUNCE_MS\)/);
  assert.match(page, /const searchTerm = appliedSearch;/);
});

test("ตัวอักษรเดียวยังไม่กรองอะไร", () => {
  assert.match(page, /if \(!isSearchable\(appliedSearch\)\) return true;/);
});

test("ลบคิวจากผลค้นหาแล้วแถวต้องหายทันที", () => {
  assert.match(page, /const \[deletedInSearch, setDeletedInSearch\]/);
  assert.match(page, /for \(const id of deletedInSearch\) byId\.delete\(id\);/);
});

test("ลบไม่สำเร็จต้องไม่ซ่อนแถว", () => {
  assert.match(page, /\.then\(\(\) => setDeletedInSearch/);
  assert.match(page, /\.catch\(\(\) => \{\}\)/);
});

test("เรียงให้ที่ตรงกว่าขึ้นก่อน", () => {
  const rows = [
    { name: "นางสาวสุดารักษ์ คำสุนันท์", phone: "0874261585", date: "2026-10-25" },
    { name: "น.ส เชษฐ์สุดา นนมุต", phone: "0840327944", date: "2026-10-24" },
    { name: "สุดารัตน์ สะอาดดวงกมล", phone: "0814364184", date: "2026-10-09" },
    { name: "พรรณิภา สุดามาตร์", phone: "0661535539", date: "2026-10-03" },
  ];
  const sorted = sortSearchResults(rows, "สุดา");
  assert.equal(sorted[0].name, "สุดารัตน์ สะอาดดวงกมล");
  assert.equal(sorted[1].name, "พรรณิภา สุดามาตร์");
  assert.ok(sorted.slice(2).every((r) => rankQueueMatch(r, "สุดา") === 10));
});

test("ค้นด้วยเบอร์ เบอร์ที่ตรงเป๊ะต้องมาก่อน", () => {
  const rows = [
    { name: "ก", phone: "0909515956", date: "2026-01-01" },
    { name: "ข", phone: "09095159560", date: "2026-12-31" },
  ];
  assert.equal(sortSearchResults(rows, "0909515956")[0].name, "ก");
});

test("ด่านกันหน้าค้างต้องยังอยู่ครบ", () => {
  // ช่วงยาวเกิน 7 วัน + ทุกสาขา = คิวหลายพันแถวในหน้าเดียว หน้าค้างแน่
  // ตอนรื้อโหมดค้นหาออก บล็อกนี้เกือบหลุดหายไปด้วย (13 ก.ย. 2569)
  assert.match(page, /\{needsBranch \? \(/);
  assert.match(page, /ยังไม่ได้แสดงตาราง — ไม่ใช่ว่าไม่มีคิว/);
  assert.match(page, /ให้พิมพ์ชื่อหรือเบอร์ในช่อง "ค้นหา" ด้านบนได้เลย/,
    "ด่านนี้ต้องบอกทางที่ถูกด้วย ไม่ใช่บอกแค่ว่าให้เลือกสาขา");
});

test("ลำดับการแสดงผลต้องครบสามทาง", () => {
  // needsBranch -> ตารางว่าง -> ตารางจริง ถ้าขาดทางใดทางหนึ่งจะได้หน้าขาวหรือหน้าค้าง
  const i = page.indexOf("{needsBranch ? (");
  const j = page.indexOf("filteredQueues.length === 0 && waitingQueues.length === 0 ? (", i);
  const k = page.indexOf("groupedData.map(", j);
  assert.ok(i > 0 && j > i && k > j, "ลำดับ needsBranch -> ว่าง -> ตาราง ต้องอยู่ครบตามนี้");
});
