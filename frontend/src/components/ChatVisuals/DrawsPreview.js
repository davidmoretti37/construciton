// DrawsPreview — chat preview card for setting up a project's draw schedule.
// Mirrors ChangeOrderPreview / EstimatePreview but for progress billing:
//   - editable list of draws (description, % of contract OR fixed amount, phase trigger)
//   - retainage stepper
//   - live "% total = 100%" check
//
// Lifecycle:
//   agent emits visualElement {type: 'draws-preview', data}
//   → user reviews / edits inline
//   → tap Save Schedule → onAction('save-draw-schedule', payload)
// ChatScreen routes that to upsertDrawSchedule().

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const C = {
  primary: '#1E40AF', primaryLight: '#DBEAFE',
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', redText: '#991B1B',
  text: '#0F172A', textSec: '#475569', textMuted: '#94A3B8',
  surface: '#FFFFFF', bg: '#F8FAFC', border: '#E2E8F0',
};

const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function defaultDraws(contract) {
  // 5 equal milestones is the canonical residential pattern.
  return [
    { description: 'Deposit',         percent_of_contract: 20, trigger_type: 'project_start' },
    { description: 'Foundation',      percent_of_contract: 20, trigger_type: 'manual' },
    { description: 'Rough-in',        percent_of_contract: 20, trigger_type: 'manual' },
    { description: 'Drywall + paint', percent_of_contract: 20, trigger_type: 'manual' },
    { description: 'Final',           percent_of_contract: 20, trigger_type: 'manual' },
  ];
}

const TRIGGER_LABEL = {
  project_start:    'On project start',
  phase_completion: 'When phase completes',
  manual:           'Send manually',
};

