import { useState, useMemo } from "react";
import { CUSTOMER_TYPES, QUEUE_STATUSES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass } from "../utils/helpers";

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

export default function QueueTablePage({
  queues, branches, rooms, procedures, promos, staff,
  onEdit, onDelete, onUpdateStatus,
}) {
  const [qfBranch, setQfBranch] = useState("all");
  const [qfDate, setQfDate] = useState(getTodayStr());
  const [qfSearch, setQfSearch] = useState("");
  const [qfStatus, setQfStatus] = useState("all");

  const filteredQueues = useMemo(() => {
    return queues
      .filter((q) => {
        if (qfBranch !== "all" && q.branchId !== qfBranch) return false;
        if (qfDate && q.date !== qfDate) return false;
        if (qfStatus !== "all" && (q.status || "pending") !== qfStatus) return false;
        if (qfSearch) {
          const s = qfSearch.toLowerCase();
          if (!q.name.toLowerCase().includes(s) && !q.phone.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.timeBlock || 0) - (b.timeBlock || 0));
  }, [queues, qfBranch, qfDate, qfSearch, qfStatus]);

  // สถิติสถานะ (สำหรับวันที่เลือก ทุกสาขา)
  const statusStats = useMemo(() => {
    const dayQueues = queues.filter((q) => (!qfDate || q.date === qfDate) && (qfBranch === "all" || q.branchId === qfBranch));
    const counts = {};
    dayQueues.forEach((q) => { const s = q.status || "pending"; counts[s] = (counts[s] || 0) + 1; });
    return counts;
  }, [queues, qfDate, qfBranch]);

  // จัดกลุ่ม: สาขา → ห้อง → คิว
  const groupedData = useMemo(() => {
    const branchMap = {};
    filteredQueues.forEach((q) => {
      const bId = q.branchId || "__none__";
      const branch = branches.find((b) => b.id === bId);
      if (!branchMap[bId]) branchMap[bId] = { branchId: bId, branchName: branch?.name || "ไม่ระบุสาขา", rooms: {} };
      const rId = q.roomId || "__none__";
      const room = rooms.find((r) => r.id === rId);
      if (!branchMap[bId].rooms[rId]) branchMap[bId].rooms[rId] = { roomId: rId, roomName: room?.name || "ไม่ระบุห้อง", roomType: room?.type || null, items: [] };
      branchMap[bId].rooms[rId].items.push(q);
    });
    return branches.filter((b) => branchMap[b.id]).map((b) => ({ ...branchMap[b.id], rooms: Object.values(branchMap[b.id].rooms) }));
  }, [filteredQueues, branches, rooms]);

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
        <div className="form-group">
          <label className="form-label">วันที่</label>
          <input type="date" value={qfDate} onChange={(e) => setQfDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">สถานะ</label>
          <select value={qfStatus} onChange={(e) => setQfStatus(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {QUEUE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">ค้นหา</label>
          <input placeholder="ชื่อ / เบอร์โทร..." value={qfSearch} onChange={(e) => setQfSearch(e.target.value)} />
        </div>
      </div>

      {/* Status summary chips */}
      {Object.keys(statusStats).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {QUEUE_STATUSES.filter((s) => statusStats[s.value]).map((s) => (
            <button
              key={s.value}
              onClick={() => setQfStatus(qfStatus === s.value ? "all" : s.value)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: qfStatus === s.value ? s.bg : "var(--surface2)",
                border: `1.5px solid ${qfStatus === s.value ? s.color : "var(--border)"}`,
                color: qfStatus === s.value ? s.color : "var(--text2)",
                cursor: "pointer",
              }}
            >
              {s.emoji} {s.label}
              <span style={{
                background: s.color, color: "#fff", borderRadius: 10,
                padding: "0 5px", fontSize: 10, fontWeight: 800,
              }}>
                {statusStats[s.value]}
              </span>
            </button>
          ))}
        </div>
      )}

      {filteredQueues.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="e-icon">📭</div>
            <p>ยังไม่มีคิว — ไปบันทึกคิวก่อนเลย!</p>
          </div>
        </div>
      ) : (
        groupedData.map(({ branchId, branchName, rooms: branchRooms }) => (
          <div key={branchId} style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0 6px 2px", marginBottom: 8,
              borderBottom: "2px solid var(--accent)",
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>🏢 {branchName}</span>
              <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, background: "var(--surface3)", borderRadius: 10, padding: "1px 8px", color: "var(--text3)" }}>
                {branchRooms.reduce((sum, r) => sum + r.items.length, 0)} คิว
              </span>
            </div>

            {branchRooms.map(({ roomId, roomName, roomType, items }) => (
              <div className="card" key={roomId} style={{ marginBottom: 10 }}>
                <div className="card-header">
                  <h3 style={{ color: roomType === "M" ? "var(--blue)" : roomType === "T" ? "var(--green)" : undefined, fontFamily: "var(--mono)" }}>
                    🚪 {roomName}
                    {roomType && (
                      <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 8, background: roomType === "M" ? "var(--blue-soft)" : "var(--green-soft)", color: roomType === "M" ? "var(--blue)" : "var(--green)", padding: "2px 8px", borderRadius: 10, fontFamily: "var(--body)" }}>
                        {roomType === "M" ? "ห้องหมอ" : "ห้องเครื่อง"}
                      </span>
                    )}
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>{items.length} คิว</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
                    <colgroup>
                      <col style={{ width: 70 }} />
                      <col style={{ width: 160 }} />
                      <col style={{ width: 140 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 90 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ whiteSpace: "nowrap" }}>เวลา</th>
                        <th>ชื่อลูกค้า</th>
                        <th>หัตถการ</th>
                        <th style={{ whiteSpace: "nowrap" }}>ราคา</th>
                        <th style={{ whiteSpace: "nowrap" }}>ประเภท</th>
                        <th style={{ whiteSpace: "nowrap" }}>บันทึกโดย</th>
                        <th style={{ whiteSpace: "nowrap" }}>สถานะ</th>
                        <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((q) => {
                        const proc = procedures.find((p) => p.id === q.procedureId);
                        const promo = promos.find((p) => p.id === q.promoId);
                        const ct = CUSTOMER_TYPES.find((c) => c.value === q.customerType);
                        const qStatus = q.status || "pending";
                        const isDone = qStatus === "done";
                        const isCancelled = ["cancelled", "no_show"].includes(qStatus);
                        return (
                          <tr key={q.id} style={{ opacity: isCancelled ? 0.5 : 1, background: isDone ? "rgba(5,150,105,0.04)" : undefined }}>
                            <td style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13 }}>
                              {q.timeBlock !== null ? (
                                <>
                                  {blockToTime(q.timeBlock)}
                                  {proc && <div style={{ fontSize: 10, color: "var(--text3)" }}>–{blockToTime(q.timeBlock + proc.blocks)}</div>}
                                </>
                              ) : "—"}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{q.name}</div>
                              <div style={{ fontSize: 11, color: "var(--text3)" }}>{q.phone}</div>
                              {q.statusNote && (
                                <div style={{ fontSize: 10, color: "var(--text3)", fontStyle: "italic", marginTop: 2 }}>
                                  💬 {q.statusNote}
                                </div>
                              )}
                            </td>
                            <td>
                              <div>{proc?.name || "—"}</div>
                              {promo && <div style={{ fontSize: 11, color: "var(--text3)" }}>{promo.name}</div>}
                            </td>
                            <td style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--accent)" }}>
                              {q.price ? `฿${Number(q.price).toLocaleString()}` : "—"}
                            </td>
                            <td><span className={`badge ${getCustomerBadgeClass(q.customerType)}`}>{ct?.emoji} {ct?.label}</span></td>
                            <td style={{ fontSize: 12 }}>
                              {(() => {
                                const recorder = staff?.find((s) => s.id === q.recordedBy);
                                return recorder ? (
                                  <span style={{ fontWeight: 600, color: "var(--text2)" }}>
                                    {recorder.nickname || recorder.name}
                                  </span>
                                ) : <span style={{ color: "var(--text3)" }}>—</span>;
                              })()}
                            </td>
                            <td><StatusBadge status={q.status} /></td>
                            <td>
                              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                <button
                                  className="btn btn-sm"
                                  title="อัปเดตสถานะ"
                                  onClick={() => onUpdateStatus(q)}
                                  style={{ background: "var(--surface3)", border: "1.5px solid var(--border2)", borderRadius: 6, padding: "3px 8px", fontSize: 14, cursor: "pointer" }}
                                >
                                  📋
                                </button>
                                <button className="btn btn-sm btn-secondary" onClick={() => onEdit(q)}>✏️</button>
                                <button className="btn btn-sm btn-danger" onClick={() => onDelete(q.id)}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "right", marginTop: 8 }}>
        แสดง {filteredQueues.length} คิว • {formatThaiDate(qfDate)}
      </div>
    </>
  );
}
