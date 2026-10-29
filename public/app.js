const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('token');
let me = JSON.parse(localStorage.getItem('me') || 'null');

async function api(path, opt = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opt.body && !(opt.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(opt.body); }
  const r = await fetch('/api' + path, { ...opt, headers });
  if (opt.raw) return r;
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
function msg(t, ok = true) { const m = $('#msg'); m.textContent = t || ''; m.className = ok ? 'ok' : 'err'; }

// Download a protected file (the token must be sent, so a plain link will not work)
async function downloadFile(url, name) {
  const r = await api(url, { raw: true });
  if (!r.ok) return msg('Download failed', false);
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function bindForm(id, fn) {
  $('#' + id).addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {}; fd.forEach((v, k) => { if (v !== '' && !(v instanceof File)) data[k] = v; });
    try { const r = await fn(data, fd, e.target); if (r && r.message) msg(r.message); } catch (err) { msg(err.message, false); }
  });
}
const opts = (list, val, lab) => list.map(x => `<option value="${esc(x[val])}">${esc(typeof lab === 'function' ? lab(x) : x[lab])}</option>`).join('');
const today = () => new Date().toISOString().slice(0, 10);

// ---------- login / logout ----------
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const d = await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    token = d.token; me = d;
    localStorage.setItem('token', token); localStorage.setItem('me', JSON.stringify(me));
    $('#loginErr').textContent = ''; show();
  } catch (err) { $('#loginErr').textContent = err.message; }
});
function logout() { token = null; me = null; localStorage.clear(); show(); }
$('#logout').addEventListener('click', logout);

// ---------- navigation ----------
const TABS = {
  student: ['attendance', 'resources', 'circulars', 'exams', 'notifications'],
  teacher: ['mark', 'resources', 'circulars', 'exams', 'notifications'],
  hod: ['shortage', 'resources', 'circulars', 'exams', 'notifications'],
  admin: ['register', 'setup', 'resources', 'circulars', 'exams', 'shortage', 'notifications']
};
const LABEL = { attendance: 'My Attendance', mark: 'Mark Attendance', shortage: 'Shortage List', resources: 'Notes & Papers', circulars: 'Circulars',
  exams: 'Exam Timetable', notifications: 'Notifications', register: 'Register Users', setup: 'College Setup' };

