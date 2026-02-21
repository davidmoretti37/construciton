import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAISettings, updateAISettings } from '../../utils/storage';

const ABOUT_YOU_LIMIT = 500;
const RESPONSE_STYLE_LIMIT = 300;
const PROJECT_INSTRUCTIONS_LIMIT = 2000;

export default function AIPersonalityScreen({ navigation }) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [aboutYou, setAboutYou] = useState('');
  const [responseStyle, setResponseStyle] = useState('');
  const [projectInstructions, setProjectInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState({ aboutYou: '', responseStyle: '', projectInstructions: '' });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const changed =
      aboutYou !== originalSettings.aboutYou ||
      responseStyle !== originalSettings.responseStyle ||
      projectInstructions !== originalSettings.projectInstructions;
    setHasChanges(changed);
  }, [aboutYou, responseStyle, projectInstructions, originalSettings]);

  const loadSettings = async () => {
    try {
      const settings = await getAISettings();
      setAboutYou(settings.aboutYou || '');
      setResponseStyle(settings.responseStyle || '');
      setProjectInstructions(settings.projectInstructions || '');
      setOriginalSettings(settings);
    } catch (error) {
      console.error('Error loading AI settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;

    setSaving(true);
    try {
      const success = await updateAISettings({ aboutYou, responseStyle, projectInstructions });
      if (success) {
        setOriginalSettings({ aboutYou, responseStyle, projectInstructions });
        Alert.alert(
          t('aiPersonality.saved', 'Settings Saved'),
          t('aiPersonality.savedMessage', 'Your AI personality preferences have been updated.'),
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'settings' }));
      }
    } catch (error) {
      console.error('Error saving AI settings:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'settings' }));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      t('aiPersonality.reset', 'Reset to Default'),
      t('aiPersonality.resetConfirm', 'This will clear your AI personality settings. Continue?'),
      [
        { text: t('actions.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('actions.reset', 'Reset'),
          style: 'destructive',
          onPress: async () => {
            setAboutYou('');
            setResponseStyle('');
            setProjectInstructions('');
            const success = await updateAISettings({ aboutYou: '', responseStyle: '', projectInstructions: '' });
            if (success) {
              setOriginalSettings({ aboutYou: '', responseStyle: '', projectInstructions: '' });
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading...</Text>
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
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          {t('aiPersonality.title', 'AI Personality')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro Text */}
          <Text style={[styles.introText, { color: Colors.secondaryText }]}>
            {t('aiPersonality.intro', 'Personalize how your AI assistant responds to you.')}
          </Text>

          {/* About You Section */}
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                {t('aiPersonality.aboutYou', 'About You')}
              </Text>
            </View>
            <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
              {t('aiPersonality.aboutYouDesc', 'Help your assistant understand your business and preferences')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: Colors.lightBackground,
                  color: Colors.primaryText,
                  borderColor: Colors.border,
                },
              ]}
              placeholder={t('aiPersonality.aboutYouPlaceholder', "I'm a general contractor in Miami specializing in kitchen remodels. I usually work with 2-3 subs per project.")}
              placeholderTextColor={Colors.secondaryText + '80'}
              value={aboutYou}
              onChangeText={(text) => setAboutYou(text.slice(0, ABOUT_YOU_LIMIT))}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: Colors.secondaryText }]}>
              {aboutYou.length}/{ABOUT_YOU_LIMIT}
            </Text>
          </View>

          {/* Response Style Section */}
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="chatbubble-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                {t('aiPersonality.responseStyle', 'Response Style')}
              </Text>
            </View>
            <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
              {t('aiPersonality.responseStyleDesc', 'How should your assistant communicate with you?')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                styles.textInputSmall,
                {
                  backgroundColor: Colors.lightBackground,
                  color: Colors.primaryText,
                  borderColor: Colors.border,
                },
              ]}
              placeholder={t('aiPersonality.responseStylePlaceholder', 'Be brief and professional. Include numbers when discussing costs.')}
              placeholderTextColor={Colors.secondaryText + '80'}
              value={responseStyle}
              onChangeText={(text) => setResponseStyle(text.slice(0, RESPONSE_STYLE_LIMIT))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: Colors.secondaryText }]}>
              {responseStyle.length}/{RESPONSE_STYLE_LIMIT}
            </Text>
          </View>

          {/* Project Instructions Section */}
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                {t('aiPersonality.projectInstructions', 'Project Instructions & Templates')}
              </Text>
            </View>
            <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
              {t('aiPersonality.projectInstructionsDesc', 'Define default checklists, scope of work, and preferences the AI should follow when creating new projects.')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                styles.textInputLarge,
                {
                  backgroundColor: Colors.lightBackground,
                  color: Colors.primaryText,
                  borderColor: Colors.border,
                },
              ]}
              placeholder={t('aiPersonality.projectInstructionsPlaceholder', "Every project should include these checklist items:\n- Site prep & protection\n- Demo and hauling\n- Rough plumbing/electrical\n- Inspection\n- Drywall\n- Paint\n- Final cleanup & walkthrough\n\nAlways use my standard phase structure:\nDemo → Rough-In → Drywall → Finish → Punch List")}
              placeholderTextColor={Colors.secondaryText + '60'}
              value={projectInstructions}
              onChangeText={(text) => setProjectInstructions(text.slice(0, PROJECT_INSTRUCTIONS_LIMIT))}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: Colors.secondaryText }]}>
              {projectInstructions.length}/{PROJECT_INSTRUCTIONS_LIMIT}
            </Text>
          </View>

          {/* Info Note */}
          <View style={[styles.infoNote, { backgroundColor: Colors.primaryBlue + '10' }]}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.infoNoteText, { color: Colors.secondaryText }]}>
              {t('aiPersonality.note', "These preferences personalize your experience but won't override core features like creating estimates or managing workers.")}
            </Text>
          </View>

          {/* Reset Button */}
          {(aboutYou || responseStyle || projectInstructions) && (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleReset}
              activeOpacity={0.7}
            >
              <Text style={[styles.resetButtonText, { color: Colors.errorRed }]}>
                {t('aiPersonality.resetButton', 'Reset to Default')}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* Save Button */}
        <View style={[styles.saveContainer, { backgroundColor: Colors.background, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: hasChanges ? Colors.primaryBlue : Colors.border },
            ]}
            onPress={handleSave}
            activeOpacity={hasChanges ? 0.8 : 1}
            disabled={!hasChanges || saving}
          >
            <Text style={[styles.saveText, { color: hasChanges ? '#fff' : Colors.secondaryText }]}>
              {saving ? t('actions.saving', 'Saving...') : t('actions.saveChanges', 'Save Changes')}
            </Text>
            {!saving && <Ionicons name="checkmark" size={20} color={hasChanges ? '#fff' : Colors.secondaryText} />}
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  headerRight: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  introText: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  section: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  sectionDescription: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
    minHeight: 100,
    lineHeight: 22,
  },
  textInputSmall: {
    minHeight: 80,
  },
  textInputLarge: {
    minHeight: 160,
  },
  charCount: {
    fontSize: FontSizes.small,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  infoNoteText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  resetButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 20,
  },
  saveContainer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  saveText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
