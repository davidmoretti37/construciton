import React, { useState, useCallback } from 'react';
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
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../constants/transactionCategories';
import {
  fetchRecurringExpenses,
  addRecurringExpense,
  deleteRecurringExpense,
  updateRecurringExpense,
} from '../../utils/storage/recurringExpenses';

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const CATEGORIES = ['materials', 'equipment', 'permits', 'subcontractor', 'misc'];

const formatCurrency = (amount) => {
  return `$${parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function RecurringExpenseScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { t } = useTranslation('owner');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('misc');
  const [formFrequency, setFormFrequency] = useState('monthly');
  const [formNextDate, setFormNextDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchRecurringExpenses();
      setItems(data);
    } catch (error) {
      console.error('Error loading recurring expenses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!formDesc.trim()) {
      Alert.alert('Required', 'Please enter a description');
      return;
    }
    if (!formAmount || parseFloat(formAmount) <= 0) {
      Alert.alert('Required', 'Please enter a valid amount');
      return;
    }

    const newItem = {
      id: `temp-${Date.now()}`,
      description: formDesc.trim(),
      amount: parseFloat(formAmount),
      category: formCategory,
      frequency: formFrequency,
      next_due_date: formNextDate,
      is_active: true,
    };

    // Optimistic: add to list, close modal instantly
    setItems(prev => [newItem, ...prev]);
    setShowAddModal(false);
    setFormDesc('');
    setFormAmount('');
    setFormCategory('misc');
    setFormFrequency('monthly');

    try {
      await addRecurringExpense({
        description: newItem.description,
        amount: newItem.amount,
        category: newItem.category,
        frequency: newItem.frequency,
        next_due_date: newItem.next_due_date,
      });
      loadData(); // Refresh to get real ID from server
    } catch (error) {
      setItems(prev => prev.filter(i => i.id !== newItem.id));
      Alert.alert('Error', 'Failed to add recurring expense');
    }
  };

  const handleToggleActive = (item) => {
    // Optimistic: toggle instantly
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));

    updateRecurringExpense(item.id, { is_active: !item.is_active }).catch(() => {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: item.is_active } : i));
      Alert.alert('Error', 'Failed to update expense');
    });
  };

  const handleDelete = (item) => {
    Alert.alert(
      t('recurring.deleteTitle'),
      t('recurring.deleteConfirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: () => {
            // Optimistic: remove instantly
            setItems(prev => prev.filter(i => i.id !== item.id));

            deleteRecurringExpense(item.id).catch(() => {
              setItems(prev => [...prev, item]);
              Alert.alert('Error', 'Failed to delete expense');
            });
          },
        },
      ]
    );
  };

  const totalMonthly = items
    .filter(i => i.is_active)
    .reduce((sum, i) => {
      const amount = parseFloat(i.amount || 0);
      if (i.frequency === 'weekly') return sum + amount * 4.33;
      if (i.frequency === 'biweekly') return sum + amount * 2.17;
      return sum + amount;
    }, 0);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('recurring.title')}</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={24} color="#1E40AF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E40AF" />}
      >
        {/* Monthly total */}
        <View style={[styles.totalCard, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.totalLabel, { color: Colors.secondaryText }]}>{t('recurring.monthlyEstimate')}</Text>
          <Text style={[styles.totalAmount, { color: '#EF4444' }]}>{formatCurrency(totalMonthly)}/mo</Text>
          <Text style={[styles.totalSub, { color: Colors.secondaryText }]}>
            {items.filter(i => i.is_active).length} {t('recurring.activeExpenses')}
          </Text>
        </View>

        {/* List */}
        {items.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="repeat-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>{t('recurring.noRecurring')}</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('recurring.noRecurringDesc')}</Text>
          </View>
        ) : (
          items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.itemCard,
                { backgroundColor: Colors.cardBackground },
                !item.is_active && styles.itemCardInactive,
              ]}
            >
              <View style={styles.itemHeader}>
                <View style={[styles.catDot, { backgroundColor: CATEGORY_COLORS[item.category] || '#6B7280' }]} />
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemDesc, { color: item.is_active ? Colors.primaryText : Colors.secondaryText }]} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={[styles.itemMeta, { color: Colors.secondaryText }]}>
                    {CATEGORY_LABELS[item.category] || item.category}
                    {' · '}
                    {FREQUENCIES.find(f => f.value === item.frequency)?.label || item.frequency}
                  </Text>
                </View>
                <Text style={[styles.itemAmount, { color: item.is_active ? '#EF4444' : Colors.secondaryText }]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
              <View style={styles.itemFooter}>
                <Text style={[styles.itemNextDate, { color: Colors.secondaryText }]}>
                  {t('recurring.nextDue')}: {item.next_due_date}
                </Text>
                <View style={styles.itemActions}>
                  <TouchableOpacity onPress={() => handleToggleActive(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color={Colors.secondaryText} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
              {item.projects?.name && (
                <Text style={[styles.itemProject, { color: Colors.secondaryText }]}>
                  <Ionicons name="briefcase-outline" size={10} color={Colors.secondaryText} /> {item.projects.name}
                </Text>
              )}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('recurring.addNew')}</Text>
            <TouchableOpacity onPress={handleAdd} disabled={saving}>
              <Text style={[styles.saveText, saving && { color: Colors.secondaryText }]}>
                {saving ? '...' : t('common:save')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('recurring.description')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: Colors.cardBackground, color: Colors.primaryText, borderColor: Colors.border }]}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder="e.g., Equipment rental, Insurance"
                placeholderTextColor={Colors.placeholderText}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('recurring.amount')}</Text>
              <View style={[styles.amountRow, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
                <Text style={[styles.currencySign, { color: Colors.secondaryText }]}>$</Text>
                <TextInput
                  style={[styles.amountInput, { color: Colors.primaryText }]}
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.placeholderText}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('recurring.category')}</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, formCategory === cat && { backgroundColor: CATEGORY_COLORS[cat] + '20', borderColor: CATEGORY_COLORS[cat] }]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <View style={[styles.chipDot, { backgroundColor: CATEGORY_COLORS[cat] }]} />
                    <Text style={[styles.chipText, { color: formCategory === cat ? Colors.primaryText : Colors.secondaryText }]}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('recurring.frequency')}</Text>
              <View style={styles.chipRow}>
                {FREQUENCIES.map(f => (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.chip, formFrequency === f.value && { backgroundColor: '#EFF6FF', borderColor: '#1E40AF' }]}
                    onPress={() => setFormFrequency(f.value)}
                  >
                    <Text style={[styles.chipText, { color: formFrequency === f.value ? '#1E40AF' : Colors.secondaryText }]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: Colors.primaryText }]}>{t('recurring.nextDueDate')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: Colors.cardBackground, color: Colors.primaryText, borderColor: Colors.border }]}
                value={formNextDate}
                onChangeText={setFormNextDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.placeholderText}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700', letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md },
  totalCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalLabel: { fontSize: FontSizes.small },
  totalAmount: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  totalSub: { fontSize: FontSizes.tiny, marginTop: 4 },
  itemCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  itemCardInactive: { opacity: 0.5 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  itemInfo: { flex: 1 },
  itemDesc: { fontSize: FontSizes.body, fontWeight: '600' },
  itemMeta: { fontSize: FontSizes.tiny, marginTop: 2 },
  itemAmount: { fontSize: FontSizes.body, fontWeight: '700' },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  itemNextDate: { fontSize: FontSizes.tiny },
  itemActions: { flexDirection: 'row', gap: Spacing.md },
  itemProject: { fontSize: FontSizes.tiny, marginTop: 4 },
  emptyCard: { alignItems: 'center', padding: Spacing.xxl, borderRadius: BorderRadius.lg, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSizes.body, fontWeight: '600' },
  emptyText: { fontSize: FontSizes.small, textAlign: 'center' },
  // Modal styles
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
  saveText: { fontSize: FontSizes.body, fontWeight: '600', color: '#1E40AF' },
  modalScroll: { flex: 1 },
  modalContent: { padding: Spacing.lg, gap: Spacing.lg },
  formSection: { gap: Spacing.sm },
  formLabel: { fontSize: FontSizes.small, fontWeight: '600' },
  formInput: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: 1,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  currencySign: { fontSize: 18, fontWeight: '600', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: FontSizes.small, fontWeight: '500' },
});
