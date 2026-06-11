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
    showStats: false,
  });

  assert.ok(ops.some((op) => op.type === "page.insert_block"));
  assert.ok(ops.some((op) => op.type === "social_proof.import_thread"));
  assert.ok(ops.some((op) => op.type === "social_proof.import_url"));
  assert.ok(ops.some((op) => op.type === "social_proof.set_label"));
  assert.ok(ops.some((op) => op.type === "social_proof.set_layout"));
  assert.ok(ops.some((op) => op.type === "social_proof.reorder"));

  for (const op of ops) {
    assert.equal(op.payload.expectedSourceVersionId, "src_fixture");
    if (op.type.startsWith("social_proof.")) {
      assert.equal(op.payload.file, "blocks/social-proof.md");
    }
  }

  assert.ok(plan.message.includes("I found"));
  assert.ok(plan.items.length > 0);
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
