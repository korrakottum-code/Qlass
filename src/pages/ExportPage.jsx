import { useState } from "react";
import { getTodayStr } from "../utils/helpers";
import {
  exportCommissionData,
  exportCommissionSummary,
  exportQueueData,
  exportSummaryData,
  exportBranchesData,
  exportStaffData,
  exportHnCustomers,
  exportBookingReport,
  exportCustomerTypeReport,
  backupAllData,
} from "../utils/exportService";
import { fetchAllHnCustomers } from "../utils/supabaseService";

// ── Date preset helpers ─────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  // วันนี้
  const today = toDateStr(now);

  // เมื่อวาน
  const yd = new Date(y, m, d - 1);
  const yesterday = toDateStr(yd);

  // สัปดาห์นี้ (จันทร์ - วันนี้)
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(y, m, d - ((dayOfWeek + 6) % 7));
  const thisWeekStart = toDateStr(monday);

  // สัปดาห์ที่แล้ว
  const lastMonday = new Date(y, m, d - ((dayOfWeek + 6) % 7) - 7);
  const lastSunday = new Date(y, m, d - ((dayOfWeek + 6) % 7) - 1);
  const lastWeekStart = toDateStr(lastMonday);
  const lastWeekEnd = toDateStr(lastSunday);

  // เดือนนี้
  const thisMonthStart = toDateStr(new Date(y, m, 1));
  const thisMonthEnd = toDateStr(new Date(y, m + 1, 0));

  // เดือนที่แล้ว
  const lastMonthStart = toDateStr(new Date(y, m - 1, 1));
  const lastMonthEnd = toDateStr(new Date(y, m, 0));

  // ไตรมาสนี้
  const qStart = Math.floor(m / 3) * 3;
  const thisQStart = toDateStr(new Date(y, qStart, 1));
  const thisQEnd = toDateStr(new Date(y, qStart + 3, 0));

  // ปีนี้
  const thisYearStart = toDateStr(new Date(y, 0, 1));
  const thisYearEnd = toDateStr(new Date(y, 11, 31));

  return [
    { label: "วันนี้", start: today, end: today },
    { label: "เมื่อวาน", start: yesterday, end: yesterday },
    { label: "สัปดาห์นี้", start: thisWeekStart, end: today },
    { label: "สัปดาห์ที่แล้ว", start: lastWeekStart, end: lastWeekEnd },
    { label: "เดือนนี้", start: thisMonthStart, end: thisMonthEnd },
    { label: "เดือนที่แล้ว", start: lastMonthStart, end: lastMonthEnd },
    { label: "ไตรมาสนี้", start: thisQStart, end: thisQEnd },
    { label: "ปีนี้", start: thisYearStart, end: thisYearEnd },
  ];
}

// ── Main Component ──────────────────────────────────────────

