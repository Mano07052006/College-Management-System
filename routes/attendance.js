const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, profile, notify } = require('../utils');
router.use(auth);

const getThreshold = async (c = db) => {
  const [r] = await c.query("SELECT value FROM system_settings WHERE name='attendance_threshold'");
  return r.length ? Number(r[0].value) : 75;
};

// Date filters: ?month=2026-10  OR  ?from=2026-08-01&to=2026-12-15 (use this for a semester / any custom range)
function dateRange(q) {
  let { from, to, month } = q;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    from = `${month}-01`;
    to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  return [from || null, to || null];
}

// Attendance % = present / total marked sessions x 100
async function summary(studentId, from, to) {
  const [subjects] = await db.query(
    `SELECT sub.subject_id, sub.name AS subject,
            CAST(SUM(a.status='P') AS UNSIGNED) AS present, COUNT(*) AS total,
            ROUND(100*SUM(a.status='P')/COUNT(*),2) AS percentage
     FROM attendance a JOIN subjects sub ON sub.subject_id=a.subject_id
     WHERE a.student_id=? AND (? IS NULL OR a.attendance_date>=?) AND (? IS NULL OR a.attendance_date<=?)
     GROUP BY sub.subject_id, sub.name ORDER BY sub.name`, [studentId, from, from, to, to]);
  const present = subjects.reduce((s, r) => s + Number(r.present), 0);
  const total = subjects.reduce((s, r) => s + r.total, 0);
  const threshold = await getThreshold();
  return {
    threshold,
    overall: { present, total, percentage: total ? +(100 * present / total).toFixed(2) : null },
    subjects: subjects.map(r => ({ ...r, shortage: Number(r.percentage) < threshold }))
  };
}

// Can this user see this student's data?
async function canView(user, studentId) {
  if (user.role === 'admin') return true;
  const p = await profile(user);
  if (user.role === 'student') return p.student_id === Number(studentId);
  if (user.role === 'hod') {
    const [r] = await db.query('SELECT 1 FROM students WHERE student_id=? AND department_id=?', [studentId, p.department_id]);
    return r.length > 0;
  }
  const [r] = await db.query(
    'SELECT 1 FROM teacher_subjects ts JOIN students s ON s.class_id=ts.class_id WHERE ts.teacher_id=? AND s.student_id=? LIMIT 1',
    [p.teacher_id, studentId]);
  return r.length > 0;
}

// After saving attendance: notify students who fell below the threshold in this subject
async function checkShortage(conn, studentIds, subjectId) {
  if (!studentIds.length) return;
  const threshold = await getThreshold(conn);
  const [[sub]] = await conn.query('SELECT name FROM subjects WHERE subject_id=?', [subjectId]);
  const [low] = await conn.query(
    `SELECT s.user_id, ROUND(100*SUM(a.status='P')/COUNT(*),2) AS pct
     FROM attendance a JOIN students s ON s.student_id=a.student_id
     WHERE a.student_id IN (?) AND a.subject_id=? GROUP BY s.user_id HAVING pct < ?`, [studentIds, subjectId, threshold]);
  const title = `Attendance shortage: ${sub.name}`;
  for (const r of low) {
    const [dup] = await conn.query( // at most one alert per student/subject per day
      `SELECT 1 FROM notification_recipients nr JOIN notifications n ON n.id=nr.notification_id
       WHERE nr.user_id=? AND n.type='attendance' AND n.title=? AND DATE(n.created_at)=CURDATE() LIMIT 1`, [r.user_id, title]);
    if (!dup.length)
      await notify(conn, title, `Your attendance in ${sub.name} is ${r.pct}%, below the required ${threshold}%.`, 'attendance', [r.user_id]);
  }
}

// Teacher: my subjects and classes
router.get('/my-assignments', role('teacher'), wrap(async (req, res) => {
  const t = await profile(req.user);
  const [rows] = await db.query(
    `SELECT ts.subject_id, sub.name AS subject, ts.class_id, c.year_of_study, c.section
     FROM teacher_subjects ts JOIN subjects sub ON sub.subject_id=ts.subject_id JOIN classes c ON c.class_id=ts.class_id
     WHERE ts.teacher_id=?`, [t.teacher_id]);
  res.json(rows);
}));

