import { useState } from "react";
import { getTodayStr } from "../utils/helpers";
import {
  exportCommissionData,
  exportCommissionSummary,
  exportQueueData,
  exportSummaryData,
  exportBranchesData,
  exportStaffData,
  backupAllData,
} from "../utils/exportService";

export default function ExportPage({ queues, branches, rooms, procedures, promos, staff, roomSchedules }) {
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: "#1a1a2e" }}>
        📊 Export ข้อมูล
      </h1>

      {/* Date Range Selector */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
        border: "1px solid #e5e7eb",
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#374151" }}>
          เลือกช่วงวันที่
        </h3>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
              วันที่เริ่มต้น
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px solid #d1d5db",
                fontSize: 14,
                outline: "none",
              }}
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
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px solid #d1d5db",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={() => {
                setStartDate(getTodayStr());
                setEndDate(getTodayStr());
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1.5px solid #d1d5db",
                background: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                color: "#374151",
              }}
            >
              วันนี้
            </button>
          </div>
        </div>
      </div>

      {/* Export Sections */}
      <div style={{ display: "grid", gap: 20 }}>
        {/* Commission Exports */}
        <ExportSection
          title="💰 ค่าคอมมิชชั่น"
          description="Export ข้อมูลค่าคอมมิชชั่นพนักงาน"
          color="#059669"
          buttons={[
            {
              label: "Export รายละเอียดค่าคอม",
              onClick: () => exportCommissionData(queues, staff, branches, procedures, promos, startDate, endDate),
            },
            {
              label: "Export สรุปค่าคอมพนักงาน",
              onClick: () => exportCommissionSummary(queues, staff, branches, startDate, endDate),
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
              label: "Export ข้อมูลคิว",
              onClick: () => exportQueueData(queues, branches, rooms, procedures, promos, staff, startDate, endDate),
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
              label: "Export สรุปรายได้",
              onClick: () => exportSummaryData(queues, branches, procedures, startDate, endDate),
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
              label: "Export ข้อมูลสาขา",
              onClick: () => exportBranchesData(branches, rooms),
            },
            {
              label: "Export ข้อมูลพนักงาน",
              onClick: () => exportStaffData(staff, branches),
            },
          ]}
        />

        {/* Backup */}
        <ExportSection
          title="💾 Backup ข้อมูลทั้งหมด"
          description="สำรองข้อมูลทุกอย่าง (คิว, สาขา, ห้อง, หัตถการ, โปร, พนักงาน) เป็นไฟล์ JSON เพื่อเก็บไว้หรือกู้คืนภายหลัง"
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
        <strong>💡 หมายเหตุ:</strong> ไฟล์ที่ Export จะอยู่ในรูปแบบ CSV สามารถเปิดด้วย Excel หรือ Google Sheets ได้
      </div>
    </div>
  );
}

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
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: color,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.85";
              e.currentTarget.style.transform = "translateY(-1px)";
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
