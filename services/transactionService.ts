import { supabase } from '../lib/supabase';

export interface Transaction {
  id?: string;
  user_id?: string;
  title: string;
  amount: number;
  category: string;
  type: 'spending' | 'earning';
  month: string;
  date?: string;
  latitude?: number;
  longitude?: number;
  receipt_url?: string;
  created_at?: string;
}

// ─── GET transactions per user per bulan ───────────────────────────────────
export async function getTransactions(userId: string, month?: string): Promise<Transaction[]> {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (month) {
    query = query.eq('month', month);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── GET transactions untuk beberapa bulan sekaligus ──────────────────────
export async function getTransactionsMultiMonth(userId: string, months: string[]): Promise<Transaction[]> {
  if (months.length === 0) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .in('month', months)
    .order('month', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}


// ─── GET semua bulan yang punya data (untuk selector bulan) ────────────────
export async function getAvailableMonths(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('month')
    .eq('user_id', userId);

  if (error) throw error;
  const months = [...new Set((data || []).map((t: any) => t.month))];
  return months;
}

// ─── ADD transaksi baru ────────────────────────────────────────────────────
export async function addTransaction(tx: Transaction): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert([tx])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── DELETE transaksi ──────────────────────────────────────────────────────
export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ─── GET profil user (limit bulanan) ──────────────────────────────────────
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ─── UPSERT profil user ────────────────────────────────────────────────────
export async function upsertProfile(userId: string, updates: { full_name?: string; monthly_limit?: number }) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── REALTIME subscription ─────────────────────────────────────────────────
export function subscribeToTransactions(userId: string, callback: (transactions: Transaction[]) => void) {
  return supabase
    .channel(`transactions:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userId}`,
      },
      async () => {
        // Refetch on any change
        try {
          const currentMonth = getCurrentMonth();
          const txs = await getTransactions(userId, currentMonth);
          callback(txs);
        } catch (e) {
          console.error('Realtime fetch error:', e);
        }
      }
    )
    .subscribe();
}

// ─── Helper: get current month string ─────────────────────────────────────
export function getCurrentMonth(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Helper: get list of last 12 months ───────────────────────────────────
export function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  }
  return months;
}
