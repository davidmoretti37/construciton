import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectDocuments, fetchProjectPhases, fetchDailyReports, calculateProjectProgressFromTasks, completeTask, uncompleteTask, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import TodaysChecklistSection from '../../components/TodaysChecklistSection';
import DailyChecklistSection from '../../components/DailyChecklistSection';

// In-memory cache of a worker's project detail fetches, keyed by project.id.
// Lives at module scope so navigating away and back hydrates instantly from
// the last-seen snapshot while a background refresh revalidates. Mirrors
// the pattern used in ProjectDetailView for the owner flow.
const workerProjectDetailCache = new Map();

export default function WorkerProjectDetailScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { project } = route.params;

  // Seed useState defaults from the in-memory cache so return visits
  // render the previous snapshot instantly while the background refresh
  // runs. No cache → show skeletons during first load only.
  const cached = (project?.id && workerProjectDetailCache.get(project.id)) || null;

  // Documents state
  const [documents, setDocuments] = useState(cached?.documents || []);
  const [loadingDocuments, setLoadingDocuments] = useState(!cached);

  // Phases state (fetched with task completion data)
  const [phases, setPhases] = useState(cached?.phases || []);
  const [loadingPhases, setLoadingPhases] = useState(!cached);
  const [overallProgress, setOverallProgress] = useState(cached?.overallProgress ?? 0);
  const [expandedPhases, setExpandedPhases] = useState({});

  // Daily Reports state
  const [reports, setReports] = useState(cached?.reports || []);
  const [loadingReports, setLoadingReports] = useState(!cached);

  // Expenses state — project_transactions this worker submitted for THIS project.
  const [expenses, setExpenses] = useState(cached?.expenses || []);
  const [loadingExpenses, setLoadingExpenses] = useState(!cached);

  // Single parallel fetch — replaces four sequential `useEffect`s that each
  // awaited their own roundtrip. Fires all the supabase calls simultaneously
  // via Promise.allSettled so one slow/failed query doesn't block the others,
  // then caches the snapshot for instant rehydration on next navigation.
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;

    (async () => {
      // Resolve this worker's workers.id so daily reports + expenses are
      // scoped to what THIS worker submitted (not all crew on the project).
      const userId = await getCurrentUserId();
      let workerId = null;
      if (userId) {
        const { data: w } = await supabase
          .from('workers')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        workerId = w?.id || null;
      }

      const expensesPromise = workerId
        ? supabase
            .from('project_transactions')
            .select('id, project_id, type, category, subcategory, description, amount, date, worker_id, receipt_url, line_items, notes, created_at')
            .eq('project_id', project.id)
            .eq('worker_id', workerId)
            .eq('type', 'expense')
            .order('date', { ascending: false })
            .limit(100)
            .then(r => r.data || [])
        : Promise.resolve([]);

      const [docsRes, phasesRes, progressRes, reportsRes, expensesRes] = await Promise.allSettled([
        fetchProjectDocuments(project.id, true),
        fetchProjectPhases(project.id),
        calculateProjectProgressFromTasks(project.id),
        fetchDailyReports(project.id, { workerView: true, workerId: workerId || undefined }),
        expensesPromise,
      ]);
      if (cancelled) return;

      const freshDocs = docsRes.status === 'fulfilled' ? (docsRes.value || []) : [];
      const freshPhases = phasesRes.status === 'fulfilled'
        ? (phasesRes.value || [])
        : (project.project_phases || []);
      const freshProgress = progressRes.status === 'fulfilled'
        ? (progressRes.value?.progress ?? 0)
        : 0;
      const freshReports = reportsRes.status === 'fulfilled' ? (reportsRes.value || []) : [];
      const freshExpenses = expensesRes.status === 'fulfilled' ? (expensesRes.value || []) : [];

      setDocuments(freshDocs);
      setLoadingDocuments(false);
      setPhases(freshPhases);
      setLoadingPhases(false);
      setOverallProgress(freshProgress);
      setReports(freshReports);
      setLoadingReports(false);
      setExpenses(freshExpenses);
      setLoadingExpenses(false);

      workerProjectDetailCache.set(project.id, {
        documents: freshDocs,
        phases: freshPhases,
        overallProgress: freshProgress,
        reports: freshReports,
        expenses: freshExpenses,
      });
    })();

    return () => { cancelled = true; };
  }, [project?.id]);

  // Toggle phase task completion
  const handlePhaseTaskToggle = async (phase, taskItem, taskIndex) => {
    if (!taskItem.workerTaskId) return; // No linked worker_task to toggle

    const newCompleted = !taskItem.completed;

    // Optimistic update: update local phase state
    setPhases(prev => prev.map(p => {
      if (p.id !== phase.id) return p;
      const updatedTasks = [...(p.tasks || [])];
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], completed: newCompleted };
      const totalTasks = updatedTasks.length;
      const completedTasks = updatedTasks.filter(t => t.completed).length;
      return {
        ...p,
        tasks: updatedTasks,
        completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      };
    }));

    try {
      const success = newCompleted
        ? await completeTask(taskItem.workerTaskId)
        : await uncompleteTask(taskItem.workerTaskId);

      if (!success) {
        // Revert on failure
        setPhases(prev => prev.map(p => {
          if (p.id !== phase.id) return p;
          const revertedTasks = [...(p.tasks || [])];
          revertedTasks[taskIndex] = { ...revertedTasks[taskIndex], completed: !newCompleted };
          const totalTasks = revertedTasks.length;
          const completedTasks = revertedTasks.filter(t => t.completed).length;
          return {
            ...p,
            tasks: revertedTasks,
            completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          };
        }));
      } else {
        const { progress } = await calculateProjectProgressFromTasks(project.id);
        setOverallProgress(progress);
      }
    } catch (error) {
      console.error('Error toggling phase task:', error);
      // Revert
      setPhases(prev => prev.map(p => {
        if (p.id !== phase.id) return p;
        const revertedTasks = [...(p.tasks || [])];
        revertedTasks[taskIndex] = { ...revertedTasks[taskIndex], completed: !newCompleted };
        const totalTasks = revertedTasks.length;
        const completedTasks = revertedTasks.filter(t => t.completed).length;
        return {
          ...p,
          tasks: revertedTasks,
          completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        };
      }));
    }
  };

  const handleViewDocument = async (doc) => {
    const { getDocumentUrl } = require('../../utils/storage/projectDocuments');
    let fileUrl = doc.file_url;

    if (fileUrl && !fileUrl.startsWith('http')) {
      // New format: storage path → generate signed URL
      fileUrl = await getDocumentUrl(doc.file_url);
    } else if (fileUrl && fileUrl.includes('/project-documents/')) {
      // Old format: public URL that may not be accessible → extract path and sign it
      const pathMatch = fileUrl.split('/project-documents/')[1];
      if (pathMatch) {
        const signedUrl = await getDocumentUrl(pathMatch);
        if (signedUrl) fileUrl = signedUrl;
      }
    }

    if (!fileUrl) {
      Alert.alert('Error', 'Could not load document.');
      return;
    }

    navigation.navigate('DocumentViewer', {
      fileUrl,
      fileName: doc.file_name,
      fileType: doc.file_type,
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
                    .map((phase, index) => {
                      const isExpanded = expandedPhases[phase.id];
                      const taskItems = phase.tasks || phase.services || [];
                      const completedCount = taskItems.filter(t => t.completed).length;
                      return (
                  <View key={phase.id} style={[styles.phaseCard, { backgroundColor: Colors.lightBackground, borderLeftColor: Colors.primaryText }]}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setExpandedPhases(prev => ({ ...prev, [phase.id]: !prev[phase.id] }))}
                      style={styles.phaseHeader}
                    >
                      <View style={styles.phaseInfo}>
                        <Text style={[styles.phaseName, { color: Colors.primaryText }]}>{phase.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <View style={[styles.progressBar, { backgroundColor: Colors.border, flex: 1 }]}>
                            <View style={[styles.progressFill, { width: `${phase.completion_percentage || 0}%`, backgroundColor: '#10B981' }]} />
                          </View>
                          <Text style={{ fontSize: 12, color: Colors.secondaryText, fontWeight: '600' }}>{phase.completion_percentage || 0}%</Text>
                        </View>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={{ marginTop: 12 }}>
                        {phase.planned_days && (
                          <Text style={{ fontSize: 13, color: Colors.secondaryText, marginBottom: 8 }}>
                            {phase.planned_days} days planned
                          </Text>
                        )}
                        {phase.start_date && (
                          <View style={[styles.phaseDetailRow, { marginBottom: 4 }]}>
                            <Text style={[styles.phaseDetailLabel, { color: Colors.secondaryText }]}>Start</Text>
                            <Text style={[styles.phaseDetailValue, { color: Colors.primaryText }]}>{formatDate(phase.start_date)}</Text>
                          </View>
                        )}
                        {phase.end_date && (
                          <View style={[styles.phaseDetailRow, { marginBottom: 8 }]}>
                            <Text style={[styles.phaseDetailLabel, { color: Colors.secondaryText }]}>End</Text>
                            <Text style={[styles.phaseDetailValue, { color: Colors.primaryText }]}>{formatDate(phase.end_date)}</Text>
                          </View>
                        )}

                        {taskItems.length > 0 ? (
                          <View style={[styles.servicesContainer, { borderTopColor: Colors.border }]}>
                            <Text style={[styles.servicesTitle, { color: Colors.secondaryText }]}>Tasks ({completedCount}/{taskItems.length})</Text>
                            {taskItems.map((item, itemIndex) => (
                              <TouchableOpacity
                                key={itemIndex}
                                style={styles.serviceItem}
                                onPress={() => handlePhaseTaskToggle(phase, item, itemIndex)}
                                activeOpacity={item.workerTaskId ? 0.6 : 1}
                                disabled={!item.workerTaskId}
                              >
                                <Ionicons
                                  name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={16}
                                  color={item.completed ? successColor : Colors.secondaryText}
                                />
                                <Text style={[
                                  styles.serviceText,
                                  { color: Colors.secondaryText },
                                  item.completed && { textDecorationLine: 'line-through' }
                                ]}>
                                  {item.description || item.name || 'Task'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <View style={[styles.servicesContainer, { borderTopColor: Colors.border }]}>
                            <Text style={[styles.noServicesText, { color: Colors.secondaryText }]}>No tasks assigned yet</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                      );
                    })}
                </View>
              </>
            )}
          </View>
        )}

        {/* Today's Checklist — phase tasks scheduled for TODAY only.
            Distinct from Daily Crew Checks (recurring items).
            No horizontal margin so it matches the width of peer cards
            (parent contentContainer already pads 20px). */}
        {project?.id && (
          <View style={{ marginBottom: 16 }}>
            <TodaysChecklistSection
              projectId={project.id}
              userRole="worker"
            />
          </View>
        )}

        {/* Daily Crew Checks — recurring items the crew ticks every workday */}
        {project?.id && (
          <View style={{ marginBottom: 16 }}>
            <DailyChecklistSection
              projectId={project.id}
              ownerId={project.user_id}
              userRole="worker"
            />
          </View>
        )}

        {/* Daily Reports Section */}
        {(reports.length > 0 || loadingReports) && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="clipboard-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, marginBottom: 0 }]}>
                Daily Reports ({reports.length})
              </Text>
            </View>
            {loadingReports ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <ScrollView style={reports.length > 2 ? { maxHeight: 180 } : undefined} nestedScrollEnabled showsVerticalScrollIndicator={reports.length > 2} persistentScrollbar={true}>
                {reports.map((report, index) => {
                  const reportDate = report.report_date ? new Date(report.report_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                  const getReporterName = () => {
                    if (report.reporter_type === 'owner') return 'Owner';
                    if (report.reporter_type === 'supervisor') return report.profiles?.business_name || 'Supervisor';
                    return report.workers?.full_name || 'Worker';
                  };
                  const getReporterColor = () => {
                    if (report.reporter_type === 'owner') return '#10B981';
                    if (report.reporter_type === 'supervisor') return Colors.primaryBlue;
                    return Colors.secondaryText;
                  };
                  const photoCount = report.photos?.length || 0;

                  return (
                    <TouchableOpacity
                      key={report.id || index}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginBottom: 8 }}
                      onPress={() => navigation?.navigate('DailyReportDetail', { report })}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primaryText }}>{reportDate}</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <View style={{ backgroundColor: getReporterColor() + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: getReporterColor() }}>
                              {report.reporter_type === 'owner' ? 'Owner' : report.reporter_type === 'supervisor' ? 'Supervisor' : 'Worker'}
                            </Text>
                          </View>
                          {photoCount > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.lightBackground, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                              <Ionicons name="camera" size={12} color={Colors.secondaryText} />
                              <Text style={{ fontSize: 11, color: Colors.secondaryText, marginLeft: 3 }}>{photoCount}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={{ fontSize: 13, color: Colors.primaryText, marginTop: 4 }}>{getReporterName()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* My Expenses Section — transactions this worker submitted for this project */}
        {(expenses.length > 0 || loadingExpenses) && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="receipt-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginLeft: 8, marginBottom: 0 }]}>
                My Expenses ({expenses.length})
              </Text>
            </View>
            {loadingExpenses ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <ScrollView style={expenses.length > 3 ? { maxHeight: 220 } : undefined} nestedScrollEnabled showsVerticalScrollIndicator={expenses.length > 3}>
                {expenses.map((exp) => {
                  const d = exp.date
                    ? new Date(exp.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';
                  return (
                    <TouchableOpacity
                      key={exp.id}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginBottom: 8 }}
                      onPress={() => navigation?.navigate('ExpenseDetail', { expense: exp })}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primaryText, flex: 1 }} numberOfLines={1}>
                          {exp.description || exp.category || 'Expense'}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                          ${parseFloat(exp.amount || 0).toFixed(2)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: Colors.secondaryText }}>{d}</Text>
                        {exp.category && (
                          <View style={{ backgroundColor: Colors.lightBackground, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                            <Text style={{ fontSize: 11, color: Colors.secondaryText, textTransform: 'capitalize' }}>
                              {exp.category}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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
    gap: 8,
  },
  phaseCard: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
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
    alignItems: 'center',
    marginBottom: 2,
    gap: 8,
    paddingVertical: 6,
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
