import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const STAGES = [
  { key: 'draft',   label: 'Draft',   color: '#94A3B8', source: 'estimates' },
  { key: 'sent',    label: 'Sent',    color: '#3B82F6', source: 'estimates' },
  { key: 'accepted',label: 'Won',     color: '#10B981', source: 'estimates' },
  { key: 'unpaid',  label: 'Unpaid',  color: '#F59E0B', source: 'invoices' },
  { key: 'partial', label: 'Partial', color: '#F97316', source: 'invoices' },
  { key: 'paid',    label: 'Paid',    color: '#10B981', source: 'invoices' },
];

export default function PipelineWidget({ pipeline, size, editMode, onPress }) {
  const estimates = pipeline?.estimates || {};
  const invoices = pipeline?.invoices || {};

  const getData = (stage) =>
    stage.source === 'estimates' ? (estimates[stage.key] || 0) : (invoices[stage.key] || 0);

  if (size === 'large') {
    return (
      <TouchableOpacity
        style={styles.containerLarge}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.7}
        disabled={editMode}
      >
        <View style={styles.topRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="funnel-outline" size={16} color="#6366F1" />
          </View>
          <Text style={styles.title}>Pipeline</Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>ESTIMATES</Text>
          <View style={styles.stageRow}>
            {STAGES.filter(s => s.source === 'estimates').map((stage) => (
              <View key={stage.key} style={styles.stageItem}>
                <View style={[styles.dot, { backgroundColor: stage.color }]} />
                <Text style={styles.stageCount}>{getData(stage)}</Text>
                <Text style={styles.stageLabel}>{stage.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>INVOICES</Text>
          <View style={styles.stageRow}>
            {STAGES.filter(s => s.source === 'invoices').map((stage) => (
              <View key={stage.key} style={styles.stageItem}>
                <View style={[styles.dot, { backgroundColor: stage.color }]} />
                <Text style={styles.stageCount}>{getData(stage)}</Text>
                <Text style={styles.stageLabel}>{stage.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Medium size — compact single row
  return (
    <TouchableOpacity
      style={styles.containerMedium}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.7}
      disabled={editMode}
    >
      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="funnel-outline" size={16} color="#6366F1" />
        </View>
        <View style={styles.compactStages}>
          {STAGES.map((stage) => {
            const count = getData(stage);
            if (count === 0) return null;
            return (
              <View key={stage.key} style={styles.compactItem}>
                <View style={[styles.dot, { backgroundColor: stage.color }]} />
                <Text style={styles.compactCount}>{count}</Text>
                <Text style={styles.compactLabel}>{stage.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <Text style={styles.footerLabel}>PIPELINE</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  containerMedium: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    height: '100%',
    width: '100%',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  containerLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    height: 200,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#6366F11A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionRow: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stageRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stageCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  stageLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  compactStages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  compactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  compactCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  compactLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
});
