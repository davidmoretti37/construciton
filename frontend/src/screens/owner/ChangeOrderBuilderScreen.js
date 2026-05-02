/**
 * ChangeOrderBuilderScreen — owner-facing CO builder.
 *
 * Mirrors EstimateBuilder: 5 accordion sections, 2s debounced auto-save,
 * AppState/unmount flush, header status pill, Send button promotes draft.
 *
 * Sections:
 *   1. Basics       — project link (required), title, description (justification)
 *   2. Line Items   — shared <LineItemEditor>
 *   3. Pricing      — tax_rate input + computed totals
 *   4. Schedule     — schedule_impact_days, billing_strategy
 *   5. Review & Send — preview + signature_required + Send
 *
 * Route params: { co_id?, project_id?, draft? }
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, AppState, Switch, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import {
  saveChangeOrder, updateChangeOrder, getChangeOrder, sendChangeOrder,
} from '../../utils/storage/changeOrders';
import { supabase } from '../../lib/supabase';
import LineItemEditor, { fmt$ } from '../../components/LineItemEditor';

const SECTIONS = [
  { key: 'basics',    title: 'Change order basics', icon: 'document-text-outline' },
  { key: 'lineItems', title: 'Line items',          icon: 'list-outline' },
  { key: 'pricing',   title: 'Pricing & tax',       icon: 'calculator-outline' },
  { key: 'schedule',  title: 'Schedule & billing',  icon: 'calendar-outline' },
  { key: 'review',    title: 'Review & send',       icon: 'paper-plane-outline' },
];

const BILLING_STRATEGIES = [
  { key: 'invoice_now',   label: 'Invoice now (separate invoice)' },
  { key: 'next_invoice',  label: 'Add to next invoice' },
  { key: 'final_invoice', label: 'Add to final invoice' },
];

function chipFor(kind) {
  switch (kind) {
    case 'green': return { bg: '#D1FAE5', fg: '#065F46', label: '✓' };
    case 'amber': return { bg: '#FEF3C7', fg: '#92400E', label: '!' };
    case 'red':   return { bg: '#FEE2E2', fg: '#991B1B', label: '!' };
    default:      return { bg: '#E5E7EB', fg: '#374151', label: '·' };
  }
}

function pillForStatus(status) {
  const s = (status || 'draft').toLowerCase();
  switch (s) {
    case 'draft':    return { bg: '#E5E7EB', fg: '#374151', label: 'Draft' };
    case 'sent':     return { bg: '#DBEAFE', fg: '#1E40AF', label: 'Sent' };
    case 'approved': return { bg: '#D1FAE5', fg: '#065F46', label: 'Approved' };
    case 'rejected': return { bg: '#FEE2E2', fg: '#991B1B', label: 'Rejected' };
    case 'voided':   return { bg: '#F3F4F6', fg: '#6B7280', label: 'Voided' };
    default:         return { bg: '#E5E7EB', fg: '#374151', label: s };
  }
}

export default function ChangeOrderBuilderScreen({ route, navigation }) {
  const { isDark } = useTheme();
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const seedDraft = route?.params?.draft || null;
  const seedProjectId = route?.params?.project_id || null;
  const initialId = route?.params?.co_id || seedDraft?.id || null;

  const [coId, setCoId] = useState(initialId);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saveState, setSaveState] = useState('idle');
  const [status, setStatus] = useState('draft');
  const [coNumber, setCoNumber] = useState(null);

  const [expanded, setExpanded] = useState({ basics: true });

  // Section 1
  const [projectId, setProjectId] = useState(seedProjectId || seedDraft?.project_id || null);
  const [projectName, setProjectName] = useState(seedDraft?.project_name || '');
  const [title, setTitle] = useState(seedDraft?.title || '');
  const [description, setDescription] = useState(seedDraft?.description || '');

  // Section 2
  const [items, setItems] = useState(
    Array.isArray(seedDraft?.line_items || seedDraft?.lineItems) && (seedDraft.line_items || seedDraft.lineItems).length > 0
      ? (seedDraft.line_items || seedDraft.lineItems).map((it) => ({
          description: it.description || '',
          quantity: Number(it.quantity ?? 1),
          unit: it.unit || 'ea',
          pricePerUnit: Number(it.unit_price ?? it.pricePerUnit ?? 0),
          total: Number(it.quantity ?? 1) * Number(it.unit_price ?? it.pricePerUnit ?? 0),
        }))
      : [{ description: '', quantity: 1, unit: 'ea', pricePerUnit: 0, total: 0 }]
  );

  // Section 3
  const [taxRate, setTaxRate] = useState(String(seedDraft?.tax_rate ?? seedDraft?.taxRate ?? 0));

  // Section 4
  const [scheduleImpactDays, setScheduleImpactDays] = useState(
    String(seedDraft?.schedule_impact_days ?? seedDraft?.scheduleImpactDays ?? 0)
  );
  const [billingStrategy, setBillingStrategy] = useState(seedDraft?.billing_strategy || 'invoice_now');

  // Section 5
  const [signatureRequired, setSignatureRequired] = useState(!!(seedDraft?.signature_required ?? seedDraft?.signatureRequired ?? false));

  // Project picker
  const [projects, setProjects] = useState([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.total || 0), 0),
    [items]
  );
  const taxAmount = useMemo(() => subtotal * (Number(taxRate) || 0) / 100, [subtotal, taxRate]);
  const total = subtotal + taxAmount;

  // ───── Bootstrap ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialId) {
          const co = await getChangeOrder(initialId);
          if (co && !cancelled) {
            setCoId(co.id);
            setCoNumber(co.co_number ?? null);
            setStatus(co.status || 'draft');
            if (co.project_id) setProjectId(co.project_id);
            setTitle(co.title || '');
            setDescription(co.description || '');
            setTaxRate(String(co.tax_rate ?? 0));
            setScheduleImpactDays(String(co.schedule_impact_days ?? 0));
            setBillingStrategy(co.billing_strategy || 'invoice_now');
            setSignatureRequired(!!co.signature_required);
            const li = co.change_order_line_items || co.line_items || [];
            if (li.length > 0) {
              setItems(li.map((it) => ({
                description: it.description || '',
                quantity: Number(it.quantity ?? 1),
                unit: it.unit || 'ea',
                pricePerUnit: Number(it.unit_price ?? 0),
                total: Number(it.quantity ?? 1) * Number(it.unit_price ?? 0),
              })));
            }
          }
        }
        // Load projects
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (userId) {
          const { data: ps } = await supabase
            .from('projects')
            .select('id, name, client_name, status')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          if (!cancelled) setProjects(ps || []);
          if (projectId && !projectName) {
            const p = (ps || []).find((x) => x.id === projectId);
            if (p) setProjectName(p.name || '');
          }
        }
      } catch (e) {
        console.warn('[CO Builder] bootstrap error', e);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  // ───── Auto-save ──────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!projectId || !title?.trim()) return;
    if (status !== 'draft') return;
    try {
      setSaveState('saving');
      const payload = {
        project_id: projectId,
        title: title.trim(),
        description: description || null,
        scheduleImpactDays: Number(scheduleImpactDays) || 0,
        taxRate: Number(taxRate) || 0,
        signatureRequired,
        billingStrategy,
        lineItems: items.map((it) => ({
          description: it.description || '',
          quantity: Number(it.quantity || 0),
          unit: it.unit || 'ea',
          unit_price: Number(it.pricePerUnit || 0),
        })),
      };
      let saved;
      if (coId) {
        saved = await updateChangeOrder(coId, payload);
      } else {
        saved = await saveChangeOrder(payload);
        if (saved?.id) {
          setCoId(saved.id);
          if (saved.co_number) setCoNumber(saved.co_number);
        }
      }
      setSaveState('saved');
    } catch (e) {
      console.warn('[CO Builder] save failed', e);
      setSaveState('error');
    }
  }, [coId, projectId, title, description, scheduleImpactDays, taxRate, signatureRequired, billingStrategy, items, status]);

  const flushSaveRef = useRef(flushSave);
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

  useEffect(() => {
    if (bootstrapping) return;
    if (status !== 'draft') return;
    const t = setTimeout(() => { flushSaveRef.current(); }, 2000);
    return () => clearTimeout(t);
  }, [bootstrapping, status, projectId, title, description, scheduleImpactDays, taxRate, signatureRequired, billingStrategy, items]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') flushSaveRef.current();
    });
    return () => { sub.remove(); flushSaveRef.current(); };
  }, []);

  // ───── Section chip logic ──────────────────────────────────────
  const sectionChip = (key) => {
    switch (key) {
      case 'basics':
        if (!projectId) return chipFor('red');
        if (!title?.trim()) return chipFor('amber');
        return chipFor('green');
      case 'lineItems':
        if (items.length === 0 || items.every((it) => !it.description?.trim())) return chipFor('red');
        if (items.some((it) => !it.description?.trim() || !it.pricePerUnit)) return chipFor('amber');
        return chipFor('green');
      case 'pricing':
        return subtotal > 0 ? chipFor('green') : chipFor('grey');
      case 'schedule':
        return chipFor('green');
      case 'review':
        if (projectId && title && items.length > 0 && subtotal > 0) return chipFor('amber');
        return chipFor('grey');
      default: return chipFor('grey');
    }
  };

  const toggle = (key) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  // ───── Send ────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!projectId) {
      Alert.alert('Pick a project'); setExpanded((s) => ({ ...s, basics: true })); return;
    }
    if (!title?.trim()) {
      Alert.alert('Add a title'); setExpanded((s) => ({ ...s, basics: true })); return;
    }
    if (items.length === 0 || items.every((it) => !it.description?.trim())) {
      Alert.alert('Add at least one line item'); setExpanded((s) => ({ ...s, lineItems: true })); return;
    }
    try {
      setSaveState('saving');
      await flushSaveRef.current();
      if (!coId) {
        Alert.alert('Save failed', 'Could not save the change order. Please try again.');
        return;
      }
      await sendChangeOrder(coId);
      setStatus('sent');
      setSaveState('saved');
      Alert.alert('Sent', `CO-${String(coNumber || '').padStart(3, '0')} sent to the client portal.`);
    } catch (e) {
      console.warn('[CO Builder] send failed', e);
      setSaveState('error');
      Alert.alert('Send failed', e?.message || 'Please try again.');
    }
  };

  // ───── Render ──────────────────────────────────────────────────
  if (bootstrapping) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  const readOnly = status !== 'draft';
  const pill = pillForStatus(status);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {coNumber ? `CO-${String(coNumber).padStart(3, '0')}` : 'New change order'}
          </Text>
          <SaveIndicator state={saveState} readOnly={readOnly} Colors={Colors} />
        </View>
        <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.statusPillText, { color: pill.fg }]}>{pill.label}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 80 }}>

        {/* Section 1 — Basics */}
        <Section
          sectionKey="basics" title="Change order basics" icon="document-text-outline"
          expanded={!!expanded.basics} chip={sectionChip('basics')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label="Project *" Colors={Colors} styles={styles}>
            <TouchableOpacity
              style={styles.input}
              onPress={() => !readOnly && setShowProjectPicker(true)}
              activeOpacity={readOnly ? 1 : 0.7}
            >
              <Text style={[styles.inputText, !projectId && styles.placeholderText]}>
                {projectName || (projectId ? '(loading project name)' : 'Pick a project')}
              </Text>
            </TouchableOpacity>
          </Field>
          <Field label="Title *" Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Add wainscoting to dining room"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              editable={!readOnly}
            />
          </Field>
          <Field label="Justification / description" Colors={Colors} styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Why is this change needed? What's included?"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              multiline
              editable={!readOnly}
            />
          </Field>
        </Section>

        {/* Section 2 — Line items */}
        <Section
          sectionKey="lineItems" title="Line items" icon="list-outline"
          expanded={!!expanded.lineItems} chip={sectionChip('lineItems')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <LineItemEditor items={items} onChange={readOnly ? () => {} : setItems} Colors={Colors} />
        </Section>

        {/* Section 3 — Pricing */}
        <Section
          sectionKey="pricing" title="Pricing & tax" icon="calculator-outline"
          expanded={!!expanded.pricing} chip={sectionChip('pricing')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label="Tax rate (%)" Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={String(taxRate)}
              onChangeText={setTaxRate}
              keyboardType="decimal-pad"
              editable={!readOnly}
            />
          </Field>
          <View style={{ marginTop: 12 }}>
            <SummaryRow label="Subtotal"   value={fmt$(subtotal)}  styles={styles} />
            <SummaryRow label="Tax"        value={fmt$(taxAmount)} styles={styles} />
            <View style={styles.divider} />
            <SummaryRow label="Total"      value={fmt$(total)}     bold styles={styles} />
          </View>
        </Section>

        {/* Section 4 — Schedule & billing */}
        <Section
          sectionKey="schedule" title="Schedule & billing" icon="calendar-outline"
          expanded={!!expanded.schedule} chip={sectionChip('schedule')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label="Schedule impact (days)" Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={String(scheduleImpactDays)}
              onChangeText={setScheduleImpactDays}
              keyboardType="number-pad"
              editable={!readOnly}
            />
          </Field>
          <Field label="Billing strategy" Colors={Colors} styles={styles}>
            {BILLING_STRATEGIES.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.radioRow, billingStrategy === opt.key && styles.radioRowActive]}
                onPress={() => !readOnly && setBillingStrategy(opt.key)}
                activeOpacity={readOnly ? 1 : 0.7}
              >
                <Ionicons
                  name={billingStrategy === opt.key ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={billingStrategy === opt.key ? Colors.primaryBlue : Colors.secondaryText}
                />
                <Text style={[styles.radioLabel, { color: Colors.primaryText }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </Field>
        </Section>

        {/* Section 5 — Review & send */}
        <Section
          sectionKey="review" title="Review & send" icon="paper-plane-outline"
          expanded={!!expanded.review} chip={sectionChip('review')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <View style={styles.reviewBlock}>
            <Text style={styles.reviewLabel}>Title</Text>
            <Text style={styles.reviewValue}>{title || '—'}</Text>
            <Text style={[styles.reviewLabel, { marginTop: 12 }]}>Project</Text>
            <Text style={styles.reviewValue}>{projectName || '—'}</Text>
            <Text style={[styles.reviewLabel, { marginTop: 12 }]}>Total</Text>
            <Text style={[styles.reviewValue, { fontSize: 22, fontWeight: '800' }]}>{fmt$(total)}</Text>
            <Text style={styles.reviewSub}>{items.length} line item{items.length === 1 ? '' : 's'} · {scheduleImpactDays || 0} day impact</Text>
          </View>
          <Field label="Require signature on approval" Colors={Colors} styles={styles}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Switch
                value={signatureRequired}
                onValueChange={(v) => !readOnly && setSignatureRequired(v)}
                disabled={readOnly}
              />
              <Text style={{ color: Colors.secondaryText, fontSize: 13 }}>
                {signatureRequired ? 'Signature required' : 'No signature required'}
              </Text>
            </View>
          </Field>
          {!readOnly && (
            <>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: Colors.primaryBlue }]}
                onPress={async () => {
                  await flushSaveRef.current();
                  navigation.goBack();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.sendBtnText}>Save</Text>
              </TouchableOpacity>
              <Text style={{ marginTop: 10, fontSize: 12, color: Colors.secondaryText, textAlign: 'center' }}>
                Send, share, or preview from the chat preview card.
              </Text>
            </>
          )}
        </Section>

      </ScrollView>

      {/* Project picker modal */}
      <Modal visible={showProjectPicker} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: Colors.surface || Colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Pick a project</Text>
              <TouchableOpacity onPress={() => setShowProjectPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={projects}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.projectRow}
                  onPress={() => {
                    setProjectId(item.id);
                    setProjectName(item.name || '');
                    setShowProjectPicker(false);
                  }}
                >
                  <Text style={[styles.projectName, { color: Colors.primaryText }]}>{item.name || '(no name)'}</Text>
                  {item.client_name && (
                    <Text style={[styles.projectMeta, { color: Colors.secondaryText }]}>{item.client_name}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ padding: 20, color: Colors.secondaryText, textAlign: 'center' }}>
                  No projects yet.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ───── Subcomponents ──────────────────────────────────────────────
function Section({ sectionKey, title, icon, expanded, chip, onToggle, children, Colors, styles }) {
  return (
    <View style={[styles.section, { borderColor: Colors.border, backgroundColor: Colors.surface || Colors.background }]}>
      <TouchableOpacity onPress={() => onToggle(sectionKey)} style={styles.sectionHeader} activeOpacity={0.7}>
        <Ionicons name={icon} size={18} color={Colors.secondaryText} />
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{title}</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
      </TouchableOpacity>
      {expanded && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function Field({ label, children, Colors, styles }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value, bold, styles }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', fontSize: 15 }]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontWeight: '800', fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

function SaveIndicator({ state, readOnly, Colors }) {
  let label = '';
  let color = Colors.secondaryText;
  if (readOnly) { label = 'Read-only'; }
  else if (state === 'saving') { label = 'Saving…'; }
  else if (state === 'saved')  { label = 'Saved'; color = '#10B981'; }
  else if (state === 'error')  { label = 'Save failed · retrying…'; color = '#DC2626'; }
  if (!label) return null;
  return <Text style={{ fontSize: 11, color, marginTop: 1 }}>{label}</Text>;
}

const makeStyles = (Colors) => StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  section: {
    borderWidth: 1, borderRadius: 14, marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  chip: {
    minWidth: 20, paddingHorizontal: 6,
    height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  sectionBody: { padding: 14 },

  label: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    fontSize: 14, color: Colors.primaryText,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    minHeight: 44,
  },
  inputText: { fontSize: 14, color: Colors.primaryText },
  placeholderText: { color: Colors.secondaryText },
  multilineInput: { minHeight: 70, textAlignVertical: 'top', paddingTop: 12 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 13, color: Colors.secondaryText },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: 6 },

  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  radioRowActive: { backgroundColor: Colors.background },
  radioLabel: { fontSize: 14 },

  reviewBlock: {
    padding: 14, borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 12,
  },
  reviewLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  reviewValue: { fontSize: 16, fontWeight: '600', color: Colors.primaryText, marginTop: 4 },
  reviewSub: { fontSize: 12, color: Colors.secondaryText, marginTop: 6 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
    marginTop: 6,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 16, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  projectRow: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  projectName: { fontSize: 15, fontWeight: '600' },
  projectMeta: { fontSize: 12, marginTop: 2 },
});
