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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchEstimates } from '../../utils/storage';
import EstimatePreview from '../../components/ChatVisuals/EstimatePreview';
import { supabase } from '../../lib/supabase';
import { Alert } from 'react-native';

export default function EstimatesDetailScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadEstimates();
    }, [])
  );

  const loadEstimates = async () => {
    try {
      setLoading(true);
      const allEstimates = await fetchEstimates();
      setEstimates(allEstimates || []);
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
      'Delete Estimate',
      'Are you sure you want to delete this estimate? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('estimates')
                .delete()
                .eq('id', estimateId);

              if (error) {
                console.error('Error deleting estimate:', error);
                Alert.alert('Error', 'Failed to delete estimate. Please try again.');
              } else {
                // Refresh the list
                await loadEstimates();
                Alert.alert('Success', 'Estimate deleted successfully');
              }
            } catch (error) {
              console.error('Error deleting estimate:', error);
              Alert.alert('Error', 'Failed to delete estimate. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return '#10B981';
      case 'sent':
        return '#F59E0B';
      case 'draft':
        return '#6B7280';
      case 'rejected':
        return '#EF4444';
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>All Estimates</Text>
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
            <Text style={[styles.statValue, { color: '#6B7280' }]}>{stats.draft}</Text>
            <Text style={[styles.statLabel, { color: '#6B7280' }]}>Draft</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F59E0B' + '10', borderColor: '#F59E0B' + '30' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.sent}</Text>
            <Text style={[styles.statLabel, { color: '#F59E0B' }]}>Sent</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#10B981' + '10', borderColor: '#10B981' + '30' }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.accepted}</Text>
            <Text style={[styles.statLabel, { color: '#10B981' }]}>Accepted</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
            <Text style={[styles.statValue, { color: Colors.primaryText }]}>${stats.totalValue.toLocaleString()}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Total Value</Text>
          </View>
        </ScrollView>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={[styles.searchBar, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Ionicons name="search" size={20} color={Colors.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: Colors.primaryText }]}
              placeholder="Search by client or project..."
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
          {['All', 'Draft', 'Sent', 'Accepted', 'Rejected'].map(filter => (
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

        {/* Estimates List */}
        <View style={styles.listSection}>
          {filteredEstimates.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="document-text-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                {searchQuery || statusFilter !== 'All' ? 'No estimates match your filters' : 'No estimates created yet'}
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
                        {estimate.status || 'Draft'}
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
            <TouchableOpacity onPress={() => setShowEstimateModal(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Estimate Details</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Estimate Preview */}
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
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
                onAction={(action) => {
                  console.log('Estimate action:', action);
                  // Handle actions like share, convert to invoice, etc.
                  setShowEstimateModal(false);
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
