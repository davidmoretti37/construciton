import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { respondToChangeOrder } from '../../services/clientPortalApi';
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
  pending_client: { bg: C.amberLight, text: C.amberText, label: 'AWAITING APPROVAL' },
  viewed: { bg: C.amberLight, text: C.amberText, label: 'AWAITING APPROVAL' },
  approved: { bg: C.greenBg, text: C.greenText, label: 'APPROVED' },
  rejected: { bg: C.redBg, text: C.redText, label: 'DECLINED' },
  void: { bg: C.border, text: C.textMuted, label: 'VOIDED' },
  voided: { bg: C.border, text: C.textMuted, label: 'VOIDED' },
};

const REASON_CHIPS = ['Too expensive', 'Need more info', 'Out of scope', 'Discuss first', 'Other'];

export default function ClientChangeOrderDetailScreen({ route, navigation }) {
  const { changeOrder, project } = route.params;
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [selectedChip, setSelectedChip] = useState(null);
  const [approvalName, setApprovalName] = useState(profile?.full_name || '');
  const [responded, setResponded] = useState(!['pending_client', 'viewed'].includes(changeOrder.status));

  const co = changeOrder;
  const status = STATUS_MAP[co.status] || STATUS_MAP.draft;
  // Server now joins line items under `change_order_line_items`. Tolerate either
  // shape so old cached data and the new server response both render.
  const lineItems = co.change_order_line_items || co.line_items || [];
  const isPending = ['pending_client', 'viewed'].includes(co.status) && !responded;
  const scheduleDays = Number(co.schedule_impact_days ?? co.days_added ?? 0);
  const requiresSignature = !!co.signature_required;
  // Compute new end date for the schedule callout
  const newEndDate = (project?.end_date && scheduleDays)
    ? new Date(new Date(project.end_date).getTime() + scheduleDays * 86400000)
    : null;

  const handleApprove = async () => {
    // Signature-required COs cannot be approved by typed name — server enforces.
    // Tell the client the contractor will email a signing link.
    if (requiresSignature) {
      Alert.alert(
        'Signature required',
        'This change order needs your signature. Check your email for the signing link the contractor sent, or ask them to resend it.'
      );
      return;
    }
    if (!approvalName.trim()) {
      Alert.alert('Name Required', 'Please type your name to approve.');
      return;
    }
    try {
      setSubmitting(true);
      await respondToChangeOrder(co.id, 'approve', approvalName.trim());
      setResponded(true);
      setShowApprove(false);
      Alert.alert('Approved', 'Change order has been approved.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    const reason = selectedChip === 'Other' ? declineReason : (selectedChip || declineReason);
    try {
      setSubmitting(true);
      await respondToChangeOrder(co.id, 'reject', null, reason);
      setResponded(true);
      setShowDecline(false);
      Alert.alert('Declined', 'Change order has been declined.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to decline');
    } finally {
      setSubmitting(false);
    }
  };

  const daysUntilExpiry = co.expires_at
    ? Math.ceil((new Date(co.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Change Order</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Badge */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>

        {/* Title + Description */}
        <Text style={styles.title}>{co.title}</Text>
        {co.description && <Text style={styles.description}>{co.description}</Text>}

        {/* Expiry Warning */}
        {isPending && daysUntilExpiry !== null && daysUntilExpiry <= 7 && (
          <View style={styles.expiryBanner}>
            <Ionicons name="time-outline" size={16} color={C.amberDark} />
            <Text style={styles.expiryText}>
              {daysUntilExpiry <= 0 ? 'Expired' : `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`}
            </Text>
          </View>
        )}

        {/* Cost Breakdown */}
        <View style={styles.costCard}>
          <Text style={styles.costLabel}>CHANGE AMOUNT</Text>
          <Text style={styles.costAmount}>
            {co.total_amount >= 0 ? '+' : ''}${Math.abs(parseFloat(co.total_amount || 0)).toLocaleString()}
          </Text>
          {scheduleDays !== 0 && (
            <Text style={styles.costDays}>
              {scheduleDays > 0 ? '+' : ''}{scheduleDays} day{Math.abs(scheduleDays) !== 1 ? 's' : ''} to schedule
            </Text>
          )}
        </View>

        {/* Schedule Impact Callout — clients absorb price better when they see end-date impact */}
        {scheduleDays !== 0 && newEndDate && (
          <View style={styles.scheduleCallout}>
            <Ionicons name="calendar-outline" size={16} color={C.amberDark} />
            <Text style={styles.scheduleCalloutText}>
              {scheduleDays > 0 ? 'Adds' : 'Reduces'} {Math.abs(scheduleDays)} day{Math.abs(scheduleDays) !== 1 ? 's' : ''} —
              new estimated completion: <Text style={{ fontWeight: '700' }}>
                {newEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            </Text>
          </View>
        )}

        {/* Signature requirement banner */}
        {isPending && requiresSignature && (
          <View style={styles.signatureNotice}>
            <Ionicons name="shield-checkmark-outline" size={16} color={C.blue} />
            <Text style={styles.signatureNoticeText}>
              Your contractor requested a signature. Check your email for the signing link.
            </Text>
          </View>
        )}

        {/* Line Items */}
        {lineItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LINE ITEMS</Text>
            <View style={styles.lineItemsCard}>
              {lineItems.map((item, i) => {
                const qty = item.quantity != null ? Number(item.quantity) : null;
                const unit = item.unit || '';
                const unitPrice = item.unit_price != null ? Number(item.unit_price) : null;
                const itemAmount = parseFloat(item.amount ?? item.total ?? (qty != null && unitPrice != null ? qty * unitPrice : 0));
                const showQtyLine = qty != null && qty !== 1;
                return (
                  <View key={item.id || i} style={[styles.lineItem, i < lineItems.length - 1 && styles.lineItemBorder]}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.lineItemDesc}>{item.description}</Text>
                      {showQtyLine && (
                        <Text style={styles.lineItemMeta}>
                          {qty}{unit ? ` ${unit}` : ''}{unitPrice != null ? ` × $${unitPrice.toLocaleString()}` : ''}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.lineItemAmount}>${itemAmount.toLocaleString()}</Text>
                  </View>
                );
              })}
              <View style={[styles.lineItem, styles.lineItemTotal]}>
                <Text style={styles.lineItemTotalLabel}>Total</Text>
                <Text style={styles.lineItemTotalAmount}>${parseFloat(co.total_amount || 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Reason */}
        {co.reason && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>REASON</Text>
            <View style={styles.reasonCard}>
              <Text style={styles.reasonText}>
                {co.reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </Text>
            </View>
          </View>
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DETAILS</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Submitted</Text>
            <Text style={styles.detailValue}>{new Date(co.created_at).toLocaleDateString()}</Text>
          </View>
          {co.approved_at && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Approved</Text>
              <Text style={[styles.detailValue, { color: C.green }]}>{new Date(co.approved_at).toLocaleDateString()}</Text>
            </View>
          )}
          {co.approved_by_name && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Approved by</Text>
              <Text style={styles.detailValue}>{co.approved_by_name}</Text>
            </View>
          )}
          {co.client_response_reason && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Decline reason</Text>
              <Text style={[styles.detailValue, { color: C.red }]}>{co.client_response_reason}</Text>
            </View>
          )}
        </View>

        {/* Approve Flow */}
        {showApprove && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Approve Change Order</Text>
            <Text style={styles.actionSubtitle}>This will add ${parseFloat(co.total_amount || 0).toLocaleString()} to your project total</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Type your full name to approve"
              placeholderTextColor={C.textMuted}
              value={approvalName}
              onChangeText={setApprovalName}
              autoCapitalize="words"
            />
            <Text style={styles.legalText}>By approving, you authorize the contractor to proceed with this work and agree to the additional cost.</Text>
            <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveBtnText}>Confirm Approval</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowApprove(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Decline Flow */}
        {showDecline && (
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Decline Change Order</Text>
            <Text style={styles.actionSubtitle}>Please share your reason</Text>
            <View style={styles.chipRow}>
              {REASON_CHIPS.map((chip) => (
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
              {submitting ? <ActivityIndicator color={C.red} /> : <Text style={styles.declineBtnText}>Decline Change Order</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDecline(false)} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      {isPending && !showApprove && !showDecline && (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <TouchableOpacity style={styles.declineAction} onPress={() => setShowDecline(true)}>
            <Text style={styles.declineActionText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.approveAction} onPress={() => setShowApprove(true)}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.approveActionText}>Review & Approve</Text>
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
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },

  title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 8 },
  description: { fontSize: 15, lineHeight: 22, color: C.textSec, marginBottom: 16 },

  expiryBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.amberLight, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  expiryText: { fontSize: 13, fontWeight: '600', color: C.amberDark },

  scheduleCallout: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: C.amberLight, borderLeftWidth: 3, borderLeftColor: C.amber,
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  scheduleCalloutText: { fontSize: 13, color: C.amberText, flex: 1, lineHeight: 18 },

  signatureNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.blueBg, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  signatureNoticeText: { fontSize: 13, color: '#1E40AF', flex: 1, lineHeight: 18 },

  costCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4,
  },
  costLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted },
  costAmount: { fontSize: 36, fontWeight: '800', color: C.amber, marginTop: 8, fontVariant: ['tabular-nums'] },
  costDays: { fontSize: 13, color: C.textSec, marginTop: 6 },

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

  reasonCard: { backgroundColor: C.amberLight, borderLeftWidth: 3, borderLeftColor: C.amber, borderRadius: 8, padding: 12 },
  reasonText: { fontSize: 14, color: C.amberText, fontStyle: 'italic' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  detailLabel: { fontSize: 13, color: C.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: C.text },

  // Action sheets
  actionSheet: { backgroundColor: C.surface, borderRadius: 16, padding: 20, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6 },
  actionTitle: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
  actionSubtitle: { fontSize: 14, color: C.textSec, textAlign: 'center', marginTop: 6, marginBottom: 16 },

  nameInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14,
    fontSize: 15, color: C.text, marginBottom: 12,
  },
  legalText: { fontSize: 12, color: C.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 18 },

  approveBtn: { backgroundColor: C.amber, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: C.amberLight, borderColor: C.amber },
  chipText: { fontSize: 13, color: C.textSec },
  chipTextActive: { color: C.amberDark, fontWeight: '600' },

  reasonInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, fontSize: 14, color: C.text, height: 80, textAlignVertical: 'top', marginBottom: 12 },

  declineBtn: { backgroundColor: C.redBg, borderWidth: 1.5, borderColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  declineBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },

  cancelLink: { alignItems: 'center', paddingVertical: 12 },
  cancelLinkText: { fontSize: 14, color: C.textMuted },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
  },
  declineAction: {
    flex: 0.4, borderWidth: 2, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  declineActionText: { fontSize: 15, fontWeight: '600', color: C.textSec },
  approveAction: {
    flex: 0.6, backgroundColor: C.amber, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  approveActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
