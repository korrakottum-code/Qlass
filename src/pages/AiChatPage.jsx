import { useState, useRef, useEffect, useMemo } from "react";
import { getTodayStr, formatThaiDate } from "../utils/helpers";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

function buildContext(queues, branches, procedures, promos, staff, rooms, today) {
  const monthStr = today.slice(0, 7);
  const lastMonthDate = new Date(today); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);

  const todayQueues = queues.filter(q => q.date === today);
  const monthQueues = queues.filter(q => q.date?.startsWith(monthStr));
  const lastMonthQueues = queues.filter(q => q.date?.startsWith(lastMonthStr));

  // วันที่ 7 วันย้อนหลัง (รวมวันนี้)
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    last7Days.push(d.toISOString().slice(0, 10));
  }
  const week7Queues = queues.filter(q => last7Days.includes(q.date));

  const countBy = (arr, fn) => {
    const m = {};
    arr.forEach(q => { const k = fn(q); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const sumBy = (arr, keyFn, valFn) => {
    const m = {};
    arr.forEach(q => { const k = keyFn(q); m[k] = (m[k] || 0) + valFn(q); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const fmt = (rows, n = 10) => rows.slice(0, n).map(([k, v]) => `${k}(${typeof v === "number" && v > 1000 ? v.toLocaleString() : v})`).join(", ");

  const branchName = (id) => branches.find(b => b.id === id)?.name || "ไม่ระบุ";
  const procName = (id) => procedures.find(p => p.id === id)?.name || "ไม่ระบุ";
  const staffName = (id) => { const s = staff?.find(x => x.id === id); return s ? (s.nickname || s.name) : "ไม่ระบุ"; };

  const typeLabel = { new: "ลูกค้าใหม่", old: "ลูกค้าเก่า", course: "ใช้คอร์ส" };
  const statusLabel = { pending: "รอยืนยัน", confirmed: "ยืนยันแล้ว", done: "มาแล้ว/เสร็จ", no_show: "ไม่มาตามนัด", cancelled: "ยกเลิก", follow1: "โทรตาม×1", follow2: "โทรตาม×2", follow3: "โทรตาม×3", rescheduled: "เลื่อนออก", rescheduled_in: "เลื่อนมา" };

  const revenueOf = (arr) => arr.filter(q => q.status === "done").reduce((s, q) => s + (Number(q.price) || 0), 0);

  // ─── breakdown วันนี้ ───
  const todayByBranch = countBy(todayQueues, q => branchName(q.branchId));
  const todayByProc = countBy(todayQueues, q => procName(q.procedureId));
  const todayByType = countBy(todayQueues, q => typeLabel[q.customerType] || q.customerType);
  const todayByStatus = countBy(todayQueues, q => statusLabel[q.status] || q.status);
  const todayByStaff = countBy(todayQueues, q => staffName(q.recordedBy));

  // ─── breakdown เดือนนี้ ───
  const monthByBranch = countBy(monthQueues, q => branchName(q.branchId));
  const monthByProc = countBy(monthQueues, q => procName(q.procedureId));
  const monthByType = countBy(monthQueues, q => typeLabel[q.customerType] || q.customerType);
  const monthByStatus = countBy(monthQueues, q => statusLabel[q.status] || q.status);
  const monthByStaff = countBy(monthQueues, q => staffName(q.recordedBy));
  const monthRevBranch = sumBy(monthQueues, q => branchName(q.branchId), q => q.status === "done" ? (Number(q.price) || 0) : 0);
  const monthRevProc = sumBy(monthQueues, q => procName(q.procedureId), q => q.status === "done" ? (Number(q.price) || 0) : 0);
  const monthByDate = countBy(monthQueues, q => q.date);

  // ─── metrics ───
  const todayRevenue = revenueOf(todayQueues);
  const monthRevenue = revenueOf(monthQueues);
  const lastMonthRevenue = revenueOf(lastMonthQueues);
  const growthPct = lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) : "N/A";

  // ─── cancel/no-show/follow rate ───
  const cancelRate = monthQueues.length > 0 ? (monthQueues.filter(q => q.status === "cancelled").length / monthQueues.length * 100).toFixed(1) : 0;
  const noShowRate = monthQueues.length > 0 ? (monthQueues.filter(q => q.status === "no_show").length / monthQueues.length * 100).toFixed(1) : 0;
  const doneRate = monthQueues.length > 0 ? (monthQueues.filter(q => q.status === "done").length / monthQueues.length * 100).toFixed(1) : 0;
  const followCount = monthQueues.filter(q => ["follow1","follow2","follow3"].includes(q.status)).length;
  const rescheduleCount = monthQueues.filter(q => q.status === "rescheduled").length;

  // ─── staff × procedure (เดือนนี้) ───
  const staffProcMap = {};
  monthQueues.forEach(q => {
    const sName = staffName(q.recordedBy);
    const pName = procName(q.procedureId);
    if (!staffProcMap[sName]) staffProcMap[sName] = {};
    staffProcMap[sName][pName] = (staffProcMap[sName][pName] || 0) + 1;
  });
  const staffProcSummary = Object.entries(staffProcMap)
    .map(([s, procs]) => {
      const total = Object.values(procs).reduce((a,b)=>a+b, 0);
      const top = Object.entries(procs).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([p,c])=>`${p}(${c})`).join(", ");
      return `${s} [${total} คิว]: ${top}`;
    }).join("\n");

  // ─── branch × procedure (เดือนนี้) ───
  const branchProcMap = {};
  monthQueues.forEach(q => {
    const b = branchName(q.branchId);
    const p = procName(q.procedureId);
    if (!branchProcMap[b]) branchProcMap[b] = {};
    branchProcMap[b][p] = (branchProcMap[b][p] || 0) + 1;
  });
  const branchProcSummary = Object.entries(branchProcMap)
    .map(([b, procs]) => {
      const top = Object.entries(procs).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([p,c])=>`${p}(${c})`).join(", ");
      return `${b}: ${top}`;
    }).join("\n");

  // ─── branch × status (เดือนนี้) ───
  const branchStatusMap = {};
  monthQueues.forEach(q => {
    const b = branchName(q.branchId);
    const s = statusLabel[q.status] || q.status;
    if (!branchStatusMap[b]) branchStatusMap[b] = {};
    branchStatusMap[b][s] = (branchStatusMap[b][s] || 0) + 1;
  });
  const branchStatusSummary = Object.entries(branchStatusMap)
    .sort((a,b) => Object.values(b[1]).reduce((x,y)=>x+y,0) - Object.values(a[1]).reduce((x,y)=>x+y,0))
    .map(([b, statuses]) => {
      const total = Object.values(statuses).reduce((a,b)=>a+b, 0);
      const noShow = statuses["ไม่มาตามนัด"] || 0;
      const cancel = statuses["ยกเลิก"] || 0;
      const done = statuses["มาแล้ว/เสร็จ"] || 0;
      const rate = total > 0 ? ((noShow/total)*100).toFixed(1) : 0;
      return `${b} [${total}]: done=${done}, no-show=${noShow}(${rate}%), cancel=${cancel}`;
    }).join("\n");

  // ─── branch × customerType (เดือนนี้) ───
  const branchTypeMap = {};
  monthQueues.forEach(q => {
    const b = branchName(q.branchId);
    const t = typeLabel[q.customerType] || q.customerType;
    if (!branchTypeMap[b]) branchTypeMap[b] = {};
    branchTypeMap[b][t] = (branchTypeMap[b][t] || 0) + 1;
  });
  const branchTypeSummary = Object.entries(branchTypeMap)
    .sort((a,b) => Object.values(b[1]).reduce((x,y)=>x+y,0) - Object.values(a[1]).reduce((x,y)=>x+y,0))
    .map(([b, types]) => `${b}: ${Object.entries(types).map(([t,c])=>`${t}(${c})`).join(", ")}`).join("\n");

  // ─── วันในสัปดาห์ที่มีคิวเยอะสุด (เดือนนี้) ───
  const DOW = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
  const monthByDow = countBy(monthQueues, q => q.date ? DOW[new Date(q.date).getDay()] : "ไม่ระบุ");

  // ─── ช่วงเวลา (timeBlock → ชั่วโมง) ───
  const blockToHour = (tb) => tb != null ? `${String(Math.floor(tb/12)).padStart(2,"0")}:${String((tb%12)*5).padStart(2,"0")}` : null;
  const hourOf = (tb) => tb != null ? Math.floor(tb/12) : null;
  const monthByHour = countBy(monthQueues.filter(q => q.timeBlock != null), q => `${String(hourOf(q.timeBlock)).padStart(2,"0")}:00`);
  const peakHours = monthByHour.slice(0, 8);

  // ─── ห้อง/เครื่อง utilization (เดือนนี้) ───
  const roomName = (id) => rooms?.find(r => r.id === id)?.name || "ไม่ระบุ";
  const monthByRoom = countBy(monthQueues.filter(q => q.roomId), q => {
    const r = rooms?.find(x => x.id === q.roomId);
    const b = branches.find(x => x.id === r?.branchId);
    return r ? `${r.name}(${b?.name || ""})` : "ไม่ระบุ";
  });
  const roomBlocksUsed = {};
  monthQueues.forEach(q => {
    if (q.roomId && q.durationBlocks) {
      roomBlocksUsed[q.roomId] = (roomBlocksUsed[q.roomId] || 0) + q.durationBlocks;
    }
  });
  const roomUtilSummary = Object.entries(roomBlocksUsed)
    .sort((a,b) => b[1] - a[1]).slice(0, 15)
    .map(([rid, blocks]) => {
      const r = rooms?.find(x => x.id === rid);
      const b = branches.find(x => x.id === r?.branchId);
      const mins = blocks * 5;
      return `${r?.name || "?"}(${b?.name || "?"}): ${blocks} blocks ≈ ${Math.round(mins/60)} ชม`;
    }).join("\n");

  // ─── Promo usage (เดือนนี้) ───
  const promoName = (id) => promos?.find(p => p.id === id)?.name || "ไม่ระบุ";
  const monthByPromo = countBy(monthQueues.filter(q => q.promoId), q => promoName(q.promoId));
  const promoRev = sumBy(monthQueues.filter(q => q.promoId), q => promoName(q.promoId), q => q.status === "done" ? (Number(q.price) || 0) : 0);

  // ─── Commission per staff (เดือนนี้, only done) ───
  const commissionMap = {};
  monthQueues.filter(q => q.status === "done").forEach(q => {
    const s = staff?.find(x => x.id === q.recordedBy);
    if (!s) return;
    const rate = s.commissionRates?.[q.customerType || "new"] || 0;
    const key = s.nickname || s.name;
    commissionMap[key] = (commissionMap[key] || 0) + rate;
  });
  const commissionSummary = Object.entries(commissionMap)
    .sort((a,b) => b[1] - a[1])
    .map(([k,v]) => `${k}: ฿${v.toLocaleString()}`).join(", ");

  // ─── Customer retention: top spenders + repeat customers (ทั้งหมด) ───
  const customerMap = {};
  queues.forEach(q => {
    const key = q.phone || q.name;
    if (!key) return;
    if (!customerMap[key]) customerMap[key] = { name: q.name, phone: q.phone, count: 0, spent: 0, lastVisit: null };
    customerMap[key].count++;
    if (q.status === "done") customerMap[key].spent += Number(q.price) || 0;
    if (!customerMap[key].lastVisit || q.date > customerMap[key].lastVisit) customerMap[key].lastVisit = q.date;
  });
  const customers = Object.values(customerMap);
  const repeatCustomers = customers.filter(c => c.count >= 2).sort((a,b) => b.count - a.count);
  const topSpenders = [...customers].sort((a,b) => b.spent - a.spent).slice(0, 10);
  const newCustCount = customers.filter(c => c.count === 1).length;
  const repeatRate = customers.length > 0 ? (repeatCustomers.length / customers.length * 100).toFixed(1) : 0;

  // ─── Time range: สัปดาห์ที่แล้ว, 3 เดือนที่แล้ว ───
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
  const lastWeekStart = daysAgo(13); const lastWeekEnd = daysAgo(7);
  const lastWeekQueues = queues.filter(q => q.date >= lastWeekStart && q.date <= lastWeekEnd);
  const last3Months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today); d.setMonth(d.getMonth() - i);
    last3Months.push(d.toISOString().slice(0,7));
  }
  const monthlyTrend = last3Months.map(m => {
    const qs = queues.filter(q => q.date?.startsWith(m));
    const rev = revenueOf(qs);
    return { month: m, count: qs.length, revenue: rev };
  });

  // ─── Forecast: estimate rest of month based on daily avg ───
  const daysPassed = parseInt(today.slice(8, 10), 10);
  const daysInMonth = new Date(parseInt(today.slice(0,4)), parseInt(today.slice(5,7)), 0).getDate();
  const dailyAvg = daysPassed > 0 ? monthQueues.length / daysPassed : 0;
  const dailyRevAvg = daysPassed > 0 ? monthRevenue / daysPassed : 0;
  const forecastQueues = Math.round(dailyAvg * daysInMonth);
  const forecastRevenue = Math.round(dailyRevAvg * daysInMonth);

  return `คุณคือ AI ผู้ช่วยวิเคราะห์ข้อมูลของระบบ Qlass คลินิกความงาม ตอบเป็นภาษาไทย กระชับ ตรงประเด็น ถ้ามีข้อมูลให้ใช้ข้อมูลตอบทันที ไม่ต้องบอกว่าไม่มีข้อมูลเว้นแต่หาไม่เจอจริงๆ

วันที่วันนี้: ${formatThaiDate(today)} (${today})
จำนวนสาขา: ${branches.length} | จำนวนพนักงาน: ${staff?.length || 0} | จำนวนหัตถการ: ${procedures.length}

=== ภาพรวมวันนี้ (${today}) ===
คิวทั้งหมด: ${todayQueues.length} | รายได้ (done): ฿${todayRevenue.toLocaleString()}
ประเภทลูกค้า: ${todayByType.map(([k,v])=>`${k}=${v}`).join(", ")}
สถานะ: ${todayByStatus.map(([k,v])=>`${k}=${v}`).join(", ")}
Top สาขา: ${fmt(todayByBranch, 10)}
Top หัตถการ: ${fmt(todayByProc, 10)}
Top ผู้บันทึก: ${fmt(todayByStaff, 10)}

=== ภาพรวมเดือนนี้ (${monthStr}) ===
คิวทั้งหมด: ${monthQueues.length} | รายได้: ฿${monthRevenue.toLocaleString()}
เทียบเดือนที่แล้ว (${lastMonthStr}): ฿${lastMonthRevenue.toLocaleString()} → เติบโต ${growthPct}%
ประเภทลูกค้า: ${monthByType.map(([k,v])=>`${k}=${v}`).join(", ")}
สถานะ: ${monthByStatus.map(([k,v])=>`${k}=${v}`).join(", ")}
อัตรา: done=${doneRate}%, cancel=${cancelRate}%, no-show=${noShowRate}%, follow=${followCount} คิว, reschedule=${rescheduleCount} คิว
Top สาขา (จำนวน): ${fmt(monthByBranch, 20)}
Top สาขา (รายได้): ${monthRevBranch.slice(0,10).map(([k,v])=>`${k}(฿${v.toLocaleString()})`).join(", ")}
Top หัตถการ (จำนวน): ${fmt(monthByProc, 20)}
Top หัตถการ (รายได้): ${monthRevProc.slice(0,10).map(([k,v])=>`${k}(฿${v.toLocaleString()})`).join(", ")}
Top ผู้บันทึก: ${fmt(monthByStaff, 20)}
วันที่มีคิวเยอะสุด: ${fmt(monthByDate, 10)}
วันในสัปดาห์: ${monthByDow.map(([k,v])=>`${k}=${v}`).join(", ")}

=== 7 วันล่าสุด (รายวัน) ===
${last7Days.map(d => {
  const n = week7Queues.filter(q => q.date === d).length;
  const r = revenueOf(week7Queues.filter(q => q.date === d));
  return `${d}: ${n} คิว, รายได้ ฿${r.toLocaleString()}`;
}).join("\n")}

=== หัตถการที่แต่ละคนบันทึกเยอะสุด (เดือนนี้, Top 3) ===
${staffProcSummary}

=== หัตถการ Top 3 ของแต่ละสาขา (เดือนนี้) ===
${branchProcSummary}

=== ประเภทลูกค้าแต่ละสาขา (เดือนนี้) ===
${branchTypeSummary}

=== สถานะคิวแต่ละสาขา - no-show/cancel rate (เดือนนี้) ===
${branchStatusSummary}

=== ช่วงเวลา/ชั่วโมงที่คนมาเยอะ (เดือนนี้) ===
${peakHours.map(([h,c])=>`${h}=${c}`).join(", ")}

=== ห้อง/เครื่อง Top 15 (เดือนนี้, ตาม blocks ใช้งาน) ===
${roomUtilSummary || "(ไม่มีข้อมูลห้อง)"}

=== โปรโมชั่น/แพ็กเกจ (เดือนนี้) ===
จำนวนคิวที่ใช้โปร: ${monthByPromo.reduce((s,[,v])=>s+v,0)} / ${monthQueues.length} คิว
Top โปร: ${monthByPromo.slice(0,10).map(([k,v])=>`${k}(${v})`).join(", ") || "(ไม่มี)"}
รายได้จากโปร (done): ${promoRev.slice(0,10).map(([k,v])=>`${k}(฿${v.toLocaleString()})`).join(", ") || "(ไม่มี)"}

=== ค่าคอมมิชชั่นพนักงาน (เดือนนี้, จากคิว done) ===
${commissionSummary || "(ยังไม่มีคิว done)"}
รวม: ฿${Object.values(commissionMap).reduce((a,b)=>a+b,0).toLocaleString()}

=== ลูกค้า (ทั้งหมด) ===
ลูกค้าทั้งหมด: ${customers.length} คน | กลับมาซ้ำ: ${repeatCustomers.length} คน (${repeatRate}%) | มาครั้งเดียว: ${newCustCount} คน
Top ลูกค้ากลับมาบ่อยสุด: ${repeatCustomers.slice(0,10).map(c=>`${c.name}(${c.count}ครั้ง)`).join(", ")}
Top ลูกค้าใช้จ่ายสูงสุด: ${topSpenders.filter(c=>c.spent>0).slice(0,10).map(c=>`${c.name}(฿${c.spent.toLocaleString()})`).join(", ")}

=== สัปดาห์ที่แล้ว (${lastWeekStart} ถึง ${lastWeekEnd}) ===
คิว: ${lastWeekQueues.length} | รายได้: ฿${revenueOf(lastWeekQueues).toLocaleString()}

=== Trend 3 เดือนล่าสุด ===
${monthlyTrend.reverse().map(m => `${m.month}: ${m.count} คิว, ฿${m.revenue.toLocaleString()}`).join("\n")}

=== คาดการณ์สิ้นเดือน (${monthStr}) ===
ผ่านไป ${daysPassed}/${daysInMonth} วัน | เฉลี่ย ${dailyAvg.toFixed(1)} คิว/วัน, ฿${dailyRevAvg.toFixed(0)}/วัน
ประมาณสิ้นเดือน: ~${forecastQueues} คิว, รายได้ ~฿${forecastRevenue.toLocaleString()}

=== รายชื่อสาขา (${branches.length}) ===
${branches.map(b => b.name).join(", ")}

=== รายชื่อหัตถการ (${procedures.length}) ===
${procedures.map(p => p.name).join(", ")}

=== รายชื่อพนักงาน (${staff?.length || 0}) ===
${(staff || []).map(s => `${s.nickname || s.name}(${s.role})`).join(", ")}

หมายเหตุ: ถ้าผู้ใช้ถามเรื่องที่ต้องใช้ข้อมูลเชิงลึกเกินจากนี้ ให้บอกตรงๆ ว่าดูได้จากหน้า "สรุปประจำวัน" หรือ "Export ข้อมูล"`;
}

