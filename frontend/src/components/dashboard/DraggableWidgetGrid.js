/**
 * DraggableWidgetGrid — iOS-style draggable grid for dashboard widgets.
 * Small widgets sit side-by-side (2 per row), medium/large take full width.
 * Long-press to drag, drop snaps to nearest valid grid position (X + Y aware).
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
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
 * Returns { slots: [{id, x, y, w, h, index}], totalHeight }
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
 * Find the insertion index based on drop X + Y position (2D-aware).
 */
function findInsertIndex(items, dropX, dropY, draggedId) {
  const remaining = items.filter(it => it.id !== draggedId);
  const { slots } = calculateSlots(remaining);
  if (slots.length === 0) return 0;

  // Group slots by row (same Y origin = same row)
  const rows = [];
  for (const s of slots) {
    const existingRow = rows.find(r => Math.abs(r.y - s.y) < 4);
    if (existingRow) {
      existingRow.slots.push(s);
    } else {
      rows.push({ y: s.y, h: s.h, slots: [s] });
    }
  }
  rows.sort((a, b) => a.y - b.y);

  // Find the target row by Y
  let targetRow = rows[rows.length - 1];
  for (let r = 0; r < rows.length; r++) {
    if (dropY < rows[r].y + rows[r].h) {
      targetRow = rows[r];
      break;
    }
  }

  // Within the target row, pick the slot closest to dropX
  let bestSlot = targetRow.slots[0];
  let bestDist = Infinity;
  for (const s of targetRow.slots) {
    const dist = Math.abs(dropX - (s.x + s.w / 2));
    if (dist < bestDist) {
      bestDist = dist;
      bestSlot = s;
    }
  }

  // If dropping after the last slot in the row, insert after it
  if (targetRow.slots.length > 1 && dropX > bestSlot.x + bestSlot.w) {
    return Math.min(bestSlot.index + 1, remaining.length);
  }

  return Math.min(bestSlot.index, remaining.length);
}

function DraggableWidget({ item, slot, onRemove, renderWidget, onDragStart, onDragMove, onDragEnd }) {
  const animX = useRef(new Animated.Value(slot.x)).current;
  const animY = useRef(new Animated.Value(slot.y)).current;
  const offsetX = useRef(0);
  const offsetY = useRef(0);
  const scale = useRef(new Animated.Value(1)).current;
  const [isLifted, setIsLifted] = useState(false);
  const isDragging = useRef(false);
  const longPressTimer = useRef(null);
  const dragActivated = useRef(false);

  // Refs that stay current on every render — fixes stale closure in PanResponder
  const slotRef = useRef(slot);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => {
    slotRef.current = slot;
    onDragStartRef.current = onDragStart;
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
  });

  // Animate to new slot when layout changes (only when not dragging)
  useEffect(() => {
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
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => dragActivated.current,
      onPanResponderTerminationRequest: () => !dragActivated.current,
      onShouldBlockNativeResponder: () => dragActivated.current,
      onPanResponderGrant: () => {
        dragActivated.current = false;
        longPressTimer.current = setTimeout(() => {
          dragActivated.current = true;
          isDragging.current = true;
          offsetX.current = animX._value;
          offsetY.current = animY._value;
          setIsLifted(true);
          Animated.spring(scale, { toValue: 1.06, useNativeDriver: false, tension: 300 }).start();
          onDragStartRef.current(item.id);
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
        const s = slotRef.current;
        onDragMoveRef.current(
          item.id,
          offsetX.current + gs.dx + s.w / 2,
          offsetY.current + gs.dy + s.h / 2
        );
      },
      onPanResponderRelease: () => {
        clearTimeout(longPressTimer.current);
        if (dragActivated.current) {
          isDragging.current = false;
          dragActivated.current = false;
          setIsLifted(false);
          Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
          onDragEndRef.current(item.id);
        }
      },
      onPanResponderTerminate: () => {
        clearTimeout(longPressTimer.current);
        if (isDragging.current) {
          isDragging.current = false;
          dragActivated.current = false;
          setIsLifted(false);
          Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
          onDragEndRef.current(item.id);
        }
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
        zIndex: isLifted ? 100 : 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: isLifted ? 8 : 2 },
        shadowOpacity: isLifted ? 0.25 : 0.1,
        shadowRadius: isLifted ? 16 : 4,
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
  const dropXRef = useRef(0);
  const dropYRef = useRef(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Keep order in sync with items when they change externally
  useEffect(() => {
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
    setScrollEnabled(false);
  }, []);

  const handleDragMove = useCallback((id, centerX, centerY) => {
    dropXRef.current = centerX;
    dropYRef.current = centerY;
    // Live reorder preview — X + Y aware
    const currentIndex = order.indexOf(id);
    const newIndex = findInsertIndex(orderedItems, centerX, centerY, id);
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
    setScrollEnabled(true);
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
      scrollEnabled={scrollEnabled}
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
