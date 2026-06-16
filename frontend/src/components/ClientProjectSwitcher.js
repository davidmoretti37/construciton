// ClientProjectSwitcher — compact pill that lets a client with 2+ projects
// switch which project every screen is showing. Renders nothing for a single
// project. Reads/writes the shared ClientProjectContext.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useClientProject } from '../contexts/ClientProjectContext';

export default function ClientProjectSwitcher({ light = false }) {
  const { projects, selectedProject, setSelectedProjectId } = useClientProject();
  const [open, setOpen] = useState(false);

  if (!projects || projects.length < 2) return null;

  const fg = light ? '#fff' : '#111827';
  const name = selectedProject?.name || 'Select project';

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, light ? styles.pillLight : styles.pillDark]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="swap-horizontal" size={14} color={fg} />
        <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>{name}</Text>
        <Ionicons name="chevron-down" size={14} color={fg} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Your projects</Text>
            {projects.map((p) => {
              const active = p.id === selectedProject?.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.row}
                  onPress={() => { setSelectedProjectId(p.id); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                    {p.name || 'Untitled project'}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color="#F59E0B" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', maxWidth: '100%',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, marginTop: 6,
  },
  pillLight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  pillDark: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  pillText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowText: { fontSize: 16, color: '#374151', flex: 1, marginRight: 12 },
  rowTextActive: { color: '#111827', fontWeight: '700' },
});
