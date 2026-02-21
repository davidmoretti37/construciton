import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  ActionSheetIOS,
  TextInput,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjectPhases, getProjectWorkers, fetchProjectPhotosByPhase, updatePhaseProgress, fetchEstimatesByProjectId, getEstimate, getProjectTransactionSummary, fetchProjectDocuments, uploadProjectDocument, deleteProjectDocument, updateProjectWorkingDays, addNonWorkingDate, removeNonWorkingDate, safeParseDateToObject, safeParseDateToString, redistributeAllTasksWithAI, getCurrentUserId, redistributeTasksFromDayWithAI, restoreTasksToOriginalDay, moveTasksFromSpecificDate, restoreTasksToSpecificDate, calculateProjectProgressFromTasks, completeTask, uncompleteTask } from '../utils/storage';
import PhaseTimeline from './PhaseTimeline';
import WorkerAssignmentModal from './WorkerAssignmentModal';
import SupervisorAssignmentModal from './SupervisorAssignmentModal';
import WorkingDaysSelector from './WorkingDaysSelector';
import { useAuth } from '../contexts/AuthContext';
import BulkTaskShiftModal from './BulkTaskShiftModal';
import NonWorkingDatesManager from './NonWorkingDatesManager';
import FullscreenPhotoViewer from './FullscreenPhotoViewer';
import EstimatePreview from './ChatVisuals/EstimatePreview';
import { supabase } from '../lib/supabase';
import { DEMO_PHASES } from '../screens/ProjectsScreen';

