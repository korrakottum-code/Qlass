import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  phoneDigits, phonesMatch, validateDepositForm, depositBookingState, canBookDeposit,
  depositToBookingForm, sumDepositStats, shouldLinkDeposit, formatPhone,
  DEPOSIT_COMMISSION_RATE, depositCommission, depositCommissionForRow,
} from "../src/utils/deposits.js";
import { ALL_ROLES, NAV_ITEMS } from "../src/utils/constants.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const sql = read("../supabase/migrations/20261123120000_transfer_deposits.sql").replace(/^\s*--.*$/gm, "");
const rollback = read("../supabase/rollback/20261123120000_transfer_deposits.sql");
const edge = read("../supabase/functions/staff-session/index.ts");
const app = read("../src/App.jsx");

// ─── ฐานข้อมูล: ข้อมูลลูกค้า/ยอดเงิน/สลิป ปิดจากคีย์หน้าเว็บ ───
test("ตาราง transfer_deposits เปิด RLS ไม่มี policy และถอนสิทธิ์จากคีย์หน้าเว็บ", () => {
  assert.match(sql, /alter table public\.transfer_deposits enable row level security;/i);
  assert.match(sql, /revoke all on table public\.transfer_deposits from anon, authenticated;/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("bucket สลิปเป็นส่วนตัว (public = false) และจำกัดชนิดไฟล์เป็นรูป", () => {
  assert.match(sql, /'deposit-slips', 'deposit-slips', false/);
  assert.match(sql, /on conflict \(id\) do update set public = false/);
  assert.match(sql, /allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
});

test("ฟังก์ชัน deposit_* ทุกตัวถอนสิทธิ์จาก public/anon/authenticated", () => {
  const fns = [...sql.matchAll(/create or replace function public\.(deposit_\w+)\(/gi)].map((m) => m[1]);
  assert.ok(fns.length >= 8, `พบ ${fns.length}`);
  for (const fn of fns) assert.match(sql, new RegExp(String.raw`revoke all on function public\.${fn}\(`, "i"), fn);
  assert.doesNotMatch(sql, /grant execute[^;]*to (anon|authenticated|public)/i);
});

test("สลิปบังคับ + 1 คิวผูกได้รายการเดียว + ยกเลิกต้องมีเหตุผล", () => {
  assert.match(sql, /slip_path\s+text not null/);
  assert.match(sql, /create unique index if not exists transfer_deposits_queue_uidx on public\.transfer_deposits \(queue_id\) where queue_id is not null/);
  assert.match(sql, /check \(\(cancelled_at is null\) = \(cancel_reason is null\)\)/);
});

test("ผูกคิว: ล็อกแถว ตรวจเบอร์ และผูกได้เฉพาะคิวใหม่หลังบันทึกการโอน (กันเอาคิวเก่ามาเพิ่มยอด)", () => {
  const body = sql.slice(sql.indexOf("function public.deposit_link_v1"), sql.indexOf("function public.deposit_cancel_v1"));
  assert.match(body, /for update/);
  assert.match(body, /queue_phone_mismatch/);
  assert.match(body, /deposit_already_booked/);
  assert.match(body, /v_queue\.created_at < v_row\.created_at then raise exception 'queue_not_new'/);
  assert.match(body, /v_queue\.status in \('done', 'cancelled', 'no_show', 'rescheduled'\) then raise exception 'queue_not_new'/);
  assert.match(body, /exception when unique_violation then\s+raise exception 'queue_already_linked'/);
});

test("ตามการเลื่อนนัดจริงของแอป (ไม่มี rescheduled_from_id): เบอร์+หัตถการเดิม สร้างใกล้เวลากดเลื่อน", () => {
  const fn = sql.slice(sql.indexOf("function public.deposit_current_queue"), sql.indexOf("function public.deposit_json"));
  assert.match(fn, /n\.phone = v_q\.phone/);
  assert.match(fn, /n\.procedure_id is not distinct from v_q\.procedure_id/);
  assert.match(fn, /v_q\.status_updated_at - interval '2 minutes' and v_q\.status_updated_at \+ interval '10 minutes'/);
  assert.match(sql, /not in \('cancelled', 'no_show', 'rescheduled'\)/);
});

test("ลบพนักงานต้องไม่ล้ม: recorded_by on delete set null (เหมือน queues.recorded_by)", () => {
  assert.match(sql, /recorded_by\s+uuid references public\.staff\(id\) on delete set null/);
  assert.doesNotMatch(sql, /references public\.staff\(id\) on delete restrict/);
  assert.match(sql, /references public\.queues\(id\) on delete set null/);
});

test("เบอร์ปลอม (เลขซ้ำทั้งเบอร์) บันทึกไม่ได้ ทั้งหน้าเว็บและฐานข้อมูล", () => {
  assert.match(sql, /if v_phone ~ '\^\(\.\)\\1\+\$' then raise exception 'invalid_phone'/);
  const ok = { customerName: "a", customerPhone: "0000000000", branchId: "b1", promoId: "p", amount: "1", recordDate: "2026-11-23", slipBase64: "x" };
  assert.match(validateDepositForm(ok, { today: "2026-11-23" }), /เบอร์จริง/);
});

test("migration ไม่แตะตารางเดิม (ไม่มี alter/drop/update ตาราง queues ฯลฯ)", () => {
  assert.doesNotMatch(sql, /alter table public\.(queues|staff|branches|promos|procedures)\b/i);
  assert.doesNotMatch(sql, /drop (table|function)/i);
  assert.doesNotMatch(sql, /update public\.(queues|staff|branches|promos|procedures)\b/i);
});

test("มีไฟล์ rollback ลบของใหม่ครบ", () => {
  assert.match(rollback, /drop table if exists public\.transfer_deposits/);
  assert.match(rollback, /delete from storage\.buckets where id = 'deposit-slips'/);
  for (const fn of [...sql.matchAll(/create or replace function public\.(deposit_\w+)\(/gi)].map((m) => m[1])) {
    assert.match(rollback, new RegExp(`drop function if exists public\\.${fn}\\(`), fn);
  }
});

// ─── edge function: สิทธิ์ตรวจฝั่งเซิร์ฟเวอร์ ───
test("staff-session: บทบาทสาขาถูกล็อกสาขาตัวเอง ผู้บันทึกมาจากเซสชัน ไม่ใช่เบราว์เซอร์", () => {
  const block = edge.slice(edge.indexOf('body.action.startsWith("deposit_")'));
  assert.match(block, /const ownBranch = branchScoped \? String\(current\.user\.branchId/);
  assert.match(block, /p_actor_staff_id: staffId, p_branch_id: branchId/);
  assert.doesNotMatch(block.slice(0, block.indexOf('"online_booking_settings"')), /recordedBy|recorded_by/);
  assert.match(edge, /depositCancelRoles = new Set\(\["superadmin", "head_admin", "admin"\]\)/);
  assert.match(edge, /depositAllStatsRoles = new Set\(\["superadmin", "head_admin", "ceo"\]\)/);
  assert.doesNotMatch(edge, /depositUseRoles = new Set\([^)]*"ceo"/);
});

test("staff-session: ตรวจชนิดสลิปจากไบต์จริง จำกัดขนาด และลบไฟล์ถ้าบันทึกไม่ผ่าน", () => {
  assert.match(edge, /const MAX_SLIP_BYTES = 1_500_000/);
  assert.match(edge, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8/);
  assert.match(edge, /storage\.from\("deposit-slips"\)\.remove\(\[path\]\)/);
  assert.match(edge, /createSignedUrl\(String\(path\), 60\)/);
});

// ─── เมนู/บทบาท ───
test("เมนู deposits: ทุกบทบาทที่ลงคิว + CEO (ดูยอดอย่างเดียว) และปิดด้วยสวิตช์ VITE_ENABLE_DEPOSITS", () => {
  assert.ok(NAV_ITEMS.some((n) => n.id === "deposits"));
  for (const r of ["ceo", "superadmin", "head_admin", "admin", "branch_manager", "cashier"]) {
    assert.ok(ALL_ROLES.find((x) => x.value === r).pages.includes("deposits"), r);
  }
  const constants = read("../src/utils/constants.js");
  assert.match(constants, /DEPOSITS_ENABLED = import\.meta\.env\?\.VITE_ENABLE_DEPOSITS === "true"/);
  assert.match(constants, /page !== "deposits" \|\| DEPOSITS_ENABLED/);
});

// ─── ตัวช่วยล้วน ───
test("เบอร์: ตัดขีด/ช่องว่าง เทียบตัวเลขล้วน", () => {
  assert.equal(phoneDigits("08-1234-5678"), "0812345678");
  assert.ok(phonesMatch("081 234 5678", "0812345678"));
  assert.ok(!phonesMatch("", ""));
  assert.ok(!phonesMatch("0812345678", "0812345679"));
  assert.equal(formatPhone("0812345678"), "081-234-5678");
});

test("ฟอร์มบันทึกการโอน: บังคับครบทุกช่อง + สลิป + วันที่ไม่ล่วงหน้า/ย้อนไม่เกิน 7 วัน", () => {
  const ok = { customerName: "ลูกค้า", customerPhone: "0812345678", branchId: "b1", promoId: "pr1", amount: "89", recordDate: "2026-11-23", slipBase64: "x" };
  const today = "2026-11-23";
  assert.equal(validateDepositForm(ok, { today }), null);
  assert.match(validateDepositForm({ ...ok, slipBase64: "" }, { today }), /สลิป/);
  assert.match(validateDepositForm({ ...ok, customerPhone: "123" }, { today }), /เบอร์/);
  assert.match(validateDepositForm({ ...ok, amount: "0" }, { today }), /ยอดโอน/);
  assert.match(validateDepositForm({ ...ok, promoId: "" }, { today }), /โปร/);
  assert.match(validateDepositForm({ ...ok, branchId: "" }, { today }), /สาขา/);
  assert.equal(validateDepositForm({ ...ok, branchId: "" }, { today, branchLocked: true }), null);
  assert.match(validateDepositForm({ ...ok, recordDate: "2026-11-24" }, { today }), /ล่วงหน้า/);
  assert.equal(validateDepositForm({ ...ok, recordDate: "2026-11-16" }, { today }), null);
  assert.match(validateDepositForm({ ...ok, recordDate: "2026-11-15" }, { today }), /7 วัน/);
});

test("สถานะคอลัมน์จองลงคิว", () => {
  assert.equal(depositBookingState({}), "waiting");
  assert.equal(depositBookingState({ cancelledAt: "x" }), "cancelled");
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "pending" } }), "booked");
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "rescheduled_in" } }), "booked");
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "done" } }), "done");
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "waiting_queue", date: "2026-11-23" } }), "waitlist");
  assert.ok(!canBookDeposit({ queueId: "q", booking: { status: "waiting_queue" } }));
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "cancelled" } }), "lost");
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "no_show" } }), "lost");
  assert.equal(depositBookingState({ queueId: "q", booking: null }), "lost"); // คิวถูกลบ
  assert.equal(depositBookingState({ queueId: "q", booking: { status: "rescheduled" } }), "lost"); // เลื่อนออก ยังไม่มีวันใหม่
  assert.ok(canBookDeposit({}));
  assert.ok(canBookDeposit({ queueId: "q", booking: { status: "cancelled" } }));
  assert.ok(!canBookDeposit({ queueId: "q", booking: { status: "confirmed" } }));
  assert.ok(!canBookDeposit({ cancelledAt: "x" }));
});

