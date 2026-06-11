import { redactSecrets } from "./utils.mjs";
import { extractSourceUrlsFromBlockSource } from "./utils.mjs";

export class IkiroMcpClient {
  constructor({ endpoint, agentKey }) {
    this.endpoint = String(endpoint ?? "").trim().replace(/\/$/, "");
    this.agentKey = String(agentKey ?? "").trim();
    this.requestId = 1;
    if (!this.endpoint) throw new Error("Ikiro MCP endpoint is required");
    if (!this.agentKey) throw new Error("Ikiro Agent Key is required");
  }

  async callTool(name, args = {}) {
    const body = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: { name, arguments: args },
    };

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.agentKey}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        redactSecrets(`MCP HTTP ${response.status}: ${JSON.stringify(payload)}`, this.agentKey),
      );
    }

    const text = payload?.result?.content?.[0]?.text;
    if (!text) {
      if (payload?.error) {
        throw new Error(redactSecrets(JSON.stringify(payload.error), this.agentKey));
      }
      return payload?.result ?? payload;
    }

    const parsed = JSON.parse(text);
    if (parsed?.ok === false) {
      const err = new Error(redactSecrets(parsed.code ?? "mcp_tool_error", this.agentKey));
      err.code = parsed.code;
      err.details = parsed;
      throw err;
    }
    return parsed;
  }

  async getSourceState() {
    const [source, blocks] = await Promise.all([
      this.callTool("page.get_source"),
      this.callTool("page.list_blocks"),
    ]);
    return {
      sourceVersionId: source.sourceVersionId,
      files: source.files ?? [],
      blocks: blocks.blocks ?? [],
    };
  }

  findSocialProofBlock(blocks) {
    return (blocks ?? []).find((block) => block.role === "social-proof") ?? null;
  }

  async readSocialProofBlock(blockFile) {
    const block = await this.callTool("page.get_block", { blockFile });
    const urls = extractSourceUrlsFromBlockSource(
      typeof block.source === "string"
        ? block.source
        : block.files?.find((f) => f.path === blockFile)?.content ?? "",
    );
    return {
      blockFile,
      sourceVersionId: block.sourceVersionId,
      existingUrls: urls,
      source: block,
    };
  }

  async applyOperations(operations, { maxStaleRetries = 2 } = {}) {
    const results = [];
    let staleRetries = 0;

    for (const operation of operations) {
      let attempt = operation;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const result = await this.callTool(attempt.type, attempt.payload);
          results.push({ type: attempt.type, ok: true, result });
          break;
        } catch (error) {
          if (error.code === "stale_source_version" && staleRetries < maxStaleRetries) {
            staleRetries += 1;
            const fresh = await this.getSourceState();
            attempt = {
              ...attempt,
              payload: {
                ...attempt.payload,
                expectedSourceVersionId: fresh.sourceVersionId,
              },
            };
            continue;
          }
          results.push({
            type: attempt.type,
            ok: false,
            error: redactSecrets(error.message, this.agentKey),
            code: error.code,
          });
          throw Object.assign(new Error(redactSecrets(error.message, this.agentKey)), {
            partialResults: results,
          });
        }
      }
    }

    return results;
  }
}

export function buildApplyOperations({
  plan,
  blockFile = "blocks/social-proof.md",
  sourceVersionId,
  insertBlock = false,
  label = "Social proof",
  layout = "wall",
  showStats = false,
}) {
  const ops = [];

  if (insertBlock) {
    ops.push({
      type: "page.insert_block",
      payload: {
        expectedSourceVersionId: sourceVersionId,
        blockFile,
        role: "social-proof",
        wmdRole: "social-proof",
        body: `## ${label}\n`,
      },
    });
  }

  for (const item of plan.items) {
    if (item.thread?.isThread && item.thread.urls.length > 1) {
      ops.push({
        type: "social_proof.import_thread",
        payload: {
          expectedSourceVersionId: sourceVersionId,
          file: blockFile,
          urls: item.thread.urls,
        },
      });
    } else {
      ops.push({
        type: "social_proof.import_url",
        payload: {
          expectedSourceVersionId: sourceVersionId,
          file: blockFile,
          url: item.sourceUrl,
          ...(item.badge ? { badge: item.badge } : {}),
        },
      });
    }
  }

  ops.push(
    {
      type: "social_proof.set_label",
      payload: { expectedSourceVersionId: sourceVersionId, file: blockFile, label },
    },
    {
      type: "social_proof.set_layout",
      payload: { expectedSourceVersionId: sourceVersionId, file: blockFile, layout },
    },
    {
      type: "social_proof.set_show_stats",
      payload: { expectedSourceVersionId: sourceVersionId, file: blockFile, showStats },
    },
  );

  const orderedUrls = plan.items.map((item) => item.sourceUrl);
  orderedUrls.forEach((url, toIndex) => {
    ops.push({
      type: "social_proof.reorder",
      payload: {
        expectedSourceVersionId: sourceVersionId,
        file: blockFile,
        sourceUrl: url,
        toIndex,
      },
    });
  });

  return ops;
}
