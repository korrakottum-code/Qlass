// ปุ่มลัดช่วงวันที่ (pure logic ไม่แตะ DOM/network เพื่อให้ unit test ได้ตรง ๆ)
// ใช้ร่วมกันระหว่างหน้า Export กับหน้าตารางคิว — เพิ่มช่วงใหม่ที่นี่ที่เดียว

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// จำนวนวันแบบนับหัวนับหาง: "2026-09-01" ถึง "2026-09-01" = 1 วัน
// แปลงเป็น UTC ก่อนลบ เพื่อไม่ให้ผลเพี้ยนตอนข้ามช่วงปรับเวลา
export function daySpan(from, to) {
  if (!from || !to) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.floor(ms / 86400000) + 1;
}

export function getDatePresets(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const today = toDateStr(now);
  const yesterday = toDateStr(new Date(y, m, d - 1));
  const tomorrow = toDateStr(new Date(y, m, d + 1));

  // 7 วันล่าสุด = วันนี้นับย้อนไป 7 วัน (รวมวันนี้)
  const last7Start = toDateStr(new Date(y, m, d - 6));

  // สัปดาห์เริ่มวันจันทร์
  const dayOfWeek = now.getDay(); // 0=อาทิตย์
  const mondayOffset = (dayOfWeek + 6) % 7;
  const thisWeekStart = toDateStr(new Date(y, m, d - mondayOffset));
  const lastWeekStart = toDateStr(new Date(y, m, d - mondayOffset - 7));
  const lastWeekEnd = toDateStr(new Date(y, m, d - mondayOffset - 1));

  const thisMonthStart = toDateStr(new Date(y, m, 1));
  const thisMonthEnd = toDateStr(new Date(y, m + 1, 0));
  const lastMonthStart = toDateStr(new Date(y, m - 1, 1));
  const lastMonthEnd = toDateStr(new Date(y, m, 0));

  const qStart = Math.floor(m / 3) * 3;

  return [
    { key: "today", label: "วันนี้", start: today, end: today },
    { key: "tomorrow", label: "พรุ่งนี้", start: tomorrow, end: tomorrow },
    { key: "yesterday", label: "เมื่อวาน", start: yesterday, end: yesterday },
    { key: "last7", label: "7 วันล่าสุด", start: last7Start, end: today },
    { key: "thisWeek", label: "สัปดาห์นี้", start: thisWeekStart, end: today },
    { key: "lastWeek", label: "สัปดาห์ที่แล้ว", start: lastWeekStart, end: lastWeekEnd },
    { key: "monthToYesterday", label: "ต้นเดือนถึงเมื่อวาน", start: thisMonthStart, end: yesterday },
    { key: "thisMonth", label: "เดือนนี้", start: thisMonthStart, end: thisMonthEnd },
    { key: "lastMonth", label: "เดือนที่แล้ว", start: lastMonthStart, end: lastMonthEnd },
    { key: "thisQuarter", label: "ไตรมาสนี้", start: toDateStr(new Date(y, qStart, 1)), end: toDateStr(new Date(y, qStart + 3, 0)) },
    { key: "thisYear", label: "ปีนี้", start: toDateStr(new Date(y, 0, 1)), end: toDateStr(new Date(y, 11, 31)) },
  ].filter((p) => p.start <= p.end); // กันช่วงติดลบ เช่น "ต้นเดือนถึงเมื่อวาน" ตอนวันที่ 1 — วันนั้นจะไม่มีตัวเลือกนี้
}

// เลือกเฉพาะช่วงที่หน้านั้นควรมี และเรียงตามลำดับ key ที่ส่งมา
// (หน้าตารางคิวไม่ควรมี "ปีนี้" — หลายหมื่นแถวในตารางเดียว)
export function pickDatePresets(keys, now = new Date()) {
  const all = getDatePresets(now);
  return keys.map((k) => all.find((p) => p.key === k)).filter(Boolean);
}
