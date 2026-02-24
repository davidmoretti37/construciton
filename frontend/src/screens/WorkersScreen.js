import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
  ActionSheetIOS,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
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
  getWorkerAssignmentCounts,
  getWorkerClockInHistory,
  fetchTasksForDate,
  fetchTasksForDateRange,
  fetchTasksForSupervisor,
  fetchTasksForSupervisorDateRange,
  regenerateProjectSchedule,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  uncompleteTask,
} from '../utils/storage';
import WorkerCard from '../components/WorkerCard';
import WorkerScheduleCard from '../components/WorkerScheduleCard';
import AppleCalendarMonth from '../components/AppleCalendarMonth';
import AppleCalendarYear from '../components/AppleCalendarYear';
import CustomCalendar from '../components/CustomCalendar';
import AddPersonalEventModal from '../components/AddPersonalEventModal';
import AddTaskModal from '../components/AddTaskModal';
import NotificationBell from '../components/NotificationBell';
import TaskMoveModal from '../components/TaskMoveModal';
import FullscreenPhotoViewer from '../components/FullscreenPhotoViewer';
import AssignWorkerModal from '../components/modals/AssignWorkerModal';
import SkeletonBox from '../components/skeletons/SkeletonBox';
import SkeletonCard from '../components/skeletons/SkeletonCard';
import { formatHoursMinutes } from '../utils/calculations';

