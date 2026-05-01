/**
 * Tool description quality linter.
 *
 * The PEV planner picks tools heavily based on descriptions. Weak
 * descriptions = wrong tool calls. This linter scores each tool's
 * description on objective heuristics so we can:
 *   - Identify which tools need attention (lowest scores first)
 *   - Block regressions via a test that fails when scores drop
 *   - Produce a quality report (npm run lint:tools)
 *
 * Score components (0-10 total):
 *   length           — too short = vague (≥120 chars to score 2pts)
 *   wnen_to_use      — "Use when…", "Call when…", "use this for…" phrasing (1pt)
 *   when_not_to_use  — "Don't use…", "DO NOT call…", "instead use…" (1pt)
 *   has_example      — examples field present and non-empty (3pt)
 *   distinctive      — mentions distinguishing context vs sibling tools (1pt)
 *   args_described   — every required arg has a description (2pt)
 *
 * 8+/10 = solid
 * 5-7   = okay
 * <5    = weak (needs audit)
 */

const HEURISTICS = {
  length: {
    weight: 2,
    test: (tool) => (tool.description || '').length >= 120,
    label: 'description ≥120 chars',
  },
  whenToUse: {
    weight: 1,
    test: (tool) => /\b(use when|call when|use this when|use this for)\b/i.test(tool.description || ''),
    label: 'has "use when…" guidance',
  },
  whenNotToUse: {
    weight: 1,
    test: (tool) => /\b(don'?t use|do not (use|call)|never (call|use)|instead use)\b/i.test(tool.description || ''),
    label: 'has "don\'t use" guidance',
  },
  hasExample: {
    weight: 3,
    test: (tool) => Array.isArray(tool.examples) && tool.examples.length > 0,
    label: 'has at least one concrete example',
  },
  distinctive: {
    weight: 1,
    test: (tool) => /\b(vs|instead of|use .* for|rather than|use .* instead)\b/i.test(tool.description || ''),
    label: 'distinguishes from sibling tools',
  },
  argsDescribed: {
    weight: 2,
    test: (tool) => {
      const required = tool.parameters?.required || [];
      const props = tool.parameters?.properties || {};
      if (required.length === 0) return true; // no required args is fine
      return required.every((r) => props[r]?.description && props[r].description.length >= 20);
    },
    label: 'every required arg has a ≥20-char description',
  },
};

function scoreTool(toolDef) {
  // Accept both wrapped (toolDefinitions array entry) and unwrapped (function block)
  const fn = toolDef.function || toolDef;
  const breakdown = {};
  let score = 0;
  let maxScore = 0;
  for (const [name, h] of Object.entries(HEURISTICS)) {
    const passed = h.test(fn);
    breakdown[name] = { passed, weight: h.weight, label: h.label };
    if (passed) score += h.weight;
    maxScore += h.weight;
  }
  return { name: fn.name, score, maxScore, breakdown };
}

function lintAll(toolDefinitions) {
  const results = (toolDefinitions || []).map(scoreTool);
  results.sort((a, b) => a.score - b.score); // worst first
  return results;
}

function buildReport(toolDefinitions) {
  const results = lintAll(toolDefinitions);
  const total = results.length;
  const solid = results.filter((r) => r.score >= 8).length;
  const ok = results.filter((r) => r.score >= 5 && r.score < 8).length;
  const weak = results.filter((r) => r.score < 5).length;
  const noExample = results.filter((r) => !r.breakdown.hasExample.passed).length;
  const tooShort = results.filter((r) => !r.breakdown.length.passed).length;

  return {
    total,
    distribution: { solid, ok, weak },
    metrics: { noExample, tooShort },
    bottom20: results.slice(0, 20).map((r) => ({
      name: r.name,
      score: `${r.score}/${r.maxScore}`,
      missing: Object.entries(r.breakdown)
        .filter(([, v]) => !v.passed)
        .map(([k]) => k),
    })),
    top10: results.slice(-10).reverse().map((r) => ({
      name: r.name,
      score: `${r.score}/${r.maxScore}`,
    })),
  };
}

module.exports = { scoreTool, lintAll, buildReport, HEURISTICS };
