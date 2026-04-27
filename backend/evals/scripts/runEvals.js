#!/usr/bin/env node
/**
 * Eval runner. Reads dataset.jsonl, calls the real agent loop in-process
 * (faster than spinning up the HTTP server), scores each case against its
 * `expected` block, and persists run + per-case results to Supabase.
 *
 * Why in-process: evals test agent BEHAVIOR (tool selection, response
 * shape), not transport/auth. Direct calls keep CI fast and cheap.
 *
 * Usage:
 *   node backend/evals/scripts/runEvals.js [--suite smoke|full] [--dataset path]
 *
 * Exits non-zero if the suite's pass-rate dropped below threshold (CI gate).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { processAgentRequest } = require('../../src/services/agentService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const SUITE = flag('suite', 'full');                                  // 'smoke' | 'full'
const DATASET = flag('dataset', path.join(__dirname, '..', 'dataset.jsonl'));
// Smoke covers the categories most prone to regression: creation flows
// (project + service-plan), ambiguous referents, edge cases.
const SMOKE_TAGS = [
  'project_creation', 'service_plan_creation', 'service_plan',
  'edge_case_short', 'edge_case_conflict', 'clarifying_question',
];
const PASS_RATE_FLOOR = parseFloat(process.env.EVAL_PASS_RATE_FLOOR || '0.7');

const TEST_USER_ID = process.env.EVAL_TEST_USER_ID
  || '00000000-0000-0000-0000-000000000001';

function gitInfo() {
  try {
    return {
      sha: execSync('git rev-parse HEAD').toString().trim(),
      branch: process.env.GITHUB_HEAD_REF
        || process.env.GITHUB_REF_NAME
        || execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
    };
  } catch {
    return { sha: null, branch: null };
  }
}

function loadDataset(filePath, suite) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const all = lines.map(l => JSON.parse(l));
  if (suite === 'smoke') {
    return all.filter(c => SMOKE_TAGS.includes(c.category)).slice(0, 10);
  }
  return all;
}

// Capture-only stand-in for an Express response object. agentService.js
// writes SSE frames; we record them to disk as structured events the scorer
// reads back.
function makeFakeResponse() {
  const events = [];
  let buffer = '';
  return {
    events,
    setHeader() {},
    flushHeaders() {},
    flush() {},
    socket: { setNoDelay() {} },
    write(chunk) {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (frame.startsWith('data: ')) {
          try {
            events.push(JSON.parse(frame.slice(6)));
          } catch {
            /* ignore non-JSON frames */
          }
        }
      }
    },
    end() {},
    on() {},
    once() {},
  };
}

function makeFakeRequest() {
  return {
    user: { id: TEST_USER_ID },
    on() {},
  };
}

// Per-million-token rates for cost calc. Mirrors backend/src/services/aiBudget.js
// Keeping it inline so the runner has no dependencies on the live cost system.
const PRICING = {
  'claude-haiku-4.5': { input: 0.80, output: 4.00 },
  'claude-sonnet-4.5': { input: 3.00, output: 15.00 },
};

function costCentsFor(model, inputTokens, outputTokens, cacheReadTokens) {
  const p = PRICING[model] || PRICING['claude-haiku-4.5'];
  // Cache reads cost ~10% of base input. Cache writes are folded into input.
  const billableInput = Math.max(0, inputTokens - cacheReadTokens);
  const usd = (billableInput / 1_000_000) * p.input
    + (cacheReadTokens / 1_000_000) * p.input * 0.1
    + (outputTokens / 1_000_000) * p.output;
  return Math.ceil(usd * 100);
}

