import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

/**
 * DocumentPicker - Selectable list for choosing a document to send
 * Used when AI needs user to pick from multiple matching documents
 */
export default function DocumentPicker({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');

  const { documents = [], action = 'send', recipientName = '' } = data;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFileIcon = (fileType, fileName) => {
    if (fileType === 'image' || /\.(jpg|jpeg|png|gif)$/i.test(fileName || '')) {
      return 'image-outline';
    }
    if (/\.pdf$/i.test(fileName || '')) {
      return 'document-text-outline';
    }
    return 'document-outline';
  };

  const getDocumentType = (doc) => {
    // Determine document type from various possible fields
    if (doc.type) return doc.type;
    if (doc.file_type) return doc.file_type === 'image' ? 'Image' : 'Document';
    if (doc.status) return 'Estimate'; // Estimates have status
    return 'Contract';
  };

  const handleSelect = (document) => {
    if (onAction) {
      // Pass the selected document and intended action
      onAction({
        type: 'document-selected',
        data: {
          document,
          action,
          recipientName,
        },
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="document-text-outline" size={20} color={Colors.primaryBlue} />
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          {t('documents.selectDocument', 'Select a document')}
        </Text>
      </View>

      {/* Document List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {documents.map((doc, index) => (
          <TouchableOpacity
            key={doc.id || index}
            style={[styles.documentCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
            onPress={() => handleSelect(doc)}
            activeOpacity={0.7}
          >
            {/* Icon */}
            <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons
                name={getFileIcon(doc.file_type, doc.file_name || doc.name)}
                size={24}
                color={Colors.primaryBlue}
              />
            </View>

            {/* Info */}
            <View style={styles.docInfo}>
              <Text style={[styles.docName, { color: Colors.primaryText }]} numberOfLines={1}>
                {doc.file_name || doc.name || doc.title || `Document ${index + 1}`}
              </Text>
              {(doc.created_at || doc.date) && (
                <Text style={[styles.docDate, { color: Colors.secondaryText }]}>
                  {formatDate(doc.created_at || doc.date)}
                </Text>
              )}
            </View>

            {/* Chevron */}
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    maxHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  listContainer: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    padding: Spacing.sm,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  docInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  docName: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    marginBottom: 2,
  },
  docDate: {
    fontSize: FontSizes.tiny,
  },
});
