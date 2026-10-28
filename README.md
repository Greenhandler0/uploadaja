# Upload Aja (Cloudflare Pages + KV)

Struktur (folder proyek: upload-aja):
  index.html
  functions/api/messages.js
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

## Upload banyak file
- Pilih beberapa file sekaligus (Ctrl/Shift/Cmd di dialog), seret banyak file, atau paste banyak file. Maks. 30 file per upload, 20 MB per file.
- Tiap file dikirim berurutan sebagai satu kiriman sendiri (ada progres per file dan total). Catatan teks ikut di kiriman pertama.
- File yang gagal tetap ada di daftar, tinggal tekan Upload lagi. Backend tidak berubah.

## Fitur hemat storage
- Simpan selama: 1 / 7 / 30 hari / tanpa batas (dihapus otomatis oleh KV).
- Sekali unduh: file dihapus dari KV setelah diunduh.
- Admin > Hapus file lama: bersihkan file (atau pesan + file) yang lebih lama dari 7/30/90 hari.

## Tampilan
- Tombol "Download" di setiap file, dan "Unduh .txt" untuk teks.
- Tombol "Tema": 5 warna (Samudra, Zamrud, Anggur, Senja, Grafit) x mode Terang / Gelap / Otomatis.
  Pilihan tersimpan di browser (localStorage).
