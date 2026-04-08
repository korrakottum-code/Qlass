import { useState, useMemo } from "react";
import { getTodayStr, blockToTime, formatThaiDate } from "../utils/helpers";

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
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  function navigate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    setDate(d.toISOString().slice(0, 10));
  }

  const filteredRooms = useMemo(() => {
    if (filterBranch === "all") return rooms;
    return rooms.filter((r) => r.branchId === filterBranch);
  }, [rooms, filterBranch]);

  // auto-select first room when branch changes
  const activeRoom = useMemo(() => {
    if (selectedRoomId && filteredRooms.find((r) => r.id === selectedRoomId)) {
      return filteredRooms.find((r) => r.id === selectedRoomId);
    }
    return filteredRooms[0] || null;
  }, [selectedRoomId, filteredRooms]);

  const dayQueues = useMemo(() =>
    queues.filter((q) => q.date === date),
    [queues, date]
  );

  // time range ของห้องที่เลือก
  const { minBlock, maxBlock } = useMemo(() => {
    const r = activeRoom;
    return {
      minBlock: r?.openBlock ?? 132,
      maxBlock: r?.closeBlock ?? 240,
    };
  }, [activeRoom]);

  const hours = useMemo(() => {
    const h = [];
    for (let b = minBlock; b < maxBlock; b += 12) h.push(b);
    return h;
  }, [minBlock, maxBlock]);

  const blocks = useMemo(() => {
    const arr = [];
    for (let b = minBlock; b < maxBlock; b++) arr.push(b);
    return arr;
  }, [minBlock, maxBlock]);

  // คิวของห้องที่เลือก → { block → queue info }
  const occupied = useMemo(() => {
    const map = {};
    if (!activeRoom) return map;
    dayQueues
      .filter((q) => q.roomId === activeRoom.id && q.timeBlock !== null)
      .forEach((q) => {
        const proc = procedures.find((p) => p.id === q.procedureId);
        const dur = proc?.blocks || 1;
        for (let i = 0; i < dur; i++) {
          map[q.timeBlock + i] = { ...q, procName: proc?.name || "", isStart: i === 0 };
        }
      });
    return map;
  }, [activeRoom, dayQueues, procedures]);

  // heat per hour ของห้องนี้
  const hourHeat = useMemo(() => {
    const h = {};
    hours.forEach((hb) => {
      let cnt = 0;
      for (let b = hb; b < hb + 12; b++) if (occupied[b]) cnt++;
      h[hb] = cnt;
    });
    return h;
  }, [hours, occupied]);

  const maxHeat = Math.max(...Object.values(hourHeat), 1);

  // สถิติรวมทุกห้องในวันนี้
  const totalStats = useMemo(() => {
    const byStatus = {};
    dayQueues.forEach((q) => {
      const s = q.status || "waiting";
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    return { total: dayQueues.length, byStatus };
  }, [dayQueues]);

  const CELL_W = 40;
  const CELL_H = 56;

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
          <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setSelectedRoomId(null); }}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{formatThaiDate(date)}</span>
          <span style={{ background: "var(--surface3)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{totalStats.total} คิว</span>
          {totalStats.byStatus.done > 0 && <span style={{ background: "#d1fae5", color: "#065f46", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>✅ {totalStats.byStatus.done}</span>}
          {totalStats.byStatus.waiting > 0 && <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>⏳ {totalStats.byStatus.waiting}</span>}
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <div className="card"><div className="empty"><div className="e-icon">🚪</div><p>ไม่พบห้อง</p></div></div>
      ) : (
        <div style={{ display: "flex", gap: 0, border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface1)" }}>

          {/* ─── แท็บห้อง (แนวตั้งซ้าย) ─── */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 120, borderRight: "2px solid var(--border2)", background: "var(--surface2)", flexShrink: 0 }}>
            <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>ห้อง</div>
            {filteredRooms.map((room) => {
              const isActive = activeRoom?.id === room.id;
              const roomQueues = dayQueues.filter((q) => q.roomId === room.id).length;
              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    padding: "10px 12px", border: "none", borderBottom: "1px solid var(--border)",
                    cursor: "pointer", textAlign: "left", gap: 2,
                    background: isActive ? "var(--accent-soft,#fff0ee)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                    [{room.type}] {room.name}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text3)" }}>
                    {roomQueues > 0 ? `${roomQueues} คิว` : "ว่าง"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ─── Timeline ของห้องที่เลือก ─── */}
          <div style={{ flex: 1, overflowX: "auto", minWidth: 0 }}>
            {!activeRoom ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--text3)", fontSize: 13 }}>เลือกห้อง</div>
            ) : (
              <>
                {/* ─ Heat bar ─ */}
                <div style={{ display: "flex", borderBottom: "2px solid var(--border2)", background: "var(--surface2)", position: "sticky", top: 0, zIndex: 2 }}>
                  {hours.map((hb) => {
                    const cnt = hourHeat[hb] || 0;
                    const bg = heatColor(cnt, maxHeat);
                    return (
                      <div key={hb} style={{ width: CELL_W * 12, minWidth: CELL_W * 12, flexShrink: 0, borderRight: "2px solid var(--border2)", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "var(--mono)", color: "var(--text1)" }}>{blockToTime(hb)}</span>
                          <span style={{ width: 28, height: 16, borderRadius: 4, background: bg, border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: cnt ? "#374151" : "var(--text3)" }}>{cnt || ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ─ Block row ─ */}
                <div style={{ display: "flex", minHeight: CELL_H }}>
                  {blocks.map((b) => {
                    const q = occupied[b];
                    const isHour = b % 12 === 0;
                    const bg = q
                      ? (activeRoom.type === "M" ? "#fde8e8" : "#dcfce7")
                      : "transparent";
                    return (
                      <div
                        key={b}
                        title={q ? `${q.name}${q.procName ? ` — ${q.procName}` : ""}  ${blockToTime(b)}` : blockToTime(b)}
                        style={{
                          width: CELL_W, minWidth: CELL_W, height: CELL_H,
                          background: bg,
                          borderRight: isHour ? "2px solid var(--border2)" : "1px solid var(--border)",
                          flexShrink: 0, position: "relative", overflow: "hidden",
                          transition: "background 0.1s",
                        }}
                      >
                        {/* เวลาทุก 30 นาที */}
                        {b % 6 === 0 && (
                          <div style={{ position: "absolute", top: 2, left: 2, fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)", pointerEvents: "none" }}>
                            {blockToTime(b).slice(0, 5)}
                          </div>
                        )}
                        {/* ชื่อลูกค้า */}
                        {q?.isStart && (
                          <div style={{
                            position: "absolute", left: 3, right: 3, bottom: 4,
                            fontSize: 10, fontWeight: 700, lineHeight: 1.2,
                            color: activeRoom.type === "M" ? "#991b1b" : "#166534",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {q.name}
                          </div>
                        )}
                        {q?.isStart && q.procName && (
                          <div style={{
                            position: "absolute", left: 3, right: 3, bottom: 16,
                            fontSize: 9, fontWeight: 400, color: activeRoom.type === "M" ? "#b91c1c" : "#166534",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8,
                          }}>
                            {q.procName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ─ Legend ─ */}
                <div style={{ display: "flex", gap: 12, padding: "6px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap" }}>
                  {[[activeRoom.type === "M" ? "#fde8e8" : "#dcfce7", "มีคิว"],["var(--surface2)","ว่าง"],["#bbf7d0","น้อย"],["#fde68a","มาก"],["#fca5a5","เต็ม"]].map(([c, l]) => (
                    <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid var(--border)", display: "inline-block" }} />{l}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
