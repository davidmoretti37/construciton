import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchProjects as fetchProjectsFromStorage, saveProject, saveProjectPhases, fetchProjectPhases, deleteProject } from '../utils/storage';
import { getUserProfile } from '../utils/storage/userProfile';
import { ProjectCard } from '../components/ChatVisuals';
import { useCachedFetch } from '../hooks/useCachedFetch';
import TimelinePickerModal from '../components/TimelinePickerModal';
import ConversationsSection from '../components/ConversationsSection';
import PhasePickerModal from '../components/PhasePickerModal';
import PhaseTimeline from '../components/PhaseTimeline';
import PhaseDetailModal from '../components/PhaseDetailModal';
import SimpleProjectCard from '../components/SimpleProjectCard';
import NotificationBell from '../components/NotificationBell';
import UpgradeModal from '../components/UpgradeModal';
import subscriptionService from '../services/subscriptionService';
import { useSubscription } from '../contexts/SubscriptionContext';
import logger from '../utils/logger';

// Demo project shown when user has no projects yet
const DEMO_PROJECT = {
  id: 'demo',
  name: 'Kitchen Renovation',
  client: 'Sample Client',
  clientPhone: '(555) 123-4567',
  clientEmail: 'sample@example.com',
  location: '123 Main Street, Austin, TX',
  contractAmount: 25000,
  incomeCollected: 12500,
  expenses: 8000,
  percentComplete: 50,
  status: 'active',
  daysRemaining: 14,
  startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days ago
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days from now
  hasPhases: true,
  isDemo: true,
};

// Demo phases for the demo project
const DEMO_PHASES = [
  {
    id: 'demo-phase-1',
    name: 'Demolition',
    completion_percentage: 100,
    status: 'completed',
    order_index: 0,
  },
  {
    id: 'demo-phase-2',
    name: 'Plumbing & Electrical',
    completion_percentage: 75,
    status: 'in_progress',
    order_index: 1,
  },
  {
    id: 'demo-phase-3',
    name: 'Cabinets & Countertops',
    completion_percentage: 25,
    status: 'in_progress',
    order_index: 2,
  },
  {
    id: 'demo-phase-4',
    name: 'Finishing & Cleanup',
    completion_percentage: 0,
    status: 'pending',
    order_index: 3,
  },
];

// Export demo phases for use in ProjectDetailView
export { DEMO_PHASES };

