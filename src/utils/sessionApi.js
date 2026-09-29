// คำตอบที่ไม่ใช่ 2xx จาก Edge Function มาถึงฝั่งเรียกเป็น FunctionsHttpError ซึ่ง message
// เป็นข้อความกลาง ๆ ว่า "non-2xx status code" ไม่ใช่รหัสเหตุผลที่เซิร์ฟเวอร์ส่งมา ตัวรหัสจริง
// อยู่ใน body ที่อ่านได้จาก error.context — ถ้าไม่ขุดออกมา หน้าจอจะขึ้นข้อความกลาง ๆ แทนเหตุผลจริง
// (แพทเทิร์นเดียวกับ extractQueueCreateErrorCode ใน queueCreateGate.js)
export async function serverErrorCode(error) {
  const res = error?.context;
  if (!res || typeof res.json !== "function") return null;
  try {
    const body = typeof res.clone === "function" ? await res.clone().json() : await res.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

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
    async createBranchServer(token, branch) {
      const data = await callSessionFunction({ action: "branch_create", token, branch });
      return data.branch;
    },
    async updateBranchServer(token, branchId, branch) {
      const data = await callSessionFunction({ action: "branch_update", token, branchId, branch });
      return data.branch;
    },
    async deleteBranchServer(token, branchId) {
      await callSessionFunction({ action: "branch_delete", token, branchId });
    },
    // คูปอง: ทุกการอ่าน/เขียนผ่าน staff-session (ตารางปิดจากคีย์หน้าเว็บ) — คืน { coupon } หรือ { total, coupons }
    async lookupCoupon(token, code) {
      return (await callSessionFunction({ action: "coupon_lookup", token, code })).coupon;
    },
    listCoupons(token, { search = "", status = "all", limit = 50, offset = 0 } = {}) {
      return callSessionFunction({ action: "coupon_list", token, search, status, limit, offset });
    },
    listCouponBatches(token, { limit = 100, offset = 0 } = {}) {
      return callSessionFunction({ action: "coupon_batches", token, limit, offset });
    },
    async redeemCoupon(token, { code, branchId, note }) {
      return (await callSessionFunction({ action: "coupon_redeem", token, code, branchId, note })).coupon;
    },
    async revertCouponRedemption(token, redemptionId) {
      return (await callSessionFunction({ action: "coupon_revert", token, redemptionId })).coupon;
    },
    async cancelCoupon(token, code, cancel = true) {
      return (await callSessionFunction({ action: "coupon_cancel", token, code, cancel })).coupon;
    },
    async fetchCouponCounters(token) {
      return (await callSessionFunction({ action: "coupon_counters", token })).counters || {};
    },
    generateCoupons(token, batch) {
      return callSessionFunction({ action: "coupon_generate", token, batch });
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
