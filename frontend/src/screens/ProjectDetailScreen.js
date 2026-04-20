import React from 'react';
import { View, Alert } from 'react-native';
import { SkeletonBox, SkeletonCard } from '../components/SkeletonLoader';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import ProjectDetailView from '../components/ProjectDetailView';
import { getProject, deleteProject } from '../utils/storage';
import { onProjectUpdated } from '../services/eventEmitter';

export default function ProjectDetailScreen({ route, navigation }) {
  const { t } = useTranslation('common');
  const { project, projectId, onEdit, onDelete, onRefreshNeeded, isDemo } = route.params || {};
  const [currentProject, setCurrentProject] = React.useState(project || null);
  const [loading, setLoading] = React.useState(!project && !!projectId && !isDemo);

  // Fetch project by ID if only projectId is provided (e.g., from ChatScreen)
  // Skip for demo projects - they don't exist in the database
  React.useEffect(() => {
    const fetchProject = async () => {
      if (!project && projectId && !isDemo) {
        setLoading(true);
        try {
          const fetchedProject = await getProject(projectId);
          if (fetchedProject) {
            setCurrentProject(fetchedProject);
          }
        } catch (error) {
          console.error('Error fetching project:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchProject();
  }, [project, projectId, isDemo]);

  // Refresh project data when screen gains focus (e.g., returning from schedule after completing tasks)
  // Skip for demo projects - they don't exist in the database
  useFocusEffect(
    React.useCallback(() => {
      if (isDemo) return; // Skip refresh for demo projects
      const refreshOnFocus = async () => {
        const id = currentProject?.id || projectId;
        if (id) {
          try {
            const refreshedProject = await getProject(id);
            if (refreshedProject) {
              setCurrentProject(refreshedProject);
            }
          } catch (error) {
            console.error('Error refreshing project on focus:', error);
          }
        }
      };
      refreshOnFocus();
    }, [currentProject?.id, projectId, isDemo])
  );

  // Listen for project updates from agent
  React.useEffect(() => {
    if (isDemo) return; // Skip for demo projects

    const handleProjectUpdated = async (updatedProjectId) => {
      const id = currentProject?.id || projectId;
      if (updatedProjectId === id || updatedProjectId === '*') {
        try {
          const refreshedProject = await getProject(id);
          if (refreshedProject) {
            setCurrentProject(refreshedProject);
          }
        } catch (error) {
          console.error('Error refreshing project after agent update:', error);
        }
      }
    };

    const unsubscribe = onProjectUpdated(handleProjectUpdated);

    return () => {
      unsubscribe(); // Cleanup listener on unmount
    };
  }, [currentProject?.id, projectId, isDemo]);

  const handleClose = () => {
    navigation.goBack();
  };

  const handleEdit = () => {
    // Navigate back and trigger edit mode
    if (onEdit) {
      onEdit();
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    // Demo projects can't be deleted
    if (isDemo) {
      Alert.alert(t('alerts.info'), t('messages.featureComingSoon', { feature: 'Demo project editing' }));
      return;
    }
    const id = currentProject?.id || projectId;
    if (id) {
      // Optimistic: navigate back immediately, delete in background
      navigation.goBack();
      deleteProject(id).catch((error) => {
        console.error('Error deleting project:', error);
        Alert.alert(t('alerts.error'), t('messages.failedToDelete', { item: 'project' }));
      });
    }
  };

  const handleRefresh = async () => {
    // Refresh this project's data from the database
    const id = currentProject?.id || projectId;
    if (id) {
      try {
        const refreshedProject = await getProject(id);
        if (refreshedProject) {
          setCurrentProject(refreshedProject);
        }
      } catch (error) {
        console.error('Error refreshing project:', error);
      }
    }
    // Also notify parent if callback provided
    if (onRefreshNeeded) {
      onRefreshNeeded();
    }
  };

  // Show skeleton while fetching project
  if (loading || !currentProject) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: '#1E3A8A' }}>
        {/* Title bar */}
        <SkeletonBox width="70%" height={24} borderRadius={6} style={{ marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.15)' }} />
        <SkeletonBox width="40%" height={14} borderRadius={4} style={{ marginBottom: 24, backgroundColor: 'rgba(255,255,255,0.10)' }} />
        {/* Detail cards */}
        <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, marginHorizontal: -16 }}>
          <SkeletonCard lines={2} style={{ marginBottom: 12 }} />
          <SkeletonCard lines={3} style={{ marginBottom: 12 }} />
          <SkeletonBox width="50%" height={16} borderRadius={4} style={{ marginBottom: 12 }} />
          <SkeletonBox width="100%" height={60} borderRadius={10} style={{ marginBottom: 8 }} />
          <SkeletonBox width="100%" height={60} borderRadius={10} />
        </View>
      </View>
    );
  }

  return (
    <ProjectDetailView
      visible={true}
      project={currentProject}
      onClose={handleClose}
      onEdit={isDemo ? null : handleEdit}
      onDelete={isDemo ? null : handleDelete}
      navigation={navigation}
      asScreen={true}
      onRefreshNeeded={isDemo ? null : handleRefresh}
      isDemo={isDemo}
    />
  );
}