test("เลือกวันที่: กรอกฟอร์มคิวล่วงหน้า แต่ไม่เลือกประเภทลูกค้าให้", () => {
  const promos = [{ id: "pr10", name: "Diode รักแร้", procedureId: "p8", price: 990, active: true }];
  const f = depositToBookingForm(
    { customerName: "ลูกค้า 1", customerPhone: "081-234-5678", branchId: "b1", promoId: "pr10", procedureId: "p8", amount: 89, recordDate: "2026-11-22" },
    { promos, procedures: [{ id: "p8" }], emptyForm: { customerType: "", status: "pending", date: "2026-11-23" } },
  );
  assert.equal(f.name, "ลูกค้า 1");
  assert.equal(f.phone, "0812345678");
  assert.equal(f.branchId, "b1");
  assert.equal(f.procedureId, "p8");
  assert.equal(f.promoId, "pr10");
  assert.equal(f.price, 990);
  assert.equal(f.customerType, "");
  assert.equal(f.status, "pending");
  assert.match(f.note, /โอนแล้ว 89 บาท/);
  // โปรถูกปิดใช้งาน: ไม่เลือกโปรที่ปิดให้
  const off = depositToBookingForm({ customerName: "a", customerPhone: "0812345678", branchId: "b1", promoId: "pr10", procedureId: "p8", amount: 1 }, { promos: [{ ...promos[0], active: false }], procedures: [{ id: "p8" }] });
  assert.equal(off.promoId, "");
  assert.equal(off.procedureId, "p8");
});

