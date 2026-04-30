// ClientEstimateDetailScreen — client-facing estimate review.
// Three actions: Accept / Decline / Request Changes.
// Mirrors the look and feel of ClientChangeOrderDetailScreen.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { respondToEstimate } from '../../services/clientPortalApi';
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
  draft: { bg: C.border, text: C.textSec, label: 'DRAFT' },
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

  // Local copy so status updates re-render immediately
  const [estimate, setEstimate] = useState(estimateProp);
  const [submitting, setSubmitting] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [acceptName, setAcceptName] = useState(profile?.full_name || '');
  const [declineReason, setDeclineReason] = useState('');
  const [changesNotes, setChangesNotes] = useState('');
  const [selectedChip, setSelectedChip] = useState(null);

  const status = STATUS_MAP[estimate?.status] || STATUS_MAP.sent;
  const isPending = ['sent', 'viewed', 'draft'].includes(estimate?.status);
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
        accepted: ['Accepted', 'Your contractor has been notified — they\'ll get started on next steps.'],
        rejected: ['Declined', 'Your contractor has been notified.'],
        changes_requested: ['Changes Requested', 'Your contractor has been notified and will revise the estimate.'],
      };
      const [title, body] = messages[action];
      Alert.alert(title, body, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to respond');
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
        'Signature required',
        'This estimate needs your signature. Check your email for the signing link the contractor sent, or ask them to resend it.'
      );
      return;
    }
    if (!acceptName.trim()) {
      Alert.alert('Name Required', 'Please type your name to accept.');
      return;
    }
    respond('accepted', `Accepted by ${acceptName.trim()}`);
  };

  const handleDecline = () => {
    const reason = selectedChip === 'Other' ? declineReason : (selectedChip || declineReason);
    if (!reason.trim()) {
      Alert.alert('Reason needed', 'Please share why you\'re declining so the contractor can follow up.');
      return;
    }
    respond('rejected', reason);
  };

  const handleRequestChanges = () => {
    if (!changesNotes.trim()) {
      Alert.alert('Tell them what to change', 'Add a note about what you\'d like to be different.');
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
          <Text style={styles.headerTitle}>Estimate</Text>
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
        <Text style={styles.title}>{estimate?.estimate_number || 'Estimate'}</Text>
        {estimate?.project_name ? <Text style={styles.subtitle}>{estimate.project_name}</Text> : null}

        {/* Signature-required notice */}
        {isPending && estimate?.signature_required && (
          <View style={styles.signatureNotice}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#1E40AF" />
            <Text style={styles.signatureNoticeText}>
              Your contractor requested a signature. Check your email for the signing link.
            </Text>
          </View>
        )}

        {/* Total */}
        <View style={styles.costCard}>
          <Text style={styles.costLabel}>ESTIMATE TOTAL</Text>
          <Text style={styles.costAmount}>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          {estimate?.valid_until && (
            <Text style={styles.costSub}>
              Valid until {new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          )}
        </View>

        {/* Line items */}
        {lineItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LINE ITEMS</Text>
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
                  <Text style={styles.lineItemDesc}>Subtotal</Text>
                  <Text style={styles.lineItemAmount}>${subtotal.toLocaleString()}</Text>
                </View>
              )}
              {taxAmount > 0 && (
                <View style={[styles.lineItem, styles.lineItemBorder]}>
                  <Text style={styles.lineItemDesc}>Tax{taxRate ? ` (${taxRate}%)` : ''}</Text>
                  <Text style={styles.lineItemAmount}>${taxAmount.toLocaleString()}</Text>
                </View>
              )}
              <View style={[styles.lineItem, styles.lineItemTotal]}>
                <Text style={styles.lineItemTotalLabel}>Total</Text>
                <Text style={styles.lineItemTotalAmount}>${total.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Scope description if present */}
        {estimate?.scope?.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SCOPE OF WORK</Text>
            <View style={styles.scopeCard}>
              <Text style={styles.scopeText}>{estimate.scope.description}</Text>
            </View>
          </View>
        )}

        {/* Notes / payment terms */}
        {(estimate?.notes || estimate?.payment_terms) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            {estimate?.payment_terms && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payment terms</Text>
                <Text style={styles.detailValue}>{estimate.payment_terms}</Text>
              </View>
            )}
            {estimate?.notes && (
              <View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={[styles.detailValue, { textAlign: 'left' }]}>{estimate.notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Accept Sheet */}
        {showAccept && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Accept Estimate</Text>
            <Text style={styles.actionSubtitle}>
              By accepting, you authorize the contractor to proceed with this scope at this price.
            </Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Type your full name"
              placeholderTextColor={C.textMuted}
              value={acceptName}
              onChangeText={setAcceptName}
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptBtnText}>Confirm Acceptance</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAccept(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Decline Sheet */}
        {showDecline && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Decline Estimate</Text>
            <Text style={styles.actionSubtitle}>Why are you declining?</Text>
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
                placeholder="Add details..."
                placeholderTextColor={C.textMuted}
                value={declineReason}
                onChangeText={setDeclineReason}
                multiline
              />
            )}
            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} disabled={submitting || !selectedChip}>
              {submitting ? <ActivityIndicator color={C.red} /> : <Text style={styles.declineBtnText}>Confirm Decline</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDecline(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Request Changes Sheet */}
        {showChanges && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Request Changes</Text>
            <Text style={styles.actionSubtitle}>
              Tell your contractor what you'd like adjusted. They'll revise and resend.
            </Text>
            <TextInput
              style={styles.changesInput}
              placeholder="e.g. Can you change the tile to something less expensive? Also add the vanity install."
              placeholderTextColor={C.textMuted}
              value={changesNotes}
              onChangeText={setChangesNotes}
              multiline
              autoFocus
            />
            <TouchableOpacity style={styles.changesBtn} onPress={handleRequestChanges} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.changesBtnText}>Send Request</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChanges(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* Bottom action bar — only when pending */}
      {isPending && !showAccept && !showDecline && !showChanges && (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <TouchableOpacity style={styles.declineAction} onPress={() => setShowDecline(true)}>
            <Text style={styles.declineActionText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.changesAction} onPress={() => setShowChanges(true)}>
            <Text style={styles.changesActionText}>Request Changes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptAction} onPress={() => setShowAccept(true)}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.acceptActionText}>Accept</Text>
          </TouchableOpacity>
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
