/**
 * NetworkContext — Global network state provider
 * Detects online/offline and triggers sync when reconnecting.
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { processQueue, getQueueSize } from '../services/offlineQueue';

const NetworkContext = createContext({ isOnline: true });

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const wasOfflineRef = useRef(false);
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);

      setIsOnline(online);

      if (!online) {
        wasOfflineRef.current = true;
        setShowBanner(true);
        Animated.timing(bannerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      } else {
        // Coming back online
        Animated.timing(bannerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          setShowBanner(false);
        });

        // If we were offline, sync queued actions
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          syncQueuedActions();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const syncQueuedActions = async () => {
    const queueSize = getQueueSize();
    if (queueSize === 0) return;

    setSyncMessage(`Syncing ${queueSize} action${queueSize > 1 ? 's' : ''}...`);

    try {
      const result = await processQueue();
      if (result.processed > 0) {
        setSyncMessage(`Synced ${result.processed} action${result.processed > 1 ? 's' : ''}`);
      }
    } catch (e) {
      setSyncMessage('Sync failed — will retry');
    }

    setTimeout(() => setSyncMessage(null), 3000);
  };

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}

      {/* Offline Banner */}
      {showBanner && (
        <Animated.View style={[styles.offlineBanner, { opacity: bannerOpacity }]}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>No Internet Connection</Text>
        </Animated.View>
      )}

      {/* Sync Message */}
      {syncMessage && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>{syncMessage}</Text>
        </View>
      )}
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  offlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncBanner: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  syncText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
