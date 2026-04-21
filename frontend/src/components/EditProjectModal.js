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
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { saveProject } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { updatePhaseBudget } from '../utils/storage/projectPhases';

export default function EditProjectModal({ visible, onClose, projectData, onSave }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [aiResponsesEnabled, setAiResponsesEnabled] = useState(true);
  // New financial model
  const [contractAmount, setContractAmount] = useState('');
  const [incomeCollected, setIncomeCollected] = useState('');
  const [expenses, setExpenses] = useState('');
  // Legacy fields (for backward compatibility)
  const [budget, setBudget] = useState('');
  const [spent, setSpent] = useState('');
  // percentComplete is now auto-calculated from dates, no manual input needed
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [trades, setTrades] = useState([]);
  const [phases, setPhases] = useState([]);

  // Load existing trade budgets when editing
  useEffect(() => {
    if (projectData?.id && !projectData.id.startsWith('temp-')) {
      supabase
        .from('project_trade_budgets')
        .select('id, trade_name, budget_amount')
        .eq('project_id', projectData.id)
        .order('created_at', { ascending: true })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setTrades(data.map(t => ({ dbId: t.id, name: t.trade_name, amount: t.budget_amount.toString() })));
          } else {
            setTrades([]);
          }
        })
        .catch(() => setTrades([]));
    } else {
      setTrades([]);
    }
  }, [projectData?.id]);

  // Load existing project phases so owners can allocate per-phase budgets.
  // For new/draft projects (no DB row yet) fall back to any phases embedded
  // in projectData so the editor still works in draft mode.
  useEffect(() => {
    if (!projectData?.id || String(projectData.id).startsWith('temp-') || !projectData.hasPhases) {
      if (projectData?.phases) {
        setPhases(projectData.phases.map((p, i) => ({ ...p, id: p.id || `draft-${i}` })));
      } else {
        setPhases([]);
      }
      return;
    }
    supabase
      .from('project_phases')
      .select('id, name, budget, order_index')
      .eq('project_id', projectData.id)
      .order('order_index', { ascending: true })
      .then(({ data }) => setPhases(data || []));
  }, [projectData?.id, projectData?.hasPhases]);

  useEffect(() => {
    if (projectData) {
      setName(projectData.name || '');
      setClient(projectData.client || '');
      setClientPhone(projectData.clientPhone || '');
      setAiResponsesEnabled(projectData.aiResponsesEnabled !== false); // Default to true
      // New financial model fields (with fallback to legacy)
      setContractAmount((projectData.contractAmount || projectData.budget || 0).toString());
      setIncomeCollected((projectData.incomeCollected || 0).toString());
      setExpenses((projectData.expenses || projectData.spent || 0).toString());
      // Legacy fields
      setBudget((projectData.budget || projectData.contractAmount || 0).toString());
      setSpent((projectData.spent || projectData.expenses || 0).toString());
      // percentComplete is auto-calculated, no need to set it
      setStatus(projectData.status || 'active');
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
    if (!name.trim()) {
      Alert.alert('Required', 'Project name is required.');
      return;
    }
    if (!client.trim()) {
      Alert.alert('Required', 'Client name is required.');
      return;
    }

    // Date validation
    if (startDate && endDate && startDate > endDate) {
      Alert.alert('Invalid Dates', 'Start date cannot be after end date.');
      return;
    }

    // Financial validation
    const contractAmountValue = parseFloat(contractAmount) || 0;
    const incomeCollectedValue = parseFloat(incomeCollected) || 0;
    const expensesValue = parseFloat(expenses) || 0;

    if (contractAmountValue < 0 || incomeCollectedValue < 0 || expensesValue < 0) {
      Alert.alert('Invalid Amount', 'Financial values cannot be negative.');
      return;
    }

    // Calculate daysRemaining if endDate is set
    const daysRemaining = endDate ? calculateDaysRemaining(startDate, endDate) : projectData.daysRemaining;
    const profitValue = incomeCollectedValue - expensesValue;

    const updatedProject = {
      ...projectData,
      name: name.trim(),
      client: client.trim(),
      clientPhone: clientPhone.trim() || null,
      aiResponsesEnabled: aiResponsesEnabled,
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
      trades: trades.filter(t => t.name.trim()).map(t => ({
        dbId: t.dbId || null,
        name: t.name.trim(),
        amount: parseFloat(t.amount) || 0,
      })),
      // Embed the edited phases (with coerced budgets) so that draft/new
      // projects — which won't exist in project_phases yet — still capture
      // the allocations. For existing projects the DB write below is what
      // actually persists; this is a best-effort payload on the saved object.
      phases: phases.length > 0
        ? phases.map(p => ({ ...p, budget: parseFloat(p.budget) || 0 }))
        : (projectData.phases || []),
    };

    try {
      const saved = await saveProject(updatedProject);
      if (saved) {
        // Persist per-phase budgets for already-saved phases. Draft phases
        // (id starts with "draft-") don't exist in the DB yet, so we skip
        // them — their budget lives on the embedded projectData.phases.
        if (phases.length > 0) {
          const failedPhases = [];
          for (const phase of phases) {
            if (phase.id && !String(phase.id).startsWith('draft-')) {
              const ok = await updatePhaseBudget(phase.id, parseFloat(phase.budget) || 0);
              if (!ok) failedPhases.push(phase.name || 'phase');
            }
          }
          // Reflect the updated budgets on the object we return to the
          // parent so it can render immediately without a re-fetch.
          if (saved.phases) {
            saved.phases = saved.phases.map(p => {
              const match = phases.find(ph => ph.id === p.id);
              return match ? { ...p, budget: parseFloat(match.budget) || 0 } : p;
            });
          } else {
            saved.phases = phases.map(p => ({ ...p, budget: parseFloat(p.budget) || 0 }));
          }
          if (failedPhases.length > 0) {
            Alert.alert(
              'Partial save',
              `Project saved, but these phase budgets failed to update: ${failedPhases.join(', ')}. Please try again.`
            );
            return; // keep modal open so user can retry
          }
        }
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
            <Text style={[styles.title, { color: Colors.primaryText }]}>{t('projects:editProject', 'Edit Project')}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Project Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.projectName', 'Project Name')} *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('projects:form.projectNamePlaceholder', 'Enter project name')}
                placeholderTextColor={Colors.placeholderText}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Client Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.clientName', 'Client Name')} *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('projects:form.clientNamePlaceholder', 'Enter client name')}
                placeholderTextColor={Colors.placeholderText}
                value={client}
                onChangeText={setClient}
              />
            </View>

            {/* Client Phone Number */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.clientPhone', 'Client Phone Number')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('projects:form.clientPhonePlaceholder', '+1 555 123 4567')}
                placeholderTextColor={Colors.placeholderText}
                value={clientPhone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                {t('projects:form.phoneHelper', 'For SMS/WhatsApp updates (include country code)')}
              </Text>
            </View>

            {/* AI Auto-Response Toggle */}
            {clientPhone.trim().length > 0 && (
              <View style={[styles.inputGroup, styles.toggleRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.enableAiResponses', 'Enable AI Auto-Responses')}</Text>
                  <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                    {t('projects:form.aiResponsesHelper', 'AI will respond to routine client questions automatically')}
                  </Text>
                </View>
                <Switch
                  value={aiResponsesEnabled}
                  onValueChange={setAiResponsesEnabled}
                  trackColor={{ false: Colors.border, true: Colors.primaryBlue }}
                  thumbColor={aiResponsesEnabled ? Colors.white : Colors.secondaryText}
                />
              </View>
            )}

            {/* Contract Amount */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.contractAmount', 'Contract Amount')} ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('projects:form.contractAmountPlaceholder', '0.00')}
                placeholderTextColor={Colors.placeholderText}
                value={contractAmount}
                onChangeText={handleContractAmountChange}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                {t('projects:form.contractAmountHelper', 'Total value of the contract with the client')}
              </Text>
            </View>

            {/* Income Collected */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.incomeCollected', 'Income Collected')} ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('projects:form.contractAmountPlaceholder', '0.00')}
                placeholderTextColor={Colors.placeholderText}
                value={incomeCollected}
                onChangeText={handleIncomeCollectedChange}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                {t('projects:form.incomeCollectedHelper', 'Money received from client so far')}
              </Text>
            </View>

            {/* Expenses */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.expenses', 'Expenses')} ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('projects:form.contractAmountPlaceholder', '0.00')}
                placeholderTextColor={Colors.placeholderText}
                value={expenses}
                onChangeText={handleExpensesChange}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                {t('projects:form.expensesHelper', 'Materials, workers, and other costs')}
              </Text>
            </View>

            {/* Calculated Profit (Read-only display) */}
            {(incomeCollected || expenses) && (
              <View style={[styles.inputGroup, styles.profitDisplay]}>
                <Text style={[styles.label, { color: Colors.primaryText, fontWeight: '700' }]}>
                  {t('projects:financial.currentProfit', 'Current Profit')}
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
                  {t('projects:form.profitCalculation', 'Calculated: Income Collected - Expenses')}
                </Text>
              </View>
            )}

            {/* Progress % is now auto-calculated from Start Date and End Date */}

            {/* Services / Trades */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Services / Trades</Text>
              <Text style={[styles.helperText, { color: Colors.secondaryText, marginBottom: Spacing.sm }]}>
                Define the trades for this project and their budgets
              </Text>

              {trades.map((trade, index) => (
                <View key={index} style={styles.tradeRow}>
                  <TextInput
                    style={[styles.tradeNameInput, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                    placeholder="e.g. Electrical"
                    placeholderTextColor={Colors.placeholderText}
                    value={trade.name}
                    onChangeText={(text) => {
                      const updated = [...trades];
                      updated[index] = { ...updated[index], name: text };
                      setTrades(updated);
                    }}
                  />
                  <TextInput
                    style={[styles.tradeAmountInput, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                    placeholder="$0"
                    placeholderTextColor={Colors.placeholderText}
                    value={trade.amount}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9.]/g, '');
                      const updated = [...trades];
                      updated[index] = { ...updated[index], amount: cleaned };
                      setTrades(updated);
                    }}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    onPress={() => setTrades(trades.filter((_, i) => i !== index))}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={22} color={Colors.error || '#EF4444'} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addTradeButton, { borderColor: Colors.primaryBlue }]}
                onPress={() => setTrades([...trades, { name: '', amount: '' }])}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                <Text style={{ color: Colors.primaryBlue, fontWeight: '600', fontSize: FontSizes.small }}>
                  Add Trade
                </Text>
              </TouchableOpacity>
            </View>

            {/* Phase Budgets */}
            {phases.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: Colors.primaryText }]}>Phase Budgets</Text>
                <Text style={[styles.helperText, { color: Colors.secondaryText, marginBottom: 8 }]}>
                  Allocate the contract amount across phases
                </Text>
                {phases.map((phase, index) => (
                  <View key={phase.id} style={styles.tradeRow}>
                    <Text style={[styles.tradeNameInput, { color: Colors.primaryText, paddingVertical: 10 }]}>{phase.name}</Text>
                    <TextInput
                      style={[styles.tradeAmountInput, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                      placeholder="$0"
                      placeholderTextColor={Colors.placeholderText}
                      value={String(phase.budget || '')}
                      onChangeText={(text) => {
                        const cleaned = text.replace(/[^0-9.]/g, '');
                        const updated = [...phases];
                        updated[index] = { ...updated[index], budget: cleaned };
                        setPhases(updated);
                      }}
                      keyboardType="decimal-pad"
                    />
                  </View>
                ))}
                <Text style={[styles.helperText, { color: Colors.secondaryText, marginTop: 4 }]}>
                  Sum: ${phases.reduce((s, p) => s + (parseFloat(p.budget) || 0), 0).toLocaleString()}
                  {' '}/{' '}Contract: ${(parseFloat(contractAmount) || 0).toLocaleString()}
                </Text>
              </View>
            )}

            {/* Start Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.startDate', 'Start Date')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('placeholders.dateFormat', 'YYYY-MM-DD')}
                placeholderTextColor={Colors.placeholderText}
                value={startDate}
                onChangeText={setStartDate}
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                {t('projects:form.dateFormatHelper', 'Format: YYYY-MM-DD (e.g., 2025-11-03)')}
              </Text>
            </View>

            {/* End Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:form.endDate', 'End Date')} ({t('projects:form.deadline', 'Deadline')})</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
                placeholder={t('placeholders.dateFormat', 'YYYY-MM-DD')}
                placeholderTextColor={Colors.placeholderText}
                value={endDate}
                onChangeText={setEndDate}
              />
              <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
                {t('projects:form.dateFormatHelper', 'Format: YYYY-MM-DD (e.g., 2025-11-15)')}
              </Text>
              {endDate && (
                <Text style={[styles.helperText, { color: Colors.primaryBlue, marginTop: 4 }]}>
                  {t('projects:details.daysRemaining', 'Days remaining')}: {calculateDaysRemaining(startDate, endDate)}
                </Text>
              )}
            </View>

            {/* Status */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('projects:status.label', 'Status')}</Text>
              <View style={styles.statusButtons}>
                {['active', 'completed', 'archived'].map((statusOption) => (
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
                      {t(`projects:status.${statusOption}`, statusOption.replace('-', ' '))}
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
              <Text style={[styles.buttonText, { color: Colors.primaryText }]}>{t('buttons.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleSave}
            >
              <Text style={[styles.buttonText, { color: Colors.white }]}>{t('buttons.saveChanges', 'Save Changes')}</Text>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tradeNameInput: {
    flex: 2,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  tradeAmountInput: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  addTradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
