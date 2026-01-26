import React, { useRef, useCallback } from 'react';
import {
  View,
  Modal,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * FullscreenPhotoViewer - Reusable fullscreen photo gallery with swipe navigation
 *
 * @param {Array} photos - Array of photo objects with 'url' property
 * @param {boolean} visible - Whether the modal is visible
 * @param {number} initialIndex - Starting photo index
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onIndexChange - Optional callback when photo index changes
 */
const FullscreenPhotoViewer = ({
  photos = [],
  visible = false,
  initialIndex = 0,
  onClose,
  onIndexChange,
}) => {
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const insets = useSafeAreaInsets();

  // Reset to initial index when modal opens
  React.useEffect(() => {
    if (visible && flatListRef.current && photos.length > 0) {
      const safeIndex = Math.min(initialIndex, photos.length - 1);
      setCurrentIndex(safeIndex);
      // Scroll to initial index after a brief delay to ensure FlatList is ready
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: safeIndex,
          animated: false,
        });
      }, 50);
    }
  }, [visible, initialIndex, photos.length]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [onIndexChange]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemLayout = useCallback((data, index) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const renderPhoto = useCallback(({ item, index }) => {
    const photoUrl = item.url || item.uri || item;

    return (
      <View style={styles.photoContainer}>
        <Image
          source={{ uri: photoUrl }}
          style={styles.photo}
          resizeMode="contain"
        />
      </View>
    );
  }, []);

  const keyExtractor = useCallback((item, index) => {
    return item.id || item.url || item.uri || `photo-${index}`;
  }, []);

  if (!photos || photos.length === 0) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
      <View style={styles.container}>
        {/* Header with close button and counter */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.counter}>
            {currentIndex + 1} / {photos.length}
          </Text>

          {/* Spacer to balance header */}
          <View style={styles.headerSpacer} />
        </View>

        {/* Photo Gallery with horizontal swipe */}
        <FlatList
          ref={flatListRef}
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          initialScrollIndex={Math.min(initialIndex, photos.length - 1)}
          decelerationRate="fast"
          bounces={false}
          style={styles.flatList}
        />

        {/* Swipe hint (shows briefly) */}
        {photos.length > 1 && currentIndex === initialIndex && (
          <View style={[styles.swipeHint, { bottom: insets.bottom + 30 }]}>
            <Ionicons name="swap-horizontal" size={20} color="rgba(255,255,255,0.6)" />
            <Text style={styles.swipeHintText}>Swipe to navigate</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 44,
  },
  flatList: {
    flex: 1,
  },
  photoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.85,
  },
  swipeHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  swipeHintText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
});

export default FullscreenPhotoViewer;
