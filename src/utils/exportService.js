import { formatThaiDate, blockToTime } from "./helpers";
import { filterQueuesForExport } from "./exportFilters";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════
// EXCEL EXPORT UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Download an array-of-arrays as an .xlsx file.
 * rows[0] is treated as the header row.
 * Numeric columns (specified by index in numericCols) stay as numbers.
 * Currency columns (currencyCols) are formatted with ฿ and commas.
 */
function downloadXLSX(filename, rows, { numericCols = [], currencyCols = [] } = {}) {
  // Build worksheet data: keep numbers as numbers, rest as strings
  const wsData = rows.map((row, rowIdx) =>
    row.map((cell, colIdx) => {
      if (rowIdx === 0) return String(cell); // header always string
      if (numericCols.includes(colIdx) || currencyCols.includes(colIdx)) {
        const n = parseFloat(cell);
        return isNaN(n) ? cell : n;
      }
      return cell === null || cell === undefined ? "" : String(cell);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Style header row (bold, background) — SheetJS community edition supports basic cell styles
  const headerRange = XLSX.utils.decode_range(ws["!ref"]);
  for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1D4ED8" } },
      alignment: { horizontal: "center" },
    };
  }

  // Apply ฿ number format to currency columns
  if (currencyCols.length > 0) {
    const dataRange = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = 1; R <= dataRange.e.r; R++) {
      currencyCols.forEach((C) => {
        const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[cellAddr] && typeof ws[cellAddr].v === "number") {
          ws[cellAddr].z = '฿#,##0.00';
        }
      });
    }
  }

  // Auto column widths
  const colWidths = rows[0].map((_, colIdx) => {
    const maxLen = rows.reduce((max, row) => {
      const val = row[colIdx] !== null && row[colIdx] !== undefined ? String(row[colIdx]) : "";
      return Math.max(max, val.length);
    }, 0);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ข้อมูล");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}

// ═══════════════════════════════════════════════════════════
// EXPORT COMMISSION DATA (รายละเอียดค่าคอม)
// ═══════════════════════════════════════════════════════════

export function exportCommissionData(queues, staff, branches, procedures, promos, startDate, endDate, branchId = "all") {
  const filteredQueues = filterQueuesForExport(queues, { startDate, endDate, branchId, onlyDone: true });

  const rows = [
    ["วันที่", "ชื่อลูกค้า", "เบอร์โทร", "สาขา", "หัตถการ", "โปร/แพ็กเกจ", "ประเภทลูกค้า", "ราคา (฿)", "พนักงานบันทึก", "ค่าคอม (฿)"]
  ];

  filteredQueues.forEach(q => {
    const branch = branches.find(b => b.id === q.branchId);
    const procedure = procedures.find(p => p.id === q.procedureId);
    const promo = promos.find(p => p.id === q.promoId);
    const staffMember = staff.find(s => s.id === q.recordedBy);

    const customerTypeLabel = q.customerType === "new" ? "ลูกค้าใหม่" :
                              q.customerType === "old" ? "ลูกค้าเก่า" : "ใช้คอร์ส";

    const commission = staffMember ? (staffMember.commissionRates?.[q.customerType] || 0) : 0;

    rows.push([
      formatThaiDate(q.date),
      q.name,
      q.phone,
      branch?.name || "-",
      procedure?.name || "-",
      promo?.name || "-",
      customerTypeLabel,
      parseFloat(q.price) || 0,
      staffMember ? (staffMember.nickname || staffMember.name) : "-",
      parseFloat(commission) || 0,
    ]);
  });

  const branchLabel = branchId !== "all" ? `_${branches.find(b => b.id === branchId)?.name || branchId}` : "";
  const filename = `ค่าคอมมิชชั่น${branchLabel}_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.xlsx`;
  // col 7 = ราคา, col 9 = ค่าคอม
  downloadXLSX(filename, rows, { currencyCols: [7, 9] });
}

// ═══════════════════════════════════════════════════════════
// EXPORT COMMISSION SUMMARY BY STAFF
// ═══════════════════════════════════════════════════════════

export function exportCommissionSummary(queues, staff, branches, startDate, endDate, branchId = "all") {
  const filteredQueues = filterQueuesForExport(queues, { startDate, endDate, branchId, onlyDone: true });

  const rows = [
    ["พนักงาน", "สาขา", "ลูกค้าใหม่ (คิว)", "ลูกค้าเก่า (คิว)", "ใช้คอร์ส (คิว)", "รวมคิว", "ค่าคอมลูกค้าใหม่ (฿)", "ค่าคอมลูกค้าเก่า (฿)", "ค่าคอมคอร์ส (฿)", "รวมค่าคอม (฿)"]
  ];

  staff.forEach(s => {
    const staffQueues = filteredQueues.filter(q => q.recordedBy === s.id);
    const branch = branches.find(b => b.id === s.branchId);

    const newCount = staffQueues.filter(q => q.customerType === "new").length;
    const oldCount = staffQueues.filter(q => q.customerType === "old").length;
    const courseCount = staffQueues.filter(q => q.customerType === "course").length;

    const newCommission = newCount * (s.commissionRates?.new || 0);
    const oldCommission = oldCount * (s.commissionRates?.old || 0);
    const courseCommission = courseCount * (s.commissionRates?.course || 0);
    const totalCommission = newCommission + oldCommission + courseCommission;

    if (staffQueues.length > 0) {
      rows.push([
        s.nickname || s.name,
        branch?.name || "ทุกสาขา",
        newCount,
        oldCount,
        courseCount,
        staffQueues.length,
        newCommission,
        oldCommission,
        courseCommission,
        totalCommission,
      ]);
    }
  });

  const branchLabel = branchId !== "all" ? `_${branches.find(b => b.id === branchId)?.name || branchId}` : "";
  const filename = `สรุปค่าคอมพนักงาน${branchLabel}_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.xlsx`;
  // cols 6-9 = ค่าคอม (฿)
  downloadXLSX(filename, rows, { numericCols: [2, 3, 4, 5], currencyCols: [6, 7, 8, 9] });
}

// ═══════════════════════════════════════════════════════════
// EXPORT QUEUE DATA
// ═══════════════════════════════════════════════════════════

export function exportQueueData(queues, branches, rooms, procedures, promos, staff, startDate, endDate, branchId = "all") {
  const filteredQueues = filterQueuesForExport(queues, { startDate, endDate, branchId, includeCourse: false });

  const rows = [
    ["วันที่", "เวลา", "ชื่อลูกค้า", "เบอร์โทร", "สาขา", "ห้อง", "หัตถการ", "โปร/แพ็กเกจ", "ประเภทลูกค้า", "ราคา (฿)", "สถานะ", "หมายเหตุ", "พนักงานบันทึก"]
  ];

  const statusLabels = {
    pending: "รอยืนยัน",
    follow1: "โทรตาม ×1",
    follow2: "โทรตาม ×2",
    follow3: "โทรตาม ×3",
    confirmed: "ยืนยันแล้ว",
    rescheduled: "เลื่อนออก",
    rescheduled_in: "เลื่อนมา (ใหม่)",
    no_show: "ไม่มาตามนัด",
    cancelled: "ยกเลิก",
    done: "มาแล้ว/เสร็จ",
  };

  filteredQueues.forEach(q => {
    const branch = branches.find(b => b.id === q.branchId);
    const room = rooms.find(r => r.id === q.roomId);
    const procedure = procedures.find(p => p.id === q.procedureId);
    const promo = promos.find(p => p.id === q.promoId);
    const staffMember = staff.find(s => s.id === q.recordedBy);

    const customerTypeLabel = q.customerType === "new" ? "ลูกค้าใหม่" :
                              q.customerType === "old" ? "ลูกค้าเก่า" : "ใช้คอร์ส";

    rows.push([
      formatThaiDate(q.date),
      q.timeBlock !== null ? blockToTime(q.timeBlock) : "-",
      q.name,
      q.phone,
      branch?.name || "-",
      room?.name || "-",
      procedure?.name || "-",
      promo?.name || "-",
      customerTypeLabel,
      parseFloat(q.price) || 0,
      statusLabels[q.status] || q.status,
      q.note || "",
      staffMember ? (staffMember.nickname || staffMember.name) : "-",
    ]);
  });

  const branchLabel = branchId !== "all" ? `_${branches.find(b => b.id === branchId)?.name || branchId}` : "";
  const filename = `ข้อมูลคิว${branchLabel}_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.xlsx`;
  // col 9 = ราคา (฿)
  downloadXLSX(filename, rows, { currencyCols: [9] });
}

// ═══════════════════════════════════════════════════════════
// EXPORT SUMMARY DATA
// ═══════════════════════════════════════════════════════════

export function exportSummaryData(queues, branches, procedures, startDate, endDate, branchId = "all") {
  const filteredQueues = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    if (branchId !== "all" && q.branchId !== branchId) return false;
    return true;
  });

  const rows = [
    ["สาขา", "หัตถการ", "ลูกค้าใหม่", "ลูกค้าเก่า", "ใช้คอร์ส", "รวมคิว", "รวมรายได้ (฿)"]
  ];

  const filteredBranches = branchId !== "all" ? branches.filter(b => b.id === branchId) : branches;
  filteredBranches.forEach(branch => {
    const branchQueues = filteredQueues.filter(q => q.branchId === branch.id && q.status === "done");

    procedures.forEach(procedure => {
      const procQueues = branchQueues.filter(q => q.procedureId === procedure.id);

      if (procQueues.length > 0) {
        const newCount = procQueues.filter(q => q.customerType === "new").length;
        const oldCount = procQueues.filter(q => q.customerType === "old").length;
        const courseCount = procQueues.filter(q => q.customerType === "course").length;
        const totalRevenue = procQueues.reduce((sum, q) => sum + (parseFloat(q.price) || 0), 0);

        rows.push([
          branch.name,
          procedure.name,
          newCount,
          oldCount,
          courseCount,
          procQueues.length,
          totalRevenue,
        ]);
      }
    });
  });

  const branchLabel = branchId !== "all" ? `_${branches.find(b => b.id === branchId)?.name || branchId}` : "";
  const filename = `สรุปรายได้${branchLabel}_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.xlsx`;
  // col 6 = รายได้ (฿)
  downloadXLSX(filename, rows, { numericCols: [2, 3, 4, 5], currencyCols: [6] });
}

