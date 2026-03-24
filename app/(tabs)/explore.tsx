import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TouchableOpacity, 
  TextInput, Alert, Share 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { Target, FileText, Edit3, Check, Calendar } from 'lucide-react-native';

export default function ExploreAnalytics() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [limit, setLimit] = useState(5000000);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('5000000');
  const [currentUser, setCurrentUser] = useState('');

const loadData = async () => {
    try {
      // 1. Ambil nama user, jika tidak ada pakai fallback Ferry
      const user = await AsyncStorage.getItem('@current_user');
      const activeName = user || "Ferry Irawan Limiadi";
      setCurrentUser(activeName);

      // 2. Ambil Transaksi (Cek kunci dengan nama DAN kunci global/kosong)
      const savedWithName = await AsyncStorage.getItem(`@tx_${activeName}`);
      const savedGlobal = await AsyncStorage.getItem(`@tx_`);
      
      // Gunakan data dari user, jika kosong pakai data global
      const rawData = savedWithName || savedGlobal || "[]";
      const parsedTx = JSON.parse(rawData);
      
      setTransactions(Array.isArray(parsedTx) ? parsedTx : []);

      // 3. Ambil Limit dari Profile
      const savedProfile = await AsyncStorage.getItem(`@profile_${activeName}`);
      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        const val = Number(profile.limit) || 5000000;
        setLimit(val);
        setTempLimit(val.toString());
      }
      
      console.log("Explore: Berhasil load data untuk", activeName);
    } catch (e) { 
      console.error("Explore Load Error:", e);
      setTransactions([]);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveLimit = async () => {
    const newLimit = parseInt(tempLimit) || 0;
    setLimit(newLimit);
    try {
      await AsyncStorage.setItem(`@profile_${currentUser}`, JSON.stringify({ limit: newLimit }));
      setIsEditingLimit(false);
      Alert.alert("Sukses", "Limit bulanan berhasil diperbarui");
    } catch (e) {
      Alert.alert("Error", "Gagal menyimpan limit");
    }
  };

  // Kalkulasi total pengeluaran - DIPERKUAT agar anti-NaN
  const totalSpend = transactions
    .filter(t => t && t.type === 'spending')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const usagePercent = limit > 0 ? (totalSpend / limit) * 100 : 0;
  const displayPercent = Math.min(usagePercent, 100);

  const exportToPDF = () => {
    let report = `LAPORAN KEUANGAN - ${currentUser}\n`;
    report += `Limit Bulanan: Rp ${limit.toLocaleString('id-ID')}\n`;
    report += `Total Pengeluaran: Rp ${totalSpend.toLocaleString('id-ID')}\n`;
    report += `Status: ${usagePercent.toFixed(1)}% terpakai\n\n`;
    report += `DETAIL TRANSAKSI:\n`;
    
    transactions.forEach((t, i) => {
      const typeLabel = t.type === 'spending' ? '[KELUAR]' : '[MASUK]';
      report += `${i+1}. ${typeLabel} ${t.title}: Rp ${(Number(t.amount) || 0).toLocaleString('id-ID')}\n`;
    });
    
    Share.share({ message: report });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial Analysis</Text>
        <Text style={styles.headerSub}>User: {currentUser}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Card Limit */}
        <View style={styles.card}>
          <View style={styles.cardRowBetween}>
            <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
              <Target size={20} color="#7a0400" />
              <Text style={styles.cardTitle}>Monthly Limit</Text>
            </View>
            <TouchableOpacity onPress={() => isEditingLimit ? saveLimit() : setIsEditingLimit(true)}>
              {isEditingLimit ? <Check size={20} color="green" /> : <Edit3 size={18} color="#7a0400" />}
            </TouchableOpacity>
          </View>

          {isEditingLimit ? (
            <TextInput 
              style={styles.limitInput} 
              value={tempLimit} 
              onChangeText={setTempLimit} 
              keyboardType="numeric"
              autoFocus
            />
          ) : (
            <Text style={styles.limitVal}>Rp {limit.toLocaleString('id-ID')}</Text>
          )}

          <View style={styles.progressContainer}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${displayPercent}%`, 
                  backgroundColor: usagePercent > 85 ? '#ef4444' : '#7a0400' 
                }
              ]} 
            />
          </View>
          
          <View style={styles.cardRowBetween}>
            <Text style={styles.subText}>Terpakai: {usagePercent.toFixed(1)}%</Text>
            <Text style={[styles.subText, {fontWeight:'bold', color:'#7a0400'}]}>
                Total: Rp {totalSpend.toLocaleString('id-ID')}
            </Text>
          </View>
        </View>

        {/* Monthly History */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Calendar size={20} color="#7a0400" />
            <Text style={styles.cardTitle}>Current Period</Text>
          </View>
          <View style={styles.monthRow}>
            <View>
              <Text style={styles.monthName}>Maret 2026</Text>
              <Text style={styles.joinDate}>Data realtime dari Cashflow</Text>
            </View>
            <Text style={styles.monthAmount}>Rp {totalSpend.toLocaleString('id-ID')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.pdfBtn} onPress={exportToPDF}>
          <FileText color="white" size={20} />
          <Text style={styles.pdfBtnText}>Share Financial Report</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ... (Styles tetap sama seperti kode Explore kamu sebelumnya)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#7a0400', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#ffcdd2', fontSize: 14, marginTop: 4 },
  content: { padding: 20 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 20, elevation: 3 },
  cardRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  cardTitle: { fontWeight: 'bold', color: '#1e293b', fontSize: 15 },
  limitVal: { fontSize: 26, fontWeight: 'bold', color: '#7a0400', marginBottom: 15 },
  limitInput: { fontSize: 26, fontWeight: 'bold', color: '#7a0400', borderBottomWidth: 2, borderColor: '#7a0400', marginBottom: 15, padding: 0 },
  progressContainer: { height: 12, backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden', marginBottom: 5 },
  progressFill: { height: '100%', borderRadius: 6 },
  subText: { fontSize: 12, color: '#64748b', marginTop: 5, fontWeight: '500' },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, paddingVertical: 12 },
  monthName: { color: '#1e293b', fontWeight: 'bold', fontSize: 16 },
  joinDate: { color: '#94a3b8', fontSize: 12 },
  monthAmount: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 },
  pdfBtn: { backgroundColor: '#7a0400', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 15, gap: 10, marginTop: 10, elevation: 4 },
  pdfBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});