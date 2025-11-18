import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
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
 *
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Close modal callback
 * @param {string} assignmentType - 'project' or 'phase'
 * @param {string} assignmentId - Project ID or Phase ID
 * @param {string} assignmentName - Project or Phase name for display
 * @param {function} onAssignmentsChange - Callback when assignments change
 */
export default function WorkerAssignmentModal({
  visible,
  onClose,
  assignmentType = 'project', // 'project' or 'phase'
  assignmentId,
  assignmentName,
  onAssignmentsChange,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

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

      Alert.alert('Success', 'Worker assignments updated successfully');
      onClose();
    } catch (error) {
      console.error('Error saving assignments:', error);
      Alert.alert('Error', 'Failed to update worker assignments');
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
        return Colors.secondaryText;
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
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.cancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>Assign Workers</Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]} numberOfLines={1}>
              {assignmentName}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.saveText, { color: Colors.primaryBlue, opacity: saving ? 0.5 : 1 }]}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search and Filter */}
        <View style={[styles.searchSection, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <View style={[styles.searchBar, { backgroundColor: Colors.lightGray }]}>
            <Ionicons name="search" size={20} color={Colors.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: Colors.primaryText }]}
              placeholder="Search workers..."
              placeholderTextColor={Colors.secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Trade Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {getAvailableTrades().map((trade) => (
              <TouchableOpacity
                key={trade}
                style={[
                  styles.filterChip,
                  filterTrade === trade && { backgroundColor: Colors.primaryBlue },
                  { borderColor: Colors.border },
                ]}
                onPress={() => setFilterTrade(trade)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterTrade === trade ? { color: '#FFFFFF' } : { color: Colors.primaryText },
                  ]}
                >
                  {trade === 'all' ? 'All Trades' : trade}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Selection Summary */}
          {selectedCount > 0 && (
            <View style={[styles.selectionSummary, { backgroundColor: Colors.primaryBlue + '10' }]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.selectionText, { color: Colors.primaryBlue }]}>
                {selectedCount} worker{selectedCount !== 1 ? 's' : ''} selected
              </Text>
            </View>
          )}
        </View>

        {/* Workers List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {filteredWorkers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color={Colors.secondaryText} />
                <Text style={[styles.emptyStateText, { color: Colors.primaryText }]}>
                  {allWorkers.length === 0 ? 'No workers available' : 'No workers match your search'}
                </Text>
                <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
                  {allWorkers.length === 0
                    ? 'Add workers in the Workers screen first'
                    : 'Try adjusting your search or filter'}
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
                        { backgroundColor: Colors.white, borderColor: Colors.border },
                        isSelected && { borderColor: Colors.primaryBlue, borderWidth: 2 },
                      ]}
                      onPress={() => toggleWorkerSelection(worker.id)}
                    >
                      {/* Checkbox */}
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: Colors.border },
                          isSelected && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue },
                        ]}
                      >
                        {isSelected && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                      </View>

                      {/* Avatar */}
                      <View style={[styles.avatar, { backgroundColor: statusColor }]}>
                        <Text style={styles.avatarText}>{getInitials(worker.full_name)}</Text>
                      </View>

                      {/* Worker Info */}
                      <View style={styles.workerInfo}>
                        <Text style={[styles.workerName, { color: Colors.primaryText }]}>{worker.full_name}</Text>
                        {worker.trade && (
                          <View style={styles.infoRow}>
                            <Ionicons name="hammer-outline" size={14} color={Colors.secondaryText} />
                            <Text style={[styles.workerTrade, { color: Colors.secondaryText }]}>{worker.trade}</Text>
                          </View>
                        )}
                        {worker.hourly_rate > 0 && (
                          <View style={styles.infoRow}>
                            <Ionicons name="cash-outline" size={14} color={Colors.secondaryText} />
                            <Text style={[styles.workerRate, { color: Colors.secondaryText }]}>
                              ${worker.hourly_rate}/hr
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Status Badge */}
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {worker.status || 'pending'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.large,
    paddingVertical: Spacing.medium,
    borderBottomWidth: 1,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.medium,
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  cancelText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  saveText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  searchSection: {
    padding: Spacing.medium,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.small,
    borderRadius: BorderRadius.medium,
    gap: 8,
    marginBottom: Spacing.small,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.small,
  },
  filterChip: {
    paddingHorizontal: Spacing.medium,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  selectionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.small,
    borderRadius: BorderRadius.medium,
  },
  selectionText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
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
    padding: Spacing.medium,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xlarge * 3,
  },
  emptyStateText: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    marginTop: Spacing.large,
    marginBottom: Spacing.small,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xlarge,
  },
  workersList: {
    gap: Spacing.medium,
  },
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.medium,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.medium,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.medium,
  },
  avatarText: {
    fontSize: FontSizes.small,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  workerTrade: {
    fontSize: FontSizes.small,
  },
  workerRate: {
    fontSize: FontSizes.small,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