// ═══════════════════════════════════════════════════════════
// EXPORT BRANCHES DATA
// ═══════════════════════════════════════════════════════════

export function exportBranchesData(branches, rooms) {
  const rows = [
    ["ชื่อสาขา", "จำนวนห้อง", "ห้องประเภท M", "ห้องประเภท T"]
  ];

  branches.forEach(branch => {
    const branchRooms = rooms.filter(r => r.branchId === branch.id);
    const mRooms = branchRooms.filter(r => r.type === "M").length;
    const tRooms = branchRooms.filter(r => r.type === "T").length;

    rows.push([
      branch.name,
      branchRooms.length,
      mRooms,
      tRooms,
    ]);
  });

  const filename = `ข้อมูลสาขา_${new Date().toISOString().split("T")[0]}.xlsx`;
  downloadXLSX(filename, rows, { numericCols: [1, 2, 3] });
}

// ═══════════════════════════════════════════════════════════
// EXPORT STAFF DATA
// ═══════════════════════════════════════════════════════════

export function exportStaffData(staff, branches) {
  const rows = [
    ["ชื่อ", "ชื่อเล่น", "เบอร์โทร", "สาขา", "ตำแหน่ง", "สถานะ", "ค่าคอมลูกค้าใหม่ (฿)", "ค่าคอมลูกค้าเก่า (฿)", "ค่าคอมคอร์ส (฿)"]
  ];

  const roleLabels = {
    superadmin: "ผู้ดูแลระบบ",
    head_admin: "หัวหน้าแอดมิน",
    admin: "แอดมิน",
    branch_manager: "ผู้จัดการสาขา",
    cashier: "แคชเชีย",
  };

  staff.forEach(s => {
    const branch = branches.find(b => b.id === s.branchId);

    rows.push([
      s.name,
      s.nickname || "",
      s.phone || "",
      branch?.name || "ทุกสาขา",
      roleLabels[s.role] || s.role,
      s.active ? "ใช้งาน" : "ปิดการใช้งาน",
      parseFloat(s.commissionRates?.new) || 0,
      parseFloat(s.commissionRates?.old) || 0,
      parseFloat(s.commissionRates?.course) || 0,
    ]);
  });

  const filename = `ข้อมูลพนักงาน_${new Date().toISOString().split("T")[0]}.xlsx`;
  // cols 6-8 = ค่าคอม (฿)
  downloadXLSX(filename, rows, { currencyCols: [6, 7, 8] });
}

