import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

/**
 * Completely reset the app - sign out and clear all local data
 * Use this for testing the full flow from scratch
 */
export const resetApp = async () => {
  try {
    // Sign out from Supabase
    await supabase.auth.signOut();

    // Clear all AsyncStorage data
    await AsyncStorage.clear();

    return true;
  } catch (error) {
    console.error('Error resetting app:', error);
    return false;
  }
};
