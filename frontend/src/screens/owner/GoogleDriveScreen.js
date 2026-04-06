/**
 * GoogleDriveScreen
 * Connect/disconnect Google Drive, browse files, and import to projects.
 * Owner-only screen.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import {
  getConnectionStatus,
  startOAuthFlow,
  disconnect,
  listFiles,
  importFile,
} from '../../services/googleDriveService';

const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#1E40AF20',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  google: '#4285F4',
  googleLight: '#4285F420',
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function getMimeIcon(mimeType) {
  if (mimeType === FOLDER_MIME) return 'folder';
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.includes('pdf')) return 'document-text';
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return 'grid';
  if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return 'easel';
  if (mimeType?.includes('document') || mimeType?.includes('word')) return 'document';
  if (mimeType?.includes('video')) return 'videocam';
  if (mimeType?.includes('audio')) return 'musical-notes';
  return 'document-outline';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  const num = parseInt(bytes, 10);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GoogleDriveScreen() {
  const navigation = useNavigation();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Connection state
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // File browser state
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [folderStack, setFolderStack] = useState([]); // [{ id, name }]
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);

  // Import state
  const [importingFileId, setImportingFileId] = useState(null);
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // ---- Load connection status ----
  const loadStatus = async () => {
    try {
      const status = await getConnectionStatus();
      setConnected(status.connected);
      setEmail(status.email || '');
    } catch (error) {
      console.error('Status check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [])
  );

  // ---- Deep link listener for OAuth return ----
  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      if (url?.includes('integrations/google-drive/success')) {
        loadStatus().then(() => loadFiles());
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription?.remove();
  }, []);

  // ---- Load files when connected ----
  useEffect(() => {
    if (connected) {
      loadFiles();
    }
  }, [connected]);

  const currentFolderId = folderStack.length > 0
    ? folderStack[folderStack.length - 1].id
    : undefined;

  const loadFiles = async (folderId, search) => {
    setFilesLoading(true);
    try {
      const result = await listFiles(folderId || currentFolderId, search || undefined);
      setFiles(result.files || []);
    } catch (error) {
      if (error.code === 'DRIVE_TOKEN_EXPIRED') {
        setConnected(false);
        setEmail('');
        Alert.alert('Connection Expired', 'Please reconnect your Google Drive.');
      } else {
        Alert.alert('Error', error.message || 'Failed to load files');
      }
    } finally {
      setFilesLoading(false);
      setRefreshing(false);
    }
  };

  // ---- Connect ----
  const handleConnect = async () => {
    try {
      setConnecting(true);
      await startOAuthFlow();
      // Status refresh happens via deep link listener
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to start connection');
    } finally {
      setConnecting(false);
    }
  };

  // ---- Disconnect ----
  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Google Drive',
      `Disconnect ${email}? Your imported files will remain in Sylk.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              setDisconnecting(true);
              await disconnect();
              setConnected(false);
              setEmail('');
              setFiles([]);
              setFolderStack([]);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to disconnect');
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  // ---- Folder navigation ----
  const openFolder = (folder) => {
    setSearchMode(false);
    setSearchQuery('');
    setFolderStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    loadFiles(folder.id);
  };

  const goBack = () => {
    if (folderStack.length === 0) return;
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : undefined;
    loadFiles(parentId);
  };

  // ---- Search ----
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setSearchMode(true);
    loadFiles(undefined, searchQuery.trim());
  };

  const clearSearch = () => {
    setSearchMode(false);
    setSearchQuery('');
    loadFiles(currentFolderId);
  };

  // ---- Import ----
  const handleImportPress = (file) => {
    setSelectedFile(file);
    setProjectPickerVisible(true);
    loadProjects();
  };

  const loadProjects = async () => {
    setProjectsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const { data: plans } = await supabase
        .from('service_plans')
        .select('id, name')
        .eq('status', 'active')
        .order('name', { ascending: true });

      const planItems = (plans || []).map(p => ({ ...p, isServicePlan: true }));
      if (!error) setProjects([...(data || []), ...planItems]);
    } catch (err) {
      console.error('Load projects error:', err);
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleImport = async (projectId) => {
    if (!selectedFile) return;
    setProjectPickerVisible(false);
    setImportingFileId(selectedFile.id);

    try {
      await importFile(selectedFile.id, projectId, selectedFile.name);
      Alert.alert('Imported', `"${selectedFile.name}" has been imported to your project.`);
    } catch (error) {
      if (error.code === 'DRIVE_NOT_CONNECTED' || error.code === 'DRIVE_TOKEN_EXPIRED') {
        setConnected(false);
        Alert.alert('Connection Issue', 'Please reconnect your Google Drive.');
      } else {
        Alert.alert('Import Failed', error.message || 'Could not import file');
      }
    } finally {
      setImportingFileId(null);
      setSelectedFile(null);
    }
  };

  // ---- Breadcrumb ----
  const breadcrumb = [{ id: null, name: 'My Drive' }, ...folderStack];

  // ---- Render file row ----
  const renderFileItem = ({ item }) => {
    const isFolder = item.mimeType === FOLDER_MIME;
    const isImporting = importingFileId === item.id;

    return (
      <TouchableOpacity
        style={[styles.fileRow, { borderBottomColor: Colors.border }]}
        onPress={() => isFolder ? openFolder(item) : null}
        activeOpacity={isFolder ? 0.7 : 1}
      >
        <View style={[styles.fileIcon, { backgroundColor: isFolder ? OWNER_COLORS.googleLight : Colors.background }]}>
          <Ionicons
            name={getMimeIcon(item.mimeType)}
            size={22}
            color={isFolder ? OWNER_COLORS.google : Colors.secondaryText}
          />
        </View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: Colors.primaryText }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.fileMeta, { color: Colors.secondaryText }]}>
            {formatDate(item.modifiedTime)}
            {item.size ? ` \u00B7 ${formatFileSize(item.size)}` : ''}
          </Text>
        </View>
        {isFolder ? (
          <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
        ) : (
          <TouchableOpacity
            style={[styles.importBtn, { backgroundColor: OWNER_COLORS.primaryLight }]}
            onPress={() => handleImportPress(item)}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color={OWNER_COLORS.primary} />
            ) : (
              <Ionicons name="download-outline" size={18} color={OWNER_COLORS.primary} />
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Google Drive</Text>
        <View style={{ width: 40 }} />
      </View>

      {!connected ? (
        /* ---- Not Connected State ---- */
        <View style={styles.emptyState}>
          <View style={[styles.driveIconWrapper, { backgroundColor: OWNER_COLORS.googleLight }]}>
            <Ionicons name="logo-google" size={40} color={OWNER_COLORS.google} />
          </View>
          <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
            Connect Google Drive
          </Text>
          <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
            Import and sync project documents with your Google Drive account.
          </Text>
          <TouchableOpacity
            style={[styles.connectButton, { backgroundColor: OWNER_COLORS.google }]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="logo-google" size={20} color="#FFF" />
            )}
            <Text style={styles.connectButtonText}>
              {connecting ? 'Connecting...' : 'Connect Google Drive'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ---- Connected State ---- */
        <View style={{ flex: 1 }}>
          {/* Connection Info Bar */}
          <View style={[styles.connectionBar, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
            <View style={styles.connectionInfo}>
              <View style={[styles.statusDot, { backgroundColor: OWNER_COLORS.success }]} />
              <Text style={[styles.connectionEmail, { color: Colors.primaryText }]} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleDisconnect}
              disabled={disconnecting}
              style={styles.disconnectBtn}
            >
              {disconnecting ? (
                <ActivityIndicator size="small" color={OWNER_COLORS.danger} />
              ) : (
                <Text style={[styles.disconnectText, { color: OWNER_COLORS.danger }]}>Disconnect</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchBar, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
            <Ionicons name="search" size={18} color={Colors.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: Colors.primaryText }]}
              placeholder="Search Drive files..."
              placeholderTextColor={Colors.secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchMode && (
              <TouchableOpacity onPress={clearSearch}>
                <Ionicons name="close-circle" size={18} color={Colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Breadcrumb */}
          {!searchMode && folderStack.length > 0 && (
            <View style={[styles.breadcrumbBar, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={goBack} style={styles.breadcrumbBack}>
                <Ionicons name="arrow-back" size={16} color={OWNER_COLORS.primary} />
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {breadcrumb.map((item, idx) => (
                  <View key={idx} style={styles.breadcrumbItem}>
                    {idx > 0 && (
                      <Ionicons name="chevron-forward" size={12} color={Colors.secondaryText} style={{ marginHorizontal: 4 }} />
                    )}
                    <Text
                      style={[
                        styles.breadcrumbText,
                        { color: idx === breadcrumb.length - 1 ? Colors.primaryText : Colors.secondaryText },
                      ]}
                    >
                      {item.name}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {searchMode && (
            <View style={[styles.searchResultsBar, { borderBottomColor: Colors.border }]}>
              <Text style={[styles.searchResultsText, { color: Colors.secondaryText }]}>
                Search results for "{searchQuery}" ({files.length} found)
              </Text>
            </View>
          )}

          {/* File List */}
          {filesLoading && files.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={(item) => item.id}
              renderItem={renderFileItem}
              contentContainerStyle={files.length === 0 ? { flex: 1 } : { paddingBottom: 40 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    loadFiles(currentFolderId, searchMode ? searchQuery : undefined);
                  }}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyFiles}>
                  <Ionicons name="folder-open-outline" size={40} color={Colors.secondaryText} />
                  <Text style={[styles.emptyFilesText, { color: Colors.secondaryText }]}>
                    {searchMode ? 'No files match your search' : 'This folder is empty'}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* Project Picker Modal */}
      <Modal
        visible={projectPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProjectPickerVisible(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setProjectPickerVisible(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              Import to Project
            </Text>
            <View style={{ width: 28 }} />
          </View>

          {selectedFile && (
            <View style={[styles.selectedFileBar, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
              <Ionicons name={getMimeIcon(selectedFile.mimeType)} size={20} color={OWNER_COLORS.primary} />
              <Text style={[styles.selectedFileName, { color: Colors.primaryText }]} numberOfLines={1}>
                {selectedFile.name}
              </Text>
            </View>
          )}

          {projectsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
            </View>
          ) : projects.length === 0 ? (
            <View style={styles.emptyFiles}>
              <Text style={[styles.emptyFilesText, { color: Colors.secondaryText }]}>
                No projects found. Create a project first.
              </Text>
            </View>
          ) : (
            <FlatList
              data={projects}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: Spacing.lg }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.projectRow, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
                  onPress={() => handleImport(item.id)}
                >
                  <Ionicons name="construct-outline" size={20} color={OWNER_COLORS.primary} />
                  <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },

  // Empty / not connected
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  driveIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  connectButtonText: {
    color: '#FFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },

  // Connection bar
  connectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionEmail: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  disconnectBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  disconnectText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.xs,
  },
  searchResultsBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  searchResultsText: {
    fontSize: FontSizes.tiny,
  },

  // Breadcrumb
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  breadcrumbBack: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },

  // File list
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  fileMeta: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  importBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyFiles: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: Spacing.md,
  },
  emptyFilesText: {
    fontSize: FontSizes.small,
    textAlign: 'center',
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  selectedFileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  selectedFileName: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  projectName: {
    flex: 1,
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
});
