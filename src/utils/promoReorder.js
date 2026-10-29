/**
 * Builds a persisted ordering change for promotions.
 *
 * When a procedure filter is active, only promotions in that procedure are
 * considered neighbours.  The resulting sort orders remain global, so the
 * ordering is still consistent for every other screen that consumes promos.
 */
export function planPromoReorder(promos, promoId, direction, procedureId = "all") {
  const scopedPromos = procedureId === "all"
    ? promos
    : promos.filter((promo) => promo.procedureId === procedureId);
  const currentIndex = scopedPromos.findIndex((promo) => promo.id === promoId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= scopedPromos.length) return null;

  const targetId = scopedPromos[targetIndex].id;
  const currentGlobalIndex = promos.findIndex((promo) => promo.id === promoId);
  const targetGlobalIndex = promos.findIndex((promo) => promo.id === targetId);
  if (currentGlobalIndex < 0 || targetGlobalIndex < 0) return null;

  // Normalize once so legacy rows with duplicate/default sort orders can be
  // reordered deterministically. The current array is already server-sorted.
  const nextPromos = promos.map((promo, index) => ({ ...promo, sortOrder: index }));
  [nextPromos[currentGlobalIndex].sortOrder, nextPromos[targetGlobalIndex].sortOrder] = [
    nextPromos[targetGlobalIndex].sortOrder,
    nextPromos[currentGlobalIndex].sortOrder,
  ];
  nextPromos.sort((a, b) => a.sortOrder - b.sortOrder);

  const originalById = new Map(promos.map((promo) => [promo.id, promo]));
  const changes = nextPromos
    .filter((promo) => originalById.get(promo.id).sortOrder !== promo.sortOrder)
    .map((promo) => ({
      id: promo.id,
      sortOrder: promo.sortOrder,
      previousSortOrder: originalById.get(promo.id).sortOrder,
    }));

  return { nextPromos, changes };
}
