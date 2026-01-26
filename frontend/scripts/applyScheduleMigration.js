/**
 * Apply schedule_events migration to database
 * Run with: node scripts/applyScheduleMigration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://dmhpzutqzqerfprstioc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtaHB6dXRxenFlcmZwcnN0aW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjEyNDAyMSwiZXhwIjoyMDc3NzAwMDIxfQ.YUKW4FiBh4tg0LADiBK3TKDZZcI8Xv0nsU3BgcEzWT8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTableExists() {
  const { data, error } = await supabase
    .from('schedule_events')
    .select('id')
    .limit(1);

  if (error) {
    if (error.code === '42P01') {
      // Table doesn't exist
      return false;
    }
    console.error('Error checking table:', error);
    return false;
  }

  return true;
}

async function applyMigration() {
  try {
    console.log('🔍 Checking if schedule_events table exists...');

    const exists = await checkTableExists();

    if (exists) {
      console.log('✅ Table already exists!');

      // Test insert
      console.log('\n📝 Testing insert...');
      const testData = {
        title: 'Test Event',
        description: 'Testing schedule events',
        event_type: 'other',
        start_datetime: new Date().toISOString(),
        all_day: false,
        color: '#3B82F6'
      };

      const { data, error } = await supabase
        .from('schedule_events')
        .insert(testData)
        .select()
        .single();

      if (error) {
        console.error('❌ Test insert failed:', error);
      } else {
        console.log('✅ Test insert successful! Event ID:', data.id);

        // Clean up test event
        await supabase.from('schedule_events').delete().eq('id', data.id);
        console.log('🧹 Cleaned up test event');
      }

      return;
    }

    console.log('❌ Table does not exist. Reading migration file...');

    const migrationPath = path.join(__dirname, '../supabase/migrations/20251119_create_schedule_events.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded. Applying to database...');
    console.log('\n⚠️  Note: This requires direct database access.');
    console.log('Please run this SQL manually in your Supabase SQL Editor:\n');
    console.log('-------------------------------------------');
    console.log(sql);
    console.log('-------------------------------------------\n');

    console.log('Or use the Supabase CLI:');
    console.log('  supabase db push');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyMigration();
