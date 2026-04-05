-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Branches Table
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Procedures Table
CREATE TABLE procedures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  blocks INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  room_type TEXT CHECK (room_type IN ('M', 'T')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Promos Table
CREATE TABLE promos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL,
  price NUMERIC(10, 2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Rooms Table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('M', 'T')),
  notes TEXT,
  open_block INTEGER NOT NULL,
  close_block INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Room Schedules Table
CREATE TABLE room_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  date DATE, -- Nullable for regular/everyday schedule
  available BOOLEAN DEFAULT true,
  start_block INTEGER NOT NULL,
  end_block INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Staff Table
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  nickname TEXT,
  phone TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  pin TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  commission_rate_new NUMERIC(10, 2) DEFAULT 0,
  commission_rate_old NUMERIC(10, 2) DEFAULT 0,
  commission_rate_course NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Queues Table
CREATE TABLE queues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL,
  promo_id UUID REFERENCES promos(id) ON DELETE SET NULL,
  price NUMERIC(10, 2),
  note TEXT,
  customer_type TEXT CHECK (customer_type IN ('new', 'old', 'course')),
  date DATE NOT NULL,
  time_block INTEGER,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  status_note TEXT,
  recorded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OPTIONAL: Insert mock data if needed to test the application quickly
-- Insert initial sample branches
INSERT INTO branches (id, name) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'สาขาขอนแก่น'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'สาขาสยาม');

-- Insert initial sample procedures
INSERT INTO procedures (id, name, blocks, category, room_type) VALUES 
('11111111-1111-1111-1111-111111111111', 'Botox', 3, 'Injection', 'M'),
('22222222-2222-2222-2222-222222222222', 'Filler', 4, 'Injection', 'M'),
('33333333-3333-3333-3333-333333333333', 'Laser CO2', 6, 'Laser', 'T');

-- 8. Tickets Table (Issue Reporting System)
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT CHECK (category IN ('bug', 'feature', 'question', 'other')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  reported_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  image_urls TEXT[], -- Array of image URLs from Supabase Storage
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster queries
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_reported_by ON tickets(reported_by);
CREATE INDEX idx_tickets_branch_id ON tickets(branch_id);

-- Insert initial staff (Pin: 0000 and 1234)
INSERT INTO staff (id, name, nickname, role, pin, branch_id) VALUES 
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ผู้ดูแลระบบ', 'Admin', 'superadmin', '0000', NULL),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'น้องแนน', 'แนน', 'cashier', '1234', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
