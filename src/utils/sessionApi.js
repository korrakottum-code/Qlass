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
