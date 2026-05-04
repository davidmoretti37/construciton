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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeBlueprintForEstimate } from '../services/aiService';
import { API_URL as EXPO_PUBLIC_BACKEND_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getSelectedLanguage } from '../utils/storage';
import { supabase } from '../lib/supabase';
import OrbitalLoader from './OrbitalLoader';

const OWNER_PRIMARY = '#1E40AF';

// Configuration for different action types
const ACTION_CONFIG = {
  project: {
    title: 'Describe Project',
    subtitle: 'Write anything you know — AI builds the full project',
    icon: 'folder-outline',
    placeholder: 'Describe your project...\n\nTry including:\n• Client name & contact\n• Type of work (bathroom, kitchen...)\n• Size/scope\n• Budget if known\n• Start date',
    messagePrefix: 'I want to create a new project: ',
    infoTitle: 'How this works',
    infoBody: "Write or dictate whatever you know about the job — it doesn't need to be structured. When you hit Send, the AI pulls out the client, scope, phases, budget, and dates, and drafts a full project. You review everything before it saves.",
  },
  estimate: {
    title: 'Describe Estimate',
    subtitle: 'Write what the job needs — AI drafts the estimate',
    icon: 'calculator-outline',
    placeholder: 'What do you need an estimate for?\n\nTry including:\n• Type of work\n• Size (sq ft, rooms, etc.)\n• Finish level (basic, mid-range, high-end)\n• Any specific materials or fixtures',
    messagePrefix: 'I need an estimate for: ',
    infoTitle: 'How this works',
    infoBody: "Dictate or type whatever you know about the job. When you hit Send, the AI breaks it into line items with materials, labor, and markup, and drafts an estimate you can edit and send to the client.",
  },
};

