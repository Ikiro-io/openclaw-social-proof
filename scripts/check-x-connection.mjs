#!/usr/bin/env node
import { spawn } from "node:child_process";
import { parseArgs, printJson } from "../social-proof/scripts/lib/utils.mjs";

const SMOKE_MESSAGE =
  "OAuth smoke test only. Use x_search, not web_search, to search X for posts mentioning OpenClaw from the last 2 days. Return PASS if x_search works through OAuth. Return FAIL with the exact error if there is auth, billing, missing credential, or API-key trouble.";

async function runCommand(command, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\nTimed out`, timedOut: true });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, timedOut: false });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message, timedOut: false });
    });
  });
}

function parseProbe(stdout) {
  const text = String(stdout ?? "");
  const oauthOk = /\(oauth\).*?→\s*ok/i.test(text) || /oauth.*ok/i.test(text);
  const apiKeyExcluded = /\(api_key\).*Excluded by auth\.order/i.test(text);
  const apiKeyFailing = /\(api_key\).*?(fail|error|billing|credits)/i.test(text);
  return { oauthOk, apiKeyExcluded, apiKeyFailing, raw: text };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fix = Boolean(args.fix);
  const result = {
    status: "FAIL",
    checks: [],
    remediation: [],
  };

  const probe = await runCommand("openclaw", ["models", "status", "--probe"]);
  result.checks.push({
    name: "models_probe",
    ok: probe.ok,
    detail: probe.stderr || probe.stdout,
  });

  if (!probe.ok) {
    result.remediation.push("Install OpenClaw and run: openclaw onboard --auth-choice xai-device-code");
    printJson(result);
    process.exit(1);
  }

  const parsedProbe = parseProbe(`${probe.stdout}\n${probe.stderr}`);
  result.checks.push({
    name: "oauth_profile",
    ok: parsedProbe.oauthOk,
    detail: parsedProbe.raw,
  });

  if (!parsedProbe.oauthOk) {
    result.remediation.push("Run: openclaw onboard --auth-choice xai-device-code");
    result.remediation.push(
      "Then set auth order: openclaw models auth order set --provider xai xai:<email-or-profile-id>",
    );
  }

  if (parsedProbe.apiKeyFailing && !parsedProbe.apiKeyExcluded) {
    result.remediation.push(
      "Force OAuth over stale API key: openclaw models auth order set --provider xai xai:<email-or-profile-id>",
    );
    if (fix) {
      const orderGet = await runCommand("openclaw", [
        "models",
        "auth",
        "order",
        "get",
        "--provider",
        "xai",
        "--json",
      ]);
      result.checks.push({ name: "auth_order_get", ok: orderGet.ok, detail: orderGet.stdout || orderGet.stderr });
    }
  }

  if (fix) {
    const restart = await runCommand("openclaw", ["gateway", "restart"]);
    result.checks.push({
      name: "gateway_restart",
      ok: restart.ok,
      detail: restart.stderr || restart.stdout,
    });
    const status = await runCommand("openclaw", ["gateway", "status"]);
    result.checks.push({
      name: "gateway_status",
      ok: status.ok,
      detail: status.stderr || status.stdout,
    });
  }

  const smoke = await runCommand(
    "openclaw",
    ["agent", "--agent", "main", "--thinking", "low", "--timeout", "120", "--message", SMOKE_MESSAGE],
    { timeoutMs: 150_000 },
  );
  const smokeText = `${smoke.stdout}\n${smoke.stderr}`;
  const smokePass = /PASS/i.test(smokeText) && smoke.ok;
  result.checks.push({
    name: "x_search_smoke",
    ok: smokePass,
    detail: smokeText.slice(0, 4000),
  });

  if (!smokePass) {
    result.remediation.push("Verify OAuth wins: openclaw models status --probe");
    result.remediation.push("Restart gateway: openclaw gateway restart");
    result.remediation.push("Never use web_search as an X fallback; runtime discovery is x_search only.");
  }

  const allOk = result.checks.every((check) => check.ok);
  result.status = allOk ? "PASS" : "FAIL";
  printJson(result);
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  printJson({ status: "FAIL", error: error.message });
  process.exit(1);
});
