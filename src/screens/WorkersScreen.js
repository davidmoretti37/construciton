import React, { useState, useEffect, useCallback } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  Dimensions,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
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
  fetchScheduleEvents,
  fetchWorkSchedules,
  fetchDailyReports,
  fetchActiveProjectsForDate,
  createScheduleEvent,
  deleteScheduleEvent,
} from '../utils/storage';
import WorkerCard from '../components/WorkerCard';
import WorkerScheduleCard from '../components/WorkerScheduleCard';
import CustomCalendar from '../components/CustomCalendar';
import AddPersonalEventModal from '../components/AddPersonalEventModal';
import NotificationBell from '../components/NotificationBell';

export default function WorkersScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Tab state
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'reports' | 'workers'

  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [filteredWorkers, setFilteredWorkers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [activeClockIns, setActiveClockIns] = useState({});

  // Schedule tab state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [workSchedules, setWorkSchedules] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [showAddEventModal, setShowAddEventModal] = useState(false);

  // Reports tab state
  const [dailyReports, setDailyReports] = useState([]);
  const [groupedReports, setGroupedReports] = useState({});
  // Photo viewer state
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [viewerPhotoIndex, setViewerPhotoIndex] = useState(0);

  // Open photo viewer with specific photos and index
  const openPhotoViewer = useCallback((photos, index) => {
    setViewerPhotos(photos);
    setViewerPhotoIndex(index);
    setPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);
  // Initialize to today's date in local timezone (not UTC)
  const [selectedReportDate, setSelectedReportDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [reportsGroupedByProject, setReportsGroupedByProject] = useState({});

  // Calendar modal state for date range selection
  const [showReportsCalendarModal, setShowReportsCalendarModal] = useState(false);
  const [reportsDateRangeStart, setReportsDateRangeStart] = useState(null);
  const [reportsDateRangeEnd, setReportsDateRangeEnd] = useState(null);
  const [showAllReports, setShowAllReports] = useState(false);

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

  // Reload data when screen comes into focus (after editing payment)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Only load if we haven't loaded before
      if (!hasLoadedOnce) {
        loadData();
      }
    });
    return unsubscribe;
  }, [navigation, hasLoadedOnce]);

  useEffect(() => {
    filterData();
  }, [workers, searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load workers data
      const workersData = await fetchWorkers();

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
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load data for Schedule tab
  const loadScheduleTabData = async () => {
    try {
      setScheduleLoading(true);

      // Get the selected date in local timezone (YYYY-MM-DD format)
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      // Create UTC date range for the full local day
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const [events, work, projects] = await Promise.all([
        fetchScheduleEvents(startDate.toISOString(), endDate.toISOString()),
        fetchWorkSchedules(dateString, dateString),
        fetchActiveProjectsForDate(dateString)
      ]);

      setScheduleEvents(events);
      setWorkSchedules(work);
      setActiveProjects(projects);
    } catch (error) {
      console.error('Error loading schedule tab data:', error);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Open address in maps app with choice between Google Maps and Apple Maps
  const openAddressInMaps = (address) => {
    if (!address) return;

    const encodedAddress = encodeURIComponent(address);

    // Show action sheet with map options
    Alert.alert(
      'Open in Maps',
      'Choose which map app to use:',
      [
        {
          text: 'Google Maps',
          onPress: () => {
            const googleMapsUrl = Platform.select({
              ios: `comgooglemaps://?q=${encodedAddress}`,
              android: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
            });

            Linking.canOpenURL(googleMapsUrl)
              .then((supported) => {
                if (supported) {
                  return Linking.openURL(googleMapsUrl);
                } else {
                  // Google Maps not installed, open in browser
                  const browserUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
                  return Linking.openURL(browserUrl);
                }
              })
              .catch((err) => {
                console.error('Error opening Google Maps:', err);
                Alert.alert('Error', 'Could not open Google Maps');
              });
          },
        },
        {
          text: 'Apple Maps',
          onPress: () => {
            const appleMapsUrl = `maps://maps.apple.com/?address=${encodedAddress}`;
            Linking.openURL(appleMapsUrl).catch((err) => {
              console.error('Error opening Apple Maps:', err);
              Alert.alert('Error', 'Could not open Apple Maps');
            });
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  // Handle saving personal event
  const handleSaveEvent = async (eventData) => {
    try {
      const result = await createScheduleEvent(eventData);
      if (result) {
        Alert.alert('Success', 'Personal event added successfully');
        // Reload schedule data to show the new event
        loadScheduleTabData();
      } else {
        Alert.alert('Error', 'Failed to create event. Please try again.');
      }
    } catch (error) {
      console.error('Error saving event:', error);
      Alert.alert('Error', 'Failed to create event. Please try again.');
    }
  };

  // Handle deleting personal event
  const handleDeleteEvent = async (eventId) => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteScheduleEvent(eventId);
              if (success) {
                Alert.alert('Success', 'Event deleted successfully');
                // Reload schedule data to remove the deleted event
                loadScheduleTabData();
              } else {
                Alert.alert('Error', 'Failed to delete event. Please try again.');
              }
            } catch (error) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete event. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Load data for Reports tab - loads reports for selected date, date range, or all
  const loadReportsTabData = async (options = {}) => {
    try {
      setReportsLoading(true);

      let filters = {};

      if (options.showAll) {
        // No date filters - fetch all reports
      } else if (options.startDate && options.endDate) {
        // Date range mode
        filters.startDate = options.startDate;
        filters.endDate = options.endDate;
      } else {
        // Single day mode (default)
        const dateToLoad = options.date || selectedReportDate;
        filters.startDate = dateToLoad;
        filters.endDate = dateToLoad;
      }

      const reports = await fetchDailyReports(null, filters);

      // Group reports by project
      const groupedByProject = {};
      reports.forEach(report => {
        const projectId = report.project_id;
        const projectName = report.projects?.name || 'Unknown Project';
        if (!groupedByProject[projectId]) {
          groupedByProject[projectId] = {
            projectName,
            reports: []
          };
        }
        groupedByProject[projectId].reports.push(report);
      });

      setDailyReports(reports);
      setReportsGroupedByProject(groupedByProject);
    } catch (error) {
      console.error('Error loading reports tab data:', error);
    } finally {
      setReportsLoading(false);
    }
  };

  // Handle date change for reports (arrow navigation)
  const handleReportDateChange = (daysOffset) => {
    // Reset to single day mode when using arrows
    setShowAllReports(false);
    setReportsDateRangeStart(null);
    setReportsDateRangeEnd(null);

    const currentDate = new Date(selectedReportDate + 'T12:00:00'); // Add noon time to avoid timezone issues
    currentDate.setDate(currentDate.getDate() + daysOffset);
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const newDate = `${year}-${month}-${day}`;
    setSelectedReportDate(newDate);
    loadReportsTabData({ date: newDate });
  };

  // Get today's date in local timezone for comparison
  const getTodayLocalDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for display
  const formatReportDate = (dateString) => {
    // Parse the date string as local date (add noon to avoid timezone shifts)
    const date = new Date(dateString + 'T12:00:00');
    const todayStr = getTodayLocalDate();

    // Calculate yesterday's date string
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYear = yesterday.getFullYear();
    const yesterdayMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yesterdayDay = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;

    if (dateString === todayStr) {
      return 'Today';
    } else if (dateString === yesterdayStr) {
      return 'Yesterday';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  // Get the display title for current reports view mode
  const getReportsDisplayTitle = () => {
    if (showAllReports) {
      return 'All Reports';
    }
    if (reportsDateRangeStart && reportsDateRangeEnd && reportsDateRangeStart !== reportsDateRangeEnd) {
      // Format date range
      const startDate = new Date(reportsDateRangeStart + 'T12:00:00');
      const endDate = new Date(reportsDateRangeEnd + 'T12:00:00');
      const formatShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${formatShort(startDate)} - ${formatShort(endDate)}`;
    }
    // Single day mode
    return formatReportDate(selectedReportDate);
  };

  // Load data for Workers tab (existing loadData)
  const loadWorkersTabData = async () => {
    await loadData();
  };

  // Load tab-specific data when tab changes
  useEffect(() => {
    switch (activeTab) {
      case 'schedule':
        loadScheduleTabData();
        break;
      case 'reports':
        loadReportsTabData();
        break;
      case 'workers':
        loadWorkersTabData();
        break;
    }
  }, [activeTab, selectedDate, selectedReportDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    switch (activeTab) {
      case 'schedule':
        await loadScheduleTabData();
        break;
      case 'reports':
        await loadReportsTabData();
        break;
      case 'workers':
        await loadData();
        break;
    }
    setRefreshing(false);
  };

  const filterData = () => {
    // Get IDs of workers currently clocked in (from activeClockIns state)
    const clockedInIds = new Set(Object.keys(activeClockIns));

    // Filter workers for bottom list (exclude clocked-in workers)
    let filtered = workers.filter(w => !clockedInIds.has(w.id));

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

  const handleSaveDetailEdits = async () => {
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
      });

      if (success) {
        // Update local state
        const updatedWorker = {
          ...selectedWorker,
          full_name: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          trade: formTrade.trim(),
        };

        setWorkers(
          workers.map(w => (w.id === selectedWorker.id ? updatedWorker : w))
        );
        setSelectedWorker(updatedWorker);
        setIsEditingDetail(false);
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {activeTab === 'schedule' ? 'Schedule' : activeTab === 'reports' ? 'Reports' : 'Workers'}
          </Text>
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'schedule' && styles.activeTab]}
            onPress={() => setActiveTab('schedule')}
          >
            <Ionicons
              name={activeTab === 'schedule' ? "calendar" : "calendar-outline"}
              size={20}
              color={activeTab === 'schedule' ? Colors.primaryBlue : Colors.secondaryText}
            />
            <Text style={[
              styles.tabText,
              activeTab === 'schedule' && { ...styles.activeTabText, color: Colors.primaryBlue }
            ]}>
              Schedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'reports' && styles.activeTab]}
            onPress={() => setActiveTab('reports')}
          >
            <Ionicons
              name={activeTab === 'reports' ? "document-text" : "document-text-outline"}
              size={20}
              color={activeTab === 'reports' ? Colors.primaryBlue : Colors.secondaryText}
            />
            <Text style={[
              styles.tabText,
              activeTab === 'reports' && { ...styles.activeTabText, color: Colors.primaryBlue }
            ]}>
              Reports
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'workers' && styles.activeTab]}
            onPress={() => setActiveTab('workers')}
          >
            <Ionicons
              name={activeTab === 'workers' ? "people" : "people-outline"}
              size={20}
              color={activeTab === 'workers' ? Colors.primaryBlue : Colors.secondaryText}
            />
            <Text style={[
              styles.tabText,
              activeTab === 'workers' && { ...styles.activeTabText, color: Colors.primaryBlue }
            ]}>
              Workers
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar (only for Workers tab) */}
        {activeTab === 'workers' && (
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
        )}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* SCHEDULE TAB */}
        {activeTab === 'schedule' && (
          <>
            {/* Mini Calendar */}
            <View style={[styles.calendarContainer, { backgroundColor: Colors.white }]}>
              <View style={styles.calendarHeader}>
                <Text style={[styles.calendarTitle, { color: Colors.primaryText }]}>
                  {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
              </View>
              <CustomCalendar
                onDateSelect={(dateString) => {
                  // Parse as local date to avoid timezone issues
                  const [year, month, day] = dateString.split('-').map(Number);
                  setSelectedDate(new Date(year, month - 1, day));
                }}
                selectedStart={selectedDate.toISOString().split('T')[0]}
                selectedEnd={selectedDate.toISOString().split('T')[0]}
                theme={{
                  primaryBlue: Colors.primaryBlue,
                  primaryText: Colors.primaryText,
                  white: '#FFFFFF',
                  border: Colors.border,
                }}
              />
            </View>

            {/* Today's Schedule */}
            <View style={styles.scheduleSection}>
              <View style={styles.scheduleSectionHeader}>
                <Text style={[styles.scheduleSectionTitle, { color: Colors.primaryText }]}>
                  {selectedDate.toDateString() === new Date().toDateString()
                    ? "Today's Schedule"
                    : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Text>
                <TouchableOpacity
                  style={[styles.addEventButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => setShowAddEventModal(true)}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.addEventButtonText}>Add Event</Text>
                </TouchableOpacity>
              </View>

              {/* Loading indicator for schedule data */}
              {scheduleLoading && (
                <View style={styles.scheduleLoadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primaryBlue} />
                </View>
              )}

              {/* Personal Events - PRIORITY FIRST */}
              {!scheduleLoading && scheduleEvents.length > 0 && (
                <View style={styles.scheduleCategory}>
                  <View style={styles.categoryHeader}>
                    <Ionicons name="calendar" size={20} color="#10B981" />
                    <Text style={[styles.categoryTitle, { color: '#10B981' }]}>
                      Personal
                    </Text>
                  </View>
                  {scheduleEvents.map((event) => (
                    <View
                      key={event.id}
                      style={[
                        styles.personalEventCard,
                        { backgroundColor: Colors.white, borderLeftColor: event.color || '#10B981', borderLeftWidth: 4 }
                      ]}
                    >
                      {/* Delete Button */}
                      <TouchableOpacity
                        style={styles.deleteEventButton}
                        onPress={() => handleDeleteEvent(event.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      </TouchableOpacity>

                      {/* Time - Large and prominent */}
                      <View style={styles.personalEventTimeContainer}>
                        {!event.all_day && (
                          <Text style={[styles.personalEventTime, { color: Colors.primaryText }]}>
                            {new Date(event.start_datetime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                            {event.end_datetime &&
                              ` - ${new Date(event.end_datetime).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit'
                              })}`
                            }
                          </Text>
                        )}
                        {event.all_day && (
                          <Text style={[styles.personalEventTime, { color: Colors.primaryText }]}>
                            All Day
                          </Text>
                        )}
                        {event.event_type && (
                          <View style={[styles.eventTypeBadge, { backgroundColor: Colors.lightGray }]}>
                            <Text style={[styles.eventTypeBadgeText, { color: Colors.secondaryText }]}>
                              {event.event_type}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Title */}
                      <Text style={[styles.personalEventTitle, { color: Colors.primaryText }]}>
                        {event.title}
                      </Text>

                      {/* Location - Prominent with icon and tappable */}
                      {(event.formatted_address || event.address || event.location) && (
                        <TouchableOpacity
                          style={styles.personalEventLocationContainer}
                          onPress={() => openAddressInMaps(event.formatted_address || event.address || event.location)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="location" size={18} color="#3B82F6" />
                          <Text style={[styles.personalEventLocation, {
                            color: '#3B82F6',
                            textDecorationLine: 'underline'
                          }]}>
                            {event.formatted_address || event.address || event.location}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color="#3B82F6" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Projects - Jobs happening on this date */}
              {!scheduleLoading && activeProjects.length > 0 && (
                <View style={styles.scheduleCategory}>
                  {activeProjects.map((project) => (
                    <TouchableOpacity
                      key={project.id}
                      style={[styles.projectCard, { backgroundColor: Colors.white }]}
                      onPress={() => navigation.navigate('Projects', { projectId: project.id })}
                    >
                      {/* Project Header */}
                      <View style={styles.projectCardHeader}>
                        <Text style={[styles.projectCardTitle, { color: Colors.primaryText }]}>
                          {project.name}
                        </Text>
                        <View
                          style={[
                            styles.projectStatusBadge,
                            {
                              backgroundColor:
                                project.status === 'active'
                                  ? Colors.primaryBlue + '20'
                                  : project.status === 'completed'
                                  ? '#10B981' + '20'
                                  : Colors.secondaryText + '20',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.projectStatusText,
                              {
                                color:
                                  project.status === 'active'
                                    ? Colors.primaryBlue
                                    : project.status === 'completed'
                                    ? '#10B981'
                                    : Colors.secondaryText,
                              },
                            ]}
                          >
                            {project.status === 'active'
                              ? 'Active'
                              : project.status === 'completed'
                              ? 'Completed'
                              : 'Archived'}
                          </Text>
                        </View>
                      </View>

                      {/* Project Timeline */}
                      <View style={styles.projectTimeline}>
                        <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                        <Text style={[styles.projectTimelineText, { color: Colors.secondaryText }]}>
                          {project.startDate && new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {project.endDate && ` - ${new Date(project.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          {!project.endDate && ' - Ongoing'}
                        </Text>
                      </View>

                      {/* Active Phases for this project */}
                      {project.phases && project.phases.length > 0 && (
                        <View style={styles.projectPhases}>
                          <Text style={[styles.projectPhasesLabel, { color: Colors.secondaryText }]}>
                            Phases:
                          </Text>
                          {project.phases.map((phase, index) => (
                            <View
                              key={phase.id}
                              style={[
                                styles.phaseTag,
                                {
                                  backgroundColor:
                                    phase.status === 'in_progress'
                                      ? '#10B981' + '20'
                                      : phase.status === 'completed'
                                      ? Colors.secondaryText + '20'
                                      : Colors.lightGray,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.phaseTagText,
                                  {
                                    color:
                                      phase.status === 'in_progress'
                                        ? '#10B981'
                                        : phase.status === 'completed'
                                        ? Colors.secondaryText
                                        : Colors.secondaryText,
                                  },
                                ]}
                              >
                                {phase.name}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Project Work Schedules */}
              {!scheduleLoading && workSchedules.length > 0 && (
                <View style={styles.scheduleCategory}>
                  <View style={styles.categoryHeader}>
                    <Ionicons name="briefcase" size={20} color={Colors.primaryBlue} />
                    <Text style={[styles.categoryTitle, { color: Colors.primaryBlue }]}>
                      Project Work
                    </Text>
                  </View>
                  {workSchedules.map((schedule) => (
                    <View key={schedule.id} style={[styles.scheduleCard, { backgroundColor: Colors.white }]}>
                      <View style={styles.scheduleCardHeader}>
                        <View style={styles.scheduleCardTitleRow}>
                          <Text style={[styles.scheduleCardProject, { color: Colors.primaryText }]}>
                            {schedule.projects?.name || 'Unknown Project'}
                          </Text>
                          {schedule.start_time && (
                            <Text style={[styles.scheduleCardTime, { color: Colors.secondaryText }]}>
                              {schedule.start_time.substring(0, 5)}
                              {schedule.end_time && ` - ${schedule.end_time.substring(0, 5)}`}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.scheduleCardWorker, { color: Colors.secondaryText }]}>
                          {schedule.workers?.full_name}
                          {schedule.workers?.trade && ` • ${schedule.workers.trade}`}
                        </Text>
                      </View>
                      {schedule.project_phases && (
                        <View style={[styles.scheduleCardPhase, { backgroundColor: Colors.lightGray }]}>
                          <Ionicons name="layers-outline" size={14} color={Colors.secondaryText} />
                          <Text style={[styles.scheduleCardPhaseText, { color: Colors.secondaryText }]}>
                            {schedule.project_phases.name}
                          </Text>
                        </View>
                      )}
                      {schedule.notes && (
                        <Text style={[styles.scheduleCardNotes, { color: Colors.secondaryText }]}>
                          {schedule.notes}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Empty State */}
              {!scheduleLoading && workSchedules.length === 0 && scheduleEvents.length === 0 && activeProjects.length === 0 && (
                <View style={styles.emptyScheduleState}>
                  <Ionicons name="calendar-outline" size={64} color={Colors.secondaryText} />
                  <Text style={[styles.emptyScheduleTitle, { color: Colors.primaryText }]}>
                    Nothing Scheduled
                  </Text>
                  <Text style={[styles.emptyScheduleSubtext, { color: Colors.secondaryText }]}>
                    No work schedules or events for this day
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <>
            {/* Date Header with Navigation */}
            <View style={styles.reportDateNav}>
              <TouchableOpacity
                style={styles.dateNavButton}
                onPress={() => handleReportDateChange(-1)}
              >
                <Ionicons name="chevron-back" size={24} color={Colors.primaryBlue} />
              </TouchableOpacity>
              <View style={styles.dateNavCenter}>
                <Text style={[styles.dateNavTitle, { color: Colors.primaryText }]}>
                  {getReportsDisplayTitle()}
                </Text>
                <Text style={[styles.dateNavSubtitle, { color: Colors.secondaryText }]}>
                  {dailyReports.length} {dailyReports.length === 1 ? 'report' : 'reports'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.dateNavButton}
                onPress={() => handleReportDateChange(1)}
                disabled={!showAllReports && !reportsDateRangeStart && selectedReportDate >= getTodayLocalDate()}
              >
                <Ionicons
                  name="chevron-forward"
                  size={24}
                  color={!showAllReports && !reportsDateRangeStart && selectedReportDate >= getTodayLocalDate() ? Colors.border : Colors.primaryBlue}
                />
              </TouchableOpacity>
              {/* Calendar Icon Button */}
              <TouchableOpacity
                style={[styles.dateNavButton, styles.calendarButton]}
                onPress={() => setShowReportsCalendarModal(true)}
              >
                <Ionicons name="calendar" size={22} color={Colors.primaryBlue} />
              </TouchableOpacity>
            </View>

            {/* Reports Loading */}
            {reportsLoading && (
              <View style={styles.tabLoadingContainer}>
                <ActivityIndicator size="large" color={Colors.primaryBlue} />
              </View>
            )}

            {/* Reports Grouped by Project */}
            {!reportsLoading && Object.keys(reportsGroupedByProject).length > 0 ? (
              <View style={styles.reportsContainer}>
                {Object.entries(reportsGroupedByProject).map(([projectId, projectData]) => (
                  <View key={projectId} style={styles.projectReportGroup}>
                    {/* Project Header */}
                    <View style={[styles.projectReportHeader, { backgroundColor: Colors.primaryBlue + '10' }]}>
                      <Ionicons name="business" size={18} color={Colors.primaryBlue} />
                      <Text style={[styles.projectReportName, { color: Colors.primaryBlue }]}>
                        {projectData.projectName}
                      </Text>
                      <View style={[styles.reportCountBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
                        <Text style={[styles.reportCountText, { color: Colors.primaryBlue }]}>
                          {projectData.reports.length}
                        </Text>
                      </View>
                    </View>

                    {/* Reports for this project */}
                    {projectData.reports.map((report) => (
                      <View key={report.id} style={[styles.reportCard, { backgroundColor: Colors.white }]}>
                        {/* Worker Header */}
                        <View style={styles.reportCardHeader}>
                          <View style={[styles.workerAvatarSmall, { backgroundColor: Colors.primaryBlue }]}>
                            <Text style={styles.workerAvatarSmallText}>
                              {report.workers?.full_name
                                ?.split(' ')
                                .map(n => n[0])
                                .join('')
                                .toUpperCase() || (report.reporter_type === 'owner' ? 'O' : '?')}
                            </Text>
                          </View>
                          <View style={styles.reportCardHeaderInfo}>
                            <View style={styles.reportWorkerRow}>
                              <Text style={[styles.reportWorkerName, { color: Colors.primaryText }]}>
                                {report.reporter_type === 'owner' ? 'Owner' : (report.workers?.full_name || 'Unknown Worker')}
                              </Text>
                              {report.reporter_type === 'owner' && (
                                <View style={[styles.ownerBadgeSmall, { backgroundColor: '#10B981' + '20' }]}>
                                  <Text style={[styles.ownerBadgeSmallText, { color: '#10B981' }]}>Owner</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.reportProjectName, { color: Colors.secondaryText }]}>
                              {report.project_phases?.name || 'General'}
                            </Text>
                          </View>
                        </View>

                        {/* Photos Grid */}
                        {report.photos && report.photos.length > 0 && (
                          <View style={styles.photosGrid}>
                            {report.photos.slice(0, 4).map((photoUrl, index) => (
                              <TouchableOpacity
                                key={index}
                                style={styles.photoThumbnail}
                                onPress={() => openPhotoViewer(report.photos, index)}
                                activeOpacity={0.7}
                              >
                                <Image
                                  source={{ uri: photoUrl }}
                                  style={styles.photoImage}
                                  resizeMode="cover"
                                />
                                {index === 3 && report.photos.length > 4 && (
                                  <View style={[styles.morePhotosOverlay, { backgroundColor: Colors.primaryBlue + '90' }]}>
                                    <Text style={styles.morePhotosText}>+{report.photos.length - 4}</Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}

                        {/* Notes */}
                        {report.notes && (
                          <View style={styles.reportNotes}>
                            <Ionicons name="document-text-outline" size={16} color={Colors.secondaryText} />
                            <Text style={[styles.reportNotesText, { color: Colors.primaryText }]}>
                              {report.notes}
                            </Text>
                          </View>
                        )}

                        {/* Completed Steps */}
                        {report.completed_steps && report.completed_steps.length > 0 && (
                          <View style={styles.completedSteps}>
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                            <Text style={[styles.completedStepsText, { color: '#10B981' }]}>
                              {report.completed_steps.length} task{report.completed_steps.length !== 1 ? 's' : ''} completed
                            </Text>
                          </View>
                        )}

                        {/* Footer - Time */}
                        <View style={styles.reportFooter}>
                          <Ionicons name="time-outline" size={14} color={Colors.secondaryText} />
                          <Text style={[styles.reportTime, { color: Colors.secondaryText }]}>
                            Submitted at {new Date(report.created_at).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : !reportsLoading ? (
              <View style={styles.emptyReportsState}>
                <Ionicons name="document-text-outline" size={64} color={Colors.secondaryText} />
                <Text style={[styles.emptyReportsTitle, { color: Colors.primaryText }]}>
                  No Reports for {formatReportDate(selectedReportDate)}
                </Text>
                <Text style={[styles.emptyReportsSubtext, { color: Colors.secondaryText }]}>
                  Use the arrows to view reports from other days
                </Text>
              </View>
            ) : null}
          </>
        )}

        {/* WORKERS TAB */}
        {activeTab === 'workers' && (
          <>
        {/* Workers Loading */}
        {loading && (
          <View style={styles.tabLoadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        )}

        {/* SCHEDULE SECTION - Clocked In Workers */}
        {!loading && Object.keys(activeClockIns).length === 0 ? (
          <View style={styles.emptySchedule}>
            <Ionicons name="time-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyScheduleText, { color: Colors.secondaryText }]}>
              No one is working so far
            </Text>
          </View>
        ) : !loading && Object.keys(activeClockIns).length > 0 ? (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="time" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryBlue }]}>
                Currently Working ({Object.keys(activeClockIns).length})
              </Text>
            </View>
            <View style={styles.workersList}>
              {workers.filter(w => activeClockIns[w.id]).map((worker) => (
                <WorkerScheduleCard
                  key={worker.id}
                  worker={worker}
                  onPress={() => navigation.navigate('WorkerDetailHistory', { worker })}
                />
              ))}
            </View>
          </View>
        ) : null}


        {/* DIVIDER */}
        {!loading && workers.length > 0 && (
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: Colors.border }]} />
            <Text style={[styles.dividerText, { color: Colors.secondaryText }]}>ALL WORKERS</Text>
            <View style={[styles.dividerLine, { backgroundColor: Colors.border }]} />
          </View>
        )}

        {/* WORKERS LIST SECTION - Empty State */}
        {!loading && filteredWorkers.length === 0 && workers.length === 0 && (
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
        )}

        {/* WORKERS LIST SECTION - With Workers */}
        {!loading && (filteredWorkers.length > 0 || workers.length > 0) && (
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
        {/* End Workers Tab */}
        </>
        )}
      </ScrollView>

      {/* FAB Button for Owner to create daily report - Fixed position outside ScrollView */}
      {activeTab === 'reports' && (
        <TouchableOpacity
          style={styles.reportsFab}
          onPress={() => navigation.navigate('DailyReportForm', { isOwner: true })}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* FAB Button for Workers tab - Add new worker */}
      {activeTab === 'workers' && (
        <TouchableOpacity
          style={styles.workersFab}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

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

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={100}
          >
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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
          </KeyboardAvoidingView>
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

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={100}
          >
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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
          </KeyboardAvoidingView>
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
              <TouchableOpacity onPress={() => {
                setShowDetailModal(false);
                setIsEditingDetail(false);
              }}>
                <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>
                  {isEditingDetail ? 'Cancel' : 'Close'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Worker Details</Text>
              <TouchableOpacity
                onPress={() => {
                  if (isEditingDetail) {
                    handleSaveDetailEdits();
                  } else {
                    setIsEditingDetail(true);
                    setFormName(selectedWorker.full_name || '');
                    setFormPhone(selectedWorker.phone || '');
                    setFormEmail(selectedWorker.email || '');
                    setFormTrade(selectedWorker.trade || '');
                  }
                }}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.primaryBlue} />
                ) : (
                  <Text style={[styles.modalSaveText, { color: Colors.primaryBlue }]}>
                    {isEditingDetail ? 'Save' : 'Edit'}
                  </Text>
                )}
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
                  {(isEditingDetail || selectedWorker.email) && (
                    <View style={[styles.gridItem, { backgroundColor: Colors.white }]}>
                      <View style={[styles.gridIconBg, { backgroundColor: '#10B981' }]}>
                        <Ionicons name="mail" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>EMAIL</Text>
                      {isEditingDetail ? (
                        <TextInput
                          style={[styles.gridInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                          value={formEmail}
                          onChangeText={setFormEmail}
                          placeholder="worker@example.com"
                          placeholderTextColor={Colors.secondaryText}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      ) : (
                        <Text style={[styles.gridValue, { color: Colors.primaryText }]} numberOfLines={1}>
                          {selectedWorker.email}
                        </Text>
                      )}
                    </View>
                  )}

                  {(isEditingDetail || selectedWorker.phone) && (
                    <View style={[styles.gridItem, { backgroundColor: Colors.white }]}>
                      <View style={[styles.gridIconBg, { backgroundColor: '#3B82F6' }]}>
                        <Ionicons name="call" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>PHONE</Text>
                      {isEditingDetail ? (
                        <TextInput
                          style={[styles.gridInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                          value={formPhone}
                          onChangeText={setFormPhone}
                          placeholder="(555) 123-4567"
                          placeholderTextColor={Colors.secondaryText}
                          keyboardType="phone-pad"
                        />
                      ) : (
                        <Text style={[styles.gridValue, { color: Colors.primaryText }]}>
                          {selectedWorker.phone}
                        </Text>
                      )}
                    </View>
                  )}

                  {(isEditingDetail || selectedWorker.trade) && (
                    <View style={[styles.gridItem, { backgroundColor: Colors.white }]}>
                      <View style={[styles.gridIconBg, { backgroundColor: '#F59E0B' }]}>
                        <Ionicons name="hammer" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>TRADE</Text>
                      {isEditingDetail ? (
                        <TextInput
                          style={[styles.gridInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                          value={formTrade}
                          onChangeText={setFormTrade}
                          placeholder="Carpenter, Electrician, etc."
                          placeholderTextColor={Colors.secondaryText}
                        />
                      ) : (
                        <Text style={[styles.gridValue, { color: Colors.primaryText }]}>
                          {selectedWorker.trade}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Payment Card */}
                {(selectedWorker.hourly_rate > 0 || selectedWorker.daily_rate > 0 || selectedWorker.weekly_salary > 0 || selectedWorker.project_rate > 0) && (
                  <View style={[styles.paymentCard, { backgroundColor: Colors.white }]}>
                    <View style={styles.paymentHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name="cash" size={22} color="#6B7280" />
                        <Text style={[styles.paymentHeaderText, { color: Colors.primaryText }]}>Payment Information</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedWorker(null);
                          navigation.navigate('EditWorkerPayment', { worker: selectedWorker });
                        }}
                        style={styles.editPaymentButton}
                      >
                        <Ionicons name="pencil" size={18} color={Colors.primaryBlue} />
                      </TouchableOpacity>
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

                {/* View Payment History Button */}
                <TouchableOpacity
                  style={[styles.viewHistoryButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => {
                    setSelectedWorker(null);
                    navigation.navigate('WorkerDetailHistory', { worker: selectedWorker });
                  }}
                >
                  <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.viewHistoryButtonText}>View Payment History</Text>
                </TouchableOpacity>

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

      {/* Add Personal Event Modal */}
      <AddPersonalEventModal
        visible={showAddEventModal}
        onClose={() => setShowAddEventModal(false)}
        onSave={handleSaveEvent}
        initialDate={selectedDate}
      />

      {/* Full Screen Photo Viewer Modal */}
      {photoViewerVisible && (
        <Modal
          visible={photoViewerVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={closePhotoViewer}
        >
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Close Button */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 50, right: 20, zIndex: 100, padding: 10 }}
              onPress={closePhotoViewer}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>

            {/* Photo Counter */}
            <View style={{ position: 'absolute', top: 55, left: 20, zIndex: 100 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                {viewerPhotoIndex + 1} / {viewerPhotos.length}
              </Text>
            </View>

            {/* Main Image Container */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {/* Loading Spinner - shows behind the image */}
              <ActivityIndicator
                size="large"
                color="#fff"
                style={{ position: 'absolute' }}
              />
              {viewerPhotos.length > 0 && viewerPhotos[viewerPhotoIndex] && (
                <Image
                  key={`photo-${viewerPhotoIndex}`}
                  source={{ uri: viewerPhotos[viewerPhotoIndex] }}
                  style={{ width: screenWidth, height: screenHeight * 0.7 }}
                  resizeMode="contain"
                />
              )}
            </View>

            {/* Left Arrow */}
            {viewerPhotos.length > 1 && viewerPhotoIndex > 0 && (
              <TouchableOpacity
                style={{
                  position: 'absolute',
                  left: 15,
                  top: '50%',
                  marginTop: -30,
                  padding: 15,
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  borderRadius: 30,
                  zIndex: 100,
                }}
                onPress={() => setViewerPhotoIndex(prev => prev - 1)}
              >
                <Ionicons name="chevron-back" size={30} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Right Arrow */}
            {viewerPhotos.length > 1 && viewerPhotoIndex < viewerPhotos.length - 1 && (
              <TouchableOpacity
                style={{
                  position: 'absolute',
                  right: 15,
                  top: '50%',
                  marginTop: -30,
                  padding: 15,
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  borderRadius: 30,
                  zIndex: 100,
                }}
                onPress={() => setViewerPhotoIndex(prev => prev + 1)}
              >
                <Ionicons name="chevron-forward" size={30} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </Modal>
      )}

      {/* Reports Calendar Modal */}
      <Modal
        visible={showReportsCalendarModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReportsCalendarModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.calendarModalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity
              onPress={() => setShowReportsCalendarModal(false)}
              style={styles.calendarModalClose}
            >
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.calendarModalTitle, { color: Colors.primaryText }]}>
              Select Date
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* All Reports Button */}
          <TouchableOpacity
            style={[
              styles.allReportsButton,
              { backgroundColor: showAllReports ? Colors.primaryBlue : Colors.lightGray }
            ]}
            onPress={() => {
              setShowAllReports(true);
              setReportsDateRangeStart(null);
              setReportsDateRangeEnd(null);
              loadReportsTabData({ showAll: true });
              setShowReportsCalendarModal(false);
            }}
          >
            <Ionicons
              name="list"
              size={20}
              color={showAllReports ? '#FFFFFF' : Colors.primaryText}
            />
            <Text style={[
              styles.allReportsButtonText,
              { color: showAllReports ? '#FFFFFF' : Colors.primaryText }
            ]}>
              All Reports
            </Text>
          </TouchableOpacity>

          {/* Calendar */}
          <View style={styles.calendarModalContent}>
            <Text style={[styles.calendarHint, { color: Colors.secondaryText }]}>
              Tap a date or select two dates for a range
            </Text>
            <CustomCalendar
              onDateSelect={(dateString) => {
                if (!reportsDateRangeStart || (reportsDateRangeStart && reportsDateRangeEnd)) {
                  // Start new selection
                  setReportsDateRangeStart(dateString);
                  setReportsDateRangeEnd(null);
                  setShowAllReports(false);
                } else {
                  // Complete range selection
                  if (dateString < reportsDateRangeStart) {
                    setReportsDateRangeEnd(reportsDateRangeStart);
                    setReportsDateRangeStart(dateString);
                  } else {
                    setReportsDateRangeEnd(dateString);
                  }
                }
              }}
              selectedStart={reportsDateRangeStart}
              selectedEnd={reportsDateRangeEnd}
              theme={{
                primaryBlue: Colors.primaryBlue,
                primaryText: Colors.primaryText,
                white: '#FFFFFF',
                border: Colors.border,
              }}
            />
          </View>

          {/* Apply Button */}
          <View style={styles.calendarModalFooter}>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => {
                if (reportsDateRangeStart) {
                  const endDate = reportsDateRangeEnd || reportsDateRangeStart;
                  if (reportsDateRangeStart === endDate) {
                    // Single date selected
                    setSelectedReportDate(reportsDateRangeStart);
                    setReportsDateRangeStart(null);
                    setReportsDateRangeEnd(null);
                    setShowAllReports(false);
                    loadReportsTabData({ date: reportsDateRangeStart });
                  } else {
                    // Date range selected
                    setShowAllReports(false);
                    loadReportsTabData({ startDate: reportsDateRangeStart, endDate: endDate });
                    setReportsDateRangeEnd(endDate);
                  }
                }
                setShowReportsCalendarModal(false);
              }}
              disabled={!reportsDateRangeStart && !showAllReports}
            >
              <Text style={styles.applyButtonText}>
                {reportsDateRangeStart && reportsDateRangeEnd && reportsDateRangeStart !== reportsDateRangeEnd
                  ? 'Apply Range'
                  : reportsDateRangeStart
                    ? 'Select Date'
                    : 'Select a Date'}
              </Text>
            </TouchableOpacity>
          </View>
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    fontWeight: '600',
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
  tabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
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
  gridInput: {
    fontSize: 15,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    backgroundColor: '#F9FAFB',
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
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  paymentHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  editPaymentButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
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
  viewHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  viewHistoryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
  noOneWorkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  noOneWorkingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  // Schedule Tab Styles
  calendarContainer: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  calendarHeader: {
    marginBottom: 16,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scheduleSection: {
    marginTop: 16,
    marginBottom: 20,
  },
  scheduleSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  addEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addEventButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scheduleLoadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLoadingContainer: {
    flex: 1,
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCategory: {
    marginBottom: 24,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scheduleCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  scheduleCardHeader: {
    gap: 8,
  },
  scheduleCardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  scheduleCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  scheduleCardProject: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  scheduleCardTime: {
    fontSize: 14,
    fontWeight: '500',
  },
  scheduleCardWorker: {
    fontSize: 14,
  },
  scheduleCardPhase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  scheduleCardPhaseText: {
    fontSize: 12,
    fontWeight: '500',
  },
  scheduleCardNotes: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  scheduleCardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  scheduleCardLocationText: {
    fontSize: 14,
  },
  emptyScheduleState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyScheduleTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyScheduleSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  // Personal Event Card Styles (Enhanced)
  personalEventCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    gap: 12,
    position: 'relative',
  },
  deleteEventButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  personalEventTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personalEventTime: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eventTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  personalEventTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  personalEventLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  personalEventLocation: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  personalEventDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  // Active Projects Card Styles
  projectCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    gap: 12,
  },
  projectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  projectStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  projectStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectTimelineText: {
    fontSize: 13,
    fontWeight: '500',
  },
  projectPhases: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  projectPhasesLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  phaseTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  phaseTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Reports Tab Styles
  reportDateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  dateNavButton: {
    padding: 8,
  },
  calendarButton: {
    marginLeft: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
  },
  dateNavCenter: {
    alignItems: 'center',
  },
  dateNavTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  dateNavSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  projectReportGroup: {
    marginBottom: 20,
  },
  projectReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  projectReportName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  reportWorkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownerBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ownerBadgeSmallText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reportsFab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  workersFab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  reportsHeader: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportsHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  reportsDateRange: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  reportsBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reportsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  reportCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  workerAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  workerAvatarSmallText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reportCardHeaderInfo: {
    flex: 1,
  },
  reportWorkerName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  reportProjectName: {
    fontSize: 14,
    fontWeight: '500',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  photoThumbnail: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePhotosOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  morePhotosText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  reportNotes: {
    marginBottom: 12,
    flexDirection: 'row',
    gap: 8,
  },
  reportNotesText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  completedSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  completedStepsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
  },
  reportTimestamp: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyReportsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyReportsText: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  // Photo Viewer Styles
  photoViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  photoViewerCounter: {
    position: 'absolute',
    top: 55,
    left: 20,
    zIndex: 10,
  },
  photoViewerCounterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  photoViewerImage: {
    width: screenWidth,
    height: screenHeight * 0.75,
  },
  photoViewerNavLeft: {
    position: 'absolute',
    left: 15,
    top: screenHeight / 2 - 30,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    zIndex: 10,
  },
  photoViewerNavRight: {
    position: 'absolute',
    right: 15,
    top: screenHeight / 2 - 30,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    zIndex: 10,
  },
  // Calendar Modal Styles
  calendarModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  calendarModalClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  calendarModalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  calendarHint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  allReportsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  allReportsButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  calendarModalFooter: {
    padding: 16,
    paddingBottom: 24,
  },
  applyButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
