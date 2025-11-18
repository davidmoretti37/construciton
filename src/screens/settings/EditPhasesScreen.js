import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile, saveUserProfile } from '../../utils/storage';

export default function EditPhasesScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phases, setPhases] = useState([
    {
      id: '1',
      name: 'Rough',
      typical_days: '14',
      tasks: ['Framing', 'Electrical rough-in', 'Plumbing rough-in'],
      typical_budget_percentage: '40',
    },
    {
      id: '2',
      name: 'Finish',
      typical_days: '10',
      tasks: ['Drywall', 'Paint', 'Fixtures'],
      typical_budget_percentage: '60',
    },
  ]);

  useEffect(() => {
    loadPhases();
  }, []);

  const loadPhases = async () => {
    try {
      const profile = await getUserProfile();
      if (profile.phasesTemplate?.phases && profile.phasesTemplate.phases.length > 0) {
        // Convert to edit format
        const editPhases = profile.phasesTemplate.phases.map((p, idx) => ({
          id: idx.toString(),
          name: p.name,
          typical_days: p.typical_days?.toString() || '7',
          tasks: p.tasks || [],
          typical_budget_percentage: p.typical_budget_percentage?.toString() || '',
        }));
        setPhases(editPhases);
      }
    } catch (error) {
      console.error('Error loading phases:', error);
    } finally {
      setLoading(false);
    }
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
      Alert.alert('Cannot Remove', 'You need at least one phase');
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

  const handleSave = async () => {
    const validPhases = phases.filter((p) => p.name.trim() !== '');

    if (validPhases.length === 0) {
      Alert.alert('Required', 'Please add at least one phase with a name');
      return;
    }

    const cleanedPhases = validPhases.map((p) => ({
      name: p.name.trim(),
      typical_days: parseInt(p.typical_days) || 7,
      tasks: p.tasks.filter((t) => t.trim() !== ''),
      typical_budget_percentage: parseFloat(p.typical_budget_percentage) || 0,
    }));

    try {
      setSaving(true);
      const profile = await getUserProfile();
      profile.phasesTemplate = { phases: cleanedPhases };
      await saveUserProfile(profile);

      Alert.alert('Success', 'Your project phases have been updated!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error saving phases:', error);
      Alert.alert('Error', 'Failed to save phases. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Edit Project Phases</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.description, { color: Colors.secondaryText }]}>
          Define your typical project workflow. These phases will be used by AI to create intelligent estimates.
        </Text>

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

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Save Button */}
      <View style={[
        styles.footer,
        {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          paddingBottom: Math.max(insets.bottom + 20, 36),
        }
      ]}>
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.saveText}>Save Changes</Text>
              <Ionicons name="checkmark" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
