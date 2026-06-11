# Ikiro Social Proof for OpenClaw

Free, open-source OpenClaw skill that finds your strongest X posts and writes them to your Ikiro page through deterministic MCP operations.

> Your agent finds your best social proof and keeps your Ikiro page current.

## Three-step install

1. **Install the skill**

   ```sh
   git clone https://github.com/ikiro/openclaw-social-proof
   openclaw skills install ./openclaw-social-proof/social-proof
   ```

   Exact install command may vary by OpenClaw version; the requirement is Git-installable and inspectable.

2. **Connect X** — follow [social-proof/SETUP.md](social-proof/SETUP.md), then run:

   ```sh
   node social-proof/scripts/check-x-connection.mjs
   ```

3. **Paste your Ikiro Agent Key** when the skill asks (MCP endpoint + key from Ikiro Studio).

## What it does

- Uses your **local OpenClaw X OAuth** (`x_search` only) to discover your own posts
- Ranks candidates through multiple lenses (all-time, last year, visual, threads, maintain, and more)
- Proposes a proof plan for your approval (V1 never auto-applies maintain changes)
- Writes to Ikiro through existing MCP `social_proof.*` operations with optimistic concurrency

Ikiro never stores your X OAuth token. OpenClaw owns discovery; Ikiro owns deterministic page writes.

## User commands

| Say this | Lens |
| --- | --- |
| Build my Social proof page from my best X posts | `curated_mix` (default page build) |
| Find my all-time best proof | `all_time_top` |
| Find my best proof from the last year | `last_year_best` |
| Find my best visual proof | `visual_proof` |
| Find launch posts with screenshots or demos | `launch_receipts` |
| Find my strongest authority threads | `thread_authority` |
| Find recent hotness | `recent_hotness` |
| Group my best posts by theme | `theme_clusters` |
| Keep my Social proof fresh every week | `maintain` |

## Scripts

| Script | Purpose |
| --- | --- |
| `check-x-connection.mjs` | Setup preflight: OAuth probe + `x_search` smoke test |
| `discover-x-posts.mjs` | Normalize `x_search` output to candidate JSON |
| `rank-social-proof.mjs` | Score and filter candidates by lens |
| `plan-ikiro-social-proof.mjs` | Build human-readable plan + MCP operation batch |
| `apply-ikiro-social-proof.mjs` | Apply approved plan to Ikiro MCP |
| `maintain-social-proof.mjs` | Propose fresh proof vs existing block |

## Development

```sh
npm test
```

## License

MIT — see [LICENSE](LICENSE).
