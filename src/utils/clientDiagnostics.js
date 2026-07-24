/* global __QLASS_RELEASE__ */

const MAX_EVENTS = 50;
const EVENT_NAMES = new Set([
  "client_error",
  "initial_load",
  "realtime_status",
  "render_error",
  "write_outcome",
]);
const OUTCOMES = new Set(["started", "succeeded", "failed"]);
const LOAD_STAGES = new Set(["staff", "core", "history"]);
const REALTIME_STATUSES = new Set(["SUBSCRIBED", "TIMED_OUT", "CLOSED", "CHANNEL_ERROR"]);

// Vite replaces this at build time. It is intentionally non-sensitive and has
// no dependency on runtime configuration or user/session data.
export const clientRelease = typeof __QLASS_RELEASE__ === "string" ? __QLASS_RELEASE__ : "local";

let events = [];

function errorKind(error) {
  const name = typeof error?.name === "string" ? error.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name) ? name : "UnknownError";
}

function duration(durationMs) {
  return Number.isFinite(durationMs) ? Math.max(0, Math.min(Math.round(durationMs), 600_000)) : undefined;
}

function safeDetails(name, details = {}) {
  const safe = {};
  if (details.error) safe.errorKind = errorKind(details.error);
  if (OUTCOMES.has(details.outcome)) safe.outcome = details.outcome;
  if (LOAD_STAGES.has(details.stage)) safe.stage = details.stage;
  if (REALTIME_STATUSES.has(details.status)) safe.status = details.status;
  const durationMs = duration(details.durationMs);
  if (durationMs !== undefined) safe.durationMs = durationMs;
  return safe;
}

export function recordClientDiagnostic(name, details) {
  if (!EVENT_NAMES.has(name)) return null;
  const event = {
    name,
    release: clientRelease,
    at: new Date().toISOString(),
    ...safeDetails(name, details),
  };
  events = [...events.slice(-(MAX_EVENTS - 1)), event];
  return event;
}

export function getClientDiagnostics() {
  return events.map((event) => ({ ...event }));
}

// Remove only events that were accepted by the server. A failed network call
// leaves the local bounded buffer intact for a later retry.
export function discardClientDiagnostics(count) {
  if (!Number.isInteger(count) || count <= 0) return;
  events = events.slice(Math.min(count, events.length));
}

export function resetClientDiagnosticsForTest() {
  events = [];
}

export function installBrowserDiagnostics() {
  if (typeof window === "undefined") return () => {};

  const onError = (event) => recordClientDiagnostic("client_error", { error: event.error });
  const onUnhandledRejection = (event) => recordClientDiagnostic("client_error", { error: event.reason });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  // This is a local, bounded inspection buffer. It is never sent to Supabase,
  // localStorage, analytics, or a third party.
  window.__qlassDiagnostics = getClientDiagnostics;
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    delete window.__qlassDiagnostics;
  };
}
