/**
 * OwnerProjectsScreen
 * Owner's version of Projects screen with sectioned display:
 * - "Your Projects" section (owner's direct projects)
 * - "[Supervisor Name]'s Projects" sections for each supervisor
 * Uses SectionList for grouped display
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import SimpleProjectCard from '../../components/SimpleProjectCard';
import NotificationBell from '../../components/NotificationBell';
import logger from '../../utils/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  hasPhases: true,
  isDemo: true,
  assignment_status: 'owner_direct',
};

// Owner color palette
const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
};

export default function OwnerProjectsScreen({ embedded = false, showFilter = false }) {
  const { t } = useTranslation('projects');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjectsForOwner();
      setProjects(data || []);
      setHasLoadedOnce(true);
    } catch (error) {
      logger.error('Error loading projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load projects immediately on mount (so data is ready during splash)
  useEffect(() => {
    loadProjects();
  }, []);

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce) {
        loadProjects();
      }
    }, [hasLoadedOnce, loadProjects])
  );

  // Refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
  }, [loadProjects]);

  // Filter projects based on active filter
  const filteredProjects = useMemo(() => {
    if (activeFilter === 'all') return projects;
    return projects.filter(project => {
      switch (activeFilter) {
        case 'active':
          return ['active', 'on-track', 'behind', 'over-budget'].includes(project.status);
        case 'completed':
          return project.status === 'completed';
        case 'mine':
          return project.assignment_status === 'owner_direct';
        case 'assigned':
          return project.assignment_status === 'assigned_to_supervisor' || project.assignment_status === 'supervisor_own';
        case 'draft':
          return project.status === 'draft';
        case 'archived':
          return project.status === 'archived';
        default:
          return true;
      }
    });
  }, [projects, activeFilter]);

  // Filter pill definitions
  const FILTERS = [
    { key: 'all', label: 'All', count: projects.length },
    { key: 'active', label: 'Active', count: projects.filter(p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status)).length },
    { key: 'mine', label: 'Mine', count: projects.filter(p => p.assignment_status === 'owner_direct').length },
    { key: 'assigned', label: 'Assigned', count: projects.filter(p => p.assignment_status === 'assigned_to_supervisor' || p.assignment_status === 'supervisor_own').length },
    { key: 'completed', label: 'Done', count: projects.filter(p => p.status === 'completed').length },
    { key: 'draft', label: 'Draft', count: projects.filter(p => p.status === 'draft').length },
  ];

  // Group projects by manager for sectioned display
  const sections = useMemo(() => {
    // Add demo project if no real projects
    const projectsToGroup = filteredProjects.length === 0 && hasLoadedOnce && activeFilter === 'all'
      ? [DEMO_PROJECT]
      : filteredProjects;

    // "All" filter — flat list, everything mixed together
    if (activeFilter === 'all' || activeFilter !== 'assigned') {
      return [{
        title: activeFilter === 'all' ? 'All Projects' : activeFilter === 'active' ? 'Active Projects' : activeFilter === 'completed' ? 'Completed' : activeFilter === 'mine' ? 'Your Projects' : activeFilter === 'draft' ? 'Drafts' : 'Projects',
        data: chunkArray(projectsToGroup, 2),
      }];
    }

    // "Assigned" filter — grouped by supervisor
    const supervisorGroups = {};
    projectsToGroup.forEach(project => {
      const managerName = project.managed_by_name || 'Unassigned';
      if (!supervisorGroups[managerName]) {
        supervisorGroups[managerName] = [];
      }
      supervisorGroups[managerName].push(project);
    });

    const result = [];
    Object.keys(supervisorGroups).sort().forEach(name => {
      result.push({
        title: `${name}'s Projects`,
        data: chunkArray(supervisorGroups[name], 2),
      });
    });

    return result;
  }, [filteredProjects, hasLoadedOnce, activeFilter]);

  // Handle project card press
  const handleProjectCardPress = useCallback((project) => {
    navigation.navigate('ProjectDetail', {
      project,
      isDemo: project.isDemo,
    });
  }, [navigation]);

  // Render section header
  const renderSectionHeader = useCallback(({ section }) => {
    const isFirstSection = section.title === 'Your Projects';
    return (
      <>
        {/* Beautiful gradient divider for non-first sections */}
        {!isFirstSection && (
          <View style={styles.dividerContainer}>
            <LinearGradient
              colors={['transparent', OWNER_COLORS.primary]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.dividerLineLeft}
            />
            <View style={styles.dividerIconContainer}>
              <Ionicons name="briefcase" size={14} color={OWNER_COLORS.primary} />
            </View>
            <LinearGradient
              colors={[OWNER_COLORS.primary, 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.dividerLineRight}
            />
          </View>
        )}

        {/* Section title row */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            {section.title}
          </Text>
          <View style={[styles.sectionBadge, { backgroundColor: `${OWNER_COLORS.primary}12` }]}>
            <Text style={[styles.sectionBadgeText, { color: OWNER_COLORS.primary }]}>
              {section.data.flat().length}
            </Text>
          </View>
        </View>
      </>
    );
  }, [Colors]);

  // Render row of cards (2 per row)
  const renderRow = useCallback(({ item: row }) => (
    <View style={styles.row}>
      {row.map((project) => (
        <SimpleProjectCard
          key={project.id}
          project={project}
          onPress={() => handleProjectCardPress(project)}
        />
      ))}
      {/* Add empty placeholder if odd number */}
      {row.length === 1 && <View style={styles.placeholder} />}
    </View>
  ), [handleProjectCardPress]);

  // Empty state
  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: `${OWNER_COLORS.primary}10` }]}>
        <Ionicons name="folder-outline" size={48} color={OWNER_COLORS.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
        {t('noProjects', 'No projects yet')}
      </Text>
      <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
        {t('noProjectsHint', 'Create your first project to get started')}
      </Text>
    </View>
  ), [Colors, t]);

  // Loading state
  if (loading && !hasLoadedOnce) {
    const LoadingContent = (
      <View style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
            {t('loadingProjects', 'Loading projects...')}
          </Text>
        </View>
      </View>
    );
    if (embedded) return LoadingContent;
    return <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>{LoadingContent}</SafeAreaView>;
  }

  const Wrapper = embedded ? View : SafeAreaView;

  return (
    <Wrapper style={[styles.container, { backgroundColor: Colors.white }]}>
      {/* Header — hidden when embedded in WorkScreen */}
      {!embedded && (
      <View style={[styles.header, { backgroundColor: Colors.white }]}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterDropdown(!showFilterDropdown)}
          activeOpacity={0.7}
        >
          <Ionicons name="filter" size={20} color={activeFilter !== 'all' ? OWNER_COLORS.primary : Colors.secondaryText} />
          {activeFilter !== 'all' && <View style={[styles.filterDot, { backgroundColor: OWNER_COLORS.primary }]} />}
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          {t('title', 'Projects')}
        </Text>
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>
      )}

      {/* Filter Dropdown */}
      {(showFilterDropdown || (embedded && showFilter)) && (
        <View style={[styles.filterDropdown, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
          {FILTERS.map(filter => {
            const isActive = activeFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterDropdownItem,
                  isActive && { backgroundColor: OWNER_COLORS.primary + '10' },
                ]}
                onPress={() => {
                  setActiveFilter(filter.key);
                  setShowFilterDropdown(false);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.filterDropdownLeft}>
                  {isActive && <Ionicons name="checkmark" size={18} color={OWNER_COLORS.primary} />}
                  {!isActive && <View style={{ width: 18 }} />}
                  <Text style={[
                    styles.filterDropdownText,
                    { color: isActive ? OWNER_COLORS.primary : Colors.primaryText },
                    isActive && { fontWeight: '700' },
                  ]}>
                    {filter.label}
                  </Text>
                </View>
                <Text style={[styles.filterDropdownCount, { color: Colors.secondaryText }]}>
                  {filter.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Projects List */}
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `row-${index}`}
        renderItem={renderRow}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={OWNER_COLORS.primary}
          />
        }
      />
    </Wrapper>
  );
}

// Helper to chunk array into groups of n
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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
  },
  filterButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  filterDropdown: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  filterDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  filterDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterDropdownText: {
    fontSize: 15,
    fontWeight: '500',
  },
  filterDropdownCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dividerLineLeft: {
    flex: 1,
    height: 1,
  },
  dividerLineRight: {
    flex: 1,
    height: 1,
  },
  dividerIconContainer: {
    marginHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  placeholder: {
    width: (SCREEN_WIDTH - (Spacing.lg * 2) - Spacing.md) / 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
});