test("ผูกคิวเฉพาะคิวใหม่ที่เบอร์ตรงกับรายการโอน", () => {
  const dep = { id: "d1", customerPhone: "0812345678" };
  assert.ok(shouldLinkDeposit(dep, { newQueue: { id: "q1", phone: "081-234-5678" }, editing: false }));
  assert.ok(!shouldLinkDeposit(dep, { newQueue: { id: "q1", phone: "0899999999" }, editing: false }));
  assert.ok(!shouldLinkDeposit(dep, { newQueue: { id: "q1", phone: "0812345678" }, editing: true }));
  assert.ok(!shouldLinkDeposit(null, { newQueue: { id: "q1", phone: "0812345678" }, editing: false }));
  assert.ok(!shouldLinkDeposit(dep, { newQueue: null, editing: false }));
});

test("ยอดรวมแถวสุดท้าย", () => {
  const sum = sumDepositStats([
    { count: 2, amount: 178, bookedCount: 1, bookedAmount: 89, doneCount: 0, doneAmount: 0 },
    { count: 1, amount: "290", bookedCount: 1, bookedAmount: 290, doneCount: 1, doneAmount: 290 },
  ]);
  // ไม่ส่งรายชื่อพนักงาน = ไม่รู้ตำแหน่ง → ไม่มีใครได้ค่าคอม
  assert.deepEqual(sum, { count: 3, amount: 468, bookedCount: 2, bookedAmount: 379, doneCount: 1, doneAmount: 290, commission: 0 });
});

