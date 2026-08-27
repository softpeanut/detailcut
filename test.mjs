import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

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

test("Korean landing page exposes the exact use case to searchers", () => {
  const html = readFileSync("index.html", "utf8");
  const sitemap = readFileSync("sitemap.xml", "utf8");
  assert.match(html, /<title>상세페이지 이미지 자르기·자동 분할 무료 — DetailCut<\/title>/);
  assert.match(html, /글자와 상품 경계가 적은 지점에서 자동 분할/);
  assert.match(html, /"featureList"/);
  assert.match(sitemap, /<lastmod>2026-08-27<\/lastmod>/);
});

test("Pro order flow states payment and private delivery boundaries", () => {
  const korean = readFileSync("index.html", "utf8");
  const english = readFileSync("en.html", "utf8");
  const issueTemplate = readFileSync(".github/ISSUE_TEMPLATE/pro-interest.yml", "utf8");
  assert.match(korean, />Pro 주문 요청<\/a>/);
  assert.match(korean, /개인 15,000 · 팀 100,000 sats/);
  assert.match(korean, /기명 사용자 최대 10명/);
  assert.match(korean, /구매자 전용 비공개 GitHub 저장소/);
  assert.match(korean, /결제 확인 전에는 파일을 전달하지 않습니다/);
  assert.match(english, />Start a Pro order<\/a>/);
  assert.match(english, /Personal 15,000 · Team 100,000 sats/);
  assert.match(english, /up to 10 named users in one legal organization/);
  assert.match(english, /buyer-only private GitHub repository/);
  assert.match(english, /Do not pay before receiving and accepting the issue-bound invoice/);
  assert.match(issueTemplate, /id: order-intent/);
  assert.match(issueTemplate, /id: license-tier/);
  assert.match(issueTemplate, /100,000 sats/);
  assert.match(issueTemplate, /issue-bound, single-use Lightning invoice/);
  assert.match(issueTemplate, /private GitHub repository/);
  assert.doesNotMatch(issueTemplate, /type: textarea/);
});
