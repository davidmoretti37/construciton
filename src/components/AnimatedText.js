import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

const AnimatedChar = ({ char, index, delay = 50 }) => {
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
    <Animated.Text style={[styles.char, animatedStyle]}>
      {char}
    </Animated.Text>
  );
};

const AnimatedText = ({
  text = "What would you like today?",
  delay = 50,
  textStyle = {},
}) => {
  const chars = text.split('');

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        {chars.map((char, index) => (
          <AnimatedChar
            key={`${char}-${index}`}
            char={char === ' ' ? '\u00A0' : char}
            index={index}
            delay={delay}
          />
        ))}
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
  char: {
    fontSize: 28,
    fontWeight: '300',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
});

export default AnimatedText;
