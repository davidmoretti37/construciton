/**
 * Visit Generator — Creates service_visits from location_schedules
 *
 * Two modes:
 * 1. Initial: Generate all visits for a plan (contract with end date = all visits, ongoing = 8 weeks)
 * 2. Rolling: After a visit is completed, check if more visits need to be generated
 *
 * Called from:
 * - Service plan creation (ChatScreen save handler via API)
 * - Visit completion (backend POST /:id/complete)
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DAY_MAP = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Generate visits for a service plan based on its location schedules
 * @param {string} planId - Service plan ID
 * @param {object} options
 * @param {string} options.startFrom - Start generating from this date (default: today)
 * @param {number} options.weeksAhead - How many weeks to generate (default: 8)
 * @param {boolean} options.skipExisting - Don't create duplicates (default: true)
 */
async function generateVisitsForPlan(planId, options = {}) {
  const {
    startFrom = new Date().toISOString().split('T')[0],
    weeksAhead = 8,
    skipExisting = true,
  } = options;

  try {
    // Get the plan
    const { data: plan } = await supabase
      .from('service_plans')
      .select('id, owner_id, status')
      .eq('id', planId)
      .single();

    if (!plan || plan.status !== 'active') {
      logger.debug(`[VisitGen] Plan ${planId} not active, skipping`);
      return { generated: 0 };
    }

    // Get locations with active schedules
    const { data: locations } = await supabase
      .from('service_locations')
      .select('id, default_worker_id')
      .eq('service_plan_id', planId)
      .eq('is_active', true);

    if (!locations || locations.length === 0) {
      return { generated: 0 };
    }

    const locIds = locations.map(l => l.id);
    const locationWorkers = Object.fromEntries(locations.map(l => [l.id, l.default_worker_id || null]));

    // Get schedules for all locations
    const { data: schedules } = await supabase
      .from('location_schedules')
      .select('service_location_id, frequency, scheduled_days, preferred_time')
      .in('service_location_id', locIds)
      .eq('is_active', true);

    if (!schedules || schedules.length === 0) {
      return { generated: 0 };
    }

    // Calculate end date
    const start = new Date(startFrom + 'T12:00:00Z');
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + (weeksAhead * 7));
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get existing visits in this range to avoid duplicates
    let existingDates = new Set();
    if (skipExisting) {
      const { data: existing } = await supabase
        .from('service_visits')
        .select('scheduled_date, service_location_id')
        .eq('service_plan_id', planId)
        .gte('scheduled_date', startFrom)
        .lte('scheduled_date', endDateStr);

      (existing || []).forEach(v => {
        existingDates.add(`${v.service_location_id}:${v.scheduled_date}`);
      });
    }

    // Generate visits
    const visits = [];

    for (const sched of schedules) {
      const dayNums = (sched.scheduled_days || []).map(d => {
        if (typeof d === 'number') return d;
        return DAY_MAP[String(d).toLowerCase()] ?? -1;
      }).filter(d => d >= 0);

      if (dayNums.length === 0) continue;

      const effectiveWeeks = sched.frequency === 'biweekly' ? weeksAhead * 2 : weeksAhead;

      for (let dayOffset = 0; dayOffset < effectiveWeeks * 7; dayOffset++) {
        const date = new Date(start);
        date.setDate(date.getDate() + dayOffset);

        // Don't generate past the end date
        if (date > endDate) break;

        const dayOfWeek = date.getDay();
        if (!dayNums.includes(dayOfWeek)) continue;

        // Biweekly: skip every other week (relative to plan start date)
        if (sched.frequency === 'biweekly') {
          const msPerWeek = 7 * 24 * 60 * 60 * 1000;
          const weeksSinceStart = Math.floor((date.getTime() - start.getTime()) / msPerWeek);
          if (weeksSinceStart % 2 !== 0) continue;
        }

        // Monthly: only on the specific day_of_month or first occurrence
        if (sched.frequency === 'monthly') {
          // For monthly, only generate if this is the first occurrence of this day in the month
          const firstOccurrence = getFirstOccurrenceInMonth(date.getFullYear(), date.getMonth(), dayOfWeek);
          if (date.getDate() !== firstOccurrence) continue;
        }

        const dateStr = date.toISOString().split('T')[0];
        const key = `${sched.service_location_id}:${dateStr}`;

        if (existingDates.has(key)) continue;
        existingDates.add(key); // prevent duplicates within this batch

        visits.push({
          service_plan_id: planId,
          service_location_id: sched.service_location_id,
          owner_id: plan.owner_id,
          assigned_worker_id: locationWorkers[sched.service_location_id] || null,
          scheduled_date: dateStr,
          scheduled_time: sched.preferred_time || null,
          status: 'scheduled',
          billable: true,
          generated_from_schedule_id: null,
        });
      }
    }

    if (visits.length > 0) {
      const { error } = await supabase.from('service_visits').insert(visits);
      if (error) {
        logger.error(`[VisitGen] Insert error for plan ${planId}:`, error.message);
        return { generated: 0, error: error.message };
      }
    }

    logger.info(`[VisitGen] Generated ${visits.length} visits for plan ${planId} (${startFrom} → ${endDateStr})`);
    return { generated: visits.length };
  } catch (e) {
    logger.error(`[VisitGen] Error for plan ${planId}:`, e.message);
    return { generated: 0, error: e.message };
  }
}

