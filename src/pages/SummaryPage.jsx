import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { CUSTOMER_TYPES, ROLES, QUEUE_STATUSES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass, canViewAllBranches, isoToLocalDateStr } from "../utils/helpers";
import { buildPromoPriceIndex, queueBookedValue } from "../utils/promoValue";
import { buildActivationReport, sortActivationRows, formatRate } from "../utils/statusActivation";
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

// ─── รายงานการแอคทีฟสถานะคิว (ใช้ประเมินสาขา) ───
// กติกาอยู่ใน src/utils/statusActivation.js — การ์ดนี้แค่แสดงผล ไม่ตัดสินเองซ้ำ
const OVERDUE_STATUS_ORDER = ["pending", "follow1", "follow2", "follow3", "confirmed", "rescheduled_in"];

function statusMeta(value) {
  return QUEUE_STATUSES.find((s) => s.value === value);
}

function rateColor(rate) {
  if (rate == null) return "var(--text3)";
  if (rate >= 0.95) return "var(--green)";
  if (rate >= 0.8) return "var(--amber)";
  return "#dc2626";
}

function RateCell({ rate, num, den }) {
  return (
    <td style={{ textAlign: "right" }}>
      <div style={{ fontWeight: 800, fontFamily: "var(--mono)", color: rateColor(rate) }}>{formatRate(rate)}</div>
      {rate != null && (
        <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>{num}/{den}</div>
      )}
    </td>
  );
}

// ช่อง "มา" กับ "ไม่มา" โชว์เปอร์เซ็นต์เป็นตัวหลักและจำนวนคิวเป็นตัวรอง
// เพราะสาขาขนาดต่างกัน เทียบกันด้วยจำนวนดิบไม่ได้ · หัวคอลัมน์จึงเรียงตามเปอร์เซ็นต์
const BRANCH_METRICS = [
  { key: "total", label: "นัดทั้งหมด", short: "นัด", w: 46, sortKey: "total", pick: (r) => r.total, color: "var(--text)" },
  { key: "done", label: "มาจริง", short: "มา", w: 34, sortKey: "showRate", pick: (r) => r.done, rate: (r) => r.showRate, color: "var(--green)" },
  // ไม่มา 0% คือดีที่สุด อย่าย้อมแดงให้ดูเหมือนมีปัญหา
  { key: "noShow", label: "ไม่มาตามนัด", short: "ไม่มา", w: 34, sortKey: "noShowRate", pick: (r) => r.noShow, rate: (r) => r.noShowRate, color: (r) => (r.noShow > 0 ? "#dc2626" : "var(--text3)") },
  { key: "cancelled", label: "ยกเลิก", short: "ยกเลิก", w: 26, sortKey: "cancelled", pick: (r) => r.cancelled, color: "var(--text2)" },
  { key: "rescheduled", label: "เลื่อนออก", short: "เลื่อน", w: 26, sortKey: "rescheduled", pick: (r) => r.rescheduled, color: "var(--text2)" },
];
// แถวมือถือโชว์แค่ นัด กับ % มาจริง — % ไม่มาอยู่ในแผงที่กางออก
// (สองตัวนี้ไม่ได้บวกกันได้ 100 เพราะตัวหารรวมยกเลิก เลื่อนออก และคิวที่ยังค้างด้วย)
const MOBILE_METRICS = BRANCH_METRICS.filter((m) => m.key === "total" || m.key === "done");
const MOBILE_OVERDUE_WIDTH = 38;
const MOBILE_RATE_WIDTH = 36;

