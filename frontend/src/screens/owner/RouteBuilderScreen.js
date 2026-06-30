/**
 * RouteBuilderScreen — Owner builds daily routes by assigning visits to ordered stops
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { fetchDailyVisits } from '../../utils/storage/serviceVisits';
import { createRoute, addStop } from '../../utils/storage/serviceRoutes';

export default function RouteBuilderScreen({ route: navRoute }) {
  const { route_date: paramDate } = navRoute.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { t } = useTranslation('owner');

  // Tomorrow as default
  const defaultDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [date, setDate] = useState(paramDate || defaultDate);
  const [routeName, setRouteName] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [available, setAvailable] = useState([]);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load workers
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('workers')
        .select('id, full_name, trade')
        .eq('owner_id', user.id)
        .eq('status', 'active')
        .order('full_name');
      setWorkers(data || []);
    })();
  }, []);

  // Load unrouted visits for date
  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDailyVisits(date);
      setAvailable(data?.unrouted || []);
      setStops([]);
      if (!routeName) setRouteName(t('routeBuilder.defaultRouteName', { date: formatDate(date) }));
    } catch (e) {
      console.error('[RouteBuilder] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const changeDate = (offset) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    const newDate = d.toISOString().split('T')[0];
    setDate(newDate);
    setRouteName(t('routeBuilder.defaultRouteName', { date: formatDate(newDate) }));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const addToRoute = (visit) => {
    setAvailable(prev => prev.filter(v => v.id !== visit.id));
    setStops(prev => [...prev, { ...visit, stop_order: prev.length + 1 }]);
  };

  const removeFromRoute = (visit) => {
    setStops(prev => {
      const filtered = prev.filter(v => v.id !== visit.id);
      return filtered.map((v, i) => ({ ...v, stop_order: i + 1 }));
    });
    setAvailable(prev => [...prev, visit]);
  };

  const moveStop = (index, direction) => {
    const newStops = [...stops];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newStops.length) return;
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];
    setStops(newStops.map((v, i) => ({ ...v, stop_order: i + 1 })));
  };

  const handleSave = async () => {
    if (stops.length === 0) {
      Alert.alert(t('routeBuilder.noStopsTitle'), t('routeBuilder.noStopsMessage'));
      return;
    }

    setSaving(true);
    try {
      const route = await createRoute(
        routeName || t('routeBuilder.defaultRouteName', { date: formatDate(date) }),
        date,
        selectedWorker?.id
      );

      for (const stop of stops) {
        await addStop(route.id, stop.id, stop.stop_order);
      }

      Alert.alert(t('routeBuilder.routeCreatedTitle'), t('routeBuilder.routeCreatedMessage', { count: stops.length }), [
        { text: t('routeBuilder.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(t('common:alerts.error'), t('routeBuilder.failedToCreateRoute'));
      console.error('[RouteBuilder] Save error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('routeBuilder.title')}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || stops.length === 0}
          style={[styles.saveBtn, (saving || stops.length === 0) && { opacity: 0.4 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#1E40AF" />
          ) : (
            <Text style={styles.saveBtnText}>{t('common:buttons.save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Date picker */}
        <View style={styles.datePicker}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
            <Ionicons name="chevron-back" size={20} color="#3B82F6" />
          </TouchableOpacity>
          <Text style={[styles.dateText, { color: Colors.primaryText }]}>{formatDate(date)}</Text>
          <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
            <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
          </TouchableOpacity>
        </View>

        {/* Route name */}
        <View style={[styles.inputCard, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('routeBuilder.routeNameLabel')}</Text>
          <TextInput
            style={[styles.textInput, { color: Colors.primaryText, borderColor: Colors.border }]}
            value={routeName}
            onChangeText={setRouteName}
            placeholder={t('routeBuilder.routeNamePlaceholder')}
            placeholderTextColor={Colors.secondaryText}
          />
        </View>

        {/* Worker selector */}
        <View style={[styles.inputCard, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.inputLabel, { color: Colors.secondaryText }]}>{t('routeBuilder.assignWorker')}</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: Colors.border }]}
            onPress={() => setShowWorkerPicker(!showWorkerPicker)}
          >
            <Text style={[styles.pickerText, { color: selectedWorker ? Colors.primaryText : Colors.secondaryText }]}>
              {selectedWorker ? `${selectedWorker.full_name} (${selectedWorker.trade || ''})` : t('routeBuilder.selectWorker')}
            </Text>
            <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>
          {showWorkerPicker && (
            <View style={[styles.pickerDropdown, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
              {workers.map(w => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.pickerOption, selectedWorker?.id === w.id && { backgroundColor: '#1E40AF10' }]}
                  onPress={() => { setSelectedWorker(w); setShowWorkerPicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, { color: Colors.primaryText }]}>
                    {w.full_name}
                  </Text>
                  <Text style={[styles.pickerOptionSub, { color: Colors.secondaryText }]}>{w.trade}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Route Stops */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            {t('routeBuilder.routeStops', { count: stops.length })}
          </Text>
        </View>
        {stops.length === 0 && (
          <Text style={[styles.emptyHint, { color: Colors.secondaryText }]}>
            {t('routeBuilder.addVisitsHint')}
          </Text>
        )}
        {stops.map((stop, index) => (
          <View key={stop.id} style={[styles.stopCard, { backgroundColor: Colors.cardBackground }]}>
            <View style={[styles.stopBadge, { backgroundColor: '#1E40AF' }]}>
              <Text style={styles.stopBadgeText}>{stop.stop_order}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stopName, { color: Colors.primaryText }]}>
                {stop.location_name || stop.location?.name || t('routeBuilder.unknown')}
              </Text>
              <Text style={[styles.stopAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                {stop.location_address || stop.location?.address || ''}
              </Text>
            </View>
            <View style={styles.stopActions}>
              <TouchableOpacity onPress={() => moveStop(index, -1)} disabled={index === 0}>
                <Ionicons name="chevron-up" size={20} color={index === 0 ? Colors.border : '#3B82F6'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveStop(index, 1)} disabled={index === stops.length - 1}>
                <Ionicons name="chevron-down" size={20} color={index === stops.length - 1 ? Colors.border : '#3B82F6'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeFromRoute(stop)}>
                <Ionicons name="close-circle" size={22} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Available Visits */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            {t('routeBuilder.availableVisits', { count: available.length })}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#1E40AF" />
        ) : available.length === 0 ? (
          <Text style={[styles.emptyHint, { color: Colors.secondaryText }]}>
            {t('routeBuilder.noVisitsForDate')}
          </Text>
        ) : (
          available.map(visit => (
            <TouchableOpacity
              key={visit.id}
              style={[styles.availableCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => addToRoute(visit)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.stopName, { color: Colors.primaryText }]}>
                  {visit.location_name || t('routeBuilder.unknown')}
                </Text>
                <Text style={[styles.stopAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                  {visit.location_address || ''}
                </Text>
              </View>
              <View style={[styles.addBadge, { backgroundColor: '#1E40AF' }]}>
                <Ionicons name="add" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { color: '#1E40AF', fontSize: FontSizes.body, fontWeight: '700' },
  scrollContent: { paddingHorizontal: Spacing.lg },
  datePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.sm, gap: 16, marginBottom: Spacing.md,
  },
  dateArrow: { padding: 8 },
  dateText: { fontSize: FontSizes.body, fontWeight: '600', minWidth: 120, textAlign: 'center' },
  inputCard: {
    borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: { borderWidth: 1, borderRadius: BorderRadius.sm, padding: Spacing.md, fontSize: FontSizes.small },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: BorderRadius.sm, padding: Spacing.md,
  },
  pickerText: { fontSize: FontSizes.small },
  pickerDropdown: { borderWidth: 1, borderRadius: BorderRadius.sm, marginTop: 6, overflow: 'hidden' },
  pickerOption: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  pickerOptionText: { fontSize: FontSizes.small, fontWeight: '500' },
  pickerOptionSub: { fontSize: 12 },
  sectionHeader: { marginBottom: Spacing.sm, marginTop: Spacing.md },
  sectionTitle: { fontSize: FontSizes.body, fontWeight: '700' },
  emptyHint: { fontSize: FontSizes.small, textAlign: 'center', paddingVertical: Spacing.lg },
  stopCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  stopBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stopBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stopName: { fontSize: FontSizes.small, fontWeight: '600' },
  stopAddress: { fontSize: 12, marginTop: 2 },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availableCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  addBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
});
