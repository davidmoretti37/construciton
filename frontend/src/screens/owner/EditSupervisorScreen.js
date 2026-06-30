import React, { useState, useEffect, useRef } from 'react';
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
import { useTranslation } from 'react-i18next';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { updateSupervisorProfile, removeSupervisor } from '../../utils/storage';
import { CommonActions } from '@react-navigation/native';
import { SUPERVISOR_PERMISSIONS } from '../../constants/supervisorPermissions';
import { supabase } from '../../lib/supabase';

export default function EditSupervisorScreen({ navigation, route }) {
  const { t } = useTranslation('owner');
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
  const [hydrating, setHydrating] = useState(!!supervisor?.id);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Read inside the async hydration closure so edits made *during* the in-flight
  // fetch are respected even though the effect captured the initial dirty value.
  const dirtyRef = useRef(false);
  const markDirty = () => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
  };

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
      if (cancelled) return;
      if (error || !data) {
        // Don't let the owner overwrite live payment fields with the stub's
        // empty/zero values — flag the failure and block Save until reload.
        setHydrationFailed(true);
        setHydrating(false);
        return;
      }
      // If the owner already started editing, don't clobber their input with
      // late-arriving DB values.
      if (!dirtyRef.current) {
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
      }
      setHydrating(false);
    })();
    return () => { cancelled = true; };
  }, [supervisor?.id]);

  const performSave = async () => {
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

      // Guard the permissions RPC behind a successful profile write. Running it
      // after a failed profile write produces an inverse partial save (perms
      // land but the user is told the whole save failed).
      if (!success) {
        Alert.alert(t('common:alerts.error'), t('editSupervisor.updateFailed'));
        return;
      }

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
        // Profile was already committed above — be honest about the partial
        // state rather than implying nothing saved. Don't update nav params or
        // claim success when only half the edit landed.
        Alert.alert(
          t('editSupervisor.partialSaveTitle'),
          (permResult && permResult.error) ||
            t('editSupervisor.partialSaveMessage')
        );
        return;
      }

      // Both writes succeeded — now it's safe to update the previous screen's
      // params and report success.
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
      Alert.alert(t('common:alerts.success'), t('editSupervisor.updateSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error updating supervisor:', error);
      Alert.alert(t('common:alerts.error'), t('editSupervisor.somethingWrongRetry'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common:alerts.error'), t('editSupervisor.nameRequired'));
      return;
    }

    // Block saving until live payment data has loaded — otherwise empty rate
    // fields seeded from the stub would overwrite the supervisor's real rate.
    if (hydrating) {
      Alert.alert(t('editSupervisor.pleaseWaitTitle'), t('editSupervisor.stillLoading'));
      return;
    }
    if (hydrationFailed) {
      Alert.alert(
        t('editSupervisor.couldNotLoadTitle'),
        t('editSupervisor.couldNotLoadMessage'),
      );
      return;
    }

    // A blank/unparseable active rate would silently save as 0 via
    // `parseFloat('') || 0`, zeroing the rate. Validate before saving, and
    // confirm explicitly when the owner intends a $0 rate.
    const parsedRate = parseFloat(rateValue);
    if (rateValue.trim() === '' || Number.isNaN(parsedRate)) {
      Alert.alert(t('editSupervisor.invalidRateTitle'), t('editSupervisor.invalidRateMessage', { label: rateLabel.toLowerCase() }));
      return;
    }
    if (parsedRate === 0) {
      Alert.alert(
        t('editSupervisor.saveZeroRateTitle'),
        t('editSupervisor.saveZeroRateMessage', { label: rateLabel.toLowerCase() }),
        [
          { text: t('common:buttons.cancel'), style: 'cancel' },
          { text: t('common:buttons.save'), style: 'destructive', onPress: () => { performSave(); } },
        ]
      );
      return;
    }

    performSave();
  };

  const handleRemove = () => {
    Alert.alert(
      t('editSupervisor.removeSupervisor'),
      t('editSupervisor.removeConfirm', { name: supervisorName }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('editSupervisor.remove'),
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              const success = await removeSupervisor(supervisor.id);
              if (success) {
                Alert.alert(t('editSupervisor.removedTitle'), t('editSupervisor.removedMessage', { name: supervisorName }), [
                  { text: t('common:buttons.ok'), onPress: () => navigation.popToTop() }
                ]);
              } else {
                Alert.alert(t('common:alerts.error'), t('editSupervisor.removeFailed'));
              }
            } catch (error) {
              console.error('Error removing supervisor:', error);
              Alert.alert(t('common:alerts.error'), t('editSupervisor.somethingWrong'));
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  const rateSuffix = paymentType === 'hourly' ? t('editSupervisor.suffixHourly') :
    paymentType === 'daily' ? t('editSupervisor.suffixDaily') :
    paymentType === 'weekly' ? t('editSupervisor.suffixWeekly') : t('editSupervisor.suffixProject');

  const rateValue = paymentType === 'hourly' ? hourlyRate :
    paymentType === 'daily' ? dailyRate :
    paymentType === 'weekly' ? weeklySalary : projectRate;

  const setRateValue = paymentType === 'hourly' ? setHourlyRate :
    paymentType === 'daily' ? setDailyRate :
    paymentType === 'weekly' ? setWeeklySalary : setProjectRate;

  const rateLabel = paymentType === 'hourly' ? t('editSupervisor.hourlyRate') :
    paymentType === 'daily' ? t('editSupervisor.dailyRate') :
    paymentType === 'weekly' ? t('editSupervisor.weeklySalary') : t('editSupervisor.projectRate');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('editSupervisor.title')}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: (saving || hydrating || hydrationFailed) ? '#9CA3AF' : '#1E40AF' }]}
          onPress={handleSave}
          disabled={saving || hydrating || hydrationFailed}
        >
          {(saving || hydrating) ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>{t('common:buttons.save')}</Text>
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
          {hydrating && (
            <View style={styles.hydrateBanner}>
              <ActivityIndicator size="small" color="#1E40AF" />
              <Text style={[styles.hydrateBannerText, { color: Colors.secondaryText }]}>
                {t('editSupervisor.loadingDetails')}
              </Text>
            </View>
          )}
          {hydrationFailed && (
            <View style={styles.warnBanner}>
              <Ionicons name="warning-outline" size={18} color="#B45309" />
              <Text style={styles.warnBannerText}>
                {t('editSupervisor.loadFailedBanner')}
              </Text>
            </View>
          )}

          {/* Supervisor Information */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('editSupervisor.supervisorInformation')}</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{t('editSupervisor.name')}</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="person-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={name}
                onChangeText={(v) => { markDirty(); setName(v); }}
                placeholder={t('editSupervisor.namePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
              />
            </View>

            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{t('editSupervisor.phone')}</Text>
            <View style={[styles.fieldInput, { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }]}>
              <Ionicons name="call-outline" size={18} color={Colors.secondaryText} />
              <TextInput
                style={[styles.textInput, { color: Colors.primaryText }]}
                value={phone}
                onChangeText={(v) => { markDirty(); setPhone(v); }}
                placeholder={t('editSupervisor.phonePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                keyboardType="phone-pad"
              />
            </View>

            {supervisor?.email && (
              <>
                <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{t('editSupervisor.email')}</Text>
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
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('editSupervisor.payment')}</Text>
            </View>

            <View style={styles.paymentTypeGrid}>
              {[
                { key: 'hourly', icon: 'time', label: t('editSupervisor.hourly') },
                { key: 'daily', icon: 'sunny', label: t('editSupervisor.daily') },
                { key: 'weekly', icon: 'calendar', label: t('editSupervisor.weekly') },
                { key: 'project_based', icon: 'briefcase', label: t('editSupervisor.project') },
              ].map(({ key, icon, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.paymentTypeOption,
                    paymentType === key
                      ? { backgroundColor: '#1E40AF', borderColor: '#1E40AF' }
                      : { backgroundColor: Colors.lightGray || '#F3F4F6', borderColor: Colors.border }
                  ]}
                  onPress={() => { markDirty(); setPaymentType(key); }}
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
                onChangeText={(v) => { markDirty(); setRateValue(v); }}
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
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('editSupervisor.permissions')}</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.secondaryText, lineHeight: 18, marginBottom: 14 }}>
              {t('editSupervisor.permissionsHelp')}
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
                  onValueChange={(v) => { markDirty(); setPermissions({ ...permissions, [perm.key]: v }); }}
                  trackColor={{ false: '#D1D5DB', true: '#1E40AF' }}
                />
              </View>
            ))}
          </View>

          {/* Danger Zone */}
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>{t('editSupervisor.dangerZone')}</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.secondaryText, lineHeight: 18, marginBottom: 14 }}>
              {t('editSupervisor.dangerZoneHelp')}
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
                  <Text style={styles.deleteButtonText}>{t('editSupervisor.removeSupervisor')}</Text>
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
  hydrateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  hydrateBannerText: { fontSize: 13 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  warnBannerText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
});
