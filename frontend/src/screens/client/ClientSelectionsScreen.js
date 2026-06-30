import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard, selectMaterial } from '../../services/clientPortalApi';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';
import { useTranslation } from 'react-i18next';

const portalFetchSelections = async (projectId) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const res = await fetch(`${API_URL}/api/portal/projects/${projectId}/materials`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Failed to load selections (${res.status})`);
  return res.json();
};

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', blue: '#3B82F6', blueBg: '#DBEAFE',
};

const STATUS_MAP = {
  pending: { bg: C.amberLight, text: C.amberText, label: 'PENDING' },
  selected: { bg: C.blueBg, text: C.blue, label: 'IN REVIEW' },
  confirmed: { bg: C.greenBg, text: C.greenText, label: 'CONFIRMED' },
};

export default function ClientSelectionsScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { selectedProjectId, setProjects } = useClientProject();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selections, setSelections] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingKey, setSubmittingKey] = useState(null);
  const [error, setError] = useState(false);
  const [hasProject, setHasProject] = useState(true);

  const loadData = useCallback(async () => {
    setError(false);
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        setHasProject(true);
        setProjects(projects);
        const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];
        setProjectId(activeProject.id);
        const data = await portalFetchSelections(activeProject.id);
        setSelections(data || []);
      } else {
        setHasProject(false);
        setProjectId(null);
        setSelections([]);
      }
    } catch (e) {
      console.error('Selections load error:', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProjectId, setProjects]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSelect = async (selectionId, optionIndex) => {
    if (submitting) return;
    try {
      setSubmitting(true);
      setSubmittingKey(`${selectionId}:${optionIndex}`);
      // Route through the portal endpoint (service-role + ownership check). A
      // direct supabase write is blocked by RLS ('Owners manage') → 0 rows.
      await selectMaterial(selectionId, optionIndex);
      Alert.alert(t('clientSelections.alertSubmittedTitle'), t('clientSelections.alertSubmittedBody'));
      loadData();
    } catch (e) {
      Alert.alert(t('common:alerts.error'), e.message || t('clientSelections.alertErrorBody'));
    } finally {
      setSubmitting(false);
      setSubmittingKey(null);
    }
  };

  const pending = selections.filter(s => s.status === 'pending');
  const reviewed = selections.filter(s => s.status === 'selected');
  const confirmed = selections.filter(s => s.status === 'confirmed');

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
          <TouchableOpacity
            testID="clientSelections.backButton"
            accessibilityLabel="clientSelections.backButton"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} testID="clientSelections.headerTitle" accessibilityLabel="clientSelections.headerTitle">{t('clientSelections.title')}</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
      >
        {/* Summary */}
        {selections.length > 0 && (
          <View style={styles.summaryRow} testID="clientSelections.summaryRow" accessibilityLabel="clientSelections.summaryRow">
            {pending.length > 0 && (
              <View style={[styles.summaryChip, { backgroundColor: C.amberLight }]} testID="clientSelections.pendingChip" accessibilityLabel="clientSelections.pendingChip">
                <Text style={[styles.summaryChipText, { color: C.amberText }]}>{t('clientSelections.pendingCount', { count: pending.length })}</Text>
              </View>
            )}
            {reviewed.length > 0 && (
              <View style={[styles.summaryChip, { backgroundColor: C.blueBg }]} testID="clientSelections.reviewedChip" accessibilityLabel="clientSelections.reviewedChip">
                <Text style={[styles.summaryChipText, { color: C.blue }]}>{t('clientSelections.inReviewCount', { count: reviewed.length })}</Text>
              </View>
            )}
            {confirmed.length > 0 && (
              <View style={[styles.summaryChip, { backgroundColor: C.greenBg }]} testID="clientSelections.confirmedChip" accessibilityLabel="clientSelections.confirmedChip">
                <Text style={[styles.summaryChipText, { color: C.greenText }]}>{t('clientSelections.confirmedCount', { count: confirmed.length })}</Text>
              </View>
            )}
          </View>
        )}

        {error ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>{t('clientSelections.errorTitle')}</Text>
            <Text style={styles.emptySub}>{t('clientSelections.errorSub')}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => { setLoading(true); loadData(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>{t('clientSelections.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : !hasProject ? (
          <View style={styles.emptyState}>
            <Ionicons name="home-outline" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>{t('clientSelections.noProjectTitle')}</Text>
            <Text style={styles.emptySub}>{t('clientSelections.noProjectSub')}</Text>
          </View>
        ) : selections.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="color-palette-outline" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>{t('clientSelections.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('clientSelections.emptySub')}</Text>
          </View>
        ) : (
          selections.map((sel, selIndex) => {
            const status = STATUS_MAP[sel.status] || STATUS_MAP.pending;
            const options = sel.options || [];
            const isExpanded = expandedId === sel.id;
            const isPending = sel.status === 'pending';
            const daysUntilDue = sel.due_date
              ? Math.ceil((new Date(sel.due_date) - new Date()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              <View key={sel.id} style={styles.selCard}>
                {/* Header */}
                <TouchableOpacity
                  testID={`clientSelections.cardToggleButton.${selIndex}`}
                  accessibilityLabel={`clientSelections.cardToggleButton.${selIndex}`}
                  style={styles.selHeader}
                  onPress={() => setExpandedId(isExpanded ? null : sel.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.selHeaderRow}>
                      <View style={[styles.statusBadge, { backgroundColor: status.bg }]} testID={`clientSelections.statusBadge.${selIndex}`} accessibilityLabel={`clientSelections.statusBadge.${selIndex}`}>
                        <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                      </View>
                      {daysUntilDue !== null && daysUntilDue <= 7 && isPending && (
                        <Text style={styles.dueWarning}>
                          {daysUntilDue <= 0 ? t('clientSelections.overdue') : t('clientSelections.daysLeft', { count: daysUntilDue })}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.selTitle} testID={`clientSelections.cardTitle.${selIndex}`} accessibilityLabel={`clientSelections.cardTitle.${selIndex}`}>{sel.title}</Text>
                    {sel.description && <Text style={styles.selDesc} numberOfLines={2}>{sel.description}</Text>}
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={C.textMuted} />
                </TouchableOpacity>

                {/* Expanded Options */}
                {isExpanded && options.length > 0 && (
                  <View style={styles.optionsContainer}>
                    {options.map((option, i) => {
                      const isSelected = sel.selected_option_index === i;
                      const isSubmittingOption = submittingKey === `${sel.id}:${i}`;
                      let priceText = null;
                      if (option.price != null) {
                        const p = Number(option.price);
                        if (Number.isFinite(p)) {
                          priceText = `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        }
                      }
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                          onPress={() => isPending && handleSelect(sel.id, i)}
                          disabled={!isPending || submitting}
                          activeOpacity={isPending ? 0.7 : 1}
                        >
                          {option.image_url && (
                            <Image source={{ uri: option.image_url }} style={styles.optionImage} resizeMode="cover" />
                          )}
                          <View style={styles.optionInfo}>
                            <Text style={styles.optionName}>{option.name || option.title || t('clientSelections.optionFallback', { number: i + 1 })}</Text>
                            {option.description && <Text style={styles.optionDesc} numberOfLines={2}>{option.description}</Text>}
                            {priceText && <Text style={styles.optionPrice}>{priceText}</Text>}
                          </View>
                          {isSubmittingOption ? (
                            <ActivityIndicator size="small" color={C.amber} />
                          ) : isSelected ? (
                            <View style={styles.selectedCheck}>
                              <Ionicons name="checkmark-circle" size={24} color={C.amber} />
                            </View>
                          ) : (
                            isPending && <Text style={styles.selectLabel}>{t('clientSelections.select')}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {isExpanded && options.length === 0 && (
                  <Text style={styles.noOptions}>{t('clientSelections.noOptions')}</Text>
                )}
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
  scrollContent: { padding: 16 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  summaryChipText: { fontSize: 12, fontWeight: '600' },

  selCard: {
    backgroundColor: C.surface, borderRadius: 16, marginBottom: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  selHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  selHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  selTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  selDesc: { fontSize: 13, color: C.textSec, marginTop: 4 },
  dueWarning: { fontSize: 11, fontWeight: '600', color: C.red },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  optionsContainer: { paddingHorizontal: 16, paddingBottom: 16 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, padding: 12, marginBottom: 8, gap: 12,
  },
  optionCardSelected: { borderColor: C.amber, backgroundColor: '#FFFBEB' },
  optionImage: { width: 60, height: 60, borderRadius: 8 },
  optionInfo: { flex: 1 },
  optionName: { fontSize: 14, fontWeight: '600', color: C.text },
  optionDesc: { fontSize: 12, color: C.textSec, marginTop: 2 },
  optionPrice: { fontSize: 13, fontWeight: '700', color: C.amber, marginTop: 4 },
  selectedCheck: {},
  selectLabel: { fontSize: 12, fontWeight: '600', color: C.amber },
  noOptions: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 16 },

  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySub: { fontSize: 14, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: C.amber },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: C.surface },
});