// Pull all the structured info the scorer needs from the SSE event stream.
// Visual elements matter as much as tool calls — for project/estimate
// creation, the agent's "action" is emitting a preview card the user
// confirms in the UI, NOT calling create_project as a tool.
function summarize(events) {
  const toolCalls = [];
  let text = '';
  let metadata = null;
  let model = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let plan = null;
  let planVerification = null;
  for (const ev of events) {
    if (ev.type === 'tool_start') toolCalls.push({ tool: ev.tool });
    else if (ev.type === 'delta' && typeof ev.content === 'string') text += ev.content;
    else if (ev.type === 'metadata') metadata = ev;
    else if (ev.type === 'plan') {
      plan = {
        plan_text: ev.plan_text,
        complexity: ev.complexity,
        recommended_model: ev.recommended_model,
      };
    } else if (ev.type === 'plan_verified') {
      planVerification = { aligned: true, severity: ev.severity, reason: '' };
    } else if (ev.type === 'plan_diverged') {
      planVerification = { aligned: false, severity: ev.severity, reason: ev.reason };
    } else if (ev.type === 'usage') {
      model = ev.model || model;
      inputTokens += ev.prompt_tokens || 0;
      outputTokens += ev.completion_tokens || 0;
      cacheRead += ev.cache_read_tokens || 0;
      cacheWrite += ev.cache_write_tokens || 0;
    }
  }
  const visualElements = Array.isArray(metadata?.visualElements)
    ? metadata.visualElements.map(v => v?.type).filter(Boolean)
    : [];
  return {
    toolCalls, text, metadata, visualElements,
    model, inputTokens, outputTokens, cacheRead, cacheWrite,
    costCents: model ? costCentsFor(model, inputTokens, outputTokens, cacheRead) : 0,
    plan, planVerification,
  };
}

// LLM-as-judge: cheap content-correctness check that catches hallucinations,
// off-topic responses, made-up data. Only runs when the case has
// expected.must_match_intent set. Failure means the agent's RESPONSE is
// wrong even if it called the right tool.
async function llmJudge(prompt, response, intent) {
  if (!intent || !response) return { score: 1, reason: 'skipped (no intent or no response)' };
  const judgePrompt = `You are grading an AI assistant's response. Return ONLY a JSON object with two fields: {"pass": true|false, "reason": "<one sentence>"}.

USER PROMPT:
${prompt}

ASSISTANT RESPONSE:
${response.slice(0, 2000)}

GRADING CRITERIA (the response must satisfy):
${intent}

Pass = response satisfies the criteria without inventing facts. Fail = hallucinations, wrong client/project/number, off-topic, or directly contradicts criteria.

Return JSON only.`;

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'user', content: judgePrompt }],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*?\}/);
    if (!match) return { score: 0.5, reason: `judge unparseable: ${content.slice(0, 100)}` };
    const verdict = JSON.parse(match[0]);
    return { score: verdict.pass ? 1 : 0, reason: verdict.reason || '' };
  } catch (e) {
    return { score: 0.5, reason: `judge error: ${e.message}` };
  }
}

// Read-only / context-gathering tools — calling these does NOT count as
// "the agent took an action." They're the agent looking up state before
// answering, which is encouraged. We only care about action-taking tools
// (writes, sends, deletes) when checking must_ask cases.
const READ_ONLY_TOOLS = new Set([
  'get_daily_briefing', 'get_project_details', 'get_project_summary',
  'get_project_financials', 'get_financial_overview', 'get_transactions',
  'get_workers', 'get_worker_details', 'get_schedule_events',
  'get_daily_reports', 'get_photos', 'get_time_records',
  'get_business_settings', 'get_estimate_details', 'get_invoice_details',
  'get_ar_aging', 'get_cash_flow', 'get_payroll_summary', 'get_tax_summary',
  'get_profit_loss', 'get_project_documents', 'get_daily_checklist_report',
  'get_daily_checklist_summary',
  'search_projects', 'search_estimates', 'search_invoices', 'global_search',
  'suggest_pricing', 'share_document', 'generate_summary_report',
  // Memory tool: context-gathering, not user-facing action. Calling it is
  // expected and encouraged behavior on most turns.
  'memory',
]);

function isActionTool(name) {
  return !READ_ONLY_TOOLS.has(name);
}

