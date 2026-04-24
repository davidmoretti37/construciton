/**
 * Applies 20260425_chat_memory.sql via the exec_sql RPC.
 * Reuses the same statement-splitting pattern as _apply_rls_flatten.js.
 * Idempotent — every ALTER/CREATE uses IF NOT EXISTS or DROP-IF-EXISTS.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MIGRATION = path.join(__dirname, '..', 'supabase', 'migrations', '20260425_chat_memory.sql');

function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let inDollar = false;
  let dollarTag = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inSingle = false;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment: -- ... \n
    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    // Block comment: /* ... */
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') { buf += next; i += 2; inBlockComment = false; continue; }
      i++;
      continue;
    }
    // Single-quoted string
    if (inSingle) {
      buf += ch;
      if (ch === "'" && next === "'") { buf += next; i += 2; continue; } // doubled quote
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    // Dollar-quoted block
    if (inDollar) {
      if (ch === '$') {
        const tail = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (tail && tail[0] === dollarTag) {
          buf += tail[0];
          i += tail[0].length;
          inDollar = false;
          dollarTag = '';
          continue;
        }
      }
      buf += ch;
      i++;
      continue;
    }

    // Detect entering a context
    if (ch === '-' && next === '-') { buf += '--'; i += 2; inLineComment = true; continue; }
    if (ch === '/' && next === '*') { buf += '/*'; i += 2; inBlockComment = true; continue; }
    if (ch === "'") { buf += ch; i++; inSingle = true; continue; }
    if (ch === '$') {
      const tag = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tag) {
        buf += tag[0];
        i += tag[0].length;
        inDollar = true;
        dollarTag = tag[0];
        continue;
      }
    }

    if (ch === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

(async () => {
  const raw = fs.readFileSync(MIGRATION, 'utf8');
  // No BEGIN/COMMIT to strip in this migration; preserve PL/pgSQL DO blocks intact.
  const cleaned = raw;

  const statements = splitStatements(cleaned).filter((s) => {
    const stripped = s.replace(/^\s*(--[^\n]*\n?)+/gm, '').trim();
    return stripped.length > 0;
  });

  console.log(`[apply] ${statements.length} statements to run`);

  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    const preview = stmt.split('\n').slice(0, 2).join(' ').slice(0, 100);
    process.stdout.write(`[${idx + 1}/${statements.length}] ${preview}\u2026 `);
    const { error } = await sb.rpc('exec_sql', { sql: stmt + ';' });
    if (error) {
      console.log('FAIL');
      console.error('\n[apply] error on statement', idx + 1, ':', error.message);
      console.error('[apply] SQL was:\n', stmt);
      process.exit(1);
    }
    console.log('OK');
  }
  console.log('\n[apply] \u2705 all statements applied');
})();
