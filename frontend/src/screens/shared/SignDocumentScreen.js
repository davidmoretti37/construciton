import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView, Alert, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, getColors } from '../../constants/theme';
import SignaturePad from '../../components/SignaturePad';
import { API_URL } from '../../config/api';

/**
 * In-app signing screen. Used when the owner deep-links into the app from a
 * push notification or QR code with a single-use signing token. Customers
 * normally sign on the Next.js web portal instead.
 *
 * Route param: { token }
 */
export default function SignDocumentScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const token = route.params?.token;

  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setError('Missing signing token'); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/esign/sign/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Status ${res.status}`);
        setCtx(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleConfirm = async (pngBase64) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/esign/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signaturePngBase64: pngBase64, signerName: ctx?.signerName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record signature');
      Alert.alert(
        t('esign.signed_title', 'Signed'),
        t('esign.signed_body', 'Thank you. The signed document has been saved.'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert(t('common.error', 'Error'), err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    Alert.alert(
      t('esign.decline_title', 'Decline to sign'),
      t('esign.decline_body', 'Are you sure you want to decline?'),
      [
        { text: t('common.no', 'No'), style: 'cancel' },
        {
          text: t('common.yes', 'Yes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/esign/decline/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              navigation.goBack();
            } catch (err) {
              Alert.alert(t('common.error', 'Error'), err.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryText} />
      </SafeAreaView>
    );
  }

  if (error || !ctx || ctx.status !== 'pending') {
    const msg = error || (ctx?.status === 'expired' ? 'This signing link has expired.' :
                          ctx?.status === 'consumed' ? 'This link has already been used.' :
                          ctx?.status === 'signed' ? 'This document has already been signed.' :
                          'Signing link is no longer valid.');
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.secondaryText} />
        <Text style={[styles.bigText, { color: Colors.primaryText }]}>{msg}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btnCloseBig}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.close', 'Close')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { borderColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {t('esign.review_title', 'Review & sign')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[styles.docTitle, { color: Colors.primaryText }]}>{ctx.documentTitle || ctx.documentType}</Text>

        {ctx.originalPdfUrl ? (
          <View style={[styles.pdfBox, { borderColor: Colors.border }]}>
            <WebView
              source={{ uri: ctx.originalPdfUrl }}
              style={{ flex: 1, height: 480 }}
              originWhitelist={['*']}
            />
          </View>
        ) : (
          <Text style={[styles.subtle, { color: Colors.secondaryText }]}>{t('esign.preview_unavailable', 'Document preview unavailable.')}</Text>
        )}

        <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('esign.sign_below', 'Sign below')}</Text>
        <SignaturePad onConfirm={handleConfirm} onCancel={handleDecline} />

        <TouchableOpacity onPress={handleDecline} style={styles.declineBtn} disabled={submitting}>
          <Text style={[styles.declineText, { color: '#DC2626' }]}>{t('esign.decline_to_sign', 'Decline to sign')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bigText: { fontSize: 16, textAlign: 'center', marginTop: 12, marginBottom: 24 },
  btnCloseBig: { backgroundColor: '#1E40AF', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  docTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  pdfBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  subtle: { fontSize: 13, marginBottom: 12 },
  declineBtn: { alignItems: 'center', marginTop: 18 },
  declineText: { fontSize: 13, fontWeight: '600' },
});
