import { useState, useCallback } from "react";
import { parseBookingText, parseMultiBooking, splitMultiBooking, blockToTimeStr } from "../utils/smartParser";

const FIELD_LABELS = {
  name: "ชื่อ",
  phone: "เบอร์",
  branchId: "สาขา",
  roomId: "ห้อง",
  procedureId: "หัตถการ",
  promoId: "โปร",
  price: "ราคา",
  date: "วันที่",
  timeBlock: "เวลา",
  customerType: "ประเภท",
  note: "หมายเหตุ",
};
const CUST_LABELS = { new: "ลูกค้าใหม่", old: "ลูกค้าเก่า", course: "ใช้คอร์ส" };
const FIELD_ORDER = ["name", "phone", "branchId", "roomId", "customerType", "procedureId", "promoId", "price", "date", "timeBlock", "note"];

function getEntries(parsed) {
  return FIELD_ORDER.filter((k) => {
    const v = parsed.fields[k];
    return v !== undefined && v !== null && v !== "" && FIELD_LABELS[k];
  }).map((k) => [k, parsed.fields[k]]);
}

export default function SmartParseBox({ branches, rooms = [], procedures, promos, hints, onApply, onBulkApply }) {
  const [text, setText] = useState("");
  const [multiResults, setMultiResults] = useState([]); // array of { fields, confidence }
  const [open, setOpen] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState(-1); // track which person is being applied in multi mode

  const context = { branches, rooms, procedures, promos, hints };

  const runParse = useCallback((val) => {
    if (val.trim().length > 5) {
      const blocks = splitMultiBooking(val);
      const results = blocks.map((block) => {
        const r = parseBookingText(block, context);
        return { ...r, rawText: block };
      }).filter((r) => Object.values(r.fields).some((v) => v !== "" && v !== null && v !== undefined));
      setMultiResults(results);
    } else {
      setMultiResults([]);
    }
  }, [branches, rooms, procedures, promos, hints]);

  function handleChange(e) {
    setText(e.target.value);
    runParse(e.target.value);
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text");
    if (pasted.trim()) {
      setText(pasted);
      runParse(pasted);
      e.preventDefault();
    }
  }

  // เติมคนเดียว (single mode หรือเลือกคนจาก multi)
  function handleApplySingle(idx) {
    const parsed = multiResults[idx];
    if (!parsed) return;
    onApply(parsed.fields, parsed.rawText);
    setApplyingIdx(idx);
    setTimeout(() => {
      if (multiResults.length <= 1) {
        setText("");
        setMultiResults([]);
        setOpen(false);
      }
      setApplyingIdx(-1);
    }, 800);
  }

  // สร้างทั้งหมดพร้อมกัน (bulk)
  function handleApplyAll() {
    if (!onBulkApply || multiResults.length < 2) return;
    const allFields = multiResults.map((r) => r.fields);
    onBulkApply(allFields);
    setJustApplied(true);
    setTimeout(() => {
      setText("");
      setMultiResults([]);
      setOpen(false);
      setJustApplied(false);
    }, 1200);
  }

  function formatValue(field, value) {
    if (field === "branchId") return branches.find((b) => b.id === value)?.name || value;
    if (field === "roomId") return rooms.find((r) => r.id === value)?.name || value;
    if (field === "procedureId") return procedures.find((p) => p.id === value)?.name || value;
    if (field === "promoId") return promos.find((p) => p.id === value)?.name || value;
    if (field === "price") return `฿${Number(value).toLocaleString()}`;
    if (field === "timeBlock") return blockToTimeStr(value);
    if (field === "customerType") return CUST_LABELS[value] || value;
    if (field === "date") {
      const [y, m, d] = value.split("-");
      return `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
    }
    return String(value);
  }

  const isMulti = multiResults.length > 1;

  const learnedAliasCount =
    Object.keys(hints.branchAliases    || {}).length +
    Object.keys(hints.procedureAliases || {}).length +
    Object.keys(hints.promoAliases     || {}).length +
    Object.keys(hints.roomAliases      || {}).length +
    Object.keys(hints.procedureToRoom  || {}).length;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 14px", borderRadius: "var(--radius-sm)",
          border: `1.5px dashed ${open ? "var(--accent)" : "var(--border2)"}`,
          background: open ? "var(--surface2)" : "transparent",
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", display: "flex", alignItems: "center", gap: 8 }}>
          🤖 วิเคราะห์ข้อความอัตโนมัติ
          {learnedAliasCount > 0 && (
            <span style={{
              fontSize: 10, background: "var(--green-soft)", color: "var(--green)",
              borderRadius: 10, padding: "1px 7px", fontWeight: 700,
            }}>
              เรียนรู้แล้ว {learnedAliasCount} คำ
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: "var(--text3)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          marginTop: 4, padding: "12px 14px",
          border: "1.5px solid var(--accent)", borderRadius: "0 0 var(--radius-sm) var(--radius-sm)",
          background: "var(--surface2)",
        }}>
          <textarea
            value={text}
            onChange={handleChange}
            onPaste={handlePaste}
            autoFocus
            placeholder={
              "วางข้อความจาก LINE/chat ได้เลย — ทีละคนหรือหลายคนพร้อมกัน!\n\nตัวอย่าง:\n1.แนน\n092-464-5516\nฟิลเลอร์ 1,990 บาท\n5/4/69  15:00\nลาดกระบัง\nใหม่\n\n2.สมชาย\n081-234-5678\nโบท็อก\n6/4/69  18:00\nลาดกระบัง\nเก่า"
            }
            rows={6}
            style={{ width: "100%", resize: "vertical", fontSize: 13, fontFamily: "var(--mono)" }}
          />

          {/* ── Multi-person detected ── */}
          {isMulti && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                padding: "6px 10px", borderRadius: 8,
                background: "var(--accent-soft)", border: "1px solid var(--accent)",
              }}>
                <span style={{ fontSize: 18 }}>👥</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
                  พบ {multiResults.length} คน
                </span>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>
                  — วางหลายคนพร้อมกัน
                </span>
              </div>

              {multiResults.map((parsed, idx) => {
                const entries = getEntries(parsed);
                const name = parsed.fields.name || `คนที่ ${idx + 1}`;
                return (
                  <div key={idx} style={{
                    marginBottom: 8, padding: "8px 10px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface1)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>
                        {idx + 1}. {name}
                      </span>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleApplySingle(idx)}
                        disabled={applyingIdx === idx}
                        style={{ fontSize: 11, padding: "2px 10px" }}
                      >
                        {applyingIdx === idx ? "✅" : "เติมคนนี้"}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {entries.map(([field, value]) => {
                        const conf = parsed.confidence[field];
                        const isHigh = conf === "high";
                        return (
                          <div key={field} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 8px", borderRadius: 14, fontSize: 11,
                            background: isHigh ? "var(--green-soft)" : "var(--surface3)",
                            border: `1px solid ${isHigh ? "var(--green)" : "var(--border2)"}`,
                            color: isHigh ? "var(--green)" : "var(--text2)",
                          }}>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{FIELD_LABELS[field]}</span>
                            <span style={{ fontWeight: 600 }}>{formatValue(field, value)}</span>
                            {!isHigh && <span style={{ fontSize: 8, color: "var(--amber)", fontWeight: 700 }}>?</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {onBulkApply && (
                <button
                  className="btn btn-primary"
                  onClick={handleApplyAll}
                  style={{ width: "100%", fontSize: 13, marginTop: 4 }}
                  disabled={justApplied}
                >
                  {justApplied ? "✅ สร้างแล้ว!" : `🚀 สร้างทั้ง ${multiResults.length} คิวพร้อมกัน`}
                </button>
              )}
            </div>
          )}

          {/* ── Single person ── */}
          {!isMulti && multiResults.length === 1 && (() => {
            const parsed = multiResults[0];
            const entries = getEntries(parsed);
            return entries.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {entries.map(([field, value]) => {
                    const conf = parsed.confidence[field];
                    const isHigh = conf === "high";
                    return (
                      <div
                        key={field}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 10px", borderRadius: 20, fontSize: 12,
                          background: isHigh ? "var(--green-soft)" : "var(--surface3)",
                          border: `1.5px solid ${isHigh ? "var(--green)" : "var(--border2)"}`,
                          color: isHigh ? "var(--green)" : "var(--text2)",
                        }}
                      >
                        <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400 }}>
                          {FIELD_LABELS[field]}
                        </span>
                        <span style={{ fontWeight: 700 }}>{formatValue(field, value)}</span>
                        {!isHigh && (
                          <span style={{ fontSize: 9, color: "var(--amber)", fontWeight: 700 }}>?</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleApplySingle(0)}
                  style={{ width: "100%", fontSize: 13 }}
                  disabled={applyingIdx === 0}
                >
                  {applyingIdx === 0 ? "✅ เติมแล้ว!" : `✨ เติมข้อมูลในฟอร์ม (${entries.length} ช่อง)`}
                </button>
              </div>
            ) : null;
          })()}

          {text.trim().length > 5 && multiResults.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8, textAlign: "center" }}>
              วิเคราะห์ไม่พบข้อมูล — ลองวางข้อความใหม่
            </div>
          )}
        </div>
      )}
    </div>
  );
}
