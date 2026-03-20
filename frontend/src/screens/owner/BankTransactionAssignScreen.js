/**
 * BankTransactionAssignScreen
 * Modal screen to assign an unmatched bank transaction to a project.
 * Lets the owner pick a project, category, and edit the description.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { assignBankTransaction, assignBankTransactionAsOverhead } from '../../services/bankService';

const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#1E40AF20',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

const CATEGORIES = [
  { key: 'materials', labelKey: 'transactionAssign.categoryMaterials', icon: 'cube-outline' },
  { key: 'equipment', labelKey: 'transactionAssign.categoryEquipment', icon: 'construct-outline' },
  { key: 'permits', labelKey: 'transactionAssign.categoryPermits', icon: 'document-text-outline' },
  { key: 'subcontractor', labelKey: 'transactionAssign.categorySubcontractor', icon: 'people-outline' },
  { key: 'labor', labelKey: 'transactionAssign.categoryLabor', icon: 'person-outline' },
  { key: 'misc', labelKey: 'transactionAssign.categoryMisc', icon: 'ellipsis-horizontal-circle-outline' },
];

export default function BankTransactionAssignScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { user } = useAuth();
  const { t } = useTranslation('owner');

  const transaction = route.params?.transaction;
  const initialOverhead = route.params?.isOverhead === true;

  const [mode, setMode] = useState(initialOverhead ? 'overhead' : 'project');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('materials');
  const [description, setDescription] = useState(transaction?.merchant_name || transaction?.description || '');
  const [projectSearch, setProjectSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Overhead state
  const [overheadType, setOverheadType] = useState('one_time');
  const [overheadFrequency, setOverheadFrequency] = useState('monthly');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, location')
        .eq('user_id', user?.id)
        .in('status', ['active', 'on-track', 'behind', 'over-budget', 'draft', 'completed'])
        .order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(p => {
    if (!projectSearch) return true;
    const search = projectSearch.toLowerCase();
    return p.name?.toLowerCase().includes(search) || p.location?.toLowerCase().includes(search);
  });

  const handleSubmit = async () => {
    if (mode === 'overhead') {
      try {
        setSubmitting(true);
        await assignBankTransactionAsOverhead(transaction.id, {
          description: description,
          isRecurring: overheadType === 'recurring',
          frequency: overheadFrequency,
        });

        const msg = overheadType === 'recurring'
          ? `Marked as recurring overhead ($${Math.abs(transaction.amount).toFixed(2)}/${overheadFrequency})`
          : `Marked as one-time overhead ($${Math.abs(transaction.amount).toFixed(2)})`;

        Alert.alert('Assigned to Overhead', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } catch (error) {
        Alert.alert('Error', error.message || 'Failed to assign as overhead');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selectedProject) {
      Alert.alert(t('transactionAssign.selectProject'), t('transactionAssign.selectProjectDesc'));
      return;
    }

    try {
      setSubmitting(true);
      await assignBankTransaction(
        transaction.id,
        selectedProject.id,
        selectedCategory,
        description
      );

      Alert.alert(
        t('transactionAssign.transactionAssigned'),
        t('transactionAssign.transactionAssignedDesc', { amount: Math.abs(transaction.amount).toFixed(2), project: selectedProject.name, category: selectedCategory }),
        [{ text: t('common:buttons.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert(t('common:alerts.error'), error.message || t('transactionAssign.failedToAssign'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <Text style={{ color: Colors.primaryText, textAlign: 'center', marginTop: 40 }}>
          {t('transactionAssign.noTransactionSelected')}
        </Text>
      </SafeAreaView>
    );
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('transactionAssign.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Transaction Details Card */}
          <View style={[styles.txCard, { backgroundColor: OWNER_COLORS.danger + '08', borderColor: OWNER_COLORS.danger + '30' }]}>
            <View style={styles.txHeader}>
              <Ionicons name="card" size={20} color={OWNER_COLORS.danger} />
              <Text style={[styles.txLabel, { color: Colors.secondaryText }]}>{t('transactionAssign.bankTransaction')}</Text>
            </View>
            <Text style={[styles.txAmount, { color: OWNER_COLORS.danger }]}>
              ${Math.abs(transaction.amount).toFixed(2)}
            </Text>
            <Text style={[styles.txDescription, { color: Colors.primaryText }]}>
              {transaction.merchant_name || transaction.description}
            </Text>
            <Text style={[styles.txDate, { color: Colors.secondaryText }]}>
              {formatDate(transaction.date)}
            </Text>
          </View>

          {/* Mode Toggle: Project or Overhead */}
          <View style={[styles.modeToggle, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'project' && { backgroundColor: OWNER_COLORS.primary }]}
              onPress={() => setMode('project')}
            >
              <Ionicons name="briefcase-outline" size={16} color={mode === 'project' ? '#FFF' : Colors.secondaryText} />
              <Text style={[styles.modeBtnText, { color: mode === 'project' ? '#FFF' : Colors.secondaryText }]}>Project</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'overhead' && { backgroundColor: '#F59E0B' }]}
              onPress={() => setMode('overhead')}
            >
              <Ionicons name="business-outline" size={16} color={mode === 'overhead' ? '#FFF' : Colors.secondaryText} />
              <Text style={[styles.modeBtnText, { color: mode === 'overhead' ? '#FFF' : Colors.secondaryText }]}>Overhead</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>Description</Text>
            <TextInput
              style={[styles.input, { backgroundColor: Colors.cardBackground, borderColor: Colors.border, color: Colors.primaryText }]}
              value={description}
              onChangeText={setDescription}
              placeholder={mode === 'overhead' ? 'e.g., Truck Payment, Office Rent' : t('transactionAssign.descriptionPlaceholder')}
              placeholderTextColor={Colors.placeholderText}
            />
          </View>

          {mode === 'overhead' ? (
            <>
              {/* Overhead Type */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>Type</Text>
                <View style={styles.categoryGrid}>
                  <TouchableOpacity
                    style={[styles.categoryItem, { backgroundColor: overheadType === 'one_time' ? '#F59E0B' : Colors.cardBackground, borderColor: overheadType === 'one_time' ? '#F59E0B' : Colors.border }]}
                    onPress={() => setOverheadType('one_time')}
                  >
                    <Ionicons name="receipt-outline" size={18} color={overheadType === 'one_time' ? '#FFF' : Colors.secondaryText} />
                    <Text style={[styles.categoryLabel, { color: overheadType === 'one_time' ? '#FFF' : Colors.primaryText }]}>One-time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.categoryItem, { backgroundColor: overheadType === 'recurring' ? '#F59E0B' : Colors.cardBackground, borderColor: overheadType === 'recurring' ? '#F59E0B' : Colors.border }]}
                    onPress={() => setOverheadType('recurring')}
                  >
                    <Ionicons name="repeat-outline" size={18} color={overheadType === 'recurring' ? '#FFF' : Colors.secondaryText} />
                    <Text style={[styles.categoryLabel, { color: overheadType === 'recurring' ? '#FFF' : Colors.primaryText }]}>Recurring</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Frequency (only for recurring) */}
              {overheadType === 'recurring' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>Frequency</Text>
                  <View style={styles.categoryGrid}>
                    {['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'].map(f => (
                      <TouchableOpacity
                        key={f}
                        style={[styles.categoryItem, { backgroundColor: overheadFrequency === f ? OWNER_COLORS.primary : Colors.cardBackground, borderColor: overheadFrequency === f ? OWNER_COLORS.primary : Colors.border }]}
                        onPress={() => setOverheadFrequency(f)}
                      >
                        <Text style={[styles.categoryLabel, { color: overheadFrequency === f ? '#FFF' : Colors.primaryText }]}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Category Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>{t('transactionAssign.category')}</Text>
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.key}
                      style={[styles.categoryItem, { backgroundColor: selectedCategory === cat.key ? OWNER_COLORS.primary : Colors.cardBackground, borderColor: selectedCategory === cat.key ? OWNER_COLORS.primary : Colors.border }]}
                      onPress={() => setSelectedCategory(cat.key)}
                    >
                      <Ionicons name={cat.icon} size={18} color={selectedCategory === cat.key ? '#FFF' : Colors.secondaryText} />
                      <Text style={[styles.categoryLabel, { color: selectedCategory === cat.key ? '#FFF' : Colors.primaryText }]}>{t(cat.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Project Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>{t('transactionAssign.assignToProject')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.cardBackground, borderColor: Colors.border, color: Colors.primaryText, marginBottom: Spacing.md }]}
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                  placeholder={t('transactionAssign.searchProjects')}
                  placeholderTextColor={Colors.placeholderText}
                />

                {loading ? (
                  <ActivityIndicator color={OWNER_COLORS.primary} />
                ) : (
                  <View style={styles.projectList}>
                    {filteredProjects.map((project) => (
                      <TouchableOpacity
                        key={project.id}
                        style={[styles.projectItem, { backgroundColor: selectedProject?.id === project.id ? OWNER_COLORS.primaryLight : Colors.cardBackground, borderColor: selectedProject?.id === project.id ? OWNER_COLORS.primary : Colors.border }]}
                        onPress={() => setSelectedProject(project)}
                      >
                        <View style={styles.projectInfo}>
                          <Text style={[styles.projectName, { color: Colors.primaryText }]}>{project.name}</Text>
                          {project.location && <Text style={[styles.projectClient, { color: Colors.secondaryText }]}>{project.location}</Text>}
                        </View>
                        {selectedProject?.id === project.id && <Ionicons name="checkmark-circle" size={22} color={OWNER_COLORS.primary} />}
                      </TouchableOpacity>
                    ))}
                    {filteredProjects.length === 0 && (
                      <Text style={[styles.noProjects, { color: Colors.secondaryText }]}>
                        {projectSearch ? t('transactionAssign.noMatchingProjects') : t('transactionAssign.noActiveProjects')}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Submit Button */}
        <View style={[styles.footer, { borderTopColor: Colors.border, backgroundColor: Colors.background }]}>
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: mode === 'overhead' ? '#F59E0B' : (selectedProject ? OWNER_COLORS.primary : Colors.border) }]}
            onPress={handleSubmit}
            disabled={(mode === 'project' && !selectedProject) || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name={mode === 'overhead' ? 'business' : 'checkmark'} size={20} color="#FFF" />
                <Text style={styles.submitButtonText}>
                  {mode === 'overhead'
                    ? (overheadType === 'recurring' ? 'Add as Recurring Overhead' : 'Mark as Overhead')
                    : t('transactionAssign.assignTo', { name: selectedProject?.name || 'Project' })
                  }
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 20,
  },
  txCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  txLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  txAmount: {
    fontSize: 32,
    fontWeight: '700',
  },
  txDescription: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    marginTop: Spacing.xs,
  },
  txDate: {
    fontSize: FontSizes.small,
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    gap: 6,
  },
  categoryLabel: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  projectList: {
    gap: Spacing.sm,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  projectClient: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  noProjects: {
    textAlign: 'center',
    paddingVertical: Spacing.xl,
    fontSize: FontSizes.small,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  modeBtnText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
