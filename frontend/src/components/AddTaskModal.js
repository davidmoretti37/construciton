import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjectsBasic } from '../utils/storage';

export default function AddTaskModal({
  visible,
  onClose,
  onSave,
  initialDate,
  projects: providedProjects,
  editingTask,
}) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const inputRef = useRef(null);

  // For editing single task
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // For creating multiple tasks (checklist mode)
  const [taskList, setTaskList] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [selectedProject, setSelectedProject] = useState(null);
  const [startDate, setStartDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [projects, setProjects] = useState(providedProjects || []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // Load projects if not provided
  useEffect(() => {
    if (!providedProjects && visible) {
      loadProjects();
    }
  }, [visible, providedProjects]);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      if (editingTask) {
        // Edit mode - single task
        setTitle(editingTask.title || '');
        setDescription(editingTask.description || '');
        setSelectedProject(editingTask.projects || null);
        setStartDate(editingTask.start_date || initialDate);
        setEndDate(editingTask.end_date || initialDate);
        setTaskList([]);
      } else {
        // Create mode - checklist
        setTitle('');
        setDescription('');
        setNewTaskTitle('');
        setTaskList([]);
        setSelectedProject(null);
        setStartDate(initialDate || new Date().toISOString().split('T')[0]);
        setEndDate(initialDate || new Date().toISOString().split('T')[0]);
      }
    }
  }, [visible, editingTask, initialDate]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchProjectsBasic();
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTaskToList = () => {
    if (!newTaskTitle.trim()) return;

    setTaskList(prev => [...prev, {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
    }]);
    setNewTaskTitle('');

    // Focus back on input for quick entry
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const removeTaskFromList = (taskId) => {
    setTaskList(prev => prev.filter(t => t.id !== taskId));
  };

  const handleSave = async () => {
    // Validation
    if (!selectedProject) {
      Alert.alert(t('alerts.error'), t('alerts.required'));
      return;
    }

    if (editingTask) {
      // Edit mode - save single task
      if (!title.trim()) {
        Alert.alert(t('alerts.error'), t('messages.enterTaskDescription'));
        return;
      }

      setSaving(true);
      try {
        await onSave({
          id: editingTask.id,
          title: title.trim(),
          description: description.trim() || null,
          projectId: selectedProject.id,
          startDate,
          endDate,
        });
        onClose();
      } catch (error) {
        console.error('Error saving task:', error);
        Alert.alert(t('alerts.error'), t('messages.failedToSave'));
      } finally {
        setSaving(false);
      }
    } else {
      // Create mode - save all tasks in list
      if (taskList.length === 0) {
        Alert.alert(t('alerts.error'), t('messages.selectAtLeastOneTask'));
        return;
      }

      setSaving(true);
      try {
        // Save each task
        for (const task of taskList) {
          await onSave({
            title: task.title,
            description: null,
            projectId: selectedProject.id,
            startDate,
            endDate,
          });
        }
        onClose();
      } catch (error) {
        console.error('Error saving tasks:', error);
        Alert.alert(t('alerts.error'), t('messages.failedToSave'));
      } finally {
        setSaving(false);
      }
    }
  };

  const formatDateDisplay = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const adjustDate = (dateString, days) => {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  const isEditMode = !!editingTask;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.cancelText, { color: Colors.primaryBlue }]}>{t('buttons.cancel')}</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
              {isEditMode ? t('labels.editTask') : t('labels.addTasks')}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
              ) : (
                <Text style={[styles.saveText, { color: Colors.primaryBlue }]}>
                  {isEditMode ? t('buttons.save') : `${t('buttons.save')}${taskList.length > 0 ? ` (${taskList.length})` : ''}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Project Selection - First */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Project *</Text>
              <TouchableOpacity
                style={[styles.selector, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowProjectPicker(!showProjectPicker)}
              >
                <Text style={[styles.selectorText, { color: selectedProject ? Colors.primaryText : Colors.secondaryText }]}>
                  {selectedProject ? selectedProject.name : 'Select a project'}
                </Text>
                <Ionicons name={showProjectPicker ? "chevron-up" : "chevron-down"} size={20} color={Colors.secondaryText} />
              </TouchableOpacity>

              {showProjectPicker && (
                <View style={[styles.pickerList, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.primaryBlue} style={{ padding: 20 }} />
                  ) : projects.length === 0 ? (
                    <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No projects available</Text>
                  ) : (
                    <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                      {projects.map((project) => (
                        <TouchableOpacity
                          key={project.id}
                          style={[
                            styles.pickerItem,
                            { borderBottomColor: Colors.border },
                            selectedProject?.id === project.id && { backgroundColor: Colors.primaryBlue + '15' }
                          ]}
                          onPress={() => {
                            setSelectedProject(project);
                            setShowProjectPicker(false);
                          }}
                        >
                          <Text style={[styles.pickerItemText, { color: Colors.primaryText }]}>{project.name}</Text>
                          {selectedProject?.id === project.id && (
                            <Ionicons name="checkmark" size={20} color={Colors.primaryBlue} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>

            {/* Date Range */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Dates</Text>
              <View style={styles.dateRow}>
                {/* Start Date */}
                <View style={styles.dateColumn}>
                  <Text style={[styles.dateLabel, { color: Colors.secondaryText }]}>Start</Text>
                  <View style={[styles.dateSelector, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                    <TouchableOpacity onPress={() => setStartDate(adjustDate(startDate, -1))} style={styles.dateArrow}>
                      <Ionicons name="chevron-back" size={18} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                    <Text style={[styles.dateText, { color: Colors.primaryText }]}>{formatDateDisplay(startDate)}</Text>
                    <TouchableOpacity onPress={() => setStartDate(adjustDate(startDate, 1))} style={styles.dateArrow}>
                      <Ionicons name="chevron-forward" size={18} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* End Date */}
                <View style={styles.dateColumn}>
                  <Text style={[styles.dateLabel, { color: Colors.secondaryText }]}>End (Deadline)</Text>
                  <View style={[styles.dateSelector, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                    <TouchableOpacity onPress={() => {
                      const newEnd = adjustDate(endDate, -1);
                      if (newEnd >= startDate) setEndDate(newEnd);
                    }} style={styles.dateArrow}>
                      <Ionicons name="chevron-back" size={18} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                    <Text style={[styles.dateText, { color: Colors.primaryText }]}>{formatDateDisplay(endDate)}</Text>
                    <TouchableOpacity onPress={() => setEndDate(adjustDate(endDate, 1))} style={styles.dateArrow}>
                      <Ionicons name="chevron-forward" size={18} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {startDate !== endDate && (
                <View style={[styles.multiDayBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.primaryBlue} />
                  <Text style={[styles.multiDayText, { color: Colors.primaryBlue }]}>
                    Multi-day task ({Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1} days)
                  </Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: Colors.border }]} />

            {isEditMode ? (
              /* Edit Mode - Single Task Form */
              <>
                <View style={styles.section}>
                  <Text style={[styles.label, { color: Colors.secondaryText }]}>Task Title *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: Colors.border }]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="What needs to be done?"
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>

                <View style={styles.section}>
                  <Text style={[styles.label, { color: Colors.secondaryText }]}>Description</Text>
                  <TextInput
                    style={[styles.textArea, { backgroundColor: Colors.white, color: Colors.primaryText, borderColor: Colors.border }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Add more details (optional)"
                    placeholderTextColor={Colors.secondaryText}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </>
            ) : (
              /* Create Mode - Checklist */
              <View style={styles.section}>
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Tasks</Text>

                {/* Task List */}
                {taskList.length > 0 && (
                  <View style={[styles.taskListContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                    {taskList.map((task, index) => (
                      <View
                        key={task.id}
                        style={[
                          styles.taskListItem,
                          { borderBottomColor: Colors.border },
                          index === taskList.length - 1 && { borderBottomWidth: 0 }
                        ]}
                      >
                        <View style={styles.taskListItemLeft}>
                          <Ionicons name="checkbox-outline" size={20} color={Colors.primaryBlue} />
                          <Text style={[styles.taskListItemText, { color: Colors.primaryText }]}>{task.title}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => removeTaskFromList(task.id)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={22} color={Colors.errorRed} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Add Task Input */}
                <View style={[styles.addTaskRow, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                  <Ionicons name="add-circle-outline" size={22} color={Colors.primaryBlue} style={styles.addIcon} />
                  <TextInput
                    ref={inputRef}
                    style={[styles.addTaskInput, { color: Colors.primaryText }]}
                    value={newTaskTitle}
                    onChangeText={setNewTaskTitle}
                    placeholder="Add a task..."
                    placeholderTextColor={Colors.secondaryText}
                    onSubmitEditing={addTaskToList}
                    returnKeyType="done"
                  />
                  {newTaskTitle.trim() && (
                    <TouchableOpacity onPress={addTaskToList} style={styles.addButton}>
                      <Ionicons name="arrow-up-circle" size={28} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[styles.hint, { color: Colors.secondaryText }]}>
                  Press return or tap the arrow to add each task
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  selectorText: {
    fontSize: 16,
  },
  pickerList: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    maxHeight: 200,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 16,
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateColumn: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  dateArrow: {
    padding: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  multiDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  multiDayText: {
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  // Checklist styles
  taskListContainer: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  taskListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  taskListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  taskListItemText: {
    fontSize: 16,
    flex: 1,
  },
  addTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  addIcon: {
    marginRight: 8,
  },
  addTaskInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  addButton: {
    padding: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
