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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  const { user, profile } = useAuth();

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
      Alert.alert('Error', 'Failed to load service plan');
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
      Alert.alert(t('alerts.error'), 'Failed to load projects');
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
      setAssignedProjects(projects || []);
    } catch (error) {
      Alert.alert(t('alerts.error'), 'Failed to load projects');
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
      setAssignedProjects(assignments.projects?.filter(Boolean) || []);
    } catch (error) {
      Alert.alert(t('alerts.error'), 'Failed to load projects');
    } finally { setLoading(false); }
  };

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled) setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setPhotos(prev => [...prev, result.assets[0].uri]);
  };

  const addListItem = (setter, defaultItem) => setter(prev => [...prev, defaultItem]);
  const updateListItem = (setter, index, field, value) => setter(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  const removeListItem = (setter, index) => setter(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!isServicePlanMode && !selectedProject) { Alert.alert('Required', 'Select a project or service plan'); return; }
    if (!workDone.trim()) { Alert.alert('Required', 'Describe what was done today'); return; }

    const isSelectedPlan = isServicePlanMode || selectedProject?.isServicePlan;
    const parentId = isServicePlanMode ? routeServicePlanId : selectedProject.id;
    const parentOwnerId = isServicePlanMode ? servicePlan?.owner_id : (selectedProject.user_id || selectedProject.owner_id || null);

    try {
      setSubmitting(true);

      // Upload photos
      const uploadedUrls = [];
      for (const uri of photos) {
        const url = await uploadPhoto(uri, parentId);
        if (url) uploadedUrls.push(url);
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
              const { data: newReport } = await supabase
                .from('daily_service_reports')
                .insert({
                  ...parentFilter,
                  owner_id: parentOwnerId || userId,
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

      Alert.alert('Success', 'Daily report submitted', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report');
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Daily Log</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Project/Plan Selection */}
          {isServicePlanMode ? (
            <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Service Plan</Text>
              <View style={[styles.projectChip, { borderColor: ACCENT, backgroundColor: ACCENT + '10', alignSelf: 'flex-start' }]}>
                <Text style={[styles.projectChipText, { color: ACCENT }]}>{servicePlan?.name || 'Loading...'}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Project / Service Plan</Text>
              {assignedProjects.length === 0 ? (
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No projects or service plans available</Text>
              ) : (
                <TouchableOpacity
                  style={[styles.dropdownBtn, { borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                  onPress={() => {
                    const labels = assignedProjects.map(p => `${p.isServicePlan ? '🔄 ' : '📋 '}${p.name}`);
                    labels.push('Cancel');
                    if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                        { options: labels, cancelButtonIndex: labels.length - 1, title: 'Select Project or Service Plan' },
                        (idx) => { if (idx < assignedProjects.length) setSelectedProject(assignedProjects[idx]); }
                      );
                    } else {
                      Alert.alert('Select', '', labels.slice(0, -1).map((label, idx) => ({
                        text: label,
                        onPress: () => setSelectedProject(assignedProjects[idx]),
                      })).concat([{ text: 'Cancel', style: 'cancel' }]));
                    }
                  }}
                >
                  <Ionicons name={selectedProject?.isServicePlan ? 'refresh-circle-outline' : 'briefcase-outline'} size={18} color={selectedProject ? ACCENT : Colors.secondaryText} />
                  <Text style={[styles.dropdownText, { color: selectedProject ? Colors.primaryText : Colors.placeholderText }]} numberOfLines={1}>
                    {selectedProject ? selectedProject.name : 'Select a project or service plan...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {(selectedProject || isServicePlanMode) && (
            <>
              {/* Daily Checklist */}
              {checklistTemplates.length > 0 && (
                <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Daily Checklist</Text>
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
                    <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Crew Today</Text>
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
                <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Work Performed *</Text>
                <TextInput
                  style={[styles.textArea, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background }]}
                  value={workDone}
                  onChangeText={setWorkDone}
                  placeholder="What was done on site today..."
                  placeholderTextColor={Colors.secondaryText}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Photos — always visible */}
              <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Photos</Text>
                <View style={styles.photoRow}>
                  <TouchableOpacity style={[styles.photoBtn, { backgroundColor: ACCENT }]} onPress={handleTakePhoto}>
                    <Ionicons name="camera" size={18} color="#FFF" />
                    <Text style={styles.photoBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.photoBtn, { backgroundColor: ACCENT }]} onPress={handlePickImage}>
                    <Ionicons name="images" size={18} color="#FFF" />
                    <Text style={styles.photoBtnText}>Gallery</Text>
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
              <Text style={[styles.optionalLabel, { color: Colors.secondaryText }]}>ADDITIONAL DETAILS</Text>

              {/* Weather */}
              <SectionHeader sectionKey="weather" icon="partly-sunny-outline" title="Weather" />
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
                    <Text style={[styles.tempLabel, { color: Colors.secondaryText }]}>Temp:</Text>
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
              <SectionHeader sectionKey="manpower" icon="people-outline" title="Manpower" />
              {expanded.manpower && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {manpower.map((m, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 2, color: Colors.primaryText, borderColor: Colors.border }]} value={m.name} onChangeText={v => updateListItem(setManpower, i, 'name', v)} placeholder="Name" placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={m.trade} onChangeText={v => updateListItem(setManpower, i, 'trade', v)} placeholder="Trade" placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { width: 45, color: Colors.primaryText, borderColor: Colors.border }]} value={String(m.hours || '')} onChangeText={v => updateListItem(setManpower, i, 'hours', v)} placeholder="Hrs" placeholderTextColor={Colors.secondaryText} keyboardType="decimal-pad" />
                      <TouchableOpacity onPress={() => removeListItem(setManpower, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setManpower, { name: '', trade: '', hours: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>Add Person</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Materials */}
              <SectionHeader sectionKey="materials" icon="cube-outline" title="Materials" />
              {expanded.materials && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {materials.map((m, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 2, color: Colors.primaryText, borderColor: Colors.border }]} value={m.description} onChangeText={v => updateListItem(setMaterials, i, 'description', v)} placeholder="Material" placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { width: 50, color: Colors.primaryText, borderColor: Colors.border }]} value={m.quantity} onChangeText={v => updateListItem(setMaterials, i, 'quantity', v)} placeholder="Qty" placeholderTextColor={Colors.secondaryText} keyboardType="decimal-pad" />
                      <TouchableOpacity onPress={() => removeListItem(setMaterials, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setMaterials, { description: '', quantity: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>Add Material</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Equipment */}
              <SectionHeader sectionKey="equipment" icon="construct-outline" title="Equipment" />
              {expanded.equipment && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {equipment.map((e, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 2, color: Colors.primaryText, borderColor: Colors.border }]} value={e.name} onChangeText={v => updateListItem(setEquipment, i, 'name', v)} placeholder="Equipment" placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { width: 45, color: Colors.primaryText, borderColor: Colors.border }]} value={String(e.hours || '')} onChangeText={v => updateListItem(setEquipment, i, 'hours', v)} placeholder="Hrs" placeholderTextColor={Colors.secondaryText} keyboardType="decimal-pad" />
                      <TouchableOpacity onPress={() => removeListItem(setEquipment, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setEquipment, { name: '', hours: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>Add Equipment</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Delays */}
              <SectionHeader sectionKey="delays" icon="warning-outline" title="Delays / Issues" />
              {expanded.delays && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {delays.map((d, i) => (
                    <View key={i} style={{ gap: 8, marginBottom: 10 }}>
                      <View style={styles.listItemRow}>
                        <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={d.description} onChangeText={v => updateListItem(setDelays, i, 'description', v)} placeholder="What happened" placeholderTextColor={Colors.secondaryText} />
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
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>Add Delay</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Safety */}
              <SectionHeader sectionKey="safety" icon="shield-checkmark-outline" title="Safety" />
              {expanded.safety && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  <TextInput
                    style={[styles.textArea, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background, minHeight: 60 }]}
                    value={safety}
                    onChangeText={setSafety}
                    placeholder="Any incidents, observations, or toolbox talks..."
                    placeholderTextColor={Colors.secondaryText}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* Visitors */}
              <SectionHeader sectionKey="visitors" icon="person-add-outline" title="Visitors" />
              {expanded.visitors && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  {visitors.map((v, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={v.name} onChangeText={val => updateListItem(setVisitors, i, 'name', val)} placeholder="Name" placeholderTextColor={Colors.secondaryText} />
                      <TextInput style={[styles.listInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border }]} value={v.purpose} onChangeText={val => updateListItem(setVisitors, i, 'purpose', val)} placeholder="Purpose" placeholderTextColor={Colors.secondaryText} />
                      <TouchableOpacity onPress={() => removeListItem(setVisitors, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addListItem(setVisitors, { name: '', purpose: '' })}>
                    <Ionicons name="add" size={16} color={ACCENT} />
                    <Text style={[styles.addBtnText, { color: ACCENT }]}>Add Visitor</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tomorrow's Plan */}
              <SectionHeader sectionKey="tomorrow" icon="calendar-outline" title="Tomorrow's Plan" />
              {expanded.tomorrow && (
                <View style={[styles.expandedCard, { backgroundColor: Colors.cardBackground }]}>
                  <TextInput
                    style={[styles.textArea, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background, minHeight: 60 }]}
                    value={nextDayPlan}
                    onChangeText={setNextDayPlan}
                    placeholder="What's planned for tomorrow..."
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
                    <Text style={styles.submitText}>Submit Daily Log</Text>
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
