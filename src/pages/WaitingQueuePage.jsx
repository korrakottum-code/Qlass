import { useState, useMemo } from "react";
import { CUSTOMER_TYPES, QUEUE_STATUSES } from "../utils/constants";
import { formatThaiDate, getCustomerBadgeClass } from "../utils/helpers";

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

export default function WaitingQueuePage({
  queues, branches, procedures, staff,
  onCallIn, onUpdateStatus, onDelete,
}) {
  const [qfBranch, setQfBranch] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { queue }
  const [deleteInput, setDeleteInput] = useState("");

  const waitingQueues = useMemo(() => {
    return queues
      .filter((q) => (q.status || "pending") === "waiting_queue")
      .filter((q) => qfBranch === "all" || q.branchId === qfBranch)
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [queues, qfBranch]);

  return (
    <>
      {/* Filter bar */}
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">สาขา</label>
          <select value={qfBranch} onChange={(e) => setQfBranch(e.target.value)}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: "rgba(217,119,6,0.15)", border: "1.5px solid #d97706", color: "#d97706",
        }}>
          ⏳ คิวรอทั้งหมด
          <span style={{ background: "#d97706", color: "#fff", borderRadius: 10, padding: "0 5px", fontSize: 10, fontWeight: 800 }}>
            {waitingQueues.length}
          </span>
        </span>
      </div>

      {waitingQueues.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="e-icon">📭</div>
            <p>ยังไม่มีคิวรอในขณะนี้</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col style={{ width: 130 }} />
                <col style={{ width: 160 }} />
                {qfBranch === "all" && <col style={{ width: 110 }} />}
                <col style={{ width: 160 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>ลงคิวเมื่อ</th>
                  <th>ชื่อลูกค้า</th>
                  {qfBranch === "all" && <th style={{ whiteSpace: "nowrap" }}>สาขา</th>}
                  <th>หัตถการที่สนใจ</th>
                  <th style={{ whiteSpace: "nowrap" }}>ประเภท</th>
                  <th style={{ whiteSpace: "nowrap" }}>บันทึกโดย</th>
                  <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {waitingQueues.map((q) => {
                  const branch = branches.find((b) => b.id === q.branchId);
                  const proc = procedures.find((p) => p.id === q.procedureId);
                  const ct = CUSTOMER_TYPES.find((c) => c.value === q.customerType);
                  const recorder = staff?.find((s) => s.id === q.recordedBy);
                  const addedAt = q.createdAt ? new Date(q.createdAt) : null;
                  return (
                    <tr key={q.id}>
                      <td style={{ fontSize: 12 }}>
                        {addedAt ? (
                          <>
                            <div>{formatThaiDate(q.date)}</div>
                            <div style={{ fontFamily: "var(--mono)", color: "var(--text3)" }}>
                              {addedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </>
                        ) : "—"}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{q.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>{q.phone}</div>
                        {q.note && (
                          <div style={{ fontSize: 10, color: "var(--text3)", fontStyle: "italic", marginTop: 2 }}>
                            📝 {q.note}
                          </div>
                        )}
                      </td>
                      {qfBranch === "all" && (
                        <td style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>{branch?.name || "—"}</td>
                      )}
                      <td>{proc?.name || "—"}</td>
                      <td><span className={`badge ${getCustomerBadgeClass(q.customerType)}`}>{ct?.emoji} {ct?.label}</span></td>
                      <td style={{ fontSize: 12 }}>
                        {recorder ? (
                          <span style={{ fontWeight: 600, color: "var(--text2)" }}>
                            {recorder.nickname || recorder.name}
                          </span>
                        ) : <span style={{ color: "var(--text3)" }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            className="btn btn-sm btn-primary"
                            title="เรียกเข้ารับบริการ (เลือกห้อง/เวลา)"
                            onClick={() => onCallIn(q)}
                          >
                            📞 เรียกเข้า
                          </button>
                          <button
                            className="btn btn-sm"
                            title="เปลี่ยนสถานะ (เช่น มาแล้ว/เสร็จ, ยกเลิก) โดยไม่ต้องระบุห้อง"
                            onClick={() => onUpdateStatus(q)}
                            style={{ background: "var(--surface3)", border: "1.5px solid var(--border2)", borderRadius: 6, padding: "3px 8px", fontSize: 14, cursor: "pointer" }}
                          >
                            📋
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => { setDeleteConfirm({ queue: q }); setDeleteInput(""); }}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "24px 28px", minWidth: 320, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, color: "var(--red)" }}>🗑️ ยืนยันการลบคิวรอ</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
              พิมพ์ชื่อลูกค้า <strong style={{ color: "var(--text1)" }}>{deleteConfirm.queue.name}</strong> เพื่อยืนยัน
            </div>
            <input
              autoFocus
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && deleteInput.trim() === deleteConfirm.queue.name.trim()) {
                  onDelete(deleteConfirm.queue.id, deleteConfirm.queue);
                  setDeleteConfirm(null);
                }
              }}
              placeholder="พิมพ์ชื่อลูกค้า..."
              style={{ width: "100%", marginBottom: 14, fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>ยกเลิก</button>
              <button
                className="btn btn-danger"
                disabled={deleteInput.trim() !== deleteConfirm.queue.name.trim()}
                onClick={() => { onDelete(deleteConfirm.queue.id, deleteConfirm.queue); setDeleteConfirm(null); }}
              >ลบ</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