const QuickActionSheet = ({ visible, actionType, onClose, onSubmit, onPhotoExtract }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);

  const [inputText, setInputText] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [extractingPhoto, setExtractingPhoto] = useState(false);

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

  // Load saved draft when modal opens
  useEffect(() => {
    if (visible && actionType) {
      const loadDraft = async () => {
        try {
          const saved = await AsyncStorage.getItem(`@quickaction_draft_${actionType}`);
          setInputText(saved || '');
        } catch (e) {
          setInputText('');
        }
      };
      loadDraft();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible, actionType]);

  // Auto-save draft as user types
  useEffect(() => {
    if (actionType && visible) {
      AsyncStorage.setItem(`@quickaction_draft_${actionType}`, inputText);
    }
  }, [inputText, actionType, visible]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const message = config.messagePrefix + inputText.trim();
    onSubmit(message);
    setInputText('');
    if (actionType) AsyncStorage.removeItem(`@quickaction_draft_${actionType}`);
  };

  /**
   * Estimate-only path: snap a blueprint / sketch / handwritten notes,
   * extract line items via AI, jump straight to EstimateBuilder
   * pre-filled. Bypasses the chat round-trip entirely so the user goes
   * from photo → editable estimate in one tap.
   */
  const handleSnapForEstimate = async () => {
    Alert.alert('Snap to estimate', 'Take a photo of a blueprint, sketch, or handwritten notes — we\'ll extract line items.', [
      { text: 'Take Photo', onPress: async () => {
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) await runPhotoExtract(result.assets[0].uri);
      }},
      { text: 'Choose from Gallery', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) await runPhotoExtract(result.assets[0].uri);
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const runPhotoExtract = async (uri) => {
    if (!onPhotoExtract) return;
    try {
      setExtractingPhoto(true);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const r = await analyzeBlueprintForEstimate(base64);
      if (!r || !Array.isArray(r.items) || r.items.length === 0) {
        Alert.alert('Nothing extracted', 'I couldn\'t pull line items from that photo. Try a clearer image, or describe it instead.');
        return;
      }
      const items = r.items.map((it) => ({
        description: String(it.description || '').trim(),
        quantity: Number(it.quantity || 1),
        unit: it.unit || 'ea',
        pricePerUnit: Number(it.pricePerUnit || 0),
        total: Number(it.total || (Number(it.quantity || 1) * Number(it.pricePerUnit || 0))),
      })).filter((it) => it.description);
      // Hand off to navigator → EstimateBuilder with seed draft
      onPhotoExtract({ items, notes: r.notes || '' });
      // Clear the typed draft since we're going to a different flow
      setInputText('');
      if (actionType) AsyncStorage.removeItem(`@quickaction_draft_${actionType}`);
    } catch (e) {
      Alert.alert('Couldn\'t read photo', 'Try a clearer image, or describe the estimate manually.');
    } finally {
      setExtractingPhoto(false);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    // Don't clear inputText — draft persists via AsyncStorage
    if (recording) {
      recording.stopAndUnloadAsync();
      setRecording(null);
    }
    setIsRecording(false);
    setIsTranscribing(false);
    onClose();
  };

  const handleClearDraft = () => {
    setInputText('');
    if (actionType) AsyncStorage.removeItem(`@quickaction_draft_${actionType}`);
    inputRef.current?.focus();
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

      // Attach Supabase JWT — backend /api/transcribe requires auth
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/transcribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <View style={styles.headerIcon}>
              <Ionicons name={config.icon} size={24} color={OWNER_PRIMARY} />
            </View>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
                  {config.title}
                </Text>
                <TouchableOpacity
                  style={styles.infoButton}
                  onPress={() => Alert.alert(config.infoTitle, config.infoBody)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="information-circle-outline" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              </View>
              {config.subtitle && (
                <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]} numberOfLines={2}>
                  {config.subtitle}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Content - Input Container with integrated controls */}
          <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.md }]}>
            {/* Estimate-only: snap-to-extract shortcut */}
            {actionType === 'estimate' && onPhotoExtract && (
              <TouchableOpacity
                onPress={handleSnapForEstimate}
                disabled={extractingPhoto}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 12, paddingHorizontal: 14,
                  borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
                  borderColor: extractingPhoto ? '#94A3B8' : OWNER_PRIMARY,
                  backgroundColor: extractingPhoto ? '#F1F5F9' : '#EFF6FF',
                  marginBottom: Spacing.md,
                }}
                activeOpacity={0.7}
              >
                {extractingPhoto ? (
                  <Animated.View>
                    <Ionicons name="hourglass-outline" size={18} color={OWNER_PRIMARY} />
                  </Animated.View>
                ) : (
                  <Ionicons name="camera-outline" size={18} color={OWNER_PRIMARY} />
                )}
                <Text style={{ color: OWNER_PRIMARY, fontSize: 13, fontWeight: '600' }}>
                  {extractingPhoto ? 'Reading photo…' : 'Snap blueprint / sketch / notes instead'}
                </Text>
              </TouchableOpacity>
            )}
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: Colors.inputBackground || Colors.card,
                borderColor: Colors.border,
              },
            ]}>
              {/* TextInput */}
              <TextInput
                ref={inputRef}
                style={[
                  styles.textInput,
                  { color: Colors.primaryText },
                ]}
                placeholder={config.placeholder}
                placeholderTextColor={Colors.tertiaryText || Colors.secondaryText}
                value={inputText}
                onChangeText={setInputText}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
              />

              {/* Recording/Transcribing overlay */}
              {(isRecording || isTranscribing) && (
                <View style={styles.recordingOverlay}>
                  {isRecording ? (
                    <Animated.View style={pulseAnimatedStyle}>
                      <View style={styles.recordingIndicator}>
                        <Ionicons name="mic" size={32} color="#EF4444" />
                        <Text style={styles.recordingText}>Recording...</Text>
                      </View>
                    </Animated.View>
                  ) : (
                    <View style={styles.transcribingIndicator}>
                      <OrbitalLoader size={40} color={OWNER_PRIMARY} />
                      <Text style={[styles.transcribingText, { color: OWNER_PRIMARY }]}>Transcribing...</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Controls Bar - inside the input container */}
              <View style={[styles.controlsBar, { borderTopColor: Colors.border }]}>
                {/* Left side: notes hint with delete, or default helper */}
                {inputText.trim() ? (
                  <View style={styles.notesRow}>
                    <TouchableOpacity
                      style={styles.clearButton}
                      onPress={handleClearDraft}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.secondaryText} />
                    </TouchableOpacity>
                    <Ionicons name="document-text-outline" size={12} color={Colors.tertiaryText || Colors.secondaryText} />
                    <Text style={[styles.notesHint, { color: Colors.tertiaryText || Colors.secondaryText }]}>
                      Notes saved
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.helperText, { color: Colors.secondaryText }]} numberOfLines={1}>
                    Notes
                  </Text>
                )}

                {/* Right side controls */}
                <View style={styles.rightControls}>
                  {/* Show mic when no text, send when there is text */}
                  {!inputText.trim() && !isTranscribing ? (
                    <Animated.View style={[isRecording && pulseAnimatedStyle]}>
                      <TouchableOpacity
                        style={[
                          styles.controlButton,
                          {
                            backgroundColor: isRecording ? '#EF4444' : `${OWNER_PRIMARY}15`,
                          },
                        ]}
                        onPress={handleVoicePress}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isRecording ? 'stop' : 'mic'}
                          size={22}
                          color={isRecording ? '#fff' : OWNER_PRIMARY}
                        />
                      </TouchableOpacity>
                    </Animated.View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        {
                          backgroundColor: inputText.trim() && !isTranscribing ? OWNER_PRIMARY : Colors.border,
                        },
                      ]}
                      onPress={handleSend}
                      disabled={!inputText.trim() || isTranscribing}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="send"
                        size={18}
                        color={inputText.trim() && !isTranscribing ? '#fff' : Colors.secondaryText}
                      />
                      <Text
                        style={[
                          styles.sendButtonText,
                          { color: inputText.trim() && !isTranscribing ? '#fff' : Colors.secondaryText },
                        ]}
                      >
                        Send
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
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
  headerTextWrap: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  infoButton: {
    padding: 2,
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
  inputContainer: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  textInput: {
    flex: 1,
    fontSize: FontSizes.body,
    lineHeight: 24,
    padding: Spacing.md,
    minHeight: 150,
  },
  recordingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingIndicator: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  recordingText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: '#EF4444',
  },
  transcribingIndicator: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  transcribingText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  helperText: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  clearButton: {
    padding: 4,
  },
  notesHint: {
    fontSize: FontSizes.small - 1,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  sendButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});

export default QuickActionSheet;
