/**
 * AddMenuSheet — bottom sheet shown by the chat input's "+" button.
 *
 * Replaces the old separate camera + paperclip buttons. Surfaces three
 * groups of options:
 *   1. Take photo / Choose photo / Add document
 *   2. Connected integrations (loaded from /api/integrations) — tapping
 *      one signals the agent to route through that integration on the
 *      next message
 *   3. "Connect more" → opens IntegrationsScreen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { API_URL as BACKEND_URL } from '../config/api';
import { getColors, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

function IntegrationIcon({ icon, size = 22, fallbackColor = '#666' }) {
  if (typeof icon === 'string') {
    return <Ionicons name={icon} size={size} color={fallbackColor} />;
  }
  if (!icon || typeof icon !== 'object') {
    return <Ionicons name="cube-outline" size={size} color={fallbackColor} />;
  }
  const color = icon.color || fallbackColor;
  if (icon.lib === 'fa5-brand') return <FontAwesome5 name={icon.name} size={size} color={color} brand />;
  if (icon.lib === 'fa5') return <FontAwesome5 name={icon.name} size={size} color={color} solid />;
  return <Ionicons name={icon.name || 'cube-outline'} size={size} color={color} />;
}

const AddMenuSheet = ({
  visible,
  onClose,
  onTakePhoto,
  onChoosePhoto,
  onAddDocument,
  onSelectIntegration,
  onOpenIntegrations,
}) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();
  const styles = makeStyles(Colors, isDark);

  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setIntegrations([]);
        return;
      }
      const res = await fetch(`${BACKEND_URL}/api/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setIntegrations([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data?.integrations) ? data.integrations : [];
      setIntegrations(list.filter((i) => i.connected));
    } catch (e) {
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) loadIntegrations();
  }, [visible, loadIntegrations]);

  const wrap = (fn) => () => {
    onClose?.();
    setTimeout(() => fn?.(), 50);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
              <View style={styles.handle} />

              {/* Photo / file row */}
              <Row
                styles={styles}
                icon={<Ionicons name="camera-outline" size={22} color={Colors.primaryText} />}
                label="Take photo"
                onPress={wrap(onTakePhoto)}
              />
              <Row
                styles={styles}
                icon={<Ionicons name="image-outline" size={22} color={Colors.primaryText} />}
                label="Choose photo"
                onPress={wrap(onChoosePhoto)}
              />
              <Row
                styles={styles}
                icon={<Ionicons name="document-attach-outline" size={22} color={Colors.primaryText} />}
                label="Add document"
                onPress={wrap(onAddDocument)}
              />

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>Integrations</Text>

              {loading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={Colors.secondaryText} />
                </View>
              )}

              {!loading && integrations.length === 0 && (
                <Text style={styles.emptyHint}>No integrations connected yet.</Text>
              )}

              {!loading && integrations.map((integ) => (
                <Row
                  key={integ.type}
                  styles={styles}
                  icon={<IntegrationIcon icon={integ.icon} size={22} fallbackColor={Colors.primaryText} />}
                  label={`Use ${integ.name}`}
                  sublabel={integ.tagline || null}
                  onPress={wrap(() => onSelectIntegration?.(integ))}
                />
              ))}

              <Row
                styles={styles}
                icon={<Ionicons name="add-circle-outline" size={22} color={Colors.primaryBlue} />}
                label="Connect more"
                labelColor={Colors.primaryBlue}
                onPress={wrap(onOpenIntegrations)}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const Row = ({ styles, icon, label, sublabel, onPress, labelColor }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.rowIcon}>{icon}</View>
    <View style={styles.rowTextWrap}>
      <Text style={[styles.rowLabel, labelColor && { color: labelColor }]}>{label}</Text>
      {sublabel ? <Text style={styles.rowSublabel} numberOfLines={1}>{sublabel}</Text> : null}
    </View>
  </TouchableOpacity>
);

const makeStyles = (Colors, isDark) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: Colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 8,
      paddingHorizontal: 12,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? Colors.border : 'rgba(0,0,0,0.15)',
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    rowIcon: {
      width: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTextWrap: {
      flex: 1,
      marginLeft: 8,
    },
    rowLabel: {
      fontSize: 16,
      color: Colors.primaryText,
      fontWeight: '500',
    },
    rowSublabel: {
      fontSize: 12,
      color: Colors.secondaryText,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? Colors.border : 'rgba(0,0,0,0.08)',
      marginVertical: 8,
      marginHorizontal: 4,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: Colors.secondaryText,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 4,
    },
    loadingRow: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    emptyHint: {
      fontSize: 13,
      color: Colors.secondaryText,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
  });

export default AddMenuSheet;
