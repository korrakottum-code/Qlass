import { useState, useEffect } from "react";
import { getTodayStr } from "../utils/helpers";
import { pickDatePresets } from "../utils/datePresets";
import {
  exportCommissionData,
  exportCommissionSummary,
  exportQueueData,
  exportCustomerTypeReport,
  backupAllData,
} from "../utils/exportService";



// ── Main Component ──────────────────────────────────────────

export default function ExportPage({ queues, branches, rooms, procedures, promos, staff, roomSchedules, onRangeNeeded, onLoadAll }) {
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [backupLoading, setBackupLoading] = useState(false);
  // ขอให้ App โหลดคิวช่วงที่เลือก ถ้ายังไม่มีใน state (เกิน 30 วันล่าสุด) — ระหว่างโหลดปิดปุ่ม export
  // ไม่งั้นกดเร็ว ๆ หลังเลือก "เดือนที่แล้ว" จะได้ไฟล์ที่ข้อมูลยังไม่ครบ
  const [rangeLoading, setRangeLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setRangeLoading(true);
    Promise.resolve(onRangeNeeded?.(startDate, endDate)).finally(() => { if (alive) setRangeLoading(false); });
    return () => { alive = false; };
  }, [startDate, endDate, onRangeNeeded]);
  const [filterBranch, setFilterBranch] = useState("all");

  const presets = pickDatePresets([
    "today", "yesterday", "thisWeek", "lastWeek",
    "thisMonth", "lastMonth", "thisQuarter", "thisYear",
  ]);

  function applyPreset(preset) {
    setStartDate(preset.start);
    setEndDate(preset.end);
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
              label: rangeLoading ? "⏳ กำลังโหลดช่วงที่เลือก…" : "📥 รายละเอียดค่าคอม", disabled: rangeLoading,
              onClick: () => exportCommissionData(queues, staff, branches, procedures, promos, startDate, endDate, filterBranch),
            },
            {
              label: rangeLoading ? "⏳ กำลังโหลดช่วงที่เลือก…" : "📥 สรุปค่าคอมพนักงาน", disabled: rangeLoading,
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
              label: rangeLoading ? "⏳ กำลังโหลดช่วงที่เลือก…" : "📥 ข้อมูลคิว", disabled: rangeLoading,
              onClick: () => exportQueueData(queues, branches, rooms, procedures, promos, staff, startDate, endDate, filterBranch),
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
              label: rangeLoading ? "⏳ กำลังโหลดช่วงที่เลือก…" : "📥 รายงานประเภทลูกค้า", disabled: rangeLoading,
              onClick: () => exportCustomerTypeReport(queues, branches, procedures, startDate, endDate, filterBranch),
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
              label: backupLoading ? "⏳ กำลังโหลดประวัติทั้งหมด…" : "⬇️ Download Backup (.json)",
              // Backup ต้องใช้ประวัติทั้งหมด — โหลดตอนกดเท่านั้น (ไม่โหลดล่วงหน้าทุกครั้งที่เปิดแอป)
              onClick: async () => {
                if (backupLoading) return;
                let all = queues;
                if (onLoadAll) {
                  setBackupLoading(true);
                  try {
                    const r = await onLoadAll();
                    if (r?.queues) all = r.queues;
                    if (r && !r.complete && !window.confirm("โหลดประวัติได้ไม่ครบ ต้องการ Backup ต่อด้วยข้อมูลเท่าที่มีหรือไม่?")) return;
                  } finally { setBackupLoading(false); }
                }
                backupAllData({ queues: all, branches, rooms, procedures, promos, staff, roomSchedules });
              },
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
