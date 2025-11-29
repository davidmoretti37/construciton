import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchInvoices } from '../../utils/storage';

export default function InvoicesDetailScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce) {
        loadInvoices();
      }
    }, [hasLoadedOnce])
  );

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const allInvoices = await fetchInvoices();
      setInvoices(allInvoices || []);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvoices();
    setRefreshing(false);
  }, []);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return '#10B981';
      case 'partial':
        return '#F59E0B';
      case 'unpaid':
        return '#6B7280';
      case 'overdue':
        return '#EF4444';
      default:
        return Colors.primaryBlue;
    }
  };

  const isOverdue = (dueDate, status) => {
    if (!dueDate || status?.toLowerCase() === 'paid') return false;
    return new Date(dueDate) < new Date();
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    const actualStatus = isOverdue(inv.dueDate, inv.status) ? 'overdue' : inv.status?.toLowerCase();
    const matchesStatus = statusFilter === 'All' || actualStatus === statusFilter.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      inv.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Calculate stats
  const stats = {
    total: invoices.length,
    unpaid: invoices.filter(i => i.status?.toLowerCase() === 'unpaid').length,
    partial: invoices.filter(i => i.status?.toLowerCase() === 'partial').length,
    paid: invoices.filter(i => i.status?.toLowerCase() === 'paid').length,
    overdue: invoices.filter(i => isOverdue(i.dueDate, i.status)).length,
    totalValue: invoices.reduce((sum, i) => sum + (i.total || 0), 0),
    outstanding: invoices
      .filter(i => i.status?.toLowerCase() !== 'paid')
      .reduce((sum, i) => sum + (i.total || 0) - (i.paidAmount || 0), 0),
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>All Invoices</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
          <View style={[styles.statCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <Text style={[styles.statValue, { color: Colors.primaryBlue }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: Colors.primaryBlue }]}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#6B7280' + '10', borderColor: '#6B7280' + '30' }]}>
            <Text style={[styles.statValue, { color: '#6B7280' }]}>{stats.unpaid}</Text>
            <Text style={[styles.statLabel, { color: '#6B7280' }]}>Unpaid</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F59E0B' + '10', borderColor: '#F59E0B' + '30' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.partial}</Text>
            <Text style={[styles.statLabel, { color: '#F59E0B' }]}>Partial</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#10B981' + '10', borderColor: '#10B981' + '30' }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.paid}</Text>
            <Text style={[styles.statLabel, { color: '#10B981' }]}>Paid</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#EF4444' + '10', borderColor: '#EF4444' + '30' }]}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.overdue}</Text>
            <Text style={[styles.statLabel, { color: '#EF4444' }]}>Overdue</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
            <Text style={[styles.statValue, { color: Colors.primaryText }]}>${stats.outstanding.toLocaleString()}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Outstanding</Text>
          </View>
        </ScrollView>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={[styles.searchBar, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Ionicons name="search" size={20} color={Colors.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: Colors.primaryText }]}
              placeholder="Search by client or invoice #..."
              placeholderTextColor={Colors.secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {['All', 'Unpaid', 'Partial', 'Paid', 'Overdue'].map(filter => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                { backgroundColor: statusFilter === filter ? Colors.primaryBlue : Colors.lightGray },
              ]}
              onPress={() => setStatusFilter(filter)}
            >
              <Text style={[styles.filterText, { color: statusFilter === filter ? '#fff' : Colors.secondaryText }]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Invoices List */}
        <View style={styles.listSection}>
          {filteredInvoices.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="receipt-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                {searchQuery || statusFilter !== 'All' ? 'No invoices match your filters' : 'No invoices created yet'}
              </Text>
            </View>
          ) : (
            filteredInvoices.map((invoice) => {
              const actualStatus = isOverdue(invoice.dueDate, invoice.status) ? 'overdue' : invoice.status;
              const remaining = (invoice.total || 0) - (invoice.paidAmount || 0);

              return (
                <TouchableOpacity
                  key={invoice.id}
                  style={[styles.invoiceCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                  onPress={() => {/* TODO: Navigate to invoice detail */}}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={[styles.clientName, { color: Colors.primaryText }]}>
                        {invoice.clientName}
                      </Text>
                      <Text style={[styles.invoiceNumber, { color: Colors.secondaryText }]}>
                        #{invoice.invoiceNumber || 'N/A'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(actualStatus) + '20' },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: getStatusColor(actualStatus) }]}>
                        {actualStatus || 'Unpaid'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardBody}>
                    <View>
                      <View style={styles.infoRow}>
                        <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                        <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                          Due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}
                        </Text>
                      </View>
                      {invoice.status?.toLowerCase() === 'partial' && (
                        <Text style={[styles.paidAmount, { color: '#10B981' }]}>
                          Paid: ${invoice.paidAmount?.toLocaleString() || '0'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.amountColumn}>
                      <Text style={[styles.amount, { color: Colors.primaryText }]}>
                        ${invoice.total?.toLocaleString() || '0'}
                      </Text>
                      {invoice.status?.toLowerCase() === 'partial' && (
                        <Text style={[styles.remaining, { color: '#F59E0B' }]}>
                          ${remaining.toLocaleString()} left
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  statsScroll: {
    padding: 20,
  },
  statCard: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    minWidth: 100,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  filterScroll: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listSection: {
    paddingHorizontal: 20,
  },
  emptyState: {
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  invoiceCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
  },
  paidAmount: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
  },
  remaining: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
