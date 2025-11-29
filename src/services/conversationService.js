import { supabase } from '../lib/supabase';

/**
 * Get current user ID from Supabase auth
 * @returns {Promise<string|null>} User ID or null
 */
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

/**
 * Conversation Service
 * Handles project conversations and messages
 */

/**
 * Fetch all conversations for a project
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of conversations
 */
export const fetchConversations = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error loading conversations:', error);
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
      console.error('No user logged in');
      return false;
    }

    // Get project and user info
    const { data: project } = await supabase
      .from('projects')
      .select('*, profiles!inner(*)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      console.error('Project not found');
      return false;
    }

    if (!project.client_phone) {
      console.error('No client phone number on project');
      return false;
    }

    if (!project.profiles.twilio_account_sid || !project.profiles.twilio_auth_token) {
      console.error('Twilio not configured');
      return false;
    }

    // Send via Twilio
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
      console.error('Failed to send message:', await response.text());
      return false;
    }

    // Log conversation
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
    console.error('Error sending manual message:', error);
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
      console.error('Error marking conversation handled:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating conversation:', error);
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
      console.error('Error getting unhandled count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error getting unhandled conversation count:', error);
    return 0;
  }
};
