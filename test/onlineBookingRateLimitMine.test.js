import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RATE_LIMITED_TEXT, rateLimitText, MINE_KEY, loadMine, rememberMine, clashWithMine } from "../src/utils/publicBooking.js";

// จองออนไลน์ 16 พ.ย. 2569: (1) กดถี่ — ไม่นับครั้งที่โดนบล็อก + บอกเวลารอ (2) ทำเครื่องหมายเวลาที่ทับคิวที่เพิ่งจองในเครื่องนี้ (เตือนอย่างเดียว)
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const edge = read("../supabase/functions/public-booking/index.ts");
const page = read("../src/pages/PublicBookingPage.jsx");
const api = read("../src/utils/onlineBookingApi.js");

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test("ข้อความกดถี่: บอกนาทีที่ต้องรอ, เกินชั่วโมง = ให้ทักแอดมิน, ไม่มีข้อมูล = ข้อความเดิม", () => {
  assert.equal(rateLimitText(undefined), RATE_LIMITED_TEXT);
  assert.equal(rateLimitText(null), RATE_LIMITED_TEXT);
  assert.equal(rateLimitText(0), RATE_LIMITED_TEXT);
  assert.equal(rateLimitText("x"), RATE_LIMITED_TEXT);
  assert.match(rateLimitText(4), /รออีกประมาณ 4 นาที/);
  assert.match(rateLimitText(3.2), /รออีกประมาณ 4 นาที/);
  assert.match(rateLimitText(60), /รออีกประมาณ 60 นาที/);
  assert.match(rateLimitText(61), /ครบจำนวนแล้ว.*LINE @classclinic/);
  assert.doesNotMatch(rateLimitText(900), /เบอร์/); // ห้ามบอกลูกค้าว่าตรวจจากเบอร์
});

test("ตัวกลาง public-booking: ไม่นับครั้งที่โดนบล็อก (429) และส่งนาทีที่ต้องรอ", () => {
  // นับ + หาเวลาที่ว่าง ต้องตัด 429 ทั้งสองจุด
  assert.equal((edge.match(/\.neq\("status", 429\)/g) || []).length, 2);
  assert.match(edge, /respond\(\{ error: "RATE_LIMITED", retry_after_minutes: waitMinutes \}, 429, origin\)/);
  assert.match(edge, /if \(error\) return 0; \/\/ นับไม่ได้ = ไม่บล็อกลูกค้าปกติ/);
  // เพดานเท่าเดิม ไม่ได้ผ่อน
  assert.match(edge, /book: \[\[5, 10\], \[20, 24 \* 60\]\],/);
  assert.doesNotMatch(edge, /overRateLimit/);
});

test("ตัวกลาง public-booking: ตัดตัวอักษรล่องหนออกจากชื่อก่อนส่งเข้าระบบ", () => {
  assert.match(edge, /const cleanName = \(v: unknown\) => str\(v, 200\)\.replace\(\/\[\\u200B-\\u200D\\u2060\\uFEFF\]\/g, ""\);/);
  assert.match(edge, /p_name: cleanName\(body\.name\),/);
  const cleanName = (v) => String(v).slice(0, 200).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  assert.equal(cleanName("พัช\u200Bราภรณ์\u200B ขัน\u200Bเงิน\u200B"), "พัชราภรณ์ ขันเงิน");
  assert.equal(cleanName("สมใจ ใจดี"), "สมใจ ใจดี");
});

test("หน้าจอง: ส่งนาทีที่ต้องรอไปแสดง", () => {
  assert.match(api, /err\.retryAfterMinutes = retryAfterMinutes;/);
  assert.match(page, /err\.code === "RATE_LIMITED" \? rateLimitText\(err\.retryAfterMinutes\)/);
});

