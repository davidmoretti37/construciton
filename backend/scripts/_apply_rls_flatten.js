/**
 * Applies 20260424b_flatten_hotpath_rls.sql via the exec_sql RPC.
 * exec_sql can't execute transaction commands (BEGIN/COMMIT), so we
 * strip them and run the body statement-by-statement. If any fails
 * partway through we stop and report — the DDL is additive+drop-if-exists
 * so re-runs are safe.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MIGRATION = path.join(__dirname, '..', 'supabase', 'migrations', '20260424b_flatten_hotpath_rls.sql');

// Statement splitter that respects $$ dollar-quoted function bodies.
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let inDollar = false;
  let dollarTag = '';
  while (i < sql.length) {
    // Detect $$ (or $tag$) boundaries
    if (sql[i] === '$') {
      const tagMatch = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tagMatch) {
        const full = tagMatch[0];
        if (!inDollar) {
          inDollar = true;
          dollarTag = full;
        } else if (full === dollarTag) {
          inDollar = false;
          dollarTag = '';
        }
        buf += full;
        i += full.length;
        continue;
      }
    }
    if (sql[i] === ';' && !inDollar) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += sql[i];
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

(async () => {
  const raw = fs.readFileSync(MIGRATION, 'utf8');
  // Strip comments-only lines and BEGIN/COMMIT (exec_sql can't do txn commands)
  const cleaned = raw
    .split('\n')
    .filter((line) => !/^\s*BEGIN\s*;?\s*$/i.test(line))
    .filter((line) => !/^\s*COMMIT\s*;?\s*$/i.test(line))
    .join('\n');

  const statements = splitStatements(cleaned).filter((s) => {
    const stripped = s.replace(/^\s*(--[^\n]*\n?)+/gm, '').trim();
    return stripped.length > 0;
  });

  console.log(`[apply] ${statements.length} statements to run`);

  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    const preview = stmt.split('\n').slice(0, 2).join(' ').slice(0, 100);
    process.stdout.write(`[${idx + 1}/${statements.length}] ${preview}… `);
    const { error } = await sb.rpc('exec_sql', { sql: stmt + ';' });
    if (error) {
      console.log('FAIL');
      console.error('\n[apply] error on statement', idx + 1, ':', error.message);
      console.error('[apply] SQL was:\n', stmt);
      process.exit(1);
    }
    console.log('OK');
  }
  console.log('\n[apply] ✅ all statements applied');
})();
