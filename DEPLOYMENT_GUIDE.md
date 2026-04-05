# 🚀 คู่มือการ Deploy Qlass ให้ใช้งานจริง

## วิธีที่ 1: Deploy บน Vercel (แนะนำ - ฟรี!) ⚡

### ขั้นตอนที่ 1: เตรียม Supabase

1. **สร้าง Project บน Supabase**
   - ไปที่ https://supabase.com
   - สมัครสมาชิก/Login
   - กด "New Project"
   - ตั้งชื่อ project, password, region (เลือก Southeast Asia)
   - รอ 2-3 นาที

2. **รัน Database Schema**
   - ไปที่ SQL Editor
   - Copy โค้ดจากไฟล์ `supabase_schema.sql`
   - Paste และกด Run
   - ตรวจสอบว่าตารางถูกสร้างครบ

3. **สร้าง Storage Bucket**
   - ไปที่ Storage
   - กด "Create a new bucket"
   - ชื่อ: `ticket-images`
   - เปิด "Public bucket"
   - กด Create

4. **เก็บ API Keys**
   - ไปที่ Settings > API
   - Copy:
     - `Project URL` (VITE_SUPABASE_URL)
     - `anon public` key (VITE_SUPABASE_ANON_KEY)

### ขั้นตอนที่ 2: Deploy บน Vercel

1. **เชื่อม GitHub กับ Vercel**
   - ไปที่ https://vercel.com
   - Login ด้วย GitHub
   - กด "Add New Project"
   - เลือก repository `Qlass`
   - กด "Import"

2. **ตั้งค่า Environment Variables**
   - ในหน้า Configure Project
   - กด "Environment Variables"
   - เพิ่ม:
     ```
     VITE_SUPABASE_URL = <Project URL จาก Supabase>
     VITE_SUPABASE_ANON_KEY = <anon key จาก Supabase>
     ```

3. **Deploy!**
   - กด "Deploy"
   - รอ 2-3 นาที
   - เสร็จแล้ว! จะได้ URL เช่น `qlass.vercel.app`

### ขั้นตอนที่ 3: ทดสอบ

1. เปิด URL ที่ได้
2. Login ด้วย PIN: `0000` (Admin)
3. ทดสอบสร้างคิว, เพิ่มพนักงาน
4. ข้อมูลจะบันทึกลง Supabase

---

## วิธีที่ 2: Deploy บน Netlify (ทางเลือก) 🌐

### ขั้นตอน:

1. **เตรียม Supabase** (เหมือนวิธีที่ 1)

2. **Deploy บน Netlify**
   - ไปที่ https://netlify.com
   - Login ด้วย GitHub
   - กด "Add new site" > "Import an existing project"
   - เลือก GitHub > เลือก repo `Qlass`
   - Build settings:
     - Build command: `npm run build`
     - Publish directory: `dist`
   - กด "Add environment variables"
     ```
     VITE_SUPABASE_URL = <Project URL>
     VITE_SUPABASE_ANON_KEY = <anon key>
     ```
   - กด "Deploy site"

3. **เสร็จแล้ว!** จะได้ URL เช่น `qlass.netlify.app`

---

## วิธีที่ 3: Deploy บน VPS/Server ของคุณเอง 🖥️

### ความต้องการ:
- Ubuntu/Debian Server
- Node.js 18+
- Nginx
- Domain name (ถ้าต้องการ)

### ขั้นตอน:

1. **Clone และ Build**
   ```bash
   cd /var/www
   git clone https://github.com/korrakottum-code/Qlass.git
   cd Qlass
   npm install
   ```

2. **สร้างไฟล์ .env**
   ```bash
   nano .env
   ```
   เพิ่ม:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Build**
   ```bash
   npm run build
   ```

4. **ตั้งค่า Nginx**
   ```bash
   sudo nano /etc/nginx/sites-available/qlass
   ```
   เพิ่ม:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       root /var/www/Qlass/dist;
       index index.html;
       
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

