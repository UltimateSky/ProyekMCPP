import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL     || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// AsyncStorage hanya tersedia di native (Android/iOS), bukan di Web
// Jika dijalankan di Web, gunakan localStorage bawaan browser
const getAuthStorage = () => {
  if (Platform.OS === 'web') {
    // Web: Supabase akan pakai localStorage secara default
    return undefined;
  }
  // Native: gunakan AsyncStorage untuk persist session
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  return AsyncStorage;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          getAuthStorage(),
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

