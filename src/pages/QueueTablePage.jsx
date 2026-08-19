import { useState, useMemo, useEffect } from "react";
import { CUSTOMER_TYPES, QUEUE_STATUSES, DAY_START_BLOCK, DAY_END_BLOCK } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass, isOverdueUnconfirmed } from "../utils/helpers";

const ALL_ROOMS_TAB = "__all__";
// คิวรอ (Waiting Queue) มีหน้าของตัวเองแล้ว — ไม่แสดงซ้ำในตารางนี้
const TABLE_STATUSES = QUEUE_STATUSES.filter((s) => s.value !== "waiting_queue");
// สถานะที่ยังถือว่า "ยังไม่ยืนยัน" — ปุ่ม "ย้ายเข้าคิวรอ" ใช้ได้เฉพาะกลุ่มนี้
const UNCONFIRMED_STATUSES = ["pending", "follow1", "follow2", "follow3"];

// ตัวเลือกเวลาสำหรับกรอง "ใครมีคิวตอน ... บ้าง" — ทุกครึ่งชั่วโมงตลอดวัน
const TIME_FILTER_OPTIONS = (() => {
  const opts = [];
  for (let b = DAY_START_BLOCK; b < DAY_END_BLOCK; b += 6) opts.push(b);
  return opts;
})();

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
  queues, branches, rooms, procedures, promos, staff, roomSchedules,
  onEdit, onDelete, onUpdateStatus, onMoveToWaitingQueue, onRangeNeeded,
}) {
  const [qfBranch, setQfBranch] = useState("all");
  const [qfDate, setQfDate] = useState(getTodayStr());
  // เลือกวันเก่ากว่า 30 วัน → ขอให้ App โหลดวันนั้น (วันในช่วงที่มีแล้วจะไม่ยิงอะไร)
  useEffect(() => { if (qfDate) onRangeNeeded?.(qfDate, qfDate); }, [qfDate, onRangeNeeded]);
  const [qfSearch, setQfSearch] = useState("");
  const [qfTimeBlock, setQfTimeBlock] = useState(""); // "" = ไม่กรองเวลา
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { queue }
  const [deleteInput, setDeleteInput] = useState("");
  const [moveConfirm, setMoveConfirm] = useState(null); // { queue }
  const [qfStatus, setQfStatus] = useState("all");
  const [qfRecordedBy, setQfRecordedBy] = useState("all");
  // แท็บห้องที่เลือกไว้ ต่อสาขา — ไม่มี key = "ทั้งหมด" (ทุกห้องรวมกัน)
  const [activeRoomTabByBranch, setActiveRoomTabByBranch] = useState({});
  // หุบ/ขยายแต่ละสาขา — ไม่ได้ตั้งไว้เอง = ใช้ค่า default (หุบถ้าโชว์หลายสาขาพร้อมกัน, ขยายถ้าเลือกสาขาเดียว)
  const [branchCollapseOverride, setBranchCollapseOverride] = useState({});

  const filteredQueues = useMemo(() => {
    return queues
      .filter((q) => {
        if ((q.status || "pending") === "waiting_queue") return false;
        if (qfBranch !== "all" && q.branchId !== qfBranch) return false;
        if (qfDate && q.date !== qfDate) return false;
        if (qfStatus !== "all" && (q.status || "pending") !== qfStatus) return false;
        if (qfRecordedBy !== "all" && q.recordedBy !== qfRecordedBy) return false;
        if (qfTimeBlock !== "") {
          if (q.timeBlock === null) return false;
          const proc = procedures.find((p) => p.id === q.procedureId);
          const dur = q.durationBlocks ?? proc?.blocks ?? 1;
          const tb = Number(qfTimeBlock);
          if (!(tb >= q.timeBlock && tb < q.timeBlock + dur)) return false;
        }
        if (qfSearch) {
          const s = qfSearch.toLowerCase();
          const recorder = staff?.find((x) => x.id === q.recordedBy);
          const recorderName = `${recorder?.nickname || ""} ${recorder?.name || ""}`.toLowerCase();
          if (
            !q.name.toLowerCase().includes(s) &&
            !q.phone.includes(s) &&
            !recorderName.includes(s)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => (a.timeBlock || 0) - (b.timeBlock || 0));
  }, [queues, qfBranch, qfDate, qfSearch, qfStatus, qfRecordedBy, qfTimeBlock, procedures, staff]);

  // สถิติสถานะ (สำหรับวันที่เลือก ทุกสาขา)
  const statusStats = useMemo(() => {
    const dayQueues = queues.filter((q) => (!qfDate || q.date === qfDate) && (qfBranch === "all" || q.branchId === qfBranch));
    const counts = {};
    dayQueues.forEach((q) => { const s = q.status || "pending"; counts[s] = (counts[s] || 0) + 1; });
    return counts;
  }, [queues, qfDate, qfBranch]);

  // คิวที่ลงล่วงหน้าแล้วยังไม่ยืนยันเมื่อเลย 12:00 ของวันนัด (สำหรับวันที่กำลังดูอยู่)
  // นับเฉพาะคิวที่มีห้อง ให้ตัวเลขตรงกับจำนวนแถวที่มีปุ่ม "ย้ายเข้าคิวรอ" จริง
  const overdueCount = useMemo(() => {
    if (qfDate !== getTodayStr()) return 0;
    return queues.filter((q) => (qfBranch === "all" || q.branchId === qfBranch) && q.roomId && isOverdueUnconfirmed(q)).length;
  }, [queues, qfDate, qfBranch]);

  const roomScheduleNotesByRoomId = useMemo(() => {
    const notesByRoomId = {};
    rooms.forEach((room) => {
      const exactNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && s.date === qfDate && s.note)
        .map((s) => s.note);

      const fallbackNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && !s.date && s.note)
        .map((s) => s.note);

      const notes = exactNotes.length > 0 ? exactNotes : fallbackNotes;
      if (notes.length > 0) notesByRoomId[room.id] = notes;
    });
    return notesByRoomId;
  }, [rooms, roomSchedules, qfDate]);

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
          <label className="form-label">เวลา</label>
          <select value={qfTimeBlock} onChange={(e) => setQfTimeBlock(e.target.value)}>
            <option value="">ทุกเวลา</option>
            {TIME_FILTER_OPTIONS.map((b) => (
              <option key={b} value={b}>{blockToTime(b)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">สถานะ</label>
          <select value={qfStatus} onChange={(e) => setQfStatus(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {TABLE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">บันทึกโดย</label>
          <select value={qfRecordedBy} onChange={(e) => setQfRecordedBy(e.target.value)} style={{ minWidth: 150 }}>
            <option value="all">ทุกคน</option>
            {[...(staff || [])]
              .slice()
              .sort((a, b) => (a.nickname || a.name || "").localeCompare(b.nickname || b.name || "", "th"))
              .map((s) => (
                <option key={s.id} value={s.id}>{s.nickname || s.name}</option>
              ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">ค้นหา</label>
          <input placeholder="ชื่อ / เบอร์โทร / แอดมิน..." value={qfSearch} onChange={(e) => setQfSearch(e.target.value)} />
        </div>
      </div>

      {/* Status summary chips */}
      {Object.keys(statusStats).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {TABLE_STATUSES.filter((s) => statusStats[s.value]).map((s) => (
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

      {overdueCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "8px 14px", borderRadius: "var(--radius-sm)",
          border: "1.5px solid #d97706", background: "rgba(217,119,6,0.12)",
          color: "#b45309", fontSize: 13, fontWeight: 700,
        }}>
          ⚠️ {overdueCount} คิวยังไม่ยืนยัน เลยเวลา 12:00 แล้ว — กด "➡️ ย้ายเข้าคิวรอ" เพื่อปล่อยเวลาให้ลงคิวอื่นได้
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
        groupedData.map(({ branchId, branchName, rooms: branchRooms }) => {
          const totalCount = branchRooms.reduce((sum, r) => sum + r.items.filter(q => q.status !== "rescheduled_in").length, 0);
          const activeTab = activeRoomTabByBranch[branchId] ?? ALL_ROOMS_TAB;
          const activeRoom = activeTab === ALL_ROOMS_TAB ? null : branchRooms.find((r) => r.roomId === activeTab);
          const showRoomCol = activeTab === ALL_ROOMS_TAB;
          const activeItems = showRoomCol
            ? branchRooms
                .flatMap((r) => r.items.map((q) => ({ ...q, __roomName: r.roomName })))
                .sort((a, b) => (a.timeBlock || 0) - (b.timeBlock || 0))
            : (activeRoom ? activeRoom.items : []);
          const roomScheduleNotes = activeRoom ? (roomScheduleNotesByRoomId[activeRoom.roomId] || []) : [];
          // ค่า default: หุบไว้ถ้าโชว์หลายสาขาพร้อมกัน (เช่นเลือก "ทุกสาขา"), ขยายไว้ถ้าเลือกสาขาเดียว — กดหัวข้อ toggle ได้เสมอ
          const isCollapsed = branchId in branchCollapseOverride
            ? branchCollapseOverride[branchId]
            : groupedData.length > 1;

          return (
          <div key={branchId} style={{ marginBottom: 20 }}>
            <div
              onClick={() => setBranchCollapseOverride((prev) => ({ ...prev, [branchId]: !isCollapsed }))}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 0 6px 2px", marginBottom: 8,
                borderBottom: "2px solid var(--accent)",
                cursor: "pointer", userSelect: "none",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text3)" }}>{isCollapsed ? "▸" : "▾"}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>🏢 {branchName}</span>
              <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, background: "var(--surface3)", borderRadius: 10, padding: "1px 8px", color: "var(--text3)" }}>
                {totalCount} คิว
              </span>
            </div>

            {!isCollapsed && (
            <>
            {/* แท็บห้อง — "ทั้งหมด" รวมทุกห้อง (ใช้คู่กับตัวกรองเวลาด้านบนเพื่อดูใครมีคิวตอนไหนบ้างโดยไม่ต้องไล่เปิดทีละห้อง) */}
            <div style={{
              display: "flex", gap: 2, overflowX: "auto",
              background: "var(--surface2)", borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              border: "1px solid var(--border)", borderBottom: "none",
            }}>
              <button
                type="button"
                onClick={() => setActiveRoomTabByBranch((prev) => ({ ...prev, [branchId]: ALL_ROOMS_TAB }))}
                style={{
                  flex: "none", border: "none", background: "transparent", cursor: "pointer",
                  fontFamily: "var(--font)", fontSize: 13, fontWeight: 700, padding: "9px 12px", whiteSpace: "nowrap",
                  color: activeTab === ALL_ROOMS_TAB ? "var(--accent)" : "var(--text3)",
                  borderBottom: `2.5px solid ${activeTab === ALL_ROOMS_TAB ? "var(--accent)" : "transparent"}`,
                }}
              >
                🗂️ ทั้งหมด
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginLeft: 5 }}>{totalCount}</span>
              </button>
              {branchRooms.map((r) => (
                <button
                  key={r.roomId}
                  type="button"
                  onClick={() => setActiveRoomTabByBranch((prev) => ({ ...prev, [branchId]: r.roomId }))}
                  style={{
                    flex: "none", border: "none", background: "transparent", cursor: "pointer",
                    fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, padding: "9px 12px", whiteSpace: "nowrap",
                    color: activeTab === r.roomId ? (r.roomType === "M" ? "var(--blue)" : "var(--green)") : "var(--text3)",
                    borderBottom: `2.5px solid ${activeTab === r.roomId ? (r.roomType === "M" ? "var(--blue)" : "var(--green)") : "transparent"}`,
                  }}
                >
                  🚪 {r.roomName}
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginLeft: 5 }}>
                    {r.items.filter(q => q.status !== "rescheduled_in").length}
                  </span>
                </button>
              ))}
            </div>

            <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
              {roomScheduleNotes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                  {roomScheduleNotes.map((note, idx) => (
                    <span key={`${note}_${idx}`} style={{ fontSize: 11, fontWeight: 700, color: "#b45309", lineHeight: 1.5, background: "#fef3c7", borderRadius: 6, padding: "2px 8px" }}>
                      📅 {note}
                    </span>
                  ))}
                </div>
              )}
              {activeItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text3)", fontSize: 13 }}>
                  ไม่มีคิวตรงเงื่อนไขในตอนนี้
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
                    <colgroup>
                      <col style={{ width: 70 }} />
                      {showRoomCol && <col style={{ width: 110 }} />}
                      <col style={{ width: 160 }} />
                      <col style={{ width: 140 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 132 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ whiteSpace: "nowrap" }}>เวลา</th>
                        {showRoomCol && <th style={{ whiteSpace: "nowrap" }}>ห้อง</th>}
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
                      {activeItems.map((q) => {
                        const proc = procedures.find((p) => p.id === q.procedureId);
                        const promo = promos.find((p) => p.id === q.promoId);
                        const ct = CUSTOMER_TYPES.find((c) => c.value === q.customerType);
                        const qStatus = q.status || "pending";
                        const isDone = qStatus === "done";
                        const isCancelled = ["cancelled", "no_show"].includes(qStatus);
                        const isOverdue = isOverdueUnconfirmed(q);
                        return (
                          <tr key={q.id} style={{
                            opacity: isCancelled ? 0.5 : 1,
                            background: isOverdue ? "rgba(217,119,6,0.06)" : isDone ? "rgba(5,150,105,0.04)" : undefined,
                            borderLeft: isOverdue ? "3px solid #d97706" : undefined,
                          }}>
                            <td style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13 }}>
                              {q.timeBlock !== null ? (
                                <>
                                  {blockToTime(q.timeBlock)}
                                  {proc && <div style={{ fontSize: 10, color: "var(--text3)" }}>–{blockToTime(q.timeBlock + (q.durationBlocks ?? proc.blocks))}</div>}
                                </>
                              ) : "—"}
                            </td>
                            {showRoomCol && (
                              <td style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>{q.__roomName}</td>
                            )}
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
                            <td>
                              <StatusBadge status={q.status} />
                              {isOverdue && (
                                <div style={{
                                  marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "1px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                                  background: "rgba(217,119,6,0.15)", color: "#b45309", whiteSpace: "nowrap",
                                }}>
                                  ⚠️ เลยเวลายืนยัน
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch" }}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    className="btn btn-sm"
                                    title="อัปเดตสถานะคิว"
                                    onClick={() => onUpdateStatus(q)}
                                    style={{ flex: 1, background: "var(--surface3)", border: "1.5px solid var(--border2)", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                                  >
                                    📋 สถานะ
                                  </button>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    title="แก้ไขข้อมูลคิว"
                                    onClick={() => onEdit(q)}
                                    style={{ flex: 1, fontSize: 11, whiteSpace: "nowrap" }}
                                  >
                                    ✏️ แก้ไข
                                  </button>
                                </div>
                                {UNCONFIRMED_STATUSES.includes(qStatus) && q.roomId && (
                                  <button
                                    className="btn btn-sm"
                                    title="ย้ายเข้าคิวรอ — ปล่อยห้อง/เวลานี้ให้ลงคิวอื่นได้"
                                    onClick={() => setMoveConfirm({ queue: q })}
                                    style={{ background: "rgba(217,119,6,0.12)", border: "1.5px solid #d97706", color: "#b45309", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                  >
                                    ➡️ ย้ายเข้าคิวรอ
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-danger"
                                  title="ลบคิว"
                                  onClick={() => { setDeleteConfirm({ queue: q }); setDeleteInput(""); }}
                                  style={{ fontSize: 11, whiteSpace: "nowrap" }}
                                >
                                  🗑️ ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </>
            )}
          </div>
          );
        })
      )}

      <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "right", marginTop: 8 }}>
        แสดง {filteredQueues.length} คิว • {formatThaiDate(qfDate)}
      </div>

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "24px 28px", minWidth: "min(320px, calc(100vw - 32px))", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, color: "var(--red)" }}>🗑️ ยืนยันการลบคิว</div>
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
      {/* ── Move-to-Waiting-Queue Confirm Modal ── */}
      {moveConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setMoveConfirm(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "24px 28px", minWidth: "min(320px, calc(100vw - 32px))", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, color: "#b45309" }}>➡️ ย้ายเข้าคิวรอ</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
              ย้าย <strong style={{ color: "var(--text1)" }}>{moveConfirm.queue.name}</strong> เข้าคิวรอ — ห้อง/เวลาเดิมจะถูกปล่อยว่างให้ลงคิวอื่นได้ทันที (ข้อมูลห้อง/เวลาเดิมจะถูกเก็บไว้ในหมายเหตุแทน)
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setMoveConfirm(null)}>ยกเลิก</button>
              <button
                className="btn btn-primary"
                style={{ background: "#d97706", borderColor: "#d97706" }}
                onClick={() => { onMoveToWaitingQueue(moveConfirm.queue); setMoveConfirm(null); }}
              >
                ➡️ ย้ายเข้าคิวรอ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