// ═══════════════════════════════════════════════════════════
// EXPORT HN CUSTOMERS
// ═══════════════════════════════════════════════════════════

/**
 * hnCustomers: array ที่ได้จาก Supabase hn_customers table
 * fields: hn_id, firstname, lastname, nickname, telephone, birthdate, synced_at
 */
export function exportHnCustomers(hnCustomers) {
  const rows = [
    ["HN ID", "ชื่อ", "นามสกุล", "ชื่อเล่น", "เบอร์โทร", "วันเกิด", "อัปเดตล่าสุด"]
  ];

  hnCustomers.forEach(c => {
    rows.push([
      c.hn_id || "",
      c.firstname || "",
      c.lastname || "",
      c.nickname || "",
      c.telephone || "",
      c.birthdate || "",
      c.synced_at ? new Date(c.synced_at).toLocaleString("th-TH") : "",
    ]);
  });

  const filename = `HN_ลูกค้า_${new Date().toISOString().split("T")[0]}.xlsx`;
  downloadXLSX(filename, rows);
}

// ═══════════════════════════════════════════════════════════
// EXPORT BOOKING REPORT (ตรวจสอบการจอง)
// ═══════════════════════════════════════════════════════════

/**
 * รายงานตรวจสอบการจอง — แสดงทุกคิวพร้อมสถานะ ใช้ตรวจสอบว่าคิวไหน
 * ยืนยันแล้ว / รอ / ไม่มา / ยกเลิก ในช่วงเวลาที่เลือก
 */
