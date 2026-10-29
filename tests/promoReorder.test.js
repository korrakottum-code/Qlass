import assert from "node:assert/strict";
import test from "node:test";
import { planPromoReorder } from "../src/utils/promoReorder.js";

const promos = [
  { id: "a1", procedureId: "a", sortOrder: 0 },
  { id: "b1", procedureId: "b", sortOrder: 1 },
  { id: "a2", procedureId: "a", sortOrder: 2 },
  { id: "b2", procedureId: "b", sortOrder: 3 },
  { id: "a3", procedureId: "a", sortOrder: 4 },
];

test("filtered reorder swaps adjacent visible promos, not a hidden procedure", () => {
  const plan = planPromoReorder(promos, "a2", "up", "a");

  assert.deepEqual(plan.nextPromos.map((promo) => promo.id), ["a2", "b1", "a1", "b2", "a3"]);
  assert.deepEqual(
    plan.nextPromos.filter((promo) => promo.procedureId === "a").map((promo) => promo.id),
    ["a2", "a1", "a3"],
  );
  assert.deepEqual(plan.changes.map((change) => change.id).sort(), ["a1", "a2"]);
});

test("reorder normalizes duplicate legacy sort orders before saving", () => {
  const legacy = promos.map((promo) => ({ ...promo, sortOrder: 0 }));
  const plan = planPromoReorder(legacy, "a2", "down", "a");

  assert.deepEqual(plan.nextPromos.map((promo) => promo.sortOrder), [0, 1, 2, 3, 4]);
  assert.deepEqual(
    plan.nextPromos.filter((promo) => promo.procedureId === "a").map((promo) => promo.id),
    ["a1", "a3", "a2"],
  );
});

test("does not create a plan when moving beyond the visible list boundary", () => {
  assert.equal(planPromoReorder(promos, "a1", "up", "a"), null);
  assert.equal(planPromoReorder(promos, "a3", "down", "a"), null);
});
