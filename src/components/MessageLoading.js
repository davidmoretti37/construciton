import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, LightColors } from '../constants/theme';

export function MessageLoading() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Create animated values for each dot
  const anim0 = useRef(new Animated.Value(0)).current;
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnimation = (animValue, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.delay(250),
        ])
      );
    };

    const animation = Animated.parallel([
      createAnimation(anim0, 0),
      createAnimation(anim1, 100),
      createAnimation(anim2, 200),
    ]);

    animation.start();

    return () => animation.stop();
  }, [anim0, anim1, anim2]);

  const getDotTransform = (animValue) => {
    const translateY = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -6],
    });

    return { transform: [{ translateY }] };
  };

  const dotColor = Colors.primaryText;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
      <Animated.View
        style={[
          {
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: dotColor,
            marginHorizontal: 3,
          },
          getDotTransform(anim0),
        ]}
      />
      <Animated.View
        style={[
          {
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: dotColor,
            marginHorizontal: 3,
          },
          getDotTransform(anim1),
        ]}
      />
      <Animated.View
        style={[
          {
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: dotColor,
            marginHorizontal: 3,
          },
          getDotTransform(anim2),
        ]}
      />
    </View>
  );
}