export function exportBookingReport(queues, branches, rooms, procedures, promos, staff, startDate, endDate, branchId = "all") {
  const statusLabels = {
    pending: "รอยืนยัน",
    follow1: "โทรตาม ×1",
    follow2: "โทรตาม ×2",
    follow3: "โทรตาม ×3",
    confirmed: "ยืนยันแล้ว",
    rescheduled: "เลื่อนออก",
    rescheduled_in: "เลื่อนมา (ใหม่)",
    no_show: "ไม่มาตามนัด",
    cancelled: "ยกเลิก",
    done: "มาแล้ว/เสร็จ",
  };

  const filtered = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    if (branchId !== "all" && q.branchId !== branchId) return false;
    return true;
  });

  // Group by status for summary sheet
  const statusCount = {};
  Object.keys(statusLabels).forEach(k => { statusCount[k] = 0; });
  filtered.forEach(q => { if (q.status in statusCount) statusCount[q.status]++; });

  // Detail rows
  const detailRows = [
    ["วันที่", "เวลา", "ชื่อลูกค้า", "เบอร์โทร", "สาขา", "ห้อง", "หัตถการ", "โปร/แพ็กเกจ", "ประเภทลูกค้า", "ราคา (฿)", "สถานะ", "หมายเหตุสถานะ", "พนักงานบันทึก"],
  ];

  // Sort by date asc, then time asc
  const sorted = [...filtered].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.timeBlock ?? 999) - (b.timeBlock ?? 999);
  });

  sorted.forEach(q => {
    const branch = branches.find(b => b.id === q.branchId);
    const room = rooms.find(r => r.id === q.roomId);
    const procedure = procedures.find(p => p.id === q.procedureId);
    const promo = promos.find(p => p.id === q.promoId);
    const staffMember = staff.find(s => s.id === q.recordedBy);
    const customerTypeLabel = q.customerType === "new" ? "ลูกค้าใหม่" :
                              q.customerType === "old" ? "ลูกค้าเก่า" : "ใช้คอร์ส";

    detailRows.push([
      formatThaiDate(q.date),
      q.timeBlock !== null ? blockToTime(q.timeBlock) : "-",
      q.name,
      q.phone,
      branch?.name || "-",
      room?.name || "-",
      procedure?.name || "-",
      promo?.name || "-",
      customerTypeLabel,
      parseFloat(q.price) || 0,
      statusLabels[q.status] || q.status,
      q.statusNote || "",
      staffMember ? (staffMember.nickname || staffMember.name) : "-",
    ]);
  });

  // Summary sheet rows
  const summaryRows = [
    ["สถานะ", "จำนวนคิว"],
    ...Object.entries(statusLabels).map(([k, label]) => [label, statusCount[k]]),
    ["", ""],
    ["รวมทั้งหมด", filtered.length],
    ["มาแล้ว/เสร็จ", statusCount["done"]],
    ["ไม่มา + ยกเลิก", (statusCount["no_show"] || 0) + (statusCount["cancelled"] || 0)],
  ];

  // Build workbook with 2 sheets
  const wb = XLSX.utils.book_new();

  // Sheet 1: รายละเอียด
  const wsDetail = buildStyledSheet(detailRows, { currencyCols: [9] });
  XLSX.utils.book_append_sheet(wb, wsDetail, "รายละเอียดการจอง");

  // Sheet 2: สรุป
  const wsSummary = buildStyledSheet(summaryRows, { numericCols: [1] });
  XLSX.utils.book_append_sheet(wb, wsSummary, "สรุปสถานะ");

  const branchLabel = branchId !== "all" ? `_${branches.find(b => b.id === branchId)?.name || branchId}` : "";
  XLSX.writeFile(wb, `รายงานการจอง${branchLabel}_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.xlsx`);
}

