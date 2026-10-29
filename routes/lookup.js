// Read-only lists used by forms (any logged-in user)
const router = require('express').Router();
const db = require('../db');
const { auth } = require('../middleware/auth');
const { wrap } = require('../utils');
router.use(auth);

router.get('/departments', wrap(async (req, res) => res.json((await db.query('SELECT * FROM departments ORDER BY name'))[0])));
router.get('/semesters', wrap(async (req, res) => res.json((await db.query('SELECT * FROM semesters ORDER BY number'))[0])));
router.get('/classes', wrap(async (req, res) => {
  const d = req.query.department_id || null;
  res.json((await db.query('SELECT * FROM classes WHERE (? IS NULL OR department_id=?) ORDER BY year_of_study, section', [d, d]))[0]);
}));
router.get('/subjects', wrap(async (req, res) => {
  const { department_id = null, semester_id = null } = req.query;
  res.json((await db.query(
    'SELECT * FROM subjects WHERE (? IS NULL OR department_id=?) AND (? IS NULL OR semester_id=?) ORDER BY name',
    [department_id, department_id, semester_id, semester_id]))[0]);
}));
module.exports = router;
