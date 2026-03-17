/**
 * BankConnectionScreen
 * Connect bank accounts via Teller Connect or upload CSV statements.
 * Owner-only screen.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getConnectConfig,
  saveEnrollment,
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
  const [showTellerConnect, setShowTellerConnect] = useState(false);
  const [tellerAppId, setTellerAppId] = useState(null);
  const [tellerEnv, setTellerEnv] = useState('sandbox');

  const loadAccounts = async () => {
    try {
      const result = await getConnectedAccounts();
      setAccounts(result.accounts || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [])
  );

  const handleConnectBank = async () => {
    try {
      setConnecting(true);

      const config = await getConnectConfig();
      setTellerAppId(config.application_id);
      setTellerEnv(config.environment || 'sandbox');
      setShowTellerConnect(true);
    } catch (error) {
      setConnecting(false);
      Alert.alert(t('common:alerts.error'), error.message || 'Failed to start bank connection');
    }
  };

  const handleTellerMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'success') {
        setShowTellerConnect(false);
        await saveEnrollment(data.accessToken, data.enrollment);

        Alert.alert(
          t('bank.accountConnected'),
          t('bank.accountConnectedDesc', { name: data.enrollment?.institution?.name || 'Bank account' })
        );
        loadAccounts();
      } else if (data.type === 'exit') {
        setShowTellerConnect(false);
      }
    } catch (error) {
      Alert.alert(t('common:alerts.error'), error.message || 'Failed to connect account');
    } finally {
      setConnecting(false);
    }
  };

  const getTellerConnectHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background: #fff; }
        </style>
      </head>
      <body>
        <script src="https://cdn.teller.io/connect/connect.js"></script>
        <script>
          var tellerConnect = TellerConnect.setup({
            applicationId: "${tellerAppId}",
            environment: "${tellerEnv}",
            products: ["transactions"],
            onSuccess: function(enrollment) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: "success",
                accessToken: enrollment.accessToken,
                enrollment: enrollment
              }));
            },
            onExit: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: "exit"
              }));
            }
          });
          tellerConnect.open();
        </script>
      </body>
      </html>
    `;
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

  const getAccountIcon = (type) => {
    switch (type) {
      case 'credit': return 'card';
      case 'depository':
      case 'checking':
      case 'savings': return 'wallet';
      default: return 'card';
    }
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

        {/* Connected Accounts List */}
        {accounts.length > 0 ? (
          <View style={styles.accountsSection}>
            <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
              {t('bank.yourAccounts')}
            </Text>
            {accounts.map((account) => (
              <View
                key={account.id}
                style={[styles.accountCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
              >
                <View style={styles.accountHeader}>
                  <View style={[styles.accountIcon, { backgroundColor: OWNER_COLORS.primaryLight }]}>
                    <Ionicons
                      name={getAccountIcon(account.account_type)}
                      size={20}
                      color={OWNER_COLORS.primary}
                    />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, { color: Colors.primaryText }]}>
                      {account.institution_name}
                    </Text>
                    <Text style={[styles.accountDetail, { color: Colors.secondaryText }]}>
                      {account.account_name} {account.account_mask ? `****${account.account_mask}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(account.sync_status) + '20' }]}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(account.sync_status) }]} />
                    <Text style={[styles.statusText, { color: getStatusColor(account.sync_status) }]}>
                      {getStatusLabel(account.sync_status)}
                    </Text>
                  </View>
                </View>

                {account.sync_error && (
                  <View style={[styles.errorBanner, { backgroundColor: OWNER_COLORS.danger + '10' }]}>
                    <Ionicons name="warning" size={14} color={OWNER_COLORS.danger} />
                    <Text style={[styles.errorText, { color: OWNER_COLORS.danger }]}>{account.sync_error}</Text>
                  </View>
                )}

                <View style={[styles.accountFooter, { borderTopColor: Colors.border }]}>
                  <Text style={[styles.lastSync, { color: Colors.secondaryText }]}>
                    {account.is_manual ? t('bank.csvImport') : t('bank.lastSynced', { time: formatLastSync(account.last_sync_at) })}
                  </Text>
                  <View style={styles.accountActions}>
                    {!account.is_manual && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleSync(account.id)}
                        disabled={syncing[account.id]}
                      >
                        {syncing[account.id] ? (
                          <ActivityIndicator size="small" color={OWNER_COLORS.primary} />
                        ) : (
                          <Ionicons name="sync" size={18} color={OWNER_COLORS.primary} />
                        )}
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDisconnect(account.id, account.institution_name)}
                    >
                      <Ionicons name="trash-outline" size={18} color={OWNER_COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
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

      {/* Teller Connect WebView Modal */}
      <Modal
        visible={showTellerConnect}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowTellerConnect(false);
          setConnecting(false);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowTellerConnect(false);
                setConnecting(false);
              }}
              style={styles.modalClose}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Connect Bank</Text>
            <View style={{ width: 40 }} />
          </View>
          {tellerAppId && (
            <WebView
              source={{ html: getTellerConnectHTML() }}
              onMessage={handleTellerMessage}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scrollEnabled={true}
              bounces={false}
              allowsInlineMediaPlayback
              mixedContentMode="compatibility"
              originWhitelist={['*']}
              style={{ flex: 1, opacity: 0.99 }}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
                </View>
              )}
            />
          )}
        </SafeAreaView>
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
  accountCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  accountDetail: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  errorText: {
    fontSize: FontSizes.tiny,
    flex: 1,
  },
  accountFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  lastSync: {
    fontSize: FontSizes.tiny,
  },
  accountActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionBtn: {
    padding: Spacing.xs,
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalClose: {
    padding: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    color: '#333',
  },
});