// ═══════════════════════════════════════════════════════════
// EXPORT CUSTOMER TYPE REPORT (ลูกค้าใหม่/เก่า/คอร์ส ตามสาขา)
// ═══════════════════════════════════════════════════════════

/**
 * รายงานเปรียบเทียบสัดส่วนลูกค้าใหม่ / เก่า / คอร์ส
 * แยกตามสาขา พร้อมยอดรายได้แต่ละประเภท
 */
export function exportCustomerTypeReport(queues, branches, procedures, startDate, endDate, branchId = "all") {
  const filtered = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    if (branchId !== "all" && q.branchId !== branchId) return false;
    return q.status === "done";
  });

  const targetBranches = branchId !== "all"
    ? branches.filter(b => b.id === branchId)
    : branches;

  // === Sheet 1: สรุปตามสาขา ===
  const branchRows = [
    ["สาขา", "ลูกค้าใหม่", "รายได้ลูกค้าใหม่ (฿)", "ลูกค้าเก่า", "รายได้ลูกค้าเก่า (฿)", "ใช้คอร์ส", "รายได้คอร์ส (฿)", "รวมคิว", "รวมรายได้ (฿)"],
  ];

  let totalNew = 0, totalOld = 0, totalCourse = 0;
  let totalRevNew = 0, totalRevOld = 0, totalRevCourse = 0;

  targetBranches.forEach(branch => {
    const bq = filtered.filter(q => q.branchId === branch.id);
    const newQ = bq.filter(q => q.customerType === "new");
    const oldQ = bq.filter(q => q.customerType === "old");
    const courseQ = bq.filter(q => q.customerType === "course");

    const revNew = newQ.reduce((s, q) => s + (parseFloat(q.price) || 0), 0);
    const revOld = oldQ.reduce((s, q) => s + (parseFloat(q.price) || 0), 0);
    const revCourse = courseQ.reduce((s, q) => s + (parseFloat(q.price) || 0), 0);

    if (bq.length > 0) {
      branchRows.push([
        branch.name,
        newQ.length, revNew,
        oldQ.length, revOld,
        courseQ.length, revCourse,
        bq.length, revNew + revOld + revCourse,
      ]);
    }

    totalNew += newQ.length; totalRevNew += revNew;
    totalOld += oldQ.length; totalRevOld += revOld;
    totalCourse += courseQ.length; totalRevCourse += revCourse;
  });

  // Grand total row
  branchRows.push([
    "รวมทั้งหมด",
    totalNew, totalRevNew,
    totalOld, totalRevOld,
    totalCourse, totalRevCourse,
    totalNew + totalOld + totalCourse,
    totalRevNew + totalRevOld + totalRevCourse,
  ]);

  // === Sheet 2: รายละเอียดรายวัน ===
  const dailyMap = {};
  filtered.forEach(q => {
    if (!dailyMap[q.date]) dailyMap[q.date] = { new: 0, old: 0, course: 0, revNew: 0, revOld: 0, revCourse: 0 };
    const t = q.customerType;
    const price = parseFloat(q.price) || 0;
    if (t === "new") { dailyMap[q.date].new++; dailyMap[q.date].revNew += price; }
    else if (t === "old") { dailyMap[q.date].old++; dailyMap[q.date].revOld += price; }
    else { dailyMap[q.date].course++; dailyMap[q.date].revCourse += price; }
  });

  const dailyRows = [
    ["วันที่", "ลูกค้าใหม่", "รายได้ใหม่ (฿)", "ลูกค้าเก่า", "รายได้เก่า (฿)", "ใช้คอร์ส", "รายได้คอร์ส (฿)", "รวมคิว", "รวมรายได้ (฿)"],
  ];
  Object.entries(dailyMap)
    .sort(([a], [b]) => a < b ? -1 : 1)
    .forEach(([date, d]) => {
      dailyRows.push([
        formatThaiDate(date),
        d.new, d.revNew,
        d.old, d.revOld,
        d.course, d.revCourse,
        d.new + d.old + d.course,
        d.revNew + d.revOld + d.revCourse,
      ]);
    });

  // === Sheet 3: รายละเอียดตามหัตถการ ===
  const procMap = {};
  filtered.forEach(q => {
    const proc = procedures.find(p => p.id === q.procedureId);
    const procName = proc?.name || "ไม่ระบุ";
    if (!procMap[procName]) procMap[procName] = { new: 0, old: 0, course: 0, revenue: 0 };
    procMap[procName][q.customerType || "new"]++;
    procMap[procName].revenue += parseFloat(q.price) || 0;
  });

  const procRows = [
    ["หัตถการ", "ลูกค้าใหม่", "ลูกค้าเก่า", "ใช้คอร์ส", "รวมคิว", "รวมรายได้ (฿)"],
    ...Object.entries(procMap)
      .sort(([, a], [, b]) => (b.new + b.old + b.course) - (a.new + a.old + a.course))
      .map(([name, d]) => [name, d.new, d.old, d.course, d.new + d.old + d.course, d.revenue]),
  ];

  // Build workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(branchRows, { numericCols: [1, 3, 5, 7], currencyCols: [2, 4, 6, 8] }), "สรุปตามสาขา");
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(dailyRows, { numericCols: [1, 3, 5, 7], currencyCols: [2, 4, 6, 8] }), "รายวัน");
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(procRows, { numericCols: [1, 2, 3, 4], currencyCols: [5] }), "ตามหัตถการ");

  const branchLabel = branchId !== "all" ? `_${branches.find(b => b.id === branchId)?.name || branchId}` : "";
  XLSX.writeFile(wb, `รายงานลูกค้า${branchLabel}_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.xlsx`);
}

