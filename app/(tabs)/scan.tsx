import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, TextInput, Modal, Platform,
  Animated, Image
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Accelerometer } from 'expo-sensors';
import { Camera, RefreshCw, Check, X, Zap, AlertCircle, ShoppingBag, Utensils, MoreHorizontal, Landmark, Image as ImageIcon, Scan, Receipt } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { addTransaction, getCurrentMonth } from '../../services/transactionService';

const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

// ─── Category config ─────────────────────────────────────────────────────────
const SPEND_CATS: any = {
  shopping: { label: 'Shopping', color: '#d66060', icon: ShoppingBag },
  food: { label: 'Food & Beverage', color: '#e9bc4d', icon: Utensils },
  transfer: { label: 'Account Transfer', color: '#9c4fb7', icon: Landmark },
  other: { label: 'Other', color: '#7a0400', icon: MoreHorizontal },
};

const INCOME_CATS: any = {
  salary: { label: 'Salary', color: '#10b981', icon: Landmark },
  deposit: { label: 'Deposit / Top Up', color: '#3b82f6', icon: Landmark },
  other: { label: 'Other Earning', color: '#059669', icon: MoreHorizontal },
};

// Keywords untuk auto-detect kategori
const CAT_KEYWORDS: Record<string, string[]> = {
  food: ['restaurant', 'cafe', 'kfc', 'mcdonald', 'pizza', 'burger', 'starbucks', 'coffee', 'bakery', 'warung', 'makan', 'resto', 'sate', 'ayam', 'nasi', 'bubur', 'gofood', 'grabfood', 'shopeefood', 'j&t', 'jco'],
  shopping: ['indomaret', 'alfamart', 'supermarket', 'mall', 'plaza', 'hypermart', 'carrefour', 'hero', 'giant', 'lottemart', 'shopee', 'tokopedia', 'lazada', 'amazon', 'minimarket', 'department'],
  transfer: ['transfer', 'atm', 'bca', 'bni', 'mandiri', 'bri', 'bank', 'gopay', 'ovo', 'dana', 'linkaja', 'spay'],
  deposit: ['deposit', 'top up', 'topup', 'terima dana', 'terima uang', 'receive'],
  salary: ['gaji', 'salary', 'payroll', 'bonus']
};

function detectType(text: string): 'spending' | 'earning' {
  const lower = text.toLowerCase();
  const incomeKeywords = ['deposit', 'top up', 'topup', 'gaji', 'salary', 'refund', 'terima uang', 'receive', 'masuk'];
  if (incomeKeywords.some(kw => lower.includes(kw))) return 'earning';
  return 'spending';
}

function detectCategory(text: string, type: 'spending' | 'earning'): string {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      // Validate category belongs to type
      if (type === 'earning' && (cat === 'deposit' || cat === 'salary' || cat === 'other')) return cat;
      if (type === 'spending' && (cat === 'food' || cat === 'shopping' || cat === 'transfer' || cat === 'other')) return cat;
    }
  }
  return type === 'earning' ? 'deposit' : 'other';
}

function extractAmount(text: string): string {
  // Helper to clean and parse value, removing trailing ,00 or .00
  const cleanValue = (raw: string) => {
    let s = raw.trim();
    if (s.endsWith(',00') || s.endsWith('.00')) {
      s = s.slice(0, -3);
    }
    const clean = s.replace(/[.,]/g, '').replace(/[^0-9]/g, '');
    return parseInt(clean) || 0;
  };

  // 1. Prioritize explicit keywords for totals
  const explicitPatterns = [
    /(?:total|grand total|jumlah|amount|bayar|payment|tunai|cash|tagihan)[^\d]*(\d[\d.,]+)/gi,
    /Rp\.?\s*(\d[\d.,]+)/gi,
    /IDR\s*(\d[\d.,]+)/gi,
  ];

  let bestValue = 0;

  for (const pattern of explicitPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const val = cleanValue(match[1]);
      if (val > bestValue && val < 100_000_000) {
        bestValue = val;
      }
    }
  }

  // If explicit keyword found, use it! This prevents picking random large numbers like NPWP
  if (bestValue > 0) return bestValue.toString();

  // 2. Fallback: find any number with thousand separators
  const fallbackPattern = /(\d{1,3}(?:[.,]\d{3})+)/g;
  const matches = [...text.matchAll(fallbackPattern)];
  for (const match of matches) {
    const val = cleanValue(match[1]);
    if (val > bestValue && val < 50_000_000) {
      bestValue = val;
    }
  }

  return bestValue > 0 ? bestValue.toString() : '';
}

