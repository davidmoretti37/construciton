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
  Modal,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjects, saveProject, saveProjectPhases, fetchProjectPhases, deleteProject } from '../utils/storage';
import { ProjectCard } from '../components/ChatVisuals';
import TimelinePickerModal from '../components/TimelinePickerModal';
import ConversationsSection from '../components/ConversationsSection';
import PhasePickerModal from '../components/PhasePickerModal';
import PhaseTimeline from '../components/PhaseTimeline';
import PhaseDetailModal from '../components/PhaseDetailModal';
import SimpleProjectCard from '../components/SimpleProjectCard';
import ProjectDetailView from '../components/ProjectDetailView';

export default function ProjectsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  // Project detail view
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectDetail, setShowProjectDetail] = useState(false);

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
    if (!dateString) return 'Not set';
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
        alert('Please enter a project name');
        return;
      }
      if (!newProject.client.trim()) {
        alert('Please enter a client name');
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

      if (savedProject) {
        // Save phases if any were selected
        if (newProjectPhases.length > 0) {
          await saveProjectPhases(savedProject.id, newProjectPhases);
        }

        // Reload projects list
        await loadProjects();
        closeNewProject();
      } else {
        alert('Failed to save project. Please try again.');
      }
    } catch (error) {
      console.error('Error saving new project:', error);
      alert('Failed to save project. Please try again.');
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
        await loadProjects();
        closeEdit();
      } else {
        alert('Failed to update project. Please try again.');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reload projects whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

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

  const handleDeleteProject = async (projectId) => {
    try {
      const success = await deleteProject(projectId);
      if (success) {
        // Close the detail modal
        setShowProjectDetail(false);
        setSelectedProject(null);
        // Reload projects list
        await loadProjects();
        Alert.alert('Success', 'Project deleted successfully');
      } else {
        Alert.alert('Error', 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      Alert.alert('Error', 'Failed to delete project');
    }
  };

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

  const handleProjectCardPress = async (project) => {
    setSelectedProject(project);
    setShowProjectDetail(true);
  };

  const handleProjectEdit = async () => {
    if (!selectedProject) return;

    // Close detail view
    setShowProjectDetail(false);

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
    console.log('Project action:', action);
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
      await loadProjects(); // Reload projects to update card display
    }
    setShowPhaseDetail(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.newProjectButton} onPress={() => setNewProjectOpen(true)}>
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
        contentContainerStyle={styles.scrollContent}
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
          <View style={styles.projectsGrid}>
            {filteredProjects.map((project) => (
              <SimpleProjectCard
                key={project.id}
                project={project}
                onPress={() => handleProjectCardPress(project)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      {/* Simple Edit Modal - Hide when timeline picker is open */}
      <Modal visible={editOpen && !showEditTimeline} transparent animationType="slide" onRequestClose={closeEdit}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: Colors.white }]}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Edit Project</Text>
            {editing && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View>
                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Name</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="Project name"
                  placeholderTextColor={Colors.placeholderText}
                  value={editing.name}
                  onChangeText={(t) => setEditing((e) => ({ ...e, name: t }))}
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Client</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="Client"
                  placeholderTextColor={Colors.placeholderText}
                  value={editing.client || ''}
                  onChangeText={(t) => setEditing((e) => ({ ...e, client: t }))}
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Client Phone</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="+1 555 123 4567"
                  placeholderTextColor={Colors.placeholderText}
                  value={editing.clientPhone || ''}
                  onChangeText={(t) => setEditing((e) => ({ ...e, clientPhone: t }))}
                  keyboardType="phone-pad"
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Contract Amount</Text>
                <RNTextInput
                  style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                  keyboardType="numeric"
                  value={String(editing.contractAmount ?? editing.budget ?? 0)}
                  onChangeText={(t) => setEditing((e) => ({ ...e, contractAmount: t.replace(/[^0-9.]/g, ''), budget: t.replace(/[^0-9.]/g, '') }))}
                />

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Timeline</Text>
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
                          {editing.daysRemaining} days
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                        Set project timeline
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>

                <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Project Phases</Text>
                <TouchableOpacity
                  style={[styles.timelineButton, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}
                  onPress={() => setShowEditPhases(true)}
                >
                  <Ionicons name="layers-outline" size={20} color={Colors.primaryBlue} />
                  <View style={{ flex: 1 }}>
                    {editingPhases.length > 0 ? (
                      <Text style={[styles.timelineText, { color: Colors.primaryText }]}>
                        {editingPhases.length} {editingPhases.length === 1 ? 'phase' : 'phases'} configured
                      </Text>
                    ) : (
                      <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                        Add project phases (optional)
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
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Income Collected</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      keyboardType="numeric"
                      value={String(editing.incomeCollected ?? 0)}
                      onChangeText={(t) => setEditing((e) => ({ ...e, incomeCollected: t.replace(/[^0-9.]/g, '') }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Expenses</Text>
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
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Complete %</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      keyboardType="numeric"
                      value={String(editing.percentComplete ?? 0)}
                      onChangeText={(t) => setEditing((e) => ({ ...e, percentComplete: t.replace(/[^0-9]/g, '') }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Status</Text>
                    <RNTextInput
                      style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                      placeholder="on-track / behind / completed"
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
                <Text style={[styles.modalButtonText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: Colors.white }]}>
                  {saving ? 'Saving...' : 'Save'}
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
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>New Project</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View>
              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Project Name *</Text>
              <RNTextInput
                style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="e.g., Kitchen Remodel"
                placeholderTextColor={Colors.placeholderText}
                value={newProject.name}
                onChangeText={(t) => setNewProject((p) => ({ ...p, name: t }))}
              />

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Client Name *</Text>
              <RNTextInput
                style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="Client name"
                placeholderTextColor={Colors.placeholderText}
                value={newProject.client}
                onChangeText={(t) => setNewProject((p) => ({ ...p, client: t }))}
              />

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Contract Amount</Text>
              <RNTextInput
                style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={Colors.placeholderText}
                value={newProject.contractAmount}
                onChangeText={(t) => setNewProject((p) => ({ ...p, contractAmount: t.replace(/[^0-9.]/g, '') }))}
              />

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Timeline</Text>
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
                        {newProject.daysRemaining} days
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                      Set project timeline
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>

              <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Project Phases</Text>
              <TouchableOpacity
                style={[styles.timelineButton, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}
                onPress={() => setShowNewProjectPhases(true)}
              >
                <Ionicons name="layers-outline" size={20} color={Colors.primaryBlue} />
                <View style={{ flex: 1 }}>
                  {newProjectPhases.length > 0 ? (
                    <Text style={[styles.timelineText, { color: Colors.primaryText }]}>
                      {newProjectPhases.length} {newProjectPhases.length === 1 ? 'phase' : 'phases'} configured
                    </Text>
                  ) : (
                    <Text style={[styles.timelinePlaceholder, { color: Colors.placeholderText }]}>
                      Add project phases (optional)
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Income Collected</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.incomeCollected}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, incomeCollected: t.replace(/[^0-9.]/g, '') }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Expenses</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.expenses}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, expenses: t.replace(/[^0-9.]/g, '') }))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Complete %</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.placeholderText}
                    value={newProject.percentComplete}
                    onChangeText={(t) => setNewProject((p) => ({ ...p, percentComplete: t.replace(/[^0-9]/g, '') }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>Status</Text>
                  <RNTextInput
                    style={[styles.modalInput, { borderColor: Colors.border, color: Colors.primaryText }]}
                    placeholder="active"
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
                <Text style={[styles.modalButtonText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSaveNewProject}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: Colors.white }]}>
                  {saving ? 'Creating...' : 'Create Project'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Timeline Picker for New Project */}
      <TimelinePickerModal
        visible={showNewProjectTimeline}
        onClose={() => setShowNewProjectTimeline(false)}
        onConfirm={handleNewProjectTimelineConfirm}
        projectData={newProject}
      />

      {/* Timeline Picker for Edit */}
      {editOpen && editing && (
        <TimelinePickerModal
          visible={showEditTimeline}
          onClose={() => setShowEditTimeline(false)}
          onConfirm={handleEditTimelineConfirm}
          projectData={editing}
        />
      )}

      {/* Phase Picker for New Project */}
      <PhasePickerModal
        visible={showNewProjectPhases}
        onClose={() => setShowNewProjectPhases(false)}
        onSave={(phases) => {
          setNewProjectPhases(phases);
          setShowNewProjectPhases(false);
        }}
        projectStartDate={newProject.startDate}
      />

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

      {/* Project Detail View Modal */}
      <ProjectDetailView
        visible={showProjectDetail}
        project={selectedProject}
        onClose={() => setShowProjectDetail(false)}
        onEdit={handleProjectEdit}
        onAction={handleProjectAction}
        onDelete={handleDeleteProject}
        navigation={navigation}
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
  scrollContent: {
    paddingBottom: 100,
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
