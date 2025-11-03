import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAllTrades } from '../../constants/trades';

export default function TradeSelectionScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const trades = getAllTrades();

  const [selectedTrades, setSelectedTrades] = useState([]);

  const toggleTrade = (tradeId) => {
    if (selectedTrades.includes(tradeId)) {
      setSelectedTrades(selectedTrades.filter(id => id !== tradeId));
    } else {
      setSelectedTrades([...selectedTrades, tradeId]);
    }
  };

  const handleContinue = () => {
    if (selectedTrades.length === 0) {
      Alert.alert('Select Services', 'Please select at least one service you offer');
      return;
    }

    navigation.navigate('BusinessInfo', { selectedTrades });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Your Services</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          What services do you offer?
        </Text>
        <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
          Select all that apply. You can add or remove later.
        </Text>

        {/* Trade Grid */}
        <View style={styles.tradeGrid}>
          {trades.map((trade) => {
            const isSelected = selectedTrades.includes(trade.id);

            return (
              <TouchableOpacity
                key={trade.id}
                style={[
                  styles.tradeCard,
                  {
                    backgroundColor: isSelected ? Colors.primaryBlue + '15' : Colors.white,
                    borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                  },
                ]}
                onPress={() => toggleTrade(trade.id)}
                activeOpacity={0.7}
              >
                {isSelected && (
                  <View style={[styles.checkBadge, { backgroundColor: Colors.primaryBlue }]}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                )}

                <Ionicons
                  name={trade.icon}
                  size={32}
                  color={isSelected ? Colors.primaryBlue : Colors.secondaryText}
                />
                <Text
                  style={[
                    styles.tradeName,
                    { color: isSelected ? Colors.primaryBlue : Colors.primaryText },
                  ]}
                >
                  {trade.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Count */}
        {selectedTrades.length > 0 && (
          <View style={[styles.selectedBanner, { backgroundColor: Colors.success + '20' }]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={[styles.selectedText, { color: Colors.success }]}>
              {selectedTrades.length} service{selectedTrades.length > 1 ? 's' : ''} selected
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Section */}
      <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: selectedTrades.length > 0 ? Colors.primaryBlue : Colors.lightGray,
            },
          ]}
          onPress={handleContinue}
          disabled={selectedTrades.length === 0}
          activeOpacity={0.8}
        >
          <Text style={[styles.buttonText, { opacity: selectedTrades.length > 0 ? 1 : 0.5 }]}>
            Continue
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" style={{ opacity: selectedTrades.length > 0 ? 1 : 0.5 }} />
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
            <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>Step 2 of 4</Text>
        </View>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.xxl,
    lineHeight: 22,
  },
  tradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  tradeCard: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tradeName: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  selectedText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
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
});
