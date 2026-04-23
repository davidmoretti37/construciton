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
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkerAssignments, getCurrentUserId, uploadPhoto, addProjectTransaction } from '../../utils/storage';
import { submitWorkerExpense } from '../../utils/storage/transactions';
import { fetchProjects } from '../../utils/storage/projects';
import { analyzeReceipt } from '../../services/aiService';
import { supabase } from '../../lib/supabase';

const EXPENSE_CATEGORIES = [
  { id: 'materials', label: 'Materials', icon: 'cube' },
  { id: 'equipment', label: 'Equipment', icon: 'construct' },
  { id: 'permits', label: 'Permits', icon: 'document' },
  { id: 'subcontractor', label: 'Subcontractor', icon: 'people' },
  { id: 'misc', label: 'Miscellaneous', icon: 'ellipsis-horizontal' },
];

export default function ExpenseFormScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { profile } = useAuth();

  // Detect user role
  const isWorker = profile?.role === 'worker';
  const isSupervisor = profile?.role === 'supervisor';
  const isOwner = profile?.role === 'owner';

  const [step, setStep] = useState(1); // 1: Project, 2: Upload, 3: Analyzing, 4: Review
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [receiptImage, setReceiptImage] = useState(null);

  // Expense form data (populated by AI, editable by user)
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('materials');
  const [subcategory, setSubcategory] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [lineItems, setLineItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [tradeBudgets, setTradeBudgets] = useState([]);
  // Phases (primary required category) + a draft id for the picked one.
  const [phases, setPhases] = useState([]);
  const [phaseId, setPhaseId] = useState(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [isWorker, isSupervisor, isOwner]);

  // Fetch phases first; trade budgets only as fallback when no phases exist.
  // Re-runs whenever the selected project changes so a freshly-added phase
  // appears immediately on the next form open.
  useEffect(() => {
    if (!selectedProject?.id || selectedProject.isServicePlan) {
      setPhases([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: phaseRows } = await supabase
          .from('project_phases')
          .select('id, name, order_index')
          .eq('project_id', selectedProject.id)
          .order('order_index', { ascending: true });
        if (cancelled) return;
        const list = phaseRows || [];
        setPhases(list);
        if (list.length === 0) {
          const { data: trades } = await supabase
            .from('project_trade_budgets')
            .select('trade_name')
            .eq('project_id', selectedProject.id)
            .order('created_at', { ascending: true });
          if (!cancelled) setTradeBudgets(trades || []);
        } else {
          if (!cancelled) setTradeBudgets([]);
        }
      } catch (_) {
        if (!cancelled) { setPhases([]); setTradeBudgets([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProject?.id]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();

      if (isWorker) {
        // Worker: get assigned projects through worker assignments
        const { data: workerData, error: workerError } = await supabase
          .from('workers')
          .select('id')
          .eq('user_id', currentUserId)
          .single();

        if (workerError || !workerData) {
          console.error('Error fetching worker:', workerError);
          Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'worker profile' }));
          setLoading(false);
          return;
        }

        setWorkerId(workerData.id);
        const assignments = await getWorkerAssignments(workerData.id);
        const projects = assignments.projects?.filter(Boolean) || [];
        const plans = (assignments.servicePlans || []).map(p => ({ ...p, isServicePlan: true }));
        setAssignedProjects([...projects, ...plans]);
      } else if (isSupervisor) {
        // Supervisor: get assigned projects + service plans
        const { data: projects, error } = await supabase
          .from('projects')
          .select('*')
          .or(`assigned_supervisor_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
          .in('status', ['active', 'scheduled', 'on-track', 'behind', 'over-budget', 'draft'])
          .order('created_at', { ascending: false });

        if (error) throw error;

        const { data: plans } = await supabase
          .from('service_plans')
          .select('id, name, service_type, status')
          .eq('status', 'active')
          .order('name', { ascending: true });

        const planItems = (plans || []).map(p => ({ ...p, isServicePlan: true }));
        setAssignedProjects([...(projects || []), ...planItems]);
      } else {
        // Owner: get all their projects + service plans
        const projects = await fetchProjects();

        const { data: plans } = await supabase
          .from('service_plans')
          .select('id, name, service_type, status, owner_id')
          .eq('status', 'active')
          .order('name', { ascending: true });

        const allItems = [
          ...(projects || []),
          ...(plans || []).map(p => ({ ...p, isServicePlan: true })),
        ];
        setAssignedProjects(allItems);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'projects' }));
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
    setStep(2);
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionRequired'), t('permissions.cameraRequired'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled) {
        setReceiptImage(result.assets[0].uri);
        analyzeReceiptImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'photo' }));
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionRequired'), t('permissions.photoLibraryRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled) {
        setReceiptImage(result.assets[0].uri);
        analyzeReceiptImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'image' }));
    }
  };

  const analyzeReceiptImage = async (imageUri) => {
    try {
      setStep(3);
      setAnalyzing(true);

      // Convert image to base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Call AI to analyze receipt
      const extractedData = await analyzeReceipt(base64);

      // Populate form with extracted data
      setAmount(extractedData.totalAmount?.toString() || '');
      setDescription(extractedData.description || '');
      setCategory(extractedData.category || 'misc');
      setSubcategory(extractedData.subcategory || null);
      if (extractedData.date) {
        setDate(extractedData.date);
      }
      setLineItems(extractedData.lineItems || []);

      setStep(4);
    } catch (error) {
      console.error('Error analyzing receipt:', error);
      Alert.alert(
        t('alerts.error'),
        'Could not analyze the receipt. You can still fill in the details manually.',
        [{ text: 'OK', onPress: () => setStep(4) }]
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(t('alerts.missingInfo'), t('messages.pleaseEnter', { item: 'valid amount' }));
      return;
    }

    if (!description.trim()) {
      Alert.alert(t('alerts.missingInfo'), t('messages.pleaseEnter', { item: 'description' }));
      return;
    }

    // Phase / subcategory required for project expenses (service plans fall
    // back to the static subcategory list, also required there).
    if (!selectedProject?.isServicePlan && !subcategory && !phaseId) {
      Alert.alert(
        'Phase required',
        'Pick a phase for this expense so the project budget breakdown stays accurate.'
      );
      return;
    }
    if (selectedProject?.isServicePlan && !subcategory) {
      Alert.alert(
        'Category required',
        'Pick a category for this expense.'
      );
      return;
    }

    try {
      setSubmitting(true);

      // Upload receipt image
      let receiptUrl = null;
      if (receiptImage) {
        receiptUrl = await uploadPhoto(receiptImage, 'expense-receipts');
      }

      // Normalize line items: drop empty rows, coerce total to number.
      const cleanedLineItems = lineItems
        .map((li) => ({
          description: (li.description ?? '').toString().trim(),
          total: parseFloat(li.total) || 0,
        }))
        .filter((li) => li.description.length > 0 || li.total > 0);

      // Submit expense - use different method based on role
      if (isWorker && workerId) {
        await submitWorkerExpense({
          projectId: selectedProject.isServicePlan ? null : selectedProject.id,
          servicePlanId: selectedProject.isServicePlan ? selectedProject.id : null,
          workerId: workerId,
          amount: parseFloat(amount),
          description: description.trim(),
          category: category,
          subcategory: subcategory || null,
          phaseId: phaseId || null,
          date: date,
          receiptUrl: receiptUrl,
          lineItems: cleanedLineItems.length > 0 ? cleanedLineItems : null,
          notes: notes.trim() || null,
        });
      } else {
        // Owner or Supervisor: use addProjectTransaction
        await addProjectTransaction({
          project_id: selectedProject.isServicePlan ? null : selectedProject.id,
          service_plan_id: selectedProject.isServicePlan ? selectedProject.id : null,
          type: 'expense',
          amount: parseFloat(amount),
          description: description.trim(),
          category: category,
          subcategory: subcategory || null,
          phase_id: phaseId || null,
          date: date,
          receipt_url: receiptUrl,
          line_items: cleanedLineItems.length > 0 ? cleanedLineItems : null,
          notes: notes.trim() || null,
        });
      }

      Alert.alert(
        t('alerts.success'),
        t('messages.savedSuccessfully', { item: 'expense' }),
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error submitting expense:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'expense' }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipAnalysis = () => {
    setStep(4);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
        <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
          Loading projects...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Submit Expense</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Step Indicator */}
        <View style={[styles.stepIndicator, { backgroundColor: Colors.white }]}>
          {[1, 2, 3, 4].map((s) => (
            <View key={s} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: step >= s ? Colors.primaryBlue : Colors.border,
                  }
                ]}
              >
                {step > s && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={[styles.stepLabel, { color: step >= s ? Colors.primaryText : Colors.secondaryText }]}>
                {s === 1 ? 'Project' : s === 2 ? 'Upload' : s === 3 ? 'Analyze' : 'Review'}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1: Project Selection */}
          {step === 1 && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Select Project
              </Text>
              <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
                Choose the project this expense is for
              </Text>
              {assignedProjects.length === 0 ? (
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No assigned projects
                </Text>
              ) : (
                <View style={styles.projectList}>
                  {assignedProjects.map((project) => (
                    <TouchableOpacity
                      key={project.id}
                      style={[
                        styles.projectItem,
                        {
                          backgroundColor: Colors.lightBackground,
                          borderColor: Colors.border
                        }
                      ]}
                      onPress={() => handleProjectSelect(project)}
                    >
                      <View style={styles.projectItemContent}>
                        <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                          {project.name}
                        </Text>
                        {project.location && (
                          <Text style={[styles.projectLocation, { color: Colors.secondaryText }]}>
                            {project.location}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Step 2: Upload Receipt */}
          {step === 2 && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Upload Receipt
              </Text>
              <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
                Take a photo or select an image of your receipt
              </Text>

              <View style={styles.selectedProjectBadge}>
                <Ionicons name="briefcase" size={16} color={Colors.primaryBlue} />
                <Text style={[styles.selectedProjectText, { color: Colors.primaryBlue }]}>
                  {selectedProject?.name}
                </Text>
              </View>

              <View style={styles.uploadActions}>
                <TouchableOpacity
                  style={[styles.uploadButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={handleTakePhoto}
                >
                  <Ionicons name="camera" size={32} color="#fff" />
                  <Text style={styles.uploadButtonText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={handlePickImage}
                >
                  <Ionicons name="images" size={32} color="#fff" />
                  <Text style={styles.uploadButtonText}>Choose Image</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkipAnalysis}
              >
                <Text style={[styles.skipButtonText, { color: Colors.secondaryText }]}>
                  Skip and enter manually
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 3: Analyzing */}
          {step === 3 && analyzing && (
            <View style={[styles.section, { backgroundColor: Colors.white }]}>
              <View style={styles.analyzingContainer}>
                <ActivityIndicator size="large" color={Colors.primaryBlue} />
                <Text style={[styles.analyzingTitle, { color: Colors.primaryText }]}>
                  Analyzing Receipt
                </Text>
                <Text style={[styles.analyzingSubtitle, { color: Colors.secondaryText }]}>
                  AI is extracting expense details...
                </Text>
                {receiptImage && (
                  <Image source={{ uri: receiptImage }} style={styles.analyzingPreview} />
                )}
              </View>
            </View>
          )}

          {/* Step 4: Review & Edit */}
          {step === 4 && (
            <>
              {/* Receipt Preview */}
              {receiptImage && (
                <View style={[styles.section, { backgroundColor: Colors.white }]}>
                  <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                    Receipt
                  </Text>
                  <Image source={{ uri: receiptImage }} style={[styles.receiptPreview, { backgroundColor: Colors.lightBackground }]} />
                  <TouchableOpacity
                    style={styles.changeReceiptButton}
                    onPress={() => setStep(2)}
                  >
                    <Text style={[styles.changeReceiptText, { color: Colors.primaryBlue }]}>
                      Change Receipt
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Amount */}
              <View style={[styles.section, { backgroundColor: Colors.white }]}>
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                  Amount *
                </Text>
                <View style={styles.amountInputContainer}>
                  <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                  <TextInput
                    style={[
                      styles.amountInput,
                      { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }
                    ]}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Description */}
              <View style={[styles.section, { backgroundColor: Colors.white }]}>
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                  Description *
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g., Home Depot - Building materials"
                  placeholderTextColor={Colors.secondaryText}
                />
              </View>

              {/* Category */}
              <View style={[styles.section, { backgroundColor: Colors.white }]}>
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                  Category
                </Text>
                <View style={styles.categoryGrid}>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryButton,
                        {
                          backgroundColor: category === cat.id ? Colors.primaryBlue + '15' : Colors.lightBackground,
                          borderColor: category === cat.id ? Colors.primaryBlue : Colors.border
                        }
                      ]}
                      onPress={() => { setCategory(cat.id); setSubcategory(null); setPhaseId(null); }}
                    >
                      <Ionicons
                        name={cat.icon}
                        size={20}
                        color={category === cat.id ? Colors.primaryBlue : Colors.secondaryText}
                      />
                      <Text
                        style={[
                          styles.categoryButtonText,
                          { color: category === cat.id ? Colors.primaryBlue : Colors.secondaryText }
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Phase picker. Phases render first; if none, project trade
                    budgets take their place. An "Extras / Overhead" chip is
                    always appended so expenses that don't map to any phase
                    (permit runner, dumpster, site cleanup) still have a
                    bucket. The section paints with a red left border on a
                    save attempt with nothing selected. */}
                <View
                  style={{
                    marginTop: Spacing.md,
                    ...((attemptedSubmit && !subcategory && !phaseId)
                      ? { borderLeftWidth: 3, borderLeftColor: '#EF4444', paddingLeft: 12 }
                      : null),
                  }}
                >
                  <Text style={[styles.sectionTitle, { color: Colors.primaryText, fontSize: FontSizes.small }]}>
                    {phases.length > 0 ? 'Phase' : 'Phase or Trade'} <Text style={{ color: '#EF4444' }}>*</Text>
                  </Text>

                  <View style={styles.categoryGrid}>
                    {phases.map((p) => {
                      const isActive = phaseId === p.id;
                      return (
                        <TouchableOpacity
                          key={`phase-${p.id}`}
                          style={[
                            styles.categoryButton,
                            {
                              backgroundColor: isActive ? '#10B981' + '15' : Colors.lightBackground,
                              borderColor: isActive ? '#10B981' : Colors.border,
                            }
                          ]}
                          onPress={() => {
                            setPhaseId(p.id);
                            setSubcategory(p.name);
                          }}
                        >
                          <Text
                            style={[
                              styles.categoryButtonText,
                              { color: isActive ? '#10B981' : Colors.secondaryText }
                            ]}
                          >
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {phases.length === 0 && tradeBudgets.map((tb) => {
                      const tradeKey = tb.trade_name.toLowerCase();
                      const isActive = subcategory === tradeKey;
                      return (
                        <TouchableOpacity
                          key={`trade-${tb.trade_name}`}
                          style={[
                            styles.categoryButton,
                            {
                              backgroundColor: isActive ? '#10B981' + '15' : Colors.lightBackground,
                              borderColor: isActive ? '#10B981' : Colors.border,
                            }
                          ]}
                          onPress={() => {
                            setPhaseId(null);
                            setSubcategory(tradeKey);
                          }}
                        >
                          <Text
                            style={[
                              styles.categoryButtonText,
                              { color: isActive ? '#10B981' : Colors.secondaryText }
                            ]}
                          >
                            {tb.trade_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {/* Always-available bucket for expenses that don't map to a phase */}
                    <TouchableOpacity
                      key="phase-overhead"
                      style={[
                        styles.categoryButton,
                        {
                          backgroundColor: subcategory === 'overhead' ? '#10B981' + '15' : Colors.lightBackground,
                          borderColor: subcategory === 'overhead' ? '#10B981' : Colors.border,
                          borderStyle: 'dashed',
                        }
                      ]}
                      onPress={() => {
                        setPhaseId(null);
                        setSubcategory('overhead');
                      }}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={16}
                        color={subcategory === 'overhead' ? '#10B981' : Colors.secondaryText}
                      />
                      <Text
                        style={[
                          styles.categoryButtonText,
                          { color: subcategory === 'overhead' ? '#10B981' : Colors.secondaryText }
                        ]}
                      >
                        Extras / Overhead
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {subcategory === 'overhead' && (
                    <Text style={{ color: Colors.secondaryText, fontSize: FontSizes.small, marginTop: Spacing.sm }}>
                      Use Description above to note what this extra was for.
                    </Text>
                  )}
                </View>
              </View>

              {/* Date */}
              <View style={[styles.section, { backgroundColor: Colors.white }]}>
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                  Date
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }
                  ]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.secondaryText}
                />
              </View>

              {/* Line Items (if any) */}
              {lineItems.length > 0 && (
                <View style={[styles.section, { backgroundColor: Colors.white }]}>
                  <View style={styles.lineItemsHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginBottom: 0 }]}>
                      Line Items
                    </Text>
                    <TouchableOpacity
                      onPress={() => setLineItems([...lineItems, { description: '', total: '' }])}
                      style={styles.lineItemAddBtn}
                    >
                      <Ionicons name="add" size={18} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                  </View>
                  {lineItems.map((item, index) => {
                    const rawDesc = (item.description ?? '').toString().trim().toLowerCase();
                    const looksBlank =
                      rawDesc === '' || rawDesc === '0' || rawDesc === 'item description was zero';
                    const descValue = looksBlank ? '' : item.description;
                    const amountRaw = item.total;
                    const amountStr =
                      amountRaw === null || amountRaw === undefined || amountRaw === ''
                        ? ''
                        : String(amountRaw);
                    return (
                      <View key={index} style={[styles.lineItem, { borderBottomColor: Colors.border }]}>
                        <TextInput
                          style={[
                            styles.lineItemDescInput,
                            { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground },
                          ]}
                          value={descValue}
                          onChangeText={(text) => {
                            const next = [...lineItems];
                            next[index] = { ...next[index], description: text };
                            setLineItems(next);
                          }}
                          placeholder="Item description"
                          placeholderTextColor={Colors.secondaryText}
                        />
                        <TextInput
                          style={[
                            styles.lineItemAmountInput,
                            { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground },
                          ]}
                          value={amountStr}
                          onChangeText={(text) => {
                            const cleaned = text.replace(/[^0-9.]/g, '');
                            const next = [...lineItems];
                            next[index] = { ...next[index], total: cleaned };
                            setLineItems(next);
                          }}
                          placeholder="0.00"
                          placeholderTextColor={Colors.secondaryText}
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity
                          onPress={() => setLineItems(lineItems.filter((_, i) => i !== index))}
                          style={styles.lineItemDeleteBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Notes */}
              <View style={[styles.section, { backgroundColor: Colors.white }]}>
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                  Notes (Optional)
                </Text>
                <TextInput
                  style={[
                    styles.notesInput,
                    { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }
                  ]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Any additional notes..."
                  placeholderTextColor={Colors.secondaryText}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Project Badge */}
              <View style={[styles.section, { backgroundColor: Colors.white }]}>
                <View style={styles.projectBadgeRow}>
                  <Ionicons name="briefcase" size={18} color={Colors.primaryBlue} />
                  <Text style={[styles.projectBadgeText, { color: Colors.primaryText }]}>
                    Project: {selectedProject?.name}
                  </Text>
                </View>
              </View>

              {/* Submit Button */}
              <View style={styles.submitSection}>
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: submitting ? Colors.lightGray : Colors.primaryBlue }
                  ]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={24} color="#fff" />
                      <Text style={styles.submitButtonText}>Submit Expense</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  stepItem: {
    alignItems: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepLabel: {
    fontSize: FontSizes.small,
  },
  section: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
  projectList: {
    gap: Spacing.sm,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  projectItemContent: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  projectLocation: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  selectedProjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: '#3B82F620',
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  selectedProjectText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  uploadActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  uploadButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    padding: Spacing.sm,
  },
  skipButtonText: {
    fontSize: FontSizes.small,
  },
  analyzingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  analyzingTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginTop: Spacing.lg,
  },
  analyzingSubtitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.xs,
  },
  analyzingPreview: {
    width: 150,
    height: 200,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  receiptPreview: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.md,
    resizeMode: 'contain',
  },
  changeReceiptButton: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  changeReceiptText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
    marginRight: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: 24,
    fontWeight: '700',
  },
  textInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  categoryButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  lineItemDesc: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  lineItemAmount: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  lineItemDescInput: {
    flex: 1,
    fontSize: FontSizes.small,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  lineItemAmountInput: {
    width: 90,
    fontSize: FontSizes.small,
    fontWeight: '600',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    textAlign: 'right',
  },
  lineItemDeleteBtn: {
    padding: 2,
  },
  lineItemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  lineItemAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.body,
    minHeight: 80,
  },
  projectBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  projectBadgeText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  submitSection: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
});
