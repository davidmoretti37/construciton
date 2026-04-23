// One-shot: remove duplicate rows from daily_checklist_templates and
// labor_role_templates that were created by a now-fixed double-insert bug
// in useProjectActions.handleSaveProject. For every (project_id, title) or
// (project_id, role_name) pair with more than one active row, keep the
// earliest-created row and delete the rest. Idempotent.

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

async function dedupe(table, groupKey) {
  console.log(`\n=== ${table} ===`);
  const { data: rows, error } = await supabase
    .from(table)
    .select(`id, project_id, service_plan_id, ${groupKey}, created_at, is_active`)
    .order('created_at', { ascending: true });
  if (error) throw error;

  console.log(`  total rows in table: ${rows?.length || 0}`);

  // Only dedupe among ACTIVE rows the UI actually shows. The UI filters via
  // .eq('is_active', true) so inactive (soft-deleted) rows don't matter and
  // removing them would rewrite history unnecessarily.
  const active = (rows || []).filter(r => r.is_active !== false);
  console.log(`  active rows: ${active.length}`);

  const groups = new Map();
  for (const r of active) {
    if (!r[groupKey]) continue;
    // Group by (project OR service_plan scope, title). Using `||` so rows
    // scoped to a service plan dedupe among themselves, independent of
    // project-scoped rows.
    const scope = r.project_id || r.service_plan_id || 'none';
    const key = `${scope}::${String(r[groupKey]).trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const toDelete = [];
  let dupeGroups = 0;
  for (const [key, list] of groups.entries()) {
    if (list.length <= 1) continue;
    dupeGroups++;
    const [, ...rest] = list;
    console.log(`  dup ${key} — keep ${list[0].id}, drop ${rest.length}`);
    for (const r of rest) toDelete.push(r.id);
  }

  console.log(`  ${dupeGroups} duplicate group(s), ${toDelete.length} row(s) to delete`);

  // Extra visibility: list per-project row counts so we can spot projects
  // with many rows but zero dupes (points to near-duplicates we missed).
  const byProject = new Map();
  for (const r of active) {
    const scope = r.project_id || r.service_plan_id || 'none';
    if (!byProject.has(scope)) byProject.set(scope, []);
    byProject.get(scope).push(r[groupKey]);
  }
  for (const [scope, titles] of byProject.entries()) {
    if (titles.length >= 2) {
      console.log(`  scope ${scope}: ${titles.length} rows — titles: ${JSON.stringify(titles)}`);
    }
  }
  if (!DRY_RUN && toDelete.length > 0) {
    const { error: delErr } = await supabase.from(table).delete().in('id', toDelete);
    if (delErr) throw delErr;
    console.log(`  deleted ${toDelete.length} rows`);
  } else if (DRY_RUN) {
    console.log('  (dry-run — no deletes performed)');
  }
}

(async () => {
  await dedupe('daily_checklist_templates', 'title');
  await dedupe('labor_role_templates', 'role_name');
  console.log('\n✓ done');
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
