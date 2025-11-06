import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const ROLES = [
  {
    id: 'owner',
    name: 'Owner / Contractor',
    icon: 'business',
    description: 'Manage projects, estimates, workers, and clients with AI assistance',
    color: '#2563EB',
  },
  {
    id: 'worker',
    name: 'Worker',
    icon: 'hammer',
    description: 'Clock in/out, view assignments, upload photos, and track your hours',
    color: '#059669',
  },
  {
    id: 'client',
    name: 'Client',
    icon: 'person',
    description: 'View your projects, photos, updates, invoices, and message your contractor',
    color: '#7C3AED',
  },
];

export default function RoleSelectionScreen({ onRoleSelected }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const { setRole } = useAuth();

  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = async (roleId) => {
    setSelectedRole(roleId);
    setLoading(true);

    try {
      console.log('🎭 Role Selection - User selected:', roleId);

      // Save role to database
      const success = await setRole(roleId);

      if (success) {
        console.log('🎭 Role Selection - Role saved successfully');
        // Call callback to continue to next screen
        if (onRoleSelected) {
          onRoleSelected(roleId);
        }
      } else {
        console.error('🎭 Role Selection - Failed to save role');
        // Reset selection on error
        setSelectedRole(null);
      }
    } catch (error) {
      console.error('🎭 Role Selection - Error:', error);
      setSelectedRole(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
            <Ionicons name="people" size={48} color={Colors.primaryBlue} />
          </View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>Choose Your Role</Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            Select how you'll be using this app
          </Text>
        </View>

        {/* Role Cards */}
        <View style={styles.rolesContainer}>
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.id;
            const isDisabled = loading && !isSelected;

            return (
              <TouchableOpacity
                key={role.id}
                style={[
                  styles.roleCard,
                  {
                    backgroundColor: Colors.white,
                    borderColor: isSelected ? role.color : Colors.border,
                    borderWidth: isSelected ? 2 : 1,
                    opacity: isDisabled ? 0.5 : 1,
                  },
                ]}
                onPress={() => !loading && handleRoleSelect(role.id)}
                disabled={loading}
                activeOpacity={0.7}
              >
                {/* Icon */}
                <View
                  style={[
                    styles.roleIconContainer,
                    {
                      backgroundColor: role.color + '20',
                    },
                  ]}
                >
                  <Ionicons name={role.icon} size={32} color={role.color} />
                </View>

                {/* Content */}
                <View style={styles.roleContent}>
                  <Text style={[styles.roleName, { color: Colors.primaryText }]}>
                    {role.name}
                  </Text>
                  <Text style={[styles.roleDescription, { color: Colors.secondaryText }]}>
                    {role.description}
                  </Text>
                </View>

                {/* Selection Indicator */}
                {isSelected && loading ? (
                  <ActivityIndicator size="small" color={role.color} />
                ) : isSelected ? (
                  <View style={[styles.checkmark, { backgroundColor: role.color }]}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </View>
                ) : (
                  <View style={[styles.chevron]}>
                    <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info Box */}
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: Colors.primaryBlue + '10',
              borderColor: Colors.primaryBlue + '30',
            },
          ]}
        >
          <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
          <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
            You can't change your role later. Choose carefully based on how you'll use the app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  rolesContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roleIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleContent: {
    flex: 1,
  },
  roleName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  roleDescription: {
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
});
