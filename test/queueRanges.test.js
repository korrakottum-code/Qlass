import test from "node:test";
import assert from "node:assert/strict";
import { addDays, mergeRanges, findUncoveredRanges } from "../src/utils/queueRanges.js";

test("addDays crosses month/year boundaries", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("mergeRanges joins overlapping and adjacent ranges, keeps disjoint ones", () => {
  assert.deepEqual(
    mergeRanges([{ from: "2026-08-01", to: "2026-08-10" }, { from: "2026-08-11", to: "2026-08-20" }]),
    [{ from: "2026-08-01", to: "2026-08-20" }], "adjacent (1 day apart) merge"
  );
  assert.deepEqual(
    mergeRanges([{ from: "2026-08-05", to: "2026-08-15" }, { from: "2026-08-01", to: "2026-08-10" }]),
    [{ from: "2026-08-01", to: "2026-08-15" }], "overlapping, unsorted input"
  );
  assert.deepEqual(
    mergeRanges([{ from: "2026-08-01", to: "2026-08-10" }, { from: "2026-08-12", to: "2026-08-20" }]),
    [{ from: "2026-08-01", to: "2026-08-10" }, { from: "2026-08-12", to: "2026-08-20" }], "gap of 1 full day stays split"
  );
  assert.deepEqual(mergeRanges([{ from: "2026-08-10", to: "2026-08-01" }]), [], "invalid range dropped");
});

test("findUncoveredRanges: fully covered → []", () => {
  const loaded = [{ from: "2026-07-19", to: "2026-08-18" }];
  assert.deepEqual(findUncoveredRanges(loaded, "2026-08-01", "2026-08-18"), []);
  assert.deepEqual(findUncoveredRanges(loaded, "2026-07-19", "2026-08-18"), []);
});

test("findUncoveredRanges: gap before loaded window (the 'last month' case)", () => {
  const loaded = [{ from: "2026-07-19", to: "2026-08-18" }];
  assert.deepEqual(findUncoveredRanges(loaded, "2026-07-01", "2026-07-31"), [{ from: "2026-07-01", to: "2026-07-18" }]);
});

test("findUncoveredRanges: gap spanning both sides and between two loaded blocks", () => {
  const loaded = [{ from: "2026-07-01", to: "2026-07-10" }, { from: "2026-07-20", to: "2026-07-31" }];
  assert.deepEqual(
    findUncoveredRanges(loaded, "2026-06-25", "2026-08-05"),
    [{ from: "2026-06-25", to: "2026-06-30" }, { from: "2026-07-11", to: "2026-07-19" }, { from: "2026-08-01", to: "2026-08-05" }]
  );
});

test("findUncoveredRanges: nothing loaded → whole range is a gap; invalid input → []", () => {
  assert.deepEqual(findUncoveredRanges([], "2026-08-01", "2026-08-03"), [{ from: "2026-08-01", to: "2026-08-03" }]);
  assert.deepEqual(findUncoveredRanges([], "2026-08-03", "2026-08-01"), []);
  assert.deepEqual(findUncoveredRanges([], "", "2026-08-01"), []);
});

test("findUncoveredRanges: loaded ที่ขอบบนเป็น 9999-12-31 (คิวล่วงหน้าไม่จำกัด) ต้องไม่รายงานช่องว่างซ้ำ", () => {
  const loaded = [{ from: "2026-07-19", to: "9999-12-31" }];
  assert.deepEqual(findUncoveredRanges(loaded, "2026-08-18", "2026-08-18"), []);
  assert.deepEqual(findUncoveredRanges(loaded, "2027-01-05", "2027-01-05"), []);
  assert.deepEqual(findUncoveredRanges(loaded, "2026-07-01", "2026-07-31"), [{ from: "2026-07-01", to: "2026-07-18" }]);
  assert.deepEqual(findUncoveredRanges([{ from: "0000-01-01", to: "9999-12-31" }], "2020-01-01", "2020-01-31"), []);
});
