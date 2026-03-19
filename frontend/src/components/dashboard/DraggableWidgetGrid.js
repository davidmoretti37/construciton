/**
 * DraggableWidgetGrid — iOS-style draggable grid for dashboard widgets.
 * Small widgets sit side-by-side (2 per row), medium/large take full width.
 * Long-press to drag, drop snaps to nearest valid grid position.
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
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
const LONG_PRESS_MS = 250;

/**
 * Calculate grid slot positions for a given item order.
 * Returns { slots: [{id, x, y, w, h}], totalHeight }
 */
function calculateSlots(items) {
  const slots = [];
  let y = 0;
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const { width, height } = getWidgetSize(item.size);

    if (item.size === 'small' && i + 1 < items.length && items[i + 1].size === 'small') {
      const nextItem = items[i + 1];
      const { height: nextHeight } = getWidgetSize(nextItem.size);
      const rowHeight = Math.max(height, nextHeight);
      slots.push({ id: item.id, x: 0, y, w: width, h: rowHeight, index: i });
      slots.push({ id: nextItem.id, x: colWidth + GAP, y, w: colWidth, h: rowHeight, index: i + 1 });
      y += rowHeight + GAP;
      i += 2;
    } else {
      const w = item.size === 'small' ? width : FULL_WIDTH;
      slots.push({ id: item.id, x: 0, y, w, h: height, index: i });
      y += height + GAP;
      i += 1;
    }
  }

  return { slots, totalHeight: y };
}

/**
 * Find the insertion index based on drop y-position.
 */
function findInsertIndex(items, dropY, draggedId) {
  const { slots } = calculateSlots(items.filter(it => it.id !== draggedId));

  // Find the slot whose center y is closest to dropY
  let bestIndex = items.length - 1;
  for (let s = 0; s < slots.length; s++) {
    const slotCenterY = slots[s].y + slots[s].h / 2;
    if (dropY < slotCenterY) {
      bestIndex = slots[s].index;
      break;
    }
  }
  return Math.min(bestIndex, items.length - 1);
}

function DraggableWidget({ item, slot, onRemove, renderWidget, onDragStart, onDragMove, onDragEnd }) {
  const animX = useRef(new Animated.Value(slot.x)).current;
  const animY = useRef(new Animated.Value(slot.y)).current;
  const offsetX = useRef(0);
  const offsetY = useRef(0);
  const scale = useRef(new Animated.Value(1)).current;
  const elevation = useRef(new Animated.Value(1)).current;
  const isDragging = useRef(false);
  const longPressTimer = useRef(null);
  const dragActivated = useRef(false);

  // Animate to new slot when layout changes
  React.useEffect(() => {
    if (!isDragging.current) {
      Animated.parallel([
        Animated.spring(animX, { toValue: slot.x, useNativeDriver: false, tension: 180, friction: 20 }),
        Animated.spring(animY, { toValue: slot.y, useNativeDriver: false, tension: 180, friction: 20 }),
      ]).start();
    }
  }, [slot.x, slot.y]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => dragActivated.current,
      onPanResponderGrant: () => {
        dragActivated.current = false;
        longPressTimer.current = setTimeout(() => {
          dragActivated.current = true;
          isDragging.current = true;
          offsetX.current = animX._value;
          offsetY.current = animY._value;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1.06, useNativeDriver: false, tension: 300 }),
            Animated.timing(elevation, { toValue: 20, duration: 100, useNativeDriver: false }),
          ]).start();
          onDragStart(item.id);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_, gs) => {
        if (!dragActivated.current) {
          if (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6) {
            clearTimeout(longPressTimer.current);
          }
          return;
        }
        animX.setValue(offsetX.current + gs.dx);
        animY.setValue(offsetY.current + gs.dy);
        onDragMove(item.id, offsetY.current + gs.dy + slot.h / 2);
      },
      onPanResponderRelease: () => {
        clearTimeout(longPressTimer.current);
        if (dragActivated.current) {
          isDragging.current = false;
          dragActivated.current = false;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: false }),
            Animated.timing(elevation, { toValue: 1, duration: 100, useNativeDriver: false }),
          ]).start();
          onDragEnd(item.id);
        }
      },
      onPanResponderTerminate: () => {
        clearTimeout(longPressTimer.current);
        isDragging.current = false;
        dragActivated.current = false;
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: false }),
          Animated.timing(elevation, { toValue: 1, duration: 100, useNativeDriver: false }),
        ]).start();
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        position: 'absolute',
        left: animX,
        top: animY,
        width: slot.w,
        height: slot.h,
        transform: [{ scale }],
        zIndex: elevation,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      }}
    >
      <View style={styles.widgetInner}>
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
  const [order, setOrder] = useState(items.map(it => it.id));
  const draggingRef = useRef(null);
  const dropYRef = useRef(0);
  const scrollEnabled = useRef(true);
  const [, forceRender] = useState(0);

  // Keep order in sync with items when they change externally
  React.useEffect(() => {
    setOrder(items.map(it => it.id));
  }, [items]);

  // Build ordered items list
  const orderedItems = useMemo(() => {
    const itemMap = new Map(items.map(it => [it.id, it]));
    return order.map(id => itemMap.get(id)).filter(Boolean);
  }, [items, order]);

  const { slots, totalHeight } = useMemo(() => calculateSlots(orderedItems), [orderedItems]);
  const slotMap = useMemo(() => new Map(slots.map(s => [s.id, s])), [slots]);

  const handleDragStart = useCallback((id) => {
    draggingRef.current = id;
    scrollEnabled.current = false;
    forceRender(n => n + 1);
  }, []);

  const handleDragMove = useCallback((id, centerY) => {
    dropYRef.current = centerY;
    // Live reorder preview
    const currentIndex = order.indexOf(id);
    const newIndex = findInsertIndex(orderedItems, centerY, id);
    if (newIndex !== currentIndex && newIndex >= 0) {
      setOrder(prev => {
        const next = prev.filter(oid => oid !== id);
        next.splice(newIndex, 0, id);
        return next;
      });
    }
  }, [order, orderedItems]);

  const handleDragEnd = useCallback((id) => {
    draggingRef.current = null;
    scrollEnabled.current = true;
    forceRender(n => n + 1);
    // Persist the new order
    const itemMap = new Map(items.map(it => [it.id, it]));
    const reordered = order.map(oid => itemMap.get(oid)).filter(Boolean);
    onReorder(reordered);
  }, [order, items, onReorder]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={scrollEnabled.current}
    >
      <View style={[styles.gridContainer, { height: totalHeight + 80 }]}>
        {orderedItems.map((item) => {
          const slot = slotMap.get(item.id);
          if (!slot) return null;
          return (
            <DraggableWidget
              key={item.id}
              item={item}
              slot={slot}
              onRemove={onRemove}
              renderWidget={renderWidget}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            />
          );
        })}
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
  widgetInner: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.25)',
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
