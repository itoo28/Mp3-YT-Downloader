# 🎵 YouTube to MP3 Downloader (Single & Batch)

Aplikasi web modern berbasis lokal untuk mengunduh audio YouTube dan mengonversinya langsung ke format **MP3**. Mendukung pengunduhan satuan (*Single Download*) dengan pratinjau informasi video, serta pengunduhan banyak link sekaligus (*Batch Download*) dengan antrean, progress bar real-time, dan opsi ekspor semua file ke format `.ZIP`.

---

## ✨ Fitur Utama

- **🎵 Single Download (Unduh Satuan):**
  - Cek info video (Thumbnail, Judul, Channel, Durasi) sebelum mengunduh.
  - Pilihan kualitas audio: `128 kbps`, `192 kbps` (Standar), dan `320 kbps` (Kualitas Tinggi).
  - Indikator proses pengunduhan & konversi secara real-time.
- **📦 Batch Download (Unduh Sekaligus):**
  - Masukkan banyak link YouTube sekaligus (satu link per baris).
  - Antrean proses berurutan (*queued processing*) agar tidak membebani bandwidth.
  - Kartu status interaktif untuk tiap video (Menunggu, Mengunduh, Mengonversi, Selesai, atau Gagal).
  - Tombol unduh per file MP3.
  - Tombol **"Download Semua (.ZIP)"** untuk mengemas seluruh file batch dalam satu arsip ZIP.
- **📁 Integrasi Windows:**
  - Tombol **"Buka Folder di Explorer"** untuk langsung membuka folder penyimpanan `downloads/` di Windows Explorer.
- **⚡ Real-time Progress Tracking:**
  - Didukung oleh *Server-Sent Events (SSE)* untuk streaming kemajuan unduhan dan status konversi audio langsung ke antarmuka web.
- **🎨 UI Modern & Responsif:**
  - Desain bertema gelap (*Dark Mode*) dengan Tailwind CSS yang bersih dan nyaman di mata.

---

## 🛠️ Prasyarat Sistem

Sebelum menjalankan aplikasi, pastikan sistem Anda sudah terinstal:
1. **Node.js** (versi 18 ke atas disarankan)
2. **yt-dlp** & **FFmpeg**

### Cara Cepat Instal yt-dlp & FFmpeg di Windows:
Buka PowerShell / Terminal dan jalankan perintah berikut (menggunakan Windows Package Manager):
```powershell
winget install yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
```
*(Catatan: Paket `yt-dlp` di winget sudah otomatis mencakup dependency FFmpeg).*

---

## 🚀 Cara Menjalankan

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/itoo28/Mp3-YT-Downloader.git
   cd Mp3-YT-Downloader
   ```

2. **Instal dependensi Node.js:**
   ```bash
   npm install
   ```

3. **Jalankan server aplikasi:**
   ```bash
   npm start
   ```

4. **Buka di browser:**
   Akses antarmuka web di:
   ```
   http://localhost:3000
   ```

---

## 📂 Struktur Proyek

```text
youtube-mp3-downloader/
├── downloads/          # Folder lokal tempat file MP3 disimpan
├── public/
│   ├── app.js          # Logika frontend, SSE listener, antrean batch
│   ├── index.html      # Tampilan UI antarmuka web
│   └── style.css       # Custom styling, animasi progress & badge
├── .gitignore
├── package.json
├── README.md
└── server.js           # Server Express, child_process runner yt-dlp/ffmpeg, SSE & ZIP handler
```

---

## ⚠️ Catatan & Penafian (Disclaimer)

Aplikasi ini dibuat untuk penggunaan pribadi dan edukasi. Harap perhatikan Syarat & Ketentuan YouTube (*Terms of Service*) serta hak cipta karya sebelum mengunduh. Gunakan untuk konten bebas royalti, Creative Commons, atau media yang Anda miliki izinnya.
