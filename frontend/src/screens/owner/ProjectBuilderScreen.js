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
  Linking,
  FlatList,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { statusLabel } from '../../utils/statusLabel';
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
import { fetchEstimates, getEstimate } from '../../utils/storage/estimates';
import { countWorkingDays } from '../../utils/scheduling/distributeTasks';
import {
  pickAndUploadProjectDocument,
  fetchProjectBuilderDocuments,
  getProjectBuilderDocumentUrl,
  deleteProjectBuilderDocument,
} from '../../utils/storage/projectBuilderDocuments';
import { suggestChecklistAndLabor } from '../../utils/ai/suggestChecklistLabor';
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
    // Progress draws extracted from chat (e.g. "$200K, bill in 4 draws of 25% with 10% retainage").
    // billInDraws is on iff the agent supplied a non-empty draws list.
    // The agent emits phase_name (human label) — we keep it on the draw and
    // resolve to phase_id once phases get persisted (in handleAddDraw flow
    // or after upsertProjectPhases runs). For now, draws with phase_name
    // and trigger_type=phase_completion are stored with phase_id=null and
    // get resolved in the save flow.
    billInDraws: Array.isArray(data.draws) && data.draws.length > 0,
    retainagePercent: String(
      data.retainage_percent != null
        ? data.retainage_percent
        : data.retainagePercent != null
          ? data.retainagePercent
          : 0
    ),
    draws: Array.isArray(data.draws)
      ? data.draws.map((d, i) => {
          const trigger = d.trigger_type
            || (d.phase_name || d.phase_id ? 'phase_completion'
              : (i === 0 && /deposit|down\s*payment|signing|upfront/i.test(d.description || '')
                  ? 'project_start'
                  : 'manual'));
          return {
            description: d.description || d.name || `Draw ${i + 1}`,
            percent_of_contract:
              d.percent_of_contract != null
                ? String(d.percent_of_contract)
                : d.percent != null
                  ? String(d.percent)
                  : '',
            fixed_amount: d.fixed_amount != null ? String(d.fixed_amount) : null,
            trigger_type: trigger,
            phase_id: d.phase_id || null,
            phase_name: d.phase_name || null, // resolved → phase_id in the save flow
            status: 'pending',
          };
        })
      : [],
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
// Hoisted shared UI pieces
// -------------------------------------------------------------------------
//
// These components are intentionally defined at the module level (not inline
// inside ProjectBuilderScreen) so their component identity is stable across
// re-renders. When they were declared inside the parent function body every
// state update created a brand-new component type — which caused React to
// unmount and remount any TextInput they rendered, dismissing the keyboard
// on every keystroke. Any values that used to come from closure (Colors,
// style helpers, section status) are now passed in as props.

const chipColorFor = (kind) => {
  if (kind === 'green') return { bg: '#D1FAE5', fg: '#059669' };
  if (kind === 'red') return { bg: '#FEE2E2', fg: '#DC2626' };
  if (kind === 'amber') return { bg: '#FEF3C7', fg: '#D97706' };
  return { bg: '#E5E7EB', fg: '#6B7280' };
};

const Chip = ({ chip }) => {
  const { bg, fg } = chipColorFor(chip.kind);
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{chip.label}</Text>
    </View>
  );
};

const SectionHeader = ({ title, icon, sectionKey, expanded, chip, onToggle, Colors }) => {
  return (
    <TouchableOpacity
      style={[styles.sectionHeader, { borderBottomColor: expanded ? Colors.border : 'transparent' }]}
      onPress={() => onToggle(sectionKey)}
      activeOpacity={0.7}
      testID={`projectBuilder.section.${sectionKey}`}
      accessibilityLabel={`${title} section`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Ionicons name={icon} size={18} color={Colors.primaryBlue} />
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{title}</Text>
        <Chip chip={chip} />
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
    </TouchableOpacity>
  );
};

const LabelRow = ({ label, required, confidence, Colors }) => {
  const { t } = useTranslation('owner');
  return (
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
        <Text style={{ color: '#D97706', fontSize: 10, fontWeight: '700' }}>{t('projectBuilder.review')}</Text>
      </View>
    )}
  </View>
  );
};

