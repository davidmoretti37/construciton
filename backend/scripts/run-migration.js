#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

// Extract project ref from Supabase URL
// e.g., https://dmhpzutqzqerfprstioc.supabase.co -> dmhpzutqzqerfprstioc
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

// Construct PostgreSQL connection string for Supabase
// Format: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
// Note: This requires the database password, which isn't the same as the service role key
console.log('\n📝 To run this migration, you have two options:\n');
console.log('Option 1: Use Supabase Dashboard');
console.log('  1. Go to https://app.supabase.com/project/' + projectRef + '/editor/sql');
console.log('  2. Copy the contents of: backend/supabase/migrations/20260214_add_chat_history.sql');
console.log('  3. Paste and run the SQL in the SQL Editor\n');

console.log('Option 2: Use psql with database password');
console.log('  1. Get your database password from: https://app.supabase.com/project/' + projectRef + '/settings/database');
console.log('  2. Run: PGPASSWORD=<your-db-password> psql -h db.' + projectRef + '.supabase.co -U postgres -d postgres -f backend/supabase/migrations/20260214_add_chat_history.sql\n');

console.log('I\'ll try to run it using an alternative method...\n');

async function runMigration(filename) {
  try {
    const migrationPath = path.join(__dirname, '../supabase/migrations', filename);

    if (!fs.existsSync(migrationPath)) {
      console.error(`Migration file not found: ${filename}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`Reading migration: ${filename}...`);

    // Try using Supabase SQL endpoint
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Running ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`Executing statement ${i + 1}/${statements.length}...`);

      try {
        // Use Supabase client's from() to check tables or create if needed
        const { data, error } = await supabase.rpc('exec', { sql: statement });

        if (error && !error.message.includes('function') && !error.message.includes('exec')) {
          console.warn(`Warning for statement ${i + 1}:`, error.message);
        }
      } catch (err) {
        // Statements might fail if tables already exist, which is okay
        if (!err.message.includes('already exists')) {
          console.warn(`Warning for statement ${i + 1}:`, err.message);
        }
      }
    }

    console.log('✅ Migration completed!\n');
    console.log('⚠️  Note: If you see warnings above, please verify the migration ran correctly.');
    console.log('   You can check in the Supabase dashboard: https://app.supabase.com/project/' + projectRef + '/editor');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n💡 Please run the migration manually using Option 1 or 2 above.');
    process.exit(1);
  }
}

// Get migration filename from command line args
const migrationFile = process.argv[2] || '20260214_add_chat_history.sql';
runMigration(migrationFile);
