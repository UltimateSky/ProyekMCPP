import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, Modal, Image
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Edit3, Check, X, LogOut, Mail, Shield,
  TrendingUp, TrendingDown, CreditCard, Bell, ChevronRight,
  Lock, Download, HelpCircle, Trash2, Eye, EyeOff
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import {
  getTransactions, upsertProfile, getCurrentMonth, type Transaction
} from '../../services/transactionService';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function ProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [editName, setEditName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState(5000000);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);

  // Modal Ganti Password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Avatar state
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // ── Init — load user + profile sekaligus ─────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email || '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, monthly_limit')
        .eq('id', user.id)
        .single();

      const name = profile?.full_name || user.email?.split('@')[0] || 'User';
      setFullName(name);
      setEditName(name);
      setMonthlyLimit(Number(profile?.monthly_limit) || 5000000);
      
      const savedAvatar = await AsyncStorage.getItem(`avatar_${user.id}`);
      if (savedAvatar) {
        setAvatarUri(savedAvatar);
      }
    };
    init();
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getTransactions(userId);
      setTransactions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const currentMonth = getCurrentMonth();
  const currentTxs = transactions.filter(t => t.month === currentMonth);
  const totalSpend = currentTxs.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);
  const totalEarn = currentTxs.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
  const totalTxAll = transactions.length;

  // ── Save name ─────────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!userId || !editName.trim()) return;
    setSavingName(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await upsertProfile(userId, { full_name: editName.trim() });
      setFullName(editName.trim());
      setIsEditingName(false);
      Alert.alert('Berhasil ✅', 'Nama berhasil diperbarui.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan.');
    } finally {
      setSavingName(false);
    }
  };

  // ── Change Avatar ────────────────────────────────────────────────────────
  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Izin Ditolak', 'Dibutuhkan izin kamera untuk mengambil foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setAvatarUri(uri);
        if (userId) {
          await AsyncStorage.setItem(`avatar_${userId}`, uri);
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      Alert.alert('Error', 'Gagal mengambil foto.');
    }
  };

  // ── Change Password ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (newPassword.trim().length < 6) {
      Alert.alert('Perhatian', 'Password minimal 6 karakter.');
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (error) throw error;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Berhasil! 🎉', 'Password berhasil diubah.');
      setShowPasswordModal(false);
      setNewPassword('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal mengubah password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Export Data (CSV) ──────────────────────────────────────────────────────
  const handleExportData = async () => {
    if (transactions.length === 0) {
      Alert.alert('Info', 'Belum ada transaksi untuk diekspor.');
      return;
    }
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const header = 'Tanggal,Bulan,Kategori,Tipe,Judul,Nominal\n';
      const rows = transactions.map(t =>
        `${new Date(t.date || '').toLocaleDateString('id-ID')},${t.month},${t.category},${t.type},"${(t.title || '').replace(/"/g, '""')}",${t.amount}`
      ).join('\n');

      const csv = header + rows;
      const fileUri = `${FileSystem.documentDirectory}FinancialDiary_Transactions.csv`;

      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Fitur berbagi tidak tersedia di perangkat ini.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Gagal mengekspor data.');
    }
  };

  // ── Clear All Data ─────────────────────────────────────────────────────────
  const handleClearData = () => {
    Alert.alert('Peringatan Keras ⚠️', 'Apakah Anda yakin ingin menghapus SEMUA data transaksi? Tindakan ini tidak dapat dibatalkan!', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus Semua',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const { error } = await supabase.from('transactions').delete().eq('user_id', userId);
            if (error) throw error;
            setTransactions([]);
            Alert.alert('Berhasil', 'Semua data transaksi telah dihapus.');
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Gagal menghapus data.');
          }
        }
      }
    ]);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Keluar', 'Apakah Anda yakin ingin logout?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // signOut() akan trigger onAuthStateChange di root layout
          // yang kemudian redirect ke /(auth)/login secara otomatis
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const initials = fullName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() || '')
    .join('');

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Text style={styles.headerSub}>Kelola akun Anda</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* AVATAR CARD */}
        <View style={styles.avatarCard}>
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={{ width: 88, height: 88, borderRadius: 44 }} />
              ) : (
                <Text style={styles.avatarText}>{initials || 'U'}</Text>
              )}
              <View style={styles.cameraIconBadge}>
                <Edit3 size={12} color="white" />
              </View>
            </View>
          </TouchableOpacity>

          {isEditingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={styles.nameInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                placeholder="Nama Lengkap"
                placeholderTextColor="#94a3b8"
              />
              {savingName ? (
                <ActivityIndicator color="#16a34a" size="small" />
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={saveName} style={[styles.iconBtn, { backgroundColor: '#dcfce7' }]}>
                    <Check size={18} color="#16a34a" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setIsEditingName(false); setEditName(fullName); }} style={[styles.iconBtn, { backgroundColor: '#f1f5f9' }]}>
                    <X size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.nameRow} onPress={() => {
              setIsEditingName(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}>
              <Text style={styles.avatarName}>{fullName}</Text>
              <Edit3 size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}

          <View style={styles.emailRow}>
            <Mail size={14} color="#94a3b8" />
            <Text style={styles.emailText}>{email}</Text>
          </View>
          <View style={[styles.badgeRow]}>
            <Shield size={13} color="#7a0400" />
            <Text style={styles.badgeText}>Akun Terverifikasi</Text>
          </View>
        </View>

        {/* STATS ROW */}
        {!loading && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <TrendingUp size={20} color="#16a34a" />
              <Text style={styles.statValue}>{fmt(totalEarn)}</Text>
              <Text style={styles.statLabel}>Income Bulan Ini</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingDown size={20} color="#7a0400" />
              <Text style={styles.statValue}>{fmt(totalSpend)}</Text>
              <Text style={styles.statLabel}>Expense Bulan Ini</Text>
            </View>
            <View style={styles.statCard}>
              <CreditCard size={20} color="#2563eb" />
              <Text style={styles.statValue}>{totalTxAll}</Text>
              <Text style={styles.statLabel}>Total Transaksi</Text>
            </View>
          </View>
        )}

        {/* SETTINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pengaturan</Text>

          <View style={styles.settingCard}>
            {/* Notif toggle */}
            <View style={styles.settingRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.settingIcon, { backgroundColor: '#fee2e2' }]}>
                  <Bell size={18} color="#7a0400" />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Notifikasi Budget</Text>
                  <Text style={styles.settingDesc}>Alert saat budget hampir habis</Text>
                </View>
              </View>
              <Switch
                value={notifEnabled}
                onValueChange={(v) => {
                  setNotifEnabled(v);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: '#e2e8f0', true: '#7a0400' }}
                thumbColor="white"
              />
            </View>

            <View style={styles.divider} />

            {/* Monthly limit info */}
            <View style={styles.settingRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.settingIcon, { backgroundColor: '#f0fdf4' }]}>
                  <CreditCard size={18} color="#16a34a" />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Budget Bulanan</Text>
                  <Text style={styles.settingDesc}>{fmt(monthlyLimit)}</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#cbd5e1" />
            </View>

            <View style={styles.divider} />

            {/* Change Password */}
            <TouchableOpacity style={styles.settingRow} onPress={() => setShowPasswordModal(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.settingIcon, { backgroundColor: '#f1f5f9' }]}>
                  <Lock size={18} color="#64748b" />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Ganti Password</Text>
                  <Text style={styles.settingDesc}>Perbarui kata sandi akun</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#cbd5e1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ADVANCED */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lanjutan</Text>
          <View style={styles.settingCard}>
            <TouchableOpacity style={styles.settingRow} onPress={handleExportData}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.settingIcon, { backgroundColor: '#eff6ff' }]}>
                  <Download size={18} color="#2563eb" />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Export Data</Text>
                  <Text style={styles.settingDesc}>Unduh CSV riwayat transaksi</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#cbd5e1" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Pusat Bantuan', 'Hubungi kami di support@financialdiary.com')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.settingIcon, { backgroundColor: '#fefce8' }]}>
                  <HelpCircle size={18} color="#eab308" />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Pusat Bantuan</Text>
                  <Text style={styles.settingDesc}>FAQ & Layanan Pelanggan</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#cbd5e1" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRow} onPress={handleClearData}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.settingIcon, { backgroundColor: '#fee2e2' }]}>
                  <Trash2 size={18} color="#dc2626" />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: '#dc2626' }]}>Hapus Semua Data</Text>
                  <Text style={styles.settingDesc}>Aksi tidak dapat dibatalkan</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ACCOUNT INFO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informasi Akun</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{email}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nama</Text>
              <Text style={styles.infoValue}>{fullName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Member Sejak</Text>
              <Text style={styles.infoValue}>2025</Text>
            </View>
          </View>
        </View>

        {/* LOGOUT */}
        <View style={[styles.section, { paddingTop: 0 }]}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <LogOut size={20} color="#dc2626" />
            <Text style={styles.logoutText}>Keluar dari Akun</Text>
          </TouchableOpacity>
        </View>

        {/* MODAL GANTI PASSWORD */}
        <Modal visible={showPasswordModal} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Ganti Password</Text>
              <Text style={styles.modalSub}>Masukkan password baru untuk akun Anda.</Text>

              <View style={styles.inputWrapper}>
                <Lock size={20} color="#64748b" />
                <TextInput
                  style={styles.modalInput}
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

              <View style={styles.modalActionRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowPasswordModal(false); setNewPassword(''); }}>
                  <Text style={styles.modalCancelBtnText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, changingPassword && { opacity: 0.7 }]} onPress={handleChangePassword} disabled={changingPassword}>
                  {changingPassword ? <ActivityIndicator color="white" /> : <Text style={styles.modalSaveBtnText}>Simpan</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Text style={styles.footer}>Financial Diary v1.0 • Powered by Supabase</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#7a0400', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#ffcdd2', fontSize: 13, marginTop: 4 },

  avatarCard: { backgroundColor: 'white', margin: 16, borderRadius: 24, padding: 24, alignItems: 'center', elevation: 4 },
  avatarCircle: { width: 88, height: 88, backgroundColor: '#7a0400', borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 16, elevation: 6, shadowColor: '#7a0400', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1e293b', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },
  avatarText: { color: 'white', fontSize: 30, fontWeight: 'bold' },
  avatarName: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, width: '100%' },
  nameInput: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1e293b', borderBottomWidth: 2, borderColor: '#7a0400', paddingVertical: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  emailText: { color: '#64748b', fontSize: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff1f1', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { color: '#7a0400', fontSize: 12, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 4 },
  statCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, elevation: 2 },
  statValue: { fontSize: 12, fontWeight: 'bold', color: '#1e293b', marginTop: 4, textAlign: 'center' },
  statLabel: { fontSize: 10, color: '#94a3b8', textAlign: 'center', fontWeight: '500' },

  section: { padding: 16, paddingBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  settingCard: { backgroundColor: 'white', borderRadius: 20, overflow: 'hidden', elevation: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  settingDesc: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#f8fafc', marginHorizontal: 16 },

  infoCard: { backgroundColor: 'white', borderRadius: 20, overflow: 'hidden', elevation: 2 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  infoLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  infoValue: { fontSize: 13, color: '#1e293b', fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff1f1', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#fecaca' },
  logoutText: { color: '#dc2626', fontWeight: 'bold', fontSize: 16 },

  footer: { textAlign: 'center', color: '#cbd5e1', fontSize: 11, marginTop: 12, paddingBottom: 20 },

  // Modal Styles
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24 },
  modalInput: { flex: 1, marginLeft: 12, color: '#1e293b', fontSize: 15 },
  modalActionRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 14, backgroundColor: '#f1f5f9' },
  modalCancelBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 15 },
  modalSaveBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 14, backgroundColor: '#7a0400' },
  modalSaveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});
