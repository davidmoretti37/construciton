/**
 * InboxBell — header icon that surfaces unread SMS count.
 *
 * Polls /api/sms/threads on focus and subscribes to sms_messages inserts
 * for live badge updates. Tapping navigates to the Inbox screen.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, LightColors } from '../constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function InboxBell({ onPress, size = 22 }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  const fetchCount = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/api/sms/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const total = (data?.threads || []).reduce((s, t) => s + (t.unread_count || 0), 0);
      if (mounted.current) setUnread(total);
    } catch (_) { /* silent */ }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchCount();

    let channel;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) return;
      channel = supabase
        .channel(`inbox-bell:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sms_messages' },
          (payload) => {
            if (payload.new?.direction === 'in' && !payload.new?.read_at) {
              setUnread((c) => c + 1);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sms_messages' },
          () => fetchCount()
        )
        .subscribe();
    })();

    return () => {
      mounted.current = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  const formatBadge = (n) => (n > 99 ? '99+' : String(n));

  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.7}>
      <Ionicons name="chatbubbles-outline" size={size} color={Colors.primaryText || '#1F2937'} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatBadge(unread)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: 8, position: 'relative' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
