import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { QUEUE_STATUSES } from "../../utils/constants";
import { blockToTime, formatThaiDate } from "../../utils/helpers";

// flow: pending → follow1/2/3 → confirmed → done | no_show
//       any → rescheduled | cancelled
const FOLLOW_NEXT = { pending: "follow1", follow1: "follow2", follow2: "follow3" };

export default function StatusModal({ queue, procedures, queues = [], onSave, onClose }) {
  const proc = procedures.find((p) => p.id === queue.procedureId);
  const currentStatus = queue.status || "pending";
  const [status, setStatus] = useState(currentStatus);
  const [newDate, setNewDate] = useState(queue.date || "");
  const [newTime, setNewTime] = useState(
    queue.timeBlock !== null ? blockToTime(queue.timeBlock) : ""
  );
  const [statusNote, setStatusNote] = useState(queue.statusNote || "");

  const nextFollow = FOLLOW_NEXT[currentStatus];

  function timeToBlock(str) {
    const [h, m] = str.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return queue.timeBlock;
    return h * 12 + Math.floor(m / 5);
  }

  const [conflictError, setConflictError] = useState("");

  function handleSave() {
    const payload = { status, statusNote: statusNote.trim() };
    if (status === "rescheduled") {
      const nb = newTime ? timeToBlock(newTime) : queue.timeBlock;
      const nd = newDate || queue.date;
      if (newDate) payload.date = nd;
      if (newTime) payload.timeBlock = nb;
      payload.status = "rescheduled";

      // ── conflict check ──
      if (nb !== null) {
        const proc = procedures.find((p) => p.id === queue.procedureId);
        const dur = proc?.blocks || 1;
        const conflict = queues.find((q) => {
          if (q.id === queue.id) return false;
          if (q.roomId !== queue.roomId) return false;
          if (q.date !== nd) return false;
          if (q.timeBlock === null) return false;
          const qDur = procedures.find((p) => p.id === q.procedureId)?.blocks || 1;
          return nb < q.timeBlock + qDur && q.timeBlock < nb + dur;
        });
        if (conflict) {
          setConflictError(`⚠️ เวลา ${blockToTime(nb)} ชนกับคิวของ ${conflict.name} (${blockToTime(conflict.timeBlock)})`);
          return;
        }
      }
      setConflictError("");
    }
    onSave(queue.id, payload);
  }

  const current = QUEUE_STATUSES.find((s) => s.value === currentStatus);

  // group action buttons
  const callActions = [
    nextFollow && QUEUE_STATUSES.find((s) => s.value === nextFollow),
  ].filter(Boolean);
  const mainActions = QUEUE_STATUSES.filter((s) =>
    ["confirmed", "rescheduled", "no_show", "cancelled", "done"].includes(s.value)
  );
  // rescheduled_in is set automatically, not selectable by user

  return (
    <>
      <ModalHeader title="📋 อัปเดตสถานะคิว" onClose={onClose} />
      <ModalBody>
        {/* Queue summary */}
        <div style={{
          padding: "10px 14px", borderRadius: "var(--radius-sm)",
          background: "var(--surface2)", border: "1.5px solid var(--border)",
          marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{queue.name}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{queue.phone}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
            <span>📅 {formatThaiDate(queue.date)}</span>
            {queue.timeBlock !== null && <span>⏰ {blockToTime(queue.timeBlock)}</span>}
            {proc && <span>💉 {proc.name}</span>}
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>สถานะปัจจุบัน:</span>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
              background: current?.bg, color: current?.color,
            }}>
              {current?.emoji} {current?.label}
            </span>
          </div>
        </div>

        {/* Action groups */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)", marginBottom: 8 }}>
            โทรไม่ติด
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {callActions.length > 0 ? callActions.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                style={{
                  padding: "8px 14px", borderRadius: "var(--radius-sm)", fontWeight: 600,
                  fontSize: 13, cursor: "pointer", border: "2px solid",
                  borderColor: status === s.value ? s.color : "var(--border2)",
                  background: status === s.value ? s.bg : "transparent",
                  color: status === s.value ? s.color : "var(--text2)",
                  transition: "all 0.12s",
                }}
              >
                {s.emoji} {s.label}
              </button>
            )) : (
              <span style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>
                โทรครบ 3 ครั้งแล้ว
              </span>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)", marginBottom: 8 }}>
            สถานะลูกค้า
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mainActions.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                style={{
                  padding: "8px 14px", borderRadius: "var(--radius-sm)", fontWeight: 600,
                  fontSize: 13, cursor: "pointer", border: "2px solid",
                  borderColor: status === s.value ? s.color : "var(--border2)",
                  background: status === s.value ? s.bg : "transparent",
                  color: status === s.value ? s.color : "var(--text2)",
                  transition: "all 0.12s",
                }}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reschedule fields */}
        {status === "rescheduled" && (
          <div style={{
            padding: "12px 14px", borderRadius: "var(--radius-sm)",
            background: "rgba(124,58,237,0.06)", border: "1.5px solid rgba(124,58,237,0.3)",
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginBottom: 10 }}>
              � วันและเวลาใหม่ที่เลื่อนไป
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}>
                <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 4 }}>วันที่ใหม่</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 100px" }}>
                <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 4 }}>เวลาใหม่</label>
                <input
                  type="time"
                  value={newTime}
                  step="300"
                  onChange={(e) => setNewTime(e.target.value)}
                  style={{ width: "100%", fontFamily: "var(--mono)" }}
                />
              </div>
            </div>
            {conflictError && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(220,38,38,0.1)", borderRadius: 6, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                {conflictError}
              </div>
            )}
          </div>
        )}

        {/* Note */}
        <div className="form-group">
          <label className="form-label">บันทึกเพิ่มเติม (ไม่บังคับ)</label>
          <input
            placeholder="เช่น ลูกค้าขอเลื่อนเพราะติดงาน / โทรไม่รับ 3 ครั้ง..."
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
          />
        </div>
      </ModalBody>
      <ModalFooter
        onClose={onClose}
        onSave={handleSave}
        saveLabel="บันทึกสถานะ"
        disabled={status === currentStatus && !statusNote.trim()}
      />
    </>
  );
}
