/**
 * Service Search Input Component
 * Real-time search with autocomplete for service discovery
 * Features debounced search, AI-powered suggestions, keyboard support
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  getAutocompleteSuggestions,
  discoverServices,
  getPopularSuggestions,
} from '../services/serviceDiscoveryService';

export default function ServiceSearchInput({
  onServiceSelect,
  placeholder = "Search for a service...",
  selectedServices = [],
  showPopularOnFocus = true,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [popularServices, setPopularServices] = useState([]);

  const searchTimeout = useRef(null);
  const inputRef = useRef(null);

  // Load popular services for empty state
  useEffect(() => {
    if (showPopularOnFocus) {
      loadPopularServices();
    }
  }, []);

  const loadPopularServices = async () => {
    try {
      const popular = await getPopularSuggestions(8);
      setPopularServices(popular);
    } catch (error) {
      console.error('Error loading popular services:', error);
    }
  };

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Clear previous timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // Debounce search by 300ms
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await getAutocompleteSuggestions(query);
        setSuggestions(results);
      } catch (error) {
        console.error('Search error:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [query]);

  const handleInputChange = (text) => {
    setQuery(text);
    setShowDropdown(true);
  };

  const handleServiceSelect = async (service) => {
    // Hide dropdown and clear search
    setShowDropdown(false);
    setQuery('');
    Keyboard.dismiss();

    // Check if already selected
    const isAlreadySelected = selectedServices.some(s => s.id === service.id);
    if (isAlreadySelected) {
      return;
    }

    // Pass service to parent
    if (onServiceSelect) {
      onServiceSelect(service);
    }
  };

  const handleManualEntry = async () => {
    if (!query.trim() || query.trim().length < 3) {
      return;
    }

    // Check if already selected
    const isAlreadySelected = selectedServices.some(
      s => s.name.toLowerCase() === query.trim().toLowerCase()
    );
    if (isAlreadySelected) {
      setQuery('');
      return;
    }

    setIsGenerating(true);
    setShowDropdown(false);

    try {
      // Use discover services which will AI-generate if needed
      const results = await discoverServices(query.trim());

      if (results && results.length > 0) {
        handleServiceSelect(results[0]);
      }
    } catch (error) {
      console.error('Error discovering service:', error);
    } finally {
      setIsGenerating(false);
      setQuery('');
    }
  };

  const handleFocus = () => {
    if (query.trim().length === 0 && popularServices.length > 0) {
      setSuggestions(popularServices);
    }
    setShowDropdown(true);
  };

  const handleBlur = () => {
    // Delay hiding dropdown to allow tap on suggestion
    setTimeout(() => {
      setShowDropdown(false);
    }, 150);
  };

  const renderSuggestion = ({ item }) => {
    const isSelected = selectedServices.some(s => s.id === item.id);

    return (
      <TouchableOpacity
        style={[
          styles.suggestionItem,
          {
            backgroundColor: isSelected ? Colors.lightGray : Colors.white,
          },
        ]}
        onPress={() => handleServiceSelect(item)}
        disabled={isSelected}
        activeOpacity={0.7}
      >
        <View style={styles.suggestionContent}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.primaryBlue + '15' }]}>
            <Ionicons name={item.icon || 'construct-outline'} size={20} color={Colors.primaryBlue} />
          </View>

          <View style={styles.suggestionText}>
            <Text
              style={[
                styles.suggestionName,
                {
                  color: isSelected ? Colors.secondaryText : Colors.primaryText,
                },
              ]}
            >
              {item.name}
            </Text>
            {item.description && (
              <Text
                style={[styles.suggestionDescription, { color: Colors.secondaryText }]}
                numberOfLines={1}
              >
                {item.description}
              </Text>
            )}
          </View>

          {isSelected && (
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    if (isSearching) {
      return null;
    }

    if (query.trim().length >= 2 && suggestions.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={32} color={Colors.secondaryText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No results found
          </Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleManualEntry}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createButtonText}>
              Create "{query.trim()}"
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
        <Ionicons name="search-outline" size={20} color={Colors.secondaryText} />

        <TextInput
          ref={inputRef}
          style={[styles.input, { color: Colors.primaryText }]}
          placeholder={placeholder}
          placeholderTextColor={Colors.secondaryText}
          value={query}
          onChangeText={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={handleManualEntry}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
        />

        {isSearching && (
          <ActivityIndicator size="small" color={Colors.primaryBlue} />
        )}

        {isGenerating && (
          <ActivityIndicator size="small" color={Colors.primaryBlue} />
        )}

        {query.length > 0 && !isSearching && !isGenerating && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      {/* Generating Indicator */}
      {isGenerating && (
        <View style={[styles.generatingBanner, { backgroundColor: Colors.primaryBlue + '15' }]}>
          <ActivityIndicator size="small" color={Colors.primaryBlue} />
          <Text style={[styles.generatingText, { color: Colors.primaryBlue }]}>
            Generating template...
          </Text>
        </View>
      )}

      {/* Autocomplete Dropdown */}
      {showDropdown && suggestions.length > 0 && !isGenerating && (
        <View style={[styles.dropdown, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            renderItem={renderSuggestion}
            ListEmptyComponent={renderEmptyState}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.suggestionList}
          />
        </View>
      )}

      {/* Show popular services when focused and no query */}
      {showDropdown && query.trim().length === 0 && popularServices.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <Text style={[styles.dropdownHeader, { color: Colors.secondaryText }]}>
            Popular Services
          </Text>
          <FlatList
            data={popularServices}
            keyExtractor={(item) => item.id}
            renderItem={renderSuggestion}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.suggestionList}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.xs,
  },
  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  generatingText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1001,
  },
  dropdownHeader: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  suggestionList: {
    maxHeight: 300,
  },
  suggestionItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionText: {
    flex: 1,
  },
  suggestionName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  suggestionDescription: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.body,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  createButtonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
