/**
 * VisitDetailScreen — Worker's visit interaction screen
 * Start visit, complete checklist, add photos, finish
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  startVisit,
  completeVisit,
  fetchChecklist,
  updateChecklistItem,
  addVisitPhoto,
} from '../../utils/storage/serviceVisits';
import { uploadPhoto } from '../../services/uploadService';

export default function VisitDetailScreen({ route }) {
  const { visit: initialVisit } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [visit, setVisit] = useState(initialVisit);
  const [checklist, setChecklist] = useState([]);
  const [photos, setPhotos] = useState(initialVisit?.photos || []);
  const [notes, setNotes] = useState(initialVisit?.worker_notes || '');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const location = visit?.location || {};
  const isScheduled = visit?.status === 'scheduled';
  const isInProgress = visit?.status === 'in_progress';
  const isCompleted = visit?.status === 'completed';

  useEffect(() => {
    loadChecklist();
  }, []);

  const loadChecklist = async () => {
    try {
      const items = await fetchChecklist(visit.id);
      setChecklist(items || []);
    } catch (e) {
      console.error('[VisitDetail] Checklist load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      const updated = await startVisit(visit.id);
      setVisit(prev => ({ ...prev, ...updated, status: 'in_progress' }));
    } catch (e) {
      Alert.alert('Error', 'Failed to start visit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      const updated = await completeVisit(visit.id);
      setVisit(prev => ({ ...prev, ...updated, status: 'completed' }));
      Alert.alert('Visit Complete', `Duration: ${updated.duration_minutes || '—'} minutes`);
    } catch (e) {
      Alert.alert('Error', 'Failed to complete visit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleItem = async (item) => {
    const newCompleted = !item.completed;
    // Optimistic update
    setChecklist(prev => prev.map(ci =>
      ci.id === item.id ? { ...ci, completed: newCompleted } : ci
    ));

    try {
      await updateChecklistItem(visit.id, item.id, { completed: newCompleted });
    } catch (e) {
      // Revert
      setChecklist(prev => prev.map(ci =>
        ci.id === item.id ? { ...ci, completed: !newCompleted } : ci
      ));
    }
  };

  const handleQuantityChange = async (item, quantity) => {
    try {
      await updateChecklistItem(visit.id, item.id, { quantity: parseFloat(quantity) || 0 });
      setChecklist(prev => prev.map(ci =>
        ci.id === item.id ? { ...ci, quantity: parseFloat(quantity) || 0 } : ci
      ));
    } catch (e) {
      console.error('[VisitDetail] Quantity update error:', e);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      await uploadAndAddPhoto(result.assets[0].uri);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadAndAddPhoto(asset.uri);
      }
    }
  };

  const uploadAndAddPhoto = async (uri) => {
    try {
      const url = await uploadPhoto(uri, `service-visits/${visit.id}`);
      if (url) {
        const updatedPhotos = await addVisitPhoto(visit.id, url);
        setPhotos(updatedPhotos);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to upload photo');
    }
  };

  const openMaps = () => {
    if (!location.address) return;
    const encoded = encodeURIComponent(location.address);
    const url = Platform.select({
      ios: `maps://app?daddr=${encoded}`,
      android: `google.navigation:q=${encoded}`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    });
  };

  const completedItems = checklist.filter(ci => ci.completed).length;
  const totalItems = checklist.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
            {location.name || 'Visit'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]} numberOfLines={1}>
            {location.address || ''}
          </Text>
        </View>
        <TouchableOpacity onPress={openMaps} style={styles.mapsBtn}>
          <Ionicons name="navigate" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Access notes */}
        {location.access_notes && (
          <View style={[styles.accessCard, { backgroundColor: '#FFFBEB' }]}>
            <Ionicons name="key-outline" size={16} color="#F59E0B" />
            <Text style={styles.accessText}>{location.access_notes}</Text>
          </View>
        )}

        {/* Start button */}
        {isScheduled && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#059669' }]}
            onPress={handleStart}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Start Visit</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Duration display */}
        {isCompleted && visit.duration_minutes != null && (
          <View style={[styles.durationCard, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="timer-outline" size={18} color="#059669" />
            <Text style={styles.durationText}>
              Completed in {visit.duration_minutes} minutes
            </Text>
          </View>
        )}

        {/* Checklist */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#059669" />
        ) : checklist.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Checklist</Text>
              <Text style={[styles.sectionCount, { color: Colors.secondaryText }]}>
                {completedItems}/{totalItems}
              </Text>
            </View>
            {checklist.map(item => (
              <View key={item.id} style={[styles.checklistItem, { borderColor: Colors.border }]}>
                <TouchableOpacity
                  onPress={() => !isCompleted && handleToggleItem(item)}
                  style={styles.checkbox}
                  disabled={isCompleted}
                >
                  <Ionicons
                    name={item.completed ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={item.completed ? '#059669' : Colors.secondaryText}
                  />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.checklistTitle,
                    { color: Colors.primaryText },
                    item.completed && styles.checklistTitleDone,
                  ]}>
                    {item.title}
                  </Text>
                  {item.quantity_unit && (
                    <View style={styles.quantityRow}>
                      <TextInput
                        style={[styles.quantityInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                        value={item.quantity?.toString() || ''}
                        onChangeText={(val) => handleQuantityChange(item, val)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.secondaryText}
                        editable={!isCompleted}
                      />
                      <Text style={[styles.quantityUnit, { color: Colors.secondaryText }]}>
                        {item.quantity_unit}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Notes</Text>
          <TextInput
            style={[styles.notesInput, { color: Colors.primaryText, borderColor: Colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes about this visit..."
            placeholderTextColor={Colors.secondaryText}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!isCompleted}
          />
        </View>

        {/* Photos */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            Photos ({photos.length})
          </Text>
          <View style={styles.photoGrid}>
            {photos.map((photo, i) => (
              <Image
                key={i}
                source={{ uri: typeof photo === 'string' ? photo : photo.url }}
                style={styles.photoThumb}
              />
            ))}
            {!isCompleted && (
              <View style={styles.photoActions}>
                <TouchableOpacity style={[styles.photoBtn, { borderColor: Colors.border }]} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={24} color="#3B82F6" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoBtn, { borderColor: Colors.border }]} onPress={handlePickImage}>
                  <Ionicons name="images-outline" size={24} color="#3B82F6" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Complete button */}
        {isInProgress && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#059669', marginTop: Spacing.md }]}
            onPress={handleComplete}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Complete Visit</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  mapsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center',
  },
  scrollContent: { paddingHorizontal: Spacing.lg },
  accessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  accessText: { fontSize: 13, color: '#92400E', flex: 1 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  actionButtonText: { color: '#fff', fontSize: FontSizes.body, fontWeight: '700' },
  durationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  durationText: { fontSize: FontSizes.small, color: '#059669', fontWeight: '600' },
  section: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: FontSizes.body, fontWeight: '700' },
  sectionCount: { fontSize: 13 },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: 10,
  },
  checkbox: { paddingTop: 2 },
  checklistTitle: { fontSize: FontSizes.small, lineHeight: 20 },
  checklistTitleDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  quantityInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    width: 60,
    fontSize: 14,
    textAlign: 'center',
  },
  quantityUnit: { fontSize: 12 },
  notesInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.small,
    minHeight: 80,
    marginTop: Spacing.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.sm,
  },
  photoThumb: {
    width: 80, height: 80,
    borderRadius: BorderRadius.sm,
  },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoBtn: {
    width: 80, height: 80,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
