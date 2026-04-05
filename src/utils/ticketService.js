import { supabase } from "./supabaseClient";

// ═══════════════════════════════════════════════════════════
// TICKET CRUD OPERATIONS
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

export async function createTicket(ticket) {
  const { data, error } = await supabase
    .from("tickets")
    .insert([{
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: "open",
      branch_id: ticket.branchId,
      reported_by: ticket.reportedBy,
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

export async function updateTicket(id, ticket) {
  const updateData = {
    updated_at: new Date().toISOString(),
  };

  if (ticket.status !== undefined) updateData.status = ticket.status;
  if (ticket.priority !== undefined) updateData.priority = ticket.priority;
  if (ticket.assignedTo !== undefined) updateData.assigned_to = ticket.assignedTo;
  if (ticket.adminNotes !== undefined) updateData.admin_notes = ticket.adminNotes;
  
  if (ticket.status === "resolved" || ticket.status === "closed") {
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

export async function deleteTicket(id) {
  const { error } = await supabase
    .from("tickets")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// IMAGE UPLOAD TO SUPABASE STORAGE
// ═══════════════════════════════════════════════════════════

export async function uploadTicketImage(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `tickets/${fileName}`;

  const { data, error } = await supabase.storage
    .from("ticket-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from("ticket-images")
    .getPublicUrl(filePath);

  return publicUrl;
}

export async function deleteTicketImage(imageUrl) {
  const filePath = imageUrl.split("/ticket-images/")[1];
  if (!filePath) return;

  const { error } = await supabase.storage
    .from("ticket-images")
    .remove([`tickets/${filePath}`]);

  if (error) throw error;
}
