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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { updateSupervisorProfile, removeSupervisor } from '../../utils/storage';
import { CommonActions } from '@react-navigation/native';
import { SUPERVISOR_PERMISSIONS } from '../../constants/supervisorPermissions';
import { supabase } from '../../lib/supabase';

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
  const [permissions, setPermissions] = useState(
    SUPERVISOR_PERMISSIONS.reduce(
      (acc, p) => ({ ...acc, [p.key]: !!supervisor?.[p.key] }),
      {}
    )
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // The `supervisor` route param is often a stub from `get_owner_supervisors`
  // (no payment columns, no can_* columns). Hydrate from profiles on mount so
  // the toggles + payment fields reflect actual DB state — otherwise saving
  // appears to "not stick" because each re-open seeds from the stale stub.
  useEffect(() => {
    if (!supervisor?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supervisor.id)
        .single();
      if (cancelled || error || !data) return;
      setPaymentType(data.payment_type || 'hourly');
      setHourlyRate(data.hourly_rate != null ? String(data.hourly_rate) : '');
      setDailyRate(data.daily_rate != null ? String(data.daily_rate) : '');
      setWeeklySalary(data.weekly_salary != null ? String(data.weekly_salary) : '');
      setProjectRate(data.project_rate != null ? String(data.project_rate) : '');
      setPermissions(
        SUPERVISOR_PERMISSIONS.reduce(
          (acc, p) => ({ ...acc, [p.key]: !!data[p.key] }),
          {}
        )
      );
    })();
    return () => { cancelled = true; };
  }, [supervisor?.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Supervisor name is required.');
      return;
    }

    try {
      setSaving(true);

      const permissionPayload = SUPERVISOR_PERMISSIONS.reduce(
        (acc, p) => ({ ...acc, [p.key]: !!permissions[p.key] }),
        {}
      );

      const updates = {
        business_name: name.trim(),
        business_phone: phone.trim(),
        payment_type: paymentType,
        hourly_rate: paymentType === 'hourly' ? parseFloat(hourlyRate) || 0 : (supervisor?.hourly_rate || 0),
        daily_rate: paymentType === 'daily' ? parseFloat(dailyRate) || 0 : (supervisor?.daily_rate || 0),
        weekly_salary: paymentType === 'weekly' ? parseFloat(weeklySalary) || 0 : (supervisor?.weekly_salary || 0),
        project_rate: paymentType === 'project_based' ? parseFloat(projectRate) || 0 : (supervisor?.project_rate || 0),
        ...permissionPayload,
      };

      const success = await updateSupervisorProfile(supervisor.id, updates);

      // The shared backend route silently drops the can_* fields on any
      // pre-deploy server, so always also write permissions through the
      // SECURITY DEFINER RPC. The RPC is idempotent and authoritative.
      const { data: permResult, error: permError } = await supabase.rpc('update_supervisor_permissions', {
        p_supervisor_id: supervisor.id,
        p_can_create_projects: !!permissions.can_create_projects,
        p_can_create_estimates: !!permissions.can_create_estimates,
        p_can_create_invoices: !!permissions.can_create_invoices,
        p_can_message_clients: !!permissions.can_message_clients,
        p_can_pay_workers: !!permissions.can_pay_workers,
        p_can_manage_workers: !!permissions.can_manage_workers,
      });
      if (permError || (permResult && permResult.success === false)) {
        console.error('Permission update failed:', permError || permResult);
        Alert.alert('Error', (permResult && permResult.error) || 'Failed to save permissions.');
        return;
      }

      if (success) {
        // Set updated params on the existing SupervisorDetail screen before going back
        const updatedSupervisor = { ...supervisor, ...updates };
        const state = navigation.getState();
        const previousRoute = state.routes[state.routes.length - 2];
        if (previousRoute) {
          navigation.dispatch({
            ...CommonActions.setParams({
              supervisor: updatedSupervisor,
              updatedAt: Date.now(),
            }),
            source: previousRoute.key,
          });
        }
        Alert.alert('Success', 'Supervisor updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
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

          {/* Permissions */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="key-outline" size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Permissions</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.secondaryText, lineHeight: 18, marginBottom: 14 }}>
              Choose what this supervisor can do. Changes apply on their next sign-in.
            </Text>
            {SUPERVISOR_PERMISSIONS.map((perm, idx) => (
              <View
                key={perm.key}
                style={[
                  styles.permRow,
                  idx < SUPERVISOR_PERMISSIONS.length - 1 && { borderBottomColor: Colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={styles.permIconWrap}>
                  <Ionicons name={perm.icon} size={20} color="#1E40AF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.permLabel, { color: Colors.primaryText }]}>{perm.label}</Text>
                  <Text style={[styles.permDescription, { color: Colors.secondaryText }]}>
                    {perm.description}
                  </Text>
                </View>
                <Switch
                  value={!!permissions[perm.key]}
                  onValueChange={(v) => setPermissions({ ...permissions, [perm.key]: v })}
                  trackColor={{ false: '#D1D5DB', true: '#1E40AF' }}
                />
              </View>
            ))}
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
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  permIconWrap: {
    width: 32,
    alignItems: 'center',
    marginRight: 10,
  },
  permLabel: { fontSize: 15, fontWeight: '500' },
  permDescription: { fontSize: 12, marginTop: 2 },
});
