import { useState, useMemo, useEffect } from "react";
import { CUSTOMER_TYPES, ROOM_TYPES, WORK_START_BLOCK, WORK_END_BLOCK } from "../utils/constants";
import { WORK_BLOCKS, blockToTime, getEmptyBookingForm, getTodayStr } from "../utils/helpers";
import SmartParseBox from "../components/SmartParseBox";

export default function BookingPage({
  form, setForm, editingQueueId, setEditingQueueId,
  branches, rooms, procedures, promos,
  roomSchedules, queues,
  onSubmit, onQuickAddPromo, onSmartApply, onBulkBooking, parseHints, todayStats,
  currentUser,
}) {
  const [showQuickPromo, setShowQuickPromo] = useState(false);
  const [qpName, setQpName] = useState("");
  const [qpPrice, setQpPrice] = useState("");
  const [qpProcedureId, setQpProcedureId] = useState("");
  // Rooms for selected branch
  const branchRooms = useMemo(() => {
    if (!form.branchId) return [];
    return rooms.filter((r) => r.branchId === form.branchId);
  }, [form.branchId, rooms]);

  // Procedures filtered by selected room's type (M or T)
  const selectedRoom = useMemo(() => {
    if (!form.roomId) return null;
    return rooms.find((r) => r.id === form.roomId) || null;
  }, [form.roomId, rooms]);

  const filteredProcedures = useMemo(() => {
    if (!selectedRoom) return procedures;
    return procedures.filter((p) => p.roomType === selectedRoom.type);
  }, [selectedRoom, procedures]);

  // Filtered promos by selected procedure
  const filteredPromos = useMemo(() => {
    if (!form.procedureId) return promos.filter((p) => p.active);
    return promos.filter((p) => p.procedureId === form.procedureId && p.active);
  }, [form.procedureId, promos]);

  // Auto-fill price when promo changes
  useEffect(() => {
    if (form.promoId) {
      const p = promos.find((x) => x.id === form.promoId);
      if (p) setForm((f) => ({ ...f, price: p.price }));
    }
  }, [form.promoId, promos, setForm]);

  // หา note ของ room schedule ที่ตรงกับห้อง + วันที่เลือก
  const scheduleNote = useMemo(() => {
    if (!form.roomId || !form.date) return null;
    const match = roomSchedules?.find(
      (s) => s.roomId === form.roomId && s.date === form.date && s.note
    );
    if (match) return match.note;
    const fallback = roomSchedules?.find(
      (s) => s.roomId === form.roomId && !s.date && s.note
    );
    return fallback?.note || null;
  }, [form.roomId, form.date, roomSchedules]);

  // Selected procedure's block count
  const selectedProcBlocks = useMemo(() => {
    if (!form.procedureId) return 0;
    const p = procedures.find((x) => x.id === form.procedureId);
    return p ? p.blocks : 0;
  }, [form.procedureId, procedures]);

  // Blocks occupied by existing queues in same room+date (ยกเว้นคิวที่กำลังแก้ไข)
  const occupiedBlocks = useMemo(() => {
    const occupied = new Set();
    if (!form.roomId || !form.date) return occupied;
    queues
      .filter((q) => q.roomId === form.roomId && q.date === form.date && q.id !== editingQueueId)
      .forEach((q) => {
        if (q.timeBlock !== null) {
          const proc = procedures.find((p) => p.id === q.procedureId);
          const dur = proc?.blocks || 1;
          for (let i = 0; i < dur; i++) occupied.add(q.timeBlock + i);
        }
      });
    return occupied;
  }, [form.roomId, form.date, queues, editingQueueId, procedures]);

  // Blocks available ตาม roomSchedules (ปิด/เปิดพิเศษ) + default hours ของห้อง
  const availableBlocks = useMemo(() => {
    // เริ่มจาก default hours ของห้อง (openBlock/closeBlock)
    const openB = selectedRoom?.openBlock ?? WORK_START_BLOCK;
    const closeB = selectedRoom?.closeBlock ?? WORK_END_BLOCK;
    const baseBlocks = WORK_BLOCKS.filter((b) => b.block >= openB && b.block < closeB);

    if (!form.roomId || !form.date) return baseBlocks;
    const schedules = roomSchedules.filter(
      (s) => s.roomId === form.roomId && (s.date === form.date || s.date === "")
    );
    if (schedules.length === 0) return baseBlocks;
    return baseBlocks.filter((b) => {
      for (const s of schedules) {
        if (s.available) {
          // เปิดเฉพาะช่วง → นอกช่วง = ปิด
          if (b.block < s.startBlock || b.block >= s.endBlock) return false;
        } else {
          // ปิดช่วงนี้
          if (b.block >= s.startBlock && b.block < s.endBlock) return false;
        }
      }
      return true;
    });
  }, [form.roomId, form.date, roomSchedules, selectedRoom]);

  // ตรวจสอบ slot ที่เลือกชนกับคิวอื่น
  const hasConflict = useMemo(() => {
    if (form.timeBlock === null || selectedProcBlocks === 0) return false;
    for (let i = 0; i < selectedProcBlocks; i++) {
      if (occupiedBlocks.has(form.timeBlock + i)) return true;
    }
    return false;
  }, [form.timeBlock, selectedProcBlocks, occupiedBlocks]);

  function handleQuickPromoSave() {
    const trimmed = qpName.trim();
    if (!trimmed) return;
    const duplicate = promos.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      // auto-select โปรซ้ำแทนการสร้างใหม่
      setForm((f) => ({ ...f, promoId: duplicate.id, price: duplicate.price }));
      setShowQuickPromo(false);
      setQpName(""); setQpPrice("");
      return;
    }
    const newPromo = onQuickAddPromo({
      name: trimmed,
      procedureId: qpProcedureId || "",
      price: parseInt(qpPrice) || 0,
      active: true,
    });
    if (newPromo) {
      // ถ้า procedureId ใน form ยังว่าง ให้เลือกด้วย
      setForm((f) => ({
        ...f,
        procedureId: f.procedureId || qpProcedureId || f.procedureId,
        promoId: newPromo.id,
        price: newPromo.price,
      }));
    }
    setShowQuickPromo(false);
    setQpName(""); setQpPrice(""); setQpProcedureId("");
  }

  function handleClear() {
    setForm(getEmptyBookingForm());
    setEditingQueueId(null);
  }

  return (
    <div>
      <SmartParseBox
        branches={branches}
        rooms={rooms}
        procedures={procedures}
        promos={promos}
        hints={parseHints || { branchAliases: {}, procedureAliases: {}, promoAliases: {}, roomAliases: {}, procedureToRoom: {} }}
        onApply={onSmartApply}
        onBulkApply={onBulkBooking}
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>📝 ข้อมูลลูกค้า</h3>
          {editingQueueId && (
            <button className="btn btn-sm btn-secondary" onClick={handleClear}>
              ✕ ยกเลิกแก้ไข
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="form-grid">
            {/* ชื่อ + เบอร์โทร */}
            <div className="form-group">
              <label className="form-label"><span className="req">*</span> ชื่อลูกค้า</label>
              <input
                placeholder="เช่น คุณสมหญิง"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label"><span className="req">*</span> เบอร์โทร</label>
              <input
                placeholder="08x-xxx-xxxx"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {/* ประเภทลูกค้า */}
            <div className="form-group full">
              <label className="form-label">ประเภทลูกค้า</label>
              <div className="type-options">
                {CUSTOMER_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    className={`type-option ${form.customerType === ct.value ? "selected" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, customerType: ct.value }))}
                  >
                    {ct.emoji} {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* สาขา + ห้อง */}
            <div className="form-group">
              <label className="form-label"><span className="req">*</span> สาขา</label>
              <select
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value, roomId: "", procedureId: "", promoId: "", price: "" }))}
              >
                <option value="">-- เลือกสาขา --</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">ห้องหัตถการ</label>
              <select
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value, procedureId: "", promoId: "", price: "" }))}
              >
                <option value="">-- เลือกห้อง --</option>
                {branchRooms.map((r) => {
                  const rt = ROOM_TYPES.find((t) => t.value === r.type);
                  return <option key={r.id} value={r.id}>[{r.type}] {r.name}</option>;
                })}
              </select>
              {selectedRoom?.notes && (
                <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: "#dc2626", lineHeight: 1.5 }}>
                  ⚠️ {selectedRoom.notes}
                </div>
              )}
              {scheduleNote && (
                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#b45309", lineHeight: 1.5, background: "#fef3c7", borderRadius: 5, padding: "3px 8px" }}>
                  📅 {scheduleNote}
                </div>
              )}
            </div>

            {/* หัตถการ + โปร */}
            <div className="form-group">
              <label className="form-label">หัตถการหลักที่สนใจ</label>
              <select
                value={form.procedureId}
                onChange={(e) => setForm((f) => ({ ...f, procedureId: e.target.value, promoId: "", price: "" }))}
              >
                <option value="">-- เลือกหัตถการ --</option>
                {filteredProcedures.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.blocks * 5} นาที)</option>
                ))}
              </select>
              {selectedRoom && (
                <span style={{ fontSize: 11, color: selectedRoom.type === "M" ? "var(--blue)" : "var(--green)", fontStyle: "italic", fontWeight: 600 }}>
                  แสดงเฉพาะหัตถการประเภท {selectedRoom.type === "M" ? "M (ห้องหมอ)" : "T (ห้องเครื่อง/ทรีตเมนต์)"}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                โปร/แพ็กเกจที่เลือก
                <button
                  type="button"
                  onClick={() => { setShowQuickPromo((v) => !v); setQpName(""); setQpPrice(""); setQpProcedureId(form.procedureId || ""); }}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 6, border: "1.5px solid var(--accent)",
                    background: showQuickPromo ? "var(--accent)" : "transparent",
                    color: showQuickPromo ? "#fff" : "var(--accent)",
                    cursor: "pointer", lineHeight: 1.4,
                  }}
                >
                  {showQuickPromo ? "✕ ยกเลิก" : "➕ เพิ่มโปรด่วน"}
                </button>
              </label>
              <select
                value={form.promoId}
                onChange={(e) => setForm((f) => ({ ...f, promoId: e.target.value }))}
              >
                <option value="">-- เลือกโปร --</option>
                {filteredPromos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ฿{p.price.toLocaleString()}
                  </option>
                ))}
              </select>

              {/* Quick add promo inline form */}
              {showQuickPromo && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: "var(--radius-sm)",
                  border: "1.5px solid var(--accent)", background: "var(--surface2)",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                    ➕ เพิ่มโปรใหม่ด่วน
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/* หัตถการที่ผูก */}
                    <select
                      value={qpProcedureId}
                      onChange={(e) => setQpProcedureId(e.target.value)}
                      style={{ flex: "2 1 150px", minWidth: 0 }}
                    >
                      <option value="">-- หัตถการที่สนใจ --</option>
                      {(selectedRoom
                        ? procedures.filter((p) => p.roomType === selectedRoom.type)
                        : procedures
                      ).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      autoFocus
                      placeholder="ชื่อโปร/แพ็กเกจ *"
                      value={qpName}
                      onChange={(e) => setQpName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleQuickPromoSave()}
                      style={{ flex: "2 1 130px", minWidth: 0 }}
                    />
                    <input
                      type="number"
                      placeholder="ราคา (฿)"
                      value={qpPrice}
                      onChange={(e) => setQpPrice(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleQuickPromoSave()}
                      style={{ flex: "1 1 90px", minWidth: 0 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleQuickPromoSave}
                      disabled={!qpName.trim()}
                    >
                      บันทึก
                    </button>
                  </div>
                  {/* ตรวจโปรซ้ำ live */}
                  {qpName.trim() && (() => {
                    const dup = promos.find((p) => p.name.trim().toLowerCase() === qpName.trim().toLowerCase());
                    return dup ? (
                      <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>
                        ⚠️ มีโปร "{dup.name}" อยู่แล้ว — กด บันทึก เพื่อเลือกโปรนี้แทน
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            {/* ราคา + วันที่ */}
            <div className="form-group">
              <label className="form-label">ราคา (บาท)</label>
              <div className="price-display">
                {form.price ? `฿${Number(form.price).toLocaleString()}` : "—"}
                <span>{form.promoId ? "Auto" : "เลือกโปรเพื่อแสดงราคา"}</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">วันที่</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            {/* เลือกเวลา */}
            <div className="form-group full">
              <label className="form-label">
                เวลานัด (บล็อค 5 นาที)
                {selectedProcBlocks > 0 && (
                  <span style={{ fontWeight: 400, color: "var(--accent)", marginLeft: 8 }}>
                    • ใช้ {selectedProcBlocks} บล็อค ({selectedProcBlocks * 5} นาที)
                  </span>
                )}
              </label>
              {form.timeBlock !== null && selectedProcBlocks > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "flex", gap: 10 }}>
                  <span style={{ color: hasConflict ? "var(--red)" : "var(--green)" }}>
                    {hasConflict ? "⚠️ ชนกับคิวอื่น!" : `⏱ ${blockToTime(form.timeBlock)} — ${blockToTime(form.timeBlock + selectedProcBlocks)}`}
                  </span>
                </div>
              )}
              {/* Legend */}
              {form.roomId && (
                <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--accent)", display: "inline-block" }} />
                    เวลาที่เลือก
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#e8c5bb", display: "inline-block" }} />
                    มีคิวแล้ว
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--surface3)", display: "inline-block" }} />
                    ปิด / ไม่พร้อม
                  </span>
                </div>
              )}
              <div className="time-grid">
                {WORK_BLOCKS.map((b) => {
                  const isStart = form.timeBlock === b.block;
                  const isInRange = form.timeBlock !== null && selectedProcBlocks > 0
                    && b.block > form.timeBlock && b.block < form.timeBlock + selectedProcBlocks;
                  const isOccupied = occupiedBlocks.has(b.block);
                  const isClosed = !availableBlocks.find((ab) => ab.block === b.block);
                  const isDisabled = isOccupied || isClosed;
                  return (
                    <div
                      key={b.block}
                      className={`time-block ${isStart ? "selected" : ""} ${isInRange ? "in-range" : ""} ${isDisabled ? "disabled" : ""}`}
                      style={
                        isOccupied && !isStart
                          ? { background: "#e8c5bb", borderColor: "#c8957e", color: "var(--accent)", opacity: 0.7 }
                          : isClosed
                          ? { background: "var(--surface3)", borderColor: "var(--border2)", color: "var(--text3)" }
                          : {}
                      }
                      onClick={() => !isDisabled && setForm((f) => ({ ...f, timeBlock: b.block }))}
                    >
                      {b.time}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* หมายเหตุ */}
            <div className="form-group full">
              <label className="form-label">หมายเหตุ</label>
              <textarea
                placeholder="เช่น สนใจ Filler ปากด้วย / ลูกค้า VIP / แพ้ยาชา / คอร์สเหลือ 2 ครั้ง..."
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
            {currentUser && !editingQueueId && (
              <span style={{ fontSize: 12, color: "var(--text2)", marginRight: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                📝 บันทึกโดย:
                <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                  {currentUser.nickname || currentUser.name}
                </span>
              </span>
            )}
            <button className="btn btn-secondary" onClick={handleClear}>ล้างฟอร์ม</button>
            <button className="btn btn-primary" onClick={onSubmit}>
              {editingQueueId ? "💾 บันทึกการแก้ไข" : "✅ บันทึกคิว"}
            </button>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="stats-row">
        <div className="stat-box">
          <div className="num" style={{ color: "var(--accent)" }}>{todayStats.total}</div>
          <div className="lbl">คิววันนี้</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: "var(--green)" }}>{todayStats.new}</div>
          <div className="lbl">ลูกค้าใหม่</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: "var(--blue)" }}>{todayStats.old}</div>
          <div className="lbl">ลูกค้าเก่า</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: "var(--amber)" }}>{todayStats.course}</div>
          <div className="lbl">ใช้คอร์ส</div>
        </div>
      </div>
    </div>
  );
}
