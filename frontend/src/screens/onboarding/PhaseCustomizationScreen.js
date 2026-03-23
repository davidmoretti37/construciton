/**
 * Phase Customization Screen
 * Review and customize AI-generated phases for selected services
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ProgressStepBar from '../../components/onboarding/ProgressStepBar';

export default function PhaseCustomizationScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('onboarding');
  const { selectedServices: initialServices } = route.params || {};

  const [selectedServices, setSelectedServices] = useState(initialServices || []);
  const [activeService, setActiveService] = useState(selectedServices?.[0]?.id || null);
  const [editingPhase, setEditingPhase] = useState(null);
  const [showPhaseModal, setShowPhaseModal] = useState(false);

  const handleAddPhase = (insertAtIndex) => {
    const newPhase = {
      id: Date.now().toString(),
      name: '',
      description: '',
      defaultDays: 1,
      tasks: [],
      isNew: true,
      insertAt: insertAtIndex,
    };
    setEditingPhase(newPhase);
    setShowPhaseModal(true);
  };

  const handleEditPhase = (phase, index) => {
    setEditingPhase({ ...phase, index });
    setShowPhaseModal(true);
  };

  const handleSavePhase = (updatedPhase) => {
    const serviceIndex = selectedServices.findIndex(s => s.id === activeService);
    if (serviceIndex === -1) return;

    const updatedServices = [...selectedServices];
    const service = { ...updatedServices[serviceIndex] };

    if (!service.phases) service.phases = [];

    const phaseData = {
      name: updatedPhase.name,
      description: updatedPhase.description,
      defaultDays: updatedPhase.defaultDays,
      tasks: updatedPhase.tasks,
    };

    if (updatedPhase.index !== undefined) {
      // Update existing phase
      service.phases[updatedPhase.index] = phaseData;
    } else if (updatedPhase.insertAt !== undefined) {
      // Insert new phase at specific position
      service.phases.splice(updatedPhase.insertAt, 0, phaseData);
    } else {
      // Fallback: append to end
      service.phases.push(phaseData);
    }

    updatedServices[serviceIndex] = service;
    setSelectedServices(updatedServices);
    setShowPhaseModal(false);
    setEditingPhase(null);
  };

  const handleDeletePhase = (index) => {
    const serviceIndex = selectedServices.findIndex(s => s.id === activeService);
    if (serviceIndex === -1) return;

    Alert.alert(
      t('phaseCustomization.deletePhase'),
      t('phaseCustomization.deletePhaseConfirm'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            const updatedServices = [...selectedServices];
            const service = { ...updatedServices[serviceIndex] };
            service.phases = service.phases.filter((_, i) => i !== index);
            updatedServices[serviceIndex] = service;
            setSelectedServices(updatedServices);
          },
        },
      ]
    );
  };

  const handleContinue = () => {
    // Navigate to Pricing Setup
    navigation.navigate('PricingSetup', {
      selectedServices,
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Get current active service
  const currentService = selectedServices?.find(s => s.id === activeService);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#1F2937' }]}>{t('phaseCustomization.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: Colors.primaryText, paddingHorizontal: Spacing.xl }]}>
          {t('phaseCustomization.title')}
        </Text>
        <Text style={[styles.subtitle, { color: Colors.secondaryText, paddingHorizontal: Spacing.xl }]}>
          {t('phaseCustomization.subtitle')}
        </Text>

        {/* Service Tabs */}
        {selectedServices && selectedServices.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            {selectedServices.map(service => {
              const isActive = activeService === service.id;

              return (
                <TouchableOpacity
                  key={service.id}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: isActive ? Colors.primaryBlue : Colors.white,
                      borderColor: isActive ? Colors.primaryBlue : Colors.border,
                    },
                  ]}
                  onPress={() => setActiveService(service.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={service.icon || 'construct-outline'}
                    size={20}
                    color={isActive ? '#fff' : Colors.secondaryText}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: isActive ? '#fff' : Colors.primaryText },
                    ]}
                  >
                    {service.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Phases List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {currentService && currentService.phases && currentService.phases.length > 0 ? (
            currentService.phases.map((phase, index) => (
              <View key={index}>
                {/* Insert button before this phase */}
                <TouchableOpacity
                  style={[styles.insertPhaseButton, { borderColor: Colors.primaryBlue + '40' }]}
                  onPress={() => handleAddPhase(index)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.insertPhaseLine, { backgroundColor: Colors.primaryBlue + '30' }]} />
                  <View style={[styles.insertPhaseIcon, { backgroundColor: '#F8FAFC', borderColor: Colors.primaryBlue + '40' }]}>
                    <Ionicons name="add" size={14} color={Colors.primaryBlue} />
                  </View>
                  <View style={[styles.insertPhaseLine, { backgroundColor: Colors.primaryBlue + '30' }]} />
                </TouchableOpacity>

                {/* Phase Card */}
                <View
                  style={[
                    styles.phaseCard,
                    {
                      backgroundColor: '#FFFFFF',
                      borderColor: '#F1F5F9',
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
                          {phase.name || phase.phase_name || 'Unnamed Phase'}
                        </Text>
                        {phase.description && (
                          <Text style={[styles.phaseDescription, { color: Colors.secondaryText }]}>
                            {phase.description}
                          </Text>
                        )}
                        <Text style={[styles.phaseDays, { color: Colors.secondaryText }]}>
                          {t('phaseCustomization.days', { count: phase.defaultDays || phase.default_days || 1 })}
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
                    <View style={[styles.tasksContainer, { borderTopColor: Colors.border }]}>
                      <Text style={[styles.tasksTitle, { color: Colors.secondaryText }]}>
                        {t('phaseCustomization.tasks')}
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
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="git-network-outline" size={64} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                {t('phaseCustomization.noPhases')}
              </Text>
            </View>
          )}

          {/* Insert button after the last phase (or as the only button when empty) */}
          <TouchableOpacity
            style={[styles.addPhaseButton, { borderColor: Colors.primaryBlue }]}
            onPress={() => handleAddPhase(currentService?.phases?.length || 0)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
            <Text style={[styles.addPhaseText, { color: Colors.primaryBlue }]}>
              {t('phaseCustomization.addPhase')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Bottom Section */}
      <View style={[styles.bottomSection, { backgroundColor: '#F8FAFC' }]}>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>{t('phaseCustomization.continueToPricing')}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <ProgressStepBar currentStep={3} totalSteps={5} />
        </View>
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
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

// Phase Edit Modal Component
function PhaseEditModal({ phase, onSave, onCancel, Colors, t }) {
  const [name, setName] = useState(phase.name || '');
  const [description, setDescription] = useState(phase.description || '');
  const [days, setDays] = useState((phase.defaultDays || phase.default_days || 1).toString());
  const [tasks, setTasks] = useState(phase.tasks || []);
  const [newTask, setNewTask] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', t('phaseCustomization.modal.errors.enterName'));
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
        <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={onCancel}>
            <Ionicons name="close" size={28} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
            {phase.isNew ? t('phaseCustomization.modal.addPhase') : t('phaseCustomization.modal.editPhase')}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[styles.saveText, { color: Colors.primaryBlue }]}>{t('phaseCustomization.modal.save')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Phase Name */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>{t('phaseCustomization.modal.phaseName')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: '#E2E8F0' }]}
              value={name}
              onChangeText={setName}
              placeholder={t('phaseCustomization.modal.phaseNamePlaceholder')}
              placeholderTextColor={Colors.secondaryText}
            />
          </View>

          {/* Description */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>{t('phaseCustomization.modal.description')}</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: '#E2E8F0' }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('phaseCustomization.modal.descriptionPlaceholder')}
              placeholderTextColor={Colors.secondaryText}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Days */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>{t('phaseCustomization.modal.estimatedDays')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: '#E2E8F0' }]}
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={Colors.secondaryText}
            />
          </View>

          {/* Tasks */}
          <View style={styles.modalField}>
            <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>{t('phaseCustomization.modal.tasks')}</Text>

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
                placeholder={t('phaseCustomization.modal.addTaskPlaceholder')}
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
    paddingHorizontal: 20,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  tabsContainer: {
    maxHeight: 60,
  },
  tabsContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    gap: Spacing.sm,
  },
  tabText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  phaseCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
  },
  bottomSection: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  bottomFade: {
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: '#F8FAFC',
    opacity: 0.8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: 14,
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressText: {
    fontSize: FontSizes.small,
  },
  insertPhaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  insertPhaseLine: {
    flex: 1,
    height: 1,
  },
  insertPhaseIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: Spacing.sm,
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
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
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
