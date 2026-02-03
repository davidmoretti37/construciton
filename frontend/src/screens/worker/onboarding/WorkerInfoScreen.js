/**
 * WorkerInfoScreen
 * Worker info form with choreographed animations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  useSlideDown,
  useFormFieldPop,
  useButtonBounce,
  useTextSlideUp,
} from '../../../hooks/useOnboardingAnimations';

const WORKER_GREEN = '#059669';

const TRADES = [
  { id: 'general', name: 'General Laborer' },
  { id: 'carpentry', name: 'Carpenter' },
  { id: 'electrical', name: 'Electrician' },
  { id: 'plumbing', name: 'Plumber' },
  { id: 'hvac', name: 'HVAC Technician' },
  { id: 'painting', name: 'Painter' },
  { id: 'drywall', name: 'Drywall Installer' },
  { id: 'flooring', name: 'Flooring Specialist' },
  { id: 'roofing', name: 'Roofer' },
  { id: 'masonry', name: 'Mason' },
  { id: 'concrete', name: 'Concrete Worker' },
  { id: 'landscaping', name: 'Landscaper' },
];

const ROLES = [
  'Foreman',
  'Lead Worker',
  'Skilled Worker',
  'Apprentice',
  'Helper',
];

export default function WorkerInfoScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [trade, setTrade] = useState(TRADES[0].id);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showCustomTradeInput, setShowCustomTradeInput] = useState(false);
  const [customTradeName, setCustomTradeName] = useState('');
  const [isScreenActive, setIsScreenActive] = useState(false);

  // Trigger animations on mount
  useEffect(() => {
    setIsScreenActive(true);
  }, []);

  // Animation hooks
  const headerAnim = useSlideDown(isScreenActive, 0);
  const field1Anim = useFormFieldPop(isScreenActive, 0, 200);
  const field2Anim = useFormFieldPop(isScreenActive, 1, 200);
  const field3Anim = useFormFieldPop(isScreenActive, 2, 200);
  const field4Anim = useFormFieldPop(isScreenActive, 3, 200);
  const buttonAnim = useButtonBounce(isScreenActive, 800);
  const progressAnim = useTextSlideUp(isScreenActive, 1000);

  const handleContinue = () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert(t('alerts.requiredField'), t('messages.pleaseEnterName'));
      return;
    }
    if (!phone.trim()) {
      Alert.alert(t('alerts.requiredField'), t('messages.pleaseEnterPhone'));
      return;
    }

    // Pass data to completion screen
    navigation.navigate('WorkerCompletion', {
      fullName: fullName.trim(),
      phone: phone.trim(),
      role,
      trade: trade === 'custom' ? customTradeName.trim() : trade,
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={[styles.header, headerAnim]}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Your Information
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              Tell us a bit about yourself
            </Text>
          </Animated.View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <Animated.View style={[styles.inputGroup, field1Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Full Name *</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="person-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="John Doe"
                  placeholderTextColor={Colors.secondaryText}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            </Animated.View>

            {/* Phone */}
            <Animated.View style={[styles.inputGroup, field2Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Phone Number *</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="call-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={Colors.secondaryText}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </Animated.View>

            {/* Role in Company */}
            <Animated.View style={[styles.inputGroup, field3Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Role in Company</Text>
              <TouchableOpacity
                style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowRoleModal(true)}
              >
                <Ionicons name="ribbon-outline" size={20} color={Colors.secondaryText} />
                <Text style={[styles.selectText, { color: Colors.primaryText }]}>{role}</Text>
                <Ionicons name="chevron-down" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            </Animated.View>

            {/* Trade/Specialty */}
            <Animated.View style={[styles.inputGroup, field4Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Trade / Specialty</Text>
              <TouchableOpacity
                style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowTradeModal(true)}
              >
                <Ionicons name="construct-outline" size={20} color={Colors.secondaryText} />
                <Text style={[styles.selectText, { color: Colors.primaryText }]}>
                  {trade === 'custom' ? customTradeName : TRADES.find(t => t.id === trade)?.name}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Continue Button */}
          <Animated.View style={buttonAnim}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: WORKER_GREEN }]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* Progress Indicator */}
          <Animated.View style={[styles.progressContainer, progressAnim]}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: WORKER_GREEN }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: WORKER_GREEN }]} />
              <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
              Step 2 of 3
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Role Selection Modal */}
      <Modal
        visible={showRoleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Role</Text>
              <TouchableOpacity onPress={() => setShowRoleModal(false)}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: Colors.border },
                    role === r && { backgroundColor: WORKER_GREEN + '10' }
                  ]}
                  onPress={() => {
                    setRole(r);
                    setShowRoleModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: Colors.primaryText }]}>{r}</Text>
                  {role === r && <Ionicons name="checkmark" size={24} color={WORKER_GREEN} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Trade Selection Modal */}
      <Modal
        visible={showTradeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowCustomTradeInput(false);
          setShowTradeModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Trade</Text>
              <TouchableOpacity onPress={() => {
                setShowCustomTradeInput(false);
                setShowTradeModal(false);
              }}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {TRADES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: Colors.border },
                    trade === t.id && { backgroundColor: WORKER_GREEN + '10' }
                  ]}
                  onPress={() => {
                    setTrade(t.id);
                    setShowCustomTradeInput(false);
                    setShowTradeModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: Colors.primaryText }]}>{t.name}</Text>
                  {trade === t.id && <Ionicons name="checkmark" size={24} color={WORKER_GREEN} />}
                </TouchableOpacity>
              ))}

              {/* Other / Custom Trade Option */}
              {!showCustomTradeInput ? (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    { borderBottomColor: Colors.border },
                    trade === 'custom' && { backgroundColor: WORKER_GREEN + '10' }
                  ]}
                  onPress={() => setShowCustomTradeInput(true)}
                >
                  <View style={styles.otherOptionRow}>
                    <Ionicons name="add-circle-outline" size={20} color={WORKER_GREEN} />
                    <Text style={[styles.modalOptionText, { color: WORKER_GREEN, fontWeight: '600' }]}>Other</Text>
                  </View>
                  {trade === 'custom' && <Ionicons name="checkmark" size={24} color={WORKER_GREEN} />}
                </TouchableOpacity>
              ) : (
                <View style={[styles.customTradeContainer, { borderBottomColor: Colors.border }]}>
                  <View style={[styles.customTradeInputContainer, { borderColor: WORKER_GREEN, backgroundColor: Colors.white }]}>
                    <TextInput
                      style={[styles.customTradeInput, { color: Colors.primaryText }]}
                      placeholder="Enter your trade"
                      placeholderTextColor={Colors.secondaryText}
                      value={customTradeName}
                      onChangeText={setCustomTradeName}
                      autoFocus
                      autoCapitalize="words"
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.customTradeDone,
                      { backgroundColor: customTradeName.trim() ? WORKER_GREEN : Colors.border },
                    ]}
                    disabled={!customTradeName.trim()}
                    onPress={() => {
                      setTrade('custom');
                      setShowCustomTradeInput(false);
                      setShowTradeModal(false);
                    }}
                  >
                    <Text style={styles.customTradeDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.body,
    lineHeight: 24,
  },
  form: {
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
  },
  selectText: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
  },
  progressText: {
    fontSize: FontSizes.small,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: FontSizes.body,
  },
  otherOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  customTradeContainer: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  customTradeInputContainer: {
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  customTradeInput: {
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
  },
  customTradeDone: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  customTradeDoneText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
