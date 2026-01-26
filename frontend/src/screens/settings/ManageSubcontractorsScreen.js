import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAllTrades, getTradeById } from '../../constants/trades';
import {
  getSubcontractorQuotesGroupedByTrade,
  togglePreferredStatus,
  deleteSubcontractorQuote,
} from '../../utils/storage';
import SubcontractorQuoteCard from '../../components/SubcontractorQuoteCard';

export default function ManageSubcontractorsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotesGrouped, setQuotesGrouped] = useState({});
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [expandedTrades, setExpandedTrades] = useState(new Set());
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const grouped = await getSubcontractorQuotesGroupedByTrade();
      setQuotesGrouped(grouped);

      // Auto-expand first trade if exists
      const firstTrade = Object.keys(grouped)[0];
      if (firstTrade && expandedTrades.size === 0) {
        setExpandedTrades(new Set([firstTrade]));
      }
    } catch (error) {
      console.error('Error loading quotes:', error);
      Alert.alert('Error', 'Failed to load subcontractor quotes');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadQuotes();
    setRefreshing(false);
  };

  const handleTogglePreferred = async (quoteId, isPreferred) => {
    const success = await togglePreferredStatus(quoteId, isPreferred);
    if (success) {
      // Reload quotes to reflect changes
      await loadQuotes();
    } else {
      Alert.alert('Error', 'Failed to update preferred status');
    }
  };

  const handleDeleteQuote = (quoteId, contractorName) => {
    Alert.alert(
      'Delete Quote',
      `Are you sure you want to delete the quote from ${contractorName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteSubcontractorQuote(quoteId);
            if (success) {
              await loadQuotes();
            } else {
              Alert.alert('Error', 'Failed to delete quote');
            }
          },
        },
      ]
    );
  };

  const handleQuotePress = (quote) => {
    setSelectedQuote(quote);
    setShowQuoteModal(true);
  };

  const toggleTradeExpansion = (tradeId) => {
    const newExpanded = new Set(expandedTrades);
    if (newExpanded.has(tradeId)) {
      newExpanded.delete(tradeId);
    } else {
      newExpanded.add(tradeId);
    }
    setExpandedTrades(newExpanded);
  };

  const getTotalQuotesCount = () => {
    return Object.values(quotesGrouped).reduce((sum, quotes) => sum + quotes.length, 0);
  };

  const getPreferredQuotesCount = () => {
    return Object.values(quotesGrouped).reduce(
      (sum, quotes) => sum + quotes.filter(q => q.is_preferred).length,
      0
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
            Loading quotes...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const tradesWithQuotes = Object.keys(quotesGrouped);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          Subcontractor Quotes
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Summary */}
      <View style={[styles.statsContainer, { backgroundColor: Colors.white }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: Colors.primaryBlue }]}>
            {getTotalQuotesCount()}
          </Text>
          <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>
            Total Quotes
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: Colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#F59E0B' }]}>
            {getPreferredQuotesCount()}
          </Text>
          <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>
            Preferred
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: Colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: Colors.primaryBlue }]}>
            {tradesWithQuotes.length}
          </Text>
          <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>
            Trades
          </Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {tradesWithQuotes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={Colors.lightGray} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
              No Quotes Yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
              Upload subcontractor quotes during General Contractor setup or add them anytime.
            </Text>
          </View>
        ) : (
          tradesWithQuotes.map((tradeId) => {
            const trade = getTradeById(tradeId);
            const quotes = quotesGrouped[tradeId];
            const isExpanded = expandedTrades.has(tradeId);
            const preferredCount = quotes.filter(q => q.is_preferred).length;

            return (
              <View key={tradeId} style={styles.tradeSection}>
                {/* Trade Header */}
                <TouchableOpacity
                  style={[styles.tradeHeader, { backgroundColor: Colors.white }]}
                  onPress={() => toggleTradeExpansion(tradeId)}
                  activeOpacity={0.7}
                >
                  <View style={styles.tradeHeaderLeft}>
                    <View style={[styles.tradeIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
                      <Ionicons name={trade?.icon || 'hammer-outline'} size={24} color={Colors.primaryBlue} />
                    </View>
                    <View style={styles.tradeInfo}>
                      <Text style={[styles.tradeName, { color: Colors.primaryText }]}>
                        {trade?.name || tradeId}
                      </Text>
                      <View style={styles.tradeStats}>
                        <Text style={[styles.tradeStatsText, { color: Colors.secondaryText }]}>
                          {quotes.length} quote{quotes.length > 1 ? 's' : ''}
                        </Text>
                        {preferredCount > 0 && (
                          <>
                            <View style={[styles.dot, { backgroundColor: Colors.secondaryText }]} />
                            <Ionicons name="star" size={12} color="#F59E0B" />
                            <Text style={[styles.tradeStatsText, { color: '#F59E0B' }]}>
                              {preferredCount} preferred
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={24}
                    color={Colors.secondaryText}
                  />
                </TouchableOpacity>

                {/* Quotes List */}
                {isExpanded && (
                  <View style={styles.quotesContainer}>
                    {quotes.map((quote) => (
                      <SubcontractorQuoteCard
                        key={quote.id}
                        quote={quote}
                        onPress={() => handleQuotePress(quote)}
                        onTogglePreferred={handleTogglePreferred}
                        onDelete={() => handleDeleteQuote(quote.id, quote.subcontractor_name)}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add Quote Button */}
      {tradesWithQuotes.length > 0 && (
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => navigation.navigate('GeneralContractorSetup')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add More Quotes</Text>
          </TouchableOpacity>
        </View>
      )}
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
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    marginHorizontal: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  tradeSection: {
    marginBottom: Spacing.md,
  },
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  tradeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tradeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  tradeInfo: {
    flex: 1,
  },
  tradeName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  tradeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tradeStatsText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  quotesContainer: {
    marginTop: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  bottomSection: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  addButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