// Scoring rules — keep simple and deterministic. LLM-judge is a follow-up.
function scoreCase(testCase, summary) {
  const exp = testCase.expected || {};
  const calledNames = summary.toolCalls.map(t => t.tool);
  const actionCalls = calledNames.filter(isActionTool);
  const visualTypes = summary.visualElements || [];
  const lowerText = (summary.text || '').toLowerCase();

  const reasons = [];
  let pass = true;

  // Helper: did the agent satisfy the "must call OR must emit visual" check?
  const satisfiedByCall = (acceptable) => acceptable.some(t => calledNames.includes(t));
  const satisfiedByVisual = () =>
    Array.isArray(exp.acceptable_visual_elements)
    && exp.acceptable_visual_elements.some(v => visualTypes.includes(v));

  // Forbidden tools — always checked, regardless of `kind`.
  if (Array.isArray(exp.forbidden_tools)) {
    const hit = calledNames.find(n => exp.forbidden_tools.includes(n));
    if (hit) {
      pass = false;
      reasons.push(`called forbidden tool: ${hit}`);
    }
  }

  // Plan-mention assertion — when present, the planner's plan_text must
  // include any of the listed substrings. Catches "agent didn't even
  // notice the user said Karen instead of John" cases.
  if (Array.isArray(exp.plan_must_mention) && exp.plan_must_mention.length > 0) {
    const planText = (summary.plan?.plan_text || '').toLowerCase();
    const hit = exp.plan_must_mention.some(s => planText.includes(s.toLowerCase()));
    if (!hit) {
      pass = false;
      reasons.push(`plan missing any of: ${exp.plan_must_mention.join('|')} (plan: "${summary.plan?.plan_text || 'none'}")`);
    }
  }

  // Plan verifier — if it flagged a major divergence, the case fails
  // even if structural checks otherwise passed. Minor + none don't fail.
  if (summary.planVerification && summary.planVerification.severity === 'major') {
    pass = false;
    reasons.push(`plan verifier: ${summary.planVerification.reason || 'major divergence'}`);
  }

  switch (exp.kind) {
    case 'must_call': {
      const acceptable = exp.acceptable_tools
        || (exp.tool_name ? [exp.tool_name] : []);
      if (!satisfiedByCall(acceptable) && !satisfiedByVisual()) {
        pass = false;
        const visExp = exp.acceptable_visual_elements ? ` or visual ${exp.acceptable_visual_elements.join('|')}` : '';
        reasons.push(`expected tool ${acceptable.join('|')}${visExp}; called ${calledNames.join(',') || 'none'}; visuals ${visualTypes.join(',') || 'none'}`);
      }
      break;
    }
    case 'must_ask': {
      // Read-only context-gathering is fine. Only an *action* tool means
      // the agent skipped the clarifying question.
      if (actionCalls.length > 0 && !exp.may_call_safely) {
        pass = false;
        reasons.push(`expected clarifying question; agent took action: ${actionCalls.join(',')}`);
      }
      if (Array.isArray(exp.must_contain_one_of)) {
        const hit = exp.must_contain_one_of.some(s => lowerText.includes(s.toLowerCase()));
        if (!hit) {
          pass = false;
          reasons.push(`response missing any of: ${exp.must_contain_one_of.join('|')}`);
        }
      }
      break;
    }
    case 'must_ask_or_call': {
      const acceptable = exp.acceptable_tools || [];
      const calledOk = satisfiedByCall(acceptable) || satisfiedByVisual();
      const askedOk = exp.must_handle_ambiguity
        ? /\b(which|who|sure|confirm|clarify|whose|specific)\b/i.test(summary.text)
        : true;
      if (!calledOk && !askedOk) {
        pass = false;
        reasons.push(`neither asked clarifying question nor called acceptable tool (visuals: ${visualTypes.join(',') || 'none'})`);
      }
      break;
    }
    case 'must_not_call_destructive': {
      // Forbidden-tools check above already covers the safety part. Also
      // require the response includes a friendly token (proves the agent
      // actually engaged with the user, not just silent-on-error).
      if (Array.isArray(exp.must_contain_one_of)) {
        const hit = exp.must_contain_one_of.some(s => lowerText.includes(s.toLowerCase()));
        if (!hit) {
          pass = false;
          reasons.push(`response missing any of: ${exp.must_contain_one_of.join('|')}`);
        }
      }
      break;
    }
    case 'free_form':
      // Only forbidden-tools matters.
      break;
    default:
      pass = false;
      reasons.push(`unknown expected.kind: ${exp.kind}`);
  }

  return { pass, reasons };
}

