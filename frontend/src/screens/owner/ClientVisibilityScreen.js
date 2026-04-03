import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const toggles = [
  { key: 'show_phases', label: 'Schedule & Phases', desc: 'Phase timeline with progress', icon: 'calendar-outline' },
  { key: 'show_photos', label: 'Photos', desc: 'Daily report photos', icon: 'camera-outline' },
  { key: 'show_budget', label: 'Budget & Financials', desc: 'Contract, payments, expenses', icon: 'cash-outline' },
  { key: 'show_daily_logs', label: 'Daily Log Details', desc: 'Work performed, weather, materials', icon: 'document-text-outline' },
  { key: 'show_documents', label: 'Documents', desc: 'Project documents and files', icon: 'folder-outline' },
  { key: 'show_messages', label: 'Messages', desc: 'Client can message you', icon: 'chatbubble-outline' },
  { key: 'show_site_activity', label: 'Site Activity', desc: '"Crew on site" from clock-ins', icon: 'location-outline' },
];

const notificationToggles = [
  { key: 'weekly_summary_enabled', label: 'Weekly AI Summary', desc: 'Auto-generate weekly updates', icon: 'sparkles-outline' },
  { key: 'invoice_reminders', label: 'Invoice Reminders', desc: 'Payment reminder notifications', icon: 'notifications-outline' },
];

export default function ClientVisibilityScreen({ route, navigation }) {
  const { projectId } = route.params;
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await fetch(`${BACKEND_URL}/api/portal-admin/settings/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key, value) => {
    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaving(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      await fetch(`${BACKEND_URL}/api/portal-admin/settings/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (error) {
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: !value }));
      console.error('Error saving setting:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Client Visibility</Text>
        {saving && <ActivityIndicator size="small" color="#3B82F6" style={{ marginLeft: 8 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>What your client can see</Text>
        <View style={styles.card}>
          {toggles.map((toggle, i) => (
            <View key={toggle.key} style={[styles.toggleRow, i < toggles.length - 1 && styles.toggleBorder]}>
              <View style={styles.toggleIcon}>
                <Ionicons name={toggle.icon} size={18} color="#6B7280" />
              </View>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{toggle.label}</Text>
                <Text style={styles.toggleDesc}>{toggle.desc}</Text>
              </View>
              <Switch
                value={settings?.[toggle.key] || false}
                onValueChange={(val) => handleToggle(toggle.key, val)}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={settings?.[toggle.key] ? '#3B82F6' : '#f4f3f4'}
              />
            </View>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Notifications</Text>
        <View style={styles.card}>
          {notificationToggles.map((toggle, i) => (
            <View key={toggle.key} style={[styles.toggleRow, i < notificationToggles.length - 1 && styles.toggleBorder]}>
              <View style={styles.toggleIcon}>
                <Ionicons name={toggle.icon} size={18} color="#6B7280" />
              </View>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{toggle.label}</Text>
                <Text style={styles.toggleDesc}>{toggle.desc}</Text>
              </View>
              <Switch
                value={settings?.[toggle.key] || false}
                onValueChange={(val) => handleToggle(toggle.key, val)}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={settings?.[toggle.key] ? '#3B82F6' : '#f4f3f4'}
              />
            </View>
          ))}
        </View>

        <Text style={styles.footerNote}>
          Project status, estimates, and invoices are always visible to clients.
          Drafts are never shown.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  toggleDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  footerNote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
});
