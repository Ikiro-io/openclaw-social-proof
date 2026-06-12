#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { buildApplyOperations, IkiroMcpClient } from "./lib/mcp-client.mjs";
import { parseArgs, printJson, redactSecrets } from "./lib/utils.mjs";

async function loadPlan(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const endpoint = String(args.endpoint ?? process.env.IKIRO_MCP_ENDPOINT ?? "");
  const agentKey = String(args["agent-key"] ?? process.env.IKIRO_AGENT_KEY ?? "");
  const publish = Boolean(args.publish);
  const dryRun = Boolean(args["dry-run"]);

  if (!endpoint || !agentKey) {
    printJson({
      error: "IKIRO_MCP_ENDPOINT and IKIRO_AGENT_KEY (or --endpoint / --agent-key) are required",
    });
    process.exit(1);
  }

  const planPath = args.plan ?? args._[0];
  if (!planPath) {
    printJson({ error: "Usage: apply-ikiro-social-proof.mjs --plan plan.json" });
    process.exit(1);
  }

  const payload = await loadPlan(planPath);
  const items = payload.plan?.items ?? payload.items ?? [];
  const recommended = items.map((item) => ({
    sourceUrl: item.sourceUrl,
    thread: item.thread ?? { isThread: false, urls: [item.sourceUrl] },
    badge: item.badge,
    metrics: item.metrics ?? {
      likes: item.likes,
      replies: item.replies,
      reposts: item.reposts,
      views: item.views,
    },
  }));

  const client = new IkiroMcpClient({ endpoint, agentKey });
  const state = await client.getSourceState();
  let block = client.findSocialProofBlock(state.blocks);
  let blockFile = block?.blockFile ?? payload.mcpPlan?.blockFile ?? "blocks/social-proof.md";
  let sourceVersionId = state.sourceVersionId;
  let existingUrls = [];

  if (block) {
    const current = await client.readSocialProofBlock(block.blockFile);
    blockFile = current.blockFile;
    existingUrls = current.existingUrls;
    sourceVersionId = current.sourceVersionId ?? sourceVersionId;
  }

  const toImport = recommended.filter((item) => !existingUrls.includes(item.sourceUrl));
  const operations = buildApplyOperations({
    plan: { items: toImport.length ? toImport : recommended },
    blockFile,
    sourceVersionId,
    insertBlock: !block,
    label: payload.plan?.label ?? payload.label ?? "Social proof",
    layout: payload.mcpPlan?.layout ?? payload.layout ?? "wall",
  });

  if (dryRun) {
    printJson({
      dryRun: true,
      blockFile,
      insertBlock: !block,
      sourceVersionId,
      operationCount: operations.length,
      operations,
      message: redactSecrets("Dry run only. No Ikiro writes performed.", agentKey),
    });
    return;
  }

  const results = await client.applyOperations(operations);
  let publishResult = null;

  if (publish) {
    try {
      publishResult = await client.callTool("site.publish", {
        expectedSourceVersionId: (await client.getSourceState()).sourceVersionId,
      });
    } catch (error) {
      publishResult = { ok: false, code: error.code ?? "publish_failed", message: error.message };
    }
  }

  printJson({
    ok: true,
    blockFile,
    imported: toImport.length,
    results,
    publish: publish ? publishResult : { skipped: true, reason: "publish not requested" },
    message: redactSecrets("Social proof apply complete.", agentKey),
  });
}

main().catch((error) => {
  printJson({
    ok: false,
    error: error.message,
    partialResults: error.partialResults ?? [],
  });
  process.exit(1);
});
