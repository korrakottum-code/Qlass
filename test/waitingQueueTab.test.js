import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// คิวรอต้องค้นหาเจอในหน้าตารางคิว
//
// คิวรอไม่มี "วันนัด" — คอลัมน์ date คือวันที่ลงคิวไว้เฉย ๆ คนที่ลงคิวรอไว้เมื่อเดือนก่อน
// จึงอยู่นอกหน้าต่าง 30 วันที่แอปโหลดตอนเปิด และเดิมหน้าตารางคิวก็กรองคิวรอทิ้งทั้งหมด
// ผลคือลูกค้าที่ยังรออยู่จริงหาไม่เจอเลยทั้งหน้า (เจ้าของแจ้ง 11 ก.ย. 2569)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const page = read("../src/pages/QueueTablePage.jsx");
const app = read("../src/App.jsx");
const service = read("../src/utils/supabaseService.js");

test("ดึงคิวรอต้องไม่ผูกกับช่วงวันที่", () => {
  const start = service.indexOf("export async function fetchWaitingQueues");
  assert.ok(start > 0, "หา fetchWaitingQueues ไม่เจอ");
  const fn = service.slice(start, service.indexOf("\n}", start));
  assert.match(fn, /\.eq\("status", "waiting_queue"\)/);
  assert.ok(!/gte\("date"|lte\("date"/.test(fn),
    "ห้ามกรองวันที่ ไม่งั้นคิวรอเก่ากว่า 30 วันจะยังหายเหมือนเดิม");
  assert.match(fn, /range\(page \* PAGE_SIZE/, "ต้องแบ่งหน้า ไม่ใช่เชื่อ limit ปริยายของ Supabase");
});

test("โหลดคิวรอหลังก้อนหลักลงแล้ว ไม่ใช่พร้อมกัน", () => {
  // setQueues ของการโหลดหลักเป็นการเขียนทับทั้งก้อน ยิงพร้อมกันแล้วคิวรอที่ merge ไว้จะโดนล้าง
  assert.match(app, /if \(isDataReady\) loadWaitingBacklog\(\);/);
});

test("โหลดคิวรอต้องไม่ mark ว่าโหลดช่วงวันที่นั้นครบแล้ว", () => {
  // ก้อนนี้เลือกด้วยสถานะ ไม่ใช่ช่วงวัน — mark แล้วคิวสถานะอื่นของวันเดียวกันจะไม่ถูกโหลดตามมา
  const start = app.indexOf("const loadWaitingBacklog");
  assert.ok(start > 0, "หา loadWaitingBacklog ไม่เจอ");
  const fn = app.slice(start, app.indexOf("\n  }, [mergeFetchedQueues]);", start));
  assert.ok(!/loadedRangesRef/.test(fn));
  assert.match(fn, /mergeFetchedQueues\(await fetchWaitingQueues\(\), deletedIds\)/);
});

test("รายการคิวรอในหน้าตารางคิวต้องไม่ถูกกรองด้วยช่วงวันที่", () => {
  const start = page.indexOf("const waitingQueues = useMemo");
  assert.ok(start > 0, "หา waitingQueues ไม่เจอ");
  const memo = page.slice(start, page.indexOf("const waitingByBranch", start));
  assert.match(memo, /status \|\| "pending"\) === "waiting_queue"/);
  assert.match(memo, /\.filter\(matchesSearch\)/, "ต้องค้นหาได้ ไม่งั้นแก้ไม่ตรงปัญหา");
  assert.ok(!/rangeStart|rangeEnd/.test(memo),
    "กรองวันที่ตรงนี้แล้วจะนับไม่ได้ว่ามีคนค้างอยู่ก่อนหน้ากี่คน");
});

test("แท็บคิวรอแบ่งเป็นในช่วงวันที่ กับที่ค้างมาก่อนหน้า", () => {
  assert.match(page, /map\[bId\]\[inRange \? "inRange" : "earlier"\]\.push\(q\)/);
  assert.match(page, /ยังมีคนรออยู่ก่อนหน้าช่วงวันที่นี้อีก \{earlier\.length\} คน/);
  assert.match(page, /ดูคนที่รอทั้งหมด/, "ต้องกางดูคนที่รอมาก่อนหน้าได้ ไม่ใช่บอกจำนวนเฉย ๆ");
});

test("สาขาที่มีแต่คิวรอต้องยังโผล่ในหน้า", () => {
  // ไม่งั้นแท็บคิวรอหายทั้งสาขา เพราะเดิมคัดสาขาจากคิวที่ลงห้อง/เวลาแล้วเท่านั้น
  assert.match(page, /branches\s*\n?\s*\.filter\(\(b\) => branchMap\[b\.id\] \|\| waitingByBranch\[b\.id\]\)/);
  assert.match(page, /filteredQueues\.length === 0 && waitingQueues\.length === 0/);
});

test("แถวคิวรอต้องบอกวันที่ลงคิว ไม่ใช่ช่องเวลาว่าง", () => {
  assert.match(page, /waitingMode \? "ลงคิวเมื่อ" : "เวลา"/);
  assert.match(page, /waitingMode\b[\s\S]{0,400}isoToLocalDateStr\(q\.createdAt\)/);
});
