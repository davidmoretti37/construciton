import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius } from '../constants/theme';

export default function ProjectsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Projects</Text>
        <TouchableOpacity style={styles.newProjectButton}>
          <Text style={styles.newProjectText}>+ New Project</Text>
        </TouchableOpacity>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.placeholderText} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor={Colors.placeholderText}
          />
        </View>

        <View style={styles.filterChips}>
          <TouchableOpacity style={[styles.chip, styles.activeChip]}>
            <Text style={styles.activeChipText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>Completed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>Archived</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Projects List */}
      <ScrollView style={styles.content}>
        <View style={styles.emptyState}>
          <Ionicons name="folder-outline" size={64} color={Colors.secondaryText} />
          <Text style={styles.emptyStateText}>No projects yet</Text>
          <Text style={styles.emptyStateSubtext}>Create your first project to get started</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  newProjectButton: {
    padding: Spacing.sm,
  },
  newProjectText: {
    fontSize: FontSizes.body,
    color: Colors.primaryBlue,
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.body,
    color: Colors.primaryText,
  },
  filterChips: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.lightGray,
  },
  activeChip: {
    backgroundColor: Colors.primaryBlue,
  },
  chipText: {
    fontSize: FontSizes.small,
    color: Colors.primaryText,
    fontWeight: '500',
  },
  activeChipText: {
    fontSize: FontSizes.small,
    color: Colors.white,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  projectCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  clientName: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    marginBottom: Spacing.md,
  },
  budgetSection: {
    marginBottom: Spacing.md,
  },
  budgetText: {
    fontSize: FontSizes.body,
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primaryBlue,
  },
  percentageText: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    textAlign: 'right',
  },
  workersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  workerAvatars: {
    flexDirection: 'row',
    marginRight: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  avatarText: {
    fontSize: FontSizes.tiny,
    color: Colors.white,
    fontWeight: '600',
  },
  workerCount: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    marginLeft: Spacing.md,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  statusSuccess: {
    backgroundColor: '#D1FAE5',
  },
  statusWarning: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  lastActivity: {
    fontSize: FontSizes.tiny,
    color: Colors.placeholderText,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
