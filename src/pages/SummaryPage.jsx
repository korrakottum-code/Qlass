import { useState, useMemo, useCallback } from "react";
import { CUSTOMER_TYPES, PROCEDURE_CATEGORIES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass } from "../utils/helpers";

// ─── Mini Bar Chart ───
function MiniBarChart({ title, data, colorFn }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 5 }}>
        {data.slice(0, 8).map((d, i) => (
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

export default function SummaryPage({ queues, branches, rooms, procedures, promos }) {
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProcedure, setFilterProcedure] = useState("all");

  // Apply filters
  const filteredQueues = useMemo(() => {
    let result = queues;
    
    if (filterCategory !== "all") {
      result = result.filter(q => {
        const proc = procedures.find(p => p.id === q.procedureId);
        return proc?.category === filterCategory;
      });
    }
    
    if (filterProcedure !== "all") {
      result = result.filter(q => q.procedureId === filterProcedure);
    }
    
    return result;
  }, [queues, filterCategory, filterProcedure, procedures]);

  // คิวที่ถูก บันทึก วันนั้น (createdAt)
  const recordedQueues = useMemo(() =>
    filteredQueues
      .filter((q) => {
        const created = (q.createdAt || q.date || "").slice(0, 10);
        return created === selectedDate;
      })
      .sort((a, b) => (a.timeBlock || 0) - (b.timeBlock || 0)),
    [filteredQueues, selectedDate]
  );

  // คิวที่มี appointment วันนั้น (date)
  const appointmentQueues = useMemo(() =>
    filteredQueues
      .filter((q) => q.date === selectedDate)
      .sort((a, b) => (a.timeBlock || 0) - (b.timeBlock || 0)),
    [filteredQueues, selectedDate]
  );

  // คิวที่บันทึกวันนั้น แต่นัดวันอื่น (future bookings made today)
  const futureFromToday = recordedQueues.filter((q) => q.date !== selectedDate);
  // คิวที่นัดวันนั้น แต่บันทึกวันก่อนหน้า (advance bookings)
  const advanceBookings = appointmentQueues.filter((q) => (q.createdAt || q.date || "").slice(0, 10) !== selectedDate);

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
      {/* Date and Filter selectors */}
      <div className="filter-bar" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">เลือกวันที่</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">หมวดหมู่</label>
          <select value={filterCategory} onChange={(e) => {
            setFilterCategory(e.target.value);
            setFilterProcedure("all");
          }}>
            <option value="all">ทั้งหมด</option>
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">หัตถการ</label>
          <select value={filterProcedure} onChange={(e) => setFilterProcedure(e.target.value)}>
            <option value="all">ทั้งหมด</option>
            {availableProcedures.map(proc => (
              <option key={proc.id} value={proc.id}>{proc.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>
            {formatThaiDate(selectedDate)}
          </span>
        </div>
      </div>

      {/* ─── Charts ─── */}
      {appointmentQueues.length > 0 && (
        <CollapsibleCard
          title="📊 ภาพรวมคิวนัดทำวันนี้"
          subtitle="แยกตามห้อง / หัตถการ / สาขา"
          defaultOpen={true}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
            <MiniBarChart
              title="🏠 สาขา"
              data={(() => {
                const map = {};
                appointmentQueues.forEach((q) => {
                  const b = branches.find((x) => x.id === q.branchId);
                  const key = b?.name || "ไม่ระบุ";
                  if (!map[key]) map[key] = { value: 0, revenue: 0 };
                  map[key].value++;
                  map[key].revenue += Number(q.price) || 0;
                });
                return Object.entries(map).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value);
              })()}
              colorFn={(i) => `hsl(${200 + i * 30}, 60%, 55%)`}
            />
            <MiniBarChart
              title="🚪 ห้อง"
              data={(() => {
                const map = {};
                appointmentQueues.forEach((q) => {
                  const r = rooms.find((x) => x.id === q.roomId);
                  const key = r ? `[${r.type}] ${r.name}` : "ไม่ระบุ";
                  if (!map[key]) map[key] = { value: 0, revenue: 0 };
                  map[key].value++;
                  map[key].revenue += Number(q.price) || 0;
                });
                return Object.entries(map).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value);
              })()}
              colorFn={(i) => i % 2 === 0 ? "var(--blue)" : "var(--green)"}
            />
            <MiniBarChart
              title="💉 หัตถการ"
              data={(() => {
                const map = {};
                appointmentQueues.forEach((q) => {
                  const p = procedures.find((x) => x.id === q.procedureId);
                  const key = p?.name || "ไม่ระบุ";
                  if (!map[key]) map[key] = { value: 0, revenue: 0 };
                  map[key].value++;
                  map[key].revenue += Number(q.price) || 0;
                });
                return Object.entries(map).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value);
              })()}
              colorFn={(i) => `hsl(${340 + i * 25}, 65%, 55%)`}
            />
          </div>
        </CollapsibleCard>
      )}

      {/* Section 1: บันทึกวันนั้น */}
      <CollapsibleCard
        title="📝 คิวที่บันทึกวันนี้"
        subtitle="ลงทะเบียนเข้าระบบวันนี้ — นัดวันไหนก็ได้"
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
        <QueueMiniTable
          items={recordedQueues}
          procedures={procedures} promos={promos} rooms={rooms} branches={branches}
          emptyText="ยังไม่มีคิวที่บันทึกวันนี้"
        />
      </CollapsibleCard>

      {/* Section 2: นัดทำวันนั้น */}
      <CollapsibleCard
        title="📅 คิวนัดทำวันนี้"
        subtitle="appointment วันนี้ — บันทึกวันไหนก็ได้"
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
        <QueueMiniTable
          items={appointmentQueues}
          procedures={procedures} promos={promos} rooms={rooms} branches={branches}
          emptyText="ยังไม่มีคิวนัดวันนี้"
        />
      </CollapsibleCard>
    </>
  );
}
