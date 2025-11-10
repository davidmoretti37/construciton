import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const COMMON_UNITS = [
  { id: 'sqft', label: 'sq ft', icon: 'square-outline' },
  { id: 'unit', label: 'unit', icon: 'cube-outline' },
  { id: 'hour', label: 'hour', icon: 'time-outline' },
  { id: 'linearft', label: 'linear ft', icon: 'remove-outline' },
  { id: 'job', label: 'job', icon: 'briefcase-outline' },
  { id: 'day', label: 'day', icon: 'calendar-outline' },
];

export default function AddCustomServiceModal({ visible, onClose, onAdd, tradeName }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [serviceName, setServiceName] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [customUnit, setCustomUnit] = useState('');
  const [price, setPrice] = useState('');
  const [step, setStep] = useState(1); // 1: name, 2: unit, 3: price

  const resetForm = () => {
    setServiceName('');
    setSelectedUnit(null);
    setCustomUnit('');
    setPrice('');
    setStep(1);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleNext = () => {
    if (step === 1) {
      if (!serviceName.trim()) {
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!selectedUnit && !customUnit.trim()) {
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleAdd = () => {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return;
    }

    const unit = selectedUnit || customUnit.trim();

    onAdd({
      label: serviceName.trim(),
      unit,
      price: priceNum,
    });

    handleClose();
  };

  const isStepValid = () => {
    if (step === 1) return serviceName.trim().length > 0;
    if (step === 2) return selectedUnit || customUnit.trim().length > 0;
    if (step === 3) return parseFloat(price) > 0 && !isNaN(parseFloat(price));
    return false;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <View style={styles.headerLeft}>
              {step > 1 && (
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                  <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
                Add Custom Service
              </Text>
              <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]}>
                {tradeName}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            {[1, 2, 3].map((s) => (
              <View
                key={s}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: s <= step ? Colors.primaryBlue : Colors.border,
                  },
                ]}
              />
            ))}
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Step 1: Service Name */}
            {step === 1 && (
                <View style={styles.stepContainer}>
                  <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '15' }]}>
                    <Ionicons name="create-outline" size={48} color={Colors.primaryBlue} />
                  </View>
                  <Text style={[styles.stepTitle, { color: Colors.primaryText }]}>
                    What service do you provide?
                  </Text>
                  <Text style={[styles.stepDescription, { color: Colors.secondaryText }]}>
                    Enter the name of the service you want to add to your pricing list
                  </Text>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>
                      Service Name
                    </Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: Colors.white,
                        borderColor: serviceName.trim() ? Colors.primaryBlue : Colors.border,
                        color: Colors.primaryText,
                      }]}
                      placeholder="e.g., Window Installation"
                      placeholderTextColor={Colors.secondaryText}
                      value={serviceName}
                      onChangeText={setServiceName}
                      autoFocus
                      onSubmitEditing={handleNext}
                      returnKeyType="next"
                    />
                  </View>

                  {/* Examples */}
                  <View style={styles.examplesContainer}>
                    <Text style={[styles.examplesLabel, { color: Colors.secondaryText }]}>
                      Examples:
                    </Text>
                    <View style={styles.exampleChips}>
                      {['Window Installation', 'Door Hanging', 'Crown Molding', 'Baseboard Install'].map((example) => (
                        <TouchableOpacity
                          key={example}
                          style={[styles.exampleChip, {
                            backgroundColor: Colors.lightGray,
                            borderColor: Colors.border
                          }]}
                          onPress={() => setServiceName(example)}
                        >
                          <Text style={[styles.exampleChipText, { color: Colors.primaryText }]}>
                            {example}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
            )}

            {/* Step 2: Unit Type */}
            {step === 2 && (
              <View style={styles.stepContainer}>
                  <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '15' }]}>
                    <Ionicons name="analytics-outline" size={48} color={Colors.primaryBlue} />
                  </View>
                  <Text style={[styles.stepTitle, { color: Colors.primaryText }]}>
                    How do you charge for this?
                  </Text>
                  <Text style={[styles.stepDescription, { color: Colors.secondaryText }]}>
                    Select the unit you use to price "{serviceName}"
                  </Text>

                  {/* Common Units */}
                  <View style={styles.unitsGrid}>
                    {COMMON_UNITS.map((unit) => (
                      <TouchableOpacity
                        key={unit.id}
                        style={[
                          styles.unitCard,
                          {
                            backgroundColor: selectedUnit === unit.label ? Colors.primaryBlue + '15' : Colors.white,
                            borderColor: selectedUnit === unit.label ? Colors.primaryBlue : Colors.border,
                          },
                        ]}
                        onPress={() => {
                          setSelectedUnit(unit.label);
                          setCustomUnit('');
                        }}
                      >
                        <Ionicons
                          name={unit.icon}
                          size={32}
                          color={selectedUnit === unit.label ? Colors.primaryBlue : Colors.secondaryText}
                        />
                        <Text
                          style={[
                            styles.unitLabel,
                            { color: selectedUnit === unit.label ? Colors.primaryBlue : Colors.primaryText },
                          ]}
                        >
                          {unit.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Custom Unit */}
                  <View style={styles.customUnitContainer}>
                    <Text style={[styles.orText, { color: Colors.secondaryText }]}>
                      or enter custom unit
                    </Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: Colors.white,
                        borderColor: customUnit.trim() ? Colors.primaryBlue : Colors.border,
                        color: Colors.primaryText,
                      }]}
                      placeholder="e.g., panel, fixture, installation"
                      placeholderTextColor={Colors.secondaryText}
                      value={customUnit}
                      onChangeText={(text) => {
                        setCustomUnit(text);
                        setSelectedUnit(null);
                      }}
                      onSubmitEditing={handleNext}
                      returnKeyType="next"
                    />
                  </View>
                </View>
            )}

            {/* Step 3: Price */}
            {step === 3 && (
              <View style={styles.stepContainer}>
                  <View style={[styles.iconContainer, { backgroundColor: Colors.success + '15' }]}>
                    <Ionicons name="cash-outline" size={48} color={Colors.success} />
                  </View>
                  <Text style={[styles.stepTitle, { color: Colors.primaryText }]}>
                    What's your rate?
                  </Text>
                  <Text style={[styles.stepDescription, { color: Colors.secondaryText }]}>
                    Enter your price per {selectedUnit || customUnit}
                  </Text>

                  <View style={styles.priceInputContainer}>
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.priceInput, {
                        backgroundColor: Colors.white,
                        borderColor: parseFloat(price) > 0 ? Colors.success : Colors.border,
                        color: Colors.primaryText,
                      }]}
                      placeholder="0.00"
                      placeholderTextColor={Colors.secondaryText}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <Text style={[styles.unitSuffix, { color: Colors.secondaryText }]}>
                      per {selectedUnit || customUnit}
                    </Text>
                  </View>

                  {/* Preview */}
                  {parseFloat(price) > 0 && !isNaN(parseFloat(price)) && (
                    <View style={[styles.previewCard, { backgroundColor: Colors.lightGray }]}>
                      <Text style={[styles.previewLabel, { color: Colors.secondaryText }]}>
                        Example Calculation
                      </Text>
                      <Text style={[styles.previewText, { color: Colors.primaryText }]}>
                        10 {selectedUnit || customUnit} × ${parseFloat(price).toFixed(2)} = ${(parseFloat(price) * 10).toFixed(2)}
                      </Text>
                    </View>
                  )}

                  {/* Summary */}
                  <View style={[styles.summaryCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
                    <Text style={[styles.summaryTitle, { color: Colors.primaryBlue }]}>
                      Service Summary
                    </Text>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: Colors.primaryText }]}>
                        Service:
                      </Text>
                      <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
                        {serviceName}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: Colors.primaryText }]}>
                        Unit:
                      </Text>
                      <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
                        {selectedUnit || customUnit}
                      </Text>
                    </View>
                    {parseFloat(price) > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: Colors.primaryText }]}>
                          Rate:
                        </Text>
                        <Text style={[styles.summaryValue, { color: Colors.primaryBlue, fontWeight: '700' }]}>
                          ${parseFloat(price).toFixed(2)} per {selectedUnit || customUnit}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: Colors.border }]}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: isStepValid() ? Colors.primaryBlue : Colors.border,
                  opacity: isStepValid() ? 1 : 0.5,
                },
              ]}
              onPress={step === 3 ? handleAdd : handleNext}
              disabled={!isStepValid()}
            >
              <Text style={styles.actionButtonText}>
                {step === 3 ? 'Add Service' : 'Next'}
              </Text>
              <Ionicons
                name={step === 3 ? 'checkmark-circle' : 'arrow-forward'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '100%',
    paddingTop: 50, // Status bar padding
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  headerLeft: {
    width: 40,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.xl,
  },
  stepContainer: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  stepTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  stepDescription: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  inputContainer: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  textInput: {
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    fontSize: FontSizes.large,
    fontWeight: '600',
  },
  examplesContainer: {
    width: '100%',
  },
  examplesLabel: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.sm,
  },
  exampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  exampleChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  exampleChipText: {
    fontSize: FontSizes.small,
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    width: '100%',
    marginBottom: Spacing.lg,
  },
  unitCard: {
    width: '30%',
    aspectRatio: 1,
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  unitLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  customUnitContainer: {
    width: '100%',
  },
  orText: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  priceInputContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  priceInput: {
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    marginBottom: Spacing.sm,
  },
  unitSuffix: {
    fontSize: FontSizes.body,
  },
  previewCard: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  previewLabel: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.xs,
  },
  previewText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  summaryCard: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: FontSizes.small,
  },
  summaryValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
});
