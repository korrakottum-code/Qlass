import { useState, useMemo } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { ROOM_TYPES, WORK_START_BLOCK, WORK_END_BLOCK } from "../../utils/constants";
import { blockToTime } from "../../utils/helpers";
import { ALWAYS_ALLOWED_PROCEDURE_NAMES } from "../../utils/roomProcedures";

// index.css ตั้ง input { width:100% } กับทุก input — checkbox ที่ไม่บอกความกว้างเองจะยืดเต็ม
// แถวแล้วดันข้อความไปชิดขวา ต้องล็อกขนาดกลับให้เท่ากล่องติ๊กจริง
const CHECKBOX_STYLE = { accentColor: "var(--accent)", width: 16, height: 16, flexShrink: 0, margin: 0 };

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

// คำนวณชื่อห้องถัดไป เช่น M01, M02, T03
function getNextRoomName(rooms, branchId, type) {
  if (!branchId || !type) return "";
  const existing = rooms.filter((r) => r.branchId === branchId && r.type === type);
  const next = existing.length + 1;
  return `${type}${String(next).padStart(2, "0")}`;
}

// Spinner +/- 30 นาที (6 บล็อค) แบบเดียวกับ ScheduleModal
function TimeSpinner({ label, value, onChange, min, max }) {
  const STEP = 6; // 30 นาที
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onChange(Math.max(min, value - STEP))}
          style={{ padding: "2px 10px", fontSize: 16, lineHeight: 1 }}
        >−</button>
        <div style={{
          fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15,
          minWidth: 52, textAlign: "center", color: "var(--accent)",
        }}>
          {blockToTime(value)}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onChange(Math.min(max, value + STEP))}
          style={{ padding: "2px 10px", fontSize: 16, lineHeight: 1 }}
        >+</button>
      </div>
    </div>
  );
}

