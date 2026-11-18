// เตียง TikTok: ติ๊กรายเตียง "เตียงนี้รับเฉพาะ TikTok" (เจ้าของตัดสิน 19 พ.ย. 2569)
// กติกาจริงอยู่ที่ฐานข้อมูล (trigger queues_tiktok_bed_rule — migration 20261119120000)
// ไฟล์นี้แค่ตรวจซ้ำฝั่งหน้าจอ เพื่อบอกแอดมินเหตุผลชัด ๆ ก่อนกดบันทึก ต้องตรงกับ tiktok_bed_rule_v1 เสมอ
//   1. เตียงที่ติ๊ก (room.tiktokOnly) รับเฉพาะคิวโปร TikTok
//   2. คิวโปร TikTok ต้องลงเตียงที่ติ๊ก ถ้าสาขามีเตียงติ๊กประเภทเดียวกันที่ทำหัตถการนั้นได้
//   3. สาขาที่ยังไม่ติ๊กเตียงไหน = ลงปนได้แบบเดิม
// คิวเดิมไม่แตะ: แก้คิวโดยไม่เปลี่ยนเตียง/โปร/หัตถการ = ไม่ตรวจ (ดู shouldCheckTiktokBedRule)
import { isProcedureAllowedInRoom } from "./roomProcedures.js";

export const BLOCK_SLOT_PROCEDURE_NAME = "ปิดคิว";

export function isTiktokPromoName(name) {
  return String(name ?? "").trim().toLowerCase().startsWith("tiktok");
}

export function isTiktokBed(room) {
  return !!room?.tiktokOnly;
}

/** เตียง TikTok ในสาขาเดียวกัน ประเภทเดียวกัน ที่ทำหัตถการนี้ได้ */
export function tiktokBedsFor(room, procedure, { rooms = [], roomProcedureIndex = null } = {}) {
  if (!room || !procedure) return [];
  return rooms.filter((r) => r.branchId === room.branchId && r.type === room.type && isTiktokBed(r)
    && isProcedureAllowedInRoom(roomProcedureIndex, r, procedure));
}

/** "ok" | "tiktok_needs_tiktok_bed" | "tiktok_bed_only" — เหมือน tiktok_bed_rule_v1 ใน SQL */
export function tiktokBedRuleCheck({ roomId, promoId, procedureId, promoNameSnapshot }, { rooms = [], promos = [], procedures = [], roomProcedureIndex = null } = {}) {
  if (!roomId) return "ok";
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return "ok";
  // "ปิดคิว" = คิวกันช่องเวลา ไม่ใช่ลูกค้า — ปิดช่องบนเตียง TikTok ได้เสมอ (เหมือน SQL)
  const procObj = procedureId ? procedures.find((p) => p.id === procedureId) : null;
  if (procObj?.name === BLOCK_SLOT_PROCEDURE_NAME) return "ok";
  const promo = promoId ? promos.find((p) => p.id === promoId) : null;
  const isTt = isTiktokPromoName(promo ? promo.name : promoNameSnapshot);
  if (isTiktokBed(room) && !isTt) return "tiktok_bed_only";
  if (isTt && !isTiktokBed(room)) {
    if (tiktokBedsFor(room, procObj, { rooms, roomProcedureIndex }).length > 0) return "tiktok_needs_tiktok_bed";
  }
  return "ok";
}

/** ตรวจเฉพาะคิวใหม่ หรือแก้คิวที่เปลี่ยนเตียง/โปร/หัตถการ (เหมือน trigger)
 *  คิวเดิมที่ผิดกติกาอยู่แล้วก่อนติ๊ก แก้โปร/หัตถการได้ถ้าไม่ย้ายเตียง (ส่ง ctx มาด้วยถึงจะรู้) */
export function shouldCheckTiktokBedRule(form, original, ctx = null) {
  if (!form?.roomId) return false;
  if (!original) return true;
  const sameRoom = (form.roomId || null) === (original.roomId || null);
  const changed = !sameRoom
    || (form.promoId || null) !== (original.promoId || null)
    || (form.procedureId || null) !== (original.procedureId || null);
  if (!changed) return false;
  if (sameRoom && ctx && tiktokBedRuleCheck(original, ctx) !== "ok") return false;
  return true;
}

export function tiktokBedRuleMessage(code, { rooms = [], roomId } = {}) {
  const room = rooms.find((r) => r.id === roomId);
  if (code === "tiktok_needs_tiktok_bed") {
    const names = room
      ? rooms.filter((r) => r.branchId === room.branchId && r.type === room.type && isTiktokBed(r)).map((r) => r.name)
      : [];
    const where = names.length > 0 ? names.join(", ") : "เตียง TikTok";
    return `คิวโปร TikTok ต้องลงเตียงที่ตั้งเป็นเตียง TikTok (${where}) — เลือกเตียงนั้น หรือวันอื่นที่เตียงนั้นว่าง`;
  }
  if (code === "tiktok_bed_only") {
    return `${room?.name ? `เตียง ${room.name}` : "เตียงนี้"} รับเฉพาะคิวโปร TikTok — คิวนี้ให้ลงเตียงอื่น`;
  }
  return null;
}

/** อ่านรหัสจาก error ที่ฐานข้อมูลตอบกลับ (TIKTOK_BED_RULE:<code>) — ไม่ใช่ก็คืน null */
export function tiktokBedRuleCodeFromError(error) {
  const text = [error?.message, error?.details, error?.hint, typeof error === "string" ? error : ""]
    .filter(Boolean).join(" ");
  const m = /TIKTOK_BED_RULE:(tiktok_needs_tiktok_bed|tiktok_bed_only)/.exec(text);
  return m ? m[1] : null;
}
