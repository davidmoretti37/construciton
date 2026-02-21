import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectDocuments, fetchProjectPhases, calculateProjectProgressFromTasks } from '../../utils/storage';

export default function WorkerProjectDetailScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { project } = route.params;

  // Documents state
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  // Phases state (fetched with task completion data)
  const [phases, setPhases] = useState([]);
  const [loadingPhases, setLoadingPhases] = useState(true);
  const [overallProgress, setOverallProgress] = useState(0);

  // Load documents on mount (only documents visible to workers)
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        setLoadingDocuments(true);
        // Pass true for workerView to only fetch documents visible to workers
        const docs = await fetchProjectDocuments(project.id, true);
        setDocuments(docs || []);
      } catch (error) {
        console.error('Error loading documents:', error);
        setDocuments([]);
      } finally {
        setLoadingDocuments(false);
      }
    };
    loadDocuments();
  }, [project.id]);

  // Load phases with task completion data
  useEffect(() => {
    const loadPhases = async () => {
      try {
        setLoadingPhases(true);
        // Fetch phases with task completion status merged from worker_tasks
        const projectPhases = await fetchProjectPhases(project.id);
        setPhases(projectPhases || []);

        // Calculate overall progress from all tasks
        const { progress } = await calculateProjectProgressFromTasks(project.id);
        setOverallProgress(progress);
      } catch (error) {
        console.error('Error loading phases:', error);
        setPhases(project.project_phases || []);
      } finally {
        setLoadingPhases(false);
      }
    };
    loadPhases();
  }, [project.id]);

  const handleViewDocument = (doc) => {
    navigation.navigate('DocumentViewer', {
      fileUrl: doc.file_url,
      fileName: doc.file_name,
      projectName: project.name,
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    if (!amount) return '$0';
    return `$${amount.toLocaleString()}`;
  };

  const successColor = Colors.success || '#10B981';
  const inactiveColor = Colors.secondaryText;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {project.name}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Project Info Card */}
        <View style={[styles.card, { backgroundColor: Colors.white }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Project Information</Text>

          {project.location && (
            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => {
                const address = encodeURIComponent(project.location);
                const url = Platform.select({
                  ios: `maps://app?daddr=${address}`,
                  android: `google.navigation:q=${address}`,
                });
                Linking.openURL(url).catch(() => {
                  // Fallback to Google Maps web
                  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
                });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="location" size={18} color={Colors.primaryBlue} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Location</Text>
                <Text style={[styles.infoValue, { color: Colors.primaryBlue }]}>{project.location}</Text>
              </View>
              <Ionicons name="navigate-outline" size={18} color={Colors.primaryBlue} />
            </TouchableOpacity>
          )}

          {project.start_date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={18} color={Colors.secondaryText} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Start Date</Text>
                <Text style={[styles.infoValue, { color: Colors.primaryText }]}>{formatDate(project.start_date)}</Text>
              </View>
            </View>
          )}

          {project.end_date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={18} color={Colors.secondaryText} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>End Date</Text>
                <Text style={[styles.infoValue, { color: Colors.primaryText }]}>{formatDate(project.end_date)}</Text>
              </View>
            </View>
          )}

          {project.status && (
            <View style={styles.infoRow}>
              <View style={[styles.statusDot, {
                backgroundColor: project.status === 'active' ? successColor : inactiveColor
              }]} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Status</Text>
                <Text style={[styles.infoValue, { color: Colors.primaryText }]}>{project.status}</Text>
              </View>
            </View>
          )}

          {project.description && (
            <View style={styles.descriptionContainer}>
              <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Description</Text>
              <Text style={[styles.descriptionText, { color: Colors.secondaryText }]}>{project.description}</Text>
            </View>
          )}
        </View>

        {/* Phases */}
        {(phases.length > 0 || loadingPhases) && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Phases</Text>
            {loadingPhases ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <>
                {/* Overall Progress */}
                <View style={styles.overallProgressContainer}>
                  <View style={styles.overallProgressHeader}>
                    <Text style={[styles.overallProgressLabel, { color: Colors.secondaryText }]}>Overall Progress</Text>
                    <Text style={[styles.overallProgressPercent, { color: Colors.primaryText }]}>{overallProgress}%</Text>
                  </View>
                  <View style={[styles.overallProgressBar, { backgroundColor: Colors.border }]}>
                    <View style={[styles.overallProgressFill, { width: `${overallProgress}%`, backgroundColor: '#10B981' }]} />
                  </View>
                </View>

                <View style={styles.phasesList}>
                  {phases
                    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                    .map((phase, index) => (
                  <View key={phase.id} style={[styles.phaseCard, { backgroundColor: Colors.lightBackground, borderLeftColor: Colors.primaryText }]}>
                    <View style={styles.phaseHeader}>
                      <View style={[styles.phaseNumber, { backgroundColor: Colors.primaryText }]}>
                        <Text style={[styles.phaseNumberText, { color: Colors.white }]}>{index + 1}</Text>
                      </View>
                      <View style={styles.phaseInfo}>
                        <Text style={[styles.phaseName, { color: Colors.primaryText }]}>{phase.name}</Text>
                        {phase.planned_days && (
                          <Text style={[styles.phaseDescription, { color: Colors.secondaryText }]}>
                            {phase.planned_days} days planned
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Phase Details */}
                    <View style={styles.phaseDetails}>
                      {phase.completion_percentage !== null && (
                        <View style={styles.phaseDetailRow}>
                          <Text style={[styles.phaseDetailLabel, { color: Colors.secondaryText }]}>Progress</Text>
                          <View style={styles.progressContainer}>
                            <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
                              <View
                                style={[
                                  styles.progressFill,
                                  { width: `${phase.completion_percentage}%`, backgroundColor: Colors.primaryText }
                                ]}
                              />
                            </View>
                            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>{phase.completion_percentage}%</Text>
                          </View>
                        </View>
                      )}

                      {phase.start_date && (
                        <View style={styles.phaseDetailRow}>
                          <Text style={[styles.phaseDetailLabel, { color: Colors.secondaryText }]}>Start</Text>
                          <Text style={[styles.phaseDetailValue, { color: Colors.primaryText }]}>{formatDate(phase.start_date)}</Text>
                        </View>
                      )}

                      {phase.end_date && (
                        <View style={styles.phaseDetailRow}>
                          <Text style={[styles.phaseDetailLabel, { color: Colors.secondaryText }]}>End</Text>
                          <Text style={[styles.phaseDetailValue, { color: Colors.primaryText }]}>{formatDate(phase.end_date)}</Text>
                        </View>
                      )}
                    </View>

                    {/* Tasks/Services */}
                    {((phase.tasks && phase.tasks.length > 0) || (phase.services && phase.services.length > 0)) ? (
                      <View style={[styles.servicesContainer, { borderTopColor: Colors.border }]}>
                        <Text style={[styles.servicesTitle, { color: Colors.secondaryText }]}>Tasks</Text>
                        {/* Show tasks first, then fall back to services */}
                        {(phase.tasks || phase.services || []).map((item, itemIndex) => (
                          <View key={itemIndex} style={styles.serviceItem}>
                            <View style={[
                              styles.serviceBullet,
                              { backgroundColor: Colors.secondaryText },
                              item.completed && { backgroundColor: successColor }
                            ]} />
                            <Text style={[
                              styles.serviceText,
                              { color: Colors.secondaryText },
                              item.completed && { textDecorationLine: 'line-through', color: Colors.secondaryText }
                            ]}>
                              {item.description || item.name || 'Task'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={[styles.servicesContainer, { borderTopColor: Colors.border }]}>
                        <Text style={[styles.noServicesText, { color: Colors.secondaryText }]}>No tasks assigned yet</Text>
                      </View>
                    )}
                  </View>
                    ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Documents Section */}
        <View style={[styles.card, { backgroundColor: Colors.white }]}>
          <View style={styles.documentsHeader}>
            <Ionicons name="folder-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, marginBottom: 0 }]}>
              Documents ({documents.length})
            </Text>
          </View>

          {loadingDocuments ? (
            <View style={styles.documentsLoading}>
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
              <Text style={[styles.documentsLoadingText, { color: Colors.secondaryText }]}>Loading documents...</Text>
            </View>
          ) : documents.length === 0 ? (
            <View style={styles.emptyDocuments}>
              <Ionicons name="document-outline" size={36} color={Colors.secondaryText} />
              <Text style={[styles.emptyDocumentsText, { color: Colors.secondaryText }]}>
                No documents available
              </Text>
            </View>
          ) : (
            <View style={styles.documentsList}>
              {documents.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  style={[styles.documentCard, { backgroundColor: Colors.lightBackground }]}
                  onPress={() => handleViewDocument(doc)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.documentIcon, { backgroundColor: doc.file_type === 'document' ? '#EF4444' + '20' : Colors.primaryBlue + '20' }]}>
                    <Ionicons
                      name={doc.file_type === 'document' ? 'document' : 'image'}
                      size={22}
                      color={doc.file_type === 'document' ? '#EF4444' : Colors.primaryBlue}
                    />
                  </View>
                  <View style={styles.documentInfo}>
                    <Text style={[styles.documentName, { color: Colors.primaryText }]} numberOfLines={1}>
                      {doc.file_name}
                    </Text>
                    <Text style={[styles.documentDate, { color: Colors.secondaryText }]}>
                      {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 2,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  descriptionContainer: {
    marginTop: 8,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  overallProgressContainer: {
    marginBottom: 16,
  },
  overallProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  overallProgressLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  overallProgressPercent: {
    fontSize: 14,
    fontWeight: '700',
  },
  overallProgressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  phasesList: {
    gap: 12,
  },
  phaseCard: {
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 3,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  phaseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseNumberText: {
    fontSize: 14,
    fontWeight: '700',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  phaseDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  phaseDetails: {
    gap: 10,
  },
  phaseDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseDetailLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  phaseDetailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginLeft: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'right',
  },
  servicesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  servicesTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  serviceBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
  },
  serviceText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  noServicesText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  // Documents Section Styles
  documentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  documentsLoading: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  documentsLoadingText: {
    fontSize: 13,
  },
  emptyDocuments: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyDocumentsText: {
    fontSize: 14,
  },
  documentsList: {
    gap: 10,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '500',
  },
  documentDate: {
    fontSize: 12,
    marginTop: 2,
  },
});
