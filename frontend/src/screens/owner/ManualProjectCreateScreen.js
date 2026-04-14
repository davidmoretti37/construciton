import React, { useState } from 'react';
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
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { saveProject, getCurrentUserId, redistributeAllTasksWithAI } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkingDaysSelector from '../../components/WorkingDaysSelector';

export default function ManualProjectCreateScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // --- Core Info ---
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  // --- Financial ---
  const [contractAmount, setContractAmount] = useState('');
  const [services, setServices] = useState([]); // line items

  // --- Timeline ---
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);

  // --- Phases with tasks ---
  const [phases, setPhases] = useState([]);
  const [newPhaseName, setNewPhaseName] = useState('');

  // --- Daily Checklist ---
  const [checklistItems, setChecklistItems] = useState([]);

  // --- Labor Roles ---
  const [laborRoles, setLaborRoles] = useState([]);

  // --- Collapsed sections ---
  const [expandedSections, setExpandedSections] = useState({
    client: true,
    financial: false,
    timeline: true,
    phases: true,
    checklist: false,
    labor: false,
  });

  const [saving, setSaving] = useState(false);

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- Date helpers ---
  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const toISODate = (date) => {
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // --- Phase handlers ---
  const handleAddPhase = () => {
    const trimmed = newPhaseName.trim();
    if (!trimmed) return;
    setPhases([...phases, { name: trimmed, plannedDays: 0, budget: '', tasks: [] }]);
    setNewPhaseName('');
  };
  const handleRemovePhase = (index) => setPhases(phases.filter((_, i) => i !== index));
  const handleAddTaskToPhase = (phaseIndex) => {
    const updated = [...phases];
    updated[phaseIndex].tasks.push({ description: '', completed: false, status: 'not_started' });
    setPhases(updated);
  };
  const handleUpdateTask = (phaseIndex, taskIndex, value) => {
    const updated = [...phases];
    updated[phaseIndex].tasks[taskIndex].description = value;
    setPhases(updated);
  };
  const handleRemoveTask = (phaseIndex, taskIndex) => {
    const updated = [...phases];
    updated[phaseIndex].tasks.splice(taskIndex, 1);
    setPhases(updated);
  };
  const handleUpdatePhaseDays = (phaseIndex, value) => {
    const updated = [...phases];
    updated[phaseIndex].plannedDays = parseInt(value) || 0;
    setPhases(updated);
  };
  const handleUpdatePhaseBudget = (phaseIndex, value) => {
    const updated = [...phases];
    updated[phaseIndex].budget = value;
    setPhases(updated);
  };

  // --- Service/line item handlers ---
  const handleAddService = () => setServices([...services, { description: '', amount: '' }]);
  const handleUpdateService = (index, field, value) => {
    const updated = [...services];
    updated[index][field] = value;
    setServices(updated);
  };
  const handleRemoveService = (index) => setServices(services.filter((_, i) => i !== index));

  // --- Checklist handlers ---
  const handleAddChecklistItem = () => {
    setChecklistItems([...checklistItems, { title: '', item_type: 'checkbox', quantity_unit: '', requires_photo: false }]);
  };
  const handleUpdateChecklistItem = (index, field, value) => {
    const updated = [...checklistItems];
    updated[index] = { ...updated[index], [field]: value };
    setChecklistItems(updated);
  };
  const handleRemoveChecklistItem = (index) => setChecklistItems(checklistItems.filter((_, i) => i !== index));

  // --- Labor role handlers ---
  const handleAddLaborRole = () => {
    setLaborRoles([...laborRoles, { role_name: '', default_quantity: 1 }]);
  };
  const handleUpdateLaborRole = (index, field, value) => {
    const updated = [...laborRoles];
    updated[index] = { ...updated[index], [field]: value };
    setLaborRoles(updated);
  };
  const handleRemoveLaborRole = (index) => setLaborRoles(laborRoles.filter((_, i) => i !== index));

  // --- Save ---
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Project name is required.');
      return;
    }
    if (!client.trim()) {
      Alert.alert('Required', 'Client name is required.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      Alert.alert('Invalid Dates', 'Start date cannot be after end date.');
      return;
    }

    setSaving(true);
    try {
      const contractValue = parseFloat(contractAmount) || 0;
      const validServices = services.filter(s => s.description.trim());

      const projectData = {
        projectName: name.trim(),
        name: name.trim(),
        client: client.trim(),
        clientPhone: clientPhone.trim() || null,
        email: clientEmail.trim() || null,
        location: location.trim() || null,
        taskDescription: description.trim() || null,
        contractAmount: contractValue,
        budget: contractValue,
        incomeCollected: 0,
        expenses: 0,
        spent: 0,
        status: 'active',
        startDate: toISODate(startDate),
        endDate: toISODate(endDate),
        workingDays,
        services: validServices.length > 0 ? validServices.map(s => ({
          description: s.description.trim(),
          amount: parseFloat(s.amount) || 0,
        })) : undefined,
        phases: phases.length > 0 ? phases.map((p, i) => ({
          name: p.name,
          plannedDays: p.plannedDays || 0,
          budget: parseFloat(p.budget) || 0,
          order: i,
          tasks: p.tasks.filter(t => t.description.trim()).map((t, j) => ({
            id: `task-${Date.now()}-${i}-${j}`,
            description: t.description.trim(),
            order: j + 1,
            completed: false,
            status: 'not_started',
          })),
        })) : undefined,
        checklist_items: checklistItems.filter(c => c.title.trim()),
        labor_roles: laborRoles.filter(r => r.role_name.trim()),
      };

      const saved = await saveProject(projectData);

      if (saved?.error === 'limit_reached') {
        Alert.alert('Project Limit Reached', saved.reason || 'Upgrade your plan to create more projects.');
        return;
      }

      if (saved && saved.id) {
        // Save daily checklist templates
        const validChecklist = projectData.checklist_items || [];
        const validLabor = projectData.labor_roles || [];
        if (validChecklist.length > 0) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
              await supabase.from('daily_checklist_templates').insert(
                validChecklist.map((item, i) => ({
                  project_id: saved.id,
                  owner_id: user.id,
                  title: item.title,
                  item_type: item.item_type || 'checkbox',
                  quantity_unit: item.quantity_unit || null,
                  requires_photo: item.requires_photo || false,
                  sort_order: i,
                }))
              );
              if (validLabor.length > 0) {
                await supabase.from('labor_role_templates').insert(
                  validLabor.map((role, i) => ({
                    project_id: saved.id,
                    owner_id: user.id,
                    role_name: role.role_name,
                    default_quantity: role.default_quantity || 1,
                    sort_order: i,
                  }))
                );
              }
            }
          } catch (e) {
            console.error('Checklist/labor save error:', e);
          }
        }

        // AI task distribution if phases have tasks
        if (projectData.phases?.some(p => p.tasks?.length > 0)) {
          try {
            const userId = await getCurrentUserId();
            if (userId) {
              await redistributeAllTasksWithAI(saved.id, userId, projectData.phases, {
                startDate: projectData.startDate,
                endDate: projectData.endDate,
                workingDays: projectData.workingDays,
              });
            }
          } catch (e) {
            console.error('AI task distribution error:', e);
          }
        }

        navigation.replace('ProjectDetail', { project: saved, isDemo: false });
      } else {
        Alert.alert('Error', 'Failed to create project. Please try again.');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // --- Section Header Component ---
  const SectionHeader = ({ title, icon, sectionKey, count }) => (
    <TouchableOpacity
      style={[styles.sectionHeaderRow, { borderBottomColor: expandedSections[sectionKey] ? Colors.border : 'transparent' }]}
      onPress={() => toggleSection(sectionKey)}
      activeOpacity={0.7}
    >
      <View style={styles.sectionHeaderLeft}>
        <Ionicons name={icon} size={18} color={Colors.primaryBlue} />
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{title}</Text>
        {count > 0 && (
          <View style={[styles.countBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primaryBlue }}>{count}</Text>
          </View>
        )}
      </View>
      <Ionicons name={expandedSections[sectionKey] ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.primaryBlue }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>New Project</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.primaryBlue }}>Create</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ============ PROJECT NAME ============ */}
          <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 8, marginHorizontal: 20 }]}>Project Name *</Text>
          <TextInput
            style={[styles.input, { marginHorizontal: 20, backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Kitchen Renovation"
            placeholderTextColor={Colors.placeholderText}
            autoFocus
          />

          {/* ============ CLIENT INFO ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Client Info" icon="person-outline" sectionKey="client" />
            {expandedSections.client && (
              <View style={styles.sectionBody}>
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Client Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={client}
                  onChangeText={setClient}
                  placeholder="e.g. John Smith"
                  placeholderTextColor={Colors.placeholderText}
                />
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Phone</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={clientPhone}
                  onChangeText={setClientPhone}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={Colors.placeholderText}
                  keyboardType="phone-pad"
                />
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={clientEmail}
                  onChangeText={setClientEmail}
                  placeholder="client@email.com"
                  placeholderTextColor={Colors.placeholderText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Location / Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="123 Main St, Austin, TX"
                  placeholderTextColor={Colors.placeholderText}
                />
              </View>
            )}
          </View>

          {/* ============ TIMELINE ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Timeline" icon="calendar-outline" sectionKey="timeline" />
            {expandedSections.timeline && (
              <View style={styles.sectionBody}>
                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: Colors.secondaryText }]}>Start Date</Text>
                    <TouchableOpacity
                      style={[styles.dateButton, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
                      onPress={() => setShowStartPicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                      <Text style={{ color: startDate ? Colors.primaryText : Colors.placeholderText, fontSize: 14, marginLeft: 6 }}>
                        {startDate ? formatDate(startDate) : 'Select date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: Colors.secondaryText }]}>End Date</Text>
                    <TouchableOpacity
                      style={[styles.dateButton, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
                      onPress={() => setShowEndPicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                      <Text style={{ color: endDate ? Colors.primaryText : Colors.placeholderText, fontSize: 14, marginLeft: 6 }}>
                        {endDate ? formatDate(endDate) : 'Select date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {startDate && endDate && (
                  <View style={[styles.daysRemaining, { backgroundColor: Colors.primaryBlue + '10' }]}>
                    <Text style={{ fontSize: 13, color: Colors.primaryBlue, fontWeight: '600' }}>
                      {Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))} days total
                    </Text>
                  </View>
                )}

                <Text style={[styles.label, { color: Colors.secondaryText }]}>Working Days</Text>
                <WorkingDaysSelector selectedDays={workingDays} onDaysChange={setWorkingDays} />
              </View>
            )}
          </View>

          {/* ============ FINANCIAL ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Financial" icon="cash-outline" sectionKey="financial" count={services.length} />
            {expandedSections.financial && (
              <View style={styles.sectionBody}>
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Contract Amount ($)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                  value={contractAmount}
                  onChangeText={setContractAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.placeholderText}
                  keyboardType="decimal-pad"
                />
                {services.length > 0 && (() => {
                  const total = services.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                  return total > 0 ? (
                    <TouchableOpacity
                      style={{ marginTop: 6 }}
                      onPress={() => setContractAmount(total.toFixed(2))}
                    >
                      <Text style={{ fontSize: 12, color: Colors.primaryBlue }}>
                        Services total: ${total.toLocaleString()} — tap to use as contract amount
                      </Text>
                    </TouchableOpacity>
                  ) : null;
                })()}

                {/* Services / Line Items */}
                <View style={styles.subSectionHeader}>
                  <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 0 }]}>Services / Line Items</Text>
                  <TouchableOpacity onPress={handleAddService}>
                    <Ionicons name="add-circle" size={24} color={Colors.primaryBlue} />
                  </TouchableOpacity>
                </View>
                {services.map((service, index) => (
                  <View key={index} style={styles.serviceRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                      value={service.description}
                      onChangeText={(v) => handleUpdateService(index, 'description', v)}
                      placeholder="Service description"
                      placeholderTextColor={Colors.placeholderText}
                    />
                    <TextInput
                      style={[styles.input, { width: 90, marginLeft: 8, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText, textAlign: 'right' }]}
                      value={service.amount}
                      onChangeText={(v) => handleUpdateService(index, 'amount', v)}
                      placeholder="$0"
                      placeholderTextColor={Colors.placeholderText}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity style={{ marginLeft: 6, padding: 4 }} onPress={() => handleRemoveService(index)}>
                      <Ionicons name="close-circle" size={20} color={Colors.errorRed} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ============ PHASES & TASKS ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Phases & Tasks" icon="layers-outline" sectionKey="phases" count={phases.length} />
            {expandedSections.phases && (
              <View style={styles.sectionBody}>
                <Text style={{ fontSize: 12, color: Colors.secondaryText, marginBottom: 12 }}>
                  Add work phases and tasks within each phase.
                </Text>

                {phases.map((phase, phaseIdx) => (
                  <View key={phaseIdx} style={[styles.phaseCard, { borderColor: Colors.border }]}>
                    <View style={styles.phaseHeader}>
                      <Text style={[styles.phaseHeaderText, { color: Colors.primaryText }]}>{phase.name}</Text>
                      <View style={styles.phaseHeaderRight}>
                        <TextInput
                          style={[styles.dayInput, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                          value={phase.plannedDays ? String(phase.plannedDays) : ''}
                          onChangeText={(v) => handleUpdatePhaseDays(phaseIdx, v)}
                          placeholder="days"
                          placeholderTextColor={Colors.placeholderText}
                          keyboardType="number-pad"
                        />
                        <TextInput
                          style={[styles.budgetInput, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                          value={phase.budget || ''}
                          onChangeText={(v) => handleUpdatePhaseBudget(phaseIdx, v)}
                          placeholder="$0"
                          placeholderTextColor={Colors.placeholderText}
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity onPress={() => handleRemovePhase(phaseIdx)}>
                          <Ionicons name="close-circle" size={20} color={Colors.errorRed} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Tasks in this phase */}
                    {phase.tasks.map((task, taskIdx) => (
                      <View key={taskIdx} style={styles.taskRow}>
                        <View style={[styles.taskBullet, { backgroundColor: Colors.primaryBlue }]} />
                        <TextInput
                          style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText, paddingVertical: 8 }]}
                          value={task.description}
                          onChangeText={(v) => handleUpdateTask(phaseIdx, taskIdx, v)}
                          placeholder="Task description"
                          placeholderTextColor={Colors.placeholderText}
                        />
                        <TouchableOpacity style={{ marginLeft: 6, padding: 4 }} onPress={() => handleRemoveTask(phaseIdx, taskIdx)}>
                          <Ionicons name="close-circle" size={18} color={Colors.errorRed} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.addTaskBtn}
                      onPress={() => handleAddTaskToPhase(phaseIdx)}
                    >
                      <Ionicons name="add" size={16} color={Colors.primaryBlue} />
                      <Text style={{ fontSize: 13, color: Colors.primaryBlue, fontWeight: '500' }}>Add Task</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add Phase Input */}
                <View style={styles.addPhaseRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                    value={newPhaseName}
                    onChangeText={setNewPhaseName}
                    placeholder="Phase name (e.g. Demolition)"
                    placeholderTextColor={Colors.placeholderText}
                    onSubmitEditing={handleAddPhase}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[styles.addPhaseButton, { backgroundColor: Colors.primaryBlue }]}
                    onPress={handleAddPhase}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* ============ DAILY CHECKLIST ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Daily Checklist" icon="checkbox-outline" sectionKey="checklist" count={checklistItems.length} />
            {expandedSections.checklist && (
              <View style={styles.sectionBody}>
                <Text style={{ fontSize: 12, color: Colors.secondaryText, marginBottom: 12 }}>
                  Items workers check off daily (e.g. "Clean up area", "Log materials used").
                </Text>

                {checklistItems.map((item, index) => (
                  <View key={index} style={[styles.checklistItem, { borderColor: Colors.border }]}>
                    <View style={styles.checklistRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText, paddingVertical: 8 }]}
                        value={item.title}
                        onChangeText={(v) => handleUpdateChecklistItem(index, 'title', v)}
                        placeholder="Checklist item"
                        placeholderTextColor={Colors.placeholderText}
                      />
                      <TouchableOpacity style={{ marginLeft: 6, padding: 4 }} onPress={() => handleRemoveChecklistItem(index)}>
                        <Ionicons name="close-circle" size={18} color={Colors.errorRed} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.checklistOptions}>
                      <TouchableOpacity
                        style={[styles.typeToggle, { backgroundColor: item.item_type === 'quantity' ? Colors.primaryBlue + '15' : Colors.lightGray }]}
                        onPress={() => handleUpdateChecklistItem(index, 'item_type', item.item_type === 'checkbox' ? 'quantity' : 'checkbox')}
                      >
                        <Ionicons name={item.item_type === 'quantity' ? 'calculator' : 'checkbox'} size={14} color={item.item_type === 'quantity' ? Colors.primaryBlue : Colors.secondaryText} />
                        <Text style={{ fontSize: 11, color: item.item_type === 'quantity' ? Colors.primaryBlue : Colors.secondaryText, marginLeft: 4 }}>
                          {item.item_type === 'quantity' ? 'Quantity' : 'Checkbox'}
                        </Text>
                      </TouchableOpacity>

                      {item.item_type === 'quantity' && (
                        <TextInput
                          style={[styles.unitInput, { backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText }]}
                          value={item.quantity_unit}
                          onChangeText={(v) => handleUpdateChecklistItem(index, 'quantity_unit', v)}
                          placeholder="unit (sq ft, bags...)"
                          placeholderTextColor={Colors.placeholderText}
                        />
                      )}

                      <TouchableOpacity
                        style={[styles.typeToggle, { backgroundColor: item.requires_photo ? Colors.warningOrange + '15' : Colors.lightGray }]}
                        onPress={() => handleUpdateChecklistItem(index, 'requires_photo', !item.requires_photo)}
                      >
                        <Ionicons name="camera" size={14} color={item.requires_photo ? Colors.warningOrange : Colors.secondaryText} />
                        <Text style={{ fontSize: 11, color: item.requires_photo ? Colors.warningOrange : Colors.secondaryText, marginLeft: 4 }}>Photo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity style={styles.addItemBtn} onPress={handleAddChecklistItem}>
                  <Ionicons name="add-circle" size={20} color={Colors.primaryBlue} />
                  <Text style={{ fontSize: 13, color: Colors.primaryBlue, fontWeight: '500', marginLeft: 6 }}>Add Checklist Item</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ LABOR ROLES ============ */}
          <View style={[styles.section, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SectionHeader title="Labor Roles" icon="people-outline" sectionKey="labor" count={laborRoles.length} />
            {expandedSections.labor && (
              <View style={styles.sectionBody}>
                <Text style={{ fontSize: 12, color: Colors.secondaryText, marginBottom: 12 }}>
                  Define crew roles needed daily (e.g. "Electrician x2", "Helper x3").
                </Text>

                {laborRoles.map((role, index) => (
                  <View key={index} style={styles.laborRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: Colors.lightGray, borderColor: Colors.border, color: Colors.primaryText, paddingVertical: 8 }]}
                      value={role.role_name}
                      onChangeText={(v) => handleUpdateLaborRole(index, 'role_name', v)}
                      placeholder="Role name"
                      placeholderTextColor={Colors.placeholderText}
                    />
                    <View style={styles.qtyControl}>
                      <TouchableOpacity
                        onPress={() => handleUpdateLaborRole(index, 'default_quantity', Math.max(1, (role.default_quantity || 1) - 1))}
                        style={[styles.qtyBtn, { backgroundColor: Colors.lightGray }]}
                      >
                        <Ionicons name="remove" size={16} color={Colors.primaryText} />
                      </TouchableOpacity>
                      <Text style={[styles.qtyText, { color: Colors.primaryText }]}>{role.default_quantity || 1}</Text>
                      <TouchableOpacity
                        onPress={() => handleUpdateLaborRole(index, 'default_quantity', (role.default_quantity || 1) + 1)}
                        style={[styles.qtyBtn, { backgroundColor: Colors.lightGray }]}
                      >
                        <Ionicons name="add" size={16} color={Colors.primaryText} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={{ marginLeft: 6, padding: 4 }} onPress={() => handleRemoveLaborRole(index)}>
                      <Ionicons name="close-circle" size={18} color={Colors.errorRed} />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addItemBtn} onPress={handleAddLaborRole}>
                  <Ionicons name="add-circle" size={20} color={Colors.primaryBlue} />
                  <Text style={{ fontSize: 13, color: Colors.primaryBlue, fontWeight: '500', marginLeft: 6 }}>Add Labor Role</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ============ DESCRIPTION / SCOPE ============ */}
          <Text style={[styles.label, { color: Colors.secondaryText, marginHorizontal: 20 }]}>Project Description / Scope</Text>
          <TextInput
            style={[styles.input, { marginHorizontal: 20, backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText, minHeight: 80, textAlignVertical: 'top' }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the scope of work..."
            placeholderTextColor={Colors.placeholderText}
            multiline
            numberOfLines={4}
          />

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Date Pickers — inline spinner with Done button on iOS */}
        {showStartPicker && (
          <View style={styles.datePickerContainer}>
            <DateTimePicker
              value={startDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                if (Platform.OS !== 'ios') setShowStartPicker(false);
                if (date) setStartDate(date);
              }}
              style={{ height: 120 }}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setShowStartPicker(false)} style={styles.datePickerDone}>
                <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {showEndPicker && (
          <View style={styles.datePickerContainer}>
            <DateTimePicker
              value={endDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                if (Platform.OS !== 'ios') setShowEndPicker(false);
                if (date) setEndDate(date);
              }}
              style={{ height: 120 }}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setShowEndPicker(false)} style={styles.datePickerDone}>
                <Text style={{ color: Colors.primaryBlue, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { flex: 1 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  section: {
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionBody: { padding: 16, paddingTop: 4 },
  dateRow: { flexDirection: 'row', marginTop: 4 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  daysRemaining: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  phaseCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  phaseHeaderText: { fontSize: 15, fontWeight: '600', flex: 1 },
  phaseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    width: 55,
    textAlign: 'center',
  },
  budgetInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    width: 65,
    textAlign: 'right',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingLeft: 4,
  },
  taskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  addTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  addPhaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addPhaseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  typeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unitInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    width: 120,
  },
  laborRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  datePickerContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: 8,
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
