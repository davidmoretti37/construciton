import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Keyboard,
  TextInput,
  Linking,
  Share,
  ActionSheetIOS,
  Modal,
  FlatList,
  Image,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import AIInputWithSearch from '../components/AIInputWithSearch';
import AnimatedText from '../components/AnimatedText';
import LinkifiedText from '../components/LinkifiedText';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import { sendMessageToAI, sendMessageToAIStreaming, getProjectContext, analyzeScreenshot, analyzeDocument, formatProjectConfirmation, describeAttachments, setVoiceMode, sendAgentMessage, pollAgentJob, fetchLatestAgentJob } from '../services/aiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadProjectDocument } from '../utils/storage/projectDocuments';
import { fetchProjectsBasic } from '../utils/storage/projects';
import CoreAgent from '../services/agents/core/CoreAgent';
import { ProjectCard, ProjectPreview, WorkerList, BudgetChart, PhotoGallery, EstimatePreview, EstimateList, InvoicePreview, InvoiceList, ProjectSelector, ExpenseCard, ProjectOverview, PhaseOverview, ContractPreview, ContractList, DocumentPicker as ChatDocumentPicker, WorkerPaymentCard, DailyReportList, AppointmentCard, TimeTrackingMap } from '../components/ChatVisuals';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import { chatHistoryService } from '../services/chatHistoryService';
import { formatEstimate } from '../utils/estimateFormatter';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp, isValidPhoneNumber } from '../utils/messaging';
import { getCurrentUserId, fetchWorkers, fetchProjects, getUserProfile, getUserServices, updateUserServicePricing, saveProject, transformScreenshotToProject, getProject, saveEstimate, updateEstimate, createInvoiceFromEstimate, markInvoiceAsPaid, updateInvoicePDF, getInvoice, updateTradePricing, updatePhaseProgress, extendPhaseTimeline, startPhase, completePhase, fetchProjectPhases, addTaskToPhase, saveDailyReport, savePhasePaymentAmount, deleteProject, createProjectFromEstimate, createWorker, updateWorker, clockIn, clockOut, getActiveClockIn, createScheduleEvent, updateScheduleEvent, deleteScheduleEvent, createWorkSchedule, updateWorkSchedule, deleteWorkSchedule, updateBusinessInfo, updatePhaseTemplate, addServiceToTrade, removeServiceFromTrade, updateServicePricing, updateProfitMargin, saveSubcontractorQuote, updateSubcontractorQuote, deleteSubcontractorQuote, updateInvoiceTemplate, updateInvoice, deleteInvoice, recordInvoicePayment, voidInvoice, uploadContractDocument, calculateWorkerPaymentForPeriod, fetchPhotosWithFilters, fetchDailyReportsWithFilters, fetchDailyReportById, getTodaysWorkersSchedule, editTimeEntry, createManualTimeEntry, deleteTimeEntry, createRecurringEvent, updateRecurringEvent, deleteRecurringEvent, setWorkerAvailability, setWorkerPTO, removeWorkerAvailability, createCrew, getCrew, updateCrew, deleteCrew, createShiftTemplate, applyShiftTemplate, deleteShiftTemplate, startWorkerBreak, endWorkerBreak, swapWorkerShifts, fetchScheduleEvents, getProjectWorkers, getAverageWorkerRate, getSelectedLanguage, getAISettings } from '../utils/storage';
import { memoryService } from '../services/agents/core/MemoryService';
import { generateInvoicePDF, uploadInvoicePDF, previewInvoicePDF, shareInvoicePDF } from '../utils/pdfGenerator';
import TimelinePickerModal from '../components/TimelinePickerModal';
import BudgetInputModal from '../components/BudgetInputModal';
import JobNameInputModal from '../components/JobNameInputModal';
import AddCustomServiceModal from '../components/AddCustomServiceModal';
import OrbitalLoader from '../components/OrbitalLoader';
import StatusMessage from '../components/StatusMessage';
import SkeletonCard from '../components/skeletons/SkeletonCard';
import SkeletonBox from '../components/skeletons/SkeletonBox';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import NotificationBell from '../components/NotificationBell';
import OwnerHeader from '../components/OwnerHeader';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { emitProjectUpdated } from '../services/eventEmitter';
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
  const [isStreaming, setIsStreaming] = useState(false); // Track actual streaming state
  const [bgOverlay, setBgOverlay] = useState(false); // Overlay to hide thinking→answer transition
  const [statusMessage, setStatusMessage] = useState(null);
  const [showCardSkeleton, setShowCardSkeleton] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const streamingMessageIdRef = useRef(null);
  const activeJobIdRef = useRef(null);
  const pollingIntervalRef = useRef(null);
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
  const { user, profile } = useAuth() || {};
  const isOwner = profile?.role === 'owner';
  const isSupervisor = profile?.role === 'supervisor';

  // Chat history state
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const lastSavedMessageCount = useRef(0); // Track saved messages to avoid duplicates

  // Create new chat session (ONLY when explicitly needed)
  const createNewSession = useCallback(async () => {
    try {
      // IMPORTANT: This should ONLY create if current session has messages
      // OR if there's no current session at all

      const hasMessages = messages.length > 0;

      if (currentSessionId && !hasMessages) {
        // Current session is empty, just clear it and reuse
        console.log('Clearing and reusing empty session:', currentSessionId);
        setMessages([]);
        setConversationHistory([]);
        lastSavedMessageCount.current = 0;
        if (aiTimeoutRef.current) {
          clearTimeout(aiTimeoutRef.current);
          aiTimeoutRef.current = null;
        }
        setIsAIThinking(false);
        setStatusMessage(null);
        setPendingEstimateContext(null);
        setCurrentProject(null);
        return;
      }

      // Create a new session only if:
      // 1. No current session exists, OR
      // 2. Current session has messages
      console.log('Creating new session (current has messages or none exists)');
      const session = await chatHistoryService.createSession();
      setCurrentSessionId(session.id);
      setMessages([]);
      setConversationHistory([]);
      lastSavedMessageCount.current = 0;
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
      setIsAIThinking(false);
      setStatusMessage(null);
      setPendingEstimateContext(null);
      setCurrentProject(null);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  }, [currentSessionId, messages.length]);

  // Load session messages
  const loadSession = useCallback(async (sessionId) => {
    try {
      const sessionMessages = await chatHistoryService.getSessionMessages(sessionId);
      setCurrentSessionId(sessionId);

      // Convert database messages to UI format
      let uiMessages = sessionMessages.map(m => ({
        id: m.id,
        text: m.content,
        isUser: m.role === 'user',
        timestamp: new Date(m.created_at),
        visualElements: m.visual_elements || [],
        actions: m.actions || []
      }));

      // Check for completed background job and merge before first render
      uiMessages = await checkAndMergeBackgroundJob(sessionId, uiMessages);

      setMessages(uiMessages);
      lastSavedMessageCount.current = uiMessages.length;

      // Rebuild conversation history for API
      const allMessages = uiMessages.map(m => ({
        role: m.isUser ? 'user' : 'assistant',
        content: m.text
      }));
      setConversationHistory(allMessages);
    } catch (error) {
      console.error('Error loading session:', error);
      Alert.alert('Error', 'Failed to load chat session');
    }
  }, [checkAndMergeBackgroundJob]);

  // Check for completed background jobs and merge into loaded messages
  const checkAndMergeBackgroundJob = useCallback(async (sessionId, loadedMessages) => {
    try {
      const savedMessageId = await AsyncStorage.getItem('activeAgentMessageId');
      let savedJobId = activeJobIdRef.current || await AsyncStorage.getItem('activeAgentJobId');

      if (!savedMessageId) return loadedMessages;

      // If no jobId, try to find the latest one
      if (!savedJobId) {
        const latestJob = await fetchLatestAgentJob();
        if (latestJob) savedJobId = latestJob.jobId;
      }
      if (!savedJobId) return loadedMessages;

      const result = await pollAgentJob(savedJobId);
      if (result.status === 'completed' && result.accumulatedText) {
        // Check if this response is already in the loaded messages
        const alreadyExists = loadedMessages.some(m =>
          !m.isUser && m.text === result.accumulatedText
        );
        if (!alreadyExists) {
          console.log('📥 Merging background job response into session');
          // Save to local DB
          await chatHistoryService.saveMessage(sessionId, {
            role: 'assistant',
            content: result.accumulatedText,
            visualElements: result.visualElements || [],
            actions: result.actions || [],
          });
          // Add to loaded messages so it's part of the initial render
          loadedMessages = [...loadedMessages, {
            id: savedMessageId,
            text: result.accumulatedText,
            isUser: false,
            timestamp: new Date(),
            visualElements: result.visualElements || [],
            actions: result.actions || [],
          }];
        }
        // Clean up tracking
        activeJobIdRef.current = null;
        AsyncStorage.removeItem('activeAgentJobId');
        AsyncStorage.removeItem('activeAgentMessageId');
      }
    } catch (e) {
      console.log('Background job check skipped:', e.message);
    }
    return loadedMessages;
  }, []);

  // Load or create initial session on mount
  const initializeSession = useCallback(async () => {
    setIsLoadingChat(true);
    try {
      console.log('🔄 Initializing chat session...');
      // First, try to get existing sessions (now includes message_count)
      const sessions = await chatHistoryService.getSessions();
      console.log('📋 Found', sessions?.length || 0, 'existing sessions');

      if (sessions && sessions.length > 0) {
        // Find empty session using message_count from backend (no extra API calls)
        const emptySession = sessions.find(s => s.message_count === 0);
        if (emptySession) {
          console.log('✅ Reusing empty session:', emptySession.id);
          setCurrentSessionId(emptySession.id);
          setMessages([]);
          setConversationHistory([]);
          lastSavedMessageCount.current = 0;
        } else {
          // All sessions have messages, load the most recent one
          console.log('📥 Loading most recent session:', sessions[0].id);
          await loadSession(sessions[0].id);
        }
      } else {
        // No sessions exist, create a new one
        console.log('🆕 Creating first session');
        const session = await chatHistoryService.createSession();
        console.log('✅ Created session:', session.id);
        setCurrentSessionId(session.id);
        setMessages([]);
        setConversationHistory([]);
        lastSavedMessageCount.current = 0;
      }
    } catch (error) {
      console.error('❌ Error initializing session:', error);
      console.error('Error details:', error.message);

      // IMPORTANT: Chat history is optional - if database tables don't exist yet,
      // just continue without session tracking (app will still work)
      console.warn('⚠️ Chat history not available - continuing without session tracking');
      console.warn('💡 Run database migration to enable chat history feature');

      // Set session ID to null - app will work without it
      setCurrentSessionId(null);
      setMessages([]);
      setConversationHistory([]);
      lastSavedMessageCount.current = 0;
    } finally {
      setIsLoadingChat(false);
    }
  }, [loadSession]);

  // Auto-save current message
  const saveCurrentMessage = useCallback(async () => {
    if (!currentSessionId) {
      console.log('⏭️ Skipping save: No session ID');
      return;
    }

    if (messages.length === 0) {
      console.log('⏭️ Skipping save: No messages');
      return;
    }

    if (messages.length <= lastSavedMessageCount.current) {
      console.log('⏭️ Skipping save: Already saved', messages.length, 'messages');
      return;
    }

    try {
      // Save only new messages
      const newMessages = messages.slice(lastSavedMessageCount.current);
      console.log('💾 Saving', newMessages.length, 'new message(s) to session', currentSessionId.substring(0, 8));

      for (const message of newMessages) {
        await chatHistoryService.saveMessage(currentSessionId, {
          role: message.isUser ? 'user' : 'assistant',
          content: message.text,
          visualElements: message.visualElements || [],
          actions: message.actions || []
        });
        console.log('✅ Saved message:', message.text.substring(0, 50));
      }

      // Auto-generate AI-powered title from first user message (before updating lastSavedMessageCount)
      // This should run when we're saving for the first time (empty session)
      if (lastSavedMessageCount.current === 0 && messages.length >= 1 && messages[0].isUser) {
        console.log('📝 Generating AI title from first message:', messages[0].text.substring(0, 50));
        const title = await chatHistoryService.generateAITitle(messages[0].text);
        await chatHistoryService.updateSessionTitle(currentSessionId, title);
        console.log('✅ Updated session title to:', title);
      }

      lastSavedMessageCount.current = messages.length;
    } catch (error) {
      console.error('❌ Error saving message:', error);
      console.error('Error details:', error.message);
    }
  }, [currentSessionId, messages]);

  // Reset chat - now creates a new session instead of just clearing
  const handleResetChat = useCallback(() => {
    if (messages.length === 0) return;

    Alert.alert(
      t('actions.newChat'),
      null,
      [
        { text: t('actions.cancel'), style: 'cancel' },
        {
          text: t('actions.clearChat'),
          style: 'destructive',
          onPress: createNewSession,
        },
      ]
    );
  }, [messages.length, t, createNewSession]);

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

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []); // Only run once on mount

  // Auto-save messages ONLY when streaming fully completes
  useEffect(() => {
    // Only save when streaming is done AND we have unsaved messages
    if (!isStreaming && currentSessionId && messages.length > lastSavedMessageCount.current) {
      // Add a small delay to ensure message is fully rendered
      const saveTimer = setTimeout(() => {
        console.log('💾 Auto-save triggered (streaming complete)');
        saveCurrentMessage();
      }, 500);
      return () => clearTimeout(saveTimer);
    }
  }, [isStreaming, currentSessionId]); // DO NOT include 'messages' to prevent saves during streaming

  // Poll a background agent job until it completes
  // Helper: update an AI message by ID, or create it if it doesn't exist
  // (handles case where user left before the placeholder was rendered)
  const upsertAIMessage = useCallback((messageId, updates) => {
    setMessages((prev) => {
      const exists = prev.some((msg) => msg.id === messageId);
      if (exists) {
        return prev.map((msg) =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        );
      }
      // Message was never created (user left too early) — add it
      return [
        ...prev,
        {
          id: messageId,
          text: '',
          isUser: false,
          timestamp: new Date(),
          isThinking: false,
          ...updates,
        },
      ];
    });
  }, []);

  const startJobPolling = useCallback((jobId, messageId) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const result = await pollAgentJob(jobId);

        if (result.status === 'completed') {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          const responseText = result.accumulatedText || '';
          const responseVisuals = result.visualElements || [];
          const responseActions = result.actions || [];
          if (messageId) {
            upsertAIMessage(messageId, {
              text: responseText,
              visualElements: responseVisuals,
              actions: responseActions,
            });
          }
          // Save to local DB immediately so it's there on next launch
          if (currentSessionId && responseText) {
            chatHistoryService.saveMessage(currentSessionId, {
              role: 'assistant',
              content: responseText,
              visualElements: responseVisuals,
              actions: responseActions,
            }).then(() => {
              lastSavedMessageCount.current += 1;
            }).catch(e => console.error('Failed to save polled response:', e));
          }
          setIsAIThinking(false);
          setIsStreaming(false);
          setStatusMessage(null);
          activeJobIdRef.current = null;
          AsyncStorage.removeItem('activeAgentJobId');
          AsyncStorage.removeItem('activeAgentMessageId');
        } else if (result.status === 'error') {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          if (messageId) {
            upsertAIMessage(messageId, {
              text: result.error || 'An error occurred.',
            });
          }
          setIsAIThinking(false);
          setIsStreaming(false);
          setStatusMessage(null);
          activeJobIdRef.current = null;
          AsyncStorage.removeItem('activeAgentJobId');
          AsyncStorage.removeItem('activeAgentMessageId');
        } else if (result.accumulatedText && messageId) {
          // Still processing — update with partial text
          upsertAIMessage(messageId, { text: result.accumulatedText });
        }
      } catch (e) {
        // Silently retry on next interval
      }
    }, 2000);

    // Safety: stop polling after 3 minutes
    setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }, 180000);
  }, []);

  // Save messages when user navigates away / resume agent jobs when returning
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Show overlay BEFORE iOS takes the screenshot — hides the thinking bubble
        // so when user returns, they see the overlay (not stale state)
        if (isAIThinking || isStreaming) {
          setBgOverlay(true);
        }
        // Save current state immediately
        if (currentSessionId && messages.length > lastSavedMessageCount.current) {
          console.log('📱 App backgrounding, saving messages immediately');
          saveCurrentMessage();
        }
      }

      if (nextAppState === 'active') {
        // Check for active background job
        const savedMessageId = await AsyncStorage.getItem('activeAgentMessageId');

        // No pending job — just remove overlay and return
        if (!savedMessageId) {
          setBgOverlay(false);
          return;
        }

        // Overlay stays up while we poll — user sees solid color, not stale chat
        let savedJobId = activeJobIdRef.current ||
          await AsyncStorage.getItem('activeAgentJobId');

        // Single fast path: fetch latest job (includes full response data)
        let result = null;
        try {
          if (savedJobId) {
            result = await pollAgentJob(savedJobId);
          } else {
            const latestJob = await fetchLatestAgentJob();
            if (latestJob) {
              savedJobId = latestJob.jobId;
              result = latestJob;
            }
          }
        } catch (e) {
          console.error('Failed to check background job:', e);
          setBgOverlay(false);
          return;
        }

        if (!result) {
          setBgOverlay(false);
          return;
        }

        try {
          if (result.status === 'completed') {
            const responseText = result.accumulatedText || '';
            const responseVisuals = result.visualElements || [];
            const responseActions = result.actions || [];
            if (savedMessageId) {
              upsertAIMessage(savedMessageId, {
                text: responseText,
                visualElements: responseVisuals,
                actions: responseActions,
              });
            }
            if (currentSessionId && responseText) {
              chatHistoryService.saveMessage(currentSessionId, {
                role: 'assistant',
                content: responseText,
                visualElements: responseVisuals,
                actions: responseActions,
              }).then(() => {
                lastSavedMessageCount.current += 1;
              }).catch(e => console.error('Failed to save polled response:', e));
            }
            setIsAIThinking(false);
            setIsStreaming(false);
            setStatusMessage(null);
            activeJobIdRef.current = null;
            AsyncStorage.removeItem('activeAgentJobId');
            AsyncStorage.removeItem('activeAgentMessageId');

          } else if (result.status === 'processing') {
            if (savedMessageId) {
              if (result.accumulatedText) {
                upsertAIMessage(savedMessageId, { text: result.accumulatedText });
              } else {
                upsertAIMessage(savedMessageId, { text: '', isThinking: true });
              }
            }
            setStatusMessage('Still processing your request...');
            startJobPolling(savedJobId, savedMessageId);

          } else if (result.status === 'error') {
            if (savedMessageId) {
              upsertAIMessage(savedMessageId, {
                text: result.error || 'An error occurred while processing your request.',
              });
            }
            setIsAIThinking(false);
            setIsStreaming(false);
            setStatusMessage(null);
            activeJobIdRef.current = null;
            AsyncStorage.removeItem('activeAgentJobId');
            AsyncStorage.removeItem('activeAgentMessageId');
          }
        } catch (pollError) {
          console.error('Failed to poll agent job:', pollError);
        }

        // Remove overlay AFTER state is updated — reveals chat with answer
        setBgOverlay(false);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [currentSessionId, messages, lastSavedMessageCount, saveCurrentMessage, isAIThinking, isStreaming]);

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

  const handleSend = async (text, withSearch, attachments) => {
    if (!text?.trim() && (!attachments || attachments.length === 0)) return;

    // Check subscription before allowing AI chat
    if (!hasActiveSubscription && !__DEV__) {
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

    // Clear attachments from input
    if (attachments && attachments.length > 0) {
      setChatAttachments([]);
    }

    // Generate unique IDs using timestamp + random to avoid collisions
    const userMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const aiMessageId = `${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`;

    // Add user message to UI (with attachments if present)
    const userMessage = {
      id: userMessageId,
      text: text || '',
      isUser: true,
      timestamp: new Date(),
      withSearch: withSearch,
      attachments: attachments || null,
    };

    // Create AI placeholder IMMEDIATELY with user message (single setMessages call)
    // so the thinking bubble is on screen before the user can leave the app
    const aiMessage = {
      id: aiMessageId,
      text: '',
      isUser: false,
      timestamp: new Date(),
      visualElements: [],
      actions: [],
      isThinking: true,
    };
    setMessages((prev) => [...prev, userMessage, aiMessage]);
    let messageCreated = true;

    // Save messageId to AsyncStorage immediately (before any async work)
    AsyncStorage.setItem('activeAgentMessageId', aiMessageId);

    // Show thinking state immediately
    setIsAIThinking(true);
    setIsStreaming(true);
    setStatusMessage(t('thinking'));
    streamingMessageIdRef.current = aiMessageId;
    setShowCardSkeleton(false);

    // Dismiss keyboard so user can see AI response
    Keyboard.dismiss();

    // Process attachments: images go directly to Claude as vision blocks, PDFs use text extraction
    let enhancedText = text || '';
    let imageAttachments = [];
    let rawAttachmentsForUpload = [];
    if (attachments && attachments.length > 0) {
      const images = attachments.filter(att => att.mimeType?.startsWith('image/'));
      const nonImages = attachments.filter(att => !att.mimeType?.startsWith('image/'));

      // Images: collect base64 to send directly to Claude (vision)
      for (const att of images) {
        try {
          const base64 = att.base64 || await (async () => {
            const FileSystem = require('expo-file-system/legacy');
            return FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 });
          })();
          imageAttachments.push({ mimeType: att.mimeType || 'image/jpeg', base64 });
        } catch (e) {
          console.error('Error reading image base64:', e);
        }
      }

      // Non-images (PDFs): use existing text extraction path
      if (nonImages.length > 0) {
        setStatusMessage(t('common:alerts.analyzingDocument'));
        try {
          const attachmentContext = await describeAttachments(nonImages);
          enhancedText = attachmentContext + (text?.trim() || 'What can you tell me about these files?');
        } catch (error) {
          console.error('Error describing attachments:', error);
          enhancedText = `[The user attached ${nonImages.length} file(s) but they could not be read.]\n\n` + (text?.trim() || 'I attached some files.');
        }
      }

      // If only images and no text, set a default prompt
      if (images.length > 0 && !text?.trim() && nonImages.length === 0) {
        enhancedText = 'Analyze this image. If it\'s a receipt or invoice, extract the details and record the expense.';
      }

      // Collect raw attachment data for upload tool (images already have base64, read PDFs too)
      for (const att of images) {
        const base64 = att.base64 || imageAttachments.find(ia => ia.mimeType === att.mimeType)?.base64;
        if (base64) {
          rawAttachmentsForUpload.push({ name: att.name || att.fileName || 'image.jpg', mimeType: att.mimeType || 'image/jpeg', base64 });
        }
      }
      for (const att of nonImages) {
        try {
          const base64 = att.base64 || await (async () => {
            const FileSystem = require('expo-file-system/legacy');
            return FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 });
          })();
          rawAttachmentsForUpload.push({ name: att.name || att.fileName || 'document.pdf', mimeType: att.mimeType || 'application/pdf', base64 });
        } catch (e) {
          console.error('Error reading attachment base64 for upload:', e);
        }
      }
    }

    // Timeout handler — fires if no events received for 50s
    const handleTimeout = () => {
      console.log('⏱️ AI response timeout - 50 seconds since last event');
      setIsAIThinking(false);
      setStatusMessage(null);
      setShowCardSkeleton(false);
      streamingMessageIdRef.current = null;
      if (!messageCreated) {
        setMessages((prev) => [...prev, {
          id: aiMessageId,
          text: t('messages.error'),
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [{ type: 'retry', label: 'Retry', data: { originalMessage: text } }],
        }]);
        messageCreated = true;
      }
    };
    aiTimeoutRef.current = setTimeout(handleTimeout, 120000);

    try {
      // Build lightweight context for the backend agent (business info, language, preferences)
      // Heavy data (projects, workers, etc.) is fetched by backend tools
      const userId = user?.id || profile?.id || await getCurrentUserId();
      const userProfile = await getUserProfile();
      const userLanguage = await getSelectedLanguage() || 'en';
      const aiSettings = await getAISettings();
      const learnedFacts = memoryService.getMemoriesForPrompt(enhancedText);

      const agentContext = {
        businessName: userProfile?.business_name || '',
        businessPhone: userProfile?.business_phone || '',
        businessEmail: userProfile?.business_email || '',
        businessAddress: userProfile?.business_address || '',
        userLanguage,
        todayDate: new Date().toISOString().split('T')[0],
        learnedFacts: learnedFacts || '',
        aboutYou: aiSettings?.aboutYou || '',
        responseStyle: aiSettings?.responseStyle || '',
        projectInstructions: aiSettings?.projectInstructions || '',
        phasesTemplate: userProfile?.phases_template || [],
        profitMargin: userProfile?.profit_margin || 20,
      };

      // Use unified agent with tool-calling for intelligent responses
      await sendAgentMessage(
        userId,
        conversationHistory,
        enhancedText,
        agentContext,
        imageAttachments,
        {  // callbacks object:
        // onJobId callback - Track background job for resume on disconnect
        onJobId: (jobId) => {
          activeJobIdRef.current = jobId;
          AsyncStorage.setItem('activeAgentJobId', jobId);
        },
        // onChunk callback - Append small drip-fed chunks from aiService animation
        onChunk: (chunk) => {
          if (!chunk) return;
          if (aiTimeoutRef.current) {
            clearTimeout(aiTimeoutRef.current);
            aiTimeoutRef.current = null;
          }
          setIsAIThinking(false);
          setStatusMessage(null);

          // Append the chunk to existing bubble
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, text: (msg.text || '') + chunk, isThinking: false }
                : msg
            )
          );
        },
        // onComplete callback - Add visual elements
        onComplete: (parsedResponse) => {
          console.log('🏁 AI streaming complete:', parsedResponse.text?.substring(0, 50) + '...');
          setIsAIThinking(false);
          setIsStreaming(false); // CRITICAL: Set to false ONLY when streaming actually completes
          setStatusMessage(null); // Clear status on complete
          setShowCardSkeleton(false);
          streamingMessageIdRef.current = null;

          // Clear background job tracking
          activeJobIdRef.current = null;
          AsyncStorage.removeItem('activeAgentJobId');
          AsyncStorage.removeItem('activeAgentMessageId');

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
                  text: parsedResponse.text || msg.text || '',
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

          // Show loading state if creating estimate (Part 1 of estimate fix)
          const hasEstimatePreview = parsedResponse.visualElements?.some(v => v.type === 'estimate-preview');
          if (hasEstimatePreview) {
            setStatusMessage('Creating estimate...');
            // Clear status after card appears
            setTimeout(() => setStatusMessage(''), 800);
          }

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

          // delete-all-workers: NOT auto-executed — requires user to tap action button + confirm

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

          // AUTO-EXECUTE delete-project action (has confirmation dialog built in)
          const deleteProjectAction = parsedResponse.actions?.find(action => action.type === 'delete-project');
          if (deleteProjectAction) {
            console.log('🔄 Auto-executing project deletion:', deleteProjectAction.data);
            projectActions.handleDeleteProject(deleteProjectAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // delete-all-projects, delete-all-estimates:
          // NOT auto-executed — requires user to tap action button + confirm via Alert dialog

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

          // REFRESH PROJECT DATA when agent modifies tasks/phases/finances
          // This ensures ProjectDetailScreen picks up changes made by the agent
          const responseText = (parsedResponse.text || '').toLowerCase();
          const projectModified = responseText.includes('task added') ||
            responseText.includes('checklist') ||
            responseText.includes('phase') ||
            responseText.includes('updated') ||
            updateAction ||
            updateProjectAction;
          if (projectModified) {
            // Emit for all projects mentioned in visual elements
            const projectVisuals = parsedResponse.visualElements?.filter(v =>
              v.data?.project_id || v.data?.projectId
            ) || [];
            if (projectVisuals.length > 0) {
              projectVisuals.forEach(v => {
                const pid = v.data?.project_id || v.data?.projectId;
                if (pid) emitProjectUpdated(pid);
              });
            } else {
              // No specific project ID found — emit wildcard to refresh any open project
              emitProjectUpdated('*');
            }
          }

          // Update conversation history — store text + tool context (no base64 images)
          const historyContent = imageAttachments.length > 0
            ? `[User attached ${imageAttachments.length} image(s)]\n\n${enhancedText}`
            : enhancedText;
          const toolSuffix = parsedResponse.toolContext
            ? '\n\n[TOOL CONTEXT: ' + parsedResponse.toolContext + ']'
            : '';
          setConversationHistory((prev) => [
            ...prev,
            { role: 'user', content: historyContent },
            { role: 'assistant', content: (parsedResponse.text || '') + toolSuffix },
          ]);

          // Extract and save facts from conversation for long-term memory
          try {
            const facts = memoryService.extractFacts(enhancedText, parsedResponse);
            if (facts.length > 0) {
              memoryService.saveFacts(facts);
            }
          } catch (memErr) {
            // Non-critical - don't break flow
          }
        },
        // onError callback
        onError: (error) => {
          console.error('Streaming error:', error);
          // Clear timeout on error
          if (aiTimeoutRef.current) {
            clearTimeout(aiTimeoutRef.current);
            aiTimeoutRef.current = null;
          }

          // Network errors likely mean the app was backgrounded and iOS killed the connection.
          // The backend may still be processing — start polling immediately for the result.
          const isNetworkError = error.message === 'Network error' || error.message === 'Network request failed';
          if (isNetworkError) {
            console.log('📱 Network error (likely backgrounded) — will recover on resume');
            // Keep tracking keys intact — handleAppStateChange will poll immediately on resume
            return;
          }

          setIsAIThinking(false);
          setStatusMessage(null);
          setVoiceMode(false);

          // Clear background job tracking (only for real errors, not backgrounding)
          activeJobIdRef.current = null;
          AsyncStorage.removeItem('activeAgentJobId');
          AsyncStorage.removeItem('activeAgentMessageId');

          // Only add error message if we haven't created a message bubble yet
          if (!messageCreated) {
            setMessages((prev) => {
              const exists = prev.some(msg => msg.id === aiMessageId);
              if (exists) return prev;

              const errorMessage = {
                id: aiMessageId,
                text: `Sorry, I encountered an error: ${error.message}. Please try again.`,
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
        // onStatus callback - Update status message + reset timeout
        onStatus: (status) => {
          if (status) {
            setStatusMessage(status);
            // Reset timeout — agent is still working
            if (aiTimeoutRef.current) {
              clearTimeout(aiTimeoutRef.current);
              aiTimeoutRef.current = setTimeout(handleTimeout, 120000);
            }
          }
        },
        // onMetadata callback - Show skeleton loader when visual elements are incoming
        onMetadata: ({ visualElements }) => {
          if (visualElements && visualElements.length > 0) {
            setShowCardSkeleton(true);
          }
        }
        },
        rawAttachmentsForUpload
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
      setShowCardSkeleton(false);
      streamingMessageIdRef.current = null;

      // Clear background job tracking
      activeJobIdRef.current = null;
      AsyncStorage.removeItem('activeAgentJobId');
      AsyncStorage.removeItem('activeAgentMessageId');

      // Only add error message if onError callback didn't already add one
      if (!messageCreated) {
        setMessages((prev) => {
          // Double-check: only add if this ID doesn't already exist
          const exists = prev.some(msg => msg.id === aiMessageId);
          if (exists) return prev;

          const errorMessage = {
            id: aiMessageId,
            text: `Sorry, I encountered an error: ${error.message}. Please try again.`,
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

  const [showProjectPickerModal, setShowProjectPickerModal] = useState(false);
  const [pendingAttachFile, setPendingAttachFile] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [chatAttachments, setChatAttachments] = useState([]);

  const handleFileSelect = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      // Read base64 immediately so it's ready for AI vision analysis
      let base64 = null;
      try {
        base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (readError) {
        console.warn('Could not read file base64:', readError);
      }

      setChatAttachments(prev => [...prev, {
        uri: asset.uri,
        name: asset.name || 'document',
        mimeType: asset.mimeType || 'application/octet-stream',
        base64,
      }]);
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert(t('common:alerts.error'), t('common:alerts.uploadFailed'));
    }
  };

  const handleCameraOpen = () => {
    Alert.alert(
      t('common:buttons.upload', 'Add Image'),
      null,
      [
        {
          text: t('common:buttons.takePhoto', 'Take Photo'),
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert(t('upload.takePhoto'), t('voice.permissionDenied'));
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                quality: 0.7,
                base64: true,
              });
              if (!result.canceled && result.assets?.length > 0) {
                const asset = result.assets[0];
                setChatAttachments(prev => [...prev, {
                  uri: asset.uri,
                  name: 'Photo',
                  mimeType: 'image/jpeg',
                  base64: asset.base64,
                }]);
              }
            } catch (error) {
              console.error('Error taking photo:', error);
              Alert.alert(t('common:alerts.error'), t('common:alerts.uploadFailed'));
            }
          },
        },
        {
          text: t('common:buttons.chooseFromPhotos', 'Choose from Library'),
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert(t('common:buttons.chooseFromPhotos'), t('voice.permissionDenied'));
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                quality: 0.7,
                base64: true,
                allowsMultipleSelection: true,
              });
              if (!result.canceled && result.assets?.length > 0) {
                const newAttachments = result.assets.map(asset => ({
                  uri: asset.uri,
                  name: asset.fileName || 'Photo',
                  mimeType: asset.mimeType || 'image/jpeg',
                  base64: asset.base64,
                }));
                setChatAttachments(prev => [...prev, ...newAttachments]);
              }
            } catch (error) {
              console.error('Error picking image:', error);
              Alert.alert(t('common:alerts.error'), t('common:alerts.uploadFailed'));
            }
          },
        },
        { text: t('common:buttons.cancel', 'Cancel'), style: 'cancel' },
      ]
    );
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

      // Estimate Actions
      case 'save-estimate':
        await handleSaveEstimate(action.data); // Use local version with confirmation dialog
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
      case 'save-invoice':
        await invoiceActions.handleSaveInvoice(action.data);
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
    // Part 2 of estimate fix: Inject project_id into estimate data before rendering
    if (element.type === 'estimate-preview') {
      // If estimate doesn't have project_id, try to find a recent project
      if (!element.data.project_id && !element.data.projectId) {
        const recentProjects = messages
          .filter(m => m.visualElements?.some(v => v.type === 'project-preview'))
          .flatMap(m => m.visualElements?.filter(v => v.type === 'project-preview') || []);

        // Inject project_id from most recent project if available
        if (recentProjects.length > 0) {
          const mostRecent = recentProjects[recentProjects.length - 1];
          element.data.project_id = mostRecent.data.id;
          element.data.projectName = mostRecent.data.projectName || mostRecent.data.name;

          if (__DEV__) {
            console.log('✅ Injected project_id into estimate:', {
              project_id: element.data.project_id,
              projectName: element.data.projectName
            });
          }
        }
      }
    }

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
      case 'time-tracking-map':
        return <TimeTrackingMap key={index} data={element.data} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
      {/* Top Bar - consistent layout to prevent jump while profile loads */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setShowHistorySidebar(true)} style={styles.resetChatButton}>
          <Ionicons name="time-outline" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

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
          {isLoadingChat ? (
            <View style={{ paddingTop: 24, paddingHorizontal: Spacing.md }}>
              {/* Skeleton mimicking message bubbles to prevent layout jump */}
              <View style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
                <SkeletonBox width={220} height={40} borderRadius={16} />
              </View>
              <View style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
                <SkeletonBox width={260} height={60} borderRadius={16} />
              </View>
              <View style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
                <SkeletonBox width={180} height={40} borderRadius={16} />
              </View>
              <View style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
                <SkeletonBox width={240} height={80} borderRadius={16} />
              </View>
            </View>
          ) : messages.length === 0 ? (
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
                  {/* Attachments display in user messages */}
                  {message.isUser && message.attachments && message.attachments.length > 0 && (
                    <View style={[
                      styles.messageBubble,
                      { backgroundColor: Colors.primaryBlue },
                      styles.userMessage,
                      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
                    ]}>
                      {message.attachments.map((att, attIdx) => (
                        att.mimeType?.startsWith('image/') ? (
                          <Image
                            key={attIdx}
                            source={{ uri: att.uri }}
                            style={styles.messageAttachmentImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View key={attIdx} style={styles.messageAttachmentDoc}>
                            <Ionicons name="document-text" size={20} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.messageAttachmentDocName} numberOfLines={1}>
                              {att.name}
                            </Text>
                          </View>
                        )
                      ))}
                    </View>
                  )}

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

                  {/* Skeleton loader while visual elements are being generated */}
                  {!message.isUser
                    && showCardSkeleton
                    && message.id === streamingMessageIdRef.current
                    && (!message.visualElements || message.visualElements.length === 0)
                    && (
                      <Animated.View
                        entering={FadeIn.duration(200)}
                        exiting={FadeOut.duration(150)}
                        style={styles.visualElementsContainer}
                      >
                        <SkeletonCard lines={4} style={{ marginTop: 8, backgroundColor: Colors.cardBackground || '#FFFFFF' }} />
                      </Animated.View>
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
            attachments={chatAttachments}
            onRemoveAttachment={(index) => setChatAttachments(prev => prev.filter((_, i) => i !== index))}
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

      {/* Project Picker Modal for Attach to Project */}
      <Modal
        visible={showProjectPickerModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowProjectPickerModal(false);
          setPendingAttachFile(null);
        }}
      >
        <View style={styles.projectPickerOverlay}>
          <View style={[styles.projectPickerContainer, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.projectPickerHeader}>
              <Text style={[styles.projectPickerTitle, { color: Colors.primaryText }]}>
                {t('common:alerts.selectProject')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowProjectPickerModal(false);
                  setPendingAttachFile(null);
                }}
              >
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={projectsList}
              keyExtractor={(item) => item.id?.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.projectPickerItem, { borderBottomColor: Colors.border }]}
                  onPress={() => handleProjectSelectedForAttach(item)}
                >
                  <View style={styles.projectPickerItemContent}>
                    <Ionicons name="folder-outline" size={20} color={Colors.primaryBlue} />
                    <View style={styles.projectPickerItemText}>
                      <Text style={[styles.projectPickerItemName, { color: Colors.primaryText }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.client && (
                        <Text style={[styles.projectPickerItemClient, { color: Colors.secondaryText }]} numberOfLines={1}>
                          {item.client}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.projectPickerEmpty, { color: Colors.secondaryText }]}>
                  {t('common:alerts.noProjectsToAttach')}
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Chat History Sidebar */}
      <ChatHistorySidebar
        visible={showHistorySidebar}
        onClose={() => setShowHistorySidebar(false)}
        currentSessionId={currentSessionId}
        onSelectSession={loadSession}
        onNewChat={createNewSession}
      />

      {/* Background overlay — shown when app goes to background with pending AI request.
          iOS screenshots this overlay instead of the thinking bubble. When user returns,
          we poll behind the overlay, update messages, then remove it — revealing the answer. */}
      {bgOverlay && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background, zIndex: 9999 }]} />
      )}
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
  resetChatButton: {
    padding: 8,
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
  messageAttachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
  },
  messageAttachmentDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  messageAttachmentDocName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
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
  projectPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  projectPickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 34,
  },
  projectPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  projectPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  projectPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  projectPickerItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  projectPickerItemText: {
    flex: 1,
  },
  projectPickerItemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  projectPickerItemClient: {
    fontSize: 13,
    marginTop: 2,
  },
  projectPickerEmpty: {
    textAlign: 'center',
    padding: 40,
    fontSize: 15,
  },
});
