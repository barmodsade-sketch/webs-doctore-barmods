# BARMODS STORE — Versi Real Fullstack + Website Admin

Website jualan VPN otomatis (**QRIS ChestPay + Firebase**) lengkap dengan **Website Admin (`/admin`)** untuk mengatur **server VPN, harga & paket, biaya admin QRIS, ChestPay API Key, protokol aktif, pengumuman, mode maintenance, dan monitoring transaksi** secara real-time tanpa perlu deploy ulang!

## Struktur Proyek Ringkas

```text
barmods-store-real/
├── index.html          # Website Toko Pembeli (HTML+CSS+JS jadi 1 file)
├── admin.html          # Website Admin /admin (HTML+CSS+JS jadi 1 file)
├── api/
│   ├── _firebase.js    # Helper Firebase Admin SDK & verifikasi token
│   ├── admin.js        # API Admin (CRUD Server, Paket Harga, Setting Toko, Stats)
│   ├── payment.js      # API ChestPay QRIS Real (deposit, cek status, cancel/expire)
│   └── vpn.js          # API Create VPN & Ganti Protokol (baca setting dari Firestore)
├── vercel.json         # Clean URLs (/ dan /admin)
├── package.json        # Hanya 1 dependency: firebase-admin
├── .env.example        # Contoh Environment Variables Vercel
└── .gitignore
```

## Langkah Deploy (GitHub → Vercel)

### 1. Setup Firebase
1. Buka [Firebase Console](https://console.firebase.google.com) → buat project baru.
2. **Authentication → Sign-in method**: aktifkan **Google** dan **Email/Password**.
3. **Firestore Database → Create Database** (mode Production), lalu pasang Rules aman berikut di tab **Rules**:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read: if request.auth != null && request.auth.uid == userId;
       }
       match /orders/{orderId} {
         allow read: if request.auth != null && resource.data.uid == request.auth.uid;
       }
       match /private_config/{doc} {
         allow read, write: if false;
       }
     }
   }
   ```
   *(Semua penulisan order, akun VPN, server, harga, dan ChestPay API Key diproses aman lewat Vercel Serverless API menggunakan Firebase Admin SDK!)*
4. **Project Settings → General → Your apps (`</>`)**: salin `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`.
5. **Project Settings → Service accounts → Generate new private key**: salin seluruh isi file JSON tersebut (jadikan 1 baris) untuk `FIREBASE_SERVICE_ACCOUNT`.

### 2. Push ke GitHub & Deploy ke Vercel
1. Push folder `barmods-store-real` ke repository GitHub baru.
2. Buka [Vercel](https://vercel.com) → **Add New Project** → import repo GitHub tersebut.
3. Masukkan variabel dari `.env.example` ke **Environment Variables** Vercel (`ADMIN_EMAILS`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_SERVICE_ACCOUNT`), lalu klik **Deploy**.
4. Tambahkan domain Vercel kamu (misal `barmods.vercel.app`) ke **Firebase Authentication → Settings → Authorized domains**.
5. Buka `https://domain-vercel-kamu.vercel.app/admin`, login pakai Gmail yang kamu tulis di `ADMIN_EMAILS`, lalu tambah **Server VPN**, atur **Paket & Harga**, dan masukkan **ChestPay API Key** langsung dari Website Admin!
