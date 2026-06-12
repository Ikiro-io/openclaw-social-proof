import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { normalizePostsInput } from "../scripts/lib/candidates.mjs";
import { buildApplyOperations } from "../scripts/lib/mcp-client.mjs";
import { buildProofPlan } from "../scripts/lib/plan.mjs";
import { scoreCandidates, selectRecommended } from "../scripts/lib/rank.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "own-posts.sample.json");

test("buildApplyOperations emits expected social_proof calls", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const candidates = normalizePostsInput(input);
  const scored = scoreCandidates(candidates, { lens: "curated_mix" });
  const recommended = selectRecommended(scored, "curated_mix").slice(0, 3);
  const plan = buildProofPlan({ candidates: scored, recommended, lens: "curated_mix", existingUrls: [] });

  const ops = buildApplyOperations({
    plan: { items: recommended },
    sourceVersionId: "src_fixture",
    insertBlock: true,
    label: "Greatest hits",
    layout: "wall",
  });

  assert.ok(ops.some((op) => op.type === "page.insert_block"));
  assert.ok(ops.some((op) => op.type === "social_proof.import_thread"));
  assert.ok(ops.some((op) => op.type === "social_proof.import_url"));
  assert.ok(ops.some((op) => op.type === "social_proof.set_label"));
  assert.ok(ops.some((op) => op.type === "social_proof.set_layout"));
  assert.ok(ops.some((op) => op.type === "social_proof.reorder"));
  assert.ok(!ops.some((op) => op.type === "social_proof.set_show_stats"));

  const importOps = ops.filter((op) => op.type.startsWith("social_proof.import_"));
  for (const op of importOps) {
    assert.equal(typeof op.payload.likes, "number");
    assert.equal(typeof op.payload.replies, "number");
    assert.equal(typeof op.payload.reposts, "number");
    assert.equal(typeof op.payload.views, "number");
  }

  const threadOp = ops.find((op) => op.type === "social_proof.import_thread");
  assert.equal(threadOp.payload.likes, 18000);
  assert.equal(threadOp.payload.replies, 880);
  assert.equal(threadOp.payload.reposts, 2400);
  assert.equal(threadOp.payload.views, 250000);

  const launchOp = ops.find(
    (op) =>
      op.type === "social_proof.import_url" &&
      op.payload.url === "https://x.com/mayabuilds/status/1790000000000000005",
  );
  assert.equal(launchOp.payload.likes, 3200);
  assert.equal(launchOp.payload.views, 98000);

  for (const op of ops) {
    assert.equal(op.payload.expectedSourceVersionId, "src_fixture");
    if (op.type.startsWith("social_proof.")) {
      assert.equal(op.payload.file, "blocks/social-proof.md");
    }
  }

  assert.ok(plan.message.includes("I found"));
  assert.ok(plan.items.length > 0);
  assert.ok(plan.items.every((item) => item.metrics?.likes != null));
});

test("maintain plan skips URLs already on the page", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const candidates = normalizePostsInput(input);
  const scored = scoreCandidates(candidates, { lens: "maintain" });
  const recommended = selectRecommended(scored, "maintain");
  const existingUrls = [recommended[0]?.sourceUrl].filter(Boolean);
  const plan = buildProofPlan({
    candidates: scored,
    recommended,
    lens: "maintain",
    existingUrls,
  });

  assert.equal(plan.newCount, Math.max(0, recommended.length - existingUrls.length));
});
