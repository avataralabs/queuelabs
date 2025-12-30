-- Hapus 3 user yang tidak ada di list dari auth.users
-- Cascade akan otomatis menghapus data terkait di semua table

-- Hapus coba@apaaja.com
DELETE FROM auth.users WHERE id = 'ece328a8-3f54-4ddb-accd-322294fecb29';

-- Hapus coba@cobacoba.com  
DELETE FROM auth.users WHERE id = '1cd68047-817e-483e-8acb-7c2aa17ff0f6';

-- Hapus bobby@avataralabs.ai
DELETE FROM auth.users WHERE id = '1e634363-f812-4544-aec1-34c37a2ef288';