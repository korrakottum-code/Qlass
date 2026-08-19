import { useState, useMemo, useEffect } from "react";
import { addDays } from "../utils/queueRanges";
import { getTodayStr, formatThaiDate } from "../utils/helpers";
import {
  computeCapacitySummary, listDates, daysUntilEndOfMonth,
  blocksToHours, freePercent, averageFreePercentByBranch, computeWeeklyPace, PACE_LOOKBACK_WEEKS,
} from "../utils/capacity";

// สีของ heatmap ตาม % ว่าง — ไล่เฉดต่อเนื่อง (แดง→ส้ม→เหลือง→เขียวอ่อน→เขียวเข้ม)
// แทนที่จะแบ่ง 5 บั้นหยาบๆ เพราะข้อมูลจริงกระจุกช่วง 60-100% ทำให้บั้นแบบเดิม
// ออกมาเป็นสีเขียวซ้ำกันหมด แยกไม่ออกว่าตรงไหนว่างกว่าจริง
const FREE_COLOR_STOPS = [
  { pct: 0, h: 0, s: 78, l: 80 },
  { pct: 25, h: 22, s: 82, l: 78 },
  { pct: 50, h: 45, s: 85, l: 74 },
  { pct: 75, h: 88, s: 55, l: 74 },
  { pct: 100, h: 142, s: 50, l: 68 },
];
function freeColor(pct) {
  if (pct === null) return "var(--surface3)";
  const clamped = Math.max(0, Math.min(100, pct));
  let lo = FREE_COLOR_STOPS[0];
  let hi = FREE_COLOR_STOPS[FREE_COLOR_STOPS.length - 1];
  for (let i = 0; i < FREE_COLOR_STOPS.length - 1; i++) {
    if (clamped >= FREE_COLOR_STOPS[i].pct && clamped <= FREE_COLOR_STOPS[i + 1].pct) {
      lo = FREE_COLOR_STOPS[i]; hi = FREE_COLOR_STOPS[i + 1]; break;
    }
  }
  const t = hi.pct === lo.pct ? 0 : (clamped - lo.pct) / (hi.pct - lo.pct);
  const h = lo.h + (hi.h - lo.h) * t;
  const s = lo.s + (hi.s - lo.s) * t;
  const l = lo.l + (hi.l - lo.l) * t;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

// compact เพราะต้องอยู่ 3 การ์ดในแถวเดียวกันเสมอแม้จอมือถือแคบสุด (เดิม flex-wrap ทำให้การ์ดที่ 3 ตกไปอยู่คนละบรรทัด)
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      minWidth: 0, padding: "10px 10px", borderRadius: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "var(--accent)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}

// การ์ดเดียวโชว์ M กับ T คู่กันในบรรทัดเดียว — เดิมแยกเป็น 2 การ์ดเต็ม ทำให้ล้นไปอยู่คนละแถวบนจอที่ไม่กว้างพอ
function TypeSplitCard({ mFree, mCap, tFree, tCap }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
      display: "flex", gap: 18,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>ว่าง ห้องฉีด (M)</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--blue)", marginTop: 4 }}>{blocksToHours(mFree).toLocaleString()} ชม.</div>
        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>จาก {blocksToHours(mCap).toLocaleString()} ชม.</div>
      </div>
      <div style={{ width: 1, background: "var(--border)" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>ว่าง ห้องเครื่อง (T)</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)", marginTop: 4 }}>{blocksToHours(tFree).toLocaleString()} ชม.</div>
        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>จาก {blocksToHours(tCap).toLocaleString()} ชม.</div>
      </div>
    </div>
  );
}

const THAI_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// "เทียบกับปกติ" — 5 สถานะตามสเปกที่ผ่านรีวิว nak-song-sai 5 รอบ (scratchpad/pace-feature-spec.md)
// จงใจไม่มีปุ่ม/ลิงก์ทำอะไรต่อ — เป็นสัญญาณเตือนเฉยๆ ตามที่เจ้าของงานตัดสินใจไว้
const PACE_STYLE = {
  green: { emoji: "🟢", label: "ปกติดี", bg: "#dcfce7", fg: "#166534" },
  yellow: { emoji: "🟡", label: "ต่ำกว่าปกติ", bg: "#fef9c3", fg: "#854d0e" },
  red: { emoji: "🔴", label: "ต่ำกว่าปกติมาก", bg: "#fecaca", fg: "#991b1b" },
  high: { emoji: "❗", label: "สูงผิดปกติ ตรวจสอบข้อมูล", bg: "#e9d5ff", fg: "#6b21a8" },
  "no-data": { emoji: "🆕", label: "ไม่มีข้อมูลเทียบ", bg: "var(--surface3)", fg: "var(--text3)" },
};

