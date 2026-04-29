import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Modal,
  TextInput, ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, getColors } from '../constants/theme';
import { showSignatureSendOptions } from '../utils/messaging';
import { requestSignature, fetchSignatureStatus, cancelSignatureRequest } from '../services/esignService';

/**
 * Drop-in section for any document detail screen.
 * Shows current signature status; offers Request/Cancel actions.
 *
 * Props:
 *  - documentType: 'estimate' | 'invoice' | 'contract'
 *  - documentId: UUID
 *  - defaultSignerName / defaultSignerEmail / defaultSignerPhone (prefill the request modal)
 *  - canRequest: boolean — gate visibility of the Request button
 */
export default function SignatureSection({
  documentType,
  documentId,
  defaultSignerName = '',
  defaultSignerEmail = '',
  defaultSignerPhone = '',
  canRequest = true,
}) {
  const { t } = useTranslation();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail);
  const [signerPhone, setSignerPhone] = useState(defaultSignerPhone);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!documentId) return;
    try {
      setLoading(true);
      const result = await fetchSignatureStatus({ documentType, documentId });
      setStatus(result);
    } catch (err) {
      // soft-fail; section just shows empty state
      setStatus({ status: 'none' });
    } finally {
      setLoading(false);
    }
  }, [documentType, documentId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmitRequest = async () => {
    if (!signerEmail || !signerEmail.includes('@')) {
      Alert.alert(t('esign.invalid_email_title', 'Email required'), t('esign.invalid_email_body', 'Enter a valid email so the signer can receive the signing link.'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestSignature({
        documentType,
        documentId,
        signerName: signerName || null,
        signerEmail,
        signerPhone: signerPhone || null,
      });
      setShowRequest(false);
      await load();
      // Offer share sheet
      showSignatureSendOptions(signerPhone, result.signingUrl, result.documentTitle || documentType);
    } catch (err) {
      Alert.alert(t('common.error', 'Error'), err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!status?.signatureId) return;
    Alert.alert(
      t('esign.cancel_request', 'Cancel signature request'),
      t('esign.cancel_request_confirm', 'The signing link will stop working immediately.'),
      [
        { text: t('common.no', 'No'), style: 'cancel' },
        {
          text: t('common.yes', 'Yes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSignatureRequest(status.signatureId);
              await load();
            } catch (err) {
              Alert.alert(t('common.error', 'Error'), err.message || 'Failed');
            }
          },
        },
      ]
    );
  };

  if (!documentId) return null;

  const surface = Colors.card || '#fff';
  const border = Colors.border;
  const textP = Colors.primaryText;
  const textS = Colors.secondaryText;

  // ---------- empty (no signature yet) ----------
  if (!loading && (!status || status.status === 'none')) {
    if (!canRequest) return null;
    return (
      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.header}>
          <Ionicons name="create-outline" size={18} color={textS} />
          <Text style={[styles.headerTitle, { color: textP }]}>{t('esign.signature', 'Signature')}</Text>
        </View>
        <Text style={[styles.subtle, { color: textS }]}>
          {t('esign.no_request_hint', 'Send a signing link to the customer for a binding e-signature.')}
        </Text>
        <TouchableOpacity
          onPress={() => setShowRequest(true)}
          style={[styles.btnPrimary, { backgroundColor: '#1E40AF' }]}
        >
          <Ionicons name="paper-plane-outline" size={14} color="#fff" />
          <Text style={styles.btnPrimaryText}>{t('esign.request_signature', 'Request signature')}</Text>
        </TouchableOpacity>
        {renderRequestModal()}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: surface, borderColor: border, alignItems: 'center' }]}>
        <ActivityIndicator size="small" color={textS} />
      </View>
    );
  }

  // ---------- has a signature row ----------
  const isSigned = status.status === 'signed';
  const isPending = status.status === 'pending';
  const isDeclined = status.status === 'declined';
  const isExpired = status.status === 'expired';

  const tag = isSigned ? { label: 'SIGNED', color: '#15803D', bg: '#16A34A14' } :
              isPending ? { label: 'PENDING', color: '#92400E', bg: '#D9770614' } :
              isDeclined ? { label: 'DECLINED', color: '#991B1B', bg: '#DC262614' } :
              { label: 'EXPIRED', color: '#475569', bg: '#64748B14' };

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.header}>
        <Ionicons name="create-outline" size={18} color={textS} />
        <Text style={[styles.headerTitle, { color: textP }]}>{t('esign.signature', 'Signature')}</Text>
        <View style={[styles.tag, { backgroundColor: tag.bg }]}>
          <Text style={[styles.tagText, { color: tag.color }]}>{tag.label}</Text>
        </View>
      </View>

      {(status.signerName || status.signerEmail) && (
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: textS }]}>{t('esign.signer', 'Signer')}</Text>
          <Text style={[styles.rowValue, { color: textP }]} numberOfLines={1}>
            {status.signerName || '—'}{status.signerEmail ? ` · ${status.signerEmail}` : ''}
          </Text>
        </View>
      )}

      {isSigned && status.signedAt && (
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: textS }]}>{t('esign.signed_at', 'Signed at')}</Text>
          <Text style={[styles.rowValue, { color: textP }]}>{new Date(status.signedAt).toLocaleString()}</Text>
        </View>
      )}

      {isSigned && status.signedPdfUrl && (
        <TouchableOpacity
          onPress={() => Linking.openURL(status.signedPdfUrl)}
          style={[styles.linkRow, { borderColor: border }]}
        >
          <Ionicons name="document-text-outline" size={16} color="#1E40AF" />
          <Text style={[styles.linkText]}>{t('esign.view_signed_pdf', 'View signed PDF')}</Text>
          <Ionicons name="open-outline" size={14} color="#1E40AF" />
        </TouchableOpacity>
      )}

      {isSigned && (
        <TouchableOpacity onPress={() => setShowAudit(s => !s)} style={styles.auditToggle}>
          <Text style={[styles.auditText, { color: textS }]}>
            {showAudit ? t('esign.hide_audit', 'Hide audit trail') : t('esign.show_audit', 'Show audit trail')}
          </Text>
          <Ionicons name={showAudit ? 'chevron-up' : 'chevron-down'} size={14} color={textS} />
        </TouchableOpacity>
      )}

      {isSigned && showAudit && (
        <View style={[styles.auditBox, { borderColor: border }]}>
          {[
            ['IP', status.auditTrail?.ip],
            ['User agent', status.auditTrail?.user_agent],
            ['Original SHA-256', status.auditTrail?.original_doc_hash || '—'],
            ['Signed PDF SHA-256', status.auditTrail?.signed_pdf_hash || '—'],
          ].map(([k, v]) => (
            <View key={k} style={styles.auditRow}>
              <Text style={[styles.auditKey, { color: textS }]}>{k}</Text>
              <Text style={[styles.auditValue, { color: textP }]} numberOfLines={2}>{String(v || '—')}</Text>
            </View>
          ))}
        </View>
      )}

      {isPending && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleCancel}
            style={[styles.btnSecondary, { borderColor: border }]}
          >
            <Text style={[styles.btnSecondaryText, { color: textS }]}>{t('esign.cancel_request_short', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {(isDeclined || isExpired) && canRequest && (
        <TouchableOpacity
          onPress={() => setShowRequest(true)}
          style={[styles.btnPrimary, { backgroundColor: '#1E40AF' }]}
        >
          <Ionicons name="refresh" size={14} color="#fff" />
          <Text style={styles.btnPrimaryText}>{t('esign.request_again', 'Request again')}</Text>
        </TouchableOpacity>
      )}

      {renderRequestModal()}
    </View>
  );

  // ---------- modal ----------
  function renderRequestModal() {
    return (
      <Modal visible={showRequest} animationType="slide" transparent onRequestClose={() => setShowRequest(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textP }]}>{t('esign.request_signature', 'Request signature')}</Text>
                <TouchableOpacity onPress={() => setShowRequest(false)}>
                  <Ionicons name="close" size={22} color={textS} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.subtle, { color: textS, marginBottom: 16 }]}>
                {t('esign.request_subtle', 'We\'ll email a single-use signing link valid for 7 days.')}
              </Text>

              <Field label={t('esign.signer_name', 'Signer name')} value={signerName} onChange={setSignerName} placeholder="Jane Doe" textP={textP} textS={textS} border={border} />
              <Field label={t('esign.signer_email', 'Email')} value={signerEmail} onChange={setSignerEmail} placeholder="signer@example.com" keyboardType="email-address" autoCapitalize="none" textP={textP} textS={textS} border={border} />
              <Field label={t('esign.signer_phone', 'Phone (optional)')} value={signerPhone} onChange={setSignerPhone} placeholder="(555) 555-5555" keyboardType="phone-pad" textP={textP} textS={textS} border={border} />

              <TouchableOpacity
                onPress={handleSubmitRequest}
                disabled={submitting}
                style={[styles.btnPrimary, { backgroundColor: '#1E40AF', marginTop: 8, opacity: submitting ? 0.7 : 1 }]}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                    <Text style={styles.btnPrimaryText}>{t('esign.send_link', 'Send link')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }
}

function Field({ label, value, onChange, placeholder, keyboardType, autoCapitalize, textP, textS, border }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: textS, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={textS}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          borderWidth: StyleSheet.hairlineWidth, borderColor: border,
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
          fontSize: 14, color: textP,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  headerTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  tag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  tagText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 },
  subtle: { fontSize: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 11, fontWeight: '500' },
  rowValue: { fontSize: 12, fontWeight: '600', flexShrink: 1, marginLeft: 12 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  linkText: { color: '#1E40AF', fontWeight: '600', fontSize: 13, flex: 1 },
  auditToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  auditText: { fontSize: 11, fontWeight: '600' },
  auditBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, marginTop: 4 },
  auditRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  auditKey: { fontSize: 10, fontWeight: '500' },
  auditValue: { fontSize: 10, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 12 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 10, marginTop: 8,
  },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnSecondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  btnSecondaryText: { fontSize: 12, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
});
