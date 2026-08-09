export function createSessionApi(invoke) {
  async function callSessionFunction(body) {
    const { data, error } = await invoke("staff-session", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  return {
    async fetchLoginDirectory() {
      const data = await callSessionFunction({ action: "directory" });
      return data.staff || [];
    },
    async fetchAuthenticatedStaff(token) {
      const data = await callSessionFunction({ action: "staff-details", token });
      return data.staff || [];
    },
    loginWithPin(staffId, pin) {
      return callSessionFunction({ action: "login", staffId, pin });
    },
    createQueueV1(token, requestId, queue) {
      return callSessionFunction({ action: "create_queue_v1", token, requestId, queue });
    },
    async createStaffServer(token, staff) {
      const data = await callSessionFunction({ action: "staff_create", token, staff });
      return data.staff;
    },
    async updateStaffServer(token, staffId, staff) {
      const data = await callSessionFunction({ action: "staff_update", token, staffId, staff });
      return data.staff;
    },
    async deleteStaffServer(token, staffId) {
      await callSessionFunction({ action: "staff_delete", token, staffId });
    },
    flushClientDiagnostics(token, events) {
      return callSessionFunction({ action: "client_diagnostics", token, events });
    },
    getReleaseStatus(token, release) {
      return callSessionFunction({ action: "release_status", token, release });
    },
    restoreServerSession(token) {
      return callSessionFunction({ action: "session", token });
    },
    async revokeServerSession(token) {
      if (!token) return;
      try {
        await callSessionFunction({ action: "logout", token });
      } catch {
        // A failed revoke must not prevent the local logout path.
      }
    },
  };
}
