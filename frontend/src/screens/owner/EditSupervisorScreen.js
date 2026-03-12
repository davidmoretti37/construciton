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
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { updateSupervisorProfile, removeSupervisor } from '../../utils/storage';

export default function EditSupervisorScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { supervisor } = route.params;

  const supervisorName = supervisor?.business_name || supervisor?.email?.split('@')[0] || '';

  const [name, setName] = useState(supervisorName);
  const [phone, setPhone] = useState(supervisor?.business_phone || '');
  const [paymentType, setPaymentType] = useState(supervisor?.payment_type || 'hourly');
  const [hourlyRate, setHourlyRate] = useState(supervisor?.hourly_rate?.toString() || '');
  const [dailyRate, setDailyRate] = useState(supervisor?.daily_rate?.toString() || '');
  const [weeklySalary, setWeeklySalary] = useState(supervisor?.weekly_salary?.toString() || '');
  const [projectRate, setProjectRate] = useState(supervisor?.project_rate?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Supervisor name is required.');
      return;
    }

    try {
      setSaving(true);

      const updates = {
        business_name: name.trim(),
        business_phone: phone.trim(),
        payment_type: paymentType,
        hourly_rate: paymentType === 'hourly' ? parseFloat(hourlyRate) || 0 : (supervisor?.hourly_rate || 0),
        daily_rate: paymentType === 'daily' ? parseFloat(dailyRate) || 0 : (supervisor?.daily_rate || 0),
        weekly_salary: paymentType === 'weekly' ? parseFloat(weeklySalary) || 0 : (supervisor?.weekly_salary || 0),
        project_rate: paymentType === 'project_based' ? parseFloat(projectRate) || 0 : (supervisor?.project_rate || 0),
      };

      const success = await updateSupervisorProfile(supervisor.id, updates);

      if (success) {
        // Pass updated supervisor data back to the detail screen
        const updatedSupervisor = { ...supervisor, ...updates };
        navigation.navigate({
          name: 'SupervisorDetail',
          params: { supervisor: updatedSupervisor, updatedAt: Date.now() },
          merge: true,
        });
        Alert.alert('Success', 'Supervisor updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update supervisor. Please try again.');
      }
    } catch (error) {
      console.error('Error updating supervisor:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Supervisor',
      `Are you sure you want to remove ${supervisorName} from your team? They will no longer be linked to your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              const success = await removeSupervisor(supervisor.id);
              if (success) {
                Alert.alert('Removed', `${supervisorName} has been removed from your team.`, [
                  { text: 'OK', onPress: () => navigation.popToTop() }
                ]);
              } else {
                Alert.alert('Error', 'Failed to remove supervisor.');
              }
            } catch (error) {
              console.error('Error removing supervisor:', error);
              Alert.alert('Error', 'Something went wrong.');
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  const rateSuffix = paymentType === 'hourly' ? '/hr' :
    paymentType === 'daily' ? '/day' :
    paymentType === 'weekly' ? '/wk' : '/proj';

  const rateValue = paymentType === 'hourly' ? hourlyRate :
    paymentType === 'daily' ? dailyRate :
    paymentType === 'weekly' ? weeklySalary : projectRate;

  const setRateValue = paymentType === 'hourly' ? setHourlyRate :
    paymentType === 'daily' ? setDailyRate :
    paymentType === 'weekly' ? setWeeklySalary : setProjectRate;

  const rateLabel = paymentType === 'hourly' ? 'Hourly Rate' :
    paymentType === 'daily' ? 'Daily Rate' :
    paymentType === 'weekly' ? 'Weekly Salary' : 'Project Rate';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Edit Supervisor</Text>
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
          {/* Supervisor Information */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Supervisor Information</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Name</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="person-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={name}
                onChangeText={setName}
                placeholder="Supervisor name"
                placeholderTextColor={Colors.secondaryText}
              />
            </View>

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

            {supervisor?.email && (
              <>
                <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Email</Text>
                <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border, opacity: 0.6 }]}>
                  <Ionicons name="mail-outline" size={18} color={Colors.secondaryText} />
                  <Text style={[styles.textInput, { color: Colors.secondaryText }]}>{supervisor.email}</Text>
                </View>
              </>
            )}
          </View>

          {/* Payment Type */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet-outline" size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Payment</Text>
            </View>

            <View style={styles.paymentTypeGrid}>
              {[
                { key: 'hourly', icon: 'time', label: 'Hourly' },
                { key: 'daily', icon: 'sunny', label: 'Daily' },
                { key: 'weekly', icon: 'calendar', label: 'Weekly' },
                { key: 'project_based', icon: 'briefcase', label: 'Project' },
              ].map(({ key, icon, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.paymentTypeOption,
                    paymentType === key
                      ? { backgroundColor: '#1E40AF', borderColor: '#1E40AF' }
                      : { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }
                  ]}
                  onPress={() => setPaymentType(key)}
                >
                  <Ionicons
                    name={icon}
                    size={22}
                    color={paymentType === key ? '#FFFFFF' : Colors.secondaryText}
                  />
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: paymentType === key ? '#FFFFFF' : Colors.primaryText,
                  }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

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
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.secondaryText }}>{rateSuffix}</Text>
            </View>
          </View>

          {/* Danger Zone */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>Danger Zone</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.secondaryText, lineHeight: 18, marginBottom: 14 }}>
              Remove this supervisor from your team. They will lose access to your projects and workers.
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleRemove}
              disabled={removing}
            >
              {removing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="person-remove-outline" size={18} color="#FFF" />
                  <Text style={styles.deleteButtonText}>Remove Supervisor</Text>
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
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
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
  },
  textInput: { flex: 1, fontSize: 15, padding: 0 },
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
  rateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
  },
  currencySymbol: { fontSize: 22, fontWeight: '700' },
  rateInput: { flex: 1, fontSize: 28, fontWeight: '700', padding: 0 },
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
  deleteButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
