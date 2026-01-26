import React from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ProjectDetailView from '../components/ProjectDetailView';
import { getProject, deleteProject } from '../utils/storage';

export default function ProjectDetailScreen({ route, navigation }) {
  const { project, projectId, onEdit, onDelete, onRefreshNeeded } = route.params || {};
  const [currentProject, setCurrentProject] = React.useState(project || null);
  const [loading, setLoading] = React.useState(!project && !!projectId);

  // Fetch project by ID if only projectId is provided (e.g., from ChatScreen)
  React.useEffect(() => {
    const fetchProject = async () => {
      if (!project && projectId) {
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
  }, [project, projectId]);

  // Refresh project data when screen gains focus (e.g., returning from schedule after completing tasks)
  useFocusEffect(
    React.useCallback(() => {
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
    }, [currentProject?.id, projectId])
  );

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
    const id = currentProject?.id || projectId;
    if (id) {
      try {
        const success = await deleteProject(id);
        if (success) {
          Alert.alert('Success', 'Project deleted successfully');
          navigation.goBack();
        } else {
          Alert.alert('Error', 'Failed to delete project');
        }
      } catch (error) {
        console.error('Error deleting project:', error);
        Alert.alert('Error', 'Failed to delete project');
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
      onEdit={handleEdit}
      onDelete={handleDelete}
      navigation={navigation}
      asScreen={true}
      onRefreshNeeded={handleRefresh}
    />
  );
}
