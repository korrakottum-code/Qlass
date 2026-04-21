import { supabase } from "./supabaseClient";

// ═══════════════════════════════════════════════════════════
// BRANCHES
// ═══════════════════════════════════════════════════════════

export async function fetchBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(b => ({ id: b.id, name: b.name }));
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
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(p => ({
    id: p.id,
    name: p.name,
    procedureId: p.procedure_id,
    price: parseFloat(p.price),
    active: p.active,
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
  };
}

export async function updatePromo(id, promo) {
  const { data, error } = await supabase
    .from("promos")
    .update({
      name: promo.name,
      procedure_id: promo.procedureId,
      price: promo.price,
      active: promo.active,
    })
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
  };
}

export async function updateRoom(id, room) {
  const { data, error } = await supabase
    .from("rooms")
    .update({
      name: room.name,
      branch_id: room.branchId,
      type: room.type,
      notes: room.notes,
      open_block: room.openBlock,
      close_block: room.closeBlock,
    })
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
// ROOM SCHEDULES
// ═══════════════════════════════════════════════════════════

export async function fetchRoomSchedules() {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("room_schedules")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const unique = Array.from(new Map(allData.map((s) => [s.id, s])).values());

  return unique.map(s => ({
    id: s.id,
    roomId: s.room_id,
    date: s.date || "",
    available: s.available,
    startBlock: s.start_block,
    endBlock: s.end_block,
    noteOnly: s.start_block === null && s.end_block === null && s.available === true,
    note: s.note || "",
  }));
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
    }])
    .select()
    .single();
  
  if (error) throw error;
  return {
    id: data.id,
    roomId: data.room_id,
    date: data.date || "",
    available: data.available,
    startBlock: data.start_block,
    endBlock: data.end_block,
    noteOnly: data.start_block === null && data.end_block === null && data.available === true,
    note: data.note || "",
  };
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
  return {
    id: data.id,
    roomId: data.room_id,
    date: data.date || "",
    available: data.available,
    startBlock: data.start_block,
    endBlock: data.end_block,
    noteOnly: data.start_block === null && data.end_block === null && data.available === true,
    note: data.note || "",
  };
}

export async function deleteRoomSchedule(id) {
  const { error } = await supabase
    .from("room_schedules")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
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

export async function fetchQueues() {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("queues")
      .select("*")
      .order("date", { ascending: false })
      .order("time_block", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const unique = Array.from(new Map(allData.map((q) => [q.id, q])).values());
  return unique.map(mapQueueRow);
}

export async function createQueue(queue) {
  const { data, error } = await supabase
    .from("queues")
    .insert([{
      name: queue.name,
      phone: queue.phone,
      branch_id: queue.branchId,
      procedure_id: queue.procedureId,
      promo_id: queue.promoId,
      price: queue.price || null,
      note: queue.note,
      customer_type: queue.customerType,
      date: queue.date,
      time_block: queue.timeBlock,
      duration_blocks: queue.durationBlocks ?? null,
      room_id: queue.roomId,
      status: queue.status,
      status_note: queue.statusNote,
      recorded_by: queue.recordedBy,
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
      branch_id: queue.branchId,
      procedure_id: queue.procedureId,
      promo_id: queue.promoId,
      price: queue.price || null,
      note: queue.note,
      customer_type: queue.customerType,
      date: queue.date,
      time_block: queue.timeBlock,
      duration_blocks: queue.durationBlocks ?? null,
      room_id: queue.roomId,
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

export async function fetchActivityLogs({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
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
// AI MEMORY (rules AI has learned across devices)
// ═══════════════════════════════════════════════════════════

export async function fetchAiMemory() {
  const { data, error } = await supabase
    .from("ai_memory")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchAiMemory:", error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    rule: r.rule,
    createdAt: r.created_at,
  }));
}

export async function createAiMemory(rule) {
  const { data, error } = await supabase
    .from("ai_memory")
    .insert([{ rule }])
    .select()
    .single();
  if (error) { console.error("createAiMemory:", error); throw error; }
  return { id: data.id, rule: data.rule, createdAt: data.created_at };
}

export async function deleteAiMemory(id) {
  const { error } = await supabase.from("ai_memory").delete().eq("id", id);
  if (error) { console.error("deleteAiMemory:", error); throw error; }
}

export async function deleteAllAiMemory() {
  const { error } = await supabase.from("ai_memory").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { console.error("deleteAllAiMemory:", error); throw error; }
}
