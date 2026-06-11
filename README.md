# Financial Diary — Expense & Income Tracker

A professional, cross-platform mobile application developed using **React Native (Expo)** and **TypeScript** for the Even Semester 2025/2026 final exam of **IF670 Cross-Platform Mobile Programming** at **Universitas Multimedia Nusantara**.

## 👥 Group Information (Kelompok 8)
*   **Study Program:** Informatika (Study Program Informatics)
*   **Faculty:** Teknik dan Informatika (Engineering & Informatics)
*   **Institution:** Universitas Multimedia Nusantara (UMN)
*   **Members:**
    1.  Ferry Irawan Limiadi (00000089117)
*   **Lecturer:** Vincentius Kurniawan S.Kom., M.Eng.Sc.

---

## 🔗 Submission Links
*   **GitHub Repository:** [https://github.com/UltimateSky/ProyekMCPP](https://github.com/UltimateSky/ProyekMCPP)
*   **Application Demo Video:** [https://youtu.be/msHMMm23dew](https://youtu.be/msHMMm23dew)
*   **Application Demo Video Drive:** [https://drive.google.com/file/d/1H-P1t8rNz1RpayO7YAyfZaSmwx7nuu4-/view?usp=sharing](https://drive.google.com/file/d/1H-P1t8rNz1RpayO7YAyfZaSmwx7nuu4-/view?usp=sharing)
*   **Driver File App:** [https://drive.google.com/file/d/1ImCis7FY8TVrPf6smInWTqYMO2_AcVa2/view?usp=sharing
](https://drive.google.com/file/d/1ImCis7FY8TVrPf6smInWTqYMO2_AcVa2/view?usp=sharing
)

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
