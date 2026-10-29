const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, profile, audience, notify } = require('../utils');
router.use(auth);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const ALLOWED = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.zip'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase()))
});

// Admin: anything. Teacher: only class coordinators.
async function canUpload(req, res, next) {
  try {
    if (req.user.role === 'admin') return next();
    if (req.user.role === 'teacher') {
      const t = await profile(req.user);
      if (t && t.is_class_coordinator) return next();
    }
    res.status(403).json({ error: 'Only admin or class coordinators can upload' });
  } catch (e) { next(e); }
}
const TYPES = ['notes', 'lab_manual', 'question_paper', 'important'];

// Upload. multipart form: file, title, description, type, subject_id
router.post('/', role('admin', 'teacher'), canUpload, upload.single('file'), wrap(async (req, res) => {
  const { title, description, type, subject_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'A valid file is required (pdf, doc, docx, ppt, pptx, txt, zip; max 20 MB)' });
  const [subRows] = await db.query('SELECT * FROM subjects WHERE subject_id=?', [subject_id]);
  const sub = subRows[0];
  if (!title || !TYPES.includes(type) || !sub) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'title, valid type and valid subject_id are required' });
  }
  if (req.user.role === 'teacher' && (await profile(req.user)).department_id !== sub.department_id) {
    fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'You can upload only for your own department' });
  }
  const [r] = await db.query(
    'INSERT INTO resources(title,description,type,subject_id,department_id,semester_id,file_name,stored_name,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)',
    [title, description || null, type, sub.subject_id, sub.department_id, sub.semester_id, req.file.originalname, req.file.filename, req.user.id]);
  const conn = await db.getConnection();
  try { await notify(conn, `New ${type.replace('_', ' ')}: ${title}`, `${sub.name} (Semester ${sub.semester_id})`, 'resource', await audience(conn, sub.department_id)); }
  finally { conn.release(); }
  res.status(201).json({ resource_id: r.insertId });
}));

// List with filters (?type=&subject_id=&semester_id=). Non-admins see only their department.
router.get('/', wrap(async (req, res) => {
  const p = await profile(req.user);
  const dept = p ? p.department_id : null;
  const { type = null, subject_id = null, semester_id = null } = req.query;
  const [rows] = await db.query(
    `SELECT r.resource_id, r.title, r.description, r.type, r.file_name, r.created_at, sub.name AS subject, r.semester_id
     FROM resources r JOIN subjects sub ON sub.subject_id=r.subject_id
     WHERE (? IS NULL OR r.department_id=?) AND (? IS NULL OR r.type=?) AND (? IS NULL OR r.subject_id=?) AND (? IS NULL OR r.semester_id=?)
     ORDER BY r.created_at DESC`, [dept, dept, type, type, subject_id, subject_id, semester_id, semester_id]);
  res.json(rows);
}));

router.get('/:id/download', wrap(async (req, res) => {
  const p = await profile(req.user);
  const [rows] = await db.query('SELECT * FROM resources WHERE resource_id=?', [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (p && p.department_id !== r.department_id) return res.status(403).json({ error: 'Access denied' });
  res.download(path.join(UPLOAD_DIR, r.stored_name), r.file_name);
}));

// Admin: update details and optionally replace the file
router.put('/:id', role('admin'), upload.single('file'), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM resources WHERE resource_id=?', [req.params.id]);
  const old = rows[0];
  if (!old) return res.status(404).json({ error: 'Not found' });
  const { title, description, type } = req.body;
  await db.query('UPDATE resources SET title=?, description=?, type=?, file_name=?, stored_name=? WHERE resource_id=?',
    [title || old.title, description ?? old.description, TYPES.includes(type) ? type : old.type,
     req.file ? req.file.originalname : old.file_name, req.file ? req.file.filename : old.stored_name, old.resource_id]);
  if (req.file) fs.unlink(path.join(UPLOAD_DIR, old.stored_name), () => {});
  res.json({ message: 'Resource updated' });
}));

router.delete('/:id', role('admin'), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT stored_name FROM resources WHERE resource_id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  await db.query('DELETE FROM resources WHERE resource_id=?', [req.params.id]);
  fs.unlink(path.join(UPLOAD_DIR, rows[0].stored_name), () => {});
  res.json({ message: 'Deleted' });
}));

module.exports = router;
