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
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { saveUserProfile, completeOnboarding } from '../../utils/storage';

export default function PricingSetupScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');

  // NEW: Get selected services instead of trades
  const { selectedServices: initialServices, businessInfo, phasesTemplate } = route.params;
  const selectedTrades = route.params.selectedTrades; // Legacy support

  const [services, setServices] = useState(initialServices || []);
  const [activeService, setActiveService] = useState(services[0]?.id || null);
  const [pricing, setPricing] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItemName, setEditItemName] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('job');

  // Initialize pricing from selected services
  useEffect(() => {
    initializePricing();
  }, []);

  const initializePricing = () => {
    const initialPricing = {};

    services.forEach((service) => {
      initialPricing[service.id] = {};

      // Initialize pricing for each item - user must enter all prices (no defaults)
      if (service.items && service.items.length > 0) {
        service.items.forEach(item => {
          initialPricing[service.id][item.id] = {
            name: item.name, // Store the item name so it's saved to database
            price: '', // Always start empty - user must enter their own pricing
            unit: item.unit,
          };
        });
      }
    });

    setPricing(initialPricing);
    setLoading(false);
  };

  const handlePriceChange = (tradeId, itemId, value) => {
    const numericValue = parseFloat(value) || 0;
    setPricing(prev => ({
      ...prev,
      [tradeId]: {
        ...prev[tradeId],
        [itemId]: {
          ...prev[tradeId][itemId],
          price: numericValue,
        },
      },
    }));
  };

  const handleAddServiceItem = (serviceId) => {
    // Open modal for adding new item
    setEditingItem({ serviceId, isNew: true });
    setEditItemName('');
    setEditItemDescription('');
    setEditItemUnit('job');
    setShowEditModal(true);
  };

  const handleEditItem = (serviceId, item) => {
    setEditingItem({ serviceId, item });
    setEditItemName(item.name);
    setEditItemDescription(item.description || '');
    setEditItemUnit(item.unit);
    setShowEditModal(true);
  };

  const handleDeleteItem = (serviceId, itemId) => {
    Alert.alert(
      t('alerts.confirmDelete'),
      t('messages.confirmDeleteItem'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            const serviceIndex = services.findIndex(s => s.id === serviceId);
            if (serviceIndex === -1) return;

            const updatedServices = [...services];
            updatedServices[serviceIndex] = {
              ...updatedServices[serviceIndex],
              items: updatedServices[serviceIndex].items.filter(i => i.id !== itemId),
            };
            setServices(updatedServices);

            // Remove from pricing state
            setPricing(prev => {
              const newPricing = { ...prev };
              if (newPricing[serviceId]) {
                delete newPricing[serviceId][itemId];
              }
              return newPricing;
            });
          },
        },
      ]
    );
  };

  const handleSaveItem = () => {
    if (!editItemName.trim()) {
      Alert.alert(t('alerts.requiredField'), t('messages.pleaseEnterName'));
      return;
    }

    const serviceIndex = services.findIndex(s => s.id === editingItem.serviceId);
    if (serviceIndex === -1) return;

    const updatedServices = [...services];

    if (editingItem.isNew) {
      // Add new item
      const newItem = {
        id: Date.now().toString(),
        name: editItemName.trim(),
        description: editItemDescription.trim(),
        unit: editItemUnit,
      };

      updatedServices[serviceIndex] = {
        ...updatedServices[serviceIndex],
        items: [...(updatedServices[serviceIndex].items || []), newItem],
      };

      // Update pricing state
      setPricing(prev => ({
        ...prev,
        [editingItem.serviceId]: {
          ...prev[editingItem.serviceId],
          [newItem.id]: {
            name: newItem.name, // Include name in pricing
            price: '',
            unit: editItemUnit,
          },
        },
      }));
    } else {
      // Edit existing item
      const itemIndex = updatedServices[serviceIndex].items.findIndex(i => i.id === editingItem.item.id);
      if (itemIndex !== -1) {
        updatedServices[serviceIndex].items[itemIndex] = {
          ...updatedServices[serviceIndex].items[itemIndex],
          name: editItemName.trim(),
          description: editItemDescription.trim(),
          unit: editItemUnit,
        };

        // Update pricing name and unit
        setPricing(prev => ({
          ...prev,
          [editingItem.serviceId]: {
            ...prev[editingItem.serviceId],
            [editingItem.item.id]: {
              ...prev[editingItem.serviceId][editingItem.item.id],
              name: editItemName.trim(), // Update name in pricing
              unit: editItemUnit,
            },
          },
        }));
      }
    }

    setServices(updatedServices);
    setShowEditModal(false);
    setEditingItem(null);
  };

  const handleContinue = async () => {
    // Navigate to Business Info screen
    navigation.navigate('BusinessInfo', {
      selectedServices: services,
      selectedTrades: selectedTrades || services.map(s => s.id),
      pricing,
      phasesTemplate,
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Get current active service
  const currentService = services.find(s => s.id === activeService);

  // Show loading while initializing
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
            Loading pricing options...
          </Text>
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Pricing Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: Colors.primaryText, paddingHorizontal: Spacing.xl }]}>
            Set your pricing
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText, paddingHorizontal: Spacing.xl }]}>
            These are your default rates. You can adjust them for each estimate.
          </Text>

          {/* Service Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            {services.map(service => {
              const isActive = activeService === service.id;

              return (
                <TouchableOpacity
                  key={service.id}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: isActive ? Colors.primaryBlue : Colors.white,
                      borderColor: isActive ? Colors.primaryBlue : Colors.border,
                    },
                  ]}
                  onPress={() => setActiveService(service.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={service.icon || 'construct-outline'}
                    size={20}
                    color={isActive ? '#fff' : Colors.secondaryText}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: isActive ? '#fff' : Colors.primaryText },
                    ]}
                  >
                    {service.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Pricing Inputs */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* Service items */}
            {currentService && currentService.items && currentService.items.length > 0 ? (
              currentService.items.map((item) => {
                const currentPrice = pricing[activeService]?.[item.id]?.price || '';

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
                          onPress={() => handleEditItem(activeService, item)}
                          style={styles.iconButton}
                        >
                          <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteItem(activeService, item.id)}
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
                        onChangeText={(value) => handlePriceChange(activeService, item.id, value)}
                        keyboardType="decimal-pad"
                        placeholder="Enter your rate"
                        placeholderTextColor={Colors.secondaryText}
                      />
                      <Text style={[styles.unitText, { color: Colors.secondaryText }]}>
                        / {item.unit}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No pricing items for this service
                </Text>
              </View>
            )}

            {/* Add Service Item Button */}
            <TouchableOpacity
              style={[styles.addButton, { borderColor: Colors.primaryBlue }]}
              onPress={() => handleAddServiceItem(activeService)}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
              <Text style={[styles.addButtonText, { color: Colors.primaryBlue }]}>
                Add Service Item
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Bottom Section */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Complete Setup</Text>
            <Ionicons name="checkmark" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>Step 3 of 4</Text>
          </View>
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
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              {editingItem?.isNew ? 'Add Service Item' : 'Edit Service Item'}
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

            {/* Item Description */}
            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>
                Description <Text style={[styles.optional, { color: Colors.secondaryText }]}>(Optional)</Text>
              </Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="Brief description of what's included"
                placeholderTextColor={Colors.secondaryText}
                value={editItemDescription}
                onChangeText={setEditItemDescription}
                multiline
                numberOfLines={3}
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
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  tabsContainer: {
    maxHeight: 60,
  },
  tabsContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    gap: Spacing.sm,
  },
  tabText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: 100,
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
  tipBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  tipText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  bottomSection: {
    padding: Spacing.xl,
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
    marginBottom: Spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
  },
  progressText: {
    fontSize: FontSizes.small,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  descriptionBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  descriptionText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 8,
    marginBottom: Spacing.md,
  },
  aiBadgeText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    flex: 1,
  },
  priceItemDesc: {
    fontSize: FontSizes.small,
    marginTop: 4,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.body,
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
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  addButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  iconButton: {
    padding: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
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
  saveButton: {
    // backgroundColor set via prop
  },
  saveButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
