-- HN Customers Table (synced from Pro Clinic)
-- ไม่แก้ไข table เดิม เป็น table ใหม่แยกต่างหาก

CREATE TABLE IF NOT EXISTS hn_customers (
  hn_id TEXT PRIMARY KEY,
  firstname TEXT,
  lastname TEXT,
  nickname TEXT,
  telephone TEXT,
  birthdate TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for search by phone or name
CREATE INDEX IF NOT EXISTS idx_hn_customers_telephone ON hn_customers(telephone);
CREATE INDEX IF NOT EXISTS idx_hn_customers_firstname ON hn_customers(firstname);
CREATE INDEX IF NOT EXISTS idx_hn_customers_lastname ON hn_customers(lastname);
