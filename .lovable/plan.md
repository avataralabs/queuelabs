

## Root Cause Analysis: TikTok Multi-Post Bug

### Masalah yang Ditemukan

Frontend ContentPage.tsx memiliki **race condition** saat melakukan multi-platform assignment. Ketika user memilih beberapa platform sekaligus, sistem tidak menggunakan atomic locking yang sudah ada di database.

### Technical Details

**Alur saat ini (bermasalah):**
1. User pilih konten dan beberapa platform (TikTok, Instagram, YouTube)
2. Frontend loop melalui platform satu per satu
3. `findNextAvailableSlot()` menggunakan cache lokal (`occupiedSlotDates`) untuk cek ketersediaan
4. Konten pertama di-assign via `updateContent.mutateAsync()`
5. Cache **TIDAK** langsung terupdate
6. Konten berikutnya juga mencari slot → menemukan slot pada **waktu yang sama**
7. Hasil: Multiple konten terjadwal pada waktu yang sama untuk profil yang sama

**Data Evidence:**
```text
Profile: MamiInez
Date: 2026-01-29 09:00 UTC (16:00 WIB)
Content IDs:
  - 8b646f1e... → slot de5af357 (TikTok, 23:00 WIB)
  - 8cce676a... → slot 81566b9f (Instagram, 23:00 WIB)
Upload times: Selisih 330ms (race condition!)
```

### Solusi yang Direkomendasikan

#### Option A: Update Local Cache Setelah Assignment (Quick Fix)
- Tambahkan slot+date ke `occupiedSlotDates` secara lokal setelah setiap assignment berhasil
- Pros: Minimal code change
- Cons: Tidak 100% atomic jika ada concurrent requests dari browser lain

#### Option B: Gunakan RPC Atomic Function dari Frontend (Recommended)
- Buat edge function baru atau modifikasi flow untuk menggunakan `assign_next_available_slot` RPC
- Frontend memanggil edge function untuk setiap assignment
- Pros: Fully atomic, consistent dengan API external
- Cons: Lebih lambat karena network roundtrip per assignment

#### Option C: Batch RPC Function
- Buat RPC function baru `batch_assign_content` yang menerima array platform
- Single database call dengan locking
- Pros: Atomic dan efisien
- Cons: Butuh migration baru

### Implementation Plan (Option A + Local Cache Fix)

**File: `src/pages/ContentPage.tsx`**

1. Tambahkan state untuk track slot yang baru di-assign dalam batch saat ini:
```typescript
const [pendingAssignments, setPendingAssignments] = useState<Map<string, Set<string>>>(new Map());
```

2. Modifikasi `findNextAvailableSlot` untuk juga memeriksa pending assignments:
```typescript
const isOccupied = occupiedDates?.has(dateStr) || 
                   pendingAssignments.get(slot.id)?.has(dateStr);
if (isOccupied) continue;
```

3. Update `handleAssign` untuk menambahkan ke pending assignments setelah setiap assignment:
```typescript
// After successful assignment
setPendingAssignments(prev => {
  const newMap = new Map(prev);
  if (!newMap.has(nextSlot.slotId)) {
    newMap.set(nextSlot.slotId, new Set());
  }
  newMap.get(nextSlot.slotId)!.add(dateStr);
  return newMap;
});
```

4. Clear pending assignments saat dialog ditutup atau query refetch

### Additional Safeguards

Sebagai backup, pastikan unique index database tetap berfungsi:
- Index sudah ada: `idx_contents_unique_slot_datetime`
- Tapi index hanya mencegah `(slot_id, scheduled_at)` yang sama
- Tidak mencegah slot berbeda pada waktu yang sama untuk profil yang sama

**Recommendation tambahan:** Buat constraint baru untuk mencegah assignment pada waktu yang sama untuk profil yang sama (jika ini memang behavior yang tidak diinginkan).

