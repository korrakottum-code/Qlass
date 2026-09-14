import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// วันที่ในระบบต้องคิดด้วย "เวลาไทย" เสมอ ห้ามคิดด้วย UTC
//
// ไทยเร็วกว่า UTC 7 ชั่วโมง — toISOString() คืนวันแบบ UTC ช่วงเที่ยงคืนถึงเจ็ดโมงเช้า
// ตามเวลาไทย ฝั่ง UTC ยังเป็น "เมื่อวาน" อยู่ ทุกที่ที่เอาผลนั้นไปใช้เป็นวันที่จึงเพี้ยน
// ไป 1 วันเงียบ ๆ เฉพาะช่วงเวลานั้น ซึ่งจับได้ยากมากเพราะกลางวันทุกอย่างดูปกติ
//
// ตัวอย่างที่เคยมีจริงในโค้ดนี้: ตัวแยกข้อความอ่านคำว่า "พรุ่งนี้" แล้วได้ "วันนี้"
// = คิวลงผิดวันโดยไม่มีใครรู้ (แก้แล้ว 12 ก.ย. 2569)

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(name) ? [full] : [];
  });
}

// toISOString() ใช้ได้อย่างเดียว: เก็บ "เวลาที่เกิดเหตุ" ลงคอลัมน์ timestamp
// (updated_at / status_updated_at / resolved_at / at / exportedAt / ขอบช่วงเวลาที่สร้างจาก
// เวลาเครื่องอยู่แล้ว) — ห้ามเอาไปตัดเป็นวันที่
const TIMESTAMP_OK = /(updated_at|resolved_at|statusUpdatedAt|at: new Date|exportedAt|start\.toISOString|end\.toISOString)/;

test("ห้ามตัดวันที่ออกจาก toISOString() ที่ไหนอีก", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (!line.includes("toISOString()")) return;
      if (line.trimStart().startsWith("//")) return;      // คอมเมนต์อธิบายกฎข้อนี้เอง
      if (TIMESTAMP_OK.test(line)) return;
      offenders.push(`${path.relative(SRC, file)}:${i + 1} → ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [],
    "บรรทัดพวกนี้เอา toISOString() (UTC) ไปทำเป็นวันที่ ต้องใช้เวลาเครื่อง (getTodayStr / isoToLocalDateStr / addDays) แทน");
});

// ฟังก์ชันจริงจาก smartParser.js — ตัดออกมารันตรง ๆ (ไฟล์นั้น import แบบไม่มีนามสกุล
// node ESM จึงโหลดทั้งไฟล์ไม่ได้ ใช้วิธีเดียวกับ guard อื่นในโปรเจกต์)
function loadToLocalDateStr() {
  const src = readFileSync(new URL("../src/utils/smartParser.js", import.meta.url), "utf8");
  const start = src.indexOf("function toLocalDateStr");
  assert.ok(start > 0, "หา toLocalDateStr ใน smartParser.js ไม่เจอ");
  const body = src.slice(start, src.indexOf("\n}", start) + 2);
  return new Function(`${body}; return toLocalDateStr;`)();
}

test("ตี 1 ต้องได้วันของวันนั้น ไม่ใช่เมื่อวาน", () => {
  const toLocalDateStr = loadToLocalDateStr();
  // 12 ก.ย. 2569 ตี 1 ตามเวลาเครื่อง — ฝั่ง UTC ยังเป็นวันที่ 11 อยู่
  assert.equal(toLocalDateStr(new Date(2026, 8, 12, 1, 0, 0)), "2026-09-12");
  // เที่ยงคืนตรง กับก่อนเที่ยงคืนหนึ่งนาที ต้องคนละวันและตรงตามเวลาเครื่อง
  assert.equal(toLocalDateStr(new Date(2026, 8, 12, 0, 0, 0)), "2026-09-12");
  assert.equal(toLocalDateStr(new Date(2026, 8, 11, 23, 59, 0)), "2026-09-11");
});

test("วันนี้ / พรุ่งนี้ / มะรืน ต้องอ่านด้วยเวลาเครื่อง", () => {
  const src = readFileSync(new URL("../src/utils/smartParser.js", import.meta.url), "utf8");
  assert.equal((src.match(/result\.date = toLocalDateStr\(/g) || []).length, 3,
    "ทั้งสามคำต้องผ่าน toLocalDateStr");
});
