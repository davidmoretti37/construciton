import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius } from '../constants/theme';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages appear
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim() === '') return;

    const newMessage = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages([...messages, newMessage]);
    setInputText('');

    // TODO: Connect to AI API
    // const response = await fetch('YOUR_API_URL/chat', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ message: inputText })
    // });
    // const data = await response.json();
    // setMessages((prev) => [...prev, { id: Date.now().toString(), text: data.response, isUser: false, timestamp: new Date() }]);
  };

  const handleWhatsAppCreate = () => {
    // TODO: Implement WhatsApp integration
    console.log('WhatsApp create project');
  };

  const handleScreenshotUpload = () => {
    // TODO: Implement screenshot upload
    console.log('Screenshot upload');
  };

  const handleManualCreate = () => {
    // TODO: Implement manual project creation
    console.log('Manual create project');
  };

  const handleCameraOpen = () => {
    // TODO: Implement camera opening
    console.log('Open camera');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Chat AI</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Chat Messages Area */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        keyboardVerticalOffset={Platform.select({ ios: 90, android: 0 })}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No messages yet</Text>
              <Text style={styles.emptyStateSubtext}>Start a conversation to get help with your construction projects</Text>
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.isUser ? styles.userMessage : styles.aiMessage,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    message.isUser ? styles.userText : styles.aiText,
                  ]}
                >
                  {message.text}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={styles.inputBar}>
          {/* Quick Action Icons */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleWhatsAppCreate}
            >
              <Ionicons name="logo-whatsapp" size={24} color={Colors.secondaryText} />
              <Text style={styles.actionLabel}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleScreenshotUpload}
            >
              <Ionicons name="image-outline" size={24} color={Colors.secondaryText} />
              <Text style={styles.actionLabel}>Screenshot</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleManualCreate}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.secondaryText} />
              <Text style={styles.actionLabel}>Create</Text>
            </TouchableOpacity>
          </View>

          {/* Text Input Row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor={Colors.placeholderText}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={inputText.trim() ? handleSend : handleCameraOpen}
            >
              <Ionicons
                name={inputText.trim() ? 'send' : 'camera'}
                size={24}
                color={Colors.primaryBlue}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  chatArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  chatContent: {
    padding: Spacing.lg,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primaryBlue,
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.lightGray,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FontSizes.body,
  },
  userText: {
    color: Colors.white,
  },
  aiText: {
    color: Colors.primaryText,
  },
  inputBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : Spacing.sm,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  actionButton: {
    alignItems: 'center',
    minWidth: 44,
  },
  actionLabel: {
    fontSize: 10,
    color: Colors.secondaryText,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
    maxHeight: 100,
  },
  sendButton: {
    padding: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