export default function DrawsPreview({ data, onAction }) {
  const projectId = data?.project_id || data?.projectId;
  const projectName = data?.project_name || data?.projectName || '';
  const initialContract = Number(data?.contract_amount ?? data?.contractAmount ?? 0);

  // Hydrate from agent-supplied draws OR a 5-equal-milestones default.
  const initialDraws = (Array.isArray(data?.items) && data.items.length > 0)
    ? data.items.map((it) => ({
        id: it.id || null,
        description: it.description || '',
        percent_of_contract: it.percent_of_contract != null ? Number(it.percent_of_contract) : null,
        fixed_amount: it.fixed_amount != null ? Number(it.fixed_amount) : null,
        trigger_type: it.trigger_type || (it.phase_id ? 'phase_completion' : 'manual'),
        phase_id: it.phase_id || null,
      }))
    : defaultDraws(initialContract);

  const [draws, setDraws] = useState(initialDraws);
  const [retainage, setRetainage] = useState(Number(data?.retainage_percent ?? 10));
  const [contract, setContract] = useState(initialContract);
  const [phases, setPhases] = useState(Array.isArray(data?.projectPhases) ? data.projectPhases : []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!data?.scheduleId);

  // Pull contract + phases if the agent didn't pre-fill them
  useEffect(() => {
    if (!projectId) return;
    if (contract > 0 && phases.length > 0) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: project }, { data: ph }] = await Promise.all([
          supabase.from('projects').select('contract_amount, name').eq('id', projectId).maybeSingle(),
          supabase.from('project_phases').select('id, name, order_index, status').eq('project_id', projectId).order('order_index'),
        ]);
        if (!alive) return;
        if (project?.contract_amount && contract <= 0) setContract(Number(project.contract_amount));
        if (Array.isArray(ph) && phases.length === 0) setPhases(ph);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // ---------- totals ----------
  const totals = useMemo(() => {
    let percentSum = 0;
    let fixedSum = 0;
    draws.forEach((d) => {
      if (d.percent_of_contract != null && !Number.isNaN(d.percent_of_contract)) {
        percentSum += Number(d.percent_of_contract);
      } else if (d.fixed_amount != null && !Number.isNaN(d.fixed_amount)) {
        fixedSum += Number(d.fixed_amount);
      }
    });
    const grossTotal = (percentSum / 100) * contract + fixedSum;
    const retained = grossTotal * (retainage / 100);
    return {
      percentSum: Math.round(percentSum * 10) / 10,
      fixedSum,
      grossTotal,
      retained,
      net: grossTotal - retained,
    };
  }, [draws, retainage, contract]);

  const percentRows = draws.filter((d) => d.percent_of_contract != null);
  const percentTotalOk = percentRows.length === 0 || Math.abs(totals.percentSum - 100) < 0.5;

  // ---------- editing ----------
  const updateDraw = (idx, field, value) => {
    setDraws((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const togglePercentVsFixed = (idx) => {
    setDraws((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (cur.percent_of_contract != null) {
        next[idx] = { ...cur, percent_of_contract: null, fixed_amount: 0 };
      } else {
        next[idx] = { ...cur, percent_of_contract: 0, fixed_amount: null };
      }
      return next;
    });
  };

  const cycleTrigger = (idx) => {
    const order = ['manual', 'project_start', 'phase_completion'];
    setDraws((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const i = order.indexOf(cur.trigger_type || 'manual');
      const nextTrig = order[(i + 1) % order.length];
      next[idx] = {
        ...cur,
        trigger_type: nextTrig,
        // Clear phase_id if switching away from phase_completion
        phase_id: nextTrig === 'phase_completion' ? cur.phase_id : null,
      };
      return next;
    });
  };

  const cyclePhase = (idx) => {
    if (phases.length === 0) {
      Alert.alert('No phases', 'This project has no phases set up yet. Choose "Send manually" instead.');
      return;
    }
    setDraws((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const phaseIds = phases.map((p) => p.id);
      const i = cur.phase_id ? phaseIds.indexOf(cur.phase_id) : -1;
      const nextId = phaseIds[(i + 1) % phaseIds.length];
      next[idx] = { ...cur, phase_id: nextId, trigger_type: 'phase_completion' };
      return next;
    });
  };

  const addDraw = () => {
    setDraws((prev) => [
      ...prev,
      { description: `Draw ${prev.length + 1}`, percent_of_contract: 0, trigger_type: 'manual', phase_id: null },
    ]);
  };

  const removeDraw = (idx) => {
    setDraws((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---------- save ----------
  const validate = () => {
    if (!projectId) {
      Alert.alert('Missing project', 'No project is linked to this draw schedule.');
      return false;
    }
    if (draws.length === 0) {
      Alert.alert('Add a draw', 'A draw schedule needs at least one draw.');
      return false;
    }
    for (const d of draws) {
      const hasPct = d.percent_of_contract != null && !Number.isNaN(d.percent_of_contract);
      const hasFixed = d.fixed_amount != null && !Number.isNaN(d.fixed_amount);
      if (hasPct === hasFixed) {
        Alert.alert('Pick one', `"${d.description || 'unnamed'}" needs either a % OR a fixed amount, not both / neither.`);
        return false;
      }
      if (d.trigger_type === 'phase_completion' && !d.phase_id) {
        Alert.alert('Link a phase', `"${d.description || 'unnamed'}" is set to fire on phase completion but no phase is selected.`);
        return false;
      }
    }
    if (!percentTotalOk) {
      Alert.alert(
        '% draws should total 100',
        `Right now percent draws sum to ${totals.percentSum}%. Adjust them to hit exactly 100% so the project bills the full contract.`
      );
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = {
        enabled: true,
        retainage_percent: Number(retainage || 0),
        items: draws.map((d) => ({
          id: d.id || undefined,
          description: d.description || 'Draw',
          percent_of_contract: d.percent_of_contract != null ? Number(d.percent_of_contract) : null,
          fixed_amount: d.fixed_amount != null ? Number(d.fixed_amount) : null,
          trigger_type: d.trigger_type || 'manual',
          phase_id: d.trigger_type === 'phase_completion' ? d.phase_id : null,
        })),
      };
      const result = await onAction?.({
        type: 'save-draw-schedule',
        data: { project_id: projectId, ...payload },
      });
      if (result?.ok) {
        setSaved(true);
        Alert.alert('Schedule saved', `${result.items?.length || draws.length} draws set up. The next bill will use this schedule.`);
      } else if (result?.error) {
        Alert.alert('Save failed', result.error);
      }
    } catch (e) {
      Alert.alert('Save failed', e?.message || 'Could not save the draw schedule.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- render ----------
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>PROGRESS DRAWS</Text>
          <Text style={styles.title} numberOfLines={2}>{projectName || 'Draw schedule'}</Text>
          <Text style={styles.subtitle}>Contract: {fmt$(contract)}</Text>
        </View>
        <View style={[styles.statusPill, saved ? styles.statusSaved : styles.statusDraft]}>
          <Text style={[styles.statusText, saved ? styles.statusTextSaved : styles.statusTextDraft]}>
            {saved ? 'SAVED' : 'DRAFT'}
          </Text>
        </View>
      </View>

      {/* Retainage */}
      <View style={styles.retainageRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>RETAINAGE</Text>
          <Text style={styles.hint}>Held back from each draw. Released when project completes. Typical: 10%.</Text>
        </View>
        <View style={styles.retainageStepper}>
          <TouchableOpacity onPress={() => setRetainage((p) => Math.max(0, p - 1))} style={styles.stepBtn}>
            <Ionicons name="remove" size={16} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.retainageValue}>{retainage}%</Text>
          <TouchableOpacity onPress={() => setRetainage((p) => Math.min(20, p + 1))} style={styles.stepBtn}>
            <Ionicons name="add" size={16} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Draws list */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>DRAWS</Text>
          <TouchableOpacity onPress={addDraw} style={styles.addLinkBtn}>
            <Ionicons name="add" size={14} color={C.primary} />
            <Text style={styles.addLinkText}>Add</Text>
          </TouchableOpacity>
        </View>

        {draws.map((d, idx) => {
          const computedAmount = d.percent_of_contract != null
            ? (Number(d.percent_of_contract || 0) / 100) * contract
            : Number(d.fixed_amount || 0);
          const phaseLabel = d.phase_id
            ? (phases.find((p) => p.id === d.phase_id)?.name || 'phase?')
            : '—';

          return (
            <View key={idx} style={[styles.drawRow, idx < draws.length - 1 && styles.drawRowBorder]}>
              <View style={styles.drawRowTop}>
                <Text style={styles.drawIndex}>#{idx + 1}</Text>
                <TextInput
                  style={styles.drawDesc}
                  value={d.description}
                  onChangeText={(v) => updateDraw(idx, 'description', v)}
                  placeholder="Description (e.g. Deposit, Rough-in)"
                  placeholderTextColor={C.textMuted}
                />
                <TouchableOpacity onPress={() => removeDraw(idx)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.drawRowBottom}>
                {/* Percent OR fixed toggle */}
                <TouchableOpacity onPress={() => togglePercentVsFixed(idx)} style={styles.amountChip}>
                  <Text style={styles.amountChipLabel}>
                    {d.percent_of_contract != null ? '%' : '$'}
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.amountInput}
                  value={
                    d.percent_of_contract != null
                      ? String(d.percent_of_contract)
                      : String(d.fixed_amount ?? '')
                  }
                  onChangeText={(v) => {
                    const num = parseFloat(v.replace(/[^\d.]/g, '')) || 0;
                    if (d.percent_of_contract != null) {
                      updateDraw(idx, 'percent_of_contract', num);
                    } else {
                      updateDraw(idx, 'fixed_amount', num);
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={C.textMuted}
                />
                <Text style={styles.computedAmount}>= {fmt$(computedAmount)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => d.trigger_type === 'phase_completion' ? cyclePhase(idx) : cycleTrigger(idx)}
                style={styles.triggerRow}
              >
                <Ionicons
                  name={d.trigger_type === 'phase_completion' ? 'git-branch-outline' : d.trigger_type === 'project_start' ? 'rocket-outline' : 'hand-left-outline'}
                  size={13}
                  color={C.textSec}
                />
                <Text style={styles.triggerText}>
                  {TRIGGER_LABEL[d.trigger_type] || 'Send manually'}
                  {d.trigger_type === 'phase_completion' ? ` · ${phaseLabel}` : ''}
                </Text>
                <TouchableOpacity onPress={() => cycleTrigger(idx)} hitSlop={6}>
                  <Ionicons name="swap-horizontal" size={13} color={C.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Totals callout */}
      <View style={[styles.totalsBox, percentTotalOk ? null : styles.totalsBoxWarn]}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>% sum</Text>
          <Text style={[styles.totalsValue, !percentTotalOk && { color: C.amberDark }]}>
            {totals.percentSum}% {percentTotalOk ? '✓' : '⚠︎'}
          </Text>
        </View>
        {totals.fixedSum > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Fixed</Text>
            <Text style={styles.totalsValue}>{fmt$(totals.fixedSum)}</Text>
          </View>
        )}
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Gross</Text>
          <Text style={styles.totalsValue}>{fmt$(totals.grossTotal)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Retainage ({retainage}%)</Text>
          <Text style={styles.totalsValue}>−{fmt$(totals.retained)}</Text>
        </View>
        <View style={[styles.totalsRow, styles.totalsRowFinal]}>
          <Text style={[styles.totalsLabel, { fontWeight: '700', color: C.text }]}>Net to receive</Text>
          <Text style={[styles.totalsValue, { fontWeight: '700', color: C.text, fontSize: 16 }]}>
            {fmt$(totals.net)}
          </Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving || saved}
        style={[styles.cta, (saving || saved) && styles.ctaDisabled]}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.ctaText}>{saved ? 'Schedule saved ✓' : 'Save schedule'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  kicker: { fontSize: 10, fontWeight: '700', color: C.green, letterSpacing: 1, marginBottom: 2 },
  title: { fontSize: 17, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 12, color: C.textSec, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 8 },
  statusDraft: { backgroundColor: C.bg },
  statusSaved: { backgroundColor: C.greenBg },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statusTextDraft: { color: C.textMuted },
  statusTextSaved: { color: C.greenText },

  retainageRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderColor: C.border },
  retainageStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  retainageValue: { fontSize: 16, fontWeight: '700', color: C.text, minWidth: 44, textAlign: 'center' },

  section: { paddingTop: 12, borderTopWidth: 1, borderColor: C.border },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textSec, letterSpacing: 0.5 },
  hint: { fontSize: 11, color: C.textMuted, marginTop: 2 },

  addLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addLinkText: { fontSize: 12, color: C.primary, fontWeight: '600' },

  drawRow: { paddingVertical: 10 },
  drawRowBorder: { borderBottomWidth: 1, borderColor: C.border },
  drawRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  drawIndex: { fontSize: 12, color: C.textMuted, fontWeight: '600', width: 24 },
  drawDesc: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 4 },
  drawRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginLeft: 24 },
  amountChip: { backgroundColor: C.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  amountChipLabel: { fontSize: 13, fontWeight: '700', color: C.text },
  amountInput: { backgroundColor: C.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 13, color: C.text, minWidth: 60 },
  computedAmount: { fontSize: 12, color: C.textSec, marginLeft: 4 },
  triggerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 24 },
  triggerText: { fontSize: 12, color: C.textSec, flex: 1 },

  totalsBox: { backgroundColor: C.bg, borderRadius: 8, padding: 12, marginTop: 12 },
  totalsBoxWarn: { backgroundColor: C.amberLight },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalsRowFinal: { borderTopWidth: 1, borderColor: C.border, marginTop: 4, paddingTop: 6 },
  totalsLabel: { fontSize: 12, color: C.textSec },
  totalsValue: { fontSize: 13, color: C.text, fontWeight: '600' },

  cta: { backgroundColor: C.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  ctaDisabled: { backgroundColor: C.green },
  ctaText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
