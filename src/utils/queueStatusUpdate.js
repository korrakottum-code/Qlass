// Payload for the status modal only. Keep this allowlist intentionally small:
// a status transition must never overwrite booking details.
export function buildQueueStatusUpdate(payload, statusUpdatedAt = new Date().toISOString()) {
  return {
    status: payload.status,
    status_note: payload.statusNote || "",
    status_updated_at: statusUpdatedAt,
  };
}
