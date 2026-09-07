import { useState, useMemo, useEffect } from "react";
import { CUSTOMER_TYPES, QUEUE_STATUSES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, getCustomerBadgeClass, isOverdueUnconfirmed } from "../utils/helpers";
import { pickDatePresets, daySpan } from "../utils/datePresets";

const ALL_ROOMS_TAB = "__all__";
// คิวรอ (Waiting Queue) มีหน้าของตัวเองแล้ว — ไม่แสดงซ้ำในตารางนี้
const TABLE_STATUSES = QUEUE_STATUSES.filter((s) => s.value !== "waiting_queue");
// สถานะที่ยังถือว่า "ยังไม่ยืนยัน" — ปุ่ม "ย้ายเข้าคิวรอ" ใช้ได้เฉพาะกลุ่มนี้
const UNCONFIRMED_STATUSES = ["pending", "follow1", "follow2", "follow3"];

// ปุ่มลัดช่วงวันที่ของหน้านี้ — ตัด "ไตรมาสนี้/ปีนี้" ที่หน้า Export มีออก
// เพราะตารางนี้ render ทุกแถวจริง ไม่ได้สรุปยอด เลือกทั้งปี = หลายหมื่นแถวในหน้าเดียว
const PRESET_KEYS = ["today", "tomorrow", "yesterday", "last7", "thisWeek", "monthToYesterday", "thisMonth", "lastMonth"];
// เกินกี่วันแล้วบังคับให้เลือกสาขา — ทุกสาขา 1 เดือนคือหลายพันแถว หน้าค้างแน่
const MAX_DAYS_ALL_BRANCHES = 7;
// เกินกี่แถวแล้วขึ้นเตือนให้แคบช่วงลง (เตือนอย่างเดียว ไม่ตัดข้อมูลทิ้ง)
const HEAVY_ROW_WARNING = 1500;

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

