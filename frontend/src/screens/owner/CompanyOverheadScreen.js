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
  `$${Math.round(parseFloat(amount || 0)).toLocaleString()}`;

const toMonthly = (amount, frequency) => {
  const f = FREQUENCIES.find(fr => fr.value === frequency);
  return parseFloat(amount || 0) * (f?.multiplier || 1);
};

export default function CompanyOverheadScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formFrequency, setFormFrequency] = useState('monthly');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchRecurringExpenses();
      setItems(data);
    } catch (error) {
      console.error('Error loading overhead:', error);
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
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item) => {
    await updateRecurringExpense(item.id, { is_active: !item.is_active });
    loadData();
  };

  const handleDelete = (item) => {
    Alert.alert('Delete', `Remove "${item.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRecurringExpense(item.id); loadData(); } },
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Company Overhead</Text>
        <TouchableOpacity onPress={openAdd} style={styles.headerBtn}>
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
                <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Monthly</Text>
                <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>{formatCurrency(totalMonthly)}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Annual</Text>
                <Text style={[styles.summaryAmount, { color: Colors.primaryText }]}>{formatCurrency(totalMonthly * 12)}</Text>
              </View>
            </View>
            <Text style={[styles.summaryCount, { color: Colors.secondaryText }]}>
              {items.filter(i => i.is_active).length} active · {items.filter(i => !i.is_active).length} paused
            </Text>
          </View>
        )}

        {/* Items List */}
        {items.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="business-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No Overhead Expenses</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              Add your fixed monthly costs like rent, car payments, insurance, subscriptions — anything your business pays regularly.
            </Text>
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: ACCENT }]} onPress={openAdd}>
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.emptyBtnText}>Add First Expense</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.itemCard, { backgroundColor: Colors.cardBackground }, !item.is_active && styles.itemInactive]}
              onPress={() => openEdit(item)}
              activeOpacity={0.7}
            >
              <View style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemDesc, { color: item.is_active ? Colors.primaryText : Colors.secondaryText }]} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={[styles.itemMeta, { color: Colors.secondaryText }]}>
                    {getFreqLabel(item.frequency)}
                    {item.frequency !== 'monthly' && ` · ${formatCurrency(toMonthly(item.amount, item.frequency))}/mo`}
                  </Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={[styles.itemAmount, { color: item.is_active ? '#EF4444' : Colors.secondaryText }]}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
              </View>
              <View style={[styles.itemFooter, { borderTopColor: Colors.border }]}>
                <TouchableOpacity
                  onPress={() => handleToggle(item)}
                  style={styles.itemActionBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={Colors.secondaryText} />
                  <Text style={[styles.itemActionText, { color: Colors.secondaryText }]}>
                    {item.is_active ? 'Pause' : 'Resume'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={styles.itemActionBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={[styles.itemActionText, { color: '#EF4444' }]}>Delete</Text>
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
            {/* Name */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>Expense Name</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: Colors.cardBackground, color: Colors.primaryText, borderColor: Colors.border }]}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder="e.g., Office Rent, Truck Payment, QuickBooks"
                placeholderTextColor={Colors.secondaryText}
                autoFocus={!editingItem}
              />
            </View>

            {/* Amount */}
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

            {/* Frequency */}
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

            {/* Monthly equivalent hint */}
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
