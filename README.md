# Daily Report Engineering

ระบบบันทึกรายงานประจำวันสำหรับงานวิศวกรรม มี frontend และ backend ในโปรเจกต์เดียว

## เริ่มใช้งาน

ต้องมี Node.js 18 ขึ้นไป จากนั้นเปิด Terminal ในโฟลเดอร์นี้และรัน:

```powershell
npm start
```

เปิด `http://localhost:3030`

ข้อมูลถูกเก็บไว้ใน `data/reports.json` และ API อยู่ที่ `/api/reports`

## Deploy ฟรีด้วย Render

อัปโหลดโปรเจกต์นี้ขึ้น GitHub แล้วสร้าง Render Web Service จาก repository โดย Render จะอ่านค่าจาก `render.yaml` ให้อัตโนมัติ

หมายเหตุ: Free Web Service จะหยุดชั่วคราวเมื่อไม่มีการใช้งาน และพื้นที่เก็บไฟล์เป็นชั่วคราว ข้อมูล JSON อาจหายเมื่อมีการ deploy ใหม่ หากใช้งานจริงควรเปลี่ยนเป็นฐานข้อมูลถาวร
