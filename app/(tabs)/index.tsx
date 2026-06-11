import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TextInput,
  TouchableOpacity, TouchableWithoutFeedback, Modal,
  Platform, Alert, ActivityIndicator, Animated
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { G, Circle } from 'react-native-svg';
import {
  Plus, X, ChevronRight, Landmark, ShoppingBag, Utensils,
  MoreHorizontal, Banknote, FileText, ChevronDown, LogOut,
  Trash2, PieChart, Sparkles, MapPin
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { parseTransactionFromText } from '../../services/aiService';
import { supabase } from '../../lib/supabase';
import {
  getTransactions,
  addTransaction,
  deleteTransaction,
  subscribeToTransactions,
  getCurrentMonth,
  getLast12Months,
  type Transaction,
} from '../../services/transactionService';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── CATEGORY CONFIG ──────────────────────────────────────────────────────────
const CAT_CONFIG: Record<string, Record<string, { label: string; color: string; icon: any }>> = {
  spending: {
    transfer: { label: 'Account Transfer', color: '#9c4fb7', icon: Landmark },
    shopping: { label: 'Shopping', color: '#d66060', icon: ShoppingBag },
    food: { label: 'Food & Beverage', color: '#e9bc4d', icon: Utensils },
    other: { label: 'Other Categories', color: '#7a0400', icon: MoreHorizontal },
  },
  earning: {
    transfer: { label: 'Account Transfer', color: '#fbb117', icon: Landmark },
    deposit: { label: 'Cash Deposit', color: '#31745d', icon: Banknote },
    salary: { label: 'Salary', color: '#2563eb', icon: FileText },
    other: { label: 'Other Categories', color: '#7a0400', icon: MoreHorizontal },
  },
};

const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function CashflowScreen() {
  const [tab, setTab] = useState<'spending' | 'earning'>('spending');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [monthModal, setMonthModal] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCat, setSelectedCat] = useState('transfer');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const txRef = useRef<Transaction[]>([]);

  const [inputMode, setInputMode] = useState<'manual' | 'ai'>('manual');
  const [aiText, setAiText] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const months = getLast12Months();

  // ── Init user session ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        supabase.from('profiles').select('full_name').eq('id', user.id).single()
          .then(({ data }) => {
            setUserName(data?.full_name || user.email?.split('@')[0] || 'User');
          });
      }
    });
  }, []);

  // ── Shake to Undo & Location Permissions ─────────────────────────────────
  const isAlerting = useRef(false);
  useEffect(() => {
    (async () => {
      await Location.requestForegroundPermissionsAsync();
    })();

    Accelerometer.setUpdateInterval(400);
    const subscription = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      if (acceleration > 1.8 && !isAlerting.current && txRef.current.length > 0) {
        isAlerting.current = true;
        const latestTx = txRef.current[0];
        Alert.alert(
          'Shake to Undo!',
          `Batalkan transaksi terakhir: "${latestTx.title}"?`,
          [
            { text: 'Tidak', style: 'cancel', onPress: () => { isAlerting.current = false; } },
            {
              text: 'Batalkan', style: 'destructive',
              onPress: () => {
                isAlerting.current = false;
                handleDelete(latestTx);
              }
            }
          ]
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // ── Load transactions ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await getTransactions(userId, selectedMonth);
            setTransactions(data);
      txRef.current = data;
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (e) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedMonth]);

  useFocusEffect(useCallback(() => {
    fadeAnim.setValue(0);
    loadData();
  }, [loadData]));

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    channelRef.current = subscribeToTransactions(userId, (data) => {
            setTransactions(data);
      txRef.current = data;
    });
    return () => { channelRef.current?.unsubscribe(); };
  }, [userId]);

  // ── Save new transaction ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim() || !amount.trim()) {
      Alert.alert('Error', 'Mohon isi semua data.'); return;
    }
    if (!userId) {
      Alert.alert('Error', 'Session tidak ditemukan.'); return;
    }
    setSaving(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newTx: Transaction = {
        user_id: userId,
        title: title.trim(),
        amount: parseFloat(amount.replace(/[^0-9.]/g, '')) || 0,
        category: selectedCat,
        type: tab,
        month: selectedMonth,
        date: new Date().toISOString(),
      };
      const saved = await addTransaction(newTx);
            setTransactions(prev => {
        const next = [saved, ...prev];
        txRef.current = next;
        return next;
      });
      setModalVisible(false);
      setTitle('');
      setAmount('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan transaksi.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete transaction ───────────────────────────────────────────────────
  const handleDelete = (tx: Transaction) => {
    Alert.alert(
      'Hapus Transaksi',
      `Hapus "${tx.title}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            if (!tx.id) return;
            setDeletingId(tx.id);
            try {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              await deleteTransaction(tx.id);
                            setTransactions(prev => {
                const next = prev.filter(t => t.id !== tx.id);
                txRef.current = next;
                return next;
              });
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Gagal menghapus transaksi.');
            } finally {
              setDeletingId(null);
            }
          }
        }
      ]
    );
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Logout', 'Apakah Anda yakin ingin keluar?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => await supabase.auth.signOut() },
    ]);
  };

  // ── Chart calculations ───────────────────────────────────────────────────
  const currentData = transactions.filter(t => t.type === tab);
  const total = currentData.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const size = 280;
  const center = size / 2;
  const radius = 85;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const catKeys = Object.keys(CAT_CONFIG[tab]);
  const catSums = catKeys.map(key => ({
    key,
    sum: currentData.filter(t => t.category === key).reduce((s, t) => s + (Number(t.amount) || 0), 0),
  })).filter(c => c.sum > 0);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.welcomeText}>Selamat Datang,</Text>
            <Text style={styles.headerTitle}>{userName || '...'}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <LogOut size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'spending' && styles.tabActive]} onPress={() => setTab('spending')}>
            <Text style={[styles.tabText, tab === 'spending' && styles.tabTextActive]}>Spending</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'earning' && styles.tabActive]} onPress={() => setTab('earning')}>
            <Text style={[styles.tabText, tab === 'earning' && styles.tabTextActive]}>Earning</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Month Selector */}
        <TouchableOpacity style={[styles.periodBox, { width: '90%' }]} onPress={() => setMonthModal(true)}>
          <Text style={styles.periodText}>{selectedMonth}</Text>
          <ChevronDown size={18} color="#7a0400" />
        </TouchableOpacity>

        {/* PIE CHART */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#7a0400" />
            <Text style={styles.loadingText}>Memuat data...</Text>
          </View>
        ) : total === 0 ? (
          <Animated.View style={[styles.emptyBox, { opacity: fadeAnim }]}>
            <View style={styles.emptyIconBox}>
              <PieChart size={40} color="#7a0400" />
            </View>
            <Text style={styles.emptyTitle}>Belum Ada Transaksi</Text>
            <Text style={styles.emptySubtitle}>Tekan tombol + untuk mulai mencatat {tab === 'spending' ? 'pengeluaran' : 'pemasukan'}</Text>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.chartContainer, { opacity: fadeAnim }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <G rotation="-90" origin={`${center}, ${center}`}>
                <Circle cx={center} cy={center} r={radius} stroke="#f1f5f9" strokeWidth={strokeWidth} fill="transparent" />
                {catSums.map(({ key, sum }) => {
                  const percentage = sum / total;
                  const strokeDash = percentage * circumference;
                  const offset = cumulativeOffset;
                  cumulativeOffset += strokeDash;
                  return (
                    <Circle
                      key={key}
                      cx={center} cy={center} r={radius}
                      stroke={CAT_CONFIG[tab][key].color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${strokeDash} ${circumference}`}
                      strokeDashoffset={-offset}
                      fill="transparent"
                      strokeLinecap="round"
                    />
                  );
                })}
              </G>
            </Svg>
            <View style={styles.centerText}>
              <Text style={styles.labelMid}>Total {tab === 'spending' ? 'Spend' : 'Earn'}</Text>
              <Text style={styles.currencyMid}>IDR</Text>
              <Text style={styles.amountMid}>{total.toLocaleString('id-ID')}</Text>
            </View>
          </Animated.View>
        )}

        {/* BY CATEGORY LIST */}
        {!loading && total > 0 && (
          <Animated.View style={[styles.listSection, { width: '90%', opacity: fadeAnim }]}>
            <Text style={styles.listTitle}>By Category</Text>
            {catKeys.map(key => {
              const sum = currentData.filter(t => t.category === key).reduce((s, t) => s + (Number(t.amount) || 0), 0);
              const percent = total > 0 ? ((sum / total) * 100).toFixed(0) : 0;
              const Icon = CAT_CONFIG[tab][key].icon;
              if (sum === 0) return null;
              return (
                <View key={key} style={styles.listItem}>
                  <View style={[styles.iconCircle, { backgroundColor: CAT_CONFIG[tab][key].color }]}>
                    <Icon size={18} color="white" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.itemLabel}>{CAT_CONFIG[tab][key].label}</Text>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${percent}%` as any, backgroundColor: CAT_CONFIG[tab][key].color }]} />
                    </View>
                    <Text style={styles.itemSub}>
                      {fmt(sum)}{' '}
                      <Text style={{ color: CAT_CONFIG[tab][key].color, fontWeight: 'bold' }}>{percent}%</Text>
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#cbd5e1" />
                </View>
              );
            })}
          </Animated.View>
        )}

        {/* RECENT TRANSACTIONS LIST */}
        {!loading && transactions.length > 0 && (
          <Animated.View style={[styles.txSection, { width: '90%', opacity: fadeAnim }]}>
            <Text style={styles.listTitle}>Transaksi Terbaru</Text>
            {transactions.slice(0, 10).map((tx) => {
              const Icon = CAT_CONFIG[tab]?.[tx.category]?.icon || MoreHorizontal;
              const color = CAT_CONFIG[tab]?.[tx.category]?.color || '#7a0400';
              if (tx.type !== tab) return null;
              return (
                <View key={tx.id || tx.title} style={styles.txItem}>
                  <View style={[styles.txIconBox, { backgroundColor: color + '20' }]}>
                    <Icon size={18} color={color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.txTitle} numberOfLines={1}>{tx.title}</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2}}>
                      <Text style={styles.txMeta}>{CAT_CONFIG[tab]?.[tx.category]?.label || tx.category}</Text>
                      {(tx.latitude && tx.longitude) && <MapPin size={10} color="#94a3b8" />}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.txAmount, { color: tab === 'spending' ? '#dc2626' : '#16a34a' }]}>
                      {tab === 'spending' ? '-' : '+'}{fmt(tx.amount)}
                    </Text>
                    {deletingId === tx.id ? (
                      <ActivityIndicator size="small" color="#dc2626" />
                    ) : (
                      <TouchableOpacity onPress={() => handleDelete(tx)} style={styles.deleteBtn}>
                        <Trash2 size={14} color="#dc2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => {
        setSelectedCat(Object.keys(CAT_CONFIG[tab])[0]);
        setModalVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}>
        <Plus color="white" size={30} />
      </TouchableOpacity>

      {/* MONTH PICKER MODAL */}
      <Modal visible={monthModal} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={() => setMonthModal(false)}>
          <View style={styles.modalBg}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { padding: 20 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={styles.mTitle}>Pilih Bulan</Text>
                  <TouchableOpacity onPress={() => setMonthModal(false)}><X size={24} color="#64748b" /></TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 300 }}>
                  {months.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthItem, selectedMonth === m && styles.monthItemActive]}
                      onPress={() => { setSelectedMonth(m); setMonthModal(false); }}
                    >
                      <Text style={[styles.monthItemText, selectedMonth === m && { color: 'white' }]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ADD TRANSACTION MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalBg}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={styles.mTitle}>Add {tab === 'spending' ? 'Expense' : 'Income'}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}><X size={24} color="#64748b" /></TouchableOpacity>
                </View>
                
                {/* MODE SWITCHER */}
                <View style={styles.modeSwitcher}>
                  <TouchableOpacity 
                    style={[styles.modeBtn, inputMode === 'manual' && styles.modeBtnActive]} 
                    onPress={() => setInputMode('manual')}
                  >
                    <Text style={[styles.modeText, inputMode === 'manual' && styles.modeTextActive]}>Manual</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modeBtn, inputMode === 'ai' && styles.modeBtnActiveAI]} 
                    onPress={() => setInputMode('ai')}
                  >
                    <Sparkles size={16} color={inputMode === 'ai' ? 'white' : '#9c4fb7'} />
                    <Text style={[styles.modeText, inputMode === 'ai' && styles.modeTextActive]}>Smart AI</Text>
                  </TouchableOpacity>
                </View>

                {inputMode === 'ai' ? (
                  <View style={styles.aiBox}>
                    <TextInput
                      style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
                      placeholder="Cth: Tadi siang saya makan nasi padang habis 50 ribu"
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={aiText}
                      onChangeText={setAiText}
                    />
                    <Text style={styles.aiHint}>AI akan otomatis menentukan kategori, tipe pemasukan/pengeluaran, dan nominal secara cerdas.</Text>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Deskripsi transaksi"
                      placeholderTextColor="#94a3b8"
                      value={title}
                      onChangeText={setTitle}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Jumlah (Rp)"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      value={amount}
                      onChangeText={setAmount}
                    />
                    <Text style={styles.catLabel}>Kategori</Text>
                    <View style={styles.catGrid}>
                      {Object.keys(CAT_CONFIG[tab]).map(k => {
                        const Icon = CAT_CONFIG[tab][k].icon;
                        const isActive = selectedCat === k;
                        return (
                          <TouchableOpacity
                            key={k}
                            onPress={() => setSelectedCat(k)}
                            style={[styles.catBtn, isActive && { backgroundColor: CAT_CONFIG[tab][k].color, borderColor: CAT_CONFIG[tab][k].color }]}
                          >
                            <Icon size={16} color={isActive ? 'white' : '#7a0400'} />
                            <Text style={[styles.catBtnText, isActive && { color: 'white' }]}>
                              {CAT_CONFIG[tab][k].label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.saveBtn, (saving || isAiProcessing) && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving || isAiProcessing}
                >
                  {(saving || isAiProcessing)
                    ? <ActivityIndicator color="white" />
                    : <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{inputMode === 'ai' ? 'Proses dengan AI' : 'Simpan Transaksi'}</Text>
                  }
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#7a0400', paddingTop: 60 },
  topRow: { paddingHorizontal: 20, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  welcomeText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  logoutBtn: { padding: 8 },
  tabContainer: { flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 15 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: 'white' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold' },
  tabTextActive: { color: 'white' },
  periodBox: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 16, padding: 15, backgroundColor: 'white', borderRadius: 14, elevation: 2 },
  periodText: { color: '#7a0400', fontWeight: '700', fontSize: 15 },

  // Loading & Empty
  loadingBox: { marginVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: '#94a3b8', fontSize: 14 },
  emptyBox: { marginVertical: 30, alignItems: 'center', paddingHorizontal: 40 },
  emptyIconBox: { width: 80, height: 80, backgroundColor: '#f1f5f9', borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  // Chart
  chartContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  centerText: { position: 'absolute', alignItems: 'center', width: '100%' },
  labelMid: { fontSize: 12, color: '#64748b' },
  currencyMid: { fontSize: 14, fontWeight: 'bold', color: '#7a0400', marginTop: 4 },
  amountMid: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },

  // Category list
  listSection: { marginTop: 10, backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 2 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  itemLabel: { fontWeight: '600', color: '#1e293b', fontSize: 14, marginBottom: 6 },
  progressBarBg: { height: 4, backgroundColor: '#f1f5f9', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressBarFill: { height: '100%', borderRadius: 2 },
  itemSub: { color: '#64748b', fontSize: 12 },

  // Transaction list
  txSection: { marginTop: 12, backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 2 },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  txIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  txMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: 'bold' },
  deleteBtn: { padding: 4 },

  // FAB
  fab: {
    position: 'absolute', bottom: 30, right: 24,
    backgroundColor: '#7a0400', width: 62, height: 62,
    borderRadius: 31, justifyContent: 'center', alignItems: 'center',
    elevation: 10,
    shadowColor: '#7a0400', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },

  // Modals
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', padding: 24, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  mTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  input: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 15, color: '#1e293b' },
  catLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f1f5f9', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  catBtnText: { color: '#7a0400', fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#7a0400', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 4 },
  monthItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, backgroundColor: '#f8fafc' },
  monthItemActive: { backgroundColor: '#7a0400' },
  monthItemText: { color: '#1e293b', fontWeight: '600', fontSize: 15 },
  
  // AI & Mode
  modeSwitcher: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 20 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  modeBtnActive: { backgroundColor: 'white', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  modeBtnActiveAI: { backgroundColor: '#9c4fb7', elevation: 2, shadowColor: '#9c4fb7', shadowOpacity: 0.3, shadowRadius: 6 },
  modeText: { fontWeight: 'bold', color: '#64748b', fontSize: 14 },
  modeTextActive: { color: '#1e293b' },
  aiBox: { marginBottom: 10 },
  aiHint: { fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: -4, marginBottom: 12, lineHeight: 18 },
});