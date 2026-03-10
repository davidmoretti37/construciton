import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SIZE_META = {
  small: { letter: 'S', name: 'Small', hint: '1 column \u00B7 compact' },
  medium: { letter: 'M', name: 'Medium', hint: 'Full width \u00B7 compact' },
  large: { letter: 'L', name: 'Large', hint: 'Full width \u00B7 tall' },
};

export default function WidgetSizeSheet({ visible, onClose, widget, currentSize, onResize }) {
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
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: 280,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E5E7EB',
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
    color: '#0F172A',
  },
  widgetName: {
    fontSize: 13,
    color: '#94A3B8',
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
    borderColor: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  optionDefault: {
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  letterBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBoxSelected: {
    backgroundColor: '#0F172A',
  },
  letterBoxDefault: {
    backgroundColor: '#F1F5F9',
  },
  letter: {
    fontSize: 12,
    fontWeight: '800',
  },
  letterSelected: {
    color: '#FFFFFF',
  },
  letterDefault: {
    color: '#94A3B8',
  },
  optionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  optionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionHint: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