export default function ExportPage({ queues, branches, rooms, procedures, promos, staff, roomSchedules }) {
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [filterBranch, setFilterBranch] = useState("all");
  const [hnLoading, setHnLoading] = useState(false);

  const presets = getPresets();

  function applyPreset(preset) {
    setStartDate(preset.start);
    setEndDate(preset.end);
  }

  async function handleExportHn() {
    setHnLoading(true);
    try {
      const customers = await fetchAllHnCustomers();
      if (!customers || customers.length === 0) {
        alert("ไม่พบข้อมูล HN ในระบบ — รัน HN Sync ก่อนนะครับ");
        return;
      }
      exportHnCustomers(customers);
    } catch (err) {
      console.error("HN export error:", err);
      alert("เกิดข้อผิดพลาด: " + (err.message || err));
    } finally {
      setHnLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: "#1a1a2e" }}>
        📊 Export ข้อมูล
      </h1>

      {/* ── Date Range Selector ───────────────────────────── */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
        border: "1px solid #e5e7eb",
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#374151" }}>
          เลือกช่วงวันที่
        </h3>

        {/* Preset buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {presets.map((p) => {
            const active = startDate === p.start && endDate === p.end;
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: active ? "none" : "1.5px solid #d1d5db",
                  background: active ? "#2563eb" : "#f9fafb",
                  color: active ? "#fff" : "#374151",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Date pickers + branch filter */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
              วันที่เริ่มต้น
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14, outline: "none" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
              วันที่สิ้นสุด
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14, outline: "none" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
              สาขา
            </label>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14, outline: "none", minWidth: 160 }}
            >
              <option value="all">ทุกสาขา</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Export Sections ───────────────────────────────── */}
      <div style={{ display: "grid", gap: 20 }}>

        {/* Commission Exports */}
        <ExportSection
          title="💰 ค่าคอมมิชชั่น"
          description="Export ข้อมูลค่าคอมมิชชั่นพนักงาน"
          color="#059669"
          buttons={[
            {
              label: "📥 รายละเอียดค่าคอม",
              onClick: () => exportCommissionData(queues, staff, branches, procedures, promos, startDate, endDate, filterBranch),
            },
            {
              label: "📥 สรุปค่าคอมพนักงาน",
              onClick: () => exportCommissionSummary(queues, staff, branches, startDate, endDate, filterBranch),
            },
          ]}
        />

        {/* Queue Exports */}
        <ExportSection
          title="📋 ข้อมูลคิว"
          description="Export ข้อมูลคิวทั้งหมด"
          color="#2563eb"
          buttons={[
            {
              label: "📥 ข้อมูลคิว",
              onClick: () => exportQueueData(queues, branches, rooms, procedures, promos, staff, startDate, endDate, filterBranch),
            },
          ]}
        />

        {/* Summary Exports */}
        <ExportSection
          title="📊 สรุปรายได้"
          description="Export สรุปรายได้ตามสาขาและหัตถการ"
          color="#7c3aed"
          buttons={[
            {
              label: "📥 สรุปรายได้",
              onClick: () => exportSummaryData(queues, branches, procedures, startDate, endDate, filterBranch),
            },
          ]}
        />

        {/* HN Customers Export */}
        <ExportSection
          title="🏥 ลูกค้า HN (Pro Clinic)"
          description="Export ข้อมูลลูกค้าทั้งหมดที่ sync มาจาก Pro Clinic (HN ID, ชื่อ, เบอร์โทร, วันเกิด)"
          color="#0891b2"
          buttons={[
            {
              label: hnLoading ? "⏳ กำลังโหลด..." : "📥 Export HN ลูกค้า",
              onClick: handleExportHn,
              disabled: hnLoading,
            },
          ]}
        />

        {/* Booking Report */}
        <ExportSection
          title="🗓️ รายงานตรวจสอบการจอง"
          description="ตรวจสอบสถานะคิวทั้งหมด — รอยืนยัน, ยืนยันแล้ว, ไม่มา, ยกเลิก พร้อมสรุปจำนวนแต่ละสถานะ (2 sheets)"
          color="#0f766e"
          buttons={[
            {
              label: "📥 รายงานการจอง",
              onClick: () => exportBookingReport(queues, branches, rooms, procedures, promos, staff, startDate, endDate, filterBranch),
            },
          ]}
        />

        {/* Customer Type Report */}
        <ExportSection
          title="👥 รายงานลูกค้าใหม่/เก่า/คอร์ส"
          description="เปรียบเทียบสัดส่วนและรายได้ตามประเภทลูกค้า แยกตามสาขา / รายวัน / หัตถการ (3 sheets)"
          color="#be185d"
          buttons={[
            {
              label: "📥 รายงานประเภทลูกค้า",
              onClick: () => exportCustomerTypeReport(queues, branches, procedures, startDate, endDate, filterBranch),
            },
          ]}
        />

        {/* Master Data Exports */}
        <ExportSection
          title="🏢 ข้อมูลหลัก"
          description="Export ข้อมูลสาขา พนักงาน และอื่นๆ"
          color="#d97706"
          buttons={[
            {
              label: "📥 ข้อมูลสาขา",
              onClick: () => exportBranchesData(branches, rooms),
            },
            {
              label: "📥 ข้อมูลพนักงาน",
              onClick: () => exportStaffData(staff, branches),
            },
          ]}
        />

        {/* Backup */}
        <ExportSection
          title="💾 Backup ข้อมูลทั้งหมด"
          description="สำรองข้อมูลทุกอย่าง (คิว, สาขา, ห้อง, หัตถการ, โปร, พนักงาน) เป็นไฟล์ JSON"
          color="#6b21a8"
          buttons={[
            {
              label: "⬇️ Download Backup (.json)",
              onClick: () => backupAllData({ queues, branches, rooms, procedures, promos, staff, roomSchedules }),
            },
          ]}
        />
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: 8,
        fontSize: 13,
        color: "#1e40af",
      }}>
        <strong>💡 หมายเหตุ:</strong> ไฟล์ที่ Export จะอยู่ในรูปแบบ <strong>.xlsx</strong> (Excel) พร้อมสกุลเงิน ฿ — เปิดได้ด้วย Excel และ Google Sheets
      </div>
    </div>
  );
}

// ── ExportSection component ─────────────────────────────────

function ExportSection({ title, description, color, buttons }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: 20,
      border: "1px solid #e5e7eb",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}>
          {title}
        </h3>
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        {description}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {buttons.map((btn, idx) => (
          <button
            key={idx}
            onClick={btn.onClick}
            disabled={btn.disabled}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: btn.disabled ? "#9ca3af" : color,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: btn.disabled ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: btn.disabled ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!btn.disabled) {
                e.currentTarget.style.opacity = "0.85";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
