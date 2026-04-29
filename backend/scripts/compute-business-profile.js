#!/usr/bin/env node
/**
 * P10 — auto business profile.
 *
 * Once per owner (lazily, regenerate weekly): aggregate data signals
 * about their business, hand them to Haiku, and store the resulting
 * paragraph as `profiles.auto_business_profile`.
 *
 * The agent's system prompt injects this as the "ABOUT THIS BUSINESS"
 * section, baked into the cached system block — so Foreman starts every
 * conversation already knowing the business shape, instead of cold-
 * starting and discovering everything via tools.
 *
 * Signals collected per owner (no PII beyond what they've already entered):
 *   - profile basics: business_name, role, locale
 *   - team size + roles
 *   - active project count, types (from project names), avg size
 *   - service plan presence (recurring vs project-based)
 *   - top expense categories
 *   - recent client names (by recency, capped)
 *   - typical project duration / margin (already computed in P9 patterns)
 *
 * One Haiku call per owner produces a 4-6 sentence paragraph. Cost:
 * ~$0.001/owner/run. Run weekly (the data shape doesn't change daily).
 *
 * Usage:
 *   node backend/scripts/compute-business-profile.js               # all owners
 *   node backend/scripts/compute-business-profile.js --user <uuid>
 *   node backend/scripts/compute-business-profile.js --dry         # print, don't write
 *   node backend/scripts/compute-business-profile.js --force       # regenerate even if recent
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function flag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const ONE_USER = flag('user', null);

const REGENERATE_AFTER_DAYS = 7;

async function listOwners() {
  if (ONE_USER) {
    const { data } = await supabase.from('profiles').select('id, business_name, role, owner_id, language, auto_business_profile_updated_at').eq('id', ONE_USER).maybeSingle();
    return data ? [data] : [];
  }
  const { data } = await supabase
    .from('profiles')
    .select('id, business_name, role, owner_id, language, auto_business_profile_updated_at')
    .eq('role', 'owner')
    .is('owner_id', null);
  return data || [];
}

function isStale(updatedAt) {
  if (!updatedAt) return true;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs > REGENERATE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Pull a compact set of business signals — never raw PII, never more
 * than the LLM needs to write a 4-6 sentence profile.
 */
async function collectSignals(ownerId) {
  const sig = { ownerId };

  // Team
  const { data: team } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('owner_id', ownerId);
  sig.team_size = (team?.length || 0) + 1; // +1 for owner themselves
  sig.team_roles = Array.from(new Set((team || []).map(p => p.role).filter(Boolean)));

  const { data: workers } = await supabase
    .from('workers')
    .select('id, is_active')
    .eq('owner_id', ownerId);
  sig.worker_count = workers?.filter(w => w.is_active).length || 0;

  // Projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, start_date, end_date, contract_amount')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(50);
  sig.total_projects = projects?.length || 0;
  sig.active_projects = (projects || []).filter(p => p.status === 'active').length;
  sig.recent_project_names = (projects || []).slice(0, 8).map(p => p.name).filter(Boolean);
  const amounts = (projects || []).map(p => Number(p.contract_amount)).filter(a => Number.isFinite(a) && a > 0);
  if (amounts.length) {
    sig.avg_contract = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }

  // Service plans
  const { count: planCount } = await supabase
    .from('service_plans')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);
  sig.has_recurring_services = (planCount || 0) > 0;

  // Top expense categories (last 90 days)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: txns } = await supabase
    .from('transactions')
    .select('category, amount, type')
    .eq('user_id', ownerId)
    .eq('type', 'expense')
    .gte('created_at', since)
    .limit(500);
  const totals = {};
  for (const t of txns || []) {
    const c = t.category || 'misc';
    totals[c] = (totals[c] || 0) + Number(t.amount || 0);
  }
  sig.top_expense_categories = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // Recent client names
  const { data: clients } = await supabase
    .from('clients')
    .select('full_name')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(8);
  sig.recent_clients = (clients || []).map(c => c.full_name).filter(Boolean);

  // Pull computed patterns (P9) so the LLM can reference them
  const { data: patterns } = await supabase
    .from('user_memory_facts')
    .select('predicate, object')
    .eq('user_id', ownerId)
    .eq('kind', 'pattern')
    .eq('source', 'pattern_computed');
  sig.patterns = patterns || [];

  return sig;
}

