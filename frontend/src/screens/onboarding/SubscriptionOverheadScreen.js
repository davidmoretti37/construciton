import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ProgressStepBar from '../../components/onboarding/ProgressStepBar';
import { getConnectSession, getConnectedAccounts } from '../../services/bankService';
import {
  fetchRecurringExpenses,
  addRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
} from '../../utils/storage/recurringExpenses';

const ACCENT = '#1E40AF';

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', multiplier: 4.33 },
  { value: 'biweekly', label: 'Bi-weekly', multiplier: 2.17 },
  { value: 'monthly', label: 'Monthly', multiplier: 1 },
  { value: 'quarterly', label: 'Quarterly', multiplier: 1 / 3 },
  { value: 'annually', label: 'Annually', multiplier: 1 / 12 },
];

const formatCurrency = (amount) =>
  `$${Math.round(parseFloat(amount || 0)).toLocaleString()}`;

const toMonthly = (amount, frequency) => {
  const f = FREQUENCIES.find(fr => fr.value === frequency);
  return parseFloat(amount || 0) * (f?.multiplier || 1);
};

export default function SubscriptionOverheadScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { selectedTrades, selectedServices, businessInfo, pricing, phasesTemplate, profitMargin, invoiceInfo } = route.params;

  // Bank connection state
  const [connecting, setConnecting] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  // Overhead state
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formFrequency, setFormFrequency] = useState('monthly');
  const [saving, setSaving] = useState(false);

  const totalMonthly = useMemo(() =>
    items.filter(i => i.is_active !== false).reduce((sum, i) => sum + toMonthly(i.amount, i.frequency), 0),
    [items]
  );

  const loadOverhead = useCallback(async () => {
    try {
      const data = await fetchRecurringExpenses();
      setItems(data);
    } catch (error) {
      console.error('Error loading overhead:', error);
    }
  }, []);

  const loadBankAccounts = useCallback(async () => {
    try {
      setBankLoading(true);
      const result = await getConnectedAccounts();
      setConnectedAccounts(result.accounts || []);
    } catch (error) {
      // Silently fail — user may not have any accounts yet
    } finally {
      setBankLoading(false);
    }
  }, []);

  // Load data on mount
  useEffect(() => { loadOverhead(); loadBankAccounts(); }, [loadOverhead, loadBankAccounts]);

  // Reload bank accounts when app comes back from Safari (Teller Connect)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && connecting) {
        setConnecting(false);
        loadBankAccounts();
      }
    });
    return () => sub.remove();
  }, [connecting, loadBankAccounts]);

  // Bank connection handler
  const handleConnectBank = async () => {
    try {
      setConnecting(true);
      const { url } = await getConnectSession();
      await Linking.openURL(url);
    } catch (error) {
      setConnecting(false);
      Alert.alert('Error', error.message || 'Failed to start bank connection. You can do this later in Settings.');
    }
  };

  // Overhead handlers
  const resetForm = () => {
    setFormDesc('');
    setFormAmount('');
    setFormFrequency('monthly');
    setEditingItem(null);
  };

  const openAdd = () => { resetForm(); setShowModal(true); };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormDesc(item.description);
    setFormAmount(String(item.amount));
    setFormFrequency(item.frequency);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formDesc.trim()) { Alert.alert('Required', 'Enter a name for this expense'); return; }
    if (!formAmount || parseFloat(formAmount) <= 0) { Alert.alert('Required', 'Enter an amount'); return; }

    try {
      setSaving(true);
      const data = {
        description: formDesc.trim(),
        amount: parseFloat(formAmount),
        category: 'overhead',
        frequency: formFrequency,
        next_due_date: new Date().toISOString().split('T')[0],
      };

      if (editingItem) {
        await updateRecurringExpense(editingItem.id, data);
      } else {
        await addRecurringExpense(data);
      }
      setShowModal(false);
      resetForm();
      loadOverhead();
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete', `Remove "${item.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setItems(prev => prev.filter(i => i.id !== item.id));
        deleteRecurringExpense(item.id).catch(() => {
          setItems(prev => [...prev, item]);
        });
      }},
    ]);
  };

  const getFreqLabel = (freq) => FREQUENCIES.find(f => f.value === freq)?.label || freq;

  const handleContinue = () => {
    navigation.navigate('Completion', {
      selectedTrades,
      selectedServices,
      businessInfo,
      pricing,
      phasesTemplate,
      profitMargin,
      invoiceInfo,
      typicalContracts: [],
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: '#F1F5F9' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#1F2937' }]}>Almost Done</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* SECTION 1: Bank Connection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#10B981' + '15' }]}>
              <Ionicons name="wallet-outline" size={22} color="#10B981" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Connect Your Bank</Text>
              <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
                Auto-track expenses and income
              </Text>
            </View>
          </View>

          {/* Important notice */}
          <View style={[styles.importantCard, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="shield-checkmark" size={18} color="#059669" />
            <Text style={[styles.importantText, { color: '#065F46' }]}>
              Connecting your bank lets Sylk automatically import transactions, match them to projects, and give you real-time financial insights. Your credentials are never stored — we use Teller, a bank-grade secure connection.
            </Text>
          </View>

          {/* Connected accounts */}
          {connectedAccounts.length > 0 && (
            <View style={[styles.connectedCard, { backgroundColor: Colors.cardBackground }]}>
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.connectedTitle, { color: Colors.primaryText }]}>
                  {connectedAccounts.length} account{connectedAccounts.length !== 1 ? 's' : ''} connected
                </Text>
                {connectedAccounts.map((acc, i) => (
                  <Text key={i} style={[styles.connectedName, { color: Colors.secondaryText }]}>
                    {acc.institution_name || acc.name || 'Bank Account'}
                  </Text>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.connectButton, connecting && { opacity: 0.6 }]}
            onPress={handleConnectBank}
            disabled={connecting || bankLoading}
            activeOpacity={0.8}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={connectedAccounts.length > 0 ? 'add-circle-outline' : 'link-outline'} size={20} color="#fff" />
                <Text style={styles.connectText}>
                  {connectedAccounts.length > 0 ? 'Connect Another Account' : 'Connect Bank Account'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[styles.skipNote, { color: Colors.secondaryText }]}>
            You can also do this later in Settings
          </Text>
        </View>

        {/* SECTION 2: Company Overhead */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#EF4444' + '15' }]}>
              <Ionicons name="trending-down-outline" size={22} color="#EF4444" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Company Overhead</Text>
              <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
                Track fixed costs for accurate profit calculations
              </Text>
            </View>
          </View>

          {/* Important notice */}
          <View style={[styles.importantCard, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="warning" size={18} color="#D97706" />
            <Text style={styles.importantText}>
              Adding your overhead costs (rent, insurance, vehicle payments, etc.) is how Sylk calculates your real profit. Without this, your profit numbers won't be accurate.
            </Text>
          </View>

          {/* Summary if items exist */}
          {items.length > 0 && (
            <View style={[styles.overheadSummary, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.overheadLabel, { color: Colors.secondaryText }]}>Monthly Overhead</Text>
              <Text style={[styles.overheadAmount, { color: '#EF4444' }]}>{formatCurrency(totalMonthly)}</Text>
              <Text style={[styles.overheadCount, { color: Colors.secondaryText }]}>
                {items.length} expense{items.length !== 1 ? 's' : ''} added
              </Text>
            </View>
          )}

          {/* Overhead Items */}
          {items.map((item) => (
            <View
              key={item.id}
              style={[styles.overheadItem, { backgroundColor: Colors.cardBackground }]}
            >
              <View style={styles.overheadItemRow}>
                <Text style={[styles.overheadItemName, { color: Colors.primaryText }]} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={[styles.overheadItemAmount, { color: '#EF4444' }]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
              <View style={styles.overheadItemFooter}>
                <Text style={[styles.overheadItemFreq, { color: Colors.secondaryText }]}>
                  {getFreqLabel(item.frequency)}
                  {item.frequency !== 'monthly' && ` · ${formatCurrency(toMonthly(item.amount, item.frequency))}/mo`}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Add button */}
          <TouchableOpacity
            style={[styles.addOverheadButton, { borderColor: ACCENT }]}
            onPress={openAdd}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={ACCENT} />
            <Text style={[styles.addOverheadText, { color: ACCENT }]}>
              {items.length === 0 ? 'Add Your First Overhead Expense' : 'Add Another Expense'}
            </Text>
          </TouchableOpacity>

          {items.length === 0 && (
            <Text style={[styles.examplesText, { color: Colors.secondaryText }]}>
              Examples: Office rent, truck payment, insurance, tools, software subscriptions, fuel
            </Text>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: '#3B82F6' }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueText}>Complete Setup</Text>
          <Ionicons name="checkmark" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.progressContainer}>
          <ProgressStepBar currentStep={5} totalSteps={5} />
        </View>
      </View>

      {/* Add/Edit Overhead Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              {editingItem ? 'Edit Expense' : 'Add Expense'}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.saveText, saving && { opacity: 0.4 }]}>{saving ? '...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>Expense Name</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: Colors.cardBackground, color: Colors.primaryText, borderColor: Colors.border }]}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder="e.g., Office Rent, Truck Payment, Insurance"
                placeholderTextColor={Colors.secondaryText}
                autoFocus={!editingItem}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>Amount</Text>
              <View style={[styles.amountRow, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
                <Text style={[styles.currencySign, { color: Colors.secondaryText }]}>$</Text>
                <TextInput
                  style={[styles.amountInput, { color: Colors.primaryText }]}
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>How Often</Text>
              <View style={styles.freqRow}>
                {FREQUENCIES.map(f => {
                  const selected = formFrequency === f.value;
                  return (
                    <TouchableOpacity
                      key={f.value}
                      style={[styles.freqChip, { borderColor: selected ? ACCENT : Colors.border }, selected && { backgroundColor: ACCENT + '08' }]}
                      onPress={() => setFormFrequency(f.value)}
                    >
                      <Text style={[styles.freqChipText, { color: selected ? ACCENT : Colors.secondaryText }]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {formAmount && formFrequency !== 'monthly' && (
              <View style={[styles.hintCard, { backgroundColor: ACCENT + '08' }]}>
                <Ionicons name="information-circle-outline" size={16} color={ACCENT} />
                <Text style={[styles.hintText, { color: ACCENT }]}>
                  That's {formatCurrency(toMonthly(formAmount, formFrequency))} per month
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 24 },

  // Sections
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionSubtitle: { fontSize: 13, marginTop: 2 },

  // Bank connection
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  connectedTitle: { fontSize: 15, fontWeight: '700' },
  connectedName: { fontSize: 13, marginTop: 2 },
  connectButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  connectText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipNote: { fontSize: 12, textAlign: 'center' },

  // Important notice
  importantCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  importantText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#92400E', lineHeight: 19 },

  // Overhead summary
  overheadSummary: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  overheadLabel: { fontSize: 12, fontWeight: '500' },
  overheadAmount: { fontSize: 28, fontWeight: '800', marginTop: 2 },
  overheadCount: { fontSize: 12, marginTop: 4 },

  // Overhead items
  overheadItem: {
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  overheadItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overheadItemName: { fontSize: 15, fontWeight: '600', flex: 1 },
  overheadItemAmount: { fontSize: 16, fontWeight: '800' },
  overheadItemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  overheadItemFreq: { fontSize: 12 },

  // Add button
  addOverheadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addOverheadText: { fontSize: 15, fontWeight: '600' },
  examplesText: { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 },

  // Bottom section
  bottomSection: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  continueText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  progressContainer: { alignItems: 'center', marginTop: 12 },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  saveText: { fontSize: FontSizes.body, fontWeight: '600', color: ACCENT },
  modalScroll: { flex: 1 },
  modalContent: { padding: Spacing.lg, gap: 24 },
  formSection: { gap: 8 },
  formLabel: { fontSize: 14, fontWeight: '600' },
  formInput: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, borderWidth: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1 },
  currencySign: { fontSize: 20, fontWeight: '700', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 20, fontWeight: '700' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  freqChipText: { fontSize: 14, fontWeight: '600' },
  hintCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  hintText: { fontSize: 13, fontWeight: '600' },
});
