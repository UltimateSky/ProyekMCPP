import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const segments        = useSegments();
  const router          = useRouter();
  const navigationState = useRootNavigationState();   // ← kunci: tunggu navigation ready

  // ── Listen for auth state changes ────────────────────────────────────────
  useEffect(() => {
    // Ambil session awal
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Dengarkan perubahan auth (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Biometric Auth ───────────────────────────────────────────────────────
  useEffect(() => {
    const authenticate = async () => {
      if (session) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Financial Diary',
            fallbackLabel: 'Gunakan Passcode',
            cancelLabel: 'Batal'
          });
          if (result.success) {
            setIsAuthenticated(true);
          }
        } else {
          setIsAuthenticated(true); // No biometrics available, proceed
        }
      } else if (session === null) {
        setIsAuthenticated(false);
      }
    };
    
    if (session !== undefined) {
      authenticate();
    }
  }, [session]);

  // ── Redirect guard — tunggu sampai navigation & session keduanya siap ───
  useEffect(() => {
    // Jika navigation belum siap, tunggu dulu
    if (!navigationState?.key) return;
    // Jika session masih loading, tunggu dulu
    if (session === undefined) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Belum login & bukan di halaman auth → redirect ke login
      router.replace('/(auth)/login');
    } else if (session && isAuthenticated && inAuthGroup) {
      // Sudah login & terautentikasi & masih di halaman auth → redirect ke app
      router.replace('/(tabs)');
    }
  }, [session, isAuthenticated, segments, navigationState?.key]);

  // ── Splash / loading screen ───────────────────────────────────────────────
  if (session === undefined || (session && !isAuthenticated)) {
    return (
      <View style={styles.loading}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>FD</Text>
        </View>
        <ActivityIndicator size="large" color="#7a0400" style={{ marginTop: 24 }} />
        <Text style={styles.loadingText}>Financial Diary</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading:     { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', gap: 8 },
  logoBox:     { width: 80, height: 80, backgroundColor: '#7a0400', borderRadius: 24, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#7a0400', shadowOpacity: 0.4, shadowRadius: 16 },
  logoText:    { color: 'white', fontSize: 28, fontWeight: 'bold' },
  loadingText: { color: '#94a3b8', fontSize: 14, fontWeight: '500', marginTop: 8 },
});