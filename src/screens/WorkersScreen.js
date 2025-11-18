import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  fetchWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  getActiveClockIn,
  getProjectWorkers,
  assignWorkerToProject,
  removeWorkerFromProject,
  fetchProjects,
  getTodaysWorkersSchedule,
} from '../utils/storage';
import WorkerCard from '../components/WorkerCard';
import WorkerScheduleCard from '../components/WorkerScheduleCard';

export default function WorkersScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [filteredWorkers, setFilteredWorkers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive, pending, rejected
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [activeClockIns, setActiveClockIns] = useState({});
  const [scheduleData, setScheduleData] = useState({
    unassignedWorkers: [],
    projectGroups: [],
    totalWorkers: 0,
    clockedInCount: 0
  });
  const [filteredSchedule, setFilteredSchedule] = useState({
    projectGroups: [],
    clockedInCount: 0
  });

  // Form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTrade, setFormTrade] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formPaymentType, setFormPaymentType] = useState('hourly');
  const [formDailyRate, setFormDailyRate] = useState('');
  const [formWeeklySalary, setFormWeeklySalary] = useState('');
  const [formProjectRate, setFormProjectRate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterData();
  }, [workers, scheduleData, searchQuery, filterStatus]);

  // Auto-refresh schedule every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadSchedule(false);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load both workers and schedule data
      const [workersData, scheduleDataResult] = await Promise.all([
        fetchWorkers(),
        getTodaysWorkersSchedule()
      ]);

      // Load active clock-in status for each worker
      const clockIns = {};
      for (const worker of workersData) {
        const activeSession = await getActiveClockIn(worker.id);
        if (activeSession) {
          clockIns[worker.id] = activeSession;
        }
      }

      setActiveClockIns(clockIns);
      setWorkers(workersData);
      setScheduleData(scheduleDataResult);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedule = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await getTodaysWorkersSchedule();
      setScheduleData(data);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filterData = () => {
    // Get IDs of workers currently clocked in
    const clockedInIds = new Set();
    scheduleData.projectGroups.forEach(group => {
      group.workers.forEach(worker => {
        clockedInIds.add(worker.id);
      });
    });

    // Filter workers for bottom list (exclude clocked-in workers)
    let filtered = workers.filter(w => !clockedInIds.has(w.id));

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(w => w.status === filterStatus);
    }

    // Apply search query to workers
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        w =>
          w.full_name?.toLowerCase().includes(query) ||
          w.trade?.toLowerCase().includes(query) ||
          w.phone?.includes(query) ||
          w.email?.toLowerCase().includes(query)
      );
    }

    // Sort workers: assigned workers first, then unassigned
    // TODO: Need to track assignment history - for now sort by created_at
    filtered.sort((a, b) => {
      // Workers with status 'active' first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      // Then by created date (older workers = more likely to have assignments)
      return new Date(a.created_at) - new Date(b.created_at);
    });

    setFilteredWorkers(filtered);

    // Filter schedule data (apply search to schedule section too)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filteredGroups = scheduleData.projectGroups.map(group => ({
        ...group,
        workers: group.workers.filter(w =>
          w.full_name?.toLowerCase().includes(query) ||
          w.trade?.toLowerCase().includes(query)
        )
      })).filter(group => group.workers.length > 0);

      setFilteredSchedule({
        projectGroups: filteredGroups,
        clockedInCount: filteredGroups.reduce((sum, g) => sum + g.workers.length, 0)
      });
    } else {
      setFilteredSchedule({
        projectGroups: scheduleData.projectGroups,
        clockedInCount: scheduleData.clockedInCount
      });
    }
  };

  const handleAddWorker = async () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Please enter worker name');
      return;
    }

    if (!formEmail.trim()) {
      Alert.alert('Error', 'Email is required to send worker invite');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      setSaving(true);
      const newWorker = await createWorker({
        fullName: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        trade: formTrade.trim(),
        hourlyRate: parseFloat(formRate) || 0,
        paymentType: formPaymentType,
        dailyRate: parseFloat(formDailyRate) || 0,
        weeklySalary: parseFloat(formWeeklySalary) || 0,
        projectRate: parseFloat(formProjectRate) || 0,
      });

      if (newWorker) {
        setWorkers([newWorker, ...workers]);
        resetForm();
        setShowAddModal(false);
        Alert.alert('Success', 'Worker added successfully');
      } else {
        Alert.alert('Error', 'Failed to add worker');
      }
    } catch (error) {
      console.error('Error adding worker:', error);
      Alert.alert('Error', 'Failed to add worker');
    } finally {
      setSaving(false);
    }
  };

  const handleEditWorker = async () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Please enter worker name');
      return;
    }

    try {
      setSaving(true);
      const success = await updateWorker(selectedWorker.id, {
        fullName: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        trade: formTrade.trim(),
        hourlyRate: parseFloat(formRate) || 0,
        paymentType: formPaymentType,
        dailyRate: parseFloat(formDailyRate) || 0,
        weeklySalary: parseFloat(formWeeklySalary) || 0,
        projectRate: parseFloat(formProjectRate) || 0,
        status: selectedWorker.status,
      });

      if (success) {
        // Update local state
        setWorkers(
          workers.map(w =>
            w.id === selectedWorker.id
              ? {
                  ...w,
                  full_name: formName.trim(),
                  phone: formPhone.trim(),
                  email: formEmail.trim(),
                  trade: formTrade.trim(),
                  hourly_rate: parseFloat(formRate) || 0,
                  payment_type: formPaymentType,
                  daily_rate: parseFloat(formDailyRate) || 0,
                  weekly_salary: parseFloat(formWeeklySalary) || 0,
                  project_rate: parseFloat(formProjectRate) || 0,
                }
              : w
          )
        );
        resetForm();
        setShowEditModal(false);
        Alert.alert('Success', 'Worker updated successfully');
      } else {
        Alert.alert('Error', 'Failed to update worker');
      }
    } catch (error) {
      console.error('Error updating worker:', error);
      Alert.alert('Error', 'Failed to update worker');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorker = (worker) => {
    Alert.alert('Delete Worker', `Are you sure you want to delete ${worker.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const success = await deleteWorker(worker.id);
          if (success) {
            setWorkers(workers.filter(w => w.id !== worker.id));
            setShowDetailModal(false);
            Alert.alert('Success', 'Worker deleted');
          } else {
            Alert.alert('Error', 'Failed to delete worker');
          }
        },
      },
    ]);
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormTrade('');
    setFormRate('');
    setFormPaymentType('hourly');
    setFormDailyRate('');
    setFormWeeklySalary('');
    setFormProjectRate('');
    setSelectedWorker(null);
  };

  const openEditModal = (worker) => {
    setSelectedWorker(worker);
    setFormName(worker.full_name || '');
    setFormPhone(worker.phone || '');
    setFormEmail(worker.email || '');
    setFormTrade(worker.trade || '');
    setFormRate(worker.hourly_rate?.toString() || '');
    setFormPaymentType(worker.payment_type || 'hourly');
    setFormDailyRate(worker.daily_rate?.toString() || '');
    setFormWeeklySalary(worker.weekly_salary?.toString() || '');
    setFormProjectRate(worker.project_rate?.toString() || '');
    setShowEditModal(true);
  };

  const openDetailModal = (worker) => {
    setSelectedWorker(worker);
    setShowDetailModal(true);
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
      case 'rejected':
        return '#EF4444';
      default:
        return Colors.secondaryText;
    }
  };

  const getStatusLabel = (status) => {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  const isWorkerActive = (workerId) => {
    return activeClockIns[workerId] !== undefined;
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
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Workers</Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
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

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {['all', 'active', 'inactive', 'pending', 'rejected'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                filterStatus === filter && { backgroundColor: Colors.primaryBlue },
              ]}
              onPress={() => setFilterStatus(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterStatus === filter ? { color: '#FFFFFF' } : { color: Colors.primaryText },
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* SCHEDULE SECTION - Clocked In Workers */}
        {filteredSchedule.clockedInCount === 0 ? (
          <View style={styles.emptySchedule}>
            <Ionicons name="time-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyScheduleText, { color: Colors.secondaryText }]}>
              No one is working so far
            </Text>
          </View>
        ) : (
          <>
            {filteredSchedule.projectGroups.map((group) => (
              <View key={group.projectId} style={styles.section}>
                <View style={[styles.sectionHeader, { backgroundColor: Colors.primaryBlue + '15' }]}>
                  <Ionicons name="briefcase" size={20} color={Colors.primaryBlue} />
                  <Text style={[styles.sectionTitle, { color: Colors.primaryBlue }]}>
                    {group.projectName} ({group.workers.length})
                  </Text>
                </View>
                <View style={styles.workersList}>
                  {group.workers.map((worker) => (
                    <WorkerScheduleCard
                      key={worker.id}
                      worker={worker}
                      onPress={() => navigation.navigate('WorkerDetailHistory', { worker })}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {/* DIVIDER */}
        {workers.length > 0 && (
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: Colors.border }]} />
            <Text style={[styles.dividerText, { color: Colors.secondaryText }]}>ALL WORKERS</Text>
            <View style={[styles.dividerLine, { backgroundColor: Colors.border }]} />
          </View>
        )}

        {/* WORKERS LIST SECTION */}
        {filteredWorkers.length === 0 && workers.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="people-outline" size={64} color={Colors.secondaryText} />
            </View>
            <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>
              {workers.length === 0 ? 'No workers yet' : 'No workers found'}
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              {workers.length === 0
                ? 'Add workers to track their schedules and assignments'
                : 'Try adjusting your search or filter'}
            </Text>
            {workers.length === 0 && (
              <TouchableOpacity
                style={[styles.emptyStateButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => setShowAddModal(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.emptyStateButtonText}>Add Your First Worker</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: Colors.white }]}>
                <Ionicons name="people" size={24} color={Colors.primaryBlue} style={styles.statIcon} />
                <Text style={[styles.statValue, { color: Colors.primaryText }]}>{workers.length}</Text>
                <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Total</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: Colors.white }]}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" style={styles.statIcon} />
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  {Object.keys(activeClockIns).length}
                </Text>
                <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>On Site</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: Colors.white }]}>
                <Ionicons name="flash" size={24} color={Colors.primaryBlue} style={styles.statIcon} />
                <Text style={[styles.statValue, { color: Colors.primaryBlue }]}>
                  {workers.filter(w => w.status === 'active').length}
                </Text>
                <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Active</Text>
              </View>
            </View>

            {/* Workers Grid */}
            <View style={styles.workersGrid}>
              {filteredWorkers.map((worker) => {
                const isClockedIn = isWorkerActive(worker.id);

                return (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    isClocked={isClockedIn}
                    onPress={() => openDetailModal(worker)}
                  />
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Add Worker Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          resetForm();
          setShowAddModal(false);
        }}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
            <TouchableOpacity
              style={styles.modalHeaderButton}
              onPress={() => {
                resetForm();
                setShowAddModal(false);
              }}
            >
              <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Add Worker</Text>
            </View>
            <TouchableOpacity
              style={styles.modalHeaderButton}
              onPress={handleAddWorker}
              disabled={saving}
            >
              <Text style={[styles.modalSaveText, { color: Colors.primaryBlue, opacity: saving ? 0.5 : 1 }]}>
                {saving ? 'Saving...' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Personal Information Section */}
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="person-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>Personal Information</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Full Name *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="person" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="John Doe"
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Phone Number</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="call" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formPhone}
                    onChangeText={setFormPhone}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Email *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="mail" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder="worker@example.com"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Work Details Section */}
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="briefcase-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>Work Details</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Trade/Specialty</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="hammer" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formTrade}
                    onChangeText={setFormTrade}
                    placeholder="Carpenter, Electrician, etc."
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>
            </View>

            {/* Payment Details Section */}
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="wallet-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>Payment Details</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Payment Type</Text>
                <View style={styles.paymentTypeGrid}>
                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'hourly' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'hourly' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('hourly')}
                  >
                    <Ionicons
                      name="time"
                      size={20}
                      color={formPaymentType === 'hourly' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'hourly' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Hourly
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'daily' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'daily' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('daily')}
                  >
                    <Ionicons
                      name="sunny"
                      size={20}
                      color={formPaymentType === 'daily' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'daily' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Daily
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'weekly' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'weekly' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('weekly')}
                  >
                    <Ionicons
                      name="calendar"
                      size={20}
                      color={formPaymentType === 'weekly' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'weekly' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Weekly
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'project_based' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'project_based' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('project_based')}
                  >
                    <Ionicons
                      name="briefcase"
                      size={20}
                      color={formPaymentType === 'project_based' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'project_based' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Project
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hourly Rate */}
              {formPaymentType === 'hourly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Hourly Rate</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formRate}
                      onChangeText={setFormRate}
                      placeholder="25.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Daily Rate */}
              {formPaymentType === 'daily' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Daily Rate</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formDailyRate}
                      onChangeText={setFormDailyRate}
                      placeholder="200.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Weekly Salary */}
              {formPaymentType === 'weekly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Weekly Salary</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formWeeklySalary}
                      onChangeText={setFormWeeklySalary}
                      placeholder="1000.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Project Rate */}
              {formPaymentType === 'project_based' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Project Rate</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formProjectRate}
                      onChangeText={setFormProjectRate}
                      placeholder="5000.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Worker Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          resetForm();
          setShowEditModal(false);
        }}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
            <TouchableOpacity
              style={styles.modalHeaderButton}
              onPress={() => {
                resetForm();
                setShowEditModal(false);
              }}
            >
              <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Edit Worker</Text>
            </View>
            <TouchableOpacity
              style={styles.modalHeaderButton}
              onPress={handleEditWorker}
              disabled={saving}
            >
              <Text style={[styles.modalSaveText, { color: Colors.primaryBlue, opacity: saving ? 0.5 : 1 }]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Personal Information Section */}
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="person-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>Personal Information</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Full Name *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="person" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="John Doe"
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Phone Number</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="call" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formPhone}
                    onChangeText={setFormPhone}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Email *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="mail" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder="worker@example.com"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Work Details Section */}
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="briefcase-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>Work Details</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Trade/Specialty</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="hammer" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formTrade}
                    onChangeText={setFormTrade}
                    placeholder="Carpenter, Electrician, etc."
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>
            </View>

            {/* Payment Details Section */}
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="wallet-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>Payment Details</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Payment Type</Text>
                <View style={styles.paymentTypeGrid}>
                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'hourly' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'hourly' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('hourly')}
                  >
                    <Ionicons
                      name="time"
                      size={20}
                      color={formPaymentType === 'hourly' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'hourly' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Hourly
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'daily' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'daily' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('daily')}
                  >
                    <Ionicons
                      name="sunny"
                      size={20}
                      color={formPaymentType === 'daily' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'daily' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Daily
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'weekly' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'weekly' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('weekly')}
                  >
                    <Ionicons
                      name="calendar"
                      size={20}
                      color={formPaymentType === 'weekly' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'weekly' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Weekly
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeOption,
                      formPaymentType === 'project_based' && { backgroundColor: Colors.primaryBlue },
                      formPaymentType !== 'project_based' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                    ]}
                    onPress={() => setFormPaymentType('project_based')}
                  >
                    <Ionicons
                      name="briefcase"
                      size={20}
                      color={formPaymentType === 'project_based' ? '#FFFFFF' : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.paymentTypeText,
                      { color: formPaymentType === 'project_based' ? '#FFFFFF' : Colors.primaryText }
                    ]}>
                      Project
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hourly Rate */}
              {formPaymentType === 'hourly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Hourly Rate</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formRate}
                      onChangeText={setFormRate}
                      placeholder="25.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Daily Rate */}
              {formPaymentType === 'daily' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Daily Rate</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formDailyRate}
                      onChangeText={setFormDailyRate}
                      placeholder="200.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Weekly Salary */}
              {formPaymentType === 'weekly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Weekly Salary</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formWeeklySalary}
                      onChangeText={setFormWeeklySalary}
                      placeholder="1000.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Project Rate */}
              {formPaymentType === 'project_based' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>Project Rate</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formProjectRate}
                      onChangeText={setFormProjectRate}
                      placeholder="5000.00"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Worker Detail Modal */}
      {selectedWorker && (
        <Modal
          visible={showDetailModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowDetailModal(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Close</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Worker Details</Text>
              <TouchableOpacity onPress={() => {
                setShowDetailModal(false);
                openEditModal(selectedWorker);
              }}>
                <Ionicons name="create-outline" size={24} color={Colors.primaryBlue} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Hero Header */}
              <View style={[styles.heroHeader, { backgroundColor: getStatusColor(selectedWorker.status) }]}>
                <View style={styles.heroContent}>
                  <View style={styles.avatarContainer}>
                    <Text style={styles.heroAvatarText}>{getInitials(selectedWorker.full_name)}</Text>
                  </View>
                  <Text style={styles.heroName}>{selectedWorker.full_name}</Text>
                  <View style={styles.heroBadge}>
                    <View style={styles.heroBadgeDot} />
                    <Text style={styles.heroBadgeText}>
                      {getStatusLabel(selectedWorker.status)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Details Container */}
              <View style={styles.detailsContainer}>
                {/* Info Grid */}
                <View style={styles.infoGrid}>
                  {selectedWorker.email && (
                    <View style={[styles.gridItem, { backgroundColor: Colors.white }]}>
                      <View style={[styles.gridIconBg, { backgroundColor: '#10B981' }]}>
                        <Ionicons name="mail" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>EMAIL</Text>
                      <Text style={[styles.gridValue, { color: Colors.primaryText }]} numberOfLines={1}>
                        {selectedWorker.email}
                      </Text>
                    </View>
                  )}

                  {selectedWorker.phone && (
                    <View style={[styles.gridItem, { backgroundColor: Colors.white }]}>
                      <View style={[styles.gridIconBg, { backgroundColor: '#3B82F6' }]}>
                        <Ionicons name="call" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>PHONE</Text>
                      <Text style={[styles.gridValue, { color: Colors.primaryText }]}>
                        {selectedWorker.phone}
                      </Text>
                    </View>
                  )}

                  {selectedWorker.trade && (
                    <View style={[styles.gridItem, { backgroundColor: Colors.white }]}>
                      <View style={[styles.gridIconBg, { backgroundColor: '#F59E0B' }]}>
                        <Ionicons name="hammer" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>TRADE</Text>
                      <Text style={[styles.gridValue, { color: Colors.primaryText }]}>
                        {selectedWorker.trade}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Payment Card */}
                {(selectedWorker.hourly_rate > 0 || selectedWorker.daily_rate > 0 || selectedWorker.weekly_salary > 0 || selectedWorker.project_rate > 0) && (
                  <View style={[styles.paymentCard, { backgroundColor: Colors.white }]}>
                    <View style={styles.paymentHeader}>
                      <Ionicons name="cash" size={22} color="#6B7280" />
                      <Text style={[styles.paymentHeaderText, { color: Colors.primaryText }]}>Payment Information</Text>
                    </View>
                    <View style={styles.paymentBody}>
                      <View style={[styles.paymentTypeBadge, { backgroundColor: '#F3F4F6' }]}>
                        <Text style={[styles.paymentTypeBadgeText, { color: '#6B7280' }]}>
                          {selectedWorker.payment_type === 'hourly' ? 'HOURLY RATE' :
                           selectedWorker.payment_type === 'daily' ? 'DAILY RATE' :
                           selectedWorker.payment_type === 'weekly' ? 'WEEKLY SALARY' : 'PROJECT RATE'}
                        </Text>
                      </View>
                      <View style={styles.paymentAmountRow}>
                        <Text style={[styles.paymentDollar, { color: Colors.primaryText }]}>$</Text>
                        <Text style={[styles.paymentNumber, { color: Colors.primaryText }]}>
                          {selectedWorker.payment_type === 'hourly' ? selectedWorker.hourly_rate :
                           selectedWorker.payment_type === 'daily' ? selectedWorker.daily_rate :
                           selectedWorker.payment_type === 'weekly' ? selectedWorker.weekly_salary :
                           selectedWorker.project_rate}
                        </Text>
                        <Text style={[styles.paymentPer, { color: Colors.secondaryText }]}>
                          /{selectedWorker.payment_type === 'hourly' ? 'hr' :
                            selectedWorker.payment_type === 'daily' ? 'day' :
                            selectedWorker.payment_type === 'weekly' ? 'wk' : 'project'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Current Status */}
                {isWorkerActive(selectedWorker.id) && (
                  <View style={[styles.activeStatusCard, { backgroundColor: '#10B981' }]}>
                    <View style={styles.activeStatusHeader}>
                      <Ionicons name="radio-button-on" size={16} color="#FFFFFF" />
                      <Text style={styles.activeStatusTitle}>Currently On Site</Text>
                    </View>
                    <View style={styles.activeStatusBody}>
                      <Ionicons name="briefcase" size={18} color="#FFFFFF" />
                      <Text style={styles.activeStatusProject}>
                        {activeClockIns[selectedWorker.id]?.projects?.name || 'Unknown Project'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Delete Button */}
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: Colors.white }]}
                  onPress={() => handleDeleteWorker(selectedWorker)}
                >
                  <Ionicons name="trash" size={20} color="#EF4444" />
                  <Text style={styles.deleteButtonText}>Delete Worker</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
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
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Spacing.small,
    paddingBottom: Spacing.medium,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.small,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.medium,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: 0,
  },
  filterRow: {
    marginHorizontal: -Spacing.large,
    paddingHorizontal: Spacing.large,
    marginBottom: 4,
  },
  filterRowContent: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterChipText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: Spacing.large,
    paddingBottom: Spacing.xlarge * 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  statIcon: {
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  workersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: Spacing.xlarge,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 0,
  },
  modalHeaderButton: {
    width: 70,
    paddingVertical: 4,
  },
  modalTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: -1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalCancelText: {
    fontSize: 17,
    fontWeight: '400',
  },
  modalSaveText: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
  },
  modalContent: {
    flex: 1,
    padding: Spacing.large,
  },
  formCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  formCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  formCardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  formField: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
  },
  heroHeader: {
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  heroContent: {
    alignItems: 'center',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  heroAvatarText: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'capitalize',
  },
  detailsContainer: {
    padding: 20,
    marginTop: -20,
  },
  infoGrid: {
    gap: 12,
    marginBottom: 16,
  },
  gridItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  gridIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  gridValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  paymentCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 16,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  paymentHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  paymentBody: {
    alignItems: 'center',
  },
  paymentTypeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  paymentTypeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  paymentAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  paymentDollar: {
    fontSize: 28,
    fontWeight: '700',
    marginRight: 4,
  },
  paymentNumber: {
    fontSize: 48,
    fontWeight: '800',
  },
  paymentPer: {
    fontSize: 20,
    fontWeight: '500',
    marginLeft: 4,
  },
  activeStatusCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  activeStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  activeStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeStatusBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeStatusProject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailSection: {
    padding: Spacing.medium,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.medium,
  },
  detailSectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.medium,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.small,
  },
  detailRowText: {
    fontSize: FontSizes.body,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FEE2E2',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
  paymentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentTypeOption: {
    flex: 1,
    minWidth: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  paymentTypeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  horizontalScroll: {
    paddingBottom: 4,
  },
  unassignedCard: {
    marginRight: 12,
  },
  unassignedWorkerCard: {
    width: 100,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  unassignedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  unassignedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  unassignedName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  unassignedTrade: {
    fontSize: 11,
    textAlign: 'center',
  },
  workersList: {
    gap: 0,
  },
  emptySchedule: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyScheduleText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
