import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getSupervisorsForOwner, assignProjectToSupervisor } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';

// Owner theme colors
const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  success: '#10B981',
};

/**
 * Modal for owner to assign a project to a supervisor
 * Single selection (radio-style) with "Manage Directly" option
 */
export default function SupervisorAssignmentModal({
  visible,
  onClose,
  project, // { id, name, assignedTo }
  onAssignmentChange, // callback when assignment changes
}) {
  const { t } = useTranslation('owner');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { profile } = useAuth() || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supervisors, setSupervisors] = useState([]);
  const [selectedId, setSelectedId] = useState(null); // null = "Manage Directly"

  useEffect(() => {
    if (visible && profile?.id) {
      loadSupervisors();
    }
  }, [visible, profile?.id]);

  useEffect(() => {
    // Pre-select current assignment when modal opens
    if (visible && project) {
      setSelectedId(project.assignedTo || null);
    }
  }, [visible, project]);

  const loadSupervisors = async () => {
    try {
      setLoading(true);
      const data = await getSupervisorsForOwner(profile.id);
      setSupervisors(data || []);
    } catch (error) {
      console.error('Error loading supervisors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!project?.id) return;

    try {
      setSaving(true);

      const result = await assignProjectToSupervisor(project.id, selectedId);

      if (result.success) {
        const actionText = selectedId
          ? t('assign.successAssigned', 'Project assigned successfully')
          : t('assign.successUnassigned', 'Project is now managed by you');

        Alert.alert(
          t('common.success', 'Success'),
          actionText,
          [{ text: t('common.ok', 'OK'), onPress: onClose }]
        );

        if (onAssignmentChange) {
          onAssignmentChange(selectedId);
        }
      } else {
        Alert.alert(
          t('common.error', 'Error'),
          result.error || t('assign.errorGeneric', 'Failed to assign project')
        );
      }
    } catch (error) {
      console.error('Error assigning project:', error);
      Alert.alert(
        t('common.error', 'Error'),
        t('assign.errorGeneric', 'Failed to assign project')
      );
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = (project?.assignedTo || null) !== selectedId;

  const renderSupervisorOption = (supervisor) => {
    const isSelected = selectedId === supervisor.id;

    return (
      <TouchableOpacity
        key={supervisor.id}
        style={[
          styles.optionRow,
          { borderBottomColor: Colors.border },
          isSelected && styles.optionRowSelected,
        ]}
        onPress={() => setSelectedId(supervisor.id)}
        activeOpacity={0.7}
      >
        <View style={styles.radioContainer}>
          <View style={[
            styles.radioOuter,
            { borderColor: isSelected ? OWNER_COLORS.primary : Colors.secondaryText },
          ]}>
            {isSelected && <View style={[styles.radioInner, { backgroundColor: OWNER_COLORS.primary }]} />}
          </View>
        </View>
        <View style={styles.optionContent}>
          <Text style={[styles.optionName, { color: Colors.primaryText }]}>
            {supervisor.business_name || supervisor.email || 'Supervisor'}
          </Text>
          <Text style={[styles.optionStats, { color: Colors.secondaryText }]}>
            {supervisor.email}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={OWNER_COLORS.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
              {t('assign.title', 'Assign Project')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!hasChanges || saving}
            style={[
              styles.saveButton,
              hasChanges && !saving
                ? { backgroundColor: OWNER_COLORS.primary }
                : { backgroundColor: Colors.border },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[
                styles.saveButtonText,
                { color: hasChanges ? '#fff' : Colors.secondaryText },
              ]}>
                {t('common.save', 'Save')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Project Name */}
        <View style={[styles.projectInfo, { backgroundColor: Colors.card || Colors.white }]}>
          <Ionicons name="briefcase-outline" size={20} color={OWNER_COLORS.primary} />
          <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
            {project?.name || 'Project'}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
          </View>
        ) : (
          <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
            {/* "Manage Directly" option */}
            <TouchableOpacity
              style={[
                styles.optionRow,
                { borderBottomColor: Colors.border },
                selectedId === null && styles.optionRowSelected,
              ]}
              onPress={() => setSelectedId(null)}
              activeOpacity={0.7}
            >
              <View style={styles.radioContainer}>
                <View style={[
                  styles.radioOuter,
                  { borderColor: selectedId === null ? OWNER_COLORS.primary : Colors.secondaryText },
                ]}>
                  {selectedId === null && (
                    <View style={[styles.radioInner, { backgroundColor: OWNER_COLORS.primary }]} />
                  )}
                </View>
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionName, { color: Colors.primaryText }]}>
                  {t('assign.manageDirectly', 'Manage Directly')}
                </Text>
                <Text style={[styles.optionStats, { color: Colors.secondaryText }]}>
                  {t('assign.manageDirectlyDesc', 'You will manage this project')}
                </Text>
              </View>
              {selectedId === null && (
                <Ionicons name="checkmark-circle" size={22} color={OWNER_COLORS.primary} />
              )}
            </TouchableOpacity>

            {/* Divider */}
            {supervisors.length > 0 && (
              <View style={[styles.divider, { backgroundColor: Colors.border }]}>
                <Text style={[styles.dividerText, { color: Colors.secondaryText }]}>
                  {t('assign.orAssignTo', 'Or assign to a supervisor')}
                </Text>
              </View>
            )}

            {/* Supervisor list */}
            {supervisors.length > 0 ? (
              supervisors.map(renderSupervisorOption)
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
                  {t('assign.noSupervisors', 'No Supervisors Yet')}
                </Text>
                <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
                  {t('assign.inviteFirst', 'Invite supervisors from the Supervisors tab first')}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
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
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader || 18,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: FontSizes.body || 16,
    fontWeight: '600',
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  projectName: {
    fontSize: FontSizes.body || 16,
    fontWeight: '600',
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsList: {
    flex: 1,
    paddingTop: Spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(30, 64, 175, 0.05)',
  },
  radioContainer: {
    marginRight: Spacing.md,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  optionContent: {
    flex: 1,
  },
  optionName: {
    fontSize: FontSizes.body || 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  optionStats: {
    fontSize: FontSizes.caption || 13,
  },
  divider: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dividerText: {
    fontSize: FontSizes.caption || 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 2,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader || 18,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: FontSizes.body || 14,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
});
