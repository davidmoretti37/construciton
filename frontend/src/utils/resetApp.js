import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

/**
 * Completely reset the app - sign out and clear all local data
 * Use this for testing the full flow from scratch
 */
export const resetApp = async () => {
  try {
    console.log('Resetting app...');

    // Sign out from Supabase
    await supabase.auth.signOut();
    console.log('Signed out from Supabase');

    // Clear all AsyncStorage data
    await AsyncStorage.clear();
    console.log('Cleared AsyncStorage');

    console.log('App reset complete! Please reload the app.');
    return true;
  } catch (error) {
    console.error('Error resetting app:', error);
    return false;
  }
};
