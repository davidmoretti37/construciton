import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDailyReportById } from '../../utils/storage';
import FullscreenPhotoViewer from '../../components/FullscreenPhotoViewer';

export default function DailyReportDetailScreen({ navigation, route }) {
  const { report: passedReport, reportId } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [report, setReport] = useState(passedReport || null);
  const [loading, setLoading] = useState(!passedReport && !!reportId);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // Fetch report if only reportId is provided
  useEffect(() => {
    if (!passedReport && reportId) {
      loadReport();
    }
  }, [reportId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const fetchedReport = await fetchDailyReportById(reportId);
      setReport(fetchedReport);
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoading(false);
    }
  };

  const openPhoto = (index) => {
    setSelectedPhotoIndex(index);
    setPhotoModalVisible(true);
  };

  const closePhoto = () => {
    setPhotoModalVisible(false);
    setSelectedPhotoIndex(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Show loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Report Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading report...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error if no report found
  if (!report) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Report Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={[styles.loadingText, { color: Colors.primaryText }]}>Report not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const photos = report.photos || [];
  const completedSteps = report.completed_steps || [];
  const workDone = report.tags?.[0] || '';  // Work description stored in tags
  const taskProgress = report.task_progress || {};

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Report Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Date & Project Info */}
        <View style={[styles.section, { backgroundColor: Colors.white }]}>
          <Text style={[styles.reportDate, { color: Colors.primaryText }]}>
            {formatDate(report.report_date)}
          </Text>

          <View style={styles.infoRow}>
            <Ionicons name="briefcase-outline" size={18} color={Colors.secondaryText} />
            <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
              {report.projects?.name || 'Unknown Project'}
            </Text>
          </View>

          {report.project_phases?.name && (
            <View style={styles.infoRow}>
              <Ionicons name="layers-outline" size={18} color={Colors.secondaryText} />
              <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                {report.project_phases.name}
              </Text>
            </View>
          )}
        </View>

        {/* Photos Section */}
        {photos.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="images-outline" size={20} color={Colors.primaryText} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Photos ({photos.length})
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoScrollContent}
            >
              {photos.map((photoUrl, index) => (
                <TouchableOpacity key={index} onPress={() => openPhoto(index)} activeOpacity={0.8}>
                  <Image
                    source={{ uri: photoUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Full Screen Photo Viewer with Swipe Navigation */}
        <FullscreenPhotoViewer
          photos={photos.map(url => ({ url }))}
          visible={photoModalVisible}
          initialIndex={selectedPhotoIndex || 0}
          onClose={closePhoto}
        />

        {/* Task Progress Section */}
        {Object.keys(taskProgress).length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="checkbox-outline" size={20} color={Colors.primaryText} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Task Progress
              </Text>
            </View>
            <View style={styles.taskList}>
              {Object.entries(taskProgress).map(([taskId, progress]) => (
                <View key={taskId} style={styles.taskItem}>
                  <View style={[styles.taskProgressBar, { backgroundColor: Colors.border }]}>
                    <View
                      style={[
                        styles.taskProgressFill,
                        {
                          width: `${progress}%`,
                          backgroundColor: progress === 100 ? Colors.success : Colors.primaryBlue
                        }
                      ]}
                    />
                  </View>
                  <Text style={[styles.taskProgressText, { color: Colors.secondaryText }]}>
                    {progress}%
                  </Text>
                  {progress === 100 && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Work Done Section */}
        {workDone && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="construct-outline" size={20} color={Colors.primaryText} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Work Done
              </Text>
            </View>
            <Text style={[styles.workDoneText, { color: Colors.primaryText }]}>
              {workDone}
            </Text>
          </View>
        )}

        {/* Notes Section */}
        {report.notes && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primaryText} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                Notes
              </Text>
            </View>
            <Text style={[styles.notesText, { color: Colors.secondaryText }]}>
              {report.notes}
            </Text>
          </View>
        )}

        {/* Empty State if no content */}
        {photos.length === 0 &&
         Object.keys(taskProgress).length === 0 &&
         !workDone &&
         !report.notes && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color={Colors.border} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                No details recorded for this report
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl * 2,
  },
  section: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportDate: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: FontSizes.body,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  photoScrollContent: {
    gap: Spacing.sm,
  },
  photo: {
    width: 200,
    height: 150,
    borderRadius: BorderRadius.md,
  },
  taskList: {
    gap: Spacing.sm,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  taskProgressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  taskProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  taskProgressText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  customTaskList: {
    gap: Spacing.sm,
  },
  customTaskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  customTaskText: {
    flex: 1,
    fontSize: FontSizes.body,
    lineHeight: 22,
  },
  workDoneText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  notesText: {
    fontSize: FontSizes.body,
    lineHeight: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
  },
});
