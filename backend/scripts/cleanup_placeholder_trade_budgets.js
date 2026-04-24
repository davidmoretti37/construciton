// One-shot: remove orphan placeholder trade_budget rows like "Phase 7"
// that were auto-seeded from a temporary placeholder phase name and never
// cleaned up when the user renamed/removed the phase. We only delete rows
// that satisfy ALL of:
//   1. trade_name matches /^Phase \d+$/  (the placeholder pattern)
//   2. no project_phases row for the same project has that exact name (case-
//      insensitive) — i.e. the placeholder phase no longer exists
// Pass --dry-run to preview.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes('--dry-run');
const PLACEHOLDER = /^\s*Phase\s+\d+\s*$/i;

(async () => {
  // 1. Pull every trade_budget whose name looks like a placeholder.
  const { data: tbs, error: tbErr } = await supabase
    .from('project_trade_budgets')
    .select('id, project_id, trade_name, budget_amount');
  if (tbErr) throw tbErr;

  const candidates = (tbs || []).filter(t => t.trade_name && PLACEHOLDER.test(t.trade_name));
  console.log(`placeholder-named trade_budgets: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('nothing to do');
    return;
  }

  // 2. For each candidate, check if a matching phase still exists.
  const toDelete = [];
  for (const tb of candidates) {
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id, name')
      .eq('project_id', tb.project_id)
      .ilike('name', tb.trade_name);
    const matchExists = (phases || []).some(
      p => String(p.name || '').trim().toLowerCase() === tb.trade_name.trim().toLowerCase()
    );
    if (matchExists) {
      console.log(`  keep  tb=${tb.id} "${tb.trade_name}" (matching phase exists in project ${tb.project_id})`);
    } else {
      console.log(`  drop  tb=${tb.id} "${tb.trade_name}" budget=${tb.budget_amount} (orphan in project ${tb.project_id})`);
      toDelete.push(tb.id);
    }
  }

  console.log(`\n${toDelete.length} row(s) to delete`);
  if (!DRY_RUN && toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('project_trade_budgets')
      .delete()
      .in('id', toDelete);
    if (delErr) throw delErr;
    console.log('deleted');
  } else if (DRY_RUN) {
    console.log('(dry-run — no deletes performed)');
  }
})().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
