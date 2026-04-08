import { useState, useMemo } from "react";
import { getTodayStr, blockToTime, formatThaiDate } from "../utils/helpers";

const HOUR_BG = [
  "#fff7ed","#fef3c7","#f0fdf4","#eff6ff","#fdf4ff",
  "#fff1f2","#f0fdfa","#fefce8","#f5f3ff","#ecfeff",
];

function heatColor(count, max) {
  if (count === 0) return "var(--surface2)";
  const ratio = count / Math.max(max, 1);
  if (ratio < 0.25) return "#bbf7d0";
  if (ratio < 0.5)  return "#86efac";
  if (ratio < 0.75) return "#fde68a";
  return "#fca5a5";
}

export default function TimelinePage({ queues, branches, rooms, procedures }) {
  const [date, setDate] = useState(getTodayStr());
  const [filterBranch, setFilterBranch] = useState("all");
  const [hoveredCell, setHoveredCell] = useState(null); // { roomId, block }

  function navigate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    setDate(d.toISOString().slice(0, 10));
  }

  const filteredRooms = useMemo(() => {
    if (filterBranch === "all") return rooms;
    return rooms.filter((r) => r.branchId === filterBranch);
  }, [rooms, filterBranch]);

  // คิวในวันที่เลือก
  const dayQueues = useMemo(() =>
    queues.filter((q) => q.date === date),
    [queues, date]
  );

  // หา time range จากทุกห้องที่แสดง
  const { minBlock, maxBlock } = useMemo(() => {
    let mn = 144, mx = 240; // default 12:00-20:00
    filteredRooms.forEach((r) => {
      if ((r.openBlock ?? 144) < mn) mn = r.openBlock ?? 144;
      if ((r.closeBlock ?? 240) > mx) mx = r.closeBlock ?? 240;
    });
    return { minBlock: mn, maxBlock: mx };
  }, [filteredRooms]);

  const hours = useMemo(() => {
    const h = [];
    for (let b = minBlock; b < maxBlock; b += 12) h.push(b);
    return h;
  }, [minBlock, maxBlock]);

  // map: roomId → { block → [queues] }
  const roomBlockMap = useMemo(() => {
    const map = {};
    filteredRooms.forEach((r) => { map[r.id] = {}; });
    dayQueues.forEach((q) => {
      if (!map[q.roomId] || q.timeBlock === null) return;
      const proc = procedures.find((p) => p.id === q.procedureId);
      const dur = proc?.blocks || 1;
      for (let i = 0; i < dur; i++) {
        const b = q.timeBlock + i;
        if (!map[q.roomId][b]) map[q.roomId][b] = [];
        map[q.roomId][b].push({ ...q, procName: proc?.name || "", isStart: i === 0 });
      }
    });
    return map;
  }, [filteredRooms, dayQueues, procedures]);

  // สถิติรวม per hour slot (ทุกห้อง)
  const hourHeat = useMemo(() => {
    const h = {};
    hours.forEach((hb) => {
      let total = 0;
      for (let b = hb; b < hb + 12; b++) {
        filteredRooms.forEach((r) => {
          if (roomBlockMap[r.id]?.[b]?.length) total++;
        });
      }
      h[hb] = total;
    });
    return h;
  }, [hours, filteredRooms, roomBlockMap]);

  const maxHeat = Math.max(...Object.values(hourHeat), 1);

  // สถิติรวมของวัน
  const stats = useMemo(() => {
    const total = dayQueues.length;
    const byStatus = {};
    dayQueues.forEach((q) => {
      const s = q.status || "waiting";
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    return { total, byStatus };
  }, [dayQueues]);

  const CELL_W = 36;
  const blocks = [];
  for (let b = minBlock; b < maxBlock; b++) blocks.push(b);

  return (
    <>
      {/* ─── Controls ─── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">วันที่</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => navigate(-1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>‹</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 140 }} />
            <button onClick={() => navigate(1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>›</button>
            <button onClick={() => setDate(getTodayStr())} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>วันนี้</button>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">สาขา</label>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Stats chips */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{formatThaiDate(date)}</span>
          <span style={{ background: "var(--surface3)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
            {stats.total} คิว
          </span>
          {stats.byStatus.done > 0 && (
            <span style={{ background: "#d1fae5", color: "#065f46", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
              ✅ เสร็จ {stats.byStatus.done}
            </span>
          )}
          {stats.byStatus.waiting > 0 && (
            <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
              ⏳ รอ {stats.byStatus.waiting}
            </span>
          )}
        </div>
      </div>

      {/* ─── Heat bar (hour summary) ─── */}
      <div className="card" style={{ marginBottom: 12, padding: "12px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>🌡️ ความหนาแน่นคิวรายชั่วโมง</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {hours.map((hb) => {
            const count = hourHeat[hb] || 0;
            const bg = heatColor(count, maxHeat);
            return (
              <div key={hb} title={`${blockToTime(hb)} — ${count} slot`} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              }}>
                <div style={{
                  width: 44, height: 32, borderRadius: 6,
                  background: bg, border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: count === 0 ? "var(--text3)" : "#374151",
                }}>
                  {count || ""}
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", fontWeight: 600 }}>
                  {blockToTime(hb).slice(0, 5)}
                </div>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {[["#bbf7d0","น้อย"],["#86efac","ปานกลาง"],["#fde68a","มาก"],["#fca5a5","เต็มมาก"]].map(([c, l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid var(--border)", display: "inline-block" }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ─── Room Timeline Grid ─── */}
      {filteredRooms.length === 0 ? (
        <div className="card"><div className="empty"><div className="e-icon">🚪</div><p>ไม่พบห้อง — เลือกสาขาที่มีห้องก่อน</p></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            {/* Hour header */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
              <div style={{ width: 120, minWidth: 120, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>
                ห้อง
              </div>
              {hours.map((hb, hi) => (
                <div key={hb} style={{
                  width: CELL_W * 12, minWidth: CELL_W * 12, flexShrink: 0,
                  borderRight: "2px solid var(--border2)",
                  background: HOUR_BG[hi % HOUR_BG.length],
                  padding: "6px 8px",
                  fontSize: 12, fontWeight: 800, fontFamily: "var(--mono)",
                  color: "var(--text1)",
                }}>
                  {blockToTime(hb)}
                  <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text3)", marginLeft: 4 }}>
                    ({hourHeat[hb] || 0} slot)
                  </span>
                </div>
              ))}
            </div>

            {/* Room rows */}
            {filteredRooms.map((room) => {
              const branch = branches.find((b) => b.id === room.branchId);
              const occupied = roomBlockMap[room.id] || {};
              return (
                <div key={room.id} style={{ display: "flex", borderBottom: "1px solid var(--border)", minHeight: 52 }}>
                  {/* Room label */}
                  <div style={{
                    width: 120, minWidth: 120, flexShrink: 0,
                    borderRight: "1px solid var(--border)",
                    padding: "6px 10px", background: "var(--surface1)",
                    display: "flex", flexDirection: "column", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                      [{room.type}] {room.name}
                    </div>
                    {branch && (
                      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{branch.name}</div>
                    )}
                  </div>

                  {/* Blocks */}
                  <div style={{ display: "flex", flex: 1, position: "relative" }}>
                    {blocks.map((b, bi) => {
                      const qs = occupied[b] || [];
                      const isHour = b % 12 === 0;
                      const q = qs[0];
                      const isStart = q?.isStart;
                      const isHovered = hoveredCell?.roomId === room.id && hoveredCell?.block === b;

                      let bg = "transparent";
                      let border = `1px solid ${isHour ? "var(--border2)" : "var(--border)"}`;
                      if (qs.length > 0) {
                        bg = room.type === "M" ? "#fde8e8" : "#dcfce7";
                        if (isHovered) bg = room.type === "M" ? "#fca5a5" : "#86efac";
                      }

                      return (
                        <div
                          key={b}
                          onMouseEnter={() => qs.length > 0 && setHoveredCell({ roomId: room.id, block: b })}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={q ? `${q.name}${q.procName ? ` — ${q.procName}` : ""}\n${blockToTime(b)}` : blockToTime(b)}
                          style={{
                            width: CELL_W, minWidth: CELL_W, height: 52,
                            background: bg,
                            borderRight: isHour ? "2px solid var(--border2)" : "1px solid var(--border)",
                            flexShrink: 0, position: "relative", overflow: "visible",
                            transition: "background 0.1s",
                          }}
                        >
                          {/* ชื่อลูกค้า — แสดงที่ block เริ่มต้นเท่านั้น */}
                          {isStart && q && (
                            <div style={{
                              position: "absolute", left: 2, right: 2, top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: 9, fontWeight: 700, lineHeight: 1.2,
                              color: room.type === "M" ? "#991b1b" : "#166534",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              fontFamily: "var(--body)",
                            }}>
                              {q.name}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8, textAlign: "right" }}>
        hover ที่ช่องเพื่อดูชื่อลูกค้า • แสดง {filteredRooms.length} ห้อง
      </div>
    </>
  );
}
