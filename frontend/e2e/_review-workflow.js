export const meta = {
  name: 'owner-ux-screenshot-review',
  description: 'Fan out agents to review owner screenshots as a real user would',
  phases: [{ title: 'Review' }],
}

// args = { batches: [ [ {screen, path}, ... ], ... ] }
const batches = (args && args.batches) || []

const SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['screen', 'verdict', 'issues'],
        properties: {
          screen: { type: 'string' },
          verdict: { type: 'string', enum: ['good', 'minor', 'broken'], description: "good = looks/works right for a user; minor = small UX/polish issue; broken = clearly wrong/empty/error/crash a user would hit." },
          issues: {
            type: 'array',
            description: 'Concrete user-facing problems visible in the screenshot. Empty if none.',
            items: {
              type: 'object',
              required: ['severity', 'description'],
              properties: {
                severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

phase('Review')

const results = await parallel(batches.map((batch, i) => () =>
  agent(
    `You are a meticulous QA tester reviewing screenshots of the Sylk construction-manager iOS app (owner role), judging them as a real user would. The QA owner account is SEEDED with 4 projects (Maple Ave Deck & Patio $12k, Downtown Office Buildout $85k, Riverside Bathroom $15k, Johnson Kitchen $20k), invoices, estimates, clients, $3.2k/mo overhead, and a small team (2 workers, 1 supervisor, 1 subcontractor).\n\n` +
    `Use the Read tool to OPEN and LOOK AT each screenshot below, then judge each screen the way a paying user would:\n` +
    batch.map((b) => `- screen "${b.screen}": ${b.path}`).join('\n') + '\n\n' +
    `For EACH screen report: verdict (good / minor / broken) and a list of concrete user-facing issues. Look hard for:\n` +
    `- BROKEN: blank/empty where data should be, error messages ("couldn't load", "something went wrong"), $0 or NaN or "undefined"/"null" text, placeholder/lorem text, a screen stuck on a spinner, cut-off or overlapping content, a wrong-role or wrong screen, obviously wrong numbers.\n` +
    `- UX/polish: misaligned elements, unreadable contrast, awkward truncation, missing labels, inconsistent formatting (e.g. currency), confusing empty states.\n` +
    `Be specific and cite what you SEE. If a screen looks correct and populated, mark it "good" with no issues — do not invent problems. Return ONLY the structured object.`,
    { label: `review:batch${i + 1}`, phase: 'Review', schema: SCHEMA, agentType: 'general-purpose' }
  ).then((r) => r || { findings: [] })
))

const all = results.filter(Boolean).flatMap((r) => r.findings)
const broken = all.filter((f) => f.verdict === 'broken')
const minor = all.filter((f) => f.verdict === 'minor')
log(`reviewed ${all.length} screens — ${broken.length} broken, ${minor.length} minor, ${all.length - broken.length - minor.length} good`)
return { findings: all, broken, minor }
