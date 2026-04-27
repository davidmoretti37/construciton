// Per-user AI spend tracking + kill switch.
//   - rolling monthly counter in `user_api_usage`
//   - default cap from MONTHLY_AI_BUDGET_CENTS env (default 5000 = $50)
//   - per-user override via profiles.monthly_ai_budget_cents (NULLable)
//   - middleware-friendly check before chat routes
//   - upsert from agentService after each LLM call

const { adminSupabase } = require('./userSupabaseClient');
const logger = require('../utils/logger');

const DEFAULT_CAP_CENTS = parseInt(process.env.MONTHLY_AI_BUDGET_CENTS, 10) || 5000;

const PRICING = {
  'claude-haiku-4.5': { input: 0.80, output: 4.00 },
  'claude-sonnet-4.5': { input: 3.00, output: 15.00 },
};

function costForUsage(model, inputTokens, outputTokens) {
  const p = PRICING[model] || PRICING['claude-haiku-4.5'];
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return Math.ceil(usd * 100); // cents
}

function currentMonthStart() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function getOrInitUsage(userId) {
  const monthStart = currentMonthStart();
  const { data: row } = await adminSupabase
    .from('user_api_usage')
    .select('user_id, month_start, input_tokens, output_tokens, request_count, cost_cents, hard_blocked_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) {
    const { data: inserted } = await adminSupabase
      .from('user_api_usage')
      .insert({ user_id: userId, month_start: monthStart })
      .select()
      .single();
    return inserted;
  }
  // Roll over month if the stored window is stale.
  if (row.month_start !== monthStart) {
    const { data: rolled } = await adminSupabase
      .from('user_api_usage')
      .update({
        month_start: monthStart,
        input_tokens: 0,
        output_tokens: 0,
        request_count: 0,
        cost_cents: 0,
        hard_blocked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();
    return rolled || row;
  }
  return row;
}

async function getCapCents(userId) {
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('monthly_ai_budget_cents')
    .eq('id', userId)
    .maybeSingle();
  const override = profile?.monthly_ai_budget_cents;
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_CAP_CENTS;
}

// Express middleware: 402 if the user is over their monthly cap.
async function enforceMonthlyBudget(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return next();
    const [usage, cap] = await Promise.all([getOrInitUsage(userId), getCapCents(userId)]);
    if (usage && usage.cost_cents >= cap) {
      logger.warn(`[aiBudget] user ${userId} over cap: ${usage.cost_cents}c >= ${cap}c`);
      return res.status(402).json({
        error: 'Monthly AI usage limit reached.',
        cap_cents: cap,
        used_cents: usage.cost_cents,
      });
    }
    req.aiUsage = { used_cents: usage?.cost_cents || 0, cap_cents: cap };
    next();
  } catch (err) {
    // Fail-open on tracking errors — don't block chat if our tracker glitches.
    logger.error('[aiBudget] enforce error (fail-open):', err);
    next();
  }
}

// Atomic increment after each LLM call. Fire-and-forget — we already let the
// middleware gate the next request based on the post-update row.
async function recordUsage(userId, model, inputTokens, outputTokens) {
  if (!userId) return;
  const cents = costForUsage(model, inputTokens, outputTokens);
  try {
    // Ensure the row exists (rolls over month if needed).
    await getOrInitUsage(userId);
    // Atomic add via SQL — RLS-bypassing service role.
    await adminSupabase.rpc('increment_user_api_usage', {
      p_user_id: userId,
      p_input: inputTokens,
      p_output: outputTokens,
      p_cost_cents: cents,
    }).then(({ error }) => {
      if (error && error.code === 'PGRST202') {
        // RPC missing — fall back to read-modify-write.
        return fallbackIncrement(userId, inputTokens, outputTokens, cents);
      }
      if (error) logger.error('[aiBudget] rpc error:', error);
    });
  } catch (err) {
    logger.error('[aiBudget] record error:', err);
  }
}

async function fallbackIncrement(userId, inputTokens, outputTokens, cents) {
  const { data: row } = await adminSupabase
    .from('user_api_usage')
    .select('input_tokens, output_tokens, request_count, cost_cents')
    .eq('user_id', userId)
    .single();
  if (!row) return;
  await adminSupabase
    .from('user_api_usage')
    .update({
      input_tokens: row.input_tokens + inputTokens,
      output_tokens: row.output_tokens + outputTokens,
      request_count: row.request_count + 1,
      cost_cents: row.cost_cents + cents,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

module.exports = {
  enforceMonthlyBudget,
  recordUsage,
  costForUsage,
  DEFAULT_CAP_CENTS,
};
