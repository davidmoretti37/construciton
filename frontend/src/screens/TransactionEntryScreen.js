import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { addProjectTransaction, updateTransaction } from '../utils/storage';
import { fetchProjects } from '../utils/storage/projects';
import { getCurrentUserId } from '../utils/storage/auth';
import { supabase } from '../lib/supabase';
import { getColors, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function TransactionEntryScreen({ route, navigation }) {
  const { t } = useTranslation('common');
  const { projectId: initialProjectId, projectName: initialProjectName, transaction, onSave, fromQuickAction } = route.params || {};
  const isEditing = !!transaction;
  const needsProjectPicker = fromQuickAction && !initialProjectId;

  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { profile } = useAuth();
  const isSupervisor = profile?.role === 'supervisor';

  const [type, setType] = useState(transaction?.type || 'expense');
  const [category, setCategory] = useState(transaction?.category || 'materials');
  const [description, setDescription] = useState(transaction?.description || '');
  const [amount, setAmount] = useState(transaction?.amount?.toString() || '');
  const [date, setDate] = useState(transaction?.date || new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState(transaction?.payment_method || 'cash');
  const [notes, setNotes] = useState(transaction?.notes || '');
  const [saving, setSaving] = useState(false);

  // Project picker state (for quick action flow)
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(needsProjectPicker);
  const [selectedProject, setSelectedProject] = useState(
    initialProjectId ? { id: initialProjectId, name: initialProjectName } : null
  );
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // Fetch projects when opened from quick action
  useEffect(() => {
    if (needsProjectPicker) {
      loadProjects();
    }
  }, [needsProjectPicker, isSupervisor]);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);

      if (isSupervisor) {
        // Supervisor: get assigned projects directly from Supabase
        const currentUserId = await getCurrentUserId();
        const { data: projectList, error } = await supabase
          .from('projects')
          .select('*')
          .or(`assigned_supervisor_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
          .in('status', ['active', 'scheduled'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        setProjects(projectList || []);
      } else {
        // Owner: use fetchProjects
        const projectList = await fetchProjects();
        // Filter to only active projects
        const activeProjects = (projectList || []).filter(p => p.status === 'active' || p.status === 'scheduled');
        setProjects(activeProjects);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Computed values
  const projectId = selectedProject?.id || initialProjectId;
  const projectName = selectedProject?.name || initialProjectName;

  const expenseCategories = [
    { value: 'materials', label: 'Materials', icon: 'construct' },
    { value: 'labor', label: 'Labor', icon: 'people' },
    { value: 'equipment', label: 'Equipment', icon: 'hammer' },
    { value: 'permits', label: 'Permits', icon: 'document-text' },
    { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle' },
  ];

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: 'cash' },
    { value: 'check', label: 'Check', icon: 'card' },
    { value: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
    { value: 'card', label: 'Card', icon: 'card' },
    { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
  ];

  const handleSave = async () => {
    // Validation
    if (needsProjectPicker && !selectedProject) {
      Alert.alert('Required', 'Please select a project');
      return;
    }
    if (!description.trim()) {
      Alert.alert(t('alerts.required'), t('messages.pleaseEnter', { item: t('labels.description').toLowerCase() }));
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(t('alerts.required'), t('messages.pleaseEnterValid', { item: t('labels.amount').toLowerCase() }));
      return;
    }

    try {
      setSaving(true);

      const transactionData = {
        project_id: projectId,
        type,
        category: type === 'expense' ? category : null,
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        payment_method: type === 'income' ? paymentMethod : null,
        notes: notes.trim() || null,
      };

      if (isEditing) {
        await updateTransaction(transaction.id, transactionData);
        Alert.alert(t('alerts.success'), t('messages.updatedSuccessfully', { item: 'Transaction' }));
      } else {
        await addProjectTransaction(transactionData);
        Alert.alert(t('alerts.success'), t('messages.savedSuccessfully', { item: 'Transaction' }));
      }

      if (onSave) {
        await onSave();
      }
      navigation.goBack();
    } catch (error) {
      console.error('Error saving transaction:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'transaction' }));
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: Colors.cardBackground,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
    },
    saveButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: Colors.primaryText,
    },
    saveButtonTextDisabled: {
      color: Colors.placeholderText,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: Colors.primaryText,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 40,
    },
    projectBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.lightGray,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginBottom: 24,
    },
    projectName: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.secondaryText,
    },
    section: {
      marginBottom: 24,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.primaryText,
      marginBottom: 12,
    },
    typeContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    typeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: Colors.cardBackground,
      borderRadius: 12,
      paddingVertical: 16,
      borderWidth: 2,
      borderColor: Colors.border,
    },
    typeButtonActive: {
      backgroundColor: Colors.primaryText,
      borderColor: Colors.primaryText,
    },
    typeButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: Colors.primaryText,
    },
    typeButtonTextActive: {
      color: Colors.white,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.cardBackground,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1.5,
      borderColor: Colors.border,
    },
    categoryButtonActive: {
      backgroundColor: Colors.lightGray,
      borderColor: Colors.primaryText,
    },
    categoryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.placeholderText,
    },
    categoryButtonTextActive: {
      color: Colors.primaryText,
    },
    input: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      fontSize: 15,
      color: Colors.primaryText,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    amountInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    currencySymbol: {
      fontSize: 18,
      fontWeight: '600',
      color: Colors.secondaryText,
      marginRight: 4,
    },
    amountInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: Colors.primaryText,
    },
    notesInput: {
      height: 100,
      textAlignVertical: 'top',
    },
    // Project picker styles
    projectSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Colors.cardBackground,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    projectSelectorEmpty: {
      borderStyle: 'dashed',
    },
    projectSelectorText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: Colors.primaryText,
    },
    projectSelectorTextEmpty: {
      color: Colors.placeholderText,
    },
    // Modal styles
    modalContainer: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontSize: 16,
    },
    projectItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    projectItemSelected: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    projectItemContent: {
      flex: 1,
    },
    projectItemName: {
      fontSize: 16,
      fontWeight: '600',
    },
    projectItemClient: {
      fontSize: 14,
      marginTop: 2,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Transaction' : 'New Transaction'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.saveButton}
            disabled={saving}
          >
            <Text style={[styles.saveButtonText, saving && styles.saveButtonTextDisabled]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Project Selection */}
          {needsProjectPicker ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Project</Text>
              <TouchableOpacity
                style={[styles.projectSelector, !selectedProject && styles.projectSelectorEmpty]}
                onPress={() => setShowProjectPicker(true)}
              >
                <Ionicons name="briefcase" size={18} color={selectedProject ? Colors.primaryText : Colors.placeholderText} />
                <Text style={[styles.projectSelectorText, !selectedProject && styles.projectSelectorTextEmpty]}>
                  {selectedProject?.name || 'Select a project...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.projectBadge}>
              <Ionicons name="briefcase" size={14} color={Colors.secondaryText} />
              <Text style={styles.projectName}>{projectName}</Text>
            </View>
          )}

          {/* Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Type</Text>
            <View style={styles.typeContainer}>
              <TouchableOpacity
                style={[styles.typeButton, type === 'expense' && styles.typeButtonActive]}
                onPress={() => setType('expense')}
              >
                <Ionicons
                  name="trending-down"
                  size={20}
                  color={type === 'expense' ? Colors.white : '#EF4444'}
                />
                <Text style={[styles.typeButtonText, type === 'expense' && styles.typeButtonTextActive]}>
                  Expense
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeButton, type === 'income' && styles.typeButtonActive]}
                onPress={() => setType('income')}
              >
                <Ionicons
                  name="trending-up"
                  size={20}
                  color={type === 'income' ? Colors.white : '#10B981'}
                />
                <Text style={[styles.typeButtonText, type === 'income' && styles.typeButtonTextActive]}>
                  Income
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Category (for expenses) */}
          {type === 'expense' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Category</Text>
              <View style={styles.categoryGrid}>
                {expenseCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryButton,
                      category === cat.value && styles.categoryButtonActive,
                    ]}
                    onPress={() => setCategory(cat.value)}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={20}
                      color={category === cat.value ? Colors.primaryText : Colors.placeholderText}
                    />
                    <Text
                      style={[
                        styles.categoryButtonText,
                        category === cat.value && styles.categoryButtonTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Payment Method (for income) */}
          {type === 'income' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Payment Method</Text>
              <View style={styles.categoryGrid}>
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method.value}
                    style={[
                      styles.categoryButton,
                      paymentMethod === method.value && styles.categoryButtonActive,
                    ]}
                    onPress={() => setPaymentMethod(method.value)}
                  >
                    <Ionicons
                      name={method.icon}
                      size={20}
                      color={paymentMethod === method.value ? Colors.primaryText : Colors.placeholderText}
                    />
                    <Text
                      style={[
                        styles.categoryButtonText,
                        paymentMethod === method.value && styles.categoryButtonTextActive,
                      ]}
                    >
                      {method.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g., Lumber for framing"
              placeholderTextColor={Colors.placeholderText}
            />
          </View>

          {/* Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Amount</Text>
            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.placeholderText}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.placeholderText}
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional details..."
              placeholderTextColor={Colors.placeholderText}
              multiline
              numberOfLines={4}
            />
          </View>
        </ScrollView>

        {/* Project Picker Modal */}
        <Modal
          visible={showProjectPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowProjectPicker(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
                <Ionicons name="close" size={24} color={Colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Project</Text>
              <View style={{ width: 24 }} />
            </View>
            {loadingProjects ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primaryBlue} />
              </View>
            ) : projects.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No active projects</Text>
              </View>
            ) : (
              <FlatList
                data={projects}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.projectItem,
                      { borderBottomColor: Colors.border },
                      selectedProject?.id === item.id && styles.projectItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedProject({ id: item.id, name: item.name });
                      setShowProjectPicker(false);
                    }}
                  >
                    <View style={styles.projectItemContent}>
                      <Text style={[styles.projectItemName, { color: Colors.primaryText }]}>{item.name}</Text>
                      {item.client && (
                        <Text style={[styles.projectItemClient, { color: Colors.secondaryText }]}>{item.client}</Text>
                      )}
                    </View>
                    {selectedProject?.id === item.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