5. **เปิดใช้งาน**
   ```bash
   sudo ln -s /etc/nginx/sites-available/qlass /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **ติดตั้ง SSL (แนะนำ)**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## 📱 ใช้งานบนมือถือ

### สร้าง PWA (Progressive Web App):

1. เปิดเว็บบนมือถือ (Chrome/Safari)
2. **Android**: กด "⋮" > "Add to Home screen"
3. **iOS**: กด "Share" > "Add to Home Screen"
4. ใช้งานเหมือน App ได้เลย!

---

## 🔒 Security Best Practices

### 1. ตั้งค่า RLS (Row Level Security) บน Supabase

```sql
-- เปิด RLS สำหรับทุกตาราง
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- สร้าง Policy (ตัวอย่าง - ปรับตามความต้องการ)
CREATE POLICY "Allow all for authenticated users" ON queues
FOR ALL USING (true);
```

### 2. เปลี่ยน PIN ของ Admin
- Login เข้าระบบ
- ไปที่ "จัดการพนักงาน"
- แก้ไข Admin
- เปลี่ยน PIN จาก `0000` เป็นอย่างอื่น

### 3. Backup ข้อมูล
- Supabase มี auto backup
- หรือ Export ข้อมูลเป็น CSV จากหน้า Export

---

## 🔄 อัปเดตระบบ

### ถ้า Deploy บน Vercel/Netlify:
1. Push code ใหม่ขึ้น GitHub
2. Vercel/Netlify จะ deploy อัตโนมัติ!

### ถ้า Deploy บน VPS:
```bash
cd /var/www/Qlass
git pull origin main
npm install
npm run build
sudo systemctl reload nginx
```

---

## 🆘 Troubleshooting

### ปัญหา: ข้อมูลไม่บันทึก
- ตรวจสอบ Environment Variables ใน Vercel/Netlify
- ตรวจสอบ Supabase API keys ถูกต้องหรือไม่

### ปัญหา: อัปโหลดรูปไม่ได้
- ตรวจสอบว่าสร้าง bucket `ticket-images` แล้ว
- ตรวจสอบว่า bucket เป็น Public

### ปัญหา: หน้าเว็บขาว/Error
- เปิด Console (F12) ดู error
- ตรวจสอบ build log ใน Vercel/Netlify

---

## 📊 ข้อมูลเพิ่มเติม

### ราคา (ถ้าใช้ฟรี):
- **Supabase Free**: 500 MB database, 1 GB storage, 2 GB bandwidth
- **Vercel Free**: Unlimited deployments, 100 GB bandwidth/month
- **Netlify Free**: 100 GB bandwidth/month

### เมื่อไหร่ต้องอัปเกรด:
- ถ้ามีคิวมากกว่า 10,000 คิว/เดือน
- ถ้ามีรูปภาพมากกว่า 1 GB
- ถ้ามีผู้ใช้งานพร้อมกันมากกว่า 50 คน

---

## ✅ Checklist ก่อน Go Live

- [ ] ตั้งค่า Supabase เรียบร้อย
- [ ] สร้าง Storage bucket
- [ ] Deploy บน Vercel/Netlify สำเร็จ
- [ ] ทดสอบสร้างคิว
- [ ] ทดสอบเพิ่มพนักงาน
- [ ] ทดสอบ Export ข้อมูล
- [ ] ทดสอบแจ้งปัญหา (Ticket)
- [ ] เปลี่ยน PIN ของ Admin
- [ ] เพิ่มพนักงานจริง
- [ ] เพิ่มสาขาจริง
- [ ] เพิ่มหัตถการจริง
- [ ] ทดสอบบนมือถือ
- [ ] แชร์ลิงก์ให้ทีม

---

## 🎉 พร้อมใช้งาน!

เมื่อทำตาม checklist ครบแล้ว ระบบพร้อมใช้งานจริง!

**URL ตัวอย่าง**:
- Vercel: `https://qlass.vercel.app`
- Netlify: `https://qlass.netlify.app`
- Custom domain: `https://qlass.yourdomain.com`

**Support**:
- GitHub Issues: https://github.com/korrakottum-code/Qlass/issues
- Documentation: อ่านไฟล์ README.md, SUPABASE_SETUP.md

---

**สร้างโดย**: Qlass Team  
**Version**: 1.0.0  
**Last Updated**: April 2026
