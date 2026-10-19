# DocuShrink — Client-Side PDF Compressor & Tool Suite

<p align="center">
  <img src="https://lh3.googleusercontent.com/aida/AEtjO1Vpem8ENdD30vV4yEzRuGXkOIW99cEUhAURb-nG8SOdieFo_KZG7umWFw3TlL5JdAkeVNEqwiuvt5jlVipTEgtjqwsRds4CaA2rMw4ad8e0GalRh_-IxR2ryOTC6c9-rMZkEIgHW1Lisiy39LGlahdWYchh7JMjJ5BeFN47RYryGS8AnbC4Ltuajb-n57mwFQ6G7xNUk8Do0TrMXRwnu7MJsCmnLQuV9xzdhBelW4H2MZme-MzBNzMAXQ" alt="DocuShrink Logo" width="100"/>
</p>

<p align="center">
  <strong>Aplikasi Web Kompresi & Utilitas PDF Modern, Cepat, dan 100% Privat Langsung di Peramban Web Anda.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Privacy-100%25%20Client--Side-10b981?style=flat-square" alt="Privacy"/>
  <img src="https://img.shields.io/badge/JavaScript-ES6+-f7df1e?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/TailwindCSS-v3-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Offline-Ready-6366f1?style=flat-square" alt="Offline Ready"/>
  <img src="https://img.shields.io/badge/License-MIT-dc2626?style=flat-square" alt="License"/>
</p>

---

## 🌟 Mengapa DocuShrink?

Kebanyakan alat kompresi PDF online mengharuskan Anda mengunggah dokumen penting ke server pihak ketiga. **DocuShrink** dirancang dengan filosofi **Privacy-First**:
- 🔒 **Zero Server Upload**: Seluruh proses rendering, kompresi gambar, dan penataan ulang dokumen dieksekusi 100% oleh CPU/GPU peramban Anda.
- ⚡ **Super Cepat & Ringan**: Menggunakan mesin kombinasi **PDF.js** dan **PDF-Lib** yang telah dioptimalkan secara lokal.
- 📦 **Offline-Ready**: Berkas pustaka (`vendor/`) disimpan secara lokal, aplikasi dapat beroperasi tanpa ketergantungan API pihak ketiga.

---

## ✨ Fitur Unggulan

### 1. Kompresi PDF Cerdas
- **Preset Resolusi (DPI) Fleksibel**:
  - `72 DPI`: Resolusi email/web ringan (penghematan hingga ~80%-85%).
  - `150 DPI (Rekomendasi)`: Keseimbangan optimal kejernihan teks & ukuran file (~50%-70%).
  - `200 DPI`: Sangat jernih untuk cetak dokumen resmi kantor (~35%-50%).
  - `300 DPI`: Resolusi arsip kualitas tinggi HD (~15%-30%).
- **Mode Warna**: Pilihan Full Color atau Grayscale (Hitam-Putih) untuk kompresi ekstra maksimal.
- **Prediksi Ukuran Real-Time**: Estimasi perkiraan ukuran hasil dan persentase hemat sebelum kompresi dimulai.
- **Batch Processing & ZIP Download**: Kompres banyak dokumen sekaligus dan unduh dalam 1 arsip `.zip`.

### 2. Utilitas PDF Terpadu
- 📑 **Gabung PDF**: Gabungkan beberapa dokumen PDF menjadi 1 berkas berurutan.
- ✂️ **Pisah Halaman**: Ekstrak rentang halaman tertentu (contoh: `1-3, 5`) menjadi dokumen baru.
- 🖼️ **PDF ke Gambar**: Konversi halaman PDF menjadi berkas PNG atau JPEG resolusi tinggi.
- 🔐 **Kunci PDF**: Proteksi dokumen rahasia Anda dengan kata sandi langsung di browser.

### 3. Riwayat Dinamis (IndexedDB)
- Riwayat kompresi tersimpan aman di browser lokal pengguna (**IndexedDB**).
- Kartu Bento cerdas menghitung akumulasi ruang yang berhasil dihemat secara riil.
- Fitur Unduh Ulang, Bagikan berkas, atau Bersihkan Riwayat kapan saja.

