// ChangeOrderPreview — chat preview card for change orders.
// Mirrors EstimatePreview / InvoicePreview but with the CO-specific bits:
//  - schedule impact stepper
//  - "New contract: $X (was $Y)" callout
//  - signature-required toggle
//
// Lifecycle in chat:
//   agent emits visualElement {type: 'change-order-preview', data}
//   → user reviews / edits inline
//   → tap Save Draft → onAction('save-change-order', data)
//   → tap Send → onAction('send-change-order', { id, ...data })
// ChatScreen handles those actions.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

const C = {
  primary: '#1E40AF', primaryLight: '#DBEAFE',
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2',
  text: '#0F172A', textSec: '#475569', textMuted: '#94A3B8',
  surface: '#FFFFFF', bg: '#F8FAFC', border: '#E2E8F0',
};

const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function computeTotals(items, taxRate) {
  const subtotal = (items || []).reduce(
    (sum, li) => sum + (Number(li.quantity || 0) * Number(li.unit_price || 0)), 0);
  const tax = subtotal * Number(taxRate || 0);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

export default function ChangeOrderPreview({ data, onAction }) {
  const { t } = useTranslation('chat');
  const initialItems = (data?.lineItems || data?.line_items || []).map((li) => ({
    description: li.description || '',
    quantity: li.quantity != null ? String(li.quantity) : '1',
    unit: li.unit || '',
    unit_price: li.unit_price != null ? String(li.unit_price) : (li.unitPrice != null ? String(li.unitPrice) : '0'),
    category: li.category || null,
  }));

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data?.title || '');
  const [description, setDescription] = useState(data?.description || '');
  const [items, setItems] = useState(initialItems);
  const [scheduleImpactDays, setScheduleImpactDays] = useState(Number(data?.scheduleImpactDays ?? data?.schedule_impact_days ?? 0));
  const [taxRate, setTaxRate] = useState(Number(data?.taxRate ?? data?.tax_rate ?? 0));
  const [signatureRequired, setSignatureRequired] = useState(!!(data?.signatureRequired ?? data?.signature_required ?? false));
  // Billing strategy: invoice_now (default) | next_draw | project_end
  const [billingStrategy, setBillingStrategy] = useState(
    data?.billingStrategy ?? data?.billing_strategy ?? 'invoice_now'
  );

  // Phase placement: where this CO snaps into the project timeline.
  // mode: 'inside_phase' | 'before_phase' | 'after_phase' | null
  const [phasePlacement, setPhasePlacement] = useState(
    data?.phasePlacement ?? data?.phase_placement ?? null
  );
  const [targetPhaseId, setTargetPhaseId] = useState(
    data?.targetPhaseId ?? data?.target_phase_id ?? null
  );
  const [newPhaseName, setNewPhaseName] = useState(
    data?.newPhaseName ?? data?.new_phase_name ?? ''
  );
  const [projectPhases, setProjectPhases] = useState(
    Array.isArray(data?.projectPhases) ? data.projectPhases : []
  );

  const [savedId, setSavedId] = useState(data?.id || null);
  const [status, setStatus] = useState(data?.status || 'draft');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const projectId = data?.project_id;
  const projectName = data?.projectName || data?.project_name || '';

  // Fetch phases when missing (agent typically populates them, but be resilient)
  useEffect(() => {
    if (!projectId || projectPhases.length > 0) return;
    let alive = true;
    (async () => {
      const { data: rows, error } = await supabase
        .from('project_phases')
        .select('id, name, order_index, status')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
      if (alive && !error && Array.isArray(rows)) setProjectPhases(rows);
    })();
    return () => { alive = false; };
  }, [projectId]);
  const currentContract = Number(data?.currentContractAmount ?? data?.contract_amount ?? 0);
  const currentEnd = data?.currentEndDate ?? data?.end_date ?? null;

  const { subtotal, tax, total } = computeTotals(items, taxRate);
  const newContract = currentContract + total;
  const newEnd = (currentEnd && scheduleImpactDays)
    ? new Date(new Date(currentEnd).getTime() + scheduleImpactDays * 86400000)
    : null;

  // ---------- Edit handlers ----------
  const updateItem = (idx, field, value) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    setItems(next);
  };

  const addItem = () => {
    setItems([...items, { description: '', quantity: '1', unit: '', unit_price: '0', category: null }]);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // ---------- Persistence handlers ----------
  const buildPayload = () => ({
    id: savedId,
    project_id: projectId,
    title: title.trim(),
    description: description.trim() || null,
    scheduleImpactDays,
    taxRate,
    signatureRequired,
    billingStrategy,
    phasePlacement: phasePlacement || null,
    targetPhaseId: targetPhaseId || null,
    newPhaseName: newPhaseName?.trim() || null,
    lineItems: items.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity || 0),
      unit: li.unit || null,
      unit_price: Number(li.unit_price || 0),
      category: li.category || null,
    })),
    subtotal,
    totalAmount: total,
  });

  const validate = () => {
    if (!projectId) {
      Alert.alert(t('changeOrderPreview.alertMissingProjectTitle'), t('changeOrderPreview.alertMissingProjectBody'));
      return false;
    }
    if (!title.trim()) {
      Alert.alert(t('changeOrderPreview.alertMissingTitleTitle'), t('changeOrderPreview.alertMissingTitleBody'));
      return false;
    }
    if (items.length === 0 || !items.some((li) => li.description.trim() && Number(li.unit_price) > 0)) {
      Alert.alert(t('changeOrderPreview.alertAddLineItemsTitle'), t('changeOrderPreview.alertAddLineItemsBody'));
      return false;
    }
    // Phase placement is required when there's real work to schedule
    const needsPlacement = projectPhases.length > 0 && (Number(scheduleImpactDays || 0) !== 0 || items.length > 0);
    if (needsPlacement && !phasePlacement) {
      Alert.alert(
        t('changeOrderPreview.alertPlacementTitle'),
        t('changeOrderPreview.alertPlacementBody')
      );
      return false;
    }
    if (phasePlacement && !targetPhaseId && projectPhases.length > 0) {
      Alert.alert(t('changeOrderPreview.alertPickPhaseTitle'), t('changeOrderPreview.alertPickPhaseBody'));
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      setIsEditing(false);
      const result = await onAction?.({ type: 'save-change-order', data: buildPayload() });
      if (result?.id) {
        setSavedId(result.id);
        setStatus(result.status || 'draft');
      }
    } catch (e) {
      Alert.alert(t('changeOrderPreview.alertSaveFailedTitle'), e.message || t('changeOrderPreview.alertSaveFailedBody'));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!validate()) return;
    try {
      setSending(true);
      // Always save first — flushes ALL edits (line items, title, description,
      // schedule impact, tax, signature, placement, strategy) onto the row before
      // the status flip, so the client never receives stale values.
      const saved = await onAction?.({ type: 'save-change-order', data: buildPayload() });
      if (!saved?.id) throw new Error(t('changeOrderPreview.errorSaveBeforeSend'));
      const id = saved.id;
      setSavedId(id);
      // Pass the latest placement/strategy so any user edits after the initial save
      // make it onto the row before the status flip.
      const result = await onAction?.({
        type: 'send-change-order',
        data: {
          id,
          billing_strategy: billingStrategy,
          phase_placement: phasePlacement || null,
          target_phase_id: targetPhaseId || null,
          new_phase_name: newPhaseName?.trim() || null,
        },
      });
      if (result?.sent || result?.status === 'pending_client') {
        setStatus('pending_client');
        Alert.alert(
          t('changeOrderPreview.alertSentTitle'),
          result?.email
            ? t('changeOrderPreview.alertSentBodyWithEmail', { email: result.email })
            : t('changeOrderPreview.alertSentBody')
        );
      } else if (result?.error) {
        Alert.alert(t('changeOrderPreview.alertSendIssueTitle'), result.error);
      }
    } catch (e) {
      Alert.alert(t('changeOrderPreview.alertSendFailedTitle'), e.message || t('changeOrderPreview.alertSendFailedBody'));
    } finally {
      setSending(false);
    }
  };

  const isSent = ['pending_client', 'viewed', 'approved', 'rejected', 'void'].includes(status);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{t('changeOrderPreview.kicker')}</Text>
          {isEditing ? (
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder={t('changeOrderPreview.titlePlaceholder')}
              placeholderTextColor={C.textMuted}
            />
          ) : (
            <Text style={styles.title} numberOfLines={2}>{title || t('changeOrderPreview.untitled')}</Text>
          )}
          {projectName ? <Text style={styles.subtitle}>{projectName}</Text> : null}
        </View>
        <View style={[styles.statusPill, status === 'draft' ? styles.statusDraft : styles.statusSent]}>
          <Text style={[styles.statusText, status === 'draft' ? styles.statusTextDraft : styles.statusTextSent]}>
            {status === 'draft' ? t('changeOrderPreview.statusDraft') : status.toUpperCase().replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Description */}
      {isEditing ? (
        <TextInput
          style={styles.descriptionInput}
          value={description}
          onChangeText={setDescription}
          placeholder={t('changeOrderPreview.descriptionPlaceholder')}
          placeholderTextColor={C.textMuted}
          multiline
        />
      ) : description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}

      {/* Line items */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{t('changeOrderPreview.lineItems')}</Text>
          {isEditing && (
            <TouchableOpacity onPress={addItem} style={styles.addLinkBtn}>
              <Ionicons name="add" size={14} color={C.primary} />
              <Text style={styles.addLinkText}>{t('common:buttons.add')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {items.map((li, idx) => (
          <View key={idx} style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}>
            {isEditing ? (
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={[styles.itemInput, { flex: 1 }]}
                    value={li.description}
                    onChangeText={(v) => updateItem(idx, 'description', v)}
                    placeholder={t('changeOrderPreview.itemDescriptionPlaceholder')}
                    placeholderTextColor={C.textMuted}
                  />
                  <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.itemMetaRow}>
                  <TextInput
                    style={[styles.itemInputSmall, { width: 60 }]}
                    value={li.quantity}
                    onChangeText={(v) => updateItem(idx, 'quantity', v.replace(/[^\d.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder={t('changeOrderPreview.qtyPlaceholder')}
                    placeholderTextColor={C.textMuted}
                  />
                  <TextInput
                    style={[styles.itemInputSmall, { width: 70 }]}
                    value={li.unit}
                    onChangeText={(v) => updateItem(idx, 'unit', v)}
                    placeholder={t('changeOrderPreview.unitPlaceholder')}
                    placeholderTextColor={C.textMuted}
                  />
                  <Text style={styles.times}>×</Text>
                  <TextInput
                    style={[styles.itemInputSmall, { width: 90 }]}
                    value={li.unit_price}
                    onChangeText={(v) => updateItem(idx, 'unit_price', v.replace(/[^\d.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                  />
                  <Text style={styles.itemAmount}>
                    {fmt$(Number(li.quantity || 0) * Number(li.unit_price || 0))}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemDesc}>{li.description || '—'}</Text>
                  <Text style={styles.itemMeta}>
                    {li.quantity} {li.unit || ''} × {fmt$(li.unit_price)}
                  </Text>
                </View>
                <Text style={styles.itemAmount}>
                  {fmt$(Number(li.quantity || 0) * Number(li.unit_price || 0))}
                </Text>
              </>
            )}
          </View>
        ))}
        {items.length === 0 && (
          <Text style={styles.emptyHint}>{t('changeOrderPreview.noLineItems')}</Text>
        )}
      </View>

      {/* Schedule impact */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('changeOrderPreview.scheduleImpact')}</Text>
        <View style={styles.stepperRow}>
          {isEditing ? (
            <>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setScheduleImpactDays(scheduleImpactDays - 1)}>
                <Ionicons name="remove" size={18} color={C.text} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>
                {t('changeOrderPreview.daysImpact', {
                  signed: `${scheduleImpactDays > 0 ? '+' : ''}${scheduleImpactDays}`,
                  count: Math.abs(scheduleImpactDays),
                })}
              </Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setScheduleImpactDays(scheduleImpactDays + 1)}>
                <Ionicons name="add" size={18} color={C.text} />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.stepperValue}>
              {scheduleImpactDays === 0
                ? t('changeOrderPreview.noScheduleChange')
                : t('changeOrderPreview.daysImpact', {
                    signed: `${scheduleImpactDays > 0 ? '+' : ''}${scheduleImpactDays}`,
                    count: Math.abs(scheduleImpactDays),
                  })}
            </Text>
          )}
        </View>
      </View>

      {/* Tax rate (compact) */}
      {(isEditing || taxRate > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('changeOrderPreview.taxRate')}</Text>
          {isEditing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                style={[styles.itemInputSmall, { width: 80 }]}
                value={String((taxRate * 100).toFixed(2))}
                onChangeText={(v) => setTaxRate((parseFloat(v) || 0) / 100)}
                keyboardType="decimal-pad"
              />
              <Text style={{ fontSize: 14, color: C.textSec, marginLeft: 6 }}>%</Text>
            </View>
          ) : (
            <Text style={styles.subtotalValue}>{(taxRate * 100).toFixed(2)}%</Text>
          )}
        </View>
      )}

      {/* Totals */}
      <View style={styles.totalsBlock}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>{t('changeOrderPreview.subtotal')}</Text>
          <Text style={styles.totalsValue}>{fmt$(subtotal)}</Text>
        </View>
        {tax > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{t('changeOrderPreview.tax')}</Text>
            <Text style={styles.totalsValue}>{fmt$(tax)}</Text>
          </View>
        )}
        <View style={[styles.totalsRow, styles.totalsRowBig]}>
          <Text style={styles.totalsBigLabel}>{t('changeOrderPreview.total')}</Text>
          <Text style={styles.totalsBigValue}>{fmt$(total)}</Text>
        </View>
      </View>

      {/* Contract/end-date callout */}
      {currentContract > 0 && (
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>{t('changeOrderPreview.afterApproval')}</Text>
          <Text style={styles.calloutLine}>
            {t('changeOrderPreview.newContractLabel')} <Text style={styles.calloutBold}>{fmt$(newContract)}</Text>
            {currentContract > 0 ? t('changeOrderPreview.was', { value: fmt$(currentContract) }) : ''}
          </Text>
          {newEnd && currentEnd && (
            <Text style={styles.calloutLine}>
              {t('changeOrderPreview.newEndDateLabel')} <Text style={styles.calloutBold}>{fmtDate(newEnd)}</Text>
              {t('changeOrderPreview.was', { value: fmtDate(currentEnd) })}
            </Text>
          )}
        </View>
      )}

      {/* Signature toggle */}
      {!isSent && (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('changeOrderPreview.requireSignature')}</Text>
            <Text style={styles.toggleHint}>
              {t('changeOrderPreview.requireSignatureHint')}
            </Text>
          </View>
          <Switch
            value={signatureRequired}
            onValueChange={setSignatureRequired}
            trackColor={{ false: C.border, true: C.primary }}
            disabled={isSent}
          />
        </View>
      )}

      {/* Phase placement picker — required when project has phases */}
      {!isSent && projectPhases.length > 0 && (
        <View style={styles.strategyBlock}>
          <Text style={styles.strategyLabel}>{t('changeOrderPreview.placementTitle')}</Text>
          {[
            { key: 'inside_phase', label: t('changeOrderPreview.placementInsideLabel'),
              hint: t('changeOrderPreview.placementInsideHint') },
            { key: 'after_phase',  label: t('changeOrderPreview.placementAfterLabel'),
              hint: t('changeOrderPreview.placementAfterHint') },
            { key: 'before_phase', label: t('changeOrderPreview.placementBeforeLabel'),
              hint: t('changeOrderPreview.placementBeforeHint') },
          ].map((opt) => {
            const selected = phasePlacement === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.strategyRow, selected && styles.strategyRowSelected]}
                onPress={() => setPhasePlacement(opt.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.strategyOptLabel, selected && { color: C.primary }]}>{opt.label}</Text>
                  <Text style={styles.strategyOptHint}>{opt.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {phasePlacement && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.strategyOptHint}>
                {phasePlacement === 'inside_phase' ? t('changeOrderPreview.mergeInto') :
                 phasePlacement === 'after_phase'  ? t('changeOrderPreview.afterWhichPhase') :
                                                    t('changeOrderPreview.beforeWhichPhase')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 6 }}>
                {projectPhases.map((p) => {
                  const sel = targetPhaseId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setTargetPhaseId(p.id)}
                      activeOpacity={0.7}
                      style={{
                        paddingVertical: 6, paddingHorizontal: 10,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: sel ? C.primary : C.border,
                        backgroundColor: sel ? C.primaryLight : '#fff',
                      }}
                    >
                      <Text style={{ fontSize: 12, color: sel ? C.primary : C.text, fontWeight: sel ? '600' : '500' }}>
                        {p.order_index != null ? `${p.order_index}. ` : ''}{p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {(phasePlacement === 'before_phase' || phasePlacement === 'after_phase') && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.strategyOptHint}>{t('changeOrderPreview.newPhaseNameLabel')}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1, borderColor: C.border, borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 8, marginTop: 4,
                      fontSize: 13, color: C.text, backgroundColor: '#fff',
                    }}
                    value={newPhaseName}
                    onChangeText={setNewPhaseName}
                    placeholder={title || t('changeOrderPreview.newPhaseNamePlaceholder')}
                    placeholderTextColor={C.textMuted}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Billing strategy picker — only on draft, only when project has draws */}
      {!isSent && (
        <View style={styles.strategyBlock}>
          <Text style={styles.strategyLabel}>{t('changeOrderPreview.billingTitle')}</Text>
          {[
            { key: 'invoice_now', label: t('changeOrderPreview.billingNowLabel'),
              hint: t('changeOrderPreview.billingNowHint') },
            { key: 'next_draw',  label: t('changeOrderPreview.billingNextDrawLabel'),
              hint: t('changeOrderPreview.billingNextDrawHint') },
            { key: 'project_end',label: t('changeOrderPreview.billingProjectEndLabel'),
              hint: t('changeOrderPreview.billingProjectEndHint') },
          ].map((opt) => {
            const selected = billingStrategy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.strategyRow, selected && styles.strategyRowSelected]}
                onPress={() => setBillingStrategy(opt.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.strategyOptLabel, selected && { color: C.primary }]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.strategyOptHint}>{opt.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {!isSent && !isEditing && (
          <>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setIsEditing(true)}>
              <Ionicons name="create-outline" size={16} color={C.text} />
              <Text style={styles.btnGhostText}>{t('common:buttons.edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => onAction?.({ type: 'configure-change-order-details', data: { ...data, id: data?.id || data?.coId } })}
            >
              <Ionicons name="options-outline" size={16} color={C.text} />
              <Text style={styles.btnGhostText}>{t('changeOrderPreview.configure')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={handleSaveDraft} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={C.text} />
                : <Text style={styles.btnSecondaryText}>{savedId ? t('changeOrderPreview.updateDraft') : t('changeOrderPreview.saveDraft')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSend} disabled={sending}>
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="send" size={14} color="#fff" />
                    <Text style={styles.btnPrimaryText}>{t('changeOrderPreview.send')}</Text>
                  </>}
            </TouchableOpacity>
          </>
        )}
        {!isSent && isEditing && (
          <>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setIsEditing(false)}>
              <Text style={styles.btnGhostText}>{t('common:buttons.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveDraft} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.btnPrimaryText}>{t('common:buttons.done')}</Text>}
            </TouchableOpacity>
          </>
        )}
        {isSent && (
          <Text style={styles.sentNote}>
            {status === 'approved' ? t('changeOrderPreview.sentApproved') :
             status === 'rejected' ? t('changeOrderPreview.sentRejected') :
             status === 'void' ? t('changeOrderPreview.sentVoid') :
             t('changeOrderPreview.sentAwaiting')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  kicker: { fontSize: 11, fontWeight: '700', color: C.amberDark, letterSpacing: 0.6 },
  title: { fontSize: 19, fontWeight: '700', color: C.text, marginTop: 2 },
  titleInput: { fontSize: 18, fontWeight: '700', color: C.text, padding: 0, marginTop: 2 },
  subtitle: { fontSize: 13, color: C.textSec, marginTop: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusDraft: { backgroundColor: C.bg },
  statusSent: { backgroundColor: C.amberLight },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  statusTextDraft: { color: C.textSec },
  statusTextSent: { color: C.amberText },

  description: { fontSize: 14, color: C.textSec, lineHeight: 20, marginBottom: 12 },
  descriptionInput: {
    fontSize: 14, color: C.text, lineHeight: 20, marginBottom: 12,
    backgroundColor: C.bg, borderRadius: 8, padding: 10, minHeight: 60,
  },

  section: { marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 0.6 },
  addLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addLinkText: { fontSize: 13, color: C.primary, fontWeight: '600' },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  itemDesc: { fontSize: 14, color: C.text },
  itemMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },
  itemInput: {
    fontSize: 14, color: C.text, padding: 8, backgroundColor: C.bg, borderRadius: 6,
  },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  itemInputSmall: {
    fontSize: 13, color: C.text, padding: 6, backgroundColor: C.bg, borderRadius: 6,
    fontVariant: ['tabular-nums'],
  },
  times: { fontSize: 13, color: C.textMuted },

  emptyHint: { fontSize: 13, color: C.textMuted, fontStyle: 'italic', paddingVertical: 8 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperValue: { fontSize: 16, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },

  subtotalValue: { fontSize: 14, color: C.text },

  totalsBlock: { paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalsLabel: { fontSize: 13, color: C.textSec },
  totalsValue: { fontSize: 13, color: C.text, fontVariant: ['tabular-nums'] },
  totalsRowBig: { paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, marginTop: 6 },
  totalsBigLabel: { fontSize: 16, fontWeight: '700', color: C.text },
  totalsBigValue: { fontSize: 22, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },

  callout: {
    backgroundColor: C.primaryLight, borderRadius: 12, padding: 14, marginTop: 14,
  },
  calloutTitle: { fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 0.6, marginBottom: 6 },
  calloutLine: { fontSize: 13, color: C.text, lineHeight: 20 },
  calloutBold: { fontWeight: '700', fontVariant: ['tabular-nums'] },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.bg, borderRadius: 12, padding: 12, marginTop: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  toggleHint: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  strategyBlock: {
    marginTop: 14, padding: 12, backgroundColor: C.bg, borderRadius: 12,
  },
  strategyLabel: {
    fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 8,
    letterSpacing: 0.2,
  },
  strategyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8,
  },
  strategyRowSelected: { backgroundColor: C.primaryLight },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: C.border, marginTop: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: C.primary },
  radioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.primary },
  strategyOptLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  strategyOptHint: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: C.bg,
  },
  btnGhostText: { fontSize: 14, color: C.text, fontWeight: '600' },
  btnSecondary: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, flex: 1, alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 14, color: C.text, fontWeight: '600' },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: C.primary, flex: 1.2,
  },
  btnPrimaryText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  sentNote: { flex: 1, fontSize: 13, color: C.textSec, fontStyle: 'italic' },
});
