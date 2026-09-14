import { useEffect, useMemo, useState } from "react";
import { NAV_ITEMS, ROLES } from "../utils/constants";
import { MANUAL_META, MANUAL_SECTIONS } from "../manual/manualContent";
import { QUIZ_META, QUIZ_QUESTIONS } from "../manual/testContent";

const TABS = [
  { id: "guide", label: "📖 คู่มือการใช้งาน" },
  { id: "quiz", label: "🧠 แบบทดสอบ ก่อน/หลังเทรน" },
];

const NAV_LABEL = Object.fromEntries(NAV_ITEMS.filter((n) => n.id).map((n) => [n.id, `${n.icon} ${n.label}`]));
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

function roleAllowedPages(role) {
  return ROLES.find((r) => r.value === role)?.pages || [];
}

// ข้อความทั้งหมดใน section รวมเป็นสตริงเดียว ใช้สำหรับช่องค้นหา
function sectionText(section) {
  const parts = [section.title, section.intro || ""];
  for (const b of section.blocks || []) {
    if (b.title) parts.push(b.title);
    if (b.text) parts.push(b.text);
    if (b.items) for (const it of b.items) parts.push(typeof it === "string" ? it : `${it.q} ${it.a}`);
    if (b.headers) parts.push(b.headers.join(" "));
    if (b.rows) for (const r of b.rows) parts.push(r.join(" "));
  }
  return parts.join(" ").toLowerCase();
}

// ผลแบบทดสอบก่อน/หลังเทรน เก็บในเครื่อง แยกตามบัญชีที่เข้าสู่ระบบ: { pre: {...}, post: {...} }
function storageKey(user) {
  return `qlass_quiz_results_${user?.id || "anon"}`;
}