function show() {
  $('#login').hidden = !!me; $('#app').hidden = !me;
  if (!me) return;
  $('#who').textContent = `${me.name} (${me.role})`;
  $('#nav').innerHTML = TABS[me.role].map(t => `<button class="sec" data-tab="${t}">${LABEL[t]}</button>`).join('');
  openTab(TABS[me.role][0]); refreshBell();
}
$('#nav').addEventListener('click', e => { if (e.target.dataset.tab) openTab(e.target.dataset.tab); });
$('#bell').addEventListener('click', () => openTab('notifications'));
async function refreshBell() { try { const d = await api('/notifications'); $('#bell').textContent = '🔔 ' + d.unread; } catch {} }
async function openTab(t) {
  msg(''); $('#view').onclick = null; $('#view').innerHTML = 'Loading...';
  try { await views[t](); } catch (e) { $('#view').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------- views ----------
const views = {};

views.attendance = async () => {
  $('#view').innerHTML = `<div class="card"><h2>My attendance</h2>
    <form id="f" class="row"><label>Month<input type="month" name="month"></label><label>From<input type="date" name="from"></label>
    <label>To<input type="date" name="to"></label><button>Show</button></form><div id="out"></div></div>`;
  const load = async q => {
    const d = await api('/attendance/summary?' + new URLSearchParams(q));
    const o = d.overall;
    $('#out').innerHTML = `<p>Overall: <b class="${o.percentage !== null && o.percentage < d.threshold ? 'bad' : 'ok'}">${o.percentage ?? '-'}%</b>
      (${o.present}/${o.total}) &middot; Minimum required: ${d.threshold}%</p>
      <table><tr><th>Subject</th><th>Present</th><th>Total</th><th>%</th><th>Status</th></tr>${d.subjects.map(s =>
      `<tr><td>${esc(s.subject)}</td><td>${s.present}</td><td>${s.total}</td><td>${s.percentage}</td>
       <td class="${s.shortage ? 'bad' : 'ok'}">${s.shortage ? 'Shortage' : 'OK'}</td></tr>`).join('')}</table>`;
  };
  bindForm('f', async q => { await load(q); });
  await load({});
};

views.mark = async () => {
  const as = await api('/attendance/my-assignments');
  if (!as.length) { $('#view').innerHTML = '<div class="card">No subjects are assigned to you yet. Ask your HOD/admin.</div>'; return; }
  $('#view').innerHTML = `<div class="card"><h2>Mark attendance</h2>
    <form id="f" class="row"><label>Subject / Class<select name="i">${as.map((a, i) => `<option value="${i}">${esc(a.subject)} - Year ${a.year_of_study} ${esc(a.section)}</option>`).join('')}</select></label>
    <label>Date<input type="date" name="date" value="${today()}" required></label><button>Load students</button></form>
    <div id="list"></div></div>`;
  bindForm('f', async d => {
    const a = as[d.i];
    const students = await api('/attendance/students?class_id=' + a.class_id);
    $('#list').innerHTML = `<table><tr><th>Reg. No</th><th>Name</th><th>Present</th></tr>${students.map(s =>
      `<tr><td>${esc(s.register_number)}</td><td>${esc(s.name)}</td><td><input type="checkbox" class="pres" data-id="${s.student_id}" checked></td></tr>`).join('')}</table>
      <p><button id="save">Save attendance</button></p>`;
    $('#save').addEventListener('click', async () => {
      const records = [...document.querySelectorAll('.pres')].map(c => ({ student_id: +c.dataset.id, status: c.checked ? 'P' : 'A' }));
      try { const r = await api('/attendance/mark', { method: 'POST', body: { subject_id: a.subject_id, class_id: a.class_id, date: d.date, records } }); msg(r.message + ' (' + r.count + ' students)'); }
      catch (e) { msg(e.message, false); }
    });
  });
};

views.shortage = async () => {
  $('#view').innerHTML = `<div class="card"><h2>Students below the attendance threshold</h2>
    <form id="f" class="row"><label>Month<input type="month" name="month"></label><label>From<input type="date" name="from"></label>
    <label>To<input type="date" name="to"></label><button>Show</button></form><div id="out"></div></div>`;
  const load = async q => {
    const d = await api('/attendance/shortage?' + new URLSearchParams(q));
    $('#out').innerHTML = `<p>Below ${d.threshold}%: <b>${d.students.length}</b> student(s)</p><table><tr><th>Reg. No</th><th>Name</th><th>%</th></tr>${d.students.map(s =>
      `<tr><td>${esc(s.register_number)}</td><td>${esc(s.name)}</td><td class="bad">${s.percentage}</td></tr>`).join('')}</table>`;
  };
  bindForm('f', async q => { await load(q); });
  await load({});
};

views.resources = async () => {
  const canUp = me.role === 'admin' || (me.role === 'teacher' && me.is_class_coordinator);
  const subjects = canUp ? await api('/subjects') : [];
  $('#view').innerHTML = `<div class="card"><h2>Notes, lab manuals &amp; question papers</h2>
    <form id="f" class="row"><label>Type<select name="type"><option value="">All</option><option value="notes">Notes</option><option value="lab_manual">Lab manual</option>
    <option value="question_paper">Question paper</option><option value="important">Important</option></select></label><button>Filter</button></form><div id="out"></div></div>
    ${canUp ? `<div class="card"><h3>Upload</h3><form id="up"><label>Title<input name="title" required></label><label>Description<input name="description"></label>
    <label>Type<select name="type"><option value="notes">Notes</option><option value="lab_manual">Lab manual</option><option value="question_paper">Question paper</option><option value="important">Important</option></select></label>
    <label>Subject<select name="subject_id">${opts(subjects, 'subject_id', s => s.code + ' - ' + s.name)}</select></label>
    <label>File (pdf, doc, docx, ppt, pptx, txt, zip - max 20 MB)<input type="file" name="file" required></label><button>Upload</button></form></div>` : ''}`;
  const load = async q => {
    const rows = await api('/resources?' + new URLSearchParams(q));
    $('#out').innerHTML = `<table><tr><th>Title</th><th>Subject</th><th>Type</th><th>Sem</th><th></th></tr>${rows.map(r =>
      `<tr><td>${esc(r.title)}<br><small>${esc(r.description || '')}</small></td><td>${esc(r.subject)}</td><td>${esc(r.type)}</td><td>${r.semester_id}</td>
       <td><button data-dl="${r.resource_id}" data-name="${esc(r.file_name)}">Download</button>
       ${me.role === 'admin' ? ` <button class="danger" data-del="${r.resource_id}">Delete</button>` : ''}</td></tr>`).join('')}</table>`;
  };
  $('#out').addEventListener('click', async e => {
    const b = e.target;
    if (b.dataset.dl) {
      const r = await api('/resources/' + b.dataset.dl + '/download', { raw: true });
      if (!r.ok) return msg('Download failed', false);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = b.dataset.name; a.click();
    }
    if (b.dataset.del && confirm('Delete this file?')) { await api('/resources/' + b.dataset.del, { method: 'DELETE' }); msg('Deleted'); load({}); }
  });
  bindForm('f', async q => { await load(q); });
  if (canUp) bindForm('up', async (d, fd, form) => { const r = await api('/resources', { method: 'POST', body: fd }); form.reset(); load({}); return { message: 'Uploaded; users notified' }; });
  await load({});
};


views.circulars = async () => {
  const rows = await api('/circulars');
  const depts = me.role === 'admin' ? await api('/departments') : [];
  const admin = me.role === 'admin';
  $('#view').innerHTML = `${admin ? `<div class="card"><h3>Publish circular</h3><form id="f"><label>Title<input name="title" required></label>
    <label>Details (optional if you attach a document)<textarea name="description" rows="3"></textarea></label>
    <label>Send to<select name="department_id"><option value="">Whole college</option>${opts(depts, 'department_id', 'name')}</select></label>
    <label>Circular document (pdf, doc, docx, xls, xlsx, jpg, png - max 20 MB)<input type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"></label>
    <button>Publish &amp; notify</button></form></div>` : ''}
    <div class="card"><h2>Circulars</h2>${rows.map(c => `<div style="padding:8px 0;border-bottom:1px solid #eee"><b>${esc(c.title)}</b>
      <small>${new Date(c.created_at).toLocaleDateString()} &middot; ${esc(c.department || 'Whole college')}</small><br>${esc(c.description || '')}
      ${c.file_name ? `<br><button class="sec" data-dl="${c.id}" data-name="${esc(c.file_name)}">&#128196; ${esc(c.file_name)}</button>` : ''}
      ${admin ? ` <button class="danger" data-del="${c.id}">Delete</button>` : ''}</div>`).join('') || 'None yet.'}</div>`;
  $('#view').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.dl) await downloadFile('/circulars/' + b.dataset.dl + '/download', b.dataset.name);
      if (b.dataset.del && confirm('Delete this circular?')) { await api('/circulars/' + b.dataset.del, { method: 'DELETE' }); openTab('circulars'); }
    } catch (err) { msg(err.message, false); }
  };
  if (admin) bindForm('f', async (d, fd, form) => { const r = await api('/circulars', { method: 'POST', body: fd }); await openTab('circulars'); msg(r.message); });
};

