/**
 * ThreadScreen — full message history with one customer.
 *
 * Bubbles, send box, and a chip that opens an "Ask Foreman" follow-up in the
 * chat with this thread's context preloaded. Auto-marks the thread as read
 * on focus, and subscribes to inbound updates so the bubble appears in
 * real time.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ThreadScreen({ route, navigation }) {
  const { t } = useTranslation('inbox');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = makeStyles(Colors);

  const customerId = route?.params?.customerId || null;
  const initialName = route?.params?.customerName || null;
  const contactPhone = route?.params?.contactPhone || null;

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [customer, setCustomer] = useState(initialName ? { full_name: initialName } : null);
  const scrollRef = useRef(null);

  const headerTitle = customer?.full_name
    ? t('thread_header', { name: customer.full_name })
    : (contactPhone || t('unknown_sender'));

  const loadThread = useCallback(async () => {
    if (!customerId) {
      // Phone-only thread (sender wasn't matched to a customer record yet).
      // We don't have a server endpoint that fetches by phone — punt and
      // show empty state. The realtime feed will populate as messages
      // arrive.
      setLoading(false);
      return;
    }
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/api/sms/threads/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setError(null);
    } catch (err) {
      console.warn('[Thread] load failed:', err.message);
      setError(t('load_failed'));
    } finally {
      setLoading(false);
    }
  }, [customerId, t]);

  const markRead = useCallback(async () => {
    if (!customerId) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      await fetch(`${BACKEND_URL}/api/sms/threads/${customerId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (_) { /* best-effort */ }
  }, [customerId]);

  useEffect(() => {
    loadThread().then(markRead);
  }, [loadThread, markRead]);

  // Realtime: append new messages for this thread without re-fetching.
  useEffect(() => {
    if (!customerId) return;
    const channel = supabase
      .channel(`sms-thread:${customerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: `customer_id=eq.${customerId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          markRead();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customerId, markRead]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
    }
  }, [messages.length]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('not authenticated');

      const payload = customerId ? { customerId, body } : { to: contactPhone, body };
      const res = await fetch(`${BACKEND_URL}/api/sms/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setDraft('');
      setError(null);
    } catch (err) {
      console.warn('[Thread] send failed:', err.message);
      setError(t('send_failed'));
    } finally {
      setSending(false);
    }
  }, [draft, sending, customerId, contactPhone, t]);

  const askForeman = useCallback(() => {
    const recent = messages.slice(-6).map((m) => `${m.direction === 'in' ? 'Customer' : 'Me'}: ${m.body}`).join('\n');
    const initial = `Help me think through this SMS thread with ${customer?.full_name || contactPhone || 'this customer'}:\n\n${recent}`;
    navigation.navigate('Chat', {
      initialMessage: initial,
      threadContext: {
        customerId,
        customerName: customer?.full_name,
        contactPhone,
        messages: messages.slice(-10),
      },
    });
  }, [messages, customer, contactPhone, customerId, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          {contactPhone && customer?.full_name && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{contactPhone}</Text>
          )}
        </View>
        <TouchableOpacity onPress={askForeman} style={styles.foremanBtn}>
          <Ionicons name="sparkles-outline" size={18} color={Colors.primaryBlue} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.bubbleList}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd?.({ animated: false })}
          >
            {messages.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t('empty')}</Text>
              </View>
            )}
            {messages.map((m) => {
              const isOut = m.direction === 'out';
              return (
                <View key={m.id} style={[styles.bubbleRow, isOut ? styles.bubbleRowOut : styles.bubbleRowIn]}>
                  <View style={[styles.bubble, isOut ? styles.bubbleOut : styles.bubbleIn]}>
                    <Text style={isOut ? styles.bubbleTextOut : styles.bubbleTextIn}>{m.body}</Text>
                  </View>
                  <Text style={styles.bubbleMeta}>
                    {formatTime(m.created_at)}
                    {m.status && m.status !== 'received' && m.status !== 'queued' && m.status !== 'sent'
                      ? ` · ${t(`message_status.${m.status}`, { defaultValue: m.status })}`
                      : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity onPress={askForeman} style={styles.askForemanRow}>
          <Ionicons name="sparkles-outline" size={14} color={Colors.primaryBlue} />
          <Text style={styles.askForemanText}>{t('ask_foreman')}</Text>
        </TouchableOpacity>

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('send_placeholder')}
            placeholderTextColor={Colors.secondaryText}
            multiline
            maxLength={1500}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
      paddingVertical: 10,
      backgroundColor: Colors.cardBackground,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backBtn: { padding: 6 },
    headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
    headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.primaryText },
    headerSubtitle: { fontSize: 12, color: Colors.secondaryText, marginTop: 1 },
    foremanBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#EFF6FF',
    },
    bubbleList: {
      paddingHorizontal: 12,
      paddingVertical: 16,
      paddingBottom: 16,
    },
    empty: { paddingTop: 80, alignItems: 'center' },
    emptyText: { color: Colors.secondaryText, fontSize: 13, paddingHorizontal: 30, textAlign: 'center' },
    bubbleRow: { marginBottom: 10, maxWidth: '85%' },
    bubbleRowIn: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubbleRowOut: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
    bubbleIn: {
      backgroundColor: Colors.cardBackground,
      borderTopLeftRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: Colors.border,
    },
    bubbleOut: {
      backgroundColor: Colors.primaryBlue,
      borderTopRightRadius: 4,
    },
    bubbleTextIn: { color: Colors.primaryText, fontSize: 15, lineHeight: 20 },
    bubbleTextOut: { color: '#fff', fontSize: 15, lineHeight: 20 },
    bubbleMeta: { color: Colors.secondaryText, fontSize: 11, marginTop: 4, paddingHorizontal: 4 },
    askForemanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    askForemanText: { color: Colors.primaryBlue, fontSize: 12, fontWeight: '500' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: Colors.cardBackground,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      gap: 8,
    },
    composerInput: {
      flex: 1,
      minHeight: 38,
      maxHeight: 120,
      backgroundColor: Colors.background,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 15,
      color: Colors.primaryText,
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: Colors.primaryBlue,
      alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: Colors.border },
    errorBanner: {
      backgroundColor: '#FEE2E2',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    errorBannerText: { color: '#B91C1C', fontSize: 13 },
  });
}
