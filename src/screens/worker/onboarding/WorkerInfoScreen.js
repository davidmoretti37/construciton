import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';

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
  const Colors = getColors(isDark);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [trade, setTrade] = useState(TRADES[0].id);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const handleContinue = () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Required Field', 'Please enter your full name');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required Field', 'Please enter your phone number');
      return;
    }

    // Pass data to completion screen
    navigation.navigate('WorkerCompletion', {
      fullName: fullName.trim(),
      phone: phone.trim(),
      role,
      trade,
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
          <View style={styles.header}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Your Information
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              Tell us a bit about yourself
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
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
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
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
            </View>

            {/* Role in Company */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Role in Company</Text>
              <TouchableOpacity
                style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowRoleModal(true)}
              >
                <Ionicons name="ribbon-outline" size={20} color={Colors.secondaryText} />
                <Text style={[styles.selectText, { color: Colors.primaryText }]}>{role}</Text>
                <Ionicons name="chevron-down" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Trade/Specialty */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Trade / Specialty</Text>
              <TouchableOpacity
                style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowTradeModal(true)}
              >
                <Ionicons name="construct-outline" size={20} color={Colors.secondaryText} />
                <Text style={[styles.selectText, { color: Colors.primaryText }]}>
                  {TRADES.find(t => t.id === trade)?.name}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#059669' }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: '#059669' }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: '#059669' }]} />
              <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
              Step 2 of 3
            </Text>
          </View>
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
                    role === r && { backgroundColor: '#059669' + '10' }
                  ]}
                  onPress={() => {
                    setRole(r);
                    setShowRoleModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: Colors.primaryText }]}>{r}</Text>
                  {role === r && <Ionicons name="checkmark" size={24} color="#059669" />}
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
        onRequestClose={() => setShowTradeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Trade</Text>
              <TouchableOpacity onPress={() => setShowTradeModal(false)}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {TRADES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: Colors.border },
                    trade === t.id && { backgroundColor: '#059669' + '10' }
                  ]}
                  onPress={() => {
                    setTrade(t.id);
                    setShowTradeModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: Colors.primaryText }]}>{t.name}</Text>
                  {trade === t.id && <Ionicons name="checkmark" size={24} color="#059669" />}
                </TouchableOpacity>
              ))}
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
});
