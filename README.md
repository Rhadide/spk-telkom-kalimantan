# SPK AHP-SAW — Sistem Pendukung Keputusan Prioritas Pelanggan B2B
### Telkom Regional IV Kalimantan

> Sistem berbasis web untuk mendukung pengambilan keputusan prioritas pelanggan enterprise (B2B) menggunakan kombinasi metode **Analytical Hierarchy Process (AHP)** dan **Simple Additive Weighting (SAW)**.

---

## Deskripsi Sistem

Sistem ini dibangun sebagai alat bantu manajemen PT Telkom Indonesia Regional IV Kalimantan untuk meranking dan memprioritaskan pelanggan B2B berdasarkan 4 kriteria utama:

| Kode | Kriteria | Keterangan |
|------|----------|------------|
| C1 | Jumlah Produk | Keberagaman produk yang digunakan pelanggan |
| C2 | Karakteristik Revenue | Rasio antara revenue scaling dan sustain |
| C3 | Durasi Kontrak | Lama hubungan bisnis (dalam bulan) |
| C4 | Total Revenue | Nilai pendapatan total dari pelanggan |

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | FastAPI (Python) |
| Frontend | HTML + Vanilla CSS + JavaScript |
| Template Engine | Jinja2 |
| Data Processing | Pandas, OpenPyXL |
| Deployment | Railway |

---

## Akses Sistem

**URL Publik:** https://web-production-a6de5.up.railway.app/

> Dapat diakses langsung melalui browser tanpa instalasi apapun.

---

## Alur Penggunaan Sistem

### 1. Buka Dashboard Analytics

Halaman pertama yang muncul adalah **Dashboard Analytics** yang menampilkan:
- Total pelanggan aktif dalam sistem
- Status konsistensi AHP (CR)
- Tabel perangkingan Top 100 pelanggan berdasarkan skor SAW
- Visualisasi bobot kriteria AHP dalam bentuk progress bar

> Pada kunjungan pertama, tekan tombol **"Refresh Analisis"** untuk menjalankan kalkulasi AHP-SAW dengan matriks default.

---

### 2. Menambah Data Pelanggan

Ada dua cara untuk menambahkan data pelanggan ke dalam sistem:

#### A. Input Manual (Form)
1. Klik menu **"Tambah Pelanggan"** di sidebar kiri
2. Isi form dengan data pelanggan:
   - Nama pelanggan / instansi
   - Jumlah produk yang digunakan (C1)
   - Revenue Scaling dan Revenue Sustain (Rp)
   - Durasi kontrak (bisa diisi dari kalender atau manual)
3. Klik **"Simpan ke Data Master"**
4. Sistem akan otomatis memperbarui dashboard dan tabel perangkingan

#### B. Import dari Excel (Batch)
1. Klik menu **"Tambah Pelanggan"** di sidebar kiri
2. Di bagian atas form, klik **"Download Template"** untuk mengunduh file Excel template
3. Buka file template, isi data pelanggan sesuai format kolom yang tersedia:

   | Kolom | Keterangan |
   |-------|------------|
   | `CUST_NAME` | Nama pelanggan / instansi |
   | `C1_PRODUK` | Jumlah produk (angka bulat) |
   | `REV_SCALING` | Revenue scaling dalam Rp |
   | `REV_SUSTAIN` | Revenue sustain dalam Rp |
   | `C3_DURASI` | Durasi kontrak dalam bulan |

4. Simpan file Excel
5. Kembali ke sistem, klik **"Import Excel"** dan pilih file yang telah diisi
6. Sistem akan memproses dan menampilkan notifikasi jumlah data yang berhasil diimport
7. Dashboard langsung diperbarui secara otomatis

---

### 3. Mengatur Bobot Kriteria (Matriks AHP)

1. Klik menu **"Pengaturan Kriteria"** di sidebar
2. Akan tampil matriks perbandingan berpasangan (default 4x4)
3. Isi nilai perbandingan antar kriteria menggunakan **Skala Saaty (1–9)**:

   | Nilai | Arti |
   |-------|------|
   | 1 | Sama penting |
   | 3 | Sedikit lebih penting |
   | 5 | Lebih penting |
   | 7 | Sangat lebih penting |
   | 9 | Mutlak lebih penting |
   | 2, 4, 6, 8 | Nilai tengah (kompromi) |

4. Nilai diagonal otomatis bernilai 1 (kriteria dibandingkan dengan dirinya sendiri)
5. Nilai resiprokal (`1/n`) otomatis terisi saat mengisi nilai seberang diagonal
6. Indikator **CR (Consistency Ratio)** akan muncul secara real-time:
   - **CR ≤ 10%** → Matriks konsisten (valid)
   - **CR > 10%** → Matriks tidak konsisten (perlu direvisi)
