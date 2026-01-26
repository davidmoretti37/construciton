import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getPhaseTemplates as getHardcodedPhaseTemplates, createCustomPhase } from '../constants/phaseTemplates';
import { getAllServices, getPhaseTemplates as getDBPhaseTemplates } from '../services/serviceDataService';

export default function PhasePickerModal({
  visible,
  onClose,
  onSave,
  tradeIds = [],
  projectStartDate,
  initialPhases = [],
  userPhasesTemplate = null, // User's saved phases from profile
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [selectedPhases, setSelectedPhases] = useState([]);
  const [customPhaseName, setCustomPhaseName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [expandedPhaseIndex, setExpandedPhaseIndex] = useState(null);
  const [taskInputs, setTaskInputs] = useState({}); // { phaseIndex: 'task text' }

  // New state for service-based phases
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [servicePhases, setServicePhases] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingPhases, setLoadingPhases] = useState(false);

  useEffect(() => {
    if (initialPhases.length > 0) {
      setSelectedPhases(initialPhases);
    }
  }, [initialPhases]);

  // Load all services on mount
  useEffect(() => {
    const loadServices = async () => {
      setLoadingServices(true);
      try {
        const allServices = await getAllServices();
        setServices(allServices || []);
      } catch (error) {
        console.error('Error loading services:', error);
      } finally {
        setLoadingServices(false);
      }
    };
    if (visible) {
      loadServices();
    }
  }, [visible]);

  // Valid Ionicons for services (fallback if icon name is invalid)
  const getValidIcon = (iconName) => {
    const validIcons = [
      'construct', 'color-palette-outline', 'grid-outline', 'hammer-outline',
      'square-outline', 'build-outline', 'water-outline', 'flash-outline',
      'layers-outline', 'home-outline', 'cube-outline', 'leaf-outline', 'thermometer-outline'
    ];
    return validIcons.includes(iconName) ? iconName : 'construct';
  };

  // Handle service selection - load phases from database
  const handleServiceSelect = async (service) => {
    if (selectedService?.id === service.id) {
      // Deselect if same service clicked
      setSelectedService(null);
      setServicePhases([]);
      return;
    }

    setSelectedService(service);
    setLoadingPhases(true);
    try {
      const phases = await getDBPhaseTemplates(service.id);
      // Transform DB format to component format
      const transformed = (phases || []).map(p => ({
        name: p.phase_name,
        defaultDays: p.default_days || 5,
        description: p.description || '',
        defaultTasks: p.tasks || []
      }));
      setServicePhases(transformed);
    } catch (error) {
      console.error('Error loading service phases:', error);
      setServicePhases([]);
    } finally {
      setLoadingPhases(false);
    }
  };

  // Transform user's profile phases to component format
  const userPhases = userPhasesTemplate?.phases?.map(p => ({
    name: p.name,
    defaultDays: p.typical_days || 5,
    description: p.description || '',
    defaultTasks: p.tasks || []
  })) || [];

  // Get fallback hardcoded phases (only if no user phases and no service phases)
  const fallbackPhases = (userPhases.length === 0 && servicePhases.length === 0)
    ? getHardcodedPhaseTemplates(tradeIds[0] || 'construction')
    : [];

  const handleTogglePhase = (phase) => {
    const exists = selectedPhases.find(p => p.name === phase.name);

    if (exists) {
      // Remove phase
      setSelectedPhases(selectedPhases.filter(p => p.name !== phase.name));
    } else {
      // Add phase with calculated dates if project start date exists
      const newPhase = { ...phase };

      // Add default tasks if available
      if (phase.defaultTasks && phase.defaultTasks.length > 0) {
        newPhase.tasks = phase.defaultTasks.map((taskDesc, idx) => ({
          id: `task-${Date.now()}-${idx}`,
          description: taskDesc,
          order: idx + 1,
          completed: false,
          completed_by: null,
          completed_date: null,
          photo_url: null,
        }));
      } else {
        newPhase.tasks = [];
      }

      if (projectStartDate && selectedPhases.length === 0) {
        // First phase starts on project start date
        newPhase.startDate = projectStartDate;
        const startDate = new Date(projectStartDate);
        startDate.setDate(startDate.getDate() + phase.defaultDays);
        newPhase.endDate = startDate.toISOString().split('T')[0];
      } else if (selectedPhases.length > 0 && selectedPhases[selectedPhases.length - 1].endDate) {
        // Subsequent phases start when previous ends
        const previousEnd = new Date(selectedPhases[selectedPhases.length - 1].endDate);
        previousEnd.setDate(previousEnd.getDate() + 1);
        newPhase.startDate = previousEnd.toISOString().split('T')[0];
        previousEnd.setDate(previousEnd.getDate() + phase.defaultDays);
        newPhase.endDate = previousEnd.toISOString().split('T')[0];
      }

      setSelectedPhases([...selectedPhases, newPhase]);
    }
  };

  const handleAddCustomPhase = () => {
    if (!customPhaseName.trim()) {
      Alert.alert('Phase Name Required', 'Please enter a name for the custom phase');
      return;
    }

    const customPhase = createCustomPhase(customPhaseName.trim(), 5);

    // Calculate dates for custom phase
    if (projectStartDate && selectedPhases.length === 0) {
      customPhase.startDate = projectStartDate;
      const startDate = new Date(projectStartDate);
      startDate.setDate(startDate.getDate() + 5);
      customPhase.endDate = startDate.toISOString().split('T')[0];
    } else if (selectedPhases.length > 0 && selectedPhases[selectedPhases.length - 1].endDate) {
      const previousEnd = new Date(selectedPhases[selectedPhases.length - 1].endDate);
      previousEnd.setDate(previousEnd.getDate() + 1);
      customPhase.startDate = previousEnd.toISOString().split('T')[0];
      previousEnd.setDate(previousEnd.getDate() + 5);
      customPhase.endDate = previousEnd.toISOString().split('T')[0];
    }

    setSelectedPhases([...selectedPhases, customPhase]);
    setCustomPhaseName('');
    setShowCustomInput(false);
  };

  const handleUpdatePhaseDays = (index, days) => {
    const numDays = parseInt(days) || 0;
    const updated = [...selectedPhases];
    updated[index] = { ...updated[index], defaultDays: numDays };

    // Recalculate dates
    if (updated[index].startDate) {
      const startDate = new Date(updated[index].startDate);
      startDate.setDate(startDate.getDate() + numDays);
      updated[index].endDate = startDate.toISOString().split('T')[0];
    }

    setSelectedPhases(updated);
  };

  const handleRemovePhase = (index) => {
    const updated = [...selectedPhases];
    updated.splice(index, 1);
    setSelectedPhases(updated);
  };

  const handleMovePhase = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= selectedPhases.length) return;

    const updated = [...selectedPhases];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);
    setSelectedPhases(updated);
  };

  const handleAddTask = (phaseIndex) => {
    const taskText = taskInputs[phaseIndex]?.trim();
    if (!taskText) return;

    const updated = [...selectedPhases];
    const phase = updated[phaseIndex];

    // Parse tasks from comma-separated or newline-separated input
    const newTaskDescriptions = taskText
      .split(/[,\n]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const existingTasks = phase.tasks || [];
    const newTasks = newTaskDescriptions.map((desc, idx) => ({
      id: `task-${Date.now()}-${idx}`,
      description: desc,
      order: existingTasks.length + idx + 1,
      completed: false,
      completed_by: null,
      completed_date: null,
      photo_url: null,
    }));

    updated[phaseIndex] = {
      ...phase,
      tasks: [...existingTasks, ...newTasks],
    };

    setSelectedPhases(updated);
    setTaskInputs({ ...taskInputs, [phaseIndex]: '' });
  };

  const handleRemoveTask = (phaseIndex, taskId) => {
    const updated = [...selectedPhases];
    const phase = updated[phaseIndex];

    updated[phaseIndex] = {
      ...phase,
      tasks: (phase.tasks || []).filter(t => t.id !== taskId),
    };

    setSelectedPhases(updated);
  };

  const handleSave = () => {
    if (selectedPhases.length === 0) {
      Alert.alert('No Phases Selected', 'Please select at least one phase');
      return;
    }

    onSave(selectedPhases);
    onClose();
  };

  const isPhaseSelected = (phaseName) => {
    return selectedPhases.some(p => p.name === phaseName);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            Project Phases
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={[styles.saveText, { color: Colors.primaryBlue }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Info Box */}
          <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <Ionicons name="information-circle" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
              Select phases for this project. You can reorder them and adjust duration for each phase.
            </Text>
          </View>

          {/* User's Saved Phases (from profile) */}
          {userPhases.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Your Phases
              </Text>
              <View style={styles.phaseGrid}>
                {userPhases.map((phase, index) => {
                  const isSelected = isPhaseSelected(phase.name);
                  return (
                    <TouchableOpacity
                      key={`user-${index}`}
                      style={[
                        styles.phaseChip,
                        {
                          backgroundColor: isSelected ? Colors.primaryBlue : Colors.white,
                          borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                        },
                      ]}
                      onPress={() => handleTogglePhase(phase)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'add-circle-outline'}
                        size={18}
                        color={isSelected ? '#fff' : Colors.primaryText}
                      />
                      <Text
                        style={[
                          styles.phaseChipText,
                          { color: isSelected ? '#fff' : Colors.primaryText },
                        ]}
                      >
                        {phase.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Service Picker */}
          <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginTop: userPhases.length > 0 ? Spacing.lg : 0 }]}>
            Select a Service
          </Text>
          {loadingServices ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
              <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading services...</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.serviceScroll}>
              <View style={styles.serviceChipsRow}>
                {services.map((service) => {
                  const isServiceSelected = selectedService?.id === service.id;
                  return (
                    <TouchableOpacity
                      key={service.id}
                      style={[
                        styles.serviceChip,
                        {
                          backgroundColor: isServiceSelected ? Colors.primaryBlue : Colors.white,
                          borderColor: isServiceSelected ? Colors.primaryBlue : Colors.border,
                        },
                      ]}
                      onPress={() => handleServiceSelect(service)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={getValidIcon(service.icon)}
                        size={16}
                        color={isServiceSelected ? '#fff' : Colors.primaryBlue}
                      />
                      <Text
                        style={[
                          styles.serviceChipText,
                          { color: isServiceSelected ? '#fff' : Colors.primaryText },
                        ]}
                      >
                        {service.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Service Phases (loaded from database) */}
          {selectedService && (
            <>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginTop: Spacing.lg }]}>
                {selectedService.name} Phases
              </Text>
              {loadingPhases ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.primaryBlue} />
                  <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading phases...</Text>
                </View>
              ) : servicePhases.length > 0 ? (
                <View style={styles.phaseGrid}>
                  {servicePhases.map((phase, index) => {
                    const isSelected = isPhaseSelected(phase.name);
                    return (
                      <TouchableOpacity
                        key={`service-${index}`}
                        style={[
                          styles.phaseChip,
                          {
                            backgroundColor: isSelected ? Colors.primaryBlue : Colors.white,
                            borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                          },
                        ]}
                        onPress={() => handleTogglePhase(phase)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'add-circle-outline'}
                          size={18}
                          color={isSelected ? '#fff' : Colors.primaryText}
                        />
                        <Text
                          style={[
                            styles.phaseChipText,
                            { color: isSelected ? '#fff' : Colors.primaryText },
                          ]}
                        >
                          {phase.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={[styles.noDataText, { color: Colors.secondaryText }]}>
                  No phases configured for this service yet.
                </Text>
              )}
            </>
          )}

          {/* Fallback: Hardcoded phases (only shown if no user phases and no service selected) */}
          {fallbackPhases.length > 0 && !selectedService && (
            <>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginTop: Spacing.lg }]}>
                Suggested Phases
              </Text>
              <View style={styles.phaseGrid}>
                {fallbackPhases.map((phase, index) => {
                  const isSelected = isPhaseSelected(phase.name);
                  return (
                    <TouchableOpacity
                      key={`fallback-${index}`}
                      style={[
                        styles.phaseChip,
                        {
                          backgroundColor: isSelected ? Colors.primaryBlue : Colors.white,
                          borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                        },
                      ]}
                      onPress={() => handleTogglePhase(phase)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'add-circle-outline'}
                        size={18}
                        color={isSelected ? '#fff' : Colors.primaryText}
                      />
                      <Text
                        style={[
                          styles.phaseChipText,
                          { color: isSelected ? '#fff' : Colors.primaryText },
                        ]}
                      >
                        {phase.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Add Custom Phase */}
          <TouchableOpacity
            style={[styles.addCustomButton, { borderColor: Colors.border }]}
            onPress={() => setShowCustomInput(!showCustomInput)}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.addCustomText, { color: Colors.primaryBlue }]}>
              Add Custom Phase
            </Text>
          </TouchableOpacity>

          {showCustomInput && (
            <View style={styles.customInputContainer}>
              <TextInput
                style={[
                  styles.customInput,
                  {
                    backgroundColor: Colors.white,
                    borderColor: Colors.border,
                    color: Colors.primaryText,
                  },
                ]}
                placeholder="e.g., Site Preparation"
                placeholderTextColor={Colors.secondaryText}
                value={customPhaseName}
                onChangeText={setCustomPhaseName}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={handleAddCustomPhase}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Selected Phases List */}
          {selectedPhases.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginTop: Spacing.xl }]}>
                Selected Phases ({selectedPhases.length})
              </Text>
              <View style={styles.selectedPhasesList}>
                {selectedPhases.map((phase, index) => (
                  <View
                    key={index}
                    style={[
                      styles.selectedPhaseItem,
                      {
                        backgroundColor: Colors.white,
                        borderColor: Colors.border,
                      },
                    ]}
                  >
                    {/* Reorder Buttons */}
                    <View style={styles.reorderButtons}>
                      <TouchableOpacity
                        onPress={() => handleMovePhase(index, index - 1)}
                        disabled={index === 0}
                        style={styles.reorderButton}
                      >
                        <Ionicons
                          name="chevron-up"
                          size={20}
                          color={index === 0 ? Colors.lightGray : Colors.primaryText}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMovePhase(index, index + 1)}
                        disabled={index === selectedPhases.length - 1}
                        style={styles.reorderButton}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={index === selectedPhases.length - 1 ? Colors.lightGray : Colors.primaryText}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Phase Info */}
                    <View style={styles.phaseItemContent}>
                      <View style={styles.phaseItemHeader}>
                        <Text style={[styles.phaseNumber, { color: Colors.secondaryText }]}>
                          {index + 1}.
                        </Text>
                        <Text style={[styles.phaseItemName, { color: Colors.primaryText }]}>
                          {phase.name}
                        </Text>
                      </View>

                      {/* Duration Input */}
                      <View style={styles.durationInput}>
                        <Text style={[styles.durationLabel, { color: Colors.secondaryText }]}>
                          Duration:
                        </Text>
                        <TextInput
                          style={[
                            styles.durationField,
                            {
                              backgroundColor: Colors.background,
                              borderColor: Colors.border,
                              color: Colors.primaryText,
                            },
                          ]}
                          value={String(phase.defaultDays || phase.plannedDays || 5)}
                          onChangeText={(text) => handleUpdatePhaseDays(index, text)}
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                        <Text style={[styles.durationUnit, { color: Colors.secondaryText }]}>
                          days
                        </Text>
                      </View>

                      {/* Dates (if calculated) */}
                      {phase.startDate && phase.endDate && (
                        <Text style={[styles.phaseDatesText, { color: Colors.secondaryText }]}>
                          {new Date(phase.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' → '}
                          {new Date(phase.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      )}

                      {/* Tasks Section */}
                      <TouchableOpacity
                        style={[styles.tasksToggle, { borderTopColor: Colors.border }]}
                        onPress={() => setExpandedPhaseIndex(expandedPhaseIndex === index ? null : index)}
                      >
                        <Ionicons
                          name="list-outline"
                          size={16}
                          color={Colors.primaryBlue}
                        />
                        <Text style={[styles.tasksToggleText, { color: Colors.primaryBlue }]}>
                          {phase.tasks && phase.tasks.length > 0
                            ? `${phase.tasks.length} task${phase.tasks.length !== 1 ? 's' : ''}`
                            : 'Add tasks'}
                        </Text>
                        <Ionicons
                          name={expandedPhaseIndex === index ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={Colors.primaryBlue}
                        />
                      </TouchableOpacity>

                      {/* Expanded Tasks List */}
                      {expandedPhaseIndex === index && (
                        <View style={styles.tasksContainer}>
                          {/* Existing Tasks */}
                          {phase.tasks && phase.tasks.length > 0 && (
                            <View style={styles.tasksList}>
                              {phase.tasks.map((task, taskIdx) => (
                                <View
                                  key={task.id}
                                  style={[styles.taskItem, { borderColor: Colors.border }]}
                                >
                                  <Text style={[styles.taskNumber, { color: Colors.secondaryText }]}>
                                    {taskIdx + 1}.
                                  </Text>
                                  <Text style={[styles.taskDescription, { color: Colors.primaryText }]}>
                                    {task.description}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => handleRemoveTask(index, task.id)}
                                    style={styles.taskRemoveButton}
                                  >
                                    <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Add Task Input */}
                          <View style={styles.taskInputContainer}>
                            <TextInput
                              style={[
                                styles.taskInput,
                                {
                                  backgroundColor: Colors.background,
                                  borderColor: Colors.border,
                                  color: Colors.primaryText,
                                },
                              ]}
                              placeholder="Add tasks (comma or line separated)"
                              placeholderTextColor={Colors.secondaryText}
                              value={taskInputs[index] || ''}
                              onChangeText={(text) => setTaskInputs({ ...taskInputs, [index]: text })}
                              multiline
                              numberOfLines={2}
                            />
                            <TouchableOpacity
                              style={[styles.taskAddButton, { backgroundColor: Colors.primaryBlue }]}
                              onPress={() => handleAddTask(index)}
                            >
                              <Ionicons name="add" size={18} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* Remove Button */}
                    <TouchableOpacity
                      onPress={() => handleRemovePhase(index)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close-circle" size={24} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Save Button */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.saveBottomButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleSave}
          >
            <Text style={styles.saveBottomText}>
              Save {selectedPhases.length} Phase{selectedPhases.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
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
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  saveButton: {
    padding: Spacing.xs,
  },
  saveText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  phaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  phaseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.xs,
  },
  phaseChipText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSizes.small,
  },
  serviceScroll: {
    marginBottom: Spacing.md,
  },
  serviceChipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.xs,
  },
  serviceChipText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  noDataText: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    fontStyle: 'italic',
  },
  addCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addCustomText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  customInputContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  customInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  selectedPhasesList: {
    gap: Spacing.md,
  },
  selectedPhaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  reorderButtons: {
    marginRight: Spacing.sm,
  },
  reorderButton: {
    padding: 2,
  },
  phaseItemContent: {
    flex: 1,
  },
  phaseItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  phaseNumber: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginRight: Spacing.xs,
  },
  phaseItemName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flex: 1,
  },
  durationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  durationLabel: {
    fontSize: FontSizes.small,
    marginRight: Spacing.sm,
  },
  durationField: {
    width: 60,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: FontSizes.small,
    textAlign: 'center',
  },
  durationUnit: {
    fontSize: FontSizes.small,
    marginLeft: Spacing.xs,
  },
  phaseDatesText: {
    fontSize: FontSizes.tiny,
  },
  removeButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  tasksToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
  },
  tasksToggleText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  tasksContainer: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  tasksList: {
    gap: Spacing.xs,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  taskNumber: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    minWidth: 20,
  },
  taskDescription: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  taskRemoveButton: {
    padding: 2,
  },
  taskInputContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  taskInput: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: FontSizes.small,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  taskAddButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  bottomSection: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  saveBottomButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  saveBottomText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
