import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  SafeAreaView,
  Easing,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.75; // 75% of screen width
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { chatHistoryService } from '../services/chatHistoryService';

// Simple time ago formatter
const formatTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' year' + (Math.floor(interval) > 1 ? 's' : '') + ' ago';

  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' month' + (Math.floor(interval) > 1 ? 's' : '') + ' ago';

  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' day' + (Math.floor(interval) > 1 ? 's' : '') + ' ago';

  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hour' + (Math.floor(interval) > 1 ? 's' : '') + ' ago';

  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minute' + (Math.floor(interval) > 1 ? 's' : '') + ' ago';

  return Math.floor(seconds) + ' second' + (Math.floor(seconds) !== 1 ? 's' : '') + ' ago';
};

export default function ChatHistorySidebar({
  visible,
  onClose,
  currentSessionId,
  onSelectSession,
  onNewChat
}) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Show modal first, then animate in
      setModalVisible(true);
      loadSessions();

      slideAnim.setValue(-SIDEBAR_WIDTH);
      fadeAnim.setValue(0);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
        ]).start();
      });
    } else if (modalVisible) {
      // Animate out, THEN hide modal
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_WIDTH,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [visible]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await chatHistoryService.getSessions();
      setSessions(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
      Alert.alert('Error', 'Failed to load chat history');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatHistoryService.deleteSession(sessionId);
              setSessions(sessions.filter(s => s.id !== sessionId));

              // If deleted current session, create new one
              if (sessionId === currentSessionId) {
                onNewChat();
              }
            } catch (error) {
              console.error('Error deleting session:', error);
              Alert.alert('Error', 'Failed to delete chat');
            }
          }
        }
      ]
    );
  };

  const renderSession = ({ item }) => {
    const isActive = item.id === currentSessionId;
    const timeAgo = formatTimeAgo(item.last_message_at);

    return (
      <TouchableOpacity
        style={[styles.sessionItem, isActive && styles.sessionItemActive]}
        onPress={() => {
          onSelectSession(item.id);
          onClose();
        }}
      >
        <View style={styles.sessionContent}>
          <Ionicons
            name="chatbubble-outline"
            size={20}
            color={isActive ? Colors.primaryBlue : Colors.textSecondary}
          />
          <View style={styles.sessionText}>
            <Text style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.sessionTime}>{timeAgo}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => handleDeleteSession(item.id)}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={modalVisible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <SafeAreaView style={styles.safeArea}>
            {/* Header with integrated New Chat button */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chat History</Text>
              </View>
              <TouchableOpacity
                style={styles.newChatButton}
                onPress={() => {
                  onNewChat();
                  onClose();
                }}
              >
                <Ionicons name="add" size={22} color={Colors.primaryBlue} />
              </TouchableOpacity>
            </View>

        {/* Sessions List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No chat history yet</Text>
            <Text style={styles.emptySubtext}>Start a new conversation to begin</Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            renderItem={renderSession}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (Colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      flexDirection: 'row',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    backdropTouchable: {
      flex: 1,
    },
    container: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: Colors.background,
      shadowColor: '#000',
      shadowOffset: {
        width: 2,
        height: 0,
      },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      backgroundColor: Colors.background,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    closeButton: {
      padding: Spacing.xs,
      marginRight: Spacing.xs,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: '600',
      color: Colors.text,
    },
    newChatButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.card,
      borderWidth: 1.5,
      borderColor: Colors.primaryBlue,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: Colors.primaryBlue,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 3,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: '600',
      color: Colors.text,
      marginTop: Spacing.md,
    },
    emptySubtext: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
    listContent: {
      paddingTop: Spacing.md,
      paddingBottom: Spacing.xl,
    },
    sessionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      marginBottom: Spacing.xs,
      marginHorizontal: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    sessionItemActive: {
      backgroundColor: Colors.primaryBlue + '15',
      borderColor: Colors.primaryBlue,
      borderWidth: 1.5,
      shadowColor: Colors.primaryBlue,
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    sessionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    sessionText: {
      marginLeft: Spacing.sm,
      flex: 1,
    },
    sessionTitle: {
      fontSize: FontSizes.md,
      fontWeight: '500',
      color: Colors.text,
    },
    sessionTitleActive: {
      color: Colors.primaryBlue,
      fontWeight: '600',
    },
    sessionTime: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    deleteButton: {
      padding: Spacing.xs,
    },
  });
