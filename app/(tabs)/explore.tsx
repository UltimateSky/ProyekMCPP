import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Dimensions
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import {
  Target, Edit3, Check, TrendingUp, TrendingDown, Wallet,
  MoreHorizontal
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import {
  getTransactions,
  upsertProfile,
  getCurrentMonth,
  getLast12Months,
  type Transaction,
} from '../../services/transactionService';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const fmtK = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}rb`;
  return `${Math.round(n)}`;
};

const CAT_LABELS: Record<string, { label: string; color: string }> = {
  transfer: { label: 'Account Transfer', color: '#9c4fb7' },
  shopping: { label: 'Shopping', color: '#d66060' },
  food: { label: 'Food & Beverage', color: '#e9bc4d' },
  other: { label: 'Other', color: '#7a0400' },
  deposit: { label: 'Cash Deposit', color: '#31745d' },
  salary: { label: 'Salary', color: '#2563eb' },
};

// ── Round up ke angka yang "bersih" untuk Y-axis ─────────────────────────────
function roundUpNice(n: number): number {
  if (n <= 0) return 1_000_000;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const normed = n / mag;
  let r: number;
  if (normed <= 1) r = 1;
  else if (normed <= 2) r = 2;
  else if (normed <= 2.5) r = 2.5;
  else if (normed <= 5) r = 5;
  else r = 10;
  return r * mag;
}

export default function AnalyticsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [limit, setLimit] = useState(5000000);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('5000000');
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingLimit, setSavingLimit] = useState(false);

  const months = getLast12Months();
  const chartMonths = months.slice(0, 6).reverse(); // oldest → newest

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        supabase.from('profiles').select('full_name, monthly_limit').eq('id', user.id).single()
          .then(({ data }) => {
            setUserName(data?.full_name || user.email?.split('@')[0] || 'User');
            const l = Number(data?.monthly_limit) || 5000000;
            setLimit(l);
            setTempLimit(l.toString());
          });
      }
    });
  }, []);

  // ── Load all transactions ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await getTransactions(userId);
      setTransactions(data);
    } catch (e) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Save limit ────────────────────────────────────────────────────────────
  const saveLimit = async () => {
    if (!userId) return;
    const newLimit = parseInt(tempLimit.replace(/[^0-9]/g, '')) || 0;
    setSavingLimit(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await upsertProfile(userId, { monthly_limit: newLimit });
      setLimit(newLimit);
      setIsEditingLimit(false);
      Alert.alert('Berhasil ✅', 'Budget bulanan berhasil diperbarui.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan limit.');
    } finally {
      setSavingLimit(false);
    }
  };

  // ── Current month calculations ────────────────────────────────────────────
  const currentMonth = getCurrentMonth();
  const currentTxs = transactions.filter(t => t.month === currentMonth);
  const totalSpend = currentTxs.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);
  const totalEarn = currentTxs.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalEarn - totalSpend;
  const usagePercent = limit > 0 ? (totalSpend / limit) * 100 : 0;
  const displayPct = Math.min(usagePercent, 100);

  // ── Monthly totals ────────────────────────────────────────────────────────
  const getMonthTotals = (month: string) => {
    const mTxs = transactions.filter(t => t.month === month);
    const spend = mTxs.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);
    const earn = mTxs.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
    return { spend, earn, net: earn - spend };
  };

  const activeMonths = months.filter(m => {
    const { spend, earn } = getMonthTotals(m);
    return spend > 0 || earn > 0;
  });

  // ── Line chart data — responsif auto-scale ──────────────────────────────
  const spendValues = chartMonths.map(m => getMonthTotals(m).spend);
  const earnValues = chartMonths.map(m => getMonthTotals(m).earn);
  const maxVal = Math.max(...spendValues, ...earnValues, 1_000);
  const yMax = roundUpNice(maxVal * 1.15);  // 15% headroom

  const hasChartData = spendValues.some(v => v > 0) || earnValues.some(v => v > 0);

  const lineChartData = {
    labels: chartMonths.map(m => m.split(' ')[0].slice(0, 3)),
    datasets: [
      {
        data: spendValues.map(v => v === 0 ? 0.001 : v), // avoid 0 rendering issue
        color: () => '#7a0400',
        strokeWidth: 2.5,
      },
      {
        data: earnValues.map(v => v === 0 ? 0.001 : v),
        color: () => '#16a34a',
        strokeWidth: 2.5,
      },
    ],
    legend: ['Pengeluaran', 'Pemasukan'],
  };

  // ── Top spending categories (all time) ──────────────────────────────────
  const allSpending = transactions.filter(t => t.type === 'spending');
  const totalAllSpend = allSpending.reduce((s, t) => s + t.amount, 0);
  const catTotals = Object.keys(CAT_LABELS).map(cat => ({
    key: cat,
    total: allSpending.filter(t => t.category === cat).reduce((s, t) => s + t.amount, 0),
    count: allSpending.filter(t => t.category === cat).length,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial Analysis</Text>
        <Text style={styles.headerSub}>{userName}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#7a0400" />
          <Text style={styles.loadingText}>Memuat analisis...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* SUMMARY CARDS */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderLeftColor: '#16a34a' }]}>
              <TrendingUp size={18} color="#16a34a" />
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={[styles.summaryValue, { color: '#16a34a' }]}>{fmt(totalEarn)}</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: '#7a0400' }]}>
              <TrendingDown size={18} color="#7a0400" />
              <Text style={styles.summaryLabel}>Expense</Text>
              <Text style={[styles.summaryValue, { color: '#7a0400' }]}>{fmt(totalSpend)}</Text>
            </View>
          </View>

          <View style={[styles.balanceCard, { borderLeftColor: netBalance >= 0 ? '#16a34a' : '#dc2626' }]}>
            <Wallet size={20} color={netBalance >= 0 ? '#16a34a' : '#dc2626'} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.summaryLabel}>Net Balance — {currentMonth}</Text>
              <Text style={[styles.balanceValue, { color: netBalance >= 0 ? '#16a34a' : '#dc2626' }]}>
                {netBalance >= 0 ? '+' : ''}{fmt(netBalance)}
              </Text>
            </View>
          </View>

          {/* MONTHLY LIMIT CARD */}
          <View style={styles.card}>
            <View style={styles.cardRowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Target size={20} color="#7a0400" />
                <Text style={styles.cardTitle}>Budget Bulanan</Text>
              </View>
              <TouchableOpacity onPress={() => {
                if (isEditingLimit) saveLimit();
                else { setIsEditingLimit(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
              }}>
                {savingLimit
                  ? <ActivityIndicator size="small" color="#7a0400" />
                  : isEditingLimit
                    ? <Check size={22} color="#16a34a" />
                    : <Edit3 size={18} color="#7a0400" />}
              </TouchableOpacity>
            </View>

            {isEditingLimit
              ? <TextInput style={styles.limitInput} value={tempLimit} onChangeText={setTempLimit} keyboardType="phone-pad" autoFocus />
              : <Text style={styles.limitVal}>{fmt(limit)}</Text>}

            <View style={styles.progressContainer}>
              <View style={[styles.progressFill, {
                width: `${displayPct}%` as any,
                backgroundColor: usagePercent > 90 ? '#dc2626' : usagePercent > 75 ? '#f59e0b' : '#7a0400',
              }]} />
            </View>

            <View style={styles.cardRowBetween}>
              <Text style={styles.subText}>Terpakai: {usagePercent.toFixed(1)}%</Text>
              <Text style={[styles.subText, {
                fontWeight: 'bold',
                color: usagePercent > 90 ? '#dc2626' : usagePercent > 75 ? '#f59e0b' : '#7a0400',
              }]}>
                {fmt(totalSpend)} / {fmt(limit)}
              </Text>
            </View>

            {usagePercent > 90 && (
              <View style={[styles.alertBox, { backgroundColor: '#fee2e2' }]}>
                <Text style={[styles.alertText, { color: '#dc2626' }]}>🚨 Pengeluaran hampir melebihi budget!</Text>
              </View>
            )}
            {usagePercent > 75 && usagePercent <= 90 && (
              <View style={[styles.alertBox, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.alertText, { color: '#b45309' }]}>⚠️ Pengeluaran telah mencapai 75% budget.</Text>
              </View>
            )}
          </View>

          {/* ── LINE CHART — Tren 6 Bulan ─────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tren 6 Bulan Terakhir</Text>
            <Text style={[styles.subText, { marginBottom: 4 }]}>
              Y-axis maks: {fmtK(yMax)} (auto-scale)
            </Text>

            {/* Legend manual */}
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 20, height: 3, backgroundColor: '#7a0400', borderRadius: 2 }} />
                <Text style={styles.legendText}>Pengeluaran</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 20, height: 3, backgroundColor: '#16a34a', borderRadius: 2 }} />
                <Text style={styles.legendText}>Pemasukan</Text>
              </View>
            </View>

            {hasChartData ? (
              <View style={{ marginHorizontal: -8 }}>
                <LineChart
                  data={lineChartData}
                  width={SCREEN_WIDTH - 64}
                  height={220}
                  fromZero
                  withDots
                  withShadow={false}
                  withInnerLines
                  withOuterLines
                  withVerticalLines={false}
                  segments={5}
                  chartConfig={{
                    backgroundColor: 'white',
                    backgroundGradientFrom: 'white',
                    backgroundGradientTo: 'white',
                    color: (opacity = 1) => `rgba(122, 4, 0, ${opacity})`,
                    labelColor: () => '#94a3b8',
                    propsForDots: { r: '4', strokeWidth: '2' },
                    propsForBackgroundLines: {
                      stroke: '#f1f5f9',
                      strokeDasharray: '',
                    },
                    decimalPlaces: 0,
                    // Format Y label secara responsif
                    formatYLabel: (val: string) => fmtK(parseFloat(val)),
                  }}
                  style={{ borderRadius: 8 }}
                  yAxisLabel=""
                  yAxisSuffix=""
                // Tetapkan max Y secara manual dengan padding data
                // (react-native-chart-kit auto-scale dari data)
                />
              </View>
            ) : (
              <View style={styles.emptyChartBox}>
                <Text style={styles.emptyChartText}>Belum ada data untuk ditampilkan</Text>
              </View>
            )}

            {/* Y-axis info */}
            <View style={styles.yAxisInfo}>
              <Text style={styles.yAxisText}>
                Maks pengeluaran {chartMonths[chartMonths.length - 1]?.split(' ')[0] || ''}:{' '}
                {fmt(Math.max(...spendValues))}
              </Text>
            </View>
          </View>

          {/* TOP CATEGORIES */}
          {catTotals.length > 0 && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 16 }]}>Top Kategori Pengeluaran</Text>
              {catTotals.slice(0, 5).map(({ key, total, count }) => {
                const pct = totalAllSpend > 0 ? (total / totalAllSpend) * 100 : 0;
                const cfg = CAT_LABELS[key];
                return (
                  <View key={key} style={styles.topCatRow}>
                    <View style={[styles.topCatDot, { backgroundColor: cfg?.color || '#7a0400' }]} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={styles.topCatName}>{cfg?.label || key}</Text>
                        <Text style={[styles.topCatPct, { color: cfg?.color || '#7a0400' }]}>{pct.toFixed(1)}%</Text>
                      </View>
                      <View style={styles.topCatBar}>
                        <View style={[styles.topCatFill, { width: `${pct}%` as any, backgroundColor: cfg?.color || '#7a0400' }]} />
                      </View>
                      <Text style={styles.topCatSub}>{fmt(total)} • {count} transaksi</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* MONTHLY HISTORY */}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 16 }]}>Riwayat Bulanan</Text>
            {activeMonths.length === 0 ? (
              <Text style={{ color: '#94a3b8', textAlign: 'center', paddingVertical: 10 }}>Belum ada riwayat transaksi</Text>
            ) : (
              activeMonths.map(m => {
                const { spend, earn, net } = getMonthTotals(m);
                const isCurrent = m === currentMonth;
                return (
                  <View key={m} style={[styles.monthRow, isCurrent && styles.monthRowActive]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.monthName}>{m}</Text>
                        {isCurrent && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Sekarang</Text></View>}
                      </View>
                      <Text style={styles.monthSub}>Masuk: {fmt(earn)}  •  Keluar: {fmt(spend)}</Text>
                    </View>
                    <Text style={[styles.monthAmount, { color: net >= 0 ? '#16a34a' : '#dc2626' }]}>
                      {net >= 0 ? '+' : ''}{fmt(net)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#7a0400', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#ffcdd2', fontSize: 14, marginTop: 4 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#94a3b8', fontSize: 14 },
  content: { padding: 16 },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 16, elevation: 2, borderLeftWidth: 4, gap: 4 },
  summaryLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  summaryValue: { fontSize: 15, fontWeight: 'bold', marginTop: 2 },
  balanceCard: { backgroundColor: 'white', borderRadius: 16, padding: 18, elevation: 2, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  balanceValue: { fontSize: 18, fontWeight: 'bold', marginTop: 2 },

  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 12, elevation: 3 },
  cardRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontWeight: 'bold', color: '#1e293b', fontSize: 15, marginBottom: 4 },
  limitVal: { fontSize: 26, fontWeight: 'bold', color: '#7a0400', marginBottom: 14 },
  limitInput: { fontSize: 26, fontWeight: 'bold', color: '#7a0400', borderBottomWidth: 2, borderColor: '#7a0400', marginBottom: 14, padding: 0 },
  progressContainer: { height: 10, backgroundColor: '#f1f5f9', borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 5 },
  subText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  alertBox: { borderRadius: 12, padding: 12, marginTop: 12 },
  alertText: { fontWeight: '600', fontSize: 13 },

  // Chart
  legendText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  emptyChartBox: { height: 100, justifyContent: 'center', alignItems: 'center' },
  emptyChartText: { color: '#94a3b8', fontSize: 14 },
  yAxisInfo: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, marginTop: 8 },
  yAxisText: { fontSize: 11, color: '#94a3b8' },

  // Top categories
  topCatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  topCatDot: { width: 12, height: 12, borderRadius: 6, marginTop: 2 },
  topCatName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  topCatPct: { fontSize: 13, fontWeight: 'bold' },
  topCatBar: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginVertical: 5 },
  topCatFill: { height: '100%', borderRadius: 3 },
  topCatSub: { fontSize: 11, color: '#94a3b8' },

  // Monthly history
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  monthRowActive: { backgroundColor: '#fff8f8', borderRadius: 12, paddingHorizontal: 10, marginHorizontal: -10, borderBottomWidth: 0 },
  monthName: { color: '#1e293b', fontWeight: 'bold', fontSize: 14 },
  monthSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  monthAmount: { fontWeight: 'bold', fontSize: 14 },
  currentBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  currentBadgeText: { color: '#7a0400', fontSize: 10, fontWeight: '700' },
});