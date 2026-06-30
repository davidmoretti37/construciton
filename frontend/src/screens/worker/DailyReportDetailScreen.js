import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDailyReportById } from '../../utils/storage';
import FullscreenPhotoViewer from '../../components/FullscreenPhotoViewer';
import { supabase } from '../../lib/supabase';

const ACCENT = '#1E40AF';

const WEATHER_ICONS = {
  sunny: 'sunny-outline',
  cloudy: 'cloud-outline',
  rain: 'rainy-outline',
  snow: 'snow-outline',
  wind: 'flag-outline',
};

export default function DailyReportDetailScreen({ navigation, route }) {
  const { t } = useTranslation('workers');
  const { report: passedReport, reportId } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [report, setReport] = useState(passedReport || null);
  const [loading, setLoading] = useState(!passedReport && !!reportId);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [checklistError, setChecklistError] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [laborItems, setLaborItems] = useState([]);

  useEffect(() => {
    if (!passedReport && reportId) loadReport();
  }, [reportId]);

  // Re-fetch the latest report whenever the screen regains focus so an edit made
  // elsewhere isn't masked by the snapshot captured at navigation time.
  useFocusEffect(
    useCallback(() => {
      const id = report?.id || reportId;
      if (id) loadReport(id);
    }, [report?.id, reportId])
  );

  // Load matching daily checklist entries
  useEffect(() => {
    if (report) loadChecklistData();
  }, [report]);

  const loadChecklistData = async () => {
    try {
      setChecklistError(false);
      const projectId = report.project_id;
      const servicePlanId = report.service_plan_id;
      const reportDate = report.report_date;
      if (!reportDate || (!projectId && !servicePlanId)) return;

      // daily_service_reports.reporter_id is the AUTH-USER id, but report.worker_id is
      // the workers-table PK — they are different namespaces. Resolve the author's auth
      // id from workers.user_id so we scope to the same author (worker reports) and a
      // sibling worker's report on the same project/date can't bleed into this view.
      // Owner/supervisor reports have worker_id null -> no extra scope (deterministic
      // ordering below still prevents non-determinism).
      let reporterAuthId = null;
      if (report.worker_id) {
        const { data: workerRow } = await supabase
          .from('workers')
          .select('user_id')
          .eq('id', report.worker_id)
          .single();
        reporterAuthId = workerRow?.user_id || null;
      }

      let query = supabase
        .from('daily_service_reports')
        .select('id')
        .eq('report_date', reportDate);
      if (projectId) query = query.eq('project_id', projectId);
      else query = query.eq('service_plan_id', servicePlanId);
      if (reporterAuthId) query = query.eq('reporter_id', reporterAuthId);

      const { data: serviceReports, error: srErr } = await query
        .order('created_at', { ascending: false })
        .limit(1);
      if (srErr) throw srErr;
      if (!serviceReports || serviceReports.length === 0) return;

      // Fetch entries for the matching report
      const { data: entries, error: entErr } = await supabase
        .from('daily_report_entries')
        .select('*')
        .eq('report_id', serviceReports[0].id)
        .order('sort_order', { ascending: true });
      if (entErr) throw entErr;

      if (entries) {
        setChecklistItems(entries.filter(e => e.entry_type === 'checklist'));
        setLaborItems(entries.filter(e => e.entry_type === 'labor'));
      }
    } catch (e) {
      setChecklistError(true);
    }
  };

  const loadReport = async (id = reportId) => {
    if (!id) return;
    try {
      setLoading(true);
      setLoadError(false);
      const data = await fetchDailyReportById(id);
      // fetchDailyReportById returns null both for a missing row and on a
      // network/permission failure; only overwrite an existing report when we
      // actually got data, and flag the failure so we can offer a retry.
      if (data) setReport(data);
      else if (!report) setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReport(report?.id || reportId);
    setRefreshing(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('dailyReportDetail.unknownDate');
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('dailyReportDetail.title')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('dailyReportDetail.title')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.secondaryText} />
          <Text style={[{ color: Colors.secondaryText, marginTop: 8 }]}>
            {loadError ? t('dailyReportDetail.errorCantLoad') : t('dailyReportDetail.errorNotFound')}
          </Text>
          {loadError && (
            <TouchableOpacity
              onPress={() => loadReport(reportId)}
              style={[styles.retryBtn, { borderColor: ACCENT }]}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={16} color={ACCENT} />
              <Text style={[styles.retryText, { color: ACCENT }]}>{t('dailyReportDetail.retry')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const photos = report.photos || [];
  const workDone = report.tags?.[0] || '';
  const weather = report.weather;
  const manpower = report.manpower || [];
  const materials = report.materials || [];
  const equipment = report.equipment || [];
  const delays = report.delays || [];
  const safety = report.safety;
  const visitors = report.visitors || [];
  const nextDayPlan = report.next_day_plan;

  const Section = ({ icon, title, children }) => (
    <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={ACCENT} />
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{title}</Text>
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          testID="dailyReportDetail.backButton"
          accessibilityLabel="dailyReportDetail.backButton"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: Colors.primaryText }]}
          testID="dailyReportDetail.headerTitle"
          accessibilityLabel="dailyReportDetail.headerTitle"
        >{t('dailyReportDetail.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >

        {/* Date & Project */}
        <View
          style={[styles.section, { backgroundColor: Colors.cardBackground }]}
          testID="dailyReportDetail.summaryCard"
          accessibilityLabel="dailyReportDetail.summaryCard"
        >
          <Text
            style={[styles.reportDate, { color: Colors.primaryText }]}
            testID="dailyReportDetail.reportDate"
            accessibilityLabel="dailyReportDetail.reportDate"
          >{formatDate(report.report_date)}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="briefcase-outline" size={16} color={Colors.secondaryText} />
            <Text
              style={[styles.infoText, { color: Colors.secondaryText }]}
              testID="dailyReportDetail.projectName"
              accessibilityLabel="dailyReportDetail.projectName"
            >{report.projects?.name || report._planName || (report.service_plan_id ? t('dailyReportDetail.servicePlan') : t('dailyReportDetail.unknownProject'))}</Text>
          </View>
          {report.workers?.full_name && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.infoText, { color: Colors.secondaryText }]}>{report.workers.full_name}{report.workers.trade ? ` · ${report.workers.trade}` : ''}</Text>
            </View>
          )}
        </View>

        {/* Weather */}
        {weather && weather.conditions && (
          <Section icon="partly-sunny-outline" title={t('dailyReportDetail.sectionWeather')}>
            <View style={styles.weatherDisplay}>
              <Ionicons name={WEATHER_ICONS[weather.conditions] || 'cloud-outline'} size={28} color={ACCENT} />
              <Text style={[styles.weatherText, { color: Colors.primaryText }]}>
                {weather.conditions.charAt(0).toUpperCase() + weather.conditions.slice(1)}
                {weather.temp ? ` · ${weather.temp}°F` : ''}
              </Text>
            </View>
          </Section>
        )}

        {/* Work Performed */}
        {workDone && (
          <Section icon="construct-outline" title={t('dailyReportDetail.sectionWorkPerformed')}>
            <Text style={[styles.bodyText, { color: Colors.primaryText }]}>{workDone}</Text>
          </Section>
        )}

        {/* Checklist/crew load failure indicator */}
        {checklistError && checklistItems.length === 0 && laborItems.length === 0 && (
          <View style={styles.inlineError}>
            <Ionicons name="cloud-offline-outline" size={14} color={Colors.secondaryText} />
            <Text style={[styles.inlineErrorText, { color: Colors.secondaryText }]}>{t('dailyReportDetail.checklistLoadError')}</Text>
          </View>
        )}

        {/* Daily Checklist */}
        {checklistItems.length > 0 && (
          <Section icon="checkbox-outline" title={t('dailyReportDetail.sectionDailyChecklist')}>
            {checklistItems.map((item, i) => (
              <View key={item.id || i} style={styles.checklistRow}>
                <Ionicons
                  name={item.completed ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={item.completed ? '#10B981' : Colors.secondaryText}
                />
                <Text style={[styles.checklistTitle, { color: Colors.primaryText }, item.completed && styles.checklistDone]}>
                  {item.title}
                </Text>
                {item.quantity != null && (
                  <Text style={[styles.checklistQty, { color: ACCENT }]}>
                    {item.quantity}{item.quantity_unit ? ` ${item.quantity_unit}` : ''}
                  </Text>
                )}
              </View>
            ))}
          </Section>
        )}

        {/* Crew */}
        {laborItems.length > 0 && (
          <Section icon="people-outline" title={t('dailyReportDetail.sectionCrew')}>
            {laborItems.map((item, i) => (
              <View key={item.id || i} style={styles.tableRow}>
                <Ionicons name="person-outline" size={14} color="#10B981" />
                <Text style={[styles.tableCell, { flex: 1, color: Colors.primaryText }]}>{item.title}</Text>
                <View style={[styles.crewBadge, { backgroundColor: '#10B98118' }]}>
                  <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>x{Math.round(item.quantity || 0)}</Text>
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <Section icon="images-outline" title={t('dailyReportDetail.sectionPhotos', { count: photos.length })}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((url, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => { setSelectedPhotoIndex(i); setPhotoModalVisible(true); }}
                  activeOpacity={0.8}
                  testID={i === 0 ? 'dailyReportDetail.viewPhotoButton' : undefined}
                  accessibilityLabel={i === 0 ? 'dailyReportDetail.viewPhotoButton' : undefined}
                >
                  <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Section>
        )}

        <FullscreenPhotoViewer
          photos={photos.map(url => ({ url }))}
          visible={photoModalVisible}
          initialIndex={selectedPhotoIndex || 0}
          onClose={() => { setPhotoModalVisible(false); setSelectedPhotoIndex(null); }}
        />

        {/* Manpower */}
        {manpower.length > 0 && (
          <Section icon="people-outline" title={t('dailyReportDetail.sectionManpower', { count: manpower.length })}>
            {manpower.map((m, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2, color: Colors.primaryText }]}>{m.name}</Text>
                <Text style={[styles.tableCell, { flex: 1, color: Colors.secondaryText }]}>{m.trade}</Text>
                <Text style={[styles.tableCell, { width: 50, textAlign: 'right', color: Colors.primaryText, fontWeight: '600' }]}>{m.hours ? `${m.hours}h` : '-'}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* Materials */}
        {materials.length > 0 && (
          <Section icon="cube-outline" title={t('dailyReportDetail.sectionMaterials', { count: materials.length })}>
            {materials.map((m, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1, color: Colors.primaryText }]}>{m.description}</Text>
                {m.quantity && <Text style={[styles.tableCell, { color: Colors.secondaryText }]}>{t('dailyReportDetail.qty', { quantity: m.quantity })}</Text>}
              </View>
            ))}
          </Section>
        )}

        {/* Equipment */}
        {equipment.length > 0 && (
          <Section icon="construct-outline" title={t('dailyReportDetail.sectionEquipment', { count: equipment.length })}>
            {equipment.map((e, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1, color: Colors.primaryText }]}>{e.name}</Text>
                {e.hours && <Text style={[styles.tableCell, { color: Colors.secondaryText }]}>{e.hours}h</Text>}
              </View>
            ))}
          </Section>
        )}

        {/* Delays */}
        {delays.length > 0 && (
          <Section icon="warning-outline" title={t('dailyReportDetail.sectionDelays', { count: delays.length })}>
            {delays.map((d, i) => (
              <View key={i} style={[styles.delayItem, { backgroundColor: '#FEF3C720' }]}>
                <Text style={[styles.bodyText, { color: Colors.primaryText }]}>{d.description}</Text>
                {d.reason && (
                  <View style={styles.delayReason}>
                    <Text style={styles.delayReasonText}>{t('dailyReportDetail.delayReason', { reason: d.reason })}</Text>
                  </View>
                )}
                {d.hours_lost && <Text style={[styles.delayHours, { color: '#EF4444' }]}>{t('dailyReportDetail.hoursLost', { hours: d.hours_lost })}</Text>}
              </View>
            ))}
          </Section>
        )}

        {/* Safety */}
        {safety && (safety.observations || safety.incidents) && (
          <Section icon="shield-checkmark-outline" title={t('dailyReportDetail.sectionSafety')}>
            {safety.observations && <Text style={[styles.bodyText, { color: Colors.primaryText }]}>{safety.observations}</Text>}
            {safety.incidents && <Text style={[styles.bodyText, { color: '#EF4444', marginTop: 4 }]}>{t('dailyReportDetail.incidents', { incidents: safety.incidents })}</Text>}
          </Section>
        )}

        {/* Visitors */}
        {visitors.length > 0 && (
          <Section icon="person-add-outline" title={t('dailyReportDetail.sectionVisitors', { count: visitors.length })}>
            {visitors.map((v, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1, color: Colors.primaryText, fontWeight: '500' }]}>{v.name}</Text>
                {v.purpose && <Text style={[styles.tableCell, { flex: 1, color: Colors.secondaryText }]}>{v.purpose}</Text>}
              </View>
            ))}
          </Section>
        )}

        {/* Tomorrow's Plan */}
        {nextDayPlan && (
          <Section icon="calendar-outline" title={t('dailyReportDetail.sectionTomorrowPlan')}>
            <Text style={[styles.bodyText, { color: Colors.primaryText }]}>{nextDayPlan}</Text>
          </Section>
        )}

        {/* Notes */}
        {report.notes && (
          <Section icon="document-text-outline" title={t('dailyReportDetail.sectionNotes')}>
            <Text style={[styles.bodyText, { color: Colors.secondaryText }]}>{report.notes}</Text>
          </Section>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  scrollContent: { padding: Spacing.lg, gap: 12 },

  // Date card
  reportDate: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  infoText: { fontSize: 14 },

  // Sections
  section: { borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },

  // Content
  bodyText: { fontSize: 14, lineHeight: 20 },

  // Weather
  weatherDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherText: { fontSize: 16, fontWeight: '600' },

  // Photos
  photo: { width: 160, height: 120, borderRadius: 10, marginRight: 8 },

  // Table rows
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  tableCell: { fontSize: 13 },

  // Delays
  delayItem: { padding: 10, borderRadius: 8, marginBottom: 6 },
  delayReason: { marginTop: 4 },
  delayReasonText: { fontSize: 12, fontWeight: '600', color: '#F59E0B' },
  delayHours: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Checklist
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  checklistTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  checklistDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  checklistQty: { fontSize: 14, fontWeight: '700' },

  // Crew
  crewBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  // Error states
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  retryText: { fontSize: 14, fontWeight: '600' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  inlineErrorText: { fontSize: 12 },
});
