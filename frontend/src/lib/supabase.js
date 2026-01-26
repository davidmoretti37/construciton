import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY } from '@env';

const supabaseUrl = EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Check if Supabase credentials are configured
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ SUPABASE NOT CONFIGURED!');
  console.error('❌ Create a .env file with:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL=your_project_url');
  console.error('   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key');
  console.error('❌ Get these from: Supabase Dashboard > Settings > API');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
