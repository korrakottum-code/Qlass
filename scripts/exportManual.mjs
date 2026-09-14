// สร้างเอกสาร Markdown จากเนื้อหาคู่มือ/แบบทดสอบชุดเดียวกับที่ใช้ในแอป
//   node scripts/exportManual.mjs  → docs/USER_MANUAL.md, docs/QUIZ_PRE_POST.md
import { writeFileSync } from "node:fs";
import { NAV_ITEMS, ROLES } from "../src/utils/constants.js";
import { MANUAL_META, MANUAL_SECTIONS } from "../src/manual/manualContent.js";
import { QUIZ_META, QUIZ_QUESTIONS } from "../src/manual/testContent.js";

const NAV_LABEL = Object.fromEntries(NAV_ITEMS.filter((n) => n.id).map((n) => [n.id, `${n.icon} ${n.label}`]));
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
const esc = (s) => String(s).replace(/\|/g, "\\|");

function renderBlock(b) {
  switch (b.type) {
    case "p": return `${b.text}\n`;
    case "img": return `![${b.caption || ""}](../public${b.src})\n${b.caption ? `*${b.caption}*\n` : ""}`;
    case "steps": return `${b.title ? `**${b.title}**\n\n` : ""}${b.items.map((it, i) => `${i + 1}. ${it}`).join("\n")}\n`;
    case "list": return `${b.title ? `**${b.title}**\n\n` : ""}${b.items.map((it) => `- ${it}`).join("\n")}\n`;
    case "tip": return `> 💡 **เคล็ดลับ**\n${b.items.map((it) => `> - ${it}`).join("\n")}\n`;
    case "warn": return `> ⚠️ **ข้อควรระวัง**\n${b.items.map((it) => `> - ${it}`).join("\n")}\n`;
    case "table": return `${b.title ? `**${b.title}**\n\n` : ""}| ${b.headers.map(esc).join(" | ")} |\n| ${b.headers.map(() => "---").join(" | ")} |\n${b.rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n")}\n`;
    case "faq": return `${b.items.map((it) => `**ถาม: ${it.q}**\n\nตอบ: ${it.a}\n`).join("\n")}`;
    default: return "";
  }
}

let manual = `# คู่มือการใช้งาน Qlass\n\nเวอร์ชัน ${MANUAL_META.version} · ปรับปรุง ${MANUAL_META.updatedAt}\n\n`;
manual += `> คู่มือนี้อ่านได้ในแอปที่เมนู “📖 คู่มือการใช้งาน” (มีช่องค้นหาและแบบทดสอบ) ไฟล์นี้เป็นฉบับพิมพ์/ส่งต่อ\n\n`;
manual += "## สารบัญ\n\n";
let lastGroup = null;
for (const s of MANUAL_SECTIONS) {
  if (s.group !== lastGroup) { manual += `\n**${s.group}**\n\n`; lastGroup = s.group; }
  manual += `- [${s.icon} ${s.title}](#${s.id})\n`;
}
lastGroup = null;
for (const s of MANUAL_SECTIONS) {
  if (s.group !== lastGroup) { manual += `\n---\n\n# ${s.group}\n`; lastGroup = s.group; }
  manual += `\n<a id="${s.id}"></a>\n## ${s.icon} ${s.title}\n\n`;
  if (s.pageId) manual += `เมนู: ${NAV_LABEL[s.pageId]}  \n`;
  if (s.roles) manual += `ใช้ได้กับบทบาท: ${s.roles.map((r) => ROLE_LABEL[r]).join(" · ")}\n`;
  if (s.pageId || s.roles) manual += "\n";
  if (s.intro) manual += `${s.intro}\n\n`;
  for (const b of s.blocks) manual += renderBlock(b) + "\n";
}
manual += `\n\n<!-- สร้างอัตโนมัติจาก src/manual/manualContent.js — แก้ที่ไฟล์นั้นแล้วรัน npm run manual:docs -->\n`;
writeFileSync("docs/USER_MANUAL.md", manual);

let quiz = `# แบบทดสอบก่อนเทรน / หลังเทรน — Qlass\n\nเวอร์ชัน ${MANUAL_META.version} · ปรับปรุง ${MANUAL_META.updatedAt} · ${QUIZ_QUESTIONS.length} ข้อ ชุดเดียวกันทั้งสองรอบ\n\n`;
quiz += `> ชุดเดียวกับแท็บ “🧠 แบบทดสอบ ก่อน/หลังเทรน” ในเมนู “📖 คู่มือการใช้งาน” ของแอป (ในแอปคิดคะแนนและเก็บผลทั้งสองรอบให้ คัดลอกสรุปส่งหัวหน้าได้) ไฟล์นี้เป็นฉบับพิมพ์\n\n`;
quiz += "## วิธีใช้\n\n";
QUIZ_META.rounds.forEach((r) => { quiz += `- **${r.label}:** ${r.hint}\n`; });
quiz += `- ทุกบทบาทตอบชุดเดียวกัน เกณฑ์ผ่านรอบหลังเทรน ${QUIZ_META.passPct}% · ให้ผู้เข้าอบรมทำรอบก่อนเทรนก่อนเปิดคู่มือ และทำรอบหลังเทรนภายในวันเดียวกับที่อบรมเสร็จ\n`;
quiz += "- ชื่อผู้ทำ: ______________  บทบาท: __________  คะแนนก่อนเทรน: ____/" + QUIZ_QUESTIONS.length + "  คะแนนหลังเทรน: ____/" + QUIZ_QUESTIONS.length + "\n\n";
quiz += "## คำถาม\n\n";
QUIZ_QUESTIONS.forEach((q, i) => {
  quiz += `**ข้อ ${i + 1}.** ${q.q}\n\n`;
  quiz += q.choices.map((c, ci) => `- ${["ก", "ข", "ค", "ง"][ci]}. ${c}`).join("\n") + "\n\n";
});
quiz += "## เฉลย (สำหรับผู้ตรวจ)\n\n| ข้อ | คำตอบ | เหตุผล | หัวข้อในคู่มือ |\n| --- | --- | --- | --- |\n";
QUIZ_QUESTIONS.forEach((q, i) => {
  const sec = MANUAL_SECTIONS.find((x) => x.id === q.sectionId);
  quiz += `| ${i + 1} | ${["ก", "ข", "ค", "ง"][q.answer]} | ${esc(q.explain)} | ${sec ? esc(sec.title) : q.sectionId} |\n`;
});
quiz += `\n\n<!-- สร้างอัตโนมัติจาก src/manual/testContent.js — แก้ที่ไฟล์นั้นแล้วรัน npm run manual:docs -->\n`;
writeFileSync("docs/QUIZ_PRE_POST.md", quiz);
console.log(`docs/USER_MANUAL.md (${MANUAL_SECTIONS.length} หัวข้อ), docs/QUIZ_PRE_POST.md (${QUIZ_QUESTIONS.length} ข้อ)`);
