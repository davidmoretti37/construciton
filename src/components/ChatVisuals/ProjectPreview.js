import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, TextInput, Alert, ActionSheetIOS, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
// TODO: Implement project PDF utilities if needed
// import { shareProjectPDF, emailProjectPDF, smsProjectPDF } from '../../utils/projectPDF';

export default function ProjectPreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(data);

  const {
    projectNumber,
    client,
    clientName,
    clientPhone,
    client_phone,
    projectName,
    date,
    services = [],
    phases = [],
    schedule = {},
    scope = {},
    businessName,
    status,
  } = isEditing ? editedData : data;

  // Extract client name - handle both string and object formats
  const displayClientName = clientName || (typeof client === 'string' ? client : client?.name) || 'N/A';

  // Get phone number from any possible field
  const phoneNumber = clientPhone || client_phone || client?.phone || data.phone;

  // Toggle phase expansion
  const togglePhase = (phaseIndex) => {
    setExpandedPhases(prev => ({
      ...prev,
      [phaseIndex]: !prev[phaseIndex]
    }));
  };

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Edit mode handlers
  const handleStartEdit = () => {
    setEditedData({ ...data });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedData(data);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    const newPhases = editedData.phases || phases;
    const newServices = editedData.services || services;

    const updatedData = {
      ...data,
      ...editedData,
      phases: newPhases,
      services: newServices,
    };

    if (onAction) {
      const actionType = data.id ? 'update-project' : 'save-project';
      onAction({ type: actionType, data: updatedData });
    }
    setIsEditing(false);
  };

  const handleUpdateService = (index, value) => {
    const newServices = [...(editedData.services || services)];
    newServices[index] = { ...newServices[index], description: value };
    setEditedData({ ...editedData, services: newServices });
  };

  const handleAddService = () => {
    const newServices = [...(editedData.services || services)];
    newServices.push({ description: '' });
    setEditedData({ ...editedData, services: newServices });
  };

  const handleRemoveService = (index) => {
    const newServices = [...(editedData.services || services)];
    newServices.splice(index, 1);
    setEditedData({ ...editedData, services: newServices });
  };

  const handleUpdatePhase = (phaseIndex, field, value) => {
    const newPhases = [...(editedData.phases || phases)];
    newPhases[phaseIndex] = { ...newPhases[phaseIndex], [field]: value };
    setEditedData({ ...editedData, phases: newPhases });
  };

  // Task management handlers
  const handleUpdateTask = (phaseIndex, taskIndex, value) => {
    const newPhases = [...(editedData.phases || phases)];
    const newTasks = [...newPhases[phaseIndex].tasks];
    newTasks[taskIndex] = { ...newTasks[taskIndex], description: value };
    newPhases[phaseIndex] = { ...newPhases[phaseIndex], tasks: newTasks };
    setEditedData({ ...editedData, phases: newPhases });
  };

  const handleAddTask = (phaseIndex) => {
    const newPhases = [...(editedData.phases || phases)];
    const phase = newPhases[phaseIndex];
    const newTask = {
      id: Date.now().toString(),
      order: (phase.tasks?.length || 0) + 1,
      description: '',
      completed: false
    };
    newPhases[phaseIndex] = {
      ...phase,
      tasks: [...(phase.tasks || []), newTask]
    };
    setEditedData({ ...editedData, phases: newPhases });
  };

  const handleRemoveTask = (phaseIndex, taskIndex) => {
    const newPhases = [...(editedData.phases || phases)];
    const newTasks = [...newPhases[phaseIndex].tasks];
    newTasks.splice(taskIndex, 1);
    // Re-order remaining tasks
    newTasks.forEach((task, idx) => {
      task.order = idx + 1;
    });
    newPhases[phaseIndex] = { ...newPhases[phaseIndex], tasks: newTasks };
    setEditedData({ ...editedData, phases: newPhases });
  };

  // Scope update handler
  const handleUpdateScope = (field, value) => {
    const newScope = { ...(editedData.scope || scope), [field]: value };
    setEditedData({ ...editedData, scope: newScope });
  };

  // Schedule update handlers
  const handleUpdatePhaseSchedule = (phaseIndex, field, value) => {
    const newSchedule = { ...(editedData.schedule || schedule) };
    const newPhaseSchedule = [...(newSchedule.phaseSchedule || [])];
    newPhaseSchedule[phaseIndex] = { ...newPhaseSchedule[phaseIndex], [field]: value };
    newSchedule.phaseSchedule = newPhaseSchedule;
    setEditedData({ ...editedData, schedule: newSchedule });
  };

  const handleUpdateOverallSchedule = (field, value) => {
    const newSchedule = { ...(editedData.schedule || schedule), [field]: value };
    setEditedData({ ...editedData, schedule: newSchedule });
  };

  // Date update handler
  const handleUpdateDate = (value) => {
    setEditedData({ ...editedData, date: value });
  };

  // Format project as text for sharing
  const formatProjectText = () => {
    let text = `📋 PROJECT${projectNumber ? ` ${projectNumber}` : ''}\n`;
    if (businessName) {
      text += `${businessName}\n`;
    }
    text += `\n`;
    text += `Client: ${displayClientName}\n`;
    if (projectName) {
      text += `Project: ${projectName}\n`;
    }
    text += `Date: ${date}\n\n`;

    text += `SERVICES:\n`;
    services.forEach((service, index) => {
      const cleanDescription = service.description?.replace(/^undefined\.\s*/i, '').trim() || service.description;
      text += `${index + 1}. ${cleanDescription}\n`;
    });

    return text;
  };

  const handleShare = async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Show action sheet with options
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Share PDF', 'Email PDF', 'Text PDF'],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              // Share PDF - TODO: Implement shareProjectPDF
              Alert.alert('Coming Soon', 'PDF sharing will be available soon');
            } else if (buttonIndex === 2) {
              // Email PDF - TODO: Implement emailProjectPDF
              Alert.alert('Coming Soon', 'Email sharing will be available soon');
            } else if (buttonIndex === 3) {
              // Text PDF - TODO: Implement smsProjectPDF
              Alert.alert('Coming Soon', 'SMS sharing will be available soon');
            }
          }
        );
      } else {
        // Android: Show alert with options
        Alert.alert(
          'Share Project',
          'How would you like to send this project?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Share PDF',
              onPress: async () => Alert.alert('Coming Soon', 'PDF sharing will be available soon')
            },
            {
              text: 'Email PDF',
              onPress: async () => Alert.alert('Coming Soon', 'Email sharing will be available soon')
            },
            {
              text: 'Text PDF',
              onPress: async () => Alert.alert('Coming Soon', 'SMS sharing will be available soon')
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error sharing project:', error);
      Alert.alert('Error', 'Failed to share project. Please try again.');
    }
  };

  const handleEdit = () => {
    if (onAction) {
      onAction({ label: 'Edit', type: 'edit-project', data });
    }
  };

  const handleConvertToInvoice = () => {
    if (onAction) {
      onAction({ label: 'Convert to Invoice', type: 'convert-project-to-invoice', data });
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'draft':
        return '#9CA3AF'; // Gray
      case 'sent':
        return '#3B82F6'; // Blue
      case 'viewed':
        return '#8B5CF6'; // Purple
      case 'accepted':
        return '#22C55E'; // Green
      case 'rejected':
        return '#EF4444'; // Red
      case 'expired':
        return '#F59E0B'; // Orange
      default:
        return Colors.secondaryText;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'draft':
        return 'document-outline';
      case 'sent':
        return 'send-outline';
      case 'viewed':
        return 'eye-outline';
      case 'accepted':
        return 'checkmark-circle';
      case 'rejected':
        return 'close-circle';
      case 'expired':
        return 'time-outline';
      default:
        return 'document-outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            📋 PROJECT
          </Text>
          {projectNumber && (
            <Text style={[styles.projectNumber, { color: Colors.primaryBlue }]}>
              {projectNumber}
            </Text>
          )}
          {businessName && (
            <Text style={[styles.businessName, { color: Colors.secondaryText }]}>
              {businessName}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {!isEditing ? (
            <>
              <TouchableOpacity
                style={[styles.editIconButton, { backgroundColor: Colors.primaryBlue + '15' }]}
                onPress={handleStartEdit}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
              </TouchableOpacity>
              {status && (
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '15', borderColor: getStatusColor() }]}>
                  <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
                  <Text style={[styles.statusText, { color: getStatusColor() }]}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity onPress={handleCancelEdit} style={styles.editActionButton}>
                <Ionicons name="close" size={20} color={Colors.error} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.editActionButton}>
                <Ionicons name="checkmark" size={20} color={Colors.success} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Client Info */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Client:</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{displayClientName}</Text>
        </View>
        {projectName && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>Project:</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{projectName}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Date:</Text>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, styles.value, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={date}
              onChangeText={handleUpdateDate}
              placeholder="MM/DD/YYYY"
              placeholderTextColor={Colors.secondaryText}
            />
          ) : (
            <Text style={[styles.value, { color: Colors.primaryText }]}>{date}</Text>
          )}
        </View>
      </View>

      {/* Scope Summary */}
      {scope && scope.description && (
        <View style={[styles.section, { borderTopColor: Colors.border, backgroundColor: Colors.primaryBlue + '08' }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>SCOPE</Text>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, styles.scopeText, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={scope.description}
              onChangeText={(value) => handleUpdateScope('description', value)}
              placeholder="Project scope description"
              placeholderTextColor={Colors.secondaryText}
              multiline
              numberOfLines={3}
            />
          ) : (
            <Text style={[styles.scopeText, { color: Colors.primaryText }]}>{scope.description}</Text>
          )}
          {scope.complexity && (
            <View style={styles.complexityBadge}>
              <Text style={[styles.complexityText, { color: Colors.secondaryText }]}>
                Complexity: <Text style={{ fontWeight: '600' }}>{scope.complexity}</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Phase Breakdown */}
      {phases && phases.length > 0 && (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>PROJECT PHASES</Text>
          {phases.map((phase, index) => (
            <View key={index} style={[styles.phaseCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
              <TouchableOpacity
                style={styles.phaseHeader}
                onPress={() => togglePhase(index)}
                activeOpacity={0.7}
              >
                <View style={styles.phaseHeaderLeft}>
                  <Ionicons
                    name={expandedPhases[index] ? "chevron-down" : "chevron-forward"}
                    size={20}
                    color={Colors.primaryBlue}
                  />
                  <Text style={[styles.phaseName, { color: Colors.primaryText }]}>{phase.name}</Text>
                </View>
                <View style={[styles.phaseBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.primaryBlue} />
                  {isEditing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.editInputTiny, { color: Colors.primaryBlue, borderColor: Colors.primaryBlue }]}
                        value={(phase.plannedDays || phase.duration || 0).toString()}
                        onChangeText={(value) => handleUpdatePhase(index, 'plannedDays', parseInt(value) || 0)}
                        keyboardType="numeric"
                        placeholder="0"
                      />
                      <Text style={[styles.phaseDays, { color: Colors.primaryBlue }]}>days</Text>
                    </View>
                  ) : (
                    <Text style={[styles.phaseDays, { color: Colors.primaryBlue }]}>
                      {phase.plannedDays || phase.duration || 0} days
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              {expandedPhases[index] && (
                <View style={styles.phaseContent}>
                  {/* Tasks List */}
                  {phase.tasks && phase.tasks.length > 0 && (
                    <View style={styles.tasksSection}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs }}>
                        <Text style={[styles.tasksTitle, { color: Colors.secondaryText }]}>Tasks:</Text>
                        {isEditing && (
                          <TouchableOpacity
                            onPress={() => handleAddTask(index)}
                            style={[styles.addTaskButton, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue }]}
                          >
                            <Ionicons name="add" size={14} color={Colors.primaryBlue} />
                            <Text style={[styles.addTaskText, { color: Colors.primaryBlue }]}>Add Task</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {phase.tasks.map((task, taskIndex) => (
                        <View key={taskIndex} style={styles.taskRow}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.secondaryText} />
                          {isEditing ? (
                            <>
                              <TextInput
                                style={[styles.editInput, styles.taskText, { color: Colors.primaryText, borderColor: Colors.border }]}
                                value={task.description}
                                onChangeText={(value) => handleUpdateTask(index, taskIndex, value)}
                                placeholder="Task description"
                                placeholderTextColor={Colors.secondaryText}
                                multiline
                              />
                              <TouchableOpacity
                                onPress={() => handleRemoveTask(index, taskIndex)}
                                style={styles.removeTaskButton}
                              >
                                <Ionicons name="close-circle" size={20} color="#EF4444" />
                              </TouchableOpacity>
                            </>
                          ) : (
                            <Text style={[styles.taskText, { color: Colors.primaryText }]}>
                              {task.description}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Phase Timeline */}
                  {schedule.phaseSchedule && schedule.phaseSchedule[index] && (
                    <View style={styles.phaseTimeline}>
                      <Ionicons name="time-outline" size={14} color={Colors.secondaryText} />
                      {isEditing ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                          <TextInput
                            style={[styles.editInputSmall, { color: Colors.secondaryText, borderColor: Colors.border, flex: 1 }]}
                            value={schedule.phaseSchedule[index].startDate}
                            onChangeText={(value) => handleUpdatePhaseSchedule(index, 'startDate', value)}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={Colors.secondaryText}
                          />
                          <Text style={[styles.phaseTimelineText, { color: Colors.secondaryText }]}>→</Text>
                          <TextInput
                            style={[styles.editInputSmall, { color: Colors.secondaryText, borderColor: Colors.border, flex: 1 }]}
                            value={schedule.phaseSchedule[index].endDate}
                            onChangeText={(value) => handleUpdatePhaseSchedule(index, 'endDate', value)}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={Colors.secondaryText}
                          />
                        </View>
                      ) : (
                        <Text style={[styles.phaseTimelineText, { color: Colors.secondaryText }]}>
                          {formatDate(schedule.phaseSchedule[index].startDate)} → {formatDate(schedule.phaseSchedule[index].endDate)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {/* Overall Timeline */}
          {schedule.startDate && schedule.projectdEndDate && (
            <View style={[styles.overallTimeline, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}>
              <Ionicons name="calendar" size={18} color={Colors.primaryBlue} />
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineLabel, { color: Colors.primaryText }]}>Project Timeline</Text>
                {isEditing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      style={[styles.editInputSmall, { color: Colors.primaryBlue, borderColor: Colors.primaryBlue, flex: 1 }]}
                      value={schedule.startDate}
                      onChangeText={(value) => handleUpdateOverallSchedule('startDate', value)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.primaryBlue + '80'}
                    />
                    <Text style={[styles.timelineText, { color: Colors.primaryBlue }]}>→</Text>
                    <TextInput
                      style={[styles.editInputSmall, { color: Colors.primaryBlue, borderColor: Colors.primaryBlue, flex: 1 }]}
                      value={schedule.projectdEndDate}
                      onChangeText={(value) => handleUpdateOverallSchedule('projectdEndDate', value)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.primaryBlue + '80'}
                    />
                  </View>
                ) : (
                  <Text style={[styles.timelineText, { color: Colors.primaryBlue }]}>
                    {formatDate(schedule.startDate)} → {formatDate(schedule.projectdEndDate)}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Services */}
      {(services && services.length > 0) || isEditing ? (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>SERVICES</Text>
            {isEditing && (
              <TouchableOpacity
                onPress={handleAddService}
                style={[styles.addTaskButton, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue }]}
              >
                <Ionicons name="add" size={14} color={Colors.primaryBlue} />
                <Text style={[styles.addTaskText, { color: Colors.primaryBlue }]}>Add Service</Text>
              </TouchableOpacity>
            )}
          </View>
          {(isEditing ? (editedData.services || services) : services).map((service, index) => (
            <View key={index} style={styles.lineItem}>
              <View style={styles.itemHeader}>
                <Text style={[styles.itemNumber, { color: Colors.secondaryText }]}>
                  {index + 1}.
                </Text>
                {isEditing ? (
                  <>
                    <TextInput
                      style={[styles.editInput, styles.itemDescription, { color: Colors.primaryText, borderColor: Colors.border }]}
                      value={service.description?.replace(/^undefined\.\s*/i, '').trim() || service.description || ''}
                      onChangeText={(value) => handleUpdateService(index, value)}
                      placeholder="Service description"
                      placeholderTextColor={Colors.secondaryText}
                    />
                    <TouchableOpacity
                      onPress={() => handleRemoveService(index)}
                      style={styles.removeTaskButton}
                    >
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.itemDescription, { color: Colors.primaryText }]}>
                    {service.description?.replace(/^undefined\.\s*/i, '').trim() || service.description}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {isEditing ? (
          <>
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: Colors.secondaryText, flex: 1 }]}
              onPress={handleCancelEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="close-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: Colors.primaryBlue, flex: 1 }]}
              onPress={handleSaveEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Save Changes</Text>
            </TouchableOpacity>
          </>
        ) : status === 'accepted' ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleConvertToInvoice}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Convert to Invoice</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => {
              if (onAction) {
                onAction({ type: 'save-project', data: data });
              }
            }}
          >
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Save Project</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer Note */}
      {status === 'accepted' && (
        <Text style={[styles.footerNote, { color: Colors.secondaryText }]}>
          Accepted - Ready to convert to invoice
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderBottomWidth: 2,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 2,
  },
  projectNumber: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: 2,
  },
  businessName: {
    fontSize: FontSizes.small,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 4,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  editButton: {
    padding: Spacing.xs,
  },
  section: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSizes.small,
    width: 70,
  },
  value: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  lineItem: {
    marginBottom: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  itemNumber: {
    fontSize: FontSizes.small,
    width: 20,
  },
  itemDescription: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    flex: 1,
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
  },
  itemCalc: {
    fontSize: FontSizes.tiny,
  },
  itemTotal: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  costBreakdown: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  breakdownLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderTopWidth: 2,
  },
  totalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  totalAmount: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  primaryButton: {
    width: '100%',
  },
  smsButton: {
    // Already has backgroundColor from style prop
  },
  whatsappButton: {
    // Already has backgroundColor from style prop
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: FontSizes.tiny,
    textAlign: 'center',
    paddingBottom: Spacing.md,
  },
  scopeText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  complexityBadge: {
    marginTop: Spacing.xs,
  },
  complexityText: {
    fontSize: FontSizes.tiny,
  },
  phaseCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  phaseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  phaseDays: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  phaseContent: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  tasksSection: {
    marginBottom: Spacing.md,
  },
  tasksTitle: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  taskText: {
    fontSize: FontSizes.small,
    flex: 1,
    lineHeight: 18,
  },
  phaseBudgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    marginTop: Spacing.xs,
  },
  phaseBudgetLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  phaseBudgetAmount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  phaseTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  phaseTimelineText: {
    fontSize: FontSizes.tiny,
  },
  overallTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: 2,
  },
  timelineText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editIconButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 36,
  },
  editInputSmall: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    minWidth: 50,
    textAlign: 'center',
    fontSize: FontSizes.small,
  },
  editableItemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editInputTiny: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    minWidth: 40,
    textAlign: 'center',
    fontSize: FontSizes.tiny,
  },
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  addTaskText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  removeTaskButton: {
    padding: 4,
    marginLeft: Spacing.xs,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editActionButton: {
    padding: Spacing.xs,
  },
});
