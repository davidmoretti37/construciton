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
  Share,
  ActionSheetIOS,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import AIInputWithSearch from '../components/AIInputWithSearch';
import AnimatedText from '../components/AnimatedText';
import LinkifiedText from '../components/LinkifiedText';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { sendMessageToAI, sendMessageToAIStreaming, getProjectContext, analyzeScreenshot, formatProjectConfirmation, setVoiceMode } from '../services/aiService';
import CoreAgent from '../services/agents/core/CoreAgent';
import { ProjectCard, ProjectPreview, WorkerList, BudgetChart, PhotoGallery, EstimatePreview, EstimateList, InvoicePreview, InvoiceList, ProjectSelector, ExpenseCard, ProjectOverview, PhaseOverview, ContractPreview, ContractList, DocumentPicker as ChatDocumentPicker, WorkerPaymentCard, DailyReportList, AppointmentCard } from '../components/ChatVisuals';
import { formatEstimate } from '../utils/estimateFormatter';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../utils/messaging';
import { fetchWorkers, fetchProjects, getUserProfile, getUserServices, updateUserServicePricing, saveProject, transformScreenshotToProject, getProject, saveEstimate, updateEstimate, createInvoiceFromEstimate, markInvoiceAsPaid, updateInvoicePDF, getInvoice, updateTradePricing, updatePhaseProgress, extendPhaseTimeline, startPhase, completePhase, fetchProjectPhases, addTaskToPhase, saveDailyReport, savePhasePaymentAmount, deleteProject, createProjectFromEstimate, createWorker, updateWorker, clockIn, clockOut, getActiveClockIn, createScheduleEvent, updateScheduleEvent, deleteScheduleEvent, createWorkSchedule, updateWorkSchedule, deleteWorkSchedule, updateBusinessInfo, updatePhaseTemplate, addServiceToTrade, removeServiceFromTrade, updateServicePricing, updateProfitMargin, saveSubcontractorQuote, updateSubcontractorQuote, deleteSubcontractorQuote, updateInvoiceTemplate, updateInvoice, deleteInvoice, recordInvoicePayment, voidInvoice, uploadContractDocument, calculateWorkerPaymentForPeriod, fetchPhotosWithFilters, fetchDailyReportsWithFilters, fetchDailyReportById, getTodaysWorkersSchedule, editTimeEntry, createManualTimeEntry, deleteTimeEntry, createRecurringEvent, updateRecurringEvent, deleteRecurringEvent, setWorkerAvailability, setWorkerPTO, removeWorkerAvailability, createCrew, getCrew, updateCrew, deleteCrew, createShiftTemplate, applyShiftTemplate, deleteShiftTemplate, startWorkerBreak, endWorkerBreak, swapWorkerShifts, fetchScheduleEvents, getProjectWorkers, getAverageWorkerRate } from '../utils/storage';
import { generateInvoicePDF, uploadInvoicePDF, previewInvoicePDF, shareInvoicePDF } from '../utils/pdfGenerator';
import TimelinePickerModal from '../components/TimelinePickerModal';
import BudgetInputModal from '../components/BudgetInputModal';
import JobNameInputModal from '../components/JobNameInputModal';
import AddCustomServiceModal from '../components/AddCustomServiceModal';
import OrbitalLoader from '../components/OrbitalLoader';
import StatusMessage from '../components/StatusMessage';
import NotificationBell from '../components/NotificationBell';
import OwnerHeader from '../components/OwnerHeader';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import logger from '../utils/logger';

