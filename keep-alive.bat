@echo off
title Daily Report Keep-Alive
echo เริ่มปลุก server (ทุก 10 นาที) - ห้ามปิดหน้าต่างนี้
node "%~dp0keep-alive.js"
pause