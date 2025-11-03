import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function BudgetInputModal({ visible, onClose, onConfirm, projectData }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [budget, setBudget] = useState(projectData?.budget?.toString() || '');

  const handleConfirm = () => {
    const budgetValue = parseFloat(budget);

    if (!budget || isNaN(budgetValue) || budgetValue <= 0) {
      Alert.alert('Invalid Budget', 'Please enter a valid budget amount greater than 0.');
      return;
    }

    onConfirm({
      budget: budgetValue,
    });

    setBudget('');
    onClose();
  };

  const handleClose = () => {
    setBudget('');
    onClose();
  };

  const formatCurrency = (value) => {
    if (!value) return '';
    const numValue = parseFloat(value.replace(/[^0-9.]/g, ''));
    if (isNaN(numValue)) return '';
    return numValue.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const handleBudgetChange = (text) => {
    // Remove all non-numeric characters except decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setBudget(cleaned);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={[styles.modalContainer, { backgroundColor: Colors.white }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: Colors.primaryText }]}>
                Set Project Budget
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

            {/* Budget Input */}
            <View style={styles.inputSection}>
              <View style={styles.inputLabel}>
                <Ionicons name="cash-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.labelText, { color: Colors.primaryText }]}>
                  Budget Amount
                </Text>
              </View>

              <View style={[styles.inputContainer, { borderColor: Colors.border }]}>
                <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  value={budget}
                  onChangeText={handleBudgetChange}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>

              {budget && !isNaN(parseFloat(budget)) && (
                <Text style={[styles.formattedAmount, { color: Colors.secondaryText }]}>
                  ${formatCurrency(budget)}
                </Text>
              )}
            </View>

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
                    backgroundColor: !budget || isNaN(parseFloat(budget)) ? Colors.border : Colors.primaryBlue,
                    opacity: !budget || isNaN(parseFloat(budget)) ? 0.5 : 1,
                  }
                ]}
                onPress={handleConfirm}
                disabled={!budget || isNaN(parseFloat(budget))}
              >
                <Text style={[styles.buttonText, { color: Colors.white }]}>
                  Set Budget
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  scrollContent: {
    flexGrow: 1,
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
    marginBottom: Spacing.lg,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  clientName: {
    fontSize: FontSizes.small,
  },
  inputSection: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  labelText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  currencySymbol: {
    fontSize: FontSizes.header,
    fontWeight: '600',
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.header,
    fontWeight: '600',
    paddingVertical: Spacing.md,
  },
  formattedAmount: {
    fontSize: FontSizes.small,
    marginTop: Spacing.sm,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
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
