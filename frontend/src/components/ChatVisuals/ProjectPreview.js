import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, TextInput, Alert, ActionSheetIOS, Platform, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { shareProjectPDF, emailProjectPDF, smsProjectPDF } from '../../utils/projectPDF';
import WorkingDaysSelector from '../WorkingDaysSelector';

// Normalize project data to ensure phase days match schedule dates
const normalizeProjectData = (projectData) => {
  if (!projectData) return projectData;

  const { phases, schedule } = projectData;
  if (!phases || phases.length === 0) return projectData;

  // Case 1: phaseSchedule exists - calculate days from each phase's dates
  if (schedule?.phaseSchedule && schedule.phaseSchedule.length > 0) {
    const normalizedPhases = phases.map((phase) => {
      const phaseScheduleEntry = schedule.phaseSchedule.find(
        ps => ps.phaseName === phase.name
      );

      if (phaseScheduleEntry?.startDate && phaseScheduleEntry?.endDate) {
        const start = new Date(phaseScheduleEntry.startDate + 'T00:00:00');
        const end = new Date(phaseScheduleEntry.endDate + 'T00:00:00');
        const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        const calculatedDays = Math.max(1, daysDiff);

        if (calculatedDays !== phase.plannedDays) {
          console.log(`📅 [normalize] Fixed "${phase.name}": ${phase.plannedDays} -> ${calculatedDays} days (from phaseSchedule)`);
          return { ...phase, plannedDays: calculatedDays };
        }
      }
      return phase;
    });

    // Validate phaseSchedule aligns with project dates
    const firstPhaseStart = schedule.phaseSchedule[0]?.startDate;
    const lastPhaseEnd = schedule.phaseSchedule[schedule.phaseSchedule.length - 1]?.endDate;
    const projectStart = schedule.startDate;
    const projectEnd = schedule.estimatedEndDate;

    if (firstPhaseStart === projectStart && lastPhaseEnd === projectEnd) {
      // phaseSchedule is aligned, return as-is
      return { ...projectData, phases: normalizedPhases };
    }

    console.log(`📅 [normalize] phaseSchedule misaligned (${firstPhaseStart}→${lastPhaseEnd} vs ${projectStart}→${projectEnd}). Regenerating...`);
    // Fall through to Case 2 to regenerate phaseSchedule with correct dates
  }

  // Case 2: No phaseSchedule OR phaseSchedule misaligned - distribute days proportionally
  const startDate = schedule?.startDate;
  const endDate = schedule?.estimatedEndDate || schedule?.projectdEndDate;

  if (startDate && endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

    // Get total of current phase days
    const totalPhaseDays = phases.reduce((sum, p) => sum + (p.plannedDays || 1), 0);

    // If they already match, no fix needed
    if (totalPhaseDays === totalDays) {
      return projectData;
    }

    console.log(`📅 [normalize] Timeline ${totalDays} days != phases ${totalPhaseDays} days. Redistributing...`);

    // Distribute proportionally using floor for all but last phase
    const scaleFactor = totalDays / totalPhaseDays;
    let remainingDays = totalDays;

    const normalizedPhases = phases.map((phase, index) => {
      const originalDays = phase.plannedDays || 1;

      let scaledDays;
      if (index === phases.length - 1) {
        scaledDays = Math.max(1, remainingDays);
      } else {
        scaledDays = Math.max(1, Math.floor(originalDays * scaleFactor));
        remainingDays -= scaledDays;
      }

      console.log(`📅 [normalize] "${phase.name}": ${originalDays} -> ${scaledDays} days`);
      return { ...phase, plannedDays: scaledDays };
    });

    // Also generate phaseSchedule so it's available for later
    let currentDate = new Date(start);
    const newPhaseSchedule = normalizedPhases.map((phase) => {
      const phaseDays = phase.plannedDays || 1;
      const phaseStart = currentDate.toISOString().split('T')[0];
      currentDate.setDate(currentDate.getDate() + phaseDays - 1);
      const phaseEnd = currentDate.toISOString().split('T')[0];
      currentDate.setDate(currentDate.getDate() + 1);
      return { phaseName: phase.name, startDate: phaseStart, endDate: phaseEnd };
    });

    return {
      ...projectData,
      phases: normalizedPhases,
      schedule: {
        ...schedule,
        phaseSchedule: newPhaseSchedule
      }
    };
  }

  return projectData;
};

