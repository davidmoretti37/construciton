/**
 * Apply schedule_events migration to database
 * Run with: node scripts/applyScheduleMigration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

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
