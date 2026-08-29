const state = { reports: [], editingId: null, user: null, pendingImage: null, users: [] };
const $ = selector => document.querySelector(selector);
const dialog = $('#reportDialog');
const form = $('#reportForm');
const loginScreen = $('#loginScreen');
const loginForm = $('#loginForm');
let registerMode = false;
const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const statusPalette = {
  completed: { label: 'เสร็จสิ้น', color: '#3c9871' },
  'in-progress': { label: 'กำลังดำเนินการ', color: '#ed6b3c' },
  planned: { label: 'วางแผน', color: '#337da4' }
};
const dateText = date => { const d = new Date(`${date}T00:00:00`); return { day: String(d.getDate()).padStart(2, '0'), month: thaiMonths[d.getMonth()], full: d.toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' }) }; };
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
function renderStatusSummary() {
  const summary = Object.entries(statusPalette).map(([key, meta]) => ({ key, ...meta, count: state.reports.filter(r => r.status === key).length }));
  const total = summary.reduce((sum, item) => sum + item.count, 0);
  const filtered = summary.filter(item => item.count > 0);
  const pie = $('#statusPieChart');
  const legend = $('#statusSummaryLegend');

  if (!pie || !legend) return;

  if (!filtered.length) {
    pie.style.background = 'conic-gradient(#e8efed 0 100%)';
    legend.innerHTML = '<div class="legend-empty">ยังไม่มีรายงาน</div>';
    return;
  }

  let current = 0;
  const gradient = filtered.map(item => {
    const start = current;
    const end = current + (item.count / total) * 100;
    current = end;
    return `${item.color} ${start}% ${end}%`;
  }).join(', ');

  pie.style.background = `conic-gradient(${gradient})`;
  legend.innerHTML = filtered.map(item => {
    const percent = total ? Math.round((item.count / total) * 100) : 0;
    return `<div class="legend-item"><span class="legend-swatch" style="background:${item.color}"></span><div><strong>${item.label}</strong><small>${item.count} รายงาน · ${percent}%</small></div></div>`;
  }).join('');
}
function render() {
  const query = $('#searchInput').value.toLowerCase(); const status = $('#statusFilter').value;
  const reports = state.reports.filter(r => (!query || `${r.project} ${r.location} ${r.workDone}`.toLowerCase().includes(query)) && (status === 'all' || r.status === status));
  $('#totalMetric').textContent = state.reports.length; $('#progressMetric').textContent = state.reports.filter(r => r.status === 'in-progress').length; $('#completeMetric').textContent = state.reports.filter(r => r.status === 'completed').length;
  const today = new Date().toISOString().slice(0,10); $('#peopleMetric').innerHTML = `${state.reports.filter(r => r.date === today).reduce((sum, r) => sum + Number(r.manpower || 0), 0)} <small>คน</small>`;
  renderStatusSummary();
  $('#reportList').innerHTML = reports.length ? reports.map(r => { const d = dateText(r.date); const deleteButton = state.user?.role === 'admin' ? `<button class="delete-button" type="button" data-delete-id="${r.id}" title="ลบรายงาน" aria-label="ลบรายงาน">×</button>` : ''; const image = r.image ? `<img class="report-thumb" src="${r.image}" alt="รูปหน้างาน" data-image="${r.id}" />` : ''; return `<article class="report-card"><div class="report-date"><strong>${d.day}</strong><span>${d.month} ${new Date(`${r.date}T00:00:00`).getFullYear()+543}</span></div><div class="report-info">${image}<div><h3>${escapeHtml(r.project)}</h3><p>${escapeHtml(r.workDone)}</p><small>${escapeHtml(r.location || 'ไม่ได้ระบุสถานที่')} · ${escapeHtml(r.supervisor)}</small></div></div><div class="report-side"><span class="badge ${r.status}">${r.status === 'completed' ? 'เสร็จสิ้น' : r.status === 'planned' ? 'วางแผน' : 'กำลังดำเนินการ'}</span><div class="bar"><i style="width:${Math.min(100, Number(r.progress)||0)}%"></i></div><strong>${Number(r.progress)||0}%</strong>${deleteButton}</div></article>`; }).join('') : '<div class="empty">ไม่พบรายงานที่ตรงกับเงื่อนไข</div>';
}
async function loadReports() { const response = await fetch('/api/reports'); if (response.status === 401) return showLogin(); state.reports = await response.json(); render(); }
function showLogin() { loginScreen.classList.remove('hidden'); document.querySelector('.app-shell').classList.add('locked'); }
function showApp(user) { state.user = user; loginScreen.classList.add('hidden'); document.querySelector('.app-shell').classList.remove('locked'); $('#currentUserName').textContent = user.displayName; const adminBtn = $('#adminNavBtn'); adminBtn.hidden = user.role !== 'admin'; render(); loadLineStatus(); if (user.role === 'admin') loadUsers(); }
async function loadLineStatus() { try { const response = await fetch('/api/line/status'); if (!response.ok) return; const info = await response.json(); const el = $('#lineStatus'); const detail = $('#lineDetail'); if (detail) detail.textContent = info.configured ? `LINE พร้อมใช้งาน (ส่งถึง: ${info.to})` : 'LINE ยังไม่ตั้งค่า — ใส่ LINE_CHANNEL_ACCESS_TOKEN และ LINE_TO_ID'; if (el) { el.textContent = info.configured ? 'LINE: พร้อมใช้งาน' : 'LINE: ยังไม่ตั้งค่า'; el.style.color = info.configured ? '#5dc391' : '#f6a16f'; } } catch { } }
async function loadUsers() { const response = await fetch('/api/users'); if (!response.ok) return; state.users = await response.json(); renderUsers(); }
function renderUsers() { const list = $('#usersList'); list.innerHTML = state.users.length ? state.users.map(u => `<div class="user-row"><div class="user-avatar">${escapeHtml((u.displayName || '?').slice(0,1))}</div><div><strong>${escapeHtml(u.displayName)}</strong><small>@${escapeHtml(u.username)} · ${u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'วิศวกร'}</small></div><div class="user-actions"><button class="small-btn" type="button" data-edit-user="${u.id}">แก้ไข</button><button class="small-btn danger" type="button" data-del-user="${u.id}">ลบ</button></div></div>`).join('') : '<div class="empty">ยังไม่มีผู้ใช้</div>'; }
const adminSection = $('#admin');
$('#adminNavBtn').addEventListener('click', event => { event.preventDefault(); document.querySelector('#dashboard').hidden = true; adminSection.hidden = false; loadLineStatus(); loadUsers(); });
$('#addUserBtn').addEventListener('click', () => openUserForm());
const userDialog = $('#userDialog'); const userForm = $('#userForm'); let editingUserId = null;
function openUserForm(user) { editingUserId = user?.id || null; $('#userFormTitle').textContent = user ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'; userForm.reset(); userForm.username.disabled = Boolean(user); userForm.username.required = !user; if (user) { userForm.displayName.value = user.displayName; userForm.role.value = user.role; userForm.username.value = user.username; } userDialog.showModal(); }
userForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(userForm)); const endpoint = editingUserId ? `/api/users/${editingUserId}` : '/api/users'; const payload = editingUserId ? { displayName: data.displayName, role: data.role, password: data.password || undefined } : { displayName: data.displayName, username: data.username, role: data.role, password: data.password }; const response = await fetch(endpoint, { method: editingUserId ? 'PATCH' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const result = await response.json().catch(() => ({})); if (!response.ok) return toast(result.error || 'บันทึกไม่สำเร็จ'); userDialog.close(); await loadUsers(); toast(editingUserId ? 'อัปเดตผู้ใช้แล้ว' : 'เพิ่มผู้ใช้แล้ว'); });
$('#closeUserDialog').addEventListener('click', () => userDialog.close()); $('#cancelUserBtn').addEventListener('click', () => userDialog.close());
$('#usersList').addEventListener('click', async event => { const edit = event.target.closest('[data-edit-user]'); if (edit) { const user = state.users.find(u => u.id === edit.dataset.editUser); if (user) return openUserForm(user); } const del = event.target.closest('[data-del-user]'); if (!del) return; const user = state.users.find(u => u.id === del.dataset.delUser); if (!user || user.id === state.user.id) return toast('ไม่สามารถลบบัญชีตัวเองได้'); if (!window.confirm(`ต้องการลบผู้ใช้ ${user.displayName} หรือไม่?`)) return; const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' }); if (!response.ok) { const err = await response.json().catch(() => ({})); return toast(err.error || 'ลบไม่สำเร็จ'); } await loadUsers(); toast('ลบผู้ใช้แล้ว'); });
$('#lineTestBtn').addEventListener('click', async () => { const btn = $('#lineTestBtn'); btn.disabled = true; btn.textContent = 'กำลังส่ง...'; const response = await fetch('/api/line/test', { method: 'POST' }); const result = await response.json().catch(() => ({})); btn.disabled = false; btn.textContent = 'ส่งข้อความทดสอบ'; toast(response.ok ? 'ส่งข้อความทดสอบไปยัง LINE แล้ว' : (result.error || 'ส่งไม่สำเร็จ')); });
function openForm(report) { state.editingId = report?.id || null; $('#formTitle').textContent = report ? 'แก้ไขรายงานประจำวัน' : 'สร้างรายงานประจำวัน'; form.reset(); form.date.value = report?.date || new Date().toISOString().slice(0,10); if (report) Object.keys(report).forEach(key => { if (form[key]) form[key].value = report[key]; }); const preview = $('#imagePreview'); const img = $('#imagePreviewImg'); const input = $('#imageInput'); input.value = ''; if (report?.image) { img.src = report.image; preview.hidden = false; state.pendingImage = report.image; } else { preview.hidden = true; state.pendingImage = null; } dialog.showModal(); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); }
form.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.progress = Number(data.progress); data.manpower = Number(data.manpower); if (state.pendingImage) data.image = state.pendingImage; const endpoint = state.editingId ? `/api/reports/${state.editingId}` : '/api/reports'; const response = await fetch(endpoint, { method: state.editingId ? 'PATCH' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }); if (!response.ok) { const error = await response.json(); return toast(error.error || 'บันทึกไม่สำเร็จ'); } dialog.close(); await loadReports(); toast(state.editingId ? 'อัปเดตรายงานแล้ว' : 'บันทึกรายงานแล้ว'); });
$('#imageInput').addEventListener('change', event => { const file = event.target.files && event.target.files[0]; if (!file) return; if (file.size > 1500000) return toast('รูปใหญ่เกินไป จำกัด 1.5 MB ต่อไฟล์'); const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => { const canv = document.createElement('canvas'); const max = 1280; let { width, height } = img; const scale = Math.min(1, max / Math.max(width, height)); width = Math.round(width * scale); height = Math.round(height * scale); canv.width = width; canv.height = height; canv.getContext('2d').drawImage(img, 0, 0, width, height); state.pendingImage = canv.toDataURL('image/jpeg', 0.8); $('#imagePreviewImg').src = state.pendingImage; $('#imagePreview').hidden = false; }; img.src = reader.result; }; reader.readAsDataURL(file); });
$('#removeImageBtn').addEventListener('click', () => { state.pendingImage = null; $('#imageInput').value = ''; $('#imagePreview').hidden = true; });
$('#newReportBtn').addEventListener('click', () => openForm());
$('#exportBtn').addEventListener('click', () => window.print());
$('#logoutBtn').addEventListener('click', async () => { if (!window.confirm('ต้องการออกจากระบบหรือไม่?')) return; await fetch('/api/auth/logout', { method: 'POST' }); showLogin(); loginForm.reset(); });
$('#reportList').addEventListener('click', async event => { const thumb = event.target.closest('[data-image]'); if (thumb) { const report = state.reports.find(item => item.id === thumb.dataset.image); if (report?.image) { const win = window.open('', '_blank'); if (win) { win.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${report.image}" style="max-width:95vw;max-height:95vh;border-radius:8px"/></body>`); win.document.close(); } } return; } const button = event.target.closest('[data-delete-id]'); if (!button) return; const report = state.reports.find(item => item.id === button.dataset.deleteId); if (!report || !window.confirm(`ต้องการลบรายงานโครงการ ${report.project} หรือไม่?`)) return; const response = await fetch(`/api/reports/${report.id}`, { method: 'DELETE' }); if (!response.ok) return toast('ลบรายงานไม่สำเร็จ'); await loadReports(); toast('ลบรายงานแล้ว'); });
loginForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(loginForm)); const response = await fetch(registerMode ? '/api/auth/register' : '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }); if (!response.ok) { const error = await response.json(); $('#loginError').textContent = error.error; return; } if (registerMode) { registerMode = false; updateLoginMode(); loginForm.reset(); $('#loginError').textContent = 'สมัครสำเร็จ กรุณาเข้าสู่ระบบ'; return; } const result = await response.json(); $('#loginError').textContent = ''; showApp(result.user); await loadReports(); });
$('#registerModeBtn').addEventListener('click', () => { registerMode = !registerMode; updateLoginMode(); });
function updateLoginMode() { $('#loginTitle').textContent = registerMode ? 'สมัครผู้ใช้งาน' : 'เข้าสู่ระบบ'; $('#loginDescription').textContent = registerMode ? 'บัญชีใหม่จะได้รับสิทธิ์วิศวกร ไม่สามารถลบรายงานได้' : 'ใช้บัญชีเฉพาะบุคคลเพื่อบันทึกและติดตามรายงาน'; $('#loginSubmit').firstChild.textContent = registerMode ? 'สมัครบัญชี ' : 'เข้าสู่ระบบ '; document.querySelector('.register-only').classList.toggle('hidden-field', !registerMode); document.querySelector('.register-only input').required = registerMode; $('#registerModeBtn').textContent = registerMode ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครผู้ใช้งาน'; }
$('#closeDialog').addEventListener('click', () => dialog.close()); $('#cancelBtn').addEventListener('click', () => dialog.close()); $('#searchInput').addEventListener('input', render); $('#statusFilter').addEventListener('change', render); $('#todayLabel').textContent = dateText(new Date().toISOString().slice(0,10)).full;
fetch('/api/auth/me').then(response => response.json()).then(result => { if (result.user) { showApp(result.user); loadReports(); } else showLogin(); });
