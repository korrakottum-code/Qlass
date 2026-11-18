// เตียง M02 = เตียง TikTok ฉีด (ทีมตัดสิน 18 พ.ย. 2569)
// กติกาจริงอยู่ที่ฐานข้อมูล (trigger queues_tiktok_bed_rule — migration 20261118120000)
// ไฟล์นี้แค่ตรวจซ้ำฝั่งหน้าจอ เพื่อบอกแอดมินเหตุผลชัด ๆ ก่อนกดบันทึก ต้องตรงกับ tiktok_bed_rule_v1 เสมอ
//   1. คิวโปร TikTok ของงานฉีด ลงได้เฉพาะเตียง M02
//   2. เตียง M02 รับเฉพาะคิวโปร TikTok
// คิวเดิมไม่แตะ: แก้คิวโดยไม่เปลี่ยนเตียง/โปร/หัตถการ = ไม่ตรวจ (ดู shouldCheckTiktokBedRule)

export const INJECT_PROCEDURE_NAMES = ["Botox", "Filler", "Meso", "Go-Botox", "Go-Filler"];

export function isTiktokPromoName(name) {
  return String(name ?? "").trim().toLowerCase().startsWith("tiktok");
}

export function isTiktokBed(room) {
  return !!room && room.type === "M" && String(room.name ?? "").trim().toUpperCase() === "M02";
}

/** "ok" | "tiktok_needs_m02" | "m02_tiktok_only" — เหมือน tiktok_bed_rule_v1 ใน SQL */
export function tiktokBedRuleCheck({ roomId, promoId, procedureId, promoNameSnapshot }, { rooms = [], promos = [], procedures = [] } = {}) {
  if (!roomId) return "ok";
  const room = rooms.find((r) => r.id === roomId);
  const promo = promoId ? promos.find((p) => p.id === promoId) : null;
  const proc = procedureId ? procedures.find((p) => p.id === procedureId) : null;
  const isM02 = isTiktokBed(room);
  const isTt = isTiktokPromoName(promo ? promo.name : promoNameSnapshot);
  const isInject = !!proc && INJECT_PROCEDURE_NAMES.includes(proc.name);
  if (isM02 && !isTt) return "m02_tiktok_only";
  if (isTt && isInject && !isM02) return "tiktok_needs_m02";
  return "ok";
}

/** ตรวจเฉพาะคิวใหม่ หรือแก้คิวที่เปลี่ยนเตียง/โปร/หัตถการ (เหมือน trigger) */
export function shouldCheckTiktokBedRule(form, original) {
  if (!form?.roomId) return false;
  if (!original) return true;
  return (form.roomId || null) !== (original.roomId || null)
    || (form.promoId || null) !== (original.promoId || null)
    || (form.procedureId || null) !== (original.procedureId || null);
}

export function tiktokBedRuleMessage(code, { rooms = [], branchId } = {}) {
  if (code === "tiktok_needs_m02") {
    const branchHasM02 = !branchId || rooms.some((r) => r.branchId === branchId && isTiktokBed(r));
    return branchHasM02
      ? "คิวโปร TikTok (ฉีด) ลงได้เฉพาะเตียง M02 — เลือกเตียง M02 หรือวันอื่นที่ M02 ว่าง"
      : "สาขานี้ไม่มีเตียง M02 จึงรับคิวโปร TikTok (ฉีด) ไม่ได้";
  }
  if (code === "m02_tiktok_only") {
    return "เตียง M02 รับเฉพาะคิวโปร TikTok — คิวนี้ให้ลงเตียง M อื่น";
  }
  return null;
}

/** อ่านรหัสจาก error ที่ฐานข้อมูลตอบกลับ (TIKTOK_BED_RULE:<code>) — ไม่ใช่ก็คืน null */
export function tiktokBedRuleCodeFromError(error) {
  const text = [error?.message, error?.details, error?.hint, typeof error === "string" ? error : ""]
    .filter(Boolean).join(" ");
  const m = /TIKTOK_BED_RULE:(tiktok_needs_m02|m02_tiktok_only)/.exec(text);
  return m ? m[1] : null;
}
