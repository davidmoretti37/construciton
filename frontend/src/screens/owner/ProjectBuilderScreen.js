/**
 * ProjectBuilderScreen
 *
 * Single-scroll accordion project builder reachable from the chat preview
 * card via the "Configure Details" button. Auto-saves to a draft project
 * row every 2s and flips status to 'active' on final save.
 *
 * Sections (in order):
 *   1. Project Basics
 *   2. Timeline & Working Days
 *   3. Phases (with live budget allocation bar)
 *   4. Financial (contract, services, trade budgets)
 *   5. Team (supervisor + workers multi-select)
 *   6. Daily Checklist & Labor Roles
 *   7. Documents (stub — coming soon)
 *   8. Linked Estimate (stub — coming soon)
 *   9. Review & Save (sticky bottom CTA)
 *
 * Section header chip legend:
 *   ✓ green — all required filled
 *   ! red — required missing
 *   ⚠ amber — AI low-confidence / review-needed
 *   ○ grey — empty optional
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  saveProject,
  getCurrentUserId,
  fetchWorkers,
  getSupervisorsForOwner,
  getProject,
  fetchProjectPhases,
  upsertProjectPhases,
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkingDaysSelector from '../../components/WorkingDaysSelector';
import NonWorkingDatesManager from '../../components/NonWorkingDatesManager';

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const toISODate = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d; // already ISO
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fromISODate = (iso) => {
  if (!iso) return null;
  if (iso instanceof Date) return iso;
  const [y, m, dd] = String(iso).split('-');
  if (!y) return null;
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(dd, 10));
};

const formatDate = (d) => {
  const date = fromISODate(d);
  if (!date) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const sanitizeNumeric = (t) => String(t || '').replace(/[^0-9.]/g, '');

// Map a chat-extracted project payload (from ProjectPreview) into builder state.
const hydrateFromChatData = (data) => {
  if (!data) return {};
  const schedule = data.schedule || {};
  const clientName =
    data.clientName ||
    (typeof data.client === 'string' ? data.client : data.client?.name) ||
    '';
  return {
    name: data.projectName || data.name || '',
    client: clientName,
    clientPhone: data.clientPhone || data.client_phone || data.phone || data.client?.phone || '',
    clientEmail: data.email || data.clientEmail || data.client?.email || '',
    location: data.location || data.client?.address || '',
    contractAmount: String(data.contractAmount || data.budget || data.total || ''),
    services: Array.isArray(data.services)
      ? data.services.map((s) =>
          typeof s === 'string'
            ? { description: s, amount: '' }
            : { description: s.description || s.name || '', amount: String(s.amount || '') }
        )
      : [],
    phases: Array.isArray(data.phases)
      ? data.phases.map((p, i) => ({
          name: p.name || `Phase ${i + 1}`,
          plannedDays: p.plannedDays || p.planned_days || 0,
          budget: String(p.budget || ''),
          assignedWorkerId: p.assignedWorkerId || null,
          tasks: Array.isArray(p.tasks)
            ? p.tasks.map((t) => ({
                description: typeof t === 'string' ? t : t.description || '',
                completed: !!(t.completed || t.status === 'completed'),
                status: t.status || 'not_started',
              }))
            : [],
        }))
      : [],
    startDate: schedule.startDate || data.startDate || data.date || null,
    endDate: schedule.estimatedEndDate || schedule.projectdEndDate || data.endDate || null,
    workingDays: Array.isArray(data.workingDays) && data.workingDays.length > 0 ? data.workingDays : [1, 2, 3, 4, 5],
    nonWorkingDates: Array.isArray(data.nonWorkingDates) ? data.nonWorkingDates : [],
    checklistItems: Array.isArray(data.checklist_items || data.checklistItems)
      ? (data.checklist_items || data.checklistItems).map((c) =>
          typeof c === 'string'
            ? { title: c, item_type: 'checkbox', quantity_unit: '', requires_photo: false }
            : {
                title: c.title || '',
                item_type: c.item_type || 'checkbox',
                quantity_unit: c.quantity_unit || '',
                requires_photo: !!c.requires_photo,
              }
        )
      : [],
    laborRoles: Array.isArray(data.labor_roles || data.laborRoles)
      ? (data.labor_roles || data.laborRoles).map((r) =>
          typeof r === 'string'
            ? { role_name: r, default_quantity: 1 }
            : { role_name: r.role_name || r.name || '', default_quantity: r.default_quantity || 1 }
        )
      : [],
    trades: [],
    assignedSupervisorId: data.assignedSupervisorId || null,
    workers: Array.isArray(data.workers) ? data.workers : [],
    aiConfidence: data.aiConfidence || {}, // map of fieldName => 'high' | 'low'
  };
};

// Returns borderLeftColor + extras based on field state.
const getFieldVisualProps = (value, { required = false, confidence = null } = {}) => {
  const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
  if (!hasValue && required) {
    return { borderLeftColor: '#DC2626', borderLeftWidth: 3, badge: 'required' };
  }
  if (confidence === 'high' && hasValue) {
    return { borderLeftColor: '#7C3AED', borderLeftWidth: 3, badge: 'ai-high' };
  }
  if (confidence === 'low' && hasValue) {
    return { borderLeftColor: '#F59E0B', borderLeftWidth: 3, badge: 'ai-low' };
  }
  return { borderLeftColor: 'transparent', borderLeftWidth: 0, badge: null };
};

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export default function ProjectBuilderScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const chatExtractedData = route?.params?.chatExtractedData || null;
  const initialProjectId = route?.params?.projectId || null;

  // Hydrate initial form state from chat extraction (if present)
  const initial = useMemo(() => hydrateFromChatData(chatExtractedData), [chatExtractedData]);

  // ---- Form state ----
  const [projectId, setProjectId] = useState(initialProjectId);
  const [name, setName] = useState(initial.name || '');
  const [client, setClient] = useState(initial.client || '');
  const [clientPhone, setClientPhone] = useState(initial.clientPhone || '');
  const [clientEmail, setClientEmail] = useState(initial.clientEmail || '');
  const [location, setLocation] = useState(initial.location || '');
  const [contractAmount, setContractAmount] = useState(initial.contractAmount || '');
  const [services, setServices] = useState(initial.services || []);
  const [phases, setPhases] = useState(initial.phases || []);
  const [startDate, setStartDate] = useState(initial.startDate || null);
  const [endDate, setEndDate] = useState(initial.endDate || null);
  const [workingDays, setWorkingDays] = useState(initial.workingDays || [1, 2, 3, 4, 5]);
  const [nonWorkingDates, setNonWorkingDates] = useState(initial.nonWorkingDates || []);
  const [checklistItems, setChecklistItems] = useState(initial.checklistItems || []);
  const [laborRoles, setLaborRoles] = useState(initial.laborRoles || []);
  const [trades, setTrades] = useState(initial.trades || []);
  const [selectedSupervisor, setSelectedSupervisor] = useState(initial.assignedSupervisorId || null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState(initial.workers || []);
  const [aiConfidence] = useState(initial.aiConfidence || {});

  // Team rosters
  const [supervisors, setSupervisors] = useState([]);
  const [availableWorkers, setAvailableWorkers] = useState([]);

  // UI state
  const [expandedSections, setExpandedSections] = useState({
    basics: true,
    timeline: false,
    phases: false,
    financial: false,
    team: false,
    checklist: false,
    documents: false,
    estimate: false,
    review: false,
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [finalSaving, setFinalSaving] = useState(false);

  // Refs
  const saveTimerRef = useRef(null);
  const projectIdRef = useRef(projectId);
  const mountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // ---- Load team rosters ----
  useEffect(() => {
    (async () => {
      try {
        const userId = await getCurrentUserId();
        if (userId) {
          const [sups, workers] = await Promise.all([
            getSupervisorsForOwner(userId),
            fetchWorkers(),
          ]);
          setSupervisors(sups || []);
          setAvailableWorkers(workers || []);
        }
      } catch (e) {
        console.warn('[ProjectBuilder] load team data failed', e);
      }
    })();
  }, []);

  // ---- Resume-mode: load existing project + phases ----
  useEffect(() => {
    if (!initialProjectId) return;
    (async () => {
      try {
        const proj = await getProject(initialProjectId);
        if (!proj) return;
        setName(proj.name || '');
        setClient(proj.client || proj.clientName || '');
        setClientPhone(proj.clientPhone || proj.client_phone || '');
        setClientEmail(proj.clientEmail || proj.client_email || '');
        setLocation(proj.location || '');
        setContractAmount(String(proj.contractAmount || proj.budget || ''));
        setStartDate(proj.startDate || null);
        setEndDate(proj.endDate || null);
        setWorkingDays(
          Array.isArray(proj.workingDays) && proj.workingDays.length > 0 ? proj.workingDays : [1, 2, 3, 4, 5]
        );
        setNonWorkingDates(Array.isArray(proj.nonWorkingDates) ? proj.nonWorkingDates : []);
        setServices(
          Array.isArray(proj.services)
            ? proj.services.map((s) =>
                typeof s === 'string'
                  ? { description: s, amount: '' }
                  : { description: s.description || '', amount: String(s.amount || '') }
              )
            : []
        );
        setSelectedSupervisor(proj.assignedSupervisorId || null);
        setSelectedWorkerIds(Array.isArray(proj.workers) ? proj.workers : []);

        const phaseRows = await fetchProjectPhases(initialProjectId);
        if (Array.isArray(phaseRows) && phaseRows.length > 0) {
          setPhases(
            phaseRows.map((p) => ({
              id: p.id,
              name: p.name,
              plannedDays: p.plannedDays || p.planned_days || 0,
              budget: String(p.budget || ''),
              assignedWorkerId: p.assignedWorkerId || null,
              tasks: Array.isArray(p.tasks) ? p.tasks : [],
            }))
          );
        }
      } catch (e) {
        console.warn('[ProjectBuilder] resume load failed', e);
      }
    })();
  }, [initialProjectId]);

  // ---- Create draft on mount if no projectId ----
  useEffect(() => {
    if (initialProjectId) return;
    if (projectIdRef.current) return;
    // Only create a draft if we have at least a name or client from chat data
    const hasAnyData = (initial.name && initial.name.trim()) || (initial.client && initial.client.trim());
    if (!hasAnyData) return;

    (async () => {
      try {
        const draft = await saveProject({
          ...chatExtractedData,
          projectName: initial.name,
          name: initial.name,
          client: initial.client,
          clientPhone: initial.clientPhone,
          email: initial.clientEmail,
          location: initial.location,
          contractAmount: parseFloat(initial.contractAmount) || 0,
          status: 'draft',
          startDate: toISODate(initial.startDate),
          endDate: toISODate(initial.endDate),
          workingDays: initial.workingDays,
          services: initial.services && initial.services.length > 0 ? initial.services : undefined,
          phases: undefined, // phases saved in separate upsert pass
        });
        if (draft?.id) {
          setProjectId(draft.id);
          projectIdRef.current = draft.id;
        }
      } catch (e) {
        console.warn('[ProjectBuilder] draft create failed', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Auto-save (debounced 2s) ----
  const buildSavePayload = useCallback((overrideStatus) => {
    return {
      id: projectIdRef.current || undefined,
      projectName: name.trim(),
      name: name.trim(),
      client: client.trim(),
      clientPhone: clientPhone.trim() || null,
      email: clientEmail.trim() || null,
      location: location.trim() || null,
      contractAmount: parseFloat(contractAmount) || 0,
      budget: parseFloat(contractAmount) || 0,
      status: overrideStatus || 'draft',
      startDate: toISODate(startDate),
      endDate: toISODate(endDate),
      workingDays,
      nonWorkingDates,
      services: services
        .filter((s) => (s.description || '').trim())
        .map((s) => ({ description: s.description.trim(), amount: parseFloat(s.amount) || 0 })),
      trades: trades
        .filter((t) => (t.name || '').trim())
        .map((t) => ({ dbId: t.dbId || null, name: t.name.trim(), amount: parseFloat(t.amount) || 0 })),
      assignedSupervisorId: selectedSupervisor || null,
      workers: selectedWorkerIds,
    };
  }, [
    name,
    client,
    clientPhone,
    clientEmail,
    location,
    contractAmount,
    startDate,
    endDate,
    workingDays,
    nonWorkingDates,
    services,
    trades,
    selectedSupervisor,
    selectedWorkerIds,
  ]);

  const buildPhasesPayload = useCallback(() => {
    return phases.map((p, i) => ({
      id: p.id,
      name: (p.name || '').trim() || `Phase ${i + 1}`,
      plannedDays: parseInt(p.plannedDays, 10) || 0,
      budget: parseFloat(p.budget) || 0,
      order: i,
      tasks: (p.tasks || [])
        .filter((t) => (t.description || '').trim())
        .map((t, j) => ({
          description: t.description.trim(),
          order: j + 1,
          completed: !!t.completed,
          status: t.status || 'not_started',
        })),
    }));
  }, [phases]);

  const flushSave = useCallback(async () => {
    if (!projectIdRef.current) return;
    try {
      setAutoSaveStatus('saving');
      const payload = buildSavePayload('draft');
      const saved = await saveProject(payload);
      if (saved?.id && mountedRef.current) {
        setProjectId(saved.id);
        projectIdRef.current = saved.id;
      }
      // Persist phases separately (upsert)
      const phasePayload = buildPhasesPayload();
      if (phasePayload.length > 0 && projectIdRef.current) {
        try {
          await upsertProjectPhases(projectIdRef.current, phasePayload, {
            startDate: toISODate(startDate),
            endDate: toISODate(endDate),
            workingDays,
          });
        } catch (phaseErr) {
          console.warn('[ProjectBuilder] upsertProjectPhases failed', phaseErr);
        }
      }
      if (mountedRef.current) {
        setAutoSaveStatus('saved');
        setLastSavedAt(new Date());
      }
    } catch (e) {
      console.warn('[ProjectBuilder] auto-save failed', e);
      if (mountedRef.current) setAutoSaveStatus('error');
    }
  }, [buildSavePayload, buildPhasesPayload, startDate, endDate, workingDays]);

  // Schedule a debounced save on every state change
  useEffect(() => {
    if (!projectIdRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushSave();
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    client,
    clientPhone,
    clientEmail,
    location,
    contractAmount,
    startDate,
    endDate,
    workingDays,
    nonWorkingDates,
    services,
    phases,
    trades,
    selectedSupervisor,
    selectedWorkerIds,
  ]);

  // Force-flush on unmount or app background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current === 'active' && next !== 'active') {
        flushSave();
      }
      appStateRef.current = next;
    });
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Best-effort flush on unmount
      flushSave();
      sub?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Section status chip ----
  const sectionChip = useCallback((key) => {
    switch (key) {
      case 'basics': {
        const missing = !name.trim() || !client.trim();
        if (missing) return { kind: 'red', label: '!' };
        return { kind: 'green', label: '✓' };
      }
      case 'timeline': {
        if (!startDate || !endDate) return { kind: 'grey', label: '○' };
        return { kind: 'green', label: '✓' };
      }
      case 'phases': {
        if (phases.length === 0) return { kind: 'red', label: '!' };
        const anyNoBudget = phases.some((p) => !(parseFloat(p.budget) > 0));
        if (anyNoBudget) return { kind: 'amber', label: '⚠' };
        return { kind: 'green', label: '✓' };
      }
      case 'financial': {
        const amt = parseFloat(contractAmount) || 0;
        if (amt <= 0) return { kind: 'red', label: '!' };
        return { kind: 'green', label: '✓' };
      }
      case 'team': {
        if (!selectedSupervisor && selectedWorkerIds.length === 0) return { kind: 'grey', label: '○' };
        return { kind: 'green', label: '✓' };
      }
      case 'checklist': {
        if (checklistItems.length === 0 && laborRoles.length === 0) return { kind: 'grey', label: '○' };
        return { kind: 'green', label: '✓' };
      }
      case 'documents':
      case 'estimate':
        return { kind: 'grey', label: '○' };
      case 'review': {
        const amt = parseFloat(contractAmount) || 0;
        const allocated = phases.reduce((s, p) => s + (parseFloat(p.budget) || 0), 0);
        if (amt > 0 && allocated !== amt) return { kind: 'amber', label: '⚠' };
        return { kind: 'green', label: '✓' };
      }
      default:
        return { kind: 'grey', label: '○' };
    }
  }, [name, client, startDate, endDate, phases, contractAmount, selectedSupervisor, selectedWorkerIds, checklistItems, laborRoles]);

  const chipColor = (kind) => {
    if (kind === 'green') return { bg: '#D1FAE5', fg: '#059669' };
    if (kind === 'red') return { bg: '#FEE2E2', fg: '#DC2626' };
    if (kind === 'amber') return { bg: '#FEF3C7', fg: '#D97706' };
    return { bg: '#E5E7EB', fg: '#6B7280' };
  };

  const toggleSection = (k) => setExpandedSections((s) => ({ ...s, [k]: !s[k] }));

  // ---- Phase handlers ----
  const handleAddPhase = () => {
    setPhases((p) => [
      ...p,
      { name: `Phase ${p.length + 1}`, plannedDays: 0, budget: '', assignedWorkerId: null, tasks: [] },
    ]);
  };
  const updatePhase = (i, patch) => {
    setPhases((p) => p.map((ph, idx) => (idx === i ? { ...ph, ...patch } : ph)));
  };
  const removePhase = (i) => setPhases((p) => p.filter((_, idx) => idx !== i));
  const addTaskToPhase = (i) =>
    updatePhase(i, { tasks: [...(phases[i].tasks || []), { description: '', completed: false, status: 'not_started' }] });
  const updateTask = (pi, ti, value) => {
    const newTasks = [...(phases[pi].tasks || [])];
    newTasks[ti] = { ...newTasks[ti], description: value };
    updatePhase(pi, { tasks: newTasks });
  };
  const removeTask = (pi, ti) => {
    const newTasks = [...(phases[pi].tasks || [])];
    newTasks.splice(ti, 1);
    updatePhase(pi, { tasks: newTasks });
  };

  // ---- Services ----
  const addService = () => setServices((s) => [...s, { description: '', amount: '' }]);
  const updateService = (i, field, v) =>
    setServices((s) => s.map((x, idx) => (idx === i ? { ...x, [field]: v } : x)));
  const removeService = (i) => setServices((s) => s.filter((_, idx) => idx !== i));

  // ---- Trades ----
  const addTrade = () => setTrades((t) => [...t, { name: '', amount: '' }]);
  const updateTrade = (i, field, v) =>
    setTrades((t) => t.map((x, idx) => (idx === i ? { ...x, [field]: v } : x)));
  const removeTrade = (i) => setTrades((t) => t.filter((_, idx) => idx !== i));

  // ---- Checklist ----
  const addChecklistItem = () =>
    setChecklistItems((c) => [...c, { title: '', item_type: 'checkbox', quantity_unit: '', requires_photo: false }]);
  const updateChecklistItem = (i, field, v) =>
    setChecklistItems((c) => c.map((x, idx) => (idx === i ? { ...x, [field]: v } : x)));
  const removeChecklistItem = (i) => setChecklistItems((c) => c.filter((_, idx) => idx !== i));

  // ---- Labor roles ----
  const addLaborRole = () => setLaborRoles((r) => [...r, { role_name: '', default_quantity: 1 }]);
  const updateLaborRole = (i, field, v) =>
    setLaborRoles((r) => r.map((x, idx) => (idx === i ? { ...x, [field]: v } : x)));
  const removeLaborRole = (i) => setLaborRoles((r) => r.filter((_, idx) => idx !== i));

  // ---- Workers toggle ----
  const toggleWorker = (id) => {
    setSelectedWorkerIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  };

  // ---- Non-working dates ----
  const addNonWorkingDate = (iso) => {
    setNonWorkingDates((prev) => (prev.includes(iso) ? prev : [...prev, iso]));
  };
  const removeNonWorkingDate = (iso) => {
    setNonWorkingDates((prev) => prev.filter((d) => d !== iso));
  };

  // ---- AI Suggest (deferred to v2) ----
  const handleAISuggestChecklist = () => {
    console.log('AI suggest deferred to v2');
    Alert.alert('Coming soon', 'AI suggestions for checklist & labor roles will be available in a future update.');
  };

  // ---- Final save ----
  const runFinalSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Project name is required.');
      return;
    }
    if (!client.trim()) {
      Alert.alert('Required', 'Client name is required.');
      return;
    }
    const contract = parseFloat(contractAmount) || 0;
    if (contract <= 0) {
      Alert.alert('Required', 'Contract amount must be greater than 0.');
      return;
    }
    if (phases.length < 1) {
      Alert.alert('Required', 'At least one phase is required.');
      return;
    }
    if (startDate && endDate && toISODate(startDate) > toISODate(endDate)) {
      Alert.alert('Invalid Dates', 'Start date cannot be after end date.');
      return;
    }

    const allocated = phases.reduce((s, p) => s + (parseFloat(p.budget) || 0), 0);
    const anyUnbudgeted = phases.some((p) => !(parseFloat(p.budget) > 0));
    const mismatch = Math.abs(allocated - contract) > 0.01;

    const doSave = async () => {
      setFinalSaving(true);
      try {
        const payload = buildSavePayload('active');
        // Embed phases + checklist + labor into the payload so downstream
        // handling (saveProject → auto-seed trade budgets) sees them.
        payload.phases = buildPhasesPayload();
        payload.checklist_items = checklistItems.filter((c) => (c.title || '').trim());
        payload.labor_roles = laborRoles.filter((r) => (r.role_name || '').trim());
        const saved = await saveProject(payload);
        if (saved?.error === 'limit_reached') {
          Alert.alert('Project Limit Reached', saved.reason || 'Upgrade your plan to create more projects.');
          return;
        }
        if (!saved?.id) {
          Alert.alert('Error', 'Failed to create project. Please try again.');
          return;
        }

        // Persist checklist/labor templates if new
        try {
          const userId = await getCurrentUserId();
          if (userId && payload.checklist_items.length > 0) {
            await supabase.from('daily_checklist_templates').insert(
              payload.checklist_items.map((item, i) => ({
                project_id: saved.id,
                owner_id: userId,
                title: item.title,
                item_type: item.item_type || 'checkbox',
                quantity_unit: item.quantity_unit || null,
                requires_photo: !!item.requires_photo,
                sort_order: i,
              }))
            );
          }
          if (userId && payload.labor_roles.length > 0) {
            await supabase.from('labor_role_templates').insert(
              payload.labor_roles.map((role, i) => ({
                project_id: saved.id,
                owner_id: userId,
                role_name: role.role_name,
                default_quantity: role.default_quantity || 1,
                sort_order: i,
              }))
            );
          }
        } catch (e) {
          console.warn('[ProjectBuilder] checklist/labor insert failed', e);
        }

        // Worker assignments
        if (selectedWorkerIds.length > 0) {
          try {
            await supabase.from('project_assignments').insert(
              selectedWorkerIds.map((wId) => ({ project_id: saved.id, worker_id: wId }))
            );
          } catch (e) {
            // Likely duplicate — ignore
          }
        }

        navigation.replace('ProjectDetail', { project: saved, projectId: saved.id, isDemo: false });
      } catch (e) {
        console.error('[ProjectBuilder] final save error', e);
        Alert.alert('Error', 'Something went wrong. Please try again.');
      } finally {
        setFinalSaving(false);
      }
    };

    if (mismatch || anyUnbudgeted) {
      const msg = anyUnbudgeted
        ? 'One or more phases have no budget assigned.'
        : `Phase budgets total $${allocated.toLocaleString()} but the contract is $${contract.toLocaleString()}.`;
      Alert.alert(
        'Budget Mismatch',
        `${msg}\n\nCreate the project anyway?`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Create anyway', style: 'destructive', onPress: doSave },
        ]
      );
      return;
    }

    doSave();
  }, [
    name,
    client,
    contractAmount,
    phases,
    startDate,
    endDate,
    buildSavePayload,
    buildPhasesPayload,
    checklistItems,
    laborRoles,
    selectedWorkerIds,
    navigation,
  ]);

  // ---- Shared components ----
  const Chip = ({ chip }) => {
    const { bg, fg } = chipColor(chip.kind);
    return (
      <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 }}>
        <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{chip.label}</Text>
      </View>
    );
  };

  const SectionHeader = ({ title, icon, sectionKey }) => {
    const chip = sectionChip(sectionKey);
    return (
      <TouchableOpacity
        style={[styles.sectionHeader, { borderBottomColor: expandedSections[sectionKey] ? Colors.border : 'transparent' }]}
        onPress={() => toggleSection(sectionKey)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name={icon} size={18} color={Colors.primaryBlue} />
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{title}</Text>
          <Chip chip={chip} />
        </View>
        <Ionicons name={expandedSections[sectionKey] ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
      </TouchableOpacity>
    );
  };

  // Label row with AI badge
  const LabelRow = ({ label, required, confidence }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <Text style={[styles.label, { color: Colors.secondaryText }]}>
        {label}
        {required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
      </Text>
      {confidence === 'high' && (
        <Ionicons name="sparkles-outline" size={14} color="#7C3AED" style={{ marginLeft: 6 }} />
      )}
      {confidence === 'low' && (
        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, marginLeft: 6 }}>
          <Text style={{ color: '#D97706', fontSize: 10, fontWeight: '700' }}>Review</Text>
        </View>
      )}
    </View>
  );

  // Themed input with AI visual-state border
  const ThemedInput = ({ value, onChangeText, placeholder, keyboardType, confidence, required, multiline, autoCapitalize }) => {
    const vp = getFieldVisualProps(value, { required, confidence });
    return (
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: Colors.lightGray,
            color: Colors.primaryText,
            borderColor: Colors.border,
            borderLeftColor: vp.borderLeftColor,
            borderLeftWidth: vp.borderLeftWidth,
          },
          multiline && { minHeight: 80, textAlignVertical: 'top' },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.placeholderText}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
    );
  };

  // ---- Derived: phase budget allocation ----
  const allocatedTotal = phases.reduce((s, p) => s + (parseFloat(p.budget) || 0), 0);
  const contractTotal = parseFloat(contractAmount) || 0;
  const overAllocated = allocatedTotal > contractTotal && contractTotal > 0;

  // ===================================================================
  // RENDER
  // ===================================================================
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.primaryBlue }}>Back</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Configure Project</Text>
            <Text style={{ fontSize: 11, color: Colors.secondaryText }}>
              {autoSaveStatus === 'saving' ? 'Saving…' : autoSaveStatus === 'saved' && lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : autoSaveStatus === 'error' ? 'Save failed' : 'Draft'}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ============ 1. PROJECT BASICS ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Project Basics" icon="briefcase-outline" sectionKey="basics" />
            {expandedSections.basics && (
              <View style={styles.sectionBody}>
                <LabelRow label="Project Name" required confidence={aiConfidence.name} />
                <ThemedInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Kitchen Renovation"
                  required
                  confidence={aiConfidence.name}
                />

                <LabelRow label="Client Name" required confidence={aiConfidence.client} />
                <ThemedInput
                  value={client}
                  onChangeText={setClient}
                  placeholder="e.g. John Smith"
                  required
                  confidence={aiConfidence.client}
                />

                <LabelRow label="Client Phone" confidence={aiConfidence.clientPhone} />
                <ThemedInput
                  value={clientPhone}
                  onChangeText={setClientPhone}
                  placeholder="+1 555 123 4567"
                  keyboardType="phone-pad"
                  confidence={aiConfidence.clientPhone}
                />

                <LabelRow label="Client Email" confidence={aiConfidence.clientEmail} />
                <ThemedInput
                  value={clientEmail}
                  onChangeText={setClientEmail}
                  placeholder="client@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  confidence={aiConfidence.clientEmail}
                />

                <LabelRow label="Location" confidence={aiConfidence.location} />
                <ThemedInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Project site address"
                  confidence={aiConfidence.location}
                />
              </View>
            )}
          </View>

          {/* ============ 2. TIMELINE & WORKING DAYS ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Timeline & Working Days" icon="calendar-outline" sectionKey="timeline" />
            {expandedSections.timeline && (
              <View style={styles.sectionBody}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <LabelRow label="Start Date" confidence={aiConfidence.startDate} />
                    <TouchableOpacity
                      style={[styles.input, { justifyContent: 'center', backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
                      onPress={() => setShowStartPicker(true)}
                    >
                      <Text style={{ color: startDate ? Colors.primaryText : Colors.placeholderText }}>
                        {startDate ? formatDate(startDate) : 'Select start date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <LabelRow label="End Date" confidence={aiConfidence.endDate} />
                    <TouchableOpacity
                      style={[styles.input, { justifyContent: 'center', backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
                      onPress={() => setShowEndPicker(true)}
                    >
                      <Text style={{ color: endDate ? Colors.primaryText : Colors.placeholderText }}>
                        {endDate ? formatDate(endDate) : 'Select end date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <WorkingDaysSelector
                    selectedDays={workingDays}
                    onDaysChange={setWorkingDays}
                    label="Working Days"
                  />
                </View>

                <View style={{ marginTop: 8 }}>
                  <NonWorkingDatesManager
                    dates={nonWorkingDates}
                    onAddDate={addNonWorkingDate}
                    onRemoveDate={removeNonWorkingDate}
                  />
                </View>
              </View>
            )}
          </View>

          {/* ============ 3. PHASES ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Phases" icon="layers-outline" sectionKey="phases" />
            {expandedSections.phases && (
              <View style={styles.sectionBody}>
                {/* Allocation bar */}
                <View style={[styles.allocBar, { backgroundColor: overAllocated ? '#FEE2E2' : '#EFF6FF', borderColor: overAllocated ? '#DC2626' : Colors.primaryBlue + '30' }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: overAllocated ? '#DC2626' : Colors.primaryText }}>
                    Allocated ${allocatedTotal.toLocaleString()} / Contract ${contractTotal.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 2 }}>
                    {contractTotal > 0
                      ? `${Math.round((allocatedTotal / contractTotal) * 100)}% of contract allocated`
                      : 'Set a contract amount in the Financial section'}
                  </Text>
                </View>

                {phases.map((phase, i) => (
                  <View key={`phase-${i}`} style={[styles.phaseCard, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <TextInput
                        style={[styles.phaseName, { color: Colors.primaryText, flex: 1 }]}
                        value={phase.name}
                        onChangeText={(v) => updatePhase(i, { name: v })}
                        placeholder={`Phase ${i + 1}`}
                        placeholderTextColor={Colors.placeholderText}
                      />
                      <TouchableOpacity onPress={() => removePhase(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>Days</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                          value={String(phase.plannedDays || '')}
                          onChangeText={(v) => updatePhase(i, { plannedDays: parseInt(v, 10) || 0 })}
                          placeholder="0"
                          placeholderTextColor={Colors.placeholderText}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>Budget ($)</Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: Colors.white,
                              borderColor: Colors.border,
                              color: Colors.primaryText,
                              borderLeftColor: !(parseFloat(phase.budget) > 0) ? '#DC2626' : 'transparent',
                              borderLeftWidth: !(parseFloat(phase.budget) > 0) ? 3 : 0,
                            },
                          ]}
                          value={String(phase.budget || '')}
                          onChangeText={(v) => updatePhase(i, { budget: sanitizeNumeric(v) })}
                          placeholder="0"
                          placeholderTextColor={Colors.placeholderText}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>

                    <Text style={[styles.miniLabel, { color: Colors.secondaryText, marginTop: 8 }]}>Assigned Worker</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <TouchableOpacity
                        onPress={() => updatePhase(i, { assignedWorkerId: null })}
                        style={[styles.chipButton, { backgroundColor: !phase.assignedWorkerId ? Colors.primaryBlue : Colors.white, borderColor: Colors.border }]}
                      >
                        <Text style={{ color: !phase.assignedWorkerId ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>None</Text>
                      </TouchableOpacity>
                      {availableWorkers.map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          onPress={() => updatePhase(i, { assignedWorkerId: w.id })}
                          style={[
                            styles.chipButton,
                            {
                              backgroundColor: phase.assignedWorkerId === w.id ? Colors.primaryBlue : Colors.white,
                              borderColor: Colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: phase.assignedWorkerId === w.id ? '#fff' : Colors.primaryText,
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            {w.name || w.full_name || 'Worker'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Tasks */}
                    <View style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>Tasks</Text>
                        <TouchableOpacity onPress={() => addTaskToPhase(i)}>
                          <Text style={{ color: Colors.primaryBlue, fontSize: 12, fontWeight: '600' }}>+ Add Task</Text>
                        </TouchableOpacity>
                      </View>
                      {(phase.tasks || []).map((t, ti) => (
                        <View key={`task-${i}-${ti}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <TextInput
                            style={[styles.input, { flex: 1, backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                            value={t.description}
                            onChangeText={(v) => updateTask(i, ti, v)}
                            placeholder="Task description"
                            placeholderTextColor={Colors.placeholderText}
                          />
                          <TouchableOpacity onPress={() => removeTask(i, ti)}>
                            <Ionicons name="close-circle" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]}
                  onPress={handleAddPhase}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Phase</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ 4. FINANCIAL ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Financial" icon="cash-outline" sectionKey="financial" />
            {expandedSections.financial && (
              <View style={styles.sectionBody}>
                <LabelRow label="Contract Amount ($)" required confidence={aiConfidence.contractAmount} />
                <ThemedInput
                  value={contractAmount}
                  onChangeText={(v) => setContractAmount(sanitizeNumeric(v))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  required
                  confidence={aiConfidence.contractAmount}
                />

                <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 12 }]}>Services</Text>
                {services.map((s, i) => (
                  <View key={`svc-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <TextInput
                      style={[styles.input, { flex: 2, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={s.description}
                      onChangeText={(v) => updateService(i, 'description', v)}
                      placeholder="Service / scope item"
                      placeholderTextColor={Colors.placeholderText}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={String(s.amount || '')}
                      onChangeText={(v) => updateService(i, 'amount', sanitizeNumeric(v))}
                      placeholder="$0"
                      placeholderTextColor={Colors.placeholderText}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity onPress={() => removeService(i)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addService}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Service</Text>
                </TouchableOpacity>

                <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 16 }]}>Trade Budgets</Text>
                {trades.map((tr, i) => (
                  <View key={`trade-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <TextInput
                      style={[styles.input, { flex: 2, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={tr.name}
                      onChangeText={(v) => updateTrade(i, 'name', v)}
                      placeholder="Trade (e.g. Electrical)"
                      placeholderTextColor={Colors.placeholderText}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={String(tr.amount || '')}
                      onChangeText={(v) => updateTrade(i, 'amount', sanitizeNumeric(v))}
                      placeholder="$0"
                      placeholderTextColor={Colors.placeholderText}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity onPress={() => removeTrade(i)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addTrade}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Trade Budget</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ 5. TEAM ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Team" icon="people-outline" sectionKey="team" />
            {expandedSections.team && (
              <View style={styles.sectionBody}>
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Supervisor</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedSupervisor(null)}
                    style={[styles.chipButton, { backgroundColor: !selectedSupervisor ? Colors.primaryBlue : Colors.white, borderColor: Colors.border }]}
                  >
                    <Text style={{ color: !selectedSupervisor ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>Manage Directly</Text>
                  </TouchableOpacity>
                  {supervisors.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSelectedSupervisor(s.id)}
                      style={[
                        styles.chipButton,
                        {
                          backgroundColor: selectedSupervisor === s.id ? Colors.primaryBlue : Colors.white,
                          borderColor: Colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selectedSupervisor === s.id ? '#fff' : Colors.primaryText,
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        {s.name || s.full_name || 'Supervisor'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.label, { color: Colors.secondaryText }]}>Workers</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {availableWorkers.map((w) => {
                    const active = selectedWorkerIds.includes(w.id);
                    return (
                      <TouchableOpacity
                        key={w.id}
                        onPress={() => toggleWorker(w.id)}
                        style={[
                          styles.chipButton,
                          {
                            backgroundColor: active ? Colors.primaryBlue : Colors.white,
                            borderColor: Colors.border,
                            marginRight: 0,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? '#fff' : Colors.primaryText,
                            fontSize: 12,
                            fontWeight: '600',
                          }}
                        >
                          {w.name || w.full_name || 'Worker'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {availableWorkers.length === 0 && (
                    <Text style={{ color: Colors.secondaryText, fontStyle: 'italic', fontSize: 12 }}>
                      No workers yet — invite some from the Workers screen.
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* ============ 6. DAILY CHECKLIST & LABOR ROLES ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Daily Checklist & Labor Roles" icon="checkbox-outline" sectionKey="checklist" />
            {expandedSections.checklist && (
              <View style={styles.sectionBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.label, { color: Colors.secondaryText, marginBottom: 0 }]}>Checklist Items</Text>
                  <TouchableOpacity onPress={handleAISuggestChecklist} style={styles.aiSuggestBtn}>
                    <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
                    <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Suggest with AI</Text>
                  </TouchableOpacity>
                </View>

                {checklistItems.map((c, i) => (
                  <View key={`cl-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={c.title}
                      onChangeText={(v) => updateChecklistItem(i, 'title', v)}
                      placeholder="e.g. Site clean at end of day"
                      placeholderTextColor={Colors.placeholderText}
                    />
                    <TouchableOpacity onPress={() => removeChecklistItem(i)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addChecklistItem}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Checklist Item</Text>
                </TouchableOpacity>

                <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 16 }]}>Labor Roles</Text>
                {laborRoles.map((r, i) => (
                  <View key={`lr-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <TextInput
                      style={[styles.input, { flex: 2, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={r.role_name}
                      onChangeText={(v) => updateLaborRole(i, 'role_name', v)}
                      placeholder="Role (e.g. Carpenter)"
                      placeholderTextColor={Colors.placeholderText}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={String(r.default_quantity || '')}
                      onChangeText={(v) => updateLaborRole(i, 'default_quantity', parseInt(v, 10) || 1)}
                      placeholder="Qty"
                      placeholderTextColor={Colors.placeholderText}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity onPress={() => removeLaborRole(i)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addLaborRole}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Labor Role</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ 7. DOCUMENTS (STUB) ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Documents" icon="document-attach-outline" sectionKey="documents" />
            {expandedSections.documents && (
              <View style={styles.sectionBody}>
                <View style={[styles.emptyStub, { backgroundColor: Colors.lightGray }]}>
                  <Ionicons name="cloud-upload-outline" size={32} color={Colors.secondaryText} />
                  <Text style={{ color: Colors.primaryText, fontWeight: '600', marginTop: 6 }}>Coming soon</Text>
                  <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                    File uploads will be available in a future update.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ============ 8. LINKED ESTIMATE (STUB) ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Linked Estimate" icon="link-outline" sectionKey="estimate" />
            {expandedSections.estimate && (
              <View style={styles.sectionBody}>
                <View style={[styles.emptyStub, { backgroundColor: Colors.lightGray }]}>
                  <Ionicons name="document-text-outline" size={32} color={Colors.secondaryText} />
                  <Text style={{ color: Colors.primaryText, fontWeight: '600', marginTop: 6 }}>Coming soon</Text>
                  <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                    Estimate linking will be available in a future update.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ============ 9. REVIEW & SAVE ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Review & Save" icon="checkmark-done-outline" sectionKey="review" />
            {expandedSections.review && (
              <View style={styles.sectionBody}>
                <Text style={{ color: Colors.primaryText, fontWeight: '600', marginBottom: 8 }}>Summary</Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  • {name.trim() || '—'} for {client.trim() || '—'}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  • Contract ${contractTotal.toLocaleString()} across {phases.length} phase{phases.length === 1 ? '' : 's'}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  • Allocated ${allocatedTotal.toLocaleString()} ({contractTotal > 0 ? Math.round((allocatedTotal / contractTotal) * 100) : 0}%)
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  • Timeline {startDate ? formatDate(startDate) : '—'} → {endDate ? formatDate(endDate) : '—'}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13 }}>
                  • Team: {selectedSupervisor ? '1 supervisor' : 'managed directly'}, {selectedWorkerIds.length} worker{selectedWorkerIds.length === 1 ? '' : 's'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Sticky bottom CTA */}
        <View style={[styles.stickyFooter, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: finalSaving ? Colors.primaryBlue + '99' : Colors.primaryBlue }]}
            onPress={runFinalSave}
            disabled={finalSaving}
            activeOpacity={0.85}
          >
            {finalSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>
                  Create Project
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Date Pickers */}
        {showStartPicker && (
          <Modal transparent animationType="slide" visible={showStartPicker} onRequestClose={() => setShowStartPicker(false)}>
            <View style={styles.pickerOverlay}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowStartPicker(false)} activeOpacity={1} />
              <View style={[styles.pickerSheet, { backgroundColor: Colors.white }]}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                    <Text style={{ color: Colors.secondaryText }}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: '700', color: Colors.primaryText }}>Start Date</Text>
                  <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                    <Text style={{ color: Colors.primaryBlue, fontWeight: '700' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={fromISODate(startDate) || new Date()}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  onChange={(_e, d) => d && setStartDate(toISODate(d))}
                  accentColor="#3B82F6"
                />
              </View>
            </View>
          </Modal>
        )}

        {showEndPicker && (
          <Modal transparent animationType="slide" visible={showEndPicker} onRequestClose={() => setShowEndPicker(false)}>
            <View style={styles.pickerOverlay}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowEndPicker(false)} activeOpacity={1} />
              <View style={[styles.pickerSheet, { backgroundColor: Colors.white }]}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                    <Text style={{ color: Colors.secondaryText }}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: '700', color: Colors.primaryText }}>End Date</Text>
                  <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                    <Text style={{ color: Colors.primaryBlue, fontWeight: '700' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={fromISODate(endDate) || new Date()}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  onChange={(_e, d) => d && setEndDate(toISODate(d))}
                  accentColor="#3B82F6"
                />
              </View>
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// -------------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  section: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionBody: {
    padding: Spacing.md,
  },
  label: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.body,
    marginBottom: Spacing.sm,
  },
  addRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  allocBar: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  phaseCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    paddingVertical: 4,
  },
  chipButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  aiSuggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
  },
  emptyStub: {
    padding: 24,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
});
