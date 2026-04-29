/**
 * SubDocumentsTab — all compliance docs in one place.
 *
 * Shows COI, W9, license, etc. with status / expiry. Replace doc, add new.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';

const DOC_TYPE_LABELS = {
  w9: 'IRS Form W-9',
  coi_gl: 'General Liability COI',
  coi_wc: 'Workers Comp COI',
  coi_auto: 'Commercial Auto COI',
  coi_umbrella: 'Umbrella COI',
  ai_endorsement: 'Additional Insured Endorsement',
  waiver_subrogation: 'Waiver of Subrogation',
  license_state: 'State Contractor License',
  license_business: 'Business License',
  drug_policy: 'Drug Testing Policy',
  msa: 'Master Subcontract Agreement',
};

export default function SubDocumentsTab() {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [subOrg, setSubOrg] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingType, setUploadingType] = useState(null);

  const load = useCallback(async () => {
    try {
      const me = await api.getMe();
      setSubOrg(me.sub_organization);
      if (me.sub_organization?.id) {
        const list = await api.listMyDocuments(me.sub_organization.id);
        setDocs(list);
      }
    } catch (e) {
      console.warn('[SubDocumentsTab] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onUpload = async (docType) => {
    if (!subOrg) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.uri) return;

      setUploadingType(docType);
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await api.uploadDocumentBlob({
        sub_organization_id: subOrg.id,
        doc_type: docType,
        file_name: file.name,
        file_mime: file.mimeType || 'application/pdf',
        file_base64: base64,
      });
      await load();
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Unknown error');
    } finally {
      setUploadingType(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  // Group by doc type
  const byType = {};
  for (const d of docs) {
    if (!byType[d.doc_type]) byType[d.doc_type] = d;
  }
  const presentTypes = Object.keys(byType);
  const missingTypes = Object.keys(DOC_TYPE_LABELS).filter((t) => !presentTypes.includes(t));

  const computeStatus = (d) => {
    if (!d.expires_at) return { label: 'Active', color: Colors.successGreen };
    const now = new Date();
    const days = Math.floor((new Date(d.expires_at) - now) / 86400000);
    if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, color: Colors.errorRed };
    if (days <= 30) return { label: `Expires in ${days}d`, color: Colors.warningOrange };
    return { label: `Expires ${d.expires_at}`, color: Colors.successGreen };
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      <Text style={styles.headerTitle}>Documents</Text>
      <Text style={styles.headerSub}>Upload once — visible to every GC who hires you.</Text>

      <Text style={styles.sectionTitle}>On file</Text>
      {presentTypes.length === 0 && (
        <Text style={styles.emptyText}>No docs uploaded yet.</Text>
      )}
      {presentTypes.map((t) => {
        const d = byType[t];
        const status = computeStatus(d);
        return (
          <View key={t} style={styles.docCard}>
            <View style={styles.docHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>{DOC_TYPE_LABELS[t] || t}</Text>
                <Text style={[styles.docStatus, { color: status.color }]}>{status.label}</Text>
              </View>
              <TouchableOpacity
                style={[styles.replaceBtn, { borderColor: Colors.border }]}
                onPress={() => onUpload(t)}
                disabled={uploadingType === t}
              >
                {uploadingType === t ? (
                  <ActivityIndicator size="small" color={Colors.primaryBlue} />
                ) : (
                  <Text style={styles.replaceBtnText}>Replace</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>Add</Text>
      {missingTypes.map((t) => (
        <TouchableOpacity
          key={t}
          style={styles.addCard}
          onPress={() => onUpload(t)}
          disabled={uploadingType === t}
        >
          <Ionicons name="add-circle-outline" size={22} color={Colors.primaryBlue} />
          <Text style={styles.addCardLabel}>{DOC_TYPE_LABELS[t] || t}</Text>
          {uploadingType === t && <ActivityIndicator size="small" color={Colors.primaryBlue} />}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 80 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 4 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
  },
  emptyText: { color: Colors.secondaryText, fontSize: 14, paddingVertical: 8 },
  docCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  docHeader: { flexDirection: 'row', alignItems: 'center' },
  docTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  docStatus: { fontSize: 12, marginTop: 3 },
  replaceBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8,
    minWidth: 70, alignItems: 'center',
  },
  replaceBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primaryText },
  addCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    gap: 10,
  },
  addCardLabel: { flex: 1, fontSize: 14, color: Colors.primaryText },
});
