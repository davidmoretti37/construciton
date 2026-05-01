import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
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
  Image,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { geocodeAddress } from '../utils/geocoding';
import { API_URL as EXPO_PUBLIC_BACKEND_URL } from '../config/api';
import AIInputWithSearch from '../components/AIInputWithSearch';
import AnimatedText from '../components/AnimatedText';
import LinkifiedText from '../components/LinkifiedText';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import { sendMessageToAI, sendMessageToAIStreaming, getProjectContext, analyzeScreenshot, analyzeDocument, formatProjectConfirmation, describeAttachments, setVoiceMode, sendAgentMessage, pollAgentJob, fetchLatestAgentJob } from '../services/aiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadProjectDocument } from '../utils/storage/projectDocuments';
import { generatePnLPDFFromAgent } from '../utils/financialReportPDF';
import { supabase } from '../lib/supabase';
import { fetchProjectsBasic } from '../utils/storage/projects';
import CoreAgent from '../services/agents/core/CoreAgent';
import { ProjectCard, ProjectPreview, WorkerList, BudgetChart, PhotoGallery, EstimatePreview, EstimateList, InvoicePreview, InvoiceList, ChangeOrderPreview, ProjectSelector, ExpenseCard, ProjectOverview, PhaseOverview, ContractPreview, ContractList, DocumentPicker as ChatDocumentPicker, WorkerPaymentCard, DailyReportList, AppointmentCard, TimeTrackingMap, ServicePlanPreview, PnLReportCard } from '../components/ChatVisuals';
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
import Animated, { FadeIn, FadeOut, FadeInDown, FadeOutDown } from 'react-native-reanimated';
import NotificationBell from '../components/NotificationBell';
import InboxBell from '../components/InboxBell';
import ReasoningTrail from '../components/ReasoningTrail';
import OwnerHeader from '../components/OwnerHeader';
import { useAuth } from '../contexts/AuthContext';
import { useSupervisorPermissions } from '../hooks/useSupervisorPermissions';
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
  // Per-session draft messages. Kept in a dict keyed by session id so
  // switching between history entries preserves each chat's unsent text
  // independently. Persisted to AsyncStorage on change so drafts survive
  // app reloads. `null` key used for the "no session yet" state.
  const [drafts, setDrafts] = useState({});
  const DRAFTS_STORAGE_KEY = 'chat_drafts_by_session_v1';
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false); // Track actual streaming state
  const [bgOverlay, setBgOverlay] = useState(false); // Overlay to hide thinking→answer transition
  const [statusMessage, setStatusMessage] = useState(null);
  const [showCardSkeleton, setShowCardSkeleton] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const streamingMessageIdRef = useRef(null);
  const activeJobIdRef = useRef(null);
  const activeXhrAbortRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const flatListRef = useRef(null);
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
  const supervisorPerms = useSupervisorPermissions();

  // Chat history state
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const lastSavedMessageCount = useRef(0); // Track saved messages to avoid duplicates
  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  // Create new chat session (ONLY when explicitly needed)
  const createNewSession = useCallback(async () => {
    try {
      // Abort in-flight XHR — backend continues via disconnect handler, recovery uses AsyncStorage keys
      if (activeXhrAbortRef.current) {
        activeXhrAbortRef.current.abort();
        activeXhrAbortRef.current = null;
      }

      // IMPORTANT: This should ONLY create if current session has messages
      // OR if there's no current session at all

      const hasMessages = messages.length > 0;

      if (currentSessionId && !hasMessages) {
        // Current session is empty, just clear it and reuse
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
      setIsStreaming(false);
      streamingMessageIdRef.current = null;
      setStatusMessage(null);
      setShowCardSkeleton(false);
      setPendingEstimateContext(null);
      setCurrentProject(null);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  }, [currentSessionId, messages.length]);

  // Load session messages
  const loadSession = useCallback(async (sessionId) => {
    try {
      // Abort in-flight XHR — backend continues via disconnect handler, recovery uses AsyncStorage keys
      if (activeXhrAbortRef.current) {
        activeXhrAbortRef.current.abort();
        activeXhrAbortRef.current = null;
      }

      // Reset streaming state from any in-progress request
      setIsAIThinking(false);
      setIsStreaming(false);
      streamingMessageIdRef.current = null;
      setStatusMessage(null);
      setShowCardSkeleton(false);

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
      const savedSessionId = await AsyncStorage.getItem('activeAgentSessionId');
      let savedJobId = activeJobIdRef.current || await AsyncStorage.getItem('activeAgentJobId');

      if (!savedMessageId) return loadedMessages;

      // Only merge into the session that originated the request
      if (savedSessionId && savedSessionId !== sessionId) {
        return loadedMessages;
      }

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
        AsyncStorage.removeItem('activeAgentSessionId');
      }
    } catch (e) {
    }
    return loadedMessages;
  }, []);

  // Load or create initial session on mount
  const initializeSession = useCallback(async () => {
    setIsLoadingChat(true);
    try {
      // First, try to get existing sessions (now includes message_count)
      const sessions = await chatHistoryService.getSessions();

      if (sessions && sessions.length > 0) {
        // Find empty session using message_count from backend (no extra API calls)
        const emptySession = sessions.find(s => s.message_count === 0);
        if (emptySession) {
          setCurrentSessionId(emptySession.id);
          setMessages([]);
          setConversationHistory([]);
          lastSavedMessageCount.current = 0;
        } else {
          // All sessions have messages, load the most recent one
          await loadSession(sessions[0].id);
        }
      } else {
        // No sessions exist, create a new one
        const session = await chatHistoryService.createSession();
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
      return;
    }

    if (messages.length === 0) {
      return;
    }

    if (messages.length <= lastSavedMessageCount.current) {
      return;
    }

    try {
      // Save only new messages
      const newMessages = messages.slice(lastSavedMessageCount.current);

      for (const message of newMessages) {
        await chatHistoryService.saveMessage(currentSessionId, {
          role: message.isUser ? 'user' : 'assistant',
          content: message.text,
          visualElements: message.visualElements || [],
          actions: message.actions || []
        });
      }

      // Auto-generate AI-powered title from first user message (before updating lastSavedMessageCount)
      // This should run when we're saving for the first time (empty session)
      if (lastSavedMessageCount.current === 0 && messages.length >= 1 && messages[0].isUser) {
        const title = await chatHistoryService.generateAITitle(messages[0].text);
        await chatHistoryService.updateSessionTitle(currentSessionId, title);
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

  // Inverted FlatList expects newest-first. Memoize the reversed view so
  // we don't allocate on unrelated renders.
  const reversedMessages = useMemo(() => {
    const arr = isLoadingChat ? [] : messages;
    // Iterate back-to-front so we don't mutate `messages` or pay the cost of
    // `[...messages].reverse()` on every render.
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[arr.length - 1 - i];
    return out;
  }, [messages, isLoadingChat]);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []); // Only run once on mount

  // Hydrate per-session drafts from AsyncStorage on mount so drafts survive
  // app reloads. Persist on every change with a lightweight debounce.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') setDrafts(parsed);
        }
      } catch (_) { /* best-effort */ }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [drafts]);

  // Controlled value + setter for the chat input. Keyed by current session
  // so typing in one chat doesn't bleed into another; `__none` holds the
  // pre-session draft (very first message before a session is created).
  const draftKey = currentSessionId || '__none';
  const draftValue = drafts[draftKey] || '';
  const setDraftValue = useCallback((text) => {
    setDrafts((prev) => {
      // Drop empty-string entries to avoid accumulating junk keys in storage.
      if (!text) {
        if (!(draftKey in prev)) return prev;
        const { [draftKey]: _removed, ...rest } = prev;
        return rest;
      }
      if (prev[draftKey] === text) return prev;
      return { ...prev, [draftKey]: text };
    });
  }, [draftKey]);

  // When a session is created after the user has already typed something
  // (draft lives under `__none`), hoist that draft onto the new session id
  // so the in-flight text doesn't disappear.
  useEffect(() => {
    if (!currentSessionId) return;
    setDrafts((prev) => {
      if (!prev.__none) return prev;
      if (prev[currentSessionId]) return prev; // don't clobber an existing one
      const { __none: carried, ...rest } = prev;
      return { ...rest, [currentSessionId]: carried };
    });
  }, [currentSessionId]);

  // Auto-save messages ONLY when streaming fully completes
  useEffect(() => {
    // Only save when streaming is done AND we have unsaved messages
    if (!isStreaming && currentSessionId && messages.length > lastSavedMessageCount.current) {
      // Add a small delay to ensure message is fully rendered
      const saveTimer = setTimeout(() => {
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
          if (currentSessionIdRef.current && responseText) {
            chatHistoryService.saveMessage(currentSessionIdRef.current, {
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
      if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
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

    // Save messageId and session to AsyncStorage immediately (before any async work)
    await AsyncStorage.setItem('activeAgentMessageId', aiMessageId);
    await AsyncStorage.setItem('activeAgentSessionId', currentSessionId);

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
        // onAbortRef - Store abort function so session switch can kill XHR
        onAbortRef: (ref) => { activeXhrAbortRef.current = ref; },
        // onJobId callback - Track background job for resume on disconnect
        onJobId: (jobId) => {
          activeJobIdRef.current = jobId;
          AsyncStorage.setItem('activeAgentJobId', jobId);
        },
        // onPlan callback — planner stage emits a one-line intent before
        // tools fire. Stored on the streaming message so the UI can show
        // it as italic "thinking" text above the response.
        onPlan: ({ plan_text, complexity }) => {
          if (!plan_text) return;
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => msg.id === targetId
            ? { ...msg, planText: plan_text, planComplexity: complexity }
            : msg));
        },
        // onPlanDiverged — if the verifier flags a major divergence we
        // surface it as a small warning under the response. Minor
        // divergences are logged but not shown.
        onPlanDiverged: ({ severity, reason }) => {
          if (severity !== 'major') return;
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => msg.id === targetId
            ? { ...msg, planDivergence: reason || 'Action did not match plan.' }
            : msg));
        },
        // onTool — P3 streaming reasoning. Backend now ships enriched
        // tool_start (category, risk_level, args_summary) and tool_end
        // (duration_ms, ok). We append a running trail entry on
        // streamed message so the chat bubble can render an inline
        // "Foreman is doing X" list that collapses after the turn.
        onTool: ({ event, tool, message, category, risk_level, args_summary, duration_ms, ok }) => {
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => {
            if (msg.id !== targetId) return msg;
            const trail = Array.isArray(msg.toolTrail) ? msg.toolTrail.slice() : [];
            if (event === 'started') {
              trail.push({
                tool,
                message,
                category,
                risk_level,
                args_summary,
                status: 'running',
                started_at: Date.now(),
              });
            } else if (event === 'ended') {
              // Find the most recent matching tool entry that's still running.
              // Default to 'completed' when `ok` is missing/undefined — the
              // backend used to default-emit success, and treating absent
              // info as failure produced spurious red error indicators
              // (the red-X bug). Only mark failed when ok === false.
              for (let i = trail.length - 1; i >= 0; i--) {
                if (trail[i].tool === tool && trail[i].status === 'running') {
                  const finalStatus = ok === false ? 'failed' : 'completed';
                  trail[i] = { ...trail[i], status: finalStatus, duration_ms };
                  break;
                }
              }
            }
            return { ...msg, toolTrail: trail };
          }));
        },
        // onStep — P2 multi-step planner events (started/completed/failed).
        // Captured on the streaming message so the assistant bubble can
        // render the checklist if the plan emitted steps. Phase-3
        // ReasoningTrail renders these alongside the toolTrail.
        onStep: ({ event, step_id, action, reason }) => {
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => {
            if (msg.id !== targetId) return msg;
            const steps = Array.isArray(msg.planSteps) ? msg.planSteps.slice() : [];
            const idx = steps.findIndex(s => s.id === step_id);
            const status = event === 'step_started' ? 'in_progress'
              : event === 'step_completed' ? 'completed'
              : event === 'step_failed' ? 'failed'
              : 'pending';
            if (idx >= 0) {
              steps[idx] = { ...steps[idx], status, ...(reason ? { reason } : {}) };
            } else {
              steps.push({ id: step_id, action: action || `Step ${step_id}`, status, ...(reason ? { reason } : {}) });
            }
            return { ...msg, planSteps: steps };
          }));
        },
        // onPendingApproval — the approval gate blocked an irreversible
        // tool call (delete, void, send SMS, share document, etc.). The
        // agent will follow up with an "Are you sure?" message; we attach
        // the structured payload to the streaming message so the chat
        // bubble can render an inline Approve / Cancel card with the
        // exact action_summary the gate generated.
        onPendingApproval: ({ tool, args, action_summary, risk_level, reason }) => {
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => msg.id === targetId
            ? {
                ...msg,
                pendingApproval: {
                  tool,
                  args: args || {},
                  action_summary: action_summary || `Run ${tool}`,
                  risk_level: risk_level || 'write_destructive',
                  reason: reason || '',
                },
              }
            : msg));
        },
        // onRetrying — the agent self-corrected. Show transparent
        // "retrying…" feedback so the user knows what happened and the
        // text reset is intentional.
        onRetrying: ({ attempt, reason }) => {
          setStatusMessage(`Reviewing my response and trying again…`);
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => msg.id === targetId
            ? { ...msg, text: '', retryNote: reason || 'Re-checking my work.' }
            : msg));
        },
        // PEV (Plan-Execute-Verify) pipeline events. Builds a step-by-step
        // reasoning trail attached to the assistant message bubble so the
        // user sees what the agent is doing in real time.
        onPev: (pevEvent) => {
          const targetId = streamingMessageIdRef.current || aiMessageId;
          setMessages(prev => prev.map(msg => {
            if (msg.id !== targetId) return msg;
            const trail = msg.pevTrail || [];
            // Update inline status text based on event type
            let label = null;
            switch (pevEvent?.type) {
              case 'pev_classify_start': label = 'Classifying…'; break;
              case 'pev_classify_done':
                if (pevEvent.classification === 'complex') label = 'Planning…';
                break;
              case 'pev_plan_done':
                label = `Plan: ${pevEvent.stepCount} step${pevEvent.stepCount === 1 ? '' : 's'}`;
                break;
              case 'plan_start':
                label = `Goal: ${pevEvent.goal}`;
                break;
              case 'step_start':
                label = `▸ ${pevEvent.stepIndex}. ${pevEvent.tool}${pevEvent.why ? ` — ${pevEvent.why}` : ''}`;
                break;
              case 'step_done':
                label = `✓ ${pevEvent.tool} (${pevEvent.ms}ms)`;
                break;
              case 'step_error':
                label = `✗ ${pevEvent.error}`;
                break;
              case 'pev_verify_start':
                label = 'Verifying…';
                break;
              case 'pev_verify_done':
                label = pevEvent.satisfied ? '✓ Verified' : `Gap: ${pevEvent.gap || 'incomplete'}`;
                break;
              case 'pev_respond_start':
                label = 'Composing reply…';
                break;
              default:
                break;
            }
            if (!label) return msg;
            return { ...msg, pevTrail: [...trail, { ts: Date.now(), label }] };
          }));
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

          // Use ref for stable ID reference (avoids stale closure)
          const targetId = streamingMessageIdRef.current || aiMessageId;

          // Append the chunk to existing bubble
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === targetId
                ? { ...msg, text: (msg.text || '') + chunk, isThinking: false }
                : msg
            )
          );
        },
        // onComplete callback - Add visual elements
        onComplete: (parsedResponse) => {
          setIsAIThinking(false);
          setIsStreaming(false); // CRITICAL: Set to false ONLY when streaming actually completes
          setStatusMessage(null); // Clear status on complete
          setShowCardSkeleton(false);
          streamingMessageIdRef.current = null;

          // Clear background job tracking
          activeJobIdRef.current = null;
          activeXhrAbortRef.current = null;
          AsyncStorage.removeItem('activeAgentJobId');
          AsyncStorage.removeItem('activeAgentMessageId');
          AsyncStorage.removeItem('activeAgentSessionId');

          // Disable voice mode after response completes
          // This ensures next typed message uses standard (powerful) model
          setVoiceMode(false);

          // Debug logging
          if (__DEV__) {
          }

          // Auto-correct: if AI returned project-preview for what is clearly a service plan,
          // fix the visual element type so the correct card renders
          const SERVICE_PLAN_TYPES = ['pest_control', 'cleaning', 'landscaping', 'pool_service', 'lawn_care', 'hvac'];
          if (parsedResponse.visualElements?.length > 0) {
            parsedResponse.visualElements = parsedResponse.visualElements.map(v => {
              if (v.type === 'project-preview') {
                const d = v.data || {};
                const hasServiceType = d.service_type && SERVICE_PLAN_TYPES.includes(d.service_type);
                const hasBillingCycle = d.billing_cycle || d.billingCycle;
                const hasRecurringKeywords = (d.name || '').toLowerCase().match(/pest|clean|lawn|pool|hvac|service plan|recurring/);
                if (hasServiceType || hasBillingCycle || hasRecurringKeywords) {
                  logger.info('[Chat] Auto-corrected project-preview → service-plan-preview');
                  return { ...v, type: 'service-plan-preview' };
                }
              }
              return v;
            });
          }

          // CRITICAL: Force state update by using functional update with timestamp
          // Use ref for stable ID reference (avoids stale closure)
          const targetId = aiMessageId;

          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id === targetId) {
                return {
                  ...msg,
                  text: parsedResponse.text || msg.text || '',
                  visualElements: parsedResponse.visualElements || [],
                  actions: parsedResponse.actions || [],
                  isThinking: false,
                  lastUpdated: Date.now(), // Force React to detect change
                };
              }
              return msg;
            });

            // Verify the update worked
            if (__DEV__) {
              const updatedMsg = updated.find(m => m.id === targetId);
            }

            return updated;
          });

          // (Removed: 150ms + 500ms _renderKey setTimeout hacks. The real
          // fix was adding extraData={messages} to the FlatList and using
          // stable, type-scoped keys on visual elements — both done in the
          // same commit. lastUpdated above is enough to give VirtualizedList
          // a per-message diff signal.)

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
            projectActions.handleUpdateProjectFinances(updateAction.data);
          }

          // AUTO-EXECUTE worker payment queries
          const workerPaymentAction = parsedResponse.actions?.find(action => action.type === 'get-worker-payment');
          if (workerPaymentAction) {
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
            workerActions.handleCreateWorker(createWorkerAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const updateWorkerAction = parsedResponse.actions?.find(action => action.type === 'update-worker');
          if (updateWorkerAction) {
            workerActions.handleUpdateWorker(updateWorkerAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE delete worker actions (handles multiple deletions)
          const deleteWorkerActions = parsedResponse.actions?.filter(action => action.type === 'delete-worker');
          if (deleteWorkerActions && deleteWorkerActions.length > 0) {
            deleteWorkerActions.forEach(deleteAction => {
              workerActions.handleDeleteWorker(deleteAction.data);
            });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // delete-all-workers: NOT auto-executed — requires user to tap action button + confirm

          // AUTO-EXECUTE clock in/out actions
          const clockInAction = parsedResponse.actions?.find(action => action.type === 'clock-in-worker');
          if (clockInAction) {
            workerActions.handleClockInWorker(clockInAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const clockOutAction = parsedResponse.actions?.find(action => action.type === 'clock-out-worker');
          if (clockOutAction) {
            workerActions.handleClockOutWorker(clockOutAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const bulkClockInAction = parsedResponse.actions?.find(action => action.type === 'bulk-clock-in');
          if (bulkClockInAction) {
            workerActions.handleBulkClockIn(bulkClockInAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const bulkClockOutAction = parsedResponse.actions?.find(action => action.type === 'bulk-clock-out');
          if (bulkClockOutAction) {
            workerActions.handleBulkClockOut(bulkClockOutAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE time entry actions
          const editTimeAction = parsedResponse.actions?.find(action => action.type === 'edit-time-entry');
          if (editTimeAction) {
            workerActions.handleEditTimeEntry(editTimeAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const createTimeAction = parsedResponse.actions?.find(action => action.type === 'create-time-entry');
          if (createTimeAction) {
            workerActions.handleCreateTimeEntry(createTimeAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const deleteTimeAction = parsedResponse.actions?.find(action => action.type === 'delete-time-entry');
          if (deleteTimeAction) {
            workerActions.handleDeleteTimeEntry(deleteTimeAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE availability actions
          const setAvailabilityAction = parsedResponse.actions?.find(action => action.type === 'set-worker-availability');
          if (setAvailabilityAction) {
            workerActions.handleSetWorkerAvailability(setAvailabilityAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const setPTOAction = parsedResponse.actions?.find(action => action.type === 'set-worker-pto');
          if (setPTOAction) {
            workerActions.handleSetWorkerPTO(setPTOAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const removeAvailabilityAction = parsedResponse.actions?.find(action => action.type === 'remove-worker-availability');
          if (removeAvailabilityAction) {
            workerActions.handleRemoveWorkerAvailability(removeAvailabilityAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE crew actions
          const createCrewAction = parsedResponse.actions?.find(action => action.type === 'create-crew');
          if (createCrewAction) {
            workerActions.handleCreateCrew(createCrewAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const updateCrewAction = parsedResponse.actions?.find(action => action.type === 'update-crew');
          if (updateCrewAction) {
            workerActions.handleUpdateCrew(updateCrewAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const deleteCrewAction = parsedResponse.actions?.find(action => action.type === 'delete-crew');
          if (deleteCrewAction) {
            workerActions.handleDeleteCrew(deleteCrewAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE shift template actions
          const createShiftAction = parsedResponse.actions?.find(action => action.type === 'create-shift-template');
          if (createShiftAction) {
            workerActions.handleCreateShiftTemplate(createShiftAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const applyShiftAction = parsedResponse.actions?.find(action => action.type === 'apply-shift-template');
          if (applyShiftAction) {
            workerActions.handleApplyShiftTemplate(applyShiftAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const deleteShiftAction = parsedResponse.actions?.find(action => action.type === 'delete-shift-template');
          if (deleteShiftAction) {
            workerActions.handleDeleteShiftTemplate(deleteShiftAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE break actions
          const startBreakAction = parsedResponse.actions?.find(action => action.type === 'start-break');
          if (startBreakAction) {
            workerActions.handleStartBreak(startBreakAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          const endBreakAction = parsedResponse.actions?.find(action => action.type === 'end-break');
          if (endBreakAction) {
            workerActions.handleEndBreak(endBreakAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE swap shifts action
          const swapShiftsAction = parsedResponse.actions?.find(action => action.type === 'swap-shifts');
          if (swapShiftsAction) {
            workerActions.handleSwapShifts(swapShiftsAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE schedule event actions (create, update, delete)
          const createScheduleAction = parsedResponse.actions?.find(action => action.type === 'create-schedule-event');
          const updateScheduleAction = parsedResponse.actions?.find(action => action.type === 'update-schedule-event');
          const deleteScheduleAction = parsedResponse.actions?.find(action => action.type === 'delete-schedule-event');

          if (createScheduleAction) {
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
            scheduleActions.handleDeleteScheduleEvent(deleteScheduleAction.data);

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE delete-project action (has confirmation dialog built in)
          const deleteProjectAction = parsedResponse.actions?.find(action => action.type === 'delete-project');
          if (deleteProjectAction) {
            projectActions.handleDeleteProject(deleteProjectAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // delete-all-projects, delete-all-estimates:
          // NOT auto-executed — requires user to tap action button + confirm via Alert dialog

          // AUTO-EXECUTE sync tasks to calendar action
          const syncTasksAction = parsedResponse.actions?.find(action => action.type === 'sync-tasks-to-calendar');
          if (syncTasksAction) {
            projectActions.handleSyncProjectTasksToCalendar(syncTasksAction.data);

            // Remove the AI message entirely - the handler adds its own confirmation
            setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          }

          // AUTO-EXECUTE update project action
          const updateProjectAction = parsedResponse.actions?.find(action => action.type === 'update-project');
          if (updateProjectAction) {
            projectActions.handleUpdateProject(updateProjectAction.data, { skipConfirmation: true });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE add estimate to project choice
          const addEstimateAction = parsedResponse.actions?.find(action => action.type === 'add-estimate-to-project-choice');
          if (addEstimateAction) {
            projectActions.handleAddEstimateToProjectChoice(addEstimateAction.data);
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE update estimate action
          const updateEstimateAction = parsedResponse.actions?.find(action => action.type === 'update-estimate');
          if (updateEstimateAction) {
            estimateActions.handleUpdateEstimate(updateEstimateAction.data, { skipConfirmation: true });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE record invoice payment
          const recordPaymentAction = parsedResponse.actions?.find(action => action.type === 'record-invoice-payment');
          if (recordPaymentAction) {
            invoiceActions.handleRecordInvoicePayment(recordPaymentAction.data, { skipConfirmation: true });
            setMessages((prev) => prev.map((msg) => msg.id === aiMessageId ? { ...msg, actions: [] } : msg));
          }

          // AUTO-EXECUTE retrieve daily reports action
          const retrieveReportsAction = parsedResponse.actions?.find(action => action.type === 'retrieve-daily-reports');
          if (retrieveReportsAction) {
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

          // Action hooks now emit project/estimate/invoice/worker events directly
          // at the point of mutation, so this heuristic is no longer needed.

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
            // Safety timeout: hide skeleton after 10s if card never renders
            setTimeout(() => {
              setShowCardSkeleton(false);
            }, 10000);
          }
        }
        },
        rawAttachmentsForUpload,
        currentSessionIdRef.current
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

    // Supervisor restrictions — block actions the supervisor lacks permission for.
    // Owners always pass; other roles get blocked by the underlying logic.
    const ACTION_PERMISSION_KEY = {
      'save-estimate': 'canCreateEstimates',
      'create-estimate': 'canCreateEstimates',
      'confirm-estimate': 'canCreateEstimates',
      'generate-estimate': 'canCreateEstimates',
      'convert-estimate-to-invoice': 'canCreateInvoices',
      'create-invoice': 'canCreateInvoices',
      'save-invoice': 'canCreateInvoices',
      'save-change-order': 'canCreateInvoices',
      'update-change-order': 'canCreateInvoices',
      'send-change-order': 'canCreateInvoices',
      'create-project': 'canCreateProjects',
      'save-project': 'canCreateProjects',
      'confirm-project': 'canCreateProjects',
      'configure-project-details': 'canCreateProjects',
      'create-project-from-screenshot': 'canCreateProjects',
      'create-project-from-estimate': 'canCreateProjects',
      'get-worker-payment': 'canPayWorkers',
    };

    if (isSupervisor) {
      const requiredPerm = ACTION_PERMISSION_KEY[action.type];
      if (requiredPerm && !supervisorPerms[requiredPerm]) {
        Alert.alert(
          t('common:alerts.restricted', 'Restricted'),
          t('common:messages.permissionDenied', "You don't have permission to do that. Ask the owner to enable it.")
        );
        return;
      }
    }

    try {
      switch (action.type) {
      // Navigation & View Actions
      case 'view-project':
        if (action.data?.projectId || action.data?.id) {
          // Navigate to nested screen: Projects tab -> ProjectDetail screen
          navigation.navigate('Projects', {
            screen: 'ProjectDetail',
            params: { projectId: action.data.projectId || action.data.id }
          });
        }
        break;
      case 'view-photos':
        break;
      case 'add-worker':
        break;
      case 'navigate-to-projects':
        navigation.navigate('Projects');
        break;
      case 'view-service-plan':
        if (action.data?.servicePlanId || action.data?.id) {
          navigation.navigate('ServicePlanDetail', {
            planId: action.data.servicePlanId || action.data.id
          });
        }
        break;
      case 'navigate-to-services':
        navigation.navigate('Projects');
        break;
      case 'view-estimate':
        // Store estimate for invoice creation (Plan A/Plan B pattern)
        CoreAgent.updateConversationState({ lastEstimatePreview: action.data });
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
      case 'configure-project-details':
        navigation.navigate('ProjectBuilder', { chatExtractedData: action.data });
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
        // handleSaveProject already persists the project AND any
        // checklist_items / labor_roles passed in action.data — we used to
        // re-insert them here, which (a) duplicated rows on the templates
        // tables and (b) amplified the post-save re-render cascade that
        // felt like a full-app reload. Now: single call, single message.
        const savedProject = await projectActions.handleSaveProject(action.data, messages);
        if (savedProject?.id) {
          return { projectId: savedProject.id };
        }
        break;
      }
      case 'save-service-plan': {
        try {
          const userId = user?.id || profile?.id || await getCurrentUserId();
          const planData = action.data;

          // Validate required fields
          if (!planData.name || planData.name.trim() === '' || planData.name === 'Untitled Plan') {
            Alert.alert('Required', 'Service plan name is required.');
            break;
          }
          const hasAddress = planData.address || planData.location_address ||
            (planData.locations && planData.locations.length > 0 && planData.locations.some(l => l.address || l.location_address));
          if (!hasAddress) {
            Alert.alert('Required', 'At least one service location address is required.');
            break;
          }
          const bc = planData.billing_cycle || 'monthly';
          if (bc === 'per_visit' && (!planData.price_per_visit || parseFloat(planData.price_per_visit) <= 0)) {
            Alert.alert('Required', 'Price per visit must be greater than 0 for per-visit billing.');
            break;
          }
          if ((bc === 'monthly' || bc === 'quarterly') && (!planData.monthly_rate || parseFloat(planData.monthly_rate) <= 0)) {
            Alert.alert('Required', 'Monthly rate must be greater than 0 for monthly/quarterly billing.');
            break;
          }

          // 1. Create the service plan
          const { data: plan, error: planError } = await supabase
            .from('service_plans')
            .insert({
              owner_id: userId,
              name: planData.name || 'Untitled Plan',
              service_type: (planData.service_type || 'other').toLowerCase().replace(/\s+/g, '_'),
              billing_cycle: planData.billing_cycle || 'monthly',
              price_per_visit: planData.price_per_visit || null,
              monthly_rate: planData.monthly_rate || null,
              description: planData.description || null,
              notes: planData.notes || null,
              status: 'active',
              client_name: planData.client_name || null,
              client_phone: planData.client_phone || null,
              client_email: planData.client_email || null,
              address: planData.address || planData.location_address || null,
            })
            .select()
            .single();
          if (planError) throw planError;

          // 2. Create locations
          // Support both single location_address and locations[] array
          const locationsToCreate = [];
          if (planData.locations && Array.isArray(planData.locations) && planData.locations.length > 0) {
            planData.locations.forEach(loc => {
              if (loc.address || loc.location_address) {
                locationsToCreate.push({
                  name: loc.name || loc.location_name || 'Location',
                  address: loc.address || loc.location_address,
                  access_notes: loc.access_notes || loc.location_notes || null,
                });
              }
            });
          } else if (planData.location_address || planData.address) {
            locationsToCreate.push({
              name: planData.location_name || planData.client_name || 'Main Location',
              address: planData.location_address || planData.address,
              access_notes: planData.location_notes || null,
            });
          }

          let firstLocationId = null;
          const allLocationIds = [];
          for (const locData of locationsToCreate) {
            // Geocode address for map/route features
            let geoData = {};
            try {
              const geo = await geocodeAddress(locData.address);
              if (geo) {
                geoData = {
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                  formatted_address: geo.formattedAddress || geo.formatted_address || null,
                  place_id: geo.placeId || geo.place_id || null,
                };
              }
            } catch (e) {
              logger.debug('[Chat] Geocoding failed for:', locData.address, e.message);
            }

            const { data: loc, error: locError } = await supabase
              .from('service_locations')
              .insert({
                service_plan_id: plan.id,
                owner_id: userId,
                name: locData.name,
                address: locData.address,
                access_notes: locData.access_notes,
                ...geoData,
              })
              .select()
              .single();
            if (!locError && loc) {
              allLocationIds.push(loc.id);
              if (!firstLocationId) firstLocationId = loc.id;

              // 3. Create schedule for each location if frequency provided
              if (planData.schedule_frequency) {
                // Normalize scheduled_days: AI may send numbers [1,3] or strings ['monday','wednesday']
                const NUM_TO_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const normalizedDays = (planData.scheduled_days || []).map(d => {
                  if (typeof d === 'number') return NUM_TO_DAY[d] || String(d);
                  return String(d).toLowerCase();
                });

                const { error: schedError } = await supabase.from('location_schedules').insert({
                  service_location_id: loc.id,
                  owner_id: userId,
                  frequency: planData.schedule_frequency,
                  scheduled_days: normalizedDays,
                  preferred_time: planData.preferred_time || null,
                });
                if (schedError) {
                  logger.error('[Chat] Schedule insert error:', schedError.message);
                  Alert.alert('Warning', 'Schedule could not be created for this location. Visits may not generate correctly.');
                }
              }
            }
          }
          const locationId = firstLocationId;

          // 4. Create per-location visit checklist templates for ALL locations
          if (allLocationIds.length > 0 && planData.checklist_items?.length) {
            const simpleItems = planData.checklist_items.filter(item => typeof item === 'string');
            if (simpleItems.length > 0) {
              const checklistRows = allLocationIds.flatMap(locId =>
                simpleItems.map((item, i) => ({
                  service_location_id: locId,
                  owner_id: userId,
                  title: item,
                  sort_order: i,
                }))
              );
              await supabase.from('visit_checklist_templates').insert(checklistRows);
            }
          }

          // 5. Create daily checklist templates (per-plan, not per-location)
          const dailyItems = (planData.checklist_items || []).filter(item => typeof item !== 'string' && item.title);
          if (dailyItems.length > 0) {
            await supabase.from('daily_checklist_templates').insert(
              dailyItems.map((item, i) => ({
                service_plan_id: plan.id,
                owner_id: userId,
                title: item.title,
                item_type: item.item_type || 'checkbox',
                quantity_unit: item.quantity_unit || null,
                requires_photo: item.requires_photo || false,
                sort_order: i,
              }))
            );
            logger.info(`[Chat] Created ${dailyItems.length} daily checklist templates for plan ${plan.id}`);
          }

          // 6. Create labor role templates if provided
          const roles = planData.labor_roles || [];
          if (roles.length > 0) {
            await supabase.from('labor_role_templates').insert(
              roles.map((role, i) => ({
                service_plan_id: plan.id,
                owner_id: userId,
                role_name: typeof role === 'string' ? role : role.role_name,
                default_quantity: role.default_quantity || 1,
                sort_order: i,
              }))
            );
            logger.info(`[Chat] Created ${roles.length} labor roles for plan ${plan.id}`);
          }

          // 7. Auto-generate visits via backend (8 weeks ahead)
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const backendUrl = EXPO_PUBLIC_BACKEND_URL;
            const genResponse = await fetch(`${backendUrl}/api/service-visits/generate/${plan.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ weeksAhead: 8 }),
            });
            if (genResponse.ok) {
              const genResult = await genResponse.json();
              logger.info(`[Chat] Generated ${genResult.generated || 0} visits for plan ${plan.id}`);
              if ((genResult.generated || 0) === 0) {
                Alert.alert('Note', 'Service plan saved, but no visits were generated. Check that the schedule and frequency are set correctly.');
              }
            } else {
              logger.error('[Chat] Visit generation failed:', genResponse.status);
              Alert.alert('Warning', 'Service plan saved, but visit generation failed. Visits can be generated later from the plan detail screen.');
            }
          } catch (e) {
            logger.error('[Chat] Visit generation error:', e.message);
            Alert.alert('Warning', 'Service plan saved, but visit generation could not be triggered. Check your internet connection.');
          }

          logger.info(`[Chat] Saved service plan: ${plan.name} (${plan.id})`);
          return { servicePlanId: plan.id };
        } catch (e) {
          logger.error('[Chat] Failed to save service plan:', e.message);
          Alert.alert('Error', 'Failed to save service plan');
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
      case 'send-estimate-to-client':
        await estimateActions.handleSendEstimateToClient(action.data);
        break;
      case 'send-contract-to-client': {
        // Inline handler — small + isolated, no need for a new actions hook
        try {
          if (!action.data?.id) {
            Alert.alert('Save First', 'Please save the contract before sending to client.');
            break;
          }
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            Alert.alert('Error', 'Not authenticated');
            break;
          }
          const { API_URL } = require('../config/api');
          const res = await fetch(`${API_URL}/api/portal-admin/contracts/${action.data.id}/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          const result = await res.json();
          if (result.sent) {
            Alert.alert('Sent!', `Contract sent to ${result.email} and available in client portal.`);
          } else {
            Alert.alert('Send Failed', result.error || 'Could not send contract.');
          }
        } catch (e) {
          Alert.alert('Error', e.message || 'Failed to send contract.');
        }
        break;
      }
      case 'delete-all-estimates':
        await estimateActions.handleDeleteAllEstimates(action.data);
        break;

      // Invoice Actions (from useInvoiceActions)
      case 'convert-estimate-to-invoice':
        await invoiceActions.handleConvertToInvoice(action.data);
        break;

      // Owner just chose "Set up draws" on an accepted estimate → open
      // ProjectBuilder pre-loaded from the estimate. Builder takes care of
      // creating the project + draw schedule.
      case 'set-up-draws-from-estimate': {
        const estId = action.data?.id || action.data?.estimateId;
        if (!estId) {
          Alert.alert('Missing estimate', "Save the estimate first before setting up draws.");
          break;
        }
        navigation.navigate('ProjectBuilder', { fromEstimateId: estId });
        break;
      }
      case 'save-invoice':
        await invoiceActions.handleSaveInvoice(action.data);
        break;
      case 'preview-invoice-pdf':
        await invoiceActions.handlePreviewInvoicePDF(action.data);
        break;
      case 'share-invoice-pdf':
        await invoiceActions.handleShareInvoicePDF(action.data);
        break;
      case 'send-invoice-to-client':
        await invoiceActions.handleSendToClient(action.data);
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

      // Change Order Actions — return the API response so the preview card can
      // chain (e.g. tap Send right after Save uses the new id without a re-render).
      case 'save-change-order': {
        const { saveChangeOrder, updateChangeOrder } = await import('../utils/storage/changeOrders');
        try {
          const payload = action.data || {};
          if (payload.id) {
            return await updateChangeOrder(payload.id, payload);
          }
          return await saveChangeOrder(payload);
        } catch (e) {
          Alert.alert('Save failed', e.message || 'Could not save the change order.');
          return null;
        }
      }
      case 'update-change-order': {
        const { updateChangeOrder } = await import('../utils/storage/changeOrders');
        try {
          if (!action.data?.id) throw new Error('Missing change order id');
          return await updateChangeOrder(action.data.id, action.data);
        } catch (e) {
          Alert.alert('Update failed', e.message || 'Could not update the change order.');
          return null;
        }
      }
      case 'send-change-order': {
        const { sendChangeOrder } = await import('../utils/storage/changeOrders');
        try {
          if (!action.data?.id) throw new Error('Missing change order id');
          const { id, ...overrides } = action.data;
          return await sendChangeOrder(id, overrides);
        } catch (e) {
          Alert.alert('Send failed', e.message || 'Could not send the change order.');
          return null;
        }
      }

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

      // Profit & Loss PDF — emitted by PnLReportCard's "Download PDF"
      // button. Reuses the existing financial-report PDF + native share
      // path via generatePnLPDFFromAgent.
      case 'download-pnl-pdf':
        await generatePnLPDFFromAgent(action.data);
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
        const projects = await fetchProjects();
        const fullProjectId = resolveProjectId(projects, completeEstimateData.projectId);
        if (fullProjectId) {
          completeEstimateData.projectId = fullProjectId;
        } else {
          console.warn('❌ Could not resolve partial project ID, removing link');
          completeEstimateData.projectId = null;
        }
      }

      // Check if phases are missing tasks (common AI issue)
      const actionHasTasks = estimateData.phases?.some(p => p.tasks?.length > 0);

      if (!actionHasTasks) {

        // Find the most recent message with estimate preview
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg.isUser && msg.visualElements) {
            const estimatePreview = msg.visualElements.find(ve => ve.type === 'estimate-preview');
            if (estimatePreview && estimatePreview.data) {
              const previewHasTasks = estimatePreview.data.phases?.some(p => p.tasks?.length > 0);

              if (previewHasTasks) {
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
                break;
              }
            }
          }
        }
      }

      // If no valid projectId, try to get it from saved project in conversation state
      if (!completeEstimateData.projectId) {
        const savedProjectId = CoreAgent.conversationState?.lastProjectPreview?.id;
        if (savedProjectId && savedProjectId.length === 36) {
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

      // Extract complete data from visualElement if action data is incomplete
      let completeProjectData = projectData;

      // Check if phases are missing tasks (common AI issue)
      const actionHasTasks = projectData.phases?.some(p => p.tasks?.length > 0);

      if (!actionHasTasks) {

        // Find the most recent message with project preview
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg.isUser && msg.visualElements) {
            const projectPreview = msg.visualElements.find(ve => ve.type === 'project-preview');
            if (projectPreview && projectPreview.data) {
              const previewHasTasks = projectPreview.data.phases?.some(p => p.tasks?.length > 0);

              if (previewHasTasks) {
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
          }
        }
      }
    }

    // Stable, type-scoped key so React reconciliation always treats a freshly
    // attached visual element as a new mount instead of a same-index reuse.
    const k = `${element.type}-${index}`;
    switch (element.type) {
      case 'project-card':
        return <ProjectCard key={k} data={element.data} onAction={handleAction} />;
      case 'project-selector':
        return <ProjectSelector key={k} data={element.data} onAction={handleAction} />;
      case 'worker-list':
        return <WorkerList key={k} data={element.data} />;
      case 'worker-payment-card':
        return <WorkerPaymentCard key={k} data={element.data} />;
      case 'budget-chart':
        return <BudgetChart key={k} data={element.data} />;
      case 'photo-gallery':
        return <PhotoGallery key={k} data={element.data} onAction={handleAction} />;
      case 'project-preview':
        return <ProjectPreview key={k} data={element.data} onAction={handleAction} />;
      case 'service-plan-preview':
        return <ServicePlanPreview key={k} data={element.data} onAction={handleAction} />;
      case 'estimate-preview':
        return <EstimatePreview key={k} data={element.data} onAction={handleAction} />;
      case 'estimate-list':
        return <EstimateList key={k} data={element.data} onAction={handleAction} />;
      case 'invoice-preview':
        return <InvoicePreview key={k} data={element.data} onAction={handleAction} />;
      case 'change-order-preview':
        return <ChangeOrderPreview key={k} data={element.data} onAction={handleAction} />;
      case 'invoice-list':
        return <InvoiceList key={k} data={element.data} onAction={handleAction} />;
      case 'contract-preview':
        return <ContractPreview key={k} data={element.data} onAction={handleAction} />;
      case 'contract-list':
        return <ContractList key={k} data={element.data} onAction={handleAction} />;
      case 'document-picker':
        return <ChatDocumentPicker key={k} data={element.data} onAction={handleAction} />;
      case 'expense-card':
        return <ExpenseCard key={k} data={element.data} />;
      case 'project-overview':
        return <ProjectOverview key={k} data={element.data} onAction={handleAction} />;
      case 'phase-overview':
        return <PhaseOverview key={k} data={element.data} onAction={handleAction} />;
      case 'daily-report-list':
        return <DailyReportList key={k} data={element.data} onAction={handleAction} />;
      case 'appointment-card':
        return <AppointmentCard key={k} data={element.data} onAction={handleAction} />;
      case 'time-tracking-map':
        return <TimeTrackingMap key={k} data={element.data} />;
      case 'pnl-report':
        return <PnLReportCard key={k} data={element.data} onAction={handleAction} />;
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
        {/* <InboxBell onPress={() => navigation.navigate('Inbox')} /> */}
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

      {/* Chat Messages and Input Area */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -60 : 0}
      >
        <View style={{ flex: 1 }}>
        {/* Empty-state is rendered OUTSIDE the FlatList because with
            inverted={true}, ListEmptyComponent doesn't stretch with flex:1
            and the greeting collapses against the floating input. */}
        {!isLoadingChat && messages.length === 0 && (
          <View pointerEvents="none" style={styles.emptyStateOverlay}>
            <AnimatedText
              text={t('welcome.title')}
              delay={60}
            />
          </View>
        )}
        <FlatList
          ref={flatListRef}
          style={styles.chatArea}
          // Inverted list: paddingTop/Bottom swap visually. Visual bottom ==
          // contentContainer `paddingTop` (≈ room above floating input), visual
          // top == `paddingBottom`.
          contentContainerStyle={[styles.chatContent, { paddingTop: 180, paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          inverted
          data={reversedMessages}
          extraData={messages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            isLoadingChat ? (
              <View style={{ paddingTop: 24, paddingHorizontal: Spacing.md }}>
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
            ) : null
          }
          ListHeaderComponent={statusMessage ? <StatusMessage message={statusMessage} /> : null}
          renderItem={({ item: message }) => (
                <View style={styles.messageContainer}>
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

                  {/* Planner stage: small italic intent line above the
                      response. Only on assistant messages with a plan. */}
                  {!message.isUser && message.planText ? (
                    <Text
                      style={{
                        color: Colors.secondaryText,
                        fontStyle: 'italic',
                        fontSize: 12,
                        marginBottom: 6,
                        marginLeft: 4,
                        opacity: 0.75,
                      }}
                      numberOfLines={3}
                    >
                      {message.planText}
                    </Text>
                  ) : null}

                  {/* P3: ReasoningTrail — live tool calls + step
                      checklist. Auto-collapses 4s after the turn ends.
                      Hidden via EXPO_PUBLIC_FOREMAN_TRANSPARENT_REASONING=false. */}
                  {!message.isUser && (Array.isArray(message.toolTrail) || Array.isArray(message.planSteps)) ? (
                    <ReasoningTrail
                      toolTrail={message.toolTrail || []}
                      planSteps={message.planSteps || []}
                      isStreaming={message.id === streamingMessageIdRef.current}
                      colors={Colors}
                    />
                  ) : null}

                  {/* Approval gate: inline confirm card. Rendered when the
                      backend's pending_approval SSE event arrived with a
                      blocked destructive / external-write tool call. The
                      assistant's response will explain in prose; this
                      card gives a one-tap approve/cancel affordance. */}
                  {!message.isUser && message.pendingApproval && !message.approvalResolved ? (
                    <View
                      style={{
                        marginBottom: 8,
                        marginLeft: 4,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: message.pendingApproval.risk_level === 'external_write'
                          ? '#F59E0B'
                          : '#EF4444',
                        backgroundColor: message.pendingApproval.risk_level === 'external_write'
                          ? 'rgba(245, 158, 11, 0.08)'
                          : 'rgba(239, 68, 68, 0.08)',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                        {message.pendingApproval.risk_level === 'external_write' ? 'Confirm send' : 'Confirm action'}
                      </Text>
                      <Text style={{ fontSize: 14, color: Colors.primaryText, marginBottom: 10, lineHeight: 19 }} numberOfLines={4}>
                        {message.pendingApproval.action_summary}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setMessages(prev => prev.map(m => m.id === message.id ? { ...m, approvalResolved: 'cancel' } : m));
                            handleSend('No, cancel that.');
                          }}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 18,
                            backgroundColor: Colors.cardBackground,
                            borderWidth: 1,
                            borderColor: Colors.border,
                          }}
                        >
                          <Text style={{ color: Colors.primaryText, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setMessages(prev => prev.map(m => m.id === message.id ? { ...m, approvalResolved: 'approve' } : m));
                            handleSend('Yes, confirm. Go ahead.');
                          }}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 18,
                            backgroundColor: message.pendingApproval.risk_level === 'external_write' ? '#F59E0B' : '#EF4444',
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                            {message.pendingApproval.risk_level === 'external_write' ? 'Send it' : 'Confirm'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                  {!message.isUser && message.pendingApproval && message.approvalResolved ? (
                    <Text style={{ color: Colors.secondaryText, fontSize: 11, marginBottom: 6, marginLeft: 4, fontStyle: 'italic' }}>
                      {message.approvalResolved === 'approve' ? '✓ Confirmed' : '✗ Cancelled'}
                    </Text>
                  ) : null}
                  {/* PEV reasoning trail — inline log of what the agent is doing.
                      Renders above the bubble for assistant messages that went
                      through the Plan-Execute-Verify pipeline. */}
                  {!message.isUser && Array.isArray(message.pevTrail) && message.pevTrail.length > 0 && (
                    <View style={{
                      paddingVertical: 6, paddingHorizontal: 10,
                      marginBottom: 6, marginLeft: 4,
                      borderLeftWidth: 2, borderLeftColor: Colors.primaryBlue,
                      backgroundColor: 'rgba(30, 64, 175, 0.04)',
                      borderRadius: 4,
                    }}>
                      {message.pevTrail.map((entry, i) => (
                        <Text
                          key={`${entry.ts}-${i}`}
                          style={{
                            fontSize: 11,
                            color: Colors.secondaryText,
                            fontFamily: 'SpaceMono-Regular',
                            lineHeight: 15,
                          }}
                        >
                          {entry.label}
                        </Text>
                      ))}
                    </View>
                  )}
                  {message.text && message.text.trim() !== '' && (
                  <View>
            <TouchableOpacity
              activeOpacity={0.8}
              onLongPress={() => {
                setCopiedMessageId(prev => prev === message.id ? null : message.id);
              }}
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
                  selectable
                  style={[
                    styles.messageText,
                    { color: Colors.userMessageText },
                  ]}
                >
                  {typeof message.text === 'string' ? message.text : JSON.stringify(message.text)}
                </Text>
              ) : (
                <LinkifiedText
                  selectable
                  style={[
                    styles.messageText,
                    { color: Colors.primaryText },
                  ]}
                >
                  {typeof message.text === 'string' ? message.text : JSON.stringify(message.text)}
                </LinkifiedText>
              )}
                  </TouchableOpacity>
                  {copiedMessageId === message.id && (
                    <Animated.View
                      entering={FadeInDown.duration(150)}
                      exiting={FadeOutDown.duration(150)}
                      style={[
                        styles.copyBubble,
                        message.isUser ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.copyButton}
                        onPress={() => {
                          const textToCopy = typeof message.text === 'string' ? message.text : JSON.stringify(message.text);
                          Clipboard.setStringAsync(textToCopy);
                          setCopiedMessageId('copied-' + message.id);
                          setTimeout(() => setCopiedMessageId(null), 1500);
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color={Colors.primaryText} />
                        <Text style={[styles.copyButtonText, { color: Colors.primaryText }]}>Copy all</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                  {copiedMessageId === 'copied-' + message.id && (
                    <Animated.View
                      entering={FadeInDown.duration(150)}
                      exiting={FadeOutDown.duration(150)}
                      style={[
                        styles.copyBubble,
                        message.isUser ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
                      ]}
                    >
                      <View style={styles.copyButton}>
                        <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                        <Text style={[styles.copyButtonText, { color: '#34C759' }]}>Copied!</Text>
                      </View>
                    </Animated.View>
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
          )}
        />

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
            // Controlled text: parent owns per-session draft so switching
            // sessions shows each chat's own unsent message.
            value={draftValue}
            onChangeText={setDraftValue}
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
  emptyStateOverlay: {
    // Absolutely positioned so placement isn't affected by the inverted
    // FlatList below. Anchored to ~28% from the top so the greeting sits
    // comfortably above the screen center instead of drifting down toward
    // the floating input bar.
    position: 'absolute',
    top: '28%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    zIndex: 1,
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
