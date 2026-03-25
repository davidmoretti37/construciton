/**
 * Service Plans storage utilities
 * Direct Supabase queries for service plans, locations, schedules
 */

import { supabase } from '../../lib/supabase';

/**
 * Get current user ID from Supabase auth
 */
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * Fetch all service plans for the current owner
 * @param {string} [status] - Filter by status (active, paused, cancelled)
 */
export async function fetchServicePlans(status) {
  const userId = await getUserId();
  if (!userId) return [];

  let query = supabase
    .from('service_plans')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data: plans, error } = await query;
  if (error) {
    console.error('[ServicePlans] Fetch error:', error.message);
    return [];
  }

  if (!plans || plans.length === 0) return [];

  // Get location counts
  const planIds = plans.map(p => p.id);
  const { data: locations } = await supabase
    .from('service_locations')
    .select('service_plan_id')
    .in('service_plan_id', planIds)
    .eq('is_active', true);

  const locCounts = {};
  (locations || []).forEach(l => {
    locCounts[l.service_plan_id] = (locCounts[l.service_plan_id] || 0) + 1;
  });

  // Get visit stats for current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = nextMonth.toISOString().split('T')[0];

  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', monthStart)
    .lt('scheduled_date', monthEnd)
    .neq('status', 'cancelled');

  const visitStats = {};
  (visits || []).forEach(v => {
    if (!visitStats[v.service_plan_id]) visitStats[v.service_plan_id] = { total: 0, completed: 0 };
    visitStats[v.service_plan_id].total++;
    if (v.status === 'completed') visitStats[v.service_plan_id].completed++;
  });

  return plans.map(p => ({
    ...p,
    location_count: locCounts[p.id] || 0,
    visits_this_month: visitStats[p.id]?.total || 0,
    completed_this_month: visitStats[p.id]?.completed || 0,
    price_per_visit: p.price_per_visit ? parseFloat(p.price_per_visit) : null,
    monthly_rate: p.monthly_rate ? parseFloat(p.monthly_rate) : null,
  }));
}

/**
 * Fetch a single service plan with locations and schedules
 */
export async function fetchServicePlanDetail(planId) {
  const userId = await getUserId();
  if (!userId) return null;

  const { data: plan, error } = await supabase
    .from('service_plans')
    .select('*')
    .eq('id', planId)
    .eq('owner_id', userId)
    .single();

  if (error || !plan) return null;

  // Fetch active locations
  const { data: locations } = await supabase
    .from('service_locations')
    .select('*')
    .eq('service_plan_id', planId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  // Fetch schedules for locations
  const today = new Date().toISOString().split('T')[0];
  if (locations && locations.length > 0) {
    const locationIds = locations.map(l => l.id);
    const { data: schedules } = await supabase
      .from('location_schedules')
      .select('*')
      .in('service_location_id', locationIds)
      .eq('is_active', true)
      .or(`effective_until.is.null,effective_until.gte.${today}`);

    const scheduleMap = {};
    (schedules || []).forEach(s => { scheduleMap[s.service_location_id] = s; });
    locations.forEach(l => { l.schedule = scheduleMap[l.id] || null; });
  }

  return {
    ...plan,
    locations: locations || [],
    price_per_visit: plan.price_per_visit ? parseFloat(plan.price_per_visit) : null,
    monthly_rate: plan.monthly_rate ? parseFloat(plan.monthly_rate) : null,
  };
}
