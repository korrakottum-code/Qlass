import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ORDER_FIRST, ORDER_INJECT, procedureOrderKind, addMinutes, floorToSlot, ceilToSlot } from "../src/utils/publicBooking.js";

// จองออนไลน์ ขั้น 2 (เจ้าของสั่ง 15 พ.ย. 2569)
//   ชิ้นที่ 1: Pico/Hifu/Ultraformer ต้องทำก่อนงานฉีด (Botox/Filler/Meso) — คนเดียวกัน = เบอร์+ชื่อเดียวกัน
//   ชิ้นที่ 2: เพดานคิวค้าง = ไม่เกิน 2 วัน วันละไม่เกิน 3 คิวต่อเบอร์ (เดิม 2 คิว)
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const coupon = read("../supabase/migrations/20261114120000_online_booking_coupon_count.sql");
const order = read("../supabase/migrations/20261115120000_online_booking_procedure_order.sql");
const days = read("../supabase/migrations/20261115130000_online_booking_day_limit.sql");
const fn = read("../supabase/functions/public-booking/index.ts");
const page = read("../src/pages/PublicBookingPage.jsx");
const mock = read("../scripts/screenshot/mockOnlineBookingApi.js");

const body = (sql) => {
  const start = sql.indexOf("create or replace function public.online_booking_create_v2(");
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf("\n$$;", start));
};
// บรรทัดโค้ด (ไม่นับคอมเมนต์/บรรทัดว่าง) — ใช้เทียบว่าเวอร์ชันใหม่ "เหมือนเดิมทุกบรรทัด" ยกเว้นส่วนที่ตั้งใจแก้
const codeLines = (b) => b.split("\n").map((l) => l.replace(/\s+--.*$/, "").trimEnd()).filter((l) => l.trim() && !/^\s*--/.test(l));

test("กลุ่มหัตถการตรงกันทั้งหน้าจอง และ SQL ทั้งสองไฟล์", () => {
  assert.deepEqual(ORDER_FIRST, ["Pico", "Hifu", "Ultraformer", "Go-Hifu"]);
  assert.deepEqual(ORDER_INJECT, ["Botox", "Filler", "Meso", "Go-Botox", "Go-Filler"]);
  const first = "('Pico', 'Hifu', 'Ultraformer', 'Go-Hifu')";
  const inject = "('Botox', 'Filler', 'Meso', 'Go-Botox', 'Go-Filler')";
  for (const sql of [order, days]) {
    const b = body(sql);
    assert.equal(b.split(first).length - 1, 2);
    assert.equal(b.split(inject).length - 1, 2);
  }
  assert.equal(procedureOrderKind("Pico"), "first");
  assert.equal(procedureOrderKind("Meso"), "inject");
  assert.equal(procedureOrderKind("Diode"), null);
  assert.equal(procedureOrderKind("วิตามินผิว"), null);
});

test("ชิ้นที่ 1: create_v2 เหมือนเวอร์ชันคูปองทุกบรรทัด เพิ่มแค่การเช็คลำดับ", () => {
  const before = codeLines(body(coupon));
  const after = codeLines(body(order));
  for (const line of before) assert.ok(after.includes(line), `หายไป: ${line}`);
  const added = after.filter((l) => !before.includes(l));
  assert.ok(added.length > 0 && added.length < 40, `เพิ่ม ${added.length} บรรทัด`);
  for (const l of added) assert.doesNotMatch(l, /\b(insert|update|delete)\b/i, `ห้ามเขียนข้อมูลเพิ่ม: ${l}`);
});

test("ชิ้นที่ 1: เช็คลำดับหลังล็อกเบอร์และหลังเช็คเวลาทับ ก่อนเลือกเตียง และคืนคิวที่ขวาง", () => {
  const b = body(order);
  const lock = b.indexOf("'online-booking-phone:' || v_digits");
  const clash = b.indexOf("'CUSTOMER_TIME_CONFLICT'");
  const rule = b.indexOf("'PROCEDURE_ORDER'");
  const rooms = b.indexOf("booking_api_candidate_rooms_v1(p_branch_id, v_proc)");
  assert.ok(lock > 0 && lock < clash && clash < rule && rule < rooms);
  // คนเดียวกัน = เบอร์ + ชื่อ (ไม่นับช่องว่าง/ตัวพิมพ์), ทุกคิวของวัน ไม่ใช่แค่คิวออนไลน์
  assert.match(b, /lower\(regexp_replace\(coalesce\(q\.name, ''\), '\[\[:space:\]\]\+', '', 'g'\)\) = lower\(regexp_replace\(v_name, '\[\[:space:\]\]\+', '', 'g'\)\)/);
  const ruleQuery = b.slice(b.indexOf("into v_order"), rule);
  assert.doesNotMatch(ruleQuery, /recorded_by/);
  assert.match(ruleQuery, /not in \('cancelled', 'no_show', 'rescheduled'\)/);
  // ทำก่อน: คิวฉีดที่เริ่มก่อนเราจบ; ฉีด: คิวทำก่อนที่จบหลังเราเริ่ม
  assert.match(ruleQuery, /v_kind = 'first'[\s\S]*q\.time_block < v_block \+ v_dur/);
  assert.match(ruleQuery, /v_kind = 'inject'[\s\S]*q\.time_block \+ coalesce\(q\.duration_blocks, qp\.blocks, 1\) > v_block/);
  assert.match(b, /'need', case when v_kind = 'first' then 'finish_by' else 'start_from' end/);
});

