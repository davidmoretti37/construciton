/**
 * Hand-labeled test set for the PEV complexity classifier.
 *
 * These are real-shaped messages from owners. The expected class is what
 * we want the classifier to choose; if a phrase is genuinely on the
 * boundary, we accept either of two adjacent classes.
 *
 * Run with: OPENROUTER_API_KEY=... npx jest agent.classifier
 *
 * In CI without an API key, the test is skipped.
 */

const { classify } = require('../services/agent/classifier');

const NO_KEY = !process.env.OPENROUTER_API_KEY;

const CASES = [
  // ───── simple ─────
  { msg: 'show me my estimates', expect: ['simple'] },
  { msg: "what's John Smith's address", expect: ['simple'] },
  { msg: 'how much have I spent on the Smith project', expect: ['simple'] },
  { msg: 'list overdue invoices', expect: ['simple'] },
  { msg: 'who is Lana?', expect: ['simple'] },
  { msg: 'send it', expect: ['simple', 'clarification'], hints: { hasActivePreview: true } },
  { msg: 'yes', expect: ['simple'], hints: { lastTurnWasQuestion: true } },

  // ───── complex ─────
  { msg: 'Add a change order to John for 200 square footed bath tile at $8 a square foot for two more days',
    expect: ['complex'] },
  // Genuinely ambiguous: missing project. Either complex (search projects + ask) or
  // clarification ("for which project?") is correct. Accept both.
  { msg: 'add a CO for kitchen island, $2400, 1 day', expect: ['complex', 'clarification'] },
  { msg: 'Set up a new project for Maria Henderson, kitchen remodel, $45k budget, starting next week',
    expect: ['complex'] },
  { msg: 'send all my overdue invoices reminders', expect: ['complex'] },
  { msg: "switch the Wilson job to net-15 and re-issue the next invoice", expect: ['complex'] },
  { msg: 'the Smiths added 200sf of tile, $8/sf, +1 day', expect: ['complex'] },

  // ───── clarification ─────
  { msg: 'yes', expect: ['clarification', 'simple'] }, // no hints — ambiguous
  { msg: 'fix it', expect: ['clarification'] },
  { msg: 'do that', expect: ['clarification'] },
  { msg: '?', expect: ['clarification'] },
  { msg: 'Delo', expect: ['clarification'] },

  // ───── briefing ─────
  { msg: 'good morning', expect: ['briefing', 'simple'] },
  { msg: 'morning brief', expect: ['briefing'] },
  { msg: "what's going on today", expect: ['briefing'] },
  { msg: 'anything I should know', expect: ['briefing'] },
  { msg: 'give me my morning brief', expect: ['briefing'] },
];

(NO_KEY ? describe.skip : describe)('PEV classifier — hand-labeled cases', () => {
  // Run sequentially to be polite to the API; one second budget per call is plenty
  jest.setTimeout(60_000);

  let correct = 0;
  let total = 0;
  const misses = [];

  test.each(CASES)('%j', async (c) => {
    const r = await classify(c.msg, c.hints);
    total++;
    const ok = c.expect.includes(r.classification);
    if (ok) correct++;
    else misses.push({ msg: c.msg, expected: c.expect, got: r.classification, conf: r.confidence });
    expect(c.expect).toContain(r.classification);
  });

  afterAll(() => {
    if (total > 0) {
      // eslint-disable-next-line no-console
      console.log(`\n[PEV classifier] accuracy: ${correct}/${total} (${Math.round(100 * correct / total)}%)`);
      if (misses.length) {
        // eslint-disable-next-line no-console
        console.log('Misses:', JSON.stringify(misses, null, 2));
      }
    }
  });
});