async function generateProfile(profile, sig) {
  const businessName = profile.business_name || 'this business';
  const language = profile.language || 'en';
  const langName = language === 'pt-BR' ? 'Brazilian Portuguese' : language === 'es' ? 'Spanish' : 'English';

  const prompt = `Write a 4-6 sentence profile of ${businessName}, the kind of context an experienced ops manager would have memorized after a month working there.

DATA:
- Team: ${sig.team_size} profile members + ${sig.worker_count} active workers
- Team roles: ${sig.team_roles?.join(', ') || 'owner only'}
- Projects: ${sig.total_projects} total, ${sig.active_projects} active
- Avg contract: ${sig.avg_contract ? `$${sig.avg_contract.toLocaleString()}` : 'unknown'}
- Recent project names (use these to infer business type): ${(sig.recent_project_names || []).join(' | ') || 'none'}
- Recurring services: ${sig.has_recurring_services ? 'yes (has service plans)' : 'no (project-based)'}
- Top recent expense categories: ${(sig.top_expense_categories || []).join(', ') || 'none'}
- Recent clients (anonymize if you mention): ${(sig.recent_clients || []).slice(0, 3).join(', ') || 'none'}
${sig.patterns?.length ? `- Computed patterns:\n  ${sig.patterns.map(p => `  - ${p.predicate} = ${p.object}`).join('\n')}` : ''}

WRITE THE PROFILE:
- Plain prose, NO bullet points
- 4-6 sentences max
- Infer the business TYPE from project names (e.g. "bathroom remodels and toilet installations" suggests residential plumbing/remodel)
- Lead with the type of business
- Mention typical project size, team scale, and any recurring-vs-project-based mix
- If a pattern exists, weave it in naturally ("typically completes projects in N days", "averages X% margin")
- Skip platitudes like "successful" or "well-organized" — stick to what's measurable
- Write in ${langName}
- Output ONLY the paragraph, no preamble`;

  const SDK = require('@anthropic-ai/sdk');
  const Anthropic = SDK.default || SDK.Anthropic || SDK;
  const useSDK = !!process.env.ANTHROPIC_API_KEY;

  let text = '';
  if (useSDK) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 350,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      });
      text = (resp.content || []).filter(b => b?.type === 'text').map(b => b.text || '').join('');
    } catch (e) {
      console.warn(`  SDK path failed (${e.message}), falling back to OpenRouter`);
    }
  }
  if (!text) {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        max_tokens: 350,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    text = json.choices?.[0]?.message?.content || '';
  }
  return text.trim().slice(0, 1200);
}

async function main() {
  console.log(`P10 business profile cron — ${DRY ? 'DRY RUN' : 'APPLY'}${FORCE ? ' (force regen)' : ''}`);
  const owners = await listOwners();
  console.log(`  owners: ${owners.length}`);

  let processed = 0;
  let written = 0;
  let skippedFresh = 0;
  let skippedNoData = 0;

  for (const profile of owners) {
    if (!FORCE && !isStale(profile.auto_business_profile_updated_at)) {
      skippedFresh++;
      continue;
    }
    processed++;
    try {
      const sig = await collectSignals(profile.id);
      // Don't bother generating for users with essentially no data —
      // the profile would be generic and add prompt bloat for nothing.
      if (sig.total_projects === 0 && sig.worker_count === 0 && (sig.recent_clients?.length || 0) === 0) {
        skippedNoData++;
        continue;
      }
      const text = await generateProfile(profile, sig);
      if (!text || text.length < 50) {
        console.warn(`  ${profile.id.slice(0,8)}…: profile generation produced empty/short output, skipping`);
        continue;
      }
      console.log(`  ${profile.id.slice(0,8)}… (${profile.business_name || '(unnamed)'}): ${text.slice(0, 80)}…`);
      if (DRY) continue;
      const { error } = await supabase
        .from('profiles')
        .update({
          auto_business_profile: text,
          auto_business_profile_updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (error) {
        console.warn(`  ✗ update failed: ${error.message}`);
      } else {
        written++;
      }
    } catch (e) {
      console.warn(`  ${profile.id.slice(0,8)}…: error: ${e.message}`);
    }
  }

  console.log('\nDone.');
  console.log(`  processed:        ${processed}`);
  console.log(`  skipped (fresh):  ${skippedFresh}`);
  console.log(`  skipped (no data):${skippedNoData}`);
  console.log(`  ${DRY ? 'would write' : 'written'}: ${DRY ? processed - skippedNoData : written}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
