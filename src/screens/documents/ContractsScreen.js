import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage';

export default function ContractsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [contractDocuments, setContractDocuments] = useState([]);
  const [typicalContracts, setTypicalContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      await Promise.all([loadContractDocuments(), loadTypicalContracts()]);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading contracts data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContractDocuments = async () => {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('contract_documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContractDocuments(data || []);
    } catch (error) {
      console.error('Error loading contract documents:', error);
      setContractDocuments([]);
    }
  };

  const loadTypicalContracts = async () => {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('typical_contracts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setTypicalContracts(data || []);
    } catch (error) {
      console.error('Error loading typical contracts:', error);
      setTypicalContracts([]);
    }
  };

  const handleUploadDocument = () => {
    Alert.alert(
      'Add Contract Document',
      'Choose a source',
      [
        {
          text: 'Take Photo',
          onPress: handleTakePhoto
        },
        {
          text: 'Choose from Photos',
          onPress: handlePickImage
        },
        {
          text: 'Choose Document',
          onPress: handlePickDocument
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadFile(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          await uploadFile(asset.uri, 'image');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          await uploadFile(asset.uri, 'document', asset.name);
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const uploadFile = async (uri, type, fileName) => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();

      // Get file extension
      const fileExt = fileName ? fileName.split('.').pop() : 'jpg';
      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}.${fileExt}`;

      // Fetch the file
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contract-documents')
        .upload(filePath, blob, {
          contentType: type === 'image' ? 'image/jpeg' : 'application/pdf',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('contract-documents')
        .getPublicUrl(filePath);

      // Save document record to database
      const { error: dbError } = await supabase
        .from('contract_documents')
        .insert({
          user_id: userId,
          file_name: fileName || `Contract ${timestamp}`,
          file_url: publicUrl,
          file_path: filePath,
          file_type: type,
        });

      if (dbError) throw dbError;

      await loadContractDocuments();
      Alert.alert('Success', 'Contract document uploaded successfully');
    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', 'Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);


  const handleDeleteDocument = (documentId, filePath) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this contract document?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from storage
              const { error: storageError } = await supabase.storage
                .from('contract-documents')
                .remove([filePath]);

              if (storageError) console.error('Storage delete error:', storageError);

              // Delete from database
              const { error: dbError } = await supabase
                .from('contract_documents')
                .delete()
                .eq('id', documentId);

              if (dbError) throw dbError;
              await loadContractDocuments();
              Alert.alert('Success', 'Document deleted successfully');
            } catch (error) {
              console.error('Error deleting document:', error);
              Alert.alert('Error', 'Failed to delete document');
            }
          },
        },
      ]
    );
  };

  const handleViewDocument = (document) => {
    // Navigate to document viewer or open in browser
    navigation.navigate('DocumentViewer', { document });
  };

  const handleViewContract = async (contract) => {
    if (contract.file_url) {
      // Get the public URL from storage
      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(contract.file_url);

      // Navigate to document viewer with contract info
      navigation.navigate('DocumentViewer', {
        document: {
          id: contract.id,
          file_name: contract.name,
          file_url: publicUrl,
          file_type: contract.file_mime_type?.includes('pdf') ? 'pdf' : 'image',
        }
      });
    } else {
      Alert.alert('No File', 'This contract template doesn\'t have an attached file.');
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'signed':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'rejected':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
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
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Contracts</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Upload Button */}
      <View style={[styles.uploadSection, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={[styles.uploadButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleUploadDocument}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.uploadButtonText}>Add Contract Document</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.uploadHint, { color: Colors.secondaryText }]}>
          Upload contracts from photos, camera, or PDF files
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Typical Contracts Section (from onboarding) */}
        {typicalContracts.length > 0 && (
          <View style={styles.listSection}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Contract Templates</Text>
            {typicalContracts.map((contract) => {
              const getFileIcon = () => {
                if (contract.file_mime_type?.includes('pdf')) return 'document-text';
                if (contract.file_mime_type?.includes('image')) return 'image';
                return 'document-outline';
              };

              return (
                <View
                  key={contract.id}
                  style={[styles.documentCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                >
                  <TouchableOpacity
                    style={styles.documentContent}
                    onPress={() => handleViewContract(contract)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.documentIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                      <Ionicons
                        name={getFileIcon()}
                        size={28}
                        color={Colors.primaryBlue}
                      />
                    </View>
                    <View style={styles.documentInfo}>
                      <Text style={[styles.documentName, { color: Colors.primaryText }]}>
                        {contract.name}
                      </Text>
                      <Text style={[styles.documentDate, { color: Colors.secondaryText }]}>
                        {contract.base_contract === 'fixed' ? 'Fixed Price' :
                         contract.base_contract === 'time_materials' ? 'Time & Materials' :
                         'Cost Plus'}
                        {contract.contract_amount ? ` • $${contract.contract_amount}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Contract Documents Section */}
        <View style={styles.listSection}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Uploaded Documents</Text>
            {contractDocuments.length === 0 && typicalContracts.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
                <Ionicons name="cloud-upload-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No contract documents uploaded
                </Text>
                <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
                  Upload your contract templates to easily send them to clients
                </Text>
              </View>
            ) : contractDocuments.length === 0 ? (
              <Text style={[styles.emptySubtext, { color: Colors.secondaryText, textAlign: 'center', padding: 20 }]}>
                No additional documents uploaded
              </Text>
            ) : (
              contractDocuments.map((doc) => (
                <View
                  key={doc.id}
                  style={[styles.documentCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                >
                  <TouchableOpacity
                    style={styles.documentContent}
                    onPress={() => handleViewDocument(doc)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.documentIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                      <Ionicons
                        name={doc.file_type === 'image' ? 'image-outline' : 'document-text-outline'}
                        size={28}
                        color={Colors.primaryBlue}
                      />
                    </View>
                    <View style={styles.documentInfo}>
                      <Text style={[styles.documentName, { color: Colors.primaryText }]}>
                        {doc.file_name}
                      </Text>
                      <Text style={[styles.documentDate, { color: Colors.secondaryText }]}>
                        Uploaded {new Date(doc.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteDocButton}
                    onPress={() => handleDeleteDocument(doc.id, doc.file_path)}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ))
            )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
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
  uploadSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  uploadHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  content: {
    flex: 1,
  },
  listSection: {
    padding: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  contractCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  contractTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  contractClient: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  contractInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
  },
  contractValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  templateCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  templateHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 14,
  },
  defaultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  defaultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  templateInfo: {
    marginBottom: 12,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  documentContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentDate: {
    fontSize: 13,
  },
  deleteDocButton: {
    padding: 8,
    marginLeft: 8,
  },
});
