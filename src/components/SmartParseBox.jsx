import { useState, useCallback } from "react";
import { parseBookingText, blockToTimeStr } from "../utils/smartParser";

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

export default function SmartParseBox({ branches, rooms = [], procedures, promos, hints, onApply }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const context = { branches, rooms, procedures, promos, hints };

  const runParse = useCallback((val) => {
    if (val.trim().length > 5) {
      const r = parseBookingText(val.trim(), context);
      const hasData = Object.values(r.fields).some((v) => v !== "" && v !== null && v !== undefined);
      setParsed(hasData ? { ...r, rawText: val.trim() } : null);
    } else {
      setParsed(null);
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

  function handleApply() {
    if (!parsed) return;
    onApply(parsed.fields, parsed.rawText);
    setApplying(true);
    setTimeout(() => {
      setText("");
      setParsed(null);
      setOpen(false);
      setApplying(false);
    }, 800);
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
            placeholder={"วางข้อความจาก LINE/chat ได้เลย\n\nตัวอย่าง:\nแนน 092-464-5516\nฟิลเลอร์ 1,990 บาท\n5/4/69 15:00 ลาดกระบัง ใหม่"}
            rows={5}
            style={{ width: "100%", resize: "vertical", fontSize: 13, fontFamily: "var(--mono)" }}
          />

          {/* ── Result ── */}
          {parsed && (() => {
            const entries = getEntries(parsed);
            return entries.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {entries.map(([field, value]) => {
                    const conf = parsed.confidence[field];
                    const isHigh = conf === "high";
                    return (
                      <div key={field} style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "4px 10px", borderRadius: 20, fontSize: 12,
                        background: isHigh ? "var(--green-soft)" : "var(--surface3)",
                        border: `1.5px solid ${isHigh ? "var(--green)" : "var(--border2)"}`,
                        color: isHigh ? "var(--green)" : "var(--text2)",
                      }}>
                        <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400 }}>{FIELD_LABELS[field]}</span>
                        <span style={{ fontWeight: 700 }}>{formatValue(field, value)}</span>
                        {!isHigh && <span style={{ fontSize: 9, color: "var(--amber)", fontWeight: 700 }}>?</span>}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleApply}
                  style={{ width: "100%", fontSize: 13 }}
                  disabled={applying}
                >
                  {applying ? "✅ เติมแล้ว!" : `✨ เติมข้อมูลในฟอร์ม (${entries.length} ช่อง)`}
                </button>
              </div>
            ) : null;
          })()}

          {text.trim().length > 5 && !parsed && (
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8, textAlign: "center" }}>
              วิเคราะห์ไม่พบข้อมูล — ลองวางข้อความใหม่
            </div>
          )}
        </div>
      )}
    </div>
  );
}
