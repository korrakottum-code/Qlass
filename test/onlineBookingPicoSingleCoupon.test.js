import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SINGLE_COUPON, isSingleCoupon, couponMinutes } from "../src/utils/publicBooking.js";

// จองออนไลน์: Pico ไม่จำกัดช็อต ใช้คูปองใบเดียวพอ (เจ้าของสั่ง 15 พ.ย. 2569) — หัตถการอื่นยัง 1–3 ใบ
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const coupon = read("../supabase/migrations/20261114120000_online_booking_coupon_count.sql");
const days = read("../supabase/migrations/20261115130000_online_booking_day_limit.sql");
const pico = read("../supabase/migrations/20261115140000_online_booking_pico_single_coupon.sql");
const page = read("../src/pages/PublicBookingPage.jsx");
const mock = read("../scripts/screenshot/mockOnlineBookingApi.js");

const fnBody = (sql, name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf("\n$$;", start));
};
const codeLines = (b) => b.split("\n").map((l) => l.replace(/\s+--.*$/, "").trimEnd()).filter((l) => l.trim() && !/^\s*--/.test(l));
// บรรทัดที่หายไป / เพิ่มมา (เทียบแบบนับซ้ำ) — ต้องตรงกับที่ตั้งใจแก้เท่านั้น
function lineDiff(oldB, newB) {
  const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
  const a = count(codeLines(oldB)), b = count(codeLines(newB));
  const removed = [], added = [];
  for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) || 0); i++) removed.push(l.trim());
  for (const [l, n] of b) for (let i = 0; i < n - (a.get(l) || 0); i++) added.push(l.trim());
  return { removed: removed.sort(), added: added.sort() };
}

test("หน้าจอง: Pico นับ 1 ใบ เวลา 1 รอบ, หัตถการอื่นคูณจำนวนใบเหมือนเดิม", () => {
  assert.deepEqual(SINGLE_COUPON, ["Pico"]);
  const p = { service: "Pico", duration_minutes: 30 };
  const f = { service: "Filler", duration_minutes: 30 };
  assert.equal(isSingleCoupon(p), true);
  assert.equal(isSingleCoupon(f), false);
  assert.equal(isSingleCoupon(null), false);
  assert.equal(isSingleCoupon({ service: "pico" }), false); // ชื่อต้องตรงกับระบบ (SQL ใช้ = 'Pico')
  assert.equal(couponMinutes(p, 3), 30);
  assert.equal(couponMinutes(f, 3), 90);
});

