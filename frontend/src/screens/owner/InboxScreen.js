/**
 * InboxScreen — unified two-way SMS inbox.
 *
 * Lists threads grouped by customer, unread first, with a live Supabase
 * subscription so new inbound messages bump threads to the top in real time.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export default function InboxScreen({ navigation }) {
  const { t } = useTranslation('inbox');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = makeStyles(Colors);

  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  // Connect-your-number state — held but unused while the setup UI is
  // commented out. Restore alongside the JSX block when we wire Twilio.
  // const [companyNumber, setCompanyNumber] = useState(null);
  // const [areaCode, setAreaCode] = useState('');
  // const [provisioning, setProvisioning] = useState(false);
  const userIdRef = useRef(null);

  // loadCompanyNumber — re-enable alongside the setup card UI.
  // const loadCompanyNumber = useCallback(async () => { ... }, []);

  const loadThreads = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      userIdRef.current = session?.session?.user?.id || null;

      const res = await fetch(`${BACKEND_URL}/api/sms/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setThreads(Array.isArray(data?.threads) ? data.threads : []);
      setError(null);
    } catch (err) {
      console.warn('[Inbox] load failed:', err.message);
      setError(t('load_failed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  // provisionNumber — re-enable alongside the setup card UI. Hits
  // POST /api/sms/provision with optional { areaCode }.
  // const provisionNumber = useCallback(async () => { ... }, [...]);

  useFocusEffect(
    useCallback(() => {
      loadThreads();
      // loadCompanyNumber(); // re-enable when the setup card comes back
    }, [loadThreads])
  );

  // Realtime: any new sms_messages row in this company bumps the inbox.
  useEffect(() => {
    let channel;
    let cancelled = false;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId || cancelled) return;
      channel = supabase
        .channel(`sms-inbox:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sms_messages' },
          () => loadThreads()
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sms_messages' },
          () => loadThreads()
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadThreads]);

  const filtered = threads.filter((tr) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = tr.customer?.full_name?.toLowerCase() || '';
    const phone = (tr.contact_phone || '').toLowerCase();
    const last = (tr.last_message?.body || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || last.includes(q);
  });

  const totalUnread = threads.reduce((s, tr) => s + (tr.unread_count || 0), 0);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('title')}</Text>
      {threads.length > 0 && (
        <View style={[styles.unreadPill, totalUnread === 0 && styles.unreadPillMuted]}>
          <Text style={[styles.unreadPillText, totalUnread === 0 && styles.unreadPillTextMuted]}>
            {totalUnread === 0 ? t('unread_count_zero') : t('unread_count', { count: totalUnread })}
          </Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  // When the API call fails AND we have no threads, fold the error message
  // into the empty state copy rather than stacking a red banner over it —
  // doubling them up looked broken.
  const showEmptyError = !!error && threads.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}

      {threads.length > 3 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.secondaryText} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('search_placeholder')}
            placeholderTextColor={Colors.secondaryText}
          />
        </View>
      )}

      {error && threads.length > 0 && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* TODO: Connect-your-number flow — hidden for now, revisit when we
          wire up real Twilio provisioning + billing. The handlers
          (loadCompanyNumber, provisionNumber) and i18n keys (setup.*)
          are still in place so re-enabling is just unhiding this block.

      {!companyNumber && (
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>{t('setup.title')}</Text>
          <Text style={styles.setupSubtitle}>{t('setup.subtitle')}</Text>
          <Text style={styles.setupLabel}>{t('setup.area_code_label')}</Text>
          <TextInput
            style={styles.setupInput}
            value={areaCode}
            onChangeText={(v) => setAreaCode(v.replace(/\D/g, '').slice(0, 3))}
            placeholder={t('setup.area_code_placeholder')}
            placeholderTextColor={Colors.secondaryText}
            keyboardType="number-pad"
            maxLength={3}
            editable={!provisioning}
          />
          <TouchableOpacity
            onPress={provisionNumber}
            disabled={provisioning}
            style={[styles.setupCta, provisioning && styles.setupCtaDisabled]}
            activeOpacity={0.8}
          >
            {provisioning ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.setupCtaText}>{t('setup.cta')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {companyNumber && (
        <View style={styles.numberRow}>
          <Ionicons name="call-outline" size={14} color={Colors.secondaryText} />
          <Text style={styles.numberText}>{t('setup.current_number', { phone: companyNumber })}</Text>
        </View>
      )}
      */}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadThreads(); }}
            tintColor={Colors.primaryBlue}
          />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={56} color={Colors.border} />
            <Text style={styles.emptyTitle}>{t('empty')}</Text>
            {showEmptyError && (
              <Text style={styles.emptySubtle}>{error}</Text>
            )}
            <TouchableOpacity
              onPress={() => { setError(null); setRefreshing(true); loadThreads(); }}
              style={styles.emptyRefresh}
            >
              <Ionicons name="refresh" size={14} color={Colors.primaryBlue} />
              <Text style={styles.emptyRefreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((tr) => {
            const name = tr.customer?.full_name || tr.contact_phone || t('unknown_sender');
            const isUnread = tr.unread_count > 0;
            const last = tr.last_message;
            const preview = last?.body || '';
            const directionPrefix = last?.direction === 'out' ? `${t('you')}: ` : '';
            return (
              <TouchableOpacity
                key={tr.key}
                style={[styles.threadRow, isUnread && styles.threadRowUnread]}
                onPress={() =>
                  navigation.navigate('Thread', {
                    customerId: tr.customer_id,
                    customerName: tr.customer?.full_name || null,
                    contactPhone: tr.contact_phone,
                  })
                }
                activeOpacity={0.7}
              >
                <View style={[styles.avatar, isUnread && styles.avatarUnread]}>
                  <Text style={[styles.avatarText, isUnread && styles.avatarTextUnread]}>
                    {initials(name)}
                  </Text>
                </View>
                <View style={styles.threadBody}>
                  <View style={styles.threadTopRow}>
                    <Text style={[styles.threadName, isUnread && styles.threadNameUnread]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.threadTime}>{relativeTime(last?.created_at)}</Text>
                  </View>
                  <View style={styles.threadBottomRow}>
                    <Text style={[styles.threadPreview, isUnread && styles.threadPreviewUnread]} numberOfLines={1}>
                      {directionPrefix}{preview}
                    </Text>
                    {isUnread && (
                      <View style={styles.unreadDot}>
                        <Text style={styles.unreadDotText}>{tr.unread_count}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingRight: 16,
      paddingVertical: 12,
      backgroundColor: Colors.cardBackground,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backBtn: { padding: 6, marginRight: 4 },
    headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.primaryText, flex: 1 },
    unreadPill: {
      backgroundColor: Colors.primaryBlue,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    unreadPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    unreadPillMuted: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
    unreadPillTextMuted: { color: Colors.secondaryText },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: Colors.primaryText },
    content: { paddingTop: 8, paddingBottom: 40 },
    empty: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 40 },
    emptyTitle: {
      fontSize: 15,
      color: Colors.primaryText,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 22,
      fontWeight: '500',
    },
    emptySubtle: {
      fontSize: 13,
      color: Colors.secondaryText,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 18,
    },
    emptyRefresh: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 20,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    emptyRefreshText: { color: Colors.primaryBlue, fontSize: 13, fontWeight: '600' },
    errorBanner: {
      backgroundColor: '#FEE2E2',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    errorBannerText: { color: '#B91C1C', fontSize: 13 },
    setupCard: {
      margin: 16,
      padding: 18,
      borderRadius: 16,
      backgroundColor: Colors.cardBackground,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    setupTitle: { fontSize: 16, fontWeight: '700', color: Colors.primaryText },
    setupSubtitle: {
      fontSize: 13,
      color: Colors.secondaryText,
      marginTop: 6,
      lineHeight: 18,
    },
    setupLabel: {
      fontSize: 12,
      color: Colors.secondaryText,
      marginTop: 14,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontWeight: '600',
    },
    setupInput: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: Colors.primaryText,
      backgroundColor: Colors.background,
    },
    setupCta: {
      marginTop: 14,
      backgroundColor: Colors.primaryBlue,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    setupCtaDisabled: { opacity: 0.5 },
    setupCtaText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    numberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    numberText: { fontSize: 12, color: Colors.secondaryText },
    threadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: Colors.cardBackground,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Colors.border,
    },
    threadRowUnread: { backgroundColor: Colors.cardBackground },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarUnread: { backgroundColor: '#DBEAFE' },
    avatarText: { fontSize: 14, fontWeight: '600', color: Colors.secondaryText },
    avatarTextUnread: { color: '#1D4ED8' },
    threadBody: { flex: 1 },
    threadTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    threadName: { flex: 1, fontSize: 15, color: Colors.primaryText, fontWeight: '500' },
    threadNameUnread: { fontWeight: '700' },
    threadTime: { fontSize: 12, color: Colors.secondaryText, marginLeft: 8 },
    threadBottomRow: { flexDirection: 'row', alignItems: 'center' },
    threadPreview: {
      flex: 1,
      fontSize: 13,
      color: Colors.secondaryText,
      lineHeight: 17,
    },
    threadPreviewUnread: { color: Colors.primaryText, fontWeight: '500' },
    unreadDot: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: Colors.primaryBlue,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      paddingHorizontal: 6,
    },
    unreadDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  });
}
