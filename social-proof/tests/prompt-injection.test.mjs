import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { containsInjectionInstruction, normalizePostsInput } from "../scripts/lib/candidates.mjs";
import { buildProofPlan } from "../scripts/lib/plan.mjs";
import { scoreCandidates, selectRecommended } from "../scripts/lib/rank.mjs";
import { buildApplyOperations } from "../scripts/lib/mcp-client.mjs";
import { isAllowedXStatusUrl, redactSecrets } from "../scripts/lib/utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "own-posts.sample.json");

test("malicious post text cannot change MCP targets or publish behavior", async () => {
  const input = JSON.parse(await readFile(fixturePath, "utf8"));
  const candidates = normalizePostsInput(input);
  const malicious = candidates.find((c) => containsInjectionInstruction(c.text));
  assert.ok(malicious);

  const scored = scoreCandidates(candidates, { lens: "curated_mix" });
  const recommended = selectRecommended(scored, "curated_mix");
  const plan = buildProofPlan({ candidates: scored, recommended, lens: "curated_mix", existingUrls: [] });

  assert.equal(plan.publish, false);
  assert.equal(plan.requiresApproval, true);
  assert.ok(!JSON.stringify(plan).includes("site.publish"));

  const ops = buildApplyOperations({
    plan: { items: recommended },
    sourceVersionId: "src_test",
    insertBlock: true,
  });
  assert.ok(ops.every((op) => op.type.startsWith("page.") || op.type.startsWith("social_proof.")));
  assert.equal(ops.some((op) => op.type === "site.publish"), false);
});

test("hostile URLs are rejected", () => {
  assert.equal(isAllowedXStatusUrl("https://x.com/evil/status/not-a-number"), false);
  assert.equal(isAllowedXStatusUrl("javascript:alert(1)"), false);
  assert.equal(
    isAllowedXStatusUrl("https://x.com/maya/status/1790000000000000000"),
    true,
  );
});

test("agent keys are redacted from logs", () => {
  const key = "ik_agent_supersecretvalue123";
  const text = `Bearer ${key} failed`;
  assert.equal(redactSecrets(text, key).includes(key), false);
  assert.match(redactSecrets(text, key), /ik_agent_\[REDACTED\]/);
});
