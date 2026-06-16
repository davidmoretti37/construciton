// ClientProjectContext — shared "which project is this client viewing" state.
//
// Clients with 2+ projects previously could only ever see projects[0] because
// every tab/screen independently picked the first project. This context holds
// the project list + the selected project id so all client screens stay in
// sync, and a switcher can change it.
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';

const ClientProjectContext = createContext(null);

export function ClientProjectProvider({ children }) {
  const [projects, setProjectsState] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Screens call this after fetching the dashboard. Keeps the list fresh and
  // guarantees a valid selection: preserve the current pick if it still exists,
  // otherwise default to the first project.
  const setProjects = useCallback((list) => {
    const arr = Array.isArray(list) ? list : [];
    setProjectsState(arr);
    setSelectedProjectId((prev) =>
      prev && arr.some((p) => p.id === prev) ? prev : arr[0]?.id ?? null,
    );
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );

  const value = useMemo(
    () => ({ projects, setProjects, selectedProjectId, setSelectedProjectId, selectedProject }),
    [projects, setProjects, selectedProjectId, selectedProject],
  );

  return (
    <ClientProjectContext.Provider value={value}>
      {children}
    </ClientProjectContext.Provider>
  );
}

// Safe to call without a provider (returns inert defaults) so screens never crash.
export function useClientProject() {
  return (
    useContext(ClientProjectContext) || {
      projects: [],
      setProjects: () => {},
      selectedProjectId: null,
      setSelectedProjectId: () => {},
      selectedProject: null,
    }
  );
}
