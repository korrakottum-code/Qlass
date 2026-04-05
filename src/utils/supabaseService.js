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
  const { data, error } = await supabase
    .from("room_schedules")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data.map(s => ({
    id: s.id,
    roomId: s.room_id,
    date: s.date || "",
    available: s.available,
    startBlock: s.start_block,
    endBlock: s.end_block,
    note: s.note || "",
  }));
}

export async function createRoomSchedule(schedule) {
  const { data, error } = await supabase
    .from("room_schedules")
    .insert([{
      room_id: schedule.roomId,
      date: schedule.date || null,
      available: schedule.available,
      start_block: schedule.startBlock,
      end_block: schedule.endBlock,
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
    note: data.note || "",
  };
}

export async function updateRoomSchedule(id, schedule) {
  const { data, error } = await supabase
    .from("room_schedules")
    .update({
      room_id: schedule.roomId,
      date: schedule.date || null,
      available: schedule.available,
      start_block: schedule.startBlock,
      end_block: schedule.endBlock,
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
      commission_rate_new: staff.commissionRates.new,
      commission_rate_old: staff.commissionRates.old,
      commission_rate_course: staff.commissionRates.course,
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
      commission_rate_new: staff.commissionRates.new,
      commission_rate_old: staff.commissionRates.old,
      commission_rate_course: staff.commissionRates.course,
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

export async function fetchQueues() {
  const { data, error } = await supabase
    .from("queues")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data.map(q => ({
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
    roomId: q.room_id,
    status: q.status,
    statusNote: q.status_note || "",
    recordedBy: q.recorded_by,
    createdAt: q.created_at,
    statusUpdatedAt: q.status_updated_at,
  }));
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
// ALIAS FUNCTIONS FOR COMPATIBILITY
// ═══════════════════════════════════════════════════════════

export const getAllBranches = fetchBranches;
export const getAllProcedures = fetchProcedures;
export const getAllPromos = fetchPromos;
export const getAllRooms = fetchRooms;
export const getAllRoomSchedules = fetchRoomSchedules;
export const getAllStaff = fetchStaff;
export const getAllQueues = fetchQueues;
