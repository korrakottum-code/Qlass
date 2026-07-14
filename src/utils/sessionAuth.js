import { supabase } from "./supabaseClient";

export const useServerSession = import.meta.env.VITE_USE_SERVER_SESSION === "true";

export function getServerSessionToken() {
  try {
    return localStorage.getItem("qlass_session") || "";
  } catch {
    return "";
  }
}

async function callSessionFunction(body) {
  const { data, error } = await supabase.functions.invoke("staff-session", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchLoginDirectory() {
  const data = await callSessionFunction({ action: "directory" });
  return data.staff || [];
}

export async function fetchAuthenticatedStaff(token) {
  const data = await callSessionFunction({ action: "staff-details", token });
  return data.staff || [];
}

export async function loginWithPin(staffId, pin) {
  return callSessionFunction({ action: "login", staffId, pin });
}

export async function restoreServerSession(token) {
  return callSessionFunction({ action: "session", token });
}

export async function revokeServerSession(token) {
  if (!token) return;
  try {
    await callSessionFunction({ action: "logout", token });
  } catch {
    // A failed revoke must not prevent the local logout path.
  }
}
