import { useState, useMemo } from "react";
import { QUEUE_STATUSES } from "../utils/constants";
import { getTodayStr, formatThaiDate, isoToLocalDateStr } from "../utils/helpers";
import AdSpendCard from "../components/AdSpendCard";

const fmtNum = (n) => n.toLocaleString("en-US");
const S = { card: { background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", border: "1px solid #f0ebe8" } };

function StatCard({ icon, label, value, sub, accent = "#E8B4B8" }) {
  return (
    <div style={{ ...S.card, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%", background: `${accent}18` }} />
      <div style={{ fontSize: 13, color: "#999", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#2d2a26", marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children }) {
  return <div style={S.card}><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#2d2a26" }}>{title}</div>{children}</div>;
}

export default function CeoDashboardPage({ queues, allQueues, branches, rooms, procedures, promos, staff, currentUser }) {
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
      e = today;
      ps = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      pe = new Date(today.getFullYear(), today.getMonth(), 0);
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

  const adminIds = useMemo(() => { const s = new Set(); (staff||[]).forEach(x => { if (x?.role === "admin") s.add(x.id); }); return s; }, [staff]);
  const staffMap = useMemo(() => { const m = {}; (staff||[]).forEach(s => { m[s.id] = s; }); return m; }, [staff]);
  const promoMap = useMemo(() => { const m = {}; (promos||[]).forEach(p => { m[p.id] = p; }); return m; }, [promos]);
  const procMap = useMemo(() => { const m = {}; (procedures||[]).forEach(p => { m[p.id] = p; }); return m; }, [procedures]);
  const getLD = (q) => q.createdAt ? isoToLocalDateStr(q.createdAt) : (q.date || "");

  const all = allQueues || queues || [];

  const dayQ = useMemo(() => all.filter(q => inRange(q.date, startDate, endDate)), [all, startDate, endDate]);
  const dayANO = useMemo(() => all.filter(q => adminIds.has(q.recordedBy) && (q.customerType==="new"||q.customerType==="old") && inRange(getLD(q), startDate, endDate)), [all, adminIds, startDate, endDate]);
  const prevANO = useMemo(() => all.filter(q => adminIds.has(q.recordedBy) && (q.customerType==="new"||q.customerType==="old") && inRange(getLD(q), prevStart, prevEnd)), [all, adminIds, prevStart, prevEnd]);

  const newC = dayANO.filter(q => q.customerType==="new").length;
  const oldC = dayANO.filter(q => q.customerType==="old").length;
  const newPct = dayANO.length > 0 ? Math.round((newC/dayANO.length)*100) : 0;

  // daily trend within selected range
  const trend = useMemo(() => {
    const arr = [], s = new Date(startDate), e = new Date(endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) {
      const k = isoToLocalDateStr(d);
      const c = all.filter(q => adminIds.has(q.recordedBy) && (q.customerType==="new"||q.customerType==="old") && getLD(q)===k).length;
      const dt = new Date(k);
      arr.push({day:k, label:["อา","จ","อ","พ","พฤ","ศ","ส"][dt.getDay()]+" "+dt.getDate()+"/"+(dt.getMonth()+1), q:c});
    }
    return arr;
  }, [all, adminIds, startDate, endDate]);
  const tMax = Math.max(...trend.map(d=>d.q), 1);

  const bStats = useMemo(() => {
    const m = {}; (branches||[]).forEach(b => { m[b.id]={name:b.name, total:0, new:0, old:0}; });
    dayQ.forEach(q => { if(!m[q.branchId]) return; m[q.branchId].total++; if(q.customerType==="new") m[q.branchId].new++; else if(q.customerType==="old") m[q.branchId].old++; });
    return Object.values(m).sort((a,b)=>b.total-a.total);
  }, [branches, dayQ]);

  const aPerf = useMemo(() => {
    const m = {}; dayANO.forEach(q => { const s=staffMap[q.recordedBy]; if(!s) return; const n=s.nickname||s.name;
      if(!m[n]) m[n]={name:n,total:0,new:0,old:0}; m[n].total++; if(q.customerType==="new") m[n].new++; else m[n].old++; });
    return Object.values(m).sort((a,b)=>b.total-a.total);
  }, [dayANO, staffMap]);

  const sStats = useMemo(() => {
    const m = {}; QUEUE_STATUSES.forEach(s => { m[s.value]=0; }); dayQ.forEach(q => { m[q.status]=(m[q.status]||0)+1; });
    return QUEUE_STATUSES.map(s => ({...s, count:m[s.value]||0})).filter(s=>s.count>0);
  }, [dayQ]);

  const pStats = useMemo(() => {
    const m = {}; dayQ.forEach(q => { if(!q.promoId||q.customerType==="course") return;
      const p=promoMap[q.promoId], nm=p?p.name:q.promoId, pc=p?procMap[p.procedureId]:null;
      if(!m[q.promoId]) m[q.promoId]={name:nm, proc:pc?pc.name:"", count:0}; m[q.promoId].count++; });
    return Object.values(m).sort((a,b)=>b.count-a.count);
  }, [dayQ, promoMap, procMap]);
  const pTop = pStats.slice(0,10), pMax = pTop[0]?.count||1;

  const peakD = useMemo(() => { if(!trend.length) return null;
    return { peak: trend.reduce((a,b)=>b.q>a.q?b:a), low: trend.reduce((a,b)=>b.q<a.q?b:a), avg: Math.round(trend.reduce((s,d)=>s+d.q,0)/trend.length) };
  }, [trend]);

  const confRate = useMemo(() => { const c=dayQ.filter(q=>q.status==="confirmed"||q.status==="done").length; return dayQ.length>0?Math.round((c/dayQ.length)*100):0; }, [dayQ]);
  const delta = (c,p) => { if(!p) return ""; const d=c-p, pc=p>0?Math.round((d/p)*100):0; return d>=0?`▲ +${d} (+${pc}%)`:`▼ ${d} (${pc}%)`; };
  const dColor = (c,p) => c>=p?"#2E7D32":"#C62828";
  const dateLabel = rangeLabel;

  // ─── 1. Day of week analysis ───
  const dowStats = useMemo(() => {
    const days = ["อา","จ","อ","พ","พฤ","ศ","ส"];
    const m = days.map((d,i) => ({label:d, idx:i, count:0}));
    dayANO.forEach(q => { const dt = new Date(getLD(q)); m[dt.getDay()].count++; });
    return m;
  }, [dayANO]);
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
  const prevDayQ = useMemo(() => all.filter(q => inRange(q.date, prevStart, prevEnd)), [all, prevStart, prevEnd]);
  const bGrowth = useMemo(() => {
    return bStats.filter(b=>b.total>0).map(b => {
      const bid = (branches||[]).find(x=>x.name===b.name)?.id;
      const prev = bid ? prevDayQ.filter(q=>q.branchId===bid).length : 0;
      const ch = prev>0 ? Math.round(((b.total-prev)/prev)*100) : (b.total>0?100:0);
      return {...b, prev, ch};
    });
  }, [bStats, branches, prevDayQ]);

  // ─── 5. Admin new customer ranking ───
  const adminNewRank = useMemo(() => {
    const m = {}; dayANO.filter(q=>q.customerType==="new").forEach(q => {
      const s=staffMap[q.recordedBy]; if(!s) return; const n=s.nickname||s.name;
      m[n]=(m[n]||0)+1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  }, [dayANO, staffMap]);

  // ─── 6. Promo new customer effectiveness ───
  const promoNewEff = useMemo(() => {
    const m = {}; dayQ.forEach(q => { if(!q.promoId||q.customerType==="course") return;
      const p=promoMap[q.promoId], nm=p?p.name:q.promoId;
      if(!m[q.promoId]) m[q.promoId]={name:nm, total:0, new:0};
      m[q.promoId].total++; if(q.customerType==="new") m[q.promoId].new++; });
    return Object.values(m).filter(p=>p.total>=3).sort((a,b)=>(b.new/b.total)-(a.new/a.total)).slice(0,8);
  }, [dayQ, promoMap]);

  return (
    <div style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif", background: "#FAF7F5", minHeight: "100vh", padding: "24px 20px", margin: "-20px", color: "#2d2a26" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#C9A9A6", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>✦ CEO Dashboard</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#2d2a26" }}>Qlass Clinic</h1>
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>📅 {rangeKey === "today" ? formatThaiDate(singleDate) : `${formatThaiDate(startDate)} — ${formatThaiDate(endDate)}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => { const d = new Date(singleDate); d.setDate(d.getDate()-1); setSingleDate(isoToLocalDateStr(d)); }}
                style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #e8e0dc", background: "#fff", cursor: "pointer", fontSize: 13, color: "#888" }}>◀</button>
              <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)}
                style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #e8e0dc", background: "#fff", color: "#2d2a26", fontSize: 12 }} />
              <button onClick={() => { const d = new Date(singleDate); d.setDate(d.getDate()+1); setSingleDate(isoToLocalDateStr(d)); }}
                style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #e8e0dc", background: "#fff", cursor: "pointer", fontSize: 13, color: "#888" }}>▶</button>
              {singleDate !== todayKey && (
                <button onClick={() => setSingleDate(todayKey)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #C9A9A6", background: "#C9A9A622", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#C9A9A6" }}>กลับวันนี้</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard icon="📋" label={`คิวแอดมิน (${dateLabel})`} value={fmtNum(dayANO.length)}
          sub={<span style={{color:dColor(dayANO.length,prevANO.length)}}>{delta(dayANO.length,prevANO.length)} vs ช่วงก่อนหน้า</span>} accent="#E8B4B8" />
        <StatCard icon="👤" label="ลูกค้าใหม่ / เก่า" value={`${newC} / ${oldC}`}
          sub={`ใหม่ ${newPct}% · เก่า ${100-newPct}%`} accent="#DDA0A0" />
        <StatCard icon="📋" label={`คิวทั้งหมด`} value={fmtNum(dayQ.length)} accent="#A9C9C3" />
        <StatCard icon="📊" label="เฉลี่ย/วัน" value={trend.length>0 ? Math.round(dayANO.length/trend.length) : 0} sub={`จาก ${trend.length} วัน`} accent="#B8A9C9" />
      </div>

      {/* Ad Spend */}
      <div style={{ marginBottom: 16 }}>
        <AdSpendCard dateRange={{start:startDate,end:endDate}} rangeLabel={rangeLabel} selectedDate={endDate} queues={all} staff={staff} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Trend */}
        <SectionCard title={`📈 แนวโน้มรายวัน — ${dateLabel}`}>
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
        <SectionCard title="🧠 วิเคราะห์ภาพรวม">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* New/Old ratio bar */}
            <div>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>สัดส่วนลูกค้าใหม่ / เก่า</div>
              <div style={{ height: 20, borderRadius: 10, overflow: "hidden", display: "flex", background: "#f5f0ed" }}>
                <div style={{ width: `${newPct}%`, background: "#E8B4B8", transition: "width 0.5s" }} />
                <div style={{ width: `${100-newPct}%`, background: "#B8A9C9", transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#999" }}>
                <span>🆕 ใหม่ {newC} ({newPct}%)</span><span>🔄 เก่า {oldC} ({100-newPct}%)</span>
              </div>
            </div>
            {/* Range comparison */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#faf7f5", borderRadius: 12 }}>
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
              <span style={{ color: "#2E7D32", fontWeight: 700 }}>📈 Peak: {peakD.peak.label} ({peakD.peak.q} คิว)</span>
              <span style={{ margin: "0 8px", color: "#ddd" }}>|</span>
              <span style={{ color: "#C62828" }}>📉 Low: {peakD.low.label} ({peakD.low.q} คิว)</span>
              <span style={{ margin: "0 8px", color: "#ddd" }}>|</span>
              <span>เฉลี่ย {peakD.avg}/วัน</span>
            </div>}
            {/* Confirm rate */}
            <div style={{ fontSize: 12, color: "#666" }}>
              ✅ อัตราคอนเฟิร์ม: <span style={{ fontWeight: 700, color: confRate>=70?"#2E7D32":"#E65100" }}>{confRate}%</span>
              <span style={{ color: "#bbb", marginLeft: 6 }}>({dayQ.filter(q=>q.status==="confirmed"||q.status==="done").length}/{dayQ.length} คิว)</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Promo + Admin Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Top Promos */}
        <SectionCard title={`🏷️ โปรโมชั่นยอดนิยม (${pStats.reduce((s,p)=>s+p.count,0)} คิว)`}>
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
        <SectionCard title={`🏆 Performance แอดมิน — ${dateLabel}`}>
          {aPerf.length===0 ? <div style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: 20 }}>ยังไม่มีข้อมูล</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aPerf.map((a,i)=>{const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`; const max=aPerf[0]?.total||1; return (
                <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "#faf7f5" }}>
                  <div style={{ fontSize: i<3?20:13, width: 28, textAlign: "center" }}>{medal}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: "#999" }}>🆕{a.new} 🔄{a.old}</span>
                    </div>
                    <div style={{ height: 5, background: "#f0ebe8", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(a.total/max)*100}%`, background: `hsl(${340-i*15}, 45%, 70%)`, borderRadius: 3, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#2d2a26", minWidth: 30, textAlign: "right" }}>{a.total}</div>
                </div>
              );})}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Branch + Status Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Branch Breakdown */}
        <SectionCard title={`🏢 เปรียบเทียบสาขา — ${dateLabel}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bStats.filter(b=>b.total>0).map((b,i) => (
              <div key={b.name} style={{ padding: 14, borderRadius: 14, background: "#faf7f5", border: "1px solid #f0ebe8" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{b.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                  <div><div style={{ color: "#bbb" }}>คิวทั้งหมด</div><div style={{ fontWeight: 700, fontSize: 18, color: "#2d2a26" }}>{b.total}</div></div>
                  <div><div style={{ color: "#bbb" }}>🆕 ใหม่</div><div style={{ fontWeight: 700, fontSize: 16, color: "#3b82f6" }}>{b.new}</div></div>
                  <div><div style={{ color: "#bbb" }}>🔄 เก่า</div><div style={{ fontWeight: 700, fontSize: 16, color: "#f59e0b" }}>{b.old}</div></div>
                </div>
              </div>
            ))}
            {bStats.filter(b=>b.total>0).length===0 && <div style={{ textAlign: "center", color: "#ccc", padding: 20 }}>ไม่มีข้อมูล</div>}
          </div>
        </SectionCard>

        {/* Queue Status */}
        <SectionCard title={`🎯 สถานะคิว (${dayQ.length})`}>
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
        <div style={{ fontSize: 16, fontWeight: 700, color: "#2d2a26", marginBottom: 12 }}>🔬 วิเคราะห์เชิงลึก</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* 1. Day of week */}
          <SectionCard title="📅 วันไหนคิวเยอะที่สุด">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
              {dowStats.map((d,i) => (<div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: d.count===dowMax?"#2E7D32":"#bbb", fontWeight: d.count===dowMax?700:400, marginBottom: 3 }}>{d.count||""}</div>
                <div style={{ width: "70%", height: Math.max(4,(d.count/dowMax)*70), background: d.count===dowMax?"linear-gradient(180deg,#A9C9C3,#A9C9C388)":"linear-gradient(180deg,#E8B4B8,#E8B4B844)", borderRadius: "5px 5px 0 0", transition: "height 0.4s" }} />
                <span style={{ fontSize: 11, marginTop: 4, color: d.count===dowMax?"#2E7D32":"#999", fontWeight: d.count===dowMax?700:400 }}>{d.label}</span>
              </div>))}
            </div>
          </SectionCard>

          {/* 3. Cancel / No-show rate */}
          <SectionCard title="🚫 อัตรายกเลิก / ไม่มา">
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: lostPct>15?"#C62828":lostPct>5?"#E65100":"#2E7D32" }}>{lostPct}%</div>
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
              {lostPct<=5?"✅ ยอดเยี่ยม — แทบไม่มียกเลิก":lostPct<=15?"📊 ปกติ — อยู่ในเกณฑ์ที่รับได้":"⚠️ สูง — ควรติดตามลูกค้าเพิ่ม"}
            </div>
          </SectionCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* 2. New/Old ratio comparison */}
          <SectionCard title="📈 สัดส่วนลูกค้าใหม่ เทียบช่วงก่อน">
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#bbb", marginBottom: 4 }}>ช่วงนี้</div>
                <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "#f5f0ed", marginBottom: 4 }}>
                  <div style={{ width: `${newPct}%`, background: "#E8B4B8" }} />
                  <div style={{ width: `${100-newPct}%`, background: "#B8A9C9" }} />
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>🆕 {newPct}% ({newC}) · 🔄 {100-newPct}% ({oldC})</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#bbb", marginBottom: 4 }}>ช่วงก่อน</div>
                <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "#f5f0ed", marginBottom: 4 }}>
                  <div style={{ width: `${prevNewPct}%`, background: "#E8B4B8" }} />
                  <div style={{ width: `${100-prevNewPct}%`, background: "#B8A9C9" }} />
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>🆕 {prevNewPct}% ({prevNewC}) · 🔄 {100-prevNewPct}% ({prevOldC})</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
              {newPct>prevNewPct?"✅ ลูกค้าใหม่เพิ่มขึ้น — แอดทำงานดี":newPct<prevNewPct?"🔄 ลูกค้าเก่ากลับมาเยอะขึ้น":"📊 สัดส่วนคงที่"}
            </div>
          </SectionCard>

          {/* 4. Branch growth */}
          <SectionCard title="🏢 สาขาเติบโต / ลดลง">
            {bGrowth.length===0 ? <div style={{ color: "#ccc", textAlign: "center", padding: 20 }}>ไม่มีข้อมูล</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bGrowth.map((b,i)=>(
                  <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "#faf7f5" }}>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{b.prev}→{b.total}</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
                      color: b.ch>=0?"#2E7D32":"#C62828", background: b.ch>=0?"#E8F5E9":"#FFEBEE" }}>
                      {b.ch>=0?"▲":"▼"}{Math.abs(b.ch)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* 5. Admin new customer ranking */}
          <SectionCard title="👑 แอดมิน — ดึงลูกค้าใหม่เก่งสุด">
            {adminNewRank.length===0 ? <div style={{ color: "#ccc", textAlign: "center", padding: 20 }}>ไม่มีข้อมูล</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {adminNewRank.slice(0,8).map((a,i)=>{const mx=adminNewRank[0].count; return (
                  <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 24, fontSize: i<3?16:11, textAlign: "center", fontWeight: 700, color: "#C9A9A6" }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</div>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ width: 80, height: 6, background: "#f5f0ed", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(a.count/mx)*100}%`, background: "#A9C9C3", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: "right", color: "#2d2a26" }}>{a.count}</div>
                  </div>
                );})}
              </div>
            )}
          </SectionCard>

          {/* 6. Promo new customer effectiveness */}
          <SectionCard title="🏷️ โปรไหนดึงลูกค้าใหม่ได้ดี">
            {promoNewEff.length===0 ? <div style={{ color: "#ccc", textAlign: "center", padding: 20 }}>ข้อมูลไม่พอ (ต้อง ≥3 คิว)</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {promoNewEff.map((p,i)=>{const pct=Math.round((p.new/p.total)*100); return (
                  <div key={i} style={{ padding: "6px 10px", borderRadius: 10, background: "#faf7f5" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: pct>=50?"#2E7D32":"#E65100", flexShrink: 0, marginLeft: 8 }}>{pct}% ใหม่</span>
                    </div>
                    <div style={{ height: 6, background: "#f0ebe8", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct>=50?"#A9C9C3":"#E8B4B8", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>🆕 {p.new} / ทั้งหมด {p.total}</div>
                  </div>
                );})}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "#ccc", marginTop: 20, padding: 10 }}>
        Qlass Clinic — CEO Dashboard
      </div>
    </div>
  );
}
