import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { CUSTOMER_TYPES, ROOM_TYPES, QUEUE_STATUSES, WORK_START_BLOCK, WORK_END_BLOCK } from "../utils/constants";
import { WORK_BLOCKS, blockToTime, formatThaiDate, getEmptyBookingForm, getTodayStr, isActiveQueueStatus } from "../utils/helpers";
import { proceduresForRoom, isRoomConfigured } from "../utils/roomProcedures";
import SmartParseBox from "../components/SmartParseBox";
import HnLookup from "../components/HnLookup";
import { useSubmissionLock } from "../hooks/useSubmissionLock";

function StatusBadge({ status }) {
  const s = QUEUE_STATUSES.find((x) => x.value === (status || "pending"));
  if (!s) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {s.emoji} {s.label}
    </span>
  );
}

export default function BookingPage({
  form, setForm, editingQueueId, setEditingQueueId, onAbandonDraft,
  branches, rooms, procedures, promos,
  roomSchedules, queues, roomProcedureIndex,
  onSubmit, onQuickAddPromo, onSmartApply, onBulkBooking, parseHints, todayStats,
  currentUser, showToast,
}) {
  const [showQuickPromo, setShowQuickPromo] = useState(false);
  const [qpName, setQpName] = useState("");
  const [qpPrice, setQpPrice] = useState("");
  const [qpProcedureId, setQpProcedureId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // ลงคิวรอ (Waiting Queue): ยังไม่ระบุห้อง/เวลา — derived straight from form.status
  // so it can never drift out of sync after a save resets the form.
  const isWaitingQueueMode = form.status === "waiting_queue";
  // ปุ่มลงคิวรอ แสดงเฉพาะตอนสร้างใหม่ หรือกำลังแก้ไขคิวที่ "เป็นคิวรอ" อยู่แล้ว
  // (กันไม่ให้เผลอเปลี่ยนคิวที่ยืนยัน/เสร็จแล้วกลับไปเป็นคิวรอผ่านฟอร์มนี้)
  const [waitingQueueToggleAllowed, setWaitingQueueToggleAllowed] = useState(
    () => !editingQueueId || form.status === "waiting_queue"
  );
  useEffect(() => {
    setWaitingQueueToggleAllowed(!editingQueueId || form.status === "waiting_queue");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingQueueId]);
  const { isSaving: isBookingSaving, run: runBookingSubmit } = useSubmissionLock();
  const { isSaving: isQuickPromoSaving, run: runQuickPromoSave } = useSubmissionLock();
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

  // เตียงที่ตั้งค่าแล้วจะเหลือเฉพาะหัตถการที่เตียงนั้นรับ ส่วนเตียงที่ยังไม่ตั้งค่า
  // จะได้ผลเท่ากับกติกาเดิม M/T (กติกาอยู่ใน roomProcedures.js ที่เดียว)
  const filteredProcedures = useMemo(() => {
    if (!selectedRoom) return procedures;
    return proceduresForRoom(roomProcedureIndex, selectedRoom, procedures);
  }, [selectedRoom, procedures, roomProcedureIndex]);

  const roomIsConfigured = !!selectedRoom && isRoomConfigured(roomProcedureIndex, selectedRoom.id);

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

  // หา note ของ room schedule ที่ตรงกับห้อง + วันที่เลือก (รองรับหลาย note)
  const scheduleNotes = useMemo(() => {
    if (!form.roomId || !form.date) return [];

    const exactNotes = (roomSchedules || [])
      .filter((s) => s.roomId === form.roomId && s.date === form.date && s.note)
      .map((s) => s.note);

    if (exactNotes.length > 0) return exactNotes;

    return (roomSchedules || [])
      .filter((s) => s.roomId === form.roomId && !s.date && s.note)
      .map((s) => s.note);
  }, [form.roomId, form.date, roomSchedules]);

  // Selected procedure's block count
  const selectedProcBlocks = useMemo(() => {
    if (!form.procedureId) return 0;
    const p = procedures.find((x) => x.id === form.procedureId);
    return p ? p.blocks : 0;
  }, [form.procedureId, procedures]);

  // Effective duration (override หรือ default จาก procedure) — 0 เมื่อไม่มี procedure
  const activeDur = selectedProcBlocks > 0 ? (form.durationBlocks ?? selectedProcBlocks) : 0;

  // Blocks occupied by existing queues in same room+date (ยกเว้นคิวที่กำลังแก้ไข)
  const occupiedBlocks = useMemo(() => {
    const occupied = new Set();
    if (!form.roomId || !form.date) return occupied;
    queues
      .filter((q) => q.roomId === form.roomId && q.date === form.date && q.id !== editingQueueId && isActiveQueueStatus(q.status))
      .forEach((q) => {
        if (q.timeBlock !== null) {
          const proc = procedures.find((p) => p.id === q.procedureId);
          const dur = q.durationBlocks ?? proc?.blocks ?? 1;
          for (let i = 0; i < dur; i++) occupied.add(q.timeBlock + i);
        }
      });
    return occupied;
  }, [form.roomId, form.date, queues, editingQueueId, procedures]);

  // ช่วงเวลาที่ห้องเปิด (union ของเวลาปกติห้อง + schedules ที่เปิดพิเศษ) ลบด้วย schedules ที่ปิด
  const availableBlocks = useMemo(() => {
    const openB = selectedRoom?.openBlock ?? WORK_START_BLOCK;
    const closeB = selectedRoom?.closeBlock ?? WORK_END_BLOCK;

    if (!form.roomId || !form.date) {
      return WORK_BLOCKS.filter((b) => b.block >= openB && b.block < closeB);
    }

    const schedules = roomSchedules.filter(
      (s) => s.roomId === form.roomId && (s.date === form.date || s.date === "")
    );

    // ปิดทั้งวัน (available=false, ไม่มี block range) → ไม่มี slot เลย
    const isClosedAllDay = schedules.some((s) => !s.available && !s.noteOnly && s.startBlock === null);
    if (isClosedAllDay) return [];

    // Open ranges: default ห้อง + schedules ที่เปิด (union → ต่อเวลาได้)
    const openRanges = [{ start: openB, end: closeB }];
    schedules.forEach((s) => {
      if (s.available && !s.noteOnly && s.startBlock !== null && s.endBlock !== null) {
        openRanges.push({ start: s.startBlock, end: s.endBlock });
      }
    });

    // Block ranges: schedules ที่ปิดเฉพาะช่วง
    const blockRanges = schedules
      .filter((s) => !s.available && !s.noteOnly && s.startBlock !== null && s.endBlock !== null)
      .map((s) => ({ start: s.startBlock, end: s.endBlock }));

    return WORK_BLOCKS.filter((b) => {
      const isOpen = openRanges.some((r) => b.block >= r.start && b.block < r.end);
      if (!isOpen) return false;
      const isBlocked = blockRanges.some((r) => b.block >= r.start && b.block < r.end);
      return !isBlocked;
    });
  }, [form.roomId, form.date, roomSchedules, selectedRoom]);

  // ช่วงเวลาที่จะแสดงในตารางเลือกเวลา (effective open range รวม schedule ที่ต่อเวลา)
  const displayBlocks = useMemo(() => {
    const openB = selectedRoom?.openBlock ?? WORK_START_BLOCK;
    const closeB = selectedRoom?.closeBlock ?? WORK_END_BLOCK;
    let effStart = openB;
    let effEnd = closeB;
    if (form.roomId && form.date) {
      const schedules = roomSchedules.filter(
        (s) => s.roomId === form.roomId && (s.date === form.date || s.date === "")
      );
      schedules.forEach((s) => {
        if (s.available && !s.noteOnly && s.startBlock !== null && s.endBlock !== null) {
          if (s.startBlock < effStart) effStart = s.startBlock;
          if (s.endBlock > effEnd) effEnd = s.endBlock;
        }
      });
    }
    return WORK_BLOCKS.filter((b) => b.block >= effStart && b.block < effEnd);
  }, [form.roomId, form.date, roomSchedules, selectedRoom]);

  // ตรวจสอบ slot ที่เลือกชนกับคิวอื่น
  const hasConflict = useMemo(() => {
    if (form.timeBlock === null || activeDur === 0) return false;
    for (let i = 0; i < activeDur; i++) {
      if (occupiedBlocks.has(form.timeBlock + i)) return true;
    }
    return false;
  }, [form.timeBlock, activeDur, occupiedBlocks]);

  async function handleQuickPromoSave() {
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
    let newPromo;
    try {
      const submission = await runQuickPromoSave(() => onQuickAddPromo({
        name: trimmed,
        procedureId: qpProcedureId || "",
        price: parseInt(qpPrice) || 0,
        active: true,
      }));
      if (!submission.started) return;
      newPromo = submission.result;
    } catch (error) {
      console.error("Quick promo save failed:", error);
      showToast?.("error", "เพิ่มโปรไม่สำเร็จ ข้อมูลยังอยู่ครบ กรุณาลองอีกครั้ง");
      return;
    }
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
    // Goal 13: a cleared draft is abandoned, not retried — a stale request ID
    // left over from a failed attempt must not be reused for whatever the
    // operator types next (see fix/goal13-request-id-reset-on-cancel).
    onAbandonDraft?.();
    setForm(getEmptyBookingForm());
    setEditingQueueId(null);
  }

  // 5 รายการล่าสุดที่ account นี้เป็นคนบันทึก — ไว้เช็คว่าข้อมูลลงถูกมั้ยหลังกดบันทึก
  const myRecentQueues = useMemo(() => {
    if (!currentUser) return [];
    return queues
      .filter((q) => q.recordedBy === currentUser.id)
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [queues, currentUser]);

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

            {/* HN Lookup — full width row */}
            <div className="form-group full">
              <HnLookup
                phone={form.phone}
                name={form.name}
                onSelect={(c) => {
                  const fullName = `${c.firstname} ${c.lastname}`.trim();
                  setForm((f) => ({
                    ...f,
                    name: fullName || f.name,
                    phone: c.telephone || f.phone,
                    customerType: "old",
                  }));
                }}
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

            {/* ลงคิวรอ (Waiting Queue) */}
            {waitingQueueToggleAllowed && (
              <div className="form-group full">
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => f.status === "waiting_queue"
                      ? { ...f, status: "pending" }
                      : { ...f, status: "waiting_queue", roomId: "", timeBlock: null, durationBlocks: null }
                    );
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "10px 14px", borderRadius: "var(--radius-sm)",
                    border: `1.5px solid ${isWaitingQueueMode ? "#d97706" : "var(--border2)"}`,
                    background: isWaitingQueueMode ? "rgba(217,119,6,0.15)" : "var(--surface2)",
                    color: isWaitingQueueMode ? "#d97706" : "var(--text2)",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >
                  ⏳ ลงคิวรอ (Waiting Queue) — ยังไม่ระบุห้อง/เวลา
                </button>
                {isWaitingQueueMode && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#b45309", fontWeight: 600 }}>
                    จะไม่ระบุห้อง/เวลา — ไปที่หน้า "คิวรอ" เพื่อเรียกลูกค้าเข้ารับบริการเมื่อมีคิวว่าง
                  </div>
                )}
              </div>
            )}

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
            {!isWaitingQueueMode && (
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
                {scheduleNotes.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {scheduleNotes.map((note, idx) => (
                      <span key={`${note}_${idx}`} style={{ fontSize: 11, fontWeight: 700, color: "#b45309", lineHeight: 1.5, background: "#fef3c7", borderRadius: 5, padding: "3px 8px" }}>
                        📅 {note}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* หัตถการ + โปร */}
            <div className="form-group">
              <label className="form-label">หัตถการหลักที่สนใจ</label>
              <select
                value={form.procedureId}
                onChange={(e) => setForm((f) => ({ ...f, procedureId: e.target.value, promoId: "", price: "", durationBlocks: null, timeBlock: null }))}
              >
                <option value="">-- เลือกหัตถการ --</option>
                {filteredProcedures.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.blocks * 5} นาที)</option>
                ))}
              </select>
              {selectedRoom && (
                <span style={{ fontSize: 11, color: selectedRoom.type === "M" ? "var(--blue)" : "var(--green)", fontStyle: "italic", fontWeight: 600 }}>
                  {roomIsConfigured
                    ? `แสดงเฉพาะหัตถการที่ ${selectedRoom.name} รับ (${filteredProcedures.length} รายการ)`
                    : `แสดงเฉพาะหัตถการประเภท ${selectedRoom.type === "M" ? "M (ห้องหมอ)" : "T (ห้องเครื่อง/ทรีตเมนต์)"}`}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                โปร/แพ็กเกจที่เลือก
                {["superadmin", "head_admin"].includes(currentUser?.role) && (
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
                )}
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
                      {filteredProcedures.map((p) => (
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
                      disabled={!qpName.trim() || isQuickPromoSaving}
                    >
                      {isQuickPromoSaving ? "กำลังบันทึก..." : "บันทึก"}
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
                min={!editingQueueId ? getTodayStr() : undefined}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            {/* เลือกเวลา */}
            {!isWaitingQueueMode && (
            <div className="form-group full">
              <label className="form-label">
                เวลานัด (บล็อค 5 นาที)
                {selectedProcBlocks > 0 && (
                  <span style={{ fontWeight: 400, color: "var(--accent)", marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    • ใช้
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, durationBlocks: Math.max(1, (f.durationBlocks ?? selectedProcBlocks) - 1) }))}
                      style={{ padding: "1px 7px", borderRadius: 4, border: "1.5px solid var(--border2)", background: "var(--surface2)", cursor: "pointer", fontWeight: 800, fontSize: 14, lineHeight: 1 }}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{activeDur}</span>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, durationBlocks: (f.durationBlocks ?? selectedProcBlocks) + 1 }))}
                      style={{ padding: "1px 7px", borderRadius: 4, border: "1.5px solid var(--border2)", background: "var(--surface2)", cursor: "pointer", fontWeight: 800, fontSize: 14, lineHeight: 1 }}>+</button>
                    บล็อค ({activeDur * 5} นาที)
                    {form.durationBlocks !== null && form.durationBlocks !== selectedProcBlocks && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, durationBlocks: null }))}
                        style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "1.5px solid var(--border2)", background: "transparent", cursor: "pointer", color: "var(--text3)" }}>reset</button>
                    )}
                  </span>
                )}
              </label>
              {form.timeBlock !== null && activeDur > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: hasConflict ? "var(--red)" : "var(--green)" }}>
                    {hasConflict ? "⚠️ ชนกับคิวอื่น!" : `⏱ ${blockToTime(form.timeBlock)} — ${blockToTime(form.timeBlock + activeDur)}`}
                  </span>
                  {form.durationBlocks !== null && form.durationBlocks !== selectedProcBlocks && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--amber)", display: "flex", alignItems: "center", gap: 4 }}>
                      ⚡ ระยะเวลา override: {activeDur} บล็อค ({activeDur * 5} นาที) — ค่าปกติ {selectedProcBlocks} บล็อค ({selectedProcBlocks * 5} นาที)
                    </span>
                  )}
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
                {displayBlocks.map((b) => {
                  const isStart = form.timeBlock === b.block;
                  const isInRange = form.timeBlock !== null && activeDur > 0
                    && b.block > form.timeBlock && b.block < form.timeBlock + activeDur;
                  const isOccupied = occupiedBlocks.has(b.block);
                  const isClosed = !availableBlocks.find((ab) => ab.block === b.block);
                  const isDisabled = isOccupied || isClosed;
                  return (
                    <div
                      key={b.block}
                      className={`time-block ${isStart ? "selected" : ""} ${isInRange ? "in-range" : ""} ${isDisabled ? "disabled" : ""}`}
                      style={
                        isInRange
                          ? {}
                          : isOccupied && !isStart
                          ? { background: "#e8c5bb", borderColor: "#c8957e", color: "var(--accent)", opacity: 0.7 }
                          : isClosed
                          ? { background: "var(--surface3)", borderColor: "var(--border2)", color: "var(--text3)" }
                          : {}
                      }
                      title={isOccupied && !isStart ? "เวลานี้มีคิวแล้ว" : isClosed ? "ห้องปิด/ไม่พร้อม" : ""}
                      onClick={() => {
                        if (isOccupied && !isStart) {
                          showToast?.("error", `⚠️ ${b.time} มีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น`);
                          return;
                        }
                        if (!isDisabled) setForm((f) => ({ ...f, timeBlock: b.block }));
                      }}
                    >
                      {b.time}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

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
            <button className="btn btn-secondary" onClick={handleClear} disabled={isBookingSaving}>ล้างฟอร์ม</button>
            <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={isBookingSaving}>
              {editingQueueId ? "💾 บันทึกการแก้ไข" : "✅ บันทึกคิว"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Confirm Booking Popup ── */}
      {confirmOpen && (() => {
        const branch = branches.find((b) => b.id === form.branchId);
        const room = rooms.find((r) => r.id === form.roomId);
        const procedure = procedures.find((p) => p.id === form.procedureId);
        const promo = promos.find((p) => p.id === form.promoId);
        return createPortal(
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setConfirmOpen(false)}
          >
            <div
              style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", minWidth: 320, maxWidth: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.36)", width: "90%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, color: "var(--accent)" }}>✅ ยืนยันการบันทึกคิว</div>
              {isWaitingQueueMode && (
                <div style={{
                  marginBottom: 14, padding: "6px 12px", borderRadius: 20, display: "inline-flex",
                  fontSize: 12, fontWeight: 700, color: "#d97706", background: "rgba(217,119,6,0.15)",
                }}>
                  ⏳ คิวรอ (Waiting Queue) — ยังไม่ระบุห้อง/เวลา
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 20 }}>
                {[
                  ["👤 ชื่อ",        form.name || "—"],
                  ["📞 เบอร์",       form.phone || "—"],
                  ["🏢 สาขา",      branch?.name || "—"],
                  ["🚪 ห้อง",       room ? `[${room.type}] ${room.name}` : "—"],
                  ["📅 วันที่",     form.date || "—"],
                  ["⏰ เวลา",       form.timeBlock !== null
                    ? `${blockToTime(form.timeBlock)} — ${blockToTime(form.timeBlock + (form.durationBlocks ?? procedure?.blocks ?? 0))} (${(form.durationBlocks ?? procedure?.blocks ?? 0) * 5} นาที${form.durationBlocks !== null && form.durationBlocks !== procedure?.blocks ? " ⚡ override" : ""})`
                    : "—"],
                  ["💉 หัตถการ",  procedure?.name || "—"],
                  ["🏷️ โปร/แพ็ก",  promo?.name || "—"],
                  ["💰 ราคา",      form.price ? `฿${Number(form.price).toLocaleString()}` : "—"],
                  ["📝 Note",       form.note || "—"],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--text3)", minWidth: 90 }}>{label}</span>
                    <span style={{ fontWeight: value === "—" ? 400 : 600, color: value === "—" ? "var(--text3)" : "var(--text1)" }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)} disabled={isBookingSaving}>แก้ไข</button>
                <button
                  className="btn btn-primary"
                  disabled={isBookingSaving}
                  onClick={async () => {
                    const submission = await runBookingSubmit(() => onSubmit());
                    if (submission.started && submission.result) setConfirmOpen(false);
                  }}
                >
                  {isBookingSaving ? "กำลังบันทึก..." : editingQueueId ? "💾 ยืนยันแก้ไข" : "✅ ยืนยันบันทึก"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {currentUser && myRecentQueues.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3>🕘 รายการที่บันทึกล่าสุดของฉัน</h3>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myRecentQueues.map((q) => {
              const room = rooms.find((r) => r.id === q.roomId);
              const proc = procedures.find((p) => p.id === q.procedureId);
              return (
                <div
                  key={q.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
                    background: "var(--surface2)", fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "var(--text1)" }}>{q.name || "—"}</span>
                  <span style={{ color: "var(--text3)" }}>{proc?.name || "—"}</span>
                  <span style={{ color: "var(--text3)" }}>
                    {room ? `[${room.type}] ${room.name}` : "—"}
                  </span>
                  <span style={{ color: "var(--text3)" }}>
                    {q.date ? formatThaiDate(q.date) : "—"}
                    {q.timeBlock !== null && q.timeBlock !== undefined ? ` ${blockToTime(q.timeBlock)}` : ""}
                  </span>
                  {q.price ? (
                    <span style={{ color: "var(--text3)" }}>฿{Number(q.price).toLocaleString()}</span>
                  ) : null}
                  <span style={{ marginLeft: "auto" }}>
                    <StatusBadge status={q.status} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
