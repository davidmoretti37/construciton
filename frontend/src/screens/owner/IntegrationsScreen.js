/**
 * IntegrationsScreen — P12 MCP integrations.
 *
 * Lists available integrations + this user's connection status.
 * Tap-to-connect opens an in-app browser for OAuth (or instant-
 * connects no-auth integrations like the echo test).
 *
 * Connection status pulled from /api/integrations. Updates after
 * each connect/disconnect.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Render an integration icon. Accepts:
//   - a string (Ionicon name, legacy)
//   - { lib: 'fa5-brand'|'fa5'|'ionicon', name, color }
// When forceColor is set (e.g. white-on-green for the connected state) it
// overrides any brand color so the icon stays legible.
function IntegrationIcon({ icon, size = 22, fallbackColor = '#666', forceColor = null }) {
  if (typeof icon === 'string') {
    return <Ionicons name={icon} size={size} color={forceColor || fallbackColor} />;
  }
  if (!icon || typeof icon !== 'object') {
    return <Ionicons name="cube-outline" size={size} color={forceColor || fallbackColor} />;
  }
  const color = forceColor || icon.color || fallbackColor;
  if (icon.lib === 'fa5-brand') {
    return <FontAwesome5 name={icon.name} size={size} color={color} brand />;
  }
  if (icon.lib === 'fa5') {
    return <FontAwesome5 name={icon.name} size={size} color={color} solid />;
  }
  return <Ionicons name={icon.name || 'cube-outline'} size={size} color={color} />;
}

function relativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function IntegrationsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = makeStyles(Colors);

  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyType, setBusyType] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/api/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIntegrations(Array.isArray(data?.integrations) ? data.integrations : []);
    } catch (e) {
      console.warn('[Integrations] load failed:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleConnect = async (integration) => {
    setBusyType(integration.type);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('not authenticated');
      const res = await fetch(`${BACKEND_URL}/api/integrations/${integration.type}/connect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (data.connected) {
        // No-auth integration — connection committed instantly.
        await load();
        return;
      }
      if (data.authorize_url) {
        // OAuth flow — open in-app browser. The provider redirects to
        // our callback URL which writes the credentials, then the
        // result page deep-links back via sylk:// (or the user closes
        // the browser manually).
        const result = await WebBrowser.openAuthSessionAsync(data.authorize_url, 'sylk://integrations/connected');
        await load();

        // Verify the connection actually succeeded server-side before
        // bouncing to chat. Otherwise a cancelled/declined OAuth would
        // still trigger the import prompt.
        const succeeded = result?.type === 'success'
          && (result.url || '').includes('integrations/connected');
        if (!succeeded) return;

        // Auto-prompt the agent for import-capable integrations so the
        // user doesn't have to know to type "import my data" — they just
        // confirm/decline an offer. Other integrations (Google Calendar,
        // Echo) drop them back here, which is fine since they don't have
        // an import flow.
        const importPrompts = {
          qbo: 'I just connected QuickBooks. Run qbo_onboarding_summary and tell me what you found, then ask if I want to import everything (clients, subcontractors, service catalog, projects, invoices).',
          monday: 'I just connected Monday.com. List my boards and ask which one has my projects so we can import them.',
        };
        const prompt = importPrompts[integration.type];
        if (prompt && navigation?.navigate) {
          // Brief delay so the integrations list visibly flips to
          // "Connected" before we navigate away — feels more grounded
          // than the screen vanishing the instant OAuth closes.
          setTimeout(() => {
            navigation.navigate('Chat', { initialMessage: prompt });
          }, 600);
        }
        return;
      }
      throw new Error('Unexpected connect response');
    } catch (e) {
      Alert.alert('Connect failed', e.message);
    } finally {
      setBusyType(null);
    }
  };

  const handleDisconnect = (integration) => {
    Alert.alert(
      `Disconnect ${integration.name}?`,
      'Sylk will lose access to this integration. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusyType(integration.type);
            try {
              const { data: session } = await supabase.auth.getSession();
              const token = session?.session?.access_token;
              await fetch(`${BACKEND_URL}/api/integrations/${integration.type}/disconnect`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              await load();
            } catch (e) {
              Alert.alert('Disconnect failed', e.message);
            } finally {
              setBusyType(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Integrations</Text>
        </View>
        <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Integrations</Text>
      </View>

      <Text style={styles.intro}>
        Connect external tools so Foreman can read your data across systems.
      </Text>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.primaryBlue}
          />
        }
      >
        {integrations.map(intg => {
          const isConnected = intg.connection?.status === 'connected';
          const isExpired = intg.connection?.status === 'expired';
          const isError = intg.connection?.status === 'error';
          const isBusy = busyType === intg.type;
          const canAct = !intg.coming_soon && intg.enabled;

          return (
            <View key={intg.type} style={[styles.card, intg.coming_soon && styles.cardMuted]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, isConnected && styles.iconCircleActive]}>
                  <IntegrationIcon
                    icon={intg.icon}
                    size={20}
                    fallbackColor={Colors.primaryText}
                    forceColor={isConnected ? '#fff' : null}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{intg.name}</Text>
                  <Text style={styles.cardDescription} numberOfLines={3}>{intg.description}</Text>
                  {intg.coming_soon && (
                    <Text style={styles.comingSoon}>Coming soon</Text>
                  )}
                  {isConnected && (
                    <Text style={styles.statusOk}>
                      ✓ Connected{intg.connection.connected_at ? ` · ${relativeTime(intg.connection.connected_at)}` : ''}
                    </Text>
                  )}
                  {isExpired && (
                    <Text style={styles.statusWarn}>⚠ Expired — reconnect</Text>
                  )}
                  {isError && (
                    <Text style={styles.statusError} numberOfLines={2}>
                      ⚠ Error: {intg.connection.last_error || 'unknown'}
                    </Text>
                  )}
                </View>
                {canAct && (
                  <View style={styles.cardActions}>
                    {isBusy ? (
                      <ActivityIndicator size="small" color={Colors.primaryBlue} />
                    ) : isConnected ? (
                      <TouchableOpacity onPress={() => handleDisconnect(intg)} style={styles.btnGhost}>
                        <Text style={styles.btnGhostText}>Disconnect</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => handleConnect(intg)} style={styles.btnPrimary}>
                        <Text style={styles.btnPrimaryText}>Connect</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <Text style={styles.footnote}>
          Tokens are encrypted at rest and scoped to your account. Disconnect anytime — Sylk keeps no copies after that.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 12,
      backgroundColor: C.cardBackground,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    backBtn: { padding: 6, marginRight: 4 },
    headerTitle: { fontSize: 22, fontWeight: '700', color: C.primaryText, flex: 1 },
    intro: {
      fontSize: 13,
      color: C.secondaryText,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      lineHeight: 18,
    },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    card: {
      backgroundColor: C.cardBackground,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    cardMuted: { opacity: 0.6 },
    cardHeader: { flexDirection: 'row', gap: 12 },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    iconCircleActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: C.primaryText, marginBottom: 2 },
    cardDescription: { fontSize: 12, color: C.secondaryText, lineHeight: 17 },
    comingSoon: { fontSize: 11, color: C.secondaryText, fontStyle: 'italic', marginTop: 6 },
    statusOk: { fontSize: 11, color: '#059669', marginTop: 6, fontWeight: '500' },
    statusWarn: { fontSize: 11, color: '#D97706', marginTop: 6, fontWeight: '500' },
    statusError: { fontSize: 11, color: '#DC2626', marginTop: 6 },
    cardActions: { justifyContent: 'center' },
    btnPrimary: {
      backgroundColor: C.primaryBlue,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 18,
    },
    btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    btnGhost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 18,
    },
    btnGhostText: { color: C.primaryText, fontSize: 12, fontWeight: '500' },
    footnote: {
      fontSize: 11,
      color: C.secondaryText,
      textAlign: 'center',
      marginTop: 16,
      paddingHorizontal: 20,
      lineHeight: 16,
    },
  });
}
