import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function TypicalContractsScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { selectedTrades, selectedServices, businessInfo, pricing, phasesTemplate, profitMargin, invoiceInfo } = route.params;

  const [contracts, setContracts] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        addContractFromFile(file);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad'));
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionDenied'), t('permissions.photoLibraryRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        addContractFromFile({ uri: photo.uri, name: photo.fileName || 'contract-photo.jpg', mimeType: 'image/jpeg' });
      }
    } catch (error) {
      console.error('Error picking photo:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad'));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionDenied'), t('permissions.cameraRequired'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        addContractFromFile({ uri: photo.uri, name: 'contract-photo.jpg', mimeType: 'image/jpeg' });
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad'));
    }
  };

  const addContractFromFile = (file) => {
    const contract = {
      id: Date.now().toString(),
      name: file.name,
      fileUri: file.uri,
      mimeType: file.mimeType,
      base_contract: 'fixed', // Default to fixed price contract
      contract_amount: null,
      description: '',
      order_index: contracts.length,
    };

    setContracts([...contracts, contract]);
  };

  const handleDeleteContract = (id) => {
    Alert.alert(
      t('alerts.confirmDelete'),
      t('messages.confirmDeleteItem'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            setContracts(contracts.filter(c => c.id !== id));
          }
        }
      ]
    );
  };

  const handleContinue = () => {
    // Navigate to completion screen with contracts data
    navigation.navigate('Completion', {
      selectedTrades,
      selectedServices,
      businessInfo,
      pricing,
      phasesTemplate,
      profitMargin,
      invoiceInfo,
      typicalContracts: contracts,
    });
  };

  const handleSkip = () => {
    // Skip and go to completion
    navigation.navigate('Completion', {
      selectedTrades,
      selectedServices,
      businessInfo,
      pricing,
      phasesTemplate,
      profitMargin,
      invoiceInfo,
      typicalContracts: [],
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('pdf')) return 'document-text';
    if (mimeType?.includes('image')) return 'image';
    if (mimeType?.includes('word')) return 'document';
    return 'document-outline';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: Colors.secondaryText + '15' }]}
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Typical Contracts</Text>
          <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]}>
            Set up your common contract types
          </Text>
        </View>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={[styles.skipButton, { color: Colors.primaryBlue }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="information-circle" size={24} color={Colors.primaryBlue} />
          <View style={styles.infoTextContainer}>
            <Text style={[styles.infoTitle, { color: Colors.primaryBlue }]}>Import Your Contracts</Text>
            <Text style={[styles.infoText, { color: Colors.primaryText }]}>
              Upload existing contract templates from files or photos. You can add more later in Settings.
            </Text>
          </View>
        </View>

        {/* Uploaded Contracts */}
        {contracts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Uploaded Contracts ({contracts.length})
            </Text>
            {contracts.map((contract) => (
              <View
                key={contract.id}
                style={[styles.contractCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              >
                <View style={styles.contractHeader}>
                  <View style={[styles.contractIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                    <Ionicons name={getFileIcon(contract.mimeType)} size={24} color={Colors.primaryBlue} />
                  </View>
                  <View style={styles.contractInfo}>
                    <Text style={[styles.contractName, { color: Colors.primaryText }]} numberOfLines={1}>
                      {contract.name}
                    </Text>
                    <Text style={[styles.contractType, { color: Colors.secondaryText }]}>
                      {contract.mimeType?.includes('pdf') ? 'PDF Document' :
                       contract.mimeType?.includes('image') ? 'Image' :
                       contract.mimeType?.includes('word') ? 'Word Document' : 'Document'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteContract(contract.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Upload Options */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Add Contract</Text>

          {/* Upload from Files */}
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handlePickDocument}
            disabled={uploading}
          >
            <View style={[styles.uploadIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="document-text-outline" size={24} color={Colors.primaryBlue} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={[styles.uploadTitle, { color: Colors.primaryText }]}>Upload from Files</Text>
              <Text style={[styles.uploadDescription, { color: Colors.secondaryText }]}>
                PDF, Word, or other documents
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          {/* Upload from Photos */}
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handlePickPhoto}
            disabled={uploading}
          >
            <View style={[styles.uploadIcon, { backgroundColor: Colors.success + '15' }]}>
              <Ionicons name="images-outline" size={24} color={Colors.success} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={[styles.uploadTitle, { color: Colors.primaryText }]}>Choose from Photos</Text>
              <Text style={[styles.uploadDescription, { color: Colors.secondaryText }]}>
                Select existing contract photos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          {/* Take Photo */}
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handleTakePhoto}
            disabled={uploading}
          >
            <View style={[styles.uploadIcon, { backgroundColor: Colors.warning + '15' }]}>
              <Ionicons name="camera-outline" size={24} color={Colors.warning} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={[styles.uploadTitle, { color: Colors.primaryText }]}>Take Photo</Text>
              <Text style={[styles.uploadDescription, { color: Colors.secondaryText }]}>
                Capture a contract document
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View style={[styles.footer, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  skipButton: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  contractCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  contractHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  contractIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  contractName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  contractType: {
    fontSize: FontSizes.sm,
    marginBottom: 4,
  },
  contractDescription: {
    fontSize: FontSizes.tiny,
    marginBottom: 4,
  },
  contractAmount: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadInfo: {
    flex: 1,
  },
  uploadTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  uploadDescription: {
    fontSize: FontSizes.sm,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
