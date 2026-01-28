

## Rencana Perbaikan: 3 Masalah Upload dan Scheduling

### Masalah yang Ditemukan

#### 1. Double Upload TikTok
**Status:** Hampir teratasi dengan mekanisme locking yang ada. Hanya 1 kasus dalam 30 hari terakhir.

#### 2. Instagram Upload Gagal
**Root Cause:** External Upload-Post API mengembalikan `504 Gateway Time-out`. Semua 20+ upload Instagram dalam 2 hari terakhir gagal dengan error yang sama.
**Impact:** Semua konten Instagram gagal terupload walaupun sudah terjadwal.

#### 3. Slot Stacking (Penumpukan Konten)
**Root Cause:** Race condition di `assign-content` edge function. Ketika external API mengirim banyak request paralel (dalam milidetik), setiap request membaca slot availability dari database sebelum ada yang menulis - menyebabkan semua melihat slot yang sama sebagai "available".

**Evidence dari database:**
- 6 konten TikTok InfoKetua dijadwalkan ke slot 06:00 WIB tanggal yang sama
- 4 konten Instagram InfoKetua dijadwalkan ke slot 02:00 WIB tanggal yang sama
- Content creation timestamps hanya berselisih 100-300 milidetik

---

## Solusi yang Diusulkan

### Fix 1: Slot Stacking - Database-Level Unique Constraint

Tambahkan UNIQUE constraint di database untuk mencegah multiple contents di slot+date yang sama:

```sql
-- Add unique constraint on schedule slot assignment
ALTER TABLE contents 
ADD CONSTRAINT unique_slot_per_date 
UNIQUE (scheduled_slot_id, scheduled_at)
WHERE status IN ('assigned', 'scheduled');
```

**Tapi ini akan menyebabkan error untuk concurrent requests.** Solusi yang lebih baik adalah menggunakan **database-level locking**:

```sql
-- Create a function to atomically find and assign next available slot
CREATE OR REPLACE FUNCTION assign_next_available_slot(
  p_profile_id UUID,
  p_platform TEXT,
  p_content_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_slot RECORD;
  v_scheduled_at TIMESTAMPTZ;
  v_result JSON;
BEGIN
  -- Lock the slots table for this profile/platform to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text || p_platform));
  
  -- Find next available slot (implementation details)
  -- This query runs AFTER the lock is acquired
  
  -- Update content with the found slot
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

### Fix 2: Update assign-content Edge Function

Modify `assign-content` untuk menggunakan database transaction dengan advisory lock:

**File:** `supabase/functions/assign-content/index.ts`

Perubahan utama:
1. Wrap slot finding + content insert dalam satu database transaction
2. Gunakan `pg_advisory_xact_lock` untuk mencegah race condition
3. Jika slot sudah terpakai, cari slot berikutnya secara atomik

```typescript
// Instead of separate SELECT then INSERT, use a single RPC call
const { data: assignment, error } = await supabase.rpc('assign_next_available_slot', {
  p_profile_id: matchedProfile.id,
  p_platform: platform,
  p_content_id: contentId,
  p_user_id: user.id
});
```

### Fix 3: Instagram 504 Timeout - Retry dengan Exponential Backoff

**File:** `supabase/functions/process-scheduled-uploads/index.ts`

Saat ini retry mechanism hanya untuk 504, tapi perlu ditingkatkan:

1. Tambahkan retry khusus untuk Instagram dengan delay lebih panjang
2. Pisahkan retry count per platform
3. Tambahkan fallback ke async mode jika terus timeout

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAYS = [30000, 60000, 120000]; // 30s, 60s, 120s

// Platform-specific retry for Instagram (known slow)
if (uploadPlatform === 'instagram' && webhookResponse.status === 504) {
  // Mark for retry with longer interval
  await supabase.from('contents').update({
    status: 'retry_pending',
    retry_count: (content.retry_count || 0) + 1,
    next_retry_at: new Date(Date.now() + RETRY_DELAYS[retryCount]).toISOString()
  }).eq('id', content.id);
}
```

### Fix 4: Double Upload Prevention - Strengthen Lock Check

**File:** `supabase/functions/process-scheduled-uploads/index.ts`

Perkuat pengecekan double upload:

```typescript
// Before processing, check if already successfully uploaded
const { data: existingSuccess } = await supabase
  .from('upload_history')
  .select('id')
  .eq('content_id', content.id)
  .eq('status', 'success')
  .limit(1);

if (existingSuccess && existingSuccess.length > 0) {
  console.log(`⚠️ Content ${content.id} already successfully uploaded, skipping`);
  // Update content status to removed if still assigned
  await supabase.from('contents').update({
    status: 'removed',
    removed_at: new Date().toISOString()
  }).eq('id', content.id).eq('status', 'assigned');
  continue;
}
```

---

## Ringkasan Perubahan

| File | Perubahan |
|------|-----------|
| Database Migration | 1. Buat function `assign_next_available_slot` dengan advisory lock<br>2. Tambahkan kolom `retry_count` dan `next_retry_at` di `contents` |
| `supabase/functions/assign-content/index.ts` | Gunakan RPC function untuk atomic slot assignment |
| `supabase/functions/batch-assign-content/index.ts` | Gunakan RPC function untuk atomic slot assignment |
| `supabase/functions/process-scheduled-uploads/index.ts` | 1. Tambahkan check upload_history sebelum proses<br>2. Tambahkan retry logic khusus Instagram |

---

## Prioritas

1. **HIGH - Slot Stacking**: Fix race condition dengan database locking (paling berdampak)
2. **MEDIUM - Instagram Timeout**: Perlu investigasi lebih lanjut ke Upload-Post API, tapi retry mechanism bisa membantu
3. **LOW - Double Upload TikTok**: Sudah jarang terjadi, tapi strengthening lock check akan mencegah sepenuhnya

---

## Catatan Penting

- **Instagram 504 Error**: Ini adalah masalah dari external Upload-Post API. Perlu dikomunikasikan ke tim Upload-Post bahwa Instagram upload sering timeout. Retry mechanism hanya mitigasi, bukan solusi permanen.
- **External API Rate**: Jika external system (SagaLabs) terus mengirim request paralel, perlu ada rate limiting di sisi mereka atau queueing system di QueueLabs.

