import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjects } from '../utils/storage';
import { ProjectCard } from '../components/ChatVisuals';
import EditProjectModal from '../components/EditProjectModal';

export default function ProjectsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  // Fetch projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const fetchedProjects = await fetchProjects();
      setProjects(fetchedProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, []);

  // Filter projects based on search query and filter
  const filteredProjects = projects.filter(project => {
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

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        project.name.toLowerCase().includes(query) ||
        project.client.toLowerCase().includes(query) ||
        project.location?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const handleProjectAction = (action) => {
    console.log('Project action:', action);

    if (action.type === 'view-project') {
      // Find the project by ID
      const project = projects.find(p => p.id === action.data.projectId);
      if (project) {
        setSelectedProject(project);
        setShowEditModal(true);
      }
    }
  };

  const handleProjectSave = (savedProject) => {
    // Reload projects to get the updated data
    loadProjects();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.newProjectButton}>
          <Text style={[styles.newProjectText, { color: Colors.primaryBlue }]}>+ New Project</Text>
        </TouchableOpacity>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.placeholderText} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor={Colors.placeholderText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.filterChips}>
          <TouchableOpacity
            style={[styles.chip, selectedFilter === 'All' && styles.activeChip]}
            onPress={() => setSelectedFilter('All')}
          >
            <Text style={selectedFilter === 'All' ? styles.activeChipText : styles.chipText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, selectedFilter === 'Active' && styles.activeChip]}
            onPress={() => setSelectedFilter('Active')}
          >
            <Text style={selectedFilter === 'Active' ? styles.activeChipText : styles.chipText}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, selectedFilter === 'Completed' && styles.activeChip]}
            onPress={() => setSelectedFilter('Completed')}
          >
            <Text style={selectedFilter === 'Completed' ? styles.activeChipText : styles.chipText}>Completed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, selectedFilter === 'Archived' && styles.activeChip]}
            onPress={() => setSelectedFilter('Archived')}
          >
            <Text style={selectedFilter === 'Archived' ? styles.activeChipText : styles.chipText}>Archived</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Projects List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading projects...</Text>
          </View>
        ) : filteredProjects.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-outline" size={64} color={Colors.secondaryText} />
            <Text style={[styles.emptyStateText, { color: Colors.primaryText }]}>
              {searchQuery || selectedFilter !== 'All' ? 'No projects found' : 'No projects yet'}
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              {searchQuery || selectedFilter !== 'All'
                ? 'Try adjusting your search or filter'
                : 'Create your first project to get started'}
            </Text>
          </View>
        ) : (
          <View style={styles.projectsList}>
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} data={project} onAction={handleProjectAction} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Project Modal */}
      <EditProjectModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        projectData={selectedProject}
        onSave={handleProjectSave}
      />
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
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
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
  projectCard: {
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
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
    backgroundColor: '#D1FAE5',
  },
  statusWarning: {
    backgroundColor: '#FEF3C7',
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
});
