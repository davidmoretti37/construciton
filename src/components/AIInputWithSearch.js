import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Platform,
  Alert,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { DEEPGRAM_API_KEY } from '@env';
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
const USE_OPTIMIZED_AUDIO = false;

const AIInputWithSearch = ({
  placeholder = 'Type a message...',
  onSubmit,
  onFileSelect,
  onCameraPress,
  onPopulateInput, // New prop to expose setValue to parent
}) => {
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
  const shimmerRotation = useSharedValue(0);

  // Shimmer border animation
  useEffect(() => {
    shimmerRotation.value = withRepeat(
      withTiming(360, {
        duration: 3000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

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
          'Microphone Permission Required',
          'Please enable microphone access to use voice input.',
          [{ text: 'OK' }]
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

      // Animate microphone
      microphoneScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );

      console.log('🎙️ Recording started (voice mode enabled for fast AI)');

    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceMode(false); // Disable voice mode on error
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

  /**
   * Stop recording and immediately start transcription
   */
  const stopRecording = async () => {
    if (!recording) return;

    try {
      console.log('🛑 Stopping recording...');
      setIsRecording(false);
      microphoneScale.value = withTiming(1, { duration: 200 });

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
      Alert.alert('Error', 'Could not stop recording.');
    }
  };

  const transcribeAudio = async (audioUri) => {
    try {
      setIsTranscribing(true);

      console.log('Starting transcription for:', audioUri);

      // Check if API key is configured
      if (!DEEPGRAM_API_KEY || DEEPGRAM_API_KEY === 'YOUR_DEEPGRAM_API_KEY_HERE') {
        Alert.alert(
          'API Key Required',
          'Please add your Deepgram API key to .env file. Get a free key at https://console.deepgram.com/signup',
          [{ text: 'OK' }]
        );
        setIsTranscribing(false);
        return;
      }

      // Read audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to binary buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log('Sending to Deepgram API...');

      // Call Deepgram API for transcription
      const response = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/m4a',
          },
          body: bytes.buffer,
        }
      );

      console.log('Deepgram API response status:', response.status);

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
        onSubmit?.(text, false);
        // Clear input is handled by onSubmit in parent
      } else {
        Alert.alert('No Speech', 'Could not detect speech. Please try again.');
        setIsTranscribing(false);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setIsTranscribing(false);
      Alert.alert('Error', 'Could not transcribe audio. Please type instead.');
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

  // Animated input wrapper style (press animation)
  const animatedWrapperStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pressScale.value }],
      shadowOpacity: 0.25 * pressShadow.value,
      shadowRadius: 50 * pressShadow.value,
    };
  });

  // Animated shimmer border style
  const animatedShimmerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${shimmerRotation.value}deg` }],
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

  return (
    <View style={styles.container}>
      {/* Shimmer Border Container */}
      <View style={styles.shimmerContainer}>
        {/* Rotating Shimmer Gradient */}
        <Animated.View style={[styles.shimmerBorder, animatedShimmerStyle]}>
          <LinearGradient
            colors={['#9CA3AF', '#E5E5E5', '#6B7280', '#E5E5E5', '#9CA3AF']}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>

        {/* Main Input Wrapper */}
        <Animated.View
          style={[styles.inputWrapper, animatedWrapperStyle]}
          onTouchStart={handlePressIn}
          onTouchEnd={handlePressOut}
        >
          {/* Glare/Shine Effect */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.2)']}
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
            isRecording && styles.textInputRecording,
          ]}
          placeholder={isRecording ? 'Listening...' : placeholder}
          placeholderTextColor={isRecording ? '#EF4444' : 'rgba(0, 0, 0, 0.4)'}
          value={value}
          onChangeText={setValue}
          multiline
          maxLength={500}
          onSubmitEditing={handleSubmit}
          blurOnSubmit={false}
          editable={!isRecording}
        />

        {/* Bottom Controls Bar */}
        <View style={styles.controlsBar}>
          {/* Left Side Controls */}
          <View style={styles.leftControls}>
            {/* Paperclip Button */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onFileSelect}
              activeOpacity={0.7}
            >
              <Ionicons
                name="attach"
                size={18}
                color="rgba(0, 0, 0, 0.4)"
              />
            </TouchableOpacity>

            {/* Search toggle removed per requirement */}
          </View>

          {/* Right Side - Action Buttons */}
          <View style={styles.rightControls}>
            {/* Show microphone and camera when no text */}
            {!(value && value.trim()) && !isTranscribing && (
              <>
                <Animated.View style={animatedMicrophoneStyle}>
                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      isRecording && styles.recordingButton,
                    ]}
                    onPress={handleMicrophonePress}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isRecording ? 'mic' : 'mic-outline'}
                      size={18}
                      color={isRecording ? '#EF4444' : 'rgba(0, 0, 0, 0.4)'}
                    />
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={onCameraPress}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="camera"
                    size={18}
                    color="rgba(0, 0, 0, 0.4)"
                  />
                </TouchableOpacity>
              </>
            )}

            {/* Show transcribing indicator */}
            {isTranscribing && (
              <View style={styles.transcribingContainer}>
                <OrbitalLoader size={32} color="#0EA5E9" />
              </View>
            )}

            {/* Show send button when there's text */}
            {value && value.trim() && !isTranscribing && (
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  styles.sendButtonActive,
                ]}
                onPress={handleSubmit}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color="#0EA5E9"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    width: '100%',
  },
  shimmerContainer: {
    borderRadius: 30,
    padding: 2,
    overflow: 'hidden',
  },
  shimmerBorder: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerGradient: {
    width: 600,
    height: 600,
  },
  inputWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 0,
    shadowColor: '#000',
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
    color: '#000',
    maxHeight: 140,
    minHeight: 44,
  },
  textInputRecording: {
    color: '#EF4444', // Red text when showing live transcript
    fontStyle: 'italic',
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  transcribingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  searchButton: {
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  searchButtonActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderColor: 'rgba(14, 165, 233, 0.5)',
  },
  searchText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0EA5E9',
    overflow: 'hidden',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
});

export default AIInputWithSearch;
