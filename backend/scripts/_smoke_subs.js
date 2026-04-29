#!/usr/bin/env node
/**
 * End-to-end smoke test for the subcontractor module.
 * Exercises the full stack against real prod DB via service-role.
 * Cleans up everything it creates.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const subOrgService = require('../src/services/subOrgService');
const complianceService = require('../src/services/complianceService');
const engagementService = require('../src/services/engagementService');
const biddingService = require('../src/services/biddingService');
const invoiceService = require('../src/services/invoiceService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SMOKE_TAX_ID = '900' + Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
const SMOKE_LEGAL_NAME = 'SMOKE_TEST_DELETE_ME ' + Date.now();
let createdSubId = null;
let createdEngagementId = null;
let createdBidRequestId = null;
let createdInvoiceId = null;

const log = (label, ok, detail) => {
  const tag = ok ? '✓' : '✗';
  console.log(`${tag} ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  try {
    // 0. Pick a real GC owner
    const { data: ownerProfile } = await supabase
      .from('profiles').select('id, business_name').eq('role', 'owner').limit(1).maybeSingle();
    if (!ownerProfile) throw new Error('No owner profile found');
    const gcUserId = ownerProfile.id;
    log('Found owner', true, `${ownerProfile.business_name || gcUserId.slice(0, 8)}`);

    // 1. Schema sanity — tables, doc types, policies, backfilled sub_orgs
    const { count: subOrgCount } = await supabase.from('sub_organizations').select('*', { count: 'exact', head: true });
    const { count: docTypeCount } = await supabase.from('compliance_doc_types').select('*', { count: 'exact', head: true });
    const { count: policyCount } = await supabase.from('compliance_policies').select('*', { count: 'exact', head: true });
    log('sub_organizations table',  subOrgCount   >= 16, `${subOrgCount} rows`);
    log('compliance_doc_types seed', docTypeCount === 19, `${docTypeCount} types`);
    log('compliance_policies seed',  policyCount  >= 64, `${policyCount} policies`);

    // 2. addSubByGc — first call creates new + token
    const first = await subOrgService.addSubByGc({
      gcUserId,
      legalName: SMOKE_LEGAL_NAME,
      primaryEmail: 'smoke@delete.me',
      taxId: SMOKE_TAX_ID,
    });
    createdSubId = first.sub_organization.id;
    log('addSubByGc creates new sub', !first.was_existing && !!first.action_token);
    log('First-claim token issued', !!first.action_token?.raw && first.action_token?.scope === 'first_claim');

    // 3. Dedup — second call with same EIN finds existing, no new token
    const second = await subOrgService.addSubByGc({
      gcUserId,
      legalName: 'Different Name LLC',
      primaryEmail: 'other@example.com',
      taxId: SMOKE_TAX_ID,
    });
    log('Dedup by EIN works', second.was_existing && second.sub_organization.id === createdSubId && !second.action_token);

    // 4. Action token roundtrip
    const looked = await subOrgService.lookupActionToken(first.action_token.raw);
    log('Action token lookup works', !!looked && looked.sub_organization_id === createdSubId);
    await subOrgService.consumeActionToken(looked.id);
    const reused = await subOrgService.lookupActionToken(first.action_token.raw);
    log('Consumed token rejects reuse', reused === null);

    // 5. Compliance computation on a sub with no docs (find blockers)
    // Need a real project to make engagement; pick one of the GC's
    const { data: project } = await supabase
      .from('projects').select('id').eq('user_id', gcUserId).limit(1).maybeSingle();
    if (project) {
      const eng = await engagementService.createEngagement({
        gcUserId, subOrganizationId: createdSubId, projectId: project.id,
        trade: 'smoke-trade', contractAmount: 1234, paymentTerms: 'net_30',
        initialStatus: 'invited',
      });
      createdEngagementId = eng.id;
      log('Engagement created', !!eng.id);

      const compliance = await complianceService.computeForEngagement(eng.id);
      log('Compliance computed', typeof compliance.passes === 'boolean',
          `passes=${compliance.passes} blockers=${compliance.blockers.length} warnings=${compliance.warnings.length}`);
      log('Empty-vault sub fails compliance', compliance.passes === false && compliance.blockers.length > 0);

      // 6. Compliance doc record (supersedes-aware)
      const doc1 = await complianceService.recordDocument({
        subOrganizationId: createdSubId,
        docType: 'coi_gl',
        fileUrl: `${createdSubId}/coi_gl/smoke1.pdf`,
        expiresAt: '2026-12-31',
        endorsements: ['CG2010', 'CG2037'],
        coverageLimits: { each_occurrence: 1500000, aggregate: 3000000 },
        uploadedVia: 'gc_upload',
        uploadedBy: gcUserId,
      });
      log('compliance_documents.recordDocument', !!doc1.id);

      const doc2 = await complianceService.recordDocument({
        subOrganizationId: createdSubId,
        docType: 'coi_gl',
        fileUrl: `${createdSubId}/coi_gl/smoke2.pdf`,
        expiresAt: '2027-12-31',
        endorsements: ['CG2010', 'CG2037'],
        coverageLimits: { each_occurrence: 1500000, aggregate: 3000000 },
        uploadedVia: 'gc_upload',
        uploadedBy: gcUserId,
      });
      const { data: prior } = await supabase
        .from('compliance_documents').select('status, superseded_by').eq('id', doc1.id).single();
      log('Supersedes chain works', prior.status === 'superseded' && prior.superseded_by === doc2.id);

      // After upload + endorsements, compliance should improve
      const compliance2 = await complianceService.computeForEngagement(eng.id);
      log('Compliance recomputes after doc upload',
          compliance2.blockers.length < compliance.blockers.length,
          `blockers ${compliance.blockers.length} → ${compliance2.blockers.length}`);

      // 7. Bidding flow
      const br = await biddingService.createBidRequest({
        gcUserId, projectId: project.id, trade: 'smoke-trade',
        scopeSummary: 'smoke', paymentTerms: 'net_30',
      });
      createdBidRequestId = br.id;
      await biddingService.inviteSubs({ bidRequestId: br.id, gcUserId, subOrgIds: [createdSubId] });
      const bid = await biddingService.submitBid({
        bidRequestId: br.id, subOrganizationId: createdSubId, amount: 5000,
      });
      log('Bidding round-trip', !!bid.id && bid.status === 'submitted');

      // 8. Invoice + payment (without sub auth_user_id, skip the createInvoice call —
      //    just verify recordPayment works directly on the engagement)
      const payment = await invoiceService.recordPayment({
        engagementId: eng.id, gcUserId,
        amount: 500, paidAt: '2026-04-29', method: 'check', reference: 'SMK-001',
      });
      log('Payment recorded', !!payment.id);

      const balance = await invoiceService.getEngagementBalance({
        engagementId: eng.id, callerUserId: gcUserId,
      });
      log('Balance computed', balance && balance.paid_amount === 500,
          `contract=$${balance.contract_amount} paid=$${balance.paid_amount}`);
    } else {
      log('Skipping engagement/bid/invoice tests', true, 'no project for this owner');
    }

    // 9. Tool registry check
    const reg = require('../src/services/tools/registry');
    const subTools = Object.keys(reg.TOOL_METADATA).filter((t) => reg.TOOL_METADATA[t].category === 'subs');
    log('14 sub tools in registry', subTools.length === 14, `found ${subTools.length}`);

    // 10. Storage bucket
    const { data: buckets } = await supabase.storage.listBuckets();
    const hasBucket = (buckets || []).some((b) => b.id === 'compliance-documents');
    log('compliance-documents bucket exists', hasBucket);

    console.log('\n— Cleanup —');
    if (createdInvoiceId) await supabase.from('sub_invoices').delete().eq('id', createdInvoiceId);
    if (createdBidRequestId) {
      await supabase.from('sub_bids').delete().eq('bid_request_id', createdBidRequestId);
      await supabase.from('bid_request_invitations').delete().eq('bid_request_id', createdBidRequestId);
      await supabase.from('bid_requests').delete().eq('id', createdBidRequestId);
    }
    if (createdEngagementId) {
      await supabase.from('payment_records').delete().eq('engagement_id', createdEngagementId);
      await supabase.from('engagement_compliance_links').delete().eq('engagement_id', createdEngagementId);
      await supabase.from('subcontracts').delete().eq('engagement_id', createdEngagementId);
      await supabase.from('sub_engagements').delete().eq('id', createdEngagementId);
    }
    if (createdSubId) {
      await supabase.from('compliance_documents').delete().eq('sub_organization_id', createdSubId);
      await supabase.from('sub_action_tokens').delete().eq('sub_organization_id', createdSubId);
      await supabase.from('sub_organizations').delete().eq('id', createdSubId);
    }
    log('Cleanup completed', true);

    if (process.exitCode === 1) {
      console.log('\n❌ One or more checks failed.');
      process.exit(1);
    }
    console.log('\n✅ All smoke checks passed.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Smoke test error:', err.message);
    console.error(err.stack);

    // Best-effort cleanup
    try {
      if (createdEngagementId) await supabase.from('sub_engagements').delete().eq('id', createdEngagementId);
      if (createdBidRequestId) await supabase.from('bid_requests').delete().eq('id', createdBidRequestId);
      if (createdSubId) await supabase.from('sub_organizations').delete().eq('id', createdSubId);
    } catch (_) {}
    process.exit(1);
  }
})();
