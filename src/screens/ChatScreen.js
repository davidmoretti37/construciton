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
import { useTheme } from '../contexts/ThemeContext';
import { sendMessageToAI, getProjectContext, analyzeScreenshot, formatProjectConfirmation } from '../services/aiService';
import { ProjectCard, WorkerList, BudgetChart, PhotoGallery, EstimatePreview, ProjectSelector, ExpenseCard, ProjectOverview } from '../components/ChatVisuals';
import { formatEstimate } from '../utils/estimateFormatter';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../utils/messaging';
import { getUserProfile, saveProject, transformScreenshotToProject, getProject } from '../utils/storage';
import TimelinePickerModal from '../components/TimelinePickerModal';
import BudgetInputModal from '../components/BudgetInputModal';
import JobNameInputModal from '../components/JobNameInputModal';
import OrbitalLoader from '../components/OrbitalLoader';

export default function ChatScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const scrollViewRef = useRef(null);
  const [showTimelinePicker, setShowTimelinePicker] = useState(false);
  const [showBudgetInput, setShowBudgetInput] = useState(false);
  const [showJobNameInput, setShowJobNameInput] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  useEffect(() => {
    // Auto-scroll to bottom when new messages appear or AI starts thinking
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isAIThinking]);

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

    // Show AI thinking loader
    setIsAIThinking(true);

    try {
      // Get current project context with saved projects data
      const projectContext = await getProjectContext();

      // Call AI service with conversation history
      const aiResponse = await sendMessageToAI(
        text,
        projectContext,
        conversationHistory
      );

      // Hide AI thinking loader
      setIsAIThinking(false);

      // Add AI response to UI (now with structured data)
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        text: (typeof aiResponse === 'string' ? aiResponse : (aiResponse.text || 'Response received')),
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

      // Hide AI thinking loader on error
      setIsAIThinking(false);

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

      case 'save-project':
        await handleSaveProject(action.data);
        break;

      case 'create-project-from-screenshot':
        await handleCreateProjectFromScreenshot(action.data);
        break;

      case 'set-timeline':
        setCurrentProject(action.data);
        setShowTimelinePicker(true);
        break;

      case 'set-budget':
        setCurrentProject(action.data);
        setShowBudgetInput(true);
        break;

      case 'set-job-name':
        setCurrentProject(action.data);
        setShowJobNameInput(true);
        break;

      case 'assign-workers':
        Alert.alert('Assign Workers', 'Worker assignment feature coming soon!');
        break;

      case 'navigate-to-projects':
        navigation.navigate('Projects');
        break;

      case 'send-estimate-sms':
      case 'send-estimate-whatsapp':
        await handleSendEstimate(action);
        break;

      case 'select-project':
        await handleSelectProject(action.data);
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

  const handleSaveProject = async (projectData) => {
    try {
      // Check if this is an update (has real ID) or new project (temp ID or no ID)
      const isUpdate = projectData.id && !projectData.id.startsWith('temp-');

      // Show confirmation before saving
      Alert.alert(
        isUpdate ? 'Update Project' : 'Save Project',
        isUpdate
          ? `Update project "${projectData.name}"?`
          : `Create project "${projectData.name}" for ${projectData.client}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: isUpdate ? 'Update' : 'Save',
            onPress: async () => {
              const savedProject = await saveProject(projectData);
              if (savedProject) {
                Alert.alert(
                  'Success',
                  isUpdate
                    ? 'Project updated successfully!'
                    : 'Project saved successfully!'
                );

                // Update the SAME message - remove project card and show success
                setMessages((prev) => {
                  const messages = [...prev];

                  // Find the last message with a project-card
                  for (let i = messages.length - 1; i >= 0; i--) {
                    const message = messages[i];
                    if (!message.isUser && message.visualElements) {
                      const projectCardIndex = message.visualElements.findIndex(el => el.type === 'project-card');

                      if (projectCardIndex !== -1) {
                        // Update the message text to show success
                        message.text = isUpdate
                          ? `✅ Project "${savedProject.name}" has been updated successfully!`
                          : `✅ Project "${savedProject.name}" has been created and saved successfully!\n\nYou can find it in your Projects tab.`;

                        // Remove the project card since it's saved
                        message.visualElements = [];

                        // Update actions
                        message.actions = [
                          { label: 'View Projects', type: 'navigate-to-projects', data: {} }
                        ];

                        break; // Exit loop after updating
                      }
                    }
                  }

                  return messages;
                });
              } else {
                Alert.alert('Error', 'Failed to save project. Please try again.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error saving project:', error);
      Alert.alert('Error', 'Failed to save project. Please try again.');
    }
  };

  const handleCreateProjectFromScreenshot = async (screenshotData) => {
    try {
      // Transform screenshot data to project format
      const projectData = transformScreenshotToProject(screenshotData);

      // Save the project
      const savedProject = await saveProject(projectData);
      if (savedProject) {
        Alert.alert('Success', 'Project created from screenshot!');

        // Add AI confirmation message with the project card
        const confirmationMessage = {
          id: Date.now().toString(),
          text: `✅ I've created a project from the screenshot. Here's what I extracted:`,
          isUser: false,
          timestamp: new Date(),
          visualElements: [
            {
              type: 'project-card',
              data: savedProject
            }
          ],
          actions: [
            { label: 'Edit Project', type: 'edit-project', data: { projectId: savedProject.id } },
            { label: 'View All Projects', type: 'navigate-to-projects', data: {} }
          ],
          quickSuggestions: ['Add more details', 'Create another project']
        };
        setMessages((prev) => [...prev, confirmationMessage]);
      } else {
        Alert.alert('Error', 'Failed to create project. Please try again.');
      }
    } catch (error) {
      console.error('Error creating project from screenshot:', error);
      Alert.alert('Error', 'Failed to create project. Please try again.');
    }
  };

  const handleTimelineConfirm = (timelineData) => {
    // Update the current project with timeline data
    const updatedProject = {
      ...currentProject,
      ...timelineData,
    };

    // Update the SAME message - update project card, text, and actions in place
    setMessages((prev) => {
      const messages = [...prev];

      // Find the last message with a project-card
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message.isUser && message.visualElements) {
          const projectCardIndex = message.visualElements.findIndex(el => el.type === 'project-card');

          if (projectCardIndex !== -1) {
            // Update the project-card data
            message.visualElements[projectCardIndex].data = updatedProject;

            // Update the message text to show timeline confirmation
            message.text = `✅ Timeline set! Project will run from ${timelineData.startDate} to ${timelineData.endDate} (${timelineData.daysRemaining} days).\n\nHere's your updated project:`;

            // Update actions: remove "Set Timeline" button since it's configured, keep others
            const existingActions = message.actions || [];
            message.actions = existingActions
              .filter(action => action.type !== 'set-timeline')
              .map(action => {
                // Update project data in all remaining actions
                if (action.type === 'save-project' || action.type === 'set-budget' || action.type === 'set-job-name') {
                  return { ...action, data: updatedProject };
                }
                return action;
              });

            break; // Exit loop after updating the first project-card found
          }
        }
      }

      return messages;
    });

    // Update current project state for future actions
    setCurrentProject(updatedProject);
  };

  const handleBudgetConfirm = (budgetData) => {
    // Update the current project with budget data
    const updatedProject = {
      ...currentProject,
      ...budgetData,
    };

    // Update the SAME message - update project card, text, and actions in place
    setMessages((prev) => {
      const messages = [...prev];

      // Find the last message with a project-card
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message.isUser && message.visualElements) {
          const projectCardIndex = message.visualElements.findIndex(el => el.type === 'project-card');

          if (projectCardIndex !== -1) {
            // Update the project-card data
            message.visualElements[projectCardIndex].data = updatedProject;

            // Update the message text
            message.text = `✅ Budget set to $${budgetData.budget.toLocaleString()}!\n\nHere's your updated project:`;

            // Update actions: remove "Set Budget" button since it's configured, keep others
            const existingActions = message.actions || [];
            message.actions = existingActions
              .filter(action => action.type !== 'set-budget')
              .map(action => {
                // Update project data in all remaining actions
                if (action.type === 'set-timeline' || action.type === 'save-project' || action.type === 'set-job-name') {
                  return { ...action, data: updatedProject };
                }
                return action;
              });

            break;
          }
        }
      }

      return messages;
    });

    // Update current project state for future actions
    setCurrentProject(updatedProject);
  };

  const handleJobNameConfirm = (jobNameData) => {
    // Update the current project with job name data
    const updatedProject = {
      ...currentProject,
      ...jobNameData,
    };

    // Update the SAME message - update project card, text, and actions in place
    setMessages((prev) => {
      const messages = [...prev];

      // Find the last message with a project-card
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message.isUser && message.visualElements) {
          const projectCardIndex = message.visualElements.findIndex(el => el.type === 'project-card');

          if (projectCardIndex !== -1) {
            // Update the project-card data
            message.visualElements[projectCardIndex].data = updatedProject;

            // Update the message text
            message.text = `✅ Job name set to "${jobNameData.name}"!\n\nHere's your updated project:`;

            // Update actions: remove "Set Job Name" button since it's configured, keep others
            const existingActions = message.actions || [];
            message.actions = existingActions
              .filter(action => action.type !== 'set-job-name')
              .map(action => {
                // Update project data in all remaining actions
                if (action.type === 'set-timeline' || action.type === 'save-project' || action.type === 'set-budget') {
                  return { ...action, data: updatedProject };
                }
                return action;
              });

            break;
          }
        }
      }

      return messages;
    });

    // Update current project state for future actions
    setCurrentProject(updatedProject);
  };

  const handleSelectProject = async (data) => {
    try {
      const { projectId, pendingUpdate } = data;

      // Get the full project data
      const project = await getProject(projectId);
      if (!project) {
        Alert.alert('Error', 'Could not load project details. Please try again.');
        return;
      }

      // Merge the pending financial update with the project
      const updatedProject = {
        ...project,
        incomeCollected: (project.incomeCollected || 0) + (pendingUpdate.incomeCollected || 0),
        expenses: (project.expenses || 0) + (pendingUpdate.expenses || 0),
      };

      // Recalculate profit
      updatedProject.profit = updatedProject.incomeCollected - updatedProject.expenses;

      // Also update legacy fields
      updatedProject.spent = updatedProject.expenses;

      // Replace the project-selector message with updated project card
      setMessages((prev) => {
        const messages = [...prev];

        // Find the last message with a project-selector
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i];
          if (!message.isUser && message.visualElements) {
            const selectorIndex = message.visualElements.findIndex(el => el.type === 'project-selector');

            if (selectorIndex !== -1) {
              // Update the message to show the selected project with financial update applied
              message.text = `✅ Updated ${project.name}!\n\nCollected: +$${(pendingUpdate.incomeCollected || 0).toLocaleString()}\nExpenses: +$${(pendingUpdate.expenses || 0).toLocaleString()}\nNew Profit: $${updatedProject.profit.toLocaleString()}`;

              // Replace project-selector with project-card
              message.visualElements = [{
                type: 'project-card',
                data: updatedProject
              }];

              // Add "Update Project" button to save changes
              message.actions = [
                {
                  label: 'Update Project',
                  type: 'save-project',
                  data: updatedProject
                }
              ];

              break;
            }
          }
        }

        return messages;
      });
    } catch (error) {
      console.error('Error selecting project:', error);
      Alert.alert('Error', 'Failed to update project. Please try again.');
    }
  };

  const renderVisualElement = (element, index) => {
    switch (element.type) {
      case 'project-card':
        return <ProjectCard key={index} data={element.data} onAction={handleAction} />;
      case 'project-selector':
        return <ProjectSelector key={index} data={element.data} onAction={handleAction} />;
      case 'worker-list':
        return <WorkerList key={index} data={element.data} />;
      case 'budget-chart':
        return <BudgetChart key={index} data={element.data} />;
      case 'photo-gallery':
        return <PhotoGallery key={index} data={element.data} onAction={handleAction} />;
      case 'estimate-preview':
        return <EstimatePreview key={index} data={element.data} onAction={handleAction} />;
      case 'expense-card':
        return <ExpenseCard key={index} data={element.data} />;
      case 'project-overview':
        return <ProjectOverview key={index} data={element.data} onAction={handleAction} />;
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
          contentContainerStyle={[styles.chatContent, { paddingBottom: 120 }]}
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
            <>
          {messages.map((message) => (
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
                      {typeof message.text === 'string' ? message.text : JSON.stringify(message.text)}
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
                            {action?.label || 'Action'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
            </View>
          ))}

              {/* AI Thinking Loader */}
              {isAIThinking && (
                <View style={styles.loaderContainer}>
                  <OrbitalLoader size={32} />
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* AI Input Component - Moves up with keyboard with shadow */}
        <View style={styles.inputWrapperShadow}>
          <View style={styles.inputWrapper}>
          <AIInputWithSearch
              placeholder="Type a message..."
            onSubmit={handleSend}
            onFileSelect={handleFileSelect}
            onCameraPress={handleCameraOpen}
          />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Timeline Picker Modal */}
      <TimelinePickerModal
        visible={showTimelinePicker}
        onClose={() => setShowTimelinePicker(false)}
        onConfirm={handleTimelineConfirm}
        projectData={currentProject}
      />

      {/* Budget Input Modal */}
      <BudgetInputModal
        visible={showBudgetInput}
        onClose={() => setShowBudgetInput(false)}
        onConfirm={handleBudgetConfirm}
        projectData={currentProject}
      />

      {/* Job Name Input Modal */}
      <JobNameInputModal
        visible={showJobNameInput}
        onClose={() => setShowJobNameInput(false)}
        onConfirm={handleJobNameConfirm}
        projectData={currentProject}
      />
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
  inputWrapperShadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -5,
    },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 15,
  },
  chatContent: {
    padding: Spacing.lg,
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
  loaderContainer: {
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.sm,
  },
});