// ตารางคิว 1 ชุด — ใช้ทั้งโหมดวันเดียว (แยกตามแท็บห้อง) และโหมดหลายวัน (แยกตามวัน)
function QueueDataTable({
  items, showRoomCol, procedures, promos, staff,
  onUpdateStatus, onEdit, onAskMove, onAskDelete,
}) {
  return (
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
          {items.map((q) => {
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
                        onClick={() => onAskMove(q)}
                        style={{ background: "rgba(217,119,6,0.12)", border: "1.5px solid #d97706", color: "#b45309", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        ➡️ ย้ายเข้าคิวรอ
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-danger"
                      title="ลบคิว"
                      onClick={() => onAskDelete(q)}
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
  );
}

export default function QueueTablePage({
  queues, branches, rooms, procedures, promos, staff, roomSchedules,
  onEdit, onDelete, onUpdateStatus, onMoveToWaitingQueue, onRangeNeeded,
}) {
  const [qfBranch, setQfBranch] = useState("all");
  // ช่วงวันที่ — ค่าเริ่มต้นคือ "วันนี้" ทั้งคู่ (จาก=ถึง) เพื่อให้คนที่เปิดดูทุกวันเห็นเหมือนเดิมทุกอย่าง
  const [qfFrom, setQfFrom] = useState(getTodayStr());
  const [qfTo, setQfTo] = useState(getTodayStr());
  const [qfSearch, setQfSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { queue }
  const [deleteInput, setDeleteInput] = useState("");
  const [moveConfirm, setMoveConfirm] = useState(null); // { queue }
  const [qfStatus, setQfStatus] = useState("all");
  const [qfRecordedBy, setQfRecordedBy] = useState("all");
  // แท็บห้องที่เลือกไว้ ต่อสาขา — ไม่มี key = "ทั้งหมด" (ทุกห้องรวมกัน)
  const [activeRoomTabByBranch, setActiveRoomTabByBranch] = useState({});
  // หุบ/ขยายแต่ละสาขา — ไม่ได้ตั้งไว้เอง = ใช้ค่า default (หุบถ้าโชว์หลายสาขาพร้อมกัน, ขยายถ้าเลือกสาขาเดียว)
  const [branchCollapseOverride, setBranchCollapseOverride] = useState({});
  // วันที่เปิดอยู่ในโหมดหลายวัน — key = "branchId|date" — ไม่มีใน object = หุบ
  // หุบไว้ก่อนเสมอ: เลือกทั้งเดือนแล้วกางทุกวันคือคิวพันกว่าแถวใน DOM เดียว หน้าจะหน่วงทันที
  const [openDays, setOpenDays] = useState({});

  const presets = useMemo(() => pickDatePresets(PRESET_KEYS), []);

  // ช่อง date ที่ถูกล้างจะส่ง "" มาได้ และผู้ใช้อาจใส่ "จาก" หลัง "ถึง" — จัดให้เรียบร้อยที่จุดเดียว
  const [rangeStart, rangeEnd] = useMemo(() => {
    const a = qfFrom || qfTo || getTodayStr();
    const b = qfTo || qfFrom || getTodayStr();
    return a <= b ? [a, b] : [b, a];
  }, [qfFrom, qfTo]);

  // ช่วงลัดหลายอันให้ผลเท่ากันได้ (เช่นวันจันทร์ "วันนี้" = "สัปดาห์นี้") — เอาอันบนสุดอันเดียว
  // ไม่งั้น dropdown จะเลือกค้างสองค่าพร้อมกัน
  const activePresetKey = presets.find((p) => p.start === qfFrom && p.end === qfTo)?.key ?? null;

  const spanDays = daySpan(rangeStart, rangeEnd);
  const isRange = spanDays > 1;
  // ทุกสาขาหลายสัปดาห์ = คิวหลายพันแถวใน DOM เดียว — กันไว้ก่อนถึงจะช้าจนกดอะไรไม่ได้
  // แต่ถ้าสิทธิ์ของคนนี้เห็นสาขาเดียวอยู่แล้ว (ผจก.สาขา/แคชเชีย) "ทุกสาขา" ก็คือสาขาเดียว
  // — อย่าดีดให้ไปเลือกสาขาจาก dropdown ที่มีตัวเลือกเดียว
  const branchesInView = qfBranch === "all" ? branches.length : 1;
  const needsBranch = spanDays > MAX_DAYS_ALL_BRANCHES && branchesInView > 1;

  // เลือกวันเก่ากว่า 30 วัน → ขอให้ App โหลดช่วงนั้น (ช่วงที่มีอยู่แล้วจะไม่ยิงอะไร)
  useEffect(() => { onRangeNeeded?.(rangeStart, rangeEnd); }, [rangeStart, rangeEnd, onRangeNeeded]);

  function applyPreset(p) {
    setQfFrom(p.start);
    setQfTo(p.end);
  }

  // อยู่โหมดวันเดียวแล้วเปลี่ยน "จากวันที่" = ตั้งใจดูอีกวันเดียว ไม่ใช่เปิดช่วง — ลาก "ถึงวันที่" ตามไปด้วย
  // (คนที่เปิดดูรายวันจะได้แก้ช่องเดียวเหมือนเดิม ไม่ต้องแก้สองช่อง)
  // ลบจนช่องว่าง = ไม่ได้ตั้งใจดู "ช่วงว่าง" — ยุบเป็นวันเดียวเท่ากับอีกช่อง
  // ไม่งั้นช่องจะว่างแต่ตารางยังโชว์ข้อมูลของอีกช่องอยู่ คนใช้อ่านแล้วไม่รู้ว่าดูวันไหนอยู่
  function changeFrom(v) {
    if (!v) { setQfFrom(qfTo); return; }
    const wasSingleDay = qfFrom === qfTo;
    setQfFrom(v);
    if (wasSingleDay || (qfTo && v > qfTo)) setQfTo(v);
  }

  function changeTo(v) {
    if (!v) { setQfTo(qfFrom); return; }
    setQfTo(v);
    if (qfFrom && v < qfFrom) setQfFrom(v);
  }

  const filteredQueues = useMemo(() => {
    if (needsBranch) return [];
    return queues
      .filter((q) => {
        if ((q.status || "pending") === "waiting_queue") return false;
        if (qfBranch !== "all" && q.branchId !== qfBranch) return false;
        if (!q.date || q.date < rangeStart || q.date > rangeEnd) return false;
        if (qfStatus !== "all" && (q.status || "pending") !== qfStatus) return false;
        if (qfRecordedBy !== "all" && q.recordedBy !== qfRecordedBy) return false;
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
      // เรียงตามวันก่อน แล้วค่อยเวลา — ไม่งั้นดูหลายวันแล้ว 11:00 ของทุกวันจะมากองรวมกัน
      .sort((a, b) => (a.date === b.date ? (a.timeBlock || 0) - (b.timeBlock || 0) : a.date.localeCompare(b.date)));
  }, [queues, qfBranch, rangeStart, rangeEnd, qfSearch, qfStatus, qfRecordedBy, staff, needsBranch]);

  // สถิติสถานะ (สำหรับช่วงที่เลือก ทุกสาขา)
  const statusStats = useMemo(() => {
    if (needsBranch) return {};
    const counts = {};
    queues.forEach((q) => {
      if (!q.date || q.date < rangeStart || q.date > rangeEnd) return;
      if (qfBranch !== "all" && q.branchId !== qfBranch) return;
      const s = q.status || "pending";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [queues, rangeStart, rangeEnd, qfBranch, needsBranch]);

  // คิวที่ลงล่วงหน้าแล้วยังไม่ยืนยันเมื่อเลย 12:00 ของวันนัด
  // นับเฉพาะคิวที่มีห้อง ให้ตัวเลขตรงกับจำนวนแถวที่มีปุ่ม "ย้ายเข้าคิวรอ" จริง
  // isOverdueUnconfirmed เช็ควันนี้ให้อยู่แล้ว — แบนเนอร์จึงขึ้นเฉพาะตอนช่วงที่ดูอยู่คลุมวันนี้
  const overdueCount = useMemo(() => {
    const today = getTodayStr();
    if (needsBranch || today < rangeStart || today > rangeEnd) return 0;
    return queues.filter((q) => (qfBranch === "all" || q.branchId === qfBranch) && q.roomId && isOverdueUnconfirmed(q)).length;
  }, [queues, qfBranch, rangeStart, rangeEnd, needsBranch]);

  // หมายเหตุตารางห้อง — ผูกกับวันเดียว จึงใช้เฉพาะโหมดวันเดียว
  const roomScheduleNotesByRoomId = useMemo(() => {
    const notesByRoomId = {};
    rooms.forEach((room) => {
      const exactNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && s.date === rangeStart && s.note)
        .map((s) => s.note);

      const fallbackNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && !s.date && s.note)
        .map((s) => s.note);

      const notes = exactNotes.length > 0 ? exactNotes : fallbackNotes;
      if (notes.length > 0) notesByRoomId[room.id] = notes;
    });
    return notesByRoomId;
  }, [rooms, roomSchedules, rangeStart]);

  // จัดกลุ่ม: สาขา → ห้อง (โหมดวันเดียว) และ สาขา → วัน (โหมดหลายวัน)
  // แท็บห้องใช้ข้ามวันไม่ได้ เพราะคิว 11:00 ของคนละวันจะไปกองรวมกันในแท็บเดียว
  const groupedData = useMemo(() => {
    const branchMap = {};
    filteredQueues.forEach((q) => {
      const bId = q.branchId || "__none__";
      const branch = branches.find((b) => b.id === bId);
      if (!branchMap[bId]) branchMap[bId] = { branchId: bId, branchName: branch?.name || "ไม่ระบุสาขา", rooms: {}, days: {} };
      const rId = q.roomId || "__none__";
      const room = rooms.find((r) => r.id === rId);
      const roomName = room?.name || "ไม่ระบุห้อง";
      const item = { ...q, __roomName: roomName };
      if (!branchMap[bId].rooms[rId]) branchMap[bId].rooms[rId] = { roomId: rId, roomName, roomType: room?.type || null, items: [] };
      branchMap[bId].rooms[rId].items.push(item);
      if (!branchMap[bId].days[q.date]) branchMap[bId].days[q.date] = { date: q.date, items: [] };
      branchMap[bId].days[q.date].items.push(item);
    });
    return branches.filter((b) => branchMap[b.id]).map((b) => ({
      ...branchMap[b.id],
      rooms: Object.values(branchMap[b.id].rooms),
      days: Object.values(branchMap[b.id].days).sort((x, y) => x.date.localeCompare(y.date)),
    }));
  }, [filteredQueues, branches, rooms]);

  const tableProps = {
    procedures, promos, staff, onUpdateStatus, onEdit,
    onAskMove: (q) => setMoveConfirm({ queue: q }),
    onAskDelete: (q) => { setDeleteConfirm({ queue: q }); setDeleteInput(""); },
  };

  const rangeLabel = isRange
    ? `${formatThaiDate(rangeStart)} – ${formatThaiDate(rangeEnd)} (${spanDays} วัน)`
    : formatThaiDate(rangeStart);

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
          <label className="form-label">ช่วงด่วน</label>
          <select
            value={activePresetKey ?? ""}
            onChange={(e) => {
              const p = presets.find((x) => x.key === e.target.value);
              if (p) applyPreset(p);
            }}
          >
            {/* ไม่มี option "กำหนดเอง" ให้กด — แก้ช่องวันที่เองคือกำหนดเองอยู่แล้ว */}
            {!activePresetKey && <option value="">กำหนดเอง ({spanDays} วัน)</option>}
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">จากวันที่</label>
          <input type="date" value={qfFrom} onChange={(e) => changeFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">ถึงวันที่</label>
          <input type="date" value={qfTo} onChange={(e) => changeTo(e.target.value)} />
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
        <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
          {TABLE_STATUSES.filter((s) => statusStats[s.value]).map((s) => (
            <button
              key={s.value}
              onClick={() => setQfStatus(qfStatus === s.value ? "all" : s.value)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, flex: "none",
                padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
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

      {!needsBranch && filteredQueues.length > HEAVY_ROW_WARNING && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "8px 14px", borderRadius: "var(--radius-sm)",
          border: "1.5px solid var(--border2)", background: "var(--surface2)",
          color: "var(--text2)", fontSize: 13, fontWeight: 600,
        }}>
          🐢 {filteredQueues.length.toLocaleString()} แถว — หน้าอาจหน่วง ลองแคบช่วงวันที่ลง หรือกรองสถานะ/ห้องเพิ่ม (ข้อมูลแสดงครบทุกแถว ไม่ได้ตัดทิ้ง)
        </div>
      )}

      {needsBranch ? (
        <div className="card">
          <div className="empty">
            <div className="e-icon">🏢</div>
            <p>เลือกสาขาก่อน แล้วถึงจะดูย้อนหลังได้</p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 6, lineHeight: 1.7 }}>
              ช่วงที่เลือกยาว {spanDays} วัน — ถ้าเปิด "ทุกสาขา" พร้อมกันจะมีคิวหลายพันแถวในหน้าเดียว จนหน้าค้าง<br />
              เลือกสาขาที่ต้องการจากช่องด้านบน หรือย่อช่วงให้เหลือไม่เกิน {MAX_DAYS_ALL_BRANCHES} วัน
            </p>
          </div>
        </div>
      ) : filteredQueues.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="e-icon">📭</div>
            <p>{isRange ? "ไม่มีคิวในช่วงวันที่เลือก" : "ยังไม่มีคิว — ไปบันทึกคิวก่อนเลย!"}</p>
          </div>
        </div>
      ) : (
        groupedData.map(({ branchId, branchName, rooms: branchRooms, days }) => {
          const totalCount = branchRooms.reduce((sum, r) => sum + r.items.filter(q => q.status !== "rescheduled_in").length, 0);
          const activeTab = activeRoomTabByBranch[branchId] ?? ALL_ROOMS_TAB;
          const activeRoom = activeTab === ALL_ROOMS_TAB ? null : branchRooms.find((r) => r.roomId === activeTab);
          const showRoomCol = activeTab === ALL_ROOMS_TAB;
          // โหมดหลายวันไม่ใช้แท็บห้อง — ไม่ต้องเสียแรงรวม+เรียงทุกแถวทิ้ง
          const activeItems = isRange
            ? []
            : showRoomCol
              ? branchRooms
                  .flatMap((r) => r.items)
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
              {isRange && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)" }}>
                  {days.length} วันที่มีคิว
                </span>
              )}
            </div>

            {!isCollapsed && (
              isRange ? (
                /* ── โหมดหลายวัน: แยกหัวข้อรายวัน ไม่ใช้แท็บห้อง (ห้องเดียวกันคนละวันต้องไม่ปนกัน) ── */
                <>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setOpenDays((prev) => {
                      const next = { ...prev };
                      const anyOpen = days.some((d) => next[`${branchId}|${d.date}`]);
                      days.forEach((d) => {
                        if (anyOpen) delete next[`${branchId}|${d.date}`];
                        else next[`${branchId}|${d.date}`] = true;
                      });
                      return next;
                    })}
                    style={{
                      background: "var(--surface2)", border: "1.5px solid var(--border)", borderRadius: 6,
                      padding: "3px 12px", fontSize: 12, fontWeight: 600, color: "var(--text2)",
                      cursor: "pointer", fontFamily: "var(--font)",
                    }}
                  >
                    {days.some((d) => openDays[`${branchId}|${d.date}`]) ? "▸ หุบทุกวัน" : "▾ กางทุกวัน"}
                  </button>
                </div>
                {days.map((d) => {
                  const dayKey = `${branchId}|${d.date}`;
                  const dayOpen = !!openDays[dayKey];
                  const dayCount = d.items.filter(q => q.status !== "rescheduled_in").length;
                  return (
                  <div key={d.date} style={{ marginBottom: dayOpen ? 14 : 4 }}>
                    <div
                      onClick={() => setOpenDays((prev) => {
                        const next = { ...prev };
                        if (next[dayKey]) delete next[dayKey]; else next[dayKey] = true;
                        return next;
                      })}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 12px",
                        borderRadius: dayOpen ? "var(--radius-sm) var(--radius-sm) 0 0" : "var(--radius-sm)",
                        background: "var(--surface2)", border: "1px solid var(--border)",
                        borderBottom: dayOpen ? "none" : "1px solid var(--border)",
                        cursor: "pointer", userSelect: "none",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "var(--text3)" }}>{dayOpen ? "▾" : "▸"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>📅 {formatThaiDate(d.date)}</span>
                      <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, background: "var(--surface3)", borderRadius: 10, padding: "1px 8px", color: "var(--text3)" }}>
                        {dayCount} คิว
                      </span>
                    </div>
                    {dayOpen && (
                      <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                        <QueueDataTable items={d.items} showRoomCol {...tableProps} />
                      </div>
                    )}
                  </div>
                  );
                })}
                </>
              ) : (
                <>
                {/* แท็บห้อง — "ทั้งหมด" รวมทุกห้องเรียงตามเวลา ดูได้ทีเดียวว่าทั้งสาขาคิวแน่นตอนไหน */}
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
                    <QueueDataTable items={activeItems} showRoomCol={showRoomCol} {...tableProps} />
                  )}
                </div>
                </>
              )
            )}
          </div>
          );
        })
      )}

      <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "right", marginTop: 8 }}>
        แสดง {filteredQueues.length} คิว • {rangeLabel}
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
