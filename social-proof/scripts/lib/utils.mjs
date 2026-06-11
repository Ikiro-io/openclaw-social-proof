import { readFile } from "node:fs/promises";

const X_STATUS_URL =
  /^https?:\/\/(?:(?:www|mobile)\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})(?:\?.*)?$/i;

export const LENSES = [
  "all_time_top",
  "last_year_best",
  "visual_proof",
  "launch_receipts",
  "thread_authority",
  "recent_hotness",
  "theme_clusters",
  "curated_mix",
  "maintain",
];

export const AGENT_KEY_PATTERN = /ik_agent_[A-Za-z0-9_-]+/g;

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

export async function readJsonInput(path) {
  if (path && path !== "-") {
    return JSON.parse(await readFile(path, "utf8"));
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

export function redactSecrets(text, agentKey = "") {
  let out = String(text ?? "");
  if (agentKey) out = out.split(agentKey).join("ik_agent_[REDACTED]");
  return out.replace(AGENT_KEY_PATTERN, "ik_agent_[REDACTED]");
}

export function normalizeXStatusUrl(url) {
  const raw = String(url ?? "").trim();
  const match = raw.match(X_STATUS_URL);
  if (!match) return null;
  const [, handle, statusId] = match;
  return {
    handle: handle.toLowerCase(),
    statusId,
    sourceUrl: `https://x.com/${handle}/status/${statusId}`,
  };
}

export function isAllowedXStatusUrl(url) {
  return normalizeXStatusUrl(url) !== null;
}

export function daysAgo(isoDate, now = new Date()) {
  const created = Date.parse(isoDate);
  if (Number.isNaN(created)) return Infinity;
  return (now.getTime() - created) / (24 * 60 * 60 * 1000);
}

export function percentileRank(value, values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const below = sorted.filter((v) => v < value).length;
  return below / sorted.length;
}

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extractSourceUrlsFromBlockSource(source) {
  return [...String(source ?? "").matchAll(/^\s*wmd_source_url:\s*(\S+)/gm)].map((m) => m[1]);
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