test("ค่าคอม 2% เฉพาะตำแหน่งแอดมิน (เจ้าของตอบ: แค่ แอดมิน)", () => {
  const staff = [
    { id: "a", role: "admin" }, { id: "h", role: "head_admin" }, { id: "s", role: "superadmin" },
    { id: "m", role: "branch_manager" }, { id: "c", role: "cashier" },
  ];
  assert.equal(depositCommissionForRow({ staffId: "a", amount: 1000 }, staff), 20);
  for (const id of ["h", "s", "m", "c"]) assert.equal(depositCommissionForRow({ staffId: id, amount: 1000 }, staff), null, id);
  assert.equal(depositCommissionForRow({ staffId: null, amount: 1000 }, staff), null); // พนักงานถูกลบ
  assert.equal(depositCommissionForRow({ staffId: "zz", amount: 1000 }, staff), null);
  const rows = [{ staffId: "a", amount: 89 }, { staffId: "c", amount: 290 }, { staffId: "a", amount: 790 }];
  assert.equal(sumDepositStats(rows, staff).commission, 17.58); // 1.78 + 15.80 (แคชเชียไม่นับ)
  assert.equal(sumDepositStats(rows, staff).amount, 1169);
});

test("ค่าคอม 2% ของยอดโอน ได้ทันทีที่บันทึก (เจ้าของกำหนด 23 พ.ย. 2569)", () => {
  assert.equal(DEPOSIT_COMMISSION_RATE, 0.02);
  assert.equal(depositCommission(89), 1.78);
  assert.equal(depositCommission(290), 5.8);
  assert.equal(depositCommission("790"), 15.8);
  assert.equal(depositCommission(0), 0);
  assert.equal(depositCommission(null), 0);
  assert.equal(depositCommission(12345.67), 246.91);
  // คิดจากคอลัมน์ "บันทึกทั้งหมด" (amount) ไม่ใช่ยอดจองแล้ว/มาทำแล้ว
  const page = read("../src/pages/DepositPage.jsx");
  assert.match(page, /depositCommissionForRow\(r, staff\)/);
  assert.match(read("../src/utils/deposits.js"), /return depositCommission\(row\.amount\)/);
  assert.match(read("../src/App.jsx"), /<DepositPage[\s\S]{0,200}staff=\{staff\}/);
});

