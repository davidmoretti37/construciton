import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchInvoices, deleteInvoice } from '../../utils/storage';
import InvoicePreview from '../../components/ChatVisuals/InvoicePreview';

export default function InvoicesDetailScreen({ navigation }) {
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('invoices');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadInvoices();
    }, [])
  );

  // Auto-refresh when invoices change from chat
  useEffect(() => {
    const { onInvoiceChanged } = require('../../services/eventEmitter');
    return onInvoiceChanged(() => loadInvoices());
  }, []);

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
        return Colors.successGreen;
      case 'partial':
        return Colors.warningOrange;
      case 'unpaid':
        return Colors.secondaryText;
      case 'overdue':
        return Colors.errorRed;
      default:
        return Colors.primaryBlue;
    }
  };

  const isOverdue = (dueDate, status) => {
    if (!dueDate || status?.toLowerCase() === 'paid') return false;
    return new Date(dueDate) < new Date();
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('list.allInvoices')}</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('EditInvoiceSetup')}
        >
          <Ionicons name="create-outline" size={22} color={Colors.primaryBlue} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Invoices List */}
        <View style={styles.listSection}>
          {invoices.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="receipt-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                {t('list.noInvoicesYet')}
              </Text>
            </View>
          ) : (
            invoices.map((invoice) => {
              const actualStatus = isOverdue(invoice.dueDate, invoice.status) ? 'overdue' : invoice.status;
              const remaining = (invoice.total || 0) - (invoice.paidAmount || 0);

              return (
                <TouchableOpacity
                  key={invoice.id}
                  style={[styles.invoiceCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                  onPress={() => {
                    setSelectedInvoice(invoice);
                    setShowInvoiceModal(true);
                  }}
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
                        {actualStatus ? t(`status.${actualStatus}`) : t('list.unpaid')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardBody}>
                    <View>
                      <View style={styles.infoRow}>
                        <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                        <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                          {t('list.due')} {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}
                        </Text>
                      </View>
                      {invoice.status?.toLowerCase() === 'partial' && (
                        <Text style={[styles.paidAmount, { color: Colors.successGreen }]}>
                          {t('list.paid')} ${invoice.paidAmount?.toLocaleString() || '0'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.amountColumn}>
                      <Text style={[styles.amount, { color: Colors.primaryText }]}>
                        ${invoice.total?.toLocaleString() || '0'}
                      </Text>
                      {invoice.status?.toLowerCase() === 'partial' && (
                        <Text style={[styles.remaining, { color: Colors.warningOrange }]}>
                          ${remaining.toLocaleString()} {t('list.left')}
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

      {/* Invoice Detail Modal */}
      <Modal
        visible={showInvoiceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInvoiceModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowInvoiceModal(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('list.invoiceDetails')}</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Invoice Preview */}
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedInvoice && (
              <InvoicePreview
                data={{
                  ...selectedInvoice,
                  clientName: selectedInvoice.client_name || selectedInvoice.clientName,
                  clientPhone: selectedInvoice.client_phone || selectedInvoice.clientPhone,
                  clientEmail: selectedInvoice.client_email || selectedInvoice.clientEmail,
                  clientAddress: selectedInvoice.client_address || selectedInvoice.clientAddress,
                  projectName: selectedInvoice.project_name || selectedInvoice.projectName,
                  invoiceNumber: selectedInvoice.invoice_number || selectedInvoice.invoiceNumber,
                  dueDate: selectedInvoice.due_date || selectedInvoice.dueDate,
                  items: selectedInvoice.items || [],
                  subtotal: selectedInvoice.subtotal || 0,
                  taxRate: selectedInvoice.tax_rate || selectedInvoice.taxRate || 0,
                  taxAmount: selectedInvoice.tax_amount || selectedInvoice.taxAmount || 0,
                  total: selectedInvoice.total || 0,
                  amountPaid: selectedInvoice.amount_paid || selectedInvoice.amountPaid || selectedInvoice.paidAmount || 0,
                  amountDue: selectedInvoice.amount_due || selectedInvoice.amountDue || (selectedInvoice.total - (selectedInvoice.paidAmount || 0)),
                  status: selectedInvoice.status,
                }}
                onAction={(action) => {
                  // Handle actions like share, email, record payment, etc.
                  if (action.type === 'delete-invoice') {
                    Alert.alert(
                      t('confirmDelete.title'),
                      t('confirmDelete.message'),
                      [
                        { text: tCommon('buttons.cancel'), style: 'cancel' },
                        {
                          text: tCommon('buttons.delete'),
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await deleteInvoice(selectedInvoice.id);
                              setShowInvoiceModal(false);
                              loadInvoices();
                              Alert.alert(tCommon('alerts.success'), tCommon('messages.deletedSuccessfully', { item: 'Invoice' }));
                            } catch (error) {
                              Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToDelete', { item: 'invoice' }));
                            }
                          }
                        }
                      ]
                    );
                  }
                }}
              />
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerButton: {
    padding: 8,
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
    paddingTop: 20,
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
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
