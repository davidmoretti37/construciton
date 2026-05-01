/**
 * PEV eval harness — replay captured turns, score outcomes.
 *
 * Use case: pull failed agent turns from telemetry / production logs,
 * feed them through the current PEV pipeline with a stub executeTool,
 * and report which now succeed. Real confidence before changes ship.
 *
 * Two modes:
 *
 *   1. CLI (npm run eval:agent) — reads cases from a JSON file and
 *      prints a pass/fail report. Cases are checked into the repo
 *      under backend/src/__evals__/agent-cases.json.
 *
 *   2. Programmatic — exposed for ad-hoc replay from tests or scripts.
 *
 * A case shape:
 *   {
 *     id: 'co-bug-2026-05-01',         // human label
 *     userMessage: '...',
 *     tools: ['search_projects', ...], // tool names that should be available
 *     expectations: {
 *       handoff: 'response' | 'ask' | 'foreman' | 'approval',
 *       toolsCalled?: ['search_projects', 'create_change_order'],
 *       toolsForbidden?: ['create_project_phase', 'record_expense'],
 *       gapPattern?: 'string or regex',
 *     },
 *     stubResults?: {                  // optional canned tool outputs
 *       'search_projects': { results: [{id: 'p1', name: 'John Smith'}] },
 *     },
 *   }
 *
 * Privacy: cases are anonymized real failures. No PII, no client names
 * outside synthetic ones.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

/**
 * Run a single case through the PEV pipeline.
 *
 * @param {Object} testCase
 * @param {Object} options
 *   options.toolDefinitions — full tool definitions to filter from
 * @returns {Promise<{passed: boolean, mismatches: Array, pevResult, totalMs}>}
 */
async function runCase(testCase, options = {}) {
  const { runPev } = require('./pev');
  const allTools = options.toolDefinitions || require('../tools/definitions').toolDefinitions;

  // Build the tool subset the case asks for
  const toolNameSet = new Set(testCase.tools || []);
  const tools = allTools.filter((t) => toolNameSet.has((t.function || t).name));

  // Stub executor — returns canned results from the case, throws if a
  // forbidden tool is called.
  const callsMade = [];
  const stubResults = testCase.stubResults || {};
  const forbidden = new Set(testCase.expectations?.toolsForbidden || []);
  const stubExecuteTool = async (name, args) => {
    callsMade.push({ name, args });
    if (forbidden.has(name)) {
      throw new Error(`forbidden tool called: ${name}`);
    }
    if (stubResults[name]) return stubResults[name];
    // Default: return a generic "ok" so plans don't trip on missing stubs
    return { ok: true, _stubbed: true };
  };

  const t0 = Date.now();
  const pevResult = await runPev({
    userMessage: testCase.userMessage,
    tools,
    userId: testCase.userId || 'eval-user',
    executeTool: stubExecuteTool,
    businessContext: testCase.businessContext || '',
    memorySnapshot: testCase.memorySnapshot || '',
  });
  const totalMs = Date.now() - t0;

  const mismatches = scoreCase(testCase, pevResult, callsMade);

  return {
    passed: mismatches.length === 0,
    mismatches,
    pevResult,
    callsMade,
    totalMs,
  };
}

/**
 * Compare expected vs actual. Returns array of mismatch descriptions.
 */
function scoreCase(testCase, pevResult, callsMade) {
  const mismatches = [];
  const exp = testCase.expectations || {};

  if (exp.handoff && pevResult.handoff !== exp.handoff) {
    mismatches.push(`handoff: expected "${exp.handoff}", got "${pevResult.handoff}"`);
  }

  if (Array.isArray(exp.toolsCalled)) {
    const actual = callsMade.map((c) => c.name);
    for (const tool of exp.toolsCalled) {
      if (!actual.includes(tool)) {
        mismatches.push(`expected tool not called: ${tool} (called: ${actual.join(', ') || 'none'})`);
      }
    }
  }

  if (Array.isArray(exp.toolsForbidden)) {
    const actual = callsMade.map((c) => c.name);
    for (const tool of exp.toolsForbidden) {
      if (actual.includes(tool)) {
        mismatches.push(`forbidden tool was called: ${tool}`);
      }
    }
  }

  if (exp.gapPattern && pevResult.handoff === 'ask') {
    const re = exp.gapPattern instanceof RegExp ? exp.gapPattern : new RegExp(exp.gapPattern, 'i');
    const text = (pevResult.question || '') + ' ' + (pevResult.suggestion || '');
    if (!re.test(text)) {
      mismatches.push(`gapPattern "${exp.gapPattern}" not found in question/suggestion: "${text.slice(0, 200)}"`);
    }
  }

  return mismatches;
}

/**
 * Run all cases in a file and print a report.
 */
async function runFile(casesPath) {
  const fullPath = path.resolve(casesPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Cases file not found: ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const cases = JSON.parse(raw);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    process.stdout.write(`▶ ${c.id} ... `);
    try {
      const r = await runCase(c);
      if (r.passed) {
        passed++;
        process.stdout.write(`✓ (${r.totalMs}ms)\n`);
      } else {
        failed++;
        process.stdout.write(`✗ (${r.totalMs}ms)\n`);
        for (const m of r.mismatches) process.stdout.write(`    ${m}\n`);
      }
      results.push({ id: c.id, ...r });
    } catch (e) {
      failed++;
      process.stdout.write(`✗ ERROR: ${e.message}\n`);
      results.push({ id: c.id, passed: false, error: e.message });
    }
  }

  process.stdout.write(`\n=== ${passed}/${cases.length} passed (${failed} failed) ===\n`);
  return { passed, failed, total: cases.length, results };
}

module.exports = { runCase, runFile, scoreCase };
