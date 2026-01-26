const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://dmhpzutqzqerfprstioc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtaHB6dXRxenFlcmZwcnN0aW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjEyNDAyMSwiZXhwIjoyMDc3NzAwMDIxfQ.YUKW4FiBh4tg0LADiBK3TKDZZcI8Xv0nsU3BgcEzWT8');

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