export default function WorkersScreen({ navigation, route, ownerMode = false, activeTab: externalActiveTab, onTabChange, showHeader = true }) {
  const { t } = useTranslation('workers');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);
  const { isSupervisor } = useAuth() || {};

  // Tab state - can be controlled externally in owner mode
  const [internalActiveTab, setInternalActiveTab] = useState('schedule'); // 'schedule' | 'reports' | 'workers'

  // Use external tab state if in owner mode, otherwise use internal
  const activeTab = ownerMode && externalActiveTab ? externalActiveTab : internalActiveTab;
  const setActiveTab = ownerMode && onTabChange ? onTabChange : setInternalActiveTab;

  // Owner mode color (royal blue)
  const accentColor = ownerMode ? '#1E40AF' : Colors.primaryBlue;

  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [filteredWorkers, setFilteredWorkers] = useState([]);
  const [assignmentCounts, setAssignmentCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [activeClockIns, setActiveClockIns] = useState({});
  const [selectedWorkerHistory, setSelectedWorkerHistory] = useState([]);

  // Schedule tab state
  const [calendarView, setCalendarView] = useState('month'); // 'month' | 'year'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthTasks, setMonthTasks] = useState([]);
  const [monthEvents, setMonthEvents] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [workSchedules, setWorkSchedules] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [showAddEventModal, setShowAddEventModal] = useState(false);

  // Tasks state
  const [scheduleTasks, setScheduleTasks] = useState([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showMoveTaskModal, setShowMoveTaskModal] = useState(false);
  const [taskToMove, setTaskToMove] = useState(null);

  // Reports tab state
  const [dailyReports, setDailyReports] = useState([]);
  const [groupedReports, setGroupedReports] = useState({});
  // Photo viewer state
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [viewerPhotoIndex, setViewerPhotoIndex] = useState(0);

  // Tab data caching — show cached data instantly on tab switch while refreshing in background
  const scheduleCacheRef = useRef({ monthTasks: null, monthEvents: null, scheduleTasks: null, scheduleEvents: null });
  const reportsCacheRef = useRef(null);
  const workersCacheRef = useRef(null);

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

    // Poll for active clock-ins every 30 seconds so owner sees workers clock in/out
    const pollInterval = setInterval(() => {
      refreshActiveClockIns();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, []);

  // Reload data when screen comes into focus (after editing payment)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Only load if we haven't loaded before
      if (!hasLoadedOnce) {
        loadData();
      }
      // Check if we should open add modal (from quick action)
      if (route?.params?.openAddModal) {
        setShowAddModal(true);
        setActiveTab('workers');
        // Clear the param so it doesn't reopen on subsequent focus
        navigation.setParams({ openAddModal: false });
      }
      // Check if we should open assign modal (from quick action)
      if (route?.params?.openAssignModal) {
        setShowAssignModal(true);
        setActiveTab('workers');
        // Clear the param so it doesn't reopen on subsequent focus
        navigation.setParams({ openAssignModal: false });
      }
    });
    return unsubscribe;
  }, [navigation, hasLoadedOnce]);

  useEffect(() => {
    filterData();
  }, [workers, searchQuery, assignmentCounts]);

  const loadData = async () => {
    try {
      // Show cached data instantly if available
      if (workersCacheRef.current) {
        setWorkers(workersCacheRef.current.workers);
        setActiveClockIns(workersCacheRef.current.clockIns);
        setAssignmentCounts(workersCacheRef.current.counts);
      } else {
        setLoading(true);
      }

      // Load workers data and assignment counts in parallel
      const [workersData, counts] = await Promise.all([
        fetchWorkers(),
        getWorkerAssignmentCounts()
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
      setAssignmentCounts(counts);
      setHasLoadedOnce(true);
      workersCacheRef.current = { workers: workersData, clockIns, counts };
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Lightweight refresh for just active clock-ins (used by polling)
  const refreshActiveClockIns = async () => {
    try {
      if (workers.length === 0) return;

      const clockIns = {};
      for (const worker of workers) {
        const activeSession = await getActiveClockIn(worker.id);
        if (activeSession) {
          clockIns[worker.id] = activeSession;
        }
      }
      setActiveClockIns(clockIns);
    } catch (error) {
      console.error('Error refreshing active clock-ins:', error);
    }
  };

  // Load all tasks and events for the displayed month
  const loadMonthData = async (monthDate) => {
    try {
      // Show cached data instantly if available (skip skeleton)
      const cache = scheduleCacheRef.current;
      if (cache.monthTasks && cache.monthTasks.length > 0) {
        setScheduleLoading(false); // Don't show skeleton if we have cached data
      } else {
        setScheduleLoading(true);
      }

      const yr = monthDate.getFullYear();
      const mo = monthDate.getMonth();
      const monthStart = `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(yr, mo + 1, 0).getDate();
      const monthEnd = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      const startISO = new Date(yr, mo, 1, 0, 0, 0).toISOString();
      const endISO = new Date(yr, mo + 1, 0, 23, 59, 59).toISOString();

      const [tasks, events] = await Promise.all([
        isSupervisor
          ? fetchTasksForSupervisorDateRange(monthStart, monthEnd)
          : fetchTasksForDateRange(monthStart, monthEnd),
        fetchScheduleEvents(startISO, endISO),
      ]);

      setMonthTasks(tasks);
      setMonthEvents(events);
      scheduleCacheRef.current = { ...cache, monthTasks: tasks, monthEvents: events };
      return { tasks, events };
    } catch (error) {
      console.error('Error loading month data:', error);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Load day-specific detail for the selected date (filters from month data + fetches work schedules)
  const loadDayDetail = async (date, mTasks, mEvents) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const dy = String(date.getDate()).padStart(2, '0');
    const dateString = `${yr}-${mo}-${dy}`;

    // Filter month tasks to this day
    const dayTasks = (mTasks || monthTasks).filter(task => {
      if (task.start_date > dateString || task.end_date < dateString) return false;
      const project = task.projects;
      if (!project) return true;
      const workingDays = project.working_days || [1, 2, 3, 4, 5];
      const nonWorkingDates = project.non_working_dates || [];
      if (nonWorkingDates.includes(dateString)) return false;
      const dateObj = new Date(dateString + 'T00:00:00');
      const jsDay = dateObj.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      return workingDays.includes(isoDay);
    });

    // Filter month events to this day
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    const dayEvents = (mEvents || monthEvents).filter(event => {
      const eventStart = new Date(event.start_datetime);
      const eventEnd = event.end_datetime ? new Date(event.end_datetime) : eventStart;
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });

    // Fetch day-specific data
    const [workScheduleData, projectsData] = await Promise.all([
      fetchWorkSchedules(dateString, dateString),
      fetchActiveProjectsForDate(dateString),
    ]);

    setScheduleTasks(dayTasks);
    setScheduleEvents(dayEvents);
    setWorkSchedules(workScheduleData);
    setActiveProjects(projectsData);

    // Auto-sync: regenerate stale tasks if none found but projects exist
    if (dayTasks.length === 0 && projectsData.length > 0) {
      try {
        for (const proj of projectsData) {
          await regenerateProjectSchedule(proj.id, proj.user_id);
        }
        // Re-fetch month data after regeneration
        await loadMonthData(currentMonth);
      } catch (syncErr) {
        console.error('🔄 [AUTO-SYNC] Error:', syncErr);
      }
    }
  };

  // Wrapper for reloading schedule after mutations (event/task create/delete/update)
  const reloadScheduleData = async () => {
    if (calendarView === 'year') {
      await loadYearData(currentMonth.getFullYear());
    } else {
      await loadMonthData(currentMonth);
      await loadDayDetail(selectedDate);
    }
  };

  // Load all tasks and events for an entire year (for year view)
  const loadYearData = async (yr) => {
    try {
      setScheduleLoading(true);
      const yearStart = `${yr}-01-01`;
      const yearEnd = `${yr}-12-31`;
      const startISO = new Date(yr, 0, 1, 0, 0, 0).toISOString();
      const endISO = new Date(yr, 11, 31, 23, 59, 59).toISOString();

      const [tasks, events] = await Promise.all([
        isSupervisor
          ? fetchTasksForSupervisorDateRange(yearStart, yearEnd)
          : fetchTasksForDateRange(yearStart, yearEnd),
        fetchScheduleEvents(startISO, endISO),
      ]);

      setMonthTasks(tasks);
      setMonthEvents(events);
    } catch (error) {
      console.error('Error loading year data:', error);
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
      t('actions.openInMaps', 'Open in Maps'),
      t('actions.chooseMapApp', 'Choose which map app to use:'),
      [
        {
          text: t('actions.googleMaps', 'Google Maps'),
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
                Alert.alert(t('errors.error', 'Error'), t('errors.couldNotOpenMaps', 'Could not open maps'));
              });
          },
        },
        {
          text: t('actions.appleMaps', 'Apple Maps'),
          onPress: () => {
            const appleMapsUrl = `maps://maps.apple.com/?address=${encodedAddress}`;
            Linking.openURL(appleMapsUrl).catch((err) => {
              console.error('Error opening Apple Maps:', err);
              Alert.alert(t('errors.error', 'Error'), t('errors.couldNotOpenMaps', 'Could not open maps'));
            });
          },
        },
        {
          text: t('actions.cancel', 'Cancel'),
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
        Alert.alert(t('success.title', 'Success'), t('success.eventAdded', 'Personal event added successfully'));
        // Reload schedule data to show the new event
        reloadScheduleData();
      } else {
        Alert.alert(t('errors.error', 'Error'), t('errors.createEventFailed', 'Failed to create event. Please try again.'));
      }
    } catch (error) {
      console.error('Error saving event:', error);
      Alert.alert(t('errors.error', 'Error'), t('errors.createEventFailed', 'Failed to create event. Please try again.'));
    }
  };

  // Handle deleting personal event
  const handleDeleteEvent = async (eventId) => {
    Alert.alert(
      t('schedule.deleteEvent', 'Delete Event'),
      t('schedule.confirmDeleteEvent', 'Are you sure you want to delete this event?'),
      [
        {
          text: t('actions.cancel', 'Cancel'),
          style: 'cancel',
        },
        {
          text: t('actions.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteScheduleEvent(eventId);
              if (success) {
                Alert.alert(t('success.title', 'Success'), t('success.eventDeleted', 'Event deleted successfully'));
                // Reload schedule data to remove the deleted event
                reloadScheduleData();
              } else {
                Alert.alert(t('errors.error', 'Error'), t('errors.deleteEventFailed', 'Failed to delete event. Please try again.'));
              }
            } catch (error) {
              console.error('Error deleting event:', error);
              Alert.alert(t('errors.error', 'Error'), t('errors.deleteEventFailed', 'Failed to delete event. Please try again.'));
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Handle saving a task (create or update)
  const handleSaveTask = async (taskData) => {
    try {
      let result;
      if (taskData.id) {
        // Update existing task
        result = await updateTask(taskData.id, taskData);
      } else {
        // Create new task
        result = await createTask(taskData);
      }

      if (result) {
        // Reload schedule data to show the new/updated task
        reloadScheduleData();
      } else {
        Alert.alert(t('errors.error', 'Error'), t('errors.saveTaskFailed', 'Failed to save task. Please try again.'));
      }
    } catch (error) {
      console.error('Error saving task:', error);
      throw error;
    }
  };

  // Handle deleting a task
  const handleDeleteTask = async (taskId) => {
    Alert.alert(
      t('schedule.deleteTask', 'Delete Task'),
      t('schedule.confirmDeleteTask', 'Are you sure you want to delete this task?'),
      [
        {
          text: t('actions.cancel', 'Cancel'),
          style: 'cancel',
        },
        {
          text: t('actions.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteTask(taskId);
              if (success) {
                reloadScheduleData();
              } else {
                Alert.alert(t('errors.error', 'Error'), t('errors.deleteTaskFailed', 'Failed to delete task. Please try again.'));
              }
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert(t('errors.error', 'Error'), t('errors.deleteTaskFailed', 'Failed to delete task. Please try again.'));
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Handle editing a task
  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowAddTaskModal(true);
  };

  // Handle opening move task modal
  const handleMoveTask = (task) => {
    setTaskToMove(task);
    setShowMoveTaskModal(true);
  };

  // Handle task moved - reload tasks
  const handleTaskMoved = () => {
    reloadScheduleData();
  };

  // Handle toggling task completion
  const handleToggleTaskComplete = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';

    // Update local state immediately for instant feedback
    setScheduleTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === task.id ? { ...t, status: newStatus } : t
      )
    );

    try {
      let success;
      if (task.status === 'completed') {
        success = await uncompleteTask(task.id);
      } else {
        success = await completeTask(task.id);
      }

      if (!success) {
        // Revert on failure
        setScheduleTasks(prevTasks =>
          prevTasks.map(t =>
            t.id === task.id ? { ...t, status: task.status } : t
          )
        );
        Alert.alert(t('errors.error', 'Error'), t('errors.updateTaskFailed', 'Failed to update task. Please try again.'));
      }
    } catch (error) {
      // Revert on error
      setScheduleTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === task.id ? { ...t, status: task.status } : t
        )
      );
      console.error('Error toggling task completion:', error);
      Alert.alert(t('errors.error', 'Error'), t('errors.updateTaskFailed', 'Failed to update task. Please try again.'));
    }
  };

  // Load data for Reports tab - loads reports for selected date, date range, or all
  const loadReportsTabData = async (options = {}) => {
    try {
      // Show cached data instantly if available
      if (reportsCacheRef.current && !options.forceRefresh) {
        setDailyReports(reportsCacheRef.current.reports);
        setReportsGroupedByProject(reportsCacheRef.current.grouped);
      } else {
        setReportsLoading(true);
      }

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
      reportsCacheRef.current = { reports, grouped: groupedByProject };
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
    reportsCacheRef.current = null; // Invalidate cache on date change

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
      return t('reports.today', 'Today');
    } else if (dateString === yesterdayStr) {
      return t('reports.yesterday', 'Yesterday');
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
      return t('reports.allReports', 'All Reports');
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

  // Load data when schedule tab becomes active, month changes, or view mode changes
  useEffect(() => {
    if (activeTab === 'schedule') {
      if (calendarView === 'year') {
        loadYearData(currentMonth.getFullYear());
      } else {
        loadMonthData(currentMonth).then((data) => {
          if (data) loadDayDetail(selectedDate, data.tasks, data.events);
        });
      }
    }
  }, [activeTab, currentMonth, calendarView]);

  // Load day detail when selected date changes within month view
  useEffect(() => {
    if (activeTab === 'schedule' && calendarView === 'month' && (monthTasks.length > 0 || monthEvents.length > 0)) {
      loadDayDetail(selectedDate);
    }
  }, [selectedDate]);

  // Load non-schedule tabs
  useEffect(() => {
    if (activeTab === 'reports') {
      loadReportsTabData();
    } else if (activeTab === 'workers') {
      loadWorkersTabData();
    }
  }, [activeTab, selectedReportDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    switch (activeTab) {
      case 'schedule':
        await reloadScheduleData();
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

    // Sort workers: active status first, then by assignment history (most assignments first)
    filtered.sort((a, b) => {
      // Workers with status 'active' first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      // Then by assignment count (workers with more assignments first)
      const aCount = assignmentCounts[a.id] || 0;
      const bCount = assignmentCounts[b.id] || 0;
      if (aCount !== bCount) return bCount - aCount;
      // Finally by created date as tiebreaker
      return new Date(a.created_at) - new Date(b.created_at);
    });

    setFilteredWorkers(filtered);
  };

  const handleAddWorker = async () => {
    if (!formName.trim()) {
      Alert.alert(t('errors.error', 'Error'), t('errors.nameRequired'));
      return;
    }

    if (!formEmail.trim()) {
      Alert.alert(t('errors.error', 'Error'), t('errors.emailRequired', 'Email is required to send worker invite'));
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      Alert.alert(t('errors.error', 'Error'), t('errors.emailInvalid', 'Please enter a valid email address'));
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
        Alert.alert(t('success.title', 'Success'), t('success.workerAdded', 'Worker added successfully'));
      } else {
        Alert.alert(t('errors.error', 'Error'), t('errors.saveFailed'));
      }
    } catch (error) {
      console.error('Error adding worker:', error);
      Alert.alert(t('errors.error', 'Error'), t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEditWorker = async () => {
    if (!formName.trim()) {
      Alert.alert(t('errors.error', 'Error'), t('errors.nameRequired'));
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
        Alert.alert(t('success.title', 'Success'), t('success.workerUpdated', 'Worker updated successfully'));
      } else {
        Alert.alert(t('errors.error', 'Error'), t('errors.saveFailed'));
      }
    } catch (error) {
      console.error('Error updating worker:', error);
      Alert.alert(t('errors.error', 'Error'), t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailEdits = async () => {
    if (!formName.trim()) {
      Alert.alert(t('errors.error', 'Error'), t('errors.nameRequired'));
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
        Alert.alert(t('success.title', 'Success'), t('success.workerUpdated', 'Worker updated successfully'));
      } else {
        Alert.alert(t('errors.error', 'Error'), t('errors.saveFailed'));
      }
    } catch (error) {
      console.error('Error updating worker:', error);
      Alert.alert(t('errors.error', 'Error'), t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorker = (worker) => {
    Alert.alert(t('deleteWorker'), t('confirmDelete.message'), [
      { text: t('actions.cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('actions.delete', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          const success = await deleteWorker(worker.id);
          if (success) {
            setWorkers(workers.filter(w => w.id !== worker.id));
            setShowDetailModal(false);
            Alert.alert(t('success.title', 'Success'), t('success.workerDeleted', 'Worker deleted'));
          } else {
            Alert.alert(t('errors.error', 'Error'), t('errors.deleteFailed'));
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

  const openDetailModal = async (worker) => {
    setSelectedWorker(worker);
    setShowDetailModal(true);
    // Load worker's clock history in background
    try {
      const history = await getWorkerClockInHistory(worker.id, 7);
      setSelectedWorkerHistory(history || []);
    } catch (error) {
      console.error('Error loading worker history:', error);
      setSelectedWorkerHistory([]);
    }
  };

  // Helper functions for clock history display
  const formatClockTime = (timestamp) => {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatClockDate = (timestamp) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        return Colors.successGreen;
      case 'inactive':
        return Colors.secondaryText;
      case 'pending':
        return Colors.warningOrange;
      case 'rejected':
        return Colors.errorRed;
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

  // Content wrapper - when showHeader is false, don't wrap in SafeAreaView
  const ContentWrapper = showHeader ? SafeAreaView : View;

  return (
    <ContentWrapper style={[styles.container, { backgroundColor: Colors.white }]}>
      {/* Header - only show when showHeader is true */}
      {showHeader && (
        <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          {/* Tab Bar */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'schedule' && styles.activeTab, ownerMode && activeTab === 'schedule' && { borderBottomColor: accentColor }]}
              onPress={() => setActiveTab('schedule')}
            >
              <Ionicons
                name={activeTab === 'schedule' ? "calendar" : "calendar-outline"}
                size={ownerMode ? 18 : 20}
                color={activeTab === 'schedule' ? accentColor : Colors.secondaryText}
              />
              <Text style={[
                styles.tabText,
                ownerMode && { fontSize: 12 },
                activeTab === 'schedule' && { ...styles.activeTabText, color: accentColor }
              ]}>
                {t('tabs.schedule', 'Schedule')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'reports' && styles.activeTab, ownerMode && activeTab === 'reports' && { borderBottomColor: accentColor }]}
              onPress={() => setActiveTab('reports')}
            >
              <Ionicons
                name={activeTab === 'reports' ? "document-text" : "document-text-outline"}
                size={ownerMode ? 18 : 20}
                color={activeTab === 'reports' ? accentColor : Colors.secondaryText}
              />
              <Text style={[
                styles.tabText,
                ownerMode && { fontSize: 12 },
                activeTab === 'reports' && { ...styles.activeTabText, color: accentColor }
              ]}>
                {t('tabs.reports', 'Reports')}
              </Text>
            </TouchableOpacity>

            {/* Workers tab - only in non-owner mode (supervisors see this) */}
            {!ownerMode && (
              <TouchableOpacity
                style={[styles.tab, activeTab === 'workers' && styles.activeTab]}
                onPress={() => setActiveTab('workers')}
              >
                <Ionicons
                  name={activeTab === 'workers' ? "people" : "people-outline"}
                  size={20}
                  color={activeTab === 'workers' ? accentColor : Colors.secondaryText}
                />
                <Text style={[
                  styles.tabText,
                  activeTab === 'workers' && { ...styles.activeTabText, color: accentColor }
                ]}>
                  {t('title')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Team tab - only in owner mode (combined Supervisors + Workers) */}
            {ownerMode && (
              <TouchableOpacity
                style={[styles.tab, activeTab === 'team' && styles.activeTab, activeTab === 'team' && { borderBottomColor: accentColor }]}
                onPress={() => setActiveTab('team')}
              >
                <Ionicons
                  name={activeTab === 'team' ? "people" : "people-outline"}
                  size={18}
                  color={activeTab === 'team' ? accentColor : Colors.secondaryText}
                />
                <Text style={[
                  styles.tabText,
                  { fontSize: 12 },
                  activeTab === 'team' && { ...styles.activeTabText, color: accentColor }
                ]}>
                  Team
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Search Bar (only for Workers tab) */}
          {activeTab === 'workers' && (
            <View style={[styles.searchBar, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="search" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.searchInput, { color: Colors.primaryText }]}
                placeholder={t('searchPlaceholder')}
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

          {/* Add Worker Button (only for Workers tab) */}
          {activeTab === 'workers' && (
            <View style={styles.addWorkerButtonContainer}>
              <TouchableOpacity
                style={[styles.addWorkerButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => setShowAddModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.addWorkerButtonText}>{t('addWorker', 'Add Worker')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* SCHEDULE TAB */}
        {activeTab === 'schedule' && (
          <>
            {/* Calendar View: Year or Month */}
            <View style={[styles.calendarContainer, { backgroundColor: Colors.white }]}>
              {calendarView === 'year' ? (
                <AppleCalendarYear
                  currentYear={currentMonth.getFullYear()}
                  onYearChange={(yr) => setCurrentMonth(new Date(yr, currentMonth.getMonth(), 1))}
                  onMonthSelect={(monthIdx) => {
                    setCurrentMonth(new Date(currentMonth.getFullYear(), monthIdx, 1));
                    setCalendarView('month');
                  }}
                  tasks={monthTasks}
                  events={monthEvents}
                  theme={{
                    primaryBlue: Colors.primaryBlue,
                    primaryText: Colors.primaryText,
                    secondaryText: Colors.secondaryText,
                    white: Colors.white,
                    border: Colors.border,
                    lightGray: Colors.lightGray,
                    errorRed: Colors.errorRed,
                  }}
                />
              ) : (
                <AppleCalendarMonth
                  currentMonth={currentMonth}
                  selectedDate={(() => {
                    const y = selectedDate.getFullYear();
                    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const d = String(selectedDate.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                  })()}
                  onDateSelect={(dateString) => {
                    const [year, month, day] = dateString.split('-').map(Number);
                    setSelectedDate(new Date(year, month - 1, day));
                  }}
                  onMonthChange={(newMonth) => setCurrentMonth(newMonth)}
                  onTitlePress={() => setCalendarView('year')}
                  tasks={monthTasks}
                  events={monthEvents}
                  theme={{
                    primaryBlue: Colors.primaryBlue,
                    primaryText: Colors.primaryText,
                    secondaryText: Colors.secondaryText,
                    white: Colors.white,
                    border: Colors.border,
                    lightGray: Colors.lightGray,
                    errorRed: Colors.errorRed,
                  }}
                />
              )}
            </View>

            {/* Day Detail Section (only visible in month view) */}
            {calendarView === 'month' && <View style={styles.scheduleSection}>
              {/* Date header row with inline action links */}
              <View style={styles.dayDetailHeader}>
                <Text style={[styles.dayDetailDate, { color: Colors.primaryText }]}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <View style={styles.dayDetailActions}>
                  <TouchableOpacity
                    style={[styles.inlineActionButton, { borderColor: Colors.primaryBlue, backgroundColor: Colors.primaryBlue + '10' }]}
                    onPress={() => setShowAddEventModal(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Ionicons name="add" size={16} color={Colors.primaryBlue} />
                    <Text style={[styles.inlineActionText, { color: Colors.primaryBlue }]}>Event</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inlineActionButton, { borderColor: Colors.warningOrange, backgroundColor: Colors.warningOrange + '10' }]}
                    onPress={() => {
                      setEditingTask(null);
                      setShowAddTaskModal(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Ionicons name="add" size={16} color={Colors.warningOrange} />
                    <Text style={[styles.inlineActionText, { color: Colors.warningOrange }]}>Task</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* Loading skeleton for schedule data */}
              {scheduleLoading && (
                <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
                  <SkeletonBox width="55%" height={16} borderRadius={4} style={{ marginBottom: 16 }} />
                  <SkeletonCard lines={2} style={{ marginBottom: 8 }} />
                  <SkeletonCard lines={2} />
                </View>
              )}

              {/* Personal Events */}
              {!scheduleLoading && scheduleEvents.length > 0 && (
                <View style={styles.scheduleCategory}>
                  <Text style={[styles.categoryLabel, { color: Colors.successGreen }]}>
                    {t('schedule.personal', 'Personal')}
                  </Text>
                  {scheduleEvents.map((event) => (
                    <View
                      key={event.id}
                      style={[
                        styles.personalEventCard,
                        { backgroundColor: Colors.white, borderLeftColor: event.color || Colors.successGreen, borderLeftWidth: 4 }
                      ]}
                    >
                      {/* Delete Button */}
                      <TouchableOpacity
                        style={styles.deleteEventButton}
                        onPress={() => handleDeleteEvent(event.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={20} color={Colors.errorRed} />
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
                            {t('schedule.allDay', 'All Day')}
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
                          <Ionicons name="location" size={18} color={Colors.infoBlue} />
                          <Text style={[styles.personalEventLocation, {
                            color: Colors.infoBlue,
                            textDecorationLine: 'underline'
                          }]}>
                            {event.formatted_address || event.address || event.location}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color={Colors.infoBlue} style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Tasks Section */}
              {!scheduleLoading && (
                <View style={styles.scheduleCategory}>
                  <Text style={[styles.categoryLabel, { color: Colors.warningOrange }]}>
                    Tasks
                  </Text>

                  {scheduleTasks.length === 0 ? (
                    <View style={[styles.emptyTasksContainer, { backgroundColor: Colors.white }]}>
                      <Ionicons name="clipboard-outline" size={32} color={Colors.secondaryText} />
                      <Text style={[styles.emptyTasksText, { color: Colors.secondaryText }]}>
                        {t('schedule.noTasks', 'No tasks for this day')}
                      </Text>
                      <Text style={[styles.emptyTasksSubtext, { color: Colors.secondaryText }]}>
                        {t('schedule.addTaskHint', 'Tap "Add Task" to assign work to your team')}
                      </Text>
                    </View>
                  ) : (
                    // Group tasks by project with collapsible dropdowns
                    Object.entries(
                      scheduleTasks.reduce((acc, task) => {
                        const projectName = task.projects?.name || 'Unknown Project';
                        if (!acc[projectName]) {
                          acc[projectName] = [];
                        }
                        acc[projectName].push(task);
                        return acc;
                      }, {})
                    ).map(([projectName, tasks]) => {
                      const isExpanded = expandedProjects[projectName];
                      const completedCount = tasks.filter(t => t.status === 'completed').length;
                      return (
                        <View key={projectName} style={styles.taskProjectGroup}>
                          <TouchableOpacity
                            style={[styles.taskProjectHeader, { backgroundColor: Colors.white, borderLeftWidth: 4, borderLeftColor: Colors.warningOrange, borderWidth: 1, borderColor: Colors.border }]}
                            onPress={() => setExpandedProjects(prev => ({ ...prev, [projectName]: !prev[projectName] }))}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="business-outline" size={18} color={Colors.warningOrange} />
                            <Text style={[styles.taskProjectName, { color: Colors.primaryText, flex: 1 }]} numberOfLines={1}>
                              {projectName}
                            </Text>
                            <Text style={[{ color: Colors.secondaryText, fontSize: 13, fontWeight: '500', marginRight: 8 }]}>
                              {completedCount}/{tasks.length}
                            </Text>
                            <Ionicons
                              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                              size={20}
                              color={Colors.secondaryText}
                            />
                          </TouchableOpacity>
                          {isExpanded && (
                            <View style={{ backgroundColor: Colors.lightGray + '40', paddingHorizontal: 10, paddingVertical: 8, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
                              {tasks.map((task) => (
                                <View
                                  key={task.id}
                                  style={[
                                    styles.taskCard,
                                    { backgroundColor: Colors.white, borderLeftColor: Colors.warningOrange, borderLeftWidth: 3 }
                                  ]}
                                >
                                  <View style={styles.taskCardContent}>
                                    <TouchableOpacity
                                      style={styles.taskStatusIcon}
                                      onPress={() => handleToggleTaskComplete(task)}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                      <Ionicons
                                        name={task.status === 'completed' ? 'checkbox' : task.status === 'incomplete' ? 'close-circle' : 'square-outline'}
                                        size={22}
                                        color={task.status === 'completed' ? Colors.successGreen : task.status === 'incomplete' ? Colors.errorRed : Colors.secondaryText}
                                      />
                                    </TouchableOpacity>
                                    <View style={styles.taskDetails}>
                                      <Text style={[
                                        styles.taskTitle,
                                        { color: Colors.primaryText },
                                        task.status === 'completed' && { textDecorationLine: 'line-through', color: Colors.secondaryText }
                                      ]}>
                                        {task.title}
                                      </Text>
                                      {task.description && (
                                        <Text style={[styles.taskDescription, { color: Colors.secondaryText }]} numberOfLines={2}>
                                          {task.description}
                                        </Text>
                                      )}
                                      <View style={styles.taskMeta}>
                                        {task.start_date !== task.end_date && (
                                          <View style={[styles.taskDateBadge, { backgroundColor: Colors.lightGray }]}>
                                            <Ionicons name="calendar-outline" size={12} color={Colors.secondaryText} />
                                            <Text style={[styles.taskDateText, { color: Colors.secondaryText }]}>
                                              {new Date(task.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                              {' - '}
                                              {new Date(task.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </Text>
                                          </View>
                                        )}
                                        {task.status === 'completed' && task.completed_worker && (
                                          <View style={[styles.taskCompletedBadge, { backgroundColor: Colors.successGreen + '15' }]}>
                                            <Ionicons name="checkmark-circle" size={12} color={Colors.successGreen} />
                                            <Text style={[styles.taskCompletedText, { color: Colors.successGreen }]}>
                                              {task.completed_worker.full_name}
                                            </Text>
                                          </View>
                                        )}
                                        {task.status === 'incomplete' && task.incomplete_reason && (
                                          <View style={[styles.taskIncompleteBadge, { backgroundColor: Colors.errorRed + '15' }]}>
                                            <Ionicons name="alert-circle" size={12} color={Colors.errorRed} />
                                            <Text style={[styles.taskIncompleteText, { color: Colors.errorRed }]} numberOfLines={1}>
                                              {task.incomplete_reason}
                                            </Text>
                                          </View>
                                        )}
                                      </View>
                                    </View>
                                    <View style={styles.taskActions}>
                                      <TouchableOpacity
                                        style={styles.taskActionButton}
                                        onPress={() => handleMoveTask(task)}
                                      >
                                        <Ionicons name="swap-horizontal-outline" size={18} color={Colors.primaryBlue} />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.taskActionButton}
                                        onPress={() => handleEditTask(task)}
                                      >
                                        <Ionicons name="pencil-outline" size={18} color={Colors.primaryBlue} />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.taskActionButton}
                                        onPress={() => handleDeleteTask(task.id)}
                                      >
                                        <Ionicons name="trash-outline" size={18} color={Colors.errorRed} />
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* Project Work Schedules */}
              {!scheduleLoading && workSchedules.length > 0 && (
                <View style={styles.scheduleCategory}>
                  <Text style={[styles.categoryLabel, { color: Colors.primaryBlue }]}>
                    {t('schedule.projectWork', 'Project Work')}
                  </Text>
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
              {!scheduleLoading && workSchedules.length === 0 && scheduleEvents.length === 0 && scheduleTasks.length === 0 && (
                <View style={styles.emptyScheduleState}>
                  <Ionicons name="calendar-outline" size={64} color={Colors.secondaryText} />
                  <Text style={[styles.emptyScheduleTitle, { color: Colors.primaryText }]}>
                    {t('schedule.nothingScheduled', 'Nothing Scheduled')}
                  </Text>
                  <Text style={[styles.emptyScheduleSubtext, { color: Colors.secondaryText }]}>
                    {t('schedule.noSchedules', 'No work schedules or events for this day')}
                  </Text>
                </View>
              )}
            </View>}
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
                  {dailyReports.length} {dailyReports.length === 1 ? t('reports.report', 'report') : t('reports.reports', 'reports')}
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

            {/* Reports Loading Skeleton */}
            {reportsLoading && (
              <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
                <SkeletonBox width="45%" height={16} borderRadius={4} style={{ marginBottom: 14 }} />
                <SkeletonCard lines={3} style={{ marginBottom: 8 }} />
                <SkeletonCard lines={3} style={{ marginBottom: 8 }} />
                <SkeletonCard lines={2} />
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
                                .toUpperCase() || (report.reporter_type === 'owner' ? 'O' : report.reporter_type === 'supervisor' ? 'S' : '?')}
                            </Text>
                          </View>
                          <View style={styles.reportCardHeaderInfo}>
                            <View style={styles.reportWorkerRow}>
                              <Text style={[styles.reportWorkerName, { color: Colors.primaryText }]}>
                                {report.reporter_type === 'owner' ? t('reports.owner', 'Owner') : report.reporter_type === 'supervisor' ? (report.profiles?.business_name || t('reports.supervisor', 'Supervisor')) : (report.workers?.full_name || t('reports.unknownWorker', 'Unknown Worker'))}
                              </Text>
                              {report.reporter_type === 'owner' && (
                                <View style={[styles.ownerBadgeSmall, { backgroundColor: Colors.successGreen + '20' }]}>
                                  <Text style={[styles.ownerBadgeSmallText, { color: Colors.successGreen }]}>{t('reports.owner', 'Owner')}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.reportProjectName, { color: Colors.secondaryText }]}>
                              {report.project_phases?.name || t('reports.general', 'General')}
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
                            <Ionicons name="checkmark-circle" size={16} color={Colors.successGreen} />
                            <Text style={[styles.completedStepsText, { color: Colors.successGreen }]}>
                              {report.completed_steps.length} {report.completed_steps.length !== 1 ? t('reports.tasksCompleted', 'tasks completed') : t('reports.taskCompleted', 'task completed')}
                            </Text>
                          </View>
                        )}

                        {/* Footer - Time */}
                        <View style={styles.reportFooter}>
                          <Ionicons name="time-outline" size={14} color={Colors.secondaryText} />
                          <Text style={[styles.reportTime, { color: Colors.secondaryText }]}>
                            {t('reports.submittedAt', 'Submitted at')} {new Date(report.created_at).toLocaleTimeString('en-US', {
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
                  {t('reports.noReportsForDate', 'No Reports for {{date}}', { date: formatReportDate(selectedReportDate) })}
                </Text>
                <Text style={[styles.emptyReportsSubtext, { color: Colors.secondaryText }]}>
                  {t('reports.useArrows', 'Use the arrows to view reports from other days')}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {/* WORKERS TAB */}
        {activeTab === 'workers' && (
          <>
        {/* Workers Loading Skeleton */}
        {loading && (
          <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
            <SkeletonBox width="50%" height={18} borderRadius={4} style={{ marginBottom: 14 }} />
            <SkeletonCard lines={2} showAvatar style={{ marginBottom: 8 }} />
            <SkeletonCard lines={2} showAvatar style={{ marginBottom: 8 }} />
            <SkeletonCard lines={2} showAvatar />
          </View>
        )}

        {/* SCHEDULE SECTION - Clocked In Workers */}
        {!loading && Object.keys(activeClockIns).length === 0 ? (
          <View style={styles.emptySchedule}>
            <Ionicons name="time-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyScheduleText, { color: Colors.secondaryText }]}>
              {t('schedule.noOneWorking', 'No one is working so far')}
            </Text>
          </View>
        ) : !loading && Object.keys(activeClockIns).length > 0 ? (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="time" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryBlue }]}>
                {t('schedule.currentlyWorking', 'Currently Working')} ({Object.keys(activeClockIns).length})
              </Text>
            </View>
            <View style={styles.workersList}>
              {workers.filter(w => activeClockIns[w.id]).map((worker) => {
                const clockIn = activeClockIns[worker.id];
                // Enrich worker with clock-in data
                const enrichedWorker = {
                  ...worker,
                  isActive: true,
                  clockInTime: clockIn.clock_in,
                  latestClockIn: clockIn,
                  hoursWorked: (new Date() - new Date(clockIn.clock_in)) / (1000 * 60 * 60),
                };
                return (
                  <WorkerScheduleCard
                    key={worker.id}
                    worker={enrichedWorker}
                    onPress={() => navigation.navigate('WorkerDetailHistory', { worker: enrichedWorker })}
                  />
                );
              })}
            </View>
          </View>
        ) : null}



        {/* WORKERS LIST SECTION - Empty State */}
        {!loading && filteredWorkers.length === 0 && workers.length === 0 && (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="people-outline" size={64} color={Colors.secondaryText} />
            </View>
            <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>
              {workers.length === 0 ? t('noWorkers') : t('emptyState.noWorkersFound', 'No workers found')}
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              {workers.length === 0
                ? t('noWorkersHint')
                : t('emptyState.adjustSearch', 'Try adjusting your search or filter')}
            </Text>
          </View>
        )}

        {/* WORKERS LIST SECTION - With Workers */}
        {!loading && (filteredWorkers.length > 0 || workers.length > 0) && (
          <>
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
                    hidePayment={isSupervisor}
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
              <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>{t('actions.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('newWorker')}</Text>
            </View>
            <TouchableOpacity
              style={styles.modalHeaderButton}
              onPress={handleAddWorker}
              disabled={saving}
            >
              <Text style={[styles.modalSaveText, { color: Colors.primaryBlue, opacity: saving ? 0.5 : 1 }]}>
                {saving ? t('actions.saving', 'Saving...') : t('actions.add', 'Add')}
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
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>{t('form.personalInfo', 'Personal Information')}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.fullName')} *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="person" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder={t('form.fullNamePlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.phone')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="call" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formPhone}
                    onChangeText={setFormPhone}
                    placeholder={t('form.phonePlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.email')} *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="mail" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder={t('form.emailPlaceholder')}
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
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>{t('form.workDetails', 'Work Details')}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.role')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="hammer" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formTrade}
                    onChangeText={setFormTrade}
                    placeholder={t('form.rolePlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>
            </View>

            {/* Payment Details Section - Hidden for supervisors */}
            {!isSupervisor && (
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="wallet-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>{t('form.paymentDetails', 'Payment Details')}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.paymentType', 'Payment Type')}</Text>
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
                      {t('form.hourly', 'Hourly')}
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
                      {t('form.daily', 'Daily')}
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
                      {t('form.weekly', 'Weekly')}
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
                      {t('form.project', 'Project')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hourly Rate */}
              {formPaymentType === 'hourly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.hourlyRate')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formRate}
                      onChangeText={setFormRate}
                      placeholder={t('form.hourlyRatePlaceholder')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Daily Rate */}
              {formPaymentType === 'daily' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.dailyRate', 'Daily Rate')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formDailyRate}
                      onChangeText={setFormDailyRate}
                      placeholder={t('form.dailyRatePlaceholder', '200.00')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Weekly Salary */}
              {formPaymentType === 'weekly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.weeklySalary', 'Weekly Salary')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formWeeklySalary}
                      onChangeText={setFormWeeklySalary}
                      placeholder={t('form.weeklySalaryPlaceholder', '1000.00')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Project Rate */}
              {formPaymentType === 'project_based' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.projectRate', 'Project Rate')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formProjectRate}
                      onChangeText={setFormProjectRate}
                      placeholder={t('form.projectRatePlaceholder', '5000.00')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}
            </View>
            )}
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
              <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>{t('actions.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('editWorker')}</Text>
            </View>
            <TouchableOpacity
              style={styles.modalHeaderButton}
              onPress={handleEditWorker}
              disabled={saving}
            >
              <Text style={[styles.modalSaveText, { color: Colors.primaryBlue, opacity: saving ? 0.5 : 1 }]}>
                {saving ? t('actions.saving', 'Saving...') : t('actions.save', 'Save')}
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
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>{t('form.personalInfo', 'Personal Information')}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.fullName')} *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="person" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder={t('form.fullNamePlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.phone')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="call" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formPhone}
                    onChangeText={setFormPhone}
                    placeholder={t('form.phonePlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.email')} *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="mail" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder={t('form.emailPlaceholder')}
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
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>{t('form.workDetails', 'Work Details')}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.role')}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="hammer" size={18} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.textInput, { color: Colors.primaryText }]}
                    value={formTrade}
                    onChangeText={setFormTrade}
                    placeholder={t('form.rolePlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>
            </View>

            {/* Payment Details Section - Hidden for supervisors */}
            {!isSupervisor && (
            <View style={[styles.formCard, { backgroundColor: Colors.white }]}>
              <View style={styles.formCardHeader}>
                <Ionicons name="wallet-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.formCardTitle, { color: Colors.primaryText }]}>{t('form.paymentDetails', 'Payment Details')}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.paymentType', 'Payment Type')}</Text>
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
                      {t('form.hourly', 'Hourly')}
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
                      {t('form.daily', 'Daily')}
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
                      {t('form.weekly', 'Weekly')}
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
                      {t('form.project', 'Project')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hourly Rate */}
              {formPaymentType === 'hourly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.hourlyRate')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formRate}
                      onChangeText={setFormRate}
                      placeholder={t('form.hourlyRatePlaceholder')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Daily Rate */}
              {formPaymentType === 'daily' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.dailyRate', 'Daily Rate')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formDailyRate}
                      onChangeText={setFormDailyRate}
                      placeholder={t('form.dailyRatePlaceholder', '200.00')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Weekly Salary */}
              {formPaymentType === 'weekly' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.weeklySalary', 'Weekly Salary')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formWeeklySalary}
                      onChangeText={setFormWeeklySalary}
                      placeholder={t('form.weeklySalaryPlaceholder', '1000.00')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* Project Rate */}
              {formPaymentType === 'project_based' && (
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: Colors.primaryText }]}>{t('form.projectRate', 'Project Rate')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                    <Ionicons name="cash" size={18} color={Colors.secondaryText} />
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.textInput, { color: Colors.primaryText }]}
                      value={formProjectRate}
                      onChangeText={setFormProjectRate}
                      placeholder={t('form.projectRatePlaceholder', '5000.00')}
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}
            </View>
            )}
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
              {/* Compact Header Card */}
              <View style={[styles.workerProfileCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.profileAvatar, { backgroundColor: getStatusColor(selectedWorker.status) }]}>
                  <Text style={styles.profileAvatarText}>{getInitials(selectedWorker.full_name)}</Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, { color: Colors.primaryText }]}>{selectedWorker.full_name}</Text>
                  {selectedWorker.trade && (
                    <Text style={[styles.profileTrade, { color: Colors.secondaryText }]}>{selectedWorker.trade}</Text>
                  )}
                </View>
                <View style={[styles.profileStatusBadge, { backgroundColor: getStatusColor(selectedWorker.status) + '20' }]}>
                  <View style={[styles.profileStatusDot, { backgroundColor: getStatusColor(selectedWorker.status) }]} />
                  <Text style={[styles.profileStatusText, { color: getStatusColor(selectedWorker.status) }]}>
                    {getStatusLabel(selectedWorker.status)}
                  </Text>
                </View>
              </View>

              {/* Details Container */}
              <View style={styles.detailsContainer}>
                {/* Contact Info Card */}
                {(isEditingDetail || selectedWorker.email || selectedWorker.phone) && (
                  <View style={[styles.infoCard, { backgroundColor: Colors.white }]}>
                    {(isEditingDetail || selectedWorker.email) && (
                      <TouchableOpacity
                        style={[styles.infoRow, { borderBottomColor: Colors.border }]}
                        disabled={isEditingDetail}
                        onPress={() => {
                          if (!isEditingDetail && selectedWorker.email) {
                            const options = [t('contact.sendEmail', 'Send Email'), t('contact.shareEmail', 'Share/Copy Email'), t('actions.cancel', 'Cancel')];
                            if (Platform.OS === 'ios') {
                              ActionSheetIOS.showActionSheetWithOptions(
                                { options, cancelButtonIndex: 2 },
                                (index) => {
                                  if (index === 0) Linking.openURL(`mailto:${selectedWorker.email}`);
                                  if (index === 1) Share.share({ message: selectedWorker.email });
                                }
                              );
                            } else {
                              Alert.alert(t('contact.email', 'Email'), selectedWorker.email, [
                                { text: t('contact.sendEmail', 'Send Email'), onPress: () => Linking.openURL(`mailto:${selectedWorker.email}`) },
                                { text: t('contact.shareCopy', 'Share/Copy'), onPress: () => Share.share({ message: selectedWorker.email }) },
                                { text: t('actions.cancel', 'Cancel'), style: 'cancel' },
                              ]);
                            }
                          }
                        }}
                      >
                        <View style={[styles.infoIconCircle, { backgroundColor: Colors.successGreen + '15' }]}>
                          <Ionicons name="mail" size={16} color={Colors.successGreen} />
                        </View>
                        <View style={styles.infoContent}>
                          <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Email</Text>
                          {isEditingDetail ? (
                            <TextInput
                              style={[styles.infoInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                              value={formEmail}
                              onChangeText={setFormEmail}
                              placeholder="worker@example.com"
                              placeholderTextColor={Colors.secondaryText}
                              keyboardType="email-address"
                              autoCapitalize="none"
                            />
                          ) : (
                            <Text style={[styles.infoValue, { color: Colors.primaryBlue }]} numberOfLines={1}>
                              {selectedWorker.email}
                            </Text>
                          )}
                        </View>
                        {!isEditingDetail && <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />}
                      </TouchableOpacity>
                    )}

                    {(isEditingDetail || selectedWorker.phone) && (
                      <TouchableOpacity
                        style={[styles.infoRow, !isEditingDetail && { borderBottomWidth: 0 }, isEditingDetail && { borderBottomColor: Colors.border }]}
                        disabled={isEditingDetail}
                        onPress={() => {
                          if (!isEditingDetail && selectedWorker.phone) {
                            const cleanPhone = selectedWorker.phone.replace(/\D/g, '');
                            const options = [t('contact.call', 'Call'), t('contact.whatsapp', 'WhatsApp'), t('contact.shareNumber', 'Share/Copy Number'), t('actions.cancel', 'Cancel')];
                            if (Platform.OS === 'ios') {
                              ActionSheetIOS.showActionSheetWithOptions(
                                { options, cancelButtonIndex: 3 },
                                (index) => {
                                  if (index === 0) Linking.openURL(`tel:${cleanPhone}`);
                                  if (index === 1) Linking.openURL(`whatsapp://send?phone=1${cleanPhone}`);
                                  if (index === 2) Share.share({ message: selectedWorker.phone });
                                }
                              );
                            } else {
                              Alert.alert(t('contact.phone', 'Phone'), selectedWorker.phone, [
                                { text: t('contact.call', 'Call'), onPress: () => Linking.openURL(`tel:${cleanPhone}`) },
                                { text: t('contact.whatsapp', 'WhatsApp'), onPress: () => Linking.openURL(`whatsapp://send?phone=1${cleanPhone}`) },
                                { text: t('contact.shareCopy', 'Share/Copy'), onPress: () => Share.share({ message: selectedWorker.phone }) },
                                { text: t('actions.cancel', 'Cancel'), style: 'cancel' },
                              ]);
                            }
                          }
                        }}
                      >
                        <View style={[styles.infoIconCircle, { backgroundColor: Colors.primaryBlue + '15' }]}>
                          <Ionicons name="call" size={16} color={Colors.primaryBlue} />
                        </View>
                        <View style={styles.infoContent}>
                          <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Phone</Text>
                          {isEditingDetail ? (
                            <TextInput
                              style={[styles.infoInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                              value={formPhone}
                              onChangeText={setFormPhone}
                              placeholder="(555) 123-4567"
                              placeholderTextColor={Colors.secondaryText}
                              keyboardType="phone-pad"
                            />
                          ) : (
                            <Text style={[styles.infoValue, { color: Colors.primaryBlue }]}>
                              {selectedWorker.phone}
                            </Text>
                          )}
                        </View>
                        {!isEditingDetail && <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />}
                      </TouchableOpacity>
                    )}

                    {isEditingDetail && (
                      <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                        <View style={[styles.infoIconCircle, { backgroundColor: Colors.warningOrange + '15' }]}>
                          <Ionicons name="hammer" size={16} color={Colors.warningOrange} />
                        </View>
                        <View style={styles.infoContent}>
                          <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Trade</Text>
                          <TextInput
                            style={[styles.infoInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                            value={formTrade}
                            onChangeText={setFormTrade}
                            placeholder="Carpenter, Electrician, etc."
                            placeholderTextColor={Colors.secondaryText}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Payment Card - Hidden for supervisors */}
                {!isSupervisor && (selectedWorker.hourly_rate > 0 || selectedWorker.daily_rate > 0 || selectedWorker.weekly_salary > 0 || selectedWorker.project_rate > 0) && (
                  <View style={[styles.paymentCard, { backgroundColor: Colors.white }]}>
                    <View style={styles.paymentHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name="cash" size={22} color={Colors.secondaryText} />
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
                      <View style={[styles.paymentTypeBadge, { backgroundColor: Colors.lightGray }]}>
                        <Text style={[styles.paymentTypeBadgeText, { color: Colors.secondaryText }]}>
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
                  <View style={[styles.activeStatusCard, { backgroundColor: Colors.successGreen }]}>
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

                {/* View Payment History Button - Hidden for supervisors */}
                {!isSupervisor && (
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
                )}

                {/* Clock-In History */}
                {selectedWorkerHistory && selectedWorkerHistory.length > 0 && (
                  <View style={[styles.clockHistoryCard, { backgroundColor: Colors.white }]}>
                    <View style={styles.clockHistoryHeader}>
                      <Ionicons name="time-outline" size={22} color={Colors.secondaryText} />
                      <Text style={[styles.clockHistoryTitle, { color: Colors.primaryText }]}>Recent Clock Records</Text>
                    </View>
                    {selectedWorkerHistory.slice(0, 7).map((entry, index) => (
                      <View key={entry.id || index} style={[styles.clockHistoryEntry, { borderBottomColor: Colors.border }]}>
                        <View style={styles.clockHistoryLeft}>
                          <Text style={[styles.clockHistoryDate, { color: Colors.primaryText }]}>
                            {formatClockDate(entry.clock_in)}
                          </Text>
                          <Text style={[styles.clockHistoryProject, { color: Colors.secondaryText }]}>
                            {entry.projects?.name || 'Unknown Project'}
                          </Text>
                        </View>
                        <View style={styles.clockHistoryRight}>
                          <Text style={[styles.clockHistoryTime, { color: Colors.secondaryText }]}>
                            {formatClockTime(entry.clock_in)} - {entry.clock_out ? formatClockTime(entry.clock_out) : 'Active'}
                          </Text>
                          <Text style={[styles.clockHistoryHours, { color: Colors.primaryBlue }]}>
                            {formatHoursMinutes(entry.hoursWorked)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Delete Button */}
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: Colors.white }]}
                  onPress={() => handleDeleteWorker(selectedWorker)}
                >
                  <Ionicons name="trash" size={20} color={Colors.errorRed} />
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

      {/* Add Task Modal */}
      <AddTaskModal
        visible={showAddTaskModal}
        onClose={() => {
          setShowAddTaskModal(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        initialDate={selectedDate.toISOString().split('T')[0]}
        editingTask={editingTask}
      />

      {/* Task Move Modal */}
      <TaskMoveModal
        visible={showMoveTaskModal}
        onClose={() => {
          setShowMoveTaskModal(false);
          setTaskToMove(null);
        }}
        task={taskToMove}
        onTaskMoved={handleTaskMoved}
      />

      {/* Full Screen Photo Viewer with Swipe Navigation */}
      <FullscreenPhotoViewer
        photos={viewerPhotos.map(url => ({ url }))}
        visible={photoViewerVisible}
        initialIndex={viewerPhotoIndex}
        onClose={closePhotoViewer}
      />

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

      {/* Assign Worker Modal */}
      <AssignWorkerModal
        visible={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onSuccess={() => {
          // Reload data after successful assignment
          loadData();
        }}
      />
    </ContentWrapper>
  );
}

const createStyles = (Colors) => StyleSheet.create({
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
    paddingTop: 4,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.small,
    minWidth: 80, // Balance with right side for centered title
  },
  exitFieldModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  exitFieldModeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 0,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    minHeight: 48,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.infoBlue,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.secondaryText,
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
    backgroundColor: Colors.lightGray,
  },
  filterChipText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
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
    shadowColor: Colors.shadow,
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
    shadowColor: Colors.shadow,
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
    shadowColor: Colors.shadow,
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
    backgroundColor: Colors.successGreen,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryText,
    textTransform: 'capitalize',
  },
  // New compact profile card styles
  workerProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  profileTrade: {
    fontSize: 14,
  },
  profileStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  profileStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  profileStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  // Info card with rows
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoInput: {
    fontSize: 15,
    fontWeight: '500',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  detailsContainer: {
    padding: 16,
  },
  infoGrid: {
    gap: 12,
    marginBottom: 16,
  },
  gridItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.background,
  },
  paymentCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.lightGray,
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
    borderColor: Colors.errorRed,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.errorRed,
  },
  // Clock history styles
  clockHistoryCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clockHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  clockHistoryTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  clockHistoryEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  clockHistoryLeft: {
    flex: 1,
  },
  clockHistoryDate: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  clockHistoryProject: {
    fontSize: 13,
  },
  clockHistoryRight: {
    alignItems: 'flex-end',
  },
  clockHistoryTime: {
    fontSize: 13,
    marginBottom: 2,
  },
  clockHistoryHours: {
    fontSize: 14,
    fontWeight: '700',
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
    shadowColor: Colors.shadow,
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
    shadowColor: Colors.shadow,
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
    backgroundColor: Colors.background,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  noOneWorkingText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.secondaryText,
  },
  // Schedule Tab Styles
  calendarContainer: {
    borderRadius: 12,
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 4,
    marginBottom: 8,
    backgroundColor: Colors.white,
  },
  calendarHeader: {
    marginBottom: 16,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  calendarViewToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  scheduleSection: {
    marginTop: 16,
    marginBottom: 20,
  },
  dayDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  dayDetailDate: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  dayDetailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  addEventButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Task styles
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  addTaskButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTasksContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  emptyTasksText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyTasksSubtext: {
    fontSize: 13,
    textAlign: 'center',
  },
  taskProjectGroup: {
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  taskProjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 25,
    borderRadius: 14,
  },
  taskProjectName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  taskCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  taskCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskCard: {
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  taskCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  taskStatusIcon: {
    paddingTop: 2,
  },
  taskDetails: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  taskDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  taskDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  taskDateText: {
    fontSize: 11,
    fontWeight: '500',
  },
  taskCompletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  taskCompletedText: {
    fontSize: 11,
    fontWeight: '500',
  },
  taskIncompleteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flex: 1,
  },
  taskIncompleteText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  taskActions: {
    flexDirection: 'row',
    gap: 4,
  },
  taskActionButton: {
    padding: 6,
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
    gap: 10,
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  scheduleCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: Colors.shadow,
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
    shadowColor: Colors.shadow,
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
    shadowColor: Colors.shadow,
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
    backgroundColor: Colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addWorkerButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addWorkerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addWorkerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  reportsHeader: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: Colors.shadow,
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
    backgroundColor: Colors.infoBlue,
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
    shadowColor: Colors.shadow,
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
    borderTopColor: Colors.border,
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
