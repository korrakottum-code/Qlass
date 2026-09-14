// เลื่อนคิวไปช่องเดิม = ไม่ได้เลื่อนจริง
//
// หน้าต่างเปลี่ยนสถานะเติม "วันเดิม/เวลาเดิม" ไว้ในช่องให้ล่วงหน้า ถ้าแอดมินกดยืนยัน
// โดยไม่แก้อะไร ระบบจะปิดคิวเดิมเป็น "เลื่อนออก" แล้วสร้างคิวใหม่ "เลื่อนมา" ทับลงที่
// ช่องเดิมเป๊ะ ๆ กลายเป็นคู่แฝดที่ไม่มีอยู่จริง — เกิดมาแล้ว 508 ครั้งตั้งแต่ เม.ย. 2569
// ในนั้น 13 แถวอยู่ในวันที่ยังไม่ถึงและกินเตียงจริง ทั้งที่ไม่มีลูกค้าคนไหนจะมา
export function isSameRescheduleSlot(originalQueue, date, timeBlock) {
  if (!originalQueue) return false;
  const sameDate = (date ?? originalQueue.date) === originalQueue.date;
  const sameTime = (timeBlock ?? originalQueue.timeBlock) === originalQueue.timeBlock;
  return sameDate && sameTime;
}

export function buildRescheduledQueue(originalQueue, payload, createdAt) {
  if (!originalQueue || (payload.date === undefined && payload.timeBlock === undefined)) return null;
  // กันไว้อีกชั้นเผื่อมีทางเรียกอื่นที่ไม่ได้ตรวจก่อน — ช่องเดิมเป๊ะ ๆ ไม่ต้องสร้างแถวใหม่
  if (isSameRescheduleSlot(originalQueue, payload.date, payload.timeBlock)) return null;
  const { id: _id, createdAt: _createdAt, status: _status, statusNote: _statusNote, statusUpdatedAt: _statusUpdatedAt, ...rest } = originalQueue;
  return {
    ...rest,
    date: payload.date || originalQueue.date,
    timeBlock: payload.timeBlock !== undefined ? payload.timeBlock : originalQueue.timeBlock,
    status: "rescheduled_in",
    statusNote: payload.statusNote || "",
    createdAt,
  };
}
