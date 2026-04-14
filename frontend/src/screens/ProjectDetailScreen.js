import React from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
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

  const handleDelete = async () => {
    // Demo projects can't be deleted
    if (isDemo) {
      Alert.alert(t('alerts.info'), t('messages.featureComingSoon', { feature: 'Demo project editing' }));
      return;
    }
    const id = currentProject?.id || projectId;
    if (id) {
      try {
        const success = await deleteProject(id);
        if (success) {
          Alert.alert(t('alerts.success'), t('messages.deletedSuccessfully', { item: 'Project' }));
          navigation.goBack();
        } else {
          Alert.alert(t('alerts.error'), t('messages.failedToDelete', { item: 'project' }));
        }
      } catch (error) {
        console.error('Error deleting project:', error);
        Alert.alert(t('alerts.error'), t('messages.failedToDelete', { item: 'project' }));
      }
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

  // Show loading indicator while fetching project
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Don't render if no project data
  if (!currentProject) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
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
