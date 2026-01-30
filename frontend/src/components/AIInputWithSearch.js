import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getSelectedLanguage } from '../utils/storage';

const BACKEND_URL = EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
import OrbitalLoader from './OrbitalLoader';
import { setVoiceMode } from '../services/aiService';

/**
 * VOICE TRANSCRIPTION OPTIMIZATION
 *
 * This component uses optimized batch transcription with voice mode:
 * 1. Optimized audio format (16kHz mono) for smaller files
 * 2. Enables "voice mode" in aiService for faster model + shorter prompts
 * 3. Voice mode auto-disables after response completes
 *
 * Speed improvements:
 * - Smaller audio files = faster upload
 * - Voice mode = Haiku model (~200-400ms first token)
 * - Voice mode = condensed prompts (~60% fewer input tokens)
 * - Voice mode = 1000 max tokens (vs 4000) for shorter responses
 */
// Set to false to use Expo's default recording preset (more compatible)
const USE_OPTIMIZED_AUDIO = true;

const AIInputWithSearch = ({
  placeholder = 'Type a message...',
  onSubmit,
  onFileSelect,
  onCameraPress,
  onPopulateInput, // New prop to expose setValue to parent
}) => {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [value, setValue] = useState('');
  const [inputKey, setInputKey] = useState(0); // Force re-render key
  const [showSearch, setShowSearch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recording, setRecording] = useState(null);
  const inputRef = useRef(null);
  const buttonWidth = useSharedValue(80);
  const textOpacity = useSharedValue(1);
  const microphoneScale = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const pressShadow = useSharedValue(1);

  // New animated values for recording circle transformation
  const containerWidth = useSharedValue(SCREEN_WIDTH - 20);
  const containerHeight = useSharedValue(110); // Approximate default height
  const containerBorderRadius = useSharedValue(28);
  const inputContentOpacity = useSharedValue(1);
  const circleOpacity = useSharedValue(0);
  const glowIntensity = useSharedValue(0);
  const circleColorProgress = useSharedValue(0);

  // Pulsing ring animation values
  const pulseRing1Scale = useSharedValue(1);
  const pulseRing1Opacity = useSharedValue(0);
  const pulseRing2Scale = useSharedValue(1);
  const pulseRing2Opacity = useSharedValue(0);

  // Expose setValue and focus function to parent component via callback
  useEffect(() => {
    if (onPopulateInput) {
      const populateFunction = (text) => {
        console.log('populateFunction called with text:', text);
        setValue(text);
        // Focus the input after populating
        setTimeout(() => {
          console.log('Attempting to focus input');
          inputRef.current?.focus();
        }, 100);
      };
      console.log('Setting up populateFunction in parent');
      onPopulateInput(populateFunction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const handleSubmit = () => {
    if (value && value.trim()) {
      const textToSend = value.trim();
      onSubmit?.(textToSend, false);
      // Clear input and force re-render
      setValue('');
      setInputKey(prev => prev + 1);
    }
  };

  const toggleSearch = () => {
    const newState = !showSearch;
    setShowSearch(newState);

    buttonWidth.value = withTiming(newState ? 80 : 32, {
      duration: 250,
    });
    textOpacity.value = withTiming(newState ? 1 : 0, {
      duration: 150,
    });
  };

  // Setup audio permissions
  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
    })();
  }, []);

  /**
   * Start recording with optimized settings for fast transcription
   * Uses 16kHz mono audio for smaller file size and faster upload
   * Enables voice mode for faster AI responses
   */
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permissions.microphoneRequired'),
          t('permissions.enableMicrophoneAccess'),
          [{ text: t('buttons.ok') }]
        );
        return;
      }

      // Clean up any existing recording first
      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (e) {
          // Ignore cleanup errors
        }
        setRecording(null);
      }

      // Reset audio mode and prepare for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Use optimized recording settings for speech
      // 16kHz mono = smaller files = faster upload = faster transcription
      const { recording: newRecording } = await Audio.Recording.createAsync(
        USE_OPTIMIZED_AUDIO ? {
          // Optimized for speech transcription
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 64000, // Lower bitrate = smaller file = faster upload
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MEDIUM,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 64000,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 64000,
          },
        } : Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      // Recording created successfully - now enable voice mode
      setVoiceMode(true);

      setRecording(newRecording);
      setIsRecording(true);

      // Animate to circle
      const animConfig = { duration: 300, easing: Easing.out(Easing.cubic) };
      containerWidth.value = withTiming(80, animConfig);
      containerHeight.value = withTiming(80, animConfig);
      containerBorderRadius.value = withTiming(40, animConfig);
      inputContentOpacity.value = withTiming(0, { duration: 150 });
      circleOpacity.value = withTiming(1, { duration: 300 });
      circleColorProgress.value = withTiming(1, animConfig);

      // Pulse animation for the circle
      microphoneScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Glow pulse animation
      glowIntensity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Pulsing ring animations (two rings with staggered timing for continuous effect)
      pulseRing1Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 0 }),
          withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );
      pulseRing1Opacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 0 }),
          withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );

      // Second ring starts 600ms after first for continuous pulse effect
      setTimeout(() => {
        pulseRing2Scale.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        );
        pulseRing2Opacity.value = withRepeat(
          withSequence(
            withTiming(0.6, { duration: 0 }),
            withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        );
      }, 600);

      console.log('🎙️ Recording started (voice mode enabled for fast AI)');

    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceMode(false); // Disable voice mode on error
      Alert.alert(t('alerts.error'), t('messages.couldNotStartRecording'));
    }
  };

  /**
   * Stop recording and immediately start transcription
   */
  // Animate circle back to input (called after transcription completes)
  const animateBackToInput = () => {
    const animConfig = { duration: 300, easing: Easing.out(Easing.cubic) };
    containerWidth.value = withTiming(SCREEN_WIDTH - 20, animConfig);
    containerHeight.value = withTiming(110, animConfig);
    containerBorderRadius.value = withTiming(28, animConfig);
    circleOpacity.value = withTiming(0, { duration: 150 });
    inputContentOpacity.value = withTiming(1, { duration: 300 });
    circleColorProgress.value = withTiming(0, animConfig);
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      console.log('🛑 Stopping recording...');
      setIsRecording(false);

      // Stop pulse animations (but keep circle visible for transcribing)
      microphoneScale.value = withTiming(1, { duration: 200 });
      glowIntensity.value = withTiming(0, { duration: 200 });
      // Stop ring animations
      pulseRing1Scale.value = 1;
      pulseRing1Opacity.value = withTiming(0, { duration: 200 });
      pulseRing2Scale.value = 1;
      pulseRing2Opacity.value = withTiming(0, { duration: 200 });

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      console.log('📁 Recording stopped, URI:', uri);

      if (uri) {
        // Start transcription immediately
        await transcribeAudio(uri);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert(t('alerts.error'), t('messages.couldNotStopRecording'));
    }
  };

  const transcribeAudio = async (audioUri) => {
    try {
      setIsTranscribing(true);

      // Get user's saved language preference from Supabase
      const savedLanguage = await getSelectedLanguage();
      const language = savedLanguage || 'en';

      console.log('Starting transcription for:', audioUri, 'language:', language);

      // Read audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('Sending to backend for transcription...');

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

      // Call backend transcription proxy
      const response = await fetch(
        `${BACKEND_URL}/api/transcribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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

      console.log('Transcription API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepgram API error:', errorText);
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      console.log('Transcribed text:', text);

      if (text.trim()) {
        // Auto-send the transcribed text
        console.log('Auto-sending transcribed text:', text);
        setIsTranscribing(false);
        animateBackToInput();
        onSubmit?.(text, false);
        // Clear input is handled by onSubmit in parent
      } else {
        Alert.alert(t('alerts.noSpeech'), t('messages.couldNotDetectSpeech'));
        setIsTranscribing(false);
        animateBackToInput();
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setIsTranscribing(false);
      animateBackToInput();

      // Handle timeout vs other errors
      if (error.name === 'AbortError') {
        Alert.alert(t('alerts.timeout'), t('messages.transcriptionTimeout'));
      } else {
        Alert.alert(t('alerts.error'), t('messages.couldNotTranscribeAudio'));
      }
    }
  };

  const handleMicrophonePress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Animated button style
  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      width: buttonWidth.value,
      paddingHorizontal: buttonWidth.value > 50 ? 10 : 6,
    };
  });

  // Animated text style
  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      opacity: textOpacity.value,
      maxWidth: textOpacity.value < 0.1 ? 0 : 50,
    };
  });

  // Animated microphone style
  const animatedMicrophoneStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: microphoneScale.value }],
    };
  });

  // Animated input wrapper style (press animation + circle transformation + pulse when recording)
  const animatedWrapperStyle = useAnimatedStyle(() => {
    return {
      width: containerWidth.value,
      height: containerHeight.value,
      borderRadius: containerBorderRadius.value,
      transform: [{ scale: pressScale.value * microphoneScale.value }], // Pulse the whole circle
      shadowOpacity: 0.25 * pressShadow.value + glowIntensity.value * 0.5,
      shadowRadius: 20 + glowIntensity.value * 15,
      alignSelf: 'center',
    };
  });

  // Animated style for input content (fades out when recording)
  const animatedInputContentStyle = useAnimatedStyle(() => {
    return {
      opacity: inputContentOpacity.value,
      display: inputContentOpacity.value < 0.1 ? 'none' : 'flex',
    };
  });

  // Animated style for recording circle (fades in when recording)
  const animatedCircleStyle = useAnimatedStyle(() => {
    return {
      opacity: circleOpacity.value,
      transform: [{ scale: microphoneScale.value }],
    };
  });

  // Animated styles for pulse rings
  const animatedPulseRing1Style = useAnimatedStyle(() => {
    return {
      opacity: pulseRing1Opacity.value,
      transform: [{ scale: pulseRing1Scale.value }],
    };
  });

  const animatedPulseRing2Style = useAnimatedStyle(() => {
    return {
      opacity: pulseRing2Opacity.value,
      transform: [{ scale: pulseRing2Scale.value }],
    };
  });

  const handlePressIn = () => {
    pressScale.value = withTiming(0.98, { duration: 100 });
    pressShadow.value = withTiming(0.5, { duration: 100 });
  };

  const handlePressOut = () => {
    pressScale.value = withTiming(1, { duration: 150 });
    pressShadow.value = withTiming(1, { duration: 150 });
  };

  const glareColors = isDark
    ? ['transparent', 'transparent', 'transparent']
    : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.2)'];

  const iconColor = isDark ? Colors.secondaryText : 'rgba(0, 0, 0, 0.4)';
  const iconBgColor = isDark ? Colors.border + '50' : 'rgba(0, 0, 0, 0.05)';

  // Circle colors based on theme
  const circleColor = isDark ? '#FFFFFF' : '#000000';
  const circleIconColor = isDark ? '#000000' : '#FFFFFF';

  return (
    <View style={styles.container}>
        {/* Main Input Wrapper - transforms to circle when recording/transcribing */}
        <Animated.View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: (isRecording || isTranscribing) ? circleColor : Colors.cardBackground,
              shadowColor: (isRecording || isTranscribing) ? circleColor : Colors.shadow,
              borderColor: (isRecording || isTranscribing) ? circleColor : '#000000',
              overflow: 'hidden',
            },
            animatedWrapperStyle
          ]}
          onTouchStart={!(isRecording || isTranscribing) ? handlePressIn : undefined}
          onTouchEnd={!(isRecording || isTranscribing) ? handlePressOut : undefined}
        >
          {/* Recording/Transcribing Circle */}
          {(isRecording || isTranscribing) && (
            <>
              {/* Pulse Rings - only show when recording (not transcribing) */}
              {isRecording && (
                <>
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      { borderColor: circleColor },
                      animatedPulseRing1Style,
                    ]}
                    pointerEvents="none"
                  />
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      { borderColor: circleColor },
                      animatedPulseRing2Style,
                    ]}
                    pointerEvents="none"
                  />
                </>
              )}
              <TouchableOpacity
                style={styles.recordingCircleButton}
                onPress={isRecording ? handleMicrophonePress : undefined}
                activeOpacity={isRecording ? 0.8 : 1}
                disabled={isTranscribing}
              >
                {isTranscribing ? (
                  <OrbitalLoader size={40} color={circleIconColor} />
                ) : (
                  <Animated.View style={[styles.recordingCircleContent, animatedCircleStyle]}>
                    <Ionicons name="mic" size={32} color={circleIconColor} />
                  </Animated.View>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Normal Input Content - hidden when recording/transcribing */}
          {!(isRecording || isTranscribing) && (
            <>
              {/* Glare/Shine Effect */}
              <LinearGradient
                colors={glareColors}
                locations={[0, 0.3, 1]}
                style={styles.glareOverlay}
                pointerEvents="none"
              />

              {/* Text Input Area */}
              <TextInput
                ref={inputRef}
                key={inputKey}
                style={[
                  styles.textInput,
                  { color: Colors.primaryText },
                ]}
                placeholder={placeholder}
                placeholderTextColor={Colors.placeholderText}
                value={value}
                onChangeText={setValue}
                multiline
                maxLength={500}
                onSubmitEditing={handleSubmit}
                blurOnSubmit={false}
              />

              {/* Bottom Controls Bar */}
              <View style={styles.controlsBar}>
                {/* Left Side Controls */}
                <View style={styles.leftControls}>
                  {/* Paperclip Button */}
                  <TouchableOpacity
                    style={[styles.iconButton, { backgroundColor: iconBgColor }]}
                    onPress={onFileSelect}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="attach"
                      size={18}
                      color={iconColor}
                    />
                  </TouchableOpacity>
                </View>

                {/* Right Side - Action Buttons */}
                <View style={styles.rightControls}>
                  {/* Show microphone and camera when no text */}
                  {!(value && value.trim()) && !isTranscribing && (
                    <>
                      <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: iconBgColor }]}
                        onPress={handleMicrophonePress}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="mic-outline"
                          size={18}
                          color={iconColor}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: iconBgColor }]}
                        onPress={onCameraPress}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="camera"
                          size={18}
                          color={iconColor}
                        />
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Show transcribing indicator */}
                  {isTranscribing && (
                    <View style={styles.transcribingContainer}>
                      <OrbitalLoader size={32} color={Colors.primaryBlue} />
                    </View>
                  )}

                  {/* Show send button when there's text */}
                  {value && value.trim() && !isTranscribing && (
                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        { backgroundColor: Colors.primaryBlue + '20' },
                      ]}
                      onPress={handleSubmit}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="send"
                        size={18}
                        color={Colors.primaryBlue}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          )}
        </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    width: '100%',
  },
  inputWrapper: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  glareOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  textInput: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 140,
    minHeight: 44,
  },
  textInputRecording: {
    color: '#EF4444', // Red text when showing live transcript
    fontStyle: 'italic',
  },
  recordingCircleButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingCircleContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    height: 48,
  },
  leftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcribingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AIInputWithSearch;
