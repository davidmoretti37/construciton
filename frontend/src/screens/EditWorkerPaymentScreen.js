import React, { useState } from 'react';
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
  const { worker } = route.params;

  // Worker info fields
  const [fullName, setFullName] = useState(worker.full_name || '');
  const [phone, setPhone] = useState(worker.phone || '');
  const [email, setEmail] = useState(worker.email || '');
  const [trade, setTrade] = useState(worker.trade || '');

  // Payment fields
  const [paymentType, setPaymentType] = useState(worker.payment_type || 'hourly');
  const [hourlyRate, setHourlyRate] = useState(worker.hourly_rate?.toString() || '');
  const [dailyRate, setDailyRate] = useState(worker.daily_rate?.toString() || '');
  const [weeklySalary, setWeeklySalary] = useState(worker.weekly_salary?.toString() || '');
  const [projectRate, setProjectRate] = useState(worker.project_rate?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Error', 'Worker name is required.');
      return;
    }

    try {
      setSaving(true);

      const updates = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        trade: trade.trim(),
        payment_type: paymentType,
        hourly_rate: paymentType === 'hourly' ? parseFloat(hourlyRate) || 0 : (worker.hourly_rate || 0),
        daily_rate: paymentType === 'daily' ? parseFloat(dailyRate) || 0 : (worker.daily_rate || 0),
        weekly_salary: paymentType === 'weekly' ? parseFloat(weeklySalary) || 0 : (worker.weekly_salary || 0),
        project_rate: paymentType === 'project_based' ? parseFloat(projectRate) || 0 : (worker.project_rate || 0),
      };

      const success = await updateWorker(worker.id, updates);

      if (success) {
        Alert.alert('Success', 'Worker updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('Error', 'Failed to update worker. Please try again.');
      }
    } catch (error) {
      console.error('Error updating worker:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Worker',
      `Are you sure you want to delete ${worker.full_name}? This will remove all their data and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const success = await deleteWorker(worker.id);
              if (success) {
                Alert.alert('Deleted', `${worker.full_name} has been removed.`, [
                  { text: 'OK', onPress: () => navigation.popToTop() }
                ]);
              } else {
                Alert.alert('Error', 'Failed to delete worker.');
              }
            } catch (error) {
              console.error('Error deleting worker:', error);
              Alert.alert('Error', 'Something went wrong.');
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
              // Update the worker's profile role to supervisor
              if (worker.user_id) {
                const { error: profileError } = await supabase
                  .from('profiles')
                  .update({ role: 'supervisor' })
                  .eq('id', worker.user_id);

                if (profileError) {
                  // Profile might not exist — try upsert
                  const { error: upsertError } = await supabase
                    .from('profiles')
                    .upsert({
                      id: worker.user_id,
                      role: 'supervisor',
                      owner_id: worker.owner_id,
                      full_name: fullName,
                      email: email,
                    });
                  if (upsertError) throw upsertError;
                }

                Alert.alert('Promoted', `${fullName} is now a supervisor. They'll see the supervisor view next time they open the app.`, [
                  { text: 'OK', onPress: () => navigation.goBack() }
                ]);
              } else {
                Alert.alert('Error', 'This worker doesn\'t have a linked account yet. They need to accept their invite first.');
              }
            } catch (e) {
              console.error('Promote error:', e);
              Alert.alert('Error', 'Failed to promote worker.');
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Edit Worker</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: saving ? '#9CA3AF' : '#1E40AF' }]}
          onPress={handleSave}
          disabled={saving}
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
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Full Name</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="person-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Worker name"
                placeholderTextColor={Colors.secondaryText}
              />
            </View>

            {/* Phone */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Phone</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="call-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={Colors.secondaryText}
                keyboardType="phone-pad"
              />
            </View>

            {/* Email */}
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Email</Text>
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
              />
            </View>
          </View>

          {/* Payment Type Selection */}
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
              />
              <Text style={[styles.rateSuffix, { color: Colors.secondaryText }]}>{rateSuffix}</Text>
            </View>
          </View>

          {/* Promote to Supervisor */}
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
            >
              <Ionicons name="arrow-up-circle-outline" size={18} color="#FFF" />
              <Text style={styles.deleteButtonText}>Promote to Supervisor</Text>
            </TouchableOpacity>
          </View>

          {/* Delete Worker */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>Danger Zone</Text>
            </View>
            <Text style={[styles.deleteDescription, { color: Colors.secondaryText }]}>
              Permanently delete this worker and all associated data. This action cannot be undone.
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={deleting}
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
});
