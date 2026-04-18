import { useState, useMemo, useCallback } from "react";
import { CUSTOMER_TYPES, PROCEDURE_CATEGORIES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass, canViewAllBranches } from "../utils/helpers";

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

// ─── Mini Bar Chart ───
function MiniBarChart({ title, data, colorFn }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 5 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 110, fontSize: 11, color: "var(--text2)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
              {d.label}
            </div>
            <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 4, height: 18, position: "relative", overflow: "hidden" }}>
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
              <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)", minWidth: 60, textAlign: "right" }}>
                ฿{d.revenue.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Collapsible Card ───
function CollapsibleCard({ title, subtitle, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        className="card-header"
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                    {formatThaiDate(q.createdAt)}
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
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "10px 16px", borderRadius: "var(--radius-sm)",
      background: "var(--surface2)", border: "1.5px solid var(--border)",
      minWidth: 72,
    }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: color || "var(--accent)" }}>{value}</span>
      <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{label}</span>
    </div>
  );
}

function SectionStats({ queues, procedures, showStatus = false }) {
  const total = queues.length;
  const revenue = queues.reduce((s, q) => s + (Number(q.price) || 0), 0);
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <StatChip label="คิวทั้งหมด" value={total} color="var(--accent)" />
        <StatChip label="รายได้" value={revenue ? `฿${revenue.toLocaleString()}` : "—"} color="var(--green)" />
        <StatChip label="ลูกค้าใหม่" value={byType.new} color="var(--blue)" />
        <StatChip label="ลูกค้าเก่า" value={byType.old} color="var(--text2)" />
        <StatChip label="ใช้คอร์ส" value={byType.course} color="var(--amber)" />
      </div>
      
      {showStatus && total > 0 && (
        <div style={{
          marginTop: 12,
          padding: "12px 16px",
          background: "var(--surface2)",
          borderRadius: "var(--radius-sm)",
          border: "1.5px solid var(--border)",
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
    const stats = {};
    queues.forEach(q => {
      if (q.promoId) {
        if (!stats[q.promoId]) {
          stats[q.promoId] = { count: 0, revenue: 0 };
        }
        stats[q.promoId].count++;
        stats[q.promoId].revenue += Number(q.price) || 0;
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

export default function SummaryPage({ queues, allQueues, branches, allBranches, rooms, procedures, promos, currentUser }) {
  const [viewMode, setViewMode] = useState("day"); // day | week | month
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProcedure, setFilterProcedure] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCustomerType, setFilterCustomerType] = useState("all");
  const isMultiBranch = canViewAllBranches(currentUser);

  // ─── คำนวณ date range ตาม viewMode ───
  const dateRange = useMemo(() => {
    const d = new Date(selectedDate);
    if (viewMode === "day") {
      return { start: selectedDate, end: selectedDate };
    } else if (viewMode === "week") {
      const day = d.getDay(); // 0=Sun
      const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
    } else {
      const start = `${selectedDate.slice(0, 7)}-01`;
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      return { start, end };
    }
  }, [selectedDate, viewMode]);

  function navigate(dir) {
    const d = new Date(selectedDate);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  const rangeLabel = useMemo(() => {
    if (viewMode === "day") return formatThaiDate(selectedDate);
    const opts = { day: "numeric", month: "short", year: "numeric" };
    if (viewMode === "week") {
      const s = new Date(dateRange.start).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      const e = new Date(dateRange.end).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
      return `${s} – ${e}`;
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
    const d = dateStr.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  }, [dateRange]);

  // คิวที่ถูกบันทึกในช่วงนี้ (createdAt)
  const recordedQueues = useMemo(() =>
    filteredQueues
      .filter((q) => inRange((q.createdAt || q.date || "").slice(0, 10)))
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

  const futureFromToday = recordedQueues.filter((q) => !inRange(q.date));
  const advanceBookings = appointmentQueues.filter((q) => !inRange((q.createdAt || q.date || "").slice(0, 10)));

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
      {/* ─── Mode + Navigation + Filters ─── */}
      <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {/* Mode toggle */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">พารามิเตอร์</label>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--border)" }}>
            {[{ v: "day", l: "รายวัน" }, { v: "week", l: "อาทิตย์" }, { v: "month", l: "เดือน" }].map(({ v, l }) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: "6px 16px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                background: viewMode === v ? "var(--accent)" : "var(--surface2)",
                color: viewMode === v ? "#fff" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ช่วงเวลา</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => navigate(-1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>‹</button>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: 140 }} />
            <button onClick={() => navigate(1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>›</button>
            <button onClick={() => setSelectedDate(getTodayStr())} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>วันนี้</button>
          </div>
        </div>

        {/* Branch filter — เห็นเฉพาะ admin หลายสาขา */}
        {isMultiBranch && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">สาขา</label>
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} style={{ minWidth: 140 }}>
              <option value="all">ทุกสาขา</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {/* Filters */}
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

        {/* Range label */}
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>{rangeLabel}</span>
        </div>
      </div>

      {/* Section 1: บันทึกวันนั้น */}
      <CollapsibleCard
        title={`� คิวที่บันทึก — ${rangeLabel}`}
        subtitle="ลงทะเบียนเข้าระบบช่วงนี้ — นัดวันไหนก็ได้"
        badge={
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)", background: "var(--surface3)", borderRadius: 10, padding: "2px 10px", color: "var(--text2)" }}>
            {recordedQueues.length} รายการ
          </span>
        }
        defaultOpen={false}
      >
        <SectionStats queues={recordedQueues} procedures={procedures} />
        {futureFromToday.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--blue)", marginBottom: 8, padding: "4px 10px", background: "var(--blue-soft)", borderRadius: 6 }}>
            📌 ในจำนวนนี้ <strong>{futureFromToday.length}</strong> คิว บันทึกวันนี้แต่นัดวันอื่น (pre-book)
          </div>
        )}
        {recordedQueues.length > 0 && (
          <>
          <DateDistributionChart title="📅 คิวไปนัดวันไหนบ้าง" queues={recordedQueues} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginTop: 12 }}>
            {isMultiBranch && <MiniBarChart title="🏠 สาขา" data={(() => { const m = {}; recordedQueues.forEach(q => { const b = branches.find(x => x.id === q.branchId); const k = b?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += Number(q.price)||0; }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${200+i*30},60%,55%)`} />}
            <MiniBarChart title="🚪 ห้อง" data={(() => { const m = {}; recordedQueues.forEach(q => { const r = rooms.find(x => x.id === q.roomId); const k = r ? `[${r.type}] ${r.name}` : "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += Number(q.price)||0; }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => i%2===0?"var(--blue)":"var(--green)"} />
            <MiniBarChart title="💉 หัตถการ" data={(() => { const m = {}; recordedQueues.forEach(q => { const p = procedures.find(x => x.id === q.procedureId); const k = p?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += Number(q.price)||0; }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${340+i*25},65%,55%)`} />
          </div>
          </>
        )}
      </CollapsibleCard>

      {/* Section 2: นัดทำวันนั้น */}
      <CollapsibleCard
        title={`� คิวนัดทำ — ${rangeLabel}`}
        subtitle="appointment ช่วงนี้ — บันทึกวันไหนก็ได้"
        badge={
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)", background: "var(--surface3)", borderRadius: 10, padding: "2px 10px", color: "var(--text2)" }}>
            {appointmentQueues.length} รายการ
          </span>
        }
        defaultOpen={true}
      >
        <SectionStats queues={appointmentQueues} procedures={procedures} showStatus={true} />
        {advanceBookings.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 8, padding: "4px 10px", background: "rgba(245,158,11,0.1)", borderRadius: 6 }}>
            📌 ในจำนวนนี้ <strong>{advanceBookings.length}</strong> คิว จองล่วงหน้ามาจากวันก่อนหน้า
          </div>
        )}
        {appointmentQueues.length > 0 && (
          <>
          <DateDistributionChart title="📅 คิวไปนัดวันไหนบ้าง" queues={appointmentQueues} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginTop: 12 }}>
            {isMultiBranch && <MiniBarChart title="🏠 สาขา" data={(() => { const m = {}; appointmentQueues.forEach(q => { const b = branches.find(x => x.id === q.branchId); const k = b?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += Number(q.price)||0; }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${200+i*30},60%,55%)`} />}
            <MiniBarChart title="🚪 ห้อง" data={(() => { const m = {}; appointmentQueues.forEach(q => { const r = rooms.find(x => x.id === q.roomId); const k = r ? `[${r.type}] ${r.name}` : "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += Number(q.price)||0; }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => i%2===0?"var(--blue)":"var(--green)"} />
            <MiniBarChart title="💉 หัตถการ" data={(() => { const m = {}; appointmentQueues.forEach(q => { const p = procedures.find(x => x.id === q.procedureId); const k = p?.name || "ไม่ระบุ"; if (!m[k]) m[k] = { value: 0, revenue: 0 }; m[k].value++; m[k].revenue += Number(q.price)||0; }); return Object.entries(m).map(([label,v])=>({label,...v})).sort((a,b)=>b.value-a.value); })()} colorFn={(i) => `hsl(${340+i*25},65%,55%)`} />
          </div>
          </>
        )}
      </CollapsibleCard>
    </>
  );
}
