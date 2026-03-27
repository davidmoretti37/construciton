/**
 * DailyChecklistSection — Living daily checklist for project/service plan detail screens.
 *
 * Shows TODAY's checklist status. Workers/supervisors tap to complete items.
 * Owner sees read-only view + edit button to modify templates.
 * Resets each day — tomorrow is a fresh slate.
 *
 * Props:
 *   projectId       - UUID (provide this OR servicePlanId)
 *   servicePlanId   - UUID (provide this OR projectId)
 *   ownerId         - UUID of the business owner
 *   userRole        - 'owner' | 'supervisor' | 'worker'
 *   userId          - current user's profile ID
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

export default function DailyChecklistSection({
  projectId,
  servicePlanId,
  ownerId,
  userRole = 'worker',
  userId,
  visitTasks = [],  // visit_checklist_templates from service plan locations — merged into checklist
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const isOwner = userRole === 'owner';
  const canCheck = !isOwner; // workers & supervisors can check items

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [laborRoles, setLaborRoles] = useState([]);
  const [reportId, setReportId] = useState(null);
  const [entries, setEntries] = useState({}); // keyed by template_id
  const [isEditingTemplates, setIsEditingTemplates] = useState(false);
  const [editedTemplates, setEditedTemplates] = useState([]);
  const [editedRoles, setEditedRoles] = useState([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const parentFilter = projectId
    ? { project_id: projectId }
    : { service_plan_id: servicePlanId };

  // Load templates + today's report
  const loadData = useCallback(async () => {
    if (!projectId && !servicePlanId) return;
    setLoading(true);
    try {
      // 1. Fetch checklist templates (recurring + today's one-offs)
      let tQuery = supabase
        .from('daily_checklist_templates')
        .select('*')
        .eq('is_active', true)
        .or(`specific_date.is.null,specific_date.eq.${today}`)
        .order('sort_order', { ascending: true });
      if (projectId) tQuery = tQuery.eq('project_id', projectId);
      else tQuery = tQuery.eq('service_plan_id', servicePlanId);

      // 2. Fetch labor role templates
      let rQuery = supabase
        .from('labor_role_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (projectId) rQuery = rQuery.eq('project_id', projectId);
      else rQuery = rQuery.eq('service_plan_id', servicePlanId);

      // 3. Fetch today's report for current user
      let reportQuery = supabase
        .from('daily_service_reports')
        .select('id')
        .eq('reporter_id', userId)
        .eq('report_date', today);
      if (projectId) reportQuery = reportQuery.eq('project_id', projectId);
      else reportQuery = reportQuery.eq('service_plan_id', servicePlanId);

      const [tResult, rResult, reportResult] = await Promise.all([
        tQuery, rQuery, reportQuery.maybeSingle(),
      ]);

      // Merge daily checklist templates with visit tasks (visit tasks become checklist items)
      const dailyTemplates = tResult.data || [];
      const visitTaskTemplates = visitTasks
        .filter(vt => !dailyTemplates.some(dt => dt.title === vt.title)) // avoid duplicates
        .map(vt => ({
          id: `visit-${vt.id}`,
          title: vt.title,
          item_type: 'checkbox',
          quantity_unit: null,
          requires_photo: vt.requires_photo || false,
          sort_order: (vt.sort_order || 0) + 500, // after daily templates
          _isVisitTask: true, // flag so we know this came from visit tasks
        }));
      setTemplates([...dailyTemplates, ...visitTaskTemplates]);
      setLaborRoles(rResult.data || []);

      // 4. If report exists, load entries
      if (reportResult.data?.id) {
        setReportId(reportResult.data.id);
        const { data: entryData } = await supabase
          .from('daily_report_entries')
          .select('*')
          .eq('report_id', reportResult.data.id);

        const entryMap = {};
        (entryData || []).forEach(e => {
          const key = e.checklist_template_id || e.labor_template_id;
          if (key) entryMap[key] = e;
        });
        setEntries(entryMap);
      } else {
        setReportId(null);
        setEntries({});
      }
    } catch (e) {
      console.warn('DailyChecklistSection load error:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, servicePlanId, userId, today, visitTasks.length]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle a checklist item (for workers/supervisors)
  const handleToggleItem = async (template) => {
    if (!canCheck || saving) return;
    setSaving(true);
    try {
      const existing = entries[template.id];
      const newCompleted = !existing?.completed;

      // Ensure report exists
      let rId = reportId;
      if (!rId) {
        const { data: newReport } = await supabase
          .from('daily_service_reports')
          .insert({
            ...parentFilter,
            owner_id: ownerId,
            reporter_id: userId,
            report_date: today,
          })
          .select()
          .single();
        rId = newReport?.id;
        setReportId(rId);
      }

      if (!rId) return;

      if (existing?.id) {
        // Update existing entry
        await supabase
          .from('daily_report_entries')
          .update({ completed: newCompleted })
          .eq('id', existing.id);

        setEntries(prev => ({
          ...prev,
          [template.id]: { ...existing, completed: newCompleted },
        }));
      } else {
        // Insert new entry
        const { data: newEntry } = await supabase
          .from('daily_report_entries')
          .insert({
            report_id: rId,
            entry_type: 'checklist',
            checklist_template_id: template.id,
            title: template.title,
            completed: newCompleted,
            quantity_unit: template.quantity_unit,
            sort_order: template.sort_order,
          })
          .select()
          .single();

        if (newEntry) {
          setEntries(prev => ({ ...prev, [template.id]: newEntry }));
        }
      }
    } catch (e) {
      console.warn('Toggle error:', e);
    } finally {
      setSaving(false);
    }
  };

  // Update quantity for a checklist item
  const handleUpdateQuantity = async (template, value) => {
    if (!canCheck) return;
    const numValue = parseFloat(value) || null;
    const existing = entries[template.id];

    try {
      let rId = reportId;
      if (!rId) {
        const { data: newReport } = await supabase
          .from('daily_service_reports')
          .insert({
            ...parentFilter,
            owner_id: ownerId,
            reporter_id: userId,
            report_date: today,
          })
          .select()
          .single();
        rId = newReport?.id;
        setReportId(rId);
      }

      if (!rId) return;

      if (existing?.id) {
        await supabase
          .from('daily_report_entries')
          .update({ quantity: numValue })
          .eq('id', existing.id);

        setEntries(prev => ({
          ...prev,
          [template.id]: { ...existing, quantity: numValue },
        }));
      } else {
        const { data: newEntry } = await supabase
          .from('daily_report_entries')
          .insert({
            report_id: rId,
            entry_type: 'checklist',
            checklist_template_id: template.id,
            title: template.title,
            completed: false,
            quantity: numValue,
            quantity_unit: template.quantity_unit,
            sort_order: template.sort_order,
          })
          .select()
          .single();

        if (newEntry) {
          setEntries(prev => ({ ...prev, [template.id]: newEntry }));
        }
      }
    } catch (e) {
      console.warn('Quantity update error:', e);
    }
  };

  // === Owner template editing ===
  const handleStartEditTemplates = () => {
    setEditedTemplates(templates.map(t => ({ ...t })));
    setEditedRoles(laborRoles.map(r => ({ ...r })));
    setIsEditingTemplates(true);
  };

  const handleCancelEditTemplates = () => {
    setIsEditingTemplates(false);
  };

  const handleSaveTemplates = async () => {
    setSaving(true);
    try {
      // Soft-delete removed templates
      const existingIds = editedTemplates.filter(t => t.id && !t._isNew).map(t => t.id);
      const removedTemplates = templates.filter(t => !existingIds.includes(t.id));
      for (const t of removedTemplates) {
        await supabase.from('daily_checklist_templates').update({ is_active: false }).eq('id', t.id);
      }

      // Update existing + insert new templates
      for (let i = 0; i < editedTemplates.length; i++) {
        const t = editedTemplates[i];
        if (!t.title?.trim()) continue;
        if (t._isNew) {
          await supabase.from('daily_checklist_templates').insert({
            ...parentFilter,
            owner_id: ownerId,
            title: t.title.trim(),
            item_type: t.item_type || 'checkbox',
            quantity_unit: t.quantity_unit || null,
            requires_photo: t.requires_photo || false,
            specific_date: t.specific_date || null,
            sort_order: i,
          });
        } else {
          await supabase.from('daily_checklist_templates').update({
            title: t.title.trim(),
            item_type: t.item_type || 'checkbox',
            quantity_unit: t.quantity_unit || null,
            requires_photo: t.requires_photo || false,
            sort_order: i,
          }).eq('id', t.id);
        }
      }

      // Same for labor roles
      const existingRoleIds = editedRoles.filter(r => r.id && !r._isNew).map(r => r.id);
      const removedRoles = laborRoles.filter(r => !existingRoleIds.includes(r.id));
      for (const r of removedRoles) {
        await supabase.from('labor_role_templates').update({ is_active: false }).eq('id', r.id);
      }

      for (let i = 0; i < editedRoles.length; i++) {
        const r = editedRoles[i];
        if (!r.role_name?.trim()) continue;
        if (r._isNew) {
          await supabase.from('labor_role_templates').insert({
            ...parentFilter,
            owner_id: ownerId,
            role_name: r.role_name.trim(),
            default_quantity: r.default_quantity || 1,
            sort_order: i,
          });
        } else {
          await supabase.from('labor_role_templates').update({
            role_name: r.role_name.trim(),
            default_quantity: r.default_quantity || 1,
            sort_order: i,
          }).eq('id', r.id);
        }
      }

      setIsEditingTemplates(false);
      await loadData(); // Refresh
    } catch (e) {
      console.warn('Save templates error:', e);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTemplate = () => {
    setEditedTemplates(prev => [...prev, { _isNew: true, title: '', item_type: 'checkbox', quantity_unit: '', requires_photo: false }]);
  };

  const handleAddRole = () => {
    setEditedRoles(prev => [...prev, { _isNew: true, role_name: '', default_quantity: 1 }]);
  };

  // Don't render if nothing to show and user isn't owner
  if (!loading && templates.length === 0 && laborRoles.length === 0 && !isOwner) {
    return null;
  }
  // Hide empty state for owners too if visit tasks are the only content (they're managed elsewhere)
  const hasOwnTemplates = templates.some(t => !t._isVisitTask);

  // Completed count
  const completedCount = templates.filter(t => entries[t.id]?.completed).length;
  const totalCount = templates.length;

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Ionicons name="checkbox-outline" size={20} color="#8B5CF6" />
        <Text style={[styles.sectionTitle, { color: Colors.primaryText, flex: 1 }]}>
          Today's Checklist
          {totalCount > 0 && !isEditingTemplates && (
            <Text style={{ color: Colors.secondaryText, fontWeight: '400' }}>
              {' '}({completedCount}/{totalCount})
            </Text>
          )}
        </Text>
        {isOwner && !isEditingTemplates && (
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: Colors.primaryBlue + '15' }]}
            onPress={handleStartEditTemplates}
          >
            <Ionicons name="create-outline" size={16} color={Colors.primaryBlue} />
          </TouchableOpacity>
        )}
        {isEditingTemplates && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleCancelEditTemplates} style={styles.editActionBtn}>
              <Ionicons name="close" size={18} color="#EF4444" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSaveTemplates} disabled={saving} style={styles.editActionBtn}>
              {saving ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Ionicons name="checkmark" size={18} color="#10B981" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Colors.primaryBlue} />
        </View>
      ) : isEditingTemplates ? (
        /* ══════ OWNER EDIT MODE ══════ */
        <View>
          {/* Checklist items */}
          <View style={styles.editSectionHeader}>
            <Text style={[styles.editSectionLabel, { color: Colors.secondaryText }]}>Checklist Items</Text>
            <TouchableOpacity onPress={handleAddTemplate} style={[styles.addBtn, { backgroundColor: '#8B5CF615' }]}>
              <Ionicons name="add" size={14} color="#8B5CF6" />
              <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: '600' }}>Add Item</Text>
            </TouchableOpacity>
          </View>
          {editedTemplates.map((t, i) => (
            <View key={t.id || `new-${i}`} style={[styles.editCard, { backgroundColor: Colors.background || Colors.lightGray, borderColor: Colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="reorder-three-outline" size={18} color={Colors.secondaryText + '50'} />
                <TextInput
                  style={[styles.editCardInput, { color: Colors.primaryText, flex: 1 }]}
                  value={t.title}
                  onChangeText={v => {
                    const updated = [...editedTemplates];
                    updated[i] = { ...updated[i], title: v };
                    setEditedTemplates(updated);
                  }}
                  placeholder="Item name"
                  placeholderTextColor={Colors.secondaryText + '50'}
                />
                <TouchableOpacity
                  onPress={() => {
                    const updated = [...editedTemplates];
                    updated.splice(i, 1);
                    setEditedTemplates(updated);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.secondaryText + '40'} />
                </TouchableOpacity>
              </View>
              {/* Track a number toggle */}
              <View style={styles.editToggleRow}>
                <TouchableOpacity
                  style={styles.editToggle}
                  onPress={() => {
                    const updated = [...editedTemplates];
                    updated[i] = { ...updated[i], item_type: updated[i].item_type === 'checkbox' ? 'quantity' : 'checkbox' };
                    setEditedTemplates(updated);
                  }}
                >
                  <Ionicons
                    name={t.item_type === 'quantity' ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={t.item_type === 'quantity' ? '#3B82F6' : Colors.secondaryText + '60'}
                  />
                  <Text style={{ fontSize: 13, color: t.item_type === 'quantity' ? Colors.primaryText : Colors.secondaryText }}>
                    Track a number
                  </Text>
                </TouchableOpacity>
                {t.item_type === 'quantity' && (
                  <TextInput
                    style={[styles.editUnitInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={t.quantity_unit || ''}
                    onChangeText={v => {
                      const updated = [...editedTemplates];
                      updated[i] = { ...updated[i], quantity_unit: v };
                      setEditedTemplates(updated);
                    }}
                    placeholder="unit (ft, oz)"
                    placeholderTextColor={Colors.secondaryText + '50'}
                  />
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => {
                    const updated = [...editedTemplates];
                    updated[i] = { ...updated[i], requires_photo: !updated[i].requires_photo };
                    setEditedTemplates(updated);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={t.requires_photo ? 'camera' : 'camera-outline'}
                    size={18}
                    color={t.requires_photo ? '#3B82F6' : Colors.secondaryText + '40'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {editedTemplates.length === 0 && (
            <Text style={{ color: Colors.secondaryText, fontStyle: 'italic', fontSize: 13, paddingVertical: 8 }}>
              No items yet — tap "Add Item" above
            </Text>
          )}

          {/* Labor roles */}
          <View style={[styles.editSectionHeader, { marginTop: 16 }]}>
            <Text style={[styles.editSectionLabel, { color: Colors.secondaryText }]}>Crew Roles</Text>
            <TouchableOpacity onPress={handleAddRole} style={[styles.addBtn, { backgroundColor: '#10B98115' }]}>
              <Ionicons name="add" size={14} color="#10B981" />
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Add Role</Text>
            </TouchableOpacity>
          </View>
          {editedRoles.map((r, i) => (
            <View key={r.id || `new-role-${i}`} style={[styles.editCard, { backgroundColor: Colors.background || Colors.lightGray, borderColor: Colors.border }]}>
              <View style={styles.editRoleRow}>
                <Ionicons name="person-outline" size={18} color="#10B981" />
                <TextInput
                  style={[styles.editCardInput, { color: Colors.primaryText, borderColor: Colors.border, flex: 1 }]}
                  value={r.role_name}
                  onChangeText={v => {
                    const updated = [...editedRoles];
                    updated[i] = { ...updated[i], role_name: v };
                    setEditedRoles(updated);
                  }}
                  placeholder="Role name (e.g. Technician)"
                  placeholderTextColor={Colors.secondaryText + '60'}
                />
                <View style={styles.editQtyWrap}>
                  <TouchableOpacity
                    onPress={() => {
                      const updated = [...editedRoles];
                      updated[i] = { ...updated[i], default_quantity: Math.max(1, (updated[i].default_quantity || 1) - 1) };
                      setEditedRoles(updated);
                    }}
                    style={[styles.editQtyBtn, { borderColor: Colors.border }]}
                  >
                    <Ionicons name="remove" size={14} color={Colors.secondaryText} />
                  </TouchableOpacity>
                  <Text style={[styles.editQtyValue, { color: Colors.primaryText }]}>{r.default_quantity || 1}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const updated = [...editedRoles];
                      updated[i] = { ...updated[i], default_quantity: (updated[i].default_quantity || 1) + 1 };
                      setEditedRoles(updated);
                    }}
                    style={[styles.editQtyBtn, { borderColor: Colors.border }]}
                  >
                    <Ionicons name="add" size={14} color={Colors.secondaryText} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const updated = [...editedRoles];
                    updated.splice(i, 1);
                    setEditedRoles(updated);
                  }}
                  style={styles.editDeleteBtn}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {editedRoles.length === 0 && (
            <Text style={{ color: Colors.secondaryText, fontStyle: 'italic', fontSize: 13, paddingVertical: 8 }}>
              No roles yet — tap "Add Role" above
            </Text>
          )}
        </View>
      ) : templates.length === 0 && laborRoles.length === 0 ? (
        /* ══════ EMPTY STATE (owner only) ══════ */
        <View style={styles.emptyWrap}>
          <Ionicons name="list-outline" size={32} color={Colors.secondaryText + '60'} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No daily checklist set up
          </Text>
          <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
            Tap the edit button to add items
          </Text>
        </View>
      ) : (
        /* ══════ LIVE CHECKLIST VIEW ══════ */
        <View>
          {/* Checklist items */}
          {templates.map(template => {
            const entry = entries[template.id];
            const isCompleted = entry?.completed || false;
            const quantity = entry?.quantity != null ? String(entry.quantity) : '';

            return (
              <View key={template.id} style={[styles.itemRow, { borderBottomColor: Colors.border }]}>
                {canCheck ? (
                  <TouchableOpacity onPress={() => handleToggleItem(template)} disabled={saving}>
                    <Ionicons
                      name={isCompleted ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isCompleted ? '#10B981' : Colors.secondaryText}
                    />
                  </TouchableOpacity>
                ) : (
                  <Ionicons
                    name={isCompleted ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isCompleted ? '#10B981' : Colors.secondaryText + '60'}
                  />
                )}
                <Text
                  style={[
                    styles.itemTitle,
                    { color: Colors.primaryText },
                    isCompleted && styles.itemDone,
                  ]}
                  numberOfLines={1}
                >
                  {template.title}
                </Text>
                {template.specific_date && (
                  <View style={[styles.oneOffBadge, { backgroundColor: '#F59E0B18' }]}>
                    <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '700' }}>ONE-OFF</Text>
                  </View>
                )}
                {template.item_type === 'quantity' && (
                  <View style={styles.quantityWrap}>
                    {canCheck ? (
                      <TextInput
                        style={[styles.quantityInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                        value={quantity}
                        onChangeText={v => handleUpdateQuantity(template, v)}
                        onEndEditing={e => handleUpdateQuantity(template, e.nativeEvent.text)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.secondaryText + '60'}
                      />
                    ) : (
                      <Text style={[styles.quantityReadonly, { color: Colors.primaryText }]}>
                        {quantity || '—'}
                      </Text>
                    )}
                    <Text style={[styles.unitLabel, { color: Colors.secondaryText }]}>
                      {template.quantity_unit || ''}
                    </Text>
                  </View>
                )}
                {template.requires_photo && (
                  <Ionicons name="camera-outline" size={14} color="#3B82F6" />
                )}
              </View>
            );
          })}

          {/* Labor roles (read-only in live view) */}
          {laborRoles.length > 0 && (
            <View style={styles.laborSection}>
              <View style={styles.laborHeader}>
                <Ionicons name="people-outline" size={16} color="#10B981" />
                <Text style={[styles.laborLabel, { color: Colors.secondaryText }]}>Crew Roles</Text>
              </View>
              {laborRoles.map(role => (
                <View key={role.id} style={[styles.laborRow, { borderBottomColor: Colors.border }]}>
                  <Ionicons name="person-outline" size={14} color="#10B981" />
                  <Text style={[styles.laborName, { color: Colors.primaryText }]}>{role.role_name}</Text>
                  <View style={[styles.laborBadge, { backgroundColor: '#10B98118' }]}>
                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>x{role.default_quantity || 1}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingWrap: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: 4,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 12,
  },
  // Live checklist items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  itemDone: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  oneOffBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  quantityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quantityInput: {
    width: 50,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    borderBottomWidth: 1,
    paddingVertical: 2,
  },
  quantityReadonly: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  unitLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Labor roles in live view
  laborSection: {
    marginTop: 12,
    paddingTop: 8,
  },
  laborHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  laborLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  laborRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  laborName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  laborBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  // Edit mode
  editSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  editCardInput: {
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 4,
  },
  editToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  editToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editUnitInput: {
    fontSize: 13,
    fontWeight: '500',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    width: 80,
  },
  editDeleteBtn: {
    padding: 6,
    borderRadius: 8,
  },
  editRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editQtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editQtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editQtyValue: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
});
