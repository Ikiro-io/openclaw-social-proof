#!/usr/bin/env node
import { normalizePostsInput } from "./lib/candidates.mjs";
import { filterByLens, scoreCandidates, selectRecommended } from "./lib/rank.mjs";
import { LENSES, parseArgs, printJson, readJsonInput } from "./lib/utils.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lens = String(args.lens ?? args._[0] ?? "curated_mix");
  if (!LENSES.includes(lens)) {
    printJson({ error: `Unknown lens: ${lens}`, allowed: LENSES });
    process.exit(1);
  }

  const input = await readJsonInput(args.input ?? args._[1] ?? "-");
  const candidates = normalizePostsInput(input);
  const filtered = filterByLens(candidates, lens);
  const scored = scoreCandidates(filtered, { lens });
  const recommended = selectRecommended(scored, lens);

  printJson({
    lens,
    candidateCount: candidates.length,
    filteredCount: filtered.length,
    recommendedCount: recommended.length,
    recommended,
    candidates: scored,
  });
}

main().catch((error) => {
  printJson({ error: error.message });
  process.exit(1);
});
