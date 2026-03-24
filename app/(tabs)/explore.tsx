import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TouchableOpacity, 
  TextInput, Alert, Share 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router'; // Import ini
import { Target, FileText, Edit3, Check, Calendar } from 'lucide-react-native';

// ... (Imports tetap sama)

export default function ExploreAnalytics() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [limit, setLimit] = useState(5000000);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('5000000');
  const [currentUser, setCurrentUser] = useState('');

  const loadData = async () => {
    try {
      const user = await AsyncStorage.getItem('@current_user');
      if (!user) return;
      setCurrentUser(user);

      const savedTx = await AsyncStorage.getItem(`@tx_${user}`);
      setTransactions(savedTx ? JSON.parse(savedTx) : []);

      const savedProfile = await AsyncStorage.getItem(`@profile_${user}`);
      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        setLimit(profile.limit);
        setTempLimit(profile.limit.toString());
      }
    } catch (e) { console.error(e); }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveLimit = async () => {
    const newLimit = parseInt(tempLimit) || 0;
    setLimit(newLimit);
    await AsyncStorage.setItem(`@profile_${currentUser}`, JSON.stringify({ limit: newLimit }));
    setIsEditingLimit(false);
  };


  const exportToPDF = () => {
    let report = `LAPORAN KEUANGAN - ${currentUser}\n`;
    report += `Limit Bulanan: Rp ${limit.toLocaleString('id-ID')}\n\n`;
    transactions.forEach((t, i) => {
      report += `${i+1}. [${t.type.toUpperCase()}] ${t.title}: Rp ${t.amount.toLocaleString('id-ID')}\n`;
    });
    Share.share({ message: report });
  };

  // Kalkulasi total pengeluaran
  const totalSpend = transactions
    .filter(t => t.type === 'spending')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0); // Pastikan jadi Number

  const usagePercent = limit > 0 ? (totalSpend / limit) * 100 : 0;
  const displayPercent = Math.min(usagePercent, 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial Analysis</Text>
        <Text style={styles.headerSub}>{currentUser}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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

          {/* Bar Progress Responsif */}
          <View style={styles.progressContainer}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${displayPercent}%`, 
                  backgroundColor: usagePercent > 80 ? '#ef4444' : '#7a0400' 
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

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Calendar size={20} color="#7a0400" />
            <Text style={styles.cardTitle}>Monthly History</Text>
          </View>
          <View style={styles.monthRow}>
            <View>
              <Text style={styles.monthName}>Maret 2026</Text>
              <Text style={styles.joinDate}>Current Period</Text>
            </View>
            <Text style={styles.monthAmount}>Rp {totalSpend.toLocaleString('id-ID')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.pdfBtn} onPress={exportToPDF}>
          <FileText color="white" size={20} />
          <Text style={styles.pdfBtnText}>Download PDF Report</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#7a0400', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#ffcdd2', fontSize: 14, marginTop: 4 },
  content: { padding: 20 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
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