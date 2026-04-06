import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { fetchMessages, sendMessage } from '../../services/clientPortalApi';

const C = {
  amber: '#F59E0B', amberDark: '#D97706',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  bubbleClient: '#F59E0B', bubbleContractor: '#F3F4F6',
};

export default function ClientMessagesScreen({ route, navigation }) {
  const { projectId, projectName } = route.params;
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const sendScale = useRef(new Animated.Value(1)).current;

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchMessages(projectId);
      setMessages((data || []).reverse());
    } catch (e) {
      console.error('Messages load error:', e);
    } finally { setLoading(false); }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadMessages(); }, [loadMessages]));

  useEffect(() => {
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;

    // Tap animation
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.85, useNativeDriver: true, speed: 50 }),
      Animated.spring(sendScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();

    const tempMsg = {
      id: `temp-${Date.now()}`,
      content,
      sender_type: 'client',
      sender_name: profile?.full_name || 'You',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setText('');

    try {
      setSending(true);
      await sendMessage(projectId, content);
      await loadMessages();
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setText(content);
    } finally { setSending(false); }
  };

  // Cluster timestamps: only show if >15 min gap
  const shouldShowTimestamp = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const diff = new Date(msg.created_at) - new Date(prevMsg.created_at);
    return diff > 15 * 60 * 1000;
  };

  const renderMessage = ({ item, index }) => {
    const isMe = item.sender_type === 'client';
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showTime = shouldShowTimestamp(item, prevMsg);
    const isLastInCluster = index === messages.length - 1 || messages[index + 1]?.sender_type !== item.sender_type;

    return (
      <View>
        {showTime && (
          <Text style={styles.timestamp}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
          {!isMe && isLastInCluster && (
            <View style={styles.avatar}>
              <Ionicons name="person" size={14} color={C.textMuted} />
            </View>
          )}
          {!isMe && !isLastInCluster && <View style={{ width: 32 }} />}
          <View style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleThem,
          ]}>
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const hasText = text.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>Messages</Text>
            {projectName && <Text style={styles.headerSubtitle} numberOfLines={1}>{projectName}</Text>}
          </View>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={44} color={C.textMuted} />
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubtext}>Send a message to your contractor</Text>
              </View>
            }
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={C.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
            />
          </View>
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
            <TouchableOpacity
              style={[styles.sendBtn, !hasText && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!hasText || sending}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        </View>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.surface }} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerSafe: { backgroundColor: C.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  headerSubtitle: { fontSize: 12, color: C.textSec, marginTop: 1 },
  messageList: { padding: 16, flexGrow: 1, justifyContent: 'flex-end' },

  // Timestamp
  timestamp: { textAlign: 'center', fontSize: 11, fontWeight: '400', color: C.textMuted, marginVertical: 12 },

  // Messages
  msgRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  bubble: { maxWidth: '72%', paddingHorizontal: 16, paddingVertical: 12 },
  bubbleMe: { backgroundColor: C.bubbleClient, borderRadius: 18, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: C.bubbleContractor, borderRadius: 18, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: C.text },
  bubbleTextMe: { color: '#fff' },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8,
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
  },
  inputWrapper: {
    flex: 1, backgroundColor: C.bg, borderRadius: 24, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, minHeight: 44, justifyContent: 'center',
  },
  input: { fontSize: 15, color: C.text, maxHeight: 100, paddingVertical: 10 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 100 },
  emptyText: { fontSize: 16, fontWeight: '600', color: C.textSec, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: C.textMuted, marginTop: 4 },
});
