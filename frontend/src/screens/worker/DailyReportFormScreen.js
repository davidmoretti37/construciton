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
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWorkerAssignments,
  fetchProjects,
  saveDailyReport,
  uploadPhoto,
  getCurrentUserId
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';

export default function DailyReportFormScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { user, profile } = useAuth();

  // Check if owner mode from route params
  const isOwner = route.params?.isOwner === true;
  const isSupervisor = profile?.role === 'supervisor';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [workDone, setWorkDone] = useState('');

  useEffect(() => {
    if (isOwner) {
      loadOwnerProjects();
    } else if (isSupervisor) {
      loadSupervisorProjects();
    } else {
      loadWorkerProjects();
    }
  }, [isOwner, isSupervisor]);

  const loadOwnerProjects = async () => {
    try {
      setLoading(true);
      const projects = await fetchProjects();
      setAssignedProjects(projects || []);
    } catch (error) {
      console.error('Error loading owner projects:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'projects' }));
    } finally {
      setLoading(false);
    }
  };

  const loadSupervisorProjects = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();

      // Get projects assigned to supervisor OR created by supervisor
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .or(`assigned_supervisor_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssignedProjects(projects || []);
    } catch (error) {
      console.error('Error loading supervisor projects:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'projects' }));
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
        Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'worker profile' }));
        setLoading(false);
        return;
      }

      setWorkerId(workerData.id);
      const assignments = await getWorkerAssignments(workerData.id);
      const projects = assignments.projects?.filter(Boolean) || [];
      setAssignedProjects(projects);
    } catch (error) {
      console.error('Error loading worker projects:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'assigned projects' }));
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionRequired'), t('permissions.photoLibraryRequired'));
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
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'image' }));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionRequired'), t('permissions.cameraRequired'));
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
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'photo' }));
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedProject) {
      Alert.alert(t('alerts.missingInfo'), t('messages.pleaseSelect', { item: 'project' }));
      return;
    }

    // Work done is mandatory
    if (!workDone.trim()) {
      Alert.alert(t('alerts.required'), t('messages.pleaseEnter', { item: 'work description' }));
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
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'photos' }));
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
        null,  // phaseId - no longer used
        uploadedPhotoUrls,
        [],    // completedTaskIds - no longer used
        [],    // customTasks - no longer used
        '',    // notes - no longer used
        {},    // taskProgress - no longer used
        isOwner,
        [workDone.trim()]  // tags - stores the work description
      );

      if (report) {
        Alert.alert(
          t('alerts.success'),
          t('messages.savedSuccessfully', { item: 'daily report' }),
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'daily report' }));
      }
    } catch (error) {
      console.error('Error submitting daily report:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'daily report' }));
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

          {/* Photos Section - shown after project selection */}
          {selectedProject && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>2. Add Photos (Optional)</Text>
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

          {/* What was done today */}
          {selectedProject && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                3. What was done today *
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
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* Submit Button */}
          {selectedProject && (
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
  workDoneInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
    minHeight: 80,
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
});