export default function ProjectDetailView({ visible, project, onClose, onEdit, onAction, navigation, onDelete, asScreen = false, onRefreshNeeded, isDemo = false }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [modalVisible, setModalVisible] = useState(visible);
  const wasNavigatingRef = useRef(false);
  const [phases, setPhases] = useState([]);
  const [loadingPhases, setLoadingPhases] = useState(false);

  // Manual tasks (tasks added outside of phases)
  const [manualTasks, setManualTasks] = useState([]);
  const [loadingManualTasks, setLoadingManualTasks] = useState(false);

  // Calculated progress (from tasks, not from stale parent prop)
  const [calculatedProgress, setCalculatedProgress] = useState(0);

  // Main editing mode (controls all editing)
  const [isEditing, setIsEditing] = useState(false);

  // Contact info editing
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);

  // Timeline editing
  const [editStartDate, setEditStartDate] = useState(null);
  const [editEndDate, setEditEndDate] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Workers
  const [workers, setWorkers] = useState([]);
  const [showWorkerAssignment, setShowWorkerAssignment] = useState(false);

  // Supervisor assignment (for owners)
  const [showSupervisorAssignment, setShowSupervisorAssignment] = useState(false);
  const { profile } = useAuth() || {};
  const isOwner = profile?.role === 'owner';
  const isSupervisor = profile?.role === 'supervisor';
  const isOwnProject = project?.createdBy === profile?.id || project?.user_id === profile?.id;
  const canAssignToSupervisor = isOwner && isOwnProject && !isDemo;

  // Expanded phase for showing tasks
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);

  // Manual progress override
  // Note: Progress override removed - progress is now calculated from task completion in schedule

  // Phase progress editing
  const [isEditingPhases, setIsEditingPhases] = useState(false);
  const [phaseProgressValues, setPhaseProgressValues] = useState({});

  // Photos section
  const [photosByPhase, setPhotosByPhase] = useState({});
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoFilter, setSelectedPhotoFilter] = useState('all');
  const [visiblePhotosCount, setVisiblePhotosCount] = useState(12);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState([]);
  const [photoGalleryModalVisible, setPhotoGalleryModalVisible] = useState(false);

  // Estimates section
  const [projectEstimates, setProjectEstimates] = useState([]);
  const [loadingEstimates, setLoadingEstimates] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);

  // Calculated financial totals (from transactions)
  const [calculatedExpenses, setCalculatedExpenses] = useState(null);
  const [calculatedIncome, setCalculatedIncome] = useState(null);

  // Documents section
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentVisibilityModalVisible, setDocumentVisibilityModalVisible] = useState(false);
  const [pendingDocumentUpload, setPendingDocumentUpload] = useState(null);
  const [newDocumentVisibleToWorkers, setNewDocumentVisibleToWorkers] = useState(false);

  // Working days and task shifting
  const [showBulkShiftModal, setShowBulkShiftModal] = useState(false);
  const [editWorkingDays, setEditWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [nonWorkingDates, setNonWorkingDates] = useState([]);

  const screenWidth = Dimensions.get('window').width;

  // Load phases and workers when project changes
  // Skip all database fetches for demo projects
  useEffect(() => {
    const loadData = async () => {
      // Skip all database operations for demo projects - use mock data
      if (isDemo) {
        setPhases(DEMO_PHASES); // Show demo phases
        setWorkers([
          { id: 'demo-worker-1', name: 'John Smith', trade: 'Plumber' },
          { id: 'demo-worker-2', name: 'Maria Garcia', trade: 'Electrician' },
        ]);
        setManualTasks([]);
        setCalculatedProgress(50); // Demo progress
        setPhotosByPhase({});
        setTotalPhotos(0);
        setProjectEstimates([]);
        setCalculatedExpenses(8000); // Demo expenses
        setCalculatedIncome(12500); // Demo income
        setProjectDocuments([]);
        return;
      }

      if (project?.id) {
        // Load phases if project has them
        if (project?.hasPhases) {
          setLoadingPhases(true);
          try {
            const projectPhases = await fetchProjectPhases(project.id);
            setPhases(projectPhases || []);
          } catch (error) {
            console.error('Error loading phases:', error);
            setPhases([]);
          } finally {
            setLoadingPhases(false);
          }
        } else {
          setPhases([]);
        }

        // Load assigned workers
        try {
          const projectWorkers = await getProjectWorkers(project.id);
          setWorkers(projectWorkers || []);
        } catch (error) {
          console.error('Error loading workers:', error);
          setWorkers([]);
        }

        // Load manual tasks (tasks added outside of phases)
        setLoadingManualTasks(true);
        try {
          const { data: tasks } = await supabase
            .from('worker_tasks')
            .select('*')
            .eq('project_id', project.id)
            .is('phase_task_id', null)
            .order('start_date', { ascending: true });
          setManualTasks(tasks || []);

          // Calculate progress directly from all tasks (phase + manual)
          const { progress } = await calculateProjectProgressFromTasks(project.id);
          setCalculatedProgress(progress);
        } catch (error) {
          console.error('Error loading manual tasks:', error);
          setManualTasks([]);
        } finally {
          setLoadingManualTasks(false);
        }

        // Load photos
        setLoadingPhotos(true);
        try {
          const { photosByPhase: photos, totalPhotos: total } = await fetchProjectPhotosByPhase(project.id);
          setPhotosByPhase(photos);
          setTotalPhotos(total);
        } catch (error) {
          console.error('Error loading photos:', error);
          setPhotosByPhase({});
          setTotalPhotos(0);
        } finally {
          setLoadingPhotos(false);
        }

        // Load estimates linked to this project
        setLoadingEstimates(true);
        try {
          const estimates = await fetchEstimatesByProjectId(project.id);
          setProjectEstimates(estimates || []);
        } catch (error) {
          console.error('Error loading estimates:', error);
          setProjectEstimates([]);
        } finally {
          setLoadingEstimates(false);
        }

        // Load transaction totals (expenses and income)
        try {
          const summary = await getProjectTransactionSummary(project.id);
          setCalculatedExpenses(summary.totalExpenses || 0);
          setCalculatedIncome(summary.totalIncome || 0);
        } catch (error) {
          console.error('Error loading transaction summary:', error);
          // Fall back to project values
          setCalculatedExpenses(null);
          setCalculatedIncome(null);
        }

        // Load project documents
        setLoadingDocuments(true);
        try {
          const docs = await fetchProjectDocuments(project.id);
          setProjectDocuments(docs || []);
        } catch (error) {
          console.error('Error loading project documents:', error);
          setProjectDocuments([]);
        } finally {
          setLoadingDocuments(false);
        }
      }
    };

    if (visible) {
      loadData();
      // Populate contact edit fields
      setEditAddress(project?.location || '');
      setEditPhone(project?.client_phone || project?.clientPhone || '');
      setEditEmail(project?.client_email || project?.clientEmail || '');
      // Populate timeline edit fields - use safe parsing to handle various date formats
      setEditStartDate(safeParseDateToObject(project?.startDate));
      setEditEndDate(safeParseDateToObject(project?.endDate));
      // Populate working days and non-working dates
      setEditWorkingDays(project?.workingDays || [1, 2, 3, 4, 5]);
      setNonWorkingDates(project?.nonWorkingDates || []);
      // Reset photo filter and visible count
      setSelectedPhotoFilter('all');
      setVisiblePhotosCount(12);
      // Reset editing state
      setIsEditing(false);
    }
  }, [project?.id, project?.hasPhases, project?.contract_amount, project?.updated_at, visible, isDemo]);

  // Sync modal visibility with prop
  useEffect(() => {
    if (visible && !wasNavigatingRef.current) {
      setModalVisible(true);
    } else if (!visible) {
      setModalVisible(false);
      wasNavigatingRef.current = false;
    }
  }, [visible]);

  // Listen for navigation state to hide/show modal appropriately
  useEffect(() => {
    if (!navigation) return;

    const checkRoute = () => {
      try {
        const state = navigation.getState();
        if (!state) return;
        
        // Find the current route by checking the navigation state tree
        const findCurrentRoute = (navState) => {
          if (navState.index !== undefined && navState.routes) {
            const route = navState.routes[navState.index];
            if (route.state) {
              return findCurrentRoute(route.state);
            }
            return route.name;
          }
          return null;
        };
        
        const currentRoute = findCurrentRoute(state);
        
        // Hide modal if we're on ProjectTransactions screen
        if (currentRoute === 'ProjectTransactions') {
          setModalVisible(false);
          wasNavigatingRef.current = true;
        } else if (wasNavigatingRef.current && visible && currentRoute !== 'ProjectTransactions') {
          // We've navigated back, restore the modal after a delay
          setTimeout(() => {
            setModalVisible(true);
            wasNavigatingRef.current = false;
            // Refresh project data to get updated expense/income totals
            if (onRefreshNeeded) {
              onRefreshNeeded();
            }
          }, 300);
        }
      } catch (error) {
        // Ignore navigation state errors
      }
    };

    // Check immediately
    checkRoute();

    // Also listen for state changes
    const unsubscribe = navigation.addListener('state', checkRoute);
    
    return unsubscribe;
  }, [navigation, visible]);

  // When entering edit mode, initialize phase progress values
  useEffect(() => {
    if (isEditing && phases.length > 0) {
      const values = {};
      phases.forEach(p => values[p.id] = p.completion_percentage || 0);
      setPhaseProgressValues(values);
      setIsEditingPhases(true);
    } else if (!isEditing) {
      setIsEditingPhases(false);
    }
  }, [isEditing, phases]);

  const handleWorkersUpdated = async () => {
    // Reload workers after assignment changes
    try {
      const projectWorkers = await getProjectWorkers(project.id);
      setWorkers(projectWorkers || []);
    } catch (error) {
      console.error('Error reloading workers:', error);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handlePhasePress = (phase) => {
    // Toggle expand/collapse of phase tasks
    if (expandedPhaseId === phase.id) {
      setExpandedPhaseId(null); // Collapse if already expanded
    } else {
      setExpandedPhaseId(phase.id); // Expand this phase
    }
  };

  const handleTaskToggle = (task, phase) => {
    if (!task.workerTaskId) return;
    const newCompleted = !task.completed;

    // Optimistic UI update — instant feedback
    setPhases(prev => prev.map(p => {
      if (p.id !== phase.id) return p;
      const updatedTasks = p.tasks.map(t =>
        t.workerTaskId === task.workerTaskId ? { ...t, completed: newCompleted } : t
      );
      const completedCount = updatedTasks.filter(t => t.completed).length;
      return {
        ...p,
        tasks: updatedTasks,
        completion_percentage: updatedTasks.length > 0
          ? Math.round((completedCount / updatedTasks.length) * 100) : 0,
      };
    }));

    // Optimistic overall progress update
    setCalculatedProgress(prev => {
      let totalTasks = 0;
      let totalCompleted = 0;
      phases.forEach(p => {
        if (p.tasks) {
          p.tasks.forEach(t => {
            totalTasks++;
            const isThis = t.workerTaskId === task.workerTaskId;
            totalCompleted += (isThis ? newCompleted : t.completed) ? 1 : 0;
          });
        }
      });
      return totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
    });

    // Sync with DB in the background
    (async () => {
      try {
        if (newCompleted) {
          await completeTask(task.workerTaskId, null);
        } else {
          await uncompleteTask(task.workerTaskId);
        }
      } catch (error) {
        console.error('Error toggling task:', error);
        // Revert on failure
        const updated = await fetchProjectPhases(project.id);
        setPhases(updated);
        const { progress } = await calculateProjectProgressFromTasks(project.id);
        setCalculatedProgress(progress);
      }
    })();
  };

  const handleAddressPress = (address) => {
    const encodedAddress = encodeURIComponent(address);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('buttons.cancel'), t('labels.appleMaps'), t('labels.googleMaps')],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            // Apple Maps
            Linking.openURL(`http://maps.apple.com/?address=${encodedAddress}`);
          } else if (buttonIndex === 2) {
            // Google Maps
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
          }
        }
      );
    } else {
      // Android - show alert
      Alert.alert(
        t('alerts.openInMaps'),
        t('messages.chooseMapsApp'),
        [
          { text: t('buttons.cancel'), style: 'cancel' },
          {
            text: t('labels.googleMaps'),
            onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`)
          },
        ]
      );
    }
  };

  const handlePhonePress = (phone) => {
    const phoneUrl = `tel:${phone.replace(/[^0-9+]/g, '')}`;
    Linking.openURL(phoneUrl).catch(() => {
      Alert.alert(t('alerts.error'), t('messages.unableToMakePhoneCall'));
    });
  };

  const handleEmailPress = (email) => {
    const emailUrl = `mailto:${email}`;
    Linking.openURL(emailUrl).catch(() => {
      Alert.alert(t('alerts.error'), t('messages.unableToOpenEmail'));
    });
  };

  const handleSaveAllChanges = async () => {
    try {
      setSavingChanges(true);

      // Save contact info and timeline to project
      const { error } = await supabase
        .from('projects')
        .update({
          location: editAddress || null,
          client_phone: editPhone || null,
          client_email: editEmail || null,
          start_date: editStartDate ? editStartDate.toISOString().split('T')[0] : null,
          end_date: editEndDate ? editEndDate.toISOString().split('T')[0] : null,
        })
        .eq('id', project.id);

      if (error) throw error;

      // Check if timeline changed BEFORE updating local object
      const oldStartDate = safeParseDateToString(project?.startDate);
      const oldEndDate = safeParseDateToString(project?.endDate);
      const newStartDate = safeParseDateToString(editStartDate);
      const newEndDate = safeParseDateToString(editEndDate);
      const timelineChanged = oldStartDate !== newStartDate || oldEndDate !== newEndDate;

      // Update local project object - use YYYY-MM-DD format to match database
      if (project) {
        project.location = editAddress;
        project.client_phone = editPhone;
        project.client_email = editEmail;
        project.startDate = safeParseDateToString(editStartDate);
        project.endDate = safeParseDateToString(editEndDate);
      }

      // Save phase progress values
      for (const [phaseId, progress] of Object.entries(phaseProgressValues)) {
        await updatePhaseProgress(phaseId, progress);
      }

      // Refresh phases to get updated values
      if (project?.hasPhases) {
        const updatedPhases = await fetchProjectPhases(project.id);
        setPhases(updatedPhases || []);
      }

      setIsEditing(false);

      // If timeline changed, offer to recalculate task dates
      if (timelineChanged && project?.id && project?.hasPhases) {
        Alert.alert(
          t('alerts.timelineChanged'),
          t('messages.adjustTaskDates'),
          [
            { text: t('buttons.keepCurrentDates'), style: 'cancel', onPress: () => Alert.alert(t('alerts.success'), t('messages.changesSaved')) },
            {
              text: t('buttons.adjustTasks'),
              onPress: async () => {
                try {
                  const userId = await getCurrentUserId();
                  if (userId) {
                    const timeline = {
                      startDate: newStartDate,
                      endDate: newEndDate,
                      workingDays: editWorkingDays,
                    };
                    console.log('🤖 [ProjectDetailView] Calling AI to redistribute tasks...');
                    await redistributeAllTasksWithAI(project.id, userId, phases, timeline);
                    Alert.alert(t('alerts.success'), t('messages.tasksRedistributed'));
                    if (onRefreshNeeded) {
                      onRefreshNeeded();
                    }
                  }
                } catch (error) {
                  console.error('Error redistributing tasks:', error);
                  Alert.alert(t('alerts.error'), t('messages.failedToAdjustTasks'));
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(t('alerts.success'), t('messages.allChangesSaved'));
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSaveChanges'));
    } finally {
      setSavingChanges(false);
    }
  };

  const handleDeleteProject = () => {
    Alert.alert(
      t('alerts.deleteProject'),
      t('messages.confirmDeleteProject', { name: project.name }),
      [
        {
          text: t('buttons.cancel'),
          style: 'cancel'
        },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            if (onDelete) {
              onDelete(project.id);
            }
          }
        }
      ]
    );
  };

  // Note: Progress override functions removed - progress is now calculated from task completion

  if (!project) return null;

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'active':
      case 'on-track':
        return '#3B82F6';
      case 'behind':
        return '#F59E0B';
      case 'over-budget':
        return '#EF4444';
      case 'archived':
        return '#6B7280';
      default:
        return Colors.primaryBlue;
    }
  };

  // Document upload handlers
  const handleUploadDocument = () => {
    Alert.alert(
      t('alerts.addDocument'),
      t('messages.chooseSource'),
      [
        { text: t('buttons.takePhoto'), onPress: handleDocumentTakePhoto },
        { text: t('buttons.chooseFromPhotos'), onPress: handleDocumentPickImage },
        { text: t('buttons.chooseFilePdf'), onPress: handleDocumentPickFile },
        { text: t('buttons.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleDocumentTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions.permissionRequired'), t('permissions.cameraRequired'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadDocumentFile(result.assets[0].uri, 'image', `Photo_${Date.now()}.jpg`);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToTakePhoto'));
    }
  };

  const handleDocumentPickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions.permissionRequired'), t('permissions.photoLibraryRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          await uploadDocumentFile(asset.uri, 'image', asset.fileName || `Image_${Date.now()}.jpg`);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToPickImage'));
    }
  };

  const handleDocumentPickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          const fileType = asset.mimeType?.includes('pdf') ? 'document' : 'image';
          await uploadDocumentFile(asset.uri, fileType, asset.name);
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToPickDocument'));
    }
  };

  const uploadDocumentFile = async (uri, type, fileName) => {
    // Store pending upload info and show visibility modal
    setPendingDocumentUpload({ uri, type, fileName });
    setNewDocumentVisibleToWorkers(false);
    setDocumentVisibilityModalVisible(true);
  };

  const confirmDocumentUpload = async () => {
    if (!pendingDocumentUpload) return;

    const { uri, type, fileName } = pendingDocumentUpload;
    setDocumentVisibilityModalVisible(false);

    try {
      setUploadingDocument(true);
      const result = await uploadProjectDocument(project.id, uri, fileName, type, 'general', null, newDocumentVisibleToWorkers);
      if (result) {
        // Refresh documents list
        const docs = await fetchProjectDocuments(project.id);
        setProjectDocuments(docs || []);
        Alert.alert(t('alerts.success'), t('messages.documentUploaded'));
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToUploadDocument'));
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToUploadDocument'));
    } finally {
      setUploadingDocument(false);
      setPendingDocumentUpload(null);
    }
  };

  const cancelDocumentUpload = () => {
    setDocumentVisibilityModalVisible(false);
    setPendingDocumentUpload(null);
    setNewDocumentVisibleToWorkers(false);
  };

  const handleToggleDocumentVisibility = async (doc) => {
    const { updateDocumentVisibility } = require('../utils/storage/projectDocuments');
    const newVisibility = !doc.visible_to_workers;
    const success = await updateDocumentVisibility(doc.id, newVisibility);
    if (success) {
      setProjectDocuments(prev =>
        prev.map(d => d.id === doc.id ? { ...d, visible_to_workers: newVisibility } : d)
      );
    } else {
      Alert.alert(t('alerts.error'), t('messages.failedToUpdateVisibility'));
    }
  };

  const handleDeleteDocument = (doc) => {
    Alert.alert(
      t('alerts.deleteDocument'),
      t('messages.confirmDeleteDocument', { name: doc.file_name }),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            const success = await deleteProjectDocument(doc.id);
            if (success) {
              setProjectDocuments(prev => prev.filter(d => d.id !== doc.id));
            } else {
              Alert.alert(t('alerts.error'), t('messages.failedToDeleteDocument'));
            }
          },
        },
      ]
    );
  };

  const handleViewDocument = (doc) => {
    if (navigation) {
      navigation.navigate('DocumentViewer', {
        fileUrl: doc.file_url,
        fileName: doc.file_name,
        projectName: project.name,
      });
    }
  };

  const statusColor = getStatusColor(project.status);
  const progressPercent = project.percentComplete || 0;
  const contractAmount = project.contractAmount || project.budget || 0;
  // Use calculated values from transactions (includes auto-generated labor costs)
  const incomeCollected = calculatedIncome ?? project.incomeCollected ?? 0;
  const expenses = calculatedExpenses ?? project.expenses ?? project.spent ?? 0;
  const profit = incomeCollected - expenses;

  const mainContent = (
    <>
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
          <TouchableOpacity
            onPress={() => {
              if (isEditing) {
                // Cancel editing - reset values
                setEditAddress(project?.location || '');
                setEditPhone(project?.client_phone || project?.clientPhone || '');
                setEditEmail(project?.client_email || project?.clientEmail || '');
                setEditStartDate(project?.startDate ? new Date(project.startDate) : null);
                setEditEndDate(project?.endDate ? new Date(project.endDate) : null);
                setIsEditing(false);
              } else {
                onClose();
              }
            }}
            style={styles.closeButton}
          >
            <View style={[styles.closeIconContainer, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name={isEditing ? "close" : (asScreen ? "chevron-back" : "chevron-down")} size={24} color={Colors.primaryText} />
            </View>
          </TouchableOpacity>

          {/* Hide edit button for demo projects */}
          {!isDemo && (
            <TouchableOpacity
              onPress={() => {
                if (isEditing) {
                  handleSaveAllChanges();
                } else {
                  setIsEditing(true);
                }
              }}
              style={styles.editButton}
              disabled={savingChanges}
            >
              <View style={[styles.editIconContainer, { backgroundColor: isEditing ? '#10B981' : Colors.primaryBlue, opacity: savingChanges ? 0.6 : 1 }]}>
                <Ionicons name={isEditing ? "checkmark" : "create-outline"} size={20} color={Colors.white} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Demo Banner */}
        {isDemo && (
          <View style={styles.demoBanner}>
            <Ionicons name="information-circle" size={20} color="#FFFFFF" />
            <Text style={styles.demoBannerText}>
              {t('messages.demoProjectBanner')}
            </Text>
          </View>
        )}

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={[styles.heroSection, { backgroundColor: statusColor }]}>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {project.name}
              </Text>
              {project.client && (
                <View style={styles.clientRow}>
                  <Ionicons name="person-outline" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.clientText}>{project.client}</Text>
                </View>
              )}

              {/* Contact Information */}
              <View style={styles.contactContainer}>
                {/* Address */}
                {isEditing ? (
                  <View style={styles.contactEditRow}>
                    <Ionicons name="location" size={16} color="rgba(255,255,255,0.9)" />
                    <TextInput
                      style={styles.contactInput}
                      value={editAddress}
                      onChangeText={setEditAddress}
                      placeholder={t('placeholders.enterAddress')}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                    />
                  </View>
                ) : project.location ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => handleAddressPress(project.location)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="location" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.contactText} numberOfLines={2}>{project.location}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.contactRow}>
                    <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>{t('emptyStates.noAddressAdded')}</Text>
                  </View>
                )}

                {/* Phone */}
                {isEditing ? (
                  <View style={styles.contactEditRow}>
                    <Ionicons name="call" size={16} color="rgba(255,255,255,0.9)" />
                    <TextInput
                      style={styles.contactInput}
                      value={editPhone}
                      onChangeText={setEditPhone}
                      placeholder={t('placeholders.enterPhone')}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      keyboardType="phone-pad"
                    />
                  </View>
                ) : project.client_phone || project.clientPhone ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => handlePhonePress(project.client_phone || project.clientPhone)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="call" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.contactText}>{project.client_phone || project.clientPhone}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.contactRow}>
                    <Ionicons name="call-outline" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>{t('emptyStates.noPhoneAdded')}</Text>
                  </View>
                )}

                {/* Email */}
                {isEditing ? (
                  <View style={styles.contactEditRow}>
                    <Ionicons name="mail" size={16} color="rgba(255,255,255,0.9)" />
                    <TextInput
                      style={styles.contactInput}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      placeholder={t('placeholders.enterEmail')}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                ) : project.client_email || project.clientEmail ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => handleEmailPress(project.client_email || project.clientEmail)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="mail" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.contactText}>{project.client_email || project.clientEmail}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.contactRow}>
                    <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>{t('emptyStates.noEmailAdded')}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Financial Summary Cards */}
          <View style={styles.financialContainer}>
            {/* Top Row: Contract & Income */}
            <View style={styles.financialRow}>
              {/* Contract Amount */}
              <View style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}>
                <View style={[styles.iconBadge, { backgroundColor: '#3B82F6' + '15' }]}>
                  <Ionicons name="document-text" size={18} color="#3B82F6" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>{t('labels.contract')}</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${contractAmount.toLocaleString()}
                </Text>
              </View>

              {/* Income Collected */}
              <TouchableOpacity
                style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}
                onPress={() => {
                  if (navigation) {
                    wasNavigatingRef.current = true;
                    setModalVisible(false);
                    navigation.navigate('ProjectTransactions', {
                      projectId: project.id,
                      projectName: project.name,
                      fromProjectDetail: true,
                      transactionType: 'income',
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBadge, { backgroundColor: '#10B981' + '15' }]}>
                  <Ionicons name="cash" size={18} color="#10B981" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>{t('labels.income')}</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${incomeCollected.toLocaleString()}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Row: Expenses & Profit */}
            <View style={styles.financialRow}>
              {/* Expenses */}
              <TouchableOpacity
                style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}
                onPress={() => {
                  if (navigation) {
                    wasNavigatingRef.current = true;
                    setModalVisible(false);
                    navigation.navigate('ProjectTransactions', {
                      projectId: project.id,
                      projectName: project.name,
                      fromProjectDetail: true,
                      transactionType: 'expense',
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                  <Ionicons name="trending-down" size={18} color="#EF4444" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>{t('labels.expenses')}</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${expenses.toLocaleString()}
                </Text>
              </TouchableOpacity>

              {/* Profit */}
              <View style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}>
                <View style={[styles.iconBadge, { backgroundColor: profit >= 0 ? '#10B981' + '15' : '#EF4444' + '15' }]}>
                  <Ionicons name={profit >= 0 ? "trending-up" : "trending-down"} size={18} color={profit >= 0 ? "#10B981" : "#EF4444"} />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>{t('labels.profit')}</Text>
                <Text style={[styles.financialValue, { color: profit >= 0 ? '#10B981' : '#EF4444' }]} numberOfLines={1}>
                  ${profit.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {/* Project Details Section */}
          {(project.taskDescription || project.location || project.clientPhone) && (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('labels.projectDetails')}</Text>

              {project.taskDescription && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="document-text-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.description')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{project.taskDescription}</Text>
                  </View>
                </View>
              )}

              {project.location && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => handleAddressPress(project.location)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="location-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.location')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryBlue }]}>{project.location}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {project.clientPhone && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => handlePhonePress(project.clientPhone)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="call-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.clientPhone')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryBlue }]}>{project.clientPhone}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Project Phases Section */}
          {project.hasPhases && phases.length > 0 && (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="layers-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>{t('labels.projectPhases')}</Text>
                {isEditing && (
                  <View style={styles.editingIndicator}>
                    <Text style={[styles.editingIndicatorText, { color: Colors.primaryBlue }]}>{t('labels.editing')}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.shiftTasksButton, { backgroundColor: Colors.primaryBlue + '15' }]}
                  onPress={() => setShowBulkShiftModal(true)}
                >
                  <Ionicons name="calendar-outline" size={16} color={Colors.primaryBlue} />
                  <Text style={[styles.shiftTasksButtonText, { color: Colors.primaryBlue }]}>{t('buttons.shiftTasks')}</Text>
                </TouchableOpacity>
              </View>
              <PhaseTimeline
                phases={phases}
                projectProgress={calculatedProgress}
                onPhasePress={handlePhasePress}
                onTaskToggle={handleTaskToggle}
                compact={false}
                expandedPhaseId={expandedPhaseId}
                isEditing={isEditingPhases}
                progressValues={phaseProgressValues}
                onProgressChange={(phaseId, value) => {
                  setPhaseProgressValues(prev => ({ ...prev, [phaseId]: value }));
                }}
                onProgressSave={async (phaseId, value) => {
                  const success = await updatePhaseProgress(phaseId, value);
                  if (success) {
                    // Refresh phases
                    const updated = await fetchProjectPhases(project.id);
                    setPhases(updated);
                  }
                }}
              />
            </View>
          )}

          {/* Additional Tasks Section - Shows manually added tasks */}
          {manualTasks.length > 0 && (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="add-circle-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                  {t('labels.additionalTasksCount', { count: manualTasks.length })}
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                {manualTasks.map((task) => (
                  <View
                    key={task.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.primaryText }}>
                        {task.title}
                      </Text>
                      <Text style={{ fontSize: 12, marginTop: 2, color: Colors.secondaryText }}>
                        {task.start_date ? new Date(task.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : t('emptyStates.noDate')}
                      </Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 4,
                      backgroundColor: task.status === 'completed' ? '#10B981' : Colors.primaryBlue + '20',
                    }}>
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '500',
                        color: task.status === 'completed' ? '#FFFFFF' : Colors.primaryBlue,
                      }}>
                        {task.status === 'completed' ? t('labels.done') : t('labels.pending')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Assigned Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                Assigned ({workers.length})
              </Text>
              <View style={styles.assignButtonsRow}>
                {canAssignToSupervisor && (
                  <TouchableOpacity
                    style={[styles.assignButton, { backgroundColor: '#1E40AF', marginRight: 8 }]}
                    onPress={() => setShowSupervisorAssignment(true)}
                  >
                    <Ionicons name="briefcase" size={14} color="#FFFFFF" />
                    <Text style={styles.assignButtonText}>Supervisor</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => setShowWorkerAssignment(true)}
                >
                  <Ionicons name="person-add" size={14} color="#FFFFFF" />
                  <Text style={styles.assignButtonText}>Worker</Text>
                </TouchableOpacity>
              </View>
            </View>

            {workers.length === 0 ? (
              <View style={styles.emptyWorkers}>
                <Ionicons name="people-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyWorkersText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noWorkersAssigned')}
                </Text>
              </View>
            ) : (
              <View style={styles.workersGrid}>
                {workers.map((worker) => (
                  <View key={worker.id} style={[styles.workerChip, { backgroundColor: Colors.lightGray }]}>
                    <View style={[styles.workerAvatar, { backgroundColor: Colors.primaryBlue }]}>
                      <Text style={styles.workerAvatarText}>{getInitials(worker.full_name)}</Text>
                    </View>
                    <View style={styles.workerChipInfo}>
                      <Text style={[styles.workerChipName, { color: Colors.primaryText }]} numberOfLines={1}>
                        {worker.full_name}
                      </Text>
                      {worker.trade && (
                        <Text style={[styles.workerChipTrade, { color: Colors.secondaryText }]} numberOfLines={1}>
                          {worker.trade}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Photos Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => totalPhotos > 0 && setPhotoGalleryModalVisible(true)}
              activeOpacity={totalPhotos > 0 ? 0.7 : 1}
            >
              <Ionicons name="camera-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                {t('labels.photosCount', { count: totalPhotos })}
              </Text>
              {totalPhotos > 0 && (
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              )}
            </TouchableOpacity>

            {loadingPhotos ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>{t('labels.loadingPhotos')}</Text>
              </View>
            ) : totalPhotos === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="images-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noPhotosYet')}
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  {t('emptyStates.photosFromReports')}
                </Text>
              </View>
            ) : (
              <>
                {/* Photo Grid */}
                <View style={styles.photoGrid}>
                  {(() => {
                    // Get all photos
                    let photosToShow = [];
                    Object.values(photosByPhase).forEach(data => {
                      photosToShow = [...photosToShow, ...data.photos];
                    });

                    const visiblePhotos = photosToShow.slice(0, visiblePhotosCount);
                    const hasMore = photosToShow.length > visiblePhotosCount;

                    return (
                      <>
                        {visiblePhotos.map((photo, index) => (
                          <TouchableOpacity
                            key={`${photo.reportId}-${index}`}
                            style={styles.photoThumbnailContainer}
                            onPress={() => {
                              setPhotoViewerPhotos(photosToShow);
                              setPhotoViewerIndex(index);
                              setPhotoViewerVisible(true);
                            }}
                            activeOpacity={0.8}
                          >
                            <Image
                              source={{ uri: photo.url }}
                              style={styles.photoThumbnail}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        ))}
                        {hasMore && (
                          <TouchableOpacity
                            style={[styles.loadMorePhotosButton, { backgroundColor: Colors.lightGray }]}
                            onPress={() => setVisiblePhotosCount(prev => prev + 12)}
                          >
                            <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
                            <Text style={[styles.loadMorePhotosText, { color: Colors.primaryBlue }]}>
                              {t('buttons.loadMore', { count: photosToShow.length - visiblePhotosCount })}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </>
                    );
                  })()}
                </View>
              </>
            )}
          </View>

          {/* Documents Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="folder-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                {t('labels.documentsCount', { count: projectDocuments.length })}
              </Text>
              <TouchableOpacity
                style={[styles.assignButton, { backgroundColor: Colors.primaryBlue, opacity: uploadingDocument ? 0.6 : 1 }]}
                onPress={handleUploadDocument}
                disabled={uploadingDocument}
              >
                {uploadingDocument ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.assignButtonText}>{t('buttons.add')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {loadingDocuments ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>{t('labels.loadingDocuments')}</Text>
              </View>
            ) : projectDocuments.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="document-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noDocumentsYet')}
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  {t('emptyStates.uploadDocuments')}
                </Text>
              </View>
            ) : (
              <View style={styles.documentsList}>
                {projectDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[styles.documentCard, { backgroundColor: Colors.lightGray }]}
                    onPress={() => handleViewDocument(doc)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.documentIcon, { backgroundColor: doc.file_type === 'document' ? '#EF4444' + '20' : Colors.primaryBlue + '20' }]}>
                      <Ionicons
                        name={doc.file_type === 'document' ? 'document' : 'image'}
                        size={24}
                        color={doc.file_type === 'document' ? '#EF4444' : Colors.primaryBlue}
                      />
                    </View>
                    <View style={styles.documentInfo}>
                      <Text style={[styles.documentName, { color: Colors.primaryText }]} numberOfLines={1}>
                        {doc.file_name}
                      </Text>
                      <View style={styles.documentMeta}>
                        <Text style={[styles.documentDate, { color: Colors.secondaryText }]}>
                          {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {doc.visible_to_workers && (
                          <View style={[styles.workerVisibleBadge, { backgroundColor: '#10B981' + '20' }]}>
                            <Ionicons name="people" size={10} color="#10B981" />
                            <Text style={styles.workerVisibleText}>{t('labels.workers')}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.documentVisibilityButton}
                      onPress={() => handleToggleDocumentVisibility(doc)}
                    >
                      <Ionicons
                        name={doc.visible_to_workers ? 'eye' : 'eye-off'}
                        size={18}
                        color={doc.visible_to_workers ? '#10B981' : Colors.secondaryText}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.documentDeleteButton}
                      onPress={() => handleDeleteDocument(doc)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Estimates Section - Hidden for supervisors */}
          {!isSupervisor && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                {t('labels.estimatesCount', { count: projectEstimates.length })}
              </Text>
              {!isSupervisor && (
                <TouchableOpacity
                  style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => {
                    // Navigate to chat with context to create estimate
                    if (navigation) {
                      onClose();
                      navigation.navigate('Chat', {
                        initialMessage: `Create estimate for ${project.name}`,
                        projectIdForEstimate: project.id
                      });
                    }
                  }}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.assignButtonText}>{t('buttons.create')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {loadingEstimates ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>{t('labels.loadingEstimates')}</Text>
              </View>
            ) : projectEstimates.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="document-text-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noEstimatesYet')}
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  {t('emptyStates.createEstimate')}
                </Text>
              </View>
            ) : (
              <View style={styles.estimatesList}>
                {projectEstimates.map((estimate) => (
                  <TouchableOpacity
                    key={estimate.id}
                    style={[styles.estimateCard, { backgroundColor: Colors.lightGray }]}
                    onPress={async () => {
                      // Fetch full estimate data (list only has summary fields)
                      const fullEstimate = await getEstimate(estimate.id);
                      if (fullEstimate) {
                        setSelectedEstimate(fullEstimate);
                        setShowEstimateModal(true);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.estimateCardContent}>
                      <View style={styles.estimateCardHeader}>
                        <Text style={[styles.estimateCardTitle, { color: Colors.primaryText }]} numberOfLines={1}>
                          {estimate.projectName || 'Estimate'}
                        </Text>
                        <View style={[
                          styles.estimateStatusBadge,
                          { backgroundColor: estimate.status === 'sent' ? '#10B981' + '20' : estimate.status === 'accepted' ? '#3B82F6' + '20' : '#F59E0B' + '20' }
                        ]}>
                          <Text style={[
                            styles.estimateStatusText,
                            { color: estimate.status === 'sent' ? '#10B981' : estimate.status === 'accepted' ? '#3B82F6' : '#F59E0B' }
                          ]}>
                            {estimate.status || 'Draft'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.estimateCardDetails}>
                        <Text style={[styles.estimateCardTotal, { color: Colors.primaryText }]}>
                          ${(estimate.total || 0).toLocaleString()}
                        </Text>
                        <Text style={[styles.estimateCardDate, { color: Colors.secondaryText }]}>
                          {estimate.createdAt ? new Date(estimate.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : ''}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          )}

          {/* Timeline Section */}
          {(project.startDate || project.endDate || isEditing) && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>{t('labels.timeline')}</Text>
                {isEditing && (
                  <View style={styles.editingIndicator}>
                    <Text style={[styles.editingIndicatorText, { color: Colors.primaryBlue }]}>{t('labels.editing')}</Text>
                  </View>
                )}
              </View>

              {/* Start Date */}
              {isEditing ? (
                <TouchableOpacity
                  style={styles.dateEditRow}
                  onPress={() => setShowStartDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: '#10B981' + '15' }]}>
                    <Ionicons name="play-outline" size={18} color="#10B981" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.startDate')}</Text>
                    <View style={[styles.dateEditButton, { borderColor: Colors.border }]}>
                      <Text style={[styles.dateEditText, { color: editStartDate ? Colors.primaryText : Colors.secondaryText }]}>
                        {editStartDate ? editStartDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        }) : t('placeholders.tapToSetDate')}
                      </Text>
                      <Ionicons name="calendar" size={16} color={Colors.primaryBlue} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : project.startDate ? (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#10B981' + '15' }]}>
                    <Ionicons name="play-outline" size={18} color="#10B981" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.startDate')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {safeParseDateToObject(project.startDate)?.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      }) || t('emptyStates.notSet')}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* End Date */}
              {isEditing ? (
                <TouchableOpacity
                  style={styles.dateEditRow}
                  onPress={() => setShowEndDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                    <Ionicons name="flag-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.endDate')}</Text>
                    <View style={[styles.dateEditButton, { borderColor: Colors.border }]}>
                      <Text style={[styles.dateEditText, { color: editEndDate ? Colors.primaryText : Colors.secondaryText }]}>
                        {editEndDate ? editEndDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        }) : t('placeholders.tapToSetDate')}
                      </Text>
                      <Ionicons name="calendar" size={16} color={Colors.primaryBlue} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : project.endDate ? (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                    <Ionicons name="flag-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.endDate')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {safeParseDateToObject(project.endDate)?.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      }) || t('emptyStates.notSet')}
                    </Text>
                  </View>
                </View>
              ) : null}

              {!isEditing && project.daysRemaining !== null && project.daysRemaining !== undefined && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#F59E0B' + '15' }]}>
                    <Ionicons name="time-outline" size={18} color="#F59E0B" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Days Remaining</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {project.daysRemaining} days
                    </Text>
                  </View>
                </View>
              )}

              {/* Working Days */}
              <View style={[styles.workingDaysRow, { marginTop: Spacing.md }]}>
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#8B5CF6' + '15' }]}>
                    <Ionicons name="briefcase-outline" size={18} color="#8B5CF6" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.workingDays')}</Text>
                  </View>
                </View>
                <WorkingDaysSelector
                  selectedDays={editWorkingDays}
                  onDaysChange={async (days) => {
                    const oldDays = editWorkingDays; // Capture BEFORE updating state
                    setEditWorkingDays(days);
                    if (project?.id) {
                      await updateProjectWorkingDays(project.id, days);

                      // Detect which day was REMOVED (toggled OFF)
                      const removedDay = oldDays.find(d => !days.includes(d));
                      // Detect which day was ADDED (toggled ON)
                      const addedDay = days.find(d => !oldDays.includes(d));

                      const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

                      if (removedDay) {
                        // A day was toggled OFF - use AI to redistribute tasks from that day
                        const result = await redistributeTasksFromDayWithAI(project.id, removedDay, days, nonWorkingDates);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.scheduleUpdated'),
                            t('messages.tasksMoved', { count: result.updatedCount, day: dayNames[removedDay] }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      } else if (addedDay) {
                        // A day was toggled ON - restore tasks that were originally on this day
                        const result = await restoreTasksToOriginalDay(project.id, addedDay);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.tasksRestored'),
                            t('messages.tasksRestoredToDay', { count: result.updatedCount, day: dayNames[addedDay] }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      }
                    }
                  }}
                  label=""
                  disabled={false}
                />

                {/* Non-Working Dates (specific days off) */}
                <NonWorkingDatesManager
                  dates={nonWorkingDates}
                  onAddDate={async (date) => {
                    if (project?.id) {
                      const success = await addNonWorkingDate(project.id, date);
                      if (success) {
                        const newNonWorkingDates = [...nonWorkingDates, date].sort();
                        setNonWorkingDates(newNonWorkingDates);
                        // Only move tasks on this specific date (not all tasks!)
                        const result = await moveTasksFromSpecificDate(project.id, date, editWorkingDays, newNonWorkingDates);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.scheduleUpdated'),
                            t('messages.tasksMovedFromDate', { count: result.updatedCount, date }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      }
                    }
                  }}
                  onRemoveDate={async (date) => {
                    if (project?.id) {
                      const success = await removeNonWorkingDate(project.id, date);
                      if (success) {
                        const newNonWorkingDates = nonWorkingDates.filter(d => d !== date);
                        setNonWorkingDates(newNonWorkingDates);
                        // Restore tasks that were originally on this date
                        const result = await restoreTasksToSpecificDate(project.id, date);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.tasksRestored'),
                            t('messages.tasksRestoredToDate', { count: result.updatedCount, date }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      }
                    }
                  }}
                  disabled={false}
                />
              </View>
            </View>
          )}

          {/* Delete Project Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground, borderColor: '#EF4444' + '30' }]}>
            <View style={styles.dangerZoneHeader}>
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text style={[styles.dangerZoneTitle, { color: '#EF4444' }]}>{t('labels.dangerZone')}</Text>
            </View>
            <Text style={[styles.dangerZoneDescription, { color: Colors.secondaryText }]}>
              {t('messages.deleteProjectWarning')}
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteProject}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>{t('buttons.deleteProject')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Worker Assignment Modal */}
      <WorkerAssignmentModal
        visible={showWorkerAssignment}
        onClose={() => setShowWorkerAssignment(false)}
        assignmentType="project"
        assignmentId={project?.id}
        assignmentName={project?.name}
        onAssignmentsChange={handleWorkersUpdated}
      />

      {/* Supervisor Assignment Modal (for owners to assign projects) */}
      <SupervisorAssignmentModal
        visible={showSupervisorAssignment}
        onClose={() => setShowSupervisorAssignment(false)}
        project={{
          id: project?.id,
          name: project?.name,
          assignedTo: project?.assignedTo || project?.assigned_supervisor_id,
        }}
        onAssignmentChange={(newSupervisorId) => {
          setShowSupervisorAssignment(false);
          // Trigger refresh if callback provided
          if (onRefreshNeeded) {
            onRefreshNeeded();
          }
        }}
      />

      {/* Full-Screen Photo Viewer with Swipe Navigation */}
      <FullscreenPhotoViewer
        photos={photoViewerPhotos}
        visible={photoViewerVisible}
        initialIndex={photoViewerIndex}
        onClose={() => setPhotoViewerVisible(false)}
      />

      {/* Photo Gallery Modal - Full grid view of all photos */}
      <Modal
        visible={photoGalleryModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPhotoGalleryModalVisible(false)}
      >
        <SafeAreaView style={[styles.galleryModalContainer, { backgroundColor: Colors.background }]}>
          {/* Gallery Header */}
          <View style={[styles.galleryModalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity
              style={styles.galleryModalCloseButton}
              onPress={() => setPhotoGalleryModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.galleryModalTitle, { color: Colors.primaryText }]}>
              {t('labels.allPhotosCount', { count: totalPhotos })}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Gallery Grid */}
          <ScrollView
            style={styles.galleryScrollView}
            contentContainerStyle={styles.galleryGridContainer}
            showsVerticalScrollIndicator={false}
          >
            {(() => {
              // Get all photos
              let allPhotos = [];
              Object.values(photosByPhase).forEach(data => {
                allPhotos = [...allPhotos, ...data.photos];
              });

              const photoWidth = (Dimensions.get('window').width - 16) / 3 - 4;

              return (
                <View style={styles.galleryGrid}>
                  {allPhotos.map((photo, index) => (
                    <TouchableOpacity
                      key={`gallery-${photo.reportId}-${index}`}
                      style={[styles.galleryPhotoContainer, { width: photoWidth, height: photoWidth }]}
                      onPress={() => {
                        setPhotoViewerPhotos(allPhotos);
                        setPhotoViewerIndex(index);
                        setPhotoViewerVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: photo.url }}
                        style={styles.galleryPhoto}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Progress Override Modal */}
      {/* Note: Progress Override Modal removed - progress is now calculated from task completion */}

      {/* Document Visibility Modal */}
      <Modal
        visible={documentVisibilityModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelDocumentUpload}
      >
        <View style={styles.visibilityModalOverlay}>
          <View style={[styles.visibilityModalContent, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.visibilityModalTitle, { color: Colors.primaryText }]}>
              Upload Document
            </Text>
            <Text style={[styles.visibilityModalSubtitle, { color: Colors.secondaryText }]}>
              {pendingDocumentUpload?.fileName}
            </Text>

            <TouchableOpacity
              style={[styles.visibilityOption, { borderColor: Colors.border }]}
              onPress={() => setNewDocumentVisibleToWorkers(!newDocumentVisibleToWorkers)}
              activeOpacity={0.7}
            >
              <View style={styles.visibilityOptionContent}>
                <Ionicons
                  name="people"
                  size={24}
                  color={newDocumentVisibleToWorkers ? '#10B981' : Colors.secondaryText}
                />
                <View style={styles.visibilityOptionText}>
                  <Text style={[styles.visibilityOptionTitle, { color: Colors.primaryText }]}>
                    Visible to Workers
                  </Text>
                  <Text style={[styles.visibilityOptionDesc, { color: Colors.secondaryText }]}>
                    Workers assigned to this project can view this document
                  </Text>
                </View>
              </View>
              <View style={[
                styles.visibilityToggle,
                { backgroundColor: newDocumentVisibleToWorkers ? '#10B981' : Colors.border }
              ]}>
                <View style={[
                  styles.visibilityToggleKnob,
                  { transform: [{ translateX: newDocumentVisibleToWorkers ? 20 : 0 }] }
                ]} />
              </View>
            </TouchableOpacity>

            <View style={styles.visibilityModalButtons}>
              <TouchableOpacity
                style={[styles.visibilityModalButton, styles.visibilityModalCancelButton, { borderColor: Colors.border }]}
                onPress={cancelDocumentUpload}
              >
                <Text style={[styles.visibilityModalButtonText, { color: Colors.secondaryText }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityModalButton, styles.visibilityModalConfirmButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={confirmDocumentUpload}
              >
                <Text style={[styles.visibilityModalButtonText, { color: '#FFFFFF' }]}>
                  Upload
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={showStartDatePicker || showEndDatePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowStartDatePicker(false);
          setShowEndDatePicker(false);
        }}
      >
        <View style={styles.datePickerModalOverlay}>
          <TouchableOpacity
            style={styles.datePickerBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowStartDatePicker(false);
              setShowEndDatePicker(false);
            }}
          />
          <View style={[styles.datePickerModalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowStartDatePicker(false);
                  setShowEndDatePicker(false);
                }}
              >
                <Text style={[styles.datePickerCancelText, { color: Colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.datePickerTitle, { color: Colors.primaryText }]}>
                {showStartDatePicker ? t('labels.startDate') : t('labels.endDate')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowStartDatePicker(false);
                  setShowEndDatePicker(false);
                }}
              >
                <Text style={[styles.datePickerDoneText, { color: Colors.primaryBlue }]}>{t('buttons.done')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={showStartDatePicker ? (editStartDate || new Date()) : (editEndDate || new Date())}
              mode="date"
              display="spinner"
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  if (showStartDatePicker) {
                    setEditStartDate(selectedDate);
                  } else {
                    setEditEndDate(selectedDate);
                  }
                }
              }}
              style={styles.datePicker}
              textColor={Colors.primaryText}
            />
          </View>
        </View>
      </Modal>

      {/* Bulk Task Shift Modal */}
      <BulkTaskShiftModal
        visible={showBulkShiftModal}
        onClose={() => setShowBulkShiftModal(false)}
        projectId={project?.id}
        projectName={project?.name}
        onTasksShifted={() => {
          // Refresh the project data after tasks are shifted
          onRefreshNeeded?.();
        }}
      />

      {/* Estimate Preview Modal */}
      <Modal
        visible={showEstimateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEstimateModal(false)}
      >
        <SafeAreaView style={[styles.estimateModalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.estimateModalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowEstimateModal(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.estimateModalTitle, { color: Colors.primaryText }]}>Estimate</Text>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView style={styles.estimateModalContent} showsVerticalScrollIndicator={false}>
            {selectedEstimate && (
              <EstimatePreview
                data={{
                  ...selectedEstimate,
                  client: selectedEstimate.client_name || selectedEstimate.clientName,
                  clientName: selectedEstimate.client_name || selectedEstimate.clientName,
                  clientPhone: selectedEstimate.client_phone || selectedEstimate.clientPhone,
                  clientEmail: selectedEstimate.client_email || selectedEstimate.clientEmail,
                  clientAddress: selectedEstimate.client_address || selectedEstimate.clientAddress,
                  projectName: selectedEstimate.project_name || selectedEstimate.projectName,
                  estimateNumber: selectedEstimate.estimate_number || selectedEstimate.estimateNumber,
                  date: selectedEstimate.created_at ? new Date(selectedEstimate.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
                  items: selectedEstimate.items || [],
                  phases: selectedEstimate.phases || [],
                  schedule: selectedEstimate.schedule || {},
                  scope: selectedEstimate.scope || {},
                  subtotal: selectedEstimate.subtotal || 0,
                  total: selectedEstimate.total || 0,
                  status: selectedEstimate.status,
                }}
                onAction={(action) => {
                  console.log('Estimate action:', action);
                  setShowEstimateModal(false);
                }}
              />
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );

  // If rendering as a screen (not modal), return content directly
  if (asScreen) {
    return mainContent;
  }

  // Otherwise wrap in Modal
  return (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {mainContent}
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
    paddingHorizontal: Spacing.large,
    paddingVertical: Spacing.medium,
  },
  closeButton: {
    padding: 4,
  },
  closeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    padding: 4,
  },
  editPhasesButton: {
    padding: 4,
  },
  editIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignButton: {
    padding: 4,
    marginRight: 4,
  },
  assignIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBanner: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  demoBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroContent: {
    flex: 1,
    marginRight: 12,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 24,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  clientText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
  },
  contactContainer: {
    marginTop: 4,
    gap: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  contactText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    flex: 1,
  },
  contactEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  contactInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  editingIndicator: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  editingIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dateEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dateEditText: {
    fontSize: 14,
    fontWeight: '600',
  },
  datePickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  datePickerBackdrop: {
    flex: 1,
  },
  datePickerModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  datePickerCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  datePickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  datePicker: {
    height: 250,
  },
  editContactModal: {
    flex: 1,
  },
  editContactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  editContactTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editContactContent: {
    flex: 1,
    padding: 20,
  },
  editContactSection: {
    marginBottom: 24,
  },
  editContactLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  editContactInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 14,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  progressRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  progressRingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  financialContainer: {
    padding: 12,
  },
  financialRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  financialCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  financialLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },
  financialValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  assignButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWorkers: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyWorkersText: {
    fontSize: 14,
    marginTop: 8,
  },
  workersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  workerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: '48%',
  },
  workerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  workerAvatarText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  workerChipInfo: {
    flex: 1,
  },
  workerChipName: {
    fontSize: 13,
    fontWeight: '600',
  },
  workerChipTrade: {
    fontSize: 11,
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dangerZoneTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dangerZoneDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  manualBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  progressModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  progressModalBackdrop: {
    flex: 1,
  },
  progressModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  progressModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  progressModalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressModalBody: {
    paddingHorizontal: 20,
  },
  progressDisplay: {
    alignItems: 'center',
    marginBottom: 32,
  },
  progressDisplayValue: {
    fontSize: 56,
    fontWeight: '800',
    marginBottom: 4,
  },
  progressDisplayLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '600',
    width: 32,
  },
  sliderTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressInput: {
    width: 80,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  overrideIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  overrideIndicatorText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  progressModalButtons: {
    gap: 12,
  },
  progressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  saveButton: {
    // backgroundColor set dynamically
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#F3F4F6',
  },
  resetButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  // Photos Section Styles
  photosLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  photosLoadingText: {
    fontSize: 14,
  },
  emptyPhotos: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyPhotosText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  emptyPhotosSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  photoFilterScroll: {
    marginBottom: 12,
    marginHorizontal: -4,
  },
  photoFilterContainer: {
    paddingHorizontal: 4,
    gap: 8,
  },
  photoFilterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  photoFilterTabActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  photoFilterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  photoThumbnailContainer: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
  loadMorePhotosButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadMorePhotosText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Full-Screen Photo Modal Styles
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  photoModalContainer: {
    flex: 1,
  },
  photoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  photoModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  photoModalDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  photoModalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalImage: {
    width: '100%',
    height: '100%',
  },
  // Photo Gallery Modal Styles
  galleryModalContainer: {
    flex: 1,
  },
  galleryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  galleryModalCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  galleryScrollView: {
    flex: 1,
  },
  galleryGridContainer: {
    padding: 8,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  galleryPhotoContainer: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  galleryPhoto: {
    width: '100%',
    height: '100%',
  },
  // Estimate Modal Styles
  estimateModalContainer: {
    flex: 1,
  },
  estimateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  estimateModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  estimateModalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // Estimates Section Styles
  estimatesList: {
    gap: 10,
  },
  estimateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
  },
  estimateCardContent: {
    flex: 1,
  },
  estimateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  estimateCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  estimateStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  estimateStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  estimateCardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estimateCardTotal: {
    fontSize: 16,
    fontWeight: '700',
  },
  estimateCardDate: {
    fontSize: 12,
  },
  // Documents Section Styles
  documentsList: {
    gap: 10,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '500',
  },
  documentDate: {
    fontSize: 12,
    marginTop: 2,
  },
  documentDeleteButton: {
    padding: 8,
  },
  documentVisibilityButton: {
    padding: 8,
  },
  documentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  workerVisibleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  workerVisibleText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  // Document visibility modal styles
  visibilityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  visibilityModalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 20,
  },
  visibilityModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  visibilityModalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 20,
  },
  visibilityOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  visibilityOptionText: {
    flex: 1,
  },
  visibilityOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  visibilityOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  visibilityToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  visibilityToggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  visibilityModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  visibilityModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  visibilityModalCancelButton: {
    borderWidth: 1,
  },
  visibilityModalConfirmButton: {},
  visibilityModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Working days and task shifting styles
  shiftTasksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  shiftTasksButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  workingDaysRow: {
    paddingHorizontal: Spacing.medium,
  },
  // Task maintenance styles
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: Spacing.medium,
  },
  resyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: Spacing.medium,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 8,
  },
  resyncButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
