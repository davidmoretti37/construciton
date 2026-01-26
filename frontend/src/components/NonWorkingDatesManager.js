import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function NonWorkingDatesManager({
  dates = [],
  onAddDate,
  onRemoveDate,
  disabled = false,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [showPicker, setShowPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleConfirmDate = () => {
    const dateString = selectedDate.toISOString().split('T')[0];
    if (!dates.includes(dateString)) {
      onAddDate?.(dateString);
    }
    setShowPicker(false);
    setSelectedDate(new Date());
  };

  const handleCancelPicker = () => {
    setShowPicker(false);
    setSelectedDate(new Date());
  };

  // Sort dates chronologically
  const sortedDates = [...dates].sort();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: Colors.secondaryText }]}>Days Off</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={() => setShowPicker(true)}
          disabled={disabled}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Add Date</Text>
        </TouchableOpacity>
      </View>

      {sortedDates.length === 0 ? (
        <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
          No days off scheduled. Tap "Add Date" to mark specific dates as non-working.
        </Text>
      ) : (
        <View style={styles.datesList}>
          {sortedDates.map((dateString) => (
            <View
              key={dateString}
              style={[styles.dateChip, { backgroundColor: Colors.errorRed + '15', borderColor: Colors.errorRed + '30' }]}
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.errorRed} />
              <Text style={[styles.dateText, { color: Colors.errorRed }]}>
                {formatDate(dateString)}
              </Text>
              {!disabled && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => onRemoveDate?.(dateString)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.errorRed} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Date Picker Modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancelPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={handleCancelPicker}>
                <Text style={[styles.modalCancel, { color: Colors.errorRed }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Day Off</Text>
              <TouchableOpacity onPress={handleConfirmDate}>
                <Text style={[styles.modalConfirm, { color: Colors.primaryBlue }]}>Add</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pickerContainer}>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                minimumDate={new Date()}
                textColor={Colors.primaryText}
                style={styles.datePicker}
              />
            </View>

            <Text style={[styles.pickerHint, { color: Colors.secondaryText }]}>
              This date will be skipped when shifting tasks
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: FontSizes.small,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  datesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
  },
  removeButton: {
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalCancel: {
    fontSize: 16,
  },
  modalConfirm: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  datePicker: {
    width: '100%',
    height: 200,
  },
  pickerHint: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