### 4. UI Modern & Mode Gelap
- Palet warna Crimson & Emerald yang dinamis dan berkelas.
- Dukungan **Dark Mode** & **Light Mode** instan.
- Desain responsif (Mobile-first, Tablet, dan Desktop).

---

## 📁 Struktur Berkas

```text
docushrink/
├── index.html           # Berkas utama aplikasi web (SPA)
├── run.bat              # Script launcher cepat untuk Windows
├── README.md            # Dokumentasi lengkap proyek
├── LICENSE              # Lisensi Open Source (MIT)
├── .gitignore           # Konfigurasi file yang diabaikan Git
├── css/
│   └── styles.css       # Styling kustom, animasi & tema gelap
├── js/
│   └── app.js           # Mesin kompresi, IndexedDB, dan interaksi UI
└── vendor/              # Pustaka client-side lokal (offline-ready)
    ├── pdf.min.js       # Mozilla PDF.js rendering engine
    ├── pdf.worker.min.js# PDF.js Web Worker
    ├── pdf-lib.min.js   # PDF-Lib manipulation library
    └── jszip.min.js     # JSZip client-side archiver
```

---

## 🚀 Cara Menjalankan Secara Lokal

### Cara 1: Menggunakan Launcher Windows (Paling Mudah)
Klik ganda berkas:
```cmd
run.bat
```
*Script akan otomatis mendeteksi server lokal Python atau langsung membuka `index.html` di peramban utama Anda.*

### Cara 2: Menggunakan Static Server (Node.js / Python / VS Code)
```bash
# Menggunakan Python
python -m http.server 8080

# Atau menggunakan Node.js (npx serve)
npx serve .
```
Buka browser ke `http://localhost:8080`.

### Cara 3: Buka Langsung Berkas HTML
Cukup klik kanan pada `index.html` -> **Open with** -> **Google Chrome** / **Microsoft Edge** / **Mozilla Firefox**.

---

## 🌐 Panduan Deploy ke Git & Cloud

Proyek ini adalah **Pure Client-Side Static Web App** (tanpa backend dan tanpa langkah build/npm build). Anda dapat langsung mengunggahnya ke hosting gratis manapun:

### 1. Upload ke GitHub
```bash
# 1. Masuk ke folder docushrink
cd docushrink

# 2. Inisialisasi Git
git init
git add .
git commit -m "feat: initial commit DocuShrink web app"

# 3. Hubungkan ke repositori GitHub Anda
git branch -M main
git remote add origin https://github.com/USERNAME/docushrink.git
git push -u origin main
```

### 2. Aktifkan GitHub Pages (Gratis)
1. Buka repositori Anda di GitHub.
2. Klik **Settings** -> **Pages**.
3. Di bagian **Build and deployment** -> **Branch**, pilih `main` dan folder `/ (root)`.
4. Klik **Save**. Aplikasi Anda langsung live di `https://USERNAME.github.io/docushrink/`!

### 3. Deploy ke Vercel / Netlify
Tinggal *import* repositori GitHub Anda ke [Vercel](https://vercel.com) atau [Netlify](https://netlify.com) tanpa perlu mengubah pengaturan build apapun (Zero Configuration).

---

## 🛠️ Teknologi yang Digunakan

- **HTML5 & Vanilla JavaScript (ES6+)**
- **Tailwind CSS** (via CDN & JIT Config)
- **Plus Jakarta Sans & Material Symbols** (Google Fonts)
- **PDF.js** (Rendering & Canvas extraction)
- **PDF-Lib** (PDF structure manipulation, merging, encryption)
- **JSZip** (Client-side ZIP packaging)
- **IndexedDB API** (Local persistent storage)

---

## 📄 Lisensi

Proyek ini didistribusikan di bawah lisensi **MIT License**. Lihat berkas [LICENSE](LICENSE) untuk detail selengkapnya.
