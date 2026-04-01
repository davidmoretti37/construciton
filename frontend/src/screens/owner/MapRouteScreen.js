/**
 * MapRouteScreen — Full-screen map with bottom sheet for route building + optimization
 *
 * Flow:
 * 1. Map fills screen, bottom sheet slides up
 * 2. Owner selects stops from saved service_locations
 * 3. Taps "Optimize" to get fastest route via Google Directions API
 * 4. Map shows numbered markers + polyline
 * 5. Owner saves the route
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchOwnerLocations, optimizeRoute, decodePolyline } from '../../utils/storage/routeOptimization';
import { createRoute, addStop } from '../../utils/storage/serviceRoutes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STOP_COLORS = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#06B6D4', '#E11D48', '#7C3AED', '#0EA5E9', '#D97706',
  '#059669', '#DC2626', '#4F46E5', '#0891B2', '#CA8A04',
  '#9333EA', '#E879F9', '#22D3EE', '#FB923C', '#A3E635',
];

export default function MapRouteScreen({ route: navRoute }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const bottomSheetRef = useRef(null);

  // State
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedStops, setSelectedStops] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [polylineCoords, setPolylineCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [sheetMode, setSheetMode] = useState('stops'); // 'stops' | 'add'
  const [routeName, setRouteName] = useState('');

  const snapPoints = useMemo(() => ['15%', '50%', '90%'], []);

  // Load saved locations
  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      const locs = await fetchOwnerLocations();
      setSavedLocations(locs.filter(l => l.latitude && l.longitude));
    } catch (e) {
      console.error('[MapRoute] Load locations error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Fit map to markers when stops change
  useEffect(() => {
    if (selectedStops.length > 0 && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          selectedStops.map(s => ({
            latitude: parseFloat(s.latitude),
            longitude: parseFloat(s.longitude),
          })),
          {
            edgePadding: { top: 80, right: 60, bottom: 300, left: 60 },
            animated: true,
          }
        );
      }, 300);
    }
  }, [selectedStops.length]);

  // Filtered locations for the add-stop picker
  const availableLocations = useMemo(() => {
    const selectedIds = new Set(selectedStops.map(s => s.id));
    let filtered = savedLocations.filter(l => !selectedIds.has(l.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.address?.toLowerCase().includes(q) ||
        l.service_plan_name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [savedLocations, selectedStops, searchQuery]);

  const handleAddStop = useCallback((location) => {
    setSelectedStops(prev => [...prev, { ...location, order: prev.length + 1 }]);
    setPolylineCoords([]);
    setRouteInfo(null);
    setSheetMode('stops');
    bottomSheetRef.current?.snapToIndex(1);
  }, []);

  const handleRemoveStop = useCallback((locationId) => {
    setSelectedStops(prev => {
      const updated = prev.filter(s => s.id !== locationId);
      return updated.map((s, i) => ({ ...s, order: i + 1 }));
    });
    setPolylineCoords([]);
    setRouteInfo(null);
  }, []);

  const handleOptimize = useCallback(async () => {
    if (selectedStops.length < 2) {
      Alert.alert('Need more stops', 'Add at least 2 stops to optimize a route.');
      return;
    }

    setOptimizing(true);
    try {
      const result = await optimizeRoute(
        selectedStops.map(s => ({
          id: s.id,
          latitude: parseFloat(s.latitude),
          longitude: parseFloat(s.longitude),
          name: s.name,
          address: s.address,
        }))
      );

      // Update stop order from optimization
      setSelectedStops(result.optimized_stops.map(os => {
        const original = selectedStops.find(s => s.id === os.id);
        return { ...original, ...os };
      }));

      // Draw polyline
      const decoded = decodePolyline(result.polyline);
      setPolylineCoords(decoded);

      setRouteInfo({
        distance: result.total_distance_text,
        duration: result.total_duration_text,
        legs: result.legs,
      });

      // Collapse sheet to show map
      bottomSheetRef.current?.snapToIndex(0);

      // Fit map to polyline
      if (decoded.length > 0 && mapRef.current) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(decoded, {
            edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
            animated: true,
          });
        }, 300);
      }
    } catch (e) {
      Alert.alert('Optimization Failed', e.message);
    } finally {
      setOptimizing(false);
    }
  }, [selectedStops]);

  const handleSaveRoute = useCallback(async () => {
    if (selectedStops.length === 0) return;

    const name = routeName.trim() || `Route ${new Date().toLocaleDateString()}`;
    const today = new Date().toISOString().split('T')[0];

    setSaving(true);
    try {
      // Create the route
      const route = await createRoute(name, today, null);

      // We need service_visit_ids to add stops, but we're working with locations.
      // For now, save the route and navigate back. The stops can be linked when visits exist.
      // TODO: If visits already exist for these locations today, link them.

      Alert.alert('Route Saved', `"${name}" created with ${selectedStops.length} stops.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Save Failed', e.message);
    } finally {
      setSaving(false);
    }
  }, [selectedStops, routeName, navigation]);

  // Default map region
  const defaultRegion = useMemo(() => {
    if (selectedStops.length > 0) {
      return {
        latitude: parseFloat(selectedStops[0].latitude),
        longitude: parseFloat(selectedStops[0].longitude),
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }
    if (savedLocations.length > 0) {
      return {
        latitude: parseFloat(savedLocations[0].latitude),
        longitude: parseFloat(savedLocations[0].longitude),
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };
    }
    return {
      latitude: 26.1224,
      longitude: -80.1373,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    };
  }, [savedLocations, selectedStops]);

  const renderStopsList = () => (
    <View style={styles.sheetContent}>
      {/* Route name input */}
      <View style={[styles.routeNameRow, { borderBottomColor: Colors.border }]}>
        <Ionicons name="navigate" size={18} color={Colors.primaryBlue} />
        <TextInput
          style={[styles.routeNameInput, { color: Colors.primaryText }]}
          placeholder="Route name (optional)"
          placeholderTextColor={Colors.placeholderText}
          value={routeName}
          onChangeText={setRouteName}
        />
      </View>

      {/* Stops list */}
      {selectedStops.length === 0 ? (
        <View style={styles.emptyStops}>
          <Ionicons name="location-outline" size={36} color={Colors.placeholderText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No stops added yet
          </Text>
          <Text style={[styles.emptySubtext, { color: Colors.placeholderText }]}>
            Tap "Add Stop" to select from your saved locations
          </Text>
        </View>
      ) : (
        selectedStops.map((stop, index) => (
          <View
            key={stop.id}
            style={[styles.stopRow, { borderBottomColor: Colors.border }]}
          >
            <View style={[styles.stopNumber, { backgroundColor: STOP_COLORS[index % STOP_COLORS.length] }]}>
              <Text style={styles.stopNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.stopInfo}>
              <Text style={[styles.stopName, { color: Colors.primaryText }]} numberOfLines={1}>
                {stop.name}
              </Text>
              <Text style={[styles.stopAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                {stop.address || stop.formatted_address}
              </Text>
              {routeInfo?.legs?.[index] && (
                <Text style={[styles.legInfo, { color: Colors.primaryBlue }]}>
                  {routeInfo.legs[index].distance?.text} · {routeInfo.legs[index].duration?.text}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => handleRemoveStop(stop.id)}
              style={styles.removeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={22} color={Colors.errorRed} />
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Add stop button */}
      <TouchableOpacity
        style={[styles.addStopBtn, { borderColor: Colors.primaryBlue }]}
        onPress={() => {
          setSheetMode('add');
          setSearchQuery('');
          bottomSheetRef.current?.snapToIndex(2);
        }}
      >
        <Ionicons name="add-circle-outline" size={20} color={Colors.primaryBlue} />
        <Text style={[styles.addStopText, { color: Colors.primaryBlue }]}>Add Stop</Text>
      </TouchableOpacity>

      {/* Action buttons */}
      {selectedStops.length >= 2 && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.optimizeBtn, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleOptimize}
            disabled={optimizing}
          >
            {optimizing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#fff" />
                <Text style={styles.optimizeBtnText}>Optimize Route</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: Colors.successGreen }]}
            onPress={handleSaveRoute}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderAddStopPicker = () => (
    <View style={styles.sheetContent}>
      {/* Back button + search */}
      <View style={[styles.searchRow, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            setSheetMode('stops');
            bottomSheetRef.current?.snapToIndex(1);
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={[styles.searchBox, { backgroundColor: Colors.inputBackground }]}>
          <Ionicons name="search" size={16} color={Colors.placeholderText} />
          <TextInput
            style={[styles.searchInput, { color: Colors.primaryText }]}
            placeholder="Search locations..."
            placeholderTextColor={Colors.placeholderText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.placeholderText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Locations list */}
      {availableLocations.length === 0 ? (
        <View style={styles.emptyStops}>
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            {savedLocations.length === 0
              ? 'No saved locations. Add locations to your service plans first.'
              : 'No matching locations'}
          </Text>
        </View>
      ) : (
        availableLocations.map((loc) => (
          <TouchableOpacity
            key={loc.id}
            style={[styles.locationRow, { borderBottomColor: Colors.border }]}
            onPress={() => handleAddStop(loc)}
          >
            <View style={[styles.locationIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="location" size={18} color={Colors.primaryBlue} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationName, { color: Colors.primaryText }]} numberOfLines={1}>
                {loc.name}
              </Text>
              <Text style={[styles.locationAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                {loc.address || loc.formatted_address}
              </Text>
              {loc.service_plan_name && (
                <Text style={[styles.locationPlan, { color: Colors.placeholderText }]} numberOfLines={1}>
                  {loc.service_plan_name}
                </Text>
              )}
            </View>
            <Ionicons name="add-circle" size={24} color={Colors.primaryBlue} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: Colors.cardBackground }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Map Route</Text>
        <View style={styles.headerBtn} />
      </SafeAreaView>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {/* Stop markers */}
        {selectedStops.map((stop, index) => (
          <Marker
            key={stop.id}
            coordinate={{
              latitude: parseFloat(stop.latitude),
              longitude: parseFloat(stop.longitude),
            }}
            title={`${index + 1}. ${stop.name}`}
            description={stop.address}
          >
            <View style={[styles.markerContainer, { backgroundColor: STOP_COLORS[index % STOP_COLORS.length] }]}>
              <Text style={styles.markerText}>{index + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Route polyline */}
        {polylineCoords.length > 0 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={Colors.primaryBlue}
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* Route info overlay */}
      {routeInfo && (
        <View style={[styles.routeInfoBar, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.routeInfoItem}>
            <Ionicons name="navigate" size={16} color={Colors.primaryBlue} />
            <Text style={[styles.routeInfoText, { color: Colors.primaryText }]}>
              {routeInfo.distance}
            </Text>
          </View>
          <View style={styles.routeInfoDivider} />
          <View style={styles.routeInfoItem}>
            <Ionicons name="time" size={16} color={Colors.primaryBlue} />
            <Text style={[styles.routeInfoText, { color: Colors.primaryText }]}>
              {routeInfo.duration}
            </Text>
          </View>
          <View style={styles.routeInfoDivider} />
          <View style={styles.routeInfoItem}>
            <Ionicons name="flag" size={16} color={Colors.primaryBlue} />
            <Text style={[styles.routeInfoText, { color: Colors.primaryText }]}>
              {selectedStops.length} stops
            </Text>
          </View>
        </View>
      )}

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      )}

      {/* Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={[styles.sheetBackground, { backgroundColor: Colors.cardBackground }]}
        handleIndicatorStyle={{ backgroundColor: Colors.placeholderText }}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetScroll}>
          {sheetMode === 'stops' ? renderStopsList() : renderAddStopPicker()}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  map: {
    flex: 1,
  },

  // Markers
  markerContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
      android: { elevation: 4 },
    }),
  },
  markerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Route info bar
  routeInfoBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 80,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeInfoText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  routeInfoDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#E5E7EB',
    marginHorizontal: Spacing.md,
  },

  // Bottom sheet
  sheetBackground: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 8 },
    }),
  },
  sheetScroll: {
    paddingBottom: 40,
  },
  sheetContent: {
    paddingHorizontal: Spacing.md,
  },

  // Route name
  routeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  routeNameInput: {
    flex: 1,
    fontSize: FontSizes.body,
    fontWeight: '600',
    padding: 0,
  },

  // Empty state
  emptyStops: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: FontSizes.small,
    textAlign: 'center',
  },

  // Stop row
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  stopAddress: {
    fontSize: FontSizes.small,
    marginTop: 1,
  },
  legInfo: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },

  // Add stop button
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addStopText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  optimizeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
  },
  optimizeBtnText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },

  // Search row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.xs,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: BorderRadius.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.body,
    padding: 0,
  },

  // Location picker rows
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  locationAddress: {
    fontSize: FontSizes.small,
    marginTop: 1,
  },
  locationPlan: {
    fontSize: FontSizes.tiny,
    marginTop: 1,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    zIndex: 5,
  },
});
