import { supabase } from "./supabaseClient";
import { createSessionApi } from "./sessionApi";

export const useServerSession = import.meta.env.VITE_USE_SERVER_SESSION === "true";

export function getServerSessionToken() {
  try {
    return localStorage.getItem("qlass_session") || "";
  } catch {
    return "";
  }
}

const sessionApi = createSessionApi((name, options) => supabase.functions.invoke(name, options));
export const { fetchLoginDirectory, fetchAuthenticatedStaff, loginWithPin, createQueueV1, restoreServerSession, revokeServerSession } = sessionApi;
