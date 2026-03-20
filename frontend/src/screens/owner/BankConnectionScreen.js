/**
 * BankConnectionScreen
 * Connect bank accounts via Teller Connect (opens in Safari) or upload CSV statements.
 * Owner-only screen.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getConnectSession,
  getConnectedAccounts,
  disconnectAccount,
  syncAccount,
  uploadCSV,
} from '../../services/bankService';

const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#1E40AF20',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

export default function BankConnectionScreen() {
  const navigation = useNavigation();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState({});
  const [uploading, setUploading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newAccountIds, setNewAccountIds] = useState([]);
  const [isFreshStart, setIsFreshStart] = useState(true);
  const [monthsBack, setMonthsBack] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  const getFromDate = () => {
    if (isFreshStart) return new Date().toISOString().split('T')[0];
    const months = parseInt(monthsBack, 10) || 1;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
  };

  const loadAccounts = async () => {
    try {
      const result = await getConnectedAccounts();
      const accts = result.accounts || [];
      setAccounts(accts);

      // Check for never-synced accounts — these need the import date picker
      const neverSynced = accts.filter(a => !a.last_sync_at && !a.is_manual && a.sync_status === 'active');
      if (neverSynced.length > 0 && !showImportModal) {
        setNewAccountIds(neverSynced.map(a => a.id));
        setIsFreshStart(true);
        setMonthsBack('');
        setShowImportModal(true);
        setConnecting(false);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setConnecting(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [])
  );

  // Also reload when app returns to foreground (from Safari)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadAccounts();
      }
    });
    return () => sub.remove();
  }, []);

  const handleConnectBank = async () => {
    try {
      setConnecting(true);
      const { url } = await getConnectSession();
      await Linking.openURL(url);
    } catch (error) {
      setConnecting(false);
      Alert.alert(t('common:alerts.error'), error.message || 'Failed to start bank connection');
    }
  };

  const handleUploadCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setUploading(true);
      const file = result.assets[0];
      const csvContent = await FileSystem.readAsStringAsync(file.uri);

      Alert.prompt(
        t('bank.bankName'),
        t('bank.bankNamePrompt'),
        [
          { text: t('common:buttons.cancel'), style: 'cancel', onPress: () => setUploading(false) },
          {
            text: t('bank.import'),
            onPress: async (bankName) => {
              try {
                const importResult = await uploadCSV(csvContent, file.name, bankName || 'CSV Import');
                Alert.alert(
                  t('bank.importComplete'),
                  t('bank.importCompleteDesc', { added: importResult.transactions_added, matched: importResult.auto_matched, unmatched: importResult.unmatched }),
                  [
                    {
                      text: t('bank.reviewNow'),
                      onPress: () => navigation.navigate('BankReconciliation'),
                    },
                    { text: t('common:buttons.ok') },
                  ]
                );
                loadAccounts();
              } catch (error) {
                Alert.alert(t('bank.importError'), error.message || 'Failed to import CSV');
              } finally {
                setUploading(false);
              }
            },
          },
        ],
        'plain-text',
        '',
        'default'
      );
    } catch (error) {
      setUploading(false);
      Alert.alert(t('common:alerts.error'), error.message || 'Failed to pick file');
    }
  };

  const handleSync = async (accountId) => {
    try {
      setSyncing(prev => ({ ...prev, [accountId]: true }));
      const result = await syncAccount(accountId);
      Alert.alert(
        t('bank.syncComplete'),
        t('bank.syncCompleteDesc', { added: result.transactions_added, matched: result.auto_matched, unmatched: result.unmatched })
      );
      loadAccounts();
    } catch (error) {
      Alert.alert(t('bank.syncError'), error.message || 'Failed to sync account');
    } finally {
      setSyncing(prev => ({ ...prev, [accountId]: false }));
    }
  };

  const handleDisconnect = (accountId, accountName) => {
    Alert.alert(
      t('bank.disconnectAccount'),
      t('bank.disconnectConfirm', { name: accountName }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('bank.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectAccount(accountId);
              loadAccounts();
            } catch (error) {
              Alert.alert(t('common:alerts.error'), error.message || 'Failed to disconnect account');
            }
          },
        },
      ]
    );
  };

  const handleImportRange = async () => {
    if (!isFreshStart && (!monthsBack || parseInt(monthsBack, 10) < 1)) {
      Alert.alert('Enter months', 'Please enter how many months back to import.');
      return;
    }

    const fromDate = getFromDate();
    setImportLoading(true);
    try {
      for (const accountId of newAccountIds) {
        await syncAccount(accountId, fromDate);
      }
      setShowImportModal(false);
      setNewAccountIds([]);
      loadAccounts();
      Alert.alert(
        t('bank.accountConnected'),
        isFreshStart
          ? 'Your account is connected! Transactions will be tracked from now on.'
          : `Imported transactions from the last ${monthsBack} month${parseInt(monthsBack, 10) > 1 ? 's' : ''}.`,
        [
          { text: 'Review', onPress: () => navigation.navigate('BankReconciliation') },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      Alert.alert('Import Error', error.message || 'Failed to import transactions');
    } finally {
      setImportLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return OWNER_COLORS.success;
      case 'error': return OWNER_COLORS.danger;
      case 'paused': return OWNER_COLORS.warning;
      default: return Colors.secondaryText;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return t('bank.statusConnected');
      case 'error': return t('bank.statusError');
      case 'paused': return t('bank.statusPaused');
      default: return status;
    }
  };

  const formatLastSync = (dateStr) => {
    if (!dateStr) return t('bank.neverSynced');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHrs < 1) return t('bank.justNow');
    if (diffHrs < 24) return t('bank.hoursAgo', { count: diffHrs });
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return t('common:time.yesterday');
    return t('bank.daysAgo', { count: diffDays });
  };

  const getCardGradient = (type, subtype) => {
    if (type === 'credit') return ['#1E3A8A', '#4338CA'];
    if (subtype === 'checking') return ['#064E3B', '#0D9488'];
    if (subtype === 'savings') return ['#4C1D95', '#7C3AED'];
    if (subtype === 'money_market') return ['#7C2D12', '#EA580C'];
    return ['#1E293B', '#475569'];
  };

  const getCardIcon = (type) => {
    if (type === 'credit') return 'card';
    return 'wallet';
  };

  const formatCardNumber = (mask) => {
    if (!mask) return '';
    return `\u2022\u2022\u2022\u2022  \u2022\u2022\u2022\u2022  \u2022\u2022\u2022\u2022  ${mask}`;
  };

  const formatAccountType = (type, subtype) => {
    if (type === 'credit') return 'CREDIT CARD';
    if (subtype === 'checking') return 'CHECKING';
    if (subtype === 'savings') return 'SAVINGS';
    if (subtype === 'money_market') return 'MONEY MARKET';
    return (type || 'ACCOUNT').toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('bank.connectedAccounts')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAccounts(); }} />
        }
      >
        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.connectButton, { backgroundColor: OWNER_COLORS.primary }]}
            onPress={handleConnectBank}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="card-outline" size={22} color="#FFF" />
            )}
            <Text style={styles.connectButtonText}>{t('bank.connectBankAccount')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.csvButton, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
            onPress={handleUploadCSV}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={OWNER_COLORS.primary} size="small" />
            ) : (
              <Ionicons name="document-text-outline" size={22} color={OWNER_COLORS.primary} />
            )}
            <Text style={[styles.csvButtonText, { color: OWNER_COLORS.primary }]}>{t('bank.uploadCSV')}</Text>
          </TouchableOpacity>
        </View>

        {/* Connected Accounts — Wallet-style Cards */}
        {accounts.length > 0 ? (
          <View style={styles.accountsSection}>
            <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
              {t('bank.yourAccounts')}
            </Text>
            {accounts.map((account) => (
              <View key={account.id} style={styles.walletCardWrapper}>
                <LinearGradient
                  colors={getCardGradient(account.account_type, account.account_subtype)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.walletCard}
                >
                  {/* Top row: bank name + status */}
                  <View style={styles.walletCardTop}>
                    <View style={styles.walletBankRow}>
                      <Ionicons name={getCardIcon(account.account_type)} size={20} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.walletBankName}>{account.institution_name}</Text>
                    </View>
                    <View style={[styles.walletStatus, { backgroundColor: account.sync_status === 'active' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.15)' }]}>
                      <View style={[styles.walletStatusDot, { backgroundColor: getStatusColor(account.sync_status) }]} />
                      <Text style={styles.walletStatusText}>{getStatusLabel(account.sync_status)}</Text>
                    </View>
                  </View>

                  {/* Account name */}
                  <Text style={styles.walletAccountName}>{account.account_name}</Text>

                  {/* Card number */}
                  {account.account_mask && (
                    <Text style={styles.walletCardNumber}>{formatCardNumber(account.account_mask)}</Text>
                  )}

                  {/* Error banner */}
                  {account.sync_error && (() => {
                    const isExpired = account.sync_error.includes('not_found') || account.sync_error.includes('404') || account.sync_error.includes('unauthorized') || account.sync_error.includes('401');
                    return isExpired ? (
                      <View style={styles.walletExpired}>
                        <Ionicons name="link-outline" size={14} color="#FCA5A5" />
                        <Text style={styles.walletExpiredText}>Connection expired — reconnect this account</Text>
                        <TouchableOpacity
                          style={styles.walletReconnectBtn}
                          onPress={() => {
                            handleDisconnect(account.id, account.institution_name);
                          }}
                        >
                          <Text style={styles.walletReconnectText}>Remove & Reconnect</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.walletError}>
                        <Ionicons name="warning" size={12} color="#FCA5A5" />
                        <Text style={styles.walletErrorText}>{account.sync_error}</Text>
                      </View>
                    );
                  })()}

                  {/* Bottom row: type + actions */}
                  <View style={styles.walletCardBottom}>
                    <View>
                      <Text style={styles.walletTypeLabel}>{formatAccountType(account.account_type, account.account_subtype)}</Text>
                      <Text style={styles.walletSyncText}>
                        {account.is_manual ? t('bank.csvImport') : formatLastSync(account.last_sync_at)}
                      </Text>
                    </View>
                    <View style={styles.walletActions}>
                      {!account.is_manual && (
                        <TouchableOpacity
                          style={styles.walletActionBtn}
                          onPress={() => handleSync(account.id)}
                          disabled={syncing[account.id]}
                        >
                          {syncing[account.id] ? (
                            <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
                          ) : (
                            <Ionicons name="sync" size={18} color="rgba(255,255,255,0.8)" />
                          )}
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.walletActionBtn}
                        onPress={() => handleDisconnect(account.id, account.institution_name)}
                      >
                        <Ionicons name="trash-outline" size={18} color="rgba(255,200,200,0.8)" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
              {t('bank.noAccountsConnected')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
              {t('bank.noAccountsDesc')}
            </Text>
          </View>
        )}

        {/* View Reconciliation Link */}
        {accounts.length > 0 && (
          <TouchableOpacity
            style={[styles.reconcileLink, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('BankReconciliation')}
          >
            <Ionicons name="git-compare-outline" size={22} color={OWNER_COLORS.primary} />
            <View style={styles.reconcileLinkText}>
              <Text style={[styles.reconcileLinkTitle, { color: Colors.primaryText }]}>
                {t('bank.viewReconciliation')}
              </Text>
              <Text style={[styles.reconcileLinkSubtitle, { color: Colors.secondaryText }]}>
                {t('bank.matchTransactions')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Import Range Modal */}
      <Modal visible={showImportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              How far back should we import?
            </Text>
            <Text style={[styles.modalSubtitle, { color: Colors.secondaryText }]}>
              Choose to start fresh or import past transactions
            </Text>

            <View style={styles.rangeOptions}>
              {/* Fresh Start Option */}
              <TouchableOpacity
                style={[
                  styles.rangeOption,
                  { borderColor: isFreshStart ? OWNER_COLORS.primary : Colors.border },
                  isFreshStart && { backgroundColor: OWNER_COLORS.primary + '08' },
                ]}
                onPress={() => setIsFreshStart(true)}
                disabled={importLoading}
              >
                <View style={[
                  styles.rangeRadio,
                  { borderColor: isFreshStart ? OWNER_COLORS.primary : Colors.border },
                  isFreshStart && { backgroundColor: OWNER_COLORS.primary },
                ]}>
                  {isFreshStart && <View style={styles.rangeRadioDot} />}
                </View>
                <Ionicons name="flash-outline" size={20} color={isFreshStart ? OWNER_COLORS.primary : Colors.secondaryText} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rangeLabel, { color: Colors.primaryText }]}>Fresh Start</Text>
                  <Text style={[styles.rangeDesc, { color: Colors.secondaryText }]}>Track from today — no past transactions</Text>
                </View>
              </TouchableOpacity>

              {/* Import Past Months Option */}
              <TouchableOpacity
                style={[
                  styles.rangeOption,
                  { borderColor: !isFreshStart ? OWNER_COLORS.primary : Colors.border },
                  !isFreshStart && { backgroundColor: OWNER_COLORS.primary + '08' },
                ]}
                onPress={() => setIsFreshStart(false)}
                disabled={importLoading}
              >
                <View style={[
                  styles.rangeRadio,
                  { borderColor: !isFreshStart ? OWNER_COLORS.primary : Colors.border },
                  !isFreshStart && { backgroundColor: OWNER_COLORS.primary },
                ]}>
                  {!isFreshStart && <View style={styles.rangeRadioDot} />}
                </View>
                <Ionicons name="calendar-outline" size={20} color={!isFreshStart ? OWNER_COLORS.primary : Colors.secondaryText} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rangeLabel, { color: Colors.primaryText }]}>Import Past Transactions</Text>
                  <Text style={[styles.rangeDesc, { color: Colors.secondaryText }]}>Choose how many months to go back</Text>
                </View>
              </TouchableOpacity>

              {/* Month Input — only visible when not fresh start */}
              {!isFreshStart && (
                <View style={[styles.monthInputRow, { borderColor: Colors.border }]}>
                  <Text style={[styles.monthInputLabel, { color: Colors.primaryText }]}>Months back:</Text>
                  <TextInput
                    style={[styles.monthInput, { color: Colors.primaryText, borderColor: OWNER_COLORS.primary }]}
                    value={monthsBack}
                    onChangeText={(text) => setMonthsBack(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 6"
                    placeholderTextColor={Colors.secondaryText}
                    maxLength={2}
                    autoFocus
                  />
                  <Text style={[styles.monthInputHint, { color: Colors.secondaryText }]}>
                    {monthsBack ? `${parseInt(monthsBack, 10) * 30} days` : ''}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.importButton, { backgroundColor: OWNER_COLORS.primary }, importLoading && { opacity: 0.7 }]}
              onPress={handleImportRange}
              disabled={importLoading}
            >
              {importLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.importButtonText}>Importing transactions...</Text>
                </View>
              ) : (
                <Text style={styles.importButtonText}>
                  {isFreshStart ? 'Start Fresh' : 'Import Transactions'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  actionSection: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  connectButtonText: {
    color: '#FFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  csvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  csvButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  accountsSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  // Wallet-style card styles
  walletCardWrapper: {
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  walletCard: {
    borderRadius: 20,
    padding: 20,
    minHeight: 190,
    justifyContent: 'space-between',
  },
  walletCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletBankName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  walletStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  walletStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  walletStatusText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  walletAccountName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 12,
  },
  walletCardNumber: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: 2,
    marginTop: 4,
  },
  walletError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
  },
  walletErrorText: {
    color: '#FCA5A5',
    fontSize: 11,
    flex: 1,
  },
  walletExpired: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  walletExpiredText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  walletReconnectBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 2,
  },
  walletReconnectText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  walletCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
  },
  walletTypeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  walletSyncText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  walletActions: {
    flexDirection: 'row',
    gap: 12,
  },
  walletActionBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  reconcileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  reconcileLinkText: {
    flex: 1,
  },
  reconcileLinkTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  reconcileLinkSubtitle: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  // Import Range Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  rangeOptions: {
    gap: 10,
  },
  rangeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  rangeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rangeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  rangeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rangeDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  monthInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  monthInputLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  monthInput: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    width: 70,
  },
  monthInputHint: {
    fontSize: 12,
  },
  importButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  importButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