views.exams = async () => {
  const admin = me.role === 'admin';
  const [files, rows] = await Promise.all([api('/exams/files'), api('/exams')]);
  let adminCards = '';
  if (admin) {
    const [depts, sems, subs] = await Promise.all([api('/departments'), api('/semesters'), api('/subjects')]);
    adminCards = `<div class="card"><h3>Upload exam timetable (document)</h3><form id="fu">
      <label>Title<input name="title" placeholder="e.g. Internal Assessment 1 - Oct 2026" required></label>
      <label>Type<select name="exam_type"><option value="internal">Internal</option><option value="university">University</option></select></label>
      <label>Department<select name="department_id"><option value="">All departments</option>${opts(depts, 'department_id', 'name')}</select></label>
      <label>Semester<select name="semester_id"><option value="">All semesters</option>${opts(sems, 'semester_id', 'number')}</select></label>
      <label>Timetable document (pdf, doc, docx, xls, xlsx, jpg, png - max 20 MB)<input type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" required></label>
      <button>Upload &amp; notify</button></form></div>
    <div class="card"><h3>Add single exam entry (optional)</h3><form id="f">
      <label>Type<select name="exam_type"><option value="internal">Internal</option><option value="university">University</option></select></label>
      <label>Department<select name="department_id">${opts(depts, 'department_id', 'name')}</select></label>
      <label>Semester<select name="semester_id">${opts(sems, 'semester_id', 'number')}</select></label>
      <label>Subject<select name="subject_id">${opts(subs, 'subject_id', s => s.code + ' - ' + s.name)}</select></label>
      <label>Date<input type="date" name="exam_date" required></label><label>Start<input type="time" name="start_time" required></label>
      <label>End<input type="time" name="end_time" required></label><label>Venue<input name="venue"></label><button>Add &amp; notify</button></form></div>`;
  }
  $('#view').innerHTML = `${adminCards}
    <div class="card"><h2>Exam timetable documents</h2><table><tr><th>Title</th><th>Type</th><th>Department</th><th>Sem</th><th>Uploaded</th><th></th></tr>${files.map(x =>
      `<tr><td>${esc(x.title)}</td><td>${esc(x.exam_type)}</td><td>${esc(x.department || 'All')}</td><td>${x.semester_id || 'All'}</td>
       <td>${new Date(x.created_at).toLocaleDateString()}</td>
       <td><button data-dl="${x.id}" data-name="${esc(x.file_name)}">Download</button>${admin ? ` <button class="danger" data-del="${x.id}">Delete</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">No timetable documents yet.</td></tr>'}</table></div>
    ${rows.length ? `<div class="card"><h2>Exam schedule entries</h2><table><tr><th>Type</th><th>Subject</th><th>Sem</th><th>Date</th><th>Time</th><th>Venue</th></tr>${rows.map(e =>
      `<tr><td>${esc(e.exam_type)}</td><td>${esc(e.subject)}</td><td>${e.semester_id}</td><td>${String(e.exam_date).slice(0, 10)}</td><td>${e.start_time.slice(0, 5)}-${e.end_time.slice(0, 5)}</td><td>${esc(e.venue || '')}</td></tr>`).join('')}</table></div>` : ''}`;
  $('#view').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.dl) await downloadFile('/exams/files/' + b.dataset.dl + '/download', b.dataset.name);
      if (b.dataset.del && confirm('Delete this timetable document?')) { await api('/exams/files/' + b.dataset.del, { method: 'DELETE' }); openTab('exams'); }
    } catch (err) { msg(err.message, false); }
  };
  if (admin) {
    bindForm('fu', async (d, fd) => { const r = await api('/exams/files', { method: 'POST', body: fd }); await openTab('exams'); msg(r.message); });
    bindForm('f', async d => { const r = await api('/exams', { method: 'POST', body: d }); await openTab('exams'); msg(r.message); });
  }
};

