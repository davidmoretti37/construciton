import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { updateWorker, deleteWorker } from '../utils/storage';
import { supabase } from '../lib/supabase';

export default function EditWorkerPaymentScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation(['workers', 'common']);
  const { worker } = route.params || {};

  // Worker info fields
  const [fullName, setFullName] = useState(worker?.full_name || '');
  const [phone, setPhone] = useState(worker?.phone || '');
  const [email, setEmail] = useState(worker?.email || '');
  const [trade, setTrade] = useState(worker?.trade || '');

  // Payment fields
  const [paymentType, setPaymentType] = useState(worker?.payment_type || 'hourly');
  const [hourlyRate, setHourlyRate] = useState(worker?.hourly_rate?.toString() || '');
  const [dailyRate, setDailyRate] = useState(worker?.daily_rate?.toString() || '');
  const [weeklySalary, setWeeklySalary] = useState(worker?.weekly_salary?.toString() || '');
  const [projectRate, setProjectRate] = useState(worker?.project_rate?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  // Whether the async owner check has resolved. Owner-only cards (payment,
  // promote, delete) stay hidden until this is true so an owner never taps
  // Save before the payment fields render.
  const [ownerChecked, setOwnerChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const checkOwner = () => {
    setOwnerChecked(false);
    // Check if current user is the owner (not supervisor)
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user) {
          // If auth uid matches the worker's owner_id, they're the owner
          setIsOwner(user.id === (worker?.owner_id));
        }
      })
      .catch((error) => {
        // Transient network/auth-refresh failure. Surface a non-blocking
        // retry so a legitimate owner isn't silently locked out of the
        // payment/promote/delete controls.
        console.error('Error checking owner:', error);
        Alert.alert(
          t('common:alerts.error'),
          t('common:errors.networkError'),
          [{ text: t('common:buttons.retry'), onPress: checkOwner }]
        );
      })
      .finally(() => {
        setOwnerChecked(true);
      });
  };

  useEffect(() => {
    if (!worker) return;
    checkOwner();
  }, []);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert(t('workers:errors.error'), t('workers:errors.nameRequired'));
      return;
    }

    try {
      setSaving(true);

      const updates = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        trade: trade.trim(),
      };

      // Only owners (and only after the owner check has resolved) can see and
      // edit payment fields, so only they may write them. This matches the UI
      // gating on the payment card.
      if (isOwner && ownerChecked) {
        updates.payment_type = paymentType;
        updates.hourly_rate = paymentType === 'hourly' ? parseFloat(hourlyRate) || 0 : (worker.hourly_rate || 0);
        updates.daily_rate = paymentType === 'daily' ? parseFloat(dailyRate) || 0 : (worker.daily_rate || 0);
        updates.weekly_salary = paymentType === 'weekly' ? parseFloat(weeklySalary) || 0 : (worker.weekly_salary || 0);
        updates.project_rate = paymentType === 'project_based' ? parseFloat(projectRate) || 0 : (worker.project_rate || 0);
      }

      const success = await updateWorker(worker.id, updates);

      if (success) {
        Alert.alert(t('workers:success.title'), t('workers:success.workerUpdated'), [
          { text: t('common:buttons.ok'), onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert(t('workers:errors.error'), t('workers:errors.saveFailed'));
      }
    } catch (error) {
      console.error('Error updating worker:', error);
      Alert.alert(t('workers:errors.error'), t('common:errors.general'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('workers:confirmDelete.title'),
      `Are you sure you want to delete ${worker.full_name}? This will remove all their data and cannot be undone.`,
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const success = await deleteWorker(worker.id);
              if (success) {
                Alert.alert(t('common:alerts.deleted'), `${worker.full_name} has been removed.`, [
                  { text: t('common:buttons.ok'), onPress: () => navigation.popToTop() }
                ]);
              } else {
                Alert.alert(t('workers:errors.error'), t('workers:errors.deleteFailed'));
              }
            } catch (error) {
              console.error('Error deleting worker:', error);
              Alert.alert(t('workers:errors.error'), t('common:errors.general'));
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handlePromoteToSupervisor = () => {
    Alert.alert(
      'Promote to Supervisor',
      `This will give ${fullName} supervisor access. They'll be able to manage workers, view projects, and track crew operations.\n\nThis action cannot be easily undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          onPress: async () => {
            try {
              setSaving(true);
              // Use the SECURITY DEFINER RPC — RLS otherwise blocks the
              // owner from updating someone else's profile, which is why
              // the previous client-side update silently no-op'd.
              const { data, error } = await supabase.rpc(
                'promote_worker_to_supervisor',
                { p_worker_id: worker.id }
              );

              if (error) {
                const msg = error.message || 'Failed to promote worker.';
                Alert.alert('Error', msg);
                return;
              }

              if (data?.success) {
                Alert.alert(
                  'Promoted',
                  `${fullName} is now a supervisor. They'll see the supervisor view next time they open the app.`,
                  [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
              } else {
                Alert.alert('Error', 'Promotion did not complete.');
              }
            } catch (e) {
              console.error('Promote error:', e);
              Alert.alert('Error', e?.message || 'Failed to promote worker.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const rateLabel = paymentType === 'hourly' ? t('workers:form.hourlyRate') :
    paymentType === 'daily' ? t('workers:form.dailyRate') :
    paymentType === 'weekly' ? t('workers:form.weeklySalary') : t('workers:form.projectRate');

  const rateSuffix = paymentType === 'hourly' ? t('workers:workerDetails.perHour') :
    paymentType === 'daily' ? t('workers:workerDetails.perDay') :
    paymentType === 'weekly' ? t('workers:workerDetails.perWeek') : t('workers:workerDetails.perProject');

  const rateValue = paymentType === 'hourly' ? hourlyRate :
    paymentType === 'daily' ? dailyRate :
    paymentType === 'weekly' ? weeklySalary : projectRate;

  const setRateValue = paymentType === 'hourly' ? setHourlyRate :
    paymentType === 'daily' ? setDailyRate :
    paymentType === 'weekly' ? setWeeklySalary : setProjectRate;

  // Guard against navigation without a worker param.
  if (!worker) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            testID="editWorkerPayment.backButton"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]} testID="editWorkerPayment.headerTitle">Edit Worker</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.secondaryText} />
          <Text style={[styles.centerStateText, { color: Colors.secondaryText }]}>
            {t('common:status.noData')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          testID="editWorkerPayment.backButton"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} testID="editWorkerPayment.headerTitle">Edit Worker</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: saving ? '#9CA3AF' : '#1E40AF' }]}
          onPress={handleSave}
          disabled={saving}
          testID="editWorkerPayment.saveButton"
          accessibilityLabel="Save worker"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Worker Information */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Worker Information</Text>
            </View>

            {/* Name */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{t('workers:form.fullName')}</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="person-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Worker name"
                placeholderTextColor={Colors.secondaryText}
                testID="editWorkerPayment.fullNameInput"
                accessibilityLabel="Full name"
              />
            </View>

            {/* Phone */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{t('workers:form.phone')}</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="call-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={Colors.secondaryText}
                keyboardType="phone-pad"
                testID="editWorkerPayment.phoneInput"
                accessibilityLabel="Phone number"
              />
            </View>

            {/* Email */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{t('workers:form.email')}</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="mail-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={Colors.secondaryText}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="editWorkerPayment.emailInput"
                accessibilityLabel="Email address"
              />
            </View>

            {/* Trade */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Trade / Specialty</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="construct-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={trade}
                onChangeText={setTrade}
                placeholder="e.g. Carpentry, Electrical, Plumbing"
                placeholderTextColor={Colors.secondaryText}
                testID="editWorkerPayment.tradeInput"
                accessibilityLabel="Trade or specialty"
              />
            </View>
          </View>

          {/* Owner check pending — hold a determinate placeholder so owner-only
              cards don't silently pop in (and so the owner doesn't tap Save
              before payment fields render). */}
          {!ownerChecked && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
              <Text style={[styles.centerStateText, { color: Colors.secondaryText }]}>
                {t('common:status.loading')}
              </Text>
            </View>
          </View>
          )}

          {/* Payment Type Selection — Owner only */}
          {ownerChecked && isOwner && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('workers:payment.paymentType')}</Text>
            </View>

            <View style={styles.paymentTypeGrid}>
              {[
                { key: 'hourly', icon: 'time', label: t('workers:payment.hourly') },
                { key: 'daily', icon: 'sunny', label: t('workers:payment.daily') },
                { key: 'weekly', icon: 'calendar', label: t('workers:payment.weekly') },
                { key: 'project_based', icon: 'briefcase', label: t('workers:payment.project') },
              ].map(({ key, icon, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.paymentTypeOption,
                    paymentType === key
                      ? { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue }
                      : { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }
                  ]}
                  onPress={() => setPaymentType(key)}
                  testID={`editWorkerPayment.paymentType.${key}`}
                  accessibilityLabel={`Payment type ${label}`}
                >
                  <Ionicons
                    name={icon}
                    size={22}
                    color={paymentType === key ? '#FFFFFF' : Colors.secondaryText}
                  />
                  <Text style={[
                    styles.paymentTypeText,
                    { color: paymentType === key ? '#FFFFFF' : Colors.primaryText }
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Rate Input */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText, marginTop: 16 }]}>{rateLabel}</Text>
            <View style={[styles.rateInputContainer, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
              <TextInput
                style={[styles.rateInput, { color: Colors.primaryText }]}
                value={rateValue}
                onChangeText={setRateValue}
                placeholder="0.00"
                placeholderTextColor={Colors.secondaryText}
                keyboardType="decimal-pad"
                testID="editWorkerPayment.rateInput"
                accessibilityLabel="Pay rate"
              />
              <Text style={[styles.rateSuffix, { color: Colors.secondaryText }]}>{rateSuffix}</Text>
            </View>
          </View>
          )}

          {/* Promote to Supervisor — Owner only */}
          {ownerChecked && isOwner && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#8B5CF6" />
              <Text style={[styles.sectionTitle, { color: '#8B5CF6' }]}>Role Management</Text>
            </View>
            <Text style={[styles.deleteDescription, { color: Colors.secondaryText }]}>
              Promote this worker to supervisor. They'll be able to manage workers, view all projects, and oversee operations.
            </Text>
            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: '#8B5CF6' }]}
              onPress={handlePromoteToSupervisor}
              disabled={saving}
              testID="editWorkerPayment.promoteButton"
              accessibilityLabel="Promote to supervisor"
            >
              <Ionicons name="arrow-up-circle-outline" size={18} color="#FFF" />
              <Text style={styles.deleteButtonText}>Promote to Supervisor</Text>
            </TouchableOpacity>
          </View>
          )}

          {/* Delete Worker — Owner only */}
          {ownerChecked && isOwner && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>{t('common:labels.dangerZone')}</Text>
            </View>
            <Text style={[styles.deleteDescription, { color: Colors.secondaryText }]}>
              Permanently delete this worker and all associated data. This action cannot be undone.
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={deleting}
              testID="editWorkerPayment.deleteButton"
              accessibilityLabel="Delete worker"
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#FFF" />
                  <Text style={styles.deleteButtonText}>Delete Worker</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  paymentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentTypeOption: {
    width: '47%',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
  },
  paymentTypeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
  },
  rateInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    padding: 0,
  },
  rateSuffix: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  centerStateText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
