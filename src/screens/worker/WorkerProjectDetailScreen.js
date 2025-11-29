import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function WorkerProjectDetailScreen({ route, navigation }) {
  const { project } = route.params;

  console.log('Project phases:', JSON.stringify(project.project_phases, null, 2));

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    if (!amount) return '$0';
    return `$${amount.toLocaleString()}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
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
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Project Information</Text>

          {project.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={18} color="#6B7280" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{project.location}</Text>
              </View>
            </View>
          )}

          {project.start_date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={18} color="#6B7280" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Start Date</Text>
                <Text style={styles.infoValue}>{formatDate(project.start_date)}</Text>
              </View>
            </View>
          )}

          {project.end_date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={18} color="#6B7280" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>End Date</Text>
                <Text style={styles.infoValue}>{formatDate(project.end_date)}</Text>
              </View>
            </View>
          )}

          {project.status && (
            <View style={styles.infoRow}>
              <View style={[styles.statusDot, {
                backgroundColor: project.status === 'active' ? '#10B981' : '#9CA3AF'
              }]} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Status</Text>
                <Text style={styles.infoValue}>{project.status}</Text>
              </View>
            </View>
          )}

          {project.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.infoLabel}>Description</Text>
              <Text style={styles.descriptionText}>{project.description}</Text>
            </View>
          )}
        </View>

        {/* Phases */}
        {project.project_phases && project.project_phases.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Phases</Text>
            <View style={styles.phasesList}>
              {project.project_phases
                .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                .map((phase, index) => (
                  <View key={phase.id} style={styles.phaseCard}>
                    <View style={styles.phaseHeader}>
                      <View style={styles.phaseNumber}>
                        <Text style={styles.phaseNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.phaseInfo}>
                        <Text style={styles.phaseName}>{phase.name}</Text>
                        {phase.planned_days && (
                          <Text style={styles.phaseDescription}>
                            {phase.planned_days} days planned
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Phase Details */}
                    <View style={styles.phaseDetails}>
                      {phase.completion_percentage !== null && (
                        <View style={styles.phaseDetailRow}>
                          <Text style={styles.phaseDetailLabel}>Progress</Text>
                          <View style={styles.progressContainer}>
                            <View style={styles.progressBar}>
                              <View
                                style={[
                                  styles.progressFill,
                                  { width: `${phase.completion_percentage}%` }
                                ]}
                              />
                            </View>
                            <Text style={styles.progressText}>{phase.completion_percentage}%</Text>
                          </View>
                        </View>
                      )}

                      {phase.start_date && (
                        <View style={styles.phaseDetailRow}>
                          <Text style={styles.phaseDetailLabel}>Start</Text>
                          <Text style={styles.phaseDetailValue}>{formatDate(phase.start_date)}</Text>
                        </View>
                      )}

                      {phase.end_date && (
                        <View style={styles.phaseDetailRow}>
                          <Text style={styles.phaseDetailLabel}>End</Text>
                          <Text style={styles.phaseDetailValue}>{formatDate(phase.end_date)}</Text>
                        </View>
                      )}
                    </View>

                    {/* Tasks/Services */}
                    {((phase.tasks && phase.tasks.length > 0) || (phase.services && phase.services.length > 0)) ? (
                      <View style={styles.servicesContainer}>
                        <Text style={styles.servicesTitle}>Tasks</Text>
                        {/* Show tasks first, then fall back to services */}
                        {(phase.tasks || phase.services || []).map((item, itemIndex) => (
                          <View key={itemIndex} style={styles.serviceItem}>
                            <View style={[
                              styles.serviceBullet,
                              item.completed && { backgroundColor: '#10B981' }
                            ]} />
                            <Text style={[
                              styles.serviceText,
                              item.completed && styles.serviceTextCompleted
                            ]}>
                              {item.description || item.name || 'Task'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.servicesContainer}>
                        <Text style={styles.noServicesText}>No tasks assigned yet</Text>
                      </View>
                    )}
                  </View>
                ))}
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
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    color: '#1F2937',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
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
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
  },
  descriptionContainer: {
    marginTop: 8,
  },
  descriptionText: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginTop: 4,
  },
  phasesList: {
    gap: 12,
  },
  phaseCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#1F2937',
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
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  phaseDescription: {
    fontSize: 14,
    color: '#6B7280',
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
    color: '#6B7280',
    fontWeight: '500',
  },
  phaseDetailValue: {
    fontSize: 14,
    color: '#1F2937',
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
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1F2937',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 32,
    textAlign: 'right',
  },
  servicesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  servicesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
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
    backgroundColor: '#9CA3AF',
    marginTop: 6,
  },
  serviceText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  serviceTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  noServicesText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});
