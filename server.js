const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const PORT = process.env.PORT || 3030;
const root = __dirname;
// Bootstrap: create runtime data files on first run (fresh deploy)
if (!fs.existsSync(path.join(root, 'data'))) fs.mkdirSync(path.join(root, 'data'), { recursive: true });
if (!fs.existsSync(path.join(root, 'users.json')) && !fs.existsSync(path.join(root, 'data', 'users.json'))) {
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'ChangeMe123!';
  const salt = crypto.randomBytes(16).toString('hex');
  const admin = { id: 'usr-admin', username: 'admin', displayName: 'ผู้ดูแลระบบ', role: 'admin', salt, passwordHash: hashPassword(initialPassword, salt) };
  fs.writeFileSync(path.join(root, 'data', 'users.json'), JSON.stringify([admin], null, 2));
}
if (!fs.existsSync(path.join(root, 'reports.json')) && !fs.existsSync(path.join(root, 'data', 'reports.json'))) {
  fs.writeFileSync(path.join(root, 'data', 'reports.json'), JSON.stringify([], null, 2));
}
const dataFile = fs.existsSync(path.join(root, 'reports.json')) ? path.join(root, 'reports.json') : path.join(root, 'data', 'reports.json');
const usersFile = fs.existsSync(path.join(root, 'users.json')) ? path.join(root, 'users.json') : path.join(root, 'data', 'users.json');
const publicDir = fs.existsSync(path.join(root, 'public')) ? path.join(root, 'public') : root;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const sessions = new Map();

