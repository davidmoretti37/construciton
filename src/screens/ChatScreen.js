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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import AIInputWithSearch from '../components/AIInputWithSearch';
import AnimatedText from '../components/AnimatedText';
import { useTheme } from '../contexts/ThemeContext';
import { sendMessageToAI, sendMessageToAIStreaming, getProjectContext, analyzeScreenshot, formatProjectConfirmation, setVoiceMode } from '../services/aiService';
import CoreAgent from '../services/agents/core/CoreAgent';
import { ProjectCard, ProjectPreview, WorkerList, BudgetChart, PhotoGallery, EstimatePreview, EstimateList, InvoicePreview, ProjectSelector, ExpenseCard, ProjectOverview, PhaseOverview, ContractPreview, WorkerPaymentCard, DailyReportList, AppointmentCard } from '../components/ChatVisuals';
import { formatEstimate } from '../utils/estimateFormatter';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../utils/messaging';
import { fetchWorkers, fetchProjects, getUserProfile, getUserServices, updateUserServicePricing, saveProject, transformScreenshotToProject, getProject, saveEstimate, updateEstimate, createInvoiceFromEstimate, markInvoiceAsPaid, updateInvoicePDF, getInvoice, updateTradePricing, updatePhaseProgress, extendPhaseTimeline, startPhase, completePhase, fetchProjectPhases, addTaskToPhase, saveDailyReport, savePhasePaymentAmount, deleteProject, createProjectFromEstimate, createWorker, updateWorker, clockIn, clockOut, getActiveClockIn, createScheduleEvent, updateScheduleEvent, deleteScheduleEvent, createWorkSchedule, updateWorkSchedule, deleteWorkSchedule, updateBusinessInfo, updatePhaseTemplate, addServiceToTrade, removeServiceFromTrade, updateServicePricing, updateProfitMargin, saveSubcontractorQuote, updateSubcontractorQuote, deleteSubcontractorQuote, updateInvoiceTemplate, updateInvoice, deleteInvoice, recordInvoicePayment, voidInvoice, uploadContractDocument, calculateWorkerPaymentForPeriod, fetchPhotosWithFilters, fetchDailyReportsWithFilters, fetchDailyReportById, getTodaysWorkersSchedule, editTimeEntry, createManualTimeEntry, deleteTimeEntry, createRecurringEvent, updateRecurringEvent, deleteRecurringEvent, setWorkerAvailability, setWorkerPTO, removeWorkerAvailability, createCrew, getCrew, updateCrew, deleteCrew, createShiftTemplate, applyShiftTemplate, deleteShiftTemplate, startWorkerBreak, endWorkerBreak, swapWorkerShifts, fetchScheduleEvents } from '../utils/storage';
import { generateInvoicePDF, uploadInvoicePDF, previewInvoicePDF, shareInvoicePDF } from '../utils/pdfGenerator';
import TimelinePickerModal from '../components/TimelinePickerModal';
import BudgetInputModal from '../components/BudgetInputModal';
import JobNameInputModal from '../components/JobNameInputModal';
import AddCustomServiceModal from '../components/AddCustomServiceModal';
import OrbitalLoader from '../components/OrbitalLoader';
import StatusMessage from '../components/StatusMessage';
import NotificationBell from '../components/NotificationBell';

// Helper: Find worker by name (case-insensitive, partial match)
const findWorkerByName = (workers, searchName) => {
  if (!searchName || !workers) return null;
  const search = searchName.toLowerCase().trim();

  // Exact match first
  let match = workers.find(w =>
    w.full_name?.toLowerCase() === search ||
    w.name?.toLowerCase() === search
  );

  // Partial match (contains)
  if (!match) {
    match = workers.find(w =>
      w.full_name?.toLowerCase().includes(search) ||
      w.name?.toLowerCase().includes(search)
    );
  }

  return match;
};

// Helper: Resolve partial UUID to full UUID
const resolveWorkerId = (workers, id) => {
  if (!id || !workers) return null;
  // Full UUID (36 chars)
  if (id.length === 36) return id;
  // Partial UUID - find by prefix
  const match = workers.find(w => w.id?.startsWith(id));
  return match?.id || null;
};

// Helper: Resolve partial project UUID to full UUID
const resolveProjectId = (projects, id) => {
  if (!id || !projects) return null;
  // Full UUID (36 chars with hyphens)
  if (id.length === 36) return id;
  // Partial UUID - find by prefix
  const match = projects.find(p => p.id?.startsWith(id));
  return match?.id || null;
};