test("คิวที่เพิ่งจองในเครื่อง: เก็บ/โหลด/ตัดของเก่า/พังไม่ล้ม", () => {
  const today = "2026-11-16";
  const st = memoryStorage({ [MINE_KEY]: JSON.stringify([
    { date: "2026-11-15", time: "10:00", end_time: "10:30", service: "เก่า" },
    { date: "2026-11-20", time: "15:00", end_time: "15:30", service: "Botox", phone: "0812345678" },
    { date: "bad", time: "10:00", end_time: "10:30" },
    { date: "2026-11-20", time: "16:00", end_time: "15:00" },
  ]) });
  const list = loadMine(today, st);
  assert.deepEqual(list, [{ date: "2026-11-20", time: "15:00", end_time: "15:30", service: "Botox" }]); // ไม่เก็บเบอร์
  const next = rememberMine(list, { date: "2026-11-20", time: "16:00", end_time: "17:00", service: "Hifu" }, today, st);
  assert.equal(next.length, 2);
  assert.equal(JSON.parse(st.data[MINE_KEY]).length, 2);
  assert.equal(rememberMine(next, { date: "2026-11-20", time: "16:00", end_time: "17:00", service: "Hifu" }, today, st).length, 2); // ไม่ซ้ำ
  // เก็บไม่เกิน 20 รายการ
  let many = [];
  for (let i = 0; i < 30; i++) many = rememberMine(many, { date: "2026-11-21", time: `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, end_time: "23:00" }, today, st);
  assert.equal(many.length, 20);
  // ที่เก็บพัง/โหมดส่วนตัว: ไม่ล้ม
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadMine(today, broken), []);
  assert.equal(rememberMine([], { date: "2026-11-20", time: "15:00", end_time: "15:30" }, today, broken).length, 1);
  assert.deepEqual(loadMine(today, memoryStorage({ [MINE_KEY]: "{not json" })), []);
  assert.deepEqual(loadMine(today, undefined), []);
});

test("คิวที่เพิ่งจองในเครื่อง: เช็คเวลาทับ (ชนขอบพอดีไม่นับว่าทับ)", () => {
  const list = [{ date: "2026-11-20", time: "15:00", end_time: "15:30", service: "Botox" }];
  assert.equal(clashWithMine(list, "2026-11-20", "15:00", 30)?.service, "Botox");
  assert.equal(clashWithMine(list, "2026-11-20", "14:30", 60)?.service, "Botox");
  assert.equal(clashWithMine(list, "2026-11-20", "14:30", 30), null); // จบ 15:00 พอดี
  assert.equal(clashWithMine(list, "2026-11-20", "15:30", 30), null); // เริ่มตอนคิวเดิมจบ
  assert.equal(clashWithMine(list, "2026-11-21", "15:00", 30), null); // คนละวัน
  assert.equal(clashWithMine(list, "2026-11-20", "15:00", 0), null);
  assert.equal(clashWithMine([], "2026-11-20", "15:00", 30), null);
});

test("หน้าจอง: เวลาที่ทับแค่ทำเครื่องหมาย ยังกดได้ (ไม่บล็อก) — เซิร์ฟเวอร์ตัดสินเหมือนเดิม", () => {
  assert.match(page, /<button key=\{s\.start_time\} type="button" disabled=\{!s\.available\}/);
  assert.doesNotMatch(page, /disabled=\{[^}]*clash/);
  assert.match(page, /const \[mine, setMine\] = useState\(\(\) => loadMine\(today\)\);/);
  assert.match(page, /setMine\(\(prev\) => rememberMine\(prev, \{ date: result\.date, time: result\.time, end_time: endTime, service: result\.service \}, today\)\);/);
  assert.match(page, /err\.code === "CUSTOMER_TIME_CONFLICT" && err\.conflict\?\.time && err\.conflict\?\.end_time/);
  // ไม่บอกลูกค้าว่าตรวจจากเบอร์
  assert.doesNotMatch(page, /ทับกับคิวที่เพิ่งจองไว้[^"<]*เบอร์/);
});
