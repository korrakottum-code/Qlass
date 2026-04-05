# 🚀 Supabase Setup Guide

## ขั้นตอนการตั้งค่า Supabase

### 1. สร้าง Database Tables

1. เข้าไปที่ [Supabase Dashboard](https://app.supabase.com)
2. เลือก Project ของคุณ
3. ไปที่ **SQL Editor**
4. Copy โค้ดจากไฟล์ `supabase_schema.sql` และรันใน SQL Editor

### 2. ตั้งค่า Row Level Security (RLS)

เนื่องจากระบบนี้ใช้ Anon Key ในการเข้าถึงข้อมูล ให้ปิด RLS หรือตั้งค่า Policy ดังนี้:

```sql
-- ปิด RLS สำหรับทุก table (สำหรับ internal app เท่านั้น)
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE procedures DISABLE ROW LEVEL SECURITY;
ALTER TABLE promos DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE queues DISABLE ROW LEVEL SECURITY;
```

**หมายเหตุ:** หากต้องการความปลอดภัยมากขึ้น ควรใช้ Service Role Key และตั้งค่า RLS Policy ที่เหมาะสม

### 3. ตรวจสอบ Environment Variables

ตรวจสอบว่าไฟล์ `.env` มีค่าดังนี้:

```
VITE_SUPABASE_URL=https://hjuvtsjjtucdirlkdgwa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. เริ่มใช้งาน

ระบบพร้อมใช้งานแล้ว! ข้อมูลทั้งหมดจะถูกเก็บใน Supabase

## 📊 Features

### ✅ Multi-Branch Management
- สร้างและจัดการหลายสาขาพร้อมกัน
- แต่ละสาขามีห้องและตารางเวลาของตัวเอง
- พนักงานสามารถถูกกำหนดให้กับสาขาเฉพาะ

### ✅ Role-Based Access Control
- **Admin (superadmin, head_admin, admin)**: ดูข้อมูลทุกสาขา
- **Manager & Cashier**: ดูเฉพาะข้อมูลสาขาตัวเอง

### ✅ Data Export
- Export ค่าคอมมิชชั่น (รายละเอียดและสรุป)
- Export ข้อมูลคิว
- Export สรุปรายได้
- Export ข้อมูลสาขาและพนักงาน
- รองรับการกรองตามช่วงวันที่
- ไฟล์ CSV พร้อม UTF-8 BOM สำหรับ Excel

## 🔄 การ Sync ข้อมูล

ปัจจุบันระบบยังใช้ Local State เป็นหลัก หากต้องการให้ข้อมูลถูกบันทึกลง Supabase อัตโนมัติ ต้องแก้ไข App.jsx ให้เรียกใช้ฟังก์ชันจาก `supabaseService.js`

### ตัวอย่างการใช้งาน Supabase Service:

```javascript
import { fetchBranches, createBranch } from './utils/supabaseService';

// Fetch data
const branches = await fetchBranches();

// Create new branch
const newBranch = await createBranch({ name: 'สาขาใหม่' });
```

## 🛠️ Next Steps

1. แก้ไข App.jsx ให้โหลดข้อมูลจาก Supabase เมื่อเริ่มต้น
2. แก้ไข CRUD operations ให้บันทึกลง Supabase
3. เพิ่ม Real-time subscriptions สำหรับการอัปเดตข้อมูลแบบ real-time
4. เพิ่ม Authentication ด้วย Supabase Auth (ถ้าต้องการ)