const ThemedInput = ({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  confidence,
  required,
  multiline,
  autoCapitalize,
  Colors,
  testID,
  accessibilityLabel,
}) => {
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
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
};

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export default function ProjectBuilderScreen({ navigation, route }) {
  const { t } = useTranslation('owner');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const chatExtractedData = route?.params?.chatExtractedData || null;
  const initialProjectId = route?.params?.projectId || null;
  // When a client accepts an estimate, the BillingCard's "Set up draws" button
  // routes here with fromEstimateId so the builder pre-fills name/budget/scope
  // and links the estimate when the project saves. Also tells the user to scroll
  // to the Draws section (we can't auto-scroll without a ref, but we open it
  // expanded by default below).
  const fromEstimateId = route?.params?.fromEstimateId || null;

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
  // Progress draws (optional billing structure for larger jobs).
  // billInDraws toggles the section; draws is the editable list.
  // Pre-populated from chat extraction when present.
  const [billInDraws, setBillInDraws] = useState(!!initial.billInDraws);
  const [retainagePercent, setRetainagePercent] = useState(initial.retainagePercent || '0');
  const [draws, setDraws] = useState(initial.draws || []);
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

  // Linked estimate
  const [linkedEstimateId, setLinkedEstimateId] = useState(null);
  const [linkedEstimate, setLinkedEstimate] = useState(null);
  const [estimatePickerVisible, setEstimatePickerVisible] = useState(false);
  const [estimatesList, setEstimatesList] = useState([]);
  const [estimatesLoading, setEstimatesLoading] = useState(false);
  const [estimateSearch, setEstimateSearch] = useState('');

  // Documents
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // AI Suggest
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [aiSuggestError, setAiSuggestError] = useState(null);
  const [aiSuggestMode, setAiSuggestMode] = useState('append'); // 'append' | 'replace'
  const [aiHighlightUntil, setAiHighlightUntil] = useState({ checklist: 0, labor: 0 });

  // Team rosters
  const [supervisors, setSupervisors] = useState([]);
  const [availableWorkers, setAvailableWorkers] = useState([]);

  // UI state — when arriving from an accepted estimate via "Set up draws",
  // pre-expand the Draws section so the owner lands on the right step.
  const [expandedSections, setExpandedSections] = useState({
    basics: true,
    timeline: false,
    phases: false,
    draws: !!fromEstimateId,
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
  // Tracks the last timeline snapshot we rebalanced against so we only
  // rescale phase days when the user actually changes start/end/working
  // days (not on initial mount or data load).
  const timelineRebalanceRef = useRef({ startDate: null, endDate: null, workingDays: null, nonWorkingDates: null, initialized: false });
  // In-flight guard so overlapping autosaves can't race each other.
  // pendingSaveRef records whether new edits arrived while a save was in
  // flight — if so, flushSave re-runs itself once the current save
  // completes, guaranteeing the last keystroke reaches the DB.
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  // Ref-mirror for flushSave: the AppState/unmount effect below has [] deps
  // and would otherwise capture the very first flushSave closure (which
  // references initial-render state). We keep this ref pointed at the
  // latest flushSave so background/unmount always flushes current values.
  const flushSaveRef = useRef(null);
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

  // ---- From-estimate mode: pre-fill from an accepted estimate ----
  // Owner taps "Set up draws" on an accepted estimate → routes here with
  // fromEstimateId. We pre-fill name/budget/dates/scope/phases from the
  // estimate, then enable billInDraws so the section is ready to populate.
  useEffect(() => {
    if (!fromEstimateId || initialProjectId) return; // skip if resuming a saved project
    (async () => {
      try {
        const est = await getEstimate(fromEstimateId);
        if (!est) return;
        // Stash estimate data so we can link it on save + pre-fill the form
        setLinkedEstimateId(est.id);
        setLinkedEstimate(est);
        setName(est.project_name || est.client_name || '');
        setClient(est.client_name || '');
        setClientPhone(est.client_phone || '');
        setClientEmail(est.client_email || '');
        setLocation(est.client_address || '');
        setContractAmount(String(est.total || ''));
        // Pre-fill phases from estimate
        if (Array.isArray(est.phases) && est.phases.length > 0) {
          setPhases(est.phases.map((p, i) => ({
            name: p.name || t('projectBuilder.phaseNumber', { number: i + 1 }),
            plannedDays: p.plannedDays || p.planned_days || 0,
            budget: String(p.budget || ''),
            assignedWorkerId: p.assignedWorkerId || null,
            tasks: Array.isArray(p.tasks)
              ? p.tasks.map(t => ({
                  description: typeof t === 'string' ? t : t.description || '',
                  completed: false, status: 'not_started',
                }))
              : [],
          })));
        }
        // Schedule
        if (est.schedule?.startDate) setStartDate(est.schedule.startDate);
        if (est.schedule?.estimatedEndDate) setEndDate(est.schedule.estimatedEndDate);
        // Default to billing in draws since that's the whole reason the owner
        // went down this path. Owner can flip it off if they change their mind.
        setBillInDraws(true);
      } catch (e) {
        console.warn('[ProjectBuilder] failed to load estimate:', e?.message);
      }
    })();
  }, [fromEstimateId, initialProjectId]);

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

        if (proj.linkedEstimateId) {
          setLinkedEstimateId(proj.linkedEstimateId);
          try {
            const est = await getEstimate(proj.linkedEstimateId);
            if (est) setLinkedEstimate(est);
          } catch (_) {}
        }

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

        // Hydrate any saved draw schedule
        try {
          const { fetchDrawSchedule } = await import('../../utils/storage/projectDraws');
          const drawData = await fetchDrawSchedule(initialProjectId);
          if (drawData?.schedule) {
            setBillInDraws(true);
            setRetainagePercent(String(drawData.schedule.retainage_percent ?? 0));
            setDraws(
              (drawData.items || []).map((it) => ({
                id: it.id,
                description: it.description,
                percent_of_contract: it.percent_of_contract != null ? String(it.percent_of_contract) : '',
                fixed_amount: it.fixed_amount != null ? String(it.fixed_amount) : '',
                phase_id: it.phase_id || null,
                status: it.status,
                invoice_number: it.invoice?.invoice_number || null,
              }))
            );
          }
        } catch (e) {
          console.warn('[ProjectBuilder] draw schedule load failed', e);
        }
      } catch (e) {
        console.warn('[ProjectBuilder] resume load failed', e);
      }
    })();
  }, [initialProjectId]);

  // ---- Rebalance phase days when timeline changes ----
  // If the user changes start/end date, working days, or non-working dates
  // in the Timeline section, rescale each phase's plannedDays so the sum
  // matches the new total working days while preserving the relative ratios
  // the user (or AI) previously set. Skips the first run so loading an
  // existing project doesn't rewrite persisted phase durations.
  useEffect(() => {
    const ref = timelineRebalanceRef.current;
    // First pass: snapshot the initial timeline and bail — we only rebalance
    // on subsequent user-driven changes.
    if (!ref.initialized) {
      ref.startDate = startDate;
      ref.endDate = endDate;
      ref.workingDays = workingDays;
      ref.nonWorkingDates = nonWorkingDates;
      ref.initialized = true;
      return;
    }
    // Bail if timeline signals aren't meaningful yet.
    if (!startDate || !endDate) return;
    if (phases.length === 0) return;

    // Detect a real change vs. unrelated renders.
    const sameStart = ref.startDate === startDate;
    const sameEnd = ref.endDate === endDate;
    const sameWD = JSON.stringify(ref.workingDays) === JSON.stringify(workingDays);
    const sameNWD = JSON.stringify(ref.nonWorkingDates) === JSON.stringify(nonWorkingDates);
    if (sameStart && sameEnd && sameWD && sameNWD) return;

    const newTotal = countWorkingDays(startDate, endDate, workingDays, nonWorkingDates);
    if (!Number.isFinite(newTotal) || newTotal <= 0) {
      // Update ref so we don't loop, but don't scale to 0.
      ref.startDate = startDate;
      ref.endDate = endDate;
      ref.workingDays = workingDays;
      ref.nonWorkingDates = nonWorkingDates;
      return;
    }

    setPhases((prev) => {
      const currentSum = prev.reduce((s, p) => s + (parseInt(p.plannedDays, 10) || 0), 0);
      // If no phase has a duration yet, split the new total evenly so something
      // sensible lands in each row.
      if (currentSum <= 0) {
        const base = Math.floor(newTotal / prev.length);
        const extra = newTotal - base * prev.length;
        return prev.map((p, i) => ({ ...p, plannedDays: base + (i < extra ? 1 : 0) }));
      }
      // Proportional scale. Round each, then fix drift on the last phase so
      // the sum matches newTotal exactly.
      const scaled = prev.map((p) => {
        const days = parseInt(p.plannedDays, 10) || 0;
        return Math.max(1, Math.round((days / currentSum) * newTotal));
      });
      const drift = newTotal - scaled.reduce((s, n) => s + n, 0);
      if (drift !== 0 && scaled.length > 0) {
        scaled[scaled.length - 1] = Math.max(1, scaled[scaled.length - 1] + drift);
      }
      return prev.map((p, i) => ({ ...p, plannedDays: scaled[i] }));
    });

    ref.startDate = startDate;
    ref.endDate = endDate;
    ref.workingDays = workingDays;
    ref.nonWorkingDates = nonWorkingDates;
  }, [startDate, endDate, workingDays, nonWorkingDates, phases.length]);

  // ---- Create draft on mount if no projectId ----
  // Resumes an existing in-progress draft for the same name+client when one
  // exists (within the last 24h). Without this, every "Configure Details" tap
  // from the chat preview created a brand-new draft row, leaving Projects
  // littered with duplicate drafts (4 of "John Smith Bathroom Remodel" in one
  // night). The resume window is wide enough to catch a same-day relaunch
  // but tight enough that a long-abandoned draft from last week doesn't get
  // hijacked by an unrelated new chat about a different project of the same
  // name.
  // Auto-draft creation is intentionally disabled. The builder no longer
  // persists a project until the user explicitly taps Create Project at the
  // bottom — this prevents orphan drafts in the Projects list when someone
  // opens "Configure Details" from chat and then taps Back without confirming.
  // The deduplication / resume-existing-draft logic that used to live here
  // moved to a no-op; if we ever want crash-safety back, store form state in
  // AsyncStorage instead of writing to the projects table.
  // (Auto-draft creation deliberately removed. The project is only persisted
  // when the user taps Create Project at the bottom — no orphan rows when
  // someone opens Configure Details from chat and taps Back.)

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
      linkedEstimateId: linkedEstimateId || null,
      // Include checklist + labor in every draft save so users don't lose
      // typed items when they background the app mid-build.
      checklist_items: checklistItems
        .filter((c) => (c.title || '').trim())
        .map((c) => ({
          title: c.title.trim(),
          item_type: c.item_type || 'checkbox',
          quantity_unit: c.quantity_unit || null,
          requires_photo: !!c.requires_photo,
        })),
      labor_roles: laborRoles
        .filter((r) => (r.role_name || '').trim())
        .map((r) => ({
          role_name: r.role_name.trim(),
          default_quantity: Math.max(1, parseInt(r.default_quantity, 10) || 1),
        })),
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
    linkedEstimateId,
    checklistItems,
    laborRoles,
  ]);

  const buildPhasesPayload = useCallback(() => {
    return phases.map((p, i) => ({
      id: p.id,
      name: (p.name || '').trim() || t('projectBuilder.phaseNumber', { number: i + 1 }),
      plannedDays: parseInt(p.plannedDays, 10) || 0,
      budget: parseFloat(p.budget) || 0,
      order: i,
      order_index: typeof p.order_index === 'number' ? p.order_index : i,
      assignedWorkerId: p.assignedWorkerId || null,
      services: Array.isArray(p.services) ? p.services : [],
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

  const buildDrawsPayload = useCallback(() => {
    if (!billInDraws) return { enabled: false, items: [] };
    return {
      enabled: true,
      retainage_percent: parseFloat(retainagePercent) || 0,
      // Only persist rows that have a description AND either a real percent
      // or a real fixed amount. In-progress rows the user is still typing
      // don't generate validation errors during autosave.
      items: draws
        .map((d) => {
          const pct = d.percent_of_contract;
          const fixed = d.fixed_amount;
          const hasPct = pct !== '' && pct != null && !Number.isNaN(parseFloat(pct)) && parseFloat(pct) > 0;
          const hasFixed = fixed !== '' && fixed != null && !Number.isNaN(parseFloat(fixed)) && parseFloat(fixed) > 0;
          // Default trigger_type if missing: phase_completion when a phase
          // is linked, otherwise manual. Avoid surfacing this drift to the
          // user — the picker keeps it explicit going forward.
          const trigger = d.trigger_type
            || (d.phase_id || typeof d.phase_order_index === 'number' ? 'phase_completion' : 'manual');
          // Resolve phase_id at save time. The draw may be linked by
          // order_index (new-project flow) before its phase has a real UUID —
          // map it through the current phases array so the link persists once
          // phases are saved. Falls back to any already-resolved phase_id.
          let resolvedPhaseId = d.phase_id || null;
          if (!resolvedPhaseId && typeof d.phase_order_index === 'number') {
            const p = phases[d.phase_order_index];
            if (p && p.id && typeof p.id === 'string' && !String(p.id).startsWith('draft-')) {
              resolvedPhaseId = p.id;
            }
          }
          return {
            id: d.id || undefined,
            description: (d.description || '').trim(),
            percent_of_contract: hasPct ? parseFloat(pct) : null,
            fixed_amount: hasFixed ? parseFloat(fixed) : null,
            // Only attach phase_id when it's actually used.
            phase_id: trigger === 'phase_completion' ? resolvedPhaseId : null,
            trigger_type: trigger,
            _hasValue: hasPct || hasFixed,
            // Persist phase_completion draws only once a real phase_id exists.
            // Before that (phase not yet saved) the row is held back; the
            // resolution effect + next autosave land it automatically.
            _validTrigger: trigger !== 'phase_completion' || !!resolvedPhaseId,
          };
        })
        .filter((d) => d.description && d._hasValue && d._validTrigger)
        .map(({ _hasValue, _validTrigger, ...row }) => row),
    };
  }, [billInDraws, retainagePercent, draws, phases]);

  // After phases get persisted (and gain real UUIDs), resolve any draws that
  // are linked by phase_name (chat extraction) or phase_order_index (the
  // per-draw picker in the new-project flow) but don't yet have a phase_id.
  // Also re-runs when the user renames a phase so the link stays attached.
  const isRealPhaseId = (id) => id && typeof id === 'string' && !String(id).startsWith('draft-');
  // Find the persisted phase a draw should resolve to: prefer order_index
  // (explicit picker choice), fall back to phase_name (chat extraction).
  const resolvePhaseForDraw = useCallback(
    (d) => {
      if (typeof d.phase_order_index === 'number') {
        const p = phases[d.phase_order_index];
        if (p && isRealPhaseId(p.id)) return p;
      }
      if (d.phase_name) {
        return phases.find(
          (p) => isRealPhaseId(p.id) && p.name && p.name.toLowerCase() === d.phase_name.toLowerCase()
        );
      }
      return null;
    },
    [phases]
  );
  useEffect(() => {
    if (!billInDraws || draws.length === 0) return;
    const resolvable = draws.some(
      (d) => d.trigger_type === 'phase_completion' && !d.phase_id && !!resolvePhaseForDraw(d)
    );
    if (!resolvable) return;
    setDraws((prev) =>
      prev.map((d) => {
        if (d.trigger_type !== 'phase_completion' || d.phase_id) return d;
        const match = resolvePhaseForDraw(d);
        return match ? { ...d, phase_id: match.id, phase_name: null } : d;
      })
    );
  }, [phases, billInDraws, draws, resolvePhaseForDraw]);

  // Draw row helpers (mirror handleAddPhase / updatePhase / removePhase).
  // New rows start in % mode with empty values so the user can tap and type
  // (no leading 0 to delete first).
  // Smart defaults for trigger_type:
  //   - first draw on a fresh project → project_start (deposit pattern)
  //   - subsequent draws → phase_completion + auto-pick the next phase
  //     that nothing else is linked to, so there's always a real signal
  const handleAddDraw = useCallback(() => {
    setDraws((prev) => {
      const isFirst = prev.length === 0;
      // Auto-pick the next phase nothing else is linked to. Link by
      // order_index so this works before phases are persisted (new-project
      // flow); phase_id resolves at save time if a real UUID exists yet.
      const takenIdx = new Set(
        prev.map((d) => (typeof d.phase_order_index === 'number' ? d.phase_order_index : null)).filter((x) => x != null)
      );
      const nextIdx = phases.findIndex((_p, idx) => !takenIdx.has(idx));
      const hasPhase = !isFirst && nextIdx >= 0;
      const chosenPhase = hasPhase ? phases[nextIdx] : null;
      const triggerType = isFirst ? 'project_start' : (hasPhase ? 'phase_completion' : 'manual');
      return [
        ...prev,
        {
          description: isFirst ? t('projectBuilder.depositAtSigning') : '',
          percent_of_contract: '',
          fixed_amount: null,
          trigger_type: triggerType,
          phase_order_index: triggerType === 'phase_completion' ? nextIdx : null,
          phase_id:
            triggerType === 'phase_completion' &&
            chosenPhase && chosenPhase.id && !String(chosenPhase.id).startsWith('draft-')
              ? chosenPhase.id
              : null,
          status: 'pending',
        },
      ];
    });
  }, [phases]);
  const updateDraw = useCallback((index, patch) => {
    setDraws((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }, []);
  const removeDraw = useCallback((index) => {
    setDraws((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const flushSave = useCallback(async () => {
    if (!projectIdRef.current) return;
    // In-flight guard: if an earlier flushSave is still awaiting Supabase,
    // flag that a follow-up is needed and bail. The finally block below
    // picks that flag up and re-runs, so the newest edits always land.
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    let hadError = false;
    try {
      setAutoSaveStatus('saving');
      const payload = buildSavePayload('draft');
      // Attach phases to the main save so saveProject's upsertProjectPhases
      // path runs. Using the non-destructive upsert there means a failed phase
      // save won't wipe previously-persisted phases.
      payload.phases = buildPhasesPayload();
      payload.draws = buildDrawsPayload();
      const saved = await saveProject(payload);
      if (saved === null) {
        hadError = true;
      } else if (saved?.id) {
        if (mountedRef.current) {
          setProjectId(saved.id);
          projectIdRef.current = saved.id;
        }
        if (saved.phaseSaveOk === false) hadError = true;
      }
      // After saveProject persists phases (via upsert), re-pull the real UUIDs
      // so subsequent autosaves don't re-insert draft rows. We ask upsert
      // directly here with an empty phase set — it just returns the live
      // project_phases snapshot used for syncing.
      const phasePayload = buildPhasesPayload();
      if (phasePayload.length > 0 && projectIdRef.current && mountedRef.current) {
        try {
          const result = await upsertProjectPhases(projectIdRef.current, phasePayload, {
            startDate: toISODate(startDate),
            endDate: toISODate(endDate),
            workingDays,
          });
          if (result && Array.isArray(result.phases)) {
            const returned = result.phases;
            setPhases((prev) =>
              prev.map((p, i) => {
                if (p.id && typeof p.id === 'string' && !p.id.startsWith('draft-')) {
                  return p;
                }
                const idx = typeof p.order_index === 'number' ? p.order_index : i;
                const matched = returned.find((rp) => rp.order_index === idx);
                return matched ? { ...p, id: matched.id } : p;
              })
            );
          }
          if (result === false || (result && result.ok === false)) hadError = true;
        } catch (phaseErr) {
          console.warn('[ProjectBuilder] upsertProjectPhases failed', phaseErr);
          hadError = true;
        }
      }
      if (mountedRef.current) {
        if (hadError) {
          setAutoSaveStatus('error');
        } else {
          setAutoSaveStatus('saved');
          setLastSavedAt(new Date());
        }
      }
    } catch (e) {
      console.warn('[ProjectBuilder] auto-save failed', e);
      if (mountedRef.current) setAutoSaveStatus('error');
    } finally {
      savingRef.current = false;
      // If edits arrived while we were saving, run once more so the last
      // keystroke isn't silently dropped. Runs even if the component has
      // unmounted — the write still matters, the UI just won't observe it.
      // Uses flushSaveRef to avoid a stale closure if flushSave has been
      // recreated since we started.
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => flushSaveRef.current?.(), 0);
      }
    }
  }, [buildSavePayload, buildPhasesPayload, buildDrawsPayload, startDate, endDate, workingDays]);

  // Keep the mirror ref pointed at the latest flushSave. The AppState/unmount
  // effect below runs with [] deps so without this it would call the very
  // first flushSave — which closes over initial state, overwriting newer
  // edits with stale data on background.
  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  // Schedule a debounced save on every state change. Includes `projectId` in
  // the dep list so the first save gets scheduled the moment the draft row
  // is created — otherwise keystrokes typed before the async draft-create
  // resolves would never reach the DB (effect wouldn't re-fire because none
  // of the tracked fields changed when projectId transitioned null → uuid).
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
    projectId,
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
    linkedEstimateId,
    checklistItems,
    laborRoles,
    billInDraws,
    retainagePercent,
    draws,
  ]);

  // Force-flush on unmount or app background.
  // NOTE: This effect deliberately has empty deps so it subscribes once. We
  // therefore call flushSaveRef.current() rather than flushSave directly —
  // otherwise the handler would keep firing the stale first-render closure
  // and overwrite newer edits with initial state values.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current === 'active' && next !== 'active') {
        flushSaveRef.current?.();
      }
      appStateRef.current = next;
    });
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Best-effort flush on unmount using the latest flushSave
      flushSaveRef.current?.();
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
        const amt = parseFloat(contractAmount) || 0;
        if (amt <= 0) return { kind: 'red', label: '!' };
        const anyNoBudget = phases.some((p) => !(parseFloat(p.budget) > 0));
        if (anyNoBudget) return { kind: 'amber', label: '⚠' };
        return { kind: 'green', label: '✓' };
      }
      case 'draws': {
        if (!billInDraws) return { kind: 'grey', label: '○' };
        if (draws.length === 0) return { kind: 'red', label: '!' };
        const anyEmpty = draws.some(
          (d) => !(d.description || '').trim() ||
            (
              !(parseFloat(d.percent_of_contract) > 0) &&
              !(parseFloat(d.fixed_amount) > 0)
            )
        );
        if (anyEmpty) return { kind: 'amber', label: '⚠' };
        // Trigger must be valid: phase_completion needs a phase, others don't.
        // A phase is "linked" via a resolved phase_id OR via phase_order_index
        // pointing at an existing phase (new-project flow, pre-persist).
        const anyBadTrigger = draws.some((d) => {
          const t = d.trigger_type || (d.phase_id || typeof d.phase_order_index === 'number' ? 'phase_completion' : 'manual');
          if (t !== 'phase_completion') return false;
          const linked = !!d.phase_id || (typeof d.phase_order_index === 'number' && !!phases[d.phase_order_index]);
          return !linked;
        });
        if (anyBadTrigger) return { kind: 'amber', label: '⚠' };
        const pctSum = draws
          .filter((d) => d.percent_of_contract !== '' && d.percent_of_contract != null)
          .reduce((s, d) => s + (parseFloat(d.percent_of_contract) || 0), 0);
        // % rows must total 100 if there are any. Mixed (% + fixed) is allowed.
        if (pctSum > 0 && Math.abs(pctSum - 100) > 0.01) return { kind: 'amber', label: '⚠' };
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
        if (documents.length > 0) return { kind: 'green', label: `${documents.length}` };
        return { kind: 'grey', label: '○' };
      case 'estimate':
        if (linkedEstimateId) return { kind: 'green', label: '✓' };
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
  }, [name, client, startDate, endDate, phases, contractAmount, selectedSupervisor, selectedWorkerIds, checklistItems, laborRoles, documents.length, linkedEstimateId, billInDraws, draws]);

  const toggleSection = useCallback(
    (k) => setExpandedSections((s) => ({ ...s, [k]: !s[k] })),
    []
  );

  // ---- Phase handlers ----
  const handleAddPhase = () => {
    setPhases((p) => [
      ...p,
      { name: t('projectBuilder.phaseNumber', { number: p.length + 1 }), plannedDays: 0, budget: '', assignedWorkerId: null, tasks: [] },
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

  // ---- AI Suggest ----
  const handleAISuggestChecklist = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert(t('projectBuilder.projectNameNeededTitle'), t('projectBuilder.projectNameNeededBody'));
      return;
    }
    setAiSuggestError(null);
    setAiSuggestLoading(true);
    try {
      const result = await suggestChecklistAndLabor({
        projectName: name.trim(),
        services: services.filter(s => (s.description || '').trim()),
        phases: phases.map(p => ({ name: p.name, tasks: p.tasks || [] })),
      });
      if (result.error) {
        setAiSuggestError(result.error);
        return;
      }

      const newChecklist = (result.checklist_items || []).map(c => ({
        title: c.title || '',
        item_type: c.item_type === 'quantity' ? 'quantity' : 'checkbox',
        quantity_unit: c.quantity_unit || '',
        requires_photo: !!c.requires_photo,
      }));
      const newLabor = (result.labor_roles || []).map(r => ({
        role_name: r.role_name || '',
        default_quantity: r.default_quantity || 1,
      }));

      const dedupe = (existing, incoming, key) => {
        const seen = new Set(existing.map(x => String(x[key] || '').trim().toLowerCase()));
        return incoming.filter(x => {
          const k = String(x[key] || '').trim().toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };

      if (aiSuggestMode === 'replace') {
        setChecklistItems(newChecklist);
        setLaborRoles(newLabor);
      } else {
        const cl = dedupe(checklistItems, newChecklist, 'title');
        const lr = dedupe(laborRoles, newLabor, 'role_name');
        setChecklistItems(prev => [...prev, ...cl]);
        setLaborRoles(prev => [...prev, ...lr]);
      }
      const expiry = Date.now() + 3000;
      setAiHighlightUntil({ checklist: expiry, labor: expiry });
      setTimeout(() => setAiHighlightUntil({ checklist: 0, labor: 0 }), 3100);
    } catch (e) {
      setAiSuggestError(e.message || t('projectBuilder.failedFetchSuggestions'));
    } finally {
      setAiSuggestLoading(false);
    }
  }, [name, services, phases, checklistItems, laborRoles, aiSuggestMode]);

  // ---- Documents ----
  const reloadDocuments = useCallback(async () => {
    if (!projectIdRef.current) return;
    setDocumentsLoading(true);
    try {
      const docs = await fetchProjectBuilderDocuments(projectIdRef.current);
      if (mountedRef.current) setDocuments(docs);
    } finally {
      if (mountedRef.current) setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectId && expandedSections.documents) {
      reloadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, expandedSections.documents]);

  const handleUploadDocument = useCallback(async () => {
    if (!projectIdRef.current) {
      Alert.alert(t('projectBuilder.saveFirstTitle'), t('projectBuilder.saveFirstBody'));
      return;
    }
    setUploadingDoc(true);
    try {
      const result = await pickAndUploadProjectDocument(projectIdRef.current);
      if (result?.canceled) return;
      if (result?.error) {
        Alert.alert(t('projectBuilder.uploadFailedTitle'), result.error);
        return;
      }
      if (result?.success) {
        await reloadDocuments();
      }
    } finally {
      if (mountedRef.current) setUploadingDoc(false);
    }
  }, [reloadDocuments]);

  const handleOpenDocument = useCallback(async (doc) => {
    if (!doc?.file_url) return;
    const url = await getProjectBuilderDocumentUrl(doc.id);
    if (!url) {
      Alert.alert(t('projectBuilder.couldNotOpenTitle'), t('projectBuilder.couldNotOpenLinkBody'));
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(t('projectBuilder.couldNotOpenTitle'), t('projectBuilder.couldNotOpenAppBody'));
    }
  }, []);

  const handleDeleteDocument = useCallback((doc) => {
    Alert.alert(t('projectBuilder.deleteDocumentTitle'), doc.file_name, [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      {
        text: t('common:buttons.delete'),
        style: 'destructive',
        onPress: async () => {
          const result = await deleteProjectBuilderDocument(doc.id);
          if (result?.error) {
            Alert.alert(t('projectBuilder.deleteFailedTitle'), result.error);
            return;
          }
          await reloadDocuments();
        },
      },
    ]);
  }, [reloadDocuments]);

  // ---- Linked Estimate ----
  const openEstimatePicker = useCallback(async () => {
    setEstimatePickerVisible(true);
    setEstimatesLoading(true);
    try {
      const list = await fetchEstimates();
      const statusOrder = { accepted: 0, sent: 1, draft: 2, rejected: 3 };
      const sorted = (list || []).slice().sort((a, b) => {
        const sa = statusOrder[a.status] ?? 9;
        const sb = statusOrder[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      setEstimatesList(sorted);
    } finally {
      setEstimatesLoading(false);
    }
  }, []);

  const handlePickEstimate = useCallback(async (est) => {
    setLinkedEstimateId(est.id);
    setLinkedEstimate(est);
    setEstimatePickerVisible(false);
  }, []);

  const handleUnlinkEstimate = useCallback(() => {
    Alert.alert(t('projectBuilder.unlinkEstimateTitle'), t('projectBuilder.unlinkEstimateBody'), [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      {
        text: t('projectBuilder.unlink'),
        style: 'destructive',
        onPress: () => {
          setLinkedEstimateId(null);
          setLinkedEstimate(null);
        },
      },
    ]);
  }, []);

  const filteredEstimates = useMemo(() => {
    const q = estimateSearch.trim().toLowerCase();
    if (!q) return estimatesList;
    return estimatesList.filter(e =>
      String(e.client_name || '').toLowerCase().includes(q) ||
      String(e.project_name || '').toLowerCase().includes(q) ||
      String(e.estimate_number || '').toLowerCase().includes(q)
    );
  }, [estimatesList, estimateSearch]);

  // ---- Final save ----
  const runFinalSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert(t('common:alerts.required'), t('projectBuilder.projectNameRequired'));
      return;
    }
    if (!client.trim()) {
      Alert.alert(t('common:alerts.required'), t('projectBuilder.clientNameRequired'));
      return;
    }
    const contract = parseFloat(contractAmount) || 0;
    if (contract <= 0) {
      Alert.alert(t('common:alerts.required'), t('projectBuilder.contractAmountRequired'));
      return;
    }
    if (phases.length < 1) {
      Alert.alert(t('common:alerts.required'), t('projectBuilder.atLeastOnePhaseRequired'));
      return;
    }
    if (startDate && endDate && toISODate(startDate) > toISODate(endDate)) {
      Alert.alert(t('projectBuilder.invalidDatesTitle'), t('projectBuilder.invalidDatesBody'));
      return;
    }

    const allocated = phases.reduce((s, p) => s + (parseFloat(p.budget) || 0), 0);
    const anyUnbudgeted = phases.some((p) => !(parseFloat(p.budget) > 0));
    const mismatch = Math.abs(allocated - contract) > 0.01;

    const doSave = async () => {
      setFinalSaving(true);
      try {
        // Flush any pending debounce first so nothing stale races the final save.
        await flushSaveRef.current?.();

        const payload = buildSavePayload('active');
        payload.phases = buildPhasesPayload();
        payload.draws = buildDrawsPayload();
        // saveProject now handles checklist_items + labor_roles directly.
        const saved = await saveProject(payload);
        if (saved?.error === 'limit_reached') {
          Alert.alert(t('projectBuilder.projectLimitReachedTitle'), saved.reason || t('projectBuilder.projectLimitReachedBody'));
          return;
        }
        if (!saved?.id) {
          Alert.alert(
            t('projectBuilder.saveFailedTitle'),
            t('projectBuilder.saveFailedCreateBody'),
          );
          return;
        }

        // Worker assignments (best-effort; duplicates are expected if autosave already wrote them)
        if (selectedWorkerIds.length > 0) {
          try {
            await supabase.from('project_assignments').insert(
              selectedWorkerIds.map((wId) => ({ project_id: saved.id, worker_id: wId }))
            );
          } catch (e) {
            // Likely duplicate — ignore
          }
        }

        // Back-link estimate → project so it shows in this project's BillingCard.
        // Also bumps status to 'accepted' if it wasn't already (sometimes the
        // owner sets up the project before the client formally clicked Accept).
        if (linkedEstimateId) {
          try {
            await supabase
              .from('estimates')
              .update({
                project_id: saved.id,
                status: 'accepted',
                accepted_date: new Date().toISOString(),
              })
              .eq('id', linkedEstimateId)
              .neq('status', 'accepted'); // don't overwrite the real accepted_date
            // If it was already accepted, just back-link without touching status
            await supabase
              .from('estimates')
              .update({ project_id: saved.id })
              .eq('id', linkedEstimateId)
              .is('project_id', null);
          } catch (e) {
            console.warn('[ProjectBuilder] back-link estimate failed:', e?.message);
          }
        }

        // Graceful partial success: if phases didn't all save, still navigate
        // but tell the user so they can retry from Edit Project.
        if (saved.phaseSaveOk === false) {
          Alert.alert(
            t('projectBuilder.projectCreatedTitle'),
            t('projectBuilder.somePhasesFailedBody'),
            [
              {
                text: t('common:buttons.ok'),
                onPress: () =>
                  navigation.replace('ProjectDetail', { project: saved, projectId: saved.id, isDemo: false }),
              },
            ]
          );
          return;
        }

        navigation.replace('ProjectDetail', { project: saved, projectId: saved.id, isDemo: false });
      } catch (e) {
        console.error('[ProjectBuilder] final save error', e);
        Alert.alert(
          t('projectBuilder.saveFailedTitle'),
          t('projectBuilder.saveFailedGenericBody'),
        );
      } finally {
        setFinalSaving(false);
      }
    };

    if (mismatch || anyUnbudgeted) {
      const msg = anyUnbudgeted
        ? t('projectBuilder.phasesNoBudget')
        : t('projectBuilder.budgetMismatchDetail', { allocated: allocated.toLocaleString('en-US'), contract: contract.toLocaleString('en-US') });
      Alert.alert(
        t('projectBuilder.budgetMismatchTitle'),
        `${msg}\n\n${t('projectBuilder.createAnywayPrompt')}`,
        [
          { text: t('projectBuilder.goBack'), style: 'cancel' },
          { text: t('projectBuilder.createAnyway'), style: 'destructive', onPress: doSave },
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
          <TouchableOpacity onPress={() => navigation.goBack()} testID="projectBuilder.backButton" accessibilityLabel="Back">
            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.primaryBlue }}>{t('common:buttons.back')}</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]} testID="projectBuilder.title">{t('projectBuilder.configureProject')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {autoSaveStatus === 'error' && (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#DC2626', marginRight: 5 }} />
              )}
              <Text
                style={{
                  fontSize: 11,
                  color: autoSaveStatus === 'error' ? '#DC2626' : Colors.secondaryText,
                  fontWeight: autoSaveStatus === 'error' ? '700' : '400',
                }}
              >
                {autoSaveStatus === 'saving'
                  ? t('projectBuilder.savingStatus')
                  : autoSaveStatus === 'saved' && lastSavedAt
                  ? t('projectBuilder.savedAt', { time: lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
                  : autoSaveStatus === 'error'
                  ? t('projectBuilder.saveFailedRetrying')
                  : t('projectBuilder.draftStatus')}
              </Text>
              {autoSaveStatus === 'error' && (
                <TouchableOpacity onPress={() => flushSaveRef.current?.()} style={{ marginLeft: 6 }} testID="projectBuilder.retrySaveButton" accessibilityLabel="Retry save">
                  <Text style={{ color: Colors.primaryBlue, fontSize: 11, fontWeight: '700' }}>{t('common:buttons.retry')}</Text>
                </TouchableOpacity>
              )}
            </View>
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
            <SectionHeader
              title={t('projectBuilder.sectionBasics')}
              icon="briefcase-outline"
              sectionKey="basics"
              expanded={expandedSections.basics}
              chip={sectionChip('basics')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.basics && (
              <View style={styles.sectionBody}>
                <LabelRow label={t('projectBuilder.projectName')} required confidence={aiConfidence.name} Colors={Colors} />
                <ThemedInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('projectBuilder.projectNamePlaceholder')}
                  required
                  confidence={aiConfidence.name}
                  Colors={Colors}
                  testID="projectBuilder.projectNameInput"
                  accessibilityLabel="Project name"
                />

                <LabelRow label={t('projectBuilder.clientName')} required confidence={aiConfidence.client} Colors={Colors} />
                <ThemedInput
                  value={client}
                  onChangeText={setClient}
                  placeholder={t('projectBuilder.clientNamePlaceholder')}
                  required
                  confidence={aiConfidence.client}
                  Colors={Colors}
                  testID="projectBuilder.clientNameInput"
                  accessibilityLabel="Client name"
                />

                <LabelRow label={t('projectBuilder.clientPhone')} confidence={aiConfidence.clientPhone} Colors={Colors} />
                <ThemedInput
                  value={clientPhone}
                  onChangeText={setClientPhone}
                  placeholder={t('projectBuilder.clientPhonePlaceholder')}
                  keyboardType="phone-pad"
                  confidence={aiConfidence.clientPhone}
                  Colors={Colors}
                  testID="projectBuilder.clientPhoneInput"
                  accessibilityLabel="Client phone"
                />

                <LabelRow label={t('projectBuilder.clientEmail')} confidence={aiConfidence.clientEmail} Colors={Colors} />
                <ThemedInput
                  value={clientEmail}
                  onChangeText={setClientEmail}
                  placeholder={t('projectBuilder.clientEmailPlaceholder')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  confidence={aiConfidence.clientEmail}
                  Colors={Colors}
                  testID="projectBuilder.clientEmailInput"
                  accessibilityLabel="Client email"
                />

                <LabelRow label={t('projectBuilder.location')} confidence={aiConfidence.location} Colors={Colors} />
                <ThemedInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('projectBuilder.locationPlaceholder')}
                  confidence={aiConfidence.location}
                  Colors={Colors}
                  testID="projectBuilder.locationInput"
                  accessibilityLabel="Location"
                />
              </View>
            )}
          </View>

          {/* ============ 2. TIMELINE & WORKING DAYS ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionTimeline')}
              icon="calendar-outline"
              sectionKey="timeline"
              expanded={expandedSections.timeline}
              chip={sectionChip('timeline')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.timeline && (
              <View style={styles.sectionBody}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <LabelRow label={t('projectBuilder.startDate')} confidence={aiConfidence.startDate} Colors={Colors} />
                    <TouchableOpacity
                      style={[styles.input, { justifyContent: 'center', backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
                      onPress={() => setShowStartPicker(true)}
                      testID="projectBuilder.startDateButton"
                      accessibilityLabel="Select start date"
                    >
                      <Text style={{ color: startDate ? Colors.primaryText : Colors.placeholderText }} testID="projectBuilder.startDateValue">
                        {startDate ? formatDate(startDate) : t('projectBuilder.selectStartDate')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <LabelRow label={t('projectBuilder.endDate')} confidence={aiConfidence.endDate} Colors={Colors} />
                    <TouchableOpacity
                      style={[styles.input, { justifyContent: 'center', backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
                      onPress={() => setShowEndPicker(true)}
                      testID="projectBuilder.endDateButton"
                      accessibilityLabel="Select end date"
                    >
                      <Text style={{ color: endDate ? Colors.primaryText : Colors.placeholderText }} testID="projectBuilder.endDateValue">
                        {endDate ? formatDate(endDate) : t('projectBuilder.selectEndDate')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <WorkingDaysSelector
                    selectedDays={workingDays}
                    onDaysChange={setWorkingDays}
                    label={t('projectBuilder.workingDays')}
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
            <SectionHeader
              title={t('projectBuilder.sectionPhases')}
              icon="layers-outline"
              sectionKey="phases"
              expanded={expandedSections.phases}
              chip={sectionChip('phases')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.phases && (
              <View style={styles.sectionBody}>
                {/* Contract amount — drives the allocation bar below and the
                    per-phase budget math. Lives here (not in a separate
                    Financial section) so the contract $ sits next to the
                    phases it funds. */}
                <LabelRow label={t('projectBuilder.contractAmount')} required confidence={aiConfidence.contractAmount} Colors={Colors} />
                <ThemedInput
                  value={contractAmount}
                  onChangeText={(v) => setContractAmount(sanitizeNumeric(v))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  required
                  confidence={aiConfidence.contractAmount}
                  Colors={Colors}
                  testID="projectBuilder.contractAmountInput"
                  accessibilityLabel="Contract amount"
                />

                {/* Allocation bar */}
                <View style={[styles.allocBar, { backgroundColor: overAllocated ? '#FEE2E2' : '#EFF6FF', borderColor: overAllocated ? '#DC2626' : Colors.primaryBlue + '30', marginTop: 12 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: overAllocated ? '#DC2626' : Colors.primaryText }} testID="projectBuilder.allocationSummary">
                    {t('projectBuilder.allocatedOfContract', { allocated: allocatedTotal.toLocaleString('en-US'), contract: contractTotal.toLocaleString('en-US') })}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 2 }}>
                    {contractTotal > 0
                      ? t('projectBuilder.percentOfContractAllocated', { percent: Math.round((allocatedTotal / contractTotal) * 100) })
                      : t('projectBuilder.setContractAmountAbove')}
                  </Text>
                </View>

                {phases.map((phase, i) => (
                  <View key={`phase-${i}`} testID={`projectBuilder.phaseRow.${i}`} style={[styles.phaseCard, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <TextInput
                        style={[styles.phaseName, { color: Colors.primaryText, flex: 1 }]}
                        value={phase.name}
                        onChangeText={(v) => updatePhase(i, { name: v })}
                        placeholder={t('projectBuilder.phaseNumber', { number: i + 1 })}
                        placeholderTextColor={Colors.placeholderText}
                        testID={`projectBuilder.phaseNameInput.${i}`}
                        accessibilityLabel={`Phase ${i + 1} name`}
                      />
                      <TouchableOpacity onPress={() => removePhase(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID={`projectBuilder.phaseRemoveButton.${i}`} accessibilityLabel={`Remove phase ${i + 1}`}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>{t('projectBuilder.days')}</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                          value={String(phase.plannedDays || '')}
                          onChangeText={(v) => updatePhase(i, { plannedDays: parseInt(v, 10) || 0 })}
                          placeholder="0"
                          placeholderTextColor={Colors.placeholderText}
                          keyboardType="number-pad"
                          testID={`projectBuilder.phaseDaysInput.${i}`}
                          accessibilityLabel={`Phase ${i + 1} days`}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>{t('projectBuilder.budget')}</Text>
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
                          testID={`projectBuilder.phaseBudgetInput.${i}`}
                          accessibilityLabel={`Phase ${i + 1} budget`}
                        />
                      </View>
                    </View>

                    <Text style={[styles.miniLabel, { color: Colors.secondaryText, marginTop: 8 }]}>{t('projectBuilder.assignedWorker')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <TouchableOpacity
                        onPress={() => updatePhase(i, { assignedWorkerId: null })}
                        style={[styles.chipButton, { backgroundColor: !phase.assignedWorkerId ? Colors.primaryBlue : Colors.white, borderColor: Colors.border }]}
                        testID={`projectBuilder.phaseWorkerNone.${i}`}
                        accessibilityLabel={`Phase ${i + 1} no assigned worker`}
                      >
                        <Text style={{ color: !phase.assignedWorkerId ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>{t('projectBuilder.none')}</Text>
                      </TouchableOpacity>
                      {availableWorkers.map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          onPress={() => updatePhase(i, { assignedWorkerId: w.id })}
                          testID={`projectBuilder.phaseWorker.${i}.${w.id}`}
                          accessibilityLabel={`Assign ${w.name || w.full_name || 'worker'} to phase ${i + 1}`}
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
                            {w.name || w.full_name || t('projectBuilder.worker')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Tasks */}
                    <View style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>{t('projectBuilder.tasks')}</Text>
                        <TouchableOpacity onPress={() => addTaskToPhase(i)} testID={`projectBuilder.phaseAddTaskButton.${i}`} accessibilityLabel={`Add task to phase ${i + 1}`}>
                          <Text style={{ color: Colors.primaryBlue, fontSize: 12, fontWeight: '600' }}>{t('projectBuilder.addTask')}</Text>
                        </TouchableOpacity>
                      </View>
                      {(phase.tasks || []).map((t, ti) => (
                        <View key={`task-${i}-${ti}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <TextInput
                            style={[styles.input, { flex: 1, backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                            value={t.description}
                            onChangeText={(v) => updateTask(i, ti, v)}
                            placeholder={t('projectBuilder.taskDescriptionPlaceholder')}
                            placeholderTextColor={Colors.placeholderText}
                            testID={`projectBuilder.phaseTaskInput.${i}.${ti}`}
                            accessibilityLabel={`Phase ${i + 1} task ${ti + 1}`}
                          />
                          <TouchableOpacity onPress={() => removeTask(i, ti)} testID={`projectBuilder.phaseTaskRemoveButton.${i}.${ti}`} accessibilityLabel={`Remove task ${ti + 1} from phase ${i + 1}`}>
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
                  testID="projectBuilder.addPhaseButton"
                  accessibilityLabel="Add phase"
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>{t('projectBuilder.addPhase')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Financial section removed — Contract Amount now lives at the top
              of the Phases section; trade budgets are entered per-phase via
              Add Phase. */}

          {/* ============ 4. PROGRESS DRAWS ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionDraws')}
              icon="cash-outline"
              sectionKey="draws"
              expanded={expandedSections.draws}
              chip={sectionChip('draws')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.draws && (
              <View style={styles.sectionBody}>
                <Text style={{ color: Colors.secondaryText, fontSize: 12, marginBottom: 4, lineHeight: 18 }}>
                  {t('projectBuilder.drawsIntro1')}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 12, marginBottom: 12, lineHeight: 18 }}>
                  {t('projectBuilder.drawsIntro2')}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ color: Colors.primaryText, fontSize: 14, fontWeight: '600' }}>
                    {t('projectBuilder.billInDrawsQuestion')}
                  </Text>
                  <Switch
                    value={billInDraws}
                    onValueChange={setBillInDraws}
                    trackColor={{ false: Colors.border, true: Colors.primaryBlue }}
                    testID="projectBuilder.billInDrawsSwitch"
                    accessibilityLabel="Bill this project in draws"
                  />
                </View>

                {billInDraws && (
                  <>
                    <View style={{ marginTop: 12 }}>
                      <LabelRow label={t('projectBuilder.retainage')} Colors={Colors} />
                      <Text style={{ color: Colors.secondaryText, fontSize: 11, marginBottom: 6, lineHeight: 16 }}>
                        {t('projectBuilder.retainageHelp')}
                      </Text>
                      <ThemedInput
                        value={String(retainagePercent)}
                        onChangeText={(v) => setRetainagePercent(sanitizeNumeric(v))}
                        placeholder="10"
                        keyboardType="decimal-pad"
                        Colors={Colors}
                        testID="projectBuilder.retainageInput"
                        accessibilityLabel="Retainage percent"
                      />
                    </View>

                    {/* Live totals */}
                    {(() => {
                      const contract = parseFloat(contractAmount) || 0;
                      const pctSum = draws
                        .filter((d) => d.percent_of_contract !== '' && d.percent_of_contract != null)
                        .reduce((s, d) => s + (parseFloat(d.percent_of_contract) || 0), 0);
                      const fixedSum = draws
                        .filter((d) => d.fixed_amount !== '' && d.fixed_amount != null)
                        .reduce((s, d) => s + (parseFloat(d.fixed_amount) || 0), 0);
                      const dollarTotal = (contract * pctSum / 100) + fixedSum;
                      const pctClose = pctSum > 0 && Math.abs(pctSum - 100) <= 0.01;
                      const allFixed = pctSum === 0 && fixedSum > 0;
                      return (
                        <View style={[styles.allocBar, {
                          backgroundColor: pctClose || allFixed ? '#EFF6FF' : '#FEF3C7',
                          borderColor: pctClose || allFixed ? Colors.primaryBlue + '30' : '#F59E0B',
                          marginTop: 12,
                        }]}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primaryText }}>
                            {pctSum > 0 ? t('projectBuilder.percentOfContractAllocated', { percent: pctSum.toFixed(1) }) : t('projectBuilder.fixedAmountDraws')}
                            {fixedSum > 0 && pctSum > 0 ? t('projectBuilder.fixedSuffix', { amount: fixedSum.toLocaleString('en-US') }) : ''}
                          </Text>
                          <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 2 }} testID="projectBuilder.drawsTotal">
                            {t('projectBuilder.drawsTotal', { amount: dollarTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }), count: draws.length })}
                            {pctSum > 0 && !pctClose ? t('projectBuilder.percentRowsShouldSum') : ''}
                          </Text>
                        </View>
                      );
                    })()}

                    {draws.map((draw, i) => {
                      // null = "this mode is inactive", '' or value = "this mode is selected".
                      // Default new rows are percent with empty value.
                      const isFixedMode = draw.fixed_amount != null;
                      const mode = isFixedMode ? 'fixed' : 'percent';
                      const contract = parseFloat(contractAmount) || 0;
                      const computed = mode === 'percent'
                        ? contract * (parseFloat(draw.percent_of_contract) || 0) / 100
                        : parseFloat(draw.fixed_amount) || 0;
                      const locked = draw.status && draw.status !== 'pending';

                      return (
                        <View key={`draw-${i}`} testID={`projectBuilder.drawRow.${i}`} style={[styles.phaseCard, { borderColor: Colors.border, backgroundColor: Colors.lightGray }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={{ color: Colors.secondaryText, fontWeight: '700', marginRight: 8 }}>#{i + 1}</Text>
                            <TextInput
                              style={[styles.phaseName, { color: Colors.primaryText, flex: 1 }]}
                              value={draw.description}
                              onChangeText={(v) => updateDraw(i, { description: v })}
                              placeholder={t('projectBuilder.drawDescriptionPlaceholder', { number: i + 1 })}
                              placeholderTextColor={Colors.placeholderText}
                              editable={!locked}
                              testID={`projectBuilder.drawDescriptionInput.${i}`}
                              accessibilityLabel={`Draw ${i + 1} description`}
                            />
                            {!locked && (
                              <TouchableOpacity onPress={() => removeDraw(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID={`projectBuilder.drawRemoveButton.${i}`} accessibilityLabel={`Remove draw ${i + 1}`}>
                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </View>

                          {locked && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                              <View style={{ backgroundColor: draw.status === 'paid' ? '#D1FAE5' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                <Text style={{ color: draw.status === 'paid' ? '#065F46' : '#92400E', fontSize: 11, fontWeight: '700' }} testID={`projectBuilder.drawStatus.${i}`}>
                                  {statusLabel(draw.status, { upper: true })}{draw.invoice_number ? ` • ${draw.invoice_number}` : ''}
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* Mode toggle: % vs fixed. null = mode inactive, '' or
                              value = mode selected. */}
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            <TouchableOpacity
                              disabled={locked}
                              onPress={() => updateDraw(i, {
                                percent_of_contract: draw.percent_of_contract != null ? draw.percent_of_contract : '',
                                fixed_amount: null,
                              })}
                              style={[styles.chipButton, {
                                backgroundColor: mode === 'percent' ? Colors.primaryBlue : Colors.white,
                                borderColor: Colors.border,
                                opacity: locked ? 0.5 : 1,
                              }]}
                              testID={`projectBuilder.drawModePercent.${i}`}
                              accessibilityLabel={`Draw ${i + 1} percent of contract mode`}
                            >
                              <Text style={{ color: mode === 'percent' ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>{t('projectBuilder.percentOfContract')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={locked}
                              onPress={() => updateDraw(i, {
                                fixed_amount: draw.fixed_amount != null ? draw.fixed_amount : '',
                                percent_of_contract: null,
                              })}
                              style={[styles.chipButton, {
                                backgroundColor: mode === 'fixed' ? Colors.primaryBlue : Colors.white,
                                borderColor: Colors.border,
                                opacity: locked ? 0.5 : 1,
                              }]}
                              testID={`projectBuilder.drawModeFixed.${i}`}
                              accessibilityLabel={`Draw ${i + 1} fixed amount mode`}
                            >
                              <Text style={{ color: mode === 'fixed' ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>{t('projectBuilder.fixedDollar')}</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={{ color: Colors.secondaryText, fontSize: 11, marginBottom: 6 }}>
                            {mode === 'percent'
                              ? t('projectBuilder.percentModeHelp')
                              : t('projectBuilder.fixedModeHelp')}
                          </Text>

                          {mode === 'percent' ? (
                            <View>
                              <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>{t('projectBuilder.percentOfContract')}</Text>
                              <TextInput
                                style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                                value={draw.percent_of_contract == null ? '' : String(draw.percent_of_contract)}
                                onChangeText={(v) => updateDraw(i, { percent_of_contract: sanitizeNumeric(v) })}
                                placeholder={t('projectBuilder.percentExample')}
                                placeholderTextColor={Colors.placeholderText}
                                keyboardType="decimal-pad"
                                editable={!locked}
                                testID={`projectBuilder.drawPercentInput.${i}`}
                                accessibilityLabel={`Draw ${i + 1} percent of contract`}
                              />
                            </View>
                          ) : (
                            <View>
                              <Text style={[styles.miniLabel, { color: Colors.secondaryText }]}>{t('projectBuilder.fixedAmount')}</Text>
                              <TextInput
                                style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                                value={draw.fixed_amount == null ? '' : String(draw.fixed_amount)}
                                onChangeText={(v) => updateDraw(i, { fixed_amount: sanitizeNumeric(v) })}
                                placeholder={t('projectBuilder.fixedExample')}
                                placeholderTextColor={Colors.placeholderText}
                                keyboardType="decimal-pad"
                                editable={!locked}
                                testID={`projectBuilder.drawFixedInput.${i}`}
                                accessibilityLabel={`Draw ${i + 1} fixed amount`}
                              />
                            </View>
                          )}

                          {computed > 0 && (
                            <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 6 }}>
                              {t('projectBuilder.approxAmount', { amount: computed.toLocaleString(undefined, { maximumFractionDigits: 2 }) })}
                            </Text>
                          )}

                          {/* Trigger picker — when does this draw flip to "ready to send"?
                              The whole point is that the contractor never has to remember;
                              every draw needs a real signal. */}
                          <View style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border }}>
                            <Text style={[styles.miniLabel, { color: Colors.secondaryText, marginBottom: 6 }]}>
                              {t('projectBuilder.sendDrawWhen')}
                            </Text>

                            {/* phase_completion */}
                            <TouchableOpacity
                              disabled={locked}
                              onPress={() => {
                                // Link by order_index so this works even before
                                // phases are persisted (new-project chat flow).
                                // phase_id resolves from phase_order_index once
                                // the phase gains a real UUID (see resolution
                                // effect + buildDrawsPayload).
                                const takenIdx = new Set(
                                  draws
                                    .map((d, idx) => (idx !== i && typeof d.phase_order_index === 'number' ? d.phase_order_index : null))
                                    .filter((x) => x != null)
                                );
                                const alreadyLinked =
                                  typeof draw.phase_order_index === 'number' || draw.phase_id;
                                const nextIdx = alreadyLinked
                                  ? null
                                  : (phases.findIndex((_p, idx) => !takenIdx.has(idx)));
                                const chosenIdx =
                                  typeof draw.phase_order_index === 'number'
                                    ? draw.phase_order_index
                                    : (nextIdx != null && nextIdx >= 0 ? nextIdx : (phases.length > 0 ? 0 : null));
                                const chosenPhase = chosenIdx != null ? phases[chosenIdx] : null;
                                updateDraw(i, {
                                  trigger_type: 'phase_completion',
                                  phase_order_index: chosenIdx,
                                  phase_id:
                                    draw.phase_id ||
                                    (chosenPhase && chosenPhase.id && !String(chosenPhase.id).startsWith('draft-')
                                      ? chosenPhase.id
                                      : null),
                                });
                              }}
                              style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, gap: 10 }}
                              testID={`projectBuilder.drawTriggerPhase.${i}`}
                              accessibilityLabel={`Draw ${i + 1} trigger on phase completion`}
                            >
                              <View style={{
                                width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                                borderColor: (draw.trigger_type === 'phase_completion') ? Colors.primaryBlue : Colors.border,
                                alignItems: 'center', justifyContent: 'center', marginTop: 2,
                              }}>
                                {draw.trigger_type === 'phase_completion' && (
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primaryBlue }} />
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: Colors.primaryText, fontSize: 13, fontWeight: '600' }}>{t('projectBuilder.triggerPhaseTitle')}</Text>
                                <Text style={{ color: Colors.secondaryText, fontSize: 11, marginTop: 2 }}>
                                  {t('projectBuilder.triggerPhaseHelp')}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {/* phase dropdown (only when phase_completion is selected) */}
                            {/* Lists ALL phases (including in-memory ones with no
                                UUID yet) and selects by order_index, so linking
                                works in the new-project flow before the first
                                save. phase_id is resolved at save time. */}
                            {draw.trigger_type === 'phase_completion' && (
                              <View style={{ marginLeft: 28, marginBottom: 8 }}>
                                {phases.length === 0 ? (
                                  <Text style={{ color: '#DC2626', fontSize: 11, marginTop: 4 }}>
                                    {t('projectBuilder.addPhaseFirst')}
                                  </Text>
                                ) : (
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {phases.map((p, pIdx) => {
                                      const selected =
                                        (typeof draw.phase_order_index === 'number' && draw.phase_order_index === pIdx) ||
                                        (draw.phase_id && p.id && draw.phase_id === p.id);
                                      return (
                                        <TouchableOpacity
                                          key={p.id || `phase-idx-${pIdx}`}
                                          disabled={locked}
                                          onPress={() => updateDraw(i, {
                                            phase_order_index: pIdx,
                                            phase_id:
                                              p.id && !String(p.id).startsWith('draft-') ? p.id : null,
                                          })}
                                          testID={`projectBuilder.drawPhaseChip.${i}.${pIdx}`}
                                          accessibilityLabel={`Link draw ${i + 1} to phase ${pIdx + 1}`}
                                          style={[styles.chipButton, {
                                            backgroundColor: selected ? Colors.primaryBlue : Colors.lightGray,
                                            borderColor: Colors.border,
                                          }]}
                                        >
                                          <Text style={{ color: selected ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>
                                            {p.name || t('projectBuilder.phaseNumber', { number: pIdx + 1 })}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </ScrollView>
                                )}
                              </View>
                            )}

                            {/* project_start */}
                            <TouchableOpacity
                              disabled={locked}
                              onPress={() => updateDraw(i, { trigger_type: 'project_start', phase_id: null, phase_order_index: null })}
                              style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, gap: 10 }}
                              testID={`projectBuilder.drawTriggerProjectStart.${i}`}
                              accessibilityLabel={`Draw ${i + 1} trigger on project start`}
                            >
                              <View style={{
                                width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                                borderColor: (draw.trigger_type === 'project_start') ? Colors.primaryBlue : Colors.border,
                                alignItems: 'center', justifyContent: 'center', marginTop: 2,
                              }}>
                                {draw.trigger_type === 'project_start' && (
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primaryBlue }} />
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: Colors.primaryText, fontSize: 13, fontWeight: '600' }}>{t('projectBuilder.triggerProjectStartTitle')}</Text>
                                <Text style={{ color: Colors.secondaryText, fontSize: 11, marginTop: 2 }}>
                                  {t('projectBuilder.triggerProjectStartHelp')}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {/* manual */}
                            <TouchableOpacity
                              disabled={locked}
                              onPress={() => updateDraw(i, { trigger_type: 'manual', phase_id: null, phase_order_index: null })}
                              style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, gap: 10 }}
                              testID={`projectBuilder.drawTriggerManual.${i}`}
                              accessibilityLabel={`Draw ${i + 1} trigger manually`}
                            >
                              <View style={{
                                width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                                borderColor: (draw.trigger_type === 'manual') ? Colors.primaryBlue : Colors.border,
                                alignItems: 'center', justifyContent: 'center', marginTop: 2,
                              }}>
                                {draw.trigger_type === 'manual' && (
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primaryBlue }} />
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: Colors.primaryText, fontSize: 13, fontWeight: '600' }}>{t('projectBuilder.triggerManualTitle')}</Text>
                                <Text style={{ color: Colors.secondaryText, fontSize: 11, marginTop: 2 }}>
                                  {t('projectBuilder.triggerManualHelp')}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]}
                      onPress={handleAddDraw}
                      testID="projectBuilder.addDrawButton"
                      accessibilityLabel="Add draw"
                    >
                      <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                      <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>{t('projectBuilder.addDraw')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>

          {/* ============ 5. TEAM ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionTeam')}
              icon="people-outline"
              sectionKey="team"
              expanded={expandedSections.team}
              chip={sectionChip('team')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.team && (
              <View style={styles.sectionBody}>
                <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('projectBuilder.supervisor')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedSupervisor(null)}
                    style={[styles.chipButton, { backgroundColor: !selectedSupervisor ? Colors.primaryBlue : Colors.white, borderColor: Colors.border }]}
                    testID="projectBuilder.supervisorManageDirectly"
                    accessibilityLabel="Manage directly, no supervisor"
                  >
                    <Text style={{ color: !selectedSupervisor ? '#fff' : Colors.primaryText, fontSize: 12, fontWeight: '600' }}>{t('projectBuilder.manageDirectly')}</Text>
                  </TouchableOpacity>
                  {supervisors.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSelectedSupervisor(s.id)}
                      testID={`projectBuilder.supervisorChip.${s.id}`}
                      accessibilityLabel={`Select supervisor ${s.name || s.full_name || ''}`}
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
                        {s.name || s.full_name || t('projectBuilder.supervisor')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('projectBuilder.workers')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {availableWorkers.map((w) => {
                    const active = selectedWorkerIds.includes(w.id);
                    return (
                      <TouchableOpacity
                        key={w.id}
                        onPress={() => toggleWorker(w.id)}
                        testID={`projectBuilder.workerChip.${w.id}`}
                        accessibilityLabel={`Toggle worker ${w.name || w.full_name || ''}`}
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
                          {w.name || w.full_name || t('projectBuilder.worker')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {availableWorkers.length === 0 && (
                    <Text style={{ color: Colors.secondaryText, fontStyle: 'italic', fontSize: 12 }}>
                      {t('projectBuilder.noWorkers')}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* ============ 6. DAILY CHECKLIST & LABOR ROLES ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionChecklist')}
              icon="checkbox-outline"
              sectionKey="checklist"
              expanded={expandedSections.checklist}
              chip={sectionChip('checklist')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.checklist && (
              <View style={styles.sectionBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={[styles.label, { color: Colors.secondaryText, marginBottom: 0 }]}>{t('projectBuilder.checklistItems')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {(checklistItems.length > 0 || laborRoles.length > 0) && (
                      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' }}>
                        {['append', 'replace'].map((mode) => {
                          const active = aiSuggestMode === mode;
                          return (
                            <TouchableOpacity
                              key={mode}
                              onPress={() => setAiSuggestMode(mode)}
                              testID={`projectBuilder.aiSuggestMode.${mode}`}
                              accessibilityLabel={`AI suggest ${mode} mode`}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                backgroundColor: active ? '#F5F3FF' : 'transparent',
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#7C3AED' : Colors.secondaryText, textTransform: 'capitalize' }}>{mode === 'append' ? t('projectBuilder.aiModeAppend') : t('projectBuilder.aiModeReplace')}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={handleAISuggestChecklist}
                      style={[styles.aiSuggestBtn, { opacity: aiSuggestLoading ? 0.6 : 1 }]}
                      disabled={aiSuggestLoading}
                      testID="projectBuilder.aiSuggestButton"
                      accessibilityLabel="Suggest checklist and labor with AI"
                    >
                      {aiSuggestLoading ? (
                        <ActivityIndicator size="small" color="#7C3AED" />
                      ) : (
                        <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
                      )}
                      <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                        {aiSuggestLoading ? t('projectBuilder.thinking') : t('projectBuilder.suggestWithAI')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {aiSuggestError && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="warning-outline" size={12} color="#DC2626" />
                    <Text style={{ color: '#DC2626', fontSize: 12, marginLeft: 4 }}>{aiSuggestError}</Text>
                  </View>
                )}

                {checklistItems.map((c, i) => {
                  const highlight = aiHighlightUntil.checklist > Date.now();
                  return (
                    <View
                      key={`cl-${i}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 6,
                        borderLeftWidth: highlight ? 3 : 0,
                        borderLeftColor: highlight ? '#7C3AED' : 'transparent',
                        paddingLeft: highlight ? 8 : 0,
                      }}
                    >
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                        value={c.title}
                        onChangeText={(v) => updateChecklistItem(i, 'title', v)}
                        placeholder={t('projectBuilder.checklistItemPlaceholder')}
                        placeholderTextColor={Colors.placeholderText}
                        testID={`projectBuilder.checklistItemInput.${i}`}
                        accessibilityLabel={`Checklist item ${i + 1}`}
                      />
                      <TouchableOpacity onPress={() => removeChecklistItem(i)} testID={`projectBuilder.checklistItemRemoveButton.${i}`} accessibilityLabel={`Remove checklist item ${i + 1}`}>
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addChecklistItem} testID="projectBuilder.addChecklistItemButton" accessibilityLabel="Add checklist item">
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>{t('projectBuilder.addChecklistItem')}</Text>
                </TouchableOpacity>

                <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 16 }]}>{t('projectBuilder.laborRoles')}</Text>
                {laborRoles.map((r, i) => {
                  const highlight = aiHighlightUntil.labor > Date.now();
                  return (
                    <View
                      key={`lr-${i}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 6,
                        borderLeftWidth: highlight ? 3 : 0,
                        borderLeftColor: highlight ? '#7C3AED' : 'transparent',
                        paddingLeft: highlight ? 8 : 0,
                      }}
                    >
                      <TextInput
                        style={[styles.input, { flex: 2, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                        value={r.role_name}
                        onChangeText={(v) => updateLaborRole(i, 'role_name', v)}
                        placeholder={t('projectBuilder.laborRolePlaceholder')}
                        placeholderTextColor={Colors.placeholderText}
                        testID={`projectBuilder.laborRoleNameInput.${i}`}
                        accessibilityLabel={`Labor role ${i + 1} name`}
                      />
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                        value={String(r.default_quantity || '')}
                        onChangeText={(v) => updateLaborRole(i, 'default_quantity', parseInt(v, 10) || 1)}
                        placeholder={t('projectBuilder.qty')}
                        placeholderTextColor={Colors.placeholderText}
                        keyboardType="number-pad"
                        testID={`projectBuilder.laborRoleQtyInput.${i}`}
                        accessibilityLabel={`Labor role ${i + 1} quantity`}
                      />
                      <TouchableOpacity onPress={() => removeLaborRole(i)} testID={`projectBuilder.laborRoleRemoveButton.${i}`} accessibilityLabel={`Remove labor role ${i + 1}`}>
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addLaborRole} testID="projectBuilder.addLaborRoleButton" accessibilityLabel="Add labor role">
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>{t('projectBuilder.addLaborRole')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ 7. DOCUMENTS (STUB) ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionDocuments')}
              icon="document-attach-outline"
              sectionKey="documents"
              expanded={expandedSections.documents}
              chip={sectionChip('documents')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.documents && (
              <View style={styles.sectionBody}>
                {/* Documents attach to a saved project row. In the new-project
                    (chat) flow nothing is persisted until the user taps Create
                    Project, so there's no row to attach a file to yet. Rather
                    than show a dead "Upload Document" button that only Alerts
                    "Save first", explain the gate up front. Once the project is
                    saved (projectId exists), the uploader appears. */}
                {!projectId ? (
                  <View style={[styles.emptyStub, { backgroundColor: Colors.lightGray }]}>
                    <Ionicons name="lock-closed-outline" size={28} color={Colors.secondaryText} />
                    <Text style={{ color: Colors.primaryText, fontWeight: '600', marginTop: 6 }}>{t('projectBuilder.saveProjectFirst')}</Text>
                    <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                      {t('projectBuilder.documentsLockedHelp')}
                    </Text>
                  </View>
                ) : (
                  <>
                <TouchableOpacity
                  style={[styles.addRowButton, { borderColor: Colors.primaryBlue, opacity: uploadingDoc ? 0.6 : 1 }]}
                  onPress={handleUploadDocument}
                  disabled={uploadingDoc}
                  testID="projectBuilder.uploadDocumentButton"
                  accessibilityLabel="Upload document"
                >
                  {uploadingDoc ? (
                    <ActivityIndicator size="small" color={Colors.primaryBlue} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={18} color={Colors.primaryBlue} />
                  )}
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>
                    {uploadingDoc ? t('projectBuilder.uploading') : t('projectBuilder.uploadDocument')}
                  </Text>
                </TouchableOpacity>

                {documentsLoading && documents.length === 0 ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={Colors.secondaryText} />
                  </View>
                ) : documents.length === 0 ? (
                  <View style={[styles.emptyStub, { backgroundColor: Colors.lightGray, marginTop: 8 }]}>
                    <Ionicons name="cloud-upload-outline" size={28} color={Colors.secondaryText} />
                    <Text style={{ color: Colors.primaryText, fontWeight: '600', marginTop: 6 }}>{t('projectBuilder.noDocuments')}</Text>
                    <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                      {t('projectBuilder.documentsEmptyHelp')}
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 8, gap: 8 }}>
                    {documents.map((doc) => {
                      const isPdf = doc.file_type === 'pdf';
                      const isImage = doc.file_type === 'image';
                      const iconName = isPdf ? 'document-text' : isImage ? 'image' : 'document';
                      const tileBg = isPdf ? '#FEE2E2' : isImage ? '#DBEAFE' : '#F3F4F6';
                      const tileFg = isPdf ? '#DC2626' : isImage ? '#2563EB' : Colors.secondaryText;
                      const kindColors = {
                        contract: { bg: '#F5F3FF', fg: '#7C3AED' },
                        plan: { bg: '#DBEAFE', fg: '#2563EB' },
                        photo: { bg: '#D1FAE5', fg: '#059669' },
                        permit: { bg: '#FEF3C7', fg: '#D97706' },
                      };
                      const kc = kindColors[doc.category] || { bg: Colors.lightGray, fg: Colors.secondaryText };
                      const dateStr = doc.created_at
                        ? new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '';
                      return (
                        <TouchableOpacity
                          key={doc.id}
                          activeOpacity={0.7}
                          onPress={() => handleOpenDocument(doc)}
                          testID={`projectBuilder.documentRow.${doc.id}`}
                          accessibilityLabel={`Open document ${doc.file_name}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            borderWidth: 1,
                            borderColor: Colors.border,
                            borderRadius: BorderRadius.sm,
                            padding: 12,
                            backgroundColor: Colors.white,
                          }}
                        >
                          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: tileBg, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={iconName} size={20} color={tileFg} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primaryText }} numberOfLines={1}>
                              {doc.file_name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                              <View style={{ backgroundColor: kc.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9 }}>
                                <Text style={{ color: kc.fg, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                                  {doc.category || 'other'}
                                </Text>
                              </View>
                              <Text style={{ color: Colors.secondaryText, fontSize: 11 }}>{dateStr}</Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteDocument(doc)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{ padding: 4 }}
                            testID={`projectBuilder.documentDeleteButton.${doc.id}`}
                            accessibilityLabel={`Delete document ${doc.file_name}`}
                          >
                            <Ionicons name="trash-outline" size={18} color="#DC2626" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                  </>
                )}
              </View>
            )}
          </View>

          {/* ============ 8. LINKED ESTIMATE (STUB) ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionEstimate')}
              icon="link-outline"
              sectionKey="estimate"
              expanded={expandedSections.estimate}
              chip={sectionChip('estimate')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.estimate && (
              <View style={styles.sectionBody}>
                {linkedEstimate ? (
                  <View
                    style={{
                      borderRadius: BorderRadius.md,
                      padding: Spacing.md,
                      borderWidth: 1,
                      borderColor: '#7C3AED',
                      backgroundColor: '#FAF5FF',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Ionicons name="link" size={14} color="#7C3AED" />
                      <Text style={{ color: '#7C3AED', fontSize: 11, fontWeight: '700', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('projectBuilder.linkedEstimate')}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.primaryText }}>
                        #{linkedEstimate.estimate_number || '—'}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.primaryText }} testID="projectBuilder.linkedEstimateTotal">
                        ${(parseFloat(linkedEstimate.total) || 0).toLocaleString('en-US')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: Colors.secondaryText, marginBottom: 4 }}>
                      {linkedEstimate.client_name || '—'}
                      {linkedEstimate.project_name ? ` · ${linkedEstimate.project_name}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <View
                        style={{
                          backgroundColor:
                            linkedEstimate.status === 'accepted' ? '#D1FAE5'
                            : linkedEstimate.status === 'sent' ? '#DBEAFE'
                            : Colors.lightGray,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 9,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              linkedEstimate.status === 'accepted' ? '#059669'
                              : linkedEstimate.status === 'sent' ? '#2563EB'
                              : Colors.secondaryText,
                            fontSize: 10,
                            fontWeight: '700',
                            textTransform: 'uppercase',
                          }}
                        >
                          {linkedEstimate.status || 'draft'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={handleUnlinkEstimate} testID="projectBuilder.unlinkEstimateButton" accessibilityLabel="Unlink estimate">
                        <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>{t('projectBuilder.unlink')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addRowButton, { borderColor: Colors.primaryBlue, paddingVertical: 18 }]}
                    onPress={openEstimatePicker}
                    testID="projectBuilder.linkEstimateButton"
                    accessibilityLabel="Link an estimate"
                  >
                    <Ionicons name="link-outline" size={20} color={Colors.primaryBlue} />
                    <Text style={{ color: Colors.primaryBlue, fontWeight: '700', fontSize: 14 }}>{t('projectBuilder.linkEstimate')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ============ 9. REVIEW & SAVE ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title={t('projectBuilder.sectionReview')}
              icon="checkmark-done-outline"
              sectionKey="review"
              expanded={expandedSections.review}
              chip={sectionChip('review')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.review && (
              <View style={styles.sectionBody}>
                <Text style={{ color: Colors.primaryText, fontWeight: '600', marginBottom: 8 }}>{t('projectBuilder.summary')}</Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  {t('projectBuilder.summaryNameClient', { name: name.trim() || '—', client: client.trim() || '—' })}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }} testID="projectBuilder.reviewContract">
                  {t('projectBuilder.summaryContract', { amount: contractTotal.toLocaleString('en-US'), count: phases.length })}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  {t('projectBuilder.summaryAllocated', { amount: allocatedTotal.toLocaleString('en-US'), percent: contractTotal > 0 ? Math.round((allocatedTotal / contractTotal) * 100) : 0 })}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13, marginBottom: 4 }}>
                  {t('projectBuilder.summaryTimeline', { start: startDate ? formatDate(startDate) : '—', end: endDate ? formatDate(endDate) : '—' })}
                </Text>
                <Text style={{ color: Colors.secondaryText, fontSize: 13 }}>
                  {t('projectBuilder.summaryTeam', { supervisor: selectedSupervisor ? t('projectBuilder.oneSupervisor') : t('projectBuilder.managedDirectly'), workers: t('projectBuilder.summaryWorkers', { count: selectedWorkerIds.length }) })}
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
            testID="projectBuilder.createProjectButton"
            accessibilityLabel="Create project"
          >
            {finalSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>
                  {t('projectBuilder.createProject')}
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
                  <TouchableOpacity onPress={() => setShowStartPicker(false)} testID="projectBuilder.startPickerCancel" accessibilityLabel="Cancel start date">
                    <Text style={{ color: Colors.secondaryText }}>{t('common:buttons.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: '700', color: Colors.primaryText }}>{t('projectBuilder.startDate')}</Text>
                  <TouchableOpacity onPress={() => setShowStartPicker(false)} testID="projectBuilder.startPickerDone" accessibilityLabel="Confirm start date">
                    <Text style={{ color: Colors.primaryBlue, fontWeight: '700' }}>{t('common:buttons.done')}</Text>
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

        {estimatePickerVisible && (
          <Modal
            transparent
            animationType="slide"
            visible={estimatePickerVisible}
            onRequestClose={() => setEstimatePickerVisible(false)}
          >
            <View style={styles.pickerOverlay}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setEstimatePickerVisible(false)} activeOpacity={1} />
              <View style={[styles.pickerSheet, { backgroundColor: Colors.white, maxHeight: '80%' }]}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setEstimatePickerVisible(false)} testID="projectBuilder.estimatePickerCancel" accessibilityLabel="Cancel estimate picker">
                    <Text style={{ color: Colors.secondaryText }}>{t('common:buttons.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: '700', color: Colors.primaryText }}>{t('projectBuilder.selectEstimate')}</Text>
                  <View style={{ width: 50 }} />
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText, marginBottom: 0 }]}
                    value={estimateSearch}
                    onChangeText={setEstimateSearch}
                    placeholder={t('projectBuilder.searchEstimatesPlaceholder')}
                    placeholderTextColor={Colors.placeholderText}
                    autoCapitalize="none"
                    testID="projectBuilder.estimateSearchInput"
                    accessibilityLabel="Search estimates"
                  />
                </View>
                {estimatesLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={Colors.primaryBlue} />
                  </View>
                ) : filteredEstimates.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ color: Colors.secondaryText, fontSize: 13 }}>
                      {estimateSearch ? t('projectBuilder.noMatchingEstimates') : t('projectBuilder.noEstimatesYet')}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredEstimates}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                      const dateStr = item.created_at
                        ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '';
                      const sc = item.status === 'accepted'
                        ? { bg: '#D1FAE5', fg: '#059669' }
                        : item.status === 'sent'
                        ? { bg: '#DBEAFE', fg: '#2563EB' }
                        : { bg: Colors.lightGray, fg: Colors.secondaryText };
                      return (
                        <TouchableOpacity
                          onPress={() => handlePickEstimate(item)}
                          testID={`projectBuilder.estimateRow.${item.id}`}
                          accessibilityLabel={`Select estimate ${item.estimate_number || item.client_name || ''}`}
                          style={{
                            flexDirection: 'row',
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: Colors.border,
                            alignItems: 'center',
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: Colors.primaryText, fontWeight: '700', fontSize: 13 }}>
                              #{item.estimate_number || '—'}
                            </Text>
                            <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                              {item.client_name || t('projectBuilder.noClient')}
                              {item.project_name ? ` · ${item.project_name}` : ''}
                            </Text>
                            <Text style={{ color: Colors.secondaryText, fontSize: 11, marginTop: 2 }}>{dateStr}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                            <Text style={{ color: Colors.primaryText, fontWeight: '700', fontSize: 14 }}>
                              ${(parseFloat(item.total) || 0).toLocaleString('en-US')}
                            </Text>
                            <View style={{ backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, marginTop: 4 }}>
                              <Text style={{ color: sc.fg, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                                {item.status || 'draft'}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
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
                  <TouchableOpacity onPress={() => setShowEndPicker(false)} testID="projectBuilder.endPickerCancel" accessibilityLabel="Cancel end date">
                    <Text style={{ color: Colors.secondaryText }}>{t('common:buttons.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: '700', color: Colors.primaryText }}>{t('projectBuilder.endDate')}</Text>
                  <TouchableOpacity onPress={() => setShowEndPicker(false)} testID="projectBuilder.endPickerDone" accessibilityLabel="Confirm end date">
                    <Text style={{ color: Colors.primaryBlue, fontWeight: '700' }}>{t('common:buttons.done')}</Text>
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
