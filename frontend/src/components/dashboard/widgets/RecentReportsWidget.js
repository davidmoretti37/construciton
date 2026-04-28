import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

function timeAgo(input) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecentReportsWidget({
  reports,
  size,
  editMode,
  onPress,
  onReportPress,
}) {
  const list = Array.isArray(reports) ? reports : [];
  const reportCount = list.length;
  const totalPhotos = list.reduce((sum, r) => sum + (r.photoCount || r.photo_count || 0), 0);
  const showRows = (size === 'medium' || size === 'large') && list.length > 0;
  const rowLimit = size === 'large' ? 4 : 2;
  const rows = list.slice(0, rowLimit);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#0E7490', '#06B6D4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{reportCount}</Text>
            <Text style={styles.statLabel}>reports</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{totalPhotos}</Text>
            <Text style={styles.statLabel}>photos</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.iconCircle}>
            <Ionicons name="clipboard-outline" size={16} color="#A5F3FC" />
          </View>
        </View>

        {showRows ? (
          <View style={styles.rowList}>
            {rows.map((r, idx) => {
              const author =
                r.workerName ||
                r.workers?.full_name ||
                r.profiles?.business_name ||
                r.reporter_name ||
                'Someone';
              const project =
                r.projectName ||
                r.projects?.name ||
                r.service_plans?.name ||
                r.phaseName ||
                '';
              const ts = r.created_at || r.report_date || r.createdAt;
              return (
                <TouchableOpacity
                  key={r.id || idx}
                  style={[styles.row, idx < rows.length - 1 && styles.rowDivider]}
                  activeOpacity={0.7}
                  disabled={editMode}
                  onPress={() => onReportPress && r.id && onReportPress(r.id)}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowAuthor} numberOfLines={1}>
                      {author}
                      {project ? <Text style={styles.rowProject}>  ·  {project}</Text> : null}
                    </Text>
                  </View>
                  <Text style={styles.rowAgo}>{timeAgo(ts)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : list[0] ? (
          <View style={styles.lastPill}>
            <Text style={styles.lastText} numberOfLines={1}>
              {list[0].workerName || list[0].workers?.full_name || 'Someone'} — {list[0].phaseName || list[0].projectName || list[0].projects?.name || ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.noReports}>No recent reports</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statBlock: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowList: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  rowDivider: {
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
  rowAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowProject: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
  },
  rowAgo: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  lastPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lastText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  noReports: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