function sortArrow(sort, key) {
  if (sort.key !== key) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

// กดคอลัมน์เดิม = สลับขึ้น/ลง · กดคอลัมน์ใหม่ = เริ่มจากมากไปน้อย (ชื่อสาขาเริ่มจาก ก→ฮ)
function nextSort(sort, key) {
  if (sort.key === key) return { key, dir: sort.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "branchName" ? "asc" : "desc" };
}

function OverdueCell({ row, open, onToggle }) {
  if (row.overdue === 0) {
    return <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 700, fontFamily: "var(--mono)" }}>0</td>;
  }
  return (
    <td style={{ textAlign: "right" }}>
      <button
        onClick={onToggle}
        title="กดเพื่อดูรายชื่อคิวที่ต้องไปกดปิดสถานะ"
        style={{
          border: "1.5px solid #dc2626", background: open ? "#dc2626" : "rgba(220,38,38,0.1)",
          color: open ? "#fff" : "#dc2626", borderRadius: 7, padding: "2px 8px",
          fontFamily: "var(--mono)", fontWeight: 800, fontSize: 12, cursor: "pointer",
        }}
      >
        {row.overdue} {open ? "▾" : "▸"}
      </button>
    </td>
  );
}

function metricColor(metric, row) {
  return typeof metric.color === "function" ? metric.color(row) : metric.color;
}

// showCount=false ใช้กับแถวมือถือ — ซ้อนสองบรรทัดแล้วความกว้างของคอลัมน์
// ถูกกำหนดโดยจำนวนคิว (ห้าหลักได้) ทำให้คอลัมน์เบี้ยวและแถวสูงไม่เท่ากัน
// จำนวนดิบไปดูในแผงที่กางออกแทน ส่วนตารางจอใหญ่มีคอลัมน์จริงจึงซ้อนได้ไม่มีปัญหา
function MetricValue({ metric, row, size = 12, bold = 700, showCount = true }) {
  const count = metric.pick(row);
  const color = metricColor(metric, row);
  if (!metric.rate) {
    return <span style={{ fontSize: size, fontWeight: bold, fontFamily: "var(--mono)", color }}>{count}</span>;
  }
  const rate = metric.rate(row);
  if (!showCount) {
    return <span style={{ fontSize: size, fontWeight: 800, fontFamily: "var(--mono)", color }}>{formatRate(rate)}</span>;
  }
  return (
    <>
      <div style={{ fontSize: size, fontWeight: 800, fontFamily: "var(--mono)", color, lineHeight: 1.2 }}>
        {formatRate(rate)}
      </div>
      <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", lineHeight: 1.2 }}>{count}</div>
    </>
  );
}

function SortTh({ sort, onSort, sortKey, align = "right", children }) {
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      title="กดเพื่อเรียงลำดับ"
      style={{ textAlign: align, cursor: "pointer", userSelect: "none", color: active ? "var(--accent)" : undefined }}
    >
      {children}{sortArrow(sort, sortKey)}
    </th>
  );
}

function SortHeader({ sort, onSort, sortKey, style, children }) {
  const active = sort.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      style={{
        border: "none", background: "transparent", padding: 0, cursor: "pointer",
        fontSize: 9.5, textAlign: "right", whiteSpace: "nowrap",
        color: active ? "var(--accent)" : "var(--text3)", fontWeight: active ? 800 : 400,
        ...style,
      }}
    >
      {children}{sortArrow(sort, sortKey)}
    </button>
  );
}

function MobileRate({ label, rate, num, den }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "var(--text3)" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--mono)", color: rateColor(rate), lineHeight: 1.2 }}>
        {formatRate(rate)}
      </div>
      {rate != null && (
        <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>{num}/{den}</div>
      )}
    </div>
  );
}

