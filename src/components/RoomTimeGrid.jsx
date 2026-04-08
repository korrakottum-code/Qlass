import { useMemo, useRef, useEffect } from "react";
import { blockToTime } from "../utils/helpers";

const HOUR_COLOR = [
  "#e0f2fe", "#bfdbfe", "#ddd6fe", "#fde68a",
  "#bbf7d0", "#fed7aa", "#fce7f3", "#cffafe",
  "#e9d5ff", "#d1fae5", "#fef3c7", "#fee2e2",
];

export default function RoomTimeGrid({
  branchRooms,
  queues,
  procedures,
  roomSchedules,
  date,
  selectedRoomId,
  selectedTimeBlock,
  selectedProcBlocks,
  editingQueueId,
  onSelect,
}) {
  const scrollRef = useRef(null);

  // คำนวณ range เวลาของทุกห้อง
  const timeRange = useMemo(() => {
    let minB = 999, maxB = 0;
    branchRooms.forEach((r) => {
      const open = r.openBlock ?? 144;   // 12:00
      const close = r.closeBlock ?? 252; // 21:00
      if (open < minB) minB = open;
      if (close > maxB) maxB = close;
    });
    if (minB === 999) { minB = 144; maxB = 252; }
    const blocks = [];
    for (let b = minB; b < maxB; b++) blocks.push(b);
    return { blocks, minB, maxB };
  }, [branchRooms]);

  // map roomId → occupied blocks (block → queue info)
  const roomOccupied = useMemo(() => {
    const map = {};
    branchRooms.forEach((r) => { map[r.id] = {}; });
    queues
      .filter((q) => q.date === date && q.timeBlock !== null)
      .forEach((q) => {
        if (!map[q.roomId]) return;
        const proc = procedures.find((p) => p.id === q.procedureId);
        const dur = q.durationBlocks ?? proc?.blocks ?? 1;
        const isEditing = q.id === editingQueueId;
        for (let i = 0; i < dur; i++) {
          map[q.roomId][q.timeBlock + i] = {
            name: q.name,
            proc: proc?.name || "",
            isStart: i === 0,
            isEditing,
            qId: q.id,
          };
        }
      });
    return map;
  }, [branchRooms, queues, date, procedures, editingQueueId]);

  // map roomId → closed blocks
  const roomClosed = useMemo(() => {
    const map = {};
    branchRooms.forEach((r) => {
      const open = r.openBlock ?? 144;
      const close = r.closeBlock ?? 252;
      const closedSet = new Set();
      timeRange.blocks.forEach((b) => {
        if (b < open || b >= close) { closedSet.add(b); return; }
        const schedules = (roomSchedules || []).filter(
          (s) => s.roomId === r.id && (s.date === date || s.date === "")
        );
        for (const s of schedules) {
          if (s.available) {
            if (b < s.startBlock || b >= s.endBlock) closedSet.add(b);
          } else {
            if (b >= s.startBlock && b < s.endBlock) closedSet.add(b);
          }
        }
      });
      map[r.id] = closedSet;
    });
    return map;
  }, [branchRooms, roomSchedules, date, timeRange]);

  // scroll to selected time on mount / change
  useEffect(() => {
    if (scrollRef.current && selectedTimeBlock !== null) {
      const el = scrollRef.current.querySelector(`[data-block="${selectedTimeBlock}"]`);
      if (el) el.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    }
  }, [selectedTimeBlock]);

  // hour labels (แสดงทุกชั่วโมง)
  const hourBlocks = useMemo(() =>
    timeRange.blocks.filter((b) => b % 12 === 0),
    [timeRange.blocks]
  );

  const CELL_W = 28;
  const CELL_H = 36;

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid var(--border)" }} ref={scrollRef}>
      <div style={{ minWidth: branchRooms.length === 0 ? 300 : undefined }}>
        {/* Hour header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 96, minWidth: 96, flexShrink: 0, fontSize: 11, color: "var(--text3)", padding: "4px 8px", borderRight: "1px solid var(--border)" }} />
          <div style={{ display: "flex", position: "relative", flex: 1 }}>
            {timeRange.blocks.map((b, i) => {
              const isHour = b % 12 === 0;
              const hIdx = Math.floor((b - timeRange.minB) / 12) % HOUR_COLOR.length;
              return (
                <div
                  key={b}
                  style={{
                    width: CELL_W, minWidth: CELL_W, flexShrink: 0,
                    height: 22, borderRight: isHour ? "2px solid var(--border2)" : "1px solid var(--border)",
                    background: isHour ? HOUR_COLOR[hIdx % HOUR_COLOR.length] : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: isHour ? 700 : 400,
                    color: isHour ? "var(--text1)" : "transparent",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {isHour ? blockToTime(b) : ""}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows per room */}
        {branchRooms.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--text3)", textAlign: "center" }}>
            เลือกสาขาก่อนเพื่อดูห้องทั้งหมด
          </div>
        ) : (
          branchRooms.map((room) => {
            const occupied = roomOccupied[room.id] || {};
            const closed = roomClosed[room.id] || new Set();
            const isSelectedRoom = room.id === selectedRoomId;
            return (
              <div
                key={room.id}
                style={{
                  display: "flex", borderBottom: "1px solid var(--border)",
                  background: isSelectedRoom ? "rgba(var(--accent-rgb,220,80,80),0.04)" : "var(--surface1)",
                }}
              >
                {/* Room label */}
                <div style={{
                  width: 96, minWidth: 96, flexShrink: 0,
                  padding: "4px 8px", fontSize: 12, fontWeight: 700,
                  display: "flex", flexDirection: "column", justifyContent: "center",
                  borderRight: "1px solid var(--border)",
                  background: isSelectedRoom ? "var(--accent-soft)" : undefined,
                }}>
                  <span style={{ color: room.type === "M" ? "var(--blue)" : "var(--green)", fontSize: 10, fontWeight: 800 }}>
                    [{room.type}]
                  </span>
                  <span style={{ color: "var(--text1)", lineHeight: 1.2, fontSize: 11 }}>
                    {room.name}
                  </span>
                </div>

                {/* Cells */}
                <div style={{ display: "flex", flex: 1 }}>
                  {timeRange.blocks.map((b) => {
                    const occ = occupied[b];
                    const isClosed = closed.has(b);
                    const isHour = b % 12 === 0;
                    const isSelectedStart = isSelectedRoom && selectedTimeBlock === b;
                    const isInRange = isSelectedRoom && selectedTimeBlock !== null && selectedProcBlocks > 0
                      && b > selectedTimeBlock && b < selectedTimeBlock + selectedProcBlocks;
                    const isOccupiedByEditing = occ?.isEditing;
                    const isBlocked = occ && !isOccupiedByEditing;
                    const hIdx = Math.floor((b - timeRange.minB) / 12) % HOUR_COLOR.length;

                    let bg = "transparent";
                    let border = isHour ? "2px solid var(--border2)" : "1px solid var(--border)";
                    let cursor = "default";
                    let title = blockToTime(b);
                    let opacity = 1;

                    if (isClosed) {
                      bg = "var(--surface3)";
                      opacity = 0.5;
                    } else if (isBlocked) {
                      bg = room.type === "M" ? "#fde8e8" : "#d1fae5";
                      cursor = "not-allowed";
                      title = `${occ.name}${occ.proc ? ` — ${occ.proc}` : ""}`;
                    } else if (isSelectedStart) {
                      bg = "var(--accent)";
                      border = "2px solid var(--accent)";
                      cursor = "pointer";
                    } else if (isInRange) {
                      bg = "var(--accent-soft2,#ffe4de)";
                      border = `1px solid var(--accent)`;
                      cursor = "pointer";
                    } else if (!isClosed && isSelectedRoom) {
                      cursor = "pointer";
                    } else if (!isClosed) {
                      cursor = "pointer";
                    }

                    return (
                      <div
                        key={b}
                        data-block={b}
                        title={title}
                        onClick={() => {
                          if (isClosed || isBlocked) return;
                          onSelect(room.id, b);
                        }}
                        style={{
                          width: CELL_W, minWidth: CELL_W, height: CELL_H,
                          borderRight: border, flexShrink: 0,
                          background: bg, cursor, opacity,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, fontFamily: "var(--mono)",
                          color: isSelectedStart ? "#fff" : "var(--text3)",
                          transition: "background 0.1s",
                          position: "relative",
                        }}
                      >
                        {isSelectedStart && blockToTime(b).slice(0, 5)}
                        {/* ชื่อคิวที่จองไว้ — แสดงที่ block เริ่มต้น */}
                        {isBlocked && occ?.isStart && (
                          <div style={{
                            position: "absolute", left: 1, right: 1, top: "50%", transform: "translateY(-50%)",
                            fontSize: 8, fontWeight: 700, color: room.type === "M" ? "#b91c1c" : "#065f46",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            textAlign: "center", lineHeight: 1.1, padding: "0 1px",
                            fontFamily: "var(--body)",
                          }}>
                            {occ.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Legend */}
        <div style={{ display: "flex", gap: 12, padding: "6px 12px", flexWrap: "wrap", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          {[
            { color: "var(--accent)", label: "เวลาที่เลือก" },
            { color: "var(--accent-soft2,#ffe4de)", label: "ช่วงหัตถการ", border: "var(--accent)" },
            { color: "#fde8e8", label: "มีคิว (M)" },
            { color: "#d1fae5", label: "มีคิว (T)" },
            { color: "var(--surface3)", label: "ปิด" },
          ].map(({ color, label, border }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: border ? `1.5px solid ${border}` : "1px solid var(--border)", display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
