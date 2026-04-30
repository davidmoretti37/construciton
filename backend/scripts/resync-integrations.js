/**
 * Nightly auto-resync for connected integrations.
 *
 * Webhooks cover real-time changes (QBO entity creates/updates), but they
 * don't catch:
 *   - Deletes / archives in QB (Intuit doesn't always emit Delete events)
 *   - Refresh-token rotations that expire silently
 *   - Bulk-edited records that race-condition past webhook quotas
 *   - User changes made while our webhook endpoint was briefly down
 *
 * This script runs once nightly, loops every connected user_integrations
 * row, and triggers a fresh import. Idempotent — uses qbo_id-keyed
 * upserts, so no duplicates. Safe to re-run.
 *
 * Schedule: invoked by .github/workflows/nightly-crons.yml at 06:00 UTC.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const importHandlers = require('../src/services/tools/importHandlers');
const credentialStore = require('../src/services/mcp/credentialStore');

async function main() {
  const startedAt = Date.now();
  console.log(`[resync-integrations] start ${new Date().toISOString()}`);

  // Pull every connected integration, grouped by user.
  const { data: rows, error } = await supabase
    .from('user_integrations')
    .select('user_id, integration_type, last_synced_at')
    .eq('status', 'connected');

  if (error) {
    console.error('[resync-integrations] fetch failed:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('[resync-integrations] no connected integrations — nothing to do');
    return;
  }

  // Stats accumulators
  const totals = {
    qbo: { users: 0, clients_created: 0, clients_updated: 0, subs_created: 0, subs_updated: 0, items_created: 0, items_updated: 0, errors: 0 },
    monday: { users: 0, errors: 0 },
  };

  for (const row of rows) {
    try {
      if (row.integration_type === 'qbo') {
        await resyncQbo(row.user_id, totals);
      } else if (row.integration_type === 'monday') {
        // Monday boards are highly variable per-user — we don't auto-resync
        // without an explicit board_id + mapping. Skip silently for now.
        // Future: track per-user "default Monday board for projects" and
        // resync that.
        continue;
      }
    } catch (e) {
      console.error(`[resync-integrations] user=${row.user_id} type=${row.integration_type}:`, e.message);
      totals[row.integration_type].errors++;
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[resync-integrations] complete in ${elapsed}s`);
  console.log(JSON.stringify(totals, null, 2));
}

/**
 * Re-import QBO clients + subs + service catalog. We deliberately skip
 * heavier imports (invoice history, expense history) at nightly cadence —
 * those grow unboundedly and the webhook covers most updates anyway.
 * Run those manually via chat when the user wants a deep re-sync.
 */
async function resyncQbo(userId, totals) {
  totals.qbo.users++;

  // Verify we still have a usable credential before kicking off.
  const cred = await credentialStore.getCredential(userId, 'qbo');
  if (!cred?.accessToken) {
    console.warn(`[resync-integrations] qbo skip user=${userId}: no credential`);
    return;
  }
  if (!cred.metadata?.realmId) {
    console.warn(`[resync-integrations] qbo skip user=${userId}: no realmId`);
    return;
  }

  const r1 = await importHandlers.import_qbo_clients(userId, {});
  if (r1?.error) {
    console.warn(`[resync-integrations] qbo clients user=${userId}:`, r1.error);
    totals.qbo.errors++;
  } else {
    totals.qbo.clients_created += r1.created || 0;
    totals.qbo.clients_updated += r1.updated || 0;
  }

  const r2 = await importHandlers.import_qbo_subcontractors(userId, { only_1099: true });
  if (r2?.error) {
    console.warn(`[resync-integrations] qbo subs user=${userId}:`, r2.error);
    totals.qbo.errors++;
  } else {
    totals.qbo.subs_created += r2.created || 0;
    totals.qbo.subs_updated += r2.updated || 0;
  }

  const r3 = await importHandlers.import_qbo_service_catalog(userId, {});
  if (r3?.error) {
    console.warn(`[resync-integrations] qbo items user=${userId}:`, r3.error);
    totals.qbo.errors++;
  } else {
    totals.qbo.items_created += r3.created || 0;
    totals.qbo.items_updated += r3.updated || 0;
  }

  console.log(`[resync-integrations] qbo user=${userId} clients=+${r1?.created || 0}/~${r1?.updated || 0} subs=+${r2?.created || 0}/~${r2?.updated || 0} items=+${r3?.created || 0}/~${r3?.updated || 0}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[resync-integrations] fatal:', err);
    process.exit(1);
  });
