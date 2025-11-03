import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import CustomCalendar from './CustomCalendar';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function TimelinePickerModal({ visible, onClose, onConfirm, projectData }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const calculateDuration = (start, end) => {
    if (!start || !end) return 0;
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diffTime = Math.abs(endTime - startTime);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
    return diffDays;
  };

  const onDateSelect = (dateString) => {
    // If no start date or both dates are set, start fresh
    if (!startDate || (startDate && endDate)) {
      setStartDate(dateString);
      setEndDate(null);
    }
    // If start date is set but no end date
    else if (startDate && !endDate) {
      // If selected date is before start date, swap them
      if (new Date(dateString) < new Date(startDate)) {
        setEndDate(startDate);
        setStartDate(dateString);
      }
      // Otherwise, set as end date
      else {
        setEndDate(dateString);
      }
    }
  };

  const handleConfirm = () => {
    if (!startDate || !endDate) {
      return;
    }

    const duration = calculateDuration(startDate, endDate);
    onConfirm({
      startDate: startDate,
      endDate: endDate,
      daysRemaining: duration,
      estimatedDuration: `${duration} days`,
    });

    // Reset state
    setStartDate(null);
    setEndDate(null);
    onClose();
  };

  const handleClose = () => {
    // Reset state
    setStartDate(null);
    setEndDate(null);
    onClose();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Select date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const currentDuration = calculateDuration(startDate, endDate);
  const isConfirmDisabled = !startDate || !endDate;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: Colors.white }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: Colors.primaryText }]}>
                Set Project Timeline
              </Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Project Info */}
            {projectData && (
              <View style={[styles.projectInfo, { backgroundColor: Colors.lightGray }]}>
                <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                  {projectData.name || 'New Project'}
                </Text>
                {projectData.client && (
                  <Text style={[styles.clientName, { color: Colors.secondaryText }]}>
                    Client: {projectData.client}
                  </Text>
                )}
              </View>
            )}

            {/* Instructions */}
            <View style={styles.instructionsContainer}>
              <Text style={[styles.instructionsText, { color: Colors.secondaryText }]}>
                Tap to select start date, then tap again to select end date
              </Text>
            </View>

            {/* Custom Calendar */}
            <View style={[styles.calendarContainer, { backgroundColor: Colors.white }]}>
              <CustomCalendar
                onDateSelect={onDateSelect}
                selectedStart={startDate}
                selectedEnd={endDate}
                theme={Colors}
              />
            </View>

            {/* Selected Dates Summary */}
            <View style={styles.datesSummaryContainer}>
              <View style={styles.dateSummaryRow}>
                <View style={styles.dateSummaryItem}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                  <View style={styles.dateSummaryText}>
                    <Text style={[styles.dateSummaryLabel, { color: Colors.secondaryText }]}>
                      Start Date
                    </Text>
                    <Text style={[styles.dateSummaryValue, { color: Colors.primaryText }]}>
                      {formatDate(startDate)}
                    </Text>
                  </View>
                </View>

                <View style={styles.dateSummaryItem}>
                  <Ionicons name="flag-outline" size={20} color={Colors.primaryBlue} />
                  <View style={styles.dateSummaryText}>
                    <Text style={[styles.dateSummaryLabel, { color: Colors.secondaryText }]}>
                      End Date
                    </Text>
                    <Text style={[styles.dateSummaryValue, { color: Colors.primaryText }]}>
                      {formatDate(endDate)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Duration Summary */}
              {startDate && endDate && (
                <View style={[styles.durationBox, { backgroundColor: Colors.lightGray }]}>
                  <Ionicons name="time-outline" size={24} color={Colors.primaryBlue} />
                  <View style={styles.durationText}>
                    <Text style={[styles.durationNumber, { color: Colors.primaryText }]}>
                      {currentDuration}
                    </Text>
                    <Text style={[styles.durationLabel, { color: Colors.secondaryText }]}>
                      days duration
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { borderColor: Colors.border }]}
              onPress={handleClose}
            >
              <Text style={[styles.buttonText, { color: Colors.secondaryText }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: isConfirmDisabled ? Colors.border : Colors.primaryBlue,
                  opacity: isConfirmDisabled ? 0.5 : 1,
                }
              ]}
              onPress={handleConfirm}
              disabled={isConfirmDisabled}
            >
              <Text style={[styles.buttonText, { color: Colors.white }]}>
                Set Timeline
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '600',
  },
  closeButton: {
    padding: Spacing.xs,
  },
  projectInfo: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  clientName: {
    fontSize: FontSizes.small,
  },
  instructionsContainer: {
    marginBottom: Spacing.md,
  },
  instructionsText: {
    fontSize: FontSizes.small,
    textAlign: 'center',
  },
  calendarContainer: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  datesSummaryContainer: {
    marginBottom: Spacing.lg,
  },
  dateSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  dateSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  dateSummaryText: {
    flex: 1,
  },
  dateSummaryLabel: {
    fontSize: FontSizes.small,
    marginBottom: 2,
  },
  dateSummaryValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  durationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  durationText: {
    flex: 1,
  },
  durationNumber: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  durationLabel: {
    fontSize: FontSizes.small,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  button: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
