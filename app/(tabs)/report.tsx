import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  FileText, FileSpreadsheet, Download, Calendar, X,
  CheckCircle, TrendingUp, TrendingDown, Wallet, Share2, Check
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import {
  getTransactionsMultiMonth, getCurrentMonth, getLast12Months, type Transaction
} from '../../services/transactionService';
import { exportToExcel, exportToPDF, shareFile } from '../../services/exportService';
import * as Haptics from 'expo-haptics';

const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function ReportScreen() {
  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([getCurrentMonth()]);
  const [monthModal, setMonthModal]       = useState(false);
  const [userId, setUserId]               = useState<string | null>(null);
  const [userName, setUserName]           = useState('');
  const [loading, setLoading]             = useState(false);
  const [exporting, setExporting]         = useState<'pdf' | 'excel' | null>(null);
  const [lastExported, setLastExported]   = useState<string | null>(null);
  const months = getLast12Months();

  // ── Get user ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        supabase.from('profiles').select('full_name').eq('id', user.id).single()
          .then(({ data }) => setUserName(data?.full_name || user.email?.split('@')[0] || 'User'));
      }
    });
  }, []);

  // ── Load transactions for selected months ────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId || selectedMonths.length === 0) return;
    setLoading(true);
    try {
      const data = await getTransactionsMultiMonth(userId, selectedMonths);
      setTransactions(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userId, selectedMonths]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Toggle bulan ─────────────────────────────────────────────────────────
  const toggleMonth = (m: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMonths(prev =>
      prev.includes(m)
        ? prev.length > 1 ? prev.filter(x => x !== m) : prev  // min 1
        : [...prev, m].sort((a, b) => months.indexOf(b) - months.indexOf(a)) // newest first
    );
  };

  // ── Stats aggregate ──────────────────────────────────────────────────────
  const totalSpend = transactions.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);
  const totalEarn  = transactions.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalEarn - totalSpend;

  // ── Export handlers ──────────────────────────────────────────────────────
  const doExport = async (type: 'pdf' | 'excel') => {
    if (transactions.length === 0) {
      Alert.alert('Tidak Ada Data', 'Tidak ada transaksi di periode yang dipilih.');
      return;
    }
    setExporting(type);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Urutkan bulan dari yang paling lama ke paling baru
      const sortedMonths = [...selectedMonths].sort((a, b) => months.indexOf(b) - months.indexOf(a)).reverse();
      const fileUri = type === 'pdf'
        ? await exportToPDF(transactions, sortedMonths, userName)
        : await exportToExcel(transactions, sortedMonths, userName);
      await shareFile(fileUri);
      setLastExported(type === 'pdf' ? 'PDF' : 'Excel');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Export Gagal', e.message || 'Terjadi kesalahan.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setExporting(null); }
  };

  const periodLabel = selectedMonths.length === 1
    ? selectedMonths[0]
    : `${selectedMonths.length} bulan dipilih`;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial Report</Text>
        <Text style={styles.headerSub}>Export laporan — pilih satu atau lebih bulan</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* MONTH MULTI-SELECT */}
        <TouchableOpacity style={styles.monthSelector} onPress={() => setMonthModal(true)}>
          <Calendar size={20} color="#7a0400" />
          <Text style={styles.monthSelectorText}>{periodLabel}</Text>
          <View style={styles.monthCount}>
            <Text style={styles.monthCountText}>{selectedMonths.length}</Text>
          </View>
        </TouchableOpacity>

        {/* SELECTED MONTHS CHIPS */}
        {selectedMonths.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              {[...selectedMonths].reverse().map(m => (
                <TouchableOpacity key={m} style={styles.chip} onPress={() => toggleMonth(m)}>
                  <Text style={styles.chipText}>{m.split(' ')[0]} {m.split(' ')[1]}</Text>
                  <X size={12} color="#7a0400" />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* SUMMARY PREVIEW */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <ActivityIndicator color="#7a0400" />
            <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>Memuat data...</Text>
          </View>
        ) : (
          <View style={styles.previewCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={styles.previewTitle}>{periodLabel}</Text>
                <Text style={styles.previewCount}>{transactions.length} transaksi</Text>
              </View>
              {transactions.length > 0 && (
                <View style={styles.readyBadge}>
                  <CheckCircle size={12} color="#16a34a" />
                  <Text style={styles.readyText}>Siap Export</Text>
                </View>
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <TrendingUp size={15} color="#16a34a" />
                <Text style={styles.statLabel}>Income</Text>
                <Text style={[styles.statValue, { color: '#16a34a' }]}>{fmt(totalEarn)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <TrendingDown size={15} color="#7a0400" />
                <Text style={styles.statLabel}>Expense</Text>
                <Text style={[styles.statValue, { color: '#7a0400' }]}>{fmt(totalSpend)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Wallet size={15} color={netBalance >= 0 ? '#16a34a' : '#dc2626'} />
                <Text style={styles.statLabel}>Balance</Text>
                <Text style={[styles.statValue, { color: netBalance >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {netBalance >= 0 ? '+' : ''}{fmt(netBalance)}
                </Text>
              </View>
            </View>

            {transactions.length === 0 && (
              <View style={styles.noDataBox}>
                <Text style={styles.noDataText}>
                  💡 Tidak ada transaksi di periode ini. Pilih bulan lain atau tambahkan transaksi.
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Pilih Format Export</Text>

        {/* EXCEL */}
        <TouchableOpacity
          style={[styles.exportCard, styles.excelCard, transactions.length === 0 && styles.disabled]}
          onPress={() => doExport('excel')}
          disabled={!!exporting || loading}
          activeOpacity={0.8}
        >
          <View style={styles.exportIconBox}>
            <FileSpreadsheet size={28} color="#16a34a" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.exportCardTitle}>Export Excel (.xlsx)</Text>
            <Text style={styles.exportCardDesc}>
              {selectedMonths.length > 1 ? `${selectedMonths.length} sheet bulan + Summary + Detail` : 'Summary, Semua Transaksi, Pengeluaran, Pemasukan'}
            </Text>
            <View style={styles.featureRow}>
              <CheckCircle size={12} color="#16a34a" />
              <Text style={styles.featureText}>Net balance total semua bulan</Text>
            </View>
            {selectedMonths.length > 1 && (
              <View style={styles.featureRow}>
                <CheckCircle size={12} color="#16a34a" />
                <Text style={styles.featureText}>Sheet terpisah per bulan</Text>
              </View>
            )}
          </View>
          <View style={styles.exportAction}>
            {exporting === 'excel'
              ? <ActivityIndicator color="#16a34a" />
              : <View style={styles.dlBtn}><Download size={17} color="#16a34a" /></View>}
          </View>
        </TouchableOpacity>

        {/* PDF */}
        <TouchableOpacity
          style={[styles.exportCard, styles.pdfCard, transactions.length === 0 && styles.disabled]}
          onPress={() => doExport('pdf')}
          disabled={!!exporting || loading}
          activeOpacity={0.8}
        >
          <View style={[styles.exportIconBox, { backgroundColor: '#fff1f1' }]}>
            <FileText size={28} color="#7a0400" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.exportCardTitle}>Export PDF (.pdf)</Text>
            <Text style={styles.exportCardDesc}>Layout profesional + diagram garis</Text>
            <View style={styles.featureRow}>
              <CheckCircle size={12} color="#7a0400" />
              <Text style={[styles.featureText, { color: '#7a0400' }]}>Diagram tren pengeluaran & pemasukan</Text>
            </View>
            <View style={styles.featureRow}>
              <CheckCircle size={12} color="#7a0400" />
              <Text style={[styles.featureText, { color: '#7a0400' }]}>Detail per bulan + total keseluruhan</Text>
            </View>
          </View>
          <View style={styles.exportAction}>
            {exporting === 'pdf'
              ? <ActivityIndicator color="#7a0400" />
              : <View style={[styles.dlBtn, { backgroundColor: '#fff1f1' }]}><Download size={17} color="#7a0400" /></View>}
          </View>
        </TouchableOpacity>

        {/* SUCCESS BANNER */}
        {lastExported && (
          <View style={styles.successBanner}>
            <Share2 size={16} color="#16a34a" />
            <Text style={styles.successBannerText}>File {lastExported} berhasil dibuat & dibagikan!</Text>
          </View>
        )}

        {/* RECENT TRANSACTIONS */}
        {transactions.length > 0 && (
          <View style={styles.txCard}>
            <Text style={styles.txCardTitle}>Preview ({Math.min(5, transactions.length)} dari {transactions.length})</Text>
            {transactions.slice(0, 5).map((t, i) => (
              <View key={t.id || i} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.txMeta}>{t.month} • {t.category}</Text>
                </View>
                <Text style={[styles.txAmount, { color: t.type === 'spending' ? '#7a0400' : '#16a34a' }]}>
                  {t.type === 'spending' ? '-' : '+'}{fmt(t.amount)}
                </Text>
              </View>
            ))}
            {transactions.length > 5 && (
              <Text style={styles.moreText}>+{transactions.length - 5} transaksi lainnya akan disertakan</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* MONTH MULTI-SELECT MODAL */}
      <Modal visible={monthModal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.modalTitle}>Pilih Bulan</Text>
              <TouchableOpacity onPress={() => setMonthModal(false)}>
                <X size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Pilih satu atau lebih bulan untuk di-export</Text>
            <ScrollView style={{ maxHeight: 380, marginTop: 12 }}>
              {months.map(m => {
                const isSelected = selectedMonths.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthItem, isSelected && styles.monthItemActive]}
                    onPress={() => toggleMonth(m)}
                  >
                    <Text style={[styles.monthItemText, isSelected && { color: 'white' }]}>{m}</Text>
                    {isSelected && <Check size={18} color="white" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalDone} onPress={() => setMonthModal(false)}>
              <Text style={styles.modalDoneText}>Selesai ({selectedMonths.length} dipilih)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#f8fafc' },
  header:            { backgroundColor: '#7a0400', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle:       { color: 'white', fontSize: 22, fontWeight: 'bold' },
  headerSub:         { color: '#ffcdd2', fontSize: 13, marginTop: 3 },
  content:           { padding: 16 },

  monthSelector:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 10, elevation: 2 },
  monthSelectorText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#7a0400' },
  monthCount:        { backgroundColor: '#7a0400', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  monthCountText:    { color: 'white', fontSize: 12, fontWeight: 'bold' },

  chip:              { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  chipText:          { color: '#7a0400', fontSize: 12, fontWeight: '600' },

  previewCard:       { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 16, elevation: 3 },
  previewTitle:      { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  previewCount:      { fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14 },
  readyBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  readyText:         { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  statsRow:          { flexDirection: 'row', alignItems: 'center' },
  statItem:          { flex: 1, alignItems: 'center', gap: 4 },
  statLabel:         { fontSize: 10, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' },
  statValue:         { fontSize: 12, fontWeight: 'bold' },
  statDivider:       { width: 1, height: 40, backgroundColor: '#f1f5f9' },
  noDataBox:         { backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginTop: 14 },
  noDataText:        { color: '#64748b', fontSize: 13, lineHeight: 20 },

  sectionTitle:      { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  exportCard:        { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 3 },
  excelCard:         { borderLeftWidth: 4, borderLeftColor: '#16a34a' },
  pdfCard:           { borderLeftWidth: 4, borderLeftColor: '#7a0400' },
  disabled:          { opacity: 0.45 },
  exportIconBox:     { width: 54, height: 54, backgroundColor: '#f0fdf4', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  exportCardTitle:   { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 3 },
  exportCardDesc:    { fontSize: 11, color: '#64748b', marginBottom: 5 },
  featureRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  featureText:       { fontSize: 11, color: '#16a34a', fontWeight: '500' },
  exportAction:      { width: 40, alignItems: 'center' },
  dlBtn:             { width: 36, height: 36, backgroundColor: '#f0fdf4', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  successBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#dcfce7', borderRadius: 14, padding: 14, marginBottom: 14 },
  successBannerText: { color: '#166534', fontWeight: '600', fontSize: 13 },

  txCard:            { backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 2 },
  txCardTitle:       { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 14 },
  txRow:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  txTitle:           { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  txMeta:            { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  txAmount:          { fontSize: 13, fontWeight: 'bold' },
  moreText:          { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 12, fontStyle: 'italic' },

  modalBg:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:         { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  modalTitle:        { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  modalSub:          { fontSize: 13, color: '#94a3b8', marginTop: 3 },
  monthItem:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6, backgroundColor: '#f8fafc' },
  monthItemActive:   { backgroundColor: '#7a0400' },
  monthItemText:     { color: '#1e293b', fontWeight: '600', fontSize: 14 },
  modalDone:         { backgroundColor: '#7a0400', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 12 },
  modalDoneText:     { color: 'white', fontWeight: 'bold', fontSize: 15 },
});
