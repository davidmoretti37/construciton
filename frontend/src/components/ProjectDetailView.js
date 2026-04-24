import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  ActionSheetIOS,
  Share,
  TextInput,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL as EXPO_PUBLIC_BACKEND_URL } from '../config/api';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { upsertProjectPhases, fetchProjectPhases, getProjectWorkers, fetchDailyReports, updatePhaseProgress, fetchEstimatesByProjectId, getEstimate, getProjectTransactionSummary, fetchProjectDocuments, uploadProjectDocument, deleteProjectDocument, updateProjectWorkingDays, addNonWorkingDate, removeNonWorkingDate, safeParseDateToObject, safeParseDateToString, redistributeAllTasksWithAI, getCurrentUserId, redistributeTasksFromDayWithAI, restoreTasksToOriginalDay, moveTasksFromSpecificDate, restoreTasksToSpecificDate, calculateProjectProgressFromTasks, completeTask, uncompleteTask, addTaskToPhase } from '../utils/storage';
import { SkeletonBox, SkeletonCard } from './SkeletonLoader';
import PhaseTimeline from './PhaseTimeline';
import WorkerAssignmentModal from './WorkerAssignmentModal';
import SupervisorAssignmentModal from './SupervisorAssignmentModal';
import WorkingDaysSelector from './WorkingDaysSelector';
import { useAuth } from '../contexts/AuthContext';
import BulkTaskShiftModal from './BulkTaskShiftModal';
import TaskDetailModal from './TaskDetailModal';
import NonWorkingDatesManager from './NonWorkingDatesManager';
import EstimatePreview from './ChatVisuals/EstimatePreview';
import DailyChecklistSection from './DailyChecklistSection';
import TodaysChecklistSection from './TodaysChecklistSection';
import { formatHoursMinutes } from '../utils/calculations';
import ClientPortalCard from './ClientPortalCard';
import AddTradePhaseModal from './AddTradePhaseModal';
import { supabase } from '../lib/supabase';
import { DEMO_PHASES } from '../screens/ProjectsScreen';

// In-memory cache of a project's fetched detail data, keyed by project.id.
// Re-entering a previously-viewed project hydrates from here so the view
// renders instantly, and the normal parallel fetch runs in the background
// to revalidate. Lives at module scope so it survives component unmounts.
const projectDetailCache = new Map();

