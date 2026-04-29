import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Signature from 'react-native-signature-canvas';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, getColors } from '../constants/theme';

/**
 * Touch signature surface. Returns a PNG data-URI when the user confirms.
 *
 * Props:
 *  - onConfirm(pngBase64)  required — base64 (no data: prefix)
 *  - onCancel()            optional
 *  - height                optional, default 220
 */
export default function SignaturePad({ onConfirm, onCancel, height = 220 }) {
  const { t } = useTranslation();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const ref = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  // react-native-signature-canvas uses a WebView under the hood. Style and chrome
  // are injected as CSS to match our theme.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body, html { background: ${Colors.card || '#fff'}; }
    canvas { background: ${Colors.card || '#fff'}; }
  `;

  const handleOK = (signature) => {
    // signature is a data URL like "data:image/png;base64,...."
    const base64 = signature?.replace(/^data:image\/[a-z]+;base64,/, '');
    setSubmitting(true);
    Promise.resolve(onConfirm?.(base64)).finally(() => setSubmitting(false));
  };

  return (
    <View style={[styles.container, { borderColor: Colors.border, backgroundColor: Colors.card }]}>
      <View style={[styles.canvasWrap, { height, borderColor: Colors.border }]}>
        <Signature
          ref={ref}
          onOK={handleOK}
          onEmpty={() => {}}
          descriptionText=""
          webStyle={webStyle}
          backgroundColor={Colors.card || '#FFFFFF'}
          penColor={Colors.primaryText || '#0F172A'}
        />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={() => ref.current?.clearSignature()}
          style={[styles.btn, { borderColor: Colors.border }]}
        >
          <Text style={[styles.btnText, { color: Colors.secondaryText }]}>{t('esign.clear', 'Clear')}</Text>
        </TouchableOpacity>

        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            style={[styles.btn, { borderColor: Colors.border }]}
          >
            <Text style={[styles.btnText, { color: Colors.secondaryText }]}>{t('common.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => ref.current?.readSignature()}
          disabled={submitting}
          style={[styles.btnPrimary, { backgroundColor: '#1E40AF', opacity: submitting ? 0.7 : 1 }]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>{t('esign.confirm_signature', 'Confirm signature')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.hint, { color: Colors.secondaryText }]}>{t('esign.sign_here', 'Sign with your finger or stylus inside the box.')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  canvasWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: { fontSize: 13, fontWeight: '600' },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 8, textAlign: 'center' },
});
