import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const SIZE_META = {
  small: { letter: 'S', name: 'Small', hint: '1 column \u00B7 compact' },
  medium: { letter: 'M', name: 'Medium', hint: 'Full width \u00B7 compact' },
  large: { letter: 'L', name: 'Large', hint: 'Full width \u00B7 tall' },
};

export default function WidgetSizeSheet({ visible, onClose, widget, currentSize, onResize }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = useMemo(() => createStyles(Colors), [Colors]);

  if (!widget) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.content}>
            <Text style={styles.title}>Resize Widget</Text>
            <Text style={styles.widgetName}>{widget.label}</Text>

            <View style={styles.options}>
              {widget.availableSizes.map((s) => {
                const meta = SIZE_META[s];
                const selected = s === currentSize;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.option,
                      selected ? styles.optionSelected : styles.optionDefault,
                    ]}
                    onPress={() => onResize(s)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.letterBox, selected ? styles.letterBoxSelected : styles.letterBoxDefault]}>
                      <Text style={[styles.letter, selected ? styles.letterSelected : styles.letterDefault]}>
                        {meta.letter}
                      </Text>
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionName}>{meta.name}</Text>
                      <Text style={styles.optionHint}>{meta.hint}</Text>
                    </View>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.successGreen || '#10B981'} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: 280,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primaryText,
  },
  widgetName: {
    fontSize: 13,
    color: Colors.secondaryText,
    marginBottom: 16,
  },
  options: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  optionSelected: {
    borderColor: Colors.primaryBlue,
    backgroundColor: Colors.primaryBlue + '14',
  },
  optionDefault: {
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  letterBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBoxSelected: {
    backgroundColor: Colors.primaryBlue,
  },
  letterBoxDefault: {
    backgroundColor: Colors.lightGray,
  },
  letter: {
    fontSize: 12,
    fontWeight: '800',
  },
  letterSelected: {
    color: '#FFFFFF',
  },
  letterDefault: {
    color: Colors.secondaryText,
  },
  optionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  optionName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  optionHint: {
    fontSize: 12,
    color: Colors.secondaryText,
  },
});