export default function ProjectDetailView({ visible, project, onClose, onEdit, onAction, navigation, onDelete, asScreen = false, onRefreshNeeded, isDemo = false }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  // Seed useState defaults from the in-memory cache so return visits render
  // with the last-seen data instead of empty arrays while the background
  // fetch runs.
  const cachedDetail = (!isDemo && project?.id && projectDetailCache.get(project.id)) || null;
  const [modalVisible, setModalVisible] = useState(visible);
  const wasNavigatingRef = useRef(false);
  // Holds an imperative save function exposed by DailyChecklistSection when
  // it's controlled by the global edit pencil. Called inside
  // handleSaveAllChanges so checklist/labor-role edits flush together with
  // the rest of the project.
  const checklistSaveRef = useRef(null);
  // Skip the loading skeleton if we already have cached data for this project.
  const [initialLoading, setInitialLoading] = useState(
    !isDemo && !(project?.id && projectDetailCache.has(project.id))
  );
  const [phases, setPhases] = useState(cachedDetail?.phases || []);
  const [loadingPhases, setLoadingPhases] = useState(false);

  // Manual tasks (tasks added outside of phases)
  const [manualTasks, setManualTasks] = useState(cachedDetail?.manualTasks || []);
  const [loadingManualTasks, setLoadingManualTasks] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [selectedManualTask, setSelectedManualTask] = useState(null);

  // Calculated progress (from tasks, not from stale parent prop)
  const [calculatedProgress, setCalculatedProgress] = useState(cachedDetail?.calculatedProgress ?? null);

  // Main editing mode (controls all editing)
  const [isEditing, setIsEditing] = useState(false);
  // Hero / financial drafts — bind to TextInput while isEditing.
  const [editedName, setEditedName] = useState('');
  const [editedContractAmount, setEditedContractAmount] = useState('');

  // Contact info editing
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);

  // Timeline editing
  const [editStartDate, setEditStartDate] = useState(null);
  const [editEndDate, setEditEndDate] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Workers
  const [workers, setWorkers] = useState(cachedDetail?.workers || []);
  const [showWorkerAssignment, setShowWorkerAssignment] = useState(false);

  // Supervisor assignment (for owners)
  const [showSupervisorAssignment, setShowSupervisorAssignment] = useState(false);
  const [supervisorName, setSupervisorName] = useState(cachedDetail?.supervisorName ?? null);
  const { profile, ownerHidesContract, refreshProfile } = useAuth() || {};
  const isOwner = profile?.role === 'owner';
  const isSupervisor = profile?.role === 'supervisor';
  const [localHideContract, setLocalHideContract] = useState(profile?.hide_contract_from_supervisors || false);
  const isOwnProject = project?.createdBy === profile?.id || project?.user_id === profile?.id;
  const canAssignToSupervisor = isOwner && isOwnProject && !isDemo;

  // Expanded phases for showing tasks (multiple can be open)
  const [expandedPhaseIds, setExpandedPhaseIds] = useState(new Set());

  // Manual progress override
  // Note: Progress override removed - progress is now calculated from task completion in schedule

  // Delete confirmation modal (type-to-confirm)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Phase progress editing
  const [isEditingPhases, setIsEditingPhases] = useState(false);
  const [phaseProgressValues, setPhaseProgressValues] = useState({});

  // Daily Reports section
  const [projectReports, setProjectReports] = useState(cachedDetail?.projectReports || []);
  const [loadingReports, setLoadingReports] = useState(false);
  const [visibleReportsCount, setVisibleReportsCount] = useState(5);

  // Estimates section
  const [projectEstimates, setProjectEstimates] = useState(cachedDetail?.projectEstimates || []);
  const [loadingEstimates, setLoadingEstimates] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);

  // Calculated financial totals (from transactions)
  const [calculatedExpenses, setCalculatedExpenses] = useState(cachedDetail?.calculatedExpenses ?? null);
  const [calculatedIncome, setCalculatedIncome] = useState(cachedDetail?.calculatedIncome ?? null);

  // Documents section
  const [projectDocuments, setProjectDocuments] = useState(cachedDetail?.projectDocuments || []);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentVisibilityModalVisible, setDocumentVisibilityModalVisible] = useState(false);
  const [pendingDocumentUploads, setPendingDocumentUploads] = useState([]);
  const [newDocumentVisibleToWorkers, setNewDocumentVisibleToWorkers] = useState(false);

  // Time tracking
  const [totalProjectHours, setTotalProjectHours] = useState(cachedDetail?.totalProjectHours ?? 0);

  // Financials collapsible + trade budgets
  const [financialsExpanded, setFinancialsExpanded] = useState(true);
  const [tradeBudgets, setTradeBudgets] = useState(cachedDetail?.tradeBudgets || []);
  // Map of lowercased name → total spent. Keyed by both phase name and trade
  // name so the merged Budget Breakdown card can show "Spent X of Y" per phase
  // and per orphan trade. Computed from project_transactions.subcategory.
  const [spentBySubcategory, setSpentBySubcategory] = useState(cachedDetail?.spentBySubcategory || {});
  const [showAddTrade, setShowAddTrade] = useState(false);

  // Working days and task shifting
  const [showBulkShiftModal, setShowBulkShiftModal] = useState(false);
  const [editWorkingDays, setEditWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [nonWorkingDates, setNonWorkingDates] = useState([]);

  const screenWidth = Dimensions.get('window').width;

  // Load ALL project data in parallel — everything appears at once, no gradual loading
  // Skip all database fetches for demo projects
  useEffect(() => {
    const loadData = async () => {
      // Skip all database operations for demo projects - use mock data
      if (isDemo) {
        setPhases(DEMO_PHASES);
        setWorkers([
          { id: 'demo-worker-1', name: 'John Smith', trade: 'Plumber' },
          { id: 'demo-worker-2', name: 'Maria Garcia', trade: 'Electrician' },
        ]);
        setManualTasks([]);
        setCalculatedProgress(50);
        setProjectReports([]);
        setProjectEstimates([]);
        setCalculatedExpenses(8000);
        setCalculatedIncome(12500);
        setProjectDocuments([]);
        setInitialLoading(false);
        return;
      }

      if (project?.id) {
        // Only show the skeleton when we have nothing cached — otherwise
        // keep rendering the last-seen snapshot while we revalidate.
        if (!projectDetailCache.has(project.id)) {
          setInitialLoading(true);
        }

        // Split the open burst into TWO waves so the critical path (phases,
        // workers, progress, supervisor) gets dedicated Supabase connection
        // slots. Previously firing all 12 queries in parallel tripped
        // Postgres 57014 statement_timeout on large projects — the planner
        // tree + nested RLS couldn't finish under contention. The flattened
        // RLS from 20260424b cuts per-query cost, and the two-wave pattern
        // keeps us under the concurrency ceiling on real projects.
        const [
          phasesResult,
          workersResult,
          supervisorResult,
          progressResult,
        ] = await Promise.allSettled([
          // 0: phases
          project?.hasPhases ? fetchProjectPhases(project.id) : Promise.resolve([]),
          // 1: workers
          getProjectWorkers(project.id),
          // 2: supervisor
          (project?.assignedTo || project?.assigned_supervisor_id)
            ? supabase.from('profiles').select('business_name').eq('id', project?.assignedTo || project?.assigned_supervisor_id).single()
            : Promise.resolve({ data: null }),
          // 3: progress
          calculateProjectProgressFromTasks(project.id),
        ]);

        // Wave 2 — non-critical data that feeds tabs and secondary sections.
        // Fires after the critical wave resolves so the app has a chance to
        // render the header + phases immediately. Results use the same
        // Promise.allSettled shape so the downstream mapping code below is
        // unchanged. NOTE: `tasksResult` is query index 3 in the original
        // ordering; reorder here matches old indices (3,5,6,7,8,9,10,11).
        const [
          tasksResult,
          reportsResult,
          estimatesResult,
          transactionResult,
          tradeBudgetsResult,
          tradeExpensesResult,
          hoursResult,
          docsResult,
        ] = await Promise.allSettled([
          // 3: manual tasks
          supabase.from('worker_tasks').select('*').eq('project_id', project.id).is('phase_task_id', null).order('start_date', { ascending: true }),
          // 5: daily reports
          fetchDailyReports(project.id),
          // 6: estimates
          fetchEstimatesByProjectId(project.id),
          // 7: transaction summary
          getProjectTransactionSummary(project.id),
          // 8: trade budgets
          supabase.from('project_trade_budgets').select('*').eq('project_id', project.id).order('created_at', { ascending: true }),
          // 9: trade expenses (for paid amounts) — pull phase_id too so we can
          //    match by FK first, then fall back to lowercased subcategory.
          supabase.from('project_transactions').select('subcategory, amount, phase_id').eq('project_id', project.id).eq('type', 'expense'),
          // 10: hours
          supabase.from('time_tracking').select('clock_in, clock_out, break_start, break_end').eq('project_id', project.id).not('clock_out', 'is', null),
          // 11: documents
          fetchProjectDocuments(project.id),
        ]);

        // Batch ALL state updates at once — single render pass
        // Phases
        setPhases(phasesResult.status === 'fulfilled' ? (phasesResult.value || []) : []);

        // Workers
        setWorkers(workersResult.status === 'fulfilled' ? (workersResult.value || []) : []);

        // Supervisor
        setSupervisorName(supervisorResult.status === 'fulfilled' ? (supervisorResult.value?.data?.business_name || null) : null);

        // Manual tasks — sort completed to bottom
        const rawTasks = tasksResult.status === 'fulfilled' ? (tasksResult.value?.data || []) : [];
        const sortedTasks = rawTasks.sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1;
          if (a.status !== 'completed' && b.status === 'completed') return -1;
          return 0;
        });
        setManualTasks(sortedTasks);

        // Progress
        setCalculatedProgress(progressResult.status === 'fulfilled' ? (progressResult.value?.progress ?? null) : null);

        // Reports
        setProjectReports(reportsResult.status === 'fulfilled' ? (reportsResult.value || []) : []);

        // Estimates
        setProjectEstimates(estimatesResult.status === 'fulfilled' ? (estimatesResult.value || []) : []);

        // Financials
        if (transactionResult.status === 'fulfilled') {
          setCalculatedExpenses(transactionResult.value?.totalExpenses || 0);
          setCalculatedIncome(transactionResult.value?.totalIncome || 0);
        } else {
          setCalculatedExpenses(null);
          setCalculatedIncome(null);
        }

        // Trade budgets with paid amounts
        const budgets = tradeBudgetsResult.status === 'fulfilled' ? (tradeBudgetsResult.value?.data || []) : [];
        const txns = tradeExpensesResult.status === 'fulfilled' ? (tradeExpensesResult.value?.data || []) : [];
        // Aggregate spend two ways:
        //   (a) by phase_id  — primary, survives phase renames
        //   (b) by lower(subcategory) string — back-compat for legacy rows
        // Then resolve a unified `paidByPhaseName` map: for each phase the
        // user has, sum txs whose phase_id matches OR whose subcategory
        // string matches the phase name (case-insensitive). PhaseTimeline
        // consumes this name-keyed map for the "Spent" overlay.
        const paidByPhaseId = {};
        const paidByKey = {};
        txns.forEach(tx => {
          const amt = parseFloat(tx.amount) || 0;
          if (tx.phase_id) {
            paidByPhaseId[tx.phase_id] = (paidByPhaseId[tx.phase_id] || 0) + amt;
          }
          const key = (tx.subcategory || '').toLowerCase().trim();
          if (key) {
            paidByKey[key] = (paidByKey[key] || 0) + amt;
          }
        });
        // Fold phase_id-attributed spend into the name-keyed map by looking
        // up phase names from the phases we just fetched. Avoids double-
        // counting (skip rows already counted by subcategory string match).
        const phaseRows = phasesResult.status === 'fulfilled' ? (phasesResult.value || []) : [];
        const txsCountedById = new Set();
        txns.forEach(tx => {
          if (!tx.phase_id) return;
          const matchPhase = phaseRows.find(p => p.id === tx.phase_id);
          if (!matchPhase) return;
          const nameKey = String(matchPhase.name || '').toLowerCase().trim();
          // If subcategory already matched the same phase name, don't add again.
          if ((tx.subcategory || '').toLowerCase().trim() === nameKey) return;
          paidByKey[nameKey] = (paidByKey[nameKey] || 0) + (parseFloat(tx.amount) || 0);
        });
        setSpentBySubcategory(paidByKey);
        if (budgets.length > 0) {
          setTradeBudgets(budgets.map(b => ({
            ...b,
            paid: paidByKey[b.trade_name.toLowerCase()] || 0,
            remaining: (parseFloat(b.budget_amount) || 0) - (paidByKey[b.trade_name.toLowerCase()] || 0),
          })));
        } else {
          setTradeBudgets([]);
        }

        // Hours
        let totalHours = 0;
        if (hoursResult.status === 'fulfilled') {
          (hoursResult.value?.data || []).forEach(e => {
            let h = (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
            if (e.break_start && e.break_end) h -= (new Date(e.break_end) - new Date(e.break_start)) / 3600000;
            totalHours += h;
          });
          totalHours = parseFloat(totalHours.toFixed(1));
          setTotalProjectHours(totalHours);
        }

        // Documents
        setProjectDocuments(docsResult.status === 'fulfilled' ? (docsResult.value || []) : []);

        // Clear all individual loading states
        setLoadingPhases(false);
        setLoadingManualTasks(false);
        setLoadingReports(false);
        setLoadingEstimates(false);
        setLoadingDocuments(false);

        // Everything loaded — reveal the entire view at once
        setInitialLoading(false);

        // Cache the freshly-fetched snapshot so the next visit renders
        // instantly from memory and revalidates in the background.
        const freshPhases = phasesResult.status === 'fulfilled' ? (phasesResult.value || []) : [];
        const freshWorkers = workersResult.status === 'fulfilled' ? (workersResult.value || []) : [];
        const freshSupervisorName = supervisorResult.status === 'fulfilled' ? (supervisorResult.value?.data?.business_name || null) : null;
        const freshReports = reportsResult.status === 'fulfilled' ? (reportsResult.value || []) : [];
        const freshEstimates = estimatesResult.status === 'fulfilled' ? (estimatesResult.value || []) : [];
        const freshDocs = docsResult.status === 'fulfilled' ? (docsResult.value || []) : [];
        const freshExpenses = transactionResult.status === 'fulfilled' ? (transactionResult.value?.totalExpenses || 0) : null;
        const freshIncome = transactionResult.status === 'fulfilled' ? (transactionResult.value?.totalIncome || 0) : null;
        const freshProgress = progressResult.status === 'fulfilled' ? (progressResult.value?.progress ?? null) : null;
        const freshTradeBudgets = budgets.length > 0 ? budgets.map(b => ({
          ...b,
          paid: paidByKey[b.trade_name.toLowerCase()] || 0,
          remaining: (parseFloat(b.budget_amount) || 0) - (paidByKey[b.trade_name.toLowerCase()] || 0),
        })) : [];
        projectDetailCache.set(project.id, {
          phases: freshPhases,
          workers: freshWorkers,
          supervisorName: freshSupervisorName,
          manualTasks: sortedTasks,
          calculatedProgress: freshProgress,
          projectReports: freshReports,
          projectEstimates: freshEstimates,
          calculatedExpenses: freshExpenses,
          calculatedIncome: freshIncome,
          spentBySubcategory: paidByKey,
          tradeBudgets: freshTradeBudgets,
          totalProjectHours: totalHours,
          projectDocuments: freshDocs,
        });
      }
    };

    if (visible) {
      loadData();
      // Populate contact edit fields
      setEditAddress(project?.location || '');
      setEditPhone(project?.client_phone || project?.clientPhone || '');
      setEditEmail(project?.client_email || project?.clientEmail || '');
      // Populate timeline edit fields - use safe parsing to handle various date formats
      setEditStartDate(safeParseDateToObject(project?.startDate));
      setEditEndDate(safeParseDateToObject(project?.endDate));
      // Populate working days and non-working dates
      setEditWorkingDays(project?.workingDays || [1, 2, 3, 4, 5]);
      setNonWorkingDates(project?.nonWorkingDates || []);
      // Reset reports visible count
      setVisibleReportsCount(5);
      // Reset editing state
      setIsEditing(false);
    }
  }, [project?.id, project?.hasPhases, project?.contract_amount, project?.updated_at, project?.assigned_supervisor_id, visible, isDemo]);

  // Sync modal visibility with prop and refresh data when becoming visible
  useEffect(() => {
    if (visible && !wasNavigatingRef.current) {
      setModalVisible(true);
      // Refresh phases when view becomes visible (e.g., after agent adds tasks)
      if (project?.id && project?.hasPhases && !isDemo) {
        fetchProjectPhases(project.id).then(updated => {
          if (updated) setPhases(updated);
        }).catch(() => {});
      }
    } else if (!visible) {
      setModalVisible(false);
      wasNavigatingRef.current = false;
    }
  }, [visible]);

  // Listen for navigation state to hide/show modal appropriately
  useEffect(() => {
    if (!navigation) return;

    const checkRoute = () => {
      try {
        const state = navigation.getState();
        if (!state) return;
        
        // Find the current route by checking the navigation state tree
        const findCurrentRoute = (navState) => {
          if (navState.index !== undefined && navState.routes) {
            const route = navState.routes[navState.index];
            if (route.state) {
              return findCurrentRoute(route.state);
            }
            return route.name;
          }
          return null;
        };
        
        const currentRoute = findCurrentRoute(state);
        
        // Hide modal if we're on ProjectTransactions screen
        if (currentRoute === 'ProjectTransactions') {
          setModalVisible(false);
          wasNavigatingRef.current = true;
        } else if (wasNavigatingRef.current && visible && currentRoute !== 'ProjectTransactions') {
          // We've navigated back, restore the modal after a delay
          setTimeout(() => {
            setModalVisible(true);
            wasNavigatingRef.current = false;
            // Refresh project data to get updated expense/income totals
            if (onRefreshNeeded) {
              onRefreshNeeded();
            }
          }, 300);
        }
      } catch (error) {
        // Ignore navigation state errors
      }
    };

    // Check immediately
    checkRoute();

    // Also listen for state changes
    const unsubscribe = navigation.addListener('state', checkRoute);
    
    return unsubscribe;
  }, [navigation, visible]);

  // When entering edit mode, initialize phase progress values
  useEffect(() => {
    if (isEditing && phases.length > 0) {
      const values = {};
      phases.forEach(p => values[p.id] = p.completion_percentage || 0);
      setPhaseProgressValues(values);
      setIsEditingPhases(true);
    } else if (!isEditing) {
      setIsEditingPhases(false);
    }
  }, [isEditing, phases]);

  const handleWorkersUpdated = async () => {
    // Reload workers after assignment changes
    try {
      const projectWorkers = await getProjectWorkers(project.id);
      setWorkers(projectWorkers || []);
    } catch (error) {
      console.error('Error reloading workers:', error);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleTaskMove = async (task, sourcePhase, targetPhase) => {
    // Optimistic update — remove from source, add to target
    setPhases(prev => prev.map(p => {
      if (p.id === sourcePhase.id) {
        return { ...p, tasks: (p.tasks || []).filter(t => t.id !== task.id).map((t, i) => ({ ...t, order: i })) };
      }
      if (p.id === targetPhase.id) {
        const tasks = [...(p.tasks || []), { ...task, order: (p.tasks || []).length }];
        return { ...p, tasks };
      }
      return p;
    }));

    // Persist via backend (atomic transaction with rollback)
    try {
      const token = (await supabase.auth.getSession())?.data?.session?.access_token;
      const baseUrl = EXPO_PUBLIC_BACKEND_URL;

      const resp = await fetch(`${baseUrl}/api/project-sections/move-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          task_id: task.id,
          source_phase_id: sourcePhase.id,
          target_phase_id: targetPhase.id,
          new_order: (targetPhase.tasks || []).length,
        }),
      });

      if (!resp.ok) {
        throw new Error('Move failed');
      }
    } catch (err) {
      console.error('Task move error:', err);
      // Revert on failure
      const updated = await fetchProjectPhases(project.id);
      if (updated) setPhases(updated);
    }
  };

  // Add a brand-new task to a phase (only while global edit mode is on).
  // The task gets a local `draft-<ts>` id; the real UUID is reconciled on
  // the next fetchProjectPhases after handleSaveAllChanges flushes.
  const handleAddTaskToPhase = (phase) => {
    if (!phase?.id) return;
    const draftId = `draft-${Date.now()}`;
    setPhases(prev => prev.map(p => {
      if (p.id !== phase.id) return p;
      const nextTasks = Array.isArray(p.tasks) ? [...p.tasks] : [];
      nextTasks.push({
        id: draftId,
        description: 'New task',
        order: nextTasks.length + 1,
        completed: false,
        status: 'not_started',
      });
      return { ...p, tasks: nextTasks };
    }));
    // Make sure the phase is expanded so the user sees their new task
    setExpandedPhaseIds(prev => {
      const next = new Set(prev);
      next.add(phase.id);
      return next;
    });
  };

  const handleTaskReorder = async (phaseId, reorderedTasks) => {
    // Optimistic update
    setPhases(prev => prev.map(p => {
      if (p.id !== phaseId) return p;
      return { ...p, tasks: reorderedTasks.map((t, i) => ({ ...t, order: i })) };
    }));

    // Persist to DB
    try {
      const tasksWithOrder = reorderedTasks.map((t, i) => ({ ...t, order: i }));
      const { error } = await supabase
        .from('project_phases')
        .update({ tasks: tasksWithOrder })
        .eq('id', phaseId);

      if (error) {
        console.error('Reorder failed:', error);
        const updated = await fetchProjectPhases(project.id);
        if (updated) setPhases(updated);
      }
    } catch (err) {
      console.error('Reorder error:', err);
    }
  };

  const handlePhasePress = (phase) => {
    setExpandedPhaseIds(prev => {
      const next = new Set(prev);
      if (next.has(phase.id)) {
        next.delete(phase.id);
      } else {
        next.add(phase.id);
      }
      return next;
    });
  };

  // Navigate to per-phase transactions list (filtered by subcategory == phase name).
  const handleViewPhaseTransactions = (phase) => {
    if (!navigation || !phase) return;
    wasNavigatingRef.current = true;
    setModalVisible(false);
    navigation.navigate('ProjectTransactions', {
      projectId: project.id,
      projectName: project.name,
      fromProjectDetail: true,
      transactionType: 'expense',
      subcategoryFilter: phase.name,
    });
  };

  // Quick-add a task to a phase without entering edit mode. Uses the native
  // Alert.prompt on iOS; on Android (no prompt primitive) we create with a
  // default description which the user can then rename via TaskDetailModal.
  const handleQuickAddTask = (phase) => {
    if (!phase?.id) return;
    const persistTask = async (description) => {
      const taskDescription = (description || '').trim();
      if (!taskDescription) return;
      const updated = await addTaskToPhase(phase.id, taskDescription);
      if (!updated) {
        Alert.alert('Error', 'Could not add task. Please try again.');
        return;
      }
      const fresh = await fetchProjectPhases(project.id);
      if (fresh) setPhases(fresh);
      setExpandedPhaseIds(prev => {
        const next = new Set(prev);
        next.add(phase.id);
        return next;
      });
    };

    if (Platform.OS === 'ios') {
      Alert.prompt(
        'New Task',
        `Add a task to ${phase.name}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add', onPress: persistTask },
        ],
        'plain-text',
        ''
      );
    } else {
      persistTask('New task');
    }
  };

  const handleTaskToggle = (task, phase) => {
    // Missing workerTaskId means fetchProjectPhases couldn't link this
    // phase task to a worker_tasks row across any of the 3 legacy
    // phase_task_id formats. Don't silently no-op — the user just sees
    // their tap do nothing. Trigger a reflow which deletes + recreates
    // worker_tasks with phase_task_id = task.id (the canonical UUID),
    // then re-fetch so the next tap has a valid handle.
    if (!task.workerTaskId) {
      Alert.alert(
        'Syncing task',
        'Tap again in a moment — re-syncing this task with your schedule.'
      );
      (async () => {
        try {
          const { redistributeProjectTasks } = await import('../utils/scheduling/redistributeProjectTasks');
          await redistributeProjectTasks(project.id, { immediate: true });
          const updated = await fetchProjectPhases(project.id);
          if (updated) setPhases(updated);
          const { progress } = await calculateProjectProgressFromTasks(project.id);
          setCalculatedProgress(progress);
        } catch (e) {
          console.error('Task sync failed:', e?.message);
        }
      })();
      return;
    }

    const newCompleted = !task.completed;

    // Optimistic UI update — instant feedback. Set both `completed` AND
    // `status` so getTaskStatus() (constants/theme.js:146) — which checks
    // status first — returns 'done' and the PhaseTimeline row flips its
    // checkmark + strikethrough right away, not just the progress bar.
    setPhases(prev => prev.map(p => {
      if (p.id !== phase.id) return p;
      const updatedTasks = p.tasks.map(t =>
        t.workerTaskId === task.workerTaskId
          ? { ...t, completed: newCompleted, status: newCompleted ? 'done' : 'not_started' }
          : t
      );
      const completedCount = updatedTasks.filter(t => t.completed).length;
      return {
        ...p,
        tasks: updatedTasks,
        completion_percentage: updatedTasks.length > 0
          ? Math.round((completedCount / updatedTasks.length) * 100) : 0,
      };
    }));

    // Optimistic overall progress update
    setCalculatedProgress(prev => {
      let totalTasks = 0;
      let totalCompleted = 0;
      phases.forEach(p => {
        if (p.tasks) {
          p.tasks.forEach(t => {
            totalTasks++;
            const isThis = t.workerTaskId === task.workerTaskId;
            totalCompleted += (isThis ? newCompleted : t.completed) ? 1 : 0;
          });
        }
      });
      return totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
    });

    // Sync with DB. On success, re-fetch phases so the JSONB
    // task.completed reflects whatever the DB has — keeps client and
    // DB in lock-step instead of relying on optimistic state to
    // survive a navigation away/back.
    (async () => {
      try {
        if (newCompleted) {
          await completeTask(task.workerTaskId, null);
        } else {
          await uncompleteTask(task.workerTaskId);
        }
        // Authoritative sync — DB is now the source of truth.
        const updated = await fetchProjectPhases(project.id);
        if (updated) setPhases(updated);
        const { progress } = await calculateProjectProgressFromTasks(project.id);
        if (progress != null) setCalculatedProgress(progress);
      } catch (error) {
        console.error('Error toggling task:', error);
        // Revert on failure
        const updated = await fetchProjectPhases(project.id);
        if (updated) setPhases(updated);
        const { progress } = await calculateProjectProgressFromTasks(project.id);
        setCalculatedProgress(progress);
      }
    })();
  };

  const handleManualTaskToggle = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';

    // Optimistic UI update — sort completed to bottom
    setManualTasks(prev => {
      const updated = prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
      return updated.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return 0;
      });
    });
    setShowTaskDetailModal(false);
    setSelectedManualTask(null);

    try {
      let success;
      if (newStatus === 'completed') {
        success = await completeTask(task.id);
      } else {
        success = await uncompleteTask(task.id);
      }
      if (!success) {
        // Revert on failure, re-sort
        setManualTasks(prev => {
          const reverted = prev.map(t => t.id === task.id ? { ...t, status: task.status } : t);
          return reverted.sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1;
            if (a.status !== 'completed' && b.status === 'completed') return -1;
            return 0;
          });
        });
      } else {
        // Recalculate progress from all individual tasks
        const { progress } = await calculateProjectProgressFromTasks(project.id);
        setCalculatedProgress(progress);
      }
    } catch (error) {
      console.error('Error toggling manual task:', error);
      setManualTasks(prev => {
        const reverted = prev.map(t => t.id === task.id ? { ...t, status: task.status } : t);
        return reverted.sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1;
          if (a.status !== 'completed' && b.status === 'completed') return -1;
          return 0;
        });
      });
    }
  };

  const handleAddressPress = (address) => {
    const encodedAddress = encodeURIComponent(address);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('buttons.cancel'), t('labels.appleMaps'), t('labels.googleMaps'), 'Share Address'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            Linking.openURL(`http://maps.apple.com/?address=${encodedAddress}`);
          } else if (buttonIndex === 2) {
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
          } else if (buttonIndex === 3) {
            Share.share({ message: address });
          }
        }
      );
    } else {
      Alert.alert(
        t('alerts.openInMaps'),
        t('messages.chooseMapsApp'),
        [
          { text: t('buttons.cancel'), style: 'cancel' },
          {
            text: t('labels.googleMaps'),
            onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`)
          },
          {
            text: 'Share',
            onPress: () => Share.share({ message: address }),
          },
        ]
      );
    }
  };

  const handlePhonePress = (phone) => {
    const phoneUrl = `tel:${phone.replace(/[^0-9+]/g, '')}`;
    Linking.openURL(phoneUrl).catch(() => {
      Alert.alert(t('alerts.error'), t('messages.unableToMakePhoneCall'));
    });
  };

  const handleEmailPress = (email) => {
    const emailUrl = `mailto:${email}`;
    Linking.openURL(emailUrl).catch(() => {
      Alert.alert(t('alerts.error'), t('messages.unableToOpenEmail'));
    });
  };

  const handleSaveAllChanges = async () => {
    try {
      setSavingChanges(true);

      // Save name + contract + contact info + timeline to project
      const trimmedName = (editedName || '').trim();
      const parsedContract = parseFloat(editedContractAmount);
      const updatePayload = {
        location: editAddress || null,
        client_phone: editPhone || null,
        client_email: editEmail || null,
        start_date: editStartDate ? editStartDate.toISOString().split('T')[0] : null,
        end_date: editEndDate ? editEndDate.toISOString().split('T')[0] : null,
      };
      if (trimmedName && trimmedName !== project?.name) {
        updatePayload.name = trimmedName;
      }
      if (!isNaN(parsedContract) && parsedContract >= 0) {
        updatePayload.contract_amount = parsedContract;
        updatePayload.base_contract = parsedContract;
        updatePayload.budget = parsedContract;
      }
      const { error } = await supabase
        .from('projects')
        .update(updatePayload)
        .eq('id', project.id);

      if (error) throw error;

      // Check if timeline changed BEFORE updating local object
      const oldStartDate = safeParseDateToString(project?.startDate);
      const oldEndDate = safeParseDateToString(project?.endDate);
      const newStartDate = safeParseDateToString(editStartDate);
      const newEndDate = safeParseDateToString(editEndDate);
      const timelineChanged = oldStartDate !== newStartDate || oldEndDate !== newEndDate;

      // Update local project object - use YYYY-MM-DD format to match database
      if (project) {
        project.location = editAddress;
        project.client_phone = editPhone;
        project.client_email = editEmail;
        project.startDate = safeParseDateToString(editStartDate);
        project.endDate = safeParseDateToString(editEndDate);
        if (updatePayload.name) project.name = updatePayload.name;
        if (updatePayload.contract_amount != null) {
          project.contractAmount = updatePayload.contract_amount;
          project.contract_amount = updatePayload.contract_amount;
          project.budget = updatePayload.contract_amount;
        }
      }

      // Save phase progress values
      for (const [phaseId, progress] of Object.entries(phaseProgressValues)) {
        await updatePhaseProgress(phaseId, progress);
      }

      // Save checklist/labor-role edits (if the DailyChecklistSection was
      // in edit mode). It exposes its save fn via onEditModeChange.
      if (checklistSaveRef.current) {
        try {
          await checklistSaveRef.current();
        } catch (checklistErr) {
          console.warn('[ProjectDetail] checklist save failed', checklistErr?.message);
        }
      }

      // Persist phases (including any newly added tasks) via the non-destructive
      // upsert so a mid-save network blip can't wipe pre-existing phase rows.
      if (project?.hasPhases && phases.length > 0) {
        try {
          const phasePayload = phases.map((p, i) => ({
            id: p.id,
            name: p.name,
            plannedDays: p.planned_days || p.plannedDays || 0,
            budget: parseFloat(p.budget) || 0,
            order: i,
            order_index: typeof p.order_index === 'number' ? p.order_index : i,
            assignedWorkerId: p.assignedWorkerId || p.assigned_worker_id || null,
            tasks: (p.tasks || [])
              .filter(t => (t.description || '').trim())
              .map((t, j) => ({
                id: t.id,
                description: t.description.trim(),
                order: j + 1,
                completed: !!t.completed,
                status: t.status || 'not_started',
              })),
          }));
          await upsertProjectPhases(project.id, phasePayload, {
            startDate: safeParseDateToString(editStartDate),
            endDate: safeParseDateToString(editEndDate),
            workingDays: editWorkingDays,
          });
        } catch (phaseErr) {
          console.warn('[ProjectDetail] upsertProjectPhases failed', phaseErr?.message);
        }
      }

      // Redistribute worker_tasks so each phase's working days are filled.
      // Fire-and-forget — the orchestrator is debounced per-project and will
      // coalesce if multiple mutations fired in the same save.
      try {
        const { redistributeProjectTasks } = await import('../utils/scheduling/redistributeProjectTasks');
        redistributeProjectTasks(project.id);
      } catch (_) { /* best-effort */ }

      // Refresh phases to get updated values
      if (project?.hasPhases) {
        const updatedPhases = await fetchProjectPhases(project.id);
        setPhases(updatedPhases || []);
      }

      setIsEditing(false);
      // Clear the checklist save-fn reference so stale closures don't linger
      // into the next edit session.
      checklistSaveRef.current = null;

      // If timeline changed, offer to recalculate task dates
      if (timelineChanged && project?.id && project?.hasPhases) {
        Alert.alert(
          t('alerts.timelineChanged'),
          t('messages.adjustTaskDates'),
          [
            { text: t('buttons.keepCurrentDates'), style: 'cancel', onPress: () => Alert.alert(t('alerts.success'), t('messages.changesSaved')) },
            {
              text: t('buttons.adjustTasks'),
              onPress: async () => {
                try {
                  const userId = await getCurrentUserId();
                  if (userId) {
                    const timeline = {
                      startDate: newStartDate,
                      endDate: newEndDate,
                      workingDays: editWorkingDays,
                    };
                    await redistributeAllTasksWithAI(project.id, userId, phases, timeline);
                    Alert.alert(t('alerts.success'), t('messages.tasksRedistributed'));
                    if (onRefreshNeeded) {
                      onRefreshNeeded();
                    }
                  }
                } catch (error) {
                  console.error('Error redistributing tasks:', error);
                  Alert.alert(t('alerts.error'), t('messages.failedToAdjustTasks'));
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(t('alerts.success'), t('messages.allChangesSaved'));
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSaveChanges'));
    } finally {
      setSavingChanges(false);
    }
  };

  const handleToggleContractVisibility = async () => {
    const newValue = !localHideContract;
    setLocalHideContract(newValue);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ hide_contract_from_supervisors: newValue })
        .eq('id', profile.id);
      if (error) {
        console.error('Error toggling contract visibility:', error);
        setLocalHideContract(!newValue);
        Alert.alert('Error', 'Could not update visibility setting.');
        return;
      }
      Alert.alert(
        newValue ? 'Hidden from supervisors' : 'Visible to supervisors',
        newValue
          ? 'Supervisors will not see the contract amount.'
          : 'Supervisors can now see the contract amount.'
      );
    } catch (err) {
      setLocalHideContract(!newValue);
      console.error('Error toggling contract visibility:', err);
    }
  };

  const handleDeleteProject = () => {
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const confirmDeleteProject = () => {
    setShowDeleteModal(false);
    setDeleteConfirmText('');
    if (onDelete) {
      onDelete(project.id);
    }
  };

  // Note: Progress override functions removed - progress is now calculated from task completion

  if (!project) return null;

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'active':
      case 'on-track':
        return '#3B82F6';
      case 'behind':
        return '#F59E0B';
      case 'over-budget':
        return '#EF4444';
      case 'archived':
        return '#6B7280';
      default:
        return Colors.primaryBlue;
    }
  };

  // Document upload handlers
  const handleUploadDocument = () => {
    Alert.alert(
      t('alerts.addDocument'),
      t('messages.chooseSource'),
      [
        { text: t('buttons.takePhoto'), onPress: handleDocumentTakePhoto },
        { text: t('buttons.chooseFromPhotos'), onPress: handleDocumentPickImage },
        { text: t('buttons.chooseFilePdf'), onPress: handleDocumentPickFile },
        { text: t('buttons.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleDocumentTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions.permissionRequired'), t('permissions.cameraRequired'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPendingDocumentUploads([{
          uri: result.assets[0].uri,
          type: 'image',
          fileName: `Photo_${Date.now()}.jpg`,
        }]);
        setNewDocumentVisibleToWorkers(false);
        setDocumentVisibilityModalVisible(true);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToTakePhoto'));
    }
  };

  const handleDocumentPickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions.permissionRequired'), t('permissions.photoLibraryRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const files = result.assets.map(asset => ({
          uri: asset.uri,
          type: 'image',
          fileName: asset.fileName || `Image_${Date.now()}.jpg`,
        }));
        setPendingDocumentUploads(files);
        setNewDocumentVisibleToWorkers(false);
        setDocumentVisibilityModalVisible(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToPickImage'));
    }
  };

  const handleDocumentPickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const files = result.assets.map(asset => ({
          uri: asset.uri,
          type: asset.mimeType?.includes('pdf') ? 'pdf' : 'image',
          fileName: asset.name,
        }));
        setPendingDocumentUploads(files);
        setNewDocumentVisibleToWorkers(false);
        setDocumentVisibilityModalVisible(true);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToPickDocument'));
    }
  };

  const confirmDocumentUpload = async () => {
    if (pendingDocumentUploads.length === 0) return;

    setDocumentVisibilityModalVisible(false);

    try {
      setUploadingDocument(true);
      let successCount = 0;
      let failCount = 0;

      for (const file of pendingDocumentUploads) {
        const result = await uploadProjectDocument(
          project.id, file.uri, file.fileName, file.type,
          'general', null, newDocumentVisibleToWorkers
        );
        if (result) {
          successCount++;
        } else {
          failCount++;
        }
      }

      // Refresh documents list once after all uploads
      const docs = await fetchProjectDocuments(project.id);
      setProjectDocuments(docs || []);

      if (failCount === 0) {
        Alert.alert(
          t('alerts.success'),
          successCount === 1
            ? t('messages.documentUploaded')
            : `${successCount} documents uploaded successfully.`
        );
      } else {
        Alert.alert(
          t('alerts.error'),
          `${successCount} uploaded, ${failCount} failed.`
        );
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToUploadDocument'));
    } finally {
      setUploadingDocument(false);
      setPendingDocumentUploads([]);
    }
  };

  const cancelDocumentUpload = () => {
    setDocumentVisibilityModalVisible(false);
    setPendingDocumentUploads([]);
    setNewDocumentVisibleToWorkers(false);
  };

  const handleToggleDocumentVisibility = async (doc) => {
    const { updateDocumentVisibility } = require('../utils/storage/projectDocuments');
    const newVisibility = !doc.visible_to_workers;
    const success = await updateDocumentVisibility(doc.id, newVisibility);
    if (success) {
      setProjectDocuments(prev =>
        prev.map(d => d.id === doc.id ? { ...d, visible_to_workers: newVisibility } : d)
      );
    } else {
      Alert.alert(t('alerts.error'), t('messages.failedToUpdateVisibility'));
    }
  };

  const handleDeleteDocument = (doc) => {
    Alert.alert(
      t('alerts.deleteDocument'),
      t('messages.confirmDeleteDocument', { name: doc.file_name }),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            const success = await deleteProjectDocument(doc.id);
            if (success) {
              setProjectDocuments(prev => prev.filter(d => d.id !== doc.id));
            } else {
              Alert.alert(t('alerts.error'), t('messages.failedToDeleteDocument'));
            }
          },
        },
      ]
    );
  };

  const handleViewDocument = async (doc) => {
    if (!navigation) return;

    const { getDocumentUrl } = require('../utils/storage/projectDocuments');
    const originalUrl = doc.file_url;
    let fileUrl = originalUrl;

    if (!fileUrl) {
      console.warn('[handleViewDocument] doc has no file_url', doc?.id);
      Alert.alert(t('alerts.error'), 'This document has no file path stored. It may have failed to upload.');
      return;
    }

    if (!fileUrl.startsWith('http')) {
      // New format: stored as a bare storage path → sign it.
      fileUrl = await getDocumentUrl(originalUrl);
    } else {
      // Legacy: stored as a full public URL. Extract the path after either
      // bucket segment and sign that instead — public URLs don't work when
      // the bucket is private.
      const match = fileUrl.match(/\/(project-documents|project-docs)\/(.+)$/);
      if (match) {
        const signed = await getDocumentUrl(match[2]);
        if (signed) fileUrl = signed;
      }
    }

    if (!fileUrl) {
      console.warn('[handleViewDocument] could not resolve signed URL for', originalUrl);
      Alert.alert(
        t('alerts.error'),
        `Could not load document.\n\nPath: ${originalUrl}\n\nCheck the storage bucket and RLS policies — the file may be in a bucket the signer can't read.`
      );
      return;
    }

    navigation.navigate('DocumentViewer', {
      fileUrl,
      fileName: doc.file_name,
      fileType: doc.file_type,
      projectName: project.name,
    });
  };

  const handleStatusChange = (newStatus) => {
    const labels = { completed: 'Complete', paused: 'Pause', active: 'Reopen', archived: 'Archive' };
    Alert.alert(
      `${labels[newStatus]} Project?`,
      newStatus === 'completed'
        ? 'This will mark the project as completed and notify assigned workers.'
        : newStatus === 'archived'
          ? 'Archived projects are hidden from the main list.'
          : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: labels[newStatus],
          onPress: async () => {
            try {
              await saveProject({ ...project, status: newStatus });
              onRefreshNeeded && onRefreshNeeded();

              // Notify assigned workers about status change (non-blocking)
              if (newStatus === 'completed' || newStatus === 'paused') {
                const statusLabel = newStatus === 'completed' ? 'completed' : 'paused';
                supabase
                  .from('project_assignments')
                  .select('worker_id, workers(profile_id)')
                  .eq('project_id', project.id)
                  .then(({ data: pw }) => {
                    if (!pw || pw.length === 0) return;
                    const notifications = pw
                      .filter(w => w.workers?.profile_id)
                      .map(w => ({
                        user_id: w.workers.profile_id,
                        title: `Project ${statusLabel}`,
                        body: `"${project.name}" has been marked as ${statusLabel}.`,
                        type: 'project_status',
                        icon: newStatus === 'completed' ? 'checkmark-circle' : 'pause-circle',
                        color: newStatus === 'completed' ? '#10B981' : '#F59E0B',
                        action_type: 'navigate',
                        action_data: { screen: 'ProjectDetail', params: { projectId: project.id } },
                        project_id: project.id,
                      }));
                    if (notifications.length > 0) {
                      supabase.from('notifications').insert(notifications).then(() => {});
                    }
                  })
                  .catch(() => {});
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to update project status.');
            }
          },
        },
      ]
    );
  };

  const statusColor = getStatusColor(project.status);
  const progressPercent = project.percentComplete || 0;
  const contractAmount = project.contractAmount || project.budget || 0;
  // Use calculated values from transactions (includes auto-generated labor costs)
  const incomeCollected = calculatedIncome ?? project.incomeCollected ?? 0;
  const expenses = calculatedExpenses ?? project.expenses ?? project.spent ?? 0;
  const profit = incomeCollected - expenses;

  // Show a polished loading skeleton until ALL data is ready — prevents piecemeal appearance
  if (initialLoading) {
    const loadingSkeleton = (
      <View style={[styles.container, { backgroundColor: '#1E3A8A' }]}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: '#1E3A8A' }} />
        <LinearGradient colors={['#1E3A8A', '#1E3A8A']} style={{ paddingBottom: 40 }}>
          <View style={[styles.header, { borderBottomWidth: 0 }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <View style={[styles.closeIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name={asScreen ? "chevron-back" : "chevron-down"} size={24} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20 }}>
            {project?.name ? (
              <>
                <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 4 }}>{project.name}</Text>
                {project?.client ? <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{project.client}</Text> : null}
              </>
            ) : (
              <>
                <SkeletonBox width="60%" height={26} borderRadius={6} style={{ marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                <SkeletonBox width="40%" height={16} borderRadius={4} style={{ marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.10)' }} />
              </>
            )}
          </View>
        </LinearGradient>
        <View style={{ flex: 1, backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, padding: 20 }}>
          <SkeletonCard lines={2} style={{ marginBottom: 14 }} />
          <SkeletonCard lines={3} style={{ marginBottom: 14 }} />
          <SkeletonBox width="50%" height={16} borderRadius={4} style={{ marginBottom: 14 }} />
          <SkeletonBox width="100%" height={60} borderRadius={10} style={{ marginBottom: 8 }} />
          <SkeletonBox width="100%" height={60} borderRadius={10} />
        </View>
      </View>
    );

    if (asScreen) return loadingSkeleton;
    return (
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        {loadingSkeleton}
      </Modal>
    );
  }

  const mainContent = (
    <>
      <View style={[styles.container, { backgroundColor: '#1E3A8A' }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#1E3A8A' }} />

        {/* Static Blue Header — stays behind scroll */}
        <LinearGradient colors={['#1E3A8A', '#1E3A8A']} style={{ paddingBottom: 40 }}>
          {/* Nav Bar */}
          <View style={[styles.header, { borderBottomWidth: 0 }]}>
            <TouchableOpacity
              onPress={() => {
                if (isEditing) {
                  setEditAddress(project?.location || '');
                  setEditPhone(project?.client_phone || project?.clientPhone || '');
                  setEditEmail(project?.client_email || project?.clientEmail || '');
                  setEditStartDate(project?.startDate ? new Date(project.startDate) : null);
                  setEditEndDate(project?.endDate ? new Date(project.endDate) : null);
                  setIsEditing(false);
                } else {
                  onClose();
                }
              }}
              style={styles.closeButton}
            >
              <View style={[styles.closeIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name={isEditing ? "close" : (asScreen ? "chevron-back" : "chevron-down")} size={24} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {!isDemo && !isEditing && (
              <TouchableOpacity
                onPress={() => {
                  // Seed edit drafts from current project so the existing
                  // in-place editable blocks (timeline, phase progress,
                  // contact info) have values to bind to.
                  setEditAddress(project?.location || '');
                  setEditPhone(project?.client_phone || project?.clientPhone || '');
                  setEditEmail(project?.client_email || project?.clientEmail || '');
                  setEditStartDate(project?.startDate ? safeParseDateToObject(project.startDate) : null);
                  setEditEndDate(project?.endDate ? safeParseDateToObject(project.endDate) : null);
                  setEditWorkingDays(project?.workingDays || [1, 2, 3, 4, 5]);
                  setEditedName(project?.name || '');
                  setEditedContractAmount(String(contractAmount || ''));
                  setIsEditing(true);
                }}
                style={styles.editButton}
              >
                <View style={[styles.editIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}
            {!isDemo && isEditing && (
              <TouchableOpacity
                onPress={handleSaveAllChanges}
                disabled={savingChanges}
                style={styles.editButton}
              >
                <View style={[styles.editIconContainer, { backgroundColor: '#10B981', opacity: savingChanges ? 0.6 : 1 }]}>
                  {savingChanges ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Project Identity — Static */}
          <View style={styles.heroContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 20 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF', textTransform: 'capitalize' }}>{project.status?.replace(/-/g, ' ') || 'Active'}</Text>
              </View>
            </View>
            {isEditing ? (
              <View style={{ paddingHorizontal: 20 }}>
                <TextInput
                  style={[styles.heroTitle, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#FFFFFF' }]}
                  value={editedName}
                  onChangeText={setEditedName}
                  placeholder="Project name"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ color: '#B45309', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>Editing…</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={[styles.heroTitle, { paddingHorizontal: 20 }]} numberOfLines={2}>
                {project.name}
              </Text>
            )}
              {project.location && (
                <TouchableOpacity
                  onPress={() => handleAddressPress(project.location)}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 4 }}
                >
                  <Ionicons name="location" size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', textDecorationLine: 'underline' }} numberOfLines={1}>{project.location}</Text>
                  <Ionicons name="open-outline" size={12} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              )}
          </View>
        </LinearGradient>

        {/* Scrollable white body — scrolls over the blue header */}
        <ScrollView
          style={{ flex: 1, backgroundColor: '#F8FAFC', marginTop: -20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Financial Health Card */}
          <View style={[styles.financialContainer, { backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 20, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 }]}>
            {/* Contract Value — Big Anchor */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' }}>Contract Value</Text>
                {isSupervisor && ownerHidesContract ? (
                  <Text style={{ fontSize: 34, fontWeight: '700', color: '#0F172A', letterSpacing: -0.8, marginTop: 4 }}>---</Text>
                ) : isEditing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Text style={{ fontSize: 34, fontWeight: '700', color: '#0F172A', letterSpacing: -0.8 }}>$</Text>
                    <TextInput
                      style={{ fontSize: 34, fontWeight: '700', color: '#0F172A', letterSpacing: -0.8, minWidth: 120, paddingVertical: 0, paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: '#3B82F6' }}
                      value={editedContractAmount}
                      onChangeText={(v) => setEditedContractAmount(String(v).replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#CBD5E1"
                    />
                  </View>
                ) : (
                  <Text style={{ fontSize: 34, fontWeight: '700', color: '#0F172A', letterSpacing: -0.8, marginTop: 4 }}>${contractAmount.toLocaleString()}</Text>
                )}
              </View>
              {isOwner && (
                <TouchableOpacity onPress={handleToggleContractVisibility} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={localHideContract ? 'eye-off-outline' : 'eye-outline'} size={18} color={localHideContract ? '#EF4444' : '#94A3B8'} />
                </TouchableOpacity>
              )}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginTop: 16, marginBottom: 16 }} />

            {/* 3-Column Metrics */}
            <View style={{ flexDirection: 'row' }}>
              {/* Income */}
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center' }}
                onPress={() => {
                  if (navigation) {
                    wasNavigatingRef.current = true;
                    setModalVisible(false);
                    navigation.navigate('ProjectTransactions', { projectId: project.id, projectName: project.name, fromProjectDetail: true, transactionType: 'income' });
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Income</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#0F172A', marginTop: 2 }}>${incomeCollected.toLocaleString()}</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{contractAmount > 0 ? Math.round((incomeCollected / contractAmount) * 100) : 0}% collected</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={{ width: 1, backgroundColor: '#F1F5F9', height: 40, alignSelf: 'center' }} />

              {/* Expenses */}
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center' }}
                onPress={() => {
                  if (navigation) {
                    wasNavigatingRef.current = true;
                    setModalVisible(false);
                    navigation.navigate('ProjectTransactions', { projectId: project.id, projectName: project.name, fromProjectDetail: true, transactionType: 'expense' });
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Expenses</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#0F172A', marginTop: 2 }}>${expenses.toLocaleString()}</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>of contract</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={{ width: 1, backgroundColor: '#F1F5F9', height: 40, alignSelf: 'center' }} />

              {/* Profit */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Profit</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: profit >= 0 ? '#059669' : '#DC2626', marginTop: 2 }}>${Math.abs(profit).toLocaleString()}</Text>
                <Text style={{ fontSize: 11, color: profit >= 0 ? '#059669' : '#DC2626', marginTop: 2 }}>{profit >= 0 ? 'Healthy ✓' : 'Review ↗'}</Text>
              </View>
            </View>
          </View>

          {/* Timeline — Hours Logged moved into the Project Details
              container below so this row doesn't orphan white space when
              hours are absent. */}
          {project.start_date && (
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <View style={[styles.financialCard, { backgroundColor: '#FFFFFF' }]}>
                <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="calendar" size={18} color="#1E40AF" />
                </View>
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Timeline</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#0F172A', marginTop: 2 }}>
                  {calculatedProgress != null ? `${calculatedProgress}%` : `${project.percent_complete || 0}%`}
                </Text>
                <View style={{ height: 4, backgroundColor: '#F1F5F9', borderRadius: 4, marginTop: 8 }}>
                  <View style={{ height: 4, backgroundColor: '#1E40AF', borderRadius: 4, width: `${Math.min(calculatedProgress || project.percent_complete || 0, 100)}%` }} />
                </View>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>complete</Text>
              </View>
            </View>
          )}

          {/* Budget & Trade Budgets — Collapsible Card */}
          {(contractAmount > 0 || tradeBudgets.length > 0 || phases.some(p => (parseFloat(p.budget) || 0) > 0)) && (
            <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 16, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, overflow: 'hidden' }}>
              {/* Section Header */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: financialsExpanded ? 1 : 0, borderBottomColor: '#F1F5F9' }}
                onPress={() => setFinancialsExpanded(!financialsExpanded)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="pie-chart" size={16} color="#3B82F6" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>Budget Breakdown</Text>
                </View>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={financialsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
                </View>
              </TouchableOpacity>

              {financialsExpanded && (
                <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16 }}>
                  {/* Overall Budget Progress */}
                  {contractAmount > 0 && (
                    <View style={{ marginBottom: tradeBudgets.length > 0 ? 18 : 0 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>Overall Budget</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: expenses > contractAmount ? '#EF4444' : '#0F172A' }}>
                          ${expenses.toLocaleString()} / ${contractAmount.toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{
                          height: 8,
                          borderRadius: 4,
                          width: `${Math.min(100, (expenses / contractAmount) * 100)}%`,
                          backgroundColor: expenses > contractAmount ? '#EF4444' : expenses > contractAmount * 0.8 ? '#F59E0B' : '#10B981',
                        }} />
                      </View>
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                        {Math.round((expenses / contractAmount) * 100)}% used · ${(contractAmount - expenses).toLocaleString()} remaining
                      </Text>
                    </View>
                  )}

                  {/* Phases — merged from the old Work Sections card. Each phase
                      shows budget + spent + tasks (when expanded) + per-phase
                      transactions CTAs. Tap a phase to see its tasks. */}
                  {project.hasPhases && phases.length > 0 && (
                    <View style={{ marginTop: contractAmount > 0 ? 18 : 0 }}>
                      {contractAmount > 0 && <View style={{ height: 1, backgroundColor: '#F1F5F9', marginBottom: 14 }} />}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' }}>Phases</Text>
                        <TouchableOpacity onPress={() => setShowBulkShiftModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.primaryBlue + '15' }}>
                          <Ionicons name="calendar-outline" size={12} color={Colors.primaryBlue} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primaryBlue }}>{t('buttons.shiftTasks')}</Text>
                        </TouchableOpacity>
                      </View>
                      <PhaseTimeline
                        phases={phases}
                        projectProgress={calculatedProgress}
                        onPhasePress={handlePhasePress}
                        onTaskToggle={handleTaskToggle}
                        onTaskReorder={handleTaskReorder}
                        onTaskMove={handleTaskMove}
                        compact={false}
                        expandedPhaseIds={expandedPhaseIds}
                        isEditing={isEditingPhases}
                        progressValues={phaseProgressValues}
                        onProgressChange={(phaseId, value) => {
                          setPhaseProgressValues(prev => ({ ...prev, [phaseId]: value }));
                        }}
                        onProgressSave={async (phaseId, value) => {
                          const success = await updatePhaseProgress(phaseId, value);
                          if (success) {
                            const updated = await fetchProjectPhases(project.id);
                            setPhases(updated);
                          }
                        }}
                        phaseSpentByName={spentBySubcategory}
                        onViewTransactions={handleViewPhaseTransactions}
                        onQuickAddTask={handleQuickAddTask}
                        onAddTask={isEditing ? handleAddTaskToPhase : undefined}
                        onPhaseBudgetChange={isEditing ? (phaseId, newBudget) => {
                          setPhases(prev => prev.map(p =>
                            p.id === phaseId ? { ...p, budget: newBudget } : p
                          ));
                        } : undefined}
                      />
                    </View>
                  )}

                  {/* Other Trades — only orphan trade-budget rows that don't
                      match any phase by name. Phase-named trades are already
                      represented inline above with their per-phase spend. */}
                  {(() => {
                    const phaseNames = new Set((phases || []).map(p => String(p.name || '').toLowerCase()));
                    const orphans = (tradeBudgets || []).filter(tb => !phaseNames.has(String(tb.trade_name || '').toLowerCase()));
                    if (orphans.length === 0) return null;
                    return (
                      <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                          Other Trades
                        </Text>
                        {orphans.map((tb, idx) => {
                          const pct = tb.budget_amount > 0 ? Math.round((tb.paid / tb.budget_amount) * 100) : 0;
                          const isOver = tb.paid > tb.budget_amount;
                          const barColor = isOver ? '#EF4444' : pct > 80 ? '#F59E0B' : '#3B82F6';
                          return (
                            <TouchableOpacity
                              key={tb.id}
                              style={{ paddingVertical: 8, marginBottom: idx < orphans.length - 1 ? 4 : 0 }}
                              activeOpacity={0.7}
                              onPress={() => {
                                if (navigation) {
                                  wasNavigatingRef.current = true;
                                  setModalVisible(false);
                                  navigation.navigate('ProjectTransactions', {
                                    projectId: project.id,
                                    projectName: project.name,
                                    fromProjectDetail: true,
                                    transactionType: 'expense',
                                    subcategoryFilter: tb.trade_name,
                                  });
                                }
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: barColor }} />
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>{tb.trade_name}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: isOver ? '#EF4444' : '#64748B' }}>
                                    ${tb.paid.toLocaleString()} / ${parseFloat(tb.budget_amount).toLocaleString()}
                                  </Text>
                                  <Ionicons name="chevron-forward" size={12} color="#CBD5E1" />
                                </View>
                              </View>
                              <View style={{ height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                                <View style={{ height: 4, borderRadius: 2, width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} />
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* Add Trade Budget */}
                  {isOwner && !isDemo && (
                    <View style={{ marginTop: tradeBudgets.length > 0 ? 12 : 0 }}>
                      <TouchableOpacity
                        onPress={() => setShowAddTrade(true)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed' }}
                      >
                        <Ionicons name="add" size={16} color="#3B82F6" />
                        <Text style={{ fontSize: 13, color: '#3B82F6', fontWeight: '600' }}>Add Trade Budget</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Project Status Actions */}
          {isOwner && !isDemo && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
              {project.status === 'active' && (
                <>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
                    onPress={() => handleStatusChange('completed')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Mark Complete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: Colors.cardBackground, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
                    onPress={() => handleStatusChange('paused')}
                  >
                    <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 14 }}>Pause</Text>
                  </TouchableOpacity>
                </>
              )}
              {project.status === 'completed' && (
                <>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: Colors.cardBackground, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
                    onPress={() => handleStatusChange('active')}
                  >
                    <Text style={{ color: '#3B82F6', fontWeight: '700', fontSize: 14 }}>Reopen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
                    onPress={() => {
                      if (navigation) {
                        wasNavigatingRef.current = true;
                        setModalVisible(false);
                        navigation.navigate('Chat', { prefill: `Create an invoice for project "${project.name}" with contract amount $${contractAmount}` });
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Generate Invoice</Text>
                  </TouchableOpacity>
                </>
              )}
              {project.status === 'paused' && (
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
                  onPress={() => handleStatusChange('active')}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Resume Project</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Project Details Section */}
          {(project.taskDescription || project.location || project.client || project.clientPhone || project.clientEmail || totalProjectHours > 0) && (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('labels.projectDetails')}</Text>

              {totalProjectHours > 0 && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="time-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Hours Logged</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{formatHoursMinutes(totalProjectHours)}</Text>
                  </View>
                </View>
              )}

              {project.client && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="person-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.client', 'Client')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{project.client}</Text>
                  </View>
                </View>
              )}

              {project.taskDescription && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="document-text-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.description')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{project.taskDescription}</Text>
                  </View>
                </View>
              )}

              {project.location && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => handleAddressPress(project.location)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="location-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.location')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryBlue }]}>{project.location}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {project.clientPhone && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => handlePhonePress(project.clientPhone)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="call-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.clientPhone')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryBlue }]}>{project.clientPhone}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {project.clientEmail && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => Linking.openURL(`mailto:${project.clientEmail}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="mail-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.clientEmail', 'Client Email')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryBlue }]}>{project.clientEmail}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Services / Line Items card removed — invoice generation flows
              through chat, Phases already shows the work scope, and the
              auto-extracted unpriced list was visual clutter. project.services
              still persists in the DB
              if needed for future itemized invoicing. */}

          {/* Work Sections card removed — phases now live inside Budget Breakdown
              with budget + spent + tasks + per-phase Transactions CTA. */}

          {/* Assigned Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                Assigned ({workers.length + (supervisorName ? 1 : 0)})
              </Text>
              <View style={styles.assignButtonsRow}>
                {canAssignToSupervisor && (
                  <TouchableOpacity
                    style={[styles.assignButton, { backgroundColor: '#1E40AF', marginRight: 8 }]}
                    onPress={() => setShowSupervisorAssignment(true)}
                  >
                    <Ionicons name="briefcase" size={14} color="#FFFFFF" />
                    <Text style={styles.assignButtonText}>Supervisor</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => setShowWorkerAssignment(true)}
                >
                  <Ionicons name="person-add" size={14} color="#FFFFFF" />
                  <Text style={styles.assignButtonText}>Worker</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Assigned Supervisor */}
            {supervisorName && (
              <TouchableOpacity
                style={[styles.workerCard, { backgroundColor: Colors.lightGray, borderLeftWidth: 3, borderLeftColor: '#1E40AF' }]}
                onPress={() => {
                  const supervisorId = project?.assignedTo || project?.assigned_supervisor_id;
                  if (navigation && supervisorId) {
                    // Keep ProjectDetailView open so swipe-back returns here,
                    // not to the general Projects/Team tab.
                    navigation.navigate('SupervisorDetail', { supervisorId });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.workerCardAvatar, { backgroundColor: '#1E40AF' }]}>
                  <Text style={styles.workerAvatarText}>{getInitials(supervisorName)}</Text>
                </View>
                <View style={styles.workerCardInfo}>
                  <Text style={[styles.workerCardName, { color: Colors.primaryText }]} numberOfLines={1}>
                    {supervisorName}
                  </Text>
                  <Text style={[styles.workerCardRole, { color: '#1E40AF' }]} numberOfLines={1}>
                    Supervisor
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
              </TouchableOpacity>
            )}

            {workers.length === 0 && !supervisorName ? (
              <View style={styles.emptyWorkers}>
                <Ionicons name="people-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyWorkersText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noWorkersAssigned')}
                </Text>
              </View>
            ) : workers.length > 0 ? (
              <View style={styles.workersList}>
                {workers.map((worker) => (
                  <TouchableOpacity
                    key={worker.id}
                    style={[styles.workerCard, { backgroundColor: Colors.lightGray }]}
                    onPress={() => {
                      if (navigation) {
                        // Keep ProjectDetailView open underneath so swipe-back
                        // from WorkerDetailHistory returns the user here, not
                        // to the general Workers/Projects tab.
                        navigation.navigate('WorkerDetailHistory', { worker });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.workerCardAvatar, { backgroundColor: Colors.primaryBlue }]}>
                      <Text style={styles.workerAvatarText}>{getInitials(worker.full_name)}</Text>
                    </View>
                    <View style={styles.workerCardInfo}>
                      <Text style={[styles.workerCardName, { color: Colors.primaryText }]} numberOfLines={1}>
                        {worker.full_name}
                      </Text>
                      {worker.trade && (
                        <Text style={[styles.workerCardRole, { color: Colors.secondaryText }]} numberOfLines={1}>
                          {worker.trade}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>

          {/* Today's Checklist + Daily Crew Checks — both wrapped so they
              share the same 16px horizontal margin as surrounding section
              cards. Components are layout-neutral; parent owns placement. */}
          {!isDemo && project?.id && (
            <View style={{ marginHorizontal: 16 }}>
              <TodaysChecklistSection
                projectId={project.id}
                userRole={isOwner ? 'owner' : isSupervisor ? 'supervisor' : 'worker'}
              />
              <DailyChecklistSection
                projectId={project.id}
                ownerId={project.user_id || profile?.id}
                userRole={isOwner ? 'owner' : isSupervisor ? 'supervisor' : 'worker'}
                userId={profile?.id}
                editMode={isEditing}
                onEditModeChange={(signal) => {
                  if (signal && typeof signal === 'object' && signal.type === 'save-handler') {
                    checklistSaveRef.current = signal.fn;
                  }
                }}
              />
            </View>
          )}

          {/* Daily Reports Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                {t('labels.dailyReportsCount', { count: projectReports.length })}
              </Text>
              <TouchableOpacity
                style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => navigation?.navigate('DailyReportForm', { isOwner: true })}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {loadingReports ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>{t('labels.loadingReports')}</Text>
              </View>
            ) : projectReports.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="document-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noReportsYet')}
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  {t('emptyStates.addDailyReports')}
                </Text>
              </View>
            ) : (
              <>
                {/* Reports List */}
                <ScrollView style={projectReports.length > 2 ? { maxHeight: 180 } : undefined} nestedScrollEnabled showsVerticalScrollIndicator={projectReports.length > 2} persistentScrollbar={true} indicatorStyle="default" fadingEdgeLength={projectReports.length > 2 ? 20 : 0}>
                  {projectReports.map((report, index) => {
                    const reportDate = report.report_date ? new Date(report.report_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                    const getReporterName = () => {
                      if (report.reporter_type === 'owner') return 'Owner';
                      if (report.reporter_type === 'supervisor') return report.profiles?.business_name || 'Supervisor';
                      return report.workers?.full_name || 'Worker';
                    };
                    const getReporterColor = () => {
                      if (report.reporter_type === 'owner') return '#10B981';
                      if (report.reporter_type === 'supervisor') return Colors.primaryBlue;
                      return Colors.secondaryText;
                    };
                    const workDone = report.tags?.[0] || '';
                    const photoCount = report.photos?.length || 0;

                    return (
                      <TouchableOpacity
                        key={report.id || index}
                        style={[styles.reportCard, { borderColor: Colors.border }]}
                        onPress={() => navigation?.navigate('DailyReportDetail', { report })}
                        activeOpacity={0.7}
                      >
                        <View style={styles.reportCardHeader}>
                          <Text style={[styles.reportDate, { color: Colors.primaryText }]}>
                            {reportDate}
                          </Text>
                          <View style={styles.reportBadgesRow}>
                            <View style={[styles.reporterBadge, { backgroundColor: getReporterColor() + '20' }]}>
                              <Text style={[styles.reporterBadgeText, { color: getReporterColor() }]}>
                                {report.reporter_type === 'owner' ? 'Owner' : report.reporter_type === 'supervisor' ? 'Supervisor' : 'Worker'}
                              </Text>
                            </View>
                            {photoCount > 0 && (
                              <View style={[styles.photoBadge, { backgroundColor: Colors.lightGray }]}>
                                <Ionicons name="camera" size={12} color={Colors.secondaryText} />
                                <Text style={[styles.photoBadgeText, { color: Colors.secondaryText }]}>
                                  {photoCount}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={[styles.reporterName, { color: Colors.primaryText }]}>
                          {getReporterName()}
                        </Text>
                        {workDone && (
                          <Text style={[styles.reportWorkDone, { color: Colors.secondaryText }]} numberOfLines={2}>
                            {workDone}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {projectReports.length > 2 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
                    <Ionicons name="chevron-down" size={14} color={Colors.secondaryText} />
                    <Text style={{ fontSize: 11, color: Colors.secondaryText, marginLeft: 4 }}>
                      {t('labels.scrollForMore', { defaultValue: 'Scroll for more' })}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Documents Section */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="folder-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                {t('labels.documentsCount', { count: projectDocuments.length })}
              </Text>
              <TouchableOpacity
                style={[styles.assignButton, { backgroundColor: Colors.primaryBlue, opacity: uploadingDocument ? 0.6 : 1 }]}
                onPress={handleUploadDocument}
                disabled={uploadingDocument}
              >
                {uploadingDocument ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.assignButtonText}>{t('buttons.add')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {loadingDocuments ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>{t('labels.loadingDocuments')}</Text>
              </View>
            ) : projectDocuments.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="document-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noDocumentsYet')}
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  {t('emptyStates.uploadDocuments')}
                </Text>
              </View>
            ) : (
              <View style={styles.documentsList}>
                {projectDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[styles.documentCard, { backgroundColor: Colors.lightGray }]}
                    onPress={() => handleViewDocument(doc)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.documentIcon, { backgroundColor: doc.file_type === 'document' ? '#EF4444' + '20' : Colors.primaryBlue + '20' }]}>
                      <Ionicons
                        name={doc.file_type === 'document' ? 'document' : 'image'}
                        size={24}
                        color={doc.file_type === 'document' ? '#EF4444' : Colors.primaryBlue}
                      />
                    </View>
                    <View style={styles.documentInfo}>
                      <Text style={[styles.documentName, { color: Colors.primaryText }]} numberOfLines={1}>
                        {doc.file_name}
                      </Text>
                      <View style={styles.documentMeta}>
                        <Text style={[styles.documentDate, { color: Colors.secondaryText }]}>
                          {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {doc.visible_to_workers && (
                          <View style={[styles.workerVisibleBadge, { backgroundColor: '#10B981' + '20' }]}>
                            <Ionicons name="people" size={10} color="#10B981" />
                            <Text style={styles.workerVisibleText}>{t('labels.workers')}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.documentVisibilityButton}
                      onPress={() => handleToggleDocumentVisibility(doc)}
                    >
                      <Ionicons
                        name={doc.visible_to_workers ? 'eye' : 'eye-off'}
                        size={18}
                        color={doc.visible_to_workers ? '#10B981' : Colors.secondaryText}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.documentDeleteButton}
                      onPress={() => handleDeleteDocument(doc)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Client Portal Card - Owner only */}
          {!isSupervisor && !isDemo && (
            <ClientPortalCard project={project} navigation={navigation} />
          )}

          {/* Estimates Section - Hidden for supervisors */}
          {!isSupervisor && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>
                {t('labels.estimatesCount', { count: projectEstimates.length })}
              </Text>
              {!isSupervisor && (
                <TouchableOpacity
                  style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => {
                    // Navigate to chat with context to create estimate
                    if (navigation) {
                      onClose();
                      navigation.navigate('MainTabs', {
                        screen: 'Chat',
                        params: {
                          initialMessage: `Create estimate for ${project.name}`,
                          projectIdForEstimate: project.id
                        }
                      });
                    }
                  }}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.assignButtonText}>{t('buttons.create')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {loadingEstimates ? (
              <View style={styles.photosLoading}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.photosLoadingText, { color: Colors.secondaryText }]}>{t('labels.loadingEstimates')}</Text>
              </View>
            ) : projectEstimates.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="document-text-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyPhotosText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noEstimatesYet')}
                </Text>
                <Text style={[styles.emptyPhotosSubtext, { color: Colors.secondaryText }]}>
                  {t('emptyStates.createEstimate')}
                </Text>
              </View>
            ) : (
              <View style={styles.estimatesList}>
                {projectEstimates.map((estimate) => (
                  <TouchableOpacity
                    key={estimate.id}
                    style={[styles.estimateCard, { backgroundColor: Colors.lightGray }]}
                    onPress={async () => {
                      // Fetch full estimate data (list only has summary fields)
                      const fullEstimate = await getEstimate(estimate.id);
                      if (fullEstimate) {
                        setSelectedEstimate(fullEstimate);
                        setShowEstimateModal(true);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.estimateCardContent}>
                      <View style={styles.estimateCardHeader}>
                        <Text style={[styles.estimateCardTitle, { color: Colors.primaryText }]} numberOfLines={1}>
                          {estimate.projectName || 'Estimate'}
                        </Text>
                        <View style={[
                          styles.estimateStatusBadge,
                          { backgroundColor: estimate.status === 'sent' ? '#10B981' + '20' : estimate.status === 'accepted' ? '#3B82F6' + '20' : '#F59E0B' + '20' }
                        ]}>
                          <Text style={[
                            styles.estimateStatusText,
                            { color: estimate.status === 'sent' ? '#10B981' : estimate.status === 'accepted' ? '#3B82F6' : '#F59E0B' }
                          ]}>
                            {estimate.status || 'Draft'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.estimateCardDetails}>
                        <Text style={[styles.estimateCardTotal, { color: Colors.primaryText }]}>
                          ${(estimate.total || 0).toLocaleString()}
                        </Text>
                        <Text style={[styles.estimateCardDate, { color: Colors.secondaryText }]}>
                          {estimate.createdAt ? new Date(estimate.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : ''}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          )}

          {/* Timeline Section */}
          {(project.startDate || project.endDate || isEditing) && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, flex: 1 }]}>{t('labels.timeline')}</Text>
                {isEditing && (
                  <View style={styles.editingIndicator}>
                    <Text style={[styles.editingIndicatorText, { color: Colors.primaryBlue }]}>{t('labels.editing')}</Text>
                  </View>
                )}
              </View>

              {/* Start Date */}
              {isEditing ? (
                <TouchableOpacity
                  style={styles.dateEditRow}
                  onPress={() => setShowStartDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: '#10B981' + '15' }]}>
                    <Ionicons name="play-outline" size={18} color="#10B981" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.startDate')}</Text>
                    <View style={[styles.dateEditButton, { borderColor: Colors.border }]}>
                      <Text style={[styles.dateEditText, { color: editStartDate ? Colors.primaryText : Colors.secondaryText }]}>
                        {editStartDate ? editStartDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        }) : t('placeholders.tapToSetDate')}
                      </Text>
                      <Ionicons name="calendar" size={16} color={Colors.primaryBlue} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : project.startDate ? (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#10B981' + '15' }]}>
                    <Ionicons name="play-outline" size={18} color="#10B981" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.startDate')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {safeParseDateToObject(project.startDate)?.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      }) || t('emptyStates.notSet')}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* End Date */}
              {isEditing ? (
                <TouchableOpacity
                  style={styles.dateEditRow}
                  onPress={() => setShowEndDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailIconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                    <Ionicons name="flag-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.endDate')}</Text>
                    <View style={[styles.dateEditButton, { borderColor: Colors.border }]}>
                      <Text style={[styles.dateEditText, { color: editEndDate ? Colors.primaryText : Colors.secondaryText }]}>
                        {editEndDate ? editEndDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        }) : t('placeholders.tapToSetDate')}
                      </Text>
                      <Ionicons name="calendar" size={16} color={Colors.primaryBlue} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : project.endDate ? (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#EF4444' + '15' }]}>
                    <Ionicons name="flag-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.endDate')}</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {safeParseDateToObject(project.endDate)?.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      }) || t('emptyStates.notSet')}
                    </Text>
                  </View>
                </View>
              ) : null}

              {!isEditing && project.daysRemaining !== null && project.daysRemaining !== undefined && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#F59E0B' + '15' }]}>
                    <Ionicons name="time-outline" size={18} color="#F59E0B" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Days Remaining</Text>
                    <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                      {project.daysRemaining} days
                    </Text>
                  </View>
                </View>
              )}

              {/* Working Days */}
              <View style={[styles.workingDaysRow, { marginTop: Spacing.md }]}>
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconBadge, { backgroundColor: '#8B5CF6' + '15' }]}>
                    <Ionicons name="briefcase-outline" size={18} color="#8B5CF6" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>{t('labels.workingDays')}</Text>
                  </View>
                </View>
                <WorkingDaysSelector
                  selectedDays={editWorkingDays}
                  onDaysChange={async (days) => {
                    const oldDays = editWorkingDays; // Capture BEFORE updating state
                    setEditWorkingDays(days);
                    if (project?.id) {
                      await updateProjectWorkingDays(project.id, days);

                      // Detect which day was REMOVED (toggled OFF)
                      const removedDay = oldDays.find(d => !days.includes(d));
                      // Detect which day was ADDED (toggled ON)
                      const addedDay = days.find(d => !oldDays.includes(d));

                      const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

                      if (removedDay) {
                        // A day was toggled OFF - use AI to redistribute tasks from that day
                        const result = await redistributeTasksFromDayWithAI(project.id, removedDay, days, nonWorkingDates);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.scheduleUpdated'),
                            t('messages.tasksMoved', { count: result.updatedCount, day: dayNames[removedDay] }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      } else if (addedDay) {
                        // A day was toggled ON - restore tasks that were originally on this day
                        const result = await restoreTasksToOriginalDay(project.id, addedDay);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.tasksRestored'),
                            t('messages.tasksRestoredToDay', { count: result.updatedCount, day: dayNames[addedDay] }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      }
                    }
                  }}
                  label=""
                  disabled={false}
                />

                {/* Non-Working Dates (specific days off) */}
                <NonWorkingDatesManager
                  dates={nonWorkingDates}
                  onAddDate={async (date) => {
                    if (project?.id) {
                      const success = await addNonWorkingDate(project.id, date);
                      if (success) {
                        const newNonWorkingDates = [...nonWorkingDates, date].sort();
                        setNonWorkingDates(newNonWorkingDates);
                        // Only move tasks on this specific date (not all tasks!)
                        const result = await moveTasksFromSpecificDate(project.id, date, editWorkingDays, newNonWorkingDates);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.scheduleUpdated'),
                            t('messages.tasksMovedFromDate', { count: result.updatedCount, date }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      }
                    }
                  }}
                  onRemoveDate={async (date) => {
                    if (project?.id) {
                      const success = await removeNonWorkingDate(project.id, date);
                      if (success) {
                        const newNonWorkingDates = nonWorkingDates.filter(d => d !== date);
                        setNonWorkingDates(newNonWorkingDates);
                        // Restore tasks that were originally on this date
                        const result = await restoreTasksToSpecificDate(project.id, date);
                        if (result.success && result.updatedCount > 0) {
                          Alert.alert(
                            t('alerts.tasksRestored'),
                            t('messages.tasksRestoredToDate', { count: result.updatedCount, date }),
                            [{ text: t('buttons.ok') }]
                          );
                          if (onRefreshNeeded) {
                            onRefreshNeeded();
                          }
                        }
                      }
                    }
                  }}
                  disabled={false}
                />
              </View>
            </View>
          )}

          {/* Client Portal Settings */}
          <TouchableOpacity
            style={styles.deleteProjectLink}
            onPress={() => navigation?.navigate('ClientVisibility', { projectId: project?.id, projectName: project?.name })}
            activeOpacity={0.6}
          >
            <Ionicons name="eye-outline" size={14} color={'#6366F1' + '80'} />
            <Text style={[styles.deleteProjectLinkText, { color: '#6366F180' }]}>
              {t('buttons.clientPortalSettings', 'Client Portal Settings')}
            </Text>
          </TouchableOpacity>

          {/* Delete Project - subtle link */}
          <TouchableOpacity
            style={styles.deleteProjectLink}
            onPress={handleDeleteProject}
            activeOpacity={0.6}
          >
            <Ionicons name="trash-outline" size={14} color={'#EF4444' + '80'} />
            <Text style={styles.deleteProjectLinkText}>{t('buttons.deleteProject')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Worker Assignment Modal */}
      <WorkerAssignmentModal
        visible={showWorkerAssignment}
        onClose={() => setShowWorkerAssignment(false)}
        assignmentType="project"
        assignmentId={project?.id}
        assignmentName={project?.name}
        onAssignmentsChange={handleWorkersUpdated}
      />

      {/* Supervisor Assignment Modal (for owners to assign projects) */}
      <SupervisorAssignmentModal
        visible={showSupervisorAssignment}
        onClose={() => setShowSupervisorAssignment(false)}
        project={{
          id: project?.id,
          name: project?.name,
          assignedTo: project?.assignedTo || project?.assigned_supervisor_id,
        }}
        onAssignmentChange={async (newSupervisorId) => {
          setShowSupervisorAssignment(false);
          if (newSupervisorId) {
            // Set placeholder immediately so the chip renders right away
            setSupervisorName('Supervisor');
            try {
              const { data: supProfile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', newSupervisorId)
                .single();
              if (supProfile?.full_name) {
                setSupervisorName(supProfile.full_name);
              }
            } catch (e) {
              // Keep the placeholder — chip still shows
            }
          } else {
            setSupervisorName(null);
          }
          if (onRefreshNeeded) {
            onRefreshNeeded();
          }
        }}
      />


      {/* Progress Override Modal */}
      {/* Note: Progress Override Modal removed - progress is now calculated from task completion */}

      {/* Document Visibility Modal */}
      <Modal
        visible={documentVisibilityModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelDocumentUpload}
      >
        <View style={styles.visibilityModalOverlay}>
          <View style={[styles.visibilityModalContent, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.visibilityModalTitle, { color: Colors.primaryText }]}>
              Upload Document
            </Text>
            <Text style={[styles.visibilityModalSubtitle, { color: Colors.secondaryText }]}>
              {pendingDocumentUploads.length === 1
                ? pendingDocumentUploads[0]?.fileName
                : `${pendingDocumentUploads.length} files selected`}
            </Text>

            <TouchableOpacity
              style={[styles.visibilityOption, { borderColor: Colors.border }]}
              onPress={() => setNewDocumentVisibleToWorkers(!newDocumentVisibleToWorkers)}
              activeOpacity={0.7}
            >
              <View style={styles.visibilityOptionContent}>
                <Ionicons
                  name="people"
                  size={24}
                  color={newDocumentVisibleToWorkers ? '#10B981' : Colors.secondaryText}
                />
                <View style={styles.visibilityOptionText}>
                  <Text style={[styles.visibilityOptionTitle, { color: Colors.primaryText }]}>
                    Visible to Workers
                  </Text>
                  <Text style={[styles.visibilityOptionDesc, { color: Colors.secondaryText }]}>
                    Workers assigned to this project can view this document
                  </Text>
                </View>
              </View>
              <View style={[
                styles.visibilityToggle,
                { backgroundColor: newDocumentVisibleToWorkers ? '#10B981' : Colors.border }
              ]}>
                <View style={[
                  styles.visibilityToggleKnob,
                  { transform: [{ translateX: newDocumentVisibleToWorkers ? 20 : 0 }] }
                ]} />
              </View>
            </TouchableOpacity>

            <View style={styles.visibilityModalButtons}>
              <TouchableOpacity
                style={[styles.visibilityModalButton, styles.visibilityModalCancelButton, { borderColor: Colors.border }]}
                onPress={cancelDocumentUpload}
              >
                <Text style={[styles.visibilityModalButtonText, { color: Colors.secondaryText }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityModalButton, styles.visibilityModalConfirmButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={confirmDocumentUpload}
              >
                <Text style={[styles.visibilityModalButtonText, { color: '#FFFFFF' }]}>
                  Upload
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={showStartDatePicker || showEndDatePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowStartDatePicker(false);
          setShowEndDatePicker(false);
        }}
      >
        <View style={styles.datePickerModalOverlay}>
          <TouchableOpacity
            style={styles.datePickerBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowStartDatePicker(false);
              setShowEndDatePicker(false);
            }}
          />
          <View style={[styles.datePickerModalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowStartDatePicker(false);
                  setShowEndDatePicker(false);
                }}
              >
                <Text style={[styles.datePickerCancelText, { color: Colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.datePickerTitle, { color: Colors.primaryText }]}>
                {showStartDatePicker ? t('labels.startDate') : t('labels.endDate')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowStartDatePicker(false);
                  setShowEndDatePicker(false);
                }}
              >
                <Text style={[styles.datePickerDoneText, { color: Colors.primaryBlue }]}>{t('buttons.done')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={showStartDatePicker ? (editStartDate || new Date()) : (editEndDate || new Date())}
              mode="date"
              display="spinner"
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  if (showStartDatePicker) {
                    setEditStartDate(selectedDate);
                  } else {
                    setEditEndDate(selectedDate);
                  }
                }
              }}
              style={styles.datePicker}
              textColor={Colors.primaryText}
            />
          </View>
        </View>
      </Modal>

      {/* Task Detail Modal */}
      <TaskDetailModal
        visible={showTaskDetailModal}
        task={selectedManualTask}
        onClose={() => {
          setShowTaskDetailModal(false);
          setSelectedManualTask(null);
        }}
        canComplete={true}
        onToggleComplete={handleManualTaskToggle}
      />

      {/* Bulk Task Shift Modal */}
      <BulkTaskShiftModal
        visible={showBulkShiftModal}
        onClose={() => setShowBulkShiftModal(false)}
        projectId={project?.id}
        projectName={project?.name}
        onTasksShifted={() => {
          // Refresh the project data after tasks are shifted
          onRefreshNeeded?.();
        }}
      />

      {/* Add Trade Phase Modal — name + budget + already-paid + tasks */}
      <AddTradePhaseModal
        visible={showAddTrade}
        onClose={() => setShowAddTrade(false)}
        projectId={project?.id}
        onAdded={async () => {
          setShowAddTrade(false);
          // Refetch phases immediately so the new phase renders in the
          // PhaseTimeline with the same card layout as existing phases,
          // without waiting for the parent refresh round-trip.
          if (project?.id && !isDemo) {
            try {
              const updated = await fetchProjectPhases(project.id);
              if (updated) setPhases(updated);
            } catch (e) {
              // non-fatal — parent refresh below will cover us
            }
          }
          onRefreshNeeded?.();
        }}
      />

      {/* Estimate Preview Modal */}
      <Modal
        visible={showEstimateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEstimateModal(false)}
      >
        <SafeAreaView style={[styles.estimateModalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.estimateModalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowEstimateModal(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.estimateModalTitle, { color: Colors.primaryText }]}>Estimate</Text>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView style={styles.estimateModalContent} showsVerticalScrollIndicator={false}>
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
                  setShowEstimateModal(false);
                }}
              />
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Delete Confirmation Modal - type DELETE to confirm */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={[styles.deleteModalContent, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.deleteModalTitle, { color: Colors.primaryText }]}>
              Delete "{project?.name}"?
            </Text>
            <Text style={[styles.deleteModalSubtitle, { color: Colors.secondaryText }]}>
              This action cannot be undone. All project data, phases, tasks, and documents will be permanently removed.
            </Text>
            <Text style={[styles.deleteModalInstruction, { color: Colors.secondaryText }]}>
              Type <Text style={{ fontWeight: '700', color: '#EF4444' }}>DELETE</Text> to confirm:
            </Text>
            <TextInput
              style={[styles.deleteModalInput, {
                backgroundColor: Colors.background,
                color: Colors.primaryText,
                borderColor: deleteConfirmText === 'DELETE' ? '#EF4444' : Colors.border,
              }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Type DELETE"
              placeholderTextColor={Colors.secondaryText + '60'}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalCancelBtn, { borderColor: Colors.border }]}
                onPress={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.deleteModalCancelText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteModalConfirmBtn,
                  { backgroundColor: deleteConfirmText === 'DELETE' ? '#EF4444' : Colors.border },
                ]}
                onPress={confirmDeleteProject}
                disabled={deleteConfirmText !== 'DELETE'}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.deleteModalConfirmText,
                  { color: deleteConfirmText === 'DELETE' ? '#FFFFFF' : Colors.secondaryText },
                ]}>Delete Project</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sticky bottom save bar — only visible while in-place editing. */}
      {isEditing && !isDemo && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 24, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 }}>
          <TouchableOpacity
            onPress={() => {
              setEditAddress(project?.location || '');
              setEditPhone(project?.client_phone || project?.clientPhone || '');
              setEditEmail(project?.client_email || project?.clientEmail || '');
              setEditStartDate(project?.startDate ? safeParseDateToObject(project.startDate) : null);
              setEditEndDate(project?.endDate ? safeParseDateToObject(project.endDate) : null);
              setEditedName(project?.name || '');
              setEditedContractAmount(String(contractAmount || ''));
              setIsEditing(false);
            }}
            disabled={savingChanges}
            style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', opacity: savingChanges ? 0.5 : 1 }}
          >
            <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSaveAllChanges}
            disabled={savingChanges}
            style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: savingChanges ? 0.6 : 1 }}
          >
            {savingChanges && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{savingChanges ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  // If rendering as a screen (not modal), return content directly
  if (asScreen) {
    return mainContent;
  }

  // Otherwise wrap in Modal
  return (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {mainContent}
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
  },
  closeButton: {
    padding: 4,
  },
  closeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    padding: 4,
  },
  editPhasesButton: {
    padding: 4,
  },
  editIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignButton: {
    padding: 4,
    marginRight: 4,
  },
  assignIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBanner: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  demoBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#1E40AF',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    padding: 20,
    paddingBottom: 16,
  },
  heroContent: {
    paddingHorizontal: 0,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  clientText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  contactContainer: {
    marginTop: 4,
    gap: 4,
    paddingHorizontal: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  contactText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  contactEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  contactInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editingIndicator: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  editingIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dateEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dateEditText: {
    fontSize: 14,
    fontWeight: '600',
  },
  datePickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  datePickerBackdrop: {
    flex: 1,
  },
  datePickerModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  datePickerCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  datePickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  datePicker: {
    height: 250,
  },
  editContactModal: {
    flex: 1,
  },
  editContactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  editContactTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editContactContent: {
    flex: 1,
    padding: 20,
  },
  editContactSection: {
    marginBottom: 24,
  },
  editContactLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  editContactInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 14,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  progressRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  progressRingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  financialContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  financialRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  financialCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 0,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  financialLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  financialValue: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  assignButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWorkers: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyWorkersText: {
    fontSize: 14,
    marginTop: 8,
  },
  workersList: {
    gap: 8,
    marginTop: 8,
  },
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  workerCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workerAvatarText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  workerCardInfo: {
    flex: 1,
  },
  workerCardName: {
    fontSize: 15,
    fontWeight: '600',
  },
  workerCardRole: {
    fontSize: 13,
    marginTop: 1,
  },
  deleteProjectLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  deleteProjectLinkText: {
    color: '#EF4444' + '80',
    fontSize: 13,
    fontWeight: '500',
  },
  deleteModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 24,
  },
  deleteModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  deleteModalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  deleteModalInstruction: {
    fontSize: 14,
    marginBottom: 8,
  },
  deleteModalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 20,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
  },
  manualBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  progressModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  progressModalBackdrop: {
    flex: 1,
  },
  progressModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  progressModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  progressModalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressModalBody: {
    paddingHorizontal: 20,
  },
  progressDisplay: {
    alignItems: 'center',
    marginBottom: 32,
  },
  progressDisplayValue: {
    fontSize: 56,
    fontWeight: '800',
    marginBottom: 4,
  },
  progressDisplayLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '600',
    width: 32,
  },
  sliderTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressInput: {
    width: 80,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  overrideIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  overrideIndicatorText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  progressModalButtons: {
    gap: 12,
  },
  progressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  saveButton: {
    // backgroundColor set dynamically
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#F3F4F6',
  },
  resetButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  // Photos Section Styles
  photosLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  photosLoadingText: {
    fontSize: 14,
  },
  emptyPhotos: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyPhotosText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  emptyPhotosSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  // Daily Reports Section Styles
  reportsList: {
    gap: 8,
    paddingVertical: 8,
  },
  reportCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: 'transparent',
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reportDate: {
    fontSize: 13,
    fontWeight: '600',
  },
  reportBadgesRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  reporterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reporterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reporterName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  reportWorkDone: {
    fontSize: 12,
    lineHeight: 16,
  },
  photoBadge: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: 'center',
    gap: 3,
  },
  photoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadMorePhotosButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadMorePhotosText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Estimate Modal Styles
  estimateModalContainer: {
    flex: 1,
  },
  estimateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  estimateModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  estimateModalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // Estimates Section Styles
  estimatesList: {
    gap: 10,
  },
  estimateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
  },
  estimateCardContent: {
    flex: 1,
  },
  estimateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  estimateCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  estimateStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  estimateStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  estimateCardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estimateCardTotal: {
    fontSize: 16,
    fontWeight: '700',
  },
  estimateCardDate: {
    fontSize: 12,
  },
  // Documents Section Styles
  documentsList: {
    gap: 10,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '500',
  },
  documentDate: {
    fontSize: 12,
    marginTop: 2,
  },
  documentDeleteButton: {
    padding: 8,
  },
  documentVisibilityButton: {
    padding: 8,
  },
  documentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  workerVisibleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  workerVisibleText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  // Document visibility modal styles
  visibilityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  visibilityModalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 20,
  },
  visibilityModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  visibilityModalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 20,
  },
  visibilityOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  visibilityOptionText: {
    flex: 1,
  },
  visibilityOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  visibilityOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  visibilityToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  visibilityToggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  visibilityModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  visibilityModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  visibilityModalCancelButton: {
    borderWidth: 1,
  },
  visibilityModalConfirmButton: {},
  visibilityModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Working days and task shifting styles
  shiftTasksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  shiftTasksButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  workingDaysRow: {
    paddingHorizontal: Spacing.medium,
  },
  // Task maintenance styles
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: Spacing.medium,
  },
  resyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: Spacing.medium,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 8,
  },
  resyncButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
