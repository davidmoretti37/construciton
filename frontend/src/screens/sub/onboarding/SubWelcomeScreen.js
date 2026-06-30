/**
 * SubWelcomeScreen
 *
 * Sub onboarding entry — looks up an invitation by the user's email via
 * /api/sub-portal/check-invite. If one exists, shows "Accept invitation
 * from {legal_name}" with an Accept button. On accept, links the
 * sub_organization to this auth user, sets profiles.is_onboarded=true, and
 * lets App.js route them into SubPortalScreen.
 *
 * If no invite exists, shows a "Waiting for invitation" message with
 * Refresh and Back-to-role-selection buttons.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { supabase } from '../../../lib/supabase';
import { API_URL } from '../../../config/api';

const SUB_VIOLET = '#8B5CF6';

export default function SubWelcomeScreen() {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { user, refreshProfile } = useAuth();
  const { onComplete, onGoBack } = useOnboarding();

  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  const checkForInvite = useCallback(async () => {
    if (!user?.email) {
      setChecking(false);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/sub-portal/check-invite?email=${encodeURIComponent(user.email)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.invited) {
        setInvite({
          subOrganizationId: json.sub_organization_id,
          legalName: json.legal_name || t('subWelcome.yourContractor'),
        });
      } else {
        setInvite(null);
      }
    } catch (e) {
      setError(e.message || t('subWelcome.errorCheckInvite'));
    } finally {
      setChecking(false);
    }
  }, [user?.email]);

  // Re-check on focus so the screen self-updates when the invitation
  // arrives (e.g. the sub asks their contractor to invite them while sitting
  // on the "Waiting" screen), in addition to the manual Refresh button.
  useFocusEffect(
    useCallback(() => {
      checkForInvite();
    }, [checkForInvite])
  );

  const handleAccept = async () => {
    if (!user?.id) return;
    setAccepting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_URL}/api/sub-portal/accept-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t('subWelcome.errorAcceptFailed'));
      }

      // Mark onboarded so App.js routes to the portal.
      // Supabase returns errors rather than throwing, so check explicitly —
      // otherwise a failed write (RLS denial / transient) would silently
      // advance the UI while App.js bounces the user back into onboarding.
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ is_onboarded: true })
        .eq('id', user.id);
      if (profErr) throw profErr;

      await refreshProfile();
      if (onComplete) onComplete();
    } catch (e) {
      setError(e.message || t('subWelcome.errorTryAgain'));
    } finally {
      setAccepting(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={SUB_VIOLET} />
          <Text style={[styles.subtitle, { color: Colors.secondaryText, marginTop: 16 }]}>
            {t('subWelcome.checkingInvitations')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {onGoBack && (
        <TouchableOpacity style={styles.backButton} onPress={onGoBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryText} />
          <Text style={[styles.backText, { color: Colors.primaryText }]}>{t('common:buttons.back')}</Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: SUB_VIOLET + '20' }]}>
          <Ionicons name="construct" size={64} color={SUB_VIOLET} />
        </View>

        {invite ? (
          <>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              {t('subWelcome.invited')}
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              <Text style={{ fontWeight: '700', color: Colors.primaryText }}>
                {invite.legalName}
              </Text>
              {t('subWelcome.invitedSubtitleSuffix', { email: user?.email })}
            </Text>

            <View style={[styles.card, { backgroundColor: Colors.cardBackground || '#fff' }]}>
              <Text style={[styles.cardHeader, { color: Colors.primaryText }]}>
                {t('subWelcome.whatYoullGet')}
              </Text>
              {[
                { icon: 'document-text-outline', text: t('subWelcome.feature1') },
                { icon: 'mail-outline', text: t('subWelcome.feature2') },
                { icon: 'cash-outline', text: t('subWelcome.feature3') },
                { icon: 'rocket-outline', text: t('subWelcome.feature4') },
              ].map((f) => (
                <View key={f.icon} style={styles.featureRow}>
                  <Ionicons name={f.icon} size={20} color={SUB_VIOLET} />
                  <Text style={[styles.featureText, { color: Colors.secondaryText }]}>
                    {f.text}
                  </Text>
                </View>
              ))}
            </View>

            {error && (
              <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: SUB_VIOLET }, accepting && { opacity: 0.7 }]}
              onPress={handleAccept}
              disabled={accepting}
              activeOpacity={0.85}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('subWelcome.acceptInvitation')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              {t('subWelcome.waitingTitle')}
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              {t('subWelcome.noInviteBefore')}{' '}
              <Text style={{ fontWeight: '700', color: Colors.primaryText }}>{user?.email}</Text>
              {t('subWelcome.noInviteAfter')}
            </Text>

            {error && (
              <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: SUB_VIOLET }]}
              onPress={checkForInvite}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>{t('subWelcome.refresh')}</Text>
            </TouchableOpacity>

            {onGoBack && (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: Colors.border }]}
                onPress={onGoBack}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: Colors.primaryText }]}>
                  {t('subWelcome.pickDifferentRole')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  backText: { fontSize: FontSizes.body, marginLeft: 6 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.body,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  card: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    gap: 10,
  },
  featureText: { flex: 1, fontSize: FontSizes.small, lineHeight: 20 },
  primaryButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  primaryButtonText: { color: '#fff', fontSize: FontSizes.body, fontWeight: '700' },
  secondaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  secondaryButtonText: { fontSize: FontSizes.body, fontWeight: '600' },
  errorText: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
});
