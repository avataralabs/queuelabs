

## Perbaikan Konten Orphaned: Reset ke Pending

### Masalah
Konten dengan ID `4eafe8e9-d676-47b2-9472-91dc4376a602` adalah data legacy yang berstatus `assigned` tetapi tidak memiliki data penjadwalan (`platform`, `scheduled_at`, `scheduled_slot_id` semuanya NULL).

### Solusi
Update status konten tersebut menjadi `pending` dan reset field assignment-nya agar bisa di-assign ulang dengan benar menggunakan sistem atomic assignment yang baru.

### Perubahan Data

```text
Tabel: contents
ID: 4eafe8e9-d676-47b2-9472-91dc4376a602

Field yang diupdate:
- status: 'assigned' → 'pending'
- assigned_profile_id: NULL (tetap)
- scheduled_at: NULL (tetap)
- scheduled_slot_id: NULL (tetap)
- platform: NULL (tetap)
```

### Hasil
Setelah update, konten akan muncul di kolom "Pending" pada halaman Content dan bisa di-assign ulang ke profil/platform yang diinginkan melalui sistem penjadwalan yang sudah diperbaiki.

