import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function JobNameInputModal({ visible, onClose, onConfirm, projectData }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [jobName, setJobName] = useState(projectData?.name || '');

  const handleConfirm = () => {
    const trimmedName = jobName.trim();

    if (!trimmedName) {
      Alert.alert(t('alerts.invalidInput', 'Invalid Job Name'), t('messages.pleaseEnterValid', { item: t('projects:jobName', 'job name') }));
      return;
    }

    onConfirm({
      name: trimmedName,
    });

    setJobName('');
    onClose();
  };

  const handleClose = () => {
    setJobName('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={[styles.modalContainer, { backgroundColor: Colors.white }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: Colors.primaryText }]}>
                {t('projects:setJobName', 'Set Job Name')}
              </Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Job Name Input */}
            <View style={styles.inputSection}>
              <View style={styles.inputLabel}>
                <Ionicons name="briefcase-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.labelText, { color: Colors.primaryText }]}>
                  {t('projects:jobName', 'Job Name')}
                </Text>
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    color: Colors.primaryText,
                    borderColor: Colors.border,
                    backgroundColor: Colors.white,
                  }
                ]}
                placeholder={t('projects:jobNamePlaceholder', 'e.g., Kitchen Remodel, Bathroom Renovation')}
                placeholderTextColor={Colors.secondaryText}
                value={jobName}
                onChangeText={setJobName}
                autoFocus
                autoCapitalize="words"
              />

              <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
                {t('projects:jobNameHelper', 'Give this project a descriptive name')}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { borderColor: Colors.border }]}
                onPress={handleClose}
              >
                <Text style={[styles.buttonText, { color: Colors.secondaryText }]}>
                  {t('buttons.cancel', 'Cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.confirmButton,
                  {
                    backgroundColor: !jobName.trim() ? Colors.border : Colors.primaryBlue,
                    opacity: !jobName.trim() ? 0.5 : 1,
                  }
                ]}
                onPress={handleConfirm}
                disabled={!jobName.trim()}
              >
                <Text style={[styles.buttonText, { color: Colors.white }]}>
                  {t('projects:setJobName', 'Set Job Name')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '600',
  },
  closeButton: {
    padding: Spacing.xs,
  },
  inputSection: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  labelText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  helpText: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