function readReports() { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function saveReports(reports) { fs.writeFileSync(dataFile, JSON.stringify(reports, null, 2)); }
function sendJson(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); }); }
function validate(input) {
  const required = ['date', 'project', 'supervisor', 'workDone', 'tomorrow'];
  return required.filter(field => !String(input[field] || '').trim());
}
function readUsers() { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); }
function saveUsers(users) { fs.writeFileSync(usersFile, JSON.stringify(users, null, 2)); }
function sanitizeUser(user) { return { id: user.id, username: user.username, displayName: user.displayName, role: user.role }; }
function lineInfo() { return { configured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_TO_ID), to: process.env.LINE_TO_ID || null }; }
function hashPassword(password, salt) { return crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex'); }
function passwordMatches(password, user) { const actual = Buffer.from(hashPassword(password, user.salt), 'hex'); const expected = Buffer.from(user.passwordHash, 'hex'); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => { const [key, ...value] = item.trim().split('='); return [key, decodeURIComponent(value.join('='))]; })); }
function currentUser(req) { const session = sessions.get(cookies(req).daily_report_session); return session && session.expiresAt > Date.now() ? session.user : null; }
function setSessionCookie(res, token, secure) { res.setHeader('Set-Cookie', `daily_report_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure ? '; Secure' : ''}`); }
function requireUser(req, res) { const user = currentUser(req); if (!user) { sendJson(res, 401, { error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }); return null; } return user; }
function lineMessage(report) {
  return [
    'แจ้งเตือน Daily Report งานวิศวกรรม',
    `วันที่: ${report.date}`,
    `โครงการ: ${report.project}`,
    `สถานที่: ${report.location || '-'}`,
    `ผู้ควบคุมงาน: ${report.supervisor}`,
    `ความคืบหน้า: ${report.progress}%`,
    `กำลังคน: ${report.manpower} คน`,
    `งานวันนี้: ${report.workDone}`,
    `ปัญหา: ${report.issues || '-'}`,
    `แผนพรุ่งนี้: ${report.tomorrow}`
  ].join('\n');
}
function notifyLine(report) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TO_ID;
  if (!token || !to) return Promise.resolve({ sent: false, reason: 'LINE is not configured' });
  const payload = JSON.stringify({ to, messages: [{ type: 'text', text: lineMessage(report) }] });
  return new Promise(resolve => {
    const request = https.request({ hostname: 'api.line.me', path: '/v2/bot/message/push', method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, response => {
      response.resume();
      resolve({ sent: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode });
    });
    request.on('error', error => resolve({ sent: false, reason: error.message }));
    request.write(payload); request.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const secureCookie = req.headers['x-forwarded-proto'] === 'https';
  if (url.pathname === '/api/auth/me' && req.method === 'GET') return sendJson(res, 200, { user: currentUser(req) });
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const input = await body(req); const user = readUsers().find(item => item.username.toLowerCase() === String(input.username || '').trim().toLowerCase());
      if (!user || !passwordMatches(String(input.password || ''), user)) return sendJson(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, expiresAt: Date.now() + 28800000 }); setSessionCookie(res, token, secureCookie);
      return sendJson(res, 200, { user: currentUser({ headers: { cookie: `daily_report_session=${token}` } }) });
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const input = await body(req); const username = String(input.username || '').trim().toLowerCase(); const password = String(input.password || ''); const displayName = String(input.displayName || '').trim();
      if (!username || !displayName || password.length < 8) return sendJson(res, 400, { error: 'กรุณากรอกข้อมูลให้ครบ และรหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      const users = readUsers(); if (users.some(item => item.username === username)) return sendJson(res, 409, { error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
      const salt = crypto.randomBytes(16).toString('hex'); const user = { id: `usr-${crypto.randomUUID().slice(0, 8)}`, username, displayName, role: 'engineer', salt, passwordHash: hashPassword(password, salt) }; users.push(user); fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
      return sendJson(res, 201, { id: user.id, username: user.username, displayName: user.displayName, role: user.role });
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const token = cookies(req).daily_report_session; sessions.delete(token); res.setHeader('Set-Cookie', 'daily_report_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return sendJson(res, 200, { ok: true }); }
  if (url.pathname === '/api/line/status' && req.method === 'GET') { if (!requireUser(req, res)) return; return sendJson(res, 200, { ...lineInfo(), autoNotify: true }); }
  if (url.pathname === '/api/line/test' && req.method === 'POST') {
    const authenticatedUser = requireUser(req, res); if (!authenticatedUser) return;
    if (authenticatedUser.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    if (!lineInfo().configured) return sendJson(res, 400, { error: 'LINE ยังไม่ได้ตั้งค่า (ขาด LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_TO_ID)' });
    const result = await notifyLine({ date: new Date().toISOString().slice(0,10), project: 'ทดสอบการแจ้งเตือน', location: 'Daily Report Engineering', supervisor: authenticatedUser.displayName, progress: 0, manpower: 0, workDone: 'ข้อความทดสอบจากระบบ Daily Report', issues: '-', tomorrow: '-' });
    if (result.sent) return sendJson(res, 200, { ok: true, status: result.status });
    return sendJson(res, 502, { error: `ส่ง LINE ไม่สำเร็จ (${result.status || result.reason || 'unknown'})` });
  }
  if (url.pathname === '/api/users' && req.method === 'POST') {
     const authenticatedUser = requireUser(req, res); if (!authenticatedUser) return;
     if (authenticatedUser.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    try { const input = await body(req); const username = String(input.username || '').trim().toLowerCase(); const password = String(input.password || ''); if (!username || password.length < 8 || !String(input.displayName || '').trim()) return sendJson(res, 400, { error: 'กรุณาระบุชื่อ, username และรหัสผ่านอย่างน้อย 8 ตัวอักษร' }); const users = readUsers(); if (users.some(item => item.username === username)) return sendJson(res, 409, { error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' }); const salt = crypto.randomBytes(16).toString('hex'); const user = { id: `usr-${crypto.randomUUID().slice(0, 8)}`, username, displayName: String(input.displayName).trim(), role: input.role === 'admin' ? 'admin' : 'engineer', salt, passwordHash: hashPassword(password, salt) }; users.push(user); saveUsers(users); return sendJson(res, 201, sanitizeUser(user)); } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/users' && req.method === 'GET') {
    const authenticatedUser = requireUser(req, res); if (!authenticatedUser) return;
    if (authenticatedUser.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    return sendJson(res, 200, readUsers().map(sanitizeUser));
  }
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const authenticatedUser = requireUser(req, res); if (!authenticatedUser) return;
    if (authenticatedUser.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    const users = readUsers(); const index = users.findIndex(item => item.id === userMatch[1]);
    if (index === -1) return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
    if (req.method === 'DELETE') {
      if (users[index].id === authenticatedUser.id) return sendJson(res, 400, { error: 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้' });
      const removed = users.splice(index, 1)[0]; saveUsers(users); return sendJson(res, 200, sanitizeUser(removed));
    }
    try {
      const input = await body(req);
      const target = users[index];
      if (target.id === authenticatedUser.id && input.role && input.role !== 'admin') return sendJson(res, 400, { error: 'ไม่สามารถลดสิทธิ์บัญชีที่กำลังใช้งานอยู่ได้' });
      if (input.displayName !== undefined && String(input.displayName).trim()) target.displayName = String(input.displayName).trim();
      if (input.role === 'admin' || input.role === 'engineer') target.role = input.role;
      if (String(input.password || '').length >= 8) { target.salt = crypto.randomBytes(16).toString('hex'); target.passwordHash = hashPassword(String(input.password), target.salt); }
      else if (input.password !== undefined && String(input.password).length) return sendJson(res, 400, { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      saveUsers(users); return sendJson(res, 200, sanitizeUser(target));
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/reports' && req.method === 'GET') { if (!requireUser(req, res)) return; return sendJson(res, 200, readReports().sort((a, b) => b.date.localeCompare(a.date))); }
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    try {
      if (!requireUser(req, res)) return;
      const input = await body(req); const missing = validate(input);
      if (missing.length) return sendJson(res, 400, { error: `กรุณากรอก: ${missing.join(', ')}` });
      if (input.image && (typeof input.image !== 'string' || input.image.length > 2000000)) return sendJson(res, 400, { error: 'แนบรูปได้สูงสุดประมาณ 1.5 MB ต่อไฟล์' });
      const reports = readReports(); const report = { id: `rpt-${crypto.randomUUID().slice(0, 8)}`, ...input, progress: Number(input.progress) || 0, manpower: Number(input.manpower) || 0, createdAt: new Date().toISOString() };
      reports.push(report); saveReports(reports); notifyLine(report); return sendJson(res, 201, report);
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  const match = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (match && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const authenticatedUser = requireUser(req, res); if (!authenticatedUser) return;
    if (req.method === 'DELETE' && authenticatedUser.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบรายงานได้' });
    const reports = readReports(); const index = reports.findIndex(report => report.id === match[1]);
    if (index === -1) return sendJson(res, 404, { error: 'ไม่พบรายงาน' });
    if (req.method === 'DELETE') { const removed = reports.splice(index, 1)[0]; saveReports(reports); return sendJson(res, 200, removed); }
    try { const input = await body(req); reports[index] = { ...reports[index], ...input, progress: Number(input.progress ?? reports[index].progress), manpower: Number(input.manpower ?? reports[index].manpower) }; saveReports(reports); return sendJson(res, 200, reports[index]); } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  const filePath = url.pathname === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, url.pathname.slice(1));
  if (!filePath.startsWith(publicDir)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, content) => { if (error) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' }); res.end(content); });
});
server.listen(PORT, () => console.log(`Daily Report running at http://localhost:${PORT}`));
