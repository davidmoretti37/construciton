/**
 * SubcontractorsScreen — GC-side list of subcontractors.
 *
 * Sibling section under the Team area (Workers / Supervisors / Subcontractors).
 * Each row shows: name, trade, compliance health dot, last engagement date.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, SafeAreaView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';
import TeamFilterAndSearch from '../components/TeamFilterAndSearch';

export default function SubcontractorsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('subcontractors');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api.listSubs();
      setSubs(list);
    } catch (e) {
      console.warn('[SubcontractorsScreen] load:', e.message);
      Alert.alert('Could not load subs', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Apply search
  const term = search.trim().toLowerCase();
  const visible = !term
    ? subs
    : subs.filter((s) =>
        (s.legal_name || '').toLowerCase().includes(term)
        || (s.dba || '').toLowerCase().includes(term)
        || (s.trades || []).join(' ').toLowerCase().includes(term)
      );

  const renderItem = ({ item }) => {
    const lastEng = (item.engagements || []).sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''))[0];
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('SubcontractorDetail', { sub_organization_id: item.id })}
      >
        <View style={[styles.avatar, { backgroundColor: Colors.primaryBlue }]}>
          <Text style={styles.avatarText}>
            {(item.legal_name || 'S').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name}>{item.legal_name}</Text>
          <Text style={styles.meta}>
            {(item.trades || []).join(', ') || '—'}
            {lastEng ? ` · ${lastEng.status}` : ''}
          </Text>
        </View>
        <View style={[styles.healthDot, { backgroundColor: Colors.successGreen }]} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Team</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: Colors.primaryBlue }]}
          onPress={() => navigation.navigate('AddSubcontractor')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add sub</Text>
        </TouchableOpacity>
      </View>

      <TeamFilterAndSearch
        value={filter}
        onChange={(k) => {
          setFilter(k);
          if (k === 'workers') navigation.replace('Workers');
          if (k === 'supervisors') navigation.replace?.('Supervisors');
          if (k === 'all') navigation.replace?.('Workers');
          // 'subcontractors' stays here
        }}
        searchValue={search}
        onSearchChange={setSearch}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={Colors.secondaryText} />
              <Text style={styles.emptyText}>No subcontractors yet.</Text>
              <Text style={styles.emptySub}>Tap "Add sub" to invite your first one.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          contentContainerStyle={visible.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  heading: { fontSize: 28, fontWeight: '700', color: Colors.primaryText },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    paddingVertical: 12, paddingHorizontal: 16,
    marginHorizontal: 12, marginVertical: 4, borderRadius: 12,
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: Colors.primaryText },
  meta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: Colors.primaryText, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 13, color: Colors.secondaryText, marginTop: 6, textAlign: 'center' },
});