/**
 * Get the first occurrence of a day-of-week in a month
 */
function getFirstOccurrenceInMonth(year, month, dayOfWeek) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== dayOfWeek) {
    d.setDate(d.getDate() + 1);
  }
  return d.getDate();
}

/**
 * Check if a plan needs more visits and generate them if so.
 * Called after a visit is completed.
 *
 * Logic: If there are fewer than 4 weeks of future scheduled visits,
 * generate another 8 weeks from the last existing visit date.
 */
async function checkAndRegenerateVisits(planId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const fourWeeksOut = new Date();
    fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);
    const cutoff = fourWeeksOut.toISOString().split('T')[0];

    // Count future scheduled visits
    const { count, error } = await supabase
      .from('service_visits')
      .select('id', { count: 'exact', head: true })
      .eq('service_plan_id', planId)
      .gte('scheduled_date', today)
      .eq('status', 'scheduled');

    if (error) throw error;

    // If less than 8 future visits (roughly 4 weeks for 2 visits/week), generate more
    if (count < 8) {
      // Find the last scheduled visit date to start generating from
      const { data: lastVisit } = await supabase
        .from('service_visits')
        .select('scheduled_date')
        .eq('service_plan_id', planId)
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .single();

      const startFrom = lastVisit
        ? (() => {
            const d = new Date(lastVisit.scheduled_date + 'T12:00:00');
            d.setDate(d.getDate() + 1);
            return d.toISOString().split('T')[0];
          })()
        : today;

      const result = await generateVisitsForPlan(planId, {
        startFrom,
        weeksAhead: 8,
        skipExisting: true,
      });

      return result;
    }

    return { generated: 0, reason: 'enough_visits_exist' };
  } catch (e) {
    logger.error(`[VisitGen] Regeneration check error for plan ${planId}:`, e.message);
    return { generated: 0, error: e.message };
  }
}

/**
 * Generate visits for ALL active plans that need them.
 * Can be called from an API endpoint or cron job.
 */
async function regenerateAllPlans() {
  try {
    const { data: plans } = await supabase
      .from('service_plans')
      .select('id')
      .eq('status', 'active');

    let totalGenerated = 0;
    for (const plan of (plans || [])) {
      const result = await checkAndRegenerateVisits(plan.id);
      totalGenerated += result.generated;
    }

    return { plans: (plans || []).length, totalGenerated };
  } catch (e) {
    logger.error('[VisitGen] Regenerate all error:', e.message);
    return { error: e.message };
  }
}

module.exports = {
  generateVisitsForPlan,
  checkAndRegenerateVisits,
  regenerateAllPlans,
};
