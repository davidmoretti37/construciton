/**
 * BidRequestCreatorScreen — GC creates a professional bid package and
 * invites subs.
 *
 * 4 steps:
 *   1. Project + Trade        — what job, what trade
 *   2. Site & Attachments     — location for site walks, plans/photos/specs
 *   3. Scope of work          — AI-drafted, GC edits
 *   4. Pick subs + send       — multi-select invite
 *
 * Backend flow:
 *   - On step 2 we DON'T create the bid_request yet (no DB row until send).
 *   - Attachments are queued in memory while drafting.
 *   - On final "Send": POST /api/bid-requests → for each queued attachment
 *     POST /:id/attachments (base64 → storage) → POST /:id/invite.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, FlatList, Linking, Image, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';
import { supabase } from '../lib/supabase';

// Inline lightweight project fetch for the bid picker. The fetchProjects
// helper from projectService loads phases dynamically and breaks on a
// missing module — we don't need phases here, just id/name/address.
async function fetchProjectsForPicker() {
  // Don't filter by user_id — RLS already handles owner / supervisor /
  // worker / hierarchy access via user_can_access_project().
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, location, task_description, client_name, client_address, status')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[BidRequestCreator] fetchProjects error:', error.message);
    return [];
  }
  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    project_name: p.name,
    project_type: null,
    project_description: p.task_description,
    location: p.location,
    address: p.location || p.client_address,
    city: null,
    state_code: null,
    postal_code: null,
  }));
}

const SUB_VIOLET = '#8B5CF6';

const TRADES = [
  { key: 'plumbing',     label: 'Plumbing',      icon: 'water' },
  { key: 'electrical',   label: 'Electrical',    icon: 'flash' },
  { key: 'hvac',         label: 'HVAC',          icon: 'thermometer' },
  { key: 'carpentry',    label: 'Carpentry',     icon: 'hammer' },
  { key: 'crown_molding',label: 'Crown molding', icon: 'analytics' },
  { key: 'drywall',      label: 'Drywall',       icon: 'layers' },
  { key: 'painting',     label: 'Painting',      icon: 'color-palette' },
  { key: 'flooring',     label: 'Flooring',      icon: 'grid' },
  { key: 'tile',         label: 'Tile',          icon: 'apps' },
  { key: 'roofing',      label: 'Roofing',       icon: 'home' },
  { key: 'concrete',     label: 'Concrete',      icon: 'cube' },
  { key: 'landscaping',  label: 'Landscaping',   icon: 'leaf' },
  { key: 'pest_control', label: 'Pest control',  icon: 'bug' },
  { key: 'other',        label: 'Other',         icon: 'ellipsis-horizontal' },
];

const ATTACHMENT_TYPES = [
  { key: 'plan',  label: 'Plans / drawings',  icon: 'document-text' },
  { key: 'photo', label: 'Site photos',       icon: 'camera' },
  { key: 'spec',  label: 'Specs / details',   icon: 'reader' },
];

export default function BidRequestCreatorScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const presetProjectId = route?.params?.projectId || null;
  const presetSubOrgId  = route?.params?.subOrganizationId || null;

  const [step, setStep] = useState(1);
  const [projects, setProjects] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  // STEP 1
  const [projectId, setProjectId] = useState(presetProjectId);
  const [trade, setTrade] = useState(null);
  const [customTrade, setCustomTrade] = useState('');
  const [instructions, setInstructions] = useState('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // STEP 2 — site + attachments
  const [overrideSite, setOverrideSite] = useState(false);
  const [siteAddress, setSiteAddress] = useState('');
  const [siteCity, setSiteCity] = useState('');
  const [siteState, setSiteState] = useState('');
  const [sitePostal, setSitePostal] = useState('');
  const [siteVisitNotes, setSiteVisitNotes] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  // each item: { localId, uri, name, mime, size, base64, type, uploading? }

  // STEP 3 — scope
  const [scope, setScope] = useState('');
  const [scopeSource, setScopeSource] = useState(null);
  const [generating, setGenerating] = useState(false);

  // STEP 4 — subs
  const [selectedSubs, setSelectedSubs] = useState(presetSubOrgId ? [presetSubOrgId] : []);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projList, subList] = await Promise.all([
        fetchProjectsForPicker(),
        api.listSubs(),
      ]);
      setProjects(projList || []);
      setSubs(subList || []);
    } catch (e) {
      Alert.alert('Could not load', e.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId],
  );

  const tradeLabel = useMemo(() => {
    if (trade === 'other' && customTrade.trim()) return customTrade.trim();
    return TRADES.find((t) => t.key === trade)?.label || customTrade.trim() || '';
  }, [trade, customTrade]);

  // Auto-fill site fields from project once a project is picked.
  // Most projects only have a single `location` string — drop it into
  // siteAddress and leave the city/state/postal fields blank for the GC
  // to fill in via Override if needed.
  useEffect(() => {
    if (project && !overrideSite) {
      setSiteAddress(project.location || project.address || '');
      setSiteCity('');
      setSiteState('');
      setSitePostal('');
    }
  }, [project, overrideSite]);

  const canGoStep2 = !!projectId && !!tradeLabel;
  const canGoStep3 = canGoStep2;
  const canGoStep4 = !!scope.trim();

  // ─── Attachments ──────────────────────────────────────────────────
  const addPickedFile = async (file, type) => {
    if (!file?.uri) return;
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setPendingAttachments((prev) => [...prev, {
        localId: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        uri: file.uri,
        name: file.name || file.fileName || `attachment-${Date.now()}.${type === 'photo' ? 'jpg' : 'pdf'}`,
        mime: file.mimeType || (type === 'photo' ? 'image/jpeg' : 'application/pdf'),
        size: file.size || file.fileSize || null,
        base64,
        type,
      }]);
    } catch (e) {
      Alert.alert('Could not read file', e.message);
    }
  };

  // iOS only allows one document/image picker session at a time. Avoid using
  // a custom RN Modal as a chooser (it races with the system picker). For
  // photos we show a native Alert.alert action sheet; for docs we open the
  // system picker directly. pickerBusyRef guards against double-taps.
  const pickerBusyRef = useRef(false);

  const pickDocument = async (type) => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled) await addPickedFile(result.assets?.[0], type);
    } catch (e) {
      Alert.alert('Could not pick file', e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const takePhoto = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled) {
        const a = result.assets[0];
        await addPickedFile({
          uri: a.uri,
          name: `photo-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        }, 'photo');
      }
    } catch (e) {
      Alert.alert('Camera error', e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const pickFromLibrary = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (!result.canceled) await addPickedFile(result.assets?.[0], 'photo');
    } catch (e) {
      Alert.alert('Could not pick image', e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const promptPhotoSource = () => {
    Alert.alert(
      'Add a site photo',
      null,
      [
        { text: 'Take a photo', onPress: takePhoto },
        { text: 'Pick from library', onPress: pickFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const onAttachmentTypePress = (type) => {
    if (type === 'photo') promptPhotoSource();
    else pickDocument(type);
  };

  const removeAttachment = (localId) => {
    setPendingAttachments((prev) => prev.filter((a) => a.localId !== localId));
  };

  // ─── Scope ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!canGoStep2) return;
    setGenerating(true);
    try {
      const res = await api.generateBidScope({
        project_id: projectId,
        trade: tradeLabel,
        instructions: instructions.trim() || undefined,
      });
      setScope(res.scope_summary || '');
      setScopeSource(res.source || null);
    } catch (e) {
      Alert.alert('Could not generate scope', e.message || 'Try again');
    } finally {
      setGenerating(false);
    }
  };

  const goStep3 = async () => {
    setStep(3);
    if (!scope) await handleGenerate();
  };

  // ─── Subs ──────────────────────────────────────────────────────────
  const toggleSub = (id) => {
    setSelectedSubs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // ─── Map link ──────────────────────────────────────────────────────
  const fullSiteAddr = useMemo(() => {
    return [siteAddress, siteCity, siteState, sitePostal].filter(Boolean).join(', ');
  }, [siteAddress, siteCity, siteState, sitePostal]);

  const openMap = () => {
    if (!fullSiteAddr) return;
    const q = encodeURIComponent(fullSiteAddr);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  // ─── Send ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!scope.trim()) { Alert.alert('Add a scope', 'Scope of work is required.'); return; }
    if (selectedSubs.length === 0) {
      Alert.alert('Pick at least one sub', 'Choose who should receive this bid request.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        project_id: projectId,
        trade: tradeLabel,
        scope_summary: scope.trim(),
      };
      if (overrideSite || pendingAttachments.length > 0 || siteVisitNotes.trim()) {
        payload.site_address = siteAddress.trim() || null;
        payload.site_city = siteCity.trim() || null;
        payload.site_state_code = (siteState.trim() || '').toUpperCase() || null;
        payload.site_postal_code = sitePostal.trim() || null;
        payload.site_visit_notes = siteVisitNotes.trim() || null;
      }

      const { bid_request } = await api.createBidRequest(payload);

      // Upload attachments sequentially (low risk of hitting concurrency limits)
      for (const att of pendingAttachments) {
        try {
          await api.uploadBidAttachment(bid_request.id, {
            file_base64: att.base64,
            file_name: att.name,
            file_mime: att.mime,
            file_size_bytes: att.size,
            attachment_type: att.type,
          });
        } catch (e) {
          console.warn('Attachment upload failed:', att.name, e.message);
        }
      }

      await api.inviteSubsToBid(bid_request.id, selectedSubs);
      Alert.alert(
        'Bid package sent',
        `Sent to ${selectedSubs.length} sub${selectedSubs.length === 1 ? '' : 's'}. They'll see it in their portal with all attachments.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not send', e.message || 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Get bids</Text>
          <Text style={styles.headerSub}>Step {step} of 4</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.stepBar}>
        {[1, 2, 3, 4].map((n) => (
          <View
            key={n}
            style={[styles.stepDot, { backgroundColor: n <= step ? SUB_VIOLET : Colors.border }]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* STEP 1 — Project + trade */}
        {step === 1 && (
          <>
            <Text style={styles.label}>Project</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowProjectPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.inputText, !project && styles.inputPlaceholder]}>
                {project ? project.name || project.project_name || 'Untitled project' : 'Select a project'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: 18 }]}>Trade</Text>
            <View style={styles.tradeGrid}>
              {TRADES.map((t) => {
                const isActive = trade === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.tradeChip,
                      isActive && { backgroundColor: SUB_VIOLET, borderColor: SUB_VIOLET },
                    ]}
                    onPress={() => setTrade(t.key)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={t.icon} size={16} color={isActive ? '#fff' : Colors.primaryText} />
                    <Text style={[
                      styles.tradeChipText,
                      isActive && { color: '#fff', fontWeight: '700' },
                    ]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {trade === 'other' && (
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                placeholder="What trade?"
                placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                value={customTrade}
                onChangeText={setCustomTrade}
                autoCapitalize="words"
              />
            )}

            <Text style={[styles.label, { marginTop: 18 }]}>Specific notes (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              placeholder="Anything specific the sub should know — fixtures, timing, tricky access..."
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={instructions}
              onChangeText={setInstructions}
              multiline
            />

            <TouchableOpacity
              style={[styles.primaryBtn, !canGoStep2 && { opacity: 0.5 }]}
              onPress={() => setStep(2)}
              disabled={!canGoStep2}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 2 — Site & attachments */}
        {step === 2 && (
          <>
            <View style={styles.metaRow}>
              <Ionicons name="construct" size={18} color={SUB_VIOLET} />
              <Text style={styles.metaText} numberOfLines={1}>
                {tradeLabel} · {project?.name || project?.project_name}
              </Text>
            </View>

            {/* Site address */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.label}>Job site location</Text>
              <TouchableOpacity onPress={() => setOverrideSite((v) => !v)}>
                <Text style={styles.linkText}>{overrideSite ? 'Use project address' : 'Override'}</Text>
              </TouchableOpacity>
            </View>

            {!overrideSite ? (
              <View style={styles.siteCard}>
                <View style={styles.siteIconWrap}>
                  <Ionicons name="location" size={20} color={SUB_VIOLET} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.siteAddress} numberOfLines={2}>
                    {fullSiteAddr || 'No address on project — tap Override to set one'}
                  </Text>
                  {fullSiteAddr ? (
                    <TouchableOpacity onPress={openMap} style={styles.mapLinkRow}>
                      <Ionicons name="map" size={13} color={SUB_VIOLET} />
                      <Text style={styles.mapLink}>Open in maps</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.textInput}
                  placeholder="Street address"
                  placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                  value={siteAddress}
                  onChangeText={setSiteAddress}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[styles.textInput, { flex: 2 }]}
                    placeholder="City"
                    placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                    value={siteCity}
                    onChangeText={setSiteCity}
                  />
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    placeholder="ST"
                    placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                    value={siteState}
                    onChangeText={setSiteState}
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                  <TextInput
                    style={[styles.textInput, { flex: 1.2 }]}
                    placeholder="Zip"
                    placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                    value={sitePostal}
                    onChangeText={setSitePostal}
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}

            <Text style={[styles.label, { marginTop: 18 }]}>Site visit notes (optional)</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 64, textAlignVertical: 'top' }]}
              placeholder="e.g. Walk-throughs Tu/Th 2-4pm. Call John (555) 555-5555 to schedule."
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={siteVisitNotes}
              onChangeText={setSiteVisitNotes}
              multiline
            />

            {/* Attachments */}
            <Text style={[styles.label, { marginTop: 22 }]}>Attachments</Text>
            <Text style={styles.hint}>
              Plans, drawings, site photos, specs — anything the sub needs to price the job.
            </Text>

            <View style={styles.attachTypeRow}>
              {ATTACHMENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={styles.attachTypeBtn}
                  onPress={() => onAttachmentTypePress(t.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={t.icon} size={20} color={SUB_VIOLET} />
                  <Text style={styles.attachTypeLabel}>{t.label}</Text>
                  <Ionicons name="add" size={16} color={SUB_VIOLET} />
                </TouchableOpacity>
              ))}
            </View>

            {pendingAttachments.length > 0 && (
              <View style={{ marginTop: 8 }}>
                {pendingAttachments.map((a) => {
                  const isImage = a.mime?.startsWith('image/');
                  return (
                    <View key={a.localId} style={styles.attachItem}>
                      {isImage ? (
                        <Image source={{ uri: a.uri }} style={styles.attachThumb} />
                      ) : (
                        <View style={[styles.attachThumb, styles.attachThumbPdf]}>
                          <Ionicons name="document-text" size={22} color={SUB_VIOLET} />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.attachName} numberOfLines={1}>{a.name}</Text>
                        <Text style={styles.attachMeta}>
                          {ATTACHMENT_TYPES.find((t) => t.key === a.type)?.label || a.type}
                          {a.size ? ` · ${(a.size / 1024).toFixed(0)} KB` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeAttachment(a.localId)}>
                        <Ionicons name="close-circle" size={22} color={Colors.secondaryText} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(1)}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, !canGoStep3 && { opacity: 0.5 }]}
                onPress={goStep3}
                disabled={!canGoStep3}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Draft scope with AI</Text>
                <Ionicons name="sparkles" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* STEP 3 — Scope */}
        {step === 3 && (
          <>
            <View style={styles.metaRow}>
              <Ionicons name="construct" size={18} color={SUB_VIOLET} />
              <Text style={styles.metaText} numberOfLines={1}>
                {tradeLabel} · {project?.name || project?.project_name}
              </Text>
            </View>

            <View style={styles.scopeHeaderRow}>
              <Text style={styles.label}>Scope of work</Text>
              <TouchableOpacity onPress={handleGenerate} disabled={generating} activeOpacity={0.7}>
                {generating ? (
                  <ActivityIndicator size="small" color={SUB_VIOLET} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={14} color={SUB_VIOLET} />
                    <Text style={styles.linkText}>Regenerate</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {generating ? (
              <View style={[styles.scopeBox, styles.scopeLoading]}>
                <ActivityIndicator size="small" color={SUB_VIOLET} />
                <Text style={styles.scopeLoadingText}>Drafting your scope...</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={[styles.textInput, styles.scopeBox]}
                  multiline
                  value={scope}
                  onChangeText={setScope}
                  placeholder="Scope will appear here..."
                  placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                />
                {scopeSource === 'template' && (
                  <Text style={styles.hint}>
                    AI is offline — using a template. Edit freely.
                  </Text>
                )}
                {scopeSource === 'ai' && (
                  <Text style={styles.hint}>
                    Drafted by AI. Review and edit before sending.
                  </Text>
                )}
              </>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(2)}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, (!canGoStep4 || generating) && { opacity: 0.5 }]}
                onPress={() => setStep(4)}
                disabled={!canGoStep4 || generating}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Pick subs</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* STEP 4 — Subs + send */}
        {step === 4 && (
          <>
            <Text style={styles.label}>Send to</Text>
            <Text style={styles.hint}>
              Tap subs to add them. Each gets the full bid package — site address, attachments, scope.
            </Text>

            {subs.length === 0 ? (
              <View style={styles.emptySubs}>
                <Ionicons name="people-outline" size={32} color={Colors.secondaryText} />
                <Text style={styles.emptySubsText}>No subs added yet.</Text>
                <Text style={styles.emptySubsBody}>
                  Add subs from the Team tab first, then come back.
                </Text>
              </View>
            ) : (
              subs.map((s) => {
                const isSel = selectedSubs.includes(s.id);
                const tradesText = (s.trades || []).join(', ') || 'No trades set';
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.subCard,
                      isSel && { borderColor: SUB_VIOLET, backgroundColor: SUB_VIOLET + '10' },
                    ]}
                    onPress={() => toggleSub(s.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.subAvatar, { backgroundColor: isSel ? SUB_VIOLET : Colors.border }]}>
                      <Text style={[styles.subAvatarText, { color: isSel ? '#fff' : Colors.primaryText }]}>
                        {(s.legal_name || 'S').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.subName} numberOfLines={1}>{s.legal_name}</Text>
                      <Text style={styles.subMeta} numberOfLines={1}>{tradesText}</Text>
                    </View>
                    <View style={[
                      styles.checkbox,
                      isSel && { backgroundColor: SUB_VIOLET, borderColor: SUB_VIOLET },
                    ]}>
                      {isSel && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(3)}
                activeOpacity={0.7}
                disabled={submitting}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, (selectedSubs.length === 0 || submitting) && { opacity: 0.5 }]}
                onPress={handleSend}
                disabled={selectedSubs.length === 0 || submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>
                      Send to {selectedSubs.length || ''} sub{selectedSubs.length === 1 ? '' : 's'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Project picker modal */}
      <Modal visible={showProjectPicker} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick a project</Text>
              <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
                <Ionicons name="close" size={24} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>
            {projects.length === 0 ? (
              <Text style={[styles.hint, { padding: 18 }]}>
                No projects yet. Create one first, then come back.
              </Text>
            ) : (
              <FlatList
                data={projects}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.projectRow}
                    onPress={() => { setProjectId(item.id); setShowProjectPicker(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.projectName} numberOfLines={1}>
                        {item.name || item.project_name || 'Untitled project'}
                      </Text>
                      <Text style={styles.projectMeta} numberOfLines={1}>
                        {item.location || item.client_name || item.status || ''}
                      </Text>
                    </View>
                    {projectId === item.id && (
                      <Ionicons name="checkmark-circle" size={22} color={SUB_VIOLET} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  stepBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  stepDot: { flex: 1, height: 4, borderRadius: 2 },
  scroll: { padding: 18, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.secondaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  linkText: { fontSize: 13, fontWeight: '600', color: SUB_VIOLET },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.cardBackground,
  },
  inputText: { flex: 1, fontSize: 15, color: Colors.primaryText },
  inputPlaceholder: { color: Colors.secondaryText },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.primaryText,
    backgroundColor: Colors.cardBackground,
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  tradeChipText: { fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SUB_VIOLET,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 10,
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: Colors.primaryText, fontSize: 15, fontWeight: '600' },
  btnRow: { flexDirection: 'row' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
    backgroundColor: SUB_VIOLET + '10',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  metaText: { flex: 1, fontSize: 14, color: Colors.primaryText, fontWeight: '600' },
  siteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  siteIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: SUB_VIOLET + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  siteAddress: { fontSize: 14, color: Colors.primaryText, fontWeight: '500' },
  mapLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  mapLink: { fontSize: 12, fontWeight: '600', color: SUB_VIOLET },
  attachTypeRow: { gap: 8, marginTop: 8 },
  attachTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  attachTypeLabel: { flex: 1, fontSize: 14, color: Colors.primaryText, fontWeight: '500' },
  attachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  attachThumb: { width: 44, height: 44, borderRadius: 8 },
  attachThumbPdf: {
    backgroundColor: SUB_VIOLET + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachName: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  attachMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  scopeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scopeBox: { minHeight: 220, textAlignVertical: 'top' },
  scopeLoading: {
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40,
  },
  scopeLoadingText: { fontSize: 14, color: Colors.secondaryText },
  hint: { fontSize: 12, color: Colors.secondaryText, marginTop: 8 },
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: Colors.cardBackground,
  },
  subAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  subAvatarText: { fontSize: 15, fontWeight: '700' },
  subName: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  subMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptySubs: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    gap: 6,
    marginTop: 12,
  },
  emptySubsText: { fontSize: 15, fontWeight: '600', color: Colors.primaryText, marginTop: 8 },
  emptySubsBody: { fontSize: 13, color: Colors.secondaryText, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.primaryText },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  projectName: { fontSize: 15, fontWeight: '600', color: Colors.primaryText },
  projectMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryText, paddingHorizontal: 18, paddingBottom: 14 },
  pickerCancel: {
    marginTop: 10, marginHorizontal: 18,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  pickerCancelText: { color: Colors.primaryText, fontWeight: '600', fontSize: 15 },
});
