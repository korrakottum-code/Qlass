// reducer สำหรับ Realtime event — ทุกตัวต้อง idempotent เพราะ App.jsx เขียน state แบบ
// optimistic ทันทีที่บันทึกสำเร็จ แล้ว echo จากเซิร์ฟเวอร์ตามมาอีกที (ก่อนหรือหลังก็ได้)
// ถ้า reducer ไม่ idempotent จะได้แถวซ้ำหรือแถวหาย — คืน reference เดิมเมื่อไม่มีอะไรเปลี่ยน
// เพื่อไม่ให้ React re-render เปล่า ๆ

/** สำหรับตารางที่มี id เป็น key: queues, room_schedules */
export function reconcileRealtimeById(items, event, item) {
  if (!item?.id) return items;
  if (event === "DELETE") {
    return items.some((x) => x.id === item.id) ? items.filter((x) => x.id !== item.id) : items;
  }

  const exists = items.some((x) => x.id === item.id);
  if (event === "INSERT") return exists ? items : [...items, item];
  if (event === "UPDATE") return exists
    ? items.map((x) => x.id === item.id ? item : x)
    : [...items, item];
  return items;
}

// ชื่อเดิม — App.jsx และ tests/criticalFlowCoverage.test.js import ตัวนี้อยู่
export const reconcileRealtimeQueue = reconcileRealtimeById;

/**
 * สำหรับ room_procedures ซึ่ง key คือคู่ (roomId, procedureId) ไม่มี id
 * มีแค่ INSERT/DELETE — ตารางเป็น PK ล้วน UPDATE เกิดไม่ได้
 * DELETE payload จาก Postgres (REPLICA IDENTITY default = PK) มีทั้งสองคอลัมน์ครบ
 */
export function reconcileRealtimeRoomProcedure(links, event, link) {
  if (!link?.roomId || !link?.procedureId) return links;
  const same = (l) => l.roomId === link.roomId && l.procedureId === link.procedureId;
  const exists = links.some(same);

  if (event === "DELETE") return exists ? links.filter((l) => !same(l)) : links;
  if (event === "INSERT") return exists ? links : [...links, { roomId: link.roomId, procedureId: link.procedureId }];
  return links;
}