export default function ProjectsScreen({ navigation, route }) {
  const { t } = useTranslation('projects');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { hasActiveSubscription, checkCanCreateProject } = useSubscription();

  // Cache-first loading for projects
  const fetchProjectsFn = useCallback(() => fetchProjectsFromStorage(), []);
  const {
    data: rawProjects,
    loading,
    refresh: refreshProjects,
    reload: reloadProjects,
  } = useCachedFetch('projects:list', fetchProjectsFn);
  const projects = rawProjects || [];

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    client: '',
    contractAmount: '',
    incomeCollected: '',
    expenses: '',
    percentComplete: '0',
    status: 'active',
    startDate: null,
    endDate: null,
  });
  const [saving, setSaving] = useState(false);
  const [showNewProjectTimeline, setShowNewProjectTimeline] = useState(false);
  const [showEditTimeline, setShowEditTimeline] = useState(false);

  // Phase management
  const [showNewProjectPhases, setShowNewProjectPhases] = useState(false);
  const [showEditPhases, setShowEditPhases] = useState(false);
  const [newProjectPhases, setNewProjectPhases] = useState([]);
  const [editingPhases, setEditingPhases] = useState([]);
  const [selectedPhaseDetail, setSelectedPhaseDetail] = useState(null);
  const [showPhaseDetail, setShowPhaseDetail] = useState(false);

  // Currently selected project (for editing)
  const [selectedProject, setSelectedProject] = useState(null);

  // User profile for phases template
  const [userProfile, setUserProfile] = useState(null);

  // Subscription upgrade modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  const closeEdit = () => {
    setEditOpen(false);
    setEditing(null);
    setShowEditTimeline(false);
    setShowEditPhases(false);
    setEditingPhases([]);
  };

  const closeNewProject = () => {
    setNewProjectOpen(false);
    setNewProject({
      name: '',
      client: '',
      contractAmount: '',
      incomeCollected: '',
      expenses: '',
      percentComplete: '0',
      status: 'active',
      startDate: null,
      endDate: null,
    });
    setShowNewProjectPhases(false);
    setNewProjectPhases([]);
  };

  const handleNewProjectTimelineConfirm = (timelineData) => {
    setNewProject((prev) => ({
      ...prev,
      startDate: timelineData.startDate,
      endDate: timelineData.endDate,
      daysRemaining: timelineData.daysRemaining,
      estimatedDuration: timelineData.estimatedDuration,
    }));
    setShowNewProjectTimeline(false);
  };

  const handleEditTimelineConfirm = (timelineData) => {
    setEditing((prev) => ({
      ...prev,
      startDate: timelineData.startDate,
      endDate: timelineData.endDate,
      daysRemaining: timelineData.daysRemaining,
      estimatedDuration: timelineData.estimatedDuration,
    }));
    setShowEditTimeline(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('notSet');
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleSaveNewProject = async () => {
    try {
      // Validation
      if (!newProject.name.trim()) {
        alert(t('errors.nameRequired'));
        return;
      }
      if (!newProject.client.trim()) {
        alert(t('errors.clientRequired'));
        return;
      }

      setSaving(true);

      const projectData = {
        name: newProject.name.trim(),
        client: newProject.client.trim(),
        contractAmount: Number(newProject.contractAmount) || 0,
        incomeCollected: Number(newProject.incomeCollected) || 0,
        expenses: Number(newProject.expenses) || 0,
        percentComplete: Math.max(0, Math.min(100, Number(newProject.percentComplete) || 0)),
        status: newProject.status || 'active',
        budget: Number(newProject.contractAmount) || 0, // Legacy field
        spent: Number(newProject.expenses) || 0, // Legacy field
        profit: (Number(newProject.incomeCollected) || 0) - (Number(newProject.expenses) || 0),
        extras: [],
        startDate: newProject.startDate,
        endDate: newProject.endDate,
        daysRemaining: newProject.daysRemaining,
        estimatedDuration: newProject.estimatedDuration,
        hasPhases: newProjectPhases.length > 0, // Set hasPhases flag
      };

      const savedProject = await saveProject(projectData);

      // Check if limit was reached
      if (savedProject?.error === 'limit_reached') {
        setSubscriptionInfo(savedProject);
        setShowUpgradeModal(true);
        closeNewProject();
        return;
      }

      if (savedProject && !savedProject.error) {
        // Save phases if any were selected
        if (newProjectPhases.length > 0) {
          await saveProjectPhases(savedProject.id, newProjectPhases);
        }

        // Reload projects list
        await refreshProjects();
        closeNewProject();
      } else {
        alert(t('errors.saveFailed'));
      }
    } catch (error) {
      logger.error('Error saving new project:', error);
      alert(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);

      const projectData = {
        id: editing.id,
        name: editing.name,
        client: editing.client,
        contractAmount: Number(editing.contractAmount) || Number(editing.budget) || 0,
        incomeCollected: Number(editing.incomeCollected) || 0,
        expenses: Number(editing.expenses) || Number(editing.spent) || 0,
        percentComplete: Math.max(0, Math.min(100, Number(editing.percentComplete) || 0)),
        status: editing.status,
        budget: Number(editing.budget) || 0,
        spent: Number(editing.spent) || 0,
        profit: (Number(editing.incomeCollected) || 0) - (Number(editing.expenses) || Number(editing.spent) || 0),
        extras: editing.extras || [],
        startDate: editing.startDate,
        endDate: editing.endDate,
        daysRemaining: editing.daysRemaining,
        estimatedDuration: editing.estimatedDuration,
        hasPhases: editingPhases.length > 0, // Set hasPhases flag
      };

      const savedProject = await saveProject(projectData);

      if (savedProject) {
        // Save phases if they were modified
        if (editingPhases.length > 0) {
          await saveProjectPhases(savedProject.id, editingPhases);
        }

        // Reload projects list
        await refreshProjects();
        closeEdit();
      } else {
        alert(t('errors.saveFailed'));
      }
    } catch (error) {
      logger.error('Error updating project:', error);
      alert(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // On focus: show cached projects instantly, refresh stale data in background
  useFocusEffect(
    useCallback(() => {
      reloadProjects();
    }, [reloadProjects])
  );

  // Load user profile for phases template
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await getUserProfile();
        setUserProfile(profile);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadProfile();
  }, []);

  // OPTIMIZATION: Debounce search input (300ms delay)
  // Prevents filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle navigation from other screens with projectId
  useEffect(() => {
    if (route.params?.projectId && projects.length > 0) {
      const project = projects.find(p => p.id === route.params.projectId);
      if (project) {
        setSelectedProject(project);
        // Navigate to the project detail screen (no function params to avoid serialization warning)
        navigation.navigate('ProjectDetail', {
          project,
        });
        // Clear the param so it doesn't trigger again
        navigation.setParams({ projectId: undefined });
      }
    }
  }, [route.params?.projectId, projects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshProjects();
    setRefreshing(false);
  }, [refreshProjects]);

  const handleDeleteProject = async (projectId) => {
    try {
      const success = await deleteProject(projectId);
      if (success) {
        setSelectedProject(null);
        // Reload projects list
        await refreshProjects();
        Alert.alert(t('success'), t('projectDeletedSuccessfully'));
      } else {
        Alert.alert(t('error'), t('errors.deleteFailed'));
      }
    } catch (error) {
      logger.error('Error deleting project:', error);
      Alert.alert(t('error'), t('errors.deleteFailed'));
    }
  };

  // OPTIMIZATION: Memoized filter logic
  // Only recalculates when projects, filter, or debounced search changes
  const filteredProjects = useMemo(() => {
    // If user has no projects and no search/filter active, show demo project
    if (projects.length === 0 && !debouncedSearchQuery && selectedFilter === 'All') {
      return [DEMO_PROJECT];
    }

    return projects.filter(project => {
      // Apply filter
      if (selectedFilter !== 'All') {
        const filterMap = {
          'Active': ['active', 'on-track', 'behind', 'over-budget'],
          'Completed': ['completed'],
          'Archived': ['archived'],
        };
        if (!filterMap[selectedFilter]?.includes(project.status)) {
          return false;
        }
      }

      // Apply search (using debounced query)
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        return (
          project.name.toLowerCase().includes(query) ||
          project.client.toLowerCase().includes(query) ||
          project.location?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [projects, selectedFilter, debouncedSearchQuery]);

  const handleProjectCardPress = async (project) => {
    // Handle demo project - navigate with isDemo flag for read-only mode
    if (project.isDemo) {
      navigation.navigate('ProjectDetail', {
        project,
        isDemo: true,
      });
      return;
    }
    setSelectedProject(project);
    navigation.navigate('ProjectDetail', {
      project,
    });
  };

  const handleProjectEdit = async () => {
    if (!selectedProject) return;

    // Open edit modal
    setEditing({ ...selectedProject });

    // Load phases if project has them
    if (selectedProject.hasPhases) {
      const phases = await fetchProjectPhases(selectedProject.id);

      // Transform database format to PhasePickerModal format
      const transformedPhases = (phases || []).map(phase => ({
        id: phase.id,
        name: phase.name,
        defaultDays: phase.planned_days,
        startDate: phase.start_date,
        endDate: phase.end_date,
        budget: phase.budget,
        tasks: phase.tasks || [],
        completionPercentage: phase.completion_percentage,
        status: phase.status,
      }));

      setEditingPhases(transformedPhases);
    }

    setEditOpen(true);
  };

  const handleProjectAction = async (action) => {
    if (!action) return;
    if (action.type === 'view-project' && action.data?.projectId) {
      const project = projects.find(p => p.id === action.data.projectId);
      if (project) {
        handleProjectCardPress(project);
      }
      return;
    }
    logger.debug('Project action:', action);
  };

  const handlePhasePress = (phase) => {
    setSelectedPhaseDetail(phase);
    setShowPhaseDetail(true);
  };

  const handlePhaseUpdate = async () => {
    // Reload phases after update
    if (editing?.id) {
      const phases = await fetchProjectPhases(editing.id);
      setEditingPhases(phases || []);
      await refreshProjects(); // Reload projects to update card display
    }
    setShowPhaseDetail(false);
  };

  // OPTIMIZATION: FlatList optimizations
  const renderProjectItem = useCallback(({ item }) => (
    <SimpleProjectCard
      project={item}
      onPress={() => handleProjectCardPress(item)}
    />
  ), []);

  const keyExtractor = useCallback((item) => item.id, []);

  const getItemLayout = useCallback((data, index) => ({
    length: 200, // Approximate item height
    offset: 200 * index,
    index,
  }), []);

  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyState}>
      <Ionicons name="folder-outline" size={64} color={Colors.secondaryText} />
      <Text style={[styles.emptyStateText, { color: Colors.primaryText }]}>
        {searchQuery || selectedFilter !== 'All' ? t('noProjectsFound') : t('noProjects')}
      </Text>
      <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
        {searchQuery || selectedFilter !== 'All'
          ? t('tryAdjustingFilters')
          : t('noProjectsHint')}
      </Text>
    </View>
  ), [searchQuery, selectedFilter, Colors, t]);

  const renderLoadingComponent = useCallback(() => (
    <View style={{ padding: Spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
      </View>
    </View>
  ), []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.white }]}>
        <View style={styles.topBarLeft} />
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('title')}</Text>
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>


      {/* OPTIMIZED: Projects List with FlatList */}
      {loading ? (
        renderLoadingComponent()
      ) : (
        <FlatList
          data={filteredProjects}
          renderItem={renderProjectItem}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.flatListContent}
          ListEmptyComponent={renderEmptyComponent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          // Performance optimizations
          windowSize={5}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={true}
          initialNumToRender={10}
        />
      )}

      {/* Simple Edit Modal - Hide when timeline picker is open */}
      <Modal visible={editOpen && !showEditTimeline} transparent animationType="slide" onRequestClose={closeEdit}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: Colors.white }]}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('editProject')}</Text>
            {editing && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View>
                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.projectName')}</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder={t('form.projectNamePlaceholder')}
                  placeholderTextColor={Colors.placeholderText}
                  value={editing.name}
                  onChangeText={(t) => setEditing((e) => ({ ...e, name: t }))}
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.clientName')}</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder={t('form.clientNamePlaceholder')}
                  placeholderTextColor={Colors.placeholderText}
                  value={editing.client || ''}
                  onChangeText={(t) => setEditing((e) => ({ ...e, client: t }))}
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.clientPhone')}</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder={t('form.clientPhonePlaceholder')}
                  placeholderTextColor={Colors.placeholderText}
                  value={editing.clientPhone || ''}
                  onChangeText={(t) => setEditing((e) => ({ ...e, clientPhone: t }))}
                  keyboardType="phone-pad"
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.contractAmount')}</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  keyboardType="numeric"
                  value={String(editing.contractAmount ?? editing.budget ?? 0)}
                  onChangeText={(t) => setEditing((e) => ({ ...e, contractAmount: t.replace(/[^0-9.]/g, ''), budget: t.replace(/[^0-9.]/g, '') }))}
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('timeline')}</Text>
                <TouchableOpacity
                  style={[styles.timelineButton, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}
                  onPress={() => setShowEditTimeline(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                  <View style={{ flex: 1 }}>
                    {editing.startDate && editing.endDate ? (
                      <View>
                        <Text style={[styles.timelineText, { color: Colors.primaryText }]}>
                          {formatDate(editing.startDate)} - {formatDate(editing.endDate)}
                        </Text>
                        <Text style={[styles.timelineSubtext, { color: Colors.secondaryText }]}>
                          {editing.daysRemaining} {t('days')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                        {t('setTimeline')}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('projectPhases')}</Text>
                <TouchableOpacity
                  style={[styles.timelineButton, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}
                  onPress={() => setShowEditPhases(true)}
                >
                  <Ionicons name="layers-outline" size={20} color={Colors.primaryBlue} />
                  <View style={{ flex: 1 }}>
                    {editingPhases.length > 0 ? (
                      <Text style={[styles.timelineText, { color: Colors.primaryText }]}>
                        {editingPhases.length} {editingPhases.length === 1 ? t('phase') : t('phases')} {t('configured')}
                      </Text>
                    ) : (
                      <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                        {t('addPhasesOptional')}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>

                {/* Show phase timeline if phases exist */}
                {editingPhases.length > 0 && (
                  <View style={{ marginTop: Spacing.md }}>
                    <PhaseTimeline
                      phases={editingPhases}
                      onPhasePress={handlePhasePress}
                      compact={false}
                    />
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('details.income')}</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      keyboardType="numeric"
                      value={String(editing.incomeCollected ?? 0)}
                      onChangeText={(t) => setEditing((e) => ({ ...e, incomeCollected: t.replace(/[^0-9.]/g, '') }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('details.expenses')}</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      keyboardType="numeric"
                      value={String(editing.expenses ?? editing.spent ?? 0)}
                      onChangeText={(t) => setEditing((e) => ({ ...e, expenses: t.replace(/[^0-9.]/g, ''), spent: t.replace(/[^0-9.]/g, '') }))}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('completePercent')}</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      keyboardType="numeric"
                      value={String(editing.percentComplete ?? 0)}
                      onChangeText={(t) => setEditing((e) => ({ ...e, percentComplete: t.replace(/[^0-9]/g, '') }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('status.label')}</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      placeholder={t('statusPlaceholder')}
                      placeholderTextColor={Colors.placeholderText}
                      value={editing.status || ''}
                      onChangeText={(t) => setEditing((e) => ({ ...e, status: t }))}
                    />
                  </View>
                </View>

                {/* Client Messages Section */}
                {editing.clientPhone && (
                  <View style={{ marginTop: Spacing.lg }}>
                    <ConversationsSection
                      projectId={editing.id}
                      clientPhone={editing.clientPhone}
                    />
                  </View>
                )}

                </View>
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.lg, paddingTop: Spacing.md }}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.lightGray }]}
                onPress={closeEdit}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: Colors.primaryText }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: Colors.white }]}>
                  {saving ? t('saving') : t('save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Project Modal */}
      <Modal visible={newProjectOpen} transparent animationType="slide" onRequestClose={closeNewProject}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: Colors.white }]}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('newProject')}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View>
              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.projectName')} *</Text>
              <RNTextInput
                style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder={t('form.projectNamePlaceholder')}
                placeholderTextColor={Colors.placeholderText}
                value={newProject.name}
                onChangeText={(t) => setNewProject((p) => ({ ...p, name: t }))}
              />

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.clientName')} *</Text>
              <RNTextInput
                style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder={t('form.clientNamePlaceholder')}
                placeholderTextColor={Colors.placeholderText}
                value={newProject.client}
                onChangeText={(t) => setNewProject((p) => ({ ...p, client: t }))}
              />

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('form.contractAmount')}</Text>
              <RNTextInput
                style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder={t('form.contractAmountPlaceholder')}
                keyboardType="numeric"
                placeholderTextColor={Colors.placeholderText}
                value={newProject.contractAmount}
                onChangeText={(t) => setNewProject((p) => ({ ...p, contractAmount: t.replace(/[^0-9.]/g, '') }))}
              />

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('timeline')}</Text>
              <TouchableOpacity
                style={[styles.timelineButton, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}
                onPress={() => setShowNewProjectTimeline(true)}
              >
                <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                <View style={{ flex: 1 }}>
                  {newProject.startDate && newProject.endDate ? (
                    <View>
                      <Text style={[styles.timelineText, { color: Colors.primaryText }]}>
                        {formatDate(newProject.startDate)} - {formatDate(newProject.endDate)}
                      </Text>
                      <Text style={[styles.timelineSubtext, { color: Colors.secondaryText }]}>
                        {newProject.daysRemaining} {t('days')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                      {t('setTimeline')}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('projectPhases')}</Text>
              <TouchableOpacity
                style={[styles.timelineButton, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}
                onPress={() => setShowNewProjectPhases(true)}
              >
                <Ionicons name="layers-outline" size={20} color={Colors.primaryBlue} />
                <View style={{ flex: 1 }}>
                  {newProjectPhases.length > 0 ? (
                    <Text style={[styles.timelineText, { color: Colors.primaryText }]}>
                      {newProjectPhases.length} {newProjectPhases.length === 1 ? t('phase') : t('phases')} {t('configured')}
                    </Text>
                  ) : (
                    <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                      {t('addPhasesOptional')}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('details.income')}</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder={t('form.contractAmountPlaceholder')}
                    keyboardType="numeric"
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.incomeCollected}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, incomeCollected: t.replace(/[^0-9.]/g, '') }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('details.expenses')}</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder={t('form.contractAmountPlaceholder')}
                    keyboardType="numeric"
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.expenses}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, expenses: t.replace(/[^0-9.]/g, '') }))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('completePercent')}</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder={t('form.contractAmountPlaceholder')}
                    keyboardType="numeric"
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.percentComplete}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, percentComplete: t.replace(/[^0-9]/g, '') }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('status.label')}</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder={t('status.active')}
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.status}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, status: t }))}
                  />
                </View>
              </View>

              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.lg, paddingTop: Spacing.md }}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.lightGray }]}
                onPress={closeNewProject}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: Colors.primaryText }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSaveNewProject}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: Colors.white }]}>
                  {saving ? t('creating') : t('createProject')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Timeline Picker for New Project - INSIDE parent modal to fix z-index */}
          <TimelinePickerModal
            visible={showNewProjectTimeline}
            onClose={() => setShowNewProjectTimeline(false)}
            onConfirm={handleNewProjectTimelineConfirm}
            projectData={newProject}
          />

          {/* Phase Picker for New Project - INSIDE parent modal to fix z-index */}
          <PhasePickerModal
            visible={showNewProjectPhases}
            onClose={() => setShowNewProjectPhases(false)}
            onSave={(phases) => {
              setNewProjectPhases(phases);
              setShowNewProjectPhases(false);
            }}
            projectStartDate={newProject.startDate}
            userPhasesTemplate={userProfile?.phasesTemplate}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Timeline Picker for Edit */}
      {editOpen && editing && (
        <TimelinePickerModal
          visible={showEditTimeline}
          onClose={() => setShowEditTimeline(false)}
          onConfirm={handleEditTimelineConfirm}
          projectData={editing}
        />
      )}

      {/* Phase Picker for Edit */}
      {editOpen && editing && (
        <PhasePickerModal
          visible={showEditPhases}
          onClose={() => setShowEditPhases(false)}
          onSave={(phases) => {
            setEditingPhases(phases);
            setShowEditPhases(false);
          }}
          projectStartDate={editing.startDate}
          initialPhases={editingPhases}
          userPhasesTemplate={userProfile?.phasesTemplate}
        />
      )}

      {/* Phase Detail Modal */}
      {selectedPhaseDetail && (
        <PhaseDetailModal
          visible={showPhaseDetail}
          onClose={() => setShowPhaseDetail(false)}
          phase={selectedPhaseDetail}
          onUpdate={handlePhaseUpdate}
        />
      )}

      {/* Upgrade Modal - shown when project limit is reached */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigation.navigate('Settings', { screen: 'Paywall' });
        }}
        currentCount={subscriptionInfo?.active_count}
        limit={subscriptionInfo?.limit}
        planTier={subscriptionInfo?.plan_tier}
      />

      {/* "New Project" entry point lives in the bottom-tab QuickActionFAB
          (visible to supervisors when can_create_projects is on). Keeping a
          second FAB here would stack two "+" buttons in the same corner. */}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LightColors.background,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: LightColors.white,
  },
  topBarLeft: {
    minWidth: 40,
    justifyContent: 'center',
  },
  exitFieldModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  exitFieldModeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  emptySpace: {
    flex: 1,
  },
  newProjectButton: {
    padding: Spacing.sm,
  },
  newProjectText: {
    fontSize: FontSizes.body,
    color: LightColors.primaryBlue,
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: LightColors.white,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LightColors.lightGray,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.body,
    color: LightColors.primaryText,
  },
  filterChips: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: LightColors.lightGray,
  },
  activeChip: {
    backgroundColor: LightColors.primaryBlue,
  },
  chipText: {
    fontSize: FontSizes.small,
    color: LightColors.primaryText,
    fontWeight: '500',
  },
  activeChipText: {
    fontSize: FontSizes.small,
    color: LightColors.white,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  flatListContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  projectCard: {
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: LightColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginBottom: Spacing.xs,
  },
  clientName: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
    marginBottom: Spacing.md,
  },
  budgetSection: {
    marginBottom: Spacing.md,
  },
  budgetText: {
    fontSize: FontSizes.body,
    color: LightColors.primaryText,
    marginBottom: Spacing.xs,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: LightColors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: '100%',
    backgroundColor: LightColors.primaryBlue,
  },
  percentageText: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
    textAlign: 'right',
  },
  workersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  workerAvatars: {
    flexDirection: 'row',
    marginRight: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: LightColors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
    borderWidth: 2,
    borderColor: LightColors.white,
  },
  avatarText: {
    fontSize: FontSizes.tiny,
    color: LightColors.white,
    fontWeight: '600',
  },
  workerCount: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
    marginLeft: Spacing.md,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  statusSuccess: {
    backgroundColor: LightColors.successGreen + '20',
  },
  statusWarning: {
    backgroundColor: LightColors.warningOrange + '20',
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  lastActivity: {
    fontSize: FontSizes.tiny,
    color: LightColors.placeholderText,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontSize: FontSizes.body,
    color: LightColors.secondaryText,
    marginTop: Spacing.md,
  },
  projectsList: {
    gap: Spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.body,
    color: LightColors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSizes.small,
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  modalButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  modalButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  timelineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  timelineText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  timelineSubtext: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  timelinePlaceholder: {
    fontSize: FontSizes.small,
  },
  projectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
});
