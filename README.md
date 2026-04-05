# 🏥 Qlass - Clinic Queue Management System

ระบบจัดการคิวคลินิกความงาม พร้อมระบบจัดการหลายสาขา และ Export ข้อมูล

## ✨ Features

### 🏢 Multi-Branch Management
- จัดการหลายสาขาพร้อมกัน
- แต่ละสาขามีห้องและตารางเวลาของตัวเอง
- กำหนดพนักงานให้กับสาขาเฉพาะ

### 🔐 Role-Based Access Control
- **Admin**: ดูข้อมูลทุกสาขา
- **Manager & Cashier**: ดูเฉพาะสาขาตัวเอง

### 📥 Data Export
- Export ค่าคอมมิชชั่น (รายละเอียดและสรุป)
- Export ข้อมูลคิว
- Export สรุปรายได้
- Export ข้อมูลสาขาและพนักงาน
- กรองตามช่วงวันที่
- ไฟล์ CSV รองรับภาษาไทย

### 📋 Queue Management
- บันทึกคิวพร้อม Smart Parser
- ตารางคิวแบบ Real-time
- จัดการสถานะคิว
- ระบบห้องและตารางเวลา

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
