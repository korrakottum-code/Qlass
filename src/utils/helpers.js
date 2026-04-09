import { WORK_START_BLOCK, WORK_END_BLOCK } from "./constants";

export function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatThaiDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

export function blockToTime(block) {
  const totalMin = block * 5;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generateWorkBlocks() {
  const blocks = [];
  for (let b = WORK_START_BLOCK; b < WORK_END_BLOCK; b++) {
    blocks.push({ block: b, time: blockToTime(b) });
  }
  return blocks;
}

export const WORK_BLOCKS = generateWorkBlocks();

export function getEmptyBookingForm() {
  return {
    name: "",
    phone: "",
    branchId: "",
    procedureId: "",
    promoId: "",
    price: "",
    note: "",
    customerType: "new",
    date: getTodayStr(),
    timeBlock: null,
    durationBlocks: null,
    roomId: "",
    secondRoomId: "",
    secondTimeBlock: null,
    status: "pending",
    statusNote: "",
  };
}

export function getCustomerBadgeClass(type) {
  if (type === "new") return "badge-new";
  if (type === "old") return "badge-old";
  if (type === "course") return "badge-course";
  return "badge-unknown";
}

export function getEmptyStaff() {
  return {
    name: "",
    nickname: "",
    phone: "",
    branchId: null,
    role: "receptionist",
    pin: "",
    active: true,
    commissionRates: { new: 0, old: 0, course: 0 },
  };
}

// คำนวณค่าคอมของ staff — commissionRates เป็นจำนวนเงิน (฿) ต่อคิว
export function calcCommission(doneQueues, staff) {
  let total = 0;
  const breakdown = { new: 0, old: 0, course: 0 };
  doneQueues.forEach((q) => {
    const type = q.customerType || "new";
    const amount = staff.commissionRates?.[type] || 0;
    breakdown[type] = (breakdown[type] || 0) + amount;
    total += amount;
  });
  return { total, breakdown };
}

// Branch filtering based on user role
export function canViewAllBranches(user) {
  if (!user) return false;
  // Admin roles can see all branches
  return ["superadmin", "head_admin", "admin"].includes(user.role);
}

export function filterByUserBranch(items, user, branchIdField = "branchId") {
  if (!user) return [];
  if (canViewAllBranches(user)) return items;
  // Manager and Cashier can only see their own branch
  return items.filter(item => item[branchIdField] === user.branchId);
}
