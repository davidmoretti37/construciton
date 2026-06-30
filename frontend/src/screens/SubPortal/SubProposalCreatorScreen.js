/**
 * SubProposalCreatorScreen — sub sends an unsolicited proposal to a GC.
 *
 * Three-step form:
 *   1. Pick contractor + trade
 *   2. Scope of work (free text — sub authors it themselves)
 *   3. Amount + timeline + optional attachments + send
 *
 * Backend POST /api/sub-portal/proposals creates a bid_request
 * (originated_by_role='sub'), self-invites this sub, and submits the
 * sub's bid in one call. Attachments are uploaded after via the same
 * /api/bid-requests/:id/attachments endpoint used by GC bid packages.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';

const SUB_VIOLET = '#8B5CF6';

// Attachments are POSTed inline as base64 (≈+33% over raw bytes). Cap per-file
// and total pending payload to avoid JS-bridge memory pressure / backend body
// rejections that would only surface after the proposal was already created.
const MAX_FILE_BYTES = 8 * 1024 * 1024;        // 8 MB per file
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;      // 20 MB across all pending files

const TRADES = [
  { key: 'plumbing',     label: 'Plumbing',      icon: 'water' },
  { key: 'electrical',   label: 'Electrical',    icon: 'flash' },
  { key: 'hvac',         label: 'HVAC',          icon: 'thermometer' },
  { key: 'carpentry',    label: 'Carpentry',     icon: 'hammer' },
  { key: 'crown_molding',label: 'Crown molding', icon: 'analytics' },
  { key: 'drywall',      label: 'Drywall',       icon: 'layers' },
  { key: 'painting',     label: 'Painting',      icon: 'color-palette' },
  { key: 'flooring',     label: 'Flooring',      icon: 'grid' },
  { key: 'tile',         label: 'Tile',          icon: 'apps' },
  { key: 'roofing',      label: 'Roofing',       icon: 'home' },
  { key: 'concrete',     label: 'Concrete',      icon: 'cube' },
  { key: 'landscaping',  label: 'Landscaping',   icon: 'leaf' },
  { key: 'pest_control', label: 'Pest control',  icon: 'bug' },
  { key: 'other',        label: 'Other',         icon: 'ellipsis-horizontal' },
];

export default function SubProposalCreatorScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [step, setStep] = useState(1);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Step 1
  const [gcId, setGcId] = useState(null);
  const [trade, setTrade] = useState(null);
  const [customTrade, setCustomTrade] = useState('');

  // Step 2
  const [scope, setScope] = useState('');

  // Step 3
  const [amount, setAmount] = useState('');
  const [timelineDays, setTimelineDays] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const pickerBusyRef = useRef(false);
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listMyContractors();
      setContractors(list);
    } catch (e) {
      Alert.alert(t('subProposalCreator.couldNotLoadContractors'), e.message || t('subProposalCreator.tryAgain'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tradeLabel = (() => {
    if (trade === 'other' && customTrade.trim()) return customTrade.trim();
    return TRADES.find((t) => t.key === trade)?.label || customTrade.trim() || '';
  })();

  const canStep2 = !!gcId && !!tradeLabel;
  const canStep3 = !!scope.trim();

  // ─── Attachments ──────────────────────────────────────────────────
  const addPickedFile = async (asset, mimeFallback) => {
    if (!asset?.uri) return;
    const assetSize = asset.size || asset.fileSize || 0;
    if (assetSize > MAX_FILE_BYTES) {
      Alert.alert(
        t('subProposalCreator.fileTooLargeTitle'),
        t('subProposalCreator.fileTooLargeBody', {
          name: asset.name || asset.fileName || t('subProposalCreator.thisFile'),
          size: (assetSize / 1024 / 1024).toFixed(1),
        }),
      );
      return;
    }
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const isImage = (asset.mimeType || mimeFallback || '').startsWith('image/');
      let overTotal = false;
      setPendingAttachments((prev) => {
        // prev is always current here, so the running total stays correct even
        // across the await loop of a multi-file pick.
        const usedBytes = prev.reduce((sum, a) => sum + (a.size || 0), 0);
        if (usedBytes + assetSize > MAX_TOTAL_BYTES) {
          overTotal = true;
          return prev;
        }
        return [...prev, {
          localId: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          uri: asset.uri,
          name: asset.name || asset.fileName || `attachment-${Date.now()}.${isImage ? 'jpg' : 'pdf'}`,
          mime: asset.mimeType || mimeFallback || 'application/pdf',
          size: assetSize || null,
          base64,
          attachment_type: isImage ? 'photo' : 'spec',
        }];
      });
      if (overTotal) {
        Alert.alert(
          t('subProposalCreator.tooManyFilesTitle'),
          t('subProposalCreator.tooManyFilesBody'),
        );
      }
    } catch (e) {
      Alert.alert(t('subProposalCreator.couldNotReadFile'), e.message);
    }
  };

  const pickFile = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (!result.canceled) for (const a of (result.assets || [])) await addPickedFile(a);
    } catch (e) {
      Alert.alert(t('subProposalCreator.couldNotPickFile'), e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const pickPhoto = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: 0,
      });
      if (!result.canceled) for (const a of (result.assets || [])) await addPickedFile(a, 'image/jpeg');
    } catch (e) {
      Alert.alert(t('subProposalCreator.couldNotPickPhoto'), e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const removePending = (localId) =>
    setPendingAttachments((prev) => prev.filter((a) => a.localId !== localId));

  // ─── Submit ───────────────────────────────────────────────────────
  const handleSend = async () => {
    if (submittingRef.current) return;
    // Strip $, commas, spaces and locale formatting; round to whole cents so the
    // value we submit is exactly the value we show in the confirmation alert.
    const amt = Math.round(Number(String(amount).replace(/[^0-9.]/g, '')) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert(t('subProposalCreator.addAnAmountTitle'), t('subProposalCreator.addAnAmountBody'));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await api.sendProposal({
        gc_user_id: gcId,
        trade: tradeLabel,
        scope_summary: scope.trim(),
        amount: amt,
        timeline_days: timelineDays ? Number(timelineDays) : null,
        exclusions: exclusions.trim() || null,
        notes: notes.trim() || null,
      });

      // Upload attachments (if any) using the same bid_request_id we just got back
      const bidRequestId = result.bid_request?.id;
      const failures = [];
      if (bidRequestId && pendingAttachments.length > 0) {
        for (const att of pendingAttachments) {
          try {
            await api.uploadSubBidAttachment(bidRequestId, {
              file_base64: att.base64,
              file_name: att.name,
              file_mime: att.mime,
              file_size_bytes: att.size,
              attachment_type: att.attachment_type,
            });
          } catch (e) {
            failures.push({ name: att.name, error: e.message || 'upload error' });
          }
        }
      }

      if (failures.length) {
        const header = t(
          failures.length === 1
            ? 'subProposalCreator.proposalSentSomeFailedHeaderOne'
            : 'subProposalCreator.proposalSentSomeFailedHeaderOther',
          { amount: `$${amt.toLocaleString()}`, count: failures.length },
        );
        const list = failures.map((f) => `• ${f.name}: ${f.error}`).join('\n');
        Alert.alert(
          t('subProposalCreator.proposalSentSomeFailedTitle'),
          `${header}\n\n${list}`,
          [{ text: t('subProposalCreator.ok'), onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert(
          t('subProposalCreator.proposalSentTitle'),
          t('subProposalCreator.proposalSentBody', { amount: `$${amt.toLocaleString()}`, trade: tradeLabel }),
          [{ text: t('subProposalCreator.ok'), onPress: () => navigation.goBack() }],
        );
      }
    } catch (e) {
      Alert.alert(t('subProposalCreator.couldNotSend'), e.message || t('subProposalCreator.tryAgain'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('subProposalCreator.headerTitle')}</Text>
          <Text style={styles.headerSub}>{t('subProposalCreator.stepOf', { step })}</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.stepBar}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[styles.stepDot, { backgroundColor: n <= step ? SUB_VIOLET : Colors.border }]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Step 1 — Contractor + trade */}
        {step === 1 && (
          <>
            {contractors.length === 0 ? (
              <View style={styles.emptyContractors}>
                <Ionicons name="business-outline" size={32} color={Colors.secondaryText} />
                <Text style={styles.emptyContractorsTitle}>{t('subProposalCreator.noContractorsTitle')}</Text>
                <Text style={styles.emptyContractorsBody}>
                  {t('subProposalCreator.noContractorsBody')}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>{t('subProposalCreator.sendTo')}</Text>
                {contractors.map((c) => {
                  const isSel = gcId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.contractorCard,
                        isSel && { borderColor: SUB_VIOLET, backgroundColor: SUB_VIOLET + '08' },
                      ]}
                      onPress={() => setGcId(c.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.contractorAvatar, { backgroundColor: isSel ? SUB_VIOLET : Colors.background }]}>
                        <Text style={[styles.contractorAvatarText, { color: isSel ? '#fff' : Colors.primaryText }]}>
                          {(c.business_name || 'G').slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.contractorName} numberOfLines={1}>
                          {c.business_name || t('subProposalCreator.contractorFallback')}
                        </Text>
                        {c.business_email ? (
                          <Text style={styles.contractorMeta} numberOfLines={1}>{c.business_email}</Text>
                        ) : null}
                      </View>
                      {isSel && <Ionicons name="checkmark-circle" size={22} color={SUB_VIOLET} />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={[styles.label, { marginTop: 22 }]}>{t('subProposalCreator.whatKindOfWork')}</Text>
            <View style={styles.tradeGrid}>
              {TRADES.map((t) => {
                const isActive = trade === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.tradeChip,
                      isActive && { backgroundColor: SUB_VIOLET, borderColor: SUB_VIOLET },
                    ]}
                    onPress={() => setTrade(t.key)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={t.icon} size={15} color={isActive ? '#fff' : Colors.primaryText} />
                    <Text style={[styles.tradeChipText, isActive && { color: '#fff', fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {trade === 'other' && (
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                placeholder={t('subProposalCreator.whatTradePlaceholder')}
                placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                value={customTrade}
                onChangeText={setCustomTrade}
                autoCapitalize="words"
              />
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, !canStep2 && { opacity: 0.5 }]}
              onPress={() => setStep(2)}
              disabled={!canStep2}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>{t('common:buttons.continue')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </>
        )}

        {/* Step 2 — Scope */}
        {step === 2 && (
          <>
            <Text style={styles.label}>{t('subProposalCreator.whatYoureProposing')}</Text>
            <Text style={styles.hint}>
              {t('subProposalCreator.scopeHint')}
            </Text>
            <TextInput
              style={[styles.textInput, styles.scopeBox]}
              multiline
              value={scope}
              onChangeText={setScope}
              placeholder={t('subProposalCreator.scopePlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
            />

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
                <Text style={styles.secondaryBtnText}>{t('common:buttons.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, !canStep3 && { opacity: 0.5 }]}
                onPress={() => setStep(3)}
                disabled={!canStep3}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>{t('subProposalCreator.setPrice')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 3 — Price + attachments + send */}
        {step === 3 && (
          <>
            <Text style={styles.label}>{t('subProposalCreator.bidAmount')}</Text>
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

            <Text style={styles.label}>{t('subProposalCreator.timelineDays')}</Text>
            <TextInput
              style={styles.textInput}
              placeholder={t('subProposalCreator.timelinePlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={timelineDays}
              onChangeText={setTimelineDays}
              keyboardType="numeric"
            />

            <Text style={styles.label}>{t('subProposalCreator.exclusionsOptional')}</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              placeholder={t('subProposalCreator.exclusionsPlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={exclusions}
              onChangeText={setExclusions}
              multiline
            />

            <Text style={styles.label}>{t('subProposalCreator.notesOptional')}</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              placeholder={t('subProposalCreator.notesPlaceholder')}
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <Text style={styles.label}>{t('subProposalCreator.attachFilesOptional')}</Text>
            <View style={styles.attachBtnRow}>
              <TouchableOpacity style={styles.attachBtn} onPress={pickFile} activeOpacity={0.7}>
                <Ionicons name="document-attach-outline" size={18} color={Colors.primaryText} />
                <Text style={styles.attachBtnText}>{t('subProposalCreator.pickAFile')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachBtn} onPress={pickPhoto} activeOpacity={0.7}>
                <Ionicons name="images-outline" size={18} color={Colors.primaryText} />
                <Text style={styles.attachBtnText}>{t('subProposalCreator.pickPhotos')}</Text>
              </TouchableOpacity>
            </View>

            {pendingAttachments.length > 0 && (
              <View style={{ marginTop: 4 }}>
                {pendingAttachments.map((a) => {
                  const isImage = a.mime?.startsWith('image/');
                  return (
                    <View key={a.localId} style={styles.attachItem}>
                      {isImage ? (
                        <Image source={{ uri: a.uri }} style={styles.attachThumb} />
                      ) : (
                        <View style={[styles.attachThumb, styles.attachThumbDoc]}>
                          <Ionicons name="document-text-outline" size={20} color={Colors.primaryText} />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.attachName} numberOfLines={1}>{a.name}</Text>
                        <Text style={styles.attachMeta}>
                          {isImage ? t('subProposalCreator.photo') : t('subProposalCreator.document')}
                          {a.size ? ` · ${(a.size / 1024).toFixed(0)} KB` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removePending(a.localId)}>
                        <Ionicons name="close-circle" size={22} color={Colors.secondaryText} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(2)}
                activeOpacity={0.7}
                disabled={submitting}
              >
                <Text style={styles.secondaryBtnText}>{t('common:buttons.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, submitting && { opacity: 0.6 }]}
                onPress={handleSend}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{t('subProposalCreator.sendProposal')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  stepBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingVertical: 12 },
  stepDot: { flex: 1, height: 4, borderRadius: 2 },
  scroll: { padding: 18, paddingBottom: 60 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: Colors.secondaryText, marginTop: -4, marginBottom: 8, lineHeight: 18 },
  textInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, fontSize: 15,
    color: Colors.primaryText, backgroundColor: Colors.cardBackground,
  },
  multilineInput: { minHeight: 70, textAlignVertical: 'top' },
  scopeBox: { minHeight: 200, textAlignVertical: 'top' },
  contractorCard: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 12, marginBottom: 8,
    backgroundColor: Colors.cardBackground,
  },
  contractorAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  contractorAvatarText: { fontSize: 15, fontWeight: '700' },
  contractorName: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  contractorMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  emptyContractors: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
    backgroundColor: Colors.cardBackground, borderRadius: 14,
    gap: 6, borderWidth: 1, borderColor: Colors.border,
  },
  emptyContractorsTitle: { fontSize: 15, fontWeight: '600', color: Colors.primaryText, marginTop: 8 },
  emptyContractorsBody: { fontSize: 13, color: Colors.secondaryText, textAlign: 'center', lineHeight: 19 },
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  tradeChipText: { fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: SUB_VIOLET, borderRadius: 14, paddingVertical: 16, marginTop: 24,
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, marginRight: 10, marginTop: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  secondaryBtnText: { color: Colors.primaryText, fontSize: 15, fontWeight: '600' },
  btnRow: { flexDirection: 'row' },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingHorizontal: 16, backgroundColor: Colors.cardBackground,
  },
  dollarSign: { fontSize: 26, fontWeight: '600', color: Colors.secondaryText, marginRight: 6 },
  amountInput: { flex: 1, fontSize: 26, fontWeight: '700', color: Colors.primaryText, paddingVertical: 14 },
  attachBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  attachBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.cardBackground,
  },
  attachBtnText: { color: Colors.primaryText, fontWeight: '600', fontSize: 13 },
  attachItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  attachThumb: { width: 44, height: 44, borderRadius: 8 },
  attachThumbDoc: { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  attachName: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  attachMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
});
