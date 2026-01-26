/**
 * Apply pricing_history migration to database
 * Run with: node scripts/applyPricingHistoryMigration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://dmhpzutqzqerfprstioc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtaHB6dXRxenFlcmZwcnN0aW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjEyNDAyMSwiZXhwIjoyMDc3NzAwMDIxfQ.YUKW4FiBh4tg0LADiBK3TKDZZcI8Xv0nsU3BgcEzWT8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTableExists() {
  const { data, error } = await supabase
    .from('pricing_history')
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
    console.log('🔍 Checking if pricing_history table exists...');

    const exists = await checkTableExists();

    if (exists) {
      console.log('✅ pricing_history table already exists!');

      // Test insert
      console.log('\n📝 Testing insert...');
      const testData = {
        service_type: 'test',
        work_description: 'Test pricing entry',
        total_amount: 100,
        source_type: 'project',
        is_correction: false,
        confidence_weight: 1.0
      };

      const { data, error } = await supabase
        .from('pricing_history')
        .insert(testData)
        .select()
        .single();

      if (error) {
        console.error('❌ Test insert failed:', error);
      } else {
        console.log('✅ Test insert successful! Entry ID:', data.id);

        // Clean up test entry
        await supabase.from('pricing_history').delete().eq('id', data.id);
        console.log('🧹 Cleaned up test entry');
      }

      return;
    }

    console.log('❌ Table does not exist. Reading migration file...');

    const migrationPath = path.join(__dirname, '../supabase/migrations/20251125_create_pricing_history.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded.');
    console.log('\n⚠️  Please run this SQL in your Supabase SQL Editor:\n');
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
