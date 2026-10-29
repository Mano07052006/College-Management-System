// Circulars and exam timetables. Both can carry an uploaded document (pdf, doc, docx, xls, xlsx, jpg, png).
const router = require('express').Router();
const path = require('path');
const db = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, profile, audience, notify } = require('../utils');
const { uploadDoc, removeFile, UPLOAD_DIR } = require('../middleware/upload');
router.use(auth);

const departmentExists = async id => !id || (await db.query('SELECT 1 FROM departments WHERE department_id=?', [id]))[0].length > 0;

// ---------------- Circulars ----------------
// Admin publishes a circular as text, a document, or both. Omit department_id to send to the whole college.
// multipart form: title, description (optional), department_id (optional), file (optional)
router.post('/circulars', role('admin'), uploadDoc, wrap(async (req, res) => {
  const { title, description } = req.body;
  const f = req.file;
  const dept = req.body.department_id || null;
  if (!title || (!description && !f)) {
    if (f) removeFile(f.filename);
    return res.status(400).json({ error: 'Title and either details or a document are required' });
  }
  if (!(await departmentExists(dept))) {
    if (f) removeFile(f.filename);
    return res.status(400).json({ error: 'Invalid department' });
  }
  const conn = await db.getConnection();
  try {
    await conn.query('INSERT INTO circulars(title,description,department_id,created_by,file_name,stored_name) VALUES(?,?,?,?,?,?)',
      [title, description || null, dept, req.user.id, f ? f.originalname : null, f ? f.filename : null]);
    await notify(conn, 'New circular: ' + title, description || (f ? 'Document attached: ' + f.originalname : ''), 'circular', await audience(conn, dept));
  } catch (e) { if (f) removeFile(f.filename); throw e; }
  finally { conn.release(); }
  res.status(201).json({ message: 'Circular published and users notified' });
}));

router.get('/circulars', wrap(async (req, res) => {
  const p = await profile(req.user);
  const d = p ? p.department_id : null; // admin sees all
  res.json((await db.query(
    `SELECT c.id, c.title, c.description, c.department_id, dep.name AS department, c.created_at, c.file_name
     FROM circulars c LEFT JOIN departments dep ON dep.department_id=c.department_id
     WHERE (? IS NULL OR c.department_id IS NULL OR c.department_id=?) ORDER BY c.created_at DESC`, [d, d]))[0]);
}));

router.get('/circulars/:id/download', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM circulars WHERE id=?', [req.params.id]);
  const c = rows[0];
  if (!c || !c.stored_name) return res.status(404).json({ error: 'Document not found' });
  const p = await profile(req.user);
  if (p && c.department_id && p.department_id !== c.department_id) return res.status(403).json({ error: 'Access denied' });
  res.download(path.join(UPLOAD_DIR, c.stored_name), c.file_name);
}));

router.delete('/circulars/:id', role('admin'), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT stored_name FROM circulars WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  await db.query('DELETE FROM circulars WHERE id=?', [req.params.id]);
  removeFile(rows[0].stored_name);
  res.json({ message: 'Circular deleted' });
}));

// ---------------- Exam timetable documents ----------------
// multipart form: title, exam_type (internal|university), department_id (optional = all), semester_id (optional = all), file (required)
router.post('/exams/files', role('admin'), uploadDoc, wrap(async (req, res) => {
  const f = req.file;
  const { title, exam_type } = req.body;
  const dept = req.body.department_id || null;
  const sem = req.body.semester_id || null;
  const fail = (code, error) => { if (f) removeFile(f.filename); return res.status(code).json({ error }); };
  if (!f) return fail(400, 'A timetable document is required (pdf, doc, docx, xls, xlsx, jpg, png; max 20 MB)');
  if (!title || !['internal', 'university'].includes(exam_type)) return fail(400, 'Title and a valid exam type are required');
  if (!(await departmentExists(dept))) return fail(400, 'Invalid department');
  if (sem && !(Number(sem) >= 1 && Number(sem) <= 8)) return fail(400, 'Semester must be 1 to 8');

  const conn = await db.getConnection();
  try {
    await conn.query('INSERT INTO exam_timetable_files(title,exam_type,department_id,semester_id,file_name,stored_name,uploaded_by) VALUES(?,?,?,?,?,?,?)',
      [title, exam_type, dept, sem, f.originalname, f.filename, req.user.id]);
    await notify(conn, `${exam_type === 'internal' ? 'Internal' : 'University'} exam timetable: ${title}`,
      'A new exam timetable document has been uploaded. Open Exam Timetable to download it.', 'exam', await audience(conn, dept));
  } catch (e) { removeFile(f.filename); throw e; }
  finally { conn.release(); }
  res.status(201).json({ message: 'Timetable uploaded and users notified' });
}));

