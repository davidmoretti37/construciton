// Diagnostic: list storage buckets, pick a sample project_documents row,
// and try to sign its file_url the same way the app does. Read-only.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

(async () => {
  // 1. List buckets
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) throw bErr;
  console.log('=== Buckets ===');
  buckets.forEach(b => console.log(`  ${b.name} (public=${b.public}, id=${b.id})`));

  // 2. Grab a handful of project_documents rows
  const { data: docs, error: dErr } = await supabase
    .from('project_documents')
    .select('id, project_id, file_name, file_url, file_type, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (dErr) throw dErr;

  console.log(`\n=== project_documents rows: ${docs?.length || 0} ===`);
  for (const d of docs || []) {
    console.log(`\n  id=${d.id} name="${d.file_name}"`);
    console.log(`    file_url: ${d.file_url}`);

    const path = d.file_url;
    if (!path) {
      console.log('    -> no file_url, skipping');
      continue;
    }

    // Extract storage path if it's a full URL
    let storagePath = path;
    if (path.startsWith('http')) {
      const m = path.match(/\/(project-documents|project-docs)\/(.+)$/);
      if (m) storagePath = m[2];
    }

    // Try both buckets
    for (const bucket of ['project-docs', 'project-documents']) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60);
      if (error) {
        console.log(`    bucket=${bucket}: ERROR ${error.message}`);
      } else {
        console.log(`    bucket=${bucket}: ok -> signed URL generated`);
        // Also verify the file actually exists
        const folder = storagePath.split('/').slice(0, -1).join('/');
        const file = storagePath.split('/').pop();
        const { data: listed } = await supabase.storage
          .from(bucket)
          .list(folder, { limit: 100, search: file });
        const found = (listed || []).some(f => f.name === file);
        console.log(`    bucket=${bucket}: file exists in storage = ${found}`);
      }
    }
  }
})().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
