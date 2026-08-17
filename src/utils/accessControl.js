export function canViewAllBranchesForRoles(user, roles) {
  if (!user) return false;
  return roles.find((role) => role.value === user.role)?.branchScope === "all";
}

export function filterItemsByBranch(items, user, branchIdField, roles) {
  if (!user) return [];
  if (canViewAllBranchesForRoles(user, roles)) return items;
  return items.filter((item) => item[branchIdField] === user.branchId);
}

// user มี role ระดับ minRole หรือสูงกว่าไหม
// อาศัยลำดับของ roles (constants.ROLES เรียง ceo → cashier = สูง → ต่ำ) index น้อย = สูงกว่า
// ถ้าหา role ไม่เจอฝั่งใดฝั่งหนึ่ง ตอบ false เสมอ — ไม่เดา
export function roleAtLeastForRoles(user, minRole, roles) {
  if (!user || !user.role || !minRole) return false;
  const userIdx = roles.findIndex((role) => role.value === user.role);
  const minIdx = roles.findIndex((role) => role.value === minRole);
  if (userIdx === -1 || minIdx === -1) return false;
  return userIdx <= minIdx;
}
