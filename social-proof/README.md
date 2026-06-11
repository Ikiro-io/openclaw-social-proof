# social-proof (OpenClaw skill)

Installable OpenClaw skill folder for Ikiro Social Proof.

## Install

```sh
openclaw skills install ./social-proof
```

From the repo root after clone:

```sh
openclaw skills install ./openclaw-social-proof/social-proof
```

## Configure

The skill asks for:

- Ikiro MCP endpoint (from Studio Agent Key / MCP config UI)
- Ikiro Agent Key (`Authorization: Bearer ik_agent_...`)
- Project URL or ID (for context only; the key is project-scoped)

Store secrets in local OpenClaw configuration. Never log plaintext Agent Keys.

## Docs

- [SKILL.md](SKILL.md) — agent instructions
- [SETUP.md](SETUP.md) — verified Connect OpenClaw To X recipe

## Scripts

All scripts live in `scripts/` and are deterministic helpers the agent can shell to for JSON shape, ranking, planning, and MCP apply.
