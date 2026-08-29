// Daily Report Keep-Alive — ปลุก Render server ทุก 10 นาที ไม่ให้เข้าโหมด sleep
const http = require('http');
const URL_APP = process.env.APP_URL || 'https://daily-report-engineering.onrender.com/';
const INTERVAL_MIN = 10;

function ping() {
  const request = http.get(URL_APP, (res) => {
    console.log(`[${new Date().toLocaleTimeString('th-TH')}] ping -> ${res.statusCode} ${res.statusCode === 200 || res.statusCode === 302 ? 'OK ✓' : '(ยังตอบสนอง)'}`);
    res.resume();
  });
  request.on('error', (err) => console.log(`[${new Date().toLocaleTimeString('th-TH')}] ping ล้มเหลว: ${err.message}`));
  request.setTimeout(30000, () => { request.destroy(); console.log('[timeout] ping หมดเวลา — จะลองใหม่รอบหน้า'); });
}

console.log(`=== Keep-Alive เริ่มทำงาน ===\nปลุก: ${URL_APP}\nทุก: ${INTERVAL_MIN} นาที (ปิดหน้าต่างนี้ = หยุดปลุก)\n`);
ping();
setInterval(ping, INTERVAL_MIN * 60 * 1000);