# Upload Aja (Cloudflare Pages + KV)

Struktur (folder proyek: upload-aja):
  index.html
  functions/_lib/common.js        (helper bersama, bukan route)
  functions/api/messages.js
  functions/api/admin.js          (BARU: statistik, hapus 1 file, ubah masa simpan, file yatim)
  functions/api/cleanup.js
  functions/api/file/[id].js

## Deploy
1. Upload semua file ke repo GitHub (struktur folder harus sama).
2. Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git > pilih repo.
   Build command: kosong.
3. Buat KV: Storage & Databases > KV > Create namespace (mis. "upload-aja").
4. Pages project > Settings > Bindings > Add > KV namespace:
   Variable name: KV (persis "KV"), Namespace: upload-aja.
5. Settings > Variables and Secrets > tambah secret ADMIN_KEY (password admin).
6. Redeploy.

## Upload banyak file = 1 status
- Pilih/seret/paste banyak file sekaligus (maks. 30 file per kiriman, 20 MB per file).
- Semua file masuk ke SATU kiriman (satu nama, satu catatan, satu masa simpan), bukan kiriman terpisah.
- Cara kerja: file pertama membuat kiriman, file berikutnya ditambahkan ke kiriman yang sama
  (butuh token yang hanya diterima pengunggah, berlaku 2 jam). Jadi ukuran total tidak terbentur batas 100 MB per request.
- Jika ada file gagal, file itu tetap di daftar; tekan Upload lagi untuk menambahkannya ke kiriman yang sama.
- Kiriman banyak file punya: ringkasan jumlah/ukuran, galeri gambar, daftar file (Download per file),
  dan tombol "Unduh semua (.zip)" (tidak tersedia untuk kiriman "sekali unduh").

## Masa simpan
- Publik: 1 hari / 7 hari.
- 30 hari dan Selamanya: TERKUNCI, hanya admin (dicek di server, bukan hanya di tampilan).
  Setelah login admin, kedua opsi terbuka; setelah keluar, terkunci lagi.

## Fitur admin (menu Admin + tombol di tiap kiriman)
- Statistik: jumlah kiriman, file, total ukuran, tanpa batas, sekali unduh.
- Per kiriman: pilih (checkbox), ubah masa simpan (1/7/30/90/365 hari/selamanya, dihitung dari sekarang), hapus kiriman.
- Per file: hapus satu file saja (teks dan file lain tetap).
- Hapus massal: "Pilih semua yang tampil" lalu "Hapus terpilih".
- Hapus file lama: 7/30/90 hari, dengan/tanpa teks pesan.
- Perawatan: "Pindai file yatim" (file di KV tanpa kiriman, mis. upload terputus) dan "Hapus semua kiriman" (wajib ketik HAPUS).
- Cari & filter daftar: kata kunci, Ada file / Hanya teks / Sekali unduh / Tanpa batas.

## Fitur hemat storage
- Simpan selama: 1 / 7 hari (30 hari & selamanya khusus admin), dihapus otomatis oleh KV.
- Sekali unduh: file dihapus dari KV setelah diunduh (berlaku untuk tiap file dalam kiriman).

## Catatan
- Kiriman lama (satu file) tetap terbaca dan berfungsi seperti biasa.
- Mengubah masa simpan menulis ulang file ke KV; untuk kiriman berisi banyak file prosesnya butuh beberapa detik.

## Tampilan
- Tombol "Tema": 5 warna (Samudra, Zamrud, Anggur, Senja, Grafit) x mode Terang / Gelap / Otomatis.
