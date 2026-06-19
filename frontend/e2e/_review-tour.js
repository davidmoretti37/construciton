export const meta = {
  name: 'owner-ux-review-tour',
  description: 'Review owner tour screenshots as a real user would',
  phases: [{ title: 'Review' }],
}

const batches = [[{"screen": "addService", "path": "/tmp/owner-qa-shots/tour-addService.png"}, {"screen": "arAging", "path": "/tmp/owner-qa-shots/tour-arAging.png"}, {"screen": "bankConnection", "path": "/tmp/owner-qa-shots/tour-bankConnection.png"}, {"screen": "changeLanguage", "path": "/tmp/owner-qa-shots/tour-changeLanguage.png"}, {"screen": "clients", "path": "/tmp/owner-qa-shots/tour-clients.png"}], [{"screen": "contractorPayments", "path": "/tmp/owner-qa-shots/tour-contractorPayments.png"}, {"screen": "contracts", "path": "/tmp/owner-qa-shots/tour-contracts.png"}, {"screen": "editBusinessInfo", "path": "/tmp/owner-qa-shots/tour-editBusinessInfo.png"}, {"screen": "estimateBuilder", "path": "/tmp/owner-qa-shots/tour-estimateBuilder.png"}, {"screen": "estimatesDetail", "path": "/tmp/owner-qa-shots/tour-estimatesDetail.png"}], [{"screen": "financialReport", "path": "/tmp/owner-qa-shots/tour-financialReport.png"}, {"screen": "integrations", "path": "/tmp/owner-qa-shots/tour-integrations.png"}, {"screen": "invoiceBuilder", "path": "/tmp/owner-qa-shots/tour-invoiceBuilder.png"}, {"screen": "invoiceTemplate", "path": "/tmp/owner-qa-shots/tour-invoiceTemplate.png"}, {"screen": "invoicesDetail", "path": "/tmp/owner-qa-shots/tour-invoicesDetail.png"}], [{"screen": "manualProjectCreate", "path": "/tmp/owner-qa-shots/tour-manualProjectCreate.png"}, {"screen": "notificationSettings", "path": "/tmp/owner-qa-shots/tour-notificationSettings.png"}, {"screen": "notifications", "path": "/tmp/owner-qa-shots/tour-notifications.png"}, {"screen": "ownerDashboard", "path": "/tmp/owner-qa-shots/tour-ownerDashboard.png"}, {"screen": "ownerProjects", "path": "/tmp/owner-qa-shots/tour-ownerProjects.png"}], [{"screen": "ownerSettings", "path": "/tmp/owner-qa-shots/tour-ownerSettings.png"}, {"screen": "ownerWorkers", "path": "/tmp/owner-qa-shots/tour-ownerWorkers.png"}, {"screen": "payrollSummary", "path": "/tmp/owner-qa-shots/tour-payrollSummary.png"}, {"screen": "pictures", "path": "/tmp/owner-qa-shots/tour-pictures.png"}, {"screen": "projectDetail", "path": "/tmp/owner-qa-shots/tour-projectDetail.png"}], [{"screen": "projectDocuments", "path": "/tmp/owner-qa-shots/tour-projectDocuments.png"}, {"screen": "subscriptionSettings", "path": "/tmp/owner-qa-shots/tour-subscriptionSettings.png"}, {"screen": "supervisorDetail", "path": "/tmp/owner-qa-shots/tour-supervisorDetail.png"}, {"screen": "taxSummary", "path": "/tmp/owner-qa-shots/tour-taxSummary.png"}, {"screen": "work", "path": "/tmp/owner-qa-shots/tour-work.png"}], [{"screen": "workerDetailHistory", "path": "/tmp/owner-qa-shots/tour-workerDetailHistory.png"}]];

const SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: { type: 'array', items: {
      type: 'object',
      required: ['screen','verdict','issues'],
      properties: {
        screen: { type: 'string' },
        verdict: { type: 'string', enum: ['good','minor','broken'] },
        issues: { type: 'array', items: {
          type: 'object', required: ['severity','description'],
          properties: { severity: { type: 'string', enum: ['critical','major','minor'] }, description: { type: 'string' } }
        }}
      }
    }}
  }
}

phase('Review')
const results = await parallel(batches.map((batch, i) => () =>
  agent(
    'You are a meticulous QA tester reviewing iPhone screenshots of the Sylk construction-manager app (owner role), judging each as a paying user would. The account is SEEDED: 4 projects (Maple Ave Deck \u0026 Patio $12k, Downtown Office Buildout $85k, Riverside Bathroom $15k, Johnson Kitchen $20k), invoices, estimates, clients, $3.2k/mo overhead, team (2 workers, 1 supervisor, 1 sub). USE THE Read TOOL to open and LOOK at each screenshot:\n' +
    batch.map((b) => '- screen "' + b.screen + '": ' + b.path).join('\n') + '\n\n' +
    'For EACH screen return verdict (good/minor/broken) + concrete issues. BROKEN = blank where data should be, error text ("couldn\'t load"), $0/NaN/undefined/null shown, placeholder text, stuck spinner, cut-off/overlapping content, wrong screen, obviously wrong numbers. minor = polish (alignment, contrast, truncation, inconsistent currency format). good = looks correct + populated. Cite what you SEE; do not invent problems. Return ONLY the structured object.',
    { label: 'review:b' + (i+1), phase: 'Review', schema: SCHEMA, agentType: 'general-purpose' }
  ).then((r) => r || { findings: [] })
))
const all = results.filter(Boolean).flatMap((r) => r.findings)
const broken = all.filter((f) => f.verdict === 'broken')
const minor = all.filter((f) => f.verdict === 'minor')
log('reviewed ' + all.length + ' screens: ' + broken.length + ' broken, ' + minor.length + ' minor')
return { findings: all, broken, minor }
