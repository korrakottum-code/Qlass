// ─── Smart Text Parser + Learning Engine (v2 — เทพ edition) ───

function buddhistToAD(y) {
  if (y < 100) y += 2500; // 69 → 2569
  if (y >= 2500) y -= 543; // BE → AD
  return y;
}

// ─── Fuzzy match: คำนวณ similarity ระหว่าง 2 string ───
function similarity(a, b) {
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.9;
  // bigram similarity
  function bigrams(s) {
    const bg = new Set();
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
    return bg;
  }
  const ba = bigrams(la), bb = bigrams(lb);
  let inter = 0;
  for (const x of ba) if (bb.has(x)) inter++;
  return ba.size + bb.size > 0 ? (2 * inter) / (ba.size + bb.size) : 0;
}

// ─── แปลงตัวเลขไทย → อารบิก ───
function normalizeThaiDigits(s) {
  return s.replace(/[๐-๙]/g, (c) => "๐๑๒๓๔๕๖๗๘๙".indexOf(c));
}

// ─── Normalize ข้อความ: ลบ emoji, zero-width, multiple spaces ───
function normalizeText(s) {
  return normalizeThaiDigits(s)
    .replace(/[\u200B-\u200F\uFEFF]/g, "") // zero-width chars
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Thai month name → number ───
const THAI_MONTHS = {
  "ม.ค.": 1, "มค": 1, "มกราคม": 1, "มกรา": 1,
  "ก.พ.": 2, "กพ": 2, "กุมภาพันธ์": 2, "กุมภา": 2,
  "มี.ค.": 3, "มีค": 3, "มีนาคม": 3, "มีนา": 3,
  "เม.ย.": 4, "เมย": 4, "เมษายน": 4, "เมษา": 4,
  "พ.ค.": 5, "พค": 5, "พฤษภาคม": 5, "พฤษภา": 5,
  "มิ.ย.": 6, "มิย": 6, "มิถุนายน": 6, "มิถุนา": 6,
  "ก.ค.": 7, "กค": 7, "กรกฎาคม": 7, "กรกฎา": 7,
  "ส.ค.": 8, "สค": 8, "สิงหาคม": 8, "สิงหา": 8,
  "ก.ย.": 9, "กย": 9, "กันยายน": 9, "กันยา": 9,
  "ต.ค.": 10, "ตค": 10, "ตุลาคม": 10, "ตุลา": 10,
  "พ.ย.": 11, "พย": 11, "พฤศจิกายน": 11, "พฤศจิกา": 11,
  "ธ.ค.": 12, "ธค": 12, "ธันวาคม": 12, "ธันวา": 12,
};

// ─── ชื่อเล่น/ตัวเขียนทั่วไปของหัตถการ ───
const PROCEDURE_ALIASES = {
  "ฟิลเลอร์": "Filler", "filler": "Filler", "ฟิล": "Filler", "ฟิวเลอร์": "Filler",
  "โบท็อกซ์": "Botox", "โบท็อก": "Botox", "โบ": "Botox", "botox": "Botox", "โบทอก": "Botox", "โบท๊อก": "Botox",
  "เลเซอร์": "Laser", "laser": "Laser", "เลเซอ": "Laser",
  "ไฮฟู": "HIFU", "hifu": "HIFU", "ไฮฟุ": "HIFU",
  "ร้อยไหม": "ร้อยไหม", "ร้อยใหม": "ร้อยไหม",
  "หน้าใส": "Facial Treatment", "facial": "Facial Treatment",
  "ลดไขมัน": "Meso Fat", "meso": "Meso Fat", "เมโส": "Meso Fat", "mesofat": "Meso Fat",
  "พีล": "Chemical Peel", "peel": "Chemical Peel", "เคมิคอล": "Chemical Peel",
  "กำจัดขน": "Diode Laser", "diode": "Diode Laser",
  "วิตามิน": "IV Drip", "iv": "IV Drip", "drip": "IV Drip", "ดริป": "IV Drip", "ดริปผิว": "IV Drip", "ดริปวิตามิน": "IV Drip",
  "อัลเทอร่า": "Ultherapy", "ulthera": "Ultherapy", "ultherapy": "Ultherapy",
  "ipl": "IPL",
};

/**
 * Parse free-form booking text into form fields.
 * v2: รองรับข้อความจาก LINE, chat, clipboard
 * - Fuzzy matching สาขา/หัตถการ/โปร
 * - Thai month names (5 เม.ย. 69)
 * - ราคาหลายรูปแบบ (1990, 1,990, 1990บาท, ฿1990)
 * - ชื่อ+ชื่อเล่น (คุณแนน, น.ส.สมหญิง (แนน))
 * - ข้อความหมายเหตุ (note)
 * - เลขไทย (๐-๙)
 */
export function parseBookingText(rawText, { branches, procedures, promos, rooms = [], hints = {} }) {
  const normalized = normalizeText(rawText);
  const lines = normalized.split(/\n/).map((l) => l.trim()).filter(Boolean);
  // จัด "บรรทัดรวม" สำหรับ single-line paste (เช่น "แนน 0921234567 Filler อุบล 5/4/69 15:00")
  const fullText = lines.join(" ");
  const result = {};
  const confidence = {};
  const usedLines = new Set();
  const notes = [];

  // ─── Phone (รองรับหลายรูปแบบ) ───
  const phonePatterns = [
    /(?:เบอร์|โทร|tel|phone)?[:\s]*(0[689]\d[\d\s\-]{7,12})/i,
    /(0[689]\d{8})/,
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const pat of phonePatterns) {
      const m = lines[i].match(pat) || fullText.match(pat);
      if (m) {
        result.phone = m[1].replace(/[\s\-]/g, "");
        if (result.phone.length >= 9 && result.phone.length <= 10) {
          confidence.phone = "high";
          usedLines.add(i);
          break;
        } else {
          delete result.phone;
        }
      }
    }
    if (result.phone) break;
  }

  // ─── Date (หลายรูปแบบ: dd/mm/yy, dd-mm-yyyy, 5 เม.ย. 69, วันที่ 5/4/69, พรุ่งนี้, มะรืน) ───
  // รูปแบบตัวเลข
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:วันที่\s*)?(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/) ||
              fullText.match(/(?:วันที่\s*)?(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/);
    if (m) {
      const d = String(m[1]).padStart(2, "0");
      const mo = String(m[2]).padStart(2, "0");
      const yr = buddhistToAD(parseInt(m[3]));
      result.date = `${yr}-${mo}-${d}`;
      confidence.date = "high";
      usedLines.add(i);
      break;
    }
  }
  // รูปแบบ "5 เม.ย. 69" หรือ "5 เมษายน 2569"
  if (!result.date) {
    const monthPattern = Object.keys(THAI_MONTHS).sort((a, b) => b.length - a.length).join("|");
    const re = new RegExp(`(\\d{1,2})\\s*(${monthPattern})\\.?\\s*(\\d{2,4})`, "i");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re) || fullText.match(re);
      if (m) {
        const d = String(m[1]).padStart(2, "0");
        const monthKey = Object.keys(THAI_MONTHS).find((k) => m[2].toLowerCase().startsWith(k.toLowerCase()));
        const mo = String(THAI_MONTHS[monthKey] || 1).padStart(2, "0");
        const yr = buddhistToAD(parseInt(m[3]));
        result.date = `${yr}-${mo}-${d}`;
        confidence.date = "high";
        usedLines.add(i);
        break;
      }
    }
  }
  // พรุ่งนี้ / มะรืน / วันนี้
  if (!result.date) {
    const today = new Date();
    for (let i = 0; i < lines.length; i++) {
      if (/พรุ่งนี้|พรุ่ง/.test(lines[i])) {
        const d = new Date(today); d.setDate(d.getDate() + 1);
        result.date = d.toISOString().split("T")[0];
        confidence.date = "high"; usedLines.add(i); break;
      }
      if (/มะรืน/.test(lines[i])) {
        const d = new Date(today); d.setDate(d.getDate() + 2);
        result.date = d.toISOString().split("T")[0];
        confidence.date = "high"; usedLines.add(i); break;
      }
      if (/วันนี้/.test(lines[i])) {
        result.date = today.toISOString().split("T")[0];
        confidence.date = "high"; usedLines.add(i); break;
      }
    }
  }

  // ─── Time → block (รองรับ "15.00", "3โมง", "บ่าย3", "15 นาฬิกา") ───
  const timePatterns = [
    /(?:เวลา\s*)?(\d{1,2})\s*[:\.]\s*(\d{2})\s*(?:น\.?)?/,
    /(?:เวลา\s*)(\d{1,2})\s*(?:โมง|นาฬิกา)/,
    /บ่าย\s*(\d{1,2})(?:\s*[:\.]\s*(\d{2}))?/,
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const pat of timePatterns) {
      const m = lines[i].match(pat) || fullText.match(pat);
      if (m) {
        let h = parseInt(m[1]);
        let min = parseInt(m[2] || "0");
        // "บ่าย3" → 15:00
        if (pat.source.includes("บ่าย") && h < 12) h += 12;
        if (h >= 7 && h <= 22) {
          result.timeBlock = h * 12 + Math.floor(min / 5);
          confidence.timeBlock = "high";
          usedLines.add(i);
        }
        break;
      }
    }
    if (result.timeBlock !== undefined) break;
  }

  // ─── Customer type (รองรับ "คนไข้ใหม่", "ลค.เก่า", "เคสคอร์ส" ฯลฯ) ───
  const custMap = [
    [/ใหม่|new|คนไข้ใหม่|ลูกค้าใหม่|ลค\.?\s*ใหม่|เคสใหม่/, "new"],
    [/เก่า|old|คนไข้เก่า|ลูกค้าเก่า|ลค\.?\s*เก่า|เคสเก่า|กลับมา|เก่ากลับ/, "old"],
    [/คอร์ส|course|ใช้คอร์ส|เคสคอร์ส/, "course"],
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const [re, val] of custMap) {
      if (re.test(lines[i])) {
        result.customerType = val;
        confidence.customerType = "high";
        usedLines.add(i);
        break;
      }
    }
    if (result.customerType) break;
  }
  // fallback: search fullText
  if (!result.customerType) {
    for (const [re, val] of custMap) {
      if (re.test(fullText)) {
        result.customerType = val;
        confidence.customerType = "med";
        break;
      }
    }
  }

  // ─── Price (หลายรูปแบบ: 1990฿, ฿1990, 1,990 บาท, ราคา 1990, 1990.-) ───
  const pricePatterns = [
    /(?:ราคา|price|โปร)\s*[:=]?\s*(\d[\d,]*)\s*(?:฿|บาท|baht)?/i,
    /(\d[\d,]*)\s*(?:฿|บาท|baht|\.\-)/i,
    /฿\s*(\d[\d,]*)/,
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const pat of pricePatterns) {
      const m = lines[i].match(pat);
      if (m) {
        const price = parseInt(m[1].replace(/,/g, ""));
        if (price >= 100 && price <= 999999) {
          result.price = price;
          confidence.price = "high";
          usedLines.add(i);
          break;
        }
      }
    }
    if (result.price) break;
  }

  // ─── Branch (learned aliases → fuzzy match → partial match) ───
  const branchAliases = hints.branchAliases || {};
  // ขั้น 1: learned aliases
  for (let i = 0; i < lines.length; i++) {
    for (const [alias, bId] of Object.entries(branchAliases)) {
      if (lines[i].toLowerCase().includes(alias.toLowerCase())) {
        result.branchId = bId;
        confidence.branchId = "high";
        usedLines.add(i);
        break;
      }
    }
    if (result.branchId) break;
  }
  // ขั้น 2: exact/partial match
  if (!result.branchId) {
    let bestScore = 0;
    let bestMatch = null;
    let bestLine = -1;
    for (let i = 0; i < lines.length; i++) {
      for (const branch of branches) {
        const short = branch.name.replace(/^(สาขา|Class)\s*/i, "").trim();
        const names = [branch.name, short].filter(Boolean);
        for (const n of names) {
          if (lines[i].includes(n) || fullText.includes(n)) {
            result.branchId = branch.id;
            confidence.branchId = "high";
            usedLines.add(i);
            bestMatch = null; // exact found
            break;
          }
          // fuzzy
          const score = similarity(lines[i], n);
          if (score > 0.6 && score > bestScore) {
            bestScore = score;
            bestMatch = branch;
            bestLine = i;
          }
        }
        if (result.branchId) break;
      }
      if (result.branchId) break;
    }
    if (!result.branchId && bestMatch) {
      result.branchId = bestMatch.id;
      confidence.branchId = bestScore > 0.8 ? "high" : "med";
      usedLines.add(bestLine);
    }
  }

  // ─── Procedure (learned + built-in Thai aliases + fuzzy) ───
  const procAliases = hints.procedureAliases || {};
  // ขั้น 1: learned aliases
  for (let i = 0; i < lines.length; i++) {
    for (const [alias, pId] of Object.entries(procAliases)) {
      if (lines[i].toLowerCase().includes(alias.toLowerCase())) {
        result.procedureId = pId;
        confidence.procedureId = "high";
        usedLines.add(i);
        break;
      }
    }
    if (result.procedureId) break;
  }
  // ขั้น 2: exact name match
  if (!result.procedureId) {
    for (let i = 0; i < lines.length; i++) {
      for (const proc of procedures) {
        if (lines[i].toLowerCase().includes(proc.name.toLowerCase())) {
          result.procedureId = proc.id;
          confidence.procedureId = "high";
          usedLines.add(i);
          break;
        }
      }
      if (result.procedureId) break;
    }
  }
  // ขั้น 3: built-in Thai aliases → match to actual procedure
  if (!result.procedureId) {
    const textLower = fullText.toLowerCase();
    for (const [alias, procName] of Object.entries(PROCEDURE_ALIASES)) {
      if (textLower.includes(alias.toLowerCase())) {
        const proc = procedures.find((p) => p.name.toLowerCase().includes(procName.toLowerCase()));
        if (proc) {
          result.procedureId = proc.id;
          confidence.procedureId = "high";
          break;
        }
      }
    }
  }
  // ขั้น 4: fuzzy match
  if (!result.procedureId) {
    let bestScore = 0;
    let bestProc = null;
    for (let i = 0; i < lines.length; i++) {
      for (const proc of procedures) {
        const score = similarity(lines[i], proc.name);
        if (score > 0.55 && score > bestScore) {
          bestScore = score;
          bestProc = proc;
        }
      }
    }
    if (bestProc) {
      result.procedureId = bestProc.id;
      confidence.procedureId = bestScore > 0.75 ? "high" : "med";
    }
  }

  // ─── Room (alias → name → infer) ───
  const roomAliases = hints.roomAliases || {};
  const procToRoom = hints.procedureToRoom || {};
  for (let i = 0; i < lines.length; i++) {
    for (const [alias, rId] of Object.entries(roomAliases)) {
      if (lines[i].toLowerCase().includes(alias.toLowerCase())) {
        result.roomId = rId;
        confidence.roomId = "high";
        usedLines.add(i);
        break;
      }
    }
    if (result.roomId) break;
  }
  if (!result.roomId && rooms.length > 0) {
    // match room name like M01, T02
    const roomRe = /\b([MT]\d{1,2})\b/i;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(roomRe) || fullText.match(roomRe);
      if (m) {
        const roomName = m[1].toUpperCase().replace(/^([MT])(\d)$/, "$10$2");
        const room = rooms.find((r) =>
          r.name.toUpperCase() === roomName && (!result.branchId || r.branchId === result.branchId)
        );
        if (room) {
          result.roomId = room.id;
          confidence.roomId = "high";
          usedLines.add(i);
        }
        break;
      }
    }
  }

  // ─── Promo (learned + name + procedure+price) ───
  const promoAliases = hints.promoAliases || {};
  for (let i = 0; i < lines.length; i++) {
    for (const [alias, prId] of Object.entries(promoAliases)) {
      if (lines[i].toLowerCase().includes(alias.toLowerCase())) {
        result.promoId = prId;
        confidence.promoId = "high";
        usedLines.add(i);
        break;
      }
    }
    if (result.promoId) break;
  }
  if (!result.promoId) {
    for (let i = 0; i < lines.length; i++) {
      for (const promo of promos.filter((p) => p.active)) {
        if (lines[i].toLowerCase().includes(promo.name.toLowerCase())) {
          result.promoId = promo.id;
          confidence.promoId = "high";
          usedLines.add(i);
          break;
        }
      }
      if (result.promoId) break;
    }
  }
  // match by "procedure name + price" pattern (e.g. "Filler 1990", "ฟิลเลอร์ 1,990")
  if (!result.promoId && result.price) {
    const pool = result.procedureId
      ? promos.filter((p) => p.procedureId === result.procedureId && p.active)
      : promos.filter((p) => p.active);
    const exact = pool.find((p) => p.price === result.price);
    if (exact) { result.promoId = exact.id; confidence.promoId = "high"; }
    else if (!result.promoId && result.procedureId) {
      const procPool = pool.filter((p) => p.procedureId === result.procedureId);
      if (procPool.length === 1) {
        result.promoId = procPool[0].id;
        confidence.promoId = "med";
      }
    }
  }

  // ─── Room inference จาก procedure (ถ้ายังไม่มีห้อง) ───
  if (!result.roomId && result.procedureId && rooms.length > 0) {
    const key = result.branchId
      ? `${result.procedureId}_${result.branchId}`
      : result.procedureId;
    const learnedRoom = procToRoom[key] || procToRoom[result.procedureId];
    if (learnedRoom) {
      result.roomId = learnedRoom;
      confidence.roomId = "high";
    } else {
      const proc = procedures.find((p) => p.id === result.procedureId);
      if (proc?.roomType) {
        const branchRooms = rooms.filter(
          (r) => r.type === proc.roomType && (!result.branchId || r.branchId === result.branchId)
        );
        if (branchRooms.length >= 1) {
          result.roomId = branchRooms[0].id;
          confidence.roomId = branchRooms.length === 1 ? "high" : "med";
        }
      }
    }
  }

  // ─── Name (smart: handle "1.หมวย", "คุณXX", "น.ส.", nicknames in parentheses) ───
  // คำที่ไม่ใช่ชื่อ (skip)
  const NOT_NAMES = /^(ปรึกษา|consult|สอบถาม|ติดต่อ|นัดหมาย|จอง|book|ใหม่|เก่า|คอร์ส|new|old|course)$/i;
  // ขั้น 1: pattern ที่ชัดเจนว่าเป็นชื่อ
  const namePatterns = [
    /(?:ชื่อ|คุณ|นาย|นาง|น\.?ส\.?|Ms\.?|Mr\.?|Mrs\.?)\s*([^\d\n]{2,30})/i,
    /^\d+[\.\)]\s*([ก-๙][ก-๙a-zA-Z\s]{1,30})/,  // "1.หมวย", "2.จิตราพร ทรงชัยเจริญ"
  ];
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    for (const pat of namePatterns) {
      const m = lines[i].match(pat);
      if (m) {
        let nameCandidate = m[1].replace(/\s*\(.*?\)\s*$/, "").trim();
        if (NOT_NAMES.test(nameCandidate)) continue;
        result.name = nameCandidate;
        // extract nickname from parentheses
        const nick = lines[i].match(/\(([^)]+)\)/);
        if (nick) result.name = `${result.name} (${nick[1]})`;
        confidence.name = "high";
        usedLines.add(i);
        break;
      }
    }
    if (result.name) break;
  }
  // ขั้น 2: fallback — first unused meaningful line
  if (!result.name) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      const line = lines[i];
      // skip obvious non-name patterns
      if (/^[\d\-\+\s]+$/.test(line)) continue;
      if (/฿|บาท/.test(line) && /\d/.test(line)) continue;
      if (/วันที่|เวลา|ราคา|หมายเหตุ|note/i.test(line)) continue;
      if (/^\d{1,2}\s*[:\.]\s*\d{2}$/.test(line)) continue;
      if (/^[MT]\d{1,2}$/i.test(line)) continue;
      // remove leading numbering (1. 2. 3) etc.)
      const cleaned = line.replace(/^\d+[\.\)\s]+/, "").replace(/^[-–•]\s*/, "").trim();
      if (NOT_NAMES.test(cleaned)) continue;
      // name should be 2-40 chars, start with Thai/English letter
      if (cleaned.length >= 2 && cleaned.length <= 40 && /^[ก-๙a-zA-Z]/.test(cleaned)) {
        result.name = cleaned;
        confidence.name = "med";
        usedLines.add(i);
        break;
      }
    }
  }

  // ─── Note (ข้อความที่เหลือที่ยังไม่ได้ใช้) ───
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const line = lines[i];
    // skip pure numbers and very short
    if (/^[\d\-\+\s]+$/.test(line)) continue;
    if (line.length <= 2) continue;
    // skip if it's already matched as name
    if (result.name && line.includes(result.name)) continue;
    // check if it starts with note-like prefix
    const noteMatch = line.match(/^(?:หมายเหตุ|note|memo|โน้ต|บันทึก)\s*[:：]?\s*(.+)/i);
    if (noteMatch) {
      notes.push(noteMatch[1].trim());
      usedLines.add(i);
      continue;
    }
    // remaining meaningful lines → collect as potential notes
    const cleaned = line.replace(/^\d+[\.\)\s]+/, "").trim();
    if (cleaned.length > 3 && !/^0[689]/.test(cleaned) && !/^\d+$/.test(cleaned)) {
      notes.push(cleaned);
    }
  }
  if (notes.length > 0) {
    result.note = notes.join(" / ");
    confidence.note = "med";
  }

  return { fields: result, confidence };
}

