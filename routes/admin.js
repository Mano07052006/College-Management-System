const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap } = require('../utils');

router.use(auth, role('admin'));

// Columns allowed for each profile table (whitelist, so interpolation below is safe)
const PROFILES = {
  student: { table: 'students', cols: ['register_number', 'name', 'dob', 'email', 'phone', 'department_id', 'class_id', 'semester_id', 'admission_year'], idCol: 'register_number' },
  teacher: { table: 'teachers', cols: ['employee_id', 'name', 'email', 'phone', 'department_id', 'designation', 'is_class_coordinator'], idCol: 'employee_id' },
  hod:     { table: 'hods',     cols: ['employee_id', 'name', 'department_id'], idCol: 'employee_id' }
};

// Register a student / teacher / HOD. Username defaults to register number / employee ID.
// If no password is given, a random one is generated and returned ONCE for the admin to hand over.
// Students are picked by department + year (+ section, default A); the class row is found or created automatically.
const MAX_YEAR = 4;
router.post('/users/:role', wrap(async (req, res) => {
  const p = PROFILES[req.params.role];
  if (!p) return res.status(400).json({ error: 'Role must be student, teacher or hod' });
  const b = { ...req.body };
  const username = String(b.username || b[p.idCol] || '').trim();
  if (!username || !b.name || !b.department_id || !b[p.idCol])
    return res.status(400).json({ error: `name, department_id and ${p.idCol} are required` });

  const [dep] = await db.query('SELECT 1 FROM departments WHERE department_id=?', [b.department_id]);
  if (!dep.length) return res.status(400).json({ error: 'Invalid department' });

  let year, section;
  if (req.params.role === 'student') {
    year = Number(b.year_of_study);
    section = String(b.section || 'A').trim().toUpperCase().slice(0, 5) || 'A';
    if (!Number.isInteger(year) || year < 1 || year > MAX_YEAR)
      return res.status(400).json({ error: `Year must be between 1 and ${MAX_YEAR}` });
    if (!b.semester_id) return res.status(400).json({ error: 'Semester is required for students' });
    const [sem] = await db.query('SELECT number FROM semesters WHERE semester_id=?', [b.semester_id]);
    if (!sem.length) return res.status(400).json({ error: 'Invalid semester' });
    if (![2 * year - 1, 2 * year].includes(sem[0].number))
      return res.status(400).json({ error: `Year ${year} students belong to semester ${2 * year - 1} or ${2 * year}` });
  }

  const password = b.password || crypto.randomBytes(5).toString('hex');
  const hash = await bcrypt.hash(password, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    if (req.params.role === 'student') {
      await conn.query('INSERT IGNORE INTO classes(department_id,year_of_study,section) VALUES(?,?,?)', [b.department_id, year, section]);
      const [[cls]] = await conn.query('SELECT class_id FROM classes WHERE department_id=? AND year_of_study=? AND section=?', [b.department_id, year, section]);
      b.class_id = cls.class_id;
    }
    const [u] = await conn.query('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [username, hash, req.params.role]);
    const vals = p.cols.map(c => b[c] ?? (c === 'is_class_coordinator' ? 0 : null));
    await conn.query(`INSERT INTO ${p.table}(user_id,${p.cols.join(',')}) VALUES(?${',?'.repeat(p.cols.length)})`, [u.insertId, ...vals]);
    await conn.commit();
    res.status(201).json({ message: 'Account created', username, password });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username, register number or employee ID already exists' });
    if (e.code && e.code.startsWith('ER_NO_REFERENCED')) return res.status(400).json({ error: 'Invalid department, class or semester id' });
    throw e;
  } finally { conn.release(); }
}));

// Promote a student / change class, department or semester
router.put('/students/:id', wrap(async (req, res) => {
  const { department_id, class_id, semester_id } = req.body;
  await db.query(
    'UPDATE students SET department_id=COALESCE(?,department_id), class_id=COALESCE(?,class_id), semester_id=COALESCE(?,semester_id) WHERE student_id=?',
    [department_id || null, class_id || null, semester_id || null, req.params.id]);
  res.json({ message: 'Student updated' });
}));

// Reset a user's password (admin hands over the new one)
router.put('/users/:username/password', wrap(async (req, res) => {
  const password = req.body.password || crypto.randomBytes(5).toString('hex');
  const [r] = await db.query('UPDATE users SET password_hash=? WHERE username=?', [await bcrypt.hash(password, 10), req.params.username]);
  if (!r.affectedRows) return res.status(404).json({ error: 'User not found' });
  res.json({ username: req.params.username, password });
}));

router.put('/users/:username/status', wrap(async (req, res) => {
  const status = req.body.status === 'inactive' ? 'inactive' : 'active';
  await db.query('UPDATE users SET status=? WHERE username=? AND role<>"admin"', [status, req.params.username]);
  res.json({ message: 'Status set to ' + status });
}));

router.get('/teachers', wrap(async (req, res) =>
  res.json((await db.query('SELECT teacher_id, employee_id, name, department_id FROM teachers ORDER BY name'))[0])));

// Academic structure
router.post('/departments', wrap(async (req, res) => {
  const [r] = await db.query('INSERT INTO departments(name) VALUES(?)', [req.body.name]);
  res.status(201).json({ department_id: r.insertId });
}));
router.post('/classes', wrap(async (req, res) => {
  const { department_id, year_of_study, section } = req.body;
  const [r] = await db.query('INSERT INTO classes(department_id,year_of_study,section) VALUES(?,?,?)', [department_id, year_of_study, section || 'A']);
  res.status(201).json({ class_id: r.insertId });
}));
router.post('/subjects', wrap(async (req, res) => {
  const { code, name, department_id, semester_id } = req.body;
  const [r] = await db.query('INSERT INTO subjects(code,name,department_id,semester_id) VALUES(?,?,?,?)', [code, name, department_id, semester_id]);
  res.status(201).json({ subject_id: r.insertId });
}));
router.post('/assign-teacher', wrap(async (req, res) => {
  const { teacher_id, subject_id, class_id } = req.body;
  await db.query('INSERT IGNORE INTO teacher_subjects(teacher_id,subject_id,class_id) VALUES(?,?,?)', [teacher_id, subject_id, class_id]);
  res.status(201).json({ message: 'Teacher assigned' });
}));
router.put('/settings/attendance-threshold', wrap(async (req, res) => {
  const v = Number(req.body.value);
  if (!(v > 0 && v <= 100)) return res.status(400).json({ error: 'Value must be between 1 and 100' });
  await db.query("UPDATE system_settings SET value=? WHERE name='attendance_threshold'", [v]);
  res.json({ message: 'Threshold updated', value: v });
}));

module.exports = router;
