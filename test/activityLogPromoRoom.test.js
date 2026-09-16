import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ประวัติการลบ — ขยายให้ครอบคลุมโปร/ห้อง ไม่ใช่แค่คิว + แก้บั๊กที่ทำให้รายละเอียด
// ทุกแถวขึ้น "—" มาตลอด
//
// ตอนแรกเข้าใจผิดว่าตาราง activity_logs ไม่มีอยู่จริง (เช็คพลาด — รันสองคำสั่งพร้อมกัน
// แล้วเห็นผลแค่คำสั่งหลัง) ตรวจใหม่พบว่าตารางมีอยู่จริงและบันทึกการลบคิวมาตั้งแต่
// เม.ย. 2569 (3,062 แถว) แต่มีบั๊กจริงอยู่ 2 จุด:
//   1. ไม่เคยบันทึกการลบโปร/ห้องเลย — มีแต่ action "delete_queue" ในข้อมูลจริง
//   2. คอลัมน์ detail เป็น jsonb ฝั่ง JS จึงได้ object กลับมา ไม่ใช่ string โค้ดเดิม
//      JSON.parse(object) throw เสมอ ถูก catch กลืนไว้ ทำให้รายละเอียดทุกแถวขึ้น "—"
//      ทั้งที่ข้อมูลมีจริง (ตรวจกับของจริงยืนยันแล้ว)

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const app = read("../src/App.jsx");
const page = read("../src/pages/ActivityLogPage.jsx");

test("ลบโปรและลบห้องต้องบันทึกประวัติเหมือนลบคิว", () => {
  const deletePromoBlock = app.slice(app.indexOf("const deletePromo = useCallback"), app.indexOf("const deleteRoom = useCallback"));
  const deleteRoomBlock = app.slice(app.indexOf("const deleteRoom = useCallback"), app.indexOf("const deleteRoomSchedule = useCallback"));
  assert.match(deletePromoBlock, /logDeletion\("delete_promo", "promo", id,/);
  assert.match(deleteRoomBlock, /logDeletion\("delete_room", "room", id,/);
});

test("ต้องดึงชื่อโปร/ห้องไว้ก่อนลบ — ลบไปแล้วหาชื่อจาก state เดิมไม่ได้อีก", () => {
  const deletePromoBlock = app.slice(app.indexOf("const deletePromo = useCallback"), app.indexOf("const deleteRoom = useCallback"));
  // ต้องหา promo จาก state ก่อนบรรทัด deletePromoDB (ลบจริง) ไม่ใช่หลัง
  const findAt = deletePromoBlock.indexOf("promos.find");
  const deleteAt = deletePromoBlock.indexOf("deletePromoDB(id)");
  assert.ok(findAt >= 0 && findAt < deleteAt, "ต้องหาชื่อโปรไว้ก่อนสั่งลบจริง");
});

test("logDeletion ต้อง best-effort — ต้องไม่ throw ทำให้การลบจริงล้มไปด้วย", () => {
  const helperBlock = app.slice(app.indexOf("const logDeletion = useCallback"), app.indexOf("const deleteQueue = useCallback"));
  // createActivityLog เองไม่ throw อยู่แล้ว (แค่ console.error) — logDeletion ต้องไม่ไป
  // ครอบ try/catch ซ้ำจนบดบังว่าจริง ๆ แล้วมันไม่มีทาง throw
  assert.match(helperBlock, /await createActivityLog\(/);
});

test("getDetail ต้องรองรับทั้ง object (jsonb) และ string (ของเก่าที่อาจเคยเขียนเป็น string)", () => {
  const fn = page.slice(page.indexOf("function getDetail"), page.indexOf("return (", page.indexOf("function getDetail")));
  assert.match(fn, /typeof log\.detail === "object"/);
  assert.match(fn, /JSON\.parse\(log\.detail\)/);
});

test("หน้าต้องแยกแสดงผลตาม targetType ได้ครบ ไม่ใช่ตายตัวว่าเป็นคิวเสมอ", () => {
  assert.match(page, /log\.targetType === "queue"/);
  assert.match(page, /log\.targetType === "promo"/);
  assert.match(page, /log\.targetType === "room"/);
});

test("ป้ายประเภทต้องมีครบทั้งสามและอ่านเป็นภาษาไทย", () => {
  assert.match(page, /delete_queue: \{ emoji: "📋", label: "ลบคิว" \}/);
  assert.match(page, /delete_promo: \{ emoji: "🏷️", label: "ลบโปร" \}/);
  assert.match(page, /delete_room: \{ emoji: "🚪", label: "ลบห้อง" \}/);
});
