/**
 * BidResponseDetailScreen — GC views one bid invitation in full.
 *
 * Shows the bid request (project, trade, scope, site, due date), the sub's
 * response (amount, timeline, exclusions, notes, status), and ALL
 * attachments (both GC's and the sub's uploads, grouped by source).
 *
 * Tap any attachment to open in DocumentViewer; tap any photo to swipe
 * through the gallery.
 *
 * Route params: { bidRequestId, subOrgId }
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform, Image, Modal, FlatList, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

const SUB_VIOLET = '#8B5CF6';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function BidResponseDetailScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const bidRequestId = route?.params?.bidRequestId;
  const subOrgId     = route?.params?.subOrgId;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null); // { bid_request, my_bid, attachments, project }
  const [imageUrls, setImageUrls] = useState({});
  const [openingDocId, setOpeningDocId] = useState(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const [deciding, setDeciding] = useState(false);

  const onAccept = () => {
    if (!myBid?.id) return;
    Alert.alert(
      'Accept this bid?',
      `Award this job to ${data?.sub_organization?.legal_name || 'the sub'} for $${Number(myBid.amount).toLocaleString()}.`
        + ' All other submitted bids will be marked declined and a new active job will be created.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setDeciding(true);
            try {
              await api.acceptBid(bidRequestId, myBid.id);
              Alert.alert(
                'Bid accepted',
                'A new active job has been created. The sub has been notified.',
                [{ text: 'OK', onPress: () => navigation.goBack() }],
              );
            } catch (e) {
              Alert.alert('Could not accept', e.message || 'Try again.');
            } finally {
              setDeciding(false);
            }
          },
        },
      ],
    );
  };

  const onDecline = () => {
    if (!myBid?.id) return;
    Alert.alert(
      'Decline this bid?',
      'The sub will be notified that their bid was not accepted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setDeciding(true);
            try {
              await api.declineBid(bidRequestId, myBid.id);
              await load();
            } catch (e) {
              Alert.alert('Could not decline', e.message || 'Try again.');
            } finally {
              setDeciding(false);
            }
          },
        },
      ],
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Reuse the bid-history endpoint and pick the matching one.
      const list = await api.listBidHistoryForSub(subOrgId);
      const match = list.find((br) => br.id === bidRequestId);
      if (!match) throw new Error('Bid request not found');
      setData(match);

      // Prefetch image URLs so the gallery opens instantly
      const photos = (match.attachments || []).filter((a) =>
        a.attachment_type === 'photo' || (a.file_mime || '').startsWith('image/'));
      const urlMap = {};
      await Promise.all(photos.map(async (p) => {
        try {
          const r = await api.getBidAttachmentSignedUrl(bidRequestId, p.id);
          if (r?.url) urlMap[p.id] = r.url;
        } catch (_) { /* ignore */ }
      }));
      setImageUrls(urlMap);
    } catch (e) {
      Alert.alert('Could not load', e.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }, [bidRequestId, subOrgId]);

  useEffect(() => { load(); }, [load]);

  const br = data;
  const myBid = data?.my_bid;
  const attachments = data?.attachments || [];

  const photos = useMemo(() =>
    attachments.filter((a) => a.attachment_type === 'photo' || (a.file_mime || '').startsWith('image/')),
  [attachments]);

  const docs = useMemo(() =>
    attachments.filter((a) => !photos.includes(a)),
  [attachments, photos]);

  const gcDocs = docs.filter((a) => a.uploaded_by_role !== 'sub');
  const subDocs = docs.filter((a) => a.uploaded_by_role === 'sub');
  const gcPhotos = photos.filter((a) => a.uploaded_by_role !== 'sub');
  const subPhotos = photos.filter((a) => a.uploaded_by_role === 'sub');

  const siteAddress = useMemo(() => {
    if (!br) return '';
    const parts = [
      br.site_address || br.project?.location,
      br.site_city,
      br.site_state_code,
      br.site_postal_code,
    ].filter(Boolean);
    return parts.join(', ');
  }, [br]);

  const openMap = () => {
    if (!siteAddress) return;
    const q = encodeURIComponent(siteAddress);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  const onOpenDoc = async (att) => {
    if (!att?.id || openingDocId) return;
    setOpeningDocId(att.id);
    try {
      const res = await api.getBidAttachmentSignedUrl(bidRequestId, att.id);
      if (!res?.url) throw new Error('No URL');
      const ext = (att.file_name || '').split('.').pop()?.toLowerCase();
      const isPDF = (att.file_mime || '').includes('pdf') || ext === 'pdf';
      const isImage = (att.file_mime || '').startsWith('image/') ||
        ['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext);
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: att.file_name || 'Attachment',
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again.');
    } finally {
      setOpeningDocId(null);
    }
  };

  const openGallery = (allPhotos, index) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </SafeAreaView>
    );
  }
  if (!br) return null;

  const allPhotos = [...gcPhotos, ...subPhotos];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{br.trade}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {br.project?.name || 'Project'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { backgroundColor: pill(myBid?.status || br.status).bg }]}>
            <Text style={[styles.statusText, { color: pill(myBid?.status || br.status).fg }]}>
              {pill(myBid?.status || br.status).label}
            </Text>
          </View>
          {br.due_at && (
            <Text style={styles.metaText}>Due {new Date(br.due_at).toLocaleDateString()}</Text>
          )}
        </View>

        {/* Sub's response — top of fold if submitted */}
        {myBid && myBid.status !== 'withdrawn' ? (
          <>
            <View style={styles.responseCard}>
              <Text style={styles.label}>Sub's response</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountValue}>${Number(myBid.amount).toLocaleString()}</Text>
                {myBid.timeline_days != null ? (
                  <Text style={styles.amountMeta}>{myBid.timeline_days} days</Text>
                ) : null}
              </View>
              {myBid.exclusions ? (
                <>
                  <Text style={styles.fieldLabel}>Exclusions</Text>
                  <Text style={styles.fieldValue}>{myBid.exclusions}</Text>
                </>
              ) : null}
              {myBid.notes ? (
                <>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <Text style={styles.fieldValue}>{myBid.notes}</Text>
                </>
              ) : null}
              {myBid.submitted_at ? (
                <Text style={styles.timestamp}>
                  Submitted {new Date(myBid.submitted_at).toLocaleDateString()}
                </Text>
              ) : null}
            </View>

            {/* Accept / Decline */}
            {myBid.status === 'submitted' && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.declineBtn, deciding && { opacity: 0.5 }]}
                  onPress={onDecline}
                  disabled={deciding}
                  activeOpacity={0.7}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.acceptBtn, deciding && { opacity: 0.5 }]}
                  onPress={onAccept}
                  disabled={deciding}
                  activeOpacity={0.85}
                >
                  {deciding ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.acceptBtnText}>Accept bid</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {myBid.status === 'accepted' && (
              <View style={styles.acceptedBanner}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.acceptedText}>You accepted this bid. An active job was created.</Text>
              </View>
            )}
            {myBid.status === 'declined' && (
              <View style={styles.acceptedBanner}>
                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.acceptedText}>You declined this bid.</Text>
              </View>
            )}

            {/* Sub's attachments — shown DIRECTLY under their bid response so the
                GC sees them at the same time as the amount. GC's own bid
                attachments stay further down as reference material. */}
            {subPhotos.length > 0 && (
              <Section title="Photos from sub" Colors={Colors}>
                <PhotoStrip
                  photos={subPhotos}
                  urls={imageUrls}
                  onTap={(idx) => openGallery(allPhotos, gcPhotos.length + idx)}
                  styles={styles}
                />
              </Section>
            )}
            {subDocs.length > 0 && (
              <Section title="Documents from sub" Colors={Colors}>
                {subDocs.map((a) => (
                  <DocRow
                    key={a.id}
                    a={a}
                    onPress={() => onOpenDoc(a)}
                    isLoading={openingDocId === a.id}
                    styles={styles}
                    Colors={Colors}
                  />
                ))}
              </Section>
            )}
          </>
        ) : (
          <View style={styles.awaitingCard}>
            <Ionicons name="time-outline" size={20} color={Colors.secondaryText} />
            <Text style={styles.awaitingText}>
              {myBid?.status === 'withdrawn'
                ? 'Sub declined this invitation.'
                : 'Sub hasn\'t responded yet.'}
            </Text>
          </View>
        )}

        {/* Site */}
        {siteAddress ? (
          <Section title="Job site" Colors={Colors}>
            <TouchableOpacity style={styles.rowCard} onPress={openMap} activeOpacity={0.7}>
              <Ionicons name="location-outline" size={20} color={Colors.primaryText} />
              <Text style={styles.rowCardText}>{siteAddress}</Text>
              <Ionicons name="map-outline" size={16} color={Colors.secondaryText} />
            </TouchableOpacity>
          </Section>
        ) : null}

        {/* Site visit notes */}
        {br.site_visit_notes ? (
          <Section title="Site visit" Colors={Colors}>
            <View style={styles.rowCard}>
              <Text style={[styles.rowCardText, { marginLeft: 0 }]}>{br.site_visit_notes}</Text>
            </View>
          </Section>
        ) : null}

        {/* Scope */}
        <Section title="Scope of work" Colors={Colors}>
          <View style={styles.rowCard}>
            <Text style={[styles.scopeText, { marginLeft: 0 }]}>{br.scope_summary}</Text>
          </View>
        </Section>

        {/* Photos from GC */}
        {gcPhotos.length > 0 && (
          <Section title="Site photos (sent by you)" Colors={Colors}>
            <PhotoStrip
              photos={gcPhotos}
              urls={imageUrls}
              onTap={(idx) => openGallery(allPhotos, idx)}
              styles={styles}
            />
          </Section>
        )}

        {/* Documents from GC */}
        {gcDocs.length > 0 && (
          <Section title="Documents (sent by you)" Colors={Colors}>
            {gcDocs.map((a) => (
              <DocRow
                key={a.id}
                a={a}
                onPress={() => onOpenDoc(a)}
                isLoading={openingDocId === a.id}
                styles={styles}
                Colors={Colors}
              />
            ))}
          </Section>
        )}


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
              {galleryIndex + 1} / {allPhotos.length}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <FlatList
            data={allPhotos}
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
          {allPhotos[galleryIndex]?.file_name ? (
            <Text style={galleryStyles.caption} numberOfLines={2}>
              {allPhotos[galleryIndex].file_name}
            </Text>
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
        fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 0.5, color: Colors.secondaryText, marginBottom: 10,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function PhotoStrip({ photos, urls, onTap, styles }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {photos.map((a, idx) => (
        <TouchableOpacity key={a.id} onPress={() => onTap(idx)} activeOpacity={0.85}>
          {urls[a.id] ? (
            <Image source={{ uri: urls[a.id] }} style={styles.photoTile} resizeMode="cover" />
          ) : (
            <View style={styles.photoTile}>
              <ActivityIndicator color="#9CA3AF" />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function DocRow({ a, onPress, isLoading, styles, Colors }) {
  return (
    <TouchableOpacity style={styles.rowCard} onPress={onPress} disabled={isLoading} activeOpacity={0.7}>
      <Ionicons name="document-text-outline" size={20} color={Colors.primaryText} />
      <View style={{ flex: 1, marginLeft: 4 }}>
        <Text style={styles.rowCardText} numberOfLines={1}>{a.file_name}</Text>
        {a.file_size_bytes ? (
          <Text style={styles.rowCardSub}>{(a.file_size_bytes / 1024).toFixed(0)} KB</Text>
        ) : null}
      </View>
      {isLoading
        ? <ActivityIndicator size="small" color={Colors.secondaryText} />
        : <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />}
    </TouchableOpacity>
  );
}

function pill(status) {
  switch (status) {
    case 'submitted': return { label: 'Submitted', bg: '#3B82F615', fg: '#3B82F6' };
    case 'accepted':  return { label: 'Accepted',  bg: '#10B98115', fg: '#10B981' };
    case 'declined':
    case 'rejected':  return { label: 'Declined',  bg: '#DC262615', fg: '#DC2626' };
    case 'withdrawn': return { label: 'Withdrawn', bg: '#6B728015', fg: '#6B7280' };
    case 'open':      return { label: 'Awaiting',  bg: '#F59E0B15', fg: '#F59E0B' };
    case 'closed':    return { label: 'Closed',    bg: '#6B728015', fg: '#6B7280' };
    case 'cancelled': return { label: 'Cancelled', bg: '#6B728015', fg: '#6B7280' };
    default:          return { label: status || '—', bg: '#6B728015', fg: '#6B7280' };
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primaryText, textTransform: 'capitalize' },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  scroll: { padding: 18, paddingBottom: 40 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaText: { fontSize: 13, color: Colors.secondaryText },
  responseCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  label: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 6 },
  amountValue: { fontSize: 32, fontWeight: '700', color: Colors.primaryText },
  amountMeta: { fontSize: 14, color: Colors.secondaryText, fontWeight: '500' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 4 },
  fieldValue: { fontSize: 14, color: Colors.primaryText, lineHeight: 20 },
  timestamp: { fontSize: 11, color: Colors.secondaryText, marginTop: 14 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  declineBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  acceptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 12,
  },
  acceptedText: { fontSize: 13, color: Colors.primaryText, flex: 1 },
  awaitingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  awaitingText: { fontSize: 14, color: Colors.primaryText },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowCardText: { flex: 1, fontSize: 14, color: Colors.primaryText, lineHeight: 20 },
  rowCardSub: { fontSize: 11, color: Colors.secondaryText, marginTop: 2 },
  scopeText: { fontSize: 14, color: Colors.primaryText, lineHeight: 21 },
  photoTile: {
    width: 120, height: 90, borderRadius: 10,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center', justifyContent: 'center',
  },
});
