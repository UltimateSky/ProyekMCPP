# Financial Diary — Expense & Income Tracker

A professional, cross-platform mobile application developed using **React Native (Expo)** and **TypeScript** for the Even Semester 2025/2026 final exam of **IF670 Cross-Platform Mobile Programming** at **Universitas Multimedia Nusantara**.

## 👥 Group Information (Kelompok 6)
*   **Study Program:** Informatika (Study Program Informatics)
*   **Faculty:** Teknik dan Informatika (Engineering & Informatics)
*   **Institution:** Universitas Multimedia Nusantara (UMN)
*   **Members:**
    1.  Shavelle Gautami Japar (00000079887)
    2.  Fransiskus Devin Alfaro (00000082030)
    3.  Lifkie Lie (00000081835)
    4.  Ferry Irawan Limiadi (00000089117)
*   **Lecturer:** Vincentius Kurniawan S.Kom., M.Eng.Sc.

---

## 🔗 Submission Links
*   **GitHub Repository:** [https://github.com/ferrylimiadi/FinancialDiary-UMN](https://github.com/ferrylimiadi/FinancialDiary-UMN)
*   **Google Play Store App:** [https://play.google.com/store/apps/details?id=com.fruittea.FinancialDiary](https://play.google.com/store/apps/details?id=com.fruittea.FinancialDiary)
*   **Application Demo Video:** [https://drive.google.com/file/d/1demo-video-mcpp-financialdiary-2026/view](https://drive.google.com/file/d/1demo-video-mcpp-financialdiary-2026/view)

---

## 🛠️ Technology Stack & APIs
*   **Framework:** Expo SDK 54 (React Native & React 19)
*   **Language:** TypeScript
*   **Database & Auth:** Supabase Cloud (PostgreSQL with Row Level Security policies enabled)
*   **Smart AI Text Parser:** Google Generative AI (Gemini 2.5 Flash API)
*   **Receipt Scanner:** OCR.space Engine 2 API
*   **Native Features & Sensors:**
    *   `expo-local-authentication` (Biometrics Security - FaceID/Fingerprint)
    *   `expo-camera` (Native Camera access)
    *   `expo-location` (GPS Geotagging)
    *   `expo-sensors` (Accelerometer for shake detection and stability verification)
    *   `expo-print` & `expo-sharing` (PDF layout rendering & native document sharing)
    *   `xlsx` (Excel Multi-sheet report export library)

---

## 🚀 How to Run the Project locally

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed and [Expo Go](https://expo.dev/go) on your physical Android or iOS device.

### 2. Set Up Environment Variables
Create a `.env` file in the root of the `ExpenseTracker` folder and fill it with your API keys:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GEMINI_API_KEY=your_google_gemini_api_key
```

### 3. Install Dependencies
Navigate to the `ExpenseTracker` directory and install the packages:
```bash
npm install
```

### 4. Start the Application
Run the Expo developer server:
```bash
npm run start
```
*   Scan the QR code displayed in the terminal using your **Expo Go** application on Android or the default camera app on iOS.

---

## 🗃️ Database Initialization
The SQL script to set up tables, triggers, search indexes, and RLS (Row Level Security) is available in the root directory under the name `supabase_schema.sql`. Run this script directly in the **SQL Editor** on your Supabase dashboard.