test("ชิ้นที่ 2: เพดานนับเป็นวัน (2 วัน) และวันละ 3 คิว — ส่วนอื่นเหมือนชิ้นที่ 1", () => {
  const before = codeLines(body(order));
  const after = codeLines(body(days));
  const removed = before.filter((l) => !after.includes(l));
  assert.deepEqual(removed.map((l) => l.trim()), [
    "c_max_upcoming int := 2;", "v_upcoming int;", "select count(*) into v_upcoming",
    "if v_upcoming >= c_max_upcoming then", "return jsonb_build_object('success', false, 'error_code', 'TOO_MANY_BOOKINGS');",
  ]);
  const b = body(days);
  assert.match(b, /c_max_booked_days int := 2;/);
  assert.match(b, /c_max_per_day int := 3;/);
  assert.match(b, /if v_same_day >= c_max_per_day then\s+return jsonb_build_object\('success', false, 'error_code', 'TOO_MANY_SAME_DAY'\)/);
  assert.match(b, /if v_same_day = 0 and v_other_days >= c_max_booked_days then\s+return jsonb_build_object\('success', false, 'error_code', 'TOO_MANY_DAYS'\)/);
  // ยังนับเฉพาะคิวจองออนไลน์ที่ค้าง และอยู่หลังล็อกเบอร์
  const count = b.slice(b.indexOf("into v_other_days, v_same_day"), b.indexOf("'TOO_MANY_SAME_DAY'"));
  assert.match(count, /q\.recorded_by = v_staff and q\.phone = v_digits and q\.date >= v_today/);
  assert.match(count, /not in \('cancelled', 'no_show', 'rescheduled', 'done'\)/);
  assert.ok(b.indexOf("'online-booking-phone:' || v_digits") < b.indexOf("into v_other_days, v_same_day"));
  // ชิ้นที่ 1 ต้องยังอยู่ (ไฟล์นี้ทับฟังก์ชันทั้งตัว)
  assert.ok(b.includes("'PROCEDURE_ORDER'"));
});

test("ทั้งสองไฟล์: แก้แค่ create_v2 สิทธิ์เดิม (service_role) ไม่แตะ v1", () => {
  for (const sql of [order, days]) {
    assert.doesNotMatch(sql, /function public\.online_booking_(slots|create)_v1\(/);
    assert.doesNotMatch(sql, /^\s*drop /im);
    assert.match(sql, /from public, anon, authenticated;/);
    assert.match(sql, /to service_role;/);
  }
});

test("migration ล่าสุดที่นิยาม create_v2 = ไฟล์เพดานวัน (มีทั้งสองกติกา)", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => fs.readFileSync(new URL(f, dir), "utf8").includes("create or replace function public.online_booking_create_v2("));
  assert.equal(files.at(-1), "20261115130000_online_booking_day_limit.sql");
});

test("public-booking: ส่งรายละเอียดคิวที่ขวาง (รวม need) เฉพาะเวลาทับ/ผิดลำดับ", () => {
  assert.match(fn, /data\?\.error_code === "CUSTOMER_TIME_CONFLICT" \|\| data\?\.error_code === "PROCEDURE_ORDER"/);
  assert.match(fn, /data\?\.conflict\?\.need === "finish_by" \|\| data\?\.conflict\?\.need === "start_from"/);
});

