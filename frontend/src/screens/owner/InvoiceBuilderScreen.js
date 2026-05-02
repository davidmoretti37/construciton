/**
 * InvoiceBuilderScreen — owner-facing standalone invoice builder.
 *
 * Mirrors EstimateBuilder/COBuilder. For invoices created from accepted
 * estimates the user already uses createInvoiceFromEstimate; this screen
 * is for standalone / progress / T&M invoices that don't have a parent
 * estimate.
 *
 * Sections:
 *   1. Basics       — client info, project link (optional), invoice date, due date
 *   2. Line Items   — shared <LineItemEditor>
 *   3. Pricing      — tax_rate input + computed totals
 *   4. Terms        — payment_terms text + notes
 *   5. Review & Send — preview + Send button
 *
 * Route params: { invoice_id?, project_id?, draft? }
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, AppState, Platform, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import {
  saveInvoice, updateInvoice, getInvoice,
} from '../../utils/storage/invoices';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';
import LineItemEditor, { fmt$ } from '../../components/LineItemEditor';

const SECTIONS = [
  { key: 'basics',    title: 'Invoice basics', icon: 'document-text-outline' },
  { key: 'lineItems', title: 'Line items',     icon: 'list-outline' },
  { key: 'pricing',   title: 'Pricing & tax',  icon: 'calculator-outline' },
  { key: 'terms',     title: 'Terms & notes',  icon: 'reader-outline' },
  { key: 'review',    title: 'Review & send',  icon: 'paper-plane-outline' },
];

const PAYMENT_TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

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
    case 'draft':   return { bg: '#E5E7EB', fg: '#374151', label: 'Draft' };
    case 'unpaid':  return { bg: '#DBEAFE', fg: '#1E40AF', label: 'Unpaid' };
    case 'partial': return { bg: '#FEF3C7', fg: '#92400E', label: 'Partial' };
    case 'paid':    return { bg: '#D1FAE5', fg: '#065F46', label: 'Paid' };
    case 'overdue': return { bg: '#FEE2E2', fg: '#991B1B', label: 'Overdue' };
    case 'voided':  return { bg: '#F3F4F6', fg: '#6B7280', label: 'Voided' };
    default:        return { bg: '#E5E7EB', fg: '#374151', label: s };
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function InvoiceBuilderScreen({ route, navigation }) {
  const { isDark } = useTheme();
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const seedDraft = route?.params?.draft || null;
  const seedProjectId = route?.params?.project_id || null;
  const initialId = route?.params?.invoice_id || seedDraft?.id || null;

  const [invoiceId, setInvoiceId] = useState(initialId);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saveState, setSaveState] = useState('idle');
  const [status, setStatus] = useState('draft');
  const [invoiceNumber, setInvoiceNumber] = useState(null);

  const [expanded, setExpanded] = useState({ basics: true });

  // Section 1
  const [clientName, setClientName] = useState(seedDraft?.client_name || seedDraft?.clientName || '');
  const [clientEmail, setClientEmail] = useState(seedDraft?.client_email || seedDraft?.clientEmail || '');
  const [clientPhone, setClientPhone] = useState(seedDraft?.client_phone || seedDraft?.clientPhone || '');
  const [clientAddress, setClientAddress] = useState(seedDraft?.client_address || seedDraft?.clientAddress || '');
  const [projectId, setProjectId] = useState(seedProjectId || seedDraft?.project_id || null);
  const [projectName, setProjectName] = useState(seedDraft?.project_name || seedDraft?.projectName || '');
  const [dueDate, setDueDate] = useState(seedDraft?.due_date || seedDraft?.dueDate || plusDaysIso(30));

  // Section 2
  const [items, setItems] = useState(
    Array.isArray(seedDraft?.items) && seedDraft.items.length > 0
      ? seedDraft.items.map((it) => ({
          description: it.description || '',
          quantity: Number(it.quantity ?? 1),
          unit: it.unit || 'ea',
          pricePerUnit: Number(it.pricePerUnit ?? it.unit_price ?? 0),
          total: Number(it.total ?? (Number(it.quantity ?? 1) * Number(it.pricePerUnit ?? it.unit_price ?? 0))),
        }))
      : [{ description: '', quantity: 1, unit: 'ea', pricePerUnit: 0, total: 0 }]
  );

  // Section 3
  const [taxRate, setTaxRate] = useState(String(seedDraft?.tax_rate ?? seedDraft?.taxRate ?? 0));

  // Section 4
  const [paymentTerms, setPaymentTerms] = useState(seedDraft?.payment_terms || seedDraft?.paymentTerms || 'Net 30');
  const [notes, setNotes] = useState(seedDraft?.notes || '');

  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projects, setProjects] = useState([]);
  const [datePickerField, setDatePickerField] = useState(null);

  const subtotal = useMemo(() => items.reduce((s, it) => s + Number(it.total || 0), 0), [items]);
  const taxAmount = useMemo(() => subtotal * (Number(taxRate) || 0) / 100, [subtotal, taxRate]);
  const total = subtotal + taxAmount;

  // ───── Bootstrap ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialId) {
          const inv = await getInvoice(initialId);
          if (inv && !cancelled) {
            setInvoiceId(inv.id);
            setInvoiceNumber(inv.invoice_number ?? null);
            setStatus(inv.status || 'draft');
            setClientName(inv.client_name || '');
            setClientEmail(inv.client_email || '');
            setClientPhone(inv.client_phone || '');
            setClientAddress(inv.client_address || '');
            setProjectId(inv.project_id || null);
            setProjectName(inv.project_name || '');
            setDueDate(inv.due_date || plusDaysIso(30));
            setTaxRate(String(inv.tax_rate ?? 0));
            setPaymentTerms(inv.payment_terms || 'Net 30');
            setNotes(inv.notes || '');
            const li = Array.isArray(inv.items) ? inv.items : [];
            if (li.length > 0) {
              setItems(li.map((it) => ({
                description: it.description || '',
                quantity: Number(it.quantity ?? 1),
                unit: it.unit || 'ea',
                pricePerUnit: Number(it.pricePerUnit ?? it.unit_price ?? 0),
                total: Number(it.total ?? (Number(it.quantity ?? 1) * Number(it.pricePerUnit ?? it.unit_price ?? 0))),
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
        console.warn('[Invoice Builder] bootstrap error', e);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  // ───── Auto-save ──────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!clientName?.trim()) return;
    if (status !== 'draft') return;
    try {
      setSaveState('saving');
      const payload = {
        clientName: clientName.trim(),
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        client_address: clientAddress || null,
        project_id: projectId || null,
        projectName: projectName || null,
        items: items.map((it) => ({
          description: it.description || '',
          quantity: Number(it.quantity || 0),
          unit: it.unit || 'ea',
          pricePerUnit: Number(it.pricePerUnit || 0),
          total: Number(it.total || 0),
        })),
        subtotal,
        taxRate: Number(taxRate) || 0,
        taxAmount,
        total,
        due_date: dueDate,
        payment_terms: paymentTerms,
        notes,
      };
      let saved;
      if (invoiceId) {
        saved = await updateInvoice(invoiceId, {
          client_name: payload.clientName,
          client_email: payload.client_email,
          client_phone: payload.client_phone,
          client_address: payload.client_address,
          project_id: payload.project_id,
          project_name: payload.projectName,
          items: payload.items,
          subtotal: payload.subtotal,
          tax_rate: payload.taxRate,
          tax_amount: payload.taxAmount,
          total: payload.total,
          due_date: payload.due_date,
          payment_terms: payload.payment_terms,
          notes: payload.notes,
        });
      } else {
        saved = await saveInvoice(payload);
        if (saved?.id) {
          setInvoiceId(saved.id);
          if (saved.invoice_number) setInvoiceNumber(saved.invoice_number);
        }
      }
      setSaveState('saved');
    } catch (e) {
      console.warn('[Invoice Builder] save failed', e);
      setSaveState('error');
    }
  }, [invoiceId, clientName, clientEmail, clientPhone, clientAddress, projectId, projectName, items, subtotal, taxRate, taxAmount, total, dueDate, paymentTerms, notes, status]);

  const flushSaveRef = useRef(flushSave);
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

  useEffect(() => {
    if (bootstrapping) return;
    if (status !== 'draft') return;
    const t = setTimeout(() => { flushSaveRef.current(); }, 2000);
    return () => clearTimeout(t);
  }, [bootstrapping, status, clientName, clientEmail, clientPhone, clientAddress, projectId, items, taxRate, dueDate, paymentTerms, notes]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') flushSaveRef.current();
    });
    return () => { sub.remove(); flushSaveRef.current(); };
  }, []);

  // ───── Section chips ───────────────────────────────────────────
  const sectionChip = (key) => {
    switch (key) {
      case 'basics':
        if (!clientName?.trim()) return chipFor('red');
        return chipFor('green');
      case 'lineItems':
        if (items.length === 0 || items.every((it) => !it.description?.trim())) return chipFor('red');
        if (items.some((it) => !it.description?.trim() || !it.pricePerUnit)) return chipFor('amber');
        return chipFor('green');
      case 'pricing':
        return subtotal > 0 ? chipFor('green') : chipFor('grey');
      case 'terms':
        return paymentTerms ? chipFor('green') : chipFor('grey');
      case 'review':
        if (clientName && items.length > 0 && subtotal > 0) return chipFor('amber');
        return chipFor('grey');
      default: return chipFor('grey');
    }
  };

  const toggle = (key) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  // ───── Send ────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!clientName?.trim()) {
      Alert.alert('Add a client name'); setExpanded((s) => ({ ...s, basics: true })); return;
    }
    if (!clientEmail?.trim()) {
      Alert.alert('Client email required', 'Add a client email so we can send the invoice.');
      setExpanded((s) => ({ ...s, basics: true })); return;
    }
    if (items.length === 0 || items.every((it) => !it.description?.trim())) {
      Alert.alert('Add at least one line item'); setExpanded((s) => ({ ...s, lineItems: true })); return;
    }
    try {
      setSaveState('saving');
      await flushSaveRef.current();
      if (!invoiceId) {
        Alert.alert('Save failed', 'Could not save the invoice. Please try again.');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_URL}/api/portal-admin/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Request failed: ${res.status}`);
      }
      setStatus('unpaid');
      setSaveState('saved');
      Alert.alert('Sent', `Invoice ${invoiceNumber ? `#${invoiceNumber}` : ''} sent to ${clientEmail}.`);
    } catch (e) {
      console.warn('[Invoice Builder] send failed', e);
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
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {invoiceNumber ? `Invoice #${invoiceNumber}` : 'New invoice'}
          </Text>
          <SaveIndicator state={saveState} readOnly={readOnly} Colors={Colors} />
        </View>
        <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.statusPillText, { color: pill.fg }]}>{pill.label}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 80 }}>

        <Section
          sectionKey="basics" title="Invoice basics" icon="document-text-outline"
          expanded={!!expanded.basics} chip={sectionChip('basics')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label="Client name *" Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientName}
              onChangeText={setClientName}
              placeholder="Client or company name"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              editable={!readOnly}
            />
          </Field>
          <Field label="Client email *" Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientEmail}
              onChangeText={setClientEmail}
              placeholder="name@example.com"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!readOnly}
            />
          </Field>
          <Field label="Client phone" Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientPhone}
              onChangeText={setClientPhone}
              placeholder="(555) 555-5555"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              keyboardType="phone-pad"
              editable={!readOnly}
            />
          </Field>
          <Field label="Client address" Colors={Colors} styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder="123 Main St, City, State"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              multiline
              editable={!readOnly}
            />
          </Field>
          <Field label="Linked project (optional)" Colors={Colors} styles={styles}>
            <TouchableOpacity
              style={styles.input}
              onPress={() => !readOnly && setShowProjectPicker(true)}
              activeOpacity={readOnly ? 1 : 0.7}
            >
              <Text style={[styles.inputText, !projectId && styles.placeholderText]}>
                {projectName || (projectId ? '(loading)' : 'No project — standalone invoice')}
              </Text>
            </TouchableOpacity>
            {projectId && !readOnly && (
              <TouchableOpacity onPress={() => { setProjectId(null); setProjectName(''); }} style={{ marginTop: 6 }}>
                <Text style={{ color: Colors.primaryBlue, fontSize: 13 }}>Unlink project</Text>
              </TouchableOpacity>
            )}
          </Field>
          <Field label="Due date" Colors={Colors} styles={styles}>
            <TouchableOpacity
              style={styles.input}
              onPress={() => !readOnly && setDatePickerField('due')}
              activeOpacity={readOnly ? 1 : 0.7}
            >
              <Text style={styles.inputText}>{dueDate}</Text>
            </TouchableOpacity>
          </Field>
        </Section>

        <Section
          sectionKey="lineItems" title="Line items" icon="list-outline"
          expanded={!!expanded.lineItems} chip={sectionChip('lineItems')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <LineItemEditor items={items} onChange={readOnly ? () => {} : setItems} Colors={Colors} />
        </Section>

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
            <SummaryRow label="Subtotal" value={fmt$(subtotal)}  styles={styles} />
            <SummaryRow label="Tax"      value={fmt$(taxAmount)} styles={styles} />
            <View style={styles.divider} />
            <SummaryRow label="Total"    value={fmt$(total)}     bold styles={styles} />
          </View>
        </Section>

        <Section
          sectionKey="terms" title="Terms & notes" icon="reader-outline"
          expanded={!!expanded.terms} chip={sectionChip('terms')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label="Payment terms" Colors={Colors} styles={styles}>
            <TouchableOpacity
              style={styles.input}
              onPress={() => {
                if (readOnly) return;
                Alert.alert('Payment terms', null, [
                  ...PAYMENT_TERMS.map((t) => ({ text: t, onPress: () => setPaymentTerms(t) })),
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              activeOpacity={readOnly ? 1 : 0.7}
            >
              <Text style={styles.inputText}>{paymentTerms}</Text>
            </TouchableOpacity>
          </Field>
          <Field label="Notes" Colors={Colors} styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any extra info for the client (optional)"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              multiline
              editable={!readOnly}
            />
          </Field>
        </Section>

        <Section
          sectionKey="review" title="Review & send" icon="paper-plane-outline"
          expanded={!!expanded.review} chip={sectionChip('review')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <View style={styles.reviewBlock}>
            <Text style={styles.reviewLabel}>Bill to</Text>
            <Text style={styles.reviewValue}>{clientName || '—'}</Text>
            {clientEmail ? <Text style={[styles.reviewSub, { marginTop: 2 }]}>{clientEmail}</Text> : null}
            <Text style={[styles.reviewLabel, { marginTop: 12 }]}>Total</Text>
            <Text style={[styles.reviewValue, { fontSize: 22, fontWeight: '800' }]}>{fmt$(total)}</Text>
            <Text style={styles.reviewSub}>{items.length} line item{items.length === 1 ? '' : 's'} · due {dueDate} · {paymentTerms}</Text>
          </View>
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

      {/* Project picker */}
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
                    if (item.client_name && !clientName) setClientName(item.client_name);
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

      {/* Date picker */}
      {datePickerField && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDatePickerField(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: Colors.surface || '#FFFFFF', maxHeight: undefined }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Pick due date</Text>
                <TouchableOpacity onPress={() => setDatePickerField(null)}>
                  <Ionicons name="close" size={22} color={Colors.primaryText} />
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={new Date(dueDate || todayIso())}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                themeVariant="light"
                textColor="#000000"
                accentColor={Colors.primaryBlue}
                onChange={(_, d) => {
                  if (d) setDueDate(d.toISOString().slice(0, 10));
                  if (Platform.OS !== 'ios') setDatePickerField(null);
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: Colors.primaryBlue, margin: 12 }]}
                  onPress={() => setDatePickerField(null)}
                >
                  <Text style={styles.sendBtnText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
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

  section: { borderWidth: 1, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  chip: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
