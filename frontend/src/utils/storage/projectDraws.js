import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';

/**
 * Fetch the draw schedule for a project (one schedule per project).
 * Returns null if there isn't one yet.
 *   { schedule: { id, retainage_percent }, items: [...], summary: { drawn_to_date, paid_to_date, ... } }
 */
export const fetchDrawSchedule = async (projectId) => {
  if (!projectId) return null;
  try {
    const { data: schedule } = await supabase
      .from('draw_schedules')
      .select('id, retainage_percent')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!schedule) return null;

    const [{ data: items }, { data: progress }] = await Promise.all([
      supabase
        .from('draw_schedule_items')
        .select('id, order_index, description, percent_of_contract, fixed_amount, phase_id, trigger_type, status, invoice_id')
        .eq('schedule_id', schedule.id)
        .order('order_index'),
      supabase
        .from('draw_schedule_progress')
        .select('contract_amount, drawn_to_date, paid_to_date, draws_billed, draws_total')
        .eq('schedule_id', schedule.id)
        .single(),
    ]);

    const invoiceIds = (items || []).map((i) => i.invoice_id).filter(Boolean);
    let invoiceMap = {};
    if (invoiceIds.length > 0) {
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, amount_paid, due_date, paid_date')
        .in('id', invoiceIds);
      (invs || []).forEach((inv) => { invoiceMap[inv.id] = inv; });
    }

    const contract = parseFloat(progress?.contract_amount || 0);
    const enrichedItems = (items || []).map((it) => {
      const pct = it.percent_of_contract != null ? parseFloat(it.percent_of_contract) : null;
      const fixed = it.fixed_amount != null ? parseFloat(it.fixed_amount) : null;
      const computed = pct != null ? contract * pct / 100 : (fixed || 0);
      return {
        id: it.id,
        order_index: it.order_index,
        description: it.description,
        percent_of_contract: pct,
        fixed_amount: fixed,
        phase_id: it.phase_id,
        trigger_type: it.trigger_type,
        status: it.status,
        invoice_id: it.invoice_id,
        invoice: it.invoice_id ? (invoiceMap[it.invoice_id] || null) : null,
        amount: Number(computed.toFixed(2)),
      };
    });

    return {
      schedule: {
        id: schedule.id,
        retainage_percent: parseFloat(schedule.retainage_percent || 0),
      },
      items: enrichedItems,
      summary: {
        contract_amount: contract,
        drawn_to_date: parseFloat(progress?.drawn_to_date || 0),
        paid_to_date: parseFloat(progress?.paid_to_date || 0),
        draws_billed: progress?.draws_billed || 0,
        draws_total: progress?.draws_total || 0,
      },
    };
  } catch (e) {
    console.error('[projectDraws] fetch error:', e);
    return null;
  }
};

/**
 * Replace the draw schedule for a project. Non-destructive: passing an
 * empty/null `payload.items` deletes the schedule entirely (so the
 * "Bill in draws?" toggle going from on → off cleans up).
 *
 * payload shape:
 *   {
 *     enabled: boolean,
 *     retainage_percent: number,   // 0..20
 *     items: Array<{
 *       id?: string,                // existing item UUID (preserved on edit)
 *       description: string,
 *       percent_of_contract?: number,
 *       fixed_amount?: number,
 *       phase_id?: string|null,
 *     }>,
 *   }
 *
 * Returns { ok: true, schedule, items } or { ok: false, error }.
 */
