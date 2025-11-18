import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import AIInputWithSearch from '../components/AIInputWithSearch';
import AnimatedText from '../components/AnimatedText';
import { useTheme } from '../contexts/ThemeContext';
import { sendMessageToAI, sendMessageToAIStreaming, getProjectContext, analyzeScreenshot, formatProjectConfirmation } from '../services/aiService';
import CoreAgent from '../services/agents/core/CoreAgent';
import { ProjectCard, ProjectPreview, WorkerList, BudgetChart, PhotoGallery, EstimatePreview, EstimateList, InvoicePreview, ProjectSelector, ExpenseCard, ProjectOverview, PhaseOverview } from '../components/ChatVisuals';
import { formatEstimate } from '../utils/estimateFormatter';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../utils/messaging';
import { getUserProfile, saveProject, transformScreenshotToProject, getProject, saveEstimate, updateEstimate, createInvoiceFromEstimate, markInvoiceAsPaid, updateInvoicePDF, getInvoice, updateTradePricing, updatePhaseProgress, extendPhaseTimeline, startPhase, completePhase, fetchProjectPhases, addTaskToPhase, saveDailyReport, savePhasePaymentAmount, deleteProject } from '../utils/storage';
import { generateInvoicePDF, uploadInvoicePDF, previewInvoicePDF, shareInvoicePDF } from '../utils/pdfGenerator';
import TimelinePickerModal from '../components/TimelinePickerModal';
import BudgetInputModal from '../components/BudgetInputModal';
import JobNameInputModal from '../components/JobNameInputModal';
import AddCustomServiceModal from '../components/AddCustomServiceModal';
import OrbitalLoader from '../components/OrbitalLoader';

