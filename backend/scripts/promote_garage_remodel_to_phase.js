// One-shot: promote the legacy "Garage remodel" trade budget on the
// "John Smith Bathroom Remodel" project into a full project_phases row so
// it renders in PhaseTimeline with the same card layout as the other phases.
// Idempotent — re-running is a no-op.

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

const PROJECT_NAME = 'John Smith Bathroom Remodel';
const TRADE_NAME = 'Garage remodel';

(async () => {
  // 1. Find the project(s) with this name. Service-role bypasses RLS so we
  //    see every project; narrow by exact name match.
  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('id, name, user_id, has_phases')
    .eq('name', PROJECT_NAME);
  if (pErr) throw pErr;
  if (!projects || projects.length === 0) {
    console.error(`No project named "${PROJECT_NAME}" found.`);
    process.exit(1);
  }
  if (projects.length > 1) {
    console.log(`Found ${projects.length} projects named "${PROJECT_NAME}":`);
    projects.forEach(p => console.log(`  - id=${p.id} user_id=${p.user_id}`));
  }

  for (const project of projects) {
    console.log(`\n→ Project ${project.id}`);

    // 2. Find the trade budget row we're promoting.
    const { data: tbRows, error: tbErr } = await supabase
      .from('project_trade_budgets')
      .select('id, trade_name, budget_amount')
      .eq('project_id', project.id)
      .ilike('trade_name', TRADE_NAME);
    if (tbErr) throw tbErr;
    if (!tbRows || tbRows.length === 0) {
      console.log(`  no trade_budget "${TRADE_NAME}" on this project — skipping`);
      continue;
    }
    const tb = tbRows[0];
    const budget = parseFloat(tb.budget_amount) || 0;
    console.log(`  found trade_budget: ${tb.trade_name} budget=${budget}`);

    // 3. Skip if a phase with the same name already exists (idempotent).
    const { data: existingPhase } = await supabase
      .from('project_phases')
      .select('id, name')
      .eq('project_id', project.id)
      .ilike('name', tb.trade_name);
    if (existingPhase && existingPhase.length > 0) {
      console.log(`  phase "${tb.trade_name}" already exists (id=${existingPhase[0].id}) — skipping insert`);
    } else {
      // 4. Compute next order_index so it sorts after current phases.
      const { data: orderRows } = await supabase
        .from('project_phases')
        .select('order_index')
        .eq('project_id', project.id)
        .order('order_index', { ascending: false })
        .limit(1);
      const nextOrder = ((orderRows && orderRows[0]?.order_index) ?? -1) + 1;

      const { data: inserted, error: insErr } = await supabase
        .from('project_phases')
        .insert({
          project_id: project.id,
          name: tb.trade_name,
          order_index: nextOrder,
          planned_days: 5,
          completion_percentage: 0,
          status: 'not_started',
          budget,
          tasks: [],
          services: [],
          time_extensions: [],
        })
        .select('id, name, order_index, budget')
        .single();
      if (insErr) throw insErr;
      console.log(`  inserted phase id=${inserted.id} order_index=${inserted.order_index} budget=${inserted.budget}`);
    }

    // 5. Ensure has_phases is true and bump updated_at so clients refresh.
    if (!project.has_phases) {
      const { error: upErr } = await supabase
        .from('projects')
        .update({ has_phases: true, updated_at: new Date().toISOString() })
        .eq('id', project.id);
      if (upErr) throw upErr;
      console.log('  projects.has_phases → true');
    } else {
      await supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', project.id);
      console.log('  bumped projects.updated_at');
    }
  }

  console.log('\n✓ done');
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
