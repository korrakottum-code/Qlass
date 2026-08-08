import { useState, useMemo, useCallback } from "react";
import { CUSTOMER_TYPES, ROLES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass, canViewAllBranches, isoToLocalDateStr } from "../utils/helpers";
import { buildPromoPriceIndex, queueBookedValue } from "../utils/promoValue";
import AdSpendCard from "../components/AdSpendCard";

// ─── Date Distribution Bar Chart ───
const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function DateDistributionChart({ title, queues }) {
  const data = useMemo(() => {
    const m = {};
    queues.forEach(q => {
      if (q.date) m[q.date] = (m[q.date] || 0) + 1;
    });
    return Object.entries(m)
      .map(([date, count]) => {
        const d = new Date(date);
        const dow = DOW_SHORT[d.getDay()];
        const day = parseInt(date.slice(8));
        const month = d.getMonth() + 1;
        return { date, label: `${dow} ${day}/${month}`, count };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [queues]);

  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const today = getTodayStr();

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", flexWrap: "wrap" }}>
        {data.map(({ date, label, count }) => {
          const isToday = date === today;
          const heightPct = Math.max(12, (count / max) * 80);
          return (
            <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 36 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{count}</span>
              <div style={{
                width: 32,
                height: heightPct,
                background: isToday ? "var(--accent)" : `rgba(185,94,66,${0.3 + 0.7 * (count / max)})`,
                borderRadius: "4px 4px 0 0",
                border: isToday ? "2px solid var(--accent)" : "none",
              }} />
              <span style={{ fontSize: 9, color: isToday ? "var(--accent)" : "var(--text3)", fontWeight: isToday ? 800 : 400, textAlign: "center", whiteSpace: "nowrap" }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateInputButton({ value, onChange, min, max }) {
  const display = value ? value.split("-").reverse().join("/") : "เลือกวันที่";
  return (
    <label className="summary-date-input">
      <span className="summary-date-input-value">{display}</span>
      <span className="summary-date-input-icon" aria-hidden="true" />
      <input type="date" value={value} onChange={onChange} min={min} max={max} className="summary-date-native" />
    </label>
  );
}

// ─── Mini Bar Chart ───
function MiniBarChart({ title, data, colorFn, onSelect, selectedValues, maxItems = 12 }) {
  if (!data || data.length === 0) return null;
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(...data.map((d) => d.value), 1);
  const visibleData = expanded ? data : data.slice(0, maxItems);
  const selected = Array.isArray(selectedValues) ? selectedValues : [];
  const hasSelection = selected.length > 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 5 }}>
        {visibleData.map((d, i) => {
          const isSelected = selected.includes(d.label);
          const dimmed = hasSelection && !isSelected;
          return (
            <div
              key={i}
              onClick={() => onSelect && onSelect(d.label)}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: onSelect ? "pointer" : "default", opacity: dimmed ? 0.35 : 1, transition: "opacity 0.2s" }}
            >
              <div style={{ width: 96, fontSize: 11, color: isSelected ? "var(--accent)" : "var(--text2)", fontWeight: isSelected ? 700 : 400, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                {d.label}
              </div>
              <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 4, height: 18, position: "relative", overflow: "hidden", outline: isSelected ? "2px solid var(--accent)" : "none", borderRadius: 4 }}>
                <div style={{
                  width: `${(d.value / max) * 100}%`,
                  height: "100%",
                  background: colorFn ? colorFn(i) : "var(--accent)",
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                  minWidth: d.value > 0 ? 4 : 0,
                }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", minWidth: 32, textAlign: "right" }}>
                {d.value}
              </div>
              {d.revenue !== undefined && (
                <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)", minWidth: 54, textAlign: "right" }}>
                  ฿{d.revenue.toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {data.length > maxItems && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text2)",
            borderRadius: 7,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {expanded ? "ซ่อนรายการ" : `ดูเพิ่ม ${data.length - maxItems} รายการ`}
        </button>
      )}
    </div>
  );
}

// ─── Collapsible Card ───
function CollapsibleCard({ title, subtitle, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 18, borderRadius: 12 }}>
      <div
        className="card-header"
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", userSelect: "none", paddingTop: 12, paddingBottom: 12 }}
      >
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
          {title}
          {badge}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {subtitle && <span style={{ fontSize: 12, color: "var(--text3)" }}>{subtitle}</span>}
          <span style={{ fontSize: 18, color: "var(--text3)", transition: "transform 0.2s", transform: open ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block" }}>▾</span>
        </div>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

function QueueMiniTable({ items, procedures, promos, rooms, branches, emptyText }) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>เวลานัด</th>
            <th>ชื่อลูกค้า</th>
            <th>สาขา</th>
            <th>ห้อง</th>
            <th>หัตถการ</th>
            <th>ราคา</th>
            <th>ประเภท</th>
            {items[0]?.createdAt !== undefined && <th>บันทึกวันที่</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((q) => {
            const proc = procedures.find((p) => p.id === q.procedureId);
            const room = rooms.find((r) => r.id === q.roomId);
            const branch = branches.find((b) => b.id === q.branchId);
            const ct = CUSTOMER_TYPES.find((c) => c.value === q.customerType);
            return (
              <tr key={q.id}>
                <td style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13 }}>
                  {q.timeBlock !== null ? blockToTime(q.timeBlock) : "—"}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{q.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{q.phone}</div>
                </td>
                <td style={{ fontSize: 12 }}>{branch?.name || "—"}</td>
                <td>
                  {room ? (
                    <span style={{
                      fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12,
                      color: room.type === "M" ? "var(--blue)" : "var(--green)",
                    }}>{room.name}</span>
                  ) : "—"}
                </td>
                <td style={{ fontSize: 13 }}>{proc?.name || "—"}</td>
                <td style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--accent)" }}>
                  {q.price ? `฿${Number(q.price).toLocaleString()}` : "—"}
                </td>
                <td>
                  <span className={`badge ${getCustomerBadgeClass(q.customerType)}`}>
                    {ct?.emoji} {ct?.label}
                  </span>
                </td>
                {q.createdAt !== undefined && (
                  <td style={{ fontSize: 11, color: "var(--text3)" }}>
                    {formatThaiDate(isoToLocalDateStr(q.createdAt))}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "12px 14px", borderRadius: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
      minWidth: 96,
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    }}>
      <span style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.3 }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 800, color: color || "var(--accent)", lineHeight: 1.1, marginTop: 6 }}>{value}</span>
    </div>
  );
}

function SectionStats({ queues, procedures, promoPriceIndex, showStatus = false }) {
  const total = queues.length;
  const revenue = queues.reduce((s, q) => s + queueBookedValue(q, promoPriceIndex), 0);
  const byType = {
    new: queues.filter((q) => q.customerType === "new").length,
    old: queues.filter((q) => q.customerType === "old").length,
    course: queues.filter((q) => q.customerType === "course").length,
  };
  
  const byStatus = {
    pending: queues.filter((q) => q.status === "pending").length,
    follow1: queues.filter((q) => q.status === "follow1").length,
    follow2: queues.filter((q) => q.status === "follow2").length,
    follow3: queues.filter((q) => q.status === "follow3").length,
    confirmed: queues.filter((q) => q.status === "confirmed").length,
    rescheduled: queues.filter((q) => q.status === "rescheduled").length,
    no_show: queues.filter((q) => q.status === "no_show").length,
    cancelled: queues.filter((q) => q.status === "cancelled").length,
    done: queues.filter((q) => q.status === "done").length,
  };
  
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        <StatChip label="คิวทั้งหมด" value={total} color="var(--accent)" />
        <StatChip label="มูลค่าโปรที่จอง" value={revenue ? `฿${revenue.toLocaleString()}` : "—"} color="var(--green)" />
        <StatChip label="ลูกค้าใหม่" value={byType.new} color="var(--blue)" />
        <StatChip label="ลูกค้าเก่า" value={byType.old} color="var(--text2)" />
        <StatChip label="ใช้คอร์ส" value={byType.course} color="var(--amber)" />
      </div>
      
      {showStatus && total > 0 && (
        <div style={{
          marginTop: 4,
          padding: "12px 16px",
          background: "var(--surface2)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>
            📊 สถานะคิว
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {byStatus.pending > 0 && <StatChip label="รอยืนยัน" value={byStatus.pending} color="#f59e0b" />}
            {byStatus.follow1 > 0 && <StatChip label="โทรตาม ×1" value={byStatus.follow1} color="#f97316" />}
            {byStatus.follow2 > 0 && <StatChip label="โทรตาม ×2" value={byStatus.follow2} color="#ef4444" />}
            {byStatus.follow3 > 0 && <StatChip label="โทรตาม ×3" value={byStatus.follow3} color="#dc2626" />}
            {byStatus.confirmed > 0 && <StatChip label="ยืนยันแล้ว" value={byStatus.confirmed} color="#3b82f6" />}
            {byStatus.rescheduled > 0 && <StatChip label="เลื่อนนัด" value={byStatus.rescheduled} color="#8b5cf6" />}
            {byStatus.no_show > 0 && <StatChip label="ไม่มาตามนัด" value={byStatus.no_show} color="#6b7280" />}
            {byStatus.cancelled > 0 && <StatChip label="ยกเลิก" value={byStatus.cancelled} color="#ef4444" />}
            {byStatus.done > 0 && <StatChip label="มาแล้ว/เสร็จ" value={byStatus.done} color="#10b981" />}
          </div>
        </div>
      )}
    </>
  );
}

function TopPromoRanking({ title, queues, promos, procedures }) {
  const promoStats = useMemo(() => {
    const promoPriceIndex = buildPromoPriceIndex(promos);
    const stats = {};
    queues.forEach(q => {
      if (q.promoId) {
        if (!stats[q.promoId]) {
          stats[q.promoId] = { count: 0, revenue: 0 };
        }
        stats[q.promoId].count++;
        stats[q.promoId].revenue += queueBookedValue(q, promoPriceIndex);
      }
    });
    return Object.entries(stats)
      .map(([promoId, data]) => {
        const promo = promos.find(p => p.id === promoId);
        const procedure = procedures.find(p => p.id === promo?.procedureId);
        return { promo, procedure, ...data };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [queues, promos, procedures]);

  if (promoStats.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gap: 8 }}>
          {promoStats.map((stat, idx) => (
            <div key={stat.promo?.id} style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "var(--surface2)",
              borderRadius: "var(--radius-sm)",
              border: "1.5px solid var(--border)",
            }}>
              <div style={{
                fontSize: 20,
                fontWeight: 800,
                color: idx === 0 ? "#f59e0b" : idx === 1 ? "#9ca3af" : idx === 2 ? "#cd7f32" : "var(--text3)",
                minWidth: 28,
              }}>
                #{idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)" }}>
                  {stat.promo?.name || "—"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>
                  {stat.procedure?.name || "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>
                  {stat.count} คิว
                </div>
                <div style={{ fontSize: 11, color: "var(--green)", fontFamily: "var(--mono)" }}>
                  ฿{stat.revenue.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SummaryPage({ queues, allQueues, branches, allBranches, rooms, procedures, promos, staff, currentUser }) {
  const [viewMode, setViewMode] = useState("day"); // day | week | month
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProcedure, setFilterProcedure] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCustomerType, setFilterCustomerType] = useState("all");
  // Multi-select cross filter — { branch: [], role: [], room: [], procedure: [], recorder: [], promo: [] }
  const [crossFilter, setCrossFilter] = useState({ branch: [], role: [], room: [], procedure: [], recorder: [], promo: [] });
  const [customStart, setCustomStart] = useState(getTodayStr());
  const [customEnd, setCustomEnd] = useState(getTodayStr());
  const [densityMode, setDensityMode] = useState("compact"); // compact | detailed
  const promoPriceIndex = useMemo(() => buildPromoPriceIndex(promos), [promos]);
  const isMultiBranch = canViewAllBranches(currentUser);
  const isSuperAdmin = currentUser?.role === "superadmin";

  function handleCrossFilter(dim, value) {
    if (value == null) {
      // clear this dim
      setCrossFilter((prev) => ({ ...prev, [dim]: [] }));
      return;
    }
    setCrossFilter((prev) => {
      const arr = prev[dim] || [];
      const exists = arr.includes(value);
      return { ...prev, [dim]: exists ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  const hasAnyCrossFilter =
    crossFilter.branch.length +
      crossFilter.role.length +
      crossFilter.room.length +
      crossFilter.procedure.length +
      crossFilter.recorder.length +
      crossFilter.promo.length >
    0;

  // ─── คำนวณ date range ตาม viewMode ───
  const dateRange = useMemo(() => {
    const d = new Date(selectedDate);
    if (viewMode === "day") {
      return { start: selectedDate, end: selectedDate };
    } else if (viewMode === "week") {
      const day = d.getDay(); // 0=Sun
      const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: isoToLocalDateStr(mon), end: isoToLocalDateStr(sun) };
    } else if (viewMode === "custom") {
      const s = customStart || customEnd || selectedDate;
      const e = customEnd || customStart || selectedDate;
      return s <= e ? { start: s, end: e } : { start: e, end: s };
    } else {
      const start = `${selectedDate.slice(0, 7)}-01`;
      const end = isoToLocalDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { start, end };
    }
  }, [selectedDate, viewMode, customStart, customEnd]);

  function navigate(dir) {
    const d = new Date(selectedDate);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setSelectedDate(isoToLocalDateStr(d));
  }

  const rangeLabel = useMemo(() => {
    if (viewMode === "day") return formatThaiDate(selectedDate);
    if (viewMode === "week" || viewMode === "custom") {
      const s = new Date(dateRange.start).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      const e = new Date(dateRange.end).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
      return dateRange.start === dateRange.end ? formatThaiDate(dateRange.start) : `${s} – ${e}`;
    }
    return new Date(selectedDate).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  }, [viewMode, selectedDate, dateRange]);

  // Apply filters
  const filteredQueues = useMemo(() => {
    let result = queues;
    if (isMultiBranch && filterBranch !== "all") {
      result = result.filter(q => q.branchId === filterBranch);
    }
    if (filterCategory !== "all") {
      result = result.filter(q => {
        const proc = procedures.find(p => p.id === q.procedureId);
        return proc?.category === filterCategory;
      });
    }
    if (filterProcedure !== "all") {
      result = result.filter(q => q.procedureId === filterProcedure);
    }
    if (filterCustomerType === "new+old") {
      result = result.filter(q => q.customerType === "new" || q.customerType === "old");
    } else if (filterCustomerType !== "all") {
      result = result.filter(q => q.customerType === filterCustomerType);
    }
    return result;
  }, [queues, filterCategory, filterProcedure, filterBranch, filterCustomerType, isMultiBranch, procedures]);

  // ─── filter ตาม date range ───
  const inRange = useCallback((dateStr) => {
    if (!dateStr) return false;
    // dateRange.start / .end are "YYYY-MM-DD" strings; compare lexically as
    // strings. Do NOT convert to Date — Date >= string coerces to Number(NaN)
    // and always returns false, which silently hides all rows.
    return dateStr >= dateRange.start && dateStr <= dateRange.end;
  }, [dateRange]);

  // คิวที่ถูกบันทึกในช่วงนี้ (createdAt) — ไม่นับ rescheduled_in (คิวเลื่อน ไม่ใช่คิวใหม่)
  const recordedQueues = useMemo(() =>
    filteredQueues
      .filter((q) => q.status !== "rescheduled_in" && inRange(q.createdAt ? isoToLocalDateStr(q.createdAt) : (q.date || "")))
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.timeBlock || 0) - (b.timeBlock || 0)),
    [filteredQueues, inRange]
  );

  // คิวที่มี appointment ในช่วงนี้ (date)
  const appointmentQueues = useMemo(() =>
    filteredQueues
      .filter((q) => inRange(q.date))
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.timeBlock || 0) - (b.timeBlock || 0)),
    [filteredQueues, inRange]
  );

  // ─── cross-filter recorded queues (multi-select within each dim, AND across dims) ───
  const crossFilteredRecorded = useMemo(() => {
    if (!hasAnyCrossFilter) return recordedQueues;
    return recordedQueues.filter((q) => {
      if (crossFilter.branch.length > 0) {
        const b = branches.find((x) => x.id === q.branchId);
        if (!crossFilter.branch.includes(b?.name || "ไม่ระบุ")) return false;
      }
      if (crossFilter.role.length > 0) {
        const s = staff?.find((x) => x.id === q.recordedBy);
        const roleLabel = ROLES.find((r) => r.value === s?.role)?.label || "ไม่ระบุ";
        if (!crossFilter.role.includes(roleLabel)) return false;
      }
      if (crossFilter.room.length > 0) {
        const r = rooms.find((x) => x.id === q.roomId);
        const k = r ? `[${r.type}] ${r.name}` : "ไม่ระบุ";
        if (!crossFilter.room.includes(k)) return false;
      }
      if (crossFilter.procedure.length > 0) {
        const p = procedures.find((x) => x.id === q.procedureId);
        if (!crossFilter.procedure.includes(p?.name || "ไม่ระบุ")) return false;
      }
      if (crossFilter.recorder.length > 0) {
        const s = staff?.find((x) => x.id === q.recordedBy);
        const name = s?.nickname || s?.name || "ไม่ระบุ";
        if (!crossFilter.recorder.includes(name)) return false;
      }
      if (crossFilter.promo.length > 0) {
        const p = promos.find((x) => x.id === q.promoId);
        const k = p?.name || "ไม่ระบุโปร";
        if (!crossFilter.promo.includes(k)) return false;
      }
      return true;
    });
  }, [recordedQueues, crossFilter, hasAnyCrossFilter, branches, staff, rooms, procedures, promos]);

  const futureFromToday = crossFilteredRecorded.filter((q) => !inRange(q.date));
  const advanceBookings = appointmentQueues.filter((q) => !inRange(q.createdAt ? isoToLocalDateStr(q.createdAt) : (q.date || "")));

  const availableCategories = useMemo(() => {
    const cats = new Set(procedures.map(p => p.category).filter(Boolean));
    return Array.from(cats);
  }, [procedures]);

  const availableProcedures = useMemo(() => {
    if (filterCategory === "all") return procedures;
    return procedures.filter(p => p.category === filterCategory);
  }, [procedures, filterCategory]);

  return (
    <>
      <div className="summary-topbar">
        <div>
          <div className="summary-title">📊 สรุปภาพรวมประจำวัน</div>
          <div className="summary-subtitle">ดูคิวที่บันทึก + คิวนัดทำ ในหน้าเดียวแบบอ่านง่าย</div>
        </div>
        <div className="summary-range-pill">ช่วงที่เลือก: {rangeLabel}</div>
      </div>

      {/* ─── Mode + Navigation + Filters ─── */}
      <div className="summary-filter-panel">
        <div className="form-group" style={{ marginBottom: 0, gridColumn: "span 2" }}>
          <label className="form-label">มุมมองเวลา</label>
          <div className="summary-mode-toggle">
            {[{ v: "day", l: "รายวัน" }, { v: "week", l: "อาทิตย์" }, { v: "month", l: "เดือน" }, { v: "custom", l: "กำหนดเอง" }].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`summary-mode-btn ${viewMode === v ? "active" : ""}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "custom" ? (
          <div className="form-group" style={{ marginBottom: 0, gridColumn: "span 2" }}>
            <label className="form-label">ช่วงวันที่</label>
            <div className="summary-date-controls">
              <DateInputButton value={customStart} onChange={(e) => setCustomStart(e.target.value)} max={customEnd || undefined} />
              <span style={{ color: "var(--text3)" }}>–</span>
              <DateInputButton value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} min={customStart || undefined} />
              <button
                onClick={() => { const t = getTodayStr(); setCustomStart(t); setCustomEnd(t); }}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}
              >วันนี้</button>
            </div>
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: 0, gridColumn: "span 2" }}>
            <label className="form-label">ช่วงเวลา</label>
            <div className="summary-date-controls">
              <button onClick={() => navigate(-1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>‹</button>
              <DateInputButton value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <button onClick={() => navigate(1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>›</button>
              <button onClick={() => setSelectedDate(getTodayStr())} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>วันนี้</button>
            </div>
          </div>
        )}

        {isMultiBranch && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">สาขา</label>
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} style={{ minWidth: 140 }}>
              <option value="all">ทุกสาขา</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">หมวดหมู่</label>
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterProcedure("all"); }}>
            <option value="all">ทั้งหมด</option>
            {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">หัตถการ</label>
          <select value={filterProcedure} onChange={(e) => setFilterProcedure(e.target.value)}>
            <option value="all">ทั้งหมด</option>
            {availableProcedures.map(proc => <option key={proc.id} value={proc.id}>{proc.name}</option>)}
          </select>
        </div>

        {/* Customer Type filter */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ประเภทลูกค้า</label>
          <select value={filterCustomerType} onChange={(e) => setFilterCustomerType(e.target.value)} style={{ minWidth: 140 }}>
            <option value="all">ทั้งหมด</option>
            <option value="new+old">ลูกใหม่+เก่า</option>
            <option value="new">ลูกค้าใหม่</option>
            <option value="old">ลูกค้าเก่า</option>
            <option value="course">ใช้คอร์ส</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ความหนาแน่นหน้า</label>
          <div className="summary-density-toggle">
            <button
              onClick={() => setDensityMode("compact")}
              className={`summary-density-btn ${densityMode === "compact" ? "active" : ""}`}
            >
              Compact
            </button>
            <button
              onClick={() => setDensityMode("detailed")}
              className={`summary-density-btn ${densityMode === "detailed" ? "active" : ""}`}
            >
              Detailed
            </button>
          </div>
        </div>
      </div>

      {/* ─── Ad Spend (superadmin only) ─── */}
      {isSuperAdmin && (
        <AdSpendCard
          dateRange={dateRange}
          rangeLabel={rangeLabel}
          selectedDate={selectedDate}
          queues={allQueues || queues}
          staff={staff}
        />
      )}

      {/* Section 1: บันทึกวันนั้น */}
      <CollapsibleCard
        title={`📝 คิวที่บันทึก — ${rangeLabel}`}
        subtitle="ลงทะเบียนเข้าระบบช่วงนี้ — นัดวันไหนก็ได้"
        badge={
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)", background: "var(--surface3)", borderRadius: 10, padding: "2px 10px", color: "var(--text2)" }}>
            {recordedQueues.length} รายการ
          </span>
        }
        defaultOpen={false}
      >
        <SectionStats queues={crossFilteredRecorded} procedures={procedures} promoPriceIndex={promoPriceIndex} />
        {hasAnyCrossFilter && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 8, padding: "6px 10px", background: "rgba(185,94,66,0.08)", borderRadius: 6, border: "1px solid var(--accent)" }}>
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>🔍 กรอง:</span>
            {(["branch", "role", "room", "procedure", "recorder", "promo"]).flatMap((dim) =>
              (crossFilter[dim] || []).map((v) => {
                let label = v;
                if (dim === "recorder") label = `👤 ${v}`;
                if (dim === "promo") label = `🎁 ${v}`;
                return (
                  <button
                    key={`${dim}:${v}`}
                    onClick={() => handleCrossFilter(dim, v)}
                    title="คลิกเพื่อลบ"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 12, border: "1px solid var(--accent)", background: "var(--surface)", color: "var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >{label} ✕</button>
                );
              })
            )}
            <button onClick={() => setCrossFilter({ branch: [], role: [], room: [], procedure: [], recorder: [], promo: [] })} style={{ marginLeft: "auto", fontSize: 11, padding: "2px 10px", borderRadius: 6, border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", cursor: "pointer", fontWeight: 700 }}>✕ Clear all</button>
          </div>
        )}
        {futureFromToday.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--blue)", marginBottom: 8, padding: "4px 10px", background: "var(--blue-soft)", borderRadius: 6 }}>
            📌 ในจำนวนนี้ <strong>{futureFromToday.length}</strong> คิว บันทึกวันนี้แต่นัดวันอื่น (pre-book)
          </div>
        )}
        {recordedQueues.length > 0 && (
          <>
          <DateDistributionChart title="📅 คิวไปนัดวันไหนบ้าง" queues={crossFilteredRecorded} />
          <div className={`summary-chart-scroll ${densityMode}`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginTop: 12 }}>
            {isMultiBranch && <MiniBarChart title="🏠 สาขา" data={(() => { const m = {}; crossFilteredRecorded.forEach(q => { const b = branches.find(x => x.id === q.branchId); const k = b?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${200+i*30},60%,55%)`} onSelect={(v) => handleCrossFilter("branch", v)} selectedValues={crossFilter.branch} maxItems={densityMode === "compact" ? 8 : 14} />}
            <MiniBarChart title="👤 ผู้บันทึก (ตามบทบาท)" data={(() => { const m = {}; crossFilteredRecorded.forEach(q => { const s = staff?.find(x => x.id === q.recordedBy); const roleLabel = ROLES.find(r => r.value === s?.role)?.label || "ไม่ระบุ"; if (!m[roleLabel]) m[roleLabel] = { value: 0, revenue: 0 }; m[roleLabel].value++; m[roleLabel].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${260+i*25},60%,60%)`} onSelect={(v) => handleCrossFilter("role", v)} selectedValues={crossFilter.role} maxItems={densityMode === "compact" ? 8 : 14} />
            <MiniBarChart title="🚪 ห้อง" data={(() => { const m = {}; crossFilteredRecorded.forEach(q => { const r = rooms.find(x => x.id === q.roomId); const k = r ? `[${r.type}] ${r.name}` : "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => i%2===0?"var(--blue)":"var(--green)"} onSelect={(v) => handleCrossFilter("room", v)} selectedValues={crossFilter.room} maxItems={densityMode === "compact" ? 8 : 14} />
            <MiniBarChart title="💉 หัตถการ" data={(() => { const m = {}; crossFilteredRecorded.forEach(q => { const p = procedures.find(x => x.id === q.procedureId); const k = p?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${340+i*25},65%,55%)`} onSelect={(v) => handleCrossFilter("procedure", v)} selectedValues={crossFilter.procedure} maxItems={densityMode === "compact" ? 8 : 14} />
            <MiniBarChart title="🎁 โปร" data={(() => { const m = {}; crossFilteredRecorded.forEach(q => { const p = promos.find(x => x.id === q.promoId); const k = p?.name || "ไม่ระบุโปร"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${15+i*22},75%,58%)`} onSelect={(v) => handleCrossFilter("promo", v)} selectedValues={crossFilter.promo} maxItems={densityMode === "compact" ? 8 : 14} />
            <MiniBarChart title="👤 แอดมิน (บันทึกคิว)" data={(() => { const m = {}; const adminIds = new Set((staff || []).filter(s => s?.role === "admin").map(s => s.id)); crossFilteredRecorded.forEach(q => { if (!adminIds.has(q.recordedBy)) return; const s = staff.find(x => x.id === q.recordedBy); const k = s?.nickname || s?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${30+i*20},70%,55%)`} onSelect={(v) => handleCrossFilter("recorder", v)} selectedValues={crossFilter.recorder} maxItems={densityMode === "compact" ? 8 : 14} />
          </div>
          </div>
          </>
        )}
      </CollapsibleCard>

      {/* Section 2: นัดทำวันนั้น */}
      <CollapsibleCard
        title={`✅ คิวนัดทำ — ${rangeLabel}`}
        subtitle="appointment ช่วงนี้ — บันทึกวันไหนก็ได้"
        badge={
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)", background: "var(--surface3)", borderRadius: 10, padding: "2px 10px", color: "var(--text2)" }}>
            {appointmentQueues.length} รายการ
          </span>
        }
        defaultOpen={true}
      >
        <SectionStats queues={appointmentQueues} procedures={procedures} promoPriceIndex={promoPriceIndex} showStatus={true} />
        {advanceBookings.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 8, padding: "4px 10px", background: "rgba(245,158,11,0.1)", borderRadius: 6 }}>
            📌 ในจำนวนนี้ <strong>{advanceBookings.length}</strong> คิว จองล่วงหน้ามาจากวันก่อนหน้า
          </div>
        )}
        {appointmentQueues.length > 0 && (
          <>
          <div className={`summary-chart-scroll ${densityMode}`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginTop: 12 }}>
            {isMultiBranch && <MiniBarChart title="🏠 สาขา" data={(() => { const m = {}; appointmentQueues.forEach(q => { const b = branches.find(x => x.id === q.branchId); const k = b?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${200+i*30},60%,55%)`} maxItems={densityMode === "compact" ? 8 : 14} />}
            <MiniBarChart title="🚪 ห้อง" data={(() => { const m = {}; appointmentQueues.forEach(q => { const r = rooms.find(x => x.id === q.roomId); const k = r ? `[${r.type}] ${r.name}` : "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => i%2===0?"var(--blue)":"var(--green)"} maxItems={densityMode === "compact" ? 8 : 14} />
            <MiniBarChart title="💉 หัตถการ" data={(() => { const m = {}; appointmentQueues.forEach(q => { const p = procedures.find(x => x.id === q.procedureId); const k = p?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${340+i*25},65%,55%)`} maxItems={densityMode === "compact" ? 8 : 14} />
            <MiniBarChart title="🎁 โปร" data={(() => { const m = {}; appointmentQueues.forEach(q => { const p = promos.find(x => x.id === q.promoId); const k = p?.name || "ไม่ระบุโปร"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += queueBookedValue(q, promoPriceIndex); }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${15+i*22},75%,58%)`} maxItems={densityMode === "compact" ? 8 : 14} />
          </div>
          </div>
          </>
        )}
      </CollapsibleCard>
    </>
  );
}
