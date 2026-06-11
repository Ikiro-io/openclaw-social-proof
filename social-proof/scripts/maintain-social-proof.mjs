#!/usr/bin/env node
import { IkiroMcpClient } from "./lib/mcp-client.mjs";
import { buildProofPlan } from "./lib/plan.mjs";
import { filterByLens, scoreCandidates, selectRecommended } from "./lib/rank.mjs";
import { normalizePostsInput } from "./lib/candidates.mjs";
import { parseArgs, printJson, readJsonInput } from "./lib/utils.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const endpoint = String(args.endpoint ?? process.env.IKIRO_MCP_ENDPOINT ?? "");
  const agentKey = String(args["agent-key"] ?? process.env.IKIRO_AGENT_KEY ?? "");

  const input = await readJsonInput(args.input ?? args._[0] ?? "-");
  const candidates = normalizePostsInput(input);

  let existingUrls = Array.isArray(input?.existingUrls) ? input.existingUrls : [];

  if (endpoint && agentKey) {
    const client = new IkiroMcpClient({ endpoint, agentKey });
    const state = await client.getSourceState();
    const block = client.findSocialProofBlock(state.blocks);
    if (block) {
      const current = await client.readSocialProofBlock(block.blockFile);
      existingUrls = current.existingUrls;
    }
  }

  const filtered = filterByLens(candidates, "maintain");
  const scored = scoreCandidates(filtered, { lens: "maintain" });
  const unseen = scored.filter((item) => !existingUrls.includes(item.sourceUrl));
  const recommended = selectRecommended(unseen, "maintain");

  const plan = buildProofPlan({
    candidates: scored,
    recommended,
    lens: "maintain",
    existingUrls,
  });

  plan.mode = "maintain";
  plan.autoApply = false;
  plan.proposalOnly = true;

  printJson(plan);
}

main().catch((error) => {
  printJson({ error: error.message });
  process.exit(1);
});
