/**
 * One-shot migration to encrypt existing plaintext Teller access tokens
 * at rest. Safe to re-run — skips already-encrypted tokens.
 *
 * Run:  SYLK_BANK_KEY=<base64-key> node scripts/encrypt-teller-tokens.js
 *
 * Generate a key first:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { encryptSecret, isEncrypted } = require('../src/services/crypto');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.SYLK_BANK_KEY) {
  console.error('Missing SYLK_BANK_KEY env var');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data, error } = await supabase
    .from('connected_bank_accounts')
    .select('id, teller_access_token')
    .not('teller_access_token', 'is', null);

  if (error) {
    console.error('Fetch failed:', error);
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of data) {
    if (!row.teller_access_token) continue;
    if (isEncrypted(row.teller_access_token)) {
      skipped++;
      continue;
    }
    const encrypted = encryptSecret(row.teller_access_token);
    const { error: updErr } = await supabase
      .from('connected_bank_accounts')
      .update({ teller_access_token: encrypted })
      .eq('id', row.id);
    if (updErr) {
      console.error(`Failed to update ${row.id}:`, updErr.message);
      failed++;
    } else {
      migrated++;
    }
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
