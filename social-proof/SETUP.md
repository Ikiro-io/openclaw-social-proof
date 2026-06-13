# Connect OpenClaw To X (Verified Recipe)

This recipe is verified on the founder's setup (Mac mini). Run the preflight script after completing it:

```sh
node scripts/check-x-connection.mjs
```

Use `--fix` only when you explicitly want gateway restart and auth-order repair attempts:

```sh
node scripts/check-x-connection.mjs --fix
```

## 1. Log into xAI/Grok with OAuth

```sh
openclaw onboard --auth-choice xai-device-code
```

Follow the browser/device-code flow. xAI may label the consent app as **Grok Build** because OpenClaw uses xAI's shared OAuth client.

Onboarding can be cancelled once the xAI device-code login finishes. The channel picker after that is unrelated.

## 2. Make sure OAuth wins over any old API key

If an xAI API key was previously configured, OpenClaw may still try it first. Check:

```sh
openclaw models status --probe
```

The xAI OAuth profile probe should report OK. If an old `xai:default (api_key)` profile is failing with billing/credits errors, force auth order to the OAuth profile:

```sh
openclaw models auth order set --provider xai xai:<email-or-profile-id>
```

Then verify:

```sh
openclaw models auth order get --provider xai --json
openclaw models status --probe
```

Good sign:

```txt
xai:default (api_key) → Excluded by auth.order
xai:<email> (oauth) → ok
```

## 3. Restart the gateway

```sh
openclaw gateway restart
openclaw gateway status
```

## 4. Smoke-test `x_search`

```sh
openclaw agent --agent main --thinking low --timeout 120 --message 'OAuth smoke test only. Use x_search, not web_search, to search X for posts mentioning OpenClaw from the last 2 days. Return PASS if x_search works through OAuth. Return FAIL with the exact error if there is auth, billing, missing credential, or API-key trouble.'
```

## Important tool distinction

- `x_search` is the X/Grok OAuth path. This is what the skill uses.
- `web_search --provider grok` may still expect API-key style config in some versions. The skill must never fall back to it for X discovery.

## Setup vs runtime boundary

**Setup/preflight** may run the explicit OpenClaw CLI commands above. It must not write to Ikiro, publish, inspect unrelated files, or ask for X passwords/cookies/API keys.

**Runtime discovery** may use only `x_search` for X discovery.

**Runtime apply** may use only Ikiro MCP `page.*`, `ops.*`, and `social_proof.*` operations.

**Publish** is separate. `site.publish` requires both an explicit user request and `canPublish` on the Agent Key.

Runtime jobs must not use shell, `web_search`, browser, filesystem, or memory tools.
