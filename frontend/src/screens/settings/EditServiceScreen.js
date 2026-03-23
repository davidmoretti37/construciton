import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

export default function EditServiceScreen({ route, navigation }) {
  const { serviceId } = route.params;
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('settings');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [service, setService] = useState(null);
  const [pricing, setPricing] = useState({});
  const [customPhases, setCustomPhases] = useState([]);
  const [activeTab, setActiveTab] = useState('pricing');

  // Edit modals
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [editingPricingKey, setEditingPricingKey] = useState(null);
  const [editingPhaseIndex, setEditingPhaseIndex] = useState(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('unit');
  const [editPhaseName, setEditPhaseName] = useState('');
  const [editPhaseDays, setEditPhaseDays] = useState('7');

  useEffect(() => {
    loadService();
  }, []);

  const loadService = async () => {
    try {
      const { data, error } = await supabase
        .from('user_services')
        .select(`
          *,
          service_categories (
            id,
            name,
            icon,
            description
          )
        `)
        .eq('id', serviceId)
        .single();

      if (error) {
        Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToLoad', { item: 'service' }));
        navigation.goBack();
        return;
      }

      setService(data);
      setPricing(data.pricing || {});
      setCustomPhases(data.custom_phases || []);
    } catch (error) {
      console.error('Error loading service:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToLoad', { item: 'service' }));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhase = () => {
    const newPhase = {
      phase_name: 'New Phase',
      default_days: 7,
      description: '',
      tasks: [],
    };
    setCustomPhases([...customPhases, newPhase]);
  };

  const handleDeletePhase = (index) => {
    Alert.alert(
      tCommon('alerts.cannotDelete'),
      tCommon('messages.confirmRemove', { item: 'phase' }),
      [
        { text: tCommon('buttons.cancel'), style: 'cancel' },
        {
          text: tCommon('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            const newPhases = customPhases.filter((_, i) => i !== index);
            setCustomPhases(newPhases);
          },
        },
      ]
    );
  };

  const handleUpdatePhase = (index, field, value) => {
    const newPhases = [...customPhases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setCustomPhases(newPhases);
  };

  const handleAddPricingItem = () => {
    // Generate a temporary key for the new item
    const newKey = `item_${Date.now()}`;
    setEditingPricingKey(newKey);
    setEditItemName('');
    setEditItemPrice('');
    setEditItemUnit('unit');
    setShowPricingModal(true);
  };

  const handleDeletePricingItem = (key) => {
    Alert.alert(
      tCommon('alerts.cannotDelete'),
      tCommon('messages.confirmRemove', { item: 'pricing item' }),
      [
        { text: tCommon('buttons.cancel'), style: 'cancel' },
        {
          text: tCommon('buttons.delete'),
          style: 'destructive',
          onPress: () => {
            const newPricing = { ...pricing };
            delete newPricing[key];
            setPricing(newPricing);
          },
        },
      ]
    );
  };

  const handleUpdatePricing = (key, field, value) => {
    setPricing({
      ...pricing,
      [key]: { ...pricing[key], [field]: value }
    });
  };

  const handlePriceChange = (key, value) => {
    const numericValue = parseFloat(value) || 0;
    setPricing({
      ...pricing,
      [key]: { ...pricing[key], price: numericValue }
    });
  };

  const handleEditPricingItem = (key, item) => {
    setEditingPricingKey(key);
    setEditItemName(item.name || '');
    setEditItemPrice(item.price ? item.price.toString() : '');
    setEditItemUnit(item.unit || 'unit');
    setShowPricingModal(true);
  };

  const handleSavePricingItem = () => {
    if (!editItemName.trim()) {
      Alert.alert(tCommon('alerts.missingInfo'), tCommon('messages.pleaseEnter', { item: 'name' }));
      return;
    }

    setPricing({
      ...pricing,
      [editingPricingKey]: {
        name: editItemName.trim(),
        price: parseFloat(editItemPrice) || 0,
        unit: editItemUnit,
      }
    });

    setShowPricingModal(false);
    setEditingPricingKey(null);
  };

  const handleEditPhase = (index, phase) => {
    setEditingPhaseIndex(index);
    setEditPhaseName(phase.phase_name || '');
    setEditPhaseDays((phase.default_days || 7).toString());
    setShowPhaseModal(true);
  };

  const handleSavePhase = () => {
    if (!editPhaseName.trim()) {
      Alert.alert(tCommon('alerts.missingInfo'), tCommon('messages.pleaseEnter', { item: 'phase name' }));
      return;
    }

    const newPhases = [...customPhases];
    newPhases[editingPhaseIndex] = {
      ...newPhases[editingPhaseIndex],
      phase_name: editPhaseName.trim(),
      default_days: parseInt(editPhaseDays) || 7,
    };
    setCustomPhases(newPhases);

    setShowPhaseModal(false);
    setEditingPhaseIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_services')
        .update({
          pricing: pricing,
          custom_phases: customPhases,
        })
        .eq('id', serviceId);

      if (error) throw error;

      Alert.alert(tCommon('alerts.success'), tCommon('messages.updatedSuccessfully', { item: 'service' }), [
        {
          text: tCommon('buttons.ok'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error saving service:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'service' }));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = () => {
    Alert.alert(
      tCommon('alerts.cannotDelete'),
      tCommon('messages.confirmRemove', { item: service?.service_categories?.name }),
      [
        { text: tCommon('buttons.cancel'), style: 'cancel' },
        {
          text: tCommon('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('user_services')
                .update({ is_active: false })
                .eq('id', serviceId);

              if (error) throw error;

              Alert.alert(tCommon('alerts.success'), tCommon('messages.deletedSuccessfully', { item: 'service' }), [
                {
                  text: tCommon('buttons.ok'),
                  onPress: () => navigation.goBack(),
                },
              ]);
            } catch (error) {
              console.error('Error deleting service:', error);
              Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'service' }));
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>{tCommon('status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          {service?.service_categories?.name || 'Edit Service'}
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleDeleteService}
        >
          <Ionicons name="trash-outline" size={24} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: Colors.primaryText, paddingHorizontal: Spacing.xl }]}>
            {t('services.customizeService')}
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText, paddingHorizontal: Spacing.xl }]}>
            {t('services.adjustPricing')}
          </Text>

          {/* Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            <TouchableOpacity
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === 'pricing' ? Colors.primaryBlue : Colors.white,
                  borderColor: activeTab === 'pricing' ? Colors.primaryBlue : Colors.border,
                },
              ]}
              onPress={() => setActiveTab('pricing')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="pricetag"
                size={20}
                color={activeTab === 'pricing' ? '#fff' : Colors.secondaryText}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'pricing' ? '#fff' : Colors.primaryText },
                ]}
              >
                {t('services.pricing')} ({Object.keys(pricing).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === 'phases' ? Colors.primaryBlue : Colors.white,
                  borderColor: activeTab === 'phases' ? Colors.primaryBlue : Colors.border,
                },
              ]}
              onPress={() => setActiveTab('phases')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="git-network-outline"
                size={20}
                color={activeTab === 'phases' ? '#fff' : Colors.secondaryText}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'phases' ? '#fff' : Colors.primaryText },
                ]}
              >
                {t('services.phases')} ({customPhases.length})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Pricing Tab */}
            {activeTab === 'pricing' && (
              <>
                {Object.entries(pricing).map(([key, value]) => (
                  <View key={key} style={styles.priceItem}>
                    <View style={styles.priceItemHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.priceItemLabel, { color: Colors.primaryText }]}>
                          {value.name || 'Unnamed Item'}
                        </Text>
                        <Text style={[styles.priceItemUnit, { color: Colors.secondaryText }]}>
                          {t('services.perUnit').replace('unit', value.unit || 'unit')}
                        </Text>
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          onPress={() => handleEditPricingItem(key, value)}
                          style={styles.iconButton}
                        >
                          <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeletePricingItem(key)}
                          style={styles.iconButton}
                        >
                          <Ionicons name="trash-outline" size={20} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.priceInput, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                      <Text style={[styles.currencySymbol, { color: Colors.secondaryText }]}>$</Text>
                      <Text style={[styles.input, { color: Colors.primaryText }]}>
                        {value.price || 0}
                      </Text>
                      <Text style={[styles.unitText, { color: Colors.secondaryText }]}>
                        {t('services.unit').replace('unit', value.unit || 'unit')}
                      </Text>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addButton, { borderColor: Colors.primaryBlue }]}
                  onPress={handleAddPricingItem}
                >
                  <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
                  <Text style={[styles.addButtonText, { color: Colors.primaryBlue }]}>
                    {t('services.addPricingItem')}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Phases Tab */}
            {activeTab === 'phases' && (
              <>
                {customPhases.map((phase, index) => (
                  <View
                    key={index}
                    style={[
                      styles.phaseCard,
                      {
                        backgroundColor: Colors.white,
                        borderColor: Colors.border,
                      },
                    ]}
                  >
                    <View style={styles.phaseHeader}>
                      <View style={styles.phaseHeaderLeft}>
                        <View style={[styles.phaseNumber, { backgroundColor: Colors.primaryBlue }]}>
                          <Text style={styles.phaseNumberText}>{index + 1}</Text>
                        </View>
                        <View style={styles.phaseInfo}>
                          <Text style={[styles.phaseName, { color: Colors.primaryText }]}>
                            {phase.phase_name || 'Unnamed Phase'}
                          </Text>
                          <Text style={[styles.phaseDays, { color: Colors.secondaryText }]}>
                            ~{phase.default_days || 7} {tCommon('units.days')}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.phaseActions}>
                        <TouchableOpacity
                          onPress={() => handleEditPhase(index, phase)}
                          style={styles.actionButton}
                        >
                          <Ionicons name="create-outline" size={22} color={Colors.primaryBlue} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeletePhase(index)}
                          style={styles.actionButton}
                        >
                          <Ionicons name="trash-outline" size={22} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {phase.tasks && phase.tasks.length > 0 && (
                      <View style={styles.tasksContainer}>
                        <Text style={[styles.tasksTitle, { color: Colors.secondaryText }]}>
                          {tCommon('labels.tasksCount', { count: phase.tasks.length })}:
                        </Text>
                        {phase.tasks.map((task, taskIndex) => (
                          <View key={taskIndex} style={styles.taskItem}>
                            <View style={[styles.taskBullet, { backgroundColor: Colors.primaryBlue }]} />
                            <Text style={[styles.taskText, { color: Colors.primaryText }]}>
                              {task}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addButton, { borderColor: Colors.primaryBlue }]}
                  onPress={handleAddPhase}
                >
                  <Ionicons name="add-circle-outline" size={24} color={Colors.primaryBlue} />
                  <Text style={[styles.addButtonText, { color: Colors.primaryBlue }]}>
                    {t('phases.addPhase')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>

        {/* Bottom Section */}
        <View style={[
          styles.bottomSection,
          {
            backgroundColor: Colors.white,
            borderTopColor: Colors.border,
            paddingBottom: Math.max(insets.bottom + 20, 36),
          }
        ]}>
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
                <Text style={styles.buttonText}>{t('services.saveChanges')}</Text>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Pricing Edit Modal */}
      <Modal
        visible={showPricingModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPricingModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              {pricing[editingPricingKey] ? t('services.editPricingItem') : t('services.addPricingItem')}
            </Text>
            <TouchableOpacity onPress={() => setShowPricingModal(false)}>
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
                placeholder="e.g., Labor, Materials"
                placeholderTextColor={Colors.secondaryText}
                value={editItemName}
                onChangeText={setEditItemName}
                autoFocus
              />
            </View>

            {/* Price */}
            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Price ($)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="0.00"
                placeholderTextColor={Colors.secondaryText}
                value={editItemPrice}
                onChangeText={setEditItemPrice}
                keyboardType="decimal-pad"
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
              onPress={() => setShowPricingModal(false)}
            >
              <Text style={[styles.cancelButtonText, { color: Colors.primaryText }]}>{tCommon('buttons.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleSavePricingItem}
            >
              <Text style={styles.saveButtonText}>{tCommon('buttons.save')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Phase Edit Modal */}
      <Modal
        visible={showPhaseModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPhaseModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>
              {t('phases.editPhases')}
            </Text>
            <TouchableOpacity onPress={() => setShowPhaseModal(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Phase Name */}
            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>
                Phase Name <Text style={{ color: Colors.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="e.g., Rough, Finish"
                placeholderTextColor={Colors.secondaryText}
                value={editPhaseName}
                onChangeText={setEditPhaseName}
                autoFocus
              />
            </View>

            {/* Days */}
            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalLabel, { color: Colors.primaryText }]}>Estimated Days</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                placeholder="7"
                placeholderTextColor={Colors.secondaryText}
                value={editPhaseDays}
                onChangeText={setEditPhaseDays}
                keyboardType="number-pad"
              />
            </View>
          </ScrollView>

          <View style={[styles.modalFooter, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { borderColor: Colors.border }]}
              onPress={() => setShowPhaseModal(false)}
            >
              <Text style={[styles.cancelButtonText, { color: Colors.primaryText }]}>{tCommon('buttons.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleSavePhase}
            >
              <Text style={styles.saveButtonText}>{tCommon('buttons.save')}</Text>
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
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
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
  // Pricing Styles
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
  iconButton: {
    padding: Spacing.xs,
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
  // Phase Styles
  phaseCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  phaseHeaderLeft: {
    flexDirection: 'row',
    gap: Spacing.md,
    flex: 1,
  },
  phaseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseNumberText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  phaseDays: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  daysInput: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    padding: 0,
    minWidth: 30,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  tasksContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tasksTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  taskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  taskText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 18,
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
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  phaseActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
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
