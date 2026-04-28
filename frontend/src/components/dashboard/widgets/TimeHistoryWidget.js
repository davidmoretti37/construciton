import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Recent time history widget. Replaces the old collapsible dropdown — widgets
 * have fixed sizes so we always show entries, no toggle. Entries shown:
 *   medium → 2  |  large → 4
 *
 * Tap an entry to open the edit modal. State (history array, edit handlers)
 * lives in HomeScreen.
 */
export default function TimeHistoryWidget({
  entries,
  size,
  editMode,
  onEntryPress,
  Colors,
  formatHistoryDate,
  formatHoursMinutes,
}) {
  const cardBg = Colors?.white || Colors?.cardBackground || '#FFFFFF';
  const textPrimary = Colors?.primaryText || '#111827';
  const textSecondary = Colors?.secondaryText || '#6B7280';
  const borderColor = Colors?.border || '#E5E7EB';
  const accent = Colors?.primaryBlue || '#1E40AF';

  const limit = size === 'large' ? 4 : 2;
  const list = (entries || []).slice(0, limit);

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]} pointerEvents={editMode ? 'none' : 'auto'}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={16} color={textSecondary} />
        <Text style={[styles.headerLabel, { color: textSecondary }]}>Recent Time</Text>
      </View>

      {list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>No time records yet</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {list.map((entry, idx) => (
            <TouchableOpacity
              key={entry.id}
              style={[
                styles.row,
                idx < list.length - 1 && { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
              activeOpacity={0.7}
              disabled={editMode}
              onPress={() => onEntryPress && onEntryPress(entry)}
            >
              <View style={styles.left}>
                <Text style={[styles.date, { color: textPrimary }]} numberOfLines={1}>
                  {formatHistoryDate ? formatHistoryDate(entry.clock_in) : new Date(entry.clock_in).toLocaleDateString()}
                </Text>
                <Text style={[styles.project, { color: textSecondary }]} numberOfLines={1}>
                  {entry.projects?.name || entry.service_plans?.name || 'Unknown project'}
                </Text>
              </View>
              <Text style={[styles.hours, { color: accent }]}>
                {formatHoursMinutes ? formatHoursMinutes(entry.hours || 0) : `${(entry.hours || 0).toFixed(1)}h`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 10,
  },
  left: {
    flex: 1,
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
  },
  project: {
    fontSize: 11,
    marginTop: 2,
  },
  hours: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
});
