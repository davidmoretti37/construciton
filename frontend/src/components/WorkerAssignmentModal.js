import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  fetchWorkers,
  assignWorkerToProject,
  assignWorkerToPhase,
  removeWorkerFromProject,
  removeWorkerFromPhase,
  getProjectWorkers,
  getPhaseWorkers,
} from '../utils/storage';

/**
 * Reusable Worker Assignment Modal
 * Can be used to assign workers to projects or phases
 */
export default function WorkerAssignmentModal({
  visible,
  onClose,
  assignmentType = 'project', // 'project' or 'phase'
  assignmentId,
  assignmentName,
  onAssignmentsChange,
}) {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allWorkers, setAllWorkers] = useState([]);
  const [assignedWorkers, setAssignedWorkers] = useState([]);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrade, setFilterTrade] = useState('all');

  useEffect(() => {
    if (visible && assignmentId) {
      loadData();
    }
  }, [visible, assignmentId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all workers
      const workers = await fetchWorkers();
      setAllWorkers(workers);

      // Load currently assigned workers
      let assigned = [];
      if (assignmentType === 'project') {
        assigned = await getProjectWorkers(assignmentId);
      } else {
        assigned = await getPhaseWorkers(assignmentId);
      }

      setAssignedWorkers(assigned);

      // Initialize selected workers with currently assigned
      const assignedIds = new Set(assigned.map(w => w.id));
      setSelectedWorkerIds(assignedIds);
    } catch (error) {
      console.error('Error loading workers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Determine which workers to add and remove
      const currentlyAssignedIds = new Set(assignedWorkers.map(w => w.id));
      const workersToAdd = [...selectedWorkerIds].filter(id => !currentlyAssignedIds.has(id));
      const workersToRemove = [...currentlyAssignedIds].filter(id => !selectedWorkerIds.has(id));

      // Add new assignments
      for (const workerId of workersToAdd) {
        if (assignmentType === 'project') {
          await assignWorkerToProject(workerId, assignmentId);
        } else {
          await assignWorkerToPhase(workerId, assignmentId);
        }
      }

      // Remove unassigned workers
      for (const workerId of workersToRemove) {
        if (assignmentType === 'project') {
          await removeWorkerFromProject(workerId, assignmentId);
        } else {
          await removeWorkerFromPhase(workerId, assignmentId);
        }
      }

      // Notify parent component
      if (onAssignmentsChange) {
        onAssignmentsChange();
      }

      Alert.alert(t('alerts.success'), t('messages.updatedSuccessfully'));
      onClose();
    } catch (error) {
      console.error('Error saving assignments:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkerSelection = (workerId) => {
    const newSelected = new Set(selectedWorkerIds);
    if (newSelected.has(workerId)) {
      newSelected.delete(workerId);
    } else {
      newSelected.add(workerId);
    }
    setSelectedWorkerIds(newSelected);
  };

  const getFilteredWorkers = () => {
    let filtered = allWorkers;

    // Filter by trade
    if (filterTrade !== 'all') {
      filtered = filtered.filter(w => w.trade?.toLowerCase() === filterTrade.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        w =>
          w.full_name?.toLowerCase().includes(query) ||
          w.trade?.toLowerCase().includes(query) ||
          w.phone?.includes(query)
      );
    }

    return filtered;
  };

  const getAvailableTrades = () => {
    const trades = new Set(allWorkers.map(w => w.trade).filter(Boolean));
    return ['all', ...Array.from(trades)];
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'inactive':
        return '#6B7280';
      case 'pending':
        return '#F59E0B';
      default:
        return '#9CA3AF';
    }
  };

  const filteredWorkers = getFilteredWorkers();
  const selectedCount = selectedWorkerIds.size;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Minimalist Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>{t('buttons.cancel')}</Text>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{t('labels.assignWorkers')}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {assignmentName}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerButton}>
            <Text style={[styles.saveText, { opacity: saving ? 0.5 : 1 }]}>
              {saving ? t('labels.saving') : t('buttons.save')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search workers..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Trade Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}
          >
            {getAvailableTrades().map((trade) => (
              <TouchableOpacity
                key={trade}
                style={[
                  styles.filterPill,
                  filterTrade === trade && styles.filterPillActive
                ]}
                onPress={() => setFilterTrade(trade)}
              >
                <Text style={[
                  styles.filterPillText,
                  filterTrade === trade && styles.filterPillTextActive
                ]}>
                  {trade === 'all' ? 'All Trades' : trade}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Workers List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1F2937" />
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {filteredWorkers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyStateText}>
                  {allWorkers.length === 0 ? t('emptyStates.noWorkersAvailable') : t('emptyStates.noWorkersFound')}
                </Text>
              </View>
            ) : (
              <View style={styles.workersList}>
                {filteredWorkers.map((worker) => {
                  const isSelected = selectedWorkerIds.has(worker.id);
                  const statusColor = getStatusColor(worker.status);

                  return (
                    <TouchableOpacity
                      key={worker.id}
                      style={[
                        styles.workerCard,
                        isSelected && styles.workerCardSelected
                      ]}
                      onPress={() => toggleWorkerSelection(worker.id)}
                      activeOpacity={0.7}
                    >
                      {/* Checkbox Circle */}
                      <View style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected
                      ]}>
                        {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                      </View>

                      {/* Avatar */}
                      <View style={[styles.avatar, { backgroundColor: statusColor }]}>
                        <Text style={styles.avatarText}>{getInitials(worker.full_name)}</Text>
                      </View>

                      {/* Worker Info */}
                      <View style={styles.workerInfo}>
                        <Text style={styles.workerName}>{worker.full_name}</Text>
                        <View style={styles.metaRow}>
                          {worker.trade && (
                            <>
                              <Ionicons name="hammer" size={12} color="#6B7280" />
                              <Text style={styles.metaText}>{worker.trade}</Text>
                            </>
                          )}
                          {worker.hourly_rate > 0 && (
                            <>
                              {worker.trade && <Text style={styles.metaDot}>•</Text>}
                              <Ionicons name="cash" size={12} color="#6B7280" />
                              <Text style={styles.metaText}>${worker.hourly_rate}/hr</Text>
                            </>
                          )}
                        </View>
                      </View>

                      {/* Status Badge */}
                      <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                        <Text style={styles.statusBadgeText}>
                          {worker.status || 'Active'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* Floating Action Bar */}
        {selectedCount > 0 && (
          <View style={styles.floatingBar}>
            <View style={styles.floatingBarContent}>
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              <Text style={styles.floatingBarText}>
                {selectedCount} selected
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
  headerButton: {
    minWidth: 70,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'right',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    paddingVertical: 0,
  },
  filterRow: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  filterRowContent: {
    gap: 8,
    paddingRight: 20,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterPillActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 12,
  },
  workersList: {
    gap: 12,
  },
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  workerCardSelected: {
    borderColor: '#1F2937',
    backgroundColor: '#F9FAFB',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 13,
    color: '#D1D5DB',
    marginHorizontal: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  floatingBarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
});
