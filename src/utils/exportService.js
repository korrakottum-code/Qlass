import { formatThaiDate, blockToTime } from "./helpers";

// ═══════════════════════════════════════════════════════════
// CSV EXPORT UTILITIES
// ═══════════════════════════════════════════════════════════

function escapeCSV(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ═══════════════════════════════════════════════════════════
// EXPORT COMMISSION DATA
// ═══════════════════════════════════════════════════════════

export function exportCommissionData(queues, staff, branches, procedures, promos, startDate, endDate) {
  const filteredQueues = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    return q.status === "done";
  });

  const rows = [
    ["วันที่", "ชื่อลูกค้า", "เบอร์โทร", "สาขา", "หัตถการ", "โปร/แพ็กเกจ", "ประเภทลูกค้า", "ราคา", "พนักงานบันทึก", "ค่าคอม"]
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
      q.price || 0,
      staffMember ? (staffMember.nickname || staffMember.name) : "-",
      commission
    ]);
  });

  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const filename = `ค่าคอมมิชชั่น_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.csv`;
  downloadCSV(filename, csvContent);
}

// ═══════════════════════════════════════════════════════════
// EXPORT COMMISSION SUMMARY BY STAFF
// ═══════════════════════════════════════════════════════════

export function exportCommissionSummary(queues, staff, branches, startDate, endDate) {
  const filteredQueues = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    return q.status === "done";
  });

  const rows = [
    ["พนักงาน", "สาขา", "ลูกค้าใหม่ (คิว)", "ลูกค้าเก่า (คิว)", "ใช้คอร์ส (คิว)", "รวมคิว", "ค่าคอมลูกค้าใหม่", "ค่าคอมลูกค้าเก่า", "ค่าคอมคอร์ส", "รวมค่าคอม"]
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
        totalCommission
      ]);
    }
  });

  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const filename = `สรุปค่าคอมพนักงาน_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.csv`;
  downloadCSV(filename, csvContent);
}

// ═══════════════════════════════════════════════════════════
// EXPORT QUEUE DATA
// ═══════════════════════════════════════════════════════════

export function exportQueueData(queues, branches, rooms, procedures, promos, staff, startDate, endDate) {
  const filteredQueues = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    return true;
  });

  const rows = [
    ["วันที่", "เวลา", "ชื่อลูกค้า", "เบอร์โทร", "สาขา", "ห้อง", "หัตถการ", "โปร/แพ็กเกจ", "ประเภทลูกค้า", "ราคา", "สถานะ", "หมายเหตุ", "พนักงานบันทึก"]
  ];

  filteredQueues.forEach(q => {
    const branch = branches.find(b => b.id === q.branchId);
    const room = rooms.find(r => r.id === q.roomId);
    const procedure = procedures.find(p => p.id === q.procedureId);
    const promo = promos.find(p => p.id === q.promoId);
    const staffMember = staff.find(s => s.id === q.recordedBy);
    
    const customerTypeLabel = q.customerType === "new" ? "ลูกค้าใหม่" : 
                              q.customerType === "old" ? "ลูกค้าเก่า" : "ใช้คอร์ส";
    
    const statusLabels = {
      pending: "รอยืนยัน",
      follow1: "โทรตาม ×1",
      follow2: "โทรตาม ×2",
      follow3: "โทรตาม ×3",
      confirmed: "ยืนยันแล้ว",
      rescheduled: "เลื่อนนัด",
      no_show: "ไม่มาตามนัด",
      cancelled: "ยกเลิก",
      done: "มาแล้ว/เสร็จ"
    };

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
      q.price || 0,
      statusLabels[q.status] || q.status,
      q.note || "",
      staffMember ? (staffMember.nickname || staffMember.name) : "-"
    ]);
  });

  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const filename = `ข้อมูลคิว_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.csv`;
  downloadCSV(filename, csvContent);
}

// ═══════════════════════════════════════════════════════════
// EXPORT SUMMARY DATA
// ═══════════════════════════════════════════════════════════

export function exportSummaryData(queues, branches, procedures, startDate, endDate) {
  const filteredQueues = queues.filter(q => {
    if (!q.date) return false;
    if (startDate && q.date < startDate) return false;
    if (endDate && q.date > endDate) return false;
    return true;
  });

  const rows = [
    ["สาขา", "หัตถการ", "ลูกค้าใหม่", "ลูกค้าเก่า", "ใช้คอร์ส", "รวมคิว", "รวมรายได้"]
  ];

  branches.forEach(branch => {
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
          totalRevenue
        ]);
      }
    });
  });

  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const filename = `สรุปรายได้_${startDate || "ทั้งหมด"}_${endDate || "ทั้งหมด"}.csv`;
  downloadCSV(filename, csvContent);
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
      tRooms
    ]);
  });

  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const filename = `ข้อมูลสาขา_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(filename, csvContent);
}

// ═══════════════════════════════════════════════════════════
// EXPORT STAFF DATA
// ═══════════════════════════════════════════════════════════

export function exportStaffData(staff, branches) {
  const rows = [
    ["ชื่อ", "ชื่อเล่น", "เบอร์โทร", "สาขา", "ตำแหน่ง", "สถานะ", "ค่าคอมลูกค้าใหม่", "ค่าคอมลูกค้าเก่า", "ค่าคอมคอร์ส"]
  ];

  const roleLabels = {
    superadmin: "ผู้ดูแลระบบ",
    head_admin: "หัวหน้าแอดมิน",
    admin: "แอดมิน",
    branch_manager: "ผู้จัดการสาขา",
    cashier: "แคชเชีย"
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
      s.commissionRates?.new || 0,
      s.commissionRates?.old || 0,
      s.commissionRates?.course || 0
    ]);
  });

  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const filename = `ข้อมูลพนักงาน_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(filename, csvContent);
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
