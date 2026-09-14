// รายงาน "การแอคทีฟสถานะคิว" — ใช้ประเมินว่าแต่ละสาขาปิดงานคิวครบหรือไม่
//
// กติกาที่ Area manager เคาะแล้ว:
//   แอคทีฟแล้ว   = มาแล้ว/เสร็จ, ไม่มาตามนัด, ยกเลิก, เลื่อนออก
//   ยังไม่แอคทีฟ = รอยืนยัน, โทรตาม ×1/×2/×3, ยืนยันแล้ว, เลื่อนมา
//   ไม่นับเลย     = คิวรอ (ยังไม่มีวันนัดจริง)
//
// "ค้างไม่แอคทีฟ" นับเฉพาะคิวที่ "วันนัดผ่านไปแล้ว" เท่านั้น — คิวของวันนี้และ
// วันข้างหน้าที่ยังเป็นรอยืนยันถือว่าปกติ ไม่ใช่ความผิดของพนักงาน

export const ACTIVATED_STATUSES = ["done", "no_show", "cancelled", "rescheduled"];
export const UNACTIVATED_STATUSES = ["pending", "follow1", "follow2", "follow3", "confirmed", "rescheduled_in"];
export const ACTIVATION_EXCLUDED_STATUSES = ["waiting_queue"];

const ACTIVATED = new Set(ACTIVATED_STATUSES);
const EXCLUDED = new Set(ACTIVATION_EXCLUDED_STATUSES);

/**
 * คิวใบนี้นับเป็น "นัด" ของวันนั้นไหม
 *
 * คิวรอไม่ใช่นัด — ยังไม่มีวันนัดจริง ช่อง date ของคิวรอคือวันที่แอดมินลงคิวไว้เฉย ๆ
 * รายงานแอคทีฟตัดคิวรอออกตั้งแต่แรก แต่การ์ด "คิวนัดทำ" เคยนับรวม สองเลขบนหน้า
 * เดียวกันจึงไม่เท่ากันทุกวันที่มีคิวรอ (12 ก.ย. 2569: การ์ด 1,855 รายงาน 1,843)
 * ทั้งสองที่ต้องอ่านกติกาจากตัวนี้ตัวเดียว จะได้ไม่มีทางเพี้ยนออกจากกันอีก
 */
export function isAppointmentQueue(queue) {
  const status = queue?.status;
  return !!status && !EXCLUDED.has(status);
}

/**
 * จัดกลุ่มคิวหนึ่งใบ
 * @returns "excluded" | "activated" | "overdue" | "not_due"
 */
export function classifyActivation(queue, today) {
  const status = queue?.status;
  if (!status || EXCLUDED.has(status)) return "excluded";
  if (ACTIVATED.has(status)) return "activated";
  // สถานะที่เหลือ (รวมสถานะแปลกปลอมที่ไม่รู้จัก) ถือว่ายังไม่ปิดงาน
  const date = queue?.date;
  if (!date || !today) return "not_due";
  return date < today ? "overdue" : "not_due";
}

function emptyRow(branchId, branchName) {
  return {
    branchId,
    branchName,
    total: 0,
    done: 0,
    noShow: 0,
    cancelled: 0,
    rescheduled: 0,
    // ตัวหาร/ตัวตั้งของ % แอคทีฟ — นับเฉพาะคิวที่วันนัดผ่านไปแล้ว
    dueTotal: 0,
    dueActivated: 0,
    overdue: 0,
    overdueByStatus: {},
    overdueQueues: [],
  };
}

function tally(row, q, kind) {
  row.total += 1;
  if (q.status === "done") row.done += 1;
  else if (q.status === "no_show") row.noShow += 1;
  else if (q.status === "cancelled") row.cancelled += 1;
  else if (q.status === "rescheduled") row.rescheduled += 1;

  const isDue = kind === "overdue" || (kind === "activated" && q.date && row.today && q.date < row.today);
  if (isDue) {
    row.dueTotal += 1;
    if (kind === "activated") row.dueActivated += 1;
  }
  if (kind === "overdue") {
    row.overdue += 1;
    row.overdueByStatus[q.status] = (row.overdueByStatus[q.status] || 0) + 1;
    row.overdueQueues.push(q);
  }
}

