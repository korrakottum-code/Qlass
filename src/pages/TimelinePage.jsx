import { useState, useMemo } from "react";
import { getTodayStr, blockToTime, formatThaiDate } from "../utils/helpers";

export default function TimelinePage({ queues, branches, rooms, procedures }) {
  const [date, setDate] = useState(getTodayStr());
  const [filterBranch, setFilterBranch] = useState("all");

  function navigate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    setDate(d.toISOString().slice(0, 10));
  }

  const filteredRooms = useMemo(() => {
    if (filterBranch === "all") return rooms;
    return rooms.filter((r) => r.branchId === filterBranch);
  }, [rooms, filterBranch]);

  const dayQueues = useMemo(() =>
    queues.filter((q) => q.date === date),
    [queues, date]
  );

  // หา time range จากทุกห้อง
  const { minBlock, maxBlock } = useMemo(() => {
    let mn = 132, mx = 240;
    filteredRooms.forEach((r) => {
      if ((r.openBlock ?? 132) < mn) mn = r.openBlock ?? 132;
      if ((r.closeBlock ?? 240) > mx) mx = r.closeBlock ?? 240;
    });
    return { minBlock: mn, maxBlock: mx };
  }, [filteredRooms]);

  // แสดงทุกชั่วโมง (12 บล็อค = 1 ชม.) เป็น row
  const hourBlocks = useMemo(() => {
    const arr = [];
    for (let b = minBlock; b < maxBlock; b += 12) arr.push(b);
    return arr;
  }, [minBlock, maxBlock]);

  // map roomId → { block → queue }
  const roomOccupied = useMemo(() => {
    const map = {};
    filteredRooms.forEach((r) => { map[r.id] = {}; });
    dayQueues.forEach((q) => {
      if (!map[q.roomId] || q.timeBlock === null) return;
      const proc = procedures.find((p) => p.id === q.procedureId);
      const dur = proc?.blocks || 1;
      for (let i = 0; i < dur; i++) {
        map[q.roomId][q.timeBlock + i] = { ...q, procName: proc?.name || "", isStart: i === 0, dur };
      }
    });
    return map;
  }, [filteredRooms, dayQueues, procedures]);

  const totalQueues = dayQueues.length;
  const ROW_H = 40;  // ความสูงแต่ละ block 5 นาที
  const TIME_COL = 72; // คอลัมน์เวลาซ้าย

  return (
    <>
      {/* Controls */}
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{formatThaiDate(date)}</span>
          <span style={{ background: "var(--surface3)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{totalQueues} คิว</span>
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <div className="card"><div className="empty"><div className="e-icon">🚪</div><p>ไม่พบห้อง</p></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
              {/* Header: ชื่อห้องเป็น column */}
              <thead>
                <tr style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--surface2)" }}>
                  <th style={{ width: TIME_COL, padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)", borderBottom: "2px solid var(--border2)", borderRight: "2px solid var(--border2)" }}>
                    เวลา
                  </th>
                  {filteredRooms.map((room) => {
                    const branch = branches.find((b) => b.id === room.branchId);
                    const cnt = dayQueues.filter((q) => q.roomId === room.id).length;
                    return (
                      <th key={room.id} style={{
                        padding: "6px 10px", textAlign: "center",
                        borderBottom: "2px solid var(--border2)",
                        borderRight: "1px solid var(--border)",
                        background: room.type === "M" ? "#eff6ff" : "#f0fdf4",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                          {room.name}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>
                          [{room.type}]{branch ? ` • ${branch.name}` : ""}
                        </div>
                        {cnt > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", marginTop: 2 }}>{cnt} คิว</div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Body: แต่ละชั่วโมงเป็นกลุ่ม แต่ละ 5 นาทีเป็น row */}
              <tbody>
                {hourBlocks.map((hb) => {
                  // แต่ละชั่วโมงมี 12 block (= 12 เอ็น 5นาที = 60 นาที)
                  const rowBlocks = [];
                  for (let b = hb; b < hb + 12 && b < maxBlock; b++) rowBlocks.push(b);

                  return rowBlocks.map((b, bi) => {
                    const isHourStart = bi === 0;
                    const isHalfHour = b % 6 === 0;
                    return (
                      <tr key={b} style={{ borderBottom: isHourStart && bi === 0 ? "2px solid var(--border2)" : "1px solid var(--border)" }}>
                        {/* คอลัมน์เวลา */}
                        <td style={{
                          width: TIME_COL, padding: "0 8px",
                          height: ROW_H, verticalAlign: "middle",
                          borderRight: "2px solid var(--border2)",
                          background: isHourStart ? "var(--surface2)" : isHalfHour ? "var(--surface3)" : "transparent",
                          fontFamily: "var(--mono)", fontWeight: isHourStart ? 800 : isHalfHour ? 600 : 400,
                          fontSize: isHourStart ? 13 : isHalfHour ? 11 : 10,
                          color: isHourStart ? "var(--text1)" : "var(--text3)",
                          whiteSpace: "nowrap",
                        }}>
                          {(isHourStart || isHalfHour) ? blockToTime(b) : ""}
                        </td>

                        {/* เซลล์แต่ละห้อง */}
                        {filteredRooms.map((room) => {
                          const q = roomOccupied[room.id]?.[b];
                          const isBooked = !!q;
                          const isM = room.type === "M";
                          const bookedBg = isM ? "#fde8e8" : "#dcfce7";
                          const emptyBg = isHourStart ? "rgba(0,0,0,0.02)" : "transparent";

                          return (
                            <td
                              key={room.id}
                              title={q ? `${q.name}${q.procName ? ` — ${q.procName}` : ""} (${blockToTime(b)})` : blockToTime(b)}
                              style={{
                                height: ROW_H,
                                background: isBooked ? bookedBg : emptyBg,
                                borderRight: "1px solid var(--border)",
                                borderTop: isHourStart ? "2px solid var(--border2)" : undefined,
                                position: "relative", overflow: "hidden",
                                transition: "background 0.1s",
                              }}
                            >
                              {/* ชื่อ + หัตถการ — เฟ้นที่ขึ้นใน block เริ่มต้น */}
                              {q?.isStart && (
                                <div style={{
                                  position: "absolute", inset: "2px 4px",
                                  display: "flex", flexDirection: "column", justifyContent: "center",
                                  overflow: "hidden",
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: isM ? "#991b1b" : "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {q.name}
                                  </div>
                                  {q.procName && (
                                    <div style={{ fontSize: 9, color: isM ? "#b91c1c" : "#166534", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {q.procName}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, padding: "8px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap" }}>
            {[["#fde8e8","มีคิว (M)"],["#dcfce7","มีคิว (T)"],["transparent","ว่าง"]].map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid var(--border)", display: "inline-block" }} />{l}
              </span>
            ))}
            <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>hover ที่ช่องเพื่อดูรายละเอียด</span>
          </div>
        </div>
      )}
    </>
  );
}
