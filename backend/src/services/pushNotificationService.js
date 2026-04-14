/**
 * Push Notification Service
 * Sends Expo push notifications to users via their stored push tokens.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a specific user.
 * Queries their active push tokens and sends via Expo's API.
 *
 * @param {string} userId - Supabase user ID
 * @param {Object} notification - { title, body, data }
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    // Get active push tokens for this user
    const { data: tokens, error } = await supabaseAdmin
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      logger.error('[Push] Error fetching tokens:', error.message);
      return;
    }

    if (!tokens || tokens.length === 0) {
      logger.debug(`[Push] No active tokens for user ${userId}`);
      return;
    }

    const messages = tokens.map((t) => ({
      to: t.expo_push_token,
      sound: 'default',
      title,
      body,
      data,
    }));

    const BATCH_SIZE = 100;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
          signal: controller.signal,
        });

        if (!response.ok) {
          logger.error(`[Push] Expo API returned status ${response.status}`);
          return;
        }

        const result = await response.json();

        // Check for individual ticket errors (expired tokens, etc.)
        if (result.data) {
          result.data.forEach((ticket, j) => {
            const msgIndex = i + j;
            if (ticket.status === 'error') {
              logger.warn(`[Push] Token error for ${messages[msgIndex].to}: ${ticket.message}`);
              // Deactivate invalid tokens
              if (ticket.details?.error === 'DeviceNotRegistered') {
                supabaseAdmin
                  .from('push_tokens')
                  .update({ is_active: false })
                  .eq('expo_push_token', messages[msgIndex].to)
                  .then(() => logger.debug(`[Push] Deactivated expired token`))
                  .catch((err) => logger.error(`[Push] Failed to deactivate token: ${err.message}`));
              }
            }
          });
        }
      } finally {
        clearTimeout(fetchTimeout);
      }
    }

    logger.info(`[Push] Sent ${messages.length} notification(s) to user ${userId}`);
  } catch (err) {
    logger.error('[Push] sendPushToUser error:', err.message);
  }
}

module.exports = { sendPushToUser };