export default function RoomModal({
  data, branches, rooms, defaultBranchId, onSave, onClose, bulkMode: initBulk,
  procedures = [], roomProcedureIndex,
}) {
  const isEdit = !!data?.id;
  const [bulkMode, setBulkMode] = useState(!!initBulk);
  const [branchId, setBranchId] = useState(data?.branchId || defaultBranchId || "");
  const [selectedBranchIds, setSelectedBranchIds] = useState(
    initBulk ? branches.map((b) => b.id) : []
  );
  const [type, setType] = useState(data?.type || "M");
  const [notes, setNotes] = useState(data?.notes || "");
  const [openBlock, setOpenBlock] = useState(data?.openBlock ?? WORK_START_BLOCK);
  const [closeBlock, setCloseBlock] = useState(data?.closeBlock ?? WORK_END_BLOCK);

  // หัตถการที่เลือกได้ = ฝั่งเดียวกับประเภทเตียง (M/T) — ข้ามฝั่งไม่มีทางถูก
  const selectableProcs = useMemo(
    () => procedures.filter((p) => p.roomType === type),
    [procedures, type]
  );

  // หัตถการกลาง (ปิดคิว ฯลฯ) ลงได้ทุกเตียงเสมอ — ติ๊กให้อัตโนมัติตอนบันทึก ผู้ใช้เอาออกไม่ได้
  // ถ้าปล่อยให้เอาออกได้ เตียงเครื่องที่ลืมติ๊ก "ปิดคิว" จะปิดช่องเวลาไม่ได้อีกเลย
  const genericIds = useMemo(
    () => new Set(selectableProcs.filter((p) => ALWAYS_ALLOWED_PROCEDURE_NAMES.includes(p.name)).map((p) => p.id)),
    [selectableProcs]
  );

  // หัตถการที่เตียงนี้รับ — แก้ได้เฉพาะตอนแก้ไขเตียงที่มีอยู่แล้ว (ตอนสร้างใหม่ยังไม่มี
  // room id ให้ผูก และเตียงใหม่ที่ไม่มีแถวเลยจะวิ่งกติกาเดิมไปก่อนอยู่แล้ว)
  const currentIds = useMemo(() => {
    if (!isEdit || !roomProcedureIndex) return null;
    const set = roomProcedureIndex.get(data.id);
    return set ? [...set] : [];
  }, [isEdit, data, roomProcedureIndex]);

  // state เก็บเฉพาะตัวที่ผู้ใช้เลือกเอง — หัตถการกลางถูกเติมกลับให้ตอนบันทึก
  const [procIds, setProcIds] = useState(() => (currentIds || []).filter((id) => !genericIds.has(id)));
  const configuredAtOpen = (currentIds || []).length > 0;

  // หมายเหตุของเตียง (ช่องข้อความอิสระด้านล่าง) เอ่ยถึงเครื่องที่ยังไม่ได้ติ๊กไหม
  // ตรวจแบบหยาบด้วยชื่อหัตถการที่โผล่ในข้อความ — จับได้เฉพาะเคสตรงตัว ("รับ Pico") ไม่ใช่
  // ทุกวิธีเขียน แต่พอเตือนเคสที่เจอบ่อยสุด: โน้ตเก่าค้างจากผังก่อน
  const noteConflicts = useMemo(() => {
    if (procIds.length === 0) return [];
    const text = notes.toLowerCase();
    return selectableProcs
      .filter((p) => !genericIds.has(p.id) && !procIds.includes(p.id))
      .filter((p) => p.name.length >= 3 && text.includes(p.name.toLowerCase()))
      .map((p) => p.name);
  }, [notes, procIds, selectableProcs, genericIds]);

  function toggleProc(id) {
    if (genericIds.has(id)) return;
    setProcIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleBranch(id) {
    setSelectedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedBranchIds(branches.filter((b) => b.name && b.name.trim()).map((b) => b.id));
  }

  function selectNone() {
    setSelectedBranchIds([]);
  }

  // ถ้าแก้ไข → ใช้ชื่อเดิม / ถ้าเพิ่มใหม่ → auto-generate
  const autoName = useMemo(() => {
    if (isEdit) return data.name;
    if (bulkMode) return `${type}xx`;
    return getNextRoomName(rooms, branchId, type);
  }, [isEdit, data, rooms, branchId, type, bulkMode]);

  function handleSave() {
    if (bulkMode) {
      if (selectedBranchIds.length === 0 || !type) return;
      // ส่ง array ของ rooms ที่จะสร้าง
      const bulkData = selectedBranchIds.map((bid) => ({
        name: getNextRoomName(rooms, bid, type),
        branchId: bid,
        type,
        notes: notes.trim(),
        openBlock,
        closeBlock,
      }));
      return onSave({ bulk: true, items: bulkData });
    } else {
      if (branchId && type) {
        return onSave({
          id: data?.id,
          name: autoName,
          branchId,
          type,
          notes: notes.trim(),
          openBlock,
          closeBlock,
          // ส่งเฉพาะตอนแก้ไข และเฉพาะเมื่อมีการเปลี่ยนจริง — undefined = ไม่แตะของเดิม
          // ติ๊กออกหมด = ล้างการตั้งค่า (กลับกติกาเดิม) จึงห้าม union หัตถการกลางในเคสนั้น
          procedureIds: (() => {
            if (!isEdit || !currentIds) return undefined;
            const chosen = procIds.length > 0 ? [...new Set([...procIds, ...genericIds])] : [];
            return sameSet(currentIds, chosen) ? undefined : chosen;
          })(),
        });
      }
    }
  }

  const rt = ROOM_TYPES.find((r) => r.value === type);

  return (
    <>
      <ModalHeader title={isEdit ? "✏️ แก้ไขห้อง" : bulkMode ? "🚀 เพิ่มห้องหลายสาขาพร้อมกัน" : "➕ เพิ่มห้อง"} onClose={onClose} />
      <ModalBody>
        <div className="form-grid">

          {/* โหมดสลับ: เพิ่มทีละสาขา vs หลายสาขา */}
          {!isEdit && (
            <div className="form-group full">
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`btn btn-sm ${!bulkMode ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setBulkMode(false)}
                >
                  ➕ เพิ่มทีละสาขา
                </button>
                <button
                  className={`btn btn-sm ${bulkMode ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => { setBulkMode(true); if (selectedBranchIds.length === 0) selectAll(); }}
                >
                  🚀 เพิ่มหลายสาขาพร้อมกัน
                </button>
              </div>
            </div>
          )}

          {/* สาขา: single หรือ multi */}
          {bulkMode && !isEdit ? (
            <div className="form-group full">
              <label className="form-label">
                <span className="req">*</span> เลือกสาขา ({selectedBranchIds.length}/{branches.filter((b) => b.name && b.name.trim()).length})
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="btn btn-sm btn-secondary" onClick={selectAll}>เลือกทั้งหมด</button>
                <button className="btn btn-sm btn-secondary" onClick={selectNone}>ไม่เลือกเลย</button>
              </div>
              <div style={{
                maxHeight: 200, overflowY: "auto",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                padding: 8, display: "flex", flexDirection: "column", gap: 2,
              }}>
                {branches.filter((b) => b.name && b.name.trim()).map((b) => {
                  const checked = selectedBranchIds.includes(b.id);
                  const existingCount = rooms.filter((r) => r.branchId === b.id && r.type === type).length;
                  return (
                    <label
                      key={b.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                        background: checked ? "var(--accent-soft)" : "transparent",
                        fontSize: 13, fontWeight: checked ? 600 : 400,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBranch(b.id)}
                        style={CHECKBOX_STYLE}
                      />
                      {b.name}
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                        → {type}{String(existingCount + 1).padStart(2, "0")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="form-group full">
              <label className="form-label"><span className="req">*</span> สาขา</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} autoFocus disabled={isEdit}>
                <option value="">-- เลือก --</option>
                {branches.filter((b) => b.name && b.name.trim()).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {isEdit && (
                <span style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>
                  ไม่สามารถเปลี่ยนสาขาได้หลังสร้างแล้ว
                </span>
              )}
            </div>
          )}

          {/* ประเภทห้อง */}
          <div className="form-group full">
            <label className="form-label"><span className="req">*</span> ประเภทห้อง</label>
            {isEdit ? (
              // Edit mode: แสดง badge เท่านั้น ไม่ให้เปลี่ยน
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "8px 16px", borderRadius: "var(--radius-sm)",
                    border: `2px solid ${rt?.color}`,
                    background: type === "M" ? "var(--blue-soft)" : "var(--green-soft)",
                  }}
                >
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 18, color: rt?.color }}>
                    {type}
                  </span>
                  <span style={{ fontSize: 13, color: rt?.color, fontWeight: 600 }}>
                    {rt?.label.split("—")[1]?.trim()}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>
                  🔒 ล็อค — ไม่สามารถเปลี่ยนประเภทได้
                </span>
              </div>
            ) : (
              <div className="type-options">
                {ROOM_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    className={`type-option ${type === rt.value ? "selected" : ""}`}
                    onClick={() => setType(rt.value)}
                    style={type === rt.value ? { borderColor: rt.color, background: rt.color, color: "#fff" } : {}}
                  >
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{rt.value}</span>
                    {" "}{rt.label.split("—")[1]?.trim()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview ชื่อห้อง auto */}
          {!bulkMode && branchId && (
            <div className="form-group full">
              <label className="form-label">ชื่อห้อง</label>
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                border: `2px solid ${rt?.color || "var(--border)"}`,
                background: type === "M" ? "var(--blue-soft)" : "var(--green-soft)",
              }}>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 28, fontWeight: 800,
                  color: rt?.color, letterSpacing: 2,
                }}>
                  {autoName || "—"}
                </span>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {isEdit ? "ชื่อเดิม (ไม่เปลี่ยน)" : "สร้างอัตโนมัติ"}
                </span>
              </div>
            </div>
          )}

          {bulkMode && selectedBranchIds.length > 0 && (
            <div className="form-group full">
              <label className="form-label">ตัวอย่างห้องที่จะสร้าง ({selectedBranchIds.length} สาขา)</label>
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                border: `2px solid ${rt?.color || "var(--border)"}`,
                background: type === "M" ? "var(--blue-soft)" : "var(--green-soft)",
                fontSize: 12, color: "var(--text2)", lineHeight: 1.8,
                maxHeight: 120, overflowY: "auto",
              }}>
                {selectedBranchIds.map((bid) => {
                  const b = branches.find((x) => x.id === bid);
                  const name = getNextRoomName(rooms, bid, type);
                  return (
                    <div key={bid}>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: rt?.color }}>{name}</span>
                      {" "}— {b?.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* เวลาเปิด-ปิดเริ่มต้น */}
          <div className="form-group full">
            <label className="form-label">⏰ เวลาเปิด-ปิดเริ่มต้น (ค่า default ของห้องนี้)</label>
            <div style={{
              display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
              padding: "12px 14px", borderRadius: "var(--radius-sm)",
              background: "var(--surface2)", border: "1.5px solid var(--border)",
            }}>
              <TimeSpinner
                label="เปิดเวลา"
                value={openBlock}
                onChange={(v) => { setOpenBlock(v); if (v >= closeBlock) setCloseBlock(Math.min(WORK_END_BLOCK, v + 6)); }}
                min={WORK_START_BLOCK}
                max={WORK_END_BLOCK - 6}
              />
              <span style={{ fontSize: 20, color: "var(--text3)" }}>→</span>
              <TimeSpinner
                label="ปิดเวลา"
                value={closeBlock}
                onChange={(v) => { setCloseBlock(v); if (v <= openBlock) setOpenBlock(Math.max(WORK_START_BLOCK, v - 6)); }}
                min={WORK_START_BLOCK + 6}
                max={WORK_END_BLOCK}
              />
              <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                {Math.round((closeBlock - openBlock) * 5 / 60 * 10) / 10} ชม.
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              กำหนดเวลาทำการปกติของห้องนี้ — ใช้ "ตารางห้อง/เครื่อง" สำหรับวันพิเศษ
            </span>
          </div>

          {/* หัตถการที่เตียงนี้รับ */}
          {isEdit && currentIds && (
            <div className="form-group full">
              <label className="form-label">
                🔒 หัตถการที่ {autoName} รับได้
                <span style={{ fontWeight: 400, color: "var(--text3)", marginLeft: 8 }}>
                  เลือกแล้ว {procIds.length} / {selectableProcs.length - genericIds.size}
                </span>
              </label>

              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setProcIds(selectableProcs.filter((p) => !genericIds.has(p.id)).map((p) => p.id))}>
                  เลือกทั้งหมด
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => setProcIds([])}>
                  ไม่เลือกเลย
                </button>
                {currentIds.length > 0 && (
                  <button className="btn btn-sm btn-secondary" onClick={() => setProcIds(currentIds.filter((id) => !genericIds.has(id)))}>
                    คืนค่าเดิม
                  </button>
                )}
              </div>

              <div style={{
                maxHeight: 220, overflowY: "auto",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                padding: 8, display: "flex", flexDirection: "column", gap: 2,
              }}>
                {selectableProcs.map((p) => {
                  const isGeneric = genericIds.has(p.id);
                  const checked = isGeneric ? procIds.length > 0 : procIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", borderRadius: 6,
                        cursor: isGeneric ? "default" : "pointer",
                        background: checked ? "var(--accent-soft)" : "transparent",
                        fontSize: 13, fontWeight: checked ? 600 : 400,
                        opacity: isGeneric ? 0.75 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isGeneric}
                        onChange={() => toggleProc(p.id)}
                        style={CHECKBOX_STYLE}
                      />
                      {p.name}
                      {isGeneric && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", background: "var(--surface3)", borderRadius: 4, padding: "1px 6px" }}>
                          ทุกเตียง
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                        {p.blocks * 5} นาที
                      </span>
                    </label>
                  );
                })}
                {selectableProcs.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--text3)", padding: "6px 10px" }}>
                    ยังไม่มีหัตถการประเภท {type}
                  </span>
                )}
              </div>

              {noteConflicts.length > 0 && (
                <div style={{
                  marginTop: 8, padding: "8px 11px", borderRadius: 6,
                  border: "1.5px solid var(--amber)", background: "rgba(217,119,6,0.10)",
                  fontSize: 11.5, lineHeight: 1.55, color: "var(--amber)", fontWeight: 600,
                }}>
                  ⚠️ หมายเหตุของเตียงนี้พูดถึง <strong>{noteConflicts.join(", ")}</strong> แต่ยังไม่ได้ติ๊ก
                  <div style={{ fontWeight: 400, marginTop: 2 }}>
                    หน้าร้านอ่านหมายเหตุเป็นหลัก ถ้าล็อกกับหมายเหตุพูดคนละอย่างจะสับสน — ติ๊กเพิ่ม หรือแก้หมายเหตุด้านล่างให้ตรงกัน
                  </div>
                </div>
              )}

              {procIds.length === 0 ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: configuredAtOpen ? "var(--amber)" : "var(--text3)", lineHeight: 1.6, display: "block", marginTop: 5 }}>
                  {configuredAtOpen
                    ? "⚠️ ไม่เลือกเลย = ล้างการตั้งค่าเตียงนี้ กลับไปรับทุกหัตถการประเภท " + type + " เหมือนเดิม"
                    : "ยังไม่ได้ตั้งค่า — เตียงนี้รับทุกหัตถการประเภท " + type + " ตามกติกาเดิม"}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6, display: "block", marginTop: 5 }}>
                  ลงคิวได้เฉพาะที่ติ๊กไว้ — ตรวจทั้งหน้าบันทึกคิวและ Timeline
                  <br />
                  คิวที่จองไว้แล้วไม่ถูกแตะ ระบบตรวจเฉพาะคิวที่ลงใหม่หรือย้ายเตียง
                </span>
              )}
            </div>
          )}

          {/* หมายเหตุ */}
          <div className="form-group full">
            <label className="form-label">หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ห้องนี้มีเครื่อง HIFU ด้วย"
            />
          </div>
        </div>
      </ModalBody>
      <ModalFooter
        onClose={onClose}
        onSave={handleSave}
        saveLabel={bulkMode && selectedBranchIds.length > 1 ? `🚀 สร้าง ${selectedBranchIds.length} ห้อง` : undefined}
      />
    </>
  );
}
