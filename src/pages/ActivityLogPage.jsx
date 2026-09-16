import { useState, useEffect } from "react";
import { fetchActivityLogs } from "../utils/supabaseService";
import { blockToTime, formatThaiDate, getTodayStr, isoToLocalDateStr } from "../utils/helpers";

const ACTION_LABELS = {
  delete_queue: { emoji: "📋", label: "ลบคิว" },
  delete_promo: { emoji: "🏷️", label: "ลบโปร" },
  delete_room: { emoji: "🚪", label: "ลบห้อง" },
};

// คิวมีรายละเอียดเยอะกว่าโปร/ห้อง (ชื่อ+เบอร์+วันนัด+เวลา+ห้อง) แยกออกมาเป็นชิ้นเดียว
// ให้คอลัมน์ "รายละเอียด" อ่านง่าย ไม่ต้องมีคอลัมน์แยกเฉพาะของคิวปนอยู่กับแถวโปร/ห้อง
function QueueDeletionDetail({ d, rooms }) {
  const room = rooms?.find((r) => r.id === d?.roomId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontWeight: 700 }}>{d?.name || "—"}</div>
      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{d?.phone || "—"}</div>
      <div style={{ fontSize: 11, color: "var(--text3)" }}>
        {d?.date ? formatThaiDate(d.date) : "—"}
        {d?.timeBlock != null && ` · ${blockToTime(d.timeBlock)}`}
        {room && ` · [${room.type}] ${room.name}`}
      </div>
    </div>
  );
}

export default function ActivityLogPage({ rooms }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(getTodayStr());

  useEffect(() => {
    setLoading(true);
    fetchActivityLogs({ limit: 200, date: filterDate || null })
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [filterDate]);

  // คอลัมน์ detail เป็น jsonb ฝั่ง Supabase-js จึงส่งกลับมาเป็น object ที่แกะให้แล้ว
  // ไม่ใช่ string — เดิมโค้ดนี้ JSON.parse(object) ซึ่ง throw เสมอ แล้วโดน catch กลืนไว้
  // ผลคือรายละเอียดทุกแถว (ชื่อ/เบอร์/วันที่/ห้อง) ขึ้น "—" มาตลอดทั้งที่ข้อมูลมีจริง
  // (ตรวจกับของจริง 3,062 แถวยืนยันแล้ว) รองรับทั้งสองแบบไว้เผื่อมีแถวเก่าที่เคย
  // ถูกเขียนเป็น string มาก่อน
  function getDetail(log) {
    if (!log.detail) return null;
    if (typeof log.detail === "object") return log.detail;
    try { return JSON.parse(log.detail); } catch { return null; }
  }

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* เดิมชื่อ "ประวัติการลบคิว" เพราะแต่ก่อนบันทึกแค่การลบคิวอย่างเดียว ตอนนี้บันทึก
            การลบโปร/ห้องด้วย (ดู deletePromo/deleteRoom ใน App.jsx) เปลี่ยนชื่อให้ครอบคลุม */}
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🔍 ประวัติการลบ</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>วันที่ลบ</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border2)", fontSize: 13, background: "var(--surface)", color: "var(--text1)", outline: "none" }}
          />
          <button
            onClick={() => setFilterDate(getTodayStr())}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border2)", background: filterDate === getTodayStr() ? "var(--accent)" : "var(--surface2)", color: filterDate === getTodayStr() ? "#fff" : "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            วันนี้
          </button>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{logs.length} รายการ</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>กำลังโหลด...</div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty"><div className="e-icon">📭</div><p>ยังไม่มีประวัติการลบ</p></div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border2)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>วันเวลาที่ลบ</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>ประเภท</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>รายละเอียด</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>ลบโดย</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const d = getDetail(log);
                const deletedAt = log.createdAt ? new Date(log.createdAt) : null;
                const action = ACTION_LABELS[log.action] || { emoji: "🗑️", label: log.action };
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--mono)", color: "var(--text2)", whiteSpace: "nowrap" }}>
                      {deletedAt
                        ? `${formatThaiDate(isoToLocalDateStr(deletedAt))} ${deletedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`
                        : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap" }}>{action.emoji} {action.label}</td>
                    <td style={{ padding: "8px 12px", fontSize: 13 }}>
                      {log.targetType === "queue" ? (
                        <QueueDeletionDetail d={d} rooms={rooms} />
                      ) : log.targetType === "promo" ? (
                        <>
                          <div style={{ fontWeight: 700 }}>{d?.name || "—"}</div>
                          {d?.price != null && <div style={{ fontSize: 11, color: "var(--text3)" }}>฿{Number(d.price).toLocaleString()}</div>}
                        </>
                      ) : log.targetType === "room" ? (
                        <div style={{ fontWeight: 700 }}>{d?.type ? `[${d.type}] ` : ""}{d?.name || "—"}</div>
                      ) : (
                        <span style={{ color: "var(--text3)" }}>{JSON.stringify(d) || "—"}</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                      {log.performedByName || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </>
  );
}
