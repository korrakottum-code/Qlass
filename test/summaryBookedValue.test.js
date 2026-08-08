import test from "node:test";
import assert from "node:assert/strict";
import { buildPromoPriceIndex, queueBookedValue } from "../src/utils/promoValue.js";

const promos = [
  { id: "hutox", name: "hutox 990฿", price: 990 },
  { id: "consult", name: "ปรึกษา", price: 0 },
  { id: "stringy", name: "string price", price: "1490" },
];

test("promo price index maps id to numeric price", () => {
  const index = buildPromoPriceIndex(promos);
  assert.equal(index.hutox, 990);
  assert.equal(index.consult, 0);
  assert.equal(index.stringy, 1490);
  assert.deepEqual(buildPromoPriceIndex(undefined), {});
});

test("booked value prefers the recorded queue price", () => {
  const index = buildPromoPriceIndex(promos);
  // A manually adjusted price must win over the promo master price.
  assert.equal(queueBookedValue({ price: 890, promoId: "hutox" }, index), 890);
  assert.equal(queueBookedValue({ price: 1500 }, index), 1500);
});

test("booked value falls back to the promo price when the queue price is missing", () => {
  const index = buildPromoPriceIndex(promos);
  // mapQueueRow turns a missing/zero DB price into "" — the pre-Goal-9 status
  // bug wiped prices this way on most historical queues.
  assert.equal(queueBookedValue({ price: "", promoId: "hutox" }, index), 990);
  assert.equal(queueBookedValue({ price: null, promoId: "hutox" }, index), 990);
  assert.equal(queueBookedValue({ price: undefined, promoId: "hutox" }, index), 990);
  // No price and no promo → 0, never NaN.
  assert.equal(queueBookedValue({ price: "" }, index), 0);
  assert.equal(queueBookedValue({ price: "", promoId: "unknown" }, index), 0);
  assert.equal(queueBookedValue({ price: "", promoId: "consult" }, index), 0);
});

test("July-style wiped data sums to promo value, not near-zero", () => {
  const index = buildPromoPriceIndex(promos);
  // 95 queues kept their recorded price; 1,151 were wiped by the old bug.
  const kept = Array.from({ length: 95 }, () => ({ price: 990, promoId: "hutox" }));
  const wiped = Array.from({ length: 1151 }, () => ({ price: "", promoId: "hutox" }));
  const total = [...kept, ...wiped].reduce((s, q) => s + queueBookedValue(q, index), 0);
  assert.equal(total, 990 * 1246);
});
