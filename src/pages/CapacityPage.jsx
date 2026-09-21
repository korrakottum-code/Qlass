import { useState, useMemo, useEffect, Fragment } from "react";
import { addDays } from "../utils/queueRanges";
import { getTodayStr, formatThaiDate } from "../utils/helpers";
import {
  computeCapacitySummary, listDates, daysUntilEndOfMonth,
  blocksToHours, freePercent, averageFreePercentByBranch, computeWeeklyPace, PACE_LOOKBACK_WEEKS,
  findTreatmentProcedure, computeFreeProgramReadiness, FREE_PROGRAM_LOOKBACK_WEEKS, FREE_PROGRAM_THRESHOLDS, FREE_PROGRAM_AHEAD_DAYS,
} from "../utils/capacity";
import { roomsForProcedure } from "../utils/roomProcedures";

// สีของ heatmap ตาม % ว่าง — ไล่เฉดต่อเนื่อง (แดง→ส้ม→เหลือง→เขียวอ่อน→เขียวเข้ม)
// แทนที่จะแบ่ง 5 บั้นหยาบๆ เพราะข้อมูลจริงกระจุกช่วง 60-100% ทำให้บั้นแบบเดิม
// ออกมาเป็นสีเขียวซ้ำกันหมด แยกไม่ออกว่าตรงไหนว่างกว่าจริง
const FREE_COLOR_STOPS = [
  { pct: 0, h: 0, s: 78, l: 80 },
  { pct: 25, h: 22, s: 82, l: 78 },
  { pct: 50, h: 45, s: 85, l: 74 },
  { pct: 75, h: 88, s: 55, l: 74 },
  { pct: 100, h: 142, s: 50, l: 68 },
];
function freeColor(pct) {
  if (pct === null) return "var(--surface3)";
  const clamped = Math.max(0, Math.min(100, pct));
  let lo = FREE_COLOR_STOPS[0];
  let hi = FREE_COLOR_STOPS[FREE_COLOR_STOPS.length - 1];
  for (let i = 0; i < FREE_COLOR_STOPS.length - 1; i++) {
    if (clamped >= FREE_COLOR_STOPS[i].pct && clamped <= FREE_COLOR_STOPS[i + 1].pct) {
      lo = FREE_COLOR_STOPS[i]; hi = FREE_COLOR_STOPS[i + 1]; break;
    }
  }
  const t = hi.pct === lo.pct ? 0 : (clamped - lo.pct) / (hi.pct - lo.pct);
  const h = lo.h + (hi.h - lo.h) * t;
  const s = lo.s + (hi.s - lo.s) * t;
  const l = lo.l + (hi.l - lo.l) * t;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

// compact เพราะต้องอยู่ 3 การ์ดในแถวเดียวกันเสมอแม้จอมือถือแคบสุด (เดิม flex-wrap ทำให้การ์ดที่ 3 ตกไปอยู่คนละบรรทัด)
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      minWidth: 0, padding: "10px 10px", borderRadius: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "var(--accent)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}

// การ์ดเดียวโชว์ห้องฉีด/ห้องเครื่องคู่กันในบรรทัดเดียว — เดิมแยกเป็น 2 การ์ดเต็ม ทำให้ล้นไปอยู่คนละแถวบนจอที่ไม่กว้างพอ
// ตัวเลขหลักเป็น "% ว่าง" ไม่ใช่ชั่วโมง — เจ้าของงานอ่าน "3,087 ชม. จาก 3,691.5 ชม." แล้วแปลไม่ออกว่าว่างมากหรือน้อย
// ต้องหารในหัวเอง ส่วนเปอร์เซ็นต์บอกได้ทันทีและเทียบข้ามฝั่งได้ทั้งที่ความจุสองฝั่งไม่เท่ากัน
function TypeSplitCard({ mCell, tCell }) {
  const sides = [
    { key: "M", label: "ว่าง ห้องฉีด (M)", hint: "ฉีด / ดริป", cell: mCell, color: "var(--blue)" },
    { key: "T", label: "ว่าง ห้องเครื่อง (T)", hint: "เลเซอร์ / ทรีตเมนต์", cell: tCell, color: "var(--green)" },
  ];
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
      display: "flex", gap: 18,
    }}>
      {sides.map((side, idx) => {
        const pct = freePercent(side.cell);
        return (
          <Fragment key={side.key}>
            {idx > 0 && <div style={{ width: 1, background: "var(--border)" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>
                {side.label} <span style={{ color: "var(--text3)" }}>· {side.hint}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: side.color, marginTop: 4 }}>
                {pct === null ? "—" : `${pct}%`}
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                {pct === null ? "ไม่มีห้องเปิดในช่วงนี้" : `จองแล้ว ${100 - pct}%`}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

const THAI_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// "เทียบกับปกติ" — 5 สถานะตามสเปกที่ผ่านรีวิว nak-song-sai 5 รอบ (scratchpad/pace-feature-spec.md)
// จงใจไม่มีปุ่ม/ลิงก์ทำอะไรต่อ — เป็นสัญญาณเตือนเฉยๆ ตามที่เจ้าของงานตัดสินใจไว้
const PACE_STYLE = {
  green: { emoji: "🟢", label: "ปกติดี", bg: "#dcfce7", fg: "#166534" },
  yellow: { emoji: "🟡", label: "ต่ำกว่าปกติ", bg: "#fef9c3", fg: "#854d0e" },
  red: { emoji: "🔴", label: "ต่ำกว่าปกติมาก", bg: "#fecaca", fg: "#991b1b" },
  high: { emoji: "❗", label: "สูงผิดปกติ ตรวจสอบข้อมูล", bg: "#e9d5ff", fg: "#6b21a8" },
  "no-data": { emoji: "🆕", label: "ไม่มีข้อมูลเทียบ", bg: "var(--surface3)", fg: "var(--text3)" },
};

function PaceStrip({ weeklyPace }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)", marginBottom: 6 }}>
        📈 เทียบกับปกติ (เทียบจังหวะการจองย้อนหลัง 8 สัปดาห์ ไม่ใช่เทียบยอดสุดท้าย)
        {/* ตัวกรอง "สาขา" ด้านบนอยู่ติดกับแถบนี้พอดี ทำให้เข้าใจผิดได้ง่ายว่าเลือกสาขาแล้วต้องกรองด้วย
            (ทดสอบจริงแล้วเจอ) ทั้งที่ตั้งใจให้เป็นภาพรวมทั้งเครือข่ายเสมอ (เฟส 1) — บอกให้ชัดในตัว UI
            เอง ไม่ใช่แค่ comment ในโค้ดที่ผู้ใช้มองไม่เห็น */}
        <span style={{ fontWeight: 400, color: "var(--text3)" }}> — ภาพรวมทั้งเครือข่ายเสมอ ไม่เปลี่ยนตามตัวกรองสาขาด้านบน</span>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        {weeklyPace.map((row) => {
          const style = PACE_STYLE[row.kind];
          const [, m, d] = row.date.split("-");
          const title = row.pace === null
            ? "ยังไม่มีข้อมูลย้อนหลังพอจะเทียบ"
            : `จองแล้ว ${row.pace}% ของค่าเฉลี่ยปกติ ณ จังหวะนี้`;
          return (
            <div key={row.date} title={title} style={{
              flex: "0 0 auto", minWidth: 84, padding: "8px 10px", borderRadius: 10,
              background: style.bg, color: style.fg, textAlign: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                {THAI_DOW[row.dow]} {d}/{m}
              </div>
              <div style={{ fontSize: 18, marginTop: 2 }}>{style.emoji}</div>
              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, lineHeight: 1.3 }}>{style.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// "โปรแกรมฟรีทรีตเมนต์" — คาดว่าสัปดาห์หน้าเตียงทรีตเมนต์จะว่างเท่าไหร่ กติกาอยู่ที่ computeFreeProgramReadiness (capacity.js)
// เจตนา: เจ้าของงานเปิดหน้านี้ทุกสัปดาห์แล้วตัดสินได้เลยว่าสาขาไหนเปิดโปรฟรีได้ วันไหน กี่คน ไม่ต้องดึงข้อมูลดิบ
const READINESS_STYLE = {
  open: { emoji: "🟢", label: "เปิดได้", bg: "#dcfce7", fg: "#166534" },
  limited: { emoji: "🟡", label: "เปิดจำกัด 3–5 คน/วัน", bg: "#fef9c3", fg: "#854d0e" },
  pause: { emoji: "⏸️", label: "พักก่อน 3 วันนี้แน่น", bg: "#ffedd5", fg: "#9a3412" },
  stop: { emoji: "🔴", label: "ไม่ควรทำ", bg: "#fecaca", fg: "#991b1b" },
  "no-data": { emoji: "🆕", label: "ไม่มีข้อมูล", bg: "var(--surface3)", fg: "var(--text3)" },
};
const READINESS_ORDER = { open: 0, limited: 1, pause: 2, stop: 3, "no-data": 4 };

function pctText(v) { return v === null || v === undefined ? "—" : `${v}%`; }

// โควตาฟรีต่อวันจากช่องว่างที่คาดไว้: เปิดได้ = ครึ่งหนึ่ง (เหลือที่ให้ลูกค้าจ่ายเงินที่จองกระชั้นชิด),
// เปิดจำกัด = ไม่เกิน 5 และไม่เกินครึ่งหนึ่ง, อย่างอื่น = ไม่เปิด
function quotaFor(verdictNow, slots) {
  if (slots === null || slots === undefined) return null;
  const half = Math.floor(slots / 2);
  if (verdictNow === "open") return half;
  if (verdictNow === "limited") return Math.min(5, half);
  return null;
}

function FreeProgramReadiness({ readiness, branches, treatmentName }) {
  const rows = useMemo(() => {
    const nameOf = (id) => branches.find((b) => b.id === id)?.name || "-";
    return [...readiness.rows]
      .map((r) => ({ ...r, name: nameOf(r.branchId) }))
      .sort((a, b) => (READINESS_ORDER[a.verdictNow] - READINESS_ORDER[b.verdictNow]) || ((b.pct ?? -1) - (a.pct ?? -1)));
  }, [readiness, branches]);
  const [, fm, fd] = readiness.from.split("-");
  const [, tm, td] = readiness.to.split("-");
  const th = { padding: "6px 8px", fontSize: 11, color: "var(--text3)", textAlign: "left", borderBottom: "2px solid var(--border2)", background: "var(--surface2)", whiteSpace: "nowrap" };
  const td_ = { padding: "6px 8px", fontSize: 12, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const counts = rows.reduce((acc, r) => { acc[r.verdictNow] = (acc[r.verdictNow] || 0) + 1; return acc; }, {});
  // คอลัมน์รายวัน: วันนี้ถึง +6 เฉพาะจันทร์–ศุกร์ (เสาร์–อาทิตย์ไม่แนะนำให้เปิดอยู่แล้ว ไม่ต้องเปลืองที่)
  const dayCols = readiness.forecastDates
    .map((date, i) => ({ date, i, dow: new Date(...date.split("-").map(Number).map((v, k) => (k === 1 ? v - 1 : v))).getDay() }))
    .filter((c) => c.dow !== 0 && c.dow !== 6);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
      <div className="card-header" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h3 style={{ margin: 0 }}>🎁 โปรแกรมฟรี {treatmentName} — คาดว่าสัปดาห์นี้จะเหลือช่องว่างเท่าไหร่</h3>
        <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.5 }}>
          ตัวเลขรายวัน = จำนวนช่อง 20 นาทีที่คาดว่าจะว่างบนเตียงที่รับ{treatmentName}ได้ ช่วง 13:00–17:00 (รวมทุกเตียงของสาขา)
          {" "}· วันนี้–มะรืน ใช้คิวที่จองแล้วจริง ("จริง") · วันถัดไปประมาณจากวันเดียวกันของ {FREE_PROGRAM_LOOKBACK_WEEKS} สัปดาห์ก่อน ({fd}/{fm}–{td}/{tm}) เพราะลูกค้าจองล่วงหน้าแค่ 0–2 วัน ตารางข้างหน้าจึงยังว่างหลอกอยู่
          {" "}· คำแนะนำ: คาดว่าว่าง ≥{FREE_PROGRAM_THRESHOLDS.open}% เปิดได้ (โควตาครึ่งหนึ่งของช่องว่าง) · {FREE_PROGRAM_THRESHOLDS.limited}–{FREE_PROGRAM_THRESHOLDS.open - 1}% เปิดจำกัด
          {" "}· ต่ำกว่า {FREE_PROGRAM_THRESHOLDS.limited}% หรือร่วงเกิน {FREE_PROGRAM_THRESHOLDS.dropPoints} จุดจาก 4 สัปดาห์ก่อนหน้า ไม่ควรทำ · 3 วันนี้คิวจริงแน่น พักก่อน · ห้ามเสาร์–อาทิตย์ และหลัง 17:00 ทุกสาขา
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {Object.entries(READINESS_STYLE).filter(([k]) => counts[k]).map(([k, st]) => (
            <span key={k} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.fg }}>
              {st.emoji} {st.label}: {counts[k]}
            </span>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, position: "sticky", left: 0, zIndex: 2 }}>สาขา / คำแนะนำ</th>
              <th style={{ ...th, textAlign: "right" }}>เตียง</th>
              <th style={{ ...th, textAlign: "right" }} title="% ว่างเฉลี่ย จ–ศ 13:00–17:00 ของ 4 สัปดาห์ล่าสุด — ตัวตัดสินหลัก">คาดว่าว่าง</th>
              <th style={{ ...th, textAlign: "right" }} title="4 สัปดาห์ก่อนหน้า → 4 สัปดาห์ล่าสุด — ร่วงเกิน 10 จุด = ไม่ควรทำ">แนวโน้ม</th>
              <th style={{ ...th, textAlign: "right" }} title="โควตาฟรีต่อวันโดยเฉลี่ย: เปิดได้ = ครึ่งหนึ่งของช่องว่าง · เปิดจำกัด = ไม่เกิน 5">โควตาฟรี/วัน</th>
              {dayCols.map((c) => {
                const [, m, d] = c.date.split("-");
                return (
                  <th key={c.date} style={{ ...th, textAlign: "center", background: c.i === 0 ? "var(--surface3)" : th.background }}
                    title={c.i < FREE_PROGRAM_AHEAD_DAYS ? "ใช้คิวที่จองแล้วจริง" : "ประมาณจากวันเดียวกัน 4 สัปดาห์ก่อน"}>
                    {THAI_DOW[c.dow]} {d}/{m}<br />
                    <span style={{ fontWeight: 400 }}>{c.i < FREE_PROGRAM_AHEAD_DAYS ? "จริง" : "คาด"}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = READINESS_STYLE[r.verdictNow];
              const trend = r.prev4 !== null && r.last4 !== null ? r.last4 - r.prev4 : null;
              const dropped = trend !== null && trend < -FREE_PROGRAM_THRESHOLDS.dropPoints;
              const quota = quotaFor(r.verdictNow, r.avgSlots);
              return (
                <tr key={r.branchId}>
                  {/* ชื่อ + ป้ายคำแนะนำอยู่ในคอลัมน์ที่ตรึงไว้ด้วยกัน — เลื่อนตารางไปดูรายวันแล้วยังเห็นคำตอบเสมอ */}
                  <td style={{ ...td_, position: "sticky", left: 0, zIndex: 1, background: "var(--surface)", borderRight: "2px solid var(--border2)", maxWidth: 190 }}>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <span style={{ display: "inline-block", marginTop: 2, fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: st.bg, color: st.fg }}>{st.emoji} {st.label}</span>
                  </td>
                  <td style={{ ...td_, textAlign: "right" }}>{r.beds}</td>
                  <td style={{ ...td_, textAlign: "right", fontWeight: 800, color: "#1f2937", background: freeColor(r.pct) }}>{pctText(r.pct)}</td>
                  <td style={{ ...td_, textAlign: "right", color: dropped ? "var(--red, #b91c1c)" : "var(--text2)" }}>
                    {pctText(r.prev4)} → {pctText(r.last4)}{dropped ? " ⚠️" : ""}
                  </td>
                  <td style={{ ...td_, textAlign: "right", fontWeight: 700 }}>{quota === null ? "—" : `${quota} คน`}</td>
                  {dayCols.map((c) => {
                    const f = r.forecast[c.i];
                    const dayQuota = quotaFor(r.verdictNow, f.slots);
                    const title = f.pct === null ? "ไม่มีเตียงเปิด/ไม่มีข้อมูล"
                      : `${f.source === "actual" ? "คิวจริง" : "คาด"}: ว่าง ${f.pct}% · ${f.slots} ช่อง 20 นาที${dayQuota !== null ? ` · เปิดฟรีได้ ~${dayQuota} คน` : ""}`;
                    return (
                      <td key={c.date} title={title} style={{ ...td_, textAlign: "center", fontWeight: 700, color: "#1f2937", background: freeColor(f.pct) }}>
                        {f.slots === null ? "—" : f.slots}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", fontSize: 11, color: "var(--text2)" }}>
        สีในช่องรายวัน = % ที่คาดว่าจะว่าง (แดง แน่น → เขียว ว่าง) ตัวเลข = ช่อง 20 นาที · ระบบนับเฉพาะคิวที่ลงในตารางห้อง ถ้าหน้าร้านรับลูกค้าเดินเข้าโดยไม่ลงคิว ความว่างจริงจะน้อยกว่านี้
        {" "}· สัญญาณว่าโปรฟรีเริ่มกินลูกค้าจ่ายเงิน: ว่างช่วงที่เปิดฟรีตกต่ำกว่า 60% ให้ลดโควตาลงครึ่งหนึ่งก่อน
      </div>
    </div>
  );
}

export default function CapacityPage({ rooms, roomSchedules, queues, branches, procedures, roomProcedureIndex, onRangeNeeded }) {
  const [range, setRange] = useState("7d"); // 7d | eom
  const [filterBranch, setFilterBranch] = useState("all");
  const [splitByType, setSplitByType] = useState(false);
  // "ทั้งหมด" = รวมสองประเภทเข้าด้วยกันเหมือนเดิม, "M"/"T" = ดูประเภทเดียวทั้งหน้า
  // (ตัวเลขบนการ์ด ตารางด้านล่าง และคำแนะนำ เปลี่ยนตามทั้งหมด ไม่ใช่แค่ตาราง)
  // "treatment" = เฉพาะเตียงในห้องเครื่องที่ล็อกให้รับทรีตเมนต์ (เตียง Hifu/Pico ทำทรีตเมนต์ไม่ได้
  // ตัวเลข T รวมจึงว่างเกินจริงสำหรับคำถาม "เปิดโปรฟรีทรีตเมนต์ได้ไหม")
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null); // { branchId, date }

  const today = getTodayStr();
  // computeWeeklyPace ใช้ baseline ย้อนหลัง PACE_LOOKBACK_WEEKS สัปดาห์ (เกิน 30 วันที่โหลดตอนเปิดแอป)
  useEffect(() => { onRangeNeeded?.(addDays(today, -PACE_LOOKBACK_WEEKS * 7), today); }, [today, onRangeNeeded]);
  const dates = useMemo(() => (
    range === "7d" ? listDates(today, 7) : listDates(today, daysUntilEndOfMonth(today))
  ), [range, today]);

  // เตียงที่รับทรีตเมนต์ได้ — ผ่านกติกาล็อกเตียงตัวเดียวกับหน้าลงคิว (เตียงที่ยังไม่ตั้งค่า = ทุกเตียง T)
  const treatmentProcedure = useMemo(() => findTreatmentProcedure(procedures), [procedures]);
  const treatmentRoomIds = useMemo(() => new Set(
    treatmentProcedure ? roomsForProcedure(roomProcedureIndex, rooms, treatmentProcedure).map((r) => r.id) : []
  ), [roomProcedureIndex, rooms, treatmentProcedure]);
  // ไม่มีหัตถการทรีตเมนต์ในระบบ (เช่นสภาพแวดล้อมเดโม) → ไม่โชว์ปุ่ม และถ้าค้างสถานะไว้ให้ถอยไป "ทั้งหมด"
  const treatmentAvailable = !!treatmentProcedure;
  const effectiveTypeFilter = typeFilter === "treatment" && !treatmentAvailable ? "all" : typeFilter;

  const visibleRooms = useMemo(() => rooms.filter((r) => (
    (filterBranch === "all" || r.branchId === filterBranch)
    // ห้องที่ไม่ได้ตั้งประเภทไว้ ถูกนับเป็น T ที่ computeCapacitySummary — ต้องใช้กติกาเดียวกันตรงนี้
    // ไม่งั้นตัวหารบนการ์ดกับตัวเลขในตารางจะคนละชุด
    && (effectiveTypeFilter === "treatment"
      ? treatmentRoomIds.has(r.id)
      : (effectiveTypeFilter === "all" || (r.type === "M" ? "M" : "T") === effectiveTypeFilter))
  )), [rooms, filterBranch, effectiveTypeFilter, treatmentRoomIds]);

  // ความพร้อมโปรฟรี — คำนวณเฉพาะตอนเลือกดูเตียงทรีตเมนต์ (ต้องไล่ 8 สัปดาห์ × ทุกเตียง ไม่ทำเปล่า ๆ)
  const readiness = useMemo(() => (
    effectiveTypeFilter === "treatment"
      ? computeFreeProgramReadiness({ rooms: visibleRooms, roomSchedules, queues, procedures, today })
      : null
  ), [effectiveTypeFilter, visibleRooms, roomSchedules, queues, procedures, today]);

  const summary = useMemo(() => computeCapacitySummary({
    rooms: visibleRooms, roomSchedules, queues, procedures, dates,
  }), [visibleRooms, roomSchedules, queues, procedures, dates]);

  const branchAverages = useMemo(() => averageFreePercentByBranch(summary), [summary]);

  // "เทียบกับปกติ" เป็นภาพรวมทั้งเครือข่ายเสมอ — ไม่ผูกกับตัวกรองสาขา/ช่วงเวลาด้านบน (เฟส 1 ตาม
  // ที่ตกลงกันไว้ — รายสาขาเป็นเฟส 2 ในอนาคต)
  const weeklyPace = useMemo(() => computeWeeklyPace({ queues, branches, today }), [queues, branches, today]);

  // เรียงสาขาตาม % ว่างเฉลี่ยของช่วงที่ดูอยู่ — ค่าเริ่มต้นเอาสาขาที่ว่างสุด (ต้องการโปรดันมากสุด) ขึ้นก่อน
  // ไม่งั้นต้องนั่งไล่เฉลี่ยเองทีละแถว
  const [sortDir, setSortDir] = useState("desc"); // desc = ว่างมากสุดก่อน, asc = แน่นสุดก่อน
  const visibleBranches = useMemo(() => {
    const list = branches.filter((b) => (filterBranch === "all" || b.id === filterBranch)
      && summary.days.some((d) => d.byBranch[b.id]));
    return [...list].sort((a, b) => {
      const av = branchAverages[a.id] ?? -1;
      const bv = branchAverages[b.id] ?? -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [branches, filterBranch, summary, branchAverages, sortDir]);

  // เลือกดูประเภทเดียวอยู่แล้ว การแยกสองแถวไม่มีความหมาย — ปิดไว้เงียบ ๆ ไม่ต้องล้างสถานะปุ่ม
  const splitRows = splitByType && effectiveTypeFilter === "all";
  // บนจอมือถือการ์ดแคบมาก ป้ายยาวจะถูกตัดท้าย — ใช้คำสั้นที่ยังบอกได้ว่ากำลังดูห้องประเภทไหนอยู่
  const typeShortLabel = effectiveTypeFilter === "M" ? "ห้องฉีด" : effectiveTypeFilter === "T" ? "ห้องเครื่อง" : effectiveTypeFilter === "treatment" ? "เตียงทรีตเมนต์" : "ห้อง";
  const totalPct = freePercent(summary.totals);
  // เทียบเป็น % ว่าง ไม่ใช่ชั่วโมงดิบ — ห้องเครื่องมีความจุมากกว่าห้องฉีดเกือบสองเท่า ถ้าเทียบชั่วโมง
  // ฝั่งที่ใหญ่กว่าจะชนะเกือบทุกครั้งทั้งที่อาจแน่นกว่าจริง คำแนะนำโปรจะชี้ผิดฝั่ง
  const mFreePct = freePercent(summary.totals.byType.M);
  const tFreePct = freePercent(summary.totals.byType.T);
  const freerType = (mFreePct ?? -1) >= (tFreePct ?? -1) ? "M" : "T";

  const selectedCell = selected
    ? summary.days.find((d) => d.date === selected.date)?.byBranch[selected.branchId]
    : null;
  const selectedBranchName = selected ? (branches.find((b) => b.id === selected.branchId)?.name || "-") : "";

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ช่วงเวลา</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["7d", "7 วันข้างหน้า"], ["eom", "วันนี้–สิ้นเดือน"]].map(([v, l]) => (
              <button key={v} onClick={() => { setRange(v); setSelected(null); }} style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: range === v ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: range === v ? "var(--accent-soft, rgba(0,0,0,0.05))" : "var(--surface2)",
                color: range === v ? "var(--accent)" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">สาขา</label>
          <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setSelected(null); }}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {/* เดิมมีแค่ปุ่ม "แยก M/T" ซึ่งทำได้อย่างเดียวคือแสดงทั้งสองประเภทพร้อมกัน ดูทีละประเภทไม่ได้
            และตัวย่อ M/T ลอย ๆ ไม่มีที่ไหนบอกว่าแปลว่าอะไร — เขียนเป็นคำเต็มคู่กับตัวย่อทุกจุด */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ประเภทห้อง</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all", "ทั้งหมด"], ["M", "ห้องฉีด (M)"], ["T", "ห้องเครื่อง (T)"], ...(treatmentAvailable ? [["treatment", "🎁 เตียงทรีตเมนต์"]] : [])].map(([v, l]) => (
              <button key={v} onClick={() => { setTypeFilter(v); setSelected(null); }}
                title={v === "treatment" ? "เฉพาะเตียงที่ล็อกให้รับทรีตเมนต์ (ไม่รวมเตียง Hifu/Pico) — ใช้ตัดสินว่าสาขาไหนเปิดโปรฟรีทรีตเมนต์ได้" : undefined}
                style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: effectiveTypeFilter === v ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: effectiveTypeFilter === v ? "var(--accent-soft, rgba(0,0,0,0.05))" : "var(--surface2)",
                color: effectiveTypeFilter === v ? "var(--accent)" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
        </div>
        {effectiveTypeFilter === "all" && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">ตารางด้านล่าง</label>
            <button
              onClick={() => setSplitByType((v) => !v)}
              style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: splitByType ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: splitByType ? "var(--accent-soft, rgba(0,0,0,0.05))" : "var(--surface2)",
                color: splitByType ? "var(--accent)" : "var(--text2)",
              }}>
              {splitByType ? "✓ แยกสองแถวแล้ว" : "แยกฉีด / เครื่อง เป็นสองแถว"}
            </button>
          </div>
        )}
      </div>

      {/* คำเตือนพฤติกรรมการจอง — ตรวจกับฐานข้อมูลจริงแล้ว (2569-08-11): ลูกค้า ~55-60% จองภายใน
          0-2 วันก่อนวันนัดเสมอมา (เช็คทั้งเดือนมิ.ย.และส.ค. ได้ผลใกล้กัน) ดังนั้นวันที่ไกลออกไป
          จะ "ว่างเกินจริง" เสมอ เพราะคิวส่วนใหญ่ของวันนั้นยังไม่ถูกจองเข้ามา ไม่ใช่เพราะสาขาซบเซา —
          กันคนอ่านตัวเลขผิดว่า "ว่างเยอะ = ธุรกิจไม่ดี" */}
      <div style={{
        marginBottom: 10, padding: "8px 14px", borderRadius: 10, fontSize: 12,
        background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)",
      }}>
        ℹ️ ลูกค้าส่วนใหญ่ (~55-60%) จองล่วงหน้าแค่ 0-2 วันก่อนวันนัด — วันที่ไกลออกไปจึงมักโชว์ "ว่าง" เกินจริง
        เพราะยังไม่ถึงจังหวะที่คนจอง ไม่ใช่สัญญาณว่าสาขานั้นซบเซา ยิ่งใกล้วันจริงตัวเลขจะยิ่งน่าเชื่อถือ
      </div>

      <PaceStrip weeklyPace={weeklyPace} />

      {readiness && (
        <FreeProgramReadiness readiness={readiness} branches={branches} treatmentName={treatmentProcedure?.name || "ทรีตเมนต์"} />
      )}

      {/* Stat cards — บังคับ 3 การ์ดแรกอยู่แถวเดียวกันเสมอด้วย grid (เดิม flex-wrap ทำให้การ์ดที่ 3
          ตกไปอยู่คนละบรรทัดบนจอแคบ) ส่วนการ์ด M/T แยกเป็นแถวของตัวเองด้านล่าง */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {/* ปัดเศษทศนิยมทิ้งเฉพาะการ์ดนี้ — ความจุระดับพันชั่วโมง เศษ .5 ไม่มีความหมาย แต่ทำให้ตัวเลข
              ยาวเกินการ์ดบนจอมือถือจนถูกตัดเป็น "3,691.5 ..." */}
          <StatCard label="ความจุรวม" value={`${Math.round(blocksToHours(summary.totals.capacity)).toLocaleString()} ชม.`} sub={`${dates.length} วัน · ${visibleRooms.length} ${typeShortLabel}`} />
          <StatCard label="จองแล้ว" value={totalPct === null ? "—" : `${100 - totalPct}%`} sub={`${blocksToHours(summary.totals.booked).toLocaleString()} ชม.`} color="var(--blue)" />
          <StatCard label="ยังว่าง (รับเพิ่มได้)" value={totalPct === null ? "—" : `${totalPct}%`} sub={`${blocksToHours(summary.totals.free).toLocaleString()} ชม.`} color="var(--green)" />
        </div>
        {/* เลือกดูประเภทเดียวอยู่ การ์ดคู่จะซ้ำกับการ์ด "ยังว่าง" ด้านบนเป๊ะ ๆ (อีกฝั่งเป็น 0 เสมอ) */}
        {effectiveTypeFilter === "all" && (
          <TypeSplitCard mCell={summary.totals.byType.M} tCell={summary.totals.byType.T} />
        )}
      </div>

      {/* คำแนะนำฝั่งการตลาด — บอกแค่ว่าห้องประเภทไหนว่างกว่า ไม่แจงชื่อโปร (เดิมสุ่มเอา 6 โปรแรก
          ที่ตรงประเภทห้องมาโชว์ ไม่มีเกณฑ์คัดจริง ทำให้ดูเหมือนระบบเลือกเอง — เอาออกดีกว่าใส่
          ข้อมูลที่อธิบายไม่ได้ว่าทำไมถูกเลือก) */}
      {summary.totals.capacity > 0 && effectiveTypeFilter === "all" && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: "var(--surface2)", border: "1px solid var(--border)",
        }}>
          💡 {filterBranch === "all" ? "ภาพรวมทุกสาขา" : branches.find((b) => b.id === filterBranch)?.name}
          {" "}ว่างฝั่ง <b style={{ color: freerType === "M" ? "var(--blue)" : "var(--green)" }}>{freerType === "M" ? "ห้องฉีด (M)" : "ห้องเครื่อง (T)"}</b> มากกว่า
          {" "}— เหมาะโฟกัสแคมเปญ/โปรกลุ่มห้อง{freerType === "M" ? "ฉีด" : "เครื่อง"}ที่นี่ก่อน
        </div>
      )}

      {/* Heatmap สาขา × วัน */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + dates.length * 52 }}>
            <thead>
              <tr>
                <th
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                  title="กดเพื่อเรียงสาขาตาม % ว่างเฉลี่ยของช่วงนี้"
                  style={{
                    position: "sticky", left: 0, zIndex: 3, background: "var(--surface2)",
                    padding: "8px 10px", textAlign: "left", fontSize: 11, color: "var(--text3)",
                    borderBottom: "2px solid var(--border2)", borderRight: "2px solid var(--border2)", minWidth: 110,
                    cursor: "pointer", userSelect: "none",
                  }}>
                  สาขา (เฉลี่ย {sortDir === "desc" ? "ว่างสุดก่อน ▼" : "แน่นสุดก่อน ▲"})
                </th>
                {dates.map((date) => {
                  const [y, m, d] = date.split("-").map(Number);
                  const dow = new Date(y, m - 1, d).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={date} style={{
                      padding: "6px 4px", fontSize: 10, fontWeight: 700, minWidth: 48,
                      color: isWeekend ? "var(--accent)" : "var(--text3)",
                      background: date === today ? "var(--surface3)" : "var(--surface2)",
                      borderBottom: "2px solid var(--border2)", borderRight: "1px solid var(--border)",
                    }}>
                      {THAI_DOW[dow]}<br />{d}/{m}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleBranches.map((b) => (
                splitRows ? (
                  [["M", "ห้องฉีด (M)"], ["T", "ห้องเครื่อง (T)"]].map(([type, typeLabel], idx) => (
                    <tr key={`${b.id}_${type}`}>
                      <td style={{
                        position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
                        padding: "6px 10px", fontSize: 12, fontWeight: idx === 0 ? 700 : 500,
                        borderBottom: idx === 1 ? "1px solid var(--border)" : "none",
                        borderTop: idx === 0 ? "2px solid var(--border2)" : "none",
                        borderRight: "2px solid var(--border2)",
                        maxWidth: 140,
                        color: idx === 0 ? "var(--text1)" : "var(--text2)",
                      }}>
                        {/* ชื่อสาขา (แถวบนสุดเท่านั้น) กับป้าย M/T แยกกันคนละบรรทัดเสมอ — ทำให้ป้าย
                            "ห้องฉีด (M)" ของแถวบนและ "ห้องเครื่อง (T)" ของแถวล่างเริ่มที่ตำแหน่ง
                            ซ้ายเดียวกันพอดี ไม่ใช่ตำแหน่งเลื่อนไปตามความยาวชื่อสาขา+% แบบเดิม */}
                        {idx === 0 && (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                              {b.name}
                            </span>
                            {branchAverages[b.id] != null && (
                              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{branchAverages[b.id]}%</span>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: type === "M" ? "var(--blue)" : "var(--green)" }}>{typeLabel}</div>
                      </td>
                      {dates.map((date) => {
                        const cell = summary.days.find((d) => d.date === date)?.byBranch[b.id]?.byType[type];
                        const pct = freePercent(cell);
                        const isSel = selected && selected.branchId === b.id && selected.date === date;
                        return (
                          <td key={date}
                            onClick={() => setSelected(isSel ? null : { branchId: b.id, date })}
                            title={cell ? `${typeLabel}: ว่าง ${blocksToHours(cell.free)} ชม. จาก ${blocksToHours(cell.capacity)} ชม.` : "ปิด/ไม่มีห้อง"}
                            style={{
                              padding: "6px 2px", textAlign: "center", fontSize: 11, fontWeight: 700,
                              background: freeColor(pct), cursor: cell ? "pointer" : "default",
                              color: "#1f2937",
                              borderBottom: idx === 1 ? "1px solid var(--border)" : "none",
                              borderTop: idx === 0 ? "2px solid var(--border2)" : "none",
                              borderRight: "1px solid var(--border)",
                              outline: isSel ? "2px solid var(--accent)" : "none", outlineOffset: -2,
                            }}>
                            {pct === null ? "—" : `${pct}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr key={b.id}>
                    <td style={{
                      position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
                      padding: "6px 10px", fontSize: 12, fontWeight: 700,
                      borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border2)",
                      maxWidth: 140,
                    }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {b.name}
                        </span>
                        {branchAverages[b.id] != null && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{branchAverages[b.id]}%</span>
                        )}
                      </div>
                    </td>
                    {dates.map((date) => {
                      const cell = summary.days.find((d) => d.date === date)?.byBranch[b.id];
                      const pct = freePercent(cell);
                      const isSel = selected && selected.branchId === b.id && selected.date === date;
                      return (
                        <td key={date}
                          onClick={() => setSelected(isSel ? null : { branchId: b.id, date })}
                          title={cell ? `ว่าง ${blocksToHours(cell.free)} ชม. จาก ${blocksToHours(cell.capacity)} ชม.` : "ปิด/ไม่มีห้อง"}
                          style={{
                            padding: "8px 2px", textAlign: "center", fontSize: 11, fontWeight: 700,
                            background: freeColor(pct), cursor: cell ? "pointer" : "default",
                            color: "#1f2937",
                            borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                            outline: isSel ? "2px solid var(--accent)" : "none", outlineOffset: -2,
                          }}>
                          {pct === null ? "—" : `${pct}%`}
                        </td>
                      );
                    })}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap", fontSize: 11, color: "var(--text2)" }}>
          <span>แน่น</span>
          <div style={{
            width: 140, height: 12, borderRadius: 4, border: "1px solid var(--border)",
            background: `linear-gradient(to right, ${FREE_COLOR_STOPS.map((s) => `hsl(${s.h},${s.s}%,${s.l}%) ${s.pct}%`).join(", ")})`,
          }} />
          <span>ว่างมาก</span>
          <span style={{ marginLeft: "auto" }}>กดช่องเพื่อดูรายละเอียดวัน/สาขานั้น · เลือก "ประเภทห้อง" ด้านบนเพื่อดูเฉพาะห้องฉีด (M) ห้องเครื่อง (T) หรือเตียงทรีตเมนต์</span>
        </div>
      </div>

      {/* Drill-down รายวัน — popup ลอย กดปิดแล้วดูสาขา/วันอื่นต่อได้เลย ไม่ต้องเลื่อนไปมาหาการ์ด */}
      {selected && selectedCell && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 480, width: "100%", maxHeight: "88dvh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}
          >
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>📍 {selectedBranchName} — {formatThaiDate(selected.date)}</h3>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text3)", lineHeight: 1, padding: 4 }}
              >✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>ภาพรวม</div>
                {/* % มาก่อนชั่วโมง — อ่านแล้วรู้ทันทีว่าว่างมากหรือน้อย ส่วนชั่วโมงเก็บไว้ให้ดูว่าเหลือกี่ชั่วโมงจริง */}
                <div>ว่าง <b style={{ color: "var(--green)" }}>{freePercent(selectedCell)}%</b> ({blocksToHours(selectedCell.free)} จาก {blocksToHours(selectedCell.capacity)} ชม.)</div>
                {/* เดิมบรรทัดนี้เป็นชั่วโมงล้วน เทียบสองฝั่งไม่ได้เพราะความจุไม่เท่ากัน — ใช้ % ว่างให้ตรงกับการ์ดด้านบน
                    และถ้ากำลังเลือกดูประเภทเดียวอยู่ ไม่ต้องโชว์ เพราะอีกฝั่งถูกกรองออกไปแล้วจะขึ้นเป็น "—%" ชวนงง */}
                {effectiveTypeFilter === "all" && (
                  <div style={{ marginTop: 4 }}>
                    ห้องฉีด (M): ว่าง {freePercent(selectedCell.byType.M) ?? "—"}% · ห้องเครื่อง (T): ว่าง {freePercent(selectedCell.byType.T) ?? "—"}%
                  </div>
                )}
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>ว่างช่วงไหนของวัน</div>
                {[["morning", "เช้า (ก่อน 12:00)"], ["afternoon", "บ่าย (12:00-17:00)"], ["evening", "เย็น (17:00+)"]].map(([k, l]) => {
                  const seg = selectedCell.bySegment[k];
                  const pct = seg.capacity ? Math.round((seg.free / seg.capacity) * 100) : null;
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 120, color: "var(--text2)" }}>{l}</span>
                      <div style={{ flex: 1, height: 14, background: "var(--surface3)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct ?? 0}%`, height: "100%", background: freeColor(pct), borderRight: pct ? "1px solid var(--border)" : "none" }} />
                      </div>
                      <span style={{ minWidth: 88, textAlign: "right", fontWeight: 700 }}>
                        {pct === null ? "—" : `ว่าง ${blocksToHours(seg.free)} ชม. (${pct}%)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
