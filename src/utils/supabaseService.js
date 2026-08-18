import { supabase } from "./supabaseClient";
import { fetchAllByUuidRanges, HISTORY_PAGE_SIZE } from "./queueHistoryPagination";
import { getServerSessionToken } from "./sessionAuth";
import { buildQueueStatusUpdate } from "./queueStatusUpdate";
import { lookupHnCustomers } from "./hnLookup";

// ═══════════════════════════════════════════════════════════
// BRANCHES
// ═══════════════════════════════════════════════════════════

export async function fetchBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  // createdAt: ใช้คำนวณว่าสาขาไหน "เปิดอยู่จริง" ในวันที่ผ่านมาแล้วกี่วัน (เช่น Goal ที่ต้อง
  // เทียบตัวเลขย้อนหลังแบบไม่ให้สาขาใหม่ที่ทยอยเปิดมาดันค่าเฉลี่ยเพี้ยน)
  return data.map(b => ({ id: b.id, name: b.name, createdAt: b.created_at }));
}

export async function createBranch(branch) {
  const { data, error } = await supabase
    .from("branches")
    .insert([{ name: branch.name }])
    .select()
    .single();
  
  if (error) throw error;
  return { id: data.id, name: data.name };
}

export async function updateBranch(id, branch) {
  const { data, error } = await supabase
    .from("branches")
    .update({ name: branch.name })
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return { id: data.id, name: data.name };
}