export const upsertDrawSchedule = async (projectId, payload) => {
  if (!projectId) return { ok: false, error: 'Missing projectId' };
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { ok: false, error: 'Not authenticated' };

    const enabled = payload && payload.enabled !== false;
    const items = Array.isArray(payload?.items) ? payload.items : [];

    // Find existing schedule (one per project)
    const { data: existing } = await supabase
      .from('draw_schedules')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    // Disabled OR no items → wipe schedule and return
    if (!enabled || items.length === 0) {
      if (existing?.id) {
        await supabase.from('draw_schedules').delete().eq('id', existing.id).eq('user_id', userId);
      }
      return { ok: true, schedule: null, items: [] };
    }

    // Validate items: exactly one of percent / fixed, and trigger_type
    // points at a real phase if it's phase_completion.
    for (const it of items) {
      const hasPct = it.percent_of_contract != null && it.percent_of_contract !== '';
      const hasFixed = it.fixed_amount != null && it.fixed_amount !== '';
      if (hasPct === hasFixed) {
        return { ok: false, error: `Each draw needs exactly one of % or fixed amount (check "${it.description || 'unnamed'}").` };
      }
      const trig = it.trigger_type || (it.phase_id ? 'phase_completion' : 'manual');
      if (trig === 'phase_completion' && !it.phase_id) {
        return { ok: false, error: `"${it.description || 'unnamed'}" is set to fire on a phase completion but no phase is linked.` };
      }
    }

    // Upsert the schedule row (insert if missing, update retainage otherwise)
    let scheduleId = existing?.id;
    if (!scheduleId) {
      const { data: created, error: createErr } = await supabase
        .from('draw_schedules')
        .insert({
          project_id: projectId,
          user_id: userId,
          retainage_percent: parseFloat(payload?.retainage_percent || 0),
        })
        .select('id')
        .single();
      if (createErr) return { ok: false, error: createErr.message };
      scheduleId = created.id;
    } else {
      await supabase
        .from('draw_schedules')
        .update({ retainage_percent: parseFloat(payload?.retainage_percent || 0) })
        .eq('id', scheduleId)
        .eq('user_id', userId);
    }

    // Reconcile items: keep ids the user passed back (so existing draws
    // retain their status / linked invoice), insert new ones, delete the rest.
    const incomingIds = items.map((it) => it.id).filter(Boolean);
    const { data: existingItems } = await supabase
      .from('draw_schedule_items')
      .select('id')
      .eq('schedule_id', scheduleId)
      .eq('user_id', userId);
    const toDelete = (existingItems || [])
      .map((r) => r.id)
      .filter((id) => !incomingIds.includes(id));
    if (toDelete.length > 0) {
      await supabase
        .from('draw_schedule_items')
        .delete()
        .in('id', toDelete)
        .eq('user_id', userId);
    }

    // Updates / inserts
    const ops = [];
    items.forEach((it, idx) => {
      const trigger = it.trigger_type
        || (it.phase_id ? 'phase_completion' : 'manual');
      const row = {
        schedule_id: scheduleId,
        project_id: projectId,
        user_id: userId,
        order_index: idx,
        description: it.description || `Draw ${idx + 1}`,
        phase_id: trigger === 'phase_completion' ? (it.phase_id || null) : null,
        trigger_type: trigger,
        percent_of_contract:
          it.percent_of_contract != null && it.percent_of_contract !== ''
            ? parseFloat(it.percent_of_contract)
            : null,
        fixed_amount:
          it.fixed_amount != null && it.fixed_amount !== ''
            ? parseFloat(it.fixed_amount)
            : null,
      };
      if (it.id) {
        ops.push(
          supabase
            .from('draw_schedule_items')
            .update(row)
            .eq('id', it.id)
            .eq('user_id', userId)
        );
      } else {
        ops.push(
          supabase.from('draw_schedule_items').insert(row).select().single()
        );
      }
    });
    await Promise.all(ops);

    // Re-fetch authoritative state for callers that want to round-trip ids
    const fresh = await fetchDrawSchedule(projectId);
    return { ok: true, schedule: fresh?.schedule || null, items: fresh?.items || [] };
  } catch (e) {
    console.error('[projectDraws] upsert error:', e);
    return { ok: false, error: e.message };
  }
};

/**
 * Generate an invoice for one pending draw item. Mirrors the agent tool
 * `generate_draw_invoice` so owner UI can call it without hitting the chat
 * pipeline.
 */
export const generateDrawInvoice = async (scheduleItemId, dueInDays = 30) => {
  if (!scheduleItemId) return { ok: false, error: 'Missing draw item id' };
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { ok: false, error: 'Not authenticated' };

    const { data: item, error: itemErr } = await supabase
      .from('draw_schedule_items')
      .select(`
        id, description, percent_of_contract, fixed_amount, status, invoice_id,
        schedule:draw_schedules(retainage_percent),
        project:projects(id, name, contract_amount, client_name, client_email, client_phone, client_address)
      `)
      .eq('id', scheduleItemId)
      .eq('user_id', userId)
      .single();

    if (itemErr || !item) return { ok: false, error: 'Draw not found' };
    if (item.invoice_id) return { ok: false, error: 'Already invoiced' };
    if (!item.project) return { ok: false, error: 'Draw is not linked to a project' };

    const contract = parseFloat(item.project.contract_amount || 0);
    const retainagePct = parseFloat(item.schedule?.retainage_percent || 0);
    const gross = item.percent_of_contract != null
      ? contract * parseFloat(item.percent_of_contract) / 100
      : parseFloat(item.fixed_amount || 0);
    if (!(gross > 0)) return { ok: false, error: 'Draw amount is $0' };

    const retainage = gross * retainagePct / 100;
    const net = gross - retainage;

    const due = new Date();
    due.setDate(due.getDate() + dueInDays);
    const dueStr = due.toISOString().split('T')[0];

    const lineItems = [
      { description: `Progress draw: ${item.description}`, quantity: 1, unit: 'draw', pricePerUnit: gross, total: gross },
    ];
    if (retainage > 0) {
      lineItems.push({
        description: `Retainage held (${retainagePct}%)`,
        quantity: 1,
        unit: '',
        pricePerUnit: -retainage,
        total: -retainage,
      });
    }

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        project_id: item.project.id,
        client_name: item.project.client_name,
        client_email: item.project.client_email,
        client_phone: item.project.client_phone,
        client_address: item.project.client_address,
        project_name: item.project.name,
        items: lineItems,
        subtotal: net,
        tax_rate: 0,
        tax_amount: 0,
        total: net,
        due_date: dueStr,
        payment_terms: `Net ${dueInDays}`,
        status: 'unpaid',
        notes: `Progress draw — ${item.description}${retainage > 0 ? ` (gross $${gross.toFixed(2)}, retainage $${retainage.toFixed(2)})` : ''}`,
      })
      .select()
      .single();
    if (invErr) return { ok: false, error: invErr.message };

    await supabase
      .from('draw_schedule_items')
      .update({ status: 'invoiced', invoice_id: invoice.id })
      .eq('id', item.id)
      .eq('user_id', userId);

    return {
      ok: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total: net,
        gross,
        retainage_held: retainage,
        due_date: dueStr,
      },
    };
  } catch (e) {
    console.error('[projectDraws] generateDrawInvoice error:', e);
    return { ok: false, error: e.message };
  }
};
