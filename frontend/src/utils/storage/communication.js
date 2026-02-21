import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';

// ============================================================
// SMS/WhatsApp Communication Functions
// ============================================================

/**
 * Fetch conversations for a specific project
 * @param {string} projectId - Project ID
 * @returns {Promise<array>} Array of conversations
 */
export const fetchConversations = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('id, project_id, from_number, to_number, message_type, direction, message_body, handled_by, needs_attention, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      return [];
    }

    return data || [];
  } catch (error) {
    return [];
  }
};

/**
 * Send a manual SMS/WhatsApp message from contractor to client
 * @param {string} projectId - Project ID
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} Success status
 */
export const sendManualMessage = async (projectId, message) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, client_phone, profiles!inner(twilio_account_sid, twilio_auth_token, business_phone_number)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return false;
    }

    if (!project.client_phone) {
      return false;
    }

    if (!project.profiles.twilio_account_sid || !project.profiles.twilio_auth_token) {
      return false;
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${project.profiles.twilio_account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${project.profiles.twilio_account_sid}:${project.profiles.twilio_auth_token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: project.profiles.business_phone_number,
          To: project.client_phone,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      return false;
    }

    await supabase.from('conversations').insert({
      project_id: projectId,
      from_number: project.profiles.business_phone_number,
      to_number: project.client_phone,
      message_type: 'sms',
      direction: 'outbound',
      message_body: message,
      handled_by: 'contractor',
    });

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Mark conversation as handled by contractor
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<boolean>} Success status
 */
export const markConversationHandled = async (conversationId) => {
  try {
    const { error } = await supabase
      .from('conversations')
      .update({
        needs_attention: false,
        handled_by: 'contractor',
      })
      .eq('id', conversationId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get count of conversations needing attention for a project
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Count of unhandled conversations
 */
export const getUnhandledConversationCount = async (projectId) => {
  try {
    const { count, error } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('needs_attention', true);

    if (error) {
      return 0;
    }

    return count || 0;
  } catch (error) {
    return 0;
  }
};
