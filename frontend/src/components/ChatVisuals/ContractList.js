import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ContractList({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const { contracts = [] } = data;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFileIcon = (fileType, fileName) => {
    if (fileType === 'image' || /\.(jpg|jpeg|png|gif)$/i.test(fileName || '')) {
      return 'image-outline';
    }
    return 'document-text-outline';
  };

  const getFileTypeBadge = (fileType, fileName) => {
    if (fileType === 'image' || /\.(jpg|jpeg|png|gif)$/i.test(fileName || '')) {
      return 'Image';
    }
    if (/\.pdf$/i.test(fileName || '')) {
      return 'PDF';
    }
    return 'Document';
  };

  const handleContractTap = (contract) => {
    if (onAction) {
      onAction({ type: 'view-contract', data: { contractDocument: contract } });
    }
  };

  const handleShareTap = (contract) => {
    if (onAction) {
      onAction({ type: 'share-contract', data: { contractDocument: contract } });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          Contracts
        </Text>
        <View style={[styles.badge, { backgroundColor: Colors.primaryBlue }]}>
          <Text style={styles.badgeText}>{contracts.length}</Text>
        </View>
      </View>

      {/* Contracts List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {contracts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No contracts uploaded yet
            </Text>
          </View>
        ) : (
          contracts.map((contract, index) => (
            <TouchableOpacity
              key={contract.id || index}
              style={[styles.contractCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
              onPress={() => handleContractTap(contract)}
              activeOpacity={0.7}
            >
              {/* Icon and Info */}
              <View style={styles.contractMain}>
                <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '15' }]}>
                  <Ionicons
                    name={getFileIcon(contract.file_type, contract.file_name)}
                    size={28}
                    color={Colors.primaryBlue}
                  />
                </View>

                <View style={styles.contractInfo}>
                  <Text style={[styles.fileName, { color: Colors.primaryText }]} numberOfLines={2}>
                    {contract.file_name || `Contract ${index + 1}`}
                  </Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={12} color={Colors.secondaryText} />
                    <Text style={[styles.metaText, { color: Colors.secondaryText }]}>
                      {formatDate(contract.created_at)}
                    </Text>
                  </View>
                </View>

                {/* Type Badge */}
                <View style={[styles.typeBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
                  <Text style={[styles.typeText, { color: Colors.primaryBlue }]}>
                    {getFileTypeBadge(contract.file_type, contract.file_name)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => handleContractTap(contract)}
                >
                  <Ionicons name="eye-outline" size={16} color="#fff" />
                  <Text style={styles.actionButtonText}>View</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.shareButton, { borderColor: Colors.primaryBlue }]}
                  onPress={() => handleShareTap(contract)}
                >
                  <Ionicons name="share-outline" size={16} color={Colors.primaryBlue} />
                  <Text style={[styles.actionButtonText, { color: Colors.primaryBlue }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    maxHeight: 450,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    color: '#fff',
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  listContainer: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    padding: Spacing.md,
    paddingTop: 0,
    paddingBottom: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
  contractCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  contractMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  contractInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  fileName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSizes.tiny,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  typeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 6,
    flex: 1,
  },
  shareButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