// Action hooks
import {
  useWorkerActions,
  useScheduleActions,
  useProjectActions,
  useEstimateActions,
  useInvoiceActions,
  useReportActions,
  useSettingsActions,
} from '../hooks/actions';

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
  const { t } = useTranslation(['chat', 'common']);
  const aiTimeoutRef = useRef(null); // Store timeout ID for AI response
  const { hasActiveSubscription } = useSubscription();
  const { profile } = useAuth() || {};
  const isOwner = profile?.role === 'owner';
  const isSupervisor = profile?.role === 'supervisor';

  // Helper function to add AI messages programmatically
  const addAIMessage = useCallback((text) => {
    const aiMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const aiMessage = {
      id: aiMessageId,
      text: text,
      isUser: false,
      timestamp: new Date(),
      visualElements: [],
      actions: [],
    };
    setMessages((prev) => [...prev, aiMessage]);
  }, []);

  // Initialize action hooks
  const workerActions = useWorkerActions({ addMessage: addAIMessage, setMessages });
  const scheduleActions = useScheduleActions({ addMessage: addAIMessage });
  const projectActions = useProjectActions({ addMessage: addAIMessage, setMessages, navigation });
  const estimateActions = useEstimateActions({ addMessage: addAIMessage, setMessages, messages });
  const invoiceActions = useInvoiceActions({ addMessage: addAIMessage, setMessages });
  const reportActions = useReportActions({ addMessage: addAIMessage, setMessages });
  const settingsActions = useSettingsActions({ addMessage: addAIMessage });

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

  // Handle initialMessage and projectIdForEstimate params together
  // This ensures project context is enriched BEFORE the message is sent
  useEffect(() => {
    const params = route?.params;
    if (!params?.initialMessage && !params?.projectIdForEstimate) return;

    const handleNavigationParams = async () => {
      // Step 1: If we have a projectId, enrich the context FIRST
      if (params?.projectIdForEstimate) {
        try {
          // Fetch project with timeline
          const project = await getProject(params.projectIdForEstimate);
          if (project) {
            // Fetch assigned workers with their rates
            const workers = await getProjectWorkers(params.projectIdForEstimate);

            // Calculate project duration (getProject returns camelCase: startDate, endDate)
            let projectDuration = 0;
            const projectStartDate = project.startDate || project.start_date;
            const projectEndDate = project.endDate || project.end_date;
            if (projectStartDate && projectEndDate) {
              const start = new Date(projectStartDate + 'T00:00:00');
              const end = new Date(projectEndDate + 'T00:00:00');
              projectDuration = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            }

            // Calculate total daily labor cost from assigned workers
            let totalDailyLaborCost = 0;
            if (workers && workers.length > 0) {
              workers.forEach(w => {
                const daily = parseFloat(w.daily_rate) || (parseFloat(w.hourly_rate) || 0) * 8;
                totalDailyLaborCost += daily;
              });
            } else {
              // No assigned workers - use average rate as fallback
              const avgRate = await getAverageWorkerRate();
              totalDailyLaborCost = avgRate?.daily || 200; // Default to $200/day if no workers
            }

            // Build enriched project context for AI
            const enrichedProject = {
              ...project,
              id: project.id,
              projectName: project.name,
              client: project.client,
              location: project.location || project.address,
              phone: project.phone,
              email: project.email,
              start_date: projectStartDate,
              end_date: projectEndDate,
              schedule: {
                startDate: projectStartDate,
                estimatedEndDate: projectEndDate,
              },
              assignedWorkers: workers || [],
              projectDuration,
              totalDailyLaborCost,
              calculatedLaborCost: projectDuration * totalDailyLaborCost,
              noWorkersAssigned: !workers || workers.length === 0,
            };

            // Update CoreAgent's conversation state with the enriched project
            CoreAgent.updateConversationState({
              lastProjectPreview: enrichedProject,
              projectForEstimate: enrichedProject
            });

            console.log('📋 [ChatScreen] Enriched project context for estimate:', {
              name: enrichedProject.projectName,
              startDate: projectStartDate,
              endDate: projectEndDate,
              duration: projectDuration,
              workers: workers?.length || 0,
              laborCost: enrichedProject.calculatedLaborCost
            });
          }
        } catch (error) {
          console.error('Error enriching project context:', error);
        }
      }

      // Step 2: NOW send the initial message (after context is enriched)
      if (params?.initialMessage) {
        // Small delay to ensure context is propagated
        await new Promise(resolve => setTimeout(resolve, 100));
        handleSend(params.initialMessage);
      }

      // Clear params so they don't trigger again
      navigation.setParams({ initialMessage: undefined, projectIdForEstimate: undefined });
    };

    handleNavigationParams();
  }, [route?.params?.initialMessage, route?.params?.projectIdForEstimate]);

  const handleSend = async (text, withSearch) => {
    if (text.trim() === '') return;

    // Check subscription before allowing AI chat
    if (!hasActiveSubscription) {
      navigation.navigate('Settings', { screen: 'Paywall' });
      return;
    }

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
    setStatusMessage(t('thinking'));
    let messageCreated = false; // Track if we've created the message bubble

    // Set 50-second timeout
    aiTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ AI response timeout - 50 seconds elapsed');
      setIsAIThinking(false);
      setStatusMessage(null); // Clear status on timeout

      if (!messageCreated) {
        const timeoutMessage = {
          id: aiMessageId,
          text: t('messages.error'),
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [{
            type: 'retry',
            label: 'Retry',
            data: { originalMessage: text }
          }],
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
            projectActions.handleUpdateProjectFinances(updateAction.data);
          }

          // AUTO-EXECUTE worker payment queries
          const workerPaymentAction = parsedResponse.actions?.find(action => action.type === 'get-worker-payment');
          if (workerPaymentAction) {
            console.log('🔄 Auto-executing worker payment query:', workerPaymentAction.data);
            workerActions.handleGetWorkerPayment(workerPaymentAction);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [] }
                  : msg
              )
            );
          }

          // AUTO-EXECUTE worker creation/update actions
          const createWorkerAction = parsedResponse.actions?.find(action => action.type === 'create-worker');
          if (createWorkerAction) {
            console.log('🔄 Auto-executing worker creation:', createWorkerAction.data);
            workerActions.handleCreateWorker(createWorkerAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const updateWorkerAction = parsedResponse.actions?.find(action => action.type === 'update-worker');
          if (updateWorkerAction) {
            console.log('🔄 Auto-executing worker update:', updateWorkerAction.data);
            workerActions.handleUpdateWorker(updateWorkerAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE delete worker actions (handles multiple deletions)
          const deleteWorkerActions = parsedResponse.actions?.filter(action => action.type === 'delete-worker');
          if (deleteWorkerActions && deleteWorkerActions.length > 0) {
            console.log('🔄 Auto-executing worker deletions:', deleteWorkerActions.length);
            deleteWorkerActions.forEach(deleteAction => {
              workerActions.handleDeleteWorker(deleteAction.data);
            });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE delete all workers action
          const deleteAllWorkersAction = parsedResponse.actions?.find(action => action.type === 'delete-all-workers');
          if (deleteAllWorkersAction) {
            console.log('🔄 Auto-executing delete all workers:', deleteAllWorkersAction.data);
            workerActions.handleDeleteAllWorkers(deleteAllWorkersAction.data, { skipConfirmation: true });

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE clock in/out actions
          const clockInAction = parsedResponse.actions?.find(action => action.type === 'clock-in-worker');
          if (clockInAction) {
            console.log('🔄 Auto-executing clock in:', clockInAction.data);
            workerActions.handleClockInWorker(clockInAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const clockOutAction = parsedResponse.actions?.find(action => action.type === 'clock-out-worker');
          if (clockOutAction) {
            console.log('🔄 Auto-executing clock out:', clockOutAction.data);
            workerActions.handleClockOutWorker(clockOutAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const bulkClockInAction = parsedResponse.actions?.find(action => action.type === 'bulk-clock-in');
          if (bulkClockInAction) {
            console.log('🔄 Auto-executing bulk clock in:', bulkClockInAction.data);
            workerActions.handleBulkClockIn(bulkClockInAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const bulkClockOutAction = parsedResponse.actions?.find(action => action.type === 'bulk-clock-out');
          if (bulkClockOutAction) {
            console.log('🔄 Auto-executing bulk clock out:', bulkClockOutAction.data);
            workerActions.handleBulkClockOut(bulkClockOutAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE time entry actions
          const editTimeAction = parsedResponse.actions?.find(action => action.type === 'edit-time-entry');
          if (editTimeAction) {
            console.log('🔄 Auto-executing edit time entry:', editTimeAction.data);
            workerActions.handleEditTimeEntry(editTimeAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const createTimeAction = parsedResponse.actions?.find(action => action.type === 'create-time-entry');
          if (createTimeAction) {
            console.log('🔄 Auto-executing create time entry:', createTimeAction.data);
            workerActions.handleCreateTimeEntry(createTimeAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const deleteTimeAction = parsedResponse.actions?.find(action => action.type === 'delete-time-entry');
          if (deleteTimeAction) {
            console.log('🔄 Auto-executing delete time entry:', deleteTimeAction.data);
            workerActions.handleDeleteTimeEntry(deleteTimeAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE availability actions
          const setAvailabilityAction = parsedResponse.actions?.find(action => action.type === 'set-worker-availability');
          if (setAvailabilityAction) {
            console.log('🔄 Auto-executing set availability:', setAvailabilityAction.data);
            workerActions.handleSetWorkerAvailability(setAvailabilityAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const setPTOAction = parsedResponse.actions?.find(action => action.type === 'set-worker-pto');
          if (setPTOAction) {
            console.log('🔄 Auto-executing set PTO:', setPTOAction.data);
            workerActions.handleSetWorkerPTO(setPTOAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const removeAvailabilityAction = parsedResponse.actions?.find(action => action.type === 'remove-worker-availability');
          if (removeAvailabilityAction) {
            console.log('🔄 Auto-executing remove availability:', removeAvailabilityAction.data);
            workerActions.handleRemoveWorkerAvailability(removeAvailabilityAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE crew actions
          const createCrewAction = parsedResponse.actions?.find(action => action.type === 'create-crew');
          if (createCrewAction) {
            console.log('🔄 Auto-executing create crew:', createCrewAction.data);
            workerActions.handleCreateCrew(createCrewAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const updateCrewAction = parsedResponse.actions?.find(action => action.type === 'update-crew');
          if (updateCrewAction) {
            console.log('🔄 Auto-executing update crew:', updateCrewAction.data);
            workerActions.handleUpdateCrew(updateCrewAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const deleteCrewAction = parsedResponse.actions?.find(action => action.type === 'delete-crew');
          if (deleteCrewAction) {
            console.log('🔄 Auto-executing delete crew:', deleteCrewAction.data);
            workerActions.handleDeleteCrew(deleteCrewAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE shift template actions
          const createShiftAction = parsedResponse.actions?.find(action => action.type === 'create-shift-template');
          if (createShiftAction) {
            console.log('🔄 Auto-executing create shift template:', createShiftAction.data);
            workerActions.handleCreateShiftTemplate(createShiftAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const applyShiftAction = parsedResponse.actions?.find(action => action.type === 'apply-shift-template');
          if (applyShiftAction) {
            console.log('🔄 Auto-executing apply shift template:', applyShiftAction.data);
            workerActions.handleApplyShiftTemplate(applyShiftAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const deleteShiftAction = parsedResponse.actions?.find(action => action.type === 'delete-shift-template');
          if (deleteShiftAction) {
            console.log('🔄 Auto-executing delete shift template:', deleteShiftAction.data);
            workerActions.handleDeleteShiftTemplate(deleteShiftAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE break actions
          const startBreakAction = parsedResponse.actions?.find(action => action.type === 'start-break');
          if (startBreakAction) {
            console.log('🔄 Auto-executing start break:', startBreakAction.data);
            workerActions.handleStartBreak(startBreakAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const endBreakAction = parsedResponse.actions?.find(action => action.type === 'end-break');
          if (endBreakAction) {
            console.log('🔄 Auto-executing end break:', endBreakAction.data);
            workerActions.handleEndBreak(endBreakAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE swap shifts action
          const swapShiftsAction = parsedResponse.actions?.find(action => action.type === 'swap-shifts');
          if (swapShiftsAction) {
            console.log('🔄 Auto-executing swap shifts:', swapShiftsAction.data);
            workerActions.handleSwapShifts(swapShiftsAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE schedule event actions (create, update, delete)
          const createScheduleAction = parsedResponse.actions?.find(action => action.type === 'create-schedule-event');
          const updateScheduleAction = parsedResponse.actions?.find(action => action.type === 'update-schedule-event');
          const deleteScheduleAction = parsedResponse.actions?.find(action => action.type === 'delete-schedule-event');

          if (createScheduleAction) {
            console.log('🔄 Auto-executing schedule event creation:', createScheduleAction.data);
            scheduleActions.handleCreateScheduleEvent(createScheduleAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [] }
                  : msg
              )
            );
          } else if (updateScheduleAction) {
            console.log('🔄 Auto-executing schedule event update:', updateScheduleAction.data);
            scheduleActions.handleUpdateScheduleEvent(updateScheduleAction.data);

            // Clear actions and suggestions
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [] }
                  : msg
              )
            );
          } else if (deleteScheduleAction) {
            console.log('🔄 Auto-executing schedule event deletion:', deleteScheduleAction.data);
            scheduleActions.handleDeleteScheduleEvent(deleteScheduleAction.data);

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE delete project action
          const deleteProjectAction = parsedResponse.actions?.find(action => action.type === 'delete-project');
          if (deleteProjectAction) {
            console.log('🔄 Auto-executing project deletion:', deleteProjectAction.data);
            projectActions.handleDeleteProject(deleteProjectAction.data, { skipConfirmation: true });

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE delete all projects action
          const deleteAllProjectsAction = parsedResponse.actions?.find(action => action.type === 'delete-all-projects');
          if (deleteAllProjectsAction) {
            console.log('🔄 Auto-executing delete all projects:', deleteAllProjectsAction.data);
            projectActions.handleDeleteAllProjects(deleteAllProjectsAction.data, { skipConfirmation: true });

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE delete all estimates action
          const deleteAllEstimatesAction = parsedResponse.actions?.find(action => action.type === 'delete-all-estimates');
          if (deleteAllEstimatesAction) {
            console.log('🔄 Auto-executing delete all estimates:', deleteAllEstimatesAction.data);
            estimateActions.handleDeleteAllEstimates(deleteAllEstimatesAction.data, { skipConfirmation: true });

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE sync tasks to calendar action
          const syncTasksAction = parsedResponse.actions?.find(action => action.type === 'sync-tasks-to-calendar');
          if (syncTasksAction) {
            console.log('🔄 Auto-executing sync tasks to calendar:', syncTasksAction.data);
            projectActions.handleSyncProjectTasksToCalendar(syncTasksAction.data);

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE update project action
          const updateProjectAction = parsedResponse.actions?.find(action => action.type === 'update-project');
          if (updateProjectAction) {
            console.log('🔄 Auto-executing project update:', updateProjectAction.data);
            projectActions.handleUpdateProject(updateProjectAction.data, { skipConfirmation: true });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE add estimate to project choice
          const addEstimateAction = parsedResponse.actions?.find(action => action.type === 'add-estimate-to-project-choice');
          if (addEstimateAction) {
            console.log('🔄 Auto-executing add estimate to project:', addEstimateAction.data);
            projectActions.handleAddEstimateToProjectChoice(addEstimateAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE update estimate action
          const updateEstimateAction = parsedResponse.actions?.find(action => action.type === 'update-estimate');
          if (updateEstimateAction) {
            console.log('🔄 Auto-executing estimate update:', updateEstimateAction.data);
            estimateActions.handleUpdateEstimate(updateEstimateAction.data, { skipConfirmation: true });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE record invoice payment
          const recordPaymentAction = parsedResponse.actions?.find(action => action.type === 'record-invoice-payment');
          if (recordPaymentAction) {
            console.log('🔄 Auto-executing invoice payment:', recordPaymentAction.data);
            invoiceActions.handleRecordInvoicePayment(recordPaymentAction.data, { skipConfirmation: true });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE retrieve daily reports action
          const retrieveReportsAction = parsedResponse.actions?.find(action => action.type === 'retrieve-daily-reports');
          if (retrieveReportsAction) {
            console.log('🔄 Auto-executing retrieve daily reports:', retrieveReportsAction.data);
            reportActions.handleRetrieveDailyReports(retrieveReportsAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [] }
                  : msg
              )
            );
          }

          // AUTO-EXECUTE retrieve photos action
          const retrievePhotosAction = parsedResponse.actions?.find(action => action.type === 'retrieve-photos');
          if (retrievePhotosAction) {
            console.log('🔄 Auto-executing retrieve photos:', retrievePhotosAction.data);
            reportActions.handleRetrievePhotos(retrievePhotosAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [] }
                  : msg
              )
            );
          }

          // AUTO-EXECUTE retrieve schedule events action
          const retrieveScheduleAction = parsedResponse.actions?.find(action => action.type === 'retrieve-schedule-events');
          if (retrieveScheduleAction) {
            console.log('🔄 Auto-executing retrieve schedule events:', retrieveScheduleAction.data);
            scheduleActions.handleRetrieveScheduleEvents(retrieveScheduleAction.data);

            // Clear actions and suggestions from the message since we auto-executed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, actions: [] }
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
        Alert.alert(t('upload.selectFile'), t('messages.error'));
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
          text: t('upload.uploading'),
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
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
            },
          ];
        });
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('messages.error'), t('upload.uploadFailed'));
    }
  };

  const handleCameraOpen = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('upload.takePhoto'), t('voice.permissionDenied'));
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
          text: t('voice.processing'),
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
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
            },
          ];
        });
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('messages.error'), t('upload.uploadFailed'));
    }
  };

  const handleAction = async (action) => {
    console.log('Action pressed:', action);

    // Supervisor restrictions - block certain actions
    const SUPERVISOR_RESTRICTED_ACTIONS = [
      'save-estimate', 'create-estimate', 'confirm-estimate', 'generate-estimate',
      'convert-estimate-to-invoice', 'create-invoice', 'save-invoice',
      'create-project', 'save-project', 'confirm-project',
      'create-project-from-screenshot', 'create-project-from-estimate',
      'get-worker-payment'
    ];

    if (isSupervisor && SUPERVISOR_RESTRICTED_ACTIONS.includes(action.type)) {
      Alert.alert(
        t('common:alerts.restricted', 'Restricted'),
        t('common:messages.ownerOnly', 'This action is only available to owners.')
      );
      return;
    }

    try {
      switch (action.type) {
      // Navigation & View Actions
      case 'view-project':
        console.log('View project:', action.data?.projectId || action.data?.id);
        if (action.data?.projectId || action.data?.id) {
          // Navigate to nested screen: Projects tab -> ProjectDetail screen
          navigation.navigate('Projects', {
            screen: 'ProjectDetail',
            params: { projectId: action.data.projectId || action.data.id }
          });
        }
        break;
      case 'view-photos':
        console.log('View photos for:', action.data.projectId);
        break;
      case 'add-worker':
        console.log('Add worker');
        break;
      case 'navigate-to-projects':
        navigation.navigate('Projects');
        break;
      case 'view-estimate':
        console.log('View estimate:', action.data);
        // Store estimate for invoice creation (Plan A/Plan B pattern)
        CoreAgent.updateConversationState({ lastEstimatePreview: action.data });
        console.log('📦 Stored estimate in lastEstimatePreview for invoice creation');
        break;

      // UI Modal Actions (stay in ChatScreen)
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
        Alert.alert(t('common:alerts.info'), t('common:messages.featureComingSoon', { feature: 'Worker assignment' }));
        break;

      // Message/Chat Actions
      case 'retry':
        if (action.data?.originalMessage) handleSend(action.data.originalMessage, false);
        break;
      case 'edit-project-details':
        handleSend('I want to edit the project details', false);
        break;
      case 'create-estimate':
        const pName = action.projectName || action.data?.projectName;
        if (pName) handleSend(`create estimate for ${pName}`, false);
        break;
      case 'generate-estimate':
      case 'confirm-estimate':
        handleSend('yes, create the estimate', false);
        break;
      case 'reschedule-appointment':
        addAIMessage(`Let's reschedule "${action.data?.title || 'this appointment'}". When would you like to move it to?`);
        break;
      case 'cancel-appointment':
        Alert.alert(
          t('common:alerts.confirm'),
          t('common:alerts.areYouSure'),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            { text: t('common:buttons.delete'), style: 'destructive', onPress: () => scheduleActions.handleDeleteScheduleEvent({ id: action.data?.id, eventTitle: action.data?.title }) }
          ]
        );
        break;

      // Worker Actions (from useWorkerActions)
      case 'get-worker-payment':
        await workerActions.handleGetWorkerPayment(action);
        break;
      case 'create-worker':
        await workerActions.handleCreateWorker(action.data);
        break;
      case 'update-worker':
        await workerActions.handleUpdateWorker(action.data);
        break;
      case 'delete-worker':
        await workerActions.handleDeleteWorker(action.data);
        break;
      case 'delete-all-workers':
        await workerActions.handleDeleteAllWorkers(action.data);
        break;
      case 'clock-in-worker':
        await workerActions.handleClockInWorker(action.data);
        break;
      case 'clock-out-worker':
        await workerActions.handleClockOutWorker(action.data);
        break;
      case 'bulk-clock-in':
        await workerActions.handleBulkClockIn(action.data);
        break;
      case 'bulk-clock-out':
        await workerActions.handleBulkClockOut(action.data);
        break;
      case 'edit-time-entry':
        await workerActions.handleEditTimeEntry(action.data);
        break;
      case 'create-time-entry':
        await workerActions.handleCreateTimeEntry(action.data);
        break;
      case 'delete-time-entry':
        await workerActions.handleDeleteTimeEntry(action.data);
        break;
      case 'set-worker-availability':
        await workerActions.handleSetWorkerAvailability(action.data);
        break;
      case 'set-worker-pto':
        await workerActions.handleSetWorkerPTO(action.data);
        break;
      case 'remove-worker-availability':
        await workerActions.handleRemoveWorkerAvailability(action.data);
        break;
      case 'create-crew':
        await workerActions.handleCreateCrew(action.data);
        break;
      case 'update-crew':
        await workerActions.handleUpdateCrew(action.data);
        break;
      case 'delete-crew':
        await workerActions.handleDeleteCrew(action.data);
        break;
      case 'create-shift-template':
        await workerActions.handleCreateShiftTemplate(action.data);
        break;
      case 'apply-shift-template':
        await workerActions.handleApplyShiftTemplate(action.data);
        break;
      case 'delete-shift-template':
        await workerActions.handleDeleteShiftTemplate(action.data);
        break;
      case 'start-break':
        await workerActions.handleStartBreak(action.data);
        break;
      case 'end-break':
        await workerActions.handleEndBreak(action.data);
        break;
      case 'swap-shifts':
        await workerActions.handleSwapShifts(action.data);
        break;

      // Schedule Actions (from useScheduleActions)
      case 'create-schedule-event':
        await scheduleActions.handleCreateScheduleEvent(action.data);
        break;
      case 'update-schedule-event':
        await scheduleActions.handleUpdateScheduleEvent(action.data);
        break;
      case 'delete-schedule-event':
        await scheduleActions.handleDeleteScheduleEvent(action.data);
        break;
      case 'retrieve-schedule-events':
        await scheduleActions.handleRetrieveScheduleEvents(action.data);
        break;
      case 'create-work-schedule':
        await scheduleActions.handleCreateWorkSchedule(action.data);
        break;
      case 'update-work-schedule':
        await scheduleActions.handleUpdateWorkSchedule(action.data);
        break;
      case 'bulk-create-work-schedule':
        await scheduleActions.handleBulkCreateWorkSchedule(action.data);
        break;
      case 'create-recurring-event':
        await scheduleActions.handleCreateRecurringEvent(action.data);
        break;
      case 'update-recurring-event':
        await scheduleActions.handleUpdateRecurringEvent(action.data);
        break;
      case 'delete-recurring-event':
        await scheduleActions.handleDeleteRecurringEvent(action.data);
        break;
      case 'create-worker-task':
        await scheduleActions.handleCreateWorkerTask(action.data);
        break;
      case 'update-worker-task':
        await scheduleActions.handleUpdateWorkerTask(action.data);
        break;
      case 'complete-worker-task':
        await scheduleActions.handleCompleteWorkerTask(action.data);
        break;
      case 'delete-worker-task':
        await scheduleActions.handleDeleteWorkerTask(action.data);
        break;

      // Project Actions (from useProjectActions)
      case 'create-project':
      case 'save-project':
      case 'confirm-project': {
        const savedProject = await projectActions.handleSaveProject(action.data, messages);
        if (savedProject?.id) {
          return { projectId: savedProject.id };
        }
        break;
      }
      case 'create-project-from-screenshot':
        await projectActions.handleCreateProjectFromScreenshot(action.data);
        break;
      case 'delete-project':
        await projectActions.handleDeleteProject(action.data);
        break;
      case 'delete-all-projects':
        await projectActions.handleDeleteAllProjects(action.data);
        break;
      case 'sync-tasks-to-calendar':
        await projectActions.handleSyncProjectTasksToCalendar(action.data);
        break;
      case 'update-project':
        await projectActions.handleUpdateProject(action.data);
        break;
      case 'select-project':
        await projectActions.handleSelectProject(action.data);
        break;
      case 'update-project-finances':
        await projectActions.handleUpdateProjectFinances(action.data);
        break;
      case 'update-phase-progress':
        await projectActions.handleUpdatePhaseProgress(action.data);
        break;
      case 'extend-phase-timeline':
        await projectActions.handleExtendPhaseTimeline(action.data);
        break;
      case 'start-phase':
        await projectActions.handleStartPhase(action.data);
        break;
      case 'complete-phase':
        await projectActions.handleCompletePhase(action.data);
        break;
      case 'view-project-phases':
        await projectActions.handleViewProjectPhases(action.data);
        break;
      case 'add-phase-tasks':
        await projectActions.handleAddPhaseTasks(action.data);
        break;
      case 'set-phase-payment':
        await projectActions.handleSetPhasePayment(action.data);
        break;
      case 'create-project-from-estimate':
        await projectActions.handleCreateProjectFromEstimate(action.data);
        break;
      case 'add-estimate-to-project-choice':
        await projectActions.handleAddEstimateToProjectChoice(action.data);
        break;

      // Estimate Actions (from useEstimateActions)
      case 'save-estimate':
        await estimateActions.handleSaveEstimate(action.data);
        break;
      case 'update-estimate':
        await estimateActions.handleUpdateEstimate(action.data);
        break;
      case 'send-estimate-sms':
      case 'send-estimate-whatsapp':
        await estimateActions.handleSendEstimate(action);
        break;
      case 'delete-all-estimates':
        await estimateActions.handleDeleteAllEstimates(action.data);
        break;

      // Invoice Actions (from useInvoiceActions)
      case 'convert-estimate-to-invoice':
        await invoiceActions.handleConvertToInvoice(action.data);
        break;
      case 'preview-invoice-pdf':
        await invoiceActions.handlePreviewInvoicePDF(action.data);
        break;
      case 'share-invoice-pdf':
        await invoiceActions.handleShareInvoicePDF(action.data);
        break;
      case 'update-invoice':
        await invoiceActions.handleUpdateInvoice(action.data);
        break;
      case 'delete-invoice':
        await invoiceActions.handleDeleteInvoice(action.data);
        break;
      case 'record-invoice-payment':
        await invoiceActions.handleRecordInvoicePayment(action.data);
        break;
      case 'void-invoice':
        await invoiceActions.handleVoidInvoice(action.data);
        break;

      // Report Actions (from useReportActions)
      case 'save-daily-report':
        await reportActions.handleSaveDailyReport(action.data);
        break;
      case 'create-daily-report':
        await reportActions.handleCreateDailyReport(action.data);
        break;
      case 'retrieve-photos':
        await reportActions.handleRetrievePhotos(action.data);
        break;
      case 'retrieve-daily-reports':
        await reportActions.handleRetrieveDailyReports(action.data);
        break;
      case 'view-report-detail':
        try {
          const report = await fetchDailyReportById(action.data.reportId);
          if (report) navigation.navigate('DailyReportDetail', { report });
          else Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'report details' }));
        } catch (error) {
          console.error('Error fetching report:', error);
          Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'report details' }));
        }
        break;
      case 'view-photo':
        if (action.data?.photo) {
          // Navigate to in-app document viewer instead of opening external URL
          navigation.navigate('DocumentViewer', { photo: action.data.photo });
        }
        break;

      // Settings Actions (from useSettingsActions)
      case 'update-business-info':
        await settingsActions.handleUpdateBusinessInfo(action.data);
        break;
      case 'create-phase-template':
      case 'update-phase-template':
        await settingsActions.handleUpdatePhaseTemplate(action.data);
        break;
      case 'add-service':
        await settingsActions.handleAddService(action.data);
        break;
      case 'update-service-pricing':
        await settingsActions.handleUpdateServicePricing(action.data);
        break;
      case 'remove-service':
        await settingsActions.handleRemoveService(action.data);
        break;
      case 'update-profit-margin':
        await settingsActions.handleUpdateProfitMargin(action.data);
        break;
      case 'add-subcontractor-quote':
        await settingsActions.handleAddSubcontractorQuote(action.data);
        break;
      case 'update-subcontractor-quote':
        await settingsActions.handleUpdateSubcontractorQuote(action.data);
        break;
      case 'delete-subcontractor-quote':
        await settingsActions.handleDeleteSubcontractorQuote(action.data);
        break;
      case 'update-invoice-template':
        await settingsActions.handleUpdateInvoiceTemplate(action.data);
        break;

      // Contract Actions (keep local for now - uses ImagePicker)
      case 'upload-contract':
        await handleUploadContract();
        break;
      case 'view-contract':
        await handleViewContract(action.data);
        break;
      case 'share-contract':
        await handleShareContract(action.data);
        break;
      case 'document-selected':
        await handleDocumentSelected(action.data);
        break;

      // Maps Action
      case 'open-maps':
        handleOpenMaps(action.data);
        break;

      default:
        console.error('Unknown action type:', action.type);
        Alert.alert(t('common:alerts.error'), t('common:messages.featureComingSoon', { feature: action.type }));
    }
    } catch (error) {
      logger.error(`Action "${action.type}" failed:`, error);
      Alert.alert(
        t('common:alerts.error'),
        t('common:messages.somethingWentWrong') || 'Something went wrong. Please try again.'
      );
    }
  };

  // Modal handlers (kept local - used by modal components)
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
        Alert.alert(t('common:alerts.missingInfo'), t('common:messages.pleaseSelect', { item: 'a service from the More screen' }));
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

      // Format the service for display
      const formattedService = `${serviceData.label} ($${serviceData.price}/${serviceData.unit})`;

      // Automatically send this as the user's selection
      await handleSend(formattedService, false);

      Alert.alert(
        t('common:alerts.success'),
        t('common:messages.savedSuccessfully', { item: serviceData.label })
      );
    } catch (error) {
      console.error('Error adding custom service:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'custom service' }));
    }
  };

  // NOTE: Project/worker/schedule/estimate/invoice/settings handlers have been moved to hooks
  // The hooks are: useWorkerActions, useScheduleActions, useProjectActions,
  // useEstimateActions, useInvoiceActions, useReportActions, useSettingsActions

  // OLD HANDLERS REMOVED - Now using action hooks
  // See: useWorkerActions, useScheduleActions, useProjectActions,
  // useEstimateActions, useInvoiceActions, useReportActions, useSettingsActions

  // Estimate/Project/Invoice handlers (kept for modal compatibility)
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
                // Keep already-resolved projectId (don't overwrite null with bad preview data)
                const resolvedProjectId = completeEstimateData.projectId;
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
                  // Keep the already-resolved projectId
                  projectId: resolvedProjectId,
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

      // If no valid projectId, try to get it from saved project in conversation state
      if (!completeEstimateData.projectId) {
        const savedProjectId = coreAgentRef.current?.conversationState?.lastProjectPreview?.id;
        if (savedProjectId && savedProjectId.length === 36) {
          console.log('✅ Found project ID from saved project in conversation state:', savedProjectId);
          completeEstimateData.projectId = savedProjectId;
        }
      }

      // If estimate has a linked project, give user clear save options
      if (completeEstimateData.projectId) {
        const existingProject = await getProject(completeEstimateData.projectId);

        if (existingProject) {
          // Project exists - give user 2 clear options
          Alert.alert(
            t('common:alerts.confirm'),
            t('common:messages.pleaseSelect', { item: 'how to save this estimate' }),
            [
              {
                text: t('common:buttons.cancel'),
                style: 'cancel'
              },
              {
                text: t('common:buttons.save'),
                onPress: async () => {
                  // Save estimate without linking to project
                  const savedEstimate = await saveEstimate({
                    ...completeEstimateData,
                    projectId: null // Remove link to prevent project update
                  });
                  if (savedEstimate) {
                    Alert.alert(t('common:alerts.success'), t('common:messages.savedSuccessfully', { item: `Estimate ${savedEstimate.estimate_number}` }));
                  }
                }
              },
              {
                text: t('common:buttons.save') + ' & Add to Project',
                onPress: async () => {
                  // Save estimate and update the project
                  const savedEstimate = await saveEstimate(completeEstimateData);
                  if (savedEstimate) {
                    Alert.alert(t('common:alerts.success'), t('common:messages.savedSuccessfully', { item: `Estimate ${savedEstimate.estimate_number}` }));
                  }
                }
              }
            ]
          );
        } else {
          // Project doesn't exist - just save the estimate
          const savedEstimate = await saveEstimate(completeEstimateData);
          if (savedEstimate) {
            Alert.alert(t('common:alerts.success'), t('common:messages.savedSuccessfully', { item: `Estimate ${savedEstimate.estimate_number}` }));
          }
        }
      } else {
        // No linked project - just save the estimate
        const savedEstimate = await saveEstimate(completeEstimateData);
        if (savedEstimate) {
          Alert.alert(t('common:alerts.success'), t('common:messages.savedSuccessfully', { item: `Estimate ${savedEstimate.estimate_number}` }));
        }
      }
    } catch (error) {
      console.error('Error saving estimate:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'estimate' }));
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
                  // FIX: Include workingDays from preview if not in action data
                  // This ensures Mon-Sat schedules don't default to Mon-Fri
                  workingDays: projectData.workingDays || projectPreview.data.workingDays || [1, 2, 3, 4, 5],
                  nonWorkingDates: projectData.nonWorkingDates || projectPreview.data.nonWorkingDates || [],
                };
                console.log('📊 Merged project data:', {
                  phasesCount: completeProjectData.phases?.length,
                  tasksInPhases: completeProjectData.phases?.map(p => p.tasks?.length || 0),
                  workingDays: completeProjectData.workingDays,
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
          t('common:alerts.success'),
          t('common:messages.savedSuccessfully', { item: `Project "${savedProject.name}"` }),
          [
            {
              text: t('common:buttons.ok'),
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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'project' }));
    }
  };

  const handleDeleteProject = async (deleteData) => {
    try {
      const { projectId, projectName } = deleteData;

      if (!projectId) {
        Alert.alert(t('common:alerts.error'), t('common:errors.notFound'));
        return;
      }

      // Show confirmation alert
      Alert.alert(
        t('common:alerts.deleteProject'),
        t('common:alerts.cannotUndo'),
        [
          {
            text: t('common:buttons.cancel'),
            style: 'cancel'
          },
          {
            text: t('common:buttons.delete'),
            style: 'destructive',
            onPress: async () => {
              const success = await deleteProject(projectId);
              if (success) {
                Alert.alert(t('common:alerts.success'), t('common:messages.deletedSuccessfully', { item: `Project "${projectName}"` }));
                // Send a confirmation message to the chat
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ Project "${projectName}" has been successfully deleted.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                };
                setMessages(prev => [...prev, confirmationMessage]);
              } else {
                Alert.alert(t('common:alerts.error'), t('common:messages.failedToDelete', { item: 'project' }));
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting project:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToDelete', { item: 'project' }));
    }
  };

  const handleAddEstimateToProjectChoice = async (choiceData) => {
    try {
      const { estimateId, estimateName, projectId, projectName, options } = choiceData;

      if (!estimateId || !projectId) {
        Alert.alert(t('common:alerts.missingInfo'), t('common:errors.requiredField'));
        return;
      }

      // Show alert with merge options
      Alert.alert(
        t('common:alerts.confirm'),
        t('common:messages.pleaseSelect', { item: 'how to add this estimate' }),
        [
          {
            text: t('common:buttons.cancel'),
            style: 'cancel'
          },
          {
            text: options.merge.label,
            onPress: async () => {
              // Import the function
              const { addEstimateToProject } = require('../utils/storage');

              const updatedProject = await addEstimateToProject(projectId, estimateId, 'merge');
              if (updatedProject) {
                Alert.alert(t('common:alerts.success'), t('common:messages.updatedSuccessfully', { item: 'Project' }));

                // Send confirmation message
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ "${estimateName}" has been merged into "${projectName}". Tasks and budgets have been combined into existing phases.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                };
                setMessages(prev => [...prev, confirmationMessage]);
              } else {
                Alert.alert(t('common:alerts.error'), t('common:messages.failedToUpdate', { item: 'project' }));
              }
            }
          },
          {
            text: options.separate.label + (options.separate.recommended ? ' ' : ''),
            onPress: async () => {
              // Import the function
              const { addEstimateToProject } = require('../utils/storage');

              const updatedProject = await addEstimateToProject(projectId, estimateId, 'separate');
              if (updatedProject) {
                Alert.alert(t('common:alerts.success'), t('common:messages.savedSuccessfully', { item: 'Estimate' }));

                // Send confirmation message
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ "${estimateName}" has been added to "${projectName}" as a separate scope. You can track it independently.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                };
                setMessages(prev => [...prev, confirmationMessage]);
              } else {
                Alert.alert(t('common:alerts.error'), t('common:messages.failedToUpdate', { item: 'project' }));
              }
            },
            style: options.separate.recommended ? 'default' : undefined
          }
        ]
      );
    } catch (error) {
      console.error('Error adding estimate to project:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToUpdate', { item: 'project' }));
    }
  };

  const handleUpdateProject = async (projectData) => {
    try {
      const updatedProject = await saveProject(projectData);
      if (updatedProject) {
        Alert.alert(t('common:alerts.success'), t('common:messages.updatedSuccessfully', { item: 'Project' }));

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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToUpdate', { item: 'project' }));
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
        Alert.alert(t('common:alerts.success'), t('common:messages.updatedSuccessfully', { item: 'Estimate' }));
        return;
      }

      // Existing estimate with ID - update in database
      const updatedEstimate = await updateEstimate(estimateData);
      if (updatedEstimate) {
        Alert.alert(t('common:alerts.success'), t('common:messages.updatedSuccessfully', { item: 'Estimate' }));

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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToUpdate', { item: 'estimate' }));
    }
  };

  const handleCreateProjectFromEstimate = async (estimateData) => {
    try {
      const estimateId = estimateData.id || estimateData.estimateId;
      if (!estimateId) {
        Alert.alert(t('common:alerts.error'), t('common:errors.notFound'));
        return;
      }

      // Create the project from the estimate
      const createdProject = await createProjectFromEstimate(estimateId);

      if (createdProject) {
        Alert.alert(
          t('common:alerts.success'),
          t('common:messages.savedSuccessfully', { item: `Project "${createdProject.name}"` }),
          [
            {
              text: t('common:buttons.viewAll'),
              onPress: () => {
                // Navigate to project details if navigation is available
                if (navigation) {
                  navigation.navigate('Projects');
                }
              },
            },
            { text: t('common:buttons.ok'), style: 'cancel' },
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
        Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'project' }));
      }
    } catch (error) {
      console.error('Error creating project from estimate:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'project' }));
    }
  };

  const handleConvertToInvoice = async (estimateData) => {
    try {
      const invoice = await createInvoiceFromEstimate(estimateData.id || estimateData.estimateId);
      if (invoice) {
        Alert.alert(
          t('common:alerts.success'),
          t('common:messages.savedSuccessfully', { item: `Invoice ${invoice.invoice_number}` }),
          [
            {
              text: t('common:buttons.ok'),
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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'invoice' }));
    }
  };

  const handleGenerateInvoicePDF = async (invoiceData) => {
    try {
      // Show loading alert
      Alert.alert(t('common:alerts.generatingPDF'), t('common:messages.pleaseWait', { action: 'generate your invoice PDF' }));

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
        t('common:alerts.success'),
        t('common:messages.savedSuccessfully', { item: 'Invoice PDF' }),
        [
          {
            text: t('common:buttons.share'),
            onPress: async () => {
              await shareInvoicePDF(pdfUri, invNumber);
            }
          },
          {
            text: t('common:buttons.viewAll'),
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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'PDF' }));
    }
  };

  const handleDownloadInvoicePDF = async (invoiceData) => {
    try {
      if (!invoiceData.pdf_url && !invoiceData.pdfUrl) {
        Alert.alert(t('common:alerts.noPDF'), t('common:messages.pleaseSelect', { item: 'generate the PDF first' }));
        return;
      }

      const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;

      // Share the PDF
      await shareInvoicePDF(pdfUrl, invNumber);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'PDF' }));
    }
  };

  const handleSendInvoiceEmail = async (invoiceData) => {
    try {
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;
      const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;

      if (!pdfUrl) {
        Alert.alert(t('common:alerts.noPDF'), t('common:messages.pleaseSelect', { item: 'generate the PDF first' }));
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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'invoice' }));
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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'PDF' }));
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
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'invoice' }));
    }
  };

  // Settings/Invoice handlers removed - now in useSettingsActions and useInvoiceActions hooks

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
          t('common:buttons.upload'),
          t('common:messages.pleaseSelect', { item: 'a source' }),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            { text: t('common:buttons.upload'), onPress: uploadContractFromCamera },
            { text: t('common:buttons.upload'), onPress: uploadContractFromLibrary },
            { text: t('common:buttons.upload'), onPress: uploadContractFromFile },
          ]
        );
      }
    } catch (error) {
      console.error('Error showing upload options:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'upload options' }));
    }
  };

  const uploadContractFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common:alerts.permissionRequired'), t('common:permissions.cameraRequired'));
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
          addAIMessage(t('common:messages.uploadedSuccessfully', { item: 'Contract' }));
        } else {
          Alert.alert(t('common:alerts.error'), t('common:alerts.uploadFailed'));
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'photo' }));
    }
  };

  const uploadContractFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common:alerts.permissionRequired'), t('common:permissions.photoLibraryRequired'));
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
          addAIMessage(t('common:messages.uploadedSuccessfully', { item: 'Contract' }));
        } else {
          Alert.alert(t('common:alerts.error'), t('common:alerts.uploadFailed'));
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'image' }));
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
          addAIMessage(t('common:messages.uploadedSuccessfully', { item: 'Contract' }));
        } else {
          Alert.alert(t('common:alerts.error'), t('common:alerts.uploadFailed'));
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'document' }));
    }
  };

  const handleViewContract = async (data) => {
    try {
      const { contractDocument } = data;
      if (!contractDocument) {
        Alert.alert(t('common:alerts.error'), t('common:errors.notFound'));
        return;
      }

      // Navigate to document viewer
      navigation.navigate('DocumentViewer', { document: contractDocument });
    } catch (error) {
      console.error('Error viewing contract:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToLoad', { item: 'contract' }));
    }
  };

  const handleShareContract = async (data) => {
    try {
      const { contractId, contractName, fileUrl } = data;

      Alert.alert(
        t('common:buttons.share'),
        t('common:alerts.areYouSure'),
        [
          { text: t('common:buttons.cancel'), style: 'cancel' },
          {
            text: t('common:buttons.share'),
            onPress: async () => {
              try {
                await Share.share({
                  message: `Contract: ${contractName}`,
                  url: fileUrl,
                });
                addAIMessage(t('common:messages.savedSuccessfully', { item: `Contract "${contractName}"` }));
              } catch (error) {
                console.error('Error sharing:', error);
                Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'contract' }));
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error handling share contract:', error);
      Alert.alert(t('common:alerts.error'), t('common:messages.failedToSave', { item: 'contract' }));
    }
  };

  // Handle document selection from DocumentPicker
  const handleDocumentSelected = async (data) => {
    try {
      const { document, action, recipientName } = data;
      const docName = document.file_name || document.name || document.title || 'Document';
      const docUrl = document.file_url || document.url;

      if (action === 'send' && docUrl) {
        // Share the selected document
        await Share.share({
          message: recipientName
            ? `${docName} for ${recipientName}`
            : docName,
          url: docUrl,
        });
        addAIMessage(t('common:messages.savedSuccessfully', { item: `"${docName}"` }));
      } else {
        // View the document
        navigation.navigate('DocumentViewer', { document });
      }
    } catch (error) {
      console.error('Error handling document selection:', error);
    }
  };

  // Photo/Report handlers removed - now in useReportActions hook

  // Open address in maps app
  const handleOpenMaps = (data) => {
    const address = data?.address;
    if (!address) {
      Alert.alert(t('common:alerts.error'), t('common:emptyStates.noAddress'));
      return;
    }

    const encodedAddress = encodeURIComponent(address);

    Alert.alert(
      t('common:alerts.openInMaps'),
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
                Alert.alert(t('common:alerts.error'), t('common:messages.couldNotOpen', { item: 'Google Maps' }));
              });
          },
        },
        {
          text: 'Apple Maps',
          onPress: () => {
            const appleMapsUrl = `maps://maps.apple.com/?address=${encodedAddress}`;
            Linking.openURL(appleMapsUrl).catch((err) => {
              console.error('Error opening Apple Maps:', err);
              Alert.alert(t('common:alerts.error'), t('common:messages.couldNotOpen', { item: 'Apple Maps' }));
            });
          },
        },
        {
          text: t('common:buttons.cancel'),
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
      case 'invoice-list':
        return <InvoiceList key={index} data={element.data} onAction={handleAction} />;
      case 'contract-preview':
        return <ContractPreview key={index} data={element.data} onAction={handleAction} />;
      case 'contract-list':
        return <ContractList key={index} data={element.data} onAction={handleAction} />;
      case 'document-picker':
        return <ChatDocumentPicker key={index} data={element.data} onAction={handleAction} />;
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
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
      {/* Top Bar - OwnerHeader for owners, simple bar for others */}
      {isOwner ? (
        <OwnerHeader
          rightComponent={<NotificationBell onPress={() => navigation.navigate('Notifications')} />}
        />
      ) : (
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>
      )}

      {/* Chat Messages and Input Area */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -60 : 0}
      >
        <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatArea}
          contentContainerStyle={[styles.chatContent, { paddingBottom: 180 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <AnimatedText
                text={t('welcome.title')}
                delay={60}
              />
            </View>
          ) : (
            <>
          {messages.map((message, messageIndex) => {
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
              {message.isUser ? (
                <Text
                  style={[
                    styles.messageText,
                    { color: Colors.userMessageText },
                  ]}
                >
                  {typeof message.text === 'string' ? message.text : JSON.stringify(message.text)}
                </Text>
              ) : (
                <LinkifiedText
                  style={[
                    styles.messageText,
                    { color: Colors.primaryText },
                  ]}
                >
                  {typeof message.text === 'string' ? message.text : JSON.stringify(message.text)}
                </LinkifiedText>
              )}
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
              placeholder={t('placeholder')}
            onSubmit={handleSend}
            onFileSelect={handleFileSelect}
            onCameraPress={handleCameraOpen}
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
