import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function PhotoGallery({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const { photos = [] } = data;

  const handlePhotoPress = (photo) => {
    if (onAction) {
      onAction({ label: 'View Photo', type: 'view-photo', data: { photo } });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {photos.map((photo, index) => (
            <TouchableOpacity
              key={index}
              style={styles.photoCard}
              onPress={() => handlePhotoPress(photo)}
              activeOpacity={0.8}
            >
              {photo.url ? (
                <Image
                  source={{ uri: photo.url }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.photoPlaceholder, { backgroundColor: Colors.lightGray }]}>
                  <Ionicons name="image-outline" size={32} color={Colors.secondaryText} />
                </View>
              )}

              {/* Photo Info Overlay */}
              <View style={styles.photoInfo}>
                {photo.projectName && (
                  <View style={styles.projectTag}>
                    <Text style={styles.projectTagText} numberOfLines={1}>
                      {photo.projectName}
                    </Text>
                  </View>
                )}

                <View style={styles.metaInfo}>
                  {photo.uploadedBy && (
                    <View style={styles.metaRow}>
                      <Ionicons name="person-outline" size={12} color="#fff" />
                      <Text style={styles.metaText}>{photo.uploadedBy}</Text>
                    </View>
                  )}
                  {photo.timestamp && (
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={12} color="#fff" />
                      <Text style={styles.metaText}>{photo.timestamp}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={40} color={Colors.secondaryText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No photos available
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  photoCard: {
    width: 180,
    height: 180,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginRight: Spacing.sm,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  projectTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: Spacing.xs,
  },
  projectTagText: {
    color: '#fff',
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  metaInfo: {
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#fff',
    fontSize: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.small,
  },
});
