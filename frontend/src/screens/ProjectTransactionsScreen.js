import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getProjectTransactions, deleteTransaction } from '../utils/storage';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function ProjectTransactionsScreen({ route, navigation }) {
  const { t } = useTranslation('common');
  const { projectId, projectName, transactionType } = route.params;
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState(transactionType || 'all'); // 'all', 'expense', 'income'

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const filterType = filter === 'all' ? null : filter;
      const data = await getProjectTransactions(projectId, filterType);
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'transaction history' }));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  useEffect(() => {
    loadTransactions();
  }, [filter]);

  const handleDeleteTransaction = (transaction) => {
    Alert.alert(
      t('alerts.confirm'),
      t('alerts.deleteConfirm'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(transaction.id);
              await loadTransactions();
            } catch (error) {
              Alert.alert(t('alerts.error'), t('messages.failedToDelete', { item: 'transaction' }));
            }
          },
        },
      ]
    );
  };

  const handleViewTransaction = (transaction) => {
    navigation.navigate('TransactionDetail', {
      transaction,
      projectId,
      projectName,
      onRefresh: loadTransactions,
    });
  };

  const handleAddTransaction = () => {
    navigation.navigate('TransactionEntry', {
      projectId,
      projectName,
      onSave: loadTransactions,
    });
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getCategoryIcon = (category) => {
    const icons = {
      labor: 'people',
      materials: 'construct',
      equipment: 'hammer',
      permits: 'document-text',
      other: 'ellipsis-horizontal-circle',
    };
    return icons[category] || 'cash';
  };

  const getCategoryColor = (category) => {
    const colors = {
      labor: '#3B82F6',
      materials: '#10B981',
      equipment: '#F59E0B',
      permits: '#8B5CF6',
      other: '#6B7280',
    };
    return colors[category] || '#6B7280';
  };

  const calculateTotals = () => {
    const totals = { expenses: 0, income: 0 };
    transactions.forEach(t => {
      if (t.type === 'expense') {
        totals.expenses += parseFloat(t.amount);
      } else {
        totals.income += parseFloat(t.amount);
      }
    });
    return totals;
  };

  const totals = calculateTotals();
  const filteredTransactions = transactions;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Transaction History</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {projectName}
        </Text>
        <TouchableOpacity onPress={handleAddTransaction} style={styles.addButton}>
          <Ionicons name="add" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        {(!transactionType || transactionType === 'expense') && (
          <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Total Expenses</Text>
            <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>
              {formatCurrency(totals.expenses)}
            </Text>
          </View>
        )}
        {(!transactionType || transactionType === 'income') && (
          <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Total Income</Text>
            <Text style={[styles.summaryAmount, { color: '#10B981' }]}>
              {formatCurrency(totals.income)}
            </Text>
          </View>
        )}
      </View>


      {/* Transactions List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryText} />
        }
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={Colors.secondaryText} />
            <Text style={[styles.emptyStateText, { color: Colors.primaryText }]}>No transactions yet</Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              Tap the + button to add an expense or income
            </Text>
          </View>
        ) : (
          filteredTransactions.map((transaction) => (
            <TouchableOpacity
              key={transaction.id}
              style={[styles.transactionCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => handleViewTransaction(transaction)}
              activeOpacity={0.7}
            >
              <View style={styles.transactionLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${getCategoryColor(transaction.category)}20` },
                  ]}
                >
                  <Ionicons
                    name={getCategoryIcon(transaction.category)}
                    size={20}
                    color={getCategoryColor(transaction.category)}
                  />
                </View>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionDescription}>{transaction.description}</Text>
                  <View style={styles.transactionMeta}>
                    <Text style={[styles.transactionDate, { color: Colors.secondaryText }]}>
                      {formatDate(transaction.date)}
                    </Text>
                    {transaction.payment_method && (
                      <>
                        <View style={styles.metaDot} />
                        <Text style={[styles.transactionCategory, { color: Colors.secondaryText }]}>
                          {transaction.payment_method.charAt(0).toUpperCase() + transaction.payment_method.slice(1)}
                        </Text>
                      </>
                    )}
                    {transaction.category && !transaction.payment_method && (
                      <>
                        <View style={styles.metaDot} />
                        <Text style={[styles.transactionCategory, { color: Colors.secondaryText }]}>
                          {transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1)}
                        </Text>
                      </>
                    )}
                    {transaction.is_auto_generated && (
                      <>
                        <View style={styles.metaDot} />
                        <Ionicons name="flash" size={12} color="#9CA3AF" />
                      </>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.transactionRight}>
                <Text
                  style={[
                    styles.transactionAmount,
                    { color: transaction.type === 'expense' ? '#EF4444' : '#10B981' },
                  ]}
                >
                  {transaction.type === 'expense' ? '-' : '+'}
                  {formatCurrency(transaction.amount)}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDeleteTransaction(transaction)}
                  style={styles.deleteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transactionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transactionDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#D1D5DB',
  },
  transactionCategory: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  deleteButton: {
    padding: 4,
  },
});
