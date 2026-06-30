import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { analyzeJobsitePhoto } from '../../services/aiService';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWorkerAssignments,
  fetchProjects,
  saveDailyReport,
  uploadPhoto,
  getCurrentUserId
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import { invalidateCacheKey } from '../../hooks/useCachedFetch';
import { useNetwork } from '../../contexts/NetworkContext';
import { queueAction } from '../../services/offlineQueue';
import TodaysChecklistSection from '../../components/TodaysChecklistSection';

const ACCENT = '#1E40AF';

const WEATHER_OPTIONS = [
  { key: 'sunny', icon: 'sunny-outline', label: 'Sunny' },
  { key: 'cloudy', icon: 'cloud-outline', label: 'Cloudy' },
  { key: 'rain', icon: 'rainy-outline', label: 'Rain' },
  { key: 'snow', icon: 'snow-outline', label: 'Snow' },
  { key: 'wind', icon: 'flag-outline', label: 'Windy' },
];

const DELAY_REASONS = ['Weather', 'Materials', 'Inspection', 'Labor', 'Equipment', 'Other'];

export default function DailyReportFormScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('workers');
  const { user, profile } = useAuth();
  const { isOnline } = useNetwork();

  const isOwner = route.params?.isOwner === true;
  const isSupervisor = profile?.role === 'supervisor';
  const routeServicePlanId = route.params?.servicePlanId || null;
  const isServicePlanMode = !!routeServicePlanId;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [servicePlan, setServicePlan] = useState(null); // { id, name, owner_id }

  // Daily checklist + labor roles
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [checklistLogs, setChecklistLogs] = useState({}); // keyed by template_id: { completed, quantity }
  const [laborRoleTemplates, setLaborRoleTemplates] = useState([]);
  const [laborCounts, setLaborCounts] = useState({}); // keyed by role_id: headcount string
  const [existingReportId, setExistingReportId] = useState(null);

  // Core fields (always visible)
  const [workDone, setWorkDone] = useState('');
  const [photos, setPhotos] = useState([]);

  // Optional sections (expandable)
  const [expanded, setExpanded] = useState({});
  const [weather, setWeather] = useState({ conditions: '', temp: '' });
  const [manpower, setManpower] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [delays, setDelays] = useState([]);
  const [safety, setSafety] = useState('');
  const [visitors, setVisitors] = useState([]);
  const [nextDayPlan, setNextDayPlan] = useState('');

  useEffect(() => {
    if (isServicePlanMode) {
      loadServicePlan();
    } else if (isOwner) loadOwnerProjects();
    else if (isSupervisor) loadSupervisorProjects();
    else loadWorkerProjects();
  }, [isOwner, isSupervisor, isServicePlanMode]);

  // Fetch daily checklist templates + labor roles when project/plan changes
  useEffect(() => {
    if (selectedProject) {
      if (selectedProject.isServicePlan) {
        loadChecklistAndRolesForPlan(selectedProject.id);
      } else {
        loadChecklistAndRoles(selectedProject.id);
      }
    } else {
      setChecklistTemplates([]);
      setChecklistLogs({});
      setLaborRoleTemplates([]);
      setLaborCounts({});
      setExistingReportId(null);
    }
  }, [selectedProject]);

  const loadChecklistAndRoles = async (projectId) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const userId = (await supabase.auth.getUser()).data.user?.id;

      // Fetch templates, roles, and today's existing report in parallel
      const [templatesResult, rolesResult, reportResult] = await Promise.all([
        supabase
          .from('daily_checklist_templates')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .or(`specific_date.is.null,specific_date.eq.${today}`)
          .order('sort_order', { ascending: true }),
        supabase
          .from('labor_role_templates')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('daily_service_reports')
          .select('id')
          .eq('project_id', projectId)
          .eq('reporter_id', userId)
          .eq('report_date', today)
          .maybeSingle(),
      ]);

      setChecklistTemplates(templatesResult.data || []);
      setLaborRoleTemplates(rolesResult.data || []);

      // Pre-fill from existing report entries (items already checked off from project detail)
      if (reportResult.data?.id) {
        setExistingReportId(reportResult.data.id);
        const { data: entries } = await supabase
          .from('daily_report_entries')
          .select('*')
          .eq('report_id', reportResult.data.id);

        const logs = {};
        const counts = {};
        (entries || []).forEach(e => {
          if (e.entry_type === 'checklist' && e.checklist_template_id) {
            logs[e.checklist_template_id] = {
              completed: e.completed,
              quantity: e.quantity != null ? String(e.quantity) : '',
            };
          } else if (e.entry_type === 'labor' && e.labor_template_id) {
            counts[e.labor_template_id] = e.quantity != null ? String(Math.round(e.quantity)) : '';
          }
        });
        setChecklistLogs(logs);
        setLaborCounts(counts);
      } else {
        setChecklistLogs({});
        // Pre-fill labor counts from defaults
        const defaults = {};
        (rolesResult.data || []).forEach(r => {
          defaults[r.id] = String(r.default_quantity || 1);
        });
        setLaborCounts(defaults);
        setExistingReportId(null);
      }
    } catch (e) { /* not critical */ }
  };

  const loadChecklistAndRolesForPlan = async (planId) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const [templatesResult, rolesResult, reportResult] = await Promise.all([
        supabase
          .from('daily_checklist_templates')
          .select('*')
          .eq('service_plan_id', planId)
          .eq('is_active', true)
          .or(`specific_date.is.null,specific_date.eq.${today}`)
          .order('sort_order', { ascending: true }),
        supabase
          .from('labor_role_templates')
          .select('*')
          .eq('service_plan_id', planId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('daily_service_reports')
          .select('id')
          .eq('service_plan_id', planId)
          .eq('reporter_id', userId)
          .eq('report_date', today)
          .maybeSingle(),
      ]);

      setChecklistTemplates(templatesResult.data || []);
      setLaborRoleTemplates(rolesResult.data || []);

      if (reportResult.data?.id) {
        setExistingReportId(reportResult.data.id);
        const { data: entries } = await supabase
          .from('daily_report_entries')
          .select('*')
          .eq('report_id', reportResult.data.id);

        const logs = {};
        const counts = {};
        (entries || []).forEach(e => {
          if (e.entry_type === 'checklist' && e.checklist_template_id) {
            logs[e.checklist_template_id] = {
              completed: e.completed,
              quantity: e.quantity != null ? String(e.quantity) : '',
            };
          } else if (e.entry_type === 'labor' && e.labor_template_id) {
            counts[e.labor_template_id] = e.quantity != null ? String(Math.round(e.quantity)) : '';
          }
        });
        setChecklistLogs(logs);
        setLaborCounts(counts);
      } else {
        setChecklistLogs({});
        const defaults = {};
        (rolesResult.data || []).forEach(r => {
          defaults[r.id] = String(r.default_quantity || 1);
        });
        setLaborCounts(defaults);
        setExistingReportId(null);
      }
    } catch (e) { /* not critical */ }
  };

  const toggleChecklistLog = (templateId) => {
    setChecklistLogs(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], completed: !prev[templateId]?.completed },
    }));
  };

  const updateChecklistQuantity = (templateId, value) => {
    setChecklistLogs(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], quantity: value },
    }));
  };

  // Auto-populate manpower when project is selected
  useEffect(() => {
    if (selectedProject && (isOwner || isSupervisor)) {
      loadManpower(selectedProject.id);
    }
  }, [selectedProject]);

  const loadManpower = async (projectId) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('time_tracking')
        .select('worker_id, clock_in, clock_out, workers(full_name, trade)')
        .eq('project_id', projectId)
        .gte('clock_in', todayStart.toISOString());
      if (data && data.length > 0) {
        setManpower(data.map(t => ({
          name: t.workers?.full_name || 'Worker',
          trade: t.workers?.trade || '',
          hours: t.clock_out ? Math.round((new Date(t.clock_out) - new Date(t.clock_in)) / 3600000 * 10) / 10 : 0,
        })));
      }
    } catch (e) { /* not critical */ }
  };

  const loadServicePlan = async () => {
    try {
      setLoading(true);
      const { data: plan } = await supabase
        .from('service_plans')
        .select('id, name, owner_id')
        .eq('id', routeServicePlanId)
        .single();
      if (plan) {
        setServicePlan(plan);
        loadChecklistAndRolesForPlan(routeServicePlanId);
      }
    } catch (e) {
      Alert.alert(t('common:alerts.error'), t('dailyReportForm.loadServicePlanFailed'));
    } finally { setLoading(false); }
  };

  const loadOwnerProjects = async () => {
    try {
      setLoading(true);
      const projects = await fetchProjects();

      // Also fetch active service plans
      const { data: plans } = await supabase
        .from('service_plans')
        .select('id, name, service_type, status')
        .eq('status', 'active')
        .order('name', { ascending: true });

      const planItems = (plans || []).map(p => ({
        ...p,
        isServicePlan: true,
      }));

      setAssignedProjects([...(projects || []), ...planItems]);
    } catch (error) {
      Alert.alert(t('common:alerts.error'), t('dailyReportForm.loadProjectsFailed'));
    } finally { setLoading(false); }
  };

  const loadSupervisorProjects = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();
      const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .or(`assigned_supervisor_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      const { data: plans } = await supabase
        .from('service_plans')
        .select('id, name, service_type, status')
        .eq('status', 'active')
        .order('name', { ascending: true });

      const planItems = (plans || []).map(p => ({ ...p, isServicePlan: true }));
      setAssignedProjects([...(projects || []), ...planItems]);
    } catch (error) {
      Alert.alert(t('common:alerts.error'), t('dailyReportForm.loadProjectsFailed'));
    } finally { setLoading(false); }
  };

  const loadWorkerProjects = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();
      const { data: workerData } = await supabase
        .from('workers').select('id').eq('user_id', currentUserId).single();
      if (!workerData) { setLoading(false); return; }
      setWorkerId(workerData.id);
      const assignments = await getWorkerAssignments(workerData.id);
      const projects = assignments.projects?.filter(Boolean) || [];
      const plans = (assignments.servicePlans || []).map(p => ({ ...p, isServicePlan: true }));
      setAssignedProjects([...projects, ...plans]);
    } catch (error) {
      Alert.alert(t('common:alerts.error'), t('dailyReportForm.loadProjectsFailed'));
    } finally { setLoading(false); }
  };

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  /**
   * After the FIRST photo is added and workDone is still empty, run vision
   * on it and pre-fill workDone with a short summary. Silent on failure —
   * user can always type manually. Idempotent: only fires once per session
   * to avoid overwriting on subsequent photo additions.
   */
  const [didAutoFillWorkDone, setDidAutoFillWorkDone] = useState(false);
  const autoFillFromPhoto = async (uri) => {
    if (didAutoFillWorkDone) return;
    if (workDone && workDone.trim().length > 5) return; // user already wrote something
    try {
      setDidAutoFillWorkDone(true);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const r = await analyzeJobsitePhoto(base64);
      if (r?.workDone && (!workDone || workDone.trim().length < 5)) {
        setWorkDone(r.workDone);
      }
      // If a safety concern surfaced, prepend to the safety field
      if (r?.safetyNote) {
        setSafety(prev => prev ? `${prev}\n${r.safetyNote}` : r.safetyNote);
      }
    } catch (e) {
      // Silent — non-fatal. Reset the gate so the next photo can retry.
      setDidAutoFillWorkDone(false);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('dailyReportForm.permissionNeeded'), t('dailyReportForm.photoLibraryRequired')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setPhotos(prev => [...prev, ...uris]);
      if (uris[0]) autoFillFromPhoto(uris[0]); // fire-and-forget
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('dailyReportForm.permissionNeeded'), t('dailyReportForm.cameraRequired')); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setPhotos(prev => [...prev, uri]);
      autoFillFromPhoto(uri);
    }
  };

  const addListItem = (setter, defaultItem) => setter(prev => [...prev, defaultItem]);
  const updateListItem = (setter, index, field, value) => setter(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  const removeListItem = (setter, index) => setter(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!isOnline) {
      Alert.alert(t('dailyReportForm.offline'), t('dailyReportForm.offlineMessage'));
      return;
    }
    if (!isServicePlanMode && !selectedProject) { Alert.alert(t('dailyReportForm.required'), t('dailyReportForm.selectProjectRequired')); return; }
    if (!workDone.trim()) { Alert.alert(t('dailyReportForm.required'), t('dailyReportForm.describeWorkRequired')); return; }

    const parentOwnerId = isServicePlanMode ? servicePlan?.owner_id : (selectedProject.user_id || selectedProject.owner_id || null);

    try {
      setSubmitting(true);

      // Upload photos. uploadPhoto returns null (does not throw) on failure,
      // so track failures and let the user decide before saving a report with
      // a shorter/empty photos array.
      const uploadedUrls = [];
      let failedPhotos = 0;
      for (const uri of photos) {
        const url = await uploadPhoto(uri, 'daily-reports');
        if (url) uploadedUrls.push(url);
        else failedPhotos += 1;
      }

      if (failedPhotos > 0) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            t('dailyReportForm.photoUploadFailed'),
            failedPhotos > 1
              ? t('dailyReportForm.photosUploadFailedBody', { count: failedPhotos })
              : t('dailyReportForm.photoUploadFailedBody'),
            [
              { text: t('common:actions.cancel'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('dailyReportForm.submitAnyway'), onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) { setSubmitting(false); return; }
      }

      // Build report with new fields
      const reportData = {
        project_id: (isServicePlanMode || selectedProject?.isServicePlan) ? null : selectedProject.id,
        service_plan_id: isServicePlanMode ? routeServicePlanId : (selectedProject?.isServicePlan ? selectedProject.id : null),
        phase_id: null,
        report_date: new Date().toISOString().split('T')[0],
        photos: uploadedUrls,
        completed_steps: [],
        custom_tasks: [],
        notes: '',
        tags: [workDone.trim()],
        // New fields
        weather: weather.conditions ? weather : null,
        manpower: manpower.length > 0 ? manpower : null,
        work_performed: [{ description: workDone.trim() }],
        materials: materials.length > 0 ? materials : null,
        equipment: equipment.length > 0 ? equipment : null,
        delays: delays.length > 0 ? delays : null,
        safety: safety.trim() ? { observations: safety.trim() } : null,
        visitors: visitors.length > 0 ? visitors : null,
        next_day_plan: nextDayPlan.trim() || null,
      };

      if (isOwner || !workerId) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        reportData.owner_id = userId;
        reportData.worker_id = null;
        reportData.reporter_type = isOwner ? 'owner' : 'supervisor';
      } else {
        reportData.worker_id = workerId;
        reportData.owner_id = null;
        reportData.reporter_type = 'worker';
      }

      const { error } = await supabase.from('daily_reports').insert(reportData).select('id').single();
      if (error) throw error;

      // Submit daily checklist + labor entries
      const logsToSubmit = Object.entries(checklistLogs).filter(([_, log]) => log.completed || log.quantity);
      const laborToSubmit = Object.entries(laborCounts).filter(([_, count]) => count && parseFloat(count) > 0);
      const hasChecklistOrLabor = logsToSubmit.length > 0 || laborToSubmit.length > 0;

      if (hasChecklistOrLabor) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const today = new Date().toISOString().split('T')[0];
        try {
          // Find or create today's daily service report
          const parentFilter = isServicePlanMode
            ? { service_plan_id: routeServicePlanId }
            : { project_id: selectedProject.id };

          let reportId = existingReportId;
          if (!reportId) {
            let query = supabase
              .from('daily_service_reports')
              .select('id')
              .eq('reporter_id', userId)
              .eq('report_date', today);
            if (isServicePlanMode) query = query.eq('service_plan_id', routeServicePlanId);
            else query = query.eq('project_id', selectedProject.id);

            let { data: existing } = await query.maybeSingle();

            if (existing) {
              reportId = existing.id;
            } else {
              // Resolve the project/plan OWNER explicitly. selectedProject (from
              // getWorkerAssignments) doesn't include user_id, so parentOwnerId is
              // null in project mode and would fall back to the worker's own id.
              let resolvedOwnerId = parentOwnerId;
              if (!resolvedOwnerId && !isServicePlanMode && selectedProject?.id) {
                const { data: ownerRow } = await supabase
                  .from('projects')
                  .select('user_id')
                  .eq('id', selectedProject.id)
                  .single();
                resolvedOwnerId = ownerRow?.user_id || null;
              }

              const { data: newReport } = await supabase
                .from('daily_service_reports')
                .insert({
                  ...parentFilter,
                  owner_id: resolvedOwnerId || userId,
                  reporter_id: userId,
                  report_date: today,
                })
                .select()
                .single();
              reportId = newReport?.id;
            }
          }

          if (reportId) {
            // Delete existing entries and re-insert all
            await supabase.from('daily_report_entries')
              .delete()
              .eq('report_id', reportId);

            const allEntries = [];

            // Checklist entries
            logsToSubmit.forEach(([templateId, log]) => {
              const template = checklistTemplates.find(t => t.id === templateId);
              allEntries.push({
                report_id: reportId,
                entry_type: 'checklist',
                checklist_template_id: templateId,
                title: template?.title || 'Unknown',
                completed: log.completed || false,
                quantity: log.quantity ? parseFloat(log.quantity) : null,
                quantity_unit: template?.quantity_unit || null,
                sort_order: template?.sort_order || 0,
              });
            });

            // Labor entries
            laborToSubmit.forEach(([roleId, count]) => {
              const role = laborRoleTemplates.find(r => r.id === roleId);
              allEntries.push({
                report_id: reportId,
                entry_type: 'labor',
                labor_template_id: roleId,
                title: role?.role_name || 'Unknown',
                quantity: parseFloat(count) || 0,
                sort_order: (role?.sort_order || 0) + 1000, // labor after checklist
              });
            });

            if (allEntries.length > 0) {
              await supabase.from('daily_report_entries').insert(allEntries);
            }

            // Mark the daily_service_reports as submitted (keeps data for detail view)
            await supabase.from('daily_service_reports')
              .update({ notes: 'submitted' })
              .eq('id', reportId);
          }
        } catch (e) {
          console.warn('Failed to save daily checklist/labor entries:', e);
        }
      } else {
        // Mark any existing checklist report as submitted
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const today = new Date().toISOString().split('T')[0];
        const isSelectedPlan = isServicePlanMode || selectedProject?.isServicePlan;
        const parentId = isServicePlanMode ? routeServicePlanId : selectedProject?.id;

        let updateQuery = supabase
          .from('daily_service_reports')
          .update({ notes: 'submitted' })
          .eq('reporter_id', userId)
          .eq('report_date', today);

        if (isSelectedPlan) updateQuery = updateQuery.eq('service_plan_id', parentId);
        else updateQuery = updateQuery.eq('project_id', parentId);

        await updateQuery;
      }

      // Invalidate the owner Reports cache so an already-mounted owner Reports
      // tab refreshes with this freshly submitted report.
      await invalidateCacheKey('owner:dailyReports');

      Alert.alert(t('common:alerts.success'), t('dailyReportForm.reportSubmitted'), [{ text: t('dailyReportForm.ok'), onPress: () => navigation.goBack() }]);
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert(t('common:alerts.error'), t('dailyReportForm.submitFailed'));
    } finally { setSubmitting(false); }
  };

  const filledCount = (key) => {
    switch (key) {
      case 'weather': return weather.conditions ? 1 : 0;
      case 'manpower': return manpower.length;
      case 'materials': return materials.length;
      case 'equipment': return equipment.length;
      case 'delays': return delays.length;
      case 'safety': return safety.trim() ? 1 : 0;
      case 'visitors': return visitors.length;
      case 'tomorrow': return nextDayPlan.trim() ? 1 : 0;
      default: return 0;
    }
  };

  const SectionHeader = ({ sectionKey, icon, title }) => {
    const count = filledCount(sectionKey);
    const isOpen = expanded[sectionKey];
    return (
      <TouchableOpacity
        style={[styles.optionalHeader, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
        onPress={() => toggle(sectionKey)}
        activeOpacity={0.7}
        testID={`dailyReportForm.section.${sectionKey}Button`}
        accessibilityLabel={`dailyReportForm.section.${sectionKey}Button`}
      >
        <Ionicons name={icon} size={18} color={count > 0 ? ACCENT : Colors.secondaryText} />
        <Text style={[styles.optionalTitle, { color: count > 0 ? Colors.primaryText : Colors.secondaryText }]}>{title}</Text>
        {count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        )}
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            testID="dailyReportForm.backButton"
            accessibilityLabel="dailyReportForm.backButton"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: Colors.primaryText }]}
            testID="dailyReportForm.headerTitle"
            accessibilityLabel="dailyReportForm.headerTitle"
          >
            {t('dailyReportForm.dailyLog')}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Project/Plan Selection */}
          {isServicePlanMode ? (
            <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('dailyReportForm.servicePlan')}</Text>
              <View style={[styles.projectChip, { borderColor: ACCENT, backgroundColor: ACCENT + '10', alignSelf: 'flex-start' }]}>
                <Text style={[styles.projectChipText, { color: ACCENT }]}>{servicePlan?.name || t('common:status.loading')}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
              <Text
                style={[styles.cardTitle, { color: Colors.primaryText }]}
                testID="dailyReportForm.projectSelectTitle"
                accessibilityLabel="dailyReportForm.projectSelectTitle"
              >
                {t('dailyReportForm.projectOrServicePlan')}
              </Text>
              {assignedProjects.length === 0 ? (
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('dailyReportForm.noProjectsAvailable')}</Text>
              ) : (
                <TouchableOpacity
                  style={[styles.dropdownBtn, { borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                  testID="dailyReportForm.projectSelectButton"
                  accessibilityLabel="dailyReportForm.projectSelectButton"
                  onPress={() => {
                    const labels = assignedProjects.map(p => `${p.isServicePlan ? '🔄 ' : '📋 '}${p.name}`);
                    labels.push(t('common:actions.cancel'));
                    if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                        { options: labels, cancelButtonIndex: labels.length - 1, title: t('dailyReportForm.selectProjectOrPlan') },
                        (idx) => { if (idx < assignedProjects.length) setSelectedProject(assignedProjects[idx]); }
                      );
                    } else {
                      Alert.alert(t('dailyReportForm.select'), '', labels.slice(0, -1).map((label, idx) => ({
                        text: label,
                        onPress: () => setSelectedProject(assignedProjects[idx]),
                      })).concat([{ text: t('common:actions.cancel'), style: 'cancel' }]));
                    }
                  }}
                >
                  <Ionicons name={selectedProject?.isServicePlan ? 'refresh-circle-outline' : 'briefcase-outline'} size={18} color={selectedProject ? ACCENT : Colors.secondaryText} />
                  <Text style={[styles.dropdownText, { color: selectedProject ? Colors.primaryText : Colors.placeholderText }]} numberOfLines={1}>
                    {selectedProject ? selectedProject.name : t('dailyReportForm.selectProjectPlaceholder')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {(selectedProject || isServicePlanMode) && (
            <>
              {/* Today's Checklist — phase tasks scheduled for TODAY for this
                  project. Distinct from the recurring Daily Checklist below.
                  Hidden in service-plan mode (today's checklist is project-
                  scoped only; service plans use their own visit model). */}
              {selectedProject && !isServicePlanMode && (
                <TodaysChecklistSection
                  projectId={selectedProject.id}
                  userRole={isOwner ? 'owner' : isSupervisor ? 'supervisor' : 'worker'}
                />
              )}

              {/* Daily Checklist */}
              {checklistTemplates.length > 0 && (
                <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('dailyReportForm.dailyChecklist')}</Text>
                  {checklistTemplates.map(template => {
                    const log = checklistLogs[template.id] || {};
                    return (
                      <View key={template.id} style={[styles.recurringTaskRow, { borderBottomColor: Colors.border }]}>
                        <TouchableOpacity
                          onPress={() => toggleChecklistLog(template.id)}
                          style={styles.recurringCheckbox}
                        >
                          <Ionicons
                            name={log.completed ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={log.completed ? '#10B981' : Colors.secondaryText}
                          />
                        </TouchableOpacity>
                        <Text style={[styles.recurringTaskTitle, { color: Colors.primaryText }, log.completed && styles.recurringTaskDone]} numberOfLines={1}>
                          {template.title}
                        </Text>
                        {template.item_type === 'quantity' && (
                          <View style={styles.recurringQuantityWrap}>
                            <TextInput
                              style={[styles.recurringQuantityInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                              value={log.quantity || ''}
                              onChangeText={(val) => updateChecklistQuantity(template.id, val)}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={Colors.secondaryText}
                            />
                            <Text style={[styles.recurringUnit, { color: Colors.secondaryText }]}>
                              {template.quantity_unit || ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Labor Roles */}
              {laborRoleTemplates.length > 0 && (
                <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Ionicons name="people-outline" size={18} color="#10B981" />
                    <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('dailyReportForm.crewToday')}</Text>
                  </View>
                  {laborRoleTemplates.map(role => (
                    <View key={role.id} style={[styles.laborRoleRow, { borderBottomColor: Colors.border }]}>
                      <Ionicons name="person-outline" size={16} color="#10B981" />
                      <Text style={[styles.laborRoleName, { color: Colors.primaryText }]}>{role.role_name}</Text>
                      <TextInput
                        style={[styles.laborCountInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                        value={laborCounts[role.id] || ''}
                        onChangeText={(val) => setLaborCounts(prev => ({ ...prev, [role.id]: val.replace(/[^0-9]/g, '') }))}
                        keyboardType="numeric"
                        placeholder={String(role.default_quantity || 1)}
                        placeholderTextColor={Colors.secondaryText + '60'}
                        selectTextOnFocus
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* Work Done — always visible, required */}
              <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('dailyReportForm.workPerformed')}</Text>
                <TextInput
                  style={[styles.textArea, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background }]}
                  value={workDone}
                  onChangeText={setWorkDone}
                  placeholder={t('dailyReportForm.workPerformedPlaceholder')}
                  placeholderTextColor={Colors.secondaryText}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Photos — always visible */}
              <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('dailyReportForm.photos')}</Text>
                <View style={styles.photoRow}>
                  <TouchableOpacity style={[styles.photoBtn, { backgroundColor: ACCENT }]} onPress={handleTakePhoto}>
                    <Ionicons name="camera" size={18} color="#FFF" />
                    <Text style={styles.photoBtnText}>{t('dailyReportForm.camera')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.photoBtn, { backgroundColor: ACCENT }]} onPress={handlePickImage}>
                    <Ionicons name="images" size={18} color="#FFF" />
                    <Text style={styles.photoBtnText}>{t('dailyReportForm.gallery')}</Text>
                  </TouchableOpacity>
                </View>
                {photos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                    {photos.map((uri, i) => (
                      <View key={i} style={styles.photoThumbWrap}>
                        <Image source={{ uri }} style={styles.photoThumb} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}>
                          <Ionicons name="close-circle" size={22} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Optional Sections */}
              <Text style={[styles.optionalLabel, { color: Colors.secondaryText }]}>{t('dailyReportForm.additionalDetails')}</Text>

              {/* Weather */}
              <SectionHeader sectionKey="weather" icon="partly-sunny-outline" title={t('dailyReportForm.weather')} />
              {expanded.weather && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  <View style={styles.weatherRow}>
                    {WEATHER_OPTIONS.map(w => (
                      <TouchableOpacity
                        key={w.key}
                        style={[styles.weatherChip, weather.conditions === w.key && { backgroundColor: ACCENT + '15', borderColor: ACCENT }]}
                        onPress={() => setWeather(prev => ({ ...prev, conditions: prev.conditions === w.key ? '' : w.key }))}
                      >
                        <Ionicons name={w.icon} size={20} color={weather.conditions === w.key ? ACCENT : Colors.secondaryText} />
                        <Text style={[styles.weatherChipText, { color: weather.conditions === w.key ? ACCENT : Colors.secondaryText }]}>{w.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.tempRow}>
                    <Text style={[styles.tempLabel, { color: Colors.secondaryText }]}>{t('dailyReportForm.temp')}</Text>
                    <TextInput
                      style={[styles.tempInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                      value={weather.temp}
                      onChangeText={(v) => setWeather(prev => ({ ...prev, temp: v.replace(/[^0-9]/g, '') }))}
                      placeholder="72"
                      placeholderTextColor={Colors.secondaryText}
                      keyboardType="number-pad"
                      maxLength={3}
                    />
                    <Text style={[styles.tempUnit, { color: Colors.secondaryText }]}>°F</Text>
                  </View>
                </View>
              )}

              {/* Manpower */}
              <SectionHeader sectionKey="manpower" icon="people-outline" title={t('dailyReportForm.manpower')} />
              {expanded.manpower && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {manpower.map((m, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 2, color: Colors.primaryText, borderColor: Colors.border }]} value={m.name} onChangeText={v => updateListItem(setManpower, i, 'name', v)} placeholder={t('dailyReportForm.name')} placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={m.trade} onChangeText={v => updateListItem(setManpower, i, 'trade', v)} placeholder={t('dailyReportForm.trade')} placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { width: 45, color: Colors.primaryText, borderColor: Colors.border }]} value={String(m.hours || '')} onChangeText={v => updateListItem(setManpower, i, 'hours', v)} placeholder={t('dailyReportForm.hrs')} placeholderTextColor={Colors.secondaryText} keyboardType="decimal-pad" />
                      <TouchableOpacity onPress={() => removeListItem(setManpower, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setManpower, { name: '', trade: '', hours: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>{t('dailyReportForm.addPerson')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Materials */}
              <SectionHeader sectionKey="materials" icon="cube-outline" title={t('dailyReportForm.materials')} />
              {expanded.materials && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {materials.map((m, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 2, color: Colors.primaryText, borderColor: Colors.border }]} value={m.description} onChangeText={v => updateListItem(setMaterials, i, 'description', v)} placeholder={t('dailyReportForm.material')} placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { width: 50, color: Colors.primaryText, borderColor: Colors.border }]} value={m.quantity} onChangeText={v => updateListItem(setMaterials, i, 'quantity', v)} placeholder={t('dailyReportForm.qty')} placeholderTextColor={Colors.secondaryText} keyboardType="decimal-pad" />
                      <TouchableOpacity onPress={() => removeListItem(setMaterials, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setMaterials, { description: '', quantity: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>{t('dailyReportForm.addMaterial')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Equipment */}
              <SectionHeader sectionKey="equipment" icon="construct-outline" title={t('dailyReportForm.equipment')} />
              {expanded.equipment && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {equipment.map((e, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 2, color: Colors.primaryText, borderColor: Colors.border }]} value={e.name} onChangeText={v => updateListItem(setEquipment, i, 'name', v)} placeholder={t('dailyReportForm.equipmentName')} placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { width: 45, color: Colors.primaryText, borderColor: Colors.border }]} value={String(e.hours || '')} onChangeText={v => updateListItem(setEquipment, i, 'hours', v)} placeholder={t('dailyReportForm.hrs')} placeholderTextColor={Colors.secondaryText} keyboardType="decimal-pad" />
                      <TouchableOpacity onPress={() => removeListItem(setEquipment, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setEquipment, { name: '', hours: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>{t('dailyReportForm.addEquipment')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Delays */}
              <SectionHeader sectionKey="delays" icon="warning-outline" title={t('dailyReportForm.delaysIssues')} />
              {expanded.delays && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {delays.map((d, i) => (
                    <View key={i} style={{ gap: 8, marginBottom: 10 }}>
                      <View style={styles.listItemRow}>
                        <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={d.description} onChangeText={v => updateListItem(setDelays, i, 'description', v)} placeholder={t('dailyReportForm.whatHappened')} placeholderTextColor={Colors.secondaryText} />
                        <TouchableOpacity onPress={() => removeListItem(setDelays, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {DELAY_REASONS.map(r => (
                            <TouchableOpacity
                              key={r}
                              style={[styles.reasonChip, d.reason === r && { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}
                              onPress={() => updateListItem(setDelays, i, 'reason', r)}
                            >
                              <Text style={[styles.reasonText, { color: d.reason === r ? '#F59E0B' : Colors.secondaryText }]}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setDelays, { description: '', reason: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>{t('dailyReportForm.addDelay')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Safety */}
              <SectionHeader sectionKey="safety" icon="shield-checkmark-outline" title={t('dailyReportForm.safety')} />
              {expanded.safety && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  <TextInput
                    style={[styles.textArea, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background, minHeight: 60 }]}
                    value={safety}
                    onChangeText={setSafety}
                    placeholder={t('dailyReportForm.safetyPlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* Visitors */}
              <SectionHeader sectionKey="visitors" icon="person-add-outline" title={t('dailyReportForm.visitors')} />
              {expanded.visitors && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {visitors.map((v, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={v.name} onChangeText={val => updateListItem(setVisitors, i, 'name', val)} placeholder={t('dailyReportForm.name')} placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={v.purpose} onChangeText={val => updateListItem(setVisitors, i, 'purpose', val)} placeholder={t('dailyReportForm.purpose')} placeholderTextColor={Colors.secondaryText} />
                      <TouchableOpacity onPress={() => removeListItem(setVisitors, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setVisitors, { name: '', purpose: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>{t('dailyReportForm.addVisitor')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tomorrow's Plan */}
              <SectionHeader sectionKey="tomorrow" icon="calendar-outline" title={t('dailyReportForm.tomorrowsPlan')} />
              {expanded.tomorrow && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  <TextInput
                    style={[styles.textArea, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background, minHeight: 60 }]}
                    value={nextDayPlan}
                    onChangeText={setNextDayPlan}
                    placeholder={t('dailyReportForm.tomorrowPlaceholder')}
                    placeholderTextColor={Colors.secondaryText}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: submitting ? Colors.border : ACCENT }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                    <Text style={styles.submitText}>{t('dailyReportForm.submitDailyLog')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  scrollContent: { padding: Spacing.lg, gap: 12 },

  // Cards
  card: { borderRadius: 14, padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 13, fontStyle: 'italic' },

  // Project chips
  projectScroll: { flexGrow: 0 },
  projectChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginRight: 8 },
  projectChipText: { fontSize: 14, fontWeight: '600' },
  dropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  dropdownText: { flex: 1, fontSize: 15, fontWeight: '500' },

  // Text area
  textArea: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 15, minHeight: 80 },

  // Photos
  photoRow: { flexDirection: 'row', gap: 8 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  photoBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  photoThumbWrap: { marginRight: 8, position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: 10 },
  photoRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FFF', borderRadius: 11 },

  // Optional sections
  optionalLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 8, marginBottom: 2 },
  optionalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  optionalTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  countBadge: { backgroundColor: '#1E40AF', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  countText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  expandedCard: { borderRadius: 12, padding: 14, gap: 8, marginTop: -4 },

  // Weather
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weatherChip: { alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  weatherChipText: { fontSize: 11, fontWeight: '500' },
  tempRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tempLabel: { fontSize: 13, fontWeight: '500' },
  tempInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, fontSize: 16, fontWeight: '700', width: 60, textAlign: 'center' },
  tempUnit: { fontSize: 14 },

  // List items
  listItemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },

  // Add button
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontWeight: '600' },

  // Delay reasons
  reasonChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  reasonText: { fontSize: 12, fontWeight: '500' },

  // Submit
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Recurring daily tasks
  recurringTaskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  recurringCheckbox: { paddingRight: 2 },
  recurringTaskTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  recurringTaskDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  recurringQuantityWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recurringQuantityInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, width: 56, fontSize: 14, textAlign: 'center' },
  recurringUnit: { fontSize: 12, minWidth: 30 },

  // Labor roles
  laborRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  laborRoleName: { flex: 1, fontSize: 14, fontWeight: '500' },
  laborCountInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 52, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
