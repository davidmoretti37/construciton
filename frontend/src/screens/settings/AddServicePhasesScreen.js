/**
 * Add Service Phases Screen
 * Configure phases for a new service being added
 * Adapted from onboarding/PhaseCustomizationScreen.js for single service
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getPhaseTemplates } from '../../services/serviceDataService';

export default function AddServicePhasesScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { categoryId, categoryName, categoryIcon } = route.params || {};

  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPhase, setEditingPhase] = useState(null);
  const [showPhaseModal, setShowPhaseModal] = useState(false);

  useEffect(() => {
    loadPhaseTemplates();
  }, []);

  const loadPhaseTemplates = async () => {
    try {
      const templates = await getPhaseTemplates(categoryId);
      // Convert templates to editable format
      const editablePhases = templates.map((template, index) => ({
        id: template.id || Date.now().toString() + index,
        name: template.phase_name || template.name || '',
        description: template.description || '',
        defaultDays: template.default_days || template.defaultDays || 1,
        tasks: template.tasks || [],
      }));
      setPhases(editablePhases);
    } catch (error) {
      console.error('Error loading phase templates:', error);
      Alert.alert('Error', 'Failed to load phase templates');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhase = () => {
    const newPhase = {
      id: Date.now().toString(),
      name: '',
      description: '',
      defaultDays: 1,
      tasks: [],
      isNew: true,
    };
    setEditingPhase(newPhase);
    setShowPhaseModal(true);
  };

  const handleEditPhase = (phase, index) => {
    setEditingPhase({ ...phase, index });
    setShowPhaseModal(true);
  };

  const handleSavePhase = (updatedPhase) => {
    if (updatedPhase.index !== undefined) {
      // Update existing phase
      const updatedPhases = [...phases];
      updatedPhases[updatedPhase.index] = {
        name: updatedPhase.name,
        description: updatedPhase.description,
        defaultDays: updatedPhase.defaultDays,
        tasks: updatedPhase.tasks,
        id: updatedPhase.id,
      };
      setPhases(updatedPhases);
    } else {
      // Add new phase
      setPhases([...phases, {
        id: updatedPhase.id,
        name: updatedPhase.name,
        description: updatedPhase.description,
        defaultDays: updatedPhase.defaultDays,
        tasks: updatedPhase.tasks,
      }]);
    }
    setShowPhaseModal(false);
    setEditingPhase(null);
  };

  const handleDeletePhase = (index) => {
    if (phases.length === 1) {
      Alert.alert('Cannot Delete', 'You need at least one phase for this service.');
      return;
    }

    Alert.alert(
      'Delete Phase',
      'Are you sure you want to delete this phase?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPhases(phases.filter((_, i) => i !== index));
          },
        },
      ]
    );
  };

  const handleContinue = () => {
    // Navigate to Pricing Setup with phases
    navigation.navigate('AddServicePricing', {
      categoryId,
      categoryName,
      categoryIcon,
      phases: phases.map(phase => ({
        name: phase.name,
        description: phase.description,
        default_days: phase.defaultDays,
        tasks: phase.tasks,
      })),
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
            Loading phases...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Configure Phases</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {/* Service Header */}
        <View style={[styles.serviceHeader, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <View style={[styles.serviceIcon, { backgroundColor: Colors.primaryBlue }]}>
            <Ionicons name={categoryIcon || 'briefcase-outline'} size={28} color="#fff" />
          </View>
          <View style={styles.serviceInfo}>
            <Text style={[styles.serviceName, { color: Colors.primaryText }]}>{categoryName}</Text>
            <Text style={[styles.serviceSubtitle, { color: Colors.secondaryText }]}>
              Customize your workflow phases
            </Text>
          </View>
        </View>

        {/* Phases List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {phases.length > 0 ? (
            phases.map((phase, index) => (
              <View
                key={phase.id || index}
                style={[
                  styles.phaseCard,
                  {
                    backgroundColor: Colors.white,
                    borderColor: Colors.border,
                  },
                ]}
              >
                {/* Phase Header with Edit/Delete */}
                <View style={styles.phaseHeader}>
                  <View style={styles.phaseHeaderLeft}>
                    <View style={[styles.phaseNumber, { backgroundColor: Colors.primaryBlue }]}>
                      <Text style={styles.phaseNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.phaseInfo}>
                      <Text style={[styles.phaseName, { color: Colors.primaryText }]}>
                        {phase.name || 'Unnamed Phase'}
                      </Text>
                      {phase.description && (
                        <Text style={[styles.phaseDescription, { color: Colors.secondaryText }]}>
                          {phase.description}
                        </Text>
                      )}
                      <Text style={[styles.phaseDays, { color: Colors.secondaryText }]}>
                        ~{phase.defaultDays || 1} days
                      </Text>
                    </View>
                  </View>

                  {/* Edit/Delete Actions */}
                  <View style={styles.phaseActions}>
                    <TouchableOpacity
                      onPress={() => handleEditPhase(phase, index)}
                      style={styles.actionButton}
                    >
                      <Ionicons name="create-outline" size={22} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePhase(index)}
                      style={styles.actionButton}
                    >
                      <Ionicons name="trash-outline" size={22} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Tasks */}
                {phase.tasks && phase.tasks.length > 0 && (
                  <View style={styles.tasksContainer}>
                    <Text style={[styles.tasksTitle, { color: Colors.secondaryText }]}>
                      Tasks:
                    </Text>
                    {phase.tasks.map((task, taskIndex) => (
                      <View key={taskIndex} style={styles.taskItem}>
                        <View style={[styles.taskBullet, { backgroundColor: Colors.primaryBlue }]} />
                        <Text style={[styles.taskText, { color: Colors.primaryText }]}>
                          {task}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="git-network-outline" size={64} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                No phases yet. Add your first phase below.
              </Text>
            </View>
          )}

          {/* Add Phase Button */}
          <TouchableOpacity
            style={[styles.addPhaseButton, { borderColor: Colors.primaryBlue }]}
            onPress={handleAddPhase}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
            <Text style={[styles.addPhaseText, { color: Colors.primaryBlue }]}>
              Add Phase
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Bottom Section */}
      <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Continue to Pricing</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Phase Edit Modal */}
      {showPhaseModal && editingPhase && (
        <PhaseEditModal
          phase={editingPhase}
          onSave={handleSavePhase}
          onCancel={() => {
            setShowPhaseModal(false);
            setEditingPhase(null);
          }}
          Colors={Colors}
        />
      )}
    </SafeAreaView>
  );
}