// มือถือไม่ใช้ตาราง — 9 คอลัมน์ต้องเลื่อนซ้ายขวา ซึ่งไม่มีอะไรบอกให้รู้ว่าเลื่อนได้
// จึงย่อเหลือบรรทัดเดียวต่อสาขา (ชื่อ + คิวค้าง + % แอคทีฟ) ให้ทุกสาขาอยู่ในหน้าจอเดียว
// รายละเอียดที่เหลือกางเมื่อกด จะได้ไม่ต้องเลื่อนยาว
function MobileBranchCard({ row, isTotal = false, open, onToggle, procedures, rooms }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 9, marginBottom: 6,
      background: isTotal ? "var(--surface2)" : "var(--surface)", overflow: "hidden",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 5, padding: "9px 8px 9px 10px",
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: isTotal ? 800 : 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{row.branchName}</span>
        {MOBILE_METRICS.map((m) => (
          <span key={m.key} style={{ width: m.w, textAlign: "right", flexShrink: 0 }}>
            <MetricValue metric={m} row={row} showCount={false} />
          </span>
        ))}
        <span style={{ width: MOBILE_OVERDUE_WIDTH, textAlign: "right", flexShrink: 0 }}>
          <span style={{
            display: "inline-block", padding: "2px 7px", borderRadius: 10,
            fontSize: 11, fontWeight: 800, fontFamily: "var(--mono)", whiteSpace: "nowrap",
            background: row.overdue > 0 ? "rgba(220,38,38,0.12)" : "rgba(22,163,74,0.12)",
            color: row.overdue > 0 ? "#dc2626" : "var(--green)",
          }}>{row.overdue > 0 ? row.overdue : "✓"}</span>
        </span>
        <span style={{
          fontSize: 12.5, fontWeight: 800, fontFamily: "var(--mono)", flexShrink: 0,
          color: rateColor(row.activeRate), width: MOBILE_RATE_WIDTH, textAlign: "right",
        }}>{formatRate(row.activeRate)}</span>
        <span style={{
          fontSize: 12, color: "var(--text3)", display: "inline-block", width: 11,
          transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s",
        }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: "0 10px 10px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--text3)" }}>% แอคทีฟ</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--mono)", color: rateColor(row.activeRate), lineHeight: 1.2 }}>
                {formatRate(row.activeRate)}
                {row.activeRate != null && (
                  <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400, marginLeft: 5 }}>{row.dueActivated}/{row.dueTotal}</span>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--text3)" }}>% ไม่มา</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--mono)", color: row.noShow > 0 ? "#dc2626" : "var(--text3)", lineHeight: 1.2 }}>
                {formatRate(row.noShowRate)}
                {row.noShowRate != null && (
                  <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400, marginLeft: 5 }}>{row.noShow}/{row.total}</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
            {BRANCH_METRICS.map((m) => (
              <div key={m.key} style={{ background: "var(--surface2)", borderRadius: 6, padding: "4px 7px" }}>
                <div style={{ fontSize: 9.5, color: "var(--text3)", whiteSpace: "nowrap" }}>{m.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", color: metricColor(m, row) }}>{m.pick(row)}</div>
              </div>
            ))}
            <div style={{ background: "var(--surface2)", borderRadius: 6, padding: "4px 7px" }}>
              <div style={{ fontSize: 9.5, color: "var(--text3)", whiteSpace: "nowrap" }}>ค้างไม่แอคทีฟ</div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--mono)", color: row.overdue > 0 ? "#dc2626" : "var(--green)" }}>{row.overdue}</div>
            </div>
          </div>
        </div>
      )}

      {open && !isTotal && row.overdue > 0 && <OverdueDetail row={row} procedures={procedures} rooms={rooms} />}
    </div>
  );
}

