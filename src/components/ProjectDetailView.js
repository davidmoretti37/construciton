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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjectPhases, getProjectWorkers } from '../utils/storage';
import PhaseTimeline from './PhaseTimeline';
import WorkerAssignmentModal from './WorkerAssignmentModal';
import { supabase } from '../lib/supabase';

export default function ProjectDetailView({ visible, project, onClose, onEdit, onAction, navigation, onDelete }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [phases, setPhases] = useState([]);
  const [loadingPhases, setLoadingPhases] = useState(false);

  // Contact edit modal
  const [showEditContact, setShowEditContact] = useState(false);
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Workers
  const [workers, setWorkers] = useState([]);
  const [showWorkerAssignment, setShowWorkerAssignment] = useState(false);

  // Expanded phase for showing tasks
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);

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
      }
    };

    if (visible) {
      loadData();
      // Populate contact edit fields
      setEditAddress(project?.location || '');
      setEditPhone(project?.client_phone || project?.clientPhone || '');
      setEditEmail(project?.client_email || project?.clientEmail || '');
    }
  }, [project?.id, project?.hasPhases, visible]);

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

  const handleSaveContact = async () => {
    try {
      setSavingContact(true);

      const { error } = await supabase
        .from('projects')
        .update({
          location: editAddress || null,
          client_phone: editPhone || null,
          client_email: editEmail || null,
        })
        .eq('id', project.id);

      if (error) throw error;

      // Update local project object
      if (project) {
        project.location = editAddress;
        project.client_phone = editPhone;
        project.client_email = editEmail;
      }

      setShowEditContact(false);
      Alert.alert('Success', 'Contact information updated');
    } catch (error) {
      console.error('Error saving contact:', error);
      Alert.alert('Error', 'Failed to save contact information');
    } finally {
      setSavingContact(false);
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
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <View style={[styles.closeIconContainer, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="chevron-down" size={24} color={Colors.primaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={onEdit} style={styles.editButton}>
            <View style={[styles.editIconContainer, { backgroundColor: Colors.primaryBlue }]}>
              <Ionicons name="create-outline" size={20} color={Colors.white} />
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
                {project.location ? (
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

                {project.client_phone || project.clientPhone ? (
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

                {project.client_email || project.clientEmail ? (
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

                {/* Edit Contact Info Button */}
                <TouchableOpacity
                  style={styles.editContactButton}
                  onPress={() => setShowEditContact(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.editContactText}>Edit Contact Info</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Progress Badge */}
            <View style={styles.progressRing}>
              <Text style={styles.progressRingText}>{progressPercent}%</Text>
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
              <View style={[styles.financialCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.iconBadge, { backgroundColor: '#10B981' + '15' }]}>
                  <Ionicons name="cash" size={18} color="#10B981" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Income</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${incomeCollected.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Bottom Row: Expenses & Profit */}
            <View style={styles.financialRow}>
              {/* Expenses */}
              <View style={[styles.financialCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.iconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                  <Ionicons name="trending-down" size={18} color="#EF4444" />
                </View>
                <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Expenses</Text>
                <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                  ${expenses.toLocaleString()}
                </Text>
              </View>

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
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8 }]}>Project Phases</Text>
              </View>
              <PhaseTimeline
                phases={phases}
                onPhasePress={handlePhasePress}
                compact={false}
                expandedPhaseId={expandedPhaseId}
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

          {/* Timeline Section */}
          {(project.startDate || project.endDate) && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Timeline</Text>

              {project.startDate && (
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
              )}

              {project.endDate && (
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
              )}

              {project.daysRemaining !== null && project.daysRemaining !== undefined && (
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

      {/* Edit Contact Info Modal */}
      <Modal
        visible={showEditContact}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditContact(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.editContactModal, { backgroundColor: Colors.background }]}
        >
          <SafeAreaView style={{ flex: 1 }}>
            {/* Modal Header */}
            <View style={[styles.editContactHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowEditContact(false)}>
                <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.editContactTitle, { color: Colors.primaryText }]}>Edit Contact Info</Text>
              <TouchableOpacity onPress={handleSaveContact} disabled={savingContact}>
                <Text style={[styles.modalSaveText, { color: Colors.primaryBlue, opacity: savingContact ? 0.5 : 1 }]}>
                  {savingContact ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            <ScrollView style={styles.editContactContent} showsVerticalScrollIndicator={false}>
              <View style={styles.editContactSection}>
                <Text style={[styles.editContactLabel, { color: Colors.secondaryText }]}>
                  <Ionicons name="location" size={16} color={Colors.primaryBlue} /> Address
                </Text>
                <TextInput
                  style={[styles.editContactInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={editAddress}
                  onChangeText={setEditAddress}
                  placeholder="123 Main St, City, State 12345"
                  placeholderTextColor={Colors.secondaryText}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.editContactSection}>
                <Text style={[styles.editContactLabel, { color: Colors.secondaryText }]}>
                  <Ionicons name="call" size={16} color={Colors.primaryBlue} /> Phone Number
                </Text>
                <TextInput
                  style={[styles.editContactInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.editContactSection}>
                <Text style={[styles.editContactLabel, { color: Colors.secondaryText }]}>
                  <Ionicons name="mail" size={16} color={Colors.primaryBlue} /> Email Address
                </Text>
                <TextInput
                  style={[styles.editContactInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="client@email.com"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
                  Tap on the address, phone, or email in the project header to quickly access maps, call, or email.
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Worker Assignment Modal */}
      <WorkerAssignmentModal
        visible={showWorkerAssignment}
        onClose={() => setShowWorkerAssignment(false)}
        assignmentType="project"
        assignmentId={project?.id}
        assignmentName={project?.name}
        onAssignmentsChange={handleWorkersUpdated}
      />
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
  editContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  editContactText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
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
});
