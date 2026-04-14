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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile, saveUserProfile, markFeatureUpdateComplete } from '../../utils/storage';

export default function PhaseTemplateSetupScreen({ navigation, route, onComplete, isUpdate = false }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');

  const selectedServices = route?.params?.selectedServices || [];

  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initialize phases from selected services
  useEffect(() => {
    initializePhases();
  }, []);

  const initializePhases = () => {
    if (selectedServices.length === 0) {
      // Fallback to default phases if no services
      setPhases([
        {
          id: '1',
          name: 'Planning',
          typical_days: '7',
          tasks: ['Initial consultation', 'Create plan', 'Get approvals'],
          typical_budget_percentage: '20',
        },
        {
          id: '2',
          name: 'Execution',
          typical_days: '14',
          tasks: ['Perform service', 'Quality checks'],
          typical_budget_percentage: '80',
        },
      ]);
      setLoading(false);
      return;
    }

    // Combine phases from all selected services (deduplicate by name)
    const allPhases = [];
    const seenPhaseNames = new Set();

    selectedServices.forEach(service => {
      if (service.phases && service.phases.length > 0) {
        service.phases.forEach(phase => {
          const phaseName = phase.phase_name || phase.name;
          if (!seenPhaseNames.has(phaseName)) {
            allPhases.push({
              id: phase.id || Date.now().toString() + Math.random(),
              name: phaseName,
              typical_days: (phase.default_days || phase.defaultDays || 7).toString(),
              tasks: Array.isArray(phase.tasks) ? phase.tasks : (phase.defaultTasks || []),
              typical_budget_percentage: '',
            });
            seenPhaseNames.add(phaseName);
          }
        });
      }
    });

    // If we got phases from services, use them
    if (allPhases.length > 0) {
      setPhases(allPhases);
    } else {
      // Fallback if services don't have phases yet
      setPhases([
        {
          id: '1',
          name: 'Preparation',
          typical_days: '5',
          tasks: ['Assess requirements', 'Prepare materials', 'Schedule work'],
          typical_budget_percentage: '30',
        },
        {
          id: '2',
          name: 'Service Delivery',
          typical_days: '10',
          tasks: ['Perform work', 'Quality checks', 'Client updates'],
          typical_budget_percentage: '70',
        },
      ]);
    }

    setLoading(false);
  };

  const addPhase = () => {
    const newPhase = {
      id: Date.now().toString(),
      name: '',
      typical_days: '7',
      tasks: [''],
      typical_budget_percentage: '',
    };
    setPhases([...phases, newPhase]);
  };

  const removePhase = (id) => {
    if (phases.length === 1) {
      Alert.alert(t('alerts.cannotRemove'), t('messages.atLeastOne'));
      return;
    }
    setPhases(phases.filter((p) => p.id !== id));
  };

  const updatePhase = (id, field, value) => {
    setPhases(
      phases.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const addTask = (phaseId) => {
    setPhases(
      phases.map((p) =>
        p.id === phaseId ? { ...p, tasks: [...p.tasks, ''] } : p
      )
    );
  };

  const updateTask = (phaseId, taskIndex, value) => {
    setPhases(
      phases.map((p) =>
        p.id === phaseId
          ? {
              ...p,
              tasks: p.tasks.map((t, i) => (i === taskIndex ? value : t)),
            }
          : p
      )
    );
  };

  const removeTask = (phaseId, taskIndex) => {
    setPhases(
      phases.map((p) =>
        p.id === phaseId
          ? { ...p, tasks: p.tasks.filter((_, i) => i !== taskIndex) }
          : p
      )
    );
  };

  const handleContinue = async () => {
    const validPhases = phases.filter((p) => p.name.trim() !== '');

    if (validPhases.length === 0) {
      Alert.alert(t('alerts.required'), t('messages.atLeastOne'));
      return;
    }

    const cleanedPhases = validPhases.map((p) => ({
      name: p.name.trim(),
      typical_days: parseInt(p.typical_days) || 7,
      tasks: p.tasks.filter((t) => t.trim() !== ''),
      typical_budget_percentage: parseFloat(p.typical_budget_percentage) || 0,
    }));

    const phasesTemplate = { phases: cleanedPhases };

    if (isUpdate) {
      try {
        const profile = await getUserProfile();
        profile.phasesTemplate = phasesTemplate;
        await saveUserProfile(profile);
        await markFeatureUpdateComplete();

        if (onComplete) {
          onComplete();
        }
      } catch (error) {
        console.error('Error saving phases template:', error);
        Alert.alert(t('alerts.error'), t('messages.failedToSave'));
      }
    } else {
      navigation.navigate('BusinessInfo', {
        selectedServices: selectedServices, // Pass selected services
        selectedTrades: route?.params?.selectedTrades,
        phasesTemplate,
      });
    }
  };

  const handleSkip = async () => {
    if (isUpdate) {
      await markFeatureUpdateComplete();
      if (onComplete) {
        onComplete();
      }
    } else {
      navigation.navigate('BusinessInfo', {
        selectedServices: selectedServices, // Pass selected services
        selectedTrades: route?.params?.selectedTrades,
        phasesTemplate: phases,
      });
    }
  };

  // Show loading while initializing phases
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.loadingContainer]}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
            Preparing your workflow phases...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.background }]}>
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          {isUpdate ? '🎉 New Feature!' : 'Workflow Phases'}
        </Text>
        <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
          {isUpdate
            ? 'Set up your typical workflow to create estimates faster with AI'
            : 'Review and customize your workflow phases'}
        </Text>
        {selectedServices.length > 0 && (
          <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
            Based on: {selectedServices.map(s => s.name).join(', ')}
          </Text>
        )}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {phases.map((phase, index) => (
          <View key={phase.id} style={[styles.phaseCard, { backgroundColor: Colors.white }]}>
            {/* Card Header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <View style={[styles.phaseNumber, { backgroundColor: Colors.primaryBlue }]}>
                  <Text style={styles.phaseNumberText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={[styles.phaseNameInput, { color: Colors.primaryText }]}
                  value={phase.name}
                  onChangeText={(value) => updatePhase(phase.id, 'name', value)}
                  placeholder="Phase Name"
                  placeholderTextColor={Colors.secondaryText}
                />
              </View>
              {phases.length > 1 && (
                <TouchableOpacity
                  onPress={() => removePhase(phase.id)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>

            {/* Duration and Budget Row */}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={18} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.metaInput, { color: Colors.primaryText }]}
                  value={phase.typical_days}
                  onChangeText={(value) => updatePhase(phase.id, 'typical_days', value)}
                  placeholder="14"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="number-pad"
                />
                <Text style={[styles.metaLabel, { color: Colors.secondaryText }]}>days</Text>
              </View>

              <View style={styles.metaItem}>
                <Ionicons name="pricetag-outline" size={18} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.metaInput, { color: Colors.primaryText }]}
                  value={phase.typical_budget_percentage}
                  onChangeText={(value) => updatePhase(phase.id, 'typical_budget_percentage', value)}
                  placeholder="40"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                />
                <Text style={[styles.metaLabel, { color: Colors.secondaryText }]}>% budget</Text>
              </View>
            </View>

            {/* Tasks Section */}
            <View style={styles.tasksSection}>
              <View style={styles.tasksSectionHeader}>
                <Text style={[styles.tasksLabel, { color: Colors.secondaryText }]}>
                  Common Tasks
                </Text>
                <TouchableOpacity
                  onPress={() => addTask(phase.id)}
                  style={styles.addTaskIconButton}
                >
                  <Ionicons name="add-circle" size={22} color={Colors.primaryBlue} />
                </TouchableOpacity>
              </View>

              {phase.tasks.map((task, taskIndex) => (
                <View key={taskIndex} style={styles.taskRow}>
                  <View style={[styles.taskDot, { backgroundColor: Colors.border }]} />
                  <TextInput
                    style={[styles.taskInput, { color: Colors.primaryText }]}
                    value={task}
                    onChangeText={(value) => updateTask(phase.id, taskIndex, value)}
                    placeholder={`Task ${taskIndex + 1}`}
                    placeholderTextColor={Colors.secondaryText}
                  />
                  {phase.tasks.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeTask(phase.id, taskIndex)}
                      style={styles.removeTaskButton}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Add Phase Button */}
        <TouchableOpacity
          style={[styles.addPhaseButton, { borderColor: Colors.primaryBlue }]}
          onPress={addPhase}
        >
          <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
          <Text style={[styles.addPhaseText, { color: Colors.primaryBlue }]}>
            Add Another Phase
          </Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
        >
          <Text style={[styles.skipText, { color: Colors.secondaryText }]}>
            Skip for Now
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
        >
          <Text style={styles.continueText}>Save & Continue</Text>
          <Ionicons name="checkmark" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  phaseCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  phaseNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  phaseNumberText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  phaseNameInput: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    paddingVertical: 4,
  },
  deleteButton: {
    padding: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  metaInput: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    padding: 0,
  },
  metaLabel: {
    fontSize: 14,
  },
  tasksSection: {
    gap: 8,
  },
  tasksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tasksLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addTaskIconButton: {
    padding: 4,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  removeTaskButton: {
    padding: 4,
  },
  addPhaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 8,
  },
  addPhaseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  helpText: {
    fontSize: 13,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
