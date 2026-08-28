import { useState, useMemo, useEffect } from "react";
import { QUEUE_STATUSES } from "../utils/constants";
import { getTodayStr, formatThaiDate, isoToLocalDateStr } from "../utils/helpers";
import { SMALL_BASE, byCustomerType, lostStat, changePct, sorterFor, topMovers } from "../utils/growthCompare";

const fmtNum = (n) => n.toLocaleString("en-US");
// Wilson score lower bound (95%) — ใช้จัดอันดับ % ที่มาจากฐานตัวอย่างขนาดต่างกัน โดยไม่ให้ฐานเล็ก
// (เช่น 10/10 = 100%) ชนะฐานใหญ่ที่ % ต่ำกว่านิดหน่อยแต่มั่นใจได้มากกว่า (เช่น 731/875 = 84%) — ยิ่ง
// ตัวอย่างน้อย ค่านี้ยิ่งถูกหักลงมาก (ตัวอย่างมาตรฐานสำหรับจัดอันดับ "rate" ที่ฐานไม่เท่ากัน)
function wilsonLowerBound(successes, n) {
  if (n === 0) return 0;
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centre - margin) / denom;
}
// แบ่ง % ของหลายกลุ่มให้รวมกันได้ 100 เป๊ะเสมอ (largest-remainder method) — ปัดเศษแต่ละกลุ่มแยกกัน
// ด้วย Math.round ธรรมดาไม่การันตีผลรวม 100 (เช่น 33/33/33 จาก 3 กลุ่มเท่ากันจะได้ 99 ไม่ใช่ 100)
function apportionPercents(parts, total) {
  if (total <= 0) return parts.map(() => 0);
  const raw = parts.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  const remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[order[k].i] += 1;
  return result;
}
// ชื่อโปรที่หมายถึง "ใช้แพ็กเกจที่จ่ายไปแล้ว" ไม่ใช่โปรการตลาด — ใช้ตัดออกจากสถิติโปรทุกจุดในไฟล์นี้
// เก็บไว้ที่เดียวกันเป็น constant กันแก้/เทียบสตริงตรงๆ กระจายหลายจุดแล้วพังเงียบๆ ถ้ามีคนไปเปลี่ยนชื่อโปรนี้
const COURSE_USE_PROMO_NAME = "ใช้คอร์ส";
// เกณฑ์เขียว/เหลือง/แดงของอัตรายกเลิก+ไม่มา — คำนวณจากข้อมูลจริงย้อนหลัง 90 วันทั้งเครือข่าย
// (ค่ากลางจริงอยู่ที่ ~23%, Q1=13%, Q3=32%) เกณฑ์เดิม (5/15) ตั้งเองแบบไม่มีข้อมูลรองรับ ทำให้
// ~75% ของวัน-สาขาขึ้นแดง "ควรเร่งติดตาม" ตลอดเวลาจนคนเลิกสนใจป้ายเตือน (alarm fatigue)
const LOST_RATE_GOOD_MAX = 13; // ≤13% (25% ที่ดีที่สุดจริง) = เขียว
const LOST_RATE_OK_MAX = 32; // 13-32% (กลุ่มกลาง 50%) = เหลือง, >32% (25% แย่ที่สุดจริง) = แดง
// บัญชีที่ role ในระบบเป็น "แอดมิน" แต่จริงๆ ไม่ใช่แอดมินปิดการขาย (ทีม PR ใช้บัญชีนี้ล็อกคิวให้
// KOL/อินฟลูเอนเซอร์ ~288 รายการ ส่วนใหญ่ติดโปร "Influencer") กันออกจากตัวเลข "ผลงานแอดมิน" ใน
// หน้านี้เท่านั้น — ไม่แตะ role จริงในระบบ กันกระทบสิทธิ์การใช้งานหน้าอื่นของบัญชีนี้ (เลือกตัวเลือก B
// แทนตัวเลือก A ที่ต้องเปลี่ยน role จริง — ตามที่ตกลงกันไว้)
const EXCLUDED_ADMIN_STAFF_IDS = new Set([
  "57ca82e2-4edc-42fd-98a4-1285ad6450ee", // Marketing (นามแฝง "PR")
  // "ทีมกทม." ไม่ตัดออก — เจ้าของระบบยืนยันว่าให้นับรวมตามเดิม
]);
const S = { card: { background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", border: "1px solid #f0ebe8" } };

function StatCard({ icon, label, value, sub, accent = "#E8B4B8" }) {
  return (
    <div className="ceo-stat-card" style={{ ...S.card, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%", background: `${accent}18` }} />
      <div className="ceo-stat-card-label" style={{ fontSize: 13, color: "#999", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>{label}
      </div>
      <div className="ceo-stat-card-value" style={{ fontSize: 28, fontWeight: 700, color: "#2d2a26", marginTop: 6 }}>{value}</div>
      {sub && <div className="ceo-stat-card-sub" style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children }) {
  return <div className="ceo-section-card" style={S.card}><div className="ceo-section-card-title" style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#2d2a26" }}>{title}</div>{children}</div>;
}

// อัตรายกเลิก/ไม่มา: โชว์ % ต่อเมื่อฐานพอเชื่อได้ ไม่งั้นโชว์จำนวนจริงให้คนอ่านตัดสินเอง
const lostText = (st) => {
  if (!st || st.total === 0) return "—";
  return st.reliable ? `${st.rate}%` : `${st.lost}/${st.total} คิว`;
};
// ฐานไม่พอ = เทาเสมอ ไม่เขียวไม่แดง — เกณฑ์เขียว/เหลือง/แดงตั้งจากค่ากลางทั้งเครือ 90 วัน
// เอามาตัดสินคิว 1-2 ใบไม่ได้
const lostColor = (st) => {
  if (!st || st.total === 0 || !st.reliable) return "#999";
  return st.rate > LOST_RATE_OK_MAX ? "#C62828" : st.rate > LOST_RATE_GOOD_MAX ? "#E65100" : "#2E7D32";
};

// ─── "ทำไมแถวนี้ถึงเปลี่ยน" — new/old/course + no-show/ยกเลิก + ตัวที่เปลี่ยนแปลงมากสุด ───
// ใช้ร่วมกันทั้งโซนสาขาและโซนหัตถการ ต่างกันแค่ movers (สาขาโชว์ "โปรที่เปลี่ยน" / หัตถการโชว์
// "สาขาที่เปลี่ยน") เลยรับ moversTitle เข้ามา ไม่แยกเป็นสองคอมโพเนนต์ที่แก้แล้วหลุดไม่ตรงกันทีหลัง
function ChangeDetail({ diag, moversTitle }) {
  if (!diag) return <div style={{ fontSize: 11, color: "#bbb", padding: "8px 0" }}>ข้อมูลไม่พอ</div>;
  const typeRow = (label, curV, prevV, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: "#999" }}>{label}</span>
      <span>
        <span style={{ color: "#bbb" }}>{prevV} → </span>
        <span style={{ fontWeight: 700, color }}>{curV}</span>
      </span>
    </div>
  );
  return (
    // maxWidth เอาไว้เอง ไม่พึ่งความกว้างจากภายนอก — กันแถว justify-content:space-between ด้านในยืดห่างไกลเกิน
    // ไปตามการ์ดแม่ที่กว้างเต็มจอ (การ์ดนี้อยู่ในการ์ดสรุปสาขาที่ตั้งใจให้กว้างเต็มหน้า)
    <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid #f0ebe8", display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <div>
        <div style={{ fontSize: 10, color: "#bbb", marginBottom: 4, fontWeight: 700 }}>ประเภทลูกค้า (ก่อนหน้า → ช่วงนี้)</div>
        {typeRow("🆕 ใหม่", diag.cur.new, diag.prev.new, "#3b82f6")}
        {typeRow("🔄 เก่า", diag.cur.old, diag.prev.old, "#f59e0b")}
        {typeRow("📦 คอร์ส", diag.cur.course, diag.prev.course, "#8b5cf6")}
      </div>
      <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
        {/* ⚠️ = ยกเลิก+ไม่มา รวมกัน ต่างจาก 🚫 ที่ใช้เฉพาะ "ไม่มา" อย่างเดียวในโซนรายละเอียดด้านล่าง กันสับสน */}
        <span style={{ color: "#999" }}>⚠️ อัตรายกเลิก/ไม่มา</span>
        {/* ไม่มีคิวเลย → "—" (ห้ามโชว์ "0%" ที่แปลว่า "ไม่มีใครยกเลิก" ทั้งที่ไม่มีข้อมูล)
            คิวน้อยกว่า SMALL_BASE → โชว์จำนวนจริง "1/2 คิว" ไม่ใช่ % และไม่ตัดสินสี — คิวใบเดียว
            โดนยกเลิกได้ "100%" ตัวแดง ไม่โดนได้ "0%" ตัวเขียว ทั้งที่เป็นเรื่องเดียวกัน หลักเดียวกับ
            ป้าย ▲▼% ของแถวที่ฐานน้อยแล้วโชว์จำนวนคิวแทน
            ฐานพอแล้ว → สีตัดสินจากเกณฑ์เทียบเครือข่ายเดียวกับการ์ด "⚠️ อัตรายกเลิก/ไม่มา" ด้านล่าง
            ของหน้า (ไม่ใช่แค่ดีขึ้น/แย่ลงจากช่วงก่อน) กันป้ายเดียวกันในหน้าเดียวกันตัดสินคนละมาตรฐาน */}
        <span>
          <span style={{ color: "#bbb" }}>{lostText(diag.lostPrev)} → </span>
          <span style={{ fontWeight: 700, color: lostColor(diag.lostCur) }}>{lostText(diag.lostCur)}</span>
        </span>
      </div>
      <div>
        <div style={{ fontSize: 10, color: "#bbb", marginBottom: 4, fontWeight: 700 }}>{moversTitle}</div>
        {diag.movers.length === 0 ? (
          <div style={{ fontSize: 11, color: "#ccc" }}>ไม่มีการเปลี่ยนแปลงเด่นชัด</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {diag.movers.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{m.name}</span>
                <span style={{ marginLeft: 8, fontWeight: 700, color: m.delta >= 0 ? "#2E7D32" : "#C62828" }}>
                  {m.delta >= 0 ? "▲" : "▼"} {m.prev}→{m.cur}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ปุ่มสลับเกณฑ์เรียง — สองโหมดตอบคนละคำถาม ไม่มีอันไหนถูกกว่ากัน (ดู growthCompare.js)
function SortToggle({ mode, onChange }) {
  const btn = (key, label) => (
    <button
      onClick={() => onChange(key)}
      style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid #e8e0dc",
        cursor: "pointer", background: mode === key ? "#2d2a26" : "#fff", color: mode === key ? "#fff" : "#888" }}
    >{label}</button>
  );
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {btn("count", "📊 จำนวนคิวที่หาย/เพิ่ม")}
      {btn("pct", "📉 % ที่ตกหนักสุด")}
    </div>
  );
}

// ─── ลิสต์ "เติบโต / ลดลง" — โครงเดียวกันทั้งโซนสาขาและโซนหัตถการ ───
// เกณฑ์แสดงผลทุกข้อ (จัดกลุ่มลดลงก่อน, ฐาน <10 ไม่โชว์ %, ยอดเท่าเดิม = "คงที่") อยู่ที่เดียว
// กันสองโซนในหน้าเดียวกันตัดสินคนละมาตรฐานเมื่อมีคนไปแก้ทีหลัง
function GrowthList({ rows, cap, showAll, onToggleShowAll, expandedId, onToggleRow, diagnostics, moversTitle, moreLabel, sortMode }) {
  if (rows.length === 0) return <div style={{ color: "#ccc", textAlign: "center", padding: 20 }}>ไม่มีข้อมูล</div>;
  const visible = showAll ? rows : rows.slice(0, cap);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {visible.map((r, i) => {
        const isOpen = expandedId === r.id;
        // ฐานเทียบเล็กเกินไป (เช่นสาขาใหม่/หัตถการเพิ่งเปิดที่ช่วงก่อนมีแค่ 1-2 คิว) — % จะบวมจน
        // ไม่มีความหมาย (1→587 กลายเป็น 58600%) โชว์จำนวนที่เปลี่ยนไปตรงๆ แทนดีกว่า
        const baseTooSmall = r.prev < SMALL_BASE;
        const isDeclining = r.total < r.prev;
        // โชว์หัวข้อกลุ่มแค่ตอนเปลี่ยนกลุ่ม (ลดลง → เพิ่มขึ้น) กันงงว่าทำไมสลับทิศทางกลางลิสต์
        const showGroupHeader = i === 0 || isDeclining !== (visible[i - 1].total < visible[i - 1].prev);
        return (
          <div key={r.id}>
            {showGroupHeader && (
              <div style={{ fontSize: 11, fontWeight: 700, color: isDeclining ? "#C62828" : "#2E7D32", margin: i === 0 ? "0 0 6px" : "14px 0 6px" }}>
                {isDeclining ? "📉 ลดลง" : "📈 เพิ่มขึ้น"}
              </div>
            )}
            <div style={{ borderBottom: i < visible.length - 1 ? "1px solid #f0ebe8" : "none" }}>
              <div
                onClick={() => onToggleRow(isOpen ? null : r.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 4px", cursor: "pointer", flexWrap: "nowrap" }}
              >
                {/* ชื่อไม่ยืดเต็มแถว (ไม่ใช้ flex:1) — กันตัวเลข/ป้ายเปอร์เซ็นต์ถูกดันไปไกลสุดขอบการ์ด
                    ที่กว้างเต็มจอ ที่ว่างส่วนเกินให้ไปอยู่ท้ายแถวแทน ไม่ใช่แทรกกลางระหว่างชื่อกับตัวเลข
                    ใช้ min(px, vw) แทน px ตรงๆ — กันล้นจอมือถือ (px ตายตัวเคยทำแถวนี้กว้างเกิน 350px
                    ในพื้นที่มือถือจริงมีแค่ ~300px) */}
                <div style={{ minWidth: 0, maxWidth: "min(220px, 42vw)", flexShrink: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "#999", flexShrink: 0, whiteSpace: "nowrap" }}>{r.prev}→{r.total}</div>
                {/* ป้ายนี้ต้องนำด้วย "จำนวนคิว" ไม่ใช่ % — คำถามของผู้บริหารคือยอดหายไปกี่คิว ส่วน %
                    เป็นบริบทรอง (หาย 204 คิว = -15% ของ Hifu สำคัญกว่าหาย 17 คิว = -94% ของ Oligio)
                    เดิมโชว์ % อย่างเดียวจนเจ้าของระบบต้องนั่งลบเลข prev→total ในหัวเอง
                    ยอดเท่าเดิมเป๊ะ (ไม่ใช่ทั้งขึ้นและลง) ไม่ควรมีลูกศร ▲/▼ — เดิม total===prev
                    ตกไปอยู่กลุ่ม "เพิ่มขึ้น" พร้อมป้าย ▲0% ซึ่งขัดกับความจริงตรงๆ
                    ฐานน้อยกว่า SMALL_BASE ไม่ต่อ % ท้าย — 1→2 ที่เขียนว่า "+100%" หลอกตามากกว่าบอกอะไร */}
                {r.total === r.prev ? (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12, color: "#999", background: "#f0ebe8" }}>คงที่</span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 12, whiteSpace: "nowrap",
                    color: r.total > r.prev ? "#2E7D32" : "#C62828", background: r.total > r.prev ? "#E8F5E9" : "#FFEBEE" }}>
                    {/* เลขที่นำหน้าต้องเป็นตัวเดียวกับที่ใช้เรียง ไม่งั้นสายตากวาดแล้วงงว่าทำไม
                        "▼115 คิว" ลอยอยู่เหนือ "▼245 คิว" (คำตอบคือกำลังเรียงด้วย % อยู่) */}
                    {sortMode === "pct" && !baseTooSmall ? (
                      <>
                        {r.total > r.prev ? "▲" : "▼"}{Math.abs(r.ch)}%
                        <span style={{ fontWeight: 500, opacity: 0.75 }}> ({Math.abs(r.total - r.prev)} คิว)</span>
                      </>
                    ) : (
                      <>
                        {r.total > r.prev ? "▲" : "▼"}{Math.abs(r.total - r.prev)} คิว
                        {!baseTooSmall && <span style={{ fontWeight: 500, opacity: 0.75 }}> ({Math.abs(r.ch)}%)</span>}
                      </>
                    )}
                  </span>
                )}
                <span style={{ fontSize: 10, color: "#bbb", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
              </div>
              {isOpen && <div style={{ padding: "0 4px 10px" }}><ChangeDetail diag={diagnostics[r.id]} moversTitle={moversTitle} /></div>}
            </div>
          </div>
        );
      })}
      {rows.length > cap && (
        <button
          onClick={onToggleShowAll}
          style={{ marginTop: 2, border: "1px solid #e8e0dc", background: "#faf7f5", color: "#B45309", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {showAll ? "ซ่อนรายการ" : `ดูเพิ่ม ${rows.length - cap} ${moreLabel}`}
        </button>
      )}
    </div>
  );
}

export default function CeoDashboardPage({ queues, allQueues, branches, rooms, procedures, promos, staff, currentUser, onRangeNeeded }) {
  const todayKey = getTodayStr();
  const RANGES = [
    { key: "today", label: "วันนี้" },
    { key: "7d", label: "7 วัน" },
    { key: "14d", label: "14 วัน" },
    { key: "28d", label: "28 วัน" },
    { key: "thisMonth", label: "เดือนนี้" },
    { key: "lastMonth", label: "เดือนที่แล้ว" },
  ];
  const [rangeKey, setRangeKey] = useState("today");
  const [singleDate, setSingleDate] = useState(todayKey);
  const [expandedBranchId, setExpandedBranchId] = useState(null);
  const [showAllBranchBreakdown, setShowAllBranchBreakdown] = useState(false);
  const [showAllBranchGrowth, setShowAllBranchGrowth] = useState(false);
  const [branchSortMode, setBranchSortMode] = useState("count"); // "count" = จำนวนคิว, "pct" = % ตกหนัก
  const [procSortMode, setProcSortMode] = useState("count");
  const [expandedProcId, setExpandedProcId] = useState(null);
  const [showAllProcGrowth, setShowAllProcGrowth] = useState(false);
  const [showAllAdminPerf, setShowAllAdminPerf] = useState(false);
  const [showAllProcedures, setShowAllProcedures] = useState(false);
  const [promoSortMode, setPromoSortMode] = useState("new"); // "new" = % ลูกค้าใหม่ (ปรับตามขนาดตัวอย่าง), "lost" = อัตราเบี้ยว/ยกเลิกเยอะสุด
  const [showDetails, setShowDetails] = useState(false); // ผู้บริหารเห็นสรุป+เหตุผลหลักก่อน รายละเอียดที่เหลือพับไว้ กดถึงกาง
  const LIST_CAP = 8; // กันรายการยาวไม่จำกัดถ้าสาขา/แอดมินเยอะขึ้น — โชว์แค่ top N ก่อน กด "ดูเพิ่ม" ค่อยกางหมด

  // compute start/end from rangeKey
  const { startDate, endDate, prevStart, prevEnd, rangeLabel } = useMemo(() => {
    const today = new Date(todayKey);
    let s, e, ps, pe, lbl;
    if (rangeKey === "today") {
      s = new Date(singleDate); e = new Date(singleDate);
      ps = new Date(singleDate); ps.setDate(ps.getDate() - 1);
      pe = new Date(ps);
      lbl = singleDate === todayKey ? "วันนี้" : formatThaiDate(singleDate);
    } else if (rangeKey === "thisMonth") {
      s = new Date(today.getFullYear(), today.getMonth(), 1);
      ps = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      // ทั้งสองช่วงต้องยาวเท่ากันเป๊ะ ไม่ใช่แค่ฝั่งเดือนก่อนที่หุบ — ถ้าหุบแค่ฝั่งเดียว (ตามที่เคยแก้ไว้
      // รอบก่อน) เดือนที่ยาวกว่าเดือนก่อน (มี.ค./พ.ค./ก.ค./ต.ค./ธ.ค. เทียบกับเดือนก่อนหน้าที่สั้นกว่า)
      // จะได้ช่วงนี้ยาวกว่าช่วงก่อนอยู่ดี ทำให้ % เปลี่ยนแปลงเบี้ยวเป็นระบบทุกปี — หุบทั้งสองฝั่งด้วย
      // จำนวนวันเท่ากันเสมอ (ยอมให้ช่วง "เดือนนี้" ไม่รวมวันล่าสุด 1-3 วันในเคสหายากนี้ แลกกับการ
      // เทียบเปอร์เซ็นต์ที่แม่นเสมอ)
      const prevMonthDays = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
      const days = Math.min(today.getDate(), prevMonthDays);
      e = new Date(today.getFullYear(), today.getMonth(), days);
      pe = new Date(today.getFullYear(), today.getMonth() - 1, days);
      lbl = `เดือนนี้ (${today.getMonth() + 1}/${today.getFullYear()})`;
    } else if (rangeKey === "lastMonth") {
      s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      e = new Date(today.getFullYear(), today.getMonth(), 0);
      ps = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      pe = new Date(today.getFullYear(), today.getMonth() - 1, 0);
      lbl = `เดือนที่แล้ว (${s.getMonth() + 1}/${s.getFullYear()})`;
    } else {
      const days = parseInt(rangeKey);
      e = today;
      s = new Date(today); s.setDate(today.getDate() - days + 1);
      pe = new Date(s); pe.setDate(s.getDate() - 1);
      ps = new Date(pe); ps.setDate(pe.getDate() - days + 1);
      lbl = `${days} วันล่าสุด`;
    }
    return { startDate: isoToLocalDateStr(s), endDate: isoToLocalDateStr(e),
      prevStart: isoToLocalDateStr(ps), prevEnd: isoToLocalDateStr(pe), rangeLabel: lbl };
  }, [rangeKey, todayKey, singleDate]);

  const inRange = (d, s, e) => d >= s && d <= e;

  const adminIds = useMemo(() => { const s = new Set(); (staff||[]).forEach(x => { if (x?.role === "admin" && !EXCLUDED_ADMIN_STAFF_IDS.has(x.id)) s.add(x.id); }); return s; }, [staff]);
  const staffMap = useMemo(() => { const m = {}; (staff||[]).forEach(s => { m[s.id] = s; }); return m; }, [staff]);
  const promoMap = useMemo(() => { const m = {}; (promos||[]).forEach(p => { m[p.id] = p; }); return m; }, [promos]);
  const procMap = useMemo(() => { const m = {}; (procedures||[]).forEach(p => { m[p.id] = p; }); return m; }, [procedures]);
  const branchMap = useMemo(() => { const m = {}; (branches||[]).forEach(b => { m[b.id] = b; }); return m; }, [branches]);
  const getLD = (q) => q.createdAt ? isoToLocalDateStr(q.createdAt) : (q.date || "");

  const all = allQueues || queues || [];

  // ตัด "rescheduled_in" ออก — คิวที่ถูกเลื่อนนัดจะมี 2 แถวใน DB เสมอ (แถวเดิม status เปลี่ยนเป็น
  // "rescheduled" + แถวใหม่ status "rescheduled_in") ถ้าไม่ตัดจะนับคิวเดียวกันซ้ำสองเมื่อทั้งวันเดิม
  // และวันใหม่ตกอยู่ในช่วงที่เลือก (dayANO กันจุดนี้ไว้แล้วแต่ dayQ ลืมกัน)
  const dayQ = useMemo(() => all.filter(q => q.status !== "rescheduled_in" && inRange(q.date, startDate, endDate)), [all, startDate, endDate]);
  const dayANO = useMemo(() => all.filter(q => adminIds.has(q.recordedBy) && (q.customerType==="new"||q.customerType==="old") && q.status !== "rescheduled_in" && inRange(getLD(q), startDate, endDate)), [all, adminIds, startDate, endDate]);
  const prevANO = useMemo(() => all.filter(q => adminIds.has(q.recordedBy) && (q.customerType==="new"||q.customerType==="old") && q.status !== "rescheduled_in" && inRange(getLD(q), prevStart, prevEnd)), [all, adminIds, prevStart, prevEnd]);

  const newC = dayANO.filter(q => q.customerType==="new").length;
  const oldC = dayANO.filter(q => q.customerType==="old").length;
  const newPct = dayANO.length > 0 ? Math.round((newC/dayANO.length)*100) : 0;

  const selectedDays = useMemo(() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    return Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }, [startDate, endDate]);

  const trendRange = useMemo(() => {
    if (rangeKey === "today") {
      const end = new Date(singleDate);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return {
        start: isoToLocalDateStr(start),
        end: isoToLocalDateStr(end),
        label: `7 วันล่าสุด ถึง ${formatThaiDate(singleDate)}`,
      };
    }

    return {
      start: startDate,
      end: endDate,
      label: rangeLabel,
    };
  }, [rangeKey, singleDate, startDate, endDate, rangeLabel]);

  // ขอช่วงที่หน้านี้ใช้จริงทั้งหมด: เทียบช่วงก่อนหน้า (prevStart) + กราฟแนวโน้ม 7 วันในโหมด "วันนี้" (trendRange.start)
  // และถึง "วันนี้" เสมอ เพราะสถิติแอดมิน (dayANO) นับตาม createdAt แต่ DB กรองตาม date (วันนัดอาจอยู่หลัง endDate)
  const rangeFrom = trendRange.start < prevStart ? trendRange.start : prevStart;
  const rangeTo = endDate > todayKey ? endDate : todayKey;
  useEffect(() => { onRangeNeeded?.(rangeFrom, rangeTo); }, [rangeFrom, rangeTo, onRangeNeeded]);

  // daily trend within selected range
  const trend = useMemo(() => {
    const arr = [], s = new Date(trendRange.start), e = new Date(trendRange.end);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) {
      const k = isoToLocalDateStr(d);
      // ตัด rescheduled_in เหมือน dayQ/dayANO — กันวันที่มีคิวถูกเลื่อนนัดนับซ้ำสอง
      const c = all.filter(q => q.status !== "rescheduled_in" && q.date === k).length;
      const dt = new Date(k);
      arr.push({day:k, label:["อา","จ","อ","พ","พฤ","ศ","ส"][dt.getDay()]+" "+dt.getDate()+"/"+(dt.getMonth()+1), q:c});
    }
    return arr;
  }, [all, trendRange.start, trendRange.end]);
  const tMax = Math.max(...trend.map(d=>d.q), 1);

  const bStats = useMemo(() => {
    const m = {}; (branches||[]).forEach(b => { m[b.id]={id:b.id, name:b.name, total:0, new:0, old:0, course:0}; });
    // total นับทุกประเภทลูกค้า (มาจาก dayQ) แต่เดิมแยกโชว์แค่ใหม่/เก่า ไม่มีคอร์ส — ผลรวม
    // 🆕+🔄 บนหน้าจอเลยไม่เท่ากับ "คิวทั้งหมด" ที่โชว์คู่กันถ้าสาขานั้นมีคิวคอร์สด้วย
    dayQ.forEach(q => { if(!m[q.branchId]) return; m[q.branchId].total++; if(q.customerType==="new") m[q.branchId].new++; else if(q.customerType==="old") m[q.branchId].old++; else if(q.customerType==="course") m[q.branchId].course++; });
    return Object.values(m).sort((a,b)=>b.total-a.total);
  }, [branches, dayQ]);

  const aPerf = useMemo(() => {
    // จัดกลุ่มด้วย staff id ไม่ใช่ชื่อเล่น — ชื่อเล่นซ้ำกันได้ระหว่างพนักงานคนละคน (พบได้บ่อยกับชื่อเล่นไทยสั้นๆ)
    // ถ้าจัดกลุ่มด้วยชื่อจะรวมผลงานคนละคนเป็นแถวเดียวผิดคน
    const m = {}; dayANO.forEach(q => { const s=staffMap[q.recordedBy]; if(!s) return; const n=s.nickname||s.name;
      if(!m[s.id]) m[s.id]={id:s.id,name:n,total:0,new:0,old:0}; m[s.id].total++; if(q.customerType==="new") m[s.id].new++; else m[s.id].old++; });
    return Object.values(m).sort((a,b)=>b.total-a.total);
  }, [dayANO, staffMap]);

  const sStats = useMemo(() => {
    const counts = {};
    dayQ.forEach((q) => {
      if (!q?.status) return;
      counts[q.status] = (counts[q.status] || 0) + 1;
    });

    const knownValues = new Set(QUEUE_STATUSES.map((s) => s.value));
    const known = QUEUE_STATUSES
      .map((s) => ({ ...s, count: counts[s.value] || 0 }))
      .filter((s) => s.count > 0);

    const unknown = Object.entries(counts)
      .filter(([value, count]) => !knownValues.has(value) && count > 0)
      .map(([value, count]) => ({
        value,
        label: value,
        emoji: "•",
        color: "#6b7280",
        bg: "#f3f4f6",
        count,
      }));

    return [...known, ...unknown];
  }, [dayQ]);

  const pStats = useMemo(() => {
    const m = {}; dayQ.forEach(q => { if(!q.promoId||q.customerType==="course") return;
      const p=promoMap[q.promoId];
      // "ใช้คอร์ส" ไม่ใช่โปรการตลาด (แค่ป้ายว่าใช้แพ็กเกจที่จ่ายไปแล้ว) — ตัดออกเหมือนที่กันไว้ใน
      // branchDiagnostics กันตัวเลขสองจุดนี้ไม่ตรงกัน
      if (p?.name === COURSE_USE_PROMO_NAME) return;
      const nm=p?p.name:q.promoId, pc=p?procMap[p.procedureId]:null;
      if(!m[q.promoId]) m[q.promoId]={name:nm, proc:pc?pc.name:"", count:0}; m[q.promoId].count++; });
    return Object.values(m).sort((a,b)=>b.count-a.count);
  }, [dayQ, promoMap, procMap]);
  const pTop = pStats.slice(0,10), pMax = pTop[0]?.count||1;

  const peakD = useMemo(() => { if(!trend.length) return null;
    return { peak: trend.reduce((a,b)=>b.q>a.q?b:a), low: trend.reduce((a,b)=>b.q<a.q?b:a), avg: Math.round(trend.reduce((s,d)=>s+d.q,0)/trend.length) };
  }, [trend]);

  const confRate = useMemo(() => { const c=dayQ.filter(q=>q.status==="confirmed"||q.status==="done").length; return dayQ.length>0?Math.round((c/dayQ.length)*100):0; }, [dayQ]);
  // ฐานเทียบ (p) น้อยเกินไป (<10) แล้วโชว์ % จะบวมจนไม่มีความหมาย (เช่น 2→20 = "+900%")
  // เหมือนที่กันไว้แล้วในโซน "สาขาเติบโต/ลดลง" — ใช้เกณฑ์เดียวกัน
  const delta = (c,p) => {
    if (!p) return "";
    const d = c - p;
    if (p < SMALL_BASE) return d>=0 ? `▲ +${d} คิว` : `▼ ${d} คิว`;
    const pc = Math.round((d/p)*100);
    return d>=0 ? `▲ +${d} (+${pc}%)` : `▼ ${d} (${pc}%)`;
  };
  const dColor = (c,p) => c>=p?"#2E7D32":"#C62828";
  const dateLabel = rangeLabel;

  // ─── 1. Day of week analysis ───
  const dowStats = useMemo(() => {
    const days = ["อา","จ","อ","พ","พฤ","ศ","ส"];
    const sums = days.map((d,i) => ({label:d, idx:i, sum:0, occurrences:0}));
    dayANO.forEach(q => { const dt = new Date(getLD(q)); sums[dt.getDay()].sum++; });
    // หารด้วยจำนวนครั้งที่วันในสัปดาห์นั้นเกิดขึ้นจริงในช่วงที่เลือก ให้เป็น "เฉลี่ยต่อครั้ง" จริงๆ
    // ไม่งั้นช่วงที่มีวันจันทร์ 5 ครั้งแต่วันศุกร์ 4 ครั้ง จะดูเหมือนจันทร์คิวเยอะกว่าทั้งที่แค่มีจำนวน
    // ครั้งมากกว่า ไม่ใช่เพราะจันทร์คิวเยอะกว่าจริง (caption การ์ดนี้บอกว่าเป็น "เฉลี่ย" ต้องคำนวณให้ตรง)
    const s = new Date(startDate), e = new Date(endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) sums[d.getDay()].occurrences++;
    return sums.map(x => ({ label: x.label, idx: x.idx, count: x.occurrences > 0 ? Math.round(x.sum / x.occurrences) : 0 }));
  }, [dayANO, startDate, endDate]);
  const dowMax = Math.max(...dowStats.map(d=>d.count),1);

  // ─── 2. New/old ratio vs previous ───
  const prevNewC = prevANO.filter(q=>q.customerType==="new").length;
  const prevOldC = prevANO.filter(q=>q.customerType==="old").length;
  const prevNewPct = prevANO.length>0 ? Math.round((prevNewC/prevANO.length)*100) : 0;

  // ─── 3. Cancel / no-show rate ───
  const noShowC = dayQ.filter(q=>q.status==="no_show").length;
  const cancelC = dayQ.filter(q=>q.status==="cancelled").length;
  const lostPct = dayQ.length>0 ? Math.round(((noShowC+cancelC)/dayQ.length)*100) : 0;

  // ─── 4. Branch growth ───
  // ตัด rescheduled_in เหมือน dayQ — กันช่วง "ก่อนหน้า" นับคิวเลื่อนนัดซ้ำสองไม่เท่ากับช่วง "ตอนนี้"
  const prevDayQ = useMemo(() => all.filter(q => q.status !== "rescheduled_in" && inRange(q.date, prevStart, prevEnd)), [all, prevStart, prevEnd]);
  const bGrowth = useMemo(() => {
    // เดิมกรอง bStats.filter(total>0) ก่อนคำนวณ prev — ตัดสาขาที่คิวหล่นเหลือ 0 ในช่วงนี้ทิ้งไปเลย
    // ทั้งที่นั่นคือเคส "▼100%" ที่ร้ายแรงที่สุดและเป็นเป้าหมายหลักของหัวข้อนี้ (ทำไมถึงเปลี่ยน) ต้อง
    // คำนวณ prev ให้ทุกสาขาก่อน แล้วค่อยกรองด้วย total>0 หรือ prev>0 (เคยมีคิวฝั่งใดฝั่งหนึ่งก็พอ)
    const rows = bStats.map(b => {
      const bid = b.id;
      const prev = bid ? prevDayQ.filter(q=>q.branchId===bid).length : 0;
      const ch = changePct(b.total, prev);
      return {...b, bid, prev, ch};
    }).filter(b => b.total > 0 || b.prev > 0);
    return rows;
  }, [bStats, prevDayQ]);
  const bRows = useMemo(() => [...bGrowth].sort(sorterFor(branchSortMode)), [bGrowth, branchSortMode]);

  // ─── 4b. เจาะสาเหตุรายสาขา — new/old/course + อัตรา no-show/ยกเลิก + โปรที่เปลี่ยนแปลงมากสุด ───
  const branchDiagnostics = useMemo(() => {
    const promoCounts = (arr) => {
      const pm = {};
      arr.forEach((q) => {
        if (!q.promoId || q.customerType === "course") return;
        const p = promoMap[q.promoId];
        // "ใช้คอร์ส" ไม่ใช่โปรการตลาด — เป็นแค่ป้ายว่าใช้แพ็กเกจที่จ่ายไปแล้ว ตัดทิ้งแม้ประเภท
        // ลูกค้าจะไม่ใช่ "คอร์ส" ก็ตาม (บางเคสลูกค้าใหม่/เก่าก็เลือกโปรนี้ได้)
        if (p?.name === COURSE_USE_PROMO_NAME) return;
        // ชื่อโปรอื่นที่ใช้ซ้ำกันหลายหัตถการ (คนละ promoId) — ต้องพ่วงชื่อหัตถการ
        // กันโชว์ชื่อซ้ำแยกแถวโดยไม่รู้ว่าอันไหนคืออันไหน
        const proc = p ? procMap[p.procedureId] : null;
        const name = p ? (proc ? `${p.name} (${proc.name})` : p.name) : q.promoId;
        if (!pm[q.promoId]) pm[q.promoId] = { name, count: 0 };
        pm[q.promoId].count += 1;
      });
      return pm;
    };

    const m = {};
    bGrowth.forEach((b) => {
      if (!b.bid) return;
      const cur = dayQ.filter((q) => q.branchId === b.bid);
      const prev = prevDayQ.filter((q) => q.branchId === b.bid);
      const curPromo = promoCounts(cur), prevPromo = promoCounts(prev);
      const toCounts = (pm) => Object.fromEntries(Object.entries(pm).map(([id, v]) => [id, v.count]));
      // เก็บ promoId ไว้เป็น key — ชื่อโปรซ้ำกันได้ (เช่น "ใช้คอร์ส" คนละหัตถการ แม้ในนี้กันไปแล้ว
      // แต่โปรอื่นก็ตั้งชื่อซ้ำกันได้เหมือนกัน) ใช้ name เป็น React key ตรงๆ เสี่ยงชนกัน
      const movers = topMovers(toCounts(curPromo), toCounts(prevPromo),
        (id) => curPromo[id]?.name || prevPromo[id]?.name || id);

      m[b.bid] = {
        cur: byCustomerType(cur), prev: byCustomerType(prev),
        lostCur: lostStat(cur), lostPrev: lostStat(prev),
        movers,
      };
    });
    return m;
  }, [bGrowth, dayQ, prevDayQ, promoMap, procMap]);

  // ─── 4c. หัตถการเติบโต / ลดลง — โครงเดียวกับโซนสาขา แต่จัดกลุ่มด้วยหัตถการแทน ───
  // ใช้ q.procedureId ตรงๆ ไม่อ้อมผ่านโปร (เหมือน adminProcedureStats) — คิวที่ไม่ได้แท็กโปรจะได้ไม่
  // หายไปเงียบๆ จากยอด แบ่งกลุ่มครั้งเดียวแล้วให้ทั้ง pGrowth และ procDiagnostics ใช้ต่อ ไม่ filter
  // ซ้ำต่อหัตถการ (คิวช่วง 28 วันของทั้งเครือหลักหมื่นแถว × หัตถการหลายสิบตัว)
  const procGroups = useMemo(() => {
    const m = {};
    const put = (q, key) => {
      if (!q.procedureId) return;
      if (!m[q.procedureId]) m[q.procedureId] = { cur: [], prev: [] };
      m[q.procedureId][key].push(q);
    };
    dayQ.forEach((q) => put(q, "cur"));
    prevDayQ.forEach((q) => put(q, "prev"));
    return m;
  }, [dayQ, prevDayQ]);

  const pGrowth = useMemo(() => Object.entries(procGroups).map(([id, g]) => {
    const total = g.cur.length, prev = g.prev.length;
    // หัตถการที่ถูกลบไปแล้วแต่คิวเก่ายังอ้างถึงอยู่ — โชว์ป้ายกำกับไว้ ดีกว่าซ่อนแถวจนยอดไม่ครบ
    const name = procMap[id]?.name || "(หัตถการที่ถูกลบแล้ว)";
    return { id, name, total, prev, ch: changePct(total, prev) };
  }), [procGroups, procMap]);
  const pRows = useMemo(() => [...pGrowth].sort(sorterFor(procSortMode)), [pGrowth, procSortMode]);

  // เจาะสาเหตุรายหัตถการ — new/old/course + อัตรายกเลิก/ไม่มา + "สาขาไหนทำให้เปลี่ยน"
  // (โซนสาขาโชว์โปรที่ขยับ ส่วนโซนนี้โชว์สาขาที่ขยับ — เป็นคำตอบตรงคำถามว่ายอดหัตถการนี้หายไปไหน)
  const procDiagnostics = useMemo(() => {
    const branchCounts = (arr) => {
      const c = {};
      arr.forEach((q) => { if (!q.branchId) return; c[q.branchId] = (c[q.branchId] || 0) + 1; });
      return c;
    };
    const m = {};
    Object.entries(procGroups).forEach(([id, g]) => {
      m[id] = {
        cur: byCustomerType(g.cur), prev: byCustomerType(g.prev),
        lostCur: lostStat(g.cur), lostPrev: lostStat(g.prev),
        movers: topMovers(branchCounts(g.cur), branchCounts(g.prev), (bid) => branchMap[bid]?.name || bid),
      };
    });
    return m;
  }, [procGroups, branchMap]);

  // ─── 5. Admin new customer ranking ───
  const adminNewRank = useMemo(() => {
    // จัดกลุ่มด้วย staff id เหมือน aPerf — กันชื่อเล่นซ้ำรวมผลงานผิดคน
    const m = {}; dayANO.filter(q=>q.customerType==="new").forEach(q => {
      const s=staffMap[q.recordedBy]; if(!s) return; const n=s.nickname||s.name;
      if (!m[s.id]) m[s.id] = { id: s.id, name: n, count: 0 };
      m[s.id].count++; });
    return Object.values(m).sort((a,b)=>b.count-a.count);
  }, [dayANO, staffMap]);

  // ─── 6. Promo new customer effectiveness ───
  const promoNewEff = useMemo(() => {
    // ตัวหาร (total/new) นับเฉพาะคิวที่ "เสร็จจริง" (status=done) — ไม่งั้นโปรที่มีคนจองแต่เบี้ยว/
    // ยกเลิกเยอะจะยังดูเหมือน "ดึงลูกค้าใหม่ได้ดี" ทั้งที่ไม่ได้แปลงเป็นลูกค้าจริงเลย ส่วน lost/allCount
    // นับทุกสถานะ (แยกคำนวณคู่กัน) เพื่อโชว์อัตราเบี้ยว/ยกเลิกของโปรนั้นไว้เตือนด้วย
    const m = {}; dayQ.forEach(q => { if(!q.promoId||q.customerType==="course") return;
      const p=promoMap[q.promoId];
      if (p?.name === COURSE_USE_PROMO_NAME) return; // เหตุผลเดียวกับ pStats ด้านบน
      const nm=p?p.name:q.promoId;
      if(!m[q.promoId]) m[q.promoId]={name:nm, total:0, new:0, allCount:0, lost:0};
      m[q.promoId].allCount++;
      if (q.status==="cancelled"||q.status==="no_show") m[q.promoId].lost++;
      if (q.status==="done") { m[q.promoId].total++; if(q.customerType==="new") m[q.promoId].new++; }
    });
    // ต้อง ≥10 ครั้งเสร็จจริงถึงจะเอามาจัดอันดับ — ตัวอย่างน้อยกว่านี้ยังไม่พอเชื่อ
    // จัดอันดับด้วย Wilson lower bound ไม่ใช่ % ดิบ — กัน "10/10 = 100%" ชนะ "731/875 = 84%"
    // ทั้งที่ตัวหลังมีตัวอย่างเยอะกว่ามากและน่าเชื่อถือกว่าจริงๆ
    // เก็บ "ค้างสถานะ" (ยังไม่ปิดเป็นเสร็จ/เบี้ยว/ยกเลิก) ไว้ด้วย — ไม่งั้นเสร็จ+เบี้ยวรวมกันไม่ครบ
    // allCount ผู้อ่านบวกเลขในหัวแล้วงงว่าส่วนที่หายไปคืออะไร (ดูเหมือน 89% กับ 27% เทียบกันตรงๆ
    // ทั้งที่คนละตัวหาร — ต้องโชว์ให้ครบทั้ง 3 ก้อนของยอดจองทั้งหมด)
    return Object.values(m).filter(p=>p.total>=10).map(p => {
      const pending = p.allCount - p.total - p.lost;
      // ปัด % ทั้ง 3 กลุ่มพร้อมกันด้วย apportionPercents ให้รวมกันได้ 100 เป๊ะเสมอ — ปัดแยกกันแบบ
      // เดิมมี edge case รวมกันได้ 99 หรือ 101 ขัดกับที่แถบ/คำอธิบายอ้างว่า "ครบ 100% เสมอ"
      const [donePct, lostPct, pendingPct] = apportionPercents([p.total, p.lost, pending], p.allCount);
      return {
        ...p,
        pending,
        wilson: wilsonLowerBound(p.new, p.total),
        lostPct, donePct, pendingPct,
      };
    });
  }, [dayQ, promoMap]);

  // ─── 7. แอดมิน × หัตถการ — ใครถนัดปิดอะไร (เอาไว้จับคู่แชร์เทคนิคกัน) ───
  // ยอดรวมเยอะ/น้อยเทียบกันตรงๆ ไม่แฟร์ (สาขาเล็ก/แอดมินใหม่เสียเปรียบเสมอ) แต่ "ถนัดหัตถการไหน"
  // เทียบกันได้แฟร์กว่า เพราะเทียบแค่ในกลุ่มคนที่ปิดหัตถการเดียวกันจริง ไม่ปนกับขนาดสาขา
  // scope เดียวกับตารางแอดมินอื่นในหน้านี้ (คิวแอดมินเท่านั้น, เฉพาะลูกค้าใหม่ — วัดความสามารถปิด
  // ลูกค้าใหม่โดยเฉพาะ ไม่ปนกับใช้คอร์ส/ลูกค้าเก่าที่กลับมาเอง)
  const adminProcedureStats = useMemo(() => {
    // ใช้ q.procedureId ตรงๆ (คิวมีฟิลด์นี้อยู่แล้ว ไม่ต้องอ้อมผ่านโปร) — เดิมกรองผ่าน q.promoId
    // ก่อน ทำให้คิวลูกค้าใหม่ที่ปิดได้จริงแต่ไม่ได้แท็กโปรหายไปเงียบๆ จากตารางนี้ (ต่างจากตาราง
    // "ดึงลูกค้าใหม่เก่งสุด" ที่ไม่กรองแบบนี้) เอาแยกออก ตอนนี้กว้างเท่ากับตารางอื่นในหน้านี้
    const byProc = {};
    dayANO.filter(q => q.customerType === "new" && q.procedureId).forEach(q => {
      const proc = procMap[q.procedureId];
      if (!proc) return;
      const s = staffMap[q.recordedBy];
      if (!s) return;
      if (!byProc[proc.id]) byProc[proc.id] = { procId: proc.id, procName: proc.name, admins: {}, total: 0 };
      const entry = byProc[proc.id];
      entry.total++;
      if (!entry.admins[s.id]) entry.admins[s.id] = { id: s.id, name: s.nickname || s.name, count: 0 };
      entry.admins[s.id].count++;
    });
    // ต้องมีตัวอย่างพอสมควร (≥5 ครั้งรวม) + มีมากกว่า 1 คนถึงจะ "เทียบ" กันได้จริง — เดิม ≥3 ต่ำไป
    // จนแค่ 2 ครั้งกับ 1 ครั้งก็ขึ้นเหรียญทองได้แล้ว
    return Object.values(byProc)
      .filter(p => p.total >= 5 && Object.keys(p.admins).length >= 2)
      .map(p => ({ ...p, admins: Object.values(p.admins).sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.total - a.total);
  }, [dayANO, procMap, staffMap]);

  const quickSummary = useMemo(() => {
    const trendText = dayANO.length > prevANO.length
      ? "จำนวนคิวที่แอดมินบันทึกเพิ่มขึ้นจากช่วงก่อนหน้า"
      : dayANO.length < prevANO.length
        ? "จำนวนคิวที่แอดมินบันทึกลดลงจากช่วงก่อนหน้า"
        : "จำนวนคิวที่แอดมินบันทึกใกล้เคียงช่วงก่อนหน้า";

    // ฐาน 0 (ไม่มีคิวเลยในช่วงที่เลือก) ห้ามฟันธง — newPct/lostPct/confRate จะเป็น 0 แบบเทียม
    // ไม่ใช่ค่าจริงที่ควรเอาไปตัดสินใจ
    const customerText = dayANO.length === 0
      ? "ยังไม่มีคิวในช่วงนี้"
      : newPct >= 50
        ? "ลูกค้าใหม่มากกว่าหรือเท่ากับลูกค้าเก่า"
        : "ลูกค้าเก่ากลับมาใช้บริการมากกว่าลูกค้าใหม่";

    const riskText = dayQ.length === 0
      ? "ยังไม่มีคิวในช่วงนี้"
      : lostPct <= LOST_RATE_GOOD_MAX
        ? "ความเสี่ยงต่ำ อัตรายกเลิก/ไม่มาค่อนข้างน้อย"
        : lostPct <= LOST_RATE_OK_MAX
          ? "ความเสี่ยงปานกลาง ควรติดตามลูกค้าก่อนวันนัด"
          : "ความเสี่ยงสูง ควรเร่งติดตามลูกค้าเพื่อลดการหลุดนัด";

    return [
      { icon: "📈", title: "แนวโน้มคิว", detail: trendText },
      { icon: "👥", title: "ภาพรวมลูกค้า", detail: dayANO.length === 0 ? customerText : `${customerText} (ใหม่ ${newPct}%)` },
      { icon: "🛟", title: "จุดที่ควรระวัง", detail: dayQ.length === 0 ? riskText : `${riskText} (ยืนยัน ${confRate}%)` },
    ];
  }, [dayANO.length, prevANO.length, newPct, lostPct, confRate, dayQ.length]);

  const adminPromoStats = useMemo(() => {
    const m = {};
    dayANO.forEach((q) => {
      if (!q.promoId) return;
      const p = promoMap[q.promoId];
      if (p?.name === COURSE_USE_PROMO_NAME) return; // เหตุผลเดียวกับ pStats ด้านบน
      const name = p ? p.name : q.promoId;
      if (!m[q.promoId]) m[q.promoId] = { name, count: 0 };
      m[q.promoId].count += 1;
    });
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [dayANO, promoMap]);

  const adminBranchStats = useMemo(() => {
    const m = {};
    (branches || []).forEach((b) => {
      m[b.id] = { id: b.id, name: b.name, total: 0 };
    });
    dayANO.forEach((q) => {
      if (!m[q.branchId]) return;
      m[q.branchId].total += 1;
    });
    return Object.values(m).filter((b) => b.total > 0).sort((a, b) => b.total - a.total);
  }, [branches, dayANO]);

  const topPromos = adminPromoStats.slice(0, 3);
  // ตัด "ดี" กับ "แย่" ไม่ให้ทับกัน — ถ้ามีสาขา/แอดมินน้อย (≤6) รายชื่อกลางๆ จะโผล่ทั้งสองคอลัมน์
  // พร้อมกัน ทำให้ดูเหมือนคนเดียวกันถูกตัดสินสองแบบตรงข้ามในการ์ดเดียว
  // กันซ้ำด้วย id ไม่ใช่ชื่อ — ชื่อเล่นซ้ำกันได้ระหว่างคนละคน (เหตุผลเดียวกับที่ aPerf จัดกลุ่มด้วย staff id)
  const topBranches = adminBranchStats.slice(0, 3);
  const topBranchIds = new Set(topBranches.map((b) => b.id));
  const lowBranches = [...adminBranchStats].filter((b) => !topBranchIds.has(b.id)).sort((a, b) => a.total - b.total).slice(0, 3);
  const topAdmins = aPerf.slice(0, 3);
  const topAdminIds = new Set(topAdmins.map((a) => a.id));
  const lowAdmins = [...aPerf].filter((a) => !topAdminIds.has(a.id)).sort((a, b) => a.total - b.total).slice(0, 3);

  const gridTwo = { display: "grid", gap: 16, marginBottom: 16 };
  const gridTwoNoBottom = { display: "grid", gap: 16 };

  return (
    <div className="ceo-dashboard-page" style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif", background: "#FAF7F5", minHeight: "100vh", padding: "24px 20px", margin: "-20px", color: "#2d2a26" }}>

      {/* Header */}
      <div className="ceo-dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#C9A9A6", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>✦ CEO Dashboard</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#2d2a26" }}>Qlass Clinic</h1>
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>📅 {rangeKey === "today" ? formatThaiDate(singleDate) : `${formatThaiDate(startDate)} — ${formatThaiDate(endDate)}`}</div>
        </div>
        <div className="ceo-dashboard-controls" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div className="ceo-dashboard-range-buttons" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {RANGES.map(r => (
              <button key={r.key} onClick={() => { setRangeKey(r.key); if (r.key === "today") setSingleDate(todayKey); }} style={{
                padding: "6px 14px", borderRadius: 20, border: "1px solid #e8e0dc",
                background: rangeKey === r.key ? "#2d2a26" : "#fff",
                color: rangeKey === r.key ? "#fff" : "#888",
                fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.2s",
              }}>{r.label}</button>
            ))}
          </div>
          {rangeKey === "today" && (
            <div className="ceo-dashboard-date-controls" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => { const d = new Date(singleDate); d.setDate(d.getDate()-1); setSingleDate(isoToLocalDateStr(d)); }}
                style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #e8e0dc", background: "#fff", cursor: "pointer", fontSize: 13, color: "#888" }}>◀</button>
              {/* fontSize ต้อง ≥16 เสมอ — ตัวเล็กกว่านี้จะโดน iOS Safari auto-zoom ตอนแตะ (index.css กันไว้
                  ที่ 16px สำหรับ input ทั่วไปแล้ว แต่ inline style ตรงนี้ทับไว้ที่ 12 ทำให้จุดนี้จุดเดียวหลุดกฎ)
                  max=วันนี้ — กันเลือกวันในอนาคต ไม่งั้นอัตรายกเลิก/ไม่มาจะฟันธง "ความเสี่ยงสูง" จากฐานข้อมูล
                  แทบว่างเปล่า (คิววันอนาคตยังไม่เกิดสถานะจริง ส่วนใหญ่ยังเป็น pending/confirmed) */}
              <input type="date" value={singleDate} max={todayKey} onChange={e => setSingleDate(e.target.value)}
                style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #e8e0dc", background: "#fff", color: "#2d2a26", fontSize: 16 }} />
              <button
                disabled={singleDate >= todayKey}
                onClick={() => { const d = new Date(singleDate); d.setDate(d.getDate()+1); setSingleDate(isoToLocalDateStr(d)); }}
                style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #e8e0dc", background: "#fff", cursor: singleDate >= todayKey ? "default" : "pointer", fontSize: 13, color: singleDate >= todayKey ? "#ddd" : "#888" }}>▶</button>
              {singleDate !== todayKey && (
                <button onClick={() => setSingleDate(todayKey)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #C9A9A6", background: "#C9A9A622", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#C9A9A6" }}>กลับวันนี้</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ceo-quick-summary">
        <div className="ceo-quick-summary-title">สรุปสั้นๆ สำหรับผู้บริหาร</div>
        <div className="ceo-quick-summary-grid">
          {quickSummary.map((item) => (
            <div key={item.title} className="ceo-quick-summary-item">
              <div className="ceo-quick-summary-item-title">{item.icon} {item.title}</div>
              <div className="ceo-quick-summary-item-detail">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        {/* การ์ดนี้กับ "คิวทั้งหมดในช่วงที่เลือก" ข้างล่างนับคนละแกนเวลา (บันทึก vs นัดหมาย) — ต้องบอก
            ให้ชัด กันเข้าใจผิดว่าสองใบนี้ควรเป็นตัวเลขเดียวกัน */}
        <StatCard icon="📋" label={`คิวที่แอดมินบันทึก (${dateLabel})`} value={fmtNum(dayANO.length)}
          sub={<>
            {prevANO.length===0
              ? <span style={{ color: "#999" }}>ไม่มีข้อมูลช่วงก่อนหน้า</span>
              : <span style={{color:dColor(dayANO.length,prevANO.length)}}>{delta(dayANO.length,prevANO.length)} เทียบช่วงก่อนหน้า</span>}
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>นับตามวันที่ "บันทึกคิว" ไม่ใช่วันนัด</div>
          </>}
          accent="#E8B4B8" />
        <StatCard icon="👤" label="ลูกค้าใหม่ เทียบ ลูกค้าเก่า" value={`${newC} / ${oldC}`}
          sub={dayANO.length > 0 ? `ใหม่ ${newPct}% · เก่า ${100-newPct}%` : "ไม่มีข้อมูล"} accent="#DDA0A0" />
        <StatCard icon="📋" label="คิวทั้งหมดในช่วงที่เลือก" value={fmtNum(dayQ.length)}
          sub={<span style={{ fontSize: 10, color: "#bbb" }}>นับตามวันที่ "นัดหมาย" ไม่ใช่วันบันทึก — คนละแกนกับการ์ดซ้ายสุด</span>}
          accent="#A9C9C3" />
        <StatCard icon="📊" label="ค่าเฉลี่ยคิวต่อวัน" value={Math.round(dayQ.length / selectedDays)} sub={`คำนวณจาก ${selectedDays} วัน`} accent="#B8A9C9" />
      </div>

      {/* Ad Spend — ตัดออกก่อน: ข้อมูลดึงจาก Google Sheet แบบ public link ไม่มีการยืนยันตัวตน/audit
          trail และ cache 1 ชม. ไม่ sync กับคิว realtime — รอทำให้ปลอดภัย/แม่นกว่านี้ก่อนค่อยเอากลับมา */}

      {/* 🏢 สาขาเติบโต / ลดลง — คำตอบหลักของ "ยอดเพิ่ม/ลดจากอะไร" เอาไว้เป็นสิ่งแรกที่เห็น ไม่ต้องพับ */}
      {/* การ์ดกว้างเต็ม (เหมือนการ์ดค่าโฆษณาด้านบน) — จำกัดแค่ความกว้าง "เนื้อหาข้างใน" ไม่ใช่ตัวการ์ด
          กันไม่ให้การ์ดหดจนเหลือที่ว่างโล่งๆ ข้างๆ ดูเหมือนหน้าพัง */}
      <div style={{ marginBottom: 16, width: "100%" }}>
        <SectionCard title="🏢 สาขาเติบโต / ลดลง — ทำไมถึงเปลี่ยน">
          <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>เทียบยอดคิวช่วงนี้กับช่วงก่อนหน้าของแต่ละสาขา กดที่แถวสาขาเพื่อดูว่าเปลี่ยนเพราะอะไร (ลูกค้าใหม่/เก่า/คอร์ส, อัตรายกเลิก, โปรที่เปลี่ยนแปลง)</div>
          <SortToggle mode={branchSortMode} onChange={setBranchSortMode} />
          <GrowthList
            sortMode={branchSortMode}
            rows={bRows}
            cap={LIST_CAP}
            showAll={showAllBranchGrowth}
            onToggleShowAll={() => setShowAllBranchGrowth(v => !v)}
            expandedId={expandedBranchId}
            onToggleRow={setExpandedBranchId}
            diagnostics={branchDiagnostics}
            moversTitle="โปรที่เปลี่ยนแปลงมากสุด"
            moreLabel="สาขา"
          />
        </SectionCard>
      </div>

      {/* 💉 หัตถการเติบโต / ลดลง — คู่กับโซนสาขา ตอบว่า "ของที่ขายเปลี่ยนไป" ไม่ใช่แค่ "ที่ไหนเปลี่ยน" */}
      <div style={{ marginBottom: 16, width: "100%" }}>
        <SectionCard title="💉 หัตถการเติบโต / ลดลง — ทำไมถึงเปลี่ยน">
          <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>เทียบยอดคิวช่วงนี้กับช่วงก่อนหน้าของแต่ละหัตถการ (นับทุกสาขารวมกัน) กดที่แถวเพื่อดูว่าเปลี่ยนเพราะอะไร (ลูกค้าใหม่/เก่า/คอร์ส, อัตรายกเลิก, สาขาที่เปลี่ยนแปลง)</div>
          <SortToggle mode={procSortMode} onChange={setProcSortMode} />
          <GrowthList
            sortMode={procSortMode}
            rows={pRows}
            cap={LIST_CAP}
            showAll={showAllProcGrowth}
            onToggleShowAll={() => setShowAllProcGrowth(v => !v)}
            expandedId={expandedProcId}
            onToggleRow={setExpandedProcId}
            diagnostics={procDiagnostics}
            moversTitle="สาขาที่เปลี่ยนแปลงมากสุด"
            moreLabel="หัตถการ"
          />
        </SectionCard>
      </div>

      {/* ปุ่มกางรายละเอียดเพิ่มเติม — ผู้บริหารเห็นแค่สรุป+เหตุผลหลักก่อน ไม่บังคับเลื่อนผ่านของที่ไม่จำเป็น */}
      <div style={{ textAlign: "center", margin: "0 0 24px" }}>
        <button
          onClick={() => setShowDetails(v => !v)}
          style={{ border: "1px solid #e8e0dc", background: showDetails ? "#2d2a26" : "#fff", color: showDetails ? "#fff" : "#8b7f76", borderRadius: 20, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          {showDetails ? "▲ ซ่อนรายละเอียดเพิ่มเติม" : "▾ ดูรายละเอียดเพิ่มเติม (โปร, แอดมิน, สถิติเชิงลึก)"}
        </button>
      </div>

      {showDetails && (
      <>
      <div className="ceo-rank-grid">
        <SectionCard title="🏷️ โปรเด่น 3 อันดับ (คิวแอดมินเท่านั้น)">
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>โปรที่มีคนจองเยอะสุด (ไม่รวม "ใช้คอร์ส" เพราะไม่ใช่โปรการตลาด) ไม่แยกใหม่/เก่า</div>
          {topPromos.length === 0 ? <div style={{ color: "#ccc", fontSize: 13 }}>ไม่มีข้อมูล</div> : (
            <div className="ceo-rank-list">
              {topPromos.map((p, i) => (
                <div key={p.name + i} className="ceo-rank-item">
                  <span className="ceo-rank-badge">#{i + 1}</span>
                  <span className="ceo-rank-name">{p.name}</span>
                  <span className="ceo-rank-value">{p.count} คิว</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="🏢 สาขาเด่น 3 / สาขาที่ควรระวัง 3 (คิวแอดมินเท่านั้น)">
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>สาขาที่คิวเยอะสุด/น้อยสุด — วัดจากยอดดิบช่วงนี้ ไม่ได้เทียบกับช่วงก่อน</div>
          <div className="ceo-dual-rank">
            <div>
              <div className="ceo-dual-rank-title">ดี</div>
              {topBranches.length === 0 ? <div style={{ color: "#ccc", fontSize: 13 }}>ไม่มีข้อมูล</div> : (
                <div className="ceo-rank-list">
                  {topBranches.map((b, i) => (
                    <div key={b.name + i} className="ceo-rank-item good">
                      <span className="ceo-rank-badge">#{i + 1}</span>
                      <span className="ceo-rank-name">{b.name}</span>
                      <span className="ceo-rank-value">{b.total} คิว</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="ceo-dual-rank-title">แย่</div>
              {lowBranches.length === 0 ? <div style={{ color: "#ccc", fontSize: 13 }}>ไม่มีข้อมูล</div> : (
                <div className="ceo-rank-list">
                  {lowBranches.map((b, i) => (
                    <div key={`low-${b.name}-${i}`} className="ceo-rank-item bad">
                      <span className="ceo-rank-badge">#{i + 1}</span>
                      <span className="ceo-rank-name">{b.name}</span>
                      <span className="ceo-rank-value">{b.total} คิว</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="👤 แอดมินเด่น 3 / แอดมินที่ควรโค้ช 3 (คิวแอดมินเท่านั้น)">
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>แอดมินที่ปิดคิวได้เยอะสุด/น้อยสุด — วัดจากยอดดิบ ไม่ได้ปรับตามชั่วโมงทำงานหรือขนาดสาขา</div>
          <div className="ceo-dual-rank">
            <div>
              <div className="ceo-dual-rank-title">ดี</div>
              {topAdmins.length === 0 ? <div style={{ color: "#ccc", fontSize: 13 }}>ไม่มีข้อมูล</div> : (
                <div className="ceo-rank-list">
                  {topAdmins.map((a, i) => (
                    <div key={a.name + i} className="ceo-rank-item good">
                      <span className="ceo-rank-badge">#{i + 1}</span>
                      <span className="ceo-rank-name">{a.name}</span>
                      <span className="ceo-rank-value">{a.total} คิว</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="ceo-dual-rank-title">แย่</div>
              {lowAdmins.length === 0 ? <div style={{ color: "#ccc", fontSize: 13 }}>ไม่มีข้อมูล</div> : (
                <div className="ceo-rank-list">
                  {lowAdmins.map((a, i) => (
                    <div key={`low-admin-${a.name}-${i}`} className="ceo-rank-item bad">
                      <span className="ceo-rank-badge">#{i + 1}</span>
                      <span className="ceo-rank-name">{a.name}</span>
                      <span className="ceo-rank-value">{a.total} คิว</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Charts Row */}
      <div className="ceo-grid-2" style={gridTwo}>

        {/* Trend */}
        <SectionCard title={`📈 แนวโน้มรายวัน — ${trendRange.label}`}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>จำนวนคิวทั้งเครือข่ายรายวัน (แท่งสีเข้มสุด = วันล่าสุด) ดูได้ว่าวันไหนคิวเยอะ/น้อยผิดปกติ</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: trend.length>14?1:4, height: 140, padding: "0 4px" }}>
            {trend.map(({day,label,q},i)=>{const isLast=i===trend.length-1; return (
              <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: trend.length>14?0:9, color: "#bbb", marginBottom: 4 }}>{trend.length<=14?(q||''):''}</div>
                <div title={`${label}: ${q} คิว`} style={{ width: "70%", height: Math.max(4, (q/tMax)*100),
                  background: isLast ? "linear-gradient(180deg, #2d2a26, #4a3f38)" : "linear-gradient(180deg, #E8B4B8, #E8B4B888)",
                  borderRadius: "6px 6px 0 0", transition: "height 0.5s ease" }} />
                {trend.length<=14 && <span style={{ fontSize: 9, color: "#999", marginTop: 4 }}>{label}</span>}
              </div>
            );})}
          </div>
        </SectionCard>

        {/* Analytics */}
        <SectionCard title="🧠 สรุปภาพรวมแบบเร็ว">
          <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>รวมตัวเลขย่อย 4 อย่าง: สัดส่วนลูกค้าใหม่/เก่า, เทียบยอดกับช่วงก่อน, วันคิวเยอะ/น้อยสุด, และอัตรายืนยัน (วันคิวเยอะ/น้อยสุด อาจนับคนละช่วงเวลากับตัวอื่นๆ ในการ์ดนี้ — ดูหมายเหตุด้านล่าง)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* New/Old ratio bar */}
            <div>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>สัดส่วนลูกค้าใหม่ / เก่า</div>
              {/* dayANO.length===0 ต้องแยกเคส — ไม่งั้น newPct=0 จะวาดแถบ "เก่า 100%" หลอกตาทั้งที่ไม่มีข้อมูลเลย */}
              <div style={{ height: 20, borderRadius: 10, overflow: "hidden", display: "flex", background: "#f5f0ed" }}>
                {dayANO.length > 0 ? (<>
                  <div style={{ width: `${newPct}%`, background: "#E8B4B8", transition: "width 0.5s" }} />
                  <div style={{ width: `${100-newPct}%`, background: "#B8A9C9", transition: "width 0.5s" }} />
                </>) : null}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#999" }}>
                <span>🆕 ใหม่ {newC} ({dayANO.length > 0 ? `${newPct}%` : "—"})</span><span>🔄 เก่า {oldC} ({dayANO.length > 0 ? `${100-newPct}%` : "—"})</span>
              </div>
            </div>
            {/* Range comparison — flexWrap กันล้นจอแคบ (ไม่มีตัวไหนหดได้ ข้อความ/ตัวเลขไม่มีวรรคให้ตัด
                ถ้าไม่พอที่ให้ตกไปบรรทัดใหม่แทนโดนตัดหายไปเงียบๆ จาก overflow-x:hidden ของหน้า) */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px 16px", padding: "10px 14px", background: "#faf7f5", borderRadius: 12 }}>
              <div><div style={{ fontSize: 11, color: "#bbb" }}>ช่วงนี้</div><div style={{ fontSize: 20, fontWeight: 700 }}>{dayANO.length}</div></div>
              <div><div style={{ fontSize: 11, color: "#bbb" }}>ช่วงก่อนหน้า</div><div style={{ fontSize: 20, fontWeight: 700 }}>{prevANO.length}</div></div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {prevANO.length > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: dColor(dayANO.length,prevANO.length),
                  background: dayANO.length>=prevANO.length?"#E8F5E9":"#FFEBEE", padding: "4px 10px", borderRadius: 20 }}>
                  {delta(dayANO.length, prevANO.length)}
                </span>}
              </div>
            </div>
            {/* Peak/Low */}
            {peakD && <div style={{ fontSize: 12, color: "#666" }}>
              {/* peakD คำนวณจาก trendRange (7 วันย้อนหลังเสมอเมื่อดูโหมด "วันนี้") ต่างจาก
                  "ช่วงนี้/ช่วงก่อนหน้า" ข้างบนที่เป็นวันเดียวที่เลือก — ต้องบอกให้ชัดกันเข้าใจว่าคนละช่วง */}
              {rangeKey === "today" && <div style={{ fontSize: 10, color: "#bbb", marginBottom: 4 }}>(นับจาก 7 วันล่าสุด ไม่ใช่แค่วันที่เลือกด้านบน)</div>}
              <span style={{ color: "#2E7D32", fontWeight: 700 }}>📈 วันคิวเยอะสุด: {peakD.peak.label} ({peakD.peak.q} คิว)</span>
              <span style={{ margin: "0 8px", color: "#ddd" }}>|</span>
              <span style={{ color: "#C62828" }}>📉 วันคิวน้อยสุด: {peakD.low.label} ({peakD.low.q} คิว)</span>
              <span style={{ margin: "0 8px", color: "#ddd" }}>|</span>
              <span>เฉลี่ย {peakD.avg}/วัน</span>
            </div>}
            {/* Confirm rate — dayQ.length===0 ต้องไม่โชว์ "0%" หลอกตา (ไม่มีข้อมูล ≠ อัตรายืนยันแย่) */}
            <div style={{ fontSize: 12, color: "#666" }}>
              ✅ อัตราคอนเฟิร์ม (นับ "ยืนยันแล้ว"+"เสร็จแล้ว"): <span style={{ fontWeight: 700, color: dayQ.length===0 ? "#999" : (confRate>=70?"#2E7D32":"#E65100") }}>{dayQ.length===0 ? "—" : `${confRate}%`}</span>
              <span style={{ color: "#bbb", marginLeft: 6 }}>({dayQ.filter(q=>q.status==="confirmed"||q.status==="done").length}/{dayQ.length} คิว)</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="ceo-grid-2" style={gridTwo}>

        {/* Top Promos */}
        <SectionCard title={`🏷️ โปรโมชั่นยอดนิยม (${pStats.reduce((s,p)=>s+p.count,0)} คิว)`}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>นับยอดจองรวม (ไม่รวมลูกค้าคอร์ส/โปร "ใช้คอร์ส") ไม่ได้บอกว่าใหม่หรือเก่ากี่ % (ต่างจาก "โปรไหนดึงลูกค้าใหม่ได้ดี" ด้านล่างที่คำนวณ % ลูกค้าใหม่ให้)</div>
          {pTop.length===0 ? <div style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: 20 }}>ไม่มีข้อมูล</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pTop.map((p,i)=>{const colors=["#E8B4B8","#DDA0A0","#C9A9A6","#B8A9C9","#A9C9C3","#C9C9A9","#E8C4A8","#A9B8C9","#C9A9B8","#B8C9A9"]; return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${colors[i%10]}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: colors[i%10], flexShrink: 0 }}>{i+1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: "#999", flexShrink: 0, marginLeft: 8 }}>{p.count} คิว</span>
                    </div>
                    <div style={{ height: 5, background: "#f5f0ed", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(p.count/pMax)*100}%`, background: colors[i%10], borderRadius: 3, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                </div>
              );})}
              {pStats.length>10 && <div style={{ textAlign: "center", fontSize: 11, color: "#bbb" }}>+{pStats.length-10} โปรอื่นๆ</div>}
            </div>
          )}
        </SectionCard>

        {/* Admin Performance */}
        <SectionCard title={`🏆 ผลงานแอดมิน — ${dateLabel}`}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>จำนวนคิวที่แอดมินแต่ละคนบันทึกได้ในช่วงนี้ เรียงจากเยอะสุด (🆕 = ลูกค้าใหม่, 🔄 = ลูกค้าเก่า)</div>
          {aPerf.length===0 ? <div style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: 20 }}>ยังไม่มีข้อมูล</div> : (() => {
            const visible = showAllAdminPerf ? aPerf : aPerf.slice(0, LIST_CAP);
            const max = aPerf[0]?.total || 1;
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visible.map((a,i)=>{const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`; return (
                <div key={a.id || a.name} style={{ padding: "8px 10px", borderRadius: 12, background: "#faf7f5" }}>
                  {/* แยกยอดรวมกับป้ายใหม่/เก่าออกจากกันคนละแถว — เดิมยัดตัวเลข 3 ตัว (🆕, 🔄, รวม)
                      ไว้แถวเดียวกันชิดขวาหมด ชื่อยาว/ตัวเลขหลักเยอะแล้วเบียดกันจนอ่านไม่ออก */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: i<3?20:13, width: 28, flexShrink: 0, textAlign: "center" }}>{medal}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#2d2a26", flexShrink: 0 }}>{a.total}</div>
                  </div>
                  <div style={{ height: 5, background: "#f0ebe8", borderRadius: 3, overflow: "hidden", margin: "6px 0 4px", marginLeft: 38 }}>
                    <div style={{ height: "100%", width: `${(a.total/max)*100}%`, background: `hsl(${340-i*15}, 45%, 70%)`, borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#999", marginLeft: 38 }}>🆕 {a.new} ใหม่ · 🔄 {a.old} เก่า</div>
                </div>
              );})}
              {aPerf.length > LIST_CAP && (
                <button
                  onClick={() => setShowAllAdminPerf(v => !v)}
                  style={{ marginTop: 2, border: "1px solid #e8e0dc", background: "#faf7f5", color: "#B45309", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {showAllAdminPerf ? "ซ่อนรายการ" : `ดูเพิ่ม ${aPerf.length - LIST_CAP} คน`}
                </button>
              )}
            </div>
            );
          })()}
        </SectionCard>
      </div>

      {/* Branch + Status Row */}
      <div className="ceo-grid-2-1" style={gridTwo}>

        {/* Branch Breakdown */}
        <SectionCard title={`🏢 เปรียบเทียบสาขา — ${dateLabel}`}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>ยอดคิวปัจจุบันของแต่ละสาขา แยกใหม่/เก่า/คอร์ส (ดูการเปลี่ยนแปลงเทียบช่วงก่อนได้ที่การ์ด "สาขาเติบโต/ลดลง" ด้านบนสุดของหน้า)</div>
          {(() => {
            const activeBranches = bStats.filter(b=>b.total>0);
            const visible = showAllBranchBreakdown ? activeBranches : activeBranches.slice(0, LIST_CAP);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visible.map((b,i) => (
                  <div key={b.id || b.name} style={{ padding: 14, borderRadius: 14, background: "#faf7f5", border: "1px solid #f0ebe8" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{b.name}</div>
                    <div className="ceo-branch-metrics" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                      <div><div style={{ color: "#bbb" }}>คิวทั้งหมด</div><div style={{ fontWeight: 700, fontSize: 18, color: "#2d2a26" }}>{b.total}</div></div>
                      <div><div style={{ color: "#bbb" }}>🆕 ใหม่</div><div style={{ fontWeight: 700, fontSize: 16, color: "#3b82f6" }}>{b.new}</div></div>
                      <div><div style={{ color: "#bbb" }}>🔄 เก่า</div><div style={{ fontWeight: 700, fontSize: 16, color: "#f59e0b" }}>{b.old}</div></div>
                      <div><div style={{ color: "#bbb" }}>📦 คอร์ส</div><div style={{ fontWeight: 700, fontSize: 16, color: "#8b5cf6" }}>{b.course}</div></div>
                    </div>
                  </div>
                ))}
                {activeBranches.length===0 && <div style={{ textAlign: "center", color: "#ccc", padding: 20 }}>ไม่มีข้อมูล</div>}
                {activeBranches.length > LIST_CAP && (
                  <button
                    onClick={() => setShowAllBranchBreakdown(v => !v)}
                    style={{ marginTop: 2, border: "1px solid #e8e0dc", background: "#faf7f5", color: "#B45309", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {showAllBranchBreakdown ? "ซ่อนรายการ" : `ดูเพิ่ม ${activeBranches.length - LIST_CAP} สาขา`}
                  </button>
                )}
              </div>
            );
          })()}
        </SectionCard>

        {/* Queue Status */}
        <SectionCard title={`🎯 สถานะคิว (${dayQ.length})`}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>จำนวนคิวทั้งเครือข่ายแยกตามสถานะ (รอยืนยัน/ยืนยันแล้ว/เสร็จแล้ว/ยกเลิก/ไม่มา ฯลฯ) ของช่วงที่เลือก</div>
          {sStats.length===0 ? <div style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: 20 }}>ไม่มีคิว</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sStats.map(s => (
                <div key={s.value} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 12, background: s.bg }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.emoji} {s.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ─── Deep Analytics ─── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#2d2a26", marginBottom: 12 }}>🔬 วิเคราะห์เชิงลึก (สำหรับดูรายละเอียดเพิ่มเติม)</div>
        <div className="ceo-grid-2" style={gridTwo}>

          {/* 1. Day of week */}
          <SectionCard title="📅 วันไหนคิวเยอะที่สุด (คิวแอดมินเท่านั้น)">
            <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>เฉลี่ยจำนวนคิวแยกตามวันในสัปดาห์ (แท่งเขียว = วันที่เยอะสุด) ช่วยวางแผนกำลังคน/เวรทำงาน</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
              {dowStats.map((d,i) => (<div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: d.count===dowMax?"#2E7D32":"#bbb", fontWeight: d.count===dowMax?700:400, marginBottom: 3 }}>{d.count||""}</div>
                <div style={{ width: "70%", height: Math.max(4,(d.count/dowMax)*70), background: d.count===dowMax?"linear-gradient(180deg,#A9C9C3,#A9C9C388)":"linear-gradient(180deg,#E8B4B8,#E8B4B844)", borderRadius: "5px 5px 0 0", transition: "height 0.4s" }} />
                <span style={{ fontSize: 11, marginTop: 4, color: d.count===dowMax?"#2E7D32":"#999", fontWeight: d.count===dowMax?700:400 }}>{d.label}</span>
              </div>))}
            </div>
          </SectionCard>

          {/* 3. Cancel / No-show rate */}
          <SectionCard title="⚠️ อัตรายกเลิก / ไม่มา">
            <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>% คิวที่ถูกยกเลิกหรือลูกค้าไม่มาตามนัด เทียบกับค่าเฉลี่ยเครือข่ายย้อนหลัง 90 วัน (เขียว ≤{LOST_RATE_GOOD_MAX}%, เหลือง {LOST_RATE_GOOD_MAX}-{LOST_RATE_OK_MAX}%, แดง &gt;{LOST_RATE_OK_MAX}%)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: dayQ.length===0 ? "#ccc" : (lostPct>LOST_RATE_OK_MAX?"#C62828":lostPct>LOST_RATE_GOOD_MAX?"#E65100":"#2E7D32") }}>{dayQ.length===0 ? "—" : `${lostPct}%`}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, borderRadius: 7, overflow: "hidden", display: "flex", background: "#f5f0ed", marginBottom: 8 }}>
                  {cancelC>0 && <div style={{ width: `${dayQ.length>0?(cancelC/dayQ.length)*100:0}%`, background: "#E57373" }} />}
                  {noShowC>0 && <div style={{ width: `${dayQ.length>0?(noShowC/dayQ.length)*100:0}%`, background: "#FFB74D" }} />}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#999" }}>
                  <span>❌ ยกเลิก {cancelC}</span><span>🚫 ไม่มา {noShowC}</span>
                  <span style={{ color: "#bbb" }}>| ทั้งหมด {dayQ.length}</span>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
              {/* ไม่มีคิวเลย ≠ อัตรายกเลิกดี — ห้ามฟันธง "ยอดเยี่ยม" ทั้งที่ยังไม่มีข้อมูลให้ประเมิน */}
              {dayQ.length===0 ? "ยังไม่มีคิวในช่วงนี้" : (lostPct<=LOST_RATE_GOOD_MAX?"✅ ดีกว่าค่าเฉลี่ยเครือข่าย":lostPct<=LOST_RATE_OK_MAX?"📊 ปกติ — ใกล้เคียงค่าเฉลี่ยเครือข่าย":"⚠️ สูงกว่าค่าเฉลี่ยเครือข่ายชัดเจน — ควรติดตามลูกค้าเพิ่ม")}
            </div>
          </SectionCard>
        </div>

        <div className="ceo-grid-2" style={gridTwo}>

          {/* 2. New/Old ratio comparison */}
          <SectionCard title="📈 สัดส่วนลูกค้าใหม่ เทียบช่วงก่อน">
            <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>เทียบสัดส่วนลูกค้าใหม่ต่อลูกค้าเก่า (เฉพาะคิวแอดมิน) ระหว่างช่วงนี้กับช่วงก่อนหน้า — แถบสีชมพูมากขึ้น = ลูกค้าใหม่มากขึ้น</div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#bbb", marginBottom: 4 }}>ช่วงนี้</div>
                <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "#f5f0ed", marginBottom: 4 }}>
                  {dayANO.length > 0 && (<>
                    <div style={{ width: `${newPct}%`, background: "#E8B4B8" }} />
                    <div style={{ width: `${100-newPct}%`, background: "#B8A9C9" }} />
                  </>)}
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>🆕 {dayANO.length > 0 ? `${newPct}%` : "—"} ({newC}) · 🔄 {dayANO.length > 0 ? `${100-newPct}%` : "—"} ({oldC})</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#bbb", marginBottom: 4 }}>ช่วงก่อน</div>
                <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "#f5f0ed", marginBottom: 4 }}>
                  {prevANO.length > 0 && (<>
                    <div style={{ width: `${prevNewPct}%`, background: "#E8B4B8" }} />
                    <div style={{ width: `${100-prevNewPct}%`, background: "#B8A9C9" }} />
                  </>)}
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>🆕 {prevANO.length > 0 ? `${prevNewPct}%` : "—"} ({prevNewC}) · 🔄 {prevANO.length > 0 ? `${100-prevNewPct}%` : "—"} ({prevOldC})</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
              {/* ฐาน 0 ฝั่งใดฝั่งหนึ่งห้ามฟันธง newPct ปลอมเป็น 0 จะทำให้ประโยคสรุปผิดทิศทาง */}
              {(dayANO.length===0 || prevANO.length===0) ? "ข้อมูลไม่พอเทียบ (ไม่มีคิวในช่วงใดช่วงหนึ่ง)" :
                newPct>prevNewPct?"✅ ลูกค้าใหม่เพิ่มขึ้น — แอดทำงานดี":newPct<prevNewPct?"🔄 ลูกค้าเก่ากลับมาเยอะขึ้น":"📊 สัดส่วนคงที่"}
            </div>
          </SectionCard>
        </div>

        <div className="ceo-grid-2" style={gridTwoNoBottom}>

          {/* 5. Admin new customer ranking */}
          <SectionCard title="👑 แอดมิน — ดึงลูกค้าใหม่เก่งสุด">
            <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>จำนวนลูกค้าใหม่ (ไม่รวมคอร์ส) ที่แอดมินแต่ละคนปิดได้ในช่วงนี้ เรียงจากเยอะสุด</div>
            {adminNewRank.length===0 ? <div style={{ color: "#ccc", textAlign: "center", padding: 20 }}>ไม่มีข้อมูล</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {adminNewRank.slice(0,8).map((a,i)=>{const mx=adminNewRank[0].count; return (
                  <div key={a.id || a.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 24, fontSize: i<3?16:11, textAlign: "center", fontWeight: 700, color: "#C9A9A6" }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</div>
                    {/* minWidth:0 + overflow กัน flex:1 ดันแถวล้นจอมือถือเมื่อชื่อเล่นยาว/ไม่มีวรรค
                        (เหตุผลเดียวกับที่แก้แถวสาขาไปแล้ว) */}
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ width: 80, flexShrink: 0, height: 6, background: "#f5f0ed", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(a.count/mx)*100}%`, background: "#A9C9C3", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: "right", color: "#2d2a26" }}>{a.count}</div>
                  </div>
                );})}
              </div>
            )}
          </SectionCard>

          {/* 6. Promo new customer effectiveness */}
          <SectionCard title={promoSortMode==="lost" ? "🏷️ โปรไหนเบี้ยว/ยกเลิกเยอะสุด" : "🏷️ โปรไหนดึงลูกค้าใหม่ได้ดี"}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>แถบสีในแต่ละแถวคือยอดจองทั้งหมดของโปรนั้น แบ่งเป็น เสร็จแล้ว/เบี้ยว-ยกเลิก/ค้างสถานะ (รวมกันครบ 100%) — ส่วน "% ลูกค้าใหม่" คำนวณเฉพาะในกลุ่ม "เสร็จแล้ว" เท่านั้น (นับทั้งใหม่+เก่า ไม่รวมคอร์ส, ต้อง ≥10 คิวเสร็จถึงจะนับ)</div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>⚠️ โหมด "% ลูกค้าใหม่มากสุด" เรียงด้วยสูตรกันฐานตัวอย่างเล็กบวม % เทียม (ไม่ใช่ % ดิบตรงๆ) ลำดับที่เห็นอาจไม่ตรงกับ % ดิบเป๊ะๆ ตั้งใจแบบนั้น</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={() => setPromoSortMode("new")} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid #e8e0dc", cursor: "pointer", background: promoSortMode==="new"?"#2d2a26":"#fff", color: promoSortMode==="new"?"#fff":"#888" }}>🆕 % ลูกค้าใหม่มากสุด</button>
              <button onClick={() => setPromoSortMode("lost")} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid #e8e0dc", cursor: "pointer", background: promoSortMode==="lost"?"#2d2a26":"#fff", color: promoSortMode==="lost"?"#fff":"#888" }}>⚠️ เบี้ยว/ยกเลิกเยอะสุด</button>
            </div>
            {promoNewEff.length===0 ? <div style={{ color: "#ccc", textAlign: "center", padding: 20 }}>ข้อมูลไม่พอ (ต้องมีอย่างน้อย 10 คิวที่เสร็จแล้วต่อโปร)</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...promoNewEff]
                  .sort((a,b) => promoSortMode==="lost" ? b.lostPct-a.lostPct : b.wilson-a.wilson)
                  .slice(0,8)
                  .map((p,i)=>{const pct=Math.round((p.new/p.total)*100);
                    // สีเตือนใช้เกณฑ์เดียวกับการ์ด "⚠️ อัตรายกเลิก/ไม่มา" ทั้งหน้า (LOST_RATE_GOOD_MAX/OK_MAX)
                    // ไม่ตั้งเกณฑ์แยกเอง กันป้ายเดียวกันตัดสินคนละมาตรฐานในหน้าเดียวกัน
                    const lostColor = p.lostPct > LOST_RATE_OK_MAX ? "#C62828" : p.lostPct > LOST_RATE_GOOD_MAX ? "#E65100" : "#2E7D32";
                    return (
                  <div key={i} style={{ padding: "8px 10px", borderRadius: 10, background: "#faf7f5" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: promoSortMode==="lost" ? lostColor : (pct>=50?"#2E7D32":"#E65100"), flexShrink: 0, whiteSpace: "nowrap" }}>
                        {promoSortMode==="lost" ? `⚠️ ${p.lostPct}% เบี้ยว/ยกเลิก` : `🆕 ${pct}% ใหม่`}
                      </span>
                    </div>
                    {/* แถบเดียวแบ่ง 3 ส่วนจากยอดจองทั้งหมด (allCount) รวมกันครบ 100% เสมอ — กันงงแบบที่
                        เคยเจอ (89% ของกลุ่มเสร็จ vs 27% ของยอดจองทั้งหมด บวกกันในหัวแล้วไม่ครบ เพราะ
                        คนละตัวหาร) เห็นภาพเดียวว่ายอดจองทั้งหมดแตกเป็น เสร็จ/เบี้ยว-ยกเลิก/ค้างสถานะ ยังไง */}
                    <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: "#f0ebe8" }}>
                      {p.donePct > 0 && <div style={{ width: `${p.donePct}%`, background: "#A9C9C3" }} title={`เสร็จแล้ว ${p.donePct}%`} />}
                      {p.lostPct > 0 && <div style={{ width: `${p.lostPct}%`, background: "#E8B4B8" }} title={`เบี้ยว-ยกเลิก ${p.lostPct}%`} />}
                      {/* สีเดิม #DDD0C8 ตัดกับพื้นหลังแถบ #f0ebe8 น้อยเกินไป (contrast ~1.1:1) มองแทบไม่เห็น
                          ส่วนนี้บนจอมือถือที่แถบบางมาก เปลี่ยนเป็นม่วงอ่อน (สีเดียวกับที่ใช้แทน "เก่า" จุดอื่น
                          ในไฟล์นี้) ให้ตัดกับทั้งพื้นหลังและอีก 2 สีชัดเจนขึ้น */}
                      {p.pendingPct > 0 && <div style={{ width: `${p.pendingPct}%`, background: "#B8A9C9" }} title={`ค้างสถานะ ${p.pendingPct}%`} />}
                    </div>
                    <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
                      ✅ เสร็จ {p.donePct}% ({p.total}) · ⚠️ เบี้ยว-ยกเลิก {p.lostPct}% ({p.lost}) · ⏳ ค้างสถานะ {p.pendingPct}% ({p.pending}) — จาก {p.allCount} คิวที่จอง
                    </div>
                    <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>
                      ในกลุ่มที่เสร็จแล้ว {p.total} คน เป็นลูกค้าใหม่ {p.new} คน ({pct}%)
                    </div>
                  </div>
                );})}
              </div>
            )}
          </SectionCard>
        </div>

        {/* 7. แอดมิน × หัตถการ */}
        {adminProcedureStats.length > 0 && (
          <div style={{ marginBottom: 0 }}>
            <SectionCard title="🎯 แอดมิน × หัตถการ — ใครปิดอะไรเยอะสุด (คิวแอดมินเท่านั้น, เฉพาะลูกค้าใหม่)">
              <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>
                นับจำนวนครั้งดิบที่ปิดได้ ไม่ได้ปรับตามชั่วโมงทำงาน — ใช้เป็นจุดเริ่มคุยว่าใครถนัดหัตถการไหน ไม่ใช่ตัวชี้วัดที่แม่นยำสมบูรณ์ ลองให้คนอันดับ 1 ของแต่ละหัตถการแชร์เทคนิคให้ทีมดู
              </div>
              <div className="ceo-grid-2" style={gridTwo}>
                {(showAllProcedures ? adminProcedureStats : adminProcedureStats.slice(0, LIST_CAP)).map((p) => {
                  const top = p.admins[0];
                  const max = top.count;
                  return (
                    <div key={p.procId} style={{ padding: 12, borderRadius: 12, background: "#faf7f5", border: "1px solid #f0ebe8" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.procName}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {p.admins.slice(0, 5).map((a, i) => (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 18, flexShrink: 0, fontSize: i === 0 ? 14 : 11, textAlign: "center" }}>{i === 0 ? "🥇" : `#${i + 1}`}</div>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: i === 0 ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                            <div style={{ width: 60, flexShrink: 0, height: 5, background: "#f0ebe8", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(a.count/max)*100}%`, background: i === 0 ? "#A9C9C3" : "#DDD0C8", borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, minWidth: 18, flexShrink: 0, textAlign: "right", color: "#2d2a26" }}>{a.count}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: "#bbb", marginTop: 8 }}>
                        💡 ลองให้ {top.name} แชร์เทคนิคปิด{p.procName}ให้ทีม
                      </div>
                    </div>
                  );
                })}
              </div>
              {adminProcedureStats.length > LIST_CAP && (
                <button
                  onClick={() => setShowAllProcedures(v => !v)}
                  style={{ marginTop: 10, border: "1px solid #e8e0dc", background: "#faf7f5", color: "#B45309", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {showAllProcedures ? "ซ่อนรายการ" : `ดูเพิ่ม ${adminProcedureStats.length - LIST_CAP} หัตถการ`}
                </button>
              )}
            </SectionCard>
          </div>
        )}
      </div>
      </>
      )}

      <div style={{ textAlign: "center", fontSize: 11, color: "#ccc", marginTop: 20, padding: 10 }}>
        Qlass Clinic — CEO Dashboard
      </div>
    </div>
  );
}