export async function deleteBranch(id) {
  const { error } = await supabase
    .from("branches")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// PROCEDURES
// ═══════════════════════════════════════════════════════════

export async function fetchProcedures() {
  const { data, error } = await supabase
    .from("procedures")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(p => ({
    id: p.id,
    name: p.name,
    blocks: p.blocks,
    category: p.category || "",
    roomType: p.room_type,
  }));
}

export async function createProcedure(procedure) {
  const { data, error } = await supabase
    .from("procedures")
    .insert([{
      name: procedure.name,
      blocks: procedure.blocks,
      category: procedure.category,
      room_type: procedure.roomType,
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    blocks: data.blocks,
    category: data.category || "",
    roomType: data.room_type,
  };
}

export async function updateProcedure(id, procedure) {
  const { data, error } = await supabase
    .from("procedures")
    .update({
      name: procedure.name,
      blocks: procedure.blocks,
      category: procedure.category,
      room_type: procedure.roomType,
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    blocks: data.blocks,
    category: data.category || "",
    roomType: data.room_type,
  };
}

export async function deleteProcedure(id) {
  const { error } = await supabase
    .from("procedures")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// PROMOS
// ═══════════════════════════════════════════════════════════

export async function fetchPromos() {
  const { data, error } = await supabase
    .from("promos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(p => ({
    id: p.id,
    name: p.name,
    procedureId: p.procedure_id,
    price: parseFloat(p.price),
    active: p.active,
    sortOrder: p.sort_order ?? 0,
  }));
}

export async function createPromo(promo) {
  const { data, error } = await supabase
    .from("promos")
    .insert([{
      name: promo.name,
      procedure_id: promo.procedureId,
      price: promo.price,
      active: promo.active,
      sort_order: promo.sortOrder ?? 0,
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    procedureId: data.procedure_id,
    price: parseFloat(data.price),
    active: data.active,
    sortOrder: data.sort_order ?? 0,
  };
}

export async function updatePromo(id, promo) {
  const payload = {};
  if (promo.name !== undefined) payload.name = promo.name;
  if (promo.procedureId !== undefined) payload.procedure_id = promo.procedureId;
  if (promo.price !== undefined) payload.price = promo.price;
  if (promo.active !== undefined) payload.active = promo.active;
  if (promo.sortOrder !== undefined) payload.sort_order = promo.sortOrder;
  
  const { data, error } = await supabase
    .from("promos")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    procedureId: data.procedure_id,
    price: parseFloat(data.price),
    active: data.active,
    sortOrder: data.sort_order ?? 0,
  };
}

export async function deletePromo(id) {
  const { error } = await supabase
    .from("promos")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// ROOMS
// ═══════════════════════════════════════════════════════════

export async function fetchRooms() {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    name: r.name,
    branchId: r.branch_id,
    type: r.type,
    notes: r.notes || "",
    openBlock: r.open_block,
    closeBlock: r.close_block,
    sortOrder: r.sort_order ?? 0,
  }));
}

export async function createRoom(room) {
  const { data, error } = await supabase
    .from("rooms")
    .insert([{
      name: room.name,
      branch_id: room.branchId,
      type: room.type,
      notes: room.notes,
      open_block: room.openBlock,
      close_block: room.closeBlock,
      sort_order: room.sortOrder ?? 0,
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    branchId: data.branch_id,
    type: data.type,
    notes: data.notes || "",
    openBlock: data.open_block,
    closeBlock: data.close_block,
    sortOrder: data.sort_order ?? 0,
  };
}

export async function updateRoom(id, room) {
  const payload = {};
  if (room.name !== undefined) payload.name = room.name;
  if (room.branchId !== undefined) payload.branch_id = room.branchId;
  if (room.type !== undefined) payload.type = room.type;
  if (room.notes !== undefined) payload.notes = room.notes;
  if (room.openBlock !== undefined) payload.open_block = room.openBlock;
  if (room.closeBlock !== undefined) payload.close_block = room.closeBlock;
  if (room.sortOrder !== undefined) payload.sort_order = room.sortOrder;

  const { data, error } = await supabase
    .from("rooms")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    branchId: data.branch_id,
    type: data.type,
    notes: data.notes || "",
    openBlock: data.open_block,
    closeBlock: data.close_block,
    sortOrder: data.sort_order ?? 0,
  };
}

export async function deleteRoom(id) {
  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// ROOM PROCEDURES (เตียงไหนรับหัตถการอะไร)
// ═══════════════════════════════════════════════════════════

export function mapRoomProcedureRow(row) {
  return { roomId: row.room_id, procedureId: row.procedure_id };
}

export async function fetchRoomProcedures() {
  const { data, error } = await supabase
    .from("room_procedures")
    .select("room_id, procedure_id");

  if (error) throw error;
  return data.map(mapRoomProcedureRow);
}

/**
 * เขียนทับชุดหัตถการของเตียงหนึ่ง ๆ ให้เท่ากับ procedureIds ที่ส่งมา
 *
 * ลบเฉพาะส่วนเกินแล้วเพิ่มเฉพาะส่วนขาด ไม่ใช่ล้างทั้งเตียงแล้วใส่ใหม่ — ระหว่างที่ล้าง
 * เตียงจะไม่มีแถวเลย ซึ่งฝั่งแอปแปลว่า "ยังไม่ตั้งค่า" (เปิดรับทุกหัตถการตามกติกาเดิม)
 * ถ้ามีคนลงคิวแทรกจังหวะนั้นพอดีจะลงผิดเตียงได้
 */
export async function setRoomProcedures(roomId, procedureIds) {
  const wanted = Array.from(new Set(procedureIds || []));

  const { data: existingRows, error: readError } = await supabase
    .from("room_procedures")
    .select("procedure_id")
    .eq("room_id", roomId);
  if (readError) throw readError;

  const existing = new Set((existingRows || []).map((row) => row.procedure_id));
  const toAdd = wanted.filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.includes(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("room_procedures")
      .insert(toAdd.map((procedureId) => ({ room_id: roomId, procedure_id: procedureId })));
    if (error) throw error;
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("room_procedures")
      .delete()
      .eq("room_id", roomId)
      .in("procedure_id", toRemove);
    if (error) throw error;
  }

  return wanted.map((procedureId) => ({ roomId, procedureId }));
}

export const getAllRoomProcedures = fetchRoomProcedures;

// ═══════════════════════════════════════════════════════════
// ROOM SCHEDULES
// ═══════════════════════════════════════════════════════════

// mapper เดียวสำหรับทุกทางที่อ่านแถว room_schedules (fetch / create / update / realtime)
// noteOnly ไม่ใช่คอลัมน์ — คำนวณจากค่าอื่นตอนอ่าน / source เป็นคอลัมน์ใหม่ (nullable) จาก
// migration 20260817200000: null = แถวเดิม/กรอกเอง, 'bed_switch' = ปุ่มปิดเตียงบน Timeline
export function mapRoomScheduleRow(s) {
  return {
    id: s.id,
    roomId: s.room_id,
    date: s.date || "",
    available: s.available,
    startBlock: s.start_block,
    endBlock: s.end_block,
    noteOnly: s.start_block === null && s.end_block === null && s.available === true,
    note: s.note || "",
    source: s.source ?? null,
  };
}

export async function fetchRoomSchedules() {
  const PAGE_SIZE = 1000;

  // Get total count first, then fetch all pages in parallel
  const { count, error: countError } = await supabase
    .from("room_schedules")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;

  if (!count || count === 0) return [];

  const numPages = Math.ceil(count / PAGE_SIZE);
  const promises = [];
  for (let i = 0; i < numPages; i++) {
    promises.push(
      supabase
        .from("room_schedules")
        .select("*")
        .order("created_at", { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    );
  }
  const results = await Promise.all(promises);
  const allData = [];
  for (const { data, error } of results) {
    if (error) throw error;
    if (data) allData.push(...data);
  }

  const unique = Array.from(new Map(allData.map((s) => [s.id, s])).values());

  return unique.map(mapRoomScheduleRow);
}

export async function createRoomSchedule(schedule) {
  const isNoteOnly = schedule.noteOnly;
  const { data, error } = await supabase
    .from("room_schedules")
    .insert([{
      room_id: schedule.roomId,
      date: schedule.date || null,
      available: schedule.available,
      start_block: isNoteOnly ? null : schedule.startBlock,
      end_block: isNoteOnly ? null : schedule.endBlock,
      note: schedule.note,
      // ส่ง source เฉพาะเมื่อมีค่า — payload ของ ScheduleModal เดิมต้องเหมือนเดิมทุกไบต์
      // ไม่งั้นถ้า migration คอลัมน์ source ยังไม่ลง การบันทึกตารางเดิมทั้งหมดจะพัง (PGRST204)
      ...(schedule.source ? { source: schedule.source } : {}),
    }])
    .select()
    .single();
  
  if (error) throw error;
  return mapRoomScheduleRow(data);
}

export async function updateRoomSchedule(id, schedule) {
  const isNoteOnly = schedule.noteOnly;
  const { data, error } = await supabase
    .from("room_schedules")
    .update({
      room_id: schedule.roomId,
      date: schedule.date || null,
      available: isNoteOnly ? true : schedule.available,
      start_block: isNoteOnly ? null : schedule.startBlock,
      end_block: isNoteOnly ? null : schedule.endBlock,
      note: schedule.note,
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return mapRoomScheduleRow(data);
}

export async function deleteRoomSchedule(id) {
  const { error } = await supabase
    .from("room_schedules")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

/**
 * เปิดเตียงคืน: ลบเฉพาะแถว "ปิดทั้งวัน" ที่ปุ่มปิดเตียงสร้าง (source = 'bed_switch') ของเตียง+วันนั้น
 * กรองที่ DB ไม่ใช่ local state — ถ้าสองคนกดปิดพร้อมกันจนมีสองแถว จะลบครบ
 * แถวที่คนกรอกเองผ่าน ScheduleModal (source ว่าง) ไม่ถูกแตะเด็ดขาด
 * คืน id[] ที่ลบไป เพื่อให้ผู้เรียกเอาออกจาก state ได้ตรงตัว
 */
export async function deleteBedSwitchClosures(roomId, date) {
  const { data, error } = await supabase
    .from("room_schedules")
    .delete()
    .eq("room_id", roomId)
    .eq("date", date)
    .eq("source", "bed_switch")
    .eq("available", false)
    .is("start_block", null)
    .is("end_block", null)
    .select("id");

  if (error) throw error;
  return (data || []).map((row) => row.id);
}

// ═══════════════════════════════════════════════════════════
// STAFF
// ═══════════════════════════════════════════════════════════

export async function fetchStaff() {
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(s => ({
    id: s.id,
    name: s.name,
    nickname: s.nickname || "",
    phone: s.phone || "",
    branchId: s.branch_id,
    role: s.role,
    pin: s.pin,
    active: s.active,
    commissionRates: {
      new: parseFloat(s.commission_rate_new || 0),
      old: parseFloat(s.commission_rate_old || 0),
      course: parseFloat(s.commission_rate_course || 0),
    },
  }));
}

export async function createStaff(staff) {
  const rates = staff.commissionRates || { new: 0, old: 0, course: 0 };
  const { data, error } = await supabase
    .from("staff")
    .insert([{
      name: staff.name,
      nickname: staff.nickname,
      phone: staff.phone,
      branch_id: staff.branchId,
      role: staff.role,
      pin: staff.pin,
      active: staff.active,
      commission_rate_new: rates.new,
      commission_rate_old: rates.old,
      commission_rate_course: rates.course,
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    nickname: data.nickname || "",
    phone: data.phone || "",
    branchId: data.branch_id,
    role: data.role,
    pin: data.pin,
    active: data.active,
    commissionRates: {
      new: parseFloat(data.commission_rate_new || 0),
      old: parseFloat(data.commission_rate_old || 0),
      course: parseFloat(data.commission_rate_course || 0),
    },
  };
}

export async function updateStaff(id, staff) {
  const rates = staff.commissionRates || { new: 0, old: 0, course: 0 };
  const { data, error } = await supabase
    .from("staff")
    .update({
      name: staff.name,
      nickname: staff.nickname,
      phone: staff.phone,
      branch_id: staff.branchId,
      role: staff.role,
      pin: staff.pin,
      active: staff.active,
      commission_rate_new: rates.new,
      commission_rate_old: rates.old,
      commission_rate_course: rates.course,
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    nickname: data.nickname || "",
    phone: data.phone || "",
    branchId: data.branch_id,
    role: data.role,
    pin: data.pin,
    active: data.active,
    commissionRates: {
      new: parseFloat(data.commission_rate_new || 0),
      old: parseFloat(data.commission_rate_old || 0),
      course: parseFloat(data.commission_rate_course || 0),
    },
  };
}

export async function deleteStaff(id) {
  const { error } = await supabase
    .from("staff")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// QUEUES
// ═══════════════════════════════════════════════════════════

export function mapQueueRow(q) {
  return {
    id: q.id,
    name: q.name,
    phone: q.phone,
    branchId: q.branch_id,
    procedureId: q.procedure_id,
    promoId: q.promo_id,
    price: q.price ? parseFloat(q.price) : "",
    note: q.note || "",
    customerType: q.customer_type,
    date: q.date,
    timeBlock: q.time_block,
    durationBlocks: q.duration_blocks ?? null,
    roomId: q.room_id,
    status: q.status,
    statusNote: q.status_note || "",
    recordedBy: q.recorded_by,
    createdAt: q.created_at,
    statusUpdatedAt: q.status_updated_at,
  };
}

export async function fetchQueues(opts = {}) {
  // sinceDate: "YYYY-MM-DD" — โหลดเฉพาะคิวที่ date >= sinceDate (Phase 2a: 30 วันล่าสุด)
  // allowPartial: ถ้า true และบางส่วนล้ม จะคืนของที่ได้ + แจ้ง onResult({ complete:false })
  //               แทนที่จะ throw ทั้งชุด (Phase 2b: ประวัติทั้งหมดใน background)
  // onResult({ complete, errors, rowCount }): callback รายงานความครบถ้วน — ถูกเรียกทุก path
  const { sinceDate = null, allowPartial = false, onResult = null } = opts;
  const report = (r) => { if (typeof onResult === "function") onResult(r); };

  let rows;
  let complete = true;
  let errors = [];

  if (sinceDate) {
    // ─── Phase 2a: กรองตามวันที่ → ใช้ index date เดิม (ไม่เคย timeout; keyset-by-id ทำช้าลง 5 เท่า) ───
    // เพิ่ม tiebreaker id ให้ลำดับคงที่ข้ามหน้า (เดิมไม่มี → OFFSET ทำแถวซ้ำ/หายได้)
    const PAGE_SIZE = 1000;
    const { count, error: countError } = await supabase
      .from("queues").select("*", { count: "exact", head: true }).gte("date", sinceDate);
    if (countError) throw countError;
    if (!count) { report({ complete: true, errors: [], rowCount: 0 }); return []; }
    const numPages = Math.ceil(count / PAGE_SIZE);
    const results = await Promise.all(Array.from({ length: numPages }, (_, i) =>
      supabase.from("queues").select("*").gte("date", sinceDate)
        .order("date", { ascending: false })
        .order("time_block", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    ));
    // แต่ละหน้าเป็นคนละ snapshot — ถ้ามีคน INSERT ระหว่างยิง แถวอาจเลื่อนไปโผล่ 2 หน้า → dedupe ด้วย id
    // (keyset ใน Phase 2b ไม่มีปัญหานี้เพราะช่วง id ไม่ทับกัน)
    const byId = new Map();
    for (const { data, error } of results) {
      if (error) throw error;
      if (data) for (const r of data) byId.set(r.id, r);
    }
    rows = Array.from(byId.values());
  } else {
    // ─── Phase 2b: ทั้งตาราง → keyset บน id แบ่ง 4 ช่วงเดินขนาน (ดู queueHistoryPagination.js) ───
    // count(*) ไว้เทียบว่าได้ครบจริง (กัน server ตัดหน้าสั้นกว่า pageSize แล้วเข้าใจผิดว่าหมด)
    // ถ้า count เองล้ม (เช่น timeout) อย่าทิ้งทั้ง phase — โหลดต่อแบบ "ยืนยันความครบไม่ได้" ดีกว่าได้ศูนย์
    const { count, error: countError } = await supabase
      .from("queues").select("*", { count: "exact", head: true });
    if (countError) console.error("fetchQueues: count(*) failed, completeness unverified:", countError);
    const fetchPage = async (afterId, upperInclusive) => {
      const { data, error } = await supabase.from("queues").select("*")
        .gt("id", afterId).lte("id", upperInclusive)
        .order("id", { ascending: true }).limit(HISTORY_PAGE_SIZE);
      if (error) throw error;
      return data || [];
    };
    ({ rows, complete, errors } = await fetchAllByUuidRanges(fetchPage, { expectedCount: countError ? null : (count ?? null) }));
    if (!complete && !allowPartial) {
      report({ complete, errors, rowCount: rows.length });
      throw errors[0];
    }
  }

  report({ complete, errors, rowCount: rows.length });

  const mapped = rows.map(mapQueueRow);
  // เรียงให้คงที่และตรงกับที่ผู้ใช้/Export คาดหวัง (ใหม่สุดก่อน) — บาง consumer เช่น exportService
  // ไม่ sort เอง จึงต้องรับประกันลำดับตรงนี้ ไม่พึ่งลำดับจาก DB
  // date เป็น "YYYY-MM-DD" และ id เป็น uuid ตัวพิมพ์เล็ก → เทียบ < > ตรง ๆ ได้ผลเท่า localeCompare
  // แต่เร็วกว่า ~3.5 เท่า (146k แถว: ~85ms vs ~295ms บน main thread)
  mapped.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = a.timeBlock ?? 1e9, tb = b.timeBlock ?? 1e9;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return mapped;
}

export async function createQueue(queue) {
  const { data, error } = await supabase
    .from("queues")
    .insert([{
      name: queue.name,
      phone: queue.phone,
      branch_id: queue.branchId || null,
      procedure_id: queue.procedureId || null,
      promo_id: queue.promoId || null,
      price: queue.price || null,
      note: queue.note,
      customer_type: queue.customerType,
      date: queue.date,
      time_block: queue.timeBlock,
      duration_blocks: queue.durationBlocks ?? null,
      room_id: queue.roomId || null,
      status: queue.status,
      status_note: queue.statusNote,
      recorded_by: queue.recordedBy || null,
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    branchId: data.branch_id,
    procedureId: data.procedure_id,
    promoId: data.promo_id,
    price: data.price ? parseFloat(data.price) : "",
    note: data.note || "",
    customerType: data.customer_type,
    date: data.date,
    timeBlock: data.time_block,
    durationBlocks: data.duration_blocks ?? null,
    roomId: data.room_id,
    status: data.status,
    statusNote: data.status_note || "",
    recordedBy: data.recorded_by,
    createdAt: data.created_at,
    statusUpdatedAt: data.status_updated_at,
  };
}

export async function updateQueue(id, queue) {
  const { data, error } = await supabase
    .from("queues")
    .update({
      name: queue.name,
      phone: queue.phone,
      branch_id: queue.branchId || null,
      procedure_id: queue.procedureId || null,
      promo_id: queue.promoId || null,
      price: queue.price || null,
      note: queue.note,
      customer_type: queue.customerType,
      date: queue.date,
      time_block: queue.timeBlock,
      duration_blocks: queue.durationBlocks ?? null,
      room_id: queue.roomId || null,
      status: queue.status,
      status_note: queue.statusNote,
      status_updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    branchId: data.branch_id,
    procedureId: data.procedure_id,
    promoId: data.promo_id,
    price: data.price ? parseFloat(data.price) : "",
    note: data.note || "",
    customerType: data.customer_type,
    date: data.date,
    timeBlock: data.time_block,
    durationBlocks: data.duration_blocks ?? null,
    roomId: data.room_id,
    status: data.status,
    statusNote: data.status_note || "",
    recordedBy: data.recorded_by,
    createdAt: data.created_at,
    statusUpdatedAt: data.status_updated_at,
  };
}

// Used only by the status modal. Do not replace this with updateQueue(): that
// function is for complete booking edits and writes every booking column.
export async function updateQueueStatus(id, statusUpdate) {
  const { data, error } = await supabase
    .from("queues")
    .update(buildQueueStatusUpdate(statusUpdate))
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return mapQueueRow(data);
}

export async function deleteQueue(id) {
  const { error } = await supabase
    .from("queues")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// TICKETS
// ═══════════════════════════════════════════════════════════

export async function fetchTickets() {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    branchId: t.branch_id,
    reportedBy: t.reported_by,
    assignedTo: t.assigned_to,
    imageUrls: t.image_urls || [],
    adminNotes: t.admin_notes || "",
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    resolvedAt: t.resolved_at,
  }));
}

export async function createTicketDB(ticket) {
  const { data, error } = await supabase
    .from("tickets")
    .insert([{
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: "open",
      branch_id: ticket.branchId || null,
      reported_by: ticket.reportedBy || null,
      image_urls: ticket.imageUrls || [],
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    category: data.category,
    priority: data.priority,
    status: data.status,
    branchId: data.branch_id,
    reportedBy: data.reported_by,
    assignedTo: data.assigned_to,
    imageUrls: data.image_urls || [],
    adminNotes: data.admin_notes || "",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    resolvedAt: data.resolved_at,
  };
}

export async function updateTicketDB(id, updates) {
  const updateData = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.adminNotes !== undefined) updateData.admin_notes = updates.adminNotes;
  if (updates.assignedTo !== undefined) updateData.assigned_to = updates.assignedTo;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  updateData.updated_at = new Date().toISOString();
  if (updates.status === "resolved" || updates.status === "closed") {
    updateData.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("tickets")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    category: data.category,
    priority: data.priority,
    status: data.status,
    branchId: data.branch_id,
    reportedBy: data.reported_by,
    assignedTo: data.assigned_to,
    imageUrls: data.image_urls || [],
    adminNotes: data.admin_notes || "",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    resolvedAt: data.resolved_at,
  };
}

export async function deleteTicketDB(id) {
  const { error } = await supabase
    .from("tickets")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// ALIAS FUNCTIONS FOR COMPATIBILITY
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// PROCEDURE CATEGORIES
// ═══════════════════════════════════════════════════════════

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("procedure_categories")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(c => c.name);
}

export async function createCategory(name) {
  const { data, error } = await supabase
    .from("procedure_categories")
    .insert([{ name }])
    .select()
    .single();
  
  if (error) throw error;
  return data.name;
}

export async function deleteCategory(name) {
  const { error } = await supabase
    .from("procedure_categories")
    .delete()
    .eq("name", name);
  
  if (error) throw error;
}

export const getAllBranches = fetchBranches;
export const getAllProcedures = fetchProcedures;
export const getAllPromos = fetchPromos;
export const getAllRooms = fetchRooms;
export const getAllRoomSchedules = fetchRoomSchedules;
export const getAllStaff = fetchStaff;
export const getAllQueues = fetchQueues;

// ─── ดึงคิวเฉพาะห้อง+วัน (สำหรับเช็ค conflict จาก DB สด ก่อน save) ───
// query เล็กมาก (ห้องเดียว วันเดียว) เร็ว ไม่กระทบ performance
export async function fetchQueuesForRoomDate(roomId, date) {
  if (!roomId || !date) return [];
  const { data, error } = await supabase
    .from("queues")
    .select("*")
    .eq("room_id", roomId)
    .eq("date", date)
    .not("status", "in", "(cancelled,no_show,rescheduled)");
  if (error) throw error;
  return (data || []).map(mapQueueRow);
}
export const getAllCategories = fetchCategories;

// ═══════════════════════════════════════════════════════════
// ACTIVITY LOGS
// ═══════════════════════════════════════════════════════════

export async function createActivityLog(log) {
  const { error } = await supabase
    .from("activity_logs")
    .insert([{
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      detail: log.detail,
      performed_by: log.performedBy || null,
      performed_by_name: log.performedByName || null,
    }]);
  if (error) console.error("activity log error:", error);
}

export async function fetchActivityLogs({ limit = 100, date = null } = {}) {
  let query = supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (date) {
    // filter created_at within the selected local day (browser timezone)
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    detail: r.detail,
    performedBy: r.performed_by,
    performedByName: r.performed_by_name,
    createdAt: r.created_at,
  }));
}

// ═══════════════════════════════════════════════════════════
// HN CUSTOMERS (Pro Clinic lookup)
// ═══════════════════════════════════════════════════════════

export async function fetchAllHnCustomers() {
  const PAGE_SIZE = 1000;
  const { count, error: countError } = await supabase
    .from("hn_customers")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;
  if (!count || count === 0) return [];

  const numPages = Math.ceil(count / PAGE_SIZE);
  const promises = [];
  for (let i = 0; i < numPages; i++) {
    promises.push(
      supabase
        .from("hn_customers")
        .select("*")
        .order("hn_id", { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    );
  }
  const results = await Promise.all(promises);
  const allData = [];
  for (const { data, error } of results) {
    if (error) throw error;
    if (data) allData.push(...data);
  }
  return allData;
}

export async function searchHnCustomers(query) {
  // HN data must only travel through an authenticated server function.
  return lookupHnCustomers({
    query,
    requestedFunction: import.meta.env.VITE_HN_LOOKUP_FUNCTION || "search-hn",
    token: getServerSessionToken(),
    invoke: (name, options) => supabase.functions.invoke(name, options),
  });
}