test("หน้าจอง: ข้อความผิดลำดับบอกเวลาที่เลือกได้, ไม่บอกว่าตรวจจากเบอร์, ล้างเวลาแล้วโชว์ที่การ์ดเวลา", () => {
  assert.match(page, /PROCEDURE_ORDER/);
  assert.match(page, /รบกวนเลือกเวลาเริ่มไม่เกิน \$\{latest\} น\./);
  assert.match(page, /รบกวนเลือกเวลาตั้งแต่ \$\{earliest\} น\. เป็นต้นไป/);
  assert.match(page, /err\.code === "PROCEDURE_ORDER"\) \{ setStartTime\(""\); loadSlots\(\); \}/);
  assert.match(page, /errorText\(err\.code, err\.conflict, couponMinutes\(service, couponCount\), \(slots \|\| \[\]\)\.map\(\(s\) => s\.time\)\)/);
  // เวลาที่ต้องเลือกอยู่นอกเวลาเปิดของวันนั้น → บอกให้เลือกวันอื่น (ไม่บอกเวลาที่ไม่มีปุ่ม)
  assert.match(page, /วันนั้นมีเวลาไม่พอให้ทำก่อนคิวนั้น รบกวนเลือกวันอื่น/);
  assert.match(page, /วันนั้นไม่มีเวลาหลังคิวนั้นแล้ว รบกวนเลือกวันอื่น/);
  assert.match(page, /TOO_MANY_DAYS: "คุณลูกค้ามีคิวจองออนไลน์ล่วงหน้าครบ 2 วันแล้ว/);
  assert.match(page, /TOO_MANY_SAME_DAY: "คุณลูกค้ามีคิวจองออนไลน์ในวันนั้นครบ 3 คิวแล้ว/);
  assert.match(page, /procedureOrderKind\(service\.service\) &&/);
  for (const m of page.matchAll(/"([^"\n]*คุณลูกค้า[^"\n]*)"|`([^`\n]*คุณลูกค้า[^`\n]*)`/g)) {
    assert.doesNotMatch(m[0], /เบอร์/, m[0]);
  }
  // เวลาเริ่มไม่เกิน = เวลาเริ่มคิวฉีด − ความยาวคิวที่จอง
  assert.equal(addMinutes("14:00", -30), "13:30");
  assert.equal(addMinutes("14:00", -80), "12:40");
  assert.equal(addMinutes("00:10", -30), "");
  // ปัดลงให้ตรงปุ่มเวลา (ทุก 30 นาที): Hifu 50 นาที ก่อน Botox 15:00 → เริ่มไม่เกิน 14:00 (ไม่ใช่ 14:10)
  assert.equal(floorToSlot(addMinutes("15:00", -50)), "14:00");
  assert.equal(floorToSlot("13:30"), "13:30");
  assert.equal(floorToSlot(""), "");
  // ปัดขึ้น: Hifu 18:30–19:20 → ฉีดได้ตั้งแต่ปุ่ม 19:30
  assert.equal(ceilToSlot("19:20"), "19:30");
  assert.equal(ceilToSlot("13:30"), "13:30");
  assert.equal(ceilToSlot("13:31"), "14:00");
  assert.equal(ceilToSlot(""), "");
  assert.match(page, /floorToSlot\(addMinutes\(conflict\.time/);
});

test("โหมดเดโม: ตัวจำลองทำกติกาเดียวกับเซิร์ฟเวอร์", async () => {
  assert.match(mock, /procedureOrderKind/);
  assert.match(mock, /TOO_MANY_DAYS/);
  assert.match(mock, /TOO_MANY_SAME_DAY/);
  const m = await import("../scripts/screenshot/mockOnlineBookingApi.js");
  const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
  const book = (d, promoId, t, name, phone) => m.bookPublic({ branchId: "b1", promoId, startTime: `${d}T${t}:00+07:00`, name, phone, customerType: "new", note: "", count: 1 })
    .then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e.code, conflict: e.conflict }));
  const d = day(9);
  const first = await book(d, "pr1", "17:00", "ทดสอบ ลำดับ", "0891230001"); // Botox 17:00
  if (first.ok) {
    const hifu = await book(d, "pr6", "18:00", "ทดสอบลำดับ", "0891230001");
    assert.equal(hifu.code, "PROCEDURE_ORDER");
    assert.equal(hifu.conflict.need, "finish_by");
    assert.equal(hifu.conflict.time, "17:00");
  }
});

test("หน้าจอง: กล่องข้อแนะนำก่อนจอง และข้อความถึงลูกค้าสุภาพทั้งหน้า (ไม่มี 'กรุณา' ห้วนๆ, ไม่บอกเพดาน/เบอร์)", () => {
  assert.match(page, /📌 ข้อแนะนำก่อนจองคิวค่ะ/);
  assert.match(page, /รบกวนจองแยกคิวละ 1 หัตถการนะคะ/);
  assert.match(page, /รบกวนเลือกเวลา Pico \/ Hifu \/ Ultraformer ไว้ก่อนเวลาฉีดนะคะ/);
  assert.match(page, /ใช้คูปองได้คิวละ 1–\{MAX_COUPONS\} ใบ/);
  assert.match(page, /จองล่วงหน้าได้ตั้งแต่ 2 ชั่วโมงถึง 14 วันค่ะ/);
  assert.match(page, /ขอบคุณที่ไว้วางใจ Class Clinic ค่ะ 🙏/);
  // กล่องข้อแนะนำไม่บอกเพดานคิว และไม่พูดถึงการตรวจจากเบอร์
  const box = page.slice(page.indexOf("📌 ข้อแนะนำก่อนจองคิวค่ะ"), page.indexOf("{loadError && <div style={S.error}>"));
  assert.doesNotMatch(box, /เบอร์|2 วัน|3 คิว/);
  assert.doesNotMatch(page, /กรุณา/);
});
