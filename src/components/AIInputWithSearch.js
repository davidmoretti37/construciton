import React, { useState, useEffect } from 'react';
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
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { DEEPGRAM_API_KEY } from '@env';
import OrbitalLoader from './OrbitalLoader';

const AIInputWithSearch = ({
  placeholder = 'Type a message...',
  onSubmit,
  onFileSelect,
  onCameraPress,
}) => {
  const [value, setValue] = useState('');
  const [inputKey, setInputKey] = useState(0); // Force re-render key
  const [showSearch, setShowSearch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recording, setRecording] = useState(null);
  const buttonWidth = useSharedValue(80);
  const textOpacity = useSharedValue(1);
  const microphoneScale = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const pressShadow = useSharedValue(1);

  const handleSubmit = () => {
    if (value.trim()) {
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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
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

      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      console.log('Stopping recording...');
      setIsRecording(false);
      microphoneScale.value = withTiming(1, { duration: 200 });

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      console.log('Recording stopped, URI:', uri);

      if (uri) {
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
      <Animated.View
        style={[styles.inputWrapper, animatedWrapperStyle]}
        onTouchStart={handlePressIn}
        onTouchEnd={handlePressOut}
      >
        {/* Text Input Area */}
        <TextInput
          key={inputKey}
          style={styles.textInput}
          placeholder={placeholder}
          placeholderTextColor="rgba(0, 0, 0, 0.4)"
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
            {!value.trim() && !isTranscribing && (
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
            {value.trim() && !isTranscribing && (
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
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  inputWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.25,
    shadowRadius: 50,
    elevation: 50,
  },
  textInput: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    fontSize: 15,
    lineHeight: 20,
    color: '#000',
    maxHeight: 120,
    minHeight: 44,
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
