/**
 * SubUploadPage — upload a compliance document.
 *
 * Two ways to land here:
 *   1. From the in-app inbox/Documents tab: route.params has
 *      { docType, actionTokenId? } and the user is authenticated.
 *   2. Magic-link URL ?t=<token>: token redeems server-side, returns
 *      sub_organization + doc_type, then we use the public upload endpoint.
 *
 * Picks a file (camera or PDF), reads as base64, uploads via the appropriate
 * endpoint. On success, navigates back to Home / shows confirmation.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  SafeAreaView, ScrollView, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';
import { useTranslation } from 'react-i18next';

const DOC_TYPE_LABELS = {
  w9: 'IRS Form W-9',
  coi_gl: 'General Liability COI',
  coi_wc: 'Workers Comp COI',
  coi_auto: 'Commercial Auto COI',
  coi_umbrella: 'Umbrella COI',
  ai_endorsement: 'Additional Insured Endorsement',
  waiver_subrogation: 'Waiver of Subrogation',
  license_state: 'State Contractor License',
  license_business: 'Business License',
  drug_policy: 'Drug Testing Policy',
  msa: 'Master Subcontract Agreement',
};

export default function SubUploadPage({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);
  const { t } = useTranslation('common');

  // In-app params take precedence; magic-link path uses ?t=<token> on web.
  // On native, `window` exists but `window.location` doesn't — guard both.
  const inAppDocType = route?.params?.docType || null;
  const inAppActionTokenId = route?.params?.actionTokenId || null;
  let webToken = null;
  if (typeof window !== 'undefined' && window?.location?.search) {
    try { webToken = new URLSearchParams(window.location.search).get('t'); }
    catch (_) { webToken = null; }
  }
  const tokenParam = route?.params?.token || webToken;
  const isInApp = !!inAppDocType;

  const [magicInfo, setMagicInfo] = useState(null);
  const [subOrg, setSubOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [expiresError, setExpiresError] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [done, setDone] = useState(false);

  const init = useCallback(async () => {
    try {
      if (isInApp) {
        const me = await api.getMe();
        setSubOrg(me.sub_organization);
      } else if (tokenParam) {
        const info = await api.redeemActionToken(tokenParam);
        setMagicInfo(info);
      }
    } catch (e) {
      Alert.alert(t('subUploadPage.couldNotLoad'), e.message || t('subUploadPage.tryAgain'));
    } finally {
      setLoading(false);
    }
  }, [isInApp, tokenParam]);

  useEffect(() => { init(); }, [init]);

  const docType = inAppDocType || magicInfo?.doc_type_requested;
  const docLabel = DOC_TYPE_LABELS[docType] || docType || t('subUploadPage.documentFallback');
  const orgName = subOrg?.legal_name || magicInfo?.sub_organization?.legal_name;

  const pickerBusyRef = useRef(false);

  const onPickFile = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setPickedFile(result.assets?.[0]);
    } catch (e) {
      const stuck = /Different document picking in progress|Await other document/.test(e?.message || '');
      Alert.alert(stuck ? t('subUploadPage.iosPickerStuck') : t('subUploadPage.couldNotPickFile'),
        stuck ? t('subUploadPage.reloadToClear') : e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const onTakePhoto = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('subUploadPage.cameraPermissionNeeded'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setPickedFile({
        uri: asset.uri,
        name: `${docType || 'doc'}-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
    } catch (e) {
      Alert.alert(t('subUploadPage.cameraError'), e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const onUpload = async () => {
    if (!pickedFile) {
      Alert.alert(t('subUploadPage.pickFileFirst'));
      return;
    }
    // Validate optional expiry: must be a real YYYY-MM-DD date if provided.
    if (expiresAt) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiresAt.trim());
      const d = m ? new Date(expiresAt.trim()) : null;
      const valid = m && d && !Number.isNaN(d.getTime()) &&
        d.getUTCFullYear() === Number(m[1]) &&
        d.getUTCMonth() + 1 === Number(m[2]) &&
        d.getUTCDate() === Number(m[3]);
      if (!valid) {
        setExpiresError(t('subUploadPage.expiresFormatError'));
        return;
      }
    }
    setExpiresError('');
    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(pickedFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (isInApp) {
        if (!subOrg?.id) throw new Error(t('subUploadPage.noSubOrgLinked'));
        await api.uploadDocumentBlob({
          sub_organization_id: subOrg.id,
          doc_type: docType,
          file_name: pickedFile.name,
          file_mime: pickedFile.mimeType || 'application/pdf',
          file_base64: base64,
          expires_at: expiresAt || null,
          policy_number: policyNumber || null,
          action_token_id: inAppActionTokenId || null,
        });
      } else {
        // Magic-link path — public endpoint, requires file_url. Not fully
        // wired in v1 (server-side blob accept for unauth). Surface a clear
        // message rather than silently fail.
        throw new Error(t('subUploadPage.publicLinkNotSupported'));
      }
      setDone(true);
    } catch (e) {
      Alert.alert(t('subUploadPage.uploadFailed'), e.message || t('subUploadPage.unknownError'));
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  if (!isInApp && !magicInfo) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.errorRed} />
        <Text style={styles.errorTitle}>{t('subUploadPage.linkInvalidOrExpired')}</Text>
        <Text style={styles.errorBody}>{t('subUploadPage.askContractorNewLink')}</Text>
      </SafeAreaView>
    );
  }

  // Magic-link path: public/unauthenticated upload isn't wired in v1. Don't
  // render the picker + Upload button (it would always fail) — show guidance.
  if (!isInApp) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="lock-closed-outline" size={48} color={Colors.primaryBlue} />
        <Text style={styles.successTitle}>{t('subUploadPage.openSylkToUpload')}</Text>
        <Text style={styles.successBody}>
          {orgName
            ? t('subUploadPage.openSylkBodyWithOrg', { docLabel, orgName })
            : t('subUploadPage.openSylkBody', { docLabel })}
        </Text>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="checkmark-circle" size={72} color={Colors.successGreen} />
        <Text style={styles.successTitle}>{t('subUploadPage.uploaded')}</Text>
        <Text style={styles.successBody}>{t('subUploadPage.contractorWillSee')}</Text>
        {navigation && (
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 24, paddingHorizontal: 32 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.primaryBtnText}>{t('common:buttons.done')}</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{t('subUploadPage.headingUpload', { docLabel })}</Text>
          {orgName ? <Text style={styles.subheading}>{t('subUploadPage.subheadingFor', { orgName })}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {pickedFile ? (
          <View style={styles.filePicked}>
            <Ionicons name="document-text" size={26} color={Colors.primaryBlue} />
            <Text style={styles.fileName} numberOfLines={1}>{pickedFile.name}</Text>
            <TouchableOpacity onPress={() => setPickedFile(null)}>
              <Ionicons name="close-circle" size={22} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pickerRow}>
            <TouchableOpacity style={styles.pickerBtn} onPress={onTakePhoto} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={26} color={Colors.primaryText} />
              <Text style={styles.pickerBtnText}>{t('subUploadPage.takePhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerBtn} onPress={onPickFile} activeOpacity={0.7}>
              <Ionicons name="document-attach-outline" size={26} color={Colors.primaryText} />
              <Text style={styles.pickerBtnText}>{t('subUploadPage.pickPdf')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>{t('subUploadPage.expirationDate')}</Text>
        <TextInput
          style={[styles.input, expiresError && styles.inputError]}
          value={expiresAt}
          onChangeText={(t) => { setExpiresAt(t); if (expiresError) setExpiresError(''); }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.placeholder || '#9CA3AF'}
          autoCapitalize="none"
        />
        {expiresError ? <Text style={styles.fieldError}>{expiresError}</Text> : null}

        <Text style={styles.label}>{t('subUploadPage.policyNumber')}</Text>
        <TextInput
          style={styles.input}
          value={policyNumber}
          onChangeText={setPolicyNumber}
          placeholder={t('subUploadPage.policyPlaceholder')}
          placeholderTextColor={Colors.placeholder || '#9CA3AF'}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          style={[styles.primaryBtn, (!pickedFile || uploading) && { opacity: 0.5 }]}
          onPress={onUpload}
          disabled={!pickedFile || uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('subUploadPage.upload')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const SUB_VIOLET = '#8B5CF6';

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  heading: { fontSize: 20, fontWeight: '700', color: Colors.primaryText },
  subheading: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  scroll: { padding: 18, paddingBottom: 40 },
  pickerRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  pickerBtn: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  pickerBtnText: { color: Colors.primaryText, fontWeight: '600', fontSize: 14 },
  filePicked: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground,
    padding: 14, borderRadius: 12, marginBottom: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  fileName: { flex: 1, color: Colors.primaryText, fontSize: 14, fontWeight: '500' },
  label: { fontSize: 13, color: Colors.secondaryText, marginBottom: 6, marginTop: 12, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 14, fontSize: 15,
    backgroundColor: Colors.cardBackground, color: Colors.primaryText,
  },
  inputError: { borderColor: Colors.errorRed },
  fieldError: { fontSize: 12, color: Colors.errorRed, marginTop: 6 },
  primaryBtn: {
    backgroundColor: SUB_VIOLET, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 28,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryText, marginTop: 16 },
  errorBody: { fontSize: 14, color: Colors.secondaryText, marginTop: 6, textAlign: 'center' },
  successTitle: { fontSize: 24, fontWeight: '700', color: Colors.primaryText, marginTop: 18 },
  successBody: { fontSize: 14, color: Colors.secondaryText, marginTop: 8, textAlign: 'center' },
});
