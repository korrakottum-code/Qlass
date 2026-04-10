import { useState, useMemo } from "react";
import { getTodayStr, blockToTime, formatThaiDate, getEmptyBookingForm } from "../utils/helpers";

export default function TimelinePage({ queues, branches, rooms, procedures, promos, roomSchedules = [], currentUser, onSubmitBooking, onEditQueue }) {
  const [date, setDate] = useState(getTodayStr());
  const [filterBranch, setFilterBranch] = useState("all");
  const [popup, setPopup] = useState(null); // { q, room, block, x, y }
  const [bookingForm, setBookingForm] = useState(null); // mini booking popup form
  const [saving, setSaving] = useState(false);

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

  const roomScheduleNotesByRoomId = useMemo(() => {
    const notesByRoomId = {};
    filteredRooms.forEach((room) => {
      const exactNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && s.date === date && s.note)
        .map((s) => s.note);

      const fallbackNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && !s.date && s.note)
        .map((s) => s.note);

      const notes = exactNotes.length > 0 ? exactNotes : fallbackNotes;
      if (notes.length > 0) notesByRoomId[room.id] = notes;
    });
    return notesByRoomId;
  }, [filteredRooms, roomSchedules, date]);

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
      const dur = q.durationBlocks ?? proc?.blocks ?? 1;
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
                    const roomScheduleNotes = roomScheduleNotesByRoomId[room.id] || [];
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
                        {roomScheduleNotes.length > 0 && (
                          <div style={{ marginTop: 3, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6 }}>
                            {roomScheduleNotes.map((note, idx) => (
                              <span key={`${note}_${idx}`} style={{ fontSize: 11, fontWeight: 800, color: "#ffffff", lineHeight: 1.5, background: "#dc2626", border: "1px solid #b91c1c", borderRadius: 6, padding: "2px 8px" }}>
                                📅 {note}
                              </span>
                            ))}
                          </div>
                        )}
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
                              onClick={(e) => {
                                if (q) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setPopup({ q, room, block: b, x: rect.left, y: rect.bottom });
                                } else {
                                  setBookingForm({
                                    ...getEmptyBookingForm(),
                                    roomId: room.id,
                                    branchId: room.branchId,
                                    date,
                                    timeBlock: b,
                                  });
                                }
                              }}
                              style={{
                                height: ROW_H,
                                background: isBooked ? bookedBg : emptyBg,
                                borderRight: "1px solid var(--border)",
                                borderTop: isHourStart ? "2px solid var(--border2)" : undefined,
                                position: "relative", overflow: "hidden",
                                transition: "background 0.1s",
                                cursor: "pointer",
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
            <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>กดช่องว่าง = บันทึกคิว • กดช่องคิว = ดูรายละเอียด</span>
          </div>
        </div>
      )}

      {/* ─── Popup รายละเอียดคิว ─── */}
      {popup && (
        <>
          <div
            onClick={() => setPopup(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div style={{
            position: "fixed",
            left: Math.min(popup.x, window.innerWidth - 280),
            top: Math.min(popup.y + 4, window.innerHeight - 240),
            zIndex: 1000,
            background: "var(--surface1)",
            border: "1.5px solid var(--border2)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "16px 18px",
            minWidth: 240,
            maxWidth: 300,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{popup.q.name}</div>
              <button
                onClick={() => setPopup(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text3)", lineHeight: 1, padding: 0, marginLeft: 8 }}
              >✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              {popup.q.phone && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>โทร</span>
                  <span style={{ fontWeight: 600 }}>{popup.q.phone}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text3)", minWidth: 56 }}>ห้อง</span>
                <span style={{ fontWeight: 600, color: popup.room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                  [{popup.room.type}] {popup.room.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text3)", minWidth: 56 }}>เวลา</span>
                <span style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>
                  {blockToTime(popup.q.timeBlock)}
                  {popup.q.dur > 0 && ` — ${blockToTime(popup.q.timeBlock + popup.q.dur)}`}
                </span>
              </div>
              {popup.q.procName && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>หัตถการ</span>
                  <span style={{ fontWeight: 600 }}>{popup.q.procName}</span>
                </div>
              )}
              {popup.q.note && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>Note</span>
                  <span style={{ color: "var(--text2)" }}>{popup.q.note}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text3)", minWidth: 56 }}>สถานะ</span>
                <span style={{
                  fontWeight: 700,
                  color: popup.q.status === "done" ? "var(--green)" : popup.q.status === "cancelled" ? "var(--red)" : "var(--amber,#d97706)",
                }}>
                  {popup.q.status === "done" ? "✅ เสร็จ" : popup.q.status === "cancelled" ? "❌ ยกเลิก" : "⏳ รอ"}
                </span>
              </div>
            </div>
            {onEditQueue && (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 10, fontSize: 13 }}
                onClick={() => { setPopup(null); onEditQueue(popup.q); }}
              >
                ✏️ แก้ไขคิวนี้
              </button>
            )}
          </div>
        </>
      )}
      {/* ─── Mini Booking Popup ─── */}
      {bookingForm && (() => {
        const room = rooms.find((r) => r.id === bookingForm.roomId);
        const branch = branches.find((b) => b.id === bookingForm.branchId);
        const roomProcs = procedures.filter((p) => !p.type || p.type === room?.type);
        const selectedProc = procedures.find((p) => p.id === bookingForm.procedureId);
        const availablePromos = promos.filter((p) => !p.procedureId || p.procedureId === bookingForm.procedureId);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setBookingForm(null)}>
            <div style={{ background: "var(--surface1)", borderRadius: 16, padding: "22px 26px", minWidth: 340, maxWidth: 440, width: "94%", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--accent)" }}>📝 บันทึกคิว</div>
                <button onClick={() => setBookingForm(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text3)" }}>✕</button>
              </div>

              {/* Room + Time info */}
              <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: room?.type === "M" ? "var(--blue)" : "var(--green)", fontWeight: 700 }}>
                  [{room?.type}] {room?.name}
                </span>
                <span style={{ color: "var(--text3)" }}>{branch?.name}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>⏰ {blockToTime(bookingForm.timeBlock)}</span>
                <span style={{ color: "var(--text3)" }}>📅 {bookingForm.date}</span>
              </div>

              {/* Form fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>ชื่อลูกค้า *</label>
                    <input style={{ width: "100%", fontSize: 13 }} value={bookingForm.name}
                      onChange={(e) => setBookingForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="ชื่อ-นามสกุล" autoFocus />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>เบอร์โทร *</label>
                    <input style={{ width: "100%", fontSize: 13 }} value={bookingForm.phone}
                      onChange={(e) => setBookingForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="0xxxxxxxxx" />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>หัตถการ</label>
                  <select style={{ width: "100%", fontSize: 13 }} value={bookingForm.procedureId}
                    onChange={(e) => setBookingForm((f) => ({ ...f, procedureId: e.target.value, promoId: "", price: "" }))}>
                    <option value="">— เลือกหัตถการ —</option>
                    {roomProcs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {availablePromos.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>โปร/แพ็กเกจ</label>
                    <select style={{ width: "100%", fontSize: 13 }} value={bookingForm.promoId}
                      onChange={(e) => {
                        const promo = promos.find((p) => p.id === e.target.value);
                        setBookingForm((f) => ({ ...f, promoId: e.target.value, price: promo?.price ?? f.price }));
                      }}>
                      <option value="">— ไม่ระบุ —</option>
                      {availablePromos.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price ? ` (฿${p.price.toLocaleString()})` : ""}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>ราคา (บาท)</label>
                    <input type="number" style={{ width: "100%", fontSize: 13 }} value={bookingForm.price}
                      onChange={(e) => setBookingForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="0" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>ประเภทลูกค้า</label>
                    <select style={{ width: "100%", fontSize: 13 }} value={bookingForm.customerType}
                      onChange={(e) => setBookingForm((f) => ({ ...f, customerType: e.target.value }))}>
                      <option value="new">ลูกค้าใหม่</option>
                      <option value="old">ลูกค้าเก่า</option>
                      <option value="course">ใช้คอร์ส</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>Note</label>
                  <input style={{ width: "100%", fontSize: 13 }} value={bookingForm.note}
                    onChange={(e) => setBookingForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="หมายเหตุ (ถ้ามี)" />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={() => setBookingForm(null)}>ยกเลิก</button>
                <button
                  className="btn btn-primary"
                  disabled={saving || !bookingForm.name.trim() || !bookingForm.phone.trim()}
                  onClick={async () => {
                    if (!onSubmitBooking) return;
                    setSaving(true);
                    const ok = await onSubmitBooking(bookingForm);
                    setSaving(false);
                    if (ok) setBookingForm(null);
                  }}
                >
                  {saving ? "กำลังบันทึก..." : "✅ บันทึกคิว"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
