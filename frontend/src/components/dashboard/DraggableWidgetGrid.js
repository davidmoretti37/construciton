/**
 * DraggableWidgetGrid — iOS-style draggable grid for dashboard widgets.
 * Small widgets sit side-by-side (2 per row), medium/large take full width.
 * Long-press to drag, drop to reorder, remove button, tap to resize.
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '../../constants/theme';
import { getWidgetSize, colWidth } from './WidgetGrid';

const screenWidth = Dimensions.get('window').width;
const GAP = 12;
const GRID_PADDING = Spacing.lg;
const FULL_WIDTH = screenWidth - GRID_PADDING * 2;
const LONG_PRESS_MS = 300;

/**
 * Calculate grid positions for items based on their sizes.
 */
function calculateGridPositions(items) {
  const positions = [];
  let y = 0;
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const { width, height } = getWidgetSize(item.size);

    if (item.size === 'small') {
      if (i + 1 < items.length && items[i + 1].size === 'small') {
        const nextItem = items[i + 1];
        const { height: nextHeight } = getWidgetSize(nextItem.size);
        const rowHeight = Math.max(height, nextHeight);
        positions.push({ ...item, x: 0, y, w: width, h: rowHeight });
        positions.push({ ...nextItem, x: colWidth + GAP, y, w: colWidth, h: rowHeight });
        y += rowHeight + GAP;
        i += 2;
      } else {
        positions.push({ ...item, x: 0, y, w: width, h: height });
        y += height + GAP;
        i += 1;
      }
    } else {
      positions.push({ ...item, x: 0, y, w: FULL_WIDTH, h: height });
      y += height + GAP;
      i += 1;
    }
  }

  return { positions, totalHeight: y };
}

function DraggableWidget({ item, position, onRemove, onResize, renderWidget, onDragStart, onDragMove, onDragEnd }) {
  const pan = useRef(new Animated.ValueXY({ x: position.x, y: position.y })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const zIndexVal = useRef(new Animated.Value(0)).current;
  const isDragging = useRef(false);
  const longPressTimer = useRef(null);
  const dragActivated = useRef(false);

  // Snap to position when not dragging
  React.useEffect(() => {
    if (!isDragging.current) {
      Animated.spring(pan, {
        toValue: { x: position.x, y: position.y },
        useNativeDriver: false,
        tension: 200,
        friction: 25,
      }).start();
    }
  }, [position.x, position.y]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => dragActivated.current,
      onPanResponderGrant: (_, gs) => {
        dragActivated.current = false;
        // Start long-press timer
        longPressTimer.current = setTimeout(() => {
          dragActivated.current = true;
          isDragging.current = true;
          pan.setOffset({ x: pan.x._value, y: pan.y._value });
          pan.setValue({ x: 0, y: 0 });
          Animated.parallel([
            Animated.spring(scale, { toValue: 1.08, useNativeDriver: false, tension: 300 }),
            Animated.timing(zIndexVal, { toValue: 100, duration: 0, useNativeDriver: false }),
          ]).start();
          onDragStart(item.id);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_, gs) => {
        // Cancel long-press if moved too much before activation
        if (!dragActivated.current && (Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8)) {
          clearTimeout(longPressTimer.current);
          return;
        }
        if (dragActivated.current) {
          pan.setValue({ x: gs.dx, y: gs.dy });
          onDragMove(item.id, position.x + gs.dx, position.y + gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        clearTimeout(longPressTimer.current);
        if (dragActivated.current) {
          pan.flattenOffset();
          isDragging.current = false;
          dragActivated.current = false;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: false }),
            Animated.timing(zIndexVal, { toValue: 0, duration: 0, useNativeDriver: false }),
          ]).start();
          onDragEnd(item.id);
        } else {
          // It was a tap — trigger resize
          if (Math.abs(gs.dx) < 8 && Math.abs(gs.dy) < 8) {
            onResize(item);
          }
        }
      },
      onPanResponderTerminate: () => {
        clearTimeout(longPressTimer.current);
        if (isDragging.current) {
          pan.flattenOffset();
          isDragging.current = false;
          dragActivated.current = false;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: false }),
            Animated.timing(zIndexVal, { toValue: 0, duration: 0, useNativeDriver: false }),
          ]).start();
          onDragEnd(item.id);
        }
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.widgetContainer,
        {
          width: position.w,
          height: position.h,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale },
          ],
          zIndex: zIndexVal,
          position: 'absolute',
          left: 0,
          top: 0,
        },
      ]}
    >
      <View style={styles.widgetHighlight}>
        {renderWidget(item)}
      </View>
      <TouchableOpacity
        style={styles.removeBadge}
        onPress={() => onRemove(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="remove-circle" size={22} color="#EF4444" />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DraggableWidgetGrid({
  items,
  onReorder,
  onRemove,
  onResize,
  renderWidget,
  footer,
}) {
  const draggingId = useRef(null);
  const [, forceUpdate] = useState(0);

  const { positions, totalHeight } = useMemo(() => calculateGridPositions(items), [items]);

  const handleDragStart = useCallback((id) => {
    draggingId.current = id;
  }, []);

  const handleDragMove = useCallback((id, x, y) => {
    // Could add visual insertion indicators here
  }, []);

  const handleDragEnd = useCallback((id) => {
    draggingId.current = null;
    forceUpdate(n => n + 1);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!draggingId.current}
    >
      <View style={[styles.gridContainer, { height: totalHeight }]}>
        {positions.map((pos) => (
          <DraggableWidget
            key={pos.id}
            item={pos}
            position={pos}
            onRemove={onRemove}
            onResize={onResize}
            renderWidget={renderWidget}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        ))}
      </View>
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: Spacing.md,
  },
  gridContainer: {
    position: 'relative',
    width: '100%',
  },
  widgetContainer: {
    overflow: 'visible',
  },
  widgetHighlight: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 11,
  },
});
