import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const AIInputWithSearch = ({
  placeholder = 'Type a message...',
  onSubmit,
  onFileSelect,
  onCameraPress,
}) => {
  const [value, setValue] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const buttonWidth = useSharedValue(80);
  const textOpacity = useSharedValue(1);

  const handleSubmit = () => {
    if (value.trim()) {
      const textToSend = value.trim();
      setValue(''); // Clear immediately
      onSubmit?.(textToSend, false);
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

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        {/* Text Input Area */}
        <TextInput
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

          {/* Right Side - Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              value.trim() && styles.sendButtonActive,
            ]}
            onPress={value.trim() ? handleSubmit : onCameraPress}
            activeOpacity={0.7}
          >
            <Ionicons
              name={value.trim() ? 'send' : 'camera'}
              size={18}
              color={value.trim() ? '#0EA5E9' : 'rgba(0, 0, 0, 0.4)'}
            />
          </TouchableOpacity>
        </View>
      </View>
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
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.15)',
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
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
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
