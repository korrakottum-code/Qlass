export function canViewAllBranchesForRoles(user, roles) {
  if (!user) return false;
  return roles.find((role) => role.value === user.role)?.branchScope === "all";
}

export function filterItemsByBranch(items, user, branchIdField, roles) {
  if (!user) return [];
  if (canViewAllBranchesForRoles(user, roles)) return items;
  return items.filter((item) => item[branchIdField] === user.branchId);
}
