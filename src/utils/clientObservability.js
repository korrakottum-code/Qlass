import { clientRelease, discardClientDiagnostics, getClientDiagnostics } from "./clientDiagnostics";

export const serverDiagnosticsEnabled = import.meta.env.VITE_ENABLE_SERVER_DIAGNOSTICS === "true";
export const controlledRefreshEnabled = import.meta.env.VITE_ENABLE_CONTROLLED_REFRESH === "true";

export async function flushClientDiagnostics(api, token) {
  if (!serverDiagnosticsEnabled || !token) return { attempted: false, accepted: 0 };
  const events = getClientDiagnostics();
  if (events.length === 0) return { attempted: false, accepted: 0 };

  const result = await api.flushClientDiagnostics(token, events);
  discardClientDiagnostics(events.length);
  return { attempted: true, accepted: Number(result.accepted ?? 0) };
}

export async function getControlledRefreshStatus(api, token) {
  if (!controlledRefreshEnabled || !token) return { refreshRequired: false };
  return api.getReleaseStatus(token, clientRelease);
}
