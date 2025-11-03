import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { saveProject } from '../utils/storage';

export default function EditProjectModal({ visible, onClose, projectData, onSave }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  // New financial model
  const [contractAmount, setContractAmount] = useState('');
  const [incomeCollected, setIncomeCollected] = useState('');
  const [expenses, setExpenses] = useState('');
  // Legacy fields (for backward compatibility)
  const [budget, setBudget] = useState('');
  const [spent, setSpent] = useState('');
  // percentComplete is now auto-calculated from dates, no manual input needed
  const [status, setStatus] = useState('draft');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (projectData) {
      setName(projectData.name || '');
      setClient(projectData.client || '');
      // New financial model fields (with fallback to legacy)
      setContractAmount((projectData.contractAmount || projectData.budget || 0).toString());
      setIncomeCollected((projectData.incomeCollected || 0).toString());
      setExpenses((projectData.expenses || projectData.spent || 0).toString());
      // Legacy fields
      setBudget((projectData.budget || projectData.contractAmount || 0).toString());
      setSpent((projectData.spent || projectData.expenses || 0).toString());
      // percentComplete is auto-calculated, no need to set it
      setStatus(projectData.status || 'draft');
      setStartDate(projectData.startDate || '');
      setEndDate(projectData.endDate || '');
    }
  }, [projectData]);

  const handleClose = () => {
    onClose();
  };

  const calculateDaysRemaining = (start, end) => {
    if (!end) return null;

    const [year, month, day] = end.split('-');
    const endDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    endDateObj.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = endDateObj - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  const handleSave = async () => {
    // Simple validation without alerts
    if (!name.trim() || !client.trim()) {
      return;
    }

    // Calculate daysRemaining if endDate is set
    const daysRemaining = endDate ? calculateDaysRemaining(startDate, endDate) : projectData.daysRemaining;

    // Parse financial values
    const contractAmountValue = parseFloat(contractAmount) || 0;
    const incomeCollectedValue = parseFloat(incomeCollected) || 0;
    const expensesValue = parseFloat(expenses) || 0;
    const profitValue = incomeCollectedValue - expensesValue;

    const updatedProject = {
      ...projectData,
      name: name.trim(),
      client: client.trim(),
      // New financial model
      contractAmount: contractAmountValue,
      incomeCollected: incomeCollectedValue,
      expenses: expensesValue,
      profit: profitValue,
      // Legacy fields (for backward compatibility)
      budget: contractAmountValue,
      spent: expensesValue,
      // percentComplete will be auto-calculated in saveProject() from dates
      status,
      startDate: startDate || null,
      endDate: endDate || null,
      daysRemaining: daysRemaining,
      estimatedDuration: daysRemaining !== null ? `${daysRemaining} days` : null,
    };

    try {
      const saved = await saveProject(updatedProject);
      if (saved) {
        onSave && onSave(saved);
        onClose();
      }
    } catch (error) {
      console.error('Error saving project:', error);
    }
  };

  const handleContractAmountChange = (text) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setContractAmount(cleaned);
    setBudget(cleaned); // Keep legacy in sync
  };

  const handleIncomeCollectedChange = (text) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setIncomeCollected(cleaned);
  };

  const handleExpensesChange = (text) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setExpenses(cleaned);
    setSpent(cleaned); // Keep legacy in sync
  };

  // Legacy handlers (for backward compatibility)
  const handleBudgetChange = (text) => {
    handleContractAmountChange(text);
  };

  const handleSpentChange = (text) => {
    handleExpensesChange(text);
  };

  // percentComplete is now auto-calculated from dates, no manual input needed

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
        <View style={[styles.modalContainer, { backgroundColor: Colors.white }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>Edit Project</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Project Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Project Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="Enter project name"
                placeholderTextColor={Colors.placeholderText}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Client Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Client Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="Enter client name"
                placeholderTextColor={Colors.placeholderText}
                value={client}
                onChangeText={setClient}
              />
            </View>

            {/* Contract Amount */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Contract Amount ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="0.00"
                placeholderTextColor={Colors.placeholderText}
                value={contractAmount}
                onChangeText={handleContractAmountChange}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                Total value of the contract with the client
              </Text>
            </View>

            {/* Income Collected */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Income Collected ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="0.00"
                placeholderTextColor={Colors.placeholderText}
                value={incomeCollected}
                onChangeText={handleIncomeCollectedChange}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                Money received from client so far
              </Text>
            </View>

            {/* Expenses */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Expenses ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="0.00"
                placeholderTextColor={Colors.placeholderText}
                value={expenses}
                onChangeText={handleExpensesChange}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                Materials, workers, and other costs
              </Text>
            </View>

            {/* Calculated Profit (Read-only display) */}
            {(incomeCollected || expenses) && (
              <View style={[styles.inputGroup, styles.profitDisplay]}>
                <Text style={[styles.label, { color: Colors.primaryText, fontWeight: '700' }]}>
                  Current Profit
                </Text>
                <Text style={[
                  styles.profitValue,
                  {
                    color: (parseFloat(incomeCollected) || 0) - (parseFloat(expenses) || 0) >= 0
                      ? Colors.success
                      : Colors.error
                  }
                ]}>
                  ${((parseFloat(incomeCollected) || 0) - (parseFloat(expenses) || 0)).toLocaleString()}
                  {(parseFloat(incomeCollected) || 0) - (parseFloat(expenses) || 0) >= 0 ? ' ✅' : ' ⚠️'}
                </Text>
                <Text style={[styles.helperText, { color: Colors.secondaryText, marginTop: 4 }]}>
                  Calculated: Income Collected - Expenses
                </Text>
              </View>
            )}

            {/* Progress % is now auto-calculated from Start Date and End Date */}

            {/* Start Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Start Date</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.placeholderText}
                value={startDate}
                onChangeText={setStartDate}
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                Format: YYYY-MM-DD (e.g., 2025-11-03)
              </Text>
            </View>

            {/* End Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>End Date (Deadline)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.placeholderText}
                value={endDate}
                onChangeText={setEndDate}
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                Format: YYYY-MM-DD (e.g., 2025-11-15)
              </Text>
              {endDate && (
                <Text style={[styles.helperText, { color: Colors.primaryBlue, marginTop: 4 }]}>
                  Days remaining: {calculateDaysRemaining(startDate, endDate)}
                </Text>
              )}
            </View>

            {/* Status */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Status</Text>
              <View style={styles.statusButtons}>
                {['draft', 'on-track', 'behind', 'completed'].map((statusOption) => (
                  <TouchableOpacity
                    key={statusOption}
                    style={[
                      styles.statusButton,
                      { borderColor: Colors.border },
                      status === statusOption && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue }
                    ]}
                    onPress={() => setStatus(statusOption)}
                  >
                    <Text style={[
                      styles.statusButtonText,
                      { color: Colors.primaryText },
                      status === statusOption && { color: Colors.white }
                    ]}>
                      {statusOption.replace('-', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { backgroundColor: Colors.lightGray }]}
              onPress={handleClose}
            >
              <Text style={[styles.buttonText, { color: Colors.primaryText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleSave}
            >
              <Text style={[styles.buttonText, { color: Colors.white }]}>Save Changes</Text>
            </TouchableOpacity>
          </View>
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
  modalContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '600',
  },
  closeButton: {
    padding: Spacing.xs,
  },
  content: {
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  input: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  helperText: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statusButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  statusButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: LightColors.border,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {},
  saveButton: {},
  buttonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  profitDisplay: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  profitValue: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
});
