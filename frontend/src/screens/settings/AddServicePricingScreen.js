import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { addUserService, getServiceItems } from '../../utils/storage';

export default function AddServicePricingScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { categoryId, categoryName, categoryIcon, phases = [] } = route.params;

  const [serviceItems, setServiceItems] = useState([]);
  const [pricing, setPricing] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('job');

  useEffect(() => {
    loadServiceItems();
  }, []);

  const loadServiceItems = async () => {
    try {
      const items = await getServiceItems(categoryId);
      setServiceItems(items);

      // Initialize pricing with default values
      const initialPricing = {};
      items.forEach(item => {
        initialPricing[item.id] = {
          price: item.default_price || 0,
          unit: item.unit,
          name: item.name,
        };
      });
      setPricing(initialPricing);
    } catch (error) {
      console.error('Error loading service items:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'service details' }));
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (itemId, value) => {
    const numericValue = parseFloat(value) || 0;
    setPricing(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        price: numericValue,
      },
    }));
  };

  const handleAddItem = () => {
    setEditingItem({ isNew: true });
    setEditItemName('');
    setEditItemUnit('job');
    setShowEditModal(true);
  };

  const handleEditItem = (item) => {
    setEditingItem({ item });
    setEditItemName(item.name);
    setEditItemUnit(item.unit);
    setShowEditModal(true);
  };

  const handleDeleteItem = (itemId) => {
    Alert.alert(
      t('alerts.cannotDelete'),
      t('messages.confirmDeletePricing'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            setServiceItems(prev => prev.filter(i => i.id !== itemId));
            setPricing(prev => {
              const newPricing = { ...prev };
              delete newPricing[itemId];
              return newPricing;
            });
          },
        },
      ]
    );
  };

  const handleSaveItem = () => {
    if (!editItemName.trim()) {
      Alert.alert(t('alerts.missingInfo'), t('messages.pleaseEnter', { item: 'name' }));
      return;
    }

    if (editingItem.isNew) {
      // Add new item
      const newItem = {
        id: Date.now().toString(),
        name: editItemName.trim(),
        unit: editItemUnit,
        default_price: 0,
      };

      setServiceItems(prev => [...prev, newItem]);
      setPricing(prev => ({
        ...prev,
        [newItem.id]: {
          name: newItem.name,
          price: 0,
          unit: editItemUnit,
        },
      }));
    } else {
      // Edit existing item
      const itemId = editingItem.item.id;
      setServiceItems(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, name: editItemName.trim(), unit: editItemUnit }
          : item
      ));
      setPricing(prev => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          name: editItemName.trim(),
          unit: editItemUnit,
        },
      }));
    }

    setShowEditModal(false);
    setEditingItem(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await addUserService(categoryId, pricing, phases);

      if (success) {
        Alert.alert(t('alerts.success'), t('messages.savedSuccessfully', { item: 'service' }), [
          {
            text: t('buttons.ok'),
            onPress: () => {
              // Pop back 3 screens: Pricing -> Phases -> AddService
              navigation.pop(3);
            },
          },
        ]);
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'service' }));
      }
    } catch (error) {
      console.error('Error saving service:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'service' }));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
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
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Set Pricing</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          {/* Service Header */}
          <View style={[styles.serviceHeader, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <View style={[styles.serviceIcon, { backgroundColor: Colors.primaryBlue }]}>
              <Ionicons name={categoryIcon || 'briefcase-outline'} size={28} color="#fff" />
            </View>
            <View style={styles.serviceInfo}>
              <Text style={[styles.serviceName, { color: Colors.primaryText }]}>{categoryName}</Text>
              <Text style={[styles.serviceSubtitle, { color: Colors.secondaryText }]}>
                Set your default pricing for this service
              </Text>
            </View>
          </View>

          {/* Pricing Inputs */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {serviceItems.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="pricetag-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No pricing items yet. Add your first item below.
                </Text>
              </View>
            ) : (
              serviceItems.map((item) => {
                const currentPrice = pricing[item.id]?.price ?? item.default_price ?? 0;

                return (
                  <View key={item.id} style={styles.priceItem}>
                    <View style={styles.priceItemHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.priceItemLabel, { color: Colors.primaryText }]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.priceItemUnit, { color: Colors.secondaryText }]}>
                          per {item.unit}
                        </Text>
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          onPress={() => handleEditItem(item)}
                          style={styles.iconButton}
                        >
                          <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteItem(item.id)}
                          style={styles.iconButton}
                        >
                          <Ionicons name="trash-outline" size={20} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.priceInput, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                      <Text style={[styles.currencySymbol, { color: Colors.secondaryText }]}>$</Text>
                      <TextInput
                        style={[styles.input, { color: Colors.primaryText }]}
                        value={currentPrice.toString()}
                        onChangeText={(value) => handlePriceChange(item.id, value)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={Colors.secondaryText}
                      />
                      <Text style={[styles.unitText, { color: Colors.secondaryText }]}>
                        / {item.unit}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Add Item Button */}
            <TouchableOpacity
              style={[styles.addButton, { borderColor: Colors.primaryBlue }]}
              onPress={handleAddItem}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
              <Text style={[styles.addButtonText, { color: Colors.primaryBlue }]}>
                Add Pricing Item
              </Text>
            </TouchableOpacity>

            {/* Info Box */}
            <View style={[styles.infoBox, { backgroundColor: Colors.success + '10', borderColor: Colors.success + '30' }]}>
              <Ionicons name="bulb-outline" size={20} color={Colors.success} />
              <Text style={[styles.infoText, { color: Colors.success }]}>
                These will be your default rates for {categoryName}. You can adjust them anytime or customize pricing for individual projects.
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* Bottom Section */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonText}>Add Service</Text>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Edit Item Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              {editingItem?.isNew ? 'Add Pricing Item' : 'Edit Pricing Item'}
            </Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Item Name */}
            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>
                Item Name <Text style={{ color: Colors.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="e.g., Interior Painting"
                placeholderTextColor={Colors.secondaryText}
                value={editItemName}
                onChangeText={setEditItemName}
                autoFocus
              />
            </View>

            {/* Unit Selection */}
            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Unit Type</Text>
              <View style={styles.unitGrid}>
                {['sq ft', 'linear ft', 'hour', 'job', 'unit', 'room'].map(unit => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.unitButton,
                      {
                        backgroundColor: editItemUnit === unit ? Colors.primaryBlue : Colors.white,
                        borderColor: editItemUnit === unit ? Colors.primaryBlue : Colors.border,
                      },
                    ]}
                    onPress={() => setEditItemUnit(unit)}
                  >
                    <Text
                      style={[
                        styles.unitButtonText,
                        { color: editItemUnit === unit ? '#fff' : Colors.primaryText },
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.modalFooter, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { borderColor: Colors.border }]}
              onPress={() => setShowEditModal(false)}
            >
              <Text style={[styles.cancelButtonText, { color: Colors.primaryText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleSaveItem}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 4,
  },
  serviceSubtitle: {
    fontSize: FontSizes.small,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: 100,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
  },
  priceItem: {
    marginBottom: Spacing.xl,
  },
  priceItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  priceItemLabel: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  priceItemUnit: {
    fontSize: FontSizes.small,
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  iconButton: {
    padding: Spacing.xs,
  },
  priceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  currencySymbol: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    paddingVertical: Spacing.sm,
  },
  unitText: {
    fontSize: FontSizes.small,
    marginLeft: Spacing.xs,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  addButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  bottomSection: {
    padding: Spacing.xl,
    paddingBottom: 60,
    borderTopWidth: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    gap: Spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    padding: Spacing.xl,
  },
  modalInputGroup: {
    marginBottom: Spacing.xl,
  },
  modalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  unitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  unitButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    minWidth: 80,
    alignItems: 'center',
  },
  unitButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  saveButton: {},
  saveButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
