/**
 * CompanyOverheadScreen
 * Manage fixed monthly business costs. Owner creates their own categories/items.
 * No hardcoded categories — starts blank with an add button.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  fetchRecurringExpenses,
  addRecurringExpense,
  deleteRecurringExpense,
  updateRecurringExpense,
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
  `$${Math.round(parseFloat(amount || 0)).toLocaleString('en-US')}`;

const toMonthly = (amount, frequency) => {
  const f = FREQUENCIES.find(fr => fr.value === frequency);
  return parseFloat(amount || 0) * (f?.multiplier || 1);
};

export default function CompanyOverheadScreen() {
  const { t } = useTranslation('owner');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formFrequency, setFormFrequency] = useState('monthly');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(false);
      const data = await fetchRecurringExpenses();
      setItems(data);
    } catch (error) {
      console.error('Error loading overhead:', error);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const totalMonthly = useMemo(() =>
    items.filter(i => i.is_active).reduce((sum, i) => sum + toMonthly(i.amount, i.frequency), 0),
    [items]
  );

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
    if (!formDesc.trim()) { Alert.alert(t('companyOverhead.requiredAlertTitle'), t('companyOverhead.enterNameError')); return; }
    if (!formAmount || parseFloat(formAmount) <= 0) { Alert.alert(t('companyOverhead.requiredAlertTitle'), t('companyOverhead.enterAmountError')); return; }

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
      loadData();
    } catch (error) {
      Alert.alert(t('common:alerts.error'), t('companyOverhead.saveErrorText'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (item) => {
    // Optimistic: toggle instantly
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
    updateRecurringExpense(item.id, { is_active: !item.is_active }).catch(() => {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: item.is_active } : i));
    });
  };

  const handleDelete = (item) => {
    Alert.alert(t('companyOverhead.deleteAlertTitle'), t('companyOverhead.deleteAlertMessage', { name: item.description }), [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      { text: t('common:buttons.delete'), style: 'destructive', onPress: () => {
        setItems(prev => prev.filter(i => i.id !== item.id));
        deleteRecurringExpense(item.id).catch(() => {
          setItems(prev => [...prev, item]);
        });
      }},
    ]);
  };

  const getFreqLabel = (freq) => FREQUENCIES.find(f => f.value === freq)?.label || freq;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity testID="companyOverhead.backButton" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text testID="companyOverhead.title" style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('companyOverhead.title')}</Text>
        <TouchableOpacity testID="companyOverhead.addButton" accessibilityLabel="Add expense" onPress={openAdd} style={styles.headerBtn}>
          <Ionicons name="add-circle-outline" size={24} color={ACCENT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={ACCENT} />}
      >
        {/* Summary — only show when there are items */}
        {items.length > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('companyOverhead.summaryMonthly')}</Text>
                <Text testID="companyOverhead.monthlyTotal" style={[styles.summaryAmount, { color: '#EF4444' }]}>{formatCurrency(totalMonthly)}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('companyOverhead.summaryAnnual')}</Text>
                <Text testID="companyOverhead.annualTotal" style={[styles.summaryAmount, { color: Colors.primaryText }]}>{formatCurrency(totalMonthly * 12)}</Text>
              </View>
            </View>
            <Text testID="companyOverhead.summaryCount" style={[styles.summaryCount, { color: Colors.secondaryText }]}>
              {t('companyOverhead.summaryCount', { active: items.filter(i => i.is_active).length, paused: items.filter(i => !i.is_active).length })}
            </Text>
          </View>
        )}

        {/* Error state — distinct from empty */}
        {error && items.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="cloud-offline-outline" size={48} color="#EF4444" />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>{t('companyOverhead.errorTitle')}</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              {t('companyOverhead.errorText')}
            </Text>
            <TouchableOpacity testID="companyOverhead.retryButton" accessibilityLabel="Retry" style={[styles.emptyBtn, { backgroundColor: ACCENT }]} onPress={() => { setLoading(true); loadData(); }}>
              <Ionicons name="refresh" size={18} color="#FFF" />
              <Text style={styles.emptyBtnText}>{t('common:buttons.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="business-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>{t('companyOverhead.emptyTitle')}</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              {t('companyOverhead.emptyText')}
            </Text>
            <TouchableOpacity testID="companyOverhead.addFirstButton" accessibilityLabel="Add first expense" style={[styles.emptyBtn, { backgroundColor: ACCENT }]} onPress={openAdd}>
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.emptyBtnText}>{t('companyOverhead.addFirstExpense')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              testID={`companyOverhead.row.${item.id}`}
              accessibilityLabel={`Edit ${item.description}`}
              style={[styles.itemCard, { backgroundColor: Colors.cardBackground }, !item.is_active && styles.itemInactive]}
              onPress={() => openEdit(item)}
              activeOpacity={0.7}
            >
              <View style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text testID={`companyOverhead.row.${item.id}.description`} style={[styles.itemDesc, { color: item.is_active ? Colors.primaryText : Colors.secondaryText }]} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={[styles.itemMeta, { color: Colors.secondaryText }]}>
                    {getFreqLabel(item.frequency)}
                    {item.frequency !== 'monthly' && t('companyOverhead.perMonthDisplay', { amount: formatCurrency(toMonthly(item.amount, item.frequency)) })}
                  </Text>
                </View>
                <View style={styles.itemRight}>
                  <Text testID={`companyOverhead.row.${item.id}.amount`} style={[styles.itemAmount, { color: item.is_active ? '#EF4444' : Colors.secondaryText }]}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
              </View>
              <View style={[styles.itemFooter, { borderTopColor: Colors.border }]}>
                <TouchableOpacity
                  testID={`companyOverhead.row.${item.id}.toggleButton`}
                  accessibilityLabel={item.is_active ? `Pause ${item.description}` : `Resume ${item.description}`}
                  onPress={() => handleToggle(item)}
                  style={styles.itemActionBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={Colors.secondaryText} />
                  <Text style={[styles.itemActionText, { color: Colors.secondaryText }]}>
                    {item.is_active ? t('companyOverhead.pauseAction') : t('companyOverhead.resumeAction')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`companyOverhead.row.${item.id}.deleteButton`}
                  accessibilityLabel={`Delete ${item.description}`}
                  onPress={() => handleDelete(item)}
                  style={styles.itemActionBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={[styles.itemActionText, { color: '#EF4444' }]}>{t('common:buttons.delete')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity testID="companyOverhead.modalCloseButton" accessibilityLabel="Close" onPress={() => { setShowModal(false); resetForm(); }}>
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text testID="companyOverhead.modalTitle" style={[styles.modalTitle, { color: Colors.primaryText }]}>
              {editingItem ? t('companyOverhead.editExpenseTitle') : t('companyOverhead.addExpenseTitle')}
            </Text>
            <TouchableOpacity testID="companyOverhead.saveButton" accessibilityLabel="Save expense" onPress={handleSave} disabled={saving}>
              <Text style={[styles.saveText, saving && { opacity: 0.4 }]}>{saving ? '...' : t('common:buttons.save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('companyOverhead.expenseNameLabel')}</Text>
              <TextInput
                testID="companyOverhead.nameInput"
                accessibilityLabel="Expense name"
                style={[styles.formInput, { backgroundColor: Colors.cardBackground, color: Colors.primaryText, borderColor: Colors.border }]}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder={t('companyOverhead.expenseNamePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                autoFocus={!editingItem}
              />
            </View>

            {/* Amount */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('companyOverhead.amountLabel')}</Text>
              <View style={[styles.amountRow, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
                <Text style={[styles.currencySign, { color: Colors.secondaryText }]}>$</Text>
                <TextInput
                  testID="companyOverhead.amountInput"
                  accessibilityLabel="Amount"
                  style={[styles.amountInput, { color: Colors.primaryText }]}
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Frequency */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('companyOverhead.howOftenLabel')}</Text>
              <View style={styles.freqRow}>
                {FREQUENCIES.map(f => {
                  const selected = formFrequency === f.value;
                  return (
                    <TouchableOpacity
                      key={f.value}
                      testID={`companyOverhead.frequency.${f.value}`}
                      accessibilityLabel={`Frequency ${f.label}`}
                      style={[styles.freqChip, { borderColor: selected ? ACCENT : Colors.border }, selected && { backgroundColor: ACCENT + '08' }]}
                      onPress={() => setFormFrequency(f.value)}
                    >
                      <Text style={[styles.freqChipText, { color: selected ? ACCENT : Colors.secondaryText }]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Monthly equivalent hint */}
            {formAmount && formFrequency !== 'monthly' && (
              <View style={[styles.hintCard, { backgroundColor: ACCENT + '08' }]}>
                <Ionicons name="information-circle-outline" size={16} color={ACCENT} />
                <Text style={[styles.hintText, { color: ACCENT }]}>
                  {t('companyOverhead.perMonthHint', { amount: formatCurrency(toMonthly(formAmount, formFrequency)) })}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700', letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md },
  // Summary
  summaryCard: { borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontWeight: '500' },
  summaryAmount: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  summaryDivider: { width: 1, height: 40, marginHorizontal: 16 },
  summaryCount: { fontSize: 12, textAlign: 'center', marginTop: 12 },
  // Items
  itemCard: { borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  itemInactive: { opacity: 0.45 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemInfo: { flex: 1 },
  itemDesc: { fontSize: 16, fontWeight: '600' },
  itemMeta: { fontSize: 12, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 17, fontWeight: '800' },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  itemActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemActionText: { fontSize: 12, fontWeight: '500' },
  // Empty
  emptyCard: { alignItems: 'center', padding: 40, borderRadius: 16, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },
  emptyBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  modalTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  saveText: { fontSize: FontSizes.body, fontWeight: '600', color: '#1E40AF' },
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
