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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { fetchMessages, sendMessage } from '../../services/clientPortalApi';

export default function ClientMessagesScreen({ route, navigation }) {
  const { projectId, projectName } = route.params;
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchMessages(projectId);
      setMessages((data || []).reverse());
    } catch (e) {
      console.error('Messages load error:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadMessages(); }, [loadMessages]));

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;

    // Optimistic update
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
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setText(content);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.sender_type === 'client';
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem, { backgroundColor: isMe ? '#1E40AF' : Colors.cardBackground }]}>
          {!isMe && (
            <Text style={[styles.senderName, { color: Colors.secondaryText }]}>
              {item.sender_name || 'Contractor'}
            </Text>
          )}
          <Text style={[styles.msgText, { color: isMe ? '#fff' : Colors.primaryText }]}>
            {item.content}
          </Text>
          <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : Colors.secondaryText }]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>Messages</Text>
          {projectName && <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]} numberOfLines={1}>{projectName}</Text>}
        </View>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 100 }} />
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
                <Ionicons name="chatbubbles-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No messages yet</Text>
                <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>Send a message to your contractor</Text>
              </View>
            }
          />
        )}

        {/* Input */}
        <View style={[styles.inputRow, { backgroundColor: Colors.cardBackground, borderTopColor: Colors.border }]}>
          <TextInput
            style={[styles.input, { color: Colors.primaryText, backgroundColor: Colors.background }]}
            placeholder="Type a message..."
            placeholderTextColor={Colors.secondaryText}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  messageList: { padding: 16, flexGrow: 1, justifyContent: 'flex-end' },
  msgRow: { marginBottom: 8 },
  msgRowMe: { alignItems: 'flex-end' },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 18 },
  msgBubbleMe: { borderBottomRightRadius: 4 },
  msgBubbleThem: { borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1 },
  input: { flex: 1, fontSize: 15, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E40AF', alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 100 },
  emptyText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySubtext: { fontSize: 13, marginTop: 4 },
});
