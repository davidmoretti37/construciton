import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function DailyReportList({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const { title, subtitle, reports = [], totalCount, filters } = data;

  const handleReportPress = (report) => {
    if (onAction) {
      onAction({
        type: 'view-report-detail',
        label: 'View Report',
        data: { reportId: report.id }
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    // Parse as local date to avoid timezone shift
    const dateOnly = dateString.split('T')[0];
    const [year, month, day] = dateOnly.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{title || 'Daily Reports'}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>{subtitle}</Text>
          )}
        </View>
        <View style={[styles.countBadge, { backgroundColor: Colors.primaryBlue }]}>
          <Text style={styles.countText}>{totalCount || reports.length}</Text>
        </View>
      </View>

      {/* Reports List */}
      {reports.length > 0 ? (
        <ScrollView
          style={styles.reportsList}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={false}
        >
          {reports.map((report, index) => (
            <TouchableOpacity
              key={report.id || index}
              style={[styles.reportCard, { backgroundColor: Colors.lightBackground }]}
              onPress={() => handleReportPress(report)}
              activeOpacity={0.7}
            >
              {/* Report Header */}
              <View style={styles.reportHeader}>
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.primaryBlue} />
                  <Text style={[styles.reportDate, { color: Colors.primaryText }]}>
                    {formatDate(report.reportDate)}
                  </Text>
                </View>
                {report.photoCount > 0 && (
                  <View style={styles.photoIndicator}>
                    <Ionicons name="images-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.photoCount, { color: Colors.secondaryText }]}>
                      {report.photoCount}
                    </Text>
                  </View>
                )}
              </View>

              {/* Project & Phase */}
              <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                {report.projectName}
              </Text>
              <View style={styles.phaseRow}>
                {report.phaseName && (
                  <View style={[styles.phaseTag, { backgroundColor: Colors.primaryBlue + '20' }]}>
                    <Text style={[styles.phaseTagText, { color: Colors.primaryBlue }]}>
                      {report.phaseName}
                    </Text>
                  </View>
                )}
                {report.tags && report.tags.length > 0 && (
                  report.tags.slice(0, 2).map((tag, i) => (
                    <View key={i} style={[styles.tagChip, { backgroundColor: Colors.border }]}>
                      <Text style={[styles.tagText, { color: Colors.secondaryText }]}>
                        {tag}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              {/* Worker Info */}
              <View style={styles.workerRow}>
                <Ionicons name="person-outline" size={14} color={Colors.secondaryText} />
                <Text style={[styles.workerName, { color: Colors.secondaryText }]}>
                  {report.workerName}
                  {report.workerTrade && ` (${report.workerTrade})`}
                </Text>
              </View>

              {/* Notes Preview */}
              {report.notes && (
                <Text
                  style={[styles.notesPreview, { color: Colors.secondaryText }]}
                  numberOfLines={2}
                >
                  {report.notes}
                </Text>
              )}

              {/* Photo Thumbnails */}
              {report.photos && report.photos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbnailScroll}
                >
                  {report.photos.slice(0, 4).map((photoUrl, i) => (
                    <Image
                      key={i}
                      source={{ uri: photoUrl }}
                      style={styles.thumbnail}
                    />
                  ))}
                  {report.photos.length > 4 && (
                    <View style={[styles.moreThumbnails, { backgroundColor: Colors.border }]}>
                      <Text style={[styles.moreText, { color: Colors.secondaryText }]}>
                        +{report.photos.length - 4}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={40} color={Colors.secondaryText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No reports found
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  reportsList: {
    padding: Spacing.sm,
  },
  reportCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportDate: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  photoCount: {
    fontSize: FontSizes.tiny,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  phaseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  phaseTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  phaseTagText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  tagChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  tagText: {
    fontSize: FontSizes.tiny,
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  workerName: {
    fontSize: FontSizes.small,
  },
  notesPreview: {
    fontSize: FontSizes.small,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  thumbnailScroll: {
    marginTop: Spacing.sm,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.xs,
  },
  moreThumbnails: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.small,
  },
});
