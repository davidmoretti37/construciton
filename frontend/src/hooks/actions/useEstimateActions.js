import { useCallback } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import { emitEstimateChanged } from '../../services/eventEmitter';
import {
  fetchProjects,
  saveEstimate,
  updateEstimate,
  fetchEstimates,
  deleteEstimate,
} from '../../utils/storage';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../../utils/messaging';
import { formatEstimate } from '../../utils/estimateFormatter';
import CoreAgent from '../../services/agents/core/CoreAgent';

// Helper: Resolve partial project UUID to full UUID
const resolveProjectId = (projects, id) => {
  if (!id || !projects) return null;
  if (id.length === 36) return id;
  const match = projects.find(p => p.id?.startsWith(id));
  return match?.id || null;
};

/**
 * Hook for all estimate-related actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 * @param {Function} options.setMessages - Function to update messages state
 * @param {Array} options.messages - Current messages array
 */
export default function useEstimateActions({ addMessage, setMessages, messages }) {

  const handleSaveEstimate = useCallback(async (estimateData) => {
    try {
      let completeEstimateData = estimateData;

      // Normalize project_id to projectId
      if (completeEstimateData.project_id && !completeEstimateData.projectId) {
        completeEstimateData.projectId = completeEstimateData.project_id;
      }

      // Resolve partial project UUID
      if (completeEstimateData.projectId && completeEstimateData.projectId.length < 36) {
        logger.debug('⚠️ Partial project ID detected, resolving...', completeEstimateData.projectId);
        const projects = await fetchProjects();
        const fullProjectId = resolveProjectId(projects, completeEstimateData.projectId);
        if (fullProjectId) {
          logger.debug('✅ Resolved to full UUID:', fullProjectId);
          completeEstimateData.projectId = fullProjectId;
        } else {
          logger.warn('❌ Could not resolve partial project ID, removing link');
          completeEstimateData.projectId = null;
        }
      }

      // Check if phases are missing tasks
      const actionHasTasks = estimateData.phases?.some(p => p.tasks?.length > 0);

      if (!actionHasTasks && messages) {
        logger.debug('⚠️ Action data missing tasks, searching for complete data in preview...');

        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg.isUser && msg.visualElements) {
            const estimatePreview = msg.visualElements.find(ve => ve.type === 'estimate-preview');
            if (estimatePreview && estimatePreview.data) {
              const previewHasTasks = estimatePreview.data.phases?.some(p => p.tasks?.length > 0);

              if (previewHasTasks) {
                logger.debug('✅ Found complete data in preview, merging with action data');
                // Keep already-resolved projectId (don't overwrite null with bad preview data)
                const resolvedProjectId = completeEstimateData.projectId;
                completeEstimateData = {
                  ...estimateData,
                  phases: estimatePreview.data.phases || estimateData.phases,
                  schedule: estimatePreview.data.schedule || estimateData.schedule,
                  scope: estimatePreview.data.scope || estimateData.scope,
                  lineItems: estimateData.lineItems || estimatePreview.data.items || [],
                  projectId: resolvedProjectId,
                };
                break;
              }
            }
          }
        }
      }

      // If no valid projectId, try to get it from saved project in conversation state
      if (!completeEstimateData.projectId) {
        const savedProjectId = CoreAgent.conversationState?.lastProjectPreview?.id;
        if (savedProjectId && savedProjectId.length === 36) {
          logger.debug('✅ Found project ID from saved project in conversation state:', savedProjectId);
          completeEstimateData.projectId = savedProjectId;
        }
      }

      // Fallback: if still no projectId but we have a projectName, search for it
      if (!completeEstimateData.projectId && completeEstimateData.projectName) {
        logger.debug('🔍 No projectId found, searching by projectName:', completeEstimateData.projectName);
        const projects = await fetchProjects();
        const searchName = completeEstimateData.projectName.toLowerCase();
        const match = projects.find(p =>
          p.name?.toLowerCase().includes(searchName) ||
          searchName.includes(p.name?.toLowerCase())
        );
        if (match) {
          logger.debug('✅ Found project by name:', match.name, match.id);
          completeEstimateData.projectId = match.id;
        }
      }

      const savedEstimate = await saveEstimate(completeEstimateData);

      if (savedEstimate) {
        logger.debug('✅ Estimate saved successfully:', savedEstimate.id);

        // Update messages to show saved estimate with ID
        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasEstimate = msg.visualElements.some(ve => ve.type === 'estimate-preview');

              if (hasEstimate) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview') {
                      return {
                        ...ve,
                        data: { ...ve.data, id: savedEstimate.id, saved: true }
                      };
                    }
                    return ve;
                  }),
                  actions: msg.actions?.filter(a => a.type !== 'save-estimate') || []
                };
              }
            }
            return msg;
          });
        });

        Alert.alert(
          'Success',
          `Estimate #${savedEstimate.estimate_number} has been saved!`
        );

        emitEstimateChanged(savedEstimate.id);
        return savedEstimate;
      }
      return null;
    } catch (error) {
      logger.error('Error saving estimate:', error);
      Alert.alert('Error', 'Failed to save estimate. Please try again.');
      return null;
    }
  }, [messages, setMessages]);

  const handleUpdateEstimate = useCallback(async (estimateData, options = {}) => {
    try {
      const { skipConfirmation = false } = options;
      const estimateId = estimateData.id || estimateData.estimateId;

      // If no ID, this is a new unsaved estimate - just update the preview in chat
      if (!estimateId) {
        logger.debug('📝 Updating unsaved estimate preview in chat');
        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasEstimate = msg.visualElements.some(
                (ve) => ve.type === 'estimate-preview' &&
                       ve.data.estimateNumber === estimateData.estimateNumber
              );

              if (hasEstimate) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview' &&
                        ve.data.estimateNumber === estimateData.estimateNumber) {
                      return { ...ve, data: estimateData };
                    }
                    return ve;
                  })
                };
              }
            }
            return msg;
          });
        });
        if (!skipConfirmation) {
          Alert.alert('Success', 'Estimate updated! Click "Save Estimate" to save it permanently.');
        }
        return estimateData;
      }

      // Existing estimate with ID - update in database
      const updatedEstimate = await updateEstimate(estimateData);
      if (updatedEstimate) {
        if (!skipConfirmation) {
          Alert.alert('Success', 'Estimate and linked project updated successfully!');
        }

        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasEstimate = msg.visualElements.some(
                (ve) => ve.type === 'estimate-preview' &&
                       (ve.data.id === estimateData.id || ve.data.estimateId === estimateData.estimateId)
              );

              if (hasEstimate) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview' &&
                        (ve.data.id === estimateData.id || ve.data.estimateId === estimateData.estimateId)) {
                      return { ...ve, data: updatedEstimate };
                    }
                    return ve;
                  })
                };
              }
            }
            return msg;
          });
        });

        emitEstimateChanged(updatedEstimate.id);
        return updatedEstimate;
      }
      return null;
    } catch (error) {
      logger.error('Error updating estimate:', error);
      Alert.alert('Error', 'Failed to update estimate. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleSendEstimate = useCallback(async (action) => {
    try {
      const { method, estimate, phone, clientName, clientPhone, clientEmail } = action.data || action;

      const phoneToUse = phone || clientPhone;
      const nameToUse = estimate?.client || clientName || 'Client';

      if (!phoneToUse || !isValidPhoneNumber(phoneToUse)) {
        Alert.alert('Invalid Phone', 'Please provide a valid phone number.');
        return false;
      }

      const formattedEstimate = formatEstimate(estimate);

      let success = false;
      if (method === 'sms') {
        success = await sendEstimateViaSMS(phoneToUse, formattedEstimate, nameToUse);
      } else if (method === 'whatsapp') {
        success = await sendEstimateViaWhatsApp(phoneToUse, formattedEstimate, nameToUse);
      }

      if (success) {
        addMessage(`✅ Estimate sent to ${nameToUse} via ${method === 'sms' ? 'SMS' : 'WhatsApp'}!`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to send estimate. Please try again.');
        return false;
      }
    } catch (error) {
      logger.error('Error sending estimate:', error);
      Alert.alert('Error', 'Failed to send estimate. Please try again.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteAllEstimates = useCallback(async (data, options = {}) => {
    try {
      const { confirmed = false } = data || {};
      const { skipConfirmation = false } = options;

      // Fetch all estimates
      const estimates = await fetchEstimates();
      if (!estimates || estimates.length === 0) {
        addMessage('You have no estimates to delete.');
        return { success: true, count: 0 };
      }

      const estimateCount = estimates.length;

      // If confirmed from AI or skipConfirmation, delete all
      if (confirmed || skipConfirmation) {
        let deletedCount = 0;
        for (const estimate of estimates) {
          const success = await deleteEstimate(estimate.id);
          if (success) deletedCount++;
        }

        const confirmationMessage = {
          id: Date.now().toString(),
          text: `✅ Successfully deleted ${deletedCount} estimate${deletedCount !== 1 ? 's' : ''}.`,
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
        };
        setMessages(prev => [...prev, confirmationMessage]);
        emitEstimateChanged('*');
        return { success: true, count: deletedCount };
      }

      // Otherwise show confirmation dialog
      return new Promise((resolve) => {
        Alert.alert(
          'Delete All Estimates',
          `Are you sure you want to delete ALL ${estimateCount} estimate${estimateCount !== 1 ? 's' : ''}? This action cannot be undone.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ success: false, count: 0 })
            },
            {
              text: `Delete All ${estimateCount}`,
              style: 'destructive',
              onPress: async () => {
                let deletedCount = 0;
                for (const estimate of estimates) {
                  const success = await deleteEstimate(estimate.id);
                  if (success) deletedCount++;
                }
                Alert.alert('Success', `Deleted ${deletedCount} estimate${deletedCount !== 1 ? 's' : ''}`);
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ Successfully deleted ${deletedCount} estimate${deletedCount !== 1 ? 's' : ''}.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                };
                setMessages(prev => [...prev, confirmationMessage]);
                resolve({ success: true, count: deletedCount });
              }
            }
          ]
        );
      });
    } catch (error) {
      logger.error('Error deleting all estimates:', error);
      Alert.alert('Error', 'Failed to delete estimates. Please try again.');
      return { success: false, count: 0 };
    }
  }, [addMessage, setMessages]);

  // Send estimate to client portal — emails the client + creates portal
  // notification + flips status draft → sent. Mirror of handleSendToClient
  // for invoices.
  const handleSendEstimateToClient = useCallback(async (data) => {
    try {
      if (!data?.id) {
        Alert.alert('Save First', 'Please save the estimate before sending to client.');
        return false;
      }
      const { supabase } = require('../../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Error', 'Not authenticated');
        return false;
      }
      const { API_URL } = require('../../config/api');
      // Pass signature_required through if the caller specified it (share sheet).
      const body = {};
      if (typeof data.signature_required === 'boolean') {
        body.signature_required = data.signature_required;
      } else if (typeof data.signatureRequired === 'boolean') {
        body.signature_required = data.signatureRequired;
      }
      const res = await fetch(`${API_URL}/api/portal-admin/estimates/${data.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: Object.keys(body).length ? JSON.stringify(body) : undefined,
      });
      const result = await res.json();
      if (result.sent) {
        const lines = ['Estimate is now available in the client portal.'];
        if (result.portal_notified) lines.push(`In-app notification sent to ${result.portal_recipient}.`);
        if (result.email_sent) lines.push(`Also emailed to ${result.email_recipient}.`);
        if (result.signature_required) {
          lines.push(result.signature_request
            ? 'Signing link sent — client must sign to accept.'
            : 'Signature required, but the signing link could not be created. Resend or check email config.');
        }
        Alert.alert('Shared to portal', lines.join('\n\n'));
        const num = data.estimateNumber || data.estimate_number || '';
        addMessage(`✅ Estimate ${num} shared to client portal${result.signature_required ? ' (signature required)' : ''}${result.email_sent ? ' — also emailed' : ''}`);
        return true;
      } else {
        Alert.alert('Send Failed', result.error || 'Could not send estimate.');
        return false;
      }
    } catch (error) {
      logger.error('Error sending estimate to client:', error);
      Alert.alert('Error', 'Failed to send estimate. Please try again.');
      return false;
    }
  }, [addMessage]);

  return {
    handleSaveEstimate,
    handleUpdateEstimate,
    handleSendEstimate,
    handleSendEstimateToClient,
    handleDeleteAllEstimates,
  };
}