function finish(row) {
  return {
    branchId: row.branchId,
    branchName: row.branchName,
    total: row.total,
    done: row.done,
    noShow: row.noShow,
    cancelled: row.cancelled,
    rescheduled: row.rescheduled,
    dueTotal: row.dueTotal,
    dueActivated: row.dueActivated,
    overdue: row.overdue,
    overdueByStatus: row.overdueByStatus,
    activeRate: row.dueTotal > 0 ? row.dueActivated / row.dueTotal : null,
    showRate: row.total > 0 ? row.done / row.total : null,
    noShowRate: row.total > 0 ? row.noShow / row.total : null,
    overdueQueues: row.overdueQueues
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.timeBlock ?? 0) - (b.timeBlock ?? 0)),
  };
}

/**
 * สรุปรายงานแยกตามสาขา
 * @param queues คิวที่มีวันนัดอยู่ในช่วงที่เลือกแล้ว
 * @param today  "YYYY-MM-DD" ของวันนี้ — คิวที่ date < today เท่านั้นที่ถือว่าครบกำหนดแอคทีฟ
 */
export function buildActivationReport(queues = [], { today, branches = [], unknownBranchLabel = "ไม่ระบุสาขา" } = {}) {
  const nameOf = new Map((branches || []).map((b) => [b.id, b.name]));
  const rows = new Map();
  const grand = emptyRow(null, "รวมทุกสาขา");
  grand.today = today;

  for (const q of queues) {
    const kind = classifyActivation(q, today);
    if (kind === "excluded") continue;
    const key = q.branchId || "__none__";
    if (!rows.has(key)) {
      const row = emptyRow(q.branchId || null, nameOf.get(q.branchId) || unknownBranchLabel);
      row.today = today;
      rows.set(key, row);
    }
    tally(rows.get(key), q, kind);
    tally(grand, q, kind);
  }

  const list = [...rows.values()]
    .map(finish)
    // แถว "ไม่ระบุสาขา" ไม่ใช่ผลงานของใคร ดันไปท้ายตารางเสมอ
    .sort((a, b) =>
      (a.branchId ? 0 : 1) - (b.branchId ? 0 : 1) ||
      b.overdue - a.overdue ||
      a.branchName.localeCompare(b.branchName, "th"));

  return { rows: list, total: finish(grand) };
}

export function formatRate(rate) {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

// ─── การเรียงลำดับแถว ───
// คอลัมน์ที่กดเรียงได้ — คีย์ตรงกับหัวตารางบนจอใหญ่และแถบหัวรายการบนมือถือ
export const ACTIVATION_SORT_KEYS = {
  branchName: (r) => r.branchName,
  total: (r) => r.total,
  done: (r) => r.done,
  noShow: (r) => r.noShow,
  cancelled: (r) => r.cancelled,
  rescheduled: (r) => r.rescheduled,
  overdue: (r) => r.overdue,
  activeRate: (r) => r.activeRate,
  showRate: (r) => r.showRate,
  noShowRate: (r) => r.noShowRate,
};

/**
 * เรียงแถวสาขา — คืนอาร์เรย์ใหม่เสมอ ไม่แก้ของเดิม
 * กติกาที่ไม่ขึ้นกับคอลัมน์ที่เลือก:
 *   - แถว "ไม่ระบุสาขา" อยู่ท้ายสุดตลอด ไม่ใช่ผลงานของใคร
 *   - สาขาที่ยังไม่มีคิวครบกำหนด (% เป็นค่าว่าง) ไปอยู่ท้ายกลุ่ม ไม่ใช่ถูกนับเป็นศูนย์
 */
export function sortActivationRows(rows = [], key = "overdue", dir = "desc") {
  const pick = ACTIVATION_SORT_KEYS[key] || ACTIVATION_SORT_KEYS.overdue;
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const unknown = (a.branchId ? 0 : 1) - (b.branchId ? 0 : 1);
    if (unknown) return unknown;
    const va = pick(a);
    const vb = pick(b);
    const na = va == null;
    const nb = vb == null;
    if (na || nb) {
      if (na && nb) return a.branchName.localeCompare(b.branchName, "th");
      return na ? 1 : -1;
    }
    const cmp = typeof va === "string" ? va.localeCompare(vb, "th") : va - vb;
    return cmp * sign || a.branchName.localeCompare(b.branchName, "th");
  });
}
