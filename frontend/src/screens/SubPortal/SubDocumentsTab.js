/**
 * SubDocumentsTab — all compliance docs in one place.
 *
 * Shows COI, W9, license, etc. with status / expiry. Replace doc, add new.
 * Visual language matches Home and Work tabs.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';

const SUB_VIOLET = '#8B5CF6';

const COMPLIANCE_TYPE_LABELS = {
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

const PROJECT_FILE_LABELS = {
  signed_contract: 'Signed contract',
  invoice_pdf:     'Invoice (PDF)',
  proposal:        'Proposal / quote',
  change_order:    'Change order',
  work_photo:      'Work photo',
  other_doc:       'Other document',
};

const DOC_TYPE_LABELS = { ...COMPLIANCE_TYPE_LABELS, ...PROJECT_FILE_LABELS };

const DOC_ICONS = {
  // Compliance
  w9: 'receipt-outline',
  coi_gl: 'shield-checkmark-outline',
  coi_wc: 'shield-checkmark-outline',
  coi_auto: 'car-outline',
  coi_umbrella: 'umbrella-outline',
  ai_endorsement: 'document-text-outline',
  waiver_subrogation: 'document-text-outline',
  license_state: 'ribbon-outline',
  license_business: 'business-outline',
  drug_policy: 'flask-outline',
  msa: 'document-attach-outline',
  // Project files
  signed_contract: 'create-outline',
  invoice_pdf:     'cash-outline',
  proposal:        'reader-outline',
  change_order:    'swap-horizontal-outline',
  work_photo:      'camera-outline',
  other_doc:       'document-outline',
};

export default function SubDocumentsTab({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [subOrg, setSubOrg] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingType, setUploadingType] = useState(null);
  const [openingDocId, setOpeningDocId] = useState(null);

  const onOpenDoc = async (d) => {
    if (!d?.id || openingDocId) return;
    setOpeningDocId(d.id);
    try {
      const res = await api.getDocumentSignedUrl(d.id);
      if (!res?.url) throw new Error('No URL');
      const ext = (d.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = (d.file_mime || '').includes('pdf') || ext === 'pdf';
      const isImage = (d.file_mime || '').startsWith('image/') ||
        ['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext);
      navigation?.navigate?.('DocumentViewer', {
        fileUrl: res.url,
        fileName: d.file_name || d.doc_type,
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again.');
    } finally {
      setOpeningDocId(null);
    }
  };

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

  const pickerBusyRef = useRef(false);

  const onUpload = async (docType) => {
    if (!subOrg) return;
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
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
      const stuck = /Different document picking in progress|Await other document/.test(e?.message || '');
      Alert.alert(
        stuck ? 'iOS picker is stuck' : 'Upload failed',
        stuck
          ? 'iOS thinks a previous picker is still open. Reload the app to clear it.'
          : (e.message || 'Unknown error'),
      );
    } finally {
      pickerBusyRef.current = false;
      setUploadingType(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </View>
    );
  }

  // For compliance: keep most recent per doc_type. For project files:
  // show every uploaded file (multiple invoices, photos, etc.).
  const complianceTypes = Object.keys(COMPLIANCE_TYPE_LABELS);
  const projectFileTypes = Object.keys(PROJECT_FILE_LABELS);

  const compByType = {};
  for (const d of docs) {
    if (!complianceTypes.includes(d.doc_type)) continue;
    if (!compByType[d.doc_type]) compByType[d.doc_type] = d;
  }
  const presentCompliance = Object.keys(compByType);
  const missingCompliance = complianceTypes.filter((t) => !presentCompliance.includes(t));

  const projectFiles = docs
    .filter((d) => projectFileTypes.includes(d.doc_type))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const computeStatus = (d) => {
    if (!d.expires_at) return { label: 'Active', color: '#10B981', bg: '#10B98115' };
    const now = new Date();
    const days = Math.floor((new Date(d.expires_at) - now) / 86400000);
    if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, color: '#DC2626', bg: '#DC262615' };
    if (days <= 30) return { label: `Expires in ${days}d`, color: '#F59E0B', bg: '#F59E0B15' };
    return { label: `Active`, color: '#10B981', bg: '#10B98115' };
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SUB_VIOLET} />
      }
    >
      <Text style={styles.headerTitle}>Documents</Text>
      <Text style={styles.headerSub}>
        Your compliance vault. Upload once — visible to every contractor who hires you.
        {'\n\n'}Project-specific files (signed contracts, invoices, photos) live inside each job under Jobs → tap a job.
      </Text>

      {/* Compliance — On file */}
      <Text style={styles.sectionTitle}>On file</Text>
      {presentCompliance.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Ionicons name="folder-open-outline" size={26} color={Colors.secondaryText} />
          <Text style={styles.emptyText}>No documents uploaded yet.</Text>
        </View>
      ) : (
        presentCompliance.map((t) => {
          const d = compByType[t];
          const status = computeStatus(d);
          const isOpening = openingDocId === d.id;
          return (
            <TouchableOpacity
              key={t}
              style={styles.docCard}
              activeOpacity={0.7}
              onPress={() => onOpenDoc(d)}
              disabled={isOpening}
            >
              <View style={styles.docIconWrap}>
                <Ionicons name={DOC_ICONS[t] || 'document-outline'} size={20} color={Colors.primaryText} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.docTitle} numberOfLines={1}>{DOC_TYPE_LABELS[t] || t}</Text>
                <View style={[styles.statusPill, { backgroundColor: status.bg, marginTop: 4 }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.replaceBtn}
                onPress={() => onUpload(t)}
                disabled={uploadingType === t}
                activeOpacity={0.7}
              >
                {uploadingType === t ? (
                  <ActivityIndicator size="small" color={Colors.secondaryText} />
                ) : (
                  <Text style={styles.replaceBtnText}>Replace</Text>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      )}

      {/* Compliance — Missing */}
      {missingCompliance.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Add</Text>
          {missingCompliance.map((t) => (
            <TouchableOpacity
              key={t}
              style={styles.addCard}
              onPress={() => onUpload(t)}
              disabled={uploadingType === t}
              activeOpacity={0.7}
            >
              <View style={[styles.docIconWrap, styles.addIconWrap]}>
                <Ionicons name={DOC_ICONS[t] || 'add'} size={20} color={Colors.secondaryText} />
              </View>
              <Text style={styles.addCardLabel}>{DOC_TYPE_LABELS[t] || t}</Text>
              {uploadingType === t ? (
                <ActivityIndicator size="small" color={SUB_VIOLET} />
              ) : (
                <Ionicons name="add-circle" size={22} color={SUB_VIOLET} />
              )}
            </TouchableOpacity>
          ))}
        </>
      )}

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 14, color: Colors.secondaryText, marginTop: 4, marginBottom: 16, lineHeight: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 10,
  },
  emptyBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyText: { color: Colors.secondaryText, fontSize: 14 },
  subsectionHint: { fontSize: 12, color: Colors.secondaryText, marginTop: -4, marginBottom: 10, lineHeight: 18 },
  fileMeta: { fontSize: 11, color: Colors.secondaryText, marginTop: 3 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  addIconWrap: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  docTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  replaceBtn: {
    paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    minWidth: 70, alignItems: 'center', marginLeft: 10,
  },
  replaceBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primaryText },
  addCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  addCardLabel: { flex: 1, fontSize: 14, color: Colors.primaryText, marginLeft: 12, fontWeight: '500' },
});
