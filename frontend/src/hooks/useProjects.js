import { useState, useCallback, useEffect } from 'react';
import { fetchProjects as fetchProjectsFromStorage } from '../utils/storage';

/**
 * Custom hook for managing projects data with caching
 * Replaces duplicate fetchProjects logic across screens
 *
 * @param {boolean} autoLoad - Whether to load projects automatically on mount (default: false)
 * @returns {Object} Projects state and methods
 */
export const useProjects = (autoLoad = false) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjectsFromStorage();
      setProjects(data);
      setHasLoadedOnce(true);
      return data;
    } catch (err) {
      console.error('Error loading projects:', err);
      setError(err.message || 'Failed to load projects');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount if requested
  useEffect(() => {
    if (autoLoad && !hasLoadedOnce) {
      loadProjects();
    }
  }, [autoLoad, hasLoadedOnce, loadProjects]);

  // Memoized: Add a new project to the list (optimistic update)
  const addProject = useCallback((project) => {
    setProjects(prev => [project, ...prev]);
  }, []);

  // Memoized: Update a project in the list (optimistic update)
  const updateProject = useCallback((projectId, updates) => {
    setProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, ...updates } : p)
    );
  }, []);

  // Memoized: Remove a project from the list (optimistic update)
  const removeProject = useCallback((projectId) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, []);

  return {
    projects,
    loading,
    error,
    hasLoadedOnce,
    loadProjects,
    refetch: loadProjects, // Alias for convenience
    addProject,
    updateProject,
    removeProject,
  };
};
