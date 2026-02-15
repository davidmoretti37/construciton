import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function TimeTrackingMap({ data }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const mapRef = useRef(null);

  const { title, subtitle, records = [] } = data;

  // Filter records that have location
  const recordsWithLocation = records.filter(r => r.location && r.location.lat && r.location.lng);

  // Calculate map region to fit all markers
  useEffect(() => {
    if (recordsWithLocation.length > 0 && mapRef.current) {
      // Give map time to mount before fitting to markers
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          recordsWithLocation.map(r => ({
            latitude: r.location.lat,
            longitude: r.location.lng,
          })),
          {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          }
        );
      }, 500);
    }
  }, [recordsWithLocation.length]);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Default region (will be overridden by fitToCoordinates)
  const defaultRegion = recordsWithLocation.length > 0 ? {
    latitude: recordsWithLocation[0].location.lat,
    longitude: recordsWithLocation[0].location.lng,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  } : {
    latitude: 26.1224,
    longitude: -80.1373,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  if (recordsWithLocation.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{title || 'Clock-In Locations'}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>{subtitle}</Text>
          )}
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={40} color={Colors.secondaryText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No location data available
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{title || 'Clock-In Locations'}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>{subtitle}</Text>
          )}
        </View>
        <View style={[styles.countBadge, { backgroundColor: Colors.primaryBlue }]}>
          <Text style={styles.countText}>{recordsWithLocation.length}</Text>
        </View>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={defaultRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {recordsWithLocation.map((record, index) => (
          <Marker
            key={record.id || index}
            coordinate={{
              latitude: record.location.lat,
              longitude: record.location.lng,
            }}
            pinColor={record.status === 'active' ? '#10B981' : Colors.primaryBlue}
          >
            <Callout tooltip={false}>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutWorkerName}>{record.workerName}</Text>
                {record.trade && (
                  <Text style={styles.calloutTrade}>{record.trade}</Text>
                )}
                <Text style={styles.calloutProject}>{record.projectName}</Text>
                <View style={styles.calloutTimeRow}>
                  <Ionicons name="time-outline" size={12} color="#6B7280" />
                  <Text style={styles.calloutTime}>
                    {formatTime(record.clockIn)}
                    {record.clockOut && ` - ${formatTime(record.clockOut)}`}
                  </Text>
                </View>
                {record.totalHours > 0 && (
                  <Text style={styles.calloutHours}>
                    {record.totalHours} hrs
                  </Text>
                )}
                {record.status === 'active' && (
                  <View style={styles.activeIndicator}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Currently Active</Text>
                  </View>
                )}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Legend */}
      <View style={[styles.legend, { backgroundColor: Colors.lightBackground }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={[styles.legendText, { color: Colors.secondaryText }]}>Active</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.primaryBlue }]} />
          <Text style={[styles.legendText, { color: Colors.secondaryText }]}>Completed</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
    height: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  calloutContainer: {
    padding: Spacing.sm,
    minWidth: 180,
    maxWidth: 220,
  },
  calloutWorkerName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  calloutTrade: {
    fontSize: FontSizes.small,
    color: '#6B7280',
    marginBottom: Spacing.xs,
  },
  calloutProject: {
    fontSize: FontSizes.small,
    color: '#374151',
    marginBottom: Spacing.xs,
  },
  calloutTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  calloutTime: {
    fontSize: FontSizes.small,
    color: '#6B7280',
  },
  calloutHours: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    color: '#2563EB',
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    color: '#10B981',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.small,
  },
});
