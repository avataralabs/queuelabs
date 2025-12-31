-- Tambah kolom platform (nullable dulu untuk backward compatibility)
ALTER TABLE schedule_slots ADD COLUMN platform text;

-- Update existing slots untuk set platform dari profile
UPDATE schedule_slots 
SET platform = (SELECT platform FROM profiles WHERE profiles.id = schedule_slots.profile_id)
WHERE platform IS NULL;

-- Set NOT NULL setelah data di-populate
ALTER TABLE schedule_slots ALTER COLUMN platform SET NOT NULL;