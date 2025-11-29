import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWorkerAssignments,
  fetchProjectPhases,
  fetchProjects,
  saveDailyReport,
  uploadPhoto,
  calculateActualProgress,
  calculateVelocity,
  calculateEstimatedCompletion,
  getCurrentUserId
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';

export default function DailyReportFormScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { user } = useAuth();

  // Check if owner mode from route params
  const isOwner = route.params?.isOwner === true;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [completedTaskIds, setCompletedTaskIds] = useState([]);
  const [taskProgress, setTaskProgress] = useState({});
  const [workDone, setWorkDone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOwner) {
      loadOwnerProjects();
    } else {
      loadWorkerProjects();
    }
  }, [isOwner]);

  const loadOwnerProjects = async () => {
    try {
      setLoading(true);
      const projects = await fetchProjects();
      setAssignedProjects(projects || []);
    } catch (error) {
      console.error('Error loading owner projects:', error);
      Alert.alert('Error', 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkerProjects = async () => {
    try {
      setLoading(true);

      const currentUserId = await getCurrentUserId();
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', currentUserId)
        .single();

      if (workerError || !workerData) {
        console.error('Error fetching worker:', workerError);
        Alert.alert('Error', 'Could not find worker profile');
        setLoading(false);
        return;
      }

      setWorkerId(workerData.id);
      const assignments = await getWorkerAssignments(workerData.id);
      const projects = assignments.projects?.filter(Boolean) || [];
      setAssignedProjects(projects);
    } catch (error) {
      console.error('Error loading worker projects:', error);
      Alert.alert('Error', 'Failed to load assigned projects');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = async (project) => {
    setSelectedProject(project);
    setSelectedPhase(null);
    setCompletedTaskIds([]);

    try {
      const projectPhases = await fetchProjectPhases(project.id);
      setPhases(projectPhases || []);
    } catch (error) {
      console.error('Error loading phases:', error);
      Alert.alert('Error', 'Failed to load project phases');
    }
  };

  const handlePhaseSelect = (phase) => {
    setSelectedPhase(phase);
    setCompletedTaskIds([]);

    // Initialize task progress from saved values
    const initialProgress = {};
    const tasks = phase.tasks || [];
    tasks.forEach(task => {
      if (task.progress !== undefined && task.progress !== null) {
        initialProgress[task.id] = task.progress;
      }
    });
    setTaskProgress(initialProgress);
  };

  const handleTaskToggle = (taskId) => {
    setCompletedTaskIds(prev => {
      const isCompleting = !prev.includes(taskId);

      if (isCompleting) {
        setTaskProgress(prevProgress => ({
          ...prevProgress,
          [taskId]: 100
        }));
        return [...prev, taskId];
      } else {
        return prev.filter(id => id !== taskId);
      }
    });
  };

  const handleSetTaskProgress = (taskId, value) => {
    setTaskProgress(prev => ({
      ...prev,
      [taskId]: value
    }));

    if (value === 100) {
      setCompletedTaskIds(prev => {
        if (!prev.includes(taskId)) {
          return [...prev, taskId];
        }
        return prev;
      });
    } else {
      setCompletedTaskIds(prev => prev.filter(id => id !== taskId));
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled) {
        setPhotos(prev => [...prev, ...result.assets.map(asset => asset.uri)]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled) {
        setPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedProject) {
      Alert.alert('Missing Information', 'Please select a project');
      return;
    }

    if (!selectedPhase) {
      Alert.alert('Missing Information', 'Please select a phase');
      return;
    }

    // Work done is mandatory
    if (!workDone.trim()) {
      Alert.alert('Required', 'Please describe what was done today');
      return;
    }

    try {
      setSubmitting(true);

      // Upload photos first
      const uploadedPhotoUrls = [];
      for (const photoUri of photos) {
        const url = await uploadPhoto(photoUri, selectedProject.id);
        if (url) {
          uploadedPhotoUrls.push(url);
        }
      }

      // If user added photos but none uploaded successfully, abort
      if (photos.length > 0 && uploadedPhotoUrls.length === 0) {
        Alert.alert('Upload Failed', 'Failed to upload photos. Please try again.');
        setSubmitting(false);
        return;
      }

      // Warn if some photos failed but continue if at least one succeeded
      if (photos.length > 0 && uploadedPhotoUrls.length < photos.length) {
        console.warn(`Only ${uploadedPhotoUrls.length} of ${photos.length} photos uploaded successfully`);
      }

      const report = await saveDailyReport(
        workerId,
        selectedProject.id,
        selectedPhase.id,
        uploadedPhotoUrls,
        completedTaskIds,
        [],  // customTasks - no longer used
        notes.trim(),
        taskProgress,
        isOwner,
        [workDone.trim()]  // tags - now stores the work description
      );

      if (report) {
        await calculateActualProgress(selectedProject.id);
        await calculateVelocity(selectedProject.id);
        await calculateEstimatedCompletion(selectedProject.id);

        Alert.alert(
          'Success',
          'Daily report submitted successfully!',
          [
            {
              text: 'OK',
              onPress: () => {
                // Navigate back to the reports list
                navigation.goBack();
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to submit daily report');
      }
    } catch (error) {
      console.error('Error submitting daily report:', error);
      Alert.alert('Error', 'Failed to submit daily report');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
        <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
          Loading projects...
        </Text>
      </View>
    );
  }

  const phaseTasks = selectedPhase?.tasks || [];
  const incompleteTasks = phaseTasks.filter(task => !task.completed);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>New Daily Report</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Project Selection */}
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>1. Select Project</Text>
            {assignedProjects.length === 0 ? (
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                No assigned projects
              </Text>
            ) : (
              <View style={styles.projectList}>
                {assignedProjects.map((project) => (
                  <TouchableOpacity
                    key={project.id}
                    style={[
                      styles.projectItem,
                      {
                        backgroundColor: selectedProject?.id === project.id ? Colors.primaryBlue + '15' : Colors.lightBackground,
                        borderColor: selectedProject?.id === project.id ? Colors.primaryBlue : Colors.border
                      }
                    ]}
                    onPress={() => handleProjectSelect(project)}
                  >
                    <View style={styles.projectItemContent}>
                      <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                        {project.name}
                      </Text>
                      {project.location && (
                        <Text style={[styles.projectClient, { color: Colors.secondaryText }]}>
                          {project.location}
                        </Text>
                      )}
                    </View>
                    {selectedProject?.id === project.id && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.primaryBlue} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Phase Selection */}
          {selectedProject && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>2. Select Phase</Text>
              {phases.length === 0 ? (
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No phases for this project
                </Text>
              ) : (
                <View style={styles.phaseList}>
                  {phases.map((phase) => (
                    <TouchableOpacity
                      key={phase.id}
                      style={[
                        styles.phaseItem,
                        {
                          backgroundColor: selectedPhase?.id === phase.id ? Colors.primaryBlue + '15' : Colors.lightBackground,
                          borderColor: selectedPhase?.id === phase.id ? Colors.primaryBlue : Colors.border
                        }
                      ]}
                      onPress={() => handlePhaseSelect(phase)}
                    >
                      <View style={styles.phaseItemContent}>
                        <Text style={[styles.phaseName, { color: Colors.primaryText }]}>
                          {phase.name}
                        </Text>
                        <Text style={[styles.phaseProgress, { color: Colors.secondaryText }]}>
                          {phase.completion_percentage || 0}% complete
                        </Text>
                      </View>
                      {selectedPhase?.id === phase.id && (
                        <Ionicons name="checkmark-circle" size={24} color={Colors.primaryBlue} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Photos Section */}
          {selectedPhase && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>3. Add Photos (Optional)</Text>
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={[styles.photoButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={handleTakePhoto}
                >
                  <Ionicons name="camera" size={20} color="#fff" />
                  <Text style={styles.photoButtonText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.photoButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={handlePickImage}
                >
                  <Ionicons name="images" size={20} color="#fff" />
                  <Text style={styles.photoButtonText}>Choose Photos</Text>
                </TouchableOpacity>
              </View>
              {photos.length > 0 && (
                <View style={styles.photoGrid}>
                  {photos.map((photoUri, index) => (
                    <View key={index} style={styles.photoContainer}>
                      <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => handleRemovePhoto(index)}
                      >
                        <Ionicons name="close-circle" size={24} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* What was done today - MANDATORY */}
          {selectedPhase && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                What was done today *
              </Text>
              <TextInput
                style={[
                  styles.workDoneInput,
                  { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }
                ]}
                value={workDone}
                onChangeText={setWorkDone}
                placeholder="e.g., Framing, Pool cleaning, Electrical work..."
                placeholderTextColor={Colors.secondaryText}
                maxLength={150}
              />
            </View>
          )}

          {/* Tasks Completed */}
          {selectedPhase && incompleteTasks.length > 0 && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                4. Tasks Completed Today
              </Text>
              <View style={styles.taskList}>
                {incompleteTasks.map((task) => {
                  const progress = taskProgress[task.id] || 0;
                  const isCompleted = completedTaskIds.includes(task.id);

                  return (
                    <View key={task.id} style={styles.taskItemContainer}>
                      <TouchableOpacity
                        style={styles.taskItem}
                        onPress={() => handleTaskToggle(task.id)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: isCompleted ? Colors.success : Colors.border,
                              backgroundColor: isCompleted ? Colors.success : 'transparent'
                            }
                          ]}
                        >
                          {isCompleted && (
                            <Ionicons name="checkmark" size={18} color="#fff" />
                          )}
                        </View>
                        <Text style={[styles.taskText, { color: Colors.primaryText }]}>
                          {task.description || task.name}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.progressSliderContainer}>
                        <Text style={[styles.progressLabel, { color: Colors.secondaryText }]}>
                          Progress: {progress}%
                        </Text>
                        <Slider
                          style={styles.slider}
                          minimumValue={0}
                          maximumValue={100}
                          step={5}
                          value={progress}
                          onValueChange={(value) => handleSetTaskProgress(task.id, value)}
                          minimumTrackTintColor={Colors.primaryBlue}
                          maximumTrackTintColor={Colors.border}
                          thumbTintColor={Colors.primaryBlue}
                        />
                        <View style={styles.quickSetButtons}>
                          {[25, 50, 75, 100].map((value) => (
                            <TouchableOpacity
                              key={value}
                              style={[
                                styles.quickSetButton,
                                {
                                  backgroundColor: progress === value ? Colors.primaryBlue : Colors.lightBackground,
                                  borderColor: Colors.border
                                }
                              ]}
                              onPress={() => handleSetTaskProgress(task.id, value)}
                            >
                              <Text
                                style={[
                                  styles.quickSetButtonText,
                                  { color: progress === value ? '#fff' : Colors.secondaryText }
                                ]}
                              >
                                {value}%
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Notes */}
          {selectedPhase && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                5. Notes (Optional)
              </Text>
              <TextInput
                style={[
                  styles.notesInput,
                  { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional notes about today's work..."
                placeholderTextColor={Colors.secondaryText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* Submit Button */}
          {selectedPhase && (
            <View style={styles.submitSection}>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: submitting ? Colors.lightGray : Colors.primaryBlue }
                ]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.submitButtonText}>Submit Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  section: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
  projectList: {
    gap: Spacing.sm,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  projectItemContent: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  projectClient: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  phaseList: {
    gap: Spacing.sm,
  },
  phaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  phaseItemContent: {
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  phaseProgress: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  photoActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  photoButtonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoContainer: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  taskList: {
    gap: Spacing.sm,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskText: {
    flex: 1,
    fontSize: FontSizes.body,
  },
  taskItemContainer: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  progressSliderContainer: {
    marginTop: Spacing.sm,
    paddingLeft: 36,
  },
  progressLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  quickSetButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  quickSetButton: {
    flex: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSetButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  customTaskInput: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  textInput: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTaskList: {
    gap: Spacing.sm,
  },
  customTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  customTaskText: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  workDoneInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
  },
  notesInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
    minHeight: 100,
  },
  submitSection: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.sm,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tagButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  tagButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
});
