/**
 * ReasoningTrail — Phase 3 of Foreman 2.0 (refreshed Phase 7 polish).
 *
 * Inline UI that surfaces what Foreman is doing inside the agent loop:
 *   - tools fired, with status dot (running / completed / failed) +
 *     duration when finished
 *   - step checklist when the planner emitted complex-plan steps
 *
 * Visual language: Linear/Vercel/Anthropic-modern. A single colored
 * status dot per row instead of category icons + status circles. The
 * dot is the source of truth — small, calm, no shouty red unless the
 * tool genuinely failed.
 *
 * Behavior:
 *   - During streaming: live, expanded, top-down. Each event animates in.
 *   - After turn ends: auto-collapses after a short delay to a single
 *     "Used N tools · 3 steps" line. Tap to expand.
 *
 * Feature flag: EXPO_PUBLIC_FOREMAN_TRANSPARENT_REASONING=false hides
 * the trail entirely (falls back to Phase-2 behavior — the agent still
 * captures the data, the UI just doesn't render it).
 *
 * Props:
 *   toolTrail   — Array of { tool, message, category, risk_level,
 *                  status: 'running'|'completed'|'failed', duration_ms }
 *   planSteps   — Array of { id, action, status, reason? }
 *   isStreaming — boolean, true while the agent is actively running this turn
 *   colors      — Theme color object (passed in to avoid re-importing)
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ENABLED = process.env.EXPO_PUBLIC_FOREMAN_TRANSPARENT_REASONING !== 'false';

// Modern SaaS color tokens — keyed by status, not by tool category.
// Avoids the red-X-as-default-failed footgun the old design had.
const STATUS_COLOR = {
  running:   '#3B82F6',  // blue-500 — same family as the chat send button
  completed: '#10B981',  // emerald-500 — softer than #16A34A
  failed:    '#F59E0B',  // amber-500  — warning, not catastrophe
};

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * StatusDot — small colored circle. Pulses while running, solid when done.
 * Replaces the chunky checkmark/X icons with a calmer indicator that
 * matches Linear/Anthropic visual language.
 */
function StatusDot({ status, size = 7 }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (status !== 'running') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const color = STATUS_COLOR[status] || STATUS_COLOR.completed;
  const dotStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
  };
  if (status === 'running') {
    return <Animated.View style={[dotStyle, { opacity: pulse }]} />;
  }
  return <View style={dotStyle} />;
}

export default function ReasoningTrail({ toolTrail = [], planSteps = [], isStreaming = false, colors }) {
  const [expanded, setExpanded] = useState(true);
  const collapseTimer = useRef(null);

  // Auto-collapse 4s after the turn ends.
  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
      if (collapseTimer.current) {
        clearTimeout(collapseTimer.current);
        collapseTimer.current = null;
      }
      return;
    }
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 4000);
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [isStreaming]);

  if (!ENABLED) return null;
  const hasTools = toolTrail.length > 0;
  const hasSteps = planSteps.length > 0;
  if (!hasTools && !hasSteps) return null;

  const C = colors || {};
  const styles = makeStyles(C);

  // Resolve status defensively — older / partial events that didn't
  // carry an explicit `ok` field were defaulting to 'failed' (the red
  // X bug). Now: anything not explicitly 'failed' or 'running' renders
  // as 'completed'.
  const resolveStatus = (raw) => {
    if (raw === 'running') return 'running';
    if (raw === 'failed') return 'failed';
    return 'completed';
  };

  // Collapsed view — single Linear-style chip
  if (!expanded) {
    const toolCount = toolTrail.length; // count all; status is incidental
    const stepDone = planSteps.filter(s => s.status === 'completed').length;
    const summary = [
      hasTools ? `${toolCount} tool${toolCount === 1 ? '' : 's'}` : null,
      hasSteps ? `${stepDone}/${planSteps.length} steps` : null,
    ].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity onPress={() => setExpanded(true)} style={styles.collapsedRow} activeOpacity={0.7}>
        <Ionicons name="chevron-forward" size={11} color={C.secondaryText || '#6B7280'} />
        <Text style={styles.collapsedText}>{summary}</Text>
      </TouchableOpacity>
    );
  }

  // Expanded view
  return (
    <View style={styles.container}>
      {hasTools && (
        <View style={styles.section}>
          {toolTrail.map((entry, idx) => {
            const status = resolveStatus(entry.status);
            const isDone = status === 'completed' || status === 'failed';
            return (
              <View
                key={`tool-${idx}-${entry.tool}-${entry.started_at || idx}`}
                style={[styles.row, isDone && styles.rowMuted]}
              >
                <View style={styles.dotWrap}>
                  <StatusDot status={status} />
                </View>
                <Text style={styles.toolName} numberOfLines={1}>
                  {entry.message || entry.tool}
                </Text>
                {status === 'running' ? null : (
                  entry.duration_ms != null ? (
                    <Text style={styles.durationText}>{formatDuration(entry.duration_ms)}</Text>
                  ) : null
                )}
              </View>
            );
          })}
        </View>
      )}

      {hasSteps && (
        <View style={[styles.section, hasTools && styles.sectionWithDivider]}>
          {planSteps.map((step, idx) => {
            const status = step.status === 'in_progress' ? 'running'
              : step.status === 'failed' ? 'failed'
              : step.status === 'completed' ? 'completed'
              : 'pending';
            // For pending steps, use a muted gray dot; otherwise reuse StatusDot.
            return (
              <View key={`step-${step.id}-${idx}`} style={styles.row}>
                <View style={styles.dotWrap}>
                  {status === 'pending' ? (
                    <View style={[styles.pendingDot]} />
                  ) : (
                    <StatusDot status={status} />
                  )}
                </View>
                <Text style={styles.stepIndex}>{step.id}.</Text>
                <Text style={styles.stepAction} numberOfLines={2}>
                  {step.action}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {!isStreaming && (
        <TouchableOpacity onPress={() => setExpanded(false)} style={styles.collapseHint} activeOpacity={0.6}>
          <Ionicons name="chevron-up" size={11} color={C.secondaryText || '#9CA3AF'} />
          <Text style={styles.collapseHintText}>hide</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(C) {
  const border = C.border || '#E5E7EB';
  const muted = C.secondaryText || '#6B7280';
  const text = C.primaryText || '#111827';
  return StyleSheet.create({
    container: {
      marginBottom: 8,
      marginLeft: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: border,
      backgroundColor: 'transparent',
    },
    section: {
      gap: 6,
    },
    sectionWithDivider: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 1,
    },
    rowMuted: {
      opacity: 0.7,
    },
    dotWrap: {
      width: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      borderWidth: 1,
      borderColor: muted,
      backgroundColor: 'transparent',
      opacity: 0.6,
    },
    toolName: {
      flex: 1,
      fontSize: 12.5,
      color: text,
      letterSpacing: 0.1,
    },
    durationText: {
      fontSize: 10,
      color: muted,
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.2,
    },
    stepIndex: {
      fontSize: 11,
      color: muted,
      width: 16,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    stepAction: {
      flex: 1,
      fontSize: 12.5,
      color: text,
      lineHeight: 17,
    },
    collapsedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
      marginLeft: 4,
      paddingVertical: 4,
    },
    collapsedText: {
      fontSize: 11,
      color: muted,
      fontStyle: 'italic',
    },
    collapseHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      alignSelf: 'flex-end',
      marginTop: 6,
      paddingTop: 2,
    },
    collapseHintText: {
      fontSize: 10,
      color: muted,
    },
  });
}
