import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { BACKEND_URL } from '@env';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getSelectedLanguage } from '../utils/storage';
import OrbitalLoader from './OrbitalLoader';

const OWNER_PRIMARY = '#1E40AF';

// Configuration for different action types
const ACTION_CONFIG = {
  project: {
    title: 'New Project',
    icon: 'folder-outline',
    placeholder: 'Describe your project...\n\nTry including:\n• Client name & contact\n• Type of work (bathroom, kitchen...)\n• Size/scope\n• Budget if known\n• Start date',
    messagePrefix: 'I want to create a new project: ',
  },
  estimate: {
    title: 'New Estimate',
    icon: 'calculator-outline',
    placeholder: 'What do you need an estimate for?\n\nTry including:\n• Type of work\n• Size (sq ft, rooms, etc.)\n• Finish level (basic, mid-range, high-end)\n• Any specific materials or fixtures',
    messagePrefix: 'I need an estimate for: ',
  },
};

const QuickActionSheet = ({ visible, actionType, onClose, onSubmit }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);

  const [inputText, setInputText] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Pulse animation for recording
  const pulseScale = useSharedValue(1);

  const config = ACTION_CONFIG[actionType] || ACTION_CONFIG.project;

  // Start/stop pulse animation based on recording state
  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 500, easing: Easing.ease }),
          withTiming(1, { duration: 500, easing: Easing.ease })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Clear input when modal opens
  useEffect(() => {
    if (visible) {
      setInputText('');
      // Focus input after modal animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [visible]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const message = config.messagePrefix + inputText.trim();
    onSubmit(message);
    setInputText('');
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setInputText('');
    // Stop any ongoing recording
    if (recording) {
      recording.stopAndUnloadAsync();
      setRecording(null);
    }
    setIsRecording(false);
    setIsTranscribing(false);
    onClose();
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow microphone access to use voice input.');
        return;
      }

      // Clean up any existing recording
      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (e) {}
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Could not start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      setIsTranscribing(true);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (audioUri) => {
    try {
      const savedLanguage = await getSelectedLanguage();
      const language = savedLanguage || 'en';

      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(
        `${BACKEND_URL}/api/transcribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: base64Audio,
            contentType: 'audio/m4a',
            language: language,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      if (text.trim()) {
        // Append transcribed text to existing input
        setInputText(prev => prev ? `${prev} ${text}` : text);
      } else {
        Alert.alert('No Speech Detected', 'Could not detect any speech. Please try again.');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Transcription took too long. Please try again.');
      } else {
        Alert.alert('Error', 'Could not transcribe audio');
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleVoicePress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: Colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <View style={styles.headerIcon}>
              <Ionicons name={config.icon} size={24} color={OWNER_PRIMARY} />
            </View>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
              {config.title}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <TextInput
              ref={inputRef}
              style={[
                styles.textInput,
                {
                  backgroundColor: Colors.inputBackground || Colors.card,
                  color: Colors.primaryText,
                  borderColor: Colors.border,
                },
              ]}
              placeholder={config.placeholder}
              placeholderTextColor={Colors.tertiaryText || Colors.secondaryText}
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />

            {/* Helper text */}
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              Be as detailed as you want - the assistant will help fill in the rest.
            </Text>
          </View>

          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.footerButtons}>
              {/* Send Button */}
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: inputText.trim() && !isRecording && !isTranscribing ? OWNER_PRIMARY : Colors.border,
                  },
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || isRecording || isTranscribing}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="send"
                  size={20}
                  color={inputText.trim() && !isRecording && !isTranscribing ? '#fff' : Colors.secondaryText}
                />
                <Text
                  style={[
                    styles.sendButtonText,
                    { color: inputText.trim() && !isRecording && !isTranscribing ? '#fff' : Colors.secondaryText },
                  ]}
                >
                  Send to Assistant
                </Text>
              </TouchableOpacity>

              {/* Voice Button - with pulse animation */}
              <Animated.View style={[isRecording && pulseAnimatedStyle]}>
                <TouchableOpacity
                  style={[
                    styles.voiceButton,
                    {
                      backgroundColor: isRecording ? '#EF4444' : isTranscribing ? Colors.card : Colors.card,
                      borderColor: isRecording ? '#EF4444' : Colors.border,
                    },
                  ]}
                  onPress={handleVoicePress}
                  disabled={isTranscribing}
                  activeOpacity={0.8}
                >
                  {isTranscribing ? (
                    <OrbitalLoader size={28} color={OWNER_PRIMARY} />
                  ) : (
                    <Ionicons
                      name={isRecording ? 'stop' : 'mic'}
                      size={24}
                      color={isRecording ? '#fff' : Colors.primaryText}
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Recording/Transcribing hint */}
            {(isRecording || isTranscribing) && (
              <Text style={[styles.recordingHint, { color: isRecording ? '#EF4444' : OWNER_PRIMARY }]}>
                {isRecording ? 'Recording... Tap stop when done' : 'Transcribing...'}
              </Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${OWNER_PRIMARY}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  textInput: {
    flex: 1,
    fontSize: FontSizes.body,
    lineHeight: 24,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxHeight: 300,
  },
  helperText: {
    fontSize: FontSizes.small,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  voiceButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  sendButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  recordingHint: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontWeight: '500',
  },
});

export default QuickActionSheet;