export default function ChatScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const scrollViewRef = useRef(null);
  const [showTimelinePicker, setShowTimelinePicker] = useState(false);
  const [showBudgetInput, setShowBudgetInput] = useState(false);
  const [showJobNameInput, setShowJobNameInput] = useState(false);
  const [showAddCustomService, setShowAddCustomService] = useState(false);
  const [pendingEstimateContext, setPendingEstimateContext] = useState(null);
  const [currentProject, setCurrentProject] = useState(null);
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [inputSetValueRef, setInputSetValueRef] = useState(null); // Store setValue function from input
  const [selectedSuggestions, setSelectedSuggestions] = useState({}); // Store selected quick suggestions per message (messageIndex -> array)
  const [customInputs, setCustomInputs] = useState({}); // Store custom input state per message: {messageId: {visible: bool, value: string}}
  const aiTimeoutRef = useRef(null); // Store timeout ID for AI response

  // Memoize the callback to prevent infinite loops
  const handlePopulateInput = useCallback((callback) => {
    console.log('onPopulateInput received callback in parent');
    setInputSetValueRef(() => callback);
  }, []);

  useEffect(() => {
    console.log('inputSetValueRef changed:', !!inputSetValueRef, typeof inputSetValueRef);
  }, [inputSetValueRef]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages appear or AI starts thinking
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isAIThinking]);

  const handleSend = async (text, withSearch) => {
    if (text.trim() === '') return;

    // Check if user clicked "➕ Other" to add custom service
    if (text === '➕ Other') {
      // Store context for when they finish adding the service
      const projectContext = await getProjectContext();
      setPendingEstimateContext(projectContext);
      setShowAddCustomService(true);
      return;
    }

    // Generate unique IDs using timestamp + random to avoid collisions
    const userMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const aiMessageId = `${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`;

    // Add user message to UI
    const userMessage = {
      id: userMessageId,
      text: text,
      isUser: true,
      timestamp: new Date(),
      withSearch: withSearch,
    };

    setMessages((prev) => [...prev, userMessage]);

    // Dismiss keyboard so user can see AI response
    Keyboard.dismiss();

    // Show ONLY loading spinner (no bubble yet)
    setIsAIThinking(true);
    let messageCreated = false; // Track if we've created the message bubble

    // Set 50-second timeout
    aiTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ AI response timeout - 50 seconds elapsed');
      setIsAIThinking(false);

      if (!messageCreated) {
        const timeoutMessage = {
          id: aiMessageId,
          text: "Sorry, the AI is taking longer than expected to respond. This might be due to network issues or server load.",
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [{
            type: 'retry',
            label: 'Retry',
            data: { originalMessage: text }
          }],
          quickSuggestions: [],
        };

        setMessages((prev) => [...prev, timeoutMessage]);
        messageCreated = true;
      }
    }, 50000); // 50 seconds

    try {
      // Use CoreAgent for intelligent multi-agent routing with execution planning
      await CoreAgent.processStreaming(
        text,
        conversationHistory, // Pass conversation history
        // onChunk callback - Create bubble on first chunk, then update text
        (cleanText) => {
          if (!messageCreated && cleanText) {
            // First chunk arrived - clear timeout, hide loading, create bubble with text
            if (aiTimeoutRef.current) {
              clearTimeout(aiTimeoutRef.current);
              aiTimeoutRef.current = null;
            }
            setIsAIThinking(false);
            messageCreated = true;

            const aiMessage = {
              id: aiMessageId,
              text: cleanText,
              isUser: false,
              timestamp: new Date(),
              visualElements: [],
              actions: [],
              quickSuggestions: [],
            };

            setMessages((prev) => [...prev, aiMessage]);
          } else if (messageCreated) {
            // Update existing bubble with more text
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, text: cleanText }
                  : msg
              )
            );
          }
        },
        // onComplete callback - Add visual elements
        (parsedResponse) => {
          setIsAIThinking(false);

          // Debug logging
          if (__DEV__) {
            console.log('📊 onComplete received:', {
              hasVisualElements: parsedResponse.visualElements?.length > 0,
              visualCount: parsedResponse.visualElements?.length || 0,
              types: parsedResponse.visualElements?.map(v => v.type) || []
            });
          }

          // CRITICAL: Force state update by using functional update with timestamp
          // This ensures React detects the change and re-renders with visual elements
          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id === aiMessageId) {
                return {
                  ...msg,
                  text: parsedResponse.text || msg.text,
                  visualElements: parsedResponse.visualElements || [],
                  actions: parsedResponse.actions || [],
                  quickSuggestions: parsedResponse.quickSuggestions || [],
                  lastUpdated: Date.now(), // Force React to detect change
                };
              }
              return msg;
            });

            // Verify the update worked
            if (__DEV__) {
              const updatedMsg = updated.find(m => m.id === aiMessageId);
              console.log('✅ Message updated with visualElements:', updatedMsg?.visualElements?.length || 0);
            }

            return updated;
          });

          // AUTO-EXECUTE financial update actions (deposit/expense)
          const updateAction = parsedResponse.actions?.find(action => action.type === 'update-project-finances');
          if (updateAction) {
            console.log('🔄 Auto-executing financial update:', updateAction.data);
            handleUpdateProjectFinances(updateAction.data);
          }

          // Update conversation history
          setConversationHistory((prev) => [
            ...prev,
            { role: 'user', content: text },
            { role: 'assistant', content: parsedResponse.text || '' },
          ]);
        },
        // onError callback
        (error) => {
          console.error('Streaming error:', error);
          // Clear timeout on error
          if (aiTimeoutRef.current) {
            clearTimeout(aiTimeoutRef.current);
            aiTimeoutRef.current = null;
          }
          setIsAIThinking(false);

          // Only add error message if we haven't created a message bubble yet
          if (!messageCreated) {
            setMessages((prev) => {
              // Double-check: only add if this ID doesn't already exist
              const exists = prev.some(msg => msg.id === aiMessageId);
              if (exists) return prev;

              const errorMessage = {
                id: aiMessageId,
                text: `Sorry, I encountered an error: ${error.message}. Please check if the backend server is running.`,
                isUser: false,
                timestamp: new Date(),
                visualElements: [],
                actions: [],
                quickSuggestions: [],
              };

              return [...prev, errorMessage];
            });
            messageCreated = true;
          }
        }
      );
    } catch (error) {
      console.error('Error calling AI:', error);
      // Clear timeout on error
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
      setIsAIThinking(false);

      // Only add error message if onError callback didn't already add one
      if (!messageCreated) {
        setMessages((prev) => {
          // Double-check: only add if this ID doesn't already exist
          const exists = prev.some(msg => msg.id === aiMessageId);
          if (exists) return prev;

          const errorMessage = {
            id: aiMessageId,
            text: `Sorry, I encountered an error: ${error.message}. Please check if the backend server is running.`,
            isUser: false,
            timestamp: new Date(),
            visualElements: [],
            actions: [],
            quickSuggestions: [],
          };

          return [...prev, errorMessage];
        });
      }
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
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
              id: `${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
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
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
              id: `${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
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
      case 'save-project':
      case 'confirm-project':
        await handleSaveProject(action.data);
        break;

      case 'edit-project-details':
        // Send a message to restart the conversation with editing mode
        handleSend('I want to edit the project details', false);
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

      case 'retry':
        // Retry the original message
        if (action.data?.originalMessage) {
          handleSend(action.data.originalMessage, false);
        }
        break;

      case 'send-estimate-sms':
      case 'send-estimate-whatsapp':
        await handleSendEstimate(action);
        break;

      case 'save-estimate':
        await handleSaveEstimate(action.data);
        break;

      case 'save-project':
        await handleSaveProject(action.data);
        break;

      case 'delete-project':
        await handleDeleteProject(action.data);
        break;

      case 'update-estimate':
        await handleUpdateEstimate(action.data);
        break;

      case 'create-estimate':
        // Trigger estimate creation flow for the specified project
        const projectName = action.projectName || action.data?.projectName;
        if (projectName) {
          handleSend(`create estimate for ${projectName}`, false);
        }
        break;

      case 'generate-estimate':
      case 'confirm-estimate':
        // AI wants to show estimate preview - send message back to AI to continue
        handleSend('yes, create the estimate', false);
        break;

      case 'convert-estimate-to-invoice':
        await handleConvertToInvoice(action.data);
        break;

      case 'preview-invoice-pdf':
        await handlePreviewInvoicePDF(action.data);
        break;

      case 'share-invoice-pdf':
        await handleShareInvoicePDF(action.data);
        break;

      case 'view-estimate':
        // Show estimate details in chat
        console.log('View estimate:', action.data);
        break;

      case 'select-project':
        await handleSelectProject(action.data);
        break;

      case 'update-project-finances':
        await handleUpdateProjectFinances(action.data);
        break;

      case 'update-phase-progress':
        await handleUpdatePhaseProgress(action.data);
        break;

      case 'extend-phase-timeline':
        await handleExtendPhaseTimeline(action.data);
        break;

      case 'start-phase':
        await handleStartPhase(action.data);
        break;

      case 'complete-phase':
        await handleCompletePhase(action.data);
        break;

      case 'view-project-phases':
        await handleViewProjectPhases(action.data);
        break;

      case 'add-phase-tasks':
        await handleAddPhaseTasks(action.data);
        break;

      case 'save-daily-report':
        await handleSaveDailyReport(action.data);
        break;

      case 'set-phase-payment':
        await handleSetPhasePayment(action.data);
        break;

      default:
        console.log('Unknown action:', action.type);
    }
  };

  const handleSendEstimate = async (action) => {
    try {
      // Get user profile for business info
      const userProfile = await getUserProfile();
      const estimateData = action.data;

      // Check if phone number is already in the estimate data
      const existingPhone = estimateData.clientPhone || estimateData.client_phone || estimateData.phone;

      const sendEstimate = async (phoneNumber) => {
        if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
          Alert.alert('Invalid Phone', 'Please enter a valid phone number');
          return;
        }

        // Format the estimate
        const formattedEstimate = formatEstimate(
          {
            client: estimateData.client || estimateData.clientName,
            projectName: estimateData.projectName,
            items: estimateData.items,
          },
          userProfile.businessInfo
        );

        // Send via SMS or WhatsApp
        if (action.type === 'send-estimate-sms') {
          await sendEstimateViaSMS(phoneNumber, formattedEstimate);
          Alert.alert('Success', 'Estimate sent via SMS!');
        } else {
          await sendEstimateViaWhatsApp(phoneNumber, formattedEstimate);
          Alert.alert('Success', 'Estimate sent via WhatsApp!');
        }
      };

      // If phone exists, send immediately; otherwise prompt
      if (existingPhone) {
        await sendEstimate(existingPhone);
      } else {
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
              onPress: sendEstimate,
            },
          ],
          'plain-text'
        );
      }
    } catch (error) {
      console.error('Error sending estimate:', error);
      Alert.alert('Error', 'Failed to send estimate. Please try again.');
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
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

  const handleCustomServiceAdd = async (serviceData) => {
    try {
      // Get user profile to determine which trade to add this to
      const profile = await getUserProfile();

      // Find the appropriate trade based on user's enabled trades
      // For now, we'll add it to a general "custom" trade or the first available trade
      let tradeId = 'custom';

      if (profile?.trades && profile.trades.length > 0) {
        // Use the first enabled trade as the default location for custom services
        tradeId = profile.trades[0];
      }

      // Create unique ID for custom service
      const customId = `custom_${Date.now()}`;

      // Get existing pricing for this trade
      const existingPricing = (profile?.pricing && profile.pricing[tradeId]) || {};

      // Add the new custom service
      const updatedPricing = {
        ...existingPricing,
        [customId]: {
          label: serviceData.label,
          unit: serviceData.unit,
          price: parseFloat(serviceData.price),
        }
      };

      // Save to storage
      await updateTradePricing(tradeId, updatedPricing);

      // Close the modal
      setShowAddCustomService(false);

      // Format the service as it would appear in quickSuggestions
      const formattedService = `${serviceData.label} ($${serviceData.price}/${serviceData.unit})`;

      // Automatically send this as the user's selection
      await handleSend(formattedService, false);

      Alert.alert(
        'Service Added!',
        `${serviceData.label} has been saved to your pricing and will appear in future estimates.`
      );
    } catch (error) {
      console.error('Error adding custom service:', error);
      Alert.alert('Error', 'Failed to save custom service. Please try again.');
    }
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

      // SAVE DIRECTLY TO DATABASE - No button needed!
      const saved = await saveProject(updatedProject);
      if (!saved) {
        Alert.alert('Error', 'Failed to save changes to database.');
        return;
      }

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

              // No actions needed - already saved!
              message.actions = [];

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

  const handleUpdateProjectFinances = async (data) => {
    try {
      const { projectId, projectName, incomeCollected, expenses } = data;

      // Get the full project data
      const project = await getProject(projectId);
      if (!project) {
        Alert.alert('Error', 'Could not load project details. Please try again.');
        return;
      }

      // Update financial fields
      const updatedProject = {
        ...project,
        incomeCollected: (project.incomeCollected || 0) + (incomeCollected || 0),
        expenses: (project.expenses || 0) + (expenses || 0),
      };

      // Recalculate profit
      updatedProject.profit = updatedProject.incomeCollected - updatedProject.expenses;
      updatedProject.spent = updatedProject.expenses;

      // SAVE DIRECTLY TO DATABASE
      const saved = await saveProject(updatedProject);
      if (!saved) {
        Alert.alert('Error', 'Failed to save changes to database.');
        return;
      }

      // Update the last AI message to show success
      setMessages((prev) => {
        const messages = [...prev];

        // Find the last AI message
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i];
          if (!message.isUser) {
            // Update message text to show success
            const depositText = incomeCollected ? `\nCollected: +$${incomeCollected.toLocaleString()}` : '';
            const expenseText = expenses ? `\nExpenses: +$${expenses.toLocaleString()}` : '';
            message.text = `✅ Updated ${projectName}!${depositText}${expenseText}\nNew Profit: $${updatedProject.profit.toLocaleString()}`;

            // Update or add project card
            message.visualElements = [{
              type: 'project-card',
              data: updatedProject
            }];

            // Remove the action button - no longer needed
            message.actions = [];

            break;
          }
        }

        return messages;
      });
    } catch (error) {
      console.error('Error updating project finances:', error);
      Alert.alert('Error', 'Failed to update project. Please try again.');
    }
  };

  // Phase Management Handlers
  const handleUpdatePhaseProgress = async (data) => {
    try {
      const { phaseId, phaseName, percentage } = data;

      const success = await updatePhaseProgress(phaseId, percentage);
      if (success) {
        addAIMessage(`✅ Updated ${phaseName} to ${percentage}% complete!`);
      } else {
        Alert.alert('Error', 'Failed to update phase progress.');
      }
    } catch (error) {
      console.error('Error updating phase progress:', error);
      Alert.alert('Error', 'Failed to update phase progress.');
    }
  };

  const handleExtendPhaseTimeline = async (data) => {
    try {
      const { phaseId, phaseName, extraDays, reason } = data;

      const success = await extendPhaseTimeline(phaseId, extraDays, reason || '');
      if (success) {
        addAIMessage(`✅ Extended ${phaseName} by ${extraDays} days!`);
      } else {
        Alert.alert('Error', 'Failed to extend phase timeline.');
      }
    } catch (error) {
      console.error('Error extending phase timeline:', error);
      Alert.alert('Error', 'Failed to extend phase timeline.');
    }
  };

  const handleStartPhase = async (data) => {
    try {
      const { phaseId, phaseName } = data;

      const success = await startPhase(phaseId);
      if (success) {
        addAIMessage(`✅ Started ${phaseName} phase!`);
      } else {
        Alert.alert('Error', 'Failed to start phase.');
      }
    } catch (error) {
      console.error('Error starting phase:', error);
      Alert.alert('Error', 'Failed to start phase.');
    }
  };

  const handleCompletePhase = async (data) => {
    try {
      const { phaseId, phaseName } = data;

      const success = await completePhase(phaseId);
      if (success) {
        addAIMessage(`✅ Marked ${phaseName} as complete!`);
      } else {
        Alert.alert('Error', 'Failed to complete phase.');
      }
    } catch (error) {
      console.error('Error completing phase:', error);
      Alert.alert('Error', 'Failed to complete phase.');
    }
  };

  const handleViewProjectPhases = async (data) => {
    try {
      const { projectId } = data;

      // Fetch project phases
      const phases = await fetchProjectPhases(projectId);
      const project = await getProject(projectId);

      if (phases && phases.length > 0 && project) {
        // Show phases in chat
        const aiMessage = {
          id: `ai-${Date.now()}`,
          text: `Here are the phases for ${project.name}:`,
          isUser: false,
          visualElements: [{
            type: 'phase-overview',
            data: {
              projectId: project.id,
              projectName: project.name,
              phases: phases
            }
          }],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        addAIMessage('This project does not have any phases configured.');
      }
    } catch (error) {
      console.error('Error viewing project phases:', error);
      Alert.alert('Error', 'Failed to load project phases.');
    }
  };

  const handleAddPhaseTasks = async (data) => {
    try {
      const { phaseId, phaseName, tasks } = data;

      // Add multiple tasks to phase
      for (const taskDescription of tasks) {
        await addTaskToPhase(phaseId, taskDescription, 0);
      }

      addAIMessage(`✅ Added ${tasks.length} task${tasks.length !== 1 ? 's' : ''} to ${phaseName} phase!`);
    } catch (error) {
      console.error('Error adding phase tasks:', error);
      Alert.alert('Error', 'Failed to add tasks to phase.');
    }
  };

  const handleSaveDailyReport = async (data) => {
    try {
      const { workerId, projectId, phaseId, photos, completedStepIds, notes } = data;

      const report = await saveDailyReport(
        workerId,
        projectId,
        phaseId,
        photos || [],
        completedStepIds || [],
        notes || ''
      );

      if (report) {
        addAIMessage(`✅ Daily report saved! ${completedStepIds?.length || 0} tasks marked complete.`);
      } else {
        Alert.alert('Error', 'Failed to save daily report.');
      }
    } catch (error) {
      console.error('Error saving daily report:', error);
      Alert.alert('Error', 'Failed to save daily report.');
    }
  };

  const handleSetPhasePayment = async (data) => {
    try {
      const { phaseId, phaseName, amount } = data;

      const success = await savePhasePaymentAmount(phaseId, amount);

      if (success) {
        addAIMessage(`✅ Set payment for ${phaseName} to $${amount.toLocaleString()}`);
      } else {
        Alert.alert('Error', 'Failed to set phase payment amount.');
      }
    } catch (error) {
      console.error('Error setting phase payment:', error);
      Alert.alert('Error', 'Failed to set phase payment amount.');
    }
  };

  const handleSaveEstimate = async (estimateData) => {
    try {
      // 🔧 CRITICAL FIX: Extract complete data from visualElement if action data is incomplete
      let completeEstimateData = estimateData;

      // Check if phases are missing tasks (common AI issue)
      const actionHasTasks = estimateData.phases?.some(p => p.tasks?.length > 0);

      if (!actionHasTasks) {
        console.log('⚠️ Action data missing tasks, searching for complete data in preview...');

        // Find the most recent message with estimate preview
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg.isUser && msg.visualElements) {
            const estimatePreview = msg.visualElements.find(ve => ve.type === 'estimate-preview');
            if (estimatePreview && estimatePreview.data) {
              const previewHasTasks = estimatePreview.data.phases?.some(p => p.tasks?.length > 0);

              if (previewHasTasks) {
                console.log('✅ Found complete data in preview, merging with action data');
                completeEstimateData = {
                  ...estimateData,
                  // Use preview phases (has tasks)
                  phases: estimatePreview.data.phases || estimateData.phases,
                  // Use preview schedule (has phaseSchedule)
                  schedule: estimatePreview.data.schedule || estimateData.schedule,
                  // Use preview scope (complete data)
                  scope: estimatePreview.data.scope || estimateData.scope,
                  // Use preview line items if missing
                  lineItems: estimateData.lineItems || estimatePreview.data.items || [],
                };
                console.log('📊 Merged data:', {
                  phasesCount: completeEstimateData.phases?.length,
                  tasksInPhases: completeEstimateData.phases?.map(p => p.tasks?.length || 0),
                  hasSchedule: !!completeEstimateData.schedule,
                  hasScope: !!completeEstimateData.scope,
                  lineItemsCount: completeEstimateData.lineItems?.length
                });
                break;
              }
            }
          }
        }
      }

      // If estimate has a linked project, check if project already has estimate data
      if (completeEstimateData.projectId) {
        const existingProject = await getProject(completeEstimateData.projectId);

        if (existingProject && (existingProject.budget > 0 || existingProject.phases)) {
          // Project already has data - ask user what to do
          Alert.alert(
            'Project Has Existing Data',
            'This project already has estimate data. How would you like to proceed?',
            [
              {
                text: 'Cancel',
                style: 'cancel'
              },
              {
                text: 'Add to Existing',
                onPress: async () => {
                  // Save estimate with merge flag
                  const savedEstimate = await saveEstimate({ ...completeEstimateData, mergeWithProject: true });
                  if (savedEstimate) {
                    Alert.alert('Success', `Estimate ${savedEstimate.estimate_number} saved and added to project!`);
                  }
                }
              },
              {
                text: 'Override Project',
                style: 'destructive',
                onPress: async () => {
                  // Save estimate with override flag (default behavior)
                  const savedEstimate = await saveEstimate({ ...completeEstimateData, overrideProject: true });
                  if (savedEstimate) {
                    Alert.alert('Success', `Estimate ${savedEstimate.estimate_number} saved! Project data has been replaced.`);
                  }
                }
              }
            ]
          );
        } else {
          // Project is empty or new - just save normally
          const savedEstimate = await saveEstimate(completeEstimateData);
          if (savedEstimate) {
            Alert.alert('Success', `Estimate ${savedEstimate.estimate_number} saved!`);
          }
        }
      } else {
        // No linked project - just save the estimate
        const savedEstimate = await saveEstimate(completeEstimateData);
        if (savedEstimate) {
          Alert.alert('Success', `Estimate ${savedEstimate.estimate_number} saved!`);
        }
      }
    } catch (error) {
      console.error('Error saving estimate:', error);
      Alert.alert('Error', 'Failed to save estimate. Please try again.');
    }
  };

  const handleSaveProject = async (projectData) => {
    try {
      console.log('💾 [handleSaveProject] Saving project with data:', {
        hasPhases: !!projectData.phases,
        phasesCount: projectData.phases?.length,
        hasSchedule: !!projectData.schedule,
        hasScope: !!projectData.scope
      });

      // Extract complete data from visualElement if action data is incomplete
      let completeProjectData = projectData;

      // Check if phases are missing tasks (common AI issue)
      const actionHasTasks = projectData.phases?.some(p => p.tasks?.length > 0);

      if (!actionHasTasks) {
        console.log('⚠️ Action data missing tasks, searching for complete data in preview...');

        // Find the most recent message with project preview
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg.isUser && msg.visualElements) {
            const projectPreview = msg.visualElements.find(ve => ve.type === 'project-preview');
            if (projectPreview && projectPreview.data) {
              const previewHasTasks = projectPreview.data.phases?.some(p => p.tasks?.length > 0);

              if (previewHasTasks) {
                console.log('✅ Found complete data in preview, merging with action data');
                completeProjectData = {
                  ...projectData,
                  // Use preview phases (has tasks)
                  phases: projectPreview.data.phases || projectData.phases,
                  // Use preview schedule (has phaseSchedule)
                  schedule: projectPreview.data.schedule || projectData.schedule,
                  // Use preview scope (complete data)
                  scope: projectPreview.data.scope || projectData.scope,
                  // Use preview line items if missing
                  lineItems: projectData.lineItems || projectPreview.data.items || [],
                };
                console.log('📊 Merged project data:', {
                  phasesCount: completeProjectData.phases?.length,
                  tasksInPhases: completeProjectData.phases?.map(p => p.tasks?.length || 0),
                  hasSchedule: !!completeProjectData.schedule,
                  hasScope: !!completeProjectData.scope,
                  lineItemsCount: completeProjectData.lineItems?.length
                });
                break;
              }
            }
          }
        }
      }

      // Save the project with complete data
      const savedProject = await saveProject(completeProjectData);

      if (savedProject) {
        console.log('✅ Project saved successfully:', savedProject.id);
        Alert.alert(
          'Success',
          `Project "${savedProject.name}" has been saved!`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Optionally navigate to projects screen
                // navigation.navigate('Projects');
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error saving project:', error);
      Alert.alert('Error', 'Failed to save project. Please try again.');
    }
  };

  const handleDeleteProject = async (deleteData) => {
    try {
      const { projectId, projectName } = deleteData;

      if (!projectId) {
        Alert.alert('Error', 'Project ID not found');
        return;
      }

      // Show confirmation alert
      Alert.alert(
        'Delete Project',
        `Are you sure you want to delete "${projectName}"? This action cannot be undone.`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const success = await deleteProject(projectId);
              if (success) {
                Alert.alert('Success', `Project "${projectName}" has been deleted`);
                // Send a confirmation message to the chat
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ Project "${projectName}" has been successfully deleted.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                  quickSuggestions: ['Show all projects', 'Create new project']
                };
                setMessages(prev => [...prev, confirmationMessage]);
              } else {
                Alert.alert('Error', 'Failed to delete project');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting project:', error);
      Alert.alert('Error', 'Failed to delete project. Please try again.');
    }
  };

  const handleUpdateEstimate = async (estimateData) => {
    try {
      const updatedEstimate = await updateEstimate(estimateData);
      if (updatedEstimate) {
        Alert.alert('Success', 'Estimate and linked project updated successfully!');

        // Update the message in the chat with the new data
        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            // Find the message with the estimate preview
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasEstimate = msg.visualElements.some(
                (ve) => ve.type === 'estimate-preview' &&
                       (ve.data.id === estimateData.id || ve.data.estimateId === estimateData.estimateId)
              );

              if (hasEstimate) {
                // Update the visual element with new data
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview' &&
                        (ve.data.id === estimateData.id || ve.data.estimateId === estimateData.estimateId)) {
                      return {
                        ...ve,
                        data: updatedEstimate
                      };
                    }
                    return ve;
                  })
                };
              }
            }
            return msg;
          });
        });
      }
    } catch (error) {
      console.error('Error updating estimate:', error);
      Alert.alert('Error', 'Failed to update estimate. Please try again.');
    }
  };

  const handleConvertToInvoice = async (estimateData) => {
    try {
      const invoice = await createInvoiceFromEstimate(estimateData.id || estimateData.estimateId);
      if (invoice) {
        Alert.alert(
          'Invoice Created',
          `Invoice ${invoice.invoice_number} has been created from this estimate!`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Add a message to chat showing the invoice
                const aiMessage = {
                  id: `ai-${Date.now()}`,
                  text: `✅ Invoice ${invoice.invoice_number} created successfully!`,
                  isUser: false,
                  visualElements: [
                    {
                      type: 'invoice-preview',
                      data: invoice
                    }
                  ],
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, aiMessage]);
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error converting to invoice:', error);
      Alert.alert('Error', 'Failed to create invoice. Please try again.');
    }
  };

  const handleGenerateInvoicePDF = async (invoiceData) => {
    try {
      // Show loading alert
      Alert.alert('Generating PDF', 'Please wait while we generate your invoice PDF...');

      // Get user profile for business info
      const userProfile = await getUserProfile();

      // Generate PDF
      const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

      // Upload to Supabase storage
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;
      const publicUrl = await uploadInvoicePDF(pdfUri, invNumber);

      // Update invoice record with PDF URL
      await updateInvoicePDF(invoiceData.id, publicUrl);

      // Fetch updated invoice
      const updatedInvoice = await getInvoice(invoiceData.id);

      Alert.alert(
        'PDF Generated',
        'Your invoice PDF has been generated successfully!',
        [
          {
            text: 'Share PDF',
            onPress: async () => {
              await shareInvoicePDF(pdfUri, invNumber);
            }
          },
          {
            text: 'View',
            onPress: () => {
              // Update the message with the new PDF URL
              const aiMessage = {
                id: `ai-${Date.now()}`,
                text: `✅ PDF generated successfully for ${invNumber}!`,
                isUser: false,
                visualElements: [
                  {
                    type: 'invoice-preview',
                    data: updatedInvoice
                  }
                ],
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, aiMessage]);
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    }
  };

  const handleDownloadInvoicePDF = async (invoiceData) => {
    try {
      if (!invoiceData.pdf_url && !invoiceData.pdfUrl) {
        Alert.alert('No PDF', 'Please generate the PDF first.');
        return;
      }

      const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;

      // Share the PDF
      await shareInvoicePDF(pdfUrl, invNumber);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      Alert.alert('Error', 'Failed to download PDF. Please try again.');
    }
  };

  const handleSendInvoiceEmail = async (invoiceData) => {
    try {
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;
      const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;

      if (!pdfUrl) {
        Alert.alert('No PDF', 'Please generate the PDF first before emailing.');
        return;
      }

      // Get user profile for business info
      const userProfile = await getUserProfile();

      // Re-generate PDF locally for sharing
      const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

      // Share via system share dialog (includes email option)
      await shareInvoicePDF(pdfUri, invNumber);
    } catch (error) {
      console.error('Error sending invoice email:', error);
      Alert.alert('Error', 'Failed to send invoice. Please try again.');
    }
  };

  const handlePreviewInvoicePDF = async (invoiceData) => {
    try {
      // Get user profile for business info
      const userProfile = await getUserProfile();

      // Generate PDF
      const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;

      // Upload to Supabase storage to get public URL
      const publicUrl = await uploadInvoicePDF(pdfUri, invNumber);

      // Update invoice record with PDF URL (only if invoice has been saved to DB)
      if (invoiceData.id) {
        await updateInvoicePDF(invoiceData.id, publicUrl);
      }

      // Open the PDF in viewer using public URL
      await previewInvoicePDF(publicUrl, invNumber);
    } catch (error) {
      console.error('Error previewing PDF:', error);
      Alert.alert('Error', 'Failed to preview PDF. Please try again.');
    }
  };

  const handleShareInvoicePDF = async (invoiceData) => {
    try {
      // Get user profile for business info
      const userProfile = await getUserProfile();
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;

      // Check if PDF already exists
      if (invoiceData.pdf_url || invoiceData.pdfUrl) {
        // Re-generate PDF locally for sharing (in case of updates)
        const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);
        await shareInvoicePDF(pdfUri, invNumber);
      } else {
        // Generate PDF first
        const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

        // Upload to Supabase storage
        const publicUrl = await uploadInvoicePDF(pdfUri, invNumber);

        // Update invoice record with PDF URL (only if invoice has been saved to DB)
        if (invoiceData.id) {
          await updateInvoicePDF(invoiceData.id, publicUrl);
        }

        // Share via native share menu
        await shareInvoicePDF(pdfUri, invNumber);
      }
    } catch (error) {
      console.error('Error sharing invoice:', error);
      Alert.alert('Error', 'Failed to share invoice. Please try again.');
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
      case 'project-preview':
        return <ProjectPreview key={index} data={element.data} onAction={handleAction} />;
      case 'estimate-preview':
        return <EstimatePreview key={index} data={element.data} onAction={handleAction} />;
      case 'estimate-list':
        return <EstimateList key={index} data={element.data} onAction={handleAction} />;
      case 'invoice-preview':
        return <InvoicePreview key={index} data={element.data} onAction={handleAction} />;
      case 'expense-card':
        return <ExpenseCard key={index} data={element.data} />;
      case 'project-overview':
        return <ProjectOverview key={index} data={element.data} onAction={handleAction} />;
      case 'phase-overview':
        return <PhaseOverview key={index} data={element.data} onAction={handleAction} />;
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
          {messages.map((message, messageIndex) => {
            // Get selections for this specific message
            const messageSelections = selectedSuggestions[message.id] || [];

            return (
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

                  {/* Action Buttons - Skip for invoice-preview (has its own buttons) */}
                  {!message.isUser &&
                   message.actions &&
                   message.actions.length > 0 &&
                   !message.visualElements?.some(el => el.type === 'invoice-preview') && (
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

                  {/* Quick Suggestions - Skip for invoice-preview (has its own buttons) */}
                  {!message.isUser &&
                   message.quickSuggestions &&
                   message.quickSuggestions.length > 0 &&
                   !message.visualElements?.some(el => el.type === 'invoice-preview') && (
                    <View>
                      <View style={styles.quickSuggestionsContainer}>
                        {message.quickSuggestions.map((suggestion, index) => {
                          // Handle both string suggestions and object suggestions {label, value}
                          const suggestionText = typeof suggestion === 'string' ? suggestion : suggestion.label;
                          const suggestionValue = typeof suggestion === 'string' ? suggestion : suggestion.value;
                          const isSelected = messageSelections.includes(suggestionValue);

                          // Check if this is a numeric value (single-select, populate input)
                          const isNumericValue = /^[\d\$,\.]+$/.test(suggestionValue.trim());

                          // Check if this is a custom input button (Other, Custom, +, etc.)
                          const lowerText = suggestionText.toLowerCase();
                          const isCustomInputButton = lowerText.includes('other') ||
                                                      lowerText.includes('custom') ||
                                                      lowerText.startsWith('+') ||
                                                      lowerText.startsWith('➕');

                          // Check if this is a value input button (asking for size, budget, date, amount, etc.)
                          // Only trigger input if it's explicitly asking for a custom value (e.g., "Enter size", "Custom amount")
                          const isValueInputButton = (lowerText.includes('enter') && (lowerText.includes('size') || lowerText.includes('budget') || lowerText.includes('amount'))) ||
                                                     (lowerText.includes('specify') && (lowerText.includes('size') || lowerText.includes('budget') || lowerText.includes('amount'))) ||
                                                     (lowerText.includes('custom') && (lowerText.includes('size') || lowerText.includes('budget') || lowerText.includes('amount') || lowerText.includes('value')));

                          return (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.quickSuggestionChip,
                                {
                                  backgroundColor: isSelected ? Colors.primaryBlue : Colors.primaryBlue + '15',
                                  borderColor: Colors.primaryBlue
                                }
                              ]}
                              onPress={() => {
                                // Check if this is a custom input button OR value input button
                                if (isCustomInputButton || isValueInputButton) {
                                  // Show inline custom input with label as placeholder
                                  setCustomInputs(prev => ({
                                    ...prev,
                                    [message.id]: {
                                      visible: true,
                                      value: '',
                                      placeholder: suggestionText // Use button text as placeholder
                                    }
                                  }));
                                  return;
                                }

                                // Check if this is a numeric value
                                if (isNumericValue && inputSetValueRef) {
                                  inputSetValueRef(suggestionValue + ' ');
                                  // Clear selections for this message
                                  setSelectedSuggestions(prev => ({
                                    ...prev,
                                    [message.id]: []
                                  }));
                                  return; // Don't toggle selection
                                }

                                // Default behavior: Auto-send the suggestion
                                handleSend(suggestionValue, false);
                              }}
                            >
                              <Text style={[
                                styles.quickSuggestionText,
                                { color: isSelected ? '#FFFFFF' : Colors.primaryBlue }
                              ]}>
                                {suggestionText}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                        {/* Show custom selections as chips */}
                        {messageSelections.filter(sel =>
                          !message.quickSuggestions.some(sug => {
                            const suggestionValue = typeof sug === 'string' ? sug : sug.value;
                            return suggestionValue === sel;
                          })
                        ).map((customValue, idx) => (
                          <TouchableOpacity
                            key={`custom-${idx}`}
                            style={[
                              styles.quickSuggestionChip,
                              {
                                backgroundColor: Colors.primaryBlue,
                                borderColor: Colors.primaryBlue
                              }
                            ]}
                            onPress={() => {
                              // Remove custom selection
                              setSelectedSuggestions(prev => ({
                                ...prev,
                                [message.id]: messageSelections.filter(s => s !== customValue)
                              }));
                            }}
                          >
                            <Text style={[
                              styles.quickSuggestionText,
                              { color: '#FFFFFF' }
                            ]}>
                              {customValue}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Inline Custom Input */}
                      {customInputs[message.id]?.visible && (
                        <View style={styles.customInputContainer}>
                          <TextInput
                            style={[styles.customInput, {
                              color: Colors.primaryText,
                              borderColor: Colors.primaryBlue
                            }]}
                            placeholder={customInputs[message.id]?.placeholder || "Type custom option..."}
                            placeholderTextColor={Colors.secondaryText}
                            value={customInputs[message.id]?.value || ''}
                            onChangeText={(text) => {
                              setCustomInputs(prev => ({
                                ...prev,
                                [message.id]: {
                                  ...prev[message.id],
                                  value: text
                                }
                              }));
                            }}
                            autoFocus
                          />
                          <TouchableOpacity
                            style={[styles.customInputAddButton, { backgroundColor: Colors.primaryBlue }]}
                            onPress={() => {
                              const customValue = customInputs[message.id]?.value?.trim();
                              if (customValue) {
                                // Add to selections
                                setSelectedSuggestions(prev => ({
                                  ...prev,
                                  [message.id]: [...(prev[message.id] || []), customValue]
                                }));
                                // Hide input
                                setCustomInputs(prev => ({
                                  ...prev,
                                  [message.id]: { visible: false, value: '' }
                                }));
                              }
                            }}
                          >
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.customInputCancelButton, {
                              backgroundColor: Colors.lightGray
                            }]}
                            onPress={() => {
                              setCustomInputs(prev => ({
                                ...prev,
                                [message.id]: { visible: false, value: '' }
                              }));
                            }}
                          >
                            <Ionicons name="close" size={20} color={Colors.secondaryText} />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Show Send button when selections are made */}
                      {messageSelections.length > 0 && (
                        <TouchableOpacity
                          style={[styles.sendSelectionsButton, { backgroundColor: Colors.primaryBlue }]}
                          onPress={() => {
                            const messageText = messageSelections.join(', ');
                            handleSend(messageText, false);
                            // Clear selections for this message after sending
                            setSelectedSuggestions(prev => ({
                              ...prev,
                              [message.id]: []
                            }));
                          }}
                        >
                          <Text style={styles.sendSelectionsText}>
                            Send ({messageSelections.length} selected)
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
            </View>
            );
          })}

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
            onPopulateInput={handlePopulateInput}
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

      {/* Add Custom Service Modal */}
      <AddCustomServiceModal
        visible={showAddCustomService}
        onClose={() => setShowAddCustomService(false)}
        onAdd={handleCustomServiceAdd}
        tradeName="Custom"
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
  quickSuggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  quickSuggestionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  quickSuggestionText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  sendSelectionsButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  sendSelectionsText: {
    color: '#FFFFFF',
    fontSize: FontSizes.body,
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
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  customInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.small,
    backgroundColor: '#FFFFFF',
  },
  customInputAddButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customInputCancelButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
