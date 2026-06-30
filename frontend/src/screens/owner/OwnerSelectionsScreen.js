// OwnerSelectionsScreen — owner authors material selections for a project's
// client to choose from (e.g. "Kitchen tile" with 3 options). Lists existing
// selections + a create form. Pairs with the client ClientSelectionsScreen.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  blue: '#3B82F6', blueBg: '#DBEAFE',
};

const STATUS_MAP = {
  pending: { bg: C.amberLight, text: C.amberText, label: 'AWAITING CLIENT' },
  selected: { bg: C.blueBg, text: C.blue, label: 'CLIENT PICKED' },
  confirmed: { bg: C.greenBg, text: C.greenText, label: 'CONFIRMED' },
};

async function ownerFetch(path, options = {}) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch(`${BACKEND_URL}/api/portal-admin${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function OwnerSelectionsScreen({ route, navigation }) {
  const { t } = useTranslation('owner');
  const { projectId, projectName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selections, setSelections] = useState([]);
  const [client, setClient] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create-form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState([{ name: '', price: '' }, { name: '', price: '' }]);

  const load = useCallback(async () => {
    try {
      const data = await ownerFetch(`/projects/${projectId}/materials`);
      setSelections(data?.selections || []);
      setClient(data?.client || null);
    } catch (e) {
      console.error('[OwnerSelections] load error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateOption = (i, key, val) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [key]: val } : o)));
  const addOption = () => setOptions((prev) => [...prev, { name: '', price: '' }]);
  const removeOption = (i) =>
    setOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));

  const resetForm = () => {
    setTitle(''); setDescription('');
    setOptions([{ name: '', price: '' }, { name: '', price: '' }]);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!client?.id) {
      Alert.alert(t('ownerSelections.alertNoClientTitle'), t('ownerSelections.alertNoClientBody'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('ownerSelections.alertTitleRequiredTitle'), t('ownerSelections.alertTitleRequiredBody'));
      return;
    }
    const cleanOptions = options
      .map((o) => {
        const name = o.name.trim();
        const priceNum = o.price !== '' ? Number(o.price) : null;
        return name ? { name, ...(priceNum != null && !Number.isNaN(priceNum) ? { price: priceNum } : {}) } : null;
      })
      .filter(Boolean);
    if (cleanOptions.length < 2) {
      Alert.alert(t('ownerSelections.alertAddOptionsTitle'), t('ownerSelections.alertAddOptionsBody'));
      return;
    }
    try {
      setSubmitting(true);
      await ownerFetch('/materials', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          clientId: client.id,
          title: title.trim(),
          description: description.trim() || undefined,
          options: cleanOptions,
        }),
      });
      resetForm();
      Alert.alert(
        t('ownerSelections.alertSentTitle'),
        t('ownerSelections.alertSentBody', { clientName: client.name || t('ownerSelections.yourClient') }),
      );
      load();
    } catch (e) {
      Alert.alert(t('ownerSelections.alertCreateErrorTitle'), e?.message || t('ownerSelections.alertCreateErrorBody'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderSelection = (sel) => {
    const st = STATUS_MAP[sel.status] || STATUS_MAP.pending;
    const opts = Array.isArray(sel.options) ? sel.options : [];
    const picked = sel.selected_option_index != null ? opts[sel.selected_option_index] : null;
    return (
      <View key={sel.id} testID={`ownerSelections.row.${sel.id}`} style={styles.card}>
        <View style={styles.cardHead}>
          <Text testID={`ownerSelections.rowTitle.${sel.id}`} style={styles.cardTitle} numberOfLines={1}>{sel.title}</Text>
          <View style={[styles.pill, { backgroundColor: st.bg }]}>
            <Text testID={`ownerSelections.rowStatus.${sel.id}`} style={[styles.pillText, { color: st.text }]}>{t(`ownerSelections.status.${sel.status}`)}</Text>
          </View>
        </View>
        {sel.description ? <Text style={styles.cardDesc}>{sel.description}</Text> : null}
        <Text style={styles.cardMeta}>
          {opts.length === 1 ? t('ownerSelections.cardMetaOneOption') : t('ownerSelections.cardMetaOptions', { count: opts.length })}
          {picked ? t('ownerSelections.cardMetaClientPicked', { name: picked.name || picked.title || `#${sel.selected_option_index + 1}` }) : ''}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity testID="ownerSelections.backButton" accessibilityLabel="Go back" onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text testID="ownerSelections.headerTitle" style={styles.headerTitle}>{t('ownerSelections.headerTitle')}</Text>
            {projectName ? <Text testID="ownerSelections.headerSubtitle" style={styles.headerSub} numberOfLines={1}>{projectName}</Text> : null}
          </View>
          <TouchableOpacity testID="ownerSelections.toggleFormButton" accessibilityLabel={showForm ? 'Close new selection form' : 'New selection'} onPress={() => setShowForm((s) => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={showForm ? 'close' : 'add'} size={26} color={C.amber} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{t('ownerSelections.formTitle')}</Text>
              {!client?.id && (
                <Text style={styles.warnText}>{t('ownerSelections.warnNoClient')}</Text>
              )}
              <Text style={styles.label}>{t('ownerSelections.labelTitle')}</Text>
              <TextInput
                testID="ownerSelections.titleInput"
                accessibilityLabel="Selection title"
                style={styles.input}
                placeholder={t('ownerSelections.placeholderTitle')}
                placeholderTextColor={C.textMuted}
                value={title}
                onChangeText={setTitle}
              />
              <Text style={styles.label}>{t('ownerSelections.labelDescription')}</Text>
              <TextInput
                testID="ownerSelections.descriptionInput"
                accessibilityLabel="Selection description"
                style={[styles.input, styles.inputMulti]}
                placeholder={t('ownerSelections.placeholderDescription')}
                placeholderTextColor={C.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <Text style={styles.label}>{t('ownerSelections.labelOptions')}</Text>
              {options.map((o, i) => (
                <View key={i} testID={`ownerSelections.optionRow.${i}`} style={styles.optionRow}>
                  <TextInput
                    testID={`ownerSelections.optionNameInput.${i}`}
                    accessibilityLabel={`Option ${i + 1} name`}
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('ownerSelections.optionNamePlaceholder', { number: i + 1 })}
                    placeholderTextColor={C.textMuted}
                    value={o.name}
                    onChangeText={(v) => updateOption(i, 'name', v)}
                  />
                  <TextInput
                    testID={`ownerSelections.optionPriceInput.${i}`}
                    accessibilityLabel={`Option ${i + 1} price`}
                    style={[styles.input, styles.priceInput]}
                    placeholder='$'
                    placeholderTextColor={C.textMuted}
                    value={o.price}
                    onChangeText={(v) => updateOption(i, 'price', v.replace(/[^0-9.]/g, ''))}
                    keyboardType='decimal-pad'
                  />
                  <TouchableOpacity testID={`ownerSelections.removeOptionButton.${i}`} accessibilityLabel={`Remove option ${i + 1}`} onPress={() => removeOption(i)} disabled={options.length <= 2} style={styles.removeBtn}>
                    <Ionicons name="remove-circle-outline" size={22} color={options.length <= 2 ? C.textMuted : C.red || '#EF4444'} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity testID="ownerSelections.addOptionButton" accessibilityLabel="Add option" onPress={addOption} style={styles.addOptionBtn}>
                <Ionicons name="add" size={18} color={C.amber} />
                <Text style={styles.addOptionText}>{t('ownerSelections.addOption')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="ownerSelections.submitButton"
                accessibilityLabel="Send to client"
                style={[styles.createBtn, (submitting || !client?.id) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={submitting || !client?.id}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>{t('ownerSelections.sendToClient')}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={C.amber} style={{ marginTop: 40 }} />
          ) : selections.length === 0 && !showForm ? (
            <View style={styles.empty}>
              <Ionicons name="color-palette-outline" size={40} color={C.textMuted} />
              <Text style={styles.emptyTitle}>{t('ownerSelections.emptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('ownerSelections.emptySub')}</Text>
            </View>
          ) : (
            selections.map(renderSelection)
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerSub: { fontSize: 12, color: C.textSec, marginTop: 1 },
  scroll: { padding: 16 },

  formCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
  warnText: { fontSize: 12, color: C.amberText, backgroundColor: C.amberLight, padding: 10, borderRadius: 8, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: C.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 12,
  },
  inputMulti: { height: 64, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  priceInput: { width: 84, marginBottom: 0 },
  removeBtn: { padding: 2 },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  addOptionText: { fontSize: 14, fontWeight: '600', color: C.amber },
  createBtn: { backgroundColor: C.amber, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  card: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  cardDesc: { fontSize: 13, color: C.textSec, marginTop: 6 },
  cardMeta: { fontSize: 12, color: C.textMuted, marginTop: 8 },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: C.textSec, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
