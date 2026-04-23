import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../utils/storage';

// Adds a new "trade" to a project. A trade maps 1:1 to a project_phases row
// (so it shows up in Phases + Budget Breakdown) and also mirrors into
// project_trade_budgets for the legacy "Other Trades" list. The initial-payment
// amount, if provided, writes a project_transactions row linked to the new
// phase so the Spent-vs-Budget math stays in sync.
export default function AddTradePhaseModal({ visible, onClose, projectId, onAdded }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [tradeName, setTradeName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [tasks, setTasks] = useState([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const taskInputRef = useRef(null);

  const resetAndClose = () => {
    setTradeName('');
    setBudgetAmount('');
    setPaidAmount('');
    setTasks([]);
    setNewTaskText('');
    setSubmitting(false);
    onClose();
  };

  const handleAddTask = () => {
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    setTasks(prev => [...prev, trimmed]);
    setNewTaskText('');
    // Force-clear the native input (belt-and-suspenders against stale
    // controlled value on some RN versions) and keep focus so the user
    // can immediately type the next task without re-tapping the field.
    taskInputRef.current?.clear?.();
    taskInputRef.current?.focus?.();
  };

  const handleRemoveTask = (idx) => {
    setTasks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const name = tradeName.trim();
    if (!name) {
      Alert.alert('Missing trade name', 'Enter a trade name (e.g. Electrical).');
      return;
    }
    const budget = parseFloat(budgetAmount);
    if (!Number.isFinite(budget) || budget <= 0) {
      Alert.alert('Missing budget', 'Enter a budget amount greater than 0.');
      return;
    }
    const paid = parseFloat(paidAmount) || 0;

    setSubmitting(true);
    try {
      // Determine the next order_index so the new phase sorts after
      // existing ones. Null phases → start at 0.
      const { data: existing } = await supabase
        .from('project_phases')
        .select('order_index')
        .eq('project_id', projectId)
        .order('order_index', { ascending: false })
        .limit(1);
      const nextOrder = ((existing && existing[0]?.order_index) ?? -1) + 1;

      const phaseTasks = tasks.map((description, i) => ({
        id: `task-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        description,
        order: i + 1,
        completed: false,
        completed_by: null,
        completed_date: null,
        photo_url: null,
      }));

      const { data: insertedPhase, error: phaseErr } = await supabase
        .from('project_phases')
        .insert({
          project_id: projectId,
          name,
          order_index: nextOrder,
          planned_days: 5,
          completion_percentage: 0,
          status: 'not_started',
          budget,
          tasks: phaseTasks,
          services: [],
          time_extensions: [],
        })
        .select('id, project_id, name, order_index, budget')
        .single();
      if (phaseErr) throw phaseErr;

      // Ensure the project is flagged as having phases so PhaseTimeline
      // renders even if this was the first phase added. Also bumps
      // updated_at so ProjectDetailView's refresh effect re-runs.
      await supabase
        .from('projects')
        .update({ has_phases: true, updated_at: new Date().toISOString() })
        .eq('id', projectId);

      // Mirror into project_trade_budgets so the legacy Other-Trades list
      // keeps rendering. Failure here is non-fatal — the phase is the
      // source of truth.
      const { error: tbErr } = await supabase
        .from('project_trade_budgets')
        .insert({
          project_id: projectId,
          trade_name: name,
          budget_amount: budget,
        });
      if (tbErr) console.warn('trade_budgets mirror insert failed:', tbErr.message);

      if (paid > 0) {
        const userId = await getCurrentUserId();
        const { error: txErr } = await supabase
          .from('project_transactions')
          .insert({
            project_id: projectId,
            phase_id: insertedPhase?.id || null,
            type: 'expense',
            category: 'subcontractor',
            subcategory: name.toLowerCase(),
            description: `${name} — initial payment`,
            amount: paid,
            date: new Date().toISOString().split('T')[0],
            is_auto_generated: false,
            created_by: userId || null,
          });
        if (txErr) throw txErr;
      }

      onAdded && onAdded(insertedPhase);
      resetAndClose();
    } catch (e) {
      console.error('Add trade phase failed:', e);
      Alert.alert('Could not add trade', e?.message || 'Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { backgroundColor: Colors.cardBackground || '#FFFFFF' }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>Add Trade</Text>
            <TouchableOpacity onPress={resetAndClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: Colors.secondaryText }]}>Trade name</Text>
            <TextInput
              style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }]}
              placeholder="e.g. Electrical"
              placeholderTextColor={Colors.secondaryText}
              value={tradeName}
              onChangeText={setTradeName}
            />

            <Text style={[styles.label, { color: Colors.secondaryText }]}>Budget amount</Text>
            <TextInput
              style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }]}
              placeholder="0.00"
              placeholderTextColor={Colors.secondaryText}
              value={budgetAmount}
              onChangeText={(t) => setBudgetAmount(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.label, { color: Colors.secondaryText }]}>Already paid (optional)</Text>
            <TextInput
              style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground }]}
              placeholder="0.00"
              placeholderTextColor={Colors.secondaryText}
              value={paidAmount}
              onChangeText={(t) => setPaidAmount(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />

            <View style={styles.tasksHeaderRow}>
              <Text style={[styles.label, { color: Colors.secondaryText, marginTop: 0 }]}>
                Tasks ({tasks.length})
              </Text>
            </View>

            {tasks.map((task, idx) => (
              <View
                key={idx}
                style={[styles.taskRow, { borderColor: Colors.border, backgroundColor: Colors.lightBackground }]}
              >
                <Ionicons name="ellipse-outline" size={14} color={Colors.secondaryText} />
                <Text style={[styles.taskText, { color: Colors.primaryText }]} numberOfLines={2}>
                  {task}
                </Text>
                <TouchableOpacity
                  onPress={() => handleRemoveTask(idx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.addTaskRow}>
              <TextInput
                ref={taskInputRef}
                style={[styles.input, { flex: 1, color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.lightBackground, marginTop: 0 }]}
                placeholder="Add a task…"
                placeholderTextColor={Colors.secondaryText}
                value={newTaskText}
                onChangeText={setNewTaskText}
                onSubmitEditing={handleAddTask}
                blurOnSubmit={false}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={handleAddTask}
                style={[styles.addTaskBtn, { backgroundColor: Colors.primaryBlue || '#3B82F6' }]}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: Colors.lightBackground || '#F1F5F9' }]}
              onPress={resetAndClose}
              disabled={submitting}
            >
              <Text style={{ color: Colors.secondaryText, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: Colors.primaryBlue || '#3B82F6', opacity: submitting ? 0.6 : 1 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                {submitting ? 'Adding…' : 'Add Trade'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  label: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginTop: Spacing.sm,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: FontSizes.body,
  },
  tasksHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginTop: 6,
  },
  taskText: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  addTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  addTaskBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.md,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
});
