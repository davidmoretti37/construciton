import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';

// Reads the latest nightly business briefing snapshot for the current user.
// RLS lets owners read their own row and supervisors read their owner's row.
// Falls back to an on-demand RPC compute when no snapshot exists yet (first
// install, before the cron has run).
export const fetchLatestBusinessInsights = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('business_insights')
      .select('id, generated_at, item_count, high_count, medium_count, items')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    if (data) return data;

    // No snapshot yet — compute on demand. Same shape minus id.
    const { data: live } = await supabase.rpc('compute_business_briefing');
    if (!live) return null;
    return {
      id: null,
      generated_at: live.generated_at,
      item_count: live.item_count || 0,
      high_count: live.high_count || 0,
      medium_count: live.medium_count || 0,
      items: live.items || [],
    };
  } catch {
    return null;
  }
};
