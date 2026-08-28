const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3030;
const root = __dirname;
const dataFile = path.join(root, 'data', 'reports.json');
const publicDir = path.join(root, 'public');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function readReports() { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function saveReports(reports) { fs.writeFileSync(dataFile, JSON.stringify(reports, null, 2)); }
function sendJson(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); }); }
function validate(input) {
  const required = ['date', 'project', 'supervisor', 'workDone', 'tomorrow'];
  return required.filter(field => !String(input[field] || '').trim());
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/reports' && req.method === 'GET') return sendJson(res, 200, readReports().sort((a, b) => b.date.localeCompare(a.date)));
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    try {
      const input = await body(req); const missing = validate(input);
      if (missing.length) return sendJson(res, 400, { error: `กรุณากรอก: ${missing.join(', ')}` });
      const reports = readReports(); const report = { id: `rpt-${crypto.randomUUID().slice(0, 8)}`, ...input, progress: Number(input.progress) || 0, manpower: Number(input.manpower) || 0, createdAt: new Date().toISOString() };
      reports.push(report); saveReports(reports); return sendJson(res, 201, report);
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  const match = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (match && (req.method === 'PATCH' || req.method === 'DELETE')) {
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
