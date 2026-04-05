# 📦 Supabase Storage Setup Guide

## วิธีตั้งค่า Storage สำหรับรูปภาพ Ticket

### วิธีที่ 1: ใช้ SQL Editor (แนะนำ) ⚡

1. เข้าไปที่ [Supabase Dashboard](https://app.supabase.com)
2. เลือก Project ของคุณ
3. ไปที่ **SQL Editor** (เมนูด้านซ้าย)
4. คลิก **New Query**
5. Copy โค้ดจากไฟล์ `setup-supabase-storage.sql` และวางใน Editor
6. กด **Run** หรือ **Ctrl/Cmd + Enter**

### วิธีที่ 2: ใช้ UI Dashboard (ง่ายกว่า) 🖱️

#### ขั้นตอนที่ 1: สร้าง Bucket

1. เข้าไปที่ [Supabase Dashboard](https://app.supabase.com)
2. เลือก Project ของคุณ
3. ไปที่ **Storage** (เมนูด้านซ้าย)
4. กด **Create a new bucket**
5. กรอกข้อมูล:
   - **Name**: `ticket-images`
   - **Public bucket**: ✅ เปิด (เพื่อให้ดูรูปได้)
   - **File size limit**: ตั้งเป็น `5 MB` (หรือตามต้องการ)
   - **Allowed MIME types**: `image/*` (หรือเว้นว่างเพื่อรับทุกไฟล์)
6. กด **Create bucket**

#### ขั้นตอนที่ 2: ตั้งค่า Policies (ถ้าจำเป็น)

ถ้า bucket เป็น Public แล้ว ไม่ต้องตั้งค่าเพิ่ม แต่ถ้าต้องการควบคุมเพิ่มเติม:

1. ไปที่ **Storage** > **Policies**
2. เลือก bucket `ticket-images`
3. กด **New Policy**
4. เลือก template หรือสร้างเอง:

**Policy สำหรับอ่านรูป (Public Read)**:
```sql
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-images');
```

**Policy สำหรับอัปโหลด**:
```sql
CREATE POLICY "Allow Upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-images');
```

**Policy สำหรับลบ**:
```sql
CREATE POLICY "Allow Delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'ticket-images');
```

### ✅ ตรวจสอบว่าตั้งค่าสำเร็จ

1. ไปที่ **Storage** > **ticket-images**
2. ลองอัปโหลดรูปทดสอบ
3. คลิกที่รูป แล้วกด **Get URL**
4. ถ้าได้ URL และเปิดดูได้ = สำเร็จ! 🎉

### 🔗 ตัวอย่าง URL ที่ได้

```
https://hjuvtsjjtucdirlkdgwa.supabase.co/storage/v1/object/public/ticket-images/tickets/1234567890-abc123.jpg
```

### 🛠️ Troubleshooting

#### ปัญหา: อัปโหลดรูปไม่ได้
- ตรวจสอบว่า bucket เป็น **Public** หรือมี Policy สำหรับ INSERT
- ตรวจสอบ file size limit
- ตรวจสอบ MIME type ที่อนุญาต

#### ปัญหา: ดูรูปไม่ได้
- ตรวจสอบว่า bucket เป็น **Public**
- ตรวจสอบว่ามี Policy สำหรับ SELECT
- ตรวจสอบ URL ว่าถูกต้อง

#### ปัญหา: ลบรูปไม่ได้
- ตรวจสอบว่ามี Policy สำหรับ DELETE
- ตรวจสอบว่า path ของไฟล์ถูกต้อง

### 📊 ขนาดไฟล์แนะนำ

- **รูปภาพทั่วไป**: 1-5 MB
- **Screenshot**: 500 KB - 2 MB
- **รูปคุณภาพสูง**: 5-10 MB

### 🔒 Security Best Practices

1. **ตั้ง File Size Limit**: ป้องกันการอัปโหลดไฟล์ใหญ่เกินไป
2. **จำกัด MIME Types**: รับเฉพาะไฟล์รูปภาพ (`image/*`)
3. **ใช้ RLS Policies**: ควบคุมการเข้าถึงอย่างละเอียด
4. **ตั้งชื่อไฟล์แบบ Random**: ป้องกันการเดาชื่อไฟล์

### 📝 หมายเหตุ

- Bucket ที่เป็น **Public** = ทุกคนดูรูปได้ถ้ารู้ URL
- ถ้าต้องการความปลอดภัยสูง ให้ตั้งเป็น **Private** และใช้ Signed URLs
- ระบบปัจจุบันใช้ Public bucket เพื่อความสะดวก

### 🚀 พร้อมใช้งาน!

หลังจากตั้งค่าเสร็จแล้ว:
1. ไปที่หน้า "🎫 แจ้งปัญหาระบบ"
2. กด "+ แจ้งปัญหาใหม่"
3. แนบรูปภาพ
4. ส่งคำร้อง
5. รูปจะถูกอัปโหลดไป Supabase Storage อัตโนมัติ!

---

**หมายเหตุ**: ปัจจุบันระบบยังใช้ Local State ถ้าต้องการให้บันทึกลง Supabase จริงๆ ต้องแก้ไข `createTicket` function ใน App.jsx ให้เรียกใช้ `uploadTicketImage` และ `createTicket` จาก `ticketService.js`
