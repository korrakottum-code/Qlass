// ─── INITIAL MASTER DATA ───

export const initBranches = [
  { id: "b1", name: "สาขาขอนแก่น" },
  { id: "b2", name: "สาขาสยาม" },
  { id: "b3", name: "สาขาลาดพร้าว" },
  { id: "b4", name: "สาขาบางนา" },
  { id: "b5", name: "สาขาอารีย์" },
];

export const PROCEDURE_CATEGORIES = [
  "Injection",
  "Laser",
  "Energy",
  "Lifting",
  "Skincare",
  "Wellness",
  "Body",
  "Other",
];

export const ROOM_TYPES = [
  { value: "M", label: "M — ห้องฉีด (Injection / Drip)", color: "var(--blue)" },
  { value: "T", label: "T — ห้องเครื่อง / ทรีตเมนต์", color: "var(--green)" },
];

export const initProcedures = [
  { id: "p1", name: "Botox", blocks: 3, category: "Injection", roomType: "M" },
  { id: "p2", name: "Filler", blocks: 4, category: "Injection", roomType: "M" },
  { id: "p3", name: "Laser CO2", blocks: 6, category: "Laser", roomType: "T" },
  { id: "p4", name: "IPL", blocks: 4, category: "Laser", roomType: "T" },
  { id: "p5", name: "Ultherapy", blocks: 12, category: "Energy", roomType: "T" },
  { id: "p6", name: "HIFU", blocks: 10, category: "Energy", roomType: "T" },
  { id: "p7", name: "ร้อยไหม", blocks: 8, category: "Lifting", roomType: "M" },
  { id: "p8", name: "Diode Laser (กำจัดขน)", blocks: 6, category: "Laser", roomType: "T" },
  { id: "p9", name: "Facial Treatment", blocks: 6, category: "Skincare", roomType: "T" },
  { id: "p10", name: "IV Drip", blocks: 8, category: "Wellness", roomType: "M" },
  { id: "p11", name: "Meso Fat", blocks: 4, category: "Body", roomType: "M" },
  { id: "p12", name: "Chemical Peel", blocks: 3, category: "Skincare", roomType: "T" },
];

export const initRooms = [
  { id: "r1", name: "M01", branchId: "b1", type: "M", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r2", name: "M02", branchId: "b1", type: "M", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r3", name: "T01", branchId: "b1", type: "T", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r4", name: "T02", branchId: "b1", type: "T", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r5", name: "T03", branchId: "b1", type: "T", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r6", name: "M01", branchId: "b2", type: "M", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r7", name: "T01", branchId: "b2", type: "T", notes: "", openBlock: 108, closeBlock: 264 },
  { id: "r8", name: "T02", branchId: "b2", type: "T", notes: "", openBlock: 108, closeBlock: 264 },
];

export const initPromos = [
  { id: "pr1", name: "Botox 50u", procedureId: "p1", price: 2500, active: true },
  { id: "pr2", name: "Botox 100u", procedureId: "p1", price: 4500, active: true },
  { id: "pr3", name: "Filler 1cc", procedureId: "p2", price: 5900, active: true },
  { id: "pr4", name: "Filler 2cc", procedureId: "p2", price: 10900, active: true },
  { id: "pr5", name: "Ultherapy Full Face", procedureId: "p5", price: 25000, active: true },
  { id: "pr6", name: "HIFU 300 shots", procedureId: "p6", price: 3900, active: true },
  { id: "pr7", name: "HIFU 600 shots", procedureId: "p6", price: 6900, active: true },
  { id: "pr8", name: "Laser CO2 Fractional", procedureId: "p3", price: 3500, active: true },
  { id: "pr9", name: "IPL Full Face", procedureId: "p4", price: 1500, active: true },
  { id: "pr10", name: "Diode รักแร้", procedureId: "p8", price: 990, active: true },
  { id: "pr11", name: "Diode ขา Full", procedureId: "p8", price: 2900, active: true },
  { id: "pr12", name: "ร้อยไหม 10 เส้น", procedureId: "p7", price: 9900, active: true },
  { id: "pr13", name: "Facial Hydra", procedureId: "p9", price: 1290, active: true },
  { id: "pr14", name: "IV Drip Glow", procedureId: "p10", price: 1990, active: true },
];

// block reference: 09:00=108, 12:00=144, 13:00=156, 14:00=168, 18:00=216, 20:00=240, 22:00=264
export const initRoomSchedules = [
  // T01 ขอนแก่น: ปิดพักเที่ยง 12:00-13:00 ทุกวัน
  { id: "rs1", roomId: "r3", date: "", available: false, startBlock: 144, endBlock: 156, note: "พักเที่ยง" },
  // T02 ขอนแก่น: เครื่องส่งซ่อมวันนี้ ปิดตลอดวัน
  { id: "rs2", roomId: "r4", date: "2026-04-04", available: false, startBlock: 108, endBlock: 264, note: "เครื่อง HIFU ส่งซ่อม" },
  // M01 สยาม: หมอเข้าเฉพาะบ่าย 14:00-20:00 ทุกวัน
  { id: "rs3", roomId: "r6", date: "", available: true, startBlock: 168, endBlock: 240, note: "หมอเข้าเฉพาะ 14:00-20:00" },
];

