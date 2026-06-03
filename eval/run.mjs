#!/usr/bin/env node
/**
 * OpenWeb Ninja MCP — self-evaluating test suite.
 *
 * Runs `claude -p` once per API tool. Each run exposes ONLY that tool (+ the `subscribe`
 * tool) via the MCP server, gives the agent a realistic natural-language task, and instructs
 * it to GRADE ITS OWN result (LLM-as-judge) and emit a strict-JSON verdict. The runner
 * collects every verdict into a consolidated PASS/FAIL artifact under eval/results/.
 *
 * Because it drives the real agent (not the SDK directly), it exercises the whole path:
 * tool selection, the generated tool descriptions, argument construction, the upstream API,
 * and the auto-subscribe-on-401 flow.
 *
 * Usage:
 *   OPENWEBNINJA_API_KEY=... node eval/run.mjs                 # run every case
 *   OPENWEBNINJA_API_KEY=... node eval/run.mjs jsearch zillow  # only cases whose tool matches a filter
 *
 * Env:
 *   OPENWEBNINJA_API_KEY  (required)  the key the MCP server authenticates with
 *   EVAL_MODEL            (default "sonnet")   model alias/id for the test agent
 *   EVAL_CONCURRENCY      (default 4)          how many cases to run in parallel
 *   EVAL_MAX_BUDGET_USD   (default 1.0)        per-case spend cap for the agent
 *   EVAL_TIMEOUT_MS       (default 180000)     per-case wall-clock timeout
 *
 * Exit code: 0 if every case PASSed (or only failed transiently); 1 if any hard FAIL.
 *
 * Prereq: `npm run build` (the suite launches dist/index.js).
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const SERVER = join(REPO, "dist", "index.js");
const RESULTS_DIR = join(__dirname, "results");

const API_KEY = process.env.OPENWEBNINJA_API_KEY;
if (!API_KEY) {
  console.error("ERROR: set OPENWEBNINJA_API_KEY (the key the MCP server should use).");
  process.exit(2);
}
if (!existsSync(SERVER)) {
  console.error(`ERROR: ${SERVER} not found. Build first:  npm run build`);
  process.exit(2);
}

const MODEL = process.env.EVAL_MODEL || "sonnet";
const CONCURRENCY = Math.max(1, Number(process.env.EVAL_CONCURRENCY || 4));
const MAX_BUDGET = process.env.EVAL_MAX_BUDGET_USD || "1.0";
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS || 180000);

const filters = process.argv.slice(2);
const allCases = JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"));
const cases = allCases
  .filter((c) => !c.skip)
  .filter((c) => filters.length === 0 || filters.some((f) => c.tool.includes(f)));

if (cases.length === 0) {
  console.error(`No cases matched filter(s): ${filters.join(", ")}`);
  process.exit(2);
}

// Only our server, with the key injected. --strict-mcp-config keeps any user/global MCP out.
const MCP_CONFIG = JSON.stringify({
  mcpServers: {
    openwebninja: { command: "node", args: [SERVER], env: { OPENWEBNINJA_API_KEY: API_KEY } },
  },
});

const promptFor = (c) => `You are an automated, non-interactive test of the OpenWeb Ninja MCP server.
You have exactly ONE OpenWeb Ninja data tool available, plus a "subscribe" tool. Work autonomously; never ask for confirmation.

TASK: ${c.prompt}

Steps:
1. Accomplish the task using the available OpenWeb Ninja tool. Read its description and choose the right operation and parameters yourself. If the operation supports a limit/page-size parameter, request only a few items to keep the response small.
2. If the tool returns a subscription/entitlement error (HTTP 401/403, or a 429 before you have used it), call the "subscribe" tool with the api_id (same as the tool name), wait ~5 seconds, then retry the tool ONCE.
3. Judge the result honestly:
   - PASS: the tool returned genuine, relevant, live data that addresses the task (real titles/prices/names/counts — not an error, not empty, not placeholder).
   - FAIL: an error, empty, or irrelevant result. If the failure is a transient upstream issue (timeout, 5xx, anti-bot/captcha block, "temporarily unavailable", rate limit), also set "transient": true.

Your FINAL message must be ONLY this JSON object, with no other text and nothing after it:
{"verdict":"PASS"|"FAIL","tool":"<tool id you used>","operation":"<operation you called>","transient":true|false,"reason":"<one short sentence>","evidence":"<a concrete snippet of the returned data: a title, price, count, or name>"}`;

function extractJson(text) {
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let v = tryParse((text || "").trim());
  if (v) return v;
  const fence = (text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    v = tryParse(fence[1].trim());
    if (v) return v;
  }
  const m = (text || "").match(/\{[\s\S]*\}/); // last-resort: first {...} block
  if (m) {
    v = tryParse(m[0]);
    if (v) return v;
  }
  return null;
}

function classify(rec) {
  if (rec.verdict === "PASS") return "PASS";
  if (rec.transient) return "FLAKY";
  return rec.verdict || "FAIL"; // FAIL / UNKNOWN / ERROR
}

function runCase(c) {
  return new Promise((done) => {
    const allowed = `mcp__openwebninja__${c.tool},mcp__openwebninja__subscribe`;
    const args = [
      "-p", promptFor(c),
      "--mcp-config", MCP_CONFIG,
      "--strict-mcp-config",
      "--allowedTools", allowed,
      "--model", MODEL,
      "--output-format", "json",
      "--max-budget-usd", MAX_BUDGET,
      "--no-session-persistence",
    ];
    const t0 = Date.now();
    const child = spawn("claude", args, {
      cwd: tmpdir(), // neutral dir: don't inherit the workspace CLAUDE.md / project context
      env: { ...process.env, MCP_TIMEOUT: "30000" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    const finish = (rec) => {
      clearTimeout(timer);
      rec.durationMs = Date.now() - t0;
      if (c.note) rec.note = c.note;
      const tag = classify(rec);
      console.log(
        `${tag.padEnd(7)} ${c.tool.padEnd(28)} ${String(rec.durationMs).padStart(6)}ms  ${(rec.reason || "").slice(0, 90)}`
      );
      done(rec);
    };

    child.on("error", (e) => {
      finish({ tool: c.tool, prompt: c.prompt, verdict: "ERROR", reason: `harness: ${e.message}` });
    });

    child.on("close", () => {
      const rec = { tool: c.tool, prompt: c.prompt };
      if (killed) {
        return finish({ ...rec, verdict: "ERROR", transient: true, reason: `timeout after ${TIMEOUT_MS}ms` });
      }
      let out;
      try {
        out = JSON.parse(stdout);
      } catch {
        return finish({ ...rec, verdict: "ERROR", reason: "could not parse claude --output-format json", raw: (stderr || stdout).slice(0, 300) });
      }
      rec.numTurns = out.num_turns;
      rec.costUsd = out.total_cost_usd;
      rec.cliError = out.is_error || undefined;
      rec.subtype = out.subtype;
      const verdict = extractJson(out.result || "");
      if (verdict && verdict.verdict) {
        // keep the canonical case tool id; the agent reports the full mcp__ name
        finish({ ...rec, ...verdict, tool: c.tool });
      } else {
        finish({ ...rec, verdict: "UNKNOWN", reason: "agent did not emit a parseable verdict", raw: (out.result || "").slice(0, 300) });
      }
    });
  });
}

function renderMd(s) {
  const mark = (r) =>
    r.verdict === "PASS" ? "✅ PASS" : r.transient ? "🟡 transient" : `❌ ${r.verdict || "FAIL"}`;
  const rows = s.results
    .map((r) => {
      const ev = (r.evidence || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80);
      const reason = (r.reason || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
      return `| \`${r.tool}\` | ${mark(r)} | ${r.operation || ""} | ${reason} | ${ev} |`;
    })
    .join("\n");
  const failures = s.results.filter((r) => r.verdict !== "PASS" && !r.transient);
  const failList = failures.length
    ? "\n## Hard failures\n\n" +
      failures.map((r) => `- \`${r.tool}\` (${r.verdict}): ${r.reason || ""}${r.raw ? `\n  - raw: ${r.raw}` : ""}`).join("\n") + "\n"
    : "";
  return `# OpenWeb Ninja MCP — eval results

- Run: ${s.stamp}
- Model: ${s.model}
- Result: **${s.pass}/${s.total} PASS**, ${s.flaky} transient, ${s.fail} hard fail
- Cost: ~$${s.costUsd.toFixed(4)} total

| Tool | Verdict | Operation | Reason | Evidence |
|---|---|---|---|---|
${rows}
${failList}`;
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  console.log(
    `Running ${cases.length} case(s)  model=${MODEL}  concurrency=${CONCURRENCY}  budget=$${MAX_BUDGET}/case\n`
  );

  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++];
      results.push(await runCase(c));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

  // restore original case order for the artifact
  const order = new Map(cases.map((c, i) => [c.tool, i]));
  results.sort((a, b) => (order.get(a.tool) ?? 0) - (order.get(b.tool) ?? 0));

  const pass = results.filter((r) => r.verdict === "PASS").length;
  const flaky = results.filter((r) => r.verdict !== "PASS" && r.transient).length;
  const fail = results.length - pass - flaky;
  const costUsd = results.reduce((a, r) => a + (r.costUsd || 0), 0);
  const stamp = new Date().toISOString();
  const runId = stamp.replace(/[:.]/g, "-");

  const summary = { runId, stamp, model: MODEL, total: results.length, pass, flaky, fail, costUsd, results };
  writeFileSync(join(RESULTS_DIR, `${runId}.json`), JSON.stringify(summary, null, 2));
  writeFileSync(join(RESULTS_DIR, "latest.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(RESULTS_DIR, "latest.md"), renderMd(summary));

  console.log(`\n${pass} PASS · ${flaky} transient · ${fail} hard fail   (of ${results.length})`);
  console.log(`Artifact: eval/results/latest.md  (and ${runId}.json)`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
