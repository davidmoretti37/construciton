/**
 * Agent eval suite — replays canned cases (real-shaped failures from
 * production) through the current PEV pipeline. Hard regression test
 * that the agent-bug-of-the-day doesn't recur.
 *
 * Cases live in src/__evals__/agent-cases.json. Adding a new case is
 * the standard "bug fix → add a regression test" pattern: capture the
 * failing message + expected behavior, the eval harness handles the rest.
 *
 * Skipped without OPENROUTER_API_KEY (PEV pipeline needs LLM calls).
 */

const path = require('path');
const fs = require('fs');
const { runCase } = require('../services/agent/evalHarness');

const NO_KEY = !process.env.OPENROUTER_API_KEY;
const CASES_PATH = path.resolve(__dirname, '../__evals__/agent-cases.json');

(NO_KEY ? describe.skip : describe)('PEV agent evals', () => {
  jest.setTimeout(120_000);

  const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'));

  test.each(cases.map((c) => [c.id, c]))('%s', async (id, testCase) => {
    const r = await runCase(testCase);
    if (!r.passed) {
      // eslint-disable-next-line no-console
      console.error(`Case "${id}" failed:`, r.mismatches.join('\n  '));
      // eslint-disable-next-line no-console
      console.error(`Tools called: ${r.callsMade.map((c) => c.name).join(', ') || 'none'}`);
      // eslint-disable-next-line no-console
      console.error(`Handoff: ${r.pevResult.handoff}, reason: ${r.pevResult.reason || '-'}`);
    }
    // We tolerate degradation (rate limit / 402) — pipeline falls back to foreman
    // which is the safe default. Skip the assertion in that case.
    const classifyStage = r.pevResult.trace?.stages?.find((s) => s.stage === 'classify');
    if (classifyStage?.fallback) return;

    expect(r.passed).toBe(true);
  });
});

// Always-on smoke test: harness itself works (no LLM needed).
describe('Eval harness — sanity', () => {
  test('runCase exists + scores correctly on stubbed pipeline', async () => {
    // Force the harness's internal runPev to return a known shape by
    // controlling the user message + tools so the planner never runs.
    // Easiest: the simple-classified message → classifier short-circuits
    // to foreman → no LLM planning.
    const r = await runCase({
      id: 'smoke',
      userMessage: 'show me my estimates',
      tools: ['search_estimates'],
      expectations: { handoff: 'foreman' },
    });
    // With or without OPENROUTER_API_KEY the simple regex pre-classifier
    // routes "show me my estimates" → simple → handoff=foreman.
    expect(r.pevResult.handoff).toBe('foreman');
    expect(r.passed).toBe(true);
  });
});
