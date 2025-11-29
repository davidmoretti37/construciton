import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId, fetchProjects } from '../../utils/storage';

export default function PicturesScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [photos, setPhotos] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce) {
        loadData();
      }
    }, [hasLoadedOnce])
  );

  const loadData = async () => {
    try {
      setLoading(true);

      // Check if user is admin (owner role)
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      setIsAdmin(profile?.role === 'owner');

      // Load projects for filter
      const allProjects = await fetchProjects();
      setProjects(allProjects || []);

      // Load all photos from daily reports
      const { data: reports, error } = await supabase
        .from('daily_reports')
        .select('*, projects(name)')
        .order('report_date', { ascending: false });

      if (error) throw error;

      const allPhotos = [];
      reports?.forEach(report => {
        if (report.photos && report.photos.length > 0) {
          report.photos.forEach(photoUrl => {
            allPhotos.push({
              id: `${report.id}-${photoUrl}`,
              uri: photoUrl,
              projectId: report.project_id,
              projectName: report.projects?.name || 'Unknown Project',
              reportId: report.id,
              date: report.report_date,
              workerName: report.worker_name || 'Unknown',
            });
          });
        }
      });

      setPhotos(allPhotos);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading pictures:', error);
      Alert.alert('Error', 'Failed to load pictures');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleDeletePhoto = async (photo) => {
    if (!isAdmin) {
      Alert.alert('Permission Denied', 'Only admins can delete photos');
      return;
    }

    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get current photos array from report
              const { data: report } = await supabase
                .from('daily_reports')
                .select('photos')
                .eq('id', photo.reportId)
                .single();

              if (!report) throw new Error('Report not found');

              // Remove this photo URL from the array
              const updatedPhotos = report.photos.filter(url => url !== photo.uri);

              // Update the report
              const { error } = await supabase
                .from('daily_reports')
                .update({ photos: updatedPhotos })
                .eq('id', photo.reportId);

              if (error) throw error;

              // Close modal and reload
              setSelectedPhoto(null);
              await loadData();
              Alert.alert('Success', 'Photo deleted successfully');
            } catch (error) {
              console.error('Error deleting photo:', error);
              Alert.alert('Error', 'Failed to delete photo');
            }
          },
        },
      ]
    );
  };

  const filteredPhotos = selectedProject === 'all'
    ? photos
    : photos.filter(photo => photo.projectId === selectedProject);

  const projectPhotoCounts = projects.map(project => ({
    ...project,
    photoCount: photos.filter(p => p.projectId === project.id).length,
  }));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading pictures...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Pictures</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Project Filter */}
        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: Colors.secondaryText }]}>Filter by Project</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: selectedProject === 'all' ? Colors.primaryBlue : Colors.lightGray },
              ]}
              onPress={() => setSelectedProject('all')}
            >
              <Text style={[styles.filterChipText, { color: selectedProject === 'all' ? '#fff' : Colors.primaryText }]}>
                All ({photos.length})
              </Text>
            </TouchableOpacity>

            {projectPhotoCounts.map(project => (
              <TouchableOpacity
                key={project.id}
                style={[
                  styles.filterChip,
                  { backgroundColor: selectedProject === project.id ? Colors.primaryBlue : Colors.lightGray },
                ]}
                onPress={() => setSelectedProject(project.id)}
              >
                <Text style={[styles.filterChipText, { color: selectedProject === project.id ? '#fff' : Colors.primaryText }]}>
                  {project.name} ({project.photoCount})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Photo Grid */}
        {filteredPhotos.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
            <Ionicons name="images-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No pictures {selectedProject !== 'all' ? 'for this project' : 'uploaded yet'}
            </Text>
          </View>
        ) : (
          <View style={styles.photoGrid}>
            {filteredPhotos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                style={[styles.photoCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setSelectedPhoto(photo)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                <View style={styles.photoInfo}>
                  <Text style={[styles.photoProject, { color: Colors.primaryText }]} numberOfLines={1}>
                    {photo.projectName}
                  </Text>
                  <Text style={[styles.photoDate, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {new Date(photo.date).toLocaleDateString()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Full Screen Photo Modal */}
      <Modal
        visible={selectedPhoto !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedPhoto(null)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {isAdmin && selectedPhoto && (
              <TouchableOpacity
                style={styles.modalDeleteButton}
                onPress={() => handleDeletePhoto(selectedPhoto)}
              >
                <Ionicons name="trash" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {selectedPhoto && (
            <>
              <Image
                source={{ uri: selectedPhoto.uri }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
              <View style={styles.modalInfo}>
                <Text style={styles.modalProjectName}>{selectedPhoto.projectName}</Text>
                <Text style={styles.modalDate}>
                  {new Date(selectedPhoto.date).toLocaleDateString()} • {selectedPhoto.workerName}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  filterSection: {
    padding: 20,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  photoCard: {
    width: '47%',
    margin: '1.5%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f0f0f0',
  },
  photoInfo: {
    padding: 10,
  },
  photoProject: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  photoDate: {
    fontSize: 11,
  },
  emptyState: {
    margin: 20,
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalDeleteButton: {
    padding: 8,
  },
  fullScreenImage: {
    flex: 1,
    width: '100%',
  },
  modalInfo: {
    padding: 20,
    alignItems: 'center',
  },
  modalProjectName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  modalDate: {
    color: '#ccc',
    fontSize: 14,
  },
});