export default function ProjectPreview({ data, onAction }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [expandedPhases, setExpandedPhases] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, _setEditedData] = useState(() => normalizeProjectData(data));
  const editedDataRef = useRef(editedData);

  // Custom setter that updates ref IMMEDIATELY (sync) and state (async)
  // This fixes the stale closure issue when user clicks save right after changing a value
  const setEditedData = (newData) => {
    const resolvedData = typeof newData === 'function' ? newData(editedDataRef.current) : newData;
    editedDataRef.current = resolvedData;  // Update ref immediately!
    _setEditedData(resolvedData);          // Update state (triggers re-render)
  };

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState('start'); // 'start' or 'end'
  const [pendingDate, setPendingDate] = useState(null); // Store date while picker is open
  const [isSaving, setIsSaving] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState(null);
  const [isDistributing, setIsDistributing] = useState(false);  // Loading state for AI task distribution

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
    workingDays = [1, 2, 3, 4, 5],
  } = editedData;  // Always use editedData - it's initialized from data and persists after save

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

  // Format date helper - parse as local date to avoid timezone issues
  const formatDate = (dateString) => {
    if (!dateString) return '';
    // Parse year, month, day manually to avoid UTC interpretation
    const [year, month, day] = dateString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Edit mode handlers
  const handleStartEdit = () => {
    setEditedData(normalizeProjectData({ ...data }));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedData(normalizeProjectData(data));
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    // FIX: Use ref to get the LATEST editedData, avoiding stale closure issue
    const latestEditedData = editedDataRef.current;

    const newPhases = latestEditedData.phases || phases;
    const newServices = latestEditedData.services || services;
    const currentSchedule = latestEditedData.schedule || schedule;

    // DEBUG: Log what we're saving
    console.log('🔍 [handleSaveEdit] latestEditedData.schedule:', latestEditedData.schedule);
    console.log('🔍 [handleSaveEdit] currentSchedule:', currentSchedule);
    console.log('🔍 [handleSaveEdit] startDate will be:', currentSchedule?.startDate || data.startDate || data.date);
    console.log('🔍 [handleSaveEdit] endDate will be:', currentSchedule?.estimatedEndDate || currentSchedule?.projectdEndDate || data.endDate);

    const updatedData = {
      ...data,
      ...latestEditedData,
      phases: newPhases,
      services: newServices,
      // Extract schedule dates to top-level so they take precedence over original data
      startDate: currentSchedule?.startDate || data.startDate || data.date,
      endDate: currentSchedule?.estimatedEndDate || currentSchedule?.projectdEndDate || data.endDate,
    };

    console.log('🔍 [handleSaveEdit] Final updatedData.startDate:', updatedData.startDate);
    console.log('🔍 [handleSaveEdit] Final updatedData.endDate:', updatedData.endDate);

    if (onAction) {
      setIsDistributing(true);  // Show loading overlay
      try {
        const actionType = data.id ? 'update-project' : 'save-project';
        await onAction({ type: actionType, data: updatedData });
      } catch (error) {
        console.error('Error saving edit:', error);
      } finally {
        setIsDistributing(false);  // Hide loading overlay
      }
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

  // Handler for phase days change - updates phase and recalculates timeline end date
  const handlePhaseDaysChange = (phaseIndex, newDays) => {
    // Enforce minimum 1 day
    if (isNaN(newDays) || newDays < 1) newDays = 1;

    const currentPhases = editedData.phases || phases;
    const currentSchedule = editedData.schedule || schedule;

    // Update just this phase's days (don't change other phases)
    const updatedPhases = currentPhases.map((phase, i) => {
      if (i === phaseIndex) {
        return { ...phase, plannedDays: newDays };
      }
      return phase;
    });

    // Recalculate timeline end date and phase dates from start date
    const startDate = currentSchedule.startDate;
    if (startDate) {
      let currentDate = new Date(startDate + 'T00:00:00');
      const newPhaseSchedule = updatedPhases.map((phase) => {
        const phaseDays = phase.plannedDays || 1;
        const phaseStart = currentDate.toISOString().split('T')[0];
        currentDate.setDate(currentDate.getDate() + phaseDays - 1);
        const phaseEnd = currentDate.toISOString().split('T')[0];
        currentDate.setDate(currentDate.getDate() + 1);
        return { phaseName: phase.name, startDate: phaseStart, endDate: phaseEnd };
      });

      // New end date is last phase's end date
      const newEndDate = newPhaseSchedule[newPhaseSchedule.length - 1]?.endDate;

      console.log('📅 [handlePhaseDaysChange] Updated:', updatedPhases.map(p => `${p.name}: ${p.plannedDays}`), 'End:', newEndDate);

      setEditedData({
        ...editedData,
        phases: updatedPhases,
        schedule: {
          ...currentSchedule,
          estimatedEndDate: newEndDate,
          projectdEndDate: newEndDate,
          phaseSchedule: newPhaseSchedule
        }
      });
    } else {
      setEditedData({ ...editedData, phases: updatedPhases });
    }
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

  // Open date picker for start or end date
  const openDatePicker = (mode) => {
    const currentSchedule = editedDataRef.current.schedule || schedule;
    const initialDate = mode === 'start'
      ? currentSchedule?.startDate || date
      : currentSchedule?.estimatedEndDate || currentSchedule?.projectdEndDate || date;

    setPendingDate(initialDate ? new Date(initialDate + 'T00:00:00') : new Date());
    setDatePickerMode(mode);
    setShowDatePicker(true);
  };

  // Handle date picker change - just store pending value, don't apply yet
  const handleDatePickerChange = (event, selectedDate) => {
    console.log('📅 [handleDatePickerChange] event type:', event?.type, 'selectedDate:', selectedDate?.toISOString());

    if (Platform.OS === 'android') {
      // On Android, apply immediately and close
      setShowDatePicker(false);
      if (selectedDate) {
        applyDateChange(selectedDate);
      }
    } else if (selectedDate) {
      // On iOS, just update pending date (apply on Done)
      console.log('📅 [handleDatePickerChange] iOS - setting pendingDate to:', selectedDate.toISOString().split('T')[0]);
      setPendingDate(selectedDate);
    }
  };

  // Apply the date change when user taps Done (iOS) or selects (Android)
  const applyDateChange = (selectedDate) => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const currentSchedule = editedDataRef.current.schedule || schedule;
    const currentStartDate = currentSchedule.startDate || date;
    const currentEndDate = currentSchedule.estimatedEndDate || currentSchedule.projectdEndDate;

    console.log('📅 [applyDateChange] Applying date:', dateStr, 'mode:', datePickerMode);

    if (datePickerMode === 'start') {
      handleTimelineChange(dateStr, currentEndDate);
    } else {
      handleTimelineChange(currentStartDate, dateStr);
    }
  };

  // Handle Done button on iOS date picker
  const handleDatePickerDone = () => {
    if (pendingDate) {
      applyDateChange(pendingDate);
    }
    setShowDatePicker(false);
  };

  // Handle timeline change - scales phases to fit user's selected dates
  const handleTimelineChange = (newStartDate, newEndDate) => {
    console.log('📅 [handleTimelineChange] Called with start:', newStartDate, 'end:', newEndDate);
    const currentPhases = editedData.phases || phases;
    const currentSchedule = editedData.schedule || schedule;

    // If no phases, just update the dates
    if (!currentPhases || currentPhases.length === 0) {
      setEditedData({
        ...editedData,
        date: newStartDate,
        schedule: {
          ...currentSchedule,
          startDate: newStartDate,
          estimatedEndDate: newEndDate,
          projectdEndDate: newEndDate,
        }
      });
      return;
    }

    // Calculate total project days from user's selection
    const start = new Date(newStartDate + 'T00:00:00');
    const end = new Date(newEndDate + 'T00:00:00');
    const totalProjectDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

    // Get total planned days from phases
    const totalPhaseDays = currentPhases.reduce((sum, phase) => {
      return sum + (phase.plannedDays || phase.defaultDays || phase.duration || 1);
    }, 0);

    // Scale factor to fit phases into new timeline
    const scaleFactor = totalProjectDays / totalPhaseDays;

    // Distribute days across phases proportionally AND update phase plannedDays
    // Use floor for most phases, give remainder to last phase to ensure total matches exactly
    let currentDate = new Date(start);
    let remainingDays = totalProjectDays;
    const newPhaseSchedule = [];
    const updatedPhases = [];

    currentPhases.forEach((phase, index) => {
      const originalDays = phase.plannedDays || phase.defaultDays || phase.duration || 1;

      // For last phase, give it all remaining days
      let scaledDays;
      if (index === currentPhases.length - 1) {
        scaledDays = Math.max(1, remainingDays);
      } else {
        // Scale proportionally, use floor to not exceed total
        scaledDays = Math.max(1, Math.floor(originalDays * scaleFactor));
        remainingDays -= scaledDays;
      }

      const phaseStart = currentDate.toISOString().split('T')[0];
      currentDate.setDate(currentDate.getDate() + scaledDays - 1);
      const phaseEnd = currentDate.toISOString().split('T')[0];
      currentDate.setDate(currentDate.getDate() + 1); // Move to next day for next phase

      // Add to phase schedule
      newPhaseSchedule.push({
        phaseName: phase.name,
        startDate: phaseStart,
        endDate: phaseEnd
      });

      // Add updated phase with new plannedDays
      updatedPhases.push({
        ...phase,
        plannedDays: scaledDays,
      });
    });

    console.log('📅 [handleTimelineChange] Scaled phases:', updatedPhases.map(p => `${p.name}: ${p.plannedDays} days`));

    // FIX: Use the user's selected end date, not calculated from phases
    console.log('📅 [handleTimelineChange] Setting schedule with startDate:', newStartDate, 'endDate:', newEndDate);
    setEditedData({
      ...editedData,
      date: newStartDate,
      phases: updatedPhases,  // Update phases with new plannedDays
      schedule: {
        ...currentSchedule,
        startDate: newStartDate,
        estimatedEndDate: newEndDate,  // User's selection!
        projectdEndDate: newEndDate,   // User's selection!
        phaseSchedule: newPhaseSchedule
      }
    });
    console.log('📅 [handleTimelineChange] Ref should now have:', editedDataRef.current?.schedule);
  };

  // Working days update handler
  const handleUpdateWorkingDays = (days) => {
    setEditedData({ ...editedData, workingDays: days });
  };

  // Format working days for display
  const formatWorkingDays = (days) => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const sortedDays = [...days].sort((a, b) => a - b);
    return sortedDays.map(d => dayNames[d - 1]).join(', ');
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
      const projectData = isEditing ? editedData : data;

      if (Platform.OS === 'ios') {
        // iOS: Show action sheet with options
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Share PDF', 'Email PDF', 'Text PDF'],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              await shareProjectPDF(projectData);
            } else if (buttonIndex === 2) {
              await emailProjectPDF(projectData, phoneNumber);
            } else if (buttonIndex === 3) {
              await smsProjectPDF(projectData);
            }
          }
        );
      } else {
        // Android: Show alert with options
        Alert.alert(
          t('project.shareProject'),
          t('project.sharePrompt'),
          [
            { text: t('actions.cancel'), style: 'cancel' },
            {
              text: t('project.sharePdf'),
              onPress: async () => await shareProjectPDF(projectData)
            },
            {
              text: t('project.emailPdf'),
              onPress: async () => await emailProjectPDF(projectData, phoneNumber)
            },
            {
              text: t('project.textPdf'),
              onPress: async () => await smsProjectPDF(projectData)
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error sharing project:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToShare', { item: t('project.project') }));
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
            {t('project.projectTitle')}
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
          <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('labels.client')}:</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{displayClientName}</Text>
        </View>
        {projectName && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('labels.project')}:</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{projectName}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('labels.start')}:</Text>
          {isEditing ? (
            <TouchableOpacity
              style={[styles.datePickerButton, { borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
              onPress={() => openDatePicker('start')}
            >
              <Text style={[styles.value, { color: Colors.primaryText }]}>
                {formatDate((editedData.schedule || schedule)?.startDate || date) || t('placeholders.selectDate')}
              </Text>
              <Ionicons name="calendar-outline" size={16} color={Colors.primaryBlue} />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.value, { color: Colors.primaryText }]}>
              {formatDate(schedule?.startDate || date)}
            </Text>
          )}
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('labels.end')}:</Text>
          {isEditing ? (
            <TouchableOpacity
              style={[styles.datePickerButton, { borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
              onPress={() => openDatePicker('end')}
            >
              <Text style={[styles.value, { color: Colors.primaryText }]}>
                {formatDate((editedData.schedule || schedule)?.estimatedEndDate || (editedData.schedule || schedule)?.projectdEndDate) || t('placeholders.selectDate')}
              </Text>
              <Ionicons name="calendar-outline" size={16} color={Colors.primaryBlue} />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.value, { color: Colors.primaryText }]}>
              {formatDate(schedule?.estimatedEndDate || schedule?.projectdEndDate)}
            </Text>
          )}
        </View>
      </View>

      {/* Scope Summary */}
      {scope && scope.description && (
        <View style={[styles.section, { borderTopColor: Colors.border, backgroundColor: Colors.primaryBlue + '08' }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('project.scope')}</Text>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, styles.scopeText, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={scope.description}
              onChangeText={(value) => handleUpdateScope('description', value)}
              placeholder={t('placeholders.projectScopeDescription')}
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
                {t('project.complexity')}: <Text style={{ fontWeight: '600' }}>{scope.complexity}</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Phase Breakdown */}
      {phases && phases.length > 0 && (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('project.projectPhases')}</Text>
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
                        onChangeText={(value) => handlePhaseDaysChange(index, parseInt(value) || 1)}
                        keyboardType="numeric"
                        placeholder="1"
                        selectTextOnFocus={true}
                      />
                      <Text style={[styles.phaseDays, { color: Colors.primaryBlue }]}>{t('project.days')}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.phaseDays, { color: Colors.primaryBlue }]}>
                      {phase.plannedDays || phase.duration || 0} {t('project.days')}
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
                        <Text style={[styles.tasksTitle, { color: Colors.secondaryText }]}>{t('project.tasks')}:</Text>
                        {isEditing && (
                          <TouchableOpacity
                            onPress={() => handleAddTask(index)}
                            style={[styles.addTaskButton, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue }]}
                          >
                            <Ionicons name="add" size={14} color={Colors.primaryBlue} />
                            <Text style={[styles.addTaskText, { color: Colors.primaryBlue }]}>{t('actions.addTask')}</Text>
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
                                placeholder={t('placeholders.taskDescription')}
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

                  {/* Phase Timeline - Read-only, dates calculated from timeline + phase days */}
                  {schedule.phaseSchedule && schedule.phaseSchedule[index] && (
                    <View style={styles.phaseTimeline}>
                      <Ionicons name="time-outline" size={14} color={Colors.secondaryText} />
                      <Text style={[styles.phaseTimelineText, { color: Colors.secondaryText }]}>
                        {formatDate(schedule.phaseSchedule[index].startDate)} → {formatDate(schedule.phaseSchedule[index].endDate)}
                      </Text>
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
                <Text style={[styles.timelineLabel, { color: Colors.primaryText }]}>{t('project.projectTimeline')}</Text>
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

          {/* Working Days */}
          <View style={[styles.workingDaysSection, { backgroundColor: Colors.successGreen + '10', borderColor: Colors.successGreen }]}>
            <View style={styles.workingDaysHeader}>
              <Ionicons name="today-outline" size={18} color={Colors.successGreen} />
              <Text style={[styles.timelineLabel, { color: Colors.primaryText }]}>{t('project.workingDays')}</Text>
            </View>
            {isEditing ? (
              <WorkingDaysSelector
                selectedDays={editedData.workingDays || workingDays}
                onDaysChange={handleUpdateWorkingDays}
              />
            ) : (
              <Text style={[styles.workingDaysText, { color: Colors.successGreen }]}>
                {formatWorkingDays(workingDays)}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Services */}
      {(services && services.length > 0) || isEditing ? (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('project.services')}</Text>
            {isEditing && (
              <TouchableOpacity
                onPress={handleAddService}
                style={[styles.addTaskButton, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue }]}
              >
                <Ionicons name="add" size={14} color={Colors.primaryBlue} />
                <Text style={[styles.addTaskText, { color: Colors.primaryBlue }]}>{t('actions.addService')}</Text>
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
                      placeholder={t('placeholders.serviceDescription')}
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
              <Text style={styles.buttonText}>{t('actions.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: Colors.primaryBlue, flex: 1 }]}
              onPress={handleSaveEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('actions.saveChanges')}</Text>
            </TouchableOpacity>
          </>
        ) : status === 'accepted' ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleConvertToInvoice}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{t('actions.convertToInvoice')}</Text>
          </TouchableOpacity>
        ) : savedProjectId ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => {
              if (onAction) {
                onAction({ type: 'view-project', data: { id: savedProjectId } });
              }
            }}
          >
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{t('actions.viewProject')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }, isSaving && { opacity: 0.7 }]}
            disabled={isSaving}
            onPress={async () => {
              if (onAction) {
                setIsSaving(true);
                try {
                  // Always use editedData which contains latest values (original or edited)
                  const currentSchedule = editedData.schedule || data.schedule;
                  const saveData = {
                    ...data,
                    ...editedData,
                    phases: editedData.phases || data.phases,
                    services: editedData.services || data.services,
                    // FIX: Extract schedule dates to top-level so they take precedence
                    startDate: currentSchedule?.startDate || data.startDate || data.date,
                    endDate: currentSchedule?.estimatedEndDate || currentSchedule?.projectdEndDate || data.endDate,
                  };
                  const result = await onAction({ type: 'save-project', data: saveData });
                  if (result?.projectId) {
                    setSavedProjectId(result.projectId);
                  }
                } catch (error) {
                  console.error('Error saving project:', error);
                } finally {
                  setIsSaving(false);
                }
              }
            }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="save-outline" size={18} color="#fff" />
            )}
            <Text style={styles.buttonText}>{isSaving ? t('actions.saving') : t('actions.saveProject')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer Note */}
      {status === 'accepted' && (
        <Text style={[styles.footerNote, { color: Colors.secondaryText }]}>
          {t('project.acceptedReadyToConvert')}
        </Text>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.datePickerModalOverlay}>
            <TouchableOpacity
              style={styles.datePickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            />
            <View style={[styles.datePickerModalContent, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={[styles.datePickerCancelText, { color: Colors.secondaryText }]}>{t('actions.cancel')}</Text>
                </TouchableOpacity>
                <Text style={[styles.datePickerTitle, { color: Colors.primaryText }]}>
                  {datePickerMode === 'start' ? t('labels.startDate') : t('labels.endDate')}
                </Text>
                <TouchableOpacity onPress={handleDatePickerDone}>
                  <Text style={[styles.datePickerDoneText, { color: Colors.primaryBlue }]}>{t('actions.done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pendingDate || new Date()}
                mode="date"
                display="inline"
                themeVariant="light"
                onChange={handleDatePickerChange}
                accentColor="#3B82F6"
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Loading Overlay for AI Task Distribution */}
      {isDistributing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>{t('messages.organizingTasks')}</Text>
        </View>
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
  workingDaysSection: {
    flexDirection: 'column',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  workingDaysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  workingDaysText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginLeft: 26,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    flex: 1,
    gap: Spacing.xs,
  },
  datePickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  datePickerBackdrop: {
    flex: 1,
  },
  datePickerModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    zIndex: 100,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
});
