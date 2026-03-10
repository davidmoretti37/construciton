import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line } from 'react-native-svg';

const STAGES = [
  { key: 'draft',    label: 'Draft',   color: '#C4B5FD', source: 'estimates' },
  { key: 'sent',     label: 'Sent',    color: '#93C5FD', source: 'estimates' },
  { key: 'accepted', label: 'Won',     color: '#6EE7B7', source: 'estimates' },
  { key: 'unpaid',   label: 'Unpaid',  color: '#FCD34D', source: 'invoices' },
  { key: 'partial',  label: 'Partial', color: '#FB923C', source: 'invoices' },
  { key: 'paid',     label: 'Paid',    color: '#6EE7B7', source: 'invoices' },
];

export default function PipelineWidget({ pipeline, size, editMode, onEstimatesPress, onInvoicesPress }) {
  const estimates = pipeline?.estimates || {};
  const invoices = pipeline?.invoices || {};

  const getData = (stage) =>
    stage.source === 'estimates' ? (estimates[stage.key] || 0) : (invoices[stage.key] || 0);

  if (size === 'large') {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#4338CA', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientLarge}
        >
          <Text style={styles.title}>Pipeline</Text>

          <TouchableOpacity
            style={styles.section}
            onPress={onEstimatesPress}
            activeOpacity={editMode ? 1 : 0.7}
            disabled={editMode}
          >
            <Text style={styles.sectionLabel}>ESTIMATES</Text>
            <View style={styles.stagesRow}>
              {STAGES.filter(s => s.source === 'estimates').map((stage, i, arr) => (
                <React.Fragment key={stage.key}>
                  <View style={styles.stageNode}>
                    <View style={[styles.circle, { borderColor: stage.color }]}>
                      <Text style={styles.circleCount}>{getData(stage)}</Text>
                    </View>
                    <Text style={styles.stageLabel}>{stage.label}</Text>
                  </View>
                  {i < arr.length - 1 && (
                    <View style={styles.connectorWrap}>
                      <Svg width={24} height={2}>
                        <Line x1={0} y1={1} x2={24} y2={1} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeDasharray="4,3" />
                      </Svg>
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.section}
            onPress={onInvoicesPress}
            activeOpacity={editMode ? 1 : 0.7}
            disabled={editMode}
          >
            <Text style={styles.sectionLabel}>INVOICES</Text>
            <View style={styles.stagesRow}>
              {STAGES.filter(s => s.source === 'invoices').map((stage, i, arr) => (
                <React.Fragment key={stage.key}>
                  <View style={styles.stageNode}>
                    <View style={[styles.circle, { borderColor: stage.color }]}>
                      <Text style={styles.circleCount}>{getData(stage)}</Text>
                    </View>
                    <Text style={styles.stageLabel}>{stage.label}</Text>
                  </View>
                  {i < arr.length - 1 && (
                    <View style={styles.connectorWrap}>
                      <Svg width={24} height={2}>
                        <Line x1={0} y1={1} x2={24} y2={1} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeDasharray="4,3" />
                      </Svg>
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  // Medium — compact connected circles
  const allStages = STAGES.filter(s => getData(s) > 0 || ['draft', 'unpaid'].includes(s.key));

  return (
    <TouchableOpacity
      style={styles.containerMedium}
      onPress={onEstimatesPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#4338CA', '#6366F1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientMedium}
      >
        <Text style={styles.titleMedium}>Pipeline</Text>
        <View style={styles.compactRow}>
          {allStages.map((stage, i) => (
            <React.Fragment key={stage.key}>
              {i > 0 && <View style={styles.compactDash} />}
              <View style={[styles.compactCircle, { borderColor: stage.color }]}>
                <Text style={styles.compactCount}>{getData(stage)}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerMedium: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientLarge: {
    flex: 1,
    padding: 18,
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  titleMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  section: {
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stageNode: {
    alignItems: 'center',
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stageLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 3,
  },
  connectorWrap: {
    marginHorizontal: 4,
    marginBottom: 14,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactDash: {
    width: 8,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  compactCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
