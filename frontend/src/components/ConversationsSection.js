import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchConversations, sendManualMessage, markConversationHandled } from '../utils/storage';
import { supabase } from '../lib/supabase';

export default function ConversationsSection({ projectId, clientPhone }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [conversations, setConversations] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollViewRef = useRef(null);

  // Fetch conversations on mount
  useEffect(() => {
    loadConversations();
  }, [projectId]);

  // Subscribe to real-time conversation updates
  useEffect(() => {
    if (!projectId) return;

    const subscription = supabase
      .channel(`conversations:${projectId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        setConversations(prev => [...prev, payload.new]);
        // Auto-scroll to bottom
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [projectId]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const data = await fetchConversations(projectId);
      setConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      const success = await sendManualMessage(projectId, replyText.trim());
      if (success) {
        setReplyText('');
        // Reload conversations to show the new message
        await loadConversations();
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSendMessage'));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSendMessageRetry'));
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkHandled = async (conversationId) => {
    try {
      await markConversationHandled(conversationId);
      // Update local state
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, needs_attention: false, handled_by: 'contractor' }
            : conv
        )
      );
    } catch (error) {
      console.error('Error marking conversation handled:', error);
    }
  };

  const unhandledCount = conversations.filter(c => c.needs_attention).length;

  if (!clientPhone) {
    return (
      <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
        <Ionicons name="chatbubbles-outline" size={48} color={Colors.secondaryText} />
        <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
          {t('emptyStates.addClientPhone')}
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with unhandled count */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="chatbubbles" size={20} color={Colors.primaryText} />
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {t('labels.clientMessages')}
          </Text>
        </View>
        {unhandledCount > 0 && (
          <View style={[styles.badge, { backgroundColor: Colors.error }]}>
            <Text style={[styles.badgeText, { color: Colors.white }]}>
              {unhandledCount}
            </Text>
          </View>
        )}
      </View>

      {/* Conversations List */}
      <ScrollView
        ref={scrollViewRef}
        style={[styles.conversationsList, { backgroundColor: Colors.background }]}
        contentContainerStyle={styles.conversationsContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {conversations.length === 0 ? (
          <View style={styles.emptyConversations}>
            <Ionicons name="mail-open-outline" size={32} color={Colors.secondaryText} />
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              {t('emptyStates.noMessagesYet')}
            </Text>
            <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
              {t('emptyStates.clientCanText', { phone: clientPhone })}
            </Text>
          </View>
        ) : (
          conversations.map(conv => (
            <View key={conv.id} style={styles.messageContainer}>
              {/* Message Bubble */}
              <TouchableOpacity
                activeOpacity={0.8}
                onLongPress={() => {
                  setCopiedMessageId(prev => prev === conv.id ? null : conv.id);
                }}
                style={[
                  styles.messageBubble,
                  conv.direction === 'inbound'
                    ? [styles.inboundBubble, { backgroundColor: Colors.lightGray }]
                    : [styles.outboundBubble, { backgroundColor: Colors.primaryBlue }],
                ]}
              >
                <Text
                  selectable
                  style={[
                    styles.messageText,
                    { color: conv.direction === 'inbound' ? Colors.primaryText : Colors.white }
                  ]}
                >
                  {conv.message_body}
                </Text>

                {/* AI Response Indicator */}
                {conv.ai_response && conv.handled_by === 'ai' && (
                  <View style={styles.aiIndicator}>
                    <Ionicons name="flash" size={12} color={Colors.primaryBlue} />
                    <Text style={[styles.aiText, { color: Colors.secondaryText }]}>
                      {t('labels.aiAutoResponded')}
                    </Text>
                  </View>
                )}

                {/* Timestamp */}
                <Text
                  style={[
                    styles.timestamp,
                    { color: conv.direction === 'inbound' ? Colors.secondaryText : 'rgba(255,255,255,0.7)' }
                  ]}
                >
                  {new Date(conv.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </TouchableOpacity>
              {copiedMessageId === conv.id && (
                <Animated.View
                  entering={FadeInDown.duration(150)}
                  exiting={FadeOutDown.duration(150)}
                  style={[
                    styles.copyBubble,
                    conv.direction === 'inbound' ? { alignSelf: 'flex-start' } : { alignSelf: 'flex-end' },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => {
                      Clipboard.setStringAsync(conv.message_body);
                      setCopiedMessageId('copied-' + conv.id);
                      setTimeout(() => setCopiedMessageId(null), 1500);
                    }}
                  >
                    <Ionicons name="copy-outline" size={14} color={Colors.primaryText} />
                    <Text style={[styles.copyButtonText, { color: Colors.primaryText }]}>Copy all</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
              {copiedMessageId === 'copied-' + conv.id && (
                <Animated.View
                  entering={FadeInDown.duration(150)}
                  exiting={FadeOutDown.duration(150)}
                  style={[
                    styles.copyBubble,
                    conv.direction === 'inbound' ? { alignSelf: 'flex-start' } : { alignSelf: 'flex-end' },
                  ]}
                >
                  <View style={styles.copyButton}>
                    <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                    <Text style={[styles.copyButtonText, { color: '#34C759' }]}>Copied!</Text>
                  </View>
                </Animated.View>
              )}

              {/* Needs Attention Badge */}
              {conv.needs_attention && (
                <TouchableOpacity
                  style={[styles.needsAttentionBadge, { backgroundColor: Colors.error }]}
                  onPress={() => handleMarkHandled(conv.id)}
                >
                  <Ionicons name="alert-circle" size={14} color={Colors.white} />
                  <Text style={[styles.badgeText, { color: Colors.white }]}>
                    {t('labels.needsResponse')}
                  </Text>
                  <Ionicons name="checkmark-circle-outline" size={14} color={Colors.white} />
                </TouchableOpacity>
              )}

              {/* Intent Classification */}
              {conv.intent_classification && conv.intent_classification !== 'general' && (
                <View style={styles.intentBadge}>
                  <Text style={[styles.intentText, { color: Colors.secondaryText }]}>
                    {conv.intent_classification}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Reply Input */}
      <View style={[styles.replyContainer, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TextInput
          style={[styles.replyInput, { backgroundColor: Colors.lightGray, color: Colors.primaryText }]}
          placeholder={t('placeholders.typeYourReply')}
          placeholderTextColor={Colors.placeholderText}
          value={replyText}
          onChangeText={setReplyText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: replyText.trim() ? Colors.primaryBlue : Colors.border }
          ]}
          onPress={handleSendReply}
          disabled={!replyText.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons
              name="send"
              size={20}
              color={replyText.trim() ? Colors.white : Colors.secondaryText}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  badgeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  conversationsList: {
    flex: 1,
    maxHeight: 400,
  },
  conversationsContent: {
    padding: Spacing.md,
  },
  emptyConversations: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyText: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: FontSizes.small,
    marginTop: Spacing.xs,
  },
  messageContainer: {
    marginBottom: Spacing.md,
  },
  messageBubble: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    maxWidth: '80%',
  },
  inboundBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  outboundBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: FontSizes.body,
    lineHeight: 20,
  },
  copyBubble: {
    marginTop: -4,
    marginBottom: Spacing.xs,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  aiIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  aiText: {
    fontSize: FontSizes.tiny,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
  needsAttentionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  intentBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  intentText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
  },
  replyInput: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.body,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.md,
  },
});
