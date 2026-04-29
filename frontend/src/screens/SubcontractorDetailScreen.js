/**
 * SubcontractorDetailScreen — full sub profile with tabs.
 *
 * Tabs: Overview / Documents / Bids / Engagements / Invoices & Payments
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

const TABS = ['Overview', 'Documents', 'Bids', 'Engagements', 'Invoices'];

export default function SubcontractorDetailScreen({ route, navigation }) {
  const { sub_organization_id } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [sub, setSub] = useState(null);
  const [docs, setDocs] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [subRes, docList, engs] = await Promise.all([
        api.getSub(sub_organization_id),
        api.listComplianceDocs(sub_organization_id),
        api.listEngagements(),
      ]);
      setSub(subRes.sub_organization);
      setDocs(docList);
      setEngagements(engs.filter((e) => e.sub_organization_id === sub_organization_id));
    } catch (e) {
      console.warn('[SubcontractorDetail] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sub_organization_id]);

  useEffect(() => { load(); }, [load]);

  const onRequestDoc = async (docType) => {
    try {
      await api.requestDocFromSub(sub_organization_id, docType);
      Alert.alert('Sent', `Sub will receive an email to upload ${docType}.`);
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  if (!sub) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.background }]}>
        <Text style={{ color: Colors.primaryText }}>Subcontractor not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{sub.legal_name}</Text>
          <Text style={styles.meta}>{(sub.trades || []).join(', ')}</Text>
        </View>
      </View>

      {/* Tab strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabStrip}
      >
        {TABS.map((t) => {
          const isActive = activeTab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {activeTab === 'Overview' && (
          <View>
            <DataRow label="Legal name" value={sub.legal_name} Colors={Colors} />
            {sub.dba && <DataRow label="DBA" value={sub.dba} Colors={Colors} />}
            <DataRow label="Email" value={sub.primary_email} Colors={Colors} />
            {sub.primary_phone && <DataRow label="Phone" value={sub.primary_phone} Colors={Colors} />}
            {sub.tax_id && <DataRow label="EIN" value={sub.tax_id} Colors={Colors} />}
            {sub.address_line1 && <DataRow label="Address" value={`${sub.address_line1}${sub.city ? `, ${sub.city}` : ''} ${sub.state_code || ''} ${sub.postal_code || ''}`} Colors={Colors} />}
            <DataRow
              label="Account"
              value={sub.auth_user_id ? (sub.upgraded_at ? 'Sylk Owner (paid)' : 'Sub Free (logged in)') : 'Magic-link only'}
              Colors={Colors}
            />
          </View>
        )}

        {activeTab === 'Documents' && (
          <View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {['coi_gl', 'w9', 'license_state'].map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => onRequestDoc(t)}
                  style={[styles.requestBtn, { borderColor: Colors.primaryBlue }]}
                >
                  <Text style={[styles.requestBtnText, { color: Colors.primaryBlue }]}>Request {t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {docs.length === 0 && <Text style={styles.emptyText}>No documents on file.</Text>}
            {docs.map((d) => (
              <View key={d.id} style={styles.docCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{d.doc_type.toUpperCase()}</Text>
                  <Text style={styles.docMeta}>
                    {d.expires_at ? `Expires ${d.expires_at}` : 'No expiration'} · {d.verification_status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Bids' && (
          <Text style={styles.emptyText}>No bid history yet for this sub.</Text>
        )}

        {activeTab === 'Engagements' && (
          <View>
            {engagements.length === 0 && <Text style={styles.emptyText}>No engagements yet.</Text>}
            {engagements.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={styles.docCard}
                onPress={() => navigation.navigate('EngagementDetail', { engagement_id: e.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{e.trade}</Text>
                  <Text style={styles.docMeta}>
                    {e.contract_amount ? `$${Number(e.contract_amount).toLocaleString()}` : '—'} · {e.status}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'Invoices' && (
          <Text style={styles.emptyText}>Invoices show on the engagement detail screen.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DataRow({ label, value, Colors }) {
  return (
    <View style={dataRowStyles.row}>
      <Text style={[dataRowStyles.label, { color: Colors.secondaryText }]}>{label}</Text>
      <Text style={[dataRowStyles.value, { color: Colors.primaryText }]}>{value || '—'}</Text>
    </View>
  );
}

const dataRowStyles = StyleSheet.create({
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 15 },
});

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
  backBtn: { padding: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: Colors.primaryText },
  meta: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  tabStrip: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Colors.cardBackground },
  tabActive: { backgroundColor: Colors.primaryBlue },
  tabText: { fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  body: { padding: 16, paddingBottom: 80 },
  requestBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  requestBtnText: { fontSize: 12, fontWeight: '600' },
  emptyText: { color: Colors.secondaryText, fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  docCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  docTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  docMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
});
