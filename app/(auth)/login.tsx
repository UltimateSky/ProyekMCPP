import React, { useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ScrollView,
  ActivityIndicator, Animated
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Lock, Mail, Eye, EyeOff, ArrowRight, UserPlus, User, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

type Mode = 'login' | 'register' | 'forgot' | 'otp';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  // ─── Auth handler ──────────────────────────────────────────────────────
  const handleAuth = async () => {
    animatePress();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const emailTrim = email.trim();
    const passTrim = password.trim();

    if (mode === 'forgot') {
      if (!emailTrim) { Alert.alert('Perhatian', 'Masukkan alamat email Anda.'); return; }
      setLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(emailTrim);
        if (error) throw error;
        setMode('otp');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Gagal mengirim email reset.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'otp') {
      if (!otp.trim() || !newPassword.trim() || !confirmPassword.trim()) {
        Alert.alert('Perhatian', 'OTP, Password baru, dan Konfirmasi password wajib diisi.'); return;
      }
      if (newPassword.trim().length < 6) {
        Alert.alert('Perhatian', 'Password minimal 6 karakter.'); return;
      }
      if (newPassword.trim() !== confirmPassword.trim()) {
        Alert.alert('Perhatian', 'Password baru dan konfirmasi tidak cocok.'); return;
      }
      setLoading(true);
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: emailTrim,
          token: otp.trim(),
          type: 'recovery',
        });
        if (error) throw error;

        // OTP Validated, update user password
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword.trim(),
        });
        if (updateError) throw updateError;

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Berhasil! 🎉', 'Password Anda berhasil diubah. Silakan login.', [
          { text: 'Login', onPress: () => { setMode('login'); setOtp(''); setNewPassword(''); setConfirmPassword(''); } }
        ]);
        // Optional: sign out if you want them to log in again manually
        await supabase.auth.signOut();
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Gagal memverifikasi OTP atau mengubah password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!emailTrim || !passTrim) {
      Alert.alert('Perhatian', 'Email dan Password wajib diisi.'); return;
    }
    if (passTrim.length < 6) {
      Alert.alert('Perhatian', 'Password minimal 6 karakter.'); return;
    }
    if (mode === 'register' && !fullName.trim()) {
      Alert.alert('Perhatian', 'Nama lengkap wajib diisi.'); return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrim,
          password: passTrim,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;

        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: fullName.trim() || emailTrim.split('@')[0],
            monthly_limit: 5000000,
            updated_at: new Date().toISOString(),
          });
        }

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Berhasil! 🎉',
          'Akun berhasil dibuat!\n\nJika email verifikasi diperlukan, silakan cek inbox Anda lalu login.',
          [{ text: 'Login Sekarang', onPress: () => { setMode('login'); setFullName(''); } }]
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailTrim,
          password: passTrim,
        });
        if (error) throw error;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Root layout handles redirect via onAuthStateChange
      }
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Friendlier error messages
      const msg = err.message || '';
      let friendlyMsg = 'Terjadi kesalahan. Coba lagi.';
      if (msg.includes('Invalid login credentials')) friendlyMsg = 'Email atau password salah.';
      else if (msg.includes('Email not confirmed')) friendlyMsg = 'Email belum diverifikasi. Silakan cek inbox Anda.';
      else if (msg.includes('User already registered')) friendlyMsg = 'Email sudah terdaftar. Silakan login.';
      else if (msg.includes('Password should be at least')) friendlyMsg = 'Password terlalu pendek (minimal 6 karakter).';
      else friendlyMsg = msg;
      Alert.alert('Gagal', friendlyMsg);
    } finally {
      setLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      <View style={styles.bgCircle1} pointerEvents="none" />
      <View style={styles.bgCircle2} pointerEvents="none" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER */}
          <View style={styles.headerSection}>
            <View style={styles.logoBox}>
              <Text style={styles.logoTxt}>FD</Text>
            </View>
            <Text style={styles.welcomeTxt}>Financial Diary</Text>
            <Text style={styles.subTxt}>
              {mode === 'login' ? 'Masuk ke akun Anda' :
                mode === 'register' ? 'Buat akun baru gratis' :
                  mode === 'otp' ? 'Masukkan kode OTP dan password baru' :
                    'Reset kata sandi'}
            </Text>
          </View>

          {/* CARD FORM */}
          <View style={styles.card}>

            {/* Tab Mode (only for login/register) */}
            {(mode === 'login' || mode === 'register') && (
              <View style={styles.modeSwitch}>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
                  onPress={() => setMode('login')}
                >
                  <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>Login</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
                  onPress={() => setMode('register')}
                >
                  <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>Register</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Back button for forgot/otp */}
            {(mode === 'forgot' || mode === 'otp') && (
              <TouchableOpacity style={styles.backRow} onPress={() => setMode('login')}>
                <ChevronLeft size={18} color="#7a0400" />
                <Text style={styles.backRowText}>Kembali ke Login</Text>
              </TouchableOpacity>
            )}

            {/* Full Name (register only) */}
            {mode === 'register' && (
              <View style={styles.inputWrapper}>
                <User size={20} color="#64748b" />
                <TextInput
                  style={styles.input}
                  placeholder="Nama Lengkap"
                  placeholderTextColor="#94a3b8"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            )}

            {/* Email */}
            {mode !== 'otp' && (
              <View style={styles.inputWrapper}>
                <Mail size={20} color="#64748b" />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            )}

            {/* OTP Inputs */}
            {mode === 'otp' && (
              <>
                <View style={styles.inputWrapper}>
                  <Mail size={20} color="#64748b" />
                  <TextInput
                    style={styles.input}
                    placeholder="Kode OTP 6 Digit"
                    placeholderTextColor="#94a3b8"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Lock size={20} color="#64748b" />
                  <TextInput
                    style={styles.input}
                    placeholder="Password Baru (min. 6 karakter)"
                    placeholderTextColor="#94a3b8"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
                  </TouchableOpacity>
                </View>
                <View style={styles.inputWrapper}>
                  <Lock size={20} color="#64748b" />
                  <TextInput
                    style={styles.input}
                    placeholder="Konfirmasi Password Baru"
                    placeholderTextColor="#94a3b8"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Password (for login/register) */}
            {(mode === 'login' || mode === 'register') && (
              <View style={styles.inputWrapper}>
                <Lock size={20} color="#64748b" />
                <TextInput
                  style={styles.input}
                  placeholder="Password (min. 6 karakter)"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
                </TouchableOpacity>
              </View>
            )}

            {/* Forgot password link */}
            {mode === 'login' && (
              <TouchableOpacity onPress={() => setMode('forgot')} style={styles.forgotRow}>
                <Text style={styles.forgotText}>Lupa kata sandi?</Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={[styles.actionBtn, loading && { opacity: 0.7 }]}
                onPress={handleAuth}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    {mode === 'login' && (
                      <>
                        <Text style={styles.actionBtnText}>Masuk</Text>
                        <ArrowRight size={20} color="white" />
                      </>
                    )}
                    {mode === 'register' && (
                      <>
                        <UserPlus size={20} color="white" />
                        <Text style={styles.actionBtnText}>Buat Akun</Text>
                      </>
                    )}
                    {mode === 'forgot' && (
                      <>
                        <Mail size={20} color="white" />
                        <Text style={styles.actionBtnText}>Kirim Kode OTP</Text>
                      </>
                    )}
                    {mode === 'otp' && (
                      <>
                        <Lock size={20} color="white" />
                        <Text style={styles.actionBtnText}>Ganti Password</Text>
                      </>
                    )}
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Helper text */}
            <Text style={styles.noteText}>
              {mode === 'login'
                ? 'Belum punya akun? Tekan "Register" di atas.'
                : mode === 'register'
                  ? 'Sudah punya akun? Tekan "Login" di atas.'
                  : mode === 'otp'
                    ? 'Cek email Anda untuk kode OTP.'
                    : 'Masukkan email terdaftar untuk menerima kode OTP.'}
            </Text>
          </View>

          <Text style={styles.footerText}>Financial Diary v1.0 • Powered by Supabase</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  bgCircle1: { position: 'absolute', top: -100, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: '#7a0400', opacity: 0.07 },
  bgCircle2: { position: 'absolute', bottom: -120, left: -100, width: 350, height: 350, borderRadius: 175, backgroundColor: '#7a0400', opacity: 0.05 },
  scrollContent: { padding: 28, flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },

  headerSection: { marginBottom: 32, alignItems: 'flex-start' },
  logoBox: { width: 64, height: 64, backgroundColor: '#7a0400', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 8, shadowColor: '#7a0400', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  logoTxt: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  welcomeTxt: { fontSize: 30, fontWeight: 'bold', color: '#1e293b', letterSpacing: -0.5 },
  subTxt: { fontSize: 15, color: '#64748b', marginTop: 6 },

  card: { backgroundColor: 'white', borderRadius: 28, padding: 24, elevation: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 16, marginBottom: 24, padding: 4 },
  modeBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  modeBtnActive: { backgroundColor: '#7a0400', elevation: 3 },
  modeBtnText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  modeBtnTextActive: { color: 'white' },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  backRowText: { color: '#7a0400', fontWeight: '600', fontSize: 14 },

  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, paddingHorizontal: 18, marginBottom: 12, height: 60, borderWidth: 1, borderColor: '#e2e8f0' },
  input: { flex: 1, marginLeft: 12, color: '#1e293b', fontSize: 15, fontWeight: '500' },

  forgotRow: { alignItems: 'flex-end', marginBottom: 16, marginTop: -4 },
  forgotText: { color: '#7a0400', fontSize: 13, fontWeight: '600' },

  actionBtn: { backgroundColor: '#7a0400', height: 60, borderRadius: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, elevation: 4, shadowColor: '#7a0400', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  actionBtnText: { color: 'white', fontSize: 17, fontWeight: 'bold' },
  noteText: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 16 },
  footerText: { textAlign: 'center', color: '#cbd5e1', fontSize: 11, marginTop: 28 },

  // Success state
  successBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successIconBox: { width: 88, height: 88, backgroundColor: '#fee2e2', borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  successTitle: { fontSize: 26, fontWeight: 'bold', color: '#1e293b', marginBottom: 14 },
  successDesc: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  backToLoginBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fee2e2', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  backToLoginText: { color: '#7a0400', fontWeight: '700', fontSize: 15 },
});