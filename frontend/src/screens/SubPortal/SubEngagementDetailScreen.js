/**
 * SubEngagementDetailScreen — sub's view of an awarded job.
 *
 * Visual aesthetic mirrors BidResponseDetailScreen (neutral cards,
 * status pill, swipeable photo gallery, doc list with tap-to-view).
 *
 * Sections:
 *   - Hero (trade chip, project, GC, accepted, contract amount)
 *   - Status pill
 *   - Schedule card (mobilization → completion, map link)
 *   - Scope of work
 *   - Tasks (assigned by GC / Foreman, with mark-complete)
 *   - Job package (3 doc surfaces: contractor's bid attachments,
 *     project docs the GC marked visible, sub's own deliverables)
 *   - Payment terms
 *
 * Route params: { engagementId }
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform, Image, Modal, FlatList, Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';

const SUB_VIOLET = '#8B5CF6';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function SubEngagementDetailScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const engagementId = route?.params?.engagementId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pkg, setPkg] = useState(null);
  const [imageUrls, setImageUrls] = useState({});
  const [openingDocId, setOpeningDocId] = useState(null);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const load = useCallback(async () => {
    if (!engagementId) return;
    try {
      const data = await api.getEngagementDetail(engagementId);
      setPkg(data);

      // Prefetch URLs for photo attachments
      const photos = (data?.bid_attachments || []).filter((a) =>
        a.attachment_type === 'photo' || (a.file_mime || '').startsWith('image/'));
      const urlMap = {};
      await Promise.all(photos.map(async (p) => {
        try {
          const r = await api.getEngagementBidAttachmentUrl(engagementId, p.id);
          if (r?.url) urlMap[p.id] = r.url;
        } catch (_) { /* ignore */ }
      }));
      setImageUrls(urlMap);
    } catch (e) {
      Alert.alert('Could not load', e.message || 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const e = pkg?.engagement;
  const bidAttachments = pkg?.bid_attachments || [];
  const projectDocs = pkg?.project_documents || [];
  const subDeliverables = pkg?.sub_deliverables || [];
  const tasks = pkg?.tasks || [];

  const photos = useMemo(
    () => bidAttachments.filter((a) =>
      a.attachment_type === 'photo' || (a.file_mime || '').startsWith('image/')),
    [bidAttachments],
  );
  const docs = useMemo(
    () => bidAttachments.filter((a) => !photos.includes(a)),
    [bidAttachments, photos],
  );

  const siteAddress = useMemo(() => {
    if (!e) return '';
    return e.project?.location || '';
  }, [e]);

  const startDate = e?.mobilization_date || e?.contracted_at || e?.awarded_at || e?.project?.start_date;
  const endDate = e?.completion_target_date || e?.completed_at || e?.project?.end_date;

  const fmtDate = (s) => s
    ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const openMap = () => {
    if (!siteAddress) return;
    const q = encodeURIComponent(siteAddress);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  // Doc opening: bid attachment (photos open in gallery, docs in DocumentViewer);
  // project doc opens in DocumentViewer; sub deliverables open via compliance signed-url.
  const openBidAttachment = async (att) => {
    if (!att?.id || openingDocId) return;
    if ((att.file_mime || '').startsWith('image/') || att.attachment_type === 'photo') {
      // open gallery
      const idx = photos.findIndex((p) => p.id === att.id);
      if (idx >= 0) {
        setGalleryIndex(idx);
        setGalleryOpen(true);
      }
      return;
    }
    setOpeningDocId(att.id);
    try {
      const res = await api.getEngagementBidAttachmentUrl(engagementId, att.id);
      if (!res?.url) throw new Error('No URL');
      const ext = (att.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = (att.file_mime || '').includes('pdf') || ext === 'pdf';
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: att.file_name || 'Attachment',
        fileType: isPDF ? 'pdf' : 'document',
      });
    } catch (err) {
      Alert.alert('Could not open', err.message || 'Try again');
    } finally {
      setOpeningDocId(null);
    }
  };

  const openProjectDoc = async (doc) => {
    if (!doc?.id || openingDocId) return;
    setOpeningDocId(doc.id);
    try {
      const res = await api.getEngagementProjectDocUrl(engagementId, doc.id);
      if (!res?.url) throw new Error('No URL');
      const ext = (doc.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = (doc.file_type || '').includes('pdf') || ext === 'pdf';
      const isImage = ['jpg','jpeg','png','gif','webp','heic'].includes(ext);
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: doc.title || doc.file_name || 'Document',
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (err) {
      Alert.alert('Could not open', err.message || 'Try again');
    } finally {
      setOpeningDocId(null);
    }
  };

  const openSubDeliverable = async (d) => {
    if (!d?.id || openingDocId) return;
    setOpeningDocId(d.id);
    try {
      const res = await api.getDocumentSignedUrl(d.id);
      if (!res?.url) throw new Error('No URL');
      const ext = (d.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = (d.file_mime || '').includes('pdf') || ext === 'pdf';
      const isImage = (d.file_mime || '').startsWith('image/');
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: d.file_name || d.doc_type,
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (err) {
      Alert.alert('Could not open', err.message || 'Try again');
    } finally {
      setOpeningDocId(null);
    }
  };

  const toggleTask = async (task) => {
    setUpdatingTaskId(task.id);
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await api.updateTask(task.id, { status: newStatus });
      await load();
    } catch (err) {
      Alert.alert('Could not update task', err.message || 'Try again');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </SafeAreaView>
    );
  }
  if (!e) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="alert-circle-outline" size={42} color={Colors.errorRed || '#DC2626'} />
        <Text style={styles.errorTitle}>Job not found</Text>
        <Text style={styles.errorBody}>This engagement may have been cancelled.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.primaryBtn, { paddingHorizontal: 32, marginTop: 20 }]}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const docTotal = bidAttachments.length + projectDocs.length + subDeliverables.length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{e.trade}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {e.project?.name || 'Job'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.secondaryText} />}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.tradeChip}>
            <Ionicons name="briefcase" size={13} color={SUB_VIOLET} />
            <Text style={styles.tradeChipText}>{e.trade}</Text>
          </View>
          <Text style={styles.projectName} numberOfLines={2}>
            {e.project?.name || 'Project'}
          </Text>
          {e.gc_business_name ? (
            <Text style={styles.gcName}>For {e.gc_business_name}</Text>
          ) : null}

          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: pill(e.status).bg }]}>
              <Text style={[styles.statusText, { color: pill(e.status).fg }]}>
                {pill(e.status).label}
              </Text>
            </View>
            {e.contract_amount ? (
              <Text style={styles.heroAmount}>
                ${Number(e.contract_amount).toLocaleString()}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Schedule */}
        <Section title="Schedule" Colors={Colors}>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleLabelWrap}>
                <Text style={styles.scheduleLabelTop}>Start</Text>
                <Text style={styles.scheduleDate}>
                  {fmtDate(startDate) || <Text style={styles.scheduleDatePending}>To be set</Text>}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={Colors.secondaryText} style={{ marginHorizontal: 14 }} />
              <View style={styles.scheduleLabelWrap}>
                <Text style={styles.scheduleLabelTop}>End</Text>
                <Text style={styles.scheduleDate}>
                  {fmtDate(endDate) || <Text style={styles.scheduleDatePending}>To be set</Text>}
                </Text>
              </View>
            </View>
            {siteAddress ? (
              <TouchableOpacity style={styles.locationRow} onPress={openMap} activeOpacity={0.7}>
                <Ionicons name="location-outline" size={16} color={Colors.secondaryText} />
                <Text style={styles.locationText} numberOfLines={1}>{siteAddress}</Text>
                <Ionicons name="map-outline" size={14} color={SUB_VIOLET} />
              </TouchableOpacity>
            ) : null}
          </View>
        </Section>

        {/* Scope */}
        {e.scope_summary ? (
          <Section title="Scope of work" Colors={Colors}>
            <View style={styles.rowCard}>
              <Text style={styles.scopeText}>{e.scope_summary}</Text>
            </View>
          </Section>
        ) : null}

        {/* Tasks */}
        {tasks.length > 0 ? (
          <Section title="Tasks" Colors={Colors}>
            {tasks.map((t) => {
              const done = t.status === 'completed';
              const updating = updatingTaskId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.taskCard}
                  activeOpacity={0.7}
                  onPress={() => toggleTask(t)}
                  disabled={updating}
                >
                  <View style={[styles.checkBox, done && styles.checkBoxDone]}>
                    {updating ? (
                      <ActivityIndicator size="small" color={Colors.secondaryText} />
                    ) : done ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskTitle, done && { textDecorationLine: 'line-through', color: Colors.secondaryText }]} numberOfLines={2}>
                      {t.title}
                    </Text>
                    {t.description ? (
                      <Text style={styles.taskDesc} numberOfLines={2}>{t.description}</Text>
                    ) : null}
                    {(t.start_date || t.end_date) ? (
                      <Text style={styles.taskDates}>
                        {fmtDate(t.start_date) || '?'}{t.end_date ? ` → ${fmtDate(t.end_date)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Section>
        ) : null}

        {/* Job package */}
        {docTotal > 0 ? (
          <Section title="Job package" Colors={Colors}>
            {/* Photo gallery preview */}
            {photos.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.subLabel}>Site photos</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {photos.map((p, idx) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setGalleryIndex(idx); setGalleryOpen(true); }}
                      activeOpacity={0.85}
                    >
                      {imageUrls[p.id] ? (
                        <Image source={{ uri: imageUrls[p.id] }} style={styles.photoTile} resizeMode="cover" />
                      ) : (
                        <View style={styles.photoTile}>
                          <ActivityIndicator color={Colors.secondaryText} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Bid attachment docs */}
            {docs.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.subLabel}>From contractor (bid)</Text>
                {docs.map((a) => (
                  <DocRow
                    key={a.id}
                    title={a.file_name}
                    subtitle={a.file_size_bytes ? `${(a.file_size_bytes / 1024).toFixed(0)} KB` : null}
                    onPress={() => openBidAttachment(a)}
                    loading={openingDocId === a.id}
                    Colors={Colors}
                    styles={styles}
                  />
                ))}
              </View>
            ) : null}

            {/* Project documents */}
            {projectDocs.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.subLabel}>From contractor (project)</Text>
                {projectDocs.map((d) => (
                  <DocRow
                    key={d.id}
                    title={d.title || d.file_name}
                    subtitle={d.is_important ? 'Important' : null}
                    important={d.is_important}
                    onPress={() => openProjectDoc(d)}
                    loading={openingDocId === d.id}
                    Colors={Colors}
                    styles={styles}
                  />
                ))}
              </View>
            ) : null}

            {/* Sub deliverables */}
            {subDeliverables.length > 0 ? (
              <View>
                <Text style={styles.subLabel}>My uploads</Text>
                {subDeliverables.map((d) => (
                  <DocRow
                    key={d.id}
                    title={d.file_name || d.doc_type}
                    subtitle={d.doc_type}
                    onPress={() => openSubDeliverable(d)}
                    loading={openingDocId === d.id}
                    Colors={Colors}
                    styles={styles}
                  />
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* Payment terms */}
        {e.payment_terms ? (
          <Section title="Payment" Colors={Colors}>
            <View style={styles.rowCard}>
              <Text style={styles.paymentTermsText}>
                {(e.payment_terms || '').replace(/_/g, ' ')}
                {e.retention_pct ? `  ·  ${e.retention_pct}% retention` : ''}
              </Text>
              {e.payment_terms_notes ? (
                <Text style={styles.paymentNotes}>{e.payment_terms_notes}</Text>
              ) : null}
            </View>
          </Section>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Photo gallery */}
      <Modal visible={galleryOpen} transparent={false} animationType="fade" onRequestClose={() => setGalleryOpen(false)}>
        <View style={galleryStyles.root}>
          <View style={galleryStyles.header}>
            <TouchableOpacity onPress={() => setGalleryOpen(false)} style={galleryStyles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={galleryStyles.headerText}>
              {galleryIndex + 1} / {photos.length}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={galleryIndex}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            onMomentumScrollEnd={(ev) => {
              setGalleryIndex(Math.round(ev.nativeEvent.contentOffset.x / SCREEN_W));
            }}
            renderItem={({ item }) => (
              <View style={galleryStyles.slide}>
                {imageUrls[item.id] ? (
                  <Image source={{ uri: imageUrls[item.id] }} style={galleryStyles.image} resizeMode="contain" />
                ) : (
                  <ActivityIndicator color="#fff" size="large" />
                )}
              </View>
            )}
          />
          {photos[galleryIndex]?.file_name ? (
            <Text style={galleryStyles.caption} numberOfLines={2}>{photos[galleryIndex].file_name}</Text>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children, Colors }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{
        fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 0.5, color: Colors.secondaryText, marginBottom: 10,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function DocRow({ title, subtitle, important, onPress, loading, Colors, styles }) {
  return (
    <TouchableOpacity style={styles.docRow} onPress={onPress} disabled={loading} activeOpacity={0.7}>
      <View style={styles.docIconWrap}>
        <Ionicons name="document-text-outline" size={18} color={Colors.primaryText} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.docTitle} numberOfLines={1}>{title}</Text>
          {important ? (
            <View style={styles.importantBadge}>
              <Text style={styles.importantBadgeText}>Important</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.docMeta}>{subtitle}</Text> : null}
      </View>
      {loading
        ? <ActivityIndicator size="small" color={Colors.secondaryText} />
        : <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />}
    </TouchableOpacity>
  );
}

function pill(status) {
  switch (status) {
    case 'awarded':                return { label: 'Awarded',                bg: '#3B82F615', fg: '#3B82F6' };
    case 'contracted':             return { label: 'Contracted',             bg: '#0EA5E915', fg: '#0EA5E9' };
    case 'mobilized':              return { label: 'Mobilized',              bg: '#10B98115', fg: '#10B981' };
    case 'in_progress':            return { label: 'In progress',            bg: '#10B98115', fg: '#10B981' };
    case 'substantially_complete': return { label: 'Substantially complete', bg: '#10B98115', fg: '#10B981' };
    case 'closed_out':             return { label: 'Closed out',             bg: '#6B728015', fg: '#6B7280' };
    case 'cancelled':              return { label: 'Cancelled',              bg: '#DC262615', fg: '#DC2626' };
    default:                       return { label: status || '—',           bg: '#6B728015', fg: '#6B7280' };
  }
}

const galleryStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 50, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  closeBtn: { padding: 6, width: 40 },
  headerText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  slide: { width: SCREEN_W, alignItems: 'center', justifyContent: 'center' },
  image: { width: SCREEN_W, height: SCREEN_H * 0.78 },
  caption: {
    color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center',
    paddingHorizontal: 18, paddingVertical: 14, backgroundColor: 'rgba(0,0,0,0.85)',
  },
});

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primaryText, textTransform: 'capitalize' },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },

  heroCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  tradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: SUB_VIOLET + '15',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, alignSelf: 'flex-start',
  },
  tradeChipText: { color: SUB_VIOLET, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  projectName: { fontSize: 22, fontWeight: '700', color: Colors.primaryText, marginTop: 12 },
  gcName: { fontSize: 13, color: Colors.secondaryText, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  heroAmount: { fontSize: 18, fontWeight: '700', color: Colors.primaryText },

  scheduleCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  scheduleRow: { flexDirection: 'row', alignItems: 'center' },
  scheduleLabelWrap: { flex: 1 },
  scheduleLabelTop: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  scheduleDate: { fontSize: 15, fontWeight: '600', color: Colors.primaryText, marginTop: 4 },
  scheduleDatePending: { color: Colors.secondaryText, fontStyle: 'italic', fontWeight: '400' },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  locationText: { flex: 1, fontSize: 13, color: Colors.primaryText },

  rowCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  scopeText: { fontSize: 14, color: Colors.primaryText, lineHeight: 21 },

  taskCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
    gap: 12,
  },
  checkBox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkBoxDone: { backgroundColor: SUB_VIOLET, borderColor: SUB_VIOLET },
  taskTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText, lineHeight: 19 },
  taskDesc: { fontSize: 12, color: Colors.secondaryText, marginTop: 4, lineHeight: 17 },
  taskDates: { fontSize: 11, color: Colors.secondaryText, marginTop: 4, fontWeight: '500' },

  subLabel: { fontSize: 11, fontWeight: '600', color: Colors.secondaryText, marginBottom: 6 },
  photoTile: {
    width: 120, height: 90, borderRadius: 10,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  docRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  docIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  docTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText, flexShrink: 1 },
  docMeta: { fontSize: 11, color: Colors.secondaryText, marginTop: 2 },
  importantBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#F59E0B15', borderRadius: 4,
  },
  importantBadgeText: { fontSize: 9, fontWeight: '700', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.3 },

  paymentTermsText: { fontSize: 14, color: Colors.primaryText, fontWeight: '500', textTransform: 'capitalize' },
  paymentNotes: { fontSize: 12, color: Colors.secondaryText, marginTop: 6, lineHeight: 17 },

  primaryBtn: {
    backgroundColor: SUB_VIOLET, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.primaryText, marginTop: 14 },
  errorBody: { fontSize: 13, color: Colors.secondaryText, marginTop: 6, textAlign: 'center' },
});