export const QUEUE_STATUSES = [
  { value: "pending",     label: "รอยืนยัน",          emoji: "⏳", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  { value: "follow1",    label: "โทรตาม ×1",          emoji: "📞", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { value: "follow2",    label: "โทรตาม ×2",          emoji: "📞", color: "#2563eb", bg: "rgba(37,99,235,0.15)" },
  { value: "follow3",    label: "โทรตาม ×3",          emoji: "📞", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  { value: "confirmed",  label: "ยืนยันแล้ว",          emoji: "✅", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  { value: "rescheduled",label: "เลื่อนนัด",            emoji: "📅", color: "#7c3aed", bg: "rgba(124,58,237,0.12)" },
  { value: "no_show",    label: "ไม่มาตามนัด",         emoji: "🚫", color: "#dc2626", bg: "rgba(220,38,38,0.1)" },
  { value: "cancelled",  label: "ยกเลิก",              emoji: "❌", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  { value: "done",       label: "มาแล้ว / เสร็จ",      emoji: "🎉", color: "#059669", bg: "rgba(5,150,105,0.12)" },
];

export const CUSTOMER_TYPES = [
  { value: "new", label: "ลูกค้าใหม่", emoji: "🆕" },
  { value: "old", label: "ลูกค้าเก่า", emoji: "🔄" },
  { value: "course", label: "ใช้คอร์ส", emoji: "📋" },
];

// Time blocks: 11:00 - 20:00 (block 132 - 240)
export const WORK_START_BLOCK = 132;
export const WORK_END_BLOCK = 240;

export const NAV_ITEMS = [
  { section: "งานหลัก" },
  { id: "booking",       label: "บันทึกคิว",          icon: "📝" },
  { id: "queue-table",   label: "ตารางคิว",            icon: "📋" },
  { id: "summary",       label: "สรุปประจำวัน",        icon: "📊" },
  { id: "commission",    label: "ค่าคอมมิชชั่น",       icon: "💰" },
  { id: "export",        label: "Export ข้อมูล",       icon: "📥" },
  { id: "tickets",       label: "แจ้งปัญหาระบบ",       icon: "🎫" },
  { section: "ตั้งค่าระบบ" },
  { id: "branches",      label: "จัดการสาขา",          icon: "🏢" },
  { id: "procedures",    label: "จัดการหัตถการ",        icon: "💉" },
  { id: "promos",        label: "จัดการโปร/แพ็กเกจ",   icon: "🏷️" },
  { id: "rooms",         label: "จัดการห้อง",           icon: "🚪" },
  { id: "room-schedule", label: "ตารางห้อง/เครื่อง",   icon: "📅" },
  { id: "staff",         label: "จัดการพนักงาน",        icon: "👥" },
];

// ─── ROLES & PERMISSIONS ───
export const ROLES = [
  {
    value: "superadmin",
    label: "ผู้ดูแลระบบ",
    color: "#dc2626",
    bg: "rgba(220,38,38,0.1)",
    pages: ["booking","queue-table","summary","commission","export","tickets","branches","procedures","promos","rooms","room-schedule","staff"],
  },
  {
    value: "head_admin",
    label: "หัวหน้าแอดมิน",
    color: "#7c3aed",
    bg: "rgba(124,58,237,0.1)",
    pages: ["booking","queue-table","summary","commission","export","tickets","promos","rooms","room-schedule","staff"],
  },
  {
    value: "admin",
    label: "แอดมิน",
    color: "#2563eb",
    bg: "rgba(37,99,235,0.1)",
    pages: ["booking","queue-table","summary","commission","export","tickets"],
  },
  {
    value: "branch_manager",
    label: "ผู้จัดการสาขา",
    color: "#059669",
    bg: "rgba(5,150,105,0.1)",
    pages: ["booking","queue-table","summary","export","tickets","rooms","room-schedule"],
  },
  {
    value: "cashier",
    label: "แคชเชีย",
    color: "#d97706",
    bg: "rgba(217,119,6,0.1)",
    pages: ["booking","queue-table","summary","export","tickets"],
  },
];

// ─── INITIAL STAFF ───
export const initStaff = [
  {
    id: "s1", name: "ผู้ดูแลระบบ", nickname: "Admin",
    phone: "", branchId: null, role: "superadmin", pin: "0000", active: true,
    commissionRates: { new: 0, old: 0, course: 0 },
  },
  {
    id: "s2", name: "น้องแนน", nickname: "แนน",
    phone: "0891234567", branchId: "b1", role: "cashier", pin: "1234", active: true,
    commissionRates: { new: 200, old: 150, course: 100 },
  },
  {
    id: "s3", name: "คุณหมอสมชาย", nickname: "หมอสม",
    phone: "0812345678", branchId: "b1", role: "admin", pin: "5678", active: true,
    commissionRates: { new: 500, old: 400, course: 300 },
  },
  {
    id: "s4", name: "น้องจอย", nickname: "จอย",
    phone: "0856789012", branchId: "b2", role: "cashier", pin: "9999", active: true,
    commissionRates: { new: 200, old: 150, course: 100 },
  },
];
