/**
 * SupervisorInvitePopup
 * Modal to accept/reject supervisor invitations from business owners
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { acceptSupervisorInvite, rejectSupervisorInvite } from '../utils/storage/supervisors';
import { useAuth } from '../contexts/AuthContext';

const SUPERVISOR_BLUE = '#2563EB';
const OWNER_PURPLE = '#7C3AED';

const SupervisorInvitePopup = ({ invites, onComplete }) => {
  const { t } = useTranslation('owner');
  const { user, refreshProfile } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  if (!invites || invites.length === 0) {
    return null;
  }

  const currentInvite = invites[currentIndex];

  // Format payment info for display
  const formatPayment = () => {
    const { payment_type, hourly_rate, daily_rate, weekly_salary, project_rate } = currentInvite;
    switch (payment_type) {
      case 'hourly': return `$${hourly_rate || 0}/hour`;
      case 'daily': return `$${daily_rate || 0}/day`;
      case 'weekly': return `$${weekly_salary || 0}/week`;
      case 'project_based': return `$${project_rate || 0}/project`;
      default: return null;
    }
  };

  const handleAccept = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setLoading(true);
      const result = await acceptSupervisorInvite(currentInvite.id, user.id);

      if (result?.success) {
        // Refresh profile to get updated role and owner_id
        await refreshProfile();

        // Move to next invite or complete
        if (currentIndex < invites.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onComplete(true); // true = accepted at least one invite
        }
      } else {
        Alert.alert('Error', result?.error || 'Failed to accept invitation');
      }
    } catch (error) {
      console.error('Error accepting supervisor invite:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setLoading(true);
      const result = await rejectSupervisorInvite(currentInvite.id, user.id);

      if (result?.success) {
        // Move to next invite or complete
        if (currentIndex < invites.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onComplete(false); // false = rejected all invites
        }
      } else {
        Alert.alert('Error', result?.error || 'Failed to reject invitation');
      }
    } catch (error) {
      console.error('Error rejecting supervisor invite:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.popup}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="briefcase" size={32} color={OWNER_PURPLE} />
            </View>
            <Text style={styles.title}>
              {t('supervisorInvite.title', 'Supervisor Invitation')}
            </Text>
            {invites.length > 1 && (
              <Text style={styles.counter}>
                {currentIndex + 1} of {invites.length}
              </Text>
            )}
          </View>

          {/* Owner Info */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {t('supervisorInvite.from', 'FROM BUSINESS OWNER')}
            </Text>
            <View style={styles.ownerCard}>
              <View style={styles.ownerAvatar}>
                <Text style={styles.ownerAvatarText}>
                  {currentInvite.owner?.business_name?.charAt(0)?.toUpperCase() || 'O'}
                </Text>
              </View>
              <View style={styles.ownerInfo}>
                <Text style={styles.ownerName}>
                  {currentInvite.owner?.business_name || 'Business Owner'}
                </Text>
                {currentInvite.owner?.business_phone && (
                  <Text style={styles.ownerPhone}>
                    {currentInvite.owner.business_phone}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Invitation Details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {t('supervisorInvite.details', 'INVITATION DETAILS')}
            </Text>
            <View style={styles.detailRow}>
              <Ionicons name="mail" size={20} color="#6B7280" />
              <Text style={styles.detailLabel}>
                {t('supervisorInvite.invitedAs', 'Invited as:')}
              </Text>
              <Text style={styles.detailValue}>Supervisor</Text>
            </View>
            {currentInvite.full_name && (
              <View style={styles.detailRow}>
                <Ionicons name="person" size={20} color="#6B7280" />
                <Text style={styles.detailLabel}>
                  {t('supervisorInvite.name', 'Name:')}
                </Text>
                <Text style={styles.detailValue}>{currentInvite.full_name}</Text>
              </View>
            )}
            {formatPayment() && (
              <View style={styles.detailRow}>
                <Ionicons name="cash" size={20} color="#10B981" />
                <Text style={styles.detailLabel}>
                  {t('supervisorInvite.payment', 'Payment:')}
                </Text>
                <Text style={[styles.detailValue, { color: '#10B981' }]}>{formatPayment()}</Text>
              </View>
            )}
          </View>

          {/* Info Message */}
          <View style={styles.messageContainer}>
            <Ionicons name="information-circle" size={20} color={OWNER_PURPLE} />
            <Text style={styles.message}>
              {t('supervisorInvite.message', 'By accepting, you will join this company as a supervisor. You\'ll be able to manage projects, workers, and track finances.')}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={handleReject}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#EF4444" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.rejectButtonText}>
                    {t('supervisorInvite.reject', 'Decline')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.acceptButtonText}>
                    {t('supervisorInvite.accept', 'Accept')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: OWNER_PURPLE + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  counter: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: OWNER_PURPLE + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: OWNER_PURPLE,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  ownerPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    flex: 1,
  },
  messageContainer: {
    flexDirection: 'row',
    backgroundColor: OWNER_PURPLE + '10',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 24,
  },
  message: {
    flex: 1,
    fontSize: 14,
    color: '#581C87',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  rejectButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  acceptButton: {
    backgroundColor: SUPERVISOR_BLUE,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default SupervisorInvitePopup;
