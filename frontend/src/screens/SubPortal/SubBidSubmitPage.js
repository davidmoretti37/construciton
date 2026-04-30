/**
 * SubBidSubmitPage — sub views the full bid package and submits a bid.
 *
 * Shows: site location (with map link), site visit notes, scope of work,
 * attachments (tap to view in DocumentViewer). Bottom action: submit a
 * bid with amount + timeline + exclusions, OR decline the invitation.
 *
 * Route params: { bidRequestId }
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Linking, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';

const SUB_VIOLET = '#8B5CF6';

const ATTACHMENT_TYPE_LABELS = {
  plan: 'Plans',
  photo: 'Site photos',
  spec: 'Specs',
  other: 'Files',
};

export default function SubBidSubmitPage({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const bidRequestId = route?.params?.bidRequestId;

  const [loading, setLoading] = useState(true);
  const [pkg, setPkg] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  // Submit form
  const [amount, setAmount] = useState('');
  const [timelineDays, setTimelineDays] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);

  const load = useCallback(async () => {
    if (!bidRequestId) return;
    setLoading(true);
    try {
      const data = await api.getBidRequestForSub(bidRequestId);
      setPkg(data);
      if (data?.my_bid) {
        setAmount(String(data.my_bid.amount || ''));
        setTimelineDays(data.my_bid.timeline_days != null ? String(data.my_bid.timeline_days) : '');
        setExclusions(data.my_bid.exclusions || '');
        setNotes(data.my_bid.notes || '');
      }
    } catch (e) {
      Alert.alert('Could not load bid', e.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }, [bidRequestId]);

  useEffect(() => { load(); }, [load]);

  const br = pkg?.bid_request;
  const project = pkg?.project;
  const attachments = pkg?.attachments || [];
  const senderName = pkg?.sender_name;
  const myBid = pkg?.my_bid;

  // Build site address — bid_request override takes precedence over project
  const siteAddress = useMemo(() => {
    if (!br && !project) return '';
    const parts = [
      br?.site_address || project?.address,
      br?.site_city || project?.city,
      br?.site_state_code || project?.state_code,
      br?.site_postal_code || project?.postal_code,
    ].filter(Boolean);
    return parts.join(', ');
  }, [br, project]);

  const openMap = () => {
    if (!siteAddress) return;
    const q = encodeURIComponent(siteAddress);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  const onOpenAttachment = async (att) => {
    if (!att?.id || openingId) return;
    setOpeningId(att.id);
    try {
      const res = await api.getBidAttachmentSignedUrlForSub(bidRequestId, att.id);
      if (!res?.url) throw new Error('No URL');
      const ext = (att.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = (att.file_mime || '').includes('pdf') || ext === 'pdf';
      const isImage = (att.file_mime || '').startsWith('image/') ||
        ['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext);
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: att.file_name || 'Attachment',
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again.');
    } finally {
      setOpeningId(null);
    }
  };

  const onSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      Alert.alert('Add an amount', 'Enter your bid amount before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitBid({
        bid_request_id: bidRequestId,
        amount: amt,
        timeline_days: timelineDays ? Number(timelineDays) : null,
        exclusions: exclusions.trim() || null,
        notes: notes.trim() || null,
      });
      Alert.alert(
        'Bid submitted',
        `Your bid of $${amt.toLocaleString()} was sent to ${senderName || 'the contractor'}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not submit', e.message || 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  const onDecline = () => {
    Alert.alert(
      'Decline this bid?',
      'Are you sure? You can always submit later if the request is still open.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setDeclining(true);
            try {
              await api.declineBidRequest(bidRequestId);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Could not decline', e.message || 'Try again');
            } finally {
              setDeclining(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </SafeAreaView>
    );
  }

  if (!br) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
        <Text style={styles.errorTitle}>Bid not found</Text>
        <Text style={styles.errorBody}>This invitation may have expired or been withdrawn.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.primaryBtn, { paddingHorizontal: 32, marginTop: 20 }]}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const photoAttachments = attachments.filter((a) => a.attachment_type === 'photo' || (a.file_mime || '').startsWith('image/'));
  const docAttachments = attachments.filter((a) => !photoAttachments.includes(a));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bid invitation</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {senderName ? `from ${senderName}` : 'New bid request'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.tradeChip}>
            <Ionicons name="construct" size={14} color="#fff" />
            <Text style={styles.tradeChipText}>{br.trade}</Text>
          </View>
          <Text style={styles.projectName} numberOfLines={2}>
            {project?.project_name || 'Untitled project'}
          </Text>
          {project?.project_type ? (
            <Text style={styles.projectType}>{project.project_type}</Text>
          ) : null}
          {br.due_at ? (
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color={Colors.secondaryText} />
              <Text style={styles.metaText}>Bid due {new Date(br.due_at).toLocaleDateString()}</Text>
            </View>
          ) : null}
        </View>

        {/* Site location */}
        {siteAddress ? (
          <Section title="Job site" Colors={Colors}>
            <TouchableOpacity style={styles.siteCard} onPress={openMap} activeOpacity={0.8}>
              <View style={styles.siteIconWrap}>
                <Ionicons name="location" size={20} color={SUB_VIOLET} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.siteAddress}>{siteAddress}</Text>
                <View style={styles.mapLinkRow}>
                  <Ionicons name="map" size={13} color={SUB_VIOLET} />
                  <Text style={styles.mapLink}>Open in maps</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Section>
        ) : null}

        {/* Site visit notes */}
        {br.site_visit_notes ? (
          <Section title="Site visit" Colors={Colors}>
            <View style={styles.noteCard}>
              <Ionicons name="information-circle" size={16} color={SUB_VIOLET} />
              <Text style={styles.noteText}>{br.site_visit_notes}</Text>
            </View>
          </Section>
        ) : null}

        {/* Scope of work */}
        <Section title="Scope of work" Colors={Colors}>
          <View style={styles.scopeCard}>
            <Text style={styles.scopeText}>{br.scope_summary}</Text>
          </View>
        </Section>

        {/* Photo attachments — gallery */}
        {photoAttachments.length > 0 && (
          <Section title="Site photos" Colors={Colors}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photoAttachments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => onOpenAttachment(a)}
                  activeOpacity={0.85}
                  disabled={openingId === a.id}
                >
                  <View style={styles.photoTile}>
                    {openingId === a.id ? (
                      <ActivityIndicator color={SUB_VIOLET} />
                    ) : (
                      <Ionicons name="image" size={28} color={SUB_VIOLET} />
                    )}
                  </View>
                  <Text style={styles.photoCaption} numberOfLines={1}>{a.file_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Section>
        )}

        {/* Document attachments — list */}
        {docAttachments.length > 0 && (
          <Section title="Plans & documents" Colors={Colors}>
            {docAttachments.map((a) => {
              const isLoading = openingId === a.id;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={styles.docCard}
                  onPress={() => onOpenAttachment(a)}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <View style={styles.docIconWrap}>
                    <Ionicons name="document-text" size={20} color={SUB_VIOLET} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.docName} numberOfLines={1}>{a.file_name}</Text>
                    <Text style={styles.docMeta}>
                      {ATTACHMENT_TYPE_LABELS[a.attachment_type] || a.attachment_type}
                      {a.file_size_bytes ? ` · ${(a.file_size_bytes / 1024).toFixed(0)} KB` : ''}
                    </Text>
                  </View>
                  {isLoading
                    ? <ActivityIndicator size="small" color={SUB_VIOLET} />
                    : <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />}
                </TouchableOpacity>
              );
            })}
          </Section>
        )}

        {/* Submit form */}
        <Section title={myBid ? 'Update your bid' : 'Submit your bid'} Colors={Colors}>
          {myBid && myBid.status === 'submitted' && (
            <View style={styles.alreadyBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.alreadyText}>You've already submitted ${Number(myBid.amount).toLocaleString()} — edit and resubmit if needed.</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>Bid amount</Text>
          <View style={styles.amountWrap}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.fieldLabel}>Timeline (days)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. 14"
            placeholderTextColor={Colors.placeholder || '#9CA3AF'}
            value={timelineDays}
            onChangeText={setTimelineDays}
            keyboardType="numeric"
          />

          <Text style={styles.fieldLabel}>Exclusions (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            placeholder="e.g. Excludes fixtures, excludes permits"
            placeholderTextColor={Colors.placeholder || '#9CA3AF'}
            value={exclusions}
            onChangeText={setExclusions}
            multiline
          />

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            placeholder="Anything else the contractor should know"
            placeholderTextColor={Colors.placeholder || '#9CA3AF'}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{myBid ? 'Resubmit bid' : 'Submit bid'}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineBtn}
            onPress={onDecline}
            disabled={declining || submitting}
            activeOpacity={0.7}
          >
            {declining ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Text style={styles.declineText}>Decline this bid</Text>
            )}
          </TouchableOpacity>
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, Colors }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={[sectionStyles.title, { color: Colors.secondaryText }]}>{title}</Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  title: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 10, paddingHorizontal: 4,
  },
});

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  scroll: { padding: 16 },
  heroCard: {
    backgroundColor: SUB_VIOLET + '12',
    borderRadius: 16,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: SUB_VIOLET,
  },
  tradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SUB_VIOLET,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  tradeChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  projectName: { fontSize: 22, fontWeight: '700', color: Colors.primaryText, marginTop: 12 },
  projectType: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { fontSize: 13, color: Colors.secondaryText, fontWeight: '500' },
  siteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  siteIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: SUB_VIOLET + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  siteAddress: { fontSize: 14, color: Colors.primaryText, fontWeight: '500' },
  mapLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  mapLink: { fontSize: 12, fontWeight: '600', color: SUB_VIOLET },
  noteCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: SUB_VIOLET + '10',
    borderRadius: 12,
    padding: 14,
  },
  noteText: { flex: 1, fontSize: 14, color: Colors.primaryText, lineHeight: 20 },
  scopeCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scopeText: { fontSize: 14, color: Colors.primaryText, lineHeight: 22 },
  photoTile: {
    width: 120, height: 90, borderRadius: 10,
    backgroundColor: SUB_VIOLET + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  photoCaption: { width: 120, fontSize: 11, color: Colors.secondaryText, marginTop: 4 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: SUB_VIOLET + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  docName: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  docMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  alreadyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B98115',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  alreadyText: { flex: 1, fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.primaryText, marginTop: 14, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.primaryText,
    backgroundColor: Colors.cardBackground,
  },
  multilineInput: { minHeight: 70, textAlignVertical: 'top' },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SUB_VIOLET,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.cardBackground,
  },
  dollarSign: { fontSize: 28, fontWeight: '700', color: SUB_VIOLET, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primaryText,
    paddingVertical: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SUB_VIOLET,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 22,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  declineBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  declineText: { fontSize: 14, fontWeight: '600', color: '#DC2626' },
  errorTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryText, marginTop: 14 },
  errorBody: { fontSize: 14, color: Colors.secondaryText, marginTop: 6, textAlign: 'center' },
});
