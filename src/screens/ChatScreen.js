import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import AIInputWithSearch from '../components/AIInputWithSearch';
import AnimatedText from '../components/AnimatedText';
import ThemeSwitch from '../components/ThemeSwitch';
import { useTheme } from '../contexts/ThemeContext';
import { sendMessageToAI, getProjectContext, analyzeScreenshot, formatProjectConfirmation } from '../services/aiService';
import { ProjectCard, WorkerList, BudgetChart, PhotoGallery, EstimatePreview } from '../components/ChatVisuals';
import { formatEstimate } from '../utils/estimateFormatter';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../utils/messaging';
import { getUserProfile } from '../utils/storage';

export default function ChatScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const scrollViewRef = useRef(null);
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  useEffect(() => {
    // Auto-scroll to bottom when new messages appear
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleSend = async (text, withSearch) => {
    if (text.trim() === '') return;

    // Add user message to UI
    const userMessage = {
      id: Date.now().toString(),
      text: text,
      isUser: true,
      timestamp: new Date(),
      withSearch: withSearch,
    };

    setMessages((prev) => [...prev, userMessage]);

    // Dismiss keyboard so user can see AI response
    Keyboard.dismiss();

    try {
      // Get current project context (replace with real data later)
      const projectContext = getProjectContext();

      // Call AI service with conversation history
      const aiResponse = await sendMessageToAI(
        text,
        projectContext,
        conversationHistory
      );

      // Add AI response to UI (now with structured data)
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        text: aiResponse.text || aiResponse,
        isUser: false,
        timestamp: new Date(),
        visualElements: aiResponse.visualElements || [],
        actions: aiResponse.actions || [],
        quickSuggestions: aiResponse.quickSuggestions || [],
      };

      setMessages((prev) => [...prev, aiMessage]);

      // Update conversation history for context in next messages
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: typeof aiResponse === 'string' ? aiResponse : aiResponse.text },
      ]);
    } catch (error) {
      console.error('Error calling AI:', error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I encountered an error: ${error.message}. Please check your API key and internet connection.`,
        isUser: false,
        timestamp: new Date(),
        visualElements: [],
        actions: [],
        quickSuggestions: [],
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleFileSelect = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to upload screenshots!');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Show analyzing message
        const analyzingMessage = {
          id: Date.now().toString(),
          text: 'Analyzing screenshot...',
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
          quickSuggestions: [],
        };
        setMessages((prev) => [...prev, analyzingMessage]);

        // Analyze screenshot
        const extracted = await analyzeScreenshot(result.assets[0].base64);

        // Format confirmation
        const confirmation = formatProjectConfirmation(extracted);

        // Replace analyzing message with results
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== analyzingMessage.id);
          return [
            ...filtered,
            {
              id: (Date.now() + 1).toString(),
              text: confirmation.text,
              isUser: false,
              timestamp: new Date(),
              visualElements: confirmation.visualElements || [],
              actions: confirmation.actions || [],
              quickSuggestions: confirmation.quickSuggestions || [],
            },
          ];
        });
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleCameraOpen = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera permissions to take photos!');
        return;
      }

      // Open camera
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Show analyzing message
        const analyzingMessage = {
          id: Date.now().toString(),
          text: 'Analyzing photo...',
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
          quickSuggestions: [],
        };
        setMessages((prev) => [...prev, analyzingMessage]);

        // Analyze screenshot
        const extracted = await analyzeScreenshot(result.assets[0].base64);

        // Format confirmation
        const confirmation = formatProjectConfirmation(extracted);

        // Replace analyzing message with results
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== analyzingMessage.id);
          return [
            ...filtered,
            {
              id: (Date.now() + 1).toString(),
              text: confirmation.text,
              isUser: false,
              timestamp: new Date(),
              visualElements: confirmation.visualElements || [],
              actions: confirmation.actions || [],
              quickSuggestions: confirmation.quickSuggestions || [],
            },
          ];
        });
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleAction = async (action) => {
    console.log('Action pressed:', action);

    switch (action.type) {
      case 'view-project':
        console.log('View project:', action.data.projectId);
        // TODO: Navigate to project details
        break;

      case 'view-photos':
        console.log('View photos for:', action.data.projectId);
        // TODO: Navigate to photo gallery
        break;

      case 'add-worker':
        console.log('Add worker');
        // TODO: Navigate to add worker screen
        break;

      case 'create-project':
        console.log('Create project');
        // TODO: Navigate to create project screen
        break;

      case 'send-estimate-sms':
      case 'send-estimate-whatsapp':
        await handleSendEstimate(action);
        break;

      default:
        console.log('Unknown action:', action.type);
    }
  };

  const handleSendEstimate = async (action) => {
    try {
      // Get user profile for business info
      const userProfile = await getUserProfile();

      // Prompt for phone number
      Alert.prompt(
        'Enter Phone Number',
        `Enter the client's phone number to send this estimate`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Send',
            onPress: async (phoneNumber) => {
              if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
                Alert.alert('Invalid Phone', 'Please enter a valid phone number');
                return;
              }

              // Format the estimate
              const estimateData = action.data;
              const formattedEstimate = formatEstimate(
                {
                  client: estimateData.client,
                  projectName: estimateData.projectName,
                  items: estimateData.items,
                },
                userProfile.businessInfo
              );

              // Send via SMS or WhatsApp
              if (action.type === 'send-estimate-sms') {
                await sendEstimateViaSMS(phoneNumber, formattedEstimate);
              } else {
                await sendEstimateViaWhatsApp(phoneNumber, formattedEstimate);
              }
            },
          },
        ],
        'plain-text'
      );
    } catch (error) {
      console.error('Error sending estimate:', error);
      Alert.alert('Error', 'Failed to send estimate. Please try again.');
    }
  };

  const handleQuickSuggestion = (suggestion) => {
    // Send the suggestion as a new message
    handleSend(suggestion, false);
  };

  const renderVisualElement = (element, index) => {
    switch (element.type) {
      case 'project-card':
        return <ProjectCard key={index} data={element.data} onAction={handleAction} />;
      case 'worker-list':
        return <WorkerList key={index} data={element.data} />;
      case 'budget-chart':
        return <BudgetChart key={index} data={element.data} />;
      case 'photo-gallery':
        return <PhotoGallery key={index} data={element.data} onAction={handleAction} />;
      case 'estimate-preview':
        return <EstimatePreview key={index} data={element.data} onAction={handleAction} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Bar */}
        <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <ThemeSwitch />
        </View>

      {/* Chat Messages and Input Area */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -80 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={[styles.chatArea, { backgroundColor: Colors.background }]}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <AnimatedText
                text="What would you like today?"
                delay={60}
              />
            </View>
          ) : (
            messages.map((message) => (
              <View key={message.id} style={styles.messageContainer}>
                {/* Text bubble */}
                <View
                  style={[
                    styles.messageBubble,
                    message.isUser
                      ? { backgroundColor: Colors.primaryBlue }
                      : { backgroundColor: Colors.lightGray },
                    message.isUser ? styles.userMessage : styles.aiMessage,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      message.isUser
                        ? { color: Colors.white }
                        : { color: Colors.primaryText },
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>

                {/* Visual Elements */}
                {!message.isUser && message.visualElements && message.visualElements.length > 0 && (
                  <View style={styles.visualElementsContainer}>
                    {message.visualElements.map((element, index) =>
                      renderVisualElement(element, index)
                    )}
                  </View>
                )}

                {/* Action Buttons */}
                {!message.isUser && message.actions && message.actions.length > 0 && (
                  <View style={styles.actionsContainer}>
                    {message.actions.map((action, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[styles.actionButton, {
                          backgroundColor: Colors.white,
                          borderColor: Colors.primaryBlue
                        }]}
                        onPress={() => handleAction(action)}
                      >
                        <Text style={[styles.actionButtonText, { color: Colors.primaryBlue }]}>
                          {action.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Quick Suggestions */}
                {!message.isUser && message.quickSuggestions && message.quickSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    {message.quickSuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[styles.suggestionChip, {
                          backgroundColor: Colors.lightGray,
                          borderColor: Colors.border
                        }]}
                        onPress={() => handleQuickSuggestion(suggestion)}
                      >
                        <Text style={[styles.suggestionText, { color: Colors.secondaryText }]}>
                          {suggestion}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* AI Input Component - Moves up with keyboard */}
        <View style={styles.inputWrapper}>
          <AIInputWithSearch
            placeholder="Search the web..."
            onSubmit={handleSend}
            onFileSelect={handleFileSelect}
            onCameraPress={handleCameraOpen}
          />
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  emptySpace: {
    flex: 1,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: Spacing.lg,
    paddingBottom: 100, // Extra padding for last message visibility
  },
  messageContainer: {
    marginBottom: Spacing.lg,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FontSizes.body,
  },
  visualElementsContainer: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actionButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  actionButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  suggestionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: FontSizes.tiny,
  },
  inputWrapper: {
    backgroundColor: 'transparent',
    marginBottom: 70, // Space for navigation bar when keyboard is hidden
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: Spacing.xl,
  },
});