// ─── App.jsx: การจองปกติไม่เปลี่ยน ผูกเฉพาะตอนมาจากรายการโอน และคิวไม่ล้มถ้าผูกไม่ได้ ───
test("App: ผูกคิวหลังบันทึกเฉพาะตอนมี depositBooking และเลิกจองเมื่อออกจากหน้าบันทึกคิว", () => {
  assert.match(app, /if \(depositBooking\) \{[\s\S]*?shouldLinkDeposit\(deposit, \{ newQueue, editing: false \}\)/);
  assert.match(app, /\} else \{\s*showToast\("success", "บันทึกคิวเรียบร้อย ✓"\);\s*\}/);
  assert.match(app, /if \(page !== "booking"\) clearDepositBooking\(\);/);
  assert.match(app, /setPendingDepositLink\(\{ depositId: deposit\.id, queueId: newQueue\.id/);
  // ค้างผูกไม่สำเร็จต้องรอดรีเฟรช (เก็บเฉพาะ id ไม่เก็บชื่อ/เบอร์)
  assert.match(app, /localStorage\.setItem\("qlass_pending_deposit_link", JSON\.stringify\(\{ depositId: value\.depositId, queueId: value\.queueId \}\)\)/);
});

test("depositRecordedAt: เวลาไทยจาก createdAt และบอกเมื่อวันที่กดบันทึกไม่ตรงกับวันที่บันทึก", async () => {
  const { depositRecordedAt } = await import("../src/utils/deposits.js");
  assert.deepEqual(depositRecordedAt("2026-11-26T07:32:10.123Z", "2026-11-26"), { date: "2026-11-26", time: "14:32", sameDay: true });
  // 23:05 UTC = 06:05 วันถัดไปเวลาไทย
  assert.deepEqual(depositRecordedAt("2026-11-25T23:05:00Z", "2026-11-26"), { date: "2026-11-26", time: "06:05", sameDay: true });
  assert.deepEqual(depositRecordedAt("2026-11-26T03:00:00+00:00", "2026-11-24"), { date: "2026-11-26", time: "10:00", sameDay: false });
  assert.equal(depositRecordedAt(null, "2026-11-26"), null);
  assert.equal(depositRecordedAt("not-a-date", "2026-11-26"), null);
});

test("summarizeDepositsByPromo: แยกตามโปร ไม่นับยกเลิก จองแล้วรวมคิวรอ/มาแล้ว", async () => {
  const { summarizeDepositsByPromo } = await import("../src/utils/deposits.js");
  const rows = [
    { promoName: "Bienox", amount: 2990, booking: { status: "booked" } },
    { promoName: "Bienox", amount: 2990, booking: null },
    { promoName: "Bienox", amount: 2990, booking: { status: "done" } },
    { promoName: "ปรึกษา botox", amount: 500, booking: { status: "waiting_queue" } },
    { promoName: null, procedureName: "ใช้คอร์ส", amount: 0.1, booking: { status: "cancelled" } },
    { promoName: "Bienox", amount: 2990, cancelledAt: "2026-11-26T03:00:00Z", booking: { status: "booked" } },
  ];
  const s = summarizeDepositsByPromo(rows);
  assert.equal(s.count, 5);
  assert.equal(s.amount, 9470.1);
  assert.equal(s.booked, 3);
  assert.equal(s.waiting, 2);
  assert.deepEqual(s.promos.map((p) => [p.name, p.count, p.amount, p.booked, p.waiting]), [
    ["Bienox", 3, 8970, 2, 1],
    ["ปรึกษา botox", 1, 500, 1, 0],
    ["ใช้คอร์ส", 1, 0.1, 0, 1],
  ]);
  assert.deepEqual(summarizeDepositsByPromo([]), { count: 0, amount: 0, booked: 0, waiting: 0, promos: [] });
});

test("แก้โปร: ฟังก์ชันใหม่ปิดจากคีย์หน้าเว็บ แก้ได้เฉพาะโปร เก็บประวัติ และเซิร์ฟเวอร์ล็อกสาขา", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261126120000_deposit_edit_promo.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on function public\.deposit_update_promo_v1\(uuid, uuid, uuid, uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.deposit_update_promo_v1\(uuid, uuid, uuid, uuid\) to service_role;/);
  assert.match(sql, /revoke all on function public\.deposit_json\(public\.transfer_deposits\) from public, anon, authenticated;/);
  assert.match(sql, /for update;/);
  assert.match(sql, /edit_log = coalesce\(edit_log, '\[\]'::jsonb\) \|\|/);
  // ห้ามแตะยอดโอน/ชื่อ/เบอร์/สาขา
  const update = sql.slice(sql.indexOf("update public.transfer_deposits"), sql.indexOf("returning * into v_row;\n  return public.deposit_json(v_row);\nend;"));
  assert.doesNotMatch(update, /amount|customer_name|customer_phone|branch_id\s*=|recorded_by/);
  const fn = readFileSync(new URL("../supabase/functions/staff-session/index.ts", import.meta.url), "utf8");
  assert.match(fn, /action === "deposit_update_promo"[\s\S]{0,600}p_branch_id: ownBranch/);
});