function extractMerchant(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.length < 50);
  // Biasanya nama toko di baris pertama/kedua
  return lines[0] || 'Receipt Purchase';
}

// ─── OCR via Free OCR.space API ─────────────────────────────────────────────
// Mengganti Google Vision dengan API gratis yang tidak butuh kartu kredit
async function callOCRSpace(base64Image: string): Promise<string> {
  const formData = new FormData();
  formData.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  // Engine 2 seringkali lebih bagus untuk angka/struk
  formData.append('OCREngine', '2');

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      // 'K88537559188957' adalah public free key, atau gunakan 'helloworld'. 
      // Untuk produksi, Anda bisa daftar gratis di ocr.space
      'apikey': 'K88537559188957',
    },
    body: formData,
  });

  const json = await response.json();
  console.log('OCR API Response:', JSON.stringify(json).substring(0, 500));

  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.[0] || 'OCR.space API Error');
  }

  const text = json.ParsedResults?.[0]?.ParsedText || '';
  if (!text.trim()) {
    throw new Error('Tidak ada teks yang terdeteksi pada gambar');
  }
  return text;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [step, setStep] = useState<'camera' | 'processing' | 'confirm'>('camera');
  const [ocrText, setOcrText] = useState('');
  const [parsedTitle, setParsedTitle] = useState('');
  const [parsedAmount, setParsedAmount] = useState('');
  const [parsedCat, setParsedCat] = useState('other');
  const [parsedType, setParsedType] = useState<'spending' | 'earning'>('spending');
  const [stable, setStable] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (step === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [step, pulseAnim]);

  // Get user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Accelerometer — deteksi apakah HP stabil
  useEffect(() => {
    Accelerometer.setUpdateInterval(400);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      // Stabil jika mendekati 1G (gravitasi) tanpa gerakan
      setStable(Math.abs(magnitude - 1) < 0.15);
    });
    return () => sub.remove();
  }, []);

  // ── Take photo & process ────────────────────────────────────────────────
  const takePicture = async () => {
    if (!stable) {
      Alert.alert('Tahan HP dengan Stabil', 'Pastikan HP tidak bergerak saat memfoto struk.');
      return;
    }
    if (!cameraRef.current) return;

    try {
      // Ambil foto dulu sebelum ganti step, karena ganti step ke 'processing' 
      // akan me-unmount komponen CameraView dan membatalkan takePictureAsync.
      // Quality diturunkan ke 0.5 agar base64 tidak terlalu besar (limit OCR.space gratis = 1MB)
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error('Gagal mengambil foto');

      setStep('processing');

      const text = await callOCRSpace(photo.base64);
      setOcrText(text);

      // Parse hasil OCR
      const title = extractMerchant(text);
      const amount = extractAmount(text);
      const type = detectType(text);
      const cat = detectCategory(text, type);

      setParsedTitle(title);
      setParsedAmount(amount);
      setParsedType(type);
      setParsedCat(cat);
      setStep('confirm');
    } catch (e: any) {
      Alert.alert('Error OCR', e.message || 'Gagal memproses struk.');
      setStep('camera');
    }
  };

  // ── Select photo from gallery ───────────────────────────────────────────
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].base64) {
        setStep('processing');
        const text = await callOCRSpace(result.assets[0].base64);
        setOcrText(text);

        // Parse hasil OCR
        const title = extractMerchant(text);
        const amount = extractAmount(text);
        const type = detectType(text);
        const cat = detectCategory(text, type);

        setParsedTitle(title);
        setParsedAmount(amount);
        setParsedType(type);
        setParsedCat(cat);
        setStep('confirm');
      }
    } catch (e: any) {
      Alert.alert('Error Gallery', e.message || 'Gagal memproses gambar dari galeri.');
      setStep('camera');
    }
  };

  // ── Save to Supabase ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!parsedTitle.trim() || !parsedAmount) {
      Alert.alert('Error', 'Pastikan deskripsi dan nominal terisi.');
      return;
    }
    if (!userId) {
      Alert.alert('Error', 'Session tidak ditemukan.');
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        user_id: userId,
        title: parsedTitle.trim(),
        amount: parseFloat(parsedAmount) || 0,
        category: parsedCat,
        type: parsedType,
        month: getCurrentMonth(),
        date: new Date().toISOString(),
      });
      Alert.alert('Berhasil! ✅', 'Transaksi berhasil disimpan dari struk.', [
        { text: 'OK', onPress: () => setStep('camera') }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan transaksi.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render: permission not granted ──────────────────────────────────────
  if (!permission) return <View style={styles.center}><ActivityIndicator color="#b91c1c" /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <Text style={styles.headerSub}>Native API • Camera + Accelerometer</Text>
        </View>
        <View style={styles.permissionBox}>
          <AlertCircle size={48} color="#b91c1c" />
          <Text style={styles.permTitle}>Izin Kamera Diperlukan</Text>
          <Text style={styles.permDesc}>Izinkan akses kamera untuk memfoto dan scan struk belanjaan secara otomatis.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Izinkan Kamera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: CONFIRM step ─────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Konfirmasi Struk</Text>
          <Text style={styles.headerSub}>Edit jika ada yang perlu diperbaiki</Text>
        </View>
        <ScrollView style={styles.confirmContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successBadge}>
            <Check size={20} color="#16a34a" />
            <Text style={styles.successText}>Struk berhasil di-scan!</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Deskripsi / Nama Toko</Text>
            <TextInput
              style={styles.formInput}
              value={parsedTitle}
              onChangeText={setParsedTitle}
              placeholder="Nama toko atau deskripsi"
              keyboardType="default"
              returnKeyType="done"
            />

            <Text style={styles.formLabel}>Nominal (IDR)</Text>
            <TextInput
              style={styles.formInput}
              value={parsedAmount}
              onChangeText={setParsedAmount}
              keyboardType="phone-pad"
              returnKeyType="done"
              placeholder="Nominal transaksi"
            />

            <Text style={styles.formLabel}>Kategori</Text>
            <TouchableOpacity style={styles.catSelector} onPress={() => setCatModal(true)}>
              <View style={[styles.catDot, { backgroundColor: (parsedType === 'spending' ? SPEND_CATS : INCOME_CATS)[parsedCat]?.color }]} />
              <Text style={styles.catSelectorText}>{(parsedType === 'spending' ? SPEND_CATS : INCOME_CATS)[parsedCat]?.label || parsedCat}</Text>
              <Text style={{ color: '#94a3b8' }}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.formLabel}>Tipe Transaksi</Text>
            <TouchableOpacity 
              style={[styles.typeTag, parsedType === 'earning' && { backgroundColor: '#dcfce7' }]}
              onPress={() => {
                const newType = parsedType === 'spending' ? 'earning' : 'spending';
                setParsedType(newType);
                setParsedCat(newType === 'spending' ? 'other' : 'deposit');
              }}
            >
              <Text style={[styles.typeTagText, parsedType === 'earning' && { color: '#16a34a' }]}>
                {parsedType === 'spending' ? '📤 Pengeluaran (Spending)' : '📥 Pemasukan (Earning)'}
              </Text>
            </TouchableOpacity>
          </View>

          {ocrText ? (
            <View style={styles.rawCard}>
              <Text style={styles.rawTitle}>Isi Struk Lengkap (Item Belanjaan)</Text>
              <Text style={styles.rawText}>{ocrText}</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('camera')}>
              <X size={20} color="#b91c1c" />
              <Text style={styles.cancelBtnText}>Ulang</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="white" /> : (
                <>
                  <Check size={20} color="white" />
                  <Text style={styles.saveBtnText}>Simpan Transaksi</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Category Modal */}
        <Modal visible={catModal} transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Pilih Kategori</Text>
              {Object.entries(parsedType === 'spending' ? SPEND_CATS : INCOME_CATS).map(([key, val]: any) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.catOption, parsedCat === key && { backgroundColor: '#fff1f1' }]}
                  onPress={() => { setParsedCat(key); setCatModal(false); }}
                >
                  <View style={[styles.catDot, { backgroundColor: val.color }]} />
                  <Text style={styles.catOptionText}>{val.label}</Text>
                  {parsedCat === key && <Check size={18} color="#b91c1c" />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setCatModal(false)}>
                <Text style={{ color: '#64748b', fontWeight: '600' }}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Render: PROCESSING step ──────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <View style={[styles.container, styles.center]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }], backgroundColor: '#b91c1c', padding: 24, borderRadius: 24, marginBottom: 20 }}>
          <Scan size={56} color="white" />
        </Animated.View>
        <Text style={styles.processingText}>Membaca struk dengan AI...</Text>
        <Text style={styles.processingSubText}>Mengekstrak data transaksi</Text>
      </View>
    );
  }

  // ── Render: CAMERA step ──────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan Receipt</Text>
        <Text style={styles.headerSub}>Arahkan kamera ke struk belanjaan</Text>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
          {/* Overlay frame */}
          <View style={styles.frameOverlay}>
            <View style={styles.frameCornerTL} />
            <View style={styles.frameCornerTR} />
            <View style={styles.frameCornerBL} />
            <View style={styles.frameCornerBR} />
          </View>

          {/* Stability indicator */}
          <View style={styles.stabilityBar}>
            <View style={[styles.stabilityDot, { backgroundColor: stable ? '#22c55e' : '#ef4444' }]} />
            <Text style={styles.stabilityText}>{stable ? 'Stabil — Siap Foto' : 'Tahan HP dengan Stabil'}</Text>
          </View>
        </CameraView>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
          <RefreshCw size={22} color="#b91c1c" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureBtn, !stable && styles.captureBtnDisabled]}
          onPress={takePicture}
          disabled={!stable}
        >
          <Camera size={30} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.galleryBtn} onPress={pickImage}>
          <ImageIcon size={22} color="#b91c1c" />
        </TouchableOpacity>
      </View>

      <View style={styles.instructionBox}>
        <Zap size={16} color="#b91c1c" />
        <Text style={styles.instructionText}>
          Pastikan struk dalam frame, pencahayaan cukup, dan HP tidak bergerak
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#b91c1c', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#ffcdd2', fontSize: 13, marginTop: 3 },

  // Permission
  permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  permTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginTop: 20, textAlign: 'center' },
  permDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 10, lineHeight: 22 },
  permBtn: { backgroundColor: '#b91c1c', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16, marginTop: 24, elevation: 3 },
  permBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  // Camera
  cameraContainer: { flex: 1, margin: 0 },
  camera: { flex: 1 },
  frameOverlay: { position: 'absolute', top: '20%', left: '10%', right: '10%', bottom: '25%', borderRadius: 12 },
  frameCornerTL: { position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3, borderColor: 'white', borderTopLeftRadius: 8 },
  frameCornerTR: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3, borderColor: 'white', borderTopRightRadius: 8 },
  frameCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: 'white', borderBottomLeftRadius: 8 },
  frameCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3, borderColor: 'white', borderBottomRightRadius: 8 },
  stabilityBar: { position: 'absolute', bottom: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 8 },
  stabilityDot: { width: 10, height: 10, borderRadius: 5 },
  stabilityText: { color: 'white', fontSize: 13, fontWeight: '600' },

  // Controls
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 30, gap: 30, backgroundColor: 'white' },
  flipBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  captureBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#b91c1c', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  captureBtnDisabled: { backgroundColor: '#94a3b8' },
  galleryBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  instructionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 4, backgroundColor: 'white' },
  instructionText: { flex: 1, color: '#64748b', fontSize: 12, lineHeight: 18 },

  // Processing
  processingText: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginTop: 20 },
  processingSubText: { fontSize: 14, color: '#94a3b8', marginTop: 6 },

  // Confirm
  confirmContent: { flex: 1, padding: 20 },
  successBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#dcfce7', padding: 14, borderRadius: 14, marginBottom: 16 },
  successText: { color: '#16a34a', fontWeight: '700', fontSize: 15 },
  formCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 3, marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 6, marginTop: 14, letterSpacing: 0.5 },
  formInput: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 15, color: '#1e293b' },
  catSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  catSelectorText: { flex: 1, fontSize: 15, color: '#1e293b', fontWeight: '500' },
  typeTag: { backgroundColor: '#fff1f1', borderRadius: 12, padding: 14 },
  typeTagText: { color: '#b91c1c', fontWeight: '600' },
  rawCard: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 16 },
  rawTitle: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' },
  rawText: { fontSize: 11, color: '#64748b', lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  cancelBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: 'white', borderWidth: 2, borderColor: '#b91c1c', borderRadius: 16, paddingVertical: 16 },
  cancelBtnText: { color: '#b91c1c', fontWeight: 'bold', fontSize: 15 },
  saveBtn: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#b91c1c', borderRadius: 16, paddingVertical: 16, elevation: 3 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6 },
  catOptionText: { flex: 1, fontSize: 15, color: '#1e293b', fontWeight: '500' },
  modalCloseBtn: { alignItems: 'center', marginTop: 8, paddingVertical: 14, backgroundColor: '#f1f5f9', borderRadius: 14 },
});

