import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard } from '../../services/clientPortalApi';
import { supabase } from '../../lib/supabase';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  red: '#EF4444', blue: '#3B82F6', green: '#10B981', purple: '#8B5CF6',
};

const CATEGORIES = [
  { key: 'contract', label: 'Contracts', icon: 'document-text', color: C.blue, bg: '#DBEAFE' },
  { key: 'permit', label: 'Permits', icon: 'shield-checkmark', color: C.green, bg: '#D1FAE5' },
  { key: 'drawing', label: 'Plans & Drawings', icon: 'map', color: C.purple, bg: '#F3E8FF' },
  { key: 'warranty', label: 'Warranties', icon: 'ribbon', color: C.amber, bg: C.amberLight },
  { key: 'invoice', label: 'Invoices', icon: 'receipt', color: C.red, bg: '#FEE2E2' },
  { key: 'report', label: 'Reports', icon: 'clipboard', color: '#6366F1', bg: '#EEF2FF' },
  { key: 'photo', label: 'Photos', icon: 'images', color: '#EC4899', bg: '#FCE7F3' },
  { key: 'other', label: 'Other', icon: 'folder', color: C.textSec, bg: '#F3F4F6' },
];

const FILE_ICONS = {
  'application/pdf': { icon: 'document-text', color: C.red, bg: '#FEE2E2' },
  'image/jpeg': { icon: 'image', color: C.blue, bg: '#DBEAFE' },
  'image/png': { icon: 'image', color: C.blue, bg: '#DBEAFE' },
  default: { icon: 'document', color: C.textSec, bg: '#F3F4F6' },
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientDocumentsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');

  const loadData = useCallback(async () => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const { data } = await supabase
          .from('project_documents')
          .select('id, title, description, category, file_name, file_size, mime_type, storage_path, created_at')
          .eq('project_id', projects[0].id)
          .order('created_at', { ascending: false });
        setDocuments(data || []);
      }
    } catch (e) {
      console.error('Documents load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleOpen = async (doc) => {
    try {
      if (doc.storage_path) {
        const { data } = await supabase.storage
          .from('project-documents')
          .createSignedUrl(doc.storage_path, 3600);
        if (data?.signedUrl) {
          await Linking.openURL(data.signedUrl);
        }
      }
    } catch (e) {
      console.error('Error opening document:', e);
    }
  };

  const filtered = activeFilter === 'all'
    ? documents
    : documents.filter(d => d.category === activeFilter);

  const groupedByCategory = {};
  filtered.forEach(doc => {
    const cat = doc.category || 'other';
    if (!groupedByCategory[cat]) groupedByCategory[cat] = [];
    groupedByCategory[cat].push(doc);
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Documents</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
      >
        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          <TouchableOpacity
            style={[styles.chip, activeFilter === 'all' && styles.chipActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.chipText, activeFilter === 'all' && styles.chipTextActive]}>All ({documents.length})</Text>
          </TouchableOpacity>
          {CATEGORIES.filter(c => documents.some(d => (d.category || 'other') === c.key)).map(cat => {
            const count = documents.filter(d => (d.category || 'other') === cat.key).length;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.chip, activeFilter === cat.key && styles.chipActive]}
                onPress={() => setActiveFilter(activeFilter === cat.key ? 'all' : cat.key)}
              >
                <Text style={[styles.chipText, activeFilter === cat.key && styles.chipTextActive]}>{cat.label} ({count})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Document List */}
        {Object.keys(groupedByCategory).length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>No documents yet</Text>
            <Text style={styles.emptySub}>Your contractor will upload contracts, permits, and other documents here</Text>
          </View>
        ) : (
          Object.entries(groupedByCategory).map(([catKey, docs]) => {
            const category = CATEGORIES.find(c => c.key === catKey) || CATEGORIES[CATEGORIES.length - 1];
            return (
              <View key={catKey} style={styles.section}>
                <Text style={styles.sectionLabel}>{category.label.toUpperCase()}</Text>
                <View style={styles.docGroup}>
                  {docs.map((doc, i) => {
                    const fileIcon = FILE_ICONS[doc.mime_type] || FILE_ICONS.default;
                    return (
                      <TouchableOpacity
                        key={doc.id}
                        style={[styles.docRow, i < docs.length - 1 && styles.docRowBorder]}
                        onPress={() => handleOpen(doc)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.docIcon, { backgroundColor: fileIcon.bg }]}>
                          <Ionicons name={fileIcon.icon} size={18} color={fileIcon.color} />
                        </View>
                        <View style={styles.docInfo}>
                          <Text style={styles.docTitle} numberOfLines={1}>{doc.title || doc.file_name}</Text>
                          <Text style={styles.docMeta}>
                            {new Date(doc.created_at).toLocaleDateString()}
                            {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="download-outline" size={20} color={C.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  scrollContent: { paddingBottom: 20 },

  chipScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: C.amber, borderColor: C.amber },
  chipText: { fontSize: 13, color: C.textSec },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  section: { marginTop: 8, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted, marginBottom: 8, paddingLeft: 4 },

  docGroup: { backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  docRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  docIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 15, fontWeight: '500', color: C.text },
  docMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySub: { fontSize: 14, color: C.textMuted, marginTop: 4, textAlign: 'center' },
});
