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
const SMOKE_TAGS = ['project_creation', 'edge_case_short', 'edge_case_conflict'];
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

// Pull all the structured info the scorer needs from the SSE event stream.
// Visual elements matter as much as tool calls — for project/estimate
// creation, the agent's "action" is emitting a preview card the user
// confirms in the UI, NOT calling create_project as a tool.
function summarize(events) {
  const toolCalls = [];
  let text = '';
  let metadata = null;
  for (const ev of events) {
    if (ev.type === 'tool_start') toolCalls.push({ tool: ev.tool });
    else if (ev.type === 'delta' && typeof ev.content === 'string') text += ev.content;
    else if (ev.type === 'metadata') metadata = ev;
  }
  const visualElements = Array.isArray(metadata?.visualElements)
    ? metadata.visualElements.map(v => v?.type).filter(Boolean)
    : [];
  return { toolCalls, text, metadata, visualElements };
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
  if (errorMsg) {
    result = { pass: false, reasons: [`agent threw: ${errorMsg}`] };
  } else {
    result = scoreCase(testCase, summary);
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

    await supabase.from('eval_results').insert({
      run_id: run.id,
      test_id: tc.test_id,
      category: tc.category || null,
      passed: out.result.pass,
      score: out.result.pass ? 1 : 0,
      model: null,
      latency_ms: out.latency_ms,
      prompt: tc.prompt,
      response_text: out.response_text?.slice(0, 4000) || null,
      expected: tc.expected || null,
      actual: { tool_calls: out.tool_calls, errors: out.result.reasons },
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
  console.log(`\n▶ Run ${run.id}: ${passed}/${cases.length} passed (${(passPct * 100).toFixed(1)}%) in ${duration}ms`);

  if (passPct < PASS_RATE_FLOOR) {
    console.error(`\n✗ Pass rate ${(passPct * 100).toFixed(1)}% below floor ${(PASS_RATE_FLOOR * 100).toFixed(0)}%`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('runEvals fatal:', err);
  process.exit(1);
});
