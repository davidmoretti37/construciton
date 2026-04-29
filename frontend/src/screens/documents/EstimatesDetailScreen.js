import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchEstimates, updateEstimate } from '../../utils/storage';
import { createProjectFromEstimate } from '../../utils/storage/estimates';
import EstimatePreview from '../../components/ChatVisuals/EstimatePreview';
import AuditTrail from '../../components/AuditTrail';
import SignatureSection from '../../components/SignatureSection';
import { supabase } from '../../lib/supabase';

export default function EstimatesDetailScreen({ navigation, route }) {
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('invoices');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Check if a specific estimateId was passed
  const targetEstimateId = route?.params?.estimateId;

  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadEstimates();
    }, [])
  );

  // Auto-refresh when estimates change from chat
  useEffect(() => {
    const { onEstimateChanged } = require('../../services/eventEmitter');
    return onEstimateChanged(() => loadEstimates());
  }, []);

  const loadEstimates = async () => {
    try {
      setLoading(true);
      const allEstimates = await fetchEstimates();
      setEstimates(allEstimates || []);
      setHasLoadedOnce(true);

      // If a specific estimateId was passed, find and show that estimate
      if (targetEstimateId && allEstimates) {
        const targetEstimate = allEstimates.find(e => e.id === targetEstimateId);
        if (targetEstimate) {
          setSelectedEstimate(targetEstimate);
          setShowEstimateModal(true);
        }
      }
    } catch (error) {
      console.error('Error loading estimates:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEstimates();
    setRefreshing(false);
  }, []);

  const handleDeleteEstimate = async (estimateId) => {
    Alert.alert(
      tCommon('alerts.cannotDelete'),
      tCommon('messages.confirmRemove', { item: 'estimate' }),
      [
        {
          text: tCommon('buttons.cancel'),
          style: 'cancel'
        },
        {
          text: tCommon('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('estimates')
                .delete()
                .eq('id', estimateId);

              if (error) {
                console.error('Error deleting estimate:', error);
                Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToDelete', { item: 'estimate' }));
              } else {
                // Refresh the list
                await loadEstimates();
                Alert.alert(tCommon('alerts.success'), tCommon('messages.deletedSuccessfully', { item: 'Estimate' }));
              }
            } catch (error) {
              console.error('Error deleting estimate:', error);
              Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToDelete', { item: 'estimate' }));
            }
          }
        }
      ]
    );
  };

  const handleConvertToProject = (estimate) => {
    Alert.alert(
      'Convert to Project?',
      `This will create a new project from "${estimate.client_name || estimate.project_name}" and mark the estimate as accepted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            try {
              const project = await createProjectFromEstimate(estimate.id);
              if (project) {
                Alert.alert('Success', `Project "${project.name}" created successfully.`);
                await loadEstimates();
              } else {
                Alert.alert('Error', 'Failed to create project from estimate.');
              }
            } catch (e) {
              console.error('Error converting estimate:', e);
              Alert.alert('Error', 'Failed to convert estimate to project.');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return Colors.successGreen;
      case 'sent':
        return Colors.warningOrange;
      case 'draft':
        return Colors.secondaryText;
      case 'rejected':
        return Colors.errorRed;
      default:
        return Colors.primaryBlue;
    }
  };

  // Filter estimates
  const filteredEstimates = estimates.filter(est => {
    const matchesStatus = statusFilter === 'All' || est.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      est.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      est.projectName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Calculate stats
  const stats = {
    total: estimates.length,
    draft: estimates.filter(e => e.status?.toLowerCase() === 'draft').length,
    sent: estimates.filter(e => e.status?.toLowerCase() === 'sent').length,
    accepted: estimates.filter(e => e.status?.toLowerCase() === 'accepted').length,
    rejected: estimates.filter(e => e.status?.toLowerCase() === 'rejected').length,
    totalValue: estimates.reduce((sum, e) => sum + (e.total || 0), 0),
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('list.allEstimates')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Estimates List */}
        <View style={styles.listSection}>
          {filteredEstimates.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="document-text-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                {searchQuery || statusFilter !== 'All' ? t('list.noEstimatesMatch') : t('list.noEstimatesYet')}
              </Text>
            </View>
          ) : (
            filteredEstimates.map((estimate) => (
              <TouchableOpacity
                key={estimate.id}
                style={[styles.estimateCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => {
                  setSelectedEstimate(estimate);
                  setShowEstimateModal(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.clientName, { color: Colors.primaryText }]}>
                      {estimate.client_name || estimate.clientName || 'No client'}
                    </Text>
                    <Text style={[styles.projectName, { color: Colors.secondaryText }]}>
                      {estimate.project_name || estimate.projectName || 'No project name'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteEstimate(estimate.id);
                      }}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(estimate.status) + '20' },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: getStatusColor(estimate.status) }]}>
                        {estimate.status ? t(`status.${estimate.status.toLowerCase()}`) : t('status.draft')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                    <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                      {estimate.created_at ? new Date(estimate.created_at).toLocaleDateString() : 'N/A'}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: Colors.primaryText }]}>
                    ${estimate.total?.toLocaleString() || '0'}
                  </Text>
                </View>
                {!estimate.project_id && (estimate.status === 'draft' || estimate.status === 'sent') && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 2 }}
                    onPress={(e) => { e.stopPropagation(); handleConvertToProject(estimate); }}
                  >
                    <Ionicons name="arrow-forward-circle-outline" size={16} color="#3B82F6" />
                    <Text style={{ fontSize: 13, color: '#3B82F6', fontWeight: '600' }}>Convert to Project</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Estimate Detail Modal */}
      <Modal
        visible={showEstimateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEstimateModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowEstimateModal(false)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={{ padding: 4 }}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('list.estimateDetails')}</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Estimate Preview */}
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            {selectedEstimate && (
              <EstimatePreview
                data={{
                  ...selectedEstimate,
                  client: selectedEstimate.client_name || selectedEstimate.clientName,
                  clientName: selectedEstimate.client_name || selectedEstimate.clientName,
                  clientPhone: selectedEstimate.client_phone || selectedEstimate.clientPhone,
                  clientEmail: selectedEstimate.client_email || selectedEstimate.clientEmail,
                  clientAddress: selectedEstimate.client_address || selectedEstimate.clientAddress,
                  projectName: selectedEstimate.project_name || selectedEstimate.projectName,
                  estimateNumber: selectedEstimate.estimate_number || selectedEstimate.estimateNumber,
                  date: selectedEstimate.created_at ? new Date(selectedEstimate.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
                  items: selectedEstimate.items || [],
                  phases: selectedEstimate.phases || [],
                  schedule: selectedEstimate.schedule || {},
                  scope: selectedEstimate.scope || {},
                  subtotal: selectedEstimate.subtotal || 0,
                  total: selectedEstimate.total || 0,
                  status: selectedEstimate.status,
                }}
                onAction={async (action) => {
                  if (action.type === 'update-estimate') {
                    try {
                      const updated = await updateEstimate(action.data);
                      if (updated) {
                        setSelectedEstimate(updated);
                        await loadEstimates();
                        Alert.alert(tCommon('alerts.success'), tCommon('messages.savedSuccessfully', { item: 'Estimate' }));
                      } else {
                        Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'estimate' }));
                      }
                    } catch (error) {
                      console.error('Error updating estimate:', error);
                      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'estimate' }));
                    }
                  } else {
                    setShowEstimateModal(false);
                  }
                }}
              />
            )}
            {/* E-signature UI disabled — re-enable when backend is deployed.
            {selectedEstimate?.id && (
              <SignatureSection
                documentType="estimate"
                documentId={selectedEstimate.id}
                defaultSignerName={selectedEstimate.client_name || selectedEstimate.clientName}
                defaultSignerEmail={selectedEstimate.client_email || selectedEstimate.clientEmail}
                defaultSignerPhone={selectedEstimate.client_phone || selectedEstimate.clientPhone}
              />
            )}
            */}
            {selectedEstimate?.id && (
              <AuditTrail entityType="estimate" entityId={selectedEstimate.id} />
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
  estimateCard: {
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
  projectName: {
    fontSize: 14,
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
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#EF444415',
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
