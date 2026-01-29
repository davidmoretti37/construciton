import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Alert, Platform, ActionSheetIOS } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import * as FileSystem from 'expo-file-system';

export default function ContractPreview({ data, onAction }) {
  const { t } = useTranslation('chat');
  const { t: tCommon } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const {
    contractDocument,
  } = data;

  if (!contractDocument) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={[styles.errorText, { color: Colors.primaryText }]}>
            {t('contract.documentNotFound')}
          </Text>
        </View>
      </View>
    );
  }

  const {
    id,
    file_name,
    file_url,
    file_type,
    created_at,
  } = contractDocument;

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleShare = async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Show action sheet with options
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Share Document', 'Copy Link'],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              // Share document
              await shareDocument();
            } else if (buttonIndex === 2) {
              // Copy link
              await copyLink();
            }
          }
        );
      } else {
        // Android: Show alert with options
        Alert.alert(
          t('contract.shareContract'),
          t('contract.sharePrompt'),
          [
            { text: tCommon('buttons.cancel'), style: 'cancel' },
            {
              text: t('contract.shareDocument'),
              onPress: async () => await shareDocument()
            },
            {
              text: t('contract.copyLink'),
              onPress: async () => await copyLink()
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error sharing contract:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToShare', { item: t('contract.contract') }));
    }
  };

  const shareDocument = async () => {
    try {
      if (file_type === 'image') {
        // For images, share the URL directly
        await Share.share({
          message: `Contract: ${file_name}`,
          url: file_url,
        });
      } else {
        // For PDFs, download first then share
        const fileUri = FileSystem.documentDirectory + file_name;
        const downloadResult = await FileSystem.downloadAsync(file_url, fileUri);

        await Share.share({
          message: `Contract: ${file_name}`,
          url: downloadResult.uri,
        });
      }
    } catch (error) {
      console.error('Error sharing document:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToShare', { item: t('contract.document') }));
    }
  };

  const copyLink = async () => {
    try {
      await Share.share({
        message: file_url,
      });
      Alert.alert(tCommon('alerts.success'), t('contract.linkCopiedToShare'));
    } catch (error) {
      console.error('Error copying link:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToCopy', { item: t('contract.link') }));
    }
  };

  const handleView = () => {
    if (onAction) {
      onAction({
        type: 'view-contract',
        data: {
          contractDocument
        }
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            {t('contract.contractDocumentTitle')}
          </Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: file_type === 'image' ? Colors.success + '15' : Colors.primaryBlue + '15', borderColor: file_type === 'image' ? Colors.success : Colors.primaryBlue }]}>
          <Ionicons
            name={file_type === 'image' ? 'image-outline' : 'document-text-outline'}
            size={16}
            color={file_type === 'image' ? Colors.success : Colors.primaryBlue}
          />
          <Text style={[styles.typeText, { color: file_type === 'image' ? Colors.success : Colors.primaryBlue }]}>
            {file_type === 'image' ? t('contract.image') : t('contract.pdf')}
          </Text>
        </View>
      </View>

      {/* Document Preview */}
      <TouchableOpacity
        style={styles.previewSection}
        onPress={handleView}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '15' }]}>
          <Ionicons
            name={file_type === 'image' ? 'image-outline' : 'document-text-outline'}
            size={64}
            color={Colors.primaryBlue}
          />
        </View>

        <View style={styles.documentInfo}>
          <Text style={[styles.fileName, { color: Colors.primaryText }]} numberOfLines={2}>
            {file_name}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
            <Text style={[styles.metaText, { color: Colors.secondaryText }]}>
              {t('contract.uploaded')} {formatDate(created_at)}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
      </TouchableOpacity>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: Colors.lightGray, flex: 1 }]}
          onPress={handleView}
          activeOpacity={0.7}
        >
          <Ionicons name="eye-outline" size={18} color={Colors.primaryText} />
          <Text style={[styles.buttonText, { color: Colors.primaryText }]}>{tCommon('buttons.view')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: Colors.primaryBlue, flex: 1 }]}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={[styles.buttonTextWhite]}>{tCommon('buttons.share')}</Text>
        </TouchableOpacity>
      </View>

      {/* Helper Text */}
      <View style={[styles.helperTextContainer, { backgroundColor: Colors.lightGray }]}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.primaryBlue} />
        <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
          {t('contract.shareHelperText')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 2,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 4,
  },
  typeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  previewSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  fileName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSizes.tiny,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingTop: 0,
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  buttonText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  buttonTextWhite: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  helperTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  helperText: {
    flex: 1,
    fontSize: FontSizes.tiny,
    lineHeight: 16,
  },
  errorContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