views.notifications = async () => {
  const d = await api('/notifications');
  $('#view').innerHTML = `<div class="card"><h2>Notifications (${d.unread} unread)</h2>${d.notifications.map(n =>
    `<div class="${n.is_read ? '' : 'unread'}" style="padding:8px;border-bottom:1px solid #eee" data-n="${n.id}"><b>${esc(n.title)}</b><br>${esc(n.message || '')}<br>
     <small>${new Date(n.created_at).toLocaleString()} ${n.is_read ? '' : '- tap to mark read'}</small></div>`).join('') || 'No notifications.'}</div>`;
  $('#view').onclick = async e => {
    const el = e.target.closest('[data-n]'); if (!el) return;
    await api('/notifications/' + el.dataset.n + '/read', { method: 'POST' }); el.classList.remove('unread'); refreshBell();
  };
};


views.register = async () => {
  const [depts, sems] = await Promise.all([api('/departments'), api('/semesters')]);
  if (!depts.length) { $('#view').innerHTML = '<div class="card">No departments yet. Run <code>npm run migrate</code> or add one in College Setup first.</div>'; return; }
  const YEARS = ['1st year', '2nd year', '3rd year', '4th year'];
  const semOpts = y => sems.filter(s => s.number === 2 * y - 1 || s.number === 2 * y)
    .map(s => `<option value="${s.semester_id}">Semester ${s.number}</option>`).join('');
  $('#view').innerHTML = `<div class="card"><h2>Register user</h2><form id="f">
    <label>Role<select name="role" id="role"><option value="student">Student</option><option value="teacher">Teacher</option><option value="hod">HOD</option></select></label>
    <label>Name<input name="name" required></label>
    <label id="idLabel">Register number<input name="id" required></label>
    <label>Username (optional, defaults to the ID above)<input name="username"></label>
    <label>Password (optional - blank generates one)<input name="password"></label>
    <label>Department<select name="department_id" required><option value="">-- Select department --</option>${opts(depts, 'department_id', 'name')}</select></label>
    <fieldset id="stu" style="border:0;padding:0;margin:0">
      <label>Year<select name="year_of_study" id="yr" required>${YEARS.map((y, i) => `<option value="${i + 1}">${y}</option>`).join('')}</select></label>
      <label>Semester<select name="semester_id" id="sem" required>${semOpts(1)}</select></label>
      <label>Section<select name="section"><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
      <label>Admission year<input name="admission_year" type="number" min="2000" max="2100"></label>
    </fieldset>
    <label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label>
    <fieldset id="tch" style="border:0;padding:0;margin:0" hidden disabled>
      <label>Designation<input name="designation"></label>
      <label>Class coordinator?<select name="is_class_coordinator"><option value="0">No</option><option value="1">Yes</option></select></label>
    </fieldset>
    <button>Create account</button></form></div>`;
  // Show only the fields that apply to the chosen role (disabled fields are not submitted)
  const toggle = () => {
    const r = $('#role').value;
    $('#stu').hidden = $('#stu').disabled = r !== 'student';
    $('#tch').hidden = $('#tch').disabled = r !== 'teacher';
    $('#idLabel').firstChild.textContent = r === 'student' ? 'Register number' : 'Employee ID';
    document.querySelector('[name="email"]').disabled = document.querySelector('[name="phone"]').disabled = r === 'hod';
  };
  $('#role').addEventListener('change', toggle);
  $('#yr').addEventListener('change', () => { $('#sem').innerHTML = semOpts(+$('#yr').value); });
  toggle();
  bindForm('f', async (d, fd, form) => {
    const body = { ...d }; delete body.role;
    body[d.role === 'student' ? 'register_number' : 'employee_id'] = d.id; delete body.id;
    const r = await api('/admin/users/' + d.role, { method: 'POST', body });
    form.reset(); toggle();
    return { message: `Created. Username: ${r.username}  Password: ${r.password}  (note it down now - it is not shown again)` };
  });
};