// ── Shared helper: build a styled worksheet ─────────────────
function buildStyledSheet(rows, { numericCols = [], currencyCols = [] } = {}) {
  const wsData = rows.map((row, rowIdx) =>
    row.map((cell, colIdx) => {
      if (rowIdx === 0) return String(cell);
      if (numericCols.includes(colIdx) || currencyCols.includes(colIdx)) {
        const n = parseFloat(cell);
        return isNaN(n) ? cell : n;
      }
      return cell === null || cell === undefined ? "" : String(cell);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Header styling
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1D4ED8" } },
      alignment: { horizontal: "center" },
    };
  }

  // Currency format
  if (currencyCols.length > 0) {
    for (let R = 1; R <= range.e.r; R++) {
      currencyCols.forEach(C => {
        const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[cellAddr] && typeof ws[cellAddr].v === "number") {
          ws[cellAddr].z = "฿#,##0.00";
        }
      });
    }
  }

  // Auto widths
  const colWidths = rows[0].map((_, colIdx) => {
    const maxLen = rows.reduce((max, row) => {
      const val = row[colIdx] !== null && row[colIdx] !== undefined ? String(row[colIdx]) : "";
      return Math.max(max, val.length);
    }, 0);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
  ws["!cols"] = colWidths;
  return ws;
}

// ═══════════════════════════════════════════════════════════
// BACKUP ALL DATA
// ═══════════════════════════════════════════════════════════

export function backupAllData({ queues, branches, rooms, procedures, promos, staff, roomSchedules }) {
  const backupPayload = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    data: {
      queues: queues || [],
      branches: branches || [],
      rooms: rooms || [],
      procedures: procedures || [],
      promos: promos || [],
      staff: staff || [],
      roomSchedules: roomSchedules || [],
    },
  };

  const json = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.setAttribute("href", url);
  link.setAttribute("download", `Qlass_backup_${date}.json`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
