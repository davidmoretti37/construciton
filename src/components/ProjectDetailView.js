import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
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
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjectPhases, getProjectWorkers, updateProjectProgress, resetProjectProgressToAutomatic, fetchProjectPhotosByPhase, updatePhaseProgress, fetchEstimatesByProjectId } from '../utils/storage';
import PhaseTimeline from './PhaseTimeline';
import WorkerAssignmentModal from './WorkerAssignmentModal';
import { supabase } from '../lib/supabase';

export default function ProjectDetailView({ visible, project, onClose, onEdit, onAction, navigation, onDelete }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [phases, setPhases] = useState([]);
  const [loadingPhases, setLoadingPhases] = useState(false);

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

  // Expanded phase for showing tasks
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);

  // Manual progress override
  const [showProgressOverride, setShowProgressOverride] = useState(false);
  const [overrideProgress, setOverrideProgress] = useState(project?.actual_progress || 0);
  const [savingProgress, setSavingProgress] = useState(false);

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

  // Estimates section
  const [projectEstimates, setProjectEstimates] = useState([]);
  const [loadingEstimates, setLoadingEstimates] = useState(false);

  const screenWidth = Dimensions.get('window').width;

  // Load phases and workers when project changes
  useEffect(() => {
    const loadData = async () => {
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
      }
    };

    if (visible) {
      loadData();
      // Populate contact edit fields
      setEditAddress(project?.location || '');
      setEditPhone(project?.client_phone || project?.clientPhone || '');
      setEditEmail(project?.client_email || project?.clientEmail || '');
      // Populate timeline edit fields
      setEditStartDate(project?.startDate ? new Date(project.startDate) : null);
      setEditEndDate(project?.endDate ? new Date(project.endDate) : null);
      // Reset photo filter and visible count
      setSelectedPhotoFilter('all');
      setVisiblePhotosCount(12);
      // Reset editing state
      setIsEditing(false);
    }
  }, [project?.id, project?.hasPhases, visible]);

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

  const handleAddressPress = (address) => {
    const encodedAddress = encodeURIComponent(address);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Open in Apple Maps', 'Open in Google Maps'],
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
        'Open in Maps',
        'Choose a maps application',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Google Maps',
            onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`)
          },
        ]
      );
    }
  };

  const handlePhonePress = (phone) => {
    const phoneUrl = `tel:${phone.replace(/[^0-9+]/g, '')}`;
    Linking.openURL(phoneUrl).catch(() => {
      Alert.alert('Error', 'Unable to make phone call');
    });
  };

  const handleEmailPress = (email) => {
    const emailUrl = `mailto:${email}`;
    Linking.openURL(emailUrl).catch(() => {
      Alert.alert('Error', 'Unable to open email client');
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
          start_date: editStartDate ? editStartDate.toISOString() : null,
          end_date: editEndDate ? editEndDate.toISOString() : null,
        })
        .eq('id', project.id);

      if (error) throw error;

      // Update local project object
      if (project) {
        project.location = editAddress;
        project.client_phone = editPhone;
        project.client_email = editEmail;
        project.startDate = editStartDate ? editStartDate.toISOString() : null;
        project.endDate = editEndDate ? editEndDate.toISOString() : null;
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
      Alert.alert('Success', 'All changes saved');
    } catch (error) {
      console.error('Error saving changes:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSavingChanges(false);
    }
  };

  const handleDeleteProject = () => {
    Alert.alert(
      'Delete Project',
      `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
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

  const handleSaveProgressOverride = async () => {
    try {
      setSavingProgress(true);
      const success = await updateProjectProgress(project.id, overrideProgress);

      if (success) {
        // Update local project object
        project.actual_progress = overrideProgress;
        project.progress_override = true;

        setShowProgressOverride(false);
        Alert.alert('Success', 'Progress updated successfully');
      } else {
        Alert.alert('Error', 'Failed to update progress');
      }
    } catch (error) {
      console.error('Error saving progress:', error);
      Alert.alert('Error', 'Failed to update progress');
    } finally {
      setSavingProgress(false);
    }
  };

  const handleResetToAutomatic = async () => {
    try {
      setSavingProgress(true);
      const success = await resetProjectProgressToAutomatic(project.id);

      if (success) {
        // Update local project object
        project.progress_override = false;

        setShowProgressOverride(false);
        Alert.alert('Success', 'Progress reset to automatic calculation');
      } else {
        Alert.alert('Error', 'Failed to reset progress');
      }
    } catch (error) {
      console.error('Error resetting progress:', error);
      Alert.alert('Error', 'Failed to reset progress');
    } finally {
      setSavingProgress(false);
    }
  };

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

  const statusColor = getStatusColor(project.status);
  const progressPercent = project.percentComplete || 0;
  const contractAmount = project.contractAmount || project.budget || 0;
  const incomeCollected = project.incomeCollected || 0;
  const expenses = project.expenses || project.spent || 0;
  const profit = incomeCollected - expenses;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
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
              <Ionicons name={isEditing ? "close" : "chevron-down"} size={24} color={Colors.primaryText} />
            </View>
          </TouchableOpacity>

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
        </View>

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
                      placeholder="Enter address"
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
                    <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>No address added</Text>
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
                      placeholder="Enter phone"
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
                    <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>No phone added</Text>
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
                      placeholder="Enter email"
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
                    <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>No email added</Text>
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
              <View style={[styles.financialCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.iconBadge, { backgroundColor: '#3B82F6' + '15' }]}>
                  <Ionicons name="document-text" size={18} color="#3B82F6" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Contract</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${contractAmount.toLocaleString()}
                </Text>
              </View>

              {/* Income Collected */}
              <TouchableOpacity
                style={[styles.financialCard, { backgroundColor: Colors.white }]}
                onPress={() => {
                  if (navigation) {
                    navigation.navigate('ProjectTransactions', {
                      projectId: project.id,
                      projectName: project.name,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBadge, { backgroundColor: '#10B981' + '15' }]}>
                  <Ionicons name="cash" size={18} color="#10B981" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Income</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${incomeCollected.toLocaleString()}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Row: Expenses & Profit */}
            <View style={styles.financialRow}>
              {/* Expenses */}
              <TouchableOpacity
                style={[styles.financialCard, { backgroundColor: Colors.white }]}
                onPress={() => {
                  if (navigation) {
                    navigation.navigate('ProjectTransactions', {
                      projectId: project.id,
                      projectName: project.name,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                  <Ionicons name="trending-down" size={18} color="#EF4444" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Expenses</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${expenses.toLocaleString()}
                </Text>
              </TouchableOpacity>

              {/* Profit */}
              <View style={[styles.financialCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.iconBadge, { backgroundColor: profit >= 0 ? '#10B981' + '15' : '#EF4444' + '15' }]}>
                  <Ionicons name={profit >= 0 ? "trending-up" : "trending-down"} size={18} color={profit >= 0 ? "#10B981" : "#EF4444"} />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Profit</Text>
                <Text style={[styles.financialValue, { color: profit >= 0 ? '#10B981' : '#EF4444' }]} numberOfLines={1}>
                  ${profit.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {/* Project Details Section */}
          {(project.taskDescription || project.location || project.clientPhone) && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Project Details</Text>

              {project.taskDescription && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="document-text-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Description</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{project.taskDescription}</Text>
                  </View>
                </View>
              )}

              {project.location && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="location-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Location</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{project.location}</Text>
                  </View>
                </View>
              )}

              {project.clientPhone && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="call-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Client Phone</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryBlue }]}>{project.clientPhone}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Project Phases Section */}
          {project.hasPhases && phases.length > 0 && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="layers-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>Project Phases</Text>
                {isEditing && (
                  <View style={styles.editingIndicator}>
                    <Text style={[styles.editingIndicatorText, { color: Colors.primaryBlue }]}>Editing</Text>
                  </View>
                )}
              </View>
              <PhaseTimeline
                phases={phases}
                onPhasePress={handlePhasePress}
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

          {/* Assigned Workers Section */}
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                Assigned Workers ({workers.length})
              </Text>
              <TouchableOpacity
                style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => setShowWorkerAssignment(true)}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.assignButtonText}>Assign</Text>
              </TouchableOpacity>
            </View>

            {workers.length === 0 ? (
              <View style={styles.emptyWorkers}>
                <Ionicons name="people-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyWorkersText, { color: Colors.secondaryText }]}>
                  No workers assigned yet
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
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="camera-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                Photos ({totalPhotos})
              </Text>
            </View>

            {loadingPhotos ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>Loading photos...</Text>
              </View>
            ) : totalPhotos === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="images-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  No photos yet
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  Photos from daily reports will appear here
                </Text>
              </View>
            ) : (
              <>
                {/* Phase Filter Tabs */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoFilterScroll}
                  contentContainerStyle={styles.photoFilterContainer}
                >
                  <TouchableOpacity
                    style={[
                      styles.photoFilterTab,
                      selectedPhotoFilter === 'all' && styles.photoFilterTabActive,
                      { borderColor: selectedPhotoFilter === 'all' ? Colors.primaryBlue : Colors.border }
                    ]}
                    onPress={() => {
                      setSelectedPhotoFilter('all');
                      setVisiblePhotosCount(12);
                    }}
                  >
                    <Text style={[
                      styles.photoFilterTabText,
                      { color: selectedPhotoFilter === 'all' ? Colors.primaryBlue : Colors.secondaryText }
                    ]}>
                      All ({totalPhotos})
                    </Text>
                  </TouchableOpacity>
                  {Object.entries(photosByPhase).map(([phaseId, data]) => (
                    <TouchableOpacity
                      key={phaseId}
                      style={[
                        styles.photoFilterTab,
                        selectedPhotoFilter === phaseId && styles.photoFilterTabActive,
                        { borderColor: selectedPhotoFilter === phaseId ? Colors.primaryBlue : Colors.border }
                      ]}
                      onPress={() => {
                        setSelectedPhotoFilter(phaseId);
                        setVisiblePhotosCount(12);
                      }}
                    >
                      <Text style={[
                        styles.photoFilterTabText,
                        { color: selectedPhotoFilter === phaseId ? Colors.primaryBlue : Colors.secondaryText }
                      ]}>
                        {data.phaseName} ({data.photos.length})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Photo Grid */}
                <View style={styles.photoGrid}>
                  {(() => {
                    // Get photos based on filter
                    let photosToShow = [];
                    if (selectedPhotoFilter === 'all') {
                      Object.values(photosByPhase).forEach(data => {
                        photosToShow = [...photosToShow, ...data.photos];
                      });
                    } else if (photosByPhase[selectedPhotoFilter]) {
                      photosToShow = photosByPhase[selectedPhotoFilter].photos;
                    }

                    const visiblePhotos = photosToShow.slice(0, visiblePhotosCount);
                    const hasMore = photosToShow.length > visiblePhotosCount;

                    return (
                      <>
                        {visiblePhotos.map((photo, index) => (
                          <TouchableOpacity
                            key={`${photo.reportId}-${index}`}
                            style={styles.photoThumbnailContainer}
                            onPress={() => setSelectedPhoto(photo)}
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
                              Load More ({photosToShow.length - visiblePhotosCount} more)
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

          {/* Estimates Section */}
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                Estimates ({projectEstimates.length})
              </Text>
              <TouchableOpacity
                style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => {
                  // Navigate to chat with context to create estimate
                  if (navigation) {
                    onClose();
                    navigation.navigate('Chat', {
                      initialMessage: `Create estimate for ${project.name}`
                    });
                  }
                }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.assignButtonText}>Create</Text>
              </TouchableOpacity>
            </View>

            {loadingEstimates ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>Loading estimates...</Text>
              </View>
            ) : projectEstimates.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="document-text-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  No estimates yet
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  Create an estimate to add pricing for this project
                </Text>
              </View>
            ) : (
              <View style={styles.estimatesList}>
                {projectEstimates.map((estimate) => (
                  <TouchableOpacity
                    key={estimate.id}
                    style={[styles.estimateCard, { backgroundColor: Colors.lightGray }]}
                    onPress={() => {
                      if (navigation) {
                        onClose();
                        navigation.navigate('EstimateDetail', { estimateId: estimate.id });
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

          {/* Timeline Section */}
          {(project.startDate || project.endDate || isEditing) && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>Timeline</Text>
                {isEditing && (
                  <View style={styles.editingIndicator}>
                    <Text style={[styles.editingIndicatorText, { color: Colors.primaryBlue }]}>Editing</Text>
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
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Start Date</Text>
                    <View style={[styles.dateEditButton, { borderColor: Colors.border }]}>
                      <Text style={[styles.dateEditText, { color: editStartDate ? Colors.primaryText : Colors.secondaryText }]}>
                        {editStartDate ? editStartDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        }) : 'Tap to set date'}
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
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Start Date</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {new Date(project.startDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
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
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>End Date</Text>
                    <View style={[styles.dateEditButton, { borderColor: Colors.border }]}>
                      <Text style={[styles.dateEditText, { color: editEndDate ? Colors.primaryText : Colors.secondaryText }]}>
                        {editEndDate ? editEndDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        }) : 'Tap to set date'}
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
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>End Date</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {new Date(project.endDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
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
            </View>
          )}


          {/* Delete Project Section */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: '#EF4444' + '30' }]}>
            <View style={styles.dangerZoneHeader}>
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text style={[styles.dangerZoneTitle, { color: '#EF4444' }]}>Danger Zone</Text>
            </View>
            <Text style={[styles.dangerZoneDescription, { color: Colors.secondaryText }]}>
              Deleting this project will permanently remove all associated data, phases, and tasks. This action cannot be undone.
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteProject}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>Delete Project</Text>
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

      {/* Full-Screen Photo Modal */}
      <Modal
        visible={!!selectedPhoto}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.photoModalOverlay}>
          <SafeAreaView style={styles.photoModalContainer}>
            {/* Photo Modal Header */}
            <View style={styles.photoModalHeader}>
              <TouchableOpacity
                style={styles.photoModalCloseButton}
                onPress={() => setSelectedPhoto(null)}
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              {selectedPhoto && (
                <View style={styles.photoModalInfo}>
                  <Text style={styles.photoModalDate}>
                    {new Date(selectedPhoto.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* Full-Screen Photo */}
            {selectedPhoto && (
              <View style={styles.photoModalImageContainer}>
                <Image
                  source={{ uri: selectedPhoto.url }}
                  style={styles.photoModalImage}
                  resizeMode="contain"
                />
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Progress Override Modal */}
      <Modal
        visible={showProgressOverride}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProgressOverride(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.progressModalOverlay}
        >
          <TouchableOpacity
            style={styles.progressModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowProgressOverride(false)}
          />
          <View style={[styles.progressModalContent, { backgroundColor: Colors.white }]}>
            <View style={styles.progressModalHeader}>
              <Text style={[styles.progressModalTitle, { color: Colors.primaryText }]}>
                Update Progress
              </Text>
              <TouchableOpacity onPress={() => setShowProgressOverride(false)}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>

            <View style={styles.progressModalBody}>
              {/* Progress Display */}
              <View style={styles.progressDisplay}>
                <Text style={[styles.progressDisplayValue, { color: Colors.primaryBlue }]}>
                  {overrideProgress}%
                </Text>
                <Text style={[styles.progressDisplayLabel, { color: Colors.secondaryText }]}>
                  Work Complete
                </Text>
              </View>

              {/* Slider */}
              <View style={styles.sliderContainer}>
                <Text style={[styles.sliderLabel, { color: Colors.secondaryText }]}>0%</Text>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${overrideProgress}%`, backgroundColor: Colors.primaryBlue }]} />
                  <TouchableOpacity
                    style={[styles.sliderThumb, { left: `${overrideProgress}%`, backgroundColor: Colors.primaryBlue }]}
                    activeOpacity={1}
                  />
                </View>
                <Text style={[styles.sliderLabel, { color: Colors.secondaryText }]}>100%</Text>
              </View>

              {/* Number Input */}
              <View style={styles.inputRow}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>Progress %</Text>
                <TextInput
                  style={[styles.progressInput, {
                    color: Colors.primaryText,
                    backgroundColor: Colors.lightGray,
                    borderColor: Colors.border
                  }]}
                  value={String(overrideProgress)}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setOverrideProgress(Math.min(100, Math.max(0, num)));
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              {/* Override Indicator */}
              {project?.progress_override && (
                <View style={styles.overrideIndicator}>
                  <Ionicons name="information-circle" size={16} color="#F59E0B" />
                  <Text style={styles.overrideIndicatorText}>
                    Progress is manually set. Tap "Reset to Automatic" to use task-based calculation.
                  </Text>
                </View>
              )}

              {/* Buttons */}
              <View style={styles.progressModalButtons}>
                {project?.progress_override && (
                  <TouchableOpacity
                    style={[styles.progressButton, styles.resetButton]}
                    onPress={handleResetToAutomatic}
                    disabled={savingProgress}
                  >
                    <Ionicons name="refresh" size={18} color="#6B7280" />
                    <Text style={styles.resetButtonText}>Reset to Automatic</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.progressButton, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={handleSaveProgressOverride}
                  disabled={savingProgress}
                >
                  <Text style={styles.saveButtonText}>
                    {savingProgress ? 'Saving...' : 'Save Progress'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
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
          <View style={[styles.datePickerModalContent, { backgroundColor: Colors.white }]}>
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
                {showStartDatePicker ? 'Start Date' : 'End Date'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowStartDatePicker(false);
                  setShowEndDatePicker(false);
                }}
              >
                <Text style={[styles.datePickerDoneText, { color: Colors.primaryBlue }]}>Done</Text>
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
    height: 200,
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
});
