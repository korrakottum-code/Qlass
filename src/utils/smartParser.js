// ─── Smart Text Parser + Learning Engine ───

function buddhistToAD(y) {
  if (y < 100) y += 2500; // 69 → 2569
  if (y >= 2500) y -= 543; // BE → AD
  return y;
}

/**
 * Parse free-form booking text into form fields.
 * hints = {
 *   branchAliases:    { "หอกาญ": "b1" },
 *   procedureAliases: { "ฟิลเลอร์": "p2" },
 *   promoAliases:     { "ฟิลเลอร์ 1990": "pr5" },
 *   roomAliases:      { "M01": "r1" },
 * }
 */
export function parseBookingText(rawText, { branches, procedures, promos, rooms = [], hints = {} }) {
  const lines = rawText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const result = {};
  const confidence = {};
  const usedLines = new Set();

  // ─── Phone ───
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(0[689]\d[\d\-]{7,9})$/) ||
              lines[i].match(/(0[689]\d[\d\-]{7,9})/);
    if (m) {
      result.phone = m[1].replace(/-/g, "");
      confidence.phone = "high";
      usedLines.add(i);
      break;
    }
  }

  // ─── Date ───
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:วันที่\s*)?(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
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

  // ─── Time → block ───
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:เวลา\s*)?(\d{1,2}):(\d{2})/);
    if (m) {
      const h = parseInt(m[1]);
      const min = parseInt(m[2]);
      result.timeBlock = h * 12 + Math.floor(min / 5);
      confidence.timeBlock = "high";
      usedLines.add(i);
      break;
    }
  }

  // ─── Customer type ───
  const custMap = [
    [/^ใหม่$/, "new"],
    [/^เก่า$/, "old"],
    [/^คอร์ส$|^ใช้คอร์ส$/, "course"],
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

  // ─── Price ───
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(\d[\d,]*)\s*฿|฿\s*(\d[\d,]*)/);
    if (m) {
      result.price = parseInt((m[1] || m[2]).replace(/,/g, ""));
      confidence.price = "high";
      break;
    }
  }

  // ─── Branch (learned aliases → fuzzy match) ───
  const branchAliases = hints.branchAliases || {};
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
  if (!result.branchId) {
    for (let i = 0; i < lines.length; i++) {
      for (const branch of branches) {
        const short = branch.name.replace(/^สาขา/, "").trim();
        if (lines[i].includes(branch.name) || (short && lines[i].includes(short))) {
          result.branchId = branch.id;
          confidence.branchId = "high";
          usedLines.add(i);
          break;
        }
      }
      if (result.branchId) break;
    }
  }

  // ─── Room: infer จาก procedure+branch (เรียนรู้ได้) ───
  // ขั้น 1: learned procedureToRoom (specific: procId_branchId → roomId)
  const procToRoom = hints.procedureToRoom || {};
  // (ยังไม่มี procedureId ตอนนี้ — จะ resolve หลัง procedure section)

  // ขั้น 2: room name alias ในข้อความ (กรณีพิมพ์ชื่อห้องมาด้วย)
  const roomAliases = hints.roomAliases || {};
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
    for (let i = 0; i < lines.length; i++) {
      for (const room of rooms) {
        if (lines[i].toUpperCase() === room.name.toUpperCase()) {
          if (!result.branchId || room.branchId === result.branchId) {
            result.roomId = room.id;
            confidence.roomId = "high";
            usedLines.add(i);
            break;
          }
        }
      }
      if (result.roomId) break;
    }
  }
  // room จะ resolve อีกครั้งหลัง procedure (ด้านล่าง)

  // ─── Procedure (learned aliases → name match) ───
  const procAliases = hints.procedureAliases || {};
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

  // ─── Promo (learned aliases → match by procedure+price) ───
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
    // match by promo name in text
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
  if (!result.promoId && result.procedureId) {
    // fallback: match by procedure + price
    const pool = promos.filter((p) => p.procedureId === result.procedureId && p.active);
    if (result.price) {
      const exact = pool.find((p) => p.price === result.price);
      if (exact) { result.promoId = exact.id; confidence.promoId = "high"; }
    }
    if (!result.promoId && pool.length === 1) {
      result.promoId = pool[0].id;
      confidence.promoId = "med";
    }
  }

  // ─── Room inference จาก procedure (ถ้ายังไม่มีห้อง) ───
  if (!result.roomId && result.procedureId && rooms.length > 0) {
    // ขั้น 1: learned procedureToRoom mapping
    const key = result.branchId
      ? `${result.procedureId}_${result.branchId}`
      : result.procedureId;
    const learnedRoom = procToRoom[key] || procToRoom[result.procedureId];
    if (learnedRoom) {
      result.roomId = learnedRoom;
      confidence.roomId = "high";
    } else {
      // ขั้น 2: infer จาก roomType ของ procedure
      const proc = procedures.find((p) => p.id === result.procedureId);
      if (proc?.roomType) {
        const branchRooms = rooms.filter(
          (r) => r.type === proc.roomType && (!result.branchId || r.branchId === result.branchId)
        );
        if (branchRooms.length === 1) {
          result.roomId = branchRooms[0].id;
          confidence.roomId = "med"; // inferred
        } else if (branchRooms.length > 1) {
          result.roomId = branchRooms[0].id;
          confidence.roomId = "med";
        }
      }
    }
  }

  // ─── Name (first unused meaningful line) ───
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const line = lines[i];
    if (/^[\d\-\+\s]+$/.test(line)) continue;
    if (/฿/.test(line)) continue;
    if (/วันที่|เวลา/.test(line)) continue;
    if (/^\d{1,2}:\d{2}$/.test(line)) continue;
    // skip room names (M01, T02 etc.)
    if (/^[MT]\d{2}$/i.test(line)) continue;
    const cleaned = line.replace(/^\d+[\.\)\s]+/, "").trim();
    if (cleaned.length > 1) {
      result.name = cleaned;
      confidence.name = "high";
      break;
    }
  }

  return { fields: result, confidence };
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