export default function AiChatPage({ queues, branches, procedures, promos, staff, rooms }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "สวัสดีครับ! ถามได้เลยเกี่ยวกับข้อมูลคิว สาขา หัตถการ หรือสถิติต่างๆ ครับ 😊" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const today = getTodayStr();

  const context = useMemo(
    () => buildContext(queues, branches, procedures, promos, staff, rooms, today),
    [queues, branches, procedures, promos, staff, rooms, today]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: context }] },
          contents: [...history, { role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      });

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัย ไม่สามารถตอบได้ในขณะนี้";
      setMessages(prev => [...prev, { role: "assistant", text: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "❌ เกิดข้อผิดพลาด กรุณาลองใหม่" }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16, color: "#1a1a2e" }}>🤖 AI ผู้ช่วย</h1>

      {/* Chat area */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: "4px 0", marginBottom: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%",
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? "var(--accent)" : "#fff",
              color: m.role === "user" ? "#fff" : "#1a1a2e",
              fontSize: 14,
              lineHeight: 1.6,
              border: m.role === "assistant" ? "1px solid #e5e7eb" : "none",
              whiteSpace: "pre-wrap",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 16px", borderRadius: "16px 16px 16px 4px", background: "#fff", border: "1px solid #e5e7eb", fontSize: 20 }}>
              <span style={{ animation: "pulse 1s infinite" }}>●</span>
              <span style={{ animation: "pulse 1s infinite 0.2s", marginLeft: 4 }}>●</span>
              <span style={{ animation: "pulse 1s infinite 0.4s", marginLeft: 4 }}>●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {["วันนี้มีคิวกี่คิว", "สาขาไหนเยอะสุดเดือนนี้", "หัตถการไหนทำเยอะสุด", "ลูกค้าใหม่เดือนนี้กี่คน"].map(q => (
          <button key={q} onClick={() => { setInput(q); }} style={{
            padding: "4px 12px", borderRadius: 20, border: "1.5px solid var(--accent)",
            background: "transparent", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>{q}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="ถามอะไรก็ได้เกี่ยวกับข้อมูลในระบบ..."
          rows={2}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #d1d5db",
            fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: "0 20px", borderRadius: 12, border: "none",
            background: loading || !input.trim() ? "#d1d5db" : "var(--accent)",
            color: "#fff", fontSize: 20, cursor: loading || !input.trim() ? "default" : "pointer",
            transition: "background 0.2s"
          }}
        >➤</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6, textAlign: "center" }}>
        Enter ส่ง • Shift+Enter ขึ้นบรรทัดใหม่
      </div>
    </div>
  );
}