// Phase Edit Modal Component
function PhaseEditModal({ phase, onSave, onCancel, Colors }) {
  const [name, setName] = useState(phase.name || '');
  const [description, setDescription] = useState(phase.description || '');
  const [days, setDays] = useState((phase.defaultDays || 1).toString());
  const [tasks, setTasks] = useState(phase.tasks || []);
  const [newTask, setNewTask] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a phase name');
      return;
    }

    onSave({
      ...phase,
      name: name.trim(),
      description: description.trim(),
      defaultDays: parseInt(days) || 1,
      tasks,
    });
  };

  const handleAddTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, newTask.trim()]);
    setNewTask('');
  };

  const handleRemoveTask = (index) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onCancel}>
            <Ionicons name="close" size={28} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
            {phase.isNew ? 'Add Phase' : 'Edit Phase'}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[styles.saveText, { color: Colors.primaryBlue }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Phase Name */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Phase Name *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: Colors.border }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Site Preparation"
              placeholderTextColor={Colors.secondaryText}
            />
          </View>

          {/* Description */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: Colors.border }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What happens in this phase..."
              placeholderTextColor={Colors.secondaryText}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Days */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Estimated Days</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: Colors.border }]}
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={Colors.secondaryText}
            />
          </View>

          {/* Tasks */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Tasks</Text>

            {tasks.map((task, index) => (
              <View key={index} style={[styles.taskRow, { backgroundColor: Colors.white }]}>
                <Text style={[styles.taskRowText, { color: Colors.primaryText }]}>{task}</Text>
                <TouchableOpacity onPress={() => handleRemoveTask(index)}>
                  <Ionicons name="close-circle" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={[styles.addTaskRow, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <TextInput
                style={[styles.addTaskInput, { color: Colors.primaryText }]}
                value={newTask}
                onChangeText={setNewTask}
                placeholder="Add a task..."
                placeholderTextColor={Colors.secondaryText}
                onSubmitEditing={handleAddTask}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={handleAddTask}>
                <Ionicons name="add-circle" size={24} color={Colors.primaryBlue} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 4,
  },
  serviceSubtitle: {
    fontSize: FontSizes.small,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: 120,
  },
  phaseCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  phaseHeaderLeft: {
    flexDirection: 'row',
    gap: Spacing.md,
    flex: 1,
  },
  phaseActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  phaseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseNumberText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: 4,
  },
  phaseDescription: {
    fontSize: FontSizes.small,
    lineHeight: 18,
    marginBottom: 4,
  },
  phaseDays: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  tasksContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tasksTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  taskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  taskText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
  },
  bottomSection: {
    padding: Spacing.xl,
    paddingBottom: 60,
    borderTopWidth: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    gap: Spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  addPhaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  addPhaseText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  saveText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: Spacing.xl,
  },
  modalField: {
    marginBottom: Spacing.xl,
  },
  modalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
  },
  modalTextArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  taskRowText: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  addTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  addTaskInput: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.xs,
  },
});
