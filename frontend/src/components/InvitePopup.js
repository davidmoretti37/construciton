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
import { acceptInvite, rejectInvite } from '../utils/storage';

const InvitePopup = ({ invites, userId, onComplete }) => {
  const { t } = useTranslation('common');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  if (!invites || invites.length === 0) {
    return null;
  }

  const currentInvite = invites[currentIndex];

  const handleAccept = async () => {
    try {
      setLoading(true);
      const success = await acceptInvite(currentInvite.id, userId);

      if (success) {
        // Move to next invite or close if this was the last one
        if (currentIndex < invites.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onComplete();
        }
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToAcceptInvite'));
      }
    } catch (error) {
      console.error('Error accepting invite:', error);
      Alert.alert(t('alerts.error'), t('messages.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setLoading(true);
      const success = await rejectInvite(currentInvite.id);

      if (success) {
        // Move to next invite or close if this was the last one
        if (currentIndex < invites.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onComplete();
        }
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToRejectInvite'));
      }
    } catch (error) {
      console.error('Error rejecting invite:', error);
      Alert.alert(t('alerts.error'), t('messages.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const formatPayment = () => {
    const { payment_type, hourly_rate, daily_rate, weekly_salary, project_rate } = currentInvite;

    switch (payment_type) {
      case 'hourly':
        return `$${hourly_rate}/${t('labels.hour')}`;
      case 'daily':
        return `$${daily_rate}/${t('labels.day')}`;
      case 'weekly':
        return `$${weekly_salary}/${t('labels.week')}`;
      case 'project_based':
        return `$${project_rate}/${t('labels.project')}`;
      default:
        return t('emptyStates.notSpecified');
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
              <Ionicons name="mail" size={32} color="#3B82F6" />
            </View>
            <Text style={styles.title}>{t('labels.workerInvitation')}</Text>
            {invites.length > 1 && (
              <Text style={styles.counter}>
                {currentIndex + 1} of {invites.length}
              </Text>
            )}
          </View>

          {/* Owner Info */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('labels.from')}</Text>
            <View style={styles.ownerCard}>
              <Ionicons name="person-circle" size={40} color="#6B7280" />
              <View style={styles.ownerInfo}>
                <Text style={styles.ownerName}>
                  {currentInvite.owner?.full_name || t('emptyStates.unknownOwner')}
                </Text>
                {currentInvite.owner?.company_name && (
                  <Text style={styles.companyName}>
                    {currentInvite.owner.company_name}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Job Details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('labels.positionDetails')}</Text>
            <View style={styles.detailRow}>
              <Ionicons name="hammer" size={20} color="#6B7280" />
              <Text style={styles.detailLabel}>{t('labels.trade')}:</Text>
              <Text style={styles.detailValue}>{currentInvite.trade || t('emptyStates.notSpecified')}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash" size={20} color="#6B7280" />
              <Text style={styles.detailLabel}>{t('labels.pay')}:</Text>
              <Text style={styles.detailValue}>{formatPayment()}</Text>
            </View>
          </View>

          {/* Message */}
          <View style={styles.messageContainer}>
            <Ionicons name="information-circle" size={20} color="#6B7280" />
            <Text style={styles.message}>
              {t('messages.inviteMessage', { trade: currentInvite.trade || t('labels.worker') })}
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
                  <Text style={styles.rejectButtonText}>{t('buttons.reject')}</Text>
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
                  <Text style={styles.acceptButtonText}>{t('buttons.accept')}</Text>
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
    backgroundColor: '#EFF6FF',
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
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  companyName: {
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
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 24,
  },
  message: {
    flex: 1,
    fontSize: 14,
    color: '#1E3A8A',
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
    backgroundColor: '#3B82F6',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default InvitePopup;