async function runOne(testCase) {
  const t0 = Date.now();
  const { data: job } = await supabase
    .from('agent_jobs')
    .insert({ user_id: TEST_USER_ID, status: 'processing' })
    .select('id')
    .single();

  const fakeRes = makeFakeResponse();
  const fakeReq = makeFakeRequest();
  const messages = [{ role: 'user', content: testCase.prompt }];

  let errorMsg = null;
  try {
    await processAgentRequest(
      messages,
      TEST_USER_ID,
      { businessName: 'Eval Harness', userName: 'eval-bot', userRole: 'owner', userLanguage: 'en' },
      fakeRes,
      fakeReq,
      job.id,
      [],
      null,
    );
  } catch (e) {
    errorMsg = e.message || String(e);
  }
  const latency = Date.now() - t0;
  const summary = summarize(fakeRes.events);

  let result;
  let judgeVerdict = null;
  if (errorMsg) {
    result = { pass: false, reasons: [`agent threw: ${errorMsg}`] };
  } else {
    result = scoreCase(testCase, summary);
    // Optional LLM-as-judge layer for content correctness. Only fires when
    // the case asks for it (expected.must_match_intent). Judge failure
    // turns a structurally-passing case into a fail with a reason so we
    // catch hallucinations and off-topic answers, not just tool selection.
    if (testCase.expected?.must_match_intent) {
      judgeVerdict = await llmJudge(testCase.prompt, summary.text, testCase.expected.must_match_intent);
      if (judgeVerdict.score < 1) {
        result.pass = false;
        result.reasons.push(`judge: ${judgeVerdict.reason}`);
      }
    }
  }

  // Best-effort cleanup of the synthetic agent_jobs row.
  await supabase.from('agent_jobs').delete().eq('id', job.id);

  return {
    testCase,
    result,
    latency_ms: latency,
    response_text: summary.text,
    tool_calls: summary.toolCalls,
    metadata: summary.metadata,
    model: summary.model,
    input_tokens: summary.inputTokens,
    output_tokens: summary.outputTokens,
    cache_read_tokens: summary.cacheRead,
    cache_write_tokens: summary.cacheWrite,
    cost_cents: summary.costCents,
    judge: judgeVerdict,
    plan: summary.plan,
    plan_verification: summary.planVerification,
  };
}