test("หน้าจอง: Pico ไม่ขึ้นปุ่มเลือกจำนวนใบ ส่ง count = 1 เสมอ และข้อแนะนำบอกสั้นๆ", () => {
  assert.match(page, /\{service && !pickService && isSingleCoupon\(service\) && \(/);
  assert.match(page, /\{service && !pickService && !isSingleCoupon\(service\) && \(\s*<div style=\{\{ marginTop: 12 \}\}>\s*<div style=\{\{ fontSize: 14, marginBottom: 6 \}\}>ใช้คูปองกี่ใบคะ/);
  assert.match(page, /ไม่จำกัดช็อตค่ะ ใช้คูปองใบเดียวก็ทำได้เต็มที่/);
  assert.match(page, /count: isSingleCoupon\(service\) \? 1 : couponCount,/);
  assert.match(page, /ใช้คูปองได้คิวละ 1–\$\{MAX_COUPONS\} ใบ \(Pico ใบเดียวพอค่ะ\)/);
});

test("SQL slots_v2: ต่างจากเดิมแค่ Pico หาเวลา 1 รอบ", () => {
  const { removed, added } = lineDiff(fnBody(coupon, "online_booking_slots_v2"), fnBody(pico, "online_booking_slots_v2"));
  assert.deepEqual(removed, ["select r.branch_active, r.procedure_id, r.dur * p_count into v_active, v_proc, v_dur"]);
  assert.deepEqual(added, [
    "select p.name into v_pname from public.procedures p where p.id = v_proc;",
    "select r.branch_active, r.procedure_id, r.dur into v_active, v_proc, v_dur",
    "v_dur := v_dur * case when v_pname = 'Pico' then 1 else p_count end;",
    "v_pname text;",
  ].sort());
});

test("SQL create_v2: ต่างจากเวอร์ชันที่ใช้อยู่แค่ v_count (เวลา หมายเหตุ ผลตอบกลับ)", () => {
  const oldB = fnBody(days, "online_booking_create_v2");
  const newB = fnBody(pico, "online_booking_create_v2");
  const { removed, added } = lineDiff(oldB, newB);
  assert.deepEqual(removed, [
    "'[จองออนไลน์]' || case when p_count > 1 then ' คูปอง ' || p_count || ' ใบ' else '' end",
    "'branch', v_branch_name, 'service', v_promo_name, 'count', p_count,",
    "select r.branch_active, r.procedure_id, r.promo_id, r.price, r.dur * p_count, r.promo_name",
  ].sort());
  assert.deepEqual(added, [
    "'[จองออนไลน์]' || case when v_count > 1 then ' คูปอง ' || v_count || ' ใบ' else '' end",
    "'branch', v_branch_name, 'service', v_promo_name, 'count', v_count,",
    "select r.branch_active, r.procedure_id, r.promo_id, r.price, r.dur, r.promo_name",
    "v_count := case when v_pname = 'Pico' then 1 else p_count end;",
    "v_count int;",
    "v_dur := v_dur * v_count;",
  ].sort());
  // ชื่อหัตถการต้องหาก่อนคำนวณเวลา และก่อนกติกาลำดับหัตถการที่ใช้ v_pname / v_dur ต่อ
  const at = (s) => { const i = newB.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at("select p.name into v_pname") < at("v_dur := v_dur * v_count;"));
  assert.ok(at("v_dur := v_dur * v_count;") < at("'TOO_MANY_SAME_DAY'"));
  assert.ok(at("v_dur := v_dur * v_count;") < at("CUSTOMER_TIME_CONFLICT"));
  assert.equal(newB.split("select p.name into v_pname").length - 1, 1);
  // hash กันกดซ้ำยังใช้จำนวนที่ส่งมา (กดซ้ำด้วยข้อมูลเดิม = ผลเดิม)
  assert.match(newB, /'count:' \|\| p_count::text/);
  assert.match(newB, /if p_count is null or p_count < 1 or p_count > c_max_count then raise exception 'INVALID_COUNT'; end if;/);
});

test("SQL: สิทธิ์ยังเป็น service_role เท่านั้น", () => {
  assert.match(pico, /revoke all on function\s+public\.online_booking_slots_v2\(uuid, uuid, date, int\),\s+public\.online_booking_create_v2\(text, uuid, uuid, timestamptz, text, text, text, text, int\)\s+from public, anon, authenticated;/);
  assert.match(pico, /grant execute on function\s+public\.online_booking_slots_v2\(uuid, uuid, date, int\),\s+public\.online_booking_create_v2\(text, uuid, uuid, timestamptz, text, text, text, text, int\)\s+to service_role;/);
  assert.doesNotMatch(pico, /grant[^;]*\b(anon|authenticated)\b/i);
});

test("โหมดตัวอย่าง: Pico ส่ง 3 ใบได้ 1 ใบ 30 นาที, HIFU 3 ใบยังคูณ", async () => {
  assert.match(mock, /"Pico Laser": "Pico"/);
  assert.match(mock, /"pr15"/);
  const api = await import("../scripts/screenshot/mockOnlineBookingApi.js");
  const day = new Date(Date.now() + 3 * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const slotsP = await api.fetchPublicSlots("b1", "pr15", day, 3);
  const slotsP1 = await api.fetchPublicSlots("b1", "pr15", day, 1);
  assert.deepEqual(slotsP.map((s) => s.time), slotsP1.map((s) => s.time));
  const free = slotsP.find((s) => s.available);
  assert.ok(free, "ต้องมีเวลาว่างให้ Pico ในเดโม");
  const r = await api.bookPublic({ branchId: "b1", promoId: "pr15", startTime: free.start_time, name: "ทดสอบ พิโก", phone: "0812345671", customerType: "new", count: 3 });
  assert.equal(r.count, 1);
  const [hh, mm] = free.time.split(":").map(Number);
  assert.equal(r.end_time, `${String(hh + (mm + 30 >= 60 ? 1 : 0)).padStart(2, "0")}:${String((mm + 30) % 60).padStart(2, "0")}`);
  const slotsH = await api.fetchPublicSlots("b1", "pr6", day, 2);
  const freeH = slotsH.filter((s) => s.available).at(-1);
  assert.ok(freeH, "ต้องมีเวลาว่างให้ HIFU 2 ใบในเดโม");
  const h = await api.bookPublic({ branchId: "b1", promoId: "pr6", startTime: freeH.start_time, name: "ทดสอบ ไฮฟู", phone: "0812345672", customerType: "new", count: 2 });
  assert.equal(h.count, 2);
  const startMin = Number(freeH.time.slice(0, 2)) * 60 + Number(freeH.time.slice(3));
  assert.equal(Number(h.end_time.slice(0, 2)) * 60 + Number(h.end_time.slice(3)) - startMin, 100); // 50 นาที × 2
});
