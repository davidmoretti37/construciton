// ClientEstimateDetailScreen — client-facing estimate review.
// Three actions: Accept / Decline / Request Changes.
// Mirrors the look and feel of ClientChangeOrderDetailScreen.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { respondToEstimate, fetchProjectEstimates, fetchEstimateSigningLink, fetchEstimateSignature } from '../../services/clientPortalApi';
import { useAuth } from '../../contexts/AuthContext';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', redText: '#991B1B',
  blue: '#3B82F6', blueBg: '#DBEAFE',
};

const STATUS_MAP = {
  draft: { bg: C.border, text: C.textSec, label: 'PREPARING' },
  sent: { bg: C.amberLight, text: C.amberText, label: 'AWAITING REVIEW' },
  viewed: { bg: C.amberLight, text: C.amberText, label: 'AWAITING REVIEW' },
  accepted: { bg: C.greenBg, text: C.greenText, label: 'ACCEPTED' },
  rejected: { bg: C.redBg, text: C.redText, label: 'DECLINED' },
};

const CHANGE_REASONS = [
  'Price too high',
  'Wrong scope',
  'Need different timeline',
  'Want different materials',
  'Other',
];

export default function ClientEstimateDetailScreen({ route, navigation }) {
  const { estimate: estimateProp, project } = route.params || {};
  const { profile } = useAuth();
  const { t } = useTranslation('common');

  // Local copy so status updates re-render immediately
  const [estimate, setEstimate] = useState(estimateProp);
  const [submitting, setSubmitting] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [loadingSigningUrl, setLoadingSigningUrl] = useState(false);
  const [signature, setSignature] = useState(null);
  const [acceptName, setAcceptName] = useState(profile?.full_name || '');
  const [declineReason, setDeclineReason] = useState('');
  const [changesNotes, setChangesNotes] = useState('');
  const [selectedChip, setSelectedChip] = useState(null);

  // If the client signs in the browser (signature_required estimates), the
  // server flips status to 'accepted' but our local state is stale. Refetch
  // when the screen regains focus so the UI reflects reality.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      if (!estimate?.id || !project?.id) return;
      try {
        const list = await fetchProjectEstimates(project.id);
        if (cancelled || !Array.isArray(list)) return;
        const fresh = list.find(e => e.id === estimate.id);
        if (fresh) {
          setEstimate(prev => ({ ...prev, ...fresh }));
        }
      } catch (_) {
        // best-effort
      }
      // Load signature if accepted + signature_required
      try {
        const sig = await fetchEstimateSignature(estimate.id);
        if (!cancelled && sig?.signer_name) setSignature(sig);
      } catch (_) {
        // 404 = not signed yet, fine
      }
    })();
    return () => { cancelled = true; };
  }, [estimate?.id, estimate?.status, project?.id]));

  const status = STATUS_MAP[estimate?.status] || STATUS_MAP.sent;
  const isPending = ['sent', 'viewed'].includes(estimate?.status);
  const lineItems = estimate?.items || [];
  const subtotal = parseFloat(estimate?.subtotal || 0);
  const taxAmount = parseFloat(estimate?.tax_amount || estimate?.taxAmount || 0);
  const taxRate = parseFloat(estimate?.tax_rate || estimate?.taxRate || 0);
  const total = parseFloat(estimate?.total || 0);

  const respond = async (action, notes) => {
    try {
      setSubmitting(true);
      await respondToEstimate(estimate.id, { action, notes });
      const newStatus = action === 'accepted' ? 'accepted'
        : action === 'rejected' ? 'rejected'
        : 'sent';  // changes_requested resets to sent
      setEstimate({ ...estimate, status: newStatus });
      setShowAccept(false);
      setShowDecline(false);
      setShowChanges(false);

      const messages = {
        accepted: [t('clientEstimateDetail.acceptedTitle'), t('clientEstimateDetail.acceptedBody')],
        rejected: [t('clientEstimateDetail.declinedTitle'), t('clientEstimateDetail.declinedBody')],
        changes_requested: [t('clientEstimateDetail.changesRequestedTitle'), t('clientEstimateDetail.changesRequestedBody')],
      };
      const [title, body] = messages[action];
      Alert.alert(title, body, [{ text: t('clientEstimateDetail.ok'), onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert(t('common:alerts.error'), e.message || t('clientEstimateDetail.failedToRespond'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = () => {
    // Signature-required estimates skip the typed-name path. The owner
    // separately sent a signing link; if the client tries to accept here,
    // tell them to use the email/portal sign link.
    if (estimate?.signature_required) {
      Alert.alert(
        t('clientEstimateDetail.signatureRequiredTitle'),
        t('clientEstimateDetail.signatureRequiredBody')
      );
      return;
    }
    if (!acceptName.trim()) {
      Alert.alert(t('clientEstimateDetail.nameRequiredTitle'), t('clientEstimateDetail.nameRequiredBody'));
      return;
    }
    respond('accepted', `Accepted by ${acceptName.trim()}`);
  };

  const handleDecline = () => {
    const reason = selectedChip === 'Other' ? declineReason : (selectedChip || declineReason);
    if (!reason.trim()) {
      Alert.alert(t('clientEstimateDetail.reasonNeededTitle'), t('clientEstimateDetail.reasonNeededBody'));
      return;
    }
    respond('rejected', reason);
  };

  const handleOpenSigning = async () => {
    if (loadingSigningUrl) return;
    try {
      setLoadingSigningUrl(true);
      const res = await fetchEstimateSigningLink(estimate.id);
      if (res?.token) {
        // Native in-app signing — no dependency on the web portal.
        navigation.navigate('SignDocument', {
          token: res.token,
          onSigned: () => setEstimate((prev) => ({ ...prev, status: 'accepted', accepted_date: new Date().toISOString() })),
        });
      } else if (res?.already_signed) {
        Alert.alert(t('clientEstimateDetail.alreadySignedTitle'), t('clientEstimateDetail.alreadySignedBody'));
      } else {
        Alert.alert(t('clientEstimateDetail.cannotSignTitle'), res?.error || t('clientEstimateDetail.noActiveSigningLink'));
      }
    } catch (e) {
      Alert.alert(t('clientEstimateDetail.signFailedTitle'), e?.message || t('clientEstimateDetail.couldNotStartSigning'));
    } finally {
      setLoadingSigningUrl(false);
    }
  };

  const handleRequestChanges = () => {
    if (!changesNotes.trim()) {
      Alert.alert(t('clientEstimateDetail.tellThemToChangeTitle'), t('clientEstimateDetail.tellThemToChangeBody'));
      return;
    }
    respond('changes_requested', changesNotes.trim());
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('clientEstimateDetail.estimate')}</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>

        {/* Header */}
        <Text style={styles.title}>{estimate?.estimate_number || t('clientEstimateDetail.estimate')}</Text>
        {estimate?.project_name ? <Text style={styles.subtitle}>{estimate.project_name}</Text> : null}

        {/* Signature-required notice */}
        {isPending && estimate?.signature_required && (
          <View style={styles.signatureNotice}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#1E40AF" />
            <Text style={styles.signatureNoticeText}>
              {t('clientEstimateDetail.signatureNotice')}
            </Text>
          </View>
        )}

        {/* Total */}
        <View style={styles.costCard}>
          <Text style={styles.costLabel}>{t('clientEstimateDetail.estimateTotal')}</Text>
          <Text style={styles.costAmount}>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          {estimate?.valid_until && (
            <Text style={styles.costSub}>
              {t('clientEstimateDetail.validUntil', { date: new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) })}
            </Text>
          )}
        </View>

        {/* Line items */}
        {lineItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('clientEstimateDetail.lineItems')}</Text>
            <View style={styles.lineItemsCard}>
              {lineItems.map((item, i) => {
                const qty = item.quantity != null ? Number(item.quantity) : null;
                const unit = item.unit || '';
                const price = item.price != null ? Number(item.price) : (item.unit_price != null ? Number(item.unit_price) : null);
                const lineTotal = parseFloat(item.total ?? (qty != null && price != null ? qty * price : 0));
                const showQty = qty != null && qty !== 1;
                return (
                  <View key={i} style={[styles.lineItem, i < lineItems.length - 1 && styles.lineItemBorder]}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.lineItemDesc}>{item.description || '—'}</Text>
                      {showQty && (
                        <Text style={styles.lineItemMeta}>
                          {qty}{unit ? ` ${unit}` : ''}{price != null ? ` × $${price.toLocaleString()}` : ''}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.lineItemAmount}>${lineTotal.toLocaleString()}</Text>
                  </View>
                );
              })}
              {subtotal > 0 && (
                <View style={[styles.lineItem, styles.lineItemBorder]}>
                  <Text style={styles.lineItemDesc}>{t('clientEstimateDetail.subtotal')}</Text>
                  <Text style={styles.lineItemAmount}>${subtotal.toLocaleString()}</Text>
                </View>
              )}
              {taxAmount > 0 && (
                <View style={[styles.lineItem, styles.lineItemBorder]}>
                  <Text style={styles.lineItemDesc}>{t('clientEstimateDetail.tax')}{taxRate ? ` (${taxRate}%)` : ''}</Text>
                  <Text style={styles.lineItemAmount}>${taxAmount.toLocaleString()}</Text>
                </View>
              )}
              <View style={[styles.lineItem, styles.lineItemTotal]}>
                <Text style={styles.lineItemTotalLabel}>{t('clientEstimateDetail.total')}</Text>
                <Text style={styles.lineItemTotalAmount}>${total.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Scope description if present */}
        {estimate?.scope?.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('clientEstimateDetail.scopeOfWork')}</Text>
            <View style={styles.scopeCard}>
              <Text style={styles.scopeText}>{estimate.scope.description}</Text>
            </View>
          </View>
        )}

        {/* Notes / payment terms */}
        {(estimate?.notes || estimate?.payment_terms) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('clientEstimateDetail.details')}</Text>
            {estimate?.payment_terms && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('clientEstimateDetail.paymentTerms')}</Text>
                <Text style={styles.detailValue}>{estimate.payment_terms}</Text>
              </View>
            )}
            {estimate?.notes && (
              <View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
                <Text style={styles.detailLabel}>{t('clientEstimateDetail.notes')}</Text>
                <Text style={[styles.detailValue, { textAlign: 'left' }]}>{estimate.notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Signature card — visible after the client has signed */}
        {signature?.signer_name && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('clientEstimateDetail.signature')}</Text>
            <View style={styles.signatureCard}>
              {signature.signature_png_url && (
                <Image
                  source={{ uri: signature.signature_png_url }}
                  style={styles.signatureImg}
                  resizeMode="contain"
                />
              )}
              <Text style={styles.signatureName}>{signature.signer_name}</Text>
              <Text style={styles.signatureMeta}>
                {t('clientEstimateDetail.signedAt', { date: signature.signed_at ? new Date(signature.signed_at).toLocaleString() : '' })}
              </Text>
            </View>
          </View>
        )}

        {/* Accept Sheet */}
        {showAccept && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{t('clientEstimateDetail.acceptEstimate')}</Text>
            <Text style={styles.actionSubtitle}>
              {t('clientEstimateDetail.acceptSubtitle')}
            </Text>
            <TextInput
              style={styles.nameInput}
              placeholder={t('clientEstimateDetail.typeFullName')}
              placeholderTextColor={C.textMuted}
              value={acceptName}
              onChangeText={setAcceptName}
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptBtnText}>{t('clientEstimateDetail.confirmAcceptance')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAccept(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>{t('common:buttons.cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Decline Sheet */}
        {showDecline && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{t('clientEstimateDetail.declineEstimate')}</Text>
            <Text style={styles.actionSubtitle}>{t('clientEstimateDetail.whyDeclining')}</Text>
            <View style={styles.chipRow}>
              {CHANGE_REASONS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chip, selectedChip === chip && styles.chipActive]}
                  onPress={() => setSelectedChip(chip === selectedChip ? null : chip)}
                >
                  <Text style={[styles.chipText, selectedChip === chip && styles.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedChip === 'Other' && (
              <TextInput
                style={styles.reasonInput}
                placeholder={t('clientEstimateDetail.addDetails')}
                placeholderTextColor={C.textMuted}
                value={declineReason}
                onChangeText={setDeclineReason}
                multiline
              />
            )}
            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} disabled={submitting || !selectedChip}>
              {submitting ? <ActivityIndicator color={C.red} /> : <Text style={styles.declineBtnText}>{t('clientEstimateDetail.confirmDecline')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDecline(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>{t('common:buttons.cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Request Changes Sheet */}
        {showChanges && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{t('clientEstimateDetail.requestChanges')}</Text>
            <Text style={styles.actionSubtitle}>
              {t('clientEstimateDetail.requestChangesSubtitle')}
            </Text>
            <TextInput
              style={styles.changesInput}
              placeholder={t('clientEstimateDetail.requestChangesPlaceholder')}
              placeholderTextColor={C.textMuted}
              value={changesNotes}
              onChangeText={setChangesNotes}
              multiline
              autoFocus
            />
            <TouchableOpacity style={styles.changesBtn} onPress={handleRequestChanges} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.changesBtnText}>{t('clientEstimateDetail.sendRequest')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChanges(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>{t('common:buttons.cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* Bottom action bar — only when pending */}
      {isPending && !showAccept && !showDecline && !showChanges && (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <TouchableOpacity style={styles.declineAction} onPress={() => setShowDecline(true)}>
            <Text style={styles.declineActionText}>{t('clientEstimateDetail.decline')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.changesAction} onPress={() => setShowChanges(true)}>
            <Text style={styles.changesActionText}>{t('clientEstimateDetail.requestChanges')}</Text>
          </TouchableOpacity>
          {estimate?.signature_required ? (
            <TouchableOpacity style={styles.acceptAction} onPress={handleOpenSigning} disabled={loadingSigningUrl}>
              {loadingSigningUrl ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.acceptActionText}>{t('clientEstimateDetail.signEstimate')}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.acceptAction} onPress={() => setShowAccept(true)}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.acceptActionText}>{t('clientEstimateDetail.accept')}</Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  signatureCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  signatureImg: {
    width: '100%', height: 140, marginBottom: 12,
  },
  signatureName: { fontSize: 16, fontWeight: '700', color: C.text },
  signatureMeta: { fontSize: 12, color: C.textSec, marginTop: 4 },
  scrollContent: { padding: 16 },

  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },

  title: { fontSize: 22, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 14, color: C.textSec, marginTop: 4, marginBottom: 16 },

  signatureNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#DBEAFE', borderRadius: 10, padding: 12, marginBottom: 16,
  },
  signatureNoticeText: { fontSize: 13, color: '#1E40AF', flex: 1, lineHeight: 18 },

  costCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4,
  },
  costLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted },
  costAmount: { fontSize: 36, fontWeight: '800', color: C.amber, marginTop: 8, fontVariant: ['tabular-nums'] },
  costSub: { fontSize: 13, color: C.textSec, marginTop: 6 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted, marginBottom: 10 },

  lineItemsCard: { backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  lineItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  lineItemDesc: { fontSize: 14, color: C.text },
  lineItemMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  lineItemAmount: { fontSize: 14, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },
  lineItemTotal: { borderTopWidth: 1.5, borderTopColor: C.border, backgroundColor: '#FAFAFA' },
  lineItemTotalLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  lineItemTotalAmount: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },

  scopeCard: { backgroundColor: C.surface, borderRadius: 12, padding: 14 },
  scopeText: { fontSize: 14, lineHeight: 21, color: C.text },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  detailLabel: { fontSize: 13, color: C.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: C.text },

  actionSheet: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20, marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  actionTitle: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
  actionSubtitle: { fontSize: 14, color: C.textSec, textAlign: 'center', marginTop: 6, marginBottom: 16, lineHeight: 20 },

  nameInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14,
    fontSize: 15, color: C.text, marginBottom: 16,
  },
  reasonInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14,
    fontSize: 14, color: C.text, height: 80, textAlignVertical: 'top', marginBottom: 12,
  },
  changesInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14,
    fontSize: 14, color: C.text, minHeight: 100, textAlignVertical: 'top', marginBottom: 16,
  },

  acceptBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  declineBtn: { backgroundColor: C.redBg, borderWidth: 1.5, borderColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  declineBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },

  changesBtn: { backgroundColor: C.blue, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  changesBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: C.amberLight, borderColor: C.amber },
  chipText: { fontSize: 13, color: C.textSec },
  chipTextActive: { color: C.amberDark, fontWeight: '600' },

  cancelLink: { alignItems: 'center', paddingVertical: 12 },
  cancelLinkText: { fontSize: 14, color: C.textMuted },

  bottomBar: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12,
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
  },
  // All three actions: same flex + same row layout with centered content,
  // so the labels line up cleanly across the bar.
  declineAction: {
    flex: 1, borderWidth: 2, borderColor: C.border, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  declineActionText: { fontSize: 14, fontWeight: '600', color: C.textSec, textAlign: 'center' },
  changesAction: {
    flex: 1.2, backgroundColor: C.blueBg, borderWidth: 1.5, borderColor: C.blue, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  changesActionText: { fontSize: 13, fontWeight: '700', color: C.blue, textAlign: 'center' },
  acceptAction: {
    flex: 1, backgroundColor: C.green, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  acceptActionText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
