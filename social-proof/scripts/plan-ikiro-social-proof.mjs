#!/usr/bin/env node
import { buildApplyOperations } from "./lib/mcp-client.mjs";
import { buildProofPlan } from "./lib/plan.mjs";
import { filterByLens, scoreCandidates, selectRecommended } from "./lib/rank.mjs";
import { normalizePostsInput } from "./lib/candidates.mjs";
import { LENSES, parseArgs, printJson, readJsonInput } from "./lib/utils.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lens = String(args.lens ?? args._[0] ?? "curated_mix");
  if (!LENSES.includes(lens)) {
    printJson({ error: `Unknown lens: ${lens}`, allowed: LENSES });
    process.exit(1);
  }

  const input = await readJsonInput(args.input ?? args._[1] ?? "-");
  const existingUrls = Array.isArray(input?.existingUrls)
    ? input.existingUrls
    : Array.isArray(args.existing)
      ? String(args.existing).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const candidates = normalizePostsInput(input);
  const filtered = filterByLens(candidates, lens);
  const scored = scoreCandidates(filtered, { lens });
  const recommended = selectRecommended(scored, lens);
  const plan = buildProofPlan({ candidates: scored, recommended, lens, existingUrls });

  const mcpPlan = {
    blockFile: String(args["block-file"] ?? "blocks/social-proof.md"),
    insertBlock: Boolean(args["insert-block"]),
    label: String(args.label ?? "Social proof"),
    layout: String(args.layout ?? "wall"),
    showStats: args["show-stats"] === "true",
    sourceVersionId: args["source-version-id"] ?? null,
    operations: buildApplyOperations({
      plan: { items: recommended },
      blockFile: String(args["block-file"] ?? "blocks/social-proof.md"),
      sourceVersionId: args["source-version-id"] ?? "dry-run",
      insertBlock: Boolean(args["insert-block"]),
      label: String(args.label ?? "Social proof"),
      layout: String(args.layout ?? "wall"),
      showStats: args["show-stats"] === "true",
    }),
  };

  printJson({ plan, mcpPlan });
}

main().catch((error) => {
  printJson({ error: error.message });
  process.exit(1);
});
