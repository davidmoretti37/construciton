/**
 * OwnerWorkersScreen
 * Owner's version of Workers screen with 3 internal tabs:
 * - Schedule
 * - Reports
 * - Team (combined Supervisors + Workers)
 *
 * Uses the existing WorkersScreen for Schedule/Reports tabs
 * Team tab shows both Supervisors and Workers in one view
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';
import { fetchWorkersForOwner } from '../../utils/storage/workers';
import WorkerCard from '../../components/WorkerCard';

// Import the regular WorkersScreen to render for Schedule/Reports tabs
import WorkersScreen from '../WorkersScreen';

// Owner color palette
const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};

// Supervisor Card Component (no animation)
const SupervisorCard = ({ supervisor, onPress, Colors, tOwner }) => {
  const initial = supervisor.business_name?.charAt(0)?.toUpperCase() ||
    supervisor.email?.charAt(0)?.toUpperCase() || 'S';

  return (
    <TouchableOpacity
      style={[styles.supervisorCard, { backgroundColor: Colors.card || Colors.white }]}
      onPress={onPress}
      activeOpacity={0.7}
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
          <View style={[styles.statBadge, { backgroundColor: `${OWNER_COLORS.primaryLight}12` }]}>
            <Ionicons name="briefcase" size={12} color={OWNER_COLORS.primaryLight} />
            <Text style={[styles.statBadgeText, { color: OWNER_COLORS.primaryLight }]}>
              {supervisor.project_count || 0} {tOwner('supervisors.jobs')}
            </Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: `${OWNER_COLORS.success}12` }]}>
            <Ionicons name="people" size={12} color={OWNER_COLORS.success} />
            <Text style={[styles.statBadgeText, { color: OWNER_COLORS.success }]}>
              {supervisor.worker_count || 0} {tOwner('supervisors.workers')}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.chevronContainer, { backgroundColor: `${OWNER_COLORS.primary}10` }]}>
        <Ionicons name="chevron-forward" size={18} color={OWNER_COLORS.primary} />
      </View>
    </TouchableOpacity>
  );
};

// Worker Card Horizontal (matches SupervisorCard style)
const WorkerCardHorizontal = ({ worker, onPress, Colors, t }) => {
  const initial = worker.full_name?.charAt(0)?.toUpperCase() || 'W';
  const statusColor = worker.status === 'active' ? OWNER_COLORS.success : '#9CA3AF';

  // Format payment info
  const getPaymentInfo = () => {
    if (worker.hourly_rate) return `$${worker.hourly_rate}/hr`;
    if (worker.daily_rate) return `$${worker.daily_rate}/day`;
    if (worker.weekly_salary) return `$${worker.weekly_salary}/wk`;
    if (worker.project_rate) return `$${worker.project_rate}/project`;
    return null;
  };

  return (
    <TouchableOpacity
      style={[styles.supervisorCard, { backgroundColor: Colors.card || Colors.white }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.workerAvatarContainer, { backgroundColor: statusColor }]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>

      <View style={styles.supervisorInfo}>
        <Text style={[styles.supervisorName, { color: Colors.primaryText }]} numberOfLines={1}>
          {worker.full_name || 'Worker'}
        </Text>
        {worker.trade && (
          <View style={styles.workerTradeRow}>
            <Ionicons name="construct-outline" size={12} color={Colors.secondaryText} />
            <Text style={[styles.supervisorEmail, { color: Colors.secondaryText, marginBottom: 0 }]} numberOfLines={1}>
              {worker.trade}
            </Text>
          </View>
        )}
        <View style={styles.supervisorStats}>
          <View style={[styles.statBadge, { backgroundColor: `${statusColor}15` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statBadgeText, { color: statusColor }]}>
              {worker.status === 'active' ? t('status.active') : t('status.inactive')}
            </Text>
          </View>
          {getPaymentInfo() && (
            <View style={[styles.statBadge, { backgroundColor: `${OWNER_COLORS.primaryLight}12` }]}>
              <Ionicons name="cash-outline" size={12} color={OWNER_COLORS.primaryLight} />
              <Text style={[styles.statBadgeText, { color: OWNER_COLORS.primaryLight }]}>
                {getPaymentInfo()}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.chevronContainer, { backgroundColor: `${statusColor}15` }]}>
        <Ionicons name="chevron-forward" size={18} color={statusColor} />
      </View>
    </TouchableOpacity>
  );
};

// Pending Invite Card (no animation)
const PendingInviteCard = ({ invite, onCancel, Colors, tOwner }) => (
  <View style={[styles.inviteCard, { borderColor: `${OWNER_COLORS.warning}25` }]}>
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
        <Text style={[styles.pendingLabel, { color: OWNER_COLORS.warning }]}>{tOwner('inviteErrors.pendingInvitation')}</Text>
      </View>
    </View>

    <TouchableOpacity
      onPress={onCancel}
      style={[styles.cancelButton, { backgroundColor: `${OWNER_COLORS.error}10` }]}
    >
      <Ionicons name="close" size={18} color={OWNER_COLORS.error} />
    </TouchableOpacity>
  </View>
);

export default function OwnerWorkersScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('workers');
  const { t: tOwner } = useTranslation('owner');
  const navigation = useNavigation();
  const route = useRoute();
  const { user, profile } = useAuth();

  const openEmailPicker = (toEmail, subject, body) => {
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    const mailtoUrl = `mailto:${toEmail}?subject=${encodedSubject}&body=${encodedBody}`;
    const gmailUrl = `googlegmail:///co?to=${toEmail}&subject=${encodedSubject}&body=${encodedBody}`;

    Alert.alert(
      tOwner('emailPicker.sendInvitation'),
      tOwner('emailPicker.chooseEmailApp'),
      [
        {
          text: tOwner('emailPicker.gmail'),
          onPress: () => Linking.openURL(gmailUrl).catch(() => {
            Alert.alert(tOwner('emailPicker.gmailNotFound'), tOwner('emailPicker.gmailNotInstalled'));
            Linking.openURL(mailtoUrl).catch(() => {});
          }),
        },
        {
          text: tOwner('emailPicker.appleMail'),
          onPress: () => Linking.openURL(mailtoUrl).catch(() => {}),
        },
        { text: t('actions.cancel'), style: 'cancel' },
      ]
    );
  };

  // Handle route param to auto-open add worker modal from QuickActionFAB
  useEffect(() => {
    if (route.params?.openAddWorker) {
      // Switch to Team tab and open role picker
      setActiveTab('team');
      setShowRolePicker(true);
      // Clear the param so it doesn't trigger again
      navigation.setParams({ openAddWorker: undefined });
    }
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
      navigation.setParams({ initialTab: undefined });
    }
    if (route.params?.openAddSupervisor) {
      setActiveTab('team');
      setShowAddModal(true);
      navigation.setParams({ openAddSupervisor: undefined });
    }
  }, [route.params?.openAddWorker, route.params?.initialTab, route.params?.openAddSupervisor]);

  // Tab state - 3 tabs for owner (Schedule, Reports, Team)
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'reports' | 'team'

  // Team tab state (supervisors + workers)
  const [supervisors, setSupervisors] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [workerForm, setWorkerForm] = useState({
    name: '',
    email: '',
    phone: '',
    trade: '',
    paymentType: 'hourly',
    hourlyRate: '',
    dailyRate: '',
    weeklySalary: '',
    projectRate: '',
  });
  const [addingWorker, setAddingWorker] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    fullName: '',
    phone: '',
    paymentType: 'hourly',
    hourlyRate: '',
    dailyRate: '',
    weeklySalary: '',
    projectRate: '',
  });
  const [inviting, setInviting] = useState(false);

  // Fetch supervisors
  const fetchSupervisors = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: supervisorData, error: rpcError } = await supabase.rpc('get_owner_supervisors', {
        p_owner_id: user.id,
      });

      if (rpcError) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, business_name, business_phone, is_onboarded, created_at')
          .eq('owner_id', user.id)
          .eq('role', 'supervisor');

        setSupervisors(profileData?.map(p => ({
          ...p,
          email: p.business_email || '',
          project_count: 0,
          worker_count: 0,
        })) || []);
      } else {
        setSupervisors(supervisorData || []);
      }

      const { data: inviteData } = await supabase
        .from('supervisor_invites')
        .select('*')
        .eq('owner_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      setPendingInvites(inviteData || []);
    } catch (error) {
      console.log('Supervisor fetch error:', error);
    } finally {
      setSupervisorsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Fetch workers for Team tab
  const fetchWorkers = useCallback(async () => {
    setWorkersLoading(true);
    try {
      const data = await fetchWorkersForOwner();
      setWorkers(data || []);
    } catch (error) {
      console.log('Worker fetch error:', error);
    } finally {
      setWorkersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'team') {
      fetchSupervisors();
      fetchWorkers();
    }
  }, [activeTab, fetchSupervisors, fetchWorkers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSupervisors();
    fetchWorkers();
  }, [fetchSupervisors, fetchWorkers]);

  const handleAddSupervisor = async () => {
    if (!inviteForm.email.trim()) {
      Alert.alert(t('errors.error'), tOwner('inviteErrors.enterEmail'));
      return;
    }

    // Validate rate for selected payment type
    const rateValue = {
      hourly: parseFloat(inviteForm.hourlyRate) || 0,
      daily: parseFloat(inviteForm.dailyRate) || 0,
      weekly: parseFloat(inviteForm.weeklySalary) || 0,
      project_based: parseFloat(inviteForm.projectRate) || 0,
    }[inviteForm.paymentType];

    if (rateValue <= 0) {
      Alert.alert(t('errors.error'), t('errors.saveFailed'));
      return;
    }

    setInviting(true);
    try {
      const { error } = await supabase
        .from('supervisor_invites')
        .insert({
          owner_id: user.id,
          email: inviteForm.email.trim().toLowerCase(),
          full_name: inviteForm.fullName.trim() || null,
          phone: inviteForm.phone.trim() || null,
          status: 'pending',
          payment_type: inviteForm.paymentType,
          hourly_rate: parseFloat(inviteForm.hourlyRate) || 0,
          daily_rate: parseFloat(inviteForm.dailyRate) || 0,
          weekly_salary: parseFloat(inviteForm.weeklySalary) || 0,
          project_rate: parseFloat(inviteForm.projectRate) || 0,
        });

      if (error) {
        if (error.code === '23505') {
          Alert.alert(t('errors.error'), tOwner('inviteErrors.alreadySent'));
        } else {
          throw error;
        }
      } else {
        const invitedEmail = inviteForm.email.trim().toLowerCase();
        const invitedName = inviteForm.fullName.trim();
        setShowAddModal(false);
        setInviteForm({
          email: '',
          fullName: '',
          phone: '',
          paymentType: 'hourly',
          hourlyRate: '',
          dailyRate: '',
          weeklySalary: '',
          projectRate: '',
        });
        fetchSupervisors();

        // Let user pick Gmail or Apple Mail
        const businessName = profile?.business_name || 'our company';
        const greeting = invitedName ? `Hi ${invitedName},` : 'Hi,';
        const inviteLink = `https://construciton-production.up.railway.app/invite?email=${encodeURIComponent(invitedEmail)}&role=supervisor`;
        openEmailPicker(
          invitedEmail,
          `You're invited to join ${businessName} on Sylk`,
          `${greeting}\n\nYou've been invited to join ${businessName} as a Supervisor on Sylk — the construction management app.\n\nTap here to get started:\n${inviteLink}\n\nAs a supervisor, you'll be able to manage projects, track workers, handle finances, and more.\n\nLooking forward to working with you!\n\n— ${profile?.business_name || 'Your team'}`,
        );
      }
    } catch (error) {
      Alert.alert(t('errors.error'), tOwner('inviteErrors.sendFailed'));
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId) => {
    Alert.alert(
      tOwner('inviteErrors.cancelInvitation'),
      tOwner('inviteErrors.cancelConfirm'),
      [
        { text: t('actions.cancel'), style: 'cancel' },
        {
          text: tOwner('inviteErrors.yesCancel'),
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('supervisor_invites').delete().eq('id', inviteId);
              fetchSupervisors();
            } catch (error) {
              Alert.alert(t('errors.error'), tOwner('inviteErrors.cancelFailed'));
            }
          },
        },
      ]
    );
  };

  const handleSupervisorPress = (supervisor) => {
    // Navigate to supervisor detail screen to view time tracking, payments, etc.
    navigation.navigate('SupervisorDetail', { supervisor });
  };

  const handleAddWorkerSubmit = async () => {
    if (!workerForm.name.trim()) {
      Alert.alert(t('errors.error'), t('errors.nameRequired'));
      return;
    }

    // Validate rate for selected payment type
    const rateValue = {
      hourly: parseFloat(workerForm.hourlyRate) || 0,
      daily: parseFloat(workerForm.dailyRate) || 0,
      weekly: parseFloat(workerForm.weeklySalary) || 0,
      project_based: parseFloat(workerForm.projectRate) || 0,
    }[workerForm.paymentType];

    if (rateValue <= 0) {
      Alert.alert(t('errors.error'), t('errors.saveFailed'));
      return;
    }

    setAddingWorker(true);
    try {
      // If worker has email, set status to 'pending' so they can accept the invitation
      // If no email, set to 'active' immediately (owner manages them directly)
      const hasEmail = workerForm.email.trim();

      const { error } = await supabase
        .from('workers')
        .insert({
          owner_id: user.id,
          full_name: workerForm.name.trim(),
          email: workerForm.email.trim() || null,
          phone: workerForm.phone.trim() || null,
          trade: workerForm.trade.trim() || null,
          payment_type: workerForm.paymentType,
          hourly_rate: parseFloat(workerForm.hourlyRate) || 0,
          daily_rate: parseFloat(workerForm.dailyRate) || 0,
          weekly_salary: parseFloat(workerForm.weeklySalary) || 0,
          project_rate: parseFloat(workerForm.projectRate) || 0,
          status: hasEmail ? 'pending' : 'active',
          user_id: null, // Will be set when worker accepts invitation
        });

      if (error) throw error;

      const workerEmail = workerForm.email.trim().toLowerCase();
      const workerName = workerForm.name.trim();
      setShowAddWorkerModal(false);
      setWorkerForm({
        name: '',
        email: '',
        phone: '',
        trade: '',
        paymentType: 'hourly',
        hourlyRate: '',
        dailyRate: '',
        weeklySalary: '',
        projectRate: '',
      });
      fetchWorkers();

      // Let user pick Gmail or Apple Mail if worker has email
      if (hasEmail) {
        const businessName = profile?.business_name || 'our company';
        const greeting = workerName ? `Hi ${workerName},` : 'Hi,';
        const inviteLink = `https://construciton-production.up.railway.app/invite?email=${encodeURIComponent(workerEmail)}&role=worker`;
        openEmailPicker(
          workerEmail,
          `You're invited to join ${businessName} on Sylk`,
          `${greeting}\n\nYou've been invited to join ${businessName} as a Worker on Sylk — the construction management app.\n\nTap here to get started:\n${inviteLink}\n\nLooking forward to working with you!\n\n— ${profile?.business_name || 'Your team'}`,
        );
      } else {
        Alert.alert(t('success.title'), t('success.workerAdded'));
      }
    } catch (error) {
      console.log('Add worker error:', error);
      Alert.alert(t('errors.error'), t('errors.saveFailed'));
    } finally {
      setAddingWorker(false);
    }
  };

  // Always render unified header with tabs, then content based on active tab
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
      {/* Unified Header with Tabs - always rendered */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        {/* Tab Bar - 3 tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'schedule' && styles.activeTab]}
            onPress={() => setActiveTab('schedule')}
          >
            <Ionicons
              name={activeTab === 'schedule' ? "calendar" : "calendar-outline"}
              size={18}
              color={activeTab === 'schedule' ? OWNER_COLORS.primary : Colors.secondaryText}
            />
            <Text style={[styles.tabText, activeTab === 'schedule' && { color: OWNER_COLORS.primary, fontWeight: '600' }]}>
              Schedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'reports' && styles.activeTab]}
            onPress={() => setActiveTab('reports')}
          >
            <Ionicons
              name={activeTab === 'reports' ? "document-text" : "document-text-outline"}
              size={18}
              color={activeTab === 'reports' ? OWNER_COLORS.primary : Colors.secondaryText}
            />
            <Text style={[styles.tabText, activeTab === 'reports' && { color: OWNER_COLORS.primary, fontWeight: '600' }]}>
              Reports
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'team' && styles.activeTab]}
            onPress={() => setActiveTab('team')}
          >
            <Ionicons
              name={activeTab === 'team' ? "people" : "people-outline"}
              size={18}
              color={activeTab === 'team' ? OWNER_COLORS.primary : Colors.secondaryText}
            />
            <Text style={[styles.tabText, activeTab === 'team' && { color: OWNER_COLORS.primary, fontWeight: '600' }]}>
              Team
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Add Team Member Button - only on Team tab */}
      {activeTab === 'team' && (
        <View style={styles.addButtonContainer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              console.log('[OwnerWorkersScreen] Add Team Member pressed');
              setShowRolePicker(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add Team Member</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content based on active tab */}
      {/* Schedule/Reports tabs - render WorkersScreen without header */}
      {(activeTab === 'schedule' || activeTab === 'reports') && (
        <WorkersScreen
          navigation={navigation}
          ownerMode={true}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showHeader={false}
        />
      )}

      {/* Team tab - render supervisors + workers */}
      {activeTab === 'team' && (
        <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={OWNER_COLORS.primary} />
        }
      >
        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
              PENDING INVITATIONS
            </Text>
            {pendingInvites.map((invite, index) => (
              <PendingInviteCard
                key={invite.id}
                invite={invite}
                onCancel={() => handleCancelInvite(invite.id)}
                Colors={Colors}
                index={index}
                tOwner={tOwner}
              />
            ))}
          </View>
        )}

        {/* Supervisors Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            {tOwner('supervisors.title').toUpperCase()}
          </Text>
          {supervisorsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={OWNER_COLORS.primary} />
            </View>
          ) : supervisors.length > 0 ? (
            supervisors.map((supervisor, index) => (
              <SupervisorCard
                key={supervisor.id}
                supervisor={supervisor}
                onPress={() => handleSupervisorPress(supervisor)}
                Colors={Colors}
                index={index}
                tOwner={tOwner}
              />
            ))
          ) : (
            <View style={styles.emptySection}>
              <Text style={[styles.emptySectionText, { color: Colors.secondaryText }]}>
                {tOwner('supervisors.emptyTitle')}
              </Text>
            </View>
          )}
        </View>

        {/* Workers Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            {t('title').toUpperCase()}
          </Text>
          {workersLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={OWNER_COLORS.primary} />
            </View>
          ) : workers.length > 0 ? (
            workers.map((worker) => (
              <WorkerCardHorizontal
                key={worker.id}
                worker={worker}
                onPress={() => navigation.navigate('WorkerDetailHistory', { worker })}
                Colors={Colors}
                t={t}
              />
            ))
          ) : (
            <View style={styles.emptySection}>
              <Text style={[styles.emptySectionText, { color: Colors.secondaryText }]}>
                {t('noWorkers')}
              </Text>
            </View>
          )}
        </View>
        </ScrollView>
      )}

      {/* Role Picker Modal */}
      <Modal
        visible={showRolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRolePicker(false)}
      >
        <TouchableOpacity
          style={styles.rolePickerOverlay}
          activeOpacity={1}
          onPress={() => setShowRolePicker(false)}
        >
          <View style={[styles.rolePickerContainer, { backgroundColor: Colors.card || Colors.white }]}>
            <Text style={[styles.rolePickerTitle, { color: Colors.primaryText }]}>
              {tOwner('teamPicker.addTeamMember')}
            </Text>

            <TouchableOpacity
              style={[styles.roleOption, { backgroundColor: `${OWNER_COLORS.primary}08` }]}
              onPress={() => {
                setShowRolePicker(false);
                setShowAddModal(true);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.roleIconContainer, { backgroundColor: OWNER_COLORS.primary }]}>
                <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
              </View>
              <View style={styles.roleInfo}>
                <Text style={[styles.roleTitle, { color: Colors.primaryText }]}>{tOwner('teamPicker.addSupervisor')}</Text>
                <Text style={[styles.roleDescription, { color: Colors.secondaryText }]}>
                  {tOwner('teamPicker.supervisorDesc')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleOption, { backgroundColor: `${OWNER_COLORS.success}08` }]}
              onPress={() => {
                setShowRolePicker(false);
                setShowAddWorkerModal(true);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.roleIconContainer, { backgroundColor: OWNER_COLORS.success }]}>
                <Ionicons name="person-add-outline" size={24} color="#fff" />
              </View>
              <View style={styles.roleInfo}>
                <Text style={[styles.roleTitle, { color: Colors.primaryText }]}>{tOwner('teamPicker.addWorker')}</Text>
                <Text style={[styles.roleDescription, { color: Colors.secondaryText }]}>
                  {tOwner('teamPicker.workerDesc')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelRoleButton}
              onPress={() => setShowRolePicker(false)}
            >
              <Text style={[styles.cancelRoleText, { color: Colors.secondaryText }]}>{t('actions.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={{ color: Colors.secondaryText }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
                Add Supervisor
              </Text>
              <TouchableOpacity
                onPress={handleAddSupervisor}
                disabled={inviting || !inviteForm.email.trim()}
              >
                <View style={[styles.sendBadge, { backgroundColor: inviteForm.email.trim() ? OWNER_COLORS.primary : `${OWNER_COLORS.primary}30` }]}>
                  <Text style={styles.sendText}>{inviting ? '...' : 'Send'}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Email Address <Text style={{ color: OWNER_COLORS.error }}>*</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={inviteForm.email}
                    onChangeText={(text) => setInviteForm({ ...inviteForm, email: text })}
                    placeholder="supervisor@email.com"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Full Name <Text style={{ color: Colors.secondaryText }}>(optional)</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="person-outline" size={20} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={inviteForm.fullName}
                    onChangeText={(text) => setInviteForm({ ...inviteForm, fullName: text })}
                    placeholder="John Doe"
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Phone <Text style={{ color: Colors.secondaryText }}>(optional)</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="call-outline" size={20} color={Colors.secondaryText} />
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

              {/* Payment Type Selection */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Payment Type <Text style={{ color: OWNER_COLORS.error }}>*</Text>
                </Text>
                <View style={styles.paymentTypeRow}>
                  {[
                    { key: 'hourly', label: 'Hourly', icon: 'time-outline' },
                    { key: 'daily', label: 'Daily', icon: 'today-outline' },
                    { key: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
                    { key: 'project_based', label: 'Project', icon: 'briefcase-outline' },
                  ].map((type) => (
                    <TouchableOpacity
                      key={type.key}
                      style={[
                        styles.paymentTypeButton,
                        { borderColor: Colors.border },
                        inviteForm.paymentType === type.key && { backgroundColor: OWNER_COLORS.primary, borderColor: OWNER_COLORS.primary },
                      ]}
                      onPress={() => setInviteForm({ ...inviteForm, paymentType: type.key })}
                    >
                      <Ionicons
                        name={type.icon}
                        size={18}
                        color={inviteForm.paymentType === type.key ? '#fff' : Colors.secondaryText}
                      />
                      <Text style={[
                        styles.paymentTypeText,
                        { color: inviteForm.paymentType === type.key ? '#fff' : Colors.secondaryText }
                      ]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Payment Rate Input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  {inviteForm.paymentType === 'hourly' ? 'Hourly Rate' :
                   inviteForm.paymentType === 'daily' ? 'Daily Rate' :
                   inviteForm.paymentType === 'weekly' ? 'Weekly Salary' : 'Project Rate'}
                  <Text style={{ color: OWNER_COLORS.error }}> *</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Text style={{ color: Colors.secondaryText, fontSize: 18 }}>$</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={
                      inviteForm.paymentType === 'hourly' ? inviteForm.hourlyRate :
                      inviteForm.paymentType === 'daily' ? inviteForm.dailyRate :
                      inviteForm.paymentType === 'weekly' ? inviteForm.weeklySalary : inviteForm.projectRate
                    }
                    onChangeText={(text) => {
                      const field = {
                        hourly: 'hourlyRate',
                        daily: 'dailyRate',
                        weekly: 'weeklySalary',
                        project_based: 'projectRate'
                      }[inviteForm.paymentType];
                      setInviteForm({ ...inviteForm, [field]: text });
                    }}
                    placeholder="0.00"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="decimal-pad"
                  />
                  <Text style={{ color: Colors.secondaryText }}>
                    /{inviteForm.paymentType === 'hourly' ? 'hr' :
                      inviteForm.paymentType === 'daily' ? 'day' :
                      inviteForm.paymentType === 'weekly' ? 'wk' : 'project'}
                  </Text>
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: `${OWNER_COLORS.primary}08` }]}>
                <Ionicons name="information-circle" size={20} color={OWNER_COLORS.primary} />
                <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                  The supervisor will receive an invitation when they sign up with this email address.
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Worker Modal */}
      <Modal
        visible={showAddWorkerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddWorkerModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: Colors.background }]}
        >
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowAddWorkerModal(false)}>
                <Text style={{ color: Colors.secondaryText }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
                Add Worker
              </Text>
              <TouchableOpacity
                onPress={handleAddWorkerSubmit}
                disabled={addingWorker || !workerForm.name.trim()}
              >
                <View style={[styles.sendBadge, { backgroundColor: workerForm.name.trim() ? OWNER_COLORS.success : `${OWNER_COLORS.success}30` }]}>
                  <Text style={styles.sendText}>{addingWorker ? '...' : 'Add'}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Full Name <Text style={{ color: OWNER_COLORS.error }}>*</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="person-outline" size={20} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={workerForm.name}
                    onChangeText={(text) => setWorkerForm({ ...workerForm, name: text })}
                    placeholder="John Doe"
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Email <Text style={{ color: Colors.secondaryText }}>(optional)</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={workerForm.email}
                    onChangeText={(text) => setWorkerForm({ ...workerForm, email: text })}
                    placeholder="worker@email.com"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Phone <Text style={{ color: Colors.secondaryText }}>(optional)</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="call-outline" size={20} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={workerForm.phone}
                    onChangeText={(text) => setWorkerForm({ ...workerForm, phone: text })}
                    placeholder="+1 555-1234"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Trade/Role <Text style={{ color: Colors.secondaryText }}>(optional)</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Ionicons name="construct-outline" size={20} color={Colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={workerForm.trade}
                    onChangeText={(text) => setWorkerForm({ ...workerForm, trade: text })}
                    placeholder="Carpenter, Electrician, etc."
                    placeholderTextColor={Colors.secondaryText}
                  />
                </View>
              </View>

              {/* Payment Type Selection */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  Payment Type <Text style={{ color: OWNER_COLORS.error }}>*</Text>
                </Text>
                <View style={styles.paymentTypeRow}>
                  {[
                    { key: 'hourly', label: 'Hourly', icon: 'time-outline' },
                    { key: 'daily', label: 'Daily', icon: 'today-outline' },
                    { key: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
                    { key: 'project_based', label: 'Project', icon: 'briefcase-outline' },
                  ].map((type) => (
                    <TouchableOpacity
                      key={type.key}
                      style={[
                        styles.paymentTypeButton,
                        { borderColor: Colors.border },
                        workerForm.paymentType === type.key && { backgroundColor: OWNER_COLORS.success, borderColor: OWNER_COLORS.success },
                      ]}
                      onPress={() => setWorkerForm({ ...workerForm, paymentType: type.key })}
                    >
                      <Ionicons
                        name={type.icon}
                        size={18}
                        color={workerForm.paymentType === type.key ? '#fff' : Colors.secondaryText}
                      />
                      <Text style={[
                        styles.paymentTypeText,
                        { color: workerForm.paymentType === type.key ? '#fff' : Colors.secondaryText }
                      ]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Payment Rate Input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                  {workerForm.paymentType === 'hourly' ? 'Hourly Rate' :
                   workerForm.paymentType === 'daily' ? 'Daily Rate' :
                   workerForm.paymentType === 'weekly' ? 'Weekly Salary' : 'Project Rate'}
                  <Text style={{ color: OWNER_COLORS.error }}> *</Text>
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                  <Text style={{ color: Colors.secondaryText, fontSize: 18 }}>$</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText }]}
                    value={
                      workerForm.paymentType === 'hourly' ? workerForm.hourlyRate :
                      workerForm.paymentType === 'daily' ? workerForm.dailyRate :
                      workerForm.paymentType === 'weekly' ? workerForm.weeklySalary : workerForm.projectRate
                    }
                    onChangeText={(text) => {
                      const field = {
                        hourly: 'hourlyRate',
                        daily: 'dailyRate',
                        weekly: 'weeklySalary',
                        project_based: 'projectRate'
                      }[workerForm.paymentType];
                      setWorkerForm({ ...workerForm, [field]: text });
                    }}
                    placeholder="0.00"
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="decimal-pad"
                  />
                  <Text style={{ color: Colors.secondaryText }}>
                    /{workerForm.paymentType === 'hourly' ? 'hr' :
                      workerForm.paymentType === 'daily' ? 'day' :
                      workerForm.paymentType === 'weekly' ? 'wk' : 'project'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    width: 40,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    minHeight: 48,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: OWNER_COLORS.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: LightColors.secondaryText,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  supervisorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  workerAvatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  workerTradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  supervisorInfo: {
    flex: 1,
  },
  supervisorName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  supervisorEmail: {
    fontSize: FontSizes.small,
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
    backgroundColor: `${OWNER_COLORS.warning}06`,
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
    lineHeight: 22,
  },
  workersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptySection: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
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
  modalTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
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
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
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
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  paymentTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  paymentTypeButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  paymentTypeText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  // Add Team Member button styles
  addButtonContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: OWNER_COLORS.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  addButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  // Role Picker Modal styles
  rolePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  rolePickerContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  rolePickerTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  roleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  roleInfo: {
    flex: 1,
  },
  roleTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  roleDescription: {
    fontSize: FontSizes.small,
  },
  cancelRoleButton: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  cancelRoleText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    textAlign: 'center',
  },
});
