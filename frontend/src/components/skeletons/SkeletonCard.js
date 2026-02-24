import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBox from './SkeletonBox';

const SkeletonCard = ({ lines = 3, showAvatar = false, style }) => {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        {showAvatar && <SkeletonBox width={40} height={40} borderRadius={20} />}
        <View style={[styles.headerText, showAvatar && { marginLeft: 12 }]}>
          <SkeletonBox width="60%" height={14} borderRadius={4} />
          <SkeletonBox width="40%" height={10} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      </View>
      {lines > 0 && (
        <View style={styles.body}>
          {Array.from({ length: lines }).map((_, i) => (
            <SkeletonBox
              key={i}
              width={i === lines - 1 ? '70%' : '100%'}
              height={12}
              borderRadius={4}
              style={i > 0 ? { marginTop: 8 } : undefined}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  body: {
    marginTop: 14,
  },
});

export default SkeletonCard;