/**
 * แยกข้อความหลายคนออกเป็น blocks
 * รองรับ: เลขนำหน้า (1. 2. 3.), บรรทัดว่างคั่น, phone number เริ่มต้น block ใหม่
 * คืน array ของ string (แต่ละ block = 1 คน)
 */
export function splitMultiBooking(rawText) {
  const lines = rawText.split(/\n/).map((l) => l.trim());
  
  // ─── ขั้น 1: ตรวจว่ามีเลขนำหน้า (1. 2. 3.) หรือไม่ ───
  const numberedStarts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\d+[\.\)]\s*\S/.test(lines[i])) {
      numberedStarts.push(i);
    }
  }
  // ถ้ามีเลข >= 2 ตัว → split ตามเลข
  if (numberedStarts.length >= 2) {
    const blocks = [];
    for (let j = 0; j < numberedStarts.length; j++) {
      const start = numberedStarts[j];
      const end = j + 1 < numberedStarts.length ? numberedStarts[j + 1] : lines.length;
      blocks.push(lines.slice(start, end).join("\n"));
    }
    return blocks;
  }

  // ─── ขั้น 2: split ด้วยบรรทัดว่าง (2+ empty lines) ───
  const emptyBlocks = rawText.split(/\n\s*\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (emptyBlocks.length >= 2) {
    return emptyBlocks;
  }

  // ─── ขั้น 3: split ด้วย phone pattern (เจอเบอร์โทรใหม่ = คนใหม่) ───
  // ถ้ามี phone >= 2 ตัว → ย้อนขึ้น 1 บรรทัด (ชื่อ) เป็นจุดเริ่ม block
  const phoneLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*0[689]\d[\d\s\-]{7,12}$/.test(lines[i])) {
      phoneLines.push(i);
    }
  }
  if (phoneLines.length >= 2) {
    const blocks = [];
    for (let j = 0; j < phoneLines.length; j++) {
      // เริ่ม block จากบรรทัดก่อน phone (ชื่อ) หรือจาก phone เอง
      const nameLineIdx = phoneLines[j] > 0 ? phoneLines[j] - 1 : phoneLines[j];
      const start = j === 0 ? 0 : nameLineIdx;
      const end = j + 1 < phoneLines.length
        ? (phoneLines[j + 1] > 0 ? phoneLines[j + 1] - 1 : phoneLines[j + 1])
        : lines.length;
      blocks.push(lines.slice(start, end).join("\n"));
    }
    return blocks;
  }

  // ─── ไม่พบหลายคน → คืน array 1 block ───
  return [rawText];
}

