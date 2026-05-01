/**
 * Shared line-item editor used by Estimate, Change Order, and Invoice builders.
 *
 * Item shape: { description, quantity, unit, pricePerUnit, total }
 * The component owns no state — pass `items` + `onChange(nextItems)`.
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const UNITS = ['ea', 'sf', 'lf', 'sy', 'cy', 'hr', 'day', 'lot'];

const fmt$ = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function LineItemEditor({ items, onChange, Colors }) {
  const styles = makeStyles(Colors);

  const updateItem = (idx, patch) => {
    onChange(items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      next.total = Number(next.quantity || 0) * Number(next.pricePerUnit || 0);
      return next;
    }));
  };

  const addItem = () => onChange([...items, { description: '', quantity: 1, unit: 'ea', pricePerUnit: 0, total: 0 }]);
  const removeItem = (idx) => onChange(items.length === 1 ? items : items.filter((_, i) => i !== idx));
  const duplicateItem = (idx) => {
    const copy = [...items];
    copy.splice(idx + 1, 0, { ...copy[idx] });
    onChange(copy);
  };
  const moveItem = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    onChange(copy);
  };

  return (
    <View>
      {items.map((it, idx) => (
        <View key={idx} style={styles.lineItemCard}>
          <View style={styles.lineItemHeader}>
            <Text style={styles.lineItemIndex}>{idx + 1}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => moveItem(idx, -1)} disabled={idx === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-up" size={16} color={idx === 0 ? Colors.border : Colors.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveItem(idx, 1)} disabled={idx === items.length - 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-down" size={16} color={idx === items.length - 1 ? Colors.border : Colors.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => duplicateItem(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="copy-outline" size={15} color={Colors.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeItem(idx)} disabled={items.length === 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={15} color={items.length === 1 ? Colors.border : '#DC2626'} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { marginTop: 6 }]}
            value={it.description}
            onChangeText={(v) => updateItem(idx, { description: v })}
            placeholder="Description"
            placeholderTextColor={Colors.placeholder || '#9CA3AF'}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Qty</Text>
              <TextInput
                style={styles.input}
                value={String(it.quantity)}
                onChangeText={(v) => updateItem(idx, { quantity: Number(v) || 0 })}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Unit</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => {
                  Alert.alert('Unit', null, [
                    ...UNITS.map((u) => ({ text: u, onPress: () => updateItem(idx, { unit: u }) })),
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.inputText}>{it.unit || 'ea'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1.3 }}>
              <Text style={styles.miniLabel}>Unit price</Text>
              <TextInput
                style={styles.input}
                value={String(it.pricePerUnit)}
                onChangeText={(v) => updateItem(idx, { pricePerUnit: Number(v) || 0 })}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={styles.lineItemTotalRow}>
            <Text style={styles.miniLabel}>Total</Text>
            <Text style={styles.lineItemTotal}>{fmt$(it.total)}</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color={Colors.primaryBlue} />
        <Text style={[styles.addItemBtnText, { color: Colors.primaryBlue }]}>Add line item</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  miniLabel: { fontSize: 10, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    fontSize: 14, color: Colors.primaryText,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    minHeight: 44,
  },
  inputText: { fontSize: 14, color: Colors.primaryText },
  lineItemCard: {
    backgroundColor: Colors.background,
    borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  lineItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineItemIndex: { fontSize: 12, fontWeight: '700', color: Colors.secondaryText },
  lineItemTotalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  lineItemTotal: { fontSize: 16, fontWeight: '700', color: Colors.primaryText },
  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.background,
  },
  addItemBtnText: { fontSize: 14, fontWeight: '600' },
});

export { fmt$ };