// Teacher/Admin: student list of a class
router.get('/students', role('teacher', 'admin'), wrap(async (req, res) => {
  const { class_id } = req.query;
  if (req.user.role === 'teacher') {
    const t = await profile(req.user);
    const [ok] = await db.query('SELECT 1 FROM teacher_subjects WHERE teacher_id=? AND class_id=? LIMIT 1', [t.teacher_id, class_id]);
    if (!ok.length) return res.status(403).json({ error: 'Not your class' });
  }
  const [rows] = await db.query('SELECT student_id, register_number, name, email, phone FROM students WHERE class_id=? ORDER BY register_number', [class_id]);
  res.json(rows);
}));

// Teacher/Admin: mark (or correct) attendance for one subject + class + date
// body: { subject_id, class_id, date: "2026-10-07", records: [{ student_id, status: "P"|"A" }] }
router.post('/mark', role('teacher', 'admin'), wrap(async (req, res) => {
  const { subject_id, class_id, date, records } = req.body;
  if (!subject_id || !class_id || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Array.isArray(records) || !records.length)
    return res.status(400).json({ error: 'subject_id, class_id, date (YYYY-MM-DD) and records are required' });

  let teacherId = null;
  if (req.user.role === 'teacher') {
    const t = await profile(req.user);
    teacherId = t.teacher_id;
    const [ok] = await db.query('SELECT 1 FROM teacher_subjects WHERE teacher_id=? AND subject_id=? AND class_id=?', [teacherId, subject_id, class_id]);
    if (!ok.length) return res.status(403).json({ error: 'You are not assigned to this subject/class' });
  }
  const [stu] = await db.query('SELECT student_id FROM students WHERE class_id=?', [class_id]);
  const valid = new Set(stu.map(s => s.student_id));
  const rows = records.filter(r => valid.has(Number(r.student_id)) && ['P', 'A'].includes(r.status))
    .map(r => [Number(r.student_id), subject_id, teacherId, class_id, date, r.status]);
  if (!rows.length) return res.status(400).json({ error: 'No valid records for this class' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO attendance(student_id,subject_id,teacher_id,class_id,attendance_date,status) VALUES ?
       ON DUPLICATE KEY UPDATE status=VALUES(status), teacher_id=VALUES(teacher_id), marked_at=CURRENT_TIMESTAMP`, [rows]);
    await checkShortage(conn, rows.map(r => r[0]), subject_id);
    await conn.commit();
    res.json({ message: 'Attendance saved', count: rows.length });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Student sees own; teacher/HOD/admin pass ?student_id=
router.get('/summary', wrap(async (req, res) => {
  let sid = req.query.student_id;
  if (req.user.role === 'student') sid = (await profile(req.user)).student_id;
  if (!sid) return res.status(400).json({ error: 'student_id required' });
  if (!(await canView(req.user, sid))) return res.status(403).json({ error: 'Access denied' });
  res.json(await summary(sid, ...dateRange(req.query)));
}));

// HOD (own department) / Admin: students below the threshold in the selected period
router.get('/shortage', role('hod', 'admin'), wrap(async (req, res) => {
  let dept = req.query.department_id || null;
  if (req.user.role === 'hod') dept = (await profile(req.user)).department_id;
  const [from, to] = dateRange(req.query);
  const threshold = await getThreshold();
  const [rows] = await db.query(
    `SELECT s.student_id, s.register_number, s.name, s.class_id,
            ROUND(100*SUM(a.status='P')/COUNT(*),2) AS percentage
     FROM students s JOIN attendance a ON a.student_id=s.student_id
     WHERE (? IS NULL OR s.department_id=?) AND (? IS NULL OR a.attendance_date>=?) AND (? IS NULL OR a.attendance_date<=?)
     GROUP BY s.student_id, s.register_number, s.name, s.class_id
     HAVING percentage < ? ORDER BY percentage`, [dept, dept, from, from, to, to, threshold]);
  res.json({ threshold, students: rows });
}));

module.exports = router;