7. Klik **"Kalkulasi & Update Dashboard"** untuk menyimpan bobot dan memperbarui perangkingan

#### Menambah atau Menghapus Kriteria
- Klik **"+ Tambah Kriteria"** untuk menambah kolom/baris baru pada matriks
- Klik **"Hapus Kriteria"** untuk menghapus kriteria terakhir (minimal 2 kriteria)

---

### 4. Melihat Data Master Pelanggan

1. Klik menu **"Data Master Pelanggan"** di sidebar
2. Toggle antara dua tampilan:
   - **Edited (Agregat SPK)** — data yang sudah diproses dan siap dihitung
   - **Raw (Data Excel Asli)** — data transaksi mentah dari sumber
3. Gunakan kolom pencarian untuk menyaring data berdasarkan nama pelanggan
4. Setiap baris data memiliki tombol aksi:
   - **Edit** — ubah nilai kriteria pelanggan
   - **Hapus** — hapus pelanggan dari sistem

---

### 5. Melihat Executive Revenue Dashboard

1. Klik menu **"Executive Revenue"** di sidebar
2. Halaman menampilkan seluruh analisis revenue dalam satu layar tanpa scroll:
   - **Hero KPI** — Total revenue keseluruhan dan top performer
   - **Tren Revenue Bulanan** — grafik garis Jan–Des (filter: Semua / Scaling / Sustain)
   - **Revenue by Witel** — distribusi revenue per wilayah (doughnut chart)
   - **Revenue by Characteristic** — proporsi scaling vs sustain
   - **Top 5 Pelanggan** — filter berdasarkan revenue, produk, karakteristik, atau durasi

---

## Alur Ringkas (Quick Flow)

```
[Buka Sistem]
      │
      ▼
[Tambah Pelanggan]
   ├── Manual: isi form → Simpan
   └── Excel: Download Template → Isi Data → Import
      │
      ▼
[Pengaturan Kriteria]
   └── Isi matriks AHP → Pastikan CR ≤ 10% → Kalkulasi
      │
      ▼
[Dashboard Analytics]
   └── Lihat ranking pelanggan berdasarkan skor SAW
      │
      ▼
[Executive Revenue]
   └── Analisis distribusi revenue & performa per wilayah
```

---

## Instalasi Lokal (Opsional)

Jika ingin menjalankan sistem secara lokal:

```bash
# 1. Clone repository
git clone https://github.com/Rhadide/spk-telkom-kalimantan.git
cd spk-telkom-kalimantan

# 2. Install dependensi Python
pip install -r requirements.txt

# 3. Jalankan server
uvicorn main:app --reload --port 8000

# 4. Buka browser
# http://localhost:8000
```

> Pastikan Python 3.10+ sudah terinstall.

---

## Struktur Direktori

```
spk-telkom-kalimantan/
├── main.py               # Backend FastAPI — routing & kalkulasi AHP-SAW
├── requirements.txt      # Dependensi Python
├── Procfile              # Konfigurasi Railway deployment
├── data/
│   ├── PMS DSS NON POTS 2025.csv        # Data transaksi raw
│   ├── PMS DSS NON POTS 2025_Master.csv # Data agregat SPK
│   └── template_import_spk.xlsx          # Template import Excel
├── templates/
│   └── index.html        # Halaman utama (single-page app)
└── static/
    ├── style.css         # Stylesheet dark theme
    ├── script.js         # Logic frontend (AHP, SAW, chart)
    └── logotelkom.png    # Aset logo
```

---

## Metodologi

### AHP (Analytical Hierarchy Process)
Digunakan untuk menentukan **bobot relatif** tiap kriteria melalui perbandingan berpasangan. Konsistensi diukur menggunakan **Consistency Ratio (CR)** dengan threshold ≤ 10% (metode Saaty, 1980).

### SAW (Simple Additive Weighting)
Digunakan untuk menghitung **skor preferensi akhir** setiap pelanggan dengan cara mengalikan nilai ternormalisasi tiap kriteria dengan bobot AHP yang telah dihitung.

---

## Referensi

- Saaty, T.L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill, New York.
- Fishburn, P.C. (1967). *Additive Utilities with Incomplete Product Set*. Operations Research.
- PT Telkom Indonesia — Data PMS DSS Non POTS Regional IV Kalimantan 2025.

---

*Dikembangkan untuk keperluan Tugas Magang — Direktorat Enterprise & Business Service, PT Telkom Indonesia Regional IV Kalimantan.*
