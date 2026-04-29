/**
 * Audit-log diff formatter.
 *
 * Turns an audit_log row into a one-line readable summary like
 * "Joe changed total from $4,200 to $4,800" or "Created project
 * Smith Bathroom Reno". Used by AuditTrail and AuditLogScreen.
 *
 * Pure / synchronous so it can also run in the agent reducer when
 * we want to summarise a tool result on the chat side.
 */

const CURRENCY_FIELDS = new Set([
  'total', 'subtotal', 'amount', 'amount_paid', 'amount_due', 'tax_amount',
  'price_per_visit', 'monthly_rate', 'contract_amount', 'budget',
  'hourly_rate', 'daily_rate', 'weekly_salary', 'project_rate',
  'payment_amount', 'expense_amount', 'income_amount',
]);

const PERCENT_FIELDS = new Set([
  'tax_rate', 'progress', 'completion', 'markup_percent',
]);

const SKIPPABLE_FIELDS = new Set([
  'updated_at', 'created_at', 'last_seen_at', 'embedding',
]);

function formatValue(value, field) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 60 ? `${json.slice(0, 57)}…` : json;
    } catch {
      return '[object]';
    }
  }
  if (typeof value === 'number') {
    if (CURRENCY_FIELDS.has(field)) {
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    if (PERCENT_FIELDS.has(field)) {
      return `${value}%`;
    }
    return String(value);
  }
  const str = String(value);
  if (str.length > 60) return `${str.slice(0, 57)}…`;
  return str;
}

/**
 * Pick the most "headline-worthy" change from a diff array.
 * Heuristic: prefer status, then total/amount, then name/title,
 * then any non-trivial change. Falls back to the first entry.
 */
function pickHeadlineChange(changes) {
  if (!changes || changes.length === 0) return null;
  const priority = ['status', 'total', 'amount', 'name', 'title', 'project_name', 'client_name'];
  for (const p of priority) {
    const hit = changes.find(c => c.field === p);
    if (hit) return hit;
  }
  return changes.find(c => !SKIPPABLE_FIELDS.has(c.field)) || changes[0];
}

/**
 * Compute readable headline. Caller passes `t` (i18n translator)
 * so we can render in the user's selected language. Translation
 * keys live under the `audit` namespace.
 */
export function formatAuditEntry(entry, t) {
  if (!entry) return '';
  const entityLabel = t(`audit.entityTypes.${entry.entity_type}`, { defaultValue: entry.entity_type });
  const action = entry.action;

  // Bulk roll-up.
  if (action.startsWith('bulk_') && entry.item_count) {
    return t('audit.bulkAction', {
      action: t(`audit.actions.${action}`, { defaultValue: action }),
      count: entry.item_count,
      entity: entityLabel,
    });
  }

  if (action === 'create') {
    const name = entry.after_json?.name
      || entry.after_json?.title
      || entry.after_json?.project_name
      || entry.after_json?.full_name;
    if (name) return t('audit.created', { entity: entityLabel, name });
    return t('audit.createdGeneric', { entity: entityLabel });
  }

  if (action === 'delete') {
    const name = entry.before_json?.name
      || entry.before_json?.title
      || entry.before_json?.project_name
      || entry.before_json?.full_name;
    if (name) return t('audit.deleted', { entity: entityLabel, name });
    return t('audit.deletedGeneric', { entity: entityLabel });
  }

  if (action === 'update') {
    const headline = pickHeadlineChange(entry.changes);
    if (headline) {
      return t('audit.changed', {
        field: headline.field,
        before: formatValue(headline.before, headline.field),
        after: formatValue(headline.after, headline.field),
      });
    }
    return t('audit.updatedGeneric', { entity: entityLabel });
  }

  return t(`audit.actions.${action}`, { defaultValue: action });
}

export { formatValue, pickHeadlineChange, CURRENCY_FIELDS, PERCENT_FIELDS };
