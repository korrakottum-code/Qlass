import { useState, useMemo, useEffect, useCallback } from "react";
import { CUSTOMER_TYPES, QUEUE_STATUSES } from "../utils/constants";
import { getTodayStr, formatThaiDate, blockToTime, formatRecorderLabel, getCustomerBadgeClass, isOverdueUnconfirmed, isoToLocalDateStr } from "../utils/helpers";
import { pickDatePresets, daySpan } from "../utils/datePresets";
import { isSearchable, matchesQueueSearch } from "../utils/queueSearch";

const ALL_ROOMS_TAB = "__all__";
// แท็บคิวรอ อยู่แถวเดียวกับแท็บห้อง — คิวรอยังไม่มีห้อง/เวลา จึงเข้ากลุ่มห้องไหนไม่ได้
const WAITING_TAB = "__waiting__";
// ชิปสรุปสถานะไม่นับคิวรอ — คิวรอมีแท็บของตัวเองแล้ว และไม่ได้ผูกกับวันนัดเหมือนสถานะอื่น
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
// รอให้พิมพ์นิ่งก่อนค่อยกรอง/ค้น — สั้นกว่านี้แล้วยังกระตุก ยาวกว่านี้แล้วรู้สึกว่าไม่ตอบสนอง
const SEARCH_DEBOUNCE_MS = 300;

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
  items, showRoomCol, procedures, promos, staff, waitingMode = false, searchMode = false,
  onUpdateStatus, onEdit, onAskMove, onAskDelete, onJumpToDate,
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
            <th style={{ whiteSpace: "nowrap" }}>{searchMode ? "วันที่" : waitingMode ? "ลงคิวเมื่อ" : "เวลา"}</th>
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
                  {/* ผลค้นหามาจากทุกวัน ต้องบอกวันที่มาด้วย ไม่งั้นเห็นแต่เวลาแล้วเข้าใจว่าเป็นวันนี้ */}
                  {searchMode ? (
                    <>
                      <div style={{ fontSize: 12 }}>{formatThaiDate(q.date)}</div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>
                        {q.timeBlock !== null ? blockToTime(q.timeBlock) : "ไม่ระบุเวลา"}
                      </div>
                    </>
                  ) : /* คิวรอยังไม่มีเวลานัด — ช่องนี้บอก "ลงคิวไว้เมื่อไหร่" แทน จะได้รู้ว่ารอมานานแค่ไหน */
                  waitingMode ? (
                    q.createdAt ? (
                      <>
                        <div style={{ fontSize: 12 }}>{formatThaiDate(isoToLocalDateStr(q.createdAt))}</div>
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>
                          {new Date(q.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </>
                    ) : "—"
                  ) : q.timeBlock !== null ? (
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
                        {formatRecorderLabel(recorder, q.recordedNote)}
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
                    {searchMode && onJumpToDate && (
                      <button
                        className="btn btn-sm"
                        title="เปิดตารางของวันนั้น สาขานั้น"
                        onClick={() => onJumpToDate(q)}
                        style={{ background: "var(--surface3)", border: "1.5px solid var(--border2)", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        📅 ไปที่วันนั้น
                      </button>
                    )}
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

// เนื้อในของแท็บคิวรอ — ใช้ทั้งโหมดวันเดียว (เป็นแท็บ) และโหมดหลายวัน (เป็นการ์ดแยก)
//
// ทุกตัวเลขบนหน้า (หัวข้อสาขา, แท็บ, บรรทัดสรุปล่างสุด) นับเฉพาะคิวรอในช่วงวันที่ที่เลือก
// เลื่อนไปดูเดือนหน้าจึงเห็นเฉพาะคิวรอของเดือนนั้น ไม่ใช่ยอดรวมทั้งก้อนตามไปทุกช่วง
//
// ส่วนคนที่อยู่นอกช่วง ยังบอกจำนวนไว้ในแท็บและกดกางดูได้ — คนที่รอมาหลายอาทิตย์
// จะได้ไม่หายไปจากทั้งหน้าเพียงเพราะเปิดดูอีกเดือน
function WaitingQueueBlock({ inRange, earlier, showAll, searching, onToggleShowAll, tableProps }) {
  const items = showAll ? [...inRange, ...earlier].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) : inRange;
  return (
    <>
      {searching && inRange.length > 0 && (
        <div style={{
          padding: "8px 14px", borderBottom: "1px solid var(--border)",
          fontSize: 12, fontWeight: 600, color: "var(--text2)",
        }}>
          🔍 กำลังค้นหา — แสดงคิวรอทุกช่วงวันที่ ไม่จำกัดเฉพาะวันที่ที่เลือก
        </div>
      )}
      {!searching && earlier.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "8px 14px", borderBottom: "1px solid var(--border)",
          fontSize: 12, fontWeight: 600, color: "var(--text2)",
        }}>
          <span>⏳ ยังมีคนรอค้างมาจากก่อนช่วงวันที่นี้อีก {earlier.length} คน</span>
          <button
            type="button"
            onClick={onToggleShowAll}
            style={{
              background: "var(--surface2)", border: "1.5px solid var(--border)", borderRadius: 6,
              padding: "2px 10px", fontSize: 11, fontWeight: 700, color: "var(--text2)",
              cursor: "pointer", fontFamily: "var(--font)",
            }}
          >
            {showAll ? "▸ ดูเฉพาะช่วงวันที่นี้" : "▾ ดูคนที่รอทั้งหมด"}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text3)", fontSize: 13 }}>
          ไม่มีคิวรอในช่วงวันที่นี้
        </div>
      ) : (
        <QueueDataTable items={items} showRoomCol={false} waitingMode {...tableProps} />
      )}
    </>
  );
}

export default function QueueTablePage({
  queues, branches, rooms, procedures, promos, staff, roomSchedules,
  onEdit, onDelete, onUpdateStatus, onMoveToWaitingQueue, onRangeNeeded, onSearchQueues,
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
  // ในแท็บคิวรอ: กางดูคิวรอที่ค้างอยู่ทั้งหมด ไม่ใช่แค่ช่วงวันที่ที่เลือก — ต่อสาขา
  const [waitingShowAllByBranch, setWaitingShowAllByBranch] = useState({});
  // หุบ/ขยายแต่ละสาขา — ไม่ได้ตั้งไว้เอง = ใช้ค่า default (หุบถ้าโชว์หลายสาขาพร้อมกัน, ขยายถ้าเลือกสาขาเดียว)
  const [branchCollapseOverride, setBranchCollapseOverride] = useState({});
  // วันที่เปิดอยู่ในโหมดหลายวัน — key = "branchId|date" — ไม่มีใน object = หุบ
  // หุบไว้ก่อนเสมอ: เลือกทั้งเดือนแล้วกางทุกวันคือคิวพันกว่าแถวใน DOM เดียว หน้าจะหน่วงทันที
  const [openDays, setOpenDays] = useState({});

  // ─── ค้นหา = ตามหาคน ไม่ใช่กรองตารางของวันนี้ ───
  // พิมพ์ชื่อแล้วยิงหาทั้งฐานข้อมูล ไม่ผูกช่วงวันที่และไม่ผูกสาขา เพราะหน้าร้านพิมพ์ชื่อ
  // ตอนลูกค้ามายืนอยู่ตรงหน้า ไม่ได้รู้ว่าลูกค้าจองวันไหนสาขาไหนไว้ ถ้าค้นแค่ในช่วงที่
  // เปิดดูอยู่ ระบบจะตอบว่า "ยังไม่มีคิว" ทั้งที่มี แล้วหน้าร้านจะลงคิวใหม่ทับของเดิม
  // ─── พิมพ์แล้วต้องไม่หน่วง ───
  // qfSearch = สิ่งที่พิมพ์อยู่ (ช่องข้อความต้องตอบสนองทันทีทุกตัวอักษร)
  // appliedSearch = คำที่ "นิ่งแล้ว" ใช้กับทุกอย่างที่หนัก — กรองตาราง จัดกลุ่ม และยิงหาในฐานข้อมูล
  //
  // เดิมใช้คำที่พิมพ์ตรง ๆ ทุกที่ พิมพ์หนึ่งตัวอักษรจึงคำนวณตารางใหม่ทั้งหน้า (คิวหลักพันแถว
  // จัดกลุ่มตามสาขา/ห้อง/วัน ใหม่ทั้งหมด) พิมพ์เร็ว ๆ แล้วรู้สึกค้าง — ปัญหาที่หน้าร้านเจอ
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(qfSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qfSearch]);

  // เก็บผลค้นหาคู่กับ "คำที่ค้น" เสมอ — ถ้าเก็บแต่ผล พอผู้ใช้พิมพ์คำใหม่ ผลของคำเก่าจะ
  // ค้างโชว์อยู่ชั่วครู่ ซึ่งอันตรายมากในหน้านี้: หน้าร้านอาจอ่านผลของคนอื่นแล้วตัดสินใจผิด
  const [globalSearch, setGlobalSearch] = useState({ term: "", rows: [], status: "idle" });
  // คิวที่ผู้ใช้เพิ่งลบไป — ผลค้นหามาจากคนละก้อนกับ state หลัก ถ้าไม่จำไว้ แถวที่ลบแล้ว
  // จะยังค้างอยู่ในผลค้นหาจนกว่าจะค้นใหม่ แล้วหน้าร้านจะเข้าใจว่าลบไม่สำเร็จ
  const [deletedInSearch, setDeletedInSearch] = useState(() => new Set());
  const searchTerm = appliedSearch;
  const searching = isSearchable(searchTerm);
  const resultsFresh = globalSearch.term === searchTerm;
  const searchStatus = resultsFresh ? globalSearch.status : "loading";
  // พิมพ์ค้างอยู่ = ผลที่เห็นยังเป็นของคำก่อนหน้า ต้องบอกให้รู้ ไม่ใช่ปล่อยให้อ่านผลเก่า
  const searchPending = qfSearch.trim() !== appliedSearch;

  useEffect(() => {
    if (!searching || !onSearchQueues) return undefined;
    let cancelled = false;
    // ห่อด้วย timeout 0 เพื่อไม่ให้ setState วิ่งพร้อม effect (กัน cascading render)
    const kick = setTimeout(async () => {
      setGlobalSearch((prev) => (prev.status === "loading" ? prev : { ...prev, status: "loading" }));
      try {
        const rows = await onSearchQueues(searchTerm);
        if (!cancelled) setGlobalSearch({ term: searchTerm, rows: rows || [], status: "done" });
      } catch (error) {
        console.error("global queue search failed:", error);
        if (!cancelled) setGlobalSearch({ term: searchTerm, rows: [], status: "error" });
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(kick); };
  }, [searchTerm, searching, onSearchQueues]);

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

  // เปลี่ยนช่วงวันที่ = เริ่มดูรอบใหม่ ต้องหุบ "ดูคนที่รอทั้งหมด" กลับเสมอ ไม่งั้นเลื่อนไปเดือนหน้า
  // แล้วคนที่รอมาตั้งแต่เดือนก่อนจะโผล่ตามไปด้วย ทั้งที่ตั้งใจดูเฉพาะเดือนนั้น
  useEffect(() => { setWaitingShowAllByBranch({}); }, [rangeStart, rangeEnd]);

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

  // จับคู่ทีละคำ ไม่ใช่ทั้งประโยคเป็นก้อนเดียว — ดูเหตุผลใน queueSearch.js
  // ตัวอักษรเดียวยังไม่กรองอะไรเลย (ได้ครึ่งคลินิกอยู่ดี แถมทำให้ตารางคำนวณใหม่ฟรี ๆ)
  const matchesSearch = useCallback((q) => {
    if (!isSearchable(appliedSearch)) return true;
    const recorder = staff?.find((x) => x.id === q.recordedBy);
    return matchesQueueSearch(q, appliedSearch, `${recorder?.nickname || ""} ${recorder?.name || ""}`);
  }, [appliedSearch, staff]);

  // ─── คิวรอ: ไม่กรองด้วยช่วงวันที่ตรงนี้ ───
  // คิวรอไม่มีวันนัด — คอลัมน์ date คือวันที่ลงคิวไว้เฉย ๆ กรองทิ้งตั้งแต่ตรงนี้แล้วจะนับไม่ได้
  // ว่ามีคนค้างอยู่นอกช่วงที่ดูอยู่กี่คน (แท็บคิวรอค่อยแบ่งเองว่าอันไหนอยู่ในช่วง อันไหนก่อนหน้า)
  const waitingQueues = useMemo(() => {
    if (needsBranch || (qfStatus !== "all" && qfStatus !== "waiting_queue")) return [];
    return queues
      .filter((q) => (q.status || "pending") === "waiting_queue")
      .filter((q) => qfBranch === "all" || q.branchId === qfBranch)
      .filter((q) => qfRecordedBy === "all" || q.recordedBy === qfRecordedBy)
      .filter(matchesSearch)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [queues, qfBranch, qfRecordedBy, qfStatus, matchesSearch, needsBranch]);

  // ค้นหา = ตามหาคน ไม่ใช่ดูเดือน — พิมพ์ชื่อแล้วต้องเจอไม่ว่าคนนั้นจะรออยู่ของเดือนไหน
  const searchingWaiting = !!qfSearch.trim();

  const waitingByBranch = useMemo(() => {
    const map = {};
    waitingQueues.forEach((q) => {
      const bId = q.branchId || "__none__";
      if (!map[bId]) map[bId] = { inRange: [], earlier: [] };
      if (searchingWaiting) { map[bId].inRange.push(q); return; }
      if (q.date && q.date >= rangeStart && q.date <= rangeEnd) {
        map[bId].inRange.push(q);
      } else if (!q.date || q.date < rangeStart) {
        // ค้างมาจากก่อนช่วงที่เลือก — ยังรออยู่จริง บอกจำนวนไว้แล้วกดกางดูได้
        map[bId].earlier.push(q);
      }
      // ลงคิวไว้หลังช่วงที่เลือก = ของเดือนถัดไป ไม่ใช่ของช่วงนี้ — กดดูเดือนที่แล้ว
      // แล้วคิวที่จองไว้เดือนนี้ต้องไม่โผล่มาปน จึงไม่นับและไม่แสดงเลย
    });
    return map;
  }, [waitingQueues, rangeStart, rangeEnd, searchingWaiting]);

  // ยอดคิวรอที่ "อยู่ในช่วงวันที่ที่เลือก" รวมทุกสาขา — ใช้กับบรรทัดสรุปล่างสุด
  const waitingInRangeTotal = useMemo(
    () => Object.values(waitingByBranch).reduce((sum, g) => sum + g.inRange.length, 0),
    [waitingByBranch]
  );

  const filteredQueues = useMemo(() => {
    if (needsBranch) return [];
    return queues
      .filter((q) => {
        if ((q.status || "pending") === "waiting_queue") return false;
        if (qfBranch !== "all" && q.branchId !== qfBranch) return false;
        if (!q.date || q.date < rangeStart || q.date > rangeEnd) return false;
        if (qfStatus !== "all" && (q.status || "pending") !== qfStatus) return false;
        if (qfRecordedBy !== "all" && q.recordedBy !== qfRecordedBy) return false;
        if (!matchesSearch(q)) return false;
        return true;
      })
      // เรียงตามวันก่อน แล้วค่อยเวลา — ไม่งั้นดูหลายวันแล้ว 11:00 ของทุกวันจะมากองรวมกัน
      .sort((a, b) => (a.date === b.date ? (a.timeBlock || 0) - (b.timeBlock || 0) : a.date.localeCompare(b.date)));
  }, [queues, qfBranch, rangeStart, rangeEnd, matchesSearch, qfStatus, qfRecordedBy, needsBranch]);

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
    // สาขาที่มีแต่คิวรอ (ไม่มีคิวที่ลงห้อง/เวลาในช่วงนี้เลย) ต้องโผล่ด้วย ไม่งั้นแท็บคิวรอหายไปทั้งสาขา
    return branches
      .filter((b) => branchMap[b.id] || waitingByBranch[b.id])
      .map((b) => {
        const g = branchMap[b.id] || { branchId: b.id, branchName: b.name, rooms: {}, days: {} };
        return {
          ...g,
          rooms: Object.values(g.rooms),
          days: Object.values(g.days).sort((x, y) => x.date.localeCompare(y.date)),
        };
      });
  }, [filteredQueues, branches, rooms, waitingByBranch]);

  // ผลค้นหา = ที่ได้จากฐานข้อมูล (ชื่อ/เบอร์ ทุกวัน ทุกสาขา) รวมกับที่โหลดมาแล้วในเครื่อง
  // (ครอบคลุมการค้นด้วยชื่อแอดมินผู้บันทึก ซึ่งฝั่งฐานข้อมูลค้นไม่ได้เพราะเก็บเป็น id)
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const byId = new Map();
    const visibleBranchIds = new Set(branches.map((b) => b.id));
    for (const q of (resultsFresh ? globalSearch.rows : [])) {
      // กันข้อมูลข้ามสาขาที่บัญชีนี้ไม่มีสิทธิ์เห็น (ฐานข้อมูลคืนมาทุกสาขา)
      if (!visibleBranchIds.has(q.branchId)) continue;
      byId.set(q.id, q);
    }
    for (const q of queues) if (matchesSearch(q)) byId.set(q.id, q);
    for (const id of deletedInSearch) byId.delete(id);
    return Array.from(byId.values()).sort((a, b) => {
      if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
      return (a.timeBlock ?? 0) - (b.timeBlock ?? 0);
    });
  }, [searching, resultsFresh, globalSearch.rows, queues, matchesSearch, branches, deletedInSearch]);

  const searchItems = useMemo(() => searchResults.map((q) => {
    const branch = branches.find((b) => b.id === q.branchId);
    const room = rooms.find((r) => r.id === q.roomId);
    return { ...q, __roomName: `${branch?.name || "ไม่ระบุสาขา"}${room ? ` · ${room.name}` : ""}` };
  }), [searchResults, branches, rooms]);

  // ลบล้มเหลว = แถวยังอยู่ใน DB จริง ห้ามซ่อนจากผลค้นหา (App แจ้ง error ให้เองแล้ว)
  function handleDelete(queue) {
    setDeleteConfirm(null);
    Promise.resolve(onDelete(queue.id, queue))
      .then(() => setDeletedInSearch((prev) => new Set(prev).add(queue.id)))
      .catch(() => {});
  }

  // กดแล้วพาไปดูตารางของวันนั้น สาขานั้น แล้วล้างคำค้นทิ้ง — ปิดวงจร "เจอแล้วไปดูต่อ"
  function jumpToQueue(q) {
    if (q.branchId) setQfBranch(q.branchId);
    if (q.date) { setQfFrom(q.date); setQfTo(q.date); }
    setQfSearch("");
  }

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

      {/* ชิปสรุปสถานะ / แบนเนอร์เตือน — ทั้งหมดผูกกับช่วงวันที่ที่เลือก ซึ่งตอนค้นหาไม่ได้ใช้
          ปล่อยไว้จะอ่านปนกัน เห็นเลขของช่วงวันที่แต่ตารางข้างล่างเป็นผลค้นหาทั้งระบบ */}
      {/* Status summary chips */}
      {!searching && Object.keys(statusStats).length > 0 && (
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

      {!searching && overdueCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "8px 14px", borderRadius: "var(--radius-sm)",
          border: "1.5px solid #d97706", background: "rgba(217,119,6,0.12)",
          color: "#b45309", fontSize: 13, fontWeight: 700,
        }}>
          ⚠️ {overdueCount} คิวยังไม่ยืนยัน เลยเวลา 12:00 แล้ว — กด "➡️ ย้ายเข้าคิวรอ" เพื่อปล่อยเวลาให้ลงคิวอื่นได้
        </div>
      )}

      {!searching && !needsBranch && filteredQueues.length > HEAVY_ROW_WARNING && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "8px 14px", borderRadius: "var(--radius-sm)",
          border: "1.5px solid var(--border2)", background: "var(--surface2)",
          color: "var(--text2)", fontSize: 13, fontWeight: 600,
        }}>
          🐢 {filteredQueues.length.toLocaleString()} แถว — หน้าอาจหน่วง ลองแคบช่วงวันที่ลง หรือกรองสถานะ/ห้องเพิ่ม (ข้อมูลแสดงครบทุกแถว ไม่ได้ตัดทิ้ง)
        </div>
      )}

      {searching ? (
        /* ── โหมดค้นหา: แทนที่มุมมองรายวันทั้งหมด ── */
        <div className="card">
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "8px 14px", borderBottom: "1px solid var(--border)",
            fontSize: 12, fontWeight: 700, color: "var(--text2)",
          }}>
            <span>🔍 ผลค้นหา "{searchTerm}" — ค้นทั้งระบบ ทุกวัน ทุกสาขา ทุกสถานะ (ตัวกรองด้านบนไม่ถูกใช้ตอนค้นหา)</span>
            {/* ยังพิมพ์ไม่หยุด = ที่เห็นอยู่ยังเป็นผลของคำก่อนหน้า ต้องบอก ไม่ใช่ปล่อยให้อ่านผิดคน */}
            {searchPending && (
              <span style={{ fontWeight: 600, color: "var(--text3)" }}>⏳ กำลังพิมพ์...</span>
            )}
            <button
              type="button"
              onClick={() => setQfSearch("")}
              style={{
                marginLeft: "auto", background: "var(--surface2)", border: "1.5px solid var(--border)",
                borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                color: "var(--text2)", cursor: "pointer", fontFamily: "var(--font)",
              }}
            >
              ✕ ล้างคำค้น
            </button>
          </div>
          {searchResults.length > 0 ? (
            <>
              <QueueDataTable items={searchItems} showRoomCol searchMode {...tableProps} onJumpToDate={jumpToQueue} />
              {searchStatus === "loading" && (
                <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--text3)" }}>⏳ กำลังค้นเพิ่มจากทั้งระบบ...</div>
              )}
            </>
          ) : searchStatus === "loading" ? (
            <div className="empty"><div className="e-icon">🔍</div><p>กำลังค้นหา...</p></div>
          ) : searchStatus === "error" ? (
            <div className="empty">
              <div className="e-icon">⚠️</div>
              <p>ค้นหาไม่สำเร็จ</p>
              <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 6, lineHeight: 1.7 }}>
                ยังบอกไม่ได้ว่าลูกค้ารายนี้มีคิวหรือไม่ — กรุณาลองใหม่อีกครั้งก่อนตัดสินใจลงคิวใหม่
              </p>
            </div>
          ) : (
            /* ข้อความตรงนี้สำคัญ: ห้ามพูดว่า "ยังไม่มีคิว ไปบันทึกคิวก่อนเลย" เหมือนมุมมองรายวัน
               เพราะตอนค้นหา คำตอบนั้นจะถูกอ่านว่า "ลูกค้าคนนี้ไม่มีคิว" แล้วหน้าร้านจะลงใหม่
               ทับของเดิม ต้องบอกให้ชัดว่าค้นครบทั้งระบบแล้วจริง ๆ ถึงจะกล้าลงใหม่ */
            <div className="empty">
              <div className="e-icon">🔍</div>
              <p>ไม่พบ "{searchTerm}" ในระบบเลย</p>
              <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 6, lineHeight: 1.7 }}>
                ค้นครบทุกวันและทุกสาขาแล้ว ไม่จำกัดเฉพาะช่วงวันที่ด้านบน<br />
                ถ้าสะกดชื่อไม่ตรง ลองพิมพ์แค่ชื่อต้นหรือเบอร์โทรแทน
              </p>
            </div>
          )}
        </div>
      ) : needsBranch ? (
        <div className="card">
          <div className="empty">
            <div className="e-icon">🏢</div>
            <p>ยังไม่ได้แสดงตาราง — ไม่ใช่ว่าไม่มีคิว</p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 6, lineHeight: 1.7 }}>
              ช่วงที่เลือกยาว {spanDays} วัน — ถ้าเปิด "ทุกสาขา" พร้อมกันจะมีคิวหลายพันแถวในหน้าเดียว จนหน้าค้าง<br />
              เลือกสาขาที่ต้องการจากช่องด้านบน หรือย่อช่วงให้เหลือไม่เกิน {MAX_DAYS_ALL_BRANCHES} วัน
            </p>
            {/* ข้อความเดิมเขียนว่า "เลือกสาขาก่อน" เฉย ๆ หน้าร้านที่กำลังตามหาลูกค้าอ่านแล้ว
                เข้าใจว่า "ไม่เจอ" แล้วไปลงคิวใหม่ทับของเดิม — ต้องบอกทางที่ถูกไว้ตรงนี้ด้วย */}
            <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 10, fontWeight: 600, lineHeight: 1.7 }}>
              🔍 ถ้ากำลังตามหาลูกค้า ให้พิมพ์ชื่อหรือเบอร์ในช่อง "ค้นหา" ด้านบนได้เลย<br />
              ระบบจะค้นให้ทั้งระบบ ทุกวัน ทุกสาขา โดยไม่ต้องเลือกสาขาหรือตั้งช่วงวันที่
            </p>
          </div>
        </div>
      ) : filteredQueues.length === 0 && waitingQueues.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="e-icon">📭</div>
            <p>{isRange ? "ไม่มีคิวในช่วงวันที่เลือก" : "ยังไม่มีคิว — ไปบันทึกคิวก่อนเลย!"}</p>
          </div>
        </div>
      ) : (
        groupedData.map(({ branchId, branchName, rooms: branchRooms, days }) => {
          const totalCount = branchRooms.reduce((sum, r) => sum + r.items.filter(q => q.status !== "rescheduled_in").length, 0);
          const branchWaitingCount = waitingByBranch[branchId]?.inRange.length || 0;
          const activeTab = activeRoomTabByBranch[branchId] ?? ALL_ROOMS_TAB;
          const branchWaiting = waitingByBranch[branchId] || { inRange: [], earlier: [] };
          // ตัวเลขที่โชว์ = เฉพาะในช่วงวันที่ที่เลือก ส่วนคนนอกช่วงมีแท็บให้กดเข้าไปดูได้
          const waitingInRange = branchWaiting.inRange.length;
          const waitingTabVisible = waitingInRange > 0 || branchWaiting.earlier.length > 0;
          const showAllWaiting = !!waitingShowAllByBranch[branchId];
          const toggleShowAllWaiting = () => setWaitingShowAllByBranch((prev) => ({ ...prev, [branchId]: !showAllWaiting }));
          const onWaitingTab = activeTab === WAITING_TAB && waitingTabVisible;
          const activeRoom = activeTab === ALL_ROOMS_TAB || activeTab === WAITING_TAB ? null : branchRooms.find((r) => r.roomId === activeTab);
          const showRoomCol = activeTab === ALL_ROOMS_TAB;
          // โหมดหลายวันไม่ใช้แท็บห้อง — ไม่ต้องเสียแรงรวม+เรียงทุกแถวทิ้ง
          const activeItems = isRange || onWaitingTab
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
              {branchWaitingCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309", background: "rgba(217,119,6,0.12)", borderRadius: 10, padding: "1px 8px" }}>
                  ⏳ คิวรอ {branchWaitingCount}
                </span>
              )}
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
                {/* โหมดนี้ไม่มีแถบแท็บ คิวรอจึงมาเป็นการ์ดของตัวเองไว้บนสุด ไม่ใช่หายไปทั้งโหมด */}
                {waitingTabVisible && (
                  <div className="card" style={{ marginBottom: 10 }}>
                    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700, color: "#b45309" }}>
                      ⏳ คิวรอ
                      {/* ไม่มีในช่วงนี้ = ไม่ต้องโชว์เลข 0 บรรทัดใต้หัวข้อบอกอยู่แล้วว่ามีคนรอนอกช่วงกี่คน */}
                      {waitingInRange > 0 && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", marginLeft: 4 }}>{waitingInRange}</span>
                      )}
                    </div>
                    <WaitingQueueBlock
                      inRange={branchWaiting.inRange}
                      earlier={branchWaiting.earlier}
                      searching={searchingWaiting}
                      showAll={showAllWaiting}
                      onToggleShowAll={toggleShowAllWaiting}
                      tableProps={tableProps}
                    />
                  </div>
                )}
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
                  {waitingTabVisible && (
                    <button
                      type="button"
                      onClick={() => setActiveRoomTabByBranch((prev) => ({ ...prev, [branchId]: WAITING_TAB }))}
                      style={{
                        flex: "none", border: "none", background: "transparent", cursor: "pointer",
                        fontFamily: "var(--font)", fontSize: 13, fontWeight: 700, padding: "9px 12px", whiteSpace: "nowrap",
                        color: onWaitingTab ? "#b45309" : "var(--text3)",
                        borderBottom: `2.5px solid ${onWaitingTab ? "#b45309" : "transparent"}`,
                      }}
                    >
                      ⏳ คิวรอ
                      {/* ไม่มีในช่วงนี้ = ไม่ต้องโชว์เลข 0 ให้สะดุดตา แท็บยังอยู่ให้กดเข้าไปดูคนนอกช่วงได้ */}
                      {waitingInRange > 0 && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginLeft: 5 }}>{waitingInRange}</span>
                      )}
                    </button>
                  )}
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
                  {onWaitingTab ? (
                    <WaitingQueueBlock
                      inRange={branchWaiting.inRange}
                      earlier={branchWaiting.earlier}
                      searching={searchingWaiting}
                      showAll={showAllWaiting}
                      onToggleShowAll={toggleShowAllWaiting}
                      tableProps={tableProps}
                    />
                  ) : activeItems.length === 0 ? (
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
        {searching
          ? `พบ ${searchResults.length} คิว • ค้นทั้งระบบ ไม่จำกัดช่วงวันที่`
          : `แสดง ${filteredQueues.length} คิว${waitingInRangeTotal > 0 ? ` + คิวรอ ${waitingInRangeTotal}` : ""} • ${rangeLabel}`}
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
                  handleDelete(deleteConfirm.queue);
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
                onClick={() => handleDelete(deleteConfirm.queue)}
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