function OverdueDetail({ row, procedures, rooms }) {
  return (
    <div className="activation-detail" style={{ padding: 10, borderLeft: "3px solid #dc2626", background: "rgba(220,38,38,0.05)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626", marginBottom: 7 }}>
        คิวค้างของ{row.branchName} — {row.overdue} รายการ ต้องไปกดปิดสถานะให้ครบ
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
        {OVERDUE_STATUS_ORDER.filter((v) => row.overdueByStatus[v]).map((v) => {
          const m = statusMeta(v);
          return (
            <span key={v} style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 12,
              background: m?.bg || "var(--surface2)", color: m?.color || "var(--text2)",
              fontSize: 11, fontWeight: 700, border: `1px solid ${m?.color || "var(--border)"}`,
            }}>
              {m?.emoji} {m?.label || v}
              <strong style={{ fontFamily: "var(--mono)" }}>{row.overdueByStatus[v]}</strong>
            </span>
          );
        })}
      </div>
      {/* มือถือ: รายการซ้อนแทนตาราง 6 คอลัมน์ */}
      <div className="activation-mobile" style={{ maxHeight: 320, overflowY: "auto" }}>
        {row.overdueQueues.map((q) => {
          const proc = procedures.find((x) => x.id === q.procedureId);
          const room = rooms.find((x) => x.id === q.roomId);
          const m = statusMeta(q.status);
          return (
            <div key={q.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text2)", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {q.date ? formatThaiDate(q.date) : "—"}
                  {q.timeBlock !== null && q.timeBlock !== undefined && (
                    <span style={{ fontFamily: "var(--mono)", marginLeft: 6 }}>{blockToTime(q.timeBlock)}</span>
                  )}
                </span>
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                  background: m?.bg || "var(--surface2)", color: m?.color || "var(--text2)",
                }}>{m?.emoji} {m?.label || q.status}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{q.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{q.phone}</div>
              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                {proc?.name || "ไม่ระบุหัตถการ"}
                {room && <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: room.type === "M" ? "var(--blue)" : "var(--green)" }}> · {room.name}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="activation-desktop table-scroll" style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto", background: "var(--surface)", borderRadius: 8 }}>
        <table className="data-table activation-table">
          <thead>
            <tr>
              <th>วันนัด</th>
              <th>เวลา</th>
              <th>ชื่อลูกค้า</th>
              <th>หัตถการ</th>
              <th>ห้อง</th>
              <th>สถานะค้างอยู่</th>
            </tr>
          </thead>
          <tbody>
            {row.overdueQueues.map((q) => {
              const proc = procedures.find((p) => p.id === q.procedureId);
              const room = rooms.find((r) => r.id === q.roomId);
              const m = statusMeta(q.status);
              return (
                <tr key={q.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{q.date ? formatThaiDate(q.date) : "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13 }}>
                    {q.timeBlock !== null && q.timeBlock !== undefined ? blockToTime(q.timeBlock) : "—"}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{q.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{q.phone}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>{proc?.name || "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: room?.type === "M" ? "var(--blue)" : "var(--green)" }}>
                    {room?.name || "—"}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-block", padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: m?.bg || "var(--surface2)", color: m?.color || "var(--text2)",
                    }}>{m?.emoji} {m?.label || q.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivationReportCard({ queues, branches, procedures, rooms, rangeLabel, today }) {
  const [openBranch, setOpenBranch] = useState(null);
  const [showRule, setShowRule] = useState(false);
  // ค่าเริ่มต้น = สาขาที่ค้างเยอะสุดขึ้นก่อน เหมือนที่ buildActivationReport เรียงมาให้
  const [sort, setSort] = useState({ key: "overdue", dir: "desc" });
  // ตาราง 9 คอลัมน์เลื่อนซ้ายขวาได้บนจอแคบ แผงรายละเอียดเป็นแถวหนึ่งของตารางจึงเลื่อนตามไปด้วยจนโดนตัดขอบ
  // → ตรึงแผงไว้ชิดซ้าย (sticky) แล้วบังคับความกว้างเท่าพื้นที่ที่มองเห็นจริง วัดจากกล่องที่เลื่อน
  // ใช้ callback ref ไม่ใช่ useRef+[] เพราะตารางยังไม่มีตอนการ์ดหุบอยู่หรือคิวยังโหลดไม่เสร็จ
  // ถ้าวัดครั้งเดียวตอน mount จะได้ null ค้างไว้ แล้วแผงจะหดเหลือความกว้างคำเดียว
  const [scrollEl, setScrollEl] = useState(null);
  // เขียนความกว้างที่มองเห็นจริงลง CSS variable ตรง ๆ ไม่ผ่าน state — กันเรนเดอร์ซ้อน
  // ต้องวัดใหม่ทุกครั้งที่กางแผงด้วย เพราะแผงทำให้หน้ายาวขึ้นจนสกรอลบาร์แนวตั้งโผล่
  // แล้วกล่องตารางจะแคบลงจากที่วัดไว้ตอนแรก · rAF รอให้ layout รอบนั้นเสร็จก่อนค่อยวัด
  useEffect(() => {
    if (!scrollEl) return;
    const sync = () => scrollEl.style.setProperty("--panel-w", `${scrollEl.clientWidth}px`);
    sync();
    const raf = requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(scrollEl);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, [scrollEl, openBranch]);
  const { rows: unsortedRows, total } = useMemo(
    () => buildActivationReport(queues, { today, branches }),
    [queues, today, branches]
  );
  const rows = useMemo(() => sortActivationRows(unsortedRows, sort.key, sort.dir), [unsortedRows, sort]);
  const toggleSort = useCallback((key) => setSort((prev) => nextSort(prev, key)), []);

  return (
    <CollapsibleCard
      title={`📌 การแอคทีฟสถานะคิว — ${rangeLabel}`}
      badge={
        <span style={{
          fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", borderRadius: 10, padding: "2px 10px", whiteSpace: "nowrap",
          background: total.overdue > 0 ? "rgba(220,38,38,0.12)" : "rgba(22,163,74,0.12)",
          color: total.overdue > 0 ? "#dc2626" : "var(--green)",
        }}>
          {total.overdue > 0 ? `ค้าง ${total.overdue} คิว` : "ไม่มีคิวค้าง"}
        </span>
      }
      defaultOpen={false}
    >
      <button
        onClick={() => setShowRule((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 10,
          padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--surface2)", color: "var(--text2)", fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}
      >
        ℹ️ วิธีนับตัวเลขในรายงานนี้ <span style={{ color: "var(--text3)" }}>{showRule ? "▾" : "▸"}</span>
      </button>
      {showRule && (
      <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.65, marginBottom: 10, padding: "8px 11px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
        ทุกคิวที่วันนัดผ่านไปแล้วต้องถูกกดปิดเป็น <strong>มาแล้ว/เสร็จ</strong>, <strong>ไม่มาตามนัด</strong>, <strong>ยกเลิก</strong> หรือ <strong>เลื่อนออก</strong> อย่างใดอย่างหนึ่ง<br />
        ถ้ายังค้างอยู่ที่ รอยืนยัน / โทรตาม / ยืนยันแล้ว / เลื่อนมา ถือว่ายังไม่แอคทีฟ<br />
        ช่อง <strong>ค้างไม่แอคทีฟ</strong> และ <strong>% แอคทีฟ</strong> นับเฉพาะคิวที่วันนัดผ่านไปแล้ว (ก่อน {formatThaiDate(today)}) — คิวของวันนี้และวันข้างหน้าไม่นับเป็นความผิด · คิวรอ (Waiting) ไม่นับในรายงานนี้<br />
        ตัวเลขทั้งหมดเป็นไปตามช่วงเวลาและตัวกรองด้านบนของหน้านี้
      </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          ไม่มีคิวนัดในช่วงนี้
        </div>
      ) : (
        <>
          {/* มือถือ: การ์ดต่อสาขา เห็นครบในหน้าจอเดียว ไม่ต้องเลื่อนซ้ายขวา */}
          <div className="activation-mobile">
            {/* แถบหัว = ปุ่มเรียงลำดับ กดคอลัมน์ไหนก็เรียงตามคอลัมน์นั้น */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, padding: "0 8px 5px 10px" }}>
              <SortHeader sort={sort} onSort={toggleSort} sortKey="branchName" style={{ flex: 1, textAlign: "left" }}>สาขา</SortHeader>
              {MOBILE_METRICS.map((m) => (
                <SortHeader key={m.key} sort={sort} onSort={toggleSort} sortKey={m.sortKey} style={{ width: m.w }}>{m.short}</SortHeader>
              ))}
              <SortHeader sort={sort} onSort={toggleSort} sortKey="overdue" style={{ width: MOBILE_OVERDUE_WIDTH }}>ค้าง</SortHeader>
              <SortHeader sort={sort} onSort={toggleSort} sortKey="activeRate" style={{ width: MOBILE_RATE_WIDTH }}>%แอคทีฟ</SortHeader>
              <span style={{ width: 11 }} />
            </div>
            {rows.map((r) => {
              const key = r.branchId || "__none__";
              const open = openBranch === key;
              return (
                <MobileBranchCard
                  key={key}
                  row={r}
                  open={open}
                  onToggle={() => setOpenBranch(open ? null : key)}
                  procedures={procedures}
                  rooms={rooms}
                />
              );
            })}
            {rows.length > 1 && (
              <MobileBranchCard
                row={total}
                isTotal
                open={openBranch === "__total__"}
                onToggle={() => setOpenBranch(openBranch === "__total__" ? null : "__total__")}
              />
            )}
          </div>

          <div className="activation-desktop table-scroll" ref={setScrollEl} style={{ overflowX: "auto" }}>
            <table className="data-table activation-table">
              <thead>
                <tr>
                  <SortTh sort={sort} onSort={toggleSort} sortKey="branchName" align="left">สาขา</SortTh>
                  {BRANCH_METRICS.map((m) => (
                    <SortTh key={m.key} sort={sort} onSort={toggleSort} sortKey={m.sortKey}>{m.label}</SortTh>
                  ))}
                  <SortTh sort={sort} onSort={toggleSort} sortKey="overdue">ค้างไม่แอคทีฟ</SortTh>
                  <SortTh sort={sort} onSort={toggleSort} sortKey="activeRate">% แอคทีฟ</SortTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = r.branchId || "__none__";
                  const open = openBranch === key;
                  return (
                    <Fragment key={key}>
                    <tr style={open ? { background: "rgba(220,38,38,0.06)" } : undefined}>
                      <td style={{ fontWeight: 600 }}>{r.branchName}</td>
                      {BRANCH_METRICS.map((m) => (
                        <td key={m.key} style={{ textAlign: "right" }}><MetricValue metric={m} row={r} /></td>
                      ))}
                      <OverdueCell row={r} open={open} onToggle={() => setOpenBranch(open ? null : key)} />
                      <RateCell rate={r.activeRate} num={r.dueActivated} den={r.dueTotal} />
                    </tr>
                    {/* รายละเอียดคิวค้างแทรกใต้แถวสาขาของตัวเอง ไม่ไปกองรวมท้ายตาราง
                        .area-panel ตรึงกล่องไว้ชิดซ้ายบนมือถือ ไม่ให้เลื่อนตามตารางจนโดนตัดขอบ */}
                    {open && (
                      <tr className="activation-detail-row">
                        <td colSpan={8} style={{ padding: 0 }}>
                          <div className="activation-detail-panel">
                            <OverdueDetail row={r} procedures={procedures} rooms={rooms} />
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                    <td style={{ fontWeight: 800 }}>{total.branchName}</td>
                    {BRANCH_METRICS.map((m) => (
                      <td key={m.key} style={{ textAlign: "right" }}><MetricValue metric={m} row={total} /></td>
                    ))}
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 800, color: total.overdue > 0 ? "#dc2626" : "var(--green)" }}>{total.overdue}</td>
                    <RateCell rate={total.activeRate} num={total.dueActivated} den={total.dueTotal} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}

export default function SummaryPage({ queues, allQueues, branches, allBranches, rooms, procedures, promos, staff, currentUser, onRangeNeeded }) {
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
  // ส่วน "คิวที่บันทึก"/โฆษณา นับตาม createdAt แต่ DB กรองตาม date (วันนัด) — คิวที่บันทึกในช่วงนี้อาจนัดวันหลัง end
  // จึงขอถึง "วันนี้" เสมอ (หลังจากนั้นอยู่ในช่วงเริ่มต้นที่โหลดตอนเปิดแอปแล้ว)
  // และเริ่มจากต้นเดือนของ selectedDate เพราะการ์ดโฆษณา (AdSpendCard) นับคิวแอดมิน "ทั้งเดือน" ไม่ใช่แค่ช่วงที่เลือก
  const todayStr = getTodayStr();
  const monthStart = `${selectedDate.slice(0, 7)}-01`;
  const rangeFrom = dateRange.start < monthStart ? dateRange.start : monthStart;
  const rangeTo = dateRange.end > todayStr ? dateRange.end : todayStr;
  useEffect(() => { onRangeNeeded?.(rangeFrom, rangeTo); }, [rangeFrom, rangeTo, onRangeNeeded]);

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
        defaultOpen={false}
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

      {/* รายงานการแอคทีฟสถานะคิว — Area manager ใช้ประเมินสาขา */}
      <ActivationReportCard
        queues={appointmentQueues}
        branches={branches}
        procedures={procedures}
        rooms={rooms}
        rangeLabel={rangeLabel}
        today={todayStr}
      />
    </>
  );
}
