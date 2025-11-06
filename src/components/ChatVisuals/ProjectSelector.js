import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProjectSelector({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const { projects = [], pendingUpdate = {} } = data;

  const handleProjectSelect = (project) => {
    if (onAction) {
      onAction({
        label: 'Select Project',
        type: 'select-project',
        data: {
          projectId: project.id,
          pendingUpdate: pendingUpdate
        }
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="list-outline" size={24} color={Colors.primaryBlue} />
        <Text style={[styles.headerText, { color: Colors.primaryText }]}>
          Select a Project
        </Text>
      </View>

      {/* Projects List */}
      {projects.map((project, index) => (
        <TouchableOpacity
          key={project.id || index}
          style={[
            styles.projectRow,
            index < projects.length - 1 && styles.borderBottom,
            { borderBottomColor: Colors.border }
          ]}
          onPress={() => handleProjectSelect(project)}
          activeOpacity={0.7}
        >
          {/* Left: Project Icon */}
          <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
            <Ionicons name="construct-outline" size={24} color={Colors.primaryBlue} />
          </View>

          {/* Middle: Project Info */}
          <View style={styles.projectInfo}>
            <Text style={[styles.projectName, { color: Colors.primaryText }]}>
              {project.name}
            </Text>
            {project.client && (
              <Text style={[styles.clientName, { color: Colors.secondaryText }]}>
                {project.client}
              </Text>
            )}
          </View>

          {/* Right: Chevron */}
          <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
        </TouchableOpacity>
      ))}

      {projects.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="folder-open-outline" size={32} color={Colors.secondaryText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No projects available
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  headerText: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  borderBottom: {
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  clientName: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.small,
  },
});
