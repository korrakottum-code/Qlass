import { useState, useMemo, useRef, useEffect } from "react";
import { getTodayStr, formatThaiDate } from "../utils/helpers";
import {
  computeCapacitySummary, listDates, daysUntilEndOfMonth,
  blocksToHours, freePercent,
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

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      flex: "1 1 140px", minWidth: 140, padding: "12px 14px", borderRadius: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 11, color: "var(--text3)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "var(--accent)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// การ์ดเดียวโชว์ M กับ T คู่กันในบรรทัดเดียว — เดิมแยกเป็น 2 การ์ดเต็ม ทำให้ล้นไปอยู่คนละแถวบนจอที่ไม่กว้างพอ
function TypeSplitCard({ mFree, mCap, tFree, tCap }) {
  return (
    <div style={{
      flex: "2 1 280px", minWidth: 280, padding: "12px 14px", borderRadius: 10,
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

export default function CapacityPage({ rooms, roomSchedules, queues, branches, procedures, promos }) {
  const [range, setRange] = useState("7d"); // 7d | eom
  const [filterBranch, setFilterBranch] = useState("all");
  const [splitByType, setSplitByType] = useState(false);
  const [selected, setSelected] = useState(null); // { branchId, date }

  const today = getTodayStr();
  const dates = useMemo(() => (
    range === "7d" ? listDates(today, 7) : listDates(today, daysUntilEndOfMonth(today))
  ), [range, today]);

  const visibleRooms = useMemo(() => (
    filterBranch === "all" ? rooms : rooms.filter((r) => r.branchId === filterBranch)
  ), [rooms, filterBranch]);

  const summary = useMemo(() => computeCapacitySummary({
    rooms: visibleRooms, roomSchedules, queues, procedures, dates,
  }), [visibleRooms, roomSchedules, queues, procedures, dates]);

  const visibleBranches = useMemo(() => (
    branches.filter((b) => (filterBranch === "all" || b.id === filterBranch)
      && summary.days.some((d) => d.byBranch[b.id]))
  ), [branches, filterBranch, summary]);

  const totalPct = freePercent(summary.totals);
  const freerType = summary.totals.byType.M.free >= summary.totals.byType.T.free ? "M" : "T";
  const suggestedPromos = useMemo(() => {
    const wantType = freerType;
    return (promos || [])
      .filter((p) => p.active !== false)
      .filter((p) => {
        const proc = procedures.find((x) => x.id === p.procedureId);
        return proc?.roomType === wantType;
      })
      .slice(0, 6);
  }, [promos, procedures, freerType]);

  const selectedCell = selected
    ? summary.days.find((d) => d.date === selected.date)?.byBranch[selected.branchId]
    : null;
  const selectedBranchName = selected ? (branches.find((b) => b.id === selected.branchId)?.name || "-") : "";

  // กดช่องในตาราง (ซึ่งอาจอยู่บนสุดของจอ) แล้วผลลัพธ์เดิมโผล่ท้ายตาราง 29 สาขา
  // ไกลเกินจะสังเกตเห็น — เลื่อนจอไปหาให้อัตโนมัติทันทีที่เลือก
  const detailRef = useRef(null);
  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected]);

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

      {/* Stat cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <StatCard label="ความจุรวม" value={`${blocksToHours(summary.totals.capacity).toLocaleString()} ชม.`} sub={`${dates.length} วัน · ${visibleRooms.length} ห้อง`} />
        <StatCard label="จองแล้ว" value={totalPct === null ? "—" : `${100 - totalPct}%`} sub={`${blocksToHours(summary.totals.booked).toLocaleString()} ชม.`} color="var(--blue)" />
        <StatCard label="ยังว่าง (รับเพิ่มได้)" value={totalPct === null ? "—" : `${totalPct}%`} sub={`${blocksToHours(summary.totals.free).toLocaleString()} ชม.`} color="var(--green)" />
        <TypeSplitCard
          mFree={summary.totals.byType.M.free} mCap={summary.totals.byType.M.capacity}
          tFree={summary.totals.byType.T.free} tCap={summary.totals.byType.T.capacity}
        />
      </div>

      {/* คำแนะนำฝั่งการตลาด */}
      {summary.totals.capacity > 0 && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: "var(--surface2)", border: "1px solid var(--border)",
        }}>
          💡 ช่วงนี้ <b>{freerType === "M" ? "ห้องฉีด (M)" : "ห้องเครื่อง (T)"}</b> ว่างมากกว่า
          {" "}({blocksToHours(summary.totals.byType[freerType].free).toLocaleString()} ชม.)
          {suggestedPromos.length > 0 && (
            <> — โปรที่เหมาะไดร์ฟ: {suggestedPromos.map((p) => p.name).join(" · ")}</>
          )}
        </div>
      )}

      {/* Heatmap สาขา × วัน */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + dates.length * 52 }}>
            <thead>
              <tr>
                <th style={{
                  position: "sticky", left: 0, zIndex: 3, background: "var(--surface2)",
                  padding: "8px 10px", textAlign: "left", fontSize: 11, color: "var(--text3)",
                  borderBottom: "2px solid var(--border2)", borderRight: "2px solid var(--border2)", minWidth: 110,
                }}>สาขา \ % ว่าง</th>
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
                        padding: "6px 10px", fontSize: 12, fontWeight: idx === 0 ? 700 : 500, whiteSpace: "nowrap",
                        borderBottom: idx === 1 ? "1px solid var(--border)" : "none",
                        borderTop: idx === 0 ? "2px solid var(--border2)" : "none",
                        borderRight: "2px solid var(--border2)",
                        overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140,
                        color: idx === 0 ? "var(--text1)" : "var(--text2)",
                      }}>
                        {idx === 0 ? b.name : ""} <span style={{ fontSize: 10, color: type === "M" ? "var(--blue)" : "var(--green)" }}>{typeLabel}</span>
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
                      padding: "6px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                      borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border2)",
                      overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140,
                    }}>{b.name}</td>
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

      {/* Drill-down รายวัน */}
      {selected && selectedCell && (
        <div ref={detailRef} className="card" style={{ marginBottom: 14, scrollMarginTop: 16 }}>
          <div className="card-header"><h3>📍 {selectedBranchName} — {formatThaiDate(selected.date)}</h3></div>
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
      )}
    </>
  );
}
