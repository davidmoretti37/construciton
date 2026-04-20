const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const tables = ['clock_in_records', 'time_entries', 'work_hours', 'worker_hours', 'timesheets', 'work_sessions'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (!error && data !== null) {
      console.log('✅ Found table:', table);
      if (data[0]) {
        console.log('   Columns:', Object.keys(data[0]));
      }
      return;
    } else if (error) {
      console.log('❌', table, '- not found');
    }
  }

  console.log('\n⚠️  Could not find time tracking table');
})();
