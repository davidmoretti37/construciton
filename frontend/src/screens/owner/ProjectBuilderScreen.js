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

const LabelRow = ({ label, required, confidence, Colors }) => (
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
    />
  );
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

  // UI state
  const [expandedSections, setExpandedSections] = useState({
    basics: true,
    timeline: false,
    phases: false,
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
  // Guard against concurrent draft-create calls. The effect below watches
  // every form field, so rapid typing could otherwise fire multiple creates
  // before the first completes.
  const creatingDraftRef = useRef(false);
  useEffect(() => {
    if (initialProjectId) return;
    if (projectIdRef.current) return;
    if (creatingDraftRef.current) return;
    // Fire the draft create as soon as ANY field has content. Previously
    // this only triggered on name/client from chat data — if the user
    // opened ProjectBuilder without chat data and started typing email or
    // phone first, no draft was ever created and nothing saved.
    const hasAnyData =
      (name && name.trim()) ||
      (client && client.trim()) ||
      (clientPhone && clientPhone.trim()) ||
      (clientEmail && clientEmail.trim()) ||
      (location && location.trim()) ||
      (contractAmount && String(contractAmount).trim());
    if (!hasAnyData) return;

    creatingDraftRef.current = true;
    (async () => {
      try {
        // 1. Look for an existing in-progress draft for this user that
        //    matches the current name + client. Use the most recently
        //    updated one so resuming feels predictable.
        const userId = await getCurrentUserId();
        if (userId) {
          try {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const nameKey = (name || '').trim();
            const clientKey = (client || '').trim();
            let q = supabase
              .from('projects')
              .select('id, name, client_name, updated_at')
              .eq('user_id', userId)
              .eq('status', 'draft')
              .gte('updated_at', since)
              .order('updated_at', { ascending: false })
              .limit(5);
            if (nameKey) q = q.ilike('name', nameKey);
            if (clientKey) q = q.ilike('client_name', clientKey);
            const { data: existingDrafts } = await q;
            const match = (existingDrafts || []).find(d =>
              (d.name || '').trim().toLowerCase() === nameKey.toLowerCase() &&
              (d.client_name || '').trim().toLowerCase() === clientKey.toLowerCase()
            );
            if (match?.id) {
              setProjectId(match.id);
              projectIdRef.current = match.id;
              return;
            }
          } catch (lookupErr) {
            // Lookup failure shouldn't block draft creation
            console.warn('[ProjectBuilder] draft lookup failed', lookupErr?.message);
          }
        }

        // 2. No existing draft → insert one with whatever the user has
        //    typed so far. Subsequent autosaves will update this row.
        const draft = await saveProject({
          ...chatExtractedData,
          projectName: name,
          name,
          client,
          clientPhone,
          email: clientEmail,
          location,
          contractAmount: parseFloat(contractAmount) || 0,
          status: 'draft',
          startDate: toISODate(startDate),
          endDate: toISODate(endDate),
          workingDays,
          services: services && services.length > 0 ? services : undefined,
          phases: undefined, // phases saved in separate upsert pass
        });
        if (draft?.id) {
          setProjectId(draft.id);
          projectIdRef.current = draft.id;
        }
      } catch (e) {
        console.warn('[ProjectBuilder] draft create failed', e);
      } finally {
        creatingDraftRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, client, clientPhone, clientEmail, location, contractAmount]);

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
      name: (p.name || '').trim() || `Phase ${i + 1}`,
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
  }, [buildSavePayload, buildPhasesPayload, startDate, endDate, workingDays]);

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
  }, [name, client, startDate, endDate, phases, contractAmount, selectedSupervisor, selectedWorkerIds, checklistItems, laborRoles, documents.length, linkedEstimateId]);

  const toggleSection = useCallback(
    (k) => setExpandedSections((s) => ({ ...s, [k]: !s[k] })),
    []
  );

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

  // ---- AI Suggest ----
  const handleAISuggestChecklist = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Project name needed', 'Add a project name first so the AI knows what to suggest for.');
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
      setAiSuggestError(e.message || 'Failed to fetch suggestions.');
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
      Alert.alert('Save first', 'Add a project name and client first so the document has somewhere to attach.');
      return;
    }
    setUploadingDoc(true);
    try {
      const result = await pickAndUploadProjectDocument(projectIdRef.current);
      if (result?.canceled) return;
      if (result?.error) {
        Alert.alert('Upload failed', result.error);
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
      Alert.alert('Could not open', 'Failed to generate a viewing link.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Could not open', 'No app available to view this file.');
    }
  }, []);

  const handleDeleteDocument = useCallback((doc) => {
    Alert.alert('Delete document?', doc.file_name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteProjectBuilderDocument(doc.id);
          if (result?.error) {
            Alert.alert('Delete failed', result.error);
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
    Alert.alert('Unlink estimate?', 'This project will no longer be linked to that estimate.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
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
        // Flush any pending debounce first so nothing stale races the final save.
        await flushSaveRef.current?.();

        const payload = buildSavePayload('active');
        payload.phases = buildPhasesPayload();
        // saveProject now handles checklist_items + labor_roles directly.
        const saved = await saveProject(payload);
        if (saved?.error === 'limit_reached') {
          Alert.alert('Project Limit Reached', saved.reason || 'Upgrade your plan to create more projects.');
          return;
        }
        if (!saved?.id) {
          Alert.alert(
            'Save failed',
            "Couldn't save the project — check your connection and try again. Your draft is still here.",
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

        // Graceful partial success: if phases didn't all save, still navigate
        // but tell the user so they can retry from Edit Project.
        if (saved.phaseSaveOk === false) {
          Alert.alert(
            'Project created',
            'Some phases didn\'t save. Open the project and retry from Edit Project.',
            [
              {
                text: 'OK',
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
          'Save failed',
          "Something went wrong saving the project. Your draft is still here — try again in a moment.",
        );
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
                  ? 'Saving…'
                  : autoSaveStatus === 'saved' && lastSavedAt
                  ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : autoSaveStatus === 'error'
                  ? 'Save failed · retrying…'
                  : 'Draft'}
              </Text>
              {autoSaveStatus === 'error' && (
                <TouchableOpacity onPress={() => flushSaveRef.current?.()} style={{ marginLeft: 6 }}>
                  <Text style={{ color: Colors.primaryBlue, fontSize: 11, fontWeight: '700' }}>Retry</Text>
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
              title="Project Basics"
              icon="briefcase-outline"
              sectionKey="basics"
              expanded={expandedSections.basics}
              chip={sectionChip('basics')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.basics && (
              <View style={styles.sectionBody}>
                <LabelRow label="Project Name" required confidence={aiConfidence.name} Colors={Colors} />
                <ThemedInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Kitchen Renovation"
                  required
                  confidence={aiConfidence.name}
                  Colors={Colors}
                />

                <LabelRow label="Client Name" required confidence={aiConfidence.client} Colors={Colors} />
                <ThemedInput
                  value={client}
                  onChangeText={setClient}
                  placeholder="e.g. John Smith"
                  required
                  confidence={aiConfidence.client}
                  Colors={Colors}
                />

                <LabelRow label="Client Phone" confidence={aiConfidence.clientPhone} Colors={Colors} />
                <ThemedInput
                  value={clientPhone}
                  onChangeText={setClientPhone}
                  placeholder="+1 555 123 4567"
                  keyboardType="phone-pad"
                  confidence={aiConfidence.clientPhone}
                  Colors={Colors}
                />

                <LabelRow label="Client Email" confidence={aiConfidence.clientEmail} Colors={Colors} />
                <ThemedInput
                  value={clientEmail}
                  onChangeText={setClientEmail}
                  placeholder="client@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  confidence={aiConfidence.clientEmail}
                  Colors={Colors}
                />

                <LabelRow label="Location" confidence={aiConfidence.location} Colors={Colors} />
                <ThemedInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Project site address"
                  confidence={aiConfidence.location}
                  Colors={Colors}
                />
              </View>
            )}
          </View>

          {/* ============ 2. TIMELINE & WORKING DAYS ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title="Timeline & Working Days"
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
                    <LabelRow label="Start Date" confidence={aiConfidence.startDate} Colors={Colors} />
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
                    <LabelRow label="End Date" confidence={aiConfidence.endDate} Colors={Colors} />
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
            <SectionHeader
              title="Phases"
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
                <LabelRow label="Contract Amount ($)" required confidence={aiConfidence.contractAmount} Colors={Colors} />
                <ThemedInput
                  value={contractAmount}
                  onChangeText={(v) => setContractAmount(sanitizeNumeric(v))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  required
                  confidence={aiConfidence.contractAmount}
                  Colors={Colors}
                />

                {/* Allocation bar */}
                <View style={[styles.allocBar, { backgroundColor: overAllocated ? '#FEE2E2' : '#EFF6FF', borderColor: overAllocated ? '#DC2626' : Colors.primaryBlue + '30', marginTop: 12 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: overAllocated ? '#DC2626' : Colors.primaryText }}>
                    Allocated ${allocatedTotal.toLocaleString()} / Contract ${contractTotal.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 2 }}>
                    {contractTotal > 0
                      ? `${Math.round((allocatedTotal / contractTotal) * 100)}% of contract allocated`
                      : 'Set a contract amount above'}
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

          {/* Financial section removed — Contract Amount now lives at the top
              of the Phases section; trade budgets are entered per-phase via
              Add Phase. */}

          {/* ============ 5. TEAM ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title="Team"
              icon="people-outline"
              sectionKey="team"
              expanded={expandedSections.team}
              chip={sectionChip('team')}
              onToggle={toggleSection}
              Colors={Colors}
            />
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
            <SectionHeader
              title="Daily Checklist & Labor Roles"
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
                  <Text style={[styles.label, { color: Colors.secondaryText, marginBottom: 0 }]}>Checklist Items</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {(checklistItems.length > 0 || laborRoles.length > 0) && (
                      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' }}>
                        {['append', 'replace'].map((mode) => {
                          const active = aiSuggestMode === mode;
                          return (
                            <TouchableOpacity
                              key={mode}
                              onPress={() => setAiSuggestMode(mode)}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                backgroundColor: active ? '#F5F3FF' : 'transparent',
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#7C3AED' : Colors.secondaryText, textTransform: 'capitalize' }}>{mode}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={handleAISuggestChecklist}
                      style={[styles.aiSuggestBtn, { opacity: aiSuggestLoading ? 0.6 : 1 }]}
                      disabled={aiSuggestLoading}
                    >
                      {aiSuggestLoading ? (
                        <ActivityIndicator size="small" color="#7C3AED" />
                      ) : (
                        <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
                      )}
                      <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                        {aiSuggestLoading ? 'Thinking…' : 'Suggest with AI'}
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
                        placeholder="e.g. Site clean at end of day"
                        placeholderTextColor={Colors.placeholderText}
                      />
                      <TouchableOpacity onPress={() => removeChecklistItem(i)}>
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addChecklistItem}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Checklist Item</Text>
                </TouchableOpacity>

                <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 16 }]}>Labor Roles</Text>
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
                  );
                })}
                <TouchableOpacity style={[styles.addRowButton, { borderColor: Colors.primaryBlue }]} onPress={addLaborRole}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Add Labor Role</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ 7. DOCUMENTS (STUB) ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title="Documents"
              icon="document-attach-outline"
              sectionKey="documents"
              expanded={expandedSections.documents}
              chip={sectionChip('documents')}
              onToggle={toggleSection}
              Colors={Colors}
            />
            {expandedSections.documents && (
              <View style={styles.sectionBody}>
                <TouchableOpacity
                  style={[styles.addRowButton, { borderColor: Colors.primaryBlue, opacity: uploadingDoc ? 0.6 : 1 }]}
                  onPress={handleUploadDocument}
                  disabled={uploadingDoc}
                >
                  {uploadingDoc ? (
                    <ActivityIndicator size="small" color={Colors.primaryBlue} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={18} color={Colors.primaryBlue} />
                  )}
                  <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>
                    {uploadingDoc ? 'Uploading…' : 'Upload Document'}
                  </Text>
                </TouchableOpacity>

                {documentsLoading && documents.length === 0 ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={Colors.secondaryText} />
                  </View>
                ) : documents.length === 0 ? (
                  <View style={[styles.emptyStub, { backgroundColor: Colors.lightGray, marginTop: 8 }]}>
                    <Ionicons name="cloud-upload-outline" size={28} color={Colors.secondaryText} />
                    <Text style={{ color: Colors.primaryText, fontWeight: '600', marginTop: 6 }}>No documents yet</Text>
                    <Text style={{ color: Colors.secondaryText, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                      Upload contracts, plans, permits, or photos.
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
                          >
                            <Ionicons name="trash-outline" size={18} color="#DC2626" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ============ 8. LINKED ESTIMATE (STUB) ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title="Linked Estimate"
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
                        Linked Estimate
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.primaryText }}>
                        #{linkedEstimate.estimate_number || '—'}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.primaryText }}>
                        ${(parseFloat(linkedEstimate.total) || 0).toLocaleString()}
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
                      <TouchableOpacity onPress={handleUnlinkEstimate}>
                        <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>Unlink</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addRowButton, { borderColor: Colors.primaryBlue, paddingVertical: 18 }]}
                    onPress={openEstimatePicker}
                  >
                    <Ionicons name="link-outline" size={20} color={Colors.primaryBlue} />
                    <Text style={{ color: Colors.primaryBlue, fontWeight: '700', fontSize: 14 }}>Link an Estimate</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ============ 9. REVIEW & SAVE ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader
              title="Review & Save"
              icon="checkmark-done-outline"
              sectionKey="review"
              expanded={expandedSections.review}
              chip={sectionChip('review')}
              onToggle={toggleSection}
              Colors={Colors}
            />
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
                  <TouchableOpacity onPress={() => setEstimatePickerVisible(false)}>
                    <Text style={{ color: Colors.secondaryText }}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: '700', color: Colors.primaryText }}>Select Estimate</Text>
                  <View style={{ width: 50 }} />
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText, marginBottom: 0 }]}
                    value={estimateSearch}
                    onChangeText={setEstimateSearch}
                    placeholder="Search by client, project, or #"
                    placeholderTextColor={Colors.placeholderText}
                    autoCapitalize="none"
                  />
                </View>
                {estimatesLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={Colors.primaryBlue} />
                  </View>
                ) : filteredEstimates.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ color: Colors.secondaryText, fontSize: 13 }}>
                      {estimateSearch ? 'No matching estimates.' : 'No estimates yet.'}
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
                              {item.client_name || 'No client'}
                              {item.project_name ? ` · ${item.project_name}` : ''}
                            </Text>
                            <Text style={{ color: Colors.secondaryText, fontSize: 11, marginTop: 2 }}>{dateStr}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                            <Text style={{ color: Colors.primaryText, fontWeight: '700', fontSize: 14 }}>
                              ${(parseFloat(item.total) || 0).toLocaleString()}
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
