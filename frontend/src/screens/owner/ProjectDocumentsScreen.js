/**
 * ProjectDocumentsScreen — full-screen documents list for a project.
 *
 * Mirrors InvoicesDetailScreen / EstimatesDetailScreen patterns:
 *   - Filter chips (All / Plans / Contracts / Photos / Specs / Bid / Other)
 *   - Search field
 *   - Tappable row → opens in DocumentViewer
 *   - "Add Document" CTA → modal with file picker + title + visibility multi-checkbox
 *
 * Route params: { projectId, openAdd? }
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';

const FILTERS = [
  { key: 'all',      label: 'All',      icon: 'apps-outline' },
  { key: 'plan',     label: 'Plans',    icon: 'reader-outline' },
  { key: 'contract', label: 'Contracts',icon: 'document-text-outline' },
  { key: 'photo',    label: 'Photos',   icon: 'image-outline' },
  { key: 'spec',     label: 'Specs',    icon: 'list-outline' },
  { key: 'other',    label: 'Other',    icon: 'document-outline' },
];

const TYPE_VISUAL = {
  plan:        { icon: 'reader-outline',          color: '#1E40AF' },
  contract:    { icon: 'document-text-outline',   color: '#8B5CF6' },
  photo:       { icon: 'image-outline',           color: '#10B981' },
  spec:        { icon: 'list-outline',            color: '#475569' },
  bid:         { icon: 'mail-outline',            color: '#D97706' },
  compliance:  { icon: 'shield-checkmark-outline', color: '#10B981' },
  other:       { icon: 'document-outline',        color: '#475569' },
};

export default function ProjectDocumentsScreen({ route, navigation }) {
  const { projectId, openAdd } = route?.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openingId, setOpeningId] = useState(null);

  const [addOpen, setAddOpen] = useState(!!openAdd);
  const [pickedFile, setPickedFile] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('plan');
  const [visSubs, setVisSubs] = useState(true);
  const [visWorkers, setVisWorkers] = useState(false);
  const [visClients, setVisClients] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pickerBusyRef = useRef(false);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, file_name, file_type, file_url, category, notes, visible_to_subs, visible_to_workers, visible_to_clients, is_important, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocs(data || []);
    } catch (e) {
      console.warn('[ProjectDocuments] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let out = docs;
    if (filter !== 'all') out = out.filter((d) => d.category === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((d) =>
        (d.file_name || '').toLowerCase().includes(q) ||
        (d.notes || '').toLowerCase().includes(q),
      );
    }
    return out;
  }, [docs, filter, search]);

  const counts = useMemo(() => {
    const c = { all: docs.length };
    for (const d of docs) c[d.category] = (c[d.category] || 0) + 1;
    return c;
  }, [docs]);

  const onPickFile = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const a = result.assets?.[0];
        setPickedFile(a);
        if (!docTitle) setDocTitle(a?.name?.replace(/\.[^.]+$/, '') || '');
      }
    } catch (e) {
      Alert.alert('Could not pick file', e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const onPickPhoto = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (!result.canceled) {
        const a = result.assets?.[0];
        setPickedFile({
          uri: a.uri,
          name: a.fileName || `photo-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          size: a.fileSize,
        });
        setDocCategory('photo');
        if (!docTitle) setDocTitle(`Photo ${new Date().toLocaleDateString()}`);
      }
    } catch (e) {
      Alert.alert('Could not pick photo', e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const onUpload = async () => {
    if (!pickedFile) {
      Alert.alert('Pick a file first');
      return;
    }
    if (!docTitle.trim()) {
      Alert.alert('Add a title');
      return;
    }
    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(pickedFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_URL}/api/project-docs/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          fileName: pickedFile.name,
          mimeType: pickedFile.mimeType || 'application/octet-stream',
          base64,
          kind: docCategory,
          title: docTitle.trim(),
          visible_to_subs: visSubs,
          visible_to_workers: visWorkers,
          visible_to_clients: visClients,
          is_important: isImportant,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');

      // Reset modal
      setAddOpen(false);
      setPickedFile(null);
      setDocTitle('');
      setDocCategory('plan');
      setVisSubs(true);
      setVisWorkers(false);
      setVisClients(false);
      setIsImportant(false);
      await load();
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const onOpenDoc = async (doc) => {
    if (openingId) return;
    setOpeningId(doc.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_URL}/api/project-docs/${doc.id}/signed-url`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.signedUrl) throw new Error(json.error || 'No URL');

      const ext = (doc.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = doc.file_type === 'pdf' || ext === 'pdf';
      const isImage = doc.file_type === 'image' || ['jpg','jpeg','png','gif','webp','heic'].includes(ext);

      navigation.navigate('DocumentViewer', {
        fileUrl: json.signedUrl,
        fileName: doc.file_name,
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message);
    } finally {
      setOpeningId(null);
    }
  };

  const onDeleteDoc = (doc) => {
    Alert.alert(
      'Delete document?',
      `Remove "${doc.file_name}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('project_documents')
                .delete()
                .eq('id', doc.id);
              if (error) throw error;
              await load();
            } catch (e) {
              Alert.alert('Could not delete', e.message);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Documents</Text>
          <Text style={styles.headerSub}>
            {docs.length} document{docs.length === 1 ? '' : 's'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setAddOpen(true)} style={styles.addIconBtn} activeOpacity={0.7}>
          <Ionicons name="add-circle" size={28} color={Colors.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={Colors.secondaryText} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search documents"
          placeholderTextColor={Colors.placeholder || '#9CA3AF'}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const n = counts[f.key] || 0;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, isActive && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue }]}
              activeOpacity={0.8}
            >
              <Ionicons name={f.icon} size={13} color={isActive ? '#fff' : Colors.primaryText} />
              <Text style={[styles.chipText, isActive && { color: '#fff', fontWeight: '700' }]}>
                {f.label}{n > 0 ? `  ${n}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView contentContainerStyle={styles.listScroll}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={42} color={Colors.secondaryText} />
            <Text style={styles.emptyTitle}>
              {search || filter !== 'all' ? 'No matches' : 'No documents yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {search || filter !== 'all'
                ? 'Try a different filter or clear your search.'
                : 'Tap + to add plans, contracts, photos, or specs.'}
            </Text>
          </View>
        ) : (
          filtered.map((d) => {
            const visual = TYPE_VISUAL[d.category] || TYPE_VISUAL.other;
            return (
              <TouchableOpacity
                key={d.id}
                style={styles.docCard}
                activeOpacity={0.7}
                onPress={() => onOpenDoc(d)}
                onLongPress={() => onDeleteDoc(d)}
              >
                <View style={[styles.iconCircle, { backgroundColor: visual.color + '15' }]}>
                  <Ionicons name={visual.icon} size={20} color={visual.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.docTitle} numberOfLines={1}>{d.file_name}</Text>
                    {d.is_important && (
                      <View style={styles.importantPill}>
                        <Ionicons name="star" size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      {d.category}
                      {d.created_at ? `  ·  ${new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <View style={styles.visRow}>
                      {d.visible_to_subs    && <View style={[styles.visChip, { backgroundColor: '#8B5CF615' }]}><Text style={[styles.visChipText, { color: '#8B5CF6' }]}>S</Text></View>}
                      {d.visible_to_workers && <View style={[styles.visChip, { backgroundColor: '#10B98115' }]}><Text style={[styles.visChipText, { color: '#10B981' }]}>W</Text></View>}
                      {d.visible_to_clients && <View style={[styles.visChip, { backgroundColor: '#1E40AF15' }]}><Text style={[styles.visChipText, { color: '#1E40AF' }]}>C</Text></View>}
                      {!d.visible_to_subs && !d.visible_to_workers && !d.visible_to_clients && (
                        <Text style={[styles.metaText, { fontStyle: 'italic' }]}>Private</Text>
                      )}
                    </View>
                  </View>
                </View>
                {openingId === d.id
                  ? <ActivityIndicator size="small" color={Colors.secondaryText} />
                  : <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Add Doc Modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => !uploading && setAddOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add document</Text>
              <TouchableOpacity onPress={() => !uploading && setAddOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* File picker */}
              {pickedFile ? (
                <View style={styles.filePicked}>
                  {pickedFile.mimeType?.startsWith('image/') ? (
                    <Image source={{ uri: pickedFile.uri }} style={styles.fileThumb} />
                  ) : (
                    <View style={[styles.fileThumb, styles.fileThumbDoc]}>
                      <Ionicons name="document-text" size={24} color={Colors.primaryText} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.fileName} numberOfLines={1}>{pickedFile.name}</Text>
                    {pickedFile.size ? (
                      <Text style={styles.fileMeta}>{(pickedFile.size / 1024).toFixed(0)} KB</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setPickedFile(null)}>
                    <Ionicons name="close-circle" size={22} color={Colors.secondaryText} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.pickerRow}>
                  <TouchableOpacity style={styles.pickerBtn} onPress={onPickFile} activeOpacity={0.7}>
                    <Ionicons name="document-attach-outline" size={26} color={Colors.primaryText} />
                    <Text style={styles.pickerBtnText}>PDF / file</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.pickerBtn} onPress={onPickPhoto} activeOpacity={0.7}>
                    <Ionicons name="images-outline" size={26} color={Colors.primaryText} />
                    <Text style={styles.pickerBtnText}>Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Title */}
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={docTitle}
                onChangeText={setDocTitle}
                placeholder="e.g. Plans Rev 3"
                placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              />

              {/* Category */}
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.catGrid}>
                {FILTERS.filter((f) => f.key !== 'all').map((c) => {
                  const isActive = docCategory === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.catChip, isActive && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue }]}
                      onPress={() => setDocCategory(c.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={c.icon} size={14} color={isActive ? '#fff' : Colors.primaryText} />
                      <Text style={[styles.catChipText, isActive && { color: '#fff', fontWeight: '700' }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Visibility */}
              <Text style={styles.fieldLabel}>Who can see this</Text>
              <Text style={styles.fieldHint}>Owner and supervisors always see all documents.</Text>
              <CheckRow label="Subcontractors" sub="Subs with active engagements on this project" value={visSubs} onChange={setVisSubs} color="#8B5CF6" Colors={Colors} styles={styles} />
              <CheckRow label="Workers"        sub="Workers assigned to this project"               value={visWorkers} onChange={setVisWorkers} color="#10B981" Colors={Colors} styles={styles} />
              <CheckRow label="Client"         sub="Visible in the client portal"                   value={visClients} onChange={setVisClients} color="#1E40AF" Colors={Colors} styles={styles} />

              {/* Important */}
              <View style={{ marginTop: 14 }}>
                <CheckRow
                  label="Mark as important"
                  sub="Surfaces with a star badge in everyone's list"
                  value={isImportant}
                  onChange={setIsImportant}
                  color="#F59E0B"
                  Colors={Colors}
                  styles={styles}
                />
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, (uploading || !pickedFile || !docTitle.trim()) && { opacity: 0.5 }]}
                onPress={onUpload}
                disabled={uploading || !pickedFile || !docTitle.trim()}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>Upload</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CheckRow({ label, sub, value, onChange, color, Colors, styles }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={() => onChange(!value)} activeOpacity={0.7}>
      <View style={[styles.checkBox, value && { backgroundColor: color, borderColor: color }]}>
        {value ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.checkLabel}>{label}</Text>
        {sub ? <Text style={styles.checkSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  addIconBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 16, marginTop: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.primaryText, paddingVertical: 0 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  chipText: { fontSize: 12, color: Colors.primaryText, fontWeight: '500' },
  listScroll: { paddingHorizontal: 16, paddingBottom: 40 },
  docCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  importantPill: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  metaText: { fontSize: 11, color: Colors.secondaryText, textTransform: 'capitalize' },
  visRow: { flexDirection: 'row', gap: 4 },
  visChip: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  visChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.primaryText, marginTop: 10 },
  emptyBody: { fontSize: 13, color: Colors.secondaryText, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.primaryText },
  modalBody: { padding: 18, paddingBottom: 32 },

  pickerRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  pickerBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 22, gap: 6,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 12, backgroundColor: Colors.cardBackground,
  },
  pickerBtnText: { color: Colors.primaryText, fontWeight: '600', fontSize: 13 },
  filePicked: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground,
    padding: 12, borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  fileThumb: { width: 44, height: 44, borderRadius: 8 },
  fileThumbDoc: { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  fileMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
  fieldHint: { fontSize: 12, color: Colors.secondaryText, marginTop: -4, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 15,
    color: Colors.primaryText, backgroundColor: Colors.cardBackground,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  catChipText: { fontSize: 12, color: Colors.primaryText, fontWeight: '500' },

  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10, gap: 12,
  },
  checkBox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkLabel: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  checkSub: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primaryBlue,
    borderRadius: 14, paddingVertical: 16, marginTop: 22,
    gap: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
