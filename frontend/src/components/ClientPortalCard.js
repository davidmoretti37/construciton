import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const PORTAL_URL = 'https://sylkapp.ai/portal';
const APP_LINK = 'sylk://portal';

export default function ClientPortalCard({ project, navigation }) {
  const { t } = useTranslation('common');
  const [portalData, setPortalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [showShareForm, setShowShareForm] = useState(false);

  // Share form fields
  const [clientName, setClientName] = useState(project?.client || '');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  useEffect(() => {
    loadPortalStatus();
  }, [project?.id]);

  const loadPortalStatus = async () => {
    if (!project?.id) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;

      // Check if project is shared with any client
      const { data: projectClients } = await supabase
        .from('project_clients')
        .select(`
          id, access_token, created_at,
          clients (id, full_name, email, phone)
        `)
        .eq('project_id', project.id);

      if (projectClients && projectClients.length > 0) {
        const pc = projectClients[0];
        setPortalData({
          projectClientId: pc.id,
          accessToken: pc.access_token,
          client: pc.clients,
          portalUrl: `https://sylkapp.ai/portal/login?email=${encodeURIComponent(pc.clients?.email || '')}`,
          sharedAt: pc.created_at,
        });
      }
    } catch (error) {
      console.error('Error loading portal status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!clientName.trim() || !clientEmail.trim()) {
      Alert.alert('Required', 'Client name and email are required.');
      return;
    }

    setSharing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await fetch(`${BACKEND_URL}/api/portal-admin/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to share');

      setPortalData({
        projectClientId: data.projectClientId,
        accessToken: data.accessToken,
        client: { full_name: clientName, email: clientEmail },
        portalUrl: data.portalUrl,
      });
      setShowShareForm(false);

      // Offer to share the link
      Share.share({
        message: `View your project "${project.name}" on Sylk: ${data.portalUrl}\n\nDon't have the app? Download Sylk from the App Store.`,
        url: data.portalUrl,
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    if (portalData?.portalUrl) {
      await Clipboard.setStringAsync(portalData.portalUrl);
      Alert.alert('Copied', 'Portal link copied to clipboard.');
    }
  };

  const handleShareLink = async () => {
    if (portalData?.portalUrl) {
      Share.share({
        message: `View your project "${project.name}" here: ${portalData.portalUrl}`,
        url: portalData.portalUrl,
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="globe-outline" size={18} color="#3B82F6" />
        </View>
        <Text style={styles.title}>Client Portal</Text>
      </View>

      {portalData ? (
        // Shared state
        <View>
          <View style={styles.statusRow}>
            <View style={styles.liveDot} />
            <Text style={styles.statusText}>Live</Text>
          </View>

          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{portalData.client?.full_name}</Text>
            <Text style={styles.clientEmail}>{portalData.client?.email}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={16} color="#3B82F6" />
              <Text style={styles.actionText}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleShareLink}>
              <Ionicons name="share-outline" size={16} color="#3B82F6" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation?.navigate('ClientVisibility', { projectId: project.id })}
            >
              <Ionicons name="eye-outline" size={16} color="#3B82F6" />
              <Text style={styles.actionText}>Visibility</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : showShareForm ? (
        // Share form
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={clientName}
            onChangeText={setClientName}
            placeholder="Client name"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.input}
            value={clientEmail}
            onChangeText={setClientEmail}
            placeholder="Client email"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={clientPhone}
            onChangeText={setClientPhone}
            placeholder="Client phone (optional)"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />
          <View style={styles.formActions}>
            <TouchableOpacity onPress={() => setShowShareForm(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareBtn, sharing && { opacity: 0.5 }]}
              onPress={handleShare}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.shareBtnText}>Share</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // Not shared state
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => setShowShareForm(true)}
        >
          <Ionicons name="share-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.shareBtnText}>Share with Client</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#22C55E',
  },
  clientInfo: {
    marginBottom: 12,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  clientEmail: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
  },
  form: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
