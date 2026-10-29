// Shared file-upload setup for circulars and exam timetable documents
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error('Only pdf, doc, docx, xls, xlsx, jpg, jpeg or png files are allowed'))
});

// Accepts one optional file in the form field "file"; sends a clean 400 on a bad type or size
exports.uploadDoc = (req, res, next) =>
  upload.single('file')(req, res, err => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20 MB)' : err.message;
    res.status(400).json({ error: msg });
  });

// Delete a stored file (ignores errors, e.g. already removed)
exports.removeFile = storedName => { if (storedName) fs.unlink(path.join(UPLOAD_DIR, storedName), () => {}); };
exports.UPLOAD_DIR = UPLOAD_DIR;
