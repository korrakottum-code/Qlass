// ตั้งชื่อเตียงใหม่อัตโนมัติ เช่น M01, T03, N01 — โมดูลล้วน ทดสอบด้วย node ได้ตรง ๆ
//
// เดิมใช้ "จำนวนเตียงประเภทนั้น + 1" ซึ่งชนเมื่อเลขกลางหายไป เช่นสาขาเหลือ M01, M02, M04
// (M03 ถูกเปลี่ยนเป็นห้องพยาบาล N01 เมื่อ 31 ต.ค. 2569 หรือถูกลบ) → เตียงใหม่ได้ M04 ซ้ำ
// ตอนนี้ใช้ "เลขสูงสุดที่ใช้อยู่ในชื่อแบบ <ประเภท><เลข> ของสาขานั้น + 1" แทน
// ดูทุกเตียงในสาขาไม่ว่าประเภทไหน เผื่อมีเตียงที่ชื่อขึ้นต้นด้วยตัวอักษรนี้แต่ประเภทไม่ตรง

export function nextRoomName(rooms, branchId, type) {
  if (!branchId || !type) return "";
  const pattern = new RegExp(`^${type}(\\d+)$`, "i");
  let max = 0;
  (rooms || []).forEach((room) => {
    if (room.branchId !== branchId) return;
    const match = String(room.name || "").trim().match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `${type}${String(max + 1).padStart(2, "0")}`;
}
