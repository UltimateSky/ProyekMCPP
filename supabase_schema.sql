-- =====================================================
-- FINANCIAL DIARY — SUPABASE SCHEMA
-- Jalankan di: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. ENABLE UUID EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABEL PROFILES (data user tambahan)
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name       TEXT,
  monthly_limit   DECIMAL(15,2) DEFAULT 5000000,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABEL TRANSACTIONS (semua transaksi)
CREATE TABLE IF NOT EXISTS public.transactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL,
  amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'other',
  type        TEXT CHECK (type IN ('spending', 'earning')) NOT NULL,
  month       TEXT NOT NULL,            -- Format: "April 2026"
  date        TIMESTAMPTZ DEFAULT NOW(),
  latitude    DECIMAL(10,8),            -- Untuk Geotagging
  longitude   DECIMAL(11,8),            -- Untuk Geotagging
  receipt_url TEXT,                     -- URL foto struk (opsional)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INDEX untuk performa query
CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_month      ON public.transactions(month);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_month ON public.transactions(user_id, month);

-- 5. ROW LEVEL SECURITY (RLS) — penting untuk keamanan!
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa lihat/edit data milik sendiri
CREATE POLICY "profiles: users own data"
  ON public.profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "transactions: users own data"
  ON public.transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. TRIGGER: Auto-create profile saat user baru register
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, monthly_limit)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    5000000
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. REALTIME — enable untuk tabel transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- =====================================================
-- SELESAI! Schema berhasil dibuat.
-- =====================================================
