import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  KeyboardAvoidingView, Platform, Alert, ScrollView, Dimensions 
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lock, User, Eye, EyeOff, ArrowRight, UserPlus, HelpCircle } from 'lucide-react-native';

export default function RootLayout() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const session = await AsyncStorage.getItem('@current_user');
      if (session) router.replace('/(tabs)');
      setIsReady(true);
    };
    checkSession();
  }, []);

  const handleAuth = async (type: 'login' | 'register') => {
    const userTrim = username.trim();
    const passTrim = password.trim();

    if (!userTrim || !passTrim) {
      Alert.alert("Perhatian", "Username dan Password wajib diisi");
      return;
    }

    try {
      const storedUsers = await AsyncStorage.getItem('@all_users');
      let users = storedUsers ? JSON.parse(storedUsers) : {};

      if (type === 'register') {
        if (users[userTrim]) {
          Alert.alert("Gagal", "Username sudah terdaftar.");
          return;
        }
        users[userTrim] = passTrim;
        await AsyncStorage.setItem('@all_users', JSON.stringify(users));
        await AsyncStorage.setItem(`@profile_${userTrim}`, JSON.stringify({ limit: 5000000 }));
        await AsyncStorage.setItem(`@tx_${userTrim}`, JSON.stringify([]));

        Alert.alert("Berhasil", "Akun dibuat! Silahkan Login.");
      } else {
        if (!users[userTrim] || users[userTrim] !== passTrim) {
          Alert.alert("Error", "Username atau Password salah!");
          return;
        }
        await AsyncStorage.setItem('@current_user', userTrim);
        router.replace('/(tabs)');
      }
    } catch (e) {
      Alert.alert("Error", "Gagal mengakses data");
    }
  };

  const handleForgotPassword = async () => {
    if (!username.trim()) {
      Alert.alert("Info", "Masukkan username Anda terlebih dahulu di kolom input.");
      return;
    }
    try {
      const storedUsers = await AsyncStorage.getItem('@all_users');
      let users = storedUsers ? JSON.parse(storedUsers) : {};
      if (users[username.trim()]) {
        Alert.alert("Password Recovery", `Password untuk user "${username.trim()}" adalah: ${users[username.trim()]}`);
      } else {
        Alert.alert("Error", "Username tidak ditemukan.");
      }
    } catch (e) {
      Alert.alert("Error", "Gagal memulihkan password.");
    }
  };

  if (!isReady) return null;

  return (
    <View style={styles.container}>
      {/* Circle Decorator dipindah ke paling atas agar tidak menutupi tombol */}
      <View style={styles.circleDecorator} pointerEvents="none" />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <View style={styles.logoBox}>
              <Text style={styles.logoTxt}>FD</Text>
            </View>
            <Text style={styles.welcomeTxt}>Financial Diary</Text>
            <Text style={styles.subTxt}>Framework Secured by Neovatech</Text>
          </View>

          <View style={styles.card}>
            {/* Input Username */}
            <View style={styles.inputWrapper}>
              <User size={20} color="#64748b" />
              <TextInput 
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            {/* Input Password */}
            <View style={styles.inputWrapper}>
              <Lock size={20} color="#64748b" />
              <TextInput 
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
              </TouchableOpacity>
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity 
              onPress={handleForgotPassword} 
              style={styles.forgotPassBtn}
            >
              <Text style={styles.forgotPassText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.loginBtn} 
              onPress={() => handleAuth('login')}
            >
              <Text style={styles.loginBtnText}>Login Account</Text>
              <ArrowRight size={20} color="white" />
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.orTxt}>OR</Text>
              <View style={styles.line} />
            </View>

            {/* REGISTER BUTTON - Pastikan ini di luar divider dan memiliki padding cukup */}
            <TouchableOpacity 
              style={styles.registerBtn} 
              onPress={() => handleAuth('register')}
              activeOpacity={0.7}
            >
              <UserPlus size={18} color="#7a0400" />
              <Text style={styles.registerBtnText}>Create New Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  circleDecorator: { position: 'absolute', top: -100, right: -50, width: 300, height: 300, borderRadius: 150, backgroundColor: '#7a0400', opacity: 0.1, zIndex: -1 },
  scrollContent: { padding: 30, flexGrow: 1, justifyContent: 'center' },
  headerSection: { marginBottom: 35 },
  logoBox: { width: 60, height: 60, backgroundColor: '#7a0400', borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 5 },
  logoTxt: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  welcomeTxt: { fontSize: 32, fontWeight: 'bold', color: '#1e293b' },
  subTxt: { fontSize: 16, color: '#64748b', marginTop: 5 },
  card: { backgroundColor: 'white', borderRadius: 28, padding: 25, elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 16, paddingHorizontal: 18, marginBottom: 15, height: 60 },
  input: { flex: 1, marginLeft: 12, color: '#1e293b', fontSize: 16, fontWeight: '500' },
  forgotPassBtn: { alignSelf: 'flex-end', marginBottom: 20, marginRight: 5 },
  forgotPassText: { color: '#7a0400', fontSize: 13, fontWeight: '600' },
  loginBtn: { backgroundColor: '#7a0400', height: 60, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, elevation: 3 },
  loginBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  orTxt: { marginHorizontal: 10, color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  registerBtn: { height: 60, borderRadius: 16, borderWidth: 2, borderColor: '#7a0400', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: 'transparent' },
  registerBtnText: { color: '#7a0400', fontSize: 16, fontWeight: 'bold' }
});