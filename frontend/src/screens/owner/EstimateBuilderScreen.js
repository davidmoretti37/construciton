/**
 * EstimateBuilderScreen — owner-facing estimate builder.
 *
 * Mirrors the ProjectBuilder pattern: 5 accordion sections with chip
 * indicators, debounced 2s auto-save (flush on background + unmount),
 * status indicator in the header. Drafts persist on the same row with
 * status='draft'; the Send button promotes status='sent' via the
 * existing /api/portal-admin/estimates/:id/send endpoint.
 *
 * Sections:
 *   1. Basics       — client, project link, date issued, valid_until, notes
 *   2. Line Items   — JSONB array of {description, quantity, unit, pricePerUnit, total}
 *   3. Pricing      — tax_rate input + computed subtotal/tax/total
 *   4. Terms        — payment_terms text
 *   5. Review & Send — preview + signature_required toggle + Send button
 *
 * Allowances + Attachments are deferred (need new schema + new tables).
 *
 * Route params: { estimate_id?, project_id?, draft? } — load existing
 * estimate, or pre-link to a project, or seed from chat preview data.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, AppState, Platform, Switch, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  saveEstimate, updateEstimate, getEstimate, updateEstimateStatus,
} from '../../utils/storage/estimates';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';
import { analyzeBlueprintForEstimate } from '../../services/aiService';
import LineItemEditor from '../../components/LineItemEditor';

const SECTIONS = [
  { key: 'basics',    title: 'Estimate basics',  icon: 'document-text-outline' },
  { key: 'lineItems', title: 'Line items',       icon: 'list-outline' },
  { key: 'pricing',   title: 'Pricing & tax',    icon: 'calculator-outline' },
  { key: 'terms',     title: 'Terms',            icon: 'reader-outline' },
  { key: 'review',    title: 'Review & send',    icon: 'paper-plane-outline' },
];

const UNITS = ['ea', 'sf', 'lf', 'sy', 'cy', 'hr', 'day', 'lot'];

function chipFor(kind) {
  switch (kind) {
    case 'green': return { bg: '#D1FAE5', fg: '#065F46', label: '✓' };
    case 'red':   return { bg: '#FEE2E2', fg: '#991B1B', label: '!' };
    case 'amber': return { bg: '#FEF3C7', fg: '#92400E', label: '⚠' };
    default:      return { bg: '#F3F4F6', fg: '#6B7280', label: '○' };
  }
}

function fmt$(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function EstimateBuilderScreen({ route, navigation }) {
  const { t } = useTranslation('owner');
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const initialEstimateId = route?.params?.estimate_id || null;
  const initialProjectId = route?.params?.project_id || null;
  const seedDraft = route?.params?.draft || null; // from chat preview

  // Lifecycle / save state
  const [estimateId, setEstimateId] = useState(initialEstimateId);
  const estimateIdRef = useRef(initialEstimateId);
  useEffect(() => { estimateIdRef.current = estimateId; }, [estimateId]);

  const [estimateNumber, setEstimateNumber] = useState('');
  const [status, setStatus] = useState('draft');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saveState, setSaveState] = useState({ kind: 'idle' }); // 'idle' | 'saving' | 'saved' | 'error'
  const [sending, setSending] = useState(false);

  // Section accordion state
  const [expanded, setExpanded] = useState({ basics: true });

  // Section 1 — Basics
  const [clientName, setClientName] = useState(seedDraft?.client_name || '');
  const [clientEmail, setClientEmail] = useState(seedDraft?.client_email || '');
  const [clientPhone, setClientPhone] = useState(seedDraft?.client_phone || '');
  const [clientAddress, setClientAddress] = useState(seedDraft?.client_address || '');
  const [projectName, setProjectName] = useState(seedDraft?.project_name || '');
  const [projectId, setProjectId] = useState(initialProjectId);
  const [dateIssued, setDateIssued] = useState(todayIso());
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState(seedDraft?.notes || '');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectsList, setProjectsList] = useState([]);
  const [datePickerField, setDatePickerField] = useState(null); // 'issued' | 'valid' | null

  // Section 2 — Line items
  const [items, setItems] = useState(
    Array.isArray(seedDraft?.items) && seedDraft.items.length > 0
      ? seedDraft.items.map((it) => ({
          description: it.description || '',
          quantity: Number(it.quantity || 1),
          unit: it.unit || 'ea',
          pricePerUnit: Number(it.pricePerUnit || it.price || 0),
          total: Number(it.total || (it.quantity || 1) * (it.pricePerUnit || it.price || 0)),
        }))
      : [{ description: '', quantity: 1, unit: 'ea', pricePerUnit: 0, total: 0 }],
  );
  const [extractingFromPhoto, setExtractingFromPhoto] = useState(false);

  /**
   * Capture a blueprint / scope sketch / handwritten notes image and let
   * the AI extract line items into the estimate. Merges into the existing
   * items array (replaces the single empty placeholder if that's all
   * there is; otherwise appends).
   */
  const handleExtractFromPhoto = useCallback(async () => {
    Alert.alert(t('estimateBuilder.extractTitle'), t('estimateBuilder.extractBody'), [
      { text: t('estimateBuilder.takePhoto'), onPress: async () => {
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) await runExtraction(result.assets[0].uri);
      }},
      { text: t('estimateBuilder.chooseFromGallery'), onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) await runExtraction(result.assets[0].uri);
      }},
      { text: t('common:actions.cancel'), style: 'cancel' },
    ]);
  }, [items]);

  const runExtraction = async (uri) => {
    try {
      setExtractingFromPhoto(true);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const r = await analyzeBlueprintForEstimate(base64);
      if (!r || !Array.isArray(r.items) || r.items.length === 0) {
        Alert.alert(t('estimateBuilder.nothingExtractedTitle'), t('estimateBuilder.nothingExtractedBody'));
        return;
      }
      const extracted = r.items.map((it) => ({
        description: String(it.description || '').trim(),
        quantity: Number(it.quantity || 1),
        unit: it.unit || 'ea',
        pricePerUnit: Number(it.pricePerUnit || 0),
        total: Number(it.total || (Number(it.quantity || 1) * Number(it.pricePerUnit || 0))),
      })).filter((it) => it.description);
      // If existing array is just the empty placeholder, replace it; otherwise append
      const isJustPlaceholder = items.length === 1 && !items[0].description && !items[0].pricePerUnit;
      setItems(isJustPlaceholder ? extracted : [...items, ...extracted]);
      const noteSuffix = r.notes ? t('estimateBuilder.extractedNote', { note: r.notes }) : '';
      Alert.alert(t('estimateBuilder.extractedTitle'), t('estimateBuilder.extractedBody', { count: extracted.length, note: noteSuffix }));
    } catch (e) {
      Alert.alert(t('estimateBuilder.readPhotoFailedTitle'), t('estimateBuilder.readPhotoFailedBody'));
    } finally {
      setExtractingFromPhoto(false);
    }
  };

  // Section 3 — Pricing
  const [taxRate, setTaxRate] = useState(seedDraft?.tax_rate ? String(seedDraft.tax_rate) : '0');

  // Section 4 — Terms
  const [paymentTerms, setPaymentTerms] = useState(seedDraft?.payment_terms || 'Net 30');

  // Section 5 — Review & Send
  const [signatureRequired, setSignatureRequired] = useState(false);

  // ───── Computed totals ──────────────────────────────────────────
  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.total || 0), 0),
    [items],
  );
  const taxAmount = useMemo(
    () => subtotal * (Number(taxRate || 0) / 100),
    [subtotal, taxRate],
  );
  const total = subtotal + taxAmount;

  // ───── Load existing or create draft ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialEstimateId) {
          const est = await getEstimate(initialEstimateId);
          if (cancelled || !est) { setBootstrapping(false); return; }
          setEstimateNumber(est.estimate_number || '');
          setStatus(est.status || 'draft');
          setClientName(est.client_name || '');
          setClientEmail(est.client_email || '');
          setClientPhone(est.client_phone || '');
          setClientAddress(est.client_address || '');
          setProjectName(est.project_name || '');
          setProjectId(est.project_id || null);
          setDateIssued(est.created_at ? est.created_at.slice(0, 10) : todayIso());
          setValidUntil(est.valid_until || '');
          setNotes(est.notes || '');
          setItems(Array.isArray(est.items) && est.items.length > 0 ? est.items : items);
          setTaxRate(est.tax_rate != null ? String(est.tax_rate) : '0');
          setPaymentTerms(est.payment_terms || 'Net 30');
          setSignatureRequired(!!est.signature_required);
        }
        // Load projects for picker
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: projs } = await supabase
            .from('projects')
            .select('id, name, location, client_name')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (!cancelled) setProjectsList(projs || []);
        }
      } catch (e) {
        console.warn('[EstimateBuilder] bootstrap:', e.message);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialEstimateId]);

  // ───── Auto-save ────────────────────────────────────────────────
  const buildPayload = useCallback(() => ({
    client_name: clientName,
    client_email: clientEmail,
    client_phone: clientPhone,
    client_address: clientAddress,
    project_name: projectName,
    project_id: projectId,
    date_issued: dateIssued || null,
    valid_until: validUntil || null,
    notes,
    items,
    tax_rate: Number(taxRate) || 0,
    tax_amount: taxAmount,
    subtotal,
    total,
    payment_terms: paymentTerms,
    signature_required: signatureRequired,
    status: 'draft',
  }), [
    clientName, clientEmail, clientPhone, clientAddress,
    projectName, projectId, dateIssued, validUntil, notes, items,
    taxRate, taxAmount, subtotal, total, paymentTerms, signatureRequired,
  ]);

  const flushSave = useCallback(async () => {
    if (bootstrapping) return;
    if (status !== 'draft') return; // don't auto-save sent/accepted/etc.
    setSaveState({ kind: 'saving' });
    try {
      const payload = buildPayload();
      let saved;
      if (estimateIdRef.current) {
        saved = await updateEstimate({ id: estimateIdRef.current, ...payload });
      } else {
        saved = await saveEstimate(payload);
        if (saved?.id) {
          estimateIdRef.current = saved.id;
          setEstimateId(saved.id);
          setEstimateNumber(saved.estimate_number || '');
        }
      }
      setSaveState({ kind: 'saved', at: new Date() });
    } catch (e) {
      console.warn('[EstimateBuilder] save failed:', e.message);
      setSaveState({ kind: 'error', message: e.message });
    }
  }, [bootstrapping, status, buildPayload]);

  const flushSaveRef = useRef(flushSave);
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (bootstrapping) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushSaveRef.current?.(); }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bootstrapping,
    clientName, clientEmail, clientPhone, clientAddress,
    projectName, projectId, dateIssued, validUntil, notes,
    items, taxRate, paymentTerms, signatureRequired,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushSaveRef.current?.();
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSaveRef.current?.();
      sub?.remove?.();
    };
  }, []);

  // ───── Section toggle + chip status ─────────────────────────────
  const toggle = (key) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  const sectionChip = useCallback((key) => {
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
        return paymentTerms?.trim() ? chipFor('green') : chipFor('grey');
      case 'review':
        if (status === 'sent' || status === 'accepted' || status === 'rejected') return chipFor('green');
        if (clientName?.trim() && items.length > 0 && subtotal > 0) return chipFor('amber');
        return chipFor('grey');
      default: return chipFor('grey');
    }
  }, [clientName, items, subtotal, paymentTerms, status]);

  // ───── Send ──────────────────────────────────────────────────────
  const onSend = async () => {
    if (status !== 'draft') {
      Alert.alert(t('estimateBuilder.alreadySentTitle'), t('estimateBuilder.alreadySentBody', { status }));
      return;
    }
    if (!clientName?.trim()) { Alert.alert(t('estimateBuilder.addClientTitle')); setExpanded((s) => ({ ...s, basics: true })); return; }
    if (items.length === 0 || items.every((it) => !it.description?.trim())) {
      Alert.alert(t('estimateBuilder.addLineItemTitle')); setExpanded((s) => ({ ...s, lineItems: true })); return;
    }
    if (!estimateIdRef.current) { Alert.alert(t('estimateBuilder.savingTitle'), t('estimateBuilder.savingBody')); return; }

    setSending(true);
    try {
      // Make sure latest state is persisted
      await flushSave();
      // Send via existing portalOwner endpoint
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_URL}/api/portal-admin/estimates/${estimateIdRef.current}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ require_signature: signatureRequired }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Fallback: just flip the status flag if the portal send isn't wired
        await updateEstimateStatus(estimateIdRef.current, 'sent');
        setStatus('sent');
        Alert.alert(
          t('estimateBuilder.markedSentTitle'),
          t('estimateBuilder.markedSentBody'),
          [{ text: t('estimateBuilder.ok'), onPress: () => navigation.goBack() }],
        );
        return;
      }
      setStatus('sent');
      Alert.alert(
        t('estimateBuilder.sentTitle'),
        t('estimateBuilder.sentBody', { recipient: clientEmail || t('estimateBuilder.theClient') }),
        [{ text: t('estimateBuilder.ok'), onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert(t('estimateBuilder.couldNotSendTitle'), e.message || t('estimateBuilder.tryAgain'));
    } finally {
      setSending(false);
    }
  };

  // ───── Render ────────────────────────────────────────────────────
  if (bootstrapping) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7} testID="estimateBuilder.backButton" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1} testID="estimateBuilder.headerTitle">
            {estimateNumber || t('estimateBuilder.newEstimate')}
          </Text>
          <SaveIndicator state={saveState} status={status} Colors={Colors} />
        </View>
        <View style={[styles.statusPill, { backgroundColor: pillForStatus(status).bg }]}>
          <Text style={[styles.statusPillText, { color: pillForStatus(status).fg }]} testID="estimateBuilder.statusPill">
            {status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Section 1 — Basics */}
        <Section
          sectionKey="basics" title={t('estimateBuilder.sectionBasics')} icon="document-text-outline"
          expanded={!!expanded.basics} chip={sectionChip('basics')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label={t('estimateBuilder.clientName')} required Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientName}
              onChangeText={setClientName}
              placeholder={t('estimateBuilder.clientNamePlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              testID="estimateBuilder.clientNameInput"
              accessibilityLabel="Client name"
            />
          </Field>
          <Field label={t('estimateBuilder.clientEmail')} Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientEmail}
              onChangeText={setClientEmail}
              placeholder={t('estimateBuilder.clientEmailPlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="estimateBuilder.clientEmailInput"
              accessibilityLabel="Client email"
            />
          </Field>
          <Field label={t('estimateBuilder.clientPhone')} Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientPhone}
              onChangeText={setClientPhone}
              placeholder="(555) 555-5555"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              keyboardType="phone-pad"
              testID="estimateBuilder.clientPhoneInput"
              accessibilityLabel="Client phone"
            />
          </Field>
          <Field label={t('estimateBuilder.siteAddress')} Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder={t('estimateBuilder.siteAddressPlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              testID="estimateBuilder.clientAddressInput"
              accessibilityLabel="Site address"
            />
          </Field>
          <Field label={t('estimateBuilder.projectName')} Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={projectName}
              onChangeText={setProjectName}
              placeholder={t('estimateBuilder.projectNamePlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              testID="estimateBuilder.projectNameInput"
              accessibilityLabel="Project name"
            />
          </Field>
          <Field label={t('estimateBuilder.linkedProject')} Colors={Colors} styles={styles}>
            <TouchableOpacity style={styles.input} onPress={() => setShowProjectPicker(true)} activeOpacity={0.7} testID="estimateBuilder.linkedProjectButton" accessibilityLabel="Link a project">
              <Text style={[styles.inputText, !projectId && styles.placeholderText]} testID="estimateBuilder.linkedProjectValue">
                {projectId
                  ? (projectsList.find((p) => p.id === projectId)?.name || t('estimateBuilder.linked'))
                  : t('estimateBuilder.tapToLinkProject')}
              </Text>
            </TouchableOpacity>
          </Field>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label={t('estimateBuilder.dateIssued')} Colors={Colors} styles={styles} style={{ flex: 1 }}>
              <TouchableOpacity style={styles.input} onPress={() => setDatePickerField('issued')} activeOpacity={0.7} testID="estimateBuilder.dateIssuedButton" accessibilityLabel="Date issued">
                <Text style={styles.inputText} testID="estimateBuilder.dateIssuedValue">{dateIssued || todayIso()}</Text>
              </TouchableOpacity>
            </Field>
            <Field label={t('estimateBuilder.validUntil')} Colors={Colors} styles={styles} style={{ flex: 1 }}>
              <TouchableOpacity style={styles.input} onPress={() => setDatePickerField('valid')} activeOpacity={0.7} testID="estimateBuilder.validUntilButton" accessibilityLabel="Valid until">
                <Text style={[styles.inputText, !validUntil && styles.placeholderText]} testID="estimateBuilder.validUntilValue">
                  {validUntil || t('estimateBuilder.tapToSet')}
                </Text>
              </TouchableOpacity>
            </Field>
          </View>
          <Field label={t('estimateBuilder.internalNotes')} Colors={Colors} styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('estimateBuilder.internalNotesPlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              multiline
              testID="estimateBuilder.notesInput"
              accessibilityLabel="Internal notes"
            />
          </Field>
        </Section>

        {/* Section 2 — Line items */}
        <Section
          sectionKey="lineItems" title={t('estimateBuilder.sectionLineItems')} icon="list-outline"
          expanded={!!expanded.lineItems} chip={sectionChip('lineItems')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          {/* Extract-from-photo button */}
          <TouchableOpacity
            onPress={handleExtractFromPhoto}
            disabled={extractingFromPhoto}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 12, paddingHorizontal: 14,
              borderRadius: 8, borderWidth: 1, borderStyle: 'dashed',
              borderColor: extractingFromPhoto ? '#94A3B8' : '#1E40AF',
              backgroundColor: extractingFromPhoto ? '#F1F5F9' : '#EFF6FF',
              marginBottom: 12,
            }}
            activeOpacity={0.7}
            testID="estimateBuilder.extractFromPhotoButton"
            accessibilityLabel="Extract line items from photo"
          >
            {extractingFromPhoto ? (
              <ActivityIndicator size="small" color="#1E40AF" />
            ) : (
              <Ionicons name="camera-outline" size={18} color="#1E40AF" />
            )}
            <Text style={{ color: '#1E40AF', fontSize: 13, fontWeight: '600' }}>
              {extractingFromPhoto ? t('estimateBuilder.readingPhoto') : t('estimateBuilder.snapExtract')}
            </Text>
          </TouchableOpacity>
          <LineItemEditor items={items} onChange={setItems} Colors={Colors} />
        </Section>

        {/* Section 3 — Pricing */}
        <Section
          sectionKey="pricing" title={t('estimateBuilder.sectionPricing')} icon="calculator-outline"
          expanded={!!expanded.pricing} chip={sectionChip('pricing')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label={t('estimateBuilder.taxRate')} Colors={Colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={taxRate}
              onChangeText={setTaxRate}
              placeholder="0"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              keyboardType="decimal-pad"
              testID="estimateBuilder.taxRateInput"
              accessibilityLabel="Tax rate"
            />
          </Field>
          <View style={styles.summaryCard}>
            <SummaryRow label={t('estimateBuilder.subtotal')} value={fmt$(subtotal)} valueTestID="estimateBuilder.subtotal" Colors={Colors} styles={styles} />
            <SummaryRow label={t('estimateBuilder.taxLabel', { rate: Number(taxRate || 0).toFixed(2) })} value={fmt$(taxAmount)} valueTestID="estimateBuilder.taxAmount" Colors={Colors} styles={styles} />
            <View style={styles.summaryDivider} />
            <SummaryRow label={t('estimateBuilder.total')} value={fmt$(total)} valueTestID="estimateBuilder.total" bold Colors={Colors} styles={styles} />
          </View>
        </Section>

        {/* Section 4 — Terms */}
        <Section
          sectionKey="terms" title={t('estimateBuilder.sectionTerms')} icon="reader-outline"
          expanded={!!expanded.terms} chip={sectionChip('terms')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <Field label={t('estimateBuilder.paymentTerms')} Colors={Colors} styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={paymentTerms}
              onChangeText={setPaymentTerms}
              placeholder={t('estimateBuilder.paymentTermsPlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              multiline
              testID="estimateBuilder.paymentTermsInput"
              accessibilityLabel="Payment terms"
            />
          </Field>
        </Section>

        {/* Section 5 — Review & Send */}
        <Section
          sectionKey="review" title={t('estimateBuilder.sectionReview')} icon="paper-plane-outline"
          expanded={!!expanded.review} chip={sectionChip('review')} onToggle={toggle}
          Colors={Colors} styles={styles}
        >
          <View style={styles.reviewCard}>
            <Text style={styles.reviewLabel}>{t('estimateBuilder.goingTo')}</Text>
            <Text style={styles.reviewValue} testID="estimateBuilder.reviewClientName">{clientName || '—'}</Text>
            {clientEmail ? <Text style={styles.reviewSub} testID="estimateBuilder.reviewClientEmail">{clientEmail}</Text> : null}
            <View style={styles.reviewDivider} />
            <Text style={styles.reviewLabel}>{t('estimateBuilder.total')}</Text>
            <Text style={styles.reviewAmount} testID="estimateBuilder.reviewTotal">{fmt$(total)}</Text>
            <Text style={styles.reviewSub} testID="estimateBuilder.reviewItemCount">{t('estimateBuilder.lineItemCount', { count: items.length })}</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('estimateBuilder.requireSignature')}</Text>
              <Text style={styles.toggleSub}>{t('estimateBuilder.requireSignatureSub')}</Text>
            </View>
            <Switch
              value={signatureRequired}
              onValueChange={setSignatureRequired}
              trackColor={{ false: '#D1D5DB', true: Colors.primaryBlue || '#3B82F6' }}
              thumbColor="#fff"
              testID="estimateBuilder.signatureRequiredSwitch"
              accessibilityLabel="Require e-signature"
            />
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, (sending || status !== 'draft') && { opacity: 0.5 }]}
            onPress={onSend}
            disabled={sending || status !== 'draft'}
            activeOpacity={0.85}
            testID="estimateBuilder.sendButton"
            accessibilityLabel="Send to client"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            )}
            <Text style={styles.sendBtnText}>{sending ? t('estimateBuilder.sending') : t('estimateBuilder.sendToClient')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (saveState.kind === 'saving') && { opacity: 0.5 }]}
            onPress={async () => {
              await flushSaveRef.current();
              navigation.goBack();
            }}
            disabled={saveState.kind === 'saving'}
            activeOpacity={0.85}
            testID="estimateBuilder.saveDraftButton"
            accessibilityLabel="Save draft"
          >
            <Ionicons name="checkmark" size={18} color={Colors.primaryText} />
            <Text style={styles.saveBtnText}>{t('estimateBuilder.saveDraft')}</Text>
          </TouchableOpacity>
          <Text style={{ marginTop: 10, fontSize: 12, color: Colors.secondaryText, textAlign: 'center' }}>
            {t('estimateBuilder.previewHint')}
          </Text>
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Project picker modal */}
      <Modal visible={showProjectPicker} animationType="slide" transparent onRequestClose={() => setShowProjectPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('estimateBuilder.pickProject')}</Text>
              <TouchableOpacity onPress={() => setShowProjectPicker(false)} testID="estimateBuilder.projectPickerCloseButton" accessibilityLabel="Close project picker">
                <Ionicons name="close" size={24} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ id: null, name: t('estimateBuilder.noProjectUnlinked'), location: '' }, ...projectsList]}
              keyExtractor={(p) => p.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => { setProjectId(item.id); setProjectName((prev) => prev || item.name || ''); setShowProjectPicker(false); }}
                  activeOpacity={0.7}
                  testID={`estimateBuilder.projectRow.${item.id || 'none'}`}
                  accessibilityLabel={`Project ${item.name}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowTitle}>{item.name}</Text>
                    {item.location ? <Text style={styles.modalRowSub}>{item.location}</Text> : null}
                  </View>
                  {projectId === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.primaryBlue} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Date picker */}
      {datePickerField && (
        <Modal visible={!!datePickerField} transparent animationType="fade" onRequestClose={() => setDatePickerField(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.datePickerSheet, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {datePickerField === 'issued' ? t('estimateBuilder.dateIssued') : t('estimateBuilder.validUntil')}
                </Text>
                <TouchableOpacity onPress={() => setDatePickerField(null)} testID="estimateBuilder.datePickerCloseButton" accessibilityLabel="Close date picker">
                  <Ionicons name="close" size={24} color={Colors.primaryText} />
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={(() => {
                  const v = datePickerField === 'issued' ? dateIssued : validUntil;
                  return v ? new Date(v + 'T12:00:00') : new Date();
                })()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                themeVariant="light"
                textColor={Colors.primaryText}
                accentColor={Colors.primaryBlue || '#3B82F6'}
                style={Platform.OS === 'ios' ? { alignSelf: 'stretch' } : undefined}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === 'android') setDatePickerField(null);
                  if (selectedDate) {
                    const iso = selectedDate.toISOString().split('T')[0];
                    if (datePickerField === 'issued') setDateIssued(iso);
                    else setValidUntil(iso);
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity onPress={() => setDatePickerField(null)} style={styles.datePickerDone} testID="estimateBuilder.datePickerDoneButton" accessibilityLabel="Done">
                  <Text style={[styles.datePickerDoneText, { color: Colors.primaryBlue }]}>{t('common:actions.done')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ───── Components ─────────────────────────────────────────────────
function SaveIndicator({ state, status, Colors }) {
  const { t } = useTranslation('owner');
  if (status === 'sent' || status === 'accepted' || status === 'rejected' || status === 'expired') {
    return <Text style={{ fontSize: 12, color: Colors.secondaryText }}>{t('estimateBuilder.readOnly')}</Text>;
  }
  if (state.kind === 'saving') return <Text style={{ fontSize: 12, color: Colors.secondaryText }}>{t('estimateBuilder.saving')}</Text>;
  if (state.kind === 'saved')  return <Text style={{ fontSize: 12, color: '#10B981' }}>{t('estimateBuilder.saved')}</Text>;
  if (state.kind === 'error')  return <Text style={{ fontSize: 12, color: '#DC2626' }}>{t('estimateBuilder.saveFailed')}</Text>;
  return <Text style={{ fontSize: 12, color: Colors.secondaryText }}>{t('estimateBuilder.draft')}</Text>;
}

function Section({ sectionKey, title, icon, expanded, chip, onToggle, children, Colors, styles }) {
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={[styles.sectionHeader, expanded && styles.sectionHeaderExpanded]}
        onPress={() => onToggle(sectionKey)}
        activeOpacity={0.7}
        testID={`estimateBuilder.sectionHeader.${sectionKey}`}
        accessibilityLabel={title}
      >
        <Ionicons name={icon} size={18} color={Colors.primaryText} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
      </TouchableOpacity>
      {expanded && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function Field({ label, required, children, Colors, styles, style }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={styles.label}>
        {label}{required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value, valueTestID, bold, Colors, styles }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', color: Colors.primaryText, fontSize: 15 }]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, bold && { fontWeight: '700', fontSize: 17, color: Colors.primaryText }]} testID={valueTestID}>
        {value}
      </Text>
    </View>
  );
}

function pillForStatus(status) {
  switch (status) {
    case 'draft':    return { bg: '#F3F4F6', fg: '#6B7280' };
    case 'sent':     return { bg: '#DBEAFE', fg: '#1E40AF' };
    case 'viewed':   return { bg: '#FEF3C7', fg: '#92400E' };
    case 'accepted': return { bg: '#D1FAE5', fg: '#065F46' };
    case 'rejected': return { bg: '#FEE2E2', fg: '#991B1B' };
    case 'expired':  return { bg: '#F3F4F6', fg: '#6B7280' };
    default:         return { bg: '#F3F4F6', fg: '#6B7280' };
  }
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primaryText },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  scroll: { padding: 16, paddingBottom: 60 },

  section: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  sectionHeaderExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.primaryText },
  chip: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  sectionBody: { padding: 14 },

  label: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  miniLabel: { fontSize: 10, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
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

  lineItemCard: {
    backgroundColor: Colors.background,
    borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  lineItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineItemIndex: { fontSize: 12, fontWeight: '700', color: Colors.secondaryText },
  lineItemTotalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  lineItemTotal: { fontSize: 16, fontWeight: '700', color: Colors.primaryText },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.background,
  },
  addItemBtnText: { fontSize: 13, fontWeight: '600' },

  summaryCard: {
    backgroundColor: Colors.background,
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  summaryLabel: { fontSize: 13, color: Colors.secondaryText },
  summaryValue: { fontSize: 14, color: Colors.primaryText, fontWeight: '600' },
  summaryDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },

  reviewCard: {
    backgroundColor: Colors.background,
    borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 14,
  },
  reviewLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  reviewValue: { fontSize: 16, fontWeight: '600', color: Colors.primaryText, marginTop: 4 },
  reviewSub: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  reviewAmount: { fontSize: 26, fontWeight: '700', color: Colors.primaryText, marginTop: 4 },
  reviewDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  toggleSub: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0F172A',
    paddingVertical: 16, borderRadius: 12,
  },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.background,
    paddingVertical: 14, borderRadius: 12, marginTop: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  saveBtnText: { color: Colors.primaryText, fontWeight: '700', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.primaryText },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  modalRowTitle: { fontSize: 15, fontWeight: '600', color: Colors.primaryText },
  modalRowSub: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  datePickerSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  datePickerDone: {
    paddingVertical: 14, alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  datePickerDoneText: { fontWeight: '700', fontSize: 15 },
});
