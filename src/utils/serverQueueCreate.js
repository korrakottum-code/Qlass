// Goal 13 client cutover flag. Disabled by default; enabling requires BOTH
// VITE_USE_SERVER_QUEUE_CREATE="true" AND the operator's staff ID present in
// VITE_SERVER_QUEUE_CREATE_STAFF_IDS (comma-separated). See
// docs/GOAL_13_PRODUCTION_CANARY_RUNBOOK.md steps 7-8.
import { createQueueV1, getServerSessionToken } from "./sessionAuth";
import { mapQueueRow } from "./supabaseService";
import {
  buildServerQueuePayload,
  parseStaffAllowlist,
  shouldUseServerQueueCreate as gateServerQueueCreate,
} from "./queueCreateGate";

export const serverQueueCreateEnabled = import.meta.env.VITE_USE_SERVER_QUEUE_CREATE === "true";

const serverQueueCreateAllowlist = parseStaffAllowlist(import.meta.env.VITE_SERVER_QUEUE_CREATE_STAFF_IDS);

export function shouldUseServerQueueCreate(user, form) {
  return gateServerQueueCreate({
    enabled: serverQueueCreateEnabled,
    allowlist: serverQueueCreateAllowlist,
    user,
    form,
  });
}

export async function createQueueOnServer({ requestId, form }) {
  const data = await createQueueV1(getServerSessionToken(), requestId, buildServerQueuePayload(form));
  return mapQueueRow(data.queue);
}
