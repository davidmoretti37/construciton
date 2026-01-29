import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { getColors, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const AnimatedChar = ({ char, index, delay = 50, textStyle = {} }) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    const animationDelay = index * delay;

    opacity.value = withDelay(
      animationDelay,
      withTiming(1, { duration: 400 })
    );

    translateY.value = withDelay(
      animationDelay,
      withTiming(0, { duration: 400 })
    );
  }, [index, delay]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.Text style={[styles.char, textStyle, animatedStyle]}>
      {char}
    </Animated.Text>
  );
};

const AnimatedText = ({
  text = "What would you like today?",
  delay = 50,
  textStyle = {},
}) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Split into words to prevent punctuation from wrapping to new line
  const words = text.split(' ');
  let globalCharIndex = 0;

  // Default text color based on theme
  const defaultTextStyle = {
    color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
  };

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        {words.map((word, wordIndex) => {
          const wordChars = word.split('');
          const wordElement = (
            <View key={wordIndex} style={styles.wordContainer}>
              {wordChars.map((char, charIndex) => {
                const currentIndex = globalCharIndex;
                globalCharIndex++;
                return (
                  <AnimatedChar
                    key={`${char}-${currentIndex}`}
                    char={char}
                    index={currentIndex}
                    delay={delay}
                    textStyle={[defaultTextStyle, textStyle]}
                  />
                );
              })}
            </View>
          );
          // Add space after word (except last word)
          if (wordIndex < words.length - 1) {
            const spaceIndex = globalCharIndex;
            globalCharIndex++;
            return (
              <React.Fragment key={`word-${wordIndex}`}>
                {wordElement}
                <AnimatedChar
                  key={`space-${spaceIndex}`}
                  char={'\u00A0'}
                  index={spaceIndex}
                  delay={delay}
                  textStyle={[defaultTextStyle, textStyle]}
                />
              </React.Fragment>
            );
          }
          return wordElement;
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  wordContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  char: {
    fontSize: 28,
    fontWeight: '300',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
});

export default AnimatedText;