views.setup = async () => {
  const [depts, classes, sems, subs, teachers] = await Promise.all([api('/departments'), api('/classes'), api('/semesters'), api('/subjects'), api('/admin/teachers')]);
  const dn = Object.fromEntries(depts.map(d => [d.department_id, d.name]));
  const cl = c => `${dn[c.department_id]} - Year ${c.year_of_study} ${c.section}`;
  $('#view').innerHTML = `
  <div class="card"><h3>Add department</h3><form id="fd"><label>Name<input name="name" required></label><button>Add</button></form></div>
  <div class="card"><h3>Add class</h3><form id="fc"><label>Department<select name="department_id">${opts(depts, 'department_id', 'name')}</select></label>
    <label>Year of study<select name="year_of_study"><option value="1">1st year</option><option value="2">2nd year</option><option value="3">3rd year</option><option value="4">4th year</option></select></label><label>Section<input name="section" value="A"></label><button>Add</button></form></div>
  <div class="card"><h3>Add subject</h3><form id="fs"><label>Code<input name="code" required></label><label>Name<input name="name" required></label>
    <label>Department<select name="department_id">${opts(depts, 'department_id', 'name')}</select></label>
    <label>Semester<select name="semester_id">${opts(sems, 'semester_id', 'number')}</select></label><button>Add</button></form></div>
  <div class="card"><h3>Assign teacher to subject &amp; class</h3><form id="fa"><label>Teacher<select name="teacher_id">${opts(teachers, 'teacher_id', t => t.name + ' (' + t.employee_id + ')')}</select></label>
    <label>Subject<select name="subject_id">${opts(subs, 'subject_id', s => s.code + ' - ' + s.name)}</select></label>
    <label>Class<select name="class_id">${opts(classes, 'class_id', cl)}</select></label><button>Assign</button></form></div>
  <div class="card"><h3>Attendance threshold (%)</h3><form id="ft"><label>Value<input name="value" type="number" min="1" max="100" value="75"></label><button>Save</button></form></div>`;
  const post = (path, method = 'POST') => async d => { const r = await api(path, { method, body: d }); return { message: 'Saved' }; };
  bindForm('fd', post('/admin/departments')); bindForm('fc', post('/admin/classes')); bindForm('fs', post('/admin/subjects'));
  bindForm('fa', post('/admin/assign-teacher')); bindForm('ft', post('/admin/settings/attendance-threshold', 'PUT'));
};

show();