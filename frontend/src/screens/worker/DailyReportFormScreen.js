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

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);

  // Recurring daily tasks
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [taskLogs, setTaskLogs] = useState({}); // keyed by recurring_task_id: { completed, quantity }

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
    if (isOwner) loadOwnerProjects();
    else if (isSupervisor) loadSupervisorProjects();
    else loadWorkerProjects();
  }, [isOwner, isSupervisor]);

  // Fetch recurring tasks when project changes
  useEffect(() => {
    if (selectedProject) {
      loadRecurringTasks(selectedProject.id);
    } else {
      setRecurringTasks([]);
      setTaskLogs({});
    }
  }, [selectedProject]);

  const loadRecurringTasks = async (projectId) => {
    try {
      const { data } = await supabase
        .from('project_recurring_tasks')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      setRecurringTasks(data || []);
      setTaskLogs({});
    } catch (e) { /* not critical */ }
  };

  const toggleTaskLog = (taskId) => {
    setTaskLogs(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], completed: !prev[taskId]?.completed },
    }));
  };

  const updateTaskQuantity = (taskId, value) => {
    setTaskLogs(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], quantity: value },
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

  const loadOwnerProjects = async () => {
    try {
      setLoading(true);
      const projects = await fetchProjects();
      setAssignedProjects(projects || []);
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
    if (!selectedProject) { Alert.alert('Required', 'Select a project'); return; }
    if (!workDone.trim()) { Alert.alert('Required', 'Describe what was done today'); return; }

    try {
      setSubmitting(true);

      // Upload photos
      const uploadedUrls = [];
      for (const uri of photos) {
        const url = await uploadPhoto(uri, selectedProject.id);
        if (url) uploadedUrls.push(url);
      }

      // Build report with new fields
      const reportData = {
        project_id: selectedProject.id,
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

      // Submit recurring task logs (non-blocking)
      const logsToSubmit = Object.entries(taskLogs).filter(([_, log]) => log.completed || log.quantity);
      if (logsToSubmit.length > 0) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const today = new Date().toISOString().split('T')[0];
        try {
          for (const [taskId, log] of logsToSubmit) {
            await supabase.from('recurring_task_daily_logs').upsert({
              recurring_task_id: taskId,
              project_id: selectedProject.id,
              owner_id: selectedProject.user_id || userId,
              worker_id: userId,
              log_date: today,
              completed: log.completed || false,
              quantity: log.quantity ? parseFloat(log.quantity) : null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'recurring_task_id,worker_id,log_date' });
          }
        } catch (e) {
          console.warn('Failed to save recurring task logs:', e);
        }
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

          {/* Project Selection */}
          <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Project</Text>
            {assignedProjects.length === 0 ? (
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No projects available</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectScroll}>
                {assignedProjects.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.projectChip, { borderColor: selectedProject?.id === p.id ? ACCENT : Colors.border, backgroundColor: selectedProject?.id === p.id ? ACCENT + '10' : 'transparent' }]}
                    onPress={() => setSelectedProject(p)}
                  >
                    <Text style={[styles.projectChipText, { color: selectedProject?.id === p.id ? ACCENT : Colors.primaryText }]} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {selectedProject && (
            <>
              {/* Recurring Daily Tasks */}
              {recurringTasks.length > 0 && (
                <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Daily Tasks</Text>
                  {recurringTasks.map(task => {
                    const log = taskLogs[task.id] || {};
                    return (
                      <View key={task.id} style={[styles.recurringTaskRow, { borderBottomColor: Colors.border }]}>
                        <TouchableOpacity
                          onPress={() => toggleTaskLog(task.id)}
                          style={styles.recurringCheckbox}
                        >
                          <Ionicons
                            name={log.completed ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={log.completed ? '#10B981' : Colors.secondaryText}
                          />
                        </TouchableOpacity>
                        <Text style={[styles.recurringTaskTitle, { color: Colors.primaryText }, log.completed && styles.recurringTaskDone]} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {task.requires_quantity && (
                          <View style={styles.recurringQuantityWrap}>
                            <TextInput
                              style={[styles.recurringQuantityInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                              value={log.quantity || ''}
                              onChangeText={(val) => updateTaskQuantity(task.id, val)}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={Colors.secondaryText}
                            />
                            <Text style={[styles.recurringUnit, { color: Colors.secondaryText }]}>
                              {task.quantity_unit || ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
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
});