router.get('/exams/files', wrap(async (req, res) => {
  const p = await profile(req.user);
  const d = p ? p.department_id : null;
  const t = req.query.exam_type || null;
  res.json((await db.query(
    `SELECT x.id, x.title, x.exam_type, x.department_id, dep.name AS department, x.semester_id, x.file_name, x.created_at
     FROM exam_timetable_files x LEFT JOIN departments dep ON dep.department_id=x.department_id
     WHERE (? IS NULL OR x.department_id IS NULL OR x.department_id=?) AND (? IS NULL OR x.exam_type=?)
     ORDER BY x.created_at DESC`, [d, d, t, t]))[0]);
}));

router.get('/exams/files/:id/download', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM exam_timetable_files WHERE id=?', [req.params.id]);
  const x = rows[0];
  if (!x) return res.status(404).json({ error: 'Document not found' });
  const p = await profile(req.user);
  if (p && x.department_id && p.department_id !== x.department_id) return res.status(403).json({ error: 'Access denied' });
  res.download(path.join(UPLOAD_DIR, x.stored_name), x.file_name);
}));

router.delete('/exams/files/:id', role('admin'), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT stored_name FROM exam_timetable_files WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  await db.query('DELETE FROM exam_timetable_files WHERE id=?', [req.params.id]);
  removeFile(rows[0].stored_name);
  res.json({ message: 'Timetable document deleted' });
}));

// ---------------- Exam timetable entries (single subject, optional) ----------------
// body: { exam_type: "internal"|"university", department_id, semester_id, subject_id, exam_date, start_time, end_time, venue }
router.post('/exams', role('admin'), wrap(async (req, res) => {
  const b = req.body;
  if (!['internal', 'university'].includes(b.exam_type) || !b.department_id || !b.semester_id || !b.subject_id || !b.exam_date || !b.start_time || !b.end_time)
    return res.status(400).json({ error: 'exam_type, department_id, semester_id, subject_id, exam_date, start_time, end_time required' });
  await db.query(
    'INSERT INTO exam_timetables(exam_type,department_id,semester_id,subject_id,exam_date,start_time,end_time,venue) VALUES(?,?,?,?,?,?,?,?)',
    [b.exam_type, b.department_id, b.semester_id, b.subject_id, b.exam_date, b.start_time, b.end_time, b.venue || null]);
  const [[sub]] = await db.query('SELECT name FROM subjects WHERE subject_id=?', [b.subject_id]);
  const conn = await db.getConnection();
  try {
    await notify(conn, `${b.exam_type === 'internal' ? 'Internal' : 'University'} exam timetable updated`,
      `${sub.name} on ${b.exam_date}, ${b.start_time}-${b.end_time}`, 'exam', await audience(conn, b.department_id));
  } finally { conn.release(); }
  res.status(201).json({ message: 'Timetable entry added and users notified' });
}));

router.get('/exams', wrap(async (req, res) => {
  const p = await profile(req.user);
  const d = p ? p.department_id : null;
  const t = req.query.exam_type || null;
  res.json((await db.query(
    `SELECT e.*, sub.name AS subject FROM exam_timetables e JOIN subjects sub ON sub.subject_id=e.subject_id
     WHERE (? IS NULL OR e.department_id=?) AND (? IS NULL OR e.exam_type=?) ORDER BY e.exam_date, e.start_time`, [d, d, t, t]))[0]);
}));

module.exports = router;
