/**
 * TeamFilterAndSearch
 *
 * Drop-in chip-set + scoped search for Team / Schedule / Projects screens.
 * Filter chips: All / Workers / Supervisors / Subcontractors
 * Search: scoped to whichever filter is active.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';

const FILTERS = [
  { key: 'all',            label: 'All' },
  { key: 'workers',        label: 'Workers' },
  { key: 'supervisors',    label: 'Supervisors' },
  { key: 'subcontractors', label: 'Subcontractors' },
];

export default function TeamFilterAndSearch({
  value = 'all',
  onChange = () => {},
  searchValue = '',
  onSearchChange = () => {},
  showSearch = true,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);
  const [searchOpen, setSearchOpen] = useState(false);

  const onChip = useCallback((key) => onChange(key), [onChange]);

  return (
    <View style={styles.row}>
      <View style={styles.chipsWrap}>
        {FILTERS.map((f) => {
          const isActive = value === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => onChip(f.key)}
              style={[
                styles.chip,
                isActive && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue },
              ]}
            >
              <Text style={[styles.chipText, isActive && { color: '#fff' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showSearch && !searchOpen && (
        <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.searchBtn}>
          <Ionicons name="search-outline" size={20} color={Colors.secondaryText} />
        </TouchableOpacity>
      )}

      {showSearch && searchOpen && (
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.secondaryText} />
          <TextInput
            value={searchValue}
            onChangeText={onSearchChange}
            placeholder={`Search ${value === 'all' ? 'team' : value}...`}
            placeholderTextColor={Colors.placeholderText}
            style={styles.searchInput}
            autoFocus
          />
          <TouchableOpacity onPress={() => { setSearchOpen(false); onSearchChange(''); }}>
            <Ionicons name="close-circle" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  chipsWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  chipText: { fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  searchBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.cardBackground,
    borderRadius: 10, paddingHorizontal: 10, height: 38,
    borderWidth: 1, borderColor: Colors.border, minWidth: 180,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.primaryText, padding: 0 },
});