/**
 * Parse หลายคนพร้อมกัน
 * คืน array ของ { fields, confidence }
 */
export function parseMultiBooking(rawText, context) {
  const blocks = splitMultiBooking(rawText);
  return blocks.map((block) => parseBookingText(block, context));
}

/**
 * เรียนรู้จาก correction ทั้ง 4 ช่อง: branch, procedure, promo, room
 * คืน hints ชุดใหม่
 */
export function learnFromCorrection(hints, rawText, parsedFields, finalFields, { branches, procedures, promos = [], rooms = [] }) {
  const next = {
    branchAliases:    { ...(hints.branchAliases    || {}) },
    procedureAliases: { ...(hints.procedureAliases || {}) },
    promoAliases:     { ...(hints.promoAliases     || {}) },
    roomAliases:      { ...(hints.roomAliases      || {}) },
    procedureToRoom:  { ...(hints.procedureToRoom  || {}) },
  };

  const candidates = rawText
    .split(/\n/)
    .map((l) => l.trim().replace(/^\d+[\.\)\s]+/, "").trim())
    .filter((l) => l.length > 1 && l.length <= 25);

  const isNoise = (l) =>
    /^[\d\-\+]+$/.test(l) ||
    /฿/.test(l) ||
    /\d{1,2}[\/\-]\d{1,2}/.test(l) ||
    /\d{1,2}:\d{2}/.test(l) ||
    /^(ใหม่|เก่า|คอร์ส|วันที่|เวลา)$/.test(l) ||
    /0[689]\d{8}/.test(l);

  function addAlias(map, line, targetId, targetNames) {
    if (isNoise(line)) return;
    // ไม่เก็บถ้าชื่อจริงอยู่ใน line แล้ว
    if (targetNames.some((n) => line.toLowerCase().includes(n.toLowerCase()))) return;
    // ไม่ overwrite alias ที่ map ไป id อื่น
    if (map[line] && map[line] !== targetId) return;
    map[line] = targetId;
  }

  // ─── Branch ───
  if (parsedFields.branchId !== finalFields.branchId && finalFields.branchId) {
    const branch = branches.find((b) => b.id === finalFields.branchId);
    if (branch) {
      const names = [branch.name, branch.name.replace(/^สาขา/, "").trim()];
      for (const line of candidates) {
        addAlias(next.branchAliases, line, finalFields.branchId, names);
      }
    }
  }

  // ─── Procedure ───
  if (parsedFields.procedureId !== finalFields.procedureId && finalFields.procedureId) {
    const proc = procedures.find((p) => p.id === finalFields.procedureId);
    if (proc) {
      for (const line of candidates) {
        addAlias(next.procedureAliases, line, finalFields.procedureId, [proc.name]);
      }
    }
  }

  // ─── Promo ───
  if (parsedFields.promoId !== finalFields.promoId && finalFields.promoId) {
    const promo = promos.find((p) => p.id === finalFields.promoId);
    if (promo) {
      for (const line of candidates) {
        addAlias(next.promoAliases, line, finalFields.promoId, [promo.name]);
      }
    }
  }

  // ─── Room (alias + procedureToRoom) ───
  if (parsedFields.roomId !== finalFields.roomId && finalFields.roomId) {
    const room = rooms.find((r) => r.id === finalFields.roomId);
    if (room) {
      // text alias
      for (const line of candidates) {
        addAlias(next.roomAliases, line, finalFields.roomId, [room.name]);
      }
    }
  }
  // เรียนรู้ procedure → room ทุกครั้งที่มีทั้งสอง (ไม่ต้องรอ conflict)
  if (finalFields.procedureId && finalFields.roomId) {
    const key = finalFields.branchId
      ? `${finalFields.procedureId}_${finalFields.branchId}`
      : finalFields.procedureId;
    next.procedureToRoom[key] = finalFields.roomId;
  }

  return next;
}

export function blockToTimeStr(block) {
  if (block === null || block === undefined) return "—";
  const total = block * 5;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
