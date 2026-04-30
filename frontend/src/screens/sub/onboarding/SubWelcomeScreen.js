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

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { supabase } from '../../../lib/supabase';
import { API_URL } from '../../../config/api';

const SUB_VIOLET = '#8B5CF6';

export default function SubWelcomeScreen() {
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
          legalName: json.legal_name || 'your contractor',
        });
      } else {
        setInvite(null);
      }
    } catch (e) {
      setError(e.message || 'Could not check for invitations.');
    } finally {
      setChecking(false);
    }
  }, [user?.email]);

  useEffect(() => {
    checkForInvite();
  }, [checkForInvite]);

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
        throw new Error(json.error || 'Failed to accept invitation');
      }

      // Mark onboarded so App.js routes to the portal
      await supabase
        .from('profiles')
        .update({ is_onboarded: true })
        .eq('id', user.id);

      await refreshProfile();
      if (onComplete) onComplete();
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.');
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
            Checking for invitations...
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
          <Text style={[styles.backText, { color: Colors.primaryText }]}>Back</Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: SUB_VIOLET + '20' }]}>
          <Ionicons name="construct" size={64} color={SUB_VIOLET} />
        </View>

        {invite ? (
          <>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              You've been invited!
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              <Text style={{ fontWeight: '700', color: Colors.primaryText }}>
                {invite.legalName}
              </Text>{' '}
              is set up on Sylk and has invited you ({user?.email}) as their subcontractor.
            </Text>

            <View style={[styles.card, { backgroundColor: Colors.cardBackground || '#fff' }]}>
              <Text style={[styles.cardHeader, { color: Colors.primaryText }]}>
                What you'll get
              </Text>
              {[
                { icon: 'document-text-outline', text: 'Compliance vault — COI, W-9, licenses, all in one place' },
                { icon: 'mail-outline', text: 'Inbox — every doc request, contract, and bid invite' },
                { icon: 'cash-outline', text: 'Send invoices and track payments from your contractors' },
                { icon: 'rocket-outline', text: 'Run your own jobs through Sylk later (optional)' },
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
                <Text style={styles.primaryButtonText}>Accept invitation</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Waiting for an invitation
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              We didn't find an invitation for{' '}
              <Text style={{ fontWeight: '700', color: Colors.primaryText }}>{user?.email}</Text>.
              {'\n\n'}Ask the contractor who's hiring you to invite you on Sylk using this exact
              email. Once they do, tap Refresh below.
            </Text>

            {error && (
              <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: SUB_VIOLET }]}
              onPress={checkForInvite}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Refresh</Text>
            </TouchableOpacity>

            {onGoBack && (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: Colors.border }]}
                onPress={onGoBack}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: Colors.primaryText }]}>
                  Pick a different role
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
