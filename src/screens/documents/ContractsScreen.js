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
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage';

export default function ContractsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [activeTab, setActiveTab] = useState('contracts'); // 'contracts' or 'templates'
  const [contracts, setContracts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadContracts(), loadTemplates()]);
    } catch (error) {
      console.error('Error loading contracts data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContracts = async () => {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('contracts')
        .select('*, projects(name, client)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error('Error loading contracts:', error);
      setContracts([]);
    }
  };

  const loadTemplates = async () => {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplates([]);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleDeleteContract = (contractId) => {
    Alert.alert(
      'Delete Contract',
      'Are you sure you want to delete this contract?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('contracts')
                .delete()
                .eq('id', contractId);

              if (error) throw error;
              await loadContracts();
              Alert.alert('Success', 'Contract deleted successfully');
            } catch (error) {
              console.error('Error deleting contract:', error);
              Alert.alert('Error', 'Failed to delete contract');
            }
          },
        },
      ]
    );
  };

  const handleDeleteTemplate = (templateId) => {
    Alert.alert(
      'Delete Template',
      'Are you sure you want to delete this template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('contract_templates')
                .delete()
                .eq('id', templateId);

              if (error) throw error;
              await loadTemplates();
              Alert.alert('Success', 'Template deleted successfully');
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert('Error', 'Failed to delete template');
            }
          },
        },
      ]
    );
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

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contracts' && { borderBottomColor: Colors.primaryBlue }]}
          onPress={() => setActiveTab('contracts')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'contracts' ? Colors.primaryBlue : Colors.secondaryText }
          ]}>
            Saved Contracts ({contracts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'templates' && { borderBottomColor: Colors.primaryBlue }]}
          onPress={() => setActiveTab('templates')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'templates' ? Colors.primaryBlue : Colors.secondaryText }
          ]}>
            Templates ({templates.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'contracts' ? (
          <View style={styles.listSection}>
            {contracts.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
                <Ionicons name="document-text-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No contracts created yet
                </Text>
                <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
                  Contracts will appear here when you create them through the chat
                </Text>
              </View>
            ) : (
              contracts.map((contract) => (
                <View
                  key={contract.id}
                  style={[styles.contractCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={[styles.contractTitle, { color: Colors.primaryText }]}>
                        {contract.projects?.name || 'Untitled Project'}
                      </Text>
                      <Text style={[styles.contractClient, { color: Colors.secondaryText }]}>
                        {contract.projects?.client || 'No client'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(contract.status) + '20' },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: getStatusColor(contract.status) }]}>
                        {contract.status || 'Draft'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.contractInfo}>
                    <View style={styles.infoRow}>
                      <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                      <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                        {contract.created_at ? new Date(contract.created_at).toLocaleDateString() : 'N/A'}
                      </Text>
                    </View>
                    {contract.value && (
                      <Text style={[styles.contractValue, { color: Colors.primaryText }]}>
                        ${contract.value.toLocaleString()}
                      </Text>
                    )}
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: Colors.primaryBlue + '10' }]}
                      onPress={() => {/* TODO: View/download PDF */}}
                    >
                      <Ionicons name="eye-outline" size={18} color={Colors.primaryBlue} />
                      <Text style={[styles.actionText, { color: Colors.primaryBlue }]}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: Colors.primaryBlue + '10' }]}
                      onPress={() => {/* TODO: Share */}}
                    >
                      <Ionicons name="share-outline" size={18} color={Colors.primaryBlue} />
                      <Text style={[styles.actionText, { color: Colors.primaryBlue }]}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#EF4444' + '10' }]}
                      onPress={() => handleDeleteContract(contract.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.listSection}>
            {/* Create New Template Button */}
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => {/* TODO: Create new template */}}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.createButtonText}>Create New Template</Text>
            </TouchableOpacity>

            {templates.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
                <Ionicons name="document-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No templates created yet
                </Text>
                <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
                  Create reusable contract templates for faster project setup
                </Text>
              </View>
            ) : (
              templates.map((template) => (
                <View
                  key={template.id}
                  style={[styles.templateCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                >
                  <View style={styles.templateHeader}>
                    <View style={styles.templateHeaderLeft}>
                      <Text style={[styles.templateName, { color: Colors.primaryText }]}>
                        {template.name}
                      </Text>
                      {template.description && (
                        <Text style={[styles.templateDescription, { color: Colors.secondaryText }]}>
                          {template.description}
                        </Text>
                      )}
                    </View>
                    {template.is_default && (
                      <View style={[styles.defaultBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
                        <Text style={[styles.defaultText, { color: Colors.primaryBlue }]}>Default</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.templateInfo}>
                    <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                      Created {template.created_at ? new Date(template.created_at).toLocaleDateString() : 'N/A'}
                    </Text>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: Colors.primaryBlue + '10' }]}
                      onPress={() => {/* TODO: Edit template */}}
                    >
                      <Ionicons name="create-outline" size={18} color={Colors.primaryBlue} />
                      <Text style={[styles.actionText, { color: Colors.primaryBlue }]}>Edit</Text>
                    </TouchableOpacity>
                    {!template.is_default && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: Colors.primaryBlue + '10' }]}
                        onPress={() => {/* TODO: Set as default */}}
                      >
                        <Ionicons name="star-outline" size={18} color={Colors.primaryBlue} />
                        <Text style={[styles.actionText, { color: Colors.primaryBlue }]}>Set Default</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#EF4444' + '10' }]}
                      onPress={() => handleDeleteTemplate(template.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
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
});
