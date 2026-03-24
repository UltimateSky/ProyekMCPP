import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TextInput, 
  TouchableOpacity, Modal, Dimensions, KeyboardAvoidingView, Platform, Alert 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import Svg, { G, Circle, ForeignObject } from 'react-native-svg';
import { Plus, X, ChevronRight, Landmark, ShoppingBag, Utensils, MoreHorizontal, Banknote, FileText } from 'lucide-react-native';

const CAT_CONFIG: any = {
  spending: {
    transfer: { label: 'Account Transfer', color: '#9c4fb7', icon: Landmark },
    shopping: { label: 'Shopping', color: '#d66060', icon: ShoppingBag },
    food: { label: 'Food & Beverage', color: '#e9bc4d', icon: Utensils },
    other: { label: 'Other Categories', color: '#7a0400', icon: MoreHorizontal },
  },
  earning: {
    transfer: { label: 'Account Transfer', color: '#fbb117', icon: Landmark },
    deposit: { label: 'Cash Deposit', color: '#31745d', icon: Banknote },
    other: { label: 'Other Categories', color: '#7a0400', icon: FileText },
  }
};

export default function CashflowScreen() {
  const [tab, setTab] = useState<'spending' | 'earning'>('spending');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCat, setSelectedCat] = useState('transfer');
  const [currentUser, setCurrentUser] = useState('');

  // 1. Fungsi Load Data yang sangat teliti
  const loadData = async () => {
    try {
      // Ambil user. Jika tidak ada, coba pakai nama Ferry langsung (sebagai fallback)
      const user = await AsyncStorage.getItem('@current_user');
      const activeName = user || "Ferry Irawan Limiadi"; 
      setCurrentUser(activeName);

      // Coba ambil data dengan nama user, jika gagal ambil data tanpa nama (global)
      const savedWithName = await AsyncStorage.getItem(`@tx_${activeName}`);
      const savedGlobal = await AsyncStorage.getItem(`@tx_`);
      
      const rawData = savedWithName || savedGlobal || "[]";
      const parsedData = JSON.parse(rawData);
      
      setTransactions(Array.isArray(parsedData) ? parsedData : []);
    } catch (e) {
      console.error("Gagal load:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // 2. Fungsi Simpan yang menjamin data masuk ke user yang benar
  const handleSave = async () => {
    if (!title || !amount) {
      Alert.alert("Error", "Mohon isi semua data.");
      return;
    }

    try {
      const user = await AsyncStorage.getItem('@current_user');
      const activeName = user || "Ferry Irawan Limiadi";

      const newTx = { 
        id: Date.now().toString(), 
        title, 
        amount: parseFloat(amount) || 0, 
        category: selectedCat, 
        type: tab,
        month: "March 2026" 
      };

      const updated = [newTx, ...transactions];
      
      // SIMPAN KE DUA TEMPAT (Agar aman dan Explore bisa baca)
      await AsyncStorage.setItem(`@tx_${activeName}`, JSON.stringify(updated));
      await AsyncStorage.setItem(`@tx_`, JSON.stringify(updated)); // Backup untuk explore
      
      setTransactions(updated);
      setModalVisible(false); 
      setTitle(''); setAmount('');
    } catch (e) { 
      console.error(e); 
    }
  };

  const currentData = transactions.filter(t => t && t.type === tab);
  const total = currentData.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const size = 300;
  const center = size / 2;
  const radius = 90;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.welcomeText}>Selamat Datang,</Text>
            <Text style={styles.headerTitle}>{currentUser}</Text>
          </View>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={[styles.periodBox, { width: '90%' }]}>
          <Text style={styles.periodText}>March 2026</Text>
          <ChevronRight size={18} color="#7a0400" />
        </View>

        <View style={styles.chartContainer}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G rotation="-90" origin={`${center}, ${center}`}>
              <Circle cx={center} cy={center} r={radius} stroke="#f1f5f9" strokeWidth={strokeWidth} fill="transparent" />
              {Object.keys(CAT_CONFIG[tab]).map((key) => {
                const catSum = currentData.filter(t => t.category === key).reduce((s, t) => s + (Number(t.amount) || 0), 0);
                if (catSum === 0) return null;
                const percentage = (catSum / total);
                const strokeDash = percentage * circumference;
                const offset = cumulativeOffset;
                cumulativeOffset += strokeDash;
                const midAngle = ((offset + strokeDash / 2) / circumference) * 360;
                const angleRad = (midAngle * Math.PI) / 180;
                const iconX = center + radius * Math.cos(angleRad);
                const yPos = center + radius * Math.sin(angleRad);
                const IconComp = CAT_CONFIG[tab][key].icon;
                return (
                  <G key={key}>
                    <Circle cx={center} cy={center} r={radius} stroke={CAT_CONFIG[tab][key].color} strokeWidth={strokeWidth} strokeDasharray={`${strokeDash} ${circumference}`} strokeDashoffset={-offset} fill="transparent" />
                    <G rotation="90" origin={`${iconX}, ${yPos}`}>
                        <Circle cx={iconX} cy={yPos} r="16" fill="white" stroke={CAT_CONFIG[tab][key].color} strokeWidth="2" />
                        <ForeignObject x={iconX - 8} y={yPos - 8} width="16" height="16">
                            <IconComp size={16} color={CAT_CONFIG[tab][key].color} />
                        </ForeignObject>
                    </G>
                  </G>
                );
              })}
            </G>
          </Svg>
          <View style={styles.centerText}>
            <Text style={styles.labelMid}>Total {tab === 'spending' ? 'Spend' : 'Earn'}</Text>
            <Text style={styles.currencyMid}>IDR</Text>
            <Text style={styles.amountMid}>{total.toLocaleString('id-ID')}</Text>
          </View>
        </View>

        <View style={[styles.listSection, { width: '90%' }]}>
          <Text style={styles.listTitle}>By Category</Text>
          {Object.keys(CAT_CONFIG[tab]).map(key => {
            const sum = currentData.filter(t => t.category === key).reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const percent = total > 0 ? ((sum / total) * 100).toFixed(0) : 0;
            const Icon = CAT_CONFIG[tab][key].icon;
            if (sum === 0) return null;
            return (
              <View key={key} style={styles.listItem}>
                <View style={[styles.iconCircle, {backgroundColor: CAT_CONFIG[tab][key].color}]}>
                   <Icon size={18} color="white" />
                </View>
                <View style={{flex: 1, marginLeft: 15}}>
                  <Text style={styles.itemLabel}>{CAT_CONFIG[tab][key].label}</Text>
                  <Text style={styles.itemSub}>IDR {sum.toLocaleString('id-ID')} <Text style={{color: '#7a0400', fontWeight: 'bold'}}>{percent}%</Text></Text>
                </View>
                <ChevronRight size={18} color="#cbd5e1" />
              </View>
            );
          })}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Plus color="white" size={30} />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalCard}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <Text style={styles.mTitle}>Input {tab}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><X size={24} color="#64748b" /></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Description" value={title} onChangeText={setTitle} />
            <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <View style={styles.catGrid}>
              {Object.keys(CAT_CONFIG[tab]).map(k => (
                <TouchableOpacity key={k} onPress={()=>setSelectedCat(k)} style={[styles.catBtn, selectedCat===k && {backgroundColor: '#7a0400'}]}>
                  <Text style={{color: selectedCat===k ? 'white':'#7a0400', fontSize: 12}}>{CAT_CONFIG[tab][k].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={{color:'white', fontWeight:'bold'}}>Save Transaction</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { backgroundColor: '#7a0400', paddingTop: 60 },
  topRow: { paddingHorizontal: 20, marginBottom: 20 },
  welcomeText: { color: '#ffffff', fontSize: 13 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 15 },
  tabActive: { borderBottomWidth: 4, borderBottomColor: 'white' },
  tabText: { color: '#ffffff', fontWeight: 'bold' },
  tabTextActive: { color: 'white' },
  periodBox: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 20, padding: 15, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12 },
  periodText: { color: '#7a0400', fontWeight: '600' },
  chartContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  centerText: { position: 'absolute', alignItems: 'center', width: '100%' },
  labelMid: { fontSize: 12, color: '#7a0400' },
  currencyMid: { fontSize: 14, fontWeight: 'bold', color: '#7a0400', marginTop: 5 },
  amountMid: { fontSize: 22, fontWeight: 'bold', color: '#7a0400' },
  listSection: { paddingBottom: 100, marginTop: 10 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#7a0400', marginBottom: 20 },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  itemLabel: { fontWeight: 'bold', color: '#7a0400', fontSize: 15 },
  itemSub: { color: '#7a0400', fontSize: 13, marginTop: 4 },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#7a0400', width: 65, height: 65, borderRadius: 32.5, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 25 },
  modalCard: { backgroundColor: 'white', padding: 30, borderRadius: 25 },
  mTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 25, color: '#7a0400' },
  input: { backgroundColor: '#f8fafc', padding: 18, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  catBtn: { padding: 12, backgroundColor: '#f1f5f9', borderRadius: 12 },
  saveBtn: { backgroundColor: '#7a0400', padding: 20, borderRadius: 15, alignItems: 'center' }
});