function loadResults(user) {
  try {
    const raw = localStorage.getItem(storageKey(user));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── บล็อกเนื้อหาของคู่มือ ───
function Block({ block }) {
  switch (block.type) {
    case "p":
      return <p className="manual-p">{block.text}</p>;
    case "img":
      return (
        <figure className="manual-figure">
          <a href={block.src} target="_blank" rel="noreferrer" title="เปิดภาพขนาดเต็ม">
            <img src={block.src} alt={block.caption || ""} loading="lazy" />
          </a>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    case "steps":
      return (
        <div className="manual-block">
          {block.title && <div className="manual-block-title">{block.title}</div>}
          <ol className="manual-steps">{block.items.map((it, i) => <li key={i}>{it}</li>)}</ol>
        </div>
      );
    case "list":
      return (
        <div className="manual-block">
          {block.title && <div className="manual-block-title">{block.title}</div>}
          <ul className="manual-list">{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      );
    case "table":
      return (
        <div className="manual-block">
          {block.title && <div className="manual-block-title">{block.title}</div>}
          <div className="manual-table-wrap">
            <table className="data-table manual-table">
              <thead><tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "tip":
      return (
        <div className="manual-callout manual-tip">
          <div className="manual-callout-title">💡 เคล็ดลับ</div>
          <ul>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      );
    case "warn":
      return (
        <div className="manual-callout manual-warn">
          <div className="manual-callout-title">⚠️ ข้อควรระวัง</div>
          <ul>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      );
    case "faq":
      return (
        <div className="manual-block">
          <div className="manual-block-title">{block.title || "❓ คำถามที่พบบ่อย"}</div>
          {block.items.map((it, i) => (
            <details key={i} className="manual-faq">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function GuideTab({ sections, currentUser, showAll, setShowAll, canToggle }) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return sections;
    return sections.filter((s) => sectionText(s).includes(q));
  }, [sections, q]);

  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    for (const s of visible) {
      if (!map.has(s.group)) { map.set(s.group, []); order.push(s.group); }
      map.get(s.group).push(s);
    }
    return order.map((g) => ({ group: g, items: map.get(g) }));
  }, [visible]);

  // ไฮไลต์หัวข้อที่กำลังอ่านในสารบัญ (หัวข้อที่อยู่ใกล้ขอบบนของจอที่สุด)
  useEffect(() => {
    const els = [...document.querySelectorAll(".manual-section")];
    if (els.length === 0) return undefined;
    const update = () => {
      const line = 120; // ใต้แถบบน + สารบัญ
      let best = null;
      for (const el of els) {
        const top = el.getBoundingClientRect().top;
        if (top <= line) best = el; else break;
      }
      setActiveId((best || els[0]).id.replace("manual-", ""));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [visible, openIds]);

  function toggle(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function jumpTo(id) {
    setOpenIds((prev) => new Set(prev).add(id));
    setTimeout(() => document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    setActiveId(id);
  }
  function expandAll(open) {
    setOpenIds(open ? new Set(visible.map((s) => s.id)) : new Set());
  }

  return (
    <div className="manual-layout">
      {/* สารบัญ */}
      <aside className="manual-toc">
        {isMobile ? (
          <select className="manual-toc-select" value="" onChange={(e) => e.target.value && jumpTo(e.target.value)}>
            <option value="">{activeId ? `📍 ${sections.find((x) => x.id === activeId)?.title || ""} — เลือกหัวข้ออื่น` : "— ไปยังหัวข้อ —"}</option>
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.title}</option>)}
              </optgroup>
            ))}
          </select>
        ) : (
          <div className="manual-toc-inner">
            <div className="manual-toc-head">สารบัญ</div>
            {groups.map((g) => (
              <div key={g.group}>
                <div className="manual-toc-group">{g.group}</div>
                {g.items.map((s) => (
                  <button key={s.id} type="button" className={`manual-toc-item ${activeId === s.id ? "active" : ""}`} onClick={() => jumpTo(s.id)}>
                    <span>{s.icon}</span><span>{s.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="manual-main">
        <div className="manual-toolbar">
          <input
            type="search"
            className="manual-search"
            placeholder="🔍 ค้นหาในคู่มือ เช่น ปิดคิว, เลื่อนนัด, PIN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canToggle && (
            <label className="manual-toggle">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              แสดงทุกเมนู (รวมที่บทบาท {ROLE_LABEL[currentUser?.role] || "-"} ไม่ได้ใช้)
            </label>
          )}
          <div className="manual-toolbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => expandAll(true)}>กางทั้งหมด</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => expandAll(false)}>พับทั้งหมด</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { expandAll(true); setTimeout(() => window.print(), 100); }}>🖨️ พิมพ์</button>
          </div>
        </div>

        {visible.length === 0 && (
          <div className="card"><div className="empty"><div className="e-icon">🔍</div><p>ไม่พบหัวข้อที่ตรงกับ "{query}"</p></div></div>
        )}

        {groups.map((g) => (
          <div key={g.group} className="manual-group">
            <h3 className="manual-group-title">{g.group}</h3>
            {g.items.map((s) => {
              const open = openIds.has(s.id) || !!q;
              const allowed = !s.pageId || roleAllowedPages(currentUser?.role).includes(s.pageId);
              return (
                <section key={s.id} id={`manual-${s.id}`} className={`card manual-section ${open ? "open" : ""}`}>
                  <button type="button" className="manual-section-head" onClick={() => toggle(s.id)} aria-expanded={open}>
                    <span className="manual-section-icon">{s.icon}</span>
                    <span className="manual-section-title">
                      {s.title}
                      {s.pageId && <span className="manual-section-menu">เมนู: {NAV_LABEL[s.pageId] || s.pageId}</span>}
                    </span>
                    {!allowed && <span className="manual-chip-muted">บทบาทของคุณไม่เห็นเมนูนี้</span>}
                    <span className="manual-chevron">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="manual-section-body">
                      {s.roles && (
                        <div className="manual-roles">
                          ใช้ได้กับบทบาท: {s.roles.map((r) => ROLE_LABEL[r] || r).join(" · ")}
                        </div>
                      )}
                      {s.intro && <p className="manual-intro">{s.intro}</p>}
                      {(s.blocks || []).map((b, i) => <Block key={i} block={b} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

function QuizTab({ currentUser }) {
  const questions = QUIZ_QUESTIONS;
  const passPct = QUIZ_META.passPct;
  const [results, setResults] = useState(() => loadResults(currentUser));
  // เริ่มที่รอบก่อนเทรน ถ้าทำแล้วไปรอบหลังเทรน
  const [round, setRound] = useState(() => (loadResults(currentUser).pre ? "post" : "pre"));
  const saved = results[round] || null;
  const [answers, setAnswers] = useState(() => saved?.answers || {});
  const [checked, setChecked] = useState(() => !!saved);
  const [missing, setMissing] = useState([]); // ข้อที่ยังไม่ตอบ (หลังกดตรวจ)
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(storageKey(currentUser), JSON.stringify(results)); } catch { /* ignore */ }
  }, [results, currentUser]);

  const roundInfo = QUIZ_META.rounds.find((r) => r.id === round);
  const score = useMemo(() => questions.reduce((n, qq) => n + (answers[qq.id] === qq.answer ? 1 : 0), 0), [questions, answers]);
  const answeredCount = questions.filter((qq) => answers[qq.id] !== undefined).length;
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const passed = pct >= passPct;

  function switchRound(id) {
    const r = results[id] || null;
    setRound(id);
    setAnswers(r?.answers || {});
    setChecked(!!r);
    setMissing([]);
  }
  function reset() {
    setResults((p) => { const n = { ...p }; delete n[round]; return n; });
    setAnswers({}); setChecked(false); setMissing([]);
  }
  function check() {
    const miss = questions.map((qq, i) => (answers[qq.id] === undefined ? i + 1 : null)).filter(Boolean);
    if (miss.length > 0) {
      setMissing(miss);
      document.getElementById(`manual-q-${miss[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setMissing([]);
    setChecked(true);
    setResults((p) => ({ ...p, [round]: { score, total: questions.length, pct, at: new Date().toISOString(), answers } }));
    setTimeout(() => document.getElementById("manual-quiz-top")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function answer(qq, ci) {
    setAnswers((p) => ({ ...p, [qq.id]: ci }));
    setMissing((m) => m.filter((n) => questions[n - 1]?.id !== qq.id));
  }
  async function copySummary() {
    const who = `${currentUser?.nickname || currentUser?.name || "-"} (${ROLE_LABEL[currentUser?.role] || currentUser?.role || "-"})`;
    const line = (id) => {
      const r = results[id]; const info = QUIZ_META.rounds.find((x) => x.id === id);
      if (!r) return `${info.short}: ยังไม่ได้ทำ`;
      const wrong = questions.map((qq, i) => (r.answers[qq.id] === qq.answer ? null : i + 1)).filter(Boolean);
      return `${info.short}: ${r.score}/${r.total} (${r.pct}%)${id === "post" ? (r.pct >= passPct ? " ผ่าน" : " ไม่ผ่าน") : ""} — ${formatWhen(r.at)}${wrong.length ? ` · ข้อที่ผิด: ${wrong.join(", ")}` : " · ถูกทุกข้อ"}`;
    };
    const lines = [`แบบทดสอบก่อน/หลังเทรน Qlass — ${who}`, line("pre"), line("post")];
    if (results.pre && results.post) {
      const d = results.post.score - results.pre.score;
      lines.push(`เปลี่ยนแปลง: ${d > 0 ? "+" : ""}${d} ข้อ (${results.pre.pct}% → ${results.post.pct}%)`);
    }
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("คัดลอกข้อความนี้", text); }
  }

  const pre = results.pre, post = results.post;
  const delta = pre && post ? post.score - pre.score : null;

  return (
    <div className="manual-main manual-quiz" id="manual-quiz-top">
      <div className="card">
        <div className="card-body manual-quiz-rounds">
          {QUIZ_META.rounds.map((r) => {
            const res = results[r.id];
            return (
              <button key={r.id} type="button" className={`manual-round ${round === r.id ? "active" : ""} ${res ? "done" : ""}`} onClick={() => switchRound(r.id)}>
                <span className="manual-round-label">{r.label}</span>
                <span className="manual-round-score">{res ? `${res.score}/${res.total} (${res.pct}%)` : "ยังไม่ได้ทำ"}</span>
              </button>
            );
          })}
          <div className="manual-round-summary">
            {delta !== null
              ? <span className={delta >= 0 ? "good" : "bad"}>ก่อน → หลังเทรน: {delta > 0 ? "+" : ""}{delta} ข้อ ({pre.pct}% → {post.pct}%){post.pct >= passPct ? " — ผ่านเกณฑ์ 🎉" : ` — ยังไม่ถึงเกณฑ์ ${passPct}%`}</span>
              : <span>ทำ “รอบก่อนเทรน” ก่อนเปิดคู่มือ 1 ครั้ง แล้วทำ “รอบหลังเทรน” หลังอบรมอีก 1 ครั้ง ระบบจะเทียบคะแนนให้</span>}
          </div>
          <div className="manual-toolbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={copySummary} disabled={!pre && !post}>{copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอกสรุปคะแนน"}</button>
          </div>
        </div>
        <div className="card-body manual-quiz-head">
          <div className="manual-quiz-meta">
            <b>{roundInfo.label}</b> · {roundInfo.hint}
            <br />
            {checked
              ? <span className={`manual-quiz-score ${round === "post" ? (passed ? "good" : "bad") : ""}`}>คะแนน {score}/{questions.length} ({pct}%) · ทำเมื่อ {formatWhen(saved?.at)}{round === "post" ? (passed ? " — ผ่านเกณฑ์ 🎉" : ` — ยังไม่ถึงเกณฑ์ ${passPct}% ดูเฉลยสีแดงด้านล่าง อ่านคู่มือหัวข้อนั้น แล้วกด “ทำใหม่”`) : " — ดูเฉลยได้ แต่แนะนำให้อ่านคู่มือแล้วค่อยทำรอบหลังเทรน"}</span>
              : <span>ตอบแล้ว {answeredCount}/{questions.length} ข้อ · ตอบครบแล้วกด “ตรวจคำตอบ” (ปุ่มมีทั้งบนและล่าง) ผลจะถูกเก็บไว้ในเครื่องนี้ภายใต้ชื่อ {currentUser?.nickname || currentUser?.name || "คุณ"}</span>}
          </div>
          <div className="manual-toolbar-actions">
            {!checked
              ? <button type="button" className="btn btn-primary btn-sm" onClick={check}>ตรวจคำตอบ</button>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (window.confirm(`ล้างผล${roundInfo.label}แล้วทำใหม่?`)) reset(); }}>ทำใหม่</button>}
          </div>
        </div>
        {missing.length > 0 && (
          <div className="manual-quiz-missing">⚠️ ยังตอบไม่ครบ อีก {missing.length} ข้อ: ข้อ {missing.join(", ")} — ตอบให้ครบแล้วกดตรวจอีกครั้ง (ข้อที่ยังไม่ตอบมีกรอบสีส้ม)</div>
        )}
      </div>

      {questions.map((qq, idx) => {
        const chosen = answers[qq.id];
        const correct = chosen === qq.answer;
        const isMissing = missing.includes(idx + 1);
        const sec = MANUAL_SECTIONS.find((x) => x.id === qq.sectionId);
        return (
          <div key={qq.id} id={`manual-q-${idx + 1}`} className={`card manual-question ${checked ? (correct ? "correct" : "wrong") : ""} ${isMissing ? "missing" : ""}`}>
            <div className="manual-question-text"><span className="manual-test-id">ข้อ {idx + 1}</span> {qq.q}{isMissing && <span className="manual-chip-missing">ยังไม่ตอบ</span>}</div>
            <div className="manual-choices">
              {qq.choices.map((c, ci) => {
                let cls = "manual-choice";
                if (chosen === ci) cls += " chosen";
                if (checked && ci === qq.answer) cls += " answer";
                if (checked && chosen === ci && !correct) cls += " wrong";
                return (
                  <label key={ci} className={cls}>
                    <input type="radio" name={`q-${qq.id}`} disabled={checked} checked={chosen === ci} onChange={() => answer(qq, ci)} />
                    <span>{c}</span>
                  </label>
                );
              })}
            </div>
            {checked && (
              <div className={`manual-explain ${correct ? "ok" : ""}`}>
                {correct ? "✅ ถูกต้อง" : "❌ ยังไม่ถูก"} — {qq.explain}{sec && !correct ? ` (อ่านหัวข้อ “${sec.title}” ในคู่มือ)` : ""}
              </div>
            )}
          </div>
        );
      })}

      <div className="card manual-quiz-foot">
        {!checked
          ? <>
              <span>{roundInfo.label} · ตอบแล้ว {answeredCount}/{questions.length} ข้อ</span>
              <button type="button" className="btn btn-primary" onClick={check}>ตรวจคำตอบ</button>
            </>
          : <>
              <span className={`manual-quiz-score ${round === "post" ? (passed ? "good" : "bad") : ""}`}>{roundInfo.label} · คะแนน {score}/{questions.length} ({pct}%)</span>
              {round === "pre" && !post && <button type="button" className="btn btn-primary" onClick={() => switchRound("post")}>ไปทำรอบหลังเทรน →</button>}
              <button type="button" className="btn btn-secondary" onClick={() => { if (window.confirm(`ล้างผล${roundInfo.label}แล้วทำใหม่?`)) reset(); }}>ทำใหม่</button>
            </>}
      </div>
    </div>
  );
}

export default function ManualPage({ currentUser }) {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("qlass_manual_tab") || "guide"; } catch { return "guide"; }
  });
  useEffect(() => { try { localStorage.setItem("qlass_manual_tab", tab); } catch { /* ignore */ } }, [tab]);

  const allowed = roleAllowedPages(currentUser?.role);
  const canToggle = ROLES.find((r) => r.value === currentUser?.role)?.branchScope === "all";
  const [showAll, setShowAll] = useState(false);

  const sections = useMemo(() => {
    if (showAll && canToggle) return MANUAL_SECTIONS;
    return MANUAL_SECTIONS.filter((s) => !s.pageId || allowed.includes(s.pageId));
  }, [showAll, canToggle, allowed]);

  return (
    <div className="manual-page">
      <div className="manual-header">
        <div>
          <h2 className="manual-h2">📖 คู่มือการใช้งาน Qlass</h2>
          <div className="manual-sub">
            เวอร์ชันคู่มือ {MANUAL_META.version} · ปรับปรุง {MANUAL_META.updatedAt} · บทบาทของคุณ: <b>{ROLE_LABEL[currentUser?.role] || "-"}</b>
          </div>
        </div>
        <div className="manual-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`manual-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "guide" && <GuideTab sections={sections} currentUser={currentUser} showAll={showAll} setShowAll={setShowAll} canToggle={canToggle} />}
      {tab === "quiz" && <QuizTab currentUser={currentUser} />}
    </div>
  );
}
