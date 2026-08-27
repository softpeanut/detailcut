import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { slugify, scaledHeight, chooseQuietCut, verifyCuts, outputPath, crc32, zipStore } = require("./core.js");

test("slugify keeps Korean letters and makes a safe fallback", () => {
  assert.equal(slugify("여름 셔츠 / 상세"), "여름-셔츠-상세");
  assert.equal(slugify("***"), "detail-page");
});

test("scaledHeight preserves aspect ratio with deterministic rounding", () => {
  assert.equal(scaledHeight(1720, 10000, 860), 5000);
  assert.throws(() => scaledHeight(0, 100, 860), RangeError);
});

test("quiet cut favors a clear seam but penalizes needlessly early cuts", () => {
  assert.equal(chooseQuietCut([0.6, 0.4, 0.01, 0.3, 0.2], 96, 100), 98);
  assert.equal(chooseQuietCut([0.1, 0.1, 0.1], 8, 10), 10);
});

test("cut verifier rejects gaps, overlaps, and incomplete plans", () => {
  assert.equal(verifyCuts([{ start: 0, end: 50 }, { start: 50, end: 81 }], 81), true);
  assert.equal(verifyCuts([{ start: 0, end: 50 }, { start: 49, end: 81 }], 81), false);
  assert.equal(verifyCuts([{ start: 0, end: 50 }, { start: 51, end: 81 }], 81), false);
  assert.equal(verifyCuts([{ start: 0, end: 80 }], 81), false);
});

test("numbered paths sort in output order", () => {
  assert.equal(outputPath("상품 A", 0), "상품-a-01.jpg");
  assert.equal(outputPath("상품 A", 11), "상품-a-12.jpg");
});

test("CRC-32 and ZIP store produce a readable archive skeleton", () => {
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(crc32(bytes), 0xcbf43926);
  const zip = zipStore([{ name: "테스트/상세-01.jpg", data: bytes }]);
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(zip.buffer).getUint32(zip.length - 22, true), 0x06054b50);
  assert.throws(() => zipStore([]), RangeError);
});