async function main() {
  const cases = loadDataset(DATASET, SUITE);
  if (cases.length === 0) {
    console.error(`No cases for suite=${SUITE} in ${DATASET}`);
    process.exit(1);
  }
  const { sha, branch } = gitInfo();
  const trigger = process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'pr'
    : process.env.GITHUB_REF === 'refs/heads/main' ? 'main'
    : 'manual';

  const { data: run } = await supabase
    .from('eval_runs')
    .insert({
      git_sha: sha,
      git_branch: branch,
      trigger,
      pr_number: process.env.GITHUB_PR_NUMBER ? parseInt(process.env.GITHUB_PR_NUMBER, 10) : null,
      suite: SUITE,
      total_cases: cases.length,
    })
    .select()
    .single();

  console.log(`▶ Eval run ${run.id} — suite=${SUITE} cases=${cases.length} branch=${branch} sha=${sha?.slice(0, 7)}`);

  let passed = 0, failed = 0, totalCostCents = 0;
  const t0 = Date.now();
  for (const tc of cases) {
    process.stdout.write(`  ${tc.test_id} (${tc.category}) … `);
    const out = await runOne(tc);
    const status = out.result.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} ${out.latency_ms}ms` + (out.result.pass ? '' : ` — ${out.result.reasons.join('; ')}`));

    if (out.result.pass) passed++; else failed++;
    totalCostCents += out.cost_cents || 0;

    await supabase.from('eval_results').insert({
      run_id: run.id,
      test_id: tc.test_id,
      category: tc.category || null,
      passed: out.result.pass,
      score: out.judge?.score ?? (out.result.pass ? 1 : 0),
      model: out.model,
      latency_ms: out.latency_ms,
      input_tokens: out.input_tokens || null,
      output_tokens: out.output_tokens || null,
      cache_read_tokens: out.cache_read_tokens || null,
      cache_write_tokens: out.cache_write_tokens || null,
      cost_cents: out.cost_cents || null,
      prompt: tc.prompt,
      response_text: out.response_text?.slice(0, 4000) || null,
      expected: tc.expected || null,
      actual: {
        tool_calls: out.tool_calls,
        errors: out.result.reasons,
        judge: out.judge,
        plan: out.plan,
        plan_verification: out.plan_verification,
      },
      tool_calls: out.tool_calls,
      failure_reason: out.result.pass ? null : out.result.reasons.join('; '),
    });
  }

  const duration = Date.now() - t0;
  await supabase.from('eval_runs').update({
    finished_at: new Date().toISOString(),
    passed_cases: passed,
    failed_cases: failed,
    total_cost_cents: totalCostCents,
    total_duration_ms: duration,
  }).eq('id', run.id);

  const passPct = passed / cases.length;
  console.log(`\n▶ Run ${run.id}: ${passed}/${cases.length} passed (${(passPct * 100).toFixed(1)}%) in ${duration}ms — cost ${(totalCostCents / 100).toFixed(2)} USD`);

  // Regression gate: compare this run to trailing 30-day P95 latency + avg
  // cost on the same suite. Fail CI if either >2x baseline. The first few
  // runs will have empty baselines and skip this check.
  const { data: baseline } = await supabase
    .from('eval_results')
    .select('latency_ms, cost_cents')
    .eq('passed', true)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
    .lte('created_at', new Date(Date.now() - 60_000).toISOString())  // exclude current run
    .order('created_at', { ascending: false })
    .limit(1000);

  // Only run the regression gate if we have a real baseline — at least 30
  // rows with non-null cost_cents and latency_ms. Skips early in eval-system
  // life when not enough runs have populated the new columns.
  const baselineWithCost = (baseline || []).filter(r => r.cost_cents != null);
  if (baseline && baseline.length >= 30 && baselineWithCost.length >= 30) {
    const sortedLat = baselineWithCost.map(r => r.latency_ms).filter(Boolean).sort((a, b) => a - b);
    const baselineP95 = sortedLat[Math.floor(sortedLat.length * 0.95)] || 0;
    const baselineAvgCost = baselineWithCost.reduce((s, r) => s + (r.cost_cents || 0), 0) / baselineWithCost.length;

    const thisLat = []; const thisCost = [];
    const { data: thisRunRows } = await supabase
      .from('eval_results').select('latency_ms, cost_cents').eq('run_id', run.id);
    for (const r of thisRunRows || []) {
      if (r.latency_ms) thisLat.push(r.latency_ms);
      if (r.cost_cents) thisCost.push(r.cost_cents);
    }
    thisLat.sort((a, b) => a - b);
    const thisP95 = thisLat[Math.floor(thisLat.length * 0.95)] || 0;
    const thisAvgCost = thisCost.reduce((s, c) => s + c, 0) / Math.max(1, thisCost.length);

    console.log(`▶ Latency P95: ${thisP95}ms (baseline ${baselineP95}ms)  Cost avg: ${thisAvgCost.toFixed(2)}c (baseline ${baselineAvgCost.toFixed(2)}c)`);

    if (baselineP95 > 0 && thisP95 > baselineP95 * 2) {
      console.error(`\n✗ Latency regression: P95 ${thisP95}ms is >2x baseline ${baselineP95}ms`);
      process.exit(1);
    }
    if (baselineAvgCost > 0 && thisAvgCost > baselineAvgCost * 2) {
      console.error(`\n✗ Cost regression: avg ${thisAvgCost.toFixed(2)}c is >2x baseline ${baselineAvgCost.toFixed(2)}c`);
      process.exit(1);
    }
  }

  if (passPct < PASS_RATE_FLOOR) {
    console.error(`\n✗ Pass rate ${(passPct * 100).toFixed(1)}% below floor ${(PASS_RATE_FLOOR * 100).toFixed(0)}%`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('runEvals fatal:', err);
  process.exit(1);
});
