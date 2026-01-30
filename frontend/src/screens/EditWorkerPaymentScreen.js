import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { updateWorker } from '../utils/storage';

export default function EditWorkerPaymentScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { worker } = route.params;

  const [paymentType, setPaymentType] = useState(worker.payment_type || 'hourly');
  const [hourlyRate, setHourlyRate] = useState(worker.hourly_rate?.toString() || '');
  const [dailyRate, setDailyRate] = useState(worker.daily_rate?.toString() || '');
  const [weeklySalary, setWeeklySalary] = useState(worker.weekly_salary?.toString() || '');
  const [projectRate, setProjectRate] = useState(worker.project_rate?.toString() || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Prepare payment data based on type
      const paymentData = {
        payment_type: paymentType,
        hourly_rate: paymentType === 'hourly' ? parseFloat(hourlyRate) || 0 : 0,
        daily_rate: paymentType === 'daily' ? parseFloat(dailyRate) || 0 : 0,
        weekly_salary: paymentType === 'weekly' ? parseFloat(weeklySalary) || 0 : 0,
        project_rate: paymentType === 'project_based' ? parseFloat(projectRate) || 0 : 0,
      };

      // Validate that the selected payment type has a rate
      if (paymentType === 'hourly' && !hourlyRate) {
        Alert.alert(t('alerts.error'), t('messages.pleaseEnter', { item: 'hourly rate' }));
        setSaving(false);
        return;
      }
      if (paymentType === 'daily' && !dailyRate) {
        Alert.alert(t('alerts.error'), t('messages.pleaseEnter', { item: 'daily rate' }));
        setSaving(false);
        return;
      }
      if (paymentType === 'weekly' && !weeklySalary) {
        Alert.alert(t('alerts.error'), t('messages.pleaseEnter', { item: 'weekly salary' }));
        setSaving(false);
        return;
      }
      if (paymentType === 'project_based' && !projectRate) {
        Alert.alert(t('alerts.error'), t('messages.pleaseEnter', { item: 'project rate' }));
        setSaving(false);
        return;
      }

      const success = await updateWorker(worker.id, paymentData);

      if (success) {
        Alert.alert(t('alerts.success'), t('messages.updatedSuccessfully', { item: 'payment information' }), [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'payment information' }));
      }
    } catch (error) {
      console.error('Error updating payment:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'payment information' }));
    } finally {
      setSaving(false);
    }
  };

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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Edit Payment</Text>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primaryBlue} />
          ) : (
            <Text style={[styles.saveButtonText, { color: Colors.primaryBlue }]}>Save</Text>
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
          {/* Worker Info */}
          <View style={[styles.workerInfoCard, { backgroundColor: Colors.white }]}>
            <View style={[styles.workerAvatar, { backgroundColor: Colors.primaryBlue }]}>
              <Text style={styles.workerAvatarText}>
                {worker.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
              </Text>
            </View>
            <Text style={[styles.workerName, { color: Colors.primaryText }]}>
              {worker.full_name}
            </Text>
            {worker.trade && (
              <Text style={[styles.workerTrade, { color: Colors.secondaryText }]}>
                {worker.trade}
              </Text>
            )}
          </View>

          {/* Payment Type Selection */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Payment Type</Text>

            <View style={styles.paymentTypeGrid}>
              <TouchableOpacity
                style={[
                  styles.paymentTypeOption,
                  paymentType === 'hourly' && { backgroundColor: Colors.primaryBlue },
                  paymentType !== 'hourly' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                ]}
                onPress={() => setPaymentType('hourly')}
              >
                <Ionicons
                  name="time"
                  size={24}
                  color={paymentType === 'hourly' ? '#FFFFFF' : Colors.secondaryText}
                />
                <Text style={[
                  styles.paymentTypeText,
                  { color: paymentType === 'hourly' ? '#FFFFFF' : Colors.primaryText }
                ]}>
                  Hourly
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentTypeOption,
                  paymentType === 'daily' && { backgroundColor: Colors.primaryBlue },
                  paymentType !== 'daily' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                ]}
                onPress={() => setPaymentType('daily')}
              >
                <Ionicons
                  name="sunny"
                  size={24}
                  color={paymentType === 'daily' ? '#FFFFFF' : Colors.secondaryText}
                />
                <Text style={[
                  styles.paymentTypeText,
                  { color: paymentType === 'daily' ? '#FFFFFF' : Colors.primaryText }
                ]}>
                  Daily
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentTypeOption,
                  paymentType === 'weekly' && { backgroundColor: Colors.primaryBlue },
                  paymentType !== 'weekly' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                ]}
                onPress={() => setPaymentType('weekly')}
              >
                <Ionicons
                  name="calendar"
                  size={24}
                  color={paymentType === 'weekly' ? '#FFFFFF' : Colors.secondaryText}
                />
                <Text style={[
                  styles.paymentTypeText,
                  { color: paymentType === 'weekly' ? '#FFFFFF' : Colors.primaryText }
                ]}>
                  Weekly
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentTypeOption,
                  paymentType === 'project_based' && { backgroundColor: Colors.primaryBlue },
                  paymentType !== 'project_based' && { backgroundColor: Colors.lightGray, borderColor: Colors.border }
                ]}
                onPress={() => setPaymentType('project_based')}
              >
                <Ionicons
                  name="briefcase"
                  size={24}
                  color={paymentType === 'project_based' ? '#FFFFFF' : Colors.secondaryText}
                />
                <Text style={[
                  styles.paymentTypeText,
                  { color: paymentType === 'project_based' ? '#FFFFFF' : Colors.primaryText }
                ]}>
                  Project
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Payment Rate Input */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              {paymentType === 'hourly' ? 'Hourly Rate' :
               paymentType === 'daily' ? 'Daily Rate' :
               paymentType === 'weekly' ? 'Weekly Salary' : 'Project Rate'}
            </Text>

            {paymentType === 'hourly' && (
              <View style={[styles.rateInputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                <Ionicons name="cash-outline" size={24} color={Colors.secondaryText} />
                <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                <TextInput
                  style={[styles.rateInput, { color: Colors.primaryText }]}
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                  autoFocus={!hourlyRate}
                />
                <Text style={[styles.rateSuffix, { color: Colors.secondaryText }]}>/hr</Text>
              </View>
            )}

            {paymentType === 'daily' && (
              <View style={[styles.rateInputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                <Ionicons name="cash-outline" size={24} color={Colors.secondaryText} />
                <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                <TextInput
                  style={[styles.rateInput, { color: Colors.primaryText }]}
                  value={dailyRate}
                  onChangeText={setDailyRate}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                  autoFocus={!dailyRate}
                />
                <Text style={[styles.rateSuffix, { color: Colors.secondaryText }]}>/day</Text>
              </View>
            )}

            {paymentType === 'weekly' && (
              <View style={[styles.rateInputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                <Ionicons name="cash-outline" size={24} color={Colors.secondaryText} />
                <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                <TextInput
                  style={[styles.rateInput, { color: Colors.primaryText }]}
                  value={weeklySalary}
                  onChangeText={setWeeklySalary}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                  autoFocus={!weeklySalary}
                />
                <Text style={[styles.rateSuffix, { color: Colors.secondaryText }]}>/wk</Text>
              </View>
            )}

            {paymentType === 'project_based' && (
              <View style={[styles.rateInputContainer, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}>
                <Ionicons name="cash-outline" size={24} color={Colors.secondaryText} />
                <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                <TextInput
                  style={[styles.rateInput, { color: Colors.primaryText }]}
                  value={projectRate}
                  onChangeText={setProjectRate}
                  placeholder="0.00"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                  autoFocus={!projectRate}
                />
                <Text style={[styles.rateSuffix, { color: Colors.secondaryText }]}>/project</Text>
              </View>
            )}

            {/* Help Text */}
            <View style={styles.helpTextContainer}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
                {paymentType === 'hourly' ? 'Enter the amount paid per hour worked' :
                 paymentType === 'daily' ? 'Enter the amount paid per day. Half day if less than 5 hours.' :
                 paymentType === 'weekly' ? 'Enter the fixed weekly salary amount' :
                 'Enter the fixed amount paid per project completion'}
              </Text>
            </View>
          </View>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  saveButton: {
    padding: 4,
    minWidth: 50,
    alignItems: 'flex-end',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  workerInfoCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  workerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  workerAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  workerName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  workerTrade: {
    fontSize: 15,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  paymentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  paymentTypeOption: {
    flex: 1,
    minWidth: '45%',
    aspectRatio: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
  },
  paymentTypeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  rateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    borderWidth: 1,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
  },
  rateInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700',
    padding: 0,
  },
  rateSuffix: {
    fontSize: 18,
    fontWeight: '600',
  },
  helpTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