export default function ChatScreen({ navigation, route }) {
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
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

  // Handle navigation params (e.g., from notification tap)
  useEffect(() => {
    const handleRouteParams = async () => {
      const params = route?.params;
      if (!params) return;

      // Handle appointment/event viewing
      if (params.eventId) {
        try {
          // Fetch the event details
          const now = new Date();
          const farFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
          const events = await fetchScheduleEvents(
            new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            farFuture.toISOString()
          );
          const event = events?.find(e => e.id === params.eventId);

          if (event) {
            // Create a message showing the appointment card
            const appointmentMessage = {
              id: `appointment-${Date.now()}`,
              text: `Here's your appointment:`,
              isUser: false,
              timestamp: new Date(),
              visualElements: [{
                type: 'appointment-card',
                data: event
              }],
              actions: [],
              quickSuggestions: ['Reschedule', 'Get directions', 'Cancel appointment'],
            };
            setMessages(prev => [...prev, appointmentMessage]);
          } else {
            addAIMessage(`I couldn't find that appointment. It may have been deleted or rescheduled.`);
          }
        } catch (error) {
          console.error('Error fetching appointment:', error);
          addAIMessage(`Sorry, I couldn't load the appointment details.`);
        }

        // Clear the params so it doesn't trigger again
        navigation.setParams({ eventId: undefined });
      }
    };

    handleRouteParams();
  }, [route?.params?.eventId]);

  // Helper function to add AI messages programmatically
  const addAIMessage = (text) => {
    const aiMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const aiMessage = {
      id: aiMessageId,
      text: text,
      isUser: false,
      timestamp: new Date(),
      visualElements: [],
      actions: [],
      quickSuggestions: [],
    };
    setMessages((prev) => [...prev, aiMessage]);
  };

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

    // Show status message immediately (ChatGPT-style feedback)
    setIsAIThinking(true);
    setStatusMessage('Thinking');
    let messageCreated = false; // Track if we've created the message bubble

    // Set 50-second timeout
    aiTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ AI response timeout - 50 seconds elapsed');
      setIsAIThinking(false);
      setStatusMessage(null); // Clear status on timeout

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
            // First chunk arrived - clear timeout, hide status, create bubble with text
            if (aiTimeoutRef.current) {
              clearTimeout(aiTimeoutRef.current);
              aiTimeoutRef.current = null;
            }
            setIsAIThinking(false);
            setStatusMessage(null); // Hide status when response starts
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
          setStatusMessage(null); // Clear status on complete

          // Disable voice mode after response completes
          // This ensures next typed message uses standard (powerful) model
          setVoiceMode(false);

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

          // AUTO-EXECUTE worker payment queries
          const workerPaymentAction = parsedResponse.actions?.find(action => action.type === 'get-worker-payment');
          if (workerPaymentAction) {
            console.log('🔄 Auto-executing worker payment query:', workerPaymentAction.data);
            handleGetWorkerPayment(workerPaymentAction);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [], quickSuggestions: [] }
                  : msg
              )
            );
          }

          // AUTO-EXECUTE schedule event actions (create, update, delete)
          const createScheduleAction = parsedResponse.actions?.find(action => action.type === 'create-schedule-event');
          const updateScheduleAction = parsedResponse.actions?.find(action => action.type === 'update-schedule-event');
          const deleteScheduleAction = parsedResponse.actions?.find(action => action.type === 'delete-schedule-event');

          if (createScheduleAction) {
            console.log('🔄 Auto-executing schedule event creation:', createScheduleAction.data);
            handleCreateScheduleEvent(createScheduleAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [], quickSuggestions: [] }
                  : msg
              )
            );
          } else if (updateScheduleAction) {
            console.log('🔄 Auto-executing schedule event update:', updateScheduleAction.data);
            handleUpdateScheduleEvent(updateScheduleAction.data);

            // Clear actions and suggestions
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [], quickSuggestions: [] }
                  : msg
              )
            );
          } else if (deleteScheduleAction) {
            console.log('🔄 Auto-executing schedule event deletion:', deleteScheduleAction.data);
            handleDeleteScheduleEvent(deleteScheduleAction.data);

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE retrieve daily reports action
          const retrieveReportsAction = parsedResponse.actions?.find(action => action.type === 'retrieve-daily-reports');
          if (retrieveReportsAction) {
            console.log('🔄 Auto-executing retrieve daily reports:', retrieveReportsAction.data);
            handleRetrieveDailyReports(retrieveReportsAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [], quickSuggestions: [] }
                  : msg
              )
            );
          }

          // AUTO-EXECUTE retrieve photos action
          const retrievePhotosAction = parsedResponse.actions?.find(action => action.type === 'retrieve-photos');
          if (retrievePhotosAction) {
            console.log('🔄 Auto-executing retrieve photos:', retrievePhotosAction.data);
            handleRetrievePhotos(retrievePhotosAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [], quickSuggestions: [] }
                  : msg
              )
            );
          }

          // AUTO-EXECUTE retrieve schedule events action
          const retrieveScheduleAction = parsedResponse.actions?.find(action => action.type === 'retrieve-schedule-events');
          if (retrieveScheduleAction) {
            console.log('🔄 Auto-executing retrieve schedule events:', retrieveScheduleAction.data);
            handleRetrieveScheduleEvents(retrieveScheduleAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [], quickSuggestions: [] }
                  : msg
              )
            );
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
          setStatusMessage(null); // Clear status on error
          // Disable voice mode on error so retries use standard model
          setVoiceMode(false);

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
        },
        // onStatusChange callback - Update status message for agent-specific feedback
        (status) => {
          if (status) {
            setStatusMessage(status);
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
      setStatusMessage(null); // Clear status on error

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

      case 'get-worker-payment':
        await handleGetWorkerPayment(action);
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

      case 'add-estimate-to-project-choice':
        await handleAddEstimateToProjectChoice(action.data);
        break;

      case 'update-project':
        await handleUpdateProject(action.data);
        break;

      case 'update-estimate':
        await handleUpdateEstimate(action.data);
        break;

      case 'create-project-from-estimate':
        await handleCreateProjectFromEstimate(action.data);
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

      // Workers & Scheduling Agent Actions
      case 'create-worker':
        await handleCreateWorker(action.data);
        break;

      case 'update-worker':
        await handleUpdateWorker(action.data);
        break;

      case 'clock-in-worker':
        await handleClockInWorker(action.data);
        break;

      case 'clock-out-worker':
        await handleClockOutWorker(action.data);
        break;

      case 'create-schedule-event':
        await handleCreateScheduleEvent(action.data);
        break;

      case 'update-schedule-event':
        await handleUpdateScheduleEvent(action.data);
        break;

      case 'delete-schedule-event':
        await handleDeleteScheduleEvent(action.data);
        break;

      case 'reschedule-appointment':
        // Send message to AI to reschedule
        addAIMessage(`Let's reschedule "${action.data?.title || 'this appointment'}". When would you like to move it to?`);
        break;

      case 'cancel-appointment':
        // Confirm and delete the appointment
        Alert.alert(
          'Cancel Appointment',
          `Are you sure you want to cancel "${action.data?.title || 'this appointment'}"?`,
          [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Cancel Appointment',
              style: 'destructive',
              onPress: async () => {
                await handleDeleteScheduleEvent({ id: action.data?.id, eventTitle: action.data?.title });
              }
            }
          ]
        );
        break;

      case 'retrieve-schedule-events':
        await handleRetrieveScheduleEvents(action.data);
        break;

      case 'create-work-schedule':
        await handleCreateWorkSchedule(action.data);
        break;

      case 'update-work-schedule':
        await handleUpdateWorkSchedule(action.data);
        break;

      case 'create-daily-report':
        await handleCreateDailyReport(action.data);
        break;

      // Bulk Operations
      case 'bulk-clock-in':
        await handleBulkClockIn(action.data);
        break;

      case 'bulk-clock-out':
        await handleBulkClockOut(action.data);
        break;

      case 'bulk-create-work-schedule':
        await handleBulkCreateWorkSchedule(action.data);
        break;

      // Time Entry Management
      case 'edit-time-entry':
        await handleEditTimeEntry(action.data);
        break;

      case 'create-time-entry':
        await handleCreateTimeEntry(action.data);
        break;

      case 'delete-time-entry':
        await handleDeleteTimeEntry(action.data);
        break;

      // Recurring Events
      case 'create-recurring-event':
        await handleCreateRecurringEvent(action.data);
        break;

      case 'update-recurring-event':
        await handleUpdateRecurringEvent(action.data);
        break;

      case 'delete-recurring-event':
        await handleDeleteRecurringEvent(action.data);
        break;

      // Worker Availability & PTO
      case 'set-worker-availability':
        await handleSetWorkerAvailability(action.data);
        break;

      case 'set-worker-pto':
        await handleSetWorkerPTO(action.data);
        break;

      case 'remove-worker-availability':
        await handleRemoveWorkerAvailability(action.data);
        break;

      // Crew Management
      case 'create-crew':
        await handleCreateCrew(action.data);
        break;

      case 'update-crew':
        await handleUpdateCrew(action.data);
        break;

      case 'delete-crew':
        await handleDeleteCrew(action.data);
        break;

      // Shift Templates
      case 'create-shift-template':
        await handleCreateShiftTemplate(action.data);
        break;

      case 'apply-shift-template':
        await handleApplyShiftTemplate(action.data);
        break;

      case 'delete-shift-template':
        await handleDeleteShiftTemplate(action.data);
        break;

      // Break Management
      case 'start-break':
        await handleStartBreak(action.data);
        break;

      case 'end-break':
        await handleEndBreak(action.data);
        break;

      // Shift Swapping
      case 'swap-shifts':
        await handleSwapShifts(action.data);
        break;

      // Settings & Configuration Agent Actions
      case 'update-business-info':
        await handleUpdateBusinessInfo(action.data);
        break;

      case 'create-phase-template':
      case 'update-phase-template':
        await handleUpdatePhaseTemplate(action.data);
        break;

      case 'add-service':
        await handleAddService(action.data);
        break;

      case 'update-service-pricing':
        await handleUpdateServicePricing(action.data);
        break;

      case 'remove-service':
        await handleRemoveService(action.data);
        break;

      case 'update-profit-margin':
        await handleUpdateProfitMargin(action.data);
        break;

      case 'add-subcontractor-quote':
        await handleAddSubcontractorQuote(action.data);
        break;

      case 'update-subcontractor-quote':
        await handleUpdateSubcontractorQuote(action.data);
        break;

      case 'delete-subcontractor-quote':
        await handleDeleteSubcontractorQuote(action.data);
        break;

      case 'update-invoice-template':
        await handleUpdateInvoiceTemplate(action.data);
        break;

      // Document Agent - Invoice Management Actions
      case 'update-invoice':
        await handleUpdateInvoice(action.data);
        break;

      case 'delete-invoice':
        await handleDeleteInvoice(action.data);
        break;

      case 'record-invoice-payment':
        await handleRecordInvoicePayment(action.data);
        break;

      case 'void-invoice':
        await handleVoidInvoice(action.data);
        break;

      // Document Agent - Contract Management Actions
      case 'upload-contract':
        await handleUploadContract();
        break;

      case 'view-contract':
        await handleViewContract(action.data);
        break;

      case 'share-contract':
        await handleShareContract(action.data);
        break;

      // Photo and Daily Report Retrieval Actions
      case 'retrieve-photos':
        await handleRetrievePhotos(action.data);
        break;

      case 'retrieve-daily-reports':
        await handleRetrieveDailyReports(action.data);
        break;

      case 'view-report-detail':
        try {
          const report = await fetchDailyReportById(action.data.reportId);
          if (report) {
            navigation.navigate('DailyReportDetail', { report });
          } else {
            Alert.alert('Error', 'Could not load report details');
          }
        } catch (error) {
          console.error('Error fetching report:', error);
          Alert.alert('Error', 'Could not load report details');
        }
        break;

      case 'view-photo':
        // Open photo URL in browser/image viewer
        if (action.data?.photo?.url) {
          try {
            await Linking.openURL(action.data.photo.url);
          } catch (err) {
            console.error('Error opening photo:', err);
            Alert.alert('Error', 'Could not open photo');
          }
        }
        break;

      // Maps/Location Actions
      case 'open-maps':
        handleOpenMaps(action.data);
        break;

      default:
        console.error('❌ Unknown action type:', action.type);
        console.error('📋 Full action object:', JSON.stringify(action, null, 2));
        console.error('💡 Available action types: create-schedule-event, update-schedule-event, delete-schedule-event, etc.');
        Alert.alert(
          'Unknown Action',
          `The AI tried to perform an action "${action.type}" that is not supported. This has been logged for debugging.`,
          [{ text: 'OK' }]
        );
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
      // Get user's services from the new system
      const userServices = await getUserServices();

      if (userServices.length === 0) {
        Alert.alert('No Services', 'Please add a service from the More screen first.');
        return;
      }

      // Use the first service as the default location for custom items
      const firstService = userServices[0];

      // Create unique ID for custom service
      const customId = `custom_${Date.now()}`;

      // Get existing pricing for this service
      const existingPricing = firstService.pricing || {};

      // Add the new custom service
      const updatedPricing = {
        ...existingPricing,
        [customId]: {
          name: serviceData.label,
          unit: serviceData.unit,
          price: parseFloat(serviceData.price),
        }
      };

      // Save to user_services table
      await updateUserServicePricing(firstService.id, updatedPricing);

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

  // Workers & Scheduling Agent Handlers
  const handleCreateWorker = async (data) => {
    try {
      const worker = await createWorker(data);
      if (worker) {
        addAIMessage(`✅ Added ${data.full_name} as ${data.trade || 'worker'}!`);
      } else {
        Alert.alert('Error', 'Failed to create worker.');
      }
    } catch (error) {
      console.error('Error creating worker:', error);
      Alert.alert('Error', 'Failed to create worker.');
    }
  };

  const handleUpdateWorker = async (data) => {
    try {
      const { workerId, workerName, ...updates } = data;
      const success = await updateWorker(workerId, updates);
      if (success) {
        const updateMsg = Object.keys(updates).map(key => {
          if (key === 'hourly_rate') return `rate to $${updates[key]}/hour`;
          if (key === 'trade') return `trade to ${updates[key]}`;
          if (key === 'status') return `status to ${updates[key]}`;
          return `${key} updated`;
        }).join(', ');
        addAIMessage(`✅ Updated ${workerName || 'worker'}: ${updateMsg}`);
      } else {
        Alert.alert('Error', 'Failed to update worker.');
      }
    } catch (error) {
      console.error('Error updating worker:', error);
      Alert.alert('Error', 'Failed to update worker.');
    }
  };

  const handleGetWorkerPayment = async (action) => {
    try {
      const actionData = action.data || action;
      const period = actionData.period || 'this_week';

      // Support workerName, workerNames, workerId, workerIds, or allWorkers
      let workerIds = [];
      const workers = await fetchWorkers();

      if (actionData.allWorkers) {
        // Get all active workers
        const activeWorkers = workers.filter(w => w.status === 'active' || !w.status);
        workerIds = activeWorkers.map(w => w.id);
        console.log('📅 Fetching payments for all workers:', activeWorkers.length);
      } else if (actionData.workerName || actionData.workerNames) {
        // Name-based resolution (preferred)
        const names = actionData.workerNames || [actionData.workerName];
        for (const name of names) {
          const match = findWorkerByName(workers, name);
          if (match) {
            workerIds.push(match.id);
          } else {
            console.warn(`Worker not found: ${name}`);
          }
        }
      } else if (actionData.workerIds && Array.isArray(actionData.workerIds)) {
        // Array of IDs (may be partial)
        for (const id of actionData.workerIds) {
          const resolved = resolveWorkerId(workers, id);
          if (resolved) workerIds.push(resolved);
        }
      } else if (actionData.workerId) {
        // Single ID (may be partial)
        const resolved = resolveWorkerId(workers, actionData.workerId);
        if (resolved) workerIds.push(resolved);
      }

      if (workerIds.length === 0) {
        addAIMessage(`I couldn't find any workers. Please check and try again.`);
        return;
      }

      // Calculate date range based on period
      const getDateRange = (period) => {
        const now = new Date();
        const formatDate = (date) => {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        };

        switch (period) {
          case 'this_week': {
            const dayOfWeek = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            monday.setHours(0, 0, 0, 0);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { from: formatDate(monday), to: formatDate(sunday) };
          }
          case 'last_week': {
            const dayOfWeek = now.getDay();
            const lastMonday = new Date(now);
            lastMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
            const lastSunday = new Date(lastMonday);
            lastSunday.setDate(lastMonday.getDate() + 6);
            return { from: formatDate(lastMonday), to: formatDate(lastSunday) };
          }
          case 'this_month': {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { from: formatDate(firstDay), to: formatDate(lastDay) };
          }
          case 'last_month': {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            return { from: formatDate(firstDay), to: formatDate(lastDay) };
          }
          default:
            return { from: formatDate(now), to: formatDate(now) };
        }
      };

      const { from, to } = getDateRange(period);

      // Calculate payment for each worker
      const workerPayments = await Promise.all(
        workerIds.map(async (workerId) => {
          const paymentData = await calculateWorkerPaymentForPeriod(workerId, from, to);
          return paymentData;
        })
      );

      // Filter out workers with no payment data (but keep workers with 0 hours for visibility)
      const validPayments = workerPayments.filter(p => p !== null);

      if (validPayments.length === 0) {
        addAIMessage('No workers found for this period.');
        return;
      }

      // Check if any worker has hours recorded
      const hasAnyHours = validPayments.some(p => p.totalAmount > 0);
      if (!hasAnyHours) {
        addAIMessage('No work hours recorded for any workers in this period. Amount owed: $0.00');
        return;
      }

      // Create SEPARATE payment cards for each worker
      const periodLabel = period.replace('_', ' ');
      const newMessages = [];

      validPayments.forEach((paymentData, index) => {
        if (!paymentData || paymentData.totalAmount === 0) return; // Skip workers with no hours

        const workerData = {
          workerId: paymentData.workerId,
          workerName: paymentData.workerName,
          paymentType: paymentData.paymentType,
          rate: paymentData.rate ? paymentData.rate[paymentData.paymentType] : 0,
          totalAmount: paymentData.totalAmount,
          totalHours: paymentData.totalHours,
          totalDays: paymentData.totalDays,
          byDate: paymentData.byDate,
          byProject: paymentData.byProject,
        };

        const messageId = `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
        newMessages.push({
          id: messageId,
          text: '', // No text, just the visual element
          isUser: false,
          timestamp: new Date(),
          visualElements: [
            {
              type: 'worker-payment-card',
              data: {
                workers: [workerData], // Single worker per card
                period: period,
                totalAmount: workerData.totalAmount,
                totalHours: workerData.totalHours,
                totalDays: workerData.totalDays,
              }
            }
          ],
          actions: [],
          quickSuggestions: [],
        });
      });

      // Add all messages
      setMessages((prev) => [...prev, ...newMessages]);

    } catch (error) {
      console.error('Error getting worker payment:', error);
      Alert.alert('Error', 'Failed to calculate worker payment.');
    }
  };

  const handleClockInWorker = async (data) => {
    try {
      const { workerId, workerName, projectId, projectName, location } = data;
      const record = await clockIn(workerId, projectId, location);
      if (record) {
        const time = new Date(record.clock_in_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
        addAIMessage(`✅ Clocked in ${workerName} at ${projectName} (${time})`);
      } else {
        Alert.alert('Error', 'Failed to clock in worker.');
      }
    } catch (error) {
      console.error('Error clocking in worker:', error);
      Alert.alert('Error', 'Failed to clock in worker.');
    }
  };

  const handleClockOutWorker = async (data) => {
    try {
      const { workerId, workerName } = data;

      // Get active clock-in for this worker
      const activeRecord = await getActiveClockIn(workerId);
      if (!activeRecord) {
        Alert.alert('Error', `${workerName} is not currently clocked in.`);
        return;
      }

      const success = await clockOut(activeRecord.id, data.notes);
      if (success) {
        // Calculate hours worked
        const clockInTime = new Date(activeRecord.clock_in_time);
        const clockOutTime = new Date();
        const hoursWorked = ((clockOutTime - clockInTime) / (1000 * 60 * 60)).toFixed(1);
        addAIMessage(`✅ Clocked out ${workerName} (${hoursWorked} hours worked)`);
      } else {
        Alert.alert('Error', 'Failed to clock out worker.');
      }
    } catch (error) {
      console.error('Error clocking out worker:', error);
      Alert.alert('Error', 'Failed to clock out worker.');
    }
  };

  const handleCreateScheduleEvent = async (data) => {
    try {
      const event = await createScheduleEvent(data);
      if (event) {
        // Success! Event created and AI already shows success message in response
        // No need for alert popup since this is auto-executed
        console.log('✅ Schedule event created:', event.id);
      } else {
        // Only show error if creation failed
        addAIMessage('❌ Sorry, I couldn\'t create that event. Please try again.');
      }
    } catch (error) {
      console.error('Error creating schedule event:', error);
      addAIMessage(`❌ Error creating event: ${error.message || 'Unknown error'}`);
    }
  };

  const handleUpdateScheduleEvent = async (data) => {
    try {
      // Support 'id', 'eventId', and 'event_id' field names
      const { id, eventId, event_id, eventTitle, ...updates } = data;
      const actualEventId = eventId || event_id || id;

      if (!actualEventId) {
        console.error('No event ID provided in update data:', data);
        Alert.alert('Error', 'Cannot update event: No event ID provided.');
        return;
      }

      const success = await updateScheduleEvent(actualEventId, updates);
      if (success) {
        addAIMessage(`✅ Updated event: ${eventTitle || 'schedule event'}`);
      } else {
        Alert.alert('Error', 'Failed to update schedule event.');
      }
    } catch (error) {
      console.error('Error updating schedule event:', error);
      Alert.alert('Error', 'Failed to update schedule event.');
    }
  };

  const handleDeleteScheduleEvent = async (data) => {
    try {
      // Support 'id', 'eventId', and 'event_id' field names
      const { id, eventId, event_id, eventTitle } = data;
      const actualEventId = eventId || event_id || id;

      if (!actualEventId) {
        console.error('No event ID provided in delete data:', data);
        Alert.alert('Error', 'Cannot delete event: No event ID provided.');
        return;
      }

      const success = await deleteScheduleEvent(actualEventId);
      if (success) {
        addAIMessage(`✅ Cancelled: ${eventTitle || 'schedule event'}`);
      } else {
        Alert.alert('Error', 'Failed to delete schedule event.');
      }
    } catch (error) {
      console.error('Error deleting schedule event:', error);
      Alert.alert('Error', 'Failed to delete schedule event.');
    }
  };

  const handleRetrieveScheduleEvents = async (data) => {
    try {
      const { date, startDate, endDate } = data;

      // Determine date range
      const start = startDate || date;
      const end = endDate || date;

      // Fetch events for the date range
      // Add time component to ensure full day coverage
      const startWithTime = `${start}T00:00:00`;
      const endWithTime = `${end}T23:59:59`;
      const events = await fetchScheduleEvents(startWithTime, endWithTime);

      // Filter events to ensure they actually fall within the requested date range
      // This handles any timezone edge cases from the database query
      const filteredEvents = events?.filter(e => {
        if (!e.start_datetime) return false;
        const eventDate = e.start_datetime.split('T')[0];
        return eventDate >= start && eventDate <= end;
      }) || [];

      // Format date for display - parse as local date to avoid timezone issues
      const [year, month, day] = start.split('-').map(Number);
      const localDate = new Date(year, month - 1, day); // month is 0-indexed
      const displayDate = localDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });

      // Build message text
      let messageText;
      if (filteredEvents.length > 0) {
        const eventList = filteredEvents.map(e => {
          const time = e.all_day ? 'All day' : new Date(e.start_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return `• ${time}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`;
        }).join('\n');
        messageText = `Here's your schedule for ${displayDate}:\n\n${eventList}\n\nYou have ${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'} scheduled.`;
      } else {
        messageText = `You have no events scheduled for ${displayDate}.`;
      }

      addAIMessage(messageText);
    } catch (error) {
      console.error('Error retrieving schedule events:', error);
      addAIMessage('Sorry, I encountered an error while retrieving your schedule.');
    }
  };

  const handleCreateWorkSchedule = async (data) => {
    try {
      const { workerName, projectName, phaseName, ...scheduleData } = data;

      const schedule = await createWorkSchedule(scheduleData);
      if (schedule) {
        const dateRange = `${scheduleData.start_date}${scheduleData.end_date ? ` to ${scheduleData.end_date}` : ' (ongoing)'}`;
        const timeRange = scheduleData.start_time && scheduleData.end_time
          ? ` (${scheduleData.start_time} - ${scheduleData.end_time})`
          : '';
        addAIMessage(`✅ Assigned ${workerName} to ${projectName}${phaseName ? ` (${phaseName})` : ''} from ${dateRange}${timeRange}`);
      } else {
        Alert.alert('Error', 'Failed to create work schedule.');
      }
    } catch (error) {
      console.error('Error creating work schedule:', error);
      Alert.alert('Error', 'Failed to create work schedule.');
    }
  };

  const handleUpdateWorkSchedule = async (data) => {
    try {
      const { scheduleId, workerName, ...updates } = data;
      const success = await updateWorkSchedule(scheduleId, updates);
      if (success) {
        addAIMessage(`✅ Updated schedule for ${workerName}`);
      } else {
        Alert.alert('Error', 'Failed to update work schedule.');
      }
    } catch (error) {
      console.error('Error updating work schedule:', error);
      Alert.alert('Error', 'Failed to update work schedule.');
    }
  };

  const handleCreateDailyReport = async (data) => {
    try {
      const { workerId, projectId, projectName, phaseId, phaseName, photos, completedStepIds, notes } = data;

      const report = await saveDailyReport(
        workerId,
        projectId,
        phaseId,
        photos || [],
        completedStepIds || [],
        notes || ''
      );

      if (report) {
        addAIMessage(`✅ Created daily report for ${projectName}${phaseName ? ` (${phaseName})` : ''}`);
      } else {
        Alert.alert('Error', 'Failed to create daily report.');
      }
    } catch (error) {
      console.error('Error creating daily report:', error);
      Alert.alert('Error', 'Failed to create daily report.');
    }
  };

  // ============================================
  // NEW FEATURE HANDLERS - Workers & Scheduling
  // ============================================

  // Bulk Operations
  const handleBulkClockIn = async (data) => {
    try {
      const { worker_ids, project_id, location } = data;
      let successCount = 0;
      let failedWorkers = [];

      for (const workerId of worker_ids) {
        try {
          const record = await clockIn(workerId, project_id, location);
          if (record) successCount++;
          else failedWorkers.push(workerId);
        } catch (err) {
          failedWorkers.push(workerId);
        }
      }

      if (successCount > 0) {
        addAIMessage(`✅ Clocked in ${successCount} worker${successCount > 1 ? 's' : ''} at ${location || 'project site'}`);
      }
      if (failedWorkers.length > 0) {
        console.warn('Failed to clock in some workers:', failedWorkers);
      }
    } catch (error) {
      console.error('Error in bulk clock in:', error);
      Alert.alert('Error', 'Failed to clock in workers.');
    }
  };

  const handleBulkClockOut = async (data) => {
    try {
      const { worker_ids, project_id } = data;
      let successCount = 0;
      let totalHours = 0;

      // If project_id provided, get all active workers at that project
      let workersToClockOut = worker_ids || [];

      if (project_id && !worker_ids) {
        // Get all active clock-ins for this project
        const schedule = await getTodaysWorkersSchedule();
        workersToClockOut = schedule
          .filter(s => s.project_id === project_id && s.clock_in_time && !s.clock_out_time)
          .map(s => s.worker_id);
      }

      for (const workerId of workersToClockOut) {
        try {
          const activeRecord = await getActiveClockIn(workerId);
          if (activeRecord) {
            const success = await clockOut(activeRecord.id);
            if (success) {
              successCount++;
              const clockInTime = new Date(activeRecord.clock_in_time);
              const clockOutTime = new Date();
              totalHours += (clockOutTime - clockInTime) / (1000 * 60 * 60);
            }
          }
        } catch (err) {
          console.warn('Failed to clock out worker:', workerId);
        }
      }

      if (successCount > 0) {
        addAIMessage(`✅ Clocked out ${successCount} worker${successCount > 1 ? 's' : ''} (${totalHours.toFixed(1)} total hours)`);
      } else {
        addAIMessage('No workers were clocked in to clock out.');
      }
    } catch (error) {
      console.error('Error in bulk clock out:', error);
      Alert.alert('Error', 'Failed to clock out workers.');
    }
  };

  const handleBulkCreateWorkSchedule = async (data) => {
    try {
      const { worker_ids, crew_id, project_id, phase_id, start_date, end_date, start_time, end_time } = data;

      let workersToSchedule = worker_ids || [];

      // If crew_id provided, get crew members
      if (crew_id && !worker_ids) {
        const crew = await getCrew(crew_id);
        if (crew) workersToSchedule = crew.worker_ids;
      }

      let successCount = 0;
      for (const workerId of workersToSchedule) {
        try {
          const schedule = await createWorkSchedule({
            worker_id: workerId,
            project_id,
            phase_id,
            start_date,
            end_date,
            start_time,
            end_time
          });
          if (schedule) successCount++;
        } catch (err) {
          console.warn('Failed to schedule worker:', workerId);
        }
      }

      if (successCount > 0) {
        const dateRange = end_date ? `${start_date} to ${end_date}` : start_date;
        addAIMessage(`✅ Assigned ${successCount} worker${successCount > 1 ? 's' : ''} to project (${dateRange})`);
      }
    } catch (error) {
      console.error('Error in bulk schedule:', error);
      Alert.alert('Error', 'Failed to create work schedules.');
    }
  };

  // Time Entry Management
  const handleEditTimeEntry = async (data) => {
    try {
      const { time_tracking_id, field, value } = data;
      const success = await editTimeEntry(time_tracking_id, { [field]: value });
      if (success) {
        addAIMessage(`✅ Updated time entry`);
      } else {
        Alert.alert('Error', 'Failed to update time entry.');
      }
    } catch (error) {
      console.error('Error editing time entry:', error);
      Alert.alert('Error', 'Failed to update time entry.');
    }
  };

  const handleCreateTimeEntry = async (data) => {
    try {
      const { worker_id, project_id, clock_in_time, clock_out_time, date } = data;
      const entry = await createManualTimeEntry(worker_id, project_id, clock_in_time, clock_out_time, date);
      if (entry) {
        const hours = entry.hours_worked || 0;
        addAIMessage(`✅ Added time entry: ${hours.toFixed(1)} hours`);
      } else {
        Alert.alert('Error', 'Failed to create time entry.');
      }
    } catch (error) {
      console.error('Error creating time entry:', error);
      Alert.alert('Error', 'Failed to create time entry.');
    }
  };

  const handleDeleteTimeEntry = async (data) => {
    try {
      const { time_tracking_id } = data;
      const success = await deleteTimeEntry(time_tracking_id);
      if (success) {
        addAIMessage(`✅ Deleted time entry`);
      } else {
        Alert.alert('Error', 'Failed to delete time entry.');
      }
    } catch (error) {
      console.error('Error deleting time entry:', error);
      Alert.alert('Error', 'Failed to delete time entry.');
    }
  };

  // Recurring Events
  const handleCreateRecurringEvent = async (data) => {
    try {
      const { title, event_type, start_time, end_time, location, recurrence } = data;
      const result = await createRecurringEvent({
        title,
        event_type,
        start_time,
        end_time,
        location,
        recurrence
      });
      if (result) {
        const freq = recurrence.frequency;
        addAIMessage(`✅ Created recurring ${event_type}: ${title} (${freq})`);
      } else {
        Alert.alert('Error', 'Failed to create recurring event.');
      }
    } catch (error) {
      console.error('Error creating recurring event:', error);
      Alert.alert('Error', 'Failed to create recurring event.');
    }
  };

  const handleUpdateRecurringEvent = async (data) => {
    try {
      const { recurring_id, updates } = data;
      const success = await updateRecurringEvent(recurring_id, updates);
      if (success) {
        addAIMessage(`✅ Updated recurring event`);
      } else {
        Alert.alert('Error', 'Failed to update recurring event.');
      }
    } catch (error) {
      console.error('Error updating recurring event:', error);
      Alert.alert('Error', 'Failed to update recurring event.');
    }
  };

  const handleDeleteRecurringEvent = async (data) => {
    try {
      const { recurring_id, scope } = data;
      const success = await deleteRecurringEvent(recurring_id, scope);
      if (success) {
        const scopeMsg = scope === 'all' ? 'all instances' : scope === 'future' ? 'future instances' : 'this instance';
        addAIMessage(`✅ Deleted ${scopeMsg} of recurring event`);
      } else {
        Alert.alert('Error', 'Failed to delete recurring event.');
      }
    } catch (error) {
      console.error('Error deleting recurring event:', error);
      Alert.alert('Error', 'Failed to delete recurring event.');
    }
  };

  // Worker Availability & PTO
  const handleSetWorkerAvailability = async (data) => {
    try {
      const { worker_id, date, date_range, status, reason, time_range } = data;
      const result = await setWorkerAvailability({
        worker_id,
        date: date || date_range?.start,
        end_date: date_range?.end,
        status,
        reason,
        time_range
      });
      if (result) {
        addAIMessage(`✅ Marked worker as ${status}${date ? ` on ${date}` : ''}`);
      } else {
        Alert.alert('Error', 'Failed to set worker availability.');
      }
    } catch (error) {
      console.error('Error setting worker availability:', error);
      Alert.alert('Error', 'Failed to set worker availability.');
    }
  };

  const handleSetWorkerPTO = async (data) => {
    try {
      const { worker_id, start_date, end_date, reason } = data;
      const result = await setWorkerPTO(worker_id, start_date, end_date, reason);
      if (result) {
        addAIMessage(`✅ Set PTO: ${start_date} to ${end_date}`);
      } else {
        Alert.alert('Error', 'Failed to set worker PTO.');
      }
    } catch (error) {
      console.error('Error setting worker PTO:', error);
      Alert.alert('Error', 'Failed to set worker PTO.');
    }
  };

  const handleRemoveWorkerAvailability = async (data) => {
    try {
      const { availability_id } = data;
      const success = await removeWorkerAvailability(availability_id);
      if (success) {
        addAIMessage(`✅ Removed time off`);
      } else {
        Alert.alert('Error', 'Failed to remove availability.');
      }
    } catch (error) {
      console.error('Error removing availability:', error);
      Alert.alert('Error', 'Failed to remove availability.');
    }
  };

  // Crew Management
  const handleCreateCrew = async (data) => {
    try {
      const { name, worker_ids, default_project_id } = data;
      const crew = await createCrew({ name, worker_ids, default_project_id });
      if (crew) {
        addAIMessage(`✅ Created '${name}' crew with ${worker_ids.length} worker${worker_ids.length > 1 ? 's' : ''}`);
      } else {
        Alert.alert('Error', 'Failed to create crew.');
      }
    } catch (error) {
      console.error('Error creating crew:', error);
      Alert.alert('Error', 'Failed to create crew.');
    }
  };

  const handleUpdateCrew = async (data) => {
    try {
      const { crew_id, add_worker_ids, remove_worker_ids, name } = data;
      const success = await updateCrew(crew_id, { add_worker_ids, remove_worker_ids, name });
      if (success) {
        addAIMessage(`✅ Updated crew`);
      } else {
        Alert.alert('Error', 'Failed to update crew.');
      }
    } catch (error) {
      console.error('Error updating crew:', error);
      Alert.alert('Error', 'Failed to update crew.');
    }
  };

  const handleDeleteCrew = async (data) => {
    try {
      const { crew_id } = data;
      const success = await deleteCrew(crew_id);
      if (success) {
        addAIMessage(`✅ Deleted crew`);
      } else {
        Alert.alert('Error', 'Failed to delete crew.');
      }
    } catch (error) {
      console.error('Error deleting crew:', error);
      Alert.alert('Error', 'Failed to delete crew.');
    }
  };

  // Shift Templates
  const handleCreateShiftTemplate = async (data) => {
    try {
      const { name, start_time, end_time, break_duration, days } = data;
      const template = await createShiftTemplate({ name, start_time, end_time, break_duration, days });
      if (template) {
        addAIMessage(`✅ Created '${name}' shift template`);
      } else {
        Alert.alert('Error', 'Failed to create shift template.');
      }
    } catch (error) {
      console.error('Error creating shift template:', error);
      Alert.alert('Error', 'Failed to create shift template.');
    }
  };

  const handleApplyShiftTemplate = async (data) => {
    try {
      const { template_id, worker_id, project_id, start_date, end_date } = data;
      const result = await applyShiftTemplate(template_id, worker_id, project_id, start_date, end_date);
      if (result) {
        addAIMessage(`✅ Applied shift template to worker`);
      } else {
        Alert.alert('Error', 'Failed to apply shift template.');
      }
    } catch (error) {
      console.error('Error applying shift template:', error);
      Alert.alert('Error', 'Failed to apply shift template.');
    }
  };

  const handleDeleteShiftTemplate = async (data) => {
    try {
      const { template_id } = data;
      const success = await deleteShiftTemplate(template_id);
      if (success) {
        addAIMessage(`✅ Deleted shift template`);
      } else {
        Alert.alert('Error', 'Failed to delete shift template.');
      }
    } catch (error) {
      console.error('Error deleting shift template:', error);
      Alert.alert('Error', 'Failed to delete shift template.');
    }
  };

  // Break Management
  const handleStartBreak = async (data) => {
    try {
      const { worker_id, break_type } = data;
      const result = await startWorkerBreak(worker_id, break_type);
      if (result) {
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        addAIMessage(`✅ Started ${break_type} break at ${time}`);
      } else {
        Alert.alert('Error', 'Failed to start break.');
      }
    } catch (error) {
      console.error('Error starting break:', error);
      Alert.alert('Error', 'Failed to start break.');
    }
  };

  const handleEndBreak = async (data) => {
    try {
      const { worker_id } = data;
      const result = await endWorkerBreak(worker_id);
      if (result) {
        const duration = result.duration_minutes || 0;
        addAIMessage(`✅ Break ended (${duration} min)`);
      } else {
        Alert.alert('Error', 'Failed to end break.');
      }
    } catch (error) {
      console.error('Error ending break:', error);
      Alert.alert('Error', 'Failed to end break.');
    }
  };

  // Shift Swapping
  const handleSwapShifts = async (data) => {
    try {
      const { shift_1_id, shift_2_id } = data;
      const success = await swapWorkerShifts(shift_1_id, shift_2_id);
      if (success) {
        addAIMessage(`✅ Swapped shifts successfully`);
      } else {
        Alert.alert('Error', 'Failed to swap shifts.');
      }
    } catch (error) {
      console.error('Error swapping shifts:', error);
      Alert.alert('Error', 'Failed to swap shifts.');
    }
  };

  // ============================================
  // END NEW FEATURE HANDLERS
  // ============================================

  const handleSaveEstimate = async (estimateData) => {
    try {
      // 🔧 CRITICAL FIX: Extract complete data from visualElement if action data is incomplete
      let completeEstimateData = estimateData;

      // Normalize project_id to projectId (AI might use snake_case)
      if (completeEstimateData.project_id && !completeEstimateData.projectId) {
        completeEstimateData.projectId = completeEstimateData.project_id;
      }

      // Resolve partial project UUID to full UUID (AI sometimes uses truncated IDs from display)
      if (completeEstimateData.projectId && completeEstimateData.projectId.length < 36) {
        console.log('⚠️ Partial project ID detected, resolving...', completeEstimateData.projectId);
        const projects = await fetchProjects();
        const fullProjectId = resolveProjectId(projects, completeEstimateData.projectId);
        if (fullProjectId) {
          console.log('✅ Resolved to full UUID:', fullProjectId);
          completeEstimateData.projectId = fullProjectId;
        } else {
          console.warn('❌ Could not resolve partial project ID, removing link');
          completeEstimateData.projectId = null;
        }
      }

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
                // Normalize project_id from preview
                const previewProjectId = estimatePreview.data.project_id || estimatePreview.data.projectId;
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
                  // Use preview projectId if action doesn't have it
                  projectId: completeEstimateData.projectId || previewProjectId,
                };
                console.log('📊 Merged data:', {
                  phasesCount: completeEstimateData.phases?.length,
                  tasksInPhases: completeEstimateData.phases?.map(p => p.tasks?.length || 0),
                  hasSchedule: !!completeEstimateData.schedule,
                  hasScope: !!completeEstimateData.scope,
                  lineItemsCount: completeEstimateData.lineItems?.length,
                  projectId: completeEstimateData.projectId
                });
                break;
              }
            }
          }
        }
      }

      // If estimate has a linked project, give user clear save options
      if (completeEstimateData.projectId) {
        const existingProject = await getProject(completeEstimateData.projectId);

        if (existingProject) {
          // Project exists - give user 2 clear options
          Alert.alert(
            'Save Estimate',
            `How would you like to save this estimate${completeEstimateData.projectName ? ` for "${completeEstimateData.projectName}"` : ''}?`,
            [
              {
                text: 'Cancel',
                style: 'cancel'
              },
              {
                text: 'Save Only',
                onPress: async () => {
                  // Save estimate without linking to project
                  const savedEstimate = await saveEstimate({
                    ...completeEstimateData,
                    projectId: null // Remove link to prevent project update
                  });
                  if (savedEstimate) {
                    Alert.alert('Success', `Estimate ${savedEstimate.estimate_number} saved!`);
                  }
                }
              },
              {
                text: 'Save & Add to Project',
                onPress: async () => {
                  // Save estimate and update the project
                  const savedEstimate = await saveEstimate(completeEstimateData);
                  if (savedEstimate) {
                    Alert.alert('Success', `Estimate ${savedEstimate.estimate_number} saved and added to project!`);
                  }
                }
              }
            ]
          );
        } else {
          // Project doesn't exist - just save the estimate
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

      // Clean up the data before saving - remove estimate-specific fields
      const cleanProjectData = {
        ...completeProjectData,
        // Override status with valid project status (estimates use 'draft', projects use 'active')
        status: 'active',
        // Remove estimate-specific fields if they exist
        estimate_id: undefined,
        estimateId: undefined
      };

      // Save the project with complete data
      const savedProject = await saveProject(cleanProjectData);

      if (savedProject) {
        console.log('✅ Project saved successfully:', savedProject.id);

        // Update CoreAgent with the saved project data (includes the real ID)
        // This is critical for estimate creation to link to the project
        const savedProjectPreview = {
          id: savedProject.id, // Full UUID from database
          projectName: savedProject.name,
          client: savedProject.client,
          location: savedProject.location || savedProject.address,
          address: savedProject.address || savedProject.location,
          phone: savedProject.phone,
          email: savedProject.email,
          services: savedProject.services || cleanProjectData.services,
          phases: savedProject.phases || cleanProjectData.phases,
          scope: savedProject.scope || cleanProjectData.scope,
        };
        CoreAgent.updateConversationState({ lastProjectPreview: savedProjectPreview });
        console.log('📦 [ChatScreen] Updated lastProjectPreview with saved project ID:', savedProject.id);

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

  const handleAddEstimateToProjectChoice = async (choiceData) => {
    try {
      const { estimateId, estimateName, projectId, projectName, options } = choiceData;

      if (!estimateId || !projectId) {
        Alert.alert('Error', 'Missing estimate or project information');
        return;
      }

      // Show alert with merge options
      Alert.alert(
        'Add Estimate to Project',
        `How would you like to add "${estimateName}" to "${projectName}"?`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: options.merge.label,
            onPress: async () => {
              // Import the function
              const { addEstimateToProject } = require('../utils/storage');

              const updatedProject = await addEstimateToProject(projectId, estimateId, 'merge');
              if (updatedProject) {
                Alert.alert('Success', 'Estimate merged into project successfully!');

                // Send confirmation message
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ "${estimateName}" has been merged into "${projectName}". Tasks and budgets have been combined into existing phases.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                  quickSuggestions: ['View project', 'Show all projects']
                };
                setMessages(prev => [...prev, confirmationMessage]);
              } else {
                Alert.alert('Error', 'Failed to add estimate to project');
              }
            }
          },
          {
            text: options.separate.label + (options.separate.recommended ? ' ✓' : ''),
            onPress: async () => {
              // Import the function
              const { addEstimateToProject } = require('../utils/storage');

              const updatedProject = await addEstimateToProject(projectId, estimateId, 'separate');
              if (updatedProject) {
                Alert.alert('Success', 'Estimate added as separate scope!');

                // Send confirmation message
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ "${estimateName}" has been added to "${projectName}" as a separate scope. You can track it independently.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                  quickSuggestions: ['View project', 'Show all projects']
                };
                setMessages(prev => [...prev, confirmationMessage]);
              } else {
                Alert.alert('Error', 'Failed to add estimate to project');
              }
            },
            style: options.separate.recommended ? 'default' : undefined
          }
        ]
      );
    } catch (error) {
      console.error('Error adding estimate to project:', error);
      Alert.alert('Error', 'Failed to add estimate to project. Please try again.');
    }
  };

  const handleUpdateProject = async (projectData) => {
    try {
      const updatedProject = await saveProject(projectData);
      if (updatedProject) {
        Alert.alert('Success', 'Project updated successfully!');

        // Update the message in the chat with the new data
        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            // Find the message with the project preview
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasProject = msg.visualElements.some(
                (ve) => ve.type === 'project-preview' &&
                       (ve.data.id === projectData.id || ve.data.projectId === projectData.projectId)
              );

              if (hasProject) {
                // Update the visual element with new data
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'project-preview' &&
                        (ve.data.id === projectData.id || ve.data.projectId === projectData.projectId)) {
                      return {
                        ...ve,
                        data: updatedProject
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

        // Also update CoreAgent's lastProjectPreview so "Create Estimate" uses the edited data
        CoreAgent.updateConversationState({ lastProjectPreview: updatedProject });
        console.log('📦 [ChatScreen] Updated lastProjectPreview with edited project data');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      Alert.alert('Error', 'Failed to update project. Please try again.');
    }
  };

  const handleUpdateEstimate = async (estimateData) => {
    try {
      const estimateId = estimateData.id || estimateData.estimateId;

      // If no ID, this is a new unsaved estimate - just update the preview in chat
      if (!estimateId) {
        console.log('📝 Updating unsaved estimate preview in chat');
        // Update the message in the chat with the edited data (but don't save to DB yet)
        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              // Find estimate preview by matching estimateNumber or other identifying data
              const hasEstimate = msg.visualElements.some(
                (ve) => ve.type === 'estimate-preview' &&
                       ve.data.estimateNumber === estimateData.estimateNumber
              );

              if (hasEstimate) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview' &&
                        ve.data.estimateNumber === estimateData.estimateNumber) {
                      return {
                        ...ve,
                        data: estimateData
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
        Alert.alert('Success', 'Estimate updated! Click "Save Estimate" to save it permanently.');
        return;
      }

      // Existing estimate with ID - update in database
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

  const handleCreateProjectFromEstimate = async (estimateData) => {
    try {
      const estimateId = estimateData.id || estimateData.estimateId;
      if (!estimateId) {
        Alert.alert('Error', 'No estimate ID provided');
        return;
      }

      // Create the project from the estimate
      const createdProject = await createProjectFromEstimate(estimateId);

      if (createdProject) {
        Alert.alert(
          'Success',
          `Project "${createdProject.name}" has been created from the estimate!`,
          [
            {
              text: 'View Project',
              onPress: () => {
                // Navigate to project details if navigation is available
                if (navigation) {
                  navigation.navigate('Projects');
                }
              },
            },
            { text: 'OK', style: 'cancel' },
          ]
        );

        // Update the message in the chat to reflect estimate accepted status
        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasEstimate = msg.visualElements.some(
                (ve) => ve.type === 'estimate-preview' &&
                       (ve.data.id === estimateId || ve.data.estimateId === estimateId)
              );

              if (hasEstimate) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview' &&
                        (ve.data.id === estimateId || ve.data.estimateId === estimateId)) {
                      return {
                        ...ve,
                        data: { ...ve.data, status: 'accepted' }
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
      } else {
        Alert.alert('Error', 'Failed to create project from estimate. Please try again.');
      }
    } catch (error) {
      console.error('Error creating project from estimate:', error);
      Alert.alert('Error', 'Failed to create project from estimate. Please try again.');
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

  // ===================================
  // Settings & Configuration Handlers
  // ===================================

  const handleUpdateBusinessInfo = async (data) => {
    try {
      const { field, value } = data;
      const userProfile = await getUserProfile();

      // Update specific field or entire businessInfo object
      const updatedBusinessInfo = {
        ...(userProfile.businessInfo || {}),
        [field]: value
      };

      const success = await updateBusinessInfo(updatedBusinessInfo);
      if (success) {
        addAIMessage(`✅ Updated ${field} successfully`);
      } else {
        Alert.alert('Error', 'Failed to update business information.');
      }
    } catch (error) {
      console.error('Error updating business info:', error);
      Alert.alert('Error', 'Failed to update business information.');
    }
  };

  const handleUpdatePhaseTemplate = async (data) => {
    try {
      const { name, phases } = data;
      const userProfile = await getUserProfile();

      // Get existing templates or create new array
      const existingTemplates = userProfile.phases_template || [];

      // Check if template exists (for updates)
      const existingIndex = existingTemplates.findIndex(t => t.name === name);

      let updatedTemplates;
      if (existingIndex !== -1) {
        // Update existing template
        updatedTemplates = [...existingTemplates];
        updatedTemplates[existingIndex] = { name, phases };
      } else {
        // Add new template
        updatedTemplates = [...existingTemplates, { name, phases }];
      }

      const success = await updatePhaseTemplate(updatedTemplates);
      if (success) {
        const action = existingIndex !== -1 ? 'Updated' : 'Created';
        addAIMessage(`✅ ${action} phase template: ${name}`);
      } else {
        Alert.alert('Error', 'Failed to save phase template.');
      }
    } catch (error) {
      console.error('Error updating phase template:', error);
      Alert.alert('Error', 'Failed to save phase template.');
    }
  };

  const handleAddService = async (data) => {
    try {
      const { tradeId, serviceId, service } = data;
      const success = await addServiceToTrade(tradeId, serviceId, service);

      if (success) {
        addAIMessage(`✅ Added service: ${service.label} at $${service.price}/${service.unit}`);
      } else {
        Alert.alert('Error', 'Failed to add service.');
      }
    } catch (error) {
      console.error('Error adding service:', error);
      Alert.alert('Error', 'Failed to add service.');
    }
  };

  const handleUpdateServicePricing = async (data) => {
    try {
      const { tradeId, serviceId, price, unit } = data;
      const success = await updateServicePricing(tradeId, serviceId, price, unit);

      if (success) {
        addAIMessage(`✅ Updated service pricing to $${price}${unit ? '/' + unit : ''}`);
      } else {
        Alert.alert('Error', 'Failed to update service pricing.');
      }
    } catch (error) {
      console.error('Error updating service pricing:', error);
      Alert.alert('Error', 'Failed to update service pricing.');
    }
  };

  const handleRemoveService = async (data) => {
    try {
      const { tradeId, serviceId } = data;
      const success = await removeServiceFromTrade(tradeId, serviceId);

      if (success) {
        addAIMessage(`✅ Removed service from catalog`);
      } else {
        Alert.alert('Error', 'Failed to remove service.');
      }
    } catch (error) {
      console.error('Error removing service:', error);
      Alert.alert('Error', 'Failed to remove service.');
    }
  };

  const handleUpdateProfitMargin = async (data) => {
    try {
      const { margin } = data;
      const success = await updateProfitMargin(margin);

      if (success) {
        addAIMessage(`✅ Set profit margin to ${margin}%`);
      } else {
        Alert.alert('Error', 'Failed to update profit margin.');
      }
    } catch (error) {
      console.error('Error updating profit margin:', error);
      Alert.alert('Error', 'Failed to update profit margin.');
    }
  };

  const handleAddSubcontractorQuote = async (data) => {
    try {
      const { tradeId, company, contactName, phone, rate, unit, preferred } = data;

      const quoteData = {
        trade_id: tradeId,
        company,
        contact_name: contactName,
        phone,
        rate,
        unit,
        preferred: preferred || false
      };

      const quote = await saveSubcontractorQuote(quoteData);
      if (quote) {
        addAIMessage(`✅ Added ${company} as subcontractor ($${rate}/${unit})`);
      } else {
        Alert.alert('Error', 'Failed to add subcontractor.');
      }
    } catch (error) {
      console.error('Error adding subcontractor:', error);
      Alert.alert('Error', 'Failed to add subcontractor.');
    }
  };

  const handleUpdateSubcontractorQuote = async (data) => {
    try {
      const { quoteId, updates } = data;
      const success = await updateSubcontractorQuote(quoteId, updates);

      if (success) {
        addAIMessage(`✅ Updated subcontractor quote`);
      } else {
        Alert.alert('Error', 'Failed to update subcontractor.');
      }
    } catch (error) {
      console.error('Error updating subcontractor:', error);
      Alert.alert('Error', 'Failed to update subcontractor.');
    }
  };

  const handleDeleteSubcontractorQuote = async (data) => {
    try {
      const { quoteId, company } = data;
      const success = await deleteSubcontractorQuote(quoteId);

      if (success) {
        addAIMessage(`✅ Removed ${company || 'subcontractor'} from database`);
      } else {
        Alert.alert('Error', 'Failed to delete subcontractor.');
      }
    } catch (error) {
      console.error('Error deleting subcontractor:', error);
      Alert.alert('Error', 'Failed to delete subcontractor.');
    }
  };

  const handleUpdateInvoiceTemplate = async (data) => {
    try {
      const success = await updateInvoiceTemplate(data);

      if (success) {
        addAIMessage(`✅ Updated invoice template`);
      } else {
        Alert.alert('Error', 'Failed to update invoice template.');
      }
    } catch (error) {
      console.error('Error updating invoice template:', error);
      Alert.alert('Error', 'Failed to update invoice template.');
    }
  };

  // ===================================
  // Document Agent - Invoice Handlers
  // ===================================

  const handleUpdateInvoice = async (data) => {
    try {
      const { invoiceId, clientName, ...updates } = data;
      const success = await updateInvoice(invoiceId, updates);

      if (success) {
        addAIMessage(`✅ Updated invoice${clientName ? ' for ' + clientName : ''}`);
      } else {
        Alert.alert('Error', 'Failed to update invoice.');
      }
    } catch (error) {
      console.error('Error updating invoice:', error);
      Alert.alert('Error', 'Failed to update invoice.');
    }
  };

  const handleDeleteInvoice = async (data) => {
    try {
      const { invoiceId, invoiceNumber } = data;
      const success = await deleteInvoice(invoiceId);

      if (success) {
        addAIMessage(`✅ Deleted invoice ${invoiceNumber || ''}`);
      } else {
        Alert.alert('Error', 'Failed to delete invoice.');
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      Alert.alert('Error', 'Failed to delete invoice.');
    }
  };

  const handleRecordInvoicePayment = async (data) => {
    try {
      const { invoiceId, clientName, paymentAmount, paymentMethod, paymentDate } = data;
      const result = await recordInvoicePayment(invoiceId, paymentAmount, paymentMethod, paymentDate);

      if (result && result.success) {
        const balanceMsg = result.newBalance > 0
          ? `Remaining balance: $${result.newBalance.toFixed(2)}`
          : 'Invoice paid in full';
        addAIMessage(`✅ Recorded $${paymentAmount} payment${clientName ? ' from ' + clientName : ''}. ${balanceMsg}`);
      } else {
        Alert.alert('Error', 'Failed to record payment.');
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      Alert.alert('Error', 'Failed to record payment.');
    }
  };

  const handleVoidInvoice = async (data) => {
    try {
      const { invoiceId, invoiceNumber } = data;
      const success = await voidInvoice(invoiceId);

      if (success) {
        addAIMessage(`✅ Voided invoice ${invoiceNumber || ''}`);
      } else {
        Alert.alert('Error', 'Failed to void invoice.');
      }
    } catch (error) {
      console.error('Error voiding invoice:', error);
      Alert.alert('Error', 'Failed to void invoice.');
    }
  };

  // Contract Management Handlers
  const handleUploadContract = async () => {
    try {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Take Photo', 'Choose from Photos', 'Choose Document'],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              await uploadContractFromCamera();
            } else if (buttonIndex === 2) {
              await uploadContractFromLibrary();
            } else if (buttonIndex === 3) {
              await uploadContractFromFile();
            }
          }
        );
      } else {
        Alert.alert(
          'Upload Contract',
          'Choose a source',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Take Photo', onPress: uploadContractFromCamera },
            { text: 'Choose from Photos', onPress: uploadContractFromLibrary },
            { text: 'Choose Document', onPress: uploadContractFromFile },
          ]
        );
      }
    } catch (error) {
      console.error('Error showing upload options:', error);
      Alert.alert('Error', 'Failed to show upload options');
    }
  };

  const uploadContractFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const fileName = `Contract_${Date.now()}.jpg`;
        const uploaded = await uploadContractDocument(result.assets[0].uri, fileName, 'image');
        if (uploaded) {
          addAIMessage('✅ Contract uploaded successfully! You can now share it with clients.');
        } else {
          Alert.alert('Error', 'Failed to upload contract');
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const uploadContractFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const fileName = `Contract_${Date.now()}.jpg`;
        const uploaded = await uploadContractDocument(result.assets[0].uri, fileName, 'image');
        if (uploaded) {
          addAIMessage('✅ Contract uploaded successfully! You can now share it with clients.');
        } else {
          Alert.alert('Error', 'Failed to upload contract');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadContractFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uploaded = await uploadContractDocument(asset.uri, asset.name, asset.mimeType?.includes('pdf') ? 'document' : 'image');
        if (uploaded) {
          addAIMessage('✅ Contract uploaded successfully! You can now share it with clients.');
        } else {
          Alert.alert('Error', 'Failed to upload contract');
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleViewContract = async (data) => {
    try {
      const { contractDocument } = data;
      if (!contractDocument) {
        Alert.alert('Error', 'Contract document not found');
        return;
      }

      // Navigate to document viewer
      navigation.navigate('DocumentViewer', { document: contractDocument });
    } catch (error) {
      console.error('Error viewing contract:', error);
      Alert.alert('Error', 'Failed to view contract');
    }
  };

  const handleShareContract = async (data) => {
    try {
      const { contractId, contractName, fileUrl } = data;

      Alert.alert(
        'Share Contract',
        `Share "${contractName}" with your client?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Share',
            onPress: async () => {
              try {
                await Share.share({
                  message: `Contract: ${contractName}`,
                  url: fileUrl,
                });
                addAIMessage(`✅ Contract "${contractName}" shared successfully!`);
              } catch (error) {
                console.error('Error sharing:', error);
                Alert.alert('Error', 'Failed to share contract');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error handling share contract:', error);
      Alert.alert('Error', 'Failed to share contract');
    }
  };

  // Photo and Daily Report Retrieval Handlers
  const handleRetrievePhotos = async (data) => {
    try {
      const filters = data?.filters || {};
      const photos = await fetchPhotosWithFilters(filters);

      const photoGalleryElement = {
        type: 'photo-gallery',
        data: {
          title: data?.title || 'Project Photos',
          subtitle: data?.subtitle || '',
          photos: photos,
          totalCount: photos.length,
          filters: filters
        }
      };

      const resultMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: photos.length > 0
          ? `Found ${photos.length} photo${photos.length === 1 ? '' : 's'} matching your criteria.`
          : 'No photos found matching your criteria. Try adjusting your filters.',
        isUser: false,
        timestamp: new Date(),
        visualElements: photos.length > 0 ? [photoGalleryElement] : [],
        actions: [],
        quickSuggestions: photos.length === 0 ? ['Show all photos', 'Try different dates'] : [],
      };

      setMessages((prev) => [...prev, resultMessage]);
    } catch (error) {
      console.error('Error retrieving photos:', error);
      addAIMessage('Sorry, I encountered an error while retrieving photos. Please try again.');
    }
  };

  const handleRetrieveDailyReports = async (data) => {
    try {
      const filters = data?.filters || {};
      console.log('📋 [handleRetrieveDailyReports] Received data:', JSON.stringify(data, null, 2));
      console.log('📋 [handleRetrieveDailyReports] Using filters:', JSON.stringify(filters, null, 2));
      const reports = await fetchDailyReportsWithFilters(filters);
      console.log('📋 [handleRetrieveDailyReports] Found reports:', reports.length);

      const reportListElement = {
        type: 'daily-report-list',
        data: {
          title: data?.title || 'Daily Reports',
          subtitle: data?.subtitle || '',
          reports: reports,
          totalCount: reports.length,
          filters: filters
        }
      };

      const resultMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: reports.length > 0
          ? `Found ${reports.length} daily report${reports.length === 1 ? '' : 's'}.`
          : 'No reports found matching your criteria.',
        isUser: false,
        timestamp: new Date(),
        visualElements: reports.length > 0 ? [reportListElement] : [],
        actions: [],
        quickSuggestions: reports.length === 0 ? ['Show all reports', 'Try different dates'] : [],
      };

      setMessages((prev) => [...prev, resultMessage]);
    } catch (error) {
      console.error('Error retrieving daily reports:', error);
      addAIMessage('Sorry, I encountered an error while retrieving reports. Please try again.');
    }
  };

  // Open address in maps app
  const handleOpenMaps = (data) => {
    const address = data?.address;
    if (!address) {
      Alert.alert('Error', 'No address provided');
      return;
    }

    const encodedAddress = encodeURIComponent(address);

    Alert.alert(
      'Open in Maps',
      address,
      [
        {
          text: 'Google Maps',
          onPress: () => {
            const googleMapsUrl = Platform.select({
              ios: `comgooglemaps://?q=${encodedAddress}`,
              android: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
            });

            Linking.canOpenURL(googleMapsUrl)
              .then((supported) => {
                if (supported) {
                  return Linking.openURL(googleMapsUrl);
                } else {
                  const browserUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
                  return Linking.openURL(browserUrl);
                }
              })
              .catch((err) => {
                console.error('Error opening Google Maps:', err);
                Alert.alert('Error', 'Could not open Google Maps');
              });
          },
        },
        {
          text: 'Apple Maps',
          onPress: () => {
            const appleMapsUrl = `maps://maps.apple.com/?address=${encodedAddress}`;
            Linking.openURL(appleMapsUrl).catch((err) => {
              console.error('Error opening Apple Maps:', err);
              Alert.alert('Error', 'Could not open Apple Maps');
            });
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const renderVisualElement = (element, index) => {
    switch (element.type) {
      case 'project-card':
        return <ProjectCard key={index} data={element.data} onAction={handleAction} />;
      case 'project-selector':
        return <ProjectSelector key={index} data={element.data} onAction={handleAction} />;
      case 'worker-list':
        return <WorkerList key={index} data={element.data} />;
      case 'worker-payment-card':
        return <WorkerPaymentCard key={index} data={element.data} />;
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
      case 'contract-preview':
        return <ContractPreview key={index} data={element.data} onAction={handleAction} />;
      case 'expense-card':
        return <ExpenseCard key={index} data={element.data} />;
      case 'project-overview':
        return <ProjectOverview key={index} data={element.data} onAction={handleAction} />;
      case 'phase-overview':
        return <PhaseOverview key={index} data={element.data} onAction={handleAction} />;
      case 'daily-report-list':
        return <DailyReportList key={index} data={element.data} onAction={handleAction} />;
      case 'appointment-card':
        return <AppointmentCard key={index} data={element.data} onAction={handleAction} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white }]}>
      <SafeAreaView style={styles.safeArea}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.white }]}>
        <View style={{ flex: 1 }} />
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

      {/* Chat Messages and Input Area */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -80 : 0}
      >
        <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          style={[styles.chatArea, { backgroundColor: Colors.background }]}
          contentContainerStyle={[styles.chatContent, { paddingBottom: 180 }]}
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
                  {/* Text bubble - only show if there's text content */}
                  {message.text && message.text.trim() !== '' && (
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
                  )}

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

              {/* AI Status Message */}
              {statusMessage && (
                <StatusMessage message={statusMessage} />
              )}
            </>
          )}
        </ScrollView>

        {/* AI Input Component - Floating over content with glass effect */}
        <View style={styles.inputWrapperFloat}>
          <View style={styles.inputWrapperGlass}>
          <AIInputWithSearch
              placeholder="Type a message..."
            onSubmit={handleSend}
            onFileSelect={handleFileSelect}
            onCameraPress={handleCameraOpen}
            onPopulateInput={handlePopulateInput}
          />
          </View>
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
  inputWrapperFloat: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  inputWrapperGlass: {
    backgroundColor: 'transparent',
    paddingBottom: 55,
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
