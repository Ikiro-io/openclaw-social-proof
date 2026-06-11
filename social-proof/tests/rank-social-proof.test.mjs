import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { normalizePostsInput } from "../scripts/lib/candidates.mjs";
import { filterByLens, scoreCandidates, selectRecommended } from "../scripts/lib/rank.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "own-posts.sample.json");

test("last_year_best excludes posts older than 365 days", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const candidates = normalizePostsInput(input);
  const filtered = filterByLens(candidates, "last_year_best", new Date("2026-06-10T00:00:00.000Z"));
  assert.ok(filtered.every((c) => c.sourceId !== "1790000000000000006"));
  assert.ok(filtered.some((c) => c.sourceId === "1790000000000000005"));
});

test("visual_proof keeps only media posts and prefers stronger visual proof", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const candidates = normalizePostsInput(input);
  const filtered = filterByLens(candidates, "visual_proof");
  assert.ok(filtered.every((c) => c.media.hasImage || c.media.hasVideo));
  const scored = scoreCandidates(filtered, { lens: "visual_proof" });
  const recommended = selectRecommended(scored, "visual_proof");
  const top = recommended[0];
  assert.notEqual(top.sourceId, "1790000000000000007");
});

test("curated_mix keeps strong text thread over weak pretty image", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const candidates = normalizePostsInput(input);
  const scored = scoreCandidates(candidates, { lens: "curated_mix" });
  const recommended = selectRecommended(scored, "curated_mix");
  assert.ok(recommended.some((c) => c.thread.isThread));
  assert.ok(recommended.some((c) => c.sourceId === "1790000000000000001"));
});

test("dedupe by sourceUrl in recommended set", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const doubled = { posts: [...input.posts, input.posts[0]] };
  const candidates = normalizePostsInput(doubled);
  const scored = scoreCandidates(candidates, { lens: "all_time_top" });
  const recommended = selectRecommended(scored, "all_time_top");
  const urls = recommended.map((c) => c.sourceUrl);
  assert.equal(new Set(urls).size, urls.length);
});
