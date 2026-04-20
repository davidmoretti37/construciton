#!/usr/bin/env node

/**
 * Script to add mock work hours for testing payment calculations
 * Creates clock-in records for a full month with various scenarios
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addMockWorkHours() {
  console.log('🔍 Finding worker...');

  // 1. Find the worker by email
  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .select('id, full_name, email, hourly_rate, payment_type, user_id, owner_id')
    .eq('email', 'morettiautobot@gmail.com')
    .single();

  if (workerError || !worker) {
    console.error('❌ Worker not found:', workerError?.message);
    return;
  }

  console.log('✅ Found worker:', worker.full_name, `(ID: ${worker.id})`);
  console.log('   Payment type:', worker.payment_type, '- Rate:', worker.hourly_rate);

  // 2. Find available projects owned by the same user
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('user_id', worker.owner_id)
    .limit(3);

  if (projectsError || !projects || projects.length === 0) {
    console.error('❌ No projects found:', projectsError?.message);
    return;
  }

  console.log(`✅ Found ${projects.length} projects:`, projects.map(p => p.name).join(', '));

  // 3. Delete existing time tracking records for this worker (for clean testing)
  console.log('🗑️  Cleaning up old test data...');
  const { error: deleteError } = await supabase
    .from('time_tracking')
    .delete()
    .eq('worker_id', worker.id);

  if (deleteError) {
    console.warn('⚠️  Could not delete old records:', deleteError.message);
  }

  // 4. Generate mock work hours for November 2025 (full month)
  const mockRecords = [];
  const startDate = new Date('2025-11-01');
  const endDate = new Date('2025-11-30');

  console.log('📅 Generating mock work hours for November 2025...');

  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = date.getDay();

    // Skip Sundays (0)
    if (dayOfWeek === 0) continue;

    // Saturdays (6) - only half day sometimes
    if (dayOfWeek === 6 && Math.random() > 0.5) continue;

    const currentDate = new Date(date);

    // Scenario 1: Regular single job day (most common)
    if (Math.random() > 0.3) {
      const project = projects[Math.floor(Math.random() * projects.length)];
      const startHour = 7 + Math.floor(Math.random() * 2); // 7-8 AM
      const duration = dayOfWeek === 6 ? 4 + Math.random() * 2 : 7 + Math.random() * 2; // 7-9 hours weekday, 4-6 Saturday

      const clockIn = new Date(currentDate);
      clockIn.setHours(startHour, Math.floor(Math.random() * 60), 0, 0);

      const clockOut = new Date(clockIn);
      clockOut.setHours(clockOut.getHours() + Math.floor(duration), Math.floor((duration % 1) * 60), 0, 0);

      mockRecords.push({
        worker_id: worker.id,
        project_id: project.id,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        notes: `Regular workday at ${project.name}`
      });
    }
    // Scenario 2: Multiple jobs in one day (test daily payment split)
    else {
      const numJobs = 2 + Math.floor(Math.random() * 2); // 2-3 jobs
      let currentTime = new Date(currentDate);
      currentTime.setHours(7, 0, 0, 0);

      for (let i = 0; i < numJobs && i < projects.length; i++) {
        const project = projects[i];
        const duration = 2 + Math.random() * 3; // 2-5 hours per job

        const clockIn = new Date(currentTime);
        const clockOut = new Date(clockIn);
        clockOut.setHours(clockOut.getHours() + Math.floor(duration), Math.floor((duration % 1) * 60), 0, 0);

        mockRecords.push({
          worker_id: worker.id,
          project_id: project.id,
          clock_in: clockIn.toISOString(),
          clock_out: clockOut.toISOString(),
          notes: `Job ${i + 1} of ${numJobs} at ${project.name}`
        });

        // Move to next job start time (with 30min break)
        currentTime = new Date(clockOut);
        currentTime.setMinutes(currentTime.getMinutes() + 30);
      }
    }
  }

  console.log(`📊 Generated ${mockRecords.length} clock-in records`);
  console.log('💾 Inserting into database...');

  // 5. Insert records in batches (Supabase has limits)
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < mockRecords.length; i += batchSize) {
    const batch = mockRecords.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('time_tracking')
      .insert(batch)
      .select();

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error.message);
    } else {
      inserted += data.length;
      console.log(`✅ Inserted batch ${i / batchSize + 1}: ${data.length} records`);
    }
  }

  // 6. Calculate totals
  const totalHours = mockRecords.reduce((sum, r) => {
    const hours = (new Date(r.clock_out) - new Date(r.clock_in)) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);
  const totalDays = new Set(mockRecords.map(r => r.clock_in.split('T')[0])).size;
  const multiJobDays = mockRecords.reduce((acc, r) => {
    const date = r.clock_in.split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
  const daysWithMultipleJobs = Object.values(multiJobDays).filter(count => count > 1).length;

  console.log('\n✅ Mock data created successfully!');
  console.log(`   Total records inserted: ${inserted}`);
  console.log(`   Total hours: ${totalHours.toFixed(1)} hours`);
  console.log(`   Days worked: ${totalDays}`);
  console.log(`   Days with multiple jobs: ${daysWithMultipleJobs}`);
  console.log(`   Average hours/day: ${(totalHours / totalDays).toFixed(1)}`);

  if (worker.payment_type === 'hourly' && worker.hourly_rate) {
    console.log(`   Estimated payment: $${(totalHours * worker.hourly_rate).toFixed(2)}`);
  }

  console.log('\n🎉 Done! You can now test payment calculations.');
}

// Run the script
addMockWorkHours()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
