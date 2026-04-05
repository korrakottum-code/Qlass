# 🔍 แก้ไขหน้าขาว - Vercel Environment Variables

## ปัญหา: หน้าเว็บขาว

**สาเหตุ**: ไม่ได้ตั้งค่า Environment Variables ใน Vercel

---

## ✅ วิธีแก้ไข

### ขั้นตอนที่ 1: ตรวจสอบ Environment Variables

1. ไปที่ **Vercel Dashboard**: https://vercel.com/dashboard
2. เลือก Project **"qlass"**
3. ไปที่ **Settings** > **Environment Variables**
4. ตรวจสอบว่ามีตัวแปรนี้หรือไม่:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### ขั้นตอนที่ 2: เพิ่ม Environment Variables

ถ้ายังไม่มี ให้เพิ่ม:

1. กด **"Add New"**
2. เพิ่มตัวแปรทั้ง 2 ตัว:

**Variable 1:**
```
Name: VITE_SUPABASE_URL
Value: <Project URL จาก Supabase>
Environment: Production, Preview, Development (เลือกทั้ง 3)
```

**Variable 2:**
```
Name: VITE_SUPABASE_ANON_KEY
Value: <anon key จาก Supabase>
Environment: Production, Preview, Development (เลือกทั้ง 3)
```

3. กด **"Save"**

### ขั้นตอนที่ 3: Redeploy

1. ไปที่ **Deployments** tab
2. เลือก deployment ล่าสุด
3. กดปุ่ม **"⋯"** (3 จุด)
4. เลือก **"Redeploy"**
5. เลือก **"Use existing Build Cache"** (ไม่ต้องติ๊ก)
6. กด **"Redeploy"**

---

## 🔑 หา Supabase Keys

### ที่ Supabase Dashboard:

1. ไปที่ https://supabase.com/dashboard
2. เลือก Project ของคุณ
3. ไปที่ **Settings** > **API**
4. Copy:
   - **Project URL** → ใส่ใน `VITE_SUPABASE_URL`
   - **anon public key** → ใส่ใน `VITE_SUPABASE_ANON_KEY`

---

## 🔍 ตรวจสอบ Error (ถ้ายังไม่ได้)

### เปิด Browser Console:

1. กด **F12** (Windows/Linux) หรือ **Cmd+Option+I** (Mac)
2. ไปที่ tab **Console**
3. ดู error message
4. มักจะเห็น:
   ```
   Failed to fetch
   supabaseUrl is required
   Invalid API key
   ```

---

## ✅ Checklist

- [ ] ตรวจสอบว่ามี Environment Variables ใน Vercel
- [ ] ตั้งค่า `VITE_SUPABASE_URL`
- [ ] ตั้งค่า `VITE_SUPABASE_ANON_KEY`
- [ ] เลือก Environment: Production, Preview, Development
- [ ] Redeploy
- [ ] รอ 1-2 นาที
- [ ] Refresh หน้าเว็บ
- [ ] ควรเห็นหน้า Login แล้ว!

---

## 📸 ตัวอย่าง Environment Variables ที่ถูกต้อง

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHh4eHh4eHh4eHgiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDE1NTc2MDAwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🆘 ถ้ายังไม่ได้

ส่ง screenshot ของ:
1. Vercel > Settings > Environment Variables
2. Browser Console (F12)
3. Supabase > Settings > API

เพื่อให้ช่วยแก้ไขต่อ
