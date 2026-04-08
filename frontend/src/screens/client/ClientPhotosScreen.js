import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard, fetchProjectPhotos } from '../../services/clientPortalApi';

const { width: SW } = Dimensions.get('window');
const COL_GAP = 4;
const COLS = 3;
const PHOTO_SIZE = (SW - 32 - COL_GAP * (COLS - 1)) / COLS;

const C = {
  amber: '#F59E0B',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};

export default function ClientPhotosScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showViewer, setShowViewer] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const data = await fetchProjectPhotos(projects[0].id);
        const flat = (data || []).flat().filter(p => p.url || typeof p === 'string');
        setPhotos(flat.map(p => p.url || p));
      }
    } catch (e) {
      console.error('Photos load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Photos</Text>
          <Text style={styles.headerCount}>{photos.length}</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
      >
        {photos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.emptySub}>Project photos will appear here as work progresses</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {photos.map((url, i) => (
              <TouchableOpacity key={i} onPress={() => { setViewerIndex(i); setShowViewer(true); }} activeOpacity={0.8}>
                <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Full Screen Viewer with Swipe */}
      <Modal visible={showViewer} transparent={false} animationType="fade" onRequestClose={() => setShowViewer(false)}>
        <View style={styles.viewer}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.max(viewerIndex, 0)}
            getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
            onMomentumScrollEnd={(e) => setViewerIndex(Math.round(e.nativeEvent.contentOffset.x / SW))}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={{ width: SW, flex: 1, justifyContent: 'center' }}>
                <Image source={{ uri: item }} style={{ width: SW, height: '100%' }} resizeMode="contain" />
              </View>
            )}
          />
          <View style={styles.viewerOverlay}>
            <SafeAreaView edges={['top']} style={styles.viewerHeader}>
              <TouchableOpacity onPress={() => setShowViewer(false)} style={styles.viewerCloseBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.viewerCount}>{viewerIndex + 1} / {photos.length}</Text>
              <View style={{ width: 44 }} />
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  headerCount: { fontSize: 15, fontWeight: '600', color: C.textMuted, width: 26, textAlign: 'right' },
  scrollContent: { padding: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 8 },

  viewer: { flex: 1, backgroundColor: '#000' },
  viewerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  viewerCloseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 22 },
  viewerCount: { fontSize: 15, fontWeight: '600', color: '#fff' },

  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySub: { fontSize: 14, color: C.textMuted, marginTop: 4, textAlign: 'center' },
});
