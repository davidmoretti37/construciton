/**
 * SupervisorsScreen
 * Premium list of supervisors with their stats
 * Redesigned with modern SaaS-level polish
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import OwnerHeader from '../../components/OwnerHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Color palette for owner theme
const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  primaryDark: '#1E3A8A',
  secondary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};

// Animated Touchable
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Skeleton loading component
const SkeletonCard = ({ style }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.skeletonCard, animatedStyle, style]} />
  );
};

// Premium Supervisor Card Component
const SupervisorCard = ({ supervisor, onPress, Colors, isDark, index, t }) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const initial = supervisor.business_name?.charAt(0)?.toUpperCase() ||
    supervisor.email?.charAt(0)?.toUpperCase() || 'S';

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 80).springify().damping(15)}
    >
      <AnimatedTouchable
        style={[
          styles.supervisorCard,
          {
            backgroundColor: Colors.card || Colors.white,
            shadowColor: isDark ? '#000' : OWNER_COLORS.primary,
          },
          animatedStyle,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <LinearGradient
          colors={[OWNER_COLORS.primary, OWNER_COLORS.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarGradient}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>

        <View style={styles.supervisorInfo}>
          <Text style={[styles.supervisorName, { color: Colors.primaryText }]} numberOfLines={1}>
            {supervisor.business_name || supervisor.email?.split('@')[0] || 'Supervisor'}
          </Text>
          <Text style={[styles.supervisorEmail, { color: Colors.secondaryText }]} numberOfLines={1}>
            {supervisor.email}
          </Text>
          <View style={styles.supervisorStats}>
            <View style={[styles.statBadge, { backgroundColor: `${OWNER_COLORS.secondary}1A` }]}>
              <Ionicons name="briefcase" size={12} color={OWNER_COLORS.secondary} />
              <Text style={[styles.statBadgeText, { color: OWNER_COLORS.secondary }]}>
                {supervisor.project_count || 0} {t('supervisors.jobs')}
              </Text>
            </View>
            <View style={[styles.statBadge, { backgroundColor: `${OWNER_COLORS.success}1A` }]}>
              <Ionicons name="people" size={12} color={OWNER_COLORS.success} />
              <Text style={[styles.statBadgeText, { color: OWNER_COLORS.success }]}>
                {supervisor.worker_count || 0} {t('supervisors.workers')}
              </Text>
            </View>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} style={{ opacity: 0.4 }} />
      </AnimatedTouchable>
    </Animated.View>
  );
};

// Premium Pending Invite Card
const PendingInviteCard = ({ invite, onCancel, Colors, isDark, index, t }) => (
  <Animated.View
    entering={FadeInUp.delay(index * 80).springify().damping(15)}
    style={[
      styles.inviteCard,
      {
        backgroundColor: isDark ? `${OWNER_COLORS.warning}08` : `${OWNER_COLORS.warning}06`,
        borderColor: `${OWNER_COLORS.warning}25`,
      },
    ]}
  >
    <View style={[styles.inviteIconContainer, { backgroundColor: `${OWNER_COLORS.warning}15` }]}>
      <Ionicons name="mail-outline" size={22} color={OWNER_COLORS.warning} />
    </View>

    <View style={styles.supervisorInfo}>
      <Text style={[styles.supervisorName, { color: Colors.primaryText }]} numberOfLines={1}>
        {invite.full_name || invite.email?.split('@')[0] || 'Pending'}
      </Text>
      <Text style={[styles.supervisorEmail, { color: Colors.secondaryText }]} numberOfLines={1}>
        {invite.email}
      </Text>
      <View style={[styles.pendingBadge, { backgroundColor: `${OWNER_COLORS.warning}15` }]}>
        <Ionicons name="time-outline" size={12} color={OWNER_COLORS.warning} />
        <Text style={[styles.pendingLabel, { color: OWNER_COLORS.warning }]}>
          {t('inviteErrors.pendingInvitation')}
        </Text>
      </View>
    </View>

    <TouchableOpacity
      onPress={onCancel}
      style={[styles.cancelButton, { backgroundColor: `${OWNER_COLORS.error}10` }]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="close" size={18} color={OWNER_COLORS.error} />
    </TouchableOpacity>
  </Animated.View>
);

// Section Header
const SectionHeader = ({ title, count, Colors }) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
      {title}
    </Text>
    {count > 0 && (
      <View style={[styles.countBadge, { backgroundColor: `${OWNER_COLORS.primary}15` }]}>
        <Text style={[styles.countText, { color: OWNER_COLORS.primary }]}>{count}</Text>
      </View>
    )}
  </View>
);

// Empty State
const EmptyState = ({ onAdd, t, Colors, isDark }) => (
  <Animated.View
    entering={FadeInUp.delay(100).springify()}
    style={styles.emptyState}
  >
    <View style={[
      styles.emptyIcon,
      {
        backgroundColor: isDark ? `${OWNER_COLORS.primary}20` : `${OWNER_COLORS.primary}10`,
      }
    ]}>
      <Ionicons name="people-outline" size={48} color={OWNER_COLORS.primary} />
    </View>
    <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
      {t('supervisors.emptyTitle', 'No supervisors yet')}
    </Text>
    <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
      {t('supervisors.emptyText', 'Add supervisors to help manage your projects and workers')}
    </Text>
    <TouchableOpacity
      style={styles.emptyButton}
      onPress={onAdd}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[OWNER_COLORS.primary, OWNER_COLORS.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.emptyButtonGradient}
      >
        <Ionicons name="person-add-outline" size={20} color="#fff" />
        <Text style={styles.emptyButtonText}>
          {t('supervisors.addFirst', 'Add Your First Supervisor')}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  </Animated.View>
);

// Loading Skeleton
const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    <View style={styles.skeletonHeader}>
      <SkeletonCard style={{ width: 140, height: 32 }} />
      <SkeletonCard style={{ width: 44, height: 44, borderRadius: 22 }} />
    </View>
    {[1, 2, 3].map((i) => (
      <SkeletonCard key={i} style={{ height: 100, marginBottom: Spacing.md }} />
    ))}
  </View>
);

export default function SupervisorsScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');
  const { user, profile } = useAuth();
  const navigation = useNavigation();

  const openEmailPicker = (toEmail, subject, body) => {
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    const mailtoUrl = `mailto:${toEmail}?subject=${encodedSubject}&body=${encodedBody}`;
    const gmailUrl = `googlegmail:///co?to=${toEmail}&subject=${encodedSubject}&body=${encodedBody}`;

    Alert.alert(
      t('emailPicker.sendInvitation'),
      t('emailPicker.chooseEmailApp'),
      [
        {
          text: t('emailPicker.gmail'),
          onPress: () => Linking.openURL(gmailUrl).catch(() => {
            Alert.alert(t('emailPicker.gmailNotFound'), t('emailPicker.gmailNotInstalled'));
            Linking.openURL(mailtoUrl).catch(() => {});
          }),
        },
        {
          text: t('emailPicker.appleMail'),
          onPress: () => Linking.openURL(mailtoUrl).catch(() => {}),
        },
        { text: t('common:buttons.cancel'), style: 'cancel' },
      ]
    );
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [supervisors, setSupervisors] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', fullName: '', phone: '' });
  const [inviting, setInviting] = useState(false);

  const fetchSupervisors = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: supervisorData, error: rpcError } = await supabase.rpc('get_owner_supervisors', {
        p_owner_id: user.id,
      });

      if (rpcError) {
        console.log('RPC failed, using fallback query:', rpcError);
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, business_name, business_phone, is_onboarded, created_at')
            .eq('owner_id', user.id)
            .eq('role', 'supervisor');

          if (profileError) {
            console.log('Fallback query also failed:', profileError);
            // Just set empty supervisors if both queries fail
            setSupervisors([]);
          } else {
            setSupervisors(profileData?.map(p => ({
              ...p,
              email: p.business_email || '',
              project_count: 0,
              worker_count: 0,
            })) || []);
          }
        } catch (fallbackError) {
          console.log('Fallback error:', fallbackError);
          setSupervisors([]);
        }
      } else {
        setSupervisors(supervisorData || []);
      }

      const { data: inviteData, error: inviteError } = await supabase
        .from('supervisor_invites')
        .select('*')
        .eq('owner_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (inviteError) throw inviteError;
      setPendingInvites(inviteData || []);

    } catch (error) {
      // Log as warning since fallback handling is in place
      console.log('Supervisor fetch warning (fallback used):', error?.message || error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSupervisors();
  }, [fetchSupervisors]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSupervisors();
  }, [fetchSupervisors]);

  const handleAddSupervisor = async () => {
    if (!inviteForm.email.trim()) {
      Alert.alert(t('common:alerts.error'), t('inviteErrors.enterEmail'));
      return;
    }

    setInviting(true);
    try {
      const { data, error } = await supabase
        .from('supervisor_invites')
        .insert({
          owner_id: user.id,
          email: inviteForm.email.trim().toLowerCase(),
          full_name: inviteForm.fullName.trim() || null,
          phone: inviteForm.phone.trim() || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          Alert.alert(t('common:alerts.error'), t('inviteErrors.alreadySent'));
        } else {
          throw error;
        }
      } else {
        // Close modal and reset form
        setShowAddModal(false);
        const invitedEmail = inviteForm.email.trim().toLowerCase();
        const invitedName = inviteForm.fullName.trim();
        setInviteForm({ email: '', fullName: '', phone: '' });
        fetchSupervisors();

        // Let user pick Gmail or Apple Mail
        const businessName = profile?.business_name || 'our company';
        const supervisorGreeting = invitedName ? `Hi ${invitedName},` : 'Hi,';
        const inviteLink = `https://construciton-production.up.railway.app/invite?email=${encodeURIComponent(invitedEmail)}&role=supervisor`;
        openEmailPicker(
          invitedEmail,
          `You're invited to join ${businessName} on Sylk`,
          `${supervisorGreeting}\n\nYou've been invited to join ${businessName} as a Supervisor on Sylk — the construction management app.\n\nTap here to get started:\n${inviteLink}\n\nAs a supervisor, you'll be able to manage projects, track workers, handle finances, and more.\n\nLooking forward to working with you!\n\n— ${profile?.business_name || 'Your team'}`,
        );
      }
    } catch (error) {
      console.error('Error sending invite:', error);
      Alert.alert(t('common:alerts.error'), t('inviteErrors.sendFailed'));
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId) => {
    Alert.alert(
      t('inviteErrors.cancelInvitation'),
      t('inviteErrors.cancelConfirm'),
      [
        { text: t('common:buttons.no'), style: 'cancel' },
        {
          text: t('inviteErrors.yesCancel'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('supervisor_invites')
                .delete()
                .eq('id', inviteId);

              if (error) throw error;
              fetchSupervisors();
            } catch (error) {
              console.error('Error canceling invite:', error);
              Alert.alert(t('common:alerts.error'), t('inviteErrors.cancelFailed'));
            }
          },
        },
      ]
    );
  };

  const handleSupervisorPress = (supervisor) => {
    navigation.navigate('SupervisorDetail', { supervisor });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.scrollContent}>
          <LoadingSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = supervisors.length === 0 && pendingInvites.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={OWNER_COLORS.primary}
            colors={[OWNER_COLORS.primary]}
          />
        }
      >
        {/* Header with inline title */}
        <OwnerHeader title={t('supervisors.title', 'Supervisors')} />

        {isEmpty ? (
          <EmptyState onAdd={() => setShowAddModal(true)} t={t} Colors={Colors} isDark={isDark} />
        ) : (
          <>
            {/* Pending Invites Section */}
            {pendingInvites.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title={t('supervisors.pendingInvites', 'PENDING INVITATIONS')}
                  count={pendingInvites.length}
                  Colors={Colors}
                />
                {pendingInvites.map((invite, index) => (
                  <PendingInviteCard
                    key={invite.id}
                    invite={invite}
                    onCancel={() => handleCancelInvite(invite.id)}
                    Colors={Colors}
                    isDark={isDark}
                    index={index}
                    t={t}
                  />
                ))}
              </View>
            )}

            {/* Active Supervisors Section */}
            {supervisors.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title={t('supervisors.active', 'ACTIVE SUPERVISORS')}
                  count={supervisors.length}
                  Colors={Colors}
                />
                {supervisors.map((supervisor, index) => (
                  <SupervisorCard
                    key={supervisor.id}
                    supervisor={supervisor}
                    onPress={() => handleSupervisorPress(supervisor)}
                    Colors={Colors}
                    isDark={isDark}
                    index={index}
                    t={t}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Supervisor Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: Colors.background }]}
        >
          <SafeAreaView style={styles.modalSafeArea}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalButton}>
                <Text style={[styles.cancelText, { color: Colors.secondaryText }]}>{t('common:buttons.cancel')}</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
                {t('supervisors.addNew', 'Add Supervisor')}
              </Text>
              <TouchableOpacity
                onPress={handleAddSupervisor}
                disabled={inviting || !inviteForm.email.trim()}
                style={styles.modalButton}
              >
                {inviting ? (
                  <View style={[styles.sendingBadge, { backgroundColor: `${OWNER_COLORS.primary}15` }]}>
                    <Text style={[styles.sendingText, { color: OWNER_COLORS.primary }]}>...</Text>
                  </View>
                ) : (
                  <View style={[
                    styles.sendBadge,
                    {
                      backgroundColor: inviteForm.email.trim()
                        ? OWNER_COLORS.primary
                        : `${OWNER_COLORS.primary}30`
                    }
                  ]}>
                    <Text style={styles.sendText}>{t('common:buttons.send')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Form */}
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  {t('supervisors.email')}
                  <Text style={{ color: OWNER_COLORS.error }}> *</Text>
                </Text>
                <View style={[
                  styles.inputContainer,
                  {
                    backgroundColor: isDark ? Colors.card : '#F9FAFB',
                    borderColor: inviteForm.email.trim() ? OWNER_COLORS.primary : Colors.border,
                  }
                ]}>
                  <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={inviteForm.email}
                    onChangeText={(text) => setInviteForm({ ...inviteForm, email: text })}
                    placeholder="supervisor@email.com"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  {t('supervisors.fullName')}
                  <Text style={{ color: Colors.secondaryText }}> ({t('common:labels.optional')})</Text>
                </Text>
                <View style={[
                  styles.inputContainer,
                  { backgroundColor: isDark ? Colors.card : '#F9FAFB', borderColor: Colors.border }
                ]}>
                  <Ionicons name="person-outline" size={20} color={Colors.secondaryText} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={inviteForm.fullName}
                    onChangeText={(text) => setInviteForm({ ...inviteForm, fullName: text })}
                    placeholder="John Doe"
                    placeholderTextColor={Colors.secondaryText}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  {t('supervisors.phone')}
                  <Text style={{ color: Colors.secondaryText }}> ({t('common:labels.optional')})</Text>
                </Text>
                <View style={[
                  styles.inputContainer,
                  { backgroundColor: isDark ? Colors.card : '#F9FAFB', borderColor: Colors.border }
                ]}>
                  <Ionicons name="call-outline" size={20} color={Colors.secondaryText} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={inviteForm.phone}
                    onChangeText={(text) => setInviteForm({ ...inviteForm, phone: text })}
                    placeholder="+1 555-1234"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: `${OWNER_COLORS.primary}08` }]}>
                <View style={[styles.infoIconContainer, { backgroundColor: `${OWNER_COLORS.primary}15` }]}>
                  <Ionicons name="information" size={18} color={OWNER_COLORS.primary} />
                </View>
                <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                  {t('supervisors.inviteInfo', 'An email will be composed for you to send. The supervisor will sign up with this email and automatically receive the invitation.')}
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Supervisor FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[OWNER_COLORS.primary, OWNER_COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  skeletonContainer: {
    flex: 1,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  skeletonCard: {
    backgroundColor: '#E5E7EB',
    borderRadius: BorderRadius.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  addButton: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  addButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: OWNER_COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  countBadge: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
  },
  supervisorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  supervisorInfo: {
    flex: 1,
  },
  supervisorName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  supervisorEmail: {
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  supervisorStats: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  inviteIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pendingLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  emptyButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalButton: {
    minWidth: 60,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: FontSizes.body,
  },
  sendBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  sendText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  sendingBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  sendingText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  modalContent: {
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  inputIcon: {
    marginLeft: Spacing.md,
  },
  input: {
    flex: 1,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  infoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
});