function PaceStrip({ weeklyPace }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)", marginBottom: 6 }}>
        📈 เทียบกับปกติ (เทียบจังหวะการจองย้อนหลัง 8 สัปดาห์ ไม่ใช่เทียบยอดสุดท้าย)
        {/* ตัวกรอง "สาขา" ด้านบนอยู่ติดกับแถบนี้พอดี ทำให้เข้าใจผิดได้ง่ายว่าเลือกสาขาแล้วต้องกรองด้วย
            (ทดสอบจริงแล้วเจอ) ทั้งที่ตั้งใจให้เป็นภาพรวมทั้งเครือข่ายเสมอ (เฟส 1) — บอกให้ชัดในตัว UI
            เอง ไม่ใช่แค่ comment ในโค้ดที่ผู้ใช้มองไม่เห็น */}
        <span style={{ fontWeight: 400, color: "var(--text3)" }}> — ภาพรวมทั้งเครือข่ายเสมอ ไม่เปลี่ยนตามตัวกรองสาขาด้านบน</span>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        {weeklyPace.map((row) => {
          const style = PACE_STYLE[row.kind];
          const [, m, d] = row.date.split("-");
          const title = row.pace === null
            ? "ยังไม่มีข้อมูลย้อนหลังพอจะเทียบ"
            : `จองแล้ว ${row.pace}% ของค่าเฉลี่ยปกติ ณ จังหวะนี้`;
          return (
            <div key={row.date} title={title} style={{
              flex: "0 0 auto", minWidth: 84, padding: "8px 10px", borderRadius: 10,
              background: style.bg, color: style.fg, textAlign: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                {THAI_DOW[row.dow]} {d}/{m}
              </div>
              <div style={{ fontSize: 18, marginTop: 2 }}>{style.emoji}</div>
              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, lineHeight: 1.3 }}>{style.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CapacityPage({ rooms, roomSchedules, queues, branches, procedures, onRangeNeeded }) {
  const [range, setRange] = useState("7d"); // 7d | eom
  const [filterBranch, setFilterBranch] = useState("all");
  const [splitByType, setSplitByType] = useState(false);
  const [selected, setSelected] = useState(null); // { branchId, date }

  const today = getTodayStr();
  // computeWeeklyPace ใช้ baseline ย้อนหลัง PACE_LOOKBACK_WEEKS สัปดาห์ (เกิน 30 วันที่โหลดตอนเปิดแอป)
  useEffect(() => { onRangeNeeded?.(addDays(today, -PACE_LOOKBACK_WEEKS * 7), today); }, [today, onRangeNeeded]);
  const dates = useMemo(() => (
    range === "7d" ? listDates(today, 7) : listDates(today, daysUntilEndOfMonth(today))
  ), [range, today]);

  const visibleRooms = useMemo(() => (
    filterBranch === "all" ? rooms : rooms.filter((r) => r.branchId === filterBranch)
  ), [rooms, filterBranch]);

  const summary = useMemo(() => computeCapacitySummary({
    rooms: visibleRooms, roomSchedules, queues, procedures, dates,
  }), [visibleRooms, roomSchedules, queues, procedures, dates]);

  const branchAverages = useMemo(() => averageFreePercentByBranch(summary), [summary]);

  // "เทียบกับปกติ" เป็นภาพรวมทั้งเครือข่ายเสมอ — ไม่ผูกกับตัวกรองสาขา/ช่วงเวลาด้านบน (เฟส 1 ตาม
  // ที่ตกลงกันไว้ — รายสาขาเป็นเฟส 2 ในอนาคต)
  const weeklyPace = useMemo(() => computeWeeklyPace({ queues, branches, today }), [queues, branches, today]);

  // เรียงสาขาตาม % ว่างเฉลี่ยของช่วงที่ดูอยู่ — ค่าเริ่มต้นเอาสาขาที่ว่างสุด (ต้องการโปรดันมากสุด) ขึ้นก่อน
  // ไม่งั้นต้องนั่งไล่เฉลี่ยเองทีละแถว
  const [sortDir, setSortDir] = useState("desc"); // desc = ว่างมากสุดก่อน, asc = แน่นสุดก่อน
  const visibleBranches = useMemo(() => {
    const list = branches.filter((b) => (filterBranch === "all" || b.id === filterBranch)
      && summary.days.some((d) => d.byBranch[b.id]));
    return [...list].sort((a, b) => {
      const av = branchAverages[a.id] ?? -1;
      const bv = branchAverages[b.id] ?? -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [branches, filterBranch, summary, branchAverages, sortDir]);

  const totalPct = freePercent(summary.totals);
  const freerType = summary.totals.byType.M.free >= summary.totals.byType.T.free ? "M" : "T";

  const selectedCell = selected
    ? summary.days.find((d) => d.date === selected.date)?.byBranch[selected.branchId]
    : null;
  const selectedBranchName = selected ? (branches.find((b) => b.id === selected.branchId)?.name || "-") : "";

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ช่วงเวลา</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["7d", "7 วันข้างหน้า"], ["eom", "วันนี้–สิ้นเดือน"]].map(([v, l]) => (
              <button key={v} onClick={() => { setRange(v); setSelected(null); }} style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: range === v ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: range === v ? "var(--accent-soft, rgba(0,0,0,0.05))" : "var(--surface2)",
                color: range === v ? "var(--accent)" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">สาขา</label>
          <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setSelected(null); }}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ตารางด้านล่าง</label>
          <button
            onClick={() => setSplitByType((v) => !v)}
            style={{
              padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
              border: splitByType ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
              background: splitByType ? "var(--accent-soft, rgba(0,0,0,0.05))" : "var(--surface2)",
              color: splitByType ? "var(--accent)" : "var(--text2)",
            }}>
            {splitByType ? "✓ แยก M/T แล้ว" : "แยก M/T"}
          </button>
        </div>
      </div>

      {/* คำเตือนพฤติกรรมการจอง — ตรวจกับฐานข้อมูลจริงแล้ว (2569-08-11): ลูกค้า ~55-60% จองภายใน
          0-2 วันก่อนวันนัดเสมอมา (เช็คทั้งเดือนมิ.ย.และส.ค. ได้ผลใกล้กัน) ดังนั้นวันที่ไกลออกไป
          จะ "ว่างเกินจริง" เสมอ เพราะคิวส่วนใหญ่ของวันนั้นยังไม่ถูกจองเข้ามา ไม่ใช่เพราะสาขาซบเซา —
          กันคนอ่านตัวเลขผิดว่า "ว่างเยอะ = ธุรกิจไม่ดี" */}
      <div style={{
        marginBottom: 10, padding: "8px 14px", borderRadius: 10, fontSize: 12,
        background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)",
      }}>
        ℹ️ ลูกค้าส่วนใหญ่ (~55-60%) จองล่วงหน้าแค่ 0-2 วันก่อนวันนัด — วันที่ไกลออกไปจึงมักโชว์ "ว่าง" เกินจริง
        เพราะยังไม่ถึงจังหวะที่คนจอง ไม่ใช่สัญญาณว่าสาขานั้นซบเซา ยิ่งใกล้วันจริงตัวเลขจะยิ่งน่าเชื่อถือ
      </div>

      <PaceStrip weeklyPace={weeklyPace} />

      {/* Stat cards — บังคับ 3 การ์ดแรกอยู่แถวเดียวกันเสมอด้วย grid (เดิม flex-wrap ทำให้การ์ดที่ 3
          ตกไปอยู่คนละบรรทัดบนจอแคบ) ส่วนการ์ด M/T แยกเป็นแถวของตัวเองด้านล่าง */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatCard label="ความจุรวม" value={`${blocksToHours(summary.totals.capacity).toLocaleString()} ชม.`} sub={`${dates.length} วัน · ${visibleRooms.length} ห้อง`} />
          <StatCard label="จองแล้ว" value={totalPct === null ? "—" : `${100 - totalPct}%`} sub={`${blocksToHours(summary.totals.booked).toLocaleString()} ชม.`} color="var(--blue)" />
          <StatCard label="ยังว่าง (รับเพิ่มได้)" value={totalPct === null ? "—" : `${totalPct}%`} sub={`${blocksToHours(summary.totals.free).toLocaleString()} ชม.`} color="var(--green)" />
        </div>
        <TypeSplitCard
          mFree={summary.totals.byType.M.free} mCap={summary.totals.byType.M.capacity}
          tFree={summary.totals.byType.T.free} tCap={summary.totals.byType.T.capacity}
        />
      </div>

      {/* คำแนะนำฝั่งการตลาด — บอกแค่ว่าห้องประเภทไหนว่างกว่า ไม่แจงชื่อโปร (เดิมสุ่มเอา 6 โปรแรก
          ที่ตรงประเภทห้องมาโชว์ ไม่มีเกณฑ์คัดจริง ทำให้ดูเหมือนระบบเลือกเอง — เอาออกดีกว่าใส่
          ข้อมูลที่อธิบายไม่ได้ว่าทำไมถูกเลือก) */}
      {summary.totals.capacity > 0 && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: "var(--surface2)", border: "1px solid var(--border)",
        }}>
          💡 {filterBranch === "all" ? "ภาพรวมทุกสาขา" : branches.find((b) => b.id === filterBranch)?.name}
          {" "}ว่างฝั่ง <b style={{ color: freerType === "M" ? "var(--blue)" : "var(--green)" }}>{freerType === "M" ? "ห้องฉีด (M)" : "ห้องเครื่อง (T)"}</b> มากกว่า
          {" "}— เหมาะโฟกัสแคมเปญ/โปรกลุ่มห้อง{freerType === "M" ? "ฉีด" : "เครื่อง"}ที่นี่ก่อน
        </div>
      )}

      {/* Heatmap สาขา × วัน */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + dates.length * 52 }}>
            <thead>
              <tr>
                <th
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                  title="กดเพื่อเรียงสาขาตาม % ว่างเฉลี่ยของช่วงนี้"
                  style={{
                    position: "sticky", left: 0, zIndex: 3, background: "var(--surface2)",
                    padding: "8px 10px", textAlign: "left", fontSize: 11, color: "var(--text3)",
                    borderBottom: "2px solid var(--border2)", borderRight: "2px solid var(--border2)", minWidth: 110,
                    cursor: "pointer", userSelect: "none",
                  }}>
                  สาขา (เฉลี่ย {sortDir === "desc" ? "ว่างสุดก่อน ▼" : "แน่นสุดก่อน ▲"})
                </th>
                {dates.map((date) => {
                  const [y, m, d] = date.split("-").map(Number);
                  const dow = new Date(y, m - 1, d).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={date} style={{
                      padding: "6px 4px", fontSize: 10, fontWeight: 700, minWidth: 48,
                      color: isWeekend ? "var(--accent)" : "var(--text3)",
                      background: date === today ? "var(--surface3)" : "var(--surface2)",
                      borderBottom: "2px solid var(--border2)", borderRight: "1px solid var(--border)",
                    }}>
                      {THAI_DOW[dow]}<br />{d}/{m}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleBranches.map((b) => (
                splitByType ? (
                  [["M", "ห้องฉีด (M)"], ["T", "ห้องเครื่อง (T)"]].map(([type, typeLabel], idx) => (
                    <tr key={`${b.id}_${type}`}>
                      <td style={{
                        position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
                        padding: "6px 10px", fontSize: 12, fontWeight: idx === 0 ? 700 : 500,
                        borderBottom: idx === 1 ? "1px solid var(--border)" : "none",
                        borderTop: idx === 0 ? "2px solid var(--border2)" : "none",
                        borderRight: "2px solid var(--border2)",
                        maxWidth: 140,
                        color: idx === 0 ? "var(--text1)" : "var(--text2)",
                      }}>
                        {/* ชื่อสาขา (แถวบนสุดเท่านั้น) กับป้าย M/T แยกกันคนละบรรทัดเสมอ — ทำให้ป้าย
                            "ห้องฉีด (M)" ของแถวบนและ "ห้องเครื่อง (T)" ของแถวล่างเริ่มที่ตำแหน่ง
                            ซ้ายเดียวกันพอดี ไม่ใช่ตำแหน่งเลื่อนไปตามความยาวชื่อสาขา+% แบบเดิม */}
                        {idx === 0 && (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                              {b.name}
                            </span>
                            {branchAverages[b.id] != null && (
                              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{branchAverages[b.id]}%</span>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: type === "M" ? "var(--blue)" : "var(--green)" }}>{typeLabel}</div>
                      </td>
                      {dates.map((date) => {
                        const cell = summary.days.find((d) => d.date === date)?.byBranch[b.id]?.byType[type];
                        const pct = freePercent(cell);
                        const isSel = selected && selected.branchId === b.id && selected.date === date;
                        return (
                          <td key={date}
                            onClick={() => setSelected(isSel ? null : { branchId: b.id, date })}
                            title={cell ? `${typeLabel}: ว่าง ${blocksToHours(cell.free)} ชม. จาก ${blocksToHours(cell.capacity)} ชม.` : "ปิด/ไม่มีห้อง"}
                            style={{
                              padding: "6px 2px", textAlign: "center", fontSize: 11, fontWeight: 700,
                              background: freeColor(pct), cursor: cell ? "pointer" : "default",
                              color: "#1f2937",
                              borderBottom: idx === 1 ? "1px solid var(--border)" : "none",
                              borderTop: idx === 0 ? "2px solid var(--border2)" : "none",
                              borderRight: "1px solid var(--border)",
                              outline: isSel ? "2px solid var(--accent)" : "none", outlineOffset: -2,
                            }}>
                            {pct === null ? "—" : `${pct}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr key={b.id}>
                    <td style={{
                      position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
                      padding: "6px 10px", fontSize: 12, fontWeight: 700,
                      borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border2)",
                      maxWidth: 140,
                    }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {b.name}
                        </span>
                        {branchAverages[b.id] != null && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{branchAverages[b.id]}%</span>
                        )}
                      </div>
                    </td>
                    {dates.map((date) => {
                      const cell = summary.days.find((d) => d.date === date)?.byBranch[b.id];
                      const pct = freePercent(cell);
                      const isSel = selected && selected.branchId === b.id && selected.date === date;
                      return (
                        <td key={date}
                          onClick={() => setSelected(isSel ? null : { branchId: b.id, date })}
                          title={cell ? `ว่าง ${blocksToHours(cell.free)} ชม. จาก ${blocksToHours(cell.capacity)} ชม.` : "ปิด/ไม่มีห้อง"}
                          style={{
                            padding: "8px 2px", textAlign: "center", fontSize: 11, fontWeight: 700,
                            background: freeColor(pct), cursor: cell ? "pointer" : "default",
                            color: "#1f2937",
                            borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                            outline: isSel ? "2px solid var(--accent)" : "none", outlineOffset: -2,
                          }}>
                          {pct === null ? "—" : `${pct}%`}
                        </td>
                      );
                    })}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap", fontSize: 11, color: "var(--text2)" }}>
          <span>แน่น</span>
          <div style={{
            width: 140, height: 12, borderRadius: 4, border: "1px solid var(--border)",
            background: `linear-gradient(to right, ${FREE_COLOR_STOPS.map((s) => `hsl(${s.h},${s.s}%,${s.l}%) ${s.pct}%`).join(", ")})`,
          }} />
          <span>ว่างมาก</span>
          <span style={{ marginLeft: "auto" }}>กดช่องเพื่อดูรายละเอียดวัน/สาขานั้น · กด "แยก M/T" ด้านบนเพื่อแยกดูห้องฉีด/ห้องเครื่องแยกแถว</span>
        </div>
      </div>

      {/* Drill-down รายวัน — popup ลอย กดปิดแล้วดูสาขา/วันอื่นต่อได้เลย ไม่ต้องเลื่อนไปมาหาการ์ด */}
      {selected && selectedCell && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 480, width: "100%", maxHeight: "88dvh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}
          >
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>📍 {selectedBranchName} — {formatThaiDate(selected.date)}</h3>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text3)", lineHeight: 1, padding: 4 }}
              >✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>ภาพรวม</div>
                <div>ว่าง <b style={{ color: "var(--green)" }}>{blocksToHours(selectedCell.free)} ชม.</b> จาก {blocksToHours(selectedCell.capacity)} ชม. ({freePercent(selectedCell)}%)</div>
                <div style={{ marginTop: 4 }}>ห้องฉีด (M): ว่าง {blocksToHours(selectedCell.byType.M.free)} ชม. / ห้องเครื่อง (T): ว่าง {blocksToHours(selectedCell.byType.T.free)} ชม.</div>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>ว่างช่วงไหนของวัน</div>
                {[["morning", "เช้า (ก่อน 12:00)"], ["afternoon", "บ่าย (12:00-17:00)"], ["evening", "เย็น (17:00+)"]].map(([k, l]) => {
                  const seg = selectedCell.bySegment[k];
                  const pct = seg.capacity ? Math.round((seg.free / seg.capacity) * 100) : null;
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 120, color: "var(--text2)" }}>{l}</span>
                      <div style={{ flex: 1, height: 14, background: "var(--surface3)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct ?? 0}%`, height: "100%", background: freeColor(pct), borderRight: pct ? "1px solid var(--border)" : "none" }} />
                      </div>
                      <span style={{ minWidth: 88, textAlign: "right", fontWeight: 700 }}>
                        {pct === null ? "—" : `ว่าง ${blocksToHours(seg.free)} ชม. (${pct}%)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